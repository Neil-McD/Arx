import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const aiFeed = readFileSync(join(root, "convex/communityAiFeed.ts"), "utf8");
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const crons = readFileSync(join(root, "convex/crons.ts"), "utf8");
const facade = readFileSync(join(root, "convex/community.ts"), "utf8");
const gateway = readFileSync(join(root, "shared/cloudCommunityAiFeedGateway.ts"), "utf8");
const controller = readFileSync(join(root, "shared/useCommunityAiFeedController.ts"), "utf8");
const panel = readFileSync(join(root, "apps/web/src/components/CommunityAiFeedPanel.tsx"), "utf8");
const activeContractSources = [
  "shared/runtimePrompt.ts",
  "shared/polynetMcp.ts",
  "shared/toolRegistry.ts",
].map((path) => readFileSync(join(root, path), "utf8")).join("\n");
const attention = readFileSync(join(root, "convex/communityAttention.ts"), "utf8");
const evidenceIntegrityProof = readFileSync(
  join(root, "scripts/community_evidence_integrity_contract_proof.ts"),
  "utf8",
);
const lineageContract = readFileSync(
  join(root, "docs/community-lineage-ontology-contract-v0.md"),
  "utf8",
);

function blockBetween(source: string, startToken: string, endToken: string): string {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${startToken} should exist`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, `${endToken} should follow ${startToken}`);
  return source.slice(start, end);
}

const listBlock = blockBetween(
  aiFeed,
  "async function listCommunityAiFeedPostsInternal",
  "export const listCommunityAiFeedPosts",
);
const aiFeedSchema = blockBetween(
  schema,
  "communityAiFeedPosts: defineTable",
  "communityMemberSettings: defineTable",
);
assert.match(listBlock, /MAX_FEED_POST_LIMIT/, "AI Feed should cap its chronological read");
assert.match(
  listBlock,
  /withIndex\("by_community_status_createdAt"[\s\S]*\.order\("desc"\)[\s\S]*\.take\(limit\)/,
  "AI Feed should read newest live posts through one bounded compound index",
);
assert.doesNotMatch(listBlock, /\.collect\(\)/, "AI Feed should not collect unbounded post history");

assert.match(
  aiFeed,
  /withIndex\("by_community_noveltyKey"[\s\S]*\.take\(MAX_NOVELTY_KEY_MATCHES\)/,
  "AI Feed novelty-key reuse should remain bounded",
);
assert.match(
  aiFeed,
  /withIndex\("by_status_hiddenAt"[\s\S]*\.take\(limit\)/,
  "hidden-post retention cleanup should remain bounded",
);

for (const source of [aiFeed, aiFeedSchema, crons, facade, gateway, controller, panel]) {
  assert.doesNotMatch(
    source,
    /communityAiFeedReactions|reactToCommunityAiFeedPost|low_signal|reaction_counts|viewer_reaction/,
    "AI Feed reaction storage and behavior should stay deleted",
  );
  assert.doesNotMatch(
    source,
    /by_community_status_score_createdAt|rankedPosts|livePosts|signal_score/,
    "AI Feed ranking storage and projections should stay deleted",
  );
  assert.doesNotMatch(
    source,
    /pruneAllCommunityAiFeedPostsInternal|pruneCommunityAiFeedPostsInternal|listCommunityIdsForAiFeedPruneInternal/,
    "automatic AI Feed pruning should stay deleted",
  );
}
assert.doesNotMatch(schema, /communityAiFeedReactions: defineTable/);

assert.match(facade, /export const listCommunityAiFeedPosts = listCommunityAiFeedPostsImpl/);
assert.match(gateway, /community:listCommunityAiFeedPosts/);
assert.match(
  gateway,
  /if \(!Array\.isArray\(payload\)\)[\s\S]*community_ai_feed_response_invalid/,
  "AI Feed gateway should expose response contract drift instead of returning a false empty feed",
);
assert.match(controller, /posts: CommunityAiFeedPost\[\]/);
assert.match(panel, /const posts = state\.posts/);
assert.doesNotMatch(panel, />Ranked<|>Live<|ai-feed-signal-button/);
assert.doesNotMatch(
  activeContractSources,
  /reaction signal|community reaction signal/i,
  "active agent and tool contracts should not advertise deleted AI Feed reactions",
);
assert.doesNotMatch(
  attention,
  /status: "live" \| "ranked"/,
  "AI Feed attention types should use canonical live/hidden status",
);
assert.doesNotMatch(
  evidenceIntegrityProof,
  /score: 1|goodCount|lowSignalCount/,
  "AI Feed evidence fixtures should match the contracted canonical schema",
);
assert.doesNotMatch(
  lineageContract,
  /Hiding or pruning|moderator or pruner/,
  "AI Feed lineage contract should not preserve the deleted automatic-pruner role",
);

console.log("community_ai_feed_scaling_contract_proof: ok");
