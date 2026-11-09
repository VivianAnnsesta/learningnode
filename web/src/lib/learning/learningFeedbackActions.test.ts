import { describe, expect, it } from "vitest";
import { buildLearningFeedbackRepair, learningFeedbackActionInstructions, pendingLearningFeedbackPlans, savedLearningSegmentPlan, validateLearningFeedbackReply, type LearningFeedbackActionContext } from "./learningFeedbackActions";
import type { LearningFramework } from "./flexibleTeaching";

const frame: LearningFramework = {schemaVersion:4,title:"条件比较",purpose:"区分前提",scope:"当前问题",mainIdea:"按前提判断结论",prerequisites:[],limitations:[],segments:[
    {key:"current-part",title:"当前部分",goal:"判断条件",steps:[{key:"current-step",goal:"说明依据",requiredOutput:"attempt"}]},
    {key:"future-part",title:"后续对照",goal:"比较不同方向",steps:[{key:"future-step",goal:"比较前提",requiredOutput:"none"}]}
]};
const context: LearningFeedbackActionContext = {targets:[{segmentId:"actual-segment",stepKey:"current-step",exerciseKey:"actual-activity",materialVersion:2}],pendingPlans:pendingLearningFeedbackPlans(frame,["current-part"]),nodeIds:["real-node"]};
const reply = (stepKey = "future-part", extras = {}) => ({text:"你的条件分析成立，继续比较另一种前提。",observation:"按当前前提解释了结论",uncertainty:null,verdict:"correct",action:{type:"step",reason:"后续进行方向对照",segmentId:"actual-segment",materialVersion:2,stepKey,...extras}});

describe("反馈计划身份与实际步骤边界",()=>{
    it("真实未生成框架部分只形成 continue，正文和原始候选保留",()=>{const raw=reply(),snapshot=JSON.stringify(raw);const result=validateLearningFeedbackReply(raw,context,true);expect(result.action).toEqual({type:"continue",reason:raw.action.reason});expect(result.text).toBe(raw.text);expect(result.verdict).toBe("correct");expect(JSON.stringify(raw)).toBe(snapshot);});
    it("尚未生成的计划步骤同样只是后续说明",()=>{expect(validateLearningFeedbackReply(reply("future-step"),context,true).action.type).toBe("continue");});
    it("实际已保存步骤保留可执行身份",()=>{expect(validateLearningFeedbackReply(reply("current-step"),context,true).action).toEqual({type:"step",reason:"后续进行方向对照",segmentId:"actual-segment",stepKey:"current-step",materialVersion:2});});
    it.each([{segmentId:"fabricated"},{materialVersion:1},{materialVersion:undefined}])("计划建议不能借伪造或缺失版本成为合法动作 %j",extras=>{expect(()=>validateLearningFeedbackReply(reply("future-part",extras),context,true)).toThrow("不存在的步骤");});
    it("未知步骤与框架中已生成部分 key 不规范成 continue",()=>{expect(()=>validateLearningFeedbackReply(reply("invented-step"),context,true)).toThrow("不存在的步骤");expect(()=>validateLearningFeedbackReply(reply("current-part"),context,true)).toThrow("不存在的步骤");});
    it("伪造节点和新活动仍通过原严格行动校验",()=>{expect(()=>validateLearningFeedbackReply({...reply(),action:{type:"node",reason:"进入",nodeId:"fake"}},context,true)).toThrow();expect(()=>validateLearningFeedbackReply({...reply(),newActivity:{title:"新活动"}},context,true)).toThrow("不存在的步骤");});
    it("已生成步骤优先于相同文字的后续计划 key",()=>{const collision={...context,pendingPlans:[{key:"current-step",title:"同名计划",stepKeys:[]}]};expect(validateLearningFeedbackReply(reply("current-step"),collision,true).action.type).toBe("step");});
    it("包装返回规范后仍校验作答结论，不靠删除结论通过",()=>{expect(validateLearningFeedbackReply({type:"json_object",content:reply()},context,true).action.type).toBe("continue");expect(()=>validateLearningFeedbackReply({...reply(),verdict:null},context,true)).toThrow();});
    it("生成和修复提示使用真实目录与保存原文，要求保留正确反馈",()=>{const raw=JSON.stringify(reply("unknown")),prompt=buildLearningFeedbackRepair("不存在的步骤",{rawOutput:raw,parsedOutputJson:raw},context);expect(prompt).toContain(raw);expect(prompt).toContain("actual-segment");expect(prompt).toContain("future-part");expect(prompt).toContain("保留没有涉及错误的 text、observation、verdict");expect(prompt).toContain('action.type="continue"');expect(learningFeedbackActionInstructions(context)).toContain("不能将当前 segmentId 搭配另一框架部分 key");});
});

describe("保存材料的产出承诺按对应框架版本恢复",()=>{
    it("当前材料匹配当前框架，旧材料匹配历史框架",()=>{const newFrame={...frame,segments:frame.segments.map(s=>({...s,steps:s.steps.map(step=>({...step,requiredOutput:"none" as const}))}))};expect(savedLearningSegmentPlan(newFrame,2,"l2--current-part",[])?.steps[0].requiredOutput).toBe("none");expect(savedLearningSegmentPlan(newFrame,2,"l1--current-part",[{lessonVersion:1,framework:frame}])?.steps[0].requiredOutput).toBe("attempt");});
    it("未知版本、反馈动态段和旧格式框架不会继承新承诺",()=>{expect(savedLearningSegmentPlan(frame,2,"l1--current-part",[])).toBeUndefined();expect(savedLearningSegmentPlan(frame,2,"feedback-interaction",[])).toBeUndefined();expect(savedLearningSegmentPlan(frame,2,"l1--current-part",[{lessonVersion:1,framework:{schemaVersion:3,segments:frame.segments}}])).toBeUndefined();});
});
