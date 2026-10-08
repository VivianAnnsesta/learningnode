"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum
} from "d3-force";
import ReactFlow, {
  Background,
  Controls,
  Edge,
  Handle,
  Node,
  Position,
  type Connection,
  useEdgesState,
  useNodesState,
  useUpdateNodeInternals,
  useReactFlow,
  useNodesInitialized,
  ReactFlowProvider
} from "reactflow";
import "reactflow/dist/style.css";
import { resolveNodeCollisions } from "../../../lib/layout/nodeCollision";
import FloatingEdge from "./FloatingEdge";

type WordTag = {
  tag: { name: string };
};

type CoreEssence = {
  id: string;
  summary: string;
  rationale?: string | null;
};

type SemanticCoreVersion = {
  id: string;
  coreId: string;
  version: number;
  statement: string;
  revisionReason?: string | null;
  createdAt: string;
};

type TransferChallenge = {
  id: string;
  prompt: string;
  userExplanation: string;
  aiAssessment?: string | null;
  passed: boolean;
  createdAt: string;
};

type CoreReviewSession = {
  id: string;
  userRecall: string;
  oldSampleExplanations?: string | null;
  transferExplanations?: string | null;
  aiFeedback?: string | null;
  result?: string | null;
  createdAt: string;
  transferChallenges: TransferChallenge[];
  createdVersions?: SemanticCoreVersion[];
};

type CoreReviewData = {
  core: CoreEssence | null;
  versions: SemanticCoreVersion[];
  reviews: CoreReviewSession[];
};

type TreeNode = {
  id: string;
  label: string;
  nodeType: string;
  content?: string | null;
};

type InferenceTree = {
  id: string;
  name?: string | null;
  nodes: TreeNode[];
};

type Word = {
  id: string;
  text: string;
  language?: string | null;
  canvasId?: string;
  positionX?: number | null;
  positionY?: number | null;
  coreEssences: CoreEssence[];
  trees: InferenceTree[];
  wordTags: WordTag[];
};

type WordRelation = {
  id: string;
  fromWordId: string;
  toWordId: string;
  relationType: string;
  detail?: string | null;
  status?: string | null;
  evidenceStrength?: string | null;
  userExplanation?: string | null;
  aiAssessment?: string | null;
  applicability?: string | null;
  misuseRisk?: string | null;
};

type GraphResponse = {
  words: Word[];
  relations: WordRelation[];
  portalTargets?: PortalTarget[];
};

type NodeData = {
  label: string;
  languageLabel: string;
  coreEssences: CoreEssence[];
  trees: InferenceTree[];
  width: number;
  height: number;
  aspectRatio: number;
  isHovered?: boolean;
  isWormholeTarget?: boolean;
  canvasName?: string;
  targetCanvasId?: string;
};

type EdgeData = {
  relationType: string;
};

type Canvas = {
  id: string;
  name: string;
};

type PortalTarget = {
  id: string;
  text: string;
  language?: string | null;
  canvasId: string;
  canvas?: { name: string };
};

type RelationCandidateTarget = {
  id: string;
  text: string;
  canvasId: string;
  canvasName: string;
  coreEssence?: string | null;
  isWormholeTarget: boolean;
};

type RelationCandidate = {
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

type TransferChallengeDraft = {
  prompt: string;
  relatedWordIds: string[];
  relationFocus: string;
  expectedReasoningMoves: string[];
  boundaryCheck: string;
  misuseRisk?: string | null;
  difficulty: string;
};

type Branch = {
  title: string;
  detail: string;
};

const createBranch = (): Branch => ({
  title: "",
  detail: ""
});

const DEFAULT_NODE_SETTINGS = {
  width: 260,
  height: 180,
  aspectRatio: 1.44
};

type NodeSettings = {
  width: number;
  height: number;
  aspectRatio: number;
};

function typeLabel(type: string) {
  if (type === "concept") return "概念";
  if (type === "process") return "过程";
  if (type === "usage") return "用法";
  if (type === "outcome") return "结果";
  return type;
}

function languageLabel(language?: string | null) {
  if (language === "en") return "英语";
  if (language === "zh") return "中文";
  if (language === "ja") return "日语";
  if (language === "fr") return "法语";
  if (language === "de") return "德语";
  if (language === "es") return "西语";
  if (language === "und" || !language) return "未知";
  return language;
}

const normalizeNodeSettings = (input: Partial<NodeSettings>): NodeSettings => {
  const width = Number.isFinite(input.width) ? Number(input.width) : 260;
  const height = Number.isFinite(input.height) ? Number(input.height) : 180;
  const aspectRatio = Number.isFinite(input.aspectRatio)
    ? Number(input.aspectRatio)
    : Number((width / height).toFixed(2));
  return {
    width: Math.min(640, Math.max(140, width)),
    height: Math.min(420, Math.max(100, height)),
    aspectRatio: Math.min(3.5, Math.max(0.5, aspectRatio))
  };
};

const SettingsPanel = ({
  value,
  onChange,
  onSave,
  onReset
}: {
  value: NodeSettings;
  onChange: (next: NodeSettings) => void;
  onSave: () => void;
  onReset: () => void;
}) => {
  const previewWidth = Math.max(80, Math.min(180, value.width * 0.45));
  const previewHeight = Math.max(
    56,
    Math.min(140, Math.max(value.height * 0.45, previewWidth / value.aspectRatio))
  );

  const updateWidth = (raw: string) => {
    const nextWidth = Number(raw);
    if (!Number.isFinite(nextWidth)) return;
    const safe = normalizeNodeSettings({
      ...value,
      width: nextWidth,
      height: nextWidth / value.aspectRatio
    });
    onChange(safe);
  };

  const updateHeight = (raw: string) => {
    const nextHeight = Number(raw);
    if (!Number.isFinite(nextHeight)) return;
    const safe = normalizeNodeSettings({
      ...value,
      height: nextHeight,
      aspectRatio: value.width / Math.max(nextHeight, 1)
    });
    onChange(safe);
  };

  const updateRatio = (raw: string) => {
    const nextRatio = Number(raw);
    if (!Number.isFinite(nextRatio)) return;
    const safe = normalizeNodeSettings({
      ...value,
      aspectRatio: nextRatio,
      height: value.width / Math.max(nextRatio, 0.1)
    });
    onChange(safe);
  };

  return (
    <div className="rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
      <div className="text-[11px] font-medium text-slate-500">节点默认尺寸</div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <label className="space-y-1">
          <span className="block text-[11px] text-slate-500">宽度(px)</span>
          <input
            type="number"
            min={140}
            max={640}
            step={1}
            value={Math.round(value.width)}
            onChange={(event) => updateWidth(event.target.value)}
            className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
          />
        </label>
        <label className="space-y-1">
          <span className="block text-[11px] text-slate-500">高度(px)</span>
          <input
            type="number"
            min={100}
            max={420}
            step={1}
            value={Math.round(value.height)}
            onChange={(event) => updateHeight(event.target.value)}
            className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
          />
        </label>
        <label className="space-y-1">
          <span className="block text-[11px] text-slate-500">长宽比</span>
          <input
            type="number"
            min={0.5}
            max={3.5}
            step={0.01}
            value={value.aspectRatio}
            onChange={(event) => updateRatio(event.target.value)}
            className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
          />
        </label>
      </div>
      <div className="mt-2 rounded border border-dashed border-slate-200 bg-slate-50 p-2">
        <div className="text-[11px] text-slate-500">实时预览</div>
        <div className="mt-2 flex h-[100px] items-center justify-center rounded border border-slate-200 bg-white">
          <div
            className="rounded border-2 border-amber-300 bg-amber-50"
            style={{ width: previewWidth, height: previewHeight }}
          />
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onReset}
          className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
        >
          恢复默认值
        </button>
        <button
          type="button"
          onClick={onSave}
          className="rounded border border-slate-900 px-2 py-1 text-[11px] text-slate-900 hover:bg-slate-50"
        >
          应用到新节点
        </button>
      </div>
    </div>
  );
};

