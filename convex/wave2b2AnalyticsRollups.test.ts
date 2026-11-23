/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";
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
    await t.mutation(internal.communityAnalyticsRollups.backfillCommunityDailyAnalyticsBatchInternal, {
      communityId: w.communityId,
      phase: "revenue",
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

  it("fences live increments during backfill, preserves opening MRR across windows, and invalidates billing on app-grant updates", async () => {
    vi.useFakeTimers();
    const baseMs = new Date("2026-11-21T12:00:00.000Z").getTime();
    vi.setSystemTime(baseMs);
    try {
      const t = convexTest(schema, modules);
      const w = await seedWorld(t, baseMs);
      const asOwner = t.withIdentity({ subject: "w2b2-owner" });

      // Seed a historical visit and a subscription created 45 days ago (outside 30d window).
      await t.run(async (ctx) => {
        await ctx.db.patch(w.communityId, { createdAt: baseMs - 60 * DAY });
        await ctx.db.insert("communityAnalyticsEvents", {
          communityId: w.communityId,
          eventType: "funnel_visit",
          visitorKey: "hist-visit-1",
          createdAt: baseMs - 5 * DAY,
        });
        const paid = await activateCommunityMembershipCore({
          ctx,
          communityId: w.communityId,
          userId: w.paidMemberId,
          accessSource: "paid_subscription",
          pricePointId: w.pricePointId,
          activationReason: "paid_checkout",
          nowMs: baseMs - 45 * DAY,
        });
        await ctx.db.patch(paid.membership._id, { createdAt: baseMs - 45 * DAY });
        await ctx.db.insert("communitySubscriptions", {
          communityId: w.communityId,
          userId: w.paidMemberId,
          membershipId: paid.membership._id,
          pricePointId: w.pricePointId,
          status: "active",
          cancelAtPeriodEnd: false,
          createdAt: baseMs - 45 * DAY,
          updatedAt: baseMs - 45 * DAY,
        });
        // Give freeMemberId an active free membership + verified email for app-grant test.
        await ctx.db.patch(w.freeMemberId, {
          email: "freepat@example.com",
          normalizedEmail: "freepat@example.com",
          emailVerifiedAt: baseMs - 10 * DAY,
        });
        await activateCommunityMembershipCore({
          ctx,
          communityId: w.communityId,
          userId: w.freeMemberId,
          accessSource: "free_grant",
          activationReason: "open_join",
          nowMs: baseMs - 10 * DAY,
        });
      });

      // Start backfill: clear establishes cutoffMs = baseMs and queues visits phase.
      await t.mutation(internal.communityAnalyticsRollups.backfillCommunityDailyAnalyticsBatchInternal, {
        communityId: w.communityId,
        phase: "clear",
        cursor: null,
      });

      // Advance wall clock past cutoffMs WITHOUT running queued backfill phases yet,
      // and fire a live visit mid-backfill.
      vi.setSystemTime(baseMs + 5_000);
      await t.mutation(api.communityLanding.recordCommunityLandingVisit, {
        communitySlug: "w2b2-growth",
        visitorKey: "mid_backfill_live_visit_0001",
      });

      // Drain the full scheduled backfill chain (visits -> join_starts -> members -> revenue -> billing recompute).
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());

      const snap30: any = await asOwner.query(api.communityAdmin.getCommunityAnalyticsSnapshot, {
        communityId: w.communityId,
        range: "30d",
      });
      // 1 historical visit + 1 live mid-backfill visit = 2 (no double-count!).
      expect(snap30.summary.page_visits_window).toBe(2);
      // Opening MRR from 45 days ago is preserved from bucket 0 through the final bucket.
      expect(snap30.series.revenue.length).toBeGreaterThan(5);
      expect(snap30.series.revenue[0].value).toBe(4900);
      expect(snap30.series.revenue[snap30.series.revenue.length - 1].value).toBe(4900);

      // Already-active free member buys a connected-app plan -> billing summary must be marked stale.
      await t.mutation(internal.communityAppSales.recordAppSaleInternal, {
        appId: "app-test-1",
        communityId: w.communityId,
        email: "freepat@example.com",
        active: true,
        tierKey: "member",
      });
      const staleAfterGrant = await t.run(async (ctx) =>
        ctx.db
          .query("communityBillingSummary")
          .withIndex("by_community", (q) => q.eq("communityId", w.communityId))
          .first(),
      );
      expect(typeof staleAfterGrant?.staleAt).toBe("number");

      // Recompute summary cleanly, then revoke the app grant while free_grant still keeps member active.
      vi.setSystemTime(baseMs + 10_000);
      await t.mutation(internal.communityAnalyticsRollups.recomputeCommunityBillingSummaryInternal, {
        communityId: w.communityId,
        startedAt: baseMs + 10_000,
      });
      await t.mutation(internal.communityAppSales.recordAppSaleInternal, {
        appId: "app-test-1",
        communityId: w.communityId,
        email: "freepat@example.com",
        active: false,
        tierKey: "member",
      });
      const staleAfterRevoke = await t.run(async (ctx) =>
        ctx.db
          .query("communityBillingSummary")
          .withIndex("by_community", (q) => q.eq("communityId", w.communityId))
          .first(),
      );
      expect(typeof staleAfterRevoke?.staleAt).toBe("number");
    } finally {
      vi.useRealTimers();
    }
  });

  it("seeds a clean communityBillingSummary on createCommunity so new communities use rollups immediately", async () => {
    const t = convexTest(schema, modules);
    const nowMs = Date.now();
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        authSubject: "w2b2-new-owner",
        displayName: "New Founder",
        handle: "newfounder",
        normalizedHandle: "newfounder",
        createdAt: nowMs - DAY,
        updatedAt: nowMs - DAY,
      });
      await ctx.db.insert("userProfileDetails", {
        userId,
        displayName: "New Founder",
        avatarUrl: "https://example.com/founder.png",
        createdAt: nowMs - DAY,
        updatedAt: nowMs - DAY,
      });
      for (const document of PLATFORM_LEGAL_DOCUMENTS) {
        await ctx.db.insert("legalAcceptances", {
          userId,
          documentKey: document.key,
          documentVersion: document.version,
          acceptedAt: nowMs - DAY,
          source: "test",
          createdAt: nowMs - DAY,
        });
      }
    });
    const asNewOwner = t.withIdentity({ subject: "w2b2-new-owner" });
    const created: any = await asNewOwner.mutation(api.communityLifecycle.createCommunity, {
      name: "Fresh Rollup Club",
      slug: "fresh-rollup-club",
    });
    const summary = await t.run(async (ctx) =>
      ctx.db
        .query("communityBillingSummary")
        .withIndex("by_community", (q) => q.eq("communityId", created.id))
        .first(),
    );
    expect(summary).not.toBeNull();
    expect(summary?.staleAt).toBeUndefined();
    expect(summary?.mrrBaseUnits).toBe(0);
  });
});
