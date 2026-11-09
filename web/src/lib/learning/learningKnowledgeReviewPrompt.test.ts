import { describe, expect, it } from "vitest";
import type { LearningFramework, LearningMaterial } from "./flexibleTeaching";
import { buildLearningKnowledgeReviewPrompt, buildLearningKnowledgeReviewRepair, learningContentFindingDirectory } from "./learningKnowledgeReviewPrompt";

const framework: LearningFramework = {schemaVersion:4,title:"已有安排",purpose:"比较依据",scope:"当前范围",mainIdea:"已有核心解释",prerequisites:[],limitations:[],segments:[{key:"part",title:"已有部分",goal:"已有目标",steps:[{key:"compare",goal:"比较案例",requiredOutput:"none"}]}]};
const material: LearningMaterial = {schemaVersion:4,title:"本次材料",summary:"新增比较说明",limitations:[],steps:[{key:"compare",goal:"比较案例",explanation:"实际新说明",example:"实际新例子",basis:"derivation",sourceIds:["real-fragment"],activities:[{key:"real-activity",kind:"comparison",prompt:"真实活动题目",answer:"未曝光的真实参考回应",criteria:["未曝光的回应依据"],hints:["未曝光的真实提示"],required:false}]}]};
const sources = [{id:"real-fragment",title:"真实资料",url:"pasted:real",location:"实际第二段",contentHash:"actual-hash",text:"实际取得的正文"}];

