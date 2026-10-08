import { AiTaskValidationError } from "./validationEvidence";
import type { LearningGoal, CourseContentQuestion } from "../learning/roadmapPlanningTypes";
import type { MapDraftQualityReport } from "./tasks";
import { prerequisiteContinuityRules } from "../learning/teachingPrerequisites";

export type CriticalEvidence = { draftExcerpt: string; requirement: string; impact: string };
export type ContentRevision = {
  previousQuestionKey: string | null;
  revisedQuestionKeys: string[];
  reason: string;
  before: CourseContentQuestion | null;
  after: CourseContentQuestion[];
};

const criticalCodes = new Set([
  "coreKnowledgeError", "criticalCoverageGap", "missingEssentialPrerequisite",
  "confirmedScopeViolation", "fabricatedSource"
]);
const object = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
function fail(code: string, path: string, message: string): never {
  throw new AiTaskValidationError(message, [{ code, path, message }]);
}
const normalize = (v: string) => v.normalize("NFKC").replace(/\s+/g, "");

function targetsInDraft(draft: unknown) {
  const targets = new Map<string, unknown>();
  const visit = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(visit); return; }
    const item = object(v);
    if (!item) return;
    if (text(item.key)) { const key = text(item.key); targets.set(key, [...(targets.get(key) as unknown[] || []), item]); }
    Object.values(item).forEach(visit);
  };
  visit(draft);
  return targets;
}

function stringsIn(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(stringsIn);
  return object(v) ? Object.values(v as Record<string, unknown>).flatMap(stringsIn) : [];
}

/** Compact indexed excerpts avoid asking the model to retype JSON syntax. */
export function criticalPlanningTargets(draft: unknown) {
  const ownStrings = (value: unknown, root = true): string[] => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(v => ownStrings(v, false));
    const item = object(value);
    if (!item || (!root && text(item.key))) return [];
    return Object.entries(item).filter(([key]) => !["key", "dimensionKeys", "goalKeys", "planningQuestionKeys", "prerequisiteKeys", "prerequisiteStageKeys", "contentQuestionKey"].includes(key)).flatMap(([,v])=>ownStrings(v,false));
  };
  return [...targetsInDraft(draft)].map(([targetKey, values]) => ({targetKey, excerpts:[...new Set((values as unknown[]).flatMap(value=>ownStrings(value)))].map((text,index)=>({index,text}))}));
}

/** Fresh AI reports use explicit serious categories. Legacy saved reports are
 * still readable, but are never silently reclassified by this validator. */
export function validateCriticalPlanningReport(value: unknown, draft: unknown): MapDraftQualityReport {
  const report = object(value);
  if (!report || report.reviewPolicyVersion !== 1 || !text(report.summary)
    || !Array.isArray(report.blockingIssues) || !Array.isArray(report.warnings)) {
    fail("invalid_critical_review", "report", "复核必须返回 reviewPolicyVersion=1、摘要、阻断问题和建议数组；缺失报告不能视为通过。");
  }
  const targets = targetsInDraft(draft);
  const indexed = new Map(criticalPlanningTargets(draft).map(t=>[t.targetKey,t.excerpts]));
  const parse = (raw: unknown, index: number, blocking: boolean) => {
    const item = object(raw);
    const path = `report.${blocking ? "blockingIssues" : "warnings"}[${index}]`;
    if (!item || !text(item.code) || !text(item.message)) fail("invalid_review_finding", path, `${path} 必须是包含非空 code 和 message 字段的对象，例如 {"code":"sourceGap","targetKey":null,"message":"具体建议","suggestion":null}。不能返回字符串，也不能用 category 代替 code；保持这条原意见及其 blockingIssues/warnings 归属，只修复报告字段。`);
    const targetKey = text(item.targetKey) || null;
    if (targetKey && !targets.has(targetKey)) fail("unknown_review_target", `${path}.targetKey`, "复核意见必须定位到当前草稿中存在的目标。");
    let evidence: CriticalEvidence | undefined;
    if (blocking) {
      if (!criticalCodes.has(text(item.code))) fail("noncritical_blocker", `${path}.code`, "只有核心知识错误、关键内容缺失、必要基础缺失、严重范围偏离或伪造来源可阻断；一般改进请放入 warnings。");
      const supplied = object(item.evidence);
      if (!targetKey || !supplied || (supplied.draftExcerptIndex === undefined && !text(supplied.draftExcerpt)) || !text(supplied.requirement) || !text(supplied.impact)) {
        fail("missing_critical_evidence", path, "重大缺陷必须提供实际目标、草稿原文、违反的既定要求和严重教学后果。");
      }
      let excerpt = text(supplied.draftExcerpt);
      if (supplied.draftExcerptIndex !== undefined) {
        const index = supplied.draftExcerptIndex;
        const entry = Number.isSafeInteger(index) && Number(index) >= 0 ? indexed.get(targetKey)?.[Number(index)] : undefined;
        if (!entry || (excerpt && normalize(excerpt) !== normalize(entry.text))) fail("invalid_draft_excerpt_index", `${path}.evidence.draftExcerptIndex`, "复核原文编号必须属于指定目标，不能越界或附带不同原文。");
        excerpt = entry.text;
      }
      evidence = { draftExcerpt: excerpt, requirement: text(supplied.requirement), impact: text(supplied.impact) };
      if (!stringsIn(targets.get(targetKey)).some(s => normalize(s).includes(normalize(evidence!.draftExcerpt)))) {
        fail("unsupported_draft_excerpt", `${path}.evidence.draftExcerpt`, "重大缺陷的原文证据必须来自所指目标；遗漏问题可引用目标的现有范围描述。");
      }
    }
    return { code: text(item.code), targetKey, message: text(item.message), suggestion: text(item.suggestion) || null, ...(evidence ? { evidence } : {}) };
  };
  const blockers = (report.blockingIssues as unknown[]).map((v, i) => parse(v, i, true));
  const warnings = (report.warnings as unknown[]).map((v, i) => parse(v, i, false));
  const unique = <T extends { code: string; targetKey: string | null; message: string }>(values: T[]) =>
    values.filter((v, i) => values.findIndex(other => other.code === v.code && other.targetKey === v.targetKey && other.message === v.message) === i);
  return { reviewPolicyVersion: 1, status: blockers.length ? "blocked" : "passed", summary: text(report.summary), blockingIssues: unique(blockers), warnings: unique(warnings) };
}

