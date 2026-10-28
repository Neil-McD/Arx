/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { markFounderPaidToolProviderStarted } from "./founderPaidToolRuntime";
import { internal } from "./_generated/api";
import schema from "./schema";
import { syncFounderUsageCycle } from "./founderPlanCore";
import { POLYNET_FOUNDER_PLAN_PRICING_VERSION } from "../shared/founderPlan";

const modules = import.meta.glob([
  "./founderPaidTools.ts",
  "./providerCostCore.ts",
  "./founderInference.ts",
  "./founderBilling.ts",
  "./secretCrypto.ts",
  "./_generated/**/*.*s",
]);
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllEnvs();});

async function createFixture(suffix: string, nowMs = 100_000) {
  const t = convexTest(schema, modules);
  const fixture = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: `paid-tool-${suffix}-owner`,
      displayName: "Owner",
      handle: `paid-tool-${suffix}-owner`,
      normalizedHandle: `paid-tool-${suffix}-owner`,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const actorUserId = await ctx.db.insert("users", {
      authSubject: `paid-tool-${suffix}-actor`,
      displayName: "Actor",
      handle: `paid-tool-${suffix}-actor`,
      normalizedHandle: `paid-tool-${suffix}-actor`,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: `paid-tool-${suffix}`,
      name: `Paid Tool ${suffix}`,
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "approval",
      activeMemberCount: 2,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const founderSubscriptionId = await ctx.db.insert("founderSubscriptions", {
      ownerUserId: ownerId,
      communityId,
      provider: "stripe",
      providerCustomerId: `cus_${suffix}`,
      providerSubscriptionId: `sub_${suffix}`,
      providerPriceId: "price_founder_79_monthly",
      status: "active",
      currentPeriodStartAt: nowMs - 60_000,
      currentPeriodEndAt: nowMs + 2_592_000_000,
      cancelAtPeriodEnd: false,
      lastProviderEventCreatedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const subscription = await ctx.db.get(founderSubscriptionId);
    if (!subscription) throw new Error("test_subscription_missing");
    const cycle = await syncFounderUsageCycle({
      ctx,
      subscription: subscription as any,
      cycleStartAt: nowMs - 60_000,
      cycleEndAt: nowMs + 2_592_000_000,
      pricing: {
        pricingVersion: POLYNET_FOUNDER_PLAN_PRICING_VERSION,
        includedCostMicros: 20_000_000,
        inputCostMicrosPerMillionTokens: 1_000_000,
        outputCostMicrosPerMillionTokens: 2_000_000,
        maxRunReservationCostMicros: 1_000_000,
      },
      nowMs,
    });
    if (!cycle) throw new Error("test_cycle_missing");
    return {
      actorUserId,
      communityId,
      cycleId: cycle._id,
      founderSubscriptionId,
      ownerId,
    };
  });
  return { t, fixture };
}

function claimArgs(
  fixture: Awaited<ReturnType<typeof createFixture>>["fixture"],
  suffix: string,
  nowMs = 101_000,
) {
  return {
    receiptKey: `paid_tool:${suffix}`,
    sourceRunId: `run:${suffix}`,
    toolCallId: `call:${suffix}`,
    communityId: fixture.communityId,
    actorUserId: fixture.actorUserId,
    toolName: "web_research" as const,
    action: "search" as const,
    claimToken: `claim:${suffix}`,
    nowMs,
  };
}

test("paid tools reserve and settle against the same founder usage cycle as inference", async () => {
  const { t, fixture } = await createFixture("shared-cycle");
  const toolClaim = await t.mutation(
    (internal as any).founderPaidTools.claimFounderPaidToolReceiptInternal,
    claimArgs(fixture, "shared-cycle"),
  );
  expect(toolClaim).toMatchObject({ ok: true });
  const inferenceClaim = await t.mutation(
    (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    {
      receiptKey: "community_agent_mention:shared-cycle",
      sourceRunId: "community-agent-serve:shared-cycle",
      communityId: fixture.communityId,
      actorUserId: fixture.actorUserId,
      expectedPayerUserId: fixture.ownerId,
      expectedFundingMode: "platform_subscription",
      expectedFounderSubscriptionId: fixture.founderSubscriptionId,
      surface: "community_agent_mention",
      claimToken: "inference:shared-cycle",
      nowMs: 101_001,
    },
  );
  expect(inferenceClaim).toMatchObject({ ok: true });
  await t.run(async (ctx) => {
    expect(await ctx.db.get(fixture.cycleId)).toMatchObject({
      reservedCostMicros: 1_050_000,
      settledCostMicros: 0,
    });
  });

  await t.mutation(
    (internal as any).founderPaidTools.markFounderPaidToolProviderStartedInternal,
    {
      receiptKey: "paid_tool:shared-cycle",
      claimToken: "claim:shared-cycle",
      nowMs: 101_002,
    },
  );
  await t.mutation(
    (internal as any).founderPaidTools.settleFounderPaidToolReceiptInternal,
    {
      receiptKey: "paid_tool:shared-cycle",
      claimToken: "claim:shared-cycle",
      rawVendorCostUsd: 0.012345,
      provider: "openai",
      evidence: "exact",
      outcomeCode: "completed",
      nowMs: 101_003,
    },
  );
  await t.run(async (ctx) => {
    expect(await ctx.db.get(fixture.cycleId)).toMatchObject({
      reservedCostMicros: 1_000_000,
      settledCostMicros: 12_345,
    });
    expect(await ctx.db.get(toolClaim.receiptId)).toMatchObject({
      status: "settled",
      settledCostMicros: 12_345,
    });
    const providerCosts = await ctx.db
      .query("providerCostEntries")
      .withIndex("by_costKey", (q) =>
        q.eq("costKey", "platform_tool:paid_tool:shared-cycle:provider_cost"),
      )
      .collect();
    expect(providerCosts).toHaveLength(1);
    expect(providerCosts[0]).toMatchObject({
      communityId: fixture.communityId,
      userId: fixture.actorUserId,
      rawVendorCostUsd: 0.012345,
      evidence: "exact",
      billingDisposition: "rolled_into_user_usage",
      linkedCreditKey: "paid_tool:shared-cycle",
    });
  });
});

test("claim derives funding authority and reservation from canonical state", async () => {
  const { t, fixture } = await createFixture("canonical-authority");
  const claim = await t.mutation(
    (internal as any).founderPaidTools.claimFounderPaidToolReceiptInternal,
    claimArgs(fixture, "canonical-authority"),
  );
  expect(claim).toMatchObject({
    ok: true,
    fundingMode: "platform_subscription",
    reservationCostMicros: 50_000,
  });
  await t.run(async (ctx) => {
    expect(await ctx.db.get(claim.receiptId)).toMatchObject({
      payerUserId: fixture.ownerId,
      founderSubscriptionId: fixture.founderSubscriptionId,
      reservedCostMicros: 50_000,
    });
  });
  await expect(
    t.mutation(
      (internal as any).founderPaidTools.claimFounderPaidToolReceiptInternal,
      {
        ...claimArgs(fixture, "invalid-pair"),
        toolName: "web_crawl",
        action: "search",
      },
    ),
  ).rejects.toThrow("founder_paid_tool_action_invalid");
});

test("duplicate claim intent cannot reserve the founder allowance twice", async () => {
  const { t, fixture } = await createFixture("duplicate-claim");
  const args = claimArgs(fixture, "duplicate-claim");
  await expect(
    t.mutation(
      (internal as any).founderPaidTools.claimFounderPaidToolReceiptInternal,
      args,
    ),
  ).resolves.toMatchObject({ ok: true });
  await expect(
    t.mutation(
      (internal as any).founderPaidTools.claimFounderPaidToolReceiptInternal,
      { ...args, claimToken: "claim:duplicate-retry", nowMs: 101_001 },
    ),
  ).resolves.toEqual({
    ok: false,
    errorCode: "founder_paid_tool_receipt_in_progress",
  });
  await t.run(async (ctx) => {
    expect(await ctx.db.get(fixture.cycleId)).toMatchObject({
      reservedCostMicros: 50_000,
      settledCostMicros: 0,
    });
    expect(await ctx.db.query("communityPaidToolReceipts").collect()).toHaveLength(1);
  });
});

test("funding revoked before provider start releases the reservation", async () => {
  const { t, fixture } = await createFixture("revoked-before-start");
  const claim = await t.mutation(
    (internal as any).founderPaidTools.claimFounderPaidToolReceiptInternal,
    claimArgs(fixture, "revoked-before-start"),
  );
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.founderSubscriptionId, {
      status: "canceled",
      cancelAtPeriodEnd: false,
      endedAt: 101_001,
      updatedAt: 101_001,
    });
  });
  await expect(
    t.mutation(
      (internal as any).founderPaidTools.markFounderPaidToolProviderStartedInternal,
      {
        receiptKey: "paid_tool:revoked-before-start",
        claimToken: "claim:revoked-before-start",
        nowMs: 101_002,
      },
    ),
  ).resolves.toEqual({ ok: false, errorCode: "funding_authority_changed" });
  await t.run(async (ctx) => {
    expect(await ctx.db.get(fixture.cycleId)).toMatchObject({
      reservedCostMicros: 0,
      settledCostMicros: 0,
    });
    expect(await ctx.db.get(claim.receiptId)).toMatchObject({
      status: "failed",
      failureCode: "funding_authority_changed",
      settledCostMicros: 0,
    });
  });
});

