# 2026-10-28 完整路线实验运行审计

本报告只读审计 `web/test-results/route-quality-live-2026-10-28-1793183197873` 中已经终止的 `finite-screening-direct`。它不评价尚在进行的其它实验臂，不改变正式产品规则，不把研究预算停止、协议状态或真实教学质量互相替代。未调用模型，未修改生产代码、实验脚本或数据库；数据库检查使用 SQLite `mode=ro`。复核时 manifest 中 24 项受冻结文件的 SHA-256 均与当前文件一致。

## 1. 结论

该实验臂确实生成并保存了六个 expanded 阶段、七个草稿节点；但第六阶段的独立知识核对没有发出网络请求。24 次研究预算在第六阶段语义审查完成后耗尽，下一次知识核对被实验 fetch 包装器拒绝。服务将此次失败明确保存为 `knowledgeReview.verdict=uncertain`，随后保存阶段草稿，返回 `HTTP 200 / reviewState=passed`。这里的 passed 对应结构与语义审查状态，不能读成独立知识核对完成。

实验脚本并未把这一返回值冒充全程完成：它记录阶段 outcome 后检查 `activeRun.halted`，终止为 `status=stopped`，没有执行第六阶段专门的 DTO reload 和全程 final 断言。停止检查晚于服务写入，所以“stopped”也不表示第六阶段未保存。只读数据库检查与归档 domain 一致，确认六阶段均已保存。

因此，这次观测既不是“六阶段全部验证成功”，也不是“模型无法生成第六阶段”。准确表述是：**完成六阶段候选生成与语义审查，完成前五阶段的有界知识核对；研究预算截断最后一次独立知识核对，且没有开展实际教学或学习效果验证。**

## 2. 证据与复核入口

- 实验脚本：[route-quality-live-experiment.test.ts](../../web/scripts/research/route-quality-live-experiment.test.ts)。预算在第 11–12 行；阶段可用性判定在第 13–20 行；fetch 计数与拦截在第 126–150 行；阶段调用、checkpoint、halted 检查与 reload 在第 187–206 行；终态与正式对象检查在第 207–235 行。
- 运行清单：[manifest.json](../../web/test-results/route-quality-live-2026-10-28-1793183197873/manifest.json)。请求模型 `deepseek-v4-flash`，单臂最多 24 次、总共最多 96 次真实 Provider 请求。研究 oracle 未送进模型。
- [outcomes.json](../../web/test-results/route-quality-live-2026-10-28-1793183197873/outcomes.json)、[transport-requests.json](../../web/test-results/route-quality-live-2026-10-28-1793183197873/transport-requests.json)、[该臂全部 AiCallLog](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-direct-logs.json)、[归档 domain](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-direct-domain.json)。JSON 归档用字段、日志 ID 和阶段 key 定位，不能依赖单行文件的行号。
- 隔离库 `isolated-planning.db`，Domain ID `cmvryz70v0001ghxspj3552eh`。日志查询须为 `domainId = ID OR canvasId = ID`：六条阶段生成日志只通过 canvasId 绑定；只按 domainId 会误数成 19 条。

这些文件含实际生成内容；用户输入是研究者构造的情境，不是用户已经确认的真实学习目标或真实筛查统计。

## 3. 24 次预算具体花在哪里

| 阶段 | 真实请求号 | 有效独立知识报告 | 说明 |
| --- | --- | --- | --- |
| 课程研究、课程语义审查、课程知识核对 | 1–3 | 11 条，no_error_found | 研究请求走 `/responses` |
| 骨架生成、语义审查、骨架知识核对 | 4–6 | 11 条，no_error_found | 六阶段蓝图 |
| 1 `stage-read-table` | 7–10 | 12 条，no_error_found | 首次知识报告缺 findings，额外使用一次合同修复 |
| 2 `stage-one-direction` | 11–13 | 12 条，no_error_found | 当前阶段实际文字 |
| 3 `stage-two-directions` | 14–16 | 12 条，uncertain | 其中一条迁移题缺交叉计数 |
| 4 `stage-notation` | 17–19 | 12 条，no_error_found | 当前阶段实际文字 |
| 5 `stage-interpret` | 20–22 | 12 条，no_error_found | 当前阶段两个模块 |
| 6 `stage-bayes-optional` | 23–24 | 未执行，0 条，uncertain | 只完成生成与语义审查 |

