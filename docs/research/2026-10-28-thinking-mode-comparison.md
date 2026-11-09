# 完整反馈核对：推理与非推理模式的冻结输入对照

日期：2026-10-28。独立审读已经结束的 20 次调用；本次审读没有再调用模型、改动标签或业务代码，也没有使用产品数据库。结论依据首份报告、逐字段 finding、完整 replacement 及运行记录，不把审查模型的 verdict 当作真值。

本组开发样例中，推理模式对 6 次明确字段注入均给出了合同可用、且只改目标字段的修复；非推理模式的 6 份原始报告也都找到了注入错误，但其中一次生成非法动作，被合同拒绝，其余部分报告额外提出了不成立的指控。两个解释敏感控制中，两种模式的判定完全分开；其中有可核验的误读，也有教学措辞的不同解读，不能统一计成无歧义正确率。推理模式平均调用耗时约为非推理模式的 6.63 倍。这支持进一步检验推理模式是否能减少过度纠错，尚不证明稳定可靠，更不证明学习效果。

## 1. 实验实际比较了什么

原始入口：[实验脚本](../../web/scripts/research/thinking-mode-comparison.test.ts)、[本轮 manifest](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/manifest.json)、[逐次记录汇总](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/summary.json)、[冻结提示](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/prompts.json)。

