// Lesson progress: which lessons a member has marked done. Private to that
// member: only reads made for them (their site, their MCP harness, their Ask)
// see it, and only the member's own tools change it (community.lesson.set_done).
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import {
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
  normalizeIdValue,
  requireCommunityChatAccess,
  requireCommunityManager,
} from "./communityCore";

const MAX_REFS_PER_READ = 200;

function lessonIdFromRef(ctx: any, ref: string) {
  const match = /^resource:([A-Za-z0-9]+)$/.exec(String(ref ?? "").trim());
  return match ? ctx.db.normalizeId("communityResources", match[1]) : null;
}

// A lesson the member can mark: a live page in a live course of this community.
async function liveLesson(ctx: any, communityId: any, resourceId: any) {
  const lesson = await ctx.db.get(resourceId);
  if (!lesson || normalizeIdValue(lesson.communityId) !== normalizeIdValue(communityId) || !lesson.moduleId) return null;
  const module = await ctx.db.get(lesson.moduleId);
  if (!module || !communityResourceModuleIsLive(module)) return null;
  return communityResourceIsLiveModulePage(lesson, new Set([normalizeIdValue(module._id)])) ? lesson : null;
}

export const setLessonDoneInternal = internalMutation({
  args: { communityId: v.id("communities"), userId: v.id("users"), ref: v.string(), done: v.boolean() },
  handler: async (ctx, args) => {
    // Checked again here, in the write's own transaction: access revoked since
    // the door authorized the call stops the write.
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: args.userId });
    const resourceId = lessonIdFromRef(ctx, args.ref);
    if (!resourceId || !(await liveLesson(ctx, args.communityId, resourceId))) {
      return { ok: false as const, code: "lesson_not_found", message: "That lesson isn't available. List a course under resources/ for its lessons." };
    }
    const existing = await ctx.db.query("communityLessonProgress")
      .withIndex("by_user_resource", (q) => q.eq("userId", args.userId).eq("resourceId", resourceId)).first();
    // Setting (not toggling) makes a retry safe without a receipt.
    if (args.done && !existing) {
      await ctx.db.insert("communityLessonProgress", { communityId: args.communityId, userId: args.userId, resourceId, completedAt: Date.now() });
    } else if (!args.done && existing) {
      await ctx.db.delete(existing._id);
    }
    return { ok: true as const, ref: args.ref, done: args.done };
  },
});

// Which of these lesson refs the member has marked done.
export const doneLessonRefsInternal = internalQuery({
  args: { userId: v.id("users"), refs: v.array(v.string()) },
  handler: async (ctx, args) => {
    const done: string[] = [];
    for (const ref of args.refs.slice(0, MAX_REFS_PER_READ)) {
      const resourceId = lessonIdFromRef(ctx, ref);
      if (!resourceId) continue;
      const row = await ctx.db.query("communityLessonProgress")
        .withIndex("by_user_resource", (q) => q.eq("userId", args.userId).eq("resourceId", resourceId)).first();
      if (row) done.push(ref);
    }
    return done;
  },
});

// The app's classroom (design v1 Knowledge): a member's own done lessons, and
// marking one. Private to the member, as above.
const MY_PROGRESS_CAP = 2_000;
const viewerArgs = { userId: v.optional(v.id("users")), authSubject: v.optional(v.string()), communityId: v.id("communities") };

export const getMyLessonProgress = query({
  args: viewerArgs,
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const rows = await ctx.db.query("communityLessonProgress")
      .withIndex("by_user_resource", (q) => q.eq("userId", userId)).take(MY_PROGRESS_CAP);
    return {
      done: rows
        .filter((row) => normalizeIdValue(row.communityId) === normalizeIdValue(args.communityId))
        .map((row) => ({ resource_id: normalizeIdValue(row.resourceId), completed_at: new Date(row.completedAt).toISOString() })),
    };
  },
});

export const setMyLessonDone = mutation({
  args: { ...viewerArgs, resourceId: v.string(), done: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const resourceId = ctx.db.normalizeId("communityResources", args.resourceId);
    if (!resourceId || !(await liveLesson(ctx, args.communityId, resourceId))) throw new Error("lesson_not_found");
    const existing = await ctx.db.query("communityLessonProgress")
      .withIndex("by_user_resource", (q) => q.eq("userId", userId).eq("resourceId", resourceId)).first();
    // Setting (not toggling) makes a retry safe.
    if (args.done && !existing) {
      await ctx.db.insert("communityLessonProgress", { communityId: args.communityId, userId, resourceId, completedAt: Date.now() });
    } else if (!args.done && existing) {
      await ctx.db.delete(existing._id);
    }
    return { done: args.done };
  },
});

// For hosts: how many people have started and finished each course. Counts
// only; whose progress it is stays with the member.
const COURSES_CAP = 60;
const LESSONS_PER_COURSE_CAP = 100;
const ROWS_PER_LESSON_CAP = 2_000;

export const getCourseProgressSummary = query({
  args: viewerArgs,
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const modules = (await ctx.db.query("communityResourceModules")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId)).take(COURSES_CAP * 2))
      .filter((module) => communityResourceModuleIsLive(module)).slice(0, COURSES_CAP);
    const courses: Array<{ module_id: string; lessons: number; started: number; finished: number }> = [];
    for (const module of modules) {
      const live = new Set([normalizeIdValue(module._id)]);
      const lessons = (await ctx.db.query("communityResources")
        .withIndex("by_community_module", (q: any) => q.eq("communityId", args.communityId).eq("moduleId", module._id)).take(LESSONS_PER_COURSE_CAP * 2))
        .filter((row: any) => communityResourceIsLiveModulePage(row, live)).slice(0, LESSONS_PER_COURSE_CAP);
      const perUser = new Map<string, number>();
      for (const lesson of lessons) {
        const rows = await ctx.db.query("communityLessonProgress").withIndex("by_resource", (q) => q.eq("resourceId", lesson._id)).take(ROWS_PER_LESSON_CAP);
        for (const row of rows) perUser.set(String(row.userId), (perUser.get(String(row.userId)) ?? 0) + 1);
      }
      courses.push({
        module_id: normalizeIdValue(module._id), lessons: lessons.length, started: perUser.size,
        finished: lessons.length ? [...perUser.values()].filter((count) => count >= lessons.length).length : 0,
      });
    }
    return { courses };
  },
});
