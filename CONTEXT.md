# EnglishNode

This context defines the product language for an AI tutor that helps users build a structured, verifiable learning path and knowledge system.

## Language

**AI Generation Record**:
A locally retained record of one model-call attempt, linking its task and prompt version, original response, parsed candidate, validation findings and any subsequent retry. It supports inspection of content quality and failure causes; a successfully validated record is not a certificate of knowledge accuracy or learner mastery.
_Avoid_: Success-only excerpt, overwritten failure, authoritative AI quality score

**Concept Curriculum**:
A version 3 course organized into coherent, explicitly scoped teaching units. A Learning Node may teach one concept, principle or method, or a related group when teaching them together supports understanding. A concept may support several planning questions; reuse and coverage never imply prerequisite edges.
The curriculum distinguishes assumed foundations from new learning. Foundations are a reviewable entry assumption, not evidence of learner mastery. A node makes its new knowledge, teaching tasks and reuse explicit; a concept count alone does not establish teaching quality.

**Entry Guide**:
AI-prepared beginner orientation and editable task-brief suggestions, saved for review without silently changing confirmed learning goals.

**Teaching Framework**:
The stable preparation for a scoped teaching unit: definition, motivation, use, significance, relations, whole-problem role, justification, boundaries and recognition/selection, organized into encounter, concept, use, discriminate and integrate segments. Related concepts may share explanations and examples while retaining their distinct meanings, conditions and uses; dimension coverage alone is not evidence of understanding.
Its factual claims are open to evidence-based correction. A correction retains the original version and learner records; consistency with an AI-authored framework does not establish knowledge accuracy.

**Teaching Segment**:
Versioned, on-demand teaching material for one part of a Teaching Framework. Its explanations, examples and optional thinking activities are separate from learner responses and personal knowledge.

**Teaching Summary**:
A recoverable account of taught content, learner questions and feedback observations linked to their original records; never a mastery certification.

**Learning Domain**:
A subject area the learner wants to study with a defined goal, scope, exclusions, expected depth, and output target.
_Avoid_: Canvas, topic

**Domain Map**:
A learner-confirmed course structure for a Learning Domain. It begins with a complete Stage skeleton, expands Stages progressively, and expresses curriculum grouping plus explicit prerequisites without prescribing one mandatory learning route.
_Avoid_: Loose roadmap, topic list, brainstorming map

**Stage**:
A curriculum level in the complete Domain Map skeleton. A new layered Stage may remain planned with rationale and structured Module directions that name key questions and checkable outcomes, or be expanded into Modules and Learning Nodes; its display order never creates an implicit prerequisite.
_Avoid_: Automatic dependency chain, arbitrary chapter bucket

**Module**:
A thematic grouping inside one Stage, formed from the intrinsic subject matter shared by its Learning Nodes.
_Avoid_: Cross-stage tag, implicit prerequisite

**Learning Node**:
A planned, coherent lesson for a concept, principle, method or related group, with an explicit scope, core learning problem and teaching responsibilities. It may cover several planning questions and be reused in different whole problems. It belongs to the Domain Map but is not yet part of the learner's formal knowledge system.
_Avoid_: Knowledge Point, broad topic heading, completed lesson

**Knowledge Point**:
A learner-confirmed piece of personal knowledge created only after the learner writes and saves their own understanding of a Learning Node.
_Avoid_: AI-generated map node, viewed explanation, completion click

**Node Teaching Session**:
A resumable teaching workspace for one Learning Node and one version of its Teaching Framework. It brings together on-demand Teaching Segments, the learner's position, drafts, help records and Teaching Summary. It may exist before a Knowledge Point and does not change the formal map or certify mastery.
_Avoid_: Knowledge Point, diagnostic assessment, AI-authored personal understanding

**Teaching Interaction**:
A saved learner answer or question tied to a teaching step and material version, with the help already exposed, the AI response when available, an optional teaching suggestion and retry status. A question need not belong to an exercise. Assistance and feedback describe that interaction only; neither confers a mastery state.
_Avoid_: Mastery Evidence, unsaved chat log, independent performance after answer disclosure

**Map Draft**:
A proposed replacement for the current Domain Map that is bound to the formal map version and has no formal effect until the learner confirms it as a whole.
When repairing one Stage, the system preserves course goals and other Stages, then validates the merged draft as a whole; local repair does not imply global content approval.
_Avoid_: Live map mutation, silent AI rewrite, route suggestion applied directly

**Route Suggestion**:
A learner-reviewable proposal derived from node work or a Diagnostic Session. An in-place L1 suggestion may be accepted without changing the Domain Map; any suggestion that changes map structure remains a candidate until it is converted into a versioned Map Draft and confirmed through the full map review.
_Avoid_: Automatic remediation, direct map patch, accepted L2/L3 mutation

