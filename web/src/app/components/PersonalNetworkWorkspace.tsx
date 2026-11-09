"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { defaultKnowledgeViewConfig, knowledgeViewConfigFromQuery, knowledgeViewConfigToQuery, parseKnowledgeViewConfig, recordSourceCategory, type KnowledgeDateWindow, type KnowledgeViewConfig } from "../../lib/learning/knowledgeViewContracts";
import { ActionButton, AppShell, PageHeader, SectionPanel } from "./ui";
import { readRecordJson, recordAliasesInput, recordAliasSummary, recordKindLabels, recordSourceInputs, recordSourceLabels, relationKindLabels } from "./recordDiscoveryTypes";
import { knowledgeRecordHref, knowledgeViewForConfig } from "./knowledgeNavigation";
import { KnowledgeViewFilters } from "./KnowledgeViewFilters";
import { SavedKnowledgeViews } from "./SavedKnowledgeViews";
import { RecordTemplatePicker } from "./RecordTemplatePicker";
import { useRecordTemplateInsertion } from "./useRecordTemplateInsertion";
import { parseAssignedRecordDate, type AssignedRecordDate } from "../../lib/learning/recordDateContracts";
import { RecordDateEditor, recordDateDescription } from "./RecordDateEditor";
import { KnowledgeRecordCalendar } from "./KnowledgeRecordCalendar";
import { RecordClipper } from "./RecordClipper";
import { KnowledgeExportControls } from "./KnowledgeExportControls";

type RecordItem = { id: string; title: string; body: string; kind: string; sourceType?: string; sourceCategory?: string; aliases?: string[]; matchedAliases?: string[]; createdAt?: string; updatedAt?: string; recordDate?: AssignedRecordDate | null; recordDateUnavailableReason?: string; domainIds: string[]; collections: { id: string; title: string }[] };
type Collection = { id: string; title: string; memberships: { knowledgePointId: string }[] };
type Domain = { id: string; name: string };
type Relation = { id: string; fromKnowledgePointId: string; toKnowledgePointId: string; fromTitle: string; toTitle: string; type: string; status: string; detail: string | null };
type RecordList = { knowledgePoints: RecordItem[]; page: { total: number; nextOffset: number | null }; dateWindow?: KnowledgeDateWindow | null; unavailableReason?: string };

export function PersonalNetworkWorkspace({ initialDomain = "" }: { initialDomain?: string }) {
  return <Suspense fallback={<p role="status">正在读取个人网络…</p>}><PersonalNetworkContent initialDomain={initialDomain} /></Suspense>;
}

