// Lesson progress: which lessons a member has marked done. The member's own
// reads (their site, their MCP harness, their Ask) see it, and only the
// member's own tools change it (community.lesson.set_done). Hosts (owner and
// admins) see each current member's progress in a course, as Skool, Kajabi and
// Circle do, so they can tell who is stuck and where; members are told so on
// the Knowledge shelf. Nobody else sees it: not moderators, not other members,
// not the guide in a channel or in a member's talk.
import { v } from "convex/values";
import { internal } from "./_generated/api";
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
const MY_PROGRESS_CAP = 2_000;
const COURSES_CAP = 60;
const LESSONS_PER_COURSE_CAP = 100;
const ROWS_PER_LESSON_CAP = 2_000;
const COURSE_PROGRESS_STUDENTS_CAP = 5_000;
const BACKFILL_PROGRESS_BATCH_SIZE = 100;
const SWEEP_MODULES_PAGE_SIZE = 50;
const SWEEP_MAX_MODULES_PER_RUN = 5;
export const PROGRESS_PEOPLE_CAP = 200;

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

// Keep the per-(community, module, user) projection row in sync on every mark/unmark.
async function syncCourseProgressForUserLesson(
  ctx: any,
  args: {
    communityId: any;
    moduleId: any;
    userId: any;
    resourceId: any;
    done: boolean;
    completedAt: number;
  },
): Promise<void> {
  const existing = await ctx.db
    .query("communityCourseProgress")
    .withIndex("by_community_module_user", (q: any) =>
      q.eq("communityId", args.communityId).eq("moduleId", args.moduleId).eq("userId", args.userId),
    )
    .first();

  if (args.done) {
    if (!existing) {
      await ctx.db.insert("communityCourseProgress", {
        communityId: args.communityId,
        moduleId: args.moduleId,
        userId: args.userId,
        doneResourceIds: [args.resourceId],
        lastResourceId: args.resourceId,
        lastCompletedAt: args.completedAt,
        updatedAt: args.completedAt,
      });
      return;
    }
    const already = existing.doneResourceIds.some((id: any) => String(id) === String(args.resourceId));
    const nextIds = already ? existing.doneResourceIds : [...existing.doneResourceIds, args.resourceId];
    const nextLastAt = Math.max(existing.lastCompletedAt, args.completedAt);
    const nextLastResource = args.completedAt >= existing.lastCompletedAt ? args.resourceId : existing.lastResourceId;
    await ctx.db.patch(existing._id, {
      doneResourceIds: nextIds,
      lastResourceId: nextLastResource,
      lastCompletedAt: nextLastAt,
      updatedAt: args.completedAt,
    });
    return;
  }

  if (!existing) return;
  const remaining = existing.doneResourceIds.filter((id: any) => String(id) !== String(args.resourceId));
  if (remaining.length === 0) {
    await ctx.db.delete(existing._id);
    return;
  }
  let lastResourceId = existing.lastResourceId;
  let lastCompletedAt = existing.lastCompletedAt;
  if (!lastResourceId || String(lastResourceId) === String(args.resourceId)) {
    const remainingSet = new Set(remaining.map((id: any) => String(id)));
    const userRows = await ctx.db
      .query("communityLessonProgress")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", args.userId))
      .take(MY_PROGRESS_CAP);
    let latest: { resourceId: any; completedAt: number } | null = null;
    for (const row of userRows) {
      if (!remainingSet.has(String(row.resourceId))) continue;
      if (!latest || row.completedAt >= latest.completedAt) {
        latest = { resourceId: row.resourceId, completedAt: row.completedAt };
      }
    }
    lastResourceId = latest?.resourceId ?? remaining[remaining.length - 1];
    lastCompletedAt = latest?.completedAt ?? args.completedAt;
  }
  await ctx.db.patch(existing._id, {
    doneResourceIds: remaining,
    lastResourceId,
    lastCompletedAt,
    updatedAt: args.completedAt,
  });
}

