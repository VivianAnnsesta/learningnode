import type {LearningGoal, RoadmapModuleBlueprint, ConceptReference, ConceptProfile, ContentContribution, ContentMaterialPosition, CourseContentCoverage} from "./roadmapPlanningTypes";
import type {TeachingView} from "./teachingContracts";
import {scopedContentQuestions} from "./curriculumBoundary";

type CoverageStage = {key:string;moduleBlueprints?:RoadmapModuleBlueprint[];conceptModules?:{conceptReferences:ConceptReference[]}[]};
type CoverageNode = {key:string;id:string;title:string;stageKey:string;planningQuestionKeys?:string[];concept?:ConceptProfile};

export function latestTeachingSegments(segments:TeachingView["segments"]) {
  const latest=new Map<string,TeachingView["segments"][number]>();
  for(const segment of segments) if(!latest.has(segment.key)||latest.get(segment.key)!.version<segment.version) latest.set(segment.key,segment);
  return [...latest.values()];
}

export function currentContentPositions(session:TeachingView|null,node:Pick<CoverageNode,"id"|"key"|"title">):ContentMaterialPosition[] {
  if(!session || session.status!=="ready" || session.stale || session.historical || !session.framework?.contentQuestions?.length) return [];
  const positions:ContentMaterialPosition[]=[];
  for(const segment of latestTeachingSegments(session.segments)) {
    if(segment.status!=="ready" || segment.staleSources || !segment.material) continue;
    const segmentPlan=session.framework.segments.find(plan=>plan.key===segment.key);
    for(const step of segment.material.steps) for(const key of step.contentQuestionKeys || []) {
      const question=session.framework.contentQuestions.find(q=>q.key===key);
      if(!question) continue;
      const scoped=question.requirementIndices!==undefined;
      const assignedDimensions=segmentPlan?.steps.find(plan=>plan.key===step.key)?.contentAssignments?.find(assignment=>assignment.contentQuestionKey===key)?.dimensionKeys;
      const dimensionKeys=step.dimensionKeys.filter(d=>question.dimensionKeys.includes(d) && (!scoped || assignedDimensions?.includes(d)));
      if(!dimensionKeys.length) continue;
      positions.push({contentQuestionKey:key,nodeId:node.id,nodeKey:node.key,nodeTitle:node.title,sessionId:session.id,lessonVersion:session.lessonVersion,segmentId:segment.id,segmentKey:segment.key,materialVersion:segment.version,stepKey:step.key,dimensionKeys,...(scoped?{requirementIndices:[...question.requirementIndices!],contribution:question.contribution}:{}),basis:step.basis,sourceIds:step.sourceIds});
    }
  }
  return positions;
}

function sameIndices(actual:number[]|undefined,expected:number[]) {
  return actual!==undefined && actual.length===expected.length && expected.every(index=>actual.includes(index));
}

