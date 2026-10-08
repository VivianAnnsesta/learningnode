"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton,SectionPanel } from "../../../../../components/ui";
import { isSafeExternalUrl } from "../../../../../../lib/security/externalUrl";
import { latestTeachingSegments } from "../../../../../../lib/learning/contentCoverage";
import { dimensions,segmentKeys,segmentLabels,activityBinding,type TeachingView,type SegmentKey,type InteractionV2 } from "../../../../../../lib/learning/teachingContracts";

const savedSegmentConcerns=(session:TeachingView|null)=>Object.fromEntries(segmentKeys.map(key=>[key,[...(session?.segments||[])].reverse().find(s=>s.key===key)?.request?.concern||""]));

export function NodeTeachingWorkspace({domainId,nodeId,onPrepared,understandingDraft,onRestoreUnderstanding}:{domainId:string;nodeId:string;onPrepared:()=>void;understandingDraft?:string;onRestoreUnderstanding?:(value:string)=>void}) {
  const router=useRouter();
  const endpoint=`/api/domains/${domainId}/nodes/${nodeId}/teaching`;
  const [session,setSession]=useState<TeachingView|null>(null);const current=useRef<TeachingView|null>(null);
  const [drafts,setDrafts]=useState<Record<string,string>>({});const [busy,setBusy]=useState("");const [error,setError]=useState("");
  const [segmentConcerns,setSegmentConcerns]=useState<Record<string,string>>({});const [knowledgeConcern,setKnowledgeConcern]=useState("");const [notice,setNotice]=useState("");const [loading,setLoading]=useState(true);const [sourceUrl,setSourceUrl]=useState("");
  const restoreUnderstanding=useRef(onRestoreUnderstanding);restoreUnderstanding.current=onRestoreUnderstanding;
  const queue=useRef<Promise<unknown>>(Promise.resolve());const mounted=useRef(true);const requests=useRef(new Map<string,string>());
  const apply=useCallback((next:TeachingView|null)=>{const previous=current.current;current.current=next;if(!mounted.current)return;setSession(next);setDrafts(local=>previous?.id!==next?.id?next?.progress.drafts||{}:{...next?.progress.drafts,...Object.fromEntries(Object.entries(local).filter(([k,v])=>v!==(previous?.progress.drafts[k]??"")))});
    const priorConcerns=savedSegmentConcerns(previous);const restoredConcerns=savedSegmentConcerns(next);
    setSegmentConcerns(local=>previous?.id!==next?.id?restoredConcerns:{...restoredConcerns,...Object.fromEntries(Object.entries(local).filter(([k,v])=>v!==(priorConcerns[k]||"")))});
    setKnowledgeConcern(local=>previous?.id!==next?.id||local===(previous?.knowledge?.request?.concern||"")?next?.knowledge?.request?.concern||"":local);
  },[]);
  const run=useCallback((label:string,method:string,payload:Record<string,unknown>={},suffix="")=>{
    const operation=queue.current.catch(()=>null).then(async()=>{if(!mounted.current)return null;setBusy(label);setError("");
      try{const s=current.current;const r=await fetch(`${endpoint}${suffix}`,{method,...(method==="GET"?{}:{headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:s?.id,revision:s?.revision,...payload})})});const d=await r.json();if(!r.ok)throw new Error(d.error||"操作未完成，输入已保留。");apply(d.session);if(d.sourceWarning)setNotice(d.sourceWarning);return d.session as TeachingView|null;}
      catch(e){if(mounted.current)setError(e instanceof Error?e.message:"无法连接教学服务，输入已保留。");return null;}finally{if(mounted.current)setBusy("");}});
    queue.current=operation;return operation;
  },[endpoint,apply]);
  useEffect(()=>{mounted.current=true;let cancelled=false;void(async()=>{try{
    const params=new URLSearchParams(window.location.search);const selected=params.get("sessionId");
    const r=await fetch(`${endpoint}${selected?`?sessionId=${encodeURIComponent(selected)}`:""}`);const d=await r.json();if(!r.ok)throw new Error(d.error||"无法恢复教学。");
    if(!cancelled){let restored:TeachingView|null=d.session;const segment=restored?.segments.find(s=>s.id===params.get("segmentId"));const stepKey=params.get("stepKey");
      if(restored&&segment?.material&&stepKey&&segment.material.steps.some(step=>step.key===stepKey)) restored={...restored,progress:{...restored.progress,segmentKey:segment.key,segmentId:segment.id,stepKey}};
      apply(restored);if(restored)restoreUnderstanding.current?.(restored.progress.understandingDraft||"");}
  }catch(e){if(!cancelled)setError(e instanceof Error?e.message:"无法恢复教学。");}finally{if(!cancelled)setLoading(false);}})();return()=>{cancelled=true;mounted.current=false;};},[endpoint,apply]);
  const key=session?.progress.segmentKey||"encounter";const versions=session?.segments.filter(s=>s.key===key)||[];
  const material=versions.find(s=>s.id===session?.progress.segmentId)||[...versions].reverse().find(s=>s.status==="ready");
  const step=material?.material?.steps.find(s=>s.key===session?.progress.stepKey)||material?.material?.steps[0];
  const idFor=(signature:string)=>{let id=requests.current.get(signature);if(!id){id=crypto.randomUUID();requests.current.set(signature,id);}return id;};
  const saveLocalDrafts=async()=>{const saved=current.current;if(!saved||saved.status!=="ready"||saved.stale||saved.historical||session?.id!==saved.id)return true;
    if(understandingDraft!==undefined&&understandingDraft!==saved.progress.understandingDraft)if(!await run("保存个人理解草稿","PATCH",{action:"save_understanding",answer:understandingDraft}))return false;
    for(const [binding,answer] of Object.entries(drafts)){if(answer===(saved.progress.drafts[binding]||""))continue;const [segmentId,stepKey,exerciseKey]=binding.split(":");if(!await run("保存当前草稿","PATCH",{action:exerciseKey==="question"?"save_question":"save_answer",segmentId,stepKey,exerciseKey,answer}))return false;}return true;};
  const viewMaterial=(segmentId:string,stepKey:string)=>{const saved=current.current;if(saved){apply({...saved,progress:{...saved.progress,segmentId,segmentKey:saved.segments.find(t=>t.id===segmentId)!.key,stepKey}});}return Promise.resolve(saved);};
  const enter=async(nextKey:SegmentKey,reprepare=false,stepKey?:string)=>{
    const saved=current.current;if(saved&&(saved.historical||saved.stale)){const target=[...saved.segments].reverse().find(t=>t.key===nextKey&&t.status==="ready");if(target?.material)await viewMaterial(target.id,stepKey||target.material.steps[0].key);return;}
    if(!await saveLocalDrafts())return;
    let s=await run("保存学习位置","PATCH",{action:"select_segment",segmentKey:nextKey});if(!s)return;
    let target=[...s.segments].reverse().find(t=>t.key===nextKey&&t.status==="ready");
    if(!target||reprepare){
      const last=[...s.segments].reverse().find(t=>t.key===nextKey);const prepareAgain=reprepare||Boolean(!target&&last?.request?.reprepare);
      const concern=prepareAgain?(segmentConcerns[nextKey]??last?.request?.concern??"").trim():"";
      const signature=`segment:${s.id}:${nextKey}:${prepareAgain}:${concern}`;
      const retry=last&&last.status!=="ready"&&(!last.request||(last.request.concern===concern&&last.request.reprepare===prepareAgain));
      const requestId=retry?last.requestId:idFor(signature);
      s=await run("正在为本段备课","POST",{requestId,reprepare:prepareAgain,...(prepareAgain?{concern}:{})},`/segments/${nextKey}`);if(!s)return;
      target=[...s.segments].reverse().find(t=>t.key===nextKey&&t.status==="ready");if([...s.segments].reverse().find(t=>t.key===nextKey)?.status==="ready")requests.current.delete(signature);
    }
    if(target?.material){const restored=s.progress.segmentKey===nextKey&&target.material.steps.some(t=>t.key===s.progress.stepKey)?s.progress.stepKey:target.material.steps[0].key;await run("保存学习位置","PATCH",{action:"navigate",segmentId:target.id,stepKey:stepKey||restored});}
  };
  const begin=async(reprepare=false)=>{if(!await saveLocalDrafts())return;const signature=`framework:${nodeId}:${reprepare}`;const s=await run("准备九维教学框架","POST",{requestId:idFor(signature),reprepare});if(s?.status==="ready"){requests.current.delete(signature);onPrepared();await enter(s.progress.segmentKey);}};
  const verifyKnowledge=async()=>{if(!await saveLocalDrafts())return;const previous=current.current;const concern=knowledgeConcern.trim();const signature=`knowledge:${previous?.id}:${concern}`;const saved=previous?.knowledge?.request;
    const requestId=saved&&saved.status!=="complete"&&saved.concern===concern?saved.requestId:idFor(signature);
    const s=await run("核对并纠正框架知识","POST",{requestId,verifyKnowledge:true,concern});if(s?.status==="ready"&&(s.id!==previous?.id||s.knowledge?.request?.status==="complete")){requests.current.delete(signature);onPrepared();if(s.id!==previous?.id)await enter(s.progress.segmentKey);}};
  useEffect(()=>{if(!session||session.status!=="ready"||session.stale||session.historical||busy||error)return;if(understandingDraft!==undefined && understandingDraft!==(session.progress.understandingDraft||"")){const timer=setTimeout(()=>void run("保存输入","PATCH",{action:"save_understanding",answer:understandingDraft}),650);return()=>clearTimeout(timer);}const dirty=Object.entries(drafts).find(([k,v])=>v!==(session.progress.drafts[k]??""));if(!dirty)return;const [binding,answer]=dirty;const [segmentId,stepKey,exerciseKey]=binding.split(":");const timer=setTimeout(()=>{void run("保存输入","PATCH",{action:exerciseKey==="question"?"save_question":"save_answer",segmentId,stepKey,exerciseKey,answer});},650);return()=>clearTimeout(timer);},[drafts,understandingDraft,session,busy,error,run]);
  const submit=async(kind:"answer"|"question",exerciseKey="",retry?:InteractionV2)=>{if(!material||!step)return;const input=retry?.input??(drafts[activityBinding(material.id,step.key,exerciseKey||"question")]||"");if(!input.trim())return;const signature=JSON.stringify([retry?.segmentId||material.id,retry?.stepKey||step.key,kind,exerciseKey,input]);await run("等待教学反馈","POST",{requestId:retry?.requestId||idFor(signature),kind,input,exerciseKey:retry?.exerciseKey??exerciseKey,segmentId:retry?.segmentId||material.id,stepKey:retry?.stepKey||step.key},"/interactions");};
  const navigateMaterial=(segmentId:string,stepKey:string)=>session?.historical||session?.stale?viewMaterial(segmentId,stepKey):run("保存学习位置","PATCH",{action:"navigate",segmentId,stepKey});
  const navigate=(stepKey:string)=>material?navigateMaterial(material.id,stepKey):Promise.resolve(null);
  const next=async(skip=false)=>{if(!material?.material||!step)return;if(skip)await run("记录跳过","PATCH",{action:"skip",segmentId:material.id,stepKey:step.key});const i=material.material.steps.findIndex(s=>s.key===step.key);if(i+1<material.material.steps.length)await navigate(material.material.steps[i+1].key);else if(segmentKeys.indexOf(key)<4)await enter(segmentKeys[segmentKeys.indexOf(key)+1]);else setNotice("请在下方用自己的话整理理解、例子、边界和疑问，再自行决定是否确认沉淀。");};
  const disabled=Boolean(busy)||Boolean(session?.stale)||Boolean(session?.historical)||session?.status!=="ready";
  const inputDisabled=(Boolean(busy)&&busy!=="保存输入")||Boolean(session?.stale)||Boolean(session?.historical)||session?.status!=="ready";
  const currentDimensions=new Set(session?.status==="ready"&&!session.stale&&!session.historical?latestTeachingSegments(session.segments).filter(s=>s.status==="ready"&&!s.staleSources).flatMap(s=>s.material?.steps.flatMap(step=>step.dimensionKeys)||[]):[]);
  return <SectionPanel><h2>概念教学</h2><p>先看整课安排，再逐段学习。思考可以跳过，也可以回看、提问或查看解答。</p>
    {loading&&<p>恢复教学记录中…</p>}{busy&&<p role="status">{busy}…</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <button disabled={Boolean(busy)} onClick={()=>void run("重新载入","GET")}>返回当前教案并载入记录</button>
    {session?.history&&session.history.length>1&&<label className="block">整课框架版本<select disabled={Boolean(busy)} value={session.id} onChange={e=>void run("查看历史教案","GET",{},`?sessionId=${e.target.value}`)}>{session.history.map(h=><option key={h.id} value={h.id}>框架 {h.lessonVersion} · {h.status==="ready"?"已准备":h.status==="failed"?"待重试":h.status==="needs_correction"?"需纠正":"准备中"}</option>)}</select></label>}{session?.historical&&<p>正在查看历史框架和学习记录。返回当前教案后可以继续学习。</p>}
    {!loading&&!session?.historical&&(!session||session.status!=="ready"||session.stale)&&<div>{session?.stale&&<p>目标或概念范围已改变，需要准备新框架；旧记录保留。</p>}{session?.error&&<p>{session.error}</p>}{session?.status==="pending"&&<p>框架尚未准备完成，可重新载入或在中断后重试。</p>}<ActionButton disabled={Boolean(busy)} onClick={()=>void begin(Boolean(session?.stale))}>开始或继续备课</ActionButton></div>}
    {session?.framework&&<div className="space-y-5">
      {session.knowledge?.correctedFromVersion&&<p>本框架已纠正版本 {session.knowledge.correctedFromVersion} 的知识问题，旧材料和学习记录保留在历史版本。</p>}
      <p>{session.knowledge?.status==="needs_correction"?"框架存在需要纠正的知识问题，当前内容仅供回查。":session.knowledge?.status==="checking"?"框架知识正在核对，可重新载入查看状态。":session.knowledge?.status==="unverified"?"该框架尚未完成新版知识核对。":`框架已进行知识依据核对${session.knowledge?.uncertainCount?`，仍有 ${session.knowledge.uncertainCount} 项待核对`:""}；模型核对不等于权威验证。`}</p>
      {session.status==="ready"&&session.error&&<p role="alert">{session.error}</p>}
      {!session.historical&&!session.stale&&<div><details><summary>指出知识疑点</summary><label className="block">待核对的原文或反例<textarea className="w-full rounded bg-black/20 p-3" maxLength={4000} value={knowledgeConcern} disabled={Boolean(busy)} onChange={e=>setKnowledgeConcern(e.target.value)}/></label><p>写出需要核对的说法、条件或反例；系统核对后再决定是否修正，旧版本保留。</p></details><ActionButton disabled={Boolean(busy)} onClick={()=>void verifyKnowledge()}>核对并纠正整课知识</ActionButton></div>}
      <p><strong>{session.framework.concept}</strong>：{session.framework.scope}</p><p>本课问题：{session.context.node.keyQuestion}</p>
      {session.context.node.learningUnit && <details><summary>本课新增知识与使用的基础</summary>
        <p>新增知识：{session.context.node.learningUnit.newKnowledge}</p>
        <p>教学任务：{session.context.node.learningUnit.teachingTasks.join("；")}</p>
        <p>代表例子：{session.context.node.learningUnit.example}</p>
        <p>默认基础：{session.context.node.learningUnit.assumedKnowledge.join("；") || "未列额外基础"}。需要补讲时，可在当前步骤的提问框中说明。</p>
        {session.context.relatedConcepts?.map(ref=><p key={ref.key}>{ref.title}：{ref.purpose}</p>)}
      </details>}
      {session.context.contentQuestions?.length?<details><summary>本概念承接的课程内容问题</summary>{session.context.contentQuestions.map(q=><div key={q.key}><p>{q.question}</p>{q.contribution&&<p>本课分工：{q.contribution}</p>}<p>材料需要说明：{q.contentRequirements.join("；")}</p><p>相关维度：{q.dimensionKeys.map(d=>dimensions[d]).join("、")}</p></div>)}</details>:null}
      {session.context.stage.problem&&<p>完整问题：{session.context.stage.problem}；本概念的作用：{session.context.node.problemRole}</p>}
      <div className="flex flex-wrap gap-2">{segmentKeys.map(k=><ActionButton key={k} disabled={Boolean(busy)||(!session.historical&&session.status!=="ready")||Boolean((session.historical||session.stale)&&!session.segments.some(t=>t.key===k&&t.status==="ready"))} onClick={()=>void enter(k)}>{k===key?"正在学习：":""}{segmentLabels[k]}</ActionButton>)}</div>
      {session.progress.returnPosition&&<button disabled={disabled} onClick={()=>void(async()=>{const position=session.progress.returnPosition!;if(await run("返回补讲位置","PATCH",{action:"navigate",segmentId:position.segmentId,stepKey:position.stepKey}))await run("恢复学习","PATCH",{action:"clear_return"});})()}>返回补讲所在步骤</button>}
      <details><summary>九维内容安排</summary><ul>{session.framework.dimensions.map(d=><li key={d.key}><strong>{dimensions[d.key]}</strong>：{d.points.join("；")}（{d.segmentKeys.map(k=>segmentLabels[k]).join("、")}；{session.historical||session.stale?"历史安排，供回看":currentDimensions.has(d.key)?"当前已有正文":"已安排，当前正文待生成或补充"}）</li>)}</ul></details>
      {[...session.framework.limitations,...session.context.warnings].map((w,i)=><p key={i}>{w}</p>)}
      {versions.filter(v=>v.status!=="ready").slice(-1).map(v=><p key={v.id}>{v.error||"本段准备尚未结束。"} <button disabled={disabled} onClick={()=>void enter(key,Boolean(material))}>重试本段</button></p>)}
      {!material&&<ActionButton disabled={disabled} onClick={()=>void enter(key)}>准备这一段</ActionButton>}
      {material?.material&&step&&<div className="space-y-4" id={`teaching-step-${step.key}`}>
        {step.contentQuestionKeys?.length?<p>这一步对应：{step.contentQuestionKeys.map(key=>session.context.contentQuestions?.find(q=>q.key===key)?.question||key).join("；")}</p>:null}
        <p>{segmentLabels[key]} · 材料版本 {material.version}{material.staleSources?" · 资料已更新，可重备本段":""}</p>
        {versions.filter(v=>v.status==="ready").length>1&&<div>{versions.filter(v=>v.status==="ready").map(v=><button className="mr-3" key={v.id} disabled={Boolean(busy)} onClick={()=>void navigateMaterial(v.id,v.material!.steps[0].key)}>版本 {v.version}</button>)}</div>}
        <div className="flex flex-wrap gap-3">{material.material.steps.map(s=><button key={s.key} disabled={Boolean(busy)} onClick={()=>void navigate(s.key)}>{session.framework!.segments.find(p=>p.key===key)?.steps.find(p=>p.key===s.key)?.goal||s.key}</button>)}</div>
        {step.prerequisiteSupport?.map(support=><div key={support.prerequisiteKey}><strong>这一步用到：{session.framework?.prerequisitePlan?.find(p=>p.key===support.prerequisiteKey)?.knowledge}</strong><p className="whitespace-pre-wrap">{support.explanation}</p></div>)}
        <p className="whitespace-pre-wrap">{step.explanation}</p>{step.example&&<div><strong>示范</strong><p className="whitespace-pre-wrap">{step.example}</p></div>}
        <p>内容依据：{{source:"来源片段支持",derivation:"推导说明",analogy:"帮助理解的类比",unverified:"AI 解释，待进一步核对"}[step.basis]}</p>
        {step.sourceIds.map(id=>{const s=material.sources.find(s=>s.id===id);return s&&isSafeExternalUrl(s.url)?<details key={id}><summary>{s.title} · {s.location}</summary><p>{s.text}</p><a href={s.url} target="_blank" rel="noreferrer">查看原文</a></details>:null;})}
        {step.activities.map(a=>{const binding=activityBinding(material.id,step.key,a.key);return <div key={binding} className="space-y-2 border-t border-white/10 pt-3"><p><strong>想一想（可跳过）</strong>：{a.prompt}</p><textarea aria-label={a.prompt} className="w-full rounded bg-black/20 p-3" disabled={inputDisabled} value={drafts[binding]??""} onChange={e=>setDrafts(d=>({...d,[binding]:e.target.value}))}/><div className="flex flex-wrap gap-2"><ActionButton disabled={disabled||!(drafts[binding]||"").trim()} onClick={()=>void submit("answer",a.key)}>提交想法</ActionButton><ActionButton disabled={disabled||a.visibleHints.length>=a.hintCount} onClick={()=>void run("查看提示","PATCH",{action:"hint",segmentId:material.id,stepKey:step.key,exerciseKey:a.key})}>给我提示</ActionButton><ActionButton disabled={disabled||Boolean(a.solution)} onClick={()=>void run("查看解答","PATCH",{action:"solution",segmentId:material.id,stepKey:step.key,exerciseKey:a.key})}>查看解答</ActionButton></div>{a.visibleHints.map((h,i)=><p key={i}>{h}</p>)}{a.solution&&<p className="whitespace-pre-wrap">{a.solution}</p>}</div>;})}
        <textarea aria-label="向老师提问" placeholder="这一步哪里不明白？也可以请老师补讲某项基础或换一个例子。" className="w-full rounded bg-black/20 p-3" disabled={inputDisabled} value={drafts[activityBinding(material.id,step.key,"question")]||""} onChange={e=>setDrafts(d=>({...d,[activityBinding(material.id,step.key,"question")]:e.target.value}))}/><ActionButton disabled={disabled} onClick={()=>void submit("question")}>提问</ActionButton>
        {session.interactions.filter(i=>i.segmentId===material.id&&i.stepKey===step.key).map(i=><div key={i.id} className="space-y-2 border-t border-white/10 pt-3"><p>我的{i.kind==="answer"?"想法":"问题"}：{i.input}</p>{i.status==="pending"&&<p>反馈尚未返回，可重新载入或稍后重试。</p>}{i.error&&<p>{i.error}</p>}{i.status!=="complete"&&<button disabled={disabled} onClick={()=>void submit(i.kind as "answer"|"question",i.exerciseKey,i)}>重试反馈</button>}{i.response&&<><p className="whitespace-pre-wrap">{i.response.text}</p><p>建议：{i.response.action.reason}</p>{i.response.action.stepKey&&<button disabled={disabled} onClick={()=>{const target=session.framework!.segments.find(s=>s.steps.some(t=>t.key===i.response!.action.stepKey));if(target)void(async()=>{if(await run("保存补讲返回位置","PATCH",{action:"remember_return",interactionId:i.id}))await enter(target.key,false,i.response!.action.stepKey!);})();}}>前往建议步骤</button>}{i.response.action.nodeId&&<button disabled={disabled} onClick={()=>void(async()=>{if(await run("保存补讲返回位置","PATCH",{action:"remember_return",interactionId:i.id}))router.push(`/learning/domains/${domainId}/items/${i.response!.action.nodeId}`);})()}>回看前置概念</button>}</>}</div>)}
        <details><summary>指出本段知识疑点</summary><label className="block">本段待核对的原文或反例<textarea className="w-full rounded bg-black/20 p-3" maxLength={4000} disabled={disabled} value={segmentConcerns[key]||""} onChange={e=>setSegmentConcerns(v=>({...v,[key]:e.target.value}))}/></label><p>重新准备这一段时，会先核对疑点及现有正文；旧版本和回答保留。</p></details>
        <div className="flex flex-wrap gap-2"><ActionButton disabled={disabled} onClick={()=>void next()}>继续学习</ActionButton><ActionButton disabled={disabled} onClick={()=>void next(true)}>跳过思考并继续</ActionButton><ActionButton disabled={disabled} onClick={()=>void enter(key,true)}>重新准备这一段</ActionButton></div>
        {[...material.material.limitations,material.review?.limitation||""].filter(Boolean).map((t,i)=><p key={i}>{t}</p>)}
      </div>}
      <details><summary>补充或更新本课资料</summary><p>资料仅接受公开 HTTPS 文本。核心定义有变化时，请重新准备整课框架。</p><input aria-label="资料地址" className="w-full rounded bg-black/20 p-2" value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)}/><ActionButton disabled={disabled||!sourceUrl.trim()} onClick={()=>void run("提取资料","POST",{url:sourceUrl},"/sources")}>保存资料</ActionButton><ActionButton disabled={disabled} onClick={()=>void begin(true)}>重新准备整课框架</ActionButton></details>
      {session.summary.unresolved.length>0&&<details><summary>仍待澄清的问题</summary>{session.summary.unresolved.map(q=><p key={q.interactionId}>{q.text} <button disabled={disabled} onClick={()=>void run("记录疑问状态","PATCH",{action:"resolve_question",interactionId:q.interactionId})}>我已澄清</button></p>)}</details>}
      <p>请在下方用自己的话说明这个概念、举一个例子，并记录边界或疑问，再决定是否确认沉淀。</p>
    </div>}
  </SectionPanel>;
}
