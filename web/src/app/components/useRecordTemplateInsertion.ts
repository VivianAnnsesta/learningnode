"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { canUndoRecordSourceInsertion, planTemplateInsertion, textareaText, type TemplateInsertionPlan, type TemplateUndo, type TextareaPosition } from "./recordTemplateInsertion";
import { isRecordClipDraftSource, isRecordClipSnapshot, recordClipSourceKey, type RecordClipDraftSource } from "../../lib/learning/recordClipContracts";

export type RecordTemplateDraftPreview = { plan: TemplateInsertionPlan; baseKey: string; title: string; epoch: number; positionKey: string; sources: unknown[] };
const noSources: unknown[] = [];
type InsertionUndo = TemplateUndo & { kind: "template" | "clip"; sourcesBefore: unknown[]; sourcesAfter: unknown[] };

export function useRecordTemplateInsertion({ body, title, baseKey, onBodyChange, sources = noSources, onSourcesChange }: { body: string; title: string; baseKey: string; onBodyChange: (value: string) => void; sources?: unknown[]; onSourcesChange?: (sources: unknown[]) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [epoch, setEpoch] = useState(0);
  const counter = useRef(0);
  const [position, setPosition] = useState<TextareaPosition | null>(null);
  const [undo, setUndo] = useState<InsertionUndo | null>(null);
  const [notice, setNotice] = useState("");
  const [noticeKind, setNoticeKind] = useState<"template" | "clip">("template");
  const [focus, setFocus] = useState<{ body: string; caret: number } | null>(null);
  const latest = useRef({ body, title, baseKey, epoch, position, onBodyChange, sources, onSourcesChange });
  latest.current = { body, title, baseKey, epoch, position, onBodyChange, sources, onSourcesChange };
  const reset = useCallback(() => {
    counter.current++; setEpoch(counter.current); setPosition(null); setUndo(null); setFocus(null); setNotice("");
  }, []);
  useEffect(() => { reset(); }, [baseKey, reset]);

  const rememberPosition = useCallback(() => {
    const element = textareaRef.current;
    if (!element) return;
    const next = { value: element.value, start: element.selectionStart, end: element.selectionEnd };
    setPosition(previous => previous?.value === next.value && previous.start === next.start && previous.end === next.end ? previous : next);
  }, []);

  useEffect(() => {
    const element = textareaRef.current;
    if (!focus || !element || body !== focus.body || element.value !== textareaText(body)) return;
    element.focus(); element.setSelectionRange(focus.caret, focus.caret);
    rememberPosition(); setFocus(null);
  }, [body, focus, rememberPosition]);

  const editBody = (value: string) => {
    counter.current++; setEpoch(counter.current); setUndo(null);
    if (undo) setNoticeKind(undo.kind);
    setNotice(undo ? `正文已继续编辑，撤销${undo.kind === "clip" ? "剪藏" : "模板"}插入已失效；后来的文字保留。` : "");
    onBodyChange(value);
  };
  const positionKey = JSON.stringify(position);
  const isCurrent = (preview: RecordTemplateDraftPreview) => {
    const current = latest.current;
    return preview.baseKey === current.baseKey && preview.title === current.title && preview.epoch === current.epoch && preview.epoch === counter.current
      && preview.plan.before === current.body && preview.positionKey === JSON.stringify(current.position) && preview.sources === current.sources;
  };
  const capture = (text: string): RecordTemplateDraftPreview => {
    const current = latest.current;
    return { plan: planTemplateInsertion(current.body, text, current.position), baseKey: current.baseKey, title: current.title, epoch: current.epoch, positionKey: JSON.stringify(current.position), sources: current.sources };
  };
  const insertWithSource = (preview: RecordTemplateDraftPreview, source?: RecordClipDraftSource) => {
    if (!isCurrent(preview)) return false;
    const current = latest.current;
    if (source && (!current.onSourcesChange || current.sources.length >= 30 || current.sources.some(existing => (isRecordClipDraftSource(existing) || isRecordClipSnapshot(existing)) && recordClipSourceKey(existing) === recordClipSourceKey(source)))) return false;
    const afterSources = source ? [...current.sources, source] : current.sources;
    const nextEpoch = ++counter.current;
    setEpoch(nextEpoch); setUndo({ kind: source ? "clip" : "template", baseKey: current.baseKey, epoch: nextEpoch, before: current.body, after: preview.plan.after, caret: textareaText(current.body.slice(0, preview.plan.offset)).length, sourcesBefore: current.sources, sourcesAfter: afterSources });
    current.onBodyChange(preview.plan.after);
    if (source) current.onSourcesChange?.(afterSources);
    setFocus({ body: preview.plan.after, caret: preview.plan.caret });
    setNoticeKind(source ? "clip" : "template");
    setNotice(source ? "剪藏片段和来源已插入草稿，尚未保存。其他记录字段保持原样。" : "模板已插入正文草稿，尚未保存。其他记录字段保持原样。");
    return true;
  };
  const canUndoKind = (kind: InsertionUndo["kind"]) => undo?.kind === kind && canUndoRecordSourceInsertion(undo, { body, baseKey, epoch, sources });
  const undoKind = (kind: InsertionUndo["kind"]) => {
    const current = latest.current;
    if (undo?.kind !== kind || current.epoch !== counter.current || !canUndoRecordSourceInsertion(undo, current)) return false;
    counter.current++; setEpoch(counter.current); current.onBodyChange(undo.before);
    if (kind === "clip") current.onSourcesChange?.(undo.sourcesBefore);
    setFocus({ body: undo.before, caret: undo.caret }); setUndo(null);
    setNoticeKind(kind);
    setNotice(`已撤销最近一次${kind === "clip" ? "剪藏" : "模板"}插入，${kind === "clip" ? "正文和本次新增来源" : "正文草稿"}恢复；尚未保存。`); return true;
  };
  return { textareaRef, rememberPosition, editBody, reset, capture, isCurrent, insert: (preview: RecordTemplateDraftPreview) => insertWithSource(preview), canUndo: canUndoKind("template"), undoInsertion: () => undoKind("template"), insertClip: (preview: RecordTemplateDraftPreview, source: RecordClipDraftSource) => insertWithSource(preview, source), canUndoClip: canUndoKind("clip"), undoClip: () => undoKind("clip"), notice: noticeKind === "template" ? notice : "", clipNotice: noticeKind === "clip" ? notice : "", body, title, baseKey, epoch, positionKey };
}

export type RecordTemplateInsertionController = ReturnType<typeof useRecordTemplateInsertion>;
