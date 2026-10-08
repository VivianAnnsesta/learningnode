"use client";

import Link from "next/link";
import { CurriculumCoverage } from "../../../components/CurriculumCoverage";
import { isSafeExternalUrl } from "../../../../lib/security/externalUrl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ActionButton,
  AppShell,
  PageHeader,
  SectionPanel,
  StatusPill
} from "../../../components/ui";

type DomainDraft = {
  name: string;
  description: string;
  currentLevel: string;
  goal: string;
  scope: string;
  excludedScope: string;
  depth: string;
  outputType: string;
  outputTarget: string;
  taskBrief: string;
};

type RoadmapItem = {
  concept?: import("../../../../lib/learning/roadmapPlanningTypes").ConceptProfile;
  key: string;
  title: string;
  keyQuestion?: string | null;
  objective?: string | null;
  prerequisite?: string | null;
  commonMistake?: string | null;
  transferPrompt?: string | null;
  prerequisiteKeys?: string[];
  planningQuestionKey?: string | null;
  status?: string | null;
};

type RoadmapPlanningQuestion = import("../../../../lib/learning/roadmapPlanningTypes").RoadmapModuleKeyQuestion;

type RoadmapModuleBlueprint = {
  goalKeys?: string[];
  key: string;
  title: string;
  goal: string;
  keyQuestions: RoadmapPlanningQuestion[];
};

type RoadmapModule = {
  title: string;
  goal?: string | null;
  items: RoadmapItem[];
};

type RoadmapStage = {
  goalKeys?: string[];
  problem?: import("../../../../lib/learning/roadmapPlanningTypes").StageProblem;
  key: string;
  title: string;
  goal?: string | null;
  status: "planned" | "expanded";
  rationale?: string | null;
  moduleDirections: string[];
  moduleBlueprints: RoadmapModuleBlueprint[];
  prerequisiteStageKeys: string[];
  modules: RoadmapModule[];
};

type RoadmapDraft = {
  contentCoverageVersion?: 1;
  learningGoals?: import("../../../../lib/learning/roadmapPlanningTypes").LearningGoal[];
  planningVersion: 2 | 3;
  title: string;
  status?: string;
  baseRevision?: number;
  stages: RoadmapStage[];
};

type RoadmapSkeleton = {
  contentCoverageVersion?: 1;
  learningGoals?: import("../../../../lib/learning/roadmapPlanningTypes").LearningGoal[];
  planningVersion: 2 | 3;
  title: string;
  status?: string;
  stages: Array<{
    goalKeys?: string[];
    problem?: import("../../../../lib/learning/roadmapPlanningTypes").StageProblem;
    key: string;
    title: string;
    goal?: string | null;
    coreTopics: string[];
    prerequisiteStageTitles: string[];
    prerequisiteStageKeys: string[];
    moduleBlueprints: RoadmapModuleBlueprint[];
  }>;
  determinismWarnings?: Array<{
    code: string;
    severity: string;
    message: string;
    stageKey?: string;
  }>;
};

type MapQualityReport = {
  status: "passed" | "blocked";
  summary: string;
  blockingIssues: Array<{
    code: string;
    targetKey?: string | null;
    message: string;
    suggestion?: string | null;
  }>;
  warnings: Array<{
    code: string;
    targetKey?: string | null;
    message: string;
    suggestion?: string | null;
  }>;
};

type MapReviewState =
  | "passed"
  | "resolved"
  | "blocked"
  | "unavailable"
  | "stale"
  | "legacy"
  | null;

type DomainWorkflowSnapshot = {
  phase: string;
  allowedActions: string[];
  blockers: string[];
};

type CourseDesignDraft = {
  knowledgeBoundary?: import("../../../../lib/learning/roadmapPlanningTypes").KnowledgeBoundary;
  taskBriefSnapshot: string;
  globalExplanation: {
    theorySkeleton: string;
    sourceBasis: string;
    optimizationRationale: string;
    risksAndValidation: string;
  };
  sources: Array<{
    url: string;
    title: string;
    reason: string;
    grounding?: {
      ok: boolean;
      status: number | null;
      title: string | null;
      excerpt: string | null;
      relevance?: {
        score: number;
        lowRelevance: boolean;
      } | null;
      aiRelevance?: {
        score: number;
        lowRelevance: boolean;
        reason: string;
      } | null;
    } | null;
  }>;
  keyTradeoffs: string[];
  qualityGate: {
    passed: boolean;
    missing: string[];
  };
  qualityReport?: {
    summary: string;
    significantIssues: boolean;
    dimensions: Array<{
      key: string;
      score: number;
      note: string;
    }>;
  } | null;
};

const qualityDimensionLabels: Record<string, string> = {
  prerequisiteCorrectness: "先修正确性",
  goalMatch: "目标匹配",
  cognitiveLoad: "认知负荷",
  sourceQuality: "来源质量",
  checkability: "可检验性"
};

type CourseDesignRepairState = {
  attempted: boolean;
  attempts: number;
  totalAttempts: number;
  succeeded: boolean;
  error?: string;
};

const emptyDomain = (): DomainDraft => ({
  name: "",
  description: "",
  currentLevel: "",
  goal: "",
  scope: "",
  excludedScope: "",
  depth: "",
  outputType: "",
  outputTarget: "",
  taskBrief: ""
});

const jsonHeaders = { "Content-Type": "application/json" };

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

const restoreDomainDraft = (domain: Record<string, unknown>): DomainDraft => ({
  name: typeof domain.name === "string" ? domain.name : "",
  description:
    typeof domain.description === "string" ? domain.description : "",
  currentLevel:
    typeof domain.currentLevel === "string" ? domain.currentLevel : "",
  goal: typeof domain.goal === "string" ? domain.goal : "",
  scope: typeof domain.scope === "string" ? domain.scope : "",
  excludedScope:
    typeof domain.excludedScope === "string" ? domain.excludedScope : "",
  depth: typeof domain.depth === "string" ? domain.depth : "",
  outputType:
    typeof domain.outputType === "string" ? domain.outputType : "",
  outputTarget:
    typeof domain.outputTarget === "string" ? domain.outputTarget : "",
  taskBrief: typeof domain.taskBrief === "string" ? domain.taskBrief : ""
});

const restoreMapSkeleton = (draft: RoadmapDraft): RoadmapSkeleton => ({
  ...(draft.contentCoverageVersion?{contentCoverageVersion:draft.contentCoverageVersion}:{}),
  planningVersion: 3,
  learningGoals: draft.learningGoals,
  title: draft.title,
  status: draft.status,
  stages: draft.stages.map((stage) => ({
    ...stage,
    key: stage.key,
    title: stage.title,
    goal: stage.goal,
    coreTopics: stage.moduleDirections,
    prerequisiteStageTitles: [],
    prerequisiteStageKeys: stage.prerequisiteStageKeys,
    moduleBlueprints: stage.moduleBlueprints || []
  }))
});