export const setLessonDoneInternal = internalMutation({
  args: { communityId: v.id("communities"), userId: v.id("users"), ref: v.string(), done: v.boolean() },
  handler: async (ctx, args) => {
    // Checked again here, in the write's own transaction: access revoked since
    // the door authorized the call stops the write.
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: args.userId });
    const resourceId = lessonIdFromRef(ctx, args.ref);
    const lesson = resourceId ? await liveLesson(ctx, args.communityId, resourceId) : null;
    if (!resourceId || !lesson) {
      return { ok: false as const, code: "lesson_not_found", message: "That lesson isn't available. List a course under resources/ for its lessons." };
    }
    const existing = await ctx.db.query("communityLessonProgress")
      .withIndex("by_user_resource", (q) => q.eq("userId", args.userId).eq("resourceId", resourceId)).first();
    const nowMs = Date.now();
    // Setting (not toggling) makes a retry safe without a receipt.
    if (args.done && !existing) {
      await ctx.db.insert("communityLessonProgress", { communityId: args.communityId, userId: args.userId, resourceId, completedAt: nowMs });
    } else if (!args.done && existing) {
      await ctx.db.delete(existing._id);
    }
    if (lesson.moduleId) {
      await syncCourseProgressForUserLesson(ctx, {
        communityId: args.communityId,
        moduleId: lesson.moduleId,
        userId: args.userId,
        resourceId,
        done: args.done,
        completedAt: existing && args.done ? existing.completedAt : nowMs,
      });
    }
    return { ok: true as const, ref: args.ref, done: args.done };
  },
});

// Which of these lesson refs the member has marked done.
export const doneLessonRefsInternal = internalQuery({
  args: { userId: v.id("users"), refs: v.array(v.string()) },
  handler: async (ctx, args) => {
    const pairs: Array<{ ref: string; resourceId: any }> = [];
    for (const ref of args.refs.slice(0, MAX_REFS_PER_READ)) {
      const resourceId = lessonIdFromRef(ctx, ref);
      if (resourceId) pairs.push({ ref, resourceId });
    }
    const done: string[] = [];
    for (let i = 0; i < pairs.length; i += 25) {
      const chunk = pairs.slice(i, i + 25);
      const rows = await Promise.all(
        chunk.map((item) =>
          ctx.db
            .query("communityLessonProgress")
            .withIndex("by_user_resource", (q) => q.eq("userId", args.userId).eq("resourceId", item.resourceId))
            .first(),
        ),
      );
      for (let j = 0; j < chunk.length; j += 1) {
        if (rows[j]) done.push(chunk[j]!.ref);
      }
    }
    return done;
  },
});

// The app's classroom (design v1 Knowledge): a member's own done lessons, and
// marking one. Only the member marks; who else sees it is said above.
const viewerArgs = { userId: v.optional(v.id("users")), authSubject: v.optional(v.string()), communityId: v.id("communities") };

export const getMyLessonProgress = query({
  args: viewerArgs,
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const rows = await ctx.db
      .query("communityLessonProgress")
      .withIndex("by_community_user", (q) => q.eq("communityId", args.communityId).eq("userId", userId))
      .take(MY_PROGRESS_CAP);
    return {
      done: rows.map((row) => ({ resource_id: normalizeIdValue(row.resourceId), completed_at: new Date(row.completedAt).toISOString() })),
    };
  },
});

export const setMyLessonDone = mutation({
  args: { ...viewerArgs, resourceId: v.string(), done: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const resourceId = ctx.db.normalizeId("communityResources", args.resourceId);
    const lesson = resourceId ? await liveLesson(ctx, args.communityId, resourceId) : null;
    if (!resourceId || !lesson) throw new Error("lesson_not_found");
    const existing = await ctx.db.query("communityLessonProgress")
      .withIndex("by_user_resource", (q) => q.eq("userId", userId).eq("resourceId", resourceId)).first();
    const nowMs = Date.now();
    // Setting (not toggling) makes a retry safe.
    if (args.done && !existing) {
      await ctx.db.insert("communityLessonProgress", { communityId: args.communityId, userId, resourceId, completedAt: nowMs });
    } else if (!args.done && existing) {
      await ctx.db.delete(existing._id);
    }
    if (lesson.moduleId) {
      await syncCourseProgressForUserLesson(ctx, {
        communityId: args.communityId,
        moduleId: lesson.moduleId,
        userId,
        resourceId,
        done: args.done,
        completedAt: existing && args.done ? existing.completedAt : nowMs,
      });
    }
    return { done: args.done };
  },
});

