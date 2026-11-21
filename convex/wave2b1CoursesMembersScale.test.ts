/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.UTC(2026, 10, 21, 17, 0, 0);
const DAY = 86_400_000;

async function seedWorld(t: any) {
  return await t.run(async (ctx: any) => {
    const mkUser = (subject: string, name: string, handle: string) =>
      ctx.db.insert("users", {
        authSubject: subject,
        displayName: name,
        handle,
        normalizedHandle: handle,
        createdAt: NOW,
        updatedAt: NOW,
      });
    const ownerId = await mkUser("w2b1-owner", "Host Alice", "hostalice");
    const aliceId = await mkUser("w2b1-alice", "Student Alice", "studentalice");
    const bobId = await mkUser("w2b1-bob", "Student Bob", "studentbob");
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "w2b1-academy",
      name: "Wave 2B-1 Academy",
      lifecycleStatus: "active",
      lifecycleGeneration: 0,
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 3,
      createdAt: NOW - 30 * DAY,
      updatedAt: NOW,
    });
    const otherCommunityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "w2b1-other",
      name: "Other Academy",
      lifecycleStatus: "active",
      lifecycleGeneration: 0,
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 2,
      createdAt: NOW - 30 * DAY,
      updatedAt: NOW,
    });
    const aliceMembershipId = await ctx.db.insert("communityMemberships", {
      communityId,
      userId: aliceId,
      role: "member",
      accessSource: "free_grant",
      state: "active",
      activationSequence: 1,
      activatedAt: NOW - 5 * DAY,
      createdAt: NOW - 5 * DAY,
      updatedAt: NOW,
    });
    const bobMembershipId = await ctx.db.insert("communityMemberships", {
      communityId,
      userId: bobId,
      role: "member",
      accessSource: "free_grant",
      state: "active",
      activationSequence: 1,
      activatedAt: NOW - 4 * DAY,
      createdAt: NOW - 4 * DAY,
      updatedAt: NOW,
    });
    await ctx.db.insert("communityMemberships", {
      communityId: otherCommunityId,
      userId: aliceId,
      role: "member",
      accessSource: "free_grant",
      state: "active",
      activationSequence: 1,
      activatedAt: NOW - 5 * DAY,
      createdAt: NOW - 5 * DAY,
      updatedAt: NOW,
    });
    const moduleId = await ctx.db.insert("communityResourceModules", {
      communityId,
      createdByUserId: ownerId,
      status: "live",
      name: "Core Foundations",
      sortOrder: 1000,
      progressIndexedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const otherModuleId = await ctx.db.insert("communityResourceModules", {
      communityId: otherCommunityId,
      createdByUserId: ownerId,
      status: "live",
      name: "Other Course",
      sortOrder: 1000,
      progressIndexedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const lesson1Id = await ctx.db.insert("communityResources", {
      communityId,
      moduleId,
      createdByUserId: ownerId,
      type: "post",
      role: "page",
      status: "published",
      title: "Lesson One",
      bodyChars: 42,
      pinned: false,
      sortOrder: 1000,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await ctx.db.insert("communityResourceContents", {
      communityId,
      resourceId: lesson1Id,
      bodyMd: "# Lesson One\nFull body text for lesson one.",
      bodyChars: 42,
      bodyHash: "w2b1-lesson-1-hash",
      createdAt: NOW,
      updatedAt: NOW,
    });
    const lesson2Id = await ctx.db.insert("communityResources", {
      communityId,
      moduleId,
      createdByUserId: ownerId,
      type: "post",
      role: "page",
      status: "published",
      title: "Lesson Two",
      bodyChars: 42,
      pinned: false,
      sortOrder: 2000,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await ctx.db.insert("communityResourceContents", {
      communityId,
      resourceId: lesson2Id,
      bodyMd: "# Lesson Two\nFull body text for lesson two.",
      bodyChars: 42,
      bodyHash: "w2b1-lesson-2-hash",
      createdAt: NOW,
      updatedAt: NOW,
    });
    const otherLessonId = await ctx.db.insert("communityResources", {
      communityId: otherCommunityId,
      moduleId: otherModuleId,
      createdByUserId: ownerId,
      type: "post",
      role: "page",
      status: "published",
      title: "Other Lesson",
      bodyChars: 20,
      pinned: false,
      sortOrder: 1000,
      createdAt: NOW,
      updatedAt: NOW,
    });
    return {
      ownerId,
      aliceId,
      bobId,
      communityId,
      otherCommunityId,
      aliceMembershipId,
      bobMembershipId,
      moduleId,
      lesson1Id,
      lesson2Id,
      otherLessonId,
    };
  });
}

describe("Wave 2B-1 Courses, Resources, and Members Admin scalability", () => {
  it("tracks per-student course progress via communityCourseProgress, handles unchecks/hides, and backfills legacy modules", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const asOwner = t.withIdentity({ subject: "w2b1-owner" });
    const asAlice = t.withIdentity({ subject: "w2b1-alice" });
    const asBob = t.withIdentity({ subject: "w2b1-bob" });

    // Mark lessons across two communities; by_community_user returns only the current community.
    await asAlice.mutation(api.communityLessonProgress.setMyLessonDone, {
      communityId: w.communityId,
      resourceId: String(w.lesson1Id),
      done: true,
    });
    await asAlice.mutation(api.communityLessonProgress.setMyLessonDone, {
      communityId: w.communityId,
      resourceId: String(w.lesson2Id),
      done: true,
    });
    await asAlice.mutation(api.communityLessonProgress.setMyLessonDone, {
      communityId: w.otherCommunityId,
      resourceId: String(w.otherLessonId),
      done: true,
    });
    await asBob.mutation(api.communityLessonProgress.setMyLessonDone, {
      communityId: w.communityId,
      resourceId: String(w.lesson1Id),
      done: true,
    });

    const aliceProg = await asAlice.query(api.communityLessonProgress.getMyLessonProgress, {
      communityId: w.communityId,
    });
    expect(aliceProg.done.map((r: any) => r.resource_id).sort()).toEqual(
      [String(w.lesson1Id), String(w.lesson2Id)].sort(),
    );

    // Projection row exists and feeds getCourseProgressSummary + getCourseProgressPeople accurately.
    const summary: any = await asOwner.query(api.communityLessonProgress.getCourseProgressSummary, {
      communityId: w.communityId,
    });
    expect(summary.courses).toEqual([{ module_id: String(w.moduleId), lessons: 2, started: 2, finished: 1 }]);

    // Unchecking the latest lesson recalculates last_lesson accurately on the projection.
    await asAlice.mutation(api.communityLessonProgress.setMyLessonDone, {
      communityId: w.communityId,
      resourceId: String(w.lesson2Id),
      done: false,
    });
    const peopleAfterUncheck: any = await asOwner.query(api.communityLessonProgress.getCourseProgressPeople, {
      communityId: w.communityId,
      moduleId: w.moduleId,
    });
    expect(peopleAfterUncheck).toMatchObject({ lessons: 2, started: 2, finished: 0 });
    expect(peopleAfterUncheck.people.find((p: any) => p.handle === "studentalice")?.last_lesson).toBe("Lesson One");

    // Hiding a lesson (bodyChars = 0) immediately reflects in the indexed read without rebuilding projections.
    await t.run(async (ctx) => {
      await ctx.db.patch(w.lesson2Id, { bodyChars: 0 });
    });
    const summaryAfterHide: any = await asOwner.query(api.communityLessonProgress.getCourseProgressSummary, {
      communityId: w.communityId,
    });
    expect(summaryAfterHide.courses).toEqual([{ module_id: String(w.moduleId), lessons: 1, started: 2, finished: 2 }]);

    // Legacy module without progressIndexedAt gets swept and backfilled cleanly.
    await t.run(async (ctx) => {
      await ctx.db.patch(w.moduleId, { progressIndexedAt: undefined });
      for (const row of await ctx.db.query("communityCourseProgress").collect()) {
        await ctx.db.delete(row._id);
      }
    });
    const sweep: any = await t.mutation(internal.communityLessonProgress.sweepUnindexedCourseProgressInternal, {});
    expect(sweep.scheduled).toBeGreaterThanOrEqual(1);
    await t.mutation(internal.communityLessonProgress.backfillCourseProgressModuleBatchInternal, {
      moduleId: w.moduleId,
      lessonIndex: 0,
      cursor: null,
    });
    await t.mutation(internal.communityLessonProgress.backfillCourseProgressModuleBatchInternal, {
      moduleId: w.moduleId,
      lessonIndex: 1,
      cursor: null,
    });
    const modAfterBackfill: any = await t.run((ctx) => ctx.db.get(w.moduleId));
    expect(typeof modAfterBackfill.progressIndexedAt).toBe("number");
  });

  it("hydrates listCommunityResources with pre-populated module names and full split bodies in parallel chunks", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const asAlice = t.withIdentity({ subject: "w2b1-alice" });

    const withBodies: any[] = await asAlice.query(api.communityResources.listCommunityResources, {
      communityId: w.communityId,
    });
    expect(withBodies).toHaveLength(2);
    expect(withBodies[0].body_md).toContain("Full body text");
    expect(withBodies[0].directory_path).toContain("core-foundations");
    expect(withBodies[1].title).toBe("Lesson Two");
    expect(withBodies[1].body_md).toContain("lesson two");
  });

  it("reads member audit history via subject index and keeps pre-computed member view counts accurate and stale-aware", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const asOwner = t.withIdentity({ subject: "w2b1-owner" });

    // Seed an audit event for Alice, then bury it under 450 unrelated audit events.
    await t.run(async (ctx) => {
      await ctx.db.insert("criticalAuditEvents", {
        eventKey: "w2b1-alice-role",
        eventType: "community_member_role_set",
        severity: "info",
        status: "succeeded",
        actorUserId: w.ownerId,
        subjectUserId: w.aliceId,
        communityId: w.communityId,
        provider: "polynet",
        metadata: { role: "moderator" },
        createdAt: NOW - 10_000,
      });
      for (let i = 0; i < 450; i += 1) {
        await ctx.db.insert("criticalAuditEvents", {
          eventKey: `w2b1-noise-${i}`,
          eventType: "community_member_role_set",
          severity: "info",
          status: "succeeded",
          actorUserId: w.ownerId,
          subjectUserId: w.bobId,
          communityId: w.communityId,
          provider: "polynet",
          metadata: { role: "member" },
          createdAt: NOW - 5_000 + i,
        });
      }
    });

    // Indexed subject lookup finds Alice's action even though > 400 newer community events exist.
    const aliceRecord: any = await asOwner.query(api.communityMemberRecords.getCommunityMemberRecord, {
      communityId: w.communityId,
      membershipId: w.aliceMembershipId,
    });
    expect(aliceRecord.events.map((e: any) => e.text)).toContain("Made a moderator by you");

    // Pre-computed communityMemberViewCounts matches live summary exactly.
    const liveSummary: any = await asOwner.query(api.communityMemberRecords.getCommunityMemberSummary, {
      communityId: w.communityId,
    });
    await t.mutation(internal.communityMemberRecords.recomputeCommunityMemberViewCountsBatchInternal, {
      communityId: w.communityId,
      cursor: null,
      startedAt: NOW,
    });
    const cachedSummary: any = await asOwner.query(api.communityMemberRecords.getCommunityMemberSummary, {
      communityId: w.communityId,
    });
    expect(cachedSummary).toEqual(liveSummary);

    // Blocking Bob marks the pre-computed view counts stale immediately so the live fallback stays accurate.
    await asOwner.mutation(internal.communityAdmin.blockCommunityUserInternal, {
      userId: w.ownerId,
      communityId: w.communityId,
      targetUserId: w.bobId,
      reason: "spam",
    });
    const staleRow: any = await t.run((ctx) =>
      ctx.db
        .query("communityMemberViewCounts")
        .withIndex("by_community", (q: any) => q.eq("communityId", w.communityId))
        .first(),
    );
    expect(typeof staleRow?.staleAt).toBe("number");

    const afterBlockSummary: any = await asOwner.query(api.communityMemberRecords.getCommunityMemberSummary, {
      communityId: w.communityId,
    });
    expect(afterBlockSummary.counts.everyone).toBe(liveSummary.counts.everyone - 1);
    expect(afterBlockSummary.counts.past).toBe(liveSummary.counts.past + 1);
  });
});
