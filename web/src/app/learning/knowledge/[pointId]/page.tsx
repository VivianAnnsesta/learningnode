"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ActionButton, AppShell, PageHeader, SectionPanel } from "../../../components/ui";
import { RecordContextPanel } from "../../../components/RecordContextPanel";
import { RecordNeighborhood } from "../../../components/RecordNeighborhood";
import { RecordReferencePicker } from "../../../components/RecordReferencePicker";
import { RecordReferencePreview } from "../../../components/RecordReferencePreview";
import { RecordMentionsPanel } from "../../../components/RecordMentionsPanel";
import { isRecordSnapshot, readRecordJson, recordAliasesInput, recordKindLabels, recordReferenceKey, recordReferenceLabel, recordSourceInputs, recordSourceLabels, relationKindLabels, sameRecordSource, type RecordChoice, type RecordSnapshot } from "../../../components/recordDiscoveryTypes";
import { knowledgeRecordHref, knowledgeReturnView } from "../../../components/knowledgeNavigation";

type Point = {
  id: string; title: string; body: string; kind: string; currentRevisionId: string;
  sourceType: string; sources: unknown[]; domainIds: string[];
  aliases?: string[];
  nodes: { id: string; domainId: string; title: string }[];
  collections: { id: string; title: string }[];
};
type Revision = { id: string; sequence: number; title: string; body: string; sourceType: string; sources: unknown[]; createdAt: string; aliases?: string[] };
type Relation = { id: string; fromTitle: string; toTitle: string; type: string; detail: string; status: string; aiAssessment: string | null };
type PointData = { knowledgePoint: Point; revisions: Revision[]; relations: Relation[] };
type Group = { id: string; title: string };
type Domain = { id: string; name: string };

export default function KnowledgePage() {
  return <Suspense fallback={<p role="status">正在读取个人记录…</p>}><KnowledgePageContent /></Suspense>;
}

