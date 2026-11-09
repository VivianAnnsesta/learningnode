// Node routes are context adapters for the same engine used by independent exploration.
import { randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import { teachingObject, NodeTeachingError } from "./nodeTeaching";
import { createLearningSession, loadLearningSession, learningView, prepareLearningSession, prepareLearningSegment, saveLearningProgress, submitLearningInteraction, addLearningSource } from "./learningSessionService";
export async function getNodeTeaching(domainId:string,nodeId:string,selectedId?:string){
 if(!await prisma.learningNode.findFirst({where:{id:nodeId,domainId}}))throw new NodeTeachingError("节点不属于当前领域。",404);
 if(selectedId)return{session:await learningView(await loadLearningSession(selectedId,domainId,nodeId))};
 const s=await prisma.nodeTeachingSession.findUnique({where:{scopeKey:`node:${nodeId}`}})||await prisma.nodeTeachingSession.findFirst({where:{domainId,nodeId},orderBy:{createdAt:"desc"}});
 return{session:s?await learningView(s):null};
}
export async function prepareNodeTeaching(domainId:string,nodeId:string,value:unknown={}){const d=teachingObject(value);const created=await createLearningSession({...d,domainId,nodeId,requestId:d.requestId||randomUUID()});return prepareLearningSession(created.session.id,{...d,revision:d.revision??created.session.revision,requestId:d.requestId||randomUUID()});}
export async function prepareTeachingSegment(domainId:string,nodeId:string,key:string,value:unknown){const d=teachingObject(value);const s=await loadLearningSession(String(d.sessionId),domainId,nodeId);return prepareLearningSegment(s.id,key,d);}
export async function saveNodeTeachingProgress(domainId:string,nodeId:string,value:unknown){const d=teachingObject(value);const s=await loadLearningSession(String(d.sessionId),domainId,nodeId);return saveLearningProgress(s.id,d);}
export async function submitTeachingInteraction(domainId:string,nodeId:string,value:unknown){const d=teachingObject(value);const s=await loadLearningSession(String(d.sessionId),domainId,nodeId);return submitLearningInteraction(s.id,d);}
export async function addTeachingSource(domainId:string,nodeId:string,value:unknown){const d=teachingObject(value);const s=await loadLearningSession(String(d.sessionId),domainId,nodeId);return addLearningSource(s.id,d);}
