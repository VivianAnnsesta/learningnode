import { prisma } from "../prisma";
import { randomUUID } from "node:crypto";
import { AiLogPersistenceError, buildJsonRepairPrompt, evidenceSerializer, scopedSkeletonRepair } from "./generationEvidence";
import { aiFailureReference, validationIssues } from "./validationEvidence";
import { sameUnresolvedPlanningIssues } from "./planningReviewPolicy";
import { hasStageRepairableFindings, validateMapDraftQualityRepair } from "./mapDraftRepair";
import {
  getLongTermReviewSummary,
  type RoadmapInput,
  type RoadmapModuleInput,
  type RoadmapStageInput,
  validateRoadmapInput
} from "../learning/roadmapService";
import {
  createOpenAiCompatibleProvider,
  readOpenAiCompatibleConfig
} from "./openaiCompatibleProvider";
import {
  AiConfigurationError,
  AiProviderError,
  type AiProvider,
  type AiGenerateTextResult,
  type AiResearchSource,
  type AiTaskType,
  truncateForLog
} from "./provider";
import {
  buildCourseDesignPrompt,
  buildCourseDesignRepairPrompt,
  buildCourseDesignCritiquePrompt,
  buildTaskBriefPrompt,
  buildDiagnosticEvaluationPrompt,
  buildDiagnosticPrompt,
  buildIslandReactivationPrompt,
  buildKnowledgeGraphOrganizerPrompt,
  buildLearningHintPrompt,
  buildLongTermReviewInsightPrompt,
  buildRelationExplanationPrompt,
  buildRelationCandidatePrompt,
  buildRelationReactivationPrompt,
  buildRoadmapSkeletonPrompt,
  buildRoadmapSkeletonCritiquePrompt,
  buildRoadmapSkeletonRepairPrompt,
  buildMapDraftQualityReviewPrompt,
  buildMapDraftQualityRepairPrompt,
  buildRoadmapStageQualityRepairPrompt,
  buildRoadmapStagePrompt,
  type CourseDesignDraft,
  type TaskBriefDraft,
  buildTransferChallengePrompt,
  AiTaskValidationError,
  parseJsonObjectFromModel,
  validateTaskBriefDraft,
  validateCourseDesignDraft,
  validateCourseDesignCritique,
  validateDiagnosticEvaluation,
  validateDiagnosticDraft,
  validateIslandReactivationPlan,
  validateKnowledgeGraphOrganizer,
  validateLearningHint,
  validateLongTermReviewInsight,
  validateRelationExplanation,
  validateRelationCandidates,
  validateRelationReactivationPlan,
  validateRoadmapDraft,
  validateRoadmapSkeletonDraft,
  validateRoadmapSkeletonCritique,
  validateRoadmapSkeletonReview,
  validateMapDraftQualityReview,
  validateRoadmapStageDraft,
  validateTransferChallenge,
  buildSourceRelevanceCheckPrompt,
  validateSourceRelevanceCheck,
  type RoadmapSkeletonDraft
} from "./tasks";
import { tutorSystemPolicy } from "./tutorPolicy";
import { getKnowledgeGraph } from "../learning/knowledgeGraphService";
import {
  KnowledgeRelationError,
  listKnowledgeRelations
} from "../learning/knowledgeService";
import {
  assertCourseResearchInputs,
  saveCourseDesignDraft
} from "../learning/courseDesignService";
import { groundCourseSources } from "../learning/sourceGroundingService";
import {
  scoreSourceRelevance,
  buildSourceRelevanceQuery
} from "../learning/sourceRelevanceService";

type AiTaskRunInput<T> = {
  canvasId?: string;
  domainId?: string;
  taskType: AiTaskType;
  inputSummary: string;
  userPrompt: string;
  validate(value: unknown): T;
  timeoutMs?: number;
  maxTokens?: number;
  requiresWebResearch?: boolean;
  promptVersion?: string;
  systemPrompt?: string;
  singleAttempt?: boolean;
};

type AiTaskRunPolicy = {
  timeoutMs: number;
  maxTokens: number;
};

const defaultTaskRunPolicy: AiTaskRunPolicy = {
  timeoutMs: 60000,
  maxTokens: 3000
};

const aiTaskRunPolicies: Partial<Record<AiTaskType, AiTaskRunPolicy>> = {
  task_brief_generation: { timeoutMs: 90000, maxTokens: 6000 },
  course_design_research: { timeoutMs: 120000, maxTokens: 20000 },
  course_design_regeneration: { timeoutMs: 120000, maxTokens: 20000 },
  course_design_repair: { timeoutMs: 90000, maxTokens: 16000 },
  course_design_critique: { timeoutMs: 120000, maxTokens: 20000 },
  source_relevance_check: { timeoutMs: 60000, maxTokens: 4000 },
  roadmap_skeleton_generation: { timeoutMs: 180000, maxTokens: 24000 },
  roadmap_skeleton_critique: { timeoutMs: 180000, maxTokens: 24000 },
  roadmap_skeleton_repair: { timeoutMs: 180000, maxTokens: 24000 },
  roadmap_stage_generation: { timeoutMs: 120000, maxTokens: 9000 },
  roadmap_stage_critique: { timeoutMs: 180000, maxTokens: 24000 },
  roadmap_stage_repair: { timeoutMs: 180000, maxTokens: 24000 },
  roadmap_generation: { timeoutMs: 300000, maxTokens: 24000 },
  diagnostic_generation: { timeoutMs: 60000, maxTokens: 3500 },
  answer_evaluation: { timeoutMs: 45000, maxTokens: 1800 },
  learning_feedback: { timeoutMs: 45000, maxTokens: 1800 },
  hint_generation: { timeoutMs: 30000, maxTokens: 1200 },
  practice_generation: { timeoutMs: 45000, maxTokens: 2200 },
  node_segment_preparation: { timeoutMs: 90000, maxTokens: 9000 },
  node_lesson_review: { timeoutMs: 60000, maxTokens: 2500 },
  node_knowledge_check: { timeoutMs: 90000, maxTokens: 9000 },
  node_framework_correction: { timeoutMs: 90000, maxTokens: 9000 },
  node_lesson_repair: { timeoutMs: 90000, maxTokens: 9000 },
  node_lesson_preparation: { timeoutMs: 90000, maxTokens: 6000 },
  node_lesson_feedback: { timeoutMs: 45000, maxTokens: 1800 },
  node_lesson_help: { timeoutMs: 45000, maxTokens: 1800 },
  relation_candidate_generation: { timeoutMs: 60000, maxTokens: 3500 },
  knowledge_graph_organization: { timeoutMs: 60000, maxTokens: 3000 },
  relation_explanation: { timeoutMs: 45000, maxTokens: 1800 },
  transfer_challenge_generation: { timeoutMs: 45000, maxTokens: 1800 },
  reactivation_plan_generation: { timeoutMs: 60000, maxTokens: 3000 },
  long_term_review_generation: { timeoutMs: 90000, maxTokens: 4500 },
  provider_test: { timeoutMs: 15000, maxTokens: 80 }
};

const resolveTaskRunPolicy = (input: AiTaskRunInput<unknown>): AiTaskRunPolicy => {
  const defaults = aiTaskRunPolicies[input.taskType] || defaultTaskRunPolicy;
  const timeoutMs =
    input.timeoutMs && input.timeoutMs > defaults.timeoutMs
      ? input.timeoutMs
      : defaults.timeoutMs;
  return {
    timeoutMs,
    maxTokens: input.maxTokens || defaults.maxTokens
  };
};

const getProviderMeta = () => ({
  provider: process.env.AI_PROVIDER?.trim() || "unconfigured",
  model: process.env.AI_MODEL?.trim() || null
});

async function writeAiCallLog(input: {
  canvasId?: string;
  domainId?: string;
  taskType: AiTaskType;
  provider: string;
  model?: string | null;
  status: "pending" | "success" | "failed";
  inputSummary: string;
  outputSummary?: string | null;
  errorMessage?: string | null;
  latencyMs?: number;
  providerRequestId?: string | null;
  researchSources?: AiResearchSource[];
  promptVersion?: string | null;
  runId?: string;
  attempt?: number;
  retryOfLogId?: string | null;
  retryReason?: string;
  failureStage?: string | null;
  requestMessagesJson?: string | null;
  finishedAt?: Date;
}) {
  return prisma.aiCallLog.create({
    data: {
      canvasId: input.canvasId,
      domainId: input.domainId,
      taskType: input.taskType,
      provider: input.provider,
      model: input.model,
      status: input.status,
      inputSummary: truncateForLog(input.inputSummary),
      outputSummary: input.outputSummary
        ? truncateForLog(input.outputSummary)
        : null,
      errorMessage: input.errorMessage
        ? truncateForLog(input.errorMessage, 2000)
        : null,
      latencyMs: input.latencyMs,
      providerRequestId: input.providerRequestId || null,
      researchSourcesJson: input.researchSources?.length
        ? JSON.stringify(input.researchSources)
        : null,
      promptVersion: input.promptVersion || null,
      runId: input.runId,
      attempt: input.attempt,
      retryOfLogId: input.retryOfLogId,
      retryReason: input.retryReason,
      failureStage: input.failureStage,
      requestMessagesJson: input.requestMessagesJson,
      finishedAt: input.finishedAt
    }
  });
}

function createProviderForTask(): AiProvider {
  return createOpenAiCompatibleProvider(readOpenAiCompatibleConfig());
}

const retryableStatusCodes = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function isRetryableAiTaskError(error: unknown) {
  if (error instanceof AiConfigurationError) return false;
  if (error instanceof AiProviderError) {
    if (error.status && retryableStatusCodes.has(error.status)) return true;
    const message = error.message.toLowerCase();
    return (
      message.includes("timed out") ||
      message.includes("timeout") ||
      message.includes("network") ||
      message.includes("fetch") ||
      message.includes("did not include assistant text")
    );
  }
  return false;
}

function transientAttemptLimit(taskType: AiTaskType) {
  return (
    taskType === "course_design_repair" ||
    taskType === "course_design_critique" ||
    taskType === "source_relevance_check" ||
    taskType === "roadmap_skeleton_critique" ||
    taskType === "roadmap_skeleton_repair" ||
    taskType === "roadmap_stage_critique" ||
    taskType === "roadmap_stage_repair"
      ? 1
      : taskType === "course_design_research" ||
          taskType === "course_design_regeneration"
        ? 2
        : taskType === "roadmap_generation"
          ? 3
          : 2);
}

