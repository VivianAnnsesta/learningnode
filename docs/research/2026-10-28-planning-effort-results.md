# 同一规划文本的 direct / low / high 诊断对照

日期：2026-10-28。原始目录：[planning-effort-2026-10-28-1793187394721](../../web/test-results/planning-effort-2026-10-28-1793187394721)。本报告独立审读全部 9 份已完成单次记录、报告主张与理由、保存的候选及失败正文；没有重跑模型、补写截断报告或修改原产物。

**本轮只能说明这些固定输入上的报告可用性和局部核对内容。** direct 有 2/3 份合同可用报告，low 为 1/3，high 为 2/3；这不是知识准确率。五份可用报告均未提出更正，其可复算的计数、条件方向及公式对应判断成立，保存的 `correctedDraft` 均与各自原候选相同。另三次输出预算截断、一次合同不一致完整保留。没有观察到实际修复，因此不能声称某模式更擅长修复，或已恢复完整生产闭环。

## 冻结输入与实验边界

证据：[脚本](../../web/scripts/research/planning-effort-experiment.test.ts)、[预检](../../web/test-results/planning-effort-preflight-2026-10-28.json)、[manifest](../../web/test-results/planning-effort-2026-10-28-1793187394721/manifest.json)、[inputs](../../web/test-results/planning-effort-2026-10-28-1793187394721/inputs.json)。选择来自原有限筛查 thinking 运行的三条真实请求：

| 病例 | 原请求和原候选 | 本轮模式顺序 | 选择理由 |
|---|---|---|---|
| skeleton-control | 第 6 请求，planning 的 `response.skeleton` | direct → low → high | 原来获得有效报告的骨架控制 |
| stage2-empty-final | 第 13 请求，Stage 2 的 `response.draft`，优先核对 `stages[1]` | low → high → direct | 原来 12000 token 全部用于推理，无最终正文 |
| stage3-truncated-final | 第 16 请求，Stage 3 的 `response.draft`，优先核对 `stages[2]` | high → direct → low | 原来在 12000 token 预算内返回截断正文 |

这是观察失败后选择的诊断病例，三次模式对照各只运行一次，未用于估计任意领域或生产总体成功率。三个候选来自同一条路线，不能视为相互独立的教学主题。原路线完整内容的审读见 [有限筛查路线报告](2026-10-28-finite-route-results.md)，有限计算依据见事先冻结的 [oracle](../../web/scripts/research/route-quality-oracle.json)。尤其不能把另一条 **direct 路线** 的 300/30/60 缺交集迁移题当成本轮 thinking 路线输入中的漏检错误。

逐份复核结果：9 份独立 JSON 与 `summary.results` 对应对象完全一致；每份实际 `requestBody` 删除 `thinking`、`reasoning_effort` 后，与该病例归档请求的序列化正文逐字相同；归档 system/user 消息未改，用户消息 SHA-256 与保存的 `promptHash` 均一致。模型请求名为 `deepseek-v4-flash`，`max_tokens=12000`、超时 180000 ms、请求温度 0.25；每条只有一次实际请求，总计 9 次，无报告重试、无更正后复核，也没有走整个服务修复循环。这里 12000 是本次沿用的原生产核对预算，不是前轮迁移实验的 10000。

实际请求中 direct 为 `thinking.type=disabled`，low/high 均为 `enabled`，并分别带 `reasoning_effort=low/high`。官方文档列出 low/high/max，默认 high；同时明确思考模式忽略 temperature。因此可以说同一请求温度，不能说三臂的有效采样参数完全相同。[DeepSeek Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/)

## 九次调用全部结果

下表“完整可用”指报告通过当前合同并可交给直接应用函数；不表示已完成整阶段知识核验。正文字符数按归档 JavaScript 字符串 `length` 计。

