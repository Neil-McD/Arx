// Proactive Member Coach (docs/specs/proactive-community-agent-v0.md, slice 1):
// Deterministic member signals -> interruption-budget gate -> silence-by-default
// judge -> draft in owner's "Your guide suggests" inbox (or auto-send per
// reason) -> atomic delivery into the member's private Agent conversation.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { communityAgentIsOn } from "./communityApps";
import {
  communityMembershipRowIsActive,
  getActiveCommunityBlock,
  getUniqueCommunityMembershipByPair,
  requireCommunityChatAccess,
} from "./communityCore";
import { expandCommunityEventRows, listCommunityEventExpansionCandidates } from "./communityEvents";
import { readMemberCourseProgress } from "./communityLessonProgress";
import { communityTimeZone } from "./communityMemory";
import { readPersonFacts } from "./communityPersonFacts";
import { resolveCommunityInferenceFundingForAction } from "./founderInferenceRuntime";
import { startFundedInferenceRun } from "./fundedInferenceGateway";
import { deliverAssistantMessageToMemberCommunityThread } from "./threads";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { communityIsActive } from "../shared/communityLifecycle";
import { renderCommunityHandbook } from "../shared/communityHandbook";
import {
  COURSE_STALL_MAX_AGE_MS,
  COURSE_STALL_MIN_AGE_MS,
  MEMBER_COACH_DAILY_COMMUNITY_CAP,
  MEMBER_COACH_DRAFT_MAX_AGE_MS,
  MEMBER_COACH_EDIT_MAX_CHARS,
  MEMBER_COACH_INSTRUCTIONS,
  MEMBER_COACH_REASON_LABELS,
  MEMBER_COACH_SCAN_INTERVAL_MS,
  MEMBER_COACH_WEEK_WINDOW_MS,
  QUIET_MEMBER_EVENT_HORIZON_MS,
  QUIET_MEMBER_MAX_AGE_MS,
  QUIET_MEMBER_MIN_AGE_MS,
  QUIET_NEWCOMER_MAX_AGE_MS,
  QUIET_NEWCOMER_MIN_AGE_MS,
  evaluateMemberCoachGate,
  normalizeMemberCoachReasons,
  parseMemberCoachJudgeResponse,
  type MemberCoachDraftView,
  type MemberCoachHistoryRow,
  type MemberCoachPreferenceView,
  type MemberCoachReason,
  type MemberCoachSettingsView,
} from "../shared/communityMemberCoach";

const internalRefs = internal as any;
const DAY_MS = 24 * 60 * 60_000;
const CLAIM_LEASE_MS = 10 * 60_000;
const MAX_COMMUNITIES_PER_RUN = 20;
const COMMUNITY_CONCURRENCY = 4;
const CANDIDATE_MEMBERS_SCAN = 60;
const JUDGE_MAX_OUTPUT_TOKENS = 400;
const HANDBOOK_EXCERPT_CHARS = 1_500;

const reasonValidator = v.union(
  v.literal("quiet_newcomer"),
  v.literal("course_stall"),
  v.literal("quiet_member"),
);

async function requireOwner(ctx: any, authSubject: string | undefined, communityId: Id<"communities">) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: authSubject ?? null });
  const community: any = await ctx.db.get(communityId);
  if (!community || String(community.ownerId) !== String(userId)) {
    throw new Error("community_member_coach_owner_required");
  }
  return { userId, community };
}

async function readMemberMutedState(
  ctx: any,
  communityId: Id<"communities">,
  userId: Id<"users">,
): Promise<{ muted: boolean; coachMuted: boolean }> {
  const row = await ctx.db
    .query("communityMemberSettings")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId))
    .first();
  return {
    muted: Boolean(row?.muted),
    coachMuted: Boolean(row?.coachMuted),
  };
}

async function readLastUserAgentMessageAt(
  ctx: any,
  communityId: Id<"communities">,
  userId: Id<"users">,
): Promise<number | null> {
  const channel = await ctx.db
    .query("memberAgentChannels")
    .withIndex("by_owner_scope_community", (q: any) =>
      q.eq("ownerId", userId).eq("scopeKey", "community").eq("communityId", communityId),
    )
    .unique();
  if (!channel?.activeEpisodeId) return null;
  const episode = await ctx.db.get(channel.activeEpisodeId);
  if (!episode?.threadId) return null;
  const recent = await ctx.db
    .query("cloudMessages")
    .withIndex("by_thread_seq", (q: any) => q.eq("threadId", episode.threadId))
    .order("desc")
    .take(8);
  const lastUser = recent.find((msg: any) => msg.role === "user");
  return typeof lastUser?.createdAt === "number" ? lastUser.createdAt : null;
}

async function readLatestMemberChannelActivityAt(
  ctx: any,
  communityId: Id<"communities">,
  userId: Id<"users">,
): Promise<number | null> {
  const [latestRoot, latestReply] = await Promise.all([
    ctx.db
      .query("communityInteractionRoots")
      .withIndex("by_community_actorUser_createdAt", (q: any) =>
        q.eq("communityId", communityId).eq("actorUserId", userId),
      )
      .order("desc")
      .first(),
    ctx.db
      .query("communityInteractionReplies")
      .withIndex("by_community_actorUser_createdAt", (q: any) =>
        q.eq("communityId", communityId).eq("actorUserId", userId),
      )
      .order("desc")
      .first(),
  ]);
  const rootAt = latestRoot?.status === "live" ? Number(latestRoot.createdAt ?? 0) : 0;
  const replyAt = latestReply?.status === "live" ? Number(latestReply.createdAt ?? 0) : 0;
  const best = Math.max(rootAt, replyAt);
  return best > 0 ? best : null;
}

