/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  buildFounderAllowanceAlertCopy,
  formatAllowanceResetDate,
  resolveAllowanceAlertMilestone,
  shouldPauseBackgroundAiForAllowance,
} from "../shared/allowanceGuardrails";
import { renderEmailTemplate } from "./emailCore";

const modules = import.meta.glob([
  "./*.ts",
  "!./*.test.ts",
  "./_generated/**/*.*s",
]);

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
const NOW = Date.UTC(2026, 10, 24, 15, 0, 0);

describe("Monthly AI allowance guardrails & founder alerts (Slice 1)", () => {
  test("pure threshold helpers enforce exact 90% background reserve, 80%/100% milestones, reset dates, and email template rendering", () => {
    const allowance = 20_000_000; // $20.00
    expect(shouldPauseBackgroundAiForAllowance({ settledMicros: 17_999_999, allowanceMicros: allowance })).toBe(false);
    expect(shouldPauseBackgroundAiForAllowance({ settledMicros: 18_000_000, allowanceMicros: allowance })).toBe(true);

    // Exact thresholds prevent premature firing on 79.6% or 99.6%.
    expect(resolveAllowanceAlertMilestone({ settledMicros: 15_950_000, allowanceMicros: allowance })).toBeNull();
    expect(resolveAllowanceAlertMilestone({ settledMicros: 16_000_000, allowanceMicros: allowance })).toBe(80);
    expect(resolveAllowanceAlertMilestone({ settledMicros: 16_000_000, allowanceMicros: allowance, lastNotifiedPercent: 80 })).toBeNull();
    expect(resolveAllowanceAlertMilestone({ settledMicros: 19_950_000, allowanceMicros: allowance, lastNotifiedPercent: 80 })).toBeNull();
    expect(resolveAllowanceAlertMilestone({ settledMicros: 20_000_000, allowanceMicros: allowance, lastNotifiedPercent: 80 })).toBe(100);
    expect(resolveAllowanceAlertMilestone({ settledMicros: 20_000_000, allowanceMicros: allowance, lastNotifiedPercent: 100 })).toBeNull();
    // Burst jump straight from 0% to 100% fires 100 directly (not 80).
    expect(resolveAllowanceAlertMilestone({ settledMicros: 20_000_000, allowanceMicros: allowance, lastNotifiedPercent: 0 })).toBe(100);

    expect(formatAllowanceResetDate(Date.UTC(2026, 11, 1, 0, 0, 0))).toBe("Dec 1");

    const copy80 = buildFounderAllowanceAlertCopy({
      milestone: 80,
      communityName: "Founders Lab",
      settledMicros: 16_000_000,
      allowanceMicros: allowance,
      resetDateLabel: "Dec 1",
      reengaged30d: 4,
      contacted30d: 7,
    });
    expect(copy80.headline).toContain("80%");
    expect(copy80.bodyText).toContain("4 of 7 members");
    expect(copy80.bodyText).toContain("Dec 1");

    const rendered = renderEmailTemplate({
      templateKey: "founder_allowance_notice",
      payload: {
        communityName: "Founders Lab",
        subject: copy80.subject,
        headline: copy80.headline,
        bodyText: copy80.bodyText,
        actionUrl: "https://www.polynet.ai/c/founders-lab/settings?pane=agent",
      },
    });
    expect(rendered.subject).toContain("80%");
    expect(rendered.html).toContain("View allowance");
  });

  test("pauses background heartbeats & reply drafts at 90% while sending idempotent 80% and 100% founder alerts once per billing cycle", async () => {
    const t = convexTest(schema, modules);

    const fx = await t.run(async (ctx: any) => {
      const ownerId = await ctx.db.insert("users", {
        authSubject: "owner-ag",
        displayName: "Neil",
        email: "neil@example.com",
        emailVerifiedAt: NOW - 60 * DAY_MS,
        createdAt: NOW - 60 * DAY_MS,
        updatedAt: NOW - 60 * DAY_MS,
      });
      const memberId = await ctx.db.insert("users", {
        authSubject: "member-ag",
        displayName: "Maya",
        email: "maya@example.com",
        emailVerifiedAt: NOW - 30 * DAY_MS,
        createdAt: NOW - 30 * DAY_MS,
        updatedAt: NOW - 30 * DAY_MS,
      });

      const communityId = await ctx.db.insert("communities", {
        ownerId,
        slug: "builders-guild",
        name: "Builders Guild",
        visibility: "published",
        inferenceFundingPolicy: "managed_required",
        entryPolicy: "open",
        activeMemberCount: 2,
        createdAt: NOW - 60 * DAY_MS,
        updatedAt: NOW - 60 * DAY_MS,
      });

      const subId = await ctx.db.insert("founderSubscriptions", {
        ownerUserId: ownerId,
        communityId,
        provider: "stripe",
        providerCustomerId: "cus_ag",
        providerSubscriptionId: "sub_ag",
        providerPriceId: "price_ag",
        status: "active",
        currentPeriodStartAt: NOW - 10 * DAY_MS,
        currentPeriodEndAt: NOW + 20 * DAY_MS,
        cancelAtPeriodEnd: false,
        lastProviderEventCreatedAt: NOW - 10 * DAY_MS,
        createdAt: NOW - 10 * DAY_MS,
        updatedAt: NOW - 10 * DAY_MS,
      });

      // Active Stripe cycle starts at 82% ($16.40 / $20.00): alerts at 80%, background AI still allowed.
      const cycleId = await ctx.db.insert("founderUsageCycles", {
        founderSubscriptionId: subId,
        communityId,
        cycleKey: "sub_ag:cycle1",
        cycleStartAt: NOW - 10 * DAY_MS,
        cycleEndAt: NOW + 20 * DAY_MS,
        includedCostMicros: 20_000_000,
        reservedCostMicros: 0,
        settledCostMicros: 16_400_000,
        pricingVersion: "founder_plan_luna_v1",
        inputCostMicrosPerMillionTokens: 100_000,
        outputCostMicrosPerMillionTokens: 500_000,
        maxRunReservationCostMicros: 1_000_000,
        status: "open",
        createdAt: NOW - 10 * DAY_MS,
        updatedAt: NOW - 1 * HOUR_MS,
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

      // Recent human question aged 26h -> eligible for reply drafts when under 90%.
      await ctx.db.insert("communityInteractionRoots", {
        communityId,
        channelId,
        actorType: "human",
        actorUserId: memberId,
        kind: "question",
        visibilityScope: "community",
        status: "live",
        contentSummary: "How do I launch my first cohort?",
        replyCount: 0,
        reactionSummary: [],
        idempotencyKey: "ag-q-1",
        createdAt: NOW - 26 * HOUR_MS,
        updatedAt: NOW - 26 * HOUR_MS,
      });

      // Recent member post within 2h so community heartbeat tier is "active".
      await ctx.db.insert("communityInteractionRoots", {
        communityId,
        channelId,
        actorType: "human",
        actorUserId: memberId,
        kind: "discussion",
        visibilityScope: "community",
        status: "live",
        contentSummary: "Back and building!",
        replyCount: 0,
        reactionSummary: [],
        idempotencyKey: "ag-p-2",
        createdAt: NOW - 2 * HOUR_MS,
        updatedAt: NOW - 2 * HOUR_MS,
      });

      // One sent check-in 5d ago -> Maya came back 2h ago (1 of 1 win-back!).
      await ctx.db.insert("communityMemberCoachDrafts", {
        communityId,
        memberUserId: memberId,
        reason: "quiet_member",
        dedupeKey: "ag-winback-1",
        signalSummary: "Quiet member",
        status: "sent",
        deliveryMode: "auto",
        sentAt: NOW - 5 * DAY_MS,
        createdAt: NOW - 5 * DAY_MS,
        updatedAt: NOW - 5 * DAY_MS,
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

      return { ownerId, communityId, cycleId, settingsId };
    });

    // 1. At 82%: background scans are STILL permitted (< 90%).
    const memberClaimAt82 = await t.mutation(
      internal.communityMemberCoach.claimCommunityMemberCoachScanInternal,
      { settingsId: fx.settingsId, nowMs: NOW },
    );
    expect(memberClaimAt82).not.toBeNull();
    const builderClaimAt82 = await t.mutation(
      internal.communityBuilderHeartbeat.claimBuilderHeartbeatScanInternal,
      { settingsId: fx.settingsId, nowMs: NOW },
    );
    expect(builderClaimAt82).not.toBeNull();

    // 2. First alert sweep sends the 80% notice to Owner's private thread + email outbox (with win-back context).
    const firstAlert = await t.mutation(
      internal.communityAllowanceGuardrails.processFounderAllowanceAlertsPageInternal,
      { nowMs: NOW, cursor: null },
    );
    expect(firstAlert.alertsSent).toBe(1);

    // Repeat sweep at 82% is strictly idempotent (0 duplicate alerts).
    const repeatAlert = await t.mutation(
      internal.communityAllowanceGuardrails.processFounderAllowanceAlertsPageInternal,
      { nowMs: NOW + 1_000, cursor: null },
    );
    expect(repeatAlert.alertsSent).toBe(0);

    const [emailsAfter80, msgsAfter80] = await t.run(async (ctx: any) =>
      Promise.all([ctx.db.query("emailOutbox").collect(), ctx.db.query("cloudMessages").collect()]),
    );
    expect(emailsAfter80).toHaveLength(1);
    expect(emailsAfter80[0]).toMatchObject({
      recipientUserId: fx.ownerId,
      templateKey: "founder_allowance_notice",
    });
    expect(String((emailsAfter80[0]?.payload as any)?.bodyText ?? "")).toContain("1 of 1 members");
    expect(msgsAfter80).toHaveLength(1);
    expect(msgsAfter80[0]?.contentJson?.meta).toMatchObject({
      kind: "founder_allowance_notice",
      milestone: 80,
    });

    // 3. Raise spend to 92% ($18.40 / $20.00): ALL 3 background AI lanes pause cleanly at $0 AI!
    await t.run(async (ctx: any) => {
      await ctx.db.patch(fx.cycleId, { settledCostMicros: 18_400_000, updatedAt: NOW + HOUR_MS });
      await ctx.db.patch(fx.settingsId, {
        leaseUntil: undefined,
        builderLeaseUntil: undefined,
        nextScanAt: NOW + HOUR_MS - 1_000,
        builderNextScanAt: NOW + HOUR_MS - 1_000,
      });
    });

    const memberClaimAt92 = await t.mutation(
      internal.communityMemberCoach.claimCommunityMemberCoachScanInternal,
      { settingsId: fx.settingsId, nowMs: NOW + HOUR_MS },
    );
    expect(memberClaimAt92).toBeNull();
    const builderClaimAt92 = await t.mutation(
      internal.communityBuilderHeartbeat.claimBuilderHeartbeatScanInternal,
      { settingsId: fx.settingsId, nowMs: NOW + HOUR_MS },
    );
    expect(builderClaimAt92).toBeNull();
    const replyDraftInputAt92 = await t.query(
      internal.communityReplyDrafts.readReplyDraftInputInternal,
      { communityId: fx.communityId, nowMs: NOW + HOUR_MS },
    );
    expect(replyDraftInputAt92.question).toBeNull();
    expect(replyDraftInputAt92.nextDueAt).toBe(NOW + 7 * HOUR_MS);

    // Owner Settings view exposes exact cycle_end_at and background_ai_paused: true.
    const asOwner = t.withIdentity({ subject: "owner-ag" });
    const settingsView = await asOwner.query(api.communityMemberCoach.getMemberCoachSettings, {
      communityId: fx.communityId,
    });
    expect(settingsView.impact).toMatchObject({
      percent_used: 92,
      background_ai_paused: true,
      cycle_end_at: NOW + 20 * DAY_MS,
    });

    // 4. Raise spend to $19.20 / $20.00 (exhausts $1.00 reservation headroom -> no new runs can start):
    //    sends the 100% reset notice exactly once so founders aren't left silently blocked.
    await t.run(async (ctx: any) => {
      await ctx.db.patch(fx.cycleId, { settledCostMicros: 19_200_000, updatedAt: NOW + 2 * HOUR_MS });
    });
    const alert100 = await t.mutation(
      internal.communityAllowanceGuardrails.processFounderAllowanceAlertsPageInternal,
      { nowMs: NOW + 2 * HOUR_MS, cursor: null },
    );
    expect(alert100.alertsSent).toBe(1);
    const repeat100 = await t.mutation(
      internal.communityAllowanceGuardrails.processFounderAllowanceAlertsPageInternal,
      { nowMs: NOW + 2 * HOUR_MS + 1_000, cursor: null },
    );
    expect(repeat100.alertsSent).toBe(0);
  });
});
