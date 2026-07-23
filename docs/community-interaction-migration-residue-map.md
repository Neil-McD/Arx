# Community Interaction Migration Residue Map

This is the canonical deletion queue for the community-chat migration. It
separates product authority, historical migration state, and optional product
requirements so that compatibility code is not mistaken for permanent
architecture.

## Classification Rules

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

## Development Staging Snapshot

Read-only aggregate captured on 2026-07-23 from
`dev:quick-porcupine-949` at web commit `878b7bc6`:

| Shape | Count | Meaning |
| --- | ---: | --- |
| legacy chat threads | 4 | three have no messages; normal shell preload can create these |
| legacy chat messages | 67 | historical migration input |
| legacy-to-canonical links | 67 | every legacy message has exactly one link |
| canonical roots / replies | 54 / 23 | current interaction authority |
| canonical-only roots / replies | 3 / 7 | cannot be represented by a legacy-only reader |
| canonical content blocks | 76 | typed content projection |
| legacy attachment-bearing messages | 4 | all four still need canonical attachment rows |
| canonical attachment rows | 0 | legacy attachment fallback is still active for four targets |
| legacy / canonical reactions | 3 / 8 | separate historical and canonical reaction state remains |
| legacy featured-message pointers | 2 | public funnel still projects them |

Integrity checks found zero unlinked legacy messages, duplicate message links,
dangling message/root/reply links, or canonical replies without content blocks.
Counts are evidence, not expectations; no test should freeze them.

C3.2B acceptance compared the same bounded aggregate before and after
authenticated navigation on exact runtime commit `d2aa605f` across the
Polynet, Distribution Engineering, and test community chat surfaces. It
remained four legacy threads, three empty threads, 67 legacy messages, and
three legacy reactions. No entry or switch created legacy chat state.

## Current Residue

| ID | Job | Classification | Current owner and first-party path | Delete condition |
| --- | --- | --- | --- | --- |
| R-003 | Legacy message-to-interaction mapping | `KEEP TEMPORARILY` | `communityInteractionLegacyChatLinks`, `communityInteractionLegacyBridge.ts` | Delete after historical attachment/reaction/featured decisions are closed, no canonical read needs legacy IDs, and the backfill replay reports zero work. |
| R-004 | Legacy attachment hydration fallback | `KEEP TEMPORARILY` | `communityInteractionLegacyAttachments.ts` behind canonical-first reads | Backfill the four observed targets, prove canonical rendering parity, then delete the fallback module and lookup. |
| R-007 | Legacy-to-canonical backfill API | `KEEP TEMPORARILY` | `communityInteractionBackfill.ts` | Keep only until all 67 historical messages and retained attachment/reaction/featured state pass a final bounded replay and integrity audit. |
| R-008 | Weekly community digest reading legacy messages | `DECISION REQUIRED` | `emailDigests.ts` | Weekly digest is not named in the MVP must-keep contract. Delete the digest job if it is not required; otherwise move it to bounded canonical root/reply reads and prove canonical-only activity appears. |
| R-009 | Public featured-message system backed by legacy message pointers | `DECISION REQUIRED` | `communityFeatured.ts`, `communityPublic.ts`, `communityFeaturedMessages` | No first-party feature/unfeature caller was found, but two pointers still render in public funnels. Delete if highlights are not required; otherwise migrate the pointer to canonical interactions before removing legacy rows. |
| R-010 | Legacy reaction rows | `KEEP TEMPORARILY` | `communityMessageReactions`; normal interaction UI uses `communityInteractionReactions`, while public featured projection still reads legacy reactions | Close R-009, preserve any explicitly retained reaction history, then delete legacy reaction reads, mutations, and rows. |
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
  `community_thread_reply_mention_policy_proof.ts`, not duplicated here.

Historical archive/evidence materialization remains part of R-007, but current
recent-context and interaction-evidence readers do not query legacy chat rows.

## Completed Deletions

- R-001: normal web legacy preload/readiness and pagination activation.
- R-006: live legacy thread/message/reaction browser and public mutation
  surface, including the dormant fallback send path.
- Ambient activity timeline: browser timeline, public read API, gateway, CSS,
  and best-effort writers. Historical rows remain lifecycle-reachable pending
  retention policy.

## Drift Boundaries

- Canonical interaction modules must not directly query or insert legacy chat
  tables.
- The canonical composer must not create legacy messages, threads, or links.
- Canonical reads prefer canonical attachment rows; the legacy fallback is
  migration-only.
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
3. Decide R-008 and R-009 before writing migrations. Delete optional product
   jobs rather than porting them.
4. Backfill the four retained attachment targets and any explicitly retained
   reaction/featured state; delete their fallbacks immediately after parity.
5. Run the bounded historical backfill/integrity replay, observe zero legacy
   reads and writes, then delete the link/backfill/table residue and update
   lifecycle policy.

This map authorizes no remaining migration or deletion.
