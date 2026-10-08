import { describe, expect, it } from "vitest";
import { validateFramework, validateMaterial, publicMaterial, initialProgress, type TeachingContextV2, type TeachingPrerequisite } from "./teachingContracts";
import { correctedKnowledgeFramework, correctKnowledgeMaterial, knowledgeContextFixture, knowledgeResult } from "../ai/teachingKnowledge.fixture";
import { materialKnowledgeTargets, validateFrameworkPatches } from "../ai/teachingKnowledgeReview";

const context: TeachingContextV2 = {...knowledgeContextFixture,
  knowledgeBoundary:{version:1,assumedKnowledge:["高中不等式"],newKnowledge:["极限与夹逼"]},
  prerequisites:[{nodeId:"limit-tools",title:"极限性质",explanation:"使用极限工具",scope:"包括夹逼",userUnderstanding:null,
    learningUnit:{version:2,newKnowledge:"夹逼准则",assumedKnowledge:["高中不等式"],teachingTasks:["解释夹逼条件及结论"],example:"两侧同极限",references:[],contentContributions:[]}}]};
const prerequisite: TeachingPrerequisite = {key:"squeeze",knowledge:"夹逼准则",requiredFor:"由两侧同极限推出中间量的极限",source:"node",sourceKey:"limit-tools",useStepKeys:["encounter-step"],support:"前置实际教学任务解释夹逼的条件与结论。"};
const candidate = (plan: TeachingPrerequisite[] = [prerequisite]) => ({...structuredClone(correctedKnowledgeFramework),prerequisitePlan:structuredClone(plan)});

describe("prerequisite continuity with freely entered steps",()=>{
  it("accepts co-taught knowledge without a concept-count gate and preserves a real provision",()=>{
    const frame=validateFramework({...candidate(),concept:"极限性质与重要极限",scope:"在一起解释条件、区别与使用"},undefined,context);
    expect(frame.prerequisitePlan).toEqual([prerequisite]);
    expect(validateFramework(JSON.parse(JSON.stringify(frame)))).toEqual(frame);
  });
  it("requires a plan for fresh generation, while reading legacy frameworks remains lossless",()=>{
    expect(()=>validateFramework(correctedKnowledgeFramework,undefined,context)).toThrow("prerequisitePlan");
    expect(validateFramework(correctedKnowledgeFramework)).toEqual(correctedKnowledgeFramework);
    expect(validateFramework(candidate([]),undefined,context).prerequisitePlan).toEqual([]);
  });
  it("cannot label new calculus knowledge as an assumed high-school foundation",()=>{
    expect(()=>validateFramework(candidate([{...prerequisite,source:"foundation",sourceKey:"夹逼准则"}]),undefined,context)).toThrow("不能冒充基础");
    expect(validateFramework(candidate([{...prerequisite,source:"foundation",sourceKey:"高中不等式"}]),undefined,context).prerequisitePlan).toHaveLength(1);
  });
  it("rejects an undeclared node, an unknown use and a forward or self step reference",()=>{
    expect(()=>validateFramework(candidate([{...prerequisite,sourceKey:"unrelated-node"}]),undefined,context)).toThrow("显式前置");
    expect(()=>validateFramework(candidate([{...prerequisite,useStepKeys:["missing"]}]),undefined,context)).toThrow("使用步骤");
    for(const sourceKey of ["concept-step","encounter-step"]) expect(()=>validateFramework(candidate([{...prerequisite,source:"step",sourceKey}]),undefined,context)).toThrow("早于");
    expect(validateFramework(candidate([{...prerequisite,source:"step",sourceKey:"concept-step",useStepKeys:["use-step"]}]),undefined,context).prerequisitePlan).toHaveLength(1);
  });
  it("requires usable support at the actual use even when the prerequisite source is valid",()=>{
    const frame=validateFramework(candidate(),undefined,context);
    expect(()=>validateMaterial(correctKnowledgeMaterial,frame,"encounter",[])).toThrow("使用前尚未说明");
    const material=structuredClone(correctKnowledgeMaterial);
    material.steps[0].prerequisiteSupport=[{prerequisiteKey:"squeeze",explanation:"当中间量被两侧夹住，且两侧趋于同一值时，中间量也趋于该值；中间量收敛是结论。"}];
    const validated=validateMaterial(material,frame,"encounter",[]);
    expect(publicMaterial(validated,"segment",initialProgress()).steps[0].prerequisiteSupport).toEqual(material.steps[0].prerequisiteSupport);
    expect(materialKnowledgeTargets(validated).find(t=>t.key==="material:encounter-step")?.content).toHaveProperty("prerequisiteSupport");
    expect(publicMaterial(validated,"segment",initialProgress()).steps[0].activities[0].solution).toBeNull();
    material.steps[0].prerequisiteSupport[0].prerequisiteKey="outside-plan";
    expect(()=>validateMaterial(material,frame,"encounter",[])).toThrow("未安排在本步");
  });
  it("allows agreed foundations without compulsory reteaching and preserves inline-before-use support",()=>{
    const foundation=validateFramework(candidate([{...prerequisite,source:"foundation",sourceKey:"高中不等式"}]),undefined,context);
    expect(validateMaterial(correctKnowledgeMaterial,foundation,"encounter",[]).steps[0].prerequisiteSupport).toEqual([]);
    const inline=validateFramework(candidate([{...prerequisite,source:"inline",sourceKey:null}]),undefined,context);
    expect(()=>validateMaterial(correctKnowledgeMaterial,inline,"encounter",[])).toThrow("使用前尚未说明");
  });
  it("corrects factual prerequisite wording without changing its identity, dependency or usage locations",()=>{
    const frame=validateFramework(candidate(),undefined,context);
    const review=knowledgeResult(frame,context,["prerequisite_squeeze"]);
    const fixed=validateFrameworkPatches({patches:[{targetKey:"prerequisite_squeeze",findingKeys:["prerequisite_squeeze"],reason:"明确使用条件",value:{knowledge:prerequisite.knowledge,requiredFor:prerequisite.requiredFor,support:"须在所讨论过程最终成立夹住关系，且两侧存在相同的有限极限。"}}]},frame,review).framework;
    expect(fixed.prerequisitePlan![0]).toMatchObject({key:"squeeze",source:"node",sourceKey:"limit-tools",useStepKeys:["encounter-step"]});
    expect(fixed.prerequisitePlan![0].support).not.toBe(prerequisite.support);
  });
});
