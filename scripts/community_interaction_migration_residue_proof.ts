import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const packageJson = read("package.json");
const residueMap = read("docs/community-interaction-migration-residue-map.md");
const contract = read("docs/community-interaction-substrate-contract-v1.md");
const app = read("apps/web/src/App.tsx");
const interactions = read("convex/communityInteractions.ts");
const attachmentBridge = read("convex/communityInteractionAttachmentBridge.ts");
const legacyBridge = read("convex/communityInteractionLegacyBridge.ts");
const legacyAttachments = read("convex/communityInteractionLegacyAttachments.ts");
const communityChat = read("convex/communityChat.ts");
const communityFacade = read("convex/community.ts");
const backfill = read("convex/communityInteractionBackfill.ts");
const schema = read("convex/schema.ts");
const chatGateway = read("shared/cloudCommunityChatGateway.ts");
const interactionGateway = read("shared/cloudCommunityInteractionsGateway.ts");
const dataController = read("shared/useCommunityChatDataController.ts");
const sendController = read("shared/useCommunityChatMutationController.ts");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");

function assertIncludes(sourceName: string, source: string, needle: string): void {
  assert.ok(source.includes(needle), `${sourceName} should include: ${needle}`);
}

function extractExportedConst(source: string, name: string): string {
  const start = source.indexOf(`export const ${name} =`);
  assert.notEqual(start, -1, `expected exported const ${name}`);
  const next = source.indexOf("\nexport const ", start + 1);
  return next === -1 ? source.slice(start) : source.slice(start, next);
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
assert.match(
  contract,
  /communityInteractionLegacyBridge/,
  "substrate contract should name the legacy bridge module as the compatibility owner",
);

[
  "| R-001 | Legacy chat writer `community:createThreadUserMessage` | `BLOCKED BY PARITY` |",
  "| R-002 | Legacy compatibility message rows created by canonical composer | `KEEP TEMPORARILY` |",
  "| R-003 | Legacy chat to interaction mapping table | `KEEP TEMPORARILY` |",
  "| R-004 | Legacy attachment hydration fallback in canonical read bundles | `BLOCKED BY PARITY` |",
  "| R-005 | Projection feature flag and legacy timeline fallback | `KEEP TEMPORARILY` |",
  "| R-007 | Legacy chat backfill API | `KEEP TEMPORARILY` |",
  "Canonical interaction reads must not use legacy chat rows as source-of-truth.",
  "Canonical interaction writes must not insert legacy chat rows directly.",
  "The web interaction gateway must not call legacy chat mutations.",
  "Legacy chat realtime must remain scoped to the legacy timeline fallback; canonical projection refresh must use canonical interaction reads/subscriptions.",
].forEach((needle) => assertIncludes("residue map", residueMap, needle));

assert.match(
  interactions,
  /from "\.\/communityInteractionLegacyBridge"/,
  "canonical interaction module should import legacy compatibility helpers from the bridge",
);
assert.doesNotMatch(
  interactions,
  /ctx\.db\.(query|insert)\("communityChat(Messages|Threads)" as any\)|ctx\.db\.(query|insert)\("communityInteractionLegacyChatLinks" as any\)/,
  "canonical interaction module should not directly query or insert legacy chat/thread/link tables",
);
assert.match(
  interactions,
  /resolveLegacyMessageAttachments/,
  "canonical read bundles may only hydrate legacy attachments through the migration-only attachment module",
);
assert.match(
  interactions,
  /listCanonicalInteractionAttachmentsForTarget[\s\S]*canonicalAttachments\.length > 0[\s\S]*resolveLegacyMessageAttachments/,
  "canonical read bundles should prefer canonical attachment rows before legacy fallback",
);
assert.match(
  attachmentBridge,
  /insertCanonicalInteractionAttachmentsFromLegacyMessage[\s\S]*insert\("communityInteractionAttachments" as any[\s\S]*listCanonicalInteractionAttachmentsForTarget/,
  "canonical attachment bridge should own shadow-writing and reading canonical attachment rows",
);

assert.match(
  legacyBridge,
  /(?=[\s\S]*query\("communityChatThreads" as any\))(?=[\s\S]*insert\("communityChatThreads" as any,)(?=[\s\S]*insert\("communityChatMessages" as any,)(?=[\s\S]*insert\("communityInteractionLegacyChatLinks" as any,)/,
  "legacy bridge should own canonical-composer compatibility table access",
);
assert.match(
  legacyBridge,
  /upsertArchiveDocumentForChatMessage/,
  "legacy bridge should preserve archive compatibility for compatibility message rows",
);
assert.doesNotMatch(
  legacyBridge,
  /communityInteractionRoots" as any|communityInteractionReplies" as any|insertContentBlocksForTarget/,
  "legacy bridge should not materialize canonical interaction roots, replies, or content blocks",
);

assert.match(
  legacyAttachments,
  /Migration-only bridge[\s\S]*communityInteractionAttachments/,
  "legacy attachment bridge should document that it is migration-only",
);
assert.doesNotMatch(
  interactionGateway,
  /createThreadUserMessage|createCloudThreadUserMessageRows|communityChatMessages/,
  "web interaction gateway should not call legacy chat mutations or tables",
);
assert.match(
  chatGateway,
  /createCloudThreadUserMessageRows[\s\S]*community:createThreadUserMessage/,
  "legacy chat gateway should own the explicit legacy chat writer call",
);
for (const [label, source] of [
  ["chat gateway", chatGateway],
  ["chat data controller", dataController],
  ["chat mutation controller", sendController],
  ["community chat backend", communityChat],
  ["community facade", communityFacade],
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
  dataController,
  /init:\s*\{\s*signal:|communityFetchAbortScope|beginScopedAbortRequest|finishScopedAbortRequest|abortAllScopedRequests|isAbortError/,
  "chat data controller should not keep fake Convex abort plumbing",
);
assert.doesNotMatch(
  sendController,
  /senderId:\s*session\.user\.id/,
  "chat mutation controller should trust backend auth instead of forwarding senderId hints",
);

assert.match(
  sendController,
  /const canUseCanonicalComposer[\s\S]*useCanonicalCommunityInteractions[\s\S]*createCommunityInteractionMessageRows[\s\S]*serializedAttachments\.length === 0[\s\S]*\(!replyToId \|\| Boolean\(replyRootId\)\)/,
  "shared send controller should use canonical composer only for attachment-free sends with mappable replies",
);
assert.match(
  sendController,
  /createCloudThreadUserMessageRows[\s\S]*attachments: serializedAttachments[\s\S]*replyToId/,
  "shared send controller should keep the legacy fallback explicit and payload-bounded",
);
assert.match(
  chatPanel,
  /showInteractionProjection[\s\S]*WebCommunityInteractionProjection[\s\S]*className="chat-messages"/,
  "chat panel should keep canonical projection and legacy fallback in one visible branch",
);
assert.match(
  app,
  /useCommunityChatRealtime\(\{[\s\S]*isEnabled: activePage === "community" && hasResolvedCommunityChat && !COMMUNITY_INTERACTION_PROJECTION_ENABLED/,
  "legacy chat realtime should be disabled while canonical projection is active",
);
assert.match(
  app,
  /subscribeCloudCommunityInteractionRoots[\s\S]*subscribeCloudCommunityInteractionReplies/,
  "canonical projection should refresh through canonical interaction subscriptions",
);

assert.match(
  communityChat,
  /createThreadUserMessage[\s\S]*recordLegacyChatMessageInteractionBestEffort/,
  "legacy chat writer should still dual-write through the adapter during the migration",
);
assert.match(
  schema,
  /communityChatThreads: defineTable\(\{[\s\S]*\.index\("by_community_createdAt", \["communityId", "createdAt"\]\)/,
  "community chat threads should have a bounded canonical lookup index",
);
assert.match(
  schema,
  /communityTypingPresence: defineTable\(\{[\s\S]*\.index\("by_community_displayUntil", \["communityId", "displayUntil"\]\)/,
  "community typing presence should have a bounded active-window lookup index",
);
assert.match(
  communityChat,
  /withIndex\("by_community_createdAt", \(q: any\) => q\.eq\("communityId", communityId\)\)[\s\S]*\.order\("asc"\)[\s\S]*\.first\(\)/,
  "canonical community chat thread lookup should be bounded by index + first",
);
assert.doesNotMatch(
  communityChat,
  /function listCommunityChatThreadsForCommunity|const rows = \(await ctx\.db\s*\.query\("communityChatThreads"\)\s*\.withIndex\("by_community",[\s\S]{0,300}\.collect\(\)|\.sort\(\(a, b\) => a\.createdAt - b\.createdAt/,
  "canonical chat-thread lookup should not collect and sort all community threads",
);

const listCommunityTyping = extractExportedConst(communityChat, "listCommunityTyping");
assert.match(listCommunityTyping, /MAX_TYPING_PRESENCE_SCAN_ROWS/, "typing presence reads should use a named scan cap");
assert.match(
  listCommunityTyping,
  /withIndex\("by_community_displayUntil", \(q: any\) =>[\s\S]*\.gt\("displayUntil", nowMs\)[\s\S]*\.order\("desc"\)[\s\S]*\.take\(MAX_TYPING_PRESENCE_SCAN_ROWS\)/,
  "typing presence reads should use the active-window index and bounded take",
);
assert.doesNotMatch(
  listCommunityTyping,
  /\.collect\(\)|\.sort\(/,
  "typing presence reads should not collect/sort all community typing rows",
);

const deleteOwnMessage = extractExportedConst(communityChat, "deleteOwnMessage");
assert.match(deleteOwnMessage, /MAX_REACTION_DELETE_ROWS/, "message delete should use a named reaction-delete cap");
assert.match(
  deleteOwnMessage,
  /\.take\(MAX_REACTION_DELETE_ROWS \+ 1\)[\s\S]*message_reaction_delete_limit_exceeded/,
  "message delete should fail closed instead of collecting unbounded reactions",
);

const listMessageReactions = extractExportedConst(communityChat, "listMessageReactions");
assert.match(listMessageReactions, /MAX_REACTION_MESSAGE_IDS_PER_REQUEST/, "reaction reads should cap message ids");
assert.match(listMessageReactions, /MAX_REACTIONS_PER_MESSAGE/, "reaction reads should cap reactions per message");
assert.doesNotMatch(
  listMessageReactions,
  /\.collect\(\)/,
  "reaction reads should not collect unbounded reactions per message",
);
assert.match(
  backfill,
  /backfillCommunityInteractionsFromLegacyChatBatch[\s\S]*dryRun[\s\S]*communityChatMessages/,
  "legacy backfill should remain a bounded migration tool",
);

console.log("community_interaction_migration_residue_proof: ok");
