import {test,expect} from '@playwright/test';
import {PrismaClient} from '@prisma/client';
const db=new PrismaClient();
test.afterAll(async()=>db.$disconnect());
const owners=async()=>{const a=await db.domain.create({data:{name:'权限领域',goal:'保存与学习'}}),b=await db.domain.create({data:{name:'另一领域',goal:'独立内容'}});const n=await db.learningNode.create({data:{domainId:b.id,title:'独立任务',orderIndex:0,status:'available'}});return{a,b,n};};

test('正式领域的学习、材料和诊断拒绝伪造归属',async({request})=>{
  const{a,b,n}=await owners();
  for(const suffix of ['', '/teaching'])expect((await request.get(`/api/domains/${a.id}/nodes/${n.id}${suffix}`)).status()).toBe(404);
  for(const suffix of ['start','complete','check-answer','materialize','practice'])expect((await request.post(`/api/domains/${a.id}/nodes/${n.id}/${suffix}`,{data:{confirmed:true}})).status()).toBe(404);
  const historical=await db.diagnosticSession.create({data:{domainId:b.id,title:'原诊断'}});
  expect((await request.get(`/api/domains/${a.id}/diagnostics/${historical.id}`)).status()).toBe(404);
  expect((await request.post(`/api/domains/${a.id}/diagnostics`,{data:{title:'伪造诊断',questions:[{prompt:'问题',roadmapItemId:n.id}]}})).status()).toBe(410);
  expect(await db.diagnosticSession.count({where:{domainId:a.id}})).toBe(0);
  expect((await db.learningNode.findUniqueOrThrow({where:{id:n.id}})).status).toBe('available');
  expect(await db.knowledgePoint.count({where:{domainId:b.id}})).toBe(0);
});

test('保存个人疑问不自动完成任务或产生高阶掌握',async({request})=>{
  const{b,n}=await owners();
  const response=await request.post('/api/knowledge-points',{data:{requestId:crypto.randomUUID(),title:'先记录疑问',body:'我还没有尝试，需要澄清条件。',kind:'question',domainId:b.id,nodeIds:[n.id]}});
  expect(response.ok()).toBe(true);const point=(await response.json()).knowledgePoint;
  expect(point.body).toBe('我还没有尝试，需要澄清条件。');
  expect((await db.learningNode.findUniqueOrThrow({where:{id:n.id}})).status).toBe('available');
  const revision=await db.knowledgePointRevision.findUniqueOrThrow({where:{id:point.currentRevisionId}});expect(revision.body).toBe(point.body);
  expect((await request.patch(`/api/domains/${b.id}/nodes/${n.id}`,{data:{status:'completed',masteryStatus:'mastered'}})).ok()).toBe(false);
});

test('兼容画布只读回看，旧写入不能旁路个人记录与关系合同',async({page,request})=>{
  for(const target of ['/api/words','/api/relations'])expect((await request.post(target,{data:{name:'旧写入',meaning:'不得创建'}})).status()).toBe(410);
  expect((await request.patch('/api/words/old',{data:{masteryStatus:'mastered'}})).status()).toBe(410);
  expect((await request.put('/api/relations/old',{data:{type:'WORMHOLE'}})).status()).toBe(410);
  await page.goto('/canvas/old');await expect(page).toHaveURL(/\/learning\/history$/);
  await expect(page.getByRole('heading',{name:'历史内容',exact:true})).toBeVisible();
});

test('旧会话保持可读原反馈，新的进度写入被拒绝且读取不调用AI',async({request})=>{
  const{b,n}=await owners();const s=await db.nodeTeachingSession.create({data:{domainId:b.id,nodeId:n.id,scopeKey:`legacy:${n.id}`,requestId:'old',contextHash:'old',contextJson:'{"schemaVersion":2}',lessonJson:'{"title":"原教案","expectedAnswer":"未请求参考"}',progressJson:'{}',aiCallLogId:'old'}});
  await db.teachingInteraction.create({data:{sessionId:s.id,requestId:'old-answer',kind:'answer',input:'历史输入',status:'complete',assistance:0,responseJson:'{"feedback":"原反馈","expectedAnswer":"未请求参考"}'}});
  const count=await db.aiCallLog.count(),read=await request.get(`/api/learning-sessions/${s.id}`);expect(read.ok()).toBe(true);const result=await read.json();expect(result.session.historical).toBe(true);expect(JSON.stringify(result)).toContain('原反馈');expect(JSON.stringify(result)).not.toContain('未请求参考');
  expect((await request.patch(`/api/learning-sessions/${s.id}`,{data:{revision:0,action:'end'}})).status()).toBe(409);expect(await db.aiCallLog.count()).toBe(count);
});

test('领域归档保留记录修订，重新读取不制造第二份记录',async({request})=>{
  const{b}=await owners();const id=crypto.randomUUID(),input={requestId:id,title:'应保留的积累',body:'我的原始表达',kind:'note',domainId:b.id};
  const first=(await(await request.post('/api/knowledge-points',{data:input})).json()).knowledgePoint;const again=(await(await request.post('/api/knowledge-points',{data:input})).json()).knowledgePoint;expect(again.id).toBe(first.id);
  expect((await request.delete(`/api/domains/${b.id}`)).ok()).toBe(true);expect((await db.domain.findUniqueOrThrow({where:{id:b.id}})).status).toBe('archived');expect((await request.get(`/api/knowledge-points/${first.id}`)).ok()).toBe(true);
  expect(await db.knowledgePointRevision.count({where:{knowledgePointId:first.id}})).toBe(1);
});