function KnowledgePageContent() {
  const params = useParams(), router = useRouter(), id = String(params.pointId);
  const searchParams = useSearchParams(), sourceView = knowledgeReturnView(searchParams.toString());
  const [point, setPoint] = useState<Point | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [others, setOthers] = useState<RecordChoice[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [aliasesText, setAliasesText] = useState("");
  const [kind, setKind] = useState("note");
  const [draftRevisionId, setDraftRevisionId] = useState("");
  const [draftSources, setDraftSources] = useState<unknown[]>([]);
  const [savedSources, setSavedSources] = useState<unknown[]>([]);
  const [sourcesChanged, setSourcesChanged] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerHashing, setPickerHashing] = useState(false);
  const [target, setTarget] = useState("");
  const [relationType, setRelationType] = useState("related");
  const [detail, setDetail] = useState("");
  const [theme, setTheme] = useState("");
  const [domain, setDomain] = useState("");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);
  const generation = useRef({ value: 0 });
  const activeRequest = useRef<AbortController | null>(null);
  const currentId = useRef(id);
  currentId.current = id;

  const hydrateDraft = (record: Point) => {
    setTitle(record.title); setBody(record.body); setKind(record.kind);
    setAliasesText((record.aliases || []).join("\n"));
    setDraftRevisionId(record.currentRevisionId); setDraftSources(record.sources);
    setSavedSources(record.sources); setSourcesChanged(false);
  };
  const load = useCallback(async (hydrate = false) => {
    const request = ++generation.current.value;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    try {
      const [data, choices, collections, domainList] = await Promise.all([
        readRecordJson<PointData>(`/api/knowledge-points/${encodeURIComponent(id)}`, controller.signal),
        readRecordJson<{ knowledgePoints: RecordChoice[] }>("/api/knowledge-points?limit=50", controller.signal),
        readRecordJson<{ collections: Group[] }>("/api/knowledge-collections", controller.signal),
        readRecordJson<{ domains: Domain[] }>("/api/domains", controller.signal)
      ]);
      if (request !== generation.current.value || currentId.current !== id) return;
      setPoint(data.knowledgePoint); setRevisions(data.revisions); setRelations(data.relations);
      setOthers(choices.knowledgePoints.filter(record => record.id !== id));
      setGroups(collections.collections); setDomains(domainList.domains);
      if (hydrate) hydrateDraft(data.knowledgePoint);
    } catch (cause) {
      if (request === generation.current.value && !controller.signal.aborted) throw cause;
    } finally { if (request === generation.current.value) setLoading(false); }
  }, [id]);

  useEffect(() => {
    const counter = generation.current;
    setPoint(null); setRevisions([]); setRelations([]); setError(""); setMessage("");
    setTarget(""); setTheme(""); setDomain(""); setQuestion(""); setDetail(""); setBusy(false); setPickerOpen(false); setPickerHashing(false);
    void load(true).catch(cause => setError(cause instanceof Error ? cause.message : "无法读取个人记录。"));
    return () => { counter.value++; activeRequest.current?.abort(); };
  }, [load]);

  const mutate = async (path: string, data: unknown, method = "POST") => {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409 && currentId.current === id) {
          try { await load(false); } catch { /* Keep the original conflict and the local draft. */ }
        }
        throw new Error(result.error || "操作失败，请重试。");
      }
      if (currentId.current !== id) return null;
      setRefresh(previous => previous + 1);
      try { await load(false); }
      catch (cause) { setError(`操作已保存，但重新读取失败：${cause instanceof Error ? cause.message : "请重试读取"}`); }
      return result;
    } catch (cause) {
      if (currentId.current === id) setError(cause instanceof Error ? cause.message : "操作失败。");
      return null;
    } finally { if (currentId.current === id) setBusy(false); }
  };
  const addSource = (source: RecordSnapshot) => {
    if (draftSources.length >= 30) { setError("一份修订最多保存30个来源，请保留必要引用。"); return; }
    setDraftSources(previous => previous.some(value => isRecordSnapshot(value) && recordReferenceKey(value) === recordReferenceKey(source)) ? previous : [...previous, source]);
    setSourcesChanged(true); setMessage(`已把“${source.title}”的${recordReferenceLabel(source)}加入编辑草稿，尚未保存。`);
  };
  const draftRecords = draftSources.filter(isRecordSnapshot);
  const savedKeys = new Set(savedSources.filter(isRecordSnapshot).map(recordReferenceKey));
  const unavailable = busy || !point;

  return <AppShell>
    <PageHeader title={point?.title || "个人记录"} description="修订保留旧版本和来源，同一记录可引用到多个领域与主题。" actions={<Link className="underline" href={sourceView}>返回个人网络</Link>} />
    {error && <div role="alert"><p className="text-rose-700">{error}</p><ActionButton variant="secondary" disabled={loading || busy} onClick={() => { setError(""); void load(!point).catch(cause => setError(cause instanceof Error ? cause.message : "无法读取个人记录。")); }}>重试读取记录</ActionButton></div>}
    {message && <p role="status">{message}</p>}
    {loading && <p role="status">正在读取个人记录…</p>}
    {point && <>
      <SectionPanel aria-label="修订个人记录">
        <h2 className="text-xl">修订个人记录</h2>
        <input aria-label="记录标题" className="workshop-input w-full" disabled={unavailable} value={title} onChange={event => setTitle(event.target.value)} />
        <label className="block">别名（每行一个，可选）<textarea aria-label="记录别名" className="workshop-input mt-2 min-h-20 w-full" rows={3} disabled={unavailable} value={aliasesText} onChange={event => setAliasesText(event.target.value)} placeholder={"例如：conditional probability\nCP"} /></label>
        <p className="text-sm">最多20个别名，每个最多80个字符。修改后需要确认保存；清空后保存会移除当前别名，旧修订仍保留。</p>
        <textarea aria-label="修订记录内容" className="workshop-input min-h-40 w-full" disabled={unavailable} value={body} onChange={event => setBody(event.target.value)} />
        <select aria-label="记录类型" className="workshop-input" disabled={unavailable} value={kind} onChange={event => setKind(event.target.value)}>{Object.entries(recordKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <details onToggle={event => setPickerOpen(event.currentTarget.open)}><summary>添加记录引用</summary>{pickerOpen && <RecordReferencePicker key={id} pointId={id} selected={draftRecords} disabled={unavailable} onAdd={addSource} onPendingChange={setPickerHashing} />}</details>
        <div aria-label="当前编辑草稿的记录引用" className="space-y-2">{draftRecords.map(source => {
          const key = recordReferenceKey(source), isSaved = savedKeys.has(key), range = recordReferenceLabel(source);
          return <article key={key} aria-label={`草稿引用：${source.title} · ${range}`} className="rounded-lg border p-3"><p>{source.title} · {range} · {isSaved ? "已有引用" : "新增引用，尚未保存"}</p><details><summary>{source.selector ? "预览所选段落原文" : "预览所选修订原文"}</summary><RecordReferencePreview source={source} /></details>{!isSaved && <button className="underline" disabled={unavailable} onClick={() => setDraftSources(previous => previous.filter(value => !isRecordSnapshot(value) || recordReferenceKey(value) !== key))}>取消新增引用“{source.title}”{source.selector ? `的${range}` : ""}</button>}</article>;
        })}</div>
        <ActionButton disabled={unavailable || pickerHashing || !title.trim() || !body.trim()} onClick={async () => {
          let sources, aliases;
          try { aliases = recordAliasesInput(aliasesText); sources = sourcesChanged ? recordSourceInputs(draftSources, savedSources) : undefined; }
          catch (cause) { setError(cause instanceof Error ? cause.message : "无法保存引用，请回看最新来源。"); return; }
          const sourceType = point.sourceType === "accepted_ai" || point.sourceType === "excerpt" ? point.sourceType : "user";
          const result = await mutate(`/api/knowledge-points/${encodeURIComponent(id)}`, { title, body, kind, aliases, sourceType, ...(sourceType === "accepted_ai" ? { acceptAiContent: true } : {}), expectedRevisionId: draftRevisionId, ...(sources ? { sources } : {}) }, "PATCH");
          if (result && currentId.current === id) { hydrateDraft(result.knowledgePoint); setMessage("已保存新修订，原内容和引用快照仍可回看。"); }
        }}>确认保存新修订</ActionButton>
        <p>当前内容来源：{recordSourceLabels[point.sourceType] || "来源未注明"}。添加引用和保存修订不会完成学习任务或创建语义联系。</p>
        <p className="text-sm">当前已保存别名：{point.aliases?.join("、") || "无"}</p>
        {draftRevisionId !== point.currentRevisionId && <div className="space-y-3 rounded-lg border border-amber-300 p-3">
          <p role="status" className="text-amber-800">记录已有较新修订，你的编辑草稿仍保留。请比较并合并内容，再明确选择新的保存基础。</p>
          <details><summary>比较最新保存的内容</summary><p>{point.title}</p><p>最新别名：{point.aliases?.join("、") || "无"}</p><p className="whitespace-pre-wrap">{point.body}</p></details>
          <ActionButton variant="secondary" disabled={unavailable} onClick={() => {
            const sources = [...point.sources];
            for (const source of draftSources) {
              const newlyAdded = !savedSources.some(saved => sameRecordSource(saved, source));
              if (newlyAdded && !sources.some(saved => sameRecordSource(saved, source))) sources.push(source);
            }
            if (sources.length > 30) { setError("合并后来源超过30个，请先取消不需要的新增引用。"); return; }
            setDraftRevisionId(point.currentRevisionId); setDraftSources(sources); setSavedSources(point.sources); setSourcesChanged(true);
            setMessage("正文、别名草稿和新增引用已保留，已有来源采用最新修订。请检查后保存。");
          }}>已合并，使用最新修订作为保存基础</ActionButton>
        </div>}
      </SectionPanel>
      <RecordContextPanel key={`context-${id}`} pointId={id} refresh={refresh} returnTo={sourceView} />
      <RecordMentionsPanel key={`mentions-${id}`} pointId={id} revisionId={point.currentRevisionId || null} refresh={refresh} returnTo={sourceView} />
      <RecordNeighborhood key={`neighborhood-${id}`} pointId={id} refresh={refresh} returnTo={sourceView} />
      <SectionPanel>
        <h2 className="text-xl">引用与主题</h2>
        <p>已引用领域：{point.domainIds.length ? point.domainIds.map(domainId => <Link className="mr-3 underline" href={`/learning/domains/${encodeURIComponent(domainId)}`} key={domainId}>{domains.find(item => item.id === domainId)?.name || domainId}</Link>) : "独立记录"}</p>
        <div aria-label="引用本记录的学习任务">{point.nodes.map(node => <p key={node.id}><Link className="underline" href={`/learning/domains/${encodeURIComponent(node.domainId)}/items/${encodeURIComponent(node.id)}`}>学习任务：{node.title}</Link></p>)}</div>
        <select aria-label="引用到领域" className="workshop-input" disabled={unavailable} value={domain} onChange={event => setDomain(event.target.value)}><option value="">选择领域</option>{domains.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
        <ActionButton variant="secondary" disabled={unavailable || !domain} onClick={() => void mutate(`/api/knowledge-points/${encodeURIComponent(id)}/references`, { domainIds: [domain] })}>引用同一记录到该领域</ActionButton>
        <select aria-label="加入主题" className="workshop-input" disabled={unavailable} value={theme} onChange={event => setTheme(event.target.value)}><option value="">选择主题</option>{groups.map(group => <option value={group.id} key={group.id}>{group.title}</option>)}</select>
        <ActionButton variant="secondary" disabled={unavailable || !theme} onClick={() => void mutate(`/api/knowledge-collections/${encodeURIComponent(theme)}`, { knowledgePointId: id }, "PATCH")}>加入主题</ActionButton>
        {point.collections.map(group => <p key={group.id}><Link className="underline" href={`/learning/knowledge?collectionId=${encodeURIComponent(group.id)}`}>{group.title}</Link>{" "}<button className="underline" disabled={unavailable} onClick={() => void mutate(`/api/knowledge-collections/${encodeURIComponent(group.id)}`, { knowledgePointId: id, action: "remove" }, "PATCH")}>移出主题，保留记录</button></p>)}
      </SectionPanel>
      <SectionPanel>
        <h2 className="text-xl">建立普通联系</h2>
        <select aria-label="关系终点" className="workshop-input" disabled={unavailable} value={target} onChange={event => setTarget(event.target.value)}><option value="">选择另一条记录，可跨领域</option>{others.map(record => <option value={record.id} key={record.id}>{record.title}</option>)}</select>
        <select aria-label="关系类型" className="workshop-input" disabled={unavailable} value={relationType} onChange={event => setRelationType(event.target.value)}>{Object.entries(relationKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <textarea aria-label="关系说明" className="workshop-input w-full" disabled={unavailable} value={detail} onChange={event => setDetail(event.target.value)} />
        <ActionButton disabled={unavailable || !target || !detail.trim()} onClick={() => void mutate("/api/knowledge-points/relations", { fromKnowledgePointId: id, toKnowledgePointId: target, type: relationType, detail })}>确认建立联系</ActionButton>
        <ActionButton variant="secondary" disabled={unavailable || !target} onClick={() => void mutate("/api/knowledge-points/relations/suggestions", { knowledgePointIds: [id, target] })}>请 AI 提出候选联系</ActionButton>
        {relations.filter(relation => relation.status !== "rejected").map(relation => <div key={relation.id} className="border-t pt-3">
          <p>{relation.fromTitle} {["related", "analogy", "contrast"].includes(relation.type) ? "↔" : "→"} {relation.toTitle} · {relationKindLabels[relation.type] || relation.type}：{relation.detail}</p>
          <details><summary>修订联系说明</summary><form onSubmit={event => { event.preventDefault(); const description = String(new FormData(event.currentTarget).get("detail") || ""); void mutate(`/api/knowledge-points/relations/${encodeURIComponent(relation.id)}`, { action: "edit", detail: description }, "PATCH"); }}><textarea name="detail" aria-label={`修订联系：${relation.fromTitle}与${relation.toTitle}`} className="workshop-input w-full" disabled={unavailable} defaultValue={relation.detail || ""} /><ActionButton type="submit" disabled={unavailable}>确认修改联系说明</ActionButton></form></details>
          {relation.aiAssessment && <details><summary>候选依据、端点版本与不确定性</summary><pre className="whitespace-pre-wrap text-sm">{relation.aiAssessment}</pre></details>}
          {relation.status === "candidate" ? <><p>AI 候选尚未进入局部知识图谱。</p><ActionButton disabled={unavailable} onClick={() => void mutate(`/api/knowledge-points/relations/${encodeURIComponent(relation.id)}`, { action: "accept" }, "PATCH")}>接受关系</ActionButton><ActionButton variant="secondary" disabled={unavailable} onClick={() => void mutate(`/api/knowledge-points/relations/${encodeURIComponent(relation.id)}`, { action: "reject" }, "PATCH")}>拒绝</ActionButton></> : <ActionButton variant="secondary" disabled={unavailable} onClick={() => void mutate(`/api/knowledge-points/relations/${encodeURIComponent(relation.id)}`, {}, "DELETE")}>删除联系，保留两条记录</ActionButton>}
        </div>)}
      </SectionPanel>
      <SectionPanel>
        <h2 className="text-xl">从这条记录继续探索</h2>
        <input aria-label="记录探索问题" className="workshop-input w-full" disabled={unavailable} value={question} onChange={event => setQuestion(event.target.value)} placeholder="想进一步弄清什么？" />
        <ActionButton disabled={unavailable} onClick={async () => { const result = await mutate("/api/learning-sessions", { requestId: crypto.randomUUID(), knowledgePointId: id, question: question || undefined, returnTo: { href: knowledgeRecordHref(id,sourceView) } }); if (result && currentId.current === id) router.push(`/learning/sessions/${result.session.id}`); }}>开始探索并保留记录来源</ActionButton>
      </SectionPanel>
      <SectionPanel>
        <h2 className="text-xl">修订与原始来源</h2>
        {revisions.map(revision => <details key={revision.id}><summary>修订 {revision.sequence} · {revision.title} · {revision.sourceType}</summary><p className="whitespace-pre-wrap">{revision.body}</p><p>该修订别名：{revision.aliases?.join("、") || "无"}</p><p>{new Date(revision.createdAt).toLocaleString()}</p>{revision.sources.filter(isRecordSnapshot).map(source => <article key={recordReferenceKey(source)} aria-label={`历史引用：${source.title} · ${recordReferenceLabel(source)}`} className="my-3 rounded-lg border p-3"><p>引用：{source.title} · {recordReferenceLabel(source)}</p><RecordReferencePreview source={source} /><Link className="underline" href={knowledgeRecordHref(source.knowledgePointId,sourceView)}>打开记录当前版本</Link></article>)}<details><summary>查看完整来源快照</summary><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(revision.sources, null, 2)}</pre></details></details>)}
      </SectionPanel>
    </>}
  </AppShell>;
}