/** Goals are retained; content may evolve only with a recorded mapping back to
 * each changed original question. Structural coverage is checked by the caller. */
export function validateContentRevisions(before: LearningGoal[] | undefined, after: LearningGoal[] | undefined, raw: unknown): ContentRevision[] {
  const goalIdentity = (goals?: LearningGoal[]) => JSON.stringify((goals || []).map(g => ({ key: g.key, description: g.description })));
  if (goalIdentity(before) !== goalIdentity(after)) fail("changed_learning_goals", "draft.learningGoals", "修订必须完整保留课程总目标的身份与含义；可以修订其内容问题及安排。");
  const original = new Map((before || []).flatMap(g => (g.contentQuestions || []).map(q => [q.key, { goalKey: g.key, question: q }] as const)));
  const revised = new Map((after || []).flatMap(g => (g.contentQuestions || []).map(q => [q.key, { goalKey: g.key, question: q }] as const)));
  const entries = Array.isArray(raw) ? raw : [];
  const reasons = new Map<string, { keys: string[]; reason: string }>();
  const additions: Array<{ keys: string[]; reason: string }> = [];
  const introduced = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const r = object(entry);
    const path = `contentRevisions[${index}]`;
    const oldKey = text(r?.previousQuestionKey);
    const keys = Array.isArray(r?.revisedQuestionKeys) ? r.revisedQuestionKeys.map(text) : [];
    const reason = text(r?.reason);
    if (r?.previousQuestionKey === null) {
      if (!keys.length || keys.some(k => !revised.has(k) || original.has(k) || introduced.has(k)) || new Set(keys).size !== keys.length || !reason) {
        fail("invalid_content_addition", path, "新增内容问题需要新的有效标识及其服务既定任务的理由，不能无理由扩充课程。");
      }
      keys.forEach(k => introduced.add(k));
      additions.push({ keys, reason });
      continue;
    }
    if (!original.has(oldKey) || reasons.has(oldKey) || !keys.length || keys.some(k => !revised.has(k)) || new Set(keys).size !== keys.length || !reason) {
      fail("invalid_content_revision", path, "内容修订需要唯一的原问题、有效且非空的承接问题和保留原必学内容的理由。");
    }
    if (keys.some(k => revised.get(k)!.goalKey !== original.get(oldKey)!.goalKey)) fail("changed_content_goal", path, "原内容须继续由所属课程目标承接，不能通过移动或删除问题消除目标覆盖。");
    reasons.set(oldKey, { keys, reason });
  }
  const audit: ContentRevision[] = [];
  for (const [key, old] of original) {
    const next = revised.get(key);
    const changed = !next || next.goalKey !== old.goalKey || JSON.stringify(next.question) !== JSON.stringify(old.question);
    const reason = reasons.get(key);
    if (changed && !reason) fail("missing_content_revision", `contentRevisions.${key}`, "修改、拆分或合并内容问题时必须说明原内容由哪些问题继续承接，不能默默丢弃要求。");
    if (!reason) continue;
    const replacements = reason.keys.map(k => revised.get(k)!.question);
    if (old.question.dimensionKeys.some(dim => !replacements.some(q => q.dimensionKeys.includes(dim)))) {
      fail("lost_content_dimension", `contentRevisions.${key}`, "修订后的承接问题必须保留原内容要求的教学维度。");
    }
    audit.push({ previousQuestionKey: key, revisedQuestionKeys: reason.keys, reason: reason.reason, before: old.question, after: replacements });
  }
  const mapped = new Set([...reasons.values()].flatMap(r => r.keys));
  for (const key of revised.keys()) {
    if (!original.has(key) && !mapped.has(key) && !introduced.has(key)) fail("unexplained_content_addition", `contentRevisions.${key}`, "新增内容问题必须解释其服务原任务的理由，或由原问题的拆分承接记录说明。");
  }
  additions.forEach(r => audit.push({ previousQuestionKey: null, revisedQuestionKeys: r.keys, reason: r.reason, before: null, after: r.keys.map(k => revised.get(k)!.question) }));
  return audit;
}

