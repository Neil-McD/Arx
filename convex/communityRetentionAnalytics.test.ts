/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  MIN_LIFT_SAMPLE_SIZE,
  computeCommunityRetentionAnalytics,
  medianNumber,
  type RetentionMemberInput,
} from "../shared/retentionAnalytics";
import type { MemberRevenueSummary } from "../shared/memberRevenueLedger";

const DAY_MS = 24 * 60 * 60_000;
const NOW = 1_780_000_000_000;

const modules = import.meta.glob([
  "./communityRetentionAnalytics.ts",
  "./communityMemberJourney.ts",
  "./authActor.ts",
  "./_generated/**/*.*s",
]);

function makeRevenue(overrides: Partial<MemberRevenueSummary> = {}): MemberRevenueSummary {
  return {
    active_mrr_base_units: 0,
    realized_ltv_base_units: 0,
    billing_cycles_paid: 0,
    months_retained: 1,
    tenure_days: 35,
    currency: null,
    currency_decimals: 2,
    mixed_currency: false,
    ...overrides,
  };
}

function makeMember(
  id: string,
  overrides: Partial<RetentionMemberInput> = {},
): RetentionMemberInput {
  return {
    userId: id,
    joinedAtMs: NOW - 20 * DAY_MS,
    isActive: true,
    source: "direct",
    postsCount: 0,
    firstPostAtMs: null,
    lessonsDoneCount: 0,
    firstLessonAtMs: null,
    hasSharedGoal: false,
    firstGoalAtMs: null,
    lastAppActivityAtMs: null,
    completedMilestones: [],
    revenue: makeRevenue(),
    verifiedSave30d: { saved: false },
    verifiedSave90d: { saved: false },
    ...overrides,
  };
}

