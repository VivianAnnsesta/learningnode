const fs = require("fs");
const path = require("path");
const { TextDecoder } = require("util");

const repoRoot = path.resolve(__dirname, "..", "..");
const scanRoots = [
  path.join(repoRoot, ".editorconfig"),
  path.join(repoRoot, ".gitattributes"),
  path.join(repoRoot, "CONTEXT.md"),
  path.join(repoRoot, "CURRENT_PROGRESS_AND_DIFFICULTIES.md"),
  path.join(repoRoot, "IMPLEMENTATION_PLAN.md"),
  path.join(repoRoot, "start-dev.ps1"),
  path.join(repoRoot, "TOP_LEVEL_DESIGN.md"),
  path.join(repoRoot, "docs"),
  path.join(repoRoot, "web", "docs"),
  path.join(repoRoot, "web", "e2e"),
  path.join(repoRoot, "web", "scripts"),
  path.join(repoRoot, "web", "src"),
  path.join(repoRoot, "web", "prisma")
];

const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ps1",
  ".prisma",
  ".ts",
  ".tsx"
]);

const textFileNames = new Set([
  ".editorconfig",
  ".gitattributes",
  ".gitignore"
]);

const ignoredDirectories = new Set([
  ".git",
  ".next",
  "coverage",
  "dist",
  "dist-electron",
  "node_modules",
  "test-results"
]);

const ignoredFiles = new Set([
  path.normalize(path.join("web", "scripts", "check-mojibake.js"))
]);

const mojibakePatterns = [
  "\u701b\ufe3f\u7bc4", // 学习
  "\u68f0\u55d7\u7159", // 领域
  "\u942d\u30e8\u7611", // 知识
  "\u7487\u5a43\u67c7", // 诊断
  "\u9366\u677f\u6d58", // 地图
  "\u6d60\u8bf2\u59df", // 任务
  "\u934f\u5d07\u90f4", // 关系
  "\u59af\u2033\u6f61", // 模块
  "\u7ecb\u51b2\u757e", // 稳定
  "\u5a0c\u590b\u7a69", // 沉淀
  "\u6fb6\u8fab\u89e6", // 失败
  "\u6d93\u5d88\u5158\u6d93\u8679\u2516", // 不能为空
  "\u9352\u6d98\u7f13", // 创建
  "\ufffd" // replacement character from broken decoding
];

const broadMojibakePatterns = [
  "\u68f0\u55d7\u7159",
  "\u701b\ufe3f\u7bc4",
  "\u6d60\u8bf2\u59df",
  "\u7487\u5267\u25bc",
  "\u9366\u677f\u6d58",
  "\u9422\u71b8\u579a",
  "\u7ead\ue1bf\ue17b",
  "\u6dc7\u6fc6\u74e8",
  "\u6fb6\u8fab\u89e6",
  "\u934f\u5d07\u90f4",
  "\u942d\u30e8\u7611",
  "\u93c9\u30e6\u7c2e",
  "\u7ed7\ue0ff\u7af4",
  "\u941e\u55da\ue191",
  "\u690b\u5ea8\u6ad3",
  "\u9225",
  "\u9286",
  "€"
];

const privateUsePattern = /[\uE000-\uF8FF]/u;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

function* walk(entry) {
  if (!fs.existsSync(entry)) return;

  const stat = fs.statSync(entry);
  if (stat.isFile()) {
    yield entry;
    return;
  }

  if (!stat.isDirectory()) return;

  const name = path.basename(entry);
  if (ignoredDirectories.has(name)) return;

  for (const child of fs.readdirSync(entry)) {
    yield* walk(path.join(entry, child));
  }
}

function isTextFile(file) {
  return (
    textExtensions.has(path.extname(file)) ||
    textFileNames.has(path.basename(file))
  );
}

const findings = [];

for (const root of scanRoots) {
  for (const file of walk(root)) {
    if (!isTextFile(file)) continue;

    const buffer = fs.readFileSync(file);
    const relativeFile = path.relative(repoRoot, file);
    if (ignoredFiles.has(path.normalize(relativeFile))) continue;

    const matches = [];
    let content = "";

    try {
      content = utf8Decoder.decode(buffer);
    } catch {
      findings.push({
        file: relativeFile,
        patterns: ["invalid utf-8 bytes"]
      });
      continue;
    }

    if (
      buffer.length >= 3 &&
      buffer[0] === 0xef &&
      buffer[1] === 0xbb &&
      buffer[2] === 0xbf
    ) {
      matches.push("utf-8 bom");
    }

    matches.push(
      ...mojibakePatterns.filter((pattern) => content.includes(pattern)),
      ...broadMojibakePatterns.filter((pattern) => content.includes(pattern))
    );

    if (privateUsePattern.test(content)) {
      matches.push("unicode private-use characters");
    }

    if (matches.length > 0) {
      findings.push({
        file: relativeFile,
        patterns: [...new Set(matches)]
      });
    }
  }
}

if (findings.length > 0) {
  console.error("Detected likely mojibake in text files:");
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.patterns.join(", ")}`);
  }
  console.error(
    "Fix the file as UTF-8 text before committing. If this is a false positive, narrow scripts/check-mojibake.js."
  );
  process.exit(1);
}

console.log("No likely mojibake found.");