async function readRecentCoachHistoryForMember(
  ctx: any,
  communityId: Id<"communities">,
  memberUserId: Id<"users">,
  excludeDraftId?: Id<"communityMemberCoachDrafts">,
): Promise<MemberCoachHistoryRow[]> {
  const rows = await ctx.db
    .query("communityMemberCoachDrafts")
    .withIndex("by_community_member_createdAt", (q: any) =>
      q.eq("communityId", communityId).eq("memberUserId", memberUserId),
    )
    .order("desc")
    .take(25);
  return rows
    .filter((row: any) => !excludeDraftId || String(row._id) !== String(excludeDraftId))
    .map((row: any) => ({
      status: row.status,
      reason: row.reason,
      dedupeKey: String(row.dedupeKey ?? ""),
      createdAt: Number(row.createdAt ?? 0),
      ...(typeof row.sentAt === "number" ? { sentAt: row.sentAt } : {}),
    }));
}

async function countCommunityCoachTouchesToday(
  ctx: any,
  communityId: Id<"communities">,
  nowMs: number,
): Promise<number> {
  const cutoff = nowMs - DAY_MS;
  const batches = await Promise.all(
    (["waiting", "sent", "skipped"] as const).map((status) =>
      ctx.db
        .query("communityMemberCoachDrafts")
        .withIndex("by_community_status_createdAt", (q: any) =>
          q.eq("communityId", communityId).eq("status", status).gte("createdAt", cutoff),
        )
        .take(MEMBER_COACH_DAILY_COMMUNITY_CAP),
    ),
  );
  return batches.reduce((sum, batch) => sum + batch.length, 0);
}

async function checkMemberEligibleForCoach(
  ctx: any,
  community: any,
  memberUserId: Id<"users">,
): Promise<{ ok: true; membership: any } | { ok: false; code: string }> {
  if (String(community.ownerId) === String(memberUserId)) {
    return { ok: false, code: "owner_excluded" };
  }
  const [membership, block, muteState] = await Promise.all([
    getUniqueCommunityMembershipByPair({ ctx, communityId: community._id, userId: memberUserId }),
    getActiveCommunityBlock({ ctx, communityId: community._id, userId: memberUserId }),
    readMemberMutedState(ctx, community._id, memberUserId),
  ]);
  if (!communityMembershipRowIsActive(membership)) return { ok: false, code: "member_inactive" };
  if (block) return { ok: false, code: "member_blocked" };
  if (muteState.muted || muteState.coachMuted) return { ok: false, code: "member_muted" };
  return { ok: true, membership };
}

function daysBetween(olderMs: number, newerMs: number): number {
  return Math.max(1, Math.floor((newerMs - olderMs) / DAY_MS));
}

