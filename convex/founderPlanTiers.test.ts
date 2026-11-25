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
import { reserveFounderUsage, settleFounderUsageReservation } from "./founderPlanCore";
import {
  expectedFounderStripeUnitAmountForTierPriceId,
  resolveFounderPlanTierFromPriceId,
  resolveFounderSubscriptionMonthlyPriceBaseUnits,
} from "./founderPlanPricing";

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

    // Guide clamps $1.00 run reservation down to $0.25 so founders can use up to $2.75 of their $3.00.
    expect(POLYNET_FOUNDER_GUIDE_MAX_RUN_RESERVATION_CAP_MICROS).toBe(250_000);
    expect(founderPlanTierMaxRunReservationMicros("guide", 1_000_000)).toBe(250_000);
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

      // 1. Sync Guide subscription -> creates $3.00 cycle with $0.25 max run reservation.
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
        maxRunReservationCostMicros: 250_000,
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

      // 6. Mid-flight downgrade revalidation at spend & delivery (P1):
      //    claiming a proactive inference receipt on Guide returns founder_proactive_tier_required,
      //    and member-coach / builder-heartbeat outcome delivery mutations fail closed too.
      const blockedProactiveSpend: any = await t.mutation(
        internal.founderInference.claimCommunityInferenceReceiptInternal,
        {
          receiptKey: "proactive_midflight_1",
          sourceRunId: "run_proactive_midflight_1",
          communityId: fx.communityId,
          actorUserId: fx.ownerId,
          expectedPayerUserId: fx.ownerId,
          expectedFundingMode: "platform_subscription",
          expectedFounderSubscriptionId: fx.subId,
          surface: "community_autonomous_cognition",
          requireProactiveTier: true,
          claimToken: "claim_tok_1",
          nowMs: NOW + 22_000,
        },
      );
      expect(blockedProactiveSpend).toMatchObject({
        ok: false,
        errorCode: "founder_proactive_tier_required",
      });

      const blockedBuilderDeliver: any = await t.mutation(
        internal.communityBuilderHeartbeat.recordBuilderHeartbeatOutcomeInternal,
        {
          communityId: fx.communityId,
          builderUserId: fx.ownerId,
          dedupeKey: "builder_midflight_1",
          decision: "send",
          text: "Checking in on your goal!",
          nowMs: NOW + 22_000,
        },
      );
      expect(blockedBuilderDeliver).toEqual({ ok: false, code: "community_unavailable" });

      // 7. Temporary downgrade headroom shrinks back to $3.00 when in-flight reservation settles (P2):
      //    Set $2.80 settled + $1.00 reserved on Chief of Staff -> downgrade to Guide clamps included to $3.80 ->
      //    settling for $0.05 reclaims temporary headroom back down to $3.00!
      await t.mutation(internal.founderBilling.syncFounderSubscriptionFromStripeInternal, {
        providerSubscriptionId: "sub_tier_1",
        providerCustomerId: "cus_tier_1",
        providerPriceId: "price_cos_100",
        subscriptionStatus: "active",
        currentPeriodStartAt: NOW - 5 * DAY_MS,
        currentPeriodEndAt: NOW + 25 * DAY_MS,
        cancelAtPeriodEnd: false,
        providerEventCreatedAt: NOW + 30_000,
      });
      await t.run(async (ctx: any) => {
        await ctx.db.patch(guideSync.usageCycleId, {
          settledCostMicros: 2_800_000,
          reservedCostMicros: 1_000_000,
        });
      });
      await t.mutation(internal.founderBilling.syncFounderSubscriptionFromStripeInternal, {
        providerSubscriptionId: "sub_tier_1",
        providerCustomerId: "cus_tier_1",
        providerPriceId: "price_guide_20",
        subscriptionStatus: "active",
        currentPeriodStartAt: NOW - 5 * DAY_MS,
        currentPeriodEndAt: NOW + 25 * DAY_MS,
        cancelAtPeriodEnd: false,
        providerEventCreatedAt: NOW + 31_000,
      });
      const clampedWhileReserved = await t.run(async (ctx: any) => ctx.db.get(guideSync.usageCycleId));
      expect(clampedWhileReserved?.includedCostMicros).toBe(3_800_000);

      await t.run(async (ctx: any) =>
        await settleFounderUsageReservation({
          ctx,
          usageCycleId: guideSync.usageCycleId,
          reservedCostMicros: 1_000_000,
          settledCostMicros: 50_000,
          nowMs: NOW + 32_000,
        }),
      );
      const reclaimedAfterSettle = await t.run(async (ctx: any) => ctx.db.get(guideSync.usageCycleId));
      expect(reclaimedAfterSettle).toMatchObject({
        settledCostMicros: 2_850_000,
        reservedCostMicros: 0,
        includedCostMicros: 3_000_000,
      });

      // 8. Inactive / past-due Guide subscription is ALSO rejected by claimFounderBriefInternal (P2):
      await t.run(async (ctx: any) => {
        await ctx.db.patch(fx.subId, { status: "past_due" });
      });
      const briefWhilePastDue = await t.mutation(
        internal.communityFounderBrief.claimFounderBriefInternal,
        { communityId: fx.communityId, briefDate: "2026-11-25", nowMs: NOW + 40_000 },
      );
      expect(briefWhilePastDue).toBeNull();
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

  test("Step 2: $0.25 Guide reservation headroom, alert re-arming on mid-cycle upgrade, tier-aware billing overview, checkout price binding, and fail-closed tier switches", async () => {
    const t = convexTest(schema, modules);
    const prevEnv = {
      input: process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS,
      output: process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS,
      maxRes: process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS,
      guidePrice: process.env.POLYNET_FOUNDER_GUIDE_STRIPE_PRICE_ID,
      cosPrice: process.env.POLYNET_FOUNDER_CHIEF_OF_STAFF_STRIPE_PRICE_ID,
      legacyPrice: process.env.POLYNET_FOUNDER_STRIPE_PRICE_ID,
    };
    process.env.POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS = "100000";
    process.env.POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS = "500000";
    process.env.POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS = "1000000";
    process.env.POLYNET_FOUNDER_GUIDE_STRIPE_PRICE_ID = "price_guide_20";
    process.env.POLYNET_FOUNDER_CHIEF_OF_STAFF_STRIPE_PRICE_ID = "price_cos_100";
    process.env.POLYNET_FOUNDER_STRIPE_PRICE_ID = "price_legacy_79";

    try {
      // Price contract resolution: Guide = $20, Chief of Staff = $100, grandfathered legacy = $79.
      expect(expectedFounderStripeUnitAmountForTierPriceId("guide", "price_guide_20")).toBe(2_000);
      expect(expectedFounderStripeUnitAmountForTierPriceId("chief_of_staff", "price_cos_100")).toBe(10_000);
      expect(expectedFounderStripeUnitAmountForTierPriceId("chief_of_staff", "price_legacy_79")).toBe(7_900);
      expect(resolveFounderSubscriptionMonthlyPriceBaseUnits("price_guide_20", "guide")).toBe(2_000);
      expect(resolveFounderSubscriptionMonthlyPriceBaseUnits("price_cos_100", "chief_of_staff")).toBe(10_000);
      expect(resolveFounderSubscriptionMonthlyPriceBaseUnits("price_legacy_79", "chief_of_staff")).toBe(7_900);

      const fx = await t.run(async (ctx: any) => {
        const ownerId = await ctx.db.insert("users", {
          authSubject: "owner-step2",
          displayName: "Neil",
          email: "neil-step2@example.com",
          emailVerifiedAt: NOW - 60 * DAY_MS,
          createdAt: NOW - 60 * DAY_MS,
          updatedAt: NOW - 60 * DAY_MS,
        });
        const strangerId = await ctx.db.insert("users", {
          authSubject: "stranger-step2",
          displayName: "Stranger",
          email: "stranger-step2@example.com",
          emailVerifiedAt: NOW - 60 * DAY_MS,
          createdAt: NOW - 60 * DAY_MS,
          updatedAt: NOW - 60 * DAY_MS,
        });
        const guideCommunityId = await ctx.db.insert("communities", {
          ownerId,
          slug: "guide-club",
          name: "Guide Club",
          visibility: "published",
          inferenceFundingPolicy: "managed_required",
          entryPolicy: "open",
          activeMemberCount: 1,
          createdAt: NOW - 30 * DAY_MS,
          updatedAt: NOW - 30 * DAY_MS,
        });
        const cosCommunityId = await ctx.db.insert("communities", {
          ownerId,
          slug: "cos-club",
          name: "Chief Club",
          visibility: "published",
          inferenceFundingPolicy: "managed_required",
          entryPolicy: "open",
          activeMemberCount: 1,
          createdAt: NOW - 29 * DAY_MS,
          updatedAt: NOW - 29 * DAY_MS,
        });
        const legacyCommunityId = await ctx.db.insert("communities", {
          ownerId,
          slug: "legacy-club",
          name: "Legacy Club",
          visibility: "published",
          inferenceFundingPolicy: "managed_required",
          entryPolicy: "open",
          activeMemberCount: 1,
          createdAt: NOW - 28 * DAY_MS,
          updatedAt: NOW - 28 * DAY_MS,
        });
        const freeCommunityId = await ctx.db.insert("communities", {
          ownerId,
          slug: "free-club",
          name: "Free Club",
          visibility: "published",
          inferenceFundingPolicy: "managed_required",
          entryPolicy: "open",
          activeMemberCount: 1,
          createdAt: NOW - 27 * DAY_MS,
          updatedAt: NOW - 27 * DAY_MS,
        });

        const guideSubId = await ctx.db.insert("founderSubscriptions", {
          ownerUserId: ownerId,
          communityId: guideCommunityId,
          provider: "stripe",
          providerCustomerId: "cus_step2",
          providerSubscriptionId: "sub_step2_guide",
          providerPriceId: "price_guide_20",
          planTier: "guide",
          status: "active",
          currentPeriodStartAt: NOW - 5 * DAY_MS,
          currentPeriodEndAt: NOW + 25 * DAY_MS,
          cancelAtPeriodEnd: false,
          lastProviderEventCreatedAt: NOW - 5 * DAY_MS,
          createdAt: NOW - 30 * DAY_MS,
          updatedAt: NOW - 5 * DAY_MS,
        });
        await ctx.db.insert("founderSubscriptions", {
          ownerUserId: ownerId,
          communityId: cosCommunityId,
          provider: "stripe",
          providerCustomerId: "cus_step2",
          providerSubscriptionId: "sub_step2_cos",
          providerPriceId: "price_cos_100",
          planTier: "chief_of_staff",
          status: "active",
          currentPeriodStartAt: NOW - 5 * DAY_MS,
          currentPeriodEndAt: NOW + 25 * DAY_MS,
          cancelAtPeriodEnd: false,
          lastProviderEventCreatedAt: NOW - 5 * DAY_MS,
          createdAt: NOW - 30 * DAY_MS,
          updatedAt: NOW - 5 * DAY_MS,
        });
        await ctx.db.insert("founderSubscriptions", {
          ownerUserId: ownerId,
          communityId: legacyCommunityId,
          provider: "stripe",
          providerCustomerId: "cus_step2",
          providerSubscriptionId: "sub_step2_legacy",
          providerPriceId: "price_legacy_79",
          status: "active",
          currentPeriodStartAt: NOW - 5 * DAY_MS,
          currentPeriodEndAt: NOW + 25 * DAY_MS,
          cancelAtPeriodEnd: false,
          lastProviderEventCreatedAt: NOW - 5 * DAY_MS,
          createdAt: NOW - 30 * DAY_MS,
          updatedAt: NOW - 5 * DAY_MS,
        });
        const guideSettingsId = await ctx.db.insert("communityMemberCoachSettings", {
          communityId: guideCommunityId,
          enabled: true,
          autoReasons: [],
          createdAt: NOW - 5 * DAY_MS,
          updatedAt: NOW - 5 * DAY_MS,
        });
        return {
          ownerId,
          strangerId,
          guideCommunityId,
          cosCommunityId,
          legacyCommunityId,
          freeCommunityId,
          guideSubId,
          guideSettingsId,
        };
      });

      // 1. Billing overview exposes tier prices, per-community plan_tier, and exact $199 ($20 + $100 + $79) total.
      const asOwner = t.withIdentity({ subject: "owner-step2" });
      const overview: any = await asOwner.query(api.founderBilling.getFounderBillingOverview, {});
      expect(overview).toMatchObject({
        guide_tier_available: true,
        guide_monthly_price_base_units: 2_000,
        chief_of_staff_monthly_price_base_units: 10_000,
        managed_monthly_total_base_units: 19_900,
      });
      const bySlug = new Map(overview.communities.map((c: any) => [c.community_slug, c]));
      expect(bySlug.get("guide-club")).toMatchObject({
        plan_tier: "guide",
        monthly_price_base_units: 2_000,
      });
      expect(bySlug.get("cos-club")).toMatchObject({
        plan_tier: "chief_of_staff",
        monthly_price_base_units: 10_000,
      });
      expect(bySlug.get("legacy-club")).toMatchObject({
        plan_tier: "chief_of_staff",
        monthly_price_base_units: 7_900,
      });
      expect(bySlug.get("free-club")).toMatchObject({
        plan_tier: null,
        monthly_price_base_units: 10_000,
      });

      // 2. Guide $0.25 reservation cap lets founders spend up to $2.75 of their $3.00 allowance.
      const guideSync: any = await t.mutation(
        internal.founderBilling.syncFounderSubscriptionFromStripeInternal,
        {
          providerSubscriptionId: "sub_step2_guide",
          providerCustomerId: "cus_step2",
          providerPriceId: "price_guide_20",
          subscriptionStatus: "active",
          currentPeriodStartAt: NOW - 5 * DAY_MS,
          currentPeriodEndAt: NOW + 25 * DAY_MS,
          cancelAtPeriodEnd: false,
          providerEventCreatedAt: NOW,
        },
      );
      await t.run(async (ctx: any) => {
        await ctx.db.patch(guideSync.usageCycleId, { settledCostMicros: 2_700_000 });
      });
      // Deliver the 80% allowance alert while on Guide ($2.70 / $3.00 = 90%).
      const guideAlertPass: any = await t.mutation(
        internal.communityAllowanceGuardrails.processFounderAllowanceAlertsPageInternal,
        { nowMs: NOW + 500 },
      );
      expect(guideAlertPass.alertsSent).toBe(1);
      const settingsAfterGuideAlert = await t.run(async (ctx: any) =>
        ctx.db.get(fx.guideSettingsId),
      );
      expect(settingsAfterGuideAlert.allowanceAlertNotifiedPercent).toBe(80);

      // At $2.70 spent on $3.00 allowance, a $0.25 reservation succeeds ($2.70 + $0.25 = $2.95 <= $3.00)!
      const reserveAt270 = await t.run(async (ctx: any) =>
        await reserveFounderUsage({
          ctx,
          founderSubscriptionId: fx.guideSubId,
          communityId: fx.guideCommunityId,
          nowMs: NOW + 1_000,
        }),
      );
      expect(reserveAt270).toMatchObject({
        ok: true,
        cycle: { reservedCostMicros: 250_000 },
      });
      // Release reservation cleanly before upgrade check.
      await t.run(async (ctx: any) =>
        await settleFounderUsageReservation({
          ctx,
          usageCycleId: guideSync.usageCycleId,
          reservedCostMicros: 250_000,
          settledCostMicros: 0,
          nowMs: NOW + 1_500,
        }),
      );

      // 3. Mid-cycle upgrade Guide -> Chief of Staff re-arms allowanceAlertNotifiedPercent from 80 -> 0
      //    AND later hitting 80% of $20 ($16.50) delivers a distinct thread notice + email job!
      await t.mutation(internal.founderBilling.syncFounderSubscriptionFromStripeInternal, {
        providerSubscriptionId: "sub_step2_guide",
        providerCustomerId: "cus_step2",
        providerPriceId: "price_cos_100",
        subscriptionStatus: "active",
        currentPeriodStartAt: NOW - 5 * DAY_MS,
        currentPeriodEndAt: NOW + 25 * DAY_MS,
        cancelAtPeriodEnd: false,
        providerEventCreatedAt: NOW + 2_000,
      });
      const settingsAfterUpgrade = await t.run(async (ctx: any) =>
        ctx.db.get(fx.guideSettingsId),
      );
      expect(settingsAfterUpgrade.allowanceAlertNotifiedPercent).toBe(0);

      await t.run(async (ctx: any) => {
        await ctx.db.patch(guideSync.usageCycleId, { settledCostMicros: 16_500_000 });
      });
      const cosAlertPass: any = await t.mutation(
        internal.communityAllowanceGuardrails.processFounderAllowanceAlertsPageInternal,
        { nowMs: NOW + 2_500 },
      );
      expect(cosAlertPass.alertsSent).toBe(1);
      const alertDeliveryCounts = await t.run(async (ctx: any) => {
        const emails = await ctx.db.query("emailOutbox").collect();
        const allowanceEmails = emails.filter(
          (e: any) => e.templateKey === "founder_allowance_notice",
        );
        const messages = await ctx.db.query("cloudMessages").collect();
        const allowanceMsgs = messages.filter(
          (m: any) => m.contentJson?.meta?.kind === "founder_allowance_notice",
        );
        return { emailCount: allowanceEmails.length, messageCount: allowanceMsgs.length };
      });
      expect(alertDeliveryCounts).toEqual({ emailCount: 2, messageCount: 2 });

      // 4. Tier switch preparation fails closed on non-owners, same-tier no-op (incl. grandfathered $79),
      //    and risk-revoked subscriptions, while permitting valid active Guide <-> Chief of Staff switches.
      await expect(
        t.query(internal.founderBilling.prepareFounderSubscriptionTierSwitchInternal, {
          ownerUserId: fx.strangerId,
          communityId: fx.guideCommunityId,
          targetTier: "guide",
          nowMs: NOW + 3_000,
        }),
      ).rejects.toThrow(/founder_subscription_community_forbidden/);

      await expect(
        t.query(internal.founderBilling.prepareFounderSubscriptionTierSwitchInternal, {
          ownerUserId: fx.ownerId,
          communityId: fx.legacyCommunityId,
          targetTier: "chief_of_staff",
          nowMs: NOW + 3_000,
        }),
      ).rejects.toThrow(/founder_subscription_tier_unchanged/);

      const validDowngradeTarget: any = await t.query(
        internal.founderBilling.prepareFounderSubscriptionTierSwitchInternal,
        {
          ownerUserId: fx.ownerId,
          communityId: fx.guideCommunityId,
          targetTier: "guide",
          nowMs: NOW + 3_000,
        },
      );
      expect(validDowngradeTarget).toMatchObject({
        providerSubscriptionId: "sub_step2_guide",
        currentTier: "chief_of_staff",
      });

      await t.run(async (ctx: any) => {
        await ctx.db.patch(fx.guideSubId, { riskAccessState: "revoked", revokedReason: "subscription_dispute_opened" });
      });
      await expect(
        t.query(internal.founderBilling.prepareFounderSubscriptionTierSwitchInternal, {
          ownerUserId: fx.ownerId,
          communityId: fx.guideCommunityId,
          targetTier: "guide",
          nowMs: NOW + 3_000,
        }),
      ).rejects.toThrow(/founder_subscription_required/);

      // 5. Pending checkout creation binds tier price, blocks double subscriptions on managed communities,
      //    and rejects mismatched prices on attach.
      await expect(
        t.mutation(internal.founderBilling.createPendingFounderSubscriptionCheckoutInternal, {
          sessionId: "founder_dup_blocked",
          ownerUserId: fx.ownerId,
          communityId: fx.cosCommunityId,
          providerPriceId: "price_guide_20",
          amountBaseUnits: 2_000,
          expiresAt: NOW + 24 * HOUR_MS,
          nowMs: NOW + 4_000,
        }),
      ).rejects.toThrow(/founder_subscription_community_already_managed/);

      const guidePending: any = await t.mutation(
        internal.founderBilling.createPendingFounderSubscriptionCheckoutInternal,
        {
          sessionId: "founder_guide_session_1",
          ownerUserId: fx.ownerId,
          communityId: fx.freeCommunityId,
          providerPriceId: "price_guide_20",
          amountBaseUnits: 2_000,
          expiresAt: NOW + 24 * HOUR_MS,
          nowMs: NOW + 4_000,
        },
      );
      expect(guidePending).toMatchObject({
        sessionId: "founder_guide_session_1",
        providerPriceId: "price_guide_20",
        reused: false,
      });

      // Attaching a Chief of Staff price to a Guide pending session fails closed!
      await expect(
        t.mutation(internal.founderBilling.attachFounderStripeCheckoutSessionInternal, {
          sessionId: "founder_guide_session_1",
          providerCheckoutSessionId: "cs_wrong_price",
          providerCustomerId: "cus_step2",
          providerPriceId: "price_cos_100",
          nowMs: NOW + 4_500,
        }),
      ).rejects.toThrow(/founder_subscription_price_mismatch/);

      // Attaching the matching Guide price succeeds cleanly!
      await t.mutation(internal.founderBilling.attachFounderStripeCheckoutSessionInternal, {
        sessionId: "founder_guide_session_1",
        providerCheckoutSessionId: "cs_guide_ok",
        providerCustomerId: "cus_step2",
        providerPriceId: "price_guide_20",
        nowMs: NOW + 4_600,
      });
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
      if (prevEnv.legacyPrice === undefined) delete process.env.POLYNET_FOUNDER_STRIPE_PRICE_ID;
      else process.env.POLYNET_FOUNDER_STRIPE_PRICE_ID = prevEnv.legacyPrice;
    }
  });
});
