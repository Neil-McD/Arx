# Domain Dossier — Interactions, Direct Messages, Events, and Notifications

## Irreducible job

Members need one authorized community interaction system for posts/chat/replies/reactions/mentions, one direct-message system, and deterministic notification delivery. Legacy storage must not silently remain a second product truth.

## Canonical interaction migration

The canonical substrate is `communityInteractionRoots`, replies, content blocks, attachments, embeds, reactions, mentions, moderation events, visibility rules, and evidence-sync state. The normal UI writes canonical interactions.

`docs/community-interaction-migration-residue-map.md` names the remaining compatibility queue:

- legacy writer `community:createThreadUserMessage`;
- `communityInteractionLegacyChatLinks`;
- legacy attachment hydration/link state;
- backfill API and remaining legacy chat readers.

Current canonical writes no longer need legacy message creation, but legacy reads still feed archive documents, recent context, weekly digests, cleanup, and backfill. This is a migration, not harmless duplication.

The weekly digest path reads up to 500 legacy `communityChatMessages` from the oldest canonical legacy chat thread (`emailDigests.ts:196-225`). New canonical-only interactions can therefore be missing from digest activity and content. The digest should read canonical interaction roots/replies before legacy chat is removed.

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
| legacy community message writer/link/attachment stack | `DECISION REQUIRED (user confirmation)` | `OBSERVE_FIRST`, `MIGRATE_THEN_DELETE` | 8 | replacement exists, but remaining archive/digest/backfill consumers must migrate first |
| weekly digest reading legacy chat | `KEEP (MVP core)` | `MIGRATE_THEN_DELETE` | 9 | produces a stale projection of current product activity |
| no-cursor “most recently updated” digest selection | `KEEP (MVP core)` | `BOUND`, `HARDEN` | 8 | a bounded job that permanently starves objects is false reliability |
| DM participant departure state without a leave flow | `KEEP (MVP core)` | `HARDEN` | 7 | schema state with no user lifecycle owner |
| delete whole DM conversation on one account deletion | `KEEP (MVP core)` | `HARDEN` | 10 | destroys other-party history |
| canonical privacy purge event vocabulary without workflow | `KEEP (MVP core)` | `HARDEN`, `MIGRATE_THEN_DELETE` | 8 | accepted purge policy has no transition owner; vocabulary alone creates false assurances |

## Migration order

Backfill canonical attachments and links -> switch archive/context/digest/cleanup reads -> compare bounded parity -> disable legacy writer -> observe zero legacy reads/writes -> preserve/migrate required history -> delete legacy APIs/tables/fields. Skipping the read migration would silently erase product projections even though the primary UI still works.
