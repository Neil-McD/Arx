/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { recordCommunityJoinStarted } from "./communityFunnelEvents";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const DAY = 86_400_000;

async function seedWorld(t: any, nowMs: number) {
  return await t.run(async (ctx: any) => {
    const mkUser = (subject: string, name: string, handle: string) =>
      ctx.db.insert("users", {
        authSubject: subject,
        displayName: name,
        handle,
        normalizedHandle: handle,
        createdAt: nowMs - 20 * DAY,
        updatedAt: nowMs - 20 * DAY,
      });
    const ownerId = await mkUser("w2b2-owner", "Founder Maya", "foundermaya");
    const paidMemberId = await mkUser("w2b2-paid", "Paid Sam", "paidsam");
    const freeMemberId = await mkUser("w2b2-free", "Free Pat", "freepat");
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "w2b2-growth",
      name: "Wave 2B-2 Growth",
      lifecycleStatus: "active",
      lifecycleGeneration: 0,
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "paid_subscription",
      activeMemberCount: 1,
      createdAt: nowMs - 14 * DAY,
      updatedAt: nowMs,
    });
    const pricePointId = await ctx.db.insert("communityPricePoints", {
      communityId,
      billingPeriod: "monthly",
      name: "Pro",
      amountBaseUnits: 4900,
      currency: "usd",
      currencyDecimals: 2,
      isCurrent: true,
      createdAt: nowMs - 14 * DAY,
      updatedAt: nowMs - 14 * DAY,
    });
    await ctx.db.insert("communityTiers", {
      communityId,
      key: "member",
      name: "Pro",
      rank: 0,
      grants: [],
      createdAt: nowMs - 14 * DAY,
      updatedAt: nowMs - 14 * DAY,
    });
    return { ownerId, paidMemberId, freeMemberId, communityId, pricePointId };
  });
}