**Diagnostic Session**:
A set of learner-first questions for one Learning Domain. The learner answers before AI evaluation; the result may produce feedback or Route Suggestions but is not itself Mastery Evidence, a completed domain assessment, or permission to rewrite the Domain Map.
_Avoid_: AI-first grading, mastery proof, automatic map adjustment

**Explicit Prerequisite**:
A directed dependency intentionally declared between Stages or Learning Nodes. It may have multiple sources or targets and is never inferred from display order.
It names required prior teaching, not proof that the learner has mastered it. Its target must actually provide the needed knowledge at the required depth; learning may also rely on agreed entry foundations or explanations introduced earlier within the current lesson.
_Avoid_: Previous item, forced sequence, implicit chain

**Hybrid Course Optimization**:
A planning approach that starts from a recognizable curriculum structure, then adapts sequencing, depth, examples, diagnostics, and practice to the learner's goal, prior knowledge, constraints, and output target.
_Avoid_: Freeform AI planning, one-shot roadmap generation

**Research-Backed Course Skeleton**:
A course structure derived from external learning materials such as syllabi, textbooks, official documentation, exam outlines, or reputable course pages, with source links and concise reasons for why each source was used.
_Avoid_: Model memory, unsourced curriculum

**Course Map Creation Path**:
The AI-assisted planning flow that produces a Course Design Direction and complete Stage skeleton for learner review. Cloud AI is the recommended provider; a local OpenAI-compatible provider is still an AI provider and receives no relaxed quality gate. Trusted materials may be planning inputs, but manual authoring or direct import is not an independent formal-map path.
_Avoid_: Blank-slate manual map, import-only map, fallback promoted to formal plan

**Local-First Security Boundary**:
The trust boundary that keeps the learner's desktop runtime, credentials, local API, and external learning sources separate. Runtime credentials remain local to the learner; external sources are treated as untrusted until they pass the applicable URL, provenance, and user-confirmation gates.
_Avoid_: LAN-exposed local API, build-time credential storage, trusted-by-default model links

**Versioned Empty Seed**:
An empty, version-controlled starting template used only to initialize a new learner's personal knowledge store. It contains structure and change provenance, never learner data or development records.
_Avoid_: Development database, demo database, user backup

**User Database Lifecycle**:
The required sequence for a packaged desktop launch: identify or create the personal database, back up an existing database, apply checked-in migrations, verify referential integrity, then start the application only on success.
_Avoid_: Copy-once database, destructive sync, best-effort migration

**Migration Baseline**:
A stable, recorded starting point used only when historical changes cannot be replayed from an empty knowledge store. It preserves prior change provenance; later changes remain incremental.
_Avoid_: Edited migration history, replacement for future migrations, schema push

**Course Research Quality Gate**:
The validation step for the research-backed creation path. It blocks a research-backed Course Design Direction or Domain Map from being labelled verified unless the research result includes source links with reasons, a theoretical skeleton, a Course Design Explanation, a main course-design source, optimization logic, risks or validation points, and complete structured map content. Every configured AI provider still requires provenance, structural checks, and user confirmation.
_Avoid_: Best-effort AI output, unchecked research result, applying a research-only label to an unsourced map

**Research Repair Attempt**:
One of at most two automatic calls where the system asks the configured model to repair a failed Course Research Quality Gate result using the validation errors. If both calls fail, the blocked draft remains visible and the learner may explicitly retry, change Provider/model, or regenerate.
_Avoid_: Unlimited retry, hidden provider calls, silent degradation, manual-map fallback

**Source Grounding**:
The bounded server-side verification step that fetches each AI-proposed course source over the HTTPS whitelist with timeout, size, and redirect limits, extracting only plain-text evidence (title, headings, short excerpt). Grounding results record reachability and travel with the draft into later planning prompts; fetched content is never rendered as trusted HTML.
_Avoid_: Unbounded crawling, rendering fetched pages, trusting AI-claimed source content

**Source Relevance**:
The advisory signal that measures how much a grounded source page (title + excerpt) supports the learning domain (name / scope / goal). It has two non-blocking layers: (1) a deterministic floor — mixed Chinese+English tokenizer + weighted Dice coefficient — surfaced as a low-relevance warning; (2) an optional, independent AI review task (`source_relevance_check`) that judges each already-grounded source and returns a 0–1 score, a low-relevance flag, and a short Chinese reason, merged into `grounding.aiRelevance`. Neither layer feeds the structural Course Research Quality Gate; `null` means "no signal" (unreachable or no excerpt), not "low". The AI review reuses the already-fetched grounded digest (no extra web fetch) and is an on-demand, transient enrichment that is not persisted. See ADR 0012.
_Avoid_: Relevance as a blocking dimension, full-NLP dependency, trusting AI-claimed relevance without the grounded digest, persisting the AI review through `saveCourseDesignDraft` (would corrupt `courseDesignAiCallLogId` / `courseDesignConfirmedAt`)

