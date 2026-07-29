import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const backfill = readFileSync(join(root, "convex/communityInteractionBackfill.ts"), "utf8");
const contract = readFileSync(join(root, "docs/community-interaction-substrate-contract-v1.md"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");

function exportedConstBlock(source: string, exportName: string): string {
  const startToken = `export const ${exportName}`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${exportName} should exist`);
  const next = source.indexOf("\nexport const ", start + startToken.length);
  return source.slice(start, next < 0 ? source.length : next);
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
  /"check:community-interactions-legacy-chat-backfill-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_interactions_legacy_chat_backfill_contract_proof\.ts"/,
  "package scripts should expose the legacy chat backfill proof",
);

assert.match(
  contract,
  /Current Legacy Chat Backfill Slice[\s\S]*backfillCommunityInteractionsFromLegacyChatBatch[\s\S]*`dryRun` defaults to true/,
  "contract should document the dry-run-first legacy chat backfill slice",
);
assert.match(
  contract,
  /dry-run predicts links created earlier in the same batch before counting reply outcomes[\s\S]*missing target mappings are counted as `unresolved_replies`, not guessed[\s\S]*running the batch repeatedly must not duplicate roots or replies/,
  "contract should preserve truthful dry-run, one-level reply repair, and idempotency requirements",
);
assert.match(
  contract,
  /backfill write\/materialization failures are not caught after writes begin[\s\S]*backfill does not migrate reactions, edits, deletes, or moderation state[\s\S]*backfill does not promote source traces, write archive truth, or call the compiler synchronously; materialized interactions schedule idempotent derived-evidence sync and do not change UI behavior/,
  "contract should keep canonical derived-evidence scheduling while forbidding direct archive/compiler writes and catch-after-write behavior",
);

assert.doesNotMatch(
  backfill,
  /\.collect\(\)/,
  "legacy chat backfill should not use unbounded collect reads",
);
assert.doesNotMatch(
  backfill,
  /ctx\.scheduler|ctx\.runAction|ctx\.runMutation|ctx\.runQuery|internalMutation|internalQuery/,
  "legacy chat backfill should be a direct bounded batch mutation, not a scheduled job",
);
assert.doesNotMatch(
  backfill,
  /upsertCommunitySourceTrace|recordTrustedCommunitySourceTraceCore|communitySourceTraces" as any|communityCompiler|upsertArchiveDocumentForChatMessage|deleteArchiveDocumentBySource|communityMessageReactions" as any|patchOwnMessageContent|deleteOwnMessage|createMessageReaction/,
  "legacy chat backfill should not promote memory, call compiler/archive, or migrate reaction/edit/delete state",
);

assert.match(
  backfill,
  /import \{ mutation \} from "\.\/_generated\/server";/,
  "backfill should expose a public mutation for intentional operator/moderator execution",
);
assert.match(
  backfill,
  /planInteractionReplyFromLegacyChatMessageCore[\s\S]*planInteractionRootFromLegacyChatMessageCore[\s\S]*materializeLegacyChatReplyInteractionPlan[\s\S]*materializeLegacyChatRootInteractionPlan|materializeLegacyChatReplyInteractionPlan[\s\S]*materializeLegacyChatRootInteractionPlan[\s\S]*planInteractionReplyFromLegacyChatMessageCore[\s\S]*planInteractionRootFromLegacyChatMessageCore/,
  "backfill should reuse the same legacy chat planning and materialization cores as live dual-write",
);
assert.match(
  backfill,
  /const DEFAULT_LEGACY_CHAT_BACKFILL_LIMIT = 50;[\s\S]*const MAX_LEGACY_CHAT_BACKFILL_LIMIT = 100;/,
  "backfill should have conservative bounded batch limits",
);
assert.match(
  backfill,
  /function normalizeBatchLimit[\s\S]*Math\.min\(MAX_LEGACY_CHAT_BACKFILL_LIMIT, Math\.floor\(parsed\)\)/,
  "backfill should clamp caller-provided limits",
);
assert.match(
  backfill,
  /function resolveBackfillThread[\s\S]*threadId\?: any[\s\S]*query\("communityChatThreads" as any\)[\s\S]*withIndex\("by_community_createdAt"[\s\S]*\.first\(\)/,
  "backfill should support explicit threadId and canonical first-thread fallback",
);
assert.match(
  backfill,
  /function getLegacyChatLinkByMessage[\s\S]*query\("communityInteractionLegacyChatLinks" as any\)[\s\S]*withIndex\("by_message"/,
  "backfill should use the legacy mapping table for idempotency and reply repair",
);

const backfillMutation = exportedConstBlock(backfill, "backfillCommunityInteractionsFromLegacyChatBatch");
assert.match(
  backfillMutation,
  /communityId: v\.id\("communities"\)[\s\S]*threadId: v\.optional\(v\.id\("communityChatThreads"\)\)[\s\S]*afterSeq: v\.optional\(v\.number\(\)\)[\s\S]*limit: v\.optional\(v\.number\(\)\)[\s\S]*dryRun: v\.optional\(v\.boolean\(\)\)/,
  "backfill mutation should expose community, optional thread, cursor, limit, and dryRun inputs",
);
assert.match(
  backfillMutation,
  /resolveUserIdForAuthenticatedRequest[\s\S]*requireCommunityModerator/,
  "backfill should require an authenticated community moderator",
);
assert.match(
  backfillMutation,
  /const dryRun = args\.dryRun !== false;/,
  "backfill should default to dry-run mode",
);
assert.match(
  backfillMutation,
  /query\("communityChatMessages" as any\)[\s\S]*withIndex\("by_thread_seq", \(q: any\) => q\.eq\("threadId", thread\._id\)\.gt\("seq", afterSeq\)\)[\s\S]*\.order\("asc"\)[\s\S]*\.take\(limit\)/,
  "backfill should scan legacy chat messages through the bounded thread/seq index",
);
assert.match(
  backfillMutation,
  /const existingLink = await getLegacyChatLinkByMessage\(ctx, message\._id\)[\s\S]*counts\.already_linked \+= 1/,
  "backfill should skip already-linked messages",
);
assert.match(
  backfillMutation,
  /const predictedLinkByMessageId = new Map<string, PredictedLegacyChatLink>\(\)/,
  "backfill should track predicted links inside dry-run batches",
);
assert.match(
  backfillMutation,
  /predictedLinkByMessageId\.set\(messageKey, predictedLinkFromExistingLink\(existingLink\)\)/,
  "backfill should seed dry-run prediction from existing mappings",
);
assert.match(
  backfillMutation,
  /const predictedTargetLink = predictedLinkByMessageId\.get\(targetKey\) \?\? null[\s\S]*!\(targetLink\?\.rootId \|\| predictedTargetLink\?\.rootAvailable\)[\s\S]*counts\.unresolved_replies \+= 1/,
  "backfill should count unresolved reply targets only when no DB or predicted root mapping exists",
);
assert.match(
  backfillMutation,
  /if \(dryRun\) \{[\s\S]*predictedLinkByMessageId\.set\(messageKey,[\s\S]*replyAvailable: true,[\s\S]*counts\.replies_would_create \+= 1[\s\S]*continue;[\s\S]*\}[\s\S]*planInteractionReplyFromLegacyChatMessageCore/,
  "reply backfill should not write in dry-run mode",
);
assert.match(
  backfillMutation,
  /if \(dryRun\) \{[\s\S]*predictedLinkByMessageId\.set\(messageKey,[\s\S]*replyAvailable: false,[\s\S]*counts\.roots_would_create \+= 1[\s\S]*continue;[\s\S]*\}[\s\S]*planInteractionRootFromLegacyChatMessageCore/,
  "root backfill should not write in dry-run mode",
);
assert.match(
  backfillMutation,
  /try \{[\s\S]*plan = await planInteractionReplyFromLegacyChatMessageCore[\s\S]*\} catch \(error\) \{[\s\S]*continue;[\s\S]*\}[\s\S]*const result = await materializeLegacyChatReplyInteractionPlan\(ctx, plan\)/,
  "reply backfill should catch planning failures before materializing outside the catch",
);
assert.match(
  backfillMutation,
  /try \{[\s\S]*plan = await planInteractionRootFromLegacyChatMessageCore[\s\S]*\} catch \(error\) \{[\s\S]*continue;[\s\S]*\}[\s\S]*const result = await materializeLegacyChatRootInteractionPlan\(ctx, plan\)/,
  "root backfill should catch planning failures before materializing outside the catch",
);
assertNoMaterializeInsideTry(backfillMutation, "backfill should not catch materialization failures after writes begin");
assert.match(
  backfillMutation,
  /next_cursor:[\s\S]*thread_id: normalizeIdValue\(thread\._id\)[\s\S]*after_seq: Math\.max\(0, Math\.floor\(last\.seq \?\? 0\)\)/,
  "backfill should return a forward cursor based on the last scanned legacy seq",
);
assert.match(
  backfillMutation,
  /scanned:[\s\S]*roots_created:[\s\S]*replies_created:[\s\S]*already_linked:[\s\S]*unresolved_replies:[\s\S]*failed:/,
  "backfill should return the required repair counters",
);

console.log("community_interactions_legacy_chat_backfill_contract_proof: ok");
