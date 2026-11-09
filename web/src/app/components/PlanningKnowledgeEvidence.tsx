import type { CourseDesignSource, MapDraftQualityReport } from "../../lib/ai/tasks";
import type { PlanningKnowledgeMaterial, PlanningKnowledgeReview } from "../../lib/ai/planningKnowledgeReview";
import { isSafeExternalUrl } from "../../lib/security/externalUrl";
import type { LearningGoal, RoadmapModuleBlueprint } from "../../lib/learning/roadmapPlanningTypes";

const verdictLabels = {
  confirmed_error: "发现明确知识错误，须先修正",
  no_error_found: "本次核对未发现错误，不表示已证明正确",
  uncertain: "知识核对不确定或证据不足"
};
const basisLabels = { source: "实际正文片段", derivation: "推导或反例核对", unverified: "尚未核对" };

export function PlanningContentChoices({ goals, stage }: { goals?: LearningGoal[]; stage: { moduleBlueprints?: RoadmapModuleBlueprint[] } }) {
  const keys = new Set((stage.moduleBlueprints || []).flatMap(module => module.keyQuestions.map(question => question.contentQuestionKey)));
  const questions = (goals || []).flatMap(goal => goal.contentQuestions || []).filter(question => keys.has(question.key));
  return questions.length ? <details><summary>这一阶段的必要与选学内容</summary><ul className="space-y-1 pl-4">{questions.map(question => <li key={question.key}>{question.question} · {question.importance === "required" ? "必要内容" : question.importance === "optional" ? "选学内容，可按需要跳过" : "尚未注明必要／选学，不能补记为必学"}</li>)}</ul></details> : null;
}

function safeLink(url: string) {
  if (!isSafeExternalUrl(url)) return false;
  const parsed = new URL(url);
  return !parsed.username && !parsed.password;
}

