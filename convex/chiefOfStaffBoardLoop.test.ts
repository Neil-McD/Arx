/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { briefMarkdown, deterministicBrief, snapshotIsQuiet } from "./communityFounderBrief";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

async function seedWorld(
  t: ReturnType<typeof convexTest>,
  options: { nowMs: number; planTier?: "free" | "guide" | "chief_of_staff"; agentEnabled?: boolean },
) {
  return await t.run(async (ctx) => {
    const now = options.nowMs;
    const makeUser = (authSubject: string, displayName: string, handle: string) =>
      ctx.db.insert("users", {
        authSubject,
        displayName,
        handle,
        normalizedHandle: handle,
        createdAt: now - 30 * DAY_MS,
        updatedAt: now - 30 * DAY_MS,
      });

    const ownerId = await makeUser("owner", "Neil", "neil");
    const adminId = await makeUser("admin", "Avery", "avery");
    const modId = await makeUser("mod", "Maya", "maya");
    const samId = await makeUser("sam", "Sam", "sam");
    const julesId = await makeUser("jules", "Jules", "jules");

    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "chief-club",
      name: "Chief Club",
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 5,
      createdAt: now - 30 * DAY_MS,
      updatedAt: now - 30 * DAY_MS,
    });

    await ctx.db.insert("communityChannels", {
      communityId,
      systemRole: "general",
      slug: "general",
      name: "General",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 0,
      createdByUserId: ownerId,
      createdAt: now - 30 * DAY_MS,
      updatedAt: now - 30 * DAY_MS,
    });

    if (options.agentEnabled === false) {
      await ctx.db.insert("communityApps", {
        communityId,
        appSlug: "community_agent",
        enabled: false,
        createdAt: now - 30 * DAY_MS,
        updatedAt: now - 30 * DAY_MS,
      } as any);
    }

    if (options.planTier === "chief_of_staff" || options.planTier === "guide") {
      await ctx.db.insert("founderSubscriptions", {
        ownerUserId: ownerId,
        communityId,
        provider: "stripe",
        providerCustomerId: "cus_test_1",
        providerSubscriptionId: "sub_test_1",
        providerPriceId: options.planTier === "chief_of_staff" ? "price_cos" : "price_guide",
        planTier: options.planTier,
        status: "active",
        currentPeriodStartAt: now - 5 * DAY_MS,
        currentPeriodEndAt: now + 25 * DAY_MS,
        cancelAtPeriodEnd: false,
        lastProviderEventCreatedAt: now - 5 * DAY_MS,
        createdAt: now - 5 * DAY_MS,
        updatedAt: now - 5 * DAY_MS,
      });
    }

    const addMember = (userId: any, role: "admin" | "moderator" | "member") =>
      ctx.db.insert("communityMemberships", {
        communityId,
        userId,
        role,
        state: "active",
        createdAt: now - 3 * DAY_MS,
        activatedAt: now - 3 * DAY_MS,
        updatedAt: now - 3 * DAY_MS,
      });

    await addMember(adminId, "admin");
    await addMember(modId, "moderator");
    const samMembershipId = await addMember(samId, "member");
    const julesMembershipId = await addMember(julesId, "member");

    // Sam is on "getting_started" with BOTH checkpoints ("first_lesson" and "shared_goal") completed!
    await ctx.db.insert("communityMemberJourneyCards", {
      communityId,
      userId: samId,
      stageKey: "getting_started",
      founderInstruction: "PRIVATE_HOST_NOTE_NEVER_IN_BRIEF",
      founderInstructionUpdatedAt: now - DAY_MS,
      completedMilestones: [
        { key: "first_lesson", label: "Completed a lesson", completedAt: now - 3 * HOUR_MS, source: "founder" },
        { key: "shared_goal", label: "Shared a goal", completedAt: now - 2 * HOUR_MS, source: "founder" },
      ],
      outcomes: [
        { id: "win_sam_1", text: "Shipped first landing page", at: now - 4 * HOUR_MS, source: "mcp" },
      ],
      createdAt: now - 5 * DAY_MS,
      updatedAt: now - 2 * HOUR_MS,
    });

    // Jules is on "getting_started" with only 1 of 2 checkpoints done and status "needs_you".
    await ctx.db.insert("communityMemberJourneyCards", {
      communityId,
      userId: julesId,
      stageKey: "getting_started",
      statusOverride: "needs_you",
      completedMilestones: [
        { key: "first_lesson", label: "Completed a lesson", completedAt: now - 2 * DAY_MS, source: "founder" },
      ],
      createdAt: now - 5 * DAY_MS,
      updatedAt: now - 2 * DAY_MS,
    });

    // Seed a private 1:1 thread for Sam so we prove private chat words NEVER appear in Brief or Home proposals.
    const samThreadId = await ctx.db.insert("threads", {
      ownerId: samId,
      title: "Private Guide talk",
      titleSource: "auto",
      communityId: String(communityId),
      createdAt: now - DAY_MS,
      updatedAt: now - HOUR_MS,
    });
    await ctx.db.insert("cloudMessages", {
      threadId: samThreadId,
      ownerId: samId,
      messageKey: "msg_sam_private_1",
      seq: 1,
      role: "user",
      contentJson: [{ type: "text", text: "SUPER_PRIVATE_SAM_CONFESSION_NEVER_LEAK" }],
      createdAt: now - HOUR_MS,
    });

    return { communityId, ownerId, adminId, modId, samId, julesId, samMembershipId, julesMembershipId };
  });
}

