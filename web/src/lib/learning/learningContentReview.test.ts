import { describe, expect, it } from "vitest";
import type { LearningMaterial } from "./flexibleTeaching";
import { applyContentFindings, validateFocusedReview } from "./learningContentReview";

const explanation="用错方向，反例就不满足它所针对命题的前提。";
const answer="常值反例中，外层在 0 处的去心极限存在且为 1，所以它满足不了“外层去心极限不存在”这一前提，无法否定逆推方向；它只能否定直接代入。";
const material=():LearningMaterial=>({schemaVersion:4,title:"实际第五部分",summary:"方向比较",limitations:[],steps:[{key:"no-cross-direction",goal:"比较两个命题方向",explanation,example:"实际例子",basis:"derivation",sourceIds:[],activities:[{key:"activity-f76018a2-5a27-4be5-ae4f-01a16100b05e",kind:"comparison",prompt:"比较两个反例针对的命题",answer,criteria:["实际核对依据"],hints:["实际提示"],required:false}]}]});
const finding=(extra:Record<string,unknown>={})=>({target:"material",field:"answer",activityKey:"activity-f76018a2-5a27-4be5-ae4f-01a16100b05e",quote:answer,reason:"结论的否定并非原命题前提",replacement:"本例满足逆推命题的前提及结论，未否定结论，因此不是逆推反例。",...extra});
const report=<T>(findings:T[])=>({verdict:"confirmed_error",summary:"实际引用的理由需要更正",uncertainty:null,findings});

describe("局部核对缺步骤身份只在唯一真实活动下规范",()=>{
    it("真实三次失败的两处更正形状补所属步骤，原解析和文字不变",()=>{
        // 来源于 supplementary-resume 的007：正文已带stepKey，answer只带真实activityKey。
        const candidate=report([{target:"material",field:"explanation",stepKey:"no-cross-direction",quote:explanation,reason:"两种失败理由不同",replacement:"常值反例错用于逆推是未否定结论；另一反例错用于正向才是不满足前提。"},finding()]);
        const raw=JSON.stringify(candidate),parsed=JSON.parse(raw),result=validateFocusedReview(parsed,null,material());
        expect(result.findings[1].stepKey).toBe("no-cross-direction");expect(result.findings[1].replacement).toBe(candidate.findings[1].replacement);
        expect(JSON.stringify(parsed)).toBe(raw);expect(parsed.findings[1]).not.toHaveProperty("stepKey");
        const corrected=applyContentFindings(result,null,material()).material!;
        expect(corrected.steps[0].explanation).toBe(candidate.findings[0].replacement);expect(corrected.steps[0].activities[0].answer).toBe(candidate.findings[1].replacement);
        expect(corrected.steps[0].activities[0].prompt).toBe(material().steps[0].activities[0].prompt);
    });
    it.each(["answer","criteria","hints"])("唯一活动%s字段的逐字引用才能补身份",field=>{
        const m=material(),activity=m.steps[0].activities[0],quote=field==="answer"?activity.answer!:activity[field as "criteria"|"hints"][0];
        expect(validateFocusedReview(report([finding({field,quote,replacement:"独立推导后的更正"})]),null,m).findings[0].stepKey).toBe("no-cross-direction");
    });
    it("活动身份未知仍拒绝",()=>{expect(()=>validateFocusedReview(report([finding({activityKey:"invented"})]),null,material())).toThrow();});
    it("同一步活动身份重复不能按quote猜测",()=>{const m=material();m.steps[0].activities.push({...m.steps[0].activities[0],answer:"另一个活动原文"});expect(()=>validateFocusedReview(report([finding()]),null,m)).toThrow();});
    it("不同步骤复用活动身份也不能推断归属",()=>{const m=material();m.steps.push({...m.steps[0],key:"other-step"});expect(()=>validateFocusedReview(report([finding()]),null,m)).toThrow();});
    it("引用别的字段不能补身份",()=>{expect(()=>validateFocusedReview(report([finding({quote:"实际提示"})]),null,material())).toThrow();});
    it("已经给错stepKey不覆盖为正确步骤",()=>{expect(()=>validateFocusedReview(report([finding({stepKey:"wrong-step"})]),null,material())).toThrow("未知步骤");});
    it.each([null,""])("显式无效步骤%j不视为缺失并猜测",stepKey=>{expect(()=>validateFocusedReview(report([finding({stepKey})]),null,material())).toThrow("未知步骤");});
    it.each(["prompt","definition"])("不可更正字段%s不能借唯一活动放行",field=>{expect(()=>validateFocusedReview(report([finding({field})]),null,material())).toThrow();});
    it("没有活动身份及假引用、原样替换仍被原门拒绝",()=>{
        expect(()=>validateFocusedReview(report([finding({activityKey:undefined})]),null,material())).toThrow();
        expect(()=>validateFocusedReview(report([finding({stepKey:"no-cross-direction",quote:"伪造原文"})]),null,material())).toThrow("真实原文");
        expect(()=>validateFocusedReview(report([finding({replacement:answer})]),null,material())).toThrow("未形成事实更正");
    });
});