// Match shared/communityClassroom.ts (`courseLessons`): missing sortOrder goes last.
function classroomSortOrder(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

// A course's lessons as members see them, in the host's order.
async function memberVisibleLessons(ctx: any, communityId: any, module: any) {
  if (!module || !communityResourceModuleIsLive(module)) return [];
  const live = new Set([normalizeIdValue(module._id)]);
  return (await ctx.db.query("communityResources")
    .withIndex("by_community_module", (q: any) => q.eq("communityId", communityId).eq("moduleId", module._id)).take(LESSONS_PER_COURSE_CAP * 2))
    .filter((row: any) => communityResourceIsLiveModulePage(row, live))
    .sort((a: any, b: any) =>
      classroomSortOrder(a.sortOrder) - classroomSortOrder(b.sortOrder) ||
      Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0) ||
      String(a._id).localeCompare(String(b._id)),
    )
    .slice(0, LESSONS_PER_COURSE_CAP);
}

export type MemberCourseProgressSummary = {
  course_id: string;
  title: string;
  done: number;
  of: number;
  finished: boolean;
  next_lesson: { id: string; title: string } | null;
  last_done_at: string | null;
};

// One member's live course progress across this community's published courses.
// Callers must enforce lens authorization (only the member themselves, or a
// community owner/admin — never other members, moderators, or public rooms).
export async function readMemberCourseProgress(
  ctx: any,
  communityId: any,
  userId: any,
): Promise<MemberCourseProgressSummary[]> {
  const [modules, doneRows] = await Promise.all([
    ctx.db.query("communityResourceModules")
      .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
      .take(COURSES_CAP * 2),
    ctx.db.query("communityLessonProgress")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId))
      .take(MY_PROGRESS_CAP),
  ]);
  const liveModules = modules
    .filter((module: any) => communityResourceModuleIsLive(module))
    .sort((a: any, b: any) =>
      classroomSortOrder(a.sortOrder) - classroomSortOrder(b.sortOrder) ||
      Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0) ||
      String(a._id).localeCompare(String(b._id)),
    )
    .slice(0, COURSES_CAP);
  if (!liveModules.length) return [];

  const completedAtByResourceId = new Map<string, number>();
  for (const row of doneRows) {
    const id = normalizeIdValue(row.resourceId);
    const at = Number(row.completedAt ?? 0);
    if (id && (!completedAtByResourceId.has(id) || at > completedAtByResourceId.get(id)!)) {
      completedAtByResourceId.set(id, at);
    }
  }

  const summaries: MemberCourseProgressSummary[] = [];
  for (const module of liveModules) {
    const lessons = await memberVisibleLessons(ctx, communityId, module);
    if (!lessons.length) continue;
    let done = 0;
    let lastDoneMs = -1;
    let nextLesson: { id: string; title: string } | null = null;
    for (const lesson of lessons) {
      const lessonId = normalizeIdValue(lesson._id);
      const completedAt = completedAtByResourceId.get(lessonId);
      if (completedAt !== undefined) {
        done += 1;
        if (completedAt > lastDoneMs) lastDoneMs = completedAt;
      } else if (!nextLesson) {
        nextLesson = { id: lessonId, title: String(lesson.title ?? "").trim() || "Untitled lesson" };
      }
    }
    summaries.push({
      course_id: normalizeIdValue(module._id),
      title: String(module.name ?? "").trim() || "Untitled course",
      done,
      of: lessons.length,
      finished: done >= lessons.length,
      next_lesson: nextLesson,
      last_done_at: lastDoneMs >= 0 ? new Date(lastDoneMs).toISOString() : null,
    });
  }
  return summaries;
}

export type CommunityCourseProgressSummaryRow = {
  module_id: string;
  title: string;
  lessons: number;
  started: number;
  finished: number;
};

// Community-wide per-course completion roll-up for owners/admins.
// Uses the O(students) communityCourseProgress projection when indexed.
export async function readCommunityCourseProgressSummary(
  ctx: any,
  community: any,
): Promise<CommunityCourseProgressSummaryRow[]> {
  const modules = (await ctx.db.query("communityResourceModules")
    .withIndex("by_community", (q: any) => q.eq("communityId", community._id)).take(COURSES_CAP * 2))
    .filter((module: any) => communityResourceModuleIsLive(module))
    .sort((a: any, b: any) =>
      classroomSortOrder(a.sortOrder) - classroomSortOrder(b.sortOrder) ||
      Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0) ||
      String(a._id).localeCompare(String(b._id)),
    )
    .slice(0, COURSES_CAP);
  const courses: CommunityCourseProgressSummaryRow[] = [];
  const state = createMemberKeysContext();
  for (const module of modules) {
    const lessons = await memberVisibleLessons(ctx, community._id, module);
    const rows = await courseProgressRows(ctx, community, module, lessons, state);
    courses.push({
      module_id: normalizeIdValue(module._id),
      title: String(module.name ?? "").trim() || "Untitled course",
      lessons: lessons.length,
      started: rows.length,
      finished: lessons.length ? rows.filter((row) => row.done >= lessons.length).length : 0,
    });
  }
  return courses;
}

