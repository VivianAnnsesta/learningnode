import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkLayeredRoadmapSkeleton,
  checkLayeredStageContentRisk,
  type LayeredRoadmapSkeleton,
  type RoadmapPlanningIssueCode
} from "./roadmapPlanningQuality";
import { validateRoadmapSkeletonDraft } from "./tasks";

const FIXTURE_DIR = join(__dirname, "fixtures", "roadmap-density-baseline");

type StageExpansionFixture = {
  stageKey: string;
  stage: {
    key?: string;
    title?: string;
    modules?: Array<{
      title?: string;
      items?: Array<{ key?: string; keyQuestion?: string | null }>;
    }>;
  };
};

type DensityFixture = {
  skeleton: LayeredRoadmapSkeleton;
  stageExpansions: StageExpansionFixture[];
  expected: {
    ok: boolean;
    needsAiReview: boolean;
    skeletonWarningCodes: RoadmapPlanningIssueCode[];
    expansionWarningCodes: RoadmapPlanningIssueCode[];
  };
};

function loadFixture(name: string): DensityFixture {
  const raw = readFileSync(join(FIXTURE_DIR, `${name}.json`), "utf-8");
  return JSON.parse(raw) as DensityFixture;
}

const FIXTURE_NAMES = ["thin-units", "healthy-units"];
const THIN_CODES: RoadmapPlanningIssueCode[] = [
  "thinModuleBlueprint",
  "thinStageExpansion"
];

describe("roadmap density advisory baseline", () => {
  for (const name of FIXTURE_NAMES) {
    const fixture = loadFixture(name);

    describe(name, () => {
      it("skeleton density findings match the baseline and stay advisory", () => {
        const result = checkLayeredRoadmapSkeleton(fixture.skeleton);

        expect(result.ok).toBe(fixture.expected.ok);
        expect(result.errors).toEqual([]);
        for (const code of fixture.expected.skeletonWarningCodes) {
          expect(result.warnings).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ code, severity: "warning" })
            ])
          );
        }
        if (fixture.expected.skeletonWarningCodes.length === 0) {
          expect(
            result.warnings.filter((issue) =>
              THIN_CODES.includes(issue.code)
            )
          ).toEqual([]);
        }
        expect(result.needsAiReview).toBe(fixture.expected.needsAiReview);
      });

      it("stage expansion density findings match the baseline and stay advisory", () => {
        for (const expansion of fixture.stageExpansions) {
          const blueprint = fixture.skeleton.stages.find(
            (stage) => stage.key === expansion.stageKey
          );
          expect(blueprint).toBeDefined();

          const result = checkLayeredStageContentRisk(
            expansion.stage,
            blueprint
          );

          expect(result.ok).toBe(true);
          expect(result.errors).toEqual([]);
          for (const code of fixture.expected.expansionWarningCodes) {
            expect(result.warnings).toEqual(
              expect.arrayContaining([
                expect.objectContaining({ code, severity: "warning" })
              ])
            );
          }
          if (fixture.expected.expansionWarningCodes.length === 0) {
            expect(
              result.warnings.filter((issue) =>
                THIN_CODES.includes(issue.code)
              )
            ).toEqual([]);
          }
          expect(result.needsAiReview).toBe(fixture.expected.needsAiReview);
        }
      });

      it("never reports density signals as blocking errors", () => {
        const skeletonResult = checkLayeredRoadmapSkeleton(fixture.skeleton);
        for (const expansion of fixture.stageExpansions) {
          const blueprint = fixture.skeleton.stages.find(
            (stage) => stage.key === expansion.stageKey
          );
          const expansionResult = checkLayeredStageContentRisk(
            expansion.stage,
            blueprint
          );
          for (const issue of [
            ...skeletonResult.errors,
            ...expansionResult.errors
          ]) {
            expect(THIN_CODES).not.toContain(issue.code);
          }
        }
      });
    });
  }

  it("carries the thin blueprint warning into planningWarnings for the review prompt channel", () => {
    const fixture = loadFixture("thin-units");
    const draft = validateRoadmapSkeletonDraft(fixture.skeleton);

    expect(draft.planningWarnings?.map((warning) => warning.code)).toContain(
      "thinModuleBlueprint"
    );
  });

  it("keeps a healthy skeleton free of planningWarnings", () => {
    const fixture = loadFixture("healthy-units");
    const draft = validateRoadmapSkeletonDraft(fixture.skeleton);

    expect(draft.planningWarnings).toBeUndefined();
  });
});
