# EnglishNode：归档失败机制与可判定的对照研究

日期：2026-10-28。本文件只记录归档原文、可复算判据与待实验假设，不改变产品门禁。已读取冻结 JSON、原始模型输出及当前状态；没有调用真实模型、连接真实数据库或重新运行桌面流程。生成成功、报告可用、更正保存、知识正确和学习有效分别判断。

## 1. 五类实际失败

| 类别 | 归档中实际发生的事 | 可直接核验的判据 | 当前边界 |
| --- | --- | --- | --- |
| F1 数学条件、量词及推导错误 | 011 审查把 g(x)=x² 的复合误写为恒 2，结构审查把 x=0 算进去心邻域。另有“不取 L 是必要条件”的未限定表述，其“路线二”上下文容许不同解读。 | 若 F(t)=1(t≠0)、F(0)=2，则 x≠0 时 F(x²)=1，可直接核验。F≡1、g≡0 只能否定每个具体个例的必要性，不能据此否定原句可能表达的法则适用条件或普遍保证。 | 算错与解读歧义分开；必要性一对只作澄清分析，不计无歧义正确率。不能把研究者选定的解读当唯一真值。 |
| F2 当前题设、参考回应和分支标准错配 | 041 活动只给外层去心极限为 1，参考却断言 F(x²)=1；同一标准未区分 g=x² 和 g≡0，排除了后者允许的正确极限 F(0)。 | 取 F(t)=1+t(t≠0)、F(0)=2，非零 x 的复合为 1+x²，只有极限为 1。g≡0 时复合恒 F(0)。 | 错误已经存在于生成 rawOutput，不能归因于后续保存。先前特例在新题中被沿用是有原文依据的描述；具体因果是否来自上下文干扰仍须对照。 |
| F3 来源归属虚构 | 011 报告使用真实片段 ID，却声称用户笔记明确写出了新 Stage 的例子和前置句。实际 1,282 字片段没有这些逐字引文。 | 对实际片段、引文、位置和哈希逐项比对。精确引文不存在可以机械核验；语义支持则须另行审读。 | 真实 ID 只证明身份存在，不证明片段支持主张。某数学主张可独立成立，仍不使错误来源归属成立。 |
| F4 输出合同失败 | 006 三次原始报告 limitations/claims 数为 10/12、8/12、10/16；只有中间报告通过该合同。011 首次原始输出仅有 summary、limitations，缺 claims/findings。 | JSON 解析、必需字段、数组数量和路径合同均可确定核验。 | 这是过程不可用，不能直接推断内容错或内容通过；修复是否降低此失败率需要另测，不能放宽正式规则凑通过。 |
| F5 更正被后续程序覆盖 | 006 有效报告提出四处更正，投影回上游登记后实际只保留一处，corrections 仍记录四处。 | 冻结原报告和候选，逐字段比较规范化前后及最终保存值。已有重放记录旧处理保留 [false,false,false,true]。 | 2026-10-11 已修正文来源定位、整批保留检查和失败保护；新处理对原报告整批拒绝并保留原稿。不能再称当前代码仍存在同一开放缺陷。新桌面包和真实模型复验并未由该离线证据完成。 |

主要原文入口：[011 审读](../../web/test-results/final-core-blank-2026-10-10-1791623160555/AUDIT-STAGE-011.md)、[006 审读](../../web/test-results/final-core-blank-2026-10-10-1791623160555/AUDIT-ROUTE-006.md)、[实际数据链](../../web/test-results/final-core-blank-2026-10-10-1791623160555/AUDIT-DATA-CHAIN.md)、[041 审读](../../web/test-results/reliability-verified-empty-2026-10-10-1791617868526/AUDIT-PART-3.md)。本次同时核对下面的冻结原文，不只复述审读结论。

## 2. 原始产物和精确提取入口

### 011：新 Stage 与两个模型审查

[冻结 JSON](../../web/test-results/final-core-blank-2026-10-10-1791623160555/snapshots/011-stage-candidates-and-independent-evidence/data.json)。`ai` 中的 JSON 字符串字段须再次解码，不能把转义后的展示文字作为逐字引文。