describe("当次教学文字优先的独立核对提示",()=>{
    it("完整当次材料和实际资料优先于旧框架和上下文",()=>{
        const prompt=buildLearningKnowledgeReviewPrompt({framework,material,sources,context:{history:"旧上下文"}});
        const candidateIndex=prompt.indexOf(JSON.stringify(material)),sourceIndex=prompt.indexOf(JSON.stringify(sources)),frameIndex=prompt.indexOf(JSON.stringify(framework)),contextIndex=prompt.indexOf('"history":"旧上下文"');
        expect(candidateIndex).toBeGreaterThan(-1);expect(sourceIndex).toBeGreaterThan(candidateIndex);expect(frameIndex).toBeGreaterThan(sourceIndex);expect(contextIndex).toBeGreaterThan(frameIndex);
        expect(prompt).toContain("不能以复述已有框架中的正确结论代替检查这些新文字");
        for(const text of ["真实活动题目","未曝光的真实参考回应","未曝光的回应依据","未曝光的真实提示"])expect(prompt).toContain(text);
    });
    it("目录保留实际对象路径与两级活动身份，不改候选",()=>{
        const before=JSON.stringify(material),directory=learningContentFindingDirectory({framework,material});
        expect(directory.material[0]).toMatchObject({path:"material.steps[0]",stepKey:"compare",fields:["explanation","example"]});
        expect(directory.material[0].activities[0]).toEqual({path:"material.steps[0].activities[0]",stepKey:"compare",activityKey:"real-activity",fields:["answer","criteria","hints"]});
        expect(JSON.stringify(material)).toBe(before);
    });
    it("角色核对通用于不同问题，不追加学科责任或全量核实承诺",()=>{
        const prompt=buildLearningKnowledgeReviewPrompt({framework,material,sources});
        expect(prompt).toContain("不能把结论的否定称为该命题前提");expect(prompt).toContain("没有满足前提");expect(prompt).toContain("没有否定结论");
        expect(prompt).toContain("尚未覆盖或证据不足写 uncertainty");expect(prompt).toContain("开放问题没有唯一答案不是错误");expect(prompt).toContain("不宣称全部材料已经核实或权威验证");
        expect(prompt).toContain("不能把前文例子的特殊定义偷渡为本题条件");expect(prompt).toContain("各分支criteria");expect(prompt).toContain("全称、存在和条件命题");expect(prompt).toContain("支持证据不等于单独充分证明");
        expect(prompt).toContain("区分忠实还原原命题的前提/结论角色与逻辑等价或真值");expect(prompt).toContain("不能仅因前件出现结论的否定就宣称条件句恒假、自相矛盾或同一反例失效");
    });
    it("无正文时优先本次核心解释，框架计划仍仅作对照",()=>{
        const prompt=buildLearningKnowledgeReviewPrompt({framework,material:null,sources:[]});
        expect(prompt.indexOf(JSON.stringify({mainIdea:framework.mainIdea}))).toBeLessThan(prompt.indexOf(JSON.stringify(framework)));
        expect(prompt).toContain("framework 只能修 mainIdea");
    });
    it("选中反馈优先实际反馈原文并保留正确interaction定位",()=>{
        const feedback={interactionId:"real-interaction",text:"选中反馈的真实理由"},prompt=buildLearningKnowledgeReviewPrompt({framework,material:null,sources:[],feedback});
        expect(prompt.indexOf(JSON.stringify(feedback))).toBeLessThan(prompt.indexOf(JSON.stringify(framework)));
        expect(learningContentFindingDirectory({framework,material:null,feedback}).feedback).toEqual({target:"feedback",path:"feedback.text",interactionId:"real-interaction",field:"text"});
    });
    it("反馈miniFrame的当次新文字与新材料都优先，不误当旧框架",()=>{
        const prompt=buildLearningKnowledgeReviewPrompt({framework,material,sources,frameworkIsCandidate:true});
        expect(prompt.indexOf(JSON.stringify({mainIdea:framework.mainIdea}))).toBeLessThan(prompt.indexOf(JSON.stringify(sources)));
        expect(prompt).toContain(JSON.stringify(material));expect(prompt).toContain("同为本次发布或更正的真实候选");
    });
    it("交互是只读核对依据，错误归因不能被正确的一般提醒抵消",()=>{
        const currentInteraction={input:"我是在限定条件下提出这个解释。",assistanceAtSubmission:0};
        const before=JSON.stringify(currentInteraction);
        const prompt=buildLearningKnowledgeReviewPrompt({framework,material:null,sources:[],context:{currentInteraction}});
        expect(prompt).toContain("一般知识提醒正确，也不能抵消错误归因");
        expect(prompt).toContain("不能假定用户已经采用了候选反馈中的修正");
        expect(prompt).toContain("参考可能有错，用户质疑可能正确");
        expect(prompt).toContain(JSON.stringify(currentInteraction));
        expect(learningContentFindingDirectory({framework,material:null})).not.toHaveProperty("currentInteraction");
        expect(JSON.stringify(currentInteraction)).toBe(before);
        expect(buildLearningKnowledgeReviewPrompt({framework,material:null,sources:[]})).not.toContain("本次反馈还须核对");
    });
    it("有界修复使用保存候选和真实目录，仅修身份而保留事实更正",()=>{
        const raw='{"verdict":"confirmed_error","findings":[{"activityKey":"real-activity","field":"answer","replacement":"真实更正"}]}';
        const prompt=buildLearningKnowledgeReviewRepair("核对引用了未知步骤。",{rawOutput:raw,parsedOutputJson:raw},{framework,material});
        expect(prompt).toContain(raw);expect(prompt).toContain('"stepKey":"compare","activityKey":"real-activity"');expect(prompt).toContain("必须同时给所属 stepKey 和 activityKey");expect(prompt).toContain("已有正确的错误判断与替换不因缺身份而删除");expect(prompt).toContain("未知或不唯一目标不得猜测");
    });
    it("没有raw时只使用已保存解析候选，不伪造原文",()=>{
        const parsed='{"summary":"实际保存的解析候选"}';
        expect(buildLearningKnowledgeReviewRepair("字段无效",{rawOutput:null,parsedOutputJson:parsed},{framework,material})).toContain(parsed);
        expect(buildLearningKnowledgeReviewRepair("字段无效",null,{framework,material})).toContain("暂无已保存候选");
    });
});
