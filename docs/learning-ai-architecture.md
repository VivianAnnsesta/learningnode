# Learning AI Architecture

> 状态：当前实现说明（2026-10-06 更新严重缺陷复核、可修订规划及分段生成边界）。本文区分正式主线、兼容边界和仍未完成的产品目标；实时验证证据以 `CURRENT_PROGRESS_AND_DIFFICULTIES.md` 为准。

## 当前主线

项目以 PRD v1.2 语义模型为主线：

- `Domain`：学习领域与任务书、课程设计状态。
- `Unit`：Domain Map 中 Stage 的持久化记录，状态为 `planned` 或 `expanded`。
- `LearningNode`：可学习、可诊断、可复盘的最小节点。
- `KnowledgePoint`：用户已经沉淀的知识点。
- `KnowledgeGraphNode` / `KnowledgeGraphEdge`：知识体系图谱。
- `AiCallLog`：AI 调用及关键用户确认事件的追踪记录，优先关联 `domainId`。

Web 的正式 schema 已以 `Domain` / `Unit` / `LearningNode` / `KnowledgePoint` / `KnowledgeGraph*` 为主。`GraphCanvas` / `Word` / `WordRelation` 是兼容语义和旧 API 命名，不应继续扩展为新功能；当前 Web 迁移已经删除部分旧表，根目录 `prisma/schema.prisma` 仍是独立的旧 schema，不能与 Web 数据库混用。

## 数据写入边界

- `domainService` 以 `Domain` 为准；Task Brief Confirmation 作为服务端时间戳持久化，相关规划输入变化后撤销。兼容同步不是发布前的数据迁移替代品。
- `courseDesignService` 以 `Domain` 保存课程设计状态。
- `roadmapService.saveRoadmapDraft` 保存绑定正式 `mapRevision` 与当前 Course Design `AiCallLog` ID 的候选地图；`replaceRoadmap` 校验稳定 key 和显式 prerequisite DAG，并在事务中声明规划门禁后 reconcile `Unit` / `LearningNode`，拒绝过期版本、旧课程设计草稿和已学习节点删除。
- 排序只负责展示，不生成隐式依赖；多个起点、多前置和并行分支均为正式语义。
- `domainMapService.completeLearningNode` 只接受用户自己的理解，调用 `saveLearningNodeProgress` 在一个事务内创建或更新 `KnowledgePoint`、关联 `LearningNode` 和 `KnowledgeGraphNode`；首次知识状态由服务端固定为 `seen`。不存在直接物化或客户端选择高阶掌握的正式入口。
- `progressiveTeachingService` 在沉淀前分别保存九维整课框架、按需生成的五段正文及材料版本、学习位置、个人理解/作答草稿、提示/解答曝光、问答反馈与带原始记录引用的摘要。正式 `/teaching` API 已切换到此服务，旧 `nodeTeachingService` 仅保留历史规格与测试的依赖。目标或概念范围变化建立新框架，普通作答不使框架失效；材料重备保留旧版本与作答绑定。教学不写入 KnowledgePoint 或高阶掌握，见 [ADR 0017](adr/0017-concept-curriculum-and-progressive-teaching.md)。
- Course Design Direction 与完整 Stage 骨架在地图确认事务中一起成为正式状态，避免部分确认。
- `contentCoverageVersion=1` 在课程目标下登记具体内容问题与材料说明要求，模块保存稳定引用，阶段和模块的目标集合由系统汇总。概念和当前材料步骤提供可回查位置；内容覆盖不表示学习者掌握。个人自我解释由用户保存、修订和确认，不调用 AI 复核；针对教学步骤的主动提问和可选思考反馈仍保留，见 [ADR 0020](adr/0020-traceable-course-content-coverage.md)。
- 规划语义复核使用 `reviewPolicyVersion=1`，重大缺陷需要实际目标、原文、既定要求和严重后果；一般改进及来源覆盖缺口保留为提醒。整体未确认规划可修订内容问题，记录承接关系与修订前后内容，仍经覆盖、引用、DAG 和版本校验；局部阶段修复继续保留课程级内容。自动修复只处理重大缺陷，无进展或失败保留最后有效草稿，见 [ADR 0021](adr/0021-critical-review-and-revisable-planning.md)。
- `updateLearningDomain` 修改任务书时用事务更新 `Domain` 与节点/路线图复核状态；`AiCallLog.canvasId` 只是历史兼容字段，不代表 Web 仍有 `GraphCanvas` 写模型。
- Route Suggestion 只记录候选。L1 可以记录不改图的原地练习决定；L2/L3 必须先转换为绑定 `mapRevision` 的 Map Draft，不能通过接受建议接口直接改图。转换流程尚未实现，见 [ADR-008](adr/0008-map-changing-route-suggestions-require-versioned-map-review.md)。

## API 约定

新功能优先使用 `/api/domains/*`：

- `/api/domains`
- `/api/domains/[id]`
- `/api/domains/[id]/task-brief`
- `/api/domains/[id]/map`
- `/api/domains/[id]/nodes/[nodeId]/*`
- `/api/domains/[id]/diagnostics/*`
- `/api/domains/[id]/knowledge-graph/*`

