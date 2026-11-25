import { eventViewer, visibleEvents } from "./communityEventAudience";
import { expandCommunityEventRows, listCommunityEventExpansionCandidates } from "./communityEvents";
// Home's "For you" member steps (docs/specs/community-agent-gateway-v0.md):
// everything read here is what this viewer may already see. No model.
import { v } from "convex/values";
import { query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import {
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
  normalizeIdValue,
  requireCommunityChatAccess,
} from "./communityCore";
import { memberNextSteps } from "../shared/communityHomeMoments";

const DAY_MS = 86_400_000;
const COURSES_CAP = 20;
const LESSONS_CAP = 100;

async function viewer(ctx: any, authSubject: string | undefined, communityId: any) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: authSubject ?? null });
  const { community } = await requireCommunityChatAccess({ ctx, communityId, userId });
  return { userId, community };
}

// The next live event this person may see in the coming three days (their own
// pod's call counts; individually cancelled dates are skipped).
async function nextEventFor(ctx: any, communityId: any, userId: any, nowMs: number) {
  const candidates = await listCommunityEventExpansionCandidates({
    ctx,
    communityId,
    startMs: nowMs,
    endMs: nowMs + 3 * DAY_MS,
    includeCancelled: false,
  });
  const visible = await visibleEvents(candidates, eventViewer(ctx, communityId, userId));
  const event = expandCommunityEventRows({
    rows: visible,
    startMs: nowMs,
    endMs: nowMs + 3 * DAY_MS,
    includeCancelled: false,
    limit: 1,
  })[0];
  return event ? { title: String(event.title ?? "").slice(0, 120), startsAt: event.starts_at } : null;
}

// Home's "For you" (a member's list): everything that is for them now, most
// useful first. No model; only what this person may already see.
export const getMemberHomeSteps = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const { userId } = await viewer(ctx, args.authSubject, args.communityId);
    const nowMs = Date.now();
    const [myRoots, myReplies, membership, general] = await Promise.all([
      ctx.db.query("communityInteractionRoots")
        .withIndex("by_community_actorUser_createdAt", (q: any) =>
          q.eq("communityId", args.communityId).eq("actorUserId", userId))
        .order("desc")
        .take(5),
      ctx.db.query("communityInteractionReplies")
        .withIndex("by_community_actorUser_createdAt", (q: any) =>
          q.eq("communityId", args.communityId).eq("actorUserId", userId))
        .order("desc")
        .take(5),
      ctx.db.query("communityMemberships").withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", userId)).first(),
      ctx.db.query("communityChannels").withIndex("by_community_systemRole", (q: any) => q.eq("communityId", args.communityId).eq("systemRole", "general")).first(),
    ]);
    const isLive = (row: any) => row.status === "live";
    return memberNextSteps({
      courseInProgress: await courseInProgress(ctx, args.communityId, userId),
      hasPosted: myRoots.some(isLive) || myReplies.some(isLive),
      joinedRecently: Boolean(membership && nowMs - Number(membership.createdAt) < 14 * DAY_MS),
      generalChannel: general?.name ? String(general.name) : null,
      nextEvent: await nextEventFor(ctx, args.communityId, userId, nowMs),
    });
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
