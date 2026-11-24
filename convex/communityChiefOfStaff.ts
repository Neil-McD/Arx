// Founder Chief of Staff signals (docs/specs/proactive-community-agent-v0.md,
// slice 3): bounded, deterministic operator intelligence shared by the daily
// Founder Brief (convex/communityFounderBrief.ts) and owner/admin analytics
// (convex/communityAdmin.ts -> builder/analytics.json).
//
// Privacy invariant: founders see outcomes, counts, and course/activity status
// — NEVER members' private Agent conversation text and NEVER private pod
// message contents.
import {
  communityMembershipRowIsActive,
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
  normalizeIdValue,
} from "./communityCore";
import { listSharedChannelReadableRows } from "./communityChannelCore";
import { readCanonicalUserIdentityProjection } from "./profileCore";
import {
  COURSE_STALL_MIN_AGE_MS,
  MEMBER_COACH_DRAFT_MAX_AGE_MS,
  QUIET_MEMBER_MIN_AGE_MS,
} from "../shared/communityMemberCoach";
import { REPLY_DRAFT_MAX_AGE_MS } from "../shared/communityReplyDrafts";

const DAY_MS = 24 * 60 * 60_000;
const WEEK_MS = 7 * DAY_MS;
const COURSES_SCAN_CAP = 20;
const LESSONS_PER_COURSE_CAP = 100;
const PROGRESS_ROWS_PER_COURSE_CAP = 200;
const PAID_MEMBERS_SCAN_CAP = 80;
const PODS_SCAN_CAP = 10;
const POD_SEATS_SCAN_CAP = 200;
const POD_MESSAGES_SCAN_CAP = 50;
const SHARED_ACTIVITY_SCAN_CAP = 200;
const NAMES_LIMIT = 5;

export type FounderChiefOfStaffSignals = {
  proactiveGuide: {
    coachDraftsWaiting: number;
    replyDraftsWaiting: number;
    coachSentInWindow: number;
    repliesAutoPostedInWindow: number;
  };
  stalledLearners: Array<{
    course: string;
    stalledCount: number;
    sampleNames: string[];
  }>;
  quietPayingMembers: {
    count: number;
    names: string[];
  };
  risingContributors: Array<{
    name: string;
    posts: number;
    replies: number;
  }>;
  podHealth: Array<{
    name: string;
    seats: number;
    messages7d: number;
  }>;
};

async function nameOf(ctx: any, userId: unknown, cache: Map<string, string>): Promise<string> {
  const key = String(userId ?? "");
  if (!key) return "A member";
  if (!cache.has(key)) {
    const identity = await readCanonicalUserIdentityProjection(ctx, userId as any).catch(() => null);
    cache.set(key, identity?.displayName || (identity?.handle ? `@${identity.handle}` : "A member"));
  }
  return cache.get(key)!;
}

async function readProactiveGuideSummary(
  ctx: any,
  communityId: any,
  windowStartMs: number,
  nowMs: number,
): Promise<FounderChiefOfStaffSignals["proactiveGuide"]> {
  const [waitingCoach, waitingReplies, sentCoach, postedReplies] = await Promise.all([
    ctx.db
      .query("communityMemberCoachDrafts")
      .withIndex("by_community_status_createdAt", (q: any) =>
        q.eq("communityId", communityId).eq("status", "waiting"),
      )
      .order("desc")
      .take(25),
    ctx.db
      .query("communityReplyDrafts")
      .withIndex("by_community_status_createdAt", (q: any) =>
        q.eq("communityId", communityId).eq("status", "waiting"),
      )
      .order("desc")
      .take(25),
    ctx.db
      .query("communityMemberCoachDrafts")
      .withIndex("by_community_status_createdAt", (q: any) =>
        q.eq("communityId", communityId).eq("status", "sent").gte("createdAt", windowStartMs),
      )
      .take(50),
    ctx.db
      .query("communityReplyDrafts")
      .withIndex("by_community_status_createdAt", (q: any) =>
        q.eq("communityId", communityId).eq("status", "posted").gte("createdAt", windowStartMs),
      )
      .take(50),
  ]);

  return {
    coachDraftsWaiting: waitingCoach.filter((row: any) => nowMs - Number(row.createdAt ?? 0) <= MEMBER_COACH_DRAFT_MAX_AGE_MS).length,
    replyDraftsWaiting: waitingReplies.filter((row: any) => nowMs - Number(row.createdAt ?? 0) <= REPLY_DRAFT_MAX_AGE_MS).length,
    coachSentInWindow: sentCoach.filter((row: any) => Number(row.sentAt ?? row.createdAt ?? 0) >= windowStartMs).length,
    repliesAutoPostedInWindow: postedReplies.filter((row: any) => row.deliveryMode === "auto").length,
  };
}

