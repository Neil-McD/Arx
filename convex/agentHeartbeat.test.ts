/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  classifyCommunityHeartbeatCadence,
  classifyMemberHeartbeatTemperature,
  countConsecutiveUnansweredCoachTouches,
} from "../shared/agentHeartbeat";
import { evaluateMemberCoachGate } from "../shared/communityMemberCoach";

const modules = import.meta.glob([
  "./*.ts",
  "!./*.test.ts",
  "./_generated/**/*.*s",
]);

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
const NOW = Date.UTC(2026, 10, 24, 18, 0, 0); // daytime UTC

describe("activity-tapered heartbeats (Slice 3)", () => {
  test("classifies member temperatures, tapers to $0 Cold after 30d or 2 unanswered touches, and wakes on return", () => {
    expect(
      classifyMemberHeartbeatTemperature({
        nowMs: NOW,
        lastActivityAtMs: NOW - 2 * DAY_MS,
        joinedAtMs: NOW - 20 * DAY_MS,
        consecutiveUnanswered: 0,
      }),
    ).toMatchObject({ temperature: "hot", handoffToSystem: false });

    expect(
      classifyMemberHeartbeatTemperature({
        nowMs: NOW,
        lastActivityAtMs: NOW - 8 * DAY_MS,
        joinedAtMs: NOW - 20 * DAY_MS,
        consecutiveUnanswered: 1,
      }),
    ).toMatchObject({ temperature: "warm", handoffToSystem: false });

    expect(
      classifyMemberHeartbeatTemperature({
        nowMs: NOW,
        lastActivityAtMs: NOW - 20 * DAY_MS,
        joinedAtMs: NOW - 40 * DAY_MS,
        consecutiveUnanswered: 1,
      }),
    ).toMatchObject({ temperature: "cooling", handoffToSystem: false });

    // >30 days idle -> Cold ($0 AI handoff).
    expect(
      classifyMemberHeartbeatTemperature({
        nowMs: NOW,
        lastActivityAtMs: NOW - 31 * DAY_MS,
        joinedAtMs: NOW - 60 * DAY_MS,
        consecutiveUnanswered: 0,
      }),
    ).toMatchObject({ temperature: "cold", handoffToSystem: true });

    // 2 consecutive unanswered AI check-ins -> Cold ($0 AI handoff) even if recent.
    const unanswered = countConsecutiveUnansweredCoachTouches(
      [
        { status: "sent", sentAt: NOW - 2 * DAY_MS, createdAt: NOW - 2 * DAY_MS },
        { status: "sent", sentAt: NOW - 5 * DAY_MS, createdAt: NOW - 5 * DAY_MS },
      ],
      NOW - 10 * DAY_MS,
    );
    expect(unanswered).toBe(2);
    expect(
      classifyMemberHeartbeatTemperature({
        nowMs: NOW,
        lastActivityAtMs: NOW - 10 * DAY_MS,
        joinedAtMs: NOW - 20 * DAY_MS,
        consecutiveUnanswered: unanswered,
      }),
    ).toMatchObject({ temperature: "cold", handoffToSystem: true });

    // Member returns and participates -> unanswered streak resets to 0 and wakes to Hot.
    const afterReturn = countConsecutiveUnansweredCoachTouches(
      [
        { status: "sent", sentAt: NOW - 2 * DAY_MS, createdAt: NOW - 2 * DAY_MS },
        { status: "sent", sentAt: NOW - 5 * DAY_MS, createdAt: NOW - 5 * DAY_MS },
      ],
      NOW - 1 * HOUR_MS,
    );
    expect(afterReturn).toBe(0);
    expect(
      classifyMemberHeartbeatTemperature({
        nowMs: NOW,
        lastActivityAtMs: NOW - 1 * HOUR_MS,
        joinedAtMs: NOW - 20 * DAY_MS,
        consecutiveUnanswered: afterReturn,
      }),
    ).toMatchObject({ temperature: "hot", handoffToSystem: false });

    // Gate hard-blocks Cold members and enforces private auto-only for commitments.
    expect(
      evaluateMemberCoachGate({
        nowMs: NOW,
        isOwner: false,
        memberMuted: false,
        reason: "course_stall",
        dedupeKey: "k1",
        lastUserThreadMessageAt: null,
        recentHistory: [],
        autoReasonEnabled: true,
        memberTemperature: "cold",
        consecutiveUnanswered: 2,
      }),
    ).toEqual({ allowed: false, blockReason: "cold_handoff_to_system" });

    expect(
      evaluateMemberCoachGate({
        nowMs: NOW,
        isOwner: false,
        memberMuted: false,
        reason: "commitment_followup",
        dedupeKey: "k2",
        lastUserThreadMessageAt: null,
        recentHistory: [],
        autoReasonEnabled: false,
        memberTemperature: "hot",
      }),
    ).toEqual({ allowed: false, blockReason: "commitment_requires_private_auto" });

    // Community cadence taper: active (2h), warm (6h), cooling (24h), paused (14d+ -> skipAiScan).
    expect(classifyCommunityHeartbeatCadence({ nowMs: NOW, lastCommunityActivityAtMs: NOW - 2 * HOUR_MS }))
      .toMatchObject({ tier: "active", skipAiScan: false });
    expect(classifyCommunityHeartbeatCadence({ nowMs: NOW, lastCommunityActivityAtMs: NOW - 4 * DAY_MS }))
      .toMatchObject({ tier: "warm", skipAiScan: false });
    expect(classifyCommunityHeartbeatCadence({ nowMs: NOW, lastCommunityActivityAtMs: NOW - 10 * DAY_MS }))
      .toMatchObject({ tier: "cooling", skipAiScan: false });
    expect(classifyCommunityHeartbeatCadence({ nowMs: NOW, lastCommunityActivityAtMs: NOW - 20 * DAY_MS }))
      .toMatchObject({ tier: "paused", skipAiScan: true });
  });

  test("pauses quiet communities at $0 AI, filters cold members, protects private commitments, and triggers 24h unseen email nudges", async () => {
    const t = convexTest(schema, modules);

    const fx = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", {
        authSubject: "owner-hb",
        displayName: "Founder",
        email: "founder@example.com",
        emailVerifiedAt: NOW - 60 * DAY_MS,
        createdAt: NOW - 60 * DAY_MS,
        updatedAt: NOW - 60 * DAY_MS,
      });
      await ctx.db.insert("operatorRoles", {
        userId: ownerId,
        role: "owner",
        active: true,
        createdAt: NOW - 60 * DAY_MS,
        updatedAt: NOW - 60 * DAY_MS,
      });
      const hotUserId = await ctx.db.insert("users", {
        authSubject: "hot-hb",
        displayName: "Hot Member",
        email: "hot@example.com",
        emailVerifiedAt: NOW - 20 * DAY_MS,
        createdAt: NOW - 20 * DAY_MS,
        updatedAt: NOW - 20 * DAY_MS,
      });
      const coldUserId = await ctx.db.insert("users", {
        authSubject: "cold-hb",
        displayName: "Cold Member",
        email: "cold@example.com",
        emailVerifiedAt: NOW - 45 * DAY_MS,
        createdAt: NOW - 45 * DAY_MS,
        updatedAt: NOW - 45 * DAY_MS,
      });
      const seenUserId = await ctx.db.insert("users", {
        authSubject: "seen-hb",
        displayName: "Seen Member",
        email: "seen@example.com",
        emailVerifiedAt: NOW - 20 * DAY_MS,
        createdAt: NOW - 20 * DAY_MS,
        updatedAt: NOW - 20 * DAY_MS,
      });

      const activeCommunityId = await ctx.db.insert("communities", {
        ownerId,
        slug: "active-club",
        name: "Active Club",
        visibility: "published",
        entryPolicy: "open",
        inferenceFundingPolicy: "managed_required",
        createdAt: NOW - 60 * DAY_MS,
        updatedAt: NOW - 60 * DAY_MS,
      });
      const quietCommunityId = await ctx.db.insert("communities", {
        ownerId,
        slug: "quiet-club",
        name: "Quiet Club",
        visibility: "published",
        entryPolicy: "open",
        inferenceFundingPolicy: "managed_required",
        createdAt: NOW - 60 * DAY_MS,
        updatedAt: NOW - 60 * DAY_MS,
      });

      const channelId = await ctx.db.insert("communityChannels", {
        communityId: activeCommunityId,
        systemRole: "general",
        slug: "general",
        name: "General",
        accessMode: "all_members",
        postingPolicy: "members",
        status: "active",
        position: 0,
        createdAt: NOW - 60 * DAY_MS,
        updatedAt: NOW - 60 * DAY_MS,
      });

      // Active community has a recent post (within 24h); quiet community has none.
      await ctx.db.insert("communityInteractionRoots", {
        communityId: activeCommunityId,
        channelId,
        actorType: "human",
        actorUserId: hotUserId,
        kind: "discussion",
        visibilityScope: "community",
        status: "live",
        contentSummary: "Shipping my landing page this week!",
        replyCount: 0,
        reactionSummary: [],
        idempotencyKey: "hb-post-1",
        createdAt: NOW - 4 * HOUR_MS,
        updatedAt: NOW - 4 * HOUR_MS,
      });

      // Memberships
      await ctx.db.insert("communityMemberships", {
        communityId: activeCommunityId,
        userId: hotUserId,
        role: "member",
        accessSource: "free_grant",
        state: "active",
        activatedAt: NOW - 15 * DAY_MS,
        createdAt: NOW - 15 * DAY_MS,
        updatedAt: NOW - 15 * DAY_MS,
      });
      await ctx.db.insert("communityMemberships", {
        communityId: activeCommunityId,
        userId: coldUserId,
        role: "member",
        accessSource: "free_grant",
        state: "active",
        activatedAt: NOW - 40 * DAY_MS,
        createdAt: NOW - 40 * DAY_MS,
        updatedAt: NOW - 40 * DAY_MS,
      });
      await ctx.db.insert("communityMemberships", {
        communityId: activeCommunityId,
        userId: seenUserId,
        role: "member",
        accessSource: "free_grant",
        state: "active",
        activatedAt: NOW - 10 * DAY_MS,
        createdAt: NOW - 10 * DAY_MS,
        updatedAt: NOW - 10 * DAY_MS,
      });
      await ctx.db.insert("communityMemberships", {
        communityId: quietCommunityId,
        userId: coldUserId,
        role: "member",
        accessSource: "free_grant",
        state: "active",
        activatedAt: NOW - 40 * DAY_MS,
        createdAt: NOW - 40 * DAY_MS,
        updatedAt: NOW - 40 * DAY_MS,
      });

      // Hot member has a private Soul + Commitment aged 4 days.
      await ctx.db.insert("memberMemories", {
        communityId: activeCommunityId,
        userId: hotUserId,
        soulMd: "Be crisp and practical; celebrate shipped work.",
        entries: [
          {
            text: "Publish my first customer case study by Friday.",
            category: "commitment",
            sourceRef: "run:1",
            at: NOW - 4 * DAY_MS,
          },
        ],
        updatedAt: NOW - 4 * DAY_MS,
      });

      const activeSettingsId = await ctx.db.insert("communityMemberCoachSettings", {
        communityId: activeCommunityId,
        enabled: true,
        autoReasons: ["commitment_followup"],
        nextScanAt: NOW - 1000,
        createdAt: NOW - 10 * DAY_MS,
        updatedAt: NOW - 10 * DAY_MS,
      });
      const quietSettingsId = await ctx.db.insert("communityMemberCoachSettings", {
        communityId: quietCommunityId,
        enabled: true,
        autoReasons: [],
        nextScanAt: NOW - 1000,
        createdAt: NOW - 40 * DAY_MS,
        updatedAt: NOW - 40 * DAY_MS,
      });

      // Sent proactive check-ins 26h ago:
      // 1) hotUserId: never replied -> should enqueue 24h email nudge (neutral preview for commitment_followup).
      await ctx.db.insert("communityMemberCoachDrafts", {
        communityId: activeCommunityId,
        memberUserId: hotUserId,
        reason: "commitment_followup",
        dedupeKey: "sent-unseen-1",
        signalSummary: "Active commitment shared with guide 4 days ago",
        status: "sent",
        deliveryMode: "auto",
        unseenEmailState: "pending",
        sentText: "Secret private goal details that should not leak in email preview.",
        sentAt: NOW - 26 * HOUR_MS,
        createdAt: NOW - 26 * HOUR_MS,
        updatedAt: NOW - 26 * HOUR_MS,
      });
      // 2) seenUserId: replied in their Guide thread 2h ago -> should mark "seen" with NO email!
      await ctx.db.insert("communityMemberCoachDrafts", {
        communityId: activeCommunityId,
        memberUserId: seenUserId,
        reason: "quiet_newcomer",
        dedupeKey: "sent-seen-1",
        signalSummary: "Joined 3 days ago",
        status: "sent",
        deliveryMode: "auto",
        unseenEmailState: "pending",
        sentText: "Welcome!",
        sentAt: NOW - 26 * HOUR_MS,
        createdAt: NOW - 26 * HOUR_MS,
        updatedAt: NOW - 26 * HOUR_MS,
      });
      const seenThreadId = await ctx.db.insert("threads", {
        ownerId: seenUserId,
        title: "Guide",
        titleSource: "auto",
        communityId: String(activeCommunityId),
        createdAt: NOW - 5 * DAY_MS,
        updatedAt: NOW - 2 * HOUR_MS,
      });
      const seenChannelId = await ctx.db.insert("memberAgentChannels", {
        ownerId: seenUserId,
        scopeKey: "community",
        communityId: activeCommunityId,
        nextOrdinal: 2,
        createdAt: NOW - 5 * DAY_MS,
        updatedAt: NOW - 2 * HOUR_MS,
      });
      const seenEpId = await ctx.db.insert("memberAgentEpisodes", {
        channelId: seenChannelId,
        threadId: seenThreadId,
        ordinal: 1,
        status: "active",
        startedAt: NOW - 5 * DAY_MS,
        createdAt: NOW - 5 * DAY_MS,
        updatedAt: NOW - 2 * HOUR_MS,
      });
      await ctx.db.patch(seenChannelId, { activeEpisodeId: seenEpId });
      await ctx.db.insert("cloudMessages", {
        ownerId: seenUserId,
        threadId: seenThreadId,
        messageKey: "user-reply-1",
        seq: 1,
        role: "user",
        contentJson: { text: "Thanks for checking in!" },
        createdAt: NOW - 2 * HOUR_MS,
      });

      return { activeCommunityId, quietCommunityId, activeSettingsId, quietSettingsId, hotUserId, coldUserId };
    });

    // 1. Quiet community (40d idle) skips scan cleanly at $0 AI and records tier "paused".
    const quietClaim = await t.mutation(internal.communityMemberCoach.claimCommunityMemberCoachScanInternal, {
      settingsId: fx.quietSettingsId,
      nowMs: NOW,
    });
    expect(quietClaim).toBeNull();
    const quietRow = await t.run(async (ctx) => await ctx.db.get(fx.quietSettingsId));
    expect(quietRow?.communityHeartbeatTier).toBe("paused");

    // 2. Active community claims at tier "active" (2h rhythm).
    const activeClaim = await t.mutation(internal.communityMemberCoach.claimCommunityMemberCoachScanInternal, {
      settingsId: fx.activeSettingsId,
      nowMs: NOW,
    });
    expect(activeClaim).toMatchObject({ communityTier: "active", nextIntervalMs: 2 * HOUR_MS });

    // 3. Candidate scan tallies temperatures, skips cold member, and surfaces hot commitment ONLY in auto mode.
    const draftOnlyScan = await t.query(internal.communityMemberCoach.readNextMemberCoachCandidateInternal, {
      communityId: fx.activeCommunityId,
      autoReasons: [],
      nowMs: NOW,
    });
    // Without commitment_followup in autoReasons, private commitment is NOT exposed in draft mode!
    expect(draftOnlyScan.candidate?.reason).not.toBe("commitment_followup");
    expect(draftOnlyScan.temperatureCounts).toMatchObject({ hot: 2, cold: 1 });

    // With commitment_followup enabled in autoReasons (after cooldown passes), private Soul + commitment are loaded strictly for auto mode.
    const autoScan = await t.query(internal.communityMemberCoach.readNextMemberCoachCandidateInternal, {
      communityId: fx.activeCommunityId,
      autoReasons: ["commitment_followup"],
      nowMs: NOW + 4 * DAY_MS,
    });
    expect(autoScan.candidate).toMatchObject({
      memberUserId: fx.hotUserId,
      reason: "commitment_followup",
      mode: "auto",
      personalSoulMd: "Be crisp and practical; celebrate shipped work.",
    });
    // Signal summary never copies verbatim private commitment text.
    expect(autoScan.candidate?.signalSummary).not.toContain("case study");

    // 4. Persist snapshot and verify owner Settings query returns heartbeat summary.
    await t.mutation(internal.communityMemberCoach.finishCommunityMemberCoachScanInternal, {
      settingsId: fx.activeSettingsId,
      nowMs: NOW,
      nextIntervalMs: 2 * HOUR_MS,
      communityTier: "active",
      temperatureCounts: draftOnlyScan.temperatureCounts,
    });
    const owner = t.withIdentity({ subject: "owner-hb", email: "founder@example.com" });
    const settingsView = await owner.query(api.communityMemberCoach.getMemberCoachSettings, {
      authSubject: "owner-hb",
      communityId: fx.activeCommunityId,
    });
    expect(settingsView.heartbeat).toMatchObject({
      community_tier: "active",
      counts: { hot: 2, warm: 0, cooling: 0, cold: 1 },
    });

    // 5. Private-context responses NEVER downgrade into a founder-visible draft if auto mode turns off mid-run.
    const downgraded = await t.mutation(internal.communityMemberCoach.recordMemberCoachJudgeOutcomeInternal, {
      communityId: fx.activeCommunityId,
      memberUserId: fx.hotUserId,
      reason: "course_stall",
      dedupeKey: "private-no-downgrade-1",
      signalSummary: "Paused on course",
      decision: "send",
      text: "References private memory that founder must never see.",
      requestedMode: "auto",
      usedPrivateContext: true,
      nowMs: NOW + 4 * DAY_MS,
    });
    expect(downgraded).toEqual({ ok: false, code: "private_context_cannot_downgrade_to_draft" });

    // 6. Private guide activity wakes a paused community cleanly.
    await t.run(async (ctx) => {
      await ctx.db.patch(fx.quietSettingsId, { nextScanAt: NOW - 1000 });
      await ctx.db.insert("memberAgentChannels", {
        ownerId: fx.coldUserId,
        scopeKey: "community",
        communityId: fx.quietCommunityId,
        nextOrdinal: 2,
        createdAt: NOW - 2 * HOUR_MS,
        updatedAt: NOW - 2 * HOUR_MS,
      });
    });
    const wokenClaim = await t.mutation(internal.communityMemberCoach.claimCommunityMemberCoachScanInternal, {
      settingsId: fx.quietSettingsId,
      nowMs: NOW,
    });
    expect(wokenClaim).toMatchObject({ communityTier: "active" });

    // 7. 24-hour unseen email nudge: atomically enqueues 1 neutral email in emailOutbox for hotUserId,
    // marks seenUserId as "seen", and leaves zero pending rows on second run.
    const firstSweep = await t.mutation(internal.communityMemberCoach.processUnseenMemberCoachEmailsInternal, {
      nowMs: NOW,
    });
    expect(firstSweep).toEqual({ enqueued: 1, seen: 1, suppressed: 0 });
    const outboxRows = await t.run(async (ctx) => await ctx.db.query("emailOutbox").collect());
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0]?.recipientUserId).toBe(fx.hotUserId);
    expect(outboxRows[0]?.templateKey).toBe("member_coach_nudge");
    // Private commitment text never leaks into email preview!
    expect(String((outboxRows[0]?.payload as any)?.bodyPreview ?? "")).not.toContain("Secret private goal");
    expect(String((outboxRows[0]?.payload as any)?.actionUrl ?? "")).toContain("/c/active-club/agent");

    // Second sweep is strictly idempotent (0 duplicate jobs).
    const secondSweep = await t.mutation(internal.communityMemberCoach.processUnseenMemberCoachEmailsInternal, {
      nowMs: NOW + 1000,
    });
    expect(secondSweep).toEqual({ enqueued: 0, seen: 0, suppressed: 0 });
  });
});
