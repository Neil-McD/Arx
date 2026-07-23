import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const packageJson = read("package.json");
const residueMap = read("docs/community-interaction-migration-residue-map.md");
const contract = read("docs/community-interaction-substrate-contract-v1.md");
const app = read("apps/web/src/App.tsx");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const sendController = read("shared/useCommunityChatMutationController.ts");
const chatGateway = read("shared/cloudCommunityChatGateway.ts");
const interactionGateway = read("shared/cloudCommunityInteractionsGateway.ts");
const communityChat = read("convex/communityChat.ts");
const facade = read("convex/community.ts");
const interactions = read("convex/communityInteractions.ts");
const backfill = read("convex/communityInteractionBackfill.ts");
const legacyBridge = read("convex/communityInteractionLegacyBridge.ts");
const legacyAttachments = read("convex/communityInteractionLegacyAttachments.ts");
const schema = read("convex/schema.ts");
const emailDigests = read("convex/emailDigests.ts");
const communityPublic = read("convex/communityPublic.ts");
const maintenance = read("convex/communityMaintenance.ts");
const lifecycle = read("convex/accountLifecyclePolicy.ts");

assert.match(
  packageJson,
  /"check:community-interaction-migration-residue-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_interaction_migration_residue_proof\.ts"/,
  "package scripts should expose the interaction migration residue proof",
);
assert.match(
  residueMap,
  /C3\.2C removes[\s\S]*## Completed Deletions[\s\S]*R-006:[\s\S]*## Causal Deletion Order[\s\S]*C3\.2C complete/,
  "the residue map should record the completed live legacy-surface deletion",
);
assert.doesNotMatch(
  residueMap,
  /\| R-006 \|/,
  "the completed writer residue should not remain in the current deletion queue",
);
for (const needle of [
  "| R-003 | Legacy message-to-interaction mapping | `KEEP TEMPORARILY` |",
  "| R-004 | Legacy attachment hydration fallback | `KEEP TEMPORARILY` |",
  "| R-007 | Legacy-to-canonical backfill API | `KEEP TEMPORARILY` |",
  "| R-008 | Weekly community digest reading legacy messages | `DECISION REQUIRED` |",
  "| R-009 | Public featured-message system backed by legacy message pointers | `DECISION REQUIRED` |",
  "| R-010 | Legacy reaction rows | `KEEP TEMPORARILY` |",
  "| R-011 | Maintenance and account-lifecycle reachability for historical legacy rows | `KEEP TEMPORARILY` |",
  "Counts are evidence, not expectations; no test should freeze them.",
  "No migration should be implemented for a feature that should be deleted.",
]) {
  assert.ok(residueMap.includes(needle), `residue map should include: ${needle}`);
}
assert.match(
  contract,
  /Retired Legacy Live Chat Surface[\s\S]*no legacy chat preload[\s\S]*public community API does not expose[\s\S]*legacy thread ensure\/list[\s\S]*authenticated typing presence and attachment upload URL generation remain[\s\S]*migration-only legacy planning\/materialization helpers remain owned by the[\s\S]*bounded backfill/,
  "the substrate contract should separate deleted live authority from retained migration state",
);

for (const path of [
  "shared/useCommunityChatDataController.ts",
  "shared/useCommunityChatRealtime.ts",
  "shared/useCommunityChatViewport.ts",
  "convex/communityActivity.ts",
] as const) {
  assert.equal(existsSync(join(root, path)), false, `${path} should be deleted`);
}

const retiredLiveSymbols =
  /ensureCommunityChatThread|listThreadMessages|createThreadUserMessage|patchOwnMessageContent|deleteOwnMessage|createMessageReaction|deleteMessageReactionById|listMessageReactions|createCloudThreadUserMessageRows|subscribeCloudThreadMessages|subscribeCloudMessageReactions|listCommunityActivityEvents|recordCommunityActivityEventBestEffort/;
