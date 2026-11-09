# 当前设计与开发进度

## Obsidian 借鉴能力连续优化（2026-11-08）

第四批已发布[草稿PR #4](https://github.com/VivianAnnsesta/learningnode/pull/4)，首轮源HEAD `3b9dd8dada5f21b6edfa2788e9c489ada64ef364`。两套[专项PR](https://github.com/VivianAnnsesta/learningnode/actions/runs/42600823733)/[专项push](https://github.com/VivianAnnsesta/learningnode/actions/runs/42600769136)均11文件/178测试及13页面通过；两套完整unit均113文件/968测试通过，含新13项SQLite/HTTP及2项迁移。完整[push](https://github.com/VivianAnnsesta/learningnode/actions/runs/42600769078)页面23过/9原配置跳过/1失败，[PR](https://github.com/VivianAnnsesta/learningnode/actions/runs/42600823938)22过/9跳过/2失败，desktop均未执行，当前不合并。旧分页用例删除主题后仍期待静默清空条件，与ADR0030冲突，正改为验证失效条件保留/空结果、用户明确清除后再执行原分页与数据不变断言；PR另有探索入口URL原5秒断言失败，正读取真实trace核因，不放宽门禁或重跑旧失败。

官方29空白seed已从push专项工件13666285106取回：ZIP SHA256 `d8c9e3c9cf85220eb1cff84a5557b3b8529852d53a8c9c3c399d95b264e58bcb`等于工件digest，绑定上述run/head；seed SHA256 `0ade6591a708733d12adc28a9136968ed5c9f817f69651edc42b2799e1d107c9`、495616字节等于官方报告。26业务表全空，29个迁移checksum与远端LF Git blob逐项相符，SavedKnowledgeView七字段/版本默认1/无外键、aliases默认[]、FK0/integrity ok；root另用内存SQLite独立核验。原28 seed保留在ignored后已复制官方29原字节到源码，尚待增量发布；真实用户库/原index/旧迁移未变。失败日志及哈希索引在 `web/test-results/knowledge-views-2026-11-09/`，官方工件和独立核验在 `web/test-results/saved-views-migration-2026-11-09/official-seed-42600769136/`。

PR浏览器官方工件13665439670已核验ZIP digest后读取：真实探索POST成功并携带正确记录/修订/问题/returnTo，目标页面GET为200；URL断言最后采样仍是记录页，紧接失败后的frame已是该POST创建的会话URL。trace支持导航/冷编译与5秒采样重叠，未完成的会话API请求不算失败响应，也不据此声称无限期正常。回归补充点击前注册精确创建回应及对应会话页面回应、校验200并等待页面响应结束，再执行原5秒URL断言；保留60秒总门、来源修订/返回和删除关系数据断言，生产代码不变。两个页面文件独立TypeScript、full-product定向ESLint及全项目encoding通过；此修复与失效主题回归尚待新头实际CI。

### 第四批过程记录

以下保留对应提交当时状态；最新失败、seed与待验以上方源HEAD记录为准。

第四批依据[ADR 0030](docs/adr/0030-saved-knowledge-views-and-date-filters.md)实现来源/日期筛选、命名保存检索视图和只读显示字段。目标/当前差异：公共合同、配置模型/CAS、界面及回归已接通，尚未完成本批真实SQLite、迁移、页面或桌面验收；日期指记录创建/更新时间，视图不复制内容或改变学习事实。真实用户库、原index和旧迁移不动；旧27→28回归固定历史边界，新28→29保真及官方29 seed仍待CI，不复用上一批成功覆盖本批未验证状态。

本批全项目typecheck/lint/encoding、Prisma schema validate及脚本/YAML静态检查通过；6个纯文件136/136通过，含58公共配置/日期和33导航规则，新增4条页面文件独立TypeScript通过。UI六组合成API交互及两张已目视检查截图在 `web/test-results/obsidian-views-2026-11-09/ui-preview/`，覆盖点击时配置快照、迟到打开保护、双CAS、草稿领域、跨日重置和菜单错误隔离；另有外部删除404后主动刷新列表的独立交互及第三张截图通过，pageerror为0。root/协作审读新增页面测试后补了删除冲突前的菜单就绪等待，保持原断言/时限；这些仍不是真实数据库/E2E证据。

数据支4项原生用例本机唯一尝试在首次query被Application Control阻止加载query-engine DLL，0业务expect；未反复重试或绕过。SQL-only副本完成新表形状/default、raw别名/来源/指针/旧ledger及配置version2重开、固定27→28投影检查，明确不是Prisma或正式seed成功。证据在 `web/test-results/saved-views-migration-2026-11-09/`；正式source seed28仍为原官方 `1d3e3089…ea37`，待成功CI产出29工件、核验远端LF/哈希后更新。损坏持久化配置新增完整规范形状guard，不能缺省补为全库；仅URL/新输入允许公共默认值。

第四批共享配置/URL/日期合同58/58纯测试已通过，含标题-only字段、六类来源、旧来源独立、无效配置/重复参数拒绝、闰年、时区别名和数值偏移拒绝、DST跳时/重复小时、请求跨日now固定及原时间字段选择。新模型/client与数据代码已接通，原生SQL/配置CRUD、迁移和页面仍待实际结果；不能把纯规则通过替代这些门禁。

第三批收尾文档源 `0bacf71a687ab1e07d4c2686f38674b153df2b1d` 的[main CI](https://github.com/VivianAnnsesta/learningnode/actions/runs/42592447109)已真实全成功：884测试、20页面通过/9原配置跳过、28空白seed、保真和完整桌面门禁。它相对已验证f213仅两文档不同；当前第四批仍须独立完成验证，旧成功不覆盖新代码。

第三批别名与未引用提及已通过本轮既定门禁并合并 GitHub main：[PR #3](https://github.com/VivianAnnsesta/learningnode/pull/3)，合并提交 `efa7911b3204f42621f72c92f5a8ced1680d362e`，已验证源 HEAD `f213a799c2c1ab93ee4cd1942a736ad781491e82`。别名随不可覆盖修订保存，省略保留、显式清空和历史各自保留；列表、Ctrl+K和引用选择器共用字面Unicode检索并显示别名命中。未引用提及只扫其他当前正文，准确计数分页并展示原文段落，打开来源后由用户选取引用并明确保存，不自动建立语义关系或学习事实。

本批[完整 PR CI](https://github.com/VivianAnnsesta/learningnode/actions/runs/42590218707)与[完整 push CI](https://github.com/VivianAnnsesta/learningnode/actions/runs/42590208820)均真实成功：110文件/884测试（含11项别名/提及SQLite/HTTP及2项新迁移回归），完整页面20通过/9按原配置跳过；Prisma、归档旧schema夹具、迁移保真及FK0；Electron42.11.16打包、空白seed运行、旧库升级和安全交互均通过。[专项 PR](https://github.com/VivianAnnsesta/learningnode/actions/runs/42590218436)与[专项 push](https://github.com/VivianAnnsesta/learningnode/actions/runs/42590208587)均94/94及9/9页面通过，覆盖三个别名入口、清空/历史、候选转引用、读取重试及409草稿恢复。完整日志与哈希索引 `f213-full-ci-evidence.json` 在 `web/test-results/record-names-2026-11-09/`，原夹具失败保留且未重跑。

已取回正式CI生成的28版版本化空白seed并核验ZIP/文件/报告与远端迁移blob；25业务表全空、28个checksum匹配、默认[]、FK0和integrity ok。真实27→28生命周期验证先备份、4旧修订/多段来源/当前指针及其他字段原样、重复启动不改数据；不可覆盖trigger和FK保持启用并有拒绝回归。真实用户数据库/AI设置、原index/历史和旧迁移没有修改。本机已安装桌面包未替换；这是隔离SQLite、页面及Windows包运行证据，真实AI教学、长期学习效果及既有分发限制仍分别处理。当前审计0 critical/0 high、11项既有moderate，未放宽阈值。

持续优化目标保持进行中，接续处理来源/日期筛选、命名保存检索视图和只读显示字段；模板、日期回看、剪藏及导出范围仍保留，未实现部分不算交付。

### 第三批过程记录

以下保留对应提交当时的待验、草稿、seed准备及原失败状态；最新完成事实以上方已验证源HEAD为准。

第三批已及时发布[草稿 PR #3](https://github.com/VivianAnnsesta/learningnode/pull/3)，源提交 `cd16960cdac9366c57c841fc546997600133739b`，main未改。首轮[push专项](https://github.com/VivianAnnsesta/learningnode/actions/runs/42587602789)真实89/93，[push完整](https://github.com/VivianAnnsesta/learningnode/actions/runs/42587602786)真实879/883；4个失败均为新增夹具直接UPDATE既有KnowledgePointRevision，被原 `KnowledgePointRevision_immutable` trigger拒绝（Prisma呈现P2003），不是别名写入命令的部分保存。正在把所需raw别名/来源于首次INSERT时准备，并保留原业务断言及不可覆盖保护，补充直接修改被拒绝且原值不变的证据；不删trigger、不关FK、不重写旧迁移。页面/桌面未运行，不记通过。

首轮[PR完整](https://github.com/VivianAnnsesta/learningnode/actions/runs/42587832410)同样879/883及同4处夹具失败；原PR/push完整失败日志和哈希已保留。夹具修复已完成，仅改新增测试文件：raw别名/来源在首次INSERT提供，服务创建的去重、历史/搜索/提及/尾页原断言均保留；新增第11项直接修改被拒绝、整个修订与当前DTO及审计数量不变的回归。全项目typecheck与该文件lint通过，修后SQLite尚未运行；官方seed工件取回后与该修复一并发布新头，仍须完整真实验收。

同一首轮CI的正式生成器已实际产出28版空白seed，验证25业务表全空、28迁移checksum全匹配、aliases默认[]、FK0及integrity ok；2项新迁移回归真实通过，含4旧修订/多段来源/指针、先备份和重复生命周期保真。官方工件 `versioned-empty-seed` 已上传，待取回核验后更新版本化seed；它与本机SQL-only副本证据分开。首轮完整失败日志保存在 `web/test-results/record-names-2026-11-09/`，所有新头仍须完成真实专项、完整页面和桌面门禁。

官方seed已从工件13658969001取回并更新 `web/prisma/seed.db`：ZIP SHA-256 `ed14ed37de981dcc15f037d8f53e5baad46bf4b8e37401dc54eb78ad35d54b72` 与GitHub工件digest相等，seed SHA-256 `1d3e30896aa46a13bf5e1f59f1a9a5aced2e6d23610fca7eface32bac30bea37`、487424字节与官方报告一致。生成run/head绑定42587602789/cd16960，28个迁移SQL的canonicalLF Git blob SHA1逐项等于远端tree，ledger SHA256逐项相符；另有独立内存SQLite核验25表0行、默认[]、FK0和integrity ok。原27 seed保留在ignored证据中，旧ledger没有手改。完整证据在 `web/test-results/aliases-migration-2026-11-09/official-seed-42587602789/`。后续增量仅测试夹具、重试模拟稳定性、官方seed和状态，仍保持草稿PR，不用seed成功替代整批验收。

本批全项目typecheck、lint、encoding通过；名称/来源/导航/别名输入5个纯文件合计67/67通过，新增3条页面文件独立TypeScript检查通过。另有5组合成API浏览器交互和已目视检查截图在 `web/test-results/obsidian-aliases-2026-11-09/ui-preview/`，包括三入口命中提示、候选分页/来源跳转/明确引用、409草稿保留、清空/历史和重试；原mock导航/announcer定位问题保留。这些不能当作新10项SQLite/HTTP、2项迁移或真实E2E已通过。本批React清单审读未见新增异步覆盖草稿、未确认写入或HTML执行问题；真实长库性能、迁移与原生引擎结果继续待CI。

数据支先按 ADR 0005 明确隔离验证顺序：新增前向字段后，在 CI 测试前显式生成client并从版本化baseline/迁移重建空白seed；补充含非空个人修订、多个来源及当前指针的27→28备份优先升级保真。当前旧seed只读核验为27迁移、25业务表全空、FK0、integrity ok。工作区最后一条历史迁移为CRLF，其旧seed checksum与原字节一致而发布树为LF；保留该旧seed和审计，不修改历史SQL或用户库ledger，新seed以规范化发布字节核验。本机AppControl仍阻止原生query engine，SQL-only副本验证与CI真实migrate deploy必须分别记证据，均尚未计作本批通过。

本机数据支已完成generate/validate、全项目静态、4个脚本语法及两workflow YAML检查；原生2项迁移回归在首次请求被query-engine DLL的Application Control阻止，0业务expect执行。正式seed生成器的隔离LF投影尝试在db execute子进程报 `spawn UNKNOWN`，未到生成验证，不把该错误直接归因于DLL。Python只在ignored副本检查新DDL、默认空数组/NULL拒绝、4个旧修订/多段来源/指针及其他业务字段保留、备份与FK0，旧27 ledger不变；明确不是Prisma或正式seed成功。完整证据在 `web/test-results/aliases-migration-2026-11-09/`。引用选择器与新提及接口对无当前修订的历史记录统一显示不可用，不再引导无法兑现的直接保存。

第二批收尾文档源 `98c3826824d624faeb1bfc8a61bf45673bb03f3b` 的[main CI](https://github.com/VivianAnnsesta/learningnode/actions/runs/42582216912)已全部真实成功：847测试、17页面通过/9原配置跳过及完整桌面门禁，代码树相对已验证985源仅2个Markdown不同。第三批共享名称规则初版19项中18过，唯一失败为夹具错置U+E000与全宽A排序；Python SQLite3.49.1实际排序确认UTF8比较器正确，修夹具后19/19。原诊断及JSON在 `web/test-results/record-names-2026-11-09/`；这不是目标Prisma内嵌SQLite的证据，集成套件还须核对目标排序与新迁移。

### 第二批完成记录

第二批段落级固定引用已通过本轮既定门禁并合并 GitHub main：[PR #2](https://github.com/VivianAnnsesta/learningnode/pull/2)，合并提交 `4afe2339edf432aa641261805b03fb1133d14cdc`。已验证源 HEAD 为 `98509f11e1d22179496e9ef9af7286049ea501f8`。全文与同修订多个完整段落可同时引用，重复文字按原文位置区分；选择先进入可撤销草稿，明确保存后能从当前/历史/反向引用回看固定原文，源记录后来修订不会移动旧摘录。服务端校验真实修订、完整段落、Unicode与哈希，沿用保留来源、并发冲突和返回原视图边界。

本批[完整 PR CI](https://github.com/VivianAnnsesta/learningnode/actions/runs/42580595104)与[完整 push CI](https://github.com/VivianAnnsesta/learningnode/actions/runs/42580589498)均真实成功：106文件/847测试，完整页面17通过/9按原配置跳过；Prisma校验、归档旧schema夹具及迁移保真；Electron42.11.16打包、空白seed运行、旧库升级和安全交互均通过，外键违例0。[专项 PR](https://github.com/VivianAnnsesta/learningnode/actions/runs/42580595109)与[专项 push](https://github.com/VivianAnnsesta/learningnode/actions/runs/42580589496)均57/57及6/6页面通过。首次详情导航补充精确回应/URL同步后的完整流程两边均通过，原超时和持久化断言保留；旧失败未重跑或抹除，不推断当时未捕获的DOM状态。完整CI实际上传 `full-browser-evidence`，日志及原失败保存在 `web/test-results/paragraph-references-2026-11-08/`。

本批没有schema、seed、迁移或依赖变更；真实用户数据库、AI设置、原工作区index及旧Git历史未变。源码安全发布、blob/tree保真与lease证据在 `web/test-results/obsidian-paragraph-publication-2026-11-08/`。这是隔离SQLite、页面及Windows桌面运行证据；真实AI教学、学习效果、分发发布限制仍按原状态处理。本机node_modules和已安装桌面包没有替换。持续优化目标保持进行中，下一批先处理个人记录别名检索与记录级未引用提及候选；更多属性视图、模板、日期回看、剪藏和导出仍未实现。

### 第二批过程记录

以下按对应提交保留当时结果；其中待验、未合并等陈述是该时点事实，最新结果以上方已验证源HEAD为准。

源提交 `58f01ac1affdcbc1d556d71f17dde33271961372` 的专项 PR/push 均真实57/57及6/6页面通过。[完整 PR](https://github.com/VivianAnnsesta/learningnode/actions/runs/42578873180) quality已通过847/847、17页面通过/9原配置跳过，桌面仍在运行；同提交[完整 push](https://github.com/VivianAnnsesta/learningnode/actions/runs/42578866960)为847/847、16页面通过/9跳过/1失败，桌面未运行。失败发生在旧全产品用例首次进入记录详情等待保存按钮的5秒断言；日志同时记录了详情与API冷编译，正在核查导航/数据就绪同步，不能用另一套成功忽略此失败。原生产代码、超时和业务断言未变，当前不合并。

审读未发现selector或returnTo会隐藏保存按钮的源码条件，4个初始化请求均成功，但原full workflow未上传trace/DOM，无法断定浏览器当时的具体隐藏原因。按ADR 0005为该导航补充精确URL与已完成详情回应同步，再执行原5秒可见断言；保留原60秒整用例门和全部后续修订/主题/关系断言。同时full CI无论E2E成败都归档隔离浏览器报告/截图/trace，不上传用户库或真实AI设置。该用例独立TypeScript及全项目encoding检查通过；验证设施改动尚待新CI，不能视为生产缺陷已复现或已修复。

本批段落代码已接通：同一修订全文+多个完整段落可并存，重复原文按位置区分；服务器从真实修订生成固定摘录，新引用去重但旧retained快照不被删改；当前/历史/反向引用统一片段身份。搜索变动立即隐藏旧结果，迟到哈希不能加入旧引用，失败读取提供重试。共享算法/来源短输入/导航合计43项本机纯测试通过，typecheck、全项目lint、encoding通过，新E2E文件独立TS校验通过。14项隔离SQLite的唯一一次本机尝试仍在初始化被AppControl阻断，0业务断言运行，日志在 `web/test-results/paragraph-references-2026-11-08/`。

段落界面另有4组合成API浏览器操作及截图，通过全文+3段/撤销重选、1002字节短请求、固定旧摘录和迟到哈希取消；前期换行转义/嵌套details的harness失败及旧卡片时序问题原证据保留在首批UI证据目录，不能把mock写成真实后端通过。新2条页面链与14项SQLite/HTTP必须由本批GitHub CI实际执行，发布与主分支结果待完成后追加；无schema/seed变更，真实用户数据未动。

第二批已发布 [PR #2](https://github.com/VivianAnnsesta/learningnode/pull/2)，源提交 `25ac9edea83969e1a8f0fe46bfb567b33327fdc5`。首轮[专项 CI](https://github.com/VivianAnnsesta/learningnode/actions/runs/42576471693)为56/57：形状与JSON1分页一致性断言预期3、实际4；浏览器步骤未运行。旧Prisma内嵌SQLite对hash中的NUL提取可能提前截断，Python较新SQLite未复现，不能以本机替代目标引擎。已在JSON原始hash字段先排除NUL表示，再执行原有decoded guard；仅检查hash，不误滤正文/摘录中的合法NUL。原计数3不变，增加精确引用者ID断言及引擎/提取诊断，修复待新CI确认。原失败日志保留，不将未运行页面/桌面记通过。

段落修复源提交 `1827ba489a2c3e6d7a2cc8186a6e10db765a1d5e` 的[专项 CI](https://github.com/VivianAnnsesta/learningnode/actions/runs/42577713913)真实57/57通过，NUL原始hash过滤后原计数/精确ID断言通过。6条页面链为5通过/1失败：新的全文+多段/旧摘录/反向回看及伪造拒绝/冲突保留两条均通过；唯一旧全文测试仍精确匹配更新前提示，UI已增加引用范围“全文”。已将其改为确认实际全文草稿卡片可见，保留保存前无backlink等业务断言，未改变生产行为；新完整页面/桌面仍待验证，不以57项或5条部分通过宣告整批完成。

同提交[完整 CI](https://github.com/VivianAnnsesta/learningnode/actions/runs/42577713854)已实际通过106文件/847测试，完整E2E为16通过/9跳过/1旧提示断言失败，桌面未运行。目标引擎诊断实测 `sqlite_version=3.41.2`：64个a+NUL的hash解码长度成为64，`->`原始JSON仍保留NUL转义，确认了原始层过滤的必要性；原3条合法引用及坏选择器拒绝断言均通过。原完整日志 `pr-ci-42577713854-full-e2e-failure.log` 保留，下一CI仍须完成完整页面及桌面门禁。

### 首批完成与过程记录

首批已通过全部本轮门禁并合并 GitHub main：[PR #1](https://github.com/VivianAnnsesta/learningnode/pull/1)，合并提交 `106cd708c3ad4841080a607772cb85f79cdce150`。已验证源代码 HEAD 为 `8ebe33b41963ba219f56e9fba43bb16d30f4bb0a`；PR 与 push 两套完整CI均成功。功能包含固定修订引用与快照、当前反向引用分页、已确认局部图谱、类型/领域/主题视图、Ctrl+K查找，以及普通返回/引用/图谱/快捷查找沿用源筛选。正式地图、语义关系确认及学习履历的业务边界保持原规则。以下继续保留首批当时进程，后续范围以上方最新批次为准。

[完整 Windows CI](https://github.com/VivianAnnsesta/learningnode/actions/runs/42571477526)真实通过：105文件、825/825测试；完整页面15通过/9按原配置跳过；Prisma校验、归档旧schema夹具生成、迁移保真；Electron42.11.16打包、空白seed运行、旧库升级运行和安全交互全部通过。[专项 CI](https://github.com/VivianAnnsesta/learningnode/actions/runs/42571477458)为35/35和4/4页面流程通过。成功/原失败日志在 `web/test-results/obsidian-discovery-2026-11-08/`，发布树/敏感扫描/保真核验在相邻 `obsidian-publication-2026-11-08/`；原工作区index与旧历史未改。

边界：这是真实隔离SQLite、页面与GitHub Windows桌面运行证据，不能写成真实AI教学、长期学习效果或分发发布合格。本机原有node_modules/已安装桌面包未替换，真实用户数据库未变。依赖最新审计0 critical、0 high、11项已记录的moderate；密钥轮换等既有分发限制仍按原门禁处理。持续目标保持进行中，下一批进入段落级固定引用与多段预览；别名/未链接提及、更多属性视图、模板、日期回看、剪藏和导出仍未实现。

用户已授权持续实施并及时发布 GitHub。依据 ADR 0027 已接通个人记录的固定修订引用草稿/预览、当前修订反向引用分页、1–2 层已确认局部联系 SVG 与说明、可恢复类型/排序视图，以及全局 Ctrl+K 快捷查找。新增引用仍需明确保存，不自动确认语义关系；来源修订保留既有服务器快照，新增引用仅传身份，避免重新读取旧曝光或回传大正文。列表写入后按最新筛选刷新，保存时保护正在提交的输入。

本机全项目 typecheck、定向 ESLint 及编码检查已通过；`npm run build` 退出码 0、完成编译/路由产出，但收集页面数据期间反复记录 Prisma 引擎被 Windows Application Control 阻止加载。新增隔离 SQLite 测试首轮在初始化阶段因同一引擎错误停止，实际业务断言没有运行，不能记作通过。原始日志在 `web/test-results/obsidian-discovery-2026-11-08/`。新增独立 GitHub Actions 验证数据库与真实页面，保留原全量/桌面门禁；本轮 SQLite、页面操作及截图尚待 CI 实际结果，未重新打包，旧桌面包不包含本轮改动。

远端目标已核实为 `VivianAnnsesta/learningnode`，本地无 Git remote 且旧历史包含不应公开的配置/数据库路径。因此基于远端 main 在独立发布目录准备当前源码快照，排除设置、用户数据库、缓存、产物和私人 Word 文档，原工作区 index/历史不变。版本化空白 seed 与合成迁移 fixture 已只读核验；具体发布提交、PR 及 CI 结果待实际完成后追加。段落锚点、别名/未链接提及、更多属性视图、模板、日期回看、剪藏与导出仍是后续目标，没有记作已交付。

源码首批已发布为 [PR #1](https://github.com/VivianAnnsesta/learningnode/pull/1)，提交 `dd3242ec867405988b51d792a9c5b98c8a72c9d1`，main 未改。两条 PR CI 均在 `npm ci` 停止，报告缺失 brace-expansion/concat-map，后续检查未运行；原始 [CI](https://github.com/VivianAnnsesta/learningnode/actions/runs/42566142454) 与 [针对验证](https://github.com/VivianAnnsesta/learningnode/actions/runs/42566142412) 保留。根因输入包括本机 npm 11.17.0 与 runner npm 10.9.9 对既有 override/lock 的解析差异，现按 ADR 0005 固定 npm 工具链再重验。首次 lock-only 重算未改变锁，不能把安装命令退出 0 当作 CI 修复成功。

新增来源请求边界纯逻辑测试 3/3 通过；10 项 SQLite 与3条新页面链仍待实际后端验证。另以合成正式 API 完成6项浏览器操作/视觉检查，超过72k字符旧来源的新增引用请求仅409字节；这是 mock UI 证据，不是 SQLite/Electron 验收。视觉问题已修复：局部图谱避让节点和标签，相关/类比/对比在列表及图谱统一使用双向语义。固定历史 schema 已原字节归档，校验及无 `.git` 读取通过，实际迁移保真待 CI。

本次重新查询依赖审计发现当前 high/critical 阻断，旧日期的零漏洞结果不覆盖新公告。正在按官方修复范围升级兼容补丁；Electron 41 没有消除当前阻断公告的可用补丁，依据 ADR 0005 计划升到最小已修复 Electron 42.11.16，并重新验证完整桌面运行/升级/安全门禁。没有降低审计阈值或把未打包源码当作可发布桌面程序。

安全维护已写入 package/lock：Next.js 与 eslint-config-next 15.5.28、Electron 42.11.16、Vitest 4.1.12、sharp 0.35.5 和兼容传递补丁。`npm run audit:release`、npm 11.17.0 的 `npm ci --dry-run --ignore-scripts` 均通过，最新完整审计 0 critical / 0 high / 11 moderate。剩余 moderate 为 [minimatch globparts amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249) 的 9/10 传递依赖链，限于现有开发/构建 glob 使用，暂不以不兼容的 minimatch 11 强制覆盖；后续跟进依赖拥有者的兼容修复，不能据此宣称零漏洞。before/after 审计与 lock 检查在同一证据目录。Electron 42 的显式 binary 安装已接入开发命令；本机 node_modules 尚未切到新依赖，真实新版本行为继续待 CI 及桌面门禁。

提交 `279a5362341b59f650945a6abee38b3913feaf00` 的[专项 CI](https://github.com/VivianAnnsesta/learningnode/actions/runs/42567513379)已真实通过：13/13（10项隔离 SQLite/HTTP + 3项请求边界）及3/3真实页面链，包含引用选择/明确保存/旧版本回看/反向引用、两层图谱/候选隔离、类型视图与快捷查找。证据 artifact `knowledge-discovery-evidence` 的 SHA-256 为 `49ed0d120de0e96d38e907581e5c84412f0d0a82822348ed5ca407498712b462`；不再以 mock UI 替代这些后端/页面证据。

同提交[全量 CI](https://github.com/VivianAnnsesta/learningnode/actions/runs/42567513361)为800/803：密集图谱逐条造数超时、其后清理 P1008，以及既有真实 PDF 提取5秒超时，后续迁移/桌面未运行。已保留原失败日志，将测试图谱数据改为批量事务、全量 Windows worker 限为2，未改节点/边规模、断言、测试超时或业务门禁；效果待下一实际 CI，不能将专项成功写成全量通过。

提交 `79b103f02b2dcdab323fc7179da88cb3d218a6f2` 的[专项验证](https://github.com/VivianAnnsesta/learningnode/actions/runs/42568415623)再次通过；[全量](https://github.com/VivianAnnsesta/learningnode/actions/runs/42568415616)为801/803。Discovery10项实际15.037秒全部通过，原造数/清理超时已消除；剩余学习反馈证据与PDF提取为5秒时限失败，没有出现业务断言不符。前者失败项在时限触发后仍于7.852秒结束，PDF套件6.225秒；PDF独立本机11/11、2.11秒通过（本机旧安装依赖），不能代替 CI。依照既有隔离串行验收方式，下一全量改为单 worker 串行，仍保留全部断言、原时限和原失败日志，迁移及桌面阶段继续待实际到达。

提交 `03508aa56e647c82ff5dc7f88ddff091524dfab2` 的[全量](https://github.com/VivianAnnsesta/learningnode/actions/runs/42569103756)已真实通过803/803、Prisma校验、归档旧schema夹具生成和迁移保真；[专项](https://github.com/VivianAnnsesta/learningnode/actions/runs/42569103690)继续通过。完整E2E为11通过/9跳过/3失败：两项全库只读计数被另一并行测试写入污染；一项旧测试仍匹配更新前的保存提示。已将共享隔离SQLite的浏览器文件默认串行、更新提示断言，保留全库无写入及后续旧原文/修订保真断言。没有改业务规则；下一E2E及桌面阶段仍待实际结果。

接续阅读体验的目标/当前差异：现有视图可刷新恢复，但详情的普通返回按钮仍回到未筛选列表；领域入口选择全部领域后刷新也可能恢复初始领域。依据 ADR 0027 接通受限 `returnTo` 视图传递，覆盖列表→记录→引用/图谱→返回、快捷查找及领域空筛选，不引入新的业务状态或外部导航。此接续能力尚未记为实现/验证通过；段落级选择仍在后续范围。

提交 `ee2bb63782a84c067c0884a2af14609601a5690d` 的[完整 quality](https://github.com/VivianAnnsesta/learningnode/actions/runs/42570112250)已通过803/803、迁移保真和14条页面流程，9项按原配置跳过。桌面阶段已下载/解压 Electron 42 并生成应用，但随后因干净 checkout 没有可选空 `web/public` 目录、打包脚本无条件复制而 ENOENT；runtime/upgrade/security尚未执行。已按 ADR 0005 允许缺省可选 public 并建立空目标目录，存在的资产仍须复制成功，必需资源门禁不变；下一实际打包待验。

返回视图的接续代码已完成：受限 canonical 相对视图由普通返回、引用、图谱和快捷查找沿用；领域显式空筛选能刷新保留，检索词中的反斜杠只作为编码文本。22项纯导航及3项来源请求测试本机通过，typecheck/lint/encoding通过；新增第4条真实页面往返检查尚待新CI，本机仍未换新依赖或重新打包。下一批段落级引用需统一选择器身份、真实原文偏移/哈希核验、多段共存和固定快照，不把这些方案写成已实现功能。

更新日期：2026-11-08

本轮路线输入与显式修复的代码改动已完成，最新隔离串行全量 **766/766** 通过，0失败、0未运行；全项目 typecheck、lint、encoding 通过。[全量JSON](web/test-results/planning-evidence-final-full-2026-10-28.json)、[输出](web/test-results/planning-evidence-final-full-2026-10-28.log)、[类型](web/test-results/planning-evidence-final-typecheck-2026-10-28.log)、[规范](web/test-results/planning-evidence-final-lint-2026-10-28.log)、[编码](web/test-results/planning-evidence-final-encoding-2026-10-28.log)保留。此前中间态755/755仍有效但不覆盖后来新增的旁路修复；编码命令首次误指向不存在的check-encoding.js，原[失败输出](web/test-results/planning-evidence-encoding-2026-10-28.log)保留，改用package脚本实际指向的check-mojibake.js后通过。未修改schema、真实用户数据库或Provider默认推理模式，未重新打包。

请求快照修复：课程研究和显式修复冻结目标、范围、基础声明、任务书、材料、意见及起始课程候选身份；成功/失败回退保存均在SQLite事务内核对指纹。原延期回归7/7失败，修后覆盖新增边界的针对119/119通过；入口独立复现又发现旧domain自动任务书写回、旧资料拼入新快照，3/3失败。现入口只传本次明确意见，保存材料/意见由服务单次读取，不再按旧domain生成重复任务书；已有用户任务书保留，名称目标仍足够。入口与快照12/12通过，归入最终766项。地图/阶段首审及局部/全图修复显式接收只读用户质疑与目标阶段，仍保留整图约束及原局部可写边界。证据：[快照旧失败](web/test-results/planning-request-snapshot-before-2026-10-28.json)、[针对结果](web/test-results/planning-input-targeted-final-2026-10-28.json)。

显式课程修复的知识旁路已修复：原4项隔离服务回归均出现预期失败，含已有确定知识错误的 incomplete 课程只补齐结构，原错误句未改但knowledgeReview丢失，实际skeleton生成入口能够继续。现显式repair也复用既有至多3次独立知识核对；核验原报告/原候选/原来源身份，只继承实际未改字段的确定错误，完整原报告和候选归档，并明确继承证据不是新的模型核验。新意见或连接失败不能清除未改旧错；实际改动后重新核对，失败记未核实。日志持久化失败在保存前重抛。新增8项回归与相关四文件42/42通过，归入最终766项。[旧失败](web/test-results/course-repair-knowledge-before-2026-10-28.json)、[针对结果](web/test-results/course-repair-targeted-verified-2026-10-28.json)保留；扩展开发期曾有一项错误文案断言与Prisma spy类型问题，修正断言/夹具后通过，未放宽门禁。这些仍是协议夹具的程序证据，不是实际模型一定纠正知识的证明。

新规划知识迁移诊断已完成：6组成对文本、12例、每例每模式一次，共24次，未调整冻结提示或补抽样。非推理有效更正5/6错例、保留6/6正例；推理有效更正6/6错例、保留5/6正例，两臂均11/12报告可用。非推理pt-08有claims而缺findings，且无错判定与自己的正确推导冲突；推理pt-12耗尽实验10000 token预算，没有最终答案。该实验预算与生产规划核对12000/180秒不同，不能直接外推生产必失败。11份实际更正经逐份AI协作审读未发现新增确定错误；仍发现支持理由口径错位及任务澄清的过强指控，判定命中不能替代论证可靠。非推理总91.773秒/44616 tokens，推理475.547秒/108042 tokens；两臂合计152658 tokens，不是账单。原设置未变、临时设置已删除、无产品数据库。[完整审读](docs/research/2026-10-28-planning-transfer-results.md)、[原始结果](web/test-results/planning-transfer-2026-10-28-1793181396960/summary.json)与[预定协议](docs/research/2026-10-28-route-quality-protocol.md)分别保留。这些是未用于前轮调提示的新诊断题，不是随机抽样或独立人类保留集。

完整候选路线实验进行中：两个人工研究目标分别为有限筛查表条件概率与Python列表引用/拷贝，每域两种运行模式，使用实际请求处理器及隔离seed，计划到达全部实际Stage候选并保存重载。每路线24次、总96次请求是研究预算，原服务门禁与内部修复限制不变；错误、blocked或unavailable立即停止该路线，未到达不记通过。没有正式确认或正式节点写入。代码及判据已冻结，[运行目录](web/test-results/route-quality-live-2026-10-28-1793183197873)保存实时证据；Python两路线尚无完整结论，不能将以下有限表结果扩展为四路线全部通过。

有限表两路线已终止：非推理24次实际请求、322655毫秒，六个Stage有展开返回，前五个重读一致；第六个知识核对在发送前被研究预算拦截，未进行最后重读，status=stopped，不计完整候选链，也不记为生产失败。推理24次实际请求、1374550毫秒，五个Stage全部展开、重读一致，status=all-candidates-generated-and-reloaded；主例计算、条件方向、名单解释和选学边界逐项审读有支持，但知识核对多次在实际生产预算内没有完整答案，不能把链到达写成各项核对成功。两臂是不同的独立生成路线、小样本运行策略比较，不是固定候选下的纯模式因果实验。[原始终态](web/test-results/route-quality-live-2026-10-28-1793183197873/outcomes.json)、[语义审读](docs/research/2026-10-28-finite-route-results.md)、[运行与交接审计](docs/research/2026-10-28-route-runtime-audit.md)分别保留。

有限表原文中最明确的局部问题是把未声明的“按行列读表”归为用户自述。Stage3具体迁移提示只给总300/缺陷30/标记60，现有数字不决定交集；模型已识别并记uncertain，语义评审明确留待后续补表，不能写成漏检或吞掉确定更正。Stage5“同规则”和Stage6概率/计数对比存在待澄清表述，但上下文实际公式正确，未夸大为确定计算错误。

规划到教学的交接缺口已隔离复现，尚未修复：实际createLearningSession→prepareLearningSession→prepareLearningSegment链、mock模型协议、临时空白seed数据库，专用7项回归全部按目标断言失败。[原失败](web/test-results/planning-teaching-handoff-before-2026-10-28.json)、[复现脚本](web/scripts/research/planning-teaching-handoff-repro.test.ts)保留。makeContext漏传example/commonMistake/transferPrompt；最新无关阶段报告遮蔽旧相关疑点；课程、Stage、node key或正文已变而quote仍重合时会把旧confirmed_error套进新上下文；无可靠绑定的legacy报告也被当当前证据。新增文件lint和全项目typecheck通过，无网络、未接触产品数据库。此前766全量不包含这份显式运行的研究复现，不能用766通过否定新失败。ADR0026已先规定真实任务原文与可核验节点证据绑定，生产实现等待当前冻结的四路线实验终态；实际课堂是否补全仍未观察，不能把输入缺失直接写成已证实教学失败。

本轮审计同时确认：课程报告中已保存的materials会间接传到后续生成，不能把风险误记为所有正文丢失。阶段核对仍是有限主张预算及有界选源，不能由某些知识句通过推出整个阶段已穷尽核验。原目标仍涵盖路线与知识设计、针对性教学及更正可靠性，真实学习效果未观察；本轮程序改动和局部模型结果不替代整体目标。

2026-10-28 本轮反馈证据及更正链的代码修复已完成并通过隔离串行全量 **743/743**，0失败、0未运行；全项目 typecheck、lint、encoding 通过。[全量JSON](web/test-results/feedback-evidence-full-2026-10-28.json)、[输出](web/test-results/feedback-evidence-full-2026-10-28.log)、[类型](web/test-results/feedback-evidence-typecheck-2026-10-28.log)、[规范](web/test-results/feedback-evidence-lint-2026-10-28.log)、[编码](web/test-results/feedback-evidence-encoding-2026-10-28.log)保留。lint 只有 Next.js 命令退役提示。新增隔离用例曾因夹具使用非法材料版本触发既有 SQLite 保护，已改合法夹具；未放宽保护。

具体实现：生成与核对共用实际原题、用户原话、绑定材料版本、提交时帮助和来源快照；失败同号重试同步当前快照，迟到结果受生成令牌保护，新动态活动也保存来源。自动审查覆盖 text、observation、uncertainty、verdict、action、newActivity 全部字段，有效替换整体复核，报告修复与知识核对共用总三次预算；失败或仍有确定错误时不沿用旧判断/行动，不伪造已完成更正。手动核对先独立记录原反馈的有效确定错误，即使后续更正复核不确定、抛错或称未发现错误，原判断/行动也保持撤回；原反馈、调用和错误依据可追溯。使用既有内部 JSON 记录，无 schema 迁移、无新正式地图写入；反馈核对提示版本为 learning-feedback-whole-reply-v2。

真实模型经完整反馈服务的第一轮4个构造场景均保存重载，9次调用；其中开放题核对将可选新活动误解为强制改任务，不能计为已证实错误检出。[第一轮结果](web/test-results/feedback-service-live-2026-10-28-1793178365861/run-complete.json)。加入不确定性字段核对及明确可选活动语义后的第二轮4场景、10次调用：点值/极限混淆、单位换算和开放观察3例保存重载；正确质疑错误参考的案例在有界核对后阻断。该失败先缺顶层 uncertainty 导致一次合同失败，后又把已定义 g(0)=0 的对照题误读为 g 在0未定义；核心复合极限2正确，原正文另有未被准确指出的泛化条件表述不严谨。不能以运行脚本通过声称所有案例内容通过。[第二轮结果](web/test-results/feedback-service-live-2026-10-28-1793179516175/run-complete.json)及原回应/调用均保留；两轮均用隔离 seed，外键违例0、临时设置删除、原设置哈希未变。

完整反馈组件另对真实生成回复注入单字段错误并保留两个控制，共5场景各2次、16次核对调用；正文以外的判分、表现描述、帮助归因6次注入中4次修复并复核，2次首份报告合同失败，原注入错误仍保留。另有控制被过度修改及合同失败，不能合并成通用准确率。该诊断脚本遇无效报告即停止，不是生产服务三次预算耗尽。逐份解释、必要/充分条件歧义、可选活动误判与服务失败见[完整反馈结果审读](docs/research/2026-10-28-whole-feedback-results.md)，[原始结果](web/test-results/whole-feedback-repair-2026-10-28-1793179109821/summary.json)保留。

当前适配器对可切换推理的相应非联网任务默认关闭推理。保持5个冻结输入、同一请求模型及温度，交替比较开启/关闭模式，各10次初次报告；关闭模式9份可执行、1份合同失败，开启模式10份可执行，分别0/10及10/10返回 reasoning_content。关闭模式总耗时47.640秒、usage 39467 tokens；开启模式315.985秒、usage 87533 tokens，包含提示及推理/回答，不等于账单。接口在推理模式忽略 temperature，因此这是支持的运行模式比较，不能称有效采样参数完全相同。只检查初次报告，没有生产更正复核循环；开发病例含解释敏感控制，未做独立保留集或真实学习者试验。产品默认模式未改，原设置未变、临时副本已删除。[原始结果](web/test-results/thinking-comparison-2026-10-28-1793179489745/summary.json)、[模式对照审读](docs/research/2026-10-28-thinking-mode-comparison.md)记录具体判断与局限。

推理模式对照的语义审读：三类明确单字段注入共6次/臂，两臂原始报告均指出注入错误；关闭模式其中1次返回非法 action=finish，故可执行修复5/6，另2次附加依据不足的行动指控。开启模式6/6仅更改对应错误字段，替换合同可用。两个解释敏感控制共4次/臂，关闭模式均指错、开启模式均未指错；其中有“缺少已经存在的条件”、把正确质疑参考当成不能答对等明确误判，但也有“当前困难”措辞及必要/充分条件的解释争议，不能将4次全算无歧义误报或宣称模式准确率100%。同案例四条提示逐字相同，保存的20个提示指纹均复核一致。独立协作审读仍是 AI 复核，不是人类学科认证。

本轮目标继续进行：已经证明部分信息损失和更正状态缺陷可修，但实际模型仍会漏掉条件、误读已有条件或过度撤销合理建议。路线范围/真实前置、未见案例稳定性、完整桌面新包和真实学习效果仍未完成；旧桌面包不含本轮修复，不以代码测试、研究报告或少量反馈案例替代整体目标。

2026-10-28 用户继续要求研究出能解决项目难点的办法。本轮从研究建议进入机制定位和实际对照，目标仍覆盖路线知识与范围、教学针对性、判断及更正可靠性，不以单个样例或单一修复替代整体目标。当前代码审读已定位反馈生成与审查的信息断层、反馈正文纠正后旧判断仍沿用、重试资料快照不同步等可复现候选机制。先冻结诊断病例及原提示，比较同模型在缺失/具备本轮交互证据时的表现，再实施和验证；未运行的实验、尚未修复的缺口及真实学习效果继续记为未完成。

本轮已实际运行两组成对机制实验，各6组12病例、每例每臂重复2次，各48次、合计96次真实调用。配置为 DeepSeek/deepseek-v4-flash、温度0.25，返回标识为 deepseek-flash；这不是永久固定权重的证明。第一轮：原流程24次中检测明确错误0/12、错例放行11次、弃权3次（含正确例2次）、保留正确例10/12；只补交互证据的24次中检出8/12、错例放行2次、正确例保留12/12，另2次理由/更正正确但verdict与findings冲突被合同拒绝。第二轮复测context为8/12检出、3次错例放行、1次合同失败；增加通用归因职责的context_scope为12/12检出、正确例保留10/12、无合同失败，另2次不匹配集中在同一个帮助记录限定句，已登记判据解释敏感，不据此估计通用误报率。所有重复不是独立学习者样本；首轮和第二轮分别保留[汇总](web/test-results/feedback-context-2026-10-28-1793176069255/summary.json)、[汇总](web/test-results/feedback-context-2026-10-28-1793176309133/summary.json)及原始逐次输出。

上述调用提供方usage合计138276 tokens（第一轮baseline 27301、context 35466；第二轮context 35411、context_scope 40098），不是账单金额；每臂单次上限4096输出token、120秒，不自动重试失败。两轮临时设置均已删除、原设置哈希未变，未访问产品数据库。实验脚本首次因括号语法错误在加载前失败、未发出模型请求，修正后两轮完整执行。病例是公开诊断开发集，第二轮规则由第一轮失败启发；这两轮本身没有完整服务真实AI、独立保留集或学习效果测量，后续服务实验单列于上方。研究结论与剩余工作见[机制改进报告](docs/research/2026-10-28-solving-quality-bottlenecks.md)、[原始失败提取](docs/research/2026-10-28-failure-mechanisms.md)和[逐份输出审读](docs/research/2026-10-28-context-experiment-review.md)。

2026-10-27 教学质量目标的研究材料已整理为[路线与教学研究方案](docs/research/2026-10-27-ai-teaching-research.md)，配套原始实证、学习机制、当前实现审计、数学/开放探索样例及[比较评价协议](docs/research/2026-10-27-ai-teaching-evaluation-protocol.md)。研究区分真实学习表现、辅助下完成、行为评价和程序可靠性；核对新论文的样本/版本/人工介入条件，明确正面、负面与未显著改善结果的边界。旧方法论中 seen 沉淀、入口缺失等表述已加历史适用性说明，不能覆盖 ADR 0025/0026。本文档记录的是研究产出，不是方案已实现或教学效果已通过。

上述2026-10-27调研阶段只做文献和代码审读、研究材料编制、文档本地链接/编码及样例有限计算核查；证据见[研究核验记录](docs/research/2026-10-27-research-verification.json)。协作助手审读是 AI 编辑性复核，不是独立人类学科认证。该阶段未改业务代码、模型设置或真实数据库，未重新运行真实 AI、桌面包或学习者试验；2026-10-28的实现和实验另列于上方。目标/当前差异：已有可实施的研究方案与对照办法，但在 EnglishNode 中稳定降低内容错误、改善独立/延迟表现的效果尚待实测，不能以研究文档完成替代。

2026-10-11 更正保存的代码修复已完成：针对空白运行 `1791623160555` 的006更正被登记投影覆盖、执行记录与最终候选不一致，按 ADR 0026 增加真实正文来源目录、结构校验后完整字段保留检查和整批失败保护。任何更正丢失时保留原候选与绑定的确定错误，不保存部分成功或虚报 corrections；仅改核对意见不能解除未更正错误。既有三次调用内从保存的原报告修复来源引用；上游有独立同路径证据且最终派生文字实际符合旧更正时，允许只更正上游。局部节点不按同文扩散，身份、依赖、版本与正式用户确认门不变。已成功的一批更正在后续连接失败时仍保留，新候选明确待核对；提示版本为 `planning-knowledge-v3-retained-corrections`。

最终独立 TEMP 串行全量 **690/690** 通过，0失败、0未运行，含隔离 SQLite 用例；全项目 typecheck、lint、encoding 通过。[全量JSON](web/test-results/planning-correction-full-final-2026-10-11.json)、[输出](web/test-results/planning-correction-full-final-2026-10-11.log)、[类型](web/test-results/planning-correction-typecheck-final-2026-10-11.log)、[规范](web/test-results/planning-correction-lint-final-2026-10-11.log)、[编码](web/test-results/planning-correction-encoding-2026-10-11.log)保留。新增23项回归覆盖投影丢失、原地校验、字段缺失/冲突、同字段多更正、来源唯一性、成功保存、无错意见不能清错和连接失败恢复。首次全量687/688通过的唯一失败是新增用例断言了正常提示中不存在的英文标签，已改为核对真实更正段的 findings 与前后指纹；首次[失败JSON](web/test-results/planning-correction-full-2026-10-11.json)保留。开发期两处新增测试类型错误及一处变量命名lint错误修复，原[类型失败](web/test-results/planning-correction-typecheck-2026-10-11.log)与[lint失败](web/test-results/planning-correction-lint-2026-10-11.log)保留，不放宽业务断言。

原006有效报告 `cmv26ke4o000rssa9hk9483ct` 已额外离线重放：从归档还原的输入指纹与原报告完全一致，旧处理实际3项被覆盖、1项保留；新处理整批拒绝，原候选及归档不变。另用明确标识的协议夹具补齐两处来源的独立引用后，四处最终更正全部保留；这不是新的模型输出或数学质量接受。[重放证据](web/test-results/planning-correction-replay-2026-10-11-evidence.json)和[重放/服务针对结果](web/test-results/planning-correction-retention-2026-10-11.json)可回查。本轮未调用真实模型、未改真实数据库、未重新打包桌面；旧包不含修复。此前011知识漏检、008报告合同失败和整产品未完成事实继续有效，后续另行讨论与验证模型输出质量。

本轮新包前全量自动化复验 **667/667** 通过，包含真实隔离SQLite服务用例；[最终JSON](web/test-results/final-core-serial-repaired-2026-10-10.json)与[完整输出](web/test-results/final-core-serial-repaired-2026-10-10.log)保留。首次复验666通过、1失败是旧用例断言已替换提示词的“端点归属”字样；已改为核对实际反馈全文先于历史上下文及前提条件，未放宽业务。首次[失败JSON](web/test-results/final-core-serial-2026-10-10.json)保留。全量lint、类型、编码与Prisma schema检查通过；新版[build:app输出](web/test-results/final-core-build-2026-10-10.log)通过，包括空白seed、合成旧库备份迁移/外键保真及包检查；新空白及两个失败恢复隔离模拟正启动，尚无本轮完整结果。自动化通过不代替原041数学内容、032逻辑反馈、City规划合同等实际失败的纠正证据。

恢复副本 `1791619941485` 的042还有独立备课合同失败：无领域提问的实际回应与保存恢复成功，但准备教学的三份模型原文把 requiredOutput 写为 optional，合同只允许 none/attempt/record，最终框架未生成。现只在生成解析把语义明确的 optional 规范为既有 none，原raw/parsed保留；不新增状态、不把任何必要尝试改可选，其它未知值与覆盖门仍拒绝。备课与生成提示明确三值，日志用 flexible-learning-reliability-v4 区分新包。相关79/79纯合同、typecheck及模块lint通过，[结果](web/test-results/knowledge-output-reliability-contracts-2026-10-10.json)；尚未做新包实际同号恢复或新空白备课验证。

最新空白桌面 `1791617868526` 已正常停止并归档，不是完整产品通过：前两部分实际五步阅读、两类困难、两次动态活动和一次框架必需尝试已到达；041第三部分仅生成，独立审读发现题目只给外层极限而参考断言外层逐点恒值、常值反例的失败理由错误、回应依据混用分支、单侧文字过强，发布前模型报告仍 no_error_found。原 `cmv24y4it005avlferim5z6js/v1` 与核对 `cmv24ybv0005evlfea8vlodpd`、原回应、材料版本和失败保留；第三部分必需活动、第四/第五部分、专项反例节点和后续完整主链未到达。42检查点、原文件指纹不变、临时设置删除、已知凭据命中0；没有把知识错改成格式通过。[实际内容审读](web/test-results/reliability-verified-empty-2026-10-10-1791617868526/AUDIT-PART-3.md)及[原运行结果](web/test-results/reliability-verified-empty-2026-10-10-1791617868526/result.json)可回查。框架步数和实际阅读范围按冻结快照分别记录，未使用的新补讲活动不计完成。

独立恢复 `1791619941485` 的City规划还出现通用传播修复合同失败：三份报告均给十二项claims却为四处错误给findings，学习目标登记的更正缺其同path错误claim。原报告/候选保留，正式版本仍0、没有误创建节点。新增失败候选缺证据位置目录，修复优先其实际原文与父级范围并省略无关重复职责，不自动造claim或放宽同path引用门；42/42纯规划核对通过，类型及模块检查通过，[结果](web/test-results/planning-propagation-repair-2026-10-10.json)。通用正文生成/核对同时要求逐活动以本题条件检查参考与分支依据，区分具体取值与趋势、支持与证明、全称与存在；不增加学科词表、状态或调用。旧包中的City两次修订、个人探索量词问题与后续未达到的能力仍是失败/待验收，新包及新的空白完整链尚待完成。

2026-10-10 教学新文字优先与唯一活动缺身份补丁的纯针对验证22/22通过（两文件，0失败、0未运行），typecheck、模块lint通过；没有运行SQLite服务套件、构建或生成client。首次TEMP权限导致两个文件导入失败且0测试运行，原失败JSON/log保留，改用独立工作区TEMP后验证通过；原真实正文假阴性和三次局部核对身份失败继续保留。[最终JSON](web/test-results/learning-knowledge-publication-ready-2026-10-10.json)、[输出](web/test-results/learning-knowledge-publication-ready-2026-10-10.log)、[全部失败与范围](web/test-results/learning-knowledge-publication-development-failures-2026-10-10.md)分别记录。当前桌面旧包不含补丁，自动化结果不能替代实际知识纠正或产品验收；node_knowledge_check仅更新提示记录版本为learning-knowledge-current-text-v1，数据/报告版本和原记录不变。

新空白主流程 `1791617868526` 的032反馈另暴露理由错误：将原命题 P=H→C 的角色误写成 Q=(H∧¬C)→C 后，反馈称 Q 自相矛盾且不能用于同一反例；在经典逻辑下两者都等价 ¬H∨C。角色还原不忠实与真值/等价不同，不能把前件含结论否定直接判成条件句恒假。原反馈 `cmv24kkjt004evlfeb8fxeuh7` 与核对日志 `cmv24kptl004ivlfeo4sq651s` 的 no_error_found 保留，新动态段尚未用于答题。通用提示补逻辑角色与实际推理区别；反馈借用 mainIdea 的新文字和动态材料同时优先，不把新反馈误当旧框架。既有 checkGeneratedKnowledge 最多3轮事实核对，每轮 generate 最多3次合同尝试，原嵌套上界9次；本次没有增加循环或调用，不能误报为全过程总3次。真实正文和反馈仍须新包有限复验。

本轮教学核对目标/当前差异：恢复副本 `supplementary-recovery-2026-10-09-1791611505708` 的034/035第五部分正文与参考回应将逆推结论的否定称为命题前提；实际独立核对输入20,033字符已包含全部当次正文、活动、参考、依据和提示，仍返回 no_error_found，不能误记为正文缺输入或知识质量通过。其前面是较长的旧上下文和整框架，当前提示及总摘要没有明确新文字优先与实际覆盖边界。按 ADR 0026 先补通用新材料优先、逻辑角色及独立推导提示，保留原失败与核对原文；这不保证模型知识正确，仍需新包有限实际复验。

后续独立恢复副本 `supplementary-resume-2026-10-10-1791619941485` 的007三份局部核对已正确指出两处错误并给正确替换，但活动 answer finding 只给真实 activityKey、漏 stepKey，三次通用修复原样重复，服务端拒绝“核对引用了未知步骤”。新增严格唯一活动归属规范化与真实目录修复提示，仅补可确定的缺步骤身份，不放宽错引用、假活动或非可改字段。原三份失败调用 `cmv24eopq0007hw4or2rnmw04`、`cmv24er7t0009hw4oi5k2oyx5`、`cmv24et12000bhw4ocq0jhrw6` 及原数据库保留。当前运行中的主流程72761与恢复18649使用旧包，不含此补丁；未到达的后续教学和完整产品能力不得记通过。[只读审计](web/test-results/reliability-verified-empty-2026-10-10-1791617868526/AUDIT-TEACHING-KNOWLEDGE-CHAIN.md)另列事实与建议，针对结果随后单列。

2026-10-10 最新整合验证：独立 TEMP 的串行全量637/637通过，0失败、0未运行，编码检查通过，见 [全量 JSON](web/test-results/reliability-core-final-serial-2026-10-10.json)和[输出](web/test-results/reliability-core-final-serial-2026-10-10.log)。桌面重新打包、空白 seed、旧库副本升级及外键/打包边界检查通过，见 [构建输出](web/test-results/reliability-verified-final-build-2026-10-10.log)。新的空白目录 `reliability-verified-empty-2026-10-10-1791617868526` 已实际启动并取得业务库全0、隔离配置保存、历史只读不导入的证据；独立失败恢复副本另行执行。以下旧失败和未到达项目继续有效，自动化通过不代替真实教学与完整产品验收。

最新空白运行 `1791615468937` 已在第二部分活动反馈处真实停止：回答已保存，模型把框架部分 key `compare-directions` 填作当前材料 stepKey，三次有界生成仍同样无效，服务端阻断反馈发布。原调用、失败输入和库已归档，清理完成；第三至第五部分和后续主流程未到达，不能记通过。继续修正行动目标契约、材料活动不能暗增框架完成要求，以及局部纠错新材料的可进入性，再在副本中实际重试和完成独立能力验收。上一轮框架步数以实际21为准，人工门理由的20是计数笔误，原理由保留。

本轮反馈行动目标/当前差异：实际失败的三份反馈正文正确区分两种内层取值及额外充分条件，但将真实尚未准备的框架部分当作当前正文步骤；原通用结构修复提示未说明目录差异，三次重复同一无效目标。按 ADR 0026 补当前正文与后续计划的身份合同及有界修复，计划建议只能成为 continue 说明，不能执行不存在的步骤；真实未知目标仍阻断。旧失败记录不改写，保存输入的同号显式重试与后续完整桌面恢复验收仍待实际验证，不能计为已完成。

2026-10-10 此合同修复的针对验证67/67通过（5个文件，新增19项，包含原服务36项、活动要求10项与局部更正2项），使用独立TEMP下版本化 seed SQLite；typecheck、模块lint、encoding与diffcheck通过，无构建或生成client。真实保存输入同号重试、最多三次错误后保持失败、伪目标拒绝、原raw/解析/规范结果分开保留及当前/历史框架要求投影已由协议夹具验证；新包实际恢复与剩余教学仍待验收。[JSON](web/test-results/learning-feedback-contract-targeted-2026-10-10.json)、[输出](web/test-results/learning-feedback-contract-targeted-2026-10-10.log)、[本次真实失败与UI恢复条件](web/test-results/reliability-complete-final-empty-2026-10-09-1791615468937/FEEDBACK-ACTION-FAILURE-AUDIT.md)保留，不将合同通过写成完整产品通过。

本轮实际正文还发现任务承诺不一致：空白运行 `1791615468937` 的 015 教案所有步骤 requiredOutput=none，但 035 第二段活动 raw required=true，页面显示必须留下一次尝试，完成校验却按教案不要求该活动。原教案、正文、尝试及失败证据保留。现按 ADR 0026 修正后续正文解析与旧材料读取显示，以绑定框架作为产出要求唯一依据；attempt 缺实际活动仍拒绝。此修正不增加复核调用、不重写历史，flexibleTeaching 的10项针对验证与类型检查通过；绑定框架调用整合及真实恢复副本仍须检查，不能记为完整产品已验收。

本轮当前运行：`reliability-complete-final-empty-2026-10-09-1791615468937` 已在新打包桌面、新临时用户目录和版本化空白 seed 上启动，尚未完成整产品验收。新包构建、空白 seed、备份迁移和外键检查通过，见 `web/test-results/reliability-complete-final-build-2026-10-09.log`。前一空白运行 `1791613883671` 在首次草稿编辑时失败：页面漏传已保存候选的课程绑定，课程实际并未变化；服务端版本门未放宽，已修页面并取得15项针对验证通过。驱动悬空等待导致异常退出另行修复，原失败、数据库、模型原文、REPORT及TRACE保留，临时设置已清理、原库及设置未改。必要条件的逻辑方向、逐路径选学范围继承和实际来源支持与独立推导的区分已补入通用复核提示，34项针对验证通过；这些是合同验证，不是模型消除知识误判的证明。公开 MIT 来源在本机实际解析到保留网络地址198.18.0.21，被原安全规则拒绝，正文未取得；不修改安全边界或宣称教材安排已核实。后续教学、个人网络、探索、跨域及恢复仍须逐项实际到达，未到达不记通过。

本轮继续实施 ADR 0026：新空白模拟的规划知识失败是有效的新证据。当前目标是实际材料快照、独立主张核对及上游有界修正，并重新完成全产品空白桌面模拟；尚未取得这轮完整验收证据，以下历史通过不能代替本轮结果。补充桌面验收还发现主题改名使用 Electron 不支持的 window.prompt，已改为保存前可编辑、可取消的页面输入；这属于任务书要求的主题管理操作，实际桌面改名验收仍待执行。正式路线提供“修改目标与路线”入口，进入现有持久化草稿与 AI 修订流程；正式变化仍需复审和用户确认，恢复/调整后的内容保留待本轮实际验收。

最新 `reliability-final-empty-2026-10-09-1791612175000` 使用旧打包副本，已在正式确认前停止并保留，代码修复后新的空白运行尚待启动，不能视为本轮修复后的通过。真实反馈修订暴露三处边界问题：模型把服务器实际用户正文的 pasted 内部身份回填公开 sources，服务端随后将其送往 HTTPS 抓取并让批判报告把 URL 校验失败误读为“用户正文未取得”，尽管持久化原始材料仍有881字符；规划复审把已经登记但尚未展开条件/例子的范围与公开正文缺口混为 criticalCoverageGap；全图修订强制原阶段数量和全部稳定 key，导致无法取消无展开详情的 planned 基础阶段，模型为保留容器发明必学基础责任。对应 ADR 0026 已补来源生命周期、范围/证据分离和 planned 阶段可取消/合并的决定。来源生命周期针对验证61/61通过，最新独立 TEMP 串行全量598/598通过（88个文件，0失败、0未运行），lint、encoding、typecheck通过；[全量 JSON](web/test-results/planning-source-final-serial-2026-10-09.json)、[全量输出](web/test-results/planning-source-final-serial-2026-10-09.log)和[来源修复失败记录](web/test-results/planning-source-lifecycle-development-failures-2026-10-09.md)分别保留。随后须重新构建并用新的空白桌面验证；本轮原生成、复审、修订及失败记录保留，原数据库只读核对。停止时正式节点为0，23条模型调用、1条确认审计，临时设置已删除，原指纹不变、外键违例0；教学正文、作答与后续产品步骤未到达，不能记为通过。

## 已有实现与本轮验收差异

当前空白运行 `1791615468937` 的011阶段候选已由真实模型复审并在012正式确认，版本/材料/候选绑定可回查，但独立知识报告12项中只有1项引用新节点文字，其余11项重查全局登记；实际复合节点的新知识、任务和序列反例没有本路径核对。模型已收到这些文字，问题是有限预算没有优先此次展开范围，报告局限也未明确列出这些新节点的未覆盖范围。通用目录排序及范围提示已修，新增5条非学科专用回归，连同原报告与服务测试59/59通过，typecheck通过，证据见[数据链审读](web/test-results/reliability-complete-final-empty-2026-10-09-1791615468937/AUDIT-DATA-CHAIN.md)及[针对结果](web/test-results/planning-stage-scope-targeted-2026-10-10.json)。当前桌面包不含该改动，原011报告、原数据库和确认审计不能追改为已经充分核对。当前教学验收可以继续提供实际证据，但此缺口仍须在新包中重新验证，不代表整个阶段知识已核实。

后续新空白运行 `reliability-complete-empty-2026-10-09-1791613883671` 已到达实际 AI 课程研究、路线生成及知识/来源展示；在首次正式确认前编辑4处介值定理相关原句时，保存草稿 PATCH 因页面漏传课程生成记录绑定返回400。数据库课程、草稿和复审三者的课程记录ID一致，并非输入真的变化；原接口事件、失败与候选记录保留。修复仅补页面恢复的候选绑定随编辑请求传递，不把最新课程ID重绑旧候选，也不放宽服务端版本门。新增4条真实 SQLite 和实际地图 GET/PATCH 处理器回归，连同原生命周期与复审测试15/15通过，typecheck、lint、encoding通过；[归因及验证记录](web/test-results/planning-creation-binding-repair-2026-10-09.md)另列。这是接口与数据回归，尚待新包中的实际页面操作验收。该运行未到达正式确认及后续教学，仍不能记为完整产品通过。

此前改造已接通《EnglishNode_Implementation_Plan.docx》的主要核心入口并取得部分完整链证据，可以启动桌面；本轮不能据此宣告全部任务完成。新的隔离空白模拟仍暴露规划知识漏检、来源内部标识处理和复审范围误判，正在修复并逐项重验。当前库会话、个人记录支持分页和服务端主题筛选。原有未提交工作保留在 codex/complete-learning-product；旧规则和旧执行代码先归档再替换，未重写历史迁移或真实项目数据库。

目标/当前差异：路线、灵活教学、真实反馈及动态活动、独立探索和返回、个人记录与修订、多处引用、普通跨域关系、主题、三态审计、历史只读、桌面和配置持久化均已接通。既有自动化和真实模型流程通过，不代表整门课程所有知识已准确、模型达到优秀教师水平或长期学习有效。最新全新模拟发现规划定理条件遗漏而复审漏检，独立内容接受在首阶段确认前暂停；下列早期完整链证据不覆盖这次新生成内容。

## 最新全新用户模拟：规划内容核对暂停

用户要求从零再次观察实际使用，本轮独立运行 fresh-user-2026-10-09-1791604544968。通过最终 packaged Electron、全新临时用户目录及空白 seed 启动，未导入旧课程或旧测试库，只复制已授权的模型设置。初始业务表和 AI 日志均为0。

- 实际到达：名称和目标输入、模型课程研究、8阶段骨架生成、明确接受、首阶段展开及页面恢复；全部相关接口正常返回，renderer错误0。正式地图版本1；保留1领域、8阶段骨架、6个候选节点，正式节点/会话/记录/关系均0。
- 内容阻断：复合极限节点的 newKnowledge 与 teachingTasks 把“内层极限存在、外层连续或极限存在”列为法则前提，却漏掉仅用外层去心极限时内层不得取逼近值等必要条件。取 g(x)=0、F(t)=1（t≠0）且 F(0)=2，两个极限存在却不能按外层极限得到复合极限1。生成与阶段复审均成功，复审仍 passed；停止是本轮独立核对作出的接受判断，产品没有自动识别该错误。
- 本轮共有7次真实 deepseek/deepseek-v4-flash 请求及2条 model=null 确认审计，6个页面检查点、13个接口事件；模型结构成功与知识正确明确区分。教案、正文、反馈、作答、个人修订/关系、探索返回和重启恢复均未到达，不能记为本轮通过。
- 非阻断问题：未取得来源正文时仍借权威顺序解释安排；选学承诺在具体路线变成普通掌握目标；教学次序被说成数学必要性；基础已写在目标中但页面仍显示未知，初始各Stage位置理由为空。独立核对与官方来源定位见报告。
- 原库与原设置指纹不变；临时设置副本已删除，隔离数据库和全部原回应保留，外键违例0、已知凭据命中0。没有修改业务代码、AI原文或以前测试结果。下一步应让规划中的核心定理事实检查与课程问题/节点任务的局部修正相连，而不是再次拆分合讲或增加格式门槛。

本轮 [详细报告](web/test-results/fresh-user-2026-10-09-1791604544968/REPORT.md)、[每一步、模型原文及原失败](web/test-results/fresh-user-2026-10-09-1791604544968/TRACE.html)、[实际统计与数据保护](web/test-results/fresh-user-2026-10-09-1791604544968/summary.json)。

## 立即启动

打开 [Antigravity.exe](web/dist-electron/win-unpacked/Antigravity.exe)，保留完整 win-unpacked 目录。页面显示 EnglishNode，沿用旧应用名与数据目录以保护原安装。实际桌面目录为 C:\Users\79067\AppData\Local\Antigravity，现有 DeepSeek / deepseek-v4-flash 配置已复制到本机应用目录并经重开读取验证，原设置未修改。详细步骤见 [Windows 启动与数据说明](docs/windows-start-and-data.md)。

最终程序已为用户打开，可见窗口与进程证据见 [实际桌面交付](web/test-results/implementation-2026-10-09/actual-desktop-handoff.json)。

“学习路线”输入名称和目标，审阅并接受具体安排后按需展开阶段；“当前学习”可直接探索问题；“个人知识网络”可随时保存、修订、建立关系和归入主题。保存、结束、完成分开，下一步指向真实可进入对象。旧内容从“历史内容”读取，不触发模型。

## 逐项验收

下面的“通过”指本行实际行为和数据保护，不表示已证实学习效果。模型内容与流程证据分别记录；无需模型的业务用真实 SQLite 和页面操作验证。

| 任务书场景 | 自动化、数据或页面结果 | 真实模型／桌面证据与范围 | 结论 |
| --- | --- | --- | --- |
| 明确目标与开放探索 | 名称和目标最小输入；未知基础可开始；独立会话无伪造节点；开放回应允许无标准答案和分数 | 微积分仅名称/目标的正式规划与公共空间开放讨论均实际调用配置模型 | 核心行为通过；理解效果未观察 |
| 确认与自由选择 | 未接受不写正式地图，确认绑定草稿和版本；拒绝建议不改图；前置仅提示，跳学可进入 | 实际模型路线经用户接受，首阶段展开后再确认；后续自由选择由页面和 SQLite 证据覆盖 | 通过 |
| 灵活学习 | 不依赖九维五段或每步必练，范围和前置责任仍校验；相关知识允许合讲 | 微积分真实框架3部分、公共空间真实框架7部分，按需生成正文 | 通过；不等于内容全部准确 |
| 两类实际困难 | 回应绑定真实输入与材料，不能仅换理由文案 | 把 a 当横坐标和临界点重复计数得到不同的真实解释、题目与活动身份；原文保留 | 通过；已知数学错误经后续资料纠正 |
| 动态新活动 | 材料与动作原子保存，可进入作答、重载、反馈和返回；幂等不重复造题，迟到响应隔离 | 实际进入第二类数学活动作答、得到对应反馈，再处理 x≥0 变式；公共空间讨论也可进入 | 通过 |
| 独立记录与修订 | 六类记录；先保存疑问，多节点/领域引用同一身份；追加不可覆盖修订，并发旧修订拒绝 | 实际桌面备课前保存疑问、学习后保存理解，随后修订并重开；原来源和旧正文可回看 | 通过 |
| 跨域与主题 | 不同领域端点普通关系可建立；对称类型判重、方向类型保留；一记录多主题，移出不删内容 | 实际模型提出候选，经明确接受；实际桌面建立联系、加入主题、修订和重启恢复 | 通过；关系确认不表示科学证明 |
| 自由探索与返回 | 路线、记录和临时问题共用服务；稳定 scopeKey、无虚构练习；返回位置持久化 | 真实数学和公共空间独立会话 nodeId=null；页面操作验证探索后返回原步骤 | 通过 |
| 状态与结果 | 节点仅 available/in_progress/completed；开始和完成追加审计；保存不完成、结束可留问题、完成后可复访；错误尝试不冒充掌握 | 实际桌面记录保存、学习与下一步分别运行；三态及产出校验由真实数据库验证 | 通过 |
| 恢复与历史 | 失败先保存输入；同号重试、过期结果、材料换版和帮助曝光保持绑定；旧格式只读、分页及明确沿用 | 打包窗口多次关闭重开恢复正文、输入、关系、修订与配置；实际原库内容在应用内可读 | 通过 |
| 桌面与模型 | 最终打包、新安装、旧库升级及安全交互通过；开发启动提供实际库和配置路径 | 实际用户目录再次启动并打开知识网络、历史及模型设置；配置模型跑过规划、学习、反馈、记录和下一步 | 通过 |
| 数据与删除 | 原库未改；先备份再迁移并验外键及保真；重复启动不增项；归档/改图保留积累，删除主题/关系不删记录 | 已把真实旧库副本升级到实际桌面目录，8记录、8修订、4关系保持，外键违例0；原库与备份留存 | 通过 |

## 实际执行的验证

- 最终开发检查：类型、lint、编码、Prisma schema 校验及生产／Electron 构建通过。最新全量单元与业务检查 **512/512**；包括统一会话、历史、事实更正候选、源引用、权限、事务、修订、状态、分页及安全契约。退役的旧写入断言和原文件在 docs/history 保留，不把它们追记为新业务通过。
- 最新隔离页面全量复验 **16/16**（59.9秒），涵盖真实按钮与读写：动态活动、探索返回、记录修订、跨域/主题、提示曝光、输入恢复、草稿失败恢复、旧格式、归属及分页。模型在此轮为明确标识的协议夹具，不用于证明知识正确。证据 [journey-1791575522145](web/test-results/journey-1791575522145)。随后修正删除当前所选主题时的筛选复位，相关页面再验 **1/1**（6.6秒），见 [journey-1791575678432](web/test-results/journey-1791575678432)。
- 分页实际数据库检查覆盖152条会话与302条记录的后续读取；页面覆盖第二页历史学习与记录、服务器按主题筛选较早记录、删除所选主题后返回全部记录。读取不调用模型，也不复制记录身份。
- 真实配置 **deepseek / deepseek-v4-flash** 完整链 **3/3**：微积分新路线到首节点教学和记录、两类数学困难及 x≥0 迁移、公共空间开放问题。[原始隔离库](web/test-results/journey-1791569814815/journey.db)、[模型与活动摘要](web/test-results/implementation-2026-10-09/real-model-evidence.json)。审计中的 model=null 确认事件不是模型请求，fallback 也不算真实模型成功。
- 打包桌面真实任务分段保留：公共空间从备课到活动、反馈、记录、下一步见 [1431214](web/test-results/desktop-full-1791571431214/result.json)；关系候选接受、主题、修订和重启恢复见 [1865259](web/test-results/desktop-full-1791571865259/result.json)。两份早期报告各自仍记录当时的失败，不追改整轮通过。失败位置修复后的最终内容核对及设置重启见 [4354273](web/test-results/desktop-full-1791574354273/result.json)。
- [逐步记录与模型原文](web/test-results/implementation-2026-10-09/TRACE.html) 汇集上述真实模型和桌面运行，保留原失败、原回应、版本、反馈更正与请求顺序；凭据不进入可读导出。
- 最终 packaged Electron [干净 seed](web/test-results/implementation-2026-10-09/desktop-clean.json)、[旧库升级](web/test-results/implementation-2026-10-09/desktop-upgrade.json)、[本地身份/Host/Origin及危险导航保护](web/test-results/implementation-2026-10-09/desktop-security.json) 均通过；截图在部分 Windows 原生捕获中不可用，逐步可见文字、请求、数据库及事件仍完整保存，没有把缺截图改写成有像素证据。
- 真实原库副本 [最终保真复验](web/test-results/implementation-2026-10-09/migration-final.json)：首次及重复启动均8记录、8修订、4关系，外键违例0，备份存在且原库不变。实际桌面目录 [启动](web/test-results/implementation-2026-10-09/actual-desktop-runtime.json)、[迁移数据](web/test-results/implementation-2026-10-09/actual-desktop-data.json)、[真实页面读取](web/test-results/implementation-2026-10-09/actual-desktop-ui.json) 均通过，当前知识网络可见8条已有记录。

## 实测失败、修正与知识质量边界

实际模型曾漏字段、误用反馈字段或返回未约定的关系类型，已补明确合同及有界结构修复；旧反馈没有新 action 时原读取崩溃，已改为历史专用只读适配。原强制 GPU 参数造成桌面捕获时退出，已去除冲突参数，仍保留沙箱、本地认证和现有加速关闭入口。旧诊断生成及阶段写入的残留入口也已退役，归档操作不再提示“删除全部内容”。

更关键的知识失败也完整保留：数学原回应根数正确，但理由把 |a|>2 写为两侧各相交一次，并混淆不同实根、几何交点与重数；x≥0 回应把 a=0 的左根错误归入 (0,1)。第一次更正又生成了“2个实根、1个几何交点”的错误。更正候选现复用发布前事实检查；原回应不覆盖，不确定候选不发布。随后复核对已修正的区间继续沿用旧指控，还给原样替换，已改为核对当前候选、明确传入执行过的改动并拒绝无实际变化的修正。

[最终更正原文](web/test-results/desktop-full-1791574354273/feedback-corrections.json) 已独立对照因式分解、单调区间与端点：全实轴3/2/1，x≥0按 a<-2、=-2、(-2,0)、=0、>0 分别为0/1/2/2/1；不同实根与不同几何交点一一对应。使用的是实际粘贴的 [本轮独立推导](web/test-results/desktop-full-1791574354273/independent-derivation.txt)，不是虚构外部来源或权威认证。旧错误、错误更正与后续修正、模型原始返回、请求和反馈版本均保留。

这些证据说明流程可运行、已知错误能够回到具体内容修正，仍不能证明以后每条解释都准确。联网或资料抓取不可用时显示未取得正文，允许粘贴实际资料继续；不假装搜索成功。尚未做真实初学者教学观察、长期保持或整门课程内容逐条人工验收，也未据此宣布分发发布合格。

## 主要改动与删除／替换

| 能力 | 主要位置 |
| --- | --- |
| 目标与资料驱动路线、一次正式确认、阶段局部修复 | courseDesignService、domainWorkflowService、domainMapService、roadmapService、ai/tasks与tutorService、domains/new和领域页 |
| 统一灵活备课、按需正文、实际反馈与动态活动、恢复及下一步 | flexibleTeaching、learningSessionService、learningContentReview、nextLearningActionService、LearningWorkspace、learning-sessions API；节点入口复用同一服务 |
| 随时保存、六类记录、不可覆盖修订、多处引用、普通跨域与主题 | personalKnowledgeService、knowledgeService、knowledgeGraphService、PersonalNetworkWorkspace、knowledge-points/knowledge-collections API |
| 三态与只追加审计、保存/结束/完成分离 | learningActivityService、LearningProgress及节点start/complete适配 |
| 历史分页、旧格式、显式摘录及冲突身份 | historyService、learning/history、原节点历史适配、retiredLearningOperation |
| 数据调整与安全桌面生命周期 | web/prisma/schema.prisma、20261009120000前向迁移、teaching-database/database-lifecycle、main.js与启动/打包脚本 |

已替换固定九维五段、每段必练、一概念一节点、保存即完成、作答即掌握、普通跨域必须 WORMHOLE、Unit 独立总评写入及固定 L1/L2/L3 新建议流水线。旧 nodeTeachingService/nodeTeachingTasks/progressiveTeachingTasks 生成执行退出，共享解析、错误、AI调用、来源和事务工具保留。旧诊断与节点 hint/practice、旧阶段与长期包 POST 返回只读退役响应；旧诊断页面进入历史。已删除无正式引用的旧诊断／练习／固定建议生成与写入函数，未删除个人关系或共享模型函数。兼容 Word/Relations 不再承担新写入或知识镜像。

旧页面、接口、断言及实现快照见 [docs/history](docs/history/)，包括 pre-0025-browser-contracts 和 pre-0025-remaining-execution。AGENTS、CONTEXT、ADR、顶层设计、实施说明与当前合同同步；旧历史证据保留其当时含义。

## 旧数据与恢复

真实 F:\englishnode\web\prisma\dev.db 不改写，最终 SHA256 仍为 2fa3adb7a07b49216e61914ac77b2e9dcf29fcff831203d7f9c1f4097cd85fc0。原 AI 设置同样未改。经副本验证后，把一致性副本和已有配置接入实际桌面目录，没有覆盖既有用户文件：

- 当前库：C:\Users\79067\AppData\Local\Antigravity\englishnode-teaching-v2.db，已有8条个人记录、8份首修订、4条关系，可在个人知识网络继续使用。
- 保留旧库副本 englishnode.db、englishnode.db.before-teaching-v2.db，以及 englishnode-teaching-v2.backup-2026-10-09T19-35-52-919Z.db。项目原 dev.db 另可在历史入口只读查看；旧来源原始字段与快照不伪装成用户新写内容。
- 当前配置在同目录 ai-settings.json，重建不替换。设置及用户数据库、测试证据与构建产物保持 Git 忽略；不提交或分享密钥。原开发设置仍在 web/.electron-user-data。
- 历史已跟踪的 web/.env 已仅取消 Git 跟踪，磁盘原文件保留，现有忽略规则生效；该文件只有数据库地址字段，没有改写本机配置或删除数据。

关闭或重启后从“当前学习”恢复；失败只重试对应操作，不重新生成所有内容。启动迁移失败保留原库、备份与 backend-error.log 并停止，不通过清空或破坏性同步绕过。来源、原输入、旧材料及历史修订均可回看。完整恢复说明见 [启动与数据说明](docs/windows-start-and-data.md)。

以下为历史证据，结果不追改为新版通过。
# 当前设计与开发进度

更新日期：2026-10-08

## 当前判断

2026-10-08（ADR 0024 新空白库复测，独立知识核对暂停）：运行 calculus-continuity-2026-10-08T14-43-18-046Z 使用允许合讲的新任务书，从独立空白库完成入门导引、任务确认、课程研究、骨架联合确认及首阶段展开/刷新。合讲未被阻断，夹逼已有明确教学任务，上一轮缺少承接未重现。但骨架把“夹逼与单调有界都只判断存在、不能直接给出值”写成必需教学内容，阶段进一步照抄到目标/任务，与自己的正确夹逼例子矛盾；两次 AI 复核仍 passed。**当前暂停由独立内容审查触发，页面确认可用、HTTP 没有失败；这是重大知识错漏检，不能把本轮记作新教学链通过。**

- 范围与证据：版本化空白 seed 初始化，初始业务表与 AI 日志均为0。真实 Chromium、正式 API、SQLite 与 deepseek/deepseek-v4-flash，共23个独立检查点、35个 API 请求、10次真实 AI 请求（8次结构有效、2次失败自动恢复）及2条用户确认审计。最终1领域、6正式阶段、4候选节点、mapRevision=1；正式节点/教案/正文/交互/知识点为0。框架前置计划、正文补讲、跳学与沉淀未到达，尚待复验。
- 已恢复问题：导引中的“不设阶段划分”被关键词正则误拒；第二轮课程复核少关闭括号且层级错误，解析器误取内部完整对象后报外壳缺失。Provider正常结束，6962输出tokens低于该任务20000上限，没有窗口耗尽证据；两次均自动重试成功。另6条来源抓取不可用已披露，AP课程排除微分方程的归因与官方目录不符；本轮范围源于用户排除项，只需纠正归因，不扩大课程。
- 原因与后续：独立事实核对目前在框架/正文执行，规划综合复核本轮未识别上游内容要求错误，结构覆盖把它继续传递。先对核心定理/条件及例子做有证据的事实核对；将该问题要求与关联节点一起版本化局部纠正，保留总目标、其他阶段和正式确认门禁，不以重新拆分合讲节点代替纠错。
- 本轮仅模拟、核对与记录，未改业务代码、数据库结构、原始 AI 返回或旧测试记录；真实 dev.db 指纹保持，外键违例0、已知凭据命中0。浏览器/服务/连接已关闭，临时设置已删除，隔离库与全部失败记录保留。证据：[报告](web/test-results/calculus-continuity-2026-10-08T14-43-18-046Z/REPORT.md)、[逐步记录与AI原文](web/test-results/calculus-continuity-2026-10-08T14-43-18-046Z/TRACE.html)、[原因与建议](web/test-results/calculus-continuity-2026-10-08T14-43-18-046Z/repair-analysis.json)。

2026-10-08（ADR 0024 代码接通，定向检查完成）：规划、局部修复、教学与复核已撤销严格一概念一节点要求，允许相关知识合讲，按具体教学内容及必要前置判断缺陷。新框架保存逐步骤前置承接计划，新正文在使用前显示必要说明。下面“仅文档调整”和旧粒度判断均为历史状态。**代码与契约检查完成，不代表真实模型已稳定识别全部知识依赖，也不代表新手学习效果已验证。**

- 前置输入从标题/目标扩展为实际范围、新增知识、教学任务及例子，并携带最新材料、查看、跳过、疑问和用户确认理解原话；学习事实不进入框架稳定摘要。当前会话刷新恢复新事实，普通阅读和提问不使教案失效，前置教学范围变化仍需新框架。
- 新框架 prerequisitePlan 绑定必要知识、用途、使用步骤及默认基础/前置节点/先行步骤/当前步骤补讲。结构检查拒绝未声明节点、不存在或倒置的步骤、清单外基础与无效标识。实际内容和所需深度由复核对照前置任务检查，标题存在不算教学承接；空计划不豁免实际缺口。
- 新正文 prerequisiteSupport 为每个非基础依赖的使用步骤提供先行说明，直接跳步同样可读；默认基础不强制重教。说明进入实际内容及知识核对，框架承接中的错误事实可沿原版本纠错修改，依赖身份与步骤位置保留。没有新增测验、掌握判定、节点锁定或自动改图。
- 最新检查：8个文件131项定向检查通过，覆盖合讲、假基础、未声明前置、倒置/自引用步骤、必要说明缺失、旧框架读取、事实纠正保真及隔离 SQLite 中的阅读/提问恢复和范围变化。首轮4失败中1项发现空摘要缺少 unresolved 数组导致前置读取报错，已修复；另3项为新框架字段及提示版本的旧样本预期，已对齐后重跑。类型检查、编码检查及最终生产构建（含 lint 和类型检查）通过，构建仅提示 Browserslist 数据陈旧。
- 边界：本次未调用真实 AI、未重新运行浏览器全流程，也未修订上一份测试课程或改写其原文。旧框架不伪造新承接字段，显式重备使用新契约；前置上下文升级可能要求旧课重新准备框架，历史材料仍保留。未修改 schema、迁移、seed、依赖或真实用户库，真实 dev.db 指纹与上一轮一致。全量旧夹具和发布检查未重跑，历史失败不能据此记作已修复。
- 下一步真实模拟使用新空白库，任务书明确允许合理合讲，不再人为添加旧的严格单概念约束；重点核对实际前置缺口、跳学补讲及正文准确性。上一轮资料归因不准确仍须在实测中独立核对。

2026-10-08（用户校准质量标准，ADR 0024）：相关概念可以合讲，重点是实际理解质量和前置知识承接，概念数量本身不作为阻断依据。上一份独立模拟中“概念打包”的结论现调整为需结合教案判断的组织方式，不能据此要求拆分；当时暂停的历史事实保留。夹逼已被使用却无明确教学承接、来源归因不准确仍是待处理问题。**本次仅更新术语、决策、目标、实施计划及测试解释；运行时生成/复核仍含旧单概念约束，前置实质承接检查尚待实现和复验，不能宣称修复完成。** 没有修改代码、数据库或原始 AI 返回，也没有重新执行测试。


2026-10-08（追加全新空白库复测，独立内容审查暂停）：新运行 calculus-fresh-audit-2026-10-08T11-27-38 没有复用 run3 课程或学习记录。导引、任务确认、研究、骨架确认、首阶段展开及刷新恢复成功，但首阶段把数列/函数的多条独立性质各合成一个节点，“两个重要极限”又假定已学未安排讲解的夹逼，AI 复核仍 passed。课程在五条来源全部抓取失败时对 MIT 教学顺序作了不准确归因。**当前差异：基础排除及共享问题分工可用，最小单元语义分解、实质前置核对和来源归因仍未可靠达成；上一轮修正单份课程并走通首课不能证明新课程质量稳定。**

- 本次保留23个检查点、9次真实 AI 请求（8次结构成功、1次失败自动恢复）与2条确认审计；课程复核错误是 draft 嵌在 report 内而非顶层，Provider completed、完整 JSON，不是截断。
- 技术接口未阻断；测试因独立内容核对暂停在概念确认前。正式数据1领域、5阶段、0节点、0教案/段落/交互/知识点；5个候选概念保留。后续教学与沉淀本轮未到达。
- 本轮仅测试与记录建议，未改业务代码或 AI 原文；清理完成，外键违例0、已知凭据命中0、真实用户库指纹保持。
- [本轮报告](web/test-results/calculus-fresh-audit-2026-10-08T11-27-38/REPORT.md)、[每一步及原文](web/test-results/calculus-fresh-audit-2026-10-08T11-27-38/TRACE.html)、[独立内容核对](web/test-results/calculus-fresh-audit-2026-10-08T11-27-38/content-review.json)。以下 run3 “完成”指上一轮特定课程与修订范围，不覆盖本次新发现。


2026-10-08（本轮修复与独立模拟完成）：课程基础、最小教学单元及共同问题分工已接通。run3 从独立空白库走通领域导引、任务确认、研究与骨架确认、首阶段概念确认、首概念五段教学、自由交互、刷新恢复和本人确认沉淀。本轮发现的框架 N 条件、量词交换、夹逼循环前提及正式规划复合极限条件已纠正，原文、失败、修订和独立核对保留。**功能链通过、已知错误纠正，与整门课程知识质量及真实新手效果验收分别记录；后两者尚未完成。**

### 2026-10-08 本轮最终证据与范围

- 独立库 `calculus-shared-content-2026-10-07-run3`，Domain `cmuyxh8970001gs9urv3iktqt`，由版本化空白 seed 经现有生命周期初始化，初始业务表与 AI 日志均为0。之后从本轮失败位置明确重试，不复制更早课程。真实 Chromium、正式领域 API、SQLite 和 `deepseek/deepseek-v4-flash` 共同取得证据；默认高中基础没有在首阶段另建节点。范围是一元微积分入门的首阶段、首概念完整学习，不是整门考研数学验收。
- 共享问题的结构化分工进入规划、局部修复、框架步骤和正文覆盖汇总。整段九维教学与问题贡献标注分别校验；合法补充关联保留教学而不冒充该问题覆盖，未知/重复/错段/必需缺项仍拒绝。缺项诊断提供实际维度及可安排段落，避免修复原样返回；概念引用不产生隐式前置关系。
- 知识纠错实际完成：框架版本2允许 N 不随 ε 变化，并明确极限可等于数列项；concept 正式材料版本2把量词交换后的条件改为最终常数列；integrate 正式材料版本2明确夹逼目标收敛是结论而非先验前提。独立审查覆盖正文、答案、回应依据及提示，保留非阻断建议。复合极限节点通过“修订本阶段”保存、恢复、复审和明确确认，从地图版本2更新到3；其他阶段、目标及原学习记录保持。
- 新增实测问题已分别处理：重复嵌入正文导致知识报告两次达到9000输出tokens并截断，改为互不嵌套的实际目标，选步骤仍包含其活动；“缺少资料”的自述误标 source 但没有引用，补明确约定和目标诊断，不放宽引用；复核对已改正摘要继续引用旧指控，改为核对当前原文的限定范围；普通 warnings 字符串/category 错误提供精确 code/message 约定，只修报告。早期标注失败均为完整 stop 返回，不能与后来真实截断混为一谈。
- 已提交疑点和请求在 AI 调用前保存，GET及刷新恢复；同号更换疑点/备课方式拒绝，修改内容使用新请求。相同请求、框架及来源版本的失败候选继续完整校验和复核，不回退原错误正文；候选来源版本与原发布材料身份分开保存。修改后的题目不会继承原解答曝光，旧交互不改写。
- 最终真实重试只新增知识核对、教学复核两次调用，已保存的正确 integrate 候选原样发布，没有再次生成正文。五段可读、原疑点刷新恢复、原回答与已确认理解保持，外键违例0。最终保留1领域、7阶段、5概念、1条seen知识点、2个框架版本、8条材料版本、2条原交互；当前框架版本2、地图版本3。
- 完整调用证据：66次真实 Provider 请求，其中41次结构有效、25次调用或结构检查失败；另4条用户确认审计。结构有效不代表知识正确。时间线146项，对应143个独立检查点路径；一次旧脚本归档失败并重用retry4命名，少量重复截图可能被覆盖，原始AI日志/接口/失败点仍在。另两次折叠区域定位停止属测试脚本问题，已单列而未算作业务知识失败；后续使用时间戳目录。
- 最新开发检查：9文件140项定向检查、编码检查及生产构建（含lint与类型检查）通过，只有Browserslist数据陈旧提示。本轮未改schema、迁移、seed或依赖；未重跑全量旧夹具、packaged Electron或真实初学者试教。历史43项失败不能据此记为已修复。
- 清理与隔离：浏览器、服务和数据库连接已关闭，临时AI设置删除，隔离库保留快照；真实 `web/prisma/dev.db` SHA256前后一致，已知凭据命中0，最终页面脚本/控制台错误0。目标/当前差异：后六阶段未展开教学，部分首课材料缺少匹配资料，当前核对主要依靠推导；不能宣称无幻觉、完整课程内容合格或已经教会新手。

本轮入口：[报告](web/test-results/calculus-shared-content-2026-10-07-run3/REPORT.md)、[逐步页面与AI记录索引](web/test-results/calculus-shared-content-2026-10-07-run3/TRACE.html)、[最终统计](web/test-results/calculus-shared-content-2026-10-07-run3/final-evidence-summary.json)、[已知知识错误独立核对](web/test-results/calculus-shared-content-2026-10-07-run3/first-lesson-content-review.json)、[阶段修订](web/test-results/calculus-shared-content-2026-10-07-run3/stage-correction-outcome.json)、[正文纠错](web/test-results/calculus-shared-content-2026-10-07-run3/material-correction-outcome.json)、[检查](web/test-results/calculus-shared-content-2026-10-07-run3/verification-checks.json)、[清理](web/test-results/calculus-shared-content-2026-10-07-run3/cleanup-evidence.json)。原始证据受版本控制忽略，不提交用户数据库或设置。

### 修复过程中的历史进度

以下条目保留各次发现时的状态；其中“待复验”“未到达”等不覆盖上面的最终结果，旧失败也不追改为通过。

2026-10-08（实测新增知识问题）：独立抽查首课框架发现“N 不是与 ε 无关的固定数”被过度概括，常数列可统一取 N=1，原模型核对漏检；已要求知识核对检查全称/必要性主张的常数、零值和边界反例及框架内部矛盾。将经既有显式框架纠错入口形成新版本并保留原始错误，不能将先前 ready/passed 记作知识已验证正确。

2026-10-08（已确认阶段修订入口已接通，真实操作待复验）：独立审查 run3 首阶段发现复合极限规划把“外层函数极限存在”错误地当作可直接代入函数值的充分条件，原文与反例另存 [content-review.json](web/test-results/calculus-shared-content-2026-10-07-run3/content-review.json)。正式 Map Draft API 已支持版本化修改，现补齐“修订本阶段”、新增知识/课内任务/代表例子/贡献说明编辑、保存及 expanded 阶段草稿恢复，继续经过复审与用户确认。保存保留其他草稿阶段、模块目标、引用及稳定节点 key；修订确认后留在地图。类型检查、限定两文件的 lint 与8条内存恢复/保真断言通过；未单独构建或操作测试库。该数学错误尚未修改正式地图，入口的真实用户操作也待下一次模拟，不能宣称本轮课程内容质量已通过。

2026-10-08（继续修复与实测中）：独立空白库 run3 已通过课程确认、骨架和首阶段确认，首概念框架因把补充九维讲解全部标为问题覆盖而停止。按 ADR 0023 分离教学内容与覆盖计数，保留原失败及原文；修复后从该独立库的失败备课位置明确重试，尚不能宣称五段学习链通过。本次九文件128项定向检查、类型、编码及生产构建通过；原两份失败候选重放通过，九维内容及步骤目标不变。真实重试又发现必需 motivation 分工遗漏且报错未定位具体维度，已补齐具体缺项、可安排段落和动态返回示例；继续复验，不放宽缺失检查。

2026-10-07（共享问题分工修复中）：发现 ADR 0023 的文字分工尚未落实到正文和课程覆盖校验，旧逻辑要求所有参与节点各自覆盖完整问题。已接通版本化具体分工、框架步骤安排和课程汇总。8文件109项定向检查通过，类型、编码和生产构建通过（构建首先发现2处变量命名规则不符，修正后通过）。新的独立空白库真实AI模拟进行中；上一轮67项检查不作为此项真实AI流程通过的证据。

2026-10-07（ADR 0023 功能接通，定向检查通过）：课程方向保存默认基础与新增范围，新节点保存新增知识、课内任务、代表例子、使用的基础和教学引用；生成、局部修复、复核与九维备课共享边界。课程确认页、阶段审查和课堂可查看分工，基础可通过当前步骤提问补讲。补充澄清：上次模拟是系统通过后因粒度疑点主动停止，不能据此断言正文无法教学；模拟任务书主动纳入实函数与定义域，也影响了基础节点生成。以下保留当时记录，不将未到达环节改写为通过。


### 2026-10-07 ADR 0023 本轮证据与差异

- 新生成课程使用 courseDesignVersion=3，并保留基础清单缺失的质量门状态；旧内容仍可读取，不自动填充。新展开节点要求 learningUnit，局部修复不能丢弃已有单元，新节点沿用完整契约。精确重复新增内容、自引用和悬空引用属于结构错误，语义粒度仍按既定严重缺陷规则复核，不按标题机械拆分。
- 定向检查：6个文件67项通过，涵盖边界序列化、旧内容读取、重复负责、引用与前置分离、阶段修复保真、隔离SQLite中的教学上下文持久化/变化失效及跨领域引用拒绝，兼顾既有框架纠错和材料契约。第一次出现1项旧提示版本预期失败，已随新提示版本更新并重跑通过；未放宽业务门禁。
- 类型检查、lint、编码检查和生产构建通过；构建仅提示Browserslist数据陈旧，不影响退出成功。补充新增修复节点契约后，局部修复文件23项再次通过。数据库检查仅使用测试自行创建的临时空白seed副本；本轮未改schema、迁移或seed，不迁移真实用户库。现有工作区其他修改保留。
- 目标/当前差异：本轮没有调用真实AI、操作浏览器或重跑完整课程模拟；未宣称微积分内容、五段实际学习、个人沉淀及新手学习效果已通过。下一轮应使用新的独立空白库，任务书仅将高中函数/代数作为默认基础，逐步保留原文和状态，完成真实课程学习链。

2026-10-07（新空白库微积分用户模拟）：入门导引、用户任务确认、课程研究、完整骨架联合确认及首阶段展开已取得真实页面/API/SQLite/AI证据。当前技术入口返回通过，但独立内容审查发现“定义域与值域”范围同时教授两种独立概念，“初等函数回顾”承担五类函数的宽泛回顾；单概念规则未被语义复核落实。已停止首阶段正式概念确认。目标/当前差异：这是新发现的业务质量问题，不是本轮HTTP阻断，不能把模型复核通过记为内容合格；框架、五段教学、交互与个人沉淀尚未到达。

### 2026-10-07 新空白库微积分模拟与单概念粒度问题

- 空白与范围：独立运行 `calculus-full-flow-2026-10-07T08-05-34-565Z`，Domain `cmuxtq21u000166ngl4wyn7dr`。版本化空白seed经既有用户数据库生命周期初始化，领域、阶段、节点、知识点、教学/交互及AI日志全部为0，无旧课程、故障夹具或记录导入。模拟用户先只输入领域名称，再明确高中基础、每天45分钟、一元微积分入门；排除多元、级数与微分方程，本轮不宣称覆盖完整数学一考纲。
- 已执行：真实Chromium、正式领域API、SQLite与 `deepseek/deepseek-v4-flash` 完成导引 → 采纳并编辑 → 任务确认及恢复 → 课程研究与来源/内容复核 → 骨架与恢复 → 用户联合确认课程方向/骨架 → 首阶段概念展开与复核 → 独立粒度审查 → 草稿恢复与应用内日志回查。保留22个检查点（含等待和恢复状态），每步有页面截图/文字/表单、请求/返回、数据库与AI原文。
- 规划结果：1个总目标、15个内容问题、10个Stage；骨架HTTP200、0模型阻断/6建议、0骨架内容修复。首阶段返回6个候选节点，HTTP200、0模型阻断/3建议、0阶段修复。正式地图版本1、10个待展开Stage；没有确认6个概念候选，正式LearningNode、框架、段落、交互、KnowledgePoint均为0。
- 独立质量问题：`node-domain-range` 的概念名为“定义域与值域”，scope明确同时包含“自然定义域的求法”“值域的初步求法”，并非仅在一个概念中比较关联知识。`node-elementary-functions` 的scope要求五类函数各自的表达式、图像特征和自然定义域限制，更接近宽泛回顾任务。生成/复核提示都有单概念要求，结构门只验证必要字段；原AI复核报告已经是0阻断，把节点边界问题列为建议，系统没有悄然降级原阻断。停止性质为独立业务质量审查，确认按钮当时可用。
- 真实调用与恢复：9次实际Provider调用，8次结构通过、1次结构失败；另外2条为用户确认审计。课程内容复核首次返回 `summary/significantIssues/dimensions` 而非要求的 `report/draft`，自动独立重试后恢复，没有停止用户流程。Chat Completions输出均`stop`，Responses均`completed`且无`incomplete_details`；阶段原文7175字符/2918输出tokens，复核3506字符/1510输出tokens，无截断证据。两页MIT OCW通用一元课程来源由应用抓取返回200，不代表官方当年考纲核验。
- 恢复与数据：刷新保留课程方向、草稿、复核和六个候选表单内容，日志数不变。外键违例0、页面脚本异常0、控制台错误0；7条导航/预取`ERR_ABORTED`单列。浏览器、服务和数据库连接已关闭，临时AI设置已删除，真实用户库指纹保持；文本证据与隔离库快照凭据命中均为0。SQLite快照额外保存在本轮证据目录。
- 本轮边界：未修改功能或测试代码，未修旧自动检查夹具，未重跑全量自动检查或packaged Electron，未进入九维备课/五段/答疑/个人沉淀。上轮知识纠错定向证据保留，不能用它替代本轮完整链。下一步只修当前Stage的真实概念范围与对应语义复核，保留总目标/其他阶段，不按标题连接词或数量机械拆分，不把一般建议恢复为阻断。

本轮入口：[报告](web/test-results/calculus-full-flow-2026-10-07T08-05-34-565Z/REPORT.md)、[逐步页面与全部原文](web/test-results/calculus-full-flow-2026-10-07T08-05-34-565Z/TRACE.html)、[问题分析](web/test-results/calculus-full-flow-2026-10-07T08-05-34-565Z/failure-analysis.json)、[阶段原始复核](web/test-results/calculus-full-flow-2026-10-07T08-05-34-565Z/stage-review-original.json)、[最终结果](web/test-results/calculus-full-flow-2026-10-07T08-05-34-565Z/outcome.json)、[清理](web/test-results/calculus-full-flow-2026-10-07T08-05-34-565Z/cleanup-evidence.json)。

2026-10-06（框架知识事实核对与纠错，开发和定向验证完成）：已接通 [ADR 0022](docs/adr/0022-framework-knowledge-correction.md)。框架事实接受隔离上下文的推导/资料核对，正文冲突可回到上游纠正；已公开框架用新版本局部修正，正确正文先重新检查再复用，旧材料与用户记录保留。最新独立故障场景已通过真实AI纠错、记录承接、重复请求、刷新、历史回查和继续答疑。目标/当前差异：这是已知函数错误的定向纠错证据，不是完整课程规划、全部五段、个人沉淀或真实新手学习效果验收；模型核对不构成权威认证，历史失败不追改为通过。

### 2026-10-06 框架事实纠错与连续学习验证

- 事实与安排分别处理：新框架先核对定义、案例、九维要点及段落目标内的实际知识，再复核教学安排。来源缺口和待核对内容不自动成为错误；原文、推导/实际片段及错误后果保留。正文复核可指向 `framework:<target>`；有争议的知识阻断再次独立核对，不要求正确答案服从旧框架，未得到依据支持的复核意见撤销并保留原记录。
- 局部纠正与版本：知识错误以原文目标对应的补丁更新事实，保留概念范围、前置、九维映射、段落和步骤身份。已知错误框架标记 `needs_correction`，暂停新授课；新版本准备失败可重试，候选和全部调用关系保留。一次段落请求最多进入一次框架修正，框架/材料最多两次修复，无进展停止；归属、来源修订、版本和生成令牌继续校验，过期反馈不覆盖当前教案。
- 返回约定：原文编号由系统恢复真实文本，拒绝越界编号与伪造资料；16组内容须全部覆盖，可对同组不同实际原文逐条核对，不因更细报告超过16条而拒绝。确切的 `{type:"json_object",content:实际对象}` 外壳只做一层解包，内部仍完整校验；原始、解析和校验结果分别保存。未知外壳、重复位置、遗漏和错误内容仍拒绝。
- 连续学习：框架修正继承个人理解草稿；旧正文按需校验并复核，已正确内容不重新生成。材料按当前契约规范化后比较，JSON属性顺序不算改变；相同内容承接作答/提问草稿、提示与解答曝光、已读、跳过及位置。实际题目、解答或讲解改变时不继承旧曝光。旧交互始终引用原版本。
- 操作：正式节点页增加“核对并纠正整课知识”，使用现有 `POST teaching` 的 `verifyKnowledge=true`；自动发现上游错误也进入同一纠错流程。读取、刷新和历史回查不触发AI，历史内容只读，正式地图与个人首次确认沉淀规则不变。
- 定向开发检查：4文件、40用例通过，包含真实原文/编号、多原文报告、外壳完整校验、事实错误归属、复核误判撤销、有界修正、正确正文复用、属性顺序与内容变化、历史保留、请求幂等、来源变化、迟到反馈、归属及外键。TypeScript、Lint、编码和最新生产构建通过。本轮没有schema、迁移、seed、依赖或测试设施变更，也未改写真实用户数据库。
- 全量状态须单列：早期一次命令误把 `src` 根目录带入，实际执行了全量；当时83文件（72通过/11失败）、575用例（527通过/48失败）。其中5项教学mock未适配新增知识调用，已在上述定向检查修正；当时其余43项未逐项核对，未宣称全量通过，也未重跑packaged Electron或真实新手试教。
- 2026-10-06追加失败核对：按用户询问重新运行现有自动检查，84文件（74通过/10失败）、594用例（551通过/43失败）；上述教学纠错4文件40用例仍全部通过。43项逐项原始错误与10个文件的原因见[失败核对报告](web/test-results/legacy-fixture-review-2026-10-06T22-50-26/REPORT.md)。主要直接原因是旧版规划样本、缺少入门导引或新增返回字段，以及旧提示/复核预期；若干用例被旧输入提前阻断，尚未触达它们原本要验证的版本冲突、阶段复核或学习成果保留逻辑，不能统称为已排除的业务问题。本次未修改测试或业务代码，未调用真实AI，默认数据库隔离，真实用户数据库指纹保持。

| 独立场景 | 停止边界与处理 |
| --- | --- |
| [原文引用](web/test-results/framework-correction-2026-10-07T05-00-13-572Z/REPORT.md) | 框架生成成功，两次知识报告合并四条真实原文，单条文字引用门拒绝。停止后改为原文编号。3次实际调用。 |
| [明确外壳](web/test-results/framework-correction-final-2026-10-07T05-05-39-480Z/REPORT.md) | 两次完整框架都放在明确JSON外壳内，原根对象检查拒绝。停止后增加严格的一层解包，内部门禁保持。2次实际调用。 |
| [合法逐条核对](web/test-results/framework-correction-verified-2026-10-07T05-10-13-946Z/REPORT.md) | 两次报告都核对44条实际原文、覆盖全部16组，但固定16条规则拒绝；不是截断。停止后允许不同原文分别核对。3次实际调用。 |
| [纠正后记录承接](web/test-results/framework-correction-loop-2026-10-07T05-16-18-549Z/REPORT.md) | 真实AI纠正错误框架、复用正确正文，5次调用成功；属性顺序导致草稿及帮助未接到新版本，旧记录仍在。停止后改为契约规范化比较。 |
| [最终定向纠错](web/test-results/framework-correction-complete-2026-10-07T05-25-06-334Z/REPORT.md) | 10检查点、6次真实 `deepseek/deepseek-v4-flash` 调用全部成功；上游错误纠正、正确材料复用、学习记录承接、请求重发/刷新/历史回查和继续提问通过。 |

前3份为新空白库中的单概念准备夹具；后2份为新空白库中明确注入的“已知错误框架＋正确正文＋用户记录”故障夹具，用来验证既有教案纠错，不记作AI正式建图或完整课程学习成功。没有复制前轮数据库、正式地图或AI日志，夹具内容及来源明确留档。每轮均保留每步页面、请求/响应、数据库及AI实际提示、返回、候选、校验和修订关系。

最新数学结论已实际改正：`1/(x-2)` 与 `(x-2)/(x-2)^2` 的自然实数定义域都为 `R\{2}`，在全部允许输入上约分后取值一致，所以是同一个函数。新框架2保持范围、定义、案例、映射及步骤身份，正确正文没有改写；旧记录与当前承接记录逐项核对通过。继续追问约分为什么不能补回 `x=2`，真实反馈正确解释了非零因子的约分条件及原定义域。

最新为2框架、2段材料（旧/新版本）、2交互（1夹具/1真实提问）、0知识点，地图revision=0；未执行正式建图或沉淀。外键违例0、页面脚本异常0、控制台错误0。全部5份运行关闭浏览器/服务/连接，删除临时设置，保留隔离库和证据；凭据命中0，真实 `web/prisma/dev.db` 指纹保持。

最新入口：[完整报告](web/test-results/framework-correction-complete-2026-10-07T05-25-06-334Z/REPORT.md)、[每一步与原文](web/test-results/framework-correction-complete-2026-10-07T05-25-06-334Z/TRACE.html)、[内容与记录保真](web/test-results/framework-correction-complete-2026-10-07T05-25-06-334Z/content-and-preservation-review.json)、[最终结果](web/test-results/framework-correction-complete-2026-10-07T05-25-06-334Z/outcome.json)、[开发检查](web/test-results/framework-correction-complete-2026-10-07T05-25-06-334Z/verification-checks.json)、[清理](web/test-results/framework-correction-complete-2026-10-07T05-25-06-334Z/cleanup-evidence.json)。下一步再做完整的新课程学习模拟和独立内容审查；本轮不能保证一般知识事实或新手教学效果，也不抹去先前失败。

2026-10-06（严重缺陷复核与规划修订，修改和复核完成）：已落实用户授权的 [ADR 0021](docs/adr/0021-critical-review-and-revisable-planning.md)。规划、框架及正文使用有位置、原文、既定要求与严重后果的重大缺陷报告，普通建议允许保留；整体未确认规划可修订内容问题并记录承接关系，局部阶段仍只修改当前阶段。目标/当前差异：规则实现和定向开发检查完成，四份独立空白库模拟均留档，但最新场景发现实际数学错误及模型复核误判，教学内容质量和完整学习链仍未通过。结构、安全、版本、用户确认与既有学习成果保留门禁没有降低，历史失败不改写为通过。

### 2026-10-06 严重缺陷规则修改与四份独立模拟

本节保留ADR 0021阶段的历史运行。其后发现的上游知识纠错已由上一节ADR 0022承接，以下“下一项”不覆盖最新执行状态，历史失败仍按当时结果保留。

- 复核契约：新报告必须为 `reviewPolicyVersion=1`；阻断限于核心知识错误、关键必学内容缺失、必要基础缺失、严重范围偏离及伪造来源，且原文和目标必须对应实际候选。无报告或无效报告不能默认通过，历史报告保留原结论。模型意见及证据字段有效不等于推理正确。
- 规划修订：未确认整体草稿可补充、拆分或合并内容问题，记录原问题到新问题的映射、理由和前后内容；课程总目标身份与原意、原必需维度和确认任务范围保持。阶段局部修复由系统保留课程登记表及其他阶段，越界意见保留。新增严重意见仍需依据同一任务，不能靠不断增加选学内容追求零建议。
- 教学与失败保留：框架检查稳定定义、案例和安排，正文检查当前段落；报告结构错误只修复报告，不消耗材料修复。最多两次材料修复，无进展提前停止，保留最后有效候选、失败原因及全部调用关系。公开正文的复核摘要不暴露服务端参考答案或原文证据。
- 分段契约：合法内容问题的补充关联与必需维度覆盖分开校验；当前段输入只包含当前可填写步骤，其他段仅提供目标摘要。步骤不符提供实际/允许的稳定标识和位置；未知、重复、遗漏、重排、超出本段的维度与步骤继续拒绝，不截掉错误内容后冒充通过。
- 开发检查：6个定向文件、66个用例通过，覆盖重大问题证据、普通建议、报告失败与材料修复分离、修订映射保真、无进展停止、日志失败保留及引用/步骤诊断。TypeScript、Lint（0错误/警告）、编码检查和生产构建通过。未重跑全量回归、packaged Electron或真实新手试教；本轮没有schema、迁移、seed或依赖变更，未改写真实 `web/prisma/dev.db`。

| 独立场景 | 已取得的运行证据 | 当次停止原因 |
| --- | --- | --- |
| [第一轮](web/test-results/calculus-critical-review-2026-10-06T15-58-30-766Z/REPORT.md) | 骨架9阶段、35内容问题，10条建议；阶段14个独立概念、3条建议，均无规划修复，已确认。15检查点、15次实际调用。 | 旧教学复核的9/10条意见超过隐式8条上限，消耗两次材料修复后仍把7条意见全部视为阻断；包括集合差误读和提前索要正文细节。随后统一教学严重缺陷政策。 |
| [第二轮](web/test-results/calculus-critical-review-final-2026-10-06T16-23-47-226Z/REPORT.md) | 新规划、框架、遇见问题和直接跳到整合段；答疑、草稿恢复、提示/解答曝光、帮助记录和跳过。报告缺字段时只重试报告。26检查点、21次实际调用。 | 形成概念段初稿有真实维度越界；修订后合法content-1关联relations被旧“必需维度交集”过滤误判未知。随后分离引用身份与覆盖要求。 |
| [第三轮](web/test-results/calculus-review-verified-2026-10-06T16-44-03-453Z/REPORT.md) | 规划、框架、遇见问题、整合段、答疑/曝光/返回位置/恢复。26检查点、20次实际调用。 | 当前concept只安排两步，AI三次返回相同七步，夹带use/discriminate/integrate。原文10,065字符、5,788输出tokens、finish_reason=stop，不是截断；随后限定当前可填写步骤并提供精确诊断。 |
| [第四轮](web/test-results/calculus-review-scope-2026-10-06T17-05-01-780Z/REPORT.md) | 新骨架9阶段、9总目标、23内容问题，8条建议；首阶段4条建议，确认后12概念。框架与首段运行状态ready，初稿及一次修订均只返回当前两步；最终刷新无新AI且材料不变。17检查点、14次实际调用。 | 独立逻辑核对发现框架实际算错，模型降为建议后又据此否定正确答案；替换题目后错误框架仍在。系统ready/passed不构成内容质量通过，本轮停止后续学习与沉淀。 |

四份场景均由真实Chromium页面、正式API、SQLite与真实 `deepseek / deepseek-v4-flash` 执行，从版本化空白seed经既有生命周期初始化，不复制前轮课程、草稿或记录。所有真实提示、Provider返回、原文、候选、校验和操作检查点已分开导出；实际调用数量不包含用户确认审计。四轮均停在各自失败边界，后续修复不能追认历史运行成功。

**最新实际内容缺陷：** 框架 `discriminate-explain` 声称 `f(x)=1/(x-2)` 与 `g(x)=(x-2)/(x-2)^2` 定义域不同、不是同一个函数。二者自然实数定义域都是 `{x ∈ R | x ≠ 2}`，且每个允许输入的取值相同，实际为同一个函数。框架复核已指出反例不成立却将其降为普通建议；正文初稿正确给出同一函数的结论，下一次复核把错误框架当成既定要求而判正确答案为核心错误。材料修复替换该题，最终复核通过，但框架未变。此外，最终复核仍带着已被修订稿纠正的值域答案意见。证据字段与引用校验没有能力证明这些数学判断正确；同模型内部一致性不能代替知识事实核对。

最新最终状态：`mapRevision=2`，1领域、9阶段、12概念、1框架、1段正文、0交互、0知识点。14次Provider调用均返回结构有效内容，另3条确认审计，不能记作14次知识正确；外键违例0、页面脚本异常0、控制台错误0，6条导航/预取取消另记。已停止后续生成、作答与沉淀；本轮其余四段及个人确认未到达，前轮局部交互成功也不能替代本轮完整链。浏览器、服务和连接已关闭，临时AI设置删除，隔离库留存，证据已知凭据命中0，真实用户库前后指纹一致。

最新入口：[完整报告](web/test-results/calculus-review-scope-2026-10-06T17-05-01-780Z/REPORT.md)、[可展开每一步与原文](web/test-results/calculus-review-scope-2026-10-06T17-05-01-780Z/TRACE.html)、[数学缺陷及错误复核证据](web/test-results/calculus-review-scope-2026-10-06T17-05-01-780Z/content-quality-review.json)、[修复前后因果对照](web/test-results/calculus-review-scope-2026-10-06T17-05-01-780Z/causal-evidence.json)、[开发检查](web/test-results/calculus-review-scope-2026-10-06T17-05-01-780Z/verification-checks.json)、[最终状态](web/test-results/calculus-review-scope-2026-10-06T17-05-01-780Z/outcome.json)、[清理与数据隔离](web/test-results/calculus-review-scope-2026-10-06T17-05-01-780Z/cleanup-evidence.json)。上述证据被版本控制忽略；下一项核心工作是框架知识事实的独立核对及上游错误纠正，然后再验证完整五段与个人确认沉淀，不新增UI或高阶能力。

2026-10-06（新版内容覆盖独立空白库实测）：按用户要求重新从版本化空白 seed 开始，用真实浏览器、正式 API、SQLite 和真实 AI 模拟考研数学一的一元微积分入门流程。新版骨架初稿通过结构门，原父子目标标签冲突本轮未出现；内容修复因改写登记表而阻断，完整学习链仍未通过。目标/当前差异：已取得入门、确认任务、课程研究、骨架初稿及失败回查证据；正式地图、概念展开、九维教学与个人沉淀均未到达，不能将内容覆盖开发检查升级为真实教学质量通过。

### 2026-10-06 新版内容覆盖的独立微积分用户模拟

- 空白起点：运行 `calculus-content-coverage-2026-10-06T13-07-05-616Z`，新 Domain `cmuwp1q91000193mldvxl6t2t`。临时 userData 经现有生命周期从版本化空白 seed 初始化，Domain、Unit、LearningNode、KnowledgePoint、教学会话/段落/交互和 AI 日志全部为 0；没有复制历史任务书、领域或草稿。当前生产构建之后没有更新的运行时源文件，使用 Chromium、正式领域 API 与真实 `deepseek / deepseek-v4-flash`，未重跑 packaged Electron。
- 实际操作：只输入“考研数学微积分” → AI 导引 → 刷新恢复建议 → 用户明确采纳与编辑高中基础、数学一一元范围、每天45分钟、思考自由跳过与自我确认 → 确认任务书及刷新 → 新课程研究与来源/内容复核 → 刷新 → 新版骨架 → 内容修复失败 → 刷新恢复 → 应用内回看首次失败和日志刷新。保留15个检查点，包含中间状态和错误回查，不代表15个业务阶段通过；每步保存表单、页面文字/截图、接口请求/返回及数据库状态，全部实际提示、Provider返回、原文、解析候选、校验与尝试关系另行独立导出。
- 真实调用：共8次实际 Provider 调用，6次结构通过、2次失败，没有用户确认审计混入数量。导引1次、课程研究1次、课程内容复核2次、骨架初稿1次、骨架复核1次、内容修复1次及其结构重试1次。课程方向返回 `source="ai"` 和质量门通过，仍为draft，未随地图确认。初稿为 `planningVersion=3 / contentCoverageVersion=1`，1个总目标、22个内容问题、8个 Stage，结构检查通过；模型语义复核报告10个阻断意见和5个提醒，不将这些意见直接当作可靠学科结论。
- 首个硬阻断：`POST map/ai-draft` 返回400 / “骨架修复必须保留课程目标及内容问题登记表。”两次失败均为 `changed_content_registry`，路径 `draft.learningGoals`。逐项比较发现唯一登记表差异为 `learningGoals[0].contentQuestions[4].contentRequirements`（content-5）：原4条要求保留，再增加“标注洛必达法则的完整条件、示范与失效情形见 content-14，此处只作方法选择比较”。这来自复核针对 content-5/content-14 分工的建议，但修复协议要求登记表不变，因而无法同时满足。课程目标、内容问题身份和其余登记内容没有丢失；两次完整JSON分别51,845/27,340字符、输出14,958/11,639 tokens，finish_reason均为stop，没有输出截断证据。
- 进一步业务观察：部分原子性意见将同一概念的定义、意义、使用和条件当作必须拆分的教学动作，与九维协同存在不一致风险；多个独立概念过度合并的意见可能合理，需要分别核对。修复原文还出现46处局部问题文本细化，但继续引用同一登记问题；服务端从登记表恢复文本及要求，因此这些局部改写不会成为独立约定。该点是失败候选与代码的风险对照，不能声称修复已合并或已通过。应区分登记表修订、模块/阶段安排修复和独立概念展开，并避免给同一调用同时传入修改登记表与禁止修改登记表的要求。
- 来源与恢复观察：任务确认后页面同时显示“已确认”和页尾“尚未确认”，刷新恢复一致，服务端确认事实正确；失败刷新恢复任务和课程、没有新增 AI，但主页面不恢复最近错误，应用日志仍可读取失败详情。MIT摘要只能支持总体范围，OpenStax只抓到启用JavaScript提示；最新数学一大纲和具体定义/条件/题型未核验。课程方向明确标注来源缺口，未要求诊断证据或阶段成果评分；这不等于内容准确性验收。
- 最终状态及清理：`mapRevision=0`，没有有效Map Draft或正式Unit/节点/知识点/教学记录，任务书已确认、课程方向为draft；外键违例0、页面JavaScript异常0。预期API400控制台错误与导航/预取取消单独留档。浏览器、服务和数据库连接关闭，临时AI设置副本删除，隔离库与证据保留；真实 `web/prisma/dev.db` 前后指纹一致，证据未检出已知运行时凭据。检查驱动的过早快照、未采纳建议的错误预期及报告生成变量错误单独记为工具过程，不算产品故障。本轮没有产品代码、schema或迁移变更，未重跑全量回归，也未绕过复核确认后续流程。

本轮入口：[可展开逐步记录](web/test-results/calculus-content-coverage-2026-10-06T13-07-05-616Z/TRACE.html)、[文字报告](web/test-results/calculus-content-coverage-2026-10-06T13-07-05-616Z/REPORT.md)、[初始骨架阅读版](web/test-results/calculus-content-coverage-2026-10-06T13-07-05-616Z/initial-skeleton-read.md)、[精确登记表差异](web/test-results/calculus-content-coverage-2026-10-06T13-07-05-616Z/registry-comparisons.json)、[失败分析](web/test-results/calculus-content-coverage-2026-10-06T13-07-05-616Z/failure-analysis.json)、[空白起点](web/test-results/calculus-content-coverage-2026-10-06T13-07-05-616Z/baseline.json)、[全部AI记录](web/test-results/calculus-content-coverage-2026-10-06T13-07-05-616Z/generation-records.json)、[最终结果](web/test-results/calculus-content-coverage-2026-10-06T13-07-05-616Z/outcome.json)、[清理证据](web/test-results/calculus-content-coverage-2026-10-06T13-07-05-616Z/cleanup-evidence.json)。证据被版本控制忽略；以下开发检查与历史运行仍保留各自当时的范围，不替代本轮失败结论。

2026-10-06（内容覆盖调整开发完成）：已落实 [ADR 0020](docs/adr/0020-traceable-course-content-coverage.md)。课程总目标 → 具体内容问题 → 模块安排 → 单概念及九维正文步骤可追溯，阶段和模块的目标集合由系统汇总；个人自我解释由用户保存、修订和确认，不再调用 AI 复核。目标/当前差异：核心代码、持久化衔接及操作入口已接通，定向检查通过；本轮未重新运行真实 Provider 的独立微积分用户模拟、完整教学流程或新手试教，不能把历史失败记录改写为真实运行成功，也不宣称教学质量或全量回归通过。

### 2026-10-06 内容覆盖与个人自我解释调整

- 规划契约：保留 `planningVersion=3`，新增 `contentCoverageVersion=1`。课程目标登记具体内容问题、材料说明要求和有效九维标识；模块只引用稳定内容问题 key，系统恢复问题文本并汇总父级目标。仍拒绝未知引用、重复标识、缺少要求和未安排问题；没有通过删除目标或放宽正式地图确认消除旧矛盾。
- 修复与留档：初始骨架缺陷能定位到单个阶段时，AI 只返回该 Stage；服务端保留总目标、登记表和其余阶段，合并后执行整图校验。全局或跨阶段缺陷仍采用有界整体修复。展开阶段的局部修复保留登记表；整图和骨架内容修复不能改写登记表。原文、解析局部候选及校验后的完整骨架分别留档，失败记录不被覆盖。
- 材料追溯：内容要求进入概念框架和正文生成/内容复核；正文将相关内容问题与维度绑定到具体步骤。领域地图区分已安排、已生成材料和待补充，可打开框架、材料版本及步骤位置；多个承接概念分别核对，显式复用只计算一次。未展开安排、旧框架、来源已改变和被更新失败版本替代的旧正文不计作完整材料。这里记录材料可用性，不是理解程度或权威正确性证明。
- 自我解释：节点页移除 AI 检查入口，原 `check-answer` API 校验领域归属后返回 410，不再发起 AI 请求；服务函数也停止评价。用户自己的草稿和明确确认沉淀保留，首次状态仍为 `seen`。教学步骤的主动提问、可选思考反馈、自由跳过和继续仍可使用。
- 定向检查：5 个文件、43 个用例通过，覆盖登记表与派生关系、未知引用和材料缺口、JSON 往返、逐概念材料位置、过期/失败材料排除、概念复用、局部修复保真及原文/合并结果分开留档、自我解释入口停止调用 AI。TypeScript、Lint、编码检查及生产构建通过。没有新增 schema 或迁移，没有重建/清空 seed 或学习库，未使用或修改真实 `web/prisma/dev.db`。
- 验证范围：未重跑全量单元回归、浏览器/Electron 用户模拟或真实 AI；此前旧契约/fixture 的全量失败仍待独立处理。本轮定向通过不等于新版微积分课程已走通，下一次真实模拟须从独立空白库开始并继续保留每步输入、返回、校验与失败证据。

2026-10-05（全新空白库业务流审视）：按用户要求另开独立场景，从版本化空白 seed 和只有“考研数学微积分”的输入开始，没有复制旧领域、任务书、课程方向、骨架或学习记录。导引、任务确认和新课程研究已取得真实页面/API/SQLite证据；完整骨架仍在父子目标关联处阻断，未创建正式地图。目标/当前差异：本轮完成整个业务链的代码审视与新场景实测留档，后半程只作代码审视；Stage展开、九维教学、反馈和个人沉淀仍未到达，不能记为完整流程或教学质量通过。

### 2026-10-05 独立微积分流程测试与业务审视

- 独立起点：运行 `calculus-fresh-flow-2026-10-06T03-21-20-682Z`（目录按UTC命名，运行时本地为2026-10-05）；新 Domain `cmuw44xow00015q02r2alc4ca`。临时 userData 通过现有生命周期从版本化空白 seed 初始化，Domain、Unit、LearningNode、KnowledgePoint、教学会话/段落及AI日志初始均为0。没有以历史测试库或真实 `dev.db` 作输入；构建后无更新的运行时源文件，使用当前生产 Next bundle 与 Chromium、真实 `deepseek / deepseek-v4-flash`。
- 实际操作：只填写领域名称 → AI导引 → 刷新恢复 → 采纳后独立填写高中基础、数学一的一元范围、每天45分钟与可跳过思考 → 明确确认任务书 → 刷新核对事实 → 新课程研究 → 新骨架 → 失败后刷新 → 应用日志查看两次失败。保存12个检查点，不代表12个业务阶段通过；全部保留表单输入、页面文本/截图、接口请求/返回、AI调用与数据库状态。未修改产品代码、数据模型或门禁，未重跑全量单元回归。
- 真实调用与恢复：共7次实际Provider调用，4次结构通过、3次失败，没有用户确认审计混入调用计数。导引1次成功；研究1次成功；课程复核首次只返回报告本体、缺少report/draft包装，结构失败后第二次恢复，随后还有一轮课程内容修订；骨架初稿和结构修复各失败一次。所有实际提示、Provider返回、原文、候选和校验均保存为独立文件，失败不被覆盖。
- 首个硬阻断：`POST map/ai-draft` 返回400 / `invalid_module_goals`，位置 `stages[1].moduleBlueprints[1].goalKeys`。Stage `stage-01-limit` 只承担 `goal-1/2/4`，模块 `mod-01-limit-calc` 却引用 `goal-1/3`。总目标清单内有goal-3，问题是父子承接未对齐；修复实际提示包含具体模块、精确问题和allowedGoalKeys，返回仍保持同一错误。两次完整JSON包含4个总目标和8个Stage，原文17,352/11,219字符，finish_reason均为stop、输出6,194/4,960 tokens；没有输出截断证据，不能把本次错误解释为窗口截断。
- 业务内容观察：课程质量门通过，却在risksAndValidation中要求“每个思考点被跳过时，必须留下对应的一条短诊断证据”，与本轮确认任务及自由跳过规则冲突。这是生成内容偏差，不是本次已观察到程序锁定跳过按钮。MIT两个英文课程页可达但字面relevance均为0；OpenStax只提取到启用JavaScript提示，模型已降级其依据地位。相关度是建议性字段，不因0分通过而认定门禁失效；需改进跨语言匹配和课程依据/具体知识支持的区分。
- 流程状态观察：任务书PATCH 200、confirmedAt已保存，但页面同时显示“已确认”与“尚未确认”，刷新后恢复。课程方向结构通过时，骨架按钮已可用，页尾仍称方向未通过。骨架失败刷新后确认任务和课程方向保留，AI日志数7→7；主页面没有恢复上一条失败原因，但原有AI日志页能够读取全部7条及修复前后详情，不触发AI。
- 后半程审视：代码确认阶段局部修复与整图语义确认存在责任范围不对称；九维frameworkShape示例只有一维一段，且关联不一致，而校验要求完整九维/五段。教学的材料版本、隐藏解答曝光、输入先保存、摘要、前置已确认理解及首次seen沉淀边界仍存在。这些是代码观察与风险，不记作本轮真实教学成功或失败；具体判断与改进顺序见[完整业务流审视](docs/research/2026-10-05-fresh-calculus-business-flow-review.md)。
- 最终事实与清理：`mapRevision=0`、有效Map Draft未保存、课程方向为draft、任务书已确认；正式Unit、节点、知识点、教学会话和段落均为0，外键违例0，页面JavaScript异常0。仅有预期API400对应的控制台错误及导航/预取取消记录，未据此认定其他入口故障。自动化曾出现表单定位及监听方法错误，单独留档、不计作产品错误；恢复的是本次新库。浏览器、服务和数据库连接关闭，临时AI设置删除，隔离库保留；真实dev.db前后指纹一致，证据文本未检出已知凭据。无新增迁移，未重跑packaged Electron。

本轮入口：[可展开逐步记录](web/test-results/calculus-fresh-flow-2026-10-06T03-21-20-682Z/TRACE.html)、[文字报告](web/test-results/calculus-fresh-flow-2026-10-06T03-21-20-682Z/REPORT.md)、[空白起点](web/test-results/calculus-fresh-flow-2026-10-06T03-21-20-682Z/baseline.json)、[最终结果](web/test-results/calculus-fresh-flow-2026-10-06T03-21-20-682Z/outcome.json)、[失败对照](web/test-results/calculus-fresh-flow-2026-10-06T03-21-20-682Z/failure-analysis.json)、[实际AI完整记录](web/test-results/calculus-fresh-flow-2026-10-06T03-21-20-682Z/generation-records.json)、[清理记录](web/test-results/calculus-fresh-flow-2026-10-06T03-21-20-682Z/cleanup-evidence.json)。证据目录不提交版本控制，后续各轮记录仍保留各自当时的事实。

2026-10-05（阶段修复范围调整完成）：已落实 [ADR 0019](docs/adr/0019-stage-scoped-repair-preserves-course-goals.md)。阶段 AI 修复只返回 `{ report, stage }`，课程总目标、地图元数据和其他阶段由服务端保留；局部合并仍执行整图校验，领域结构异常进入有界修复并逐次留档。真实微积分复跑已消除原 `learningGoals` 遗漏阻断，展开草稿可保存及刷新恢复。目标/当前差异：本轮修复范围及目标保真已取得真实 AI 证据，仍有其他阶段的模型内容意见，复审返回 422 并保留阻断；未确认 Stage，九维教学、答疑和个人沉淀尚未到达，不能记为完整教学流程或知识质量通过。

### 2026-10-05 阶段局部修复与课程目标保真验证

- 返回契约：骨架与整图修复示例补齐 `learningGoals`。持久化整图修复必须完整保持既有目标的 key、描述和顺序；阶段修复只允许约定的 Stage 字段，绑定已展开的目标 key 和状态，不能返回整图或课程级字段。相关目标覆盖、概念引用、显式前置 DAG 与版本门不放宽。
- 执行与恢复：Stage 展开后的整图审查继续携带目标 `stageKey`；复核接口读取阶段范围，空请求仅从仍匹配草稿摘要、地图版本及课程依据的回执恢复范围，显式整图请求不恢复局部范围。保存仍校验请求开始时的草稿，正式地图继续需要用户确认。结构失败保留准确字段问题、候选原文和全部尝试记录，并接入统一执行器的有界结构修复。
- 范围外意见：局部修复保留明确指向其他阶段的原始意见，同 code/targetKey 的模型转述不重复累加。只剩其他阶段意见时停止本阶段修复，保留 blocked 状态及既有处理入口；未知或全局目标仍可进入有界修复。页面状态说明不再固定声称已完成两次修复。
- 定向检查：5 个文件、38 个用例通过，另选定 Stage 展开 API 的范围传递用例 1 个通过、同文件其余 12 个按选择跳过。覆盖单阶段合并、课程目标与其他阶段保真、越界返回和改目标拒绝、跨阶段引用/DAG、精确问题与原文留档、结构重试耗尽、复核范围恢复及过期范围拒绝、范围外意见保留/去重和停止冗余修复。最终 TypeScript、Lint、编码检查及生产构建通过；无 schema 或迁移变更。
- 扩大检查的限制：一次使用项目 test 脚本传入文件名时，其内置 `vitest run src` 实际匹配了整个 src；该次观察为 78 个文件中 67 通过、11 失败，521 个用例中 473 通过、48 失败。这是新增后续用例之前的运行快照，不是当前用例总数。失败涉及旧规划协议/fixture、原 Domain DTO 等与当前契约的差异，未逐项完成历史基线对照或修复；不得将本轮定向通过描述为全量回归通过，也未降低门禁使旧用例通过。
- 第一次真实复跑：从上一轮首个 Stage 失败后的隔离库复制新副本，沿既有数据库生命周期启动生产 Next bundle，实际 Chromium 点击“展开这个 Stage”，使用真实 `deepseek / deepseek-v4-flash`。生成、整图复核和两次局部修复共 4 次实际调用，均保留完整输入、原文、Provider 响应及校验后结果。两个修复原文均只有 report/stage，服务端合并后完整保留 6 个目标和其他 7 个阶段，展开草稿成功保存；响应为 422，剩余意见指向其他阶段。本次观察到范围外意见重复转述及第二次无关修复，随后补上去重与停止规则。
- 最终真实复审：再复制已保存草稿，通过实际页面点击“保存并复审路线质量”，请求明确为 `{ scope: "stage", stageKey: "stage-real-functions-prep" }`。整图复核发现当前邻域节点与定义域节点的检查动作重叠；一次局部修复后该意见消失，剩余 3 条意见均指向极限或积分应用阶段，因而没有发起第二次修复。实际修复原文 11,344 字符，只含 report/stage；完整保留 6 个总目标、修复开始时其他 7 个草稿阶段及 8 个正式 Unit。用户保存草稿时剥离了 DTO 的 id/roadmapId/orderIndex/assessmentRecords 展示字段，未改变其他阶段教学内容或正式记录；保真比较以保存后的实际修复输入为准。
- 最终复核与持久化：返回 422 / `reviewState="blocked"`，局部结构成功不等于整图语义通过。范围外的 3 条原始意见各保留一次：积分应用的考查口径来源缺口、洛必达条件反例的检查标准、微元法误用的检查标准。这些是模型报告的待核对意见，不能直接作为权威数学结论。回执保存 `scope="map"` 及目标 stageKey；`mapRevision=1`、正式概念/知识点/教学会话/段落均为 0，外键违例为 0。刷新恢复草稿与复核阻断，日志数保持 20 不变，页面未捕获 JavaScript 异常。
- 边界与清理：两次真实复跑均停在内容复核阻断处，未代替用户裁决、确认 Stage 或进入后续教学；未重跑 packaged Electron。真实 `web/prisma/dev.db` 未使用或修改，未新增迁移。浏览器、服务与数据库连接均已关闭，临时 AI 设置副本已删除；保留隔离库和脱敏证据，证据文本未检出已知运行时凭据。

本轮证据：[第一次展开结果](web/test-results/calculus-stage-scoped-repair-2026-10-05/scenario.json)、[最终复审结果](web/test-results/calculus-stage-scoped-repair-2026-10-05/final-retry/scenario.json)、[最终实际 AI 完整记录](web/test-results/calculus-stage-scoped-repair-2026-10-05/final-retry/generation-records.json)、[最终复核报告与响应](web/test-results/calculus-stage-scoped-repair-2026-10-05/final-retry/stage-review-response.json)、[保存的完整地图草稿](web/test-results/calculus-stage-scoped-repair-2026-10-05/final-retry/saved-map-draft.json)、[范围保真与刷新比较](web/test-results/calculus-stage-scoped-repair-2026-10-05/final-retry/draft-comparison.json)、[清理记录](web/test-results/calculus-stage-scoped-repair-2026-10-05/final-retry/cleanup-evidence.json)。证据目录被版本控制忽略；以下记录保留各轮当时的失败与验证，不代表最新运行结果。

2026-10-05（前一轮用户模拟：确认地图后展开首个 Stage）：承接上一轮已保存的考研微积分骨架，在新的隔离数据库副本中按实际页面继续操作。地图确认通过，首个 Stage 的生成与内容复核均取得返回，但 AI 修复稿遗漏整个 Domain `learningGoals` 清单，整图结构校验返回 400，未保存展开草稿。该轮完整学习闭环不通过。目标/当前差异：当时取得正式骨架确认、失败后的恢复及原文回查证据；Stage 修复契约及异常衔接的缺口已由以上本轮修复承接，九维教学、答疑和沉淀仍未到达，教学质量未验收。

### 2026-10-05 确认地图后的微积分用户模拟

- 场景与环境：沿用已确认的“考研数学一的一元微积分入门”任务书和上一轮真实 AI 骨架，具备高中基础、每天 45 分钟、排除多元/级数/常微分方程等。复制上一轮隔离库到新的临时 userData，沿现有数据库生命周期启动生产 Next bundle；使用实际 Chromium 页面、正式 Domain API、SQLite 和真实 `deepseek / deepseek-v4-flash`。这次是继续已保存课程的模拟，不是重新从领域名称开始，也未重跑 packaged Electron。
- 已走通：创建页恢复完整骨架；实际点击“确认地图并进入学习”，课程方向与骨架完成确认；进入 Domain 地图并看到 Stage 目录与诊断/知识图谱入口。`mapRevision` 从 0 变为 1，保留 6 个领域目标、8 个 planned Stage，尚无正式概念节点。首次 Stage 展开由用户点击“展开这个 Stage”触发，没有直接写库或人工绕过规划。
- 主要阻断：展开 `stage-real-functions-prep`（实数、不等式与函数预备）时，初稿生成成功，语义复核返回待修正问题，随后一次修复的输出未通过结构门。`POST /api/domains/:id/map/ai-draft` 返回 400 / `课程需要唯一且非空的学习目标。（位置：learningGoals；共 9 处问题）`。这 9 处由一个缺失的总目标清单及 8 个 Stage 随之失效的目标引用组成，不是 9 个独立的概念内容错误。
- 原始证据：本轮新增 3 次实际 AI 调用，分别为 Stage 生成、内容复核和修复；另外有 2 条 `provider="user"` 的用户确认审计记录，不能计作 Provider 调用。修复失败记录为 `cmuvi4bew000pcjycofotajmn`，完整原文 17,022 字符、实际提示、Provider 响应、解析候选和 9 条定位问题均已落库并导出；失败阶段为 `validation`。日志总数从 9 增为 14，用户日志入口可读取本轮全部记录及失败详情。用户确认审计复用了 AI 任务类型，页面应进一步区分确认事件与实际生成，避免用审计成功表示 AI 内容通过。
- 原因定位：正式 Domain 与实际修复输入均含完整的 `goal-1` 至 `goal-6` 及描述；AI 返回的 `draft` 只有 `planningVersion/title/status/baseRevision/stages`，缺少 `learningGoals`，各 Stage 的 `goalKeys` 则仍在。不是数据库丢失目标，也不是后端漏传目标。`buildMapDraftQualityRepairPrompt` 的返回示例同样遗漏该字段，且未明确保持目标身份及含义，是已确认的提示契约缺口；它是否单独导致模型遗漏不能仅凭一次运行确定。
- 自动恢复缺口：`validatePersistedMapDraftReview` 直接调用整图校验，抛出的 `ConceptPlanningValidationError` 未转成统一执行器识别的 `AiTaskValidationError`。因此保存失败候选和问题后即退出，没有进入携带失败原文的结构修复，也未执行下一轮语义修复。对应代码为 `web/src/lib/ai/tasks.ts:1379`、`web/src/lib/ai/tutorService.ts:1540` 及 `:348`。修复应补齐契约与异常衔接，保持有界尝试、完整留档和现有目标覆盖门，不能删除目标或放宽校验。
- 内容质量观察：生成稿包含 4 个单概念候选，模型复核报告 4 个阻断意见。复合结构分解引用定义域不等式作为前置、以及要求在预备阶段说明后续求导/换元操作，值得进一步校准。但复核又把独立概念间没有前置关系解释成“链断裂”，与项目允许多个起点和并行分支的规则冲突；它还把预告后续使用位置与要求掌握后续计算混同。复核意见不能直接作为权威学科结论或强制补依赖的理由，应区分九维中的整体位置/关联介绍与尚未教授操作的检查要求。
- 失败与恢复结果：`mapRevision=1`、课程方向保持 confirmed、`roadmapDraftJson=null`，全部正式 Stage 仍为 planned；正式 LearningNode、KnowledgePoint、NodeTeachingSession 和 TeachingSegment 均为 0，外键违例为 0。刷新恢复既有地图与继续展开入口，AI 日志数量不变；失败候选仅保留在日志，未保存为可审查 Map Draft。页面未捕获 JavaScript 异常为 0；另记录的 4 条 `ERR_ABORTED` 为导航/框架预取取消，不能据此判断诊断或图谱流程失败。
- 未到达与清理：停止在首个失败边界，未重试或跳过该 Stage 进入后续教学，未验证概念地图确认、九维框架、分段正文、答疑或个人沉淀。本轮未修改功能代码、未新增测试代码、未重跑全量回归。真实 `web/prisma/dev.db` 未使用或修改；测试浏览器、服务和数据库连接已关闭，临时 AI 设置副本已删除，隔离库保留供复现。证据文本中未发现运行时密钥或本地令牌。

本轮证据：[场景与结果](web/test-results/calculus-follow-through-2026-10-05/scenario.json)、[页面与 API 响应](web/test-results/calculus-follow-through-2026-10-05/api-evidence.json)、[实际 AI 完整记录](web/test-results/calculus-follow-through-2026-10-05/stage-generation-records.json)、[失败原文](web/test-results/calculus-follow-through-2026-10-05/failed-repair-raw.txt)、[失败候选](web/test-results/calculus-follow-through-2026-10-05/failed-repair-candidate.json)、[原因对照](web/test-results/calculus-follow-through-2026-10-05/causal-evidence.json)、[正式地图最终状态](web/test-results/calculus-follow-through-2026-10-05/final-map-state.json)、[清理记录](web/test-results/calculus-follow-through-2026-10-05/cleanup-evidence.json)。证据目录被版本控制忽略；以下同日记录是各自当时的验证快照，不能替代本轮失败结果。

2026-10-05（日志与失败诊断修复完成）：按用户授权落实 [ADR 0018](docs/adr/0018-retain-ai-generation-evidence.md)。统一 AI 执行器现已保留每次实际调用的完整返回、提示、解析候选、校验结果和失败诊断，自动重试/修复独立留档；课程规划页和领域地图提供只读“AI 生成记录”入口。真实微积分小范围复跑已保存通过结构门的 Stage 骨架草稿，未确认正式地图。目标/当前差异：本轮验证了可回查的生成过程和骨架生成恢复，尚未验证后续完整教学闭环或教学准确性；第一次模拟中两次失败的原始内容仍无法补回，不能用本轮成功替代原失败原因的证据。

### 2026-10-05 AI 生成记录与失败诊断验证

- 每次实际调用先落库 pending，收到 Provider 返回后先保存完整原文和响应，再解析、校验；成功和失败均保留，重试不覆盖上次记录。保存失败阻断使用本次生成结果。调用保留 runId、尝试顺序、前次记录、重试原因、提示版本、Provider 请求 ID、耗时和结束时间。读取不调用 AI、不自动重试。
- 目标覆盖规则保持不变。现在一次收集可定位的问题，记录 Stage/Module/Question 稳定 key、字段路径、实际/允许目标与遗漏项。结构修复获得失败原文、解析候选和完整诊断，继续使用有界重试；提示明确各级 goalKeys 引用同一组 Domain learningGoals，不通过删目标或给所有条目挂所有目标来通过门禁。新流程 planningVersion 要求也在可留档的校验内执行。
- `/api/domains/:id/ai-logs` 分页仅返回摘要，详情按需读取原文、实际提示、Provider 响应、解析候选、校验后结果和问题；页面呈现模型内容复核意见，区分结构通过与知识正确。记录只开放本领域的课程规划类任务，教学原文在服务端保留，未查看的参考答案不能从该入口读出。现有摘要记录显示“历史摘要记录，原始返回无法补回”。已知运行时凭据和凭据字段脱敏，返回内容作为纯文本呈现。
- 工程检查：Lint 零错误/警告、TypeScript、编码检查、Prisma schema 校验、空白 seed 构建与生产构建通过。定向验证共 6 个文件、48 个用例通过；同批 22 个既有用例按选择未执行，不代表全量回归或新版教学 E2E 通过。覆盖完整长文本、解析失败、精确诊断、修复前后留档、有界重试、Provider 错误/空正文证据、凭据脱敏、日志写入失败阻断和读取边界。
- 数据升级：新增前向迁移 `20261005090000_retain_ai_generation_evidence` 并重建版本化空白 seed，未修改历史迁移。将首次模拟的隔离库复制到新的临时 userData 后，沿现有生命周期先备份、再部署迁移、检查保真和外键；原 6 条日志全部旧字段及 Domain 数据保真，新原文字段为空，外键违例 0。未改写或迁移真实 `web/prisma/dev.db`，未重跑 packaged Electron。
- 真实复跑：使用已确认任务书和课程方向的隔离副本，通过实际页面正常点击“AI 生成完整 Stage 骨架”，真实 `deepseek / deepseek-v4-flash` 返回 `source="ai"`、HTTP 200、`reviewState="passed"`。初稿、内容复核、一次修复共 3 次实际调用，原文分别为 17,354 / 2,574 / 11,908 字符，均有完整提示、Provider 响应及请求 ID、解析候选和校验结果。生成结果保留 6 个领域目标、8 个 Stage；`roadmapDraftJson` 已保存，`mapRevision=0`、正式节点数 0、外键违例 0，未自动确认或建正式地图。
- 内容回查：初次模型复核报告 4 个待修正项：连续函数性质缺少对应问题；黎曼和问题提前混入未学过的不定积分对照；换元与分部积分模块压缩过度；预备阶段的目标映射偏窄。原文对照确认修订稿新增连续函数性质问题、调整黎曼和问题、拆分两个积分方法模块，并将预备阶段关联从 goal-1 扩为 goal-1/2/5；没有删除领域目标。最终报告仍保留 4 条提醒，涉及极限/导数密度、洛必达跨阶段重复和反常积分范围安排。这里是同模型复核及修复内容的实际证据，不是权威学科审查；原课程方向的条件逻辑问题与来源缺口未在本轮解决。
- 浏览器与安全读取：最终日志页面可见完整原文、模型报告的待修正内容、历史失败说明；页面未捕获异常为 0。刷新恢复详情，AI 日志总数保持 9 不变。未认证请求 401，跨领域详情与跨领域分页游标 404；在隔离库插入并随后删除的教学日志边界 fixture，其详情 404 且不出现在列表。该 fixture 不计作真实 AI 成功，也未用于生成地图。临时 AI 设置在测试结束后删除，测试浏览器和服务全部关闭。
- 未到达：正式地图确认、Stage 单概念展开、九维框架、分段教学、反馈和个人沉淀。下一步仍需沿这些学习动作验证；原始日志可支撑后续质量评判，但本轮不宣称完整教学质量验收通过。

本轮证据：[场景与结果](web/test-results/calculus-ai-log-fix-2026-10-05/scenario.json)、[完整调用记录](web/test-results/calculus-ai-log-fix-2026-10-05/live-ai-generation-records.json)、[修复前后对照](web/test-results/calculus-ai-log-fix-2026-10-05/content-comparison.json)、[迁移保真](web/test-results/calculus-ai-log-fix-2026-10-05/migration-evidence.json)、[读取边界](web/test-results/calculus-ai-log-fix-2026-10-05/read-boundary-evidence.json)、[最终页面读取](web/test-results/calculus-ai-log-fix-2026-10-05/ui-read-evidence.json)。证据目录被版本控制忽略，保留的隔离库仅用于复现，不是正式用户学习库。

应用户查询，已只读导出隔离库中实际保存的内容：[骨架阅读版](web/test-results/calculus-ai-log-fix-2026-10-05/skeleton-draft.md)、[保存的草稿结构](web/test-results/calculus-ai-log-fix-2026-10-05/stored-skeleton-draft.json)、[保存的内容复核记录](web/test-results/calculus-ai-log-fix-2026-10-05/stored-skeleton-quality-review.json)。这是已有结果的查看入口，未重新调用 AI、未确认地图、未迁入正式用户库，也不构成新增测试通过证据。

2026-10-05：按用户要求，以“考研数学微积分”执行真实浏览器操作与真实 DeepSeek 教学流程模拟。结果：完整学习闭环未通过，阻断于 planningVersion=3 的 Stage 骨架目标覆盖校验；正常重试仍失败。入门导引、任务书确认、课程研究和刷新恢复取得实际证据，但尚未进入单概念展开、九维备课、答疑或沉淀，不能把本轮记录写成新版完整 E2E 或教学质量验收通过。

### 2026-10-05 考研微积分用户模拟记录

- 输入路径：先只填写领域名称，由 AI 生成导引；采纳并编辑为“考研数学一的一元微积分入门”，具备高中函数、代数、三角函数基础，每天学习 45 分钟。本轮范围为极限与连续、导数与微分、中值定理及应用、不定积分、定积分及应用；明确排除多元、级数、常微分方程和其他考试科目，故不是全考纲覆盖验收。
- 环境：使用现有生产 Next bundle、项目已安装的 Chromium/Playwright 驱动、正式 `/api/domains/*` 和实际 SQLite；未使用 fixture AI，也未直接写库替代用户操作。`agent-browser` CLI 安装未能及时完成，取消后改用项目现有浏览器驱动。临时 userData 的 `englishnode-teaching-v2.db` 经现有数据库生命周期从空白 seed 初始化；初始 Domain 数为 0，结束时外键违例为 0。未使用、改写或迁移真实 `web/prisma/dev.db`，未验证 packaged Electron 或旧库备份升级。
- Provider：真实 `deepseek / deepseek-v4-flash`，任务书导引与课程研究响应均为 `source="ai"`。临时设置通过 `AI_SETTINGS_PATH` 注入，并在退出后删除；本地 API 令牌仅由驱动在内存中附加于当前测试端口的 API 请求，未放入 URL、页面状态或证据文件。测试浏览器和临时服务已关闭。
- 已走通：仅领域名称生成导引；明确选择、编辑和服务端确认任务书；课程研究和来源状态呈现；生成后刷新恢复导引；失败后刷新恢复导引、已确认任务书与课程方向。刷新未新增 AI 调用记录。页面没有 JavaScript 未捕获异常；两次地图请求的 400 产生相应网络错误记录。
- 阻断证据：第一次 `POST /api/domains/:id/map/ai-draft` 返回 400 / `规划问题需要关联模块目标。`；通过同一页面正常重试后返回 400 / `模块需要关联所属阶段的目标。`。对应 `roadmap_skeleton_generation` 任务日志分别失败，耗时 61706 ms、51866 ms。总计留存 6 条逻辑任务日志，其中 2 条失败；这是任务日志数量，不是实际 Provider 请求次数。
- 数据结果：`mapRevision=0`，`roadmapDraftJson=null`，正式 LearningNode 数为 0。目标覆盖门没有被放宽，也未人工补造正式地图。失败生成的 JSON 未被保留，错误也未指明具体 Stage/Module/Question，因此现有证据不能进一步断言模型究竟遗漏还是错引了哪个 goal key。代码落点为 `conceptPlanning.ts` 的父子目标子集检查，以及 `runJsonTask` 的通用 JSON 重试；结构错误发生在独立语义审查与可保存 Map Draft 之前。
- 未到达：Stage 单概念展开、九维框架、五段正文、自由跳转、提问/反馈、提示/解答曝光、教学摘要、个人理解草稿及确认沉淀。不得以本次模拟评定上述功能通过，也不能证明真实初学者的学习效果。

内容与连续性观察（不等同于教学质量通过）：

- 入门草稿向学习者暴露了 `currentLevel`、`description` 等内部字段名，应改成学习者能够理解的基础说明。
- 课程方向既写“中值定理条件是充分不必要”，又在检查口径中写“缺一条则结论不成立”，两者冲突。缺条件意味着不能直接用该定理保证结论，而不意味着结论必然为假。例如 `f(x)=|x|-x²` 在 `[-1,1]` 上的端点值相同，虽然 0 处不可导，仍有 `c=±1/2` 使 `f'(c)=0`。对照：[OpenStax 中值定理](https://openstax.org/books/calculus-volume-1/pages/4-4-the-mean-value-theorem)。
- 最终采用来源只有 MIT 同源通用微积分课程页面，没有已核验的当年考研数学一大纲或真题；系统明确标注此缺口，相关性也显示偏低。不能把来源可达、结构质量门通过或同模型复核，解释为考研定制内容已可靠。
- 任务书已经服务端确认、课程研究也成功后，页面底部仍显示“任务书尚未由服务端确认”，刷新后消失。`confirmTaskBrief` 和课程研究完成时没有刷新已有 workflow 快照，造成用户可执行动作与提示不一致。

运行证据：[场景与环境](web/test-results/calculus-user-simulation-2026-10-05/scenario.json)、[API 响应](web/test-results/calculus-user-simulation-2026-10-05/api-evidence.json)、[任务日志](web/test-results/calculus-user-simulation-2026-10-05/ai-call-log-evidence.json)、[失败页面文字](web/test-results/calculus-user-simulation-2026-10-05/07-skeleton-retry.txt)。证据目录已被版本控制忽略，不包含 AI 设置或令牌。测试隔离库在临时目录保留供复现，未作为正式学习库使用。

上述首次模拟提出的目标关联诊断、原文留档和有界修复已在本轮完成，证据见前节。条件逻辑复核与 workflow 更新仍待处理，再沿同一场景进入概念教学。首次模拟本身未修改功能代码、未新增测试套件，也未重跑全量回归；本轮修复的代码与定向检查单独记录。

2026-10-04：ADR 0017 的核心功能开发已完成，正式入口统一采用单概念课程与渐进备课。目标/当前差异：代码、存储契约和必要操作入口已接通；尚未通过新版专门回归、真实 Provider 教学内容审查或真实新手试教，不能作为教学质量或发布合格事实。按用户要求，本轮不新增测试代码、不开展专门回归；既有测试文件和历史验证证据没有升级为新版证据。

本轮实现：

- 领域名称即可请求并保存入门导引、代表问题、关键假设和任务书建议；刷新恢复，采纳后由用户编辑并显式确认，生成建议不直接改写已确认目标。
- planningVersion=3 骨架保存领域目标、Stage/Module/问题的覆盖和阶段代表性完整问题；Stage 由用户触发展开为单概念节点，支持多 planningQuestionKeys、稳定 key 复用及既有概念入口。每次展开经过语义复审，地图仍经版本化草稿和整图用户确认，仅保存显式前置 DAG。
- 整课先准备九维框架，再按需准备五段正文；段落含稳定步骤、讲解、示范、可跳过的思考任务、提示和参考解答。支持自由跳转、局部重备、失败重试、已准备材料复用、历史框架/材料回看及中断恢复。GET 不调用 AI。
- 公开 HTTPS HTML/PDF 资料保存可回查片段与内容版本；本地关键词选择匹配当前概念/问题/段落目标，引用绑定实际片段。区分资料支持、推导、类比和待核对解释；补充/重新提取资料后可以局部重备。结构与引用检查、独立内容复核以及最多两次修复属于产品运行时功能，模型复核不作为权威验证。
- 输入在答疑请求前落库，交互绑定框架、段落、步骤和材料版本；提示、解答曝光及同题反馈分别记录。限定教学建议可回看有效步骤或前置概念，补讲保存原返回位置。个人理解草稿可恢复，最终沉淀仍由用户自己表达并明确确认，首次状态为 seen。
- 教学摘要持久保存已查看步骤的术语/结论、用户原始问题和反馈观察，关联原材料或交互；生成使用课程摘要、框架、当前材料、前置个人理解、近期交互及未解疑问，普通进度变化不重备整课。
- `npm run dev`、`npm run start`、`dev:electron` 和 packaged Electron 接入独立 `englishnode-teaching-v2.db` 的库选择。首次启动先保留旧库一致性备份，再从版本化空白 seed 初始化；后续复用并沿用备份优先迁移、保真与外键门禁。已更新空白 seed 和新增前向迁移；本轮未启动新用户库、未运行旧库升级或改写真实 `web/prisma/dev.db`。

本轮必要开发检查：TypeScript 类型检查、Lint（零错误/警告）、Prisma schema 校验、运行入口 JavaScript 语法检查和生产构建通过。空白 seed 构建完成，构建内置外键和空白数据门禁通过。生产构建使用显式指向空白 seed 的 DATABASE_URL。新版单测/E2E、重复请求/中断/版本冲突回归、packaged 新库启动/旧库保留验证及真实 AI 教学质量验证均留待下一轮。

2026-09-23（历史 v1）：按用户授权完成迭代 A 的工程实现与隔离验证。正式节点页已接通可恢复的 AI 教学：解释、示范、引导/独立练习、逐步提示、显式查看解答、作答反馈和提问；材料绑定课程范围、节点目标、Stage 检查结果与已提取来源，输入先保存后调用 AI。目标或资料变化使旧教学失效但保留记录，失败可重试，重复请求与并发版本冲突有服务端保护。见 [ADR 0016](docs/adr/0016-resumable-node-teaching-before-knowledge-sedimentation.md) 和[规格](docs/specs/2026-09-06-node-teaching.md)。目标/当前差异：本轮证明工程流程，未验证真实 Provider 的教学内容质量或真实新手学习效果；课程范围校准与真实新手实验分别属于未完成的迭代 B/C。教学和反馈不自动沉淀知识，也不证明掌握。

EnglishNode 已经是一个可运行的开发原型，但还不是可安全发布、可靠升级或承载长期个人知识数据的桌面产品。

- 产品概念可行性：高。
- 单机原型技术可行性：高。
- 核心学习闭环完整度：中等。
- 数据可靠性：低。
- 桌面发布安全性：低。
- 当前发布就绪度：不通过。

完整证据见 [可行性与代码审查](docs/project-feasibility-review-2026-07-10.md)。

## 阶段 0 已落实项（密钥轮换仍待持钥者完成）

- Electron 每次启动为本地 API 生成随机 token，独立启动的 Next server 显式绑定 `127.0.0.1`；仅该随机端口的 renderer 请求会被注入 token，API middleware 同时校验 Host、Origin 与 token。
- AI 设置只由 `AI_SETTINGS_PATH` 指向 Electron `userData` 下的运行时文件，应用不再回退写入工作目录；Provider URL 只允许 HTTPS，或本机回环 HTTP 服务。
- Course Design 来源仅接受并渲染 HTTPS URL；Electron 阻止非应用内导航和新窗口，并只将 HTTPS 外链交给系统浏览器。
- Electron 打包会删除 `.env`、`.env.*` 和 `ai-settings.json`，打包验证器会拒绝含这些文件的资源目录。
- 依赖锁定结果已升级到 Next.js 15.5.23、Electron 41.10.4、Vitest 4.1.10、Playwright 1.61.1 和 PostCSS 8.5.26，并移除未使用的 `dagre`、`lodash`、`concurrently` 和 `wait-on` 链；同时用 npm overrides 锁定审计涉及的传递依赖。2026-08-11 的全量审计已恢复为 0 vulnerabilities。
- 2026-08-11 `npm run audit:release` 与 `npm audit --omit=dev --audit-level=high` 均通过（0 vulnerabilities）；未执行 `npm audit fix --force`。该审计结果已由生产构建、浏览器 E2E、Electron 打包、干净 seed、升级数据库和安全交互门禁共同复验。

上述改动已通过 Lint、类型检查、生产构建、打包产物验证和 packaged Electron 运行时启动验证。2026-07-14 已在实际 packaged Electron 进程中完成安全交互验证：renderer API 请求的 token 注入可用，无 token、伪造 Host 与携带有效 token 的伪造 Origin 请求分别被拒绝，`javascript:`、`data:` 与 `file:` 新窗口导航保持在应用窗口外；打包验证同时扫描禁入文件名及全部文本资源中的常见明文凭据模式。受当前工具环境的 localhost 代理影响，standalone HTTP 鉴权冒烟请求仍未获得可用网络证据，但不再作为 packaged 验证的替代条件。

## 已验证的工程基础

本轮验证与历史验证分别记录如下；有日期的旧证据不表示本轮重跑：

- `npm run lint`：零错误、零警告。
- `npm run typecheck`：通过。
- `npm run check:encoding`：通过。
- `npm run test`：2026-09-23 共 74 个测试文件、487 个测试，全部通过；包含当前工作树既有路线质量回归，以及新增节点教学的材料校验、答案隐藏、原始输入保存、重试/幂等、并发与过期响应保护、课程范围/深度变更失效、跨领域归属和数据库约束。fixture 与契约测试只证明结构和流程，不作为教学内容质量验收。
- 2026-09-23 节点教学交付验证：`lint`、`typecheck`、`check:encoding`、生产构建和 Prisma schema 校验均通过。`verify:migration-fidelity` 在合成旧库中确认已创建备份、旧字段保真且外键违例为 0；教学服务回归从版本化空白 seed 在临时 SQLite 中应用迁移。新增 `20260906090000_add_node_teaching` 未部署到真实 `web/prisma/dev.db`，本轮未改写真实用户数据。
- 2026-09-23 `npm run test:e2e:teaching`：5/5 通过。使用本地确定性 AI HTTP 服务、真实 Provider 调用适配层、Next API 和隔离 SQLite，覆盖从地图到教学再明确确认沉淀、反馈失败重试、版本冲突/目标变更、备课失败和断网后草稿恢复。包含刷新后续学、独立练习、提示/解答曝光及首次 `seen` 门禁；未调用真实模型，不能记为真实 AI 或学习效果验收。
- 2026-09-23 默认 `npm run test:e2e`：44 个通过、8 个按配置跳过（5 个教学专用 fixture 用例由上一条单独运行，3 个真实 AI/路线验收用例需显式启用）。既有地图、沉淀、诊断、图谱和异常恢复回归通过；本轮未重跑 packaged Electron 或真实 Provider 验证。
- 2026-08-05 修复 `npm run dev:electron` 的设置路径注入：开发启动器现在在启动 Next 前把 `AI_SETTINGS_PATH` 绑定到 `web/.electron-user-data/ai-settings.json`，与 `main.js` 的开发模式 Electron `userData` 保持一致。无密钥 LM Studio 占位配置已通过直连 localhost 的 PUT → 文件落盘 → GET → DELETE 冒烟，文件随后清除；独立 Web 运行时仍无工作目录回退。定向单测、Lint、类型检查、编码检查、全量 388 项单测和默认浏览器 E2E（15 通过、1 个 live-AI 按默认配置跳过）均通过。
- 2026-08-03 路线质量回归基线（A4）落地：`web/src/lib/ai/fixtures/course-quality-baseline/` 下 5 个版本化 fixture（英语语法=语言、线性代数=数学、TypeScript=编程、经典力学=理科、计算语言学=交叉），覆盖 5 类代表领域；`web/src/lib/ai/courseQualityBaseline.test.ts` 对每个 fixture 跑纯校验链（research→`validateCourseDesignDraft` 质量门→`validateCourseDesignCritique`→合并 `qualityReport`→模拟 `groundDraftSources` 接地），断言研究轮质量门结果、终态质量门结果、五维评分齐全且分数 1–5 截断、grounding 可达计数；交叉 fixture 专门录制“占位 URL 被质量门拦截（specific source url + non-placeholder source url）→ 批判轮替换为真实可达来源 → 终态通过”的回归路径。新增 `npm run verify:course-quality` 可单独运行该基线；每次改 prompt/校验器/质量门/批判形状都会在 `npm run test` 自动回归。
- 2026-08-04 Stage 骨架确定性检查（A3）落地：新增 `web/src/lib/ai/roadmapSkeletonChecks.ts`，提供 `checkStagesDeterminism` 泛型函数（骨架阶段与展开 Stage 共用）与 `checkRoadmapSkeletonDeterminism` / `checkRoadmapStageDeterminism` 两个入口；校验项含 Stage 数量上限（16）、key 唯一、标题去重、goal 与模块方向非空、展开 Stage rationale 非空、前置无悬空 key、前置 DAG 无环（DFS）。2026-08-09 的 v2 分层路线已取代当时“错误后本地回退”的新建图语义：确定性错误继续阻断，但新正式路线不再返回可确认 fallback；warning 进入独立质量审查并在 UI 展示。客户端也不再提交 Stage skeleton，Stage API 只按 `stageKey + baseRevision` 读取服务端持久化蓝图。历史确定性 fixture 继续并入 `npm run test`。

- 2026-08-09 分层路线质量门（[ADR 0013](docs/adr/0013-layered-roadmap-blueprint-and-quality-review.md)）已落地：新 `planningVersion=2` 骨架保存 Stage → Module 方向 → 稳定 key 关键问题 → 可检查结果，Stage Learning Node 必须声明 `planningQuestionKey`、非空 `objective` 并完整覆盖蓝图，不设固定问题/节点数量，且允许多个节点分解同一个规划问题。`MapDraftQualityReview` 以 SHA-256 规范化草稿摘要绑定 `mapRevision`、Stage key 和 Course Design `AiCallLog`，编辑后旧回执自动 stale；长耗时写回使用 CAS，冲突时不覆盖。2026-08-13 的 [ADR 0014](docs/adr/0014-roadmap-semantic-review-is-user-resolvable.md) 已收窄其阻断语义：确定性结构、DAG、版本与 expanded Stage 覆盖错误继续 fail closed；planned Stage 在蓝图层即视为完整；AI 复审只报告语义 findings，最多两轮修复后允许用户以绑定 review 与 draft digest 的理由解决，审查不可用也作为独立运行时状态显式确认。missing、stale、未解决 review 和确定性错误仍不能确认。
- 2026-08-09 真实 Qwen 路线验收：通过 `E2E_AI_SETTINGS_SOURCE` 将开发 AI 设置复制到 E2E 临时目录，由 runner 在结束时连同隔离数据库删除；同一考研高数任务连续两次真实调用 `/map/ai-draft`，均完成骨架生成与独立审查并返回 200，耗时分别约 230.2 秒和 208.1 秒。测试逐 Stage 断言非空 Module 蓝图、目标、稳定问题 key、问题文本和可检查结果，并验证两条 generation、两条 critique 及同一 Provider/model 的成功日志；此前的真实失败分别暴露并修复了已解决 finding 未清理、blocked 详情未返回、旧 5000-token 容量、空兼容字段误判和审查丢失 `planningVersion`。这证明当前 Provider/model 下的两次自审门禁通过，不等于用户本人已接受教学内容；7.4 分钟双轮总耗时仍是明确的体验风险。
- 2026-08-11 真实 Qwen E2E 再验证：`E2E_LIVE_AI=1` 配合临时设置副本和临时 SQLite 运行 `ai-live.spec.ts`，课程设计修复与分层高数骨架/独立复审 2/2 通过；课程修复约 18.1 秒，两次 `/map/ai-draft` 分别约 110.1 秒和 125.8 秒，总计约 4.3 分钟。测试结束后 runner 清理临时设置和数据库；这仍是 Provider/model 的流程与门禁证据，不替代用户对教学内容的人工验收。
- 2026-08-10 课程设计研究按钮反馈修复：未确认任务书时按钮旁明确显示阻断原因并保留 disabled 状态；请求发出后立即显示正在等待云端 AI 的状态，返回后显示结果已载入或本次未完成。隔离 E2E 已覆盖 disabled 提示和请求进行中的可见状态。
- 2026-08-10 DeepSeek V4 分层骨架请求修复：结构化非研究任务使用 DeepSeek 正确的 `thinking` 参数并默认关闭思考，避免 `max_tokens` 在最终 JSON 前被 `reasoning_content` 耗尽；显式 `AI_ENABLE_THINKING` 仍可打开。骨架生成/复核任务级输出上限调整为 24000；真实高数重试已越过 token 阻断。Stage 有限上限从 12 调整为 16，覆盖实际 15 Stage 输出并保留规模门禁。
- 2026-08-10 路线 Stage 复审异常修复：当时把持久化 Map Draft 复审收敛为完整 `draft.stages` 返回。2026-08-13 起按 ADR 0014 进一步拆分角色：复审只返回 findings，只有 repair 返回修订后的完整草稿；两类调用分别校验，不再让 reviewer 隐式改图。
- 2026-08-11 新用户隔离浏览器回归补齐五条路径：创建领域并发现无 AI 时的正式地图阻断、AI 设置桌面专属持久化边界、AI 不可用时诊断仍可手动作答、空领域的诊断/图谱入口与零状态、知识点沉淀后保存候选关系并在补齐解释/适用边界/误用风险后确认正式关系。过程中复现并修复 AI 设置页重复加载覆盖用户刚输入模型名的竞态；保存/重置后才重新允许服务端草稿加载。另修复领域页保存 Stage 草稿时未收窄服务端 `reviewState` 的类型问题；新增 E2E 在默认两 worker 并发下通过。
- 2026-08-11 用户流程回归继续覆盖兼容画布的节点创建/编辑、导入导出幂等、节点删除、手动关系新增/编辑/删除、虫洞创建和边编辑失败路径。真实复现了导入重复关系导致 500、多个操作失败后静默清空或关闭编辑状态，以及课程研究在草稿同步变慢时迟迟不显示请求进度；现已分别增加重复关系跳过与导入结果、失败错误反馈/状态保留，并把课程研究进度提前到前置同步之前。新增回归在隔离 SQLite 中通过。
- 2026-08-11 网络中断回归继续覆盖首页、AI 设置、正式领域地图、学习节点、诊断、正式知识图谱和兼容画布。真实复现了请求失败后页面或操作一直停在 loading/busy 状态、错误被吞掉以及图谱关系操作没有反馈；现已统一补齐失败提示、finally 复位、可重试状态和兼容画布的错误保留。新增 7 条网络异常 E2E，默认全量浏览器门禁通过。
- 2026-08-11 兼容画布交互回归又复现了首屏节点被初始 fitView 遗漏、物理布局和拖拽结束时位置提交为空的问题；现已在节点完成测量后补 fitView，布局结束提交实际节点集合，并用真实鼠标拖拽后重新读取隔离 SQLite 坐标的 E2E 固定。AI 设置模型发现的旧请求覆盖新请求问题也已由请求序号与 AbortController 隔离，并有双端点竞态回归。
- 2026-08-12 继续从零用户流程回归时复现并修复四类异步编辑风险：课程研究请求、Stage 路线复审和诊断答案保存期间锁定对应可变输入；学习节点初始详情请求返回较晚时不再覆盖用户已输入的理解。共享隔离 SQLite 的双 worker E2E 清理改为只删除当前测试登记的领域，避免并行测试互删数据；默认浏览器全量现为 42 个用例、40 个通过、2 个真实 AI 用例按默认配置跳过。
- 2026-08-12 继续回归又复现并修复四类异步编辑风险：AI 设置保存期间锁定编辑字段并失效旧的模型发现请求；学习节点 AI 检查期间锁定用户理解；诊断草稿生成期间锁定标题、题目和创建操作；知识图谱关系候选生成及关系确认期间锁定来源、问题和人工证据表单。新增延迟响应回归均通过。
- 2026-08-12 最终门禁复跑：`lint`、`typecheck`、68 个测试文件/439 个单测、编码检查、生产构建、Prisma validate/migrate status、25 项课程质量基线、AI Provider 配置验证、`audit:release`（0 vulnerabilities）、`build:app` 和 packaged Electron runtime 均通过；Electron 干净 seed 场景 backupCount=0。默认隔离浏览器 E2E 为 46 个用例、44 个通过、2 个真实 AI 用例按默认配置跳过。
- 2026-08-12 从零成功路径回归补齐：在确定性 AI 响应契约下，浏览器从空白向导完成 Task Brief、课程设计、来源相关性复核、完整 Stage 骨架、Stage 编辑后复审和正式地图确认；断言最终 `POST /map` 发生并进入对应 Domain。该测试证明 UI/API 契约和门禁，不替代真实 Provider 的教育质量验收。
- 2026-08-12 当前 Provider 的隔离 live-AI 复跑先暴露并修复了一个真实质量门误判：合法官方 `https://www.typescriptlang.org/tsconfig/` 参考页被 `specific source url` 启发式拒绝；新增 `tsconfig` 路径规则与回归后，课程设计修复和分层高数两次生成/独立复审均通过，live-AI 为 2/2。两轮分层调用约 157 秒和 153 秒，长耗时仍是体验风险；真实 AI 通过仍不等于用户对教学内容的接受。
- 2026-08-12 E2E runner 观察：一次边界用例复跑在 2/2 通过后打印 Next dev 的动态 route 静态路径生成异常，另一轮相同路径未复现；所有业务请求均返回预期状态，生产构建和 packaged runtime 也未复现。当前将其保留为开发服务器动态编译/强制退出交界处的间歇性 runner 噪声，不把它当作产品路径已证明无误。
- 2026-08-12 修复本地 Electron 开发依赖半安装状态：`electron@41.10.4` 的 npm `postinstall` 已成功重跑，恢复 `node_modules/electron/path.txt` 与 `dist/electron.exe`；`start-dev.ps1` 新增二进制完整性检查，发现仅有 JS 包但缺少运行时文件时自动执行 `npm rebuild electron`。修复后真实 `start-dev.bat` 已启动 Next 及 Electron，直连 `127.0.0.1:3000` 返回 200，强制退出后未残留 EnglishNode 进程或 3000–3010 监听。
- 2026-08-13 聚焦“内容质量 + 下一步可用”的主链修复已实现：DeepSeek 预设默认 `deepseek-v4-flash`，保留用户手动切换 V4 Pro 且不自动升级；即使模型列表只有 Pro，也只警告而不自动改写 Flash。课程研究在 DeepSeek 上改用 Responses API 的 `web_search`，记录 Provider request ID、prompt 版本和返回来源。公开 HTTPS HTML/PDF 可在服务端做有界文本提取（2 MiB、PDF 最多 8 页），抓取前及重定向后拒绝本机、私网、链路本地及 DNS 解析到非公网的目标；本地文件没有上传入口，云端路径不接收图片或本地文件。正式规划由服务端工作流统一派生可执行动作；任务书 → 课程证据 → 骨架确认 → 单 Stage 展开/确认后会直接进入该 Stage 首个 Learning Node。语义审查耗尽或不可用时可写理由解决，理由与 review/digest/scope/Stage key 绑定，编辑或作用域不匹配后失效；确定性错误不可绕过。
- 2026-08-13 本轮工程验证：`lint`、`typecheck`、`check:encoding`、生产构建、Prisma validate、71 个测试文件/459 个单测全部通过；新增迁移在隔离数据库通过迁移保真与外键检查。完整默认浏览器套件使用真实 Next/API/隔离 SQLite，46 个用例中 44 个通过、2 个 live-AI 按默认配置跳过；它证明 Stage 确认后可自动进入学习节点。旧版 `verify:ai-provider` 曾误读不属于运行时来源的 `web/data/ai-settings.json`，因而把当前 Provider 错报为 Qwen `qwen3.7-max`；验证器现已改为与 Electron 开发启动器共用 `AI_SETTINGS_PATH` / `.electron-user-data/ai-settings.json`。修复后脱敏验证确认当前运行时设置是 DeepSeek `deepseek-v4-flash`，真实基础连接约 2.2 秒通过；这仍不是三次真实考研数学内容验收，在完成内容审阅前不能声称教学质量已达标。
- 2026-08-13 DeepSeek V4 Flash 三轮路线内容验收已执行：在临时 SQLite、同一固定来源 Course Design Direction 和同一考研高数输入下，三轮分别耗时约 91.7/85.0/79.8 秒，生成 13/13/9 个 Stage；generation、critique、一次 repair 均成功，自动报告 3/3 `passed`。人工逐项审阅为 0/3 通过：第 1 轮综合阶段未汇聚级数和多元/空间积分分支且缺三重积分/斯托克斯；第 2 轮综合阶段遗漏微分方程分支，Stage 目标中的多元极限/连续、全微分和斯托克斯没有问题节点覆盖；第 3 轮整段缺失微分方程、多元、向量和曲线/曲面积分，并且综合阶段未依赖定积分应用。完整脱敏证据与结论见 `docs/acceptance/2026-08-13-deepseek-v4-flash-calculus/`。当前只能确认模型能生成结构合法草稿，不能确认教学质量达标；非研究 Chat Completions 的 Provider response id 尚未写入 `providerRequestId`。
- 2026-08-13 薄单元密度 advisory 信号决策已立项（[ADR 0015](docs/adr/0015-thin-unit-density-advisory-signals.md)）：针对云端路线图单元知识点过少的问题，单元粒度改由语义信号治理——提示词粒度指导（修订 `tasks.ts` 四处抑制性措辞）、warning 级确定性密度检测（`thinModuleBlueprint`、`thinStageExpansion`，阈值为导出常量）与 AI 复审判据（压缩含独立能力的目标记为 `scopeCoverage`/`questionAtomicity` 缺陷）；所有新检查 severity 固定 warning，永不阻断、不改变 `ok`，与 ADR 0013“不设固定最小数量门禁”保持一致。密度 warning 复用既有通道：骨架侧经 `planningWarnings` 注入复审提示词，Stage 侧经 `checkLayeredStageContentRisk` 的 `needsAiReview` 触发语义复审（≤2 次有界修复），API 响应形状不变（走既有 `qualityReport.warnings`）。目标/当前差异：以上提示词修订与密度信号均为目标状态，代码实施、回归测试与真实 AI 效果证据（含同一考研高数任务复测）待补，不能记为已完成。
- 2026-08-04 来源相关性确定性评分（A2）落地：新增 `web/src/lib/learning/sourceRelevanceService.ts`，对 A1 接地摘要（title + excerpt）与 Domain 名称/scope/goal 做确定性、零依赖的中英混合分词（英文词 token 长度≥2 去停用词与纯数字、CJK bigram）+ 加权 Dice 系数评分；域名重复 3 次（最强信号），scope×1、goal×1；`LOW_RELEVANCE_THRESHOLD = 0.15`，低于阈值标记 `lowRelevance`。该评分**仅为 advisory**：写入 `SourceGroundingInfo.relevance`（可选 `{ score, lowRelevance } | null`，`score` 截断 0–1），在 `domains/new` 审查页以琥珀色「相关性偏低（仅供参考）」徽标呈现，不进阻断质量门；不可达/无 excerpt 来源 `relevance: null`（表示无信号，非低相关）。`tutorService.groundDraftSources` 改为 `(draft, domain)`，仅对可达且产出摘要的来源算相关性，两调用点（终稿、批判轮）都传 domain。无新增网络调用、AI 调用或第三方依赖，渲染仍只白名单 HTTPS（继承 ADR 0011）。详见 [ADR 0012](docs/adr/0012-source-relevance-advisory-scoring.md)；基线为 `sourceRelevanceService.test.ts`（13 项）+ `courseQualityBaseline.test.ts` 扩展（可达来源携带相关性、不可达不携带），CONTEXT.md 新增 `Source Relevance` 术语。
- 2026-08-04 Prompt 结构化落点（A5）落地：在 `tasks.ts` 的课程研究 prompt 中，把 CONTEXT.md 已有的 `Optimization Priority`（先修正确 > 目标匹配 > 认知负担 > 权威顺序 > 兴趣个性化）从冲突裁决提升为**显式评分式要求**；`optimizationRationale` 强化为必填「顺序取舍说明」（所选顺序、相对备选为何更优、如何服务优先级），`keyTradeoffs` 要求逐条对应所服务的优先级。`Reorder Rationale` 作为该段必填子段承载，不加 schema 字段。批判 prompt 新增修订规则：检查 `keyTradeoffs` 是否逐条对应优先级、`optimizationRationale` 是否含顺序取舍说明，不满足则在 `goalMatch`/`prerequisiteCorrectness` 维度 note 中指出并修订。无脆弱关键词门、无 schema 变更。回归断言加入 `tasks.test.ts`（研究 prompt 含优先级与 tradeoff→优先级映射、批判 prompt 含 tradeoff 检查规则）。CONTEXT.md 的 `Optimization Priority` / `Reorder Rationale` 注明「已在 prompt 落地」。
- 2026-08-04 可选 AI 复核来源相关性（A2-AI-review）落地：新增 `source_relevance_check` 任务类型（`AiTaskType` 联盟与 `aiTaskRunPolicies` 各 60s/4000 tokens，瞬时不重试），复用已在 A2 确定性地板中接地的 `sources[].grounding` 摘要（`requiresWebResearch:false`，不新增网络调用），由 `runSourceRelevanceCheck(domainId)` 对每一条已接地来源返回 `{ score 0–1, lowRelevance, reason }` 并合入 `SourceGroundingInfo.aiRelevance`（独立类型 `{ score, lowRelevance, reason }`，剥离 url）。该复核是**按需、瞬态、纯 advisory**：明确不通过 `saveCourseDesignDraft` 持久化（不污染 `courseDesignAiCallLogId`/`courseDesignConfirmedAt` 这两条下游建图依赖的溯源不变量），仅把富化后的草稿返回前端展示；无草稿、无已接地内容或来源不可达时直接友好 fallback（不调用模型）。新增 `POST /api/domains/[id]/course-design/source-relevance-check` 路由（独立 `AiCallLog`，`AiConfigurationError → 503`）；`domains/new` 审查页在「参考来源」下方增加「用 AI 复核来源相关性」按钮（busy 态禁用）与每条来源的 AI 相关性徽标（sky=正常 / amber=偏低，title=reason）+ `AI 复核：{reason}` 行。新增 `buildSourceRelevanceCheckPrompt`/`validateSourceRelevanceCheck`（score 夹紧 0–1，低于 `LOW_RELEVANCE_THRESHOLD=0.15` 或显式 `lowRelevance` 均判定偏低，reason 缺省兜底），回归断言并入 `tasks.test.ts`（8 项）+ `tutorService.test.ts`（2 项）。详见 [ADR 0012](docs/adr/0012-source-relevance-advisory-scoring.md)「Implementation (2026-08-04)」节；CONTEXT.md 的 `Source Relevance` 术语已补充第二层（可选 AI 复核）与「不得经 `saveCourseDesignDraft` 持久化」规则。
- `npm run build`：生产构建通过。
- `npm run audit:release`：2026-08-11 通过，0 vulnerabilities；`npm audit --omit=dev --audit-level=high` 同样通过。
- `npm run test:e2e`：2026-08-13 在临时数据库部署全部 23 个前向迁移后，46 个 E2E 中 44 个通过、2 个 live-AI 测试按默认配置跳过；覆盖任务书、规划恢复、服务端工作流、Stage 草稿编辑/复审/确认、确认后直接进入首个学习节点、并行 DAG、诊断、知识图谱与兼容边界。兼容画布坐标回归改为高精度浮点近似比较，避免 SQLite/JSON 往返的机器精度尾差制造假失败。E2E fixture 只证明用户流程和门禁，不作为教育质量证据。
- 2026-07-19 真实 Qwen 课程研究调用通过：课程设计草稿来源为 `ai`，包含任务书快照、来源依据、来源列表和 `AiCallLog`。
- `$env:E2E_LIVE_AI='1'; npm run test:e2e -- ai-live.spec.ts`：真实 Qwen `course_design_repair` 任务 E2E 通过；测试先通过正式 API 持久化 Task Brief Confirmation，再将隔离数据库中的课程设计置为缺少来源的 `incomplete` 草稿，最近一次修复请求约 90.5 秒，补齐具体来源、通过质量门并生成独立成功 `AiCallLog`；初稿质量门失败后的自动触发由 `tutorService` 确定性测试覆盖，未生成可提交的 AI 设置副本。
- 2026-07-19 在隔离数据库完成一次完整浏览器用户流程：创建/删除领域、确认任务书与课程设计、确认完整 Stage 骨架、Stage 草稿恢复与展开、显式前置警告但不锁定、可选 AI 检查、用户确认沉淀两个 `seen` KnowledgePoint、知识图谱关系候选/幂等保存/解释/确认/强弱证据切换、诊断创建/作答/真实 AI 评价/L1 路线建议、AI 设置保存与连接测试、兼容画布加载与导出均通过。测试过程中修复了诊断入口缺失、L2/L3 改图建议提供必然失败的直接接受按钮、核心概念结果显示内部 ID，以及关系更新后详情标题退化四个用户可见问题。
- 领域创建向导现在在首次创建后把 Domain ID 写入 URL，并从正式 Domain、Course Design 与 Map API 恢复任务书确认、课程研究草稿/修复次数和完整 Stage 骨架。Task Brief Confirmation 由服务端持久化，规划输入变化会撤销确认并把已有规划标为 `needs_review`；Map Draft 绑定生成它的 `courseDesignAiCallLogId`，旧草稿恢复后只读，不能通过客户端 payload 继续确认。首次正式确认在同一事务声明 Task Brief 确认、Course Design 状态/调用 ID、Map Draft 绑定/内容和 `mapRevision`；后续 Stage 修改沿用规划门禁与 `baseRevision` 冲突保护。浏览器 E2E 已覆盖刷新与离开后重新进入、同一 Domain 不重复创建、输入变化后立即撤销确认、隔离 SQLite 中课程设计/地图草稿重建和正式地图退出创建向导。
- Task Brief Confirmation 迁移只从历史 `courseDesignConfirmedAt` 或已有 `confirmed` 正式地图回填显式证据，不把普通非空 Task Brief 当作确认；隔离迁移保真验证分别覆盖课程设计确认证据、仅正式地图确认证据和普通非空文本负对照，确保升级后既能沿用 Stage 草稿与确认门禁，也不会误造用户确认。
- 隔离工作副本以 Electron 41.10.4 / electron-builder 26.15.3 完成 `build:app`、package scan、干净 seed packaged runtime、合成旧库 packaged upgrade 和 packaged security 验证：干净场景创建数据库且不产生备份，升级场景产生 1 份迁移前备份，两者均完成启动；真实 `dev.db` 未参与。
- `npx prisma validate`：schema 有效。
- `npx prisma migrate status`：2026-08-10 已按备份优先流程将 `20260809090000_add_layered_roadmap_quality` 部署到真实开发库并保留迁移前备份。2026-08-13 新增 `20260813090000_add_map_review_resolution`；本轮只在隔离副本完成部署、迁移保真和 `PRAGMA foreign_key_check`，未修改真实 `dev.db`，因此不能再把真实开发库描述为 up to date。

这些结果只证明工程基础可运行，不证明发布安全、迁移保真、状态机正确或 AI 研究可信。

## 当前架构

Web 正式主线是：

- `Domain`：学习领域、任务书和课程设计状态。
- `Unit`：Domain Map 中 Stage 的持久化记录，状态为 `planned` 或 `expanded`。
- `LearningNode`：可学习、诊断和复盘的最小节点。
- `KnowledgePoint`：用户沉淀的知识点。
- `KnowledgeGraphNode` / `KnowledgeGraphEdge`：正式知识图谱。
- `AiCallLog`：AI 调用及关键确认事件的追踪记录。

`/canvas`、`/api/words/*`、`/api/relations/*` 和根目录旧 Prisma schema 仍作为兼容/迁移边界存在。新功能不得继续扩展这些旧边界。

- 2026-08-03 课程研究多阶段 pipeline（ADR 0011）落地：新增 `course_design_critique` 任务类型与策略（120s/20000 tokens，瞬时不重试）、`sourceGroundingService`（含注入式 fetch 的单测：非 HTTPS 拒绝、重定向跟随/拒绝、错误与超时不上抛、去重保序）、`buildCourseDesignCritiquePrompt`/`validateCourseDesignCritique`、`RouteQualityReport` 类型与解析（分数夹紧 1-5、无效报告静默丢弃不阻断）；`generateCourseDesignDraft` 编排为 研究→接地→≤2 轮批判→结构门/修复→终稿再接地；批判失败保留研究草稿并返回警告；`AiTaskType` 增加 `course_design_critique`。单元证据见上方测试计数；真实 AI 端到端证据（含批判轮 `AiCallLog`）仍待按既有 live-AI E2E 流程补齐。

## 阶段 1 已落实项（迁移保真已补齐）

- 打包产物使用 `prisma/seed.db`，不再复制 `dev.db`；seed 从受版本控制的 PRD v1.2 基线 SQL 创建，并登记 15 个不可从空库重放的历史迁移，然后以 `migrate deploy` 验证。
- 已打包应用启动时使用 Electron `userData/englishnode.db`：现有数据库先产生时间戳备份，再执行 `migrate deploy` 与 `PRAGMA foreign_key_check`；任何失败均阻断 Next 服务启动。
- 打包过程不再调用 `prisma db push --accept-data-loss`，数据库初始化、seed 校验或产物验证失败都会中止打包。
- 已在临时目录完成一次真实的“新建空库 → 再次启动备份并升级”演练；数据库生命周期与存储边界测试现有 18 项，覆盖 seed、备份、外键/迁移失败、基线边界、legacy 逐字段保真、标签两端孤儿阻断、旧快照拒绝、已先行去重失败关闭、跨表同 ID 关系语义、双向 Domain 归属和 Electron 子进程 Node 模式。所有测试数据库均来自版本化空白 seed、合成 legacy fixture 或 `dev.db` 的隔离副本。
- 2026-07-17 修复了 seed 生成器错误登记未来迁移的问题：基线只登记其实际包含的 15 个历史迁移，后续前向迁移由 `migrate deploy` 真实执行。2026-07-19 重新生成的版本化 seed 已登记全部 21 个迁移，包含 `mapRevision`/草稿恢复字段、存储边界门禁、关系语义变体和 Task Brief Confirmation，且 Domain、Unit、LearningNode、KnowledgePoint、KnowledgeGraphEdge 均为空。
- 旧库升级现在会在 `migrate deploy` 前生成本地保真快照，迁移后回填 Word 的 language、sentenceSample、复盘调度字段，并把 CoreEssence rationale、InferenceTree/TreeNode/NodeRelation 和三类 Tag 关系无损保存在版本化 `manualBranchesJson` 兼容封装中；字段、计数、关系和语义样本不一致会阻断启动并保留快照与数据库备份。
- 旧库中业务键相同但历史语义不同的 `WordRelation` 会先转换并收敛为一条正式 `KnowledgeGraphEdge`，同时在 `legacyVariantsJson` 中按稳定历史顺序保留全部语义变体；跨表同 ID 但语义不同的记录也不会相互覆盖。真正从删除旧模型之前开始的合成旧库夹具已验证 KnowledgePoint 0→2、KnowledgeGraphNode 0→2、关系物理行 2→1、业务关系 1→1、语义变体 2→2。旧版或字段不完整的保真 sidecar 会在迁移前被拒绝；若数据库已经执行过旧去重迁移且没有变体字段，则必须从去重前备份恢复，系统不会伪造已丢失语义。
- 新增数据库级 Domain 归属门禁：LearningNode 与 Unit/KnowledgePoint、KnowledgeGraphNode 与 KnowledgePoint、KnowledgeGraphEdge 两端以及 LearningNodeDependency 两端必须同属一个 Domain，自依赖也会被拒绝；对子记录写入和父记录 `domainId` 反向变更均有数据库触发器保护。
- Electron 构建在进入打包前强制运行合成旧库的完整保真流程；任一备份、迁移、回填、计数/语义断言或外键检查失败都会终止打包，合成 fixture 不会进入发布资源。

完整决策和历史迁移基线原因见 [ADR 0006](docs/adr/0006-user-database-lifecycle.md)。

## 当前已验证用户流程

```text
AI 设置
-> 创建学习领域
-> 编辑任务书
-> 生成课程设计方向与完整 Stage 骨架
-> 用户合并确认规划
-> 按需展开并编辑单个 Stage
-> 进入学习节点
-> 按需准备教学，阅读解释/示范，练习与提问（记录可恢复）
-> 写下自己的理解
-> AI 检查建议（不可用时可跳过）
-> 用户确认并把自己的理解沉淀为 seen KnowledgePoint
-> 查看知识图谱
-> 创建诊断并逐题作答
```

这条流程已在隔离数据库中完成浏览器验收，但以下部分还不能被视为可靠的学习证据：高阶掌握状态、迁移挑战、正式虫洞、诊断总评和来源真实性。

## 当前发布阻断项

1. 已暴露或曾用于开发的 AI API Key 尚待持钥者轮换。当前依赖全量审计与生产依赖审计均为 0 vulnerabilities；后续依赖更新仍须保持 critical/high fail-closed。
2. 历史迁移链不能从空库重放，现由受版本控制的基线 seed 解决；旧 Word/CoreEssence/InferenceTree/Tag 的可保留字段、结构和关系已纳入自动保真桥及失败阻断。隔离副本已验证全部前向迁移、历史悬空关联清除、重复关系收敛、业务关系与语义变体保真及 `PRAGMA foreign_key_check`。此前记录的 `20260813090000_add_map_review_resolution` 真实库部署状态本轮未复核；本轮新增 `20260906090000_add_node_teaching` 仅在隔离库验证。真实用户库仍必须走先备份、再迁移、再保真检查的生命周期，不能用隔离库证据代替实际升级。
3. 首次节点沉淀已经收敛为服务端固定 `seen`；正式通用 PATCH、直接 materialize 及兼容 `/api/words` 创建/更新均不能写入 `can_apply`、`can_transfer` 或 `integrated`。后续高阶掌握路径仍缺 Mastery Evidence 服务端门禁，因此这些状态尚不能作为可信学习证据。
4. 关系候选已携带不可变来源，关系表已增加业务唯一约束和幂等写入；正式嵌套 Domain API 已完成 URL Domain 归属审计与浏览器 E2E，覆盖节点及其动作、关系候选/创建/实例操作/解释、诊断题节点引用、诊断会话和 Stage assessment，伪造跨领域路径或引用均被拒绝。

## 当前产品缺口

- **路线分层质量当前边界（2026-08-13）**：Stage → Module → 关键问题/可检查结果、expanded Stage 覆盖映射、独立审查/修复、可解决审查回执和服务端工作流已实现。确定性错误继续 fail closed；语义 findings 在最多两轮修复后由用户显式决定，避免同一概率模型永久阻塞。DeepSeek V4 Flash 同任务 3 次验收已完成但人工结果为 0/3：自动审查漏掉考纲范围整段缺失、综合 Stage 未汇聚终端分支，以及 Stage/Module 目标未被问题节点覆盖。下一步必须增加无歧义考纲覆盖矩阵、终端分支汇聚检查和目标→问题覆盖门，再重新验收；fixture/E2E 和同模型自审通过不能单独证明教育质量。

- 创建向导的 Domain 身份、Task Brief Confirmation、课程设计和 Map Draft 已可从持久化状态恢复；浏览器 E2E 已验证刷新与从领域详情重新进入，SQLite 设计支持应用重启后的同一路径，但 packaged 应用重启未单独自动化验证。恢复只读取正式 API，不使用 localStorage 或重复 wizard blob；当前仍不保存尚未提交到 API 的瞬时表单编辑。
- 课程研究质量门后的有界自动修复已经接通：一次请求最多两次 `course_design_repair`，失败后保留阻断状态并允许显式再次 AI 修复。2026-08-13 起 DeepSeek 研究走 Responses API 联网搜索，并把返回来源与 request ID 写入调用日志；`sourceGroundingService` 对公开 HTTPS HTML/PDF 做有界抓取核验（8s、2 MiB、最多 2 次 HTTPS 重定向，PDF 最多 8 页），只把提取文本作为后续 AI 输入。本地文件不上传，图片不进入该云端路径。最多两轮 `course_design_critique` 继续独立记录 `AiCallLog`；草稿保留非阻断五维报告、来源接地和 advisory 相关性信号。
- AI 不可用或课程研究质量门失败时不能进入正式地图，这是当前产品边界；恢复方式是检查配置、切换 Provider/模型、重试或重新生成，不再规划人工建图或直接骨架导入绕过。
- 地图已使用稳定 key、显式 DAG 与事务 reconcile，并由浏览器 E2E 证明规划/Stage 草稿刷新恢复、失败重试、冲突提示与本地编辑保留、并行 DAG，以及已开始或已沉淀节点保护。
- 新节点教学已保存提示/解答曝光、作答草稿、原始回答/提问和反馈，区分作答时是否已获得帮助；这些过程记录不能单独证明独立掌握。真实教学内容、跨节点迁移及延迟保持仍待验证，诊断仍没有会话总评/完成状态。
- L2/L3 路线建议可以生成候选，但尚未接通“转换为绑定 `mapRevision` 的 Map Draft → 完整地图确认”流程；页面现在会准确阻止直接接受，不再制造可直接改图的假入口。
- `long-term-review`、`stage-assessment` 与旧节点 `hint` / `practice` API 仍没有各自完整的正式用户入口；沉淀前教学、提示、练习与答疑由新 `/teaching` 流程交付，保留旧 practice 的沉淀后语义。
- 虫洞确认没有校验 transfer challenge。
- 正式图谱仍有功能跳回兼容画布，兼容画布会混淆候选、确认和否定关系。
- 大页面和服务过于集中，图谱布局存在 O(80×N²) 碰撞和逐节点 PATCH 风暴风险。

## 下一步优先级

当前开发顺序是先补齐现有功能的用户闭环和可用性，再处理剩余安全发布工作；已实现的凭据、本地 API、URL、seed、迁移和外键门禁继续保持，不因功能优先而放宽。

### 阶段 0：迁移保真已补齐

legacy 字段、推演结构、关系与标签的迁移保真桥、空白 seed 前向迁移、失败阻断和 Domain 存储边界已取得自动化及隔离副本证据。真实用户数据库仍只能通过备份优先生命周期升级；密钥轮换仍由持钥者完成。

### 阶段 1：领域地图核心已封闭

Course Design Direction 与完整 Stage 骨架合并审查并在同一地图事务确认，支持用户触发的逐 Stage 展开、显式前置 DAG、稳定 map key、草稿恢复、版本冲突保护和安全 reconcile。正式 Domain Map DTO 不再暴露唯一下一节点推荐，地图修改型路线建议也不能直接写图。真实页面 E2E 已证明规划与单 Stage 草稿恢复、生成失败重试、过期响应拒绝与本地编辑保留、多个起点/并行分支/多个前置，以及 reconcile 后学习进度和 KnowledgePoint 关联保持；正式嵌套 Domain API 的伪造跨领域路径与引用也已逐项拒绝。

### 阶段 2：按地图学习与最小知识沉淀已封闭

用户可以从阶段目录或只读依赖图进入任意节点，未完成前置只警告；用户写下自己的理解、接受或跳过可选 AI 检查并最终确认后，LearningNode 才沉淀为 KnowledgePoint，服务端固定为 `seen`。页面会明确标记未经检查、检查中、检查成功或检查失败，AI 不可用不阻断本地确认。浏览器 E2E 已覆盖完整骨架确认后由用户触发展开、AI 成功不代替确认、AI 失败仍可确认，以及正式/兼容 API 无法绕过首次 `seen` 门禁。

### 阶段 3：课程内容校准与真实学习验证

迭代 A 的可恢复节点教学已完成工程验证。下一轮 B 优先让 AI 从新手用途推导专业范围建议，补充与目标相关的来源内容和独立课程参照，检查目标覆盖并局部修复；随后 C 以真实新手的独立、延迟任务检验学习效果。来源抓取可达和模型自审成功仍不能替代内容正确性。高阶 Mastery Evidence、诊断总评和虫洞迁移门禁继续保留为后续边界，不为本轮教学扩张概念。

### 阶段 4：收敛与交付

正式图谱替代兼容画布主路径；拆分大模块；批量保存布局；补 a11y 自动化。CI、恶意 URL、迁移保真和 packaged Electron 双数据库场景门禁已建立；远端 GitHub Actions 首次执行仍须在提交后确认。

## 已确认的产品边界

正式 Domain Map 的首次创建和重新生成必须经过 AI 规划。云端联网 AI 是推荐主路径；LM Studio/其他本地 OpenAI-compatible API 仍属于可配置 AI Provider，但不能降低质量门，也不代表存在离线或无 AI 建图路径。可信材料只能作为 AI 输入或来源；用户可以编辑和确认 AI 草稿，但不能用人工创建或直接导入替代 AI 规划。见 [ADR 0009](docs/adr/0009-formal-domain-map-creation-requires-ai-planning.md)。


## 2026-10-10 全新空白主线1791623160555：Stage确认前已停止并封存

本轮实际新包桌面在全新隔离用户目录运行，无DB或旧结果导入；已到达空白启动、隔离设置、独立旧历史只读且新库保持空、AI课程/整路线、两次有限正常UI修订、正式路线确认（mapRevision0→1、11正式Stage/0Node）及用户按真实内容/key触发展开。12checkpoint、20实际模型调用和2非模型审计，result.ok=false/flowCompleted=false；不能以667工程检查或首Stage生成宣告本轮全产品完成。

006有效知识更正4项仅实际保留1项：上游登记投影吞掉派生蓝图极限更正，corrections仍记4项；007/008用户经真实UI同时修改上游登记/副本才保存正确，软件缺陷仍未修。008三次合同/语法失败明确uncertain，不称知识核对通过。011模型实际12claim全部优先新items，但新任务把“不取L”适用前提称未限定范围的结论必要条件；模型同path漏检，并在g=x²去心邻域/复合值上推导错及虚归属用户材料原句。需区分对所有可能F(L)的普遍保证与个例成立；F≡1、g≡0为个例必要性反例。Stage尚未正式确认，不能让该问题传播进教学。

本轮于独立审读011 stop、012保留失败后安全关闭，临时设置删除=true、TEMP不存在、原三文件指纹不变、凭据匹配0、FK0。Stage确认、完整真实教学/活动/反馈、原条件专项全文、个人网络/修订/引用、独立探索/返回、跨域、主题、结束/完成及重启均未到达，保持pending。当前目标/当前差异仍是全产品未完成；不会把未到达步骤记通过。

证据：[本轮报告](web/test-results/final-core-blank-2026-10-10-1791623160555/REPORT.md)、[完整轨迹](web/test-results/final-core-blank-2026-10-10-1791623160555/TRACE.html)、[数据链](web/test-results/final-core-blank-2026-10-10-1791623160555/AUDIT-DATA-CHAIN.md)、[011实质审读](web/test-results/final-core-blank-2026-10-10-1791623160555/AUDIT-STAGE-011.md)。仅追加本轮实证状态，旧失败/raw/报告不重写。

第四批数据支按ADR0030/0005先明确独立迁移边界：归档正式28版schema，旧27→28回归只使用该schema与截至28的迁移投影；另验含非空原别名/多段来源/指针的28→29备份保真、新视图配置断连与重复生命周期持久化。当前source seed仍为上批正式28字节，新29空白seed必须由CI正式生成/核验工件再取回更新；本机原生阻断与SQL-only证据继续分开记录，尚未记本批通过。

第四批数据支已接通并保留独立边界：归档28版schema的Git blob为 `0e53e7467f8bb18eb5d3bd9f158a99281e87f459`，SHA-256为 `5c45ab6b06b304c85de0f6719e250a23b992be4083f14209c10f22f79d2d50c8`；27→28回归使用固定archive及28项迁移投影。新增28→29验证含4旧修订的非空raw别名/多段来源/当前指针、全部旧字段和28ledger、精确备份、新配置表空白、Prisma保存/版本递增、断连和重复生命周期配置保真。client generate与schema validate、全typecheck/lint/encoding及脚本语法/YAML检查通过。

本轮4项原生迁移/空白seed测试的唯一一次本机执行均在首个query被Windows Application Control阻止query-engine DLL，0业务expect执行，不记迁移通过。Python标准sqlite3只在ignored副本验证真实29号DDL、26表/默认值/无FK、旧raw aliases等字段与28ledger保留、备份、配置版本重开和27→28投影形状；手工新增的测试ledger行不属于Prisma或正式seed证据。日志/报告在 `web/test-results/saved-views-migration-2026-11-09/`（`data-branch-result.json`、`native-migration-tests.log/json`、`python-sql-only-validation.json`）。正式source seed仍为上批28版 `1d3e30896aa46a13bf5e1f59f1a9a5aced2e6d23610fca7eface32bac30bea37`；真实29版生成、SQLite/页面/桌面门禁仍待CI，真实用户库、原index及旧迁移未改。
