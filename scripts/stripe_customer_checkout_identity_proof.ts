import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readText(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const schema = readText("../convex/schema.ts");
const stripeCustomers = readText("../convex/stripeCustomers.ts");
const workspaceCredits = readText("../convex/workspaceCredits.ts");
const communityCommerce = readText("../convex/communityCommerce.ts");
const billingCore = readText("../convex/billingCore.ts");

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
  ["workspace credit top-up", workspaceCredits],
  ["community checkout", communityCommerce],
] as const) {
  assert.match(
    source,
    /ensureStripeCustomerForUser\(/,
    `${label} must ensure a reusable Stripe customer before Checkout.`,
  );
  assert.match(
    source,
    /checkout\.sessions\.create\(\{[\s\S]*customer: stripeCustomerId/,
    `${label} Checkout must pass the Stripe customer id.`,
  );
  assert.doesNotMatch(
    source,
    /customer_email:/,
    `${label} must not rely on customer_email as identity.`,
  );
}

assert.match(
  workspaceCredits,
  /attachStripeCustomerToUser\({[\s\S]*providerCustomerId: args\.providerCustomerId/,
  "Workspace top-up completion must backfill Stripe customer identity.",
);
assert.match(
  communityCommerce,
  /attachStripeCustomerToUser\({[\s\S]*providerCustomerId: args\.providerCustomerId/,
  "Community checkout/subscription sync must backfill Stripe customer identity.",
);
assert.match(
  billingCore,
  /attachStripeCustomerToUser\({[\s\S]*providerCustomerId: args\.providerCustomerId/,
  "Claim redemption subscription creation must preserve Stripe customer identity.",
);

console.log("stripe_customer_checkout_identity_proof: ok");