describe("Chief of Staff Home stage-move proposals & Daily Brief Board Pulse", () => {
  test("surfaces one-click stage-move proposals ONLY for Chief of Staff tier + owners/admins; fails closed for non-managers", async () => {
    const t = convexTest(schema, modules);
    const nowMs = Date.now();
    const w = await seedWorld(t, { nowMs, planTier: "chief_of_staff" });

    const asOwner = t.withIdentity({ subject: "owner" });
    const asAdmin = t.withIdentity({ subject: "admin" });
    const asMod = t.withIdentity({ subject: "mod" });
    const asSam = t.withIdentity({ subject: "sam" });

    // Members and moderators fail closed on all 3 endpoints.
    for (const actor of [asMod, asSam]) {
      await expect(
        actor.query(api.communityMemberJourney.listJourneyStageAdvanceProposals, { communityId: w.communityId }),
      ).rejects.toThrow();
      await expect(
        actor.mutation(api.communityMemberJourney.approveJourneyStageAdvance, {
          communityId: w.communityId,
          membershipId: w.samMembershipId,
          expectedFromStageKey: "getting_started",
          targetStageKey: "active",
        }),
      ).rejects.toThrow();
      await expect(
        actor.mutation(api.communityMemberJourney.dismissJourneyStageAdvance, {
          communityId: w.communityId,
          membershipId: w.samMembershipId,
          expectedFromStageKey: "getting_started",
        }),
      ).rejects.toThrow();
    }

    // Owner and Admin both see Sam's proposal (and NOT Jules, who only finished 1/2 checkpoints).
    const proposals = await asOwner.query(api.communityMemberJourney.listJourneyStageAdvanceProposals, {
      communityId: w.communityId,
    });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      membership_id: String(w.samMembershipId),
      member_name: "Sam",
      from_stage_key: "getting_started",
      from_stage_name: "Getting started",
      to_stage_key: "active",
      to_stage_name: "Active",
      completed_labels: ["Completed a lesson", "Shared a goal"],
    });
    expect(JSON.stringify(proposals)).not.toContain("SUPER_PRIVATE_SAM_CONFESSION_NEVER_LEAK");
    expect(JSON.stringify(proposals)).not.toContain("PRIVATE_HOST_NOTE_NEVER_IN_BRIEF");

    const adminProposals = await asAdmin.query(api.communityMemberJourney.listJourneyStageAdvanceProposals, {
      communityId: w.communityId,
    });
    expect(adminProposals).toHaveLength(1);

    // Free and Guide ($20) tiers do NOT receive autonomous Chief of Staff proposals on Home.
    const tFree = convexTest(schema, modules);
    const wFree = await seedWorld(tFree, { nowMs, planTier: "free" });
    expect(
      await tFree.withIdentity({ subject: "owner" }).query(api.communityMemberJourney.listJourneyStageAdvanceProposals, {
        communityId: wFree.communityId,
      }),
    ).toEqual([]);

    const tGuide = convexTest(schema, modules);
    const wGuide = await seedWorld(tGuide, { nowMs, planTier: "guide" });
    expect(
      await tGuide.withIdentity({ subject: "owner" }).query(api.communityMemberJourney.listJourneyStageAdvanceProposals, {
        communityId: wGuide.communityId,
      }),
    ).toEqual([]);
  });

  test("approving moves cleanly (with stale-card safety), dismissing never repeats, and manual backward move never nags", async () => {
    const t = convexTest(schema, modules);
    const nowMs = Date.now();
    const w = await seedWorld(t, { nowMs, planTier: "chief_of_staff" });
    const asOwner = t.withIdentity({ subject: "owner" });

    // 1. Dismissing Sam's proposal for "getting_started" suppresses it permanently for that stage.
    await asOwner.mutation(api.communityMemberJourney.dismissJourneyStageAdvance, {
      communityId: w.communityId,
      membershipId: w.samMembershipId,
      expectedFromStageKey: "getting_started",
    });
    expect(
      await asOwner.query(api.communityMemberJourney.listJourneyStageAdvanceProposals, { communityId: w.communityId }),
    ).toEqual([]);

    // 2. Moving Sam forward to "active" clears the earlier dismissal, and completing "active"'s checkpoint
    // ("regular_posts") creates a fresh proposal for "active" -> "graduated".
    await asOwner.mutation(api.communityMemberJourney.updateMemberJourneyCard, {
      communityId: w.communityId,
      membershipId: w.samMembershipId,
      stageKey: "active",
      toggleMilestone: { key: "regular_posts", label: "3+ posts or replies", completed: true },
    });
    const nextProposals = await asOwner.query(api.communityMemberJourney.listJourneyStageAdvanceProposals, {
      communityId: w.communityId,
    });
    expect(nextProposals).toHaveLength(1);
    expect(nextProposals[0]).toMatchObject({
      from_stage_key: "active",
      to_stage_key: "graduated",
    });

    // 3. Approving moves Sam to "graduated" and clears the proposal; re-approving returns already_moved cleanly.
    const approved = await asOwner.mutation(api.communityMemberJourney.approveJourneyStageAdvance, {
      communityId: w.communityId,
      membershipId: w.samMembershipId,
      expectedFromStageKey: "active",
      targetStageKey: "graduated",
    });
    expect(approved).toEqual({ status: "moved", stage_key: "graduated" });
    expect(
      await asOwner.query(api.communityMemberJourney.listJourneyStageAdvanceProposals, { communityId: w.communityId }),
    ).toEqual([]);

    const staleReplay = await asOwner.mutation(api.communityMemberJourney.approveJourneyStageAdvance, {
      communityId: w.communityId,
      membershipId: w.samMembershipId,
      expectedFromStageKey: "active",
      targetStageKey: "graduated",
    });
    expect(staleReplay).toEqual({ status: "already_moved", stage_key: "graduated" });

    // 4. Manually moving Sam BACKWARD to "getting_started" (where all checkpoints are still done)
    // respects the manual override and does NOT immediately bounce-back nag on Home!
    await asOwner.mutation(api.communityMemberJourney.updateMemberJourneyCard, {
      communityId: w.communityId,
      membershipId: w.samMembershipId,
      stageKey: "getting_started",
    });
    expect(
      await asOwner.query(api.communityMemberJourney.listJourneyStageAdvanceProposals, { communityId: w.communityId }),
    ).toEqual([]);

    // 5. Revalidation on approve: if a manager unchecks a milestone after Home loaded a proposal,
    // approving does NOT advance the member or record a false completion outcome.
    await asOwner.mutation(api.communityMemberJourney.updateMemberJourneyCard, {
      communityId: w.communityId,
      membershipId: w.samMembershipId,
      stageKey: "active",
      toggleMilestone: { key: "regular_posts", label: "3+ posts or replies", completed: false },
    });
    const staleCheckpointAttempt = await asOwner.mutation(api.communityMemberJourney.approveJourneyStageAdvance, {
      communityId: w.communityId,
      membershipId: w.samMembershipId,
      expectedFromStageKey: "active",
      targetStageKey: "graduated",
    });
    expect(staleCheckpointAttempt).toEqual({ status: "no_longer_ready", stage_key: "active" });
  });

  test("quiet-day predicate treats Board members marked stuck or needs_you as actionable", () => {
    const quietWithAttention = {
      communityName: "Chief Club",
      memberCount: 5,
      windowHours: 24,
      newMembers: { count: 0, names: [] },
      activity: { posts: 0, replies: 0, activePeople: 0 },
      week: { joined: 0, activePeople: 0, messages: 0 },
      busiest: null,
      highlight: null,
      unanswered: [],
      quietNewcomers: { count: 0, names: [] },
      joinRequestsPending: 0,
      upcomingEvents: [],
      chiefOfStaff: {
        proactiveGuide: {
          coachDraftsWaiting: 0,
          replyDraftsWaiting: 0,
          coachSentInWindow: 0,
          repliesAutoPostedInWindow: 0,
        },
        stalledLearners: [],
        quietPayingMembers: { count: 0, names: [] },
        risingContributors: [],
        podHealth: [],
        journeyPulse: {
          readyToAdvanceCount: 0,
          readyToAdvanceNames: [],
          needsAttentionCount: 1,
          needsAttentionNames: ["Jules"],
          recentWins: [],
        },
      },
    };
    expect(snapshotIsQuiet(quietWithAttention)).toBe(false);
    const md = briefMarkdown(deterministicBrief(quietWithAttention));
    expect(md).toContain("Member Board: 1 member stuck or needing attention: Jules.");
  });

  test("Daily Founder Brief includes privacy-safe Board Pulse (ready to advance, needs attention, recent wins) without leaking private chats", async () => {
    const t = convexTest(schema, modules);
    const nowMs = Date.now();
    const w = await seedWorld(t, { nowMs, planTier: "chief_of_staff" });

    const briefRead: any = await t.query(internal.communityFounderBrief.readFounderBriefSnapshotInternal, {
      communityId: w.communityId,
      windowStartMs: nowMs - DAY_MS,
      nowMs,
    });
    expect(briefRead).toBeTruthy();
    const pulse = briefRead.snapshot.chiefOfStaff?.journeyPulse;
    expect(pulse).toMatchObject({
      readyToAdvanceCount: 1,
      readyToAdvanceNames: ["Sam (Getting started → Active)"],
      needsAttentionCount: 1,
      needsAttentionNames: ["Jules"],
      recentWins: [{ memberName: "Sam", text: "Shipped first landing page" }],
    });
    expect(snapshotIsQuiet(briefRead.snapshot)).toBe(false);

    const brief = deterministicBrief(briefRead.snapshot);
    const md = briefMarkdown(brief);
    expect(md).toContain("Member Board: 1 member ready to advance (Sam (Getting started → Active)).");
    expect(md).toContain("Recent member wins: Sam — Shipped first landing page.");
    expect(md).toContain("Member Board: 1 member stuck or needing attention: Jules.");
    expect(brief.nextStep).toContain("Review 1 stage move ready on Home.");
    // Privacy wall: private 1:1 messages and private host notes NEVER leak into the brief snapshot or markdown.
    expect(JSON.stringify(briefRead)).not.toContain("SUPER_PRIVATE_SAM_CONFESSION_NEVER_LEAK");
    expect(JSON.stringify(briefRead)).not.toContain("PRIVATE_HOST_NOTE_NEVER_IN_BRIEF");
    expect(md).not.toContain("SUPER_PRIVATE_SAM_CONFESSION_NEVER_LEAK");
    expect(md).not.toContain("PRIVATE_HOST_NOTE_NEVER_IN_BRIEF");
  });

  test("fresh Board coaching notes and stuck status trigger Chief of Staff board_coaching check-ins, pause notes skip at $0 cost, and outcomes record clean labels", async () => {
    const t = convexTest(schema, modules);
    const nowMs = Date.now();
    const w = await seedWorld(t, { nowMs, planTier: "chief_of_staff" });
    const asOwner = t.withIdentity({ subject: "owner" });

    // Sam has a fresh founderInstruction ("PRIVATE_HOST_NOTE_NEVER_IN_BRIEF") updated 1 day ago -> triggers board_coaching!
    const scan1: any = await t.query(internal.communityMemberCoach.readNextMemberCoachCandidateInternal, {
      communityId: w.communityId,
      nowMs,
      autoReasons: [],
      scanCursorCreatedAt: null,
    });
    expect(scan1.candidate).toBeTruthy();
    expect(scan1.candidate.memberUserId).toBe(w.samId);
    expect(scan1.candidate.reason).toBe("board_coaching");
    expect(scan1.candidate.mode).toBe("draft");
    expect(scan1.candidate.signalSummary).toBe("Follow-up from your coaching note on their Board card");
    expect(scan1.candidate.signalSummary).not.toContain("PRIVATE_HOST_NOTE_NEVER_IN_BRIEF");

    // Save the draft and approve it -> verify the Board card outcome is a clean human string (never "[object Object]").
    const savedDraft: any = await t.mutation(internal.communityMemberCoach.recordMemberCoachJudgeOutcomeInternal, {
      communityId: w.communityId,
      memberUserId: w.samId,
      reason: "board_coaching",
      dedupeKey: scan1.candidate.dedupeKey,
      signalSummary: scan1.candidate.signalSummary,
      decision: "send",
      text: "Hey Sam, how is your landing page launch coming along?",
      requestedMode: "draft",
      usedPrivateContext: false,
      nowMs,
    });
    expect(savedDraft.ok).toBe(true);
    expect(savedDraft.outcome).toBe("draft_waiting");

    await asOwner.mutation(api.communityMemberCoach.sendMemberCoachDraft, {
      communityId: w.communityId,
      draftId: savedDraft.draftId,
    });
    const boardAfterSend = await asOwner.query(api.communityMemberJourney.getCommunityMemberJourneyBoard, {
      communityId: w.communityId,
    });
    const samCard = boardAfterSend.cards.find((c: any) => c.membership_id === String(w.samMembershipId));
    expect(samCard?.agent_outcome).toBe("Guide sent check-in");
    const storedSamCard = await t.run(async (ctx) =>
      ctx.db
        .query("communityMemberJourneyCards")
        .withIndex("by_community_user", (q: any) =>
          q.eq("communityId", w.communityId).eq("userId", w.samId),
        )
        .unique(),
    );
    expect(storedSamCard?.agentOutcomeNote).toBe("Sent Board check-in (approved)");
    expect(storedSamCard?.agentOutcomeNote).not.toContain("[object Object]");
    expect(boardAfterSend.hosted_ai_tier).toBe("chief_of_staff");
    expect(boardAfterSend.hosted_agent_on).toBe(true);

    // Pause instruction on Jules's card never initiates board_coaching outreach even when marked stuck.
    // Keep Jules past the 14-day newcomer window (and warm via a recent Guide chat) so only board_coaching could fire.
    await t.run(async (ctx) => {
      await ctx.db.patch(w.julesMembershipId, {
        createdAt: nowMs - 20 * DAY_MS,
        activatedAt: nowMs - 20 * DAY_MS,
      });
      const julesThreadId = await ctx.db.insert("threads", {
        ownerId: w.julesId,
        title: "Jules Guide chat",
        titleSource: "auto",
        communityId: String(w.communityId),
        createdAt: nowMs - 3 * DAY_MS,
        updatedAt: nowMs - 2 * DAY_MS,
      });
      await ctx.db.insert("cloudMessages", {
        threadId: julesThreadId,
        ownerId: w.julesId,
        messageKey: "msg_jules_warm_1",
        seq: 1,
        role: "user",
        contentJson: [{ type: "text", text: "Checking in on my setup" }],
        createdAt: nowMs - 2 * DAY_MS,
      });
    });
    await asOwner.mutation(api.communityMemberJourney.updateMemberJourneyCard, {
      communityId: w.communityId,
      membershipId: w.julesMembershipId,
      statusOverride: "stuck",
      founderInstruction: "Pause nudges this week while traveling",
    });
    const scanPaused: any = await t.query(internal.communityMemberCoach.readNextMemberCoachCandidateInternal, {
      communityId: w.communityId,
      nowMs: nowMs + 60_000,
      autoReasons: [],
      scanCursorCreatedAt: null,
    });
    // Jules is skipped because of the pause note (the scanner falls back to other lower-priority signals like Maya).
    expect(scanPaused.candidate?.memberUserId).not.toBe(w.julesId);
    expect(scanPaused.candidate?.reason).not.toBe("board_coaching");

    // Clearing the pause note while keeping Jules pinned as "stuck" immediately triggers board_coaching!
    await asOwner.mutation(api.communityMemberJourney.updateMemberJourneyCard, {
      communityId: w.communityId,
      membershipId: w.julesMembershipId,
      founderInstruction: "",
    });
    const scanStuck: any = await t.query(internal.communityMemberCoach.readNextMemberCoachCandidateInternal, {
      communityId: w.communityId,
      nowMs: nowMs + 120_000,
      autoReasons: [],
      scanCursorCreatedAt: null,
    });
    expect(scanStuck.candidate).toBeTruthy();
    expect(scanStuck.candidate.memberUserId).toBe(w.julesId);
    expect(scanStuck.candidate.reason).toBe("board_coaching");
    expect(scanStuck.candidate.signalSummary).toBe("Flagged as stuck on the Member Board");
  });

  test("builder/community.json and Board query expose accurate AI plan tier across Free, Guide, and Chief of Staff", async () => {
    const nowMs = Date.now();
    for (const tier of ["free", "guide", "chief_of_staff"] as const) {
      const t = convexTest(schema, modules);
      const w = await seedWorld(t, { nowMs, planTier: tier });
      const settings: any = await t.query(internal.communityLifecycle.readCommunitySettingsForTrustedManagerInternal, {
        userId: w.ownerId,
        communityId: w.communityId,
      });
      expect(settings.ai_plan).toEqual({
        tier,
        hosted_ai_funded: tier !== "free",
        hosted_agent_on: tier !== "free",
        proactive_chief_of_staff_active: tier === "chief_of_staff",
      });
      const board = await t.withIdentity({ subject: "owner" }).query(api.communityMemberJourney.getCommunityMemberJourneyBoard, {
        communityId: w.communityId,
      });
      expect(board.hosted_ai_tier).toBe(tier);
      expect(board.hosted_agent_on).toBe(tier !== "free");
    }
  });
});
