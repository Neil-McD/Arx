import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const httpBilling = readFileSync(new URL("./httpBilling.ts", import.meta.url), "utf8");
const communityCommerce = readFileSync(
  new URL("./communityCommerce.ts", import.meta.url),
  "utf8",
);
const schema = readFileSync(new URL("./schema.ts", import.meta.url), "utf8");

describe("community commerce webhook authority wiring", () => {
  test("refund access uses current cumulative charge truth before one access mutation", () => {
    expect(httpBilling).toMatch(
      /const charge = await retrieveStripeChargeForEvidence[\s\S]*?if \(!charge\) throw new Error\("stripe_refund_charge_current_truth_missing"\)[\s\S]*?syncCommunityAccessForCurrentRefund/,
    );
    expect(httpBilling).toMatch(
      /currentChargeRequiresRefundAccessBlock[\s\S]*?applyCommunitySubscriptionAccessEventInternal/,
    );
    expect(httpBilling).not.toContain("stripeRefundFullyRefundsCharge");
  });

  test("dispute access re-reads both dispute and charge and rejects missing provider truth", () => {
    expect(httpBilling).toMatch(
      /retrieveStripeDisputeForEvidence[\s\S]*?stripe_dispute_current_truth_missing[\s\S]*?retrieveStripeChargeForEvidence[\s\S]*?stripe_dispute_charge_current_truth_missing[\s\S]*?syncCommunityAccessForCurrentDispute/,
    );
    expect(httpBilling).toMatch(
      /currentDisputeAccessBlock[\s\S]*?applyCommunitySubscriptionAccessEventInternal/,
    );
  });

  test("provider failures precede the atomic local access effect", () => {
    expect(httpBilling).toMatch(
      /if \(stripeResourceMissing\(error\)\) return null;\s*throw error;/,
    );
    expect(communityCommerce).toMatch(
      /applyCommunitySubscriptionAccessBlock[\s\S]*?syncCommunitySubscriptionLifecycleCore/,
    );
    expect(communityCommerce).toMatch(
      /syncCommunitySubscriptionLifecycleCore[\s\S]*?recordCommunityAccessEventEffect/,
    );
    expect(httpBilling).not.toContain("preserveRiskRevocation");
  });

  test("receipt storage is identity-only, indexed, and retention-bounded", () => {
    const receiptTable = schema.match(
      /communityCommerceEventEffects: defineTable\(\{[\s\S]*?\.index\("by_deleteAfter", \["deleteAfter"\]\)/,
    )?.[0] ?? "";
    expect(receiptTable).toContain("by_provider_account_event_effect");
    expect(receiptTable).toContain("attemptCount");
    expect(receiptTable).toContain("deleteAfter");
    expect(receiptTable).not.toMatch(/payload|metadata|body|content|email|userId/);
    expect(communityCommerce).toContain("COMMUNITY_COMMERCE_EVENT_EFFECT_RETENTION_MS");
    expect(communityCommerce).toContain("pruneCommunityCommerceEventEffectsInternal");
  });
});