export async function runJsonTask<T>(input: AiTaskRunInput<T>) {
  const runId = randomUUID();
  const callIds: string[] = [];
  const policy = resolveTaskRunPolicy(input);
  let providerMeta = getProviderMeta();
  let provider: AiProvider;
  let previousRaw = "";
  let previousParsed: unknown;
  let scopedRepair:ReturnType<typeof scopedSkeletonRepair> = null;
  const reference = (error: unknown) => {
    const value = error instanceof Error ? error : new Error("AI task failed.");
    return Object.assign(value, { aiRunId: runId, aiCallLogId: callIds.at(-1), aiCallLogIds: [...callIds] });
  };

  try {
    provider = createProviderForTask();
    providerMeta = {
      provider: provider.config.provider,
      model: provider.config.model
    };

  } catch (error) {
    const safe = evidenceSerializer([process.env.ENGLISHNODE_LOCAL_API_TOKEN]);
    try {
      const log = await writeAiCallLog({ ...input, ...providerMeta, inputSummary: safe.text(input.inputSummary), status: "failed", runId, attempt: 1, retryReason: "initial", failureStage: "configuration", finishedAt: new Date(),
        errorMessage: safe.text(error instanceof Error ? error.message : "AI configuration failed."),
        requestMessagesJson: safe.json([{role:"system",content:input.systemPrompt || tutorSystemPolicy},{role:"user",content:input.userPrompt}]) });
      callIds.push(log.id);
    } catch { throw reference(new AiLogPersistenceError()); }
    throw reference(error);
  }

  const safe = evidenceSerializer([provider.config.apiKey, process.env.ENGLISHNODE_LOCAL_API_TOKEN]);
  const execute = async (userPrompt: string, initialReason: "initial" | "validation") => {
    let retryReason: string = initialReason;
    const limit = input.singleAttempt ? 1 : transientAttemptLimit(input.taskType);
    for (let transportAttempt = 1; transportAttempt <= limit; transportAttempt++) {
      const startedAt = Date.now();
      const messages = [{ role: "system" as const, content: input.systemPrompt || tutorSystemPolicy }, { role: "user" as const, content: userPrompt }];
      let log: Awaited<ReturnType<typeof writeAiCallLog>>;
      try {
        log = await writeAiCallLog({ ...input, ...providerMeta, status: "pending", inputSummary: safe.text(input.inputSummary), runId, attempt: callIds.length + 1,
          retryOfLogId: callIds.at(-1) || null, retryReason, requestMessagesJson: safe.json(messages) });
      } catch { throw reference(new AiLogPersistenceError()); }
      callIds.push(log.id);
      const save = async (data: Parameters<typeof prisma.aiCallLog.update>[0]["data"]) => {
        try { return await prisma.aiCallLog.update({ where: { id: log.id }, data }); }
        catch { throw reference(new AiLogPersistenceError()); }
      };
      const responseFields = (response: AiGenerateTextResult) => ({
        rawOutput: safe.text(response.text), providerResponseJson: safe.json(response.raw), providerRequestId: response.providerRequestId ? safe.text(response.providerRequestId) : null,
        researchSourcesJson: response.sources?.length ? safe.json(response.sources) : null
      });
      const fail = async (error: unknown, failureStage: string, fields = {}) => save({
        ...fields, status: "failed", failureStage, errorMessage: safe.text(error instanceof Error ? error.message : "AI task failed."),
        latencyMs: Date.now() - startedAt, finishedAt: new Date(),
        ...(failureStage === "validation" || failureStage === "json_parse" ? { validationIssuesJson: safe.json(validationIssues(error)) } : {})
      });
      let response: AiGenerateTextResult;
      try {
        response = await provider.generateText({ taskType: input.taskType, responseFormat: "json_object", timeoutMs: policy.timeoutMs, maxTokens: policy.maxTokens, requiresWebResearch: input.requiresWebResearch, messages });
      } catch (error) {
        await fail(error, "provider", error instanceof AiProviderError && error.response ? responseFields(error.response) : {});
        if (transportAttempt < limit && isRetryableAiTaskError(error)) { retryReason = "transport"; continue; }
        throw reference(error);
      }
      // Save the original response before any parsing or normalization can fail.
      await save(responseFields(response));
      previousRaw = response.text;
      previousParsed = undefined;
      let parsed: unknown;
      try { parsed = parseJsonObjectFromModel(response.text); }
      catch (error) { await fail(error, "json_parse"); throw reference(error); }
      previousParsed = parsed;
      await save({ parsedOutputJson: safe.json(parsed) });
      let data: T;
      try { data = input.validate(scopedRepair?scopedRepair.merge(parsed):parsed); }
      catch (error) { await fail(error, "validation"); throw reference(error); }
      const completed = await save({ status: "success", validatedOutputJson: safe.json(data), outputSummary: truncateForLog(safe.json(data) || ""), failureStage: null,
        latencyMs: Date.now() - startedAt, finishedAt: new Date() });
      return { data, log: completed, providerRequestId: response.providerRequestId, researchSources: response.sources || [], aiCallLogIds: [...callIds], aiRunId: runId };
    }
    throw reference(new Error("AI retry attempts exhausted."));
  };
  try { return await execute(input.userPrompt, "initial"); }
  catch (error) {
    if (!(error instanceof AiTaskValidationError) || input.singleAttempt || input.taskType === "course_design_repair") throw error;
    const issues=validationIssues(error);
    if(input.taskType==="roadmap_skeleton_generation") scopedRepair=scopedSkeletonRepair(previousParsed,issues);
    return execute(scopedRepair?.prompt || buildJsonRepairPrompt({originalPrompt:input.userPrompt,rawOutput:previousRaw,parsedCandidate:previousParsed,issues}), "validation");
  }
}

const normalizeLine = (value?: string | null) => value?.trim() || "待你进一步确认";

