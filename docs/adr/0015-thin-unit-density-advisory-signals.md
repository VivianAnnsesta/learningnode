# Thin-Unit density is governed by advisory semantic signals

Status: Accepted

Date: 2026-08-13

## Context

Cloud-generated roadmap units repeatedly arrive with too few knowledge
points. The 2026-08-13 DeepSeek V4 Flash calculus acceptance
(`docs/acceptance/2026-08-13-deepseek-v4-flash-calculus/`) produced three
structurally valid layered skeletons that human review rejected 0/3:
entire examination-outline branches were compressed into one or two key
questions, and Stage goals naming several independent abilities received
no matching question or node coverage.

Root cause analysis points at the generation prompts, not at missing
blocking gates. Four prompts in `web/src/lib/ai/tasks.ts` actively
encourage compression, including `buildRoadmapStagePrompt`'s
"Keep the batch small enough for a first learning loop." and the
course-design research prompt's "Keep the roadmap feasible for a first
learning loop.". Meanwhile the `densityBalance` warning code is already
declared in the review contract schema, but no deterministic or review
rule ever produces it, so the advisory density channel is dead code.

ADR 0013 explicitly states that "No fixed minimum question or node count
is a quality signal" and rejected minimum-count quotas because counts
reward padding. That reasoning remains correct; the defect is that no
semantic density signal currently fills the gap the rejection left open.

## Decision

- Unit granularity is governed by advisory semantic signals, not by
  blocking count gates. This ADR complements ADR 0013 and ADR 0014 and
  supersedes neither; it stays aligned with ADR 0013's rule that no fixed
  minimum question or node count is a quality signal, and introduces no
  blocking numeric lower bound anywhere in the planning state machine.
- Prompt granularity guidance is revised. The four compression-encouraging
  wordings in `tasks.ts` are reworded so that a single key question or
  Learning Node is only presented as sufficient when the unit goal truly
  names one learnable ability; goals that contain independent abilities
  must receive correspondingly decomposed questions and nodes.
- Two deterministic warning-level density checks are added:
  - `thinModuleBlueprint`: a Module blueprint has exactly one keyQuestion
    while its goal carries multiple independent-ability signals.
  - `thinStageExpansion`: an expanded Stage's Learning Node count is
    clearly disproportionate to the number of planned keyQuestions it must
    cover. Detection thresholds are exported constants so tests and
    reviews can inspect and adjust them deliberately.
- Every new density check has severity fixed at `warning`. Density signals
  never block confirmation, never flip a gate's `ok`, and never convert
  deterministic structural errors into advisory findings or vice versa.
- AI review criteria are clarified: compressing goals that contain
  independent abilities into a single question or node is a semantic
  defect reportable under the existing `scopeCoverage` and
  `questionAtomicity` finding codes; the previously unused `densityBalance`
  warning channel receives a producing rule and remains advisory.
- Density warnings reuse existing channels into AI review and bounded
  repair instead of adding new API surface:
  - On the skeleton side, density warnings travel via `planningWarnings`
    and are injected into the subsequent independent AI review prompt.
  - On the Stage side, `checkLayeredStageContentRisk` may set
    `needsAiReview`, triggering the existing semantic review with at most
    two bounded repair calls under ADR 0013/0014 semantics.
  - API response shapes do not change; density warnings surface through
    the existing `qualityReport.warnings`.

## Alternatives considered

### Blocking gate requiring at least N knowledge points per unit

Rejected. Raw counts reward padding and mechanical splitting without
improving coverage, directly contradict ADR 0013's rejection of fixed
minimum question or node counts, and would let the configured model game
the gate while genuine scope omissions stay invisible.

### Split the oversized tasks.ts first, then change quality rules

Rejected. Refactoring the prompt module is orthogonal to the density
problem; coupling the two adds refactor risk without improving the
quality outcome. Splitting `tasks.ts` remains a follow-up task on its own.

## Consequences

- Prompt revisions, the two deterministic density checks, and the review
  criterion clarification are implementation obligations of this decision;
  until they land, the compression bias observed in the 2026-08-13
  acceptance remains present.
- Tests must prove that density signals are advisory only: confirmation
  must stay possible when only density warnings exist, `ok` must be
  unaffected, and the signals must reach the review prompt and
  `qualityReport.warnings` through existing fields.
- Real-AI acceptance against the same calculus task is required before the
  density improvement can be claimed; fixture and contract tests alone do
  not prove educational content quality.
- No migration, state-machine change, or API shape change is required.
