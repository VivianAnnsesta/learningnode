"use client";

import Link from "next/link";
import { CurriculumCoverage } from "../../../components/CurriculumCoverage";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { recoverStageDraft, replaceEditedStage } from "../stageDraftEditing";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  type Edge,
  type Node
} from "reactflow";
import "reactflow/dist/style.css";
import {
  getLearningNodeStatusLabel,
  getLearningNodeTypeLabel
} from "../../../../lib/learning/types";
import {
  ActionButton,
  AppShell,
  PageHeader,
  SectionPanel,
  StatusPill
} from "../../../components/ui";

type DomainMapNode = {
  concept?: import("../../../../lib/learning/roadmapPlanningTypes").ConceptProfile;
  planningQuestionKeys?: string[];
  id: string;
  key: string;
  unitId: string;
  unitTitle: string;
  moduleTitle: string;
  title: string;
  type: string;
  status: string;
  objective?: string | null;
  keyQuestion?: string | null;
  prerequisite?: string | null;
  commonMistake?: string | null;
  transferPrompt?: string | null;
  dependencyIds: string[];
  prerequisiteKeys: string[];
  planningQuestionKey?: string | null;
  unmetDependencyIds: string[];
  orderIndex: number;
};

type RoadmapModuleBlueprint = {
  goalKeys?: string[];
  key: string;
  title: string;
  goal: string;
  keyQuestions: Array<{
    goalKeys?: string[];
    key: string;
    question: string;
    checkableOutcome: string;
  }>;
};

type DomainMap = {
  contentCoverageVersion?: 1;
  contentCoverage?: import("../../../../lib/learning/roadmapPlanningTypes").CourseContentCoverage[];
  learningGoals?: import("../../../../lib/learning/roadmapPlanningTypes").LearningGoal[];
  domain: {
    id: string;
    name: string;
    goal?: string | null;
    taskBrief?: string | null;
  };
  roadmap: {
    id: string;
    title: string;
    status: string;
    mapRevision: number;
    hasPlannedStages: boolean;
  } | null;
  units: Array<{
    goalKeys?: string[];
    problem?: import("../../../../lib/learning/roadmapPlanningTypes").StageProblem;
    conceptModules?: {title:string;goal?:string|null;conceptReferences:import("../../../../lib/learning/roadmapPlanningTypes").ConceptReference[]}[];
    id: string;
    key: string;
    title: string;
    goal?: string | null;
    status: "planned" | "expanded";
    rationale?: string | null;
    moduleDirections: string[];
    moduleBlueprints: RoadmapModuleBlueprint[];
    prerequisiteStageKeys: string[];
    progress: {
      percent: number;
      completedNodes: number;
      totalNodes: number;
      needsReviewNodes: number;
    };
  }>;
  nodes: DomainMapNode[];
  progress: {
    percent: number;
    completedNodes: number;
    totalNodes: number;
    needsReviewNodes: number;
  };
};

type RoadmapStageDraft = {
  goalKeys?: string[];
  problem?: import("../../../../lib/learning/roadmapPlanningTypes").StageProblem;
  key: string;
  title: string;
  goal?: string | null;
  status: "planned" | "expanded";
  rationale?: string | null;
  moduleDirections?: string[];
  moduleBlueprints?: RoadmapModuleBlueprint[];
  prerequisiteStageKeys: string[];
  modules: Array<{
    conceptReferences?: import("../../../../lib/learning/roadmapPlanningTypes").ConceptReference[];
    title: string;
    goal?: string | null;
    items: Array<{
      key: string;
      title: string;
      keyQuestion?: string | null;
      objective?: string | null;
      prerequisite?: string | null;
      commonMistake?: string | null;
      transferPrompt?: string | null;
      prerequisiteKeys: string[];
      planningQuestionKey?: string | null;
      planningQuestionKeys?: string[];
      concept?: import("../../../../lib/learning/roadmapPlanningTypes").ConceptProfile;
      status?: string | null;
    }>;
  }>;
};

type RoadmapItemDraft = RoadmapStageDraft["modules"][number]["items"][number];

function buildStageFromMap(map: DomainMap, unit: DomainMap["units"][number]): RoadmapStageDraft {
  const grouped = new Map<string, DomainMapNode[]>();
  for (const node of map.nodes.filter(node => node.unitId === unit.id).sort((left, right) => left.orderIndex - right.orderIndex)) {
    grouped.set(node.moduleTitle, [...(grouped.get(node.moduleTitle) || []), node]);
  }
  const modules = [...grouped].map(([title, nodes]) => ({
    title,
    goal: unit.conceptModules?.find(saved => saved.title === title)?.goal || null,
    conceptReferences: unit.conceptModules?.find(saved => saved.title === title)?.conceptReferences || [],
    items: nodes.map(node => ({ key: node.key, title: node.title, keyQuestion: node.keyQuestion, objective: node.objective,
      prerequisite: node.prerequisite, commonMistake: node.commonMistake, transferPrompt: node.transferPrompt,
      prerequisiteKeys: node.prerequisiteKeys, planningQuestionKeys: node.planningQuestionKeys, concept: node.concept, status: node.status }))
  }));
  return { key: unit.key, goalKeys: unit.goalKeys, problem: unit.problem, title: unit.title, goal: unit.goal, status: unit.status,
    rationale: unit.rationale, moduleDirections: unit.moduleDirections, moduleBlueprints: unit.moduleBlueprints,
    prerequisiteStageKeys: unit.prerequisiteStageKeys,
    modules: [...modules, ...(unit.conceptModules || []).filter(saved => !modules.some(actual => actual.title === saved.title)).map(saved => ({ ...saved, items: [] }))] };
}

type ApiResponseData = Record<string, unknown>;

type ReviewState =
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

const readApiResponse = async (response: Response): Promise<ApiResponseData> => {
  const raw = await response.text().catch(() => "");
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as ApiResponseData)
      : {};
  } catch {
    return {};
  }
};

