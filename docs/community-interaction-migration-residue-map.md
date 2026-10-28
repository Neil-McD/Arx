# Community Interaction Migration Residue Map

This map is the deletion queue for the community chat substrate migration. It separates necessary migration bridges from accidental drift.

## Classification Rules

- `KEEP TEMPORARILY`: required until a named migration condition is complete.
- `BLOCKED BY PARITY`: cannot be deleted until canonical interaction behavior reaches feature parity.
- `DELETE CANDIDATE`: should be removed after a narrow proof or live smoke confirms no first-party call path needs it.

## Current Residue

| ID | Residue | Classification | Current Owner | Delete Condition |
|---|---|---|---|---|
| R-008 | Null `pinned_at` compatibility field in mapped root bundles | `KEEP TEMPORARILY` | `convex/communityInteractions.ts`, `shared/cloudCommunityInteractionsGateway.ts` | Delete after the cached-client compatibility window closes and no shipped client expects the field. Channel `pinnedRootId` remains the only pin authority. |
| R-009 | Temporary unchanneled General migration lane | `KEEP TEMPORARILY` | `convex/communityChannelBackfill.ts`, `convex/communityChannelAudit.ts`, `convex/communityInteractions.ts` | Delete only after two consecutive production audits report zero readable unchanneled roots/replies and the backfill is complete. |

## Removed Residue

| ID | Residue | Result |
|---|---|---|
| R-002 | Legacy compatibility message rows created by canonical composer | Deleted for the staging clean-room composer. New canonical sends no longer create `communityChatMessages`, `communityChatThreads`, or `communityInteractionLegacyChatLinks`. |
| R-005 | Projection feature flag and authenticated legacy client bootstrap | Deleted for production projection promotion. Canonical interaction projection is the only authenticated community chat owner. The web composition no longer mounts a legacy preload lifecycle, legacy realtime subscription, or legacy scroll-pagination lifecycle. Signed-out/empty-state markup and backend compatibility remain separate residue. |
| R-006 | Legacy web timeline props and inactive client state | Deleted with the orphaned web data and mixed mutation controllers. The web shell now carries only canonical composer state into the canonical interaction projection; signed-out and unresolved-community markup are empty states, not a second timeline. |
| R-010 | Private community-agent dock endpoints and gateway | Deleted after a complete production census found zero dock roots, replies, mentions, or serve requests and the application caller census found no first-party owner. Community-agent conversations now have one destination: canonical community interaction threads. |
| R-001 | Legacy chat writer `communityChat:createThreadUserMessage` | Deleted Oct 28, 2026 (POL-26) with the rest of the old thread chat: reads, edits, deletes, reactions, the ticketed upload route, and the dual-write adapter. `communityChat` keeps only typing presence. |
| R-003 | Legacy chat to interaction mapping table | Deleted Oct 28, 2026 (POL-26) from code: production had all 92 legacy messages linked. Read bundles no longer expose `legacy_*` ids. The `communityInteractionLegacyChatLinks` table leaves the schema in the table-drop release. |
| R-004 | Legacy attachment hydration fallback in canonical read bundles | Deleted Oct 28, 2026 (POL-26): no production legacy message carried attachments. Read bundles return canonical `communityInteractionAttachments` only. The composer still accepts the old inline attachment shape from the cached production web and refuses it with a reattach message. |
| R-007 | Legacy chat backfill API | Deleted Oct 28, 2026 (POL-26) after the production census: 92 of 92 legacy messages backfilled. |
| R-011 | Historical Community Agent serve intake literals for retired requester/owner BYOK states | Deleted after the 2026-08-09 bounded census found zero matching rows across 6 staging and 10 production `communityAgentServeRequests` records. Current intake has no writer for these values. |

## Old Chat Tables

The old thread chat code is gone (POL-26). Its tables (`communityChatThreads`, `communityChatMessages`, `communityMessageReactions`, `communityFeaturedMessages`, `communityInteractionLegacyChatLinks`) keep their rows until the table-drop release, with a production backup and Neil's sign-off. Anonymous-user cleanup and orphan maintenance still delete old rows for removed users until then.

## Drift Boundaries

- Canonical interaction reads must not use legacy chat rows as source-of-truth.
- Canonical interaction writes must not insert legacy chat rows directly.
- Canonical composer writes must not insert legacy chat rows or legacy chat links.
- Canonical read bundles return `communityInteractionAttachments` only.
- The web interaction gateway must not call legacy chat mutations.
- The web composer writes only through the canonical interaction gateway and has no legacy send fallback.
- Canonical projection reply targets without a canonical root id fail closed.
- Canonical projection sends must not require legacy-shaped row replacement.
- Community attention chat dots must derive from canonical interaction roots/replies, not `communityChatMessages`.
- The normal web chat UI must not mount legacy chat preload, realtime, or scroll-pagination lifecycles; canonical projection refresh must use canonical interaction reads/subscriptions.

## Next Deletion Order

1. Backfill and audit the temporary unchanneled General lane until two consecutive production audits report zero drift.
2. Drop the old chat tables in the table-drop release.
