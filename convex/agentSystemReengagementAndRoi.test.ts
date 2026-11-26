/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  countReengagedMembersFromSentChecks,
  formatAiCredits,
  formatMicrosUsd,
  microsToAiCredits,
  summarizeCommunityAiSpend,
} from "../shared/agentRoiSummary";

const modules = import.meta.glob([
  "./*.ts",
  "!./*.test.ts",
  "./_generated/**/*.*s",
]);

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

describe("zero-AI system re-engagement & founder spend/win-back visibility (Slice 4)", () => {
  test("summarizes monthly AI spend by surface, excludes failed receipts, and counts post-checkin win-backs", () => {
    const spend = summarizeCommunityAiSpend({
      allowanceMicros: 20_000_000,
      receipts: [
        { surface: "member_agent_dock", status: "settled", settledCostMicros: 1_500_000 },
        { surface: "community_agent_mention", status: "settled", settledCostMicros: 500_000 },
        { surface: "community_autonomous_cognition", status: "settled", settledCostMicros: 750_000 },
        { surface: "community_founder_brief", status: "settled", settledCostMicros: 250_000 },
        { surface: "member_agent_dock", status: "failed", settledCostMicros: 9_999_999 },
      ],
    });

    expect(spend).toMatchObject({
      liveChatMicros: 2_000_000,
      proactiveMicros: 750_000,
      briefMicros: 250_000,
      totalMicros: 3_000_000,
      allowanceMicros: 20_000_000,
      percentUsed: 15,
      receiptCount: 4,
      truncated: false,
    });
    expect(formatMicrosUsd(0)).toBe("$0.00");
    expect(formatMicrosUsd(2_500)).toBe("<$0.01");
    expect(formatMicrosUsd(3_000_000)).toBe("$3.00");
    expect(microsToAiCredits(0)).toBe(0);
    expect(microsToAiCredits(400)).toBe(1);
    expect(microsToAiCredits(3_000_000)).toBe(3_000);
    expect(microsToAiCredits(20_000_000)).toBe(20_000);
    expect(formatAiCredits(0)).toBe("0 credits");
    expect(formatAiCredits(400)).toBe("1 credit");
    expect(formatAiCredits(3_000_000)).toBe("3,000 credits");
    expect(formatAiCredits(20_000_000, { unit: false })).toBe("20,000");

    const winBacks = countReengagedMembersFromSentChecks({
      sentChecks: [
        { memberUserId: "m1", sentAt: 1_000 },
        { memberUserId: "m1", sentAt: 2_000 },
        { memberUserId: "m2", sentAt: 1_500 },
        { memberUserId: "m3", sentAt: 1_500 },
      ],
      latestActivityByMember: new Map([
        ["m1", 1_800], // returned after earliest check-in -> counts!
        ["m2", 1_000], // activity was BEFORE check-in -> does not count
        ["m3", null],  // never returned
      ]),
    });
    expect(winBacks).toEqual({ contactedCount: 3, reengagedCount: 1 });
  });

  test("founder weekly digest toggle gates digest worker and settings view returns live monthly spend & 30d win-backs", async () => {
    const t = convexTest(schema, modules);
    const nowMs = Date.now();

    const fx = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", {
        authSubject: "owner-roi",
        displayName: "Founder",
        email: "founder@example.com",
        emailVerifiedAt: nowMs - 30 * DAY_MS,
        createdAt: nowMs - 30 * DAY_MS,
        updatedAt: nowMs - 30 * DAY_MS,
      });
      const returnedMemberId = await ctx.db.insert("users", {
        authSubject: "returned-roi",
        displayName: "Returned Member",
        email: "returned@example.com",
        emailVerifiedAt: nowMs - 20 * DAY_MS,
        createdAt: nowMs - 20 * DAY_MS,
        updatedAt: nowMs - 20 * DAY_MS,
      });
      const quietMemberId = await ctx.db.insert("users", {
        authSubject: "quiet-roi",
        displayName: "Quiet Member",
        email: "quiet@example.com",
        emailVerifiedAt: nowMs - 20 * DAY_MS,
        createdAt: nowMs - 20 * DAY_MS,
        updatedAt: nowMs - 20 * DAY_MS,
      });
      const communityId = await ctx.db.insert("communities", {
        ownerId,
        slug: "roi-club",
        name: "ROI Club",
        visibility: "published",
        entryPolicy: "open",
        inferenceFundingPolicy: "managed_required",
        createdAt: nowMs - 30 * DAY_MS,
        updatedAt: nowMs - 30 * DAY_MS,
      });
      const channelId = await ctx.db.insert("communityChannels", {
        communityId,
        systemRole: "general",
        slug: "general",
        name: "General",
        accessMode: "all_members",
        postingPolicy: "members",
        status: "active",
        position: 0,
        createdAt: nowMs - 30 * DAY_MS,
        updatedAt: nowMs - 30 * DAY_MS,
      });
      await ctx.db.insert("communityMemberships", {
        communityId,
        userId: returnedMemberId,
        role: "member",
        accessSource: "free_grant",
        state: "active",
        createdAt: nowMs - 20 * DAY_MS,
        updatedAt: nowMs - 20 * DAY_MS,
      });
      await ctx.db.insert("communityMemberships", {
        communityId,
        userId: quietMemberId,
        role: "member",
        accessSource: "free_grant",
        state: "active",
        createdAt: nowMs - 20 * DAY_MS,
        updatedAt: nowMs - 20 * DAY_MS,
      });

      // Two members got a proactive check-in 5 days ago; one returned and posted 2 days ago.
      await ctx.db.insert("communityMemberCoachDrafts", {
        communityId,
        memberUserId: returnedMemberId,
        reason: "course_stall",
        dedupeKey: "winback-1",
        signalSummary: "Paused on course",
        status: "sent",
        deliveryMode: "auto",
        sentAt: nowMs - 5 * DAY_MS,
        createdAt: nowMs - 5 * DAY_MS,
        updatedAt: nowMs - 5 * DAY_MS,
      });
      await ctx.db.insert("communityMemberCoachDrafts", {
        communityId,
        memberUserId: quietMemberId,
        reason: "quiet_newcomer",
        dedupeKey: "winback-2",
        signalSummary: "Joined 3 days ago",
        status: "sent",
        deliveryMode: "auto",
        sentAt: nowMs - 5 * DAY_MS,
        createdAt: nowMs - 5 * DAY_MS,
        updatedAt: nowMs - 5 * DAY_MS,
      });
      await ctx.db.insert("communityInteractionRoots", {
        communityId,
        channelId,
        actorType: "human",
        actorUserId: returnedMemberId,
        kind: "discussion",
        visibilityScope: "community",
        status: "live",
        contentSummary: "Back in the community and shipping!",
        replyCount: 0,
        reactionSummary: [],
        idempotencyKey: "roi-post-1",
        createdAt: nowMs - 2 * DAY_MS,
        updatedAt: nowMs - 2 * DAY_MS,
      });

      // Seed current-month inference receipts across surfaces.
      const receiptBase = {
        communityId,
        actorUserId: returnedMemberId,
        payerUserId: ownerId,
        fundingMode: "platform_operator_grant" as const,
        provider: "openai" as const,
        modelId: "gpt-6-luna",
        claimToken: "claim",
        leaseExpiresAt: nowMs + HOUR_MS,
        authorizedAt: nowMs - HOUR_MS,
        createdAt: nowMs - HOUR_MS,
        updatedAt: nowMs - HOUR_MS,
      };
      await ctx.db.insert("communityInferenceReceipts", {
        ...receiptBase,
        receiptKey: "r-live",
        sourceRunId: "run-1",
        surface: "member_agent_dock",
        status: "settled",
        settledCostMicros: 1_200_000,
      });
      await ctx.db.insert("communityInferenceReceipts", {
        ...receiptBase,
        receiptKey: "r-proactive",
        sourceRunId: "run-2",
        surface: "community_autonomous_cognition",
        status: "settled",
        settledCostMicros: 400_000,
      });
      await ctx.db.insert("communityInferenceReceipts", {
        ...receiptBase,
        receiptKey: "r-brief",
        sourceRunId: "run-3",
        surface: "community_founder_brief",
        status: "settled",
        settledCostMicros: 200_000,
      });

      return { communityId };
    });

    const owner = t.withIdentity({ subject: "owner-roi", email: "founder@example.com" });

    // Default: weekly digest is enabled and impact summary reflects spend + 1/2 win-backs.
    const initial = await owner.query(api.communityMemberCoach.getMemberCoachSettings, {
      authSubject: "owner-roi",
      communityId: fx.communityId,
    });
    expect(initial.weekly_digest_enabled).toBe(true);
    expect(initial.impact).toMatchObject({
      total_micros: 1_800_000,
      live_chat_micros: 1_200_000,
      proactive_micros: 400_000,
      brief_micros: 200_000,
      allowance_micros: 20_000_000,
      percent_used: 9,
      reengaged_30d: 1,
      contacted_30d: 2,
      reengagement_truncated: false,
    });

    // When an open Stripe billing cycle exists, allowance & spend align to that active cycle.
    await t.run(async (ctx) => {
      const comm = await ctx.db.get(fx.communityId);
      const subId = await ctx.db.insert("founderSubscriptions", {
        ownerUserId: comm!.ownerId,
        communityId: fx.communityId,
        provider: "stripe",
        providerCustomerId: "cus_test",
        providerSubscriptionId: "sub_test",
        providerPriceId: "price_founder_79_monthly",
        status: "active",
        currentPeriodStartAt: nowMs - 10 * DAY_MS,
        currentPeriodEndAt: nowMs + 20 * DAY_MS,
        cancelAtPeriodEnd: false,
        lastProviderEventCreatedAt: nowMs,
        createdAt: nowMs - 10 * DAY_MS,
        updatedAt: nowMs - 10 * DAY_MS,
      });
      const cycleId = await ctx.db.insert("founderUsageCycles", {
        founderSubscriptionId: subId,
        communityId: fx.communityId,
        cycleKey: "cycle-active",
        cycleStartAt: nowMs - 10 * DAY_MS,
        cycleEndAt: nowMs + 20 * DAY_MS,
        includedCostMicros: 25_000_000,
        reservedCostMicros: 0,
        settledCostMicros: 5_000_000,
        pricingVersion: "v1",
        inputCostMicrosPerMillionTokens: 1_000_000,
        outputCostMicrosPerMillionTokens: 2_000_000,
        maxRunReservationCostMicros: 1_000_000,
        status: "open",
        createdAt: nowMs - 10 * DAY_MS,
        updatedAt: nowMs - 10 * DAY_MS,
      });
      await ctx.db.insert("communityInferenceReceipts", {
        communityId: fx.communityId,
        actorUserId: comm!.ownerId,
        payerUserId: comm!.ownerId,
        fundingMode: "platform_subscription",
        founderSubscriptionId: subId,
        usageCycleId: cycleId,
        receiptKey: "r-cycle-1",
        sourceRunId: "run-cycle-1",
        surface: "community_autonomous_cognition",
        provider: "openai",
        modelId: "gpt-6-luna",
        status: "settled",
        settledCostMicros: 5_000_000,
        claimToken: "claim",
        leaseExpiresAt: nowMs + HOUR_MS,
        authorizedAt: nowMs - HOUR_MS,
        createdAt: nowMs - HOUR_MS,
        updatedAt: nowMs - HOUR_MS,
      });
    });

    const cycleView = await owner.query(api.communityMemberCoach.getMemberCoachSettings, {
      authSubject: "owner-roi",
      communityId: fx.communityId,
    });
    expect(cycleView.impact).toMatchObject({
      total_micros: 5_000_000,
      proactive_micros: 5_000_000,
      live_chat_micros: 0,
      allowance_micros: 25_000_000,
      percent_used: 20,
    });

    // Turning weekly digest off suppresses weekly digest worker cleanly.
    const disabled = await owner.mutation(api.communityMemberCoach.setMemberCoachSettings, {
      authSubject: "owner-roi",
      communityId: fx.communityId,
      enabled: true,
      autoReasons: [],
      weeklyDigestEnabled: false,
    });
    expect(disabled.weekly_digest_enabled).toBe(false);

    const skippedPage = await t.query(internal.communityWeeklyDigestWorker.readCommunityWeeklyDigestPageInternal, {
      communityId: fx.communityId,
      communityLifecycleGeneration: 0,
      nowMs,
    });
    expect(skippedPage).toEqual({ status: "digest_disabled" });

    // Turning weekly digest back on creates/syncs the weekly schedule and returns "ready" with highlights!
    const reenabled = await owner.mutation(api.communityMemberCoach.setMemberCoachSettings, {
      authSubject: "owner-roi",
      communityId: fx.communityId,
      enabled: true,
      autoReasons: [],
      weeklyDigestEnabled: true,
    });
    expect(reenabled.weekly_digest_enabled).toBe(true);

    const readyPage = await t.query(internal.communityWeeklyDigestWorker.readCommunityWeeklyDigestPageInternal, {
      communityId: fx.communityId,
      communityLifecycleGeneration: 0,
      nowMs,
    });
    expect(readyPage.status).toBe("ready");
    const schedules = await t.run(async (ctx) => await ctx.db.query("communityWeeklyDigestSchedules").collect());
    expect(schedules).toHaveLength(1);
    expect(schedules[0]?.status).toBe("scheduled");
  });

  test("wakes paused communities immediately on real activity, auto-enrolls older free communities for weekly digests, and uses exact operator-grant cycle totals", async () => {
    const t = convexTest(schema, modules);
    const nowMs = Date.now();
    const { utcMonthWindow } = await import("../shared/founderInference");
    const month = utcMonthWindow(nowMs);

    const fx = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", {
        authSubject: "owner-polish",
        displayName: "Owner",
        email: "owner-polish@example.com",
        emailVerifiedAt: nowMs - 30 * DAY_MS,
        createdAt: nowMs - 30 * DAY_MS,
        updatedAt: nowMs - 30 * DAY_MS,
      });
      const memberId = await ctx.db.insert("users", {
        authSubject: "member-polish",
        displayName: "Member",
        email: "member-polish@example.com",
        emailVerifiedAt: nowMs - 20 * DAY_MS,
        createdAt: nowMs - 20 * DAY_MS,
        updatedAt: nowMs - 20 * DAY_MS,
      });
      const freeCommunityId = await ctx.db.insert("communities", {
        ownerId,
        slug: "free-polish",
        name: "Free Polish",
        visibility: "published",
        entryPolicy: "open",
        inferenceFundingPolicy: "managed_required",
        createdAt: nowMs - 40 * DAY_MS,
        updatedAt: nowMs - 40 * DAY_MS,
      });
      await ctx.db.insert("communityMemberships", {
        communityId: freeCommunityId,
        userId: memberId,
        role: "member",
        accessSource: "free_grant",
        state: "active",
        createdAt: nowMs - 20 * DAY_MS,
        updatedAt: nowMs - 20 * DAY_MS,
      });
      const settingsId = await ctx.db.insert("communityMemberCoachSettings", {
        communityId: freeCommunityId,
        enabled: true,
        autoReasons: [],
        communityHeartbeatTier: "paused",
        nextScanAt: nowMs + 72 * HOUR_MS,
        createdAt: nowMs - 30 * DAY_MS,
        updatedAt: nowMs - 20 * DAY_MS,
      });
      // Seed authoritative operator-grant cycle ledger (e.g., $7.50 settled).
      await ctx.db.insert("operatorGrantUsageCycles", {
        communityId: freeCommunityId,
        cycleKey: `${String(freeCommunityId)}:${month.key}`,
        cycleStartAt: month.startAt,
        cycleEndAt: month.endAt,
        includedCostMicros: 20_000_000,
        reservedCostMicros: 0,
        settledCostMicros: 7_500_000,
        createdAt: month.startAt,
        updatedAt: nowMs,
      });
      const threadId = await ctx.db.insert("threads", {
        ownerId: memberId,
        title: "Guide",
        titleSource: "auto",
        communityId: String(freeCommunityId),
        createdAt: nowMs - 10 * DAY_MS,
        updatedAt: nowMs - 10 * DAY_MS,
      });
      return { freeCommunityId, settingsId, memberId, threadId };
    });

    // 1. Pre-existing free community auto-enrolls in $0-AI weekly digest without manual intervention.
    const enroll = await t.mutation(
      internal.communityWeeklyDigestSchedule.enrollActiveCommunitiesForWeeklyDigestPageInternal,
      { cursor: null, nowMs },
    );
    expect(enroll.enrolled).toBe(1);
    const schedules = await t.run(async (ctx) => await ctx.db.query("communityWeeklyDigestSchedules").collect());
    expect(schedules).toHaveLength(1);

    // 2. A member's private Guide message wakes the paused community immediately (0-hour lag, not 72h).
    const member = t.withIdentity({ subject: "member-polish", email: "member-polish@example.com" });
    await member.mutation(api.threads.addCloudThreadMessage, {
      threadId: fx.threadId,
      messageKey: "wake-msg-1",
      role: "user",
      contentJson: { text: "I'm back!" },
    });
    const wokeRow = await t.run(async (ctx) => await ctx.db.get(fx.settingsId));
    expect(wokeRow?.communityHeartbeatTier).toBe("active");
    expect((wokeRow?.nextScanAt ?? Infinity) <= Date.now() + 5_000).toBe(true);

    // 3. Operator-grant cycle uses exact authoritative settledCostMicros without truncation.
    const owner = t.withIdentity({ subject: "owner-polish", email: "owner-polish@example.com" });
    const settings = await owner.query(api.communityMemberCoach.getMemberCoachSettings, {
      authSubject: "owner-polish",
      communityId: fx.freeCommunityId,
    });
    expect(settings.impact).toMatchObject({
      total_micros: 7_500_000,
      allowance_micros: 20_000_000,
      percent_used: 38,
      spend_truncated: false,
    });
  });
});
