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
  syncFounderUsageCycle,
} from "./founderPlanCore";
import { POLYNET_FOUNDER_PLAN_PRICING_VERSION } from "../shared/founderPlan";
import type { FounderInferencePricing } from "./founderPlanPricing";
import { buildAccountSetupStatusForRows } from "./accountSetupCore";

const modules = import.meta.glob([
  "./founderInference.ts",
  "./founderBilling.ts",
  "./providerConnections.ts",
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
  surface: "community_agent_mention" | "community_autonomous_cognition" | "community_setup_generation" = "community_agent_mention",
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
      modelId: "gpt-5.6-luna",
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
        pricingVersion: POLYNET_FOUNDER_PLAN_PRICING_VERSION,
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
    await t.run(async (ctx) => {
      await settleAuthorizedFounderInferenceReceipt({
        ctx,
        receiptKey,
        claimToken: "operator-funded-claim",
        promptTokens: 1_000,
        completionTokens: 500,
        outcomeCode: "completed",
        nowMs: nowMs + 3_000,
      });
      expect(await ctx.db.get(claimed.receiptId)).toMatchObject({
        status: "settled",
        promptTokens: 1_000,
        completionTokens: 500,
        settledCostMicros: 2_000,
      });
    });

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
    });
  });
});

test("receipt claims preserve the explicit community inference surface", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createActiveFundingFixture(t, "receipt-surfaces", 150_000);
  const surfaces = [
    "community_agent_mention",
    "community_autonomous_cognition",
    "community_setup_generation",
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
    expect(await ctx.db.get(unknownClaim.receiptId)).toMatchObject({
      status: "indeterminate",
      failureCode: "provider_token_usage_missing",
    });
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
      modelId: "gpt-5.6-luna",
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
        pricingVersion: POLYNET_FOUNDER_PLAN_PRICING_VERSION,
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
        outcomeCode: "completed",
        nowMs: nowMs + 3_000,
      });
      const receipt = (await ctx.db.get(claimed.receiptId)) as any;
      expect(receipt).toMatchObject({ status: "settled", settledCostMicros: 2_000 });
      const cycle = await ctx.db.get(receipt?.usageCycleId as any);
      expect(cycle).toMatchObject({ reservedCostMicros: 0, settledCostMicros: 2_000 });
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
