import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readText(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const schema = readText("../convex/schema.ts");
const stripeCustomers = readText("../convex/stripeCustomers.ts");
const communityCommerce = readText("../convex/communityCommerce.ts");
const billingCore = readText("../convex/billingCore.ts");
const founderBilling = readText("../convex/founderBilling.ts");

assert.match(
  schema,
  /userStripeCustomers:\s*defineTable\(/,
  "Stripe customers must have canonical user-owned state.",
);
assert.match(
  schema,
  /\.index\("by_user", \["userId"\]\)[\s\S]*\.index\("by_providerCustomerId", \["providerCustomerId"\]\)/,
  "Stripe customer state must be indexed by user and provider customer id.",
);

assert.match(
  stripeCustomers,
  /export async function ensureStripeCustomerForUser/,
  "Checkout must use a reusable Stripe customer helper.",
);
assert.match(
  stripeCustomers,
  /stripe\.customers\.retrieve/,
  "Reusable Stripe customer helper must validate existing provider customers.",
);
assert.match(
  stripeCustomers,
  /stripe\.customers\.create\(/,
  "Reusable Stripe customer helper must create a Stripe Customer when missing.",
);
assert.match(
  stripeCustomers,
  /metadata:\s*{[\s\S]*user_id: String\(userId\)/,
  "Created Stripe customers must preserve Polynet user identity in Stripe metadata.",
);
assert.match(
  stripeCustomers,
  /idempotencyKey: `polynet-user-stripe-customer:\${String\(userId\)}`/,
  "Stripe customer creation must be idempotent per Polynet user to avoid duplicate first-checkout customers.",
);
assert.match(
  stripeCustomers,
  /throw new Error\("stripe_customer_user_conflict"\)/,
  "Provider customer ids must not silently move across Polynet users.",
);
assert.match(
  stripeCustomers,
  /args\.replaceExisting !== true[\s\S]*return existingByUser/,
  "Webhook backfills must not replace an existing canonical customer unless the ensure flow explicitly allows replacement.",
);
assert.match(
  stripeCustomers,
  /replaceExisting: true/,
  "The ensure flow must be able to replace stale or deleted Stripe customer ids deliberately.",
);

for (const [label, source] of [
  // Workspace credit top-ups are retired; founder subscription checkout is the live path.
  ["founder subscription", founderBilling],
] as const) {
  assert.match(
    source,
    /ensureStripeCustomerForUser\(/,
    `${label} must ensure a reusable Stripe customer before Checkout.`,
  );
  assert.match(
    source,
    /checkout\.sessions\.create\(\{[\s\S]*customer: providerCustomerId/,
    `${label} Checkout must pass the Stripe customer id.`,
  );
  assert.doesNotMatch(
    source,
    /customer_email:/,
    `${label} must not rely on customer_email as identity.`,
  );
}

assert.match(
  communityCommerce,
  /ensureCommunityStripeCustomerForUser\(/,
  "Community checkout must ensure a reusable customer within the founder connected account.",
);
assert.match(
  communityCommerce,
  /checkout\.sessions\.create\(\{[\s\S]*customer: stripeCustomerId[\s\S]*stripeAccount: checkoutConfig\.providerAccountId/,
  "Community Checkout must bind customer identity and request scope to the same connected account.",
);
assert.match(
  schema,
  /communityStripeCustomers: defineTable\(\{[\s\S]*providerAccountId: v\.string\(\)[\s\S]*providerCustomerId: v\.string\(\)/,
  "Connected-account community customers must not share the platform customer namespace.",
);

assert.match(
  founderBilling,
  /attachStripeCustomerToUser\(\{/,
  "Founder checkout completion must backfill Stripe customer identity.",
);
assert.doesNotMatch(
  communityCommerce,
  /attachStripeCustomerToUser|ensureStripeCustomerForUser/,
  "Community commerce must not write connected-account customer ids into the platform customer table.",
);
assert.doesNotMatch(
  billingCore,
  /attachStripeCustomerToUser/,
  "Claim redemption must preserve connected-account customer isolation.",
);

console.log("stripe_customer_checkout_identity_proof: ok");
