import { AiTaskValidationError } from "./validationEvidence";
import { planningKnowledgeDigest, validatePlanningKnowledgeReview, type PlanningKnowledgeReview } from "./planningKnowledgeReview";

function textAt(draft: unknown, path: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*(?:(?:\.[A-Za-z_][A-Za-z0-9_]*)|(?:\[(?:0|[1-9][0-9]*)\]))*$/.test(path)) throw new Error("invalid path");
  let value: unknown = draft;
  for (const token of path.matchAll(/([A-Za-z_][A-Za-z0-9_]*)|\[([0-9]+)\]/g)) {
    const key = token[1] ?? Number(token[2]);
    if (!value || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, key)) throw new Error("missing path");
    value = (value as Record<string | number, unknown>)[key];
  }
  if (typeof value !== "string") throw new Error("not teaching text");
  return value;
}

/** Carry only unchanged, exactly located errors. This is retained evidence, never a new model review. */
export function retainCourseRepairKnowledge(savedDraft: unknown, candidate: unknown): {
  knownError: PlanningKnowledgeReview | null; history: unknown[];
} {
  const saved = savedDraft as Record<string, unknown>;
  const originalReport = saved?.knowledgeReview as PlanningKnowledgeReview | undefined;
  if (!originalReport) return { knownError: null, history: [] };
  const before = { ...saved };
  delete before.knowledgeReview;
  const history = [{ kind: "original_course_knowledge_report", originalReport, originalDraft: before,
    candidateDigest: planningKnowledgeDigest(candidate), note: "原报告完整归档；不表示模型已核对结构修复后的候选。" }];
  if (originalReport.verdict !== "confirmed_error") return { knownError: null, history };
  try {
    const originalMaterials = originalReport.materials || [];
    const checked = validatePlanningKnowledgeReview(originalReport, before, originalMaterials);
    if (originalReport.draftDigest !== checked.draftDigest || originalReport.materialsDigest !== checked.materialsDigest) throw new Error("original evidence fingerprint mismatch");
    if (!checked.findings.length) throw new Error("known error has no located finding");
    const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, "");
    const findings = checked.findings.filter(finding => normalize(textAt(before, finding.path)) === normalize(textAt(candidate, finding.path)));
    if (!findings.length) return { knownError: null, history };
    const claims = checked.claims.filter(claim => claim.verdict === "confirmed_error" && findings.some(finding => finding.path === claim.path && (finding.quote.includes(claim.quote) || claim.quote.includes(finding.quote))));
    const retained = validatePlanningKnowledgeReview({ ...checked, claims, findings,
      summary: "原报告指出的知识错误字段尚未实际修改；继续保留错误约束，当前候选仍待独立核对。",
      limitations: [...checked.limitations, "这些错误及来源继承自原报告，不是对结构修复后整份候选的新模型判断。"]
    }, candidate, originalMaterials);
    return { knownError: { ...retained, materials: originalMaterials, aiCallLogIds: originalReport.aiCallLogIds || [] }, history };
  } catch (error) {
    throw new AiTaskValidationError(`原课程的确定知识错误无法安全重定位，已保留原候选及报告，不能用结构修复解除：${error instanceof Error ? error.message : "证据无效"}`);
  }
}
