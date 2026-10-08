# 整体优化方案（待评审草案）

> 文档性质：优化提案，不是执行计划。执行顺序仍以 `IMPLEMENTATION_PLAN.md` 为唯一权威；本方案中的每一项落地前，如涉及 API、数据模型、状态机或质量门变更，必须先更新对应 ADR 与 `CURRENT_PROGRESS_AND_DIFFICULTIES.md`。
>
> 依据：2026-08-03 全项目通读（CONTEXT/TOP_LEVEL_DESIGN/CURRENT_PROGRESS/IMPLEMENTATION_PLAN + 代码勘察）。

## 0. 项目目的（一句话）

帮助用户在任意学习领域建立**可验证、可复盘、可迁移**的个人知识体系：AI 负责研究、规划、诊断与追问，用户负责思考、表达与确认；系统的核心价值锚点是「AI 生成的学习路线质量」与「用户理解的真实沉淀」。

因此优化分两条主线：**A. 提升 AI 学习路线质量**（核心目标）、**B. 图谱性能优化**（已验证缺口），外加两条工程债线：**C. 服务层大文件拆分**、**D. 仓库卫生**。

---

## A. AI 学习路线质量优化（核心）

> 2026-08-03 更新：经 grill 决策（多阶段 pipeline / 单模型 / 两轮研究+抓取 / 门不变+评分报告），A1 与 pipeline 主体已按 ADR 0011 落地：首轮研究 → 来源接地 → 最多 2 轮 `course_design_critique`（独立 AiCallLog）→ 原结构质量门/修复不变；草稿携带 `qualityReport`（五维评分，非阻断）与 `sources[].grounding`，审查页展示评分报告与来源可达性徽标。剩余项为 A2（内容相关性评分）、A3（骨架确定性检查）、A4（回归基线）。

### 现状（文件级事实）

- 质量门 `evaluateCourseDesignQuality`（`web/src/lib/ai/tasks.ts:179`）只做确定性结构检查：四段 globalExplanation 非空、sources 非空且 url/reason 齐全、URL 外形启发式（`hasSpecificSourceUrl` 路径关键词、`hasSuspiciousSourceUrl` 占位符）。**不验证 URL 可达性，不验证内容相关性**（状态文档已记录此缺口）。
- 课程研究/修复 prompt（`tasks.ts` 约 L340–452）已要求联网搜索、具体课程页来源、禁止编造；修复上限 2 次、独立 `AiCallLog`，行为正确。
- `CourseDesignDraft` 结构（`validateCourseDesignDraft`，`tasks.ts:455`）仅含 taskBriefSnapshot、globalExplanation、sources、keyTradeoffs；CONTEXT.md 中的 `Reorder Rationale`、`Optimization Priority`、`Course Skeleton Selection`、`First-Principles Course Design` 目前只靠 prompt 文字约束，无结构化落点、无确定性校验。
- Stage 骨架由独立 prompt 路径生成（修复 prompt 明确不含 stages），骨架本身没有类似课程研究的质量门。
- 没有路线质量的回归评测手段：`AiCallLog` 有记录但无聚合指标，prompt 改动无前后对比基线。

### A1. 来源可达性校验（确定性，优先级最高）——已落地（2026-08-03，见 ADR 0011）

- 已实现 `web/src/lib/learning/sourceGroundingService.ts`：有界 GET（8s 超时、256KB 上限、最多 2 次 HTTPS 重定向、复用 `isSafeExternalUrl` 白名单、仅提取 title/meta/h1/正文摘要）。
- 接地结果随草稿 `sources[].grounding` 持久化并流入骨架/展开 prompt；可达性不进入布尔质量门，而是经批判轮与质量报告呈现（用户在 grill 决策中选择"门不变+评分报告"）。

### A2. 来源相关性校验（确定性地板 + 可选 AI 复核）—— 已落地（2026-08-04，见 ADR 0012）

- 确定性地板：新增 `web/src/lib/learning/sourceRelevanceService.ts`，对 A1 抓取内容（title + excerpt）与 Domain 名称/scope/goal 做中英混合分词（英文词 token + CJK bigram）加权 Dice 系数评分；`LOW_RELEVANCE_THRESHOLD = 0.15`，低于阈值标记 `lowRelevance`，在审查页展示为琥珀色「相关性偏低（仅供参考）」警告（首版只警告不阻断，积累数据后再决定是否入质量门）。`SourceGroundingInfo.relevance` 为可选字段，`score` 截断 `0–1`，不可达/无 excerpt 来源 `relevance: null`（表示无信号，非低相关）。
- 可选 AI 复核 —— 已落地（2026-08-04，见 ADR 0012「Implementation」）：独立有界任务 `source_relevance_check`（策略 60s/4000 tokens、瞬时不重试），单独 `AiCallLog`，复用已接地摘要（不二次联网）输出逐来源 `{ score(0–1), lowRelevance, reason }` 判断，合并进 `SourceGroundingInfo.aiRelevance`；`POST /api/domains/[id]/course-design/source-relevance-check` 暴露，审查页「用 AI 复核来源相关性」按钮触发；不混入课程研究主调用、不进质量门、不持久化（避免破坏 `courseDesignAiCallLogId`/确认态）。
- 渲染端继续只渲染通过白名单的 HTTPS URL。