function monthKey(nowMs: number): string {
  const d = new Date(nowMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ---------- cron enrollment & scan lifecycle ----------

// Enrolls one bounded page of active founderSubscriptions in Draft mode
// (enabled: true, autoReasons: []) and returns the next pagination cursor.
export const enrollFounderSubscriptionsPageInternal = internalMutation({
  args: { nowMs: v.number(), cursor: v.optional(v.union(v.string(), v.null())), pageSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const numItems = Math.max(1, Math.min(100, Math.floor(args.pageSize ?? 100)));
    const page = await ctx.db
      .query("founderSubscriptions")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .paginate({ numItems, cursor: args.cursor ?? null });
    let enrolled = 0;
    for (const sub of page.page) {
      if (!sub.communityId) continue;
      const existing = await ctx.db
        .query("communityMemberCoachSettings")
        .withIndex("by_community", (q) => q.eq("communityId", sub.communityId!))
        .first();
      if (!existing) {
        await ctx.db.insert("communityMemberCoachSettings", {
          communityId: sub.communityId,
          enabled: true,
          autoReasons: [],
          nextScanAt: args.nowMs,
          createdAt: args.nowMs,
          updatedAt: args.nowMs,
        });
        enrolled += 1;
      }
    }
    return {
      enrolled,
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
    };
  },
});

// Enrolls operator-owned communities in Draft mode and returns communities
// whose coach scan is due now.
export const enrollAndListDueMemberCoachCommunitiesInternal = internalMutation({
  args: { nowMs: v.number() },
  handler: async (ctx, args) => {
    const opOwners = await ctx.db
      .query("operatorRoles")
      .withIndex("by_active_role", (q) => q.eq("active", true).eq("role", "owner"))
      .take(5);
    for (const op of opOwners) {
      const owned = await ctx.db
        .query("communities")
        .withIndex("by_owner", (q) => q.eq("ownerId", op.userId))
        .take(20);
      for (const comm of owned) {
        if (!communityIsActive(comm)) continue;
        const existing = await ctx.db
          .query("communityMemberCoachSettings")
          .withIndex("by_community", (q) => q.eq("communityId", comm._id))
          .first();
        if (!existing) {
          await ctx.db.insert("communityMemberCoachSettings", {
            communityId: comm._id,
            enabled: true,
            autoReasons: [],
            nextScanAt: args.nowMs,
            createdAt: args.nowMs,
            updatedAt: args.nowMs,
          });
        }
      }
    }

    const due = await ctx.db
      .query("communityMemberCoachSettings")
      .withIndex("by_enabled_nextScanAt", (q) => q.eq("enabled", true).lte("nextScanAt", args.nowMs))
      .take(MAX_COMMUNITIES_PER_RUN);
    return due.map((row) => ({ settingsId: row._id, communityId: row.communityId }));
  },
});

export const claimCommunityMemberCoachScanInternal = internalMutation({
  args: { settingsId: v.id("communityMemberCoachSettings"), nowMs: v.number() },
  handler: async (ctx, args) => {
    const settings = await ctx.db.get(args.settingsId);
    if (!settings || !settings.enabled) return null;
    if (typeof settings.leaseUntil === "number" && settings.leaseUntil > args.nowMs) return null;
    if (typeof settings.nextScanAt === "number" && settings.nextScanAt > args.nowMs + 60_000) return null;

    const community = await ctx.db.get(settings.communityId);
    if (!community || !communityIsActive(community) || !(await communityAgentIsOn(ctx, settings.communityId))) {
      await ctx.db.patch(settings._id, {
        nextScanAt: args.nowMs + MEMBER_COACH_SCAN_INTERVAL_MS,
        leaseUntil: undefined,
        updatedAt: args.nowMs,
      });
      return null;
    }

    await ctx.db.patch(settings._id, {
      leaseUntil: args.nowMs + CLAIM_LEASE_MS,
      updatedAt: args.nowMs,
    });
    return {
      settingsId: settings._id,
      communityId: community._id,
      communityName: String(community.name ?? "this community"),
      communityOneLiner: String(community.oneLiner ?? "").trim() || null,
      ownerUserId: community.ownerId,
      autoReasons: normalizeMemberCoachReasons(settings.autoReasons),
      scanCursorCreatedAt: typeof settings.scanCursorCreatedAt === "number" ? settings.scanCursorCreatedAt : null,
    };
  },
});

export const finishCommunityMemberCoachScanInternal = internalMutation({
  args: {
    settingsId: v.id("communityMemberCoachSettings"),
    nowMs: v.number(),
    nextScanCursorCreatedAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const settings = await ctx.db.get(args.settingsId);
    if (!settings) return;
    await ctx.db.patch(settings._id, {
      leaseUntil: undefined,
      nextScanAt: args.nowMs + MEMBER_COACH_SCAN_INTERVAL_MS,
      ...(args.nextScanCursorCreatedAt !== undefined
        ? { scanCursorCreatedAt: args.nextScanCursorCreatedAt ?? undefined }
        : {}),
      updatedAt: args.nowMs,
    });
  },
});

// Deterministic candidate selector + gate: rotates through the full membership
// roster in bounded batches (persisting scanCursorCreatedAt) while also checking
// recent newcomers so large communities never starve older members or newcomers.
export const readNextMemberCoachCandidateInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    autoReasons: v.array(reasonValidator),
    nowMs: v.number(),
    scanCursorCreatedAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const community: any = await ctx.db.get(args.communityId);
    if (!community || !communityIsActive(community)) return { candidate: null, nextScanCursorCreatedAt: null as number | null };
    const touchedToday = await countCommunityCoachTouchesToday(ctx, args.communityId, args.nowMs);
    if (touchedToday >= MEMBER_COACH_DAILY_COMMUNITY_CAP) {
      return { candidate: null, nextScanCursorCreatedAt: args.scanCursorCreatedAt ?? null };
    }

    const tz = await communityTimeZone(ctx, args.communityId);
    const autoSet = new Set<MemberCoachReason>(normalizeMemberCoachReasons(args.autoReasons));
    const cursorMs = typeof args.scanCursorCreatedAt === "number" ? args.scanCursorCreatedAt : null;

    // Rotating bounded scan of the full roster (oldest-past-cursor, wrapping back
    // to newest when the tail is reached) plus a small recent-newcomers window.
    const [rotatingBatch, recentNewcomerBatch, eventCandidates] = await Promise.all([
      ctx.db
        .query("communityMemberships")
        .withIndex("by_community_createdAt", (q) =>
          cursorMs !== null
            ? q.eq("communityId", args.communityId).lt("createdAt", cursorMs)
            : q.eq("communityId", args.communityId),
        )
        .order("desc")
        .take(CANDIDATE_MEMBERS_SCAN),
      cursorMs !== null
        ? ctx.db
            .query("communityMemberships")
            .withIndex("by_community_createdAt", (q) =>
              q.eq("communityId", args.communityId).gte("createdAt", args.nowMs - QUIET_NEWCOMER_MAX_AGE_MS),
            )
            .order("desc")
            .take(20)
        : Promise.resolve([]),
      listCommunityEventExpansionCandidates({
        ctx,
        communityId: args.communityId,
        startMs: args.nowMs,
        endMs: args.nowMs + QUIET_MEMBER_EVENT_HORIZON_MS,
        includeCancelled: false,
      }),
    ]);

    const nextScanCursorCreatedAt =
      rotatingBatch.length >= CANDIDATE_MEMBERS_SCAN
        ? Number(rotatingBatch[rotatingBatch.length - 1]!.createdAt)
        : null;

    const seenMembershipIds = new Set<string>();
    const memberships: any[] = [];
    for (const row of [...rotatingBatch, ...recentNewcomerBatch]) {
      const id = String(row._id);
      if (seenMembershipIds.has(id)) continue;
      seenMembershipIds.add(id);
      memberships.push(row);
    }

    const upcomingCommunityEvent = eventCandidates
      .filter((row) => !row.podChannelId)
      .flatMap((row) =>
        expandCommunityEventRows({
          rows: [row],
          startMs: args.nowMs,
          endMs: args.nowMs + QUIET_MEMBER_EVENT_HORIZON_MS,
          includeCancelled: false,
          limit: 1,
        }),
      )
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0] ?? null;

    type Candidate = {
      priority: number;
      memberUserId: Id<"users">;
      reason: MemberCoachReason;
      dedupeKey: string;
      signalSummary: string;
      signalDetail: string;
      mode: "draft" | "auto";
    };

    const candidates: Candidate[] = [];

    for (const membership of memberships) {
      if (!communityMembershipRowIsActive(membership)) continue;
      if (String(membership.userId) === String(community.ownerId)) continue;
      const eligibility = await checkMemberEligibleForCoach(ctx, community, membership.userId);
      if (!eligibility.ok) continue;

      const joinedAt = Number(membership.activatedAt ?? membership.createdAt ?? 0);
      const memberAgeMs = args.nowMs - joinedAt;
      const [lastChannelAt, lastUserAgentAt, recentHistory, courseProgress] = await Promise.all([
        readLatestMemberChannelActivityAt(ctx, args.communityId, membership.userId),
        readLastUserAgentMessageAt(ctx, args.communityId, membership.userId),
        readRecentCoachHistoryForMember(ctx, args.communityId, membership.userId),
        readMemberCourseProgress(ctx, args.communityId, membership.userId),
      ]);

      // Signal 1 (priority 1): Stalled partway through a published course (5..21 days since last lesson).
      const stalledCourse = courseProgress.find((course) => {
        if (course.finished || course.done <= 0 || !course.next_lesson || !course.last_done_at) return false;
        const lastDoneMs = Date.parse(course.last_done_at);
        if (!Number.isFinite(lastDoneMs)) return false;
        const idleMs = args.nowMs - lastDoneMs;
        return idleMs >= COURSE_STALL_MIN_AGE_MS && idleMs <= COURSE_STALL_MAX_AGE_MS;
      });
      if (stalledCourse && stalledCourse.next_lesson && stalledCourse.last_done_at) {
        const dedupeKey = `course_stall:${stalledCourse.course_id}:${stalledCourse.next_lesson.id}`;
        const gate = evaluateMemberCoachGate({
          nowMs: args.nowMs,
          isOwner: false,
          memberMuted: false,
          reason: "course_stall",
          dedupeKey,
          lastUserThreadMessageAt: lastUserAgentAt,
          recentHistory,
          autoReasonEnabled: autoSet.has("course_stall"),
          communityTimeZone: tz,
        });
        if (gate.allowed) {
          const pausedDays = daysBetween(Date.parse(stalledCourse.last_done_at), args.nowMs);
          candidates.push({
            priority: 1,
            memberUserId: membership.userId,
            reason: "course_stall",
            dedupeKey,
            signalSummary: `Started ${stalledCourse.title} (${stalledCourse.done}/${stalledCourse.of}) · paused before ${stalledCourse.next_lesson.title} for ${pausedDays} days`,
            signalDetail: `Course "${stalledCourse.title}": completed ${stalledCourse.done} of ${stalledCourse.of} lessons. Last lesson finished ${pausedDays} days ago. Exact next lesson: "${stalledCourse.next_lesson.title}".`,
            mode: gate.mode,
          });
          continue;
        }
      }

      // Signal 2 (priority 2): Quiet newcomer (joined 2..14 days ago, no channel posts/replies yet).
      if (
        lastChannelAt === null &&
        memberAgeMs >= QUIET_NEWCOMER_MIN_AGE_MS &&
        memberAgeMs <= QUIET_NEWCOMER_MAX_AGE_MS
      ) {
        const actSeq = Math.max(0, Math.floor(Number(membership.activationSequence ?? 0)));
        const dedupeKey = `quiet_newcomer:act:${actSeq}`;
        const gate = evaluateMemberCoachGate({
          nowMs: args.nowMs,
          isOwner: false,
          memberMuted: false,
          reason: "quiet_newcomer",
          dedupeKey,
          lastUserThreadMessageAt: lastUserAgentAt,
          recentHistory,
          autoReasonEnabled: autoSet.has("quiet_newcomer"),
          communityTimeZone: tz,
        });
        if (gate.allowed) {
          const joinedDays = daysBetween(joinedAt, args.nowMs);
          const firstCourse = courseProgress[0] ?? null;
          const courseHint = firstCourse?.next_lesson
            ? ` Available starter course: "${firstCourse.title}" (first lesson: "${firstCourse.next_lesson.title}").`
            : "";
          candidates.push({
            priority: 2,
            memberUserId: membership.userId,
            reason: "quiet_newcomer",
            dedupeKey,
            signalSummary: `Joined ${joinedDays} ${joinedDays === 1 ? "day" : "days"} ago · hasn't posted yet`,
            signalDetail: `Joined ${joinedDays} days ago and has not posted or replied in any channel yet.${courseHint}`,
            mode: gate.mode,
          });
          continue;
        }
      }

      // Signal 3 (priority 3): Quiet returning member (14..45 days since last activity)
      // ONLY when there is a concrete upcoming community event within 7 days.
      const lastLessonMs = courseProgress.reduce((best, course) => {
        const ms = course.last_done_at ? Date.parse(course.last_done_at) : 0;
        return Number.isFinite(ms) && ms > best ? ms : best;
      }, 0);
      const lastActivityMs = Math.max(lastChannelAt ?? 0, lastLessonMs);
      if (
        upcomingCommunityEvent &&
        memberAgeMs > QUIET_NEWCOMER_MAX_AGE_MS &&
        lastActivityMs > 0 &&
        args.nowMs - lastActivityMs >= QUIET_MEMBER_MIN_AGE_MS &&
        args.nowMs - lastActivityMs <= QUIET_MEMBER_MAX_AGE_MS
      ) {
        const dedupeKey = `quiet_member:${monthKey(args.nowMs)}`;
        const gate = evaluateMemberCoachGate({
          nowMs: args.nowMs,
          isOwner: false,
          memberMuted: false,
          reason: "quiet_member",
          dedupeKey,
          lastUserThreadMessageAt: lastUserAgentAt,
          recentHistory,
          autoReasonEnabled: autoSet.has("quiet_member"),
          communityTimeZone: tz,
        });
        if (gate.allowed) {
          const quietDays = daysBetween(lastActivityMs, args.nowMs);
          candidates.push({
            priority: 3,
            memberUserId: membership.userId,
            reason: "quiet_member",
            dedupeKey,
            signalSummary: `Quiet for ${quietDays} days · upcoming event: ${upcomingCommunityEvent.title}`,
            signalDetail: `Previously active member, quiet for ${quietDays} days. Upcoming community event: "${upcomingCommunityEvent.title}" at ${upcomingCommunityEvent.starts_at_zoned}.`,
            mode: gate.mode,
          });
        }
      }
    }

    if (candidates.length === 0) return { candidate: null, nextScanCursorCreatedAt };
    candidates.sort((a, b) => a.priority - b.priority);
    const chosen = candidates[0]!;

    // Read ONLY this member's own consented self facts (lens: "self" — NEVER host notes
    // and NEVER any other member's private context or threads).
    const person = await readPersonFacts(ctx, {
      communityId: args.communityId,
      subjectUserId: chosen.memberUserId,
      lens: "self",
    });
    if (!person) return { candidate: null, nextScanCursorCreatedAt };

    return {
      nextScanCursorCreatedAt,
      candidate: {
        memberUserId: chosen.memberUserId,
        memberName: person.name || (person.handle ? `@${person.handle}` : "Member"),
        memberBio: person.bio,
        memberSharedFacts: person.shared.slice(0, 6).map((fact) => `${fact.label}: ${fact.body}`),
        reason: chosen.reason,
        dedupeKey: chosen.dedupeKey,
        signalSummary: chosen.signalSummary,
        signalDetail: chosen.signalDetail,
        mode: chosen.mode,
      },
    };
  },
});

export const recordMemberCoachJudgeOutcomeInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    memberUserId: v.id("users"),
    reason: reasonValidator,
    dedupeKey: v.string(),
    signalSummary: v.string(),
    decision: v.union(v.literal("send"), v.literal("skip")),
    text: v.optional(v.string()),
    skipReason: v.optional(v.string()),
    requestedMode: v.union(v.literal("draft"), v.literal("auto")),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const community: any = await ctx.db.get(args.communityId);
    if (!community || !communityIsActive(community) || !(await communityAgentIsOn(ctx, args.communityId))) {
      return { ok: false as const, code: "community_unavailable" };
    }
    const eligibility = await checkMemberEligibleForCoach(ctx, community, args.memberUserId);
    if (!eligibility.ok) return { ok: false as const, code: eligibility.code };

    const [lastUserAgentAt, recentHistory, tz, settingsRow] = await Promise.all([
      readLastUserAgentMessageAt(ctx, args.communityId, args.memberUserId),
      readRecentCoachHistoryForMember(ctx, args.communityId, args.memberUserId),
      communityTimeZone(ctx, args.communityId),
      ctx.db
        .query("communityMemberCoachSettings")
        .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
        .first(),
    ]);
    if (settingsRow && !settingsRow.enabled) return { ok: false as const, code: "coach_disabled" };

    const autoEnabledNow =
      args.requestedMode === "auto" &&
      normalizeMemberCoachReasons(settingsRow?.autoReasons ?? []).includes(args.reason);

    const gate = evaluateMemberCoachGate({
      nowMs: args.nowMs,
      isOwner: false,
      memberMuted: false,
      reason: args.reason,
      dedupeKey: args.dedupeKey,
      lastUserThreadMessageAt: lastUserAgentAt,
      recentHistory,
      autoReasonEnabled: autoEnabledNow,
      communityTimeZone: tz,
    });
    if (!gate.allowed) return { ok: false as const, code: gate.blockReason };

    if (args.decision === "skip" || !args.text?.trim()) {
      await ctx.db.insert("communityMemberCoachDrafts", {
        communityId: args.communityId,
        memberUserId: args.memberUserId,
        reason: args.reason,
        dedupeKey: args.dedupeKey,
        signalSummary: args.signalSummary,
        status: "judge_skipped",
        skipReason: String(args.skipReason ?? "judge_chose_silence").slice(0, 160),
        createdAt: args.nowMs,
        updatedAt: args.nowMs,
      });
      return { ok: true as const, outcome: "judge_skipped" as const };
    }

    const cleanText = args.text.trim();
    if (gate.mode === "auto") {
      const draftId = await ctx.db.insert("communityMemberCoachDrafts", {
        communityId: args.communityId,
        memberUserId: args.memberUserId,
        reason: args.reason,
        dedupeKey: args.dedupeKey,
        signalSummary: args.signalSummary,
        status: "sent",
        deliveryMode: "auto",
        text: cleanText,
        sentText: cleanText,
        sentAt: args.nowMs,
        createdAt: args.nowMs,
        updatedAt: args.nowMs,
      });
      const threadMessageKey = `member-coach:${String(draftId)}`;
      const delivered = await deliverAssistantMessageToMemberCommunityThread(ctx, {
        communityId: args.communityId,
        memberUserId: args.memberUserId,
        messageKey: threadMessageKey,
        contentJson: {
          text: cleanText,
          meta: {
            kind: "member_coach",
            reason: args.reason,
            draft_id: String(draftId),
            delivery_mode: "auto",
          },
        },
      });
      await ctx.db.patch(draftId, {
        threadId: delivered.threadId,
        threadMessageKey,
        updatedAt: args.nowMs,
      });
      return { ok: true as const, outcome: "sent_auto" as const, draftId: String(draftId) };
    }

    const draftId = await ctx.db.insert("communityMemberCoachDrafts", {
      communityId: args.communityId,
      memberUserId: args.memberUserId,
      reason: args.reason,
      dedupeKey: args.dedupeKey,
      signalSummary: args.signalSummary,
      status: "waiting",
      text: cleanText,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return { ok: true as const, outcome: "draft_waiting" as const, draftId: String(draftId) };
  },
});

