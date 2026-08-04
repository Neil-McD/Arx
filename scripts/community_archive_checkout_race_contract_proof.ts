import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const lifecycleCore = read("convex/communityLifecycleCore.ts");
const communityCommerce = read("convex/communityCommerce.ts");
const founderBilling = read("convex/founderBilling.ts");
const checkoutEffects = read("convex/stripeCheckoutEffectCore.ts");
const webhook = read("convex/httpBilling.ts");
const contract = read("docs/community-lifecycle-contract-v1.md");

assert.match(
  lifecycleCore,
  /communityAcceptsNewOperationsAtGeneration[\s\S]*if \(!args\.community\) return false[\s\S]*communityAcceptsNewOperations[\s\S]*lifecycleGeneration/,
  "one fail-closed helper must own lifecycle status and generation admission",
);

assert.match(
  checkoutEffects,
  /applyStripeCheckoutSessionExpiration[\s\S]*stripeProviderOptions\(args\.identity\.accountScope\)[\s\S]*checkout\.sessions\.retrieve[\s\S]*checkout\.sessions\.expire/,
  "checkout retrieval and expiration must share the exact account scope",
);
assert.match(
  checkoutEffects,
  /checkout\.state !== "completed"[\s\S]*providerSubscriptionId[\s\S]*applyStripeSubscriptionEffect[\s\S]*intent: "cancel_now"/,
  "a completed stale checkout must compensate by canceling its subscription",
);

assert.match(
  communityCommerce,
  /attachCommunityStripeCheckoutSessionInternal[\s\S]*communityAcceptsNewOperationsAtGeneration[\s\S]*quarantineCommunityCheckoutRow/,
  "community checkout identity must be persisted and quarantined if archive wins the attach race",
);
assert.match(
  communityCommerce,
  /syncPendingCommunityCheckoutSubscriptionInternal[\s\S]*communityAcceptsNewOperationsAtGeneration[\s\S]*quarantineCommunityCheckoutRow/,
  "community completion must recheck lifecycle in the mutation transaction",
);
assert.doesNotMatch(
  communityCommerce.match(/async function quarantineCommunityCheckoutRow[\s\S]*?\n}/)?.[0] ?? "",
  /communitySubscriptionStatus:\s*"canceled"/,
  "local quarantine must not invent provider cancellation state",
);

assert.match(
  founderBilling,
  /syncFounderSubscription[\s\S]*checkout &&[\s\S]*!existing[\s\S]*communityAcceptsNewOperationsAtGeneration[\s\S]*quarantineFounderCheckoutRow/,
  "founder completion must quarantine only a new stale checkout, while preserving existing subscription updates",
);
assert.match(
  founderBilling,
  /quarantineFounderCheckoutRow[\s\S]*status: "expired"/,
  "founder stale checkout identity must remain durable and locally non-redeemable",
);

assert.match(
  webhook,
  /cancelStaleCheckoutSubscription[\s\S]*applyStripeSubscriptionEffect[\s\S]*intent: "cancel_now"[\s\S]*stripeSubscriptionEffectIsTerminal/,
  "webhook compensation must be exact-scope, idempotent, and terminally verified",
);
assert.match(
  webhook,
  /result\?\.quarantined === true[\s\S]*cancelStaleCheckoutSubscription/,
  "provider cancellation must follow durable quarantine evidence",
);
assert.match(
  webhook,
  /checkout\.session\.async_payment_succeeded[\s\S]*getCommunityJoinCheckoutSessionInternal/,
  "delayed community checkout completion must use the same lifecycle boundary",
);

assert.match(contract, /checkout completion rechecks lifecycle inside the persistence transaction/);
assert.match(contract, /never fabricates a local provider-canceled\s+status/);

console.log("community_archive_checkout_race_contract_proof: ok");
