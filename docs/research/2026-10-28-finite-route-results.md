# 有限筛查表路线：独立语义审读

日期：2026-10-28。实验目录：[route-quality-live-2026-10-28-1793183197873](../../web/test-results/route-quality-live-2026-10-28-1793183197873)。评价依据为模型路线输出审读前冻结的 [route-quality-oracle.json](../../web/scripts/research/route-quality-oracle.json)，实际输入以实验 [manifest.json](../../web/test-results/route-quality-live-2026-10-28-1793183197873/manifest.json) 为准。本报告不使用知识核对模型的 `passed` 或 `no_error_found` 充当语义真值。

**审读已覆盖两个运行的全部可得终态产物。** 非推理运行状态是 `stopped`：六个 Stage 虽都有 `expanded` 返回，但最后知识核对被研究请求预算阻止，且缺少第六次重读证据，不能宣称流程完整完成。推理运行五个 Stage 均生成并重读，最终文件也与最后重读一致；但四个 Stage 的自动知识核对未完成，不能称为质量审查闭环完成。没有在本审读任务中调用模型、修改原产物或写入实验数据库。

两条路线已观察到的主表计算、两个方向和选学公式代入均正确；选学内容也未成为主线前置。非推理路线有未声明的二维读表能力被归为学习者自述、一处具体迁移题缺交集，以及若干需澄清措辞；推理路线的这些对应安排更明确，末阶段仍有独立审查可用性缺口。它们是两条不同候选，不是固定文本的模式准确率比较，也不能用这两条静态路线证明真实学习收益。

本文的“draft 内容一致”均指取出相应 JSON 对象、统一序列化后比较一致；不指包含不同外层包装的原始文件字节相同。

## 审读基准

目标是读有限产品表、区分两个条件方向并解释筛查结果。学习者只自述会分数、百分数、集合交并，未学过概率，也没有能力测验；希望先具体表格、后概括；贝叶斯代数推导选学。

输入构造表四格为 16、4、36、144，独立相加得到缺陷/无缺陷 20/180、标记/未标记 52/148、总数 200。故 `P(缺陷|标记)=16/52=4/13`，`P(标记|缺陷)=16/20=4/5`，缺陷基准比例 `20/200=1/10`。这是构造有限表中的比例，不是未来真实产品性能或因果证明。任务内可补必要背景，不要求一个术语一个节点或固定阶段数。

## 非推理模式：课程、骨架及前两阶段

证据文件：

- [planning](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-direct-planning.json)
- [stage-1](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-direct-stage-1.json) 与 [stage-1-reloaded](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-direct-stage-1-reloaded.json)
- [stage-2](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-direct-stage-2.json) 与 [stage-2-reloaded](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-direct-stage-2-reloaded.json)

以下路径均从所指 JSON 根开始；`response.stage` 与对应 `response.draft.stages[index]` 已逐字比较相同。两次 API 返回的完整 `response.draft` 与各自重新读取的 `roadmap.draft` 也一致；重新读取的正式 `roadmap.stages` 为空、`mapRevision=0`。这是候选持久化证据，不是用户已经确认正式地图。

