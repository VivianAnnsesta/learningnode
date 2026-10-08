import { describe, expect, it } from "vitest";
import {
  AiTaskValidationError,
  buildCourseDesignRepairPrompt,
  validateLongTermReviewInsight,
  validateIslandReactivationPlan,
  parseJsonObjectFromModel,
  validateKnowledgeGraphOrganizer,
  validateRelationCandidates,
  validateRelationExplanation,
  validateRelationReactivationPlan,
  validateLearningFeedback,
  validateLearningHint,
  validateCourseDesignDraft,
  validateCourseDesignCritique,
  buildCourseDesignCritiquePrompt,
  buildCourseDesignPrompt,
  validateRoadmapSkeletonDraft,
  validateTaskBriefDraft,
  validateTransferChallenge,
  buildSourceRelevanceCheckPrompt,
  buildMapDraftQualityReviewPrompt,
  validateSourceRelevanceCheck
} from "./tasks";

describe("parseJsonObjectFromModel", () => {
  it("parses a fenced JSON object", () => {
    expect(parseJsonObjectFromModel('```json\n{"ok":true}\n```')).toEqual({
      ok: true
    });
  });

  it("parses JSON with nested code fences inside string values", () => {
    expect(
      parseJsonObjectFromModel(
        [
          "```json",
          "{",
          "  \"detail\": \"Use ```rust\\nasync fn demo() {}\\n``` as counterexample\",",
          "  \"ok\": true",
          "}",
          "```"
        ].join("\n")
      )
    ).toEqual({
      detail: "Use ```rust\nasync fn demo() {}\n``` as counterexample",
      ok: true
    });
  });

  it("keeps the outer fenced object intact when string fields contain inner fences", () => {
    expect(
      parseJsonObjectFromModel(
        [
          "```json",
          "{",
          "  \"summary\": \"先看这段代码：```ts\\nconst value = { nested: true };\\n```，再继续分析\",",
          "  \"notes\": [\"保留外层 JSON\", \"忽略字符串里的 fence\"]",
          "}",
          "```",
          "补充说明：这一段不属于 JSON。"
        ].join("\n")
      )
    ).toEqual({
      summary: "先看这段代码：```ts\nconst value = { nested: true };\n```，再继续分析",
      notes: ["保留外层 JSON", "忽略字符串里的 fence"]
    });
  });

  it("parses the first complete object instead of swallowing trailing prose braces", () => {
    expect(
      parseJsonObjectFromModel('Here is JSON:\n{"ok":true}\nNote: {not json}')
    ).toEqual({ ok: true });
  });

  it("skips invalid brace blocks before the actual JSON object", () => {
    expect(
      parseJsonObjectFromModel(
        [
          "Formatting hint: {not actually json}",
          "```json",
          "{\"ok\":true,\"detail\":\"answer\"}",
          "```"
        ].join("\n")
      )
    ).toEqual({
      ok: true,
      detail: "answer"
    });
  });

  it("ignores braces in JSON strings while finding the outer object", () => {
    expect(
      parseJsonObjectFromModel('{"pattern":"{value}","escaped":"quote: \\" }"}')
    ).toEqual({
      pattern: "{value}",
      escaped: 'quote: " }'
    });
  });

  it("throws a task validation error for invalid JSON", () => {
    expect(() => parseJsonObjectFromModel("{not valid json}")).toThrow(
      AiTaskValidationError
    );
  });

  it("throws a task validation error when no JSON object exists", () => {
    expect(() => parseJsonObjectFromModel("plain text")).toThrow(
      AiTaskValidationError
    );
  });
});