test("pre-provider failure releases the reservation and post-provider uncertainty consumes it", async () => {
  const before = await createFixture("pre-provider");
  const beforeClaim = await before.t.mutation(
    (internal as any).founderPaidTools.claimFounderPaidToolReceiptInternal,
    claimArgs(before.fixture, "pre-provider"),
  );
  await before.t.mutation(
    (internal as any).founderPaidTools.finalizeFounderPaidToolFailureInternal,
    {
      receiptKey: "paid_tool:pre-provider",
      claimToken: "claim:pre-provider",
      failureCode: "schedule_failed",
      nowMs: 101_001,
    },
  );
  await before.t.run(async (ctx) => {
    expect(await ctx.db.get(before.fixture.cycleId)).toMatchObject({
      reservedCostMicros: 0,
      settledCostMicros: 0,
    });
    expect(await ctx.db.get(beforeClaim.receiptId)).toMatchObject({
      status: "failed",
      settledCostMicros: 0,
    });
  });

  const after = await createFixture("post-provider");
  const afterClaim = await after.t.mutation(
    (internal as any).founderPaidTools.claimFounderPaidToolReceiptInternal,
    claimArgs(after.fixture, "post-provider"),
  );
  await after.t.mutation(
    (internal as any).founderPaidTools.markFounderPaidToolProviderStartedInternal,
    {
      receiptKey: "paid_tool:post-provider",
      claimToken: "claim:post-provider",
      nowMs: 101_001,
    },
  );
  await after.t.mutation(
    (internal as any).founderPaidTools.finalizeFounderPaidToolFailureInternal,
    {
      receiptKey: "paid_tool:post-provider",
      claimToken: "claim:post-provider",
      failureCode: "provider_timeout",
      nowMs: 101_002,
    },
  );
  await after.t.run(async (ctx) => {
    expect(await ctx.db.get(after.fixture.cycleId)).toMatchObject({
      reservedCostMicros: 0,
      settledCostMicros: 50_000,
    });
    expect(await ctx.db.get(afterClaim.receiptId)).toMatchObject({
      status: "indeterminate",
      settledCostMicros: 50_000,
    });
  });
});

