"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { canUndoTemplateInsertion, planTemplateInsertion, textareaText, type TemplateInsertionPlan, type TemplateUndo, type TextareaPosition } from "./recordTemplateInsertion";

export type RecordTemplateDraftPreview = { plan: TemplateInsertionPlan; baseKey: string; title: string; epoch: number; positionKey: string };

export function useRecordTemplateInsertion({ body, title, baseKey, onBodyChange }: { body: string; title: string; baseKey: string; onBodyChange: (value: string) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [epoch, setEpoch] = useState(0);
  const counter = useRef(0);
  const [position, setPosition] = useState<TextareaPosition | null>(null);
  const [undo, setUndo] = useState<TemplateUndo | null>(null);
  const [notice, setNotice] = useState("");
  const [focus, setFocus] = useState<{ body: string; caret: number } | null>(null);
  const latest = useRef({ body, title, baseKey, epoch, position, onBodyChange });
  latest.current = { body, title, baseKey, epoch, position, onBodyChange };
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
    setNotice(undo ? "正文已继续编辑，撤销模板插入已失效；后来的文字保留。" : "");
    onBodyChange(value);
  };
  const positionKey = JSON.stringify(position);
  const isCurrent = (preview: RecordTemplateDraftPreview) => {
    const current = latest.current;
    return preview.baseKey === current.baseKey && preview.title === current.title && preview.epoch === current.epoch && preview.epoch === counter.current
      && preview.plan.before === current.body && preview.positionKey === JSON.stringify(current.position);
  };
  const capture = (text: string): RecordTemplateDraftPreview => {
    const current = latest.current;
    return { plan: planTemplateInsertion(current.body, text, current.position), baseKey: current.baseKey, title: current.title, epoch: current.epoch, positionKey: JSON.stringify(current.position) };
  };
  const insert = (preview: RecordTemplateDraftPreview) => {
    if (!isCurrent(preview)) return false;
    const nextEpoch = ++counter.current;
    setEpoch(nextEpoch); setUndo({ baseKey, epoch: nextEpoch, before: body, after: preview.plan.after, caret: textareaText(body.slice(0, preview.plan.offset)).length });
    onBodyChange(preview.plan.after); setFocus({ body: preview.plan.after, caret: preview.plan.caret });
    setNotice("模板已插入正文草稿，尚未保存。其他记录字段保持原样。");
    return true;
  };
  const canUndo = canUndoTemplateInsertion(undo, { body, baseKey, epoch });
  const undoInsertion = () => {
    if (!canUndoTemplateInsertion(undo, latest.current) || !undo) return false;
    counter.current++; setEpoch(counter.current); onBodyChange(undo.before); setFocus({ body: undo.before, caret: undo.caret }); setUndo(null);
    setNotice("已撤销最近一次模板插入，正文草稿恢复；尚未保存。"); return true;
  };
  return { textareaRef, rememberPosition, editBody, reset, capture, isCurrent, insert, canUndo, undoInsertion, notice, body, title, baseKey, epoch, positionKey };
}

export type RecordTemplateInsertionController = ReturnType<typeof useRecordTemplateInsertion>;
