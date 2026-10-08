# PRD v1.2 执行控制基线

更新日期：2026-10-06（教学与自我解释部分按 ADR 0017、0020 更新）

本文把当前已确认的产品门禁转成页面与服务边界。领域词汇以根目录 `CONTEXT.md` 为准，长期决策以 `docs/adr/` 为准，实现证据以 `CURRENT_PROGRESS_AND_DIFFICULTIES.md` 为准。

## 1. 当前聚焦

当前只优先完成两件事：

1. 让用户先建立完整、可解释、可渐进展开的 Domain Map。
2. 让用户从地图进入 Learning Node，并把自己的理解最小化沉淀为 `seen` KnowledgePoint。

Mastery Evidence、完整诊断闭环、正式 Wormhole 和图谱高级能力不得反向扩大这一里程碑。

## 2. 主流程

```text
创建 Learning Domain
→ 保存并确认 Task Brief
→ 生成 Course Design Direction 与完整 Stage 骨架
→ 用户在一次规划审查中合并确认
→ 用户按需选择并展开一个 Stage
→ 编辑、保存和确认 Map Draft
→ 从目录或只读依赖图自主选择 Learning Node
→ 准备范围明确的九维教学框架与前置安排，按需生成和学习教学段落（ADR 0024 允许合理合讲；实现状态见当前状态文档）
→ 自由提问、跳过思考或继续
→ 写下自己的理解
→ 用户确认沉淀为 seen KnowledgePoint
→ 查看并维护正式知识图谱
→ 从领域地图进入诊断，先作答再获得 AI 评价与路线建议
```

课程方向与 Stage 骨架的确认必须原子化；任何一部分失败都不能留下部分确认状态。

## 3. 页面职责

### 3.1 首页

- 展示 Learning Domain 入口、地图是否仍在展开和已展开部分的事实进度。
- 仍有 `planned` Stage 时不显示全领域完成百分比。
- 不生成或展示唯一下一节点推荐。
- 不承载诊断、地图编辑或图谱编辑工作台。

### 3.2 创建领域页

- 采集领域目标、范围、排除项、深度、当前水平证据和 Expected Output。
- Task Brief、Course Design Direction 和地图内容在成为正式状态前都可编辑。
- 规划审查必须同时展示来源状态、课程依据、全部 Stage、Stage 前置和 Module 方向。
- 详细 Learning Nodes 不在首次规划中一次性生成。

### 3.3 领域地图页

- 提供 `Stage → Module → LearningNode` 目录与同源只读依赖图。
- `planned` Stage 由用户逐个触发展开，AI 不自动展开。
- 未完成前置只显示警告和影响，不锁定节点。
- 排序不代表依赖；允许多个起点、并行分支和多个前置。
- 地图结构变更只能形成 Map Draft，不能直接改正式地图。

### 3.4 Learning Node 页

- 围绕一个核心问题收集一段用户自己的理解。
- 个人自我解释由用户修订和确认，不交给 AI 复核；教学步骤的主动提问和可选思考反馈不作为沉淀条件。
- 用户明确确认后才创建或更新 KnowledgePoint，首次状态固定为 `seen`。
- 页面和通用 API 不允许直接选择 `can_apply`、`can_transfer` 或 `integrated`。

### 3.5 诊断页

- 诊断只生成评价、补救候选或地图修改建议。
- 任何改变地图的建议必须转换为绑定版本的 Map Draft，再走完整地图确认流程。
- 接受路线建议本身不能直接插入、删除或重排正式节点。
- 当前只允许直接接受不改图的 L1 建议；L2/L3 转 Map Draft 尚未实现，页面必须保持不可直接接受。

### 3.6 知识图谱页

- 只展示和维护用户已经确认的 KnowledgePoint、正式关系及候选关系。
- AI 关系候选不能自动成为正式关系。
- 兼容 Canvas 不得重新成为领域学习主入口。

## 4. 正式地图门禁

### 4.1 结构

- 每个 Stage 和 Learning Node 必须有稳定 key。
- 前置引用必须存在，不能引用自身，整个显式图必须无环。
- Stage、Module 和节点显示顺序不能推导出隐式前置边。

### 4.2 草稿与并发

- Map Draft 必须携带其基于的 `mapRevision`。
- 正式确认使用原子比较并递增版本；过期写入返回冲突，不覆盖新地图。
- 正式地图在草稿编辑期间仍可使用。

### 4.3 成果保留

- 确认时按稳定 key reconcile，保留已有 Unit/LearningNode 标识、进度和 KnowledgePoint 关联。
- 已开始或已沉淀节点不得被首版地图删除。
- 直接物化 KnowledgePoint、通用节点状态 PATCH 和地图变更型路线建议接受均不是合法写入路径。

### 4.4 所有权

- URL 包含 Domain ID 的节点、诊断和关系 API 必须校验资源确实属于该 Domain。
- 不能把路径中的 Domain ID 当作展示参数。

## 5. AI 与来源边界

- 正式 Domain Map 的首次创建与重新生成必须经过 AI 规划；云端联网 AI 是推荐主路径。
- 本地 OpenAI-compatible 模型仍是 AI Provider，但不获得更宽松的质量门；可信材料只能作为 AI 输入或来源。
- 人工编辑仅用于审查 AI 草稿，纯人工创建、直接骨架导入和 fallback 都不能成为正式地图。
- AI 输出仍必须通过结构、来源、版本和用户确认门禁。
- 课程研究质量门失败时自动执行最多两次云端 AI 修复，并分别记录 `course_design_repair`；修复耗尽后保持地图阻断，允许用户再次 AI 修复或重新生成。
- 后续 Stage 生成应读取已记录的用户理解，使远期内容能够适应真实学习情况。

## 6. 当前证据与剩余工作

领域地图核心与最小 `seen` 沉淀闭环已有服务测试和浏览器 E2E：规划/单 Stage 草稿恢复、版本冲突、分支 DAG、成果保留、完整骨架确认后由用户触发展开、AI 成功不代替确认、AI 失败降级，以及正式/兼容 API 的首次状态门禁均已覆盖。隔离数据库用户流程还验证了诊断入口、作答与真实 AI 评价、L1 建议、正式图谱关系确认及 AI 设置；真实云端课程研究与缺来源草稿的 Qwen `course_design_repair` 任务均有 `source="ai"`、质量门和独立日志证据，初稿失败后的自动触发另由确定性服务测试覆盖。后续高阶状态和 L2/L3 Map Draft 转换仍未完成。详细状态只维护在根目录 `CURRENT_PROGRESS_AND_DIFFICULTIES.md`，后续顺序只维护在 `IMPLEMENTATION_PLAN.md`。