test("provider start, settlement, and failure replays never charge twice", async () => {
  const { t, fixture } = await createFixture("replay");
  const claim = await t.mutation(
    (internal as any).founderPaidTools.claimFounderPaidToolReceiptInternal,
    claimArgs(fixture, "replay"),
  );
  const startArgs = {
    receiptKey: "paid_tool:replay",
    claimToken: "claim:replay",
    nowMs: 101_001,
  };
  await expect(
    t.mutation(
      (internal as any).founderPaidTools.markFounderPaidToolProviderStartedInternal,
      startArgs,
    ),
  ).resolves.toMatchObject({ ok: true });
  await expect(
    t.mutation(
      (internal as any).founderPaidTools.markFounderPaidToolProviderStartedInternal,
      { ...startArgs, nowMs: 101_002 },
    ),
  ).resolves.toMatchObject({ ok: true, replayed: true });
  const settlementArgs = {
    receiptKey: "paid_tool:replay",
    claimToken: "claim:replay",
    rawVendorCostUsd: 0.01,
    provider: "openai",
    evidence: "exact" as const,
    outcomeCode: "completed",
    nowMs: 101_003,
  };
  await expect(
    t.mutation(
      (internal as any).founderPaidTools.settleFounderPaidToolReceiptInternal,
      settlementArgs,
    ),
  ).resolves.toMatchObject({ ok: true, status: "settled" });
  await expect(
    t.mutation(
      (internal as any).founderPaidTools.settleFounderPaidToolReceiptInternal,
      { ...settlementArgs, nowMs: 101_004 },
    ),
  ).resolves.toMatchObject({ ok: true, status: "settled", replayed: true });
  await t.run(async (ctx) => {
    expect(await ctx.db.get(fixture.cycleId)).toMatchObject({
      reservedCostMicros: 0,
      settledCostMicros: 10_000,
    });
    expect(await ctx.db.get(claim.receiptId)).toMatchObject({ status: "settled" });
    expect(await ctx.db.query("providerCostEntries").collect()).toHaveLength(1);
  });
});