describe("buildMapDraftQualityReviewPrompt", () => {
  it("treats planned stages as complete blueprints instead of missing node coverage", () => {
    const prompt = buildMapDraftQualityReviewPrompt({
      domain: { name: "考研数学" },
      courseDesign: validateCourseDesignDraft({
        taskBriefSnapshot: "准备考研数学一",
        globalExplanation: {
          theorySkeleton: "高等数学、线性代数、概率论",
          sourceBasis: "考试大纲",
          optimizationRationale: "按前置关系规划",
          risksAndValidation: "逐阶段核对覆盖"
        },
        keyTradeoffs: ["先骨架后展开"],
        sources: [
          {
            url: "https://example.edu/syllabus",
            title: "考试大纲",
            reason: "范围依据"
          }
        ]
      }),
      draft: {
        planningVersion: 2,
        stages: [
          {
            key: "limits",
            status: "planned",
            moduleBlueprints: [
              {
                key: "limit-foundations",
                keyQuestions: [{ key: "limit-meaning", question: "极限是什么？" }]
              }
            ],
            modules: []
          }
        ]
      },
      scope: "skeleton"
    });

    expect(prompt).toContain(
      "A planned Stage is complete at blueprint level"
    );
    expect(prompt).toContain(
      "Never report stageCoverage merely because a planned Stage has no Learning Nodes"
    );
    expect(prompt).toContain(
      "Apply Learning Node coverage checks only to expanded Stages"
    );
  });
});

describe("validateLearningHint", () => {
  it("normalizes invalid hint level and supplies safe defaults", () => {
    expect(
      validateLearningHint({
        hintLevel: 9,
        hint: "先找边界条件",
        guidingQuestion: "",
        whyThisHelps: "",
        shouldRevealAnswer: "no"
      })
    ).toEqual({
      hintLevel: 1,
      hint: "先找边界条件",
      guidingQuestion: expect.any(String),
      whyThisHelps: expect.any(String),
      shouldRevealAnswer: false
    });
  });
});

describe("validateTaskBriefDraft", () => {
  it("normalizes sparse task brief drafts", () => {
    expect(
      validateTaskBriefDraft({
        taskBrief: "",
        summary: "先明确边界",
        successCriteria: ["能复述目标", "", "能说明评估方式"],
        risks: ["范围过大", null]
      })
    ).toEqual({
      taskBrief: expect.stringContaining("学习目标"),
      summary: "先明确边界",
      successCriteria: ["能复述目标", "能说明评估方式"],
      risks: ["范围过大"]
    });
  });

  it("rejects truncated task briefs that start expanding roadmap stages", () => {
    expect(() =>
      validateTaskBriefDraft({
        taskBrief:
          "学习目标：建立线性代数结构。\n## 七、阶段划分\n- 阶段1：以",
        summary: "建立结构",
        successCriteria: [],
        risks: []
      })
    ).toThrow(AiTaskValidationError);
  });
});

