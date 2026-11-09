import { createHash } from "node:crypto";
import { prisma } from "../prisma";
import { planningKnowledgeDigest, type PlanningKnowledgeClaim } from "../ai/planningKnowledgeReview";
import type { MapDraftQualityReport } from "../ai/tasks";
import { parseConcept, parseConceptReferences, parseGoals, planningStrings } from "./conceptPlanning";
import { scopedContentQuestions } from "./curriculumBoundary";

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const json = (value: string | null | undefined): unknown => { try { return value ? JSON.parse(value) : null; } catch { return null; } };
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

type Owner = {
  stageKey: string; nodeKey: string; prefix: string; item: ObjectValue;
  stage: ObjectValue; module: ObjectValue; ownScope: unknown;
};
type FieldEvidence = {
  stageKey: string; nodeKey: string; relativePath: string; fieldHash: string; scopeHash: string;
  claim: PlanningKnowledgeClaim;
};
type OpinionEvidence = {
  stageKey: string; nodeKey: string; targetKind: "node" | "module" | "stage"; targetHash: string;
  targetStageKey: string;
  opinion: MapDraftQualityReport["warnings"][number];
};
type EvidenceSnapshot = {
  version: 1; sourceDraftDigest: string; courseDesignAiCallLogId: string;
  claims: FieldEvidence[]; opinions: OpinionEvidence[];
};

/** The same semantic normalization is used for draft fields and persisted nodes. */
function normalizedItem(raw: unknown): ObjectValue {
  const item = object(raw);
  return {
    key: text(item.key), title: text(item.title), objective: text(item.objective),
    keyQuestion: text(item.keyQuestion), prerequisite: text(item.prerequisite),
    commonMistake: text(item.commonMistake), transferPrompt: text(item.transferPrompt),
    prerequisiteKeys: planningStrings(item.prerequisiteKeys).sort(),
    planningQuestionKeys: planningStrings(item.planningQuestionKeys).sort(),
    concept: parseConcept(item.concept)
  };
}

function owners(draft: unknown): Owner[] {
  const root = object(draft), registry = parseGoals(root.learningGoals).flatMap(goal => goal.contentQuestions || []);
  const result: Owner[] = [];
  array(root.stages).forEach((rawStage, stageIndex) => {
    const stage = object(rawStage), stageKey = text(stage.key);
    array(stage.modules).forEach((rawModule, moduleIndex) => {
      const stageModule = object(rawModule);
      array(stageModule.items).forEach((rawItem, itemIndex) => {
        const item = normalizedItem(rawItem), concept = parseConcept(item.concept), keys = planningStrings(item.planningQuestionKeys);
        // Incoming conceptReferences are deliberately not owned responsibility:
        // a later use may add duties without changing this field's old meaning.
        const contributions = concept.learningUnit?.contentContributions || [];
        const assigned = new Set(array(stage.moduleBlueprints).flatMap(raw => array(object(raw).keyQuestions))
          .filter(raw => keys.includes(text(object(raw).key))).map(raw => text(object(raw).contentQuestionKey)));
        const ownQuestions = contributions.length ? scopedContentQuestions(registry, contributions)
          : registry.filter(question => assigned.has(question.key));
        result.push({ stageKey, nodeKey: text(item.key), prefix: `stages[${stageIndex}].modules[${moduleIndex}].items[${itemIndex}]`,
          item, stage, module: stageModule, ownScope: {
            stage: { key: stageKey, title: text(stage.title), goal: text(stage.goal), rationale: text(stage.rationale), problem: stage.problem || null, prerequisites: planningStrings(stage.prerequisiteStageKeys).sort() },
            module: { title: text(stageModule.title), goal: text(stageModule.goal) },
            task: { title: item.title, objective: item.objective, question: item.keyQuestion, prerequisite: item.prerequisite },
            concept: { scope: concept.scope, problemRole: concept.problemRole, assumedKnowledge: concept.learningUnit?.assumedKnowledge || [] },
            prerequisites: item.prerequisiteKeys, ownQuestions
          } });
      });
    });
  });
  return result;
}

