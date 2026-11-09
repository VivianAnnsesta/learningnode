# EnglishNode

EnglishNode 是单用户、本地优先的 Windows AI 学习产品。你可以从目标规划路线或直接探索问题，获得可以进入的讲解与活动，随时保存和修订个人记录，并用普通关系和主题跨领域组织内容。

当前改造依据本地完整任务书和 [ADR 0025](docs/adr/0025-unified-learning-and-personal-knowledge.md)。准确验收结果、真实模型运行和剩余限制见 [当前状态](CURRENT_PROGRESS_AND_DIFFICULTIES.md)，不把自动检查当作学习效果证明。

## 启动

已打包时，打开 `web/dist-electron/win-unpacked/Antigravity.exe`。完整目录必须保留在一起。名称与数据目录沿用现有安装，页面显示 EnglishNode；数据库不会放在构建目录。

开发桌面启动：

```powershell
cd F:\englishnode\web
npm install
npm run dev:electron
```

首次进入“AI 设置”，选择现有 Provider、模型和地址，保存密钥，再从“学习路线”“当前学习”或“个人知识网络”开始。当前配置支持 DeepSeek、OpenAI、Qwen、LM Studio 和其他 OpenAI-compatible API。模型未提供联网能力时可以使用自己粘贴的资料，来源不足会明确说明。

网页开发可用 `npm run dev`，默认 `http://127.0.0.1:3000`；它会提供数据库与 AI 设置的实际保存路径。生产桌面是主要使用方式；网页开发与打包桌面使用不同的明确目录。详细启动、旧库入口和恢复方法见 [Windows 启动与数据说明](docs/windows-start-and-data.md)。

重新构建桌面用 `npm run build:app`，不需要手工改数据库或传密钥环境变量。

## 使用流程

名称与目标 → AI 路线草稿 → 接受具体安排 → 按需展开阶段 → 自由选择学习入口。基础未知允许开始，前置不足提示并可补讲。路线改变需要版本化差异确认；教学准备不改正式地图。

路线、临时问题和个人记录共用灵活学习空间。没有固定九维五段；提问、讨论、例子和应用按问题组合。反馈可以带已有或动态活动，输入和帮助记录先保存；重复请求与失败重试不造重复题。

个人内容随时保存，允许疑问与摘录；保存、结束和完成分开。修改追加可回看的修订，记录多处引用保持同一 ID。跨领域普通联系可直接建立，AI 候选接受后才正式生效，主题不复制记录。

个人网络可按类型、领域、主题与标题/正文筛选，页面地址保留当前视图。任意页面点击“查找记录”或按 `Ctrl+K` 可快速查阅；详情页可选择另一条记录的固定修订作为引用，明确保存后查看原文及反向引用，并从一至两层已确认联系的局部图谱跳转。实现约定见 [ADR 0027](docs/adr/0027-personal-knowledge-discovery-and-reading.md)，本轮验证和桌面包限制仍以当前状态为准。

## 数据与安全

打包用户目录是 `%LOCALAPPDATA%\Antigravity`，开发默认 `web/.electron-user-data`。使用稳定 `englishnode-teaching-v2.db` 与同目录 `ai-settings.json`。已有安装库通过一致性备份、前向迁移、保真与外键检查升级；原文件与历史只读入口保留。新安装只从版本化空白 seed 初始化，后续启动不清空。

不要提交或分享真实库、密钥、用户目录或构建产物。Electron 只绑定随机 `127.0.0.1` 端口，API 需要启动期身份并校验 Host/Origin；外部来源受安全 URL 规则限制。不要在真实库运行破坏性 schema 同步。

## 维护入口

- [项目规则](AGENTS.md)、[唯一领域词汇](CONTEXT.md)、[产品设计](TOP_LEVEL_DESIGN.md)、[执行计划](IMPLEMENTATION_PLAN.md)。
- [当前状态与逐项验收](CURRENT_PROGRESS_AND_DIFFICULTIES.md)、[架构决策](docs/adr/)。
- 在 `web/` 运行 `npm run typecheck`、`npm run lint`、`npm run test`、`npm run test:e2e`、`npm run check:encoding`。
- 桌面使用 `npm run build:app`、`npm run verify:electron-runtime`、`npm run verify:electron-upgrade` 和 `npm run verify:electron-security`；迁移用 `npm run verify:migration-fidelity`。

本版本用于本机使用与持续试用，不提供永久掌握认证、全领域准确性保证或分发发布合格证明。权限与数据保护门禁继续生效。
