"use client";

import { useEffect, useState } from "react";
import { knowledgeDisplayFields, knowledgeSourceTypes, parseKnowledgeDateFilter, type KnowledgeDateFilter, type KnowledgeViewConfig } from "../../lib/learning/knowledgeViewContracts";
import { ActionButton, SectionPanel } from "./ui";
import { recordKindLabels, recordSourceLabels } from "./recordDiscoveryTypes";

export const knowledgeFieldLabels: Record<string, string> = {
  summary: "摘要", kind: "记录类型", sourceType: "内容来源", aliases: "别名",
  domains: "所属领域", collections: "主题", createdAt: "创建日期", updatedAt: "记录更新日期"
};
type Option = { id: string; name?: string; title?: string };
type DateDraft = { field: "created" | "updated"; mode: "all" | "range" | "last_days"; timeZone: string; from: string; to: string; days: string };
function dateDraft(date: KnowledgeDateFilter): DateDraft {
  return { field: date.field, mode: date.mode, timeZone: date.timeZone, from: date.mode === "range" ? date.from || "" : "", to: date.mode === "range" ? date.to || "" : "", days: date.mode === "last_days" ? String(date.days) : "7" };
}

export function KnowledgeViewFilters({ config, domains, collections, metadataReady, onChange, onDateDraftChange, onDateDraftEdit }: {
  config: KnowledgeViewConfig;
  domains: Option[];
  collections: Option[];
  metadataReady: boolean;
  onChange: (config: KnowledgeViewConfig) => void;
  onDateDraftChange: (dirty: boolean) => void;
  onDateDraftEdit: () => void;
}) {
  const dateKey = JSON.stringify(config.filters.date);
  const [draft, setDraft] = useState(() => dateDraft(config.filters.date));
  const [dateError, setDateError] = useState("");
  useEffect(() => { setDraft(dateDraft(JSON.parse(dateKey) as KnowledgeDateFilter)); setDateError(""); }, [dateKey]);
  const dateDirty = JSON.stringify(draft) !== JSON.stringify(dateDraft(config.filters.date));
  useEffect(() => { onDateDraftChange(dateDirty); }, [dateDirty, onDateDraftChange]);
  const changeFilter = (field: "q" | "domainId" | "collectionId" | "kind" | "sourceType" | "sort", value: string) => onChange({ ...config, filters: { ...config.filters, [field]: value } });
  const changeDate = (field: keyof DateDraft, value: string) => { onDateDraftEdit(); setDraft(previous => ({ ...previous, [field]: value })); };
  const missingDomain = !!config.filters.domainId && !domains.some(domain => domain.id === config.filters.domainId);
  const missingCollection = !!config.filters.collectionId && !collections.some(collection => collection.id === config.filters.collectionId);

  return <SectionPanel aria-label="个人记录视图筛选">
    <div className="flex flex-wrap gap-3">
      <input aria-label="检索个人记录" className="workshop-input" placeholder="检索标题、正文和别名" value={config.filters.q} onChange={event => changeFilter("q", event.target.value)} />
      <select aria-label="筛选领域" className="workshop-input" value={config.filters.domainId} onChange={event => changeFilter("domainId", event.target.value)}>
        <option value="">所有领域与独立记录</option>
        {missingDomain && <option value={config.filters.domainId}>{metadataReady ? "已失效的领域条件（仍保留筛选）" : "当前领域条件（正在读取）"}</option>}
        {domains.map(domain => <option value={domain.id} key={domain.id}>{domain.name}</option>)}
      </select>
      <select aria-label="筛选主题" className="workshop-input" value={config.filters.collectionId} onChange={event => changeFilter("collectionId", event.target.value)}>
        <option value="">所有主题</option>
        {missingCollection && <option value={config.filters.collectionId}>{metadataReady ? "已失效的主题条件（仍保留筛选）" : "当前主题条件（正在读取）"}</option>}
        {collections.map(collection => <option value={collection.id} key={collection.id}>{collection.title}</option>)}
      </select>
      <select aria-label="筛选记录类型" className="workshop-input" value={config.filters.kind} onChange={event => changeFilter("kind", event.target.value)}><option value="">所有记录类型</option>{Object.entries(recordKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label="筛选内容来源" className="workshop-input" value={config.filters.sourceType} onChange={event => changeFilter("sourceType", event.target.value)}><option value="">所有内容来源</option>{knowledgeSourceTypes.map(value => <option key={value} value={value}>{recordSourceLabels[value]}</option>)}</select>
      <select aria-label="记录排序" className="workshop-input" value={config.filters.sort} onChange={event => changeFilter("sort", event.target.value)}><option value="updated_desc">最近更新优先</option><option value="title_asc">标题顺序</option></select>
    </div>
    <fieldset className="space-y-3 rounded-lg border p-3">
      <legend className="px-1 font-medium">日期筛选</legend>
      <p className="text-sm">日期表示记录创建或记录更新时间，不代表实际学习日期。按指定时区比较日历日期，范围包含起止两日。</p>
      <div className="flex flex-wrap gap-3">
        <label>日期依据 <select aria-label="日期依据" className="workshop-input" value={draft.field} onChange={event => changeDate("field", event.target.value)}><option value="created">记录创建日期</option><option value="updated">记录更新日期</option></select></label>
        <label>日期范围 <select aria-label="日期范围" className="workshop-input" value={draft.mode} onChange={event => changeDate("mode", event.target.value)}><option value="all">不限日期</option><option value="range">固定日期范围</option><option value="last_days">最近N天</option></select></label>
        <label>日期时区 <input aria-label="日期时区" className="workshop-input" value={draft.timeZone} onChange={event => changeDate("timeZone", event.target.value)} placeholder="UTC 或 America/Los_Angeles" /></label>
        {draft.mode === "range" && <><label>起始日期 <input aria-label="起始日期" type="date" className="workshop-input" value={draft.from} onChange={event => changeDate("from", event.target.value)} /></label><label>结束日期 <input aria-label="结束日期" type="date" className="workshop-input" value={draft.to} onChange={event => changeDate("to", event.target.value)} /></label></>}
        {draft.mode === "last_days" && <label>最近天数 <input aria-label="最近天数" type="number" min={1} max={3660} step={1} className="workshop-input w-28" value={draft.days} onChange={event => changeDate("days", event.target.value)} /></label>}
      </div>
      {draft.mode === "last_days" && <p className="text-sm">包含所选时区的今天；保存后每天会按同一规则重新计算。</p>}
      {dateError && <p role="alert" className="text-rose-700">{dateError}</p>}
      <div className="flex flex-wrap gap-3"><ActionButton variant="secondary" onClick={() => {
        onDateDraftEdit();
        try {
          const date = parseKnowledgeDateFilter({ field: draft.field, mode: draft.mode, timeZone: draft.timeZone, ...(draft.mode === "range" ? { ...(draft.from ? { from: draft.from } : {}), ...(draft.to ? { to: draft.to } : {}) } : {}), ...(draft.mode === "last_days" ? { days: Number(draft.days) } : {}) });
          onChange({ ...config, filters: { ...config.filters, date } });
          setDraft(dateDraft(date)); setDateError("");
        } catch (cause) { setDateError(cause instanceof Error ? cause.message : "日期条件无效。"); }
      }}>应用日期筛选</ActionButton><ActionButton variant="secondary" disabled={!dateDirty} onClick={() => { onDateDraftEdit(); setDraft(dateDraft(config.filters.date)); setDateError(""); }}>恢复已应用日期</ActionButton></div>
      {dateDirty && <p role="status">日期设置尚未应用；当前结果和保存视图仍使用已应用的日期。</p>}
    </fieldset>
    <fieldset className="flex flex-wrap gap-x-5 gap-y-3 rounded-lg border p-3"><legend className="px-1 font-medium">显示字段</legend><label><input type="checkbox" checked disabled /> 标题（始终显示）</label>{knowledgeDisplayFields.map(field => <label key={field} className="flex items-center gap-2"><input aria-label={`显示${knowledgeFieldLabels[field]}`} type="checkbox" checked={config.displayFields.includes(field)} onChange={() => onChange({ ...config, displayFields: config.displayFields.includes(field) ? config.displayFields.filter(value => value !== field) : [...config.displayFields, field] })} />{knowledgeFieldLabels[field]}</label>)}</fieldset>
    <p className="text-sm">刷新会保留筛选；打开记录后可返回此筛选结果。字段仅控制显示，不会修改记录。</p>
  </SectionPanel>;
}
