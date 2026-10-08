"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ActionButton, AppShell, PageHeader, SectionPanel } from "../../../../components/ui";
import { planningLogLabels, type PlanningLogDetail, type PlanningLogSummary } from "../../../../../lib/ai/planningLogTypes";

const statusLabel = (value: string) => value === "success" ? "结构校验通过" : value === "failed" ? "失败" : "尚未完成";
const phaseLabels: Record<string,string> = {configuration:"模型配置",provider:"模型连接或返回",json_parse:"JSON 解析",validation:"内容结构校验"};
function JsonView({title,value}: {title:string;value:unknown}) {
  if (value === null || value === undefined) return null;
  return <details><summary>{title}</summary><pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap break-words text-sm">{JSON.stringify(value,null,2)}</pre></details>;
}
function ContentReview({value}: {value:unknown}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const candidate = data.report || data.qualityReport || data;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const report = candidate as Record<string, unknown>;
  if (!Array.isArray(report.blockingIssues) && typeof report.significantIssues !== "boolean") return null;
  const issues = Array.isArray(report.blockingIssues) ? report.blockingIssues : [];
  const warnings = Array.isArray(report.warnings) ? report.warnings : [];
  return <div>
    <h3>AI 内容复核意见（供判断）</h3>
    <p>{issues.length || report.significantIssues ? "模型报告了需要修正的内容。" : "模型没有报告阻断项；这不代表知识已获权威验证。"}</p>
    {typeof report.summary === "string" && <p>{report.summary}</p>}
    {[...issues, ...warnings].map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const issue = item as Record<string, unknown>;
      return <p key={index}>{index < issues.length ? "待修正" : "提醒"}{typeof issue.targetKey === "string" ? `（${issue.targetKey}）` : ""}：{typeof issue.message === "string" ? issue.message : JSON.stringify(item)}{typeof issue.suggestion === "string" ? ` 建议：${issue.suggestion}` : ""}</p>;
    })}
  </div>;
}
export default function PlanningLogsPage() {
  const domainId = String(useParams<{id:string}>().id || "");
  const [logs,setLogs] = useState<PlanningLogSummary[]>([]);
  const [cursor,setCursor] = useState<string|null>(null);
  const [selected,setSelected] = useState<string|null>(null);
  const [detail,setDetail] = useState<PlanningLogDetail|null>(null);
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(false);
  const [loadingDetail,setLoadingDetail] = useState(false);
  const base = `/api/domains/${encodeURIComponent(domainId)}/ai-logs`;
  useEffect(()=>{
    const abort = new AbortController();
    setLoading(true);setError("");
    void (async()=>{
      try {
        const response=await fetch(base,{signal:abort.signal});const data=await response.json();
        if(!response.ok)throw new Error(data.error || "读取记录失败。");
        if(abort.signal.aborted)return;
        setLogs(data.logs);setCursor(data.nextCursor);
        setSelected(new URLSearchParams(window.location.search).get("logId") || data.logs[0]?.id || null);
      }catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:"读取记录失败。");}
      finally{if(!abort.signal.aborted)setLoading(false);}
    })();
    return ()=>abort.abort();
  },[base]);
  useEffect(()=>{
    if(!selected)return;
    const abort=new AbortController();setLoadingDetail(true);setDetail(null);setError("");
    void(async()=>{
      try{const response=await fetch(`${base}/${encodeURIComponent(selected)}`,{signal:abort.signal});const data=await response.json();if(!response.ok)throw new Error(data.error || "读取详情失败。");if(!abort.signal.aborted)setDetail(data.log);}
      catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:"读取详情失败。");}
      finally{if(!abort.signal.aborted)setLoadingDetail(false);}
    })();return()=>abort.abort();
  },[base,selected]);
  const more=async()=>{
    if(!cursor)return;setLoading(true);setError("");
    try{const response=await fetch(`${base}?cursor=${encodeURIComponent(cursor)}`);const data=await response.json();if(!response.ok)throw new Error(data.error || "读取记录失败。");setLogs(current=>[...current,...data.logs]);setCursor(data.nextCursor);}
    catch(e){setError(e instanceof Error?e.message:"读取记录失败。");}finally{setLoading(false);}
  };
  return <AppShell>
    <PageHeader kicker="课程规划记录" title="AI 生成记录" description="查看模型实际返回、校验问题和修复前后的内容。结构检查通过并不证明知识正确；这里的记录也不会改变课程地图。" actions={<><Link href={`/learning/domains/new?domainId=${encodeURIComponent(domainId)}`}>返回课程规划</Link><Link href={`/learning/domains/${encodeURIComponent(domainId)}`}>返回领域</Link></>}/>
    {error&&<SectionPanel role="alert">{error}</SectionPanel>}
    <SectionPanel><h2>调用记录</h2>{!loading&&!logs.length&&<p>本领域还没有课程规划记录。</p>}
      <ul className="space-y-2">{logs.map(log=><li key={log.id}><ActionButton variant="secondary" onClick={()=>setSelected(log.id)} aria-pressed={selected===log.id}>{planningLogLabels[log.taskType] || log.taskType} · {statusLabel(log.status)} · {new Date(log.createdAt).toLocaleString()}{log.attempt?` · 尝试 ${log.attempt}`:""}</ActionButton>{log.errorMessage&&<p>失败环节：{log.failureStage ? phaseLabels[log.failureStage] || log.failureStage : "历史未记录"}；{log.errorMessage}</p>}</li>)}</ul>
      {loading&&<p>正在读取记录...</p>}{cursor&&<ActionButton disabled={loading} onClick={()=>void more()}>读取更早记录</ActionButton>}
    </SectionPanel>
    {loadingDetail&&<SectionPanel>正在读取完整返回...</SectionPanel>}
    {detail&&<SectionPanel><h2>{planningLogLabels[detail.taskType] || detail.taskType}</h2><p>{detail.provider} / {detail.model} · {statusLabel(detail.status)} · 提示版本：{detail.promptVersion || "历史未记录"}</p>
      <p>记录：{detail.id}；耗时：{detail.latencyMs===null?"未知":`${detail.latencyMs} ms`}{detail.providerRequestId?`；Provider 请求：${detail.providerRequestId}`:""}</p>
      {detail.errorMessage&&<p>失败环节：{detail.failureStage ? phaseLabels[detail.failureStage] || detail.failureStage : "历史未记录"}。{detail.errorMessage}</p>}
      {detail.status==="pending"&&<p>该调用尚未完成，也可能曾被中断。读取记录不会重试或再次调用 AI。</p>}
      {detail.relatedAttempts.length>1&&<div><p>同一次任务的调用顺序：</p>{detail.relatedAttempts.map(a=><ActionButton key={a.id} variant="secondary" onClick={()=>setSelected(a.id)}>尝试 {a.attempt} · {a.retryReason==="validation"?"内容修复":a.retryReason==="transport"?"连接重试":"首次生成"} · {statusLabel(a.status)}</ActionButton>)}</div>}
      {detail.validationIssues.length>0&&<div><h3>具体校验问题</h3><ul>{detail.validationIssues.map((issue,i)=><li key={`${issue.path}:${i}`} className="my-3"><p>{issue.message}</p><p>位置：{issue.path}；阶段：{issue.stageKey || "—"}；模块：{issue.moduleKey || "—"}；问题：{issue.questionKey || "—"}</p>{issue.actualGoalKeys&&<p>实际目标：{issue.actualGoalKeys.join(", ") || "未填写"}</p>}{issue.allowedGoalKeys&&<p>允许引用：{issue.allowedGoalKeys.join(", ") || "父级未填写"}</p>}{issue.missingGoalKeys&&<p>尚未覆盖：{issue.missingGoalKeys.join(", ")}</p>}</li>)}</ul></div>}
      <ContentReview value={detail.validatedOutput}/>
      <h3>AI 原始返回正文</h3>{detail.rawOutput!==null?<pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap break-words text-sm">{detail.rawOutput || "模型返回正文为空；请查看 Provider 响应。"}</pre>:<p>{detail.runId?"本次没有收到可保存的模型正文。":"这是历史摘要记录，原始返回无法补回。"}</p>}
      <JsonView title="解析后、校验前的候选" value={detail.parsedOutput}/><JsonView title="通过校验后的结果" value={detail.validatedOutput}/><JsonView title="本次实际提示内容" value={detail.requestMessages}/><JsonView title="Provider 返回详情" value={detail.providerResponse}/><JsonView title="返回的资料来源" value={detail.researchSources}/>
    </SectionPanel>}
  </AppShell>;
}