describe("validateCourseDesignDraft", () => {
  it("requires repair to populate concrete source objects instead of only rewriting prose", () => {
    const prompt = buildCourseDesignRepairPrompt({
      domain: { name: "TypeScript React", goal: "Build a typed app." },
      draft: validateCourseDesignDraft({
        taskBriefSnapshot: "Build a typed app.",
        globalExplanation: {
          theorySkeleton: "Start from the type system.",
          sourceBasis: "Sources missing.",
          optimizationRationale: "Types before integration.",
          risksAndValidation: "Check JavaScript basics."
        },
        sources: []
      }),
      missing: ["sources"]
    });

    expect(prompt).toContain("return 2-5 concrete HTTPS source objects");
    expect(prompt).toContain("Updating sourceBasis alone is not a repair");
    expect(prompt).toContain('"sources": [');
    expect(prompt).toContain("Do not include qualityGate");
  });

  it("passes when the direction has four global explanations and sources", () => {
    expect(
      validateCourseDesignDraft({
        taskBriefSnapshot: "学习目标：完成一个可运行项目。",
        globalExplanation: {
          theorySkeleton: "先建立基本对象、核心问题和最小先修链。",
          sourceBasis: "优先参考大学课程，再用官方文档补充。",
          optimizationRationale: "先修关系优先，其次匹配项目产出。",
          risksAndValidation: "仍需诊断当前基础和误区。"
        },
        sources: [
        {
          url: "https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/",
          title: "MIT 18.06 Linear Algebra",
          reason: "课程结构清晰，适合作为主骨架。"
        }
        ],
        keyTradeoffs: ["降低理论密度，保留必要先修。"]
      }).qualityGate
    ).toEqual({ passed: true, missing: [] });
  });

  it("fails the quality gate when source links are missing", () => {
    const draft = validateCourseDesignDraft({
      taskBriefSnapshot: "学习目标：建立框架。",
      globalExplanation: {
        theorySkeleton: "理论骨架",
        sourceBasis: "缺少来源",
        optimizationRationale: "优化说明",
        risksAndValidation: "风险"
      },
      sources: []
    });

    expect(draft.qualityGate.passed).toBe(false);
    expect(draft.qualityGate.missing).toContain("sources");
  });

  it("fails the quality gate when sources cite only institutional homepages", () => {
    const draft = validateCourseDesignDraft({
      taskBriefSnapshot: "学习目标：建立线性代数框架。",
      globalExplanation: {
        theorySkeleton: "从向量空间、线性映射和秩建立理论骨架。",
        sourceBasis: "来源应来自具体课程或大纲。",
        optimizationRationale: "先修关系优先。",
        risksAndValidation: "需要诊断基础。"
      },
      sources: [
        {
          url: "https://www.example.edu",
          title: "Example University",
          reason: "只是学校首页，不是具体课程来源。"
        }
      ]
    });

    expect(draft.qualityGate.passed).toBe(false);
    expect(draft.qualityGate.missing).toContain("specific source url");
  });

  it("accepts a focused documentation site whose content lives at its root", () => {
    const draft = validateCourseDesignDraft({
      taskBriefSnapshot: "学习目标：建立 React TypeScript 项目能力。",
      globalExplanation: {
        theorySkeleton: "先学习类型系统，再应用到 React 组件。",
        sourceBasis: "采用专门的 React TypeScript 实践资料。",
        optimizationRationale: "语言基础先于框架集成。",
        risksAndValidation: "需要验证 JavaScript 与 React 基础。"
      },
      sources: [
        {
          url: "https://react-typescript-cheatsheet.netlify.app/",
          title: "React TypeScript Cheatsheet",
          reason: "专门覆盖 React 与 TypeScript 的实践模式。"
        }
      ]
    });

    expect(draft.qualityGate).toEqual({ passed: true, missing: [] });
  });

  it("accepts the official TypeScript TSConfig reference root", () => {
    const draft = validateCourseDesignDraft({
      taskBriefSnapshot: "学习目标：建立 TypeScript React 项目能力。",
      globalExplanation: {
        theorySkeleton: "先学习类型系统，再应用到 React 组件。",
        sourceBasis: "采用 TypeScript 官方配置参考。",
        optimizationRationale: "语言基础先于工程配置。",
        risksAndValidation: "需要验证类型检查与项目配置。"
      },
      sources: [
        {
          url: "https://www.typescriptlang.org/tsconfig/",
          title: "TSConfig Reference",
          reason: "官方配置参考页，支撑项目编译选项与类型检查。"
        }
      ]
    });

    expect(draft.qualityGate).toEqual({ passed: true, missing: [] });
  });

  it("does not treat a documentation marker embedded in an unrelated host label as focused", () => {
    const draft = validateCourseDesignDraft({
      taskBriefSnapshot: "学习目标：建立框架。",
      globalExplanation: {
        theorySkeleton: "理论骨架",
        sourceBasis: "来源依据",
        optimizationRationale: "优化说明",
        risksAndValidation: "风险"
      },
      sources: [
        {
          url: "https://notdeveloper.example.org/",
          title: "Unrelated homepage",
          reason: "不应因域名字符串包含 developer 就通过。"
        }
      ]
    });

    expect(draft.qualityGate.missing).toContain("specific source url");
  });

  it("fails the quality gate when sources contain placeholder-like URLs", () => {
    const draft = validateCourseDesignDraft({
      taskBriefSnapshot: "学习目标：建立线性代数框架。",
      globalExplanation: {
        theorySkeleton: "从向量空间、线性映射和秩建立理论骨架。",
        sourceBasis: "来源应来自具体课程或大纲。",
        optimizationRationale: "先修关系优先。",
        risksAndValidation: "需要诊断基础。"
      },
      sources: [
        {
          url: "https://www.hep.com.cn/book/details?bookId=5c1c0c0c-0c0c-0c0c-0c0c-0c0c0c0c0c0c",
          title: "疑似占位书目链接",
          reason: "URL 看起来像伪造 ID。"
        }
      ]
    });

    expect(draft.qualityGate.passed).toBe(false);
    expect(draft.qualityGate.missing).toContain("non-placeholder source url");
  });

  it("fails the quality gate for non-HTTPS source URLs", () => {
    const draft = validateCourseDesignDraft({
      taskBriefSnapshot: "学习目标：建立线性代数框架。",
      globalExplanation: {
        theorySkeleton: "理论骨架",
        sourceBasis: "来源依据",
        optimizationRationale: "优化说明",
        risksAndValidation: "风险"
      },
      sources: [
        {
          url: "javascript:fetch('/api/domains')//course",
          title: "恶意来源",
          reason: "不应被渲染"
        }
      ]
    });

    expect(draft.qualityGate.passed).toBe(false);
    expect(draft.qualityGate.missing).toContain("specific source url");
  });
});

