import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkRoadmapSkeletonDeterminism,
  checkStagesDeterminism,
  type DeterminismIssueCode
} from "./roadmapSkeletonChecks";
import {
  validateRoadmapSkeletonDraft,
  type RoadmapSkeletonDraft
} from "./tasks";

const FIXTURE_DIR = join(__dirname, "fixtures", "roadmap-skeleton-determinism");

function loadFixture(name: string): RoadmapSkeletonDraft {
  const raw = readFileSync(join(FIXTURE_DIR, `${name}.json`), "utf-8");
  return JSON.parse(raw) as RoadmapSkeletonDraft;
}

type Expectation = {
  codes: DeterminismIssueCode[];
  ok: boolean;
};

const EXPECTATIONS: Record<string, Expectation> = {
  healthy: { codes: [], ok: true },
  cycle: { codes: ["cyclicPrerequisite"], ok: false },
  dangling: { codes: ["danglingPrerequisiteKey"], ok: false },
  "too-many": { codes: ["tooManyStages"], ok: false },
  "duplicate-keys": { codes: ["duplicateStageKey"], ok: false },
  "duplicate-titles": { codes: ["duplicateStageTitle"], ok: true },
  "empty-goal-coreTopics": {
    codes: ["emptyStageGoal", "emptyModuleDirections"],
    ok: true
  }
};

describe("roadmap skeleton determinism baseline", () => {
  for (const [name, expectation] of Object.entries(EXPECTATIONS)) {
    it(`fixture ${name}: reports [${
      expectation.codes.join(", ") || "no issues"
    }]`, () => {
      const result = checkRoadmapSkeletonDeterminism(loadFixture(name));
      expect(result.ok).toBe(expectation.ok);
      for (const code of expectation.codes) {
        expect(result.issues.map((issue) => issue.code)).toContain(code);
      }
      // No unexpected ERROR codes beyond those we expect for this fixture.
      const expectedSet = new Set(expectation.codes);
      for (const issue of result.issues) {
        if (issue.severity === "error") {
          expect(expectedSet.has(issue.code)).toBe(true);
        }
      }
    });
  }

  describe("validateRoadmapSkeletonDraft integration", () => {
    it("accepts a healthy skeleton and carries no warnings", () => {
      const draft = validateRoadmapSkeletonDraft(loadFixture("healthy"));
      expect(draft.determinismWarnings).toBeUndefined();
    });

    it("throws on a cyclic skeleton", () => {
      expect(() => validateRoadmapSkeletonDraft(loadFixture("cycle"))).toThrow(
        /determinism checks/
      );
    });

    it("throws on a dangling prerequisite key", () => {
      expect(() =>
        validateRoadmapSkeletonDraft(loadFixture("dangling"))
      ).toThrow(/determinism checks/);
    });

    it("throws when stage count exceeds the cap", () => {
      expect(() =>
        validateRoadmapSkeletonDraft(loadFixture("too-many"))
      ).toThrow(/determinism checks/);
    });

    it("throws on duplicate stage keys", () => {
      expect(() =>
        validateRoadmapSkeletonDraft(loadFixture("duplicate-keys"))
      ).toThrow(/determinism checks/);
    });

    it("accepts duplicate titles but surfaces them as warnings", () => {
      const draft = validateRoadmapSkeletonDraft(loadFixture("duplicate-titles"));
      expect(draft.determinismWarnings?.map((warning) => warning.code)).toContain(
        "duplicateStageTitle"
      );
    });

    it("accepts empty goal/coreTopics but surfaces them as warnings", () => {
      const draft = validateRoadmapSkeletonDraft(
        loadFixture("empty-goal-coreTopics")
      );
      const codes = draft.determinismWarnings?.map((warning) => warning.code) ?? [];
      expect(codes).toContain("emptyStageGoal");
      expect(codes).toContain("emptyModuleDirections");
    });
  });

  describe("checkStagesDeterminism generic stage shape", () => {
    it("detects a self-referential cycle", () => {
      const result = checkStagesDeterminism([
        {
          key: "only",
          title: "Only",
          goal: "g",
          moduleDirections: ["m"],
          prerequisiteStageKeys: ["only"]
        }
      ]);
      expect(result.ok).toBe(false);
      expect(result.issues.map((issue) => issue.code)).toContain(
        "cyclicPrerequisite"
      );
    });

    it("warns on a missing rationale for expanded stages", () => {
      const result = checkStagesDeterminism([
        {
          key: "s1",
          title: "S1",
          goal: "g",
          moduleDirections: ["m"],
          prerequisiteStageKeys: [],
          rationale: ""
        }
      ]);
      expect(result.ok).toBe(true);
      expect(result.issues.map((issue) => issue.code)).toContain(
        "missingRationale"
      );
    });
  });
});
