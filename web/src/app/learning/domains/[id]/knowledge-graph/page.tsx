"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getEvidenceStrengthLabel,
  getKnowledgeNodeStatusLabel,
  getKnowledgeRelationStatusLabel,
  getLearningNodeTypeLabel,
  getRelationKindLabel
} from "../../../../../lib/learning/types";
import {
  ActionButton,
  AppShell,
  PageHeader,
  SectionPanel,
  StatusPill
} from "../../../../components/ui";

type GraphNode = {
  id: string;
  title: string;
  type: string;
  status: string;
  isIsland: boolean;
  coreEssence?: string | null;
};

type GraphRelation = {
  id: string;
  fromKnowledgePointId: string;
  toKnowledgePointId: string;
  relationType: string;
  detail?: string | null;
  status?: string | null;
  evidenceStrength?: string | null;
  userExplanation?: string | null;
  applicability?: string | null;
  misuseRisk?: string | null;
  fromNode?: { id: string; text: string; canvas?: { name: string } } | null;
  toNode?: { id: string; text: string; canvas?: { name: string } } | null;
};

type RelationCandidate = {
  sourceKnowledgePointId: string;
  targetWordId: string;
  relationType: string;
  status: string;
  evidenceStrength: string;
  detail: string;
  userQuestion: string;
  applicability?: string | null;
  misuseRisk?: string | null;
  shouldCreateWormhole: boolean;
};

type RelationTarget = {
  id: string;
  text: string;
  canvasName: string;
  isWormholeTarget: boolean;
};

type CoreConceptInsight = {
  summary: string;
  coreConcepts: Array<{
    title: string;
    essence: string;
    knowledgePointIds: string[];
    whyItMatters: string;
  }>;
  priorityGaps: string[];
};

type RelationExplanation = {
  summary: string;
  connectionLogic: string[];
  boundaryCheck: string;
  evidenceNote: string;
  misuseRisk?: string | null;
};

type RelationDecisionDraft = {
  userExplanation: string;
  evidenceStrength: string;
  applicability: string;
  misuseRisk: string;
};

const emptyRelationDecision: RelationDecisionDraft = {
  userExplanation: "",
  evidenceStrength: "medium",
  applicability: "",
  misuseRisk: ""
};

