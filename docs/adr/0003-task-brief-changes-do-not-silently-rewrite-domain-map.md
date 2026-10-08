# Task brief changes do not silently rewrite the domain map

Status: Accepted

Updated: 2026-07-15

The Task Brief is a living document refined through AI-user dialogue, but a Domain Map is a confirmed execution structure. When the Task Brief changes, a later Stage is adapted, a diagnostic suggests a route change, or an existing map is edited, the proposed result remains a version-bound draft until it passes structural validation and the learner confirms it as a whole. The formal map remains usable while that draft is edited. Applying a draft must compare the base map revision, reconcile stable keys, preserve existing identifiers and learning evidence, and reject deletion of started or learner-confirmed nodes. No generic node update, route-suggestion acceptance, or status-only endpoint may bypass this workflow.

ADR 0010 adds the recoverable pre-map boundary: explicit Task Brief Confirmation is persisted on the Domain, and changing a course-research input revokes that confirmation. Existing planning artifacts are preserved as `needs_review`; they cannot be silently reused through a stale client payload.