for (const [label, source] of [
  ["App", app],
  ["chat panel", chatPanel],
  ["send controller", sendController],
  ["chat gateway", chatGateway],
  ["community chat backend", communityChat],
  ["community facade", facade],
] as const) {
  assert.doesNotMatch(source, retiredLiveSymbols, `${label} should not retain retired live legacy chat authority`);
}
assert.doesNotMatch(
  interactions,
  /recordLegacyChatMessageInteractionBestEffort|syncLegacyChatMessageEditToInteractionCore|syncLegacyChatMessageDeleteToInteractionCore|createInteractionRootFromLegacyChatMessageCore|createInteractionReplyFromLegacyChatMessageCore/,
  "canonical interactions should not retain wrappers used only by deleted live legacy writes",
);
assert.doesNotMatch(
  chatPanel,
  /CommunityChatTimelineItem|community-activity-marker|handleToggleCommunityMessageReaction|handleSaveCommunityMessageEdit|handleDeleteCommunityMessage/,
  "the chat panel should not retain legacy timeline actions or ambient markers",
);
assert.match(
  sendController,
  /resolveCanonicalCommunityChatSendRoute[\s\S]*community_interaction_writer_missing[\s\S]*community_interaction_reply_target_unmapped[\s\S]*createCommunityInteractionMessageRows/,
  "the one remaining send route should be canonical and fail closed",
);
assert.match(
  interactionGateway,
  /createCommunityInteractionComposerMessage[\s\S]*listCommunityInteractionRoots[\s\S]*listCommunityInteractionReplies/,
  "the browser interaction gateway should own canonical writes and reads",
);
assert.match(
  communityChat,
  /generateCommunityChatAttachmentUploadUrl[\s\S]*setCommunityTyping[\s\S]*listCommunityTyping/,
  "the chat backend should retain only canonical-composer upload and typing support",
);

assert.match(
  backfill,
  /planInteractionReplyFromLegacyChatMessageCore[\s\S]*planInteractionRootFromLegacyChatMessageCore[\s\S]*materializeLegacyChatReplyInteractionPlan[\s\S]*materializeLegacyChatRootInteractionPlan/,
  "the bounded historical backfill should retain direct plan and materialize helpers",
);
assert.match(
  legacyBridge,
  /getLegacyChatLinkByMessage[\s\S]*communityInteractionLegacyChatLinks[\s\S]*insertLegacyChatLinkIfMissing/,
  "legacy mapping access should remain isolated for migration",
);
assert.match(
  legacyAttachments,
  /Migration-only bridge[\s\S]*communityInteractionAttachments/,
  "legacy attachment fallback should remain explicitly migration-only",
);
assert.match(
  schema,
  /communityChatThreads: defineTable[\s\S]*communityChatMessages: defineTable[\s\S]*communityActivityEvents: defineTable[\s\S]*communityMessageReactions: defineTable[\s\S]*communityInteractionLegacyChatLinks: defineTable/,
  "historical legacy and activity rows should remain schema-reachable",
);
assert.match(
  emailDigests,
  /query\("communityChatThreads" as any\)[\s\S]*query\("communityChatMessages" as any\)/,
  "the undecided weekly digest legacy dependency should remain explicit",
);
assert.match(
  communityPublic,
  /communityFeaturedMessages[\s\S]*row\.messageId[\s\S]*communityMessageReactions/,
  "the undecided featured-message legacy dependency should remain explicit",
);
assert.match(
  maintenance,
  /communityChatThreads[\s\S]*communityChatMessages[\s\S]*communityMessageReactions/,
  "maintenance should retain historical legacy reachability",
);
assert.match(
  lifecycle,
  /communityChatMessages[\s\S]*communityFeaturedMessages[\s\S]*communityInteractionRoots[\s\S]*communityChatThreads[\s\S]*communityInteractionLegacyChatLinks[\s\S]*communityActivityEvents/,
  "lifecycle policy should retain historical and canonical interaction reachability",
);

console.log("community_interaction_migration_residue_proof: ok");