- 从先前完整反馈实验的冻结 manifest 读取 5 个样例，各运行两个重复，每个重复各一次 direct/thinking，共 20 次。模式顺序在样例及重复内交替，调用串行；没有随机抽取样例、自动重试、替换后的再核对或学习者试验。
- 配置模型为 `deepseek-v4-flash`，20 份服务端响应的 `model` 均为 `deepseek-flash`。报告保留这一区别，不据此推断未记录的后端版本。
- 同一样例四次调用的完整用户提示及其 SHA-256 完全相同；系统提示、`response_format=json_object`、请求上限 10,000 tokens、超时 120,000 ms 相同。每次只请求一份首报告。
- 三个明确注入样例与 `unchanged-correct` 的输入相比，分别只改 `reply.verdict`、`reply.observation`、`reply.uncertainty`；context、actionContext、sources 均相同。这是基于原模型反馈的单字段扰动，原反馈本身仍含解释敏感措辞，并非人工证明所有其他句子无瑕疵。
- `expectedFirst` 保存在实验记录中，不进入提示。原标签未修改；控制名称中的 `correct` 不能替代独立判据。
- 两模式的**请求温度**均为 0.25。但官方文档说明推理模式忽略 temperature；本实验比较两个受支持的运行模式，不能称有效采样参数相同的纯推理开关实验。服务端返回 `reasoning_content` 可用于确认响应形式差异，不能据此证明其内部推导正确。[DeepSeek Thinking Mode 官方文档](https://api-docs.deepseek.com/guides/thinking_mode/)
- 源 manifest SHA-256：`d4318e7b04bcb95d78ec0a30ba354d69b7ef901a7d09798782826421a6497e7d`；冻结提示模块 SHA-256：`c66dfffd0bec48187331f4934d4a604bce4b462b44c491a54f0e2bcd5f4d6e97`。结果只覆盖该冻结输入及模块，不自动覆盖后续代码修改。

[清理记录](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/cleanup.json)记载原设置哈希未变、临时设置已删除、未使用产品数据库。20 个独立 record 文件与 summary.records 的对应内容一致；保存的提示哈希重新计算后均一致。

## 2. 有直接依据的三类注入

原题固定为 `F(t)=1 (t≠0), F(0)=2, g(x)≡0`。因此每个 x 都有 `F(g(x))=2`，极限也是 2。用户原话明确给出这一推导并质疑错误参考“1”；记录的 `assistanceAtSubmission=0` 只表示未记录帮助，不证明没有接受系统外帮助。

| 注入 | 独立判据 | direct：原始报告定位 / 合同可用修复 | thinking：原始报告定位 / 合同可用修复 |
| --- | --- | --- | --- |
| 仅 verdict 改成 needs_work | 当前回答及推导正确，且正文、观察均承认正确 | 2/2；1/2 | 2/2；2/2 |
| 仅 observation 改成用户坚持极限为 1 | 与用户逐字原话相反 | 2/2；2/2 | 2/2；2/2 |
| 仅 uncertainty 改成保存了 assistance=2 | 与冻结记录的数值 0 相反 | 2/2；2/2 | 2/2；2/2 |
| 合计 | 只针对所注入字段 | 6/6；5/6 | 6/6；6/6 |

这里“合同可用修复”同时要求报告通过验证、目标字段已修正，并逐项核对实际替换值；它不是整份报告每一条理由都正确。两个模式都没有漏报这 6 次显式注入，所以本组不能证明推理模式提高了显式错误发现率；观察到的差异主要是修复可执行性及附加指控。

thinking 的 6 个 replacement 均只改变注入字段，保留正确正文、题设、活动答案和可选属性。direct 的可用修复中，编号 06、11 额外指控 action，依据不足；08 只是把 action.reason 的“你”改成“用户”，不应把这种无害改写计作新知识错误。direct 只有 13、14 两份替换在字段差异上严格局限于目标字段，但“非最小修改”不等于“修复失败”。

编号 05 的原始报告确实识别并纠正了 verdict，却把 `action.type` 写成系统不支持的 `finish`，最终记录为 `contract_error: 教学动作无效。`。不能把这次排除后只报成功，也不能把它说成模型没有发现原错误。

## 3. 两个控制：解释差异与可证误读分别记录

### unchanged-correct

该控制保留真实初稿，其中“只有当……才能用外层极限替换”可以被理解为法则适用条件，也可能被读成所有具体等式的必要条件；不宜以该控制标签直接证明全文无误。两个 thinking 报告均未指控错误。两个 direct 报告均指控错误，但具体依据存在可查的问题：

- **00：误读已有条件。** 报告称 newActivity.explanation 缺少 `g(x)→t0`，但它逐字引用的 explanation 已含“当 x→x0 时 g(x)→t0”。其提出的 `g≡1` 在本题给定 F 下仍得到复合恒 1，不能否定本题对照答案；若要讨论一般法则，应另行限定命题。replacement 保留了被指控的原 explanation 核心条件，主要补写答案及正文，不能据此宣称修好了一个已证实缺失条件。
- **03：把质疑参考和正确作答错误地对立。** 报告认为用户是在质疑错误参考，因此不能说“你的判断已正确”。用户事实上已经给出本题正确计算；参考答案错误不妨碍回答正确。替换 action 的措辞仍可用，但修改理由不成立。

这两条有独立于控制标签的误读证据。其余潜在量词问题仍保留为解释敏感范围，不能因为审查模型放行便认为不存在。

### optional-activity-control

该控制保留开放问题的原候选：用户要求补充观察；observation 称“当前困难在于如何设计……”，action 建议换一个设计角度，newActivity.required=false。原题 requiredOutput=none，没有必须完成新增活动的承诺。

- **16：解释敏感。** direct 将“当前困难”理解为已确认能力缺陷，提出更谨慎的观察说明，并保留可选新活动。把“困难”改为“帮助请求”是可接受澄清；但原句也可理解为当前求助目标，不能把这一分歧算成有客观真值的错误检测。
- **19：教学取舍被提升为确认错误。** direct 认为原讨论足以回应，因此建议换角度不成立，并移除可选新活动。继续讨论当然可行，但这不能证明提供可选设计活动违反任务承诺；没有记录显示用户必须接受或原活动被覆盖。移除并非由已确认事实错误必然推出。
- **17、18：thinking 均保留候选。** 两份报告明确区分帮助目标、能力缺陷与可选任务；这与当前产品的可选活动边界相容。17 也指出“某广场”与此前 A/B 记录并置不够精确。保留不代表该教学建议已由真实学习结果验证。

冻结标签匹配数为 direct 0/4、thinking 4/4。它只描述两种模式与事先标签的关系，**不是控制真阴性率，也不能与明确注入样例混成总体准确率**。

## 4. 全部 20 次首报告及替换审读

表中编号对应原文件；r0/r1 是同一样例重复。“未发现新错”只指本次查验未见新增的明确题设、计算、用户归因或动作合同错误，仍不构成全面正确证明。没有任何替换在本实验内再次送模型核对或进入生产服务。

| 原记录 | 模式 | 首报告 / 合同状态 | replacement 的实际结果及局限 |
| --- | --- | --- | --- |
| [00 unchanged r0](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/00-unchanged-correct-direct-r0.json) | direct | confirmed_error / 可用 | 改 text、newActivity；“缺 g→t0”与引文矛盾。核心答案仍正确，量词歧义未解决。 |
| [01 unchanged r0](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/01-unchanged-correct-thinking-r0.json) | thinking | no_error_found / 可用 | 无替换；承认可选活动。 |
| [02 unchanged r1](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/02-unchanged-correct-thinking-r1.json) | thinking | no_error_found / 可用 | 无替换；没有声称实际学习有效。 |
| [03 unchanged r1](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/03-unchanged-correct-direct-r1.json) | direct | confirmed_error / 可用 | 只改 action；把正确质疑与正确作答对立，指控不成立；替换措辞未见新事实错误。 |
| [04 verdict r0](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/04-only-verdict-wrong-thinking-r0.json) | thinking | confirmed_error / 可用 | 仅 needs_work→correct；依据成立。 |
| [05 verdict r0](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/05-only-verdict-wrong-direct-r0.json) | direct | confirmed_error / **合同失败** | verdict 修对，但新增非法 finish 动作；又把可选建议理解成强制下一步。 |
| [06 verdict r1](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/06-only-verdict-wrong-direct-r1.json) | direct | confirmed_error / 可用 | verdict 修对，action 改为显式可选；原 action 并未明说基于 needs_work，附加指控不足。 |
| [07 verdict r1](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/07-only-verdict-wrong-thinking-r1.json) | thinking | confirmed_error / 可用 | 仅 needs_work→correct；依据成立。 |
| [08 observation r0](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/08-only-observation-wrong-direct-r0.json) | direct | confirmed_error / 可用 | 观察忠实恢复原话；另改 action 人称，未见新错。 |
| [09 observation r0](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/09-only-observation-wrong-thinking-r0.json) | thinking | confirmed_error / 可用 | 仅观察恢复为用户主张 2、质疑 1；依据成立。 |
| [10 observation r1](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/10-only-observation-wrong-thinking-r1.json) | thinking | confirmed_error / 可用 | 仅观察修正；未见新错。 |
| [11 observation r1](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/11-only-observation-wrong-direct-r1.json) | direct | confirmed_error / 可用 | 观察修对，也改 action；再次声称“判断正确”与“质疑参考”矛盾，附加理由不成立。 |
| [12 uncertainty r0](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/12-only-uncertainty-wrong-thinking-r0.json) | thinking | confirmed_error / 可用 | 仅恢复记录为 0，明确不等于没有任何帮助；依据成立。 |
| [13 uncertainty r0](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/13-only-uncertainty-wrong-direct-r0.json) | direct | confirmed_error / 可用 | 仅恢复记录为 0，未扩成独立完成或掌握认证。 |
| [14 uncertainty r1](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/14-only-uncertainty-wrong-direct-r1.json) | direct | confirmed_error / 可用 | 仅恢复记录为 0，保留记录边界；未见新错。 |
| [15 uncertainty r1](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/15-only-uncertainty-wrong-thinking-r1.json) | thinking | confirmed_error / 可用 | 仅恢复记录为 0，不认证独立完成；依据成立。 |
| [16 optional r0](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/16-optional-activity-control-direct-r0.json) | direct | confirmed_error / 可用 | 澄清 observation/action，保留可选活动；属于解释敏感澄清，不能强计误判或检错成功。 |
| [17 optional r0](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/17-optional-activity-control-thinking-r0.json) | thinking | no_error_found / 可用 | 无替换；明确可选性质，指出背景并置有措辞局限。 |
| [18 optional r1](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/18-optional-activity-control-thinking-r1.json) | thinking | no_error_found / 可用 | 无替换；把设计观察视为求助目标，不推断能力缺陷。 |
| [19 optional r1](../../web/test-results/thinking-comparison-2026-10-28-1793179489745/19-optional-activity-control-direct-r1.json) | direct | confirmed_error / 可用 | action→continue，移除可选 newActivity；继续讨论合理，但没有充分依据证明必须移除。 |

完整 replacement 中，所有注入错误都在原始输出里得到修正；11 份合同可用的注入修复未引入本次可确认的新事实错误，正确正文均保留。失败 05 的原始替换引入非法动作，属于明确新问题；它被验证器挡下，没有在本实验中发布。原补讲保留的“只有当”措辞不因这次局部修复而变为已全面核实。

## 5. 模式生效、延时与 usage

| 指标 | direct，n=10 | thinking，n=10 |
| --- | ---: | ---: |
| 首报告合同可用 | 9 | 10 |
| 合同失败 / Provider 失败 | 1 / 0 | 0 / 0 |
| reasoning_content 字段非空 | 0 | 10 |
| finish_reason=stop | 10 | 10 |
| 耗时合计，ms | 47,640 | 315,985 |
| 耗时均值，ms | 4,764 | 31,598.5 |
| 耗时中位数，ms | 4,602.5 | 31,758 |
| 耗时范围，ms | 3,899–6,252 | 9,723–54,600 |
| prompt_tokens 合计 | 29,916 | 30,166 |
| completion_tokens 合计 | 9,551 | 57,367 |
| total_tokens 合计 | 39,467 | 87,533 |
| reasoning_tokens 合计 | 未返回该统计字段 | 51,855 |
| prompt_cache_hit_tokens 合计 | 28,160 | 14,080 |
| prompt_cache_miss_tokens 合计 | 1,756 | 16,086 |

reasoningReturned 标志与原始响应中的字段存在性相符；开启组 10/10 返回推理内容，关闭组 0/10，有证据表明切换影响了服务端响应。未逐字评判 reasoning_content，也不把推理过程长度当作质量标准。

推理组平均延时是 direct 的 6.63277 倍，completion tokens 是 6.00639 倍，总 tokens 是 2.21788 倍。reasoning_tokens 是 completion 的细项，不能再加进 total；缓存细项 cached_tokens 与 prompt_cache_hit_tokens 指同一份用量，不能重复加总。direct 没有 reasoning_tokens 字段，不能将“未返回”写成实测为 0。

缓存命中占 prompt 的比例分别为 94.1302% 和 46.6751%；同一样例虽然提示字符串相同，thinking 的服务端 prompt_tokens 每次多 25。缓存、模式开销和服务端调度均可影响耗时及计费，因此不把 token 倍数直接换算为金额，不把全部延时差归因于推理计算。这里没有价格测量。

## 6. 对后续工作的约束

这份结果支持一个有限假设：在已提供准确本题、用户原话和帮助记录的条件下，开启推理可能比关闭推理更少做无依据的额外纠错。它没有证实模型能稳定生成完整路线，没有比较不同模型，也没有测量保留、迁移、无辅助作答或真实用户收益。5 个熟悉的开发样例、每模式每题 2 次，不能估计生产错误率。

下一轮应保留这些全部失败，另外冻结未见过的单字段错误及明确无错控制；把“发现目标错误”“完整替换合同可用”“附加指控成立”“正确内容保留”“局部修复后仍正确”分开记录。解释敏感项应要求澄清量词、任务承诺和证据范围，不能靠另一个模型评分决定真值。模式选择也应报告延时及用量成本；本次不据 20 次结果直接改变全局配置。