export default function KnowledgeGraphPage() {
  const params = useParams();
  const rawId = params?.id;
  const domainId = Array.isArray(rawId) ? rawId[0] : rawId;

  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [relations, setRelations] = useState<GraphRelation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedRelation, setSelectedRelation] = useState<GraphRelation | null>(null);
  const [relationDecision, setRelationDecision] =
    useState<RelationDecisionDraft>(emptyRelationDecision);
  const [showCandidatesOnly, setShowCandidatesOnly] = useState(false);
  const [relationQuestion, setRelationQuestion] = useState("");
  const [relationCandidates, setRelationCandidates] = useState<RelationCandidate[]>([]);
  const [relationTargets, setRelationTargets] = useState<RelationTarget[]>([]);
  const [coreInsight, setCoreInsight] = useState<CoreConceptInsight | null>(null);
  const [relationExplanation, setRelationExplanation] =
    useState<RelationExplanation | null>(null);
  const [busy, setBusy] = useState("");

  const loadGraph = useCallback(async (options?: { preserveMessage?: boolean }) => {
    if (!domainId) return;
    setLoading(true);
    setError("");
    if (!options?.preserveMessage) setMessage("");
    try {
      const response = await fetch(`/api/domains/${domainId}/knowledge-graph/relations`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "加载知识体系图谱失败。");
        return;
      }
      setNodes(data.nodes || []);
      setRelations(data.relations || []);
    } catch {
      setError("加载知识体系图谱失败：无法连接到应用服务。");
    } finally {
      setLoading(false);
    }
  }, [domainId]);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  const visibleRelations = useMemo(
    () =>
      showCandidatesOnly
        ? relations.filter((relation) => relation.status?.includes("candidate"))
        : relations,
    [relations, showCandidatesOnly]
  );

  const masteredCount = nodes.filter((node) =>
    ["can_transfer", "integrated"].includes(node.status)
  ).length;
  const islandCount = nodes.filter((node) => node.isIsland).length;
  const nodeTitleMap = new Map(nodes.map((node) => [node.id, node.title]));
  const targetMap = new Map(relationTargets.map((target) => [target.id, target]));

  const organizeCoreConcepts = async () => {
    if (!domainId) return;
    setBusy("organize");
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/domains/${domainId}/knowledge-graph/organize-core`, {
        method: "POST"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "整理核心概念失败。");
        return;
      }
      setCoreInsight(data.insight || null);
      setMessage("AI 已整理当前知识体系中的核心概念。");
    } catch {
      setError("整理核心概念失败：无法连接到应用服务。");
    } finally {
      setBusy("");
    }
  };

  const generateRelationCandidates = async () => {
    if (!domainId || !selectedNode) return;
    setBusy("relation-candidates");
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/domains/${domainId}/knowledge-graph/relation-candidates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceKnowledgePointId: selectedNode.id,
            userQuestion: relationQuestion
          })
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "生成关系候选失败。");
        return;
      }
      setRelationCandidates(
        (data.candidates || []).map((candidate: Omit<RelationCandidate, "sourceKnowledgePointId">) => ({
          ...candidate,
          sourceKnowledgePointId: selectedNode.id
        }))
      );
      setRelationTargets(data.targets || []);
      setMessage("AI 已为当前选中概念生成关系候选，保存后仍需人工确认。");
    } catch {
      setError("生成关系候选失败：无法连接到应用服务。");
    } finally {
      setBusy("");
    }
  };

  const acceptRelationCandidate = async (candidate: RelationCandidate) => {
    if (!domainId) return;
    const busyKey = `${candidate.targetWordId}-${candidate.relationType}`;
    setBusy(busyKey);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/domains/${domainId}/knowledge-graph/relations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromKnowledgePointId: candidate.sourceKnowledgePointId,
          toKnowledgePointId: candidate.targetWordId,
          relationType: candidate.shouldCreateWormhole
            ? "WORMHOLE"
            : candidate.relationType,
          detail: candidate.detail,
          status: candidate.shouldCreateWormhole ? "wormhole_candidate" : "candidate",
          evidenceStrength: candidate.evidenceStrength,
          aiAssessment: candidate.userQuestion,
          applicability: candidate.applicability,
          misuseRisk: candidate.misuseRisk
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "保存关系候选失败。");
        return;
      }
      setMessage("关系候选已写入知识体系图谱，仍需确认后才会成为正式关系。");
      await loadGraph({ preserveMessage: true });
    } catch {
      setError("保存关系候选失败：无法连接到应用服务。");
    } finally {
      setBusy("");
    }
  };

  const explainRelation = async () => {
    if (!domainId || !selectedRelation) return;
    setBusy("explain-relation");
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/domains/${domainId}/knowledge-graph/relations/${selectedRelation.id}/explain`,
        { method: "POST" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "解释关系失败。");
        return;
      }
      setRelationExplanation(data.explanation || null);
      setMessage("AI 已生成关系解释。");
    } catch {
      setError("解释关系失败：无法连接到应用服务。");
    } finally {
      setBusy("");
    }
  };

  const selectRelation = (relation: GraphRelation) => {
    setSelectedRelation(relation);
    setRelationExplanation(null);
    setRelationDecision({
      userExplanation: relation.userExplanation || "",
      evidenceStrength: relation.evidenceStrength || "medium",
      applicability: relation.applicability || "",
      misuseRisk: relation.misuseRisk || ""
    });
  };

  const decideRelation = async (decision: "confirm" | "weak" | "reject") => {
    if (!domainId || !selectedRelation) return;
    if (decision !== "reject" && !relationDecision.userExplanation.trim()) {
      setError("确认或降级关系前，请先写下你的解释和证据。");
      return;
    }

    const statusMap = {
      confirm:
        selectedRelation.relationType === "WORMHOLE"
          ? "confirmed_wormhole"
          : "confirmed",
      weak:
        selectedRelation.relationType === "WORMHOLE"
          ? "weak_wormhole"
          : "weak_evidence",
      reject:
        selectedRelation.relationType === "WORMHOLE"
          ? "rejected_wormhole"
          : "rejected"
    } as const;

    const evidenceStrength =
      decision === "confirm"
        ? relationDecision.evidenceStrength
        : decision === "weak"
          ? "weak"
          : "unknown";

    setBusy(`decide-${decision}`);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/domains/${domainId}/knowledge-graph/relations/${selectedRelation.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: statusMap[decision],
            evidenceStrength,
            userExplanation: relationDecision.userExplanation,
            applicability: relationDecision.applicability,
            misuseRisk: relationDecision.misuseRisk
          })
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "更新关系状态失败。");
        return;
      }
      setSelectedRelation((current) =>
        data.relation && current ? { ...current, ...data.relation } : data.relation || null
      );
      setMessage(
        decision === "confirm"
          ? "关系已确认。"
          : decision === "weak"
            ? "关系已降级为弱证据，后续需要复查。"
            : "关系已否定。"
      );
      await loadGraph({ preserveMessage: true });
    } catch {
      setError("更新关系状态失败：无法连接到应用服务。");
    } finally {
      setBusy("");
    }
  };

  return (
    <AppShell>
      <PageHeader
        kicker="知识体系"
        title="知识体系图谱"
        description="这里展示已经沉淀下来的学习成果：知识点、关系候选、已确认关系，以及仍需补证据的知识孤岛。"
        actions={
          <Link
            href={`/learning/domains/${domainId || ""}`}
            className="workshop-button-secondary px-3 py-2 text-sm"
          >
            领域地图
          </Link>
        }
      />

      {error ? (
        <div className="rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      <SectionPanel strong>
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          如果你还需要导入、导出，或使用旧版图谱编辑工具，请前往{" "}
          <Link
            href={`/canvas/${domainId || ""}`}
            className="font-medium underline underline-offset-4"
          >
            兼容画布
          </Link>
          。
        </div>
        <div className="flex flex-wrap gap-2 pb-4">
          <ActionButton
            type="button"
            variant="secondary"
            onClick={organizeCoreConcepts}
            disabled={Boolean(busy) || nodes.length === 0}
          >
            {busy === "organize" ? "生成中..." : "AI 整理核心概念"}
          </ActionButton>
          <ActionButton
            type="button"
            variant="secondary"
            onClick={() => loadGraph()}
            disabled={loading || Boolean(busy)}
          >
            {loading ? "加载中..." : "刷新"}
          </ActionButton>
        </div>
        {!nodes.length ? (
          <p className="mb-4 text-xs text-slate-500">
            先沉淀至少一个知识点，再整理核心概念。
          </p>
        ) : null}
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <div className="text-2xl font-semibold">{nodes.length}</div>
            <div className="text-xs text-slate-500">知识点</div>
          </div>
          <div>
            <div className="text-2xl font-semibold">{relations.length}</div>
            <div className="text-xs text-slate-500">关系数</div>
          </div>
          <div>
            <div className="text-2xl font-semibold">{masteredCount}</div>
            <div className="text-xs text-slate-500">已掌握</div>
          </div>
          <div>
            <div className="text-2xl font-semibold">{islandCount}</div>
            <div className="text-xs text-slate-500">孤岛</div>
          </div>
        </div>
      </SectionPanel>

      {coreInsight ? (
        <SectionPanel>
          <div>
            <div className="workshop-kicker">AI 核心概念</div>
            <h2 className="workshop-title mt-1 text-xl font-semibold">
              整理结果
            </h2>
          </div>
          <div className="rounded border border-indigo-200 bg-indigo-50 p-3 text-sm leading-6 text-indigo-950">
            <div className="font-medium">{coreInsight.summary}</div>
            <div className="mt-3 grid gap-3">
              {coreInsight.coreConcepts.map((concept) => (
                <div key={concept.title} className="rounded border border-indigo-100 bg-white p-3">
                  <div className="font-medium">{concept.title}</div>
                  <div className="mt-1">{concept.essence}</div>
                  <div className="mt-2 text-indigo-800">
                    涉及知识点：
                    {concept.knowledgePointIds
                      .map((knowledgePointId) =>
                        nodeTitleMap.get(knowledgePointId) || knowledgePointId
                      )
                      .join(", ")}
                  </div>
                  <div className="mt-1 text-indigo-800">{concept.whyItMatters}</div>
                </div>
              ))}
            </div>
            {coreInsight.priorityGaps.length ? (
              <div className="mt-3 text-indigo-800">
                优先补口：{coreInsight.priorityGaps.join(" / ")}
              </div>
            ) : null}
          </div>
        </SectionPanel>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <SectionPanel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="workshop-kicker">概念</div>
              <h2 className="workshop-title mt-1 text-xl font-semibold">
                已沉淀知识
              </h2>
            </div>
            {selectedNode ? <StatusPill>{selectedNode.title}</StatusPill> : null}
          </div>
          <div className="grid gap-3">
            {nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                  onClick={() => {
                    setSelectedNode(node);
                    setRelationCandidates([]);
                    setRelationTargets([]);
                  }}
                disabled={Boolean(busy)}
                className={`rounded border p-3 text-left ${
                  selectedNode?.id === node.id
                    ? "border-indigo-300 bg-indigo-50"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill>{getLearningNodeTypeLabel(node.type)}</StatusPill>
                  <StatusPill>{getKnowledgeNodeStatusLabel(node.status)}</StatusPill>
                  {node.isIsland ? <StatusPill>知识孤岛</StatusPill> : null}
                </div>
                <div className="mt-2 text-sm font-medium text-slate-900">
                  {node.title}
                </div>
                {node.coreEssence ? (
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {node.coreEssence}
                  </p>
                ) : null}
              </button>
            ))}
            {!nodes.length ? (
              <div className="rounded border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                先完成学习节点，这里才会出现沉淀后的知识点。
              </div>
            ) : null}
          </div>
        </SectionPanel>

        <SectionPanel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="workshop-kicker">关系</div>
              <h2 className="workshop-title mt-1 text-xl font-semibold">
                有证据支撑的结构
              </h2>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={showCandidatesOnly}
                disabled={Boolean(busy)}
                onChange={(event) => setShowCandidatesOnly(event.target.checked)}
              />
              只看候选关系
            </label>
          </div>
          <div className="grid gap-3">
            {visibleRelations.map((relation) => (
              <button
                key={relation.id}
                type="button"
                onClick={() => {
                  selectRelation(relation);
                }}
                disabled={Boolean(busy)}
                className="rounded border border-slate-200 bg-slate-50 p-3 text-left"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill>{getRelationKindLabel(relation.relationType)}</StatusPill>
                  <StatusPill>
                    {getKnowledgeRelationStatusLabel(relation.status || "candidate")}
                  </StatusPill>
                  <StatusPill>
                    {getEvidenceStrengthLabel(relation.evidenceStrength || "unknown")}
                  </StatusPill>
                </div>
                <div className="mt-2 text-sm font-medium text-slate-900">
                  {relation.fromNode?.text || relation.fromKnowledgePointId}
                  {" -> "}
                  {relation.toNode?.text || relation.toKnowledgePointId}
                </div>
                {relation.detail ? (
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {relation.detail}
                  </p>
                ) : null}
              </button>
            ))}
            {!visibleRelations.length ? (
              <div className="rounded border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                当前筛选条件下没有关系。
              </div>
            ) : null}
          </div>
        </SectionPanel>
      </div>

      <SectionPanel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="workshop-kicker">AI 关系候选</div>
            <h2 className="workshop-title mt-1 text-xl font-semibold">
              {selectedNode ? `从“${selectedNode.title}”出发` : "请先选择一个概念"}
            </h2>
          </div>
          <ActionButton
            type="button"
            variant="secondary"
            onClick={generateRelationCandidates}
            disabled={Boolean(busy) || !selectedNode}
          >
            {busy === "relation-candidates" ? "生成中..." : "AI 生成关系候选"}
          </ActionButton>
        </div>
        <input
          value={relationQuestion}
          onChange={(event) => setRelationQuestion(event.target.value)}
          disabled={Boolean(busy)}
          className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
          placeholder="可选关注点：前置关系、边界、类比、迁移等"
        />
        <div className="grid gap-3">
          {relationCandidates.map((candidate) => {
            const target = targetMap.get(candidate.targetWordId);
            const busyKey = `${candidate.targetWordId}-${candidate.relationType}`;
            return (
              <div key={busyKey} className="rounded border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <StatusPill>{getRelationKindLabel(candidate.relationType)}</StatusPill>
                      <StatusPill>
                        {getKnowledgeRelationStatusLabel(candidate.status || "candidate")}
                      </StatusPill>
                      <StatusPill>
                        {getEvidenceStrengthLabel(candidate.evidenceStrength)}
                      </StatusPill>
                    </div>
                    <div className="mt-2 text-sm font-medium text-slate-900">
                      {target?.text || candidate.targetWordId}
                      {target?.isWormholeTarget ? ` (${target.canvasName})` : ""}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {candidate.detail}
                    </p>
                    <div className="mt-2 rounded border border-slate-200 bg-white p-2 text-xs leading-5 text-slate-600">
                    保存为候选前请先核对：{candidate.userQuestion}
                    </div>
                  </div>
                  <ActionButton
                    type="button"
                    variant="secondary"
                    onClick={() => acceptRelationCandidate(candidate)}
                    disabled={Boolean(busy)}
                  >
                    保存候选
                  </ActionButton>
                </div>
              </div>
            );
          })}
          {!relationCandidates.length ? (
            <div className="rounded border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              先选择一个已沉淀的概念，再生成关系候选。
            </div>
          ) : null}
        </div>
      </SectionPanel>

      {selectedRelation ? (
        <SectionPanel>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="workshop-kicker">关系解释</div>
              <h2 className="workshop-title mt-1 text-xl font-semibold">
                {selectedRelation.fromNode?.text || "源节点"}
                {" -> "}
                {selectedRelation.toNode?.text || "目标节点"}
              </h2>
            </div>
            <ActionButton
              type="button"
              variant="secondary"
              onClick={explainRelation}
              disabled={Boolean(busy)}
            >
              {busy === "explain-relation" ? "生成中..." : "AI 解释关系"}
            </ActionButton>
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() => {
                setSelectedRelation(null);
                setRelationExplanation(null);
                setRelationDecision(emptyRelationDecision);
              }}
              disabled={Boolean(busy)}
            >
              关闭
            </ActionButton>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
            <div>类型：{getRelationKindLabel(selectedRelation.relationType)}</div>
            <div>
              状态：
              {getKnowledgeRelationStatusLabel(selectedRelation.status || "candidate")}
            </div>
            <div>
              证据强度：
              {getEvidenceStrengthLabel(selectedRelation.evidenceStrength || "unknown")}
            </div>
            {selectedRelation.detail ? (
              <div className="mt-2">{selectedRelation.detail}</div>
            ) : (
              <div className="mt-2">这条关系目前还没有经过确认的解释。</div>
            )}
            <fieldset
              className="mt-4 border-0 p-0"
              disabled={Boolean(busy)}
            >
              <div className="rounded border border-slate-200 bg-white p-3">
                <div className="text-sm font-medium text-slate-900">
                  人工确认
                </div>
                <textarea
                  value={relationDecision.userExplanation}
                  onChange={(event) =>
                    setRelationDecision((prev) => ({
                      ...prev,
                      userExplanation: event.target.value
                    }))
                  }
                  rows={3}
                  className="mt-2 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  placeholder="写下你确认或降级这条关系的解释、证据和保留意见。"
                />
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <select
                    value={relationDecision.evidenceStrength}
                    onChange={(event) =>
                      setRelationDecision((prev) => ({
                        ...prev,
                        evidenceStrength: event.target.value
                      }))
                    }
                    className="rounded border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="medium">中等证据</option>
                    <option value="strong">强证据</option>
                    <option value="weak">弱证据</option>
                    <option value="unknown">未知证据</option>
                  </select>
                  <input
                    value={relationDecision.applicability}
                    onChange={(event) =>
                      setRelationDecision((prev) => ({
                        ...prev,
                        applicability: event.target.value
                      }))
                    }
                    className="rounded border border-slate-200 px-3 py-2 text-sm"
                    placeholder="适用边界"
                  />
                  <input
                    value={relationDecision.misuseRisk}
                    onChange={(event) =>
                      setRelationDecision((prev) => ({
                        ...prev,
                        misuseRisk: event.target.value
                      }))
                    }
                    className="rounded border border-slate-200 px-3 py-2 text-sm"
                    placeholder="误用风险"
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton
                    type="button"
                    onClick={() => decideRelation("confirm")}
                    disabled={Boolean(busy)}
                  >
                    确认为正式关系
                  </ActionButton>
                  <ActionButton
                    type="button"
                    variant="secondary"
                    onClick={() => decideRelation("weak")}
                    disabled={Boolean(busy)}
                  >
                    降级为弱证据
                  </ActionButton>
                  <ActionButton
                    type="button"
                    variant="secondary"
                    onClick={() => decideRelation("reject")}
                    disabled={Boolean(busy)}
                  >
                    否定关系
                  </ActionButton>
                </div>
              </div>
            </fieldset>
            {relationExplanation ? (
              <div className="mt-3 rounded border border-indigo-200 bg-indigo-50 p-3 text-indigo-950">
                <div className="font-medium">{relationExplanation.summary}</div>
                {relationExplanation.connectionLogic.length ? (
                  <div className="mt-2">
                    推理逻辑：{relationExplanation.connectionLogic.join(" / ")}
                  </div>
                ) : null}
                <div className="mt-2">
                  边界检查：{relationExplanation.boundaryCheck}
                </div>
                <div className="mt-2">证据说明：{relationExplanation.evidenceNote}</div>
                {relationExplanation.misuseRisk ? (
                  <div className="mt-2">
                    误用风险：{relationExplanation.misuseRisk}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </SectionPanel>
      ) : null}
    </AppShell>
  );
}