const normalizeFocusText = (
  value?: string | null,
  fallback = "待你进一步确认",
  maxLength = 24
) => {
  const trimmed = value
    ?.replace(/\s+/g, " ")
    .replace(/[。！？.!?；;：:、]+$/g, "")
    .trim();

  if (!trimmed) {
    return fallback;
  }

  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength)}...`;
};

const joinFocusText = (
  parts: Array<string | null | undefined>,
  fallback: string,
  separator = " / "
) => {
  const normalized = parts
    .map((part) => normalizeFocusText(part, ""))
    .filter(Boolean);

  if (!normalized.length) {
    return fallback;
  }

  return normalized.join(separator);
};

function buildLocalTaskBriefDraft(domain: {
  name: string;
  description?: string | null;
  currentLevel?: string | null;
  goal?: string | null;
  scope?: string | null;
  excludedScope?: string | null;
  depth?: string | null;
  outputType?: string | null;
  outputTarget?: string | null;
  taskBrief?: string | null;
}): TaskBriefDraft {
  const goal = normalizeLine(domain.goal);
  const scope = normalizeLine(domain.scope);
  const excludedScope = normalizeLine(domain.excludedScope);
  const depth = normalizeLine(domain.depth);
  const outputType = normalizeLine(domain.outputType);
  const outputTarget = normalizeLine(domain.outputTarget);
  const background = normalizeLine(domain.description);
  const currentLevel = normalizeLine(domain.currentLevel);

  return {
    taskBrief: [
      `学习领域：${domain.name}`,
      `学习目标：${goal}`,
      `当前水平自评：${currentLevel}`,
      `当前水平证据：${background}`,
      `学习范围：${scope}`,
      `排除范围：${excludedScope}`,
      `学习深度：${depth}`,
      `预期产出类型：${outputType}`,
      `具体产出描述：${outputTarget}`,
      "建议做法：先确认核心概念和边界，再按领域地图逐步推进知识点、诊断和复盘。",
      "评估方式：通过知识点完成情况、诊断表现、关系沉淀和最终产出综合判断。"
    ].join("\n"),
    summary: `先围绕“${domain.name}”明确目标、范围和产出，再进入可确认的学习地图。`,
    successCriteria: [
      "能用自己的话复述学习目标和范围",
      "已确认至少一版可执行的领域地图",
      "每个阶段都有清晰的完成标志",
      "最终产出可以被展示、解释或应用"
    ],
    risks: [
      "范围过大时容易把地图做成资料清单而不是学习路线",
      "缺少排除范围会让后续节点不断膨胀",
      "如果只追求看懂，诊断和迁移环节会失去意义"
    ]
  };
}

function buildLocalCourseDesignDraft(domain: {
  name: string;
  taskBrief?: string | null;
}): CourseDesignDraft {
  const taskBriefSnapshot = normalizeLine(domain.taskBrief);
  const draft = {
    taskBriefSnapshot,
    globalExplanation: {
      theorySkeleton: `需要围绕“${domain.name}”先建立基本对象、核心问题、最小先修链和可迁移概念，但当前没有可验证的网络研究结果。`,
      sourceBasis: "尚未获得可用来源链接。请配置支持联网搜索或能返回来源链接的网络模型 API 后重新生成。",
      optimizationRationale: "在没有来源校验前，只能保留先修关系优先、目标匹配其次、认知负担再次的保守排序原则。",
      risksAndValidation: "该结果不能作为已通过研究的课程设计方向，必须重新搜索并通过来源链接、全局说明和风险校验后才能生成领域地图。"
    },
    sources: [],
    keyTradeoffs: ["本地 fallback 只能说明设计原则，不能替代网络研究。"]
  };

  return {
    ...draft,
    qualityGate: {
      passed: false,
      missing: ["sources"]
    }
  };
}

function selectLocalRoadmapProfile(domain: {
  name: string;
  goal?: string | null;
  scope?: string | null;
  outputType?: string | null;
  outputTarget?: string | null;
  taskBrief?: string | null;
}) {
  const joined = [
    domain.name,
    domain.goal,
    domain.scope,
    domain.outputType,
    domain.outputTarget,
    domain.taskBrief
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    /编程|程序|代码|软件|前端|后端|算法|typescript|javascript|python|rust|java|react|next/.test(
      joined
    )
  ) {
    return {
      foundationStageTitle: "建立问题、环境与最小可运行闭环",
      coreStageTitle: "掌握核心抽象与实现方法",
      outputStageTitle: "项目化应用与代码沉淀",
      foundationModuleTitle: "目标、环境和最小程序",
      coreModuleTitle: "核心概念、接口和调试方法",
      mistakeModuleTitle: "常见 bug 与边界条件",
      applicationModuleTitle: "项目任务与验收",
      graphModuleTitle: "代码知识图谱沉淀",
      keyConceptTitle: `${domain.name} 的核心抽象`,
      methodTitle: `${domain.name} 的实现与调试方法`,
      mistakeTitle: `${domain.name} 的常见 bug`,
      applicationTitle: `${domain.name} 的项目练习`,
      mapTitle: `${domain.name} 的代码知识图谱`
    };
  }

  if (/英语|日语|中文|语言|语法|口语|听力|阅读|写作|单词|词汇/.test(joined)) {
    return {
      foundationStageTitle: "建立输入目标与语言使用场景",
      coreStageTitle: "掌握核心规则与表达模式",
      outputStageTitle: "输出训练与语言知识沉淀",
      foundationModuleTitle: "目标、材料和使用场景",
      coreModuleTitle: "规则、例句和表达边界",
      mistakeModuleTitle: "易混表达与误用边界",
      applicationModuleTitle: "听说读写输出任务",
      graphModuleTitle: "语言知识图谱沉淀",
      keyConceptTitle: `${domain.name} 的核心规则`,
      methodTitle: `${domain.name} 的表达方法`,
      mistakeTitle: `${domain.name} 的常见误用`,
      applicationTitle: `${domain.name} 的输出练习`,
      mapTitle: `${domain.name} 的语言知识图谱`
    };
  }

  if (/数学|物理|化学|科学|函数|代数|几何|微积分|概率|统计|机器学习/.test(joined)) {
    return {
      foundationStageTitle: "建立对象、定义与基本问题",
      coreStageTitle: "掌握定理结构与解题方法",
      outputStageTitle: "应用、证明与迁移沉淀",
      foundationModuleTitle: "对象、定义和问题空间",
      coreModuleTitle: "核心概念、定理和方法",
      mistakeModuleTitle: "反例、条件和易错点",
      applicationModuleTitle: "题目应用与证明训练",
      graphModuleTitle: "概念关系图谱沉淀",
      keyConceptTitle: `${domain.name} 的核心定义`,
      methodTitle: `${domain.name} 的基本方法`,
      mistakeTitle: `${domain.name} 的常见误区与反例`,
      applicationTitle: `${domain.name} 的应用题训练`,
      mapTitle: `${domain.name} 的概念关系图谱`
    };
  }

  return {
    foundationStageTitle: "建立问题空间",
    coreStageTitle: "掌握核心概念",
    outputStageTitle: "应用与沉淀",
    foundationModuleTitle: "目标与范围",
    coreModuleTitle: "核心概念与方法",
    mistakeModuleTitle: "误区与边界",
    applicationModuleTitle: "场景化应用",
    graphModuleTitle: "诊断与图谱沉淀",
    keyConceptTitle: `${domain.name} 的关键概念`,
    methodTitle: `${domain.name} 的基本方法`,
    mistakeTitle: `${domain.name} 的常见误区`,
    applicationTitle: `${domain.name} 的应用练习`,
    mapTitle: `${domain.name} 的知识体系图谱`
  };
}

function buildLocalRoadmapDraft(domain: {
  name: string;
  goal?: string | null;
  scope?: string | null;
  depth?: string | null;
  outputType?: string | null;
  outputTarget?: string | null;
  taskBrief?: string | null;
}): RoadmapInput {
  const goal = normalizeLine(domain.goal);
  const scope = normalizeLine(domain.scope);
  const depth = normalizeLine(domain.depth);
  const outputType = normalizeLine(domain.outputType);
  const outputTarget = normalizeLine(domain.outputTarget);
  const profile = selectLocalRoadmapProfile(domain);
  const goalFocus = normalizeFocusText(domain.goal, domain.name);
  const scopeFocus = normalizeFocusText(domain.scope, domain.name);
  const depthFocus = normalizeFocusText(domain.depth, "可执行深度");
  const outputTypeFocus = normalizeFocusText(domain.outputType, "可检查产出");
  const outputTargetFocus = normalizeFocusText(
    domain.outputTarget,
    domain.goal || domain.name
  );
  const outputFocus = joinFocusText(
    [domain.outputType, domain.outputTarget],
    outputTargetFocus
  );

  return {
    title: `${domain.name} 领域地图草稿`,
    status: "draft",
    stages: [
      {
        title: `${profile.foundationStageTitle}：聚焦${goalFocus}`,
        goal: `先把“${goalFocus}”拆成可执行问题，并用“${scopeFocus}”限制第一版路线，避免地图失控。`,
        modules: [
          {
            title: `${profile.foundationModuleTitle}：确认目标与边界`,
            goal: `把任务书里的目标“${goalFocus}”和范围“${scopeFocus}”转成学习入口。`,
            items: [
              {
                title: `围绕“${goalFocus}”明确问题与验收`,
                keyQuestion: `如果最终要做到“${goalFocus}”，当前最先要解决的问题是什么？`,
                objective: `明确目标：${goal}；同时确认最终产出会以“${outputFocus}”来验收。`,
                prerequisite: "阅读任务书并确认当前学习动机",
                commonMistake: "把资料收集当成学习目标本身",
                transferPrompt: `换一个相近主题时，“${goalFocus}”这个目标应该如何重写，验收标准又会怎么变？`,
                status: "not_started"
              },
              {
                title: `围绕“${scopeFocus}”建立范围边界`,
                keyQuestion: `这次为了完成“${goalFocus}”，只覆盖“${scopeFocus}”中的哪些部分？`,
                objective: `收敛范围：${scope}；让第一版路线只服务于“${outputTargetFocus}”。`,
                prerequisite: "已经知道当前要解决的问题",
                commonMistake: "把所有相关主题都塞进第一版地图",
                transferPrompt: `如果时间减半，围绕“${scopeFocus}”哪些范围必须保留，哪些可以延后？`,
                status: "not_started"
              }
            ]
          }
        ]
      },
      {
        title: `${profile.coreStageTitle}：覆盖${scopeFocus}`,
        goal: `围绕“${scopeFocus}”建立达到“${depthFocus}”所需的核心概念、基本方法和常见误区。`,
        modules: [
          {
            title: `${profile.coreModuleTitle}：形成稳定主干`,
            goal: `建立一套能支撑“${goalFocus}”并反复调用的稳定骨架。`,
            items: [
              {
                title: `${profile.keyConceptTitle}：支撑“${goalFocus}”`,
                keyQuestion: `如果只保留 3 到 5 个核心概念，哪些概念最直接支撑“${goalFocus}”？`,
                objective: `提炼“${scopeFocus}”里的关键术语、概念及其关系。`,
                prerequisite: "已经确认目标与范围",
                commonMistake: "只记定义，不检查概念之间的边界",
                transferPrompt: `把其中一个核心概念迁移到新的“${outputTypeFocus}”场景时，会发生什么变化？`,
                status: "not_started"
              },
              {
                title: `${profile.methodTitle}：达到“${depthFocus}”`,
                keyQuestion: `为了把“${scopeFocus}”做到“${depthFocus}”，最常用的判断、分析或操作方法是什么？`,
                objective: `达到 ${depth} 深度所需的基础方法，并知道它们各自解决什么问题。`,
                prerequisite: "已具备核心概念的初步理解",
                commonMistake: "背步骤但不知道每一步在解决什么",
                transferPrompt: `换一个案例或输出任务时，这套方法如何保持有效，哪些步骤需要改写？`,
                status: "not_started"
              }
            ]
          },
          {
            title: `${profile.mistakeModuleTitle}：暴露误解与失效条件`,
            goal: `把“${scopeFocus}”里最容易混淆和误用的地方单独拉出来处理。`,
            items: [
              {
                title: `${profile.mistakeTitle}：围绕“${goalFocus}”`,
                keyQuestion: `初学者为了完成“${goalFocus}”，最容易在哪些地方理解错、用错或跳步？`,
                objective: `提前建立反例、边界和失效条件意识，避免为了“${outputTargetFocus}”硬套方法。`,
                prerequisite: "已经接触过一轮核心概念和基本方法",
                commonMistake: "只收正例，不收反例",
                transferPrompt: `面对一个看似能通往“${outputTargetFocus}”但其实不适用的案例，你如何判断？`,
                status: "not_started"
              }
            ]
          }
        ]
      },
      {
        title: `${profile.outputStageTitle}：交付${outputTargetFocus}`,
        goal: `通过练习、诊断和成果沉淀，把“${outputFocus}”做成可检查结果并固定知识。`,
        modules: [
          {
            title: `${profile.applicationModuleTitle}：围绕产出落地`,
            goal: `把概念和方法放进真实“${outputTypeFocus}”任务里。`,
            items: [
              {
                title: `${profile.applicationTitle}：指向“${outputTargetFocus}”`,
                keyQuestion: `如果最终交付是“${outputTargetFocus}”，在真实任务中怎样判断自己真的会用了？`,
                objective: `围绕${outputType}产出：${outputTarget}，做一次贴近真实验收方式的场景练习。`,
                prerequisite: "已具备核心概念和基本方法",
                commonMistake: "只会复述，不会把概念落到具体任务",
                transferPrompt: `把这次“${outputTypeFocus}”练习迁移到另一个相近任务时，哪些条件会变，哪些标准不能变？`,
                status: "not_started"
              }
            ]
          },
          {
            title: `${profile.graphModuleTitle}：诊断与沉淀`,
            goal: `用诊断暴露薄弱点，再把支撑“${goalFocus}”的稳定关系沉淀到图谱。`,
            items: [
              {
                title: `${domain.name} 的阶段诊断：检查“${depthFocus}”`,
                keyQuestion: `如果现在就按“${depthFocus}”标准做一次诊断，最可能暴露哪些薄弱点？`,
                objective: `形成一轮围绕“${outputTargetFocus}”的可复盘诊断记录。`,
                prerequisite: "至少完成一部分核心节点学习",
                commonMistake: "把诊断当成打分，而不是路线调整依据",
                transferPrompt: `诊断后，哪些节点会直接阻碍“${outputTargetFocus}”，哪些节点可以继续前进？`,
                status: "not_started"
              },
              {
                title: `${profile.mapTitle}：服务“${outputTargetFocus}”`,
                keyQuestion: `哪些概念关系已经稳定到足以支撑“${outputTargetFocus}”，可以正式沉淀？`,
                objective: `把确认过的概念关系沉淀为图谱成果，后续可直接服务于“${goalFocus}”。`,
                prerequisite: "已有完成节点和可解释的关系",
                commonMistake: "把猜测关系直接当成已确认知识",
                transferPrompt: `如果为了“${outputTargetFocus}”新增一个概念，它应接入现有图谱的哪里，为什么？`,
                status: "not_started"
              }
            ]
          }
        ]
      }
    ]
  };
}

function buildLocalRoadmapSkeleton(domain: {
  name: string;
  goal?: string | null;
  scope?: string | null;
  depth?: string | null;
  outputType?: string | null;
  outputTarget?: string | null;
  taskBrief?: string | null;
}): RoadmapSkeletonDraft {
  const localDraft = buildLocalRoadmapDraft(domain);
  const stages = (localDraft.stages ?? []).map((stage, stageIndex) => ({
    key: `stage-${stageIndex + 1}`,
    title: stage.title || `Stage ${stageIndex + 1}`,
    goal: stage.goal || null,
    coreTopics: (stage.modules ?? [])
      .map((roadmapModule) => roadmapModule.title?.trim() || "")
      .filter(Boolean)
      .slice(0, 12),
    prerequisiteStageTitles: [],
    prerequisiteStageKeys: []
  }));

  return {
    title: localDraft.title || `${domain.name} roadmap skeleton`,
    status: "draft",
    stages
  };
}

function buildFallbackModuleForSkeletonStage(
  domain: { name: string },
  stage: RoadmapSkeletonDraft["stages"][number]
): RoadmapModuleInput {
  const topics = stage.coreTopics.length ? stage.coreTopics : [stage.title];
  return {
    title: topics[0] || stage.title,
    goal: stage.goal,
    items: topics.slice(0, 4).map((topic, topicIndex) => ({
      key: `${stage.key}-node-${topicIndex + 1}`,
      title: topic,
      keyQuestion: `${topic} solves which learning problem in ${domain.name}?`,
      objective: `Explain ${topic} and connect it to the current stage goal.`,
      prerequisite: stage.prerequisiteStageTitles.join(", ") || "Confirmed task brief",
      commonMistake: "Treating the topic as an isolated fact instead of a prerequisite-linked idea.",
      transferPrompt: `Use ${topic} in a different problem context and state what changes.`,
      prerequisiteKeys: [],
      status: "not_started"
    }))
  };
}

function buildLocalRoadmapStageDraft(
  domain: {
    name: string;
    goal?: string | null;
    scope?: string | null;
    depth?: string | null;
    outputType?: string | null;
    outputTarget?: string | null;
    taskBrief?: string | null;
  },
  skeleton: RoadmapSkeletonDraft,
  stageIndex: number
): RoadmapStageInput {
  const localDraft = buildLocalRoadmapDraft(domain);
  const skeletonStage = skeleton.stages[stageIndex];
  const localStage = localDraft.stages?.[stageIndex];

  if (localStage) {
    return {
      ...localStage,
      key: skeletonStage?.key || `stage-${stageIndex + 1}`,
      title: skeletonStage?.title || localStage.title,
      goal: skeletonStage?.goal || localStage.goal,
      status: "expanded",
      rationale: "保留已确认的 Stage 目标与模块方向；当前没有足够学习证据支持偏离。",
      moduleDirections: skeletonStage?.coreTopics || [],
      prerequisiteStageKeys: skeletonStage?.prerequisiteStageKeys || [],
      modules: (localStage.modules || []).map((roadmapModule, moduleIndex) => ({
        ...roadmapModule,
        items: (roadmapModule.items || []).map((item, itemIndex) => ({
          ...item,
          key: `${skeletonStage?.key || `stage-${stageIndex + 1}`}-node-${moduleIndex + 1}-${itemIndex + 1}`,
          prerequisiteKeys: []
        }))
      }))
    };
  }

  return {
    key: skeletonStage?.key || `stage-${stageIndex + 1}`,
    title: skeletonStage?.title || `Stage ${stageIndex + 1}`,
    goal: skeletonStage?.goal || null,
    status: "expanded",
    rationale: "保留已确认的 Stage 目标与模块方向；当前没有足够学习证据支持偏离。",
    moduleDirections: skeletonStage?.coreTopics || [],
    prerequisiteStageKeys: skeletonStage?.prerequisiteStageKeys || [],
    modules: skeletonStage
      ? [buildFallbackModuleForSkeletonStage(domain, skeletonStage)]
      : []
  };
}

async function getLearningNodeTutorContext(nodeId: string) {
  const node = await prisma.learningNode.findUnique({
    where: { id: nodeId },
    include: {
      domain: {
        select: {
          id: true,
          name: true,
          goal: true,
          taskBrief: true
        }
      },
      knowledgePoint: {
        include: {
          coreReviewSessions: {
            orderBy: { createdAt: "desc" },
            take: 1
          }
        }
      }
    }
  });

  if (!node) {
    throw new Error("学习节点不存在");
  }

  return {
    domain: node.domain,
    roadmapItem: {
      id: node.id,
      title: node.title,
      keyQuestion: node.keyQuestion,
      objective: node.objective,
      prerequisite: node.prerequisite,
      commonMistake: node.commonMistake,
      transferPrompt: node.transferPrompt,
      status: node.knowledgePoint?.masteryStatus || node.status,
      linkedKnowledgePointId: node.knowledgePoint?.id || null
    },
    currentUnderstanding: node.knowledgePoint?.userUnderstanding || null,
    currentCoreEssence: node.knowledgePoint?.coreEssence || null
  };
}

const courseDesignResearchDomainSelect = {
  id: true,
  name: true,
  description: true,
  currentLevel: true,
  goal: true,
  scope: true,
  excludedScope: true,
  depth: true,
  outputType: true,
  outputTarget: true,
  taskBrief: true,
  taskBriefConfirmedAt: true
} as const;

const sourceRelevanceCheckDomainSelect = {
  id: true,
  name: true,
  scope: true,
  goal: true,
  courseDesignDraft: true
} as const;

export async function generateCourseDesignDraft(
  domainId: string,
  input: { feedback?: string | null } = {}
) {
  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    select: courseDesignResearchDomainSelect
  });

  if (!domain) {
    throw new Error("学习领域不存在");
  }
  assertCourseResearchInputs(domain);
  if (!domain.taskBriefConfirmedAt) {
    throw new Error("请先确认任务书，再研究课程设计方向。");
  }

  try {
    const taskType = input.feedback?.trim()
      ? "course_design_regeneration"
      : "course_design_research";
    const result = await runJsonTask({
      domainId: domain.id,
      taskType,
      inputSummary: `Research course design direction for domain: ${domain.name}`,
      userPrompt: buildCourseDesignPrompt(domain, input.feedback),
      validate: value => validateCourseDesignDraft(value, true),
      timeoutMs: 45000,
      requiresWebResearch: true,
      promptVersion: "course-design-research-v3-foundations-1-continuity-1"
    });

    const researchedDraft = bindCourseDesignSourcesToResearchEvidence(
      result.data,
      result.researchSources
    );

    const critiqued = await runCourseDesignCritiquePasses({
      domain,
      draft: researchedDraft
    });
    const repaired = await repairCourseDesignUntilValid({
      domain,
      draft: critiqued.draft,
      initialAiCallLogId: result.log.id,
      previousRepairCount: 0
    });
    const finalDraft = await groundDraftSources(
      repaired.draft.qualityReport
        ? repaired.draft
        : { ...repaired.draft, qualityReport: critiqued.draft.qualityReport ?? null },
      domain
    );
    const warnings = [critiqued.warning, repaired.warning].filter(
      (message): message is string => Boolean(message)
    );
    const saved = {
      draft: finalDraft,
      aiCallLogId: repaired.aiCallLogId,
      repairCount: repaired.repair.totalAttempts,
      source: "ai" as const,
      repair: repaired.repair,
      ...(warnings.length > 0 ? { warning: warnings.join("；") } : {})
    };
    await saveCourseDesignDraft(domain.id, saved);
    return saved;
  } catch (error) {
    const draft = buildLocalCourseDesignDraft(domain);
    await saveCourseDesignDraft(domain.id, {
      draft,
      aiCallLogId: null,
      repairCount: 0
    }).catch(() => null);
    return {
      draft,
      aiCallLogId: null,
      source: "fallback" as const,
      repair: emptyCourseDesignRepairSummary(null, 0),
      warning:
        error instanceof Error
          ? error.message
          : "AI 研究课程设计方向失败，已切换为未通过质量门的本地说明。"
    };
  }
}

export type SourceRelevanceCheckResult = {
  draft: CourseDesignDraft | null;
  aiCallLogId: string | null;
  source: "ai" | "fallback";
  warning?: string;
};

/**
 * Independent, advisory AI review of already-grounded course sources.
 * It is NOT mixed into the course-research main call: it runs only on the
 * saved draft's grounded sources (reusing their fetched title/excerpt, so no
 * web research) and returns an enriched draft with `grounding.aiRelevance` for
 * display. It deliberately does not re-persist via `saveCourseDesignDraft` to
 * avoid overwriting `courseDesignAiCallLogId` / resetting `courseDesignConfirmedAt`.
 */
export async function runSourceRelevanceCheck(
  domainId: string
): Promise<SourceRelevanceCheckResult> {
  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    select: sourceRelevanceCheckDomainSelect
  });
  if (!domain) {
    throw new Error("学习领域不存在");
  }

  const originalDraft = domain.courseDesignDraft
    ? validateCourseDesignDraft(JSON.parse(domain.courseDesignDraft))
    : null;
  if (!originalDraft || originalDraft.sources.length === 0) {
    return {
      draft: originalDraft,
      aiCallLogId: null,
      source: "fallback",
      warning: "当前还没有可复核的课程来源。"
    };
  }

  const reviewableSources = originalDraft.sources
    .filter(
      (source) =>
        source.grounding?.ok && (source.grounding.title || source.grounding.excerpt)
    )
    .map((source) => ({
      url: source.url,
      title: source.grounding?.title ?? null,
      excerpt: source.grounding?.excerpt ?? null
    }));

  if (reviewableSources.length === 0) {
    return {
      draft: originalDraft,
      aiCallLogId: null,
      source: "fallback",
      warning: "没有已抓取可达的来源内容可供 AI 复核。"
    };
  }

  try {
    const result = await runJsonTask({
      domainId,
      taskType: "source_relevance_check",
      inputSummary: `AI review source relevance for domain: ${domain.name}`,
      userPrompt: buildSourceRelevanceCheckPrompt({
        domain: {
          name: domain.name,
          scope: domain.scope,
          goal: domain.goal
        },
        sources: reviewableSources
      }),
      validate: (value) => validateSourceRelevanceCheck(value).judgments,
      requiresWebResearch: false
    });

    const aiRelevanceByUrl = new Map(
      result.data.map((judgment) => [judgment.url, judgment])
    );

    const enrichedDraft: CourseDesignDraft = {
      ...originalDraft,
      sources: originalDraft.sources.map((source) => {
        const judgment = aiRelevanceByUrl.get(source.url) || null;
        const aiRelevance = judgment
          ? {
              score: judgment.score,
              lowRelevance: judgment.lowRelevance,
              reason: judgment.reason
            }
          : null;
        return {
          ...source,
          grounding: source.grounding
            ? { ...source.grounding, aiRelevance }
            : source.grounding
        };
      })
    };

    return {
      draft: enrichedDraft,
      aiCallLogId: result.log.id,
      source: "ai" as const
    };
  } catch (error) {
    return {
      draft: originalDraft,
      aiCallLogId: null,
      source: "fallback" as const,
      warning:
        error instanceof Error
          ? `AI 来源相关性复核未完成：${error.message}`
          : "AI 来源相关性复核未完成。"
    };
  }
}

const maxCourseDesignRepairAttempts = 2;
const maxCourseDesignCritiquePasses = 2;

const normalizeResearchUrl = (value: string) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    url.hash = "";
    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.toString();
  } catch {
    return null;
  }
};

function bindCourseDesignSourcesToResearchEvidence(
  draft: CourseDesignDraft,
  evidence: AiResearchSource[]
): CourseDesignDraft {
  const usableEvidence = evidence
    .map((source) => ({ ...source, normalizedUrl: normalizeResearchUrl(source.url) }))
    .filter(
      (source): source is AiResearchSource & { normalizedUrl: string } =>
        Boolean(source.normalizedUrl)
    );
  if (!usableEvidence.length) return draft;

  const modelSourceByUrl = new Map(
    draft.sources
      .map((source) => [normalizeResearchUrl(source.url), source] as const)
      .filter((entry): entry is [string, CourseDesignDraft["sources"][number]] =>
        Boolean(entry[0])
      )
  );
  const deduped = new Map<string, CourseDesignDraft["sources"][number]>();
  for (const source of usableEvidence) {
    const modelSource = modelSourceByUrl.get(source.normalizedUrl);
    deduped.set(source.normalizedUrl, {
      url: source.normalizedUrl,
      title: modelSource?.title || source.title || source.normalizedUrl,
      reason:
        modelSource?.reason ||
        "模型回答引用的联网检索来源；由服务端提取正文后再核验相关性。",
      grounding: null
    });
  }
  return { ...draft, sources: [...deduped.values()].slice(0, 8) };
}

const groundDraftSources = async (
  draft: CourseDesignDraft,
  domain: { name?: string | null; scope?: string | null; goal?: string | null }
): Promise<CourseDesignDraft> => {
  try {
    const digests = await groundCourseSources(
      draft.sources.map((source) => source.url)
    );
    const digestByUrl = new Map(
      draft.sources.map((source, index) => [source.url, digests[index]])
    );
    const relevanceQuery = buildSourceRelevanceQuery({
      name: domain.name,
      scope: domain.scope,
      goal: domain.goal
    });
    return {
      ...draft,
      sources: draft.sources.map((source) => {
        const digest = digestByUrl.get(source.url);
        if (!digest) return { ...source, grounding: null };
        const sourceText = `${digest.title ?? ""} ${digest.excerpt ?? ""}`.trim();
        const relevance =
          digest.ok && sourceText
            ? scoreSourceRelevance(relevanceQuery, sourceText)
            : null;
        return {
          ...source,
          grounding: {
            ok: digest.ok,
            status: digest.status,
            title: digest.title,
            excerpt: digest.excerpt,
            relevance
          }
        };
      })
    };
  } catch {
    return draft;
  }
};

async function runCourseDesignCritiquePasses(input: {
  domain: CourseDesignResearchDomain;
  draft: CourseDesignDraft;
}): Promise<{
  draft: CourseDesignDraft;
  critiqueAiCallLogIds: string[];
  warning?: string;
}> {
  let draft = input.draft;
  const critiqueAiCallLogIds: string[] = [];
  let warning: string | undefined;

  for (let pass = 1; pass <= maxCourseDesignCritiquePasses; pass += 1) {
    draft = await groundDraftSources(draft, input.domain);
    try {
      const result = await runJsonTask({
        domainId: input.domain.id,
        taskType: "course_design_critique",
        inputSummary: `Critique course design direction for domain: ${input.domain.name}; pass ${pass}`,
        userPrompt: buildCourseDesignCritiquePrompt({
          domain: input.domain,
          draft,
          groundedSources: draft.sources.map((source) => ({
            url: source.url,
            ok: source.grounding?.ok ?? false,
            status: source.grounding?.status ?? null,
            title: source.grounding?.title ?? null,
            excerpt: source.grounding?.excerpt ?? null
          }))
        }),
        validate: value => validateCourseDesignCritique(value, draft.courseDesignVersion === 3),
        requiresWebResearch: true,
        promptVersion: "course-design-critique-v3-foundations-1-continuity-1"
      });
      critiqueAiCallLogIds.push(result.log.id);
      const revisedDraft = bindCourseDesignSourcesToResearchEvidence(
        result.data.draft,
        result.researchSources
      );
      draft = {
        ...revisedDraft,
        qualityReport: result.data.report
      };
      if (!result.data.report.significantIssues) break;
    } catch (error) {
      warning =
        error instanceof Error
          ? `课程批判轮未完成：${error.message}`
          : "课程批判轮未完成。";
      break;
    }
  }

  return { draft, critiqueAiCallLogIds, ...(warning ? { warning } : {}) };
}

type CourseDesignResearchDomain = {
  id: string;
  name: string;
  description?: string | null;
  currentLevel?: string | null;
  goal?: string | null;
  scope?: string | null;
  excludedScope?: string | null;
  depth?: string | null;
  outputType?: string | null;
  outputTarget?: string | null;
  taskBrief?: string | null;
  taskBriefConfirmedAt?: Date | null;
};

type CourseDesignRepairSummary = {
  attempted: boolean;
  attempts: number;
  totalAttempts: number;
  succeeded: boolean;
  initialAiCallLogId: string | null;
  aiCallLogIds: string[];
  error?: string;
};

const emptyCourseDesignRepairSummary = (
  initialAiCallLogId: string | null,
  previousRepairCount: number
): CourseDesignRepairSummary => ({
  attempted: false,
  attempts: 0,
  totalAttempts: previousRepairCount,
  succeeded: false,
  initialAiCallLogId,
  aiCallLogIds: []
});

async function repairCourseDesignUntilValid(input: {
  domain: CourseDesignResearchDomain;
  draft: CourseDesignDraft;
  initialAiCallLogId: string | null;
  previousRepairCount: number;
}) {
  let draft = input.draft;
  let aiCallLogId = input.initialAiCallLogId;
  const repair = emptyCourseDesignRepairSummary(
    input.initialAiCallLogId,
    input.previousRepairCount
  );

  while (
    !draft.qualityGate.passed &&
    repair.attempts < maxCourseDesignRepairAttempts
  ) {
    repair.attempted = true;
    repair.attempts += 1;
    repair.totalAttempts = input.previousRepairCount + repair.attempts;

    try {
      const result = await runJsonTask({
        domainId: input.domain.id,
        taskType: "course_design_repair",
        inputSummary: `Repair course design direction for domain: ${input.domain.name}; attempt ${repair.attempts}; missing: ${draft.qualityGate.missing.join(", ")}`,
        userPrompt: buildCourseDesignRepairPrompt({
          domain: input.domain,
          draft,
          missing: draft.qualityGate.missing
        }),
        validate: value => validateCourseDesignDraft(value, true),
        requiresWebResearch: true,
        promptVersion: "course-design-repair-v3-foundations-1-continuity-1"
      });
      draft = bindCourseDesignSourcesToResearchEvidence(
        result.data,
        result.researchSources
      );
      aiCallLogId = result.log.id;
      repair.aiCallLogIds.push(result.log.id);
    } catch (error) {
      repair.error =
        error instanceof Error ? error.message : "AI course design repair failed.";
      if (repair.attempts < maxCourseDesignRepairAttempts) {
        continue;
      }
      break;
    }
  }

  if (draft.qualityGate.passed) delete repair.error;
  repair.succeeded = repair.attempted && draft.qualityGate.passed;
  const warning = draft.qualityGate.passed
    ? undefined
    : repair.error
      ? `课程设计自动修复失败：${repair.error}`
      : `课程设计自动修复 ${repair.attempts} 次后仍未通过质量门：${draft.qualityGate.missing.join(", ")}`;

  return { draft, aiCallLogId, repair, warning };
}

export async function repairCourseDesignDraft(domainId: string) {
  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    select: {
      ...courseDesignResearchDomainSelect,
      courseDesignDraft: true,
      courseDesignRepairCount: true,
      courseDesignAiCallLogId: true
    }
  });

  if (!domain) throw new Error("学习领域不存在");
  assertCourseResearchInputs(domain);
  if (!domain.taskBriefConfirmedAt) {
    throw new Error("请先确认任务书，再修复课程设计方向。");
  }
  if (!domain.courseDesignDraft) throw new Error("请先生成课程设计方向。");

  const draft = validateCourseDesignDraft(JSON.parse(domain.courseDesignDraft));
  if (draft.qualityGate.passed) {
    throw new Error("课程设计方向已通过质量门，无需修复。");
  }

  const repaired = await repairCourseDesignUntilValid({
    domain,
    draft,
    initialAiCallLogId: domain.courseDesignAiCallLogId,
    previousRepairCount: domain.courseDesignRepairCount
  });
  const saved = {
    draft: repaired.draft,
    aiCallLogId: repaired.aiCallLogId,
    repairCount: repaired.repair.totalAttempts,
    source: repaired.aiCallLogId ? ("ai" as const) : ("fallback" as const),
    repair: repaired.repair,
    ...(repaired.warning ? { warning: repaired.warning } : {})
  };
  await saveCourseDesignDraft(domain.id, saved);
  return saved;
}

async function getBatchRoadmapDraftDomain(domainId: string) {
  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    select: {
      id: true,
      name: true,
      description: true,
      currentLevel: true,
      goal: true,
      scope: true,
      excludedScope: true,
      depth: true,
      outputType: true,
      outputTarget: true,
      taskBrief: true
    }
  });

  if (!domain) {
    throw new Error("学习领域不存在。");
  }
  return domain;
}

function assertConfirmedCourseDesignForBatchRoadmap(
  courseDesign?: CourseDesignDraft | null
): asserts courseDesign is CourseDesignDraft {
  if (!courseDesign) {
    throw new Error("请先确认课程设计方向，再生成领域地图。");
  }
  if (!courseDesign.qualityGate.passed) {
    throw new Error("课程设计方向未通过质量门禁，不能生成领域地图。");
  }
}

export async function generateRoadmapSkeletonDraft(
  domainId: string,
  input: { courseDesign?: CourseDesignDraft | null } = {}
) {
  const domain = await getBatchRoadmapDraftDomain(domainId);
  assertConfirmedCourseDesignForBatchRoadmap(input.courseDesign);
  const courseDesign = input.courseDesign;

  const generation = await runJsonTask({
    canvasId: domain.id,
    domainId: domain.id,
    taskType: "roadmap_skeleton_generation",
    inputSummary: `Generate layered roadmap skeleton for domain: ${domain.name}`,
    userPrompt: buildRoadmapSkeletonPrompt(domain, courseDesign),
    validate: value => {
      const skeleton = validateRoadmapSkeletonDraft(value);
      if (skeleton.planningVersion !== 3) {
        throw new AiTaskValidationError("新路线骨架必须使用 planningVersion=3 的分层蓝图。", [{ code: "invalid_planning_version", path: "planningVersion", message: "新路线骨架必须使用 planningVersion=3 的分层蓝图。" }]);
      }
      if (skeleton.contentCoverageVersion !== 1) {
        throw new AiTaskValidationError("新骨架需要具体内容问题登记表。", [{code:"missing_content_coverage",path:"learningGoals",message:"请返回 contentCoverageVersion=1 及每个目标的 contentQuestions，模块用 contentQuestionKey 引用；父级覆盖由系统汇总。"}]);
      }
      return skeleton;
    },
    promptVersion: "roadmap-skeleton-generation-v3-content-coverage-1-foundations-1-continuity-1"
  });
  const aiCallLogIds = [...generation.aiCallLogIds];
  let review;
  try {
    review = await runJsonTask({
      canvasId: domain.id,
      domainId: domain.id,
      taskType: "roadmap_skeleton_critique",
      inputSummary: `Independently review layered roadmap skeleton for domain: ${domain.name}`,
      userPrompt: buildRoadmapSkeletonCritiquePrompt({
        domain,
        courseDesign,
        skeleton: generation.data,
        deterministicIssues: generation.data.planningWarnings
      }),
      validate: value => validateRoadmapSkeletonReview(value, generation.data),
      promptVersion: "roadmap-skeleton-review-v3-critical-1-contributions-2-excerpts-1-continuity-1"
    });
  } catch (error) {
    if (
      !(error instanceof AiProviderError) &&
      !(error instanceof AiConfigurationError)
    ) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "AI 语义复审暂不可用。";
    return {
      skeleton: generation.data,
      aiCallLogId: generation.log.id,
      aiCallLogIds: [generation.log.id],
      qualityReport: {
        status: "blocked" as const,
        summary: "AI 语义复审暂不可用；这不是路线内容缺陷。",
        blockingIssues: [],
        warnings: [
          {
            code: "reviewUnavailable",
            targetKey: null,
            message,
            suggestion: "稍后重试，或在人工核对结构后明确确认风险。"
          }
        ]
      },
      repairAttempts: 0,
      source: "ai" as const,
      reviewAvailability: "unavailable" as const
    };
  }
  aiCallLogIds.push(...review.aiCallLogIds);

  let reviewed = {
    report: review.data,
    draft: generation.data
  };
  let repairAttempts = 0;
  while (reviewed.report.status === "blocked" && repairAttempts < 2) {
    repairAttempts += 1;
    const previous = reviewed;
    try {
    const repair = await runJsonTask({
      canvasId: domain.id,
      domainId: domain.id,
      taskType: "roadmap_skeleton_repair",
      inputSummary: `Repair layered roadmap skeleton for domain: ${domain.name}; pass ${repairAttempts}/2`,
      userPrompt: buildRoadmapSkeletonRepairPrompt({
        domain,
        courseDesign,
        skeleton: reviewed.draft,
        deterministicIssues: reviewed.draft.planningWarnings,
        previousReport: reviewed.report
      }),
      validate: value => validateRoadmapSkeletonCritique(value, reviewed.draft),
      promptVersion: "roadmap-skeleton-repair-v3-critical-1-contributions-2-continuity-1"
    });
    aiCallLogIds.push(...repair.aiCallLogIds);
    reviewed = repair.data;
    if (sameUnresolvedPlanningIssues(previous.report, reviewed.report) && JSON.stringify(previous.draft) === JSON.stringify(reviewed.draft)) {
      reviewed.report.warnings.push({ code: "repairNoProgress", targetKey: null, message: "修复未改变有效草稿或消除已有重大缺陷，已停止重复调用。", suggestion: "保留草稿和问题依据，按原范围重试或切换模型。" });
      break;
    }
    } catch (error) {
      if (!(error instanceof AiTaskValidationError) && !(error instanceof AiProviderError) && !(error instanceof AiConfigurationError)) throw error;
      aiCallLogIds.push(...(aiFailureReference(error).aiCallLogIds || []));
      reviewed = previous;
      reviewed.report.warnings.push({ code: "repairFailed", targetKey: null, message: error.message, suggestion: "最后有效草稿和重大缺陷已保留；可重新修订，失败原文见生成日志。" });
      break;
    }
  }

  if (reviewed.draft.planningVersion !== 3) {
    throw new Error("MAP_QUALITY_BLOCKED: 路线修复结果丢失了分层规划版本。");
  }

  return {
    skeleton: reviewed.draft,
    aiCallLogId: generation.log.id,
    aiCallLogIds,
    qualityReport: reviewed.report,
    repairAttempts,
    source: "ai" as const,
    reviewAvailability: "available" as const
  };
}

export async function reviewRoadmapDraftQuality(
  domainId: string,
  input: {
    courseDesign?: CourseDesignDraft | null;
    draft: RoadmapInput;
    scope: "skeleton" | "stage" | "map";
    stageKey?: string;
  }
) {
  const domain = await getBatchRoadmapDraftDomain(domainId);
  assertConfirmedCourseDesignForBatchRoadmap(input.courseDesign);
  const courseDesign = input.courseDesign;
  const initialDraft = validateRoadmapInput(input.draft);
  if (initialDraft.planningVersion !== 3) {
    throw new Error("旧版未确认草稿必须重新生成分层蓝图。");
  }
  if (input.scope === "stage" && !input.stageKey) {
    throw new Error("阶段复核需要提供目标 Stage key。");
  }
  if (input.stageKey && !initialDraft.stages.some(stage => stage.key === input.stageKey && stage.status === "expanded")) {
    throw new Error("只能复核当前草稿中已展开的目标阶段。");
  }

  const aiCallLogIds: string[] = [];
  const critique = await runJsonTask({
    canvasId: domain.id,
    domainId: domain.id,
    taskType: "roadmap_stage_critique",
    inputSummary: `Review persisted ${input.scope} Map Draft for domain: ${domain.name}`,
    userPrompt: buildMapDraftQualityReviewPrompt({
      domain,
      courseDesign,
      draft: initialDraft,
      scope: input.scope
    }),
    validate: value => validateMapDraftQualityReview(value, initialDraft),
    promptVersion: "map-draft-review-v3-critical-1-contributions-2-excerpts-1-continuity-1"
  });
  aiCallLogIds.push(...critique.aiCallLogIds);

  let reviewed = {
    report: critique.data,
    draft: initialDraft
  };
  let repairAttempts = 0;
  while (reviewed.report.status === "blocked" && repairAttempts < 2) {
    if (input.stageKey && !hasStageRepairableFindings(reviewed.report, reviewed.draft, input.stageKey)) break;
    repairAttempts += 1;
    const previous = reviewed;
    try {
    const repair = await runJsonTask({
      canvasId: domain.id,
      domainId: domain.id,
      taskType: "roadmap_stage_repair",
      inputSummary: `Repair ${input.stageKey ? `Stage ${input.stageKey}` : `persisted ${input.scope} Map Draft`} for domain: ${domain.name}; pass ${repairAttempts}/2`,
      userPrompt: input.stageKey ? buildRoadmapStageQualityRepairPrompt({
        domain,
        courseDesign,
        draft: reviewed.draft,
        scope: input.scope,
        stageKey: input.stageKey,
        previousReport: reviewed.report
      }) : buildMapDraftQualityRepairPrompt({
        domain,
        courseDesign,
        draft: reviewed.draft,
        scope: input.scope,
        previousReport: reviewed.report
      }),
      validate: (value) => validateMapDraftQualityRepair(value, reviewed.draft, {
        stageKey: input.stageKey,
        previousReport: reviewed.report,
        criticalPolicy: true
      }),
      promptVersion: input.stageKey ? "stage-scoped-repair-v3-critical-1-contributions-2-continuity-1" : "map-draft-repair-v3-critical-1-contributions-2-continuity-1"
    });
    aiCallLogIds.push(...repair.aiCallLogIds);
    reviewed = repair.data;
    if (sameUnresolvedPlanningIssues(previous.report, reviewed.report) && JSON.stringify(previous.draft) === JSON.stringify(reviewed.draft)) {
      reviewed.report.warnings.push({ code: "repairNoProgress", targetKey: null, message: "修复没有推进已有重大缺陷，已保留草稿并停止重复调用。", suggestion: "核对问题依据，按原范围重试或切换模型。" });
      break;
    }
    } catch (error) {
      if (!(error instanceof AiTaskValidationError) && !(error instanceof AiProviderError) && !(error instanceof AiConfigurationError)) throw error;
      aiCallLogIds.push(...(aiFailureReference(error).aiCallLogIds || []));
      reviewed = previous;
      reviewed.report.warnings.push({ code: "repairFailed", targetKey: input.stageKey || null, message: error.message, suggestion: "最后有效草稿及未解决重大缺陷已保留；失败原文见生成日志。" });
      break;
    }
  }

  return {
    draft: reviewed.draft,
    qualityReport: reviewed.report,
    aiCallLogIds,
    repairAttempts
  };
}

export async function generateRoadmapStageDraft(
  domainId: string,
  input: {
    courseDesign?: CourseDesignDraft | null;
    skeleton: RoadmapSkeletonDraft;
    stageIndex: number;
    knownConcepts?: Array<{key:string;title:string;concept:unknown}>;
  }
) {
  const domain = await getBatchRoadmapDraftDomain(domainId);
  assertConfirmedCourseDesignForBatchRoadmap(input.courseDesign);

  const stageIndex = Math.floor(input.stageIndex);
  if (
    !Number.isFinite(stageIndex) ||
    stageIndex < 0 ||
    stageIndex >= input.skeleton.stages.length
  ) {
    throw new Error("请提供有效的阶段序号。");
  }

  const stage = input.skeleton.stages[stageIndex];
  const visitedNodes = await prisma.learningNode.findMany({
    where: {
      domainId,
      status: { in: ["in_progress", "completed", "mastered", "needs_review"] }
    },
    orderBy: { updatedAt: "desc" },
    take: 40,
    select: {
      title: true,
      status: true,
      knowledgePoint: { select: { userUnderstanding: true } }
    }
  });
  const knownNodes = await prisma.learningNode.findMany({where:{domainId},select:{id:true,mapKey:true,title:true,conceptJson:true}});
  const knownConcepts = input.knownConcepts || knownNodes.map(n=>({key:n.mapKey || n.id,title:n.title,concept:n.conceptJson?JSON.parse(n.conceptJson):null}));
  const learningContext = visitedNodes.map((node) => ({
    title: node.title,
    status: node.status,
    userUnderstanding: node.knowledgePoint?.userUnderstanding || null
  }));
  try {
    const result = await runJsonTask({
      canvasId: domain.id,
      taskType: "roadmap_stage_generation",
      inputSummary: `Generate roadmap stage ${stageIndex + 1}/${input.skeleton.stages.length} for domain: ${domain.name}; stage: ${stage.title}`,
      userPrompt: buildRoadmapStagePrompt({
        domain,
        courseDesign: input.courseDesign,
        skeleton: input.skeleton,
        stage,
        stageIndex,
        learningContext,
        knownConcepts
      }),
      validate: value => validateRoadmapStageDraft(value, true),
      promptVersion: "roadmap-stage-generation-v3-contributions-2-continuity-1"
    });

    return {
      stage: {
        ...result.data,
        key: stage.key,
        status: "expanded",
        rationale:
          result.data.rationale ||
          "保留已确认的 Stage 方向；没有足够证据支持偏离。",
        moduleDirections: result.data.moduleDirections?.length
          ? result.data.moduleDirections
          : stage.coreTopics,
        goalKeys: stage.goalKeys,
        moduleBlueprints: stage.moduleBlueprints,
        problem: stage.problem,
        prerequisiteStageKeys: stage.prerequisiteStageKeys
      },
      stageIndex,
      aiCallLogId: result.log.id,
      aiCallLogIds: [result.log.id],
      source: "ai" as const
    };
  } catch (error) {
    if (input.skeleton.planningVersion === 3) {
      throw error;
    }
    return {
      stage: buildLocalRoadmapStageDraft(domain, input.skeleton, stageIndex),
      stageIndex,
      aiCallLogId: null,
      source: "fallback" as const,
      warning:
        error instanceof Error
          ? error.message
          : "AI 生成领域地图阶段失败，已切换为本地草稿。"
    };
  }
}

export async function generateRoadmapDraft(
  domainId: string,
  input: { courseDesign?: CourseDesignDraft | null } = {}
) {
  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    select: {
      id: true,
      name: true,
      description: true,
      currentLevel: true,
      goal: true,
      scope: true,
      excludedScope: true,
      depth: true,
      outputType: true,
      outputTarget: true,
      taskBrief: true
    }
  });

  if (!domain) {
    throw new Error("学习领域不存在");
  }
  if (!input.courseDesign) {
    throw new Error("请先确认课程设计方向，再生成领域地图。");
  }
  if (input.courseDesign && !input.courseDesign.qualityGate.passed) {
    throw new Error("课程设计方向未通过质量门，不能生成领域地图。");
  }

  try {
    const skeletonResult = await runJsonTask({
      canvasId: domain.id,
      taskType: "roadmap_skeleton_generation",
      inputSummary: `Generate roadmap skeleton for domain: ${domain.name}`,
      userPrompt: buildRoadmapSkeletonPrompt(domain, input.courseDesign),
      validate: validateRoadmapSkeletonDraft
    });
    const skeleton = skeletonResult.data;
    const stageDrafts: RoadmapStageInput[] = [];
    const stageAiCallLogIds: string[] = [];

    for (const [stageIndex, stage] of skeleton.stages.entries()) {
      const result = await runJsonTask({
        canvasId: domain.id,
        taskType: "roadmap_stage_generation",
        inputSummary: `Generate roadmap stage ${stageIndex + 1}/${skeleton.stages.length} for domain: ${domain.name}; stage: ${stage.title}`,
        userPrompt: buildRoadmapStagePrompt({
          domain,
          courseDesign: input.courseDesign,
          skeleton,
          stage,
          stageIndex
        }),
        validate: value => validateRoadmapStageDraft(value, true),
        promptVersion: "roadmap-stage-generation-v3-contributions-2-continuity-1"
      });
      stageDrafts.push(result.data);
      stageAiCallLogIds.push(result.log.id);
    }

    const draft = validateRoadmapDraft({
      title: skeleton.title,
      status: "draft",
      stages: stageDrafts
    });

    return {
      draft,
      skeleton,
      aiCallLogId: stageAiCallLogIds[stageAiCallLogIds.length - 1] || skeletonResult.log.id,
      skeletonAiCallLogId: skeletonResult.log.id,
      stageAiCallLogIds,
      source: "ai" as const
    };
  } catch (error) {
    return {
      draft: buildLocalRoadmapDraft(domain),
      aiCallLogId: null,
      source: "fallback" as const,
      warning: error instanceof Error ? error.message : "AI 生成领域地图失败，已切换为本地草稿。"
    };
  }
}

export async function generateTaskBriefDraft(domainId: string) {
  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    select: {
      id: true,
      name: true,
      description: true,
      currentLevel: true,
      goal: true,
      scope: true,
      excludedScope: true,
      depth: true,
      outputType: true,
      outputTarget: true,
      taskBrief: true
    }
  });

  if (!domain) {
    throw new Error("学习领域不存在");
  }

  try {
    const result = await runJsonTask({
      domainId: domain.id,
      taskType: "task_brief_generation",
      inputSummary: `Generate task brief draft for domain: ${domain.name}`,
      userPrompt: buildTaskBriefPrompt(domain),
      validate: validateTaskBriefDraft,
      promptVersion: "entry-guide-v1",
      timeoutMs: 60000
    });

    const snapshot = JSON.stringify(domain);
    await prisma.$transaction(async tx => {
      const active = await tx.domain.findUnique({where:{id:domainId},select:{id:true,name:true,description:true,currentLevel:true,goal:true,scope:true,excludedScope:true,depth:true,outputType:true,outputTarget:true,taskBrief:true}});
      if(JSON.stringify(active)!==snapshot) throw new Error("生成期间领域信息已改变，请重新生成导引。");
      await tx.domain.update({where:{id:domainId},data:{entryGuideJson:JSON.stringify({draft:result.data,aiCallLogId:result.log.id,inputSnapshot:domain})}});
    });
    return { draft: result.data, aiCallLogId: result.log.id, source: "ai" as const };
  } catch (error) {
    return {
      draft: buildLocalTaskBriefDraft(domain),
      aiCallLogId: null,
      source: "fallback" as const,
      warning: error instanceof Error ? error.message : "AI 生成任务书失败，已切换为本地草稿。"
    };
  }
}

export async function generateDiagnosticDraft(domainId: string) {
  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    select: { id: true, name: true, goal: true, taskBrief: true }
  });

  if (!domain) {
    throw new Error("学习领域不存在");
  }

  const [units, nodes] = await prisma.$transaction([
    prisma.unit.findMany({
      where: { domainId },
      orderBy: { orderIndex: "asc" },
      select: {
        id: true,
        title: true
      }
    }),
    prisma.learningNode.findMany({
      where: { domainId },
      orderBy: { orderIndex: "asc" },
      select: {
        id: true,
        unitId: true,
        moduleTitle: true,
        title: true
      }
    })
  ]);

  const unitMap = new Map(units.map((unit) => [unit.id, unit.title]));
  const roadmapItems = nodes.map((item) => ({
    id: item.id,
    title: item.title,
    context: `${unitMap.get(item.unitId || "") || "未分组单元"} / ${item.moduleTitle || "默认模块"}`
  }));

  if (roadmapItems.length === 0) {
    throw new Error("请先保存路线图，再生成诊断题草稿");
  }

  const allowedIds = new Set(roadmapItems.map((item) => item.id));
  const result = await runJsonTask({
    canvasId: domain.id,
    taskType: "diagnostic_generation",
    inputSummary: `Generate diagnostic draft for domain: ${domain.name}; items: ${roadmapItems.length}`,
    userPrompt: buildDiagnosticPrompt(domain, roadmapItems),
    validate: (value) => validateDiagnosticDraft(value, allowedIds)
  });

  return { draft: result.data, aiCallLogId: result.log.id };
}

export async function evaluateDiagnosticAnswer(answerId: string) {
  const answer = await prisma.diagnosticAnswer.findUnique({
    where: { id: answerId },
    include: {
      question: {
        include: {
          session: {
            include: {
              domain: {
                select: { id: true, name: true, goal: true, taskBrief: true }
              }
            }
          },
          learningNode: true
        }
      }
    }
  });

  if (!answer) {
    throw new Error("诊断回答不存在");
  }

  const domain = answer.question.session.domain;
  const roadmapItem = answer.question.learningNode;
  const result = await runJsonTask({
    canvasId: domain.id,
    taskType: "answer_evaluation",
    inputSummary: `Evaluate diagnostic answer for domain: ${domain.name}; question: ${answer.question.prompt.slice(0, 120)}`,
    userPrompt: buildDiagnosticEvaluationPrompt({
      domain,
      question: {
        prompt: answer.question.prompt,
        questionType: answer.question.questionType,
        expectedAnswer: answer.question.expectedAnswer
      },
      answer: answer.response,
      roadmapItem: roadmapItem
        ? {
            title: roadmapItem.title,
            keyQuestion: roadmapItem.keyQuestion,
            objective: roadmapItem.objective,
            prerequisite: roadmapItem.prerequisite,
            commonMistake: roadmapItem.commonMistake,
            transferPrompt: roadmapItem.transferPrompt,
            status: roadmapItem.status
          }
        : null
    }),
    validate: validateDiagnosticEvaluation
  });

  const assessment = JSON.stringify(result.data);
  const updated = await prisma.diagnosticAnswer.update({
    where: { id: answer.id },
    data: {
      assessment,
      result: result.data.suggestedResult
    }
  });

  return {
    answer: updated,
    evaluation: result.data,
    aiCallLogId: result.log.id,
    updatedRoadmapItemId: null,
    suggestedRoadmapItemUpdate: roadmapItem
      ? {
          roadmapItemId: roadmapItem.id,
          suggestedStatus: result.data.suggestedRoadmapStatus
        }
      : null
  };
}

export async function generateLearningNodeHint(
  nodeId: string,
  input: {
    hintLevel?: number;
    userQuestion?: string | null;
    currentUnderstanding?: string | null;
    currentCoreEssence?: string | null;
  }
) {
  const context = await getLearningNodeTutorContext(nodeId);
  const hintLevel =
    typeof input.hintLevel === "number" &&
    input.hintLevel >= 1 &&
    input.hintLevel <= 5
      ? Math.round(input.hintLevel)
      : 1;

  const result = await runJsonTask({
    canvasId: context.domain.id,
    taskType: "hint_generation",
    inputSummary: `Generate level ${hintLevel} hint for node: ${context.roadmapItem.title}`,
    userPrompt: buildLearningHintPrompt({
      ...context,
      currentUnderstanding:
        input.currentUnderstanding || context.currentUnderstanding,
      currentCoreEssence: input.currentCoreEssence || context.currentCoreEssence,
      userQuestion: input.userQuestion,
      hintLevel
    }),
    validate: validateLearningHint
  });

  return { hint: result.data, aiCallLogId: result.log.id };
}

export async function generateRoadmapItemHint(
  itemId: string,
  input: Parameters<typeof generateLearningNodeHint>[1]
) {
  return generateLearningNodeHint(itemId, input);
}

export async function evaluateLearningNodeAnswer(
  nodeId: string,
  input: {
    userUnderstanding?: string | null;
    coreEssence?: string | null;
  }
) {
  void nodeId;
  void input;
  throw new Error("个人自我解释不再由 AI 复核，请自行保存、修订和确认。");
}

export async function evaluateRoadmapItemLearning(
  itemId: string,
  input: Parameters<typeof evaluateLearningNodeAnswer>[1]
) {
  return evaluateLearningNodeAnswer(itemId, input);
}

export async function generateLearningNodePractice(
  nodeId: string,
  input: {
    userGoal?: string | null;
  }
) {
  const context = await getLearningNodeTutorContext(nodeId);
  const wordId = context.roadmapItem.linkedKnowledgePointId;

  if (!wordId) {
    throw new Error("Complete this learning node before generating practice.");
  }

  const result = await generateTransferChallenge(wordId, {
    canvasId: context.domain.id,
    userGoal: input.userGoal
  });

  return {
    practice: result.challenge,
    aiCallLogId: result.aiCallLogId
  };
}

export async function generateRoadmapItemPractice(
  itemId: string,
  input: Parameters<typeof generateLearningNodePractice>[1]
) {
  return generateLearningNodePractice(itemId, input);
}

type KnowledgePointPromptContext = {
  id: string;
  text: string;
  canvasId: string;
  canvasName: string;
  coreEssence: string | null;
  userUnderstanding: string | null;
  isIsland: boolean;
  islandReason: string | null;
  masteryStatus: string;
};

async function loadKnowledgePointPromptContext(
  pointId: string,
  domainId?: string | null
) {
  const point = await prisma.knowledgePoint.findFirst({
    where: domainId ? { id: pointId, domainId } : { id: pointId },
    include: {
      domain: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!point) {
    return null;
  }

  return {
    id: point.id,
    text: point.title,
    canvasId: point.domainId,
    canvasName: point.domain.name,
    coreEssence: point.coreEssence || null,
    userUnderstanding: point.userUnderstanding || null,
    isIsland: point.isIsland,
    islandReason: point.islandReason || null,
    masteryStatus: point.masteryStatus
  } satisfies KnowledgePointPromptContext;
}

async function loadKnowledgePointPromptContextMap(pointIds: string[]) {
  const uniqueIds = Array.from(new Set(pointIds.filter(Boolean)));
  if (!uniqueIds.length) {
    return new Map<string, KnowledgePointPromptContext>();
  }

  const points = await prisma.knowledgePoint.findMany({
    where: {
      id: { in: uniqueIds }
    },
    include: {
      domain: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  return new Map(
    points.map((point) => [
      point.id,
      {
        id: point.id,
        text: point.title,
        canvasId: point.domainId,
        canvasName: point.domain.name,
        coreEssence: point.coreEssence || null,
        userUnderstanding: point.userUnderstanding || null,
        isIsland: point.isIsland,
        islandReason: point.islandReason || null,
        masteryStatus: point.masteryStatus
      } satisfies KnowledgePointPromptContext
    ])
  );
}

export async function generateRelationCandidates(
  wordId: string,
  input: {
    canvasId?: string | null;
    userQuestion?: string | null;
  }
) {
  const canvasId = input.canvasId?.trim();
  if (!canvasId) {
    throw new Error("canvasId 不能为空");
  }

  const source = await loadKnowledgePointPromptContext(wordId, canvasId);

  if (!source) {
    throw new Error("源知识点不存在或不属于该图谱");
  }

  const sameCanvasTargets = await prisma.knowledgePoint.findMany({
    where: {
      domainId: canvasId,
      id: { not: wordId }
    },
    include: {
      domain: {
        select: {
          id: true,
          name: true
        }
      }
    },
    take: 30
  });

  const wormholeRelations = (await listKnowledgeRelations(canvasId, wordId)).filter(
    (relation) =>
      relation.relationType === "WORMHOLE" && relation.fromWordId === wordId
  );
  const wormholeTargetIds = Array.from(
    new Set(wormholeRelations.map((relation) => relation.toWordId))
  );
  const wormholeTargetMap = await loadKnowledgePointPromptContextMap(wormholeTargetIds);

  const targetMap = new Map(
    sameCanvasTargets.map((target) => [
      target.id,
      {
        id: target.id,
        text: target.title,
        canvasId: target.domainId,
        canvasName: target.domain.name,
        coreEssence: target.coreEssence || null,
        isWormholeTarget: false
      }
    ])
  );
  for (const targetId of wormholeTargetIds) {
    const target = wormholeTargetMap.get(targetId);
    if (!target) continue;
    targetMap.set(targetId, {
      id: target.id,
      text: target.text,
      canvasId: target.canvasId,
      canvasName: target.canvasName,
      coreEssence: target.coreEssence,
      isWormholeTarget: target.canvasId !== canvasId
    });
  }
  const targets = Array.from(targetMap.values()).map((target) => ({
    id: target.id,
    text: target.text,
    canvasId: target.canvasId,
    canvasName: target.canvasName,
    coreEssence: target.coreEssence,
    isWormholeTarget: target.isWormholeTarget
  }));

  if (targets.length === 0) {
    throw new Error("当前没有可用于生成候选关系的目标知识点");
  }

  const allowedTargetIds = new Set(targets.map((target) => target.id));
  const result = await runJsonTask({
    canvasId,
    taskType: "relation_candidate_generation",
    inputSummary: `Generate relation candidates for word: ${source.text}; targets: ${targets.length}`,
    userPrompt: buildRelationCandidatePrompt({
      source: {
        id: source.id,
        text: source.text,
        canvasId: source.canvasId,
        canvasName: source.canvasName,
        userUnderstanding: source.userUnderstanding,
        coreEssence: source.coreEssence,
        isIsland: source.isIsland,
        islandReason: source.islandReason
      },
      targets,
      userQuestion: input.userQuestion
    }),
    validate: (value) => validateRelationCandidates(value, allowedTargetIds)
  });

  return {
    candidates: result.data,
    targets,
    aiCallLogId: result.log.id
  };
}

export async function organizeKnowledgeGraphCoreConcepts(domainId: string) {
  const graph = await getKnowledgeGraph(domainId);
  const allowedKnowledgePointIds = new Set(graph.nodes.map((node) => node.id));

  const result = await runJsonTask({
    canvasId: domainId,
    taskType: "knowledge_graph_organization",
    inputSummary: `Organize knowledge graph for domain: ${domainId}; nodes: ${graph.nodes.length}; relations: ${graph.relations.length}`,
    userPrompt: buildKnowledgeGraphOrganizerPrompt({
      domain: { id: domainId, name: graph.domain.name },
      nodes: graph.nodes,
      relations: graph.relations
    }),
    validate: (value) =>
      validateKnowledgeGraphOrganizer(value, allowedKnowledgePointIds)
  });

  return {
    insight: result.data,
    aiCallLogId: result.log.id
  };
}

export async function explainKnowledgeRelation(
  domainId: string,
  relationId: string
) {
  const relation = (await listKnowledgeRelations(domainId)).find(
    (entry) => entry.id === relationId
  );

  if (!relation || relation.fromWord.canvasId !== domainId) {
    throw new KnowledgeRelationError(
      "Relation not found in this domain.",
      "not_found"
    );
  }

  const pointMap = await loadKnowledgePointPromptContextMap([
    relation.fromWordId,
    relation.toWordId
  ]);
  const fromNode = pointMap.get(relation.fromWordId);
  const toNode = pointMap.get(relation.toWordId);

  const result = await runJsonTask({
    canvasId: domainId,
    taskType: "relation_explanation",
    inputSummary: `Explain relation ${relation.id}: ${relation.fromWord.text} -> ${relation.toWord.text}`,
    userPrompt: buildRelationExplanationPrompt({
      relation: {
        id: relation.id,
        relationType: relation.relationType,
        status: relation.status,
        evidenceStrength: relation.evidenceStrength,
        detail: relation.detail,
        applicability: relation.applicability,
        misuseRisk: relation.misuseRisk
      },
      fromNode: {
        id: relation.fromWordId,
        text: relation.fromWord.text,
        canvasName: fromNode?.canvasName || relation.fromWord.canvas.name,
        coreEssence: fromNode?.coreEssence || null
      },
      toNode: {
        id: relation.toWordId,
        text: relation.toWord.text,
        canvasName: toNode?.canvasName || relation.toWord.canvas.name,
        coreEssence: toNode?.coreEssence || null
      }
    }),
    validate: validateRelationExplanation
  });

  return {
    explanation: result.data,
    aiCallLogId: result.log.id
  };
}

export async function generateTransferChallenge(
  wordId: string,
  input: {
    canvasId?: string | null;
    userGoal?: string | null;
  }
) {
  const canvasId = input.canvasId?.trim();
  if (!canvasId) {
    throw new Error("canvasId 不能为空");
  }

  const source = await loadKnowledgePointPromptContext(wordId, canvasId);

  if (!source) {
    throw new Error("知识点不存在或不属于该图谱");
  }

  const relations = await listKnowledgeRelations(canvasId, wordId);
  const pointMap = await loadKnowledgePointPromptContextMap(
    relations.flatMap((relation) => [relation.fromWordId, relation.toWordId])
  );

  const relationContexts = relations
    .map((relation) => {
      const otherWordId =
        relation.fromWordId === wordId ? relation.toWordId : relation.fromWordId;
      const otherWord = pointMap.get(otherWordId);
      if (!otherWord) return null;
      return {
        id: relation.id,
        relationType: relation.relationType,
        status: relation.status,
        evidenceStrength: relation.evidenceStrength,
        detail: relation.detail,
        applicability: relation.applicability,
        misuseRisk: relation.misuseRisk,
        otherWord: {
          id: otherWord.id,
          text: otherWord.text,
          canvasName: otherWord.canvasName,
          coreEssence: otherWord.coreEssence || null
        }
      };
    })
    .filter(Boolean) as Array<{
    id: string;
    relationType: string;
    status?: string | null;
    evidenceStrength?: string | null;
    detail?: string | null;
    applicability?: string | null;
    misuseRisk?: string | null;
    otherWord: {
      id: string;
      text: string;
      canvasName: string;
      coreEssence?: string | null;
    };
  }>;

  if (relationContexts.length === 0) {
    throw new Error("请先为该知识点建立至少一个关系或虫洞，再生成迁移挑战");
  }

  const allowedRelatedWordIds = new Set(
    relationContexts.map((relation) => relation.otherWord.id)
  );
  const result = await runJsonTask({
    canvasId,
    taskType: "transfer_challenge_generation",
    inputSummary: `Generate transfer challenge for word: ${source.text}; relations: ${relationContexts.length}`,
    userPrompt: buildTransferChallengePrompt({
      source: {
        id: source.id,
        text: source.text,
        coreEssence: source.coreEssence,
        userUnderstanding: source.userUnderstanding
      },
      relations: relationContexts,
      userGoal: input.userGoal
    }),
    validate: (value) => validateTransferChallenge(value, allowedRelatedWordIds)
  });

  return {
    challenge: result.data,
    relations: relationContexts,
    aiCallLogId: result.log.id
  };
}

export async function generateIslandReactivationPlan(
  wordId: string,
  input: {
    canvasId?: string | null;
  }
) {
  const canvasId = input.canvasId?.trim();
  if (!canvasId) {
    throw new Error("canvasId 不能为空");
  }

  const source = await loadKnowledgePointPromptContext(wordId, canvasId);

  if (!source) {
    throw new Error("知识点不存在或不属于该图谱");
  }

  const relations = await listKnowledgeRelations(canvasId, wordId);
  const pointMap = await loadKnowledgePointPromptContextMap(
    relations.flatMap((relation) => [relation.fromWordId, relation.toWordId])
  );

  const existingRelations = relations
    .map((relation) => {
      const otherWordId =
        relation.fromWordId === wordId ? relation.toWordId : relation.fromWordId;
      const otherWord = pointMap.get(otherWordId);
      if (!otherWord) return null;
      return {
        relationType: relation.relationType,
        status: relation.status,
        evidenceStrength: relation.evidenceStrength,
        otherWord: {
          id: otherWord.id,
          text: otherWord.text,
          canvasName: otherWord.canvasName,
          coreEssence: otherWord.coreEssence || null
        }
      };
    })
    .filter(Boolean) as Array<{
    relationType: string;
    status?: string | null;
    evidenceStrength?: string | null;
    otherWord: {
      id: string;
      text: string;
      canvasName: string;
      coreEssence?: string | null;
    };
  }>;

  const candidateTargets = await prisma.knowledgePoint.findMany({
    where: {
      domainId: canvasId,
      id: { not: wordId }
    },
    include: {
      domain: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: { updatedAt: "desc" },
    take: 12
  });

  if (candidateTargets.length === 0) {
    throw new Error("当前没有可用于回收孤岛的候选知识点");
  }

  const normalizedTargets = candidateTargets.map((target) => ({
    id: target.id,
    text: target.title,
    canvasName: target.domain.name,
    coreEssence: target.coreEssence || null
  }));

  const result = await runJsonTask({
    canvasId,
    taskType: "reactivation_plan_generation",
    inputSummary: `Generate island reactivation plan for word: ${source.text}; targets: ${normalizedTargets.length}`,
    userPrompt: buildIslandReactivationPrompt({
      source: {
        id: source.id,
        text: source.text,
        canvasName: source.canvasName,
        coreEssence: source.coreEssence,
        userUnderstanding: source.userUnderstanding,
        islandReason: source.islandReason,
        masteryStatus: source.masteryStatus
      },
      existingRelations,
      candidateTargets: normalizedTargets
    }),
    validate: (value) =>
      validateIslandReactivationPlan(
        value,
        new Set(normalizedTargets.map((target) => target.id))
      )
  });

  return {
    plan: result.data,
    targets: normalizedTargets,
    aiCallLogId: result.log.id
  };
}

export async function generateRelationReactivationPlan(
  relationId: string,
  input: {
    canvasId?: string | null;
  }
) {
  const canvasId = input.canvasId?.trim();
  if (!canvasId) {
    throw new Error("canvasId 不能为空");
  }

  const relation = (await listKnowledgeRelations(canvasId)).find(
    (entry) => entry.id === relationId
  );

  if (!relation || relation.fromWord.canvasId !== canvasId) {
    throw new Error("关系不存在或不属于该图谱");
  }
  if (
    relation.relationType !== "WORMHOLE" &&
    relation.toWord.canvasId !== canvasId
  ) {
    throw new Error("关系不存在或不属于该图谱");
  }

  const pointMap = await loadKnowledgePointPromptContextMap([
    relation.fromWordId,
    relation.toWordId
  ]);
  const fromWord = pointMap.get(relation.fromWordId);
  const toWord = pointMap.get(relation.toWordId);

  const result = await runJsonTask({
    canvasId,
    taskType: "reactivation_plan_generation",
    inputSummary: `Generate relation reactivation plan for relation: ${relation.fromWord.text} -> ${relation.toWord.text}`,
    userPrompt: buildRelationReactivationPrompt({
      relation: {
        id: relation.id,
        relationType: relation.relationType,
        status: relation.status,
        evidenceStrength: relation.evidenceStrength,
        detail: relation.detail,
        applicability: relation.applicability,
        misuseRisk: relation.misuseRisk
      },
      fromWord: {
        id: relation.fromWordId,
        text: relation.fromWord.text,
        canvasName: fromWord?.canvasName || relation.fromWord.canvas.name,
        coreEssence: fromWord?.coreEssence || null
      },
      toWord: {
        id: relation.toWordId,
        text: relation.toWord.text,
        canvasName: toWord?.canvasName || relation.toWord.canvas.name,
        coreEssence: toWord?.coreEssence || null
      }
    }),
    validate: validateRelationReactivationPlan
  });

  return {
    plan: result.data,
    aiCallLogId: result.log.id
  };
}

export async function generateLongTermReviewInsightPack(domainId: string) {
  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    select: { id: true, name: true }
  });

  if (!domain) {
    throw new Error("学习领域不存在");
  }

  const summary = await getLongTermReviewSummary(domainId);

  const focusWordIds = Array.from(
    new Set([
      ...summary.queue.map((entry) => entry.wordId),
      ...summary.longTermIslands.map((entry) => entry.wordId),
      ...summary.weakRelations.map((entry) => entry.fromWordId)
    ])
  );

  const focusWords = await prisma.knowledgePoint.findMany({
    where: { id: { in: focusWordIds } },
    select: {
      id: true,
      title: true,
      masteryStatus: true,
      isIsland: true,
      islandReason: true
    }
  });

  const wormholes = (await listKnowledgeRelations(domainId))
    .filter((relation) => relation.relationType === "WORMHOLE")
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, 12);
  const pointMap = await loadKnowledgePointPromptContextMap(
    wormholes.flatMap((relation) => [relation.fromWordId, relation.toWordId])
  );

  const wormholeContexts = wormholes.map((relation) => ({
    relationId: relation.id,
    status: relation.status,
    evidenceStrength: relation.evidenceStrength,
    detail: relation.detail,
    applicability: relation.applicability,
    misuseRisk: relation.misuseRisk,
    fromWord: {
      id: relation.fromWordId,
      text: relation.fromWord.text,
      canvasName:
        pointMap.get(relation.fromWordId)?.canvasName || relation.fromWord.canvas.name,
      coreEssence: pointMap.get(relation.fromWordId)?.coreEssence || null
    },
    toWord: {
      id: relation.toWordId,
      text: relation.toWord.text,
      canvasName:
        pointMap.get(relation.toWordId)?.canvasName || relation.toWord.canvas.name,
      coreEssence: pointMap.get(relation.toWordId)?.coreEssence || null
    }
  }));

  const relatedWordPool = Array.from(
    new Map(
      wormholeContexts.flatMap((relation) => [
        [
          relation.fromWord.id,
          {
            id: relation.fromWord.id,
            text: relation.fromWord.text,
            canvasName: relation.fromWord.canvasName
          }
        ],
        [
          relation.toWord.id,
          {
            id: relation.toWord.id,
            text: relation.toWord.text,
            canvasName: relation.toWord.canvasName
          }
        ]
      ])
    ).values()
  );

  const result = await runJsonTask({
    canvasId: domainId,
    taskType: "long_term_review_generation",
    inputSummary: `Generate long-term review pack for domain: ${domain.name}; focusWords: ${focusWords.length}; wormholes: ${wormholeContexts.length}`,
    userPrompt: buildLongTermReviewInsightPrompt({
      domain,
      summary: {
        overdueCount: summary.overdueCount,
        dueTodayCount: summary.dueTodayCount,
        upcomingCount: summary.upcomingCount,
        longTermIslandCount: summary.longTermIslandCount,
        weakRelationCount: summary.weakRelationCount,
        nextActions: summary.nextActions
      },
      focusWords: focusWords.map((word) => ({
        id: word.id,
        text: word.title,
        masteryStatus: word.masteryStatus,
        isIsland: word.isIsland,
        islandReason: word.islandReason
      })),
      wormholes: wormholeContexts,
      relatedWordPool
    }),
    validate: (value) =>
      validateLongTermReviewInsight(
        value,
        new Set(focusWords.map((word) => word.id)),
        new Set(relatedWordPool.map((word) => word.id)),
        new Set(wormholeContexts.map((relation) => relation.relationId))
      )
  });

  return {
    pack: result.data,
    focusWords: focusWords.map((word) => ({
      id: word.id,
      text: word.title,
      masteryStatus: word.masteryStatus,
      isIsland: word.isIsland,
      islandReason: word.islandReason
    })),
    wormholes: wormholeContexts,
    aiCallLogId: result.log.id
  };
}