describe("course design research prompt structured requirements", () => {
  const prompt = buildCourseDesignPrompt({
    name: "线性代数",
    goal: "完成一个可运行的项目。",
    scope: "矩阵、向量空间、特征分解。",
    taskBrief: "学习任务书"
  });

  it("elevates the optimization priority from a conflict tie-breaker to an explicit scoring requirement", () => {
    expect(prompt).toContain("prerequisite correctness");
    expect(prompt).toContain("goal match");
    expect(prompt).toContain("cognitive load");
    expect(prompt).toContain("authoritative course order");
    expect(prompt).toContain("personalization");
    expect(prompt).toContain("scoring requirement");
  });

  it("requires the optimizationRationale to state the ordering rationale, not just restate the tradeoff", () => {
    expect(prompt).toContain("ordering rationale");
    expect(prompt).toContain("why it beats the obvious alternative");
  });

  it("requires every keyTradeoffs item to name the optimization priority it serves", () => {
    expect(prompt).toContain("keyTradeoffs");
    expect(prompt).toContain("optimization priority it serves");
  });
});

describe("validateRoadmapSkeletonDraft", () => {
  it("accepts only stages, core topics, and prerequisite relationships", () => {
    expect(
      validateRoadmapSkeletonDraft({
        title: "Calculus skeleton",
        status: "draft",
        stages: [
          {
            key: "limits",
            title: "Limits",
            goal: "Build the foundation for derivatives.",
            coreTopics: ["limit definition", "continuity"],
            prerequisiteStageTitles: [],
            prerequisiteStageKeys: []
          },
          {
            key: "derivatives",
            title: "Derivatives",
            goal: "Use limits to describe local change.",
            coreTopics: ["derivative", "chain rule"],
            prerequisiteStageTitles: ["Limits"],
            prerequisiteStageKeys: ["limits"]
          }
        ]
      })
    ).toEqual({
      title: "Calculus skeleton",
      status: "draft",
      stages: [
        {
          key: "limits",
          title: "Limits",
          goal: "Build the foundation for derivatives.",
          coreTopics: ["limit definition", "continuity"],
          prerequisiteStageTitles: [],
          prerequisiteStageKeys: []
        },
        {
          key: "derivatives",
          title: "Derivatives",
          goal: "Use limits to describe local change.",
          coreTopics: ["derivative", "chain rule"],
          prerequisiteStageTitles: ["Limits"],
          prerequisiteStageKeys: ["limits"]
        }
      ]
    });
  });

  it("rejects skeleton output that expands into modules or items", () => {
    expect(() =>
      validateRoadmapSkeletonDraft({
        title: "Too detailed",
        stages: [
          {
            title: "Limits",
            coreTopics: ["limit definition"],
            prerequisiteStageTitles: [],
            modules: [{ title: "Module should not be here", items: [] }]
          }
        ]
      })
    ).toThrow(AiTaskValidationError);
  });
});