async function runCoachForCommunity(
  ctx: any,
  item: { settingsId: Id<"communityMemberCoachSettings">; communityId: Id<"communities"> },
  nowMs: number,
): Promise<string> {
  const claim = await ctx.runMutation(internalRefs.communityMemberCoach.claimCommunityMemberCoachScanInternal, {
    settingsId: item.settingsId,
    nowMs,
  });
  if (!claim) return "skipped";

  let nextScanCursorCreatedAt: number | null | undefined = undefined;
  try {
    const scanResult = await ctx.runQuery(internalRefs.communityMemberCoach.readNextMemberCoachCandidateInternal, {
      communityId: claim.communityId,
      autoReasons: claim.autoReasons,
      nowMs,
      scanCursorCreatedAt: claim.scanCursorCreatedAt,
    });
    nextScanCursorCreatedAt = scanResult?.nextScanCursorCreatedAt ?? null;
    const candidate = scanResult?.candidate ?? null;
    if (!candidate) return "no_candidate";

    const funding = await resolveCommunityInferenceFundingForAction(ctx, claim.communityId);
    if (!funding.ok) return "unfunded";

    let run;
    try {
      run = await startFundedInferenceRun({
        ctx,
        communityId: claim.communityId,
        actorUserId: claim.ownerUserId,
        surface: "community_autonomous_cognition",
        receiptKey: `member_coach:${String(claim.communityId)}:${String(candidate.memberUserId)}:${candidate.dedupeKey}:${nowMs}`,
        sourceRunId: `member-coach:${String(claim.communityId)}:${nowMs}`,
        admission: funding,
      });
    } catch {
      return "budget_blocked";
    }

    const handbook = await ctx
      .runQuery(internalRefs.communityHandbook.readApprovedCommunityHandbookInternal, {
        communityId: claim.communityId,
      })
      .catch(() => null);
    const handbookExcerpt = handbook
      ? renderCommunityHandbook(handbook).slice(0, HANDBOOK_EXCERPT_CHARS)
      : "";

    const system = [
      MEMBER_COACH_INSTRUCTIONS,
      `Community: ${claim.communityName}${claim.communityOneLiner ? ` — ${claim.communityOneLiner}` : ""}`,
      ...(handbookExcerpt ? [`Community handbook (excerpt):\n${handbookExcerpt}`] : []),
    ].join("\n\n");

    const user = [
      `Member: ${candidate.memberName}`,
      ...(candidate.memberBio ? [`Bio: ${candidate.memberBio}`] : []),
      ...(candidate.memberSharedFacts.length
        ? [`Shared profile facts:\n- ${candidate.memberSharedFacts.join("\n- ")}`]
        : []),
      `Signal (${candidate.reason}): ${candidate.signalDetail}`,
      "Decide whether to send a short, concrete check-in now or skip.",
    ].join("\n\n");

    let decision: ReturnType<typeof parseMemberCoachJudgeResponse> = {
      action: "skip",
      reason: "provider_failed",
    };
    try {
      const response = await run.request({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        maxTokens: JUDGE_MAX_OUTPUT_TOKENS,
        tools: [],
      });
      if (!response.ok || response.type !== "assistant") {
        await run.fail(response.ok ? "invalid_model_output" : response.code);
        return "provider_failed";
      }
      const settled = await run.settle("provider_completed");
      if (!settled) return "settle_failed";
      decision = parseMemberCoachJudgeResponse(response.assistantText);
    } catch (error) {
      await run
        .fail(error instanceof Error ? error.message.slice(0, 120) : "member_coach_provider_failed")
        .catch(() => {});
      return "provider_failed";
    }

    const saved = await ctx.runMutation(internalRefs.communityMemberCoach.recordMemberCoachJudgeOutcomeInternal, {
      communityId: claim.communityId,
      memberUserId: candidate.memberUserId,
      reason: candidate.reason,
      dedupeKey: candidate.dedupeKey,
      signalSummary: candidate.signalSummary,
      decision: decision.action,
      ...(decision.action === "send" ? { text: decision.text } : { skipReason: decision.reason }),
      requestedMode: candidate.mode,
      nowMs: Date.now(),
    });
    return saved?.ok ? saved.outcome : `blocked:${saved?.code ?? "unknown"}`;
  } finally {
    await ctx.runMutation(internalRefs.communityMemberCoach.finishCommunityMemberCoachScanInternal, {
      settingsId: item.settingsId,
      nowMs: Date.now(),
      ...(nextScanCursorCreatedAt !== undefined ? { nextScanCursorCreatedAt } : {}),
    });
  }
}

