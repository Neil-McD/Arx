import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseCommunityTab } from "../shared/appShellNavigation.ts";
import { validatePolynetSemanticRepositoryOperationInput } from "../shared/communitySemanticRepository.ts";

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
for (const operation of ["list", "read"] as const) {
  assert.equal(
    validatePolynetSemanticRepositoryOperationInput({
      operation,
      path: "/communities/polynet/ai-feed/",
    }).ok,
    true,
    `platform-mounted retired Feed ${operation} requests must reach the non-enumerating executor tombstone`,
  );
}

for (const path of [
  "apps/web/src/components/CommunityAiFeedPanel.tsx",
  "shared/useCommunityAiFeedController.ts",
  "shared/cloudCommunityAiFeedGateway.ts",
]) {
  assert.equal(
    existsSync(resolve(root, path)),
    false,
    `${path} must be deleted`,
  );
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
assert.match(
  feedBackend,
  /function retired\(\): never \{[\s\S]*ai_feed_retired/,
);
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

const citations = read("convex/communityEvidenceCitations.ts");
assert.match(
  citations,
  /resolution\.sourceKind === "ai_feed"[\s\S]*community_evidence_source_retired/,
  "direct retired Feed references must not create new citations",
);
assert.match(
  citations,
  /community_evidence_source_trace_not_admissible[\s\S]*trace\.sourceType === "ai_feed"[\s\S]*community_evidence_source_retired/,
  "retired Feed traces must not enter new memory proposals",
);

const canonicalExecutor = read("convex/polynetCanonicalExecutor.ts");
assert.equal(
  (canonicalExecutor.match(/isRetiredAiFeedSemanticPath\(target\.localPath\)/g) ?? [])
    .length,
  4,
  "retired Feed list, read, search, and write operations must share one absent-path tombstone",
);
assert.match(
  canonicalExecutor,
  /isRetiredAiFeedSemanticPath\(target\.localPath\)[\s\S]*semantic_not_found/,
  "retired Feed operations must fail as an absent semantic path",
);

const inspector = read("convex/communityAiFeedRetirement.ts");
for (const category of [
  "posts",
  "reactions",
  "source_traces",
  "evidence_citations",
  "compiler_digests",
  "intelligence_nodes",
  "intelligence_change_requests",
  "agent_serve_requests",
  "intelligence_retrieval_logs",
  "outcome_observations",
  "memory_metabolizer_runs",
]) {
  assert.ok(
    inspector.includes(`\"${category}\"`),
    `inspector missing ${category}`,
  );
}
assert.match(inspector, /complete: truncated\.length === 0/);
assert.match(inspector, /ai_feed_retirement_census_v3/);
assert.match(inspector, /export const deleteAiFeedRetirementBatchInternal/);
assert.match(inspector, /export const applyAiFeedRetirementBatchInternal/);
assert.match(inspector, /export const inspectAiFeedDanglingReferencePageInternal/);
assert.match(inspector, /const dryRun = args\.dryRun !== false/);
assert.match(inspector, /Math\.min\(100, Math\.floor\(args\.limit \?\? 25\)\)/);
assert.match(
  inspector,
  /AI_FEED_RETIREMENT_DELETE_ORDER\.slice\(\s*0,\s*categoryIndex,?\s*\)/,
);
assert.match(inspector, /batchDeletionReady:/);
assert.match(inspector, /retirementComplete:/);
assert.match(inspector, /danglingReferences\.count === 0/);
assert.match(inspector, /deriveCommunityLineage/);
assert.match(inspector, /ai_feed_retirement_id_community_mismatch/);
assert.match(inspector, /ai_feed_retirement_dangling_references_blocked/);
assert.match(inspector, /aiFeedLastSeenAt: undefined/);
assert.match(inspector, /ai_feed_retirement_batch_limit_exceeded/);
assert.match(inspector, /ai_feed_retirement_id_table_mismatch/);
assert.doesNotMatch(
  inspector,
  /JSON\.stringify\(row\)|containsRetiredFeedMarker/,
  "retirement classification must not delete shared rows from free-text matches",
);
assert.doesNotMatch(
  inspector,
  /operation_receipts|polynetCanonicalOperationReceipts/,
  "canonical operation receipts are permanent idempotency and audit authority",
);

const applyArgs = inspector.match(
  /export const applyAiFeedRetirementBatchInternal = internalMutation\(\{[\s\S]*?handler:/,
)?.[0];
assert.ok(applyArgs, "bounded destructive mutation contract must exist");
assert.doesNotMatch(
  applyArgs,
  /feedTraceIds|feedCitationIds/,
  "the destructive mutation must derive lineage instead of trusting its caller",
);

console.log("PASS: AI Feed retirement Release A contract proof passed.");
