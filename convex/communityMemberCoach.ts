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
import { enqueueSingleEmailJob } from "./email";
import { syncCommunityWeeklyDigestScheduleForCommunity } from "./communityWeeklyDigestSchedule";
import { runDueBuilderHeartbeatsForAction } from "./communityBuilderHeartbeat";
import {
  readActiveCommunityAllowanceState,
  runFounderAllowanceAlertsForAction,
} from "./communityAllowanceGuardrails";
import { operatorGrantUsageCycleKey } from "./operatorGrantUsageCore";
import { shouldPauseBackgroundAiForAllowance } from "../shared/allowanceGuardrails";
import {
  canGrantAdditionalUsageBoost,
  computeEffectiveCycleAllowanceMicros,
  isSubscriptionInFirstBillingCycle,
  isValidFounderUsageBoostCapCents,
  normalizeFounderUsageBoostCapCents,
} from "../shared/founderUsageBoosts";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";
import { communityIsActive, normalizeCommunityLifecycle } from "../shared/communityLifecycle";
import { renderCommunityHandbook } from "../shared/communityHandbook";
import { DEFAULT_PERSONAL_SOUL_MD, cleanAgentSoulText } from "../shared/agentSoul";
import { renderPersonalMemory } from "../shared/personalMemory";
import { utcMonthWindow } from "../shared/founderInference";
import {
  POLYNET_FOUNDER_PLAN_INCLUDED_COST_MICROS,
  founderPlanTierAllowsUsageBoosts,
  founderPlanTierHasProactiveAgent,
  normalizeFounderPlanTier,
} from "../shared/founderPlan";
import { communityHasProactiveAgentTier } from "./founderInferenceCore";
import {
  countReengagedMembersFromSentChecks,
  summarizeCommunityAiSpend,
} from "../shared/agentRoiSummary";
import {
  COMMITMENT_FOLLOWUP_MAX_AGE_MS,
  COMMITMENT_FOLLOWUP_MIN_AGE_MS,
  UNSEEN_COACH_EMAIL_GRACE_MS,
  UNSEEN_COACH_EMAIL_MAX_AGE_MS,
  classifyCommunityHeartbeatCadence,
  classifyMemberHeartbeatTemperature,
  countConsecutiveUnansweredCoachTouches,
  type CommunityHeartbeatTier,
  type MemberTemperatureCounts,
} from "../shared/agentHeartbeat";
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
const UNSEEN_EMAIL_BATCH_LIMIT = 50;

const reasonValidator = v.union(
  v.literal("commitment_followup"),
  v.literal("quiet_newcomer"),
  v.literal("course_stall"),
  v.literal("quiet_member"),
);

const communityTierValidator = v.union(
  v.literal("active"),
  v.literal("warm"),
  v.literal("cooling"),
  v.literal("paused"),
);

