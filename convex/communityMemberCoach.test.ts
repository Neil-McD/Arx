/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  evaluateMemberCoachGate,
  isCommunityQuietHour,
  parseMemberCoachJudgeResponse,
} from "../shared/communityMemberCoach";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

async function seedCoachWorld(t: any, nowMs: number) {
  return await t.run(async (ctx: any) => {
    const insertUser = (subject: string, name: string, handle: string) =>
      ctx.db.insert("users", {
        authSubject: subject,
        displayName: name,
        handle,
        normalizedHandle: handle,
        createdAt: nowMs - 60 * DAY_MS,
        updatedAt: nowMs - 60 * DAY_MS,
      });

    const ownerId = await insertUser("owner", "Neil", "neil");
    const rashidId = await insertUser("rashid", "Rashid", "rashid");
    const mayaId = await insertUser("maya", "Maya", "maya");
    const samId = await insertUser("sam", "Sam", "sam");

    // Grant operator owner role so communityAgentIsOn() returns true.
    await ctx.db.insert("operatorRoles", {
      userId: ownerId,
      role: "owner",
      active: true,
      createdAt: nowMs - 60 * DAY_MS,
      updatedAt: nowMs - 60 * DAY_MS,
    });

    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "builders-club",
      name: "Builders Club",
      oneLiner: "Build together.",
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 4,
      createdAt: nowMs - 60 * DAY_MS,
      updatedAt: nowMs - 60 * DAY_MS,
    });

    // Set community timezone to UTC for deterministic daytime/quiet-hour tests.
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

    // Rashid: joined 10 days ago, started course 7 days ago -> course_stall.
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: rashidId,
      role: "member",
      accessSource: "free_grant",
      state: "active",
      activationSequence: 1,
      activatedAt: nowMs - 10 * DAY_MS,
      createdAt: nowMs - 10 * DAY_MS,
      updatedAt: nowMs - 10 * DAY_MS,
    });
    // Host-only note on Rashid — must NEVER leak into coach candidate context.
    await ctx.db.insert("communityMemberNotes", {
      communityId,
      subjectUserId: rashidId,
      authorUserId: ownerId,
      body: "SECRET HOST NOTE: maybe offer VIP tier later",
      createdAt: nowMs - 2 * DAY_MS,
      updatedAt: nowMs - 2 * DAY_MS,
    });

    // Maya: joined 4 days ago, never posted -> quiet_newcomer.
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: mayaId,
      role: "member",
      accessSource: "free_grant",
      state: "active",
      activationSequence: 1,
      activatedAt: nowMs - 4 * DAY_MS,
      createdAt: nowMs - 4 * DAY_MS,
      updatedAt: nowMs - 4 * DAY_MS,
    });

    // Sam: joined 30 days ago, posted 20 days ago -> quiet_member when event exists.
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: samId,
      role: "member",
      accessSource: "free_grant",
      state: "active",
      activationSequence: 1,
      activatedAt: nowMs - 30 * DAY_MS,
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
      replyPolicy: "members",
      status: "active",
      position: 0,
      createdByUserId: ownerId,
      createdAt: nowMs - 60 * DAY_MS,
      updatedAt: nowMs - 60 * DAY_MS,
    });

    // Sam posted 20 days ago.
    await ctx.db.insert("communityInteractionRoots", {
      communityId,
      channelId,
      actorType: "human",
      actorUserId: samId,
      kind: "discussion",
      visibilityScope: "community",
      status: "live",
      contentSummary: "Excited to ship my first product!",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: "sam-post-1",
      createdAt: nowMs - 20 * DAY_MS,
      updatedAt: nowMs - 20 * DAY_MS,
    });

    // Published course with 2 lessons; Rashid completed lesson 1 seven days ago.
    const courseId = await ctx.db.insert("communityResourceModules", {
      communityId,
      createdByUserId: ownerId,
      status: "live",
      name: "Launch Playbook",
      sortOrder: 1,
      createdAt: nowMs - 30 * DAY_MS,
      updatedAt: nowMs - 30 * DAY_MS,
    });
    const l1 = await ctx.db.insert("communityResources", {
      communityId,
      moduleId: courseId,
      createdByUserId: ownerId,
      type: "post",
      role: "page",
      status: "published",
      title: "Lesson 1: Pick your wedge",
      bodyChars: 80,
      pinned: false,
      sortOrder: 1,
      createdAt: nowMs - 30 * DAY_MS,
      updatedAt: nowMs - 30 * DAY_MS,
    });
    const l2 = await ctx.db.insert("communityResources", {
      communityId,
      moduleId: courseId,
      createdByUserId: ownerId,
      type: "post",
      role: "page",
      status: "published",
      title: "Lesson 2: First 10 members",
      bodyChars: 80,
      pinned: false,
      sortOrder: 2,
      createdAt: nowMs - 30 * DAY_MS,
      updatedAt: nowMs - 30 * DAY_MS,
    });
    await ctx.db.insert("communityLessonProgress", {
      communityId,
      userId: rashidId,
      resourceId: l1,
      completedAt: nowMs - 7 * DAY_MS,
    });

    // Upcoming community event in 3 days (triggers quiet_member for Sam).
    await ctx.db.insert("communityEvents", {
      communityId,
      createdByUserId: ownerId,
      title: "Weekly Demo Day",
      startsAt: nowMs + 3 * DAY_MS,
      endsAt: nowMs + 3 * DAY_MS + HOUR_MS,
      timezone: "UTC",
      locationType: "online",
      visibility: "members",
      status: "live",
      createdAt: nowMs - 5 * DAY_MS,
      updatedAt: nowMs - 5 * DAY_MS,
    });

    return { communityId, ownerId, rashidId, mayaId, samId, courseId, l1, l2 };
  });
}

