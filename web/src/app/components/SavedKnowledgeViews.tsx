"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseKnowledgeViewConfig, parseKnowledgeViewTitle, type KnowledgeViewConfig } from "../../lib/learning/knowledgeViewContracts";
import { ActionButton, SectionPanel } from "./ui";
import { readRecordJson, recordKindLabels, recordSourceLabels } from "./recordDiscoveryTypes";
import { knowledgeFieldLabels } from "./KnowledgeViewFilters";

type SavedView = { id: string; title: string; schemaVersion: number; version: number; config: KnowledgeViewConfig | null; unavailableReason?: string; createdAt: string; updatedAt: string };
type ViewList = { views: SavedView[]; page: { total: number; nextOffset: number | null } };
type Option = { id: string; name?: string; title?: string };

function ViewSummary({ config, domains, collections }: { config: KnowledgeViewConfig; domains: Option[]; collections: Option[] }) {
  const filters = config.filters, date = filters.date;
  return <div className="space-y-1 text-sm">
    <p>关键词：{filters.q || "不限"} · 类型：{recordKindLabels[filters.kind] || "全部"} · 来源：{recordSourceLabels[filters.sourceType] || "全部"}</p>
    <p>领域：{filters.domainId ? domains.find(domain => domain.id === filters.domainId)?.name || "原领域条件（未读取或已失效）" : "全部"} · 主题：{filters.collectionId ? collections.find(collection => collection.id === filters.collectionId)?.title || "原主题条件（未读取或已失效）" : "全部"}</p>
    <p>{date.field === "created" ? "记录创建日期" : "记录更新日期"}：{date.mode === "all" ? "不限日期" : date.mode === "last_days" ? `最近${date.days}天，含今天` : `${date.from || "不限起日"} 至 ${date.to || "不限止日"}`} · 时区：{date.timeZone}</p>
    <p>显示：标题{config.displayFields.length ? `、${config.displayFields.map(field => knowledgeFieldLabels[field]).join("、")}` : "（只显示标题）"}</p>
  </div>;
}