function atPath(value: unknown, path: string): unknown {
  if (!/^[A-Za-z][A-Za-z0-9]*(?:\[\d+\])?(?:\.[A-Za-z][A-Za-z0-9]*(?:\[\d+\])?)*$/.test(path)) return undefined;
  let current: unknown = value;
  for (const part of path.replace(/\[(\d+)\]/g, ".$1").split(".")) {
    if (["__proto__", "prototype", "constructor"].includes(part)) return undefined;
    current = current && typeof current === "object" ? (current as ObjectValue)[part] : undefined;
  }
  return current;
}
const moduleProjection = (raw: unknown) => {
  const value = object(raw);
  return { title: text(value.title), goal: text(value.goal), items: array(value.items).map(normalizedItem), references: parseConceptReferences(value.conceptReferences) };
};
const participants = (raw: unknown) => { const value = object(raw); return [...array(value.items), ...array(value.conceptReferences)].map(object); };
function assignedToBlueprint(participant: ObjectValue, blueprint: ObjectValue) {
  const planningKeys = planningStrings(participant.planningQuestionKeys);
  const contributions = array(participant.contentContributions || object(object(participant.concept).learningUnit).contentContributions).map(object);
  return array(blueprint.keyQuestions).map(object).some(question => planningKeys.length
    ? planningKeys.includes(text(question.key))
    : contributions.some(contribution => text(contribution.contentQuestionKey) === text(question.contentQuestionKey) && !!text(question.contentQuestionKey)));
}
type OpinionTarget = { kind: OpinionEvidence["targetKind"]; stageKey: string; recipients: string[]; projection: unknown };
/** Detailed modules often have no key: use their explicit question/reference links. */
function opinionTargets(draft: unknown, targetKey: string): OpinionTarget[] {
  const result: OpinionTarget[] = [];
  for (const owner of owners(draft)) if (owner.nodeKey === targetKey) result.push({ kind: "node", stageKey: owner.stageKey,
    recipients: [owner.nodeKey], projection: { ownScope: owner.ownScope, item: owner.item } });
  for (const raw of array(object(draft).stages)) {
    const stage = object(raw), stageKey = text(stage.key), modules = array(stage.modules).map(object);
    const parentScope = { key: stageKey, title: text(stage.title), goal: text(stage.goal), rationale: text(stage.rationale),
      problem: stage.problem || null, prerequisites: planningStrings(stage.prerequisiteStageKeys).sort() };
    if (stageKey === targetKey) result.push({ kind: "stage", stageKey,
      recipients: modules.flatMap(value => participants(value).map(item => text(item.key))),
      projection: { parentScope, blueprints: stage.moduleBlueprints || [], modules: modules.map(moduleProjection) } });
    for (const stageModule of modules) if (text(stageModule.key) === targetKey) result.push({ kind: "module", stageKey,
      recipients: participants(stageModule).map(item => text(item.key)), projection: { parentScope, module: moduleProjection(stageModule) } });
    for (const blueprint of array(stage.moduleBlueprints).map(object).filter(value => text(value.key) === targetKey)) {
      const selected = modules.filter(value => participants(value).some(participant => assignedToBlueprint(participant, blueprint)));
      if (selected.length) result.push({ kind: "module", stageKey,
        recipients: selected.flatMap(value => participants(value).filter(participant => assignedToBlueprint(participant, blueprint)).map(item => text(item.key))),
        projection: { parentScope, blueprint, modules: selected.map(moduleProjection) } });
    }
  }
  return result;
}