test("pure interruption-budget gate and judge parser enforce every locked guardrail", () => {
  const noonUtc = Date.UTC(2026, 10, 24, 12, 0, 0);
  const twoAmUtc = Date.UTC(2026, 10, 24, 2, 0, 0);

  expect(isCommunityQuietHour(noonUtc, "UTC")).toBe(false);
  expect(isCommunityQuietHour(twoAmUtc, "UTC")).toBe(true);

  // Mid-conversation (< 12h) blocked.
  expect(
    evaluateMemberCoachGate({
      nowMs: noonUtc,
      isOwner: false,
      memberMuted: false,
      reason: "course_stall",
      dedupeKey: "course_stall:c1:l2",
      lastUserThreadMessageAt: noonUtc - 3 * HOUR_MS,
      recentHistory: [],
      autoReasonEnabled: true,
      communityTimeZone: "UTC",
    }),
  ).toEqual({ allowed: false, blockReason: "mid_conversation" });

  // Weekly cap (2 sent in last 7d) blocked.
  expect(
    evaluateMemberCoachGate({
      nowMs: noonUtc,
      isOwner: false,
      memberMuted: false,
      reason: "quiet_member",
      dedupeKey: "quiet_member:2026-11",
      lastUserThreadMessageAt: null,
      recentHistory: [
        { status: "sent", reason: "quiet_newcomer", dedupeKey: "a", createdAt: noonUtc - 6 * DAY_MS, sentAt: noonUtc - 6 * DAY_MS },
        { status: "sent", reason: "course_stall", dedupeKey: "b", createdAt: noonUtc - 3 * DAY_MS, sentAt: noonUtc - 3 * DAY_MS },
      ],
      autoReasonEnabled: true,
      communityTimeZone: "UTC",
    }),
  ).toEqual({ allowed: false, blockReason: "weekly_cap_reached" });

  // 48h cooldown blocked.
  expect(
    evaluateMemberCoachGate({
      nowMs: noonUtc,
      isOwner: false,
      memberMuted: false,
      reason: "course_stall",
      dedupeKey: "course_stall:c1:l3",
      lastUserThreadMessageAt: null,
      recentHistory: [
        { status: "sent", reason: "quiet_newcomer", dedupeKey: "a", createdAt: noonUtc - 24 * HOUR_MS, sentAt: noonUtc - 24 * HOUR_MS },
      ],
      autoReasonEnabled: true,
      communityTimeZone: "UTC",
    }),
  ).toEqual({ allowed: false, blockReason: "cooldown_active" });

  // Quiet hours downgrade auto mode cleanly to draft mode.
  expect(
    evaluateMemberCoachGate({
      nowMs: twoAmUtc,
      isOwner: false,
      memberMuted: false,
      reason: "course_stall",
      dedupeKey: "course_stall:c1:l2",
      lastUserThreadMessageAt: null,
      recentHistory: [],
      autoReasonEnabled: true,
      communityTimeZone: "UTC",
    }),
  ).toEqual({ allowed: true, mode: "draft" });

  // Daytime auto mode stays auto.
  expect(
    evaluateMemberCoachGate({
      nowMs: noonUtc,
      isOwner: false,
      memberMuted: false,
      reason: "course_stall",
      dedupeKey: "course_stall:c1:l2",
      lastUserThreadMessageAt: null,
      recentHistory: [],
      autoReasonEnabled: true,
      communityTimeZone: "UTC",
    }),
  ).toEqual({ allowed: true, mode: "auto" });

  // Judge parser: silence default, blocks links & @everyone, parses fenced JSON.
  expect(parseMemberCoachJudgeResponse("not json")).toEqual({ action: "skip", reason: "unparseable_response" });
  expect(parseMemberCoachJudgeResponse('{"action":"send","text":"Check https://evil.example"}')).toEqual({
    action: "skip",
    reason: "contains_link",
  });
  expect(parseMemberCoachJudgeResponse('{"action":"send","text":"Hey @everyone wake up"}')).toEqual({
    action: "skip",
    reason: "mentions_everyone",
  });
  expect(parseMemberCoachJudgeResponse('```json\n{"action":"send","text":"Hey Rashid, ready for Lesson 2?"}\n```')).toEqual({
    action: "send",
    text: "Hey Rashid, ready for Lesson 2?",
  });
});

