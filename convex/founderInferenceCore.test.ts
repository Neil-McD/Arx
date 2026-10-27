/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  resolveAdditionalManagedCommunityAdmission,
  resolveCommunityInferenceFundingAdmission,
  settleAuthorizedFounderInferenceReceipt,
} from "./founderInferenceCore";
import {
  getFounderSubscriptionByCommunity,
  reserveFounderUsage,
  settleFounderUsageReservation,
  syncFounderUsageCycle,
} from "./founderPlanCore";
import { POLYNET_FOUNDER_PLAN_PRICING_VERSION } from "../shared/founderPlan";
import { snapshotFounderRunPricing, type FounderInferencePricing } from "./founderPlanPricing";
import { buildAccountSetupStatusForRows } from "./accountSetupCore";
import { assertPaidLuna6ProviderHeadroom, FOUNDER_INFERENCE_RUN_BUDGET_EXHAUSTED } from "./founderInferenceBudget";
import { createFounderInferenceUsageTotals, recordFounderProviderSuccess } from "./founderInferenceUsage";

const modules = import.meta.glob([
  "./founderInference.ts",
  "./founderBilling.ts",
  "./secretCrypto.ts",
  "./_generated/**/*.*s",
]);

async function insertUser(ctx: any, suffix: string, nowMs = 1_000) {
  return await ctx.db.insert("users", {
    authSubject: `founder-inference-${suffix}`,
    displayName: `Founder ${suffix}`,
    handle: `founder-${suffix}`,
    normalizedHandle: `founder-${suffix}`,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
}

async function insertCommunity(
  ctx: any,
  ownerId: any,
  suffix: string,
  nowMs = 1_000,
) {
  return await ctx.db.insert("communities", {
    ownerId,
    slug: `founder-inference-${suffix}`,
    name: `Community ${suffix}`,
    visibility: "unlisted",
    inferenceFundingPolicy: "managed_required",
    entryPolicy: "approval",
    activeMemberCount: 1,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
}

async function createActiveFundingFixture(
  t: ReturnType<typeof convexTest>,
  suffix: string,
  nowMs = 100_000,
) {
  return await t.run(async (ctx) => {
    const ownerId = await insertUser(ctx, `${suffix}-owner`, nowMs);
    const memberId = await insertUser(ctx, `${suffix}-member`, nowMs);
    const communityId = await insertCommunity(ctx, ownerId, suffix, nowMs);
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
    await syncFounderUsageCycle({
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
    return { communityId, founderSubscriptionId, memberId, ownerId };
  });
}

function claimArgs(
  fixture: Awaited<ReturnType<typeof createActiveFundingFixture>>,
  receiptKey: string,
  claimToken: string,
  nowMs: number,
  surface: "community_agent_mention" | "community_autonomous_cognition" = "community_agent_mention",
) {
  return {
    receiptKey,
    sourceRunId: `community-agent-serve:${receiptKey}`,
    communityId: fixture.communityId,
    actorUserId: fixture.memberId,
    expectedPayerUserId: fixture.ownerId,
    expectedFundingMode: "platform_subscription" as const,
    expectedFounderSubscriptionId: fixture.founderSubscriptionId,
    surface,
    claimToken,
    nowMs,
  };
}

test("founders can add unlimited communities sequentially when every existing community is funded", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const nowMs = Date.now();
    const ownerId = await insertUser(ctx, "unlimited-paid-owner", nowMs);
    await expect(
      resolveAdditionalManagedCommunityAdmission(ctx, ownerId),
    ).resolves.toEqual({ ok: true, fundedCommunityCount: 0 });

    for (let index = 0; index < 12; index += 1) {
      const communityId = await insertCommunity(
        ctx,
        ownerId,
        `unlimited-paid-${index}`,
        nowMs + index,
      );
      await ctx.db.patch(communityId, { inferenceFundingPolicy: "managed_required" });
      await expect(
        resolveAdditionalManagedCommunityAdmission(ctx, ownerId),
      ).resolves.toMatchObject({
        ok: false,
        blockingCommunityId: communityId,
        code: "founder_plan_required",
      });
      await ctx.db.insert("founderSubscriptions", {
        ownerUserId: ownerId,
        communityId,
        provider: "stripe",
        providerCustomerId: "cus_unlimited_paid",
        providerSubscriptionId: `sub_unlimited_paid_${index}`,
        providerPriceId: "price_founder_79_monthly",
        status: "active",
        currentPeriodStartAt: nowMs - 1_000,
        currentPeriodEndAt: nowMs + 30 * 24 * 60 * 60 * 1_000,
        cancelAtPeriodEnd: false,
        lastProviderEventCreatedAt: nowMs,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      await expect(
        resolveAdditionalManagedCommunityAdmission(ctx, ownerId),
      ).resolves.toEqual({ ok: true, fundedCommunityCount: index + 1 });
    }
  });
});

test("archived communities do not block creation or count as funded active communities", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const nowMs = Date.now();
    const ownerId = await insertUser(ctx, "archived-admission-owner", nowMs);
    const communityId = await insertCommunity(
      ctx,
      ownerId,
      "archived-admission",
      nowMs,
    );
    await ctx.db.patch(communityId, {
      inferenceFundingPolicy: "managed_required",
      lifecycleStatus: "archived",
      lifecycleGeneration: 1,
    });
    await expect(
      resolveAdditionalManagedCommunityAdmission(ctx, ownerId),
    ).resolves.toEqual({ ok: true, fundedCommunityCount: 0 });
  });
});

test("the canonical operator owner has unlimited complimentary communities", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const nowMs = Date.now();
    const ownerId = await insertUser(ctx, "unlimited-operator-owner", nowMs);
    await ctx.db.insert("operatorRoles", {
      userId: ownerId,
      role: "owner",
      active: true,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    for (let index = 0; index < 12; index += 1) {
      const communityId = await insertCommunity(
        ctx,
        ownerId,
        `unlimited-operator-${index}`,
        nowMs + index,
      );
      await ctx.db.patch(communityId, { inferenceFundingPolicy: "managed_required" });
    }
    await expect(
      resolveAdditionalManagedCommunityAdmission(ctx, ownerId),
    ).resolves.toEqual({ ok: true, fundedCommunityCount: 12 });
  });
});

test("one active platform owner receives metered operator-funded Luna without a subscription or API key", async () => {
  const priorEnv = {
    input: process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS,
    output: process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS,
    reservation: process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS,
  };
  process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS = "1000000";
  process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS = "2000000";
  process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS = "1000000";
  try {
    const t = convexTest(schema, modules);
    const nowMs = 50_000;
    const fixture = await t.run(async (ctx) => {
      const ownerId = await insertUser(ctx, "operator-owner", nowMs);
      const memberId = await insertUser(ctx, "operator-member", nowMs);
      const communityId = await insertCommunity(ctx, ownerId, "operator-community", nowMs);
      await ctx.db.patch(communityId, {
        inferenceFundingPolicy: "managed_required",
        updatedAt: nowMs,
      });
      const operatorRoleId = await ctx.db.insert("operatorRoles", {
        userId: ownerId,
        role: "owner",
        active: true,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      return { communityId, memberId, operatorRoleId, ownerId };
    });

    await expect(
      t.run(async (ctx) =>
        await resolveCommunityInferenceFundingAdmission(ctx, fixture.communityId),
      ),
    ).resolves.toEqual({
      ok: true,
      mode: "platform_operator_grant",
      transitional: false,
      payerUserId: fixture.ownerId,
      modelId: "gpt-6-luna",
    });
    const asOperatorOwner = t.withIdentity({
      subject: "founder-inference-operator-owner",
    });
    const billingOverview = await asOperatorOwner.query(
      (api as any).founderBilling.getFounderBillingOverview,
      {},
    );
    expect(billingOverview).toMatchObject({
      communities: [
        {
          community_id: String(fixture.communityId),
          funding_mode: "operator_comp",
          status: "operator_comped",
          funding_lane: "builder_included",
          funding_state: "builder_included",
          allowed_actions: [],
          subscription_id: null,
        },
      ],
      managed_monthly_total_base_units: 0,
    });
    expect(billingOverview).not.toHaveProperty("model_id");
    expect(billingOverview).not.toHaveProperty("included_cost_micros");
    expect(billingOverview.communities[0]).not.toHaveProperty("model_id");
    expect(billingOverview.communities[0]).not.toHaveProperty("included_cost_micros");
    expect(billingOverview.communities[0]).not.toHaveProperty("usage");
    const receiptKey = "community_agent_mention:operator-funded";
    const claimed = await t.mutation(
      (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
      {
        receiptKey,
        sourceRunId: "community-agent-serve:operator-funded",
        communityId: fixture.communityId,
        actorUserId: fixture.memberId,
        expectedPayerUserId: fixture.ownerId,
        expectedFundingMode: "platform_operator_grant",
        surface: "community_agent_mention",
        claimToken: "operator-funded-claim",
        nowMs: nowMs + 1_000,
      },
    );
    expect(claimed).toMatchObject({ ok: true, reclaimed: false });
    await t.run(async (ctx) => {
      const receipt = await ctx.db.get(claimed.receiptId);
      expect(receipt).toMatchObject({
        fundingMode: "platform_operator_grant",
        payerUserId: fixture.ownerId,
        pricingVersion: "gpt_6_luna_standard_v1",
      });
      expect(receipt).not.toHaveProperty("founderGrantId");
      expect(receipt).not.toHaveProperty("founderSubscriptionId");
      expect(receipt).not.toHaveProperty("usageCycleId");
    });
    await expect(
      t.mutation(
        (internal as any).founderInference.markCommunityInferenceProviderStartedInternal,
        { receiptKey, claimToken: "operator-funded-claim", nowMs: nowMs + 2_000 },
      ),
    ).resolves.toEqual({ ok: true });
    // Pricing edits after provider start must not reprice this run.
    process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS = "9000000";
    await t.run(async (ctx) => {
      await settleAuthorizedFounderInferenceReceipt({
        ctx,
        receiptKey,
        claimToken: "operator-funded-claim",
        promptTokens: 1_000,
        completionTokens: 500,
        providerRequests: [{ requestId: "resp_operator-funded-claim", modelId: "gpt-6-luna", serviceTier: "default", promptTokens: 1_000, completionTokens: 500, cachedInputTokens: 0, cacheWriteTokens: 0 }],
        outcomeCode: "completed",
        nowMs: nowMs + 3_000,
      });
      expect(await ctx.db.get(claimed.receiptId)).toMatchObject({
        status: "settled",
        promptTokens: 1_000,
        completionTokens: 500,
        settledCostMicros: 350,
      });
    });

    process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS = "1000000";
    const revokedReceiptKey = "community_agent_mention:operator-revoked";
    await expect(
      t.mutation(
        (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
        {
          receiptKey: revokedReceiptKey,
          sourceRunId: "community-agent-serve:operator-revoked",
          communityId: fixture.communityId,
          actorUserId: fixture.memberId,
          expectedPayerUserId: fixture.ownerId,
          expectedFundingMode: "platform_operator_grant",
          surface: "community_agent_mention",
          claimToken: "operator-revoked-claim",
          nowMs: nowMs + 4_000,
        },
      ),
    ).resolves.toMatchObject({ ok: true });
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.operatorRoleId, { active: false, updatedAt: nowMs + 5_000 });
    });
    await expect(
      t.mutation(
        (internal as any).founderInference.markCommunityInferenceProviderStartedInternal,
        {
          receiptKey: revokedReceiptKey,
          claimToken: "operator-revoked-claim",
          nowMs: nowMs + 6_000,
        },
      ),
    ).resolves.toEqual({ ok: false, errorCode: "funding_authority_changed" });
  } finally {
    if (priorEnv.input === undefined) delete process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS;
    else process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS = priorEnv.input;
    if (priorEnv.output === undefined) delete process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS;
    else process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS = priorEnv.output;
    if (priorEnv.reservation === undefined) delete process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS;
    else process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS = priorEnv.reservation;
  }
});

test("operator complimentary access fails closed for non-owner, inactive, or ambiguous roles", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const ownerId = await insertUser(ctx, "operator-ambiguous-owner", 70_000);
    const communityId = await insertCommunity(ctx, ownerId, "operator-ambiguous", 70_000);
    await ctx.db.patch(communityId, { inferenceFundingPolicy: "managed_required" });
    const roleId = await ctx.db.insert("operatorRoles", {
      userId: ownerId,
      role: "operator",
      active: true,
      createdAt: 70_000,
      updatedAt: 70_000,
    });
    await expect(resolveCommunityInferenceFundingAdmission(ctx, communityId)).resolves.toEqual({
      ok: false,
      code: "founder_plan_required",
    });
    await ctx.db.patch(roleId, { role: "owner", active: false, updatedAt: 71_000 });
    await expect(resolveCommunityInferenceFundingAdmission(ctx, communityId)).resolves.toEqual({
      ok: false,
      code: "founder_plan_required",
    });
    await ctx.db.patch(roleId, { active: true, updatedAt: 72_000 });
    await ctx.db.insert("operatorRoles", {
      userId: ownerId,
      role: "owner",
      active: true,
      createdAt: 72_000,
      updatedAt: 72_000,
    });
    await expect(resolveCommunityInferenceFundingAdmission(ctx, communityId)).resolves.toEqual({
      ok: false,
      code: "founder_plan_required",
    });
  });
});