### A3. Stage 骨架确定性检查 —— 已落地（2026-08-04）

- 新增 `web/src/lib/ai/roadmapSkeletonChecks.ts`：与地图 reconcile 同源的确定性校验，复用 `checkStagesDeterminism` 泛型函数同时覆盖骨架阶段与展开后的 Stage。检查项：Stage 数量上限（`MAX_ROADMAP_STAGES=16`）、Stage key 唯一、Stage 标题去重、每 Stage 的 `goal` 与模块方向（`coreTopics`/`moduleDirections`）非空、展开 Stage 的 `rationale` 非空、显式前置无悬空 key 引用、前置图无环（DAG）。
- `validateRoadmapSkeletonDraft`（`tasks.ts`）接入该校验：`error`（环、悬空前置 key、重复 key、超上限）阻断 → 与课程研究一致回落到确定性本地骨架；`warning`（重复标题、空 goal、空模块方向）不阻断，作为 `determinismWarnings` 随骨架持久化并经 `domains/new` 页面横幅呈现。
- 该点同时是骨架生成（`generateRoadmapSkeletonDraft`）与客户端提交（`/api/domains/[id]/map/ai-draft` 的 `validateRoadmapSkeletonDraft(payload.skeleton)`）两处入口的共用校验，复用同一份代码，不新造一套。
- 基线：`web/src/lib/ai/roadmapSkeletonDeterminism.test.ts` + `web/src/lib/ai/fixtures/roadmap-skeleton-determinism/` 下 7 个版本化 fixture（healthy / cycle / dangling / too-many / duplicate-keys / duplicate-titles / empty-goal-coreTopics），共 16 项断言，已并入 `npm run test`。

### A4. 路线质量回归基线（防止越改越差）——已落地（2026-08-03）

- 落地形态为 Vitest 基线测试而非独立 JS 脚本：`web/src/lib/ai/courseQualityBaseline.test.ts` + `web/src/lib/ai/fixtures/course-quality-baseline/` 下 5 个版本化 JSON fixture（英语语法=语言、线性代数=数学、TypeScript=编程、经典力学=理科、计算语言学=交叉），每个 fixture 录制 research 响应、critique 轮响应、grounding 结果与期望质量门结果。
- 纯校验链回归（不调 AI/网络）：`validateCourseDesignDraft` 质量门 → `validateCourseDesignCritique` → 合并 `qualityReport` → 模拟 `groundDraftSources` 接地；断言研究轮/终态质量门结果、五维评分齐全且 1–5 截断、grounding 可达计数；交叉 fixture 覆盖「占位 URL 被质量门拦截 → 批判轮替换为真实可达来源 → 终态通过」。
- 该基线已并入 `npm run test`（共 +20 项断言），并新增 `npm run verify:course-quality` 可单独运行；后续任何 prompt/校验器/质量门/批判形状改动都会自动回归，防止越改越差。
- 真实 AI 指标仍建议从 `AiCallLog` 聚合为观测统计（成功/修复率/耗时），只做观测不做门禁，尚未实现。

### A5. Prompt 结构化落点（低成本，可与 A1 并行）—— 已落地（2026-08-04）

- 把 CONTEXT.md 已有的 `Optimization Priority`（先修正确 > 目标匹配 > 认知负担 > 权威顺序 > 兴趣个性化）从冲突裁决提升为课程研究 prompt 的显式评分式要求，并要求模型在 `keyTradeoffs` 中逐条对应说明取舍所服务的优先级；`optimizationRationale` 强化为必填「顺序取舍说明」（所选顺序、相对备选为何更优、如何对应优先级）。`Reorder Rationale` 落为该段必填子段，不加 schema 字段。
- 批判 prompt 新增修订规则：检查 `keyTradeoffs` 是否逐条对应优先级、`optimizationRationale` 是否含顺序取舍说明，不满足则在 `goalMatch`/`prerequisiteCorrectness` 维度 note 中指出并修订。
- 评估是否把 `Reorder Rationale` 落为草稿结构化字段（DTO 变更，需先更新 CONTEXT/ADR）；本轮仅 prompt + advisory 质量报告承载，结构化 schema 落点留待后续。