// The key a member's record opens by in Members ("owner", or their current
// membership), or null when they are not in the community now. Remembered
// for the request, since one person appears in many courses.
type MemberKeysContext = {
  keys: Map<string, string | null>;
  activeBlockedUserIds: Set<string> | null;
};

function createMemberKeysContext(): MemberKeysContext {
  return { keys: new Map(), activeBlockedUserIds: null };
}

async function resolveActiveBlockedUserIds(ctx: any, communityId: any, state: MemberKeysContext): Promise<Set<string>> {
  if (state.activeBlockedUserIds) return state.activeBlockedUserIds;
  const rows = await ctx.db
    .query("communityBlocks")
    .withIndex("by_community_liftedAt", (q: any) => q.eq("communityId", communityId).eq("liftedAt", undefined))
    .take(COURSE_PROGRESS_STUDENTS_CAP);
  state.activeBlockedUserIds = new Set(rows.map((row: any) => String(row.userId)));
  return state.activeBlockedUserIds;
}

async function hydrateMemberKeys(ctx: any, community: any, userIds: any[], state: MemberKeysContext): Promise<void> {
  const missing: any[] = [];
  const seen = new Set<string>();
  for (const userId of userIds) {
    const id = String(userId);
    if (state.keys.has(id) || seen.has(id)) continue;
    seen.add(id);
    if (id === String(community.ownerId)) {
      state.keys.set(id, "owner");
    } else {
      missing.push(userId);
    }
  }
  if (!missing.length) return;
  const blockedIds = await resolveActiveBlockedUserIds(ctx, community._id, state);
  for (let i = 0; i < missing.length; i += 25) {
    const chunk = missing.slice(i, i + 25);
    const membershipLists = await Promise.all(
      chunk.map((userId) =>
        ctx.db
          .query("communityMemberships")
          .withIndex("by_community_user", (q: any) => q.eq("communityId", community._id).eq("userId", userId))
          .take(20),
      ),
    );
    for (let j = 0; j < chunk.length; j += 1) {
      const userId = chunk[j];
      const id = String(userId);
      const rows = membershipLists[j] ?? [];
      const newest = rows.sort((a: any, b: any) => b.createdAt - a.createdAt)[0];
      const blocked = blockedIds.has(id);
      const key = newest && !outReasonFor(String(newest.state), blocked, newest.revokedReason) ? String(newest._id) : null;
      state.keys.set(id, key);
    }
  }
}

type PersonProgress = { userId: any; memberKey: string; done: number; lastAt: number; lastTitle: string };

