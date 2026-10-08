# EnglishNode

EnglishNode 是一个单用户、本地优先的 AI 导师式知识学习系统原型。它帮助用户从学习领域和任务书出发，先建立完整的领域 Stage 骨架，再逐 Stage 展开可学习节点，并把用户自己的理解沉淀为个人知识体系。

当前版本适合开发和个人实验，不适合直接分发。领域规划、可刷新恢复的创建流程、逐 Stage 展开、节点学习、最小知识沉淀、正式知识图谱、诊断作答与 AI 设置已经完成隔离数据库的浏览器流程验证；真实 Qwen 课程研究也有独立 E2E 证据。密钥隔离、桌面 API 安全、外部 URL 防护、空白 seed、迁移保真和备份优先的数据升级底座已实现。API Key 轮换、高阶掌握证据门禁和若干后续闭环仍未完成，准确状态以 [当前进度](CURRENT_PROGRESS_AND_DIFFICULTIES.md) 为准。

## 快速开始

```powershell
cd web
npm install
npm run dev
```

默认开发地址为 `http://127.0.0.1:3000`。Electron 运行时将 AI 设置保存到用户数据目录；远程 Provider 必须使用 HTTPS，本地 OpenAI-compatible Provider 仅限 loopback HTTP。不要把真实密钥写入提交内容或构建产物。

## AI Provider policy

正式 Domain Map 的首次创建和重新生成必须经过 AI 规划，因为产品目标是让 AI 承担课程结构研究、拆分与排序负担。云端联网 AI 是推荐主路径；LM Studio 等本地 OpenAI-compatible Provider 仍可配置，但同样必须通过来源、结构质量和用户确认门禁，不能作为低门槛离线替代。可信材料可以作为 AI 规划输入，人工编辑用于审查 AI 草稿；产品不提供纯人工或直接导入骨架的独立建图路径。Provider 连接测试、普通 AI 评价和课程研究是不同验证层级；只有结构化任务明确返回 `source="ai"` 才能记作真实 AI 成功，fallback 不能确认成正式地图。见 [ADR 0009](docs/adr/0009-formal-domain-map-creation-requires-ai-planning.md)。

课程研究初稿未通过结构质量门时，系统会自动执行最多两次云端 AI 修复，并为每次 `course_design_repair` 保留独立日志。修复耗尽后地图继续保持阻断，页面会列出缺失项并允许再次 AI 修复；不会要求用户改为手工建图。

## 当前领域地图主流程

```text
创建 Learning Domain 与 Task Brief
→ 服务端记录 Task Brief Confirmation，刷新后按 URL 恢复同一 Domain
→ 合并审查 Course Design Direction 和完整 Stage 骨架
→ 用户按需展开一个 Stage
→ 编辑并确认带显式前置关系的 Map Draft
→ 从目录或只读依赖图自主选择 Learning Node
→ 写下自己的理解，可选接受 AI 检查
→ 用户确认后沉淀为 seen KnowledgePoint
→ 在正式知识图谱中整理、解释并确认关系
→ 从领域地图进入诊断，先作答再获得 AI 评价与路线建议
```

地图排序不代表依赖，允许多个起点和多个前置。未完成前置只显示警告；系统不锁定节点，也不指定唯一下一节点。任何正式地图变更都必须经过版本校验和用户确认。L1 Route Suggestion 可以记录不改图的原地练习决定；L2/L3 改图建议目前只能保留为候选，未来必须先转换为版本化 Map Draft，不能从诊断页直接写图。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Next.js 开发服务器 |
| `npm run dev:electron` | 启动 Electron 开发壳 |
| `npm run lint` | ESLint 检查 |
| `npm run typecheck` | TypeScript 检查 |
| `npm run test` | Vitest 单元/API 测试 |
| `npm run test:e2e` | Playwright 主流程测试 |
| `npm run check:encoding` | 中文编码检查 |
| `npm run build` | Next.js 生产构建 |
| `npm run build:app` | Electron 打包；重建空白 seed 与合成旧库夹具，强制迁移保真和产物检查 |
| `npm run verify:electron-runtime` | 启动已打包应用，验证其可创建用户数据库并加载本地服务 |
| `npm run verify:electron-upgrade` | 用合成旧库启动已打包应用，验证备份后升级 |
| `npm run audit:release` | 审计全部运行时与开发/打包依赖；critical/high 失败阻断 |
| `npx prisma validate` | 校验 `web/prisma/schema.prisma` |
| `npx prisma migrate status` | 查看 Web 数据库迁移状态 |