| 记录 | 合同及终止情况 | 正文字符 | completion / reasoning tokens | 耗时 ms |
|---|---|---:|---:|---:|
| [01 骨架 direct](../../web/test-results/planning-effort-2026-10-28-1793187394721/01-skeleton-control-direct.json) | 完整可用；stop；11 项 claim，无 finding | 7533 | 3550 / 未返回该细项 | 22092 |
| [02 骨架 low](../../web/test-results/planning-effort-2026-10-28-1793187394721/02-skeleton-control-low.json) | length，JSON 截断，未进入合同核验/应用 | 5093 | 12000 / 9585 | 67276 |
| [03 骨架 high](../../web/test-results/planning-effort-2026-10-28-1793187394721/03-skeleton-control-high.json) | 完整可用；stop；12 项 claim，无 finding | 8033 | 10010 / 6129 | 50657 |
| [04 Stage 2 low](../../web/test-results/planning-effort-2026-10-28-1793187394721/04-stage2-empty-final-low.json) | 完整可用；stop；11 项 claim，无 finding | 6743 | 11656 / 8543 | 60380 |
| [05 Stage 2 high](../../web/test-results/planning-effort-2026-10-28-1793187394721/05-stage2-empty-final-high.json) | length，仅返回 summary 开头 | 144 | 12000 / 11914 | 73133 |
| [06 Stage 2 direct](../../web/test-results/planning-effort-2026-10-28-1793187394721/06-stage2-empty-final-direct.json) | stop、JSON 完整，但三项 claim 的依据/判断组合违反合同；不应用 | 8051 | 3830 / 未返回该细项 | 20445 |
| [07 Stage 3 high](../../web/test-results/planning-effort-2026-10-28-1793187394721/07-stage3-truncated-final-high.json) | 完整可用；stop；11 项 claim，无 finding | 8291 | 8959 / 4783 | 48234 |
| [08 Stage 3 direct](../../web/test-results/planning-effort-2026-10-28-1793187394721/08-stage3-truncated-final-direct.json) | 完整可用；stop；12 项 claim，无 finding | 7176 | 3342 / 未返回该细项 | 19316 |
| [09 Stage 3 low](../../web/test-results/planning-effort-2026-10-28-1793187394721/09-stage3-truncated-final-low.json) | length，JSON 截断，未进入合同核验/应用 | 4601 | 11999 / 9674 | 67234 |

九次均为 HTTP 200，无超时、网络失败或自动重试。三个截断记录都已有少量或部分最终正文，不能描述成“全无最终答案”；09 的 usage 为 11999 而非 12000，但实际 `finish_reason=length`，不能改记成功。各 partial 文本开头的“未发现错误”“findings 为空”不等于完整报告，不能据此补齐尾部或计为有效审查。

## 主张、理由与实际更正的语义审读

### 骨架控制：01 与 03

01 的 11 条和 03 的 12 条可用 claim 都与所给四格表相容：四格 16、4、36、144；合计 20、180、52、148、200；两个方向分别为 16/52=4/13≈30.8% 和 16/20=4/5=80%；总体缺陷 20/200=10%，未标记组缺陷 4/148≈2.7%。乘法对应 `(52/200)(16/52)=16/200` 与贝叶斯对应 `(16/20)(20/200)/(52/200)=16/52` 也成立。这里是在明确非空条件组上的有限比例，没有把方向交换说成普遍相等或互为倒数。

选学 claim 的边界有实际结构支持：`learningGoals[1].contentQuestions[0].importance=optional`，五个 Stage 的 `prerequisiteStageKeys` 均未引用选学 Stage `s-optional-formula`；主线目标不需要代数推导。03 的 `table-first-order-rationale` 与 `two-direction-order-choice` 还核对原文明确将顺序称作教学选择、否认逻辑上唯一必要。它们支持“没有把本安排写成数学必需”，不证明这种顺序确实降低认知负荷或学习效果最优。

来源关系也须限定：归档 OpenStax 片段 `…-32` 是另一张 755 人表的行列加总例子，`…-98` 是按交通违章条件缩减样本空间的短句；它们不包含本课 200 件的具体计数。报告把具体数字主要交给输入正文与独立算术复核，未将 OpenStax 当作这张构造表的实测证明。01 的 `audit-optional-boundary` 与 03 的 `optional-formula-boundary` 只核对已保存的选学范围/依赖关系，不认证未来课堂执行。

