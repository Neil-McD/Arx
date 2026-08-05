import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const eligibility = read("shared/communityRestoreEligibility.ts");
const funding = read("shared/builderFunding.ts");
const founderBilling = read("convex/founderBilling.ts");
const founderPlanCore = read("convex/founderPlanCore.ts");
const lifecycleOperations = read("convex/communityLifecycleOperations.ts");
const ownerFunding = read("convex/communityOwnerFundingCore.ts");
const communityCommerce = read("convex/communityCommerce.ts");
const communityCore = read("convex/communityCore.ts");
const archiveWorker = read("convex/communityLifecycleArchiveWorker.ts");
const httpBilling = read("convex/httpBilling.ts");
const schema = read("convex/schema.ts");
const gateway = read("shared/cloudFounderBillingGateway.ts");
const account = read("apps/web/src/components/WebAccountSettingsSection.tsx");
const billing = read("apps/web/src/components/WebBillingSettingsSection.tsx");
const controller = read("apps/web/src/controllers/useWebFounderBillingController.ts");
const lifecycleContract = read("docs/community-lifecycle-contract-v1.md");
const subscriptionOrdering = read("shared/subscriptionEventOrdering.ts");

assert.match(
  funding,
  /builderFundingProjectionGrantsAccess[\s\S]*legacy_api_active[\s\S]*builder_active[\s\S]*builder_canceling[\s\S]*builder_included/,
  "one Builder projection helper must define funding access",
);
assert.match(
  eligibility,
  /lifecycleStatus === "active"[\s\S]*state: "not_archived"[\s\S]*lifecycleStatus === "archiving"[\s\S]*state: "archive_in_progress"/,
  "restore eligibility must preserve the three-state lifecycle",
);
assert.match(
  eligibility,
  /legacy_api_active[\s\S]*builder_included[\s\S]*state: "ready"[\s\S]*builder_active[\s\S]*builder_canceling[\s\S]*checkout_pending[\s\S]*state: "funding_attention"[\s\S]*state: "checkout_required"/,
  "archived readiness must reject managed active, canceling, and generic pending drift",
);
assert.doesNotMatch(
  eligibility,
  /mutation|ctx\.db|runMutation|fetch\(/,
  "restore eligibility must remain a pure read model",
);
assert.match(
  eligibility,
  /managedFundingConflict === true[\s\S]*state: "funding_attention"/,
  "managed financial drift must override otherwise-ready presentation funding",
);

assert.match(
  schema,
  /founderSubscriptions: defineTable\(\{[\s\S]*communityLifecycleGeneration: v\.number\(\)[\s\S]*communitySubscriptions: defineTable\(\{[\s\S]*communityLifecycleGeneration: v\.number\(\)[\s\S]*lastSourceEventCreatedAt: v\.number\(\)/,
  "both subscription authorities must carry a required lifecycle generation and member event cursor",
);
assert.match(
  subscriptionOrdering,
  /incomingCreatedAt > args\.currentCreatedAt[\s\S]*incomingCreatedAt < args\.currentCreatedAt[\s\S]*SUBSCRIPTION_RESTRICTION_RANK\[args\.incomingStatus\] >=/,
  "equal-time provider events must fail closed through one canonical ordering rule",
);
assert.match(
  founderPlanCore,
  /currentRows = rows\.filter[\s\S]*communityLifecycleGeneration === communityLifecycleGeneration[\s\S]*grantingRows = currentRows\.filter/,
  "founder funding reads must ignore historical lifecycle generations",
);
assert.match(
  founderPlanCore,
  /getPendingFounderSubscriptionCheckoutForGeneration[\s\S]*mode === "founder_subscription"[\s\S]*communityLifecycleGeneration[\s\S]*expiresAt > args\.nowMs/,
  "one generation-scoped helper must own pending founder checkout selection",
);
assert.match(
  founderBilling,
  /existing\.communityLifecycleGeneration[\s\S]*founder_subscription_lifecycle_stale[\s\S]*communityLifecycleGeneration: normalizeCommunityLifecycleGeneration/,
  "founder subscription synchronization must fence existing and newly verified subscriptions",
);
assert.match(
  communityCommerce,
  /community_subscription_event_stale[\s\S]*communityAcceptsNewOperationsAtGeneration[\s\S]*community_subscription_lifecycle_stale[\s\S]*lastSourceEventCreatedAt: sourceEventCreatedAt/,
  "member subscription synchronization must be monotonic and lifecycle fenced",
);
assert.match(
  communityCore,
  /communitySubscriptionMatchesCurrentLifecycle[\s\S]*resolveMostRelevantCommunitySubscription[\s\S]*\.filter\(\(row\) => communitySubscriptionMatchesCurrentLifecycle/,
  "member entitlement reads must select only the current lifecycle generation",
);
assert.match(
  archiveWorker,
  /lastProviderEventCreatedAt: Math\.max[\s\S]*lastSourceEventCreatedAt: Math\.max/,
  "archive completion must advance both local subscription event cursors",
);
assert.match(
  httpBilling,
  /result\?\.quarantined === true[\s\S]*cancelStaleCheckoutSubscription[\s\S]*community_subscription_lifecycle_stale/,
  "quarantined connected subscriptions must be canceled at the provider boundary",
);

assert.match(
  founderBilling,
  /lifecycle_status: lifecycleStatus[\s\S]*lifecycle_generation: lifecycleGeneration[\s\S]*operational_funding: operationalFunding[\s\S]*restore_eligibility: restoreEligibility/,
  "the canonical Builder billing query must expose lifecycle and restore-readiness truth",
);
assert.match(
  founderBilling,
  /managed_monthly_total_base_units:[\s\S]*row\.lifecycle_status === "active"[\s\S]*row\.funding_mode === "managed"[\s\S]*builder_active[\s\S]*builder_canceling/,
  "managed totals must count only operationally active Builder subscriptions",
);
assert.match(
  gateway,
  /lifecycle_status: CommunityLifecycleStatus[\s\S]*lifecycle_generation: number[\s\S]*operational_funding: boolean[\s\S]*restore_eligibility: CommunityRestoreEligibility/,
  "the web gateway must preserve the lifecycle-aware billing contract",
);
assert.match(
  gateway,
  /coerceRestoreEligibility[\s\S]*resolveCommunityRestoreEligibility/,
  "cached web clients must derive a bounded compatibility projection",
);

assert.match(
  account,
  /activeOwnedCommunities[\s\S]*community\.lifecycle_status === "active"[\s\S]*operational_funding/,
  "Account Builder summaries must exclude inactive communities",
);
assert.match(
  billing,
  /canManageFunding = community\.lifecycle_status === "active"[\s\S]*!canManageFunding \|\| isOperatorComped/,
  "inactive billing rows must expose no funding action",
);
assert.match(
  controller,
  /fundingAttentionCommunities:[\s\S]*community\.lifecycle_status === "active"/,
  "inactive communities must not trigger active funding attention",
);
assert.match(
  lifecycleContract,
  /Restore eligibility is derived[\s\S]*grants no mutation authority[\s\S]*immediate restore command independently[\s\S]*re-reads lifecycle generation/,
  "the lifecycle contract must distinguish presentation eligibility from restore authority",
);
assert.match(
  lifecycleOperations + ownerFunding,
  /restoreCommunityImmediatelyCore[\s\S]*resolveCommunityImmediateRestoreFundingAuthority[\s\S]*community_restore_checkout_pending[\s\S]*community_restore_founder_subscription_conflict/,
  "restore execution must independently reject managed checkout and subscription drift",
);

console.log("community_restore_eligibility_contract_proof: ok");
