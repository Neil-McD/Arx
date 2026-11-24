/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { resolveSelfCommunityMembershipContext } from "./communityMembershipContextCore";
import { renderCommunityMemberSelfContext } from "../shared/communityMemberSelfContext";
import { buildPlatformHarnessRuntimePromptBundle } from "../shared/runtimePrompt";
import { buildCommunityAgentServePromptBundle } from "../shared/communityAgentServePrompt";
import { buildRuntimeTurnContextPacket } from "../shared/runtimeTurnContextPacket";
import { talkToolNames, type TalkLens } from "../shared/lens";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);

async function seedOntologyWorld(t: any) {
  const now = Date.now();
  return await t.run(async (ctx: any) => {
    const insertUser = (subject: string, name: string, handle: string) =>
      ctx.db.insert("users", {
        authSubject: subject,
        displayName: name,
        handle,
        normalizedHandle: handle,
        createdAt: now - 10_000,
        updatedAt: now - 10_000,
      });

    const ownerId = await insertUser("owner", "Neil", "neil");
    const adminId = await insertUser("admin", "Priya", "priya");
    const modId = await insertUser("mod", "Lee", "lee");
    const rashidId = await insertUser("rashid", "Rashid", "rashid");
    const mayaId = await insertUser("maya", "Maya", "maya");
    const leftId = await insertUser("gone", "Gone", "gone");

    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "builders-club",
      name: "Builders Club",
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 5,
      createdAt: now - 10_000,
      updatedAt: now - 10_000,
    });

    const join = (userId: any, role: "admin" | "moderator" | "member", state: "active" | "left" = "active", activationSequence = 1) =>
      ctx.db.insert("communityMemberships", {
        communityId,
        userId,
        role,
        accessSource: "free_grant",
        state,
        activationSequence,
        activatedAt: now - 5_000,
        createdAt: now - 5_000,
        updatedAt: now - 5_000,
      });

    await join(adminId, "admin");
    await join(modId, "moderator");
    const rashidMembershipId = await join(rashidId, "member", "active", 2);
    const mayaMembershipId = await join(mayaId, "member", "active", 1);
    await join(leftId, "member", "left", 1);

    await ctx.db.insert("communityMemberNotes", {
      communityId,
      subjectUserId: rashidId,
      authorUserId: ownerId,
      body: "Check in before Friday demo.",
      createdAt: now - 1_000,
      updatedAt: now - 1_000,
    });

    // Live course with 3 published lessons + 1 draft course (must never show).
    const liveCourseId = await ctx.db.insert("communityResourceModules", {
      communityId,
      createdByUserId: ownerId,
      status: "live",
      name: "Launch Playbook",
      sortOrder: 1,
      createdAt: now - 8_000,
      updatedAt: now - 8_000,
    });
    const draftCourseId = await ctx.db.insert("communityResourceModules", {
      communityId,
      createdByUserId: ownerId,
      status: "draft",
      name: "Unpublished Course",
      sortOrder: 2,
      createdAt: now - 7_000,
      updatedAt: now - 7_000,
    });

    const insertLesson = (moduleId: any, title: string, sortOrder: number, status = "published") =>
      ctx.db.insert("communityResources", {
        communityId,
        moduleId,
        createdByUserId: ownerId,
        type: "post",
        role: "page",
        status,
        title,
        bodyChars: 42,
        pinned: false,
        sortOrder,
        createdAt: now - 6_000 + sortOrder * 10,
        updatedAt: now - 6_000 + sortOrder * 10,
      });

    const l1 = await insertLesson(liveCourseId, "Step 1: Define the niche", 1);
    const l2 = await insertLesson(liveCourseId, "Step 2: First 10 members", 2);
    const l3 = await insertLesson(liveCourseId, "Step 3: Weekly rhythm", 3);
    const draftLesson = await insertLesson(draftCourseId, "Secret draft lesson", 1);

    // Seed draft lesson row for Rashid to prove draft courses never leak.
    await ctx.db.insert("communityLessonProgress", {
      communityId,
      userId: rashidId,
      resourceId: draftLesson,
      completedAt: now - 500,
    });
    // Left member progress must not count in owner analytics.
    await ctx.db.insert("communityLessonProgress", {
      communityId,
      userId: leftId,
      resourceId: l1,
      completedAt: now - 500,
    });

    // Restricted pods:
    // 1. "shippers": Rashid has active valid seat (activationSequence 2), owner is host, Maya does NOT.
    // 2. "vip": Maya has an old revoked/stale seat (activationSequence 0), Rashid is NOT in it.
    const shippersChannelId = await ctx.db.insert("communityChannels", {
      communityId,
      slug: "shippers",
      name: "Shippers Pod",
      accessMode: "restricted",
      postingPolicy: "members",
      replyPolicy: "members",
      status: "active",
      position: 1,
      createdByUserId: ownerId,
      createdAt: now - 5_000,
      updatedAt: now - 5_000,
    });
    await ctx.db.insert("communityPods", {
      communityId,
      channelId: shippersChannelId,
      purpose: "Weekly shipping accountability",
      visibility: "hidden",
      hostUserIds: [ownerId],
      createdAt: now - 5_000,
      updatedAt: now - 5_000,
    });
    await ctx.db.insert("communityChannelParticipants", {
      communityId,
      channelId: shippersChannelId,
      principalKey: `user:${String(rashidId)}`,
      membershipId: rashidMembershipId,
      membershipActivationSequence: 2,
      status: "active",
      reasons: ["host"],
      createdByUserId: ownerId,
      createdAt: now - 4_000,
      updatedAt: now - 4_000,
    });

    const vipChannelId = await ctx.db.insert("communityChannels", {
      communityId,
      slug: "vip",
      name: "VIP Founders",
      accessMode: "restricted",
      postingPolicy: "members",
      replyPolicy: "members",
      status: "active",
      position: 2,
      createdByUserId: ownerId,
      createdAt: now - 5_000,
      updatedAt: now - 5_000,
    });
    await ctx.db.insert("communityPods", {
      communityId,
      channelId: vipChannelId,
      purpose: "Private VIP pod",
      visibility: "hidden",
      hostUserIds: [],
      createdAt: now - 5_000,
      updatedAt: now - 5_000,
    });
    // Stale activation sequence seat for Maya — must fail closed.
    await ctx.db.insert("communityChannelParticipants", {
      communityId,
      channelId: vipChannelId,
      principalKey: `user:${String(mayaId)}`,
      membershipId: mayaMembershipId,
      membershipActivationSequence: 0,
      status: "active",
      reasons: ["host"],
      createdByUserId: ownerId,
      createdAt: now - 4_000,
      updatedAt: now - 4_000,
    });

    // Events:
    // 1. Pod call inside Shippers Pod (must ONLY show inside Rashid/Owner's pod summary, NEVER in community-wide events or Maya's context).
    // 2. Upcoming one-off community event.
    // 3. Recurring weekly community event that began 7 days ago (must expand into upcoming_events).
    // 4. Cancelled community event (must NOT show).
    const day = 24 * 60 * 60 * 1000;
    await ctx.db.insert("communityEvents", {
      communityId,
      createdByUserId: ownerId,
      podChannelId: shippersChannelId,
      title: "Shippers Friday Demo",
      startsAt: now + 2 * day,
      endsAt: now + 2 * day + 3_600_000,
      timezone: "America/New_York",
      locationType: "online",
      visibility: "members",
      status: "live",
      createdAt: now - 3_000,
      updatedAt: now - 3_000,
    });
    await ctx.db.insert("communityEvents", {
      communityId,
      createdByUserId: ownerId,
      title: "Monthly Town Hall",
      startsAt: now + 3 * day,
      endsAt: now + 3 * day + 3_600_000,
      timezone: "America/New_York",
      locationType: "online",
      visibility: "members",
      status: "live",
      createdAt: now - 3_000,
      updatedAt: now - 3_000,
    });
    await ctx.db.insert("communityEvents", {
      communityId,
      createdByUserId: ownerId,
      title: "Weekly Office Hours",
      startsAt: now - 6 * day,
      endsAt: now - 6 * day + 3_600_000,
      timezone: "UTC",
      locationType: "online",
      visibility: "members",
      status: "live",
      recurrenceFrequency: "weekly",
      recurrenceInterval: 1,
      createdAt: now - 7 * day,
      updatedAt: now - 7 * day,
    });
    await ctx.db.insert("communityEvents", {
      communityId,
      createdByUserId: ownerId,
      title: "Cancelled Workshop",
      startsAt: now + day,
      endsAt: now + day + 3_600_000,
      timezone: "UTC",
      locationType: "online",
      visibility: "members",
      status: "cancelled",
      createdAt: now - 3_000,
      updatedAt: now - 3_000,
    });

    return {
      communityId,
      ownerId,
      adminId,
      modId,
      rashidId,
      mayaId,
      liveCourseId,
      l1,
      l2,
      l3,
    };
  });
}

