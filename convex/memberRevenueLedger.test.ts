/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  aggregateStageMrr,
  computeMemberRevenueSummary,
  evaluateVerifiedSavedMember,
  formatCompactMrr,
  monthlyMrrForPricePoint,
} from "../shared/memberRevenueLedger";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const DAY_MS = 24 * 60 * 60_000;

describe("Slice 2 — Realized LTV Ledger, Stage MRR, and Verified Saved Revenue", () => {
  test("computes conservative realized LTV, annual MRR normalization, and excludes refunded/disputed revenue", () => {
    const nowMs = Date.UTC(2026, 10, 27, 12, 0);
    expect(
      monthlyMrrForPricePoint({ amountBaseUnits: 4900, currency: "usd", currencyDecimals: 2, billingPeriod: "monthly" }),
    ).toBe(4900);
    expect(
      monthlyMrrForPricePoint({ amountBaseUnits: 120000, currency: "usd", currencyDecimals: 2, billingPeriod: "annual" }),
    ).toBe(10000);
    expect(formatCompactMrr(4900, "USD", 2)).toBe("$49/mo");

    // 3 monthly renewals -> $147 realized LTV, $49/mo MRR, 3 months retained.
    const recurring = computeMemberRevenueSummary({
      membership: { state: "active", createdAt: nowMs - 95 * DAY_MS, activatedAt: nowMs - 95 * DAY_MS },
      subscriptions: [
        {
          status: "active",
          pricePoint: { amountBaseUnits: 4900, currency: "usd", currencyDecimals: 2, billingPeriod: "monthly" },
          createdAt: nowMs - 95 * DAY_MS,
          updatedAt: nowMs - 5 * DAY_MS,
          currentPeriodStartAt: nowMs - 5 * DAY_MS,
          currentPeriodEndAt: nowMs + 25 * DAY_MS,
        },
      ],
      subscriptionAuditEvents: [
        { subscriptionStatus: "active", currentPeriodStartAt: nowMs - 95 * DAY_MS, createdAt: nowMs - 95 * DAY_MS },
        { subscriptionStatus: "active", currentPeriodStartAt: nowMs - 65 * DAY_MS, createdAt: nowMs - 65 * DAY_MS },
        { subscriptionStatus: "active", currentPeriodStartAt: nowMs - 35 * DAY_MS, createdAt: nowMs - 35 * DAY_MS },
        { subscriptionStatus: "active", currentPeriodStartAt: nowMs - 5 * DAY_MS, createdAt: nowMs - 5 * DAY_MS },
      ],
      podPayments: [
        { status: "active", amountBaseUnits: 2500, currency: "usd", createdAt: nowMs - 40 * DAY_MS, grantedAt: nowMs - 40 * DAY_MS },
      ],
      nowMs,
    });
    expect(recurring).toMatchObject({
      active_mrr_base_units: 4900,
      realized_ltv_base_units: 4 * 4900 + 2500,
      billing_cycles_paid: 4,
      months_retained: 3,
      currency: "USD",
      mixed_currency: false,
    });

    // Refunded or disputed subscription contributes $0 LTV and $0 MRR (never inflated).
    const refunded = computeMemberRevenueSummary({
      membership: {
        state: "payment_hold",
        createdAt: nowMs - 40 * DAY_MS,
        revokedAt: nowMs - 10 * DAY_MS,
        revokedReason: "subscription_refunded",
      },
      subscriptions: [
        {
          status: "ended",
          pricePoint: { amountBaseUnits: 4900, currency: "usd", currencyDecimals: 2, billingPeriod: "monthly" },
          createdAt: nowMs - 40 * DAY_MS,
          currentPeriodStartAt: nowMs - 40 * DAY_MS,
          endedAt: nowMs - 10 * DAY_MS,
          riskAccessState: "revoked",
        },
      ],
      nowMs,
    });
    expect(refunded.realized_ltv_base_units).toBe(0);
    expect(refunded.active_mrr_base_units).toBe(0);

    // Stage MRR aggregates cleanly and guards mixed currencies.
    const agg = aggregateStageMrr([
      { stage_key: "new", active_mrr_base_units: 4900, mrr_currency: "USD", mrr_currency_decimals: 2 },
      { stage_key: "new", active_mrr_base_units: 9900, mrr_currency: "USD", mrr_currency_decimals: 2 },
      { stage_key: "active", active_mrr_base_units: 10000, mrr_currency: "USD", mrr_currency_decimals: 2 },
    ]);
    expect(agg.byStage.new).toMatchObject({ mrr_base_units: 14800, currency: "USD", paid_count: 2 });
    expect(agg.total).toMatchObject({ mrr_base_units: 24800, currency: "USD", paid_count: 3 });

    const mixed = aggregateStageMrr([
      { stage_key: "new", active_mrr_base_units: 4900, mrr_currency: "USD", mrr_currency_decimals: 2 },
      { stage_key: "new", active_mrr_base_units: 4900, mrr_currency: "EUR", mrr_currency_decimals: 2 },
    ]);
    expect(mixed.byStage.new?.mixed_currency).toBe(true);
    expect(mixed.byStage.new?.mrr_base_units).toBe(0);
  });

  test("verified saved revenue strictly requires at-risk check-in -> re-engagement -> paid renewal", () => {
    const nowMs = Date.UTC(2026, 10, 27, 12, 0);
    const sentAt = nowMs - 20 * DAY_MS;

    // Missing re-engagement -> NOT saved.
    expect(
      evaluateVerifiedSavedMember({
        earliestAtRiskSentAtMs: sentAt,
        latestActivityAtMs: sentAt - DAY_MS,
        subscription: {
          status: "active",
          currentPeriodStartAt: nowMs - 5 * DAY_MS,
          activeMrrBaseUnits: 4900,
          currency: "USD",
          currencyDecimals: 2,
        },
      }),
    ).toEqual({ saved: false });

    // Re-engaged, but renewal hasn't happened after check-in yet -> NOT saved.
    expect(
      evaluateVerifiedSavedMember({
        earliestAtRiskSentAtMs: sentAt,
        latestActivityAtMs: nowMs - 10 * DAY_MS,
        subscription: {
          status: "active",
          currentPeriodStartAt: sentAt - 5 * DAY_MS,
          activeMrrBaseUnits: 4900,
          currency: "USD",
          currencyDecimals: 2,
        },
      }),
    ).toEqual({ saved: false });

    // Re-engaged AND renewed, but card is past_due -> NOT saved.
    expect(
      evaluateVerifiedSavedMember({
        earliestAtRiskSentAtMs: sentAt,
        latestActivityAtMs: nowMs - 10 * DAY_MS,
        subscription: {
          status: "past_due",
          currentPeriodStartAt: nowMs - 5 * DAY_MS,
          activeMrrBaseUnits: 4900,
          currency: "USD",
          currencyDecimals: 2,
        },
      }),
    ).toEqual({ saved: false });

    // All 3 proofs satisfied -> VERIFIED SAVE!
    expect(
      evaluateVerifiedSavedMember({
        earliestAtRiskSentAtMs: sentAt,
        latestActivityAtMs: nowMs - 10 * DAY_MS,
        subscription: {
          status: "active",
          currentPeriodStartAt: nowMs - 5 * DAY_MS,
          activeMrrBaseUnits: 4900,
          currency: "USD",
          currencyDecimals: 2,
        },
      }),
    ).toEqual({
      saved: true,
      saved_mrr_base_units: 4900,
      verified_at: new Date(nowMs - 5 * DAY_MS).toISOString(),
      currency: "USD",
      currency_decimals: 2,
    });
  });

  test("Member Board stage MRR, Member Record LTV + attribution + verified save, and Chief of Staff 90d saved revenue work end-to-end", async () => {
    const t = convexTest(schema, modules);
    const nowMs = Date.now();

    const fx = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", {
        authSubject: "owner-ltv",
        displayName: "Neil",
        handle: "neil_ltv",
        normalizedHandle: "neil_ltv",
        email: "neil-ltv@example.com",
        normalizedEmail: "neil-ltv@example.com",
        emailVerifiedAt: nowMs - 120 * DAY_MS,
        createdAt: nowMs - 120 * DAY_MS,
        updatedAt: nowMs - 120 * DAY_MS,
      });
      const mayaId = await ctx.db.insert("users", {
        authSubject: "maya-ltv",
        displayName: "Maya",
        handle: "maya_ltv",
        normalizedHandle: "maya_ltv",
        email: "maya-ltv@example.com",
        normalizedEmail: "maya-ltv@example.com",
        emailVerifiedAt: nowMs - 100 * DAY_MS,
        createdAt: nowMs - 100 * DAY_MS,
        updatedAt: nowMs - 100 * DAY_MS,
      });
      const communityId = await ctx.db.insert("communities", {
        ownerId,
        slug: "ltv-club",
        name: "LTV Club",
        lifecycleStatus: "active",
        lifecycleGeneration: 0,
        visibility: "published",
        inferenceFundingPolicy: "managed_required",
        entryPolicy: "open",
        activeMemberCount: 2,
        createdAt: nowMs - 120 * DAY_MS,
        updatedAt: nowMs - 120 * DAY_MS,
      } as any);
      const pricePointId = await ctx.db.insert("communityPricePoints", {
        communityId,
        billingPeriod: "monthly",
        name: "Pro",
        amountBaseUnits: 4900,
        currency: "usd",
        currencyDecimals: 2,
        isCurrent: true,
        createdAt: nowMs - 120 * DAY_MS,
        updatedAt: nowMs - 120 * DAY_MS,
      } as any);
      const membershipId = await ctx.db.insert("communityMemberships", {
        communityId,
        userId: mayaId,
        role: "member",
        accessSource: "paid_subscription",
        pricePointId,
        state: "active",
        activatedAt: nowMs - 95 * DAY_MS,
        createdAt: nowMs - 95 * DAY_MS,
        updatedAt: nowMs - 5 * DAY_MS,
      } as any);
      await ctx.db.insert("communitySubscriptions", {
        communityId,
        userId: mayaId,
        membershipId,
        pricePointId,
        source: "stripe",
        status: "active",
        providerSubscriptionId: "sub_maya_1",
        providerAccountId: "acct_1",
        currentPeriodStartAt: nowMs - 4 * DAY_MS,
        currentPeriodEndAt: nowMs + 26 * DAY_MS,
        cancelAtPeriodEnd: false,
        createdAt: nowMs - 95 * DAY_MS,
        updatedAt: nowMs - 4 * DAY_MS,
      });
      // Chief of Staff sent a quiet_member rescue 18 days ago; Maya returned in the connected app 12 days ago
      // and renewed her Stripe subscription 4 days ago -> Verified Save!
      await ctx.db.insert("communityMemberCoachDrafts", {
        communityId,
        memberUserId: mayaId,
        reason: "quiet_member",
        dedupeKey: "rescue-maya-1",
        signalSummary: "Quiet for 15 days",
        status: "sent",
        deliveryMode: "auto",
        sentAt: nowMs - 18 * DAY_MS,
        createdAt: nowMs - 18 * DAY_MS,
        updatedAt: nowMs - 18 * DAY_MS,
      });
      await ctx.db.insert("communityMemberJourneyCards", {
        communityId,
        userId: mayaId,
        stageKey: "active",
        lastAppActivityAt: nowMs - 12 * DAY_MS,
        completedMilestones: [
          {
            key: "launched_campaign",
            label: "Launched first campaign",
            completedAt: nowMs - 12 * DAY_MS,
            source: "app",
          },
        ],
        createdAt: nowMs - 90 * DAY_MS,
        updatedAt: nowMs - 12 * DAY_MS,
      });
      await ctx.db.insert("distributionAttributionDeliveries", {
        userId: mayaId,
        deliveryKey: "de-deliv-1",
        sourceEventId: "evt-1",
        clickId: "clk_yt_123",
        status: "delivered",
        attemptCount: 1,
        createdAt: nowMs - 96 * DAY_MS,
        updatedAt: nowMs - 96 * DAY_MS,
      });
      return { communityId, membershipId };
    });

    const asOwner = t.withIdentity({ subject: "owner-ltv", email: "neil-ltv@example.com" });

    // 1. Member Board exposes stage MRR, total MRR, and completed_milestones.
    const board = await asOwner.query(api.communityMemberJourney.getCommunityMemberJourneyBoard, {
      communityId: fx.communityId,
    });
    expect(board.stage_mrr.active).toMatchObject({ mrr_base_units: 4900, currency: "USD", paid_count: 1 });
    expect(board.total_mrr).toMatchObject({ mrr_base_units: 4900, currency: "USD", paid_count: 1 });
    const mayaCard = board.cards.find((c) => c.name === "Maya");
    expect(mayaCard?.active_mrr_base_units).toBe(4900);
    expect(mayaCard?.completed_milestones).toMatchObject([
      { key: "launched_campaign", label: "Launched first campaign", source: "app" },
    ]);

    // 2. Member Record exposes realized LTV, months retained, attribution origin, coach events, and verified save.
    const record = await asOwner.query(api.communityMemberRecords.getCommunityMemberRecord, {
      communityId: fx.communityId,
      membershipId: fx.membershipId,
    });
    expect(record?.revenue).toMatchObject({
      active_mrr_base_units: 4900,
      realized_ltv_base_units: 4 * 4900,
      months_retained: 3,
      currency: "USD",
    });
    expect(record?.verified_save).toMatchObject({
      saved: true,
      saved_mrr_base_units: 4900,
      currency: "USD",
    });
    expect(record?.attribution).toMatchObject({
      source_label: "Distribution Engineer",
      click_id: "clk_yt_123",
    });
    expect(record?.coach_events).toHaveLength(1);
    expect(record?.coach_events?.[0]?.replied).toBe(true);

    // 3. Chief of Staff Settings impact reflects 30d app re-engagement AND 90d verified saved revenue.
    const settings = await asOwner.query(api.communityMemberCoach.getMemberCoachSettings, {
      authSubject: "owner-ltv",
      communityId: fx.communityId,
    });
    expect(settings.impact).toMatchObject({
      reengaged_30d: 1,
      contacted_30d: 1,
      verified_saved_members_90d: 1,
      verified_saved_mrr_base_units_90d: 4900,
      verified_saved_currency: "USD",
      verified_saved_mixed_currency: false,
    });
  });
});