describe("Slice 4A: pure Retention & LTV Analytics engine", () => {
  it("computes median TTFV accurately for odd, even, and empty arrays", () => {
    expect(medianNumber([])).toBeNull();
    expect(medianNumber([3])).toBe(3);
    expect(medianNumber([10, 1, 4])).toBe(4);
    expect(medianNumber([1, 2, 4, 8])).toBe(3);
    expect(medianNumber([0.25, 1.75])).toBe(1);
  });

  it("computes activation, median TTFV, milestone retention lift with sample guardrails, source LTV, and verified saves", () => {
    const checkpoints = [
      { key: "exported_video", label: "Exported first video", kind: "custom" as const, stageName: "Getting started" },
      { key: "first_post", label: "Posted or replied once", kind: "first_post" as const, stageName: "New" },
    ];

    // 4 members completed exported_video (all 4 retained, high LTV);
    // 4 members did NOT complete exported_video (only 2 retained, lower LTV).
    // Expected lift = 100% / 50% = 2.0x!
    const members: RetentionMemberInput[] = [
      makeMember("m1", {
        joinedAtMs: NOW - 10 * DAY_MS,
        isActive: true,
        source: "distribution_engineer",
        completedMilestones: [{ key: "exported_video", completedAt: NOW - 9 * DAY_MS, source: "app" }],
        revenue: makeRevenue({ active_mrr_base_units: 9900, realized_ltv_base_units: 29700, currency: "USD", months_retained: 3 }),
        verifiedSave30d: { saved: true, saved_mrr_base_units: 9900, verified_at: new Date(NOW - DAY_MS).toISOString(), currency: "USD", currency_decimals: 2 },
        verifiedSave90d: { saved: true, saved_mrr_base_units: 9900, verified_at: new Date(NOW - DAY_MS).toISOString(), currency: "USD", currency_decimals: 2 },
      }),
      makeMember("m2", {
        joinedAtMs: NOW - 10 * DAY_MS,
        isActive: true,
        source: "distribution_engineer",
        completedMilestones: [{ key: "exported_video", completedAt: NOW - 7 * DAY_MS, source: "app" }],
        revenue: makeRevenue({ active_mrr_base_units: 9900, realized_ltv_base_units: 19800, currency: "USD", months_retained: 2 }),
      }),
      makeMember("m3", {
        joinedAtMs: NOW - 12 * DAY_MS,
        isActive: true,
        source: "direct",
        completedMilestones: [{ key: "exported_video", completedAt: NOW - 10 * DAY_MS, source: "app" }],
        revenue: makeRevenue({ active_mrr_base_units: 9900, realized_ltv_base_units: 19800, currency: "USD", months_retained: 2 }),
      }),
      makeMember("m4", {
        joinedAtMs: NOW - 15 * DAY_MS,
        isActive: true,
        source: "direct",
        completedMilestones: [{ key: "exported_video", completedAt: NOW - 11 * DAY_MS, source: "app" }],
        revenue: makeRevenue({ active_mrr_base_units: 9900, realized_ltv_base_units: 19800, currency: "USD", months_retained: 2 }),
      }),
      makeMember("m5", {
        joinedAtMs: NOW - 15 * DAY_MS,
        isActive: true,
        source: "direct",
        postsCount: 1,
        firstPostAtMs: NOW - 14 * DAY_MS,
        revenue: makeRevenue({ active_mrr_base_units: 9900, realized_ltv_base_units: 9900, currency: "USD", months_retained: 1 }),
      }),
      makeMember("m6", {
        joinedAtMs: NOW - 15 * DAY_MS,
        isActive: true,
        source: "direct",
        revenue: makeRevenue({ active_mrr_base_units: 9900, realized_ltv_base_units: 9900, currency: "USD", months_retained: 1 }),
      }),
      makeMember("m7", {
        joinedAtMs: NOW - 15 * DAY_MS,
        isActive: false,
        source: "direct",
        revenue: makeRevenue({ active_mrr_base_units: 0, realized_ltv_base_units: 9900, currency: "USD", months_retained: 1 }),
      }),
      makeMember("m8", {
        joinedAtMs: NOW - 15 * DAY_MS,
        isActive: false,
        source: "distribution_engineer",
        revenue: makeRevenue({ active_mrr_base_units: 0, realized_ltv_base_units: 9900, currency: "USD", months_retained: 1 }),
      }),
    ];

    const result = computeCommunityRetentionAnalytics({
      range: "30d",
      windowStartMs: NOW - 30 * DAY_MS,
      nowMs: NOW,
      checkpoints,
      members,
      hasPaidPlans: true,
      hasProactiveAgent: true,
    });

    // Activation: m1..m5 activated (5 of 8 = 62.5%), TTFV days = [1, 3, 2, 4, 1] -> median = 2
    expect(result.activation.cohort_members).toBe(8);
    expect(result.activation.activated_members).toBe(5);
    expect(result.activation.activation_rate).toBeCloseTo(5 / 8);
    expect(result.activation.median_ttfv_days).toBe(2);
    expect(result.activation.using_activity_fallback).toBe(false);

    // Milestone lift: exported_video has 4/4 (100%) vs 2/4 (50%) = 2.0x;
    // first_post only has 1 completed (< MIN_LIFT_SAMPLE_SIZE = 3) so lift MUST be null!
    expect(MIN_LIFT_SAMPLE_SIZE).toBe(3);
    const exportedRow = result.milestone_lift.find((r) => r.key === "exported_video")!;
    expect(exportedRow.completed_retention_rate).toBe(1);
    expect(exportedRow.not_completed_retention_rate).toBe(0.5);
    expect(exportedRow.retention_lift_multiple).toBe(2);
    expect(exportedRow.completed_avg_ltv_base_units).toBe(Math.round((29700 + 19800 * 3) / 4));
    expect(exportedRow.not_completed_avg_ltv_base_units).toBe(9900);

    const postRow = result.milestone_lift.find((r) => r.key === "first_post")!;
    expect(postRow.completed_count).toBe(1);
    expect(postRow.retention_lift_multiple).toBeNull();

    // Acquisition source: DE has 3 members (m1, m2, m8), 2 activated, 2 retained, avg LTV = (29700+19800+9900)/3 = 19800
    const deRow = result.by_source.find((s) => s.source === "distribution_engineer")!;
    const directRow = result.by_source.find((s) => s.source === "direct")!;
    expect(deRow.members).toBe(3);
    expect(deRow.activated_members).toBe(2);
    expect(deRow.retained_members).toBe(2);
    expect(deRow.avg_realized_ltv_base_units).toBe(19800);
    expect(directRow.members).toBe(5);
    expect(directRow.activated_members).toBe(3);

    // Saved revenue: 1 verified save ($99/mo) in 30d and 90d
    expect(result.saved_revenue.show).toBe(true);
    expect(result.saved_revenue.saved_members_30d).toBe(1);
    expect(result.saved_revenue.saved_mrr_30d_base_units).toBe(9900);
    expect(result.saved_revenue.saved_members_90d).toBe(1);
    expect(result.saved_revenue.saved_mrr_90d_base_units).toBe(9900);
  });

  it("falls back cleanly to activity when no checkpoints are configured and hides saved revenue on free communities", () => {
    const result = computeCommunityRetentionAnalytics({
      range: "30d",
      windowStartMs: NOW - 30 * DAY_MS,
      nowMs: NOW,
      checkpoints: [],
      members: [
        makeMember("f1", { joinedAtMs: NOW - 5 * DAY_MS, lastAppActivityAtMs: NOW - 3 * DAY_MS }),
        makeMember("f2", { joinedAtMs: NOW - 5 * DAY_MS }),
      ],
      hasPaidPlans: false,
      hasProactiveAgent: false,
    });

    expect(result.activation.using_activity_fallback).toBe(true);
    expect(result.activation.activated_members).toBe(1);
    expect(result.activation.median_ttfv_days).toBe(2);
    expect(result.saved_revenue.show).toBe(false);
    expect(result.milestone_lift).toEqual([]);
  });
});