test("member self-context includes own course progress, own pods with next call, and upcoming community events without leaking restricted pods or draft courses", async () => {
  const t = convexTest(schema, modules);
  const w = await seedOntologyWorld(t);

  // Rashid completes lessons 1 & 2; Maya completes all 3.
  const rashid = t.withIdentity({ subject: "rashid" });
  const maya = t.withIdentity({ subject: "maya" });
  await rashid.mutation(api.communityLessonProgress.setMyLessonDone, { communityId: w.communityId, resourceId: w.l1, done: true });
  await rashid.mutation(api.communityLessonProgress.setMyLessonDone, { communityId: w.communityId, resourceId: w.l2, done: true });
  await maya.mutation(api.communityLessonProgress.setMyLessonDone, { communityId: w.communityId, resourceId: w.l1, done: true });
  await maya.mutation(api.communityLessonProgress.setMyLessonDone, { communityId: w.communityId, resourceId: w.l2, done: true });
  await maya.mutation(api.communityLessonProgress.setMyLessonDone, { communityId: w.communityId, resourceId: w.l3, done: true });

  const rashidCtx = await t.run((ctx: any) =>
    resolveSelfCommunityMembershipContext({ ctx, actorUserId: w.rashidId, communityId: w.communityId }),
  );
  expect(rashidCtx.course_progress).toHaveLength(1);
  expect(rashidCtx.course_progress![0]).toMatchObject({
    course_id: String(w.liveCourseId),
    title: "Launch Playbook",
    done: 2,
    of: 3,
    finished: false,
    next_lesson: { id: String(w.l3), title: "Step 3: Weekly rhythm" },
  });
  expect(rashidCtx.course_progress![0]!.last_done_at).toBeTruthy();
  expect(rashidCtx.pods).toHaveLength(1);
  expect(rashidCtx.pods![0]).toMatchObject({
    slug: "shippers",
    name: "Shippers Pod",
    is_host: false,
    next_call: { title: "Shippers Friday Demo" },
  });
  const rashidEventTitles = (rashidCtx.upcoming_events ?? []).map((e) => e.title);
  expect(rashidEventTitles).toContain("Monthly Town Hall");
  expect(rashidEventTitles).toContain("Weekly Office Hours");
  expect(rashidEventTitles).not.toContain("Shippers Friday Demo");
  expect(rashidEventTitles).not.toContain("Cancelled Workshop");

  const renderedRashid = renderCommunityMemberSelfContext(rashidCtx);
  expect(renderedRashid.truncated).toBe(false);
  expect(renderedRashid.body).toContain("Launch Playbook");
  expect(renderedRashid.body).toContain("Step 3: Weekly rhythm");
  expect(renderedRashid.body).toContain("Shippers Pod");
  expect(renderedRashid.body).not.toContain("Unpublished Course");
  expect(renderedRashid.body).not.toContain("VIP Founders");

  // Maya finished all 3 lessons and has NO valid pod seats (stale VIP seat fails closed; Shippers Pod stays hidden).
  const mayaCtx = await t.run((ctx: any) =>
    resolveSelfCommunityMembershipContext({ ctx, actorUserId: w.mayaId, communityId: w.communityId }),
  );
  expect(mayaCtx.course_progress).toHaveLength(1);
  expect(mayaCtx.course_progress![0]).toMatchObject({
    title: "Launch Playbook",
    done: 3,
    of: 3,
    finished: true,
    next_lesson: null,
  });
  expect(mayaCtx.pods).toEqual([]);
  expect(JSON.stringify(mayaCtx)).not.toContain("Shippers");
  expect(JSON.stringify(mayaCtx)).not.toContain("VIP Founders");

  // Owner sees only pods they host ("Shippers Pod"), not unrelated unhosted pods ("VIP Founders").
  const ownerCtx = await t.run((ctx: any) =>
    resolveSelfCommunityMembershipContext({ ctx, actorUserId: w.ownerId, communityId: w.communityId }),
  );
  expect(ownerCtx.pods?.map((p) => p.slug)).toEqual(["shippers"]);
  expect(ownerCtx.pods?.[0]?.is_host).toBe(true);
});

