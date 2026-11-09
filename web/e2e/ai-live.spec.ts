import {test,expect} from '@playwright/test';
test.skip(process.env.E2E_LIVE_AI!=='1','需显式启用当前真实模型设置；不使用模拟响应冒充知识验证。');
test('当前配置的真实模型能在无课程探索中给出实际可进入帮助',async({page})=>{
  test.setTimeout(240000);await page.goto('/learning/sessions');await page.getByLabel('探索问题').fill('讨论一个开放问题：如何比较公共空间对不同使用者的影响？');await page.getByRole('button',{name:'开始独立探索'}).click();await expect(page.getByLabel('向老师提问')).toBeVisible();
  await page.getByLabel('向老师提问').fill('我只会看人流量，可以怎样补充不同人群的需求？请给一个能够实际进入的讨论活动。');const returned=page.waitForResponse(r=>r.url().endsWith('/interactions')&&r.request().method()==='POST',{timeout:180000});await page.getByRole('button',{name:'提问并获得帮助'}).click();const body=await(await returned).json(),i=body.session.interactions.at(-1);expect(i.status,i.error).toBe('complete');expect(i.response.action.type).toBe('activity');expect(body.session.segments.some((p:{id:string})=>p.id===i.response.action.segmentId)).toBe(true);await page.getByRole('button',{name:/^进入建议：/}).click();await expect(page.getByLabel('活动回答')).toBeEnabled();
});