const MAX_ENROLLMENT_PAGES_PER_RUN = 25;

export const processDueMemberCoachScansInternal = internalAction({
  args: {},
  handler: async (ctx) => {
    const nowMs = Date.now();
    // Paginate through all active founder subscriptions in bounded pages so
    // every funded community is discovered regardless of total subscription count.
    let cursor: string | null = null;
    for (let page = 0; page < MAX_ENROLLMENT_PAGES_PER_RUN; page += 1) {
      const res: { enrolled: number; isDone: boolean; continueCursor: string | null } = await ctx.runMutation(
        internalRefs.communityMemberCoach.enrollFounderSubscriptionsPageInternal,
        { nowMs, cursor },
      );
      if (res.isDone || !res.continueCursor) break;
      cursor = res.continueCursor;
    }

    const due = await ctx.runMutation(
      internalRefs.communityMemberCoach.enrollAndListDueMemberCoachCommunitiesInternal,
      { nowMs },
    );
    const outcomes: Record<string, number> = {};
    for (let start = 0; start < due.length; start += COMMUNITY_CONCURRENCY) {
      const chunk = due.slice(start, start + COMMUNITY_CONCURRENCY);
      const results = await Promise.all(
        chunk.map((item: { settingsId: Id<"communityMemberCoachSettings">; communityId: Id<"communities"> }) =>
          runCoachForCommunity(ctx, item, nowMs),
        ),
      );
      for (const outcome of results) {
        outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
      }
    }
    return { scanned: due.length, outcomes };
  },
});