describe("Wave 2B-2 Community Analytics & Operator Dashboard rollups", () => {
  it("backfills daily analytics + billing summary and matches raw analytics snapshot across ranges", async () => {
    const t = convexTest(schema, modules);
    const nowMs = Date.now();
    const w = await seedWorld(t, nowMs);
    const asOwner = t.withIdentity({ subject: "w2b2-owner" });

    // Record visits, join starts, and member activations (one paid, one free).
    await t.mutation(api.communityLanding.recordCommunityLandingVisit, {
      communitySlug: "w2b2-growth",
      visitorKey: "visitor_key_alpha_0001",
    });
    await t.mutation(api.communityLanding.recordCommunityLandingVisit, {
      communitySlug: "w2b2-growth",
      visitorKey: "visitor_key_beta_0002",
    });
    await t.run(async (ctx) => {
      await recordCommunityJoinStarted(ctx, { communityId: w.communityId, userId: w.paidMemberId, nowMs });
      const paid = await activateCommunityMembershipCore({
        ctx,
        communityId: w.communityId,
        userId: w.paidMemberId,
        accessSource: "paid_subscription",
        pricePointId: w.pricePointId,
        activationReason: "paid_checkout",
        nowMs,
      });
      await ctx.db.insert("communitySubscriptions", {
        communityId: w.communityId,
        userId: w.paidMemberId,
        membershipId: paid.membership._id,
        pricePointId: w.pricePointId,
        status: "active",
        cancelAtPeriodEnd: false,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      await activateCommunityMembershipCore({
        ctx,
        communityId: w.communityId,
        userId: w.freeMemberId,
        accessSource: "free_grant",
        activationReason: "open_join",
        nowMs,
      });
    });

    // Live raw snapshot before backfill.
    const raw30: any = await asOwner.query(api.communityAdmin.getCommunityAnalyticsSnapshot, {
      communityId: w.communityId,
      range: "30d",
    });

    // Run backfill phases + billing recompute.
    await t.mutation(internal.communityAnalyticsRollups.backfillCommunityDailyAnalyticsBatchInternal, {
      communityId: w.communityId,
      phase: "clear",
      cursor: null,
    });
    await t.mutation(internal.communityAnalyticsRollups.backfillCommunityDailyAnalyticsBatchInternal, {
      communityId: w.communityId,
      phase: "visits",
      cursor: null,
    });
    await t.mutation(internal.communityAnalyticsRollups.backfillCommunityDailyAnalyticsBatchInternal, {
      communityId: w.communityId,
      phase: "join_starts",
      cursor: null,
    });
    await t.mutation(internal.communityAnalyticsRollups.backfillCommunityDailyAnalyticsBatchInternal, {
      communityId: w.communityId,
      phase: "members",
      cursor: null,
    });
    await t.mutation(internal.communityAnalyticsRollups.recomputeCommunityBillingSummaryInternal, {
      communityId: w.communityId,
      startedAt: nowMs,
    });

    const rolled30: any = await asOwner.query(api.communityAdmin.getCommunityAnalyticsSnapshot, {
      communityId: w.communityId,
      range: "30d",
    });

    expect(rolled30.summary.page_visits_window).toBe(raw30.summary.page_visits_window);
    expect(rolled30.summary.join_starts_window).toBe(raw30.summary.join_starts_window);
    expect(rolled30.summary.total_members).toBe(raw30.summary.total_members);
    expect(rolled30.summary.new_members_window).toBe(raw30.summary.new_members_window);
    expect(rolled30.summary.mrr_base_units).toBe(4900);
    expect(rolled30.summary.currency).toBe("USD");
    expect(rolled30.summary.plans).toEqual(raw30.summary.plans);

    // Subsequent incremental visit updates the rollup immediately without needing another backfill.
    await t.mutation(api.communityLanding.recordCommunityLandingVisit, {
      communitySlug: "w2b2-growth",
      visitorKey: "visitor_key_gamma_0003",
    });
    const afterVisit: any = await asOwner.query(api.communityAdmin.getCommunityAnalyticsSnapshot, {
      communityId: w.communityId,
      range: "7d",
    });
    expect(afterVisit.summary.page_visits_window).toBe(3);
  });

  it("refreshes platformOperatorSummary in paginated batches and serves O(1) operator overview totals", async () => {
    const t = convexTest(schema, modules);
    const nowMs = Date.now();
    const w = await seedWorld(t, nowMs);

    await t.run(async (ctx) => {
      const paid = await activateCommunityMembershipCore({
        ctx,
        communityId: w.communityId,
        userId: w.paidMemberId,
        accessSource: "paid_subscription",
        pricePointId: w.pricePointId,
        activationReason: "paid_checkout",
        nowMs,
      });
      await ctx.db.insert("communitySubscriptions", {
        communityId: w.communityId,
        userId: w.paidMemberId,
        membershipId: paid.membership._id,
        pricePointId: w.pricePointId,
        status: "active",
        cancelAtPeriodEnd: false,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    });

    await t.mutation(internal.communityAnalyticsRollups.recomputeCommunityBillingSummaryInternal, {
      communityId: w.communityId,
      startedAt: nowMs,
    });
    await t.mutation(internal.communityAnalyticsRollups.refreshPlatformOperatorSummaryBatchInternal, {
      phase: "communities",
      cursor: null,
    });
    await t.mutation(internal.communityAnalyticsRollups.refreshPlatformOperatorSummaryBatchInternal, {
      phase: "users",
      cursor: null,
      acc: {
        ownerIds: [String(w.ownerId)],
        communities: 1,
        activeCommunities: 1,
        totalCommunityMembers: 1,
        paidCommunities: 1,
        activePaidMembers: 1,
        estimatedMrr: { amountBaseUnits: 4900, currency: "usd", currencyDecimals: 2, mixedCurrency: false },
        setupRiskCommunities: 1,
        staleCommunities: 0,
        riskItems: 1,
        totalAccountUsers: 0,
      },
    });

    const overview: any = await t.query(internal.operatorIntelligence.getOperatorOverviewInternal, {
      range: "30d",
    });
    expect(overview.evidence.sourceTables).toContain("platformOperatorSummary");
    expect(overview.totals.communities).toBe(1);
    expect(overview.totals.activePaidMembers).toBe(1);
    expect(overview.totals.estimatedMrr).toMatchObject({ amountBaseUnits: 4900, currency: "usd" });

    // Monetization query stays bounded and passes cleanly.
    const monetization: any = await t.query(internal.operatorIntelligence.getOperatorMonetizationInternal, {
      range: "30d",
    });
    expect(monetization.activeCommunitySubscriptions).toBe(1);
    expect(monetization.estimatedCommunityMrr).toMatchObject({ amountBaseUnits: 4900, currency: "usd" });
  });
});