test("three-lens privacy matrix: course_progress appears only for self and builder lenses, never for other members, moderators, or public community agent", async () => {
  const t = convexTest(schema, modules);
  const w = await seedOntologyWorld(t);

  const rashid = t.withIdentity({ subject: "rashid" });
  await rashid.mutation(api.communityLessonProgress.setMyLessonDone, { communityId: w.communityId, resourceId: w.l1, done: true });
  await rashid.mutation(api.communityLessonProgress.setMyLessonDone, { communityId: w.communityId, resourceId: w.l2, done: true });

  // 1. Another member reading Rashid -> NO course_progress, NO notes, NO plan.
  const memberView: any = await t.query(internal.communityPersonFacts.readPersonFactsInternal, {
    communityId: w.communityId,
    lensFamily: "member",
    viewerUserId: w.mayaId,
    handle: "rashid",
  });
  expect(memberView.lens).toBe("member");
  expect(memberView).not.toHaveProperty("course_progress");
  expect(memberView).not.toHaveProperty("notes");
  expect(memberView).not.toHaveProperty("plan");

  // 2. Moderator reading Rashid (moderator maps to lensFamily "member") -> NO course_progress.
  const modView: any = await t.query(internal.communityPersonFacts.readPersonFactsInternal, {
    communityId: w.communityId,
    lensFamily: "member",
    viewerUserId: w.modId,
    handle: "rashid",
  });
  expect(modView.lens).toBe("member");
  expect(modView).not.toHaveProperty("course_progress");

  // 3. Public Community Agent reading Rashid — EVEN if viewerUserId === rashidId -> ALWAYS member lens, NO course_progress.
  const publicAgentView: any = await t.query(internal.communityPersonFacts.readPersonFactsInternal, {
    communityId: w.communityId,
    lensFamily: "community",
    viewerUserId: w.rashidId,
    handle: "rashid",
  });
  expect(publicAgentView.lens).toBe("member");
  expect(publicAgentView).not.toHaveProperty("course_progress");
  expect(publicAgentView).not.toHaveProperty("joined_at");

  // 4. Rashid reading themselves -> self lens WITH own course_progress, still NO host notes/plan.
  const selfView: any = await t.query(internal.communityPersonFacts.readPersonFactsInternal, {
    communityId: w.communityId,
    lensFamily: "member",
    viewerUserId: w.rashidId,
    handle: "rashid",
  });
  expect(selfView.lens).toBe("self");
  expect(selfView.course_progress).toEqual([
    expect.objectContaining({
      course_id: String(w.liveCourseId),
      title: "Launch Playbook",
      done: 2,
      of: 3,
      finished: false,
      next_lesson: { id: String(w.l3), title: "Step 3: Weekly rhythm" },
    }),
  ]);
  expect(selfView).not.toHaveProperty("notes");
  expect(selfView).not.toHaveProperty("plan");

  // 5. Owner / Admin reading Rashid -> builder lens WITH course_progress, plan, state, and host notes.
  const builderView: any = await t.query(internal.communityPersonFacts.readPersonFactsInternal, {
    communityId: w.communityId,
    lensFamily: "builder",
    viewerUserId: w.ownerId,
    handle: "rashid",
  });
  expect(builderView.lens).toBe("builder");
  expect(builderView.course_progress).toHaveLength(1);
  expect(builderView.course_progress[0]).toMatchObject({ title: "Launch Playbook", done: 2, of: 3, finished: false });
  expect(builderView.notes).toEqual([expect.objectContaining({ body: "Check in before Friday demo." })]);
  expect(builderView.plan).toBe("Free");
  expect(JSON.stringify(builderView)).not.toContain("Unpublished Course");
});

