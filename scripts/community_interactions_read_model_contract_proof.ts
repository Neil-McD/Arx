import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const interactions = readFileSync(join(root, "convex/communityInteractions.ts"), "utf8");
const attachmentBridge = readFileSync(join(root, "convex/communityInteractionAttachmentBridge.ts"), "utf8");
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
  const nextExportConst = source.indexOf("\nexport const ", start + startToken.length);
  const candidates = [next, nextAsync, nextExportConst].filter((value) => value >= 0);
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
  /root reads return only `community` and `public` roots[\s\S]*root reads do not hydrate drawer replies inline[\s\S]*reply reads require a live community\/public-readable root[\s\S]*reply reads return only live `community` and `public` replies[\s\S]*read APIs do not use legacy chat tables as source-of-truth[\s\S]*read bundles load attachments only from canonical `communityInteractionAttachments` rows[\s\S]*legacy attachment read fallback is deleted[\s\S]*communityInteractionAttachmentBridge[\s\S]*viewer reaction state must be loaded only for the visible root\/reply target ids[\s\S]*reaction summary updates must not rescan every reaction on a target[\s\S]*read APIs do not read compiler, source-trace, archive, or memory tables/,
  "contract should preserve read-model boundaries",
);

assert.match(
  interactions,
  /import \{[\s\S]*listCanonicalInteractionAttachmentsForTarget[\s\S]*\} from "\.\/communityInteractionAttachmentBridge";/,
  "canonical interaction core should import canonical attachment reads through the attachment bridge",
);
assert.doesNotMatch(
  interactions,
  /communityInteractionLegacyAttachments|resolveLegacyMessageAttachments|ctx\.storage\.getUrl/,
  "canonical interaction core should not own or call legacy attachment hydration",
);
assert.equal(
  existsSync(join(root, "convex/communityInteractionLegacyAttachments.ts")),
  false,
  "legacy attachment read fallback should be deleted",
);
assert.match(
  attachmentBridge,
  /listCanonicalInteractionAttachmentsForTarget[\s\S]*query\("communityInteractionAttachments" as any\)[\s\S]*withIndex\("by_root"[\s\S]*withIndex\("by_reply"[\s\S]*take\(MAX_LEGACY_INTERACTION_ATTACHMENTS\)/,
  "canonical attachment reads should stay bounded and indexed in the attachment bridge",
);
assert.match(
  attachmentBridge,
  /mapCanonicalInteractionAttachment[\s\S]*ctx\.storage\.getUrl\(row\.storageId as any\)/,
  "canonical attachment storage URL resolution should stay isolated in the attachment bridge",
);
assert.doesNotMatch(
  attachmentBridge,
  /query\("communityChatThreads"|query\("communityChatMessages"|\.collect\(\)/,
  "canonical attachment hydration should not scan legacy chat tables",
);
for (const functionName of ["mapRootBundle", "mapReplyBundle"] as const) {
  const bundleMapper = functionBlock(interactions, functionName);
  assert.doesNotMatch(
    bundleMapper,
    /getLegacyChatLink|communityInteractionLegacyChatLinks|legacy_(?:thread|message|target_message)_id/,
    `${functionName} should expose only canonical interaction identity`,
  );
}
assert.doesNotMatch(
  interactions,
  /SEED_PEOPLE|SEED_AUTH_PREFIX/,
  "canonical interaction core should not contain demo seed tooling",
);

assert.match(
  interactions,
  /function interactionVisibilityIsCommunityReadable\(scope: InteractionVisibilityScope\)[\s\S]*scope === "community" \|\| scope === "public"/,
  "public member reads should use a narrow community/public visibility predicate",
);
assert.match(
  interactions,
  /function assertCommunityReadableRoot\(root: InteractionRootRow\)[\s\S]*root\.status !== "live" \|\| !interactionVisibilityIsCommunityReadable\(root\.visibilityScope\)[\s\S]*interaction_root_not_readable/,
  "root read helper should reject non-live or non-community-readable roots",
);
assert.match(
  interactions,
  /function assertCommunityReadableReply\(reply: InteractionReplyRow\)[\s\S]*reply\.status !== "live" \|\| !interactionVisibilityIsCommunityReadable\(reply\.visibilityScope\)[\s\S]*interaction_reply_not_readable/,
  "reply read helper should reject non-live or non-community-readable replies",
);

assert.doesNotMatch(
  exportedConstBlock(interactions, "listCommunityInteractionRoots") + exportedConstBlock(interactions, "listCommunityInteractionReplies"),
  /\.collect\(\)|query\("communityChatThreads"|query\("communityChatMessages"|query\("communityMessageReactions"|communityChatThreads" as any|communityChatMessages" as any|communityMessageReactions" as any/,
  "public interaction read queries should not use unbounded collects or legacy chat tables as source-of-truth",
);
assert.doesNotMatch(
  exportedConstBlock(interactions, "listCommunityInteractionRoots") + exportedConstBlock(interactions, "listCommunityInteractionReplies"),
  /communitySourceTraces" as any|communityCompiler|communityIntelligenceNodes|communityIntelligenceChangeRequests/,
  "interaction read model should not read source trace, compiler, or directory truth tables",
);

const mapRootBundle = functionBlock(interactions, "mapRootBundle");
assert.match(
  mapRootBundle,
  /listContentBlocksForRoot\(ctx, root\._id\)[\s\S]*listEmbedsForRoot\(ctx, root\._id\)[\s\S]*listMentionsForRoot\(ctx, root\._id\)/,
  "root bundle mapper should hydrate bounded content blocks, embeds, and mentions",
);
assert.match(
  mapRootBundle,
  /const attachments = await listCanonicalInteractionAttachmentsForTarget\(\{ ctx, rootId: root\._id \}\)/,
  "root bundle mapper should read attachments only from canonical rows",
);
assert.doesNotMatch(
  mapRootBundle,
  /canonicalAttachments\.length|resolveLegacyMessageAttachments/,
  "root bundle mapper should not retain a legacy attachment branch",
);
assert.doesNotMatch(
  mapRootBundle,
  /listCommunityInteractionReplies|listContentBlocksForReply|\.take\(MAX_INTERACTION_REPLY_READ_LIMIT\)/,
  "root bundle mapper should not hydrate drawer reply bodies inline",
);
assert.match(
  mapRootBundle,
  /query\("communityInteractionReplies" as any\)[\s\S]*withIndex\("by_root_seq"[\s\S]*\.order\("desc"\)[\s\S]*\.first\(\)/,
  "root bundle mapper may read one latest reply row for compact-feed last-reply metadata",
);

const mapReplyBundle = functionBlock(interactions, "mapReplyBundle");
assert.match(
  mapReplyBundle,
  /listContentBlocksForReply\(ctx, reply\._id\)[\s\S]*listEmbedsForReply\(ctx, reply\._id\)[\s\S]*listMentionsForReply\(ctx, reply\._id\)/,
  "reply bundle mapper should hydrate bounded content blocks, embeds, and mentions",
);
assert.match(
  mapReplyBundle,
  /const attachments = await listCanonicalInteractionAttachmentsForTarget\(\{ ctx, replyId: reply\._id \}\)/,
  "reply bundle mapper should read attachments only from canonical rows",
);
assert.doesNotMatch(
  mapReplyBundle,
  /canonicalAttachments\.length|resolveLegacyMessageAttachments/,
  "reply bundle mapper should not retain a legacy attachment branch",
);

const viewerReactionMap = functionBlock(interactions, "loadViewerReactionMapForTargets");
assert.match(
  viewerReactionMap,
  /targetIds: any\[\][\s\S]*by_root_actor_emoji[\s\S]*by_reply_actor_emoji[\s\S]*\.eq\("actorKey", actorKey\)[\s\S]*\.take\(MAX_VIEWER_REACTIONS_PER_TARGET\)/,
  "viewer reaction state should be loaded through target+actor indexes and capped per visible target",
);
assert.doesNotMatch(
  viewerReactionMap,
  /by_actor[\s\S]*\.collect\(\)|\.collect\(\)/,
  "viewer reaction state should not scan all reactions for the actor",
);

const reactionSummaryDelta = functionBlock(interactions, "applyReactionSummaryDelta");
assert.match(
  reactionSummaryDelta,
  /mapReactionSummary\(current\)[\s\S]*counts\.set[\s\S]*counts\.delete[\s\S]*Array\.from\(counts\.entries\(\)\)/,
  "reaction summary updates should adjust the denormalized summary by delta",
);
assert.doesNotMatch(
  reactionSummaryDelta,
  /ctx\.db\.query|\.collect\(\)/,
  "reaction summary updates should not rescan all reactions on the target",
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
  /const visibleRows = rows\.filter\(\(row\) => interactionVisibilityIsCommunityReadable\(row\.visibilityScope\)\)[\s\S]*loadViewerReactionMapForTargets\(ctx, userId, "root", visibleRows\.map\(\(row\) => row\._id\)\)/,
  "root list should load viewer reactions only for visible roots",
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
  /query\(\{[\s\S]*ctx\.db\.get\(args\.rootId\)[\s\S]*assertCommunityReadableRoot\(root\)[\s\S]*requireCommunityChatAccess/,
  "reply list should validate a readable root and gate access through the root community",
);
assert.match(
  listReplies,
  /MAX_INTERACTION_REPLY_READ_LIMIT/,
  "reply list should cap the requested limit",
);
assert.match(
  listReplies,
  /loadViewerReactionMapForTargets\(ctx, userId, "reply", filtered\.map\(\(row\) => row\._id\)\)/,
  "reply list should load viewer reactions only for visible drawer replies",
);
assert.match(
  listReplies,
  /query\("communityInteractionReplies" as any\)[\s\S]*withIndex\("by_root_seq"[\s\S]*\.eq\("rootId", root\._id\)[\s\S]*\.order\("desc"\)[\s\S]*\.take\(MAX_INTERACTION_REPLY_READ_LIMIT\)/,
  "reply list should read drawer replies through the root/seq index",
);
assert.match(
  listReplies,
  /filter\(\(row\) => \{[\s\S]*assertCommunityReadableReply\(row\)[\s\S]*return true[\s\S]*return false/,
  "reply list should exclude hidden/deleted/non-community-readable replies from the default drawer read",
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
