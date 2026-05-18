import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const aiFeed = readFileSync(join(root, "convex/communityAiFeed.ts"), "utf8");
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");

assert.doesNotMatch(
  aiFeed,
  /\.collect\(\)/,
  "AI feed should not use collect-all reads in user or maintenance paths",
);
assert.match(
  schema,
  /\.index\("by_community_status_score_createdAt", \["communityId", "status", "score", "createdAt"\]\)/,
  "AI feed should have a score + createdAt index for deterministic ranked reads",
);

function blockBetween(source: string, startToken: string, endToken: string): string {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${startToken} should exist`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `${endToken} should follow ${startToken}`);
  return source.slice(start, end);
}

const viewerReactionBlock = blockBetween(
  aiFeed,
  "async function getViewerReactionsByPostId",
  "async function getFeedPostOrThrow",
);
assert.match(
  viewerReactionBlock,
  /MAX_VIEWER_REACTION_POST_LOOKUPS/,
  "viewer reaction lookup should cap the selected post set",
);
assert.match(
  viewerReactionBlock,
  /withIndex\("by_post_actorKey"[\s\S]*\.first\(\)/,
  "viewer reaction lookup should use the exact post + actor index",
);
assert.doesNotMatch(
  viewerReactionBlock,
  /withIndex\("by_actorKey"[\s\S]*\.collect\(\)/,
  "viewer reaction lookup should not collect every reaction by actor",
);

const bundleBlock = blockBetween(
  aiFeed,
  "async function listCommunityAiFeedBundleInternal",
  "export const listCommunityAiFeedBundle",
);
assert.match(
  bundleBlock,
  /MAX_FEED_BUNDLE_LIMIT/,
  "AI feed bundle should cap the public read limit",
);
assert.match(
  bundleBlock,
  /withIndex\("by_community_status_createdAt"[\s\S]*\.order\("desc"\)[\s\S]*\.take\(limit\)/,
  "AI feed live tab should read latest posts through a bounded index scan",
);
assert.match(
  bundleBlock,
  /withIndex\("by_community_status_score_createdAt"[\s\S]*\.order\("desc"\)[\s\S]*\.take\(limit\)/,
  "AI feed ranked tab should read exact ranked posts through a bounded compound index scan",
);
assert.doesNotMatch(
  bundleBlock,
  /\.collect\(\)/,
  "AI feed bundle should not collect every live post in a community",
);

const pruneBlock = blockBetween(
  aiFeed,
  "export const pruneCommunityAiFeedPostsInternal",
  "export const pruneAllCommunityAiFeedPostsInternal",
);
assert.match(
  pruneBlock,
  /withIndex\("by_community_status_score_createdAt"[\s\S]*\.order\("asc"\)[\s\S]*\.take\(MAX_PRUNE_CANDIDATE_FETCH\)/,
  "AI feed pruning should inspect a bounded low-score oldest-first candidate window",
);
assert.doesNotMatch(
  pruneBlock,
  /\.collect\(\)/,
  "AI feed pruning should not collect every live post in a community",
);

assert.match(
  aiFeed,
  /withIndex\("by_community_noveltyKey"[\s\S]*\.take\(MAX_NOVELTY_KEY_MATCHES\)/,
  "AI feed novelty-key reuse should use a bounded lookup",
);
assert.match(
  aiFeed,
  /listCommunityIdsForAiFeedPruneInternal[\s\S]*paginationOptsValidator[\s\S]*query\("communities" as any\)[\s\S]*\.paginate\(\{[\s\S]*MAX_AI_FEED_PRUNE_COMMUNITIES_PER_PAGE/,
  "AI feed all-community pruning should page community scans",
);
assert.match(
  aiFeed,
  /pruneAllCommunityAiFeedPostsInternal[\s\S]*MAX_AI_FEED_PRUNE_COMMUNITY_PAGES_PER_RUN[\s\S]*has_more_communities/,
  "AI feed all-community pruning should bound each run and report continuation",
);
assert.match(
  aiFeed,
  /withIndex\("by_post"[\s\S]*\.take\(MAX_EXPIRED_POST_REACTION_DELETE_BATCH\)/,
  "AI feed hidden-post cleanup should delete reactions through bounded batches",
);

assert.doesNotMatch(
  aiFeed,
  /restoreHiddenCommunityAiFeedPostsInternal|restoreFeedPostToLive/,
  "transitional AI feed restore surfaces should stay deleted",
);

console.log("community_ai_feed_scaling_contract_proof: ok");
