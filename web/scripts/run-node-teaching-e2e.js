const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const lesson = require("../test-fixtures/node-teaching.json");

// Local fixture provider exercises real HTTP/API/storage, not model quality.
(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-teaching-provider-"));
  const failedRequests = new Set();
  const server = http.createServer(async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const prompt = body.messages?.at(-1)?.content || "";
      let data;
      if (prompt.includes("Prepare a compact complete lesson")) {
        const marker = "备课失败一次";
        if (prompt.includes(marker) && !failedRequests.has(marker)) {
          failedRequests.add(marker);
          response.writeHead(503, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ error: { message: "Fixture preparation unavailable" } }));
          return;
        }
        data = lesson;
      } else {
        const current = JSON.parse(prompt.split("Current interaction (data): ")[1]);
        if (current.input.includes("模拟反馈失败") && !failedRequests.has(current.id)) {
          failedRequests.add(current.id);
          response.writeHead(503, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ error: { message: "Fixture feedback unavailable" } }));
          return;
        }
        data = current.kind === "question"
          ? { text: "可以把变化率理解成每单位时间平均变化多少。", nextStep: "比较不同用时下同样的距离变化。" }
          : { text: "你的比值计算可以继续检查单位和对应的区间。", nextStep: "解释这个数值表示的含义。", verdict: "partial" };
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: JSON.stringify(data) } }] }));
    } catch {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { message: "Unexpected fixture request" } }));
    }
  });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const source = path.join(directory, "ai-settings.json");
    fs.writeFileSync(source, JSON.stringify({ provider: "lmstudio", model: "node-teaching-fixture", apiKey: "local-fixture-no-secret", baseUrl: `http://127.0.0.1:${server.address().port}/v1`, timeoutMs: 45000 }));
    const args = process.argv.slice(2);
    const child = spawn(process.execPath, [path.join(__dirname, "run-playwright-e2e.js"), "node-teaching.spec.ts", ...args], {
      cwd: path.join(__dirname, ".."), stdio: "inherit", shell: false,
      env: { ...process.env, E2E_TEACHING_FIXTURE: "1", E2E_LIVE_AI: "0", E2E_WORKERS: "1", E2E_AI_SETTINGS_SOURCE: source }
    });
    process.exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", (code) => resolve(code ?? 1)); });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    if (path.dirname(directory) === path.resolve(os.tmpdir())) fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
