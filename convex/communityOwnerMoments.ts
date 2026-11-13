// Owner moments on Home (docs/specs/community-agent-gateway-v0.md, "Owner
// moments"): the facts, read without a model; the choice of card is
// shared/communityOwnerMoments.ts; this file stores what was shown and
// dismissed. Owner only.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import {
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
  normalizeIdValue,
} from "./communityCore";
import { buildSnapshot } from "./communityFounderBrief";
import { communityIsActive } from "../shared/communityLifecycle";
import {
  COURSE_STALL_MIN,
  OWNER_MOMENT_KEYS,
  pickOwnerMoment,
  type OwnerMomentFacts,
} from "../shared/communityOwnerMoments";

const DAY_MS = 86_400_000;
const STALL_MS = 7 * DAY_MS;
const COURSES_CAP = 20;
const LESSONS_CAP = 50;
const ROWS_PER_LESSON_CAP = 500;
const MOMENT_KEYS = new Set<string>(OWNER_MOMENT_KEYS);

async function requireOwner(ctx: any, authSubject: string | undefined, communityId: any) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: authSubject ?? null });
  const community = await ctx.db.get(communityId);
  if (!community || String(community.ownerId) !== String(userId)) throw new Error("community_owner_moments_owner_required");
  return community;
}

// The lesson most members stopped after: members with some lessons done, not
// all, and nothing finished for a week, grouped by the last lesson they did.
async function courseStall(ctx: any, communityId: any, nowMs: number): Promise<OwnerMomentFacts["courseStall"]> {
  const modules = (await ctx.db.query("communityResourceModules")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId)).take(COURSES_CAP * 2))
    .filter((module: any) => communityResourceModuleIsLive(module)).slice(0, COURSES_CAP);
  let best: OwnerMomentFacts["courseStall"] = null;
  for (const module of modules) {
    const live = new Set([normalizeIdValue(module._id)]);
    const lessons = (await ctx.db.query("communityResources")
      .withIndex("by_community_module", (q: any) => q.eq("communityId", communityId).eq("moduleId", module._id)).take(LESSONS_CAP * 2))
      .filter((row: any) => communityResourceIsLiveModulePage(row, live))
      .sort((a: any, b: any) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) || a.createdAt - b.createdAt)
      .slice(0, LESSONS_CAP);
    if (lessons.length < 2) continue;
    const perUser = new Map<string, { done: number; lastIndex: number; lastAt: number }>();
    for (const [index, lesson] of lessons.entries()) {
      const rows = await ctx.db.query("communityLessonProgress").withIndex("by_resource", (q: any) => q.eq("resourceId", lesson._id)).take(ROWS_PER_LESSON_CAP);
      for (const row of rows) {
        const key = String(row.userId);
        const entry = perUser.get(key) ?? { done: 0, lastIndex: -1, lastAt: 0 };
        entry.done += 1;
        if (row.completedAt >= entry.lastAt) { entry.lastAt = row.completedAt; entry.lastIndex = Math.max(entry.lastIndex, index); }
        perUser.set(key, entry);
      }
    }
    const stoppedAfter = new Map<number, number>();
    for (const entry of perUser.values()) {
      if (entry.done >= lessons.length || nowMs - entry.lastAt < STALL_MS) continue;
      stoppedAfter.set(entry.lastIndex, (stoppedAfter.get(entry.lastIndex) ?? 0) + 1);
    }
    for (const [index, members] of stoppedAfter) {
      if (members >= COURSE_STALL_MIN && (!best || members > best.members)) {
        best = { course: String(module.name ?? "a course"), lessonNumber: index + 1, members };
      }
    }
  }
  return best;
}

export const getOwnerMoment = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const community = await requireOwner(ctx, args.authSubject, args.communityId);
    if (!communityIsActive(community)) return null;
    const nowMs = Date.now();
    const snapshot = await buildSnapshot(ctx, community, nowMs - DAY_MS, nowMs);
    const facts: OwnerMomentFacts = {
      questionsWaiting: snapshot.unanswered.map((row) => ({ author: row.author, channel: row.channel, hoursAgo: row.hoursAgo })),
      quietNewcomers: snapshot.quietNewcomers,
      courseStall: await courseStall(ctx, args.communityId, nowMs),
      weekMessages: snapshot.week.messages,
    };
    const records = (await ctx.db.query("communityOwnerMoments")
      .withIndex("by_community_key", (q: any) => q.eq("communityId", args.communityId)).take(50))
      .map((row: any) => ({ key: String(row.key), shownAt: Number(row.shownAt), dismissedAt: typeof row.dismissedAt === "number" ? row.dismissedAt : null }));
    return pickOwnerMoment({ facts, records, nowMs });
  },
});

// The card was shown: it starts its week (shown again while this week's card
// is open, nothing changes).
export const markOwnerMomentShown = mutation({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), key: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.authSubject, args.communityId);
    if (!MOMENT_KEYS.has(args.key)) throw new Error("community_owner_moment_unknown");
    const nowMs = Date.now();
    const find = (key: string) => ctx.db.query("communityOwnerMoments")
      .withIndex("by_community_key", (q: any) => q.eq("communityId", args.communityId).eq("key", key)).first();
    const existing = await find(args.key);
    if (existing && existing.dismissedAt === undefined && nowMs - existing.shownAt < 7 * DAY_MS) return null;
    if (existing) await ctx.db.patch(existing._id, { shownAt: nowMs, dismissedAt: undefined, updatedAt: nowMs });
    else await ctx.db.insert("communityOwnerMoments", { communityId: args.communityId, key: args.key, shownAt: nowMs, createdAt: nowMs, updatedAt: nowMs });
    return null;
  },
});

export const dismissOwnerMoment = mutation({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), key: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.authSubject, args.communityId);
    if (!MOMENT_KEYS.has(args.key)) throw new Error("community_owner_moment_unknown");
    const nowMs = Date.now();
    const existing = await ctx.db.query("communityOwnerMoments")
      .withIndex("by_community_key", (q: any) => q.eq("communityId", args.communityId).eq("key", args.key)).first();
    if (existing) await ctx.db.patch(existing._id, { dismissedAt: nowMs, updatedAt: nowMs });
    else await ctx.db.insert("communityOwnerMoments", { communityId: args.communityId, key: args.key, shownAt: nowMs, dismissedAt: nowMs, createdAt: nowMs, updatedAt: nowMs });
    return null;
  },
});
