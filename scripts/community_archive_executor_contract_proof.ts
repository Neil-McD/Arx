import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const worker = read("convex/communityLifecycleArchiveWorker.ts");
const operations = read("convex/communityLifecycleOperations.ts");
const lifecycle = read("shared/communityLifecycle.ts");
const crons = read("convex/crons.ts");
const schema = read("convex/schema.ts");

for (const marker of [
  "claimDueCommunityArchiveOperationsInternal",
  "readNextCommunityArchiveEffectInternal",
  "completeCommunityArchiveEffectInternal",
  "releaseCommunityArchiveOperationInternal",
  "finalizeCommunityArchiveOperationInternal",
  "processCommunityArchiveOperationsInternal",
  "ARCHIVE_OPERATION_MAX_EFFECTS_PER_CLAIM",
  "ARCHIVE_OPERATION_MAX_ATTEMPTS",
  "communityArchiveRetryDelayMs",
  "compensateStaleStripeCheckout",
  "applyStripeSubscriptionEffect",
  'intent: "cancel_now"',
  'lifecycleStatus: "archived"',
  'state: "succeeded"',
]) {
  assert.ok(worker.includes(marker), `archive executor must include ${marker}`);
}

assert.match(
  operations,
  /assertCommunityArchiveBillingPreflight[\s\S]*by_community_status_source_providerAccountId[\s\S]*by_community_status_source_providerSubscriptionId[\s\S]*community_archive_billing_preflight_blocked/,
  "known unsupported billing must fail before the lifecycle transition",
);
assert.match(
  worker,
  /kind: "founder_subscription"[\s\S]*accountScope: \{ kind: "platform" \}/,
  "founder subscriptions must remain platform scoped",
);
assert.match(
  worker,
  /kind: "community_subscription"[\s\S]*kind: "connected"[\s\S]*providerAccountId/,
  "member subscriptions must remain connected-account scoped",
);
assert.match(
  worker,
  /stripeSubscriptionEffectIsTerminal[\s\S]*completeCommunityArchiveEffectInternal/,
  "local subscription closure must follow terminal provider proof",
);
assert.match(
  worker,
  /stripeCheckoutCompensationIsTerminal[\s\S]*completeCommunityArchiveEffectInternal/,
  "local checkout expiration must follow terminal provider proof",
);
assert.match(
  worker,
  /finalizeCommunityArchiveOperationInternal[\s\S]*community_archive_effects_remaining/,
  "finalization must recheck outstanding effects transactionally",
);
assert.doesNotMatch(
  worker,
  /export const \w+\s*=\s*(action|mutation|query)\s*\(/,
  "archive execution must expose no public Convex function",
);
assert.match(
  crons,
  /process community archive operations[\s\S]*minutes: 1[\s\S]*processCommunityArchiveOperationsInternal/,
  "one bounded cron must drive archive execution",
);
assert.match(schema, /index\("by_state_leaseExpiresAt"/);
assert.match(
  lifecycle,
  /communityIsOperational[\s\S]*normalizeCommunityLifecycleStatus\(community\.lifecycleStatus\) === "active"/,
  "archiving must immediately contain normal community operations",
);

console.log("community_archive_executor_contract_proof: ok");