| 维度与判断 | 原文位置与最小证据 | 独立核验及边界 |
|---|---|---|
| 表结构与计数：supported | stage-1 `response.stage.modules[0].items[0].concept.learningUnit.teachingTasks[2]`：“16+4=20（有缺陷）、36+144=180（无缺陷）；列合计：16+36=52（被标记）、4+144=148（未被标记）” | 四格互斥且穷尽，行、列各自合计为 200，原数字没有改变。任务同时安排解释格子含义，不能仅从标题推断覆盖。 |
| 正确条件方向：supported | stage-2 `response.stage.modules[0].items[0].concept.learningUnit.example`：“先把参照集限定为被标记的 52 件，再在其中数出 16 件，得 16/52=4/13” | 分母确为条件集；`commonMistake` 对比 16/200、反向 16/20，数值和问题方向相容。此时完整反向比较仍由后续 Stage 承担。 |
| 任务可执行：supported（规划层） | stage-1 上述 `teachingTasks[0..4]` 给四格、加法路径及构造身份；stage-2 同路径给条件集选择、约分、自然语言解释；stage-2 `transferPrompt` 指明“被标记 40 件、其中有缺陷 10 件” | 核心例子有实际数据、操作及解释目标，变式可算 10/40=1/4；无需等待完整新四格表即可完成该单向问题。第一阶段泛指“结构相同、计数不同”的迁移表尚未给具体数字，但这是规划提示，不等于已经提供独立课堂练习。 |
| 已展开节点的前置：supported | stage-2 `response.stage.modules[0].items[0].prerequisiteKeys[0]` 为 `node-screen-table-structure`，其 `prerequisite` 指向“四格计数与列合计 52”；同模块 `conceptReferences[0].problemRole` 明确复用 16 与 52 | 后任务确实使用这些计数及读法，前一节点已提供。将它们合讲也是可能安排；本结果不证明独立节点或该顺序唯一必要。 |
| 选学身份：supported（课程、完整骨架、已展开节点） | planning `response.draft.learningGoals[0].contentQuestions[6].importance` 为 `optional`；`response.draft.stages[5]` 为选学贝叶斯，其前置是 `stage-two-directions`，所有主线 Stage 的 `prerequisiteStageKeys` 均未引用它 | 公式内容的选学声明与依赖方向一致，现有主线任务可不经过代数推导。这里只确认当前可见结构；选学阶段详细展开与后续最终保存另查。 |
| 先具体后概括：supported（可见安排） | Stage 1 操作四格表，Stage 2 做 16/52，骨架 Stage 3 比较方向，Stage 4 才安排条件记号 | 符合明确用户偏好；不把这种顺序评为普遍最优学习方法，也不因六个 Stage 就判断过度拆分。 |
| 构造来源身份：supported | planning `response.courseDesign.draft.globalExplanation.sourceBasis`：“只有一段用户粘贴正文……不是公开 URL”，并称数据为研究者构造；`sources=[]`。stage-1 `teachingTasks[4]`：“不是实测产品质量” | 所引用计数与 manifest 输入吻合，没把构造材料包装成实测或公开权威。公开来源不足不影响有限算术的直接复核，也不能据此声称模型真实联网取证。 |
| 自述基础归因：contradicted（明确、局部） | planning `response.skeleton.stages[0].rationale`：“学习者自述会集合交并与按行列读表”；stage-1 `response.stage.rationale`：“自述的集合交并、按行列读表与整数加法基础”；同 Stage `modules[0].items[0].prerequisite`：“直接使用学习者自述的集合交并直观、按行列读表与整数加法” | manifest `scenarios[0].goal/currentLevel` 没有“会按行列读表”的自述。可以把读二维表作为待补工作假设，却不能归因为已有自述。第一阶段实际上教授了表结构，所以这里不是已证实的学习阻断，也不是伪造能力测验。 |
| 自述与已测能力区分：supported | planning `response.courseDesign.draft.globalExplanation.risksAndValidation`：“自述不等于已测”；节点 `status=not_started` | 没有把本轮目标文本当成真实能力测验。不得仅因任务前置写“已能读懂”便推断系统已经认证掌握。 |

有两处解释力度需要单列，不能与上表的确定性错误混算。

第一，planning `response.courseDesign.draft.globalExplanation.optimizationRationale` 一方面说顺序是教学选择，另一方面说“双向对照之所以必须与单向读数相邻”；`theorySkeleton` 则称先公式后表格“会破坏理解”。本实验没有学习者表现或比较教学证据，最多支持它符合该用户的顺序偏好，不能证明不相邻一定失败。现有实际顺序与目标相容，问题是理由过于绝对，属于 `preference_only`，不是计算错误。

