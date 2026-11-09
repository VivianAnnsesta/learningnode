import {test,expect,type Page} from '@playwright/test';
import {PrismaClient} from '@prisma/client';
const db=new PrismaClient();test.afterAll(async()=>db.$disconnect());
test.skip(process.env.E2E_TEACHING_FIXTURE!=='1','使用隔离协议模型验证输入、帮助与恢复，真实知识另行验收。');
async function open(page:Page){await page.goto('/learning/sessions');await page.getByLabel('探索问题').fill('理解交点计数');await page.getByRole('button',{name:'开始独立探索'}).click();await expect(page.getByLabel('向老师提问')).toBeVisible();return page.url().split('/').at(-1)!;}

test('新版材料的提示、解答与输入绑定真实版本，保存保持独立',async({page})=>{
  const id=await open(page);await page.getByRole('button',{name:'准备教学',exact:true}).click();await page.getByRole('button',{name:'从图像理解 · 按需准备',exact:true}).click();await expect(page.getByLabel('活动回答')).toBeEnabled();
  await page.getByRole('button',{name:'查看提示',exact:true}).click();await expect(page.getByText(/^提示：/)).toBeVisible();await page.getByRole('button',{name:'查看参考回应',exact:true}).click();await expect(page.getByText(/^参考回应：/)).toBeVisible();
  await page.getByLabel('活动回答').fill('看过参考后，说明临界交点只应计一次。');await page.getByRole('button',{name:'提交尝试并获得反馈'}).click();await expect(page.getByRole('button',{name:'进入建议：通过列表澄清重复计数'})).toBeVisible();
  const input=await db.teachingInteraction.findFirstOrThrow({where:{sessionId:id,kind:'answer'}});expect(input.assistance).toBe(2);expect(input.exerciseKey).toBeTruthy();expect(input.materialVersion).toBe(1);
  await page.reload();await expect(page.getByText(/我的输入：看过参考后/)).toBeVisible();expect(await db.knowledgePoint.count({where:{revisions:{some:{sourcesJson:{contains:id}}}}})).toBe(0);
});

test('反馈失败先留下输入，刷新与显式重试沿用同一身份',async({page})=>{
  const id=await open(page);await page.getByLabel('向老师提问').fill('模拟反馈失败：我需要补足条件。');await page.getByRole('button',{name:'提问并获得帮助'}).click();await expect(page.getByRole('button',{name:'重试已保存输入',exact:true})).toBeVisible();
  const before=await db.teachingInteraction.findFirstOrThrow({where:{sessionId:id}});expect(before.status).toBe('failed');await page.reload();await expect(page.getByText(/我的输入：模拟反馈失败/)).toBeVisible();await page.getByRole('button',{name:'重试已保存输入',exact:true}).click();await expect(page.getByRole('button',{name:'进入建议：通过列表澄清重复计数'})).toBeVisible();
  const inputs=await db.teachingInteraction.findMany({where:{sessionId:id}});expect(inputs).toHaveLength(1);expect(inputs[0].id).toBe(before.id);expect(inputs[0].status).toBe('complete');
});

test('草稿保存失败保留本地文字，恢复后可保存并重载',async({page})=>{
  const id=await open(page);let failed=false;
  await page.route(`**/api/learning-sessions/${id}`,async route=>{if(!failed&&route.request().method()==='PATCH'){failed=true;await route.abort('failed');}else await route.continue();});
  await page.getByLabel('向老师提问').fill('尚未提交的真实疑问');await page.getByRole('heading',{name:'围绕当前问题提问'}).click();await expect(page.locator('p[role="alert"]').first()).toBeVisible();await expect(page.getByLabel('向老师提问')).toHaveValue('尚未提交的真实疑问');
  await page.unroute(`**/api/learning-sessions/${id}`);await page.getByLabel('向老师提问').fill('恢复连接后保留并继续整理的疑问');const saved=page.waitForResponse(r=>r.url().endsWith(`/learning-sessions/${id}`)&&r.request().method()==='PATCH');await page.getByRole('heading',{name:'围绕当前问题提问'}).click();expect((await saved).ok()).toBe(true);await page.reload();await expect(page.getByLabel('向老师提问')).toHaveValue('恢复连接后保留并继续整理的疑问');expect(await db.teachingInteraction.count({where:{sessionId:id}})).toBe(0);
});