describe("validateLearningFeedback", () => {
  it("keeps allowed mastery status and derives island recommendation", () => {
    expect(
      validateLearningFeedback({
        summary: "理解基本成立，但还缺边界。",
        accurateParts: ["抓住了核心问题"],
        vagueParts: ["例子不够具体"],
        missingBoundaries: ["缺少反例"],
        transferCheck: "换到一个新场景说明是否仍适用。",
        nextRevisionPrompt: "补一个例子和一个反例。",
        suggestedMasteryStatus: "island",
        shouldRemainIsland: "unknown",
        islandReason: "和旧知识的连接证据不足"
      })
    ).toEqual({
      summary: "理解基本成立，但还缺边界。",
      accurateParts: ["抓住了核心问题"],
      vagueParts: ["例子不够具体"],
      missingBoundaries: ["缺少反例"],
      transferCheck: "换到一个新场景说明是否仍适用。",
      nextRevisionPrompt: "补一个例子和一个反例。",
      suggestedMasteryStatus: "island",
      shouldRemainIsland: true,
      islandReason: "和旧知识的连接证据不足"
    });
  });
});

describe("validateRelationCandidates", () => {
  it("filters candidates outside the allowed target pool", () => {
    expect(
      validateRelationCandidates(
        {
          candidates: [
            {
              targetWordId: "allowed-target",
              relationType: "analogy",
              status: "candidate",
              evidenceStrength: "medium",
              detail: "两者都通过结构映射帮助理解。",
              userQuestion: "这个类比在哪些条件下成立？",
              applicability: "结构关系相似时",
              misuseRisk: "忽略定义域会造成过度类比",
              shouldCreateWormhole: false
            },
            {
              targetWordId: "invented-target",
              relationType: "derive",
              detail: "无效目标"
            }
          ]
        },
        new Set(["allowed-target"])
      )
    ).toEqual([
      {
        targetWordId: "allowed-target",
        relationType: "analogy",
        status: "candidate",
        evidenceStrength: "medium",
        detail: "两者都通过结构映射帮助理解。",
        userQuestion: "这个类比在哪些条件下成立？",
        applicability: "结构关系相似时",
        misuseRisk: "忽略定义域会造成过度类比",
        shouldCreateWormhole: false
      }
    ]);
  });
});

describe("validateTransferChallenge", () => {
  it("keeps only allowed related word ids", () => {
    expect(
      validateTransferChallenge(
        {
          prompt: "用定义域解释一个反例为什么暴露了边界。",
          relatedWordIds: ["allowed-related", "invented-related"],
          relationFocus: "边界关系",
          expectedReasoningMoves: ["说明定义域", "构造反例"],
          boundaryCheck: "指出反例不适用的条件。",
          misuseRisk: "不要把单个反例当作完整分类。",
          difficulty: "hard"
        },
        new Set(["allowed-related"])
      )
    ).toEqual({
      prompt: "用定义域解释一个反例为什么暴露了边界。",
      relatedWordIds: ["allowed-related"],
      relationFocus: "边界关系",
      expectedReasoningMoves: ["说明定义域", "构造反例"],
      boundaryCheck: "指出反例不适用的条件。",
      misuseRisk: "不要把单个反例当作完整分类。",
      difficulty: "hard"
    });
  });
});

describe("validateKnowledgeGraphOrganizer", () => {
  it("keeps only allowed knowledge point ids in concept clusters", () => {
    expect(
      validateKnowledgeGraphOrganizer(
        {
          summary: "Graph summary",
          coreConcepts: [
            {
              title: "Core cluster",
              essence: "Shared idea",
              knowledgePointIds: ["kp-1", "invalid-kp"],
              whyItMatters: "Supports transfer"
            }
          ],
          priorityGaps: ["Need stronger evidence"]
        },
        new Set(["kp-1"])
      )
    ).toEqual({
      summary: "Graph summary",
      coreConcepts: [
        {
          title: "Core cluster",
          essence: "Shared idea",
          knowledgePointIds: ["kp-1"],
          whyItMatters: "Supports transfer"
        }
      ],
      priorityGaps: ["Need stronger evidence"]
    });
  });
});

