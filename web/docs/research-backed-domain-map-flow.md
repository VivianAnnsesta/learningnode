# Domain Map 规划与渐进展开流程

更新日期：2026-07-19

本文描述当前确认的 Domain Map 形成流程。正式建图必须经过 AI 规划，云端联网 AI 是推荐主路径；来源标签、结构门禁和用户确认彼此独立。

## 1. 核心决定

EnglishNode 不从一个短 prompt 一次生成全部详细 Learning Nodes。系统先形成 Course Design Direction 和完整 Stage 骨架，让用户判断课程依据、范围和整体进阶是否合理；之后只在用户请求时展开单个 Stage。

这样做的原因是：

- 用户能在生成大量细节前纠正错误方向。
- 整体 Stage 结构仍然可见，不会因分批生成失去全局体系。
- 后续 Stage 可以利用用户已经沉淀的理解和困难进行调整。
- 每次详细地图变更都能以较小草稿审查、恢复和重试。

## 2. AI 规划路径与输入

### 2.1 云端联网 AI

网络模型研究课程、教材、官方文档、考试大纲或信誉良好的课程页面。通过研究质量门并保留可验证来源后，结果可标记为 `Research-Backed Course Skeleton`。

### 2.2 本地 AI Provider

LM Studio 或其他本地 OpenAI-compatible Provider 可以生成候选结构，但不享有更宽松的来源和结构质量门，也不被视为与云端模型质量等价的默认路径。没有可验证外部来源时，不能使用 Research-Backed 标签，也不能确认正式地图。

### 2.3 可信材料输入

用户可以向 AI 规划流程提供已知教材、课程大纲或官方资料。系统保留来源和验证状态，由 AI 综合为候选骨架，再执行共同结构校验。

### 2.4 用户审查

用户可以编辑 AI 生成的 Course Design Direction、Stage、Module 方向和节点，然后整体确认。产品不提供从空白开始人工编写完整骨架或直接导入骨架形成正式地图的独立路径。

## 3. 规划阶段

### 3.1 Task Brief

Task Brief 至少明确 Learning Domain、目标、范围、排除项、当前水平证据、Expected Output 和深度约束。它是活文档；显式确认由服务端持久化，相关规划输入变化后撤销，修改不会静默重写正式地图。

创建向导首次创建 Domain 后把 ID 写入 URL。刷新或重启时，页面从正式 Domain、Course Design 和 Map API 恢复确认、研究草稿、修复次数和 Stage 骨架；不从非空文本推断确认，也不保存第二份 localStorage wizard 状态。Map Draft 绑定生成它的 Course Design 调用 ID；绑定失配时只读展示，正式确认事务会同时校验任务书确认、课程设计状态/调用 ID、草稿绑定/内容和 `mapRevision`。已有正式地图时返回正常 Domain 页面。

### 3.2 Course Design Direction 与完整 Stage 骨架

同一规划审查中展示：

- 来源路径和验证状态；
- 理论骨架、来源依据、优化理由、风险与验证点；
- 全部 Stage 的稳定 key、标题、目标和 rationale；
- 显式 Stage prerequisites；
- 每个 Stage 的预计 Module directions；
- 关键取舍。

用户确认时，Course Design Direction、完整 Stage 骨架和确认审计在同一个正式地图事务中写入。确认失败不得留下部分确认状态。

## 4. 单 Stage 展开

每个 Stage 初始为 `planned`。用户可以在看见前置警告的情况下选择任意 Stage 展开；系统不指定唯一下一 Stage，也不自动展开。

生成输入包括：

- 已确认的 Task Brief 与 Course Design Direction；
- 当前 Stage 的目标、rationale 和 Module directions；
- 显式 Stage prerequisites；
- 当前正式地图版本；
- 用户在已学习节点中保存的理解摘要。

输出只包含该 Stage 的 Modules、Learning Nodes 和显式 node prerequisite keys。生成结果先保存为 Map Draft，用户可编辑、重试或放弃。

## 5. Map Draft 校验与确认

草稿必须满足：

- Stage 和 Learning Node 稳定 key 完整且唯一；
- 所有 prerequisite key 都能解析；
- 无自依赖和有向环；
- 排序没有被转换为依赖；
- 已开始或已沉淀节点未被删除；
- `baseRevision` 与当前正式 `mapRevision` 一致。

确认时按稳定 key 事务 reconcile，保留既有标识、进度和 KnowledgePoint 关联。版本过期时拒绝写入并要求刷新；AI、诊断建议或通用节点 API 都不能绕过这一入口。

## 6. 地图阅读与学习

确认后的地图同时提供 Stage/Module/LearningNode 目录和只读依赖图。允许多个根节点、并行分支和多前置关系；未满足前置只显示警告，不锁定节点。

系统不生成唯一下一节点推荐。用户依据领域体系、当前目标和前置警告自主选择 Learning Node。

Learning Node 仍是计划对象，不是正式个人知识。只有用户写下自己的理解并明确确认后，系统才在单个事务中创建或更新 KnowledgePoint、LearningNode 关联和 KnowledgeGraphNode；首次状态固定为 `seen`。依 ADR 0020，个人自我解释不由 AI 复核，教学步骤的主动提问和可选思考反馈不能代替用户确认。

## 7. 进度语义

只要仍存在 `planned` Stage，系统就不展示虚假的全领域完成百分比，只报告已展开 Stage 的事实进度。完整骨架表示用户看见了领域范围，不表示所有细节已经生成或所有知识已经掌握。

## 8. 当前限制

- 研究质量门目前主要验证结构与 URL 外形，尚未完成来源可达性和内容相关性核验。
- 结构质量门失败后会自动执行最多两次云端 AI 修复并独立记日志；耗尽后显示缺失项并允许再次 AI 修复。Provider 配置失败仍需通过配置检查、Provider/模型切换或重新生成恢复，不再规划人工建图或直接骨架导入绕过。
- 规划恢复、单 Stage 恢复、冲突提示、AI 失败降级和完整骨架确认后展开均已有浏览器 E2E；测试数量和最新通过时间只维护在根目录状态文档。
- L2/L3 Route Suggestion 转换为绑定版本的 Map Draft 尚未接通；完成前只能保留候选，不能直接接受改图。
- 高阶 Mastery Evidence 不属于当前最小沉淀流程。

## 9. 决策入口

- `docs/adr/0001-research-backed-domain-map-generation.md`
- `docs/adr/0002-confirm-course-design-before-domain-map.md`
- `docs/adr/0003-task-brief-changes-do-not-silently-rewrite-domain-map.md`
- `docs/adr/0004-course-research-results-must-pass-quality-gate.md`
- `docs/adr/0007-progressively-expand-domain-map-stages.md`
- `docs/adr/0008-map-changing-route-suggestions-require-versioned-map-review.md`
- `docs/adr/0009-formal-domain-map-creation-requires-ai-planning.md`
- `docs/adr/0010-persist-domain-creation-progress.md`
