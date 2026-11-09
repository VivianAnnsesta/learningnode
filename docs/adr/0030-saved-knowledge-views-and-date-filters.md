# ADR 0030: 保存个人记录检索视图及来源、日期筛选

状态：已接受，2026-11-09。

## 决策

1. 新增配置模型 `SavedKnowledgeView`：`id,title,schemaVersion,configJson,version,createdAt,updatedAt`。schemaVersion与version初始为1，configJson保存受限查询和显示配置，不复制记录、不复用主题成员、不加内容/学习外键。只做前向迁移；历史表、修订、来源和旧迁移不变。空白seed必须由正式生成器重建并核验；保留独立27→28历史边界回归，另验28→29备份保真、配置重启恢复与FK完整。
2. 新正式接口位于 `/api/knowledge-points/views` 及 `/:viewId`，共用本地认证边界。POST接受 `requestId,title,config`，id由请求标识摘要确定；同号、同规范化标题/配置可复用，已有配置不同则409，不upsert覆盖。PATCH接收完整title/config与expectedVersion，DELETE接收expectedVersion；用数据库条件{id,version}原子CAS，防止另一窗口覆盖或删除新版本。GET分页读取，不创建事实；删除仅删除配置。标题trim后1至120个UTF-16单元，控制字符/不完整Unicode拒绝。
3. schemaVersion=1的config固定为 `{filters:{q,domainId,collectionId,kind,sourceType,sort,date},displayFields}`。基础条件沿用既有个人记录语义；sourceType为空或user/accepted_ai/excerpt/legacy_user/legacy_ai_or_unknown/legacy_unknown。旧两类来源独立显示，未知raw只在筛选/显示时归legacy_unknown，不改旧原文或快照；来源不表示知识已核实。无当前修订时保留既有历史内容读取回退。
4. date共有field(created/updated)与timeZone，分别指KnowledgePoint.createdAt/updatedAt，均非实际学习时间或掌握事实。mode为all、range(from/to至少一端)或last_days(days为1至3660的整数)。默认all/updated/UTC。日期为真实公历YYYY-MM-DD，两端包含；时区为Intl支持的IANA名称/别名或UTC，拒绝数值偏移，保留用户选择的有效名称以避免运行时别名映射改变存储配置。
5. 每次查询只捕获一次now，执行日期匹配时复用同一gregory/latn的Intl formatter。将每条时间按指定时区转换为YYYY-MM-DD再比较；最近N天按本地今天减N-1个公历日，不用N×24小时推算，覆盖DST。来源/日期/q与其他条件在分页前统一匹配，total/页面在同一只读快照计算，不预截断候选；沿用分批扫描、有界失败和确定性排序。响应dateWindow标明已解析日期窗口；跨日继续分页若窗口变化，界面重新读取首页。
6. displayFields只允许summary/kind/sourceType/aliases/domains/collections/createdAt/updatedAt，标题始终显示，默认summary/aliases/collections，空数组表示只显示标题。字段只影响阅读，不进行行内改正文、公式求值或任意属性执行。配置、来源及名称始终按文本显示。
7. URL/安全returnTo沿用唯一公共验证器，扩展sourceType/dateField/dateMode/dateFrom/dateTo/dateDays/timeZone/fields；fields=none表示只标题，缺省表示默认字段。日期field/timeZone在all模式也可保存为显示偏好，其他模式专用字段不得混用。重复、未知、无效条件拒绝，不静默变成全库。列表读取无效领域/主题返回原条件、空结果和不可用原因；保存时拒绝失效条件。已有视图遇条件失效或未知schema/损坏配置须明确不可运行，不能清空条件扩大范围；持久配置必须是写入时完整的规范形状，缺失字段或空对象不得用输入默认值补成全库运行。不自动改写存储，未知schema拒绝PATCH降级，显式DELETE仍可清理。
8. 打开视图在原工作区应用配置，保持新记录、主题改名等草稿。新记录保存领域单独可见，空草稿可沿用当前筛选默认值；已有草稿后切换筛选/视图不能移动其保存领域。保存后即使记录不符合当前视图也提供真实记录入口。视图菜单读取失败不阻断记录列表；409保留当前名称/配置草稿供比较、另存或明确采用新基础。保存仅捕获已应用的日期/筛选与字段；保存期间继续编辑不把后来的改动误标为已保存。

## 验收与依据

参考Obsidian官方[Properties](https://obsidian.md/help/properties)、[Views](https://obsidian.md/help/bases/views)与[Bookmarks](https://obsidian.md/help/plugins/bookmarks)的结构化阅读与命名搜索行为。项目先服务已有记录元数据，不扩展通用表格编辑器或高级图形编辑。

纯合同验证真实日期、闰年、IANA/UTC、DST/跨日、相对窗口、字段/URL白名单和规范化配置。隔离SQLite/HTTP验证来源类别、日期/q/领域/类型/主题共同分页、尾页、无读取写入、创建复用、并发CAS、失效条件和未知schema不扩大结果。真实页面验证配置创建/重开/更新/删除、重载与returnTo、字段选择、草稿领域保留、错误重试/409及保存后记录入口；原迁移、备份、空白seed、打包、升级和安全门禁继续保留。具体数量与实际结果仅见当前状态文档，不以局部通过宣告整批完成。
