# Formal Domain Map creation requires AI planning

Status: Accepted

Date: 2026-07-19

## Context

EnglishNode exists to use AI to reduce the learner's planning burden. Treating manual authoring or a curated skeleton import as an independent Domain Map creation path would move curriculum decomposition, sequencing, and coverage work back to the learner and contradict that purpose.

Cloud AI currently produces materially better course-planning results than local models and is the recommended creation path. Local OpenAI-compatible providers remain useful as configurable AI providers, but they are not a no-AI or guaranteed-equivalent fallback.

## Decision

- Creating or regenerating a formal Domain Map requires a successful AI-generated Course Design Direction and complete Stage skeleton.
- A network-capable cloud AI provider is the recommended and currently supported default for map planning.
- LM Studio and other local OpenAI-compatible providers may remain configurable AI providers, but must pass the same structure, provenance, quality, version, and user-confirmation gates. Their availability does not create a separate offline/manual map path.
- Curated syllabi, textbooks, outlines, and other trusted material may be supplied as AI planning inputs or evidence. Importing them must not directly create a formal map.
- The learner may edit and confirm an AI draft, but the product will not provide blank-slate manual creation of a complete Stage skeleton as an alternative to AI planning.
- If AI is unavailable or the generated Course Design Draft fails its quality gate, formal map creation remains blocked. The recovery actions are to retry, repair AI settings, change the model/provider, or regenerate; they are not manual creation or direct skeleton import.
- When a cloud AI Course Design Draft fails the deterministic quality gate but remains parseable, the system automatically asks AI to repair the reported defects with bounded attempts. Each repair is a separate `course_design_repair` call and log; exhausted or failed repair keeps map creation blocked.
- A fallback draft may explain the failure or preserve editable context, but it cannot be confirmed as an AI-planned course or converted into a formal Domain Map.
- This requirement applies to map creation and regeneration. It does not make node-level AI feedback mandatory after a formal map exists: a learner may still confirm their own understanding and create a first `seen` KnowledgePoint when optional AI checking is unavailable.

## Superseded decisions

This ADR supersedes the parts of ADR 0001 and ADR 0004 that treated curated-source import and manual creation as independent valid Domain Map creation paths. Their research provenance and quality-gate decisions remain in force.

## Alternatives considered

### Allow manual creation when AI is unavailable

Rejected. It turns course architecture into user work and weakens the product's reason for existing.

### Allow trusted skeleton import to create the map directly

Rejected. Trusted material is valuable input, but direct import bypasses AI synthesis and learner-specific adaptation. It may be added later only as input to the AI planning flow.

### Require only cloud AI and remove local provider support

Rejected for now. Cloud AI is the recommended path, but retaining the provider abstraction costs little and preserves deliberate local-provider experimentation. Local output receives no relaxed gate or quality claim.

## Consequences

- Product documentation and UI must not promise an offline, manual, or import-only Domain Map flow.
- AI failure must be presented as a blocked planning state with configuration, retry, provider-switch, and regeneration actions.
- A learner should not need to copy quality-gate errors back into the prompt: structural repair is automatic, while a visible retry remains available after bounded repair is exhausted.
- Tests must continue proving that fallback or quality-gate failure cannot create a formal map.
- Manual editing remains part of reviewing an AI proposal, not a replacement for AI planning.