export function buildCourseContentCoverage(goals:LearningGoal[],stages:CoverageStage[],nodes:CoverageNode[]=[],positions:ContentMaterialPosition[]=[]):CourseContentCoverage[] {
  const nodeByKey=new Map(nodes.map(node=>[node.key,node]));
  return goals.flatMap(goal=>(goal.contentQuestions || []).map(question=>{
    const assignments:CourseContentCoverage["assignments"]=[];
    const extraContributions=new Map<string,ContentContribution[]>();
    const legacyAssignments=new Set<string>();
    for(const stage of stages) for(const stageModule of stage.moduleBlueprints || []) for(const q of stageModule.keyQuestions) {
      if(q.contentQuestionKey!==question.key) continue;
      const concepts=nodes.filter(node=>node.stageKey===stage.key && node.planningQuestionKeys?.includes(q.key)).map(node=>({key:node.key,id:node.id,title:node.title,reused:false}));
      for(const concept of concepts) if(nodeByKey.get(concept.key)?.concept?.learningUnit?.version!==2) legacyAssignments.add(concept.key);
      for(const group of stage.conceptModules || []) for(const ref of group.conceptReferences) {
        if(!ref.planningQuestionKeys.includes(q.key)) continue;
        const node=nodeByKey.get(ref.key);
        if(!node) continue;
        if(!concepts.some(c=>c.key===node.key)) concepts.push({key:node.key,id:node.id,title:node.title,reused:true});
        if(ref.contentContributions===undefined && node.concept?.learningUnit?.version!==2) legacyAssignments.add(node.key);
        const contributions=(ref.contentContributions || []).filter(contribution=>contribution.contentQuestionKey===question.key);
        if(contributions.length) extraContributions.set(node.key,[...(extraContributions.get(node.key) || []),...contributions]);
      }
      assignments.push({stageKey:stage.key,moduleKey:stageModule.key,planningQuestionKey:q.key,concepts});
    }

    const arrangedNodes=new Set(assignments.flatMap(a=>a.concepts.map(c=>c.key)));
    const scopes=new Map([...arrangedNodes].map(key=>{
      const unit=nodeByKey.get(key)?.concept?.learningUnit;
      const contributions=[...(unit?.version===2?unit.contentContributions || []:[]),...(extraContributions.get(key) || [])];
      const modern=unit?.version===2 || contributions.length>0;
      if(modern && legacyAssignments.has(key)) contributions.push({contentQuestionKey:question.key,requirementIndices:question.contentRequirements.map((_,index)=>index),dimensionKeys:question.dimensionKeys,contribution:"保留已确认旧节点的整问题教学范围。"});
      const scope=modern?scopedContentQuestions([question],contributions)[0]:question;
      return [key,{modern,scope}] as const;
    }));
    for(const assignment of assignments) for(const concept of assignment.concepts) {
      const scope=scopes.get(concept.key)!;
      if(scope.modern && scope.scope) concept.contribution={requirementIndices:scope.scope.requirementIndices!,dimensionKeys:scope.scope.dimensionKeys,contribution:scope.scope.contribution || ""};
    }

    // Positions keep the scope saved with their framework. Legacy material cannot
    // silently become evidence for a later, explicitly assigned contribution.
    const materials=positions.filter(position=>{
      if(position.contentQuestionKey!==question.key) return false;
      const scope=scopes.get(position.nodeKey);
      return scope?.scope && (!scope.modern || sameIndices(position.requirementIndices,scope.scope.requirementIndices!));
    });
    const missingContributionConceptKeys=[...scopes].filter(([,scope])=>!scope.scope).map(([key])=>key);
    const assignedDimensions=new Set([...scopes.values()].flatMap(({scope})=>scope?.dimensionKeys || []));
    const assignedRequirements=new Set([...scopes.values()].flatMap(({scope})=>scope?(scope.requirementIndices || question.contentRequirements.map((_,index)=>index)):[]));
    const availableDimensions=new Set(materials.flatMap(position=>position.dimensionKeys));
    const availableRequirements=new Set<number>();
    const pendingConceptKeys:string[]=[];
    for(const [key,{scope,modern}] of scopes) {
      if(!scope) { pendingConceptKeys.push(key); continue; }
      const ownMaterials=materials.filter(position=>position.nodeKey===key);
      const ownDimensions=new Set(ownMaterials.flatMap(position=>position.dimensionKeys));
      const requiredIndices=scope.requirementIndices || question.contentRequirements.map((_,index)=>index);
      const completedRequirements=requiredIndices.filter(index=>{
        const dimensions=new Set(ownMaterials.filter(position=>!modern || position.requirementIndices?.includes(index)).flatMap(position=>position.dimensionKeys));
        return scope.dimensionKeys.every(dimension=>dimensions.has(dimension));
      });
      completedRequirements.forEach(index=>availableRequirements.add(index));
      if(scope.dimensionKeys.some(dimension=>!ownDimensions.has(dimension)) || completedRequirements.length!==requiredIndices.length) pendingConceptKeys.push(key);
    }
    const unexpandedAssignments=assignments.filter(assignment=>!assignment.concepts.length).map(({stageKey,moduleKey,planningQuestionKey})=>({stageKey,moduleKey,planningQuestionKey}));
    const missingDimensionKeys=question.dimensionKeys.filter(key=>!availableDimensions.has(key));
    const missingRequirementIndices=question.contentRequirements.map((_,index)=>index).filter(index=>!availableRequirements.has(index));
    const unassignedDimensionKeys=question.dimensionKeys.filter(key=>!assignedDimensions.has(key));
    const unassignedRequirementIndices=question.contentRequirements.map((_,index)=>index).filter(index=>!assignedRequirements.has(index));
    const complete=assignments.length>0 && !unexpandedAssignments.length && !pendingConceptKeys.length && !missingDimensionKeys.length && !missingRequirementIndices.length && !unassignedDimensionKeys.length && !unassignedRequirementIndices.length;
    const planningGap=missingContributionConceptKeys.length || (!unexpandedAssignments.length && (unassignedDimensionKeys.length || unassignedRequirementIndices.length));
    return {
      ...question,goalKey:goal.key,
      status:complete?"material_ready":materials.length || !assignments.length || planningGap?"needs_supplement":"planned",
      missingDimensionKeys,missingRequirementIndices,unassignedDimensionKeys,unassignedRequirementIndices,missingContributionConceptKeys,pendingConceptKeys,unexpandedAssignments,assignments,materials
    };
  }));
}
