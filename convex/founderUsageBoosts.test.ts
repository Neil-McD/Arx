/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  FOUNDER_USAGE_BOOST_ALLOWANCE_MICROS,
  FOUNDER_USAGE_BOOST_FIRST_CYCLE_MAX_CENTS,
  buildBoostCheckoutReturnUrls,
  canGrantAdditionalUsageBoost,
  computeEffectiveCycleAllowanceMicros,
  consumeBoostCheckoutReturnStatus,
  formatBoostCheckoutErrorMessage,
  isSubscriptionInFirstBillingCycle,
  resolveEffectiveMonthlyBoostCapCents,
} from "../shared/founderUsageBoosts";
import { resolveCommunityInferenceFundingAdmission } from "./founderInferenceCore";
import { reserveFounderUsage, settleFounderUsageReservation } from "./founderPlanCore";

const modules = import.meta.glob([
  "./*.ts",
  "!./*.test.ts",
  "./_generated/**/*.*s",
]);

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
const NOW = Date.UTC(2026, 10, 24, 15, 0, 0);

describe("Agent pricing & prepaid usage boost ledger foundation (Step 1)", () => {
  test("pure rules enforce boost math, first-cycle $60 ceiling, and preset safety caps", () => {
    expect(
      computeEffectiveCycleAllowanceMicros({
        includedCostMicros: 20_000_000,
        paidBoostCostMicros: FOUNDER_USAGE_BOOST_ALLOWANCE_MICROS,
      }),
    ).toBe(40_000_000);

    // First cycle vs renewed cycle detection.
    expect(
      isSubscriptionInFirstBillingCycle({
        subscriptionCreatedAtMs: NOW - 10 * DAY_MS,
        cycleStartAtMs: NOW - 10 * DAY_MS,
      }),
    ).toBe(true);
    expect(
      isSubscriptionInFirstBillingCycle({
        subscriptionCreatedAtMs: NOW - 40 * DAY_MS,
        cycleStartAtMs: NOW - 10 * DAY_MS,
      }),
    ).toBe(false);

    // First cycle clamps $300 preset down to $60 (2 boosts max).
    expect(
      resolveEffectiveMonthlyBoostCapCents({ requestedCapCents: 30_000, isFirstCycle: true }),
    ).toBe(FOUNDER_USAGE_BOOST_FIRST_CYCLE_MAX_CENTS);
    expect(
      resolveEffectiveMonthlyBoostCapCents({ requestedCapCents: 30_000, isFirstCycle: false }),
    ).toBe(30_000);

    expect(
      canGrantAdditionalUsageBoost({
        requestedCapCents: 0,
        isFirstCycle: false,
        paidBoostCountThisCycle: 0,
      }),
    ).toMatchObject({ allowed: false, code: "usage_boost_disabled" });

    expect(
      canGrantAdditionalUsageBoost({
        requestedCapCents: 30_000,
        isFirstCycle: true,
        paidBoostCountThisCycle: 2,
      }),
    ).toMatchObject({ allowed: false, code: "usage_boost_first_cycle_cap_reached" });

    expect(
      canGrantAdditionalUsageBoost({
        requestedCapCents: 15_000,
        isFirstCycle: false,
        paidBoostCountThisCycle: 2,
      }),
    ).toEqual({ allowed: true, remainingBoosts: 3, effectiveCapCents: 15_000 });

    // Clean Stripe return URL building, consumption, and human error messages.
    const urls = buildBoostCheckoutReturnUrls(
      "https://www.polynet.ai/c/boost-club/settings?pane=agent&boost_checkout=canceled&boost_prev=0&session_id=old_1",
      20_000_000,
    );
    expect(urls.successUrl).toBe(
      "https://www.polynet.ai/c/boost-club/settings?pane=agent&boost_checkout=success&boost_prev=20000000",
    );
    expect(urls.cancelUrl).toBe(
      "https://www.polynet.ai/c/boost-club/settings?pane=agent&boost_checkout=canceled",
    );
    expect(
      consumeBoostCheckoutReturnStatus(
        "https://www.polynet.ai/c/boost-club/settings?pane=agent&boost_checkout=success&boost_prev=20000000&session_id=boost_123",
      ),
    ).toEqual({
      status: "success",
      previousPaidBoostMicros: 20_000_000,
      cleanedRelativeUrl: "/c/boost-club/settings?pane=agent",
    });
    expect(formatBoostCheckoutErrorMessage(new Error("founder_usage_boost_payment_settling"))).toContain(
      "still settling with Stripe",
    );
  });

  test("founderUsageCycles honors included + paidBoostCostMicros for reservations, settlements, 90% reserve, alerts, and safety cap settings", async () => {
    const t = convexTest(schema, modules);

    const fx = await t.run(async (ctx: any) => {
      const ownerId = await ctx.db.insert("users", {
        authSubject: "owner-boost-1",
        displayName: "Neil",
        email: "neil@example.com",
        emailVerifiedAt: NOW - 60 * DAY_MS,
        createdAt: NOW - 60 * DAY_MS,
        updatedAt: NOW - 60 * DAY_MS,
      });
      const communityId = await ctx.db.insert("communities", {
        ownerId,
        slug: "boost-club",
        name: "Boost Club",
        visibility: "published",
        inferenceFundingPolicy: "managed_required",
        entryPolicy: "open",
        activeMemberCount: 5,
        createdAt: NOW - 60 * DAY_MS,
        updatedAt: NOW - 60 * DAY_MS,
      });
      const subId = await ctx.db.insert("founderSubscriptions", {
        ownerUserId: ownerId,
        communityId,
        provider: "stripe",
        providerCustomerId: "cus_boost_1",
        providerSubscriptionId: "sub_boost_1",
        providerPriceId: "price_boost_1",
        status: "active",
        currentPeriodStartAt: NOW - 10 * DAY_MS,
        currentPeriodEndAt: NOW + 20 * DAY_MS,
        cancelAtPeriodEnd: false,
        lastProviderEventCreatedAt: NOW - 10 * DAY_MS,
        // Created at start of current cycle -> first billing cycle!
        createdAt: NOW - 10 * DAY_MS,
        updatedAt: NOW - 10 * DAY_MS,
      });
      // $20 included + $20 paid boost = $40 effective allowance; $22 settled (55%).
      const cycleId = await ctx.db.insert("founderUsageCycles", {
        founderSubscriptionId: subId,
        communityId,
        cycleKey: "sub_boost_1:c1",
        cycleStartAt: NOW - 10 * DAY_MS,
        cycleEndAt: NOW + 20 * DAY_MS,
        includedCostMicros: 20_000_000,
        paidBoostCostMicros: 20_000_000,
        paidBoostCount: 1,
        reservedCostMicros: 0,
        settledCostMicros: 22_000_000,
        pricingVersion: "founder_plan_luna_v1",
        inputCostMicrosPerMillionTokens: 100_000,
        outputCostMicrosPerMillionTokens: 500_000,
        maxRunReservationCostMicros: 1_000_000,
        status: "open",
        createdAt: NOW - 10 * DAY_MS,
        updatedAt: NOW - HOUR_MS,
      });
      const channelId = await ctx.db.insert("communityChannels", {
        communityId,
        systemRole: "general",
        slug: "general",
        name: "General",
        accessMode: "all_members",
        postingPolicy: "members",
        replyPolicy: "members",
        status: "active",
        position: 0,
        createdByUserId: ownerId,
        createdAt: NOW - 60 * DAY_MS,
        updatedAt: NOW - 60 * DAY_MS,
      });
      await ctx.db.insert("communityInteractionRoots", {
        communityId,
        channelId,
        actorType: "human",
        actorUserId: ownerId,
        kind: "discussion",
        visibilityScope: "community",
        status: "live",
        contentSummary: "Active discussion today",
        replyCount: 0,
        reactionSummary: [],
        idempotencyKey: "boost-post-1",
        createdAt: NOW - 2 * HOUR_MS,
        updatedAt: NOW - 2 * HOUR_MS,
      });
      const settingsId = await ctx.db.insert("communityMemberCoachSettings", {
        communityId,
        enabled: true,
        autoReasons: [],
        nextScanAt: NOW - 1_000,
        builderNextScanAt: NOW - 1_000,
        createdAt: NOW - 10 * DAY_MS,
        updatedAt: NOW - 10 * DAY_MS,
      });
      return { ownerId, communityId, subId, cycleId, settingsId };
    });

    // 1. Reserve & settle cleanly past $20 inside the $40 effective cycle allowance.
    const reserved = await t.run(async (ctx: any) =>
      await reserveFounderUsage({
        ctx,
        founderSubscriptionId: fx.subId,
        communityId: fx.communityId,
        nowMs: NOW,
        reservationCostMicros: 1_000_000,
      }),
    );
    expect(reserved.ok).toBe(true);
    await t.run(async (ctx: any) =>
      await settleFounderUsageReservation({
        ctx,
        usageCycleId: fx.cycleId,
        reservedCostMicros: 1_000_000,
        settledCostMicros: 500_000,
        nowMs: NOW + 1_000,
      }),
    );

    // 2. At $22.50 / $40.00 (56%): background AI is NOT paused and 80% alert does NOT fire!
    const claimAt56 = await t.mutation(
      internal.communityMemberCoach.claimCommunityMemberCoachScanInternal,
      { settingsId: fx.settingsId, nowMs: NOW + 2_000 },
    );
    expect(claimAt56).not.toBeNull();
    const alertAt56 = await t.mutation(
      internal.communityAllowanceGuardrails.processFounderAllowanceAlertsPageInternal,
      { nowMs: NOW + 2_000, cursor: null },
    );
    expect(alertAt56.alertsSent).toBe(0);

    // 3. Owner Settings view returns included + boost breakdown, default cap 0, firstCycleCapActive: true,
    //    rejects invalid cap presets, and persists valid presets cleanly.
    const asOwner = t.withIdentity({ subject: "owner-boost-1" });
    const initialView = await asOwner.query(api.communityMemberCoach.getMemberCoachSettings, {
      communityId: fx.communityId,
    });
    expect(initialView.impact).toMatchObject({
      allowance_micros: 40_000_000,
      included_allowance_micros: 20_000_000,
      paid_boost_micros: 20_000_000,
      usage_boost_cap_cents: 0,
      first_cycle_cap_active: true,
      background_ai_paused: false,
    });

    await expect(
      asOwner.mutation(api.communityMemberCoach.setMemberCoachSettings, {
        communityId: fx.communityId,
        enabled: true,
        autoReasons: [],
        usageBoostCapCents: 9_999,
      }),
    ).rejects.toThrow(/usage_boost_cap_invalid/);

    const updatedView = await asOwner.mutation(api.communityMemberCoach.setMemberCoachSettings, {
      communityId: fx.communityId,
      enabled: true,
      autoReasons: [],
      usageBoostCapCents: 15_000,
    });
    expect(updatedView.impact?.usage_boost_cap_cents).toBe(15_000);

    // 4. At $36.00 / $40.00 (90% of effective allowance): background AI pauses cleanly, and
    //    exceeding $40.00 still fails closed with founder_usage_exhausted.
    await t.run(async (ctx: any) => {
      await ctx.db.patch(fx.cycleId, { settledCostMicros: 36_000_000, updatedAt: NOW + HOUR_MS });
      await ctx.db.patch(fx.settingsId, { leaseUntil: undefined, nextScanAt: NOW + HOUR_MS - 1_000 });
    });
    const claimAt90 = await t.mutation(
      internal.communityMemberCoach.claimCommunityMemberCoachScanInternal,
      { settingsId: fx.settingsId, nowMs: NOW + HOUR_MS },
    );
    expect(claimAt90).toBeNull();

    await t.run(async (ctx: any) => {
      await ctx.db.patch(fx.cycleId, { settledCostMicros: 39_500_000, updatedAt: NOW + 2 * HOUR_MS });
    });
    const exhausted = await t.run(async (ctx: any) =>
      await reserveFounderUsage({
        ctx,
        founderSubscriptionId: fx.subId,
        communityId: fx.communityId,
        nowMs: NOW + 2 * HOUR_MS,
        reservationCostMicros: 1_000_000,
      }),
    );
    expect(exhausted).toEqual({ ok: false, code: "founder_usage_exhausted" });

    // 5. Corrupt negative paidBoostCostMicros fails closed with founder_usage_cycle_ledger_invalid.
    await t.run(async (ctx: any) => {
      await ctx.db.patch(fx.cycleId, { paidBoostCostMicros: -1 });
    });
    await expect(
      t.run(async (ctx: any) =>
        await reserveFounderUsage({
          ctx,
          founderSubscriptionId: fx.subId,
          communityId: fx.communityId,
          nowMs: NOW + 2 * HOUR_MS,
          reservationCostMicros: 1_000_000,
        }),
      ),
    ).rejects.toThrow(/founder_usage_cycle_ledger_invalid/);
  });

  test("Step 2 checkout prep, webhook-authoritative boost grant, idempotent replay, alert re-arm, and safe refund/dispute clawback", async () => {
    const t = convexTest(schema, modules);

    const fx = await t.run(async (ctx: any) => {
      const ownerId = await ctx.db.insert("users", {
        authSubject: "owner-boost-2",
        displayName: "Neil",
        email: "neil2@example.com",
        emailVerifiedAt: NOW - 60 * DAY_MS,
        createdAt: NOW - 60 * DAY_MS,
        updatedAt: NOW - 60 * DAY_MS,
      });
      const communityId = await ctx.db.insert("communities", {
        ownerId,
        slug: "boost-stripe-club",
        name: "Boost Stripe Club",
        visibility: "published",
        inferenceFundingPolicy: "managed_required",
        entryPolicy: "open",
        activeMemberCount: 5,
        createdAt: NOW - 60 * DAY_MS,
        updatedAt: NOW - 60 * DAY_MS,
      });
      const subId = await ctx.db.insert("founderSubscriptions", {
        ownerUserId: ownerId,
        communityId,
        provider: "stripe",
        providerCustomerId: "cus_boost_2",
        providerSubscriptionId: "sub_boost_2",
        providerPriceId: "price_boost_2",
        status: "active",
        currentPeriodStartAt: NOW - 10 * DAY_MS,
        currentPeriodEndAt: NOW + 20 * DAY_MS,
        cancelAtPeriodEnd: false,
        lastProviderEventCreatedAt: NOW - 10 * DAY_MS,
        // Renewed subscription (40d old) -> past first cycle!
        createdAt: NOW - 40 * DAY_MS,
        updatedAt: NOW - 10 * DAY_MS,
      });
      // Cycle currently at 95% ($19.00 / $20.00) with 80% alert already sent.
      const cycleId = await ctx.db.insert("founderUsageCycles", {
        founderSubscriptionId: subId,
        communityId,
        cycleKey: "sub_boost_2:c2",
        cycleStartAt: NOW - 10 * DAY_MS,
        cycleEndAt: NOW + 20 * DAY_MS,
        includedCostMicros: 20_000_000,
        reservedCostMicros: 0,
        settledCostMicros: 19_000_000,
        pricingVersion: "founder_plan_luna_v1",
        inputCostMicrosPerMillionTokens: 100_000,
        outputCostMicrosPerMillionTokens: 500_000,
        maxRunReservationCostMicros: 1_000_000,
        status: "open",
        createdAt: NOW - 10 * DAY_MS,
        updatedAt: NOW - HOUR_MS,
      });
      const settingsId = await ctx.db.insert("communityMemberCoachSettings", {
        communityId,
        enabled: true,
        autoReasons: [],
        allowanceAlertCycleKey: "sub_boost_2:c2",
        allowanceAlertNotifiedPercent: 80,
        usageBoostCapCents: 0,
        createdAt: NOW - 10 * DAY_MS,
        updatedAt: NOW - 10 * DAY_MS,
      });
      return { ownerId, communityId, subId, cycleId, settingsId };
    });

    // 1. Default cap=0 blocks checkout preparation (fail closed).
    await expect(
      t.mutation(internal.founderUsageBoosts.prepareFounderUsageBoostCheckoutInternal, {
        receiptKey: "boost_blocked_0",
        ownerUserId: fx.ownerId,
        communityId: fx.communityId,
        expiresAt: NOW + 2 * HOUR_MS,
        nowMs: NOW,
      }),
    ).rejects.toThrow(/usage_boost_disabled/);

    // 2. Owner enables $60/mo cap (2 boosts) -> Settings shows can_buy_usage_boost: true, remaining: 2.
    const asOwner = t.withIdentity({ subject: "owner-boost-2" });
    const afterCap = await asOwner.mutation(api.communityMemberCoach.setMemberCoachSettings, {
      communityId: fx.communityId,
      enabled: true,
      autoReasons: [],
      usageBoostCapCents: 6_000,
    });
    expect(afterCap.impact).toMatchObject({
      can_buy_usage_boost: true,
      usage_boost_remaining_this_cycle: 2,
      usage_boost_block_reason: null,
    });

    // 3. Prepare checkout creates pending receipt; second concurrent prepare REUSES it (prevents cap bypass).
    const prep1: any = await t.mutation(
      internal.founderUsageBoosts.prepareFounderUsageBoostCheckoutInternal,
      {
        receiptKey: "boost_key_1",
        ownerUserId: fx.ownerId,
        communityId: fx.communityId,
        expiresAt: NOW + 2 * HOUR_MS,
        nowMs: NOW,
      },
    );
    expect(prep1).toMatchObject({ receiptKey: "boost_key_1", reused: false });

    const prep2: any = await t.mutation(
      internal.founderUsageBoosts.prepareFounderUsageBoostCheckoutInternal,
      {
        receiptKey: "boost_key_2",
        ownerUserId: fx.ownerId,
        communityId: fx.communityId,
        expiresAt: NOW + 2 * HOUR_MS,
        nowMs: NOW + 1_000,
      },
    );
    expect(prep2).toMatchObject({ receiptKey: "boost_key_1", reused: true });

    await t.mutation(internal.founderUsageBoosts.attachFounderUsageBoostStripeSessionInternal, {
      receiptKey: "boost_key_1",
      providerCheckoutSessionId: "cs_boost_1",
      providerCustomerId: "cus_boost_2",
      nowMs: NOW + 2_000,
    });

    // 4. Amount mismatch is ignored (fail closed).
    const wrongAmount: any = await t.mutation(
      internal.founderUsageBoosts.grantFounderUsageBoostFromStripeInternal,
      {
        receiptKey: "boost_key_1",
        providerCheckoutSessionId: "cs_boost_1",
        providerCustomerId: "cus_boost_2",
        providerPaymentIntentId: "pi_boost_1",
        providerChargeId: null,
        amountTotalCents: 1_000,
        currency: "usd",
        providerEventCreatedAt: NOW + 3_000,
        nowMs: NOW + 3_000,
      },
    );
    expect(wrongAmount).toMatchObject({ ignored: true, reason: "boost_amount_or_currency_mismatch" });

    // 5. Verified webhook grant adds +$20 ($40 total), re-arms alerts (<80% at $19/$40 = 48%), and replays idempotently.
    const granted: any = await t.mutation(
      internal.founderUsageBoosts.grantFounderUsageBoostFromStripeInternal,
      {
        receiptKey: "boost_key_1",
        providerCheckoutSessionId: "cs_boost_1",
        providerCustomerId: "cus_boost_2",
        providerPaymentIntentId: "pi_boost_1",
        providerChargeId: "ch_boost_1",
        amountTotalCents: 3_000,
        currency: "usd",
        providerEventCreatedAt: NOW + 4_000,
        nowMs: NOW + 4_000,
      },
    );
    expect(granted).toMatchObject({
      ok: true,
      ignored: false,
      effectiveAllowanceMicros: 40_000_000,
    });

    const replay: any = await t.mutation(
      internal.founderUsageBoosts.grantFounderUsageBoostFromStripeInternal,
      {
        receiptKey: "boost_key_1",
        providerCheckoutSessionId: "cs_boost_1",
        providerCustomerId: "cus_boost_2",
        providerPaymentIntentId: "pi_boost_1",
        providerChargeId: "ch_boost_1",
        amountTotalCents: 3_000,
        currency: "usd",
        providerEventCreatedAt: NOW + 5_000,
        nowMs: NOW + 5_000,
      },
    );
    expect(replay).toMatchObject({ ignored: true, reason: "boost_receipt_already_processed" });

    const [cycleAfterGrant, settingsAfterGrant] = await t.run(async (ctx: any) =>
      Promise.all([ctx.db.get(fx.cycleId), ctx.db.get(fx.settingsId)]),
    );
    expect(cycleAfterGrant).toMatchObject({
      paidBoostCostMicros: 20_000_000,
      paidBoostCount: 1,
    });
    expect(settingsAfterGrant?.allowanceAlertNotifiedPercent).toBe(0);

    // 6. Spend climbs to $25 (into the boost), then Stripe refunds pi_boost_1:
    //    clawback clamps remaining headroom to $0 (paidBoostCostMicros = $5) so ledger invariants stay valid!
    await t.run(async (ctx: any) => {
      await ctx.db.patch(fx.cycleId, { settledCostMicros: 25_000_000 });
    });
    const revoked: any = await t.mutation(
      internal.founderUsageBoosts.revokeFounderUsageBoostFromStripeInternal,
      {
        providerPaymentIntentId: "pi_boost_1",
        receiptKey: null,
        outcome: "refunded",
        revokedReason: "boost_refunded",
        providerEventCreatedAt: NOW + 10_000,
        nowMs: NOW + 10_000,
      },
    );
    expect(revoked).toMatchObject({ ok: true, ignored: false, outcome: "refunded" });

    // Confirm ledger invariant stays valid AND zero extra headroom remains (next reserve returns exhausted).
    const afterRefundReserve = await t.run(async (ctx: any) =>
      await reserveFounderUsage({
        ctx,
        founderSubscriptionId: fx.subId,
        communityId: fx.communityId,
        nowMs: NOW + 11_000,
        reservationCostMicros: 1_000_000,
      }),
    );
    expect(afterRefundReserve).toEqual({ ok: false, code: "founder_usage_exhausted" });
  });

  test("Step 2 webhook hardening: out-of-order revocation blocks late grant, dispute revokes inference admission & restores via Stripe sync on win, and missing rollover cycle requests retry", async () => {
    const t = convexTest(schema, modules);

    const fx = await t.run(async (ctx: any) => {
      const ownerId = await ctx.db.insert("users", {
        authSubject: "owner-boost-3",
        displayName: "Neil",
        email: "neil3@example.com",
        emailVerifiedAt: NOW - 60 * DAY_MS,
        createdAt: NOW - 60 * DAY_MS,
        updatedAt: NOW - 60 * DAY_MS,
      });
      const communityId = await ctx.db.insert("communities", {
        ownerId,
        slug: "boost-hardening-club",
        name: "Boost Hardening Club",
        visibility: "published",
        inferenceFundingPolicy: "managed_required",
        entryPolicy: "open",
        activeMemberCount: 5,
        createdAt: NOW - 60 * DAY_MS,
        updatedAt: NOW - 60 * DAY_MS,
      });
      const subId = await ctx.db.insert("founderSubscriptions", {
        ownerUserId: ownerId,
        communityId,
        provider: "stripe",
        providerCustomerId: "cus_boost_3",
        providerSubscriptionId: "sub_boost_3",
        providerPriceId: "price_boost_3",
        status: "active",
        currentPeriodStartAt: NOW - 10 * DAY_MS,
        currentPeriodEndAt: NOW + 20 * DAY_MS,
        cancelAtPeriodEnd: false,
        lastProviderEventCreatedAt: NOW - 10 * DAY_MS,
        createdAt: NOW - 40 * DAY_MS,
        updatedAt: NOW - 10 * DAY_MS,
      });
      const cycleId = await ctx.db.insert("founderUsageCycles", {
        founderSubscriptionId: subId,
        communityId,
        cycleKey: "sub_boost_3:c2",
        cycleStartAt: NOW - 10 * DAY_MS,
        cycleEndAt: NOW + 20 * DAY_MS,
        includedCostMicros: 20_000_000,
        reservedCostMicros: 0,
        settledCostMicros: 5_000_000,
        pricingVersion: "founder_plan_luna_v1",
        inputCostMicrosPerMillionTokens: 100_000,
        outputCostMicrosPerMillionTokens: 500_000,
        maxRunReservationCostMicros: 1_000_000,
        status: "open",
        createdAt: NOW - 10 * DAY_MS,
        updatedAt: NOW - HOUR_MS,
      });
      await ctx.db.insert("communityMemberCoachSettings", {
        communityId,
        enabled: true,
        autoReasons: [],
        usageBoostCapCents: 15_000,
        createdAt: NOW - 10 * DAY_MS,
        updatedAt: NOW - 10 * DAY_MS,
      });
      return { ownerId, communityId, subId, cycleId };
    });

    // 1. Out-of-order refund arriving BEFORE checkout.session.completed records terminal revocation
    //    on the pending receipt so a late payment grant CANNOT credit refunded funds.
    await t.mutation(internal.founderUsageBoosts.prepareFounderUsageBoostCheckoutInternal, {
      receiptKey: "boost_ooo_refund",
      ownerUserId: fx.ownerId,
      communityId: fx.communityId,
      expiresAt: NOW + 2 * HOUR_MS,
      nowMs: NOW,
    });
    await t.mutation(internal.founderUsageBoosts.attachFounderUsageBoostStripeSessionInternal, {
      receiptKey: "boost_ooo_refund",
      providerCheckoutSessionId: "cs_ooo_refund",
      providerCustomerId: "cus_boost_3",
      nowMs: NOW + 1_000,
    });
    const earlyRefund: any = await t.mutation(
      internal.founderUsageBoosts.revokeFounderUsageBoostFromStripeInternal,
      {
        providerPaymentIntentId: "pi_ooo_refund",
        receiptKey: "boost_ooo_refund",
        outcome: "refunded",
        revokedReason: "boost_charge_refunded",
        providerEventCreatedAt: NOW + 2_000,
        nowMs: NOW + 2_000,
      },
    );
    expect(earlyRefund).toMatchObject({ ok: true, ignored: false, outcome: "refunded" });

    const lateGrant: any = await t.mutation(
      internal.founderUsageBoosts.grantFounderUsageBoostFromStripeInternal,
      {
        receiptKey: "boost_ooo_refund",
        providerCheckoutSessionId: "cs_ooo_refund",
        providerCustomerId: "cus_boost_3",
        providerPaymentIntentId: "pi_ooo_refund",
        providerChargeId: "ch_ooo_refund",
        amountTotalCents: 3_000,
        currency: "usd",
        providerEventCreatedAt: NOW + 1_500,
        nowMs: NOW + 3_000,
      },
    );
    expect(lateGrant).toMatchObject({ ignored: true, reason: "boost_receipt_already_processed" });

    // 2. Grant a boost, then open a dispute -> subscription transitions to ended + riskAccessState: revoked,
    //    so BOTH inference funding admission AND usage reservation fail closed immediately.
    await t.mutation(internal.founderUsageBoosts.prepareFounderUsageBoostCheckoutInternal, {
      receiptKey: "boost_dispute_1",
      ownerUserId: fx.ownerId,
      communityId: fx.communityId,
      expiresAt: NOW + 2 * HOUR_MS,
      nowMs: NOW + 10_000,
    });
    await t.mutation(internal.founderUsageBoosts.attachFounderUsageBoostStripeSessionInternal, {
      receiptKey: "boost_dispute_1",
      providerCheckoutSessionId: "cs_dispute_1",
      providerCustomerId: "cus_boost_3",
      nowMs: NOW + 11_000,
    });
    await t.mutation(internal.founderUsageBoosts.grantFounderUsageBoostFromStripeInternal, {
      receiptKey: "boost_dispute_1",
      providerCheckoutSessionId: "cs_dispute_1",
      providerCustomerId: "cus_boost_3",
      providerPaymentIntentId: "pi_dispute_1",
      providerChargeId: "ch_dispute_1",
      amountTotalCents: 3_000,
      currency: "usd",
      providerEventCreatedAt: NOW + 12_000,
      nowMs: NOW + 12_000,
    });

    const disputed: any = await t.mutation(
      internal.founderUsageBoosts.revokeFounderUsageBoostFromStripeInternal,
      {
        providerPaymentIntentId: "pi_dispute_1",
        receiptKey: "boost_dispute_1",
        outcome: "disputed",
        revokedReason: "boost_dispute_opened",
        providerEventCreatedAt: NOW + 20_000,
        nowMs: NOW + 20_000,
      },
    );
    expect(disputed).toMatchObject({ ok: true, ignored: false, outcome: "disputed" });

    const [admissionWhileDisputed, reserveWhileDisputed] = await t.run(async (ctx: any) => {
      const admission = await resolveCommunityInferenceFundingAdmission(
        ctx,
        fx.communityId,
        NOW + 21_000,
      );
      const reserve = await reserveFounderUsage({
        ctx,
        founderSubscriptionId: fx.subId,
        communityId: fx.communityId,
        nowMs: NOW + 21_000,
        reservationCostMicros: 500_000,
      });
      return [admission, reserve];
    });
    expect(admissionWhileDisputed).toEqual({ ok: false, code: "founder_subscription_inactive" });
    expect(reserveWhileDisputed).toEqual({ ok: false, code: "founder_subscription_inactive" });

    // 3. Winning the dispute restores the receipt + open-cycle boost allowance AND returns
    //    restoreProviderSubscriptionId so httpBilling re-syncs the true Stripe subscription status.
    const won: any = await t.mutation(
      internal.founderUsageBoosts.resolveFounderUsageBoostDisputeFromStripeInternal,
      {
        providerPaymentIntentId: "pi_dispute_1",
        receiptKey: "boost_dispute_1",
        outcome: "won",
        providerEventCreatedAt: NOW + 30_000,
        nowMs: NOW + 30_000,
      },
    );
    expect(won).toMatchObject({
      ok: true,
      ignored: false,
      outcome: "won",
      restoreProviderSubscriptionId: "sub_boost_3",
    });

    const cycleRestored = await t.run(async (ctx: any) => ctx.db.get(fx.cycleId));
    expect(cycleRestored).toMatchObject({
      paidBoostCostMicros: 20_000_000,
      paidBoostCount: 1,
    });

    // Re-sync via canonical founderBilling restoration path (with allowRiskRestoration: true) lifts hold.
    const prevEnv = {
      input: process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS,
      output: process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS,
      maxRes: process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS,
    };
    process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS = "100000";
    process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS = "500000";
    process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS = "1000000";
    try {
      await t.mutation(internal.founderBilling.syncFounderSubscriptionFromStripeInternal, {
        providerSubscriptionId: "sub_boost_3",
        providerCustomerId: "cus_boost_3",
        providerPriceId: "price_boost_3",
        subscriptionStatus: "active",
        currentPeriodStartAt: NOW - 10 * DAY_MS,
        currentPeriodEndAt: NOW + 20 * DAY_MS,
        cancelAtPeriodEnd: false,
        providerEventCreatedAt: NOW + 30_000,
        allowRiskRestoration: true,
      });
    } finally {
      if (prevEnv.input === undefined) delete process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS;
      else process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS = prevEnv.input;
      if (prevEnv.output === undefined) delete process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS;
      else process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS = prevEnv.output;
      if (prevEnv.maxRes === undefined) delete process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS;
      else process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS = prevEnv.maxRes;
    }
    const admissionAfterWin = await t.run(async (ctx: any) =>
      await resolveCommunityInferenceFundingAdmission(ctx, fx.communityId, NOW + 31_000),
    );
    expect(admissionAfterWin.ok).toBe(true);

    // 4. Cross-cycle rollover: when the bound cycle is expired and the new cycle hasn't opened yet,
    //    grantFounderUsageBoostFromStripeInternal returns retryable: true so httpBilling returns 500
    //    and Stripe retries once the renewal webhook opens the next cycle.
    await t.mutation(internal.founderUsageBoosts.prepareFounderUsageBoostCheckoutInternal, {
      receiptKey: "boost_rollover_1",
      ownerUserId: fx.ownerId,
      communityId: fx.communityId,
      expiresAt: NOW + 25 * DAY_MS,
      nowMs: NOW + 32_000,
    });
    await t.mutation(internal.founderUsageBoosts.attachFounderUsageBoostStripeSessionInternal, {
      receiptKey: "boost_rollover_1",
      providerCheckoutSessionId: "cs_rollover_1",
      providerCustomerId: "cus_boost_3",
      nowMs: NOW + 33_000,
    });

    const afterCycleEnd = NOW + 20 * DAY_MS + 5_000;
    const rolloverPending: any = await t.mutation(
      internal.founderUsageBoosts.grantFounderUsageBoostFromStripeInternal,
      {
        receiptKey: "boost_rollover_1",
        providerCheckoutSessionId: "cs_rollover_1",
        providerCustomerId: "cus_boost_3",
        providerPaymentIntentId: "pi_rollover_1",
        providerChargeId: "ch_rollover_1",
        amountTotalCents: 3_000,
        currency: "usd",
        providerEventCreatedAt: afterCycleEnd,
        nowMs: afterCycleEnd,
      },
    );
    expect(rolloverPending).toMatchObject({
      ok: false,
      ignored: false,
      retryable: true,
      reason: "boost_target_cycle_unavailable",
    });

    // Once Stripe renewal opens the next cycle, the retried webhook grants cleanly into the new cycle!
    const nextCycleId = await t.run(async (ctx: any) => {
      await ctx.db.patch(fx.cycleId, { status: "closed", updatedAt: afterCycleEnd + 1_000 });
      await ctx.db.patch(fx.subId, {
        currentPeriodStartAt: NOW + 20 * DAY_MS,
        currentPeriodEndAt: NOW + 50 * DAY_MS,
        updatedAt: afterCycleEnd + 1_000,
      });
      return await ctx.db.insert("founderUsageCycles", {
        founderSubscriptionId: fx.subId,
        communityId: fx.communityId,
        cycleKey: "sub_boost_3:c3",
        cycleStartAt: NOW + 20 * DAY_MS,
        cycleEndAt: NOW + 50 * DAY_MS,
        includedCostMicros: 20_000_000,
        reservedCostMicros: 0,
        settledCostMicros: 0,
        pricingVersion: "founder_plan_luna_v1",
        inputCostMicrosPerMillionTokens: 100_000,
        outputCostMicrosPerMillionTokens: 500_000,
        maxRunReservationCostMicros: 1_000_000,
        status: "open",
        createdAt: afterCycleEnd + 1_000,
        updatedAt: afterCycleEnd + 1_000,
      });
    });

    const rolloverGranted: any = await t.mutation(
      internal.founderUsageBoosts.grantFounderUsageBoostFromStripeInternal,
      {
        receiptKey: "boost_rollover_1",
        providerCheckoutSessionId: "cs_rollover_1",
        providerCustomerId: "cus_boost_3",
        providerPaymentIntentId: "pi_rollover_1",
        providerChargeId: "ch_rollover_1",
        amountTotalCents: 3_000,
        currency: "usd",
        providerEventCreatedAt: afterCycleEnd,
        nowMs: afterCycleEnd + 2_000,
      },
    );
    expect(rolloverGranted).toMatchObject({
      ok: true,
      ignored: false,
      usageCycleId: String(nextCycleId),
      effectiveAllowanceMicros: 40_000_000,
    });
  });
});