test("owner analytics includes live community-wide course pulse and fails closed for non-managers", async () => {
  const t = convexTest(schema, modules);
  const w = await seedOntologyWorld(t);

  const rashid = t.withIdentity({ subject: "rashid" });
  const maya = t.withIdentity({ subject: "maya" });
  await rashid.mutation(api.communityLessonProgress.setMyLessonDone, { communityId: w.communityId, resourceId: w.l1, done: true });
  await maya.mutation(api.communityLessonProgress.setMyLessonDone, { communityId: w.communityId, resourceId: w.l1, done: true });
  await maya.mutation(api.communityLessonProgress.setMyLessonDone, { communityId: w.communityId, resourceId: w.l2, done: true });
  await maya.mutation(api.communityLessonProgress.setMyLessonDone, { communityId: w.communityId, resourceId: w.l3, done: true });

  const ownerAnalytics: any = await t.query(internal.communityAdmin.readCommunityAnalyticsForTrustedManagerInternal, {
    communityId: w.communityId,
    userId: w.ownerId,
  });
  expect(ownerAnalytics.courses).toEqual([
    {
      id: String(w.liveCourseId),
      title: "Launch Playbook",
      lessons: 3,
      started: 2,
      finished: 1,
    },
  ]);

  const adminAnalytics: any = await t.query(internal.communityAdmin.readCommunityAnalyticsForTrustedManagerInternal, {
    communityId: w.communityId,
    userId: w.adminId,
  });
  expect(adminAnalytics.courses).toEqual(ownerAnalytics.courses);

  // Members and moderators are refused.
  await expect(
    t.query(internal.communityAdmin.readCommunityAnalyticsForTrustedManagerInternal, {
      communityId: w.communityId,
      userId: w.rashidId,
    }),
  ).rejects.toThrow(/community_forbidden/);
  await expect(
    t.query(internal.communityAdmin.readCommunityAnalyticsForTrustedManagerInternal, {
      communityId: w.communityId,
      userId: w.modId,
    }),
  ).rejects.toThrow(/community_forbidden/);
});

