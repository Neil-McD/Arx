/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  POLYNET_FOUNDER_CHIEF_OF_STAFF_INCLUDED_COST_MICROS,
  POLYNET_FOUNDER_GUIDE_INCLUDED_COST_MICROS,
  POLYNET_FOUNDER_GUIDE_MAX_RUN_RESERVATION_CAP_MICROS,
  founderPlanTierAllowsUsageBoosts,
  founderPlanTierHasProactiveAgent,
  founderPlanTierIncludedCostMicros,
  founderPlanTierMaxRunReservationMicros,
  normalizeFounderPlanTier,
} from "../shared/founderPlan";
import {
  communityHasProactiveAgentTier,
  resolveCommunityInferenceFundingAdmission,
} from "./founderInferenceCore";
import { reserveFounderUsage } from "./founderPlanCore";
import { resolveFounderPlanTierFromPriceId } from "./founderPlanPricing";

const modules = import.meta.glob([
  "./*.ts",
  "!./*.test.ts",
  "./_generated/**/*.*s",
]);

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
const NOW = Date.UTC(2026, 10, 24, 18, 0, 0);

describe("3-Tier Pricing ($0 Free / $20 Guide / $100 Chief of Staff) — Step 1", () => {
  test("pure tier rules enforce Guide ($3 AI, reactive) vs Chief of Staff ($20 AI, proactive) and grandfather legacy $79", () => {
    expect(normalizeFounderPlanTier("guide")).toBe("guide");
    expect(normalizeFounderPlanTier("chief_of_staff")).toBe("chief_of_staff");
    // Legacy/absent rows grandfather cleanly into Chief of Staff.
    expect(normalizeFounderPlanTier(undefined)).toBe("chief_of_staff");
    expect(normalizeFounderPlanTier("")).toBe("chief_of_staff");

    expect(founderPlanTierIncludedCostMicros("guide")).toBe(POLYNET_FOUNDER_GUIDE_INCLUDED_COST_MICROS);
    expect(founderPlanTierIncludedCostMicros("chief_of_staff")).toBe(
      POLYNET_FOUNDER_CHIEF_OF_STAFF_INCLUDED_COST_MICROS,
    );
    expect(founderPlanTierHasProactiveAgent("guide")).toBe(false);
    expect(founderPlanTierHasProactiveAgent("chief_of_staff")).toBe(true);
    expect(founderPlanTierAllowsUsageBoosts("guide")).toBe(false);
    expect(founderPlanTierAllowsUsageBoosts("chief_of_staff")).toBe(true);

    // Guide clamps $1.00 run reservation down to $0.50 so founders can use $2.50+ of their $3.00.
    expect(founderPlanTierMaxRunReservationMicros("guide", 1_000_000)).toBe(
      POLYNET_FOUNDER_GUIDE_MAX_RUN_RESERVATION_CAP_MICROS,
    );
    expect(founderPlanTierMaxRunReservationMicros("chief_of_staff", 1_000_000)).toBe(1_000_000);

    // Price ID resolution maps explicit Guide price ID -> guide; Chief of Staff & legacy $79 -> chief_of_staff.
    expect(
      resolveFounderPlanTierFromPriceId("price_guide_20", { guidePriceId: "price_guide_20" }),
    ).toBe("guide");
    expect(
      resolveFounderPlanTierFromPriceId("price_cos_100", { guidePriceId: "price_guide_20" }),
    ).toBe("chief_of_staff");
    expect(
      resolveFounderPlanTierFromPriceId("price_legacy_79", { guidePriceId: "price_guide_20" }),
    ).toBe("chief_of_staff");
  });

  test("Guide ($20/$3 AI) admits reactive chats, gates all 5 Chief of Staff engines, and handles mid-cycle upgrade & safe downgrade", async () => {
    const t = convexTest(schema, modules);
    const prevEnv = {
      input: process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS,
      output: process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS,
      maxRes: process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS,
      guidePrice: process.env.POLYNET_FOUNDER_GUIDE_STRIPE_PRICE_ID,
      cosPrice: process.env.POLYNET_FOUNDER_CHIEF_OF_STAFF_STRIPE_PRICE_ID,
    };
    process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS = "100000";
    process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS = "500000";
    process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS = "1000000";
    process.env.POLYNET_FOUNDER_GUIDE_STRIPE_PRICE_ID = "price_guide_20";
    process.env.POLYNET_FOUNDER_CHIEF_OF_STAFF_STRIPE_PRICE_ID = "price_cos_100";

    try {
      const fx = await t.run(async (ctx: any) => {
        const ownerId = await ctx.db.insert("users", {
          authSubject: "owner-tier-1",
          displayName: "Neil",
          email: "neil-tier@example.com",
          emailVerifiedAt: NOW - 60 * DAY_MS,
          createdAt: NOW - 60 * DAY_MS,
          updatedAt: NOW - 60 * DAY_MS,
        });
        const memberId = await ctx.db.insert("users", {
          authSubject: "member-tier-1",
          displayName: "Sam",
          email: "sam-tier@example.com",
          emailVerifiedAt: NOW - 30 * DAY_MS,
          createdAt: NOW - 30 * DAY_MS,
          updatedAt: NOW - 30 * DAY_MS,
        });
        const communityId = await ctx.db.insert("communities", {
          ownerId,
          slug: "tier-club",
          name: "Tier Club",
          visibility: "published",
          inferenceFundingPolicy: "managed_required",
          entryPolicy: "open",
          activeMemberCount: 2,
          createdAt: NOW - 60 * DAY_MS,
          updatedAt: NOW - 60 * DAY_MS,
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
          actorUserId: memberId,
          kind: "question",
          visibilityScope: "community",
          status: "live",
          contentSummary: "How do I ship my first course?",
          replyCount: 0,
          reactionSummary: [],
          idempotencyKey: "tier-q-1",
          createdAt: NOW - 26 * HOUR_MS,
          updatedAt: NOW - 26 * HOUR_MS,
        });
        const subId = await ctx.db.insert("founderSubscriptions", {
          ownerUserId: ownerId,
          communityId,
          provider: "stripe",
          providerCustomerId: "cus_tier_1",
          providerSubscriptionId: "sub_tier_1",
          providerPriceId: "price_guide_20",
          planTier: "guide",
          status: "active",
          currentPeriodStartAt: NOW - 5 * DAY_MS,
          currentPeriodEndAt: NOW + 25 * DAY_MS,
          cancelAtPeriodEnd: false,
          lastProviderEventCreatedAt: NOW - 5 * DAY_MS,
          createdAt: NOW - 40 * DAY_MS,
          updatedAt: NOW - 5 * DAY_MS,
        });
        const settingsId = await ctx.db.insert("communityMemberCoachSettings", {
          communityId,
          enabled: true,
          autoReasons: [],
          usageBoostCapCents: 6_000,
          nextScanAt: NOW - 1_000,
          builderNextScanAt: NOW - 1_000,
          createdAt: NOW - 5 * DAY_MS,
          updatedAt: NOW - 5 * DAY_MS,
        });
        await ctx.db.insert("communityFounderBriefSettings", {
          communityId,
          enabled: true,
          localHour: 8,
          timeZone: "UTC",
          nextDueAt: NOW - 1_000,
          updatedByUserId: ownerId,
          createdAt: NOW - 5 * DAY_MS,
          updatedAt: NOW - 5 * DAY_MS,
        });
        return { ownerId, communityId, subId, settingsId };
      });

      // 1. Sync Guide subscription -> creates $3.00 cycle with $0.50 max run reservation.
      const guideSync: any = await t.mutation(
        internal.founderBilling.syncFounderSubscriptionFromStripeInternal,
        {
          providerSubscriptionId: "sub_tier_1",
          providerCustomerId: "cus_tier_1",
          providerPriceId: "price_guide_20",
          subscriptionStatus: "active",
          currentPeriodStartAt: NOW - 5 * DAY_MS,
          currentPeriodEndAt: NOW + 25 * DAY_MS,
          cancelAtPeriodEnd: false,
          providerEventCreatedAt: NOW,
        },
      );
      expect(guideSync.ok).toBe(true);
      const guideCycle = await t.run(async (ctx: any) => ctx.db.get(guideSync.usageCycleId));
      expect(guideCycle).toMatchObject({
        includedCostMicros: 3_000_000,
        maxRunReservationCostMicros: 500_000,
      });

      // 2. Reactive admission succeeds on Guide, while proactive tier gate fails closed.
      const [admissionGuide, hasProactiveGuide] = await t.run(async (ctx: any) =>
        Promise.all([
          resolveCommunityInferenceFundingAdmission(ctx, fx.communityId, NOW + 1_000),
          communityHasProactiveAgentTier(ctx, fx.communityId, NOW + 1_000),
        ]),
      );
      expect(admissionGuide).toMatchObject({ ok: true, mode: "platform_subscription", planTier: "guide" });
      expect(hasProactiveGuide).toBe(false);

      // 3. ALL 5 Chief of Staff surfaces fail closed on Guide tier ($0 AI spent):
      const coachClaimGuide = await t.mutation(
        internal.communityMemberCoach.claimCommunityMemberCoachScanInternal,
        { settingsId: fx.settingsId, nowMs: NOW + 1_000 },
      );
      expect(coachClaimGuide).toBeNull();

      const builderClaimGuide = await t.mutation(
        internal.communityBuilderHeartbeat.claimBuilderHeartbeatScanInternal,
        { settingsId: fx.settingsId, nowMs: NOW + 1_000 },
      );
      expect(builderClaimGuide).toBeNull();

      const replyDraftGuide = await t.query(
        internal.communityReplyDrafts.readReplyDraftInputInternal,
        { communityId: fx.communityId, nowMs: NOW + 1_000 },
      );
      expect(replyDraftGuide.question).toBeNull();

      const briefClaimGuide = await t.mutation(
        internal.communityFounderBrief.claimFounderBriefInternal,
        { communityId: fx.communityId, briefDate: "2026-11-24", nowMs: NOW + 1_000 },
      );
      expect(briefClaimGuide).toBeNull();

      await expect(
        t.mutation(internal.founderUsageBoosts.prepareFounderUsageBoostCheckoutInternal, {
          receiptKey: "boost_guide_blocked",
          ownerUserId: fx.ownerId,
          communityId: fx.communityId,
          expiresAt: NOW + 2 * HOUR_MS,
          nowMs: NOW + 1_000,
        }),
      ).rejects.toThrow(/founder_usage_boost_tier_required/);

      // Owner Settings view reports plan_tier: "guide" and boost blocked by tier.
      const asOwner = t.withIdentity({ subject: "owner-tier-1" });
      const guideSettingsView = await asOwner.query(api.communityMemberCoach.getMemberCoachSettings, {
        communityId: fx.communityId,
      });
      expect(guideSettingsView.impact).toMatchObject({
        plan_tier: "guide",
        allowance_micros: 3_000_000,
        can_buy_usage_boost: false,
        usage_boost_block_reason: "founder_usage_boost_tier_required",
      });

      // 4. Mid-cycle UPGRADE (Guide -> Chief of Staff): raises allowance $3 -> $20 immediately
      //    and unlocks proactive engines + boost checkout!
      await t.mutation(internal.founderBilling.syncFounderSubscriptionFromStripeInternal, {
        providerSubscriptionId: "sub_tier_1",
        providerCustomerId: "cus_tier_1",
        providerPriceId: "price_cos_100",
        subscriptionStatus: "active",
        currentPeriodStartAt: NOW - 5 * DAY_MS,
        currentPeriodEndAt: NOW + 25 * DAY_MS,
        cancelAtPeriodEnd: false,
        providerEventCreatedAt: NOW + 10_000,
      });
      const upgradedCycle = await t.run(async (ctx: any) => ctx.db.get(guideSync.usageCycleId));
      expect(upgradedCycle).toMatchObject({
        includedCostMicros: 20_000_000,
        maxRunReservationCostMicros: 1_000_000,
      });

      await t.run(async (ctx: any) => {
        await ctx.db.patch(fx.settingsId, {
          leaseUntil: undefined,
          builderLeaseUntil: undefined,
          nextScanAt: NOW + 11_000,
          builderNextScanAt: NOW + 11_000,
        });
      });
      const coachClaimCos = await t.mutation(
        internal.communityMemberCoach.claimCommunityMemberCoachScanInternal,
        { settingsId: fx.settingsId, nowMs: NOW + 12_000 },
      );
      expect(coachClaimCos).not.toBeNull();
      const briefClaimCos = await t.mutation(
        internal.communityFounderBrief.claimFounderBriefInternal,
        { communityId: fx.communityId, briefDate: "2026-11-24", nowMs: NOW + 12_000 },
      );
      expect(briefClaimCos).not.toBeNull();

      // 5. Spend $7.00 on Chief of Staff, then DOWNGRADE mid-cycle back to Guide ($3.00):
      //    clamps includedCostMicros safely to $7.00 (no ledger crash!), leaves $0 headroom,
      //    and immediately turns off proactive engines!
      await t.run(async (ctx: any) => {
        await ctx.db.patch(guideSync.usageCycleId, { settledCostMicros: 7_000_000 });
      });
      await t.mutation(internal.founderBilling.syncFounderSubscriptionFromStripeInternal, {
        providerSubscriptionId: "sub_tier_1",
        providerCustomerId: "cus_tier_1",
        providerPriceId: "price_guide_20",
        subscriptionStatus: "active",
        currentPeriodStartAt: NOW - 5 * DAY_MS,
        currentPeriodEndAt: NOW + 25 * DAY_MS,
        cancelAtPeriodEnd: false,
        providerEventCreatedAt: NOW + 20_000,
      });
      const downgradedCycle = await t.run(async (ctx: any) => ctx.db.get(guideSync.usageCycleId));
      expect(downgradedCycle?.includedCostMicros).toBe(7_000_000);

      const reserveAfterDowngrade = await t.run(async (ctx: any) =>
        await reserveFounderUsage({
          ctx,
          founderSubscriptionId: fx.subId,
          communityId: fx.communityId,
          nowMs: NOW + 21_000,
        }),
      );
      expect(reserveAfterDowngrade).toEqual({ ok: false, code: "founder_usage_exhausted" });

      const hasProactiveAfterDowngrade = await t.run(async (ctx: any) =>
        await communityHasProactiveAgentTier(ctx, fx.communityId, NOW + 21_000),
      );
      expect(hasProactiveAfterDowngrade).toBe(false);
    } finally {
      if (prevEnv.input === undefined) delete process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS;
      else process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS = prevEnv.input;
      if (prevEnv.output === undefined) delete process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS;
      else process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS = prevEnv.output;
      if (prevEnv.maxRes === undefined) delete process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS;
      else process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS = prevEnv.maxRes;
      if (prevEnv.guidePrice === undefined) delete process.env.POLYNET_FOUNDER_GUIDE_STRIPE_PRICE_ID;
      else process.env.POLYNET_FOUNDER_GUIDE_STRIPE_PRICE_ID = prevEnv.guidePrice;
      if (prevEnv.cosPrice === undefined) delete process.env.POLYNET_FOUNDER_CHIEF_OF_STAFF_STRIPE_PRICE_ID;
      else process.env.POLYNET_FOUNDER_CHIEF_OF_STAFF_STRIPE_PRICE_ID = prevEnv.cosPrice;
    }
  });
});
