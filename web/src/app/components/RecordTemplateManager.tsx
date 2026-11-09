"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseRecordTemplateConfig, parseRecordTemplateTitle, type RecordTemplateConfig } from "../../lib/learning/recordTemplateContracts";
import { readRecordJson } from "./recordDiscoveryTypes";
import { ActionButton } from "./ui";

export type RecordTemplateDTO = { id: string; title: string; schemaVersion: number; version: number; config: RecordTemplateConfig | null; unavailableReason?: string; createdAt: string; updatedAt: string };
type TemplateList = { templates: RecordTemplateDTO[]; page: { total: number; nextOffset: number | null } };
export type RecordTemplateSeed = { key: number; title: string; config: RecordTemplateConfig };
const pathFor = (id: string) => `/api/knowledge-points/templates/${encodeURIComponent(id)}`;

export function RecordTemplateManager({ enabled, disabled, defaultTimeZone, seed, onSelect, onBusyChange }: {
  enabled: boolean; disabled: boolean; defaultTimeZone: string; seed: RecordTemplateSeed | null;
  onSelect: (id: string) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [templates, setTemplates] = useState<RecordTemplateDTO[]>([]);
  const [total, setTotal] = useState(0), [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const [readError, setReadError] = useState(""), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [title, setTitle] = useState(""), [body, setBody] = useState(""), [timeZone, setTimeZone] = useState(defaultTimeZone);
  const [active, setActive] = useState<RecordTemplateDTO | null>(null);
  const [conflict, setConflict] = useState<{ latest: RecordTemplateDTO; method: string } | null>(null);
  const lifecycle = useRef({ value: 0 }), listGeneration = useRef(0), loaded = useRef(false);
  const listRequest = useRef<AbortController | null>(null), operationRequest = useRef<AbortController | null>(null);
  const requestIds = useRef<Record<string, string>>({});
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => { const token = lifecycle.current; return () => { token.value++; listRequest.current?.abort(); operationRequest.current?.abort(); }; }, []);
  const load = useCallback(async (offset = 0) => {
    const generation = ++listGeneration.current, life = lifecycle.current.value;
    listRequest.current?.abort(); const controller = new AbortController(); listRequest.current = controller;
    setLoading(true); setReadError("");
    try {
      const result = await readRecordJson<TemplateList>(`/api/knowledge-points/templates?offset=${offset}&limit=20`, controller.signal);
      if (generation !== listGeneration.current || life !== lifecycle.current.value) return;
      setTemplates(previous => offset ? [...previous, ...result.templates.filter(template => !previous.some(old => old.id === template.id))] : result.templates);
      setTotal(result.page.total); setNextOffset(result.page.nextOffset);
    } catch (cause) { if (!controller.signal.aborted && generation === listGeneration.current && life === lifecycle.current.value) setReadError(cause instanceof Error ? cause.message : "无法读取自定义模板。"); }
    finally { if (generation === listGeneration.current && life === lifecycle.current.value) setLoading(false); }
  }, []);
  useEffect(() => { if (enabled && !loaded.current) { loaded.current = true; void load(); } }, [enabled, load]);
  useEffect(() => {
    if (!seed) return;
    setTitle(seed.title); setBody(seed.config.body); setTimeZone(seed.config.timeZone); setActive(null); setConflict(null); setError("");
    setMessage("已复制到模板管理草稿；确认保存自定义模板后才会持久保存，记录正文未改变。");
  }, [seed]);

  const edit = async (template: RecordTemplateDTO) => {
    const life = lifecycle.current.value; setBusy(true); setError(""); setMessage(""); setConflict(null);
    const controller = new AbortController(); operationRequest.current = controller;
    try {
      const result = await readRecordJson<{ template: RecordTemplateDTO }>(pathFor(template.id), controller.signal);
      if (life !== lifecycle.current.value) return;
      if (result.template.schemaVersion !== 1) throw new Error("此模板版本暂不支持编辑或降级。");
      setActive(result.template); setTitle(result.template.title); setBody(result.template.config?.body || ""); setTimeZone(result.template.config?.timeZone || defaultTimeZone);
      setMessage(result.template.config ? "正在编辑模板配置；原记录正文不变。" : "模板配置损坏；请填写完整有效正文和时区后明确更新修复。");
    } catch (cause) { if (life === lifecycle.current.value && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "无法读取模板。"); }
    finally { if (life === lifecycle.current.value) setBusy(false); }
  };

  const write = async (method: "POST" | "PATCH" | "DELETE", template?: RecordTemplateDTO) => {
    const life = lifecycle.current.value; setBusy(true); setError(""); setMessage(""); setConflict(null);
    const controller = new AbortController(); operationRequest.current = controller;
    try {
      let payload: unknown;
      if (method === "DELETE") payload = { expectedVersion: template!.version };
      else {
        const normalizedTitle = parseRecordTemplateTitle(title), config = parseRecordTemplateConfig({ body, timeZone });
        const key = JSON.stringify({ title: normalizedTitle, config });
        payload = method === "PATCH" ? { title: normalizedTitle, config, expectedVersion: template!.version } : { requestId: requestIds.current[key] ||= crypto.randomUUID(), title: normalizedTitle, config };
      }
      const response = await fetch(template ? pathFor(template.id) : "/api/knowledge-points/templates", { method, signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (life !== lifecycle.current.value) return;
      if (!response.ok) {
        if (response.status === 409 && template) {
          try { const latest = await readRecordJson<{ template: RecordTemplateDTO }>(pathFor(template.id), controller.signal); if (life === lifecycle.current.value) setConflict({ latest: latest.template, method }); }
          catch { /* Preserve the local configuration when the latest version cannot be read. */ }
        }
        if (response.status === 404 && template) setActive(previous => previous?.id === template.id ? null : previous);
        throw new Error(result.error || "模板操作失败，请重试。");
      }
      if (method === "DELETE") { setActive(previous => previous?.id === template?.id ? null : previous); setMessage("自定义模板已删除；记录与已插入的正文不变。"); }
      else { setActive(result.template); setTitle(result.template.title); setMessage("自定义模板已保存；记录正文尚未保存或改变。"); }
      await load();
    } catch (cause) { if (life === lifecycle.current.value && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "模板操作失败。"); }
    finally { if (life === lifecycle.current.value) setBusy(false); }
  };
  const locked = disabled || busy;
  const changed = !!active && (title !== active.title || body !== active.config?.body || timeZone !== active.config?.timeZone);
  return <section aria-label="自定义模板管理" className="space-y-4 border-t pt-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">自定义模板管理</h3><ActionButton variant="secondary" disabled={locked || loading} onClick={() => { setError(""); void load(); }}>刷新模板列表</ActionButton></div>
    <p className="text-sm">这里只保存模板配置。选择编辑会载入该模板到下方管理草稿；不会修改记录正文。默认时区随模板保存。</p>
    <label className="block">模板名称<input aria-label="模板名称" className="workshop-input w-full" disabled={locked} value={title} maxLength={120} onChange={event => setTitle(event.target.value)} /></label>
    <label className="block">模板正文<textarea aria-label="模板正文" className="workshop-input min-h-32 w-full" disabled={locked} value={body} onChange={event => setBody(event.target.value)} /></label>
    <label className="block">模板默认时区<input aria-label="模板默认时区" className="workshop-input" disabled={locked} value={timeZone} onChange={event => setTimeZone(event.target.value)} /></label>
    <p className="text-sm">支持 {"{{title}}"}、{"{{date}}"}、{"{{time}}"}；未知变量保留为文字。正文上限24000个字符。</p>
    <div className="flex flex-wrap gap-3"><ActionButton disabled={locked || !title.trim() || !body.trim()} onClick={() => void write("POST")}>保存为新自定义模板</ActionButton><ActionButton variant="secondary" disabled={locked || !active || active.schemaVersion !== 1 || !title.trim() || !body.trim()} onClick={() => void write("PATCH", active!)}>更新当前自定义模板</ActionButton><ActionButton variant="secondary" disabled={locked} onClick={() => { setActive(null); setTitle(""); setBody(""); setTimeZone(defaultTimeZone); setConflict(null); setError(""); setMessage("已开始新的模板管理草稿，记录正文不变。"); }}>新建模板草稿</ActionButton></div>
    {active && <p>当前模板保存基础：{active.title} · 版本 {active.version}{changed ? " · 有未保存更改" : ""}</p>}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    {conflict && <div className="space-y-3 rounded border border-amber-300 p-3"><p role="status">模板已有新版本，本地名称、正文和时区草稿仍保留。</p><p>最新模板：{conflict.latest.title} · 版本 {conflict.latest.version}</p>{conflict.latest.config ? <><p>最新时区：{conflict.latest.config.timeZone}</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap">{conflict.latest.config.body}</pre></> : <p>{conflict.latest.unavailableReason || "最新模板配置不可读取。"}</p>}{conflict.method === "PATCH" && conflict.latest.schemaVersion === 1 && <ActionButton variant="secondary" disabled={locked} onClick={() => { setActive(conflict.latest); setConflict(null); setError(""); setMessage("已采用最新模板版本作为更新基础；本地管理草稿未被替换，请检查后再更新。"); }}>采用最新模板版本作为更新基础</ActionButton>}<ActionButton variant="secondary" disabled={locked || loading} onClick={() => void load()}>重新读取冲突模板列表</ActionButton></div>}
    {readError && <div role="alert"><p>{readError}</p><ActionButton variant="secondary" disabled={loading} onClick={() => void load()}>重试读取自定义模板</ActionButton></div>}
    {loading && <p role="status">正在读取自定义模板…</p>}
    {templates.map(template => <article key={template.id} aria-label={`自定义模板：${template.title}`} className="space-y-2 border-t pt-3"><p>{template.title} · 版本 {template.version}</p>{template.config && <p className="text-sm">默认时区：{template.config.timeZone}</p>}{(template.unavailableReason || template.schemaVersion !== 1) && <p>不可预览：{template.unavailableReason || "暂不支持的模板版本。"}</p>}<div className="flex flex-wrap gap-3"><ActionButton variant="secondary" disabled={locked || !template.config || template.schemaVersion !== 1 || !!template.unavailableReason} onClick={() => onSelect(template.id)}>选择模板“{template.title}”</ActionButton><ActionButton variant="secondary" disabled={locked || template.schemaVersion !== 1} onClick={() => void edit(template)}>编辑模板“{template.title}”</ActionButton><ActionButton variant="secondary" disabled={locked} onClick={() => void write("DELETE", template)}>删除模板“{template.title}”，保留记录</ActionButton></div></article>)}
    {!loading && !readError && !templates.length && <p>还没有自定义模板，可以填写后保存，或复制一个内置示例。</p>}
    <p className="text-sm">已读取 {templates.length} / {total} 个自定义模板。</p>
    {nextOffset !== null && <ActionButton variant="secondary" disabled={locked || loading} onClick={() => void load(nextOffset)}>继续读取自定义模板</ActionButton>}
  </section>;
}