第二，stage-2 `response.stage.modules[0].items[0].concept.learningUnit.newKnowledge` 写“条件不是附加信息，而是把参照总体限定为一个子集”，同句传播到课程与内容要求。若它意在提醒不能忽略条件继续用 200 当分母，实际例子正确；若读成条件不能表达新获知的信息，则排除了一个合理解释。这里标 `needs_clarification`，建议限定为“在这张有限表中，获知条件后要改用相应条件集作参照”。同样，课程概括中的“分子始终是同一个联合计数”应限定为本课交换同一对事件的方向；改问未标记者中缺陷比例时分子会是 4 而非 16。当前例子的数值未因此算错。

上述前两阶段 checkpoint 单独不能证明基准比例责任或完整解释责任已完成；下文另审后续实际节点，避免用早期蓝图替代后续内容证据。

## 非推理模式：后四阶段的实际内容

证据：[stage-3](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-direct-stage-3.json)、[stage-4](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-direct-stage-4.json)、[stage-5](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-direct-stage-5.json)、[stage-6](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-direct-stage-6.json)。这些是 API 返回的实际候选文本，不是只读标题或 AI 评语。

Stage 3 的 `response.stage.modules[0].items[0].concept.learningUnit.newKnowledge/example/teachingTasks` 在同一张完整表上实际并列计算 16/52 与 16/20，并解释列合计、行合计的区别，支持 F-C2。Stage 4 同路径的 `teachingTasks[1]` 将两个中文问题分别对应到 `P(缺陷|被标记)`、`P(被标记|缺陷)`，并指出左右两侧的对象；这里确有从具体计数到记号的教学安排，不是只出现符号名称。

Stage 5 `response.stage.modules[0].items[0].concept.learningUnit.teachingTasks[0..1]` 实际解释 20/200=1/10、16/52=4/13，并指出未标记 148 件里仍有 4 件缺陷，支持解释名单的主要责任。`modules[1].items[0].concept.learningUnit.example` 另给完整迁移表：四格 30、10、30、130；独立相加为总数 200、缺陷 40、无缺陷 160、标记 60，得 30/60=1/2 与 30/40=3/4。这是明确标记的新例子，没有静默改写主表。边界任务指出构造数据非实测、条件比例不证明因果，不把结果解释为单件确定结论。

Stage 6 `response.stage.modules[0].items[0].concept.learningUnit.example` 实际给出：

> P(缺陷|被标记)=(16/20)·(20/200)/(52/200)=16/52=4/13；反向 P(被标记|缺陷)=(16/52)·(52/200)/(20/200)=16/20=4/5。

两式均可直接约分验证，所有分母在本表中为正，未把计数 52 当成该公式中概率的实际代入值。其 `teachingTasks[4]` 再明确“不要求先掌握公式才能理解前面的筛查例子，也不把公式作为后续主线的前置”。核对 Stage 6 返回的整个 `response.draft`：主线六个节点均不依赖 `node-bayes-as-grouped-counting`；选学节点反而依赖已存在的双向读数节点。因此从真实任务及依赖关系看，选学承诺保留。Stage 5 `rationale` 还明确记号本身不是解释名单的必要前置，实际仅依赖双向读数。

**D-F2：Stage 3 的具体迁移提示不能由现有数字唯一作答。** 路径为 stage-3 `response.stage.modules[0].items[0].transferPrompt`：

> 若换一张结构相同但计数不同的 2×2 表（例如总体 300 件、有缺陷 30 件、被标记 60 件），能否先指出两个方向各自的分母应取哪个合计，再分别算出两个比例，并说明为什么不能把两个结果对调？

已检查所在 item、模块、Stage 及其引用：核心 `example` 仍是原 200 件表，引用提供的是原 16/52 与 16/20；没有把原交集 16、原组内比例或某张完整 300 件表明确继承给新例子。“结构相同、计数不同”不规定新交集。两张如下的合法表都满足给出的三个数，却给不同答案：