test("deterministic signals pick course_stall, quiet_newcomer, and quiet_member in priority order without leaking host notes", async () => {
  const t = convexTest(schema, modules);
  const nowMs = Date.UTC(2026, 10, 24, 14, 0, 0);
  const w = await seedCoachWorld(t, nowMs);

  // Priority 1: Rashid's stalled course (never includes SECRET HOST NOTE!).
  const firstScan: any = await t.query(internal.communityMemberCoach.readNextMemberCoachCandidateInternal, {
    communityId: w.communityId,
    autoReasons: [],
    nowMs,
  });
  const first = firstScan.candidate;
  expect(first).toMatchObject({
    memberUserId: w.rashidId,
    reason: "course_stall",
    mode: "draft",
  });
  expect(first.signalSummary).toContain("Launch Playbook");
  expect(first.signalSummary).toContain("Lesson 2: First 10 members");
  expect(JSON.stringify(first)).not.toContain("SECRET HOST NOTE");

  // Save a waiting draft for Rashid -> next candidate is Maya (quiet_newcomer).
  await t.mutation(internal.communityMemberCoach.recordMemberCoachJudgeOutcomeInternal, {
    communityId: w.communityId,
    memberUserId: w.rashidId,
    reason: "course_stall",
    dedupeKey: first.dedupeKey,
    signalSummary: first.signalSummary,
    decision: "send",
    text: "Hey Rashid — you finished Lesson 1 last week. Want a hand with Lesson 2?",
    requestedMode: "draft",
    nowMs,
  });

  const secondScan: any = await t.query(internal.communityMemberCoach.readNextMemberCoachCandidateInternal, {
    communityId: w.communityId,
    autoReasons: [],
    nowMs,
  });
  const second = secondScan.candidate;
  expect(second).toMatchObject({
    memberUserId: w.mayaId,
    reason: "quiet_newcomer",
    mode: "draft",
  });

  // Judge chooses silence for Maya -> next candidate is Sam (quiet_member with upcoming event).
  await t.mutation(internal.communityMemberCoach.recordMemberCoachJudgeOutcomeInternal, {
    communityId: w.communityId,
    memberUserId: w.mayaId,
    reason: "quiet_newcomer",
    dedupeKey: second.dedupeKey,
    signalSummary: second.signalSummary,
    decision: "skip",
    skipReason: "nothing_specific",
    requestedMode: "draft",
    nowMs,
  });

  const thirdScan: any = await t.query(internal.communityMemberCoach.readNextMemberCoachCandidateInternal, {
    communityId: w.communityId,
    autoReasons: [],
    nowMs,
  });
  const third = thirdScan.candidate;
  expect(third).toMatchObject({
    memberUserId: w.samId,
    reason: "quiet_member",
  });
  expect(third.signalSummary).toContain("Weekly Demo Day");
});

