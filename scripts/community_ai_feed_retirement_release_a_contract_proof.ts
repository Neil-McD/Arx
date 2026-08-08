import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseCommunityTab } from "../shared/appShellNavigation.ts";
import {
  validatePolynetSemanticRepositoryOperationInput,
} from "../shared/communitySemanticRepository.ts";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

assert.equal(parseCommunityTab("ai-feed"), "chat");
assert.equal(parseCommunityTab("ai_feed"), "chat");
assert.equal(parseCommunityTab("feed"), "chat");

assert.equal(
  validatePolynetSemanticRepositoryOperationInput({
    operation: "list",
    path: "/ai-feed/",
  }).ok,
  false,
  "retired semantic Feed paths must not remain navigable",
);

for (const path of [
  "apps/web/src/components/CommunityAiFeedPanel.tsx",
  "shared/useCommunityAiFeedController.ts",
  "shared/cloudCommunityAiFeedGateway.ts",
]) {
  assert.equal(existsSync(resolve(root, path)), false, `${path} must be deleted`);
}

const nav = read("shared/CommunityNav.tsx");
assert.doesNotMatch(nav, /onSelectTab\("ai_feed"\)|>AI Feed</);

const retrievalTools = read("shared/retrievalTools.ts");
for (const retiredTool of [
  "community_ai_feed_search",
  "community_ai_feed_read",
  "community_write",
]) {
  assert.equal(
    retrievalTools.includes(`\"${retiredTool}\"`),
    false,
    `${retiredTool} must not remain in the runtime tool surface`,
  );
}

const crons = read("convex/crons.ts");
assert.doesNotMatch(crons, /communityAiFeed|ai feed/i);

const feedBackend = read("convex/communityAiFeed.ts");
assert.match(feedBackend, /return \{ live: \[\], ranked: \[\] \};/);
assert.match(feedBackend, /function retired\(\): never \{[\s\S]*ai_feed_retired/);
for (const mutationName of [
  "reactToCommunityAiFeedPost",
  "hideCommunityAiFeedPost",
  "publishCommunityAiFeedAgentPost",
  "publishCommunityAiFeedAgentPostInternal",
  "publishCanonicalPolynetAiFeedPostInternal",
]) {
  assert.match(
    feedBackend,
    new RegExp(`export const ${mutationName}[\\s\\S]*?retired\\(\\);`),
    `${mutationName} must fail through the retirement tombstone`,
  );
}

const recentContext = read("convex/communityRecentContext.ts");
assert.doesNotMatch(recentContext, /query\("communityAiFeedPosts"/);

const digest = read("convex/emailDigests.ts");
assert.doesNotMatch(digest, /query\("communityAiFeedPosts"/);

const compiler = read("convex/communityCompilerEvidenceCore.ts");
assert.match(compiler, /row\.sourceType !== "ai_feed"/);

const inspector = read("convex/communityAiFeedRetirement.ts");
for (const category of [
  "posts",
  "reactions",
  "source_traces",
  "evidence_citations",
  "compiler_digests",
  "intelligence_nodes",
  "intelligence_change_requests",
]) {
  assert.ok(inspector.includes(`\"${category}\"`), `inspector missing ${category}`);
}
assert.match(inspector, /complete: truncated\.length === 0/);

console.log("PASS: AI Feed retirement Release A contract proof passed.");