test("provider-cost identity conflicts roll back settlement and allowance changes", async () => {
  const { t, fixture } = await createFixture("provider-conflict");
  const claim = await t.mutation(
    (internal as any).founderPaidTools.claimFounderPaidToolReceiptInternal,
    claimArgs(fixture, "provider-conflict"),
  );
  await t.mutation(
    (internal as any).founderPaidTools.markFounderPaidToolProviderStartedInternal,
    {
      receiptKey: "paid_tool:provider-conflict",
      claimToken: "claim:provider-conflict",
      nowMs: 101_001,
    },
  );
  await t.run(async (ctx) => {
    await ctx.db.insert("providerCostEntries", {
      costKey: "platform_tool:paid_tool:provider-conflict:provider_cost",
      userId: fixture.ownerId,
      communityId: fixture.communityId,
      category: "web",
      component: "web_research_call",
      provider: "openai",
      periodStart: 101_001,
      periodEnd: 101_001,
      quantityKind: "call",
      quantity: 1,
      rawVendorCostUsd: 0.01,
      evidence: "exact",
      billingDisposition: "rolled_into_user_usage",
      linkedCreditKey: "paid_tool:provider-conflict",
      createdAt: 101_001,
      updatedAt: 101_001,
    });
  });
  await expect(
    t.mutation(
      (internal as any).founderPaidTools.settleFounderPaidToolReceiptInternal,
      {
        receiptKey: "paid_tool:provider-conflict",
        claimToken: "claim:provider-conflict",
        rawVendorCostUsd: 0.01,
        provider: "openai",
        evidence: "exact",
        outcomeCode: "completed",
        nowMs: 101_002,
      },
    ),
  ).rejects.toThrow("provider_cost_identity_mismatch:userId");
  await t.run(async (ctx) => {
    expect(await ctx.db.get(fixture.cycleId)).toMatchObject({
      reservedCostMicros: 50_000,
      settledCostMicros: 0,
    });
    expect(await ctx.db.get(claim.receiptId)).toMatchObject({ status: "authorized" });
  });
});

