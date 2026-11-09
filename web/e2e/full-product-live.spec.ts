import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
test.beforeEach(({page},info)=>{
  test.skip(process.env.E2E_LIVE_AI !== '1','需要显式启用现有配置的真实模型');
  test.setTimeout(1200000);
  page.setDefaultTimeout(30000);
  page.on('response',async r=>{if(r.url().includes('/api/')&&!/settings|ai-config/.test(r.url()))try{await info.attach(`${r.request().method()} ${new URL(r.url()).pathname}`,{body:JSON.stringify({status:r.status(),input:r.request().postData(),output:await r.json()},null,2),contentType:'application/json'});}catch{}});
});
test.afterAll(async()=>db.$disconnect());
test('真实模型：仅名称和目标完成路线确认、阶段展开与分段学习',async({page})=>{
  if(process.env.E2E_RESUME_DOMAIN) {
    await test.info().attach('恢复范围',{body:'本次复制保留的隔离测试库，只重试失败的阶段展开。不是重新规划，也不是从空白开始的证据。',contentType:'text/plain'});
    await page.goto(`/learning/domains/${process.env.E2E_RESUME_DOMAIN}`);
  } else {
  await page.goto('/learning/domains/new');
  await page.getByLabel('领域名称').fill('考研数学微积分');
  await page.getByLabel('学习目标',{exact:true}).fill('从高中函数与代数基础出发，学习考研数学的极限、导数和积分。能说明条件、正确使用方法，并用导数与函数图像判断 x³−3x=a 的不同实根数量。暂不学多元微积分。');
  const result=page.waitForResponse(r=>r.url().endsWith('/planning')&&r.request().method()==='POST',{timeout:1100000});
  await page.getByRole('button',{name:'AI 规划路线',exact:true}).click();
  const response=await result;expect(response.ok()).toBeTruthy();const body=await response.json();expect(body.error||'').toBe('');
  await expect(page.getByRole('heading',{name:'完整路线安排'})).toBeVisible({timeout:30000});
  await expect(page.getByRole('button',{name:'接受这份路线并开始学习'})).toBeEnabled({timeout:30000});
  await page.getByRole('button',{name:'接受这份路线并开始学习'}).click();
  await expect(page).toHaveURL(/learning\/domains\/[^/?]+$/,{timeout:30000});
  }
  const id=page.url().split('/').at(-1)!;const domain=await db.domain.findUniqueOrThrow({where:{id},include:{units:true}});
  expect(domain.mapRevision).toBe(1);expect(domain.units.length).toBeGreaterThan(0);
  await page.screenshot({path:test.info().outputPath('confirmed-route.png'),fullPage:true});
  const expansion=page.waitForResponse(r=>r.url().endsWith('/map/ai-draft')&&r.request().method()==='POST',{timeout:360000});
  await page.getByRole('button',{name:'展开这个 Stage',exact:true}).first().click();
  const expanded=await expansion;expect(expanded.ok()).toBeTruthy();
  const confirm=page.getByRole('button',{name:'确认并进入第一个学习节点',exact:true});await expect(confirm).toBeEnabled({timeout:30000});await confirm.click();
  await expect(page).toHaveURL(/\/items\//,{timeout:30000});
  const frameResponse=page.waitForResponse(r=>r.url().endsWith('/prepare')&&r.request().method()==='POST',{timeout:240000});await page.getByRole('button',{name:'准备教学',exact:true}).click();const frame=await (await frameResponse).json();expect(frame.session.status,frame.session.error).toBe('ready');expect(frame.session.framework.segments.length).toBeGreaterThan(0);
  const first=frame.session.framework.segments[0];const segmentResponse=page.waitForResponse(r=>r.url().endsWith(`/segments/${first.key}`)&&r.request().method()==='POST',{timeout:240000});await page.getByRole('button',{name:`${first.title} · 按需准备`,exact:true}).click();const material=await(await segmentResponse).json();expect(material.session.segments.find((x:{key:string})=>x.key===first.key).status).toBe('ready');
  await page.screenshot({path:test.info().outputPath('actual-node-learning.png'),fullPage:true});
  await page.getByLabel('向老师提问').fill('我刚开始学习，请根据眼前这一部分，解释一个容易混淆的地方，并给我能实际进入的小活动。');
  const feedback=page.waitForResponse(r=>r.url().endsWith('/interactions')&&r.request().method()==='POST',{timeout:240000});await page.getByRole('button',{name:'提问并获得帮助'}).click();const helped=await(await feedback).json();expect(helped.session.interactions.at(-1).status,helped.session.interactions.at(-1).error).toBe('complete');
  await page.getByLabel('记录标题').fill('微积分第一次学习的疑问');await page.getByLabel('记录类型').selectOption('question');await page.getByLabel('个人记录内容').fill('我想进一步分清方法的成立条件与具体算出的结果，不能把看到例子当成自己已经会使用。');await page.getByRole('button',{name:'确认保存个人记录'}).click();await expect(page.getByRole('status').filter({hasText:'已保存个人记录'})).toBeVisible();
  await expect(page.getByRole('button',{name:/^进入：/})).toBeEnabled();await page.getByRole('button',{name:/^进入：/}).click();await expect(page.locator('p[role="alert"]')).toHaveCount(0,{timeout:30000});
  await expect.poll(async()=>{const saved=await db.nodeTeachingSession.findUniqueOrThrow({where:{id:frame.session.id}});return JSON.parse(saved.progressJson).segmentId;}).toBeTruthy();
});
test('真实模型：对同题不同推理给出可执行补讲，保留全部输入',async({page})=>{
  await page.goto('/learning/sessions');await page.getByLabel('探索问题').fill('学习导数与函数图像：对实数 x，判断 x³−3x=a 的不同实根个数。请说明 |a|<2、|a|=2、|a|>2 的情况，并帮助我区分参数、交点、重根。已有高中函数知识，导数基础可就地补充。');
  await page.getByRole('button',{name:'开始独立探索'}).click();await expect(page).toHaveURL(/learning\/sessions\//);await expect(page.getByLabel('向老师提问')).toBeVisible();
  const id=page.url().split('/').at(-1)!;
  for(const input of ['我认为 a 是交点的横坐标，所以直接取 x=a 就能判断根的个数，这样推理对吗？请针对我的问题安排一次实际比较。','当 a=2 时，切点同时属于两个单调区间，我把它在左右各数一次，所以有三个不同实根。请帮我用另一个角度辨别重复计数。']){
    await page.getByLabel('向老师提问').fill(input);const returned=page.waitForResponse(r=>r.url().endsWith('/interactions')&&r.request().method()==='POST',{timeout:180000});await page.getByRole('button',{name:'提问并获得帮助'}).click();const response=await returned;expect(response.ok()).toBeTruthy();const data=await response.json();const latest=data.session.interactions.at(-1);expect(latest.status,latest.error).toBe('complete');expect(latest.response.action.type).toBe('activity');expect(data.session.segments.some((x:{id:string})=>x.id===latest.response.action.segmentId)).toBe(true);
  }
  const session=await db.nodeTeachingSession.findUniqueOrThrow({where:{id},include:{interactions:true,segments:true}});expect(session.interactions).toHaveLength(2);expect(session.segments).toHaveLength(2);expect(session.interactions[0].responseJson).not.toBe(session.interactions[1].responseJson);
  await page.reload();await expect(page.getByText(/我的输入：我认为 a 是交点的横坐标/)).toBeVisible();await page.screenshot({path:test.info().outputPath('different-feedback.png'),fullPage:true});
  const originalActions=page.getByRole('button',{name:/^进入建议：/});await originalActions.last().click();await expect(page.getByLabel('活动回答')).toBeVisible();
  await page.getByLabel('活动回答').fill('当 a=2 时，x³−3x−2=(x−2)(x+1)²，因此只有 x=-1 和 x=2 两个不同实根。切点应计一次，代数重数不能当成不同交点数。');const answerResponse=page.waitForResponse(r=>r.url().endsWith('/interactions')&&r.request().method()==='POST',{timeout:240000});await page.getByRole('button',{name:'提交尝试并获得反馈'}).click();const answered=await(await answerResponse).json();expect(answered.session.interactions.at(-1).kind).toBe('answer');expect(answered.session.interactions.at(-1).status,answered.session.interactions.at(-1).error).toBe('complete');expect(answered.session.interactions.at(-1).exerciseKey).toBeTruthy();
  await page.getByLabel('向老师提问').fill('现在限制 x≥0。请重新处理 x³−3x=a 的端点 x=0 和极小点，逐段说明 a<-2、a=-2、-2<a<0、a=0、a>0 的不同实根个数，不能套用整个实轴的结论。');const transferResponse=page.waitForResponse(r=>r.url().endsWith('/interactions')&&r.request().method()==='POST',{timeout:240000});await page.getByRole('button',{name:'提问并获得帮助'}).click();const transferred=await(await transferResponse).json();expect(transferred.session.interactions.at(-1).status,transferred.session.interactions.at(-1).error).toBe('complete');await test.info().attach('非负定义域的真实回应',{body:JSON.stringify(transferred.session.interactions.at(-1),null,2),contentType:'application/json'});
  await page.reload();await expect(page.getByText(/我的输入：现在限制 x≥0/)).toBeVisible();
});
test('真实模型：开放问题可讨论，不制造唯一答案或分数',async({page})=>{
  await page.goto('/learning/sessions');await page.getByLabel('探索问题').fill('公共广场怎样兼顾老人、儿童和上班族的需求？我想比较不同解释，没有唯一标准答案。');await page.getByRole('button',{name:'开始独立探索'}).click();await expect(page.getByLabel('向老师提问')).toBeVisible();
  await page.getByLabel('向老师提问').fill('如果增加商业摊位能提高活力，是否就一定让公共性更好？请帮助我比较不同人群的受益和限制，并给出讨论活动。');const returned=page.waitForResponse(r=>r.url().endsWith('/interactions')&&r.request().method()==='POST',{timeout:180000});await page.getByRole('button',{name:'提问并获得帮助'}).click();const data=await (await returned).json();const latest=data.session.interactions.at(-1);expect(latest.status,latest.error).toBe('complete');expect(latest.response.action.type).toBe('activity');const segment=data.session.segments.find((x:{id:string})=>x.id===latest.response.action.segmentId);expect(segment.material.steps[0].activities[0].solution).toBeNull();
  await page.screenshot({path:test.info().outputPath('open-question.png'),fullPage:true});
});