- 生成日志 `cmv26yuhz0020ssa9myji12lf`，`rawOutput` 解码后 `.modules[1].items[0].concept.learningUnit.teachingTasks[2]` 是未限定的必要性主张。其 `.newKnowledge`、`.example` 提供当前条件；保留“路线二”的原始语境，不预先强制其只能是个例必要性解读。
- 结构审查日志 `cmv26z5xh0022ssa96ijlaldo`，`rawOutput` / `validatedOutputJson` 的 `.warnings[0]` 把 x=0 纳入去心邻域，并建议替换正确示例。原记录仍是模型审查意见，不改写为研究者结论。
- 知识核对首日志 `cmv26za4r0024ssa9zrkmnwgb`：原始 JSON 缺 claims/findings，`validationIssuesJson` 保存具体失败。
- 修复报告日志 `cmv26zd5j0026ssa9xvkz5dod`：按 `claims[].key` 定位 `route-two-necessity`、`composite-route-example`、`prerequisite-limit-meaning`；保留 `path/quote/premises/verdict/basis.reason`。其中复合计算错误及虚构来源归属已经在 `rawOutput` 中出现。
- 上述修复报告的 `requestMessagesJson[1].content` 内含实际片段 `src-46a0c2ba1c35-63f242e517b2-0`。记录的 `.text` 为 1,282 个 Unicode 字符，性质为 `user_text`；不是已核实的公开教材。
- 回执 `cmv26zpjt0029ssa9lwmrmhhb` 的 `.reportJson.knowledgeReview` 保存知识报告及绑定信息。结构 `passed` 与知识真伪不是同一结果。

### 041：第三部分的当前题与隐藏参考

[冻结 JSON](../../web/test-results/reliability-verified-empty-2026-10-10-1791617868526/snapshots/041-part-3-generated/data.json)。

- `segments[id=cmv24y4it005avlferim5z6js]`，session `cmv23ylzh0026vlfe13lhniar`，key `l1--route-two-punctured-limit`，version=1。
- `.materialJson` 解码后 `.steps[1].activities[0].prompt/answer/criteria[2]` 是新题、参考和分支标准；活动 key 为 `activity-65b0ab25-ff39-48a5-8dcc-a00e5e92aa5b`。
- `.steps[1].example` 是先前明确给 F(t)=1(t≠0) 的特例；新题重新陈述的一般条件必须单独保留，不能把两者默认合并。
- `.steps[2].explanation` 给出了“常值例不构成逆推反例”的错误理由。最后结论碰巧正确，不代表理由正确。
- 生成日志 `cmv24y4ja005cvlfedgaih3h8`，其 `rawOutput` 对应相同字段，已含上述参考与标准错误；核对日志 `cmv24ybv0005evlfea8vlodpd` 的原始报告为 `no_error_found/findings=[]`。
- 段落 `.sourceSnapshotJson[0]` 保存实际片段及位置。其正文与 011 的该片段完全相同。

### 006：传播机制的程序对照

[005 原候选](../../web/test-results/final-core-blank-2026-10-10-1791623160555/snapshots/005-route-proposed-with-source-and-knowledge/data.json)、[006 修订候选](../../web/test-results/final-core-blank-2026-10-10-1791623160555/snapshots/006-route-user-revision-1-candidate/data.json)、[已有重放证据](../../web/test-results/planning-correction-replay-2026-10-11-evidence.json)。

- 有效报告日志 `cmv26ke4o000rssa9hk9483ct` 的 `rawOutput/validatedOutputJson.findings` 保存四处原句和 replacement。
- 对照 `domains[0].roadmapDraftJson` 解码后的 `learningGoals[0].contentQuestions[1]` 与 `stages[0].moduleBlueprints[0].keyQuestions[1]`，以及实际保留的 `stages[5].problem.steps[3]`。
- 新回执 `cmv26l3vm000wssa90ih3d0eb` 的 `.reportJson.knowledgeReview.corrections` 必须与最终正文分别比较，不能只数 metadata。
- 10/11 的“补齐正文来源后四项均保留”是明确标识的协议夹具，不是一次新的真实模型成功输出。

共同可提取字段：`provider/model/promptVersion/requestMessagesJson/rawOutput/parsedOutputJson/validatedOutputJson/validationIssuesJson/attempt/retryReason/failureStage/latencyMs`。请求长度只能报告为实际字符数；它不是 token 数，也不是长上下文造成错误的因果证据。

## 3. 新增信息断层：协作审计的代码事实与待实验假设

以下来自另一协作审计者对 **2026-10-28 修正前代码** 的报告，与本文件直接复核的 011/041 原文证据分开。对应实现当日正在修订，函数名比行号更稳定，最终实现与实验结果应以根任务的补丁和实际记录为准。

