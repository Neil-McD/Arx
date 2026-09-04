import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const interactions = readFileSync(join(root, "convex/communityInteractions.ts"), "utf8");
const attachmentBridge = readFileSync(join(root, "convex/communityInteractionAttachmentBridge.ts"), "utf8");
const legacyBridge = readFileSync(join(root, "convex/communityInteractionLegacyBridge.ts"), "utf8");
const communityChat = readFileSync(join(root, "convex/communityChat.ts"), "utf8");
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const contract = readFileSync(join(root, "docs/community-interaction-substrate-contract-v1.md"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");

function blockBetween(source: string, startToken: string, endToken: string): string {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `missing block start: ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `missing block end after ${startToken}: ${endToken}`);
  return source.slice(start, end);
}

function exportedConstBlock(source: string, exportName: string): string {
  const startToken = `export const ${exportName}`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${exportName} should exist`);
  const next = source.indexOf("\nexport const ", start + startToken.length);
  return source.slice(start, next < 0 ? source.length : next);
}

function functionBlock(source: string, functionName: string): string {
  const start = source.indexOf(functionName);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const lineStart = source.lastIndexOf("\n", start) + 1;
  const candidates = [
    source.indexOf("\nexport async function ", start + functionName.length),
    source.indexOf("\nexport function ", start + functionName.length),
    source.indexOf("\nasync function ", start + functionName.length),
    source.indexOf("\nfunction ", start + functionName.length),
    source.indexOf("\nexport const ", start + functionName.length),
  ].filter((value) => value >= 0);
  const end = candidates.length > 0 ? Math.min(...candidates) : source.length;
  return source.slice(lineStart, end);
}

function assertNoMaterializeInsideTry(source: string, message: string): void {
  const tryBlocks = source.match(/try \{[\s\S]*?\n\s*\} catch \(error\) \{/g) ?? [];
  assert.ok(tryBlocks.length > 0, `${message}: expected at least one try/catch block`);
  for (const block of tryBlocks) {
    assert.doesNotMatch(block, /materializeLegacyChat/, message);
  }
}

assert.match(
  packageJson,
  /"check:community-interactions-legacy-chat-adapter-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_interactions_legacy_chat_adapter_contract_proof\.ts"/,
  "package scripts should expose the legacy chat adapter proof",
);

assert.match(
  contract,
  /Current Legacy Chat Adapter Slice[\s\S]*top-level chat messages are translated into `communityInteractionRoots`[\s\S]*chat replies are translated into `communityInteractionReplies`/,
  "contract should document the legacy chat adapter slice",
);
assert.match(
  contract,
  /adapter validation failures are skipped without failing the legacy chat send path[\s\S]*adapter write\/materialization failures are not swallowed after writes begin[\s\S]*legacy chat response shape is unchanged/,
  "contract should require fail-soft validation, atomic materialization, and unchanged legacy response",
);
assert.match(
  contract,
  /legacy adapter shadow-writes bounded canonical `communityInteractionAttachments` rows[\s\S]*attachment-only legacy messages become bounded markdown summaries/,
  "contract should keep legacy adapter attachment shadow-writes documented",
);
assert.match(
  contract,
  /communityInteractionLegacyBridge/,
  "contract should name the extracted legacy bridge module",
);

const legacyLinkTable = blockBetween(
  schema,
  "communityInteractionLegacyChatLinks: defineTable({",
  "\n\n  dmConversations: defineTable",
);
[
  'communityId: v.id("communities")',
  'threadId: v.id("communityChatThreads")',
  'messageId: v.id("communityChatMessages")',
  'targetMessageId: v.optional(v.id("communityChatMessages"))',
  'linkKind: v.union(v.literal("root"), v.literal("reply"))',
  'rootId: v.optional(v.id("communityInteractionRoots"))',
  'replyId: v.optional(v.id("communityInteractionReplies"))',
  '.index("by_message", ["messageId"])',
  '.index("by_thread_message", ["threadId", "messageId"])',
  '.index("by_root", ["rootId"])',
  '.index("by_reply", ["replyId"])',
  '.index("by_community_linkKind_createdAt", ["communityId", "linkKind", "createdAt"])',
].forEach((needle) => assert.match(legacyLinkTable, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));

assert.match(
  legacyBridge,
  /function legacyChatIdempotencyKey\(messageId: any, kind: "root" \| "reply"\): string \{[\s\S]*legacy_chat_message:\$\{normalizeIdValue\(messageId\)\}:\$\{kind\}/,
  "adapter should derive deterministic idempotency keys from legacy message ids",
);
assert.match(
  interactions,
  /function legacyChatContentBlocks\(message: CommunityChatMessageLike\): NormalizedContentBlock\[\] \{[\s\S]*blockType: "markdown_text"[\s\S]*extractLegacyChatMessageText\(message\)/,
  "adapter should translate legacy payloads into typed markdown content blocks",
);
assert.match(
  interactions,
  /Shared attachment:|Shared attachments:/,
  "adapter should preserve attachment-only legacy rows as bounded markdown summaries",
);
assert.match(
  attachmentBridge,
  /insertLegacyInteractionAttachmentsForTarget[\s\S]*insert\("communityInteractionAttachments" as any[\s\S]*insertCanonicalInteractionAttachmentsFromLegacyMessage[\s\S]*readLegacyInteractionAttachmentPayloads\(args\.message\)[\s\S]*insertLegacyInteractionAttachmentsForTarget/,
  "attachment bridge should shadow-write canonical attachment rows from legacy message payloads",
);
assert.match(
  attachmentBridge,
  /hasCanonicalInteractionAttachmentsForTarget[\s\S]*withIndex\("by_root"[\s\S]*withIndex\("by_reply"/,
  "attachment bridge should make legacy shadow-writes idempotent per root or reply target",
);
assert.match(
  legacyBridge,
  /getLegacyChatLinkByMessage[\s\S]*query\("communityInteractionLegacyChatLinks" as any\)[\s\S]*withIndex\("by_message"/,
  "adapter should look up legacy mappings through the legacy-link table",
);
assert.doesNotMatch(
  legacyBridge,
  /createLegacyCompatibilityChatMessageForInteraction|insert\("communityChatMessages" as any,|upsertArchiveDocumentForChatMessage|ensureLegacyCompatibilityChatThread|mapLegacyCompatibilityMessageRow/,
  "legacy bridge should not keep canonical-composer compatibility row creation helpers",
);
assert.doesNotMatch(
  interactions,
  /query\("communityChatThreads" as any\)|insert\("communityChatMessages" as any\)|insert\("communityInteractionLegacyChatLinks" as any\)/,
  "canonical interaction core should not directly access legacy chat thread/message/link tables",
);

const rootPlan = functionBlock(interactions, "planInteractionRootFromLegacyChatMessageCore");
assert.match(
  rootPlan,
  /export async function planInteractionRootFromLegacyChatMessageCore/,
  "root adapter should expose a no-write planning step",
);
assert.match(
  rootPlan,
  /getLegacyChatLinkByMessage\(args\.ctx, args\.message\._id\)[\s\S]*legacy_chat_interaction_link_conflict/,
  "root adapter should be idempotent through legacy message links",
);
assert.match(
  rootPlan,
  /legacyChatIdempotencyKey\(args\.message\._id, "root"\)[\s\S]*getExistingRootByIdempotencyKey/,
  "root adapter should also dedupe by deterministic root idempotency key",
);
assert.doesNotMatch(
  rootPlan,
  /ctx\.db\.(insert|patch|delete)|insertContentBlocksForTarget|insertLegacyChatLinkIfMissing/,
  "root planning should not write before validation completes",
);

const rootMaterialize = functionBlock(interactions, "materializeLegacyChatRootInteractionPlan");
assert.match(
  rootMaterialize,
  /communityInteractionRoots" as any[\s\S]*communityId: plan\.communityId[\s\S]*actorType: "human"[\s\S]*actorUserId: plan\.actorUserId[\s\S]*kind: "discussion"[\s\S]*visibilityScope: "community"/,
  "legacy top-level chat messages should become human discussion roots with community visibility",
);
assert.match(
  rootMaterialize,
  /insertContentBlocksForTarget\([\s\S]*rootId[\s\S]*blocks: plan\.contentBlocks/,
  "root adapter should write typed root content blocks",
);
assert.match(
  rootMaterialize,
  /insertCanonicalInteractionAttachmentsFromLegacyMessage\(\{[\s\S]*rootId[\s\S]*message: plan\.message/,
  "root adapter should shadow-write canonical attachments from the legacy payload",
);
assert.match(
  rootMaterialize,
  /insertLegacyChatLinkIfMissing\([\s\S]*linkKind: "root"[\s\S]*rootId/,
  "root adapter should persist the legacy message to root mapping",
);
assert.doesNotMatch(
  rootMaterialize,
  /try \{|catch \(error\)/,
  "root materialization should not catch after writes begin",
);

const rootAdapter = functionBlock(interactions, "createInteractionRootFromLegacyChatMessageCore");
assert.match(
  rootAdapter,
  /planInteractionRootFromLegacyChatMessageCore\(args\)[\s\S]*materializeLegacyChatRootInteractionPlan\(args\.ctx, plan\)/,
  "root adapter core should plan before materializing",
);
assert.doesNotMatch(
  rootAdapter,
  /createCommunityInteractionRoot|createCommunityInteractionReply/,
  "root adapter should not call public interaction mutations",
);

const replyPlan = functionBlock(interactions, "planInteractionReplyFromLegacyChatMessageCore");
assert.match(
  replyPlan,
  /export async function planInteractionReplyFromLegacyChatMessageCore/,
  "reply adapter should expose a no-write planning step",
);
assert.match(
  replyPlan,
  /!args\.message\.replyToMessageId[\s\S]*legacy_chat_interaction_reply_target_required/,
  "reply adapter should require a legacy reply target",
);
assert.match(
  replyPlan,
  /const targetLink = await getLegacyChatLinkByMessage\(args\.ctx, args\.message\.replyToMessageId\)[\s\S]*!targetLink \|\| !targetLink\.rootId[\s\S]*legacy_chat_interaction_target_missing/,
  "reply adapter should map replies through an existing legacy root mapping",
);
assert.match(
  replyPlan,
  /normalizeIdValue\(root\.communityId\) !== normalizeIdValue\(args\.thread\.communityId\)/,
  "reply adapter should reject cross-community target mappings",
);
assert.match(
  replyPlan,
  /if \(targetLink\.replyId\) \{[\s\S]*targetReplyId = targetReply\._id/,
  "reply-to-reply targets should become targetReplyId context only",
);
assert.match(
  replyPlan,
  /legacyChatIdempotencyKey\(args\.message\._id, "reply"\)[\s\S]*getExistingReplyByIdempotencyKey/,
  "reply adapter should dedupe by deterministic reply idempotency key",
);
assert.doesNotMatch(
  replyPlan,
  /ctx\.db\.(insert|patch|delete)|insertContentBlocksForTarget|insertLegacyChatLinkIfMissing/,
  "reply planning should not write before validation completes",
);

const replyMaterialize = functionBlock(interactions, "materializeLegacyChatReplyInteractionPlan");
assert.match(
  replyPlan,
  /const seq = Math\.max\(0, Math\.floor\(root\.replyCount \?\? 0\)\) \+ 1[\s\S]*planKind: "create_reply"[\s\S]*seq,/,
  "reply planning should derive the next one-level drawer seq",
);
assert.match(
  replyMaterialize,
  /communityInteractionReplies" as any[\s\S]*seq: plan\.seq/,
  "reply materialization should insert the planned one-level drawer seq",
);
assert.match(
  replyMaterialize,
  /insertContentBlocksForTarget\([\s\S]*replyId[\s\S]*blocks: plan\.contentBlocks/,
  "reply adapter should write typed reply content blocks only against the reply target",
);
assert.match(
  replyMaterialize,
  /insertCanonicalInteractionAttachmentsFromLegacyMessage\(\{[\s\S]*replyId[\s\S]*message: plan\.message/,
  "reply adapter should shadow-write canonical attachments from the legacy payload",
);
assert.doesNotMatch(
  replyMaterialize,
  /parentReplyId|replyDepth|depth:/,
  "reply adapter should not create recursive drawer fields",
);
assert.match(
  replyMaterialize,
  /insertLegacyChatLinkIfMissing\([\s\S]*targetMessageId: plan\.targetMessageId[\s\S]*linkKind: "reply"[\s\S]*rootId: plan\.root\._id[\s\S]*replyId/,
  "reply adapter should persist the legacy message to reply mapping",
);
assert.doesNotMatch(
  replyMaterialize,
  /try \{|catch \(error\)/,
  "reply materialization should not catch after writes begin",
);

const replyAdapter = functionBlock(interactions, "createInteractionReplyFromLegacyChatMessageCore");
assert.match(
  replyAdapter,
  /planInteractionReplyFromLegacyChatMessageCore\(args\)[\s\S]*materializeLegacyChatReplyInteractionPlan\(args\.ctx, plan\)/,
  "reply adapter core should plan before materializing",
);
assert.doesNotMatch(
  replyAdapter,
  /createCommunityInteractionRoot|createCommunityInteractionReply/,
  "reply adapter should not call public interaction mutations",
);

const bestEffort = functionBlock(interactions, "recordLegacyChatMessageInteractionBestEffort");
assert.match(
  bestEffort,
  /try \{[\s\S]*plan = await planInteractionReplyFromLegacyChatMessageCore\(args\)[\s\S]*\} catch \(error\) \{/,
  "legacy chat dual-write should catch reply planning failures only",
);
assert.match(
  bestEffort,
  /try \{[\s\S]*plan = await planInteractionRootFromLegacyChatMessageCore\(args\)[\s\S]*\} catch \(error\) \{/,
  "legacy chat dual-write should catch root planning failures only",
);
assert.match(
  bestEffort,
  /materializeLegacyChatReplyInteractionPlan\(args\.ctx, plan\)[\s\S]*materializeLegacyChatRootInteractionPlan\(args\.ctx, plan\)/,
  "legacy chat dual-write should materialize outside planning catch blocks",
);
assertNoMaterializeInsideTry(bestEffort, "legacy chat dual-write should not catch materialization failures after writes begin");
assert.doesNotMatch(
  [rootPlan, rootMaterialize, rootAdapter, replyPlan, replyMaterialize, replyAdapter, bestEffort].join("\n"),
  /upsertCommunitySourceTrace|recordTrustedCommunitySourceTraceCore|communitySourceTraces" as any|communityCompiler|upsertArchiveDocumentForChatMessage|deleteArchiveDocumentBySource|ctx\.scheduler|ctx\.runAction|\bfetch\s*\(|httpAction|scrape|crawler|processMedia|ctx\.storage\.getUrl/,
  "legacy adapter should not promote memory, call compiler/archive, schedule work, fetch, scrape, or process media",
);

assert.match(
  communityChat,
  /import \{[\s\S]*recordLegacyChatMessageInteractionBestEffort,[\s\S]*syncLegacyChatMessageDeleteToInteractionCore,[\s\S]*syncLegacyChatMessageEditToInteractionCore,[\s\S]*\} from "\.\/communityInteractions";/,
  "legacy chat mutation should import the interaction adapter",
);
const createThreadUserMessage = exportedConstBlock(communityChat, "createThreadUserMessage");
assert.match(
  createThreadUserMessage,
  /await recordLegacyChatMessageInteractionBestEffort\(\{[\s\S]*ctx,[\s\S]*thread,[\s\S]*message: row,[\s\S]*nowMs,[\s\S]*\}\);[\s\S]*return await mapCommunityChatMessageRow\(ctx, row\);/,
  "legacy chat send should materialize canonical interaction evidence before returning the unchanged legacy response",
);
assert.doesNotMatch(
  createThreadUserMessage,
  /upsertArchiveDocumentForChatMessage/,
  "legacy chat send should not write obsolete legacy archive authority",
);
assert.match(
  exportedConstBlock(communityChat, "patchOwnMessageContent"),
  /await syncLegacyChatMessageEditToInteractionCore\(/,
  "legacy chat edits should update the canonical interaction in the same transaction",
);
assert.match(
  exportedConstBlock(communityChat, "deleteOwnMessage"),
  /await syncLegacyChatMessageDeleteToInteractionCore\(/,
  "legacy chat deletion should tombstone the canonical interaction in the same transaction",
);
assert.doesNotMatch(
  createThreadUserMessage,
  /createCommunityInteractionRoot|createCommunityInteractionReply/,
  "legacy chat send should not call public interaction mutations directly",
);

console.log("community_interactions_legacy_chat_adapter_contract_proof: ok");
