/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  FOUNDER_USAGE_BOOST_ALLOWANCE_MICROS,
  FOUNDER_USAGE_BOOST_FIRST_CYCLE_MAX_CENTS,
  canGrantAdditionalUsageBoost,
  computeEffectiveCycleAllowanceMicros,
  isSubscriptionInFirstBillingCycle,
  resolveEffectiveMonthlyBoostCapCents,
} from "../shared/founderUsageBoosts";
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
});