`/api/learning/*`、`/api/learning-nodes/*`、`/api/roadmap-items/*` 已从当前主工作树移除，不得重新引入。`/api/relations/*` 和 `/api/words/*` 只服务兼容画布；领域地图、学习节点、知识图谱页面都应走 `/api/domains/*`。

## AI 可用性与降级边界

正式 Domain Map 的首次创建和重新生成必须经过 AI 规划。云端联网模型是推荐主路径；LM Studio/其他本地 OpenAI-compatible API 仍可作为 AI Provider，但必须通过同一质量门。可信材料只能作为 AI 输入或来源，人工编辑只用于审查 AI 草稿；系统不提供纯人工或直接导入骨架的独立建图路径。

AI 链路按“可确认、可回退、可追踪”设计：

- 任务书生成保存领域入门导引、代表问题、关键假设与可编辑建议；生成建议不直接改写已确认目标。
- 课程设计先做资料依据和质量门检查，未通过不得确认地图。
- 领域地图生成支持骨架和阶段分批生成，降低长输出失败概率。
- 完整 Stage 骨架包含目标覆盖与代表性完整问题，先整体审查；用户触发展开时采用 planningVersion=3 的教学单元及多问题覆盖，复用既有内容而不制造依赖，每次展开都进行语义复审。按 ADR 0024 的目标允许合理合讲，重点核对所需知识是否有实际教学承接；运行时对齐状态见 CURRENT_PROGRESS_AND_DIFFICULTIES.md。
- JSON 解析按最外层对象深度扫描，避免内嵌 Markdown 代码块截断。
- AI 不可用时，本地 fallback 只保留失败上下文或未通过质量门的可编辑草稿；它不能绕过课程研究确认，也不能被转换成正式地图。恢复动作是修复配置、切换 Provider/模型、重试或重新生成。
- Provider 连接、普通评价任务和课程研究是不同验证层级；只有结构化任务返回 `source="ai"` 才能作为真实 AI 任务成功证据，fallback 不能冒充成功。
- 课程研究初稿未通过确定性质量门时，服务端自动执行最多两次 `course_design_repair`；修复使用独立任务策略和 `AiCallLog`。耗尽或 Provider 失败时保存最后一版不合格草稿、继续阻断地图，并允许页面显式再次触发 AI 修复。
- 每次关键 AI 或用户确认写入 `AiCallLog`，失败可回看任务类型、输入摘要、模型和状态。

课程研究已有结构校验、公开 HTTPS HTML/PDF 有界抓取与来源片段提取、有界自动修复，以及提示性的相关性信号；来源可达和模型自审不等于内容正确或目标覆盖完整。独立课程参照与真实内容验收仍是后续工作。

教学使用可回查来源片段及本地关键词选择，结构/引用检查后进行独立内容复核，最多两次修复。资料不足允许明确标注的待核对解释。GET 不触发 AI，段落与框架生成状态落库；历史框架只读，提示和解答在曝光记录保存后公开。新运行库由 `teaching-database.js` 从版本化空白 seed 初始化为 `englishnode-teaching-v2.db`，开发与 Electron 共用库选择及原生命周期门禁，旧库只备份留存。

教学内容复核沿用 ADR 0021 的重大缺陷标准：框架检查安排与稳定定义，正文检查当前段落；建议/来源局限不阻断。无效报告仅重试报告，不能当成材料缺陷。段落修复保持框架不变，全部调用与失败原因绑定到对应会话或段落。

目标/当前差异：服务端能校验证据结构和引用，但不能因此证明模型的学科判断正确；框架与正文使用同模型复核，仍可能将实际知识错误降级或把错误框架当作事实依据。当前段落修复不能纠正上游框架。框架核心事实的独立核对及发现上游错误后的新框架纠正流程尚未接通，实际内容验收与完整学习链结论以状态文档为准。

## 剩余迁移点

当前剩余迁移点：

- 兼容画布仍直接调用 `/api/words/*`、`/api/relations/*`，对应页面和类型仍保留 `Word` / `WordRelation` 命名。
- `tutorService`、`tasks.ts`、`diagnosticService` 内部仍有部分 `roadmapItem` 命名，语义上已对应 `LearningNode`，后续可以继续内收。
- Canvas import/export 与 legacy graph payload 仍是独立兼容层，后续应明确是否长期保留。
- L2/L3 Route Suggestion 转 Map Draft、诊断总评、`long-term-review` / `stage-assessment` 正式页面及旧 hint/practice API 的独立入口尚未接通。沉淀前教学、提示、练习、答疑与恢复已由节点页的新 `/teaching` 流程交付，旧 practice 仍保留沉淀后语义。
- 删除旧 API 目录前，需要先确认 Electron 兼容画布和导入导出链路不再依赖这些路径，或为外部依赖保留稳定 wrapper。

凭据隔离、localhost 绑定、本地 API 认证、干净 seed、备份优先迁移和外键检查已经实现；它们仍是每次发布必须回归的门禁。剩余发布阻断项以 `CURRENT_PROGRESS_AND_DIFFICULTIES.md` 为准，决策见 [ADR-005](adr/0005-desktop-release-gates.md) 与 [ADR-006](adr/0006-user-database-lifecycle.md)。

图谱侧的收敛路线见 `docs/knowledge-graph-convergence-plan.md`。
