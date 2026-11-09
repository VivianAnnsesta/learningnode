import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {listHistorySources,getHistorySource,historyRecordSnapshot} from './historyService';
let root:string,file:string,fingerprint:string,previous:string|undefined;
beforeAll(async()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),'englishnode-history-'));file=path.join(root,'old.db');fs.copyFileSync(path.resolve('prisma/seed.db'),file);const client=new PrismaClient({datasources:{db:{url:`file:${file.replace(/\\/g,'/')}`}}});try{await client.domain.create({data:{id:'old-domain',name:'旧库'}});await client.knowledgePoint.create({data:{id:'old-note',domainId:'old-domain',title:'旧疑问',userUnderstanding:'原话仍在'}});await client.nodeTeachingSession.create({data:{id:'old-session',domainId:'old-domain',scopeKey:'legacy:old',requestId:'legacy',contextHash:'old',contextJson:'{}',lessonJson:JSON.stringify({explanation:'旧解释',answer:'未查看的参考答案',hints:['隐私提示']}),aiCallLogId:'old',progressJson:'{}'}});}finally{await client.$disconnect();}fingerprint=createHash('sha256').update(fs.readFileSync(file)).digest('hex');previous=process.env.ENGLISHNODE_LEGACY_DATABASE_PATHS;process.env.ENGLISHNODE_LEGACY_DATABASE_PATHS=JSON.stringify([file]);});
afterAll(()=>{if(previous===undefined)delete process.env.ENGLISHNODE_LEGACY_DATABASE_PATHS;else process.env.ENGLISHNODE_LEGACY_DATABASE_PATHS=previous;if(root&&path.dirname(root)===path.resolve(os.tmpdir()))fs.rmSync(root,{recursive:true,force:true});});
it('只通过固定历史来源读取，保留原文件指纹',async()=>{const source=(await listHistorySources()).sources.find(s=>s.name==='old.db')!;const data=await getHistorySource(source.id) as {records:{userUnderstanding:string}[]};expect(data.records[0].userUnderstanding).toBe('原话仍在');expect(createHash('sha256').update(fs.readFileSync(file)).digest('hex')).toBe(fingerprint);await expect(getHistorySource('../../private')).rejects.toThrow('不存在');});
it('旧材料不泄漏未查看答案及提示，沿用快照含原始身份',async()=>{const source=(await listHistorySources()).sources.find(s=>s.name==='old.db')!;const data=await getHistorySource(source.id);expect(JSON.stringify(data)).not.toContain('未查看的参考答案');expect(JSON.stringify(data)).not.toContain('隐私提示');const r=await historyRecordSnapshot(source.id,'old-note');expect(r.source.id).toBe(source.id);expect(JSON.stringify(r.record)).toContain('原话仍在');await expect(historyRecordSnapshot(source.id,'missing')).rejects.toThrow('不存在');});
it('明确查看旧参考内容不改变历史文件，也不生成作答证据',async()=>{const source=(await listHistorySources()).sources.find(s=>s.name==='old.db')!;const data=await getHistorySource(source.id,{showReferences:true});expect(JSON.stringify(data)).toContain('未查看的参考答案');expect(JSON.stringify(data)).toContain('隐私提示');expect(createHash('sha256').update(fs.readFileSync(file)).digest('hex')).toBe(fingerprint);});
it('超过首屏的个人记录可翻页并按原身份沿用，Word 与 KP 同名 ID 不串来源',async()=>{
  const large=path.join(root,'many.db');fs.copyFileSync(file,large);const client=new PrismaClient({datasources:{db:{url:`file:${large.replace(/\\/g,'/')}`}}});
  try{await client.knowledgePoint.createMany({data:Array.from({length:120},(_,i)=>({id:`page-${i}`,title:`旧记录 ${i}`,userUnderstanding:`原内容 ${i}`}))});await client.$executeRawUnsafe('CREATE TABLE Word(id TEXT PRIMARY KEY,text TEXT,coreEssence TEXT)');await client.$executeRawUnsafe('INSERT INTO Word(id,text,coreEssence) VALUES (?,?,?)','old-note','同身份旧 Word','另一套原文');}finally{await client.$disconnect();}
  process.env.ENGLISHNODE_LEGACY_DATABASE_PATHS=JSON.stringify([file,large]);
  const original=createHash('sha256').update(fs.readFileSync(large)).digest('hex'),source=(await listHistorySources()).sources.find(s=>s.name==='many.db')!;
  const first=await getHistorySource(source.id) as {records:{id:string;historicalTable:string}[];page:{hasMore:boolean}};
  expect(first.page.hasMore).toBe(true);expect(first.records.filter(r=>r.id==='old-note')).toHaveLength(2);expect(first.records.some(r=>r.id==='page-119')).toBe(false);
  const second=await getHistorySource(source.id,{offset:100}) as {records:{id:string}[];page:{hasMore:boolean}};expect(second.records.some(r=>r.id==='page-119')).toBe(true);expect(second.page.hasMore).toBe(false);
  expect(JSON.stringify(await historyRecordSnapshot(source.id,'page-119','KnowledgePoint'))).toContain('原内容 119');
  expect(JSON.stringify(await historyRecordSnapshot(source.id,'old-note','Word'))).toContain('另一套原文');expect(JSON.stringify(await historyRecordSnapshot(source.id,'old-note','KnowledgePoint'))).not.toContain('另一套原文');
  await expect(getHistorySource(source.id,{offset:-1})).rejects.toThrow('页码');await expect(historyRecordSnapshot(source.id,'old-note','Other')).rejects.toThrow('类型');expect(createHash('sha256').update(fs.readFileSync(large)).digest('hex')).toBe(original);
});