24 个真实请求全部取得 HTTP 200。这不意味着 24 个结果都通过合同：第 9 个请求的原始 JSON 只有 `summary / limitations / claims`，缺少必需的 `findings`；服务保留失败原文，并在第 10 个请求重做完整知识报告。该失败不是长度截断或网络失败。

若所有报告首次满足合同，本例所走路径为 6 次前置调用 + 6 × 3 次阶段调用 = 24 次。实际多用一次合同修复，使最后知识核对成为尝试中的第 25 次。研究限额足以完成无修复路径，无法容纳这一次真实出现的修复；不能将因此发生的截断归因为模型无法继续设计路线。

关键日志：

- 请求 9：`cmvrz1ngz000mghxsedutztip`，`planning_knowledge_check`，validation failed，原始输出 7,572 字符；请求 10 成功日志 `cmvrz21qd000oghxs0d4ykyly`。
- 请求 24：`cmvrz5x4a001qghxslgu5xci0`，`roadmap_stage_critique`，成功，2026-10-28 10:31:52.043 UTC。
- 下一次尝试：`cmvrz63l6001sghxsvkb7o2q9`，`planning_knowledge_check`，provider failed，2026-10-28 10:32:00.427 UTC，latency 136 ms，`rawOutput` 为空。错误为 `Research request budget reached; retain partial route without claiming completion.`。**这条日志没有相应 transport，未发生第 25 次付费网络调用。**

共有 25 条关联日志：23 条成功、1 条真实请求的合同失败、1 条发网前预算拒绝。模型调用数必须用 transport 的 24 计数，不能用 AiCallLog 行数。

“direct”也有接口边界：请求 2–24 的 chat/completions 明确编码 `thinking.type=disabled`；第 1 个 `/responses` 研究请求没有同一 thinking 字段。只能比较此次运行策略，不能声称该臂每一调用都明确关闭了思考模式。

## 4. 预算错误如何进入服务，什么真正保存了

