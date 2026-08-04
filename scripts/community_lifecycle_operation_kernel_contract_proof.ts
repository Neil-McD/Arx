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
  /export const beginCommunityArchiveOperationInternal = internalMutation/,
  "the initial archive command must remain internal-only",
);
assert.doesNotMatch(
  operations,
  /\bmutation\s*\(/,
  "the operation kernel must not expose a public mutation",
);
assert.match(
  operations,
  /getMyCommunityArchiveOperationStatus = query[\s\S]*resolveUserIdForAuthenticatedRequest[\s\S]*requireCommunityOwnerAnyLifecycle/,
  "only the authenticated owner may inspect archive operation status",
);
assert.match(
  operations,
  /operation_id:[\s\S]*attempt_count:[\s\S]*error_code:[\s\S]*created_at:/,
  "the owner status projection must expose bounded operation state",
);
assert.match(
  operations,
  /requireCommunityOwnerAnyLifecycle[\s\S]*resolveCommunityArchiveBeginPlan/,
  "owner authority and the canonical transition planner must precede writes",
);
assert.match(
  operations,
  /Number\.isSafeInteger\(args\.nowMs\)[\s\S]*community_archive_timestamp_invalid[\s\S]*requireCommunityOwnerAnyLifecycle/,
  "untrusted operation timestamps must fail before authority checks or writes",
);
assert.match(
  operations,
  /mode === "reuse"[\s\S]*community_archive_operation_missing[\s\S]*idempotent: true/,
  "retries must return exactly one existing receipt and fail closed on orphaned archiving state",
);
assert.match(
  operations,
  /ctx\.db\.insert\("communityLifecycleOperations"[\s\S]*ctx\.db\.patch\(args\.communityId[\s\S]*lifecycleStatus: "archiving"[\s\S]*lifecycleGeneration: plan\.lifecycleGeneration/,
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

assert.match(contract, /does not expose a public archive or[\s\S]*restore command/);
assert.match(contract, /one durable[\s\S]*`communityLifecycleOperations` row/);
assert.match(contract, /no builder-facing command or UI/);
assert.match(contract, /final transaction rechecks that no active[\s\S]*subscription or pending checkout remains/);

console.log("community_lifecycle_operation_kernel_contract_proof: ok");
