import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const packageJson = read("package.json");
const residueMap = read("docs/community-interaction-migration-residue-map.md");
const contract = read("docs/community-interaction-substrate-contract-v1.md");
const app = read("apps/web/src/App.tsx");
const interactionController = read(
  "apps/web/src/controllers/useWebCommunityInteractionProjection.ts",
);
const webChatController = read(
  "apps/web/src/controllers/useWebCommunityChatController.ts",
);
const interactions = read("convex/communityInteractions.ts");
const attachmentBridge = read("convex/communityInteractionAttachmentBridge.ts");
const communityChat = read("convex/communityChat.ts");
const communityTypingCore = read("convex/communityTypingPresenceCore.ts");
const schema = read("convex/schema.ts");
const chatGateway = read("shared/cloudCommunityChatGateway.ts");
const interactionGateway = read("shared/cloudCommunityInteractionsGateway.ts");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const communityAttention = read("convex/communityAttention.ts");
const webAttentionController = read(
  "apps/web/src/controllers/useWebCommunityAttentionController.ts",
);
const legacyPreloadLifecyclePath = join(
  root,
  "apps/web/src/controllers/useWebCommunityChatPreloadLifecycle.ts",
);
const legacyDataControllerPath = join(
  root,
  "shared/useCommunityChatDataController.ts",
);
const legacyMutationControllerPath = join(
  root,
  "shared/useCommunityChatMutationController.ts",
);

function assertIncludes(sourceName: string, source: string, needle: string): void {
  assert.ok(source.includes(needle), `${sourceName} should include: ${needle}`);
}

function extractExportedConst(source: string, name: string): string {
  const start = source.indexOf(`export const ${name} =`);
  assert.notEqual(start, -1, `expected exported const ${name}`);
  const next = source.indexOf("\nexport const ", start + 1);
  const block = next === -1 ? source.slice(start) : source.slice(start, next);
  // Follow a thin wrapper into the shared core it delegates to.
  const core = block.match(/handler:\s*(?:async\s*)?\([^)]*\)\s*=>\s*(\w+Core)\(/)?.[1];
  if (!core) return block;
  const coreStart = source.indexOf(`async function ${core}(`);
  assert.notEqual(coreStart, -1, `expected core ${core}`);
  return `${block}\n${source.slice(coreStart, source.indexOf("\n}\n", coreStart) + 2)}`;
}

assert.match(
  packageJson,
  /"check:community-interaction-migration-residue-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_interaction_migration_residue_proof\.ts"/,
  "package scripts should expose the interaction migration residue proof",
);

assert.match(
  contract,
  /community-interaction-migration-residue-map\.md[\s\S]*KEEP TEMPORARILY[\s\S]*BLOCKED BY PARITY[\s\S]*DELETE CANDIDATE/,
  "substrate contract should point cleanup work at the residue map",
);
for (const path of [
  "convex/communityInteractionLegacyBridge.ts",
  "convex/communityInteractionLegacyAttachments.ts",
  "convex/communityInteractionBackfill.ts",
  "convex/communityLegacyAttachmentUploads.ts",
]) {
  assert.equal(existsSync(join(root, path)), false, `${path} stays deleted with the old chat (POL-26)`);
}

[
  "| R-001 | Legacy chat writer `communityChat:createThreadUserMessage` | Deleted Oct 28, 2026 (POL-26)",
  "| R-003 | Legacy chat to interaction mapping table | Deleted Oct 28, 2026 (POL-26)",
  "| R-004 | Legacy attachment hydration fallback in canonical read bundles | Deleted Oct 28, 2026 (POL-26)",
  "| R-007 | Legacy chat backfill API | Deleted Oct 28, 2026 (POL-26)",
  "| R-002 | Legacy compatibility message rows created by canonical composer | Deleted for the staging clean-room composer.",
  "| R-005 | Projection feature flag and authenticated legacy client bootstrap | Deleted for production projection promotion.",
  "| R-006 | Legacy web timeline props and inactive client state | Deleted with the orphaned web data and mixed mutation controllers.",
  "Canonical interaction reads must not use legacy chat rows as source-of-truth.",
  "Canonical interaction writes must not insert legacy chat rows directly.",
  "The web interaction gateway must not call legacy chat mutations.",
  "The normal web chat UI must not mount legacy chat preload, realtime, or scroll-pagination lifecycles; canonical projection refresh must use canonical interaction reads/subscriptions.",
  "Community attention chat dots must derive from canonical interaction roots/replies, not `communityChatMessages`.",
  "Its tables (`communityChatThreads`, `communityChatMessages`, `communityMessageReactions`, `communityFeaturedMessages`, `communityInteractionLegacyChatLinks`) keep their rows until the table-drop release",
  "The web composer writes only through the canonical interaction gateway and has no legacy send fallback.",
  "Canonical projection reply targets without a canonical root id fail closed.",
].forEach((needle) => assertIncludes("residue map", residueMap, needle));

