# Community Interaction Migration Residue Map

This is the canonical deletion queue for the community-chat migration. It
separates product authority, historical migration state, and optional product
requirements so that compatibility code is not mistaken for permanent
architecture.

## Classification Rules

- `KEEP (MVP core)`: required by the accepted MVP product contract and owned by
  canonical authority.
- `KEEP TEMPORARILY`: physically required by a named historical or lifecycle
  dependency. Its deletion gate must be explicit.
- `DELETE CANDIDATE`: replacement authority exists; remove after the named
  no-call or behavior proof.
- `DECISION REQUIRED`: question the product requirement before migrating it.
  Delete the feature if it is not required.

“Blocked by parity” is a deletion gate, not a fourth classification.

## Canonical Authority

- `communityInteractionRoots`, replies, typed content blocks, attachments,
  embeds, mentions, reactions, moderation events, and evidence projections own
  community interaction truth.
- The normal web projection, composer, edit/delete/reaction actions, attention
  state, recent context, and interaction evidence read or write canonical
  interactions.
- The canonical composer does not create legacy messages or legacy mapping
  links.
- Live canonical root/reply reads expose canonical ids only. Reply targeting
  accepts only a typed canonical reply id, and canonical edits do not mirror
  into historical messages.
- Legacy chat rows are historical migration input. They are not a second
  product authority.

C3.2B removed the normal shell's legacy preload and pagination activation.
Canonical projection visibility, loading, error, empty, composer, typing, and
seen-state behavior no longer depend on a legacy thread/message/reaction read.
The canonical root projection owns its existing request boundary, and stored
roots are synchronously community-scoped during navigation so an old
community's rows cannot flash before the next request begins.

C3.2C removes the now-unreachable legacy browser timeline, message
edit/delete/reaction actions, fallback send branch, gateway methods, and public
legacy chat functions. It also removes the ambient activity timeline's
unconsumed readers and writers while retaining its historical table in
lifecycle policy. Typing and attachment upload remain canonical-composer
dependencies.

C3.2D1 retains the weekly digest as an MVP return loop but closes its legacy
chat dependency. Digest chat activity now comes from bounded canonical roots
and replies, uses current canonical summaries, and excludes unreadable rows or
replies whose parent root is not live and community-readable.

C3.2D2A deletes the unmaintainable public featured-message product surface.
The callerless feature/unfeature mutations, public legacy message/reaction
reader, response field, and visitor-feed adapter are absent. The public funnel
keeps its founder introduction, gate, statistics, and ghost conversation.

C3.2D2B closes the quarantined storage. An exact-ID, staging-only mutation
deleted two featured pointers and three legacy reactions, then replayed with
zero work. The two tables, their five indexes, maintenance branch, lifecycle
edges, temporary cleanup function, and generated function identity are absent.
All five referenced messages, links, canonical targets, four historical
attachment payloads, and eight canonical reactions remain.

C3.2E1 preserves the four exact historical attachment payloads as four
canonical `communityInteractionAttachments` rows that reference the existing
storage objects. An expectation-locked, staging-only mutation created one row
per target, then replayed with zero work. Independent postflight proved exact
message/link/target/storage parity and resolvable URLs. Canonical root and reply
reads now load attachments only from canonical rows; the legacy read fallback,
temporary mutation/test, and generated function identities are absent. No
legacy message, link, thread, activity row, or storage object was mutated or
deleted.

C3.2E2A severs the remaining live identity bridge. Canonical read bundles no
longer query mapping links or emit legacy thread/message/target ids. The
composer accepts only typed canonical root/reply ids, validates targets against
the same community and root plus live/readable state, rejects unreadable root
ids, and preserves target identity across idempotent retries. Canonical edits
no longer mirror content into historical messages. The 67 mapping rows,
bounded backfill, historical
messages/threads/activity, and lifecycle reachability remain unchanged.

## Development Staging Snapshot

Read-only attachment postflight captured on 2026-07-23 from
`dev:quick-porcupine-949` at permanent runtime checkpoint `cf1033ba`:

| Shape | Count | Meaning |
| --- | ---: | --- |
| legacy chat threads | 4 | three have no messages; no normal product path creates them |
| legacy chat messages | 67 | historical migration input |
| legacy-to-canonical links | 67 | every legacy message has exactly one link |
| links matching the canonical target's migration idempotency key | 12 | redundant correspondence evidence after final audit |
| links that are the sole legacy-to-canonical correspondence receipt | 55 | retain until final audit/retention decision |
| canonical roots / replies | 54 / 23 | current interaction authority |
| canonical-only roots / replies | 3 / 7 | cannot be represented by a legacy-only reader |
| canonical content blocks | 76 | typed content projection |
| legacy attachment-bearing messages | 4 | preserved historical migration input; no live read fallback |
| canonical attachment rows | 4 | one exact row per historical attachment target |
| legacy / canonical reactions | 0 / 8 | only canonical reaction state remains |
| legacy featured-message pointers | 0 | retired product state is drained |

Integrity checks found zero unlinked legacy messages, duplicate message links,
dangling message/root/reply links, or canonical replies without content blocks.
Counts are evidence, not expectations; no test should freeze them.

The E2A preflight also found 63 readable interactions without canonical source
traces and one malformed/orphaned community-visible interaction trace. No
citation or intelligence node depends on that orphan. E2A intentionally does
not repair or delete evidence; that reconciliation is the next isolated slice.