## 当前架构

正式主线使用：

- `Domain`：学习领域、任务书和课程设计状态。
- `Unit`：Stage 的持久化记录；Stage 可处于 `planned` 或 `expanded`。
- `LearningNode`：可学习、诊断和复盘的节点。
- `KnowledgePoint`：用户沉淀的知识点。
- `KnowledgeGraphNode` / `KnowledgeGraphEdge`：正式知识图谱。
- `AiCallLog`：AI 与关键确认事件的追踪记录。

创建向导在首次保存后使用 `?domainId=<id>` 标识当前 Learning Domain，并从正式 Domain、Course Design 和 Map API 恢复；浏览器状态不是确认事实来源。规划输入变化会撤销 Task Brief Confirmation；Map Draft 绑定生成它的 Course Design 调用，旧草稿只能只读参考，不能继续确认。见 [ADR 0010](docs/adr/0010-persist-domain-creation-progress.md)。

`/canvas`、`/api/words/*`、`/api/relations/*` 和根目录旧 Prisma schema 仅用于兼容或迁移。新功能必须走 `/api/domains/*`，兼容层不得新增产品能力。

## 数据库生命周期

安装包携带的是版本化空白 seed，不携带 `dev.db` 或学习数据。每次打包应用启动时，既有用户库会先生成时间戳备份，再执行已提交迁移与外键检查；任一步失败都会阻断启动并保留备份。历史迁移无法从空库重放的部分由受版本控制的基线 schema 处理，后续变更仍必须采用 Prisma 增量迁移。详情见 [ADR 0006](docs/adr/0006-user-database-lifecycle.md)。

## 学习不变量

AI 输出默认是草稿、候选、解释或反馈。正式地图和正式关系必须经过用户确认；LearningNode 只有在用户提交自己的理解并再次确认后才成为 KnowledgePoint，首次状态固定为 `seen`。高阶状态仍必须由未来的 `Mastery Evidence` 门禁产生，客户端不得直接选择。`Knowledge Island` 是合理的待连接状态；`Wormhole` 必须有跨领域理由、边界、误用风险和迁移挑战证据。

当前未完成的闭环包括：L2/L3 Route Suggestion 转 Map Draft、诊断会话总评、正式长期复盘和 Stage assessment 用户入口、来源可达性/相关性校验以及 Wormhole 迁移挑战门禁。API 或候选生成存在不等于用户流程已经交付。

当前开发顺序先补齐这些既有功能闭环与可用性，再处理剩余安全发布工作；已经实现的凭据、本地 API、URL、seed 和迁移门禁不会因此放宽。

## 文档入口

- [领域词汇](CONTEXT.md)
- [当前进度与困难](CURRENT_PROGRESS_AND_DIFFICULTIES.md)
- [当前执行计划](IMPLEMENTATION_PLAN.md)
- [顶层产品设计](TOP_LEVEL_DESIGN.md)
- [历史可行性审查快照（2026-07-10）](docs/project-feasibility-review-2026-07-10.md)
- [AI 架构说明](docs/learning-ai-architecture.md)
- [知识图谱收敛计划](docs/knowledge-graph-convergence-plan.md)
- [架构决策记录](docs/adr/)
- [领域地图渐进展开决策](docs/adr/0007-progressively-expand-domain-map-stages.md)
- [地图变更型路线建议决策](docs/adr/0008-map-changing-route-suggestions-require-versioned-map-review.md)
- [PRD v1.2 执行控制基线](web/docs/prd-v1.2-execution-control.md)
- [Domain Map 规划与渐进展开流程](web/docs/research-backed-domain-map-flow.md)

## 发布前硬门禁

在发布任何安装包前，必须持续复核已实现的 userData 凭据隔离、`127.0.0.1` 本地认证、来源 HTTPS 白名单、干净 seed、备份后迁移、迁移保真、外键检查和 packaged Electron 安全交互；并完成 API Key 轮换、高阶掌握证据门禁及当前状态文档中的其他阻断项。真实 `web/prisma/dev.db` 不是 seed，具体迁移状态只以当前状态文档为准，禁止用破坏性 schema 同步处理。当前版本不满足发布条件。

## 贡献与修改

请先阅读 [AGENTS.md](AGENTS.md)。涉及数据模型、API、状态机、发布流程或产品边界的改动，必须同步更新 ADR、领域词汇和当前状态文档；不要把目标能力写成已实现能力。
