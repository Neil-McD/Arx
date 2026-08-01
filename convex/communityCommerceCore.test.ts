import { describe, expect, it } from "vitest";
import { requireCommunityProviderAccountMatch } from "./communityCommerceCore";
import {
  stripeSecretKeyExpectsLiveMode,
  stripeWebhookScopeMatchesEvent,
} from "./stripeCore";

describe("community connected-account identity", () => {
  it("returns the normalized account when webhook and local truth agree", () => {
    expect(requireCommunityProviderAccountMatch({
      expectedProviderAccountId: " acct_founder ",
      actualProviderAccountId: "acct_founder",
      missingCode: "account_required",
      mismatchCode: "account_mismatch",
    })).toBe("acct_founder");
  });

  it("fails closed when the provider event has no connected account", () => {
    expect(() => requireCommunityProviderAccountMatch({
      expectedProviderAccountId: "acct_founder",
      actualProviderAccountId: null,
      missingCode: "account_required",
      mismatchCode: "account_mismatch",
    })).toThrowError("account_required");
  });

  it("fails closed when the provider event belongs to another account", () => {
    expect(() => requireCommunityProviderAccountMatch({
      expectedProviderAccountId: "acct_founder",
      actualProviderAccountId: "acct_attacker",
      missingCode: "account_required",
      mismatchCode: "account_mismatch",
    })).toThrowError("account_mismatch");
  });
});

describe("Stripe webhook scope", () => {
  it("accepts platform events only under the account secret", () => {
    expect(stripeWebhookScopeMatchesEvent("account", { account: undefined })).toBe(true);
    expect(stripeWebhookScopeMatchesEvent("connect", { account: undefined })).toBe(false);
  });

  it("accepts connected events only under the Connect secret", () => {
    expect(stripeWebhookScopeMatchesEvent("connect", { account: "acct_founder" })).toBe(true);
    expect(stripeWebhookScopeMatchesEvent("account", { account: "acct_founder" })).toBe(false);
  });

  it("derives webhook live mode from the Stripe credential without guessing", () => {
    expect(stripeSecretKeyExpectsLiveMode("sk_live_example")).toBe(true);
    expect(stripeSecretKeyExpectsLiveMode("rk_test_example")).toBe(false);
    expect(stripeSecretKeyExpectsLiveMode("invalid_example")).toBeNull();
  });
});
