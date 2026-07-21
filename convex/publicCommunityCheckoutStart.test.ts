import { describe, expect, test, vi } from "vitest";

import {
  buildPublicCommunityCheckoutStripeIdempotencyKey,
  executePublicCommunityCheckoutProviderStart,
  requirePublicCommunityCheckoutAttemptBinding,
  requirePublicCommunityCheckoutMayStart,
  requirePublicCommunityCheckoutProviderAttachment,
  requireUniquePublicCommunityCheckoutAttempt,
  type ProviderCheckoutSessionSnapshot,
  type PublicCommunityCheckoutAttemptSnapshot,
} from "./communityCheckoutStartCore";
import {
  requirePublicCommunityCheckoutStartResult,
  type PublicCommunityCheckoutStartResult,
} from "../shared/cloudPublicFunnelGateway";
import {
  executePublicCommunityCheckoutStartAction,
  isPublicCommunityCheckoutStartSnapshotCurrent,
} from "../apps/web/src/publicCommunityCheckoutStartAction";

const NOW_MS = Date.UTC(2026, 6, 21, 16, 0, 0);

function attempt(
  overrides: Partial<PublicCommunityCheckoutAttemptSnapshot> = {},
): PublicCommunityCheckoutAttemptSnapshot {
  return {
    ownerUserId: "user_1",
    communityId: "community_1",
    communitySlug: "polynet",
    billingPeriod: "monthly",
    checkoutAttemptId: "checkout_12345678901234567890",
    successUrl: "https://polynet-staging.vercel.app/checkout/success?session_id=chk_1",
    cancelUrl: "https://polynet-staging.vercel.app/c/polynet",
    sessionId: "chk_1",
    claimToken: "claim_1",
    pricePointId: "price_point_1",
    providerPriceId: "price_1",
    providerCustomerId: "cus_1",
    providerDestinationAccountId: "acct_1",
    platformFeeBps: 1000,
    checkoutAttemptExpiresAt: NOW_MS + 60 * 60 * 1000,
    status: "pending",
    providerCheckoutSessionId: null,
    ...overrides,
  };
}