async function courseProgressRows(
  ctx: any,
  community: any,
  module: any,
  lessons: any[],
  state: MemberKeysContext,
): Promise<PersonProgress[]> {
  if (!module || lessons.length === 0) return [];
  const liveLessonById = new Map<string, any>(lessons.map((lesson) => [String(lesson._id), lesson]));

  // Fast O(students) path when the course's per-student projection is ready.
  if (typeof module.progressIndexedAt === "number") {
    const projRows = await ctx.db
      .query("communityCourseProgress")
      .withIndex("by_community_module", (q: any) => q.eq("communityId", community._id).eq("moduleId", module._id))
      .take(COURSE_PROGRESS_STUDENTS_CAP);
    if (!projRows.length) return [];
    await hydrateMemberKeys(ctx, community, projRows.map((row: any) => row.userId), state);
    const results: PersonProgress[] = [];
    for (const row of projRows) {
      const memberKey = state.keys.get(String(row.userId)) ?? null;
      if (!memberKey) continue;
      const visibleDoneIds = row.doneResourceIds.filter((id: any) => liveLessonById.has(String(id)));
      if (visibleDoneIds.length === 0) continue;
      let lastAt = row.lastCompletedAt;
      let lastLesson = row.lastResourceId ? liveLessonById.get(String(row.lastResourceId)) : null;
      if (!lastLesson) {
        // The student's most recent completed lesson was hidden or emptied; recover
        // the latest remaining live lesson cleanly from their community progress rows.
        const visibleSet = new Set(visibleDoneIds.map((id: any) => String(id)));
        const userRows = await ctx.db
          .query("communityLessonProgress")
          .withIndex("by_community_user", (q: any) => q.eq("communityId", community._id).eq("userId", row.userId))
          .take(MY_PROGRESS_CAP);
        let latestAt = -1;
        for (const entry of userRows) {
          if (!visibleSet.has(String(entry.resourceId))) continue;
          if (entry.completedAt >= latestAt) {
            latestAt = entry.completedAt;
            lastLesson = liveLessonById.get(String(entry.resourceId)) ?? null;
          }
        }
        if (latestAt >= 0) lastAt = latestAt;
      }
      results.push({
        userId: row.userId,
        memberKey,
        done: visibleDoneIds.length,
        lastAt,
        lastTitle: String(lastLesson?.title ?? "").trim(),
      });
    }
    return results;
  }

  // Parallelized fallback for legacy courses awaiting backfill.
  const allRowsByLesson: Array<{ lesson: any; rows: any[] }> = [];
  for (let i = 0; i < lessons.length; i += 20) {
    const chunk = lessons.slice(i, i + 20);
    const chunkResults = await Promise.all(
      chunk.map((lesson) =>
        ctx.db
          .query("communityLessonProgress")
          .withIndex("by_resource", (q: any) => q.eq("resourceId", lesson._id))
          .take(ROWS_PER_LESSON_CAP),
      ),
    );
    for (let j = 0; j < chunk.length; j += 1) {
      allRowsByLesson.push({ lesson: chunk[j], rows: chunkResults[j] ?? [] });
    }
  }

  const uniqueUserIds: any[] = [];
  const seenUsers = new Set<string>();
  for (const { rows } of allRowsByLesson) {
    for (const row of rows) {
      const id = String(row.userId);
      if (!seenUsers.has(id)) {
        seenUsers.add(id);
        uniqueUserIds.push(row.userId);
      }
    }
  }
  await hydrateMemberKeys(ctx, community, uniqueUserIds, state);

  const perUser = new Map<string, PersonProgress>();
  for (const { lesson, rows } of allRowsByLesson) {
    for (const row of rows) {
      const id = String(row.userId);
      const memberKey = state.keys.get(id) ?? null;
      if (!memberKey) continue;
      const current = perUser.get(id) ?? { userId: row.userId, memberKey, done: 0, lastAt: 0, lastTitle: "" };
      current.done += 1;
      if (row.completedAt >= current.lastAt) {
        current.lastAt = row.completedAt;
        current.lastTitle = String(lesson.title ?? "").trim();
      }
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
  const rows = orderCourseProgress(
    await courseProgressRows(ctx, community, ours, lessons, createMemberKeysContext()),
    lessons.length,
  );
  const slice = rows.slice(0, PROGRESS_PEOPLE_CAP);
  const people: CourseProgressPerson[] = [];
  for (let i = 0; i < slice.length; i += 25) {
    const chunk = slice.slice(i, i + 25);
    const hydrated = await Promise.all(
      chunk.map(async (row) => {
        const [user, profile] = await Promise.all([
          ctx.db.get(row.userId) as Promise<{ displayName?: string; handle?: string } | null>,
          resolveUserProfileDisplayProjection(ctx, row.userId),
        ]);
        return {
          member_key: row.memberKey,
          name: profile.display_name ?? user?.displayName ?? user?.handle ?? "Member",
          handle: user?.handle ?? null,
          done: row.done,
          of: lessons.length,
          last_lesson: row.lastTitle,
          last_done_at: new Date(row.lastAt).toISOString(),
          finished: lessons.length > 0 && row.done >= lessons.length,
        };
      }),
    );
    people.push(...hydrated);
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
    const summary = await readCommunityCourseProgressSummary(ctx, community);
    return {
      courses: summary.map(({ module_id, lessons, started, finished }) => ({ module_id, lessons, started, finished })),
    };
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

// Paginated background backfill for pre-existing courses so they move to the
// O(students) communityCourseProgress projection without touching member flows.
export const backfillCourseProgressModuleBatchInternal = internalMutation({
  args: {
    moduleId: v.id("communityResourceModules"),
    lessonIndex: v.number(),
    cursor: v.union(v.string(), v.null()),
    cleared: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const module = await ctx.db.get(args.moduleId);
    if (!module) return { done: true, processed: 0 };
    const nowMs = Date.now();

    // Phase 1: purge any obsolete projection rows for this module before
    // rebuilding from canonical communityLessonProgress rows.
    if (args.lessonIndex === 0 && args.cursor === null && args.cleared !== true) {
      const obsolete = await ctx.db
        .query("communityCourseProgress")
        .withIndex("by_community_module", (q) => q.eq("communityId", module.communityId).eq("moduleId", module._id))
        .take(BACKFILL_PROGRESS_BATCH_SIZE);
      for (const row of obsolete) {
        await ctx.db.delete(row._id);
      }
      if (obsolete.length >= BACKFILL_PROGRESS_BATCH_SIZE) {
        await ctx.scheduler.runAfter(0, (internal as any).communityLessonProgress.backfillCourseProgressModuleBatchInternal, {
          moduleId: module._id,
          lessonIndex: 0,
          cursor: null,
          cleared: false,
        });
        return { done: false, processed: obsolete.length };
      }
    }

    const lessons = await ctx.db
      .query("communityResources")
      .withIndex("by_community_module", (q) => q.eq("communityId", module.communityId).eq("moduleId", module._id))
      .take(LESSONS_PER_COURSE_CAP * 2);

    if (args.lessonIndex >= lessons.length) {
      await ctx.db.patch(module._id, {
        progressIndexedAt: nowMs,
        progressBackfillStartedAt: undefined,
      });
      return { done: true, processed: 0 };
    }

    const lesson = lessons[args.lessonIndex]!;
    const page = await ctx.db
      .query("communityLessonProgress")
      .withIndex("by_resource", (q) => q.eq("resourceId", lesson._id))
      .paginate({ cursor: args.cursor, numItems: BACKFILL_PROGRESS_BATCH_SIZE });

    for (const row of page.page) {
      await syncCourseProgressForUserLesson(ctx, {
        communityId: module.communityId,
        moduleId: module._id,
        userId: row.userId,
        resourceId: row.resourceId,
        done: true,
        completedAt: row.completedAt,
      });
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, (internal as any).communityLessonProgress.backfillCourseProgressModuleBatchInternal, {
        moduleId: module._id,
        lessonIndex: args.lessonIndex,
        cursor: page.continueCursor,
        cleared: true,
      });
      return { done: false, processed: page.page.length };
    }

    const nextLessonIndex = args.lessonIndex + 1;
    if (nextLessonIndex < lessons.length) {
      await ctx.scheduler.runAfter(0, (internal as any).communityLessonProgress.backfillCourseProgressModuleBatchInternal, {
        moduleId: module._id,
        lessonIndex: nextLessonIndex,
        cursor: null,
        cleared: true,
      });
      return { done: false, processed: page.page.length };
    }

    await ctx.db.patch(module._id, {
      progressIndexedAt: nowMs,
      progressBackfillStartedAt: undefined,
    });
    return { done: true, processed: page.page.length };
  },
});

export const sweepUnindexedCourseProgressInternal = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    scheduledSoFar: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    let scheduled = Math.max(0, Math.floor(args.scheduledSoFar ?? 0));
    const page = await ctx.db
      .query("communityResourceModules")
      .paginate({ cursor: args.cursor ?? null, numItems: SWEEP_MODULES_PAGE_SIZE });

    for (const module of page.page) {
      if (scheduled >= SWEEP_MAX_MODULES_PER_RUN) break;
      if (typeof (module as any).progressIndexedAt === "number") continue;
      const startedAt = (module as any).progressBackfillStartedAt;
      if (typeof startedAt === "number" && nowMs - startedAt < 10 * 60_000) continue;
      await ctx.db.patch(module._id, { progressBackfillStartedAt: nowMs });
      await ctx.scheduler.runAfter(0, (internal as any).communityLessonProgress.backfillCourseProgressModuleBatchInternal, {
        moduleId: module._id,
        lessonIndex: 0,
        cursor: null,
      });
      scheduled += 1;
    }

    if (!page.isDone && scheduled < SWEEP_MAX_MODULES_PER_RUN) {
      await ctx.scheduler.runAfter(0, (internal as any).communityLessonProgress.sweepUnindexedCourseProgressInternal, {
        cursor: page.continueCursor,
        scheduledSoFar: scheduled,
      });
      return { done: false, scheduled };
    }

    return { done: page.isDone, scheduled };
  },
});