test("account setup completion is independent of inference funding", () => {
  const status = buildAccountSetupStatusForRows({
    user: {
      _id: "managed-founder",
      authSubject: "managed-founder",
      createdAt: 1,
      updatedAt: 1,
    },
    detail: null,
    legalAcceptances: [],
  });
  expect(status.current_step).toBe("identity");
  expect(status.steps).toHaveLength(1);
});

test("receipt claims preserve member actor and owner payer across safe and ambiguous retries", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createActiveFundingFixture(t, "receipt-retry", 100_000);
  const receiptKey = "community_agent_mention:receipt-retry";
  const first = await t.mutation(
    (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    claimArgs(fixture, receiptKey, "claim-one", 101_000),
  );
  expect(first).toMatchObject({ ok: true, reclaimed: false });
  await t.run(async (ctx) => {
    expect(await ctx.db.get(first.receiptId)).toMatchObject({
      actorUserId: fixture.memberId,
      payerUserId: fixture.ownerId,
      claimToken: "claim-one",
      status: "authorized",
    });
  });

  await expect(
    t.mutation(
      (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
      claimArgs(fixture, receiptKey, "claim-two", 101_001),
    ),
  ).resolves.toMatchObject({ ok: false, errorCode: "inference_receipt_in_progress" });
  await t.run(async (ctx) => {
    await ctx.db.patch(first.receiptId, { leaseExpiresAt: 101_001, updatedAt: 101_001 });
  });
  await expect(
    t.mutation(
      (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
      claimArgs(fixture, receiptKey, "claim-three", 101_002),
    ),
  ).resolves.toMatchObject({ ok: true, receiptId: first.receiptId, reclaimed: true });
  await expect(
    t.mutation(
      (internal as any).founderInference.markCommunityInferenceProviderStartedInternal,
      { receiptKey, claimToken: "claim-three", nowMs: 101_003 },
    ),
  ).resolves.toEqual({ ok: true });
  await expect(
    t.mutation(
      (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
      claimArgs(fixture, receiptKey, "claim-four", 101_004),
    ),
  ).resolves.toMatchObject({ ok: false, errorCode: "inference_receipt_indeterminate" });
  await t.run(async (ctx) => {
    expect(await ctx.db.get(first.receiptId)).toMatchObject({
      status: "indeterminate",
      failureCode: "ambiguous_provider_retry_blocked",
      settledCostMicros: 1_000_000,
    });
    const cycles = await ctx.db
      .query("founderUsageCycles")
      .withIndex("by_subscription_status", (q) =>
        q.eq("founderSubscriptionId", fixture.founderSubscriptionId).eq("status", "open"),
      )
      .collect();
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toMatchObject({
      reservedCostMicros: 0,
      settledCostMicros: 1_000_000,
    });
  });
});

test("a receipt key cannot be reused across immutable inference identities", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createActiveFundingFixture(t, "receipt-identity", 120_000);
  const receiptKey = "community_agent_mention:receipt-identity";
  const initialArgs = claimArgs(fixture, receiptKey, "identity-claim", 121_000);
  const first = await t.mutation(
    (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    initialArgs,
  );
  expect(first).toMatchObject({ ok: true, reclaimed: false });

  const alternate = await t.run(async (ctx) => {
    const ownerId = await insertUser(ctx, "receipt-identity-other-owner", 121_001);
    const memberId = await insertUser(ctx, "receipt-identity-other-member", 121_001);
    const communityId = await insertCommunity(
      ctx,
      ownerId,
      "receipt-identity-other-community",
      121_001,
    );
    const founderSubscriptionId = await ctx.db.insert("founderSubscriptions", {
      ownerUserId: ownerId,
      communityId,
      provider: "stripe",
      providerCustomerId: "cus_receipt_identity_other",
      providerSubscriptionId: "sub_receipt_identity_other",
      providerPriceId: "price_founder_79_monthly",
      status: "active",
      currentPeriodStartAt: 120_000,
      currentPeriodEndAt: 2_592_120_000,
      cancelAtPeriodEnd: false,
      lastProviderEventCreatedAt: 121_001,
      createdAt: 121_001,
      updatedAt: 121_001,
    });
    return { communityId, founderSubscriptionId, memberId, ownerId };
  });

  const originalReceipt = await t.run(async (ctx) => await ctx.db.get(first.receiptId) as any);
  if (!originalReceipt?.usageCycleId) throw new Error("test_usage_cycle_missing");
  const originalCycle = await t.run(async (ctx) => await ctx.db.get(originalReceipt.usageCycleId) as any);
  const conflicts = [
    { field: "sourceRunId", value: "community-agent-serve:different-run" },
    { field: "communityId", value: alternate.communityId },
    { field: "actorUserId", value: alternate.memberId },
    { field: "payerUserId", value: alternate.ownerId },
    { field: "fundingMode", value: "platform_operator_grant" },
    { field: "founderSubscriptionId", value: alternate.founderSubscriptionId },
    { field: "surface", value: "community_autonomous_cognition" },
  ] as const;

  for (const [index, conflict] of conflicts.entries()) {
    await t.run(async (ctx) => {
      await ctx.db.patch(first.receiptId, { [conflict.field]: conflict.value });
    });
    await expect(
      t.mutation(
        (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
        {
          ...initialArgs,
          claimToken: `identity-conflict-${index}`,
          nowMs: 121_010 + index,
        },
      ),
    ).resolves.toEqual({
      ok: false,
      errorCode: "founder_inference_receipt_conflict",
    });
    await t.run(async (ctx) => {
      const conflictedReceipt = await ctx.db.get(first.receiptId) as any;
      expect(conflictedReceipt).toMatchObject({
        claimToken: "identity-claim",
        leaseExpiresAt: originalReceipt.leaseExpiresAt,
        status: "authorized",
      });
      expect(await ctx.db.get(originalReceipt.usageCycleId)).toMatchObject({
        reservedCostMicros: originalCycle.reservedCostMicros,
        settledCostMicros: originalCycle.settledCostMicros,
      });
      await ctx.db.patch(first.receiptId, {
        [conflict.field]: originalReceipt[conflict.field],
      });
    });
  }
});

test("ambiguous inference receipt rows fail closed across the entire lifecycle", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createActiveFundingFixture(t, "receipt-ambiguous", 130_000);
  const receiptKey = "community_agent_mention:receipt-ambiguous";
  await t.run(async (ctx) => {
    for (let index = 0; index < 2; index += 1) {
      await ctx.db.insert("communityInferenceReceipts", {
        receiptKey,
        sourceRunId: `community-agent-serve:ambiguous-${index}`,
        communityId: fixture.communityId,
        actorUserId: fixture.memberId,
        payerUserId: fixture.ownerId,
        fundingMode: "platform_subscription",
        founderSubscriptionId: fixture.founderSubscriptionId,
        surface: "community_agent_mention",
        provider: "openai",
        modelId: "gpt-5.6-luna",
        status: "authorized",
        claimToken: `ambiguous-claim-${index}`,
        leaseExpiresAt: 140_000,
        pricingVersion: POLYNET_FOUNDER_PLAN_PRICING_VERSION,
        reservedCostMicros: 1_000_000,
        authorizedAt: 131_000 + index,
        createdAt: 131_000 + index,
        updatedAt: 131_000 + index,
      });
    }
  });

  await expect(
    t.mutation(
      (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
      claimArgs(fixture, receiptKey, "ambiguous-new-claim", 131_010),
    ),
  ).rejects.toThrow("founder_inference_receipt_ambiguous");
  await expect(
    t.mutation(
      (internal as any).founderInference.markCommunityInferenceProviderStartedInternal,
      { receiptKey, claimToken: "ambiguous-claim-0", nowMs: 131_011 },
    ),
  ).rejects.toThrow("founder_inference_receipt_ambiguous");
  await expect(
    t.mutation(
      (internal as any).founderInference.finalizeCommunityInferenceFailureInternal,
      {
        receiptKey,
        claimToken: "ambiguous-claim-0",
        promptTokens: 0,
        completionTokens: 0,
        usageComplete: true,
        failureCode: "ambiguous_test",
        disposition: "failed",
        nowMs: 131_012,
      },
    ),
  ).rejects.toThrow("founder_inference_receipt_ambiguous");
  await expect(
    t.mutation(
      (internal as any).founderInference.expireCommunityInferenceReceiptInternal,
      { receiptKey, expectedClaimToken: "ambiguous-claim-0" },
    ),
  ).rejects.toThrow("founder_inference_receipt_ambiguous");
  await t.run(async (ctx) => {
    await expect(settleAuthorizedFounderInferenceReceipt({
      ctx,
      receiptKey,
      claimToken: "ambiguous-claim-0",
      promptTokens: 1,
      completionTokens: 1,
      outcomeCode: "completed",
      nowMs: 131_013,
    })).rejects.toThrow("founder_inference_receipt_ambiguous");
    const cycles = await ctx.db
      .query("founderUsageCycles")
      .withIndex("by_subscription_status", (q) =>
        q.eq("founderSubscriptionId", fixture.founderSubscriptionId).eq("status", "open"),
      )
      .collect();
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toMatchObject({ reservedCostMicros: 0, settledCostMicros: 0 });
  });
});

test("receipt identifiers are non-empty and bounded before authorization", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createActiveFundingFixture(t, "receipt-identifiers", 140_000);
  const base = claimArgs(
    fixture,
    "community_agent_mention:receipt-identifiers",
    "identifier-claim",
    141_000,
  );
  const invalidCases = [
    { patch: { receiptKey: " " }, error: "founder_inference_receipt_key_invalid" },
    { patch: { receiptKey: "r".repeat(241) }, error: "founder_inference_receipt_key_invalid" },
    { patch: { sourceRunId: "" }, error: "founder_inference_source_run_invalid" },
    { patch: { sourceRunId: "s".repeat(241) }, error: "founder_inference_source_run_invalid" },
    { patch: { claimToken: "" }, error: "founder_inference_claim_token_invalid" },
    { patch: { claimToken: "c".repeat(129) }, error: "founder_inference_claim_token_invalid" },
  ];
  for (const invalid of invalidCases) {
    await expect(
      t.mutation(
        (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
        { ...base, ...invalid.patch },
      ),
    ).rejects.toThrow(invalid.error);
  }
  await t.run(async (ctx) => {
    expect(await ctx.db.query("communityInferenceReceipts").collect()).toHaveLength(0);
    const cycles = await ctx.db
      .query("founderUsageCycles")
      .withIndex("by_subscription_status", (q) =>
        q.eq("founderSubscriptionId", fixture.founderSubscriptionId).eq("status", "open"),
      )
      .collect();
    expect(cycles[0]).toMatchObject({ reservedCostMicros: 0, settledCostMicros: 0 });
  });
});

test("pre-provider expiration releases the reservation exactly once and blocks provider start", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createActiveFundingFixture(t, "receipt-expiration", 145_000);
  const receiptKey = "community_agent_mention:receipt-expiration";
  const claimToken = "expiration-claim";
  const claimed = await t.mutation(
    (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    claimArgs(fixture, receiptKey, claimToken, 146_000),
  );
  expect(claimed).toMatchObject({ ok: true, reclaimed: false });

  await expect(
    t.mutation(
      (internal as any).founderInference.expireCommunityInferenceReceiptInternal,
      { receiptKey, expectedClaimToken: claimToken },
    ),
  ).resolves.toEqual({ ok: true, status: "failed", alreadyFinalized: false });
  await expect(
    t.mutation(
      (internal as any).founderInference.expireCommunityInferenceReceiptInternal,
      { receiptKey, expectedClaimToken: claimToken },
    ),
  ).resolves.toEqual({ ok: true, status: "failed", alreadyFinalized: true });
  await expect(
    t.mutation(
      (internal as any).founderInference.markCommunityInferenceProviderStartedInternal,
      { receiptKey, claimToken, nowMs: 146_001 },
    ),
  ).resolves.toEqual({ ok: false, errorCode: "founder_inference_receipt_claim_invalid" });
  await t.run(async (ctx) => {
    const receipt = await ctx.db.get(claimed.receiptId) as any;
    expect(receipt).toMatchObject({
      status: "failed",
      failureCode: "authorization_expired_before_provider",
    });
    const cycle = await ctx.db.get(receipt.usageCycleId as any);
    expect(cycle).toMatchObject({ reservedCostMicros: 0, settledCostMicros: 0 });
  });
});

test("provider start fails closed when the authorization lease has already expired", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createActiveFundingFixture(t, "provider-start-expired", 146_100);
  const receiptKey = "community_agent_mention:provider-start-expired";
  const claimToken = "provider-start-expired-claim";
  const claimed = await t.mutation(
    (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    claimArgs(fixture, receiptKey, claimToken, 146_200),
  );
  await t.run(async (ctx) => {
    await ctx.db.patch(claimed.receiptId, {
      leaseExpiresAt: 146_201,
      updatedAt: 146_201,
    });
  });
  await expect(
    t.mutation(
      (internal as any).founderInference.markCommunityInferenceProviderStartedInternal,
      { receiptKey, claimToken, nowMs: 146_202 },
    ),
  ).resolves.toEqual({ ok: false, errorCode: "authorization_expired_before_provider" });
  await t.run(async (ctx) => {
    const receipt = await ctx.db.get(claimed.receiptId) as any;
    expect(receipt).toMatchObject({
      status: "failed",
      failureCode: "authorization_expired_before_provider",
    });
    expect(receipt).not.toHaveProperty("providerStartedAt");
    expect(await ctx.db.get(receipt.usageCycleId as any)).toMatchObject({
      reservedCostMicros: 0,
      settledCostMicros: 0,
    });
  });
});

test("duplicate provider start is idempotent and preserves the first start timestamp", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createActiveFundingFixture(t, "provider-start-idempotent", 146_300);
  const receiptKey = "community_agent_mention:provider-start-idempotent";
  const claimToken = "provider-start-idempotent-claim";
  const claimed = await t.mutation(
    (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    claimArgs(fixture, receiptKey, claimToken, 146_400),
  );

  await expect(
    t.mutation(
      (internal as any).founderInference.markCommunityInferenceProviderStartedInternal,
      { receiptKey, claimToken, nowMs: 146_401 },
    ),
  ).resolves.toEqual({ ok: true });
  await expect(
    t.mutation(
      (internal as any).founderInference.markCommunityInferenceProviderStartedInternal,
      { receiptKey, claimToken, nowMs: 146_402 },
    ),
  ).resolves.toEqual({ ok: true });

  await t.run(async (ctx) => {
    const receipt = await ctx.db.get(claimed.receiptId) as any;
    expect(receipt).toMatchObject({
      status: "authorized",
      providerStartedAt: 146_401,
      updatedAt: 146_401,
    });
    expect(await ctx.db.get(receipt.usageCycleId as any)).toMatchObject({
      reservedCostMicros: 1_000_000,
      settledCostMicros: 0,
    });
  });
});

test("duplicate provider start after expiration can never release known provider work", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createActiveFundingFixture(t, "provider-start-expiration-race", 146_500);
  const receiptKey = "community_agent_mention:provider-start-expiration-race";
  const claimToken = "provider-start-expiration-race-claim";
  const claimed = await t.mutation(
    (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    claimArgs(fixture, receiptKey, claimToken, 146_600),
  );
  await expect(
    t.mutation(
      (internal as any).founderInference.markCommunityInferenceProviderStartedInternal,
      { receiptKey, claimToken, nowMs: 146_601 },
    ),
  ).resolves.toEqual({ ok: true });
  await t.run(async (ctx) => {
    await ctx.db.patch(claimed.receiptId, {
      leaseExpiresAt: 146_602,
      updatedAt: 146_602,
    });
  });

  await expect(
    t.mutation(
      (internal as any).founderInference.markCommunityInferenceProviderStartedInternal,
      { receiptKey, claimToken, nowMs: 146_603 },
    ),
  ).resolves.toEqual({
    ok: false,
    errorCode: "provider_execution_deadline_exceeded",
  });
  await expect(
    t.mutation(
      (internal as any).founderInference.expireCommunityInferenceReceiptInternal,
      { receiptKey, expectedClaimToken: claimToken },
    ),
  ).resolves.toEqual({ ok: true, status: "indeterminate", alreadyFinalized: true });

  await t.run(async (ctx) => {
    const receipt = await ctx.db.get(claimed.receiptId) as any;
    expect(receipt).toMatchObject({
      status: "indeterminate",
      providerStartedAt: 146_601,
      failureCode: "provider_execution_deadline_exceeded",
      settledCostMicros: 1_000_000,
    });
    expect(await ctx.db.get(receipt.usageCycleId as any)).toMatchObject({
      reservedCostMicros: 0,
      settledCostMicros: 1_000_000,
    });
  });
});

test("expiration before a duplicate provider mark settles known provider work exactly once", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createActiveFundingFixture(t, "expiration-provider-start-race", 146_700);
  const receiptKey = "community_agent_mention:expiration-provider-start-race";
  const claimToken = "expiration-provider-start-race-claim";
  const claimed = await t.mutation(
    (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    claimArgs(fixture, receiptKey, claimToken, 146_800),
  );
  await expect(
    t.mutation(
      (internal as any).founderInference.markCommunityInferenceProviderStartedInternal,
      { receiptKey, claimToken, nowMs: 146_801 },
    ),
  ).resolves.toEqual({ ok: true });
  await t.run(async (ctx) => {
    await ctx.db.patch(claimed.receiptId, {
      leaseExpiresAt: 146_802,
      updatedAt: 146_802,
    });
  });

  await expect(
    t.mutation(
      (internal as any).founderInference.expireCommunityInferenceReceiptInternal,
      { receiptKey, expectedClaimToken: claimToken },
    ),
  ).resolves.toEqual({ ok: true, status: "indeterminate", alreadyFinalized: false });
  await expect(
    t.mutation(
      (internal as any).founderInference.markCommunityInferenceProviderStartedInternal,
      { receiptKey, claimToken, nowMs: 146_803 },
    ),
  ).resolves.toEqual({
    ok: false,
    errorCode: "founder_inference_receipt_claim_invalid",
  });

  await t.run(async (ctx) => {
    const receipt = await ctx.db.get(claimed.receiptId) as any;
    expect(receipt).toMatchObject({
      status: "indeterminate",
      providerStartedAt: 146_801,
      failureCode: "provider_execution_deadline_exceeded",
      settledCostMicros: 1_000_000,
    });
    expect(await ctx.db.get(receipt.usageCycleId as any)).toMatchObject({
      reservedCostMicros: 0,
      settledCostMicros: 1_000_000,
    });
  });
});

test("stale expiration cannot affect a reclaimed receipt and post-provider timeout closes it", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createActiveFundingFixture(t, "receipt-expiration-race", 147_000);
  const receiptKey = "community_agent_mention:receipt-expiration-race";
  const firstClaim = await t.mutation(
    (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    claimArgs(fixture, receiptKey, "expiration-old-claim", 148_000),
  );
  await t.run(async (ctx) => {
    await ctx.db.patch(firstClaim.receiptId, {
      leaseExpiresAt: 148_001,
      updatedAt: 148_001,
    });
  });
  await expect(
    t.mutation(
      (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
      claimArgs(fixture, receiptKey, "expiration-new-claim", 148_002),
    ),
  ).resolves.toMatchObject({ ok: true, receiptId: firstClaim.receiptId, reclaimed: true });
  await expect(
    t.mutation(
      (internal as any).founderInference.expireCommunityInferenceReceiptInternal,
      { receiptKey, expectedClaimToken: "expiration-old-claim" },
    ),
  ).resolves.toEqual({ ok: true, status: "stale_claim", alreadyFinalized: false });
  await expect(
    t.mutation(
      (internal as any).founderInference.markCommunityInferenceProviderStartedInternal,
      { receiptKey, claimToken: "expiration-new-claim", nowMs: 148_003 },
    ),
  ).resolves.toEqual({ ok: true });
  await expect(
    t.mutation(
      (internal as any).founderInference.expireCommunityInferenceReceiptInternal,
      { receiptKey, expectedClaimToken: "expiration-new-claim" },
    ),
  ).resolves.toEqual({ ok: true, status: "indeterminate", alreadyFinalized: false });
  await expect(
    t.mutation(
      (internal as any).founderInference.settleCommunityInferenceReceiptInternal,
      {
        receiptKey,
        claimToken: "expiration-new-claim",
        promptTokens: 100,
        completionTokens: 50,
        usageComplete: true,
        outcomeCode: "late_provider_completion",
        nowMs: 148_004,
      },
    ),
  ).rejects.toThrow("founder_inference_receipt_claim_invalid");
  await t.run(async (ctx) => {
    const receipt = await ctx.db.get(firstClaim.receiptId) as any;
    expect(receipt).toMatchObject({
      status: "indeterminate",
      claimToken: "expiration-new-claim",
      providerStartedAt: 148_003,
      failureCode: "provider_execution_deadline_exceeded",
      settledCostMicros: 1_000_000,
    });
    const cycle = await ctx.db.get(receipt.usageCycleId as any);
    expect(cycle).toMatchObject({ reservedCostMicros: 0, settledCostMicros: 1_000_000 });
  });
});

test("provider settlement before expiration wins without a second charge", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createActiveFundingFixture(t, "receipt-settlement-race", 148_100);
  const receiptKey = "community_agent_mention:receipt-settlement-race";
  const claimToken = "settlement-race-claim";
  const claimed = await t.mutation(
    (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    claimArgs(fixture, receiptKey, claimToken, 148_200),
  );
  await expect(
    t.mutation(
      (internal as any).founderInference.markCommunityInferenceProviderStartedInternal,
      { receiptKey, claimToken, nowMs: 148_201 },
    ),
  ).resolves.toEqual({ ok: true });
  await expect(
    t.mutation(
      (internal as any).founderInference.settleCommunityInferenceReceiptInternal,
      {
        receiptKey,
        claimToken,
        promptTokens: 100,
        completionTokens: 50,
        providerRequests: [{ requestId: "resp_settlement_race", modelId: "gpt-6-luna", serviceTier: "default", promptTokens: 100, completionTokens: 50, cachedInputTokens: 0, cacheWriteTokens: 0 }],
        usageComplete: true,
        outcomeCode: "provider_completed",
        nowMs: 148_202,
      },
    ),
  ).resolves.toMatchObject({ status: "settled", settledCostMicros: 35 });
  await expect(
    t.mutation(
      (internal as any).founderInference.expireCommunityInferenceReceiptInternal,
      { receiptKey, expectedClaimToken: claimToken },
    ),
  ).resolves.toEqual({ ok: true, status: "settled", alreadyFinalized: true });
  await t.run(async (ctx) => {
    const receipt = await ctx.db.get(claimed.receiptId) as any;
    expect(receipt).toMatchObject({
      status: "settled",
      settledCostMicros: 35,
      outcomeCode: "provider_completed",
    });
    expect(await ctx.db.get(receipt.usageCycleId as any)).toMatchObject({
      reservedCostMicros: 0,
      settledCostMicros: 35,
    });
  });
});

test("operator expiration is terminal without a ledger and missing receipts are idempotent", async () => {
  const t = convexTest(schema, modules);
  const receiptKey = "community_agent_mention:operator-expiration";
  const fixture = await t.run(async (ctx) => {
    const ownerId = await insertUser(ctx, "operator-expiration-owner", 149_000);
    const memberId = await insertUser(ctx, "operator-expiration-member", 149_000);
    const communityId = await insertCommunity(ctx, ownerId, "operator-expiration", 149_000);
    const receiptId = await ctx.db.insert("communityInferenceReceipts", {
      receiptKey,
      sourceRunId: "community-agent-serve:operator-expiration",
      communityId,
      actorUserId: memberId,
      payerUserId: ownerId,
      fundingMode: "platform_operator_grant",
      surface: "community_agent_mention",
      provider: "openai",
      modelId: "gpt-5.6-luna",
      status: "authorized",
      claimToken: "operator-expiration-claim",
      leaseExpiresAt: 149_001,
      pricingVersion: POLYNET_FOUNDER_PLAN_PRICING_VERSION,
      authorizedAt: 149_000,
      createdAt: 149_000,
      updatedAt: 149_000,
    });
    return { receiptId };
  });
  await expect(
    t.mutation(
      (internal as any).founderInference.expireCommunityInferenceReceiptInternal,
      { receiptKey, expectedClaimToken: "operator-expiration-claim" },
    ),
  ).resolves.toEqual({ ok: true, status: "failed", alreadyFinalized: false });
  await expect(
    t.mutation(
      (internal as any).founderInference.expireCommunityInferenceReceiptInternal,
      { receiptKey: "community_agent_mention:missing-expiration", expectedClaimToken: "missing-claim" },
    ),
  ).resolves.toEqual({ ok: true, status: "missing", alreadyFinalized: true });
  await t.run(async (ctx) => {
    expect(await ctx.db.get(fixture.receiptId)).toMatchObject({
      status: "failed",
      failureCode: "authorization_expired_before_provider",
    });
  });
});

test("post-provider operator expiration is indeterminate without ledger accounting", async () => {
  const t = convexTest(schema, modules);
  const receiptKey = "community_agent_mention:operator-provider-expiration";
  const fixture = await t.run(async (ctx) => {
    const ownerId = await insertUser(ctx, "operator-provider-expiration-owner", 149_100);
    const memberId = await insertUser(ctx, "operator-provider-expiration-member", 149_100);
    const communityId = await insertCommunity(
      ctx,
      ownerId,
      "operator-provider-expiration",
      149_100,
    );
    const receiptId = await ctx.db.insert("communityInferenceReceipts", {
      receiptKey,
      sourceRunId: "community-agent-serve:operator-provider-expiration",
      communityId,
      actorUserId: memberId,
      payerUserId: ownerId,
      fundingMode: "platform_operator_grant",
      surface: "community_agent_mention",
      provider: "openai",
      modelId: "gpt-5.6-luna",
      status: "authorized",
      claimToken: "operator-provider-expiration-claim",
      leaseExpiresAt: 149_101,
      providerStartedAt: 149_100,
      pricingVersion: POLYNET_FOUNDER_PLAN_PRICING_VERSION,
      authorizedAt: 149_100,
      createdAt: 149_100,
      updatedAt: 149_100,
    });
    return { receiptId };
  });
  await expect(
    t.mutation(
      (internal as any).founderInference.expireCommunityInferenceReceiptInternal,
      {
        receiptKey,
        expectedClaimToken: "operator-provider-expiration-claim",
      },
    ),
  ).resolves.toEqual({ ok: true, status: "indeterminate", alreadyFinalized: false });
  await t.run(async (ctx) => {
    expect(await ctx.db.get(fixture.receiptId)).toMatchObject({
      status: "indeterminate",
      failureCode: "provider_execution_deadline_exceeded",
    });
    expect(await ctx.db.query("founderUsageCycles").collect()).toHaveLength(0);
  });
});

test("expiration reschedules an unexpired provider-started lease without changing accounting", async () => {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const fixture = await createActiveFundingFixture(t, "receipt-expiration-pending", nowMs);
  const receiptKey = "community_agent_mention:receipt-expiration-pending";
  const claimToken = "expiration-pending-claim";
  const claimed = await t.mutation(
    (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    claimArgs(fixture, receiptKey, claimToken, nowMs),
  );
  await expect(
    t.mutation(
      (internal as any).founderInference.markCommunityInferenceProviderStartedInternal,
      { receiptKey, claimToken, nowMs: nowMs + 1 },
    ),
  ).resolves.toEqual({ ok: true });

  await expect(
    t.mutation(
      (internal as any).founderInference.expireCommunityInferenceReceiptInternal,
      { receiptKey, expectedClaimToken: claimToken },
    ),
  ).resolves.toEqual({ ok: true, status: "pending", alreadyFinalized: false });
  await t.run(async (ctx) => {
    const receipt = await ctx.db.get(claimed.receiptId) as any;
    expect(receipt).toMatchObject({
      status: "authorized",
      claimToken,
      providerStartedAt: nowMs + 1,
    });
    const cycle = await ctx.db.get(receipt.usageCycleId as any);
    expect(cycle).toMatchObject({ reservedCostMicros: 1_000_000, settledCostMicros: 0 });
  });
});

test("expiration never mutates terminal receipt states", async () => {
  const t = convexTest(schema, modules);
  const terminalRows = await t.run(async (ctx) => {
    const ownerId = await insertUser(ctx, "terminal-expiration-owner", 149_500);
    const memberId = await insertUser(ctx, "terminal-expiration-member", 149_500);
    const communityId = await insertCommunity(ctx, ownerId, "terminal-expiration", 149_500);
    const rows = [] as Array<{ receiptId: any; receiptKey: string; claimToken: string; status: "settled" | "failed" | "indeterminate" }>;
    for (const status of ["settled", "failed", "indeterminate"] as const) {
      const receiptKey = `community_agent_mention:terminal-expiration-${status}`;
      const claimToken = `terminal-expiration-${status}-claim`;
      const receiptId = await ctx.db.insert("communityInferenceReceipts", {
        receiptKey,
        sourceRunId: `community-agent-serve:terminal-expiration-${status}`,
        communityId,
        actorUserId: memberId,
        payerUserId: ownerId,
        fundingMode: "platform_operator_grant",
        surface: "community_agent_mention",
        provider: "openai",
        modelId: "gpt-5.6-luna",
        status,
        claimToken,
        leaseExpiresAt: 149_501,
        pricingVersion: POLYNET_FOUNDER_PLAN_PRICING_VERSION,
        authorizedAt: 149_500,
        createdAt: 149_500,
        updatedAt: 149_500,
      });
      rows.push({ receiptId, receiptKey, claimToken, status });
    }
    return rows;
  });

  for (const row of terminalRows) {
    await expect(
      t.mutation(
        (internal as any).founderInference.expireCommunityInferenceReceiptInternal,
        { receiptKey: row.receiptKey, expectedClaimToken: row.claimToken },
      ),
    ).resolves.toEqual({ ok: true, status: row.status, alreadyFinalized: true });
  }
  await t.run(async (ctx) => {
    for (const row of terminalRows) {
      expect(await ctx.db.get(row.receiptId)).toMatchObject({
        status: row.status,
        updatedAt: 149_500,
      });
    }
  });
});

test("post-provider expiration fails closed when subscription receipt authority is incomplete", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createActiveFundingFixture(t, "receipt-expiration-authority", 150_000);
  const receiptKey = "community_agent_mention:receipt-expiration-authority";
  const claimed = await t.mutation(
    (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    claimArgs(fixture, receiptKey, "expiration-authority-claim", 151_000),
  );
  await expect(
    t.mutation(
      (internal as any).founderInference.markCommunityInferenceProviderStartedInternal,
      {
        receiptKey,
        claimToken: "expiration-authority-claim",
        nowMs: 151_001,
      },
    ),
  ).resolves.toEqual({ ok: true });
  await t.run(async (ctx) => {
    await ctx.db.patch(claimed.receiptId, { usageCycleId: undefined });
  });
  await expect(
    t.mutation(
      (internal as any).founderInference.expireCommunityInferenceReceiptInternal,
      { receiptKey, expectedClaimToken: "expiration-authority-claim" },
    ),
  ).rejects.toThrow("founder_usage_receipt_authority_missing");
  await t.run(async (ctx) => {
    expect(await ctx.db.get(claimed.receiptId)).toMatchObject({
      status: "authorized",
      providerStartedAt: 151_001,
    });
    const cycles = await ctx.db
      .query("founderUsageCycles")
      .withIndex("by_subscription_status", (q) =>
        q.eq("founderSubscriptionId", fixture.founderSubscriptionId).eq("status", "open"),
      )
      .collect();
    expect(cycles[0]).toMatchObject({ reservedCostMicros: 1_000_000, settledCostMicros: 0 });
  });
});

test("receipt claims preserve the explicit community inference surface", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createActiveFundingFixture(t, "receipt-surfaces", 150_000);
  const surfaces = [
    "community_agent_mention",
    "community_autonomous_cognition",
  ] as const;
  for (const [index, surface] of surfaces.entries()) {
    const receiptKey = `${surface}:receipt-surface-${index}`;
    const claimed = await t.mutation(
      (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
      claimArgs(fixture, receiptKey, `surface-claim-${index}`, 151_000 + index, surface),
    );
    expect(claimed).toMatchObject({ ok: true, reclaimed: false });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(claimed.receiptId)).toMatchObject({ surface });
    });
    await t.mutation(
      (internal as any).founderInference.finalizeCommunityInferenceFailureInternal,
      {
        receiptKey,
        claimToken: `surface-claim-${index}`,
        promptTokens: 0,
        completionTokens: 0,
        usageComplete: true,
        failureCode: "surface_contract_test",
        disposition: "failed",
        nowMs: 151_100 + index,
      },
    );
  }
});

test("receipt authorization rate limits both an actor and the whole community", async () => {
  const actorTest = convexTest(schema, modules);
  const actorFixture = await createActiveFundingFixture(actorTest, "actor-rate", 200_000);
  for (let index = 0; index < 6; index += 1) {
    await expect(
      actorTest.mutation(
        (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
        claimArgs(
          actorFixture,
          `community_agent_mention:actor-rate-${index}`,
          `actor-rate-claim-${index}`,
          201_000 + index,
        ),
      ),
    ).resolves.toMatchObject({ ok: true });
  }
  await expect(
    actorTest.mutation(
      (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
      claimArgs(
        actorFixture,
        "community_agent_mention:actor-rate-blocked",
        "actor-rate-claim-blocked",
        201_010,
      ),
    ),
  ).resolves.toMatchObject({ ok: false, errorCode: "founder_inference_actor_rate_limited" });

  const communityTest = convexTest(schema, modules);
  const communityFixture = await createActiveFundingFixture(communityTest, "community-rate", 300_000);
  await communityTest.run(async (ctx) => {
    for (let index = 0; index < 60; index += 1) {
      const actorUserId = await insertUser(ctx, `community-rate-${index}`, 301_000 + index);
      await ctx.db.insert("communityInferenceReceipts", {
        receiptKey: `community_agent_mention:community-rate-${index}`,
        sourceRunId: `community-agent-serve:community-rate-${index}`,
        communityId: communityFixture.communityId,
        actorUserId,
        payerUserId: communityFixture.ownerId,
        fundingMode: "platform_subscription",
        founderSubscriptionId: communityFixture.founderSubscriptionId,
        surface: "community_agent_mention",
        provider: "openai",
        modelId: "gpt-5.6-luna",
        status: "failed",
        claimToken: `community-rate-claim-${index}`,
        leaseExpiresAt: 302_000,
        failureCode: "pre_spend_failure",
        authorizedAt: 301_000 + index,
        failedAt: 301_000 + index,
        createdAt: 301_000 + index,
        updatedAt: 301_000 + index,
      });
    }
  });
  await expect(
    communityTest.mutation(
      (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
      claimArgs(
        communityFixture,
        "community_agent_mention:community-rate-blocked",
        "community-rate-claim-blocked",
        302_000,
      ),
    ),
  ).resolves.toMatchObject({ ok: false, errorCode: "founder_inference_community_rate_limited" });
});

test("provider start revalidates ownership and failure settlement preserves known usage", async () => {
  const authorityTest = convexTest(schema, modules);
  const authorityFixture = await createActiveFundingFixture(authorityTest, "authority-change", 400_000);
  const authorityReceiptKey = "community_agent_mention:authority-change";
  const authorityClaim = await authorityTest.mutation(
    (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    claimArgs(authorityFixture, authorityReceiptKey, "authority-claim", 401_000),
  );
  await authorityTest.run(async (ctx) => {
    const newOwnerId = await insertUser(ctx, "authority-new-owner", 401_001);
    await ctx.db.patch(authorityFixture.communityId, { ownerId: newOwnerId, updatedAt: 401_001 });
  });
  await expect(
    authorityTest.mutation(
      (internal as any).founderInference.markCommunityInferenceProviderStartedInternal,
      { receiptKey: authorityReceiptKey, claimToken: "authority-claim", nowMs: 401_002 },
    ),
  ).resolves.toMatchObject({ ok: false, errorCode: "funding_authority_changed" });
  await authorityTest.run(async (ctx) => {
    expect(await ctx.db.get(authorityClaim.receiptId)).toMatchObject({
      status: "failed",
      failureCode: "funding_authority_changed",
    });
  });

  const settlementTest = convexTest(schema, modules);
  const settlementFixture = await createActiveFundingFixture(settlementTest, "settlement", 500_000);
  const knownReceiptKey = "community_agent_mention:settlement-known";
  const knownClaim = await settlementTest.mutation(
    (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    claimArgs(settlementFixture, knownReceiptKey, "known-claim", 501_000),
  );
  await expect(
    settlementTest.mutation(
      (internal as any).founderInference.finalizeCommunityInferenceFailureInternal,
      {
        receiptKey: knownReceiptKey,
        claimToken: "known-claim",
        promptTokens: 123,
        completionTokens: 45,
        providerRequests: [{ requestId: "resp_known_failure", modelId: "gpt-6-luna", serviceTier: "default", promptTokens: 123, completionTokens: 45, cachedInputTokens: 0, cacheWriteTokens: 0 }],
        usageComplete: true,
        failureCode: "provider_error_after_usage",
        disposition: "indeterminate",
        nowMs: 501_001,
      },
    ),
  ).resolves.toEqual({ ok: true, status: "settled" });
  await settlementTest.run(async (ctx) => {
    expect(await ctx.db.get(knownClaim.receiptId)).toMatchObject({
      status: "settled",
      promptTokens: 123,
      completionTokens: 45,
      outcomeCode: "provider_error_after_usage",
    });
  });

  const unknownReceiptKey = "community_agent_mention:settlement-unknown";
  const unknownClaim = await settlementTest.mutation(
    (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    claimArgs(settlementFixture, unknownReceiptKey, "unknown-claim", 501_002),
  );
  await expect(
    settlementTest.mutation(
      (internal as any).founderInference.finalizeCommunityInferenceFailureInternal,
      {
        receiptKey: unknownReceiptKey,
        claimToken: "unknown-claim",
        promptTokens: 0,
        completionTokens: 0,
        usageComplete: false,
        failureCode: "provider_error",
        disposition: "indeterminate",
        nowMs: 501_003,
      },
    ),
  ).resolves.toEqual({ ok: true, status: "indeterminate" });
  await settlementTest.run(async (ctx) => {
    const unknownReceipt = await ctx.db.get(unknownClaim.receiptId) as any;
    expect(unknownReceipt).toMatchObject({
      status: "indeterminate",
      failureCode: "provider_token_usage_missing",
      settledCostMicros: 1_000_000,
    });
    const cycle = await ctx.db.get(unknownReceipt?.usageCycleId as any);
    expect(cycle).toMatchObject({
      reservedCostMicros: 0,
      settledCostMicros: 1_000_035,
    });
  });
});

test("zero-token indeterminate failure consumes the full reservation", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createActiveFundingFixture(t, "zero-token-indeterminate", 525_000);
  const receiptKey = "community_agent_mention:zero-token-indeterminate";
  const claimToken = "zero-token-indeterminate-claim";
  const claimed = await t.mutation(
    (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    claimArgs(fixture, receiptKey, claimToken, 526_000),
  );

  await expect(
    t.mutation(
      (internal as any).founderInference.finalizeCommunityInferenceFailureInternal,
      {
        receiptKey,
        claimToken,
        promptTokens: 0,
        completionTokens: 0,
        usageComplete: true,
        failureCode: "provider_inference_unavailable",
        disposition: "indeterminate",
        nowMs: 526_001,
      },
    ),
  ).resolves.toEqual({ ok: true, status: "indeterminate" });
  await t.run(async (ctx) => {
    const receipt = await ctx.db.get(claimed.receiptId) as any;
    expect(receipt).toMatchObject({
      status: "indeterminate",
      failureCode: "provider_token_usage_missing",
      settledCostMicros: 1_000_000,
    });
    expect(await ctx.db.get(receipt.usageCycleId as any)).toMatchObject({
      reservedCostMicros: 0,
      settledCostMicros: 1_000_000,
    });
  });
});

test("known-no-spend finalization validates the complete receipt authority before release", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createActiveFundingFixture(t, "known-no-spend-authority", 530_000);
  const otherFixture = await createActiveFundingFixture(t, "known-no-spend-other", 530_000);
  const receiptKey = "community_agent_mention:known-no-spend-authority";
  const claimToken = "known-no-spend-authority-claim";
  const claimed = await t.mutation(
    (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    claimArgs(fixture, receiptKey, claimToken, 531_000),
  );
  const original = await t.run(async (ctx) => {
    const receipt = await ctx.db.get(claimed.receiptId) as any;
    const otherCycles = await ctx.db
      .query("founderUsageCycles")
      .withIndex("by_subscription_status", (q) =>
        q.eq("founderSubscriptionId", otherFixture.founderSubscriptionId).eq("status", "open"),
      )
      .collect();
    expect(otherCycles).toHaveLength(1);
    return { receipt, otherCycleId: otherCycles[0]!._id };
  });
  const conflicts = [
    {
      patch: { usageCycleId: original.otherCycleId },
      restore: { usageCycleId: original.receipt.usageCycleId },
      error: "founder_usage_cycle_authority_mismatch",
    },
    {
      patch: { founderSubscriptionId: otherFixture.founderSubscriptionId },
      restore: { founderSubscriptionId: original.receipt.founderSubscriptionId },
      error: "founder_usage_cycle_authority_mismatch",
    },
    {
      patch: { communityId: otherFixture.communityId },
      restore: { communityId: original.receipt.communityId },
      error: "founder_usage_cycle_community_mismatch",
    },
    {
      patch: { payerUserId: otherFixture.ownerId },
      restore: { payerUserId: original.receipt.payerUserId },
      error: "founder_usage_cycle_community_mismatch",
    },
    {
      patch: { pricingVersion: "wrong-pricing-version" },
      restore: { pricingVersion: original.receipt.pricingVersion },
      error: "founder_inference_pricing_version_mismatch",
    },
  ];

  for (const conflict of conflicts) {
    await t.run(async (ctx) => {
      await ctx.db.patch(claimed.receiptId, conflict.patch as any);
    });
    await expect(
      t.mutation(
        (internal as any).founderInference.finalizeCommunityInferenceFailureInternal,
        {
          receiptKey,
          claimToken,
          promptTokens: 0,
          completionTokens: 0,
          usageComplete: true,
          failureCode: "known_no_spend",
          disposition: "failed",
          nowMs: 531_001,
        },
      ),
    ).rejects.toThrow(conflict.error);
    await t.run(async (ctx) => {
      expect(await ctx.db.get(claimed.receiptId)).toMatchObject({ status: "authorized" });
      await ctx.db.patch(claimed.receiptId, conflict.restore as any);
    });
  }

  await expect(
    t.mutation(
      (internal as any).founderInference.finalizeCommunityInferenceFailureInternal,
      {
        receiptKey,
        claimToken,
        promptTokens: 0,
        completionTokens: 0,
        usageComplete: true,
        failureCode: "known_no_spend",
        disposition: "failed",
        nowMs: 531_002,
      },
    ),
  ).resolves.toEqual({ ok: true, status: "failed" });
  await expect(
    t.mutation(
      (internal as any).founderInference.finalizeCommunityInferenceFailureInternal,
      {
        receiptKey,
        claimToken,
        promptTokens: 0,
        completionTokens: 0,
        usageComplete: true,
        failureCode: "known_no_spend_duplicate",
        disposition: "failed",
        nowMs: 531_003,
      },
    ),
  ).resolves.toEqual({ ok: false, errorCode: "founder_inference_receipt_claim_invalid" });
  await t.run(async (ctx) => {
    expect(await ctx.db.get(claimed.receiptId)).toMatchObject({
      status: "failed",
      failureCode: "known_no_spend",
    });
    expect(await ctx.db.get(original.receipt.usageCycleId as any)).toMatchObject({
      reservedCostMicros: 0,
      settledCostMicros: 0,
    });
    expect(await ctx.db.get(original.otherCycleId as any)).toMatchObject({
      reservedCostMicros: 0,
      settledCostMicros: 0,
    });
  });
});

test("shared founder allowance rejects malformed ledger values and settlement above reservation", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createActiveFundingFixture(t, "ledger-invariants", 550_000);
  await t.run(async (ctx) => {
    const [cycle] = await ctx.db
      .query("founderUsageCycles")
      .withIndex("by_subscription_status", (q) =>
        q.eq("founderSubscriptionId", fixture.founderSubscriptionId).eq("status", "open"),
      )
      .collect();
    if (!cycle) throw new Error("test_usage_cycle_missing");
    await ctx.db.patch(cycle._id, { maxRunReservationCostMicros: 1.5 });
    await expect(reserveFounderUsage({
      ctx,
      founderSubscriptionId: fixture.founderSubscriptionId,
      communityId: fixture.communityId,
      nowMs: 551_000,
    })).resolves.toEqual({
      ok: false,
      code: "founder_inference_pricing_misconfigured",
    });
    await ctx.db.patch(cycle._id, { maxRunReservationCostMicros: 1_000_000 });

    const reservation = await reserveFounderUsage({
      ctx,
      founderSubscriptionId: fixture.founderSubscriptionId,
      communityId: fixture.communityId,
      nowMs: 551_001,
    });
    if (!reservation.ok) throw new Error(reservation.code);

    await expect(settleFounderUsageReservation({
      ctx,
      usageCycleId: reservation.cycle._id,
      reservedCostMicros: reservation.reservationCostMicros,
      settledCostMicros: reservation.reservationCostMicros + 1,
      nowMs: 551_002,
    })).rejects.toThrow("founder_usage_settlement_exceeds_reservation");
    await expect(settleFounderUsageReservation({
      ctx,
      usageCycleId: reservation.cycle._id,
      reservedCostMicros: reservation.reservationCostMicros + 0.5,
      settledCostMicros: reservation.reservationCostMicros,
      nowMs: 551_003,
    })).rejects.toThrow("founder_usage_settlement_invalid");
    expect(await ctx.db.get(reservation.cycle._id)).toMatchObject({
      reservedCostMicros: reservation.reservationCostMicros,
      settledCostMicros: 0,
    });
  });
});

test("shared founder allowance fails closed when persisted cycle totals are corrupt", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createActiveFundingFixture(t, "ledger-corrupt", 560_000);
  await t.run(async (ctx) => {
    const cycles = await ctx.db
      .query("founderUsageCycles")
      .withIndex("by_subscription_status", (q) =>
        q.eq("founderSubscriptionId", fixture.founderSubscriptionId).eq("status", "open"),
      )
      .collect();
    expect(cycles).toHaveLength(1);
    await ctx.db.patch(cycles[0]!._id, {
      reservedCostMicros: 1,
      settledCostMicros: 20_000_000,
      updatedAt: 560_001,
    });
    await expect(reserveFounderUsage({
      ctx,
      founderSubscriptionId: fixture.founderSubscriptionId,
      communityId: fixture.communityId,
      nowMs: 560_002,
    })).rejects.toThrow("founder_usage_cycle_ledger_invalid");
    await expect(settleFounderUsageReservation({
      ctx,
      usageCycleId: cycles[0]!._id,
      reservedCostMicros: 1,
      settledCostMicros: 1,
      nowMs: 560_003,
    })).rejects.toThrow("founder_usage_cycle_ledger_invalid");
  });
});

test("a community-targeted founder subscription meters managed Luna usage", async () => {
  const priorEnv = {
    input: process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS,
    output: process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS,
    reservation: process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS,
  };
  process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS = "1000000";
  process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS = "2000000";
  process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS = "1000000";
  try {
    const t = convexTest(schema, modules);
    const nowMs = Date.now();
    const fixture = await t.run(async (ctx) => {
      const ownerId = await insertUser(ctx, "paid-owner", nowMs);
      const memberId = await insertUser(ctx, "paid-member", nowMs);
      const communityId = await insertCommunity(ctx, ownerId, "paid-community", nowMs);
      const founderSubscriptionId = await ctx.db.insert("founderSubscriptions", {
        ownerUserId: ownerId,
        communityId,
        provider: "stripe",
        providerCustomerId: "cus_founder_paid",
        providerSubscriptionId: "sub_founder_paid",
        providerPriceId: "price_founder_paid",
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
      await syncFounderUsageCycle({
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
      return { communityId, founderSubscriptionId, memberId, ownerId };
    });

    await expect(
      t.run(async (ctx) =>
        await resolveCommunityInferenceFundingAdmission(ctx, fixture.communityId),
      ),
    ).resolves.toMatchObject({
      ok: true,
      mode: "platform_subscription",
      payerUserId: fixture.ownerId,
      subscriptionId: fixture.founderSubscriptionId,
      modelId: "gpt-6-luna",
    });

    const receiptKey = "community_agent_mention:paid-founder";
    const claimed = await t.mutation(
      (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
      {
        receiptKey,
        sourceRunId: "community-agent-serve:paid-founder",
        communityId: fixture.communityId,
        actorUserId: fixture.memberId,
        expectedPayerUserId: fixture.ownerId,
        expectedFundingMode: "platform_subscription",
        expectedFounderSubscriptionId: fixture.founderSubscriptionId,
        surface: "community_agent_mention",
        claimToken: "paid-founder-claim",
        nowMs: nowMs + 1_000,
      },
    );
    expect(claimed).toMatchObject({ ok: true, reclaimed: false });
    await t.run(async (ctx) => {
      const receipt = (await ctx.db.get(claimed.receiptId)) as any;
      expect(receipt).toMatchObject({
        fundingMode: "platform_subscription",
        founderSubscriptionId: fixture.founderSubscriptionId,
        pricingVersion: "gpt_6_luna_standard_v1",
        reservedCostMicros: 1_000_000,
      });
      const cycle = await ctx.db.get(receipt?.usageCycleId as any);
      expect(cycle).toMatchObject({ reservedCostMicros: 1_000_000, settledCostMicros: 0 });
    });
    await expect(
      t.mutation(
        (internal as any).founderInference.markCommunityInferenceProviderStartedInternal,
        { receiptKey, claimToken: "paid-founder-claim", nowMs: nowMs + 2_000 },
      ),
    ).resolves.toEqual({ ok: true });
    await t.run(async (ctx) => {
      await settleAuthorizedFounderInferenceReceipt({
        ctx,
        receiptKey,
        claimToken: "paid-founder-claim",
        promptTokens: 1_000,
        completionTokens: 500,
        providerRequests: [{ requestId: "resp_paid-founder-claim", modelId: "gpt-6-luna", serviceTier: "default", promptTokens: 1_000, completionTokens: 500, cachedInputTokens: 0, cacheWriteTokens: 0 }],
        outcomeCode: "completed",
        nowMs: nowMs + 3_000,
      });
      const receipt = (await ctx.db.get(claimed.receiptId)) as any;
      expect(receipt).toMatchObject({ status: "settled", settledCostMicros: 350 });
      const cycle = await ctx.db.get(receipt?.usageCycleId as any);
      expect(cycle).toMatchObject({ reservedCostMicros: 0, settledCostMicros: 350 });
      await ctx.db.patch(receipt.usageCycleId, {
        settledCostMicros: 19_500_001,
        updatedAt: nowMs + 3_100,
      });
    });
    await expect(
      t.mutation(
        (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
        {
          receiptKey: "community_agent_mention:paid-founder-exhausted",
          sourceRunId: "community-agent-serve:paid-founder-exhausted",
          communityId: fixture.communityId,
          actorUserId: fixture.memberId,
          expectedPayerUserId: fixture.ownerId,
          expectedFundingMode: "platform_subscription",
          expectedFounderSubscriptionId: fixture.founderSubscriptionId,
          surface: "community_agent_mention",
          claimToken: "paid-founder-exhausted-claim",
          nowMs: nowMs + 3_200,
        },
      ),
    ).resolves.toMatchObject({ ok: false, errorCode: "founder_usage_exhausted" });
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.founderSubscriptionId, {
        status: "past_due",
        updatedAt: nowMs + 4_000,
      });
      await expect(
        resolveCommunityInferenceFundingAdmission(ctx, fixture.communityId),
      ).resolves.toEqual({ ok: false, code: "founder_subscription_inactive" });
    });
  } finally {
    if (priorEnv.input === undefined) delete process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS;
    else process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS = priorEnv.input;
    if (priorEnv.output === undefined) delete process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS;
    else process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS = priorEnv.output;
    if (priorEnv.reservation === undefined) delete process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS;
    else process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS = priorEnv.reservation;
  }
});

test("founder usage authority cannot be unattached or rebound across communities", async () => {
  const t = convexTest(schema, modules);
  const nowMs = 640_000;
  await t.run(async (ctx) => {
    const ownerId = await insertUser(ctx, "binding-owner", nowMs);
    const memberId = await insertUser(ctx, "binding-member", nowMs);
    const firstCommunityId = await insertCommunity(ctx, ownerId, "binding-first", nowMs);
    const secondCommunityId = await insertCommunity(ctx, ownerId, "binding-second", nowMs);
    const founderSubscriptionId = await ctx.db.insert("founderSubscriptions", {
      ownerUserId: ownerId,
      communityId: firstCommunityId,
      provider: "stripe",
      providerCustomerId: "cus_binding",
      providerSubscriptionId: "sub_binding",
      providerPriceId: "price_binding",
      status: "active",
      currentPeriodStartAt: nowMs - 1_000,
      currentPeriodEndAt: nowMs + 30_000,
      cancelAtPeriodEnd: false,
      lastProviderEventCreatedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const subscription = await ctx.db.get(founderSubscriptionId);
    if (!subscription) throw new Error("test_subscription_missing");
    const pricing: FounderInferencePricing = {
      pricingVersion: POLYNET_FOUNDER_PLAN_PRICING_VERSION,
      includedCostMicros: 20_000_000,
      inputCostMicrosPerMillionTokens: 1_000_000,
      outputCostMicrosPerMillionTokens: 2_000_000,
      maxRunReservationCostMicros: 1_000_000,
    };
    const cycle = await syncFounderUsageCycle({
      ctx,
      subscription: subscription as any,
      cycleStartAt: nowMs - 1_000,
      cycleEndAt: nowMs + 30_000,
      pricing,
      nowMs,
    });
    if (!cycle) throw new Error("test_usage_cycle_missing");

    await expect(
      syncFounderUsageCycle({
        ctx,
        subscription: { ...subscription, communityId: undefined } as any,
        cycleStartAt: nowMs - 1_000,
        cycleEndAt: nowMs + 30_000,
        pricing,
        nowMs: nowMs + 1,
      }),
    ).rejects.toThrow("founder_subscription_community_missing");
    await expect(
      syncFounderUsageCycle({
        ctx,
        subscription: { ...subscription, communityId: secondCommunityId } as any,
        cycleStartAt: nowMs - 1_000,
        cycleEndAt: nowMs + 30_000,
        pricing,
        nowMs: nowMs + 2,
      }),
    ).rejects.toThrow("founder_usage_cycle_community_mismatch");

    const receiptKey = "community_agent_mention:binding-mismatch";
    await ctx.db.insert("communityInferenceReceipts", {
      receiptKey,
      sourceRunId: "community-agent-serve:binding-mismatch",
      communityId: firstCommunityId,
      actorUserId: memberId,
      payerUserId: ownerId,
      fundingMode: "platform_subscription",
      founderSubscriptionId,
      usageCycleId: cycle._id,
      surface: "community_agent_mention",
      provider: "openai",
      modelId: "gpt-5.6-luna",
      status: "authorized",
      claimToken: "binding-claim",
      leaseExpiresAt: nowMs + 60_000,
      pricingVersion: POLYNET_FOUNDER_PLAN_PRICING_VERSION,
      reservedCostMicros: 1_000,
      authorizedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.patch(cycle._id, {
      communityId: secondCommunityId,
      reservedCostMicros: 1_000,
      updatedAt: nowMs + 3,
    });
    await expect(
      settleAuthorizedFounderInferenceReceipt({
        ctx,
        receiptKey,
        claimToken: "binding-claim",
        promptTokens: 1,
        completionTokens: 1,
        outcomeCode: "completed",
        nowMs: nowMs + 4,
      }),
    ).rejects.toThrow("founder_usage_cycle_community_mismatch");
  });
});

test("managed policy fails closed and founder checkouts remain independent per community", async () => {
  const t = convexTest(schema, modules);
  const nowMs = 650_000;
  const fixture = await t.run(async (ctx) => {
    const ownerId = await insertUser(ctx, "checkout-owner", nowMs);
    const otherOwnerId = await insertUser(ctx, "checkout-other-owner", nowMs);
    const firstCommunityId = await insertCommunity(ctx, ownerId, "checkout-first", nowMs);
    const secondCommunityId = await insertCommunity(ctx, ownerId, "checkout-second", nowMs);
    const otherCommunityId = await insertCommunity(
      ctx,
      otherOwnerId,
      "checkout-other",
      nowMs,
    );
    await ctx.db.patch(firstCommunityId, {
      inferenceFundingPolicy: "managed_required",
      updatedAt: nowMs,
    });
    return {
      ownerId,
      firstCommunityId,
      secondCommunityId,
      otherCommunityId,
    };
  });

  await expect(
    t.run(async (ctx) =>
      await resolveCommunityInferenceFundingAdmission(
        ctx,
        fixture.firstCommunityId,
      ),
    ),
  ).resolves.toEqual({ ok: false, code: "founder_plan_required" });

  await t.mutation(
    (internal as any).founderBilling.createPendingFounderSubscriptionCheckoutInternal,
    {
      sessionId: "founder-checkout-first",
      ownerUserId: fixture.ownerId,
      communityId: fixture.firstCommunityId,
      expiresAt: nowMs + 60_000,
      nowMs,
    },
  );
  await expect(
    t.mutation(
      (internal as any).founderBilling.createPendingFounderSubscriptionCheckoutInternal,
      {
        sessionId: "founder-checkout-second",
        ownerUserId: fixture.ownerId,
        communityId: fixture.secondCommunityId,
        expiresAt: nowMs + 60_000,
        nowMs,
      },
    ),
  ).resolves.toMatchObject({
    sessionId: "founder-checkout-second",
    reused: false,
  });
  await expect(
    t.mutation(
      (internal as any).founderBilling.createPendingFounderSubscriptionCheckoutInternal,
      {
        sessionId: "founder-checkout-duplicate",
        ownerUserId: fixture.ownerId,
        communityId: fixture.firstCommunityId,
        expiresAt: nowMs + 60_000,
        nowMs,
      },
    ),
  ).resolves.toMatchObject({
    sessionId: "founder-checkout-first",
    reused: true,
  });
  await expect(
    t.mutation(
      (internal as any).founderBilling.createPendingFounderSubscriptionCheckoutInternal,
      {
        sessionId: "founder-checkout-forbidden",
        ownerUserId: fixture.ownerId,
        communityId: fixture.otherCommunityId,
        expiresAt: nowMs + 60_000,
        nowMs,
      },
    ),
  ).rejects.toThrow("founder_subscription_community_forbidden");
});

test("community subscription history selects one granting row and rejects two", async () => {
  const t = convexTest(schema, modules);
  const nowMs = 675_000;
  await t.run(async (ctx) => {
    const ownerId = await insertUser(ctx, "history-owner", nowMs);
    const communityId = await insertCommunity(ctx, ownerId, "history-community", nowMs);
    await ctx.db.insert("founderSubscriptions", {
      ownerUserId: ownerId,
      communityId,
      provider: "stripe",
      providerCustomerId: "cus_history",
      providerSubscriptionId: "sub_history_ended",
      providerPriceId: "price_history",
      status: "ended",
      currentPeriodStartAt: nowMs - 100_000,
      currentPeriodEndAt: nowMs - 50_000,
      cancelAtPeriodEnd: false,
      endedAt: nowMs - 50_000,
      lastProviderEventCreatedAt: nowMs - 50_000,
      createdAt: nowMs - 100_000,
      updatedAt: nowMs - 50_000,
    });
    const activeId = await ctx.db.insert("founderSubscriptions", {
      ownerUserId: ownerId,
      communityId,
      provider: "stripe",
      providerCustomerId: "cus_history",
      providerSubscriptionId: "sub_history_active",
      providerPriceId: "price_history",
      status: "active",
      currentPeriodStartAt: nowMs - 10_000,
      currentPeriodEndAt: nowMs + 100_000,
      cancelAtPeriodEnd: false,
      lastProviderEventCreatedAt: nowMs,
      createdAt: nowMs - 10_000,
      updatedAt: nowMs,
    });
    await expect(
      getFounderSubscriptionByCommunity(ctx, communityId, nowMs),
    ).resolves.toMatchObject({ _id: activeId });
    await ctx.db.insert("founderSubscriptions", {
      ownerUserId: ownerId,
      communityId,
      provider: "stripe",
      providerCustomerId: "cus_history",
      providerSubscriptionId: "sub_history_ambiguous",
      providerPriceId: "price_history",
      status: "cancel_at_period_end",
      currentPeriodStartAt: nowMs - 5_000,
      currentPeriodEndAt: nowMs + 100_000,
      cancelAtPeriodEnd: true,
      lastProviderEventCreatedAt: nowMs,
      createdAt: nowMs - 5_000,
      updatedAt: nowMs,
    });
    await expect(
      getFounderSubscriptionByCommunity(ctx, communityId, nowMs),
    ).rejects.toThrow("founder_subscription_ambiguous");
  });
});

test("Stripe founder subscription sync is idempotent and ignores stale lifecycle events", async () => {
  const priorEnv = {
    priceId: process.env.POLYNET_FOUNDER_STRIPE_PRICE_ID,
    input: process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS,
    output: process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS,
    reservation: process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS,
  };
  process.env.POLYNET_FOUNDER_STRIPE_PRICE_ID = "price_founder_79";
  process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS = "1000000";
  process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS = "2000000";
  process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS = "1000000";
  try {
    const t = convexTest(schema, modules);
    const fixture = await t.run(async (ctx) => {
      const ownerId = await insertUser(ctx, "stripe-sync-owner", 700_000);
      const communityId = await insertCommunity(
        ctx,
        ownerId,
        "stripe-sync-community",
        700_000,
      );
      return { ownerId, communityId };
    });
    await t.mutation(
      (internal as any).founderBilling.createPendingFounderSubscriptionCheckoutInternal,
      {
        sessionId: "founder-checkout-sync",
        ownerUserId: fixture.ownerId,
        communityId: fixture.communityId,
        expiresAt: 9_000_000,
        nowMs: 700_000,
      },
    );
    const syncArgs = {
      localSessionId: "founder-checkout-sync",
      providerCheckoutSessionId: "cs_founder_sync",
      providerCustomerId: "cus_founder_sync",
      providerSubscriptionId: "sub_founder_sync",
      providerPriceId: "price_founder_79",
      subscriptionStatus: "active",
      currentPeriodStartAt: 700_000,
      currentPeriodEndAt: 3_292_000_000,
      cancelAtPeriodEnd: false,
      providerEventCreatedAt: 710_000,
    };
    const first = await t.mutation(
      (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
      syncArgs,
    );
    expect(first).toMatchObject({ ok: true, ignored: false, subscriptionStatus: "active" });
    expect(first).toMatchObject({ communityId: fixture.communityId });
    const replay = await t.mutation(
      (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
      syncArgs,
    );
    expect(replay).toMatchObject({
      ok: true,
      ignored: false,
      founderSubscriptionId: first.founderSubscriptionId,
      usageCycleId: first.usageCycleId,
    });
    await expect(
      t.mutation(
        (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
        {
          ...syncArgs,
          localSessionId: null,
          subscriptionStatus: "past_due",
          providerEventCreatedAt: 709_999,
        },
      ),
    ).resolves.toMatchObject({ ok: true, ignored: true, reason: "founder_subscription_event_stale" });
    await expect(
      t.mutation(
        (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
        {
          ...syncArgs,
          localSessionId: null,
          providerCustomerId: "cus_wrong_owner",
          providerEventCreatedAt: 711_000,
        },
      ),
    ).rejects.toThrow("founder_subscription_customer_mismatch");
    await expect(
      t.mutation(
        (internal as any).founderBilling.syncFounderSubscriptionRiskStatusInternal,
        {
          providerSubscriptionId: "sub_founder_sync",
          status: "ended",
          revokedReason: "subscription_refunded",
          providerEventCreatedAt: 720_000,
        },
      ),
    ).resolves.toMatchObject({
      ok: true,
      ignored: false,
      subscriptionStatus: "ended",
      revokedReason: "subscription_refunded",
    });
    const restored = await t.mutation(
      (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
      {
        ...syncArgs,
        localSessionId: null,
        providerEventCreatedAt: 730_000,
        allowRiskRestoration: true,
      },
    );
    expect(restored).toMatchObject({ ok: true, ignored: false, subscriptionStatus: "active" });
    await expect(
      t.mutation(
        (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
        {
          ...syncArgs,
          localSessionId: null,
          providerPriceId: "price_unmanaged_replacement",
          providerEventCreatedAt: 740_000,
        },
      ),
    ).resolves.toMatchObject({
      ok: true,
      ignored: false,
      subscriptionStatus: "ended",
      revokedReason: "founder_subscription_price_changed",
    });
    await t.mutation(
      (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
      {
        ...syncArgs,
        localSessionId: null,
        providerEventCreatedAt: 750_000,
      },
    );
    await t.run(async (ctx) => {
      expect(await ctx.db.query("founderSubscriptions").collect()).toHaveLength(1);
      expect(await ctx.db.query("founderUsageCycles").collect()).toHaveLength(1);
      const subscription = await ctx.db.get(first.founderSubscriptionId);
      expect(subscription).toMatchObject({ status: "active" });
      expect(subscription).toMatchObject({ communityId: fixture.communityId });
      const community = await ctx.db.get(fixture.communityId);
      expect(community).toMatchObject({ inferenceFundingPolicy: "managed_required" });
      expect(subscription).not.toHaveProperty("endedAt");
      expect(subscription).not.toHaveProperty("revokedReason");
      const checkout = await ctx.db
        .query("checkoutSessions")
        .withIndex("by_sessionId", (q: any) => q.eq("sessionId", "founder-checkout-sync"))
        .first();
      expect(checkout).toMatchObject({
        status: "complete",
        communityId: fixture.communityId,
        founderSubscriptionId: first.founderSubscriptionId,
        providerSubscriptionId: "sub_founder_sync",
      });
    });
  } finally {
    if (priorEnv.priceId === undefined) delete process.env.POLYNET_FOUNDER_STRIPE_PRICE_ID;
    else process.env.POLYNET_FOUNDER_STRIPE_PRICE_ID = priorEnv.priceId;
    if (priorEnv.input === undefined) delete process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS;
    else process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS = priorEnv.input;
    if (priorEnv.output === undefined) delete process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS;
    else process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS = priorEnv.output;
    if (priorEnv.reservation === undefined) delete process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS;
    else process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS = priorEnv.reservation;
  }
});

test("Stripe founder subscription sync rejects ownership changes before entitlement", async () => {
  const priorPriceId = process.env.POLYNET_FOUNDER_STRIPE_PRICE_ID;
  process.env.POLYNET_FOUNDER_STRIPE_PRICE_ID = "price_founder_owner_binding";
  try {
    const t = convexTest(schema, modules);
    const fixture = await t.run(async (ctx) => {
      const checkoutOwnerId = await insertUser(ctx, "checkout-owner", 800_000);
      const replacementOwnerId = await insertUser(ctx, "replacement-owner", 800_000);
      const communityId = await insertCommunity(
        ctx,
        checkoutOwnerId,
        "checkout-owner-binding",
        800_000,
      );
      return { checkoutOwnerId, replacementOwnerId, communityId };
    });
    await t.mutation(
      (internal as any).founderBilling.createPendingFounderSubscriptionCheckoutInternal,
      {
        sessionId: "founder-checkout-owner-binding",
        ownerUserId: fixture.checkoutOwnerId,
        communityId: fixture.communityId,
        expiresAt: 9_000_000,
        nowMs: 800_000,
      },
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.communityId, {
        ownerId: fixture.replacementOwnerId,
        updatedAt: 801_000,
      });
    });
    await expect(
      t.mutation(
        (internal as any).founderBilling.syncFounderSubscriptionFromStripeInternal,
        {
          localSessionId: "founder-checkout-owner-binding",
          providerCheckoutSessionId: "cs_founder_owner_binding",
          providerCustomerId: "cus_founder_owner_binding",
          providerSubscriptionId: "sub_founder_owner_binding",
          providerPriceId: "price_founder_owner_binding",
          subscriptionStatus: "active",
          currentPeriodStartAt: 802_000,
          currentPeriodEndAt: 3_292_802_000,
          cancelAtPeriodEnd: false,
          providerEventCreatedAt: 802_000,
        },
      ),
    ).rejects.toThrow("founder_subscription_community_owner_mismatch");
    await t.run(async (ctx) => {
      expect(await ctx.db.query("founderSubscriptions").collect()).toHaveLength(0);
      expect(await ctx.db.query("founderUsageCycles").collect()).toHaveLength(0);
      const checkout = await ctx.db
        .query("checkoutSessions")
        .withIndex("by_sessionId", (q: any) =>
          q.eq("sessionId", "founder-checkout-owner-binding"),
        )
        .first();
      expect(checkout).toMatchObject({ status: "pending" });
    });
  } finally {
    if (priorPriceId === undefined) delete process.env.POLYNET_FOUNDER_STRIPE_PRICE_ID;
    else process.env.POLYNET_FOUNDER_STRIPE_PRICE_ID = priorPriceId;
  }
});

test("receipt prices survive monthly cycle price changes; legacy receipts still settle", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createActiveFundingFixture(t, "price-snapshot", 600_000);
  for (const legacy of [false, true]) {
    const receiptKey = `community_agent_mention:snapshot-${legacy}`;
    const claimed = await t.mutation((internal as any).founderInference.claimCommunityInferenceReceiptInternal,
      claimArgs(fixture, receiptKey, "snapshot-claim", 601_000));
    await t.run(async ctx => {
      const receipt = await ctx.db.get(claimed.receiptId) as any;
      await ctx.db.patch(receipt._id, { modelId: "gpt-5.6-luna", pricingVersion: POLYNET_FOUNDER_PLAN_PRICING_VERSION, pricingSnapshot: snapshotFounderRunPricing("gpt-5.6-luna", { pricingVersion: POLYNET_FOUNDER_PLAN_PRICING_VERSION, inputCostMicrosPerMillionTokens: 1_000_000, outputCostMicrosPerMillionTokens: 2_000_000 }) });
      expect((await ctx.db.get(receipt._id) as any).pricingSnapshot).toMatchObject({ modelId: "gpt-5.6-luna", inputCostMicrosPerMillionTokens: 1_000_000 });
      if (legacy) await ctx.db.patch(receipt._id, { pricingSnapshot: undefined });
      else await ctx.db.patch(receipt.usageCycleId, { inputCostMicrosPerMillionTokens: 9_000_000 });
      const settled = await settleAuthorizedFounderInferenceReceipt({ ctx, receiptKey, claimToken: "snapshot-claim", promptTokens: 100, completionTokens: 50, outcomeCode: "completed", nowMs: 602_000 });
      expect(settled.settledCostMicros).toBe(200);
      await ctx.db.patch(receipt.usageCycleId, { inputCostMicrosPerMillionTokens: 1_000_000 });
    });
  }
  await t.run(async ctx => {
    const cycles = await ctx.db.query("founderUsageCycles").collect();
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toMatchObject({ includedCostMicros: 20_000_000, reservedCostMicros: 0, settledCostMicros: 400 });
  });
});

test("Luna 6 settles in an existing allowance cycle without resetting its balance", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createActiveFundingFixture(t, "luna-six-cycle", 700_000);
  const receiptKey = "community_agent_mention:luna-six";
  const claimed = await t.mutation((internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    claimArgs(fixture, receiptKey, "luna-six-claim", 701_000));
  const pricingSnapshot = snapshotFounderRunPricing("gpt-6-luna", {
    pricingVersion: POLYNET_FOUNDER_PLAN_PRICING_VERSION,
    inputCostMicrosPerMillionTokens: 1_000_000,
    outputCostMicrosPerMillionTokens: 2_000_000,
  });
  await t.run(async ctx => {
    const receipt = await ctx.db.get(claimed.receiptId) as any;
    expect(receipt).toMatchObject({ modelId: "gpt-6-luna", pricingSnapshot });
    await ctx.db.patch(receipt.usageCycleId, { settledCostMicros: 5_000_000 });
  });
  await expect(t.mutation((internal as any).founderInference.settleCommunityInferenceReceiptInternal, {
    receiptKey, claimToken: "luna-six-claim", promptTokens: 100_000, completionTokens: 10_000,
    cachedInputTokens: 20_000, cacheWriteTokens: 10_000,
    providerRequests: [{ requestId: "resp_test", modelId: "gpt-6-luna", serviceTier: "default",
      promptTokens: 100_000, completionTokens: 10_000, cachedInputTokens: 20_000, cacheWriteTokens: 10_000 }],
    usageComplete: true, outcomeCode: "completed", nowMs: 702_000,
  })).resolves.toMatchObject({ status: "settled", settledCostMicros: 13_450 });
  await t.run(async ctx => {
    const receipt = await ctx.db.get(claimed.receiptId) as any;
    expect(receipt).toMatchObject({ cachedInputTokens: 20_000, cacheWriteTokens: 10_000 });
    expect(await ctx.db.get(receipt.usageCycleId)).toMatchObject({
      includedCostMicros: 20_000_000, settledCostMicros: 5_013_450, reservedCostMicros: 0,
      pricingVersion: POLYNET_FOUNDER_PLAN_PRICING_VERSION,
    });
  });
});

test("indeterminate Luna 6 receipt retains known requests without estimating the unknown cost", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createActiveFundingFixture(t, "luna-six-partial-usage", 710_000);
  const receiptKey = "community_agent_mention:luna-six-partial-usage";
  const claimToken = "luna-six-partial-claim";
  const claimed = await t.mutation((internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    claimArgs(fixture, receiptKey, claimToken, 711_000));
  const pricingSnapshot = snapshotFounderRunPricing("gpt-6-luna", {
    pricingVersion: POLYNET_FOUNDER_PLAN_PRICING_VERSION,
    inputCostMicrosPerMillionTokens: 1_000_000,
    outputCostMicrosPerMillionTokens: 2_000_000,
  });
  await t.run(async ctx => {
    await ctx.db.patch(claimed.receiptId, {
      modelId: "gpt-6-luna", pricingVersion: pricingSnapshot.pricingVersion, pricingSnapshot,
    });
  });
  const knownRequest = { requestId: "resp_known", modelId: "gpt-6-luna", serviceTier: "default",
    promptTokens: 1000, completionTokens: 20, cachedInputTokens: 0, cacheWriteTokens: 200 };
  await expect(t.mutation((internal as any).founderInference.finalizeCommunityInferenceFailureInternal, {
    receiptKey, claimToken, promptTokens: 1500, completionTokens: 30,
    providerRequests: [knownRequest], usageComplete: false,
    failureCode: "provider_token_usage_missing", disposition: "indeterminate", nowMs: 711_001,
  })).resolves.toEqual({ ok: true, status: "indeterminate" });
  await t.run(async ctx => {
    const receipt = await ctx.db.get(claimed.receiptId) as any;
    expect(receipt).toMatchObject({ status: "indeterminate", promptTokens: 1500,
      completionTokens: 30, providerRequests: [knownRequest], settledCostMicros: 1_000_000 });
    expect(await ctx.db.get(receipt.usageCycleId)).toMatchObject({
      reservedCostMicros: 0, settledCostMicros: 1_000_000,
    });
  });
});

test("new funded receipts use Luna 6 across communities and surfaces; historical receipts retain Luna 5.6", async () => {
  const t = convexTest(schema, modules);
  const target = await createActiveFundingFixture(t, "luna-six-default", 800_000);
  const other = await createActiveFundingFixture(t, "luna-six-other", 800_000);
  const claim = (fixture: typeof target, key: string, token: string, now: number, surface: string) =>
    t.mutation((internal as any).founderInference.claimCommunityInferenceReceiptInternal,
      { ...claimArgs(fixture, key, token, now), surface });
  const legacy = await claim(target, "community_workflow_action:legacy", "legacy-claim", 801_000, "community_workflow_action");
  await t.run(async (ctx) => {
    await ctx.db.patch(legacy.receiptId, {
      modelId: "gpt-5.6-luna",
      pricingVersion: POLYNET_FOUNDER_PLAN_PRICING_VERSION,
      pricingSnapshot: snapshotFounderRunPricing("gpt-5.6-luna", {
        pricingVersion: POLYNET_FOUNDER_PLAN_PRICING_VERSION,
        inputCostMicrosPerMillionTokens: 1_000_000,
        outputCostMicrosPerMillionTokens: 2_000_000,
      }),
    });
  });
  expect(await claim(target, "community_workflow_action:legacy", "legacy-reclaim", 1_402_000, "community_workflow_action"))
    .toMatchObject({ modelId: "gpt-5.6-luna", reclaimed: true });
  expect(await t.query((internal as any).founderInference.resolveCommunityInferenceModelInternal,
    { communityId: target.communityId, surface: "community_workflow_action", receiptKey: "community_workflow_action:legacy" }))
    .toBe("gpt-5.6-luna");
  for (const [fixture, surface] of [
    [target, "member_agent_dock"],
    [target, "community_agent_mention"],
    [target, "community_workflow_action"],
    [target, "community_setup_generation"],
    [other, "community_agent_mention"],
  ] as const) {
    const key = `${surface}:fresh-${String(fixture.communityId)}`;
    expect(await claim(fixture, key, key, 1_402_001, surface)).toMatchObject({
      modelId: "gpt-6-luna",
      pricingSnapshot: { pricingVersion: "gpt_6_luna_standard_v1" },
    });
  }
  const settled = await t.mutation((internal as any).founderInference.settleCommunityInferenceReceiptInternal, {
    receiptKey: "community_workflow_action:legacy", claimToken: "legacy-reclaim",
    promptTokens: 100, completionTokens: 50, usageComplete: true,
    outcomeCode: "completed", nowMs: 1_402_002,
  });
  expect(settled).toMatchObject({ status: "settled", settledCostMicros: 200 });
});

test("paid Luna 6 budget stop settles known provider spend and releases unused reservation", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createActiveFundingFixture(t, "paid-luna-budget", 4_000_000);
    const receiptKey = "member_agent_dock:paid-budget";
    const claimToken = "paid-budget-claim";
    const claimed = await t.mutation((internal as any).founderInference.claimCommunityInferenceReceiptInternal,
      { ...claimArgs(fixture, receiptKey, claimToken, 4_001_000), surface: "member_agent_dock" });
    expect(claimed).toMatchObject({ ok: true, modelId: "gpt-6-luna", reservedCostMicros: 1_000_000 });
    await t.mutation((internal as any).founderInference.markCommunityInferenceProviderStartedInternal,
      { receiptKey, claimToken, nowMs: 4_001_001 });
    const usage = createFounderInferenceUsageTotals("gpt-6-luna");
    for (let index = 0; index < 4; index += 1) {
      const providerRequestUsage = { requestId: `resp_paid_${index}`, modelId: "gpt-6-luna",
        serviceTier: "default", promptTokens: 1_047_952, completionTokens: 2048,
        cachedInputTokens: 0, cacheWriteTokens: 0 };
      recordFounderProviderSuccess(usage, { promptTokens: providerRequestUsage.promptTokens,
        completionTokens: providerRequestUsage.completionTokens, providerRequestUsage });
    }
    expect(() => assertPaidLuna6ProviderHeadroom({ session: { receiptKey, claimToken,
      fundingMode: "platform_subscription", modelId: claimed.modelId,
      reservedCostMicros: claimed.reservedCostMicros, pricingSnapshot: claimed.pricingSnapshot },
      usage, maxOutputTokens: 2048 })).toThrow(FOUNDER_INFERENCE_RUN_BUDGET_EXHAUSTED);
    expect(await t.mutation((internal as any).founderInference.finalizeCommunityInferenceFailureInternal, {
      receiptKey, claimToken, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens,
      providerRequests: usage.providerRequests, usageComplete: true,
      failureCode: FOUNDER_INFERENCE_RUN_BUDGET_EXHAUSTED, disposition: "indeterminate", nowMs: 4_001_002,
    })).toMatchObject({ ok: true, status: "settled" });
    await t.run(async (ctx) => {
      const receipt = await ctx.db.get(claimed.receiptId) as any;
      const cycle = await ctx.db.get(receipt.usageCycleId) as any;
      expect(receipt).toMatchObject({ status: "settled", outcomeCode: FOUNDER_INFERENCE_RUN_BUDGET_EXHAUSTED });
      expect(receipt.settledCostMicros).toBeGreaterThan(0);
      expect(receipt.settledCostMicros).toBeLessThan(1_000_000);
      expect(cycle).toMatchObject({ reservedCostMicros: 0, settledCostMicros: receipt.settledCostMicros });
    });

});

async function withOperatorPricingEnv(run: () => Promise<void>) {
  const prior = {
    input: process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS,
    output: process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS,
    reservation: process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS,
  };
  process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS = "1000000";
  process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS = "2000000";
  process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS = "1000000";
  try {
    await run();
  } finally {
    for (const [name, value] of [
      ["POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS", prior.input],
      ["POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS", prior.output],
      ["POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS", prior.reservation],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

async function createOperatorCommunityFixture(
  t: ReturnType<typeof convexTest>,
  suffix: string,
  slug?: string,
) {
  return await t.run(async (ctx) => {
    const ownerId = await insertUser(ctx, `${suffix}-owner`, 1_000);
    const memberId = await insertUser(ctx, `${suffix}-member`, 1_000);
    const communityId = await insertCommunity(ctx, ownerId, suffix, 1_000);
    if (slug) await ctx.db.patch(communityId, { slug });
    await ctx.db.insert("operatorRoles", {
      userId: ownerId,
      role: "owner",
      active: true,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    return { ownerId, memberId, communityId };
  });
}

function claimOperatorReceipt(
  t: ReturnType<typeof convexTest>,
  fixture: { ownerId: any; communityId: any },
  args: { key: string; actorUserId: any; nowMs: number; surface?: string },
) {
  return t.mutation(
    (internal as any).founderInference.claimCommunityInferenceReceiptInternal,
    {
      receiptKey: `${args.surface ?? "member_agent_dock"}:${args.key}`,
      sourceRunId: `runtime:${args.key}`,
      communityId: fixture.communityId,
      actorUserId: args.actorUserId,
      expectedPayerUserId: fixture.ownerId,
      expectedFundingMode: "platform_operator_grant",
      surface: args.surface ?? "member_agent_dock",
      claimToken: `${args.key}-claim`,
      nowMs: args.nowMs,
    },
  );
}

test("operator-funded communities reserve and settle against a bounded monthly ledger", async () => {
  await withOperatorPricingEnv(async () => {
    const t = convexTest(schema, modules);
    const fixture = await createOperatorCommunityFixture(t, "operator-ledger");
    const nowMs = Date.UTC(2026, 8, 15);
    const claimed = await claimOperatorReceipt(t, fixture, {
      key: "operator-ledger-a",
      actorUserId: fixture.memberId,
      nowMs,
    });
    expect(claimed).toMatchObject({ ok: true, reservedCostMicros: 1_000_000 });
    await t.run(async (ctx) => {
      const [cycle] = await ctx.db.query("operatorGrantUsageCycles").collect();
      expect(cycle).toMatchObject({
        cycleStartAt: Date.UTC(2026, 8, 1),
        cycleEndAt: Date.UTC(2026, 9, 1),
        includedCostMicros: 20_000_000,
        reservedCostMicros: 1_000_000,
        settledCostMicros: 0,
      });
      expect(await ctx.db.get(claimed.receiptId)).toMatchObject({
        operatorUsageCycleId: cycle!._id,
        reservedCostMicros: 1_000_000,
      });
      await settleAuthorizedFounderInferenceReceipt({
        ctx,
        receiptKey: "member_agent_dock:operator-ledger-a",
        claimToken: "operator-ledger-a-claim",
        promptTokens: 1_000,
        completionTokens: 500,
        providerRequests: [{ requestId: "resp_operator-ledger-a", modelId: "gpt-6-luna", serviceTier: "default", promptTokens: 1_000, completionTokens: 500, cachedInputTokens: 0, cacheWriteTokens: 0 }],
        outcomeCode: "completed",
        nowMs: nowMs + 1_000,
      });
      expect(await ctx.db.get(cycle!._id)).toMatchObject({
        reservedCostMicros: 0,
        settledCostMicros: 350,
      });
    });

    // Known no-spend failure releases the whole reservation.
    const failed = await claimOperatorReceipt(t, fixture, {
      key: "operator-ledger-b",
      actorUserId: fixture.memberId,
      nowMs: nowMs + 2_000,
    });
    expect(failed).toMatchObject({ ok: true });
    await expect(t.mutation(
      (internal as any).founderInference.finalizeCommunityInferenceFailureInternal,
      {
        receiptKey: "member_agent_dock:operator-ledger-b",
        claimToken: "operator-ledger-b-claim",
        promptTokens: 0,
        completionTokens: 0,
        failureCode: "provider_rejected_before_spend",
        disposition: "failed",
        nowMs: nowMs + 3_000,
      },
    )).resolves.toMatchObject({ ok: true, status: "failed" });
    await t.run(async (ctx) => {
      const [cycle] = await ctx.db.query("operatorGrantUsageCycles").collect();
      expect(cycle).toMatchObject({ reservedCostMicros: 0, settledCostMicros: 350 });
      // Push the month to its ceiling: the next reservation no longer fits.
      await ctx.db.patch(cycle!._id, { settledCostMicros: 19_500_000 });
    });
    await expect(claimOperatorReceipt(t, fixture, {
      key: "operator-ledger-c",
      actorUserId: fixture.memberId,
      nowMs: nowMs + 4_000,
    })).resolves.toEqual({ ok: false, errorCode: "founder_usage_exhausted" });

    // A new UTC month opens a fresh ledger.
    await expect(claimOperatorReceipt(t, fixture, {
      key: "operator-ledger-d",
      actorUserId: fixture.memberId,
      nowMs: Date.UTC(2026, 9, 1, 0, 0, 1),
    })).resolves.toMatchObject({ ok: true });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("operatorGrantUsageCycles").collect()).toHaveLength(2);
    });
  });
});

test("platform-home members get a monthly agent allowance; the owner and other surfaces are exempt", async () => {
  await withOperatorPricingEnv(async () => {
    const t = convexTest(schema, modules);
    const fixture = await createOperatorCommunityFixture(t, "home-limit", "polynet");
    const monthStart = Date.UTC(2026, 8, 1);
    await t.run(async (ctx) => {
      const base = {
        communityId: fixture.communityId,
        actorUserId: fixture.memberId,
        payerUserId: fixture.ownerId,
        fundingMode: "platform_operator_grant" as const,
        provider: "openai" as const,
        modelId: "gpt-6-luna",
        claimToken: "seed",
        leaseExpiresAt: 1,
      };
      // Last month's usage and failed receipts never count.
      await ctx.db.insert("communityInferenceReceipts", {
        ...base, receiptKey: "seed:last-month", sourceRunId: "seed:last-month",
        surface: "member_agent_dock", status: "settled",
        authorizedAt: monthStart - 10, createdAt: monthStart - 10, updatedAt: monthStart - 10,
      });
      await ctx.db.insert("communityInferenceReceipts", {
        ...base, receiptKey: "seed:failed", sourceRunId: "seed:failed",
        surface: "member_agent_dock", status: "failed",
        authorizedAt: monthStart + 1, createdAt: monthStart + 1, updatedAt: monthStart + 1,
      });
      for (let index = 0; index < 24; index += 1) {
        await ctx.db.insert("communityInferenceReceipts", {
          ...base,
          receiptKey: `seed:${index}`,
          sourceRunId: `seed:${index}`,
          surface: index % 2 === 0 ? "member_agent_dock" : "community_agent_mention",
          status: "settled",
          authorizedAt: monthStart + 10 + index,
          createdAt: monthStart + 10 + index,
          updatedAt: monthStart + 10 + index,
        });
      }
    });
    const nowMs = Date.UTC(2026, 8, 20);
    await expect(claimOperatorReceipt(t, fixture, {
      key: "home-limit-25th",
      actorUserId: fixture.memberId,
      nowMs,
    })).resolves.toMatchObject({ ok: true });
    await expect(claimOperatorReceipt(t, fixture, {
      key: "home-limit-26th",
      actorUserId: fixture.memberId,
      nowMs: nowMs + 60_000,
      surface: "community_agent_mention",
    })).resolves.toEqual({ ok: false, errorCode: "platform_home_member_agent_limit_reached" });
    // Workflow actions are community work, not member-initiated turns.
    await expect(claimOperatorReceipt(t, fixture, {
      key: "home-limit-workflow",
      actorUserId: fixture.memberId,
      nowMs: nowMs + 120_000,
      surface: "community_workflow_action",
    })).resolves.toMatchObject({ ok: true });
    await expect(claimOperatorReceipt(t, fixture, {
      key: "home-limit-owner",
      actorUserId: fixture.ownerId,
      nowMs: nowMs + 180_000,
    })).resolves.toMatchObject({ ok: true });
    // The allowance resets with the UTC month.
    await expect(claimOperatorReceipt(t, fixture, {
      key: "home-limit-next-month",
      actorUserId: fixture.memberId,
      nowMs: Date.UTC(2026, 9, 1, 0, 1),
    })).resolves.toMatchObject({ ok: true });
  });
});

test("the monthly member allowance applies only to the platform-home community", async () => {
  await withOperatorPricingEnv(async () => {
    const t = convexTest(schema, modules);
    const fixture = await createOperatorCommunityFixture(t, "not-home-limit");
    const monthStart = Date.UTC(2026, 8, 1);
    await t.run(async (ctx) => {
      for (let index = 0; index < 30; index += 1) {
        await ctx.db.insert("communityInferenceReceipts", {
          receiptKey: `seed-other:${index}`,
          sourceRunId: `seed-other:${index}`,
          communityId: fixture.communityId,
          actorUserId: fixture.memberId,
          payerUserId: fixture.ownerId,
          fundingMode: "platform_operator_grant",
          surface: "member_agent_dock",
          provider: "openai",
          modelId: "gpt-6-luna",
          status: "settled",
          claimToken: "seed",
          leaseExpiresAt: 1,
          authorizedAt: monthStart + index,
          createdAt: monthStart + index,
          updatedAt: monthStart + index,
        });
      }
    });
    await expect(claimOperatorReceipt(t, fixture, {
      key: "not-home-31st",
      actorUserId: fixture.memberId,
      nowMs: Date.UTC(2026, 8, 20),
    })).resolves.toMatchObject({ ok: true });
  });
});
