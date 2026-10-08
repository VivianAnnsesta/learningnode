# EnglishNode Agent Guide

## 当前项目边界

EnglishNode 是单用户、本地优先的 Windows 学习系统原型，使用 Next.js、Electron、Prisma、SQLite 和 React Flow。正式主线是 `Domain`、`Unit`、`LearningNode`、`KnowledgePoint`、`KnowledgeGraphNode` 和 `KnowledgeGraphEdge`；当前开发顺序是先完善现有功能和用户流程，确保领域地图核心、最小知识沉淀、现有诊断与正式图谱闭环可发现、可使用，再处理剩余安全发布工作。已经实现的安全与数据门禁不得放宽或回退，也不继续扩张高阶掌握、诊断总评或图谱高级概念。

`/canvas`、`/api/words`、`/api/relations` 和根目录 `prisma/schema.prisma` 属于兼容或旧工程边界。新功能只能使用 `/api/domains/*` 与正式领域图谱 API；兼容层不得继续扩展新的学习能力。

当前版本是开发原型，不是可发布产品。密钥隔离、本地 API 认证、`127.0.0.1` 绑定、恶意 URL 防护、版本化空白 seed、备份后迁移、迁移保真和外键校验已实现，并通过 packaged Electron 的干净 seed、旧库升级与安全交互验证。全量依赖审计已无 critical/high，Next 内嵌 PostCSS moderate 已记录临时风险接受。API Key 轮换和高阶 Mastery Evidence 门禁仍是发布阻断项；远端 CI 首次执行与 a11y 自动化仍待补齐。

## 文档权威顺序

1. `CONTEXT.md`：领域术语唯一词汇表，不放实现细节。
2. `docs/adr/`：已接受的不可逆架构决策及其原因。
3. `TOP_LEVEL_DESIGN.md`：产品目标与行为原则，不等同于已实现能力。
4. `CURRENT_PROGRESS_AND_DIFFICULTIES.md`：当前实现状态和已验证证据。
5. `IMPLEMENTATION_PLAN.md`：按当前阻断项排序的执行计划。
6. `docs/project-feasibility-review-2026-07-10.md`：历史审查快照；其中已修复项不能覆盖较新的状态文档。

当目标文档与当前状态冲突时，必须在状态文档中明确“目标/当前差异”，不能把未实现目标写成已完成事实。

`web/docs/` 与其他专题说明是辅助文档，只能解释上述权威文档，不能另立产品流程、状态或术语；发现冲突时应修改辅助文档，而不是复制一份新规则。

## 领域不变量

- AI 只能生成草稿、候选、解释和反馈；任何正式地图或正式关系变更都必须经过用户确认。
- 课程方向、来源状态和完整 Stage 骨架在一次规划审查中确认；Stage 详情只由用户逐个触发展开。
- 创建流程以 URL 中的 Domain ID 和 SQLite 持久化状态恢复；任务书确认必须是服务端记录的显式事实，相关规划输入变化后必须撤销，不能从非空文本或浏览器状态推断。
- 正式地图只保存显式前置 DAG。排序不产生依赖，允许多个起点和多个前置；未满足前置只警告，不锁定节点，也不生成唯一下一节点推荐。
- 地图变更必须先形成绑定 `mapRevision` 的 `Map Draft`，按稳定 key 事务 reconcile；不得删除已开始或已沉淀节点，不得通过通用 PATCH、路线建议接受或状态接口绕过确认。
- Route Suggestion 只是候选。`changesMap=false` 的 L1 建议可以接受但不得改变地图；L2/L3 建议在转换为绑定 `mapRevision` 的 Map Draft 并完成整图确认前必须保持不可直接接受。见 [ADR 0008](docs/adr/0008-map-changing-route-suggestions-require-versioned-map-review.md)。
- LearningNode 只有在用户写下自己的理解并明确确认后才能沉淀为 KnowledgePoint；首次状态固定为 `seen`，AI 检查可跳过且不能代替用户确认。
- 正式 Domain Map 的首次创建与重新生成必须经过 AI 规划。云端联网 AI 是推荐主路径；LM Studio/其他本地 OpenAI-compatible API 仍可作为 AI Provider，但不享有更宽松的质量门。可信材料只能作为 AI 输入或来源，人工编写和直接骨架导入不得成为独立建图路径。见 [ADR 0009](docs/adr/0009-formal-domain-map-creation-requires-ai-planning.md)。
- `Mastery Evidence` 由用户自己的解释、例子、边界、应用和迁移挑战组成；客户端不能直接把节点写成高阶掌握状态。
- `Knowledge Island` 是合理的待连接状态，不是错误数据。
- `Wormhole` 必须有跨领域理由、适用边界、误用风险和迁移挑战证据。
- 学习节点、关系和诊断 API 必须校验 URL 中的 Domain 归属。