test("owner approval delivers check-in atomically into member's private Agent thread; member opt-out fails closed", async () => {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const w = await seedCoachWorld(t, nowMs);

  const candidateScan: any = await t.query(internal.communityMemberCoach.readNextMemberCoachCandidateInternal, {
    communityId: w.communityId,
    autoReasons: [],
    nowMs,
  });
  const candidate = candidateScan.candidate;
  const saved: any = await t.mutation(internal.communityMemberCoach.recordMemberCoachJudgeOutcomeInternal, {
    communityId: w.communityId,
    memberUserId: w.rashidId,
    reason: "course_stall",
    dedupeKey: candidate.dedupeKey,
    signalSummary: candidate.signalSummary,
    decision: "send",
    text: "Hey Rashid, want to pick up Lesson 2 this week?",
    requestedMode: "draft",
    nowMs,
  });
  expect(saved).toMatchObject({ ok: true, outcome: "draft_waiting" });

  // Non-owner cannot list drafts or change owner settings.
  const asRashid = t.withIdentity({ subject: "rashid" });
  const asOwner = t.withIdentity({ subject: "owner" });
  await expect(asRashid.query(api.communityMemberCoach.listMemberCoachDrafts, { communityId: w.communityId })).rejects.toThrow(
    /owner_required/,
  );
  await expect(asRashid.query(api.communityMemberCoach.getMemberCoachSettings, { communityId: w.communityId })).rejects.toThrow(
    /owner_required/,
  );

  // Owner sees waiting draft on Home and sends with edited text.
  const waiting = await asOwner.query(api.communityMemberCoach.listMemberCoachDrafts, { communityId: w.communityId });
  expect(waiting).toHaveLength(1);
  expect(waiting[0]).toMatchObject({ member_name: "Rashid", reason: "course_stall" });

  const sentResult = await asOwner.mutation(api.communityMemberCoach.sendMemberCoachDraft, {
    communityId: w.communityId,
    draftId: waiting[0]!.id as any,
    text: "Hey Rashid! Ready to tackle Lesson 2: First 10 members whenever you have 10 minutes?",
  });
  expect(sentResult.ok).toBe(true);

  // Confirm message landed directly in Rashid's private community Agent thread.
  const messages = await t.run(async (ctx: any) =>
    await ctx.db
      .query("cloudMessages")
      .withIndex("by_thread_seq", (q: any) => q.eq("threadId", sentResult.thread_id))
      .collect(),
  );
  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({
    ownerId: w.rashidId,
    role: "assistant",
    contentJson: {
      text: "Hey Rashid! Ready to tackle Lesson 2: First 10 members whenever you have 10 minutes?",
      meta: expect.objectContaining({ kind: "member_coach", reason: "course_stall", delivery_mode: "approved" }),
    },
  });

  // Draft list is now empty.
  expect(await asOwner.query(api.communityMemberCoach.listMemberCoachDrafts, { communityId: w.communityId })).toEqual([]);

  // Now test member opt-out: Maya pauses guide check-ins -> draft waiting for Maya cannot be sent.
  const asMaya = t.withIdentity({ subject: "maya" });
  const mayaScan: any = await t.query(internal.communityMemberCoach.readNextMemberCoachCandidateInternal, {
    communityId: w.communityId,
    autoReasons: [],
    nowMs,
  });
  const mayaCand = mayaScan.candidate;
  const mayaDraft: any = await t.mutation(internal.communityMemberCoach.recordMemberCoachJudgeOutcomeInternal, {
    communityId: w.communityId,
    memberUserId: w.mayaId,
    reason: "quiet_newcomer",
    dedupeKey: mayaCand.dedupeKey,
    signalSummary: mayaCand.signalSummary,
    decision: "send",
    text: "Welcome Maya! Feel free to say hi in General.",
    requestedMode: "draft",
    nowMs,
  });
  await asMaya.mutation(api.communityMemberCoach.setMyMemberCoachPreference, {
    communityId: w.communityId,
    coachMuted: true,
  });
  expect(await asMaya.query(api.communityMemberCoach.getMyMemberCoachPreference, { communityId: w.communityId })).toEqual({
    coach_muted: true,
    community_muted: false,
    global_coach_muted: false,
  });

  // Hidden from Home AND refused if send is attempted anyway.
  expect(await asOwner.query(api.communityMemberCoach.listMemberCoachDrafts, { communityId: w.communityId })).toEqual([]);
  await expect(
    asOwner.mutation(api.communityMemberCoach.sendMemberCoachDraft, {
      communityId: w.communityId,
      draftId: mayaDraft.draftId as any,
    }),
  ).rejects.toThrow(/no_longer_needed/);
});