test("receipt identity conflicts and duplicate receipt rows fail closed", async () => {
  const { t, fixture } = await createFixture("identity");
  const args = claimArgs(fixture, "identity");
  await expect(
    t.mutation(
      (internal as any).founderPaidTools.claimFounderPaidToolReceiptInternal,
      args,
    ),
  ).resolves.toMatchObject({ ok: true });
  await expect(
    t.mutation(
      (internal as any).founderPaidTools.claimFounderPaidToolReceiptInternal,
      { ...args, toolCallId: "call:conflict", claimToken: "claim:conflict" },
    ),
  ).resolves.toEqual({ ok: false, errorCode: "founder_paid_tool_receipt_conflict" });

  await t.run(async (ctx) => {
    const row = await ctx.db.get(
      (await ctx.db
        .query("communityPaidToolReceipts")
        .withIndex("by_receipt_key", (q) => q.eq("receiptKey", "paid_tool:identity"))
        .first())!._id,
    );
    if (!row) throw new Error("test_receipt_missing");
    const { _id: _discardId, _creationTime: _discardCreation, ...duplicate } = row;
    await ctx.db.insert("communityPaidToolReceipts", {
      ...duplicate,
      claimToken: "claim:duplicate",
      createdAt: 101_010,
      updatedAt: 101_010,
    });
  });
  await expect(
    t.mutation(
      (internal as any).founderPaidTools.claimFounderPaidToolReceiptInternal,
      { ...args, receiptKey: "paid_tool:identity", claimToken: "claim:ambiguous" },
    ),
  ).rejects.toThrow("founder_paid_tool_receipt_ambiguous");
});

test("cost above the reservation is capped and marked indeterminate", async () => {
  const { t, fixture } = await createFixture("cost-cap");
  const claim = await t.mutation(
    (internal as any).founderPaidTools.claimFounderPaidToolReceiptInternal,
    claimArgs(fixture, "cost-cap"),
  );
  await t.mutation(
    (internal as any).founderPaidTools.markFounderPaidToolProviderStartedInternal,
    {
      receiptKey: "paid_tool:cost-cap",
      claimToken: "claim:cost-cap",
      nowMs: 101_001,
    },
  );
  await expect(
    t.mutation(
      (internal as any).founderPaidTools.settleFounderPaidToolReceiptInternal,
      {
        receiptKey: "paid_tool:cost-cap",
        claimToken: "claim:cost-cap",
        rawVendorCostUsd: 0.06,
        provider: "openai",
        evidence: "provider_reported",
        outcomeCode: "completed",
        nowMs: 101_002,
      },
    ),
  ).resolves.toEqual({ ok: true, status: "indeterminate", settledCostMicros: 50_000 });
  await t.run(async (ctx) => {
    expect(await ctx.db.get(fixture.cycleId)).toMatchObject({
      reservedCostMicros: 0,
      settledCostMicros: 50_000,
    });
    expect(await ctx.db.get(claim.receiptId)).toMatchObject({
      status: "indeterminate",
      failureCode: "paid_tool_cost_exceeds_reservation",
    });
    const providerCost = await ctx.db
      .query("providerCostEntries")
      .withIndex("by_costKey", (q) =>
        q.eq("costKey", "platform_tool:paid_tool:cost-cap:provider_cost"),
      )
      .unique();
    expect(providerCost).toMatchObject({ rawVendorCostUsd: 0.06 });
  });
});