assert.doesNotMatch(
  interactions,
  /communityInteractionLegacyBridge|communityInteractionLegacyAttachments|communityLegacyAttachmentUploads|LegacyChatLink|legacy_message_id|resolveLegacyMessageAttachments/,
  "the canonical interaction module keeps no old chat bridge, id or attachment fallback",
);
assert.doesNotMatch(
  interactions,
  /ctx\.db\.(query|insert)\("communityChat(Messages|Threads)" as any\)|ctx\.db\.(query|insert)\("communityInteractionLegacyChatLinks" as any\)/,
  "canonical interaction module should not directly query or insert legacy chat/thread/link tables",
);
assert.doesNotMatch(
  attachmentBridge,
  /Legacy|communityChatMessages/,
  "the attachment bridge reads and claims canonical attachment rows only",
);
assert.doesNotMatch(
  interactionGateway,
  /createThreadUserMessage|createCloudThreadUserMessageRows|communityChatMessages/,
  "web interaction gateway should not call legacy chat mutations or tables",
);
assert.doesNotMatch(
  chatGateway + communityChat,
  /createThreadUserMessage|listThreadMessages|ensureCommunityChatThread|MessageReaction|patchOwnMessageContent|deleteOwnMessage|AttachmentUploadUrl/,
  "the old thread chat stays deleted; communityChat keeps typing presence only",
);
for (const [label, source] of [
  ["chat gateway", chatGateway],
  ["community chat backend", communityChat],
] as const) {
  assert.doesNotMatch(
    source,
    /listCloudThreadUserMessageSenderIds|listThreadUserMessageSenderIds/,
    `${label} should not keep the unused sender-list query path`,
  );
}
assert.doesNotMatch(
  chatGateway,
  /void params\.init|init\?: RequestInit/,
  "chat gateway Convex calls should not advertise ignored RequestInit options",
);
assert.doesNotMatch(
  chatGateway,
  /void params\.senderId|senderId: string/,
  "chat edit/delete gateway calls should not accept ignored senderId params",
);
assert.doesNotMatch(
  webChatController,
  /createCloudThreadUserMessageRows|ensureCommunityChatThread|loadCommunityChat|projection_disabled|useCommunityChatDataController|useCommunityChatMutationController/,
  "the web composer should have no legacy data or send fallback",
);
assert.match(
  webChatController,
  /if \(replySnapshot && !replyRootId\)[\s\S]*createCloudCommunityInteractionComposerMessageRows<AuthSession>\(\{[\s\S]*rootId: replyRootId/,
  "the web composer should fail closed on unmapped replies and write canonically",
);
assert.match(
  webChatController,
  /current\.interaction\.insertOptimistic\(\{[\s\S]*await createCloudCommunityInteractionComposerMessageRows<AuthSession>\([\s\S]*current\.onMessageSent\(\{/,
  "canonical sends should reconcile through one projection and one writer",
);
const createComposerMessage = extractExportedConst(interactions, "createCommunityInteractionComposerMessage");
assert.match(
  createComposerMessage,
  /rows:\s*\[\]/,
  "canonical composer should return an empty legacy rows array",
);
assert.doesNotMatch(
  createComposerMessage,
  /createLegacyCompatibilityChatMessageForInteraction|ensureLegacyCompatibilityChatThread|insertLegacyChatLinkIfMissing|mapLegacyCompatibilityMessageRow|communityChatMessages" as any|communityChatThreads" as any|communityInteractionLegacyChatLinks" as any/,
  "canonical composer should not create legacy chat rows or legacy links",
);
assert.doesNotMatch(
  chatPanel,
  /CommunityChatMessageRow|communityMessages|communityActivityEvents|showLegacyInteractionSurface/,
  "the chat panel should not keep the legacy timeline renderer or prop contract",
);
assert.equal(
  existsSync(legacyPreloadLifecyclePath),
  false,
  "the legacy chat preload lifecycle should be deleted from the web app",
);
assert.equal(
  existsSync(legacyDataControllerPath),
  false,
  "the orphaned legacy web data controller should be deleted",
);
assert.equal(
  existsSync(legacyMutationControllerPath),
  false,
  "the orphaned mixed legacy/canonical mutation controller should be deleted",
);
assert.doesNotMatch(
  app,
  /useWebCommunityChatPreloadLifecycle|ensureCommunityChatThread|loadCommunityChat/,
  "App should not preload, ensure, or read a legacy chat thread",
);
assert.doesNotMatch(
  webChatController,
  /useCommunityChatRealtime|useCommunityChatViewport|loadOlderCommunityChat/,
  "the web chat owner should not mount legacy realtime or scroll-pagination lifecycles",
);
assert.match(
  webChatController,
  /createCloudCommunityInteractionComposerMessageRows<AuthSession>/,
  "the authenticated web composer should call the canonical writer directly",
);
assert.doesNotMatch(
  webChatController,
  /interaction\.enabled/,
  "the web composer should not retain a dead canonical projection gate",
);
assert.doesNotMatch(
  `${app}\n${interactionController}`,
  /VITE_ENABLE_COMMUNITY_INTERACTION_PROJECTION/,
  "production projection should not depend on a Vite env flag",
);
assert.doesNotMatch(
  interactionController,
  /COMMUNITY_INTERACTION_PROJECTION_ENABLED/,
  "canonical projection should not retain a dead feature-gate constant",
);
assert.match(
  interactionController,
  /subscribeCloudCommunityInteractionRoots[\s\S]*subscribeCloudCommunityInteractionReplies/,
  "canonical projection should refresh through canonical interaction subscriptions",
);
assert.match(
  communityAttention,
  /getLatestCommunityChannelChatActivityAt[\s\S]*listChannelReadableRows<CommunityInteractionRootLike>\([\s\S]*tableName: "communityInteractionRoots"[\s\S]*listChannelReadableRows<CommunityInteractionReplyLike>\([\s\S]*tableName: "communityInteractionReplies"/,
  "community attention chat dots should derive from canonical interaction activity",
);
assert.match(
  schema,
  /communityInteractionReplies: defineTable\(\{[\s\S]*\.index\("by_community_status_createdAt", \["communityId", "status", "createdAt"\]\)/,
  "canonical replies should expose a status-scoped community activity index for attention reads",
);
assert.doesNotMatch(
  communityAttention,
  /communityChatMessages|communityChatThreads|getLatestCommunityChatSeq|chatLastSeenSeq/,
  "community attention should not depend on legacy chat row or seq markers",
);
assert.match(
  webAttentionController,
  /latestChatActivityAt[\s\S]*handleChatCaughtUp[\s\S]*acknowledgeCloudCommunityChatRead\(\{[\s\S]*throughAtMs/,
  "web caught-up acknowledgement should send the newest rendered canonical interaction timestamp",
);
assert.doesNotMatch(
  webAttentionController,
  /pagehide|advanceOnHide|seenAtMs: Date\.now\(\)|markCommunitySurfaceSeen\(activeCommunityId, "chat"/,
  "leaving, hiding, or merely opening chat must not create a false read acknowledgement",
);

assert.match(
  schema,
  /communityTypingPresence: defineTable\(\{[\s\S]*\.index\("by_community_displayUntil", \["communityId", "displayUntil"\]\)/,
  "community typing presence should have a bounded active-window lookup index",
);
assert.match(
  communityTypingCore,
  /COMMUNITY_TYPING_PRESENCE_SCAN_LIMIT/,
  "typing presence reads should use the canonical named scan cap",
);
assert.match(
  communityTypingCore,
  /withIndex\("by_channel_displayUntil", \(q: any\) =>[\s\S]*\.gt\("displayUntil", nowMs\)[\s\S]*\.order\("desc"\)[\s\S]*\.take\(COMMUNITY_TYPING_PRESENCE_SCAN_LIMIT \+ 1\)/,
  "typing presence reads should use the canonical channel active-window index and bounded take",
);
assert.match(
  communityTypingCore,
  /withIndex\("by_community_channel_displayUntil", \(q: any\) =>[\s\S]*\.eq\("channelId", undefined\)[\s\S]*\.gt\("displayUntil", nowMs\)[\s\S]*\.take\(COMMUNITY_TYPING_PRESENCE_SCAN_LIMIT \+ 1\)/,
  "temporary general-channel compatibility reads should also remain bounded",
);
assert.doesNotMatch(
  communityTypingCore,
  /\.collect\(\)/,
  "typing presence reads should not collect all community typing rows",
);

console.log("community_interaction_migration_residue_proof: ok");
