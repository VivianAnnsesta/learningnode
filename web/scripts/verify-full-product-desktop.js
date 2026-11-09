const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { _electron, expect } = require('@playwright/test');
const { PrismaClient } = require('@prisma/client');

// Opt-in real-model UI verification. All writes and copied settings stay in an
// isolated user directory; no local token or settings response is archived.
const webRoot = path.resolve(__dirname, '..');
const argument = name => { const i = process.argv.indexOf(name); return i >= 0 ? path.resolve(process.argv[i + 1]) : null; };
const settingsSource = argument('--settings-source');
const legacySource = argument('--legacy-source');
const learningSource = argument('--learning-source');
const resume = process.argv.includes('--resume');
const reviewOnly = process.argv.includes('--review-only');
const executable = path.join(webRoot, 'dist-electron', 'win-unpacked', 'Antigravity.exe');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

(async () => {
  if (process.env.ELECTRON_LIVE_AI !== '1') throw Error('Set ELECTRON_LIVE_AI=1 to authorize real model calls.');
  if (!settingsSource || !fs.existsSync(settingsSource)) throw Error('An existing settings source is required.');
  if((resume||reviewOnly)&&!learningSource)throw Error('Resuming requires an archived learning source.');
  if (!fs.existsSync(executable)) throw Error('Build the desktop application first.');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'englishnode-desktop-full-'));
  const dataDir = path.join(temporary, 'Antigravity');
  const evidence = path.join(webRoot, 'test-results', `desktop-full-${Date.now()}`);
  fs.mkdirSync(dataDir); fs.mkdirSync(evidence, {recursive:true});
  const fingerprints = {settings:hash(settingsSource), legacy:legacySource ? hash(legacySource) : null, learning:learningSource?hash(learningSource):null};
  fs.copyFileSync(settingsSource, path.join(dataDir, 'ai-settings.json'));
  if (legacySource) {
    const original = new PrismaClient({datasources:{db:{url:`file:${legacySource.replace(/\\/g,'/')}`}}});
    try { await original.$executeRawUnsafe('VACUUM INTO ?', path.join(dataDir,'englishnode.db')); }
    finally { await original.$disconnect(); }
  }
  if(learningSource){const previous=new PrismaClient({datasources:{db:{url:`file:${learningSource.replace(/\\/g,'/')}`}}});try{await previous.$executeRawUnsafe('VACUUM INTO ?',path.join(dataDir,'englishnode-teaching-v2.db'));}finally{await previous.$disconnect();}}
  const report = {ok:false, scenario:reviewOnly?'resume-content-review':resume?'resume-failed-relation':legacySource?'copied-existing-library':'empty-seed', resumedFrom:resume||reviewOnly?learningSource:undefined, checks:[], model:null, errors:[], originalFilesUnchanged:false};
  let desktop, page;
  const events=[];
  const runtimeLog=[];
  const check = (name, details={}) => {report.checks.push({name,...details});console.log(`Passed: ${name}`);};
  const launch = async () => {
    const env={...process.env,LOCALAPPDATA:temporary,APPDATA:temporary,ELECTRON_VERIFY_RUNTIME:'0',ELECTRON_VERIFY_SECURITY:'0'};
    delete env.ELECTRON_RUN_AS_NODE;
    desktop=await _electron.launch({executablePath:executable,env,timeout:90000});
    for(const channel of ['stdout','stderr'])desktop.process()[channel]?.on('data',chunk=>runtimeLog.push({at:new Date().toISOString(),channel,text:chunk.toString()}));
    // Keep startup failures observable instead of leaving automation trapped in
    // a native modal. This changes only error presentation in the test process.
    await desktop.evaluate(({dialog})=>{dialog.showErrorBox=(title,message)=>{process.stderr.write(`DESKTOP_STARTUP_ERROR ${title}: ${message}\n`);};});
    page=await desktop.firstWindow({timeout:90000});page.setDefaultTimeout(30000);
    page.on('pageerror',e=>report.errors.push(e.message));
    page.on('response',async r=>{const url=new URL(r.url());if(!url.pathname.startsWith('/api/')||/settings|ai-config/.test(url.pathname))return;try{events.push({at:new Date().toISOString(),method:r.request().method(),path:url.pathname,status:r.status(),input:r.request().postData(),output:await r.json()});}catch{}});
    await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\//,{timeout:90000});
    return new URL(page.url()).origin;
  };
  const snapshot=async name=>{
    fs.writeFileSync(path.join(evidence,`${name}.txt`),await page.locator('body').innerText());
    try{
      const window=await desktop.browserWindow(page);
      const pixels=await window.evaluate(async w=>{const shot=await w.webContents.capturePage();return shot.isEmpty()?null:shot.toPNG().toString('base64');});
      if(!pixels)throw Error('Native capture returned an empty image.');
      fs.writeFileSync(path.join(evidence,`${name}.png`),Buffer.from(pixels,'base64'));
    }catch(error){
      // Pixel capture is supplemental evidence. Actual UI actions, responses,
      // visible content and the database remain mandatory and independently checked.
      report.artifactLimitations ||= [];report.artifactLimitations.push({name,error:error.message});
    }
  };
  try {
    let origin=await launch();check('packaged-window-opens');
    await page.goto(`${origin}/settings/ai`);await expect(page.getByLabel('温度',{exact:true})).toBeEnabled();
    await page.getByLabel('温度',{exact:true}).fill('0.17');await page.getByRole('button',{name:'保存 AI 设置',exact:true}).click();
    await expect.poll(()=>JSON.parse(fs.readFileSync(path.join(dataDir,'ai-settings.json'),'utf8')).temperature).toBe(0.17);
    const settings=JSON.parse(fs.readFileSync(path.join(dataDir,'ai-settings.json'),'utf8'));report.model={provider:settings.provider,model:settings.model,temperature:settings.temperature};check('settings-saved-in-user-directory',report.model);
    await desktop.close();desktop=null;
    origin=await launch();await page.goto(`${origin}/settings/ai`);await expect(page.getByLabel('温度',{exact:true})).toHaveValue('0.17');check('model-settings-restored-after-restart');
    await page.goto(`${origin}/learning/history`);await expect(page.getByRole('heading',{name:'历史内容',exact:true})).toBeVisible();
    if(legacySource){await page.getByRole('button',{name:'englishnode.db',exact:true}).click();await expect(page.getByRole('heading',{name:'旧个人内容',exact:true})).toBeVisible();check('original-library-readable-in-application');await snapshot('history');}
    let response;
    if(!reviewOnly){
    let sessionId,pointId,other;
    if(resume){
      const restored=new PrismaClient({datasources:{db:{url:`file:${path.join(dataDir,'englishnode-teaching-v2.db').replace(/\\/g,'/')}`}}});
      try{const point=await restored.knowledgePoint.findFirstOrThrow({where:{currentRevision:{title:'活力与公共性的区别'}},orderBy:{createdAt:'desc'},include:{currentRevision:true}});pointId=point.id;sessionId=JSON.parse(point.currentRevision.sourcesJson).find(x=>x.kind==='session').sessionId;other=(await restored.knowledgePoint.findFirst({where:{currentRevision:{title:'资源分配中的使用公平'}},orderBy:{createdAt:'desc'}}))?.id;}finally{await restored.$disconnect();}
      check('resumed-at-failed-relation-with-saved-learning',{sessionId,pointId});
    }else{
    await page.goto(`${origin}/learning/sessions`);await page.getByLabel('探索问题').fill('我想理解城市公共空间如何影响人的活动。请比较老人、儿童、上班族的需求，用案例帮助我思考，没有唯一标准答案；相关基础可以就地解释。');
    await page.getByRole('button',{name:'开始独立探索'}).click();await expect(page).toHaveURL(/\/learning\/sessions\//);
    sessionId=page.url().split('/').at(-1);
    await page.getByLabel('记录标题').fill('公共空间里的第一个疑问');await page.getByLabel('记录类型').selectOption('question');await page.getByLabel('个人记录内容').fill('我还不理解商业活动增加是否必然改善公共性，想比较不同人群的需求。');
    await page.getByRole('button',{name:'确认保存个人记录'}).click();await expect(page.getByRole('status').filter({hasText:'已保存个人记录'})).toBeVisible();check('record-before-preparation-or-answer');
    response=page.waitForResponse(r=>r.url().endsWith('/prepare')&&r.request().method()==='POST',{timeout:240000});await page.getByRole('button',{name:'准备教学',exact:true}).click();let body=await(await response).json();expect(body.session.status,body.session.error).toBe('ready');check('real-model-flexible-framework',{parts:body.session.framework.segments.length});
    const part=body.session.framework.segments[0];response=page.waitForResponse(r=>r.url().endsWith(`/segments/${part.key}`)&&r.request().method()==='POST',{timeout:240000});await page.getByRole('button',{name:`${part.title} · 按需准备`,exact:true}).click();body=await(await response).json();expect(body.session.segments.find(x=>x.key===part.key).status).toBe('ready');check('real-model-on-demand-material');
    await page.getByLabel('向老师提问').fill('如果增加商业摊位能提高活力，是否就一定让公共性更好？请比较不同人群的受益和限制，给一个能实际进入的讨论活动。');response=page.waitForResponse(r=>r.url().endsWith('/interactions')&&r.request().method()==='POST',{timeout:240000});await page.getByRole('button',{name:'提问并获得帮助'}).click();body=await(await response).json();const feedback=body.session.interactions.at(-1);expect(feedback.status,feedback.error).toBe('complete');expect(feedback.response.action.type).toBe('activity');
    await page.getByRole('button',{name:/^进入建议：/}).last().click();await expect(page.getByLabel('活动回答').first()).toBeEnabled();check('real-feedback-activity-can-enter');await snapshot('open-activity');
    await page.getByLabel('活动回答').first().fill('我认为活力只是一个因素。摊位可能带来交流和便利，也可能挤占儿童活动或老人休息的位置；应比较可进入性、使用时间、价格与不同人群的需要，不能只用人流量判断公共性。');
    response=page.waitForResponse(r=>r.url().endsWith('/interactions')&&r.request().method()==='POST',{timeout:240000});await page.getByRole('button',{name:'提交尝试并获得反馈'}).first().click();body=await(await response).json();expect(body.session.interactions.at(-1).status,body.session.interactions.at(-1).error).toBe('complete');check('real-model-answer-feedback', {exercise:body.session.interactions.at(-1).exerciseKey});
    await page.getByLabel('个人记录内容').fill('公共空间的活力与公共性有关，但我需要同时考虑谁能进入、谁被排除、时间和空间分配。这个理解尚待具体案例检验。');await page.getByLabel('记录标题').fill('活力与公共性的区别');await page.getByLabel('记录类型').selectOption('understanding');response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/knowledge-points'&&r.request().method()==='POST');await page.getByRole('button',{name:'确认保存个人记录'}).click();const saved=await(await response).json();expect(saved.knowledgePoint.id).toBeTruthy();pointId=saved.knowledgePoint.id;check('personal-record-with-original-source');
    await expect(page.getByRole('button',{name:/^进入：/})).toBeEnabled();await page.getByRole('button',{name:/^进入：/}).click();await expect(page.locator('p[role="alert"]')).toHaveCount(0);check('next-action-enters-real-content');
    }
    await page.goto(`${origin}/learning/knowledge`);
    if(!other){await page.getByLabel('新记录标题').fill('资源分配中的使用公平');await page.getByLabel('新记录内容').fill('在资源分配中，效率与公平需要分别说明。谁可以使用、承担多少成本、是否有替代选择，都影响评价。');response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/knowledge-points'&&r.request().method()==='POST');await page.getByRole('button',{name:'确认保存',exact:true}).click();other=(await(await response).json()).knowledgePoint.id;}
    await page.getByLabel('新主题名称').fill('开放问题与资源分配');await page.getByRole('button',{name:'创建主题',exact:true}).click();await page.goto(`${origin}/learning/knowledge/${pointId}`);
    await page.getByLabel('关系终点').selectOption(other);
    response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/knowledge-points/relations/suggestions'&&r.request().method()==='POST',{timeout:240000});await page.getByRole('button',{name:'请 AI 提出候选联系',exact:true}).click();const candidates=await(await response).json();expect(candidates.error||'').toBe('');await expect(page.getByRole('button',{name:'接受关系',exact:true}).first()).toBeEnabled();
    response=page.waitForResponse(r=>/\/api\/knowledge-points\/relations\/[^/]+$/.test(new URL(r.url()).pathname)&&r.request().method()==='PATCH');await page.getByRole('button',{name:'接受关系',exact:true}).first().click();expect((await response).ok()).toBe(true);check('real-model-relation-candidate-explicitly-accepted');
    await page.getByLabel('关系说明').fill('比较公共空间使用权与资源分配公平；这只是比较线索，需要注意两种问题的范围差异。');await page.getByRole('button',{name:'确认建立联系',exact:true}).click();
    await page.getByLabel('加入主题').selectOption({label:'开放问题与资源分配'});await page.getByRole('button',{name:'加入主题',exact:true}).click();
    await page.getByLabel('修订记录内容').fill('活力不是公共性的充分条件。理解公共空间还要看进入限制、不同人群的空间与时间分配，并用实际案例修正我的判断。');await page.getByRole('button',{name:'确认保存新修订',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'已保存新修订'})).toBeVisible();check('relationship-theme-and-revision');await snapshot('personal-network');
    await desktop.close();desktop=null;origin=await launch();await page.goto(`${origin}/learning/knowledge/${pointId}`);await expect(page.getByLabel('修订记录内容')).toHaveValue(/活力不是公共性的充分条件/);await expect(page.getByRole('heading',{name:'修订与原始来源',exact:true})).toBeVisible();check('record-relations-and-revisions-restored-after-restart');
    await page.goto(`${origin}/learning/sessions/${sessionId}`);await expect(page.getByText(/我的输入：如果增加商业摊位/)).toBeVisible();check('learning-inputs-material-and-position-restored');await snapshot('restored-learning');
    await desktop.close();desktop=null;
    const db=new PrismaClient({datasources:{db:{url:`file:${path.join(dataDir,'englishnode-teaching-v2.db').replace(/\\/g,'/')}`}}});
    try{expect(await db.$queryRawUnsafe('PRAGMA foreign_key_check')).toHaveLength(0);const session=await db.nodeTeachingSession.findUniqueOrThrow({where:{id:sessionId},include:{interactions:true}});expect(session.nodeId).toBeNull();expect(session.interactions.some(i=>i.kind==='answer'&&i.status==='complete')).toBe(true);const point=await db.knowledgePoint.findUniqueOrThrow({where:{id:pointId},include:{revisions:true,memberships:true}});expect(point.revisions.length).toBe(2);expect(point.memberships.length).toBe(1);await db.$executeRawUnsafe('VACUUM INTO ?',path.join(evidence,learningSource?'before-content-review.db':'journey.db'));check('database-fidelity-and-no-fake-node');}finally{await db.$disconnect();}
    }else{await desktop.close();desktop=null;check('resumed-at-saved-content-review');}
    if(learningSource){
      const previous=new PrismaClient({datasources:{db:{url:`file:${learningSource.replace(/\\/g,'/')}`}}});let examples;
      try{examples=await previous.teachingInteraction.findMany({where:{status:'complete',OR:[{input:{contains:'交点的横坐标'}},{input:{startsWith:'现在限制 x≥0'}}]},orderBy:{createdAt:'asc'}});}finally{await previous.$disconnect();}
      origin=await launch();const reviewed=[],supportedSessions=new Set();
      const derivation='本次验收独立计算的推导记录，不是外部权威来源。令 f(x)=x³−3x，f′(x)=3(x²−1)。在实数范围，f 在 (−∞,−1) 与 (1,∞) 递增，在 (−1,1) 递减，f(−1)=2，f(1)=−2。每个不同实根 x 恰好对应一个不同几何交点 (x,a)；根的重数、按闭区间重复数端点与不同几何交点数必须区分。f(x)−2=(x−2)(x+1)²，故 a=2 的不同根是 −1、2，对应两个不同几何交点；f(x)+2=(x+2)(x−1)²，故 a=−2 的不同根是 −2、1，同样两个不同几何交点。|a|<2 有3个不同实根，|a|=2有2个，|a|>2有1个。当 a>2 时只有右侧递增支与水平线相交，当 a<−2 时只有左侧递增支相交，并非两侧各相交一次。限制 x≥0：f 在 [0,1] 从0降至−2，在 [1,∞) 从−2增至∞。a<−2无根；a=−2只有x=1；−2<a<0有两根，分别在(0,1)和(1,√3)；a=0有x=0、√3两个不同根，左根不在(0,1)；a>0只有一个根且x>√3。';
      fs.writeFileSync(path.join(evidence,'independent-derivation.txt'),derivation);
      for(const example of examples){
        await page.goto(`${origin}/learning/sessions/${example.sessionId}`);
        if(!supportedSessions.has(example.sessionId)){
          await page.getByLabel('资料正文').fill(derivation);response=page.waitForResponse(r=>r.url().endsWith('/sources')&&r.request().method()==='POST');await page.getByRole('button',{name:'保存资料',exact:true}).click();expect((await response).ok()).toBe(true);supportedSessions.add(example.sessionId);
        }
        const concern=example.input.startsWith('现在限制 x≥0')?'当前反馈把 −2<a≤0 合在一起，却声称左根在开区间(0,1)。请独立代入a=0检查端点：x=0也是根，是否与开区间主张矛盾？按所提供的实际推导分别处理−2<a<0及a=0，只纠正当前原文，保留正确计数。':'当前更正把不同实根与几何交点说成相差一个，甚至声称有2个不同实根却只有1个几何交点；这是同一几何交点重复计入单调区间，与不同几何交点的混淆。请根据所提供的因式分解和(x,a)的一一对应修正。原文还声称|a|>2时两侧单调区间各相交一次，也需核对。保留正确根数，不引入新计数矛盾。';
        await page.getByLabel('核对目标').selectOption(example.id);await page.getByLabel('知识疑点').fill(concern);
        response=page.waitForResponse(r=>r.url().endsWith('/review')&&r.request().method()==='POST',{timeout:240000});await page.getByRole('button',{name:'核对当前内容并纠正明确错误',exact:true}).click();const checked=await(await response).json(),current=checked.session.interactions.find(i=>i.id===example.id);expect(checked.session.contentReview.status,checked.session.contentReview.error).toBe('complete');expect(['confirmed_error','no_error_found']).toContain(checked.session.contentReview.verdict);expect(current.correction?.text).toBeTruthy();expect(current.response.text).toBe(JSON.parse(example.responseJson).text);reviewed.push({original:current.response.text,correction:current.correction.text,review:checked.session.contentReview});await page.reload();await expect(page.getByText('核对前的原回应（保留原文）').first()).toBeVisible();
      }
      expect(reviewed.length).toBeGreaterThanOrEqual(2);fs.writeFileSync(path.join(evidence,'feedback-corrections.json'),JSON.stringify(reviewed,null,2));check('known-real-model-errors-corrected-with-originals-preserved',{count:reviewed.length});await snapshot('content-corrections');await desktop.close();desktop=null;
    }
    report.originalFilesUnchanged=hash(settingsSource)===fingerprints.settings&&(!legacySource||hash(legacySource)===fingerprints.legacy)&&(!learningSource||hash(learningSource)===fingerprints.learning);expect(report.originalFilesUnchanged).toBe(true);expect(report.errors).toHaveLength(0);report.ok=true;
  } catch(e){report.error=e.message;if(page&&!page.isClosed())try{await snapshot('failure');}catch{}throw e;}
  finally{
    if(desktop)try{await desktop.close();}catch{}
    const databaseFile=path.join(dataDir,'englishnode-teaching-v2.db');
    if(fs.existsSync(databaseFile)&&!fs.existsSync(path.join(evidence,'journey.db'))){const archived=new PrismaClient({datasources:{db:{url:`file:${databaseFile.replace(/\\/g,'/')}`}}});try{await archived.$executeRawUnsafe('VACUUM INTO ?',path.join(evidence,'journey.db'));}catch(e){report.archiveError=e.message;}finally{await archived.$disconnect();}}
    report.originalFilesUnchanged=hash(settingsSource)===fingerprints.settings&&(!legacySource||hash(legacySource)===fingerprints.legacy)&&(!learningSource||hash(learningSource)===fingerprints.learning);
    if(report.archiveError)report.recoveryDirectory=temporary;
    fs.writeFileSync(path.join(evidence,'events.json'),JSON.stringify(events,null,2));fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(report,null,2));
    fs.writeFileSync(path.join(evidence,'runtime.json'),JSON.stringify(runtimeLog,null,2));
    if(path.dirname(temporary)!==path.resolve(os.tmpdir()))throw Error('Unexpected cleanup target.');
    fs.rmSync(path.join(dataDir,'ai-settings.json'),{force:true});
    if(!report.archiveError)fs.rmSync(temporary,{recursive:true,force:true,maxRetries:6,retryDelay:250});
    console.log(`Desktop evidence: ${evidence}`);
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