1. `learningSessionService.ts` 的 `submitLearningInteraction` 在反馈生成时有当前 step/activity、用户 input 和帮助曝光；但随后将反馈投影为 `miniFrame.mainIdea` 与新活动再交给知识检查，`checkGeneratedKnowledge` 补的是教学上下文，没有同样传入这一轮完整作答事实。**后置审查是否因此错判，是待对照的因果假设。** 不能说所有归档错误都因缺输入：011 已看到当前节点，041 原始错误也已出现在生成阶段。
2. 修前反馈生成未直接附来源正文，后置核对才按 `context.focus` 重新选片段，而非复用当前活动绑定快照。**前置供给相关来源能否减少错误，需要实验；不是“系统完全没有资料”。**
3. 协作审计另指出 `prepareLearningSegment` 同 requestId 失败重试会重新选择来源，但旧分支没有同步更新 `sourceSnapshotJson/sourceRevision`，可能形成新生成与旧快照不一致。该项是单独的版本与来源一致性问题，需要可重复的程序案例验证；不能据此推定 011/041 已经发生同样错配，也不能把它当作模型质量改善的证据。

涉及文件：[learningSessionService.ts](../../web/src/lib/learning/learningSessionService.ts)、[teachingSources.ts](../../web/src/lib/learning/teachingSources.ts)、[planningEvidence.ts](../../web/src/lib/learning/planningEvidence.ts)。这些观察为实验选变量，不新增领域状态或用户确认关卡。

## 4. 能区分原因的成对实验

配合[已有评价协议](2026-10-27-ai-teaching-evaluation-protocol.md)，先检查程序，再检查模型。以下只是设计，本文件未运行模型对照。

| 对照 | 保持相同 | 仅改变 | 能回答什么；不能回答什么 |
| --- | --- | --- | --- |
| 归档纯重放 | 原候选、原始更正报告和最终保留要求 | 旧处理与已修处理 | 判断程序是否吞更正；不测模型能否发现错误。优先复用已有 006 重放。 |
| 完整/局部上下文 | 模型、当前题与必要来源、提示、输出合同 | 与当前判断无关的历史/全图内容是否进入 | 检查当前设置的上下文干扰；不能凭一次成功证明通用机制。 |
| 原提示/显式条件核对 | 同一输入、模型与输出合同 | 是否明确要求核对题设、量词、结论、反例满足的前提 | 检查提示增量。不要同时换资料或减少报告合同，否则原因混合。 |
| 原模型/替代模型 | 同一无歧义任务、资料、提示及预定资源上限 | 模型版本 | 判断已测设置下的能力差异；不推出某模型永远不可能完成。 |
| 完整/最小研究报告 | 同一主张、资料及模型 | 实验输出格式承担的额外字段责任 | 分开测合同可用率与判断正确率；研究格式不替代正式产品合同。 |

提示和上下文可交叉比较；先试少量有依据的任务，再决定是否扩大。所有原始输出、合同失败、超时和 uncertain 都保留。不能持续抽样到满意后只报告最后一次。

已有原句与研究者正确近邻句见 [archived-knowledge-cases.json](../../web/scripts/research/archived-knowledge-cases.json)：共五对、十条，覆盖量词、复合计算、极限与逐点值、分支标准、反例理由。五条是实际原始输出的逐字连续片段，五条是研究者新写的正确近邻；后者不是模型成功修订记录。每条保留真实日志和解码字段路径、原字段/引文指纹、当前题设、相关来源摘录及可复算 expected/reason/witness。必要性一对标 `interpretationSensitive=true`，原句 expected 为 `interpretation_dependent`，仅在个例必要性读法下成立错误标签；这一对排除出无歧义正确率，其余四对用于直接判据比较。

标签、反例、研究者 scopeNote 和 interpretationAnalysis 必须对被测模型隐藏；原句的实际条件继续保留。对无歧义成对样例分别统计漏判、误判、不确定和合同失败；不能用“总是说有错”的策略提高表面检出率，也不能把合理的法则使用条件读法算成漏判。这些公开样例只能做开发/回归，不能充当未见保留集。研究者的数学核对也不应冒充独立人类学科认证。

## 5. 提取核验与能力边界

本次逐条从归档 `rawOutput` 解码字段提取五条原句，并验证其为完整字段或连续子串；五条近邻单独标注来源。来源摘录用原文位置与独立 UTF-8 SHA256 核验，没有复制完整数据库、设置或全部 raw。

原系统 `contentHash=63f242…` 对应整组来源 blocks（`teachingSources.ts` 的 `sourceFragments`、`planningEvidence.ts` 的 `materialBlocks`），不是单个 fragment.text 的哈希。当前 1,282 字片段自身的 SHA256 为 `4ee1a9…`。数据分别保存 `declaredContentHash`、`fragmentTextSha256`、`excerptSha256`，两者不同不构成损坏证据。

这些判据覆盖局部命题、来源归属、合同与保存保真。它们不能直接判定整条路线是否最适合某学习者，也不能证明教学改善了独立表现或长期保持。后一类问题仍需真实学习者证据，不用 AI 扮演学生或另一个模型评分替代。
