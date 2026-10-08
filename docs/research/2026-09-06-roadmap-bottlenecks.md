# Roadmap 方案卡点调查（2026-09-06）

本次依据当前工作树代码、权威状态文档和仓库内脱敏验收产物进行静态调查。没有访问真实数据库、敏感设置或调用付费 AI。2026-08-13 验收属于历史运行证据，本次未重新验证当前 Provider 配置或真实内容效果。本文是辅助研究，不替代权威状态文档。

后续讨论已明确：下文建议冻结的范围与验收矩阵，应由 AI 研究提出，并在项目研究阶段对照可信依据核验；初学者只需表达用途与约束，不承担专业范围编写或完整性审核。地图与节点教学的联合优化、方案自审及实验边界已整理到 [学习方法论草案与自审](2026-09-06-learning-methodology.md)，该方案仍待真实效果验证。

## 1. 核心瓶颈是范围完整性，不是 JSON 结构

三轮固定高数输入均自动 passed，但人工内容验收为 0/3。第三轮整段遗漏多元、微分方程、向量与空间积分；第二轮目标写了全微分/斯托克斯而问题没有对应覆盖。证据：`docs/acceptance/2026-08-13-deepseek-v4-flash-calculus/README.md:23-25,51-69,83`。

当前 `checkLayeredStageCoverage` 只把已有蓝图问题 key 与展开节点的 `planningQuestionKey` 做集合比较（`web/src/lib/ai/roadmapPlanningQuality.ts:267-332`）。因此蓝图本身未生成某能力时，后续覆盖率仍能完整。结构门能保障引用正确，不能证明课程范围完整。当前库内搜索未找到版本化 syllabus/coverage matrix 的正式实现。

建议先明确一个验收领域的范围矩阵，把外部目标项映射到 Stage/Module/问题，允许声明排除项及理由；再验证是否真的覆盖能力，不用固定节点数代替完整性。

## 2. 修复结果仍可自评通过，复审不构成独立验收

骨架先 critique，但修复循环直接执行 `reviewed = repair.data`，随后由修复响应内的 report 决定是否退出，没有在每次修改之后再次独立 critique（`web/src/lib/ai/tutorService.ts:1492-1515`）。持久化 Map Draft 同样如此（`:1611-1629`）。历史三轮 generation/critique/repair 使用同一模型（验收 README:27,75）。

现有机制适合产生建议和有界修复，不能把 passed 当作教育质量认证。语义 finding 还允许用户绑定摘要写理由解决，这符合当前 ADR 0014；难点是用户通常缺乏领域知识，不应让其承担识别整片课程遗漏的全部责任。优先独立规则基准和人工盲审；若增加修复后复审，须同时考虑已有两轮上限、耗时与调用预算。

## 3. 密度方案已经有工作树实现，但尚未证明能修复漏项

`roadmapPlanningQuality.ts:52-53` 导出 advisory 阈值，`:189-190,379-380` 实现薄蓝图/薄展开 warning；`:101-111` 保持 error 才影响 ok。`tasks.ts:980,1198,1316,1450` 已加强能力分解提示。`roadmapDensityBaseline.test.ts` 和两个 fixture 已存在、尚未跟踪，相关源文件有未提交修改。

父任务本次定向验证报告：density baseline 8/8，roadmapPlanningQuality/contracts 与 routeSuggestionService 合计 29/29。它们支持信号/契约按实现工作，不能证明真实 AI 教学效果。`CURRENT_PROGRESS_AND_DIFFICULTIES.md:61` 仍写代码实施和回归测试待补，已落后于工作树；不能由此误报代码完全未实现，也不能把未提交实现记成已完成真实效果验收。

薄单元检测主要以连接词/标点判断多能力目标（`roadmapPlanningQuality.ts:82-98`），再交回语义复审。遗漏整个目标或考纲分支时，密度 warning 可能完全不出现；这是不同问题，不能用节点增多替代范围覆盖。

## 4. 来源与目标存在范围张力，DAG 无环也不代表前置正确

历史固定 Task Brief 点名单变量内容，而 depth 声明数学一，固定来源又包含单变量 MIT 18.01SC；输入缺少明确完整范围（验收 README:76-77）。不能把三轮失败全部归于模型能力，也不能以该实验声称已经验收课程研究，因为它固定了 Course Design（README:14-15）。

当前 DAG 检查能识别悬空引用和环（`web/src/lib/ai/roadmapSkeletonChecks.ts:145-168`），却不能识别“综合复习”遗漏终端分支的教学含义。增加汇聚检查时应由用户确认的 Stage 意图和目标范围定义必需分支，避免仅按标题关键词强制全连接，也必须保持允许并行起点的领域不变量。

## 5. 真实验收昂贵且可观测性未闭合

历史固定方向的路线生成本身每轮 79.8–91.7 秒，尚未包含完整课程研究链（验收 README:23-27）。更多复审不能无上限叠加，应先以保留失败样本做规则回归，再做同输入至少三轮真实验收。

当前 Responses 分支保存 `providerRequestId`（`web/src/lib/ai/openaiCompatibleProvider.ts:421-425`），Chat Completions 分支只返回 `{ text, raw }`（`:431-447`），与历史日志缺 Provider ID 的记录一致。可先补这项低成本追踪，让每次生成、修复和审查可关联。

## 建议的第一步

冻结一份无歧义高数任务范围及人工验收矩阵，以现有三轮失败产物为负例，验证范围项→蓝图问题覆盖与综合 Stage 必需前置。先证明规则确实拒绝已知失败、不会误伤合法并行 DAG，再在隔离环境重跑真实 AI。密度 warning 保留为辅助信号；不扩展高阶掌握或其他新概念。

## 整体闭环补充（父任务并行调查）

本轮合计 37 项定向测试通过（8 + 29），未运行全量测试、浏览器验收或 live AI。

- `routeSuggestionService.ts` 的 `acceptRouteSuggestion` 明确拒绝 changesMap；L2/L3 转换 Map Draft 的闭环仍需补齐，不能直接放开接受。
- `web/src/lib/learning/knowledgeService.ts:303-337` 的虫洞确认未校验 transfer challenge；这属于证据可信度边界，不能据此声称迁移能力已验收。
- 正式图谱页面仍有兼容画布入口（父任务定位 page.tsx:395），需要继续区分正式闭环与兼容功能。
- tasks、tutorService、roadmapService 和创建页分别约 2864、2772、1750、1840 行，说明维护耦合风险；本次没有性能测量，不能据文件大小判定运行时性能故障。
