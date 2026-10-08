# Map-changing route suggestions require versioned map review

Status: Accepted

Date: 2026-07-19

## Context

Diagnostics and node-level feedback can produce route suggestions at different levels. An L1 suggestion can ask the learner to practice in place without changing the Domain Map. L2 and L3 suggestions propose adding or reorganizing Learning Nodes and therefore change the formal map.

The map boundary already requires every structural change to become a `Map Draft` bound to the current `mapRevision`, pass structural validation, preserve existing learning evidence, and receive whole-map user confirmation. A direct “accept suggestion” action for L2 or L3 would bypass that boundary. During the 2026-07-19 full user-flow verification, the UI exposed such an action even though the service correctly rejected it, creating a user-visible path that could never succeed.

## Decision

- A Route Suggestion is always a candidate, not a formal map mutation.
- L1 suggestions with `changesMap=false` may be accepted in place. Acceptance records the learner decision but does not insert, delete, reorder, or relink map nodes.
- L2 and L3 suggestions with `changesMap=true` cannot be accepted through the route-suggestion endpoint and must not expose an enabled direct-accept control.
- A future map-changing suggestion flow must convert the candidate into a `Map Draft` bound to the current `mapRevision`, retain the suggestion provenance and learner rationale, and use the existing validation, conflict, reconcile, and whole-map confirmation path.
- Until that conversion exists, the product must describe L2/L3 suggestions as retained candidates and explicitly mark the closed loop as not implemented.

## Alternatives considered

### Apply an L2 suggestion after the learner writes a reason

Rejected. A reason is useful provenance but does not provide version conflict handling, DAG validation, stable-key reconciliation, or whole-map review.

### Add a special mutation endpoint for remedial nodes

Rejected. A second map-write path would duplicate invariants and allow diagnostics to bypass the formal map transaction.

### Disable all route suggestions

Rejected. L1 suggestions remain useful because they can record an in-place practice decision without changing formal structure.

## Consequences

- The diagnostics UI may accept L1 suggestions and must disable direct acceptance for L2/L3 suggestions.
- The service remains fail-closed for every map-changing suggestion.
- Completing L2/L3 requires a separate Map Draft conversion feature; candidate generation alone is not a completed adjustment workflow.
- Tests and status documentation must distinguish “suggestion generated” from “map change confirmed”.
