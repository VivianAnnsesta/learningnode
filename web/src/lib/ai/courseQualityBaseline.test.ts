import { describe, expect, it } from "vitest";
import {
  routeQualityDimensionKeys,
  validateCourseDesignCritique,
  validateCourseDesignDraft,
  type CourseDesignDraft,
  type RouteQualityReport,
  type SourceGroundingInfo
} from "./tasks";
import { scoreSourceRelevance, buildSourceRelevanceQuery } from "../learning/sourceRelevanceService";

import languageFixture from "./fixtures/course-quality-baseline/language-english-grammar.json";
import mathFixture from "./fixtures/course-quality-baseline/math-linear-algebra.json";
import programmingFixture from "./fixtures/course-quality-baseline/programming-typescript.json";
import scienceFixture from "./fixtures/course-quality-baseline/science-physics-mechanics.json";
import crossDisciplineFixture from "./fixtures/course-quality-baseline/cross-discipline-computational-linguistics.json";

type CritiquePass = { report: unknown; draft: unknown };
type GroundingMap = Record<string, SourceGroundingInfo>;

type Fixture = {
  domain: Record<string, unknown>;
  research: Record<string, unknown>;
  critique: CritiquePass[];
  grounding: GroundingMap;
  expected: {
    researchGatePassed: boolean;
    researchMissing: string[];
    finalGatePassed: boolean;
    finalMissing: string[];
    qualityReportSignificantIssues: boolean;
    qualityReportDimensionKeys: string[];
    groundedOkCount: number;
    groundedFailCount: number;
  };
};

const fixtures: Array<{ name: string; fixture: Fixture }> = [
  { name: "英语语法体系（语言）", fixture: languageFixture as unknown as Fixture },
  { name: "线性代数（数学）", fixture: mathFixture as unknown as Fixture },
  { name: "TypeScript 工程化（编程）", fixture: programmingFixture as unknown as Fixture },
  { name: "经典力学（理科）", fixture: scienceFixture as unknown as Fixture },
  { name: "计算语言学入门（交叉）", fixture: crossDisciplineFixture as unknown as Fixture }
];

// Mirror tutorService.groundDraftSources merge (including advisory relevance)
// without network access.
function applyGrounding(
  draft: CourseDesignDraft,
  grounding: GroundingMap,
  domain: Record<string, unknown>
): CourseDesignDraft {
  const relevanceQuery = buildSourceRelevanceQuery({
    name: (domain.name as string | undefined) ?? null,
    scope: (domain.scope as string | undefined) ?? null,
    goal: (domain.goal as string | undefined) ?? null
  });
  return {
    ...draft,
    sources: draft.sources.map((source) => {
      const digest = grounding[source.url] ?? null;
      if (!digest) return { ...source, grounding: null };
      const sourceText = `${digest.title ?? ""} ${digest.excerpt ?? ""}`.trim();
      const relevance =
        digest.ok && sourceText
          ? scoreSourceRelevance(relevanceQuery, sourceText)
          : null;
      return {
        ...source,
        grounding: { ...digest, relevance }
      };
    })
  };
}

function runBaseline(fixture: Fixture) {
  const researchDraft = validateCourseDesignDraft(fixture.research);

  let lastCritique: { report: RouteQualityReport; draft: CourseDesignDraft } | null =
    null;
  for (const pass of fixture.critique) {
    lastCritique = validateCourseDesignCritique(pass);
  }

  const finalRaw: CourseDesignDraft = {
    ...(lastCritique ? lastCritique.draft : researchDraft),
    qualityReport: lastCritique
      ? lastCritique.report
      : researchDraft.qualityReport ?? null
  };
  const finalDraft = applyGrounding(finalRaw, fixture.grounding, fixture.domain);

  return { researchDraft, finalDraft };
}

describe("course quality regression baseline", () => {
  for (const { name, fixture } of fixtures) {
    describe(name, () => {
      it("research draft matches expected structural gate", () => {
        const { researchDraft } = runBaseline(fixture);
        expect(researchDraft.qualityGate.passed).toBe(
          fixture.expected.researchGatePassed
        );
        if (fixture.expected.researchMissing.length === 0) {
          expect(researchDraft.qualityGate.missing).toEqual([]);
        } else {
          for (const missing of fixture.expected.researchMissing) {
            expect(researchDraft.qualityGate.missing).toContain(missing);
          }
        }
      });

      it("final draft passes structural gate after critique + grounding", () => {
        const { finalDraft } = runBaseline(fixture);
        expect(finalDraft.qualityGate.passed).toBe(fixture.expected.finalGatePassed);
        expect(finalDraft.qualityGate.missing).toEqual(fixture.expected.finalMissing);
      });

      it("quality report has all five dimensions and expected significance", () => {
        const { finalDraft } = runBaseline(fixture);
        expect(finalDraft.qualityReport).not.toBeNull();
        const report = finalDraft.qualityReport as RouteQualityReport;

        const keys = report.dimensions.map((dimension) => dimension.key).sort();
        expect(keys).toEqual([...fixture.expected.qualityReportDimensionKeys].sort());
        expect(report.dimensions.length).toBe(routeQualityDimensionKeys.length);
        for (const dimension of report.dimensions) {
          expect(routeQualityDimensionKeys).toContain(dimension.key);
          expect(dimension.score).toBeGreaterThanOrEqual(1);
          expect(dimension.score).toBeLessThanOrEqual(5);
        }
        expect(report.significantIssues).toBe(
          fixture.expected.qualityReportSignificantIssues
        );
      });

      it("sources are grounded with expected reachability", () => {
        const { finalDraft } = runBaseline(fixture);
        const okCount = finalDraft.sources.filter(
          (source) => source.grounding?.ok === true
        ).length;
        const failCount = finalDraft.sources.filter(
          (source) => source.grounding != null && source.grounding.ok !== true
        ).length;
        expect(okCount).toBe(fixture.expected.groundedOkCount);
        expect(failCount).toBe(fixture.expected.groundedFailCount);
      });

      it("reachable sources carry an advisory relevance score, unreachable ones do not", () => {
        const { finalDraft } = runBaseline(fixture);
        for (const source of finalDraft.sources) {
          const grounding = source.grounding;
          if (grounding?.ok === true) {
            expect(grounding.relevance).not.toBeNull();
            expect(grounding.relevance!.score).toBeGreaterThanOrEqual(0);
            expect(grounding.relevance!.score).toBeLessThanOrEqual(1);
            expect(typeof grounding.relevance!.lowRelevance).toBe("boolean");
          } else if (grounding != null) {
            expect(grounding.relevance).toBeNull();
          }
        }
      });
    });
  }
});