export function PlanningKnowledgeEvidence({
  structureReport,
  reviewState,
  sources,
  knowledgeReview,
  knowledgeMaterials
}: {
  structureReport?: MapDraftQualityReport | null;
  reviewState?: string | null;
  sources?: CourseDesignSource[];
  knowledgeReview?: PlanningKnowledgeReview | null;
  knowledgeMaterials?: PlanningKnowledgeMaterial[];
}) {
  const knownMaterials = new Map((knowledgeReview?.materials || knowledgeMaterials || []).map(material => [material.id, material]));
  const stale = reviewState === "stale" || reviewState === "legacy";
  return <div className="space-y-3 text-sm" aria-label="规划与知识独立证据">
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <h3 className="font-semibold">结构与规划检查</h3>
      <p>{stale ? "草稿已变化，当前版本需要重新检查。"
        : structureReport?.status === "passed" ? "结构／规划没有已报告的阻断；这不表示知识正确。"
        : structureReport?.status === "blocked" ? "规划仍有阻断或复核未完成。"
        : "当前没有结构与规划检查报告。"}</p>
      {structureReport ? <><p className="whitespace-pre-wrap">{structureReport.summary}</p>
        {structureReport.blockingIssues.map((finding, index) => <p key={`${finding.code}:${finding.targetKey}:${index}`} className="text-rose-800">待处理：{finding.message}</p>)}
        {structureReport.warnings.length ? <details><summary>规划建议与限制（{structureReport.warnings.length}）</summary><ul className="list-disc pl-5">{structureReport.warnings.map((finding, index) => <li key={`${finding.code}:${index}`}>{finding.message}</li>)}</ul></details> : null}
      </> : null}
    </div>

    {sources ? <div className="rounded border border-slate-200 p-3">
      <h3 className="font-semibold">来源取得事实</h3>
      <p>只有实际正文支持的说法可作为材料依据；可达、标题和摘要不能核实具体教学安排。</p>
      {sources.length ? sources.map((source, index) => {
        const grounding = source.grounding;
        const body = grounding?.fragments?.filter(fragment => fragment.text.trim()) || [];
        const bodyRetrieved = grounding?.bodyRetrieved !== false && body.length > 0;
        return <article className="border-t py-2" key={`${source.url}:${index}`}>
          <p className="font-medium">{source.title}</p><p>{source.reason}</p>
          {safeLink(source.url) ? <a className="underline" href={source.url} target="_blank" rel="noreferrer">查看资料来源</a> : <p>来源地址未通过链接校验。</p>}
          <p>{bodyRetrieved ? `已取得 ${body.length} 个有位置的正文片段；内容准确性仍须另行核对。` : "尚未取得可用正文，具体安排没有来源正文支持。"}</p>
          {grounding?.error ? <p>取得限制：{grounding.error}</p> : null}
          {grounding?.status ? <p>取得响应：HTTP {grounding.status}</p> : null}
          {grounding?.finalUrl ? <p className="break-all text-xs">实际取得地址：{grounding.finalUrl}</p> : null}
          {grounding?.retrievedAt ? <p className="text-xs">取得时间：{grounding.retrievedAt}</p> : null}
          {grounding?.contentHash ? <details><summary>正文快照指纹</summary><code className="break-all text-xs">{grounding.contentHash}</code></details> : null}
          {bodyRetrieved ? <details><summary>查看真实正文和位置</summary>
            {body.slice(0, 8).map((fragment, bodyIndex) => <blockquote key={`${fragment.location}:${bodyIndex}`} className="my-2 border-l-2 pl-3"><p className="text-xs text-slate-500">{fragment.location}</p><p className="whitespace-pre-wrap">{fragment.text}</p></blockquote>)}
            {body.length > 8 ? <p>此处显示前 8 个片段；具体核对依据见下方主张引用，不代表全文已经核对。</p> : null}
          </details> : null}
          {grounding?.excerpt ? <details><summary>标题和摘要（不替代正文）</summary><p className="whitespace-pre-wrap">{grounding.excerpt}</p></details> : null}
        </article>;
      }) : <p>当前没有公开来源正文声明；可使用实际提供的材料，缺口保留。</p>}
    </div> : null}

    <div className="rounded border border-slate-200 p-3">
      <h3 className="font-semibold">独立知识核对</h3>
      {!knowledgeReview ? <p>尚未核对。旧数据和没有报告的草稿不补记知识通过。</p>
        : <><p className={knowledgeReview.verdict === "confirmed_error" ? "text-rose-800" : ""}>{verdictLabels[knowledgeReview.verdict]}</p>
          {stale ? <p className="text-amber-800">这是此前候选的核对记录，当前编辑需要重新核对。</p> : null}
          <p className="whitespace-pre-wrap">{knowledgeReview.summary}</p>
          {knowledgeReview.limitations.length ? <ul className="list-disc pl-5">{knowledgeReview.limitations.map((limitation, index) => <li key={index}>局限：{limitation}</li>)}</ul> : null}
          <details><summary>核对绑定的内容与材料指纹</summary><p className="break-all text-xs">内容：{knowledgeReview.draftDigest}</p><p className="break-all text-xs">材料：{knowledgeReview.materialsDigest}</p></details>
          {knowledgeReview.claims.map(claim => <details key={claim.key} className="border-t py-2"><summary>{claim.conclusion} · {verdictLabels[claim.verdict]}</summary>
            <p className="break-all text-xs">原文位置：{claim.path}</p><blockquote className="whitespace-pre-wrap border-l-2 pl-3">{claim.quote}</blockquote>
            <p>结论：{claim.conclusion}</p><p>前提：{claim.premises.join("；") || "本报告未列出前提，请据原文判断是否充分。"}</p><p>适用条件：{claim.applicability.join("；") || "本报告未列出适用条件。"}</p>
            <p>核对依据：{basisLabels[claim.basis.kind]}；{claim.basis.reason}</p><p>核对理由：{claim.reason}</p>
            {claim.counterexample ? <p className="whitespace-pre-wrap">反例或推导：{claim.counterexample}</p> : null}
            {claim.basis.fragmentIds.map(fragmentId => {
              const material = knownMaterials.get(fragmentId);
              return <div key={fragmentId} className="my-2 rounded bg-slate-50 p-2"><p className="break-all text-xs">依据片段：{fragmentId}</p>{material ? <><p>{material.title || "实际材料"} · {material.location || "位置未记录"}</p>{material.contentHash ? <p className="break-all text-xs">指纹：{material.contentHash}</p> : null}<blockquote className="whitespace-pre-wrap border-l-2 pl-3">{material.text}</blockquote></> : <p>当前页面未取得此片段快照，不能仅凭标识判断其支持程度。</p>}</div>;
            })}
          </details>)}
          {knowledgeReview.findings.length ? <details><summary>发现与局部修正（{knowledgeReview.findings.length}）</summary>{knowledgeReview.findings.map((finding, index) => <div className="border-t py-2" key={`${finding.path}:${index}`}><p className="break-all text-xs">{finding.path}</p><p className="whitespace-pre-wrap">原文：{finding.quote}</p><p className="whitespace-pre-wrap">修正候选：{finding.replacement}</p><p>理由：{finding.reason}</p></div>)}</details> : null}
          {knowledgeReview.verdict === "confirmed_error" ? <p className="text-rose-800">明确知识错误须先修正并重新核对，不能通过记录风险或结构通过接受。</p> : null}
        </>}
    </div>
  </div>;
}