/** Server-owned bindings; acceptedDraftHash must never certify a mismatched report. */
export function buildPlanningTeachingEvidence(draft: unknown, report: MapDraftQualityReport, courseDesignAiCallLogId: string): EvidenceSnapshot {
  const sourceDraftDigest = planningKnowledgeDigest(draft), catalog = owners(draft);
  const snapshot: EvidenceSnapshot = { version: 1, sourceDraftDigest, courseDesignAiCallLogId, claims: [], opinions: [] };
  if (report.knowledgeReview?.draftDigest === sourceDraftDigest) {
    for (const claim of report.knowledgeReview.claims) {
      const owner = catalog.find(item => claim.path.startsWith(`${item.prefix}.`));
      if (!owner) continue;
      const raw = atPath(draft, claim.path), relativePath = claim.path.slice(owner.prefix.length + 1), normalized = atPath(owner.item, relativePath);
      if (typeof raw !== "string" || !raw.includes(claim.quote) || typeof normalized !== "string" || !normalized.includes(claim.quote.trim())) continue;
      snapshot.claims.push({ stageKey: owner.stageKey, nodeKey: owner.nodeKey, relativePath,
        fieldHash: hash(normalized.trim()), scopeHash: hash(owner.ownScope), claim });
    }
  }
  for (const opinion of report.warnings) {
    if (!opinion.targetKey) continue;
    const targets = opinionTargets(draft, opinion.targetKey);
    // A duplicated stable target key across distinct stages is ambiguous, not a title-based guess.
    if (new Set(targets.map(target => target.stageKey)).size > 1) continue;
    for (const target of targets) for (const owner of catalog.filter(value => target.recipients.includes(value.nodeKey))) {
      snapshot.opinions.push({ stageKey: owner.stageKey, nodeKey: owner.nodeKey, targetKind: target.kind,
        targetStageKey: target.stageKey, targetHash: hash(target.projection), opinion });
    }
  }
  return snapshot;
}

type CurrentNode = {
  id: string; mapKey: string | null; title: string; objective: string | null; keyQuestion: string | null;
  prerequisite: string | null; commonMistake: string | null; transferPrompt: string | null;
  conceptJson: string | null; planningQuestionKeysJson: string | null;
  unit: { mapKey: string | null } | null;
  dependencies: { prerequisite: { mapKey: string | null } }[];
};
type CurrentDomain = { id: string; mapRevision: number };

