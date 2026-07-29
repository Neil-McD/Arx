import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCommunitySourceTraceRevision } from "../shared/communitySourceTraceRevision.ts";

const root = process.cwd();
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const digest = readFileSync(join(root, "convex/communityCompilerDigest.ts"), "utf8");
const evidenceCore = readFileSync(join(root, "convex/communityCompilerEvidenceCore.ts"), "utf8");

assert.match(
  schema,
  /communityCompilerDigests: defineTable\([\s\S]*versionKey: v\.optional\(v\.string\(\)\)[\s\S]*agentHandoffState:[\s\S]*sourceRevisions: v\.optional\(v\.array\(v\.string\(\)\)\)/,
  "digest rows should be immutable claimed work manifests with exact evidence revisions",
);
assert.match(
  schema,
  /communitySourceTraces: defineTable\([\s\S]*compilerDecision: v\.optional\([\s\S]*v\.literal\("retain"\)[\s\S]*v\.literal\("carried_forward"\)[\s\S]*v\.literal\("dismiss_low_signal"\)/,
  "source traces should persist the explicit terminal compiler decision",
);
assert.match(digest, /const MAX_DIGEST_ITEMS = 96/);
assert.match(
  digest,
  /measureCommunityCompilerEvidenceForCommunity[\s\S]*selectedSourceTraceRows = compilerEvidence\.selectedRows\.slice\(0, MAX_DIGEST_ITEMS\)/,
  "digest creation should consume the canonical bounded pending queue",
);
assert.match(
  digest,
  /selectedSourceTraceRows\.map\(async \(row\)[\s\S]*buildCommunitySourceTraceRevision\(row\)[\s\S]*summary: row\.summary[\s\S]*sourceTraceIds: \[row\._id\][\s\S]*sourceRevisions: \[revision\]/,
  "each work item should preserve one exact trace instead of an aggregate count",
);
assert.match(
  digest,
  /buildCommunityMemoryWorkKey\([\s\S]*sourceTraceIds: item\.sourceTraceIds[\s\S]*contentRevisions: item\.sourceRevisions/,
  "material evidence revisions should participate in work identity",
);
assert.match(
  digest,
  /buildCommunityMemoryDigestVersionKey\([\s\S]*workKeys: sortedItems\.map[\s\S]*sourceRevisions/,
  "digest versions should bind the exact work content",
);
assert.match(
  digest,
  /withIndex\("by_community_versionKey"[\s\S]*agentHandoffState: sortedItems\.length > 0 \? "pending" as const : "handled" as const/,
  "non-empty immutable digests should enter the autonomous handoff queue",
);
assert.doesNotMatch(
  digest,
  /markSelectedSourceTracesCompiled|compilerState: "compiled"/,
  "digest creation must never claim that semantic compilation happened",
);
const continuationPatch = digest.slice(
  digest.indexOf("for (const continuationRow"),
  digest.indexOf("return mapDigestRow(row)"),
);
assert.match(
  continuationPatch,
  /continuationRows\.slice\(0, MAX_DIGEST_ITEMS\)[\s\S]*compilerState === "pending"[\s\S]*compilerContinuationReady: true/,
  "digest creation should mark only bounded, still-pending overflow for the next pass",
);
assert.doesNotMatch(
  continuationPatch,
  /updatedAt|compilerPendingSince|compilerLastHandledAt|compilerDecision/,
  "continuation scheduling must not mutate semantic evidence or lifecycle timestamps",
);
for (const forbiddenSource of [
  "communityArchiveDocuments",
  "communityAiFeedPosts",
  "communityOutcomeObservations",
  "communityEvents",
  "communityMemberships",
]) {
  assert.doesNotMatch(
    digest,
    new RegExp(`query\\("${forbiddenSource}"`),
    `the compiler should canonicalize ${forbiddenSource} through source traces instead of a parallel digest input`,
  );
}
assert.match(
  evidenceCore,
  /by_community_compilerState_visibility_pendingSince[\s\S]*\.eq\("compilerState", "pending"\)/,
  "pending state should remain the queue truth",
);
assert.match(digest, /Every item must reach retained, carried-forward, or dismissed-low-signal/);
assert.doesNotMatch(
  digest,
  /sourceRevisions:\s*\[`?trace:\$\{traceId\}:\$\{Number\(row\.updatedAt/,
  "operational timestamp touches must not invalidate otherwise identical evidence",
);
const traceMaterial = {
  _id: "trace_1",
  communityId: "community_1",
  sourceType: "interaction",
  sourceId: "interaction:root:root_1",
  title: "Stable evidence",
  summary: "A reusable decision",
  visibilityScope: "community",
  sourceVisibility: "community",
  workflowId: undefined,
  artifactIds: [],
  outcomeObservationIds: [],
  actorType: "member",
  actorUserId: "user_1",
  actorAgentKey: undefined,
};
const stableRevision = await buildCommunitySourceTraceRevision(traceMaterial);
assert.match(stableRevision, /^trace_revision:v1:[0-9a-f]{64}$/);
assert.equal(
  stableRevision,
  await buildCommunitySourceTraceRevision({ ...traceMaterial }),
  "identical semantic evidence must keep the same content-addressed revision",
);
assert.notEqual(
  stableRevision,
  await buildCommunitySourceTraceRevision({ ...traceMaterial, summary: "A materially edited decision" }),
  "material evidence edits must invalidate prior compiler work",
);
assert.equal(
  stableRevision,
  await buildCommunitySourceTraceRevision({ ...traceMaterial, compilerGroupKey: "interaction_episode:root_1" }),
  "scheduling affinity must not change semantic evidence revision",
);
assert.equal(
  stableRevision,
  await buildCommunitySourceTraceRevision({ ...traceMaterial, compilerContinuationReady: true }),
  "continuation readiness must not change semantic evidence revision",
);
const associatedEvidenceRevision = await buildCommunitySourceTraceRevision({
  ...traceMaterial,
  artifactIds: ["artifact_b", "artifact_a"],
  outcomeObservationIds: ["outcome_b", "outcome_a"],
});
assert.equal(
  associatedEvidenceRevision,
  await buildCommunitySourceTraceRevision({
    ...traceMaterial,
    artifactIds: ["artifact_a", "artifact_b", "artifact_a"],
    outcomeObservationIds: ["outcome_a", "outcome_b", "outcome_a"],
  }),
  "set-like evidence associations must not create new work when only their order changes",
);

console.log("community_compiler_digest_contract_proof: ok");