const NodeCard = ({
  id,
  data,
  selected
}: {
  id: string;
  data: NodeData;
  selected?: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const previewEssences = data.coreEssences.slice(0, 2);
  const handleVisibility = selected
    ? "opacity-100"
    : "opacity-0 group-hover:opacity-100";
  const treeNodeCount = data.trees.reduce(
    (total, tree) => total + tree.nodes.length,
    0
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      updateNodeInternals(id);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [id, isExpanded, updateNodeInternals]);

  useEffect(() => {
    const target = cardRef.current;
    if (!target || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      updateNodeInternals(id);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [id, updateNodeInternals]);

  return (
    <div
      ref={cardRef}
      className={`group relative flex h-fit w-max min-w-[240px] max-w-[320px] flex-col gap-3 overflow-hidden rounded-2xl border bg-white p-4 text-left ${
        selected || data.isHovered
          ? "border-amber-400 ring-2 ring-amber-400 ring-offset-2 shadow-lg"
          : "border-slate-200 shadow-sm"
      }`}
    >
      <Handle
        type="source"
        id="floating-center-source"
        position={Position.Top}
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
        className={`rf-handle pointer-events-none h-8 w-8 rounded-full border-0 bg-transparent transition-opacity duration-150 ${handleVisibility}`}
      />
      <Handle
        type="target"
        id="floating-center-target"
        position={Position.Top}
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
        className={`rf-handle pointer-events-none h-8 w-8 rounded-full border-0 bg-transparent transition-opacity duration-150 ${handleVisibility}`}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        <div className="flex items-start justify-between gap-2 rounded-md bg-slate-50/60 px-2.5 py-2">
          <div className="truncate text-[15px] font-semibold text-slate-900">
            {data.label}
          </div>
          <div className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
            {data.languageLabel}
          </div>
        </div>

        {previewEssences.length > 0 ? (
          <div className="space-y-1.5 px-1">
            <div className="text-[10px] font-medium tracking-wide text-slate-500">
              核心本质
            </div>
            {previewEssences.map((essence) => (
              <div
                key={essence.id}
                className="whitespace-normal break-words text-sm leading-6 text-slate-700"
              >
                {essence.summary}
              </div>
            ))}
          </div>
        ) : null}

        <div className="space-y-2 rounded-md bg-slate-50/40 px-2.5 py-2">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="flex w-full items-center justify-between text-left text-xs text-slate-600"
          >
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
              推演节点 ({treeNodeCount})
            </span>
            <span className="text-[11px] text-slate-400">
              {isExpanded ? "收起 ▲" : "展开 ▼"}
            </span>
          </button>
          {isExpanded ? (
            <div className="space-y-1 rounded-md bg-slate-50 px-2 py-2">
              {data.trees.flatMap((tree) =>
                tree.nodes.map((node) => (
                  <div
                    key={node.id}
                    className="whitespace-normal break-words border-b border-slate-200 py-2 last:border-b-0"
                  >
                    <div className="whitespace-normal break-words text-xs font-semibold text-slate-700">
                      {typeLabel(node.nodeType)} · {node.label}
                    </div>
                    {node.content ? (
                      <div className="mt-1 whitespace-normal break-words text-[11px] leading-relaxed text-slate-500">
                        {node.content}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const PortalNode = ({ data }: { data: NodeData }) => (
  <div className="relative flex h-full w-full flex-col gap-2 overflow-hidden rounded-2xl border border-dashed border-violet-300 bg-gradient-to-br from-violet-50/90 to-fuchsia-50/70 px-4 py-3 text-left text-xs text-slate-700 shadow-[0_8px_20px_rgba(124,58,237,0.15)]">
    <Handle
      type="target"
      position={Position.Left}
      className="h-2 w-2 rounded-full border border-violet-300 bg-violet-200"
    />
    <Handle
      type="source"
      position={Position.Right}
      className="h-2 w-2 rounded-full border border-violet-300 bg-violet-200"
    />
    <div className="text-[11px] text-violet-500">
      🔗 {data.canvasName || "外部画布"}
    </div>
    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
      <span>🌌</span>
      <span>{data.label}</span>
    </div>
    <div className="text-[11px] text-slate-500">{data.languageLabel}</div>
  </div>
);

const relationLabel = (type: string) => {
  if (type === "derive") return "派生";
  if (type === "origin") return "源起";
  if (type === "synonym") return "同义";
  if (type === "antonym") return "反义";
  if (type === "WORMHOLE") return "虫洞";
  if (type === "related") return "相关";
  return type;
};

const relationStroke = (type: string) => {
  if (type === "WORMHOLE")
    return {
      stroke: "#7c3aed",
      strokeWidth: 2.6,
      strokeDasharray: "6 6"
    };
  if (type === "derive") return { stroke: "#0f766e", strokeWidth: 2.5 };
  if (type === "synonym") return { stroke: "#2563eb", strokeWidth: 2.5 };
  if (type === "antonym") return { stroke: "#dc2626", strokeWidth: 2.5 };
  if (type === "origin") return { stroke: "#7c3aed", strokeWidth: 2.2 };
  if (type === "related") return { stroke: "#64748b", strokeWidth: 1.6 };
  return { stroke: "#94a3b8", strokeWidth: 1.2 };
};

type ForceLayoutNode = SimulationNodeDatum & {
  id: string;
  width: number;
  height: number;
};

type ForceLayoutLink = SimulationLinkDatum<ForceLayoutNode> & {
  relationType: string;
};

const relationDistance = (relationType: string) => {
  if (relationType) return 450;
  return 450;
};

const useForceLayout = (
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  setNodes: (updater: (prev: Node<NodeData>[]) => Node<NodeData>[]) => void,
  getCenter: () => { x: number; y: number },
  onFinish?: (nextNodes: Node<NodeData>[]) => void | Promise<void>
) => {
  const simulationRef = useRef<ReturnType<typeof forceSimulation<ForceLayoutNode>> | null>(null);
  const frameRef = useRef<number | null>(null);
  const nodesRef = useRef<Node<NodeData>[]>(nodes);
  const edgesRef = useRef<Edge<EdgeData>[]>(edges);
  const onFinishRef = useRef<typeof onFinish>(onFinish);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const startForceLayout = useCallback(() => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    if (currentNodes.length === 0) return;
    simulationRef.current?.stop();
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const center = getCenter();
    const forceNodes: ForceLayoutNode[] = currentNodes.map((node) => ({
      id: node.id,
      x: node.position.x,
      y: node.position.y,
      width: node.width ?? node.data.width ?? DEFAULT_NODE_SETTINGS.width,
      height: node.height ?? node.data.height ?? DEFAULT_NODE_SETTINGS.height
    }));
    const nodeIdSet = new Set(forceNodes.map((node) => node.id));
    const forceLinks: ForceLayoutLink[] = currentEdges
      .filter((edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target))
      .map((edge) => ({
        source: edge.source,
        target: edge.target,
        relationType: edge.data?.relationType || "related"
      }));

    const mapById = () => new Map(forceNodes.map((node) => [node.id, node]));
    setIsRunning(true);
    simulationRef.current = forceSimulation(forceNodes)
      .force("charge", forceManyBody().strength(-4000))
      .force("link", forceLink<ForceLayoutNode, ForceLayoutLink>(forceLinks)
        .id((node) => node.id)
        .distance((link) => relationDistance(link.relationType))
        .strength(0.25))
      .force("center", forceCenter(center.x, center.y))
      .force(
        "collide",
        forceCollide<ForceLayoutNode>().radius((node) => {
          const safeWidth = Number.isFinite(node.width) ? node.width : 250;
          const safeHeight = Number.isFinite(node.height) ? node.height : 100;
          return Math.max(safeWidth, safeHeight) * 0.6 + 20;
        }).strength(1)
      )
      .alpha(1)
      .alphaDecay(0.02)
      .on("tick", () => {
        if (frameRef.current !== null) return;
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null;
          const positioned = mapById();
          setNodes((prev) =>
            prev.map((node) => {
              const hit = positioned.get(node.id);
              if (!hit) return node;
              return {
                ...node,
                position: { x: hit.x ?? node.position.x, y: hit.y ?? node.position.y }
              };
            })
          );
        });
      })
      .on("end", () => {
        setIsRunning(false);
        const positioned = mapById();
        const finalNodes = nodesRef.current.map((node) => {
          const hit = positioned.get(node.id);
          if (!hit) return node;
          return {
            ...node,
            position: { x: hit.x ?? node.position.x, y: hit.y ?? node.position.y }
          };
        });
        setNodes(() => finalNodes);
        void Promise.resolve(onFinishRef.current?.(finalNodes));
      });
  }, [getCenter, setNodes]);

  useEffect(() => {
    return () => {
      simulationRef.current?.stop();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return { startForceLayout, isRunning };
};

function GraphPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const canvasIdRaw = params?.canvasId;
  const canvasId = Array.isArray(canvasIdRaw) ? canvasIdRaw[0] : canvasIdRaw;
  const focusWordId = searchParams.get("focusWordId");
  const [canvasName, setCanvasName] = useState<string>("");
  const [words, setWords] = useState<Word[]>([]);
  const [relations, setRelations] = useState<WordRelation[]>([]);
  const [portalTargets, setPortalTargets] = useState<PortalTarget[]>([]);
  const [selected, setSelected] = useState<Word | null>(null);
  const [activeRelationId, setActiveRelationId] = useState<string | null>(null);
  const [relationTarget, setRelationTarget] = useState("");
  const [relationType, setRelationType] = useState("");
  const [relationDetail, setRelationDetail] = useState("");
  const [relationResult, setRelationResult] = useState<string | null>(null);
  const [relationCandidateQuestion, setRelationCandidateQuestion] = useState("");
  const [relationCandidates, setRelationCandidates] = useState<
    RelationCandidate[]
  >([]);
  const [relationCandidateTargets, setRelationCandidateTargets] = useState<
    RelationCandidateTarget[]
  >([]);
  const [relationCandidateLoading, setRelationCandidateLoading] =
    useState(false);
  const [relationCandidateError, setRelationCandidateError] = useState("");
  const [entryWord, setEntryWord] = useState("");
  const [entryEssence, setEntryEssence] = useState("");
  const [entryBranches, setEntryBranches] = useState<Branch[]>([createBranch()]);
  const [savingEntry, setSavingEntry] = useState(false);
  const [entryResult, setEntryResult] = useState<string | null>(null);
  const [editWord, setEditWord] = useState("");
  const [editEssence, setEditEssence] = useState("");
  const [editBranches, setEditBranches] = useState<Branch[]>([createBranch()]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editResult, setEditResult] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [showReviewHistory, setShowReviewHistory] = useState(false);
  const [reviewData, setReviewData] = useState<CoreReviewData | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewResult, setReviewResult] = useState<string | null>(null);
  const [reviewRecall, setReviewRecall] = useState("");
  const [reviewOldSamples, setReviewOldSamples] = useState("");
  const [transferPrompt, setTransferPrompt] = useState("");
  const [transferExplanation, setTransferExplanation] = useState("");
  const [transferChallengeGoal, setTransferChallengeGoal] = useState("");
  const [transferChallengeDraft, setTransferChallengeDraft] =
    useState<TransferChallengeDraft | null>(null);
  const [transferChallengeLoading, setTransferChallengeLoading] =
    useState(false);
  const [transferChallengeError, setTransferChallengeError] = useState("");
  const [aiFeedback, setAiFeedback] = useState("");
  const [reviewOutcome, setReviewOutcome] = useState("保留当前核心");
  const [revisedStatement, setRevisedStatement] = useState("");
  const [revisionReason, setRevisionReason] = useState("");
  const [transferPassed, setTransferPassed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [wormholeCanvasId, setWormholeCanvasId] = useState("");
  const [wormholeTarget, setWormholeTarget] = useState("");
  const [wormholeOptions, setWormholeOptions] = useState<Word[]>([]);
  const [wormholeLoading, setWormholeLoading] = useState(false);
  const [wormholeSelectedId, setWormholeSelectedId] = useState("");
  const [wormholeResult, setWormholeResult] = useState<string | null>(null);
  const [availableCanvases, setAvailableCanvases] = useState<Canvas[]>([]);
  const [relationDrafts, setRelationDrafts] = useState<
    Record<string, Partial<WordRelation>>
  >({});
  const [savingRelation, setSavingRelation] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [nodeSettings, setNodeSettings] = useState<NodeSettings>(
    DEFAULT_NODE_SETTINGS
  );
  const [settingsDraft, setSettingsDraft] = useState<NodeSettings>(
    DEFAULT_NODE_SETTINGS
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<NodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<EdgeData>([]);
  const reactFlow = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createPosition, setCreatePosition] = useState<{ x: number; y: number } | null>(null);
  const [edgeEditOpen, setEdgeEditOpen] = useState(false);
  const [edgeEditId, setEdgeEditId] = useState<string | null>(null);
  const [edgeEditType, setEdgeEditType] = useState("related");
  const [edgeEditResult, setEdgeEditResult] = useState<string | null>(null);
  const [savingEdgeEdit, setSavingEdgeEdit] = useState(false);
  const [graphResult, setGraphResult] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const focusedWordRef = useRef<string | null>(null);
  const hasAutoForceLayoutRef = useRef(false);
  const canvasNodesRef = useRef<Node<NodeData>[]>([]);

  useEffect(() => {
    canvasNodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    if (!nodesInitialized || nodes.length === 0) return;
    const frameId = requestAnimationFrame(() => {
      reactFlow.fitView({ padding: 0.2, duration: 0 });
    });
    return () => cancelAnimationFrame(frameId);
  }, [nodesInitialized, nodes.length, reactFlow]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("graph.nodeSettings");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<NodeSettings>;
      const normalized = normalizeNodeSettings(parsed);
      setNodeSettings(normalized);
      setSettingsDraft(normalized);
    } catch {
      setNodeSettings(DEFAULT_NODE_SETTINGS);
      setSettingsDraft(DEFAULT_NODE_SETTINGS);
    }
  }, []);

  const saveNodeSettings = useCallback((next: NodeSettings) => {
    const normalized = normalizeNodeSettings(next);
    setNodeSettings(normalized);
    setSettingsDraft(normalized);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("graph.nodeSettings", JSON.stringify(normalized));
    }
  }, []);

  const resolveNodeLayout = useCallback(
    (items: Node<NodeData>[], pinnedId?: string) => {
      const layoutInput = items.map((node) => {
        const width = node.width ?? node.data.width ?? nodeSettings.width;
        const height = node.height ?? node.data.height ?? nodeSettings.height;
        return {
          id: node.id,
          x: node.position.x,
          y: node.position.y,
          width,
          height,
          pinned: pinnedId === node.id || node.type === "portal"
        };
      });
      const resolved = resolveNodeCollisions(layoutInput, {
        gap: 24,
        iterations: 80
      });
      const resolvedMap = new Map(resolved.map((node) => [node.id, node]));
      return items.map((node) => {
        const target = resolvedMap.get(node.id);
        if (!target) return node;
        return {
          ...node,
          position: { x: target.x, y: target.y }
        };
      });
    },
    [nodeSettings.height, nodeSettings.width]
  );

  const persistNodePositions = useCallback(
    async (items: Node<NodeData>[]) => {
      if (!canvasId) return;
      const updates = items.filter((node) => node.type !== "portal");
      try {
        const responses = await Promise.all(
          updates.map((node) =>
            fetch(`/api/words/${node.id}/position?canvasId=${canvasId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                x: node.position.x,
                y: node.position.y
              })
            })
          )
        );
        if (responses.some((response) => !response.ok)) {
          setGraphResult("保存节点位置失败，请稍后重试。");
        }
      } catch {
        setGraphResult("保存节点位置失败：无法连接到应用服务。");
      }
    },
    [canvasId]
  );

  const getSimulationCenter = useCallback(() => {
    return reactFlow.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    });
  }, [reactFlow]);

  const { startForceLayout, isRunning: isForceLayouting } = useForceLayout(
    nodes,
    edges,
    setNodes,
    getSimulationCenter,
    async (nextNodes) => {
      await persistNodePositions(nextNodes);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });
      reactFlow.fitView({ padding: 0.2, duration: 300 });
    }
  );

  const wordMap = useMemo(() => {
    return new Map(words.map((word) => [word.id, word]));
  }, [words]);

  const targetOptions = useMemo(() => {
    return words
      .filter((word) => word.id !== selected?.id)
      .map((word) => ({
        id: word.id,
        label: `${word.text} · ${languageLabel(word.language)}`
      }));
  }, [words, selected]);

  const targetIdMap = useMemo(() => {
    return new Map(targetOptions.map((option) => [option.label, option.id]));
  }, [targetOptions]);

  const relationCandidateTargetMap = useMemo(() => {
    return new Map(
      relationCandidateTargets.map((target) => [target.id, target])
    );
  }, [relationCandidateTargets]);

  useEffect(() => {
    setRelationCandidates([]);
    setRelationCandidateTargets([]);
    setRelationCandidateError("");
    setRelationCandidateQuestion("");
    setRelationResult(null);
  }, [selected?.id]);

  const wormholeTargetMap = useMemo(() => {
    return new Map(
      wormholeOptions.map((option) => [
        `${option.text} · ${languageLabel(option.language)}`,
        option.id
      ])
    );
  }, [wormholeOptions]);

  useEffect(() => {
    const nextId = wormholeTargetMap.get(wormholeTarget) || "";
    if (nextId) {
      setWormholeSelectedId(nextId);
    }
  }, [wormholeTarget, wormholeTargetMap]);

  const resetReviewForm = () => {
    setReviewRecall("");
    setReviewOldSamples("");
    setTransferPrompt("");
    setTransferExplanation("");
    setTransferChallengeGoal("");
    setTransferChallengeDraft(null);
    setTransferChallengeError("");
    setAiFeedback("");
    setReviewOutcome("保留当前核心");
    setRevisionReason("");
    setTransferPassed(false);
    setReviewResult(null);
  };

  const loadCoreReview = async (wordId: string) => {
    if (!canvasId) return null;
    setReviewLoading(true);
    try {
      const response = await fetch(
        `/api/words/${wordId}/core-review?canvasId=${canvasId}`
      );
      if (!response.ok) {
        setReviewResult("加载回顾记录失败。");
        return null;
      }
      const data = (await response.json()) as CoreReviewData;
      setReviewData(data);
      setRevisedStatement(data.core?.summary || "");
      return data;
    } catch {
      setReviewResult("加载回顾记录失败：无法连接到应用服务。");
      return null;
    } finally {
      setReviewLoading(false);
    }
  };

  const handleOpenReview = async () => {
    if (!selected?.id) return;
    resetReviewForm();
    setReviewOpen(true);
    setShowReviewHistory(false);
    await loadCoreReview(selected.id);
  };

  const handleToggleReviewHistory = async () => {
    if (!selected?.id) return;
    const nextOpen = !showReviewHistory;
    setShowReviewHistory(nextOpen);
    if (nextOpen) {
      await loadCoreReview(selected.id);
    }
  };

  const handleReviewSubmit = async () => {
    if (!canvasId || !selected?.id) return;
    if (!reviewRecall.trim()) {
      setReviewResult("请先凭记忆复述核心");
      return;
    }
    setReviewSaving(true);
    setReviewResult(null);
    try {
      const response = await fetch(
        `/api/words/${selected.id}/core-review?canvasId=${canvasId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userRecall: reviewRecall,
            oldSampleExplanations: reviewOldSamples,
            transferPrompt,
            transferExplanation,
            aiFeedback,
            result: reviewOutcome,
            revisedStatement,
            revisionReason,
            passed: transferPassed
          })
        }
      );
      const data = await response.json();
      if (!response.ok) {
        setReviewResult(data?.error || "保存回顾失败");
        return;
      }
      setReviewResult("回顾已保存");
      await loadCoreReview(selected.id);
      await reloadGraph();
      await loadWordDetail(selected.id);
    } catch {
      setReviewResult("保存回顾失败");
    } finally {
      setReviewSaving(false);
    }
  };

  const handleGenerateTransferChallenge = async () => {
    if (!canvasId || !selected?.id || transferChallengeLoading) return;
    setTransferChallengeLoading(true);
    setTransferChallengeError("");
    try {
      const response = await fetch(
        `/api/words/${selected.id}/transfer-challenge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            canvasId,
            userGoal: transferChallengeGoal
          })
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setTransferChallengeError(data.error || "生成迁移挑战失败");
        return;
      }
      const challenge = data.challenge as TransferChallengeDraft | undefined;
      if (!challenge) {
        setTransferChallengeError("AI 未返回有效迁移挑战");
        return;
      }
      setTransferChallengeDraft(challenge);
      setTransferPrompt(challenge.prompt);
      setAiFeedback((prev) => {
        const next = [
          `迁移焦点：${challenge.relationFocus}`,
          `边界检查：${challenge.boundaryCheck}`,
          challenge.misuseRisk ? `误用风险：${challenge.misuseRisk}` : ""
        ]
          .filter(Boolean)
          .join("\n");
        return prev.trim() ? `${prev.trim()}\n${next}` : next;
      });
    } finally {
      setTransferChallengeLoading(false);
    }
  };

  const addBranch = () => {
    setEntryBranches((prev) => [...prev, createBranch()]);
  };

  const updateBranch = (index: number, key: keyof Branch, value: string) => {
    setEntryBranches((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [key]: value } : item))
    );
  };

  const removeBranch = (index: number) => {
    setEntryBranches((prev) => prev.filter((_, i) => i !== index));
  };

  const addEditBranch = () => {
    setEditBranches((prev) => [...prev, createBranch()]);
  };

  const updateEditBranch = (index: number, key: keyof Branch, value: string) => {
    setEditBranches((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [key]: value } : item))
    );
  };

  const removeEditBranch = (index: number) => {
    setEditBranches((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEntrySubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (!canvasId) return;
    if (!entryWord.trim()) {
      setEntryResult("节点名称不能为空");
      return;
    }
    setSavingEntry(true);
    setEntryResult(null);
    const payload = {
      word: entryWord.trim(),
      coreEssence: entryEssence.trim(),
      branches: entryBranches,
      canvasId
    };

    try {
      const response = await fetch("/api/words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        setEntryResult(data?.error || "保存失败");
        return;
      }
      let positionWarning = "";
      if (createPosition && data?.id) {
        try {
          const positionResponse = await fetch(
            `/api/words/${data.id}/position?canvasId=${canvasId}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                x: createPosition.x,
                y: createPosition.y
              })
            }
          );
          if (!positionResponse.ok) {
            positionWarning = "节点已保存，但位置保存失败。";
          }
        } catch {
          positionWarning = "节点已保存，但位置保存失败：无法连接到应用服务。";
        }
      }
      setEntryWord("");
      setEntryEssence("");
      setEntryBranches([createBranch()]);
      setEntryResult(positionWarning || "已保存");
      setCreateModalOpen(false);
      setCreatePosition(null);
      await reloadGraph();
    } catch {
      setEntryResult("保存失败");
    } finally {
      setSavingEntry(false);
    }
  };

  const loadWordDetail = async (wordId: string) => {
    if (!canvasId) return;
    try {
      const response = await fetch(`/api/words/${wordId}?canvasId=${canvasId}`);
      if (!response.ok) {
        setEditResult("加载节点详情失败。");
        return;
      }
      const data = await response.json();
      const word = data.word as Word | undefined;
      if (!word) {
        setEditResult("加载节点详情失败。");
        return;
      }
      setSelected(word);
      setEditWord(word.text || "");
      setEditEssence(word.coreEssences?.[0]?.summary || "");
      const nodes = word.trees?.[0]?.nodes || [];
      if (nodes.length > 0) {
        setEditBranches(
          nodes.map((node) => ({
            title: node.label || "",
            detail: node.content || ""
          }))
        );
      } else {
        setEditBranches([createBranch()]);
      }
      setEditResult(null);
    } catch {
      setEditResult("加载节点详情失败：无法连接到应用服务。");
    }
  };

  const handleEditSubmit = async () => {
    if (!canvasId || !selected?.id) return;
    if (!editWord.trim()) {
      setEditResult("节点名称不能为空");
      return;
    }
    setSavingEdit(true);
    setEditResult(null);
    const payload = {
      word: editWord.trim(),
      coreEssence: editEssence.trim(),
      branches: editBranches
    };
    try {
      const response = await fetch(
        `/api/words/${selected.id}?canvasId=${canvasId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      const data = await response.json();
      if (!response.ok) {
        setEditResult(data?.error || "更新失败");
        return;
      }
      setSelected(data.word || null);
      setEditResult("已更新");
      await reloadGraph();
    } catch {
      setEditResult("更新失败");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!canvasId || !selected?.id) return;
    if (!window.confirm("确定要删除此概念及其所有衍生逻辑吗？")) return;
    try {
      const response = await fetch(
        `/api/words/${selected.id}?canvasId=${canvasId}`,
        { method: "DELETE" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setEditResult(data?.error || "删除失败");
        return;
      }
      setSelected(null);
      setEditResult(null);
      setReviewOpen(false);
      setShowReviewHistory(false);
      setReviewData(null);
      await reloadGraph();
    } catch {
      setEditResult("删除失败：无法连接到应用服务");
    }
  };

  const handleWormholeSearch = async (query: string) => {
    setWormholeTarget(query);
    setWormholeSelectedId("");
    setWormholeResult(null);
    if (!wormholeCanvasId || !query.trim()) {
      setWormholeOptions([]);
      return;
    }
    setWormholeLoading(true);
    try {
      const response = await fetch(
        `/api/words?query=${encodeURIComponent(query)}&canvasId=${wormholeCanvasId}`
      );
      if (!response.ok) {
        setWormholeResult("搜索目标节点失败");
        return;
      }
      const data = await response.json();
      setWormholeOptions(data.words || []);
    } catch {
      setWormholeResult("搜索目标节点失败：无法连接到应用服务");
    } finally {
      setWormholeLoading(false);
    }
  };

  const handleCreateWormhole = async () => {
    if (!canvasId || !selected?.id || !wormholeCanvasId) return;
    const targetId =
      wormholeSelectedId ||
      wormholeTargetMap.get(wormholeTarget) ||
      (wormholeOptions.length === 1 ? wormholeOptions[0].id : "");
    if (!targetId) return;
    setWormholeResult(null);
    try {
      const response = await fetch("/api/relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromWordId: selected.id,
          toWordId: targetId,
          relationType: "WORMHOLE",
          detail: null,
          canvasId
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setWormholeResult(data?.error || "建立虫洞失败");
        return;
      }
      setWormholeTarget("");
      setWormholeOptions([]);
      setWormholeSelectedId("");
      await reloadGraph();
    } catch {
      setWormholeResult("建立虫洞失败：无法连接到应用服务");
    }
  };

  const handleGenerateRelationCandidates = async () => {
    if (!canvasId || !selected?.id || relationCandidateLoading) return;
    setRelationCandidateLoading(true);
    setRelationCandidateError("");
    try {
      const response = await fetch(
        `/api/words/${selected.id}/relation-candidates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            canvasId,
            userQuestion: relationCandidateQuestion
          })
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRelationCandidateError(data.error || "生成关系候选失败");
        return;
      }
      setRelationCandidates(data.candidates || []);
      setRelationCandidateTargets(data.targets || []);
    } catch {
      setRelationCandidateError("生成关系候选失败：无法连接到应用服务");
    } finally {
      setRelationCandidateLoading(false);
    }
  };

  const handleAcceptRelationCandidate = async (
    candidate: RelationCandidate
  ) => {
    if (!canvasId || !selected?.id || savingRelation) return;
    setSavingRelation(true);
    try {
      const response = await fetch("/api/relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromWordId: selected.id,
          toWordId: candidate.targetWordId,
          relationType: candidate.relationType,
          detail: candidate.detail,
          canvasId,
          status: candidate.status,
          evidenceStrength: candidate.evidenceStrength,
          aiAssessment: candidate.userQuestion,
          applicability: candidate.applicability,
          misuseRisk: candidate.misuseRisk
        })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setRelationCandidateError(data.error || "保存关系候选失败");
        return;
      }
      setRelationCandidates((prev) =>
        prev.filter(
          (item) =>
            item.targetWordId !== candidate.targetWordId ||
            item.relationType !== candidate.relationType
        )
      );
      await reloadGraph();
    } catch {
      setRelationCandidateError("保存关系候选失败：无法连接到应用服务");
    } finally {
      setSavingRelation(false);
    }
  };

  const handleExport = async () => {
    if (!canvasId || exporting) return;
    setExporting(true);
    try {
      const response = await fetch(`/api/canvas/${canvasId}/export`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        window.alert(data?.error || "导出失败");
        return;
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const asciiMatch = disposition.match(/filename="([^"]+)"/i);
      const filename = utf8Match?.[1]
        ? decodeURIComponent(utf8Match[1])
        : asciiMatch?.[1] || "knowledge_graph.json";
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch {
      window.alert("导出失败：无法连接到应用服务");
    } finally {
      setExporting(false);
    }
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleImportFile = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!canvasId) return;
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      let payload: unknown;
      try {
        payload = JSON.parse(await file.text());
      } catch {
        setImportResult("导入失败：文件不是有效的 JSON。");
        return;
      }
      const response = await fetch(`/api/canvas/${canvasId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setImportResult(data.error || "导入失败。");
        return;
      }
      await reloadGraph();
      setImportResult(
        `导入完成：新增 ${data.createdWords || 0} 个节点，跳过 ${
          data.skippedWords || 0
        } 个节点，新增 ${data.importedRelations || 0} 条关系，跳过 ${
          data.skippedRelations || 0
        } 条重复关系。`
      );
    } catch {
      setImportResult("导入失败：无法连接到应用服务。");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  useEffect(() => {
    if (!canvasId) return;
    const loadCanvas = async () => {
      try {
        const response = await fetch("/api/canvas");
        if (!response.ok) {
          setGraphResult("加载兼容画布列表失败。");
          return;
        }
        const data = await response.json();
        const canvas = (data.canvases || []).find(
          (item: Canvas) => item.id === canvasId
        );
        setCanvasName(canvas?.name || "");
        setAvailableCanvases(
          (data.canvases || []).filter((item: Canvas) => item.id !== canvasId)
        );
      } catch {
        setGraphResult("加载兼容画布列表失败：无法连接到应用服务。");
      }
    };
    loadCanvas();
  }, [canvasId]);

  const buildNodes = useCallback((items: Word[], prevNodes: Node<NodeData>[]) => {
    const prevMap = new Map(prevNodes.map((node) => [node.id, node]));
    return items.map((word, index) => {
      const coreEssences = word.coreEssences || [];
      const trees = word.trees || [];
      const prev = prevMap.get(word.id);
      const storedPosition =
        word.positionX !== null &&
        word.positionX !== undefined &&
        word.positionY !== null &&
        word.positionY !== undefined
          ? { x: word.positionX, y: word.positionY }
          : null;
      const position =
        storedPosition ??
        prev?.position ?? {
          x: (index % 4) * (nodeSettings.width + 36),
          y: Math.floor(index / 4) * (nodeSettings.height + 28)
        };
      const node: Node<NodeData> = {
        id: word.id,
        position,
        type: "default",
        data: {
          label: word.text,
          languageLabel: languageLabel(word.language),
          coreEssences,
          trees,
          width: nodeSettings.width,
          height: nodeSettings.height,
          aspectRatio: nodeSettings.aspectRatio
        },
        draggable: true,
        className: "rounded-2xl border-none bg-transparent p-0 shadow-none cursor-pointer"
      };
      return node;
    });
  }, [nodeSettings.aspectRatio, nodeSettings.height, nodeSettings.width]);

  const buildPortalNodes = useCallback((items: PortalTarget[]) => {
    return items.map((target, index) => {
      const node: Node<NodeData> = {
        id: target.id,
        position: {
          x: 80 + (index % 2) * (nodeSettings.width + 40),
          y: 80 + Math.floor(index / 2) * (nodeSettings.height + 32)
        },
        type: "portal",
        data: {
          label: target.text,
          languageLabel: languageLabel(target.language),
          coreEssences: [],
          trees: [],
          isWormholeTarget: true,
          canvasName: target.canvas?.name || "外部画布",
          targetCanvasId: target.canvasId,
          width: nodeSettings.width,
          height: nodeSettings.height,
          aspectRatio: nodeSettings.aspectRatio
        },
        draggable: false,
        className: "rounded-2xl border-none bg-transparent p-0 shadow-none",
        style: {
          width: nodeSettings.width,
          minHeight: nodeSettings.height
        }
      };
      return node;
    });
  }, [nodeSettings.aspectRatio, nodeSettings.height, nodeSettings.width]);

  const buildEdges = useCallback((items: WordRelation[]) => {
    return items.map((rel) => ({
      id: rel.id,
      source: rel.fromWordId,
      target: rel.toWordId,
      data: { relationType: rel.relationType },
      label: relationLabel(rel.relationType),
      type: "floating",
      animated: false,
      style: relationStroke(rel.relationType),
    }));
  }, []);

  const applyEdgeFocus = useCallback(
    (focusId: string | null, list: Edge<EdgeData>[]) => {
      return list.map((edge) => {
        const relationType = edge.data?.relationType || "related";
        const baseStyle = relationStroke(relationType);
        if (!focusId) {
          return {
            ...edge,
            animated: false,
            style: { ...baseStyle, strokeOpacity: 1 },
            labelStyle: {
              fontSize: 11,
              fill: "#475569"
            },
            labelBgStyle: {
              fill: "#ffffff",
              fillOpacity: 0.9,
              stroke: "#e2e8f0"
            }
          };
        }
        const isRelated = edge.source === focusId || edge.target === focusId;
        return {
          ...edge,
          animated: isRelated,
          style: isRelated
            ? { stroke: "#f59e0b", strokeWidth: 3.6 }
            : { ...baseStyle, strokeOpacity: 0.25 },
          labelStyle: {
            fontSize: 11,
            fill: isRelated ? "#b45309" : "#94a3b8"
          },
          labelBgStyle: {
            fill: "#ffffff",
            fillOpacity: isRelated ? 0.95 : 0.6,
            stroke: isRelated ? "#f59e0b" : "#e2e8f0"
          }
        };
      });
    },
    []
  );

  useEffect(() => {
    if (!canvasId) return;
    const load = async () => {
      try {
        const response = await fetch(`/api/graph?canvasId=${canvasId}`);
        if (!response.ok) {
          setGraphResult("加载兼容图谱失败。");
          return;
        }
        const data: GraphResponse = await response.json();
        setWords(data.words || []);
        setRelations(data.relations || []);
        setPortalTargets(data.portalTargets || []);
        const nextSelected = (prevSelected: Word | null) =>
          prevSelected
            ? (data.words || []).find((item) => item.id === prevSelected.id) || null
            : null;
        setNodes((prev) => {
          const baseNodes = buildNodes(
            data.words || [],
            prev.filter((node) => node.type !== "portal")
          );
          const portalNodes = buildPortalNodes(data.portalTargets || []);
          return resolveNodeLayout([...baseNodes, ...portalNodes]);
        });
        setSelected((prev) => nextSelected(prev));
        setEdges(() => applyEdgeFocus(null, buildEdges(data.relations || [])));
        setActiveRelationId(null);
      } catch {
        setGraphResult("加载兼容图谱失败：无法连接到应用服务。");
      }
    };
    load();
  }, [
    applyEdgeFocus,
    buildEdges,
    buildNodes,
    buildPortalNodes,
    canvasId,
    resolveNodeLayout,
    setEdges,
    setNodes
  ]);

  const reloadGraph = useCallback(async () => {
    if (!canvasId) return;
    try {
      const response = await fetch(`/api/graph?canvasId=${canvasId}`);
      if (!response.ok) {
        setGraphResult("刷新兼容图谱失败。");
        return;
      }
      const data: GraphResponse = await response.json();
      setWords(data.words || []);
      setRelations(data.relations || []);
      setPortalTargets(data.portalTargets || []);
      setNodes((prev) => {
        const baseNodes = buildNodes(
          data.words || [],
          prev.filter((node) => node.type !== "portal")
        );
        const portalNodes = buildPortalNodes(data.portalTargets || []);
        return resolveNodeLayout([...baseNodes, ...portalNodes]);
      });
      const nextSelected = (prevSelected: Word | null) =>
        prevSelected
          ? (data.words || []).find((item) => item.id === prevSelected.id) || null
          : null;
      setSelected((prev) => nextSelected(prev));
      const nextSelectedId = selected?.id || null;
      setEdges(() =>
        applyEdgeFocus(nextSelectedId, buildEdges(data.relations || []))
      );
      setActiveRelationId(null);
    } catch {
      setGraphResult("刷新兼容图谱失败：无法连接到应用服务。");
    }
  }, [
    applyEdgeFocus,
    buildEdges,
    buildNodes,
    buildPortalNodes,
    canvasId,
    resolveNodeLayout,
    selected?.id,
    setEdges,
    setNodes
  ]);

  const handleAutoLayout = useCallback(() => {
    startForceLayout();
  }, [startForceLayout]);

  useEffect(() => {
    if (hasAutoForceLayoutRef.current) return;
    if (nodes.length === 0) return;
    hasAutoForceLayoutRef.current = true;
    startForceLayout();
  }, [nodes.length, startForceLayout]);

  const handleEdgeEditSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!edgeEditId || !edgeEditType.trim()) return;
      setSavingEdgeEdit(true);
      setEdgeEditResult(null);
      try {
        const response = await fetch(
          `/api/relations/${edgeEditId}?canvasId=${canvasId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              relationType: edgeEditType.trim(),
              detail: null
            })
          }
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setEdgeEditResult(data?.error || "保存关系失败");
          return;
        }
        setEdgeEditOpen(false);
        setEdgeEditId(null);
        await reloadGraph();
      } catch {
        setEdgeEditResult("保存关系失败：无法连接到应用服务");
      } finally {
        setSavingEdgeEdit(false);
      }
    },
    [canvasId, edgeEditId, edgeEditType, reloadGraph]
  );

  const focusOnNode = useCallback(
    (node: Node<NodeData>) => {
      const centerX =
        (node.positionAbsolute?.x ?? node.position.x) + (node.width ?? 0) / 2;
      const centerY =
        (node.positionAbsolute?.y ?? node.position.y) + (node.height ?? 0) / 2;
      reactFlow.setCenter(centerX, centerY, { zoom: 1.1, duration: 300 });
      setEdges((prev) => applyEdgeFocus(node.id, prev));
    },
    [applyEdgeFocus, reactFlow, setEdges]
  );

  const nodeTypes = useMemo(
    () => ({ default: NodeCard, portal: PortalNode }),
    []
  );
  const edgeTypes = useMemo(() => ({ floating: FloatingEdge }), []);
  const displayNodes = useMemo(() => {
    if (!hoveredNodeId) return nodes;
    return nodes.map((node) => {
      if (node.id !== hoveredNodeId) {
        if (!node.data.isHovered) return node;
        return { ...node, data: { ...node.data, isHovered: false } };
      }
      if (node.data.isHovered) return node;
      return { ...node, data: { ...node.data, isHovered: true } };
    });
  }, [hoveredNodeId, nodes]);

  useEffect(() => {
    if (!focusWordId) return;
    if (focusedWordRef.current === focusWordId) return;
    const node = nodes.find((item) => item.id === focusWordId);
    if (node) {
      focusOnNode(node);
      const targetWord = words.find((item) => item.id === focusWordId) || null;
      if (targetWord) {
        setSelected(targetWord);
        setEditWord(targetWord.text || "");
        setEditEssence(targetWord.coreEssences?.[0]?.summary || "");
        const targetNodes = targetWord.trees?.[0]?.nodes || [];
        if (targetNodes.length > 0) {
          setEditBranches(
            targetNodes.map((treeNode) => ({
              title: treeNode.label || "",
              detail: treeNode.content || ""
            }))
          );
        } else {
          setEditBranches([createBranch()]);
        }
        setEditResult(null);
        setReviewOpen(false);
        setShowReviewHistory(false);
        setReviewData(null);
        setReviewResult(null);
      }
      focusedWordRef.current = focusWordId;
    }
  }, [focusOnNode, focusWordId, nodes, words]);

  if (!canvasId) {
    return (
      <div className="workshop-page flex h-screen w-screen items-center justify-center text-sm text-slate-500">
        无效画布
      </div>
    );
  }

  const selectedCore = selected?.coreEssences?.[0] || null;
  const versionList = reviewData?.versions || [];
  const latestVersionStatement =
    versionList[0]?.statement || reviewData?.core?.summary || selectedCore?.summary || "";

  return (
    <div className="workshop-page relative flex h-screen w-screen overflow-hidden">
      <div className="flex-1">
        <ReactFlow
          nodes={displayNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          nodesConnectable
          nodesDraggable
          panOnDrag
          selectionOnDrag
          connectionRadius={22}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={async (_event, node) => {
            const nextNodes = resolveNodeLayout(
              canvasNodesRef.current.map((current) =>
                current.id === node.id
                  ? { ...current, position: node.position }
                  : current
              ),
              node.id
            );
            canvasNodesRef.current = nextNodes;
            setNodes(() => nextNodes);
            await persistNodePositions(nextNodes);
          }}
          onConnect={async (connection: Connection) => {
            if (!connection.source || !connection.target) return;
            setGraphResult(null);
            try {
              const response = await fetch("/api/relations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  fromWordId: connection.source,
                  toWordId: connection.target,
                  relationType: "related",
                  detail: null,
                  canvasId
                })
              });
              const data = await response.json().catch(() => ({}));
              if (!response.ok) {
                setGraphResult(data?.error || "保存关系失败");
                return;
              }
              await reloadGraph();
            } catch {
              setGraphResult("保存关系失败：无法连接到应用服务");
            }
          }}
          onNodeClick={(_, node) => {
            if (node.type === "portal" || node.data?.isWormholeTarget) {
              const canvasName = node.data?.canvasName || "外部画布";
              const label = node.data?.label || "";
              const ok = window.confirm(
                `这是一个虫洞节点，通往【${canvasName}】的【${label}】。是否立即穿越？`
              );
              if (ok) {
                const targetCanvasId = node.data?.targetCanvasId || "";
                if (targetCanvasId) {
                  router.push(
                    `/canvas/${targetCanvasId}?focusWordId=${node.id}`
                  );
                }
              }
              return;
            }
            loadWordDetail(node.id);
            setRelationTarget("");
            setRelationType("");
            setRelationDetail("");
            setActiveRelationId(null);
            setReviewOpen(false);
            setShowReviewHistory(false);
            setReviewData(null);
            setReviewResult(null);
            focusOnNode(node);
          }}
          onNodeMouseEnter={(_, node) => {
            setHoveredNodeId(node.id);
          }}
          onNodeMouseLeave={() => {
            setHoveredNodeId(null);
          }}
          onPaneClick={(event) => {
            if (event.detail === 2) {
              const position = reactFlow.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY
              });
              setCreatePosition(position);
              setCreateModalOpen(true);
              setEntryResult(null);
              setEntryWord("");
              setEntryEssence("");
              setEntryBranches([createBranch()]);
              return;
            }
            setSelected(null);
            setActiveRelationId(null);
            setRelationDrafts({});
            setEditResult(null);
            setEdgeEditOpen(false);
            setReviewOpen(false);
            setShowReviewHistory(false);
            setReviewData(null);
            setReviewResult(null);
          }}
          onEdgeClick={(_, edge) => {
            const word = words.find((item) => item.id === edge.source) || null;
            setSelected(word);
            setActiveRelationId(edge.id);
            setEdges((prev) => applyEdgeFocus(edge.source, prev));
            const current = edge.data?.relationType || "related";
            setEdgeEditId(edge.id);
            setEdgeEditType(current);
            setEdgeEditResult(null);
            setEdgeEditOpen(true);
          }}
        >
          <Background color="#e2e8f0" gap={24} />
          <Controls />
        </ReactFlow>
        <div className="absolute left-4 top-4 z-10 space-y-3">
          <div className="max-w-[720px] rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 shadow-sm">
            Compatibility canvas: keep using this workspace only for legacy graph
            editing, import/export, and migration-era tools. The PRD v1.2 main
            learning flow now lives under domain map, learning node, diagnostics,
            and knowledge graph pages. Return to
            {" "}
            <Link
              href={`/learning/domains/${canvasId}`}
              className="font-medium underline underline-offset-4"
            >
              Domain map
            </Link>
            {" "}or{" "}
            <Link
              href={`/learning/domains/${canvasId}/knowledge-graph`}
              className="font-medium underline underline-offset-4"
            >
              Knowledge graph
            </Link>
            .
          </div>
          {graphResult ? (
            <div
              role="alert"
              className="max-w-[720px] rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700 shadow-sm"
            >
              {graphResult}
            </div>
          ) : null}
          <div className="flex items-center gap-3 rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
            <Link href="/" className="text-xs text-slate-600 underline">
              返回工作台
            </Link>
            <span className="text-[11px] text-slate-400">/</span>
            <span className="text-xs text-slate-700">
              {canvasName || canvasId}
            </span>
            <span className="text-[11px] text-slate-400">/</span>
            <button
              type="button"
              onClick={() => setShowSettings((prev) => !prev)}
              className="text-xs text-slate-600 underline"
            >
              ⚙️ 节点设置
            </button>
            <button
              type="button"
              onClick={handleAutoLayout}
              disabled={isForceLayouting}
              className="text-xs text-slate-600 underline disabled:opacity-60"
            >
              {isForceLayouting ? "🌀 整理中..." : "✨ 物理整理"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreatePosition(null);
                setCreateModalOpen(true);
                setEntryResult(null);
              }}
              className="text-xs text-slate-600 underline"
            >
              ➕ 新建节点
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="text-xs text-slate-600 underline disabled:opacity-60"
            >
              {exporting ? "导出中..." : "⬇️ 导出图谱"}
            </button>
            <button
              type="button"
              onClick={handleImportClick}
              disabled={importing}
              className="text-xs text-slate-600 underline disabled:opacity-60"
            >
              {importing ? "导入中..." : "⬆️ 导入图谱"}
            </button>
            {importResult ? (
              <span role="status" className="text-[11px] text-slate-600">
                {importResult}
              </span>
            ) : null}
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              onChange={handleImportFile}
              className="hidden"
            />
          </div>
          {showSettings ? (
            <SettingsPanel
              value={settingsDraft}
              onChange={setSettingsDraft}
              onReset={() => {
                saveNodeSettings(DEFAULT_NODE_SETTINGS);
              }}
              onSave={() => {
                saveNodeSettings(settingsDraft);
              }}
            />
          ) : null}
        </div>
        {createModalOpen ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/45 backdrop-blur-[1px]">
            <form
              onSubmit={handleEntrySubmit}
              className="w-[360px] max-h-[75vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-lg"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium text-slate-700">
                  新建节点
                  {createPosition ? (
                    <span className="ml-2 text-[10px] text-slate-400">
                      @{Math.round(createPosition.x)}, {Math.round(createPosition.y)}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCreateModalOpen(false);
                    setCreatePosition(null);
                  }}
                  className="text-[11px] text-slate-500 underline"
                >
                  关闭
                </button>
              </div>
              <div>
                <label className="text-[11px] text-slate-500">名称</label>
                <input
                  value={entryWord}
                  onChange={(event) => setEntryWord(event.target.value)}
                  placeholder="输入新节点/概念 (Word/Concept)"
                  className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-400"
                />
              </div>
              <div className="mt-2">
                <label className="text-[11px] text-slate-500">核心本质</label>
                <textarea
                  value={entryEssence}
                  onChange={(event) => setEntryEssence(event.target.value)}
                  placeholder="描述核心本质/定义"
                  rows={3}
                  className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-400"
                />
              </div>
              <div className="mt-2 space-y-2">
                {entryBranches.map((branch, index) => (
                  <div key={index} className="space-y-2 rounded border border-slate-200 p-2">
                    <input
                      value={branch.title}
                      onChange={(event) =>
                        updateBranch(index, "title", event.target.value)
                      }
                      placeholder="推演节点名称"
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-400"
                    />
                    <textarea
                      value={branch.detail}
                      onChange={(event) =>
                        updateBranch(index, "detail", event.target.value)
                      }
                      placeholder="推演说明"
                      rows={2}
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-400"
                    />
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={addBranch}
                        className="text-[11px] text-slate-600 underline"
                      >
                        添加
                      </button>
                      <button
                        type="button"
                        onClick={() => removeBranch(index)}
                        className="text-[11px] text-slate-500 underline"
                      >
                        移除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={savingEntry}
                  className="rounded border border-slate-900 px-3 py-1 text-xs text-slate-900 disabled:opacity-60"
                >
                  {savingEntry ? "保存中..." : "保存"}
                </button>
                {entryResult ? (
                  <span className="text-[11px] text-slate-500">{entryResult}</span>
                ) : null}
              </div>
            </form>
          </div>
        ) : null}
        {edgeEditOpen ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/35 backdrop-blur-[1px]">
            <form
              onSubmit={handleEdgeEditSubmit}
              className="w-[300px] rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-lg"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium text-slate-700">修改关系类型</div>
                <button
                  type="button"
                  onClick={() => {
                    setEdgeEditOpen(false);
                    setEdgeEditId(null);
                  }}
                  className="text-[11px] text-slate-500 underline"
                >
                  关闭
                </button>
              </div>
              <select
                value={edgeEditType}
                onChange={(event) => setEdgeEditType(event.target.value)}
                className="w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-400"
              >
                <option value="related">相关</option>
                <option value="derive">派生</option>
                <option value="origin">源起</option>
                <option value="synonym">同义</option>
                <option value="antonym">反义</option>
                <option value="WORMHOLE">虫洞</option>
              </select>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEdgeEditOpen(false);
                    setEdgeEditId(null);
                  }}
                  className="rounded border border-slate-200 px-2 py-1 text-[11px]"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={savingEdgeEdit}
                  className="rounded border border-slate-900 px-2 py-1 text-[11px] text-slate-900 disabled:opacity-60"
                >
                  {savingEdgeEdit ? "保存中..." : "保存"}
                </button>
              </div>
              {edgeEditResult ? (
                <div className="mt-2 text-[11px] text-rose-600">
                  {edgeEditResult}
                </div>
              ) : null}
            </form>
          </div>
        ) : null}
      </div>

      <div
        className={`fixed right-0 top-0 h-full w-[360px] border-l border-slate-200 bg-white px-4 py-6 transition-transform duration-300 ${
          selected ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {selected ? (
          <div className="flex h-full flex-col gap-4 overflow-y-auto">
            <div className="space-y-3 rounded border border-slate-200 p-3">
              <div className="text-xs font-medium text-slate-500">节点详情与编辑</div>
              <div>
                <label className="text-[11px] text-slate-500">名称</label>
                <input
                  value={editWord}
                  onChange={(event) => setEditWord(event.target.value)}
                  className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500">核心本质</label>
                {reviewOpen ? (
                  <div className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-2 text-[11px] leading-5 text-amber-700">
                    核心回顾进行中，原核心已隐藏。请先在下方凭记忆复述，再查看旧版本对照。
                  </div>
                ) : (
                  <textarea
                    value={editEssence}
                    onChange={(event) => setEditEssence(event.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                  />
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">推演节点</span>
                </div>
                {editBranches.map((branch, index) => (
                  <div
                    key={index}
                    className="space-y-2 rounded border border-slate-200 p-2"
                  >
                    <input
                      value={branch.title}
                      onChange={(event) =>
                        updateEditBranch(index, "title", event.target.value)
                      }
                      placeholder="推演节点名称"
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                    <textarea
                      value={branch.detail}
                      onChange={(event) =>
                        updateEditBranch(index, "detail", event.target.value)
                      }
                      placeholder="推演说明"
                      rows={2}
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={addEditBranch}
                        className="text-[11px] text-slate-600 underline"
                      >
                        添加
                      </button>
                      <button
                        type="button"
                        onClick={() => removeEditBranch(index)}
                        className="text-[11px] text-slate-500 underline"
                      >
                        移除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleEditSubmit}
                  disabled={savingEdit}
                  className="rounded border border-slate-900 px-3 py-1 text-xs text-slate-900 disabled:opacity-60"
                >
                  {savingEdit ? "保存中..." : "保存修改"}
                </button>
                {editResult ? (
                  <span className="text-[11px] text-slate-500">{editResult}</span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleDelete}
                className="w-full rounded border border-rose-200 px-3 py-1 text-xs text-rose-600"
              >
                🗑️ 删除该节点
              </button>
            </div>

            <div className="space-y-3 rounded border border-amber-200 bg-amber-50/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-amber-700">
                    核心回顾与再总结
                  </div>
                  <div className="mt-0.5 text-[11px] text-amber-700/80">
                    先复述，再对照旧版，用迁移样本检验核心是否仍然成立。
                  </div>
                </div>
                {selectedCore ? (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={reviewOpen ? () => setReviewOpen(false) : handleOpenReview}
                      disabled={reviewLoading}
                      className="rounded border border-amber-300 bg-white px-2 py-1 text-[11px] text-amber-700 disabled:opacity-60"
                    >
                      {reviewOpen ? "收起" : "回顾核心"}
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleReviewHistory}
                      disabled={reviewLoading}
                      className="rounded border border-amber-300 bg-white px-2 py-1 text-[11px] text-amber-700 disabled:opacity-60"
                    >
                      版本
                    </button>
                  </div>
                ) : null}
              </div>

              {!selectedCore ? (
                <div className="rounded border border-dashed border-amber-200 bg-white/60 px-2 py-2 text-[11px] leading-5 text-amber-700">
                  请先填写并保存核心本质，再进行回顾。
                </div>
              ) : null}

              {reviewLoading ? (
                <div className="rounded border border-amber-100 bg-white/60 px-2 py-2 text-[11px] text-amber-700">
                  正在读取回顾数据...
                </div>
              ) : null}

              {reviewOpen && selectedCore ? (
                <div className="space-y-3 rounded border border-amber-100 bg-white p-3">
                  <div>
                    <label className="text-[11px] font-medium text-slate-600">
                      1. 凭记忆复述核心
                    </label>
                    <textarea
                      value={reviewRecall}
                      onChange={(event) => setReviewRecall(event.target.value)}
                      rows={3}
                      placeholder="不要看旧答案，先写出你现在理解的语义内核"
                      className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                  </div>

                  {reviewRecall.trim() ? (
                    <div className="rounded border border-slate-200 bg-slate-50 px-2 py-2">
                      <div className="text-[11px] font-medium text-slate-500">
                        2. 旧版本对照
                      </div>
                      <div className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700">
                        {latestVersionStatement || "暂无旧版本"}
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <label className="text-[11px] font-medium text-slate-600">
                      3. 解释旧样本/旧义项
                    </label>
                    <textarea
                      value={reviewOldSamples}
                      onChange={(event) => setReviewOldSamples(event.target.value)}
                      rows={3}
                      placeholder="用这个核心解释旧例句、旧义项或旧搭配"
                      className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                  </div>

                  <div className="space-y-2 rounded border border-slate-200 p-2">
                    <div className="text-[11px] font-medium text-slate-600">
                      4. 迁移挑战
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <input
                        value={transferChallengeGoal}
                        onChange={(event) =>
                          setTransferChallengeGoal(event.target.value)
                        }
                        placeholder="可选：说明想训练的迁移方向，例如跨学科、反例、边界或虫洞"
                        className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleGenerateTransferChallenge}
                        disabled={transferChallengeLoading}
                        className="rounded border border-slate-900 px-2 py-1 text-[11px] text-slate-900 disabled:opacity-60"
                      >
                        {transferChallengeLoading ? "生成中..." : "AI 生成迁移挑战"}
                      </button>
                    </div>
                    {transferChallengeError ? (
                      <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
                        {transferChallengeError}
                      </div>
                    ) : null}
                    {transferChallengeDraft ? (
                      <div className="rounded border border-amber-100 bg-amber-50 px-2 py-2 text-[11px] leading-5 text-amber-900">
                        <div>迁移焦点：{transferChallengeDraft.relationFocus}</div>
                        <div>难度：{transferChallengeDraft.difficulty}</div>
                        <div>边界检查：{transferChallengeDraft.boundaryCheck}</div>
                        {transferChallengeDraft.expectedReasoningMoves.length ? (
                          <div>
                            推理动作：
                            {transferChallengeDraft.expectedReasoningMoves.join("；")}
                          </div>
                        ) : null}
                        {transferChallengeDraft.misuseRisk ? (
                          <div>误用风险：{transferChallengeDraft.misuseRisk}</div>
                        ) : null}
                      </div>
                    ) : null}
                    <textarea
                      value={transferPrompt}
                      onChange={(event) => setTransferPrompt(event.target.value)}
                      rows={2}
                      placeholder="填写一个新例句、新搭配或新场景。后续可接 AI 自动生成。"
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                    <textarea
                      value={transferExplanation}
                      onChange={(event) =>
                        setTransferExplanation(event.target.value)
                      }
                      rows={3}
                      placeholder="用当前核心解释这个新样本"
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                    <label className="flex items-center gap-2 text-[11px] text-slate-600">
                      <input
                        type="checkbox"
                        checked={transferPassed}
                        onChange={(event) => setTransferPassed(event.target.checked)}
                      />
                      本次迁移解释通过
                    </label>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-600">
                      5. 反馈/质询
                    </label>
                    <textarea
                      value={aiFeedback}
                      onChange={(event) => setAiFeedback(event.target.value)}
                      rows={3}
                      placeholder="记录 AI 反馈、人工质询、边界缺失或过度泛化问题"
                      className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                  </div>

                  <div className="space-y-2 rounded border border-slate-200 p-2">
                    <label className="text-[11px] font-medium text-slate-600">
                      6. 再总结版本
                    </label>
                    <textarea
                      value={revisedStatement}
                      onChange={(event) => setRevisedStatement(event.target.value)}
                      rows={3}
                      placeholder="如果理解变深，在这里写出修订后的核心"
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                    <input
                      value={revisionReason}
                      onChange={(event) => setRevisionReason(event.target.value)}
                      placeholder="修订原因：更准确/更简洁/覆盖新义项/排除误解"
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                    <select
                      value={reviewOutcome}
                      onChange={(event) => setReviewOutcome(event.target.value)}
                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                    >
                      <option value="保留当前核心">保留当前核心</option>
                      <option value="形成修订版">形成修订版</option>
                      <option value="需要继续练习">需要继续练习</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleReviewSubmit}
                      disabled={reviewSaving}
                      className="rounded border border-amber-500 bg-amber-50 px-3 py-1 text-xs text-amber-700 disabled:opacity-60"
                    >
                      {reviewSaving ? "保存中..." : "保存回顾"}
                    </button>
                    {reviewResult ? (
                      <span className="text-[11px] text-amber-700">
                        {reviewResult}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {showReviewHistory && reviewData ? (
                <div className="space-y-3 rounded border border-amber-100 bg-white p-3">
                  <div>
                    <div className="text-[11px] font-medium text-slate-500">
                      版本演化
                    </div>
                    <div className="mt-2 space-y-2">
                      {versionList.length > 0 ? (
                        versionList.map((version) => (
                          <div
                            key={version.id}
                            className="rounded border border-slate-200 px-2 py-2"
                          >
                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                              <span>v{version.version}</span>
                              <span>
                                {new Date(version.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <div className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700">
                              {version.statement}
                            </div>
                            {version.revisionReason ? (
                              <div className="mt-1 text-[11px] text-slate-500">
                                {version.revisionReason}
                              </div>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div className="text-[11px] text-slate-500">
                          首次保存回顾后会生成版本 1。
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-medium text-slate-500">
                      最近回顾
                    </div>
                    <div className="mt-2 space-y-2">
                      {reviewData.reviews.length > 0 ? (
                        reviewData.reviews.slice(0, 3).map((review) => (
                          <div
                            key={review.id}
                            className="rounded border border-slate-200 px-2 py-2"
                          >
                            <div className="text-[11px] text-slate-500">
                              {new Date(review.createdAt).toLocaleString()} ·{" "}
                              {review.result || "未标记结果"}
                            </div>
                            <div className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700">
                              {review.userRecall}
                            </div>
                            {review.transferChallenges[0] ? (
                              <div className="mt-2 rounded bg-slate-50 px-2 py-1 text-[11px] leading-5 text-slate-600">
                                迁移：{review.transferChallenges[0].prompt}
                              </div>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div className="text-[11px] text-slate-500">
                          暂无回顾记录
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-3 rounded border border-slate-200 p-3">
              <div className="text-xs font-medium text-slate-500">虫洞连接</div>
              <select
                value={wormholeCanvasId}
                onChange={(event) => {
                  setWormholeCanvasId(event.target.value);
                  setWormholeTarget("");
                  setWormholeOptions([]);
                  setWormholeSelectedId("");
                  setWormholeResult(null);
                }}
                className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
              >
                <option value="">选择目标图谱</option>
                {availableCanvases.map((canvas) => (
                  <option key={canvas.id} value={canvas.id}>
                    {canvas.name}
                  </option>
                ))}
              </select>
              <input
                value={wormholeTarget}
                onChange={(event) => handleWormholeSearch(event.target.value)}
                placeholder="搜索目标节点"
                className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                list="wormhole-target-options"
              />
              <datalist id="wormhole-target-options">
                {wormholeOptions.map((option) => (
                  <option
                    key={option.id}
                    value={`${option.text} · ${languageLabel(option.language)}`}
                  />
                ))}
              </datalist>
              {wormholeOptions.length > 0 && (
                <div className="space-y-1">
                  {wormholeOptions.slice(0, 5).map((option) => {
                    const label = `${option.text} · ${languageLabel(option.language)}`;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setWormholeTarget(label);
                          setWormholeSelectedId(option.id);
                        }}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-left text-[11px] text-slate-600"
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={handleCreateWormhole}
                disabled={
                  !wormholeCanvasId ||
                  wormholeLoading ||
                  (!wormholeSelectedId && wormholeOptions.length !== 1)
                }
                className="w-full rounded border border-violet-300 px-3 py-1 text-xs text-violet-600 disabled:opacity-60"
              >
                {wormholeLoading ? "加载中..." : "🌌 建立虫洞"}
              </button>
              {wormholeResult ? (
                <div className="text-[11px] text-rose-600">{wormholeResult}</div>
              ) : null}
            </div>

            <div className="rounded border border-slate-200 p-3">
              <div className="text-xs font-medium text-slate-500">关系管理</div>
              <div className="mt-2 space-y-2">
                <div className="text-xs text-slate-600">新增关系</div>
                <input
                  list="relation-target-options"
                  value={relationTarget}
                  onChange={(event) => setRelationTarget(event.target.value)}
                  placeholder="输入或选择目标单词"
                  className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                />
                <datalist id="relation-target-options">
                  {targetOptions.map((option) => (
                    <option key={option.id} value={option.label} />
                  ))}
                </datalist>
                <input
                  value={relationType}
                  onChange={(event) => setRelationType(event.target.value)}
                  placeholder="关系类型（如 derive/synonym）"
                  className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                />
                <input
                  value={relationDetail}
                  onChange={(event) => setRelationDetail(event.target.value)}
                  placeholder="关系说明"
                  className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  disabled={savingRelation}
                  onClick={async () => {
                    const targetId = targetIdMap.get(relationTarget) || "";
                    if (!targetId || !relationType.trim()) return;
                    setRelationResult(null);
                    setSavingRelation(true);
                    try {
                      const response = await fetch("/api/relations", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          fromWordId: selected.id,
                          toWordId: targetId,
                          relationType: relationType.trim(),
                          detail: relationDetail.trim() || null,
                          canvasId
                        })
                      });
                      const data = await response.json().catch(() => ({}));
                      if (!response.ok) {
                        setRelationResult(data?.error || "保存关系失败");
                        return;
                      }
                      setRelationTarget("");
                      setRelationType("");
                      setRelationDetail("");
                      await reloadGraph();
                    } catch {
                      setRelationResult("保存关系失败：无法连接到应用服务");
                    } finally {
                      setSavingRelation(false);
                    }
                  }}
                  className="rounded border border-slate-900 px-3 py-1 text-xs text-slate-900 disabled:opacity-60"
                >
                  添加
                </button>
                {relationResult ? (
                  <span className="text-[11px] text-rose-600">{relationResult}</span>
                ) : null}
              </div>
              <div className="mt-4 space-y-2 rounded border border-dashed border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-medium text-slate-600">
                      AI 候选关系
                    </div>
                    <div className="mt-1 text-[11px] leading-5 text-slate-500">
                      AI 只提出候选，确认后才会写入图谱。
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateRelationCandidates}
                    disabled={relationCandidateLoading}
                    className="rounded border border-slate-900 px-2 py-1 text-[11px] text-slate-900 disabled:opacity-60"
                  >
                    {relationCandidateLoading ? "生成中..." : "生成候选"}
                  </button>
                </div>
                <textarea
                  value={relationCandidateQuestion}
                  onChange={(event) =>
                    setRelationCandidateQuestion(event.target.value)
                  }
                  rows={2}
                  placeholder="可选：说明你想验证的联系，例如“它和函数定义域有什么迁移关系？”"
                  className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                />
                {relationCandidateError ? (
                  <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
                    {relationCandidateError}
                  </div>
                ) : null}
                {relationCandidates.length > 0 ? (
                  <div className="space-y-2">
                    {relationCandidates.map((candidate) => {
                      const target = relationCandidateTargetMap.get(
                        candidate.targetWordId
                      );
                      return (
                        <div
                          key={`${candidate.targetWordId}-${candidate.relationType}`}
                          className="rounded border border-slate-200 bg-white p-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-xs font-medium text-slate-700">
                                {target?.text || candidate.targetWordId}
                              </div>
                              <div className="mt-1 text-[11px] text-slate-500">
                                {candidate.relationType} / {candidate.status} /{" "}
                                {candidate.evidenceStrength}
                                {target?.isWormholeTarget
                                  ? ` / 虫洞目标：${target.canvasName}`
                                  : ""}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                handleAcceptRelationCandidate(candidate)
                              }
                              disabled={savingRelation}
                              className="rounded border border-emerald-300 px-2 py-1 text-[11px] text-emerald-700 disabled:opacity-60"
                            >
                              确认写入
                            </button>
                          </div>
                          <div className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-slate-700">
                            {candidate.detail}
                          </div>
                          <div className="mt-2 rounded bg-slate-50 px-2 py-1 text-[11px] leading-5 text-slate-600">
                            确认前追问：{candidate.userQuestion}
                          </div>
                          {candidate.applicability ? (
                            <div className="mt-1 text-[11px] text-slate-500">
                              适用边界：{candidate.applicability}
                            </div>
                          ) : null}
                          {candidate.misuseRisk ? (
                            <div className="mt-1 text-[11px] text-amber-700">
                              误用风险：{candidate.misuseRisk}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <div className="mt-4 space-y-3">
                {relations
                  .filter(
                    (rel) =>
                      rel.fromWordId === selected.id || rel.toWordId === selected.id
                  )
                  .map((rel) => {
                    const fromWord = wordMap.get(rel.fromWordId);
                    const toWord = wordMap.get(rel.toWordId);
                    const draft = relationDrafts[rel.id] || {};
                    return (
                      <div
                        key={rel.id}
                        className={`rounded border bg-white p-2 ${
                          activeRelationId === rel.id
                            ? "border-slate-400"
                            : "border-slate-200"
                        }`}
                      >
                        <div className="text-xs text-slate-600">
                          {fromWord?.text || rel.fromWordId} →{" "}
                          {toWord?.text || rel.toWordId}
                        </div>
                        <input
                          value={draft.relationType ?? rel.relationType}
                          onChange={(event) =>
                            setRelationDrafts((prev) => ({
                              ...prev,
                              [rel.id]: {
                                ...prev[rel.id],
                                relationType: event.target.value
                              }
                            }))
                          }
                          className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                        />
                        <input
                          value={draft.detail ?? rel.detail ?? ""}
                          onChange={(event) =>
                            setRelationDrafts((prev) => ({
                              ...prev,
                              [rel.id]: {
                                ...prev[rel.id],
                                detail: event.target.value
                              }
                            }))
                          }
                          className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                        />
                        <div className="mt-1 grid grid-cols-2 gap-1">
                          <input
                            value={draft.status ?? rel.status ?? "confirmed"}
                            onChange={(event) =>
                              setRelationDrafts((prev) => ({
                                ...prev,
                                [rel.id]: {
                                  ...prev[rel.id],
                                  status: event.target.value
                                }
                              }))
                            }
                            placeholder="状态：candidate/confirmed..."
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                          />
                          <input
                            value={
                              draft.evidenceStrength ??
                              rel.evidenceStrength ??
                              "unknown"
                            }
                            onChange={(event) =>
                              setRelationDrafts((prev) => ({
                                ...prev,
                                [rel.id]: {
                                  ...prev[rel.id],
                                  evidenceStrength: event.target.value
                                }
                              }))
                            }
                            placeholder="证据：unknown/weak/medium/strong"
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
                          />
                        </div>
                        <textarea
                          value={draft.applicability ?? rel.applicability ?? ""}
                          onChange={(event) =>
                            setRelationDrafts((prev) => ({
                              ...prev,
                              [rel.id]: {
                                ...prev[rel.id],
                                applicability: event.target.value
                              }
                            }))
                          }
                          rows={2}
                          placeholder="适用边界"
                          className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                        />
                        <textarea
                          value={draft.misuseRisk ?? rel.misuseRisk ?? ""}
                          onChange={(event) =>
                            setRelationDrafts((prev) => ({
                              ...prev,
                              [rel.id]: {
                                ...prev[rel.id],
                                misuseRisk: event.target.value
                              }
                            }))
                          }
                          rows={2}
                          placeholder="误用风险"
                          className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs"
                        />
                        {rel.aiAssessment ? (
                          <div className="mt-1 rounded bg-slate-50 px-2 py-1 text-[11px] leading-5 text-slate-500">
                            AI 追问：{rel.aiAssessment}
                          </div>
                        ) : null}
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            className="text-xs text-slate-700 underline"
                            onClick={async () => {
                              const payload = {
                                relationType:
                                  (draft.relationType ?? rel.relationType).trim(),
                                detail: (draft.detail ?? rel.detail ?? "").trim() || null,
                                status: (draft.status ?? rel.status ?? "").trim() || undefined,
                                evidenceStrength:
                                  (draft.evidenceStrength ??
                                    rel.evidenceStrength ??
                                    "").trim() || undefined,
                                applicability:
                                  (draft.applicability ??
                                    rel.applicability ??
                                    "").trim() || null,
                                misuseRisk:
                                  (draft.misuseRisk ?? rel.misuseRisk ?? "").trim() ||
                                  null
                              };
                              setRelationResult(null);
                              try {
                                const response = await fetch(
                                  `/api/relations/${rel.id}?canvasId=${canvasId}`,
                                  {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify(payload)
                                  }
                                );
                                const data = await response.json().catch(() => ({}));
                                if (!response.ok) {
                                  setRelationResult(data?.error || "保存关系失败");
                                  return;
                                }
                                setRelationDrafts((prev) => {
                                  const next = { ...prev };
                                  delete next[rel.id];
                                  return next;
                                });
                                await reloadGraph();
                              } catch {
                                setRelationResult("保存关系失败：无法连接到应用服务");
                              }
                            }}
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            className="text-xs text-rose-500 underline"
                            onClick={async () => {
                              setRelationResult(null);
                              try {
                                const response = await fetch(
                                  `/api/relations/${rel.id}?canvasId=${canvasId}`,
                                  { method: "DELETE" }
                                );
                                const data = await response.json().catch(() => ({}));
                                if (!response.ok) {
                                  setRelationResult(data?.error || "删除关系失败");
                                  return;
                                }
                                setRelationDrafts((prev) => {
                                  const next = { ...prev };
                                  delete next[rel.id];
                                  return next;
                                });
                                await reloadGraph();
                              } catch {
                                setRelationResult("删除关系失败：无法连接到应用服务");
                              }
                            }}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    );
                  })}
                {relations.filter(
                  (rel) =>
                    rel.fromWordId === selected.id || rel.toWordId === selected.id
                ).length === 0 ? (
                  <div className="text-xs text-slate-500">暂无关系</div>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-500">点击节点查看推演细节</div>
        )}
      </div>
    </div>
  );
}

export default function GraphPage() {
  return (
    <ReactFlowProvider>
      <GraphPageContent />
    </ReactFlowProvider>
  );
}
