/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { briefMarkdown, deterministicBrief, snapshotIsQuiet } from "./communityFounderBrief";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

async function seedChiefOfStaffWorld(t: any, nowMs: number) {
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

    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "builders-club",
      name: "Builders Club",
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 4,
      createdAt: nowMs - 60 * DAY_MS,
      updatedAt: nowMs - 60 * DAY_MS,
    });

    // Rashid: active free member, rising contributor this week + stalled on course.
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: rashidId,
      role: "member",
      accessSource: "free_grant",
      state: "active",
      activationSequence: 1,
      activatedAt: nowMs - 20 * DAY_MS,
      createdAt: nowMs - 20 * DAY_MS,
      updatedAt: nowMs - 20 * DAY_MS,
    });
    // Maya: active PAID member joined 30 days ago, completely quiet for 20+ days -> quietPayingMembers!
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: mayaId,
      role: "member",
      accessSource: "paid_subscription",
      state: "active",
      activationSequence: 1,
      activatedAt: nowMs - 30 * DAY_MS,
      createdAt: nowMs - 30 * DAY_MS,
      updatedAt: nowMs - 30 * DAY_MS,
    });
    // Sam: active PAID member joined 30 days ago, posted yesterday -> NOT quiet!
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: samId,
      role: "member",
      accessSource: "paid_subscription",
      state: "active",
      activationSequence: 1,
      activatedAt: nowMs - 30 * DAY_MS,
      createdAt: nowMs - 30 * DAY_MS,
      updatedAt: nowMs - 30 * DAY_MS,
    });

    const generalId = await ctx.db.insert("communityChannels", {
      communityId,
      systemRole: "general",
      slug: "general",
      name: "General",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 0,
      createdByUserId: ownerId,
      createdAt: nowMs - 60 * DAY_MS,
      updatedAt: nowMs - 60 * DAY_MS,
    });

    const podId = await ctx.db.insert("communityChannels", {
      communityId,
      slug: "shippers",
      name: "Shippers Pod",
      accessMode: "restricted",
      postingPolicy: "members",
      status: "active",
      position: 1,
      createdByUserId: ownerId,
      createdAt: nowMs - 30 * DAY_MS,
      updatedAt: nowMs - 30 * DAY_MS,
    });
    await ctx.db.insert("communityChannelParticipants", {
      communityId,
      channelId: podId,
      principalKey: `user:${String(rashidId)}`,
      status: "active",
      createdByUserId: ownerId,
      createdAt: nowMs - 10 * DAY_MS,
      updatedAt: nowMs - 10 * DAY_MS,
    });
    // Private pod post with secret content — counts toward messages7d, text must NEVER leak!
    await ctx.db.insert("communityInteractionRoots", {
      communityId,
      channelId: podId,
      actorType: "human",
      actorUserId: rashidId,
      kind: "discussion",
      visibilityScope: "community",
      status: "live",
      contentSummary: "PRIVATE POD SECRET TEXT NEVER QUOTE IN BRIEF",
      replyCount: 2,
      reactionSummary: [],
      idempotencyKey: "pod-secret-1",
      createdAt: nowMs - 2 * DAY_MS,
      updatedAt: nowMs - 2 * DAY_MS,
    });

    // Rashid posts 3 times in General this week -> rising contributor!
    for (let i = 0; i < 3; i += 1) {
      await ctx.db.insert("communityInteractionRoots", {
        communityId,
        channelId: generalId,
        actorType: "human",
        actorUserId: rashidId,
        kind: "discussion",
        visibilityScope: "community",
        status: "live",
        contentSummary: `Shipping update ${i}`,
        replyCount: 0,
        reactionSummary: [],
        idempotencyKey: `rashid-post-${i}`,
        createdAt: nowMs - (i + 1) * DAY_MS,
        updatedAt: nowMs - (i + 1) * DAY_MS,
      });
    }
    // Sam (paid) posted yesterday so Sam is NOT quiet.
    await ctx.db.insert("communityInteractionRoots", {
      communityId,
      channelId: generalId,
      actorType: "human",
      actorUserId: samId,
      kind: "discussion",
      visibilityScope: "community",
      status: "live",
      contentSummary: "Checked in yesterday!",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: "sam-post-1",
      createdAt: nowMs - DAY_MS,
      updatedAt: nowMs - DAY_MS,
    });

    // Published course with 2 lessons; Rashid completed lesson 1 eight days ago -> stalledLearners!
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
      title: "Lesson 1",
      bodyChars: 40,
      pinned: false,
      sortOrder: 1,
      createdAt: nowMs - 30 * DAY_MS,
      updatedAt: nowMs - 30 * DAY_MS,
    });
    await ctx.db.insert("communityResources", {
      communityId,
      moduleId: courseId,
      createdByUserId: ownerId,
      type: "post",
      role: "page",
      status: "published",
      title: "Lesson 2",
      bodyChars: 40,
      pinned: false,
      sortOrder: 2,
      createdAt: nowMs - 30 * DAY_MS,
      updatedAt: nowMs - 30 * DAY_MS,
    });
    await ctx.db.insert("communityLessonProgress", {
      communityId,
      userId: rashidId,
      resourceId: l1,
      completedAt: nowMs - 8 * DAY_MS,
    });

    // Proactive guide activity: 1 waiting coach draft, 1 sent coach check-in, 1 auto-posted reply!
    await ctx.db.insert("communityMemberCoachDrafts", {
      communityId,
      memberUserId: mayaId,
      reason: "quiet_member",
      dedupeKey: "quiet_member:2026-11",
      signalSummary: "Quiet for 20 days",
      status: "waiting",
      text: "Hey Maya, hope you're well!",
      createdAt: nowMs - 4 * HOUR_MS,
      updatedAt: nowMs - 4 * HOUR_MS,
    });
    await ctx.db.insert("communityMemberCoachDrafts", {
      communityId,
      memberUserId: rashidId,
      reason: "course_stall",
      dedupeKey: "course_stall:1",
      signalSummary: "Paused before Lesson 2",
      status: "sent",
      deliveryMode: "auto",
      text: "Ready for Lesson 2?",
      sentText: "Ready for Lesson 2?",
      sentAt: nowMs - 6 * HOUR_MS,
      createdAt: nowMs - 6 * HOUR_MS,
      updatedAt: nowMs - 6 * HOUR_MS,
    });
    const qRoot = await ctx.db.insert("communityInteractionRoots", {
      communityId,
      channelId: generalId,
      actorType: "human",
      actorUserId: rashidId,
      kind: "question",
      visibilityScope: "community",
      status: "live",
      contentSummary: "How do I launch?",
      replyCount: 1,
      reactionSummary: [],
      idempotencyKey: "q-auto-1",
      createdAt: nowMs - 30 * HOUR_MS,
      updatedAt: nowMs - 5 * HOUR_MS,
    });
    await ctx.db.insert("communityReplyDrafts", {
      communityId,
      rootId: qRoot,
      channelId: generalId,
      status: "posted",
      deliveryMode: "auto",
      text: "Start with Lesson 1.",
      postedText: "Start with Lesson 1.",
      createdAt: nowMs - 5 * HOUR_MS,
      updatedAt: nowMs - 5 * HOUR_MS,
    });

    return { communityId, ownerId, rashidId, mayaId, samId };
  });
}

