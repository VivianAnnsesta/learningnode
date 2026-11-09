# 个人知识网络的当前实现合同

当前产品由 [ADR 0025](adr/0025-unified-learning-and-personal-knowledge.md) 定义；本说明只解释身份与引用，旧 WORMHOLE 准入及镜像同步计划已退役。

KnowledgePoint 是稳定个人身份，currentRevisionId 指向标题、正文和来源的唯一当前修订。用户编辑追加不可覆盖历史；旧 title/userUnderstanding 字段仅作导入兼容，不是第二个写入点。

LearningNodeKnowledgePoint 表达多对多任务引用。领域是可空来源或上下文，同一记录可以在多个领域打开，不复制正文。KnowledgeGraphNode 只表达视图引用或主题；成员表保持同一 KnowledgePoint ID。

KnowledgeGraphEdge 的语义端点是两个真实 KnowledgePoint ID，按端点和关系类型判重；方向性保留，仅明确对称类型规范顺序。可空领域或布局不参与知识身份，画布整理不删除语义关系。

用户可以直接建立、修改或移除普通跨域联系。AI 草稿为 candidate，读取两端修订并保存理由与不确定性；接受时检查当前端点版本，拒绝不写正式关系。confirmed 是本人接受，不是科学证明。

创建、改名和删除主题，以及加入/移出成员均可从个人知识网络操作。删除联系、主题或成员不删除记录；永久清理个人记录另需影响确认。

领域归档不删记录；地图移除任务保留学习会话、当时任务与审计快照。历史遗留布局边继续以原身份阅读，已确定映射的迁移转为真实知识端点，不凭文字相似度合并。

入口为 `/learning/knowledge` 和记录详情；领域网络是同一服务的筛选。旧 `/canvas` 转到历史读取，不再运行兼容知识编辑器。实际验收与数据保真只见 [当前状态](../CURRENT_PROGRESS_AND_DIFFICULTIES.md)。
