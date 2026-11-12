// Home's centre (docs/specs/community-agent-gateway-v0.md, slice 2): the last
// visit, what happened since, and a member's next step. No model. Everything
// read here is what this viewer may already see: shared channels, Knowledge's
// notes, events; names of who joined only for the owner.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { listSharedChannelReadableRows } from "./communityChannelCore";
import {
  communityMembershipRowIsActive,
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
  normalizeIdValue,
  requireCommunityChatAccess,
} from "./communityCore";
import { displayName } from "./communityFounderBrief";
import { homeMoments, homeRecent, memberNextStep, type HomePost } from "../shared/communityHomeMoments";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
// A new visit starts after this long away.
const NEW_VISIT_AFTER_MS = 30 * MINUTE_MS;
// "Since you were last here" never reaches further back than this.
const MAX_LOOKBACK_MS = 14 * DAY_MS;
const FIRST_VISIT_LOOKBACK_MS = 7 * DAY_MS;
const SCAN_LIMIT = 200;
const COURSES_CAP = 20;
const LESSONS_CAP = 100;

async function viewer(ctx: any, authSubject: string | undefined, communityId: any) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: authSubject ?? null });
  const { community } = await requireCommunityChatAccess({ ctx, communityId, userId });
  return { userId, community };
}

async function visitRow(ctx: any, communityId: any, userId: any) {
  return await ctx.db.query("communityMemberVisits")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId)).first();
}

// Opening Home: a new visit begins after half an hour away, and the one
// before it becomes "since you were last here".
export const recordHomeVisit = mutation({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const { userId } = await viewer(ctx, args.authSubject, args.communityId);
    const nowMs = Date.now();
    const row = await visitRow(ctx, args.communityId, userId);
    if (!row) {
      await ctx.db.insert("communityMemberVisits", { communityId: args.communityId, userId, currentVisitAt: nowMs, updatedAt: nowMs });
    } else if (nowMs - row.currentVisitAt >= NEW_VISIT_AFTER_MS) {
      await ctx.db.patch(row._id, { previousVisitAt: row.currentVisitAt, currentVisitAt: nowMs, updatedAt: nowMs });
    } else {
      await ctx.db.patch(row._id, { currentVisitAt: nowMs, updatedAt: nowMs });
    }
    return null;
  },
});

const reactionCount = (row: any) => (Array.isArray(row.reactionSummary) ? row.reactionSummary : [])
  .reduce((total: number, entry: any) => total + (Number(entry?.count) || 0), 0);

