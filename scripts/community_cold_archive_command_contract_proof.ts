import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const schema = read("convex/schema.ts");
const archive = read("convex/communityColdArchive.ts");
const lifecycle = read("shared/communityLifecycle.ts");
const cancellation = read("convex/stripeSubscriptionCancellation.ts");
const communityAdmin = read("convex/communityAdmin.ts");
const commerce = read("convex/communityCommerce.ts");
const founderBilling = read("convex/founderBilling.ts");
const founderInferenceCore = read("convex/founderInferenceCore.ts");
const founderInference = read("convex/founderInference.ts");
const memberOntology = read("convex/memberOntologyCore.ts");
const crons = read("convex/crons.ts");

assert.match(
  lifecycle,
  /COMMUNITY_LIFECYCLE_STATUSES = \["active", "archived"\] as const/,
  "archive must retain exactly two product lifecycle states",
);
assert.match(
  schema,
  /communityArchiveBillingJobs: defineTable\(\{[\s\S]*status: v\.union\([\s\S]*v\.literal\("pending"\)[\s\S]*v\.literal\("complete"\)[\s\S]*v\.literal\("blocked"\)[\s\S]*\.index\("by_community_generation"[\s\S]*\.index\("by_status_nextAttemptAt"/,
  "one durable billing cleanup receipt must bridge Convex and Stripe",
);
assert.match(
  archive,
  /export const archiveCommunity = mutation\([\s\S]*String\(community\.ownerId\) !== String\(actorUserId\)[\s\S]*community_archive_platform_home_forbidden[\s\S]*archiveCommunityLifecycle\(community\)/,
  "the canonical archive command must be owner-only and protect platform home",
);
assert.match(
  archive,
  /ctx\.db\.patch\(args\.communityId,[\s\S]*ctx\.db\.insert\("communityArchiveBillingJobs"[\s\S]*scheduleArchiveBillingWorker/,
  "the lifecycle transition and worker scheduling must share one mutation",
);
assert.doesNotMatch(
  archive,
  /ctx\.db\.delete|\.delete\(/,
  "cold archive must preserve all community product data",
);
assert.match(
  archive,
  /kind: "checkouts"[\s\S]*kind: "member_subscriptions"[\s\S]*kind: "founder_subscriptions"[\s\S]*kind: "complete"/,
  "cleanup must drain stale checkouts, member subscriptions, then founder billing",
);
assert.match(
  archive,
  /ARCHIVE_CHECKOUT_SETTLE_GRACE_MS[\s\S]*kind: "wait"[\s\S]*deferCommunityArchiveBillingJobInternal/,
  "in-flight checkouts must settle before the archive job can declare cleanup complete",
);
assert.match(
  cancellation,
  /providerAccountId[\s\S]*stripeAccount: account[\s\S]*subscriptions\.retrieve\([\s\S]*subscriptions\.cancel\(subscriptionId, \{\}, options\)/,
  "the canonical Stripe primitive must carry connected-account scope through retrieve and cancel",
);
assert.match(
  communityAdmin,
  /provider_subscription_targets[\s\S]*provider_account_id[\s\S]*cancelStripeSubscriptionIfActive/,
  "member removal and ban must reuse account-scoped cancellation",
);
assert.match(
  commerce,
  /recordStalePublicCommunityCheckoutSessionInternal[\s\S]*expireStripeCheckoutSessionIfOpen[\s\S]*cancelStripeSubscriptionIfActive/,
  "member checkout attachment failures must preserve and clean their external session",
);
assert.match(
  founderBilling,
  /recordStaleFounderStripeCheckoutSessionInternal[\s\S]*expireStripeCheckoutSessionIfOpen[\s\S]*cancelStripeSubscriptionIfActive/,
  "founder checkout attachment failures must preserve and clean their external session",
);
assert.match(
  commerce,
  /syncCommunitySubscriptionLifecycleInternal[\s\S]*!communityIsActive\(community\)[\s\S]*reason: "community_archived"/,
  "late member billing webhooks must not mutate frozen membership state",
);
assert.match(
  founderBilling,
  /syncFounderSubscription\([\s\S]*!communityIsActive\(community\)[\s\S]*reason: "community_archived"/,
  "late founder billing webhooks must not reopen archived funding",
);
assert.match(
  founderInferenceCore,
  /withIndex\("by_owner"[\s\S]*\.filter\(\(community\) => communityIsActive\(community\)\)/,
  "archived communities must not block creation of another active community",
);
assert.match(
  founderBilling,
  /lifecycle_status: lifecycle\.status[\s\S]*archive_billing_cleanup_status/,
  "billing management must expose archive state",
);
assert.match(
  founderBilling,
  /row\.lifecycle_status === "active"[\s\S]*row\.funding_mode === "managed"/,
  "billing management must not charge archived communities in active totals",
);
assert.doesNotMatch(
  founderInference,
  /getCurrentFounderInferenceStatus|founder_inference_byok_retired/,
  "the retired founder projection must stay deleted",
);
assert.match(
  memberOntology,
  /!community \|\| !communityIsActive\(community\)[\s\S]*ownedRows as any\[\][\s\S]*\.filter\(\(row\) => communityIsActive\(row\)\)/,
  "member ontology context must omit archived memberships and ownership",
);
assert.match(
  crons,
  /recover archived community billing cleanup[\s\S]*scheduleDueCommunityArchiveBillingJobsInternal/,
  "a bounded cron must recover at-most-once action failures",
);

console.log("community cold archive command contract proof passed");
