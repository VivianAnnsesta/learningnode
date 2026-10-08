import {describe,expect,it} from "vitest";
import {buildCourseContentCoverage,currentContentPositions} from "./contentCoverage";
import {dimensions,validateFramework,validateMaterial,publicMaterial,initialProgress,type TeachingView,type SegmentKey} from "./teachingContracts";
import type {CourseContentQuestion,LearningGoal,ConceptProfile,ContentMaterialPosition} from "./roadmapPlanningTypes";
import {scopedSkeletonRepair} from "../ai/generationEvidence";

const question:CourseContentQuestion={key:"cq-equivalents",question:"等价替换表达什么，什么时候适用？",contentRequirements:["提供定义、使用条件和反例说明。"],dimensionKeys:["definition","boundaries"]};
const groups=[{key:"encounter",dimensionKeys:["motivation","significance","role"]},{key:"concept",dimensionKeys:["definition","mechanism","relations"]},{key:"use",dimensionKeys:["use","mechanism"]},{key:"discriminate",dimensionKeys:["boundaries","relations","selection"]},{key:"integrate",dimensionKeys:["role","significance","relations"]}];
const framework=()=>validateFramework({concept:"等价无穷小",scope:"本概念的含义及边界",definition:"稳定的核心说明",runningCase:"用同一个趋近过程组织解释",prerequisites:[],limitations:["内容仍需资料核对"],dimensions:Object.keys(dimensions).map(key=>({key,points:["提供具体解释"],segmentKeys:groups.filter(g=>g.dimensionKeys.includes(key)).map(g=>g.key)})),segments:groups.map(g=>({...g,goal:"提供具体讲解",steps:[{key:`${g.key}-explain`,goal:"提供说明及示范"}]}))},[question]);
function segment(key:SegmentKey,version=1) {
  const material=validateMaterial({key,summary:"本段实际说明的内容",limitations:["资料不足"],steps:[{key:`${key}-explain`,contentQuestionKeys:[question.key],dimensionKeys:groups.find(g=>g.key===key)!.dimensionKeys,explanation:"讲解本概念的相关内容。",example:"给出对应的示范。",summary:"具体的讲解结论",terms:["等价无穷小"],basis:"unverified",sourceIds:[],activities:[{key:`${key}-optional`,kind:"observe",prompt:"可跳过的观察问题",answer:"参考说明",criteria:["接受有依据的其他表达"],hints:["先观察条件"]}]}]},framework(),key,[]);
  return {id:`${key}-${version}`,key,version,status:"ready",staleSources:false,material:publicMaterial(material,`${key}-${version}`,initialProgress())};
}
const node={id:"node-id",key:"equivalents",title:"等价无穷小",stageKey:"limits",planningQuestionKeys:["q-1"]};
const goals:LearningGoal[]=[{key:"methods",description:"学习极限计算方法",contentQuestions:[question]}];
const stages=[{key:"limits",moduleBlueprints:[{key:"m-1",title:"等价替换",goal:"说明替换条件",keyQuestions:[{key:"q-1",contentQuestionKey:question.key,question:question.question,checkableOutcome:"材料说明要求"}]}]}];
const session=(segments:ReturnType<typeof segment>[])=>({id:"session-1",lessonVersion:1,status:"ready",stale:false,historical:false,framework:framework(),segments} as unknown as TeachingView);