### A6. 明确不做

- 不在发布阻断项（API Key 轮换、Mastery Evidence 门禁）解决前堆新 AI 任务类型。
- 不引入「AI 自检代替用户确认」；所有质量提升仍止于草稿与候选。

---

## B. 图谱性能优化

### 现状（文件级事实）

- `web/src/lib/layout/nodeCollision.ts`：碰撞消解为 `iterations × N²` 双重循环（默认 30 轮，调用处最高 100 轮），在渲染主线程同步执行。
- 兼容画布 `web/src/app/canvas/[canvasId]/page.tsx:796` 调 `resolveNodeCollisions`；节点位置经 `/api/words/[id]/position` 逐节点 PATCH（状态文档记录的「PATCH 风暴」风险）。
- 正式图谱页 `app/learning/domains/[id]/knowledge-graph/page.tsx` 已走正式 relations API，但布局保存能力仍在兼容层。

### B1. 批量布局保存 API

- 新增 `POST /api/domains/[id]/knowledge-graph/layout`：接收 `[{ nodeId, x, y }]`，URL Domain 归属校验 + 单事务批量写入 + 幂等（相同坐标直接成功）。
- 前端拖拽结束后一次性提交，配合 300ms 防抖；拖动中只改本地状态。
- 属于正式 API 新增 → 先在状态文档登记，再实现；兼容 `/api/words/[id]/position` 保留但不扩展。

### B2. 碰撞消解降复杂度

- 增量模式：只为「本轮移动过的节点」做碰撞消解，其余视为 pinned；配合均匀网格（spatial hash）把邻居查询降到近似 O(N)。
- 大图（N 超过阈值，如 200）时把计算移入 Web Worker，主线程只接收结果；保持算法确定性（相同输入相同输出），现有 `nodeCollision.test.ts` 行为断言不变。

### B3. 正式图谱接管布局（对齐阶段 4）

- 正式图谱页获得布局编辑/保存能力后，兼容画布降级只读；主流程不再依赖 `/canvas/[canvasId]`。

---

## C. 服务层大文件拆分（纯重构，行为不变）

按「先拆定义、再拆编排、最后拆领域服务」的顺序，每步只移动代码、保留 re-export，导入方零改动；每步门禁：`lint` + `typecheck` + `test` + `build` 全绿。

1. `web/src/lib/ai/tasks.ts`（2110 行）→ `ai/tasks/` 目录：`common.ts`（isRecord/requiredText 等）、`courseDesign.ts`、`roadmap.ts`、`diagnostic.ts`、`knowledge.ts`，原文件改为 barrel re-export。
2. `web/src/lib/ai/tutorService.ts`（2232 行）→ 编排核心 + 按任务域的执行器模块；公开函数签名不变。
3. `web/src/lib/learning/roadmapService.ts`（1561 行）、`knowledgeService.ts`（1035 行）→ 按 地图 CRUD / reconcile / DTO 转换 拆分；不把 `Word` 等兼容命名扩散进新模块。

## D. 仓库卫生

- 根目录 `package.json` + `node_modules` 是旧 schema 时代残留（仅旧 Prisma CLI 与编码检查）。方案：确认 `tools/check-encoding-garbled.ps1` 与 `web` 的 `check:encoding` 职责重叠后，把编码检查统一收进 web，删除根 `package.json`/`node_modules`；根 `prisma/` 按 ADR 保持只读迁移参考，不动。
- `knowledge-os-dashboard.png`、`沉浸式学习系统产品设计需求书 PRD v1.2.docx` 留在根目录但建议移入 `docs/` 归档（纯移动，无代码影响）。

---

## 建议执行顺序

| 序 | 项 | 理由 |
| --- | --- | --- |
| 1 | A5 prompt 结构化落点 | 零 schema 变更，立刻提升路线质量下限 |
| 2 | A1 来源可达性 | 堵住「编造来源」最大质量漏洞（先 ADR） |
| 3 | A4 回归基线 | 后续所有 prompt/门禁改动的安全网 |
| 4 | B1+B2 图谱性能 | 消除已记录的主线程与 PATCH 风暴风险 |
| 5 | C 大文件拆分 | 降低后续所有改动的冲突与认知成本 |
| 6 | A2/A3/B3/D | 按阶段 4 节奏推进 |

每一步完成标准：对应测试与 E2E 证据补齐，并更新 `CURRENT_PROGRESS_AND_DIFFICULTIES.md`；验证命令通过不等于发布合格。
