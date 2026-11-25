/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  BUILDER_HEARTBEAT_BRIEF_BUFFER_MS,
  evaluateBuilderHeartbeatGate,
} from "../shared/builderHeartbeat";

const modules = import.meta.glob([
  "./*.ts",
  "!./*.test.ts",
  "./_generated/**/*.*s",
]);

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
const NOW = Date.UTC(2026, 10, 24, 15, 0, 0); // 3pm UTC (daytime)

async function seedBuilderWorld(t: any, nowMs: number) {
  return await t.run(async (ctx: any) => {
    const insertUser = (subject: string, name: string, handle: string, email: string) =>
      ctx.db.insert("users", {
        authSubject: subject,
        displayName: name,
        handle,
        normalizedHandle: handle,
        email,
        emailVerifiedAt: nowMs - 60 * DAY_MS,
        createdAt: nowMs - 60 * DAY_MS,
        updatedAt: nowMs - 60 * DAY_MS,
      });

    const ownerId = await insertUser("owner-bh", "Neil", "neil", "neil@example.com");
    const adminId = await insertUser("admin-bh", "Elena", "elena", "elena@example.com");
    const memberId = await insertUser("member-bh", "Maya", "maya", "maya@example.com");

    await ctx.db.insert("operatorRoles", {
      userId: ownerId,
      role: "owner",
      active: true,
      createdAt: nowMs - 60 * DAY_MS,
      updatedAt: nowMs - 60 * DAY_MS,
    });

    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "founders-lab",
      name: "Founders Lab",
      oneLiner: "Build smarter communities.",
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 3,
      createdAt: nowMs - 60 * DAY_MS,
      updatedAt: nowMs - 60 * DAY_MS,
    });

    await ctx.db.insert("communityFounderBriefSettings", {
      communityId,
      enabled: true,
      localHour: 8,
      timeZone: "UTC",
      nextDueAt: nowMs + DAY_MS,
      updatedByUserId: ownerId,
      createdAt: nowMs - 30 * DAY_MS,
      updatedAt: nowMs - 30 * DAY_MS,
    });

    // Active admin who joined 4 days ago and hasn't posted yet:
    // MUST be excluded from member quiet_newcomer coaching, and included in Builder Heartbeat.
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: adminId,
      role: "admin",
      accessSource: "manual_grant",
      state: "active",
      activationSequence: 1,
      activatedAt: nowMs - 4 * DAY_MS,
      createdAt: nowMs - 4 * DAY_MS,
      updatedAt: nowMs - 4 * DAY_MS,
    });

    // Regular member joined 4 days ago, never posted -> eligible for member quiet_newcomer.
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      accessSource: "free_grant",
      state: "active",
      activationSequence: 1,
      activatedAt: nowMs - 4 * DAY_MS,
      createdAt: nowMs - 4 * DAY_MS,
      updatedAt: nowMs - 4 * DAY_MS,
    });

    // Owner has a private commitment aged 5 days + custom Builder Soul.
    await ctx.db.insert("memberMemories", {
      communityId,
      userId: ownerId,
      soulMd: "Direct chief-of-staff tone; keep nudges under two sentences.",
      entries: [
        {
          text: "Record Lesson 4 before Thursday's community call.",
          category: "commitment",
          sourceRef: "run:owner-1",
          at: nowMs - 5 * DAY_MS,
        },
      ],
      updatedAt: nowMs - 5 * DAY_MS,
    });

    // Admin has their own separate private commitment aged 3 days + custom Builder Soul.
    await ctx.db.insert("memberMemories", {
      communityId,
      userId: adminId,
      soulMd: "Collaborative co-builder tone; offer draft copy directly.",
      entries: [
        {
          text: "Draft the onboarding welcome thread for next Monday's cohort.",
          category: "commitment",
          sourceRef: "run:admin-1",
          at: nowMs - 3 * DAY_MS,
        },
      ],
      updatedAt: nowMs - 3 * DAY_MS,
    });

    // Member Coach is disabled (enabled: false), but builderNextScanAt is due now!
    const settingsId = await ctx.db.insert("communityMemberCoachSettings", {
      communityId,
      enabled: false,
      autoReasons: [],
      nextScanAt: nowMs + DAY_MS,
      builderNextScanAt: nowMs - 1_000,
      createdAt: nowMs - 10 * DAY_MS,
      updatedAt: nowMs - 10 * DAY_MS,
    });

    return { communityId, ownerId, adminId, memberId, settingsId };
  });
}

