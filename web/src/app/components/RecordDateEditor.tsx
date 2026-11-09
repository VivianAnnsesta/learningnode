"use client";

import { useEffect, useState } from "react";
import { getCivilDay, parseCivilTimeZone } from "../../lib/learning/civilDateContracts";
import { parseAssignedRecordDate, type AssignedRecordDate } from "../../lib/learning/recordDateContracts";
import { ActionButton } from "./ui";

export function recordDateDescription(value: AssignedRecordDate | null | undefined, unavailableReason?: string) {
  return unavailableReason ? `不可用：${unavailableReason}` : value ? `${value.date} · ${value.timeZone}` : "未指定";
}

export function RecordDateEditor({ value, onChange, disabled, defaultTimeZone = "UTC", unavailableReason }: {
  value: AssignedRecordDate | null; onChange: (date: AssignedRecordDate | null) => void;
  disabled: boolean; defaultTimeZone?: string; unavailableReason?: string;
}) {
  const [emptyZone, setEmptyZone] = useState(defaultTimeZone), [error, setError] = useState("");
  useEffect(() => { setEmptyZone(defaultTimeZone); }, [defaultTimeZone]);
  const timeZone = value?.timeZone ?? emptyZone;
  const edit = (next: AssignedRecordDate | null) => { setError(""); onChange(next); };
  let validation = "";
  if (value) { try { parseAssignedRecordDate(value); } catch (cause) { validation = cause instanceof Error ? cause.message : "本人记录日期无效。"; } }
  return <fieldset className="space-y-3 rounded-lg border p-3">
    <legend className="px-1 font-medium">本人指定记录日期（可选）</legend>
    <p className="text-sm">可补写过去日期；这是本人选择的归档日期，不是系统创建时间或学习事实。日期按字面保存，浏览时区不会移动它。</p>
    <div className="flex flex-wrap gap-3"><label>本人指定记录日期 <input aria-label="本人指定记录日期" type="date" min="0001-01-01" max="9999-12-31" disabled={disabled} className="workshop-input" value={value?.date || ""} onChange={event => edit({ date: event.target.value, timeZone })} /></label><label>本人记录日期时区 <input aria-label="本人记录日期时区" disabled={disabled} className="workshop-input" value={timeZone} onChange={event => { setEmptyZone(event.target.value); edit({ date: value?.date || "", timeZone: event.target.value }); }} /></label></div>
    <div className="flex flex-wrap gap-3"><ActionButton variant="secondary" disabled={disabled} onClick={() => {
      try { const zone = parseCivilTimeZone(timeZone); edit({ date: getCivilDay(new Date(), zone), timeZone: zone }); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "无法确定今天，请检查时区。"); }
    }}>设为该时区今天</ActionButton><ActionButton variant="secondary" disabled={disabled || value === null && !unavailableReason} onClick={() => edit(null)}>清空本人记录日期</ActionButton></div>
    {unavailableReason && <p role="status">{unavailableReason} 未编辑日期时，保存正文会保留原日期数据。</p>}
    {(error || validation) && <p role="alert">{error || validation}</p>}
    <p className="text-sm">日期修改仍需确认保存。模板中的 {"{{date}}"} 和 {"{{time}}"} 仍表示预览时刻，不会改成本人的补写日期。</p>
  </fieldset>;
}