const apiErrorMessage = (
  response: Response,
  data: ApiResponseData,
  fallback: string
) => {
  const error = data.error;
  if (typeof error === "string" && error.trim()) return error;
  return `${fallback}（HTTP ${response.status} ${response.statusText || ""}）`.trim();
};

const statusClass: Record<string, string> = {
  locked: "border-slate-200 bg-slate-50 text-slate-500",
  available: "border-sky-200 bg-sky-50 text-sky-700",
  next: "border-emerald-300 bg-emerald-50 text-emerald-800",
  in_progress: "border-amber-300 bg-amber-50 text-amber-800",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  mastered: "border-violet-200 bg-violet-50 text-violet-700",
  needs_review: "border-rose-200 bg-rose-50 text-rose-700",
  suggested: "border-indigo-200 bg-indigo-50 text-indigo-700",
  skipped: "border-slate-200 bg-slate-50 text-slate-500"
};

const statusOrder: Record<string, number> = {
  next: 0,
  in_progress: 1,
  needs_review: 2,
  available: 3,
  suggested: 4,
  completed: 5,
  mastered: 6,
  skipped: 7,
  locked: 8
};

export default function LearningDomainMapPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = params?.id;
  const domainId = Array.isArray(rawId) ? rawId[0] : rawId;

  const [map, setMap] = useState<DomainMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [viewMode, setViewMode] = useState<"directory" | "dependencies">(
    "directory"
  );
  const [stageDraft, setStageDraft] = useState<RoadmapStageDraft | null>(null);
  const [savedDraftStages, setSavedDraftStages] = useState<RoadmapStageDraft[] | null>(null);
  const [planningDraft, setPlanningDraft] = useState<{
    planningVersion: 2 | 3;
    learningGoals?: import("../../../../lib/learning/roadmapPlanningTypes").LearningGoal[];
    title: string;
    status?: string;
    baseRevision?: number;
    stages: RoadmapStageDraft[];
  } | null>(null);
  const [planningReviewState, setPlanningReviewState] = useState<
    ReviewState
  >(null);
  const [stageReviewState, setStageReviewState] = useState<ReviewState>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [reviewRationale, setReviewRationale] = useState("");
  const [workflow, setWorkflow] = useState<DomainWorkflowSnapshot | null>(null);
  const [stageQualitySummary, setStageQualitySummary] = useState("");
  const [deleting, setDeleting] = useState(false);
  const isStageRevision = Boolean(stageDraft && map?.units.some(unit => unit.key === stageDraft.key && unit.status === "expanded"));

  const loadMap = useCallback(async () => {
    if (!domainId) return;
    setLoading(true);
    setError("");
    try {
      const [response, workflowResponse] = await Promise.all([
        fetch(`/api/domains/${domainId}/map`),
        fetch(`/api/domains/${domainId}/workflow`)
      ]);
      const [data, workflowData] = await Promise.all([
        response.json().catch(() => ({})),
        workflowResponse.json().catch(() => ({}))
      ]);
      if (!response.ok) {
        setError(data.error || "加载领域地图失败。");
        return;
      }
      setMap(data.map);
      setWorkflow(workflowResponse.ok ? workflowData.workflow || null : null);
      setReviewId(data.qualityReview?.id || null);
      setPlanningDraft(
        data.draft?.stages?.length && data.map?.units?.length === 0
          ? data.draft
          : null
      );
      setPlanningReviewState(
        data.draft?.stages?.length && data.map?.units?.length === 0
          ? data.qualityReview?.state || "stale"
          : null
      );
      setSavedDraftStages(data.draft?.stages || null);
      const recoveredStage = data.map?.units?.length
        ? recoverStageDraft<RoadmapStageDraft>(data.draft?.stages || [], data.map.units.map((unit: DomainMap["units"][number]) => buildStageFromMap(data.map, unit)), new URLSearchParams(window.location.search).get("reviseStage") || data.qualityReview?.stageKey)
        : null;
      setStageDraft(recoveredStage || null);
      setStageReviewState(
        recoveredStage ? data.qualityReview?.state || "stale" : null
      );
      setStageQualitySummary(data.qualityReview?.report?.summary || "");
    } catch {
      setError("加载领域地图失败：无法连接到应用服务。");
    } finally {
      setLoading(false);
    }
  }, [domainId]);

  useEffect(() => {
    void loadMap();
  }, [loadMap]);

  const recoverMapConflict = async () => {
    const localStageDraft = stageDraft;
    await loadMap();
    if (localStageDraft) {
      setStageDraft(localStageDraft);
      setMessage("已加载最新地图；你的本地 Stage 编辑仍保留，请复核后重新保存或确认。");
    }
  };

  const nodesByUnit = useMemo(() => {
    const grouped = new Map<string, DomainMapNode[]>();
    for (const node of map?.nodes || []) {
      grouped.set(node.unitId, [...(grouped.get(node.unitId) || []), node]);
    }
    for (const [unitId, nodes] of grouped.entries()) {
      grouped.set(
        unitId,
        [...nodes].sort((left, right) => {
          const statusDiff =
            (statusOrder[left.status] ?? 99) - (statusOrder[right.status] ?? 99);
          return statusDiff !== 0 ? statusDiff : left.orderIndex - right.orderIndex;
        })
      );
    }
    return grouped;
  }, [map?.nodes]);

  const dependencyGraph = useMemo(() => {
    if (!map) return { nodes: [] as Node[], edges: [] as Edge[] };
    const unitIndex = new Map(
      map.units.map((unit, index) => [unit.id, index])
    );
    const indexWithinUnit = new Map<string, number>();
    const nodes = map.nodes.map((node) => {
      const localIndex = indexWithinUnit.get(node.unitId) || 0;
      indexWithinUnit.set(node.unitId, localIndex + 1);
      return {
        id: node.id,
        position: {
          x: (unitIndex.get(node.unitId) || 0) * 320,
          y: localIndex * 130
        },
        data: {
          label: (
            <div className="min-w-44 text-left">
              <div className="text-xs text-slate-500">{node.unitTitle}</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {node.title}
              </div>
              <div className="mt-1 text-[10px] text-slate-500">{node.key}</div>
            </div>
          )
        },
        draggable: false,
        connectable: false
      } satisfies Node;
    });
    const edges = map.nodes.flatMap((node) =>
      node.dependencyIds.map(
        (prerequisiteId) =>
          ({
            id: `${prerequisiteId}->${node.id}`,
            source: prerequisiteId,
            target: node.id,
            markerEnd: { type: MarkerType.ArrowClosed },
            animated: node.unmetDependencyIds.includes(prerequisiteId),
            style: {
              stroke: node.unmetDependencyIds.includes(prerequisiteId)
                ? "#b45309"
                : "#64748b"
            }
          }) satisfies Edge
      )
    );
    return { nodes, edges };
  }, [map]);

  const updateStageDraftItem = (
    moduleIndex: number,
    itemIndex: number,
    patch: Partial<RoadmapItemDraft>
  ) => {
    setStageReviewState("stale");
    setStageDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        modules: current.modules.map((roadmapModule, currentModuleIndex) =>
          currentModuleIndex === moduleIndex
            ? {
                ...roadmapModule,
                items: roadmapModule.items.map((item, currentItemIndex) =>
                  currentItemIndex === itemIndex ? { ...item, ...patch } : item
                )
              }
            : roadmapModule
        )
      };
    });
  };

  const generateStageDraft = async (unit: DomainMap["units"][number]) => {
    if (!map || !domainId) return;
    if (workflow && !workflow.allowedActions.includes("EXPAND_STAGE")) {
      setError(workflow.blockers[0] || "当前持久化状态还不能展开 Stage。");
      return;
    }
    const unmetStages = unit.prerequisiteStageKeys.filter((key) => {
      const prerequisite = map.units.find((item) => item.key === key);
      return prerequisite?.status !== "expanded";
    });
    if (
      unmetStages.length &&
      !window.confirm(
        "这个 Stage 的前置 Stage 尚未展开。你仍可继续，但生成结果可能需要稍后校正。"
      )
    ) {
      return;
    }

    setBusy(`expand-${unit.id}`);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/domains/${domainId}/map/ai-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "stage",
          stageKey: unit.key,
          baseRevision: map.roadmap?.mapRevision
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "展开 Stage 失败。");
        return;
      }
      const generatedStage = data.stage as RoadmapStageDraft;
      setSavedDraftStages(data.draft?.stages || null);
      setStageDraft(generatedStage);
      setStageReviewState(data.reviewState || "passed");
      setReviewId(data.qualityReview?.id || null);
      setStageQualitySummary(data.qualityReport?.summary || "");
      setMessage(
        data.reviewState === "unavailable"
          ? "Stage 草稿已保存，但 AI 语义复审暂不可用。请重试或人工核对后确认风险。"
          : "Stage 草稿已按服务端蓝图生成并完成覆盖检查。请检查节点问题和真实前置关系。"
      );
    } catch {
      setError("展开 Stage 失败：无法连接到应用服务。");
    } finally {
      setBusy("");
    }
  };

  const startStageRevision = async (unit: DomainMap["units"][number]) => {
    if (!map?.roadmap || !domainId || stageDraft) return;
    const stages = savedDraftStages || map.units.map(stage => buildStageFromMap(map, stage));
    const current = stages.find(stage => stage.key === unit.key);
    if (!current) return;
    setBusy(`revise-${unit.id}`);
    setError("");
    try {
      const response = await fetch(`/api/domains/${domainId}/map`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: { planningVersion: 3,
          ...(map.contentCoverageVersion ? { contentCoverageVersion: map.contentCoverageVersion } : {}),
          learningGoals: map.learningGoals, title: map.roadmap.title, status: "draft", baseRevision: map.roadmap.mapRevision, stages } })
      });
      const data = await readApiResponse(response);
      if (!response.ok) { setError(apiErrorMessage(response, data, "建立阶段修订草稿失败")); return; }
      const saved = (data.draft as { stages?: RoadmapStageDraft[] } | undefined)?.stages || stages;
      setSavedDraftStages(saved);
      setStageDraft(saved.find(stage => stage.key === unit.key) || current);
      setStageReviewState("stale"); setStageQualitySummary(""); setReviewId(null);
      router.replace(`/learning/domains/${domainId}?reviseStage=${encodeURIComponent(unit.key)}`, { scroll: false });
      setMessage("已保存阶段修订草稿。修改后请保存并复审，再明确确认；正式地图和学习记录在确认前保持原样。");
    } catch { setError("建立阶段修订草稿失败：无法连接到应用服务。"); }
    finally { setBusy(""); }
  };

  const confirmStageDraft = async () => {
    if (!map || !domainId || !stageDraft || !map.roadmap) return;
    if (!["passed", "resolved"].includes(stageReviewState || "")) {
      setError("Stage 草稿已编辑，请先保存并完成路线质量复审。");
      return;
    }
    setBusy("confirm-stage");
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/domains/${domainId}/map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: `用户确认${isStageRevision ? "修订" : "展开"} Stage：${stageDraft.title}`
        })
      });
      const data = await readApiResponse(response);
      if (!response.ok) {
        setError(apiErrorMessage(response, data, "确认 Stage 失败"));
        return;
      }
      const confirmedMap = data.map as DomainMap | undefined;
      const confirmedUnitId = confirmedMap?.units.find(
        (unit) => unit.key === stageDraft.key
      )?.id;
      const referencedKey=stageDraft.modules.flatMap(module=>module.conceptReferences || [])[0]?.key;
      const firstNode = confirmedMap?.nodes.find(node=>node.unitId===confirmedUnitId) || confirmedMap?.nodes.find(node=>node.key===referencedKey);
      if (firstNode && !isStageRevision) {
        router.push(`/learning/domains/${domainId}/items/${firstNode.id}`);
        return;
      }
      setStageDraft(null);
      setSavedDraftStages(null);
      setMessage(isStageRevision ? "阶段修订已确认，原节点身份与学习记录保留。" : "Stage 已确认。可从阶段目录进入新概念或复用概念。");
      await loadMap();
    } catch {
      setError("确认 Stage 失败：无法连接到应用服务。");
    } finally {
      setBusy("");
    }
  };

  const saveCurrentStageDraft = async () => {
    if (!map || !domainId || !stageDraft || !map.roadmap) return;
    const invalidItem = stageDraft.modules
      .flatMap((roadmapModule) => roadmapModule.items)
      .find(
        (item) =>
          !item.keyQuestion?.trim() ||
          !item.objective?.trim() ||
          !item.planningQuestionKeys?.length
      );
    if (invalidItem) {
      setError(
        `保存前请补齐节点“${invalidItem.title || invalidItem.key}”的核心问题、可检查结果和对应规划问题。`
      );
      return;
    }
    const draft = {
      planningVersion: 3 as const,
      ...(map.contentCoverageVersion?{contentCoverageVersion:map.contentCoverageVersion}:{}),
      learningGoals: map.learningGoals,
      title: map.roadmap.title,
      status: "draft",
      baseRevision: map.roadmap.mapRevision,
      stages: replaceEditedStage(savedDraftStages || map.units.map(unit => buildStageFromMap(map, unit)), stageDraft)
    };
    setBusy("save-stage-draft");
    setError("");
    try {
      const response = await fetch(`/api/domains/${domainId}/map`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft })
      });
      const data = await readApiResponse(response);
      if (!response.ok) {
        setError(
          apiErrorMessage(response, data, "保存 Stage 草稿失败")
        );
        return;
      }
      const reviewState = data.reviewState;
      setSavedDraftStages((data.draft as { stages?: RoadmapStageDraft[] } | undefined)?.stages || draft.stages);
      setStageReviewState(
        reviewState === "passed" ||
          reviewState === "resolved" ||
          reviewState === "blocked" ||
          reviewState === "unavailable" ||
          reviewState === "stale"
          ? reviewState
          : "stale"
      );
      setMessage("Stage 草稿已保存；内容已变化，需要重新复审后才能确认。");
    } catch {
      setError("保存 Stage 草稿失败：无法连接到应用服务。");
    } finally {
      setBusy("");
    }
  };

  const reviewCurrentStageDraft = async () => {
    if (!map || !domainId || !stageDraft || !map.roadmap) return;
    setBusy("review-stage-draft");
    setError("");
    const draft = {
      planningVersion: 3 as const,
      ...(map.contentCoverageVersion ? { contentCoverageVersion: map.contentCoverageVersion } : {}),
      learningGoals: map.learningGoals,
      title: map.roadmap.title,
      status: "draft",
      baseRevision: map.roadmap.mapRevision,
      stages: replaceEditedStage(savedDraftStages || map.units.map(unit => buildStageFromMap(map, unit)), stageDraft)
    };
    try {
      const saveResponse = await fetch(`/api/domains/${domainId}/map`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft })
      });
      const saveData = await readApiResponse(saveResponse);
      if (!saveResponse.ok) {
        setError(
          apiErrorMessage(saveResponse, saveData, "保存 Stage 草稿失败")
        );
        return;
      }
      setSavedDraftStages((saveData.draft as { stages?: RoadmapStageDraft[] } | undefined)?.stages || draft.stages);
      const reviewResponse = await fetch(
        `/api/domains/${domainId}/map/reviews`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: "stage", stageKey: stageDraft.key })
        }
      );
      const reviewData = await readApiResponse(reviewResponse);
      const reviewedStages = (reviewData.draft as { stages?: RoadmapStageDraft[] } | undefined)?.stages;
      if (reviewedStages) setSavedDraftStages(reviewedStages);
      if (!reviewResponse.ok) {
        const reviewedStage = (
          reviewData.draft as { stages?: RoadmapStageDraft[] } | undefined
        )?.stages?.find(
          (stage: RoadmapStageDraft) => stage.key === stageDraft.key
        );
        if (reviewedStage) setStageDraft(reviewedStage);
        setStageReviewState(reviewResponse.status === 422 ? "blocked" : "stale");
        setReviewId(
          (reviewData.qualityReview as { id?: string } | undefined)?.id || null
        );
        const qualityReport = reviewData.qualityReport;
        setStageQualitySummary(
          qualityReport && typeof qualityReport === "object"
            ? String((qualityReport as { summary?: unknown }).summary || "")
            : ""
        );
        setError(
          apiErrorMessage(reviewResponse, reviewData, "Stage 路线质量复审失败")
        );
        return;
      }
      const reviewedStage = (
        reviewData.draft as { stages?: RoadmapStageDraft[] } | undefined
      )?.stages?.find(
        (stage: RoadmapStageDraft) => stage.key === stageDraft.key
      );
      if (reviewedStage) setStageDraft(reviewedStage);
      const nextReviewState = String(reviewData.reviewState || "passed") as ReviewState;
      setStageReviewState(nextReviewState);
      setReviewId(
        (reviewData.qualityReview as { id?: string } | undefined)?.id || null
      );
      const qualityReport = reviewData.qualityReport;
      setStageQualitySummary(
        qualityReport && typeof qualityReport === "object"
          ? String((qualityReport as { summary?: unknown }).summary || "复审通过")
          : "复审通过"
      );
      setMessage(
        nextReviewState === "unavailable"
          ? "AI 语义复审暂不可用。请重试或人工核对后确认风险。"
          : "Stage 路线质量复审已通过；继续编辑后需要再次复审。"
      );
    } catch {
      setError("Stage 路线质量复审失败：无法连接到应用服务。");
    } finally {
      setBusy("");
    }
  };

  const resolveCurrentReview = async () => {
    if (!domainId || !reviewId) return;
    const currentState = stageDraft ? stageReviewState : planningReviewState;
    if (currentState !== "blocked" && currentState !== "unavailable") {
      setError("当前没有可裁决的路线复审。");
      return;
    }
    setBusy("resolve-review");
    setError("");
    try {
      const response = await fetch(
        `/api/domains/${domainId}/map/review-decisions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewId,
            decision:
              currentState === "unavailable"
                ? "acknowledge_unavailable"
                : "dismiss_semantic",
            rationale: reviewRationale
          })
        }
      );
      const data = await readApiResponse(response);
      if (!response.ok) {
        setError(apiErrorMessage(response, data, "记录路线复审裁决失败"));
        return;
      }
      setReviewRationale("");
      setMessage("已记录你的裁决理由；该回执只对当前草稿内容和版本有效。");
      await loadMap();
    } catch {
      setError("记录路线复审裁决失败：无法连接到应用服务。");
    } finally {
      setBusy("");
    }
  };

  const confirmRecoveredPlanningDraft = async () => {
    if (!domainId || !planningDraft) return;
    if (!["passed", "resolved"].includes(planningReviewState || "")) {
      setError("恢复的规划草稿缺少有效质量复审，请返回创建流程重新复审或生成。");
      return;
    }
    setBusy("confirm-planning");
    setError("");
    setMessage("");
    try {
      const courseResponse = await fetch(
        `/api/domains/${domainId}/course-design`
      );
      const courseData = await courseResponse.json().catch(() => ({}));
      if (!courseResponse.ok || !courseData.courseDesign?.draft) {
        setError(courseData.error || "未找到可恢复的课程设计草稿。");
        return;
      }
      const saveResponse = await fetch(`/api/domains/${domainId}/map`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: planningDraft,
          courseDesignAiCallLogId: courseData.courseDesign.aiCallLogId
        })
      });
      const saveData = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok) {
        setError(saveData.error || "保存领域地图草稿失败。");
        return;
      }
      const response = await fetch(`/api/domains/${domainId}/map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: planningDraft,
          courseDesign: courseData.courseDesign.draft,
          reason: "用户恢复并确认了课程设计方向与完整 Stage 骨架。"
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "确认恢复的规划草稿失败。");
        return;
      }
      setPlanningDraft(null);
      setMessage("课程设计方向与完整 Stage 骨架已确认。");
      await loadMap();
    } catch {
      setError("确认恢复的规划草稿失败：无法连接到应用服务。");
    } finally {
      setBusy("");
    }
  };

  const deleteDomain = async () => {
    if (!domainId) return;
    const domainName = map?.domain.name || "当前学习领域";
    const confirmed = window.confirm(
      `确定删除“${domainName}”吗？该领域的地图、学习节点、诊断记录和知识点会一并删除。`
    );
    if (!confirmed) return;

    setDeleting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/domains/${domainId}`, {
        method: "DELETE"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "删除学习领域失败。");
        return;
      }
      router.push("/");
    } catch {
      setError("删除学习领域失败：无法连接到应用服务。");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <SectionPanel>正在加载领域地图...</SectionPanel>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        kicker="领域地图"
        title={map?.domain.name || "学习领域"}
        description={
          map?.domain.goal ||
          "这里是默认学习入口。地图展示真实前置关系，你可以自主选择节点；任何结构性调整都需要你确认。"
        }
        actions={
          <>
            <Link href="/" className="workshop-button-secondary px-3 py-2 text-sm">
              首页
            </Link>
            {domainId ? (
              <Link href={`/learning/domains/${encodeURIComponent(domainId)}/ai-logs`} className="workshop-button-secondary px-3 py-2 text-sm">AI 生成记录</Link>
            ) : null}
            {domainId ? (
              <Link
                href={`/learning/domains/${domainId}/diagnostics`}
                className="workshop-button-secondary px-3 py-2 text-sm"
              >
                学习诊断
              </Link>
            ) : null}
            {domainId ? (
              <Link
                href={`/learning/domains/${domainId}/knowledge-graph`}
                className="workshop-button-secondary px-3 py-2 text-sm"
              >
                知识体系图谱
              </Link>
            ) : null}
            {domainId ? (
              <ActionButton
                type="button"
                variant="danger"
                onClick={() => void deleteDomain()}
                disabled={deleting}
              >
                {deleting ? "删除中..." : "删除领域"}
              </ActionButton>
            ) : null}
          </>
        }
      />

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span>{error}</span>
          {error.includes("地图已更新") ? (
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() => void recoverMapConflict()}
              disabled={loading || Boolean(busy)}
            >
              重新加载最新地图
            </ActionButton>
          ) : null}
        </div>
      ) : null}
      {message ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      {reviewId &&
      (stageDraft
        ? stageReviewState === "blocked" || stageReviewState === "unavailable"
        : planningReviewState === "blocked" ||
          planningReviewState === "unavailable") ? (
        <div className="space-y-2 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">
            {(stageDraft ? stageReviewState : planningReviewState) === "unavailable"
              ? "AI 语义复审暂不可用。人工核对后可以明确接受本次缺失风险。"
              : "AI 内容复核仍有待处理意见。你可以继续编辑并复审，也可以说明理由后裁决。"}
          </p>
          <textarea
            className="w-full rounded border border-amber-300 bg-white px-3 py-2"
            rows={3}
            value={reviewRationale}
            onChange={(event) => setReviewRationale(event.target.value)}
            placeholder="说明你核对了什么，以及为什么接受当前风险（至少 8 个字符）"
          />
          <ActionButton
            variant="secondary"
            disabled={Boolean(busy) || reviewRationale.trim().length < 8}
            onClick={() => void resolveCurrentReview()}
          >
            {busy === "resolve-review" ? "记录中..." : "记录裁决并继续"}
          </ActionButton>
        </div>
      ) : null}

      {planningDraft ? (
        <SectionPanel strong>
          <div>
            <div className="workshop-kicker">已恢复规划草稿</div>
            <h2 className="workshop-title mt-1 text-xl font-semibold">
              {planningDraft.title}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              课程设计方向和完整 Stage 骨架已保存在本地，但尚未成为正式地图。
            </p>
            <p className="mt-1 text-xs text-slate-500">
              路线质量：
              {planningReviewState === "passed" || planningReviewState === "resolved"
                ? planningReviewState === "resolved"
                  ? "已人工裁决当前复审"
                  : "复审已通过"
                : "缺少有效复审，请返回创建流程处理"}
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {planningDraft.stages.map((stage) => (
              <div key={stage.key} className="rounded border border-slate-200 bg-white p-3">
                <div className="text-sm font-semibold text-slate-900">{stage.title}</div>
                <p className="mt-1 text-xs text-slate-600">{stage.goal}</p>
                <CurriculumCoverage goals={planningDraft.learningGoals} stage={stage}/>
                <div className="mt-1 text-xs text-slate-500">key: {stage.key}</div>
              </div>
            ))}
          </div>
          <ActionButton
            onClick={() => void confirmRecoveredPlanningDraft()}
            disabled={
              Boolean(busy) ||
              !["passed", "resolved"].includes(planningReviewState || "")
            }
          >
            {busy === "confirm-planning" ? "确认中..." : "确认规划并建立正式地图"}
          </ActionButton>
        </SectionPanel>
      ) : null}

      {!map?.roadmap && !planningDraft ? (
        <SectionPanel strong>
          <div>
            <div className="workshop-kicker">尚未生成地图</div>
            <h2 className="workshop-title mt-1 text-xl font-semibold">
              请先确认任务书和领域地图
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              当前领域还没有稳定地图。先回到创建流程生成任务书与领域地图，再开始学习。
            </p>
          </div>
          <Link
            href={`/learning/domains/new?domainId=${encodeURIComponent(domainId || "")}`}
            className="workshop-button px-3 py-2 text-sm"
          >
            去生成地图
          </Link>
        </SectionPanel>
      ) : null}

      {map ? (
        <SectionPanel strong>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill>{map.roadmap?.status || "草稿"}</StatusPill>
                {map.roadmap?.hasPlannedStages ? (
                  <StatusPill>仍有待展开 Stage</StatusPill>
                ) : (
                  <StatusPill>已完成 {map.progress.percent}%</StatusPill>
                )}
                {map.progress.needsReviewNodes ? (
                  <StatusPill>{map.progress.needsReviewNodes} 个待复习</StatusPill>
                ) : null}
              </div>
              <h2 className="workshop-title mt-3 text-2xl font-semibold">
                {map.roadmap?.title || "领域地图"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                地图展示 Stage、节点与真实前置关系。你可以自由选择可见节点；未满足前置时系统只提醒，不封锁入口。
              </p>
            </div>

            <div className="flex w-full max-w-sm flex-col gap-2 lg:items-end">
              {workflow?.allowedActions.includes("OPEN_FIRST_NODE") && map.nodes[0] ? (
                <ActionButton
                  className="w-full"
                  onClick={() =>
                    router.push(
                      `/learning/domains/${map.domain.id}/items/${map.nodes[0].id}`
                    )
                  }
                >
                  继续：进入第一个学习节点
                </ActionButton>
              ) : null}
              <ActionButton
                type="button"
                variant={viewMode === "directory" ? "primary" : "secondary"}
                onClick={() => setViewMode("directory")}
                className="w-full"
              >
                Stage 目录
              </ActionButton>
              <ActionButton
                type="button"
                variant={viewMode === "dependencies" ? "primary" : "secondary"}
                onClick={() => setViewMode("dependencies")}
                className="w-full"
              >
                前置关系图
              </ActionButton>
            </div>
          </div>

          {!map.roadmap?.hasPlannedStages ? (
            <><div className="mt-4 h-2 overflow-hidden rounded-full bg-[rgba(185,130,79,0.18)]">
            <div
              className="h-full rounded-full bg-[color:var(--wood-deep)]"
              style={{ width: `${map.progress.percent}%` }}
            />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded border border-slate-200 bg-white p-3">
              <div className="text-xs text-slate-500">总节点</div>
              <div className="mt-1 text-xl font-semibold text-slate-900">
                {map.progress.totalNodes}
              </div>
            </div>
            <div className="rounded border border-slate-200 bg-white p-3">
              <div className="text-xs text-slate-500">已完成</div>
              <div className="mt-1 text-xl font-semibold text-slate-900">
                {map.progress.completedNodes}
              </div>
            </div>
            <div className="rounded border border-slate-200 bg-white p-3">
              <div className="text-xs text-slate-500">待复习</div>
              <div className="mt-1 text-xl font-semibold text-slate-900">
                {map.progress.needsReviewNodes}
              </div>
            </div>
            </div></>
          ) : (
            <p className="mt-4 text-sm text-slate-600">
              全局完成率会在所有 Stage 展开后显示；当前请查看各已展开 Stage 的进度。
            </p>
          )}

        </SectionPanel>
      ) : null}

      {stageDraft ? (
        <SectionPanel strong>
          <div>
            <div className="workshop-kicker">{isStageRevision ? "Stage 修订草稿" : "Stage 展开草稿"}</div>
            <h2 className="workshop-title mt-1 text-xl font-semibold">
              确认前可编辑
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              每个节点只保留一个可检查的核心问题。前置关系填写稳定 key，可留空表示平行起点。
            </p>
            {isStageRevision ? <p className="mt-2 text-sm text-slate-600">正在编辑已确认阶段的副本。保存后可以刷新恢复；复审与明确确认完成后才更新正式地图，已有学习记录保留。</p> : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusPill>
                {stageReviewState === "passed" || stageReviewState === "resolved"
                  ? stageReviewState === "resolved"
                    ? "已人工裁决当前复审"
                    : "质量复审已通过"
                  : stageReviewState === "blocked"
                    ? "质量复审未通过"
                    : stageReviewState === "unavailable"
                      ? "AI 复审暂不可用"
                    : "已编辑，等待复审"}
              </StatusPill>
              {stageQualitySummary ? (
                <span className="text-xs text-slate-600">
                  {stageQualitySummary}
                </span>
              ) : null}
            </div>
          </div>
          <fieldset
            className="space-y-3 border-0 p-0"
            disabled={Boolean(busy)}
          >
            <input
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm font-medium"
              value={stageDraft.title}
              onChange={(event) => {
                setStageReviewState("stale");
                setStageDraft((current) =>
                  current ? { ...current, title: event.target.value } : current
                );
              }}
            />
            <textarea
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
              rows={2}
              value={stageDraft.goal || ""}
              onChange={(event) => {
                setStageReviewState("stale");
                setStageDraft((current) =>
                  current ? { ...current, goal: event.target.value } : current
                );
              }}
              placeholder="Stage 目标"
            />
            <div className="grid gap-3">
              <CurriculumCoverage goals={map?.learningGoals} stage={stageDraft}/>
              {stageDraft.modules.map((roadmapModule, moduleIndex) => (
                <div key={`${roadmapModule.title}-${moduleIndex}`} className="rounded border border-slate-200 p-3">
                  <div className="text-sm font-semibold text-slate-900">
                    {roadmapModule.title}
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {roadmapModule.conceptReferences?.map(ref=><p key={ref.key}>复用概念：{map?.nodes.find(n=>n.key===ref.key)?.title||ref.key}；本次作用：{ref.problemRole}；覆盖问题：{ref.planningQuestionKeys.join("、")}</p>)}
                    {roadmapModule.items.map((item, itemIndex) => (
                      <div key={item.key} className="rounded bg-slate-50 p-3">
                        <input
                          className="w-full rounded border border-slate-200 px-2 py-1 text-sm font-medium"
                          value={item.title}
                          onChange={(event) =>
                            updateStageDraftItem(moduleIndex, itemIndex, {
                              title: event.target.value,
                              concept: {...(item.concept||{name:"",aliases:[],scope:"",problemRole:""}),name:event.target.value}
                            })
                          }
                        />
                        {item.concept&&<div className="space-y-2">
                          <label className="block text-xs">本课概念范围<textarea className="w-full rounded border p-2" value={item.concept.scope} onChange={e=>updateStageDraftItem(moduleIndex,itemIndex,{concept:{...item.concept!,scope:e.target.value}})}/></label>
                          <label className="block text-xs">在完整问题中的作用<textarea className="w-full rounded border p-2" value={item.concept.problemRole} onChange={e=>updateStageDraftItem(moduleIndex,itemIndex,{concept:{...item.concept!,problemRole:e.target.value}})}/></label>
                          <label className="block text-xs">必要别名<input className="w-full rounded border p-2" value={item.concept.aliases.join(", ")} onChange={e=>updateStageDraftItem(moduleIndex,itemIndex,{concept:{...item.concept!,aliases:e.target.value.split(/[,，]/).map(s=>s.trim()).filter(Boolean)}})}/></label>
                        </div>}
                        {item.concept?.learningUnit && <details className="my-2 text-sm">
                          <summary>本课新增知识与教学分工</summary>
                          <label className="block">新增知识<textarea className="w-full rounded border p-2" value={item.concept.learningUnit.newKnowledge} onChange={e=>updateStageDraftItem(moduleIndex,itemIndex,{concept:{...item.concept!,learningUnit:{...item.concept!.learningUnit!,newKnowledge:e.target.value}}})}/></label>
                          <label className="block">课内任务（每行一项）<textarea className="w-full rounded border p-2" rows={4} value={item.concept.learningUnit.teachingTasks.join("\n")} onChange={e=>updateStageDraftItem(moduleIndex,itemIndex,{concept:{...item.concept!,learningUnit:{...item.concept!.learningUnit!,teachingTasks:e.target.value.split("\n")}}})}/></label>
                          <p>直接使用的基础：{item.concept.learningUnit.assumedKnowledge.join("、") || "未另设基础假设"}</p>
                          <label className="block">代表例子<textarea className="w-full rounded border p-2" value={item.concept.learningUnit.example} onChange={e=>updateStageDraftItem(moduleIndex,itemIndex,{concept:{...item.concept!,learningUnit:{...item.concept!.learningUnit!,example:e.target.value}}})}/></label>
                          {item.concept.learningUnit.contentContributions?.map((contribution, contributionIndex)=><label className="block" key={contribution.contentQuestionKey}>本节点贡献说明（{contribution.contentQuestionKey}）<textarea className="w-full rounded border p-2" value={contribution.contribution} onChange={e=>updateStageDraftItem(moduleIndex,itemIndex,{concept:{...item.concept!,learningUnit:{...item.concept!.learningUnit!,contentContributions:item.concept!.learningUnit!.contentContributions!.map((entry,index)=>index===contributionIndex?{...entry,contribution:e.target.value}:entry)}}})}/></label>)}
                          {item.concept.learningUnit.references.map(ref=><p key={ref.key}>引用：{map?.nodes.find(n=>n.key===ref.key)?.title || stageDraft.modules.flatMap(m=>m.items).find(n=>n.key===ref.key)?.title || ref.key}；用途：{ref.purpose}</p>)}
                          <p className="text-xs text-slate-500">引用用于回顾、比较或应用，不自动产生前置依赖。此处修改文字说明，保留已分配问题、要求下标和维度；保存后仍需复审与确认。</p>
                        </details>}
                        <label className="block text-xs">学习目标<textarea className="w-full rounded border p-2" value={item.objective||""} onChange={e=>updateStageDraftItem(moduleIndex,itemIndex,{objective:e.target.value})}/></label>
                        <textarea
                          className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                          rows={2}
                          value={item.keyQuestion || ""}
                          onChange={(event) =>
                            updateStageDraftItem(moduleIndex, itemIndex, {
                              keyQuestion: event.target.value
                            })
                          }
                          placeholder="可验证的核心问题"
                        />
                        <input
                          className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                          value={item.prerequisiteKeys.join(", ")}
                          onChange={(event) => {
                            const prerequisiteKeys = event.target.value
                              .split(",")
                              .map((key) => key.trim())
                              .filter(Boolean);
                            updateStageDraftItem(moduleIndex, itemIndex, {
                              prerequisiteKeys
                            });
                          }}
                          placeholder="前置节点 key，以逗号分隔；可留空"
                        />
                        <label className="mt-2 block text-xs text-slate-500">
                          对应规划问题
                          <select
                            className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                            multiple
                            value={item.planningQuestionKeys || []}
                            onChange={(event) =>
                              updateStageDraftItem(moduleIndex, itemIndex, {
                                planningQuestionKeys: Array.from(event.target.selectedOptions,option=>option.value).filter(Boolean)
                              })
                            }
                          >
                            <option value="">请选择规划问题</option>
                            {(stageDraft.moduleBlueprints || []).flatMap((blueprint) =>
                              blueprint.keyQuestions.map((question) => (
                                <option key={question.key} value={question.key}>
                                  {blueprint.title} / {question.question}
                                </option>
                              ))
                            )}
                          </select>
                        </label>
                        <div className="mt-2 text-xs text-slate-500">key: {item.key}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              variant="secondary"
              onClick={() => void saveCurrentStageDraft()}
              disabled={Boolean(busy)}
            >
              {busy === "save-stage-draft" ? "保存中..." : "保存草稿"}
            </ActionButton>
            <ActionButton
              variant="secondary"
              onClick={() => void reviewCurrentStageDraft()}
              disabled={Boolean(busy)}
            >
              {busy === "review-stage-draft" ? "复审中..." : "保存并复审路线质量"}
            </ActionButton>
            <ActionButton
              onClick={() => void confirmStageDraft()}
              disabled={
                Boolean(busy) ||
                !["passed", "resolved"].includes(stageReviewState || "")
              }
            >
              {busy === "confirm-stage"
                ? "确认中..."
                : isStageRevision ? "确认阶段修订" : "确认并进入第一个学习节点"}
            </ActionButton>
            <ActionButton variant="secondary" onClick={() => setStageDraft(null)} disabled={Boolean(busy)}>
              关闭编辑（仅保留已保存草稿）
            </ActionButton>
          </div>
        </SectionPanel>
      ) : null}

      {viewMode === "dependencies" && map ? (
        <SectionPanel>
          <div>
            <div className="workshop-kicker">只读视图</div>
            <h2 className="workshop-title mt-1 text-xl font-semibold">真实前置关系</h2>
            <p className="mt-2 text-sm text-slate-600">
              没有入边的节点是平行起点；箭头只表达已确认的前置，不代表唯一学习顺序。
            </p>
          </div>
          <div className="h-[520px] overflow-hidden rounded border border-slate-200 bg-slate-50">
            <ReactFlow
              nodes={dependencyGraph.nodes}
              edges={dependencyGraph.edges}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              nodesDraggable={false}
              nodesConnectable={false}
              deleteKeyCode={null}
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
        </SectionPanel>
      ) : null}

      {viewMode === "directory" ? map?.units.map((unit) => {
        const nodes = nodesByUnit.get(unit.id) || [];
        return (
          <SectionPanel key={unit.id}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="workshop-kicker">单元</div>
                <h2 className="workshop-title mt-1 text-xl font-semibold">
                  {unit.title}
                </h2>
                {unit.goal ? (
                  <p className="mt-2 text-sm leading-6 text-slate-600">{unit.goal}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill>{unit.status === "planned" ? "待展开" : "已展开"}</StatusPill>
                {unit.status === "expanded" ? (
                  <><StatusPill>完成度 {unit.progress.percent}%</StatusPill><ActionButton variant="secondary" disabled={Boolean(busy) || Boolean(stageDraft)} onClick={() => void startStageRevision(unit)}>{busy === `revise-${unit.id}` ? "准备草稿中..." : "修订本阶段"}</ActionButton></>
                ) : null}
                {unit.status === "planned" ? (
                  <ActionButton
                    variant="secondary"
                    disabled={
                      Boolean(busy) ||
                      Boolean(
                        workflow &&
                          !workflow.allowedActions.includes("EXPAND_STAGE")
                      )
                    }
                    onClick={() => void generateStageDraft(unit)}
                  >
                    {busy === `expand-${unit.id}` ? "生成中..." : "展开这个 Stage"}
                  </ActionButton>
                ) : null}
              </div>
            </div>

            <CurriculumCoverage goals={map.learningGoals} stage={unit} coverage={map.contentCoverage} domainId={domainId}/>
            {unit.conceptModules?.flatMap(module=>module.conceptReferences||[]).map(ref=>{
              const reused=map.nodes.find(node=>node.key===ref.key);
              return reused?<p className="mt-3" key={ref.key}><Link href={`/learning/domains/${map.domain.id}/items/${reused.id}`}>复用概念：{reused.title}</Link> — {ref.problemRole}</p>:null;
            })}
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {nodes.map((node) => (
                <Link
                  key={node.id}
                  href={
                    `/learning/domains/${map.domain.id}/items/${node.id}`
                  }
                  className={`rounded border p-3 transition hover:-translate-y-0.5 ${
                    statusClass[node.status] || statusClass.locked
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs uppercase tracking-wide">
                      {getLearningNodeTypeLabel(node.type)}
                    </div>
                    <StatusPill>{getLearningNodeStatusLabel(node.status)}</StatusPill>
                  </div>
                  <div className="mt-2 text-base font-semibold">{node.title}</div>
                  <div className="mt-1 text-xs opacity-80">{node.moduleTitle}</div>
                  {node.keyQuestion ? (
                    <p className="mt-2 text-sm leading-6">{node.keyQuestion}</p>
                  ) : node.objective ? (
                    <p className="mt-2 text-sm leading-6">{node.objective}</p>
                  ) : null}
                  {node.unmetDependencyIds.length ? (
                    <p className="mt-2 text-xs font-medium text-amber-800">
                      尚有 {node.unmetDependencyIds.length} 个前置节点未完成；仍可进入学习。
                    </p>
                  ) : null}
                </Link>
              ))}
            </div>
          </SectionPanel>
        );
      }) : null}
    </AppShell>
  );
}