function providerSession(
  overrides: Partial<ProviderCheckoutSessionSnapshot> = {},
): ProviderCheckoutSessionSnapshot {
  return {
    id: "cs_test_1",
    url: "https://checkout.stripe.com/c/pay/test",
    status: "open",
    expiresAtMs: NOW_MS + 60 * 60 * 1000,
    clientReferenceId: "chk_1",
    localSessionId: "chk_1",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("public community checkout reservation identity", () => {
  test("accepts one exact attempt and fails closed on duplicate rows", () => {
    const row = attempt();
    expect(requireUniquePublicCommunityCheckoutAttempt([row])).toBe(row);
    expect(requireUniquePublicCommunityCheckoutAttempt([])).toBeNull();
    expect(() => requireUniquePublicCommunityCheckoutAttempt([row, row])).toThrow(
      "checkout_attempt_duplicate_rows",
    );
  });

  test("cannot reuse an attempt across community, plan, subject, or return URL", () => {
    const row = attempt();
    for (const requested of [
      { ...row, ownerUserId: "user_2" },
      { ...row, communitySlug: "other" },
      { ...row, billingPeriod: "annual" as const },
      { ...row, cancelUrl: "https://polynet-staging.vercel.app/c/other" },
    ]) {
      expect(() =>
        requirePublicCommunityCheckoutAttemptBinding({
          attempt: row,
          requested,
        }),
      ).toThrow("checkout_attempt_binding_conflict");
    }
  });

  test("derives one stable provider idempotency key from the local session", () => {
    expect(buildPublicCommunityCheckoutStripeIdempotencyKey("chk_1")).toBe(
      "community_checkout:chk_1",
    );
  });

  test("blocks already-active access before another checkout can start", () => {
    expect(() => requirePublicCommunityCheckoutMayStart({ active: true })).toThrow(
      "community_access_already_active",
    );
    expect(() => requirePublicCommunityCheckoutMayStart({ active: false })).not.toThrow();
    expect(() => requirePublicCommunityCheckoutMayStart(null)).not.toThrow();
  });

  test("provider attachment is idempotent but expectation locked", () => {
    expect(
      requirePublicCommunityCheckoutProviderAttachment({
        currentProviderSessionId: "cs_test_1",
        requestedProviderSessionId: "cs_test_1",
        belongsToAnotherCheckout: false,
      }),
    ).toBe("cs_test_1");
    expect(() =>
      requirePublicCommunityCheckoutProviderAttachment({
        currentProviderSessionId: "cs_test_1",
        requestedProviderSessionId: "cs_test_2",
        belongsToAnotherCheckout: false,
      }),
    ).toThrow("checkout_provider_session_conflict");
    expect(() =>
      requirePublicCommunityCheckoutProviderAttachment({
        currentProviderSessionId: null,
        requestedProviderSessionId: "cs_test_1",
        belongsToAnotherCheckout: true,
      }),
    ).toThrow("checkout_provider_session_conflict");
  });
});

describe("public community checkout provider executor", () => {
  test("concurrent duplicate starts converge on one provider object", async () => {
    const providerObjects = new Map<string, ProviderCheckoutSessionSnapshot>();
    const createProvider = vi.fn(async (idempotencyKey: string) => {
      const current = providerObjects.get(idempotencyKey);
      if (current) return current;
      const created = providerSession();
      providerObjects.set(idempotencyKey, created);
      return created;
    });
    const attach = vi.fn(async () => {});
    await Promise.all([
      executePublicCommunityCheckoutProviderStart({
        attempt: attempt(),
        nowMs: NOW_MS,
        retrieveProviderSession: async () => providerSession(),
        createProviderSession: createProvider,
        attachProviderSession: attach,
      }),
      executePublicCommunityCheckoutProviderStart({
        attempt: attempt(),
        nowMs: NOW_MS,
        retrieveProviderSession: async () => providerSession(),
        createProviderSession: createProvider,
        attachProviderSession: attach,
      }),
    ]);
    expect(providerObjects.size).toBe(1);
    expect(new Set(createProvider.mock.calls.map(([key]) => key))).toEqual(
      new Set(["community_checkout:chk_1"]),
    );
  });

  test("an ambiguous attachment failure recovers the same provider object", async () => {
    const providerObjects = new Map<string, ProviderCheckoutSessionSnapshot>();
    const createProvider = async (idempotencyKey: string) => {
      const current = providerObjects.get(idempotencyKey);
      if (current) return current;
      const created = providerSession();
      providerObjects.set(idempotencyKey, created);
      return created;
    };
    await expect(
      executePublicCommunityCheckoutProviderStart({
        attempt: attempt(),
        nowMs: NOW_MS,
        retrieveProviderSession: async () => providerSession(),
        createProviderSession: createProvider,
        attachProviderSession: async () => {
          throw new Error("network_lost_after_commit");
        },
      }),
    ).rejects.toThrow("network_lost_after_commit");
    const recovered = await executePublicCommunityCheckoutProviderStart({
      attempt: attempt(),
      nowMs: NOW_MS,
      retrieveProviderSession: async () => providerSession(),
      createProviderSession: createProvider,
      attachProviderSession: async () => {},
    });
    expect(recovered.providerSessionId).toBe("cs_test_1");
    expect(providerObjects.size).toBe(1);
  });

  test("an attached attempt retrieves instead of creating", async () => {
    const createProvider = vi.fn(async () => providerSession());
    const retrieveProvider = vi.fn(async () => providerSession());
    await executePublicCommunityCheckoutProviderStart({
      attempt: attempt({ providerCheckoutSessionId: "cs_test_1" }),
      nowMs: NOW_MS,
      retrieveProviderSession: retrieveProvider,
      createProviderSession: createProvider,
      attachProviderSession: async () => {},
    });
    expect(retrieveProvider).toHaveBeenCalledWith("cs_test_1");
    expect(createProvider).not.toHaveBeenCalled();
  });

  test("expired, completed, and mismatched provider sessions fail closed", async () => {
    for (const session of [
      providerSession({ status: "expired" }),
      providerSession({ status: "complete" }),
      providerSession({ localSessionId: "chk_other" }),
    ]) {
      await expect(
        executePublicCommunityCheckoutProviderStart({
          attempt: attempt({ providerCheckoutSessionId: session.id }),
          nowMs: NOW_MS,
          retrieveProviderSession: async () => session,
          createProviderSession: async () => session,
          attachProviderSession: async () => {},
        }),
      ).rejects.toThrow();
    }
  });

  test("does not begin a provider create inside the final thirty-minute window", async () => {
    const createProvider = vi.fn(async () => providerSession());
    await expect(
      executePublicCommunityCheckoutProviderStart({
        attempt: attempt({ checkoutAttemptExpiresAt: NOW_MS + 29 * 60 * 1000 }),
        nowMs: NOW_MS,
        retrieveProviderSession: async () => providerSession(),
        createProviderSession: createProvider,
        attachProviderSession: async () => {},
      }),
    ).rejects.toThrow("checkout_attempt_expired");
    expect(createProvider).not.toHaveBeenCalled();
  });
});

describe("public community checkout browser boundary", () => {
  test("strictly accepts only the matching Stripe checkout response", () => {
    const valid = {
      checkout_attempt_id: "checkout_12345678901234567890",
      session_id: "chk_1",
      checkout_url: "https://checkout.stripe.com/c/pay/test",
    };
    expect(
      requirePublicCommunityCheckoutStartResult(
        valid,
        "checkout_12345678901234567890",
      ),
    ).toEqual(valid);
    for (const malformed of [
      null,
      { ...valid, checkout_attempt_id: "checkout_other_1234567890" },
      { ...valid, session_id: "" },
      { ...valid, checkout_url: "https://evil.example/checkout" },
    ]) {
      expect(() =>
        requirePublicCommunityCheckoutStartResult(
          malformed,
          "checkout_12345678901234567890",
        ),
      ).toThrow("community_checkout_start_contract_invalid");
    }
  });

  test("a stale response cannot redirect or write an error", async () => {
    let current = true;
    const navigate = vi.fn();
    const setError = vi.fn();
    const response = Promise.resolve<PublicCommunityCheckoutStartResult>({
      checkout_attempt_id: "checkout_12345678901234567890",
      session_id: "chk_1",
      checkout_url: "https://checkout.stripe.com/c/pay/test",
    });
    current = false;
    const result = await executePublicCommunityCheckoutStartAction({
      runCheckout: () => response,
      isCurrent: () => current,
      navigateToUrl: navigate,
      setError,
      getErrorMessage: (error) => String(error),
    });
    expect(result).toEqual({ outcome: "stale" });
    expect(navigate).not.toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
  });

  test("one current result performs exactly one redirect", async () => {
    const navigate = vi.fn();
    const setError = vi.fn();
    const result = await executePublicCommunityCheckoutStartAction({
      runCheckout: async () => ({
        checkout_attempt_id: "checkout_12345678901234567890",
        session_id: "chk_1",
        checkout_url: "https://checkout.stripe.com/c/pay/test",
      }),
      isCurrent: () => true,
      navigateToUrl: navigate,
      setError,
      getErrorMessage: (error) => String(error),
    });
    expect(result).toEqual({ outcome: "redirected" });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/test");
  });

  test("reordered browser responses allow only the newest operation to redirect", async () => {
    let generation = 1;
    const first = deferred<PublicCommunityCheckoutStartResult>();
    const second = deferred<PublicCommunityCheckoutStartResult>();
    const firstNavigate = vi.fn();
    const secondNavigate = vi.fn();
    const firstExecution = executePublicCommunityCheckoutStartAction({
      runCheckout: () => first.promise,
      isCurrent: () => generation === 1,
      navigateToUrl: firstNavigate,
      setError: vi.fn(),
      getErrorMessage: (error) => String(error),
    });
    generation = 2;
    const secondExecution = executePublicCommunityCheckoutStartAction({
      runCheckout: () => second.promise,
      isCurrent: () => generation === 2,
      navigateToUrl: secondNavigate,
      setError: vi.fn(),
      getErrorMessage: (error) => String(error),
    });
    second.resolve({
      checkout_attempt_id: "checkout_22345678901234567890",
      session_id: "chk_2",
      checkout_url: "https://checkout.stripe.com/c/pay/second",
    });
    await secondExecution;
    first.resolve({
      checkout_attempt_id: "checkout_12345678901234567890",
      session_id: "chk_1",
      checkout_url: "https://checkout.stripe.com/c/pay/first",
    });
    await firstExecution;
    expect(secondNavigate).toHaveBeenCalledTimes(1);
    expect(firstNavigate).not.toHaveBeenCalled();
  });

  test("route, plan, subject, and generation jointly own the response", () => {
    const snapshot = {
      generation: 3,
      communitySlug: "polynet",
      billingPeriod: "monthly" as const,
      authSubject: "user_1",
      routeAuthority: "standard:community_funnel:polynet",
      checkoutAttemptId: "checkout_12345678901234567890",
    };
    expect(
      isPublicCommunityCheckoutStartSnapshotCurrent({
        snapshot,
        current: {
          generation: 3,
          communitySlug: "PoLyNeT",
          billingPeriod: "monthly",
          authSubject: "user_1",
          routeAuthority: "standard:community_funnel:polynet",
        },
      }),
    ).toBe(true);
    for (const current of [
      { generation: 4, communitySlug: "polynet", billingPeriod: "monthly" as const, authSubject: "user_1", routeAuthority: "standard:community_funnel:polynet" },
      { generation: 3, communitySlug: "other", billingPeriod: "monthly" as const, authSubject: "user_1", routeAuthority: "standard:community_funnel:polynet" },
      { generation: 3, communitySlug: "polynet", billingPeriod: "annual" as const, authSubject: "user_1", routeAuthority: "standard:community_funnel:polynet" },
      { generation: 3, communitySlug: "polynet", billingPeriod: "monthly" as const, authSubject: "user_2", routeAuthority: "standard:community_funnel:polynet" },
      { generation: 3, communitySlug: "polynet", billingPeriod: "monthly" as const, authSubject: "user_1", routeAuthority: "standard:community_funnel_preview:polynet" },
    ]) {
      expect(
        isPublicCommunityCheckoutStartSnapshotCurrent({ snapshot, current }),
      ).toBe(false);
    }
  });
});
