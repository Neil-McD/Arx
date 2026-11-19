// Lesson progress: which lessons a member has marked done. The member's own
// reads (their site, their MCP harness, their Ask) see it, and only the
// member's own tools change it (community.lesson.set_done). Hosts (owner and
// admins) see each current member's progress in a course, as Skool, Kajabi and
// Circle do, so they can tell who is stuck and where; members are told so on
// the Knowledge shelf. Nobody else sees it: not moderators, not other members,
// not the guide in a channel or in a member's talk.
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { outReasonFor } from "../shared/communityMemberRecords";
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
// marking one. Only the member marks; who else sees it is said above.
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

// For hosts: who has started each course and how far they are. Hosts see each
// current member's progress; members are told on the shelf; nobody else sees
// it. The counts and the list are read the same way (courseProgressRows), so
// they always agree: only lessons members can see count, and only people in
// the community now (someone who left keeps their rows, for if they come
// back, but isn't counted or listed).
const COURSES_CAP = 60;
const LESSONS_PER_COURSE_CAP = 100;
const ROWS_PER_LESSON_CAP = 2_000;
export const PROGRESS_PEOPLE_CAP = 200;

// A course's lessons as members see them, in the host's order.
async function memberVisibleLessons(ctx: any, communityId: any, module: any) {
  if (!module || !communityResourceModuleIsLive(module)) return [];
  const live = new Set([normalizeIdValue(module._id)]);
  return (await ctx.db.query("communityResources")
    .withIndex("by_community_module", (q: any) => q.eq("communityId", communityId).eq("moduleId", module._id)).take(LESSONS_PER_COURSE_CAP * 2))
    .filter((row: any) => communityResourceIsLiveModulePage(row, live)).slice(0, LESSONS_PER_COURSE_CAP);
}

// The key a member's record opens by in Members ("owner", or their current
// membership), or null when they are not in the community now. Remembered
// for the request, since one person appears in many courses.
type MemberKeys = Map<string, string | null>;
async function currentMemberKey(ctx: any, community: any, userId: any, keys: MemberKeys): Promise<string | null> {
  const id = String(userId);
  if (keys.has(id)) return keys.get(id) ?? null;
  let key: string | null = null;
  if (id === String(community.ownerId)) key = "owner";
  else {
    // Several rows over time (left, rejoined): the newest says where they are now.
    const rows = await ctx.db.query("communityMemberships")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", community._id).eq("userId", userId)).take(20);
    const newest = rows.sort((a: any, b: any) => b.createdAt - a.createdAt)[0];
    const block = await ctx.db.query("communityBlocks")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", community._id).eq("userId", userId)).take(20);
    const blocked = block.some((row: any) => !row.liftedAt);
    if (newest && !outReasonFor(String(newest.state), blocked, newest.revokedReason)) key = String(newest._id);
  }
  keys.set(id, key);
  return key;
}

type PersonProgress = { userId: any; memberKey: string; done: number; lastAt: number; lastTitle: string };
async function courseProgressRows(ctx: any, community: any, lessons: any[], keys: MemberKeys): Promise<PersonProgress[]> {
  const perUser = new Map<string, PersonProgress>();
  for (const lesson of lessons) {
    const rows = await ctx.db.query("communityLessonProgress").withIndex("by_resource", (q: any) => q.eq("resourceId", lesson._id)).take(ROWS_PER_LESSON_CAP);
    for (const row of rows) {
      const memberKey = await currentMemberKey(ctx, community, row.userId, keys);
      if (!memberKey) continue;
      const id = String(row.userId);
      const current = perUser.get(id) ?? { userId: row.userId, memberKey, done: 0, lastAt: 0, lastTitle: "" };
      current.done += 1;
      if (row.completedAt >= current.lastAt) { current.lastAt = row.completedAt; current.lastTitle = String(lesson.title ?? "").trim(); }
      perUser.set(id, current);
    }
  }
  return [...perUser.values()];
}

// Stuck first: those still going, the longest idle at the top; then those who
// finished, the most recent first.
export function orderCourseProgress<T extends { done: number; lastAt: number }>(rows: T[], lessons: number): T[] {
  const finished = (row: T) => lessons > 0 && row.done >= lessons;
  return rows.slice().sort((a, b) => {
    if (finished(a) !== finished(b)) return finished(a) ? 1 : -1;
    return finished(a) ? b.lastAt - a.lastAt : a.lastAt - b.lastAt;
  });
}

export type CourseProgressPerson = {
  member_key: string; name: string; handle: string | null;
  done: number; of: number; last_lesson: string; last_done_at: string; finished: boolean;
};

// One course's people, for a host. The caller has checked the reader may see
// it (requireCommunityManager). A course that isn't published, or isn't this
// community's, has nobody.
export async function readCourseProgressPeople(ctx: any, community: any, moduleId: any) {
  const module = moduleId ? await ctx.db.get(moduleId) : null;
  const ours = module && normalizeIdValue(module.communityId) === normalizeIdValue(community._id) ? module : null;
  const lessons = await memberVisibleLessons(ctx, community._id, ours);
  const rows = orderCourseProgress(await courseProgressRows(ctx, community, lessons, new Map()), lessons.length);
  const people: CourseProgressPerson[] = [];
  for (const row of rows.slice(0, PROGRESS_PEOPLE_CAP)) {
    // The name Members shows.
    const user = await ctx.db.get(row.userId) as { displayName?: string; handle?: string } | null;
    const profile = await resolveUserProfileDisplayProjection(ctx, row.userId);
    people.push({
      member_key: row.memberKey,
      name: profile.display_name ?? user?.displayName ?? user?.handle ?? "Member",
      handle: user?.handle ?? null,
      done: row.done, of: lessons.length, last_lesson: row.lastTitle,
      last_done_at: new Date(row.lastAt).toISOString(), finished: lessons.length > 0 && row.done >= lessons.length,
    });
  }
  return {
    module_id: normalizeIdValue(moduleId), lessons: lessons.length, started: rows.length,
    finished: rows.filter((row) => lessons.length > 0 && row.done >= lessons.length).length,
    people, more: Math.max(0, rows.length - people.length),
  };
}

export const getCourseProgressSummary = query({
  args: viewerArgs,
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    const { community } = await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const modules = (await ctx.db.query("communityResourceModules")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId)).take(COURSES_CAP * 2))
      .filter((module) => communityResourceModuleIsLive(module)).slice(0, COURSES_CAP);
    const courses: Array<{ module_id: string; lessons: number; started: number; finished: number }> = [];
    const keys: MemberKeys = new Map();
    for (const module of modules) {
      const lessons = await memberVisibleLessons(ctx, args.communityId, module);
      const rows = await courseProgressRows(ctx, community, lessons, keys);
      courses.push({
        module_id: normalizeIdValue(module._id), lessons: lessons.length, started: rows.length,
        finished: lessons.length ? rows.filter((row) => row.done >= lessons.length).length : 0,
      });
    }
    return { courses };
  },
});

// One course's people (the host opens "N started · M finished" on a course).
export const getCourseProgressPeople = query({
  args: { ...viewerArgs, moduleId: v.id("communityResourceModules") },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    const { community } = await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    return await readCourseProgressPeople(ctx, community, args.moduleId);
  },
});
