# EnglishNode 项目可行性与代码审查

审查日期：2026-07-10

> 历史快照：本文记录 2026-07-10 当时的代码与风险，保留用于追溯，不代表当前实现或产品边界。密钥隔离、本地 API 边界、URL 防护、空白 seed、备份优先迁移、显式 DAG、稳定 key reconcile、Domain 归属校验和首次 `seen` 沉淀等后续修复，请以 [`CURRENT_PROGRESS_AND_DIFFICULTIES.md`](../CURRENT_PROGRESS_AND_DIFFICULTIES.md) 为准；无 AI 建图建议已由 [ADR 0009](adr/0009-formal-domain-map-creation-requires-ai-planning.md) 明确取消。

## 结论

EnglishNode 的产品方向和基础技术方案是可行的：以 Next.js、Electron、Prisma、SQLite 和 React Flow 构建单用户、本地优先的 Windows 学习工具，足以承载“任务书 → 课程设计 → 领域地图 → 学习 → 诊断 → 知识沉淀”的原型闭环。当前代码也已具备较完整的页面、服务、API、数据模型和自动化测试骨架。

但当前版本仍是开发原型，不具备安全发布、可靠升级或承载长期个人知识数据的条件。发布阻断项集中在四个边界：密钥与桌面安全、数据库升级与迁移保真、掌握状态的证据门禁、AI 研究结果的真实性。现有测试全部通过，但这些风险大多位于测试未覆盖的语义和发布边界。

建议把当前完成度理解为：

- 产品概念可行性：高。
- 单机原型技术可行性：高。
- 核心学习闭环完整度：中等。
- 数据可靠性：低。
- 桌面发布安全性：低。
- 当前发布就绪度：不通过。

## 审查范围与基线

本次审查以当前未提交工作树为准，而不是仅审查 `HEAD`。工作树正在进行一次旧学习模型到 PRD 语义模型的大迁移，变更规模约为 165 个文件、5779 行新增和 9660 行删除；同时存在运行缓存、数据库和 E2E 改动。结论因此描述“当前正在收敛的版本”，不代表某个已发布标签。

覆盖范围包括：

- 根目录产品设计、执行计划、领域词汇和 ADR。
- `web/src/app` 页面与 API。
- `web/src/lib/learning`、`web/src/lib/ai` 和布局代码。
- Prisma schema、迁移和当前 SQLite 数据库。
- Electron 启动、构建、打包和运行验证脚本。
- Vitest、Playwright、类型、Lint、编码、生产构建和依赖审计。

## 已验证的工程基础

以下验证在当前工作树通过：

- `npm run lint`：零错误、零警告。
- `npm run typecheck`：通过。
- `npm run check:encoding`：未发现疑似乱码。
- `npm run test`：48 个测试文件、226 个测试全部通过。
- `npm run build`：Next.js 生产构建通过。
- `npm run test:e2e`：3 个 E2E 通过，1 个真实 AI 测试按配置跳过。
- `npx prisma validate`：schema 有效。
- `npx prisma migrate status`：迁移记录显示已应用。

这些结果说明代码具备继续修正的基础。它们不能证明迁移保真、桌面安全、状态机正确或 AI 事实可靠。

## P0：发布阻断项

### 1. 生产构建会打包真实 API Key

AI 设置以明文 JSON 保存在 `process.cwd()/data/ai-settings.json`；当前文件含真实 API Key。Fresh production build 已实证把该文件复制到 `.next/standalone/data/ai-settings.json`，同时复制 `.env`。Electron 构建脚本再整体复制 standalone 目录到发布资源，因此下一次打包会把当前 Key 带入应用包。

证据：

