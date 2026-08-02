# Community Interaction Migration Residue Map

This map is the deletion queue for the community chat substrate migration. It separates necessary migration bridges from accidental drift.

## Classification Rules

- `KEEP TEMPORARILY`: required until a named migration condition is complete.
- `BLOCKED BY PARITY`: cannot be deleted until canonical interaction behavior reaches feature parity.
- `DELETE CANDIDATE`: should be removed after a narrow proof or live smoke confirms no first-party call path needs it.

## Current Residue

| ID | Residue | Classification | Current Owner | Delete Condition |
|---|---|---|---|---|
| R-001 | Legacy chat writer `communityChat:createThreadUserMessage` | `BLOCKED BY PARITY` | `convex/communityChat.ts`, `shared/cloudCommunityChatGateway.ts` | Delete after remaining archive, context, digest, cleanup, and migration consumers no longer need legacy chat rows. |
| R-003 | Legacy chat to interaction mapping table | `KEEP TEMPORARILY` | `communityInteractionLegacyChatLinks`, `convex/communityInteractionLegacyBridge.ts` | Delete after historical chat rows are fully backfilled and no UI or adapter needs legacy-to-canonical id mapping. |
| R-004 | Legacy attachment hydration fallback in canonical read bundles | `BLOCKED BY PARITY` | `convex/communityInteractionAttachmentBridge.ts`, `convex/communityInteractionLegacyAttachments.ts`, `apps/web/src/components/communityInteractionFeed.tsx` | Delete after historical attachment backfill and projection rendering are canonical-only. |
| R-006 | Legacy web timeline props and inactive client state | `DELETE CANDIDATE` | `apps/web/src/components/WebCommunityChatPanel.tsx`, `apps/web/src/controllers/useWebCommunityChatController.ts` | Delete after canonical composer state is split from the old timeline-shaped prop contract; the production web owner must not preload, subscribe to, or paginate legacy chat. |
| R-007 | Legacy chat backfill API | `KEEP TEMPORARILY` | `convex/communityInteractionBackfill.ts` | Delete after historical `communityChatMessages` are migrated and audited. |

## Removed Residue

| ID | Residue | Result |
|---|---|---|
| R-002 | Legacy compatibility message rows created by canonical composer | Deleted for the staging clean-room composer. New canonical sends no longer create `communityChatMessages`, `communityChatThreads`, or `communityInteractionLegacyChatLinks`. |
| R-005 | Projection feature flag and authenticated legacy client bootstrap | Deleted for production projection promotion. Canonical interaction projection is the only authenticated community chat owner. The web composition no longer mounts a legacy preload lifecycle, legacy realtime subscription, or legacy scroll-pagination lifecycle. Signed-out/empty-state markup and backend compatibility remain separate residue. |

## Remaining Legacy Chat Row Blockers

- Legacy compatibility consumers: `communityChat:createThreadUserMessage`, `communityChat:listThreadMessages`, legacy reactions, archive/context/digest/cleanup paths, and migration tools still use `communityChatMessages`.
- Archive and knowledge compatibility: old legacy rows still feed chat archive documents and archive backfill.
- Context and digest compatibility: recent context and weekly email digests still read legacy chat rows.
- Cleanup/account compatibility: account deletion, anonymous cleanup, and community lifecycle cleanup still need legacy chat row reachability.
- Historical migration: legacy chat backfill still reads old `communityChatMessages` to materialize canonical interactions.
- No longer blockers: canonical composer sends, canonical projection sends, canonical optimistic reconciliation, production chat rendering, and community attention chat dots no longer require legacy chat row replacement; canonical sends no longer fall back to the legacy chat writer when the canonical writer is missing.

## Drift Boundaries

- Canonical interaction reads must not use legacy chat rows as source-of-truth.
- Canonical interaction writes must not insert legacy chat rows directly.
- Canonical composer writes must not insert legacy chat rows or legacy chat links.
- Canonical read bundles must prefer `communityInteractionAttachments`; legacy attachment hydration may only run as an absent-canonical-row fallback until historical attachments are backfilled.
- The web interaction gateway must not call legacy chat mutations.
- The shared community send controller may keep legacy sends only for non-projection compatibility call paths; normal web chat uses canonical projection sends, and a missing canonical writer fails closed.
- Canonical projection reply targets without a canonical root id fail closed.
- Canonical projection sends must not require legacy-shaped row replacement; legacy returned rows are compatibility outputs only.
- Community attention chat dots must derive from canonical interaction roots/replies, not `communityChatMessages`.
- The normal web chat UI must not mount legacy chat preload, realtime, or scroll-pagination lifecycles; canonical projection refresh must use canonical interaction reads/subscriptions.

## Next Deletion Order

1. Split canonical composer state from the legacy timeline-shaped web prop contract, then delete the inactive web timeline renderer and state.
2. Backfill historical legacy attachments into canonical attachment rows.
3. Delete legacy chat reads and backfill/admin tools after data migration is audited.
