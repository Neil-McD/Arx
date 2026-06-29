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
const interactions = read("convex/communityInteractions.ts");
const attachmentBridge = read("convex/communityInteractionAttachmentBridge.ts");
const legacyBridge = read("convex/communityInteractionLegacyBridge.ts");
const legacyAttachments = read("convex/communityInteractionLegacyAttachments.ts");
const communityChat = read("convex/communityChat.ts");
const backfill = read("convex/communityInteractionBackfill.ts");
const demo = read("convex/communityInteractionDemo.ts");
const chatGateway = read("shared/cloudCommunityChatGateway.ts");
const interactionGateway = read("shared/cloudCommunityInteractionsGateway.ts");
const sendController = read("shared/useCommunityChatMutationController.ts");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");

function assertIncludes(sourceName: string, source: string, needle: string): void {
  assert.ok(source.includes(needle), `${sourceName} should include: ${needle}`);
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
  "| R-006 | Legacy chat realtime subscription feeding projection refresh | `DELETE CANDIDATE` |",
  "| R-007 | Legacy chat backfill API | `KEEP TEMPORARILY` |",
  "| R-008 | Demo seed/unseed tooling | `KEEP TEMPORARILY` |",
  "Canonical interaction reads must not use legacy chat rows as source-of-truth.",
  "Canonical interaction writes must not insert legacy chat rows directly.",
  "The web interaction gateway must not call legacy chat mutations.",
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
  communityChat,
  /createThreadUserMessage[\s\S]*recordLegacyChatMessageInteractionBestEffort/,
  "legacy chat writer should still dual-write through the adapter during the migration",
);
assert.match(
  backfill,
  /backfillCommunityInteractionsFromLegacyChatBatch[\s\S]*dryRun[\s\S]*communityChatMessages/,
  "legacy backfill should remain a bounded migration tool",
);
assert.match(
  demo,
  /seedPolynetChatDemo[\s\S]*unseedPolynetChatDemo/,
  "demo seed tooling should remain isolated from product interaction code",
);

console.log("community_interaction_migration_residue_proof: ok");