**Course Critique Pass**:
One of at most two automatic AI calls that review the current Course Design Draft against the fixed quality rubric using the grounded source digests, then return a Route Quality Report and a revised draft. Each pass is logged independently.
_Avoid_: Hidden rewrite, unbounded self-correction, critique that bypasses user confirmation

**Route Quality Report**:
An advisory multi-dimensional assessment attached to a Course Design Draft: prerequisite correctness, goal match, cognitive load, source quality, and checkability, each with a short note. It is shown in the review UI to inform the learner's confirmation but never blocks it; the structural Course Research Quality Gate remains the only blocking check.
_Avoid_: Score-as-gate, hidden rubric, blocking on subjective thresholds

**Skeleton Determinism Check**:
The same-origin deterministic guard that runs on the AI roadmap skeleton draft before expansion or confirmation, mirroring the formal map reconcile: stage-count bounds, unique stage keys, unique stage titles, non-empty goal and Module directions per stage, and an acyclic prerequisite graph with no dangling key references. Errors (cycle, dangling key, duplicate key, over-cap stages) block the draft. For new `planningVersion=3` formal-map creation they fail closed and never produce a confirmable local fallback; warnings travel with the draft and surface in the review UI or the subsequent AI quality review.
_Avoid_: Silent broken prerequisites, expanding a cyclic skeleton, treating advisory warnings as blocking

**Roadmap Coverage Gate**:
The deterministic blocking review for a new Concept Curriculum Map Draft. Course Content Questions connect Domain goals to stable planning questions; Stage and Module coverage is derived from those references. Every expanded Stage planning question requires one or more concepts or explicit concept references. One concept can cover several questions. A planned Stage is complete at blueprint level and is never treated as missing Learning Nodes. The review binding must match the current draft digest, map revision, and Course Design AI provenance.
_Avoid_: Demanding nodes from planned Stages, minimum-question quotas, client-supplied pass status, reusing a review after edits

**Course Content Question**:
A concrete question under a course goal, with a stable identity and explicit requirements for the explanations, examples or boundaries that the course should provide. It is a curriculum content commitment, not an assessment of the learner.
_Avoid_: Learner score, vague ability label, requirement to submit an answer

**Stage Content Coverage**:
The traceable set of Course Content Questions arranged in a Stage through its planning questions and concepts. Planned content, available current teaching material and content still needing supplementation are distinct. Coverage records where content is supplied, not whether the learner has mastered it or whether every claim is correct.
_Avoid_: Independently handwritten parent goal labels, mastery percentage, generated-material claims for unprepared lessons

**Learner Self-Explanation**:
The learner's own editable account of their understanding, examples, boundaries and questions. It is saved without AI grading or approval and becomes personal knowledge only after explicit learner confirmation.
_Avoid_: AI certification, auto-generated personal understanding, practice pass as a sedimentation condition

**Map Draft Quality Review**:
The server-recorded semantic review of a `planningVersion=3` Map Draft. A fresh skeleton review runs after deterministic validation; every Stage expansion is reviewed for concept scope, synonyms, coverage and prerequisites. Only serious defects with a concrete location, evidence, an existing requirement and a material teaching consequence block the review. Improvements and source-coverage gaps remain visible advisories. Serious findings can trigger at most two separately logged repair calls; an unconfirmed global draft can revise content questions while preserving course goals and explaining how previous requirements are retained. Remaining semantic findings may be dismissed only by the learner with an explicit rationale bound to the normalized draft digest and review; any edit makes that decision stale. Review timeout is recorded as unavailable rather than as a content defect, and the learner may explicitly acknowledge that risk after deterministic validation passes.
_Avoid_: Letting AI become the final authority, treating review failure as bad content, unbound override buttons, hiding exhausted findings

**Thin Unit Density Signal**:
An advisory, warning-level signal that flags a Module blueprint whose single question must carry several independent goals. The historical node-to-question ratio is not applied to Concept Curriculum nodes because one concept may cover multiple questions. Signals inform semantic review without imposing minimum counts. See ADR 0015 and its successor ADR 0017.
_Avoid_: Minimum question or node count gate, blocking density check, padding nodes to satisfy a number

