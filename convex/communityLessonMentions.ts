// Lessons that name another lesson or a course (shared/communityLessonMentions.ts),
// kept as one small list per community for the community brain's map.
// Working it out means reading every lesson's words, far too much for the
// map's own read, so it is done in the background, a few lessons at a time,
// and only when something it depends on changed: the map says its list is
// stale (the fingerprint differs), the app asks for a refresh, and the list
// is rebuilt. No write path has to remember to do it.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { requireCommunityChatAccess } from "./communityCore";
import { MAP_LESSONS, liveLessons } from "./communityMemory";
import { hydrateCommunityResourceBody } from "./communityResourceContent";
import {
  LESSON_MENTIONS_MAX, lessonMentionsFingerprint, lessonMentions, lessonNameIndex,
  type CourseName, type LessonLink, type LessonName,
} from "../shared/communityLessonMentions";

const BATCH = 25;
// A rebuild that has not finished after this long is taken to have failed.
const BUILDING_STALE_MS = 10 * 60_000;

type Live = Awaited<ReturnType<typeof liveLessons>>;

export function lessonMentionNames(lessons: Live): { lessons: Array<LessonName & { body: string }>; courses: CourseName[] } {
  const courses = new Map<string, CourseName>();
  const named = lessons.map((lesson) => {
    const courseRef = `course:${String(lesson.courseId)}`;
    if (!courses.has(courseRef)) courses.set(courseRef, { ref: courseRef, name: lesson.course });
    return { ref: `resource:${String(lesson.id)}`, title: lesson.title, courseRef, body: lesson.stamp };
  });
  return { lessons: named, courses: [...courses.values()] };
}

// What the map is sent: the links between things it draws, and whether the
// list is behind what the lessons say now.
export async function lessonMentionsFor(ctx: any, communityId: any, lessons: Live): Promise<{ links: LessonLink[]; stale: boolean }> {
  const names = lessonMentionNames(lessons);
  const row: any = await ctx.db.query("communityLessonMentions").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).first();
  const fingerprint = lessonMentionsFingerprint(names.lessons, names.courses);
  // No lessons, nothing to link, nothing to rebuild.
  if (lessons.length === 0) return { links: [], stale: false };
  const drawn = new Set<string>([...names.lessons.map((lesson) => lesson.ref), ...names.courses.map((course) => course.ref)]);
  const links = ((row?.links ?? []) as LessonLink[]).filter((link) => drawn.has(link.from) && drawn.has(link.to));
  return { links, stale: row?.fingerprint !== fingerprint };
}

// The app asks for this when a map came back stale. Anyone who can read the
// community may ask; it does nothing unless the list really is behind and no
// rebuild is already running.
export const refreshLessonMentions = mutation({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const lessons = await liveLessons(ctx, args.communityId, MAP_LESSONS);
    const names = lessonMentionNames(lessons);
    const fingerprint = lessonMentionsFingerprint(names.lessons, names.courses);
    const row: any = await ctx.db.query("communityLessonMentions").withIndex("by_community", (q: any) => q.eq("communityId", args.communityId)).first();
    if (row?.fingerprint === fingerprint) return { started: false };
    const nowMs = Date.now();
    if (row?.building && row.building.fingerprint === fingerprint && nowMs - row.building.startedAt < BUILDING_STALE_MS) return { started: false };
    const building = { fingerprint, startedAt: nowMs };
    if (row) await ctx.db.patch(row._id, { building });
    else await ctx.db.insert("communityLessonMentions", { communityId: args.communityId, fingerprint: "", links: [], builtAt: 0, building });
    await ctx.scheduler.runAfter(0, (internal as any).communityLessonMentions.rebuildLessonMentionsBatchInternal, { communityId: args.communityId, fingerprint, cursor: 0, links: [] });
    return { started: true };
  },
});

// One step of a rebuild: the next few lessons' words, read and matched. If
// the lessons changed under it, it stops; the next stale map starts afresh.
export const rebuildLessonMentionsBatchInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    fingerprint: v.string(),
    cursor: v.number(),
    links: v.array(v.object({ from: v.string(), to: v.string() })),
  },
  handler: async (ctx, args) => {
    const row: any = await ctx.db.query("communityLessonMentions").withIndex("by_community", (q: any) => q.eq("communityId", args.communityId)).first();
    if (!row || row.building?.fingerprint !== args.fingerprint) return { done: false, stopped: "superseded" };
    const live = await liveLessons(ctx, args.communityId, MAP_LESSONS);
    const names = lessonMentionNames(live);
    if (lessonMentionsFingerprint(names.lessons, names.courses) !== args.fingerprint) {
      await ctx.db.patch(row._id, { building: undefined });
      return { done: false, stopped: "changed" };
    }
    const index = lessonNameIndex(names.lessons, names.courses);
    const links: LessonLink[] = [...args.links];
    const end = Math.min(live.length, args.cursor + BATCH);
    for (let i = args.cursor; i < end && links.length < LESSON_MENTIONS_MAX; i++) {
      const resource: any = await hydrateCommunityResourceBody(ctx, (await ctx.db.get(live[i].id)) as any);
      const body = String(resource?.bodyMd ?? "");
      if (!body) continue;
      for (const to of lessonMentions(names.lessons[i], body, index)) {
        if (links.length >= LESSON_MENTIONS_MAX) break;
        links.push({ from: names.lessons[i].ref, to });
      }
    }
    if (end < live.length && links.length < LESSON_MENTIONS_MAX) {
      await ctx.scheduler.runAfter(0, (internal as any).communityLessonMentions.rebuildLessonMentionsBatchInternal, { communityId: args.communityId, fingerprint: args.fingerprint, cursor: end, links });
      return { done: false };
    }
    await ctx.db.patch(row._id, { fingerprint: args.fingerprint, links, builtAt: Date.now(), building: undefined });
    return { done: true, links: links.length };
  },
});