describe("validateRelationExplanation", () => {
  it("normalizes sparse relation explanations", () => {
    expect(
      validateRelationExplanation({
        summary: "This relation is still tentative.",
        connectionLogic: ["Step 1", "", "Step 2"],
        boundaryCheck: "",
        evidenceNote: "",
        misuseRisk: "Can be overgeneralized"
      })
    ).toEqual({
      summary: "This relation is still tentative.",
      connectionLogic: ["Step 1", "Step 2"],
      boundaryCheck: "State one condition where this relation may fail.",
      evidenceNote: "The current evidence is still incomplete.",
      misuseRisk: "Can be overgeneralized"
    });
  });
});

describe("validateIslandReactivationPlan", () => {
  it("keeps only allowed reconnection targets", () => {
    expect(
      validateIslandReactivationPlan(
        {
          summary: "这个孤岛还缺少稳定连接。",
          missingEvidence: ["缺一个可迁移例子"],
          candidateConnections: [
            {
              targetWordId: "allowed-word",
              relationType: "analogy",
              reason: "结构上有相似点",
              question: "它们在哪个边界内才相似？"
            },
            {
              targetWordId: "invented-word",
              relationType: "cause",
              reason: "无效连接"
            }
          ],
          transferChallenge: "换到一个新情境重新解释。",
          keepAsIsland: true,
          nextAction: "先补证。"
        },
        new Set(["allowed-word"])
      )
    ).toEqual({
      summary: "这个孤岛还缺少稳定连接。",
      missingEvidence: ["缺一个可迁移例子"],
      candidateConnections: [
        {
          targetWordId: "allowed-word",
          relationType: "analogy",
          reason: "结构上有相似点",
          question: "它们在哪个边界内才相似？"
        }
      ],
      transferChallenge: "换到一个新情境重新解释。",
      keepAsIsland: true,
      nextAction: "先补证。"
    });
  });
});

describe("validateRelationReactivationPlan", () => {
  it("normalizes invalid status and evidence values", () => {
    expect(
      validateRelationReactivationPlan({
        summary: "当前证据不足。",
        suggestedStatus: "not-real",
        suggestedEvidenceStrength: "very-strong",
        suggestedDetail: "目前只能保留为待验证弱连接。",
        evidenceChecks: ["补一个正例", "补一个反例"],
        transferChallenge: "换到新场景检验。",
        misuseWarning: "可能被过度泛化。",
        nextAction: "先做边界检查。"
      })
    ).toEqual({
      summary: "当前证据不足。",
      suggestedStatus: "weak_evidence",
      suggestedEvidenceStrength: "weak",
      suggestedDetail: "目前只能保留为待验证弱连接。",
      evidenceChecks: ["补一个正例", "补一个反例"],
      transferChallenge: "换到新场景检验。",
      misuseWarning: "可能被过度泛化。",
      nextAction: "先做边界检查。"
    });
  });
});

describe("validateLongTermReviewInsight", () => {
  it("keeps only allowed focus words, related words, and wormhole ids", () => {
    expect(
      validateLongTermReviewInsight(
        {
          summary: "优先做跨学科迁移并检查高风险虫洞。",
          crossDomainTransferChallenges: [
            {
              focusWordId: "focus-1",
              prompt: "把这个知识点迁移到新领域。",
              relationFocus: "检查跨学科类比",
              boundaryCheck: "指出失效条件",
              misuseRisk: "可能过度类比",
              relatedWordIds: ["related-1", "invalid-related"],
              whyNow: "已经到长期复盘窗口"
            },
            {
              focusWordId: "invalid-focus",
              prompt: "无效"
            }
          ],
          wormholeMisuseAlerts: [
            {
              relationId: "wormhole-1",
              severity: "high",
              warning: "这个虫洞证据不足。",
              verifyQuestion: "它什么时候成立？",
              saferUse: "先保留为候选。"
            },
            {
              relationId: "invalid-wormhole",
              severity: "high",
              warning: "无效"
            }
          ],
          nextActions: ["先做迁移挑战", "再复查虫洞"]
        },
        new Set(["focus-1"]),
        new Set(["related-1"]),
        new Set(["wormhole-1"])
      )
    ).toEqual({
      summary: "优先做跨学科迁移并检查高风险虫洞。",
      crossDomainTransferChallenges: [
        {
          focusWordId: "focus-1",
          prompt: "把这个知识点迁移到新领域。",
          relationFocus: "检查跨学科类比",
          boundaryCheck: "指出失效条件",
          misuseRisk: "可能过度类比",
          relatedWordIds: ["related-1"],
          whyNow: "已经到长期复盘窗口"
        }
      ],
      wormholeMisuseAlerts: [
        {
          relationId: "wormhole-1",
          severity: "high",
          warning: "这个虫洞证据不足。",
          verifyQuestion: "它什么时候成立？",
          saferUse: "先保留为候选。"
        }
      ],
      nextActions: ["先做迁移挑战", "再复查虫洞"]
    });
  });
});

