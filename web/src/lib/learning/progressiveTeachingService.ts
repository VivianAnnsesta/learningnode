import { randomUUID } from "node:crypto";
import type { Prisma, NodeTeachingSession, TeachingInteraction, TeachingSegment } from "@prisma/client";
import { prisma } from "../prisma";
import { isSafeExternalUrl } from "../security/externalUrl";
import { parseGoals } from "./conceptPlanning";
import { parseKnowledgeBoundary, parseLearningUnit, parseContentContributions, scopedContentQuestions } from "./curriculumBoundary";
import type { RoadmapModuleBlueprint, ContentContribution } from "./roadmapPlanningTypes";
import { prepareProgressiveTeaching, respondProgressiveTeaching } from "../ai/progressiveTeachingTasks";
import { FrameworkKnowledgeError, checkTeachingKnowledge, frameworkKnowledgeHash, type TeachingKnowledgeReview } from "../ai/teachingKnowledgeReview";
import { aiFailureReference } from "../ai/validationEvidence";
import { digest, fetchTeachingSource, selectFragments } from "./teachingSources";
import { NodeTeachingError, teachingObject, teachingText, parseTeachingBinding, safeKey, segmentKeys,
  initialProgress, emptySummary, publicMaterial, activityBinding, validateMaterial,
  type TeachingContextV2, type TeachingFramework, type TeachingMaterial, type TeachingProgressV2,
  type TeachingView, type SourceFragment, type SegmentKey, type InteractionV2, type TeachingReplyV2, type TeachingPreparationRequest, type TeachingKnowledgeRequest } from "./teachingContracts";

