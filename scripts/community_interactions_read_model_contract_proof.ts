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

function functionBlock(source: string, functionName: string): string {
  const startToken = `function ${functionName}`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const next = source.indexOf("\nfunction ", start + startToken.length);
  const nextAsync = source.indexOf("\nasync function ", start + startToken.length);
  const candidates = [next, nextAsync].filter((value) => value >= 0);
  const end = candidates.length > 0 ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

assert.match(
  packageJson,
  /"check:community-interactions-read-model-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_interactions_read_model_contract_proof\.ts"/,
  "package scripts should expose the community interactions read-model proof",
);

assert.match(
  contract,
  /Current Read-Model Slice[\s\S]*listCommunityInteractionRoots[\s\S]*listCommunityInteractionReplies/,
  "contract should document the active read-model slice",
);
assert.match(
  contract,
  /root reads do not hydrate drawer replies inline[\s\S]*read APIs do not read legacy chat tables[\s\S]*read APIs do not read compiler, source-trace, archive, or memory tables/,
  "contract should preserve read-model boundaries",
);

assert.doesNotMatch(
  interactions,
  /\.collect\(\)/,
  "interaction read/write module should not use unbounded collect reads",
);
assert.doesNotMatch(
  interactions,
  /query\("communityChatThreads"|query\("communityChatMessages"|query\("communityMessageReactions"|communityChatThreads" as any|communityChatMessages" as any|communityMessageReactions" as any/,
  "interaction read model should not read legacy community chat tables",
);
assert.doesNotMatch(
  interactions,
  /communitySourceTraces" as any|communityArchiveDocuments|communityCompiler|communityIntelligenceNodes|communityIntelligenceChangeRequests/,
  "interaction read model should not read source trace, archive, compiler, or directory truth tables",
);

const mapRootBundle = functionBlock(interactions, "mapRootBundle");
assert.match(
  mapRootBundle,
  /listContentBlocksForRoot\(ctx, root\._id\)[\s\S]*listEmbedsForRoot\(ctx, root\._id\)[\s\S]*listMentionsForRoot\(ctx, root\._id\)/,
  "root bundle mapper should hydrate bounded content blocks, embeds, and mentions",
);
assert.doesNotMatch(
  mapRootBundle,
  /communityInteractionReplies|listCommunityInteractionReplies|listContentBlocksForReply/,
  "root bundle mapper should not hydrate drawer replies inline",
);

const mapReplyBundle = functionBlock(interactions, "mapReplyBundle");
assert.match(
  mapReplyBundle,
  /listContentBlocksForReply\(ctx, reply\._id\)[\s\S]*listEmbedsForReply\(ctx, reply\._id\)[\s\S]*listMentionsForReply\(ctx, reply\._id\)/,
  "reply bundle mapper should hydrate bounded content blocks, embeds, and mentions",
);

for (const [helper, pattern] of [
  ["listContentBlocksForRoot", /withIndex\("by_root_order"[\s\S]*\.take\(MAX_INTERACTION_BLOCKS_PER_WRITE\)/],
  ["listContentBlocksForReply", /withIndex\("by_reply_order"[\s\S]*\.take\(MAX_INTERACTION_BLOCKS_PER_WRITE\)/],
  ["listEmbedsForRoot", /withIndex\("by_root"[\s\S]*\.take\(MAX_INTERACTION_EMBEDS_PER_BUNDLE\)/],
  ["listEmbedsForReply", /withIndex\("by_reply"[\s\S]*\.take\(MAX_INTERACTION_EMBEDS_PER_BUNDLE\)/],
  ["listMentionsForRoot", /withIndex\("by_root"[\s\S]*\.take\(MAX_INTERACTION_MENTIONS_PER_BUNDLE\)/],
  ["listMentionsForReply", /withIndex\("by_reply"[\s\S]*\.take\(MAX_INTERACTION_MENTIONS_PER_BUNDLE\)/],
] as const) {
  assert.match(interactions, pattern, `${helper} should use bounded indexed hydration`);
}

const listRoots = exportedConstBlock(interactions, "listCommunityInteractionRoots");
assert.match(
  listRoots,
  /query\(\{[\s\S]*requireCommunityChatAccess/,
  "root list should be an access-gated query",
);
assert.match(
  listRoots,
  /MAX_INTERACTION_ROOT_READ_LIMIT/,
  "root list should cap the requested limit",
);
assert.match(
  listRoots,
  /withIndex\("by_community_status_createdAt"[\s\S]*\.eq\("status", "live"\)[\s\S]*\.order\("desc"\)[\s\S]*\.take\(limit\)/,
  "root list should read live roots through the community/status/createdAt index",
);
assert.match(
  listRoots,
  /withIndex\("by_community_kind_status_createdAt"[\s\S]*\.eq\("kind", kind\)[\s\S]*\.eq\("status", "live"\)[\s\S]*\.take\(limit\)/,
  "root list should support bounded kind-filtered reads through the compound index",
);
assert.doesNotMatch(
  listRoots,
  /communityInteractionReplies|listCommunityInteractionReplies|query\("communityInteractionReplies"/,
  "root list should not hydrate drawer replies inline",
);
assert.doesNotMatch(
  listRoots,
  /ctx\.db\.(insert|patch|delete)|mutation\(/,
  "root list should not mutate state",
);

const listReplies = exportedConstBlock(interactions, "listCommunityInteractionReplies");
assert.match(
  listReplies,
  /query\(\{[\s\S]*ctx\.db\.get\(args\.rootId\)[\s\S]*requireCommunityChatAccess/,
  "reply list should validate the root and gate access through the root community",
);
assert.match(
  listReplies,
  /MAX_INTERACTION_REPLY_READ_LIMIT/,
  "reply list should cap the requested limit",
);
assert.match(
  listReplies,
  /query\("communityInteractionReplies" as any\)[\s\S]*withIndex\("by_root_seq"[\s\S]*\.eq\("rootId", root\._id\)[\s\S]*\.order\("desc"\)[\s\S]*\.take\(MAX_INTERACTION_REPLY_READ_LIMIT\)/,
  "reply list should read drawer replies through the root/seq index",
);
assert.match(
  listReplies,
  /\.filter\(\(row\) => row\.status === "live"\)/,
  "reply list should exclude hidden/deleted replies from the default drawer read",
);
assert.doesNotMatch(
  listReplies,
  /targetReplyId[\s\S]*query\("communityInteractionReplies" as any\)|parentReplyId|replyDepth|depth:/,
  "reply list should not recursively hydrate replies through target replies",
);
assert.doesNotMatch(
  listReplies,
  /ctx\.db\.(insert|patch|delete)|mutation\(/,
  "reply list should not mutate state",
);

assert.match(
  communityFacade,
  /listCommunityInteractionReplies as listCommunityInteractionRepliesImpl[\s\S]*listCommunityInteractionRoots as listCommunityInteractionRootsImpl|listCommunityInteractionRoots as listCommunityInteractionRootsImpl[\s\S]*listCommunityInteractionReplies as listCommunityInteractionRepliesImpl/,
  "community facade should import interaction read functions",
);
assert.match(
  communityFacade,
  /export const listCommunityInteractionRoots = listCommunityInteractionRootsImpl;[\s\S]*export const listCommunityInteractionReplies = listCommunityInteractionRepliesImpl;/,
  "community facade should export interaction read functions",
);

console.log("community_interactions_read_model_contract_proof: ok");