export function SavedKnowledgeViews({ config, domains, collections, refresh, unavailableReason, dateDraftPending, dateDraftVersion, onApply }: {
  config: KnowledgeViewConfig;
  domains: Option[];
  collections: Option[];
  refresh: number;
  unavailableReason?: string;
  dateDraftPending: boolean;
  dateDraftVersion: number;
  onApply: (config: KnowledgeViewConfig) => void;
}) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [readError, setReadError] = useState("");
  const [writeError, setWriteError] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [active, setActive] = useState<SavedView | null>(null);
  const [conflict, setConflict] = useState<{ latest: SavedView; operation: string } | null>(null);
  const generation = useRef({ value: 0 });
  const activeRequest = useRef<AbortController | null>(null);
  const saveRequests = useRef<Record<string, string>>({});
  const currentConfig = useRef(config);
  currentConfig.current = config;
  const currentDateDraftVersion = useRef(dateDraftVersion);
  currentDateDraftVersion.current = dateDraftVersion;

  const load = useCallback(async (offset = 0) => {
    const request = ++generation.current.value;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true); setReadError("");
    try {
      const result = await readRecordJson<ViewList>(`/api/knowledge-points/views?offset=${offset}&limit=20`, controller.signal);
      if (request !== generation.current.value) return;
      setViews(previous => offset ? [...previous, ...result.views.filter(view => !previous.some(old => old.id === view.id))] : result.views);
      setNextOffset(result.page.nextOffset); setTotal(result.page.total);
    } catch (cause) {
      if (request === generation.current.value && !controller.signal.aborted) setReadError(cause instanceof Error ? cause.message : "无法读取已保存视图。");
    } finally { if (request === generation.current.value) setLoading(false); }
  }, []);

  useEffect(() => {
    const counter = generation.current;
    void load();
    return () => { counter.value++; activeRequest.current?.abort(); };
  }, [load, refresh]);

  const write = async (path: string, data: unknown, method: string, viewId?: string) => {
    const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 409 && viewId) {
        try {
          const latest = await readRecordJson<{ view: SavedView }>(`/api/knowledge-points/views/${encodeURIComponent(viewId)}`);
          setConflict({ latest: latest.view, operation: method });
        } catch { /* Keep the conflict message and the local configuration even if rereading fails. */ }
      }
      throw new Error(result.error || "视图操作失败，请重试。");
    }
    return result;
  };

  const save = async (update: boolean) => {
    setBusy(true); setWriteError(""); setMessage(""); setConflict(null);
    try {
      const title = parseKnowledgeViewTitle(name), captured = parseKnowledgeViewConfig(config);
      const key = JSON.stringify({ title, config: captured });
      const path = update && active ? `/api/knowledge-points/views/${encodeURIComponent(active.id)}` : "/api/knowledge-points/views";
      const payload = update && active ? { title, config: captured, expectedVersion: active.version } : { requestId: saveRequests.current[key] ||= crypto.randomUUID(), title, config: captured };
      const result = await write(path, payload, update ? "PATCH" : "POST", update ? active?.id : undefined);
      setActive(result.view); setName(result.view.title);
      setMessage(JSON.stringify(currentConfig.current) === JSON.stringify(captured) ? "检索视图已保存，记录内容没有改变。" : "已保存点击时的检索配置；你后来的筛选调整仍未保存。");
      await load();
    } catch (cause) { setWriteError(cause instanceof Error ? cause.message : "无法保存检索视图。"); }
    finally { setBusy(false); }
  };

  const open = async (view: SavedView) => {
    const openingConfig = JSON.stringify(config), openingDateDraftVersion = dateDraftVersion;
    setBusy(true); setWriteError(""); setMessage(""); setConflict(null);
    try {
      const result = await readRecordJson<{ view: SavedView }>(`/api/knowledge-points/views/${encodeURIComponent(view.id)}`);
      if (result.view.schemaVersion !== 1 || !result.view.config || result.view.unavailableReason) throw new Error(result.view.unavailableReason || "这个视图的配置版本无法运行。");
      const parsed = parseKnowledgeViewConfig(result.view.config);
      if (JSON.stringify(currentConfig.current) !== openingConfig || currentDateDraftVersion.current !== openingDateDraftVersion) {
        setMessage("读取视图期间你又调整了筛选或日期，后来的设置已保留。需要时请再次明确打开视图。");
        return;
      }
      onApply(parsed); setActive(result.view); setName(result.view.title);
      setMessage("已打开检索视图；新记录和主题改名草稿仍保留。");
    } catch (cause) { setWriteError(cause instanceof Error ? cause.message : "无法打开检索视图。"); }
    finally { setBusy(false); }
  };

  const remove = async (view: SavedView) => {
    setBusy(true); setWriteError(""); setMessage(""); setConflict(null);
    try {
      await write(`/api/knowledge-points/views/${encodeURIComponent(view.id)}`, { expectedVersion: view.version }, "DELETE", view.id);
      if (active?.id === view.id) setActive(null);
      setMessage("检索视图已删除，当前筛选和所有记录仍保留。");
      await load();
    } catch (cause) { setWriteError(cause instanceof Error ? cause.message : "无法删除检索视图。"); }
    finally { setBusy(false); }
  };

  const changed = !!active && (name.trim() !== active.title || JSON.stringify(config) !== JSON.stringify(active.config));
  const cannotSave = busy || !name.trim() || !!unavailableReason || dateDraftPending;
  return <SectionPanel aria-label="已保存的检索视图">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl">已保存的检索视图</h2><ActionButton variant="secondary" disabled={loading || busy} onClick={() => { setWriteError(""); void load(); }}>刷新视图列表</ActionButton></div>
    <p className="text-sm">保存已应用的筛选、日期与显示字段。视图保存查询规则，打开时读取符合条件的记录。</p>
    <div className="flex flex-wrap items-center gap-3"><input aria-label="视图名称" disabled={busy} maxLength={120} className="workshop-input" placeholder="例如：最近7天的疑问" value={name} onChange={event => setName(event.target.value)} /><ActionButton disabled={cannotSave} onClick={() => void save(false)}>保存为新视图</ActionButton><ActionButton variant="secondary" disabled={cannotSave || !active || active.schemaVersion !== 1} onClick={() => void save(true)}>更新当前视图</ActionButton></div>
    {dateDraftPending && <p role="status">日期设置尚未应用，请先应用或恢复日期后再保存视图。</p>}
    {unavailableReason && <p role="status">当前条件不可运行，不能保存视图：{unavailableReason}</p>}
    {active && <p>当前保存基础：{active.title} · 版本 {active.version}{changed ? " · 当前设置有未保存更改" : " · 与已保存配置一致"}</p>}
    {readError && <div role="alert"><p>{readError}</p><ActionButton variant="secondary" disabled={loading} onClick={() => void load()}>重试读取已保存视图</ActionButton></div>}
    {writeError && <p role="alert" className="text-rose-700">{writeError}</p>}
    {message && <p role="status">{message}</p>}
    {conflict && <div className="space-y-3 rounded-lg border border-amber-300 p-3"><p role="status">已保存视图有新版本；当前名称和检索设置仍保留。</p><p>最新保存：{conflict.latest.title} · 版本 {conflict.latest.version}</p>{conflict.latest.config ? <ViewSummary config={conflict.latest.config} domains={domains} collections={collections} /> : <p>{conflict.latest.unavailableReason || "最新配置无法运行。"}</p>}{conflict.operation === "PATCH" && conflict.latest.schemaVersion === 1 && <ActionButton variant="secondary" disabled={busy} onClick={() => { setActive(conflict.latest); setConflict(null); setWriteError(""); setMessage("已采用最新版本作为更新基础；当前名称和检索设置未被替换，请检查后再更新或另存。"); }}>采用最新版本作为更新基础</ActionButton>}<ActionButton variant="secondary" disabled={loading || busy} onClick={() => void load()}>重新读取视图列表</ActionButton></div>}
    {loading && <p role="status">正在读取已保存视图…</p>}
    {views.map(view => <article key={view.id} aria-label={`检索视图：${view.title}`} className="space-y-3 border-t pt-3"><h3 className="font-medium">{view.title}</h3>{view.config ? <ViewSummary config={view.config} domains={domains} collections={collections} /> : null}{(view.unavailableReason || view.schemaVersion !== 1) && <p className="text-amber-800">无法运行：{view.unavailableReason || "此配置版本暂不支持。"}</p>}<div className="flex flex-wrap gap-3"><ActionButton variant="secondary" disabled={busy || view.schemaVersion !== 1 || !view.config || !!view.unavailableReason} onClick={() => void open(view)}>打开视图“{view.title}”</ActionButton><ActionButton variant="secondary" disabled={busy} onClick={() => void remove(view)}>删除视图“{view.title}”，保留记录</ActionButton></div></article>)}
    {!loading && !readError && !views.length && <p>还没有保存检索视图。</p>}
    <p className="text-sm">已读取 {views.length} / {total} 个视图。</p>
    {nextOffset !== null && <ActionButton variant="secondary" disabled={loading} onClick={() => void load(nextOffset)}>继续读取已保存视图</ActionButton>}
  </SectionPanel>;
}
