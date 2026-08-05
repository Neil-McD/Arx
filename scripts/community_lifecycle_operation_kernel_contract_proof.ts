import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const schema = read("convex/schema.ts");
const lifecycleCore = read("convex/communityLifecycleCore.ts");
const operations = read("convex/communityLifecycleOperations.ts");
const contract = read("docs/community-lifecycle-contract-v1.md");

for (const marker of [
  "communityLifecycleOperations: defineTable(",
  'kind: v.literal("archive")',
  'v.literal("requested")',
  'v.literal("processing")',
  'v.literal("succeeded")',
  'v.literal("failed")',
  "requestedByUserId: v.id(\"users\")",
  "attemptCount: v.number()",
  "nextAttemptAt: v.number()",
  'index("by_community_generation_kind"',
  'index("by_state_nextAttemptAt"',
  'index("by_state_leaseExpiresAt"',
  'index("by_community_createdAt"',
]) {
  assert.ok(schema.includes(marker), `operation schema must include ${marker}`);
}

assert.match(
  lifecycleCore,
  /resolveCommunityArchiveBeginPlan[\s\S]*assertCommunityMayBeArchived[\s\S]*normalizeCommunityLifecycleStatus[\s\S]*normalizeCommunityLifecycleGeneration/,
  "one lifecycle core must own protected-community, status, and generation normalization",
);
assert.match(
  lifecycleCore,
  /status === "archiving"[\s\S]*mode: "reuse"/,
  "archiving retries must converge on the current operation generation",
);
assert.match(
  lifecycleCore,
  /expectedGeneration !== currentGeneration[\s\S]*community_archive_generation_stale/,
  "active transitions must reject stale clients",
);
assert.match(
  lifecycleCore,
  /const lifecycleGeneration = currentGeneration \+ 1[\s\S]*Number\.isSafeInteger/,
  "each archive request must create a new bounded lifecycle epoch",
);

assert.match(
  operations,
  /export const requestMyCommunityArchive = mutation[\s\S]*resolveUserIdForAuthenticatedRequest[\s\S]*beginCommunityArchiveOperationCore[\s\S]*nowMs: Date\.now\(\)/,
  "one public archive command must derive actor identity and time server-side",
);
assert.equal(
  operations.match(/= mutation\(/g)?.length ?? 0,
  2,
  "the lifecycle operation module must expose one owner archive command and one operator recovery command",
);
assert.doesNotMatch(
  operations,
  /beginCommunityArchiveOperationInternal|actorUserId: v\.id\("users"\)|nowMs: v\.number\(\)/,
  "the archive command must not retain a duplicate internal endpoint or accept actor and time from clients",
);
assert.match(
  operations,
  /getMyCommunityArchiveOperationStatus = query[\s\S]*resolveUserIdForAuthenticatedRequest[\s\S]*requireCommunityOwnerAnyLifecycle/,
  "only the authenticated owner may inspect archive operation status",
);
assert.match(
  operations,
  /getCommunityArchiveOperationForOperator = query[\s\S]*requireOperatorRole\(ctx, args\.authSubject, "operator"\)[\s\S]*ctx\.db\.get\(args\.operationId\)/,
  "operator diagnosis must be an authorized exact operation lookup",
);
assert.match(
  operations,
  /requeueFailedCommunityArchiveOperationForOperator = mutation[\s\S]*requireOperatorRole[\s\S]*operation\.state !== "failed"[\s\S]*community\.lifecycleStatus !== "archiving"[\s\S]*recordCriticalAuditEvent[\s\S]*state: "requested"/,
  "operator recovery must fail closed and only reopen the canonical operation",
);
assert.match(
  operations,
  /expectedFailureCompletedAt[\s\S]*community_archive_requeue_failure_stale/,
  "operator recovery must compare-and-set the inspected terminal failure",
);
assert.match(
  operations,
  /community_archive_requeued:[\s\S]*by_eventKey[\s\S]*community_archive_requeue_idempotency_conflict/,
  "operator recovery must be idempotent and conflict-safe",
);
assert.match(
  operations,
  /operation_id:[\s\S]*attempt_count:[\s\S]*error_code:[\s\S]*created_at:/,
  "the owner status projection must expose bounded operation state",
);
assert.match(
  operations,
  /mapCommunityLifecycleIdentity[\s\S]*normalizeCommunityLifecycleGeneration[\s\S]*mapCommunityLifecycleManagement[\s\S]*getArchiveOperation\([\s\S]*getMyCommunityArchiveOperationStatus = query[\s\S]*mapCommunityLifecycleManagement/,
  "owner status must resolve the archive receipt for the current lifecycle generation",
);
assert.match(
  operations,
  /requireCommunityOwnerAnyLifecycle[\s\S]*resolveCommunityArchiveBeginPlan/,
  "owner authority and the canonical transition planner must precede writes",
);
assert.match(
  operations,
  /beginCommunityArchiveOperationCore[\s\S]*Number\.isSafeInteger\(args\.nowMs\)[\s\S]*community_archive_timestamp_invalid[\s\S]*requireCommunityOwnerAnyLifecycle/,
  "the canonical operation core must validate its server-owned timestamp before writes",
);
assert.match(
  operations,
  /mode === "reuse"[\s\S]*community_archive_operation_missing[\s\S]*idempotent: true/,
  "retries must return exactly one existing receipt and fail closed on orphaned archiving state",
);
assert.match(
  operations,
  /args\.ctx\.db\.insert\([\s\S]*"communityLifecycleOperations"[\s\S]*args\.ctx\.db\.patch\(args\.communityId[\s\S]*lifecycleStatus: "archiving"[\s\S]*lifecycleGeneration: plan\.lifecycleGeneration/,
  "receipt creation and the lifecycle transition must share one Convex transaction",
);
assert.doesNotMatch(
  operations,
  /getStripeClient|subscriptions\.(retrieve|cancel|update)|scheduler\.|fetch\(/,
  "the operation kernel must contain no provider or background side effects",
);
for (const forbiddenTable of [
  "communityMemberships",
  "communityPricePoints",
  "communityChannels",
  "communityInteractionRoots",
]) {
  assert.ok(
    !operations.includes(forbiddenTable),
    `archive begin must not mutate or enumerate ${forbiddenTable}`,
  );
}

assert.match(contract, /one authenticated owner archive[\s\S]*no restore command/);
assert.match(contract, /one durable[\s\S]*`communityLifecycleOperations` row/);
assert.match(contract, /single owner-authorized archive command/);
assert.match(contract, /final transaction rechecks that no active[\s\S]*subscription or pending checkout remains/);

console.log("community_lifecycle_operation_kernel_contract_proof: ok");
