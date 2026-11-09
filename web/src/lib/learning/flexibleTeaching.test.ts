import {describe,it,expect} from 'vitest';
import {emptyLearningProgress,exposureKey,publicLearningMaterial,publicLearningReply,validateLearningFramework,validateLearningMaterial,validateLearningReply,type LearningFramework,type LearningMaterial,type LearningReply} from './flexibleTeaching';
import {publicContentReview} from './learningContentReview';
const material:LearningMaterial={schemaVersion:4,title:'比较',summary:'只展示题目',limitations:[],steps:[{key:'s',goal:'自己尝试',explanation:'必要背景',example:'',basis:'derivation',sourceIds:[],activities:[{key:'e',kind:'comparison',prompt:'怎样判断边界？',answer:'私有参考结论',criteria:['私有判据包含参考结果'],hints:['先看条件'],required:false}]}]};
describe('用户明确请求前的参考内容隔离',()=>{
  it('核对摘要、理由和判据更正也不会提前公开未请求的解答',()=>{expect(JSON.stringify(publicContentReview({status:'complete',summary:'私有参考结论',uncertainty:'私有参考结论',findings:[{target:'material',field:'criteria',reason:'私有参考结论',quote:'私有参考结论',replacement:'私有参考结论'}]}))).not.toContain('私有参考结论');});
  it('首次读取不通过评价判据提前公开答案，提示和完整回应分别请求',()=>{const p=emptyLearningProgress(),key=exposureKey('m',1,'s','e');expect(JSON.stringify(publicLearningMaterial(material,'m',1,p))).not.toContain('私有');p.exposures[key]={hints:1,solution:false};expect(publicLearningMaterial(material,'m',1,p).steps[0].activities[0].visibleHints).toEqual(['先看条件']);expect(publicLearningMaterial(material,'m',1,p).steps[0].activities[0].criteria).toBeUndefined();p.exposures[key].solution=true;expect(publicLearningMaterial(material,'m',1,p).steps[0].activities[0]).toMatchObject({solution:'私有参考结论',criteria:['私有判据包含参考结果']});});
  it('已有活动的服务端附加依据不会作为执行动作回传',()=>{const allowed=[{segmentId:'m',stepKey:'s',exerciseKey:'e',materialVersion:1,criteria:['私有判据'],prompt:'原问题'}];const reply=validateLearningReply({text:'继续比较',action:{type:'activity',reason:'适合当前困难',...allowed[0]}},allowed,[],false);expect(reply.action).toEqual({type:'activity',reason:'适合当前困难',segmentId:'m',stepKey:'s',exerciseKey:'e',materialVersion:1});});
  it('迟到反馈和历史返回中未发布的候选参考答案不进入客户端',()=>{const reply={text:'材料已换版',observation:'本次观察',uncertainty:'请回看',verdict:null,action:{type:'clarify',reason:'不要串题',criteria:['旧私有判据']},newActivity:{title:'未发布题',explanation:'草稿',activity:material.steps[0].activities[0]}} as LearningReply;expect(JSON.stringify(publicLearningReply(reply))).not.toContain('私有');expect(publicLearningReply(reply)?.newActivity).toBeUndefined();});
});