async function readStalledLearnersSummary(
  ctx: any,
  community: any,
  nowMs: number,
  names: Map<string, string>,
): Promise<FounderChiefOfStaffSignals["stalledLearners"]> {
  const ownerId = String(community.ownerId);
  const modules = ((await ctx.db
    .query("communityResourceModules")
    .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
    .take(COURSES_SCAN_CAP * 2)) as any[])
    .filter((module) => communityResourceModuleIsLive(module))
    .slice(0, COURSES_SCAN_CAP);
  if (!modules.length) return [];

  const activeCache = new Map<string, boolean>();
  const isActiveNonOwner = async (userId: any): Promise<boolean> => {
    const key = String(userId);
    if (key === ownerId) return false;
    if (!activeCache.has(key)) {
      const membership = await ctx.db
        .query("communityMemberships")
        .withIndex("by_community_user", (q: any) => q.eq("communityId", community._id).eq("userId", userId))
        .first();
      activeCache.set(key, communityMembershipRowIsActive(membership));
    }
    return activeCache.get(key)!;
  };

  const results: FounderChiefOfStaffSignals["stalledLearners"] = [];
  for (const module of modules) {
    const liveSet = new Set([normalizeIdValue(module._id)]);
    const lessons = ((await ctx.db
      .query("communityResources")
      .withIndex("by_community_module", (q: any) => q.eq("communityId", community._id).eq("moduleId", module._id))
      .take(LESSONS_PER_COURSE_CAP * 2)) as any[])
      .filter((row) => communityResourceIsLiveModulePage(row, liveSet))
      .slice(0, LESSONS_PER_COURSE_CAP);
    if (lessons.length < 2) continue;

    const lessonIdSet = new Set(lessons.map((lesson) => String(lesson._id)));
    const projRows = (await ctx.db
      .query("communityCourseProgress")
      .withIndex("by_community_module", (q: any) => q.eq("communityId", community._id).eq("moduleId", module._id))
      .take(PROGRESS_ROWS_PER_COURSE_CAP)) as any[];

    const stalledUserIds: any[] = [];
    if (projRows.length > 0) {
      for (const row of projRows) {
        const doneCount = (row.doneResourceIds ?? []).filter((id: any) => lessonIdSet.has(String(id))).length;
        if (doneCount <= 0 || doneCount >= lessons.length) continue;
        if (nowMs - Number(row.lastCompletedAt ?? 0) < COURSE_STALL_MIN_AGE_MS) continue;
        if (await isActiveNonOwner(row.userId)) stalledUserIds.push(row.userId);
      }
    } else {
      // Fallback for courses without communityCourseProgress rows yet: inspect first 25 lessons.
      const byUser = new Map<string, { userId: any; done: Set<string>; lastAt: number }>();
      for (const lesson of lessons.slice(0, 25)) {
        const rows = (await ctx.db
          .query("communityLessonProgress")
          .withIndex("by_resource", (q: any) => q.eq("resourceId", lesson._id))
          .take(PROGRESS_ROWS_PER_COURSE_CAP)) as any[];
        for (const row of rows) {
          const key = String(row.userId);
          const entry = byUser.get(key) ?? { userId: row.userId, done: new Set<string>(), lastAt: 0 };
          entry.done.add(String(row.resourceId));
          entry.lastAt = Math.max(entry.lastAt, Number(row.completedAt ?? 0));
          byUser.set(key, entry);
        }
      }
      for (const entry of byUser.values()) {
        if (entry.done.size <= 0 || entry.done.size >= lessons.length) continue;
        if (nowMs - entry.lastAt < COURSE_STALL_MIN_AGE_MS) continue;
        if (await isActiveNonOwner(entry.userId)) stalledUserIds.push(entry.userId);
      }
    }

    if (stalledUserIds.length > 0) {
      const sampleNames = await Promise.all(
        stalledUserIds.slice(0, 3).map((uid) => nameOf(ctx, uid, names)),
      );
      results.push({
        course: String(module.name ?? "Untitled course").trim() || "Untitled course",
        stalledCount: stalledUserIds.length,
        sampleNames,
      });
    }
  }
  return results.sort((a, b) => b.stalledCount - a.stalledCount).slice(0, 3);
}