describe("course design critique and quality report", () => {
  const baseDraftValue = {
    taskBriefSnapshot: "学习任务书快照",
    globalExplanation: {
      theorySkeleton: "理论骨架",
      sourceBasis: "来源依据",
      optimizationRationale: "优化理由",
      risksAndValidation: "风险"
    },
    sources: [
      {
        url: "https://ocw.mit.edu/courses/18-06",
        title: "MIT 18.06",
        reason: "权威课程",
        grounding: {
          ok: true,
          status: 200,
          title: "MIT 18.06",
          excerpt: "Linear Algebra course"
        }
      }
    ],
    keyTradeoffs: ["取舍一"]
  };

  it("preserves grounding info and quality report through draft validation", () => {
    const draft = validateCourseDesignDraft({
      ...baseDraftValue,
      qualityReport: {
        summary: "整体良好。",
        significantIssues: false,
        dimensions: [
          { key: "sourceQuality", score: 4, note: "来源可达" },
          { key: "goalMatch", score: 9, note: "超界分数会被夹紧" }
        ]
      }
    });
    expect(draft.qualityGate.passed).toBe(true);
    expect(draft.sources[0].grounding?.ok).toBe(true);
    expect(draft.qualityReport?.significantIssues).toBe(false);
    expect(draft.qualityReport?.dimensions[1].score).toBe(5);
  });

  it("drops invalid quality reports without failing the draft", () => {
    const draft = validateCourseDesignDraft({
      ...baseDraftValue,
      qualityReport: { summary: "缺维度" }
    });
    expect(draft.qualityReport).toBeNull();
  });

  it("validates a critique result with report and revised draft", () => {
    const result = validateCourseDesignCritique({
      report: {
        summary: "来源不可达，已替换。",
        significantIssues: true,
        dimensions: [
          { key: "prerequisiteCorrectness", score: 4, note: "链正确" },
          { key: "goalMatch", score: 5, note: "匹配目标" },
          { key: "cognitiveLoad", score: 3, note: "密度略高" },
          { key: "sourceQuality", score: 2, note: "一个来源不可达" },
          { key: "checkability", score: 4, note: "产出可检验" }
        ]
      },
      draft: baseDraftValue
    });
    expect(result.report.significantIssues).toBe(true);
    expect(result.report.dimensions).toHaveLength(5);
    expect(result.draft.qualityGate.passed).toBe(true);
  });

  it("rejects critique results without a valid report or draft", () => {
    expect(() =>
      validateCourseDesignCritique({ draft: baseDraftValue })
    ).toThrow(AiTaskValidationError);
    expect(() =>
      validateCourseDesignCritique({
        report: {
          summary: "ok",
          significantIssues: false,
          dimensions: [{ key: "goalMatch", score: 4, note: "ok" }]
        }
      })
    ).toThrow(AiTaskValidationError);
  });

  it("builds a critique prompt that embeds grounded evidence and the rubric", () => {
    const prompt = buildCourseDesignCritiquePrompt({
      domain: { name: "线性代数" },
      draft: validateCourseDesignDraft(baseDraftValue),
      groundedSources: [
        {
          url: "https://ocw.mit.edu/courses/18-06",
          ok: false,
          status: 404,
          title: null,
          excerpt: null,
          error: "HTTP 404"
        }
      ]
    });
    expect(prompt).toContain("HTTP 404");
    expect(prompt).toContain("prerequisiteCorrectness");
    expect(prompt).toContain("significantIssues");
    expect(prompt).toContain("线性代数");
  });

  it("requires the critique to check keyTradeoffs priority mapping and ordering rationale", () => {
    const prompt = buildCourseDesignCritiquePrompt({
      domain: { name: "线性代数" },
      draft: validateCourseDesignDraft(baseDraftValue),
      groundedSources: [
        {
          url: "https://ocw.mit.edu/courses/18-06",
          ok: true,
          status: 200,
          title: "MIT 18.06",
          excerpt: "Linear Algebra course"
        }
      ]
    });
    expect(prompt).toContain("optimization priority it serves");
    expect(prompt).toContain("ordering rationale");
    expect(prompt).toContain("goalMatch");
    expect(prompt).toContain("prerequisiteCorrectness");
  });
});

