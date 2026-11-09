# 规划知识核对跨题诊断：24 次首次报告及完整更正审读

记录日期：2026-10-28。实验目录：[planning-transfer-2026-10-28-1793181396960](../../web/test-results/planning-transfer-2026-10-28-1793181396960)。本报告只读既有产物；没有重跑模型、修改病例标签或补写失败答案。

本轮六组相邻正确/错误文本中，非推理模式完成了 5/6 错例的有效更正，并原样保留 6/6 正例；另一个错例返回了内部矛盾且缺字段的报告。推理模式完成了 6/6 错例的有效更正，并原样保留 5/6 正例；另一个正例在实验的 10,000 token 预算内未返回最终答案。两臂各有 11/12 份可用报告，不能把仅可用报告上的标签一致写成全部调用成功，也不能据此证明长期稳定性或教学效果。

逐份审读 11 个实际更正后的完整教学字段，没有发现新增的确定性知识错误，原目标和限定范围得到保留。然而，部分核对理由存在解释过强或统计口径错位；正确总判定不等于每条论证都可靠。

## 输入、调用与适用边界

脚本：[planning-transfer-experiment.test.ts](../../web/scripts/research/planning-transfer-experiment.test.ts)。冻结依据：[manifest.json](../../web/test-results/planning-transfer-2026-10-28-1793181396960/manifest.json)、[病例](../../web/test-results/planning-transfer-2026-10-28-1793181396960/cases-frozen.json)、[输入](../../web/test-results/planning-transfer-2026-10-28-1793181396960/inputs.json)、[不透明保存的 oracle](../../web/test-results/planning-transfer-2026-10-28-1793181396960/oracle-frozen-opaque.json)。

