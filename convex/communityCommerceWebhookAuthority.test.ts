import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const httpBilling = readFileSync(new URL("./httpBilling.ts", import.meta.url), "utf8");
const communityCommerce = readFileSync(
  new URL("./communityCommerce.ts", import.meta.url),
  "utf8",
);
const schema = readFileSync(new URL("./schema.ts", import.meta.url), "utf8");
const recovery = readFileSync(
  new URL("./communitySubscriptionRecovery.ts", import.meta.url),
  "utf8",
);
const crons = readFileSync(new URL("./crons.ts", import.meta.url), "utf8");

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
    expect(receiptTable).toContain("deleteAfter");
    expect(receiptTable).not.toContain("attemptCount");
    expect(receiptTable).not.toMatch(/payload|metadata|body|content|email|userId/);
    expect(communityCommerce).toContain("COMMUNITY_COMMERCE_EVENT_EFFECT_RETENTION_MS");
    expect(communityCommerce).toContain("pruneCommunityCommerceEventEffectsInternal");
  });

  test("community subscription recovery is identity-only, leased, bounded, and wired", () => {
    const recoveryTable = schema.match(
      /communitySubscriptionEventRecoveries: defineTable\(\{[\s\S]*?\.index\("by_status_deleteAfter", \["status", "deleteAfter"\]\)/,
    )?.[0] ?? "";
    expect(recoveryTable).toContain("by_provider_account_event");
    expect(recoveryTable).toContain("by_status_nextAttemptAt");
    expect(recoveryTable).toContain("by_status_leaseExpiresAt");
    expect(recoveryTable).toContain("by_status_deleteAfter");
    expect(recoveryTable).toContain("leaseToken");
    expect(recoveryTable).not.toMatch(/payload|metadata|body|content|email|customerId|userId/);
    expect(httpBilling).toContain("hasRecoverableCommunitySubscriptionAuthority");
    expect(httpBilling).toContain("processCommunitySubscriptionEventWithRecovery");
    expect(httpBilling).toContain("beginCommunitySubscriptionEventRecoveryInternal");
    expect(httpBilling).toContain("failCommunitySubscriptionEventRecoveryInternal");
    expect(httpBilling).toMatch(
      /"acknowledgedOnly" in communityResult[\s\S]*?communityResult\.acknowledgedOnly[\s\S]*?return processedResponse\([\s\S]*?"stripe_webhook_recovery_accepted"/,
    );
    expect(recovery).toContain("validateRecoveredCommunitySubscriptionEvent");
    expect(recovery).toContain("community_subscription_recovery_stale_lease");
    expect(crons).toContain("recover community subscription events");
  });
});
