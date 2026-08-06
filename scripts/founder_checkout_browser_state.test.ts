import { describe, expect, it } from "vitest";

import {
  attachFounderCheckoutSession,
  buildFounderCheckoutReturnUrls,
  createPendingFounderCheckout,
  normalizePendingFounderCheckout,
  parseFounderCheckoutReturn,
  pendingFounderCheckoutMatchesSession,
  readPendingFounderCheckout,
  recoverPendingFounderCheckout,
  resolveFounderCheckoutStartReceipt,
  runWithFounderCheckoutStartLock,
  storePendingFounderCheckout,
} from "../shared/founderCheckoutBrowserState";

describe("founder checkout browser state", () => {
  it("creates an expiring non-authoritative checkout receipt", () => {
    const receipt = createPendingFounderCheckout({
      nowMs: 1_000,
      checkoutAttemptId: "attempt-1",
      claimToken: "claim-1",
    });
    expect(receipt).toMatchObject({
      v: 1,
      checkout_attempt_id: "attempt-1",
      claim_token: "claim-1",
      session_id: null,
      created_at_ms: 1_000,
    });
    expect(normalizePendingFounderCheckout(receipt, 2_000)).toEqual(receipt);
    expect(normalizePendingFounderCheckout(receipt, receipt.expires_at_ms)).toBeNull();
  });

  it("attaches Stripe session identity without changing the claim", () => {
    const receipt = createPendingFounderCheckout({
      nowMs: 1_000,
      checkoutAttemptId: "attempt-1",
      claimToken: "claim-1",
    });
    expect(attachFounderCheckoutSession(receipt, "cs_test_123")).toMatchObject({
      checkout_attempt_id: "attempt-1",
      claim_token: "claim-1",
      session_id: "cs_test_123",
    });
  });

  it("supports verified-email recovery with only a session id", () => {
    expect(recoverPendingFounderCheckout({ sessionId: "cs_test_recover", nowMs: 2_000 })).toMatchObject({
      checkout_attempt_id: null,
      claim_token: null,
      session_id: "cs_test_recover",
    });
  });

  it("parses only the dedicated founder return contract", () => {
    expect(parseFounderCheckoutReturn("?founder_checkout=success&session_id=cs_123")).toEqual({
      kind: "success",
      session_id: "cs_123",
    });
    expect(parseFounderCheckoutReturn("?founder_checkout=recover&session_id=cs_456")).toEqual({
      kind: "recover",
      session_id: "cs_456",
    });
    expect(parseFounderCheckoutReturn("?session_id=member_checkout")).toBeNull();
  });

  it("fences checkout returns to the stored Stripe session", () => {
    const pending = attachFounderCheckoutSession(
      createPendingFounderCheckout({
        nowMs: 1_000,
        checkoutAttemptId: "attempt-1",
        claimToken: "claim-1",
      }),
      "cs_current",
    );
    expect(pendingFounderCheckoutMatchesSession(pending, "cs_current")).toBe(true);
    expect(pendingFounderCheckoutMatchesSession(pending, "cs_stale")).toBe(false);
    expect(pendingFounderCheckoutMatchesSession(pending, null)).toBe(false);
  });

  it("reuses the stored attempt rather than minting a replacement", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    const pending = createPendingFounderCheckout({
      nowMs: 1_000,
      checkoutAttemptId: "attempt-existing",
      claimToken: "claim-existing",
    });
    storePendingFounderCheckout(pending, storage);
    const stored = readPendingFounderCheckout(2_000, storage);
    expect(resolveFounderCheckoutStartReceipt(stored)).toEqual(pending);
    expect(resolveFounderCheckoutStartReceipt(stored)?.checkout_attempt_id).toBe("attempt-existing");
  });

  it("does not replace a verified-email recovery receipt", () => {
    const recovery = recoverPendingFounderCheckout({
      sessionId: "cs_test_recover",
      nowMs: 2_000,
    });
    expect(resolveFounderCheckoutStartReceipt(recovery)).toBeNull();
  });

  it("executes the checkout lock fallback exactly once", async () => {
    let calls = 0;
    await expect(runWithFounderCheckoutStartLock(async () => {
      calls += 1;
      return "ok";
    })).resolves.toBe("ok");
    expect(calls).toBe(1);
  });

  it("keeps the Stripe checkout placeholder literal", () => {
    expect(buildFounderCheckoutReturnUrls("https://polynet.test/path")).toEqual({
      successUrl: "https://polynet.test/?founder_checkout=success&session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "https://polynet.test/?founder_checkout=canceled&session_id={CHECKOUT_SESSION_ID}",
    });
  });
});