## 数据与安全规则

- 不要把 `web/data/ai-settings.json`、`.env`、`dev.db`、Electron 用户目录或任何构建产物提交到版本控制或分享给他人。
- AI 设置只能通过 Electron 传入的 `AI_SETTINGS_PATH` 保存在用户数据目录；不得恢复工作目录回退路径，也不得把本地 API token 放入 URL、持久化数据或 renderer 状态。
- 本地 API 只接受 Electron 启动期 token、localhost Host/Origin 和对应随机端口的请求；不得绕过这条边界新增 API 调用路径。
- 不要在真实用户数据库上运行 `prisma db push --accept-data-loss`。
- 新安装只能从版本化空白 seed 初始化；不得以 `dev.db`、演示数据或用户备份替代 seed。历史迁移不能空库重放时，使用受版本控制的 Migration Baseline，不能改写既有迁移文件。
- 迁移必须先备份，再执行 `migrate deploy`，最后运行 `PRAGMA foreign_key_check` 和数据保真检查；失败时保留备份并阻断启动或打包。
- AI 返回的 URL 只允许显式白名单协议；不要把未验证 URL 直接渲染为链接。
- 任何构建、迁移或发布脚本失败都必须终止流程，不能只记录错误后继续。

## 常用验证命令

在 `web/` 目录执行：

```text
npm run lint
npm run typecheck
npm run test
npm run check:encoding
npm run build
npm run test:e2e
npm run verify:ai-provider
$env:E2E_LIVE_AI='1'; npm run test:e2e -- ai-live.spec.ts
npm run build:app
npm run verify:electron-runtime
npx prisma validate
npx prisma migrate status
```

最新通过项、测试数量、E2E 跳过项和迁移状态只记录在 `CURRENT_PROGRESS_AND_DIFFICULTIES.md`，执行前必须先读取。真实 `web/prisma/dev.db` 不得为追求状态一致而直接迁移或破坏性同步；只允许先在副本验证，再通过备份优先的用户数据库生命周期处理。验证命令通过仍不代表发布已合格。

真实 AI E2E 必须使用隔离数据库和由 `AI_SETTINGS_PATH` 指向的临时 Electron 用户数据设置；不要把临时设置放在 `test-results/`，因为 Playwright 启动时会清空该目录。测试结束后删除临时设置副本。Provider 连接成功、诊断评价成功和课程研究返回结构化 `source="ai"` 是三个不同证据；`source="fallback"` 不能记作真实 AI 成功。

云端课程研究初稿未通过确定性质量门时，服务端必须自动调用有界的 `course_design_repair`，每次修复独立记录 `AiCallLog`。当前一次请求最多修复两次；耗尽、超时或仍未通过时继续阻断正式地图，并向用户提供再次 AI 修复、切换 Provider/模型或重新生成入口，不得回退到人工建图。

## 修改要求

- 修改公共 API、数据模型、状态机或发布流程时，先更新对应 ADR/状态文档，再改代码。
- 新增领域术语时先更新 `CONTEXT.md`。
- ADR 只记录长期决策；测试数量、迁移状态和发布证据只写入 `CURRENT_PROGRESS_AND_DIFFICULTIES.md`，README 只做摘要并链接该文档。
- 领域地图实现不得恢复隐式线性依赖、唯一下一节点推荐、直接物化 KnowledgePoint 或客户端高阶掌握选择。
- 不要为了让测试变绿而放宽业务门禁；先确认状态规则和证据标准。
- 用户流程中已经存在的功能必须保持可发现：领域地图需要提供诊断和知识图谱入口；未接通的闭环要显示为不可用或待转换，不能提供必然失败的操作按钮。
- 拆分大页面/服务时保持正式领域 API 的边界，不把兼容命名扩散到新模块。
