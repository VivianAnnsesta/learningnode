# Course research becomes a multi-stage pipeline with source grounding and critique

Status: Accepted

Date: 2026-08-03

## Context

Course research previously ran as a single AI pass whose only verification was a deterministic structural quality gate (ADR 0004). The gate checked field presence and URL shape, but not whether sources were reachable, whether their content actually supported the design, or whether the design itself was good. A draft could therefore pass the gate while resting on hallucinated or irrelevant sources, and the model never saw the real content of the sources it cited.

Route planning is a low-frequency, high-value operation: one Learning Domain is planned only a few times, and the confirmed Course Design Direction drives every later Stage expansion. Extra AI passes and bounded server work are acceptable here, while high-frequency interactions (diagnostic evaluation, node checks) remain single-pass.

## Decision

- Course design research runs as a bounded multi-stage pipeline: initial research pass → Source Grounding → up to two Course Critique Passes → the unchanged deterministic structural quality gate and its bounded repair (ADR 0004/0009).
- **Source Grounding**: after the initial research pass, the server fetches each proposed source URL with strict bounds (HTTPS whitelist only, timeout, size cap, limited redirects, plain-text extraction of title/headings/excerpt). Grounding results — including reachability — are attached to the draft's sources and are also forwarded with the draft into later skeleton and Stage-expansion prompts, so downstream planning sees verified evidence instead of bare URLs.
- **Course Critique Pass**: a separate AI call receives the current draft plus the grounded source digests and a fixed quality rubric (prerequisite correctness, goal match, cognitive load, source quality, checkability). It returns a Route Quality Report and a revised draft. At most two critique passes run automatically; each is a separate `course_design_critique` call with its own `AiCallLog`.
- **Route Quality Report** is advisory: it is stored on the draft and shown in the review UI, but it does not block confirmation. The blocking semantics of the structural quality gate are unchanged; reachability or relevance problems flow through the critique pass and the report, not through new blocking dimensions.
- All pipeline stages use the single AI provider and model the user already configured; no new provider settings are introduced.
- The learner-confirmation invariant is unchanged: every pipeline output remains a draft until the learner confirms the Course Design Direction and Stage skeleton in one map transaction.

## Alternatives considered

### Single pass with a stronger prompt

Rejected. Prompt-only improvements cannot give the model the real content of its sources and provide no independent verification signal; measured results on stronger models came from multi-step reasoning, not one-shot prompting.

### Per-task model routing (planning model vs bulk model)

Rejected for now. The user keeps a single-model provider configuration; routing can be added later without changing this pipeline's structure.

### Make the rubric score part of the blocking quality gate

Rejected. A score threshold would block learners on subjective dimensions before the thresholds are calibrated. The report ships as advisory evidence first; promoting dimensions into the gate requires a later, separately evidenced decision.

## Consequences

- Course research now performs bounded server-side fetching of AI-proposed URLs; the fetch must reuse the existing external-URL whitelist and must never render fetched content as trusted HTML.
- Each critique pass is logged independently, so quality behavior remains auditable per call.
- Skeleton and Stage-expansion prompts receive grounded source digests via the stored draft; their input contracts change additively.
- Tests must cover the grounding bounds (timeout, size, redirect, protocol), critique parsing, the two-pass limit, early stop when critique finds no significant issues, and that the structural gate and user confirmation remain the only blocking steps.