1. fetch 包装器先检查 `calls >= 24`，设置 halted 并抛错；计数自增、transport 追加和 `originalFetch` 均在这个检查之后。
2. `runJsonTask` 保留失败日志。`independentlyCheckPlanning` 的 catch 将没有已知确定错误的当前候选标为 uncertain；见 [tutorService.ts:1071](../../web/src/lib/ai/tutorService.ts#L1071)，特别是第 1110 行附近的 catch。普通 Provider 失败不继续占用三次知识审查预算；日志持久化异常仍重抛。
3. [map/ai-draft/route.ts:281](../../web/src/app/api/domains/[id]/map/ai-draft/route.ts#L281) 先保存草稿与质量记录；第 304 行起阻断 `confirmed_error` 或语义 blocked。`uncertain` 不是现行草稿阻断条件，语义审查自身成功时返回 reviewState passed。这不是转为人工骨架或 source=fallback 的生成回退，也没有制造 no_error_found；但失败被服务转换为**明确不确定的可用草稿**。
4. 脚本先 checkpoint 并追加六阶段 outcomes，随后检查 halted；因此表面六条 HTTP 200 与最终 stopped 可以同时真实成立。它没有把最后一步误判为全部完成。

实际数据库结果：

| 对象 | 只读结果 |
| --- | --- |
| Domain | mapRevision 0；roadmapStatus draft；courseDesignStatus draft |
| Draft | 六阶段均 expanded；节点数分别为 1、1、1、1、2、1 |
| MapDraftQualityReview | 7 条：1 骨架 + 6 阶段，均语义 passed / available |
| Stage 6 质量记录 | ID `cmvrz63ur001vghxsqrqd9bxh`；知识 uncertain；claims/findings/corrections 均空；limitations 保留预算错误；绑定上述失败日志 |
| 正式 LearningNode / Unit | 0 / 0 |
| 课程、任务书确认 | courseDesignConfirmedAt 与 taskBriefConfirmedAt 均 null |
| 教学会话 | 0 |

`finite-screening-direct-stage-1-reloaded.json` 至 `stage-5-reloaded.json` 存在；`stage-6-reloaded.json` 与 `final.json` 不存在。第六阶段的实际保存由该阶段 checkpoint、stopped checkpoint 和本次数据库只读比对确认，**不能冒称已经执行了实验的第六次 DTO reload 断言**。

Stage 6 不确定报告的通用 summary 含“已执行的更正仍保留”，但 corrections 为空，本次没有任何知识更正实际发生；不能从通用措辞推断做过更正。

## 5. 知识核对覆盖与来源证据

七份有效知识报告总计 82 个主张条目：课程 11、骨架 11、前五阶段各 12。它们有跨报告重复，不能叫作 82 个独立事实。依据类型是模型报告的 16 条 source、65 条 derivation、1 条 unverified，不是人工认证统计。所有有效报告 findings 为空。

覆盖有明确分层：骨架报告引用六阶段 moduleBlueprints 的教学要求；五份阶段报告的 claims 分别全部指向 `stages[0]` 至 `stages[4]` 的实际新文字，没有仅重复全局登记冒称核对了节点。Stage 5 的 12 条跨两个模块。报告仍是 [planningKnowledgeReview.ts:42](../../web/src/lib/ai/planningKnowledgeReview.ts#L42) 规定的最多 12 条高风险主张选择，不是所有字段、任务、例子、引用或前置的穷尽核验。各报告 limitations 明确保留未核对范围。Stage 6 只有骨架时期对待教责任的早期检查，不能替代它展开后新文字的知识核对。

独立公开来源没有实际取得：

- 课程研究 `/responses` 的请求含 `web_search` 工具、`tool_choice=required`，但原始响应 output 类型只有 reasoning 与 message，没有工具搜索输出；AiCallLog.researchSourcesJson 为 null，课程原稿及最终保存的 `sources=[]`。请求搜索不等于工具实际搜索，更不等于取得可核对正文。
- 全部阶段的独立核对材料只有同一段 212 字的 `kind=user_text`：`src-8ff1b8fd0c0c-177d35db205e-0`；标题明确“用户提供正文（来源与准确性未独立核实）”。材料集合 digest 为 `3405b494a6d2cc5db4c252241cb8ad533cf580300607a86d02e15b6118bbada5`。
- 24 个真实 transport 的输入均含该片段 ID；其实际内容是研究者构造的 200 件零件计数与 16/52、16/20 的方向对照。所有核对使用同一材料集合。输入实际送达可以确认；模型是否正确理解每个字不能由传输证明。
- 课程与阶段审查反复披露没有公开教材、课程大纲或官方正文。source 依据在这里可以表示“这个已取得的用户片段确实这样写”，不表示公认知识的外部验证；derivation 的计算链也仍需独立审阅。

所以本例可支持“同一构造材料进入生成与核对、若干具体算术和条件方向被检查”，不支持“联网查证过整条路线”或“来源已证明路线教学安排正确”。

## 6. Stage 3 迁移题：规划责任与实际题目不能混同

实际 uncertain 指向 `stages[2].modules[0].items[0].transferPrompt`：

> 若换一张结构相同但计数不同的 2×2 表（例如总体 300 件、有缺陷 30 件、被标记 60 件），能否先指出两个方向各自的分母应取哪个合计，再分别算出两个比例，并说明为什么不能把两个结果对调？

知识报告指出缺四格/交叉计数，无法算出两个具体比例，因文字是提问而非已断言结论记 uncertain，findings 为空。独立算术上，总数、两个边际合计不能唯一确定“缺陷且标记”的交叉数量 x；例如 x=10 和 x=20 都与 300/30/60 相容，得到不同比例 x/60 与 x/30。若直接以这段文字作为要求唯一数值的完整题目，条件不足；若它是后续另给完整表格的规划提示，则允许后续补全。

当前各层约定：

| 层 | 实际规则与这次证据 | 不可据此声称 |
| --- | --- | --- |
| 阶段生成 | [tasks.ts:1677](../../web/src/lib/ai/tasks.ts#L1677) 明确这是简洁课程规划，example 可是问题/演示计划；详细解释在 learning session 生成 | 所有 transferPrompt 已是可直接发给学习者的完整题目 |
| 结构与语义审查 | [tasks.ts:1433](../../web/src/lib/ai/tasks.ts#L1433) 检查 checkability、范围、前置；[planningReviewPolicy.ts:163](../../web/src/lib/ai/planningReviewPolicy.ts#L163) 仅有实际严重后果的缺陷阻断，规划期允许待教任务。Stage 3 critic 实际给 singleExampleTransfer warning，建议后续生成补不同计数表，未判 blocker | 已补完表格；或没有 warning 就代表可作答 |
| 独立知识核对 | [planningKnowledgeReview.ts:448](../../web/src/lib/ai/planningKnowledgeReview.ts#L448) 明说待教计划未展开全部细节本身不是知识错误；本次缺条件保留为 uncertain | 已确认错误被吞；或 uncertain 意味着可直接算出答案 |
| 实际材料与活动 | [learningSessionService.ts:293](../../web/src/lib/learning/learningSessionService.ts#L293) 要求题目参考、criteria/hints 仅依据本题条件；[learningKnowledgeReviewPrompt.ts:45](../../web/src/lib/learning/learningKnowledgeReviewPrompt.ts#L45) 核对题目、参考、criteria 与提示的一致性 | 本次已经执行过这一层；本实验没有任何学习会话 |

本轮可反驳的后续问题应是：在实际备课后，该计划被落实为给出交叉计数的可算题、明确讨论数据不足的开放题，还是被原样发布成条件不足却要求唯一数值的题。不能通过要求规划期写完全部练习来回避这个边界。

## 7. 静态交接缺口：后续备课是否看得到疑点

只读追踪发现以下实际字段边界，尚未在此次真实路线实验中执行或验证：

1. 正式地图 reconcile 会保存节点 `transferPrompt`，并把 learningUnit.example 存在 `conceptJson`，commonMistake 也有独立字段；见 [roadmapService.ts:1015](../../web/src/lib/learning/roadmapService.ts#L1015)。保存存在不等于备课输入包含它们。
2. [learningSessionService.ts:56](../../web/src/lib/learning/learningSessionService.ts#L56) `makeContext` 读取节点后，task 仅投影 id、title、objective、question、scope、newKnowledge、teachingTasks、prerequisites。没有 node.transferPrompt、node.commonMistake 或 concept.learningUnit.example。对应 [flexibleTeaching.ts:17](../../web/src/lib/learning/flexibleTeaching.ts#L17) 的 LearningContext.task 类型也没有这些字段。
3. `makeContext` 第 82–85 行仅取整个 domain 最新一条 MapDraftQualityReview；只从其 knowledgeReview 投影 verdict、claims、limitations，没有语义报告 warnings。claims 又要求 quote 出现在 `JSON.stringify({concept,questions})`。Stage 3 的 transferPrompt 在实际草稿中是独立字段，300/30/60 仅出现在那里，不在 concept/questions 中。
4. 本次最新报告属于 Stage 6，claims 为空，limitations 只有预算失败；它会遮蔽 Stage 3 仍保存在历史报告中的具体迁移疑点。即使 Stage 3 报告恰好是最新的，其 transferPrompt quote 也不满足该 concept/questions 子串筛选。报告本身未被删除，但不是实际备课的可见上下文。
5. [learningSessionService.ts:254](../../web/src/lib/learning/learningSessionService.ts#L254) 框架生成发送上述 context 和实际来源；正文生成第 293 行发送 teachingContext、框架、当前部分、来源、摘要和近期交互。`teachingContext` 第 91–96 行基于保存的 context，只刷新 prerequisites；没有额外读取原 transferPrompt 或全部旧审查警告的路径。来源导入读取课程 sources 和原始 planningInput.materials，也不会把审查意见转成来源真值。

因此，“后续补完整表”在本例仅得到规划与审查文字上的安排；当前代码未显式把这个具体疑点交给后续生成。备课仍可能依据任务责任自行正确造表，活动核对也可能独立发现问题，故**不能把缺少传递等同于已经教学失败**。它是值得用实际 prompt 捕获与隔离活动实测验证的因果候选。

最小研究性设计应同时检查：当前节点原始 example/commonMistake/transferPrompt 是否只读传入；对应现行候选/阶段/文本的疑点是否可回查；旧候选或已经改变的文本是否被拒绝绑定。不能简单堆入所有历史报告或仅凭字符串相同认定旧错误属于当前节点，也不能把旧模型 warning 升格为事实或新的强制教学要求。正式实现及其身份合同另行决定，本报告不修改它们。

## 8. 本轮证据支持范围

- 程序运行：真实生产服务和 Provider 被调用；六阶段保存可复核；研究 cap 的终止原因明确；没有正式地图、确认或教学会话写入。
- 协议质量：语义报告可用；一次知识报告合同失败被有界修复；最后知识核对未执行并明确标不确定。不能用 HTTP 200 或语义 passed 代替知识覆盖。
- 内容质量：当前有具体计数、方向、范围及选学安排的有界检查，也有真实迁移疑点与来源局限。需要逐项语义审阅，不能以 82 个条目计作全面正确率。
- 教学质量：路线规划不等于实际备课，实际备课不等于学习者理解。该实验没有测试题目最终可作答性、反馈对真实作答是否正确、长期记忆或迁移效果。

后续应优先验证上述具体交接与活动落实，而不是把这次研究预算截断解释为模型能力结论，或凭一个表面通过状态判定整个闭环有效。

## 9. 随后获准的隔离复现与最小修正设计（尚未实施）

完成上述只读审计后，根任务授权新增一个专用回归文件，不改变受冻结的生产代码、原路线实验脚本及其输入。

复现入口：[planning-teaching-handoff-repro.test.ts](../../web/scripts/research/planning-teaching-handoff-repro.test.ts)。运行真实 `createLearningSession → prepareLearningSession → prepareLearningSegment` 与 `recordMapDraftQualityReview`，仅将模型调用替换为通过现有 validator 的固定协议夹具。数据库是临时目录里的空白 seed 副本，fetch 被显式拒绝，结束后清理临时库。这能验证服务实际发送的 prompt，不评价模型能否自行补全内容或最终教学质量。

最终结果为 **8 项测试全部在预期行为断言失败**，不是初始化、类型或数据库失败：

| 复现 | 实际旧行为 |
| --- | --- |
| 当前 example / commonMistake / transferPrompt | 框架与正文各缺三项，6 条独立软断言失败 |
| 当前迁移题疑点恰好处于最新报告 | transferPrompt 不在筛选投影中，具体原因仍未进入备课 |
| 原疑点确实已经进入 prompt，随后新增无关 Stage 报告 | 显式重新备课后原疑点消失；此用例单独隔离 latest-only 选择的影响 |
| 更换课程身份、Stage key、node key | 三个用例均继续向新 prompt 注入旧确定错误 |
| 改变正文而保留相同 quote 子串 | 旧文“以总体计数作分母”被改为“不以总体计数作分母，而以被标记总数作分母”，旧错误理由仍被注入；子串匹配不能辨认否定与适用范围 |
| 旧报告缺可恢复的节点绑定 | 仍作为当前 planningKnowledge 主张传入，而非只保留历史追溯 |

证据：[最终八项原实现失败结果](../../web/test-results/planning-teaching-handoff-before-refined-2026-10-28.json)。首次七项结果仍保留在 [before 文件](../../web/test-results/planning-teaching-handoff-before-2026-10-28.json)，没有覆盖；增加第八项并细化 latest-only 用例是为区分两个独立原因。新测试文件 ESLint 与全项目 `tsc --noEmit --incremental false` 均通过。测试刻意放在 `scripts/research/`，须显式运行，不把尚未修复的红回归偷偷并入默认产品测试结果。未声称独立代理复核通过。

最小修正设计：

1. 让 LearningContext.task 保留当前节点 example/commonMistake/transferPrompt 的只读规划原文，框架和正文沿用同一上下文。原文进入 prompt 不等于已向用户展示，不自动变成 requiredOutput、作答、完成或掌握证据。
2. 在记录质量审查时，由服务从**本次实际 draft**生成内部节点证据快照，放在既有 reportJson 中，不让模型生成绑定，也不需要迁移 schema。绑定至少包括课程生成身份、Stage/node 稳定 key、规范化教学全文及分配的内容问题/requirementIndices/importance/前置责任指纹。只把真实路径属于该节点、引用与正文相符的 claims 纳入；知识结论与语义 warning 分开保存。
3. 会话读取按当前正式节点的同一规范化投影匹配历史快照，选取真实相符的证据，不使用整个领域 latest，也不靠 quote 子串恢复身份。无关阶段展开会改变全图 draftHash，但不应抹去未改变节点的证据；正式确认会递增 mapRevision，也不能简单要求原 baseRevision 与当前 revision 相等。保留原 report ID、draftHash、来源和核对范围用于追溯。
4. 课程、Stage、节点身份、正文或课程责任改变后，不继承不再相符的结论。旧 reportJson 没有节点快照时只说明旧记录可追溯、适用性未核实，不从部分 path/相同短句猜测它已经核对当前节点。若将 warning 传入，也只是同绑定的待核对线索，不能升级为事实、补充课程指令或必做门槛。
5. 生成与读取共用纯投影/指纹函数，避免两套规范化。原会话保存的 context/lesson 历史不静默改写；只在新建或显式重新备课的版本中重建绑定。正式实现后必须用同一批失败回归验证，并另做真实活动补表/数据不足辨识实验，不能以回归变绿声称教学效果已经改善。

本段是有隔离复现支持的实现建议。生产修正仍待完整路线实验结束后授权；没有因新增研究测试改变原四路线的输入、脚本、来源哈希或预算。