type Db = Prisma.TransactionClient;
const leaseMs = 180000;
const parse = <T>(value: string | null | undefined, fallback: T): T => { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const str = (v: unknown) => typeof v === "string" ? v : "";
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const segmentRequestOf = (segment: TeachingSegment): TeachingPreparationRequest | undefined => {
  const request = object(parse(segment.reviewJson, {})).preparationRequest;
  return request ? request as TeachingPreparationRequest : undefined;
};
function retainedConcern(submitted: string | undefined, saved: {concern?: string} | undefined) {
  if(saved && submitted !== undefined && submitted !== (saved.concern || "")) throw new NodeTeachingError("同一请求不能更换待核对疑点，请作为新请求提交。",409);
  return saved ? saved.concern || "" : submitted || "";
}
const reviewWithPreparation = (review: unknown, request: TeachingPreparationRequest, candidateSourceRevision?:number|null) => JSON.stringify({...object(review),preparationRequest:request,...(candidateSourceRevision!==undefined?{candidateSourceRevision}:{})});
function knowledgeRequestOf(review: Record<string,unknown>, requestId?: string): TeachingKnowledgeRequest | undefined {
  const latest = object(review.knowledgeRequest);
  const request = !requestId || latest.requestId === requestId ? latest : array(review.knowledgeRequests).map(object).find(r=>r.requestId===requestId);
  return request?.requestId ? {...request,concern:str(request.concern)} as TeachingKnowledgeRequest : undefined;
}
function reviewWithKnowledgeRequest(review: unknown, request: TeachingKnowledgeRequest) {
  const previous=object(review);const latest=knowledgeRequestOf(previous);
  const history=array(previous.knowledgeRequests).map(object).filter(r=>r.requestId!==request.requestId);
  if(latest&&latest.requestId!==request.requestId&&!history.some(r=>r.requestId===latest.requestId)) history.push(latest);
  return JSON.stringify({...previous,knowledgeRequest:request,knowledgeRequests:history});
}
type FrameworkCorrection = {
  originSessionId: string; originVersion: number; originContextHash: string; sourceRevision: number;
  knowledge: TeachingKnowledgeReview; callIds: string[]; status: "required" | "pending" | "ready" | "failed";
  triggerSegmentId?: string; triggerSegmentKey?: SegmentKey; triggerRequestId?: string; targetSessionId?: string;
};
const correctionOf = (session: NodeTeachingSession) => object(parse(session.reviewJson, {})).frameworkCorrection as FrameworkCorrection | undefined;
const reviewWithCorrection = (review: unknown, correction?: FrameworkCorrection, status?: FrameworkCorrection["status"]) =>
  JSON.stringify({ ...object(review), ...(correction ? { frameworkCorrection: { ...correction, status: status || correction.status } } : {}) });
async function updateCorrectionOrigin(db:Db,correction:FrameworkCorrection,targetSessionId:string,status:FrameworkCorrection["status"]) {
  const origin=await db.nodeTeachingSession.findUnique({where:{id:correction.originSessionId}});
  if(!origin||origin.contextHash!==correction.originContextHash||origin.sourceRevision!==correction.sourceRevision||correctionOf(origin)?.targetSessionId!==targetSessionId) return;
  await db.nodeTeachingSession.update({where:{id:origin.id},data:{reviewJson:reviewWithCorrection(parse(origin.reviewJson,{}),{...correction,targetSessionId},status)}});
}

async function readContext(db: Db, domainId: string, nodeId: string) {
  const node = await db.learningNode.findFirst({ where: { id:nodeId,domainId }, include: { domain:true,unit:true,dependencies:{include:{prerequisite:{include:{knowledgePoint:true,
    teachingSessions:{where:{domainId},orderBy:{lessonVersion:"desc"},take:1,include:{segments:{where:{status:"ready"},orderBy:{version:"desc"}}}}
  }}}} } });
  if (!node) throw new NodeTeachingError("学习节点不属于当前领域。",404);
  const concept = object(parse(node.conceptJson, {}));
  const learningUnit = parseLearningUnit(concept.learningUnit);
  const plan = object(parse(node.unit?.teachingPlanJson, {}));
  const questionKeys = parse<string[]>(node.planningQuestionKeysJson, []);
  const questions = parse<RoadmapModuleBlueprint[]>(node.unit?.planningBlueprintJson, []).flatMap(m => m.keyQuestions || []);
  const contentKeys=new Set(questions.filter(q=>questionKeys.includes(q.key)).map(q=>q.contentQuestionKey));
  const contributions: ContentContribution[] = [...(learningUnit?.contentContributions || [])];
  let scoped = learningUnit?.version === 2;
  const legacyQuestionKeys = new Set(learningUnit?.version === 2 ? [] : contentKeys);
  const registeredQuestions=parseGoals(parse(node.domain.learningGoalsJson,[])).flatMap(goal=>goal.contentQuestions || []);
  if(registeredQuestions.length) {
    const units=await db.unit.findMany({where:{domainId},select:{teachingPlanJson:true,planningBlueprintJson:true}});
    for(const unit of units) {
      const references=array(object(parse(unit.teachingPlanJson,{})).modules).flatMap(m=>array(object(m).conceptReferences)).filter(ref=>object(ref).key===(node.mapKey || node.id));
      const blueprintQuestions = parse<RoadmapModuleBlueprint[]>(unit.planningBlueprintJson,[]).flatMap(m=>m.keyQuestions || []);
      for (const rawReference of references) {
        const reference = object(rawReference);
        const keys = new Set(array(reference.planningQuestionKeys));
        const linked = blueprintQuestions.filter(q => keys.has(q.key));
        for (const q of linked) contentKeys.add(q.contentQuestionKey);
        if (reference.contentContributions !== undefined) {
          scoped = true;
          contributions.push(...parseContentContributions(reference.contentContributions));
        } else if (learningUnit?.version !== 2) {
          for (const q of linked) legacyQuestionKeys.add(q.contentQuestionKey);
        }
      }
    }
  }
  const linkedQuestions = registeredQuestions.filter(q=>contentKeys.has(q.key));
  if (scoped) for (const q of linkedQuestions) if (legacyQuestionKeys.has(q.key)) contributions.push({contentQuestionKey:q.key, requirementIndices:q.contentRequirements.map((_,i)=>i), dimensionKeys:q.dimensionKeys, contribution:"保留已确认旧节点的整问题教学范围。"});
  const contentQuestions = scoped ? scopedContentQuestions(linkedQuestions, contributions) : linkedQuestions;
  if (scoped && contentQuestions.length !== linkedQuestions.length) throw new NodeTeachingError("当前节点的内容分工不完整，请先修订并确认课程地图。",409);
  const domain: Record<string,string> = {};
  for(const key of ["name","goal","currentLevel","description","taskBrief","scope","excludedScope","depth","outputType","outputTarget"] as const) domain[key] = node.domain[key] || "";
  const course = node.domain.courseDesignStatus === "confirmed" ? object(parse(node.domain.courseDesignDraft, {})) : {};
  const knowledgeBoundary = parseKnowledgeBoundary(course.knowledgeBoundary);
  const relatedConcepts: NonNullable<TeachingContextV2["relatedConcepts"]> = [];
  if (learningUnit?.references.length) {
    const related = await db.learningNode.findMany({where:{domainId,mapKey:{in:learningUnit.references.map(r=>r.key)}},select:{id:true,mapKey:true,title:true,conceptJson:true}});
    for (const ref of learningUnit.references) {
      const target = related.find(n=>n.mapKey===ref.key);
      if (!target) throw new NodeTeachingError("教学引用已变化，请检查当前课程地图。",409);
      const targetConcept = object(parse(target.conceptJson,{}));
      relatedConcepts.push({key:ref.key,nodeId:target.id,title:target.title,newKnowledge:str(object(targetConcept.learningUnit).newKnowledge) || str(targetConcept.scope),purpose:ref.purpose});
    }
  }
  domain.courseSummary = JSON.stringify({explanation:course.globalExplanation,tradeoffs:course.keyTradeoffs,learningGoals:parse(node.domain.learningGoalsJson,[])}).slice(0,12000);
  const sourceUrls = array(course.sources).map(raw => str(object(raw).url)).filter(url => isSafeExternalUrl(url)).slice(0, 10);
  const context: TeachingContextV2 = { domain, ...(relatedConcepts.length ? {relatedConcepts} : {}), ...(knowledgeBoundary ? {knowledgeBoundary} : {}), ...(contentQuestions.length?{contentQuestions}:{}), node:{...(learningUnit ? {learningUnit} : {}),title:str(concept.name) || node.title,objective:node.objective || "",keyQuestion:node.keyQuestion || node.title,
    scope:str(concept.scope) || node.objective || "",aliases:array(concept.aliases).filter((s): s is string => typeof s === "string"),problemRole:str(concept.problemRole),commonMistake:node.commonMistake || ""},
    stage:{title:node.unit?.title || "",goal:node.unit?.goal || "",moduleTitle:node.moduleTitle || "",outcomes:contentQuestions.length?[]:questions.filter(q => questionKeys.includes(q.key)).map(q => q.checkableOutcome),...(contentQuestions.length?{contentRequirements:contentQuestions.flatMap(q=>q.contentRequirements)}:{}),problem:str(object(plan.problem).question),process:array(object(plan.problem).steps).map(s => typeof s === "string" ? s : str(object(s).description))},
    prerequisites:node.dependencies.map(({prerequisite:p}) => {
      if (p.domainId !== domainId) throw new NodeTeachingError("前置节点不属于当前领域。",409);
      const profile=object(parse(p.conceptJson,{})); const unit=parseLearningUnit(profile.learningUnit);
      const previous=p.teachingSessions[0]; const progress={...initialProgress(),...parse<Partial<TeachingProgressV2>>(previous?.progressJson,{})};
      const summary={...emptySummary(),...parse<Partial<TeachingView["summary"]>>(previous?.summaryJson,{})};
      const latest=new Map<string,TeachingSegment>();
      for(const material of previous?.segments || []) if(!latest.has(material.key)) latest.set(material.key,material);
      return {nodeId:p.id,title:p.title,explanation:p.objective || p.keyQuestion || "",scope:str(profile.scope),...(unit?{learningUnit:unit}:{}),userUnderstanding:p.knowledgePoint?.userUnderstanding || null,
        learningEvidence:{sessionId:previous?.id || null,lessonVersion:previous?.lessonVersion || null,status:previous?.status || "not_prepared",
          steps:[...latest.values()].flatMap(material=>(parse<TeachingMaterial|null>(material.materialJson,null)?.steps || []).map(step=>({segmentId:material.id,stepKey:step.key,summary:step.summary,viewed:progress.visitedSteps.includes(`${material.id}:${step.key}`)}))),
          skipped:progress.skipped,unresolved:summary.unresolved.map(q=>q.text)}};
    }),sources:[],warnings:[] };
  // Learner answers and cached source refreshes must not invalidate the teaching framework.
  const hash = digest({ protocol:contentQuestions.length?3:2,domain, ...(relatedConcepts.length ? {relatedConcepts} : {}),...(knowledgeBoundary ? {knowledgeBoundary} : {}),node:context.node,stage:context.stage,...(contentQuestions.length?{contentQuestions}:{}),prerequisites:context.prerequisites.map(({userUnderstanding:_,learningEvidence:__,...p}) => p),course:node.domain.courseDesignAiCallLogId,sourceUrls });
  return { context,hash,mapRevision:node.domain.mapRevision,sourceUrls };
}
async function requireSession(db: Db, domainId:string,nodeId:string,sessionId:string) {
  const current = await readContext(db,domainId,nodeId);
  const session = await db.nodeTeachingSession.findFirst({where:{id:sessionId,domainId,nodeId}});
  if(!session) throw new NodeTeachingError("教学会话不属于当前节点。",404);
  const latest=await db.nodeTeachingSession.findFirst({where:{domainId,nodeId},orderBy:{lessonVersion:"desc"},select:{id:true}});
  if(latest?.id!==session.id) throw new NodeTeachingError("已有新的整课框架，请载入当前教案；历史记录保留。",409);
  if(session.contextHash !== current.hash) throw new NodeTeachingError("课程目标或概念范围已经改变，请准备新框架；旧记录保留。",409);
  return {session,current};
}
const interactionView = (i: TeachingInteraction): InteractionV2 => ({id:i.id,requestId:i.requestId,kind:i.kind,input:i.input,exerciseKey:i.exerciseKey,segmentId:i.segmentId,segmentKey:i.segmentKey,stepKey:i.stepKey,materialVersion:i.materialVersion,assistance:i.assistance,status:i.status,response:parse<TeachingReplyV2|null>(i.responseJson,null),error:i.errorMessage});
async function sourcePool(sessionId:string,db:Db=prisma) {
  const sources = await db.teachingSource.findMany({where:{sessionId},orderBy:{createdAt:"asc"}});
  return sources.flatMap(s => parse<SourceFragment[]>(s.fragmentsJson,[]));
}
function segmentQuery(context:TeachingContextV2,framework:TeachingFramework,key:string) {
  const part=framework.segments.find(s=>s.key===key);
  return [context.node.title,...context.node.aliases,context.node.keyQuestion,part?.goal,...(part?.steps.map(s=>s.goal)||[])].filter(Boolean).join(" ");
}
async function saveSource(db:Db,sessionId:string,source:Awaited<ReturnType<typeof fetchTeachingSource>>) {
  return db.teachingSource.upsert({where:{sessionId_url:{sessionId,url:source.url}},create:{sessionId,url:source.url,title:source.title,contentHash:source.contentHash,fragmentsJson:JSON.stringify(source.fragments),limitation:source.limitation},update:{title:source.title,contentHash:source.contentHash,fragmentsJson:JSON.stringify(source.fragments),limitation:source.limitation}});
}
async function persistSummary(db:Db,sessionId:string) {
  const session=await db.nodeTeachingSession.findUniqueOrThrow({where:{id:sessionId}});
  const progress=parse<TeachingProgressV2>(session.progressJson,initialProgress());
  const [segments,interactions]=await Promise.all([
    db.teachingSegment.findMany({where:{sessionId,status:"ready"},orderBy:{version:"asc"}}),
    db.teachingInteraction.findMany({where:{sessionId},orderBy:[{createdAt:"asc"},{id:"asc"}]})
  ]);
  const taught=new Map<string,TeachingView["summary"]["taught"][number]>();
  for(const segment of segments) for(const step of parse<TeachingMaterial|null>(segment.materialJson,null)?.steps || []) {
    if(progress.visitedSteps.includes(`${segment.id}:${step.key}`)) taught.set(step.key,{segmentId:segment.id,stepKey:step.key,summary:step.summary,terms:step.terms});
  }
  const records=interactions.map(interactionView);
  const summary:TeachingView["summary"]={
    taught:[...taught.values()],
    observations:records.filter(i=>i.response?.observation).slice(-20).map(i=>({interactionId:i.id,text:i.response!.observation})),
    unresolved:records.filter(i=>!progress.unresolved.includes(i.id)&&(i.kind==="question"||i.response?.unresolved)).slice(-20).map(i=>({interactionId:i.id,text:i.kind==="question"?i.input:i.response!.unresolved!}))
  };
  await db.nodeTeachingSession.update({where:{id:sessionId},data:{summaryJson:JSON.stringify(summary)}});
  return summary;
}
async function view(session:NodeTeachingSession,currentHash:string,latestContext?:TeachingContextV2):Promise<TeachingView> {
  const [segments,interactions,pool] = await Promise.all([
    prisma.teachingSegment.findMany({where:{sessionId:session.id},orderBy:[{key:"asc"},{version:"asc"}]}),
    prisma.teachingInteraction.findMany({where:{sessionId:session.id},orderBy:[{createdAt:"asc"},{id:"asc"}]}),
    sourcePool(session.id)
  ]);
  const progress = parse<TeachingProgressV2>(session.progressJson,initialProgress());
  const records = interactions.map(interactionView);
  const context=parse<TeachingContextV2>(session.contextJson,{} as TeachingContextV2);
  if(latestContext && session.contextHash===currentHash) context.prerequisites=latestContext.prerequisites;
  const framework=["ready","needs_correction"].includes(session.status)?parse<TeachingFramework|null>(session.lessonJson,null):null;
  const review=object(parse(session.reviewJson,{})); const knowledge=review.knowledgeReview as TeachingKnowledgeReview|undefined;
  const correction=correctionOf(session);
  const uncertainCount=knowledge?.checks?.filter(c=>c.verdict==="uncertain").length || 0;
  return {id:session.id,revision:session.revision,lessonVersion:session.lessonVersion,status:session.status,stale:session.contextHash!==currentHash,error:session.errorMessage,
    context,framework,progress,
    segments:segments.map(s => ({id:s.id,requestId:s.requestId,key:s.key as SegmentKey,version:s.version,status:s.status,error:s.errorMessage,staleSources:framework?digest(selectFragments(pool,segmentQuery(context,framework,s.key)).map(f=>f.id))!==digest(parse<SourceFragment[]>(s.sourceSnapshotJson,[]).map(f=>f.id)):false,sources:parse<SourceFragment[]>(s.sourceSnapshotJson,[]),request:segmentRequestOf(s),review:publicReview(s.reviewJson),material:s.status==="ready"&&s.materialJson?publicMaterial(JSON.parse(s.materialJson),s.id,progress):null})),
    interactions:records,
    summary:{...emptySummary(),...parse(session.summaryJson,{})},
    knowledge:{status:session.status==="needs_correction"?"needs_correction":object(review.knowledgeRequest).status==="pending"?"checking":knowledge?.knowledgeVersion===1?(uncertainCount?"uncertain":"checked"):"unverified",uncertainCount,
      request:knowledgeRequestOf(review),...(correction&&correction.originSessionId!==session.id?{correctedFromVersion:correction.originVersion}:{})} };
}
function publicReview(json:string|null):TeachingView["segments"][number]["review"] {
  if(!json) return null;
  const report=object(parse(json,{}));
  // Evidence may quote a hidden hint/reference answer; retain it server-side.
  const count=array(report.warnings).length;
  return {findings:[],limitation:`${count ? `保留 ${count} 条改进建议。` : ""}${str(report.limitation)}`};
}
export async function getNodeTeaching(domainId:string,nodeId:string,selectedId?:string) {
  const current = await readContext(prisma,domainId,nodeId);
  const latest = await prisma.nodeTeachingSession.findFirst({where:{domainId,nodeId},orderBy:{lessonVersion:"desc"}});
  const session=selectedId?await prisma.nodeTeachingSession.findFirst({where:{id:selectedId,domainId,nodeId}}):latest;
  if(selectedId&&!session) throw new NodeTeachingError("历史教案不属于当前节点。",404);
  const history=await prisma.nodeTeachingSession.findMany({where:{domainId,nodeId},orderBy:{lessonVersion:"desc"},select:{id:true,lessonVersion:true,status:true}});
  return {session:session ? {...await view(session,current.hash,session.id===latest?.id?current.context:undefined),historical:session.id!==latest?.id,history} : null};
}
export async function prepareNodeTeaching(domainId:string,nodeId:string,value:unknown={},internal?:{correction:FrameworkCorrection}):Promise<{session:TeachingView|null}> {
  const data=teachingObject(value); const current=await readContext(prisma,domainId,nodeId);
  if(data.verifyKnowledge===true) return verifyNodeTeachingKnowledge(domainId,nodeId,data);
  const requestId=data.requestId?safeKey(data.requestId):`prepare-${current.hash.slice(0,40)}`;
  const token=randomUUID();
  let correction=internal?.correction;
  const session=await prisma.$transaction(async tx => {
    const same=await tx.nodeTeachingSession.findFirst({where:{nodeId,requestId}});
    const latest=await tx.nodeTeachingSession.findFirst({where:{nodeId,contextHash:current.hash},orderBy:{lessonVersion:"desc"}});
    const mostRecent=await tx.nodeTeachingSession.findFirst({where:{nodeId},orderBy:{lessonVersion:"desc"}});
    correction=correction || (mostRecent&&mostRecent.status!=="ready"?correctionOf(mostRecent):undefined);
    let existing=same || (data.reprepare===true || latest?.id!==mostRecent?.id?null:latest);
    if(existing?.status==="needs_correction"&&correction) existing=null;
    if(correction) {
      const origin=await tx.nodeTeachingSession.findFirst({where:{id:correction.originSessionId,domainId,nodeId}});
      if(!origin||origin.contextHash!==current.hash||origin.sourceRevision!==correction.sourceRevision||correction.originContextHash!==current.hash) throw new NodeTeachingError("知识纠正依据已过期，请重新核对当前框架或资料。",409);
      if(mostRecent&&mostRecent.id!==origin.id&&correctionOf(mostRecent)?.originSessionId!==origin.id) throw new NodeTeachingError("已有另一份新框架，本次纠正不能覆盖它。",409);
    }
    if(existing) {
      if(existing.contextHash!==current.hash) throw new NodeTeachingError("本次备课请求已过期，请重新发起。",409);
      if(existing.status==="ready" || (existing.status==="pending" && Date.now()-existing.updatedAt.getTime()<leaseMs)) return null;
      const claim=await tx.nodeTeachingSession.updateMany({where:{id:existing.id,updatedAt:existing.updatedAt},data:{status:"pending",generationToken:token,errorMessage:null}});
      return claim.count?{...existing,generationToken:token}:null;
    }
    if((data.reprepare===true || correction) && mostRecent) {
      if(data.sessionId!==mostRecent.id || data.revision!==mostRecent.revision) throw new NodeTeachingError("框架或学习位置已更新，请重新载入后重备。",409);
      const changed=await tx.nodeTeachingSession.updateMany({where:{id:mostRecent.id,revision:mostRecent.revision},data:{revision:{increment:1}}});
      if(!changed.count) throw new NodeTeachingError("已有其他备课请求，请重新载入。",409);
    }
    const created=await tx.nodeTeachingSession.create({data:{domainId,nodeId,contextHash:current.hash,mapRevision:current.mapRevision,lessonVersion:(mostRecent?.lessonVersion||0)+1,requestId,status:"pending",generationToken:token,contextJson:JSON.stringify(current.context),lessonJson:"{}",aiCallLogId:"",sourceRevision:correction?.sourceRevision||0,progressJson:JSON.stringify(initialProgress()),...(correction?{reviewJson:reviewWithCorrection({},correction,"pending")}:{})}});
    if(mostRecent) {
      const previousProgress=parse<TeachingProgressV2>(mostRecent.progressJson,initialProgress());
      await tx.nodeTeachingSession.update({where:{id:created.id},data:{progressJson:JSON.stringify({...initialProgress(),understandingDraft:previousProgress.understandingDraft,...(correction?{segmentKey:previousProgress.segmentKey,stepKey:previousProgress.stepKey}:{} )})}});
      const retainedSources=await tx.teachingSource.findMany({where:{sessionId:mostRecent.id}});
      for(const source of retainedSources) await tx.teachingSource.create({data:{sessionId:created.id,url:source.url,title:source.title,contentHash:source.contentHash,fragmentsJson:source.fragmentsJson,limitation:source.limitation}});
    }
    if(correction) {
      const origin=await tx.nodeTeachingSession.findUniqueOrThrow({where:{id:correction.originSessionId}});
      await tx.nodeTeachingSession.update({where:{id:origin.id},data:{reviewJson:reviewWithCorrection(parse(origin.reviewJson,{}),{...correction,targetSessionId:created.id},"pending")}});
    }
    return created;
  });
  if(!session) return getNodeTeaching(domainId,nodeId);
  try {
    const cached=await prisma.teachingSource.findMany({where:{sessionId:session.id},select:{url:true}});
    for(const url of current.sourceUrls.filter(url => !cached.some(s => s.url===url))) {
      const source=await fetchTeachingSource(url);
      await prisma.$transaction(async tx=>{
        const active=await tx.nodeTeachingSession.updateMany({where:{id:session.id,generationToken:token,status:"pending"},data:{updatedAt:new Date()}});
        if(!active.count) throw new NodeTeachingError("本次备课已被更新，请载入当前教案。",409);
        await saveSource(tx,session.id,source);
      });
    }
    const pool=await sourcePool(session.id); const context={...current.context,sources:selectFragments(pool,[current.context.node.title,...current.context.node.aliases,current.context.node.keyQuestion].join(" "))};
    if(!context.sources.length) context.warnings=["没有与本概念匹配的可用来源片段；AI 解释需进一步核对。"];
    const original=correction?await prisma.nodeTeachingSession.findFirst({where:{id:correction.originSessionId,domainId,nodeId}}):null;
    const result=await prepareProgressiveTeaching({domainId,nodeId,context,...(correction&&original?{frameworkCorrection:{baseline:JSON.parse(original.lessonJson),knowledge:correction.knowledge},resumeCallIds:correction.callIds}:{}),checkpoint:async (ids,candidate,review) => {
      const active=await prisma.nodeTeachingSession.updateMany({where:{id:session.id,generationToken:token,status:"pending"},data:{updatedAt:new Date(),aiCallLogIdsJson:JSON.stringify(ids),...(candidate?{lessonJson:JSON.stringify(candidate)}:{}),...(review?{reviewJson:reviewWithCorrection(review,correction,"pending")}:{})}});
      if(!active.count) throw new NodeTeachingError("该备课请求已被更新。",409);
    }});
    await prisma.$transaction(async tx => {
      const {session:active}=await requireSession(tx,domainId,nodeId,session.id);
      if(active.sourceRevision!==session.sourceRevision) throw new NodeTeachingError("框架准备期间资料已更新，请重试备课。",409);
      const saved=await tx.nodeTeachingSession.updateMany({where:{id:session.id,generationToken:token,status:"pending"},data:{status:"ready",generationToken:null,contextJson:JSON.stringify(context),lessonJson:JSON.stringify(result.data),aiCallLogId:result.callIds[0],aiCallLogIdsJson:JSON.stringify(result.callIds),reviewJson:reviewWithCorrection(result.review,correction,"ready"),revision:{increment:1}}});
      if(!saved.count) throw new NodeTeachingError("过期备课结果未保存。",409);
      if(correction) await updateCorrectionOrigin(tx,correction,session.id,"ready");
      await tx.learningNode.updateMany({where:{id:nodeId,domainId,status:{in:["available","locked","suggested"]}},data:{status:"in_progress"}});
    });
  } catch(error) {
    await prisma.$transaction(async tx=>{
      const saved=await tx.nodeTeachingSession.findUniqueOrThrow({where:{id:session.id}});
      const changed=await tx.nodeTeachingSession.updateMany({where:{id:session.id,generationToken:token},data:{status:"failed",generationToken:null,errorMessage:error instanceof NodeTeachingError?error.message:"框架尚未准备成功，可重试或检查 AI 设置；已有内容保留。",...(correction?{reviewJson:reviewWithCorrection(parse(saved.reviewJson,{}),correction,"failed")}:{})}});
      if(changed.count&&correction) await updateCorrectionOrigin(tx,correction,session.id,"failed");
    });
  }
  return getNodeTeaching(domainId,nodeId);
}
export async function prepareTeachingSegment(domainId:string,nodeId:string,key:string,value:unknown,internal?:{disableFrameworkCorrection:boolean}):Promise<{session:TeachingView|null}> {
  if(!segmentKeys.includes(key as SegmentKey)) throw new NodeTeachingError("教学段落不存在。",404);
  const {data,sessionId,revision}=parseTeachingBinding(value); const requestId=safeKey(data.requestId); const token=randomUUID();
  const submittedConcern = data.concern === undefined ? undefined : teachingText(data.concern,"本段待核对疑点",4000,true);
  const root=await prisma.nodeTeachingSession.findFirst({where:{id:sessionId,domainId,nodeId}});
  const handoff=root?correctionOf(root):undefined;
  if(handoff?.targetSessionId&&handoff.triggerRequestId===requestId&&handoff.triggerSegmentKey===key) {
    const original=await prisma.teachingSegment.findFirst({where:{sessionId,requestId,key}});
    retainedConcern(submittedConcern,original?segmentRequestOf(original):undefined);
    return getNodeTeaching(domainId,nodeId);
  }
  const claimed=await prisma.$transaction(async tx => {
    const {session,current}=await requireSession(tx,domainId,nodeId,sessionId);
    if(session.status!=="ready") throw new NodeTeachingError("请先完成教学框架。");
    const previous=await tx.teachingSegment.findFirst({where:{sessionId,requestId}});
    if(previous && previous.key!==key) throw new NodeTeachingError("同一请求不能用于不同段落。",409);
    const latest=await tx.teachingSegment.findFirst({where:{sessionId,key},orderBy:{version:"desc"}});
    const existing=previous || (data.reprepare===true?null:latest);
    const savedRequest=existing?segmentRequestOf(existing):undefined;
    if(submittedConcern&&data.reprepare!==true&&!previous) throw new NodeTeachingError("带疑点核对需要显式重新准备本段。");
    if(previous&&savedRequest&&data.reprepare!==undefined&&(data.reprepare===true)!==savedRequest.reprepare) throw new NodeTeachingError("同一请求不能更换备课方式，请作为新请求提交。",409);
    const concern=retainedConcern(submittedConcern,savedRequest);
    const reprepare=savedRequest?.reprepare ?? data.reprepare===true;
    if(concern&&!reprepare) throw new NodeTeachingError("带疑点核对需要显式重新准备本段。");
    if(existing?.status==="ready" || (existing?.status==="pending" && Date.now()-existing.updatedAt.getTime()<leaseMs)) return null;
    if(session.revision!==revision) throw new NodeTeachingError("学习位置已更新，请重新载入；输入仍保留。",409);
    const correctedFrom=correctionOf(session);
    const currentMaterial=concern?await tx.teachingSegment.findFirst({where:{sessionId,key,status:"ready",...(savedRequest?.sourceMaterialId?{id:savedRequest.sourceMaterialId}:{})},orderBy:{version:"desc"}}):null;
    if(savedRequest?.sourceMaterialId&&!currentMaterial) throw new NodeTeachingError("原疑点所核对的材料已变化，请重新载入并发起新请求。",409);
    const oldMaterial=currentMaterial || (correctedFrom?(correctedFrom.triggerSegmentKey===key&&correctedFrom.triggerSegmentId?
      await tx.teachingSegment.findFirst({where:{id:correctedFrom.triggerSegmentId,sessionId:correctedFrom.originSessionId}}):
      await tx.teachingSegment.findFirst({where:{sessionId:correctedFrom.originSessionId,key,status:"ready"},orderBy:{version:"desc"}})):null);
    const savedCandidateRevision=existing?object(parse(existing.reviewJson,{})).candidateSourceRevision:undefined;
    const candidateSourceRevision=existing?.materialJson?(typeof savedCandidateRevision==="number"?savedCandidateRevision:existing.sourceRevision):null;
    const canResumeCandidate=Boolean(previous&&savedRequest&&existing?.materialJson&&["failed","pending"].includes(existing.status)&&existing.sourceRevision===session.sourceRevision&&candidateSourceRevision===session.sourceRevision);
    const recordMaterial=parse<TeachingMaterial|null>(oldMaterial?.materialJson,null);
    const resumeMaterial=(canResumeCandidate?parse<TeachingMaterial|null>(existing?.materialJson,null):null)||recordMaterial;
    const pool=await sourcePool(sessionId,tx);
    const fragments=selectFragments(pool,segmentQuery(current.context,JSON.parse(session.lessonJson),key));
    for(const fragment of pool.filter(f=>resumeMaterial?.steps.some(s=>s.sourceIds.includes(f.id)))) if(!fragments.some(f=>f.id===fragment.id)) fragments.push(fragment);
    const context={...current.context,sources:fragments,warnings:fragments.length?[]:["本段缺少匹配来源，未有依据的解释需核对。"]};
    const request:TeachingPreparationRequest={concern,reprepare,...(currentMaterial?{sourceMaterialId:currentMaterial.id}:{})};
    let segment:TeachingSegment;
    if(existing) {
      const saved=await tx.teachingSegment.updateMany({where:{id:existing.id,updatedAt:existing.updatedAt},data:{status:"pending",generationToken:token,errorMessage:null,sourceRevision:session.sourceRevision,sourceSnapshotJson:JSON.stringify(fragments),reviewJson:reviewWithPreparation(parse(existing.reviewJson,{}),request,candidateSourceRevision)}});
      if(!saved.count) return null;
      segment={...existing,generationToken:token};
    } else segment=await tx.teachingSegment.create({data:{sessionId,key,version:(latest?.version||0)+1,requestId,status:"pending",generationToken:token,sourceRevision:session.sourceRevision,sourceSnapshotJson:JSON.stringify(fragments),reviewJson:reviewWithPreparation({},request)}});
    return {session,segment,context,request,candidateSourceRevision,resumeMaterial,recordMaterial,resumeSourceId:oldMaterial?.id,resumeOriginId:currentMaterial?sessionId:correctedFrom?.originSessionId,resumeCallIds:[...new Set([...parse<string[]>(oldMaterial?.aiCallLogIdsJson,[]),...parse<string[]>(previous?.aiCallLogIdsJson,[])])]};
  });
  if(!claimed) return getNodeTeaching(domainId,nodeId);
  const {session,segment,context,request,resumeMaterial,recordMaterial,resumeSourceId,resumeOriginId,resumeCallIds}=claimed;
  let candidateSourceRevision=claimed.candidateSourceRevision;
  let checkpointReview:unknown=parse(segment.reviewJson,{});
  const concern=request.concern || undefined;
  try {
    const snapshot=await view(session,session.contextHash);
    const result=await prepareProgressiveTeaching({domainId,nodeId,context,framework:JSON.parse(session.lessonJson),segmentKey:key as SegmentKey,progress:snapshot.progress,concern,
      frameworkKnowledge:object(parse(session.reviewJson,{})).knowledgeReview as TeachingKnowledgeReview|undefined,
      ...(resumeMaterial?{resumeMaterial,resumeCallIds}:{}),
      recent:snapshot.interactions.slice(-4),
      summary:{taught:snapshot.summary.taught,observations:snapshot.summary.observations.slice(-10),unresolved:snapshot.summary.unresolved.slice(-10)},
      checkpoint:async (ids,candidate,review) => {
        if(candidate) candidateSourceRevision=session.sourceRevision;
        if(review) checkpointReview=review;
        const active=await prisma.teachingSegment.updateMany({where:{id:segment.id,generationToken:token,status:"pending"},data:{updatedAt:new Date(),aiCallLogIdsJson:JSON.stringify(ids),...(candidate?{materialJson:JSON.stringify(candidate)}:{}),...((candidate||review)?{reviewJson:reviewWithPreparation(checkpointReview,request,candidateSourceRevision)}:{})}});
        if(!active.count) throw new NodeTeachingError("段落备课请求已更新。",409);
      }});
    await prisma.$transaction(async tx => {
      const {session:active}=await requireSession(tx,domainId,nodeId,sessionId);
      if(active.status!=="ready") throw new NodeTeachingError("框架需要先纠正，本段结果保留但不能用于新授课。",409);
      if(active.sourceRevision!==session.sourceRevision) throw new NodeTeachingError("备课期间资料已经更新，请重试本段。",409);
      const saved=await tx.teachingSegment.updateMany({where:{id:segment.id,generationToken:token,status:"pending"},data:{status:"ready",materialJson:JSON.stringify(result.data),reviewJson:reviewWithPreparation(result.review,request,session.sourceRevision),aiCallLogIdsJson:JSON.stringify(result.callIds),generationToken:null}});
      if(!saved.count) throw new NodeTeachingError("过期的段落结果未保存。",409);
      if(result.review.reusedMaterial&&resumeSourceId&&resumeOriginId&&recordMaterial) {
        const origin=await tx.nodeTeachingSession.findFirst({where:{id:resumeOriginId,domainId,nodeId}});
        if(origin) {
          const oldProgress=parse<TeachingProgressV2>(origin.progressJson,initialProgress());
          const progress=parse<TeachingProgressV2>(active.progressJson,initialProgress());
          const normalizedResume=validateMaterial(recordMaterial,JSON.parse(active.lessonJson),key as SegmentKey,context.sources);
          for(const step of (result.data as TeachingMaterial).steps) {
            const oldStep=normalizedResume.steps.find(s=>s.key===step.key);
            if(JSON.stringify(oldStep)!==JSON.stringify(step)) continue;
            for(const exerciseKey of ["question",...step.activities.map(a=>a.key)]) {
              const oldKey=activityBinding(resumeSourceId,step.key,exerciseKey);const newKey=activityBinding(segment.id,step.key,exerciseKey);
              if(oldProgress.drafts[oldKey]!==undefined&&progress.drafts[newKey]===undefined) progress.drafts[newKey]=oldProgress.drafts[oldKey];
              if(oldProgress.support[oldKey]&&!progress.support[newKey]) progress.support[newKey]=oldProgress.support[oldKey];
            }
            if(oldProgress.visitedSteps.includes(`${resumeSourceId}:${step.key}`)) progress.visitedSteps=[...new Set([...progress.visitedSteps,`${segment.id}:${step.key}`])];
            if(oldProgress.skipped.includes(`${resumeSourceId}:${step.key}`)) progress.skipped=[...new Set([...progress.skipped,`${segment.id}:${step.key}`])];
            if(oldProgress.visited.includes(resumeSourceId)) progress.visited=[...new Set([...progress.visited,segment.id])];
          }
          if(oldProgress.segmentKey===key&&recordMaterial.steps.some(s=>s.key===oldProgress.stepKey)) {progress.segmentKey=key as SegmentKey;progress.segmentId=segment.id;progress.stepKey=oldProgress.stepKey;}
          await tx.nodeTeachingSession.update({where:{id:sessionId},data:{progressJson:JSON.stringify(progress),revision:{increment:1}}});
          await persistSummary(tx,sessionId);
        }
      }
    });
  } catch(error) {
    const failed=await prisma.teachingSegment.updateMany({where:{id:segment.id,generationToken:token},data:{status:"failed",generationToken:null,errorMessage:error instanceof NodeTeachingError?error.message:"本段备课或内容复核未完成，可单独重试；其余段落保留。"}});
    if(error instanceof FrameworkKnowledgeError&&failed.count) {
      const marked=await markFrameworkForCorrection(domainId,nodeId,session,context,error.knowledge,error.callIds,{segmentId:segment.id,key:key as SegmentKey,requestId});
      if(internal?.disableFrameworkCorrection) return getNodeTeaching(domainId,nodeId);
      const corrected=await prepareNodeTeaching(domainId,nodeId,{sessionId:marked.session.id,revision:marked.session.revision,reprepare:true,
        requestId:`correction-${digest([sessionId,requestId]).slice(0,40)}`},{correction:marked.correction});
      if(corrected.session?.status==="ready") return prepareTeachingSegment(domainId,nodeId,key,{sessionId:corrected.session.id,revision:corrected.session.revision,
        requestId:`resume-${digest([sessionId,requestId]).slice(0,40)}`,...(concern?{concern,reprepare:true}:{})},{disableFrameworkCorrection:true});
      return corrected;
    }
  }
  return getNodeTeaching(domainId,nodeId);
}

async function markFrameworkForCorrection(domainId:string,nodeId:string,original:NodeTeachingSession,context:TeachingContextV2,knowledge:TeachingKnowledgeReview,callIds:string[],trigger?:{segmentId:string;key:SegmentKey;requestId:string},transaction?:Db) {
  const mark=async (tx:Db)=>{
    const {session,current}=await requireSession(tx,domainId,nodeId,original.id);
    if(session.sourceRevision!==original.sourceRevision) throw new NodeTeachingError("核对期间资料已改变，请重新核对。",409);
    if(knowledge.frameworkHash!==frameworkKnowledgeHash(JSON.parse(session.lessonJson),context)) throw new NodeTeachingError("知识核对不属于当前框架，本次结果已保留但不能修正它。",409);
    const correction:FrameworkCorrection={originSessionId:session.id,originVersion:session.lessonVersion,originContextHash:current.hash,sourceRevision:session.sourceRevision,knowledge,callIds,status:"required",
      ...(trigger?{triggerSegmentId:trigger.segmentId,triggerSegmentKey:trigger.key,triggerRequestId:trigger.requestId}:{})};
    const changed=await tx.nodeTeachingSession.updateMany({where:{id:session.id,revision:session.revision},data:{status:"needs_correction",errorMessage:"框架中的知识事实需要纠正，旧教案与学习记录保留。",generationToken:null,
      reviewJson:reviewWithCorrection({...object(parse(session.reviewJson,{})),knowledgeReview:knowledge},correction),revision:{increment:1}}});
    if(!changed.count) throw new NodeTeachingError("框架核对已被更新，请重新载入。",409);
    return {session:{...session,status:"needs_correction",revision:session.revision+1},correction};
  };
  return transaction?mark(transaction):prisma.$transaction(mark);
}

async function verifyNodeTeachingKnowledge(domainId:string,nodeId:string,data:Record<string,unknown>):Promise<{session:TeachingView|null}> {
  const submittedConcern = data.concern === undefined ? undefined : teachingText(data.concern,"待核对疑点",4000,true);
  const {sessionId,revision}=parseTeachingBinding(data);const requestId=safeKey(data.requestId);const token=randomUUID();
  const root=await prisma.nodeTeachingSession.findFirst({where:{id:sessionId,domainId,nodeId}});
  const rootRequest=root?knowledgeRequestOf(object(parse(root.reviewJson,{})),requestId):undefined;
  retainedConcern(submittedConcern,rootRequest);
  if(root&&correctionOf(root)?.targetSessionId&&rootRequest) return getNodeTeaching(domainId,nodeId);
  const claimed=await prisma.$transaction(async tx=>{
    const {session,current}=await requireSession(tx,domainId,nodeId,sessionId);
    const review=object(parse(session.reviewJson,{}));const priorRequest=knowledgeRequestOf(review,requestId);const activeRequest=knowledgeRequestOf(review);
    const concern=retainedConcern(submittedConcern,priorRequest);
    if(session.status==="needs_correction"&&correctionOf(session)?.sourceRevision===session.sourceRevision) {
      if(session.revision!==revision) throw new NodeTeachingError("框架或学习位置已更新，请重新载入后纠正。",409);
      return {session,current,concern,correction:correctionOf(session)};
    }
    if(!["ready","needs_correction"].includes(session.status)) throw new NodeTeachingError("请先完成当前框架。",409);
    if(priorRequest?.status==="complete") return null;
    if(activeRequest?.status==="pending"&&Date.now()-session.updatedAt.getTime()<leaseMs) {
      if(activeRequest.requestId!==requestId) throw new NodeTeachingError("另一项知识核对尚未结束，请重新载入后再提交新疑点。",409);
      return null;
    }
    if(session.revision!==revision) throw new NodeTeachingError("框架或学习位置已更新，请重新载入后核对。",409);
    const changed=await tx.nodeTeachingSession.updateMany({where:{id:session.id,revision,generationToken:session.generationToken},data:{generationToken:token,
      reviewJson:reviewWithKnowledgeRequest(review,{requestId,concern,status:"pending"})}});
    if(!changed.count) return null;
    return {session,current,concern,correction:undefined};
  });
  if(!claimed) return getNodeTeaching(domainId,nodeId);
  if(claimed.correction) return prepareNodeTeaching(domainId,nodeId,{sessionId,revision:claimed.session.revision,reprepare:true,requestId:`correction-${digest([sessionId,requestId]).slice(0,40)}`},{correction:claimed.correction});
  const {session,current,concern}=claimed;
  let completedCallIds:string[]=[];
  try {
    const context={...current.context,sources:selectFragments(await sourcePool(sessionId),[current.context.node.title,...current.context.node.aliases,current.context.node.keyQuestion].join(" "))};
    const checked=await checkTeachingKnowledge({domainId,nodeId,framework:JSON.parse(session.lessonJson),context,concern});
    completedCallIds=checked.aiCallLogIds;
    const saved=await prisma.$transaction(async tx=>{
      const {session:active}=await requireSession(tx,domainId,nodeId,sessionId);
      if(active.generationToken!==token||active.sourceRevision!==session.sourceRevision||active.lessonJson!==session.lessonJson) throw new NodeTeachingError("核对对象已改变，本次结果不能覆盖新框架。",409);
      const saved=await tx.nodeTeachingSession.update({where:{id:sessionId},data:{generationToken:null,errorMessage:null,reviewJson:reviewWithKnowledgeRequest({...object(parse(active.reviewJson,{})),knowledgeReview:checked.data},{requestId,concern,status:"complete"}),
        aiCallLogIdsJson:JSON.stringify([...new Set([...parse<string[]>(active.aiCallLogIdsJson,[]),...checked.aiCallLogIds])])}});
      if(checked.data.checks.some(c=>c.verdict==="error")) return {marked:await markFrameworkForCorrection(domainId,nodeId,saved,context,checked.data,checked.aiCallLogIds,undefined,tx)};
      if(active.status==="needs_correction") await tx.nodeTeachingSession.update({where:{id:sessionId},data:{status:"ready",errorMessage:null,revision:{increment:1}}});
      return {marked:null};
    });
    if(saved.marked) {
      const marked=saved.marked;
      return prepareNodeTeaching(domainId,nodeId,{sessionId,revision:marked.session.revision,reprepare:true,requestId:`correction-${digest([sessionId,requestId]).slice(0,40)}`},{correction:marked.correction});
    }
  } catch(error) {
    const active=await prisma.nodeTeachingSession.findUniqueOrThrow({where:{id:sessionId}});
    await prisma.nodeTeachingSession.updateMany({where:{id:sessionId,generationToken:token},data:{generationToken:null,errorMessage:error instanceof NodeTeachingError?error.message:"知识核对尚未完成，原框架和记录保留，可重试。",
      reviewJson:reviewWithKnowledgeRequest(parse(active.reviewJson,{}),{requestId,concern,status:"failed"}),
      aiCallLogIdsJson:JSON.stringify([...new Set([...parse<string[]>(active.aiCallLogIdsJson,[]),...completedCallIds,...(aiFailureReference(error).aiCallLogIds||[])])])}});
  }
  return getNodeTeaching(domainId,nodeId);
}
async function changeProgress(tx:Db,session:NodeTeachingSession,revision:number,progress:TeachingProgressV2) {
  const changed=await tx.nodeTeachingSession.updateMany({where:{id:session.id,revision},data:{progressJson:JSON.stringify(progress),revision:{increment:1}}});
  if(!changed.count) throw new NodeTeachingError("学习记录已在另一处更新，请重新载入；输入仍保留。",409);
  await persistSummary(tx,session.id);
}
async function boundSegment(db:Db,sessionId:string,value:unknown) {
  const id=teachingText(value,"材料版本标识",100);
  const segment=await db.teachingSegment.findFirst({where:{id,sessionId,status:"ready"}});
  if(!segment?.materialJson) throw new NodeTeachingError("所选材料尚未完成或不属于本课。",409);
  return {segment,material:JSON.parse(segment.materialJson) as TeachingMaterial};
}
export async function saveNodeTeachingProgress(domainId:string,nodeId:string,value:unknown) {
  const {data,sessionId,revision}=parseTeachingBinding(value);
  await prisma.$transaction(async tx => {
    const {session}=await requireSession(tx,domainId,nodeId,sessionId); const progress=parse<TeachingProgressV2>(session.progressJson,initialProgress());
    if(session.status!=="ready"&&data.action!=="save_understanding") throw new NodeTeachingError("框架尚未准备完成或需要纠正，输入会保留，请完成备课后继续。",409);
    if(data.action==="select_segment") {
      if(!segmentKeys.includes(data.segmentKey as SegmentKey)) throw new NodeTeachingError("教学段落不存在。");
      progress.segmentKey=data.segmentKey as SegmentKey;progress.segmentId=null;progress.stepKey="";
    } else if(data.action==="save_understanding") {
      progress.understandingDraft=teachingText(data.answer,"个人理解草稿",6000,true);
    } else if(data.action==="remember_return") {
      const interaction=await tx.teachingInteraction.findFirst({where:{id:teachingText(data.interactionId,"交互标识",100),sessionId,status:"complete"}});
      if(!interaction?.segmentId||!interaction.stepKey) throw new NodeTeachingError("补讲不属于当前教案。");
      progress.returnPosition={segmentId:interaction.segmentId,stepKey:interaction.stepKey,interactionId:interaction.id};
    } else if(data.action==="clear_return") {
      progress.returnPosition=null;
    } else if(data.action==="resolve_question") {
      const id=teachingText(data.interactionId,"交互标识",100);
      if(!await tx.teachingInteraction.findFirst({where:{id,sessionId}})) throw new NodeTeachingError("疑问不属于本课。");
      progress.unresolved=[...new Set([...progress.unresolved,id])];
    } else {
      const {segment,material}=await boundSegment(tx,sessionId,data.segmentId);
      const step=material.steps.find(s => s.key===data.stepKey); if(!step) throw new NodeTeachingError("教学步骤不存在。");
      const key=activityBinding(segment.id,step.key,str(data.exerciseKey));
      if(data.action==="navigate") { progress.segmentKey=segment.key as SegmentKey;progress.segmentId=segment.id;progress.stepKey=step.key;progress.visited=[...new Set([...progress.visited,segment.id])];progress.visitedSteps=[...new Set([...progress.visitedSteps,`${segment.id}:${step.key}`])]; }
      else if(data.action==="skip") progress.skipped=[...new Set([...progress.skipped,`${segment.id}:${step.key}`])];
      else if(data.action==="save_question") progress.drafts[activityBinding(segment.id,step.key,"question")]=teachingText(data.answer,"提问草稿",6000,true);
      else {
        const activity=step.activities.find(a => a.key===data.exerciseKey); if(!activity) throw new NodeTeachingError("思考任务不存在。");
        if(data.action==="save_answer") progress.drafts[key]=teachingText(data.answer,"作答草稿",6000,true);
        else if(data.action==="hint"||data.action==="solution") {
          const support=progress.support[key] || {hints:0,solution:false};
          progress.support[key]=data.action==="hint"?{...support,hints:Math.min(activity.hints.length,support.hints+1)}:{...support,solution:true};
        } else throw new NodeTeachingError("不支持的教学操作。");
      }
    }
    await changeProgress(tx,session,revision,progress);
  });
  return getNodeTeaching(domainId,nodeId);
}
export async function submitTeachingInteraction(domainId:string,nodeId:string,value:unknown) {
  const {data,sessionId,revision}=parseTeachingBinding(value); const requestId=safeKey(data.requestId);
  if(data.kind!=="answer"&&data.kind!=="question") throw new NodeTeachingError("不支持的教学交互。");
  const kind=data.kind; const input=teachingText(data.input,kind==="answer"?"作答":"问题",6000); const exerciseKey=str(data.exerciseKey);
  const claimed=await prisma.$transaction(async tx => {
    const {session,current}=await requireSession(tx,domainId,nodeId,sessionId);
    if(session.status!=="ready") throw new NodeTeachingError("请先完成当前教学框架。",409);
    const {segment,material}=await boundSegment(tx,sessionId,data.segmentId);
    const step=material.steps.find(s => s.key===data.stepKey); if(!step) throw new NodeTeachingError("教学步骤不存在。");
    if(kind==="answer"&&!step.activities.some(a => a.key===exerciseKey)) throw new NodeTeachingError("作答须关联当前思考任务。");
    if(kind==="question"&&exerciseKey&&!step.activities.some(a=>a.key===exerciseKey)) throw new NodeTeachingError("提问引用了未知思考任务。");
    const prior=await tx.teachingInteraction.findFirst({where:{sessionId,requestId}}); const now=new Date();
    if(prior) {
      if(prior.input!==input||prior.kind!==kind||prior.segmentId!==segment.id||prior.stepKey!==step.key||prior.exerciseKey!==exerciseKey) throw new NodeTeachingError("同一请求标识不能改变内容。",409);
      if(prior.status==="complete"||(prior.status==="pending"&&now.getTime()-prior.updatedAt.getTime()<leaseMs)) return null;
      const changed=await tx.teachingInteraction.updateMany({where:{id:prior.id,updatedAt:prior.updatedAt},data:{status:"pending",errorMessage:null,updatedAt:now}});
      return changed.count?{session,context:current.context,segment,material,interaction:{...prior,updatedAt:now}}:null;
    }
    const progress=parse<TeachingProgressV2>(session.progressJson,initialProgress()); const key=activityBinding(segment.id,step.key,exerciseKey);
    const support=progress.support[key];
    const helped=await tx.teachingInteraction.count({where:{sessionId,segmentId:segment.id,stepKey:step.key,exerciseKey,status:"complete"}});
    progress.drafts[kind==="answer"?key:activityBinding(segment.id,step.key,"question")]=input;
    await changeProgress(tx,session,revision,progress);
    const interaction=await tx.teachingInteraction.create({data:{sessionId,requestId,kind,input,exerciseKey,segmentId:segment.id,segmentKey:segment.key,materialVersion:segment.version,stepKey:step.key,assistance:support?.solution?100:Math.max(support?.hints||0,helped?10:0),updatedAt:now}});
    const summary=await persistSummary(tx,sessionId);
    return {session:{...session,progressJson:JSON.stringify(progress),summaryJson:JSON.stringify(summary)},context:current.context,segment,material,interaction};
  });
  if(claimed) {
    const {session,segment,material,interaction,context}=claimed;
    try {
      const snapshot=await view(session,session.contextHash);
      const result=await respondProgressiveTeaching({domainId,context:{...context,sources:parse<SourceFragment[]>(segment.sourceSnapshotJson,[])},framework:JSON.parse(session.lessonJson),material,progress:snapshot.progress,interaction:interactionView(interaction),history:snapshot.interactions.filter(i => i.status==="complete").slice(-6),summary:{taught:snapshot.summary.taught,observations:snapshot.summary.observations.slice(-10),unresolved:snapshot.summary.unresolved.slice(-10)}});
      await prisma.$transaction(async tx=>{
        const {session:active}=await requireSession(tx,domainId,nodeId,sessionId);
        if(active.status!=="ready"||active.sourceRevision!==session.sourceRevision) throw new NodeTeachingError("当前框架或资料已更新，原始输入保留，请在当前教案重试。",409);
        const changed=await tx.teachingInteraction.updateMany({where:{id:interaction.id,status:"pending",updatedAt:interaction.updatedAt},data:{status:"complete",responseJson:JSON.stringify(result.data),aiCallLogId:result.log.id,errorMessage:null}});
        if(changed.count) await persistSummary(tx,sessionId);
      });
    } catch {
      await prisma.teachingInteraction.updateMany({where:{id:interaction.id,status:"pending",updatedAt:interaction.updatedAt},data:{status:"failed",errorMessage:"反馈尚未返回，原始输入已保存，可以重试。"}});
    }
  }
  return getNodeTeaching(domainId,nodeId);
}
export async function addTeachingSource(domainId:string,nodeId:string,value:unknown) {
  const {data,sessionId,revision}=parseTeachingBinding(value); const url=teachingText(data.url,"资料地址",2000);
  await requireSession(prisma,domainId,nodeId,sessionId);
  const source=await fetchTeachingSource(url);
  await prisma.$transaction(async tx => {
    const {session}=await requireSession(tx,domainId,nodeId,sessionId);
    if(!["ready","needs_correction"].includes(session.status)) throw new NodeTeachingError("请完成框架后再更新教学资料。",409);
    if(session.revision!==revision) throw new NodeTeachingError("学习记录已更新，请重新提交资料。",409);
    const existing=await tx.teachingSource.findFirst({where:{sessionId,url}});
    if(existing && !source.fragments.length && parse<SourceFragment[]>(existing.fragmentsJson,[]).length) throw new NodeTeachingError("未能重新提取资料，已保留原片段。请稍后重试。",503);
    const count=await tx.teachingSource.count({where:{sessionId}});
    if(!existing&&count>=20) throw new NodeTeachingError("单课最多保存 20 个来源，请更新已有资料。");
    await saveSource(tx,sessionId,source);
    if(existing?.contentHash!==source.contentHash) await tx.nodeTeachingSession.update({where:{id:session.id},data:{sourceRevision:{increment:1},revision:{increment:1}}});
  });
  return {...await getNodeTeaching(domainId,nodeId),sourceWarning:source.limitation};
}