test("Chief of Staff signals populate Founder Brief and builder analytics without leaking private pod text or exposing to members", async () => {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const w = await seedChiefOfStaffWorld(t, nowMs);

  // 1. Founder Brief snapshot includes all 5 Chief of Staff signals.
  const briefRead: any = await t.query(internal.communityFounderBrief.readFounderBriefSnapshotInternal, {
    communityId: w.communityId,
    windowStartMs: nowMs - DAY_MS,
    nowMs,
  });
  expect(briefRead).toBeTruthy();
  const cos = briefRead.snapshot.chiefOfStaff;
  expect(cos).toMatchObject({
    proactiveGuide: {
      coachDraftsWaiting: 1,
      replyDraftsWaiting: 0,
      coachSentInWindow: 1,
      repliesAutoPostedInWindow: 1,
    },
    stalledLearners: [{ course: "Launch Playbook", stalledCount: 1, sampleNames: ["Rashid"] }],
    quietPayingMembers: { count: 1, names: ["Maya"] },
    risingContributors: [{ name: "Rashid", posts: 4, replies: 0 }],
    podHealth: [{ name: "Shippers Pod", seats: 1, messages7d: 3 }],
  });
  // Private pod message content MUST NEVER appear anywhere in the snapshot or rendered brief!
  expect(JSON.stringify(briefRead)).not.toContain("PRIVATE POD SECRET TEXT");
  expect(snapshotIsQuiet(briefRead.snapshot)).toBe(false);

  const brief = deterministicBrief(briefRead.snapshot);
  const md = briefMarkdown(brief);
  expect(md).toContain("Your guide suggests: 1 member check-in ready on Home.");
  expect(md).toContain("Sent 1 private member check-in.");
  expect(md).toContain("Auto-replied to 1 unanswered question.");
  expect(md).toContain("1 paying member quiet 14+ days: Maya.");
  expect(md).toContain("1 learner stalled in Launch Playbook: Rashid.");
  expect(md).toContain("Rising contributors this week: Rashid");
  expect(md).toContain("Pods: Shippers Pod (1 seats, 3 msgs/7d).");

  // 2. Owner/Admin builder/analytics.json exposes the exact same live Chief of Staff summary.
  const analytics: any = await t.query(internal.communityAdmin.readCommunityAnalyticsForTrustedManagerInternal, {
    communityId: w.communityId,
    userId: w.ownerId,
  });
  expect(analytics.chief_of_staff).toMatchObject({
    waiting_approvals: { member_check_ins: 1, reply_drafts: 0 },
    guide_activity_7d: { check_ins_sent: 1, replies_auto_posted: 1 },
    quiet_paying_members: { count: 1, names: ["Maya"] },
    pod_health: [{ name: "Shippers Pod", seats: 1, messages_7d: 3 }],
  });
  expect(JSON.stringify(analytics)).not.toContain("PRIVATE POD SECRET TEXT");

  // 3. Member Home snapshot NEVER includes chiefOfStaff or founder-only fields; non-managers refused on analytics.
  const memberHome: any = await t.withIdentity({ subject: "rashid" }).query(
    api.communityFounderBrief.getCommunityMemberHomeSnapshot,
    { communityId: w.communityId },
  );
  expect(memberHome).not.toHaveProperty("chiefOfStaff");
  expect(JSON.stringify(memberHome)).not.toContain("Maya");
  await expect(
    t.query(internal.communityAdmin.readCommunityAnalyticsForTrustedManagerInternal, {
      communityId: w.communityId,
      userId: w.rashidId,
    }),
  ).rejects.toThrow(/community_forbidden/);
});