describe("Slice 4A: getCommunityRetentionAnalytics Convex query", () => {
  it("enforces manager-only RBAC and computes live end-to-end retention, DE source LTV, and verified saves", async () => {
    const LIVE_NOW = Date.now();
    const t = convexTest(schema, modules);
    const fixture = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", {
        authSubject: "owner_ret",
        email: "owner@example.com",
        normalizedEmail: "owner@example.com",
        createdAt: LIVE_NOW - 60 * DAY_MS,
        updatedAt: LIVE_NOW - 60 * DAY_MS,
      });
      const memberA = await ctx.db.insert("users", {
        authSubject: "member_a",
        email: "a@example.com",
        normalizedEmail: "a@example.com",
        createdAt: LIVE_NOW - 45 * DAY_MS,
        updatedAt: LIVE_NOW - 45 * DAY_MS,
      });
      const memberB = await ctx.db.insert("users", {
        authSubject: "member_b",
        email: "b@example.com",
        normalizedEmail: "b@example.com",
        createdAt: LIVE_NOW - 15 * DAY_MS,
        updatedAt: LIVE_NOW - 15 * DAY_MS,
      });
      const communityId = await ctx.db.insert("communities", {
        ownerId,
        slug: "retention-club",
        name: "Retention Club",
        visibility: "published",
        entryPolicy: "paid_subscription",
        inferenceFundingPolicy: "managed_required",
        createdAt: LIVE_NOW - 60 * DAY_MS,
        updatedAt: LIVE_NOW - 60 * DAY_MS,
      });
      const pricePointId = await ctx.db.insert("communityPricePoints", {
        communityId,
        billingPeriod: "monthly",
        name: "Monthly",
        amountBaseUnits: 5000,
        currency: "USD",
        currencyDecimals: 2,
        isCurrent: true,
        createdAt: LIVE_NOW - 60 * DAY_MS,
        updatedAt: LIVE_NOW - 60 * DAY_MS,
      });
      await ctx.db.insert("communityJourneyConfig", {
        communityId,
        stages: [
          {
            key: "start",
            name: "Getting started",
            goal: "Launch first campaign",
            position: 0,
            checkpoints: [{ key: "launched_campaign", label: "Launched campaign", kind: "custom" }],
          },
          {
            key: "active",
            name: "Active",
            goal: "Growing steadily",
            position: 1,
            checkpoints: [],
          },
        ],
        updatedByUserId: ownerId,
        createdAt: LIVE_NOW - 60 * DAY_MS,
        updatedAt: LIVE_NOW - 60 * DAY_MS,
      });

      // Member A: DE-attributed, completed app milestone 2 days after joining,
      // received at-risk check-in 10d ago, re-engaged in app 5d ago, renewed 2d ago -> verified save!
      const memAId = await ctx.db.insert("communityMemberships", {
        communityId,
        userId: memberA,
        role: "member",
        accessSource: "paid_subscription",
        pricePointId,
        state: "active",
        attributionClickId: "883c5850-e04d-4c60-9869-024102985541",
        attributedAt: LIVE_NOW - 40 * DAY_MS,
        activatedAt: LIVE_NOW - 40 * DAY_MS,
        createdAt: LIVE_NOW - 40 * DAY_MS,
        updatedAt: LIVE_NOW - 2 * DAY_MS,
      });
      await ctx.db.insert("communityMemberJourneyCards", {
        communityId,
        userId: memberA,
        stageKey: "active",
        completedMilestones: [
          { key: "launched_campaign", label: "Launched campaign", completedAt: LIVE_NOW - 38 * DAY_MS, source: "app" },
        ],
        lastAppActivityAt: LIVE_NOW - 5 * DAY_MS,
        createdAt: LIVE_NOW - 40 * DAY_MS,
        updatedAt: LIVE_NOW - 5 * DAY_MS,
      });
      await ctx.db.insert("communitySubscriptions", {
        communityId,
        membershipId: memAId,
        userId: memberA,
        pricePointId,
        source: "stripe",
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodStartAt: LIVE_NOW - 2 * DAY_MS,
        currentPeriodEndAt: LIVE_NOW + 28 * DAY_MS,
        createdAt: LIVE_NOW - 40 * DAY_MS,
        updatedAt: LIVE_NOW - 2 * DAY_MS,
      });
      await ctx.db.insert("communityMemberCoachDrafts", {
        communityId,
        memberUserId: memberA,
        reason: "quiet_member",
        status: "sent",
        signalSummary: "Quiet for 10 days",
        sentText: "Checking in on your campaign!",
        dedupeKey: "quiet_member:a:1",
        sentAt: LIVE_NOW - 10 * DAY_MS,
        createdAt: LIVE_NOW - 10 * DAY_MS,
        updatedAt: LIVE_NOW - 10 * DAY_MS,
      });

      // Member B: direct/organic, not activated yet, lapsed.
      await ctx.db.insert("communityMemberships", {
        communityId,
        userId: memberB,
        role: "member",
        accessSource: "paid_subscription",
        pricePointId,
        state: "lapsed",
        activatedAt: LIVE_NOW - 15 * DAY_MS,
        revokedAt: LIVE_NOW - 3 * DAY_MS,
        createdAt: LIVE_NOW - 15 * DAY_MS,
        updatedAt: LIVE_NOW - 3 * DAY_MS,
      });

      return { communityId };
    });

    const apiRefs = api as any;
    // Regular member is denied access to Analytics.
    const asMember = t.withIdentity({ subject: "member_a" });
    await expect(
      asMember.query(apiRefs.communityRetentionAnalytics.getCommunityRetentionAnalytics, {
        authSubject: "member_a",
        communityId: fixture.communityId,
        range: "all",
      }),
    ).rejects.toThrow(/manager|owner|admin|forbidden/i);

    // Owner receives accurate retention, DE source comparison, and verified saved MRR.
    const asOwner = t.withIdentity({ subject: "owner_ret" });
    const analytics = await asOwner.query(
      apiRefs.communityRetentionAnalytics.getCommunityRetentionAnalytics,
      {
        authSubject: "owner_ret",
        communityId: fixture.communityId,
        range: "all",
      },
    );

    expect(analytics.sampled_members).toBe(2);
    expect(analytics.activation.cohort_members).toBe(2);
    expect(analytics.activation.activated_members).toBe(1);
    expect(analytics.activation.median_ttfv_days).toBe(2);

    const deSource = analytics.by_source.find((s: any) => s.source === "distribution_engineer")!;
    const directSource = analytics.by_source.find((s: any) => s.source === "direct")!;
    expect(deSource.members).toBe(1);
    expect(deSource.activated_members).toBe(1);
    expect(deSource.retained_members).toBe(1);
    expect(deSource.avg_realized_ltv_base_units).toBeGreaterThanOrEqual(5000);
    expect(directSource.members).toBe(1);
    expect(directSource.retained_members).toBe(0);

    expect(analytics.saved_revenue.show).toBe(true);
    expect(analytics.saved_revenue.saved_members_30d).toBe(1);
    expect(analytics.saved_revenue.saved_mrr_30d_base_units).toBe(5000);
  });
});