function PersonalNetworkContent({ initialDomain }: { initialDomain: string }) {
  const queryParams = useSearchParams(), rawQuery = queryParams.toString();
  const [config, setConfig] = useState<KnowledgeViewConfig | null>(null);
  const [queryError, setQueryError] = useState("");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [metadataReady, setMetadataReady] = useState(false);
  const [unavailableReason, setUnavailableReason] = useState<string | undefined>();
  const [dateWindow, setDateWindow] = useState<KnowledgeDateWindow | null>(null);
  const [acceptedFiltersKey, setAcceptedFiltersKey] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draftSources, setDraftSources] = useState<unknown[]>([]);
  const [pendingClipCommand, setPendingClipCommand] = useState<string | null>(null);
  const [aliasesText, setAliasesText] = useState("");
  const [kind, setKind] = useState("note");
  const [recordDate, setRecordDate] = useState<AssignedRecordDate | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<string | undefined>();
  const [draftDomain, setDraftDomain] = useState(initialDomain);
  const [draftDomainTouched, setDraftDomainTouched] = useState(false);
  const [topic, setTopic] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [savedRecord, setSavedRecord] = useState<{ id: string; title: string; savedSequence?: number; reused?: boolean } | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [dateDraftPending, setDateDraftPending] = useState(false);
  const [dateDraftVersion, setDateDraftVersion] = useState(0);
  const [viewRefresh, setViewRefresh] = useState(0);
  const lastWritten = useRef<{ query: string; initialDomain: string } | null>(null);
  const requests = useRef<Record<string, string>>({});
  const generation = useRef({ value: 0 });
  const activeRequest = useRef<AbortController | null>(null);
  const windowKey = useRef<string | null>(null);
  const newRecordTitle = useRef<HTMLInputElement | null>(null);
  const templateEditor = useRecordTemplateInsertion({ body, title, baseKey: "new-record", onBodyChange: setBody, sources: draftSources, onSourcesChange: setDraftSources });
  const recordLocked = busy || pendingClipCommand !== null;

  useEffect(() => {
    if (lastWritten.current?.query === rawQuery && lastWritten.current.initialDomain === initialDomain) return;
    const params = new URLSearchParams(rawQuery);
    if (!params.has("domainId") && initialDomain) params.set("domainId", initialDomain);
    try { setConfig(knowledgeViewConfigFromQuery(params)); setCalendarMonth(params.get("calendarMonth") || undefined); setDateDraftVersion(value => value + 1); setQueryError(""); }
    catch (cause) { setConfig(null); setCalendarMonth(undefined); setQueryError(cause instanceof Error ? cause.message : "检索地址无效。"); }
  }, [rawQuery, initialDomain]);

  useEffect(() => {
    if (!config) return;
    const params = knowledgeViewConfigToQuery(config, { calendarMonth });
    if (initialDomain && !config.filters.domainId) params.set("domainId", "");
    const url = new URL(window.location.href);
    url.search = params.toString();
    lastWritten.current = { query: params.toString(), initialDomain };
    if (url.search !== window.location.search) window.history.replaceState(window.history.state, "", url);
  }, [config, calendarMonth, initialDomain]);

  const hasNewDraft = !!(title || body || aliasesText || kind !== "note" || draftDomainTouched || recordDate !== null || draftSources.length);
  const filterDomain = config?.filters.domainId || "";
  useEffect(() => { if (!hasNewDraft) setDraftDomain(filterDomain); }, [filterDomain, hasNewDraft]);

  const filtersKey = config ? JSON.stringify(config.filters) : "";
  const load = useCallback(async (offset = 0) => {
    if (!filtersKey) return;
    const request = ++generation.current.value;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const filters = JSON.parse(filtersKey) as KnowledgeViewConfig["filters"];
    const params = knowledgeViewConfigToQuery({ ...defaultKnowledgeViewConfig(), filters });
    params.set("limit", "50"); params.set("offset", String(offset));
    setListLoading(true);
    try {
      const [result, groups, links, domainList] = await Promise.all([
        readRecordJson<RecordList>(`/api/knowledge-points?${params}`, controller.signal),
        readRecordJson<{ collections: Collection[] }>("/api/knowledge-collections", controller.signal),
        readRecordJson<{ relations: Relation[] }>(`/api/knowledge-points/relations?domainId=${encodeURIComponent(filters.domainId)}`, controller.signal),
        readRecordJson<{ domains: Domain[] }>("/api/domains", controller.signal)
      ]);
      if (request !== generation.current.value) return;
      let current = result, pageOffset = offset;
      if (pageOffset && windowKey.current !== JSON.stringify(result.dateWindow ?? null)) {
        params.set("offset", "0");
        current = await readRecordJson<RecordList>(`/api/knowledge-points?${params}`, controller.signal);
        pageOffset = 0;
        if (request !== generation.current.value) return;
        setMessage("日期窗口已变化，已从最新首页重新读取。");
      }
      windowKey.current = JSON.stringify(current.dateWindow ?? null);
      setDateWindow(current.dateWindow ?? null);
      setAcceptedFiltersKey(filtersKey);
      setRecords(previous => pageOffset ? [...previous, ...current.knowledgePoints.filter(record => !previous.some(old => old.id === record.id))] : current.knowledgePoints);
      setNextOffset(current.page.nextOffset); setTotal(current.page.total);
      setUnavailableReason(current.unavailableReason); setCollections(groups.collections); setRelations(links.relations); setDomains(domainList.domains);
      setMetadataReady(true); setError("");
    } catch (cause) {
      if (request === generation.current.value && !controller.signal.aborted) throw cause;
    } finally { if (request === generation.current.value) setListLoading(false); }
  }, [filtersKey]);

  useEffect(() => {
    const counter = generation.current;
    counter.value++; windowKey.current = null;
    setRecords([]); setNextOffset(null); setTotal(0); setUnavailableReason(undefined); setDateWindow(null); setAcceptedFiltersKey("");
    if (!filtersKey) { setListLoading(false); return; }
    setListLoading(true);
    const timer = setTimeout(() => void load().catch(cause => setError(cause instanceof Error ? cause.message : "无法读取个人网络。")), 180);
    return () => { clearTimeout(timer); counter.value++; activeRequest.current?.abort(); };
  }, [load, filtersKey]);
  const latestLoad = useRef(load);
  latestLoad.current = load;

  const applyConfig = useCallback((value: KnowledgeViewConfig) => {
    try { setConfig(parseKnowledgeViewConfig(value)); setQueryError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "视图条件无效。"); }
  }, []);
  const editDateDraft = useCallback(() => setDateDraftVersion(value => value + 1), []);

  const mutate = async (path: string, data?: unknown, method = "POST") => {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "操作失败。");
      setViewRefresh(value => value + 1);
      try { await latestLoad.current(); }
      catch (cause) { setError(`操作已保存，但重新读取失败：${cause instanceof Error ? cause.message : "请重试读取"}`); }
      return result;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败。"); return null; }
    finally { setBusy(false); }
  };

  const sourceView = config ? knowledgeViewForConfig(config, { calendarMonth }) : "/learning/knowledge";
  const clipSaveInFlight = useRef(false);
  const saveClipCommand = async (payload: string) => {
    if (clipSaveInFlight.current) return;
    clipSaveInFlight.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/knowledge-points", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
      const result = await response.json();
      if (response.status >= 500) throw new Error(result.error || "服务暂不可用。");
      if (!response.ok) {
        setPendingClipCommand(null);
        setError(response.status === 410 ? `${result.error || "剪藏预览已过期或重启后不可用。"} 原保存命令未找到成功结果；草稿保留，请重读后明确采用新来源，正文由你合并。` : result.error || "保存失败，草稿保留。");
        return;
      }
      if (typeof result.knowledgePoint?.id !== "string" || typeof result.knowledgePoint?.title !== "string" || typeof result.savedRevisionId !== "string" || typeof result.reused !== "boolean") throw new Error("保存响应身份不完整。");
      const original = Array.isArray(result.revisions) ? result.revisions.find((revision: { id?: unknown; sequence?: unknown }) => revision.id === result.savedRevisionId) : null;
      if (!original || !Number.isSafeInteger(original.sequence) || original.sequence < 1) throw new Error("尚未读取到本次保存对应的历史版本。");
      setPendingClipCommand(null); templateEditor.reset();
      setSavedRecord({ id: result.knowledgePoint.id, title: result.knowledgePoint.title, savedSequence: original.sequence, reused: result.reused });
      setTitle(""); setBody(""); setAliasesText(""); setDraftSources([]); setDraftDomainTouched(false);
      setViewRefresh(value => value + 1);
      try { await latestLoad.current(); } catch { setError("记录已经保存，但列表重新读取失败，请重试读取个人网络。"); }
    } catch (cause) {
      setPendingClipCommand(payload);
      setError(`上次剪藏保存结果不明：${cause instanceof Error ? cause.message : "连接中断"}。原提交和请求身份已保留，请核对后再继续。`);
    } finally { clipSaveInFlight.current = false; setBusy(false); }
  };
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat("en-CA", { calendar: "gregory", numberingSystem: "latn", timeZone: config?.filters.date.timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }), [config?.filters.date.timeZone]);
  const formatDate = (value: string | undefined) => {
    if (!value) return "未提供";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "未提供";
    const parts = dateFormatter.formatToParts(date), get = (key: string) => parts.find(part => part.type === key)?.value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  };

  return <AppShell>
    <PageHeader title="个人知识网络" description="随时记录疑问与理解，持续修订，并通过关系和主题连接自己的内容。" />
    {queryError && <SectionPanel><p role="alert">{queryError}。当前地址没有被当作全部记录运行。</p><ActionButton variant="secondary" onClick={() => applyConfig(defaultKnowledgeViewConfig())}>清除无效筛选</ActionButton></SectionPanel>}
    {config && <>
      <KnowledgeViewFilters config={config} domains={domains} collections={collections} metadataReady={metadataReady} onChange={applyConfig} onDateDraftChange={setDateDraftPending} onDateDraftEdit={editDateDraft} />
      <KnowledgeRecordCalendar config={config} month={calendarMonth} refresh={viewRefresh} dateDraftPending={dateDraftPending} disabled={recordLocked} onMonthChange={month => { setCalendarMonth(month); editDateDraft(); }} onSelectDay={day => { setCalendarMonth(day.slice(0, 7)); applyConfig({ ...config, filters: { ...config.filters, date: { field: config.filters.date.field, timeZone: config.filters.date.timeZone, mode: "range", from: day, to: day } } }); }} onWriteDate={date => { setRecordDate(date); setMessage(`本人记录日期已设为 ${date.date}；标题、正文和保存领域保留，仍需确认保存。`); newRecordTitle.current?.focus(); }} />
      <SavedKnowledgeViews config={config} domains={domains} collections={collections} refresh={viewRefresh} unavailableReason={unavailableReason} dateDraftPending={dateDraftPending} dateDraftVersion={dateDraftVersion} onApply={value => { applyConfig(value); setCalendarMonth(value.filters.date.mode === "range" && value.filters.date.from ? value.filters.date.from.slice(0, 7) : undefined); }} />
    </>}
    {error && <div role="alert"><p className="text-rose-700">{error}</p><ActionButton variant="secondary" disabled={listLoading || !config} onClick={() => void load().catch(cause => setError(cause instanceof Error ? cause.message : "无法读取个人网络。"))}>重试读取个人网络</ActionButton></div>}
    {message && <p role="status">{message}</p>}
    {savedRecord && <p role="status">已保存“{savedRecord.title}”；即使它不符合当前视图，也可以<Link className="ml-2 underline" href={knowledgeRecordHref(savedRecord.id, sourceView)}>打开已保存记录“{savedRecord.title}”</Link>。{savedRecord.savedSequence && <span>本次保存对应修订 {savedRecord.savedSequence}；{savedRecord.reused ? "核对到同一保存命令的既有结果" : "本次保存成功"}。打开链接显示记录当前版本，原保存修订可在历史中查看。</span>}</p>}

    <SectionPanel>
      <h2>新建个人记录</h2>
      <input aria-label="新记录标题" ref={newRecordTitle} disabled={recordLocked} className="workshop-input w-full" placeholder="标题" value={title} onChange={event => setTitle(event.target.value)} />
      <label className="block">新记录保存领域 <select aria-label="新记录保存领域" disabled={recordLocked} className="workshop-input" value={draftDomain} onChange={event => { setDraftDomain(event.target.value); setDraftDomainTouched(true); }}><option value="">独立记录</option>{draftDomain && !domains.some(domain => domain.id === draftDomain) && <option value={draftDomain}>当前保存领域（尚未读取或不可用）</option>}{domains.map(domain => <option key={domain.id} value={domain.id}>{domain.name}</option>)}</select></label>
      <p className="text-sm">开始填写后，切换检索视图不会改变这条记录的保存领域；可以在这里明确改选。</p>
      <label className="block">别名（每行一个，可选）<textarea aria-label="新记录别名" disabled={recordLocked} className="workshop-input mt-2 min-h-20 w-full" rows={3} value={aliasesText} onChange={event => setAliasesText(event.target.value)} placeholder={"例如：conditional probability\nCP"} /></label>
      <p className="text-sm">最多20个别名，每个最多80个字符。</p>
      <select aria-label="新记录类型" disabled={recordLocked} className="workshop-input" value={kind} onChange={event => setKind(event.target.value)}>{Object.entries(recordKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <RecordDateEditor value={recordDate} onChange={setRecordDate} disabled={recordLocked} defaultTimeZone={config?.filters.date.timeZone || "UTC"} />
      <textarea aria-label="新记录内容" ref={templateEditor.textareaRef} onSelect={templateEditor.rememberPosition} onBlur={templateEditor.rememberPosition} disabled={recordLocked} className="workshop-input min-h-28 w-full" value={body} onChange={event => templateEditor.editBody(event.target.value)} />
      <RecordTemplatePicker editor={templateEditor} disabled={recordLocked} />
      <RecordClipper editor={templateEditor} sources={draftSources} onSourcesChange={setDraftSources} disabled={busy} replacementLocked={pendingClipCommand !== null} />
      {pendingClipCommand && <ActionButton variant="secondary" disabled={busy} onClick={() => void saveClipCommand(pendingClipCommand)}>核对上次剪藏保存结果</ActionButton>}
      <ActionButton disabled={recordLocked || !title.trim() || !body.trim()} onClick={async () => {
        let aliases: string[], assigned: AssignedRecordDate | null, sources;
        try { aliases = recordAliasesInput(aliasesText); assigned = parseAssignedRecordDate(recordDate); sources = recordSourceInputs(draftSources, []); } catch (cause) { setError(cause instanceof Error ? cause.message : "别名或记录日期输入无效。"); return; }
        const key = JSON.stringify({ title, body, kind, domain: draftDomain, aliases, recordDate: assigned, ...(sources.length ? { sources } : {}) });
        const payload = { requestId: requests.current[key] ||= crypto.randomUUID(), title, body, kind, aliases, domainId: draftDomain || undefined, recordDate: assigned, ...(sources.length ? { sources } : {}) };
        if (sources.length) { await saveClipCommand(JSON.stringify(payload)); return; }
        const result = await mutate("/api/knowledge-points", payload);
        if (result) { templateEditor.reset(); setSavedRecord({ id: result.knowledgePoint.id, title: result.knowledgePoint.title }); setTitle(""); setBody(""); setAliasesText(""); setDraftDomainTouched(false); }
      }}>确认保存</ActionButton>
      <p>可以独立保存；不要求先完成课程或练习。</p>
    </SectionPanel>

    <SectionPanel>
      <h2>主题组织</h2>
      <input aria-label="新主题名称" disabled={busy} className="workshop-input" value={topic} onChange={event => setTopic(event.target.value)} placeholder="主题名称" />
      <ActionButton variant="secondary" disabled={busy || !topic.trim()} onClick={async () => { if (await mutate("/api/knowledge-collections", { title: topic, domainId: config?.filters.domainId || undefined })) setTopic(""); }}>创建主题</ActionButton>
      {collections.map(collection => <div className="flex flex-wrap items-center gap-3" key={collection.id}>
        <button className="underline" onClick={() => { if (config) applyConfig({ ...config, filters: { ...config.filters, collectionId: collection.id } }); }}>{collection.title} · {collection.memberships.length} 条记录</button>
        {renaming?.id === collection.id ? <><input aria-label="新的主题名称" disabled={busy} className="workshop-input" value={renaming.title} onChange={event => setRenaming({ ...renaming, title: event.target.value })} /><ActionButton variant="secondary" disabled={busy || !renaming.title.trim()} onClick={async () => { if (await mutate(`/api/knowledge-collections/${encodeURIComponent(collection.id)}`, { title: renaming.title.trim() }, "PATCH")) setRenaming(null); }}>保存主题名称</ActionButton><ActionButton variant="secondary" disabled={busy} onClick={() => setRenaming(null)}>取消改名</ActionButton></> : <ActionButton variant="secondary" disabled={busy} onClick={() => setRenaming({ id: collection.id, title: collection.title })}>改名</ActionButton>}
        <ActionButton variant="secondary" disabled={busy} onClick={() => void mutate(`/api/knowledge-collections/${encodeURIComponent(collection.id)}`, undefined, "DELETE")}>删除主题，保留记录</ActionButton>
      </div>)}
    </SectionPanel>

    <SectionPanel aria-label="个人记录列表">
      <h2>已保存记录 · {records.length} / {total}</h2>
      <KnowledgeExportControls mode="view" scope={config ? { mode: "view", filters: config.filters, observedDateWindow: dateWindow } : null} scopeKey={JSON.stringify([filtersKey, dateWindow])} disabledReason={!config ? "检索地址无效，请明确修复筛选后导出。" : dateDraftPending ? "日期条件尚未应用，请先应用或恢复日期筛选后导出。" : unavailableReason ? `检索条件不可用：${unavailableReason}。请明确改选后导出。` : !metadataReady || acceptedFiltersKey !== filtersKey || listLoading ? "正在读取已应用检索结果，请稍后导出。" : undefined} />
      {unavailableReason && <p role="status" className="text-amber-800">条件不可用：{unavailableReason}。原筛选仍保留，请明确改选后再运行或保存。</p>}
      {dateWindow && <p className="text-sm">当前日期窗口：{dateWindow.from || "不限起日"} 至 {dateWindow.to || "不限止日"} · {dateWindow.timeZone}</p>}
      {config && records.map(record => <article aria-label={`个人记录：${record.title}`} key={record.id} className="border-t py-3">
        <Link className="text-lg underline" href={knowledgeRecordHref(record.id, sourceView)}>{record.title}</Link>
        {config.displayFields.map(field => {
          if (field === "summary") return <p key={field} className="whitespace-pre-wrap break-words">{record.body.slice(0, 450)}</p>;
          if (field === "aliases") return recordAliasSummary(record) ? <p key={field} className="text-sm">{recordAliasSummary(record)}</p> : null;
          if (field === "kind") return <p key={field} className="text-sm">记录类型：{recordKindLabels[record.kind] || record.kind}</p>;
          if (field === "sourceType") return <p key={field} className="text-sm">内容来源：{recordSourceLabels[recordSourceCategory(record.sourceCategory || record.sourceType)]}</p>;
          if (field === "domains") return <p key={field} className="text-sm">所属领域：{record.domainIds.map(id => domains.find(domain => domain.id === id)?.name || "未读取或已归档的领域").join("、") || "独立记录"}</p>;
          if (field === "collections") return <p key={field} className="text-sm">主题：{record.collections.map(collection => collection.title).join("、") || "无"}</p>;
          if (field === "createdAt") return <p key={field} className="text-sm">创建日期：{formatDate(record.createdAt)}</p>;
          if (field === "recordDate") return <p key={field} className="text-sm">本人记录日期：{recordDateDescription(record.recordDate, record.recordDateUnavailableReason)}</p>;
          return <p key={field} className="text-sm">记录更新日期：{formatDate(record.updatedAt)}</p>;
        })}
      </article>)}
      {!records.length && !listLoading && !unavailableReason && config && <p>这里还没有符合条件的记录。</p>}
      {nextOffset !== null && <ActionButton variant="secondary" disabled={listLoading} onClick={() => void load(nextOffset).catch(cause => setError(cause instanceof Error ? cause.message : "无法继续读取记录。"))}>继续查看更早的记录</ActionButton>}
      {listLoading && <p role="status">正在读取个人记录…</p>}
    </SectionPanel>

    <SectionPanel>
      <h2>关系与待确认建议</h2>
      {relations.filter(relation => relation.status !== "rejected").map(relation => <div key={relation.id} className="border-t py-3">
        <p><Link className="underline" href={knowledgeRecordHref(relation.fromKnowledgePointId, sourceView)}>{relation.fromTitle}</Link> {["related", "analogy", "contrast"].includes(relation.type) ? "↔" : "→"} <Link className="underline" href={knowledgeRecordHref(relation.toKnowledgePointId, sourceView)}>{relation.toTitle}</Link> · {relationKindLabels[relation.type] || relation.type}</p><p>{relation.detail}</p>
        {relation.status === "candidate" ? <><p>AI 候选，尚未进入正式网络。</p><ActionButton disabled={busy} onClick={() => void mutate(`/api/knowledge-points/relations/${encodeURIComponent(relation.id)}`, { action: "accept" }, "PATCH")}>接受这条关系</ActionButton><ActionButton variant="secondary" disabled={busy} onClick={() => void mutate(`/api/knowledge-points/relations/${encodeURIComponent(relation.id)}`, { action: "reject" }, "PATCH")}>拒绝</ActionButton></> : <><p>用户已确认；证据强度不代表掌握认证。</p><ActionButton variant="secondary" disabled={busy} onClick={() => void mutate(`/api/knowledge-points/relations/${encodeURIComponent(relation.id)}`, undefined, "DELETE")}>删除联系，保留记录</ActionButton></>}
      </div>)}
    </SectionPanel>
  </AppShell>;
}
