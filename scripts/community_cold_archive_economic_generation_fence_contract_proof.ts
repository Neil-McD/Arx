import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const lifecycle = read("shared/communityLifecycle.ts");
const schema = read("convex/schema.ts");
const commerce = read("convex/communityCommerce.ts");
const billing = read("convex/billingCore.ts");
const founder = read("convex/founderBilling.ts");

assert.match(
  lifecycle,
  /export function communityLifecycleGenerationMatches\([\s\S]*normalizeCommunityLifecycle\(fields\)\.generation ===[\s\S]*normalizeCommunityLifecycleGeneration\(expectedGeneration\)/,
  "one canonical pure helper must compare lifecycle generations",
);
assert.match(
  schema,
  /checkoutSessions: defineTable\(\{[\s\S]*communityLifecycleGeneration: v\.optional\(v\.number\(\)\)/,
  "checkout sessions must carry the economic generation",
);
assert.match(
  commerce,
  /resolvePublicCommunityCheckoutConfigInternal[\s\S]*lifecycle\.status !== "active"[\s\S]*communityLifecycleGeneration: lifecycle\.generation/,
  "member checkout configuration must be active-only and generation-bound",
);
assert.match(
  commerce,
  /createPendingPublicCommunityCheckoutSessionInternal[\s\S]*communityLifecycleGenerationMatches\([\s\S]*args\.communityLifecycleGeneration[\s\S]*communityLifecycleGeneration: args\.communityLifecycleGeneration/,
  "member checkout persistence must atomically recheck and store the generation",
);
assert.match(
  billing,
  /redeemClaimRow[\s\S]*communityIsActive\(community\)[\s\S]*communityLifecycleGenerationMatches\([\s\S]*checkoutSession\?\.communityLifecycleGeneration[\s\S]*ensureCommunityMembership/,
  "claim redemption must fence the final membership grant",
);
assert.match(
  commerce,
  /syncPendingCommunityCheckoutSubscriptionInternal[\s\S]*const lifecycleMatches[\s\S]*status: lifecycleMatches[\s\S]*: "expired"/,
  "stale member webhooks must not complete checkout sessions",
);
assert.match(
  founder,
  /createPendingFounderSubscriptionCheckoutInternal[\s\S]*communityLifecycleGeneration: lifecycle\.generation/,
  "founder checkout creation must capture the generation",
);
assert.match(
  founder,
  /syncFounderSubscription[\s\S]*communityLifecycleGenerationMatches\([\s\S]*checkout\.communityLifecycleGeneration[\s\S]*checkout = null/,
  "stale founder checkouts must lose authority before subscription creation",
);

for (const forbidden of [
  "archiveRequestedAt",
  "archiveEffectiveAt",
  "communityLifecycleOperations",
  "restoreCheckoutGeneration",
]) {
  assert.equal(
    [lifecycle, commerce, billing, founder].some((source) => source.includes(forbidden)),
    false,
    `economic generation fence must not introduce ${forbidden}`,
  );
}

console.log("community cold archive economic generation fence contract proof passed");