export function sameUnresolvedPlanningIssues(a: MapDraftQualityReport, b: MapDraftQualityReport) {
  const identities = (r: MapDraftQualityReport) => [...new Set(r.blockingIssues.map(f => `${f.code}:${f.targetKey}`))].sort();
  return JSON.stringify(identities(a)) === JSON.stringify(identities(b));
}

export const criticalReviewRules = `
SERIOUS-DEFECT POLICY (reviewPolicyVersion=1):
- Passing with warnings is the normal valid outcome. Return empty blockingIssues when there is no supported serious defect. Do not invent a required number of issues or search for optional improvements to justify failing.
- Both blockingIssues and warnings contain OBJECTS, never plain strings. Every item uses exact fields {"code":"issueCode","targetKey":"existing target key or null for a general warning","message":"specific finding","suggestion":"optional action or null"}; use code, NEVER category. Warning example: {"code":"sourceGap","targetKey":null,"message":"No matching source fragment; this limit is disclosed.","suggestion":null}. Warnings do not need blocker evidence; do not delete or escalate a warning just to fix its format.
- Only these blocking codes are allowed: coreKnowledgeError (materially wrong core knowledge), criticalCoverageGap (missing essential content required by the existing task), missingEssentialPrerequisite (essential background absent, making teaching unusable), confirmedScopeViolation (substantial deviation from the confirmed task), fabricatedSource (invented or misrepresented evidence).
- Every blocker MUST identify an existing targetKey and evidence {draftExcerpt, requirement, impact}: WHEN an indexed target excerpt catalog is supplied, use its draftExcerptIndex (the server restores exact wording); when no indexed catalog is supplied, including review of a newly revised draft, quote its exact plain-text wording without JSON field syntax or extra quotation marks. State the EXISTING violated task/source/rule, and explain the concrete serious teaching consequence. For an omission, quote the target's existing scope. Evidence is a model claim to inspect, not authoritative certification.
- Source reachability failure, insufficient extracts, and an already disclosed unverified-source status are NOT fabricatedSource. Missing a repeated disclosure in every Stage/title is a warning, not fabricatedSource; only a concrete invented citation or false claim of verified support qualifies.
- Wording, density, optional examples, reasonable alternative ordering, overlap with an explainable teaching role, and missing source coverage are warnings. Source gaps must be disclosed; do not infer a false definition merely because evidence is incomplete. General ambiguity is serious only when it makes the course unusable; explain that consequence.
- Related concepts MAY be taught together in a coherent unit; do not block or demand splitting on concept count alone. One content question may span multiple nodes, and one node may cover related questions. Nine dimensions can share explanations and cases while keeping specific conditions and distinctions clear. Do not require a fixed question/node count.
- For a missingEssentialPrerequisite finding, quote the actual use, identify the needed knowledge and depth, and inspect whether an agreed foundation, a referenced node's real tasks or a prior-to-use task within this unit provides it. A broad title or valid key is insufficient, but a planned teaching task is valid at planning time. Do not require full lesson bodies at this stage. Block only a concrete missing provision that materially prevents following the lesson; prefer scoped repair of that gap over inventing a new syllabus.
${prerequisiteContinuityRules}
- Judge the existing confirmed scope and depth. Do not add a new syllabus, proof depth, assessment, compulsory thinking, or learner self-explanation grading. A planned Stage is a blueprint, not an already-generated lesson.
- On subsequent review, track original serious findings and serious regressions caused by the revision. A newly noticed serious defect needs specific evidence against the SAME requirements. Never promote previous warnings to blockers just to keep improving the course.
`;

export const contentRevisionRules = `
- The unconfirmed global draft MAY improve, add, split or merge contentQuestions and their requirements and arrangements. Preserve each course goal's key and description, and the confirmed task scope/depth. Do not freeze the entire registry verbatim.
- For EVERY changed or removed original content question, return contentRevisions: [{previousQuestionKey:"original key",revisedQuestionKeys:["existing revised key"],reason:"how original essential content is retained and why this improves the plan"}]. Splits/merges must map all previous questions to valid current questions within the same course goal and retain their teaching dimensions. New independent questions need new stable keys; unchanged meanings reuse existing keys.
- For entirely new required content that does not decompose an old question, use {previousQuestionKey:null,revisedQuestionKeys:["new key"],reason:"which existing task requirement makes this addition essential"}. Every new question needs one of these reasons; do not add optional material just to satisfy a reviewer.
- Update all affected contentQuestionKey references. The server derives parent goalKeys. Never drop required content simply to pass review. Preserve Stage and concept identities/states and existing work; detailed nodes remain user-triggered.
- Fix ONLY supported serious blockers. Keep optional suggestions visible without expanding the course to satisfy them. Re-evaluate the exact draft you return, remove resolved findings, and retain real unresolved serious defects. Do not certify correctness or mark the draft confirmed.
`;