| 研究者反例表（不是模型生成文本） | 有缺陷且标记 | 有缺陷且未标记 | 无缺陷且标记 | 无缺陷且未标记 | 缺陷\|标记 | 标记\|缺陷 |
|---|---:|---:|---:|---:|---:|---:|
| A | 10 | 20 | 50 | 220 | 10/60=1/6 | 10/30=1/3 |
| B | 20 | 10 | 40 | 230 | 20/60=1/3 | 20/30=2/3 |

二者都总计 300、缺陷 30、标记 60。故“指出分母”可作答，“分别算两个具体比例”仅凭所给例子不可唯一作答。若之后教学另给完整表或明确以交集 k 表达答案，则可以补足；这里记录的是该具体提示当前缺输入，不扩大为主任务或整条路线不可执行。它也不是一条已断言的错误比例。原模型审查已识别这个缺口，`qualityReport.knowledgeReview` 中 claim `audit-two-directions-transferprompt` 以“该文字只是提问，不是已断言结论”为由记 `uncertain`，没有产生可应用 finding；所以不能写成核对器没有看到问题。结构 `reviewState=passed`、识别但未改的任务数据缺口、后续教学可能补全是三种不同证据。本次独立判断仍依据上面的两表反例。

**D-F3：Stage 5 的基准比例对照需要说明保持什么不变，暂不定为确定知识错误。** `response.stage.modules[0].items[0].concept.learningUnit.teachingTasks[2]` 给“总体 200 件、缺陷 40 件、标记规则不变”，`example` 要“重新按格子计数”比较。这可以合理地意指保持两类的标记率，但原文字没有把该含义和新四格写明。若明确保持原缺陷组标记率 16/20=0.8、无缺陷组标记率 36/180=0.2，则新表是 32、8、32、128，被标记者中缺陷为 32/64=1/2；这是一种可执行的补全，并非本轮已生成的正文。

相邻边界节点的完整表 30、10、30、130 能完成方向迁移，但对应两类标记率是 0.75 与 0.1875，不能直接当成“保持原两类标记率”的证据。原文没有说这两张对照表必须同一，因此也不能把它们合并后指控自相矛盾。F-C4 有基准比例、名单构成及对照任务的承接，但控制条件和具体解释尚不充分；记 `needs_clarification`，不能仅因声明了这项责任就报充分覆盖，也不能断言这个规划任务无法在课堂补全。

**D-F4：选学节点的 commonMistake 有概率/计数指代歧义，不能掩盖其正确公式，也不应照抄作标准纠错。** stage-6 `response.stage.modules[0].items[0].commonMistake` 原文为：

> 把贝叶斯公式当成新的计算来源，直接套公式而不回到表里核对 16、52、20 分别是什么；或把公式中的 P(被标记) 误取为 20 而不是 52。

第一句是在讨论格子/合计。第二句中的 20 明确是错误示例，不能误判为模型认可 P=20；但“而不是 52”又把 52 放在正确替代位置，若按它明说的 `P(被标记)` 理解，正确值是 52/200，52 只是标记计数。同一 item 的 `newKnowledge`、`teachingTasks[1]`、`example` 均明确写了 52/200，因此整体上下文也允许把这句读作计数的省略说法。将它记为 `needs_clarification` 的局部误导风险，不计成整套公式算错；应明确说“把被标记计数误取 20，正确计数是 52，对应概率 52/200”。

## 非推理模式：研究停止点与证据范围

证据：[outcomes.json](../../web/test-results/route-quality-live-2026-10-28-1793183197873/outcomes.json)、[transport-requests.json](../../web/test-results/route-quality-live-2026-10-28-1793183197873/transport-requests.json)、[direct logs](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-direct-logs.json)、[direct stopped](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-direct-stopped.json)。它们明确标记为研究预算，不是新生产门禁。

