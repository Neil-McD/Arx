import { describe, expect, test, vi } from "vitest";

import {
  executePublicCommunityCancelAction,
  executePublicCommunityJoinAction,
  type ReconciledAdmission,
} from "../apps/web/src/publicCommunityAdmissionAction";
import {
  classifyPublicCommunityJoinError,
  getErrorMessage,
  requirePublicCommunityJoinResult,
  type PublicCommunityJoinResult,
} from "../shared/publicCommunityJoin";
import { parsePublicCommunityFunnelRoutePath } from "../shared/webAppRouteState";

type Access = { community_id: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createJoinHarness() {
  let current = true;
  const enterCommunity = vi.fn(async (_communityId: string) => {});
  const setEntryPolicy = vi.fn((_entryPolicy: "approval" | "paid_subscription") => {});
  const navigateAuthResumeToFunnel = vi.fn(() => {});
  const setError = vi.fn((_message: string | null) => {});
  const onJoinRequestSent = vi.fn((_params: {
    communityId: string | null;
    communitySlug: string;
  }) => {});
  return {
    args: {
      communitySlug: "polynet",
      isCurrent: () => current,
      enterCommunity,
      setEntryPolicy,
      navigateAuthResumeToFunnel,
      setError,
      onJoinRequestSent,
      getErrorMessage,
      classifyError: classifyPublicCommunityJoinError,
    },
    enterCommunity,
    setEntryPolicy,
    navigateAuthResumeToFunnel,
    setError,
    onJoinRequestSent,
    setCurrent(value: boolean) {
      current = value;
    },
  };
}

describe("public community join result contract", () => {
  test("accepts only a canonical non-empty result", () => {
    expect(
      requirePublicCommunityJoinResult({
        outcome: "approval_denied",
        community_id: "  community_1  ",
        reapply_at: "  2026-07-28T12:00:00.000Z  ",
      }),
    ).toEqual({
      outcome: "approval_denied",
      community_id: "community_1",
      reapply_at: "2026-07-28T12:00:00.000Z",
    });

    for (const malformed of [
      null,
      {},
      { outcome: "joined", community_id: "" },
      { outcome: "unknown", community_id: "community_1" },
      { outcome: "approval_denied", community_id: "community_1" },
    ]) {
      expect(() => requirePublicCommunityJoinResult(malformed)).toThrow(
        "community_join_contract_invalid",
      );
    }
  });
});

describe("public funnel route identity", () => {
  test("normalizes standard, mobile, and preview route slugs", () => {
    expect(parsePublicCommunityFunnelRoutePath("/c/PoLyNeT")).toEqual({
      kind: "community_funnel",
      slug: "polynet",
    });
    expect(
      parsePublicCommunityFunnelRoutePath("/m/c/Distribution-Engineering/preview"),
    ).toEqual({
      kind: "community_funnel_preview",
      slug: "distribution-engineering",
    });
    expect(parsePublicCommunityFunnelRoutePath("/settings/account")).toBeNull();
  });
});

describe("public community admission executor", () => {
  test("enters directly only from a current validated joined result", async () => {
    const harness = createJoinHarness();
    const reconcile = vi.fn(async (): Promise<ReconciledAdmission<Access>> => ({
      status: "none",
      access: null,
    }));
    await executePublicCommunityJoinAction<Access>({
      ...harness.args,
      runJoin: async () => ({ outcome: "joined", community_id: "community_1" }),
      reconcile,
    });
    expect(harness.enterCommunity).toHaveBeenCalledWith("community_1");
    expect(reconcile).not.toHaveBeenCalled();
  });

  test("a stale join response produces no browser effects", async () => {
    const harness = createJoinHarness();
    const result = deferred<PublicCommunityJoinResult>();
    const reconcile = vi.fn(async (): Promise<ReconciledAdmission<Access>> => ({
      status: "none",
      access: null,
    }));
    const execution = executePublicCommunityJoinAction<Access>({
      ...harness.args,
      runJoin: () => result.promise,
      reconcile,
    });
    harness.setCurrent(false);
    result.resolve({ outcome: "joined", community_id: "community_1" });
    await execution;
    expect(harness.enterCommunity).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
    expect(harness.setError).not.toHaveBeenCalled();
  });

  test("a newer join remains authoritative when responses complete out of order", async () => {
    let generation = 1;
    const first = createJoinHarness();
    const second = createJoinHarness();
    const firstResult = deferred<PublicCommunityJoinResult>();
    const secondResult = deferred<PublicCommunityJoinResult>();
    const firstExecution = executePublicCommunityJoinAction<Access>({
      ...first.args,
      isCurrent: () => generation === 1,
      runJoin: () => firstResult.promise,
      reconcile: async () => ({ status: "none", access: null }),
    });
    generation = 2;
    const secondExecution = executePublicCommunityJoinAction<Access>({
      ...second.args,
      isCurrent: () => generation === 2,
      runJoin: () => secondResult.promise,
      reconcile: async () => ({ status: "none", access: null }),
    });
    secondResult.resolve({ outcome: "joined", community_id: "community_2" });
    await secondExecution;
    firstResult.resolve({ outcome: "joined", community_id: "community_1" });
    await firstExecution;
    expect(second.enterCommunity).toHaveBeenCalledWith("community_2");
    expect(first.enterCommunity).not.toHaveBeenCalled();
  });

  test("a malformed result fails closed unless canonical access proves entry", async () => {
    const harness = createJoinHarness();
    await executePublicCommunityJoinAction<Access>({
      ...harness.args,
      runJoin: async () => requirePublicCommunityJoinResult(null),
      reconcile: async () => ({ status: "none", access: null }),
    });
    expect(harness.enterCommunity).not.toHaveBeenCalled();
    expect(harness.setError).toHaveBeenLastCalledWith("community_join_contract_invalid");

    const recovered = createJoinHarness();
    await executePublicCommunityJoinAction<Access>({
      ...recovered.args,
      runJoin: async () => requirePublicCommunityJoinResult(null),
      reconcile: async () => ({
        status: "entered",
        access: { community_id: "canonical_community" },
      }),
    });
    expect(recovered.enterCommunity).toHaveBeenCalledWith("canonical_community");
  });

  test("approval resume navigates only after canonical pending reconciliation", async () => {
    const harness = createJoinHarness();
    await executePublicCommunityJoinAction<Access>({
      ...harness.args,
      runJoin: async () => ({
        outcome: "approval_pending",
        community_id: "community_1",
      }),
      reconcile: async () => ({ status: "pending", access: { community_id: "community_1" } }),
    });
    expect(harness.setEntryPolicy).toHaveBeenCalledWith("approval");
    expect(harness.navigateAuthResumeToFunnel).toHaveBeenCalledTimes(1);
    expect(harness.onJoinRequestSent).toHaveBeenCalledWith({
      communityId: "community_1",
      communitySlug: "polynet",
    });
    expect(harness.setError).toHaveBeenLastCalledWith(null);
  });

  test("an authority change during reconciliation suppresses later effects", async () => {
    const harness = createJoinHarness();
    const reconciliation = deferred<ReconciledAdmission<Access>>();
    const reconciliationStarted = deferred<void>();
    const execution = executePublicCommunityJoinAction<Access>({
      ...harness.args,
      runJoin: async () => ({
        outcome: "approval_pending",
        community_id: "community_1",
      }),
      reconcile: () => {
        reconciliationStarted.resolve();
        return reconciliation.promise;
      },
    });
    await reconciliationStarted.promise;
    harness.setCurrent(false);
    reconciliation.resolve({ status: "pending", access: { community_id: "community_1" } });
    await execution;
    expect(harness.setEntryPolicy).not.toHaveBeenCalled();
    expect(harness.navigateAuthResumeToFunnel).not.toHaveBeenCalled();
    expect(harness.setError).not.toHaveBeenCalled();
  });

  test("cancel reconciles both confirmed and ambiguous outcomes", async () => {
    const successErrors: Array<string | null> = [];
    await executePublicCommunityCancelAction<Access>({
      runCancel: async () => ({ outcome: "canceled" }),
      isCurrent: () => true,
      reconcile: async () => ({ status: "none", access: null }),
      setError: (message) => successErrors.push(message),
      getErrorMessage,
    });
    expect(successErrors).toEqual([null]);

    const ambiguousErrors: Array<string | null> = [];
    await executePublicCommunityCancelAction<Access>({
      runCancel: async () => {
        throw new Error("network_lost");
      },
      isCurrent: () => true,
      reconcile: async () => ({ status: "none", access: null }),
      setError: (message) => ambiguousErrors.push(message),
      getErrorMessage,
    });
    expect(ambiguousErrors).toEqual([null]);
  });
});
