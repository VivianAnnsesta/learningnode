"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ActionButton, SectionPanel } from "./ui";
import { readRecordJson, relationKindLabels } from "./recordDiscoveryTypes";

type Neighborhood = {
  nodes: { id: string; title: string; kind: string; distance: number }[];
  edges: { id: string; fromKnowledgePointId: string; toKnowledgePointId: string; type: string; detail: string | null; status: "confirmed" }[];
  depth: number;
  truncated: { nodes: boolean; edges: boolean };
};

function positions(nodes: Neighborhood["nodes"]) {
  const result = new Map<string, { x: number; y: number }>();
  for (const distance of [0, 1, 2]) {
    const ring = nodes.filter(node => node.distance === distance);
    ring.forEach((node, index) => {
      const angle = index * 2 * Math.PI / ring.length + (distance === 1 ? -Math.PI / 4 : Math.PI / 6);
      const radius = distance === 0 ? 0 : distance === 1 ? 175 : 300;
      result.set(node.id, { x: Math.round(420 + radius * Math.cos(angle)), y: Math.round(350 + radius * Math.sin(angle)) });
    });
  }
  return result;
}

type Position = { x: number; y: number };

function connectionPath(edge: Neighborhood["edges"][number], nodes: Neighborhood["nodes"], layout: Map<string, Position>) {
  const from = layout.get(edge.fromKnowledgePointId), to = layout.get(edge.toKnowledgePointId);
  if (!from || !to) return null;
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const normal = { x: -(to.y - from.y) / length, y: (to.x - from.x) / length };
  let best: { control: Position; score: number } | null = null;
  // Test a few bounded curves so a long connection does not pass through an unrelated record or its label.
  for (const bend of [28, -28, 70, -70, 130, -130, 200, -200]) {
    const control = { x: (from.x + to.x) / 2 + normal.x * bend, y: (from.y + to.y) / 2 + normal.y * bend };
    let score = 0;
    for (let step = 1; step < 20; step++) {
      const t = step / 20;
      const x = (1 - t) ** 2 * from.x + 2 * (1 - t) * t * control.x + t ** 2 * to.x;
      const y = (1 - t) ** 2 * from.y + 2 * (1 - t) * t * control.y + t ** 2 * to.y;
      if (x < 25 || x > 815 || y < 25 || y > 675) score += 500;
      for (const node of nodes) {
        if (node.id === edge.fromKnowledgePointId || node.id === edge.toKnowledgePointId) continue;
        const position = layout.get(node.id);
        if (!position) continue;
        const clearance = Math.hypot(x - position.x, y - position.y) - (node.distance === 0 ? 43 : 37);
        if (clearance < 0) score += 100 + clearance ** 2;
        if (Math.abs(x - position.x) < 85 && y > position.y + 32 && y < position.y + 55) score += 100;
      }
    }
    if (!best || score < best.score) best = { control, score };
    if (score === 0) break;
  }
  if (!best) return null;
  const control = best.control;
  const fromLength = Math.hypot(control.x - from.x, control.y - from.y) || 1;
  const toLength = Math.hypot(to.x - control.x, to.y - control.y) || 1;
  const fromRadius = nodes.find(node => node.id === edge.fromKnowledgePointId)?.distance === 0 ? 33 : 27;
  const toRadius = nodes.find(node => node.id === edge.toKnowledgePointId)?.distance === 0 ? 37 : 31;
  const start = { x: from.x + (control.x - from.x) / fromLength * fromRadius, y: from.y + (control.y - from.y) / fromLength * fromRadius };
  const end = { x: to.x - (to.x - control.x) / toLength * toRadius, y: to.y - (to.y - control.y) / toLength * toRadius };
  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${control.x.toFixed(1)} ${control.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

export function RecordNeighborhood({ pointId, refresh }: { pointId: string; refresh: number }) {
  const [depth, setDepth] = useState("1");
  const [neighborhood, setNeighborhood] = useState<Neighborhood | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef({ value: 0 });
  const activeRequest = useRef<AbortController | null>(null);
  const markerId = useId().replace(/:/g, "");
  const load = useCallback(async () => {
    const request = ++generation.current.value;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError("");
    try {
      const result = await readRecordJson<Neighborhood>(`/api/knowledge-points/${encodeURIComponent(pointId)}/neighborhood?depth=${depth}`, controller.signal);
      if (request === generation.current.value) setNeighborhood(result);
    } catch (cause) {
      if (request === generation.current.value && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "无法读取局部联系。");
    } finally {
      if (request === generation.current.value) setLoading(false);
    }
  }, [pointId, depth]);

  useEffect(() => {
    const counter = generation.current;
    setNeighborhood(null);
    void load();
    return () => { counter.value++; activeRequest.current?.abort(); };
  }, [load, refresh]);

  const layout = positions(neighborhood?.nodes || []);
  const titles = new Map(neighborhood?.nodes.map(node => [node.id, node.title]));
  return <SectionPanel aria-label="局部知识图谱">
    <h2 className="text-xl">局部知识图谱</h2>
    <p className="text-sm">只沿用户已确认的联系展开，按联系类型显示方向；相关、类比和对比为双向联系。内容引用与课程依赖分别记录。</p>
    <label>图谱深度 <select aria-label="图谱深度" className="workshop-input" value={depth} onChange={event => setDepth(event.target.value)}><option value="1">一层联系</option><option value="2">两层联系</option></select></label>
    {error && <div role="alert"><p>{error}</p><ActionButton variant="secondary" onClick={() => void load()}>重试读取局部图谱</ActionButton></div>}
    {loading && <p role="status">正在读取局部图谱…</p>}
    {neighborhood && <>
      {(neighborhood.truncated.nodes || neighborhood.truncated.edges) && <p role="status" className="text-amber-800">当前结果已截断：{neighborhood.truncated.nodes ? "记录数量达到上限。" : ""}{neighborhood.truncated.edges ? "联系数量达到上限。" : ""}这里只展示部分局部联系。</p>}
      {neighborhood.edges.length === 0 ? <p>这条记录暂时没有已确认的联系，可以继续保留为独立记录。</p> : null}
      <div className="overflow-x-auto rounded-lg border bg-slate-50">
        <svg viewBox="0 0 840 700" className="min-w-[600px] w-full" role="group" aria-label={`当前记录周围${neighborhood.depth}层的知识联系`}>
          <defs><marker id={markerId} markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#64748b" /></marker></defs>
          {neighborhood.edges.map(edge => {
            const path = connectionPath(edge, neighborhood.nodes, layout);
            if (!path) return null;
            const symmetric = ["related", "analogy", "contrast"].includes(edge.type);
            return <path key={edge.id} d={path} fill="none" stroke="#64748b" strokeWidth="1.5" markerEnd={symmetric ? undefined : `url(#${markerId})`}><title>{titles.get(edge.fromKnowledgePointId)} {symmetric ? "↔" : "→"} {titles.get(edge.toKnowledgePointId)}：{relationKindLabels[edge.type] || edge.type}。{edge.detail}</title></path>;
          })}
          {neighborhood.nodes.map(node => {
            const position = layout.get(node.id);
            if (!position) return null;
            const labelWidth = Math.min(node.title.length, 13) * 13 + 12;
            return <a key={node.id} href={`/learning/knowledge/${encodeURIComponent(node.id)}`} aria-label={`打开记录：${node.title}`}>
              <title>{node.title}{node.distance === 0 ? "（当前记录）" : `（${node.distance}层联系）`}</title>
              <circle cx={position.x} cy={position.y} r={node.distance === 0 ? 29 : 23} fill={node.distance === 0 ? "#0f766e" : node.distance === 1 ? "#dbeafe" : "#fef3c7"} stroke="#334155" strokeWidth="1.5" />
              <text x={position.x} y={position.y + 4} textAnchor="middle" fontSize="11" fill={node.distance === 0 ? "#ffffff" : "#0f172a"}>{node.distance === 0 ? "当前" : `${node.distance}层`}</text>
              <rect x={position.x - labelWidth / 2} y={position.y + 31} width={labelWidth} height="22" rx="3" fill="#fffbf0" fillOpacity="0.95" />
              <text x={position.x} y={position.y + 46} textAnchor="middle" fontSize="13" fill="#0f172a">{node.title.length > 13 ? `${node.title.slice(0, 12)}…` : node.title}</text>
            </a>;
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-3" aria-label="局部图谱记录入口">{neighborhood.nodes.filter(node => node.id !== pointId).map(node => <Link className="underline" href={`/learning/knowledge/${encodeURIComponent(node.id)}`} key={node.id}>{node.title} · {node.distance}层</Link>)}</div>
      <h3 className="font-semibold">联系说明 · {neighborhood.edges.length}</h3>
      {neighborhood.edges.map(edge => <p key={edge.id} className="border-t pt-2"><Link className="underline" href={`/learning/knowledge/${encodeURIComponent(edge.fromKnowledgePointId)}`}>{titles.get(edge.fromKnowledgePointId)}</Link> {["related", "analogy", "contrast"].includes(edge.type) ? "↔" : "→"} <Link className="underline" href={`/learning/knowledge/${encodeURIComponent(edge.toKnowledgePointId)}`}>{titles.get(edge.toKnowledgePointId)}</Link> · {relationKindLabels[edge.type] || edge.type}<br />{edge.detail}</p>)}
    </>}
  </SectionPanel>;
}
