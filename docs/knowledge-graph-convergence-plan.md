# Knowledge Graph Convergence Plan

## 目标

在保留知识图谱能力的前提下，让正式学习流程彻底摆脱兼容画布 `web/src/app/canvas/[canvasId]/page.tsx` 的依赖。

收敛后的判断标准只有一条：用户在 `web/src/app/learning/domains/[id]/knowledge-graph/page.tsx` 和对应 `/api/domains/[id]/knowledge-graph/*` 路径下，已经可以完成日常图谱构建、确认、复盘和使用；兼容画布不再是主流程必经入口。

## 当前问题

当前系统已经出现了两个不同定位的图谱入口：

- 正式图谱页：`/learning/domains/[id]/knowledge-graph`
  - 面向学习域。
  - 已接入 `KnowledgePoint` / `KnowledgeGraphNode` / `KnowledgeGraphEdge`。
  - 已支持关系候选、关系确认、核心概念整理、关系解释。
- 兼容画布页：`/canvas/[canvasId]`
  - 仍承载自由布局、导入导出、遗留 `Word` / `WordRelation` 交互、跨画布 wormhole 搜索。
  - 仍直接依赖 `/api/words/*`、`/api/relations/*`、`/api/canvas/[id]/import`、`/api/canvas/[id]/export`。

这会带来三个直接问题：

- 主流程语义已经切到 `Domain` / `LearningNode` / `KnowledgePoint`，但图谱编辑能力仍部分挂在旧画布语义下。
- 用户会把兼容画布误认为正式工作台，导致新旧模型继续并存。
- 后续如果要删除旧 API 或旧命名，兼容画布会持续拖住迁移。

## 收敛原则

- 图谱保留，画布降级。保留“知识点与关系”的能力，不保留“自由白板”作为主产品心智。
- 领域优先，不再以 canvas 为中心组织图谱。正式入口统一归到 `Domain`。
- 结构化优先，不再把自由拖拽当作图谱编辑的核心能力。关系创建、确认、解释、复盘都走结构化工作流。
- 兼容层只做过渡，不新增功能。所有新能力只落在 `/api/domains/[id]/knowledge-graph/*`。

## 必须保留的图谱能力

以下能力属于正式图谱能力，应继续保留并补齐到领域图谱页：

- 图谱总览：列出知识点、关系、孤岛点、掌握状态。
- 关系候选生成：从选中知识点出发，由 AI 生成候选关系。
- 人工确认闭环：支持接受、弱化、拒绝、补充说明、补证据强度。
- 关系解释：能解释“为什么这两个点相关、边界在哪里、误用风险是什么”。
- 核心概念聚类：识别当前知识体系中的核心概念与优先缺口。
- 跨域连接语义：`WORMHOLE` 仍可保留，但语义改为“跨知识域链接”，不再依赖“跨画布跳转”。

## 应迁出兼容画布的能力

这些能力仍然有价值，但不应继续绑定在兼容画布页面上：

- 导出图谱
  - 现状：`/api/canvas/[id]/export`
  - 目标：迁到 `/api/domains/[id]/knowledge-graph/export`
  - 语义：导出的是领域图谱，不是画布快照。
- 导入图谱
  - 现状：`/api/canvas/[id]/import`
  - 目标：迁到 `/api/domains/[id]/knowledge-graph/import`
  - 语义：导入结果写入 `KnowledgePoint` / `KnowledgeGraphNode` / `KnowledgeGraphEdge`。
- 跨域目标检索
  - 现状：兼容画布中按其他 canvas 搜索 wormhole 目标。
  - 目标：改成领域级“跨域知识点搜索”，由正式图谱页发起。
- 关系详情编辑
  - 现状：部分依赖旧 `/api/relations/*`。
  - 目标：统一走 `/api/domains/[id]/knowledge-graph/relations/*`。

## 可以直接退场的能力

以下能力不应继续作为正式图谱能力投入：

- 自由白板式拖拽编辑作为主编辑范式。
- 以 `Word` / `WordRelation` 命名暴露给新页面或新 API。
- 以 canvas 为单位理解知识体系。
- 在兼容画布中继续新增 AI、诊断或学习闭环能力。

说明：

`positionX` / `positionY` 可以作为“视图布局缓存”短期保留，但不能再成为主流程前提。即使未来仍有节点位置，也应只是领域图谱页的可选布局元数据，而不是自由画布产品本身。

## 目标形态

正式图谱收敛后的产品形态建议如下：