describe('框架是活动产出要求的唯一依据',()=>{
  const plan=(requiredOutput: 'none'|'attempt'|'record'):LearningFramework['segments'][number]=>({key:'part',title:'比较',goal:'核对条件',steps:[{key:'s',goal:'框架中已展示的目标',requiredOutput}]});
  const candidate=()=>{const draft=structuredClone(material);draft.steps[0].activities[0].required=true;return draft;};
  it.each(['none','record'] as const)('%s 步骤不能通过后续正文新增必须作答',requiredOutput=>{
    const raw=candidate(),before=JSON.stringify(raw);
    const parsed=validateLearningMaterial(raw,plan(requiredOutput),[]);
    expect(parsed.steps[0].activities[0].required).toBe(false);
    expect(parsed.steps[0].goal).toBe('框架中已展示的目标');
    expect(JSON.stringify(raw)).toBe(before);
    expect(parsed.steps[0].activities[0].prompt).toBe(raw.steps[0].activities[0].prompt);
  });
  it('attempt 保留实际必需活动，不能凭空增加练习或降为可选',()=>{
    const parsed=validateLearningMaterial(candidate(),plan('attempt'),[]);
    expect(parsed.steps[0].activities[0].required).toBe(true);
    const noRequired=candidate();noRequired.steps[0].activities[0].required=false;
    expect(()=>validateLearningMaterial(noRequired,plan('attempt'),[])).toThrow('缺少对应活动');
    const noActivities=candidate();noActivities.steps[0].activities=[];
    expect(()=>validateLearningMaterial(noActivities,plan('attempt'),[])).toThrow('缺少对应活动');
  });
  it.each(['none','record'] as const)('旧正文的 required=true 按绑定 %s 框架显示，原文与曝光不改',requiredOutput=>{
    const saved=candidate(),progress=emptyLearningProgress();
    progress.exposures[exposureKey('old-material',1,'s','e')]={hints:1,solution:false};
    const before={saved:JSON.stringify(saved),progress:JSON.stringify(progress)};
    const published=publicLearningMaterial(saved,'old-material',1,progress,plan(requiredOutput));
    expect(published.steps[0].activities[0]).toMatchObject({required:false,visibleHints:['先看条件'],solution:null});
    expect(JSON.stringify(published)).not.toContain('私有');
    expect(JSON.stringify(saved)).toBe(before.saved);
    expect(JSON.stringify(progress)).toBe(before.progress);
  });
  it('对应旧框架仍是 attempt 时保留真实必需标志，不以未知框架补造承诺',()=>{
    const saved=candidate(),progress=emptyLearningProgress();
    expect(publicLearningMaterial(saved,'old-material',1,progress,plan('attempt')).steps[0].activities[0].required).toBe(true);
    expect(publicLearningMaterial(saved,'old-material',1,progress).steps[0].activities[0].required).toBe(false);
    const otherPlan=plan('attempt');otherPlan.steps[0].key='other-step';
    expect(publicLearningMaterial(saved,'old-material',1,progress,otherPlan).steps[0].activities[0].required).toBe(false);
  });
});

describe('可选产出的生成别名不增加完成状态',()=>{
  const frame=(requiredOutput:unknown)=>({title:'理解一个问题',purpose:'从观察解释',scope:'当前问题',mainIdea:'当前核心解释',prerequisites:[],limitations:[],segments:[{key:'part',title:'阅读',goal:'说明条件',steps:[{key:'step',goal:'阅读和讨论',requiredOutput,contentAssignments:[] as {contentQuestionKey:string;requirementIndices:number[]}[]}]}]});
  it('三次真实失败的optional语义规范为none，原候选不变',()=>{
    const raw=frame('optional'),before=JSON.stringify(raw),normalized=validateLearningFramework(raw);
    expect(normalized.segments[0].steps[0].requiredOutput).toBe('none');expect(JSON.stringify(raw)).toBe(before);
    expect(normalized.segments[0].steps[0].goal).toBe('阅读和讨论');
  });
  it.each(['mandatory','quiz','mastered'])('未知产出%s仍拒绝，不猜测应如何完成',value=>{
    expect(()=>validateLearningFramework(frame(value))).toThrow('任务产出要求无效');
  });
  it('别名不绕过课程范围与责任覆盖',()=>{
    const raw=frame('optional');raw.segments[0].steps[0].contentAssignments=[{contentQuestionKey:'invented',requirementIndices:[0]}];
    expect(()=>validateLearningFramework(raw,[{key:'real',question:'当前问题',importance:'required',contentRequirements:['实际责任'],dimensionKeys:[],requirementIndices:[0],contribution:'支持目标'}])).toThrow('未分配');
  });
});
