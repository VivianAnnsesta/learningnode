import { validateCriticalPlanningReport, criticalReviewRules } from "./planningReviewPolicy";
import { AiTaskValidationError } from "./validationEvidence";
import { teachingObject, teachingText, unwrapTeachingAiResponse, type TeachingFramework, type TeachingMaterial } from "../learning/teachingContracts";
import type { MapDraftQualityReport } from "./tasks";
import type { TeachingKnowledgeReview, FrameworkPatch } from "./teachingKnowledgeReview";

export type TeachingContentReview = MapDraftQualityReport & { findings: string[]; limitation: string;
  knowledgeReview?: TeachingKnowledgeReview; retractedFindings?: MapDraftQualityReport["blockingIssues"];
  frameworkPatches?: FrameworkPatch[]; reusedMaterial?: boolean };

function evidenceContent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(evidenceContent);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, content]) => [key === "key" ? "candidateKey" : key, evidenceContent(content)]));
  return value;
}

/** Explicit review targets avoid collisions between a dimension and a segment
 * both named "use", and keep evidence attached to the actual candidate. */
export function teachingReviewTargets(candidate: TeachingFramework | TeachingMaterial, framework?: TeachingFramework): { key: string; content: unknown }[] {
  const targets = "concept" in candidate ? [
    { key: "framework", content: candidate },
    ...["definition", "scope", "runningCase", "prerequisites"].map(key => ({ key, content: candidate[key as "definition" | "scope" | "runningCase" | "prerequisites"] })),
    ...(candidate.prerequisitePlan || []).map(p => ({key:`prerequisite_${p.key}`,content:p})),
    ...candidate.dimensions.map(d => ({ key: `dimension_${d.key}`, content: d })),
    ...candidate.segments.flatMap(s => [{ key: `plan_${s.key}`, content: s }, ...s.steps.map(step => ({ key: step.key, content: step }))])
  ] : [{ key: candidate.key, content: candidate }, ...candidate.steps.flatMap(step => [{ key: step.key, content: step }, ...step.activities.map(a => ({ key: a.key, content: a }))])];
  const upstream = framework ? teachingReviewTargets(framework).map(t => ({ ...t, key: `framework:${t.key}` })) : [];
  return [...targets.map(target => ({ key: target.key, content: evidenceContent(target.content) })), ...upstream];
}

export function validateTeachingContentReview(value: unknown, candidate: TeachingFramework | TeachingMaterial, framework?: TeachingFramework): TeachingContentReview {
  value = unwrapTeachingAiResponse(value);
  const report = validateCriticalPlanningReport(value, { targets: teachingReviewTargets(candidate, framework) });
  try {
    const limitation = teachingText(teachingObject(value).limitation, "复核局限", 2500, true);
    return { ...report, findings: report.blockingIssues.map(issue => issue.message), limitation };
  } catch (error) {
    throw new AiTaskValidationError(error instanceof Error ? error.message : "复核局限格式不合法。");
  }
}

export const teachingReviewRules = `${criticalReviewRules}
TEACHING REVIEW RESPONSIBILITY:
- A framework fixes the definition, scope, running case and nine-dimensional five-segment arrangement. It is NOT the full lesson. Do not demand an already drawn graph, numerical table, worked exercise or reference answer when those are reasonably assigned to a future segment.
- Review only the current material. In a segment, check the actual taught claims, necessary conditions, example arithmetic and optional activity against its planned goal. Brief prerequisite background may be supplied without requiring an additional curriculum node.
- Check prerequisitePlan against actual prerequisite scopes/tasks in context. For each actual use, verify the named provision is sufficient at the needed depth; an empty plan does not exempt omitted dependencies from review. In the framework, prior-to-use steps are arrangements, not already taught facts. In material, prerequisiteSupport is displayed BEFORE its step: check its actual explanation, conditions and example reasoning, not merely its presence. A label such as "use squeezing" or "read the prerequisite first" is not a usable explanation. Check all optional activities for undeclared knowledge too. Declared foundations need not be fully retaught. Other lessons or steps may be unvisited, skipped or unclear; never certify mastery from these facts.
- Related concepts may remain together if their actual meanings, conditions, differences and uses are taught; do not manufacture granularity blockers. For a real continuity defect, point to its first actual use and the missing or inadequate provision. Ordinary clarity improvements remain warnings.
- A framework is a prior AI candidate, NOT a factual authority. Distinguish arrangement constraints from knowledge truth. If a claim is wrong in the framework, use the provided framework:<target> key, rather than blame a correct material answer. Never require a correct answer to match a false planned conclusion. A demonstrated wrong definition, case or counterexample that teaches a false core conclusion is a coreKnowledgeError, even when embedded in a plan; do not downgrade it to wording advice.
- Judge the actual current candidate; re-read corrected examples before retaining an old allegation. Removing a current activity cannot resolve an upstream framework error.
- Verify your own allegation against the exact text before returning a blocker: excluded points are not in a set difference; a disclosed convention is not a missing proof; alternative valid teaching sequences are not knowledge errors. Missing evidence alone goes in limitation/warnings.
- Required material questions describe the current concept's contribution, not an obligation to teach all concepts covered by the same course question in this lesson. Never demand later concepts as newly compulsory prerequisites merely because this lesson previews their role.
- Return {"reviewPolicyVersion":1,"summary":"brief judgment","blockingIssues":[],"warnings":[],"limitation":"source and verification limits"}. Findings use {code,targetKey,message,suggestion}; blockers also require evidence {draftExcerpt,requirement,impact}. Zero issues is valid. Do not invent a findings quota.
`;