test("paid tool attempts are bounded per actor even when the operator grant has no usage cycle", async () => {
  const t = convexTest(schema, modules);
  const nowMs = 200_000;
  const fixture = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "paid-tool-operator-owner",
      displayName: "Operator",
      handle: "paid-tool-operator-owner",
      normalizedHandle: "paid-tool-operator-owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const actorUserId = await ctx.db.insert("users", {
      authSubject: "paid-tool-operator-actor",
      displayName: "Actor",
      handle: "paid-tool-operator-actor",
      normalizedHandle: "paid-tool-operator-actor",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "paid-tool-operator",
      name: "Paid Tool Operator",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "approval",
      activeMemberCount: 2,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("operatorRoles", {
      userId: ownerId,
      role: "owner",
      active: true,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { actorUserId, communityId, ownerId };
  });
  for (let index = 0; index < 6; index += 1) {
    const claim = await t.mutation(
      (internal as any).founderPaidTools.claimFounderPaidToolReceiptInternal,
      {
        receiptKey: `paid_tool:operator-rate-${index}`,
        sourceRunId: `run:operator-rate-${index}`,
        toolCallId: `call:operator-rate-${index}`,
        communityId: fixture.communityId,
        actorUserId: fixture.actorUserId,
        toolName: "web_research",
        action: "search",
        claimToken: `claim:operator-rate-${index}`,
        nowMs: nowMs + 1_000 + index,
      },
    );
    expect(claim).toMatchObject({ ok: true });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(claim.receiptId)).toMatchObject({
        reservedCostMicros: 50_000,
      });
    });
    await expect(
      t.mutation(
        (internal as any).founderPaidTools.markFounderPaidToolProviderStartedInternal,
        {
          receiptKey: `paid_tool:operator-rate-${index}`,
          claimToken: `claim:operator-rate-${index}`,
          nowMs: nowMs + 1_100 + index,
        },
      ),
    ).resolves.toMatchObject({ ok: true });
  }
  await expect(
    t.mutation(
      (internal as any).founderPaidTools.settleFounderPaidToolReceiptInternal,
      {
        receiptKey: "paid_tool:operator-rate-0",
        claimToken: "claim:operator-rate-0",
        rawVendorCostUsd: 0.01,
        provider: "openai",
        evidence: "exact",
        outcomeCode: "completed",
        nowMs: nowMs + 1_200,
      },
    ),
  ).resolves.toMatchObject({ ok: true, status: "settled" });
  await t.run(async (ctx) => {
    const providerCost = await ctx.db
      .query("providerCostEntries")
      .withIndex("by_costKey", (q) =>
        q.eq("costKey", "platform_tool:paid_tool:operator-rate-0:provider_cost"),
      )
      .unique();
    expect(providerCost).toMatchObject({
      billingDisposition: "platform_absorbed",
      rawVendorCostUsd: 0.01,
    });
  });
  await expect(
    t.mutation(
      (internal as any).founderPaidTools.claimFounderPaidToolReceiptInternal,
      {
        receiptKey: "paid_tool:operator-rate-blocked",
        sourceRunId: "run:operator-rate-blocked",
        toolCallId: "call:operator-rate-blocked",
        communityId: fixture.communityId,
        actorUserId: fixture.actorUserId,
        toolName: "web_research",
        action: "search",
        claimToken: "claim:operator-rate-blocked",
        nowMs: nowMs + 1_010,
      },
    ),
  ).resolves.toEqual({ ok: false, errorCode: "founder_paid_tool_actor_rate_limited" });
});

test("missing or exhausted founder funding fails before a paid tool receipt is authorized", async () => {
  const missing = await createFixture("missing-funding");
  await missing.t.run(async (ctx) => {
    await ctx.db.delete(missing.fixture.founderSubscriptionId);
  });
  await expect(
    missing.t.mutation(
      (internal as any).founderPaidTools.claimFounderPaidToolReceiptInternal,
      claimArgs(missing.fixture, "missing-funding"),
    ),
  ).resolves.toMatchObject({ ok: false });
  await missing.t.run(async (ctx) => {
    expect(await ctx.db.query("communityPaidToolReceipts").collect()).toHaveLength(0);
  });

  const exhausted = await createFixture("exhausted-funding");
  await exhausted.t.run(async (ctx) => {
    const cycle = await ctx.db.get(exhausted.fixture.cycleId) as any;
    if (!cycle) throw new Error("test_cycle_missing");
    await ctx.db.patch(exhausted.fixture.cycleId, {
      settledCostMicros: cycle.includedCostMicros - 49_999,
      updatedAt: 101_000,
    });
  });
  await expect(
    exhausted.t.mutation(
      (internal as any).founderPaidTools.claimFounderPaidToolReceiptInternal,
      claimArgs(exhausted.fixture, "exhausted-funding"),
    ),
  ).resolves.toEqual({ ok: false, errorCode: "founder_usage_exhausted" });
  await exhausted.t.run(async (ctx) => {
    expect(await ctx.db.query("communityPaidToolReceipts").collect()).toHaveLength(0);
  });
});

