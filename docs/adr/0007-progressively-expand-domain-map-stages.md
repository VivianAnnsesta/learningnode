# Expand a complete domain skeleton one stage at a time

Status: Accepted

Updated: 2026-07-15

EnglishNode first confirms a complete Stage skeleton for the Learning Domain, then expands individual Stages into Modules and Learning Nodes only when the learner requests it. This preserves a whole-domain view while avoiding one oversized AI generation, lets later Stages adapt to the learner's recorded understanding, and keeps every detailed map change behind structural validation and user confirmation.

The formal map uses stable map keys and explicit prerequisite keys. Display order never creates an implicit dependency, multiple roots and multiple prerequisites are valid, and unmet prerequisites warn without blocking entry. The product does not choose a unique next node; the learner selects among visible nodes using the map and warnings. Generated or edited maps remain drafts until user confirmation; confirmation reconciles by stable key, rejects stale revisions and does not delete nodes that already contain learning evidence.

While any Stage remains planned, EnglishNode reports progress only for expanded Stages instead of presenting a misleading whole-domain percentage. A Learning Node becomes a Knowledge Point only after the learner writes and confirms their own understanding; optional AI feedback cannot confirm it, and the first persisted knowledge status is always `seen`. Direct materialization and client-selected high-mastery writes are not valid first-knowledge paths. Compatibility word creation and update APIs must also reject direct `can_apply`, `can_transfer`, or `integrated` writes; those transitions remain reserved for a later Mastery Evidence flow.

Map-changing Route Suggestions follow the same versioned review boundary and cannot create a second write path. Their conversion and confirmation rules are recorded in [ADR 0008](0008-map-changing-route-suggestions-require-versioned-map-review.md).