// ---------- Owner Home ("Your guide suggests") & Settings ----------

export const listMemberCoachDrafts = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args): Promise<MemberCoachDraftView[]> => {
    const { community } = await requireOwner(ctx, args.authSubject, args.communityId);
    if (!communityIsActive(community) || !(await communityAgentIsOn(ctx, args.communityId))) return [];
    const nowMs = Date.now();
    const rows = await ctx.db
      .query("communityMemberCoachDrafts")
      .withIndex("by_community_status_createdAt", (q) =>
        q.eq("communityId", args.communityId).eq("status", "waiting"),
      )
      .order("desc")
      .take(20);

    const views: MemberCoachDraftView[] = [];
    for (const row of rows) {
      if (nowMs - row.createdAt > MEMBER_COACH_DRAFT_MAX_AGE_MS) continue;
      if (!row.text?.trim()) continue;
      const eligibility = await checkMemberEligibleForCoach(ctx, community, row.memberUserId);
      if (!eligibility.ok) continue;
      const profile = await resolveUserProfileDisplayProjection(ctx, row.memberUserId);
      const user = await ctx.db.get(row.memberUserId);
      views.push({
        id: String(row._id),
        member_name: profile.display_name ?? user?.displayName ?? "Member",
        member_handle: user?.normalizedHandle ?? user?.handle ?? null,
        reason: row.reason,
        reason_label: MEMBER_COACH_REASON_LABELS[row.reason].shortTag,
        signal_summary: row.signalSummary,
        text: row.text,
        created_at: new Date(row.createdAt).toISOString(),
      });
    }
    return views.reverse();
  },
});

export const sendMemberCoachDraft = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    draftId: v.id("communityMemberCoachDrafts"),
    text: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, community } = await requireOwner(ctx, args.authSubject, args.communityId);
    if (!communityIsActive(community) || !(await communityAgentIsOn(ctx, args.communityId))) {
      throw new Error("community_member_coach_guide_off");
    }
    const draft = await ctx.db.get(args.draftId);
    if (!draft || String(draft.communityId) !== String(args.communityId)) {
      throw new Error("community_member_coach_draft_not_found");
    }
    const nowMs = Date.now();
    if (draft.status !== "waiting" || nowMs - draft.createdAt > MEMBER_COACH_DRAFT_MAX_AGE_MS) {
      throw new Error("community_member_coach_no_longer_needed");
    }
    const eligibility = await checkMemberEligibleForCoach(ctx, community, draft.memberUserId);
    if (!eligibility.ok) {
      await ctx.db.patch(draft._id, {
        status: "skipped",
        skipReason: eligibility.code,
        decidedByUserId: userId,
        decidedAt: nowMs,
        updatedAt: nowMs,
      });
      throw new Error("community_member_coach_no_longer_needed");
    }
    // Revalidate the interruption budget right at delivery time (excluding this
    // draft itself) so an owner never sends into an active member conversation
    // or over the weekly/cooldown caps.
    const [lastUserAgentAt, recentHistory] = await Promise.all([
      readLastUserAgentMessageAt(ctx, args.communityId, draft.memberUserId),
      readRecentCoachHistoryForMember(ctx, args.communityId, draft.memberUserId, draft._id),
    ]);
    const deliveryGate = evaluateMemberCoachGate({
      nowMs,
      isOwner: false,
      memberMuted: false,
      reason: draft.reason,
      dedupeKey: `approved-delivery:${String(draft._id)}`,
      lastUserThreadMessageAt: lastUserAgentAt,
      recentHistory,
      autoReasonEnabled: false,
    });
    if (!deliveryGate.allowed) {
      if (deliveryGate.blockReason === "mid_conversation") {
        throw new Error("community_member_coach_active_conversation");
      }
      throw new Error("community_member_coach_cap_reached");
    }
    const finalText = (args.text !== undefined ? args.text : draft.text ?? "").replace(/\r\n/g, "\n").trim();
    if (!finalText) throw new Error("community_member_coach_empty_text");
    if (finalText.length > MEMBER_COACH_EDIT_MAX_CHARS) {
      throw new Error("community_member_coach_too_long");
    }

    const threadMessageKey = `member-coach:${String(draft._id)}`;
    const delivered = await deliverAssistantMessageToMemberCommunityThread(ctx, {
      communityId: args.communityId,
      memberUserId: draft.memberUserId,
      messageKey: threadMessageKey,
      contentJson: {
        text: finalText,
        meta: {
          kind: "member_coach",
          reason: draft.reason,
          draft_id: String(draft._id),
          delivery_mode: "approved",
        },
      },
    });
    await ctx.db.patch(draft._id, {
      status: "sent",
      deliveryMode: "approved",
      sentText: finalText,
      threadId: delivered.threadId,
      threadMessageKey,
      decidedByUserId: userId,
      decidedAt: nowMs,
      sentAt: nowMs,
      updatedAt: nowMs,
    });
    return { ok: true, thread_id: delivered.threadId };
  },
});