export default function NewLearningDomainPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<DomainDraft>(emptyDomain());
  const [domainId, setDomainId] = useState("");
  const [entryDraft,setEntryDraft]=useState<import("../../../../lib/ai/tasks").TaskBriefDraft|null>(null);
  const [taskBriefConfirmed, setTaskBriefConfirmed] = useState(false);
  const [courseDesignDraft, setCourseDesignDraft] =
    useState<CourseDesignDraft | null>(null);
  const [courseDesignStatus, setCourseDesignStatus] = useState("none");
  const [courseDesignAiCallLogId, setCourseDesignAiCallLogId] = useState<
    string | null
  >(null);
  const [courseDesignRepair, setCourseDesignRepair] =
    useState<CourseDesignRepairState | null>(null);
  const [courseDesignWarning, setCourseDesignWarning] = useState("");
  const [courseDesignFeedback, setCourseDesignFeedback] = useState("");
  const [mapSkeleton, setMapSkeleton] = useState<RoadmapSkeleton | null>(null);
  const [mapDraft, setMapDraft] = useState<RoadmapDraft | null>(null);
  const [mapDraftStale, setMapDraftStale] = useState(false);
  const [mapReviewState, setMapReviewState] =
    useState<MapReviewState>(null);
  const [mapQualityReport, setMapQualityReport] =
    useState<MapQualityReport | null>(null);
  const [mapReviewId, setMapReviewId] = useState<string | null>(null);
  const [mapReviewRationale, setMapReviewRationale] = useState("");
  const [workflow, setWorkflow] = useState<DomainWorkflowSnapshot | null>(null);
  const [mapProgress, setMapProgress] = useState("");
  const [courseDesignProgress, setCourseDesignProgress] = useState("");
  const [busy, setBusy] = useState("restore");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refreshWorkflow = async (id: string) => {
    const response = await fetch(
      `/api/domains/${encodeURIComponent(id)}/workflow`
    );
    const data = await readJson(response);
    if (response.ok && data.workflow) {
      setWorkflow(data.workflow as DomainWorkflowSnapshot);
    }
  };

  useEffect(() => {
    const restoredDomainId = new URLSearchParams(window.location.search)
      .get("domainId")
      ?.trim();
    if (!restoredDomainId) {
      setBusy("");
      return;
    }
    const encodedDomainId = encodeURIComponent(restoredDomainId);

    let cancelled = false;
    const restore = async () => {
      try {
        const [domainResponse, courseDesignResponse, mapResponse, workflowResponse] =
          await Promise.all([
            fetch(`/api/domains/${encodedDomainId}`),
            fetch(`/api/domains/${encodedDomainId}/course-design`),
            fetch(`/api/domains/${encodedDomainId}/map`),
            fetch(`/api/domains/${encodedDomainId}/workflow`)
          ]);
        const [domainData, courseDesignData, mapData, workflowData] = await Promise.all([
          readJson(domainResponse),
          readJson(courseDesignResponse),
          readJson(mapResponse),
          readJson(workflowResponse)
        ]);
        if (!domainResponse.ok) {
          throw new Error(domainData.error || "恢复学习领域失败。");
        }
        if (!courseDesignResponse.ok) {
          throw new Error(
            courseDesignData.error || "恢复课程设计方向失败。"
          );
        }
        if (!mapResponse.ok) {
          throw new Error(mapData.error || "恢复领域地图草稿失败。");
        }
        if (cancelled) return;

        if ((mapData.mapRevision || 0) > 0) {
          router.replace(`/learning/domains/${encodedDomainId}`);
          return;
        }

        const restoredCourseDesign = courseDesignData.courseDesign || {};
        const restoredMapDraft = (mapData.draft || null) as RoadmapDraft | null;
        const restoredCourseDesignAiCallLogId =
          restoredCourseDesign.aiCallLogId || null;
        const restoredReviewState = (mapData.qualityReview?.state ||
          null) as MapReviewState;
        const restoredMapIsStale = Boolean(
          restoredMapDraft &&
            (mapData.draftStatus === "needs_review" ||
              restoredMapDraft.planningVersion !== 3 ||
              !["passed", "resolved"].includes(restoredReviewState || "") ||
              !restoredCourseDesignAiCallLogId ||
              mapData.draftCourseDesignAiCallLogId !==
                restoredCourseDesignAiCallLogId)
        );
        setDomainId(restoredDomainId);
        setDraft(restoreDomainDraft(domainData.domain || {}));
        setEntryDraft(domainData.domain?.entryGuide?.draft || null);
        setTaskBriefConfirmed(Boolean(domainData.domain?.taskBriefConfirmedAt));
        setCourseDesignDraft(restoredCourseDesign.draft || null);
        setCourseDesignStatus(restoredCourseDesign.status || "none");
        setCourseDesignAiCallLogId(restoredCourseDesignAiCallLogId);
        setCourseDesignRepair(
          restoredCourseDesign.draft
            ? {
                attempted: false,
                attempts: 0,
                totalAttempts: restoredCourseDesign.repairCount || 0,
                succeeded: Boolean(
                  restoredCourseDesign.draft.qualityGate?.passed
                )
              }
            : null
        );
        setMapDraft(restoredMapDraft);
        setMapDraftStale(restoredMapIsStale);
        setMapReviewState(restoredReviewState);
        setMapReviewId(mapData.qualityReview?.id || null);
        setMapQualityReport(mapData.qualityReview?.report || null);
        setWorkflow(workflowResponse.ok ? workflowData.workflow || null : null);
        setMapSkeleton(
          restoredMapDraft ? restoreMapSkeleton(restoredMapDraft) : null
        );
        setMapProgress(
          restoredMapDraft
            ? restoredMapIsStale
              ? "已恢复旧版 Stage 骨架；它仅供参考，请基于当前课程设计重新生成。"
              : `已恢复完整 Stage 骨架：${restoredMapDraft.stages.length} 个阶段。`
            : ""
        );
        setMessage("已恢复这个学习领域的创建进度。");
      } catch (restoreError) {
        if (!cancelled) {
          setError(
            restoreError instanceof Error
              ? restoreError.message
              : "恢复创建进度失败。"
          );
        }
      } finally {
        if (!cancelled) setBusy("");
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const clearMapState = () => {
    setMapSkeleton(null);
    setMapDraft(null);
    setMapDraftStale(false);
    setMapReviewState(null);
    setMapReviewId(null);
    setMapReviewRationale("");
    setMapQualityReport(null);
    setMapProgress("");
  };

  const updateMapDraft = (updater: (current: RoadmapDraft) => RoadmapDraft) => {
    setMapDraft((current) => (current ? updater(current) : current));
    setMapDraftStale(true);
    setMapReviewState("stale");
  };

  const newStableKey = (prefix: string) =>
    `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

  const mutateModuleBlueprints = (
    stageIndex: number,
    updater: (modules: RoadmapModuleBlueprint[]) => RoadmapModuleBlueprint[]
  ) =>
    updateMapDraft((current) => ({
      ...current,
      stages: current.stages.map((stage, index) => {
        if (index !== stageIndex) return stage;
        const moduleBlueprints = updater(stage.moduleBlueprints || []);
        return {
          ...stage,
          moduleBlueprints,
          moduleDirections: moduleBlueprints.map((module) => module.title)
        };
      })
    }));

  const clearPlanningState = () => {
    setCourseDesignDraft(null);
    setCourseDesignStatus("none");
    setCourseDesignAiCallLogId(null);
    setCourseDesignRepair(null);
    setCourseDesignWarning("");
    setCourseDesignProgress("");
    clearMapState();
  };

  const updateDraft = (key: keyof DomainDraft, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    clearPlanningState();
    setTaskBriefConfirmed(false);
  };

  const ensureDomain = async () => {
    if (domainId) return domainId;
    if (!draft.name.trim()) throw new Error("领域名称不能为空。");

    const response = await fetch("/api/domains", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(draft)
    });
    const data = await readJson(response);
    if (!response.ok) throw new Error(data.error || "创建领域失败。");
    setDomainId(data.domain.id);
    router.replace(
      `/learning/domains/new?domainId=${encodeURIComponent(data.domain.id)}`,
      { scroll: false }
    );
    return data.domain.id as string;
  };

  const syncDomainDraft = async (id: string) => {
    const response = await fetch(`/api/domains/${id}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify(draft)
    });
    const data = await readJson(response);
    if (!response.ok) throw new Error(data.error || "同步领域草稿失败。");
    setTaskBriefConfirmed(Boolean(data.domain?.taskBriefConfirmedAt));
  };

  const withBusy = async (busyKey: string, action: () => Promise<void>) => {
    setBusy(busyKey);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (err) {
      if (
        busyKey === "course-design" ||
        busyKey === "course-design-repair"
      ) {
        setCourseDesignProgress(
          "本次课程设计请求未完成；请查看上方错误信息后重试。"
        );
      }
      setError(err instanceof Error ? err.message : "操作失败。");
    } finally {
      setBusy("");
    }
  };

  const saveDomain = () =>
    withBusy("save", async () => {
      const id = await ensureDomain();
      await syncDomainDraft(id);
      setMessage("领域已保存。");
    });

  const generateTaskBrief = () =>
    withBusy("task-brief", async () => {
      const id = await ensureDomain();
      await syncDomainDraft(id);
      const response = await fetch(`/api/domains/${id}/task-brief/ai-draft`, {
        method: "POST"
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "生成任务书失败。");

      setEntryDraft(data.draft || null);
      setMessage(
        data.source === "fallback"
          ? "AI 暂时不可用，已生成一版本地任务书草稿，请检查后继续。"
          : "AI 已生成任务书草稿，请检查后再继续。"
      );
    });

  const optimizeTaskBrief = () =>
    withBusy("optimize-task-brief", async () => {
      const id = await ensureDomain();
      await syncDomainDraft(id);
      const response = await fetch(`/api/domains/${id}/task-brief/ai-draft`, {
        method: "POST"
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "优化任务书失败。");

      setEntryDraft(data.draft || null);
      setMessage("AI 已优化任务书，请确认后再研究课程设计方向。");
    });

  const confirmTaskBrief = () =>
    withBusy("confirm-task-brief", async () => {
      const id = await ensureDomain();
      await syncDomainDraft(id);
      const response = await fetch(`/api/domains/${id}/task-brief`, {
        method: "PATCH"
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "确认任务书失败。");
      setTaskBriefConfirmed(Boolean(data.domain?.taskBriefConfirmedAt));
      clearPlanningState();
      setMessage("任务书已确认，可以研究课程设计方向。");
    });

  const generateCourseDesign = () =>
    withBusy("course-design", async () => {
      if (!taskBriefConfirmed) {
        throw new Error("请先确认任务书，再研究课程设计方向。");
      }
      setCourseDesignProgress(
        "请求已开始：正在等待云端 AI 完成课程研究、来源接地和质量复核；这个过程可能需要几分钟，请不要重复点击。"
      );
      const id = await ensureDomain();
      await syncDomainDraft(id);
      const response = await fetch(`/api/domains/${id}/course-design/ai-draft`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ feedback: courseDesignFeedback })
      });
      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(data.error || "生成课程设计方向失败。");
      }

      setCourseDesignDraft(data.draft);
      setCourseDesignStatus(
        data.draft?.qualityGate?.passed ? "draft" : "incomplete"
      );
      setCourseDesignAiCallLogId(data.aiCallLogId || null);
      setCourseDesignRepair(data.repair || null);
      setCourseDesignWarning(data.warning || "");
      clearMapState();
      setCourseDesignProgress(
        data.source === "ai"
          ? "云端 AI 已返回课程设计方向，结果已载入页面。"
          : "云端 AI 本次未完成，页面已载入未通过质量门的结果；请查看提示后重试。"
      );
      setMessage(
        data.draft?.qualityGate?.passed
          ? data.repair?.succeeded
            ? `AI 初稿未通过质量门，已自动修复 ${data.repair.attempts} 次并通过；它会与完整 Stage 骨架一起确认。`
            : "AI 已生成课程设计方向；它会与完整 Stage 骨架一起确认。"
          : data.source === "fallback"
            ? "云端 AI 课程研究未完成，正式地图保持阻断；请检查 AI 设置后重试。"
            : `AI 已自动修复 ${data.repair?.attempts || 0} 次但仍未通过质量门，请检查缺失项后再次修复或重新生成。`
      );
    });

  const repairCourseDesign = () =>
    withBusy("course-design-repair", async () => {
      setCourseDesignProgress(
        "请求已开始：正在等待云端 AI 完成课程设计修复和质量复核；请不要重复点击。"
      );
      const id = await ensureDomain();
      const response = await fetch(`/api/domains/${id}/course-design/ai-draft`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ mode: "repair" })
      });
      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(data.error || "修复课程设计方向失败。");
      }

      setCourseDesignDraft(data.draft);
      setCourseDesignStatus(
        data.draft?.qualityGate?.passed ? "draft" : "incomplete"
      );
      setCourseDesignAiCallLogId(data.aiCallLogId || null);
      setCourseDesignRepair(data.repair || null);
      setCourseDesignWarning(data.warning || "");
      clearMapState();
      setCourseDesignProgress(
        data.source === "ai"
          ? "云端 AI 已返回修复结果，结果已载入页面。"
          : "云端 AI 本次修复未完成，页面已载入当前结果；请查看提示后重试。"
      );
      setMessage(
        data.draft?.qualityGate?.passed
          ? `AI 已修复课程设计方向并通过质量门，本次使用 ${data.repair?.attempts || 0} 次修复。`
          : data.source === "fallback"
            ? "云端 AI 自动修复未完成，正式地图保持阻断；请检查 AI 设置后重试。"
            : `AI 本次修复 ${data.repair?.attempts || 0} 次后仍未通过质量门，请调整反馈、模型或 Provider 后重试。`
      );
    });

  const reviewSourceRelevance = () =>
    withBusy("ai-relevance", async () => {
      if (!courseDesignDraft) {
        throw new Error("请先生成课程设计方向，再复核来源相关性。");
      }
      const id = await ensureDomain();
      const response = await fetch(
        `/api/domains/${id}/course-design/source-relevance-check`,
        { method: "POST", headers: jsonHeaders }
      );
      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(data.error || "复核来源相关性失败。");
      }
      setCourseDesignDraft(data.draft);
      setMessage(
        data.source === "ai"
          ? "AI 已完成来源相关性复核（仅供参考，不进入质量门）。"
          : data.warning || "AI 来源相关性复核未完成，已保留原结果。"
      );
    });

  const generateMap = () =>
    withBusy("map", async () => {
      if (
        !taskBriefConfirmed ||
        courseDesignStatus !== "draft" ||
        !courseDesignDraft?.qualityGate.passed ||
        !courseDesignAiCallLogId
      ) {
        throw new Error("请先生成通过质量门的课程设计方向。");
      }
      const id = await ensureDomain();
      await syncDomainDraft(id);
      clearMapState();
      setMapProgress("正在生成地图骨架。");

      const skeletonResponse = await fetch(`/api/domains/${id}/map/ai-draft`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          step: "skeleton",
          courseDesign: courseDesignDraft,
          courseDesignAiCallLogId
        })
      });
      const skeletonData = await readJson(skeletonResponse);
      if (!skeletonResponse.ok) {
        if (
          skeletonResponse.status === 422 &&
          skeletonData.draft?.planningVersion === 3
        ) {
          setMapSkeleton(skeletonData.skeleton || null);
          setMapDraft(skeletonData.draft);
          setMapDraftStale(true);
          setMapReviewState("blocked");
          setMapReviewId(skeletonData.qualityReview?.id || null);
          setMapQualityReport(skeletonData.qualityReport || null);
          setMapProgress("AI 修复次数已耗尽；请查看严重问题后编辑并重新复审。");
        }
        throw new Error(skeletonData.error || "生成地图骨架失败。");
      }

      const skeleton = skeletonData.skeleton as RoadmapSkeleton;
      if (!skeleton?.stages?.length) {
        throw new Error("地图骨架没有可生成的阶段。");
      }
      setMapSkeleton(skeleton);
      const generatedForCourseDesignAiCallLogId =
        skeletonData.courseDesignAiCallLogId as string;
      if (
        !generatedForCourseDesignAiCallLogId ||
        generatedForCourseDesignAiCallLogId !== courseDesignAiCallLogId
      ) {
        throw new Error("课程设计方向已更新，请刷新后重新生成领域地图。");
      }

      const plannedDraft = skeletonData.draft as RoadmapDraft;
      if (plannedDraft?.planningVersion !== 3) {
        throw new Error("服务端没有返回可复审的分层路线草稿。");
      }
      setMapDraft(plannedDraft);
      setMapDraftStale(false);
      setMapReviewState(skeletonData.reviewState || "passed");
      setMapReviewId(skeletonData.qualityReview?.id || null);
      setMapQualityReport(skeletonData.qualityReport || null);
      await refreshWorkflow(id);

      setMapProgress(`已生成完整 Stage 骨架：${skeleton.stages.length} 个阶段。`);
      setMessage(
        skeletonData.reviewState === "unavailable"
          ? "Stage 骨架已保存，但 AI 语义复审暂不可用。你可以重试，或人工核对后明确确认风险。"
          : "AI 已完成独立路线审查。请复核 Stage、Module 方向、关键问题及可检查结果；详细节点稍后按需展开。"
      );
    });

  const reviewMap = () =>
    withBusy("review-map", async () => {
      if (!mapDraft || !courseDesignAiCallLogId) {
        throw new Error("没有可复审的分层路线草稿。");
      }
      const id = await ensureDomain();
      const saveResponse = await fetch(`/api/domains/${id}/map`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({
          draft: mapDraft,
          courseDesignAiCallLogId
        })
      });
      const saveData = await readJson(saveResponse);
      if (!saveResponse.ok) {
        throw new Error(saveData.error || "保存待复审路线失败。");
      }
      const reviewResponse = await fetch(`/api/domains/${id}/map/reviews`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ scope: "skeleton" })
      });
      const reviewData = await readJson(reviewResponse);
      if (!reviewResponse.ok) {
        if (reviewData.draft?.planningVersion === 3) {
          setMapDraft(reviewData.draft);
          setMapSkeleton(restoreMapSkeleton(reviewData.draft));
        }
        setMapReviewState(
          reviewResponse.status === 422 ? "blocked" : "stale"
        );
        setMapReviewId(reviewData.qualityReview?.id || null);
        setMapQualityReport(reviewData.qualityReport || null);
        throw new Error(reviewData.error || "路线质量复审失败。");
      }
      const reviewedDraft = reviewData.draft as RoadmapDraft;
      setMapDraft(reviewedDraft);
      setMapSkeleton(restoreMapSkeleton(reviewedDraft));
      setMapDraftStale(false);
      setMapReviewState(reviewData.reviewState || "passed");
      setMapReviewId(reviewData.qualityReview?.id || null);
      setMapQualityReport(reviewData.qualityReport || null);
      await refreshWorkflow(id);
      setMessage(
        reviewData.reviewState === "unavailable"
          ? "AI 语义复审暂不可用。你可以重试，或人工核对后明确确认风险。"
          : "路线质量复审已通过；如继续编辑，必须再次复审。"
      );
    });

  const resolveMapReview = () =>
    withBusy("resolve-map-review", async () => {
      if (
        !domainId ||
        !mapReviewId ||
        !["blocked", "unavailable"].includes(mapReviewState || "")
      ) {
        throw new Error("当前没有可裁决的路线复审。");
      }
      const response = await fetch(
        `/api/domains/${encodeURIComponent(domainId)}/map/review-decisions`,
        {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({
            reviewId: mapReviewId,
            decision:
              mapReviewState === "unavailable"
                ? "acknowledge_unavailable"
                : "dismiss_semantic",
            rationale: mapReviewRationale
          })
        }
      );
      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(data.error || "记录路线复审裁决失败。");
      }
      setMapReviewState("resolved");
      setMapDraftStale(false);
      setMapReviewRationale("");
      await refreshWorkflow(domainId);
      setMessage("已记录你的裁决理由；该回执只对当前草稿内容和版本有效。");
    });

  const confirmMap = () =>
    withBusy("confirm-map", async () => {
      if (
        !taskBriefConfirmed ||
        courseDesignStatus !== "draft" ||
        !courseDesignDraft?.qualityGate.passed ||
        !courseDesignAiCallLogId ||
        !mapDraft ||
        mapDraftStale ||
        !["passed", "resolved"].includes(mapReviewState || "") ||
        (workflow && !workflow.allowedActions.includes("CONFIRM_MAP"))
      ) {
        throw new Error("请先生成课程设计方向与完整 Stage 骨架。");
      }
      const id = await ensureDomain();
      await syncDomainDraft(id);
      const saveResponse = await fetch(`/api/domains/${id}/map`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({
          draft: mapDraft,
          courseDesignAiCallLogId
        })
      });
      const saveData = await readJson(saveResponse);
      if (!saveResponse.ok) {
        throw new Error(saveData.error || "保存地图骨架草稿失败。");
      }
      const response = await fetch(`/api/domains/${id}/map`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          draft: mapDraft,
          courseDesign: courseDesignDraft,
          courseDesignAiCallLogId,
          reason: "用户在创建流程中确认了当前任务书与领域地图。"
        })
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "确认地图失败。");

      setMessage("领域地图已确认，正在进入学习路线。");
      router.push(`/learning/domains/${id}`);
    });

  const visibleMapStages = mapDraft?.stages || [];

  return (
    <AppShell>
      <PageHeader
        kicker="新学习领域"
        title="创建可确认的学习路线"
        description="先确认任务书，再研究课程设计方向，最后分阶段生成地图。地图生成过程中每次请求只处理一个小阶段，避免长请求丢失结果。"
        actions={
          <><Link className="workshop-button-secondary px-3 py-2 text-sm" href="/">
            返回首页
          </Link>{domainId&&<Link className="workshop-button-secondary px-3 py-2 text-sm" href={`/learning/domains/${encodeURIComponent(domainId)}/ai-logs`}>查看 AI 生成记录</Link>}</>
        }
      />

      {message ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <SectionPanel strong>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill>1. 领域草稿</StatusPill>
          {domainId ? <StatusPill>已创建</StatusPill> : null}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label="领域名称"
            value={draft.name}
            onChange={(value) => updateDraft("name", value)}
            placeholder="例如：英语口语表达"
            disabled={Boolean(busy)}
          />
          <Field
            label="当前水平"
            value={draft.currentLevel}
            onChange={(value) => updateDraft("currentLevel", value)}
            placeholder="你已经会什么，卡在哪里"
            disabled={Boolean(busy)}
          />
          <Field
            label="学习目标"
            value={draft.goal}
            onChange={(value) => updateDraft("goal", value)}
            placeholder="希望能完成什么可检查的输出"
            disabled={Boolean(busy)}
          />
          <Field
            label="输出类型"
            value={draft.outputType}
            onChange={(value) => updateDraft("outputType", value)}
            placeholder="项目、作品、考试、面试、日常应用等"
            disabled={Boolean(busy)}
          />
          <Field
            label="输出目标"
            value={draft.outputTarget}
            onChange={(value) => updateDraft("outputTarget", value)}
            placeholder="最终交付物或验证方式"
            disabled={Boolean(busy)}
          />
          <Field
            label="深度"
            value={draft.depth}
            onChange={(value) => updateDraft("depth", value)}
            placeholder="入门、可独立完成、系统掌握等"
            disabled={Boolean(busy)}
          />
        </div>
        <TextArea
          label="背景描述"
          value={draft.description}
          onChange={(value) => updateDraft("description", value)}
          placeholder="写下已学内容、已有材料、时间约束或困难点"
          disabled={Boolean(busy)}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <TextArea
            label="包含范围"
            value={draft.scope}
            onChange={(value) => updateDraft("scope", value)}
            placeholder="这次一定要覆盖的内容"
            disabled={Boolean(busy)}
          />
          <TextArea
            label="排除范围"
            value={draft.excludedScope}
            onChange={(value) => updateDraft("excludedScope", value)}
            placeholder="暂时不学或不展开的内容"
            disabled={Boolean(busy)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton disabled={Boolean(busy)} onClick={saveDomain}>
            {busy === "save" ? "保存中..." : "保存领域"}
          </ActionButton>
          <ActionButton
            disabled={Boolean(busy)}
            onClick={generateTaskBrief}
            variant="secondary"
          >
            {busy === "task-brief" ? "生成中..." : "AI 提供入门导引与任务书"}
          </ActionButton>
        </div>
      </SectionPanel>

      {entryDraft && <SectionPanel><h2>领域入门导引</h2>{entryDraft.guide && <><p>{entryDraft.guide.overview}</p><ul>{entryDraft.guide.representativeQuestions.map((q,i)=><li key={i}>{q}</li>)}</ul><p>建议目标：{entryDraft.guide.suggestions.goal}</p><p>建议范围：{entryDraft.guide.suggestions.scope}</p><p>建议成果：{entryDraft.guide.suggestions.outputTarget}</p><ul>{entryDraft.guide.assumptions.map((a,i)=><li key={i}>待确认：{a}</li>)}</ul></>}<p className="whitespace-pre-wrap">{entryDraft.taskBrief}</p><ActionButton disabled={Boolean(busy)} onClick={()=>{setDraft(current=>({...current,...entryDraft.guide?.suggestions,taskBrief:entryDraft.taskBrief}));setTaskBriefConfirmed(false);clearPlanningState();setMessage("已采纳为可编辑草稿，请检查后明确确认任务书。");}}>采纳建议并编辑</ActionButton></SectionPanel>}
      <SectionPanel>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill>2. 任务书</StatusPill>
          {taskBriefConfirmed ? <StatusPill>已确认</StatusPill> : null}
        </div>
        <TextArea
          label="任务书草稿"
          value={draft.taskBrief}
          onChange={(value) => updateDraft("taskBrief", value)}
          placeholder="确认学习目标、范围边界、预期输出和评估方式"
          rows={9}
          disabled={Boolean(busy)}
        />
        <div className="flex flex-wrap gap-2">
          <ActionButton
            disabled={Boolean(busy) || !draft.taskBrief.trim()}
            onClick={confirmTaskBrief}
          >
            {busy === "confirm-task-brief" ? "确认中..." : "确认任务书"}
          </ActionButton>
          <ActionButton
            disabled={Boolean(busy)}
            onClick={optimizeTaskBrief}
            variant="secondary"
          >
            {busy === "optimize-task-brief" ? "优化中..." : "AI 优化任务书"}
          </ActionButton>
        </div>
      </SectionPanel>

      <SectionPanel>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill>3. 课程设计方向</StatusPill>
          {courseDesignDraft?.qualityGate.passed ? (
            <StatusPill>等待与 Stage 骨架一起确认</StatusPill>
          ) : null}
          {courseDesignStatus === "needs_review" ? (
            <StatusPill>规划输入已变化，需重新研究</StatusPill>
          ) : null}
        </div>
        <TextArea
          label="补充反馈"
          value={courseDesignFeedback}
          onChange={setCourseDesignFeedback}
          placeholder="如果要重新研究课程设计方向，写下你希望调整的侧重点"
          rows={4}
          disabled={Boolean(busy)}
        />
        <div className="flex flex-wrap gap-2">
          <ActionButton
            disabled={Boolean(busy) || !taskBriefConfirmed}
            title={
              taskBriefConfirmed
                ? "调用云端 AI 研究课程设计方向"
                : "请先确认第 2 步任务书；修改规划输入后也需要重新确认"
            }
            onClick={generateCourseDesign}
          >
            {busy === "course-design"
              ? "研究并自动修复中..."
              : "AI 生成课程设计方向"}
          </ActionButton>
          {courseDesignDraft && !courseDesignDraft.qualityGate.passed ? (
            <ActionButton
              disabled={Boolean(busy) || !taskBriefConfirmed}
              onClick={repairCourseDesign}
              variant="secondary"
            >
              {busy === "course-design-repair"
                ? "自动修复中..."
                : "AI 再次自动修复"}
            </ActionButton>
          ) : null}
        </div>
        {!taskBriefConfirmed ? (
          <p className="mt-2 text-sm text-amber-800">
            请先在第 2 步确认任务书。只要修改领域目标、范围或其他规划输入，就需要重新确认后才能调用云端 AI。
          </p>
        ) : null}
        {courseDesignProgress ? (
          <p
            aria-live="polite"
            className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900"
            role="status"
          >
            {courseDesignProgress}
          </p>
        ) : null}

        {courseDesignDraft ? (
          <div className="space-y-4 rounded-lg border border-[color:var(--border)] bg-white/70 p-4">
            {courseDesignDraft.knowledgeBoundary && <div>
              <h3>课程起点与新增内容</h3>
              <p>默认基础：{courseDesignDraft.knowledgeBoundary.assumedKnowledge.join("；") || "未预设基础"}。</p>
              <p>本课程新增：{courseDesignDraft.knowledgeBoundary.newKnowledge.join("；")}。</p>
              <p>基础默认直接使用，需要时可在学习中请求补讲。这是课程起点假设，不是能力评定；如不符合你的情况，请在上方修改意见中说明，重新生成后随课程方向一起确认。</p>
            </div>}
            <CourseDesignBlock
              title="理论骨架"
              value={courseDesignDraft.globalExplanation.theorySkeleton}
            />
            <CourseDesignBlock
              title="来源依据"
              value={courseDesignDraft.globalExplanation.sourceBasis}
            />
            <CourseDesignBlock
              title="优化理由"
              value={courseDesignDraft.globalExplanation.optimizationRationale}
            />
            <CourseDesignBlock
              title="风险与验证"
              value={courseDesignDraft.globalExplanation.risksAndValidation}
            />
            <div>
              <h3 className="text-sm font-semibold text-[color:var(--ink)]">
                参考来源
              </h3>
              <ul className="mt-2 space-y-2 text-sm text-[color:var(--muted-ink)]">
                {courseDesignDraft.sources.filter((source) => isSafeExternalUrl(source.url)).map((source) => (
                  <li key={`${source.url}-${source.title}`}>
                    <a className="font-medium underline" href={source.url} target="_blank" rel="noreferrer">
                      {source.title || source.url}
                    </a>
                    <span>：{source.reason}</span>
                    {source.grounding ? (
                      <span
                        className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                          source.grounding.ok
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {source.grounding.ok
                          ? "已核验可达"
                          : "服务器抓取不可达"}
                      </span>
                    ) : null}
                    {source.grounding?.relevance?.lowRelevance ? (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                        相关性偏低（仅供参考）
                      </span>
                    ) : null}
                    {source.grounding?.aiRelevance ? (
                      <span
                        className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                          source.grounding.aiRelevance.lowRelevance
                            ? "bg-amber-100 text-amber-900"
                            : "bg-sky-50 text-sky-800"
                        }`}
                        title={source.grounding.aiRelevance.reason}
                      >
                        {source.grounding.aiRelevance.lowRelevance
                          ? "AI 判定相关性偏低"
                          : `AI 相关性 ${Math.round(
                              source.grounding.aiRelevance.score * 100
                            )}%`}
                      </span>
                    ) : null}
                    {source.grounding?.aiRelevance?.reason ? (
                      <div className="mt-1 text-xs text-[color:var(--muted-ink)]">
                        AI 复核：{source.grounding.aiRelevance.reason}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton
                  disabled={Boolean(busy)}
                  onClick={reviewSourceRelevance}
                  variant="secondary"
                >
                  {busy === "ai-relevance"
                    ? "AI 复核中..."
                    : "用 AI 复核来源相关性"}
                </ActionButton>
              </div>
            </div>
            {courseDesignDraft.qualityReport ? (
              <div className="rounded-lg border border-[color:var(--border)] bg-white/80 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-[color:var(--ink)]">
                    路线质量报告（AI 批判轮，仅供参考）
                  </h3>
                  {courseDesignDraft.qualityReport.significantIssues ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                      仍有显著问题
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
                      无显著问题
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-[color:var(--muted-ink)]">
                  {courseDesignDraft.qualityReport.summary}
                </p>
                <ul className="mt-2 space-y-1 text-sm text-[color:var(--muted-ink)]">
                  {courseDesignDraft.qualityReport.dimensions.map((dimension) => (
                    <li key={dimension.key} className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium text-[color:var(--ink)]">
                        {qualityDimensionLabels[dimension.key] || dimension.key}
                      </span>
                      <span>{dimension.score}/5</span>
                      <span>— {dimension.note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {courseDesignDraft.keyTradeoffs.length ? (
              <div className="flex flex-wrap gap-2">
                {courseDesignDraft.keyTradeoffs.map((tradeoff) => (
                  <StatusPill key={tradeoff}>{tradeoff}</StatusPill>
                ))}
              </div>
            ) : null}
            {!courseDesignDraft.qualityGate.passed ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-semibold">课程设计仍未通过质量门</p>
                <p className="mt-1">
                  缺失或无效项：
                  {courseDesignDraft.qualityGate.missing.join("、") || "未知"}
                </p>
                <p className="mt-1">
                  已累计自动修复 {courseDesignRepair?.totalAttempts || 0} 次；正式地图仍保持阻断。
                </p>
                {courseDesignRepair?.error ? (
                  <p className="mt-1">最近错误：{courseDesignRepair.error}</p>
                ) : null}
                {courseDesignWarning ? (
                  <p className="mt-1">服务提示：{courseDesignWarning}</p>
                ) : null}
                <Link
                  className="mt-2 inline-block font-medium underline"
                  href="/settings/ai"
                >
                  检查或切换 AI 设置
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </SectionPanel>

      <SectionPanel>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill>4. 领域地图</StatusPill>
          {mapDraft ? (
            <StatusPill>
              {mapReviewState === "passed" || mapReviewState === "resolved"
                ? mapReviewState === "resolved"
                  ? "已人工裁决当前复审"
                  : "质量复审已通过"
                : mapReviewState === "blocked"
                  ? "质量复审未通过"
                  : mapReviewState === "unavailable"
                    ? "AI 复审暂不可用"
                  : mapReviewState === "legacy"
                    ? "旧版草稿，必须重生成"
                    : "已编辑，等待复审"}
            </StatusPill>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            disabled={
              Boolean(busy) ||
              !taskBriefConfirmed ||
              courseDesignStatus !== "draft" ||
              !courseDesignDraft?.qualityGate.passed ||
              !courseDesignAiCallLogId
            }
            onClick={generateMap}
          >
            {busy === "map" ? "生成骨架中..." : "AI 生成完整 Stage 骨架"}
          </ActionButton>
          <ActionButton
            disabled={
              Boolean(busy) ||
              !mapDraft ||
              mapReviewState === "legacy" ||
              !courseDesignAiCallLogId
            }
            onClick={reviewMap}
            variant="secondary"
          >
            {busy === "review-map" ? "复审中..." : "保存并复审路线质量"}
          </ActionButton>
          <ActionButton
            disabled={
              Boolean(busy) ||
              !taskBriefConfirmed ||
              courseDesignStatus !== "draft" ||
              !courseDesignDraft?.qualityGate.passed ||
              !courseDesignAiCallLogId ||
              !mapDraft ||
              mapDraftStale ||
              !["passed", "resolved"].includes(mapReviewState || "") ||
              Boolean(
                workflow && !workflow.allowedActions.includes("CONFIRM_MAP")
              )
            }
            onClick={confirmMap}
            variant="secondary"
          >
            {busy === "confirm-map" ? "确认中..." : "确认地图并进入学习"}
          </ActionButton>
        </div>
        {mapProgress ? (
          <p className="text-sm text-[color:var(--muted-ink)]">{mapProgress}</p>
        ) : null}
        {mapQualityReport ? (
          <div
            className={`rounded-lg border p-3 text-sm ${
              mapQualityReport.status === "passed"
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-amber-300 bg-amber-50 text-amber-900"
            }`}
          >
            <p className="font-medium">路线质量复审：{mapQualityReport.summary}</p>
            {mapQualityReport.blockingIssues.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {mapQualityReport.blockingIssues.map((issue, index) => (
                  <li key={`${issue.code}-${issue.targetKey || index}`}>
                    {issue.message}
                    {issue.suggestion ? `；建议：${issue.suggestion}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {mapReviewId &&
        (mapReviewState === "blocked" || mapReviewState === "unavailable") ? (
          <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-medium">
              {mapReviewState === "unavailable"
                ? "复审服务不可用：人工核对后可明确接受本次缺失风险。"
                : "语义问题修复已耗尽：可以继续编辑或重生成，也可说明理由后裁决。"}
            </p>
            <textarea
              className="w-full rounded border border-amber-300 bg-white px-3 py-2"
              rows={3}
              value={mapReviewRationale}
              onChange={(event) => setMapReviewRationale(event.target.value)}
              placeholder="说明你核对了什么，以及为什么接受当前风险（至少 8 个字符）"
            />
            <ActionButton
              variant="secondary"
              disabled={Boolean(busy) || mapReviewRationale.trim().length < 8}
              onClick={resolveMapReview}
            >
              {busy === "resolve-map-review"
                ? "记录中..."
                : mapReviewState === "unavailable"
                  ? "确认缺少 AI 复审并继续"
                  : "驳回该语义发现并继续"}
            </ActionButton>
          </div>
        ) : null}
        {workflow?.blockers.length ? (
          <p className="text-xs text-[color:var(--muted-ink)]">
            当前服务端步骤：{workflow.blockers.join("；")}
          </p>
        ) : null}

        {mapSkeleton ? (
          <div className="space-y-3 rounded-lg border border-dashed border-[color:var(--border)] p-4">
            <h3 className="text-sm font-semibold text-[color:var(--ink)]">
              地图骨架：{mapSkeleton.title}
            </h3>
            {mapSkeleton.determinismWarnings &&
            mapSkeleton.determinismWarnings.length > 0 ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                <p className="font-medium">骨架确定性提示（不阻断，建议确认前复核）：</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {mapSkeleton.determinismWarnings.map((warning, index) => (
                    <li key={`${warning.code}-${index}`}>{warning.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="grid gap-2 md:grid-cols-2">
              {mapSkeleton.stages.map((stage, index) => (
                <div
                  className="rounded-lg border border-[color:var(--border)] bg-white/70 p-3"
                  key={`${stage.title}-${index}`}
                >
                  <div className="text-sm font-medium text-[color:var(--ink)]">
                    {index + 1}. {stage.title}
                  </div>
                  {stage.goal ? (
                    <p className="mt-1 text-xs text-[color:var(--muted-ink)]">
                      {stage.goal}
                    </p>
                  ) : null}
                  <CurriculumCoverage goals={mapSkeleton.learningGoals} stage={stage}/>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {stage.coreTopics.map((topic) => (
                      <StatusPill key={topic}>{topic}</StatusPill>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {visibleMapStages.length ? (
          <fieldset
            className="space-y-3 border-0 p-0"
            disabled={Boolean(busy) || mapReviewState === "legacy"}
          >
            {visibleMapStages.map((stage, stageIndex) => (
              <div
                className="rounded-lg border border-[color:var(--border)] bg-white/80 p-4"
                key={`${stage.title}-${stageIndex}`}
              >
                <label className="block text-xs text-[color:var(--muted-ink)]">
                  Stage {stageIndex + 1} 标题
                  <input
                    className="mt-1 w-full rounded border border-[color:var(--border)] px-2 py-1 text-sm font-semibold text-[color:var(--ink)]"
                    disabled={mapReviewState === "legacy"}
                    value={stage.title}
                    onChange={(event) =>
                      updateMapDraft((current) => ({
                        ...current,
                        stages: current.stages.map((entry, index) =>
                          index === stageIndex
                            ? { ...entry, title: event.target.value }
                            : entry
                        )
                      }))
                    }
                  />
                </label>
                <CurriculumCoverage goals={mapDraft?.learningGoals} stage={stage} onContentQuestionChange={(key,update)=>updateMapDraft(current=>({...current,learningGoals:current.learningGoals?.map(goal=>({...goal,contentQuestions:goal.contentQuestions?.map(q=>q.key===key?{...q,...update}:q)}))}))}/>
                <textarea
                  className="mt-2 w-full rounded border border-[color:var(--border)] px-2 py-1 text-sm text-[color:var(--muted-ink)]"
                  disabled={mapReviewState === "legacy"}
                  rows={2}
                  value={stage.goal || ""}
                  onChange={(event) =>
                    updateMapDraft((current) => ({
                      ...current,
                      stages: current.stages.map((entry, index) =>
                        index === stageIndex
                          ? { ...entry, goal: event.target.value }
                          : entry
                      )
                    }))
                  }
                  placeholder="Stage 可检查目标"
                />
                <input
                  className="mt-2 w-full rounded border border-[color:var(--border)] px-2 py-1 text-xs"
                  disabled={mapReviewState === "legacy"}
                  value={stage.prerequisiteStageKeys.join(", ")}
                  onChange={(event) => {
                    const prerequisiteStageKeys = event.target.value
                      .split(",")
                      .map((key) => key.trim())
                      .filter(Boolean);
                    updateMapDraft((current) => ({
                      ...current,
                      stages: current.stages.map((entry, index) =>
                        index === stageIndex
                          ? { ...entry, prerequisiteStageKeys }
                          : entry
                      )
                    }));
                  }}
                  placeholder="前置 Stage key，以逗号分隔；可留空"
                />
                <div className="mt-1 text-xs text-[color:var(--muted-ink)]">
                  key: {stage.key}
                </div>
                <div className="mt-4 space-y-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--soft-panel)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-[color:var(--ink)]">
                        Module 方向与关键问题
                      </h4>
                      <p className="text-xs text-[color:var(--muted-ink)]">
                        数量不设配额；每个问题应对应一个独立、可检查的学习结果。
                      </p>
                    </div>
                    <button
                      className="rounded border border-[color:var(--border)] bg-white px-2 py-1 text-xs"
                      disabled={mapReviewState === "legacy"}
                      onClick={() =>
                        mutateModuleBlueprints(stageIndex, (modules) => [
                          ...modules,
                          {
                            key: newStableKey("module"),
                            title: "新 Module 方向",
                            goal: "说明这个方向要形成的能力。",
                            keyQuestions: [
                              {
                                key: newStableKey("question"),
                                question: "需要解决的关键问题是什么？",
                                checkableOutcome: "写下可观察、可判断的结果。"
                              }
                            ]
                          }
                        ])
                      }
                      type="button"
                    >
                      添加 Module
                    </button>
                  </div>
                  {(stage.moduleBlueprints || []).map((module, moduleIndex) => (
                    <div
                      className="space-y-2 rounded-lg border border-[color:var(--border)] bg-white p-3"
                      key={module.key}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--muted-ink)]">
                        <span>稳定 key：{module.key}</span>
                        <div className="flex gap-1">
                          <button
                            className="rounded border px-2 py-1"
                            disabled={moduleIndex === 0 || mapReviewState === "legacy"}
                            onClick={() =>
                              mutateModuleBlueprints(stageIndex, (modules) => {
                                const next = [...modules];
                                [next[moduleIndex - 1], next[moduleIndex]] = [
                                  next[moduleIndex],
                                  next[moduleIndex - 1]
                                ];
                                return next;
                              })
                            }
                            type="button"
                          >
                            上移
                          </button>
                          <button
                            className="rounded border px-2 py-1"
                            disabled={
                              moduleIndex === (stage.moduleBlueprints || []).length - 1 ||
                              mapReviewState === "legacy"
                            }
                            onClick={() =>
                              mutateModuleBlueprints(stageIndex, (modules) => {
                                const next = [...modules];
                                [next[moduleIndex], next[moduleIndex + 1]] = [
                                  next[moduleIndex + 1],
                                  next[moduleIndex]
                                ];
                                return next;
                              })
                            }
                            type="button"
                          >
                            下移
                          </button>
                          <button
                            className="rounded border border-red-200 px-2 py-1 text-red-700"
                            disabled={mapReviewState === "legacy"}
                            onClick={() =>
                              mutateModuleBlueprints(stageIndex, (modules) =>
                                modules.filter((_, index) => index !== moduleIndex)
                              )
                            }
                            type="button"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                      <input
                        className="w-full rounded border border-[color:var(--border)] px-2 py-1 text-sm font-medium"
                        disabled={mapReviewState === "legacy"}
                        value={module.title}
                        onChange={(event) => {
                          const title = event.target.value;
                          mutateModuleBlueprints(stageIndex, (modules) =>
                            modules.map((entry, index) =>
                              index === moduleIndex ? { ...entry, title } : entry
                            )
                          );
                        }}
                      />
                      <textarea
                        className="w-full rounded border border-[color:var(--border)] px-2 py-1 text-xs"
                        disabled={mapReviewState === "legacy"}
                        rows={2}
                        value={module.goal}
                        onChange={(event) => {
                          const goal = event.target.value;
                          mutateModuleBlueprints(stageIndex, (modules) =>
                            modules.map((entry, index) =>
                              index === moduleIndex ? { ...entry, goal } : entry
                            )
                          );
                        }}
                        placeholder="本模块的教学内容范围"
                      />
                      <div className="space-y-2">
                        {module.keyQuestions.map((question, questionIndex) => (
                          <div
                            className="rounded border border-dashed border-[color:var(--border)] p-2"
                            key={question.key}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--muted-ink)]">
                              <span>问题 key：{question.key}</span>
                              <div className="flex gap-1">
                                <button
                                  className="rounded border px-2 py-1"
                                  disabled={questionIndex === 0 || mapReviewState === "legacy"}
                                  onClick={() =>
                                    mutateModuleBlueprints(stageIndex, (modules) =>
                                      modules.map((entry, index) => {
                                        if (index !== moduleIndex) return entry;
                                        const keyQuestions = [...entry.keyQuestions];
                                        [
                                          keyQuestions[questionIndex - 1],
                                          keyQuestions[questionIndex]
                                        ] = [
                                          keyQuestions[questionIndex],
                                          keyQuestions[questionIndex - 1]
                                        ];
                                        return { ...entry, keyQuestions };
                                      })
                                    )
                                  }
                                  type="button"
                                >
                                  上移
                                </button>
                                <button
                                  className="rounded border px-2 py-1"
                                  disabled={
                                    questionIndex === module.keyQuestions.length - 1 ||
                                    mapReviewState === "legacy"
                                  }
                                  onClick={() =>
                                    mutateModuleBlueprints(stageIndex, (modules) =>
                                      modules.map((entry, index) => {
                                        if (index !== moduleIndex) return entry;
                                        const keyQuestions = [...entry.keyQuestions];
                                        [
                                          keyQuestions[questionIndex],
                                          keyQuestions[questionIndex + 1]
                                        ] = [
                                          keyQuestions[questionIndex + 1],
                                          keyQuestions[questionIndex]
                                        ];
                                        return { ...entry, keyQuestions };
                                      })
                                    )
                                  }
                                  type="button"
                                >
                                  下移
                                </button>
                                <button
                                  className="rounded border border-red-200 px-2 py-1 text-red-700"
                                  disabled={mapReviewState === "legacy"}
                                  onClick={() =>
                                    mutateModuleBlueprints(stageIndex, (modules) =>
                                      modules.map((entry, index) =>
                                        index === moduleIndex
                                          ? {
                                              ...entry,
                                              keyQuestions: entry.keyQuestions.filter(
                                                (_, itemIndex) =>
                                                  itemIndex !== questionIndex
                                              )
                                            }
                                          : entry
                                      )
                                    )
                                  }
                                  type="button"
                                >
                                  删除
                                </button>
                              </div>
                            </div>
                            {mapDraft?.learningGoals?.some(goal=>goal.contentQuestions?.length)?<label className="block">安排的课程内容问题<select className="w-full rounded border p-2" value={question.contentQuestionKey || ""} disabled={mapReviewState==="legacy"} onChange={e=>{const contentQuestionKey=e.target.value;mutateModuleBlueprints(stageIndex,modules=>modules.map((entry,index)=>index===moduleIndex?{...entry,keyQuestions:entry.keyQuestions.map((q,i)=>i===questionIndex?{...q,contentQuestionKey}:q)}:entry));}}><option value="">请选择具体内容问题</option>{mapDraft.learningGoals.flatMap(goal=>(goal.contentQuestions || []).map(q=><option key={q.key} value={q.key}>{q.question}</option>))}</select></label>:null}
                            <textarea
                              className="mt-2 w-full rounded border border-[color:var(--border)] px-2 py-1 text-sm"
                              disabled={mapReviewState === "legacy"}
                              rows={2}
                              value={question.contentQuestionKey ? mapDraft?.learningGoals?.flatMap(g=>g.contentQuestions || []).find(q=>q.key===question.contentQuestionKey)?.question || "" : question.question}
                              readOnly={Boolean(question.contentQuestionKey)}
                              onChange={(event) => {
                                const questionText = event.target.value;
                                mutateModuleBlueprints(stageIndex, (modules) =>
                                  modules.map((entry, index) =>
                                    index === moduleIndex
                                      ? {
                                          ...entry,
                                          keyQuestions: entry.keyQuestions.map(
                                            (item, itemIndex) =>
                                              itemIndex === questionIndex
                                                ? { ...item, question: questionText }
                                                : item
                                          )
                                        }
                                      : entry
                                  )
                                );
                              }}
                              placeholder="原子化关键问题"
                            />
                            <textarea
                              className="mt-2 w-full rounded border border-[color:var(--border)] px-2 py-1 text-xs"
                              disabled={mapReviewState === "legacy"}
                              rows={2}
                              value={question.contentQuestionKey ? mapDraft?.learningGoals?.flatMap(g=>g.contentQuestions || []).find(q=>q.key===question.contentQuestionKey)?.contentRequirements.join("；") || "" : question.checkableOutcome}
                              readOnly={Boolean(question.contentQuestionKey)}
                              onChange={(event) => {
                                const checkableOutcome = event.target.value;
                                mutateModuleBlueprints(stageIndex, (modules) =>
                                  modules.map((entry, index) =>
                                    index === moduleIndex
                                      ? {
                                          ...entry,
                                          keyQuestions: entry.keyQuestions.map(
                                            (item, itemIndex) =>
                                              itemIndex === questionIndex
                                                ? { ...item, checkableOutcome }
                                                : item
                                          )
                                        }
                                      : entry
                                  )
                                );
                              }}
                              placeholder="课程材料需要提供的说明"
                            />
                          </div>
                        ))}
                        <button
                          className="rounded border border-[color:var(--border)] bg-white px-2 py-1 text-xs"
                          disabled={mapReviewState === "legacy"}
                          onClick={() =>
                            mutateModuleBlueprints(stageIndex, (modules) =>
                              modules.map((entry, index) =>
                                index === moduleIndex
                                  ? {
                                      ...entry,
                                      keyQuestions: [
                                        ...entry.keyQuestions,
                                        {
                                          key: newStableKey("question"),
                                          ...(mapDraft?.learningGoals?.some(goal=>goal.contentQuestions?.length)?{contentQuestionKey:mapDraft.learningGoals.flatMap(goal=>goal.contentQuestions || [])[0]?.key}:{}),
                                          question: "新的关键问题是什么？",
                                          checkableOutcome: "材料需要提供哪些解释、示范和边界？"
                                        }
                                      ]
                                    }
                                  : entry
                              )
                            )
                          }
                          type="button"
                        >
                          添加关键问题
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {stage.modules.map((module, moduleIndex) => (
                    <div
                      className="rounded-lg bg-[color:var(--soft-panel)] p-3"
                      key={`${module.title}-${moduleIndex}`}
                    >
                      <div className="text-sm font-medium text-[color:var(--ink)]">
                        {module.title}
                      </div>
                      {module.goal ? (
                        <p className="mt-1 text-xs text-[color:var(--muted-ink)]">
                          {module.goal}
                        </p>
                      ) : null}
                      <ul className="mt-2 space-y-1 text-xs text-[color:var(--muted-ink)]">
                        {module.items.map((item, itemIndex) => (
                          <li key={`${item.title}-${itemIndex}`}>{item.title}{item.concept?.learningUnit && <details>
                            <summary>本课分工</summary>
                            <p>新增知识：{item.concept.learningUnit.newKnowledge}</p>
                            <p>教学任务：{item.concept.learningUnit.teachingTasks.join("；")}</p>
                            <p>使用的基础：{item.concept.learningUnit.assumedKnowledge.join("；") || "无额外假设"}</p>
                            <p>代表例子：{item.concept.learningUnit.example}</p>
                            {item.concept.learningUnit.references.map(ref=><p key={ref.key}>引用 {mapDraft?.stages.flatMap(s=>s.modules.flatMap(m=>m.items)).find(n=>n.key===ref.key)?.title || ref.key}：{ref.purpose}</p>)}
                          </details>}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>
        ) : null}
      </SectionPanel>
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled = false
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[color:var(--ink)]">{label}</span>
      <input
        className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 5,
  disabled = false
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[color:var(--ink)]">{label}</span>
      <textarea
        className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[color:var(--accent)]"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        value={value}
        disabled={disabled}
      />
    </label>
  );
}

function CourseDesignBlock({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-[color:var(--ink)]">{title}</h3>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-[color:var(--muted-ink)]">
        {value}
      </p>
    </div>
  );
}