| 可观察事实 | 结论边界 |
|---|---|
| 实际 Provider 请求 24 次，全部 HTTP 200；第 23、24 次属于 Stage 6 的生成及结构评审。 | HTTP 成功不证明知识检查通过。 |
| 共有 25 条 AiCallLog：23 条成功；一条 Stage 1 知识报告合同失败，后续调用得到有效报告；最后一条 Stage 6 知识核对失败，错误为研究预算到达。 | 最后一条没有 `providerRequestId`、没有响应，表示 24 次已经用完，下一次发送前被拦；不是第 24 次远程响应报错，也不是模型 token 耗尽。 |
| Stage 6 返回 HTTP 200、`expanded`、`reviewState=passed`，但 `qualityReport.knowledgeReview.verdict=uncertain`，summary 明示“独立知识核对未完成”。 | 结构评审和知识核对可用性不同。此处没有成功完成的 Stage 6 模型知识核对。 |
| Stage 1–5 均有独立 reloaded 文件，其 `roadmap.draft` 与对应 API `response.draft` 完全一致；正式 Stage 列表为空、mapRevision=0。 | 前五次候选保存后重读得到验证，没有正式地图确认。 |
| Stage 6 的 `response.stage` 与自身 `response.draft.stages[5]` 一致，整个返回 draft 的六个 Stage 均为 expanded；前五个 Stage 与 Stage 5 重读完全相同。 | 可审读全部返回节点文本，但不能据此代替最后一次持久化重读。 |
| 没有 stage-6-reloaded 或完整 final 文件；stopped.json 只有预算 error。outcomes 记 `status=stopped`、`providerRequests=24`、`elapsedMs=322655`、`formalNodes=0`。 | 第六次独立重读及研究全流程完成为 `not_observable`。不能宣称完整完成，也不能据此认定生产流程失败。 |

实际请求还显示第 1 次课程研究使用 `/responses`，未编码 thinking 开关；后 23 次 `/chat/completions` 明确编码 `disabled`。所以“非推理路线”指这一运行策略，不是已经证明每个上游请求的内部推理都关闭。与推理路线的比较需要按同样边界报告。

此次非推理路线的已观察目标承接是：F-C1 具体表格及合计、F-C2 两个条件方向、F-C3 名单解释与边界、F-C5 先计数后概括均有实际内容支持；F-C4 的基准率对照已有承担者，但“同规则”的控制含义及新表补全需要澄清。这个分项结论不能折算成真实学习质量总分，更不能证明用户已学会。

## 推理模式：planning 与前三阶段

证据：[thinking planning](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-thinking-planning.json)、[stage-1](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-thinking-stage-1.json)、[stage-2](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-thinking-stage-2.json)、[stage-3](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-thinking-stage-3.json)，以及各自 [重读 1](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-thinking-stage-1-reloaded.json)、[重读 2](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-thinking-stage-2-reloaded.json)、[重读 3](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-thinking-stage-3-reloaded.json)。

三次 `response.stage` 均与自身 `response.draft.stages[index]` 一致，三份完整返回 draft 均与对应 `roadmap.draft` 逐字一致；正式 `roadmap.stages=[]`、`mapRevision=0`。这只证明已观察候选的保存重读一致。

