# 学习与 AI 实现说明

本说明解释 [顶层设计](../TOP_LEVEL_DESIGN.md) 与 [ADR 0025](adr/0025-unified-learning-and-personal-knowledge.md)，不定义另一套流程。验证状态只见 [当前状态](../CURRENT_PROGRESS_AND_DIFFICULTIES.md)。

## 共享业务路径

课程规划使用现有 courseDesignService、roadmapService 和 ai/tasks；planningVersion=3 继续保存总目标、课程内容问题、阶段代表问题及具体单元职责。一次正式路线接受代替重复任务书确认，局部阶段修复由系统保留其他阶段与已确认总目标。

learningSessionService 是节点、记录和独立问题共用的教学写入。progressiveTeachingService 仅做节点上下文适配。teachingContracts/flexibleTeaching 与 progressiveTeachingTasks 使用灵活 v4 结构，不调用退役 nodeTeachingService/nodeTeachingTasks。

personalKnowledgeService 负责个人身份、不可覆盖修订、引用、普通联系和主题；knowledgeService/knowledgeGraphService 的正式入口引用同一事实来源。旧 Word/CoreEssence 写入已关闭，不双写。

learningActivityService 唯一执行节点开始/完成及同事务 LearningProgress 审计。普通反馈不调用诊断总评或固定 L1/L2/L3 建议；nextLearningActionService 根据真实活动和待解问题给可进入去向。

## 身份、材料和恢复

会话 scopeKey 在创建重试和重新备课时稳定，requestId 必填。框架版本与正文材料版本分别保存；成功提交才公开新版本。输入、提示、解答曝光与活动动作绑定真实材料、步骤和活动。重试尝试令牌隔离迟到结果。

AI 动态内容通过服务校验并分配材料身份，与反馈动作原子提交。AI 只选择有效已存对象或给内容草稿，不能发明数据库 ID。GET 与历史读取不调用 AI，重复读取不研究整课。

来源按实际片段选择，保留文字、位置和版本。用户保存内容时快照包括已见帮助与原材料；未见答案不能通过记录来源旁路泄露。

## 模型与质量

延用配置 Provider 和原始调用日志。联网能力缺失时显式转为用户资料与待核对解释；认证、限流或连接失败仍失败，不冒充离线检索成功。

结构校验只证明协议合法。规划报告只以原文、已有要求和严重后果阻断；来源缺口与普通改善保留建议。报告格式失败有界修复报告，耗尽标不可用并保留原候选。

核心知识核对针对实际主张、答案和内部矛盾，明确错误局部修正，最多两次。正文发现框架错回到框架新版本，旧材料与输入保留。核对不可用或不确定均显示事实，不声称权威认证。

## 正式接口

- `/api/domains/*`：领域、内部备课、版本化地图、阶段展开与节点教学适配。
- `/api/learning-sessions/*`：统一创建、恢复、框架、按需材料、进度、反馈、活动、来源、疑点核对和下一步。
- `/api/knowledge-points/*`、`/api/knowledge-collections/*`：正式个人修订、引用、关系与主题。
- `/api/learning-history/*`：固定来源、只读分页及历史摘录。

URL 中领域归属、用户确认、来源 URL 安全、本地身份和数据生命周期门禁继续生效。旧接口只用于必要历史适配或返回退役状态，不再承接新能力。