test("auto-send delivers during daytime, downgrades to draft in quiet hours, and respects owner off-switch on enrollment", async () => {
  const t = convexTest(schema, modules);
  const noonUtc = Date.UTC(2026, 10, 24, 14, 0, 0);
  const w = await seedCoachWorld(t, noonUtc);
  const asOwner = t.withIdentity({ subject: "owner" });

  // Owner enables auto-send for course_stall only.
  const updated = await asOwner.mutation(api.communityMemberCoach.setMemberCoachSettings, {
    communityId: w.communityId,
    enabled: true,
    autoReasons: ["course_stall"],
  });
  expect(updated).toMatchObject({ enabled: true, auto_reasons: ["course_stall"] });

  // During daytime -> auto-delivers straight to Rashid's private Agent thread.
  const daytimeOutcome: any = await t.mutation(internal.communityMemberCoach.recordMemberCoachJudgeOutcomeInternal, {
    communityId: w.communityId,
    memberUserId: w.rashidId,
    reason: "course_stall",
    dedupeKey: `course_stall:${String(w.courseId)}:${String(w.l2)}`,
    signalSummary: "Paused before Lesson 2",
    decision: "send",
    text: "Hey Rashid, ready for Lesson 2 whenever you are!",
    requestedMode: "auto",
    nowMs: noonUtc,
  });
  expect(daytimeOutcome).toMatchObject({ ok: true, outcome: "sent_auto" });

  // During quiet hours (2am UTC) -> even with autoReasons including quiet_newcomer, saves as draft instead!
  await asOwner.mutation(api.communityMemberCoach.setMemberCoachSettings, {
    communityId: w.communityId,
    enabled: true,
    autoReasons: ["course_stall", "quiet_newcomer"],
  });
  const twoAmUtc = Date.UTC(2026, 10, 24, 2, 0, 0);
  const nightOutcome: any = await t.mutation(internal.communityMemberCoach.recordMemberCoachJudgeOutcomeInternal, {
    communityId: w.communityId,
    memberUserId: w.mayaId,
    reason: "quiet_newcomer",
    dedupeKey: "quiet_newcomer:act:1",
    signalSummary: "Joined 4 days ago",
    decision: "send",
    text: "Welcome Maya!",
    requestedMode: "auto",
    nowMs: twoAmUtc,
  });
  expect(nightOutcome).toMatchObject({ ok: true, outcome: "draft_waiting" });

  // Owner turns off member coach -> enrollment cron never re-enables it!
  await asOwner.mutation(api.communityMemberCoach.setMemberCoachSettings, {
    communityId: w.communityId,
    enabled: false,
    autoReasons: [],
  });
  const due = await t.mutation(internal.communityMemberCoach.enrollAndListDueMemberCoachCommunitiesInternal, {
    nowMs: noonUtc + DAY_MS,
  });
  expect(due.some((row: any) => String(row.communityId) === String(w.communityId))).toBe(false);
});