/** Resolve accepted map provenance, never the currently edited course candidate. */
export async function planningEvidenceForTeaching(domain: CurrentDomain, node: CurrentNode) {
  const historicalReviewIds: string[] = [];
  const unresolved = (reason: string) => ({ claims: [], pendingOpinions: [], historicalReviewIds,
    limitations: [reason, "规划文字、待核实意见与局部核对结果都不是已展示的活动、必做任务或掌握证明。"] });
  const history = await prisma.learningProgress.findMany({ where: { domainId: domain.id, status: "map_confirmed" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { payloadJson: true } });
  const acceptance = history.map(row => object(json(row.payloadJson))).find(value => value.action === "confirm_map" && value.toRevision === domain.mapRevision);
  const courseId = text(acceptance?.courseDesignAiCallLogId);
  if (!acceptance || !courseId || !node.mapKey || !node.unit?.mapKey) return unresolved("无法恢复当前正式地图的课程依据及节点身份，旧审查仅可追溯，未认定适用于本次教学。");
  const acceptedOwners = owners(acceptance.draft);
  const accepted = acceptedOwners.find(owner => owner.nodeKey === node.mapKey && owner.stageKey === node.unit!.mapKey);
  if (!accepted) return unresolved("正式确认快照没有对应当前节点，未把其它候选或相同引文的审查套用到本次教学。");
  // Preserve accepted parent scope; current persisted fields still have to match.
  const draft = structuredClone(object(acceptance.draft)), liveItem = {
    ...accepted.item, key: node.mapKey, title: node.title, objective: node.objective, keyQuestion: node.keyQuestion,
    prerequisite: node.prerequisite, commonMistake: node.commonMistake, transferPrompt: node.transferPrompt,
    concept: json(node.conceptJson), planningQuestionKeys: json(node.planningQuestionKeysJson) || [],
    prerequisiteKeys: node.dependencies.map(item => item.prerequisite.mapKey).filter(Boolean)
  };
  const location = accepted.prefix.match(/^stages\[(\d+)\]\.modules\[(\d+)\]\.items\[(\d+)\]$/)!;
  const stage = object(array(draft.stages)[Number(location[1])]), stageModule = object(array(stage.modules)[Number(location[2])]);
  array(stageModule.items)[Number(location[3])] = liveItem;
  const current = owners(draft).find(owner => owner.stageKey === accepted.stageKey && owner.nodeKey === accepted.nodeKey)!;
  const claims: (PlanningKnowledgeClaim & { evidence: unknown })[] = [], pendingOpinions: unknown[] = [];
  const sourceFragments = new Map<string, ObjectValue>();
  const seenClaims = new Set<string>(), seenOpinions = new Set<string>();
  const currentOpinionTargets = new Map<string, OpinionTarget[]>();
  // No arbitrary recent-N window: unrelated new reports cannot hide a valid old field.
  const reviews = await prisma.mapDraftQualityReview.findMany({ where: { domainId: domain.id, courseDesignAiCallLogId: courseId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  for (const review of reviews) {
    const report = object(json(review.reportJson)), snapshot = object(report.teachingEvidence);
    if (snapshot.version !== 1 || snapshot.courseDesignAiCallLogId !== courseId) { historicalReviewIds.push(review.id); continue; }
    const knowledge = object(report.knowledgeReview);
    const provenance = { reviewId: review.id, sourceDraftDigest: snapshot.sourceDraftDigest, courseDesignAiCallLogId: courseId,
      aiCallLogIds: json(review.aiCallLogIdsJson), materialsDigest: knowledge.materialsDigest };
    for (const raw of array(snapshot.claims)) {
      const binding = raw as FieldEvidence;
      if (binding.stageKey !== current.stageKey || binding.nodeKey !== current.nodeKey || binding.scopeHash !== hash(current.ownScope)) continue;
      const field = atPath(current.item, binding.relativePath);
      if (typeof field !== "string" || hash(field.trim()) !== binding.fieldHash) continue;
      const identity = hash({ path: binding.relativePath, fieldHash: binding.fieldHash, claim: binding.claim });
      if (!seenClaims.has(identity)) {
        seenClaims.add(identity);
        const sourceRefs = binding.claim.basis.fragmentIds.map(id => {
          const fragment = array(knowledge.materials).map(object).find(item => item.id === id && typeof item.text === "string");
          if (!fragment) return { id, unavailable: true };
          const snapshotKey = hash(fragment);
          sourceFragments.set(snapshotKey, { ...fragment, snapshotKey });
          return { id, snapshotKey };
        });
        claims.push({ ...binding.claim, evidence: { ...provenance, sourceRefs,
          stageKey: binding.stageKey, nodeKey: binding.nodeKey, relativePath: binding.relativePath, fieldHash: binding.fieldHash } });
      }
    }
    for (const raw of array(snapshot.opinions)) {
      const binding = raw as OpinionEvidence;
      if (binding.stageKey !== current.stageKey || binding.nodeKey !== current.nodeKey || !binding.opinion?.targetKey) continue;
      const key = binding.opinion.targetKey;
      if (!currentOpinionTargets.has(key)) currentOpinionTargets.set(key, opinionTargets(draft, key));
      if (!currentOpinionTargets.get(key)!.some(target => target.kind === binding.targetKind && target.stageKey === binding.targetStageKey
        && target.recipients.includes(current.nodeKey) && hash(target.projection) === binding.targetHash)) continue;
      const identity = hash(binding);
      if (!seenOpinions.has(identity)) { seenOpinions.add(identity); pendingOpinions.push({ ...binding.opinion, status: "pending_unverified", evidence: provenance }); }
    }
  }
  return { claims, pendingOpinions, sourceFragments: [...sourceFragments.values()], historicalReviewIds,
    limitations: ["这些是仍绑定当前字段和原适用范围的局部模型核对意见；未列出的字段及新增引用责任尚未核对，不能把旧 no_error_found 扩展为整个节点的结论。",
      "待核实规划意见只提供疑点线索，不是事实、额外课程要求或已完成的更正；空的新报告不会消除未改原字段的旧疑点。"] };
}