describe("content material availability",()=>{
  it("separates planned, partly generated and complete dimension positions",()=>{
    expect(buildCourseContentCoverage(goals,stages,[node])[0].status).toBe("planned");
    const partial=currentContentPositions(session([segment("concept")]),node);
    const entry=buildCourseContentCoverage(goals,stages,[node],partial)[0];
    expect(entry.status).toBe("needs_supplement");expect(entry.missingDimensionKeys).toEqual(["boundaries"]);
    const complete=currentContentPositions(session([segment("concept"),segment("discriminate")]),node);
    expect(buildCourseContentCoverage(goals,stages,[node],complete)[0]).toMatchObject({status:"material_ready",missingDimensionKeys:[]});
    expect(complete[0]).toMatchObject({sessionId:"session-1",lessonVersion:1,materialVersion:1,stepKey:"concept-explain",basis:"unverified"});
  });
  it("ignores stale frameworks, updated sources and superseded failed material",()=>{
    const ready=segment("concept");
    expect(currentContentPositions({...session([ready]),stale:true},node)).toEqual([]);
    expect(currentContentPositions(session([{...ready,staleSources:true}]),node)).toEqual([]);
    const newer={...ready,id:"concept-2",version:2,status:"failed",material:null};
    expect(currentContentPositions(session([ready,newer] as unknown as ReturnType<typeof segment>[]),node)).toEqual([]);
  });
  it("keeps conceptual reuse traceable without inventing another node",()=>{
    const reusedNode={...node,stageKey:"earlier",planningQuestionKeys:["original-question"]};
    const linked=[{...stages[0],conceptModules:[{conceptReferences:[{key:node.key,planningQuestionKeys:["q-1"],problemRole:"补充方法选择中的边界说明"}]}]}];
    expect(buildCourseContentCoverage(goals,linked,[reusedNode])[0].assignments[0].concepts).toEqual([{id:node.id,key:node.key,title:node.title,reused:true}]);
  });
  it("does not credit one concept's material for all the concepts answering a question",()=>{
    const second={...node,id:"second-id",key:"comparison",title:"等价关系"};
    const positions=currentContentPositions(session([segment("concept"),segment("discriminate")]),node);
    const partial=buildCourseContentCoverage(goals,stages,[node,second],positions)[0];
    expect(partial).toMatchObject({status:"needs_supplement",pendingConceptKeys:[second.key],missingDimensionKeys:[]});
    const complete=[...positions,...currentContentPositions(session([segment("concept"),segment("discriminate")]),second)];
    expect(buildCourseContentCoverage(goals,stages,[node,second],complete)[0]).toMatchObject({status:"material_ready",pendingConceptKeys:[]});
  });
  it("keeps an unexpanded arrangement visible even when another module already has material",()=>{
    const linked=[...stages,{...stages[0],key:"later",moduleBlueprints:stages[0].moduleBlueprints.map(m=>({...m,key:"later-module",keyQuestions:m.keyQuestions.map(q=>({...q,key:"later-question"}))}))}];
    const positions=currentContentPositions(session([segment("concept"),segment("discriminate")]),node);
    expect(buildCourseContentCoverage(goals,linked,[node],positions)[0]).toMatchObject({status:"needs_supplement",unexpandedAssignments:[{stageKey:"later",moduleKey:"later-module",planningQuestionKey:"later-question"}]});
  });
  it("rejects material that omits concrete content-question positions",()=>{
    const material=segment("concept").material;
    const steps=material.steps.map(step=>({...step,contentQuestionKeys:[],activities:step.activities.map(activity=>({...activity,answer:"参考说明",criteria:["接受有依据的其他表达"],hints:["先观察条件"]}))}));
    expect(()=>validateMaterial({...material,steps},framework(),"concept",[])).toThrow("定位");
  });
});

describe("scoped initial-skeleton repair",()=>{
  const candidate=()=>({planningVersion:3,contentCoverageVersion:1,learningGoals:goals,title:"课程",stages:[{key:"limits",title:"极限",goal:"说明极限方法",problem:{question:"如何求极限？",steps:["识别形式"]},moduleBlueprints:stages[0].moduleBlueprints},{key:"later",title:"导数",goal:"说明导数",moduleBlueprints:[]}]});
  const issues=[{code:"unknown_content_question",path:"stages[0].moduleBlueprints[0].keyQuestions[0].contentQuestionKey",stageKey:"limits",message:"错误引用"}];
  it("merges only the target stage while preserving course registry and other stages",()=>{
    const original=candidate();const repair=scopedSkeletonRepair(original,issues)!;
    const patched=repair.merge({stage:{...original.stages[0],goal:"补全等价替换的条件说明"}}) as ReturnType<typeof candidate>;
    expect(patched.learningGoals).toBe(original.learningGoals);expect(patched.stages[1]).toBe(original.stages[1]);expect(original.stages[0].goal).toBe("说明极限方法");
    expect(()=>repair.merge({stage:original.stages[0],learningGoals:[]})).toThrow("指定阶段");
    expect(()=>repair.merge({stage:{...original.stages[0],key:"later"}})).toThrow("指定阶段");
  });
  it("does not force registry or multi-stage defects into a single-stage patch",()=>{
    expect(scopedSkeletonRepair(candidate(),[...issues,{code:"invalid_content_question",path:"learningGoals",message:"登记表错误"}])).toBeNull();
    expect(scopedSkeletonRepair(candidate(),[...issues,{...issues[0],stageKey:"later"}])).toBeNull();
  });
});