test("three-way self-orientation prompts distinguish member companion, founder chief of staff, and public community agent privacy rules", () => {
  const buildBundle = (talk: TalkLens) =>
    buildPlatformHarnessRuntimePromptBundle({
      allowedToolNames: talkToolNames(talk),
      invocationSurface: "member_agent_dock",
      communityId: "c1",
      communityName: "Builders Club",
      communitySlug: "builders-club",
      communityOneLiner: "Build together.",
      communityAbout: "A community for builders.",
      communityLens: talk,
      runtimeTurnContext: buildRuntimeTurnContextPacket({}),
      currentDateTimeIso: "2026-11-24T16:00:00.000Z",
      currentDateLabel: "Tuesday, November 24, 2026 at 11:00:00 AM EST",
      currentTimeZone: "America/New_York",
      currentTimeZoneIsCommunity: true,
      communityAgentSurfaceContext: { version: 1, kind: "community", community_slug: "builders-club", section: "agent" },
      personalMemoryMd: null,
    });

  const memberPrompt = buildBundle({ lens: "member_private", relation: "member" }).text;
  const ownerPrompt = buildBundle({ lens: "builder_private", relation: "owner", timeZone: "America/New_York" }).text;

  expect(memberPrompt).toContain("Focus on this person: their goals, course progress, pods, and next steps here.");
  expect(memberPrompt).toContain("course progress, pods, events, private memory");
  expect(ownerPrompt).toContain("Focus on helping them run the community: course progress, where members stall, and drafts to approve.");
  expect(ownerPrompt).toContain("each member's file also shows their course progress");

  const publicPrompt = buildCommunityAgentServePromptBundle({
    community: { name: "Builders Club", slug: "builders-club", oneLiner: "Build together.", about: "A community for builders." },
    agent: { displayName: "Builders Club Guide" },
    threadContext: { rendered: "Rashid: @guide where is everyone in the course?" },
  }).systemPromptBundle.text;
  expect(publicPrompt).toContain("Never share or guess anyone's private course progress, goals, or private talks.");
});