export const getHomeMoments = query({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    // "View as a member": the owner asks for the member's view.
    asMember: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId, community } = await viewer(ctx, args.authSubject, args.communityId);
    const nowMs = Date.now();
    const isOwner = String(community.ownerId) === String(userId);
    const audience: "host" | "member" = isOwner && !args.asMember ? "host" : "member";
    const visit = await visitRow(ctx, args.communityId, userId);
    const since = Math.max(nowMs - MAX_LOOKBACK_MS, visit?.previousVisitAt ?? nowMs - FIRST_VISIT_LOOKBACK_MS);

    const [roots, replies] = await Promise.all([
      listSharedChannelReadableRows<any>({ ctx, tableName: "communityInteractionRoots", communityId: args.communityId, limit: SCAN_LIMIT }),
      listSharedChannelReadableRows<any>({ ctx, tableName: "communityInteractionReplies", communityId: args.communityId, limit: SCAN_LIMIT }),
    ]);
    const names = new Map<string, string>();
    const channels = new Map<string, { name: string; slug: string }>();
    const channelOf = async (channelId: any) => {
      const key = String(channelId ?? "");
      if (!channels.has(key)) {
        const channel = key ? ((await ctx.db.get(channelId)) as any) : null;
        channels.set(key, { name: String(channel?.name ?? "a channel"), slug: String(channel?.slug ?? "") });
      }
      return channels.get(key)!;
    };
    const posts: HomePost[] = [];
    for (const row of roots.filter((root: any) => root.status === "live" && root.actorType === "human" && Number(root.createdAt) >= nowMs - MAX_LOOKBACK_MS).slice(0, 60)) {
      const text = String(row.title || row.contentSummary || "").trim();
      if (!text) continue;
      const channel = await channelOf(row.channelId);
      posts.push({
        id: String(row._id), channel: channel.name, channelSlug: channel.slug,
        author: await displayName(ctx, row.actorUserId, names), text,
        replies: Number(row.replyCount ?? 0), reactions: reactionCount(row),
        asks: row.kind === "question" || text.includes("?"),
        createdAt: Number(row.createdAt),
      });
    }

    const notes = (await ctx.db.query("communityNotes")
      .withIndex("by_community_updatedAt", (q: any) => q.eq("communityId", args.communityId).gte("updatedAt", since)).take(20))
      .map((note: any) => ({ slug: String(note.slug), title: String(note.title), createdAt: Number(note.createdAt) }));

    const joinedRows = (await ctx.db.query("communityMemberships")
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId).gte("createdAt", since)).take(50))
      .filter((row: any) => communityMembershipRowIsActive(row) && String(row.userId) !== String(community.ownerId) && String(row.userId) !== String(userId));
    const joinNames: string[] = [];
    if (audience === "host") for (const row of joinedRows.slice(0, 3)) joinNames.push(await displayName(ctx, row.userId, names));

    const event = (await ctx.db.query("communityEvents")
      .withIndex("by_community_status_startsAt", (q: any) => q.eq("communityId", args.communityId).eq("status", "live").gte("startsAt", nowMs).lt("startsAt", nowMs + 3 * DAY_MS))
      .first()) as any;
    const nextEvent = event ? { title: String(event.title ?? "").slice(0, 120), startsAt: new Date(Number(event.startsAt)).toISOString() } : null;

    const input = { audience, since, posts, notes, joins: { count: joinedRows.length, names: joinNames }, nextEvent };

    // A member's next step.
    let nextStep = null;
    if (audience === "member") {
      const membership = await ctx.db.query("communityMemberships")
        .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", userId)).first();
      const general = await ctx.db.query("communityChannels")
        .withIndex("by_community_systemRole", (q: any) => q.eq("communityId", args.communityId).eq("systemRole", "general")).first();
      const mine = (row: any) => String(row.actorUserId ?? "") === String(userId);
      const going = event
        ? Boolean(await ctx.db.query("communityEventGoing")
          .withIndex("by_event_occurrence_user", (q: any) => q.eq("eventId", event._id).eq("occurrenceStartsAt", Number(event.startsAt)).eq("userId", userId)).first())
        : false;
      nextStep = memberNextStep({
        courseInProgress: await courseInProgress(ctx, args.communityId, userId),
        hasPosted: roots.some(mine) || replies.some(mine),
        joinedRecently: Boolean(membership && nowMs - Number(membership.createdAt) < 14 * DAY_MS),
        generalChannel: general?.name ? String(general.name) : null,
        nextEvent: nextEvent ? { ...nextEvent, going } : null,
      });
    }

    return {
      since: new Date(since).toISOString(),
      firstVisit: !visit?.previousVisitAt,
      moments: homeMoments(input),
      recent: homeRecent(input),
      nextStep,
    };
  },
});

// The first live course this member has started and not finished, and the
// next lesson in it.
async function courseInProgress(ctx: any, communityId: any, userId: any) {
  const doneRows = (await ctx.db.query("communityLessonProgress")
    .withIndex("by_user_resource", (q: any) => q.eq("userId", userId)).take(500))
    .filter((row: any) => String(row.communityId) === String(communityId));
  if (!doneRows.length) return null;
  const done = new Set(doneRows.map((row: any) => String(row.resourceId)));
  const moduleIds = new Set<string>();
  for (const row of doneRows.slice(0, 50)) {
    const resource = await ctx.db.get(row.resourceId);
    if (resource?.moduleId) moduleIds.add(String(resource.moduleId));
  }
  for (const moduleId of [...moduleIds].slice(0, COURSES_CAP)) {
    const module = await ctx.db.get(moduleId as any);
    if (!module || !communityResourceModuleIsLive(module)) continue;
    const live = new Set([normalizeIdValue(module._id)]);
    const lessons = (await ctx.db.query("communityResources")
      .withIndex("by_community_module", (q: any) => q.eq("communityId", communityId).eq("moduleId", module._id)).take(LESSONS_CAP * 2))
      .filter((row: any) => communityResourceIsLiveModulePage(row, live))
      .sort((a: any, b: any) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) || a.createdAt - b.createdAt)
      .slice(0, LESSONS_CAP);
    const nextIndex = lessons.findIndex((lesson: any) => !done.has(String(lesson._id)));
    if (nextIndex < 0) continue;
    return { course: String(module.name ?? "your course"), lessonNumber: nextIndex + 1, total: lessons.length, lessonTitle: String(lessons[nextIndex].title ?? "") };
  }
  return null;
}
