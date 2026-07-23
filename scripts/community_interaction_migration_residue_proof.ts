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
const communityCore = read("convex/communityCore.ts");
const interactions = read("convex/communityInteractions.ts");
const backfill = read("convex/communityInteractionBackfill.ts");
const legacyBridge = read("convex/communityInteractionLegacyBridge.ts");
const legacyAttachments = read("convex/communityInteractionLegacyAttachments.ts");
const schema = read("convex/schema.ts");
const emailDigests = read("convex/emailDigests.ts");
const communityPublic = read("convex/communityPublic.ts");
const generatedApi = read("convex/_generated/api.d.ts");
const visitorProjection = read("apps/web/src/controllers/buildWebCommunityVisitorProjection.ts");
const visitorSurface = read("apps/web/src/components/WebCommunityVisitorSurface.tsx");
const publicFunnel = read("apps/web/src/components/WebPublicCommunityFunnel.tsx");
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
  "| R-008 | Weekly community digest retention email | `KEEP (MVP core)` |",
  "| R-011 | Maintenance and account-lifecycle reachability for historical legacy rows | `KEEP TEMPORARILY` |",
  "**C3.2D2B complete:**",
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
  "convex/communityFeatured.ts",
  "convex/communityInteractionResidueCleanup.ts",
  "convex/communityInteractionResidueCleanup.test.ts",
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
  /communityChatThreads: defineTable[\s\S]*communityChatMessages: defineTable[\s\S]*communityActivityEvents: defineTable[\s\S]*communityInteractionLegacyChatLinks: defineTable/,
  "retained historical messages, activity, and mapping rows should remain schema-reachable",
);
assert.doesNotMatch(
  schema,
  /communityMessageReactions: defineTable|communityFeaturedMessages: defineTable/,
  "drained featured pointers and legacy reactions should have no schema tables",
);
assert.match(
  emailDigests,
  /listRecentCanonicalCommunityChatMessages[\s\S]*query\("communityInteractionRoots" as any\)[\s\S]*query\("communityInteractionReplies" as any\)[\s\S]*COMMUNITY_DIGEST_INTERACTION_LIMIT \+ 1/,
  "the retained weekly digest should read bounded canonical roots and replies",
);
assert.match(
  emailDigests,
  /visibilityScope === "community" \|\| row\.visibilityScope === "public"[\s\S]*readableParentRoots\.has\(String\(reply\.rootId\)\)/,
  "digest interactions and reply parents should fail closed on visibility",
);
assert.doesNotMatch(
  emailDigests,
  /communityChatThreads|communityChatMessages|contentJson/,
  "the weekly digest should not retain legacy chat authority",
);
for (const [label, source] of [
  ["public community API", communityPublic],
  ["generated API", generatedApi],
  ["visitor projection", visitorProjection],
  ["visitor surface", visitorSurface],
  ["public funnel", publicFunnel],
] as const) {
  assert.doesNotMatch(
    source,
    /communityFeatured|communityFeaturedMessages|featured_messages|featuredMessages|VisitorFeaturedMessage|visitor-featured/,
    `${label} should not retain the deleted featured-message product surface`,
  );
}
assert.doesNotMatch(
  communityPublic,
  /communityChatMessages|communityMessageReactions|extractMessageText/,
  "the public funnel should not read legacy chat or reaction rows",
);
assert.match(
  visitorProjection,
  /visitor-pinned-note[\s\S]*VISITOR_HOST_USER_ID/,
  "the visitor projection should retain the founder introduction",
);
assert.match(
  visitorSurface,
  /CommunityVisitorGhostThread[\s\S]*CommunityVisitorGate/,
  "the public funnel should retain its ghost conversation and join gate",
);
assert.match(
  maintenance,
  /communityChatThreads[\s\S]*communityChatMessages/,
  "maintenance should retain historical message reachability",
);
assert.doesNotMatch(
  maintenance,
  /communityMessageReactions|message_reactions/,
  "maintenance should not retain the deleted legacy reaction table",
);
assert.doesNotMatch(
  communityCore,
  /CommunityMessageReactionLike/,
  "the legacy reaction row type should be deleted",
);
assert.match(
  lifecycle,
  /communityChatMessages[\s\S]*communityActivityEvents[\s\S]*communityInteractionRoots[\s\S]*communityChatThreads[\s\S]*communityInteractionLegacyChatLinks/,
  "lifecycle policy should retain remaining historical and canonical interaction reachability",
);
assert.doesNotMatch(
  lifecycle,
  /communityFeaturedMessages|communityMessageReactions/,
  "lifecycle policy should not retain deleted table edges",
);
assert.doesNotMatch(
  generatedApi,
  /communityInteractionResidueCleanup/,
  "the temporary destructive function identity should be deleted",
);

console.log("community_interaction_migration_residue_proof: ok");