test("approved draft send revalidates mid-conversation guard; roster scan rotates past 60 rows; subscription discovery paginates", async () => {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const w = await seedCoachWorld(t, nowMs);
  const asOwner = t.withIdentity({ subject: "owner" });

  // 1. Mid-conversation guard revalidated on owner approval send.
  const saved: any = await t.mutation(internal.communityMemberCoach.recordMemberCoachJudgeOutcomeInternal, {
    communityId: w.communityId,
    memberUserId: w.rashidId,
    reason: "course_stall",
    dedupeKey: `course_stall:${String(w.courseId)}:${String(w.l2)}`,
    signalSummary: "Paused before Lesson 2",
    decision: "send",
    text: "Hey Rashid, want to pick up Lesson 2?",
    requestedMode: "draft",
    nowMs,
  });
  // Rashid starts talking to the guide right now (user message in active thread).
  const conv: any = await t.mutation(internal.threads.ensureCommunityAgentConversationForTrustedUserInternal, {
    communityId: w.communityId,
    trustedUserId: w.rashidId,
  });
  await t.mutation(internal.threads.addCloudThreadMessageForTrustedOwnerInternal, {
    trustedOwnerId: w.rashidId,
    threadId: conv.thread_id,
    messageKey: "user-msg-active-chat",
    role: "user",
    contentJson: { text: "Quick question about Lesson 2" },
    createdAt: nowMs,
  });
  await expect(
    asOwner.mutation(api.communityMemberCoach.sendMemberCoachDraft, {
      communityId: w.communityId,
      draftId: saved.draftId as any,
    }),
  ).rejects.toThrow(/active_conversation/);

  // 2. Rotating membership scan reaches older active members past 60 newer inactive rows.
  await t.run(async (ctx: any) => {
    for (let i = 0; i < 65; i += 1) {
      const uid = await ctx.db.insert("users", {
        authSubject: `left-${i}`,
        displayName: `Left ${i}`,
        createdAt: nowMs - DAY_MS + i,
        updatedAt: nowMs - DAY_MS + i,
      });
      await ctx.db.insert("communityMemberships", {
        communityId: w.communityId,
        userId: uid,
        role: "member",
        accessSource: "free_grant",
        state: "left",
        activationSequence: 1,
        createdAt: nowMs - DAY_MS + i * 10,
        updatedAt: nowMs - DAY_MS + i * 10,
      });
    }
  });
  // First scan reads the 60 newest (all left) and advances nextScanCursorCreatedAt.
  const scan1: any = await t.query(internal.communityMemberCoach.readNextMemberCoachCandidateInternal, {
    communityId: w.communityId,
    autoReasons: [],
    nowMs,
    scanCursorCreatedAt: null,
  });
  expect(scan1.nextScanCursorCreatedAt).not.toBeNull();
  // Second scan using the persisted cursor reaches Sam (older active member) and wraps cursor to null.
  const scan2: any = await t.query(internal.communityMemberCoach.readNextMemberCoachCandidateInternal, {
    communityId: w.communityId,
    autoReasons: [],
    nowMs,
    scanCursorCreatedAt: scan1.nextScanCursorCreatedAt,
  });
  expect(scan2.candidate).toBeTruthy();
  expect(scan2.nextScanCursorCreatedAt).toBeNull();

  // 3. Paginated founder subscription enrollment discovers communities across multiple pages.
  const extraIds = await t.run(async (ctx: any) => {
    const ids: any[] = [];
    for (let i = 0; i < 3; i += 1) {
      const uid = await ctx.db.insert("users", {
        authSubject: `founder-${i}`,
        displayName: `Founder ${i}`,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const cid = await ctx.db.insert("communities", {
        ownerId: uid,
        slug: `sub-club-${i}`,
        name: `Sub Club ${i}`,
        visibility: "published",
        inferenceFundingPolicy: "managed_required",
        entryPolicy: "open",
        activeMemberCount: 1,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      await ctx.db.insert("founderSubscriptions", {
        ownerUserId: uid,
        communityId: cid,
        provider: "stripe",
        providerCustomerId: `cus_${i}`,
        providerSubscriptionId: `sub_${i}`,
        providerPriceId: "price_agent",
        status: "active",
        currentPeriodStartAt: nowMs - DAY_MS,
        currentPeriodEndAt: nowMs + 29 * DAY_MS,
        cancelAtPeriodEnd: false,
        lastProviderEventCreatedAt: nowMs,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      ids.push(cid);
    }
    return ids;
  });
  // Page size 1 forces 3+ pages — confirm all 3 subscriptions get enrolled cleanly.
  let cursor: string | null = null;
  let totalEnrolled = 0;
  for (let p = 0; p < 10; p += 1) {
    const res: any = await t.mutation(internal.communityMemberCoach.enrollFounderSubscriptionsPageInternal, {
      nowMs,
      cursor,
      pageSize: 1,
    });
    totalEnrolled += res.enrolled;
    if (res.isDone || !res.continueCursor) break;
    cursor = res.continueCursor;
  }
  expect(totalEnrolled).toBe(3);
  const enrolledSettings = await t.run(async (ctx: any) =>
    await Promise.all(
      extraIds.map((cid: any) =>
        ctx.db.query("communityMemberCoachSettings").withIndex("by_community", (q: any) => q.eq("communityId", cid)).first(),
      ),
    ),
  );
  expect(enrolledSettings.every((row: any) => row?.enabled === true)).toBe(true);
});