async function readQuietPayingMembers(
  ctx: any,
  community: any,
  nowMs: number,
  names: Map<string, string>,
): Promise<FounderChiefOfStaffSignals["quietPayingMembers"]> {
  const ownerId = String(community.ownerId);
  const cutoffMs = nowMs - QUIET_MEMBER_MIN_AGE_MS;
  const memberships = (await ctx.db
    .query("communityMemberships")
    .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", community._id).lt("createdAt", cutoffMs))
    .order("desc")
    .take(PAID_MEMBERS_SCAN_CAP)) as any[];

  const paidActive = memberships.filter(
    (row) =>
      communityMembershipRowIsActive(row) &&
      String(row.userId) !== ownerId &&
      row.accessSource === "paid_subscription",
  );
  if (!paidActive.length) return { count: 0, names: [] };

  const quietIds: any[] = [];
  for (const row of paidActive) {
    const [latestRoot, latestReply, lessonRows] = await Promise.all([
      ctx.db
        .query("communityInteractionRoots")
        .withIndex("by_community_actorUser_createdAt", (q: any) =>
          q.eq("communityId", community._id).eq("actorUserId", row.userId),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("communityInteractionReplies")
        .withIndex("by_community_actorUser_createdAt", (q: any) =>
          q.eq("communityId", community._id).eq("actorUserId", row.userId),
        )
        .order("desc")
        .first(),
      ctx.db
        .query("communityLessonProgress")
        .withIndex("by_community_user", (q: any) => q.eq("communityId", community._id).eq("userId", row.userId))
        .take(25),
    ]);
    const latestRootAt = latestRoot?.status === "live" ? Number(latestRoot.createdAt ?? 0) : 0;
    const latestReplyAt = latestReply?.status === "live" ? Number(latestReply.createdAt ?? 0) : 0;
    const latestLessonAt = lessonRows.reduce((best: number, item: any) => Math.max(best, Number(item.completedAt ?? 0)), 0);
    const lastActiveAt = Math.max(latestRootAt, latestReplyAt, latestLessonAt);
    if (lastActiveAt < cutoffMs) quietIds.push(row.userId);
  }

  const quietNames = await Promise.all(
    quietIds.slice(0, NAMES_LIMIT).map((uid) => nameOf(ctx, uid, names)),
  );
  return { count: quietIds.length, names: quietNames };
}

async function readRisingContributors(
  ctx: any,
  community: any,
  nowMs: number,
  names: Map<string, string>,
): Promise<FounderChiefOfStaffSignals["risingContributors"]> {
  const ownerId = String(community.ownerId);
  const weekCutoff = nowMs - WEEK_MS;
  const [roots, replies] = await Promise.all([
    listSharedChannelReadableRows<any>({ ctx, tableName: "communityInteractionRoots", communityId: community._id, limit: SHARED_ACTIVITY_SCAN_CAP }).catch(() => []),
    listSharedChannelReadableRows<any>({ ctx, tableName: "communityInteractionReplies", communityId: community._id, limit: SHARED_ACTIVITY_SCAN_CAP }).catch(() => []),
  ]);

  const counts = new Map<string, { userId: any; posts: number; replies: number }>();
  for (const row of roots) {
    if (row.status !== "live" || row.actorType !== "human" || !row.actorUserId) continue;
    if (String(row.actorUserId) === ownerId || Number(row.createdAt ?? 0) < weekCutoff) continue;
    const key = String(row.actorUserId);
    const entry = counts.get(key) ?? { userId: row.actorUserId, posts: 0, replies: 0 };
    entry.posts += 1;
    counts.set(key, entry);
  }
  for (const row of replies) {
    if (row.status !== "live" || row.actorType !== "human" || !row.actorUserId) continue;
    if (String(row.actorUserId) === ownerId || Number(row.createdAt ?? 0) < weekCutoff) continue;
    const key = String(row.actorUserId);
    const entry = counts.get(key) ?? { userId: row.actorUserId, posts: 0, replies: 0 };
    entry.replies += 1;
    counts.set(key, entry);
  }

  const top = [...counts.values()]
    .filter((entry) => entry.posts + entry.replies >= 2)
    .sort((a, b) => (b.posts + b.replies) - (a.posts + a.replies) || b.posts - a.posts)
    .slice(0, 3);

  return await Promise.all(
    top.map(async (entry) => ({
      name: await nameOf(ctx, entry.userId, names),
      posts: entry.posts,
      replies: entry.replies,
    })),
  );
}

async function readPodHealthSummary(
  ctx: any,
  communityId: any,
  nowMs: number,
): Promise<FounderChiefOfStaffSignals["podHealth"]> {
  const pods = (await ctx.db
    .query("communityChannels")
    .withIndex("by_community_access_status_position", (q: any) =>
      q.eq("communityId", communityId).eq("accessMode", "restricted").eq("status", "active"),
    )
    .take(PODS_SCAN_CAP)) as any[];
  if (!pods.length) return [];

  const weekCutoff = nowMs - WEEK_MS;
  return await Promise.all(
    pods.map(async (pod) => {
      const [participants, recentRoots] = await Promise.all([
        ctx.db
          .query("communityChannelParticipants")
          .withIndex("by_channel_status", (q: any) => q.eq("channelId", pod._id).eq("status", "active"))
          .take(POD_SEATS_SCAN_CAP),
        ctx.db
          .query("communityInteractionRoots")
          .withIndex("by_community_channel_visibility_status_createdAt", (q: any) =>
            q
              .eq("communityId", communityId)
              .eq("channelId", pod._id)
              .eq("visibilityScope", "community")
              .eq("status", "live")
              .gte("createdAt", weekCutoff),
          )
          .take(POD_MESSAGES_SCAN_CAP),
      ]);
      const humanSeats = participants.filter((row: any) => String(row.principalKey ?? "").startsWith("user:")).length;
      const messages7d = recentRoots.reduce(
        (sum: number, root: any) => sum + 1 + Math.max(0, Number(root.replyCount ?? 0)),
        0,
      );
      return {
        name: String(pod.name ?? pod.slug ?? "Pod").trim() || "Pod",
        seats: humanSeats,
        messages7d,
      };
    }),
  );
}

export async function readFounderChiefOfStaffSignals(
  ctx: any,
  args: { community: any; windowStartMs: number; nowMs: number },
): Promise<FounderChiefOfStaffSignals> {
  const names = new Map<string, string>();
  const [proactiveGuide, stalledLearners, quietPayingMembers, risingContributors, podHealth] = await Promise.all([
    readProactiveGuideSummary(ctx, args.community._id, args.windowStartMs, args.nowMs),
    readStalledLearnersSummary(ctx, args.community, args.nowMs, names),
    readQuietPayingMembers(ctx, args.community, args.nowMs, names),
    readRisingContributors(ctx, args.community, args.nowMs, names),
    readPodHealthSummary(ctx, args.community._id, args.nowMs),
  ]);
  return {
    proactiveGuide,
    stalledLearners,
    quietPayingMembers,
    risingContributors,
    podHealth,
  };
}