**Course Skeleton Selection**:
The rule for choosing the main structure behind a Domain Map. Famous university course designs have priority, AI may apply explicit judgment to adapt the structure, and other reputable sources are used as supplements rather than equal-weight inputs.
_Avoid_: Averaged curriculum, source mashup

**First-Principles Course Design**:
A course planning rule that derives the learning path from the fundamental structure of the domain, then uses searched course materials to build and challenge that theoretical skeleton. The final Domain Map should show that the chosen structure survives prerequisite, goal, cognitive-load, misconception, and transfer checks.
_Avoid_: Source ranking only, copied syllabus

**Reorder Rationale**:
The learner-facing global explanation of why the system changed the sequence of topics from the referenced course skeleton. It should summarize the main sequencing strategy and connect it to prerequisites, learner goals, cognitive load, or known misconceptions without explaining every stage or node. It is now a required sub-section of the research prompt's `optimizationRationale` and is checked by the critique prompt (the structured schema落点 is deferred).
_Avoid_: Hidden optimization, unexplained personalization, per-node rationale

**Course Design Explanation**:
A four-part global explanation attached to a Domain Map: theoretical skeleton, source basis, optimization explanation, and risks or validation points.
_Avoid_: Stage commentary, node commentary, hidden rationale

**Course Design Direction**:
The planning direction reviewed before detailed Learning Nodes are generated. It combines the chosen course skeleton, provenance, global Course Design Explanation, the complete Stage skeleton with structured Module directions, their key questions and checkable outcomes, and key trade-offs in one learner confirmation.
_Avoid_: Final map, hidden research result

**Course Design Feedback**:
Learner instructions for regenerating the Course Design Direction, such as making it more practical, preserving more theory, lowering density, including a source, or excluding a source. The learner gives feedback instead of directly editing the structured research fields.
_Avoid_: Manual field editing, hidden regeneration prompt

**Map Review Needed**:
A Domain Map state indicating that the Task Brief changed after the map was generated or confirmed, so the map may no longer match the current learning goal. The user must choose whether to keep the map, research again, apply local adjustments, or regenerate.
_Avoid_: Silent map update, automatic overwrite

**Optimization Priority**:
The rule that Hybrid Course Optimization must preserve prerequisite correctness first, then match the learner's goal, then control cognitive load, then respect authoritative course order, and only then personalize for interest or style. It was elevated from a conflict tie-breaker to an explicit scoring requirement in the research prompt, and the critique prompt checks that every `keyTradeoffs` item names the priority it serves; the structured schema落点 is deferred.
_Avoid_: AI preference, subjective improvement

**Task Brief**:
A living statement of the Learning Domain's goal, scope, constraints, expected output, and evaluation approach, refined through AI-user dialogue. It can change over time, but the system may snapshot a confirmed version when generating or revising a Domain Map.
_Avoid_: Prompt, description, one-time form

**Task Brief Confirmation**:
The learner's explicit approval of the currently persisted Task Brief and its course-research inputs. It is stored on the Learning Domain, survives refresh, and is revoked when a relevant planning input changes.
_Avoid_: Non-empty text treated as approval, browser-only flag, stale confirmation reused after editing

**Minimum Necessary Clarification**:
The dialogue strategy for refining a Task Brief: ask only for missing critical information needed for course design research, then proceed once the learning domain, goal, learner level evidence, expected output, constraints, and exclusions are clear enough.
_Avoid_: Endless intake interview, one-shot vague prompt

**Expected Output**:
A concrete, checkable result the learner wants to produce or perform after studying, used to shape course depth and sequencing.
_Avoid_: Wish, motivation, vague goal

**Output Type**:
The category of Expected Output that shapes the course plan, such as explanation, problem-solving, project, application, or reading and comprehension.
_Avoid_: Generic goal type

**Learner Level Evidence**:
The learner's self-assessed level plus concrete evidence of prior study, completed work, known gaps, and optional quick diagnostic answers.
_Avoid_: Level label only

**Mastery Evidence**:
Learner-produced evidence that justifies a mastery transition, including an explanation in the learner's own words, an example, applicable boundaries, successful application, and—at higher levels—a transfer challenge.
_Avoid_: Self-reported mastery, completion click, AI answer viewed

**Knowledge Island**:
A confirmed Knowledge Point that is deliberately kept without a reliable formal relation while its meaning, evidence, or connections remain under review.
_Avoid_: Orphan node, invalid knowledge, graph error

**Wormhole**:
A user-confirmed relation between Knowledge Points in different Learning Domains, supported by a rationale, applicability boundaries, misuse risks, and a completed transfer challenge.
_Avoid_: Ordinary relation, arbitrary cross-domain link, analogy alone
