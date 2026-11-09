import type { LearningGoal, RoadmapModuleBlueprint, ConceptReference, ConceptProfile, ContentContribution, ContentMaterialPosition, CourseContentCoverage } from "./roadmapPlanningTypes";
import type { TeachingView } from "./teachingContracts";
import type { LearningView } from "./flexibleTeaching";

type CoverageStage={key:string;moduleBlueprints?:RoadmapModuleBlueprint[];conceptModules?:{conceptReferences:ConceptReference[]}[]};
type CoverageNode={key:string;id:string;title:string;stageKey:string;planningQuestionKeys?:string[];concept?:ConceptProfile};
export function latestTeachingSegments<T extends {key:string;version:number}>(segments:T[]){const map=new Map<string,T>();for(const segment of segments)if(!map.has(segment.key)||map.get(segment.key)!.version<segment.version)map.set(segment.key,segment);return [...map.values()];}

/** Content positions mean material exists for an assigned requirement, never verified correctness or learner mastery. */
export function currentContentPositions(value:TeachingView|LearningView|null,node:Pick<CoverageNode,"id"|"key"|"title">):ContentMaterialPosition[]{
 if(!value||!("scopeKey" in value)||value.historical)return [];
 return latestTeachingSegments(value.segments.filter(s=>s.active&&s.status==="ready"&&s.material)).flatMap(segment=>segment.material!.steps.flatMap(step=>(step.contentAssignments||[]).map(a=>({contentQuestionKey:a.contentQuestionKey,nodeId:node.id,nodeKey:node.key,nodeTitle:node.title,sessionId:value.id,lessonVersion:value.lessonVersion,segmentId:segment.id,segmentKey:segment.key,materialVersion:segment.version,stepKey:step.key,dimensionKeys:[],requirementIndices:a.requirementIndices,basis:step.basis,sourceIds:step.sourceIds}))));
}
export function buildCourseContentCoverage(goals:LearningGoal[],stages:CoverageStage[],nodes:CoverageNode[]=[],positions:ContentMaterialPosition[]=[]):CourseContentCoverage[]{
 return goals.flatMap(goal=>(goal.contentQuestions||[]).map(question=>{
  const assignments:CourseContentCoverage["assignments"]=[],contributions=new Map<string,ContentContribution[]>();
  for(const stage of stages)for(const stageModule of stage.moduleBlueprints||[])for(const q of stageModule.keyQuestions){
   if(q.contentQuestionKey!==question.key)continue;
   const concepts=nodes.filter(n=>n.stageKey===stage.key&&n.planningQuestionKeys?.includes(q.key)).map(n=>({key:n.key,id:n.id,title:n.title,reused:false}));
   for(const group of stage.conceptModules||[])for(const ref of group.conceptReferences){if(!ref.planningQuestionKeys.includes(q.key))continue;const n=nodes.find(n=>n.key===ref.key);if(!n)continue;if(!concepts.some(c=>c.key===n.key))concepts.push({key:n.key,id:n.id,title:n.title,reused:true});contributions.set(n.key,[...(contributions.get(n.key)||[]),...(ref.contentContributions||[])]);}
   assignments.push({stageKey:stage.key,moduleKey:stageModule.key,planningQuestionKey:q.key,concepts});
  }
  const scopes=new Map<string,number[]>(),missingContributionConceptKeys:string[]=[];
  for(const key of new Set(assignments.flatMap(a=>a.concepts.map(c=>c.key)))){const n=nodes.find(n=>n.key===key)!;const specific=[...(n.concept?.learningUnit?.contentContributions||[]),...(contributions.get(key)||[])].filter(c=>c.contentQuestionKey===question.key);const indices=[...new Set(specific.flatMap(c=>c.requirementIndices))];if(!indices.length&&n.concept?.learningUnit?.version===2)missingContributionConceptKeys.push(key);scopes.set(key,indices.length?indices:question.contentRequirements.map((_,i)=>i));for(const a of assignments)for(const c of a.concepts)if(c.key===key&&specific.length)c.contribution={requirementIndices:indices,dimensionKeys:[],contribution:specific.map(s=>s.contribution).join("；")};}
  const materials=positions.filter(p=>p.contentQuestionKey===question.key&&scopes.has(p.nodeKey)&&p.requirementIndices?.every(i=>scopes.get(p.nodeKey)!.includes(i)));
  const assigned=new Set([...scopes.values()].flat()),available=new Set(materials.flatMap(p=>p.requirementIndices||[]));
  const missingRequirementIndices=question.contentRequirements.map((_,i)=>i).filter(i=>!available.has(i)),unassignedRequirementIndices=question.contentRequirements.map((_,i)=>i).filter(i=>!assigned.has(i));
  const unexpandedAssignments=assignments.filter(a=>!a.concepts.length).map(({stageKey,moduleKey,planningQuestionKey})=>({stageKey,moduleKey,planningQuestionKey}));
  const pendingConceptKeys=[...scopes].filter(([key,indices])=>indices.some(i=>!materials.some(p=>p.nodeKey===key&&p.requirementIndices?.includes(i)))).map(([key])=>key);
  return{...question,dimensionKeys:[],goalKey:goal.key,status:!missingRequirementIndices.length&&assignments.length?"material_ready":!assignments.length||missingContributionConceptKeys.length||(!unexpandedAssignments.length&&unassignedRequirementIndices.length)?"needs_supplement":"planned",missingDimensionKeys:[],unassignedDimensionKeys:[],missingRequirementIndices,unassignedRequirementIndices,missingContributionConceptKeys,pendingConceptKeys,unexpandedAssignments,assignments,materials};
 }));
}