const temperatureCountsValidator = v.object({
  hot: v.number(),
  warm: v.number(),
  cooling: v.number(),
  cold: v.number(),
});

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
  if (membership?.role === "admin") return { ok: false, code: "admin_excluded" };
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
          builderNextScanAt: args.nowMs,
          createdAt: args.nowMs,
          updatedAt: args.nowMs,
        });
        enrolled += 1;
      } else if (existing.builderNextScanAt === undefined) {
        await ctx.db.patch(existing._id, {
          builderNextScanAt: args.nowMs,
          updatedAt: args.nowMs,
        });
      }
      if (existing?.weeklyDigestEnabled !== false) {
        await syncCommunityWeeklyDigestScheduleForCommunity(ctx, {
          communityId: sub.communityId,
          nowMs: args.nowMs,
        });
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
            builderNextScanAt: args.nowMs,
            createdAt: args.nowMs,
            updatedAt: args.nowMs,
          });
        } else if (existing.builderNextScanAt === undefined) {
          await ctx.db.patch(existing._id, {
            builderNextScanAt: args.nowMs,
            updatedAt: args.nowMs,
          });
        }
        if (existing?.weeklyDigestEnabled !== false) {
          await syncCommunityWeeklyDigestScheduleForCommunity(ctx, {
            communityId: comm._id,
            nowMs: args.nowMs,
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

async function readLatestCommunityActivityAt(
  ctx: any,
  communityId: Id<"communities">,
): Promise<number | null> {
  const [latestRoot, latestReply, latestMember, latestLesson, latestAgentChannel] = await Promise.all([
    ctx.db
      .query("communityInteractionRoots")
      .withIndex("by_community_status_createdAt", (q: any) =>
        q.eq("communityId", communityId).eq("status", "live"),
      )
      .order("desc")
      .first(),
    ctx.db
      .query("communityInteractionReplies")
      .withIndex("by_community_status_createdAt", (q: any) =>
        q.eq("communityId", communityId).eq("status", "live"),
      )
      .order("desc")
      .first(),
    ctx.db
      .query("communityMemberships")
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId))
      .order("desc")
      .first(),
    ctx.db
      .query("communityLessonProgress")
      .withIndex("by_community_completedAt", (q: any) => q.eq("communityId", communityId))
      .order("desc")
      .first(),
    ctx.db
      .query("memberAgentChannels")
      .withIndex("by_community_updatedAt", (q: any) => q.eq("communityId", communityId))
      .order("desc")
      .first(),
  ]);
  const best = Math.max(
    Number(latestRoot?.createdAt ?? 0),
    Number(latestReply?.createdAt ?? 0),
    Number(latestMember?.activatedAt ?? latestMember?.createdAt ?? 0),
    Number(latestLesson?.completedAt ?? 0),
    Number(latestAgentChannel?.updatedAt ?? 0),
  );
  return best > 0 ? best : null;
}

export const claimCommunityMemberCoachScanInternal = internalMutation({
  args: { settingsId: v.id("communityMemberCoachSettings"), nowMs: v.number() },
  handler: async (ctx, args) => {
    const settings = await ctx.db.get(args.settingsId);
    if (!settings || !settings.enabled) return null;
    if (typeof settings.leaseUntil === "number" && settings.leaseUntil > args.nowMs) return null;
    if (typeof settings.nextScanAt === "number" && settings.nextScanAt > args.nowMs + 60_000) return null;

    const community = await ctx.db.get(settings.communityId);
    if (
      !community ||
      !communityIsActive(community) ||
      !(await communityAgentIsOn(ctx, settings.communityId)) ||
      !(await communityHasProactiveAgentTier(ctx, settings.communityId, args.nowMs))
    ) {
      await ctx.db.patch(settings._id, {
        nextScanAt: args.nowMs + MEMBER_COACH_SCAN_INTERVAL_MS,
        leaseUntil: undefined,
        updatedAt: args.nowMs,
      });
      return null;
    }

    const allowance = await readActiveCommunityAllowanceState(ctx, settings.communityId, args.nowMs);
    if (allowance?.backgroundAiPaused) {
      await ctx.db.patch(settings._id, {
        nextScanAt: args.nowMs + MEMBER_COACH_SCAN_INTERVAL_MS,
        leaseUntil: undefined,
        updatedAt: args.nowMs,
      });
      return null;
    }

    const lastCommunityActivityAt = await readLatestCommunityActivityAt(ctx, settings.communityId);
    const cadence = classifyCommunityHeartbeatCadence({
      nowMs: args.nowMs,
      lastCommunityActivityAtMs: lastCommunityActivityAt,
    });
    if (cadence.skipAiScan) {
      await ctx.db.patch(settings._id, {
        communityHeartbeatTier: cadence.tier,
        ...(lastCommunityActivityAt ? { lastCommunityActivityAt } : {}),
        nextScanAt: args.nowMs + cadence.nextIntervalMs,
        leaseUntil: undefined,
        updatedAt: args.nowMs,
      });
      return null;
    }

    await ctx.db.patch(settings._id, {
      communityHeartbeatTier: cadence.tier,
      ...(lastCommunityActivityAt ? { lastCommunityActivityAt } : {}),
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
      nextIntervalMs: cadence.nextIntervalMs,
      communityTier: cadence.tier as CommunityHeartbeatTier,
    };
  },
});

export const finishCommunityMemberCoachScanInternal = internalMutation({
  args: {
    settingsId: v.id("communityMemberCoachSettings"),
    nowMs: v.number(),
    nextIntervalMs: v.optional(v.number()),
    nextScanCursorCreatedAt: v.optional(v.union(v.number(), v.null())),
    temperatureCounts: v.optional(temperatureCountsValidator),
    communityTier: v.optional(communityTierValidator),
  },
  handler: async (ctx, args) => {
    const settings = await ctx.db.get(args.settingsId);
    if (!settings) return;
    const intervalMs =
      typeof args.nextIntervalMs === "number" && args.nextIntervalMs >= 60_000
        ? args.nextIntervalMs
        : MEMBER_COACH_SCAN_INTERVAL_MS;
    await ctx.db.patch(settings._id, {
      leaseUntil: undefined,
      nextScanAt: args.nowMs + intervalMs,
      ...(args.communityTier ? { communityHeartbeatTier: args.communityTier } : {}),
      ...(args.nextScanCursorCreatedAt !== undefined
        ? { scanCursorCreatedAt: args.nextScanCursorCreatedAt ?? undefined }
        : {}),
      ...(args.temperatureCounts
        ? {
            temperatureSnapshot: {
              ...args.temperatureCounts,
              sampledAt: args.nowMs,
            },
          }
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
    const temperatureCounts: MemberTemperatureCounts = { hot: 0, warm: 0, cooling: 0, cold: 0 };

    for (const membership of memberships) {
      if (!communityMembershipRowIsActive(membership)) continue;
      if (String(membership.userId) === String(community.ownerId)) continue;
      if (membership.role === "admin") continue;
      const eligibility = await checkMemberEligibleForCoach(ctx, community, membership.userId);
      if (!eligibility.ok) continue;

      const joinedAt = Number(membership.activatedAt ?? membership.createdAt ?? 0);
      const memberAgeMs = args.nowMs - joinedAt;
      const [lastChannelAt, lastUserAgentAt, recentHistory, courseProgress, memberMemoryRow] = await Promise.all([
        readLatestMemberChannelActivityAt(ctx, args.communityId, membership.userId),
        readLastUserAgentMessageAt(ctx, args.communityId, membership.userId),
        readRecentCoachHistoryForMember(ctx, args.communityId, membership.userId),
        readMemberCourseProgress(ctx, args.communityId, membership.userId),
        ctx.db
          .query("memberMemories")
          .withIndex("by_community_user", (q: any) =>
            q.eq("communityId", args.communityId).eq("userId", membership.userId),
          )
          .unique(),
      ]);

      const lastLessonMs = courseProgress.reduce((best, course) => {
        const ms = course.last_done_at ? Date.parse(course.last_done_at) : 0;
        return Number.isFinite(ms) && ms > best ? ms : best;
      }, 0);
      const lastRealActivityMs = Math.max(lastChannelAt ?? 0, lastLessonMs, lastUserAgentAt ?? 0);
      const consecutiveUnanswered = countConsecutiveUnansweredCoachTouches(
        recentHistory,
        lastRealActivityMs > 0 ? lastRealActivityMs : null,
      );
      const heartbeatTemp = classifyMemberHeartbeatTemperature({
        nowMs: args.nowMs,
        lastActivityAtMs: lastRealActivityMs > 0 ? lastRealActivityMs : null,
        joinedAtMs: joinedAt,
        consecutiveUnanswered,
      });
      temperatureCounts[heartbeatTemp.temperature] += 1;

      // Cold / dormant members (30+ days quiet OR 2 consecutive unanswered AI
      // check-ins) stop AI heartbeats at $0 cost and hand off to system follow-up.
      if (heartbeatTemp.handoffToSystem) {
        continue;
      }

      // Signal 0 (priority 0): Personal Commitment follow-up (strictly private auto mode).
      const commitmentEntry = (memberMemoryRow?.entries ?? [])
        .filter((entry: any) => {
          if (entry?.category !== "commitment") return false;
          const ageMs = args.nowMs - Number(entry.at ?? 0);
          return ageMs >= COMMITMENT_FOLLOWUP_MIN_AGE_MS && ageMs <= COMMITMENT_FOLLOWUP_MAX_AGE_MS;
        })
        .sort((a: any, b: any) => Number(b.at ?? 0) - Number(a.at ?? 0))[0] ?? null;
      if (commitmentEntry && autoSet.has("commitment_followup")) {
        const commitAt = Number(commitmentEntry.at ?? args.nowMs);
        const dedupeKey = `commitment_followup:${Math.floor(commitAt / (7 * DAY_MS))}:${String(commitmentEntry.text ?? "").slice(0, 32).toLowerCase()}`;
        const gate = evaluateMemberCoachGate({
          nowMs: args.nowMs,
          isOwner: false,
          memberMuted: false,
          reason: "commitment_followup",
          dedupeKey,
          lastUserThreadMessageAt: lastUserAgentAt,
          recentHistory,
          autoReasonEnabled: true,
          communityTimeZone: tz,
          memberTemperature: heartbeatTemp.temperature,
          consecutiveUnanswered,
        });
        if (gate.allowed && gate.mode === "auto") {
          const daysAgo = daysBetween(commitAt, args.nowMs);
          candidates.push({
            priority: 0,
            memberUserId: membership.userId,
            reason: "commitment_followup",
            dedupeKey,
            // Never copy private commitment words into summary fields.
            signalSummary: `Active commitment shared with guide ${daysAgo} ${daysAgo === 1 ? "day" : "days"} ago`,
            signalDetail: `The member shared a personal commitment ${daysAgo} days ago: "${String(commitmentEntry.text ?? "")}". Check in warmly on how it is going and offer one small next step.`,
            mode: "auto",
          });
          continue;
        }
      }

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
          memberTemperature: heartbeatTemp.temperature,
          consecutiveUnanswered,
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
          memberTemperature: heartbeatTemp.temperature,
          consecutiveUnanswered,
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

      // Signal 3 (priority 3): Quiet returning member (14..30 days since last activity)
      // ONLY when there is a concrete upcoming community event within 7 days.
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
          memberTemperature: heartbeatTemp.temperature,
          consecutiveUnanswered,
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

    if (candidates.length === 0) return { candidate: null, nextScanCursorCreatedAt, temperatureCounts };
    candidates.sort((a, b) => a.priority - b.priority);
    const chosen = candidates[0]!;

    // Read ONLY this member's own consented self facts (lens: "self" — NEVER host notes
    // and NEVER any other member's private context or threads).
    const [person, chosenMemRow] = await Promise.all([
      readPersonFacts(ctx, {
        communityId: args.communityId,
        subjectUserId: chosen.memberUserId,
        lens: "self",
      }),
      chosen.mode === "auto"
        ? ctx.db
            .query("memberMemories")
            .withIndex("by_community_user", (q: any) =>
              q.eq("communityId", args.communityId).eq("userId", chosen.memberUserId),
            )
            .unique()
        : Promise.resolve(null),
    ]);
    if (!person) return { candidate: null, nextScanCursorCreatedAt, temperatureCounts };

    // Private Soul & Memory are ONLY given to auto-delivered private messages
    // (never to founder-visible approval drafts) so private words stay private.
    const personalSoulMd =
      chosen.mode === "auto"
        ? cleanAgentSoulText(chosenMemRow?.soulMd) || DEFAULT_PERSONAL_SOUL_MD
        : null;
    const personalMemoryExcerpt =
      chosen.mode === "auto" && chosenMemRow?.entries?.length
        ? renderPersonalMemory(chosenMemRow.entries).slice(0, 800)
        : null;

    return {
      nextScanCursorCreatedAt,
      temperatureCounts,
      candidate: {
        memberUserId: chosen.memberUserId,
        memberName: person.name || (person.handle ? `@${person.handle}` : "Member"),
        memberBio: person.bio,
        memberSharedFacts: person.shared.slice(0, 6).map((fact) => `${fact.label}: ${fact.body}`),
        personalSoulMd,
        personalMemoryExcerpt,
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
    usedPrivateContext: v.optional(v.boolean()),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const community: any = await ctx.db.get(args.communityId);
    if (
      !community ||
      !communityIsActive(community) ||
      !(await communityAgentIsOn(ctx, args.communityId)) ||
      !(await communityHasProactiveAgentTier(ctx, args.communityId, args.nowMs))
    ) {
      return { ok: false as const, code: "community_unavailable" };
    }
    const eligibility = await checkMemberEligibleForCoach(ctx, community, args.memberUserId);
    if (!eligibility.ok) return { ok: false as const, code: eligibility.code };

    const [lastChannelAt, lastUserAgentAt, recentHistory, courseProgress, tz, settingsRow] = await Promise.all([
      readLatestMemberChannelActivityAt(ctx, args.communityId, args.memberUserId),
      readLastUserAgentMessageAt(ctx, args.communityId, args.memberUserId),
      readRecentCoachHistoryForMember(ctx, args.communityId, args.memberUserId),
      readMemberCourseProgress(ctx, args.communityId, args.memberUserId),
      communityTimeZone(ctx, args.communityId),
      ctx.db
        .query("communityMemberCoachSettings")
        .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
        .first(),
    ]);
    if (settingsRow && !settingsRow.enabled) return { ok: false as const, code: "coach_disabled" };

    const joinedAt = Number(eligibility.membership?.activatedAt ?? eligibility.membership?.createdAt ?? 0);
    const lastLessonMs = courseProgress.reduce((best, course) => {
      const ms = course.last_done_at ? Date.parse(course.last_done_at) : 0;
      return Number.isFinite(ms) && ms > best ? ms : best;
    }, 0);
    const lastRealActivityMs = Math.max(lastChannelAt ?? 0, lastLessonMs, lastUserAgentAt ?? 0);
    const consecutiveUnanswered = countConsecutiveUnansweredCoachTouches(
      recentHistory,
      lastRealActivityMs > 0 ? lastRealActivityMs : null,
    );
    const heartbeatTemp = classifyMemberHeartbeatTemperature({
      nowMs: args.nowMs,
      lastActivityAtMs: lastRealActivityMs > 0 ? lastRealActivityMs : null,
      joinedAtMs: joinedAt,
      consecutiveUnanswered,
    });

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
      memberTemperature: heartbeatTemp.temperature,
      consecutiveUnanswered,
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
        unseenEmailState: "pending",
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

    // Fail closed: any message generated using a member's private Soul or
    // private Memory MUST NEVER downgrade into a founder-visible draft.
    if (args.usedPrivateContext) {
      return { ok: false as const, code: "private_context_cannot_downgrade_to_draft" };
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
  let temperatureCounts: MemberTemperatureCounts | undefined = undefined;
  try {
    const scanResult = await ctx.runQuery(internalRefs.communityMemberCoach.readNextMemberCoachCandidateInternal, {
      communityId: claim.communityId,
      autoReasons: claim.autoReasons,
      nowMs,
      scanCursorCreatedAt: claim.scanCursorCreatedAt,
    });
    nextScanCursorCreatedAt = scanResult?.nextScanCursorCreatedAt ?? null;
    temperatureCounts = scanResult?.temperatureCounts;
    const candidate = scanResult?.candidate ?? null;
    if (!candidate) return "no_candidate";

    const funding = await resolveCommunityInferenceFundingForAction(ctx, claim.communityId);
    if (!funding.ok || !founderPlanTierHasProactiveAgent(funding.planTier)) return "unfunded";

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
        requireProactiveTier: true,
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
      ...(candidate.personalSoulMd
        ? [`Your Soul with this person (tone and coaching habits only):\n${candidate.personalSoulMd}`]
        : []),
    ].join("\n\n");

    const user = [
      `Member: ${candidate.memberName}`,
      ...(candidate.memberBio ? [`Bio: ${candidate.memberBio}`] : []),
      ...(candidate.memberSharedFacts.length
        ? [`Shared profile facts:\n- ${candidate.memberSharedFacts.join("\n- ")}`]
        : []),
      ...(candidate.personalMemoryExcerpt
        ? [`Private memory with this member (for this private message only):\n${candidate.personalMemoryExcerpt}`]
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
      usedPrivateContext: Boolean(candidate.personalSoulMd || candidate.personalMemoryExcerpt),
      nowMs: Date.now(),
    });
    return saved?.ok ? saved.outcome : `blocked:${saved?.code ?? "unknown"}`;
  } finally {
    await ctx.runMutation(internalRefs.communityMemberCoach.finishCommunityMemberCoachScanInternal, {
      settingsId: item.settingsId,
      nowMs: Date.now(),
      nextIntervalMs: claim.nextIntervalMs,
      communityTier: claim.communityTier,
      ...(nextScanCursorCreatedAt !== undefined ? { nextScanCursorCreatedAt } : {}),
      ...(temperatureCounts ? { temperatureCounts } : {}),
    });
  }
}

// 24-hour unseen proactive check-in email nudge: queries ONLY indexed "pending"
// sent check-ins aged 24..72h so processed rows never starve older pending ones,
// and enqueues the durable email outbox job atomically in the exact same mutation.
export const processUnseenMemberCoachEmailsInternal = internalMutation({
  args: { nowMs: v.number() },
  handler: async (ctx, args) => {
    const oldestMs = args.nowMs - UNSEEN_COACH_EMAIL_MAX_AGE_MS;
    const dueBeforeMs = args.nowMs - UNSEEN_COACH_EMAIL_GRACE_MS;
    const candidates = await ctx.db
      .query("communityMemberCoachDrafts")
      .withIndex("by_status_unseenEmailState_sentAt", (q) =>
        q
          .eq("status", "sent")
          .eq("unseenEmailState", "pending")
          .gte("sentAt", oldestMs)
          .lte("sentAt", dueBeforeMs),
      )
      .order("asc")
      .take(UNSEEN_EMAIL_BATCH_LIMIT);

    let origin = "https://www.polynet.ai";
    try {
      origin = readCanonicalPublicAppOrigin();
    } catch {
      // fallback to canonical public origin
    }

    let enqueued = 0;
    let seen = 0;
    let suppressed = 0;
    const communityCache = new Map<string, any>();

    for (const draft of candidates) {
      const sentAt = Number(draft.sentAt ?? draft.createdAt ?? 0);
      if (sentAt <= 0 || args.nowMs - sentAt < UNSEEN_COACH_EMAIL_GRACE_MS) continue;

      const community: any = await ctx.db.get(draft.communityId);
      if (!community || !communityIsActive(community) || !(await communityAgentIsOn(ctx, draft.communityId))) {
        await ctx.db.patch(draft._id, {
          unseenEmailState: "suppressed",
          unseenEmailCheckedAt: args.nowMs,
          updatedAt: args.nowMs,
        });
        suppressed += 1;
        continue;
      }

      const eligibility = await checkMemberEligibleForCoach(ctx, community, draft.memberUserId);
      if (!eligibility.ok) {
        await ctx.db.patch(draft._id, {
          unseenEmailState: "suppressed",
          unseenEmailCheckedAt: args.nowMs,
          updatedAt: args.nowMs,
        });
        suppressed += 1;
        continue;
      }

      const lastUserAgentAt = await readLastUserAgentMessageAt(ctx, draft.communityId, draft.memberUserId);
      if (typeof lastUserAgentAt === "number" && lastUserAgentAt >= sentAt) {
        await ctx.db.patch(draft._id, {
          unseenEmailState: "seen",
          unseenEmailCheckedAt: args.nowMs,
          updatedAt: args.nowMs,
        });
        seen += 1;
        continue;
      }

      const lifecycle = normalizeCommunityLifecycle(community);
      const slug = String(community.slug ?? "").trim();
      const communityName = String(community.name ?? "your community").trim();
      const guideName = `${communityName} guide`;
      // Keep private commitment details out of plaintext email previews.
      const rawText = String(draft.sentText ?? draft.text ?? "").trim();
      const bodyPreview =
        draft.reason === "commitment_followup"
          ? "Your guide left a private check-in waiting for you."
          : rawText.length > 180
            ? `${rawText.slice(0, 177).trimEnd()}…`
            : rawText || "Your guide left a check-in waiting for you.";

      const emailResult = await enqueueSingleEmailJob(
        ctx,
        {
          kind: "member_coach_nudge",
          communityId: draft.communityId,
          communityLifecycleGeneration: lifecycle.generation,
          recipientUserId: draft.memberUserId,
          templateKey: "member_coach_nudge",
          payload: {
            communityName,
            guideName,
            bodyPreview,
            actionUrl: slug ? `${origin}/c/${encodeURIComponent(slug)}/agent` : origin,
          },
          dedupeKey: `member-coach-nudge:${String(draft._id)}`,
          nowMs: args.nowMs,
        },
        communityCache,
      );
      const nextState = emailResult.status === "suppressed" ? "suppressed" : "enqueued";
      await ctx.db.patch(draft._id, {
        unseenEmailState: nextState,
        unseenEmailCheckedAt: args.nowMs,
        updatedAt: args.nowMs,
      });
      if (nextState === "enqueued") enqueued += 1;
      else suppressed += 1;
    }
    return { enqueued, seen, suppressed };
  },
});

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

    // 24-hour unseen proactive check-in email fallback (bounded, atomic, preference-gated).
    const unseen = await ctx.runMutation(
      internalRefs.communityMemberCoach.processUnseenMemberCoachEmailsInternal,
      { nowMs },
    );
    // Builder's Own Proactive Heartbeat (Owner + active Admins private commitments).
    const builders = await runDueBuilderHeartbeatsForAction(ctx, nowMs);
    // Calm, idempotent 80% & 100% founder allowance alerts per billing cycle.
    const allowanceAlerts = await runFounderAllowanceAlertsForAction(ctx, nowMs);
    return {
      scanned: due.length,
      outcomes,
      unseenEmailsEnqueued: unseen?.enqueued ?? 0,
      builderScanned: builders.scanned,
      builderOutcomes: builders.outcomes,
      builderUnseenEmailsEnqueued: builders.unseenEmailsEnqueued,
      allowanceAlertsSent: allowanceAlerts.alertsSent,
    };
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
      unseenEmailState: "pending",
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

const MONTHLY_SPEND_RECEIPT_SCAN_LIMIT = 400;
const REENGAGEMENT_DRAFT_SCAN_LIMIT = 100;
const REENGAGEMENT_MEMBER_CHECK_CAP = 40;
const REENGAGEMENT_WINDOW_MS = 30 * DAY_MS;

async function buildCoachSettingsView(
  ctx: any,
  communityId: Id<"communities">,
): Promise<MemberCoachSettingsView> {
  const nowMs = Date.now();
  const reengageCutoffMs = nowMs - REENGAGEMENT_WINDOW_MS;
  const [row, sentWeek, waiting, openFounderCycle, operatorCycle, sent30d] = await Promise.all([
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
    ctx.db
      .query("founderUsageCycles")
      .withIndex("by_community_status", (q: any) =>
        q.eq("communityId", communityId).eq("status", "open"),
      )
      .order("desc")
      .first(),
    ctx.db
      .query("operatorGrantUsageCycles")
      .withIndex("by_cycle_key", (q: any) =>
        q.eq("cycleKey", operatorGrantUsageCycleKey(communityId, nowMs)),
      )
      .first(),
    ctx.db
      .query("communityMemberCoachDrafts")
      .withIndex("by_community_status_sentAt", (q: any) =>
        q.eq("communityId", communityId).eq("status", "sent").gte("sentAt", reengageCutoffMs),
      )
      .order("desc")
      .take(REENGAGEMENT_DRAFT_SCAN_LIMIT + 1),
  ]);

  // Align allowance & spend window with the active Stripe billing cycle (or
  // operator grant cycle) when present, falling back to UTC calendar month for free communities.
  const activeFounderCycle =
    openFounderCycle &&
    typeof openFounderCycle.cycleEndAt === "number" &&
    openFounderCycle.cycleEndAt > nowMs
      ? openFounderCycle
      : null;
  const activeOperatorCycle =
    !activeFounderCycle &&
    operatorCycle &&
    typeof operatorCycle.cycleEndAt === "number" &&
    operatorCycle.cycleEndAt > nowMs
      ? operatorCycle
      : null;
  const activeLedgerCycle = activeFounderCycle ?? activeOperatorCycle;
  const cycleStartMs = activeLedgerCycle
    ? Number(activeLedgerCycle.cycleStartAt)
    : utcMonthWindow(nowMs).startAt;
  const cycleEndMs = activeLedgerCycle
    ? Number(activeLedgerCycle.cycleEndAt)
    : utcMonthWindow(nowMs).endAt;
  const includedAllowanceMicros = activeLedgerCycle
    ? Number(activeLedgerCycle.includedCostMicros ?? POLYNET_FOUNDER_PLAN_INCLUDED_COST_MICROS)
    : POLYNET_FOUNDER_PLAN_INCLUDED_COST_MICROS;
  const paidBoostMicros = activeFounderCycle
    ? Math.max(0, Math.floor(Number((activeFounderCycle as any).paidBoostCostMicros ?? 0)))
    : 0;
  const allowanceMicros = computeEffectiveCycleAllowanceMicros({
    includedCostMicros: includedAllowanceMicros,
    paidBoostCostMicros: paidBoostMicros,
  });
  const activeSubscription = activeFounderCycle
    ? await ctx.db.get(activeFounderCycle.founderSubscriptionId)
    : null;
  const planTier = activeSubscription
    ? normalizeFounderPlanTier((activeSubscription as any).planTier)
    : "chief_of_staff";
  const firstCycleCapActive =
    activeFounderCycle && activeSubscription
      ? isSubscriptionInFirstBillingCycle({
          subscriptionCreatedAtMs: Number(activeSubscription.createdAt ?? 0),
          cycleStartAtMs: Number(activeFounderCycle.cycleStartAt ?? 0),
        })
      : false;
  const usageBoostCapCents = normalizeFounderUsageBoostCapCents(row?.usageBoostCapCents);
  const subscriptionEligibleForBoost = Boolean(
    activeFounderCycle &&
      activeSubscription &&
      activeSubscription.status === "active" &&
      activeSubscription.riskAccessState !== "revoked",
  );
  const boostAdmission = !subscriptionEligibleForBoost
    ? { allowed: false as const, code: "founder_subscription_required", effectiveCapCents: 0 }
    : !founderPlanTierAllowsUsageBoosts(planTier)
      ? { allowed: false as const, code: "founder_usage_boost_tier_required", effectiveCapCents: 0 }
      : canGrantAdditionalUsageBoost({
          requestedCapCents: usageBoostCapCents,
          isFirstCycle: firstCycleCapActive,
          paidBoostCountThisCycle: Number((activeFounderCycle as any).paidBoostCount ?? 0),
        });

  const rawCycleReceipts = await ctx.db
    .query("communityInferenceReceipts")
    .withIndex("by_community_createdAt", (q: any) =>
      q.eq("communityId", communityId).gte("createdAt", cycleStartMs),
    )
    .take(MONTHLY_SPEND_RECEIPT_SCAN_LIMIT + 1);
  const spendTruncated = rawCycleReceipts.length > MONTHLY_SPEND_RECEIPT_SCAN_LIMIT;
  const boundedReceipts = spendTruncated
    ? rawCycleReceipts.slice(0, MONTHLY_SPEND_RECEIPT_SCAN_LIMIT)
    : rawCycleReceipts;
  const scopedReceipts = activeFounderCycle
    ? boundedReceipts.filter((receipt: any) => String(receipt.usageCycleId ?? "") === String(activeFounderCycle._id))
    : activeOperatorCycle
      ? boundedReceipts.filter(
          (receipt: any) =>
            !receipt.operatorUsageCycleId ||
            String(receipt.operatorUsageCycleId) === String(activeOperatorCycle._id),
        )
      : boundedReceipts;
  const spend = summarizeCommunityAiSpend({
    receipts: scopedReceipts,
    allowanceMicros,
    truncated: spendTruncated && !activeLedgerCycle,
  });
  // When an active billing or operator grant cycle ledger exists, use its
  // authoritative settled total so the headline never drifts past 400 turns.
  const authoritativeTotalMicros = activeLedgerCycle
    ? Math.max(spend.totalMicros, Math.floor(Number(activeLedgerCycle.settledCostMicros ?? 0)))
    : spend.totalMicros;
  const authoritativePercentUsed =
    allowanceMicros > 0
      ? Math.min(100, Math.round((authoritativeTotalMicros / allowanceMicros) * 100))
      : 0;

  const draftsTruncated = sent30d.length > REENGAGEMENT_DRAFT_SCAN_LIMIT;
  const boundedSent30d = draftsTruncated ? sent30d.slice(0, REENGAGEMENT_DRAFT_SCAN_LIMIT) : sent30d;
  const sentChecks = boundedSent30d
    .map((draft: any) => ({
      memberUserId: String(draft.memberUserId),
      rawMemberUserId: draft.memberUserId as Id<"users">,
      sentAt: Number(draft.sentAt ?? draft.createdAt ?? 0),
    }))
    .filter((entry: any) => entry.sentAt > 0);
  const uniqueMembers = new Map<string, Id<"users">>();
  let membersTruncated = false;
  for (const check of sentChecks) {
    if (uniqueMembers.has(check.memberUserId)) continue;
    if (uniqueMembers.size < REENGAGEMENT_MEMBER_CHECK_CAP) {
      uniqueMembers.set(check.memberUserId, check.rawMemberUserId);
    } else {
      membersTruncated = true;
    }
  }
  const reengagementTruncated = draftsTruncated || membersTruncated;
  const latestActivityByMember = new Map<string, number | null>();
  await Promise.all(
    [...uniqueMembers.entries()].map(async ([memberKey, memberUserId]) => {
      const [lastChannelAt, lastAgentAt, latestLesson] = await Promise.all([
        readLatestMemberChannelActivityAt(ctx, communityId, memberUserId),
        readLastUserAgentMessageAt(ctx, communityId, memberUserId),
        ctx.db
          .query("communityLessonProgress")
          .withIndex("by_community_user_completedAt", (q: any) =>
            q.eq("communityId", communityId).eq("userId", memberUserId),
          )
          .order("desc")
          .first(),
      ]);
      const best = Math.max(
        lastChannelAt ?? 0,
        lastAgentAt ?? 0,
        Number(latestLesson?.completedAt ?? 0),
      );
      latestActivityByMember.set(memberKey, best > 0 ? best : null);
    }),
  );
  const reengagement = countReengagedMembersFromSentChecks({
    sentChecks: sentChecks.filter((c: any) => uniqueMembers.has(c.memberUserId)),
    latestActivityByMember,
  });

  return {
    enabled: row ? Boolean(row.enabled) : true,
    auto_reasons: normalizeMemberCoachReasons(row?.autoReasons ?? []),
    auto_reply_enabled: Boolean(row?.autoReplyEnabled),
    thread_followup_enabled: row?.threadFollowupEnabled !== false,
    weekly_digest_enabled: row?.weeklyDigestEnabled !== false,
    sent_this_week: sentWeek.length,
    waiting_count: waiting.filter((item: any) => nowMs - item.createdAt <= MEMBER_COACH_DRAFT_MAX_AGE_MS).length,
    heartbeat: {
      community_tier: (row?.communityHeartbeatTier ?? "active") as CommunityHeartbeatTier,
      counts: row?.temperatureSnapshot
        ? {
            hot: Number(row.temperatureSnapshot.hot ?? 0),
            warm: Number(row.temperatureSnapshot.warm ?? 0),
            cooling: Number(row.temperatureSnapshot.cooling ?? 0),
            cold: Number(row.temperatureSnapshot.cold ?? 0),
          }
        : null,
      sampled_at: typeof row?.temperatureSnapshot?.sampledAt === "number" ? row.temperatureSnapshot.sampledAt : null,
    },
    impact: {
      plan_tier: planTier,
      total_micros: authoritativeTotalMicros,
      live_chat_micros: spend.liveChatMicros,
      proactive_micros: spend.proactiveMicros,
      brief_micros: spend.briefMicros,
      allowance_micros: allowanceMicros,
      included_allowance_micros: includedAllowanceMicros,
      paid_boost_micros: paidBoostMicros,
      usage_boost_cap_cents: usageBoostCapCents,
      first_cycle_cap_active: firstCycleCapActive,
      can_buy_usage_boost: boostAdmission.allowed,
      usage_boost_remaining_this_cycle: boostAdmission.allowed ? boostAdmission.remainingBoosts : 0,
      usage_boost_block_reason: boostAdmission.allowed ? null : boostAdmission.code,
      percent_used: authoritativePercentUsed,
      spend_truncated: spend.truncated,
      cycle_end_at: cycleEndMs,
      background_ai_paused: shouldPauseBackgroundAiForAllowance({
        settledMicros: authoritativeTotalMicros,
        allowanceMicros,
      }),
      reengaged_30d: reengagement.reengagedCount,
      contacted_30d: reengagement.contactedCount,
      reengagement_truncated: reengagementTruncated,
    },
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
    weeklyDigestEnabled: v.optional(v.boolean()),
    usageBoostCapCents: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<MemberCoachSettingsView> => {
    const { userId } = await requireOwner(ctx, args.authSubject, args.communityId);
    if (
      args.usageBoostCapCents !== undefined &&
      !isValidFounderUsageBoostCapCents(args.usageBoostCapCents)
    ) {
      throw new Error("community_usage_boost_cap_invalid");
    }
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
    const nextWeeklyDigest =
      args.weeklyDigestEnabled !== undefined
        ? args.weeklyDigestEnabled
        : existing?.weeklyDigestEnabled !== false;
    const nextUsageBoostCapCents =
      args.usageBoostCapCents !== undefined
        ? args.usageBoostCapCents
        : normalizeFounderUsageBoostCapCents(existing?.usageBoostCapCents);
    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        autoReasons,
        autoReplyEnabled: nextAutoReply,
        threadFollowupEnabled: nextThreadFollowup,
        weeklyDigestEnabled: nextWeeklyDigest,
        usageBoostCapCents: nextUsageBoostCapCents,
        ...(args.enabled && !existing.nextScanAt ? { nextScanAt: nowMs } : {}),
        ...(existing.builderNextScanAt === undefined ? { builderNextScanAt: nowMs } : {}),
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
        weeklyDigestEnabled: nextWeeklyDigest,
        usageBoostCapCents: nextUsageBoostCapCents,
        ...(args.enabled ? { nextScanAt: nowMs } : {}),
        builderNextScanAt: nowMs,
        updatedByUserId: userId,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }
    if (nextWeeklyDigest) {
      await syncCommunityWeeklyDigestScheduleForCommunity(ctx, {
        communityId: args.communityId,
        nowMs,
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
