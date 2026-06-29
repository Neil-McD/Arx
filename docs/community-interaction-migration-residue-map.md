# Community Interaction Migration Residue Map

This map is the deletion queue for the community chat substrate migration. It separates necessary migration bridges from accidental drift.

## Classification Rules

- `KEEP TEMPORARILY`: required until a named migration condition is complete.
- `BLOCKED BY PARITY`: cannot be deleted until canonical interaction behavior reaches feature parity.
- `DELETE CANDIDATE`: should be removed after a narrow proof or live smoke confirms no first-party call path needs it.

## Current Residue

| ID | Residue | Classification | Current Owner | Delete Condition |
|---|---|---|---|---|
| R-001 | Legacy chat writer `community:createThreadUserMessage` | `BLOCKED BY PARITY` | `convex/communityChat.ts`, `shared/cloudCommunityChatGateway.ts` | Delete after ambiguous reply targets, projection-disabled fallback, and any remaining legacy optimistic-row dependencies no longer need it. |
| R-002 | Legacy compatibility message rows created by canonical composer | `KEEP TEMPORARILY` | `convex/communityInteractionLegacyBridge.ts` | Delete after archive, realtime, digests, and legacy row-shaped optimistic replacement no longer require `communityChatMessages`. |
| R-003 | Legacy chat to interaction mapping table | `KEEP TEMPORARILY` | `communityInteractionLegacyChatLinks`, `convex/communityInteractionLegacyBridge.ts` | Delete after historical chat rows are fully backfilled and no UI or adapter needs legacy-to-canonical id mapping. |
| R-004 | Legacy attachment hydration fallback in canonical read bundles | `BLOCKED BY PARITY` | `convex/communityInteractionAttachmentBridge.ts`, `convex/communityInteractionLegacyAttachments.ts`, `apps/web/src/components/communityInteractionFeed.tsx` | Delete after historical attachment backfill and projection rendering are canonical-only. |
| R-005 | Projection feature flag and legacy timeline fallback | `KEEP TEMPORARILY` | `VITE_ENABLE_COMMUNITY_INTERACTION_PROJECTION`, `WebCommunityChatPanel`, `useCommunityChatRealtime` | Delete after canonical projection is the only community chat surface in staging and production. |
| R-007 | Legacy chat backfill API | `KEEP TEMPORARILY` | `convex/communityInteractionBackfill.ts` | Delete after historical `communityChatMessages` are migrated and audited. |

## Drift Boundaries

- Canonical interaction reads must not use legacy chat rows as source-of-truth.
- Canonical interaction writes must not insert legacy chat rows directly.
- Legacy chat table writes for canonical composer compatibility must live in `communityInteractionLegacyBridge`.
- Canonical read bundles must prefer `communityInteractionAttachments`; legacy attachment hydration may only run as an absent-canonical-row fallback until historical attachments are backfilled.
- The web interaction gateway must not call legacy chat mutations.
- The shared community send controller may fall back to legacy sends only when projection is disabled or replies cannot be mapped to a canonical root.
- Legacy chat realtime must remain scoped to the legacy timeline fallback; canonical projection refresh must use canonical interaction reads/subscriptions.

## Next Deletion Order

1. Backfill historical legacy attachments into canonical attachment rows.
2. Make canonical projection the only community chat UI.
3. Remove ambiguous legacy reply fallback from the shared community send controller.
4. Remove canonical composer compatibility row creation.
5. Delete legacy chat reads and backfill/admin tools after data migration is audited.
