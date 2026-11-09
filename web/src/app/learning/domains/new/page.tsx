"use client";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ActionButton, AppShell, PageHeader, SectionPanel } from "../../../components/ui";
import { PlanningContentChoices, PlanningKnowledgeEvidence } from "../../../components/PlanningKnowledgeEvidence";
import type { RoadmapInput } from "../../../../lib/learning/roadmapService";
import type { CourseDesignDraft, MapDraftQualityReport } from "../../../../lib/ai/tasks";
import { creationDraftSavePayload, restoredCreationDraftBinding } from "./creationDraftEditing";
type Review = {
    id: string;
    state: string;
    availability: string;
    report: MapDraftQualityReport | null;
};
function Creation() {
    const [draftCourseDesignAiCallLogId, setDraftCourseDesignAiCallLogId] = useState<string | null>(null);
    const router = useRouter(), query = useSearchParams(), [id, setId] = useState(query.get("domainId") || ""), [name, setName] = useState(""), [goal, setGoal] = useState(""), [scope, setScope] = useState(""), [foundation, setFoundation] = useState(""), [depth, setDepth] = useState(""), [exclusions, setExclusions] = useState(""), [materials, setMaterials] = useState(""), [feedback, setFeedback] = useState(""), [draft, setDraft] = useState<RoadmapInput | null>(null), [course, setCourse] = useState<CourseDesignDraft | null>(null), [review, setReview] = useState<Review | null>(null), [json, setJson] = useState(""), [busy, setBusy] = useState(""), [error, setError] = useState(""), [message, setMessage] = useState("");
    const restore = useCallback(async (domainId: string) => { const [a, b, c] = await Promise.all([fetch(`/api/domains/${domainId}`), fetch(`/api/domains/${domainId}/course-design`), fetch(`/api/domains/${domainId}/map`)]), [d, e, m] = await Promise.all([a.json(), b.json(), c.json()]); if (!a.ok)
        throw Error(d.error); if (!b.ok) throw Error(e.error || "恢复课程依据失败"); if (!c.ok) throw Error(m.error || "恢复路线草稿失败"); setMaterials(d.domain.planningInput?.materials || "");setFeedback(d.domain.planningInput?.feedback || "");setName(d.domain.name || ""); setGoal(d.domain.goal || ""); setScope(d.domain.scope || ""); setFoundation(d.domain.currentLevel || ""); setDepth(d.domain.depth || ""); setExclusions(d.domain.excludedScope || ""); setCourse(e.courseDesign?.draft || null); setDraft(m.draft || null); setDraftCourseDesignAiCallLogId(restoredCreationDraftBinding(m)); setJson(m.draft ? JSON.stringify(m.draft, null, 2) : ""); setReview(m.qualityReview || null); }, []);
    useEffect(() => { if (id)
        void restore(id).catch(e => setError(e.message)); }, [id, restore]);
    const request = async (path: string, data: unknown, method = "POST") => { const r = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }), d = await r.json(); if (!r.ok)
        throw Error(d.error || "规划请求失败；保存内容仍保留"); return d; };
    const act = async (label: string, fn: () => Promise<void>) => { setBusy(label); setError(""); setMessage(""); try {
        await fn();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "操作失败");
    }
    finally {
        setBusy("");
    } };
    const saveInputs = async () => { const data = { name, goal, scope, currentLevel: foundation || "未知", depth: depth || "待确定", excludedScope: exclusions || "暂未确定",planningInput:{materials,feedback} }; if (id) {
        await request(`/api/domains/${id}`, data, "PATCH");
        return id;
    } const d = await request("/api/domains", data), created = d.domain.id; setId(created); router.replace(`/learning/domains/new?domainId=${created}`); return created; };
    const plan = () => act("规划", async () => { const current = await saveInputs(); setMessage("正在基于目标准备路线；可以从规划记录回看每次模型返回。"); try { const d = await request(`/api/domains/${current}/planning`, { regenerate: !!course, feedback: [feedback, materials ? `用户提供的资料或来源声明（正文与链接分别判断）：\n${materials}` : ""].filter(Boolean).join("\n") }); if (d.error) throw Error(d.error); } finally { await restore(current); } });
    const accept = () => act("接受路线", async () => { if (!id || !draft)
        return; await request(`/api/domains/${id}/map`, { draft, reason: "用户已查看目标、范围、基础假设、来源限制及路线安排，明确接受当前路线。", courseDesign: course }); router.push(`/learning/domains/${id}`); });
    return <AppShell><PageHeader title="建立学习路线" description="填写领域和目标即可；基础或范围尚不清楚，可以让老师提出建议，在一次路线审查中确认。"/><SectionPanel><label className="block">领域名称<input aria-label="领域名称" className="workshop-input w-full" value={name} onChange={e => setName(e.target.value)}/></label><label className="block">学习目标或开放问题<textarea aria-label="学习目标" className="workshop-input min-h-24 w-full" value={goal} onChange={e => setGoal(e.target.value)}/></label><details><summary>补充范围、基础与资料（可以暂时未知）</summary><input aria-label="学习范围" className="workshop-input w-full" placeholder="范围" value={scope} onChange={e => setScope(e.target.value)}/><input aria-label="当前基础" className="workshop-input w-full" placeholder="当前基础，可以填未知" value={foundation} onChange={e => setFoundation(e.target.value)}/><input aria-label="时间或深度" className="workshop-input w-full" placeholder="时间或深度" value={depth} onChange={e => setDepth(e.target.value)}/><input aria-label="排除范围" className="workshop-input w-full" placeholder="暂时不学的内容" value={exclusions} onChange={e => setExclusions(e.target.value)}/><textarea aria-label="规划参考资料" className="workshop-input min-h-28 w-full" placeholder="粘贴实际资料、考纲或课程片段；公开网址也可写入此处" value={materials} onChange={e => setMaterials(e.target.value)}/></details><ActionButton disabled={!!busy || !name.trim() || !goal.trim()} onClick={() => void plan()}>{course ? "按当前目标重新规划" : "AI 规划路线"}</ActionButton><ActionButton variant="secondary" disabled={!!busy || !name.trim() || !goal.trim()} onClick={() => void act("保存", async () => { await saveInputs(); setMessage("目标已保存；尚未改变正式地图。"); })}>保存目标</ActionButton>{id && <Link className="underline" href={`/learning/domains/${id}`}>返回当前正式路线</Link>}{busy && <p role="status">正在{busy}，生成状态与内容会保存，请等待或稍后恢复。</p>}{error && <p role="alert" className="text-rose-700">{error}</p>}{message && <p role="status">{message}</p>}</SectionPanel>
 {course && <SectionPanel><h2>路线依据与范围</h2><p>你的目标（学习者陈述）：{goal}</p><p>基础输入（学习者陈述）：{foundation && foundation !== "未知" ? foundation : "未单独填写；学习目标中的自述仍作为规划输入，按需要补讲。"}</p><p>课程建议的默认基础：{course.knowledgeBoundary?.assumedKnowledge.join("；") || "尚未说明"}。这是备课假设，不证明你已经掌握。</p><p className="whitespace-pre-wrap">{course.globalExplanation.theorySkeleton}</p><p className="whitespace-pre-wrap">{course.globalExplanation.optimizationRationale}</p><p>{course.globalExplanation.sourceBasis}</p><p>{course.globalExplanation.risksAndValidation}</p><p>课程结构字段：{course.qualityGate.passed ? "完整；知识与来源依据另行核对。" : `尚缺 ${course.qualityGate.missing.join("、")}`}</p><PlanningKnowledgeEvidence sources={course.sources} knowledgeReview={course.knowledgeReview}/></SectionPanel>}
 {draft && <SectionPanel><h2>完整路线安排</h2><p>远期部分保留为方向，详细任务按阶段展开。展示顺序不产生前置依赖。</p>{draft.stages?.map(s => <article key={s.key} className="border-t pt-3"><h3>{s.title}</h3><p>{s.goal}</p><p>位置理由：{s.rationale || "未说明；请核对这一位置的教学理由。"}</p><p>前置阶段：{s.prerequisiteStageKeys?.join("、") || "无显式前置"}</p>{s.problem && <p>代表问题：{s.problem.question}</p>}<PlanningContentChoices goals={draft.learningGoals} stage={s}/><ul>{s.moduleDirections?.map((m, i) => <li key={i}>{m}</li>)}</ul></article>)}<PlanningKnowledgeEvidence structureReport={review?.report} reviewState={review?.state} knowledgeReview={review?.report?.knowledgeReview}/>
 <ActionButton disabled={!!busy || !review || !["passed", "resolved"].includes(review.state) || review.report?.knowledgeReview?.verdict === "confirmed_error" || course?.knowledgeReview?.verdict === "confirmed_error"} onClick={() => void accept()}>接受这份路线并开始学习</ActionButton><ActionButton variant="secondary" disabled={!!busy} onClick={() => void act("复核并修订", async () => { try { await request(`/api/domains/${id}/map/reviews`, {feedback}); } finally { await restore(id); } })}>根据发现修订路线</ActionButton><textarea aria-label="路线改进意见" className="workshop-input w-full" value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="需要调整的安排或范围"/>{review && ["blocked", "unavailable"].includes(review.state) && review.report?.knowledgeReview?.verdict !== "confirmed_error" && course?.knowledgeReview?.verdict !== "confirmed_error" && <ActionButton variant="secondary" disabled={!!busy || !feedback.trim()} onClick={() => void act("记录判断", async () => { await request(`/api/domains/${id}/map/review-decisions`, { reviewId: review.id, decision: review.state === "unavailable" ? "acknowledge_unavailable" : "dismiss_semantic", rationale: feedback }); await restore(id); })}>保留不确定性并记录我的判断</ActionButton>}
 <details><summary>编辑已保存路线草稿</summary><textarea aria-label="路线草稿内容" className="workshop-input min-h-64 w-full font-mono" value={json} onChange={e => setJson(e.target.value)}/><ActionButton variant="secondary" disabled={!!busy} onClick={() => void act("保存草稿", async () => { await request(`/api/domains/${id}/map`, creationDraftSavePayload(json, draftCourseDesignAiCallLogId), "PATCH"); await restore(id); })}>保存修改，重新检查</ActionButton></details></SectionPanel>}
 {id && <Link className="underline" href={`/learning/domains/${id}/ai-logs`}>查看每次模型返回、检查与失败原因</Link>}</AppShell>;
}
export default function CreationPage() { return <Suspense fallback={<p>正在恢复路线…</p>}><Creation /></Suspense>; }