03 的 limitations 比 01 更明确地区分已列 12 条与未逐查的 coreTopics、problem、模块文字和副本。01 虽列出较广字段范围，独立可确认的逐项证据仍只是其 11 个 claim；不能据摘要扩大到整个骨架。两份均无 finding，实际候选完全未变。

02 low 的部分正文中已完整出现的计数及条件比例推导大体可复算，但它在乘法规则条目中途结束，缺少完整合同。其 `audit-direction-interpretation.basis.reason` 有“要保证……需 P(有缺陷|已被标记)=16/52≈30.8%”的不严谨措辞：若按字面将 30.8% 当保证条件便不成立；该句后文又用 36 件无缺陷正确否定保证，更像省略了“检查该条件概率”的表达。这是保留的局部措辞风险，不据此把整个未完成报告硬判成确定数学错误，更不能补写其未输出条目。

### Stage 2：04 可用，05 截断，06 合同失败

04 的本阶段主张实际核对 `stages[1].modules[0].items[0]` 的 newKnowledge、example、prerequisite、commonMistake、teachingTasks[3] 和 scope，六项均与当前文本一致。其 `c3-prerequisite-counts.applicability` 特别区分“需要取得 16 和 52”与“逻辑上必须先完成前一节点”：当前例子已重述数据，原前置也提供回看路径，因此没有把教学支持路径误判为唯一数学条件。`c5-stage1-reverse-scope` 认可本阶段仅把 16/20 作分母对照，完整反向计算留后续，未误报范围冲突。

覆盖仍不充分：04 另外五项用于 `stages[0]` 的旧例子和 `stages[2..4]` 的待教蓝图/公式，虽然这些算术正确，却占用 11 条中的 5 条，不能抵充本阶段未单列的 transferPrompt、全部 assumedKnowledge、引用职责等。它的 limitations 主要列远期/副本未覆盖，对当前节点具体缺口交代较少。此处记为局部覆盖不足；没有证据把未选到的字段一律判错，也不因本轮可用就称 Stage 2 已全面核验。

06 的 12 条已解析 claim 中，数字与条件方向仍正确；真正触发拒绝的是 `parsedReport.claims[4..6]`，三个键分别为 `s1-assumedknowledge-fractions`、`s1-assumedknowledge-sets`、`s1-assumedknowledge-arithmetic`。它们把 `basis.kind=unverified` 与 `verdict=no_error_found` 同时提交，当前合同明确禁止，错误原文是“未核对主张只能记录 uncertain，不能伪造来源支持或核对成功。”

**这个合同失败不等于模型把能力认定为已掌握。** 三条 conclusion 实际说的是“课程将其标为自述基础/入口假设”，reason 也明确“未冒充已测验”“掌握程度未验证”。标签是否忠实于课程与研究者输入，可通过文本比对判断；学习者实际能力则没有测验。这份报告混用了两种被核对对象的依据标签，不能进入现合同，但未发现它实际伪造了掌握结论。不能为了统计而把这三条自动改成数学错误，也不能自动替它改标签后记作成功。

05 high 只输出 144 字的 summary 开头，11914 个 reasoning tokens 已消耗在 12000 的输出预算内；没有完整 claim 可审，不能从开头“未发现可确认错误”推得本次完成核对。

### Stage 3：07 与 08 可用，09 截断

07 与 08 都实际核对两个新节点的 newKnowledge、example、误读/误答、前置和若干 teachingTasks。对 16/20 与 16/52 的反向关系、分母位置、将“80%”错套到被标记者缺陷比例的纠正，主张与理由均可直接复算。07 的 `s2-m0-prerequisite-reading` 还检查本节点实际任务含有与 16/52 的对照，因此理解 52 的角色是本任务所用背景；这不证明任何计算 16/20 的人都必须走相同节点顺序。