| 维度与判断 | 字段及原文证据 | 独立核验与边界 |
|---|---|---|
| 基础证据区分：supported | thinking planning `response.courseDesign.draft.knowledgeBoundary.assumedKnowledge[2]`：“提案性入口假设：基本四则运算与按行列求和的操作习惯……必要时当堂简短说明，不设为掌握门槛”；Stage 1 节点 `learningUnit.assumedKnowledge[2]` 保留“入口假设” | 用户并未自述按行列读表；这里正确标成安排假设，未复现 direct 的自述归因问题。分数、百分数、集合交并仍标为自述，`risksAndValidation` 明示未验证。 |
| 读表任务：supported | Stage 1 `response.stage.modules[0].items[0].concept.learningUnit.teachingTasks[0..3]` 实际读出 16、4、36、144，求 20/180、52/148 并核对 200，最后标构造数据 | 数字逐项正确，实际任务有输入和解释目标；按行列求和也在此教授，不仅在入口假设里出现。 |
| 单向条件与错误分母：supported | Stage 2 同路径 `teachingTasks[2..4]` 计算 16/52=4/13≈30.8%，并解释 16/200 为联合比例、16/20 为反方向比例 | 对本题三种分母的含义区分准确；30.8% 为合理舍入。引用前一读表节点提供 16 与 52，前置责任有具体承接。 |
| 反向与方向比较：supported | Stage 3 `modules[0].items[0].concept.learningUnit.example` 给缺陷组 16 标记、4 未标记，算 16/20=80%；`modules[1].items[0].concept.learningUnit.teachingTasks[4]` 将“80%是被标记件缺陷比例”的误读改回 16/52 | 同一交集下两条件集分别为 20、52，计算和纠错正确；两个相关节点分工可行，但不证明拆为两个比合讲更好。 |
| 迁移提示范围：supported（解释任务层） | Stage 3 两个 item 的 `transferPrompt` 分别要求在医学筛查、垃圾邮件例型中“先只判断”两个方向应使用哪个分母 | 这些提示要求辨认条件子群，不用未给交集强求具体比例，因此没有 direct Stage 3 那种局部欠定数值题。尚未提供独立完整迁移表，不等于已经测得迁移能力；题型提示也不必提前具备整段课堂正文。 |
| 选学依赖：supported（完整骨架与已展开节点） | thinking planning `response.draft.learningGoals[1]` 为选学目标，其问题 `importance=optional`；`stages[4]` 为选学公式阶段，只有它依赖主线，没有主线依赖它 | 前三阶段任务全部用具体表、条件子群与方向解释，无公式推导要求；第五阶段是否按此展开仍待观察。 |
| 自动核对可用性：不可与内容判断合并 | Stage 1、2 的 `response.qualityReport.knowledgeReview.verdict=uncertain`，summary 明示“独立知识核对未完成”；Stage 3 为 `no_error_found` | 前两阶段即使本次独立复算正确，也不能记作模型知识核对已成功。Stage 3 的报告也不是本表数学结论的真值来源。终态再汇总各失败调用。 |

