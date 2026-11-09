"use client";

import { useEffect, useRef, useState } from "react";
import { builtInRecordTemplates, parseRecordTemplateTimeZone, renderRecordTemplate, type RecordTemplateConfig, type RecordTemplatePreview } from "../../lib/learning/recordTemplateContracts";
import { readRecordJson } from "./recordDiscoveryTypes";
import { RecordTemplateManager, type RecordTemplateDTO, type RecordTemplateSeed } from "./RecordTemplateManager";
import { ActionButton } from "./ui";
import type { RecordTemplateDraftPreview, RecordTemplateInsertionController } from "./useRecordTemplateInsertion";

type SelectedTemplate = { id: string; title: string; version?: number; config: RecordTemplateConfig; builtIn: boolean };
type Preview = { rendered: RecordTemplatePreview; draft: RecordTemplateDraftPreview; selectionKey: string; timeZone: string };

export function RecordTemplatePicker({ editor, disabled }: { editor: RecordTemplateInsertionController; disabled: boolean }) {
  const [open, setOpen] = useState(false), [selected, setSelected] = useState<SelectedTemplate | null>(null);
  const [localTimeZone, setLocalTimeZone] = useState("UTC"), [localZoneFallback, setLocalZoneFallback] = useState(false);
  const [timeZone, setTimeZone] = useState("UTC"), [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState(""), [selecting, setSelecting] = useState(false), [managerBusy, setManagerBusy] = useState(false);
  const [seed, setSeed] = useState<RecordTemplateSeed | null>(null), [customId, setCustomId] = useState("");
  const generation = useRef({ value: 0 }), selectionRequest = useRef<AbortController | null>(null);
  const seedCounter = useRef(0);
  useEffect(() => {
    try { setLocalTimeZone(parseRecordTemplateTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)); }
    catch { setLocalTimeZone("UTC"); setLocalZoneFallback(true); }
    const token = generation.current;
    return () => { token.value++; selectionRequest.current?.abort(); };
  }, []);
  const chooseCustom = async (id: string) => {
    const request = ++generation.current.value; selectionRequest.current?.abort();
    const controller = new AbortController(); selectionRequest.current = controller;
    setCustomId(id); setSelecting(true); setError(""); setPreview(null);
    try {
      const result = await readRecordJson<{ template: RecordTemplateDTO }>(`/api/knowledge-points/templates/${encodeURIComponent(id)}`, controller.signal);
      if (request !== generation.current.value) return;
      const template = result.template;
      if (template.schemaVersion !== 1 || !template.config || template.unavailableReason) throw new Error(template.unavailableReason || "这个模板的配置暂时不能预览。");
      setSelected({ id: template.id, title: template.title, version: template.version, config: template.config, builtIn: false }); setTimeZone(template.config.timeZone);
    } catch (cause) { if (request === generation.current.value && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "无法读取模板。"); }
    finally { if (request === generation.current.value) setSelecting(false); }
  };
  const selectionKey = JSON.stringify(selected);
  const currentPreview = !!preview && !selecting && preview.selectionKey === selectionKey && preview.timeZone === timeZone && editor.isCurrent(preview.draft);
  return <div className="space-y-3">
    <details onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer">使用记录模板</summary>
      <section aria-label="个人记录模板" className="mt-3 space-y-4 rounded-lg border p-4">
        <p>选择模板并预览后，明确插入正文草稿。模板不会改标题、记录类型、别名、来源、保存领域或主题；插入不代表保存或完成学习。</p>
        <div className="flex flex-wrap gap-3">{builtInRecordTemplates.map(template => <ActionButton key={template.id} variant="secondary" disabled={disabled || managerBusy} onClick={() => {
          generation.current.value++; selectionRequest.current?.abort(); setSelecting(false); setCustomId("");
          setSelected({ ...template, config: { body: template.body, timeZone: localTimeZone }, builtIn: true }); setTimeZone(localTimeZone); setPreview(null); setError("");
        }}>选择示例“{template.title}”</ActionButton>)}</div>
        <p className="text-sm">内置示例仅供选用，可自由改写或删除提示；{localZoneFallback ? "未能识别本地时区，示例明确使用 UTC。" : `示例默认时区：${localTimeZone}。`}</p>
        {selecting && <p role="status">正在读取所选模板…</p>}
        {error && <div role="alert"><p>{error}</p>{customId && <ActionButton variant="secondary" disabled={disabled || selecting} onClick={() => void chooseCustom(customId)}>重新读取所选模板</ActionButton>}</div>}
        {selected && <div className="space-y-3">
          <p>所选模板：{selected.title} · {selected.builtIn ? "内置示例" : `版本 ${selected.version}`}</p>
          <label className="block">本次模板预览时区<input aria-label="本次模板预览时区" className="workshop-input" disabled={disabled || selecting} value={timeZone} onChange={event => setTimeZone(event.target.value)} /></label>
          <p className="text-sm">本次调整时区不会修改已保存的模板。重新选择模板会读取其当前配置；已展示预览不会被外部更新悄悄替换。</p>
          <div className="flex flex-wrap gap-3"><ActionButton variant="secondary" disabled={disabled || selecting} onClick={() => {
            setError("");
            try {
              const rendered = renderRecordTemplate({ body: selected.config.body, timeZone }, { title: editor.title, now: new Date() });
              setPreview({ rendered, draft: editor.capture(rendered.text), selectionKey, timeZone });
            } catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : "模板预览失败。"); }
          }}>预览模板</ActionButton>{selected.builtIn && <ActionButton variant="secondary" disabled={disabled || managerBusy || selecting} onClick={() => {
            try { setSeed({ key: ++seedCounter.current, title: `${selected.title}（副本）`, config: { body: selected.config.body, timeZone: parseRecordTemplateTimeZone(timeZone) } }); setError(""); }
            catch (cause) { setError(cause instanceof Error ? cause.message : "请检查模板时区。"); }
          }}>复制所选示例为自定义模板</ActionButton>}</div>
        </div>}
        {preview && <section aria-label="模板插入预览" className="space-y-3 rounded border p-3">
          <p>捕获时间：{preview.rendered.capturedAt} · 本次时区：{preview.rendered.timeZone}</p>
          <p>{preview.draft.plan.position === "caret" ? "插入位置：正文光标处。" : preview.draft.plan.position === "after_selection" ? "插入位置：选区后，选中文字保留。" : "插入位置：正文末尾。"}{preview.draft.plan.fallback ? "原定位与正文不一致，当前明确预览末尾插入；需要其他位置时请重新定位并预览。" : ""}</p>
          <pre aria-label="模板预览正文" className="max-h-80 overflow-auto whitespace-pre-wrap break-words">{preview.rendered.text}</pre>
          {preview.rendered.hasUnresolvedVariables && <p role="status">模板含未知变量，已按原文保留，不会执行。</p>}
          {!currentPreview && <p role="status">正文、标题、定位或模板设置已经变化，请重新预览后再插入。</p>}
          <ActionButton disabled={disabled || !currentPreview} onClick={() => {
            if (editor.insert(preview.draft)) { setPreview(null); setError(""); }
            else setError("草稿或定位已变化，请重新预览；正文没有改变。");
          }}>插入正文草稿</ActionButton>
        </section>}
        <RecordTemplateManager enabled={open} disabled={disabled} defaultTimeZone={localTimeZone} seed={seed} onSelect={id => void chooseCustom(id)} onBusyChange={setManagerBusy} />
      </section>
    </details>
    <ActionButton variant="secondary" disabled={disabled || !editor.canUndo} onClick={() => editor.undoInsertion()}>撤销最近一次模板插入</ActionButton>
    {editor.notice && <p role="status">{editor.notice}</p>}
  </div>;
}