- 设置路径与明文写入：[settingsService.ts](../web/src/lib/ai/settingsService.ts#L34)、[settingsService.ts](../web/src/lib/ai/settingsService.ts#L83)
- 整体复制 standalone：[build-electron.js](../web/scripts/build-electron.js#L98)

影响：任何拿到安装包、解包目录或构建产物的人都可能取得密钥并产生费用或访问相应模型服务。

立即措施：停止发布或分享当前构建产物；轮换当前 Key；禁止运行时设置参与 Next 文件追踪；把凭据迁到 Electron `userData` 和操作系统凭据库；在 CI/打包前增加 secret scan。

### 2. 桌面后端暴露到局域网，且可形成密钥外带链

Electron 仅为“寻找空闲端口”绑定了 `127.0.0.1`，但启动 Next standalone 时没有设置 `HOSTNAME`。生成的 standalone server 默认使用 `0.0.0.0`。所有 API 均无认证，包含领域删除、AI 设置修改和付费 AI 调用。

设置更新在请求未提供 `apiKey` 时会保留旧 Key；攻击者可把 `baseUrl` 改成其控制的地址，再触发连接测试。Provider 会把保留的 Key 作为 Bearer Header 发往该地址。

证据：

- 启动环境未设置 `HOSTNAME`：[main.js](../web/main.js#L183)
- 无认证 AI 设置写接口：[route.ts](../web/src/app/api/ai/settings/route.ts#L18)
- 保留旧 Key：[settingsService.ts](../web/src/lib/ai/settingsService.ts#L86)
- 向配置地址发送 Bearer Key：[openaiCompatibleProvider.ts](../web/src/lib/ai/openaiCompatibleProvider.ts#L289)
- 无认证领域删除接口：[route.ts](../web/src/app/api/domains/[id]/route.ts#L47)

Electron 同时关闭 Chromium sandbox：[main.js](../web/main.js#L24)、[main.js](../web/main.js#L243)。

修复方向：强制 Next 绑定 `127.0.0.1`；为进程间 HTTP 增加启动期随机令牌并校验 `Origin/Host`；限制 Provider URL；恢复 renderer sandbox；阻止主窗口导航到非应用 origin。

### 3. AI 来源 URL 可成为同源脚本执行入口

课程来源质量门只调用 `new URL()` 并检查 pathname 是否像课程路径，没有限制协议。`javascript:fetch('/api/...')//course/course` 的 pathname 含 `course`，可以通过结构检查。创建页随后把 AI 返回值直接放入 `<a href>`。当前 React 18 对 `javascript:` URL 只告警，不会阻断。

证据：

- URL 外形检查：[tasks.ts](../web/src/lib/ai/tasks.ts#L176)、[tasks.ts](../web/src/lib/ai/tasks.ts#L208)
- 直接渲染来源链接：[page.tsx](../web/src/app/learning/domains/new/page.tsx#L545)

影响：恶意 Provider、被提示注入的模型或污染的研究结果可诱导用户点击并在应用 origin 执行脚本，随后调用无认证 API、删除数据或联动密钥外带链。

修复方向：输入端和渲染端同时只允许 `https:`（必要时允许 `http:` 的明确开发白名单）；禁用 `javascript:`、`data:`、`file:`；使用 Electron `will-navigate`/`setWindowOpenHandler` 拦截并通过系统浏览器打开可信外链；增加严格 CSP。

### 4. 数据库发布、升级和迁移流程会污染或丢失数据

当前 `web/prisma/dev.db` 不是空模板；审查时包含 5 个 Domain、95 个 LearningNode、6 个 KnowledgePoint 和 172 条 AiCallLog。构建脚本把这个开发库复制进发布包，新用户会继承开发数据和 AI 调用摘要。

应用启动只在用户数据库不存在时复制模板，对已有用户库不执行 `prisma migrate deploy`、版本检查、备份或回滚。构建阶段反而对开发库执行 `prisma db push --accept-data-loss`，且失败只记录错误后继续打包。

证据：

- 构建期接受数据丢失并吞掉失败：[build-electron.js](../web/scripts/build-electron.js#L40)
- 复制开发数据库：[build-electron.js](../web/scripts/build-electron.js#L107)
- 仅首次复制用户数据库：[main.js](../web/main.js#L101)

迁移本身也不保真：`KnowledgePoint` 新增 `language`、复盘时间、间隔和 `manualBranchesJson` 后没有从旧表回填，就删除了 `Word`、`InferenceTree`、`TreeNode` 和 Tag 系列表。迁移前 Git 数据库中 6 个 Word 都有 language、5 棵 InferenceTree 和 12 个 TreeNode；迁移后 6 个 KnowledgePoint 的相应字段和 manual branches 全为空。

证据：

- 新增字段：[migration.sql](../web/prisma/migrations/20260708190000_remove_legacy_models/migration.sql#L64)
- 未回填即删除旧表：[migration.sql](../web/prisma/migrations/20260708190000_remove_legacy_models/migration.sql#L374)
- 项目承诺迁移不破坏数据：[IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md#L118)

此外，当前数据库的 `PRAGMA foreign_key_check` 返回 12 条 `AiCallLog → Domain` 违例；全部 95 个 LearningNode 状态为旧语义 `not_started`，且 0 条依赖；6 条正式关系的 evidenceStrength 全为 `unknown`，并存在 1 组重复边。

修复方向：发布空白且版本化的 seed DB；启动时先备份再运行迁移；为每次迁移做前后计数、字段校验和 `foreign_key_check`；补写保真迁移；构建失败必须终止；禁止将个人开发库作为发布资源。

### 5. “可验证掌握”没有服务端证据门禁

学习页只要求一段 `userUnderstanding`，用户可直接选择 `can_transfer` 或 `integrated`。服务层不检查解释、例子、边界、练习、诊断、关系或迁移挑战，直接保存所选状态。API 空 payload 还会默认完成为 `can_apply`。

同时选择“已融入体系”和“知识孤岛”会产生自相矛盾的数据：KnowledgePoint 被写为 `island`，LearningNode 却按用户选择被写为 `mastered`。

证据：

- UI 自报状态：[page.tsx](../web/src/app/learning/domains/[id]/items/[itemId]/page.tsx#L481)
- 空 payload 默认 `can_apply`：[domainMapService.ts](../web/src/lib/learning/domainMapService.ts#L595)
- island/mastered 分裂：[roadmapService.ts](../web/src/lib/learning/roadmapService.ts#L640)
- 产品掌握标准：[TOP_LEVEL_DESIGN.md](../TOP_LEVEL_DESIGN.md#L407)

影响：推荐、阶段评估、复习调度和图谱状态都建立在不可信数据上，产品最核心的差异化承诺失效。

修复方向：把 Mastery Evidence 建模为不可跳级的服务端状态机；状态由可审计事件推导，不由客户端直接指定；`integrated` 至少要求复述、应用、迁移证据和正式关系或明确的合理孤岛结论。

### 6. 图谱候选会绑定到错误源节点

知识图谱页为节点 A 生成 relation candidates 后，切换到节点 B 不会清空旧候选；保存候选时却读取当前 `selectedNode`。结果是 A 的 AI 理由被持久化为 B 指向 target 的关系。保存后候选仍未清空，数据库也没有边唯一约束，因此可重复写入。

证据：[page.tsx](../web/src/app/learning/domains/[id]/knowledge-graph/page.tsx#L102)、[page.tsx](../web/src/app/learning/domains/[id]/knowledge-graph/page.tsx#L172)、[page.tsx](../web/src/app/learning/domains/[id]/knowledge-graph/page.tsx#L439)、[schema.prisma](../web/prisma/schema.prisma#L277)

修复方向：候选必须携带不可变的 `sourceKnowledgePointId`；切换选择时取消/清空请求与候选；保存时服务端复核候选来源；增加业务唯一约束和幂等键。

### 7. 依赖版本存在已知高危漏洞

当前固定使用 Next.js 14.2.5。`npm audit --omit=dev` 报告 7 个漏洞，其中包含 1 个 critical、5 个 high、1 个 moderate；Next、lodash/dagre、Playwright/PostCSS 均有报告。因为当前 Next 服务还暴露到局域网，这不是纯理论风险。

证据：[package.json](../web/package.json#L31)

修复方向：先升级受支持的 Next/React 组合并回归所有 API/E2E；评估替换或升级 dagre/graphlib；在 CI 固定执行依赖审计和 lockfile 检查。

## P1：核心闭环与架构缺口

### 1. “Research-Backed” 目前只验证文本形状

质量门不抓取来源、不验证 HTTP 状态、不核对页面内容与课程方向，也没有主课程来源字段。LM Studio、DeepSeek 和通用 OpenAI-compatible Provider 不会自动启用搜索工具，仍可返回幻觉或 404 URL并通过门禁。

验证器还会为缺失的 task brief snapshot 和四段全局说明填默认文本，使原本应失败的字段通过门禁：[tasks.ts](../web/src/lib/ai/tasks.ts#L419)。

`CONTEXT.md` 定义的单次自动 Research Repair Attempt 没有实现。生成函数在 gate 失败时直接保存并返回；`course_design_repair` 只有策略常量和 prompt builder，没有调用路径：[tutorService.ts](../web/src/lib/ai/tutorService.ts#L783)。

> 后续状态：该缺口已于 2026-07-19 修复并由 ADR 0009 重新定义为最多两次自动修复；当前事实以根目录状态文档为准。

建议把来源抓取与内容摘要变成独立、可审计的研究工件；保存 URL、标题、抓取时间、内容哈希、引用理由和可达性；结构门与事实门分离；真正实现一次 repair 后再交给用户决策。

### 2. 地图依赖被强制压平成一条线

持久化地图时，代码删除该 Domain 的全部 Unit 和 LearningNode，然后按遍历顺序为每个节点添加“前一个节点”依赖，不解析 AI 给出的真实 prerequisite。分支、并行模块和多前置关系都会变成单链；重新生成地图也会切断历史节点标识和进度关联。

证据：[roadmapService.ts](../web/src/lib/learning/roadmapService.ts#L362)

建议让 AI 返回稳定 `nodeKey` 和显式 prerequisite keys；先校验 DAG，再做 diff/reconcile，而不是 delete-and-recreate；保留学习记录与知识点映射。

### 3. 离线/手动降级与创建断点恢复不可用

无 AI 时本地 Course Design Draft 明确 gate=false，确认接口又拒绝未过 gate 的草稿，因此用户无法进入正式地图；也没有手工地图或可信骨架导入入口。创建 wizard 只把 ID 保存在页面内存，中途离开或刷新后不能恢复，详情页又只能把用户送回空白 `/new`。

证据：[tutorService.ts](../web/src/lib/ai/tutorService.ts#L377)、[courseDesignService.ts](../web/src/lib/learning/courseDesignService.ts#L126)、[page.tsx](../web/src/app/learning/domains/new/page.tsx#L108)

这与“AI 失败时系统仍支持手动学习”的验收目标冲突。

> 后续状态：无 AI 独立建图路径已由 ADR 0009 明确取消；创建断点恢复已于 2026-07-19 按 ADR 0010 落地。本文保留的是 2026-07-10 历史判断。

### 4. 提示、练习、诊断和虫洞尚未形成证据闭环

- 用户可直接请求五级完整答案，没有服务端提示历史与逐级升级门禁。
- AI 练习只展示题面和 expected reasoning，没有作答、评价或记录。
- 诊断没有“提交会话 → 总评 → 完成”的状态迁移，expectedAnswer 还会随普通 session DTO 返回客户端。
- 虫洞确认只要求解释、证据强度、边界和风险，不校验已完成的 transfer challenge。

这些功能能演示，但还不能为 Mastery Evidence 提供可靠输入。

### 5. 路由资源归属校验不一致

多个嵌套 API 路径带有 `domains/[id]`，处理函数却只按 `nodeId` 操作，完全忽略 `params.id`。例如 complete、start、hint、practice 和 check-answer。构造 `/domains/A/nodes/B/complete` 可修改属于其他 Domain 的 B。

证据：[route.ts](../web/src/app/api/domains/[id]/nodes/[nodeId]/complete/route.ts#L4)

建议所有服务入口统一接受 owner ID，并使用复合条件查询；不要把 URL 中的资源边界仅当装饰。

### 6. 状态仍是无约束字符串，正式与兼容图谱语义分裂

Prisma 中 roadmap、node、mastery、relation、evidence 等状态都是自由字符串，没有 enum、check constraint 或统一转换边界。兼容画布把 candidate、confirmed 和 rejected 关系画成相同边，可能把已否定关系表现成事实。正式图谱的跨域、导入导出和部分复盘功能又仍跳回 2846 行的兼容画布页面。

建议先定义唯一状态机与转换表，再删除兼容层的写能力；兼容画布只读并明确标注状态，最终收敛到正式图谱。

### 7. 页面与服务过于集中，性能策略不适合规模化图谱

最大文件包括：兼容画布页面 2846 行、AI tasks 2040 行、tutorService 2020 行、roadmapService 1159 行、knowledgeService 975 行。边界混合导致状态机、Provider、持久化和 DTO 兼容逻辑难以独立验证。

兼容画布布局执行约 `80 × N²` 碰撞循环，并对每个节点逐个 PATCH 坐标；节点达到数百时会出现主线程卡顿和请求风暴。

建议按 Course Research、Roadmap Planning、Learning Session、Assessment、Knowledge Graph、Review 分模块；新增批量位置 API；布局移入 Worker，并对大图做视口裁剪和增量计算。

## P2：工程与体验优化

- 为主要表单补 `<label>`、错误/进度 `aria-live`、dialog 语义、焦点锁、Escape 和 reduced-motion；不要移除 React Flow 焦点轮廓。
- 为网络请求增加 AbortController、超时、重试边界和 `finally`，避免永久 loading/busy 和旧响应覆盖新状态。
- 创建页有未定义 CSS 变量，qualityGate missing 未完整展示，错误 banner 的视觉语义不一致。
- 根目录和 `web/` 各有一套 Prisma schema/database，容易在错误目录运行命令；应收敛为单一工作区。
- `.electron-user-data` 和两份 `dev.db` 已被 Git 跟踪；应从版本控制移除运行态数据，并在清理前做凭据与隐私检查。
- 本次审查后已补齐 README、AGENTS 和领域词汇；当前仍缺 SECURITY、CONTRIBUTING 和 CI 配置，仍需补启动、数据目录、迁移、发布、威胁模型和恢复说明。
- 增加迁移保真测试、状态机性质测试、UI 组件测试、a11y 测试、恶意 URL 测试、网络失败测试、规模性能测试和 packaged Electron E2E。

## 推荐优化顺序

### 阶段 0：立即止血

1. 轮换 API Key，删除构建输入与产物中的明文设置。
2. 绑定 `127.0.0.1`，增加本地 API 随机令牌，限制 Host/Origin。
3. 对来源 URL 做协议白名单，拦截 Electron 外部导航，恢复 sandbox。
4. 升级存在 critical/high 漏洞的依赖。
5. 暂停对外分发当前安装包和数据库模板。

### 阶段 1：建立可升级的数据底座

1. 产出空白 seed DB，个人数据只进入 `userData`。
2. 实现“备份 → migrate deploy → foreign_key_check → 失败回滚”。
3. 修复 legacy 数据回填，增加逐字段迁移验收。
4. 建立唯一状态词汇、数据库约束、边唯一性和领域归属约束。

### 阶段 2：把产品承诺变成服务端不变量

1. 定义 Mastery Evidence 与不可跳级状态机。
2. 修复 relation candidate 的不可变来源和幂等写入。
3. 把地图 prerequisite 变成显式 DAG，并用 reconcile 更新。
4. 把来源可达性、内容相关性和 repair 变成真实质量门。

### 阶段 3：补齐学习闭环

1. [已取消] 当时建议增加手工创建/可信课程骨架导入；2026-07-19 已确认正式建图必须经过 AI 规划，只保留创建流程断点恢复。
2. 完成提示历史、练习作答与评价、诊断会话总评。
3. 用 transfer challenge 约束 `can_transfer`、`integrated` 和正式 Wormhole。
4. 收敛正式图谱与兼容画布。

### 阶段 4：模块化、性能与交付工程

1. 拆分超大页面和服务，建立清晰领域模块。
2. 批量持久化图谱位置，迁移高开销布局到 Worker。
3. 建立 CI、发布检查、数据库恢复演练和 packaged E2E。
4. 补可访问性、网络韧性、可观测性和用户数据导出/恢复。

## 最终可行性判断

如果定位为“个人开发者自用、允许实验数据丢失的 AI 学习原型”，现状已经可运行，且测试和构建基础良好。

如果定位为“可分发、可升级、用户会长期积累个人知识的桌面产品”，当前版本不可发布。先完成阶段 0 和阶段 1，再谈功能扩张；否则新增功能会继续建立在不安全的密钥边界、不可靠的数据迁移和不可验证的掌握状态之上。

在不扩大范围的前提下，完成安全与数据发布底座、修复两项核心语义漏洞并建立针对性回归测试，属于可控工程；真正兑现完整 PRD 的诊断、迁移、虫洞、长期复盘和研究真实性，则是后续独立产品阶段。

## 已确认的产品边界

本节是当时的边界记录，已被 ADR 0009 部分取代：正式 Domain Map 现在必须经过 AI 规划，云端联网 AI 是推荐主路径；本地 OpenAI-compatible Provider 仍属于 AI 路径，但纯人工创建和直接骨架导入不再是有效的独立建图路径。