test("only one concurrent provider-start caller receives dispatch permission", async () => {
  const {t, fixture} = await createFixture("concurrent-start");
  const args = claimArgs(fixture, "concurrent-start");
  await t.mutation((internal as any).founderPaidTools.claimFounderPaidToolReceiptInternal, args);
  const dispatch = vi.fn();
  const ctx = {runMutation: (ref: any, input: any) => t.mutation(ref, {...input, nowMs: 101_001})};
  const attempts = await Promise.allSettled([1, 2].map(async () => {
    await markFounderPaidToolProviderStarted({ctx, session: {receiptKey: args.receiptKey, claimToken: args.claimToken}});
    dispatch();
  }));
  expect(attempts.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(dispatch).toHaveBeenCalledTimes(1);
});

test("operator-funded paid tools reserve and settle against the operator monthly ledger", async () => {
  const { t, fixture } = await createFixture("operator-ledger");
  await t.run(async (ctx) => {
    // Operator funding takes precedence over any attached subscription.
    await ctx.db.insert("operatorRoles", {
      userId: fixture.ownerId,
      role: "owner",
      active: true,
      createdAt: 100_000,
      updatedAt: 100_000,
    });
  });
  const claim = await t.mutation(
    (internal as any).founderPaidTools.claimFounderPaidToolReceiptInternal,
    claimArgs(fixture, "operator-ledger"),
  );
  expect(claim).toMatchObject({
    ok: true,
    fundingMode: "platform_operator_grant",
    reservationCostMicros: 50_000,
  });
  await t.run(async (ctx) => {
    const [cycle] = await ctx.db.query("operatorGrantUsageCycles").collect();
    expect(cycle).toMatchObject({ reservedCostMicros: 50_000, settledCostMicros: 0 });
    expect(await ctx.db.get(claim.receiptId)).toMatchObject({
      operatorUsageCycleId: cycle!._id,
    });
  });
  await t.mutation(
    (internal as any).founderPaidTools.markFounderPaidToolProviderStartedInternal,
    { receiptKey: "paid_tool:operator-ledger", claimToken: "claim:operator-ledger", nowMs: 101_002 },
  );
  await t.mutation(
    (internal as any).founderPaidTools.settleFounderPaidToolReceiptInternal,
    {
      receiptKey: "paid_tool:operator-ledger",
      claimToken: "claim:operator-ledger",
      rawVendorCostUsd: 0.012345,
      provider: "openai",
      evidence: "exact",
      outcomeCode: "completed",
      nowMs: 101_003,
    },
  );
  await t.run(async (ctx) => {
    const [cycle] = await ctx.db.query("operatorGrantUsageCycles").collect();
    expect(cycle).toMatchObject({ reservedCostMicros: 0, settledCostMicros: 12_345 });
    await ctx.db.patch(cycle!._id, { settledCostMicros: 20_000_000 });
  });
  await expect(t.mutation(
    (internal as any).founderPaidTools.claimFounderPaidToolReceiptInternal,
    claimArgs(fixture, "operator-ledger-exhausted", 101_010),
  )).resolves.toEqual({ ok: false, errorCode: "founder_usage_exhausted" });
});
