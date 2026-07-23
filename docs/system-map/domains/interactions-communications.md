# Domain Dossier — Interactions, Direct Messages, Events, and Notifications

## Irreducible job

Members need one authorized community interaction system for posts/chat/replies/reactions/mentions, one direct-message system, and deterministic notification delivery. Legacy storage must not silently remain a second product truth.

## Canonical interaction migration

The canonical substrate is `communityInteractionRoots`, replies, content blocks, attachments, embeds, reactions, mentions, moderation events, visibility rules, and evidence-sync state. The normal UI writes canonical interactions.

`docs/community-interaction-migration-residue-map.md` is the single detailed
compatibility inventory. The normal feed, composer, interaction actions,
attention state, recent context, and evidence paths are canonical. The
remaining shell defect is narrower and more causal: opening community chat
still preloads legacy messages and reactions and ensures a legacy thread before
the canonical projection is marked ready. That invisible dependency can create
empty legacy threads even though the visible product path is canonical.

Development staging currently has 67 legacy messages with 67 valid mapping
links, four legacy attachment payloads without canonical attachment rows, three
legacy reactions, and two featured-message pointers. It also has three
canonical-only roots and seven canonical-only replies. The weekly digest still
reads up to 500 legacy messages, so canonical-only activity can be omitted.
Whether the weekly digest and featured-message system belong in MVP must be
decided before either is migrated.

## Direct messages

DM design has good local invariants: participant rows, ordered sequence numbers, client message idempotency, blocks, rate counters, typing presence, and read/activity state. The destructive lifecycle breaks the ownership model: account deletion removes the whole shared conversation for all participants. The schema supports participant `left` state, but no ordinary leave operation was found.

This must be fixed at the lifecycle contract, not by adding another cleanup exception.

## Notifications, events, and email

Email uses an outbox with status, dedupe, bounded processing, retry, preference suppression, and provider delivery projection. Mention repair and link preview queues are also bounded/leased. These are good patterns to reuse.

Fairness gaps remain:

- weekly digests select only the 50 most recently updated Published and 50 most recently updated Unlisted communities, with no durable continuation; older communities may never be evaluated;
- recurring event reminders take the first bounded set for each recurrence frequency with no cursor/partition key; high cardinality can repeatedly starve later rows;
- recipient caps intentionally bound fan-out but need an explicit continuation or product cap if communities exceed the limit.

“Cron ran successfully” does not prove every eligible community/event was eventually processed.

## Retention and privacy

Canonical moderation event types include privacy purge request/completion states, but no transition owner was found. Ordinary delete tombstones content and schedules evidence sync. The accepted policy requires an explicit purge to propagate through evidence/source traces, archives, retrieval, and accepted intelligence; the implementation and exact retention TTLs remain missing. That lifecycle must precede deletion of legacy evidence or account data.

## Reduction candidates

| Candidate | Classification | Action | Idiot index | Rationale |
| --- | --- | --- | ---: | --- |
| canonical community interaction substrate | `KEEP (MVP core)` | `HARDEN` | 0 | core participation and evidence source |
| normal web legacy chat preload/readiness gate | `DELETE CANDIDATE` | `DELETE` after signed-in no-call proof | 10 | invisible read/write dependency creates empty legacy threads before rendering the canonical feed |
| legacy message writer and mutation surface | `DELETE CANDIDATE` | `DELETE` after preload removal and first-party no-call proof | 9 | historical rows do not require a live writer |
| legacy mapping/backfill/attachment bridge | `KEEP TEMPORARILY` | `MIGRATE_THEN_DELETE` | 3 | 67 mappings are valid; four attachment targets still need canonical rows |
| weekly digest reading legacy chat | `DECISION REQUIRED` | `DELETE` or canonicalize | 9 | not named in MVP must-keep scope and currently omits canonical-only activity |
| public featured legacy messages | `DECISION REQUIRED` | `DELETE` or canonicalize | 8 | two rows render, but no first-party feature/unfeature caller was found |
| no-cursor “most recently updated” digest selection | `DECISION REQUIRED` | delete with digest or `BOUND`, `HARDEN` | 8 | do not optimize a scheduler for an optional product job |
| DM participant departure state without a leave flow | `KEEP (MVP core)` | `HARDEN` | 7 | schema state with no user lifecycle owner |
| delete whole DM conversation on one account deletion | `KEEP (MVP core)` | `HARDEN` | 10 | destroys other-party history |
| canonical privacy purge event vocabulary without workflow | `KEEP (MVP core)` | `HARDEN`, `MIGRATE_THEN_DELETE` | 8 | accepted purge policy has no transition owner; vocabulary alone creates false assurances |

## Migration order

Remove the normal web legacy preload/readiness dependency -> delete unreachable
legacy UI writer/edit/delete/reaction paths -> decide whether digest and featured
messages should exist -> migrate only retained attachment/reaction/featured
history -> replay and audit historical backfill -> observe zero legacy reads and
writes -> delete legacy APIs, links, tables, and lifecycle residue.
