const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const fixture = require('../test-fixtures/flexible-learning.json');
(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'englishnode-flexible-provider-'));
  const failed = new Set();
  const server = http.createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const prompt = body.messages?.at(-1)?.content || '';
    if (prompt.includes('模拟反馈失败') && !failed.has('feedback')) {
      failed.add('feedback'); response.writeHead(503); response.end(JSON.stringify({error:{message:'Fixture interruption'}})); return;
    }
    const data = prompt.includes('独立检查实际知识事实') ? {verdict:'no_error_found',summary:'协议夹具不验证知识',uncertainty:null,findings:[]} : prompt.includes('为当前问题备课') ? fixture.framework : prompt.includes('生成这一部分正文') ? fixture.material : fixture.feedback;
    response.writeHead(200, {'Content-Type':'application/json'});
    response.end(JSON.stringify({choices:[{message:{role:'assistant',content:JSON.stringify(data)},finish_reason:'stop'}]}));
  });
  try {
    await new Promise((resolve, reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
    const source = path.join(directory,'ai-settings.json');
    fs.writeFileSync(source,JSON.stringify({provider:'lmstudio',model:'flexible-fixture',apiKey:'local-fixture',baseUrl:`http://127.0.0.1:${server.address().port}/v1`}));
    const child = spawn(process.execPath,[path.join(__dirname,'run-playwright-e2e.js'),'full-product.spec.ts','node-teaching.spec.ts','learning-domain.spec.ts','app.spec.ts',...process.argv.slice(2)],{cwd:path.join(__dirname,'..'),stdio:'inherit',shell:false,env:{...process.env,E2E_TEACHING_FIXTURE:'1',E2E_LIVE_AI:'0',E2E_WORKERS:'1',E2E_AI_SETTINGS_SOURCE:source}});
    process.exitCode = await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
  } finally {
    server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));
    if(path.dirname(directory)===path.resolve(os.tmpdir()))fs.rmSync(directory,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