推理路线取得的来源与非推理路线不同，须保留这一比较条件。thinking planning `response.courseDesign.draft.sources[0]` 保存 [OpenStax 3.4 Contingency Tables](https://openstax.org/books/introductory-statistics-2e/pages/3-4-contingency-tables) 的实际正文：`grounding.bodyRetrieved=true`、HTTP 200、`retrievedAt=2026-10-28T10:32:37.869Z`、内容指纹 `bad2b5badfd8dcc2b59340a891d022ad2378ff4c7b6c437bbff692d71fe36f24`。不是仅凭网址存在认定支持。

保存正文的例 3.20 有四格 25、280、45、405，行合计 305、450、列合计 70、685，合为 755；条件示例为 25/70 与 405/450。`sources[0].grounding.fragments[98].text`、`[103].text` 分别说明限定到有违规的司机和不使用手机的司机。模型 `globalExplanation.sourceBasis` 关于这些数值与条件子群的转述能在实际正文中核验；只使用这一小段支持读表与条件分母，不声称这页证明本课顺序或贝叶斯推导。课程本身也明确该限制。

仅到这三个 checkpoint 时，F-C1、F-C2 及先具体再概括已有实际任务支持；完整名单/基准比例解释仍由后续实际节点验证，下文补充其终态证据。

与 direct 的当前可比差异是具体产物层面的：入口假设归因更清楚、来源正文可验证、迁移提示不强求缺失交集的数值；两者前三阶段主表计算都正确。两条路线是独立生成、取得来源也不同，不能把这些差异全归因于推理开关，不能按 Stage 数、停止位置或静态内容折算模式准确率。教学顺序的适宜性仍是待学习者证据检验的安排。

## 推理模式：末两阶段与最终保存

证据：[thinking stage-4](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-thinking-stage-4.json)、[stage-4-reloaded](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-thinking-stage-4-reloaded.json)、[stage-5](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-thinking-stage-5.json)、[stage-5-reloaded](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-thinking-stage-5-reloaded.json)、[final](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-thinking-final.json)。

Stage 4 `response.stage.modules[0].items[0].concept.learningUnit.teachingTasks[0..5]` 实际安排以下计算和解释，而不只是登记覆盖：

- 总体缺陷基准 20/200=10%；被标记组 16/52≈30.8%；未被标记组 4/148≈2.7%。精确值分别为 1/10、4/13、1/37，舍入正确。
- 并列三个比例后，指出“被标记中仍有36件无缺陷、未标记中仍有4件缺陷”；结合 16/20=80% 再说明不能反读为被标记者一定有缺陷。
- 明确这是构造数据，只练习读表和比例，不能由此推出真实政策、因果或产品质量结论。

这里有明确的静态基准比较、16 与 36 组成标记名单及非确定性解释，支持本场景 F-C3/F-C4。它未做“改变总体基准且保持两类标记率”的反事实对照，但原目标不强制这种展示；因此不能因为没有采用 direct 自己增加的对照表方案就判遗漏。

Stage 5 同路径 `teachingTasks[2..3]` 和 `example` 实际给出 `16/200=(52/200)(16/52)` 与 `16/52=(16/20)(20/200)/(52/200)`；两式逐项约分正确。`teachingTasks[4]` 说明“不要求代数推导，不作为主线理解或完成条件；跳过不影响核心目标”，`[5]` 再强调公式不能替代方向与分母判断。已检查最终 draft 全部节点的 `prerequisiteKeys`，没有任何主线节点引用 `n-optional-formula-table-map`；选学阶段的 `goalKeys` 指向独立的选学 goal-2，而不是暗中承担唯一主线责任。

该选学节点的 `transferPrompt` 要求换表后“把乘法规则和贝叶斯公式的各项重新指认出来”，并提到“只靠行列合计与条件子群大小”。若要求具体数值，联合计数也不可省；但本句是在已有完整二值表上做项的指认，并未给缺交集的具体数字后要求唯一比例，所以不把它另算成 direct Stage 3 同类的确定欠定数值题。教学展开时仍宜清楚标出哪些项取交集、哪些项取边际合计。

五次 API draft 均与各自重读一致。最后一次的前四个 Stage 与第四次重读未变；final `roadmap.draft` 与 Stage 5 重读一致，final `course.draft` 与 planning 的课程草稿一致。final 五 Stage 全为 `expanded`、共六个候选节点，正式 `roadmap.stages=[]`、`mapRevision=0`，`course.confirmedAt=null`。final 的 `semanticAcceptance` 仍明确要求独立审读。因此运行终态 `all-candidates-generated-and-reloaded` 只代表候选链已到达及重读，不代表用户确认、自动知识审查完成或学习效果通过。

## 终态可用性与比较边界

推理运行实际请求 24 次、AiCallLog 24 条，其中 16 条成功、8 条失败；耗时 1,374.550 秒。五个 Stage 的接口均返回 200，但自动知识结果依次为 `uncertain / uncertain / no_error_found / uncertain / uncertain`。前、后四个 uncertain 是未完成报告，不是已断言知识错误；Stage 3 的有效 no_error_found 也不能代表未审阶段。

失败类型由实际请求体及保存响应区分：四次知识核对在 **本轮生产 12,000 token 上限**内全用于推理、没有最终正文；另两次知识核对在同一 12,000 上限返回截断正文；一次结构评审在 24,000 上限返回截断正文；最后一次知识核对为 `fetch failed`，已尝试发送但没有 HTTP 状态、原始响应或 usage。最后一次不能称为模型没有推理、零 token 或研究预算拦截。这些都不同于另一份跨题诊断使用的 10,000 token 预算，也不同于 direct 发送前的研究请求数限制。

具体失败覆盖如下，序号取 [transport-requests.json](../../web/test-results/route-quality-live-2026-10-28-1793183197873/transport-requests.json) 中该运行的 `requestInRun`；任务与错误在 [thinking logs](../../web/test-results/route-quality-live-2026-10-28-1793183197873/finite-screening-thinking-logs.json) 对照：

| 请求序号 | 发生位置 | 保存结果 |
|---|---|---|
| 3 | planning 的课程知识核对 | length，12,000 reasoning token，最终正文空 |
| 8 | Stage 1 结构评审 | length，24,000 completion token，其中 23,777 reasoning，正文截断 |
| 10 | Stage 1 知识核对 | length，12,000 reasoning token，最终正文空 |
| 13 | Stage 2 知识核对 | length，12,000 reasoning token，最终正文空 |
| 16 | Stage 3 知识核对 | length，12,000 completion token，其中 10,569 reasoning，正文截断；第 17 次重试得到有效报告 |
| 20 | Stage 4 知识核对 | length，12,000 reasoning token，最终正文空 |
| 23 | Stage 5 知识核对 | length，12,000 completion token，其中 8,489 reasoning，正文截断 |
| 24 | Stage 5 知识核对重试 | fetch failed，15,221 ms，响应与 usage 未知 |

Stage 1 的结构评审后来取得有效结果；这里保留失败次数，不用最终返回状态抹掉中间失败。直接模式另有第 9 次 Stage 1 知识报告合同失败（finish=stop），随后取得有效报告；最后预算阻断没有对应的第 25 个实际请求。

| 证据层 | 非推理运行 | 推理运行 |
|---|---|---|
| 实际 Provider 请求 / AiCallLog | 24 / 25，最后一条日志在发送前被研究预算拦住 | 24 / 24，最后一次真实尝试发生 fetch failed |
| AiCallLog 成功 / 失败 | 23 / 2 | 16 / 8 |
| 候选链终态 | stopped；六 Stage 有返回，只有前五次重读 | 五 Stage 全部生成及重读，有 final |
| 各 Stage 已取得有效模型知识报告 | 1–5；其中 Stage 3 对任务缺口给 uncertain，Stage 6 未完成 | 仅 Stage 3；其余四个 Stage 未完成 |
| 本次独立内容审读 | 主表、方向、迁移表、公式计算正确；自述归因错误、具体迁移提示缺交集及若干需澄清处 | 主表、方向、静态基准比较、选学公式有具体支持；不能由此补算模型审查成功 |
| 选学承诺 | 实际任务与显式依赖中保留 | 实际任务与显式依赖中保留 |
| 正式地图/学习效果 | 未确认；没有真实学习者数据 | 未确认；没有真实学习者数据 |

统计由另一名代理只读复核。为了不把网络失败当作免费调用，usage 只合计实际返回值：非推理 24/24 次有 usage，归一后的 input=467,341、output=55,053、total=522,394；推理 23/24 次有 usage，input=1,047,397、output=239,747、total=1,287,144，第 24 次未知。归一仅把 `/responses` 的 input/output 与 chat 的 prompt/completion 对齐，reasoning 已包含在 output 内，不能重复加总。非推理运行的 `/responses` 研究调用也返回了 2,302 reasoning token，因此不能说该运行所有调用“推理 token 为零”。这不是货币费用估计，也不是相同候选、相同长度任务的 token 效率比较。

本轮直接暴露的是两种不同的后续问题：可执行任务的输入缺口即使已被知识核对器识别，也未必进入可应用更正；长上下文的自动评审即使改用推理模式和生产预算，也可能拿不到完整报告。它们分别需要任务可执行性处理和报告可用性证据，不能用更强模型的总体 `passed` 取代。

两条路线各运行一次、实际候选与来源不同，且 `/responses` 课程研究请求未编码相同推理开关；不能把候选差异或完成状态全归因为推理模式。既不报告模式准确率，也不因静态内容正确推断长期保持、无辅助迁移或真实学习进步。