export const skipMemberCoachDraft = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    draftId: v.id("communityMemberCoachDrafts"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireOwner(ctx, args.authSubject, args.communityId);
    const draft = await ctx.db.get(args.draftId);
    if (!draft || String(draft.communityId) !== String(args.communityId)) return { ok: true };
    if (draft.status !== "waiting") return { ok: true };
    const nowMs = Date.now();
    await ctx.db.patch(draft._id, {
      status: "skipped",
      decidedByUserId: userId,
      decidedAt: nowMs,
      updatedAt: nowMs,
    });
    return { ok: true };
  },
});

async function buildCoachSettingsView(
  ctx: any,
  communityId: Id<"communities">,
): Promise<MemberCoachSettingsView> {
  const nowMs = Date.now();
  const [row, sentWeek, waiting] = await Promise.all([
    ctx.db
      .query("communityMemberCoachSettings")
      .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
      .first(),
    ctx.db
      .query("communityMemberCoachDrafts")
      .withIndex("by_community_status_createdAt", (q: any) =>
        q.eq("communityId", communityId).eq("status", "sent").gte("createdAt", nowMs - MEMBER_COACH_WEEK_WINDOW_MS),
      )
      .take(100),
    ctx.db
      .query("communityMemberCoachDrafts")
      .withIndex("by_community_status_createdAt", (q: any) =>
        q.eq("communityId", communityId).eq("status", "waiting"),
      )
      .take(25),
  ]);
  return {
    enabled: row ? Boolean(row.enabled) : true,
    auto_reasons: normalizeMemberCoachReasons(row?.autoReasons ?? []),
    auto_reply_enabled: Boolean(row?.autoReplyEnabled),
    thread_followup_enabled: row?.threadFollowupEnabled !== false,
    sent_this_week: sentWeek.length,
    waiting_count: waiting.filter((item: any) => nowMs - item.createdAt <= MEMBER_COACH_DRAFT_MAX_AGE_MS).length,
  };
}

export const getMemberCoachSettings = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args): Promise<MemberCoachSettingsView> => {
    await requireOwner(ctx, args.authSubject, args.communityId);
    return await buildCoachSettingsView(ctx, args.communityId);
  },
});

export const setMemberCoachSettings = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    enabled: v.boolean(),
    autoReasons: v.array(reasonValidator),
    autoReplyEnabled: v.optional(v.boolean()),
    threadFollowupEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<MemberCoachSettingsView> => {
    const { userId } = await requireOwner(ctx, args.authSubject, args.communityId);
    const nowMs = Date.now();
    const autoReasons = normalizeMemberCoachReasons(args.autoReasons);
    const existing = await ctx.db
      .query("communityMemberCoachSettings")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
      .first();
    const nextAutoReply =
      args.autoReplyEnabled !== undefined ? args.autoReplyEnabled : Boolean(existing?.autoReplyEnabled);
    const nextThreadFollowup =
      args.threadFollowupEnabled !== undefined
        ? args.threadFollowupEnabled
        : existing?.threadFollowupEnabled !== false;
    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        autoReasons,
        autoReplyEnabled: nextAutoReply,
        threadFollowupEnabled: nextThreadFollowup,
        ...(args.enabled && !existing.nextScanAt ? { nextScanAt: nowMs } : {}),
        updatedByUserId: userId,
        updatedAt: nowMs,
      });
    } else {
      await ctx.db.insert("communityMemberCoachSettings", {
        communityId: args.communityId,
        enabled: args.enabled,
        autoReasons,
        autoReplyEnabled: nextAutoReply,
        threadFollowupEnabled: nextThreadFollowup,
        ...(args.enabled ? { nextScanAt: nowMs } : {}),
        updatedByUserId: userId,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }
    return await buildCoachSettingsView(ctx, args.communityId);
  },
});

// ---------- Member opt-out ("Pause guide check-ins") ----------

export const getMyMemberCoachPreference = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args): Promise<MemberCoachPreferenceView> => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const state = await readMemberMutedState(ctx, args.communityId, userId);
    return {
      coach_muted: state.coachMuted,
      community_muted: state.muted,
    };
  },
});

export const setMyMemberCoachPreference = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    coachMuted: v.boolean(),
  },
  handler: async (ctx, args): Promise<MemberCoachPreferenceView> => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const nowMs = Date.now();
    const existing = await ctx.db
      .query("communityMemberSettings")
      .withIndex("by_community_user", (q) => q.eq("communityId", args.communityId).eq("userId", userId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        coachMuted: args.coachMuted,
        updatedAt: nowMs,
      });
      return { coach_muted: args.coachMuted, community_muted: Boolean(existing.muted) };
    }
    await ctx.db.insert("communityMemberSettings", {
      communityId: args.communityId,
      userId,
      muted: false,
      coachMuted: args.coachMuted,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { coach_muted: args.coachMuted, community_muted: false };
  },
});