describe("shared question contributions",()=>{
  const q:CourseContentQuestion={...question,contentRequirements:["解释定义","说明边界"]};
  const sharedGoals=[{...goals[0],contentQuestions:[q]}];
  const owned=(key:string,index:number,dim:"definition"|"boundaries")=>({...node,key,id:key,concept:{name:key,aliases:[],scope:key,problemRole:key,learningUnit:{version:2,newKnowledge:key,assumedKnowledge:[],teachingTasks:[key],example:key,references:[],contentContributions:[{contentQuestionKey:q.key,requirementIndices:[index],dimensionKeys:[dim],contribution:key}]}} as ConceptProfile});
  const a=owned("a",0,"definition"),b=owned("b",1,"boundaries");
  const pos=(n:typeof a,index:number,dim:"definition"|"boundaries"):ContentMaterialPosition=>({contentQuestionKey:q.key,nodeId:n.id,nodeKey:n.key,nodeTitle:n.title,sessionId:"session",lessonVersion:1,segmentId:"segment",segmentKey:"concept",materialVersion:1,stepKey:"step",dimensionKeys:[dim],requirementIndices:[index],basis:"unverified",sourceIds:[]});
  it("combines two partial contributions without requiring either node to repeat the other",()=>{
    expect(buildCourseContentCoverage(sharedGoals,stages,[a,b],[pos(a,0,"definition"),pos(b,1,"boundaries")])[0]).toMatchObject({status:"material_ready",pendingConceptKeys:[],missingDimensionKeys:[],missingRequirementIndices:[]});
    expect(buildCourseContentCoverage(sharedGoals,stages,[a,b],[pos(a,0,"definition")])[0]).toMatchObject({status:"needs_supplement",pendingConceptKeys:["b"],missingDimensionKeys:["boundaries"],missingRequirementIndices:[1]});
  });
  it("does not hide unassigned requirements or count old unscoped material as new contributions",()=>{
    expect(buildCourseContentCoverage(sharedGoals,stages,[a],[pos(a,0,"definition")])[0]).toMatchObject({status:"needs_supplement",unassignedRequirementIndices:[1],unassignedDimensionKeys:["boundaries"]});
    const old=pos(a,0,"definition");delete old.requirementIndices;
    expect(buildCourseContentCoverage(sharedGoals,stages,[a,b],[old,pos(b,1,"boundaries")])[0]).toMatchObject({status:"needs_supplement",pendingConceptKeys:["a"]});
  });
  it("retains a legacy node's original full scope when a later reuse adds an explicit partial responsibility",()=>{
    const legacy={...a,concept:{...a.concept,learningUnit:{...a.concept.learningUnit!,version:1 as const,contentContributions:undefined}}};
    const reused=[{...stages[0],conceptModules:[{conceptReferences:[{key:"a",planningQuestionKeys:["q-1"],problemRole:"再次比较",contentContributions:[{contentQuestionKey:q.key,requirementIndices:[0],dimensionKeys:["definition" as const],contribution:"局部比较"}]}]}]}];
    const coverage=buildCourseContentCoverage(sharedGoals,reused,[legacy],[])[0];
    expect(coverage.assignments[0].concepts[0].contribution?.requirementIndices).toEqual([0,1]);
    expect(coverage.assignments[0].concepts[0].contribution?.dimensionKeys).toEqual(["definition","boundaries"]);
  });
  it("does not count incidental question labels outside confirmed step assignments",()=>{
    const saved=session([segment("concept")]);
    saved.framework!.contentQuestions=[{...q,contentRequirements:[q.contentRequirements[0]],requirementIndices:[0],dimensionKeys:["definition"],contribution:"定义"}];
    saved.framework!.segments[1].steps[0].contentAssignments=[];
    expect(currentContentPositions(saved,a)).toEqual([]);
    saved.framework!.segments[1].steps[0].contentAssignments=[{contentQuestionKey:q.key,dimensionKeys:["definition"]}];
    expect(currentContentPositions(saved,a)[0]).toMatchObject({requirementIndices:[0],dimensionKeys:["definition"]});
  });
});