C3.2B acceptance compared the same bounded aggregate before and after
authenticated navigation on exact runtime commit `d2aa605f` across the
Polynet, Distribution Engineering, and test community chat surfaces. It
remained four legacy threads, three empty threads, 67 legacy messages, and
three legacy reactions. No entry or switch created legacy chat state.

## Current Residue

| ID | Job | Classification | Current owner and first-party path | Delete condition |
| --- | --- | --- | --- | --- |
| R-003 | Legacy message-to-interaction mapping | `KEEP TEMPORARILY` | `communityInteractionLegacyChatLinks`, `communityInteractionLegacyBridge.ts` | Live reads/writes/edits are severed. Keep 55 sole correspondence receipts and all 67 rows until the bounded backfill replay, evidence reconciliation, integrity audit, and retention decision authorize removal. |
| R-007 | Legacy-to-canonical backfill API | `KEEP TEMPORARILY` | `communityInteractionBackfill.ts` | Keep only until all 67 historical messages and retained attachment/evidence state pass a final bounded replay and integrity audit. |
| R-008 | Weekly community digest retention email | `KEEP (MVP core)` | `emailDigests.ts` reads bounded canonical `communityInteractionRoots` and `communityInteractionReplies` | Legacy chat dependency closed by C3.2D1. Reconsider the product job only if the MVP return-loop requirement changes. |
| R-011 | Maintenance and account-lifecycle reachability for historical legacy rows | `KEEP TEMPORARILY` | `communityMaintenance.ts`, `accountLifecyclePolicy.ts` | Replace only after canonical privacy/anonymization handling and final historical deletion; do not weaken shared-history retention to simplify migration. |

## Confirmed Non-Blockers

- Canonical interaction UI rendering and subscriptions.
- Canonical composer writes and optimistic reconciliation.
- Canonical edit, delete, and reaction actions in the visible interaction
  projection.
- Community attention and unread acknowledgement.
- Recent community context.
- Interaction evidence/source-trace synchronization for new canonical
  interactions.
- Canonical reply targeting. Its behavior contract is owned by
  `community_thread_reply_mention_policy_proof.ts`; it accepts canonical
  root/reply identity only.

Historical archive/evidence materialization remains part of R-007, but current
recent-context and interaction-evidence readers do not query legacy chat rows.

## Completed Deletions

- R-001: normal web legacy preload/readiness and pagination activation.
- R-006: live legacy thread/message/reaction browser and public mutation
  surface, including the dormant fallback send path.
- R-009 live surface: callerless feature/unfeature mutations, public legacy
  featured-message/reaction projection, response field, and visitor adapter.
- R-009/R-010 storage: two featured pointers, three legacy reactions, both
  schema tables, five indexes, maintenance handling, and lifecycle edges.
- R-004: four exact legacy attachment payloads were preserved as four canonical attachment rows; the live legacy hydration fallback, temporary cutover function/test, and generated identities were deleted.
- Live legacy identity bridge: mapping-link lookups and legacy ids in canonical
  root/reply payloads, legacy reply-target fallback, and canonical edit
  mirroring into historical messages.
- Ambient activity timeline: browser timeline, public read API, gateway, CSS,
  and best-effort writers. Historical rows remain lifecycle-reachable pending
  retention policy.

## Drift Boundaries

- Canonical interaction modules must not directly query or insert legacy chat
  tables.
- The canonical composer must not create legacy messages, threads, or links.
- Canonical root/reply payloads and browser projections must not expose legacy
  thread/message/target ids.
- Canonical reply targeting must not consult mapping links.
- Canonical edits must not patch historical chat messages.
- Canonical reads load attachments only from canonical rows; no legacy
  attachment read fallback remains.
- The normal web interaction gateway must not call legacy chat mutations.
- Missing canonical writer or reply identity fails closed; it never silently
  falls back from the canonical projection.
- Counts above are redacted observations, never schema invariants.
- No migration should be implemented for a feature that should be deleted.

## Causal Deletion Order

1. **C3.2B complete:** the normal web legacy preload/readiness and scroll
   pagination dependency is deleted without touching historical data.
2. **C3.2C complete:** delete the now-unreachable legacy UI mutation/send
   branch and its public writer/edit/delete/reaction surface.
3. **C3.2D1 complete:** retain R-008 but move its chat input to canonical
   interactions.
4. **C3.2D2A complete:** delete R-009's live public product surface without
   mutating its stored historical pointers.
5. **C3.2D2B complete:** delete the quarantined R-009 pointer rows and R-010
   legacy reaction rows, then remove their tables, maintenance handling, and
   lifecycle edges.
6. **C3.2E1 complete:** preserve the four exact attachment targets as canonical
   rows, prove exact parity and zero-work replay, then delete their live read
   fallback and temporary migration surface.
7. **C3.2E2A complete:** remove legacy ids and mapping-link lookups from live
   reads, accept only canonical reply targets, and stop edit mirroring without
   mutating historical state.
8. **C3.2E2B next:** reconcile missing, malformed, and orphaned interaction
   evidence before treating the historical bridge as removable.
9. Run the bounded historical backfill/integrity replay, observe zero live
   legacy reads and writes, then audit link/backfill/table residue and update
   lifecycle policy only if retention and evidence gates authorize deletion.

This map authorizes no further attachment, link, backfill, activity-history,
message, thread, or remaining schema-table deletion.
