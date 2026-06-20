import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const interactions = readFileSync(join(root, "convex/communityInteractions.ts"), "utf8");
const communityFacade = readFileSync(join(root, "convex/community.ts"), "utf8");
const contract = readFileSync(join(root, "docs/community-interaction-substrate-contract-v1.md"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");

function exportedConstBlock(source: string, exportName: string): string {
  const startToken = `export const ${exportName}`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${exportName} should exist`);
  const next = source.indexOf("\nexport const ", start + startToken.length);
  return source.slice(start, next < 0 ? source.length : next);
}

assert.match(
  packageJson,
  /"check:community-interactions-write-core-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_interactions_write_core_contract_proof\.ts"/,
  "package scripts should expose the community interactions write-core proof",
);

assert.match(
  contract,
  /Current Write-Core Slice[\s\S]*createCommunityInteractionRoot[\s\S]*createCommunityInteractionReply/,
  "contract should document the active write-core slice",
);
assert.match(
  contract,
  /write paths do not fetch URLs, scrape pages, process media, or resolve workspace previews synchronously/,
  "contract should delete synchronous unfurls from interaction writes",
);
assert.match(
  contract,
  /human-authored writes cannot create `agent_signal` roots[\s\S]*reply visibility cannot be broader than root visibility/,
  "contract should constrain first-slice human writes and reply visibility",
);

assert.doesNotMatch(
  interactions,
  /v\.any\(\)|payloadJson/,
  "interaction write core should not reintroduce untyped message payloads",
);
assert.doesNotMatch(
  interactions,
  /parentReplyId|childReply|replyDepth|depth:/,
  "interaction write core should not model recursive reply drawers",
);
assert.doesNotMatch(
  interactions,
  /\bfetch\s*\(|httpAction|ctx\.scheduler|ctx\.runAction|scrape|crawler|processMedia|ctx\.storage\.getUrl/,
  "interaction writes should not synchronously unfurl, scrape, fetch, schedule, or process media",
);
assert.doesNotMatch(
  interactions,
  /communityInteractionAttachments" as any[\s\S]*insert|generateUploadUrl/,
  "first write-core slice should not migrate attachment upload creation yet",
);
assert.doesNotMatch(
  interactions,
  /upsertCommunitySourceTrace|recordTrustedCommunitySourceTraceCore|communitySourceTraces" as any/,
  "first write-core slice should not promote interactions into community memory",
);

assert.match(
  interactions,
  /const contentBlockInputValidator = v\.union\([\s\S]*v\.literal\("markdown_text"\)[\s\S]*v\.literal\("link"\)[\s\S]*v\.literal\("workspace_ref"\)[\s\S]*v\.literal\("mention"\)/,
  "write core should accept only typed first-slice content blocks",
);
assert.match(
  interactions,
  /MAX_INTERACTION_BLOCKS_PER_WRITE/,
  "write core should bound content block count",
);
assert.match(
  interactions,
  /normalizeIdempotencyKey[\s\S]*interaction_idempotency_key_required/,
  "write core should require idempotency keys",
);
assert.match(
  interactions,
  /getExistingRootByIdempotencyKey[\s\S]*by_community_idempotencyKey/,
  "root writes should read existing roots by community idempotency key",
);
assert.match(
  interactions,
  /getExistingReplyByIdempotencyKey[\s\S]*by_community_idempotencyKey/,
  "reply writes should read existing replies by community idempotency key",
);

const createRoot = exportedConstBlock(interactions, "createCommunityInteractionRoot");
assert.doesNotMatch(
  createRoot,
  /contentJson|v\.any\(\)|payloadJson/,
  "public root write should not accept untyped legacy chat payloads",
);
assert.match(
  createRoot,
  /resolveUserIdForAuthenticatedRequest[\s\S]*requireCommunityChatAccess[\s\S]*requireProfileSetupCompleteForUser/,
  "root write should reuse authenticated community chat/profile gates",
);
assert.match(
  createRoot,
  /const existing = await getExistingRootByIdempotencyKey[\s\S]*if \(existing\) return await mapRootBundle\(ctx, existing, true\)/,
  "root write should return existing root bundle on duplicate idempotency key",
);
assert.match(
  createRoot,
  /actorType: "human"[\s\S]*actorUserId: userId/,
  "first root write slice should be human-authored only",
);
assert.match(
  createRoot,
  /args\.kind === "agent_signal"[\s\S]*interaction_agent_signal_actor_required/,
  "first human root write slice should reject agent_signal roots",
);
assert.doesNotMatch(
  createRoot,
  /actorType: v\.|actorAgentKey: v\.|actorType: args\.actorType/,
  "public root write args should not accept autonomous actor attribution in this slice",
);
assert.match(
  createRoot,
  /insertContentBlocksForTarget\([\s\S]*rootId[\s\S]*blocks: contentBlocks/,
  "root write should write normalized content blocks after root creation",
);

const createReply = exportedConstBlock(interactions, "createCommunityInteractionReply");
assert.doesNotMatch(
  createReply,
  /contentJson|v\.any\(\)|payloadJson/,
  "public reply write should not accept untyped legacy chat payloads",
);
assert.match(
  createReply,
  /rootId: v\.id\("communityInteractionRoots"\)/,
  "reply write should attach directly to a root",
);
assert.match(
  createReply,
  /targetReplyId: v\.optional\(v\.union\(v\.id\("communityInteractionReplies"\), v\.null\(\)\)\)/,
  "reply target should be optional quote/context only",
);
assert.match(
  createReply,
  /targetReply[\s\S]*normalizeIdValue\(targetReply\.rootId\) !== normalizeIdValue\(root\._id\)[\s\S]*interaction_target_reply_invalid/,
  "reply write should reject target replies outside the same root",
);
assert.match(
  interactions,
  /resolveReplyVisibilityScope[\s\S]*interaction_reply_visibility_exceeds_root/,
  "reply writes should not allow broader visibility than the root",
);
assert.match(
  createReply,
  /const seq = Math\.max\(0, Math\.floor\(root\.replyCount \?\? 0\)\) \+ 1/,
  "reply write should derive one-level drawer sequence from root reply count",
);
assert.match(
  createReply,
  /ctx\.db\.patch\(root\._id as any,[\s\S]*replyCount: seq[\s\S]*lastReplyAt: nowMs/,
  "reply write should update root reply count and last reply timestamp",
);
assert.match(
  createReply,
  /if \(existing\) \{[\s\S]*normalizeIdValue\(existing\.rootId\) !== normalizeIdValue\(root\._id\)[\s\S]*interaction_idempotency_key_conflict[\s\S]*return await mapReplyBundle\(ctx, existing, true\)/,
  "reply write should be idempotent only within the same root",
);
assert.match(
  createReply,
  /actorType: "human"[\s\S]*actorUserId: userId/,
  "first reply write slice should be human-authored only",
);
assert.match(
  createReply,
  /insertContentBlocksForTarget\([\s\S]*replyId[\s\S]*blocks: contentBlocks/,
  "reply write should write normalized content blocks against the reply target",
);
assert.doesNotMatch(
  createReply,
  /insertContentBlocksForTarget\([\s\S]{0,220}rootId: root\._id[\s\S]{0,220}replyId/,
  "reply content blocks should not also be tagged as root content blocks",
);
assert.doesNotMatch(
  createReply,
  /parentReplyId|replyDepth|depth:/,
  "reply write should not create recursive reply hierarchy fields",
);

assert.match(
  interactions,
  /embedKind: "link"[\s\S]*status: "pending"[\s\S]*normalizedSourceUrl/,
  "link blocks should create pending async embed records",
);
assert.match(
  interactions,
  /embedKind: "workspace_ref"[\s\S]*status: "pending"[\s\S]*workspaceRefKind[\s\S]*workspaceRefId/,
  "workspace reference blocks should create pending async embed records",
);
assert.match(
  interactions,
  /communityInteractionMentions" as any[\s\S]*notifyState: "pending"/,
  "mention blocks should create canonical pending mention records",
);

assert.match(
  communityFacade,
  /createCommunityInteractionReply as createCommunityInteractionReplyImpl[\s\S]*createCommunityInteractionRoot as createCommunityInteractionRootImpl|createCommunityInteractionRoot as createCommunityInteractionRootImpl[\s\S]*createCommunityInteractionReply as createCommunityInteractionReplyImpl/,
  "community facade should import interaction write functions",
);
assert.match(
  communityFacade,
  /export const createCommunityInteractionRoot = createCommunityInteractionRootImpl;[\s\S]*export const createCommunityInteractionReply = createCommunityInteractionReplyImpl;/,
  "community facade should export interaction write functions",
);

console.log("community_interactions_write_core_contract_proof: ok");