describe("buildSourceRelevanceCheckPrompt", () => {
  const domain = { name: "线性代数", scope: "本科数学", goal: "掌握矩阵与向量空间" };
  const sources = [
    {
      url: "https://ocw.mit.edu/18-06",
      title: "MIT 18.06 Linear Algebra",
      excerpt: "Vectors, matrices, eigenvalues"
    }
  ];

  it("embeds the domain name, scope and goal", () => {
    const prompt = buildSourceRelevanceCheckPrompt({ domain, sources });
    expect(prompt).toContain("线性代数");
    expect(prompt).toContain("本科数学");
    expect(prompt).toContain("掌握矩阵与向量空间");
  });

  it("embeds the grounded source title and excerpt", () => {
    const prompt = buildSourceRelevanceCheckPrompt({ domain, sources });
    expect(prompt).toContain("https://ocw.mit.edu/18-06");
    expect(prompt).toContain("MIT 18.06 Linear Algebra");
    expect(prompt).toContain("Vectors, matrices, eigenvalues");
  });

  it("asks for a per-source 0-1 score, lowRelevance flag and Chinese reason", () => {
    const prompt = buildSourceRelevanceCheckPrompt({ domain, sources });
    expect(prompt).toContain("\"judgments\"");
    expect(prompt).toContain("\"score\"");
    expect(prompt).toContain("\"lowRelevance\"");
    expect(prompt).toContain("\"reason\"");
    expect(prompt).toContain("0 to 1");
  });
});

describe("validateSourceRelevanceCheck", () => {
  it("clamps score into 0-1 and requires a reason", () => {
    const result = validateSourceRelevanceCheck({
      judgments: [{ url: "https://a.edu", score: 5, lowRelevance: false, reason: "直接命中目标" }]
    });
    expect(result.judgments).toHaveLength(1);
    expect(result.judgments[0].score).toBe(1);
    expect(result.judgments[0].reason).toBe("直接命中目标");
  });

  it("derives lowRelevance when the clamped score is below the floor", () => {
    const result = validateSourceRelevanceCheck({
      judgments: [{ url: "https://b.edu", score: 0.05, lowRelevance: false, reason: "几乎无关" }]
    });
    expect(result.judgments[0].lowRelevance).toBe(true);
  });

  it("keeps an explicit lowRelevance flag even at a higher score", () => {
    const result = validateSourceRelevanceCheck({
      judgments: [{ url: "https://c.edu", score: 0.6, lowRelevance: true, reason: "仅边缘相关" }]
    });
    expect(result.judgments[0].lowRelevance).toBe(true);
    expect(result.judgments[0].score).toBe(0.6);
  });

  it("falls back to a default reason when omitted", () => {
    const result = validateSourceRelevanceCheck({
      judgments: [{ url: "https://d.edu", score: 0.9, lowRelevance: false }]
    });
    expect(result.judgments[0].reason).toContain("未提供");
  });

  it("rejects when there are no usable judgments", () => {
    expect(() => validateSourceRelevanceCheck({ judgments: [] })).toThrow(
      AiTaskValidationError
    );
    expect(() =>
      validateSourceRelevanceCheck({
        judgments: [{ url: "", score: 0.5, lowRelevance: false, reason: "x" }]
      })
    ).toThrow(AiTaskValidationError);
  });
});