describe("Builder's Own Proactive Heartbeat", () => {
  test("pure gate enforces mute, cold taper, quiet hours, 4h brief buffer, mid-conversation, cooldown, weekly cap, and dedupe", () => {
    const base = {
      nowMs: NOW,
      builderMuted: false,
      dedupeKey: "builder_commitment:1:record lesson 4",
      lastUserThreadMessageAt: null,
      lastFounderBriefSentAt: null,
      recentHistory: [],
      communityTimeZone: "UTC",
      builderTemperature: "hot" as const,
      consecutiveUnanswered: 0,
    };

    expect(evaluateBuilderHeartbeatGate(base)).toEqual({ allowed: true });
    expect(evaluateBuilderHeartbeatGate({ ...base, builderMuted: true })).toEqual({
      allowed: false,
      blockReason: "builder_muted",
    });
    expect(evaluateBuilderHeartbeatGate({ ...base, builderTemperature: "cold" })).toEqual({
      allowed: false,
      blockReason: "cold_handoff_to_system",
    });
    expect(evaluateBuilderHeartbeatGate({ ...base, consecutiveUnanswered: 2 })).toEqual({
      allowed: false,
      blockReason: "cold_handoff_to_system",
    });
    expect(
      evaluateBuilderHeartbeatGate({ ...base, nowMs: Date.UTC(2026, 10, 24, 2, 0, 0) }),
    ).toEqual({ allowed: false, blockReason: "quiet_hours" });
    expect(
      evaluateBuilderHeartbeatGate({
        ...base,
        lastFounderBriefSentAt: NOW - (BUILDER_HEARTBEAT_BRIEF_BUFFER_MS - 10 * 60_000),
      }),
    ).toEqual({ allowed: false, blockReason: "brief_spacing_buffer" });
    expect(
      evaluateBuilderHeartbeatGate({
        ...base,
        lastFounderBriefSentAt: NOW - (BUILDER_HEARTBEAT_BRIEF_BUFFER_MS + 60_000),
      }),
    ).toEqual({ allowed: true });
    expect(
      evaluateBuilderHeartbeatGate({
        ...base,
        lastUserThreadMessageAt: NOW - 3 * HOUR_MS,
      }),
    ).toEqual({ allowed: false, blockReason: "mid_conversation" });
    expect(
      evaluateBuilderHeartbeatGate({
        ...base,
        recentHistory: [
          {
            status: "sent",
            dedupeKey: "other",
            createdAt: NOW - 24 * HOUR_MS,
            sentAt: NOW - 24 * HOUR_MS,
          },
        ],
      }),
    ).toEqual({ allowed: false, blockReason: "cooldown_active" });
    expect(
      evaluateBuilderHeartbeatGate({
        ...base,
        recentHistory: [
          { status: "sent", dedupeKey: "a", createdAt: NOW - 6 * DAY_MS, sentAt: NOW - 6 * DAY_MS },
          { status: "sent", dedupeKey: "b", createdAt: NOW - 3 * DAY_MS, sentAt: NOW - 3 * DAY_MS },
        ],
      }),
    ).toEqual({ allowed: false, blockReason: "weekly_cap_reached" });
    expect(
      evaluateBuilderHeartbeatGate({
        ...base,
        recentHistory: [
          { status: "judge_skipped", dedupeKey: base.dedupeKey, createdAt: NOW - 2 * DAY_MS },
        ],
      }),
    ).toEqual({ allowed: false, blockReason: "commitment_deduped" });
  });

  test("excludes admins from Member Coach, runs Builder Heartbeat independently of Member Coach off-switch, enforces 4h brief buffer, and isolates co-builder privacy", async () => {
    const t = convexTest(schema, modules);
    const w = await seedBuilderWorld(t, NOW);

    // 1. Member Coach MUST skip the active Admin (only picks regular member Maya).
    const memberScan: any = await t.query(
      internal.communityMemberCoach.readNextMemberCoachCandidateInternal,
      { communityId: w.communityId, autoReasons: [], nowMs: NOW },
    );
    expect(memberScan.candidate?.memberUserId).toBe(w.memberId);
    expect(memberScan.temperatureCounts).toEqual({ hot: 0, warm: 1, cooling: 0, cold: 0 });

    // 2. Even though Member Coach enabled=false (and even with 25 legacy rows missing builderNextScanAt),
    //    Builder Heartbeat still discovers the due community without being starved by undefined index entries.
    await t.run(async (ctx: any) => {
      for (let i = 0; i < 25; i += 1) {
        const legacyCid = await ctx.db.insert("communities", {
          ownerId: w.ownerId,
          slug: `legacy-club-${i}`,
          name: `Legacy Club ${i}`,
          visibility: "unlisted",
          inferenceFundingPolicy: "managed_required",
          entryPolicy: "open",
          activeMemberCount: 1,
          createdAt: NOW - 40 * DAY_MS,
          updatedAt: NOW - 40 * DAY_MS,
        });
        await ctx.db.insert("communityMemberCoachSettings", {
          communityId: legacyCid,
          enabled: false,
          autoReasons: [],
          createdAt: NOW - 40 * DAY_MS,
          updatedAt: NOW - 40 * DAY_MS,
        });
      }
    });
    const dueBuilderComms = await t.query(
      internal.communityBuilderHeartbeat.listDueBuilderHeartbeatCommunitiesInternal,
      { nowMs: NOW },
    );
    expect(dueBuilderComms.some((row: any) => String(row.communityId) === String(w.communityId))).toBe(true);

    // 3. First candidate picks oldest qualifying commitment (Owner: 5 days ago), with strictly Owner's Soul/Memory.
    const firstCandidate: any = await t.query(
      internal.communityBuilderHeartbeat.readNextBuilderHeartbeatCandidateInternal,
      { communityId: w.communityId, nowMs: NOW },
    );
    expect(firstCandidate).toMatchObject({
      builderUserId: w.ownerId,
      builderRole: "owner",
      personalSoulMd: "Direct chief-of-staff tone; keep nudges under two sentences.",
    });
    expect(firstCandidate.signalDetail).toContain("Record Lesson 4");
    expect(firstCandidate.signalDetail).not.toContain("onboarding welcome thread");
    expect(firstCandidate.personalMemoryExcerpt).not.toContain("onboarding welcome thread");

    // 4. If a Daily Founder Brief just went out 1 hour ago, Owner is spaced by the 4h buffer
    //    so candidate scan cleanly picks Admin Elena instead (with strictly Elena's Soul/Memory)!
    await t.run(async (ctx: any) => {
      await ctx.db.insert("communityFounderBriefs", {
        communityId: w.communityId,
        ownerUserId: w.ownerId,
        briefDate: "2026-11-24",
        status: "sent",
        windowStartMs: NOW - 25 * HOUR_MS,
        windowEndMs: NOW - HOUR_MS,
        leaseExpiresAt: NOW - HOUR_MS,
        attempts: 1,
        sentAt: NOW - HOUR_MS,
        createdAt: NOW - HOUR_MS,
        updatedAt: NOW - HOUR_MS,
      });
    });

    const duringBriefBuffer: any = await t.query(
      internal.communityBuilderHeartbeat.readNextBuilderHeartbeatCandidateInternal,
      { communityId: w.communityId, nowMs: NOW },
    );
    expect(duringBriefBuffer).toMatchObject({
      builderUserId: w.adminId,
      builderRole: "admin",
      personalSoulMd: "Collaborative co-builder tone; offer draft copy directly.",
    });
    expect(duringBriefBuffer.signalDetail).toContain("onboarding welcome thread");
    expect(duringBriefBuffer.signalDetail).not.toContain("Record Lesson 4");

    // 5. Delivery drops straight into Admin's private Agent thread and leaves Member Coach drafts untouched.
    const sentAdmin: any = await t.mutation(
      internal.communityBuilderHeartbeat.recordBuilderHeartbeatOutcomeInternal,
      {
        communityId: w.communityId,
        builderUserId: w.adminId,
        dedupeKey: duringBriefBuffer.dedupeKey,
        decision: "send",
        text: "Hey Elena — want me to draft that onboarding welcome thread for Monday's cohort?",
        nowMs: NOW,
      },
    );
    expect(sentAdmin).toMatchObject({ ok: true, outcome: "sent" });

    const [adminMessages, memberDrafts] = await t.run(async (ctx: any) =>
      Promise.all([
        ctx.db
          .query("cloudMessages")
          .withIndex("by_thread_seq", (q: any) => q.eq("threadId", sentAdmin.threadId))
          .collect(),
        ctx.db.query("communityMemberCoachDrafts").collect(),
      ]),
    );
    expect(adminMessages).toHaveLength(1);
    expect(adminMessages[0]).toMatchObject({
      ownerId: w.adminId,
      role: "assistant",
      contentJson: {
        text: "Hey Elena — want me to draft that onboarding welcome thread for Monday's cohort?",
        meta: expect.objectContaining({
          kind: "builder_heartbeat",
          reason: "builder_commitment_followup",
        }),
      },
    });
    expect(memberDrafts).toHaveLength(0);

    // 6. Once 4h brief buffer clears (+4h), Owner becomes eligible again.
    const afterBriefBuffer: any = await t.query(
      internal.communityBuilderHeartbeat.readNextBuilderHeartbeatCandidateInternal,
      { communityId: w.communityId, nowMs: NOW + 4 * HOUR_MS },
    );
    expect(afterBriefBuffer).toMatchObject({
      builderUserId: w.ownerId,
      builderRole: "owner",
    });

    // 6b. If Owner removes that commitment in Settings while the judge is in flight,
    //     delivery fails closed ("commitment_removed") and never resurrects the forgotten goal.
    const asOwner = t.withIdentity({ subject: "owner-bh" });
    await asOwner.mutation(api.memberMemory.saveMyGuideMemory, {
      communityId: w.communityId,
      operation: { action: "clear" },
    });
    const blockedAfterClear: any = await t.mutation(
      internal.communityBuilderHeartbeat.recordBuilderHeartbeatOutcomeInternal,
      {
        communityId: w.communityId,
        builderUserId: w.ownerId,
        dedupeKey: afterBriefBuffer.dedupeKey,
        decision: "send",
        text: "Still working on Lesson 4?",
        nowMs: NOW + 4 * HOUR_MS,
      },
    );
    expect(blockedAfterClear).toEqual({ ok: false, code: "commitment_removed" });

    // 7. 24h unseen email nudge sends a strictly neutral privacy-safe preview (no commitment leakage)
    //    and stays idempotent on repeat sweeps.
    const firstEmailSweep = await t.mutation(
      internal.communityBuilderHeartbeat.processUnseenBuilderHeartbeatEmailsInternal,
      { nowMs: NOW + 26 * HOUR_MS },
    );
    expect(firstEmailSweep).toEqual({ enqueued: 1, seen: 0, suppressed: 0 });
    const outbox = await t.run(async (ctx: any) => await ctx.db.query("emailOutbox").collect());
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.recipientUserId).toBe(w.adminId);
    expect(String((outbox[0]?.payload as any)?.bodyPreview ?? "")).not.toContain("onboarding welcome thread");
    expect(String((outbox[0]?.payload as any)?.actionUrl ?? "")).toContain("/c/founders-lab/agent");

    const secondEmailSweep = await t.mutation(
      internal.communityBuilderHeartbeat.processUnseenBuilderHeartbeatEmailsInternal,
      { nowMs: NOW + 26 * HOUR_MS + 1_000 },
    );
    expect(secondEmailSweep).toEqual({ enqueued: 0, seen: 0, suppressed: 0 });
  });

  test("per-builder preference defaults On for Owner & Admin, isolates toggles, and fails closed for regular members", async () => {
    const t = convexTest(schema, modules);
    const w = await seedBuilderWorld(t, NOW);

    const asOwner = t.withIdentity({ subject: "owner-bh" });
    const asAdmin = t.withIdentity({ subject: "admin-bh" });
    const asMember = t.withIdentity({ subject: "member-bh" });

    // Owner and Admin both default to eligible: true, enabled: true.
    expect(
      await asOwner.query(api.communityBuilderHeartbeat.getMyBuilderHeartbeatPreference, {
        communityId: w.communityId,
      }),
    ).toEqual({ eligible: true, enabled: true, community_muted: false });
    expect(
      await asAdmin.query(api.communityBuilderHeartbeat.getMyBuilderHeartbeatPreference, {
        communityId: w.communityId,
      }),
    ).toEqual({ eligible: true, enabled: true, community_muted: false });

    // Regular member is NOT eligible and cannot mutate builder heartbeat preference.
    expect(
      await asMember.query(api.communityBuilderHeartbeat.getMyBuilderHeartbeatPreference, {
        communityId: w.communityId,
      }),
    ).toEqual({ eligible: false, enabled: false, community_muted: false });
    await expect(
      asMember.mutation(api.communityBuilderHeartbeat.setMyBuilderHeartbeatPreference, {
        communityId: w.communityId,
        enabled: false,
      }),
    ).rejects.toThrow(/builder_required/);

    // Owner turns off their own Builder Heartbeat -> Admin stays On and still gets scanned!
    expect(
      await asOwner.mutation(api.communityBuilderHeartbeat.setMyBuilderHeartbeatPreference, {
        communityId: w.communityId,
        enabled: false,
      }),
    ).toEqual({ eligible: true, enabled: false, community_muted: false });
    expect(
      await asAdmin.query(api.communityBuilderHeartbeat.getMyBuilderHeartbeatPreference, {
        communityId: w.communityId,
      }),
    ).toEqual({ eligible: true, enabled: true, community_muted: false });

    const candidateAfterOwnerOptOut: any = await t.query(
      internal.communityBuilderHeartbeat.readNextBuilderHeartbeatCandidateInternal,
      { communityId: w.communityId, nowMs: NOW },
    );
    expect(candidateAfterOwnerOptOut?.builderUserId).toBe(w.adminId);
  });
});