- 唯一正式入口：`/learning/domains/[id]/knowledge-graph`
- 页面分成四类任务，而不是一块无限画布：
  - 总览：看当前知识点、关系、孤岛、掌握度。
  - 选点：查看单个知识点的核心要义、关联、候选关系。
  - 审核：集中处理候选关系、弱关系、待补证据关系。
  - 跨域：显式搜索其他领域的知识点并建立 `WORMHOLE`。

如果需要图形化展示，建议使用“受控布局图”而不是“自由白板”：

- 布局由状态、关系强度、是否孤岛等规则生成。
- 用户可以切换视图密度或聚焦范围。
- 可选保留少量布局微调，但不暴露为旧画布那种独立工作台。

## 数据与 API 收敛

收敛后的数据边界应明确为：

- `Domain`：知识体系归属边界。
- `KnowledgePoint`：知识点内容实体。
- `KnowledgeGraphNode`：图谱展示与状态载体。
- `KnowledgeGraphEdge`：图谱关系载体。

正式 API 应收敛到：

- `GET /api/domains/[id]/knowledge-graph/relations`
- `POST /api/domains/[id]/knowledge-graph/relations`
- `PATCH /api/domains/[id]/knowledge-graph/relations/[relationId]`
- `DELETE /api/domains/[id]/knowledge-graph/relations/[relationId]`
- `POST /api/domains/[id]/knowledge-graph/relation-candidates`
- `POST /api/domains/[id]/knowledge-graph/relations/[relationId]/explain`
- `POST /api/domains/[id]/knowledge-graph/organize-core`
- `GET /api/domains/[id]/knowledge-graph/export`
- `POST /api/domains/[id]/knowledge-graph/import`
- `GET /api/domains/[id]/knowledge-graph/link-targets`

旧路径处理原则：

- `/api/words/*`、`/api/relations/*` 进入冻结状态，只允许兼容层调用。
- `/api/canvas/[id]/import`、`/api/canvas/[id]/export` 先改为 wrapper，再逐步下线。
- 新前端禁止新增任何 canvas 路径依赖。

## 实施阶段

### Phase 1: 正式图谱补齐缺口

目标：让用户不必打开兼容画布也能完成主要图谱工作。

- 在领域图谱页补齐导入、导出入口。
- 在领域图谱页补齐跨域知识点搜索与 `WORMHOLE` 建立。
- 把所有关系详情更新统一收口到 `/api/domains/[id]/knowledge-graph/relations/[relationId]`。
- 明确 UI 文案：兼容画布是过渡工具，不是正式工作台。

完成标准：

- 新建领域后，图谱维护全程不需要访问 `/canvas/[canvasId]`。
- E2E 主流程仅覆盖 `/learning/domains/[id]/knowledge-graph`。

### Phase 2: 兼容层降级为工具页

目标：把兼容画布从主功能降级为维护工具。

- 兼容画布入口从主导航移除。
- 页面文案改成“遗留图谱维护工具”。
- 禁止在兼容画布中继续接入新能力。
- import/export 的真实实现迁到 domain graph，canvas API 只做代理转发。

完成标准：

- 新用户在正常路径下看不到 canvas 入口。
- 兼容画布只剩历史数据迁移和兜底维护用途。

### Phase 3: 删除主流程对 legacy graph API 的依赖

目标：旧模型不再拖住正式图谱。

- 盘点 `web/src/app/canvas/[canvasId]/page.tsx` 中仍依赖的 `/api/words/*`、`/api/relations/*`。
- 若仍需保留历史工具，则改成调用新的 domain graph wrapper。
- 前端与测试中移除 `Word` / `WordRelation` 作为主语义。

完成标准：

- 主流程、E2E、文档中不再把 canvas 当作知识图谱主入口。
- `/api/words/*`、`/api/relations/*` 只剩兼容壳，或已经可以删除。

## 验收标准

满足以下条件，才算真正完成“保留图谱能力、但不再依赖兼容画布”：

- 用户可以在领域图谱页完成图谱浏览、候选生成、关系确认、关系解释、核心概念整理。
- 用户可以在领域图谱页完成图谱导入导出。
- 用户可以在领域图谱页完成跨域连接，不需要进入旧 canvas 搜索 wormhole 目标。
- 新增功能、测试、文档全部不再引用 `/canvas/[canvasId]` 作为主路径。
- 兼容画布即使保留，也只承担历史迁移或紧急维护职责。

## 建议的下一步

按投入产出比，建议先做下面三件事：

1. 新增 `/api/domains/[id]/knowledge-graph/export` 和 `/import`，把现有 canvas import/export 逻辑迁过去。
2. 在 `knowledge-graph/page.tsx` 增加跨域知识点搜索与 `WORMHOLE` 创建入口，替掉兼容画布上的 wormhole 选择流程。
3. 把兼容画布首页文案和入口降级，明确它只是遗留维护工具。
