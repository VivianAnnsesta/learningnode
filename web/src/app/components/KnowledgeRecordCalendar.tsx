"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseCalendarMonth, shiftCalendarMonth } from "../../lib/learning/civilDateContracts";
import { knowledgeCalendarQuery, type KnowledgeRecordCalendarResult } from "../../lib/learning/knowledgeCalendarContracts";
import type { AssignedRecordDate } from "../../lib/learning/recordDateContracts";
import type { KnowledgeViewConfig } from "../../lib/learning/knowledgeViewContracts";
import { readRecordJson } from "./recordDiscoveryTypes";
import { ActionButton, SectionPanel } from "./ui";

export function KnowledgeRecordCalendar({ config, month, refresh, dateDraftPending, disabled, onMonthChange, onSelectDay, onWriteDate }: {
  config: KnowledgeViewConfig; month?: string; refresh: number; dateDraftPending: boolean; disabled: boolean;
  onMonthChange: (month: string | undefined) => void; onSelectDay: (day: string) => void; onWriteDate: (date: AssignedRecordDate) => void;
}) {
  const queryKey = knowledgeCalendarQuery(config, month).toString();
  const [response, setResponse] = useState<{ queryKey: string; data: KnowledgeRecordCalendarResult } | null>(null);
  const result = response?.queryKey === queryKey ? response.data : null;
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [monthDraft, setMonthDraft] = useState(month || ""), [monthError, setMonthError] = useState("");
  const generation = useRef({ value: 0 }), activeRequest = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    const request = ++generation.current.value; activeRequest.current?.abort();
    const controller = new AbortController(); activeRequest.current = controller;
    setLoading(true); setError(""); setResponse(null);
    try {
      const data = await readRecordJson<KnowledgeRecordCalendarResult>(`/api/knowledge-points/calendar?${queryKey}`, controller.signal);
      if (request !== generation.current.value) return;
      setResponse({ queryKey, data }); setMonthDraft(data.month);
    } catch (cause) { if (request === generation.current.value && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "月历读取失败，请重试。"); }
    finally { if (request === generation.current.value) setLoading(false); }
  }, [queryKey]);
  useEffect(() => {
    const token = generation.current;
    token.value++; setLoading(true); setError(""); setResponse(null);
    const timer = setTimeout(() => void load(), 180);
    return () => { clearTimeout(timer); token.value++; activeRequest.current?.abort(); };
  }, [load, refresh]);
  const shownMonth = result?.month || month;
  const previous = shownMonth ? shiftCalendarMonth(shownMonth, -1) : null, next = shownMonth ? shiftCalendarMonth(shownMonth, 1) : null;
  const date = config.filters.date;
  const selectedDay = date.mode === "range" && date.from && date.from === date.to ? date.from : null;
  const basis = date.field === "recorded" ? "本人指定记录日期" : date.field === "created" ? "记录创建日期" : "记录更新日期";
  const offset = result ? (new Date(`${result.month}-01T12:00:00.000Z`).getUTCDay() + 6) % 7 : 0;
  const selectDisabled = loading || dateDraftPending || !!result?.unavailableReason;
  return <SectionPanel aria-label="个人记录月历">
    <h2 className="text-xl">个人记录月历</h2>
    <p className="text-sm">整月概览不套用当前日期范围；选日将用该日替换范围。关键词、领域、主题、类型与来源沿用当前筛选，选日不会修改或保存记录。</p>
    <p className="text-sm">已应用依据：{basis} · 时区：{date.timeZone}。{date.field === "recorded" ? "本人日期按字面归档，时区只影响今天与相对窗口，不移动归档日。" : "系统时间按该时区换算日期，不代表学习日期。"}</p>
    <div className="flex flex-wrap items-center gap-3">
      <ActionButton variant="secondary" disabled={loading || !previous} onClick={() => { if (previous) onMonthChange(previous); }}>上个月</ActionButton>
      <label>浏览月份 <input aria-label="浏览月份" type="month" min="0001-01" max="9999-12" disabled={loading} className="workshop-input" value={monthDraft} onChange={event => { setMonthDraft(event.target.value); setMonthError(""); }} /></label>
      <ActionButton variant="secondary" disabled={loading} onClick={() => { try { onMonthChange(parseCalendarMonth(monthDraft)); setMonthError(""); } catch (cause) { setMonthError(cause instanceof Error ? cause.message : "月份无效。"); } }}>查看所填月份</ActionButton>
      <ActionButton variant="secondary" disabled={loading || !next} onClick={() => { if (next) onMonthChange(next); }}>下个月</ActionButton>
      <ActionButton variant="secondary" disabled={loading} onClick={() => { onMonthChange(undefined); if (!month) void load(); }}>回到今天所在月</ActionButton>
    </div>
    {monthError && <p role="alert">{monthError}</p>}{error && <div role="alert"><p>{error}</p><ActionButton variant="secondary" disabled={loading} onClick={() => void load()}>重试读取月历</ActionButton></div>}
    {loading && <p role="status">正在读取月历计数，尚未取得数量。</p>}
    {dateDraftPending && <p role="status">日期设置尚未应用，请先应用或恢复日期，再通过月历选择日期或填写记录。</p>}
    {result && <>
      <p>{result.month} · 本月符合基础筛选的记录：{result.total} 条 · 该时区今天：{result.today}</p>
      {result.unavailableReason && <p role="status">月历条件不可用：{result.unavailableReason}。筛选仍保留。</p>}
      {date.field === "recorded" && <p className="text-sm">基础筛选全范围中，未指定本人日期：{result.undatedCount} 条；日期不可用：{result.unavailableDateCount} 条。它们不能归入某个月，不计入本月日格。</p>}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {["一", "二", "三", "四", "五", "六", "日"].map(day => <span key={day} className="py-1 text-center text-sm" aria-hidden="true">{day}</span>)}
        {Array.from({ length: offset }, (_, index) => <span key={`space-${index}`} aria-hidden="true" />)}
        {result.days.map(day => <button key={day.date} aria-label={`查看 ${day.date}，${day.count} 条记录`} aria-pressed={selectedDay === day.date} disabled={selectDisabled} className={`rounded border p-2 text-center text-sm disabled:opacity-50 ${selectedDay === day.date ? "border-amber-600 bg-amber-50" : ""}`} onClick={() => onSelectDay(day.date)}><span className="block">{Number(day.date.slice(8))}{day.date === result.today ? " · 今" : ""}</span><span className="block text-xs">{day.count} 条</span></button>)}
      </div>
      {selectedDay && <div className="flex flex-wrap items-center gap-3"><p>当前查看日期：{selectedDay}</p><ActionButton variant="secondary" disabled={disabled || selectDisabled} onClick={() => onWriteDate({ date: selectedDay, timeZone: date.timeZone })}>为 {selectedDay} 填写记录</ActionButton><p className="text-sm">只设置新记录表单的本人日期，现有正文、别名、类型和保存领域仍保留；仍需确认保存。</p></div>}
    </>}
  </SectionPanel>;
}
