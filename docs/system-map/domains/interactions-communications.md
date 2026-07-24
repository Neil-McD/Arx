# Domain Dossier — Interactions, Direct Messages, Events, and Notifications

## Irreducible job

Members need one authorized community interaction system for posts/chat/replies/reactions/mentions, one direct-message system, and deterministic notification delivery. Legacy storage must not silently remain a second product truth.

## Canonical interaction migration

The canonical substrate is `communityInteractionRoots`, replies, content blocks, attachments, embeds, reactions, mentions, moderation events, visibility rules, and evidence-sync state. The normal UI writes canonical interactions.

`docs/community-interaction-migration-residue-map.md` is the single detailed
compatibility inventory. The normal feed, composer, interaction actions,
attention state, recent context, and evidence paths are canonical. The
normal shell preload/readiness defect is closed: canonical entry and scrolling
do not ensure a legacy thread or list legacy messages/reactions. The existing
canonical projection owns loading/error/empty presentation and synchronously
excludes rows from a previously selected community.
The dormant legacy browser timeline, fallback send/edit/delete/reaction paths,
and public legacy chat functions are also deleted. Typing and attachment upload
remain because the canonical composer uses them. The unconsumed ambient
activity timeline and its writers are deleted while its historical rows remain
lifecycle-reachable.

Development staging currently has 67 legacy messages with 67 valid mapping
links. Four exact canonical attachment rows preserve the four historical
attachment payloads through their existing storage objects, and live reads no
longer hydrate attachments from legacy messages.
The three legacy reactions and two featured-message pointers are deleted, while
all eight canonical reactions remain. The weekly digest is retained as an MVP
return loop and reads bounded canonical roots and replies. The public
featured-message product was rejected rather than migrated.

## Direct messages

DM design has good local invariants: participant rows, ordered sequence numbers, client message idempotency, blocks, rate counters, typing presence, and read/activity state. The destructive lifecycle breaks the ownership model: account deletion removes the whole shared conversation for all participants. The schema supports participant `left` state, but no ordinary leave operation was found.

This must be fixed at the lifecycle contract, not by adding another cleanup exception.

## Notifications, events, and email

Email uses an outbox with status, terminal dedupe, bounded processing, retry,
preference suppression, and normalized provider delivery projection. Weekly,
mention, and DM jobs queue only bounded source coordinates. Send time resolves
the current verified address, preference, access, visibility, presence/read
state, and canonical content, so recipients still receive useful short excerpts
without those excerpts becoming durable queue copies. Suppressed and terminal
rows retain no address or authored prose. Provider receipts are idempotent by
provider event id, retain no raw body, and expire with terminal outbox receipts
after 90 days. The bounded staging migration minimized all 129 historical
terminal outbox rows and its replay performed zero work.

Mention repair and link preview queues are also bounded/leased. These are good
patterns to reuse.

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
| legacy message writer and mutation surface | `DELETE (deferred/dead)` complete | deleted after preload removal and first-party no-call proof | 9 | historical rows do not require a live writer |
| legacy mapping/backfill bridge | `KEEP TEMPORARILY` | `MIGRATE_THEN_DELETE` | 3 | 67 mappings remain valid historical migration state; attachment reads are already canonical-only |
| weekly digest reading legacy chat | `DELETE (deferred/dead)` complete | canonical reader retained; legacy reader deleted | 9 | retained product job now sees current interaction truth |
| durable email excerpt/address copies | `DELETE (deferred/dead)` complete | source-reference queue, send-time authorization/hydration, immediate terminal minimization, 90-day receipt TTL | 10 | useful recipient context does not require retained duplicate content |
| raw provider webhook bodies | `DELETE (deferred/dead)` complete | retain only normalized idempotency/status receipt | 10 | replay safety needs identity, not arbitrary provider payload retention |
| public featured legacy messages | `DELETE (deferred/dead)` complete | live surface, two pointers, schema, and lifecycle residue deleted | 8 | founder introduction and gate cover the visitor job without a second curation system |
| no-cursor “most recently updated” digest selection | `KEEP (MVP core)` | `BOUND`, `HARDEN` | 8 | retained return loop still needs eventual-service proof |
| DM participant departure state without a leave flow | `KEEP (MVP core)` | `HARDEN` | 7 | schema state with no user lifecycle owner |
| delete whole DM conversation on one account deletion | `KEEP (MVP core)` | `HARDEN` | 10 | destroys other-party history |
| canonical privacy purge event vocabulary without workflow | `KEEP (MVP core)` | `HARDEN`, `MIGRATE_THEN_DELETE` | 8 | accepted purge policy has no transition owner; vocabulary alone creates false assurances |

## Migration order

Replay and audit the historical backfill -> observe zero legacy reads and
writes -> delete legacy links, helpers, tables, and lifecycle residue only
after the integrity and retention gates pass.