08 的 `s2-m0-transfer-prompt` 实际引用“阳性/阴性×患病/未患病”变式，任务只要求判断两个方向各用哪组总数作分母，并明确不下医学结论。其题目没有要求算具体数值，所以无需凭空补某个交集；该条 `no_error_found` 与当前任务相容。这里没有进行医学效果判断。

07 明确把 transferPrompt、objective、references、contentContributions、problemRole 等列为未逐句复核；08 虽多核对了 transferPrompt、objective 与阶段 goal，其 12 条也不构成整个 Stage 所有字段的证据。二者都没有误把选学公式提升为本阶段必修，没有提出实际更正。09 的部分正文前五条也有同样正确的计数和前置区分，但在第六条中途截断，保持失败原貌，不将这些部分判断升级为合同可用。

五份有效报告总共 57 条 claim，存在大量相同知识的重复，不能当作 57 个独立测试。对它们逐项审读未定位到确定的计算误判或错误更正；这只陈述已检查主张的结果，不把没有 finding 当成全覆盖。五份 `correctedDraft` 与 `inputs` 对应 draft 的 JSON 序列化完全一致，故“没有引入更正错误”的实际含义是本轮根本没有修改候选，不是验证了修复能力。

## 推理、用量及时间

原始 usage 全部来自 9 份响应，不按未报告值补零。reasoning tokens 是 completion 的细项，缓存命中也与 `prompt_tokens_details.cached_tokens` 重复，均不得再累加到 total。

| 模式 | 合同可用/调用 | input tokens | completion tokens | total tokens | 已返回 reasoning tokens | cache hit / miss | 平均耗时 ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| direct | 2/3 | 113053 | 10722 | 123775 | 3 次均未返回此细项 | 4608 / 108445 | 20617.67 |
| low | 1/3 | 113128 | 35655 | 148783 | 27802 | 512 / 112616 | 64963.33 |
| high | 2/3 | 113128 | 30969 | 144097 | 22826 | 112512 / 616 | 57341.33 |

合计 input 339309、completion 77346、total 416655；可见 reasoning 50628（仅六次思考响应提供该细项）；九次耗时相加 428767 ms。direct 三次都没有 `reasoning_content` 字段；low/high 六次都有非空字段，证明本轮不是只改了界面标签。它不能独立证明服务商内部具体推理算法或每次投入量严格遵循单调关系。

low 本轮累计 reasoning 和 completion 比 high 更多，并发生两次截断；high 一次截断。由此至少不能假定 low 必然更短、更多可用。另一方面，高模式的 prompt 缓存几乎全命中，而 low/direct 大多未命中，执行先后也只按三病例轮换，未重复随机化；不能将平均延迟或费用差完全归因于 effort，也不据 token 简单倍数估算实际金额。同病例 thinking 的 prompt_tokens 比 direct 高 25，虽然保存的 system/user 正文完全相同。

## 可支持的结论

在保留原真实输入和生产输出预算的条件下，原失败输入有时可得到完整报告：Stage 2 此次 low 可用，Stage 3 此次 high 与 direct 可用；骨架控制此前可用，本次 low 却截断。因此输出可用性不只是“这个题目能不能推理”的固定属性，也不是把参数切到 low 就能保证的结果。

这轮未显示确定数学误判或有害更正，但存在完整报告的依据标签冲突、有限 claim 预算被旧/未来内容占用，以及推理占用输出预算后报告不完整三种不同问题。它们需要分别观察；不能用“全都写未发现错误”统一记质量成功。

归档 [summary](../../web/test-results/planning-effort-2026-10-28-1793187394721/summary.json) 为 `completed=true`、`requests=9`、`stopped=null`；[cleanup](../../web/test-results/planning-effort-2026-10-28-1793187394721/cleanup.json) 确认临时设置已删除、原设置未变，脚本没有访问产品数据库。本轮没有正式地图确认、真实学习者活动或长期学习结果证据，也未自动修改产品默认模式。