- 12 例、6 对；每对的领域和目标完全相同，只改变一个实质条件或推断。数学、JavaScript 程序语义、观察与因果/汇总统计各占两对。病例在此前反馈提示调整之后新建，但仍是研究者设计的开发诊断集，不是独立抽样的盲测题库或真实学习者数据。
- 每例非推理、推理模式各首次调用一次，顺序按病例交替；共 24 次。每次恰好一个实际 transport 请求，无重试、报告修复或更正后再核对。标签、推导与可接受更正保存在 oracle，未进入模型提示。
- 使用实际 `buildPlanningKnowledgePrompt`、报告验证器、`applyPlanningKnowledgeCorrections` 和 Provider；候选是最小包裹，唯一可改教学字段为 `stages[0].modules[0].items[0].concept.learningUnit.newKnowledge`。材料列表为空；领域与目标只读。它不是完整路线生成服务，也没有完整课程结构验收、正式地图写入或学习者试用。
- 12 对实际请求体删除 `thinking` 后逐字一致，system/user 提示与冻结输入一致；各独立调用文件与 `summary.records` 对象一致。配置请求模型为 `deepseek-v4-flash`，24 份服务端响应的模型名均为 `deepseek-flash`，保留这一区别。
- 两模式请求温度均为 0.25；推理模式忽略 temperature，不能宣称有效采样参数完全相同。这是服务支持的两种执行模式比较。[DeepSeek 推理模式文档](https://api-docs.deepseek.com/guides/thinking_mode/)
- 本实验实际上限为 10,000 token、120,000 ms。核对当日生产 `planning_knowledge_check` 配置是 12,000 token、180,000 ms；本次耗尽不证明生产预算必失败，也不证明多给 2,000 token 就会成功。

冻结病例 SHA-256：`30d8d2a30b295fdab2a07bbbd49a54b56b6f3f307f5e3b7182702f7a5804610a`。

冻结、由根代理审读的 oracle SHA-256：`4d5ffd4829a3c326cdff9ee9c196f9947c7ae602473dc0ee63c96abd6a89a196`。完整模块指纹见 manifest。

## 全部病例结果

“保留”表示有效报告为 `no_error_found`，实际候选逐字未改；“更正”表示有效报告为 `confirmed_error`，应用后的完整文本经本次独立推导核查。下表保留全部调用，链接直接指向各自原始报告与响应。

| 病例及独立依据 | 非推理模式 | 推理模式 | 更正/保留的语义检查 |
|---|---|---|---|
| pt-01 错：任意实数的平方相等不等价于原数相等，反例 1 与 −1 | [更正，1 finding](../../web/test-results/planning-transfer-2026-10-28-1793181396960/00-pt-01-direct.json) | [更正，2 findings](../../web/test-results/planning-transfer-2026-10-28-1793181396960/01-pt-01-thinking.json) | 两者都保留任意实数域，恢复为绝对值相等/互为正负的等价关系；没有只保留单向关系而丢掉目标。额外任务澄清见下文。 |
| pt-02 对：增加两数均非负的条件，平方相等与原数相等等价 | [保留](../../web/test-results/planning-transfer-2026-10-28-1793181396960/03-pt-02-direct.json) | [保留](../../web/test-results/planning-transfer-2026-10-28-1793181396960/02-pt-02-thinking.json) | 零值和正值均被证明覆盖。非推理审查中“条件必要性”的措辞需限定解释。 |
| pt-03 对：计算任意二阶实矩阵行列式不必先求逆 | [保留](../../web/test-results/planning-transfer-2026-10-28-1793181396960/04-pt-03-direct.json) | [保留](../../web/test-results/planning-transfer-2026-10-28-1793181396960/05-pt-03-thinking.json) | 给定定义 `ad−bc` 可直接计算；“必需”已明确为计算操作而非教学偏好。 |
| pt-04 错：声称求逆是计算上述行列式的必要操作 | [更正](../../web/test-results/planning-transfer-2026-10-28-1793181396960/07-pt-04-direct.json) | [更正](../../web/test-results/planning-transfer-2026-10-28-1793181396960/06-pt-04-thinking.json) | 改为不必先求逆，保留任意二阶实矩阵范围。给定奇异矩阵行列式为 0，虽不可逆仍可计算。 |
| pt-05 错：循环遇到 `i===2` 执行 `continue` 后，把最终 total 写成 1 | [更正](../../web/test-results/planning-transfer-2026-10-28-1793181396960/08-pt-05-direct.json) | [更正](../../web/test-results/planning-transfer-2026-10-28-1793181396960/09-pt-05-thinking.json) | 都改成 8，追踪 1、跳过 2、加 3、加 4；给定程序未被改写。 |
| pt-06 对：同一循环最终 total 为 8 | [保留](../../web/test-results/planning-transfer-2026-10-28-1793181396960/11-pt-06-direct.json) | [保留](../../web/test-results/planning-transfer-2026-10-28-1793181396960/10-pt-06-thinking.json) | 都按 `continue` 的本轮跳过语义核实。 |
| pt-07 对：普通内建 `Promise.all([first,second])` 在都成功时，结果依输入顺序为 `["A","B"]` | [保留](../../web/test-results/planning-transfer-2026-10-28-1793181396960/12-pt-07-direct.json) | [保留](../../web/test-results/planning-transfer-2026-10-28-1793181396960/13-pt-07-thinking.json) | 第二个 Promise 更早兑现不改变结果索引。 |
| pt-08 错：把同一程序结果按兑现先后写成 `["B","A"]` | [合同失败](../../web/test-results/planning-transfer-2026-10-28-1793181396960/15-pt-08-direct.json) | [更正](../../web/test-results/planning-transfer-2026-10-28-1793181396960/14-pt-08-thinking.json) | 推理模式改为 `["A","B"]` 并保留原代码。非推理报告有 claims、缺 findings，且总体判定与自身推导冲突，不能算成功检出。 |
| pt-09 对：自选提醒组 18/20 存活、非提醒组 10/20 存活，尚不足以证明提醒的因果效果 | [保留](../../web/test-results/planning-transfer-2026-10-28-1793181396960/16-pt-09-direct.json) | [保留](../../web/test-results/planning-transfer-2026-10-28-1793181396960/17-pt-09-thinking.json) | 保留 90%/50% 描述差异，不把未识别因果改说成已证明没有效果。 |
| pt-10 错：用同一观察表断言已经证明提醒使存活率提高 | [更正](../../web/test-results/planning-transfer-2026-10-28-1793181396960/19-pt-10-direct.json) | [更正](../../web/test-results/planning-transfer-2026-10-28-1793181396960/18-pt-10-thinking.json) | 改为只能支持观察差异、不能单凭此表定因果；经验或初始状况的零效果反模型与表相容。原人数及任务保留。 |
| pt-11 错：简单/复杂两层 A 都更高，便保证合并后 A 更高 | [更正](../../web/test-results/planning-transfer-2026-10-28-1793181396960/20-pt-11-direct.json) | [更正](../../web/test-results/planning-transfer-2026-10-28-1793181396960/21-pt-11-thinking.json) | 改为不保证；具体 A=29/110、B=81/110，原分层数据与描述统计范围保留。 |
| pt-12 对：同一分层结果不保证合并后仍同向 | [保留](../../web/test-results/planning-transfer-2026-10-28-1793181396960/23-pt-12-direct.json) | [预算耗尽，无最终答案](../../web/test-results/planning-transfer-2026-10-28-1793181396960/22-pt-12-thinking.json) | 非推理总判定正确，但一条任务依据使用了不对应 A/B 比较的合并权重。推理失败不能记成误判或正确保留。 |

## 完整报告与更正中值得保留的问题

**pt-01 推理模式没有因两条 finding 而越改成另一个教学目标。** 第一条将核心句改为“a²=b² 等价于 |a|=|b|，即 a=b 或 a=−b”，并区分 `a=b` 的正向与原数相等的反向；第二条把任务改为正向证明、反向反例及条件检查。整个改动仍位于同一个教学字段，目标、领域和任意实数范围保留。它不是删去等价关系来躲避问题。

不过，第二条把原任务“分别写出两个推理方向的理由”也标为确定错误，需要克制解释。原句也可以指检验两个方向、以反例说明某方向不成立，非推理报告采用了这个合理读法。因此，本例是一处确定错误及依赖它的任务澄清；不能把两条 finding 计成两个独立、有唯一标签的知识错误。实际改后的任务正确且可执行。

**pt-08 非推理失败同时涉及报告结构和语义自相矛盾。** 原 JSON 有 `claims` 数组，缺少必需的 `findings`，因此验证器拒绝；通用报错提到两个数组，不意味着两者都缺失。原 summary 和第一条 claim 的 `verdict` 判为 `no_error_found`，但其 `basis.reason` 后半段又正确根据输入索引推出 `["A","B"]`，指出原 `["B","A"]` 不一致。不能说“模型已正确判断，只差格式”，也不能把被合同挡住的结果写成系统已经错误放行。原始响应完整保留，未补 findings 或自动重跑。

**pt-12 非推理审查的一个论据混淆了汇总口径。** 其任务依据列出简单、复杂各 `110/220=50%`；这个数对 A、B 合起来的总样本池成立，却不是解释两个柜台各自总体率所需的组内权重。当前比较应使用 A 的 `10/110` 与 `100/110`、B 的 `100/110` 与 `10/110`。原总判定和另一条主张中的 `29/110`、`81/110` 正确，且候选未改；这里是支持理由的口径错位，不是 50% 本身算错，也不是候选修坏。

**pt-02 非推理报告的“非负条件确实必要”不宜不加限定照抄。** 反例 1 与 −1 证明不能直接把非负域放宽到任意实数而保留原普遍等价式；它不能证明非负是唯一可行或个例成立的必要条件，两数均非正也可成立。原候选只陈述充分限定下的正确等价关系，保留它是正确的。这里记录措辞的解释风险，不把研究者选择的最强读法当成新的唯一错误标签。

11 份实际更正均仅改变允许的教学字段，目标、稳定 key、显式前置数组等外围数据未变。逐份检查未发现新增的确定性错误或通过缩小原目标来虚假修复。非推理 pt-10、pt-11 留下连续两个句号 `。。`，pt-10 还重复一遍观察比例；这是可读性瑕疵，原始产物不修改。上述检查是本次 AI 协作语义审读，不是独立人类学科认证，也不冒称更正又经过生产复核循环或完整课程验收。

## 调用可用性、推理模式及成本记录

统计包括失败调用。证据：[summary.json](../../web/test-results/planning-transfer-2026-10-28-1793181396960/summary.json)、各逐调用文件、[cleanup.json](../../web/test-results/planning-transfer-2026-10-28-1793181396960/cleanup.json)。另一名代理独立核对逐调用对象、请求及汇总数字一致。

| 项目 | 非推理 | 推理 |
|---|---:|---:|
| 总调用 | 12 | 12 |
| 完成且合同有效 | 11 | 11 |
| 合同失败 | 1：pt-08 | 0 |
| 预算耗尽、没有最终答案 | 0 | 1：pt-12 |
| 错例有效检出并正确更正 / 全部错例 | 5/6 | 6/6 |
| 正例有效审查且原样保留 / 全部正例 | 6/6 | 5/6 |
| 有效报告中 `confirmed_error` / `no_error_found` | 5 / 6 | 6 / 5 |
| 原始响应非空 `reasoning_content` | 0/12 | 12/12 |
| `finish_reason=stop` / `length` | 12 / 0 | 11 / 1 |
| 总耗时 | 91.773 秒 | 475.547 秒 |
| 平均耗时 | 7.648 秒 | 39.629 秒 |
| 中位耗时 | 7.1095 秒 | 39.7555 秒 |
| 最短—最长耗时 | 5.758—10.462 秒 | 14.935—69.481 秒 |
| prompt tokens | 29,760 | 30,060 |
| completion tokens | 14,856 | 77,982 |
| total tokens | 44,616 | 108,042 |
| prompt cache hit / miss tokens | 18,048 / 11,712 | 18,176 / 11,884 |
| 报告的 reasoning tokens | 12 份均缺该字段 | 62,575，12 份均有 |

原始响应能确认模式确有差异：推理臂 12 次均有非空推理内容，非推理臂均没有。失败的 pt-12 缺少顶层 `reasoningReturned` 便捷字段，不能把字段缺失误算为模式未生效；其原始响应有推理内容、`reasoning_tokens=10000`、`completion_tokens=10000`、`finish_reason=length`，最终 assistant 正文为空。适配器报错为 `AI response exhausted max_tokens during reasoning before final answer.`，不是网络超时。

两臂总计 152,658 token。reasoning 是 completion 的子项，不能再次累加；`cached_tokens` 与 cache hit 也是同一缓存量的不同字段。非推理没有返回 reasoning token 数，不能称作实测为 0。不同缓存命中、模式的采样行为和单次调用波动都在，本文不推算货币费用或把耗时差归为纯推理计算的因果估计。

## 对下一步的含义

这组结果支持一个有限判断：在输入条件齐全、命题可由短推导或有限反例判真的规划知识文本上，现有核对合同能产出有用的定点更正；推理模式在本轮补上了一个非推理失败，但也出现了一个预算内无答案。合同阻断与保留失败原文是评价闭环的一部分，不应为了得到成功率而把未完成报告重新解释成正确。

这里没有测完整路线的覆盖、真实前置、活动衔接或学习负荷，也不能评估“这种顺序更适合初学者”等教学偏好。最小包裹的空前置数组不是已经检验过完整 DAG；无需逆矩阵的数学反例也不意味着所有前置建议都能按真假二分。应结合另行冻结的 [完整路线评价依据](../../web/scripts/research/route-quality-oracle.json) 审读实际路线，再把知识真假、范围/选学承诺、前置依据、任务可执行性与教学偏好分别记录。

每例每模式只有一次调用，题目自包含、错误较集中，不能据 24 次结果估计重试收敛概率、普遍准确率或复杂课程质量，更不能推断真实学习收益。新的独立病例、服务级证据和实际学习观察仍有不同的待验证问题。
