// Member Journey Board (docs/specs/proactive-community-agent-v0.md):
// Ordered plain-English stages + one card per active member, with live health
// status, privacy-safe agent outcome notes, and founder instructions that the
// proactive Chief of Staff reads on its next check-in.
//
// Manager-only (owners and admins): members and moderators fail closed.
// Founders see outcomes and their own instructions, NEVER members' private words.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import {
  communityMembershipRowIsActive,
  readCommunityActiveMemberCount,
  requireCommunityManager,
} from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { factVisibleToHost, moneyFor, planFor } from "../shared/communityMemberRecords";
import {
  DEFAULT_JOURNEY_STAGES,
  MAX_AGENT_OUTCOME_CHARS,
  defaultStageKeyForMember,
  deriveMemberJourneyStatus,
  formatCoachOutcomeSummary,
  formatMemberActivitySummary,
  normalizeFounderInstruction,
  normalizeJourneyStages,
  type JourneyCardStatus,
  type JourneyStageDefinition,
} from "../shared/communityMemberJourney";

const BOARD_MEMBER_CAP = 200;
const COACH_OUTCOME_SCAN_CAP = 300;
const GOALS_SCAN_CAP = 500;

const iso = (ms: number | null | undefined) =>
  typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null;

const statusOverrideValidator = v.union(
  v.literal("on_track"),
  v.literal("stuck"),
  v.literal("needs_you"),
  v.literal("quiet"),
  v.literal("done"),
  v.literal("auto"),
);

async function readStagesForCommunity(ctx: any, communityId: any): Promise<{
  stages: JourneyStageDefinition[];
  autoAdvanceEnabled: boolean;
}> {
  const config = await ctx.db
    .query("communityJourneyConfig")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .unique();
  if (!config || !Array.isArray(config.stages) || config.stages.length === 0) {
    return {
      stages: DEFAULT_JOURNEY_STAGES.map((stage) => ({ ...stage })),
      autoAdvanceEnabled: false,
    };
  }
  const ordered = [...config.stages]
    .sort((a: any, b: any) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .map((stage: any, index: number) => ({
      key: String(stage.key),
      name: String(stage.name),
      goal: String(stage.goal ?? ""),
      position: index,
    }));
  return {
    stages: ordered,
    autoAdvanceEnabled: config.autoAdvanceEnabled === true,
  };
}

async function readMemberParticipationSignals(
  ctx: any,
  communityId: any,
  userId: any,
): Promise<{
  postsCount: number;
  lessonsDoneCount: number;
  lessonsCapped: boolean;
  participationCount: number;
  lastParticipationAtMs: number | null;
}> {
  const COURSE_MODULE_SCAN_CAP = 25;
  const [liveRoots, liveReplies, courseProgressRows] = await Promise.all([
    ctx.db
      .query("communityInteractionRoots")
      .withIndex("by_community_actorUser_createdAt", (q: any) =>
        q.eq("communityId", communityId).eq("actorUserId", userId),
      )
      .order("desc")
      .filter((q: any) => q.eq(q.field("status"), "live"))
      .take(5),
    ctx.db
      .query("communityInteractionReplies")
      .withIndex("by_community_actorUser_createdAt", (q: any) =>
        q.eq("communityId", communityId).eq("actorUserId", userId),
      )
      .order("desc")
      .filter((q: any) => q.eq(q.field("status"), "live"))
      .take(5),
    ctx.db
      .query("communityCourseProgress")
      .withIndex("by_community_user_lastCompletedAt", (q: any) =>
        q.eq("communityId", communityId).eq("userId", userId),
      )
      .order("desc")
      .take(COURSE_MODULE_SCAN_CAP),
  ]);
  const postsCount = liveRoots.length + liveReplies.length;
  let lessonsDoneCount = 0;
  let lastCourseAt = 0;
  for (const row of courseProgressRows) {
    if (Array.isArray(row.doneResourceIds)) lessonsDoneCount += row.doneResourceIds.length;
    const completedAt = Number(row.lastCompletedAt ?? 0);
    if (completedAt > lastCourseAt) lastCourseAt = completedAt;
  }
  const latestRootAt = liveRoots[0] ? Number(liveRoots[0].createdAt ?? 0) : 0;
  const latestReplyAt = liveReplies[0] ? Number(liveReplies[0].createdAt ?? 0) : 0;
  const bestAt = Math.max(latestRootAt, latestReplyAt, lastCourseAt);
  return {
    postsCount,
    lessonsDoneCount,
    lessonsCapped: courseProgressRows.length >= COURSE_MODULE_SCAN_CAP,
    participationCount: postsCount + lessonsDoneCount,
    lastParticipationAtMs: bestAt > 0 ? bestAt : null,
  };
}

async function resolveDerivedStageKeyForMember(
  ctx: any,
  args: {
    communityId: any;
    userId: any;
    stages: JourneyStageDefinition[];
    membership?: any | null;
    user?: any | null;
    presence?: any | null;
    participation?: { participationCount: number; lastParticipationAtMs: number | null } | null;
    nowMs: number;
  },
): Promise<string> {
  const [membership, user, presence, participation] = await Promise.all([
    args.membership !== undefined
      ? Promise.resolve(args.membership)
      : ctx.db
          .query("communityMemberships")
          .withIndex("by_community_user", (q: any) =>
            q.eq("communityId", args.communityId).eq("userId", args.userId),
          )
          .unique(),
    args.user !== undefined ? Promise.resolve(args.user) : ctx.db.get(args.userId),
    args.presence !== undefined
      ? Promise.resolve(args.presence)
      : ctx.db
          .query("communityPresence")
          .withIndex("by_community_user", (q: any) =>
            q.eq("communityId", args.communityId).eq("userId", args.userId),
          )
          .unique(),
    args.participation !== undefined && args.participation !== null
      ? Promise.resolve(args.participation)
      : readMemberParticipationSignals(ctx, args.communityId, args.userId),
  ]);
  const joinedAtMs = typeof membership?.createdAt === "number" ? membership.createdAt : null;
  const presenceAt = typeof presence?.lastSeenAt === "number" ? presence.lastSeenAt : 0;
  const userAt = typeof user?.lastActiveAt === "number" ? user.lastActiveAt : 0;
  const partAt = participation?.lastParticipationAtMs ?? 0;
  const bestActiveAt = Math.max(presenceAt, userAt, partAt);
  const lastActiveAtMs = bestActiveAt > 0 ? bestActiveAt : null;
  return defaultStageKeyForMember({
    stages: args.stages,
    joinedAtMs,
    lastActiveAtMs,
    participationCount: participation?.participationCount ?? 0,
    nowMs: args.nowMs,
  });
}

// Reads ONLY the timestamp of the member's most recent message in their private
// Guide thread (never reads or returns message text) so reply receipts stay
// accurate even after the 24h email nudge reaches a terminal state.
async function readLastMemberGuideReplyAt(
  ctx: any,
  args: {
    communityId: any;
    userId: any;
    draftThreadIds: string[];
  },
): Promise<number | null> {
  const threadIds = new Set<string>(args.draftThreadIds.filter((id) => Boolean(id)));
  const channel = await ctx.db
    .query("memberAgentChannels")
    .withIndex("by_owner_scope_community", (q: any) =>
      q.eq("ownerId", args.userId).eq("scopeKey", "community").eq("communityId", args.communityId),
    )
    .unique();
  if (channel?.activeEpisodeId) {
    const episode = await ctx.db.get(channel.activeEpisodeId);
    if (episode?.threadId) threadIds.add(String(episode.threadId));
  }
  if (threadIds.size === 0) return null;

  let latestUserReplyAt: number | null = null;
  const batches = await Promise.all(
    [...threadIds].map((threadId) =>
      ctx.db
        .query("cloudMessages")
        .withIndex("by_thread_seq", (q: any) => q.eq("threadId", threadId))
        .order("desc")
        .take(12),
    ),
  );
  for (const recent of batches) {
    const lastUser = recent.find((msg: any) => msg.role === "user");
    const createdAt = typeof lastUser?.createdAt === "number" ? lastUser.createdAt : null;
    if (createdAt !== null && (latestUserReplyAt === null || createdAt > latestUserReplyAt)) {
      latestUserReplyAt = createdAt;
    }
  }
  return latestUserReplyAt;
}

// Used by convex/communityMemberCoach.ts when preparing a proactive check-in
// candidate so the Chief of Staff honours the member's stage goal and any
// founder instruction left on their Journey card.
export async function readMemberJourneyGuidanceForCoach(
  ctx: any,
  args: { communityId: any; memberUserId: any; nowMs?: number },
): Promise<{
  stageName: string;
  stageGoal: string;
  founderInstruction: string | null;
} | null> {
  const [config, card] = await Promise.all([
    readStagesForCommunity(ctx, args.communityId),
    ctx.db
      .query("communityMemberJourneyCards")
      .withIndex("by_community_user", (q: any) =>
        q.eq("communityId", args.communityId).eq("userId", args.memberUserId),
      )
      .unique(),
  ]);
  const validStageKeys = new Set(config.stages.map((entry) => entry.key));
  const effectiveStageKey =
    card && validStageKeys.has(card.stageKey)
      ? String(card.stageKey)
      : await resolveDerivedStageKeyForMember(ctx, {
          communityId: args.communityId,
          userId: args.memberUserId,
          stages: config.stages,
          nowMs: args.nowMs ?? Date.now(),
        });
  const stage =
    config.stages.find((entry) => entry.key === effectiveStageKey) ?? config.stages[0] ?? null;
  const founderInstruction = normalizeFounderInstruction(card?.founderInstruction);
  if (!stage && !founderInstruction) return null;
  return {
    stageName: stage?.name ?? "New",
    stageGoal: stage?.goal ?? "",
    founderInstruction,
  };
}

// Used by convex/communityMemberCoach.ts when a check-in is sent so the
// member's Journey card records a strictly privacy-safe outcome note.
export async function recordMemberJourneyCoachOutcome(
  ctx: any,
  args: { communityId: any; memberUserId: any; outcomeNote: string; nowMs: number },
): Promise<void> {
  const note = String(args.outcomeNote ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_AGENT_OUTCOME_CHARS);
  if (!note) return;
  const [config, existing] = await Promise.all([
    readStagesForCommunity(ctx, args.communityId),
    ctx.db
      .query("communityMemberJourneyCards")
      .withIndex("by_community_user", (q: any) =>
        q.eq("communityId", args.communityId).eq("userId", args.memberUserId),
      )
      .unique(),
  ]);
  if (existing) {
    await ctx.db.patch(existing._id, {
      agentOutcomeNote: note,
      agentOutcomeAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    return;
  }
  const derivedStageKey = await resolveDerivedStageKeyForMember(ctx, {
    communityId: args.communityId,
    userId: args.memberUserId,
    stages: config.stages,
    nowMs: args.nowMs,
  });
  await ctx.db.insert("communityMemberJourneyCards", {
    communityId: args.communityId,
    userId: args.memberUserId,
    stageKey: derivedStageKey,
    agentOutcomeNote: note,
    agentOutcomeAt: args.nowMs,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
}

export const getCommunityMemberJourneyBoard = query({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const actorUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: actorUserId,
    });
    const nowMs = Date.now();
    const [{ stages, autoAdvanceEnabled }, activeRosterRows, pricePoints, goalFacts, waitingCoachDrafts, sentCoachDrafts] =
      await Promise.all([
        readStagesForCommunity(ctx, args.communityId),
        // Filter to active memberships via index BEFORE applying the board cap so
        // historical churned rows never push active members off the board.
        ctx.db
          .query("communityMemberships")
          .withIndex("by_community_state_createdAt", (q: any) =>
            q.eq("communityId", args.communityId).eq("state", "active"),
          )
          .order("desc")
          .take(BOARD_MEMBER_CAP + 2),
        ctx.db
          .query("communityPricePoints")
          .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
          .take(100),
        ctx.db
          .query("memberFacts")
          .withIndex("by_community_kind", (q: any) =>
            q.eq("communityId", args.communityId).eq("kind", "goal"),
          )
          .take(GOALS_SCAN_CAP),
        ctx.db
          .query("communityMemberCoachDrafts")
          .withIndex("by_community_status_createdAt", (q: any) =>
            q.eq("communityId", args.communityId).eq("status", "waiting"),
          )
          .order("desc")
          .take(COACH_OUTCOME_SCAN_CAP),
        ctx.db
          .query("communityMemberCoachDrafts")
          .withIndex("by_community_status_sentAt", (q: any) =>
            q.eq("communityId", args.communityId).eq("status", "sent"),
          )
          .order("desc")
          .take(COACH_OUTCOME_SCAN_CAP),
      ]);

    const ownerId = String(community.ownerId);
    const nonOwnerActive = activeRosterRows.filter(
      (row: any) => communityMembershipRowIsActive(row) && String(row.userId) !== ownerId,
    );
    const capped = nonOwnerActive.length > BOARD_MEMBER_CAP;
    const activeMemberships = nonOwnerActive.slice(0, BOARD_MEMBER_CAP);

    const validStageKeys = new Set(stages.map((stage) => stage.key));

    const priceById = new Map<string, any>();
    for (const point of pricePoints) {
      priceById.set(String(point._id), {
        id: String(point._id),
        name: point.name,
        amountBaseUnits: point.amountBaseUnits,
        currency: point.currency,
        currencyDecimals: point.currencyDecimals,
        billingPeriod: point.billingPeriod,
      });
    }

    const goalByUserId = new Map<string, string>();
    const goalUpdatedByUserId = new Map<string, number>();
    for (const fact of goalFacts) {
      if (!factVisibleToHost(fact)) continue;
      const key = String(fact.userId);
      const prevAt = goalUpdatedByUserId.get(key) ?? 0;
      if (Number(fact.updatedAt ?? 0) >= prevAt) {
        goalUpdatedByUserId.set(key, Number(fact.updatedAt ?? 0));
        goalByUserId.set(key, String(fact.body ?? "").trim().slice(0, 140));
      }
    }

    const coachDraftsByUserId = new Map<string, any[]>();
    for (const check of [...waitingCoachDrafts, ...sentCoachDrafts]) {
      const key = String(check.memberUserId);
      const list = coachDraftsByUserId.get(key);
      if (list) list.push(check);
      else coachDraftsByUserId.set(key, [check]);
    }

    const cards = await Promise.all(
      activeMemberships.map(async (membership: any) => {
        const userIdStr = String(membership.userId);
        const memberDrafts = coachDraftsByUserId.get(userIdStr) ?? [];
        const sentDrafts = memberDrafts.filter((check: any) => check.status === "sent");
        const sentThreadIds = sentDrafts
          .map((check: any) => (typeof check.threadId === "string" ? check.threadId : ""))
          .filter(Boolean);

        const [userRaw, profile, storedCard, subRows, presence, participation, lastGuideReplyAt] = await Promise.all([
          ctx.db.get(membership.userId),
          resolveUserProfileDisplayProjection(ctx, membership.userId),
          ctx.db
            .query("communityMemberJourneyCards")
            .withIndex("by_community_user", (q: any) =>
              q.eq("communityId", args.communityId).eq("userId", membership.userId),
            )
            .unique(),
          ctx.db
            .query("communitySubscriptions")
            .withIndex("by_membership", (q: any) => q.eq("membershipId", membership._id))
            .take(5),
          ctx.db
            .query("communityPresence")
            .withIndex("by_community_user", (q: any) =>
              q.eq("communityId", args.communityId).eq("userId", membership.userId),
            )
            .unique(),
          readMemberParticipationSignals(ctx, args.communityId, membership.userId),
          sentDrafts.length > 0
            ? readLastMemberGuideReplyAt(ctx, {
                communityId: args.communityId,
                userId: membership.userId,
                draftThreadIds: sentThreadIds,
              })
            : Promise.resolve(null),
        ]);
        const user: any = userRaw;

        subRows.sort((a: any, b: any) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0));
        const subscription = subRows.find((row: any) => row.status !== "ended") ?? subRows[0] ?? null;
        const point = subscription?.pricePointId ? priceById.get(String(subscription.pricePointId)) ?? null : null;
        const plan = planFor({ isOwner: false, accessSource: membership.accessSource, pricePoint: point });
        const money = moneyFor({ membershipState: membership.state, subscription });
        const moneyKind = money?.kind === "on_hold" || money?.kind === "cancelling" ? money.kind : null;

        const joinedAtMs = typeof membership.createdAt === "number" ? membership.createdAt : null;
        const bestActiveAt = Math.max(
          typeof presence?.lastSeenAt === "number" ? presence.lastSeenAt : 0,
          typeof user?.lastActiveAt === "number" ? user.lastActiveAt : 0,
          participation.lastParticipationAtMs ?? 0,
        );
        const lastActiveAtMs = bestActiveAt > 0 ? bestActiveAt : null;

        const stageKey =
          storedCard && validStageKeys.has(storedCard.stageKey)
            ? String(storedCard.stageKey)
            : defaultStageKeyForMember({
                stages,
                joinedAtMs,
                lastActiveAtMs,
                participationCount: participation.participationCount,
                nowMs,
              });

        let latestCoachSummary: { summary: string; at: number } | null = null;
        let unansweredCoachCount = 0;
        for (const check of memberDrafts) {
          const at = Number(check.sentAt ?? check.createdAt ?? 0);
          const sentAt = Number(check.sentAt ?? check.createdAt ?? 0);
          const replied =
            check.status === "sent" &&
            typeof lastGuideReplyAt === "number" &&
            sentAt > 0 &&
            lastGuideReplyAt >= sentAt;
          if (check.status === "sent" && !replied) {
            unansweredCoachCount += 1;
          }
          if (!latestCoachSummary || at > latestCoachSummary.at) {
            latestCoachSummary = {
              summary: formatCoachOutcomeSummary({
                status: check.status,
                reason: check.reason,
                sentAt: check.sentAt ?? null,
                createdAt: check.createdAt,
                replied,
              }),
              at,
            };
          }
        }

        const statusOverride = (storedCard?.statusOverride ?? null) as JourneyCardStatus | null;
        const status = deriveMemberJourneyStatus({
          statusOverride,
          stageKey,
          stages,
          moneyKind,
          lastActiveAtMs,
          joinedAtMs,
          unansweredCoachCount,
          nowMs,
        });

        const storedOutcomeAt = typeof storedCard?.agentOutcomeAt === "number" ? storedCard.agentOutcomeAt : 0;
        const coachAt = latestCoachSummary?.at ?? 0;
        const agentOutcome =
          latestCoachSummary && coachAt >= storedOutcomeAt
            ? latestCoachSummary.summary
            : storedCard?.agentOutcomeNote
              ? String(storedCard.agentOutcomeNote)
              : latestCoachSummary?.summary ?? null;
        const agentOutcomeAt = Math.max(storedOutcomeAt, coachAt) || null;

        return {
          membership_id: String(membership._id),
          user_id: String(user?.authSubject ?? "").trim() || String(membership.userId),
          name: profile?.display_name || user?.displayName || user?.handle || "Member",
          handle: user?.handle ?? null,
          avatar_url: profile?.avatar_url ?? null,
          avatar_focus_x: profile?.avatar_focus_x ?? 0.5,
          avatar_focus_y: profile?.avatar_focus_y ?? 0.5,
          avatar_zoom: profile?.avatar_zoom ?? 1,
          role: membership.role as "owner" | "admin" | "moderator" | "member",
          plan_label: plan.label,
          money_kind: moneyKind,
          stage_key: stageKey,
          status,
          status_is_manual: Boolean(statusOverride),
          founder_instruction: normalizeFounderInstruction(storedCard?.founderInstruction),
          founder_instruction_updated_at: iso(storedCard?.founderInstructionUpdatedAt),
          agent_outcome: agentOutcome,
          agent_outcome_at: iso(agentOutcomeAt),
          working_on: goalByUserId.get(userIdStr) ?? null,
          activity_summary: formatMemberActivitySummary({
            postsCount: participation.postsCount,
            lessonsDoneCount: participation.lessonsDoneCount,
            lessonsCapped: participation.lessonsCapped,
          }),
          joined_at: iso(joinedAtMs),
          last_active_at: iso(lastActiveAtMs),
        };
      }),
    );

    const totalActiveMembers = Math.max(
      cards.length,
      (readCommunityActiveMemberCount(community) ?? cards.length) - 1,
    );

    return {
      stages,
      auto_advance_enabled: autoAdvanceEnabled,
      cards,
      total_active_members: totalActiveMembers,
      capped,
    };
  },
});

export const saveCommunityJourneyStages = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    stages: v.array(
      v.object({
        key: v.optional(v.string()),
        name: v.string(),
        goal: v.string(),
      }),
    ),
    autoAdvanceEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actorUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: actorUserId,
    });
    const normalized = normalizeJourneyStages(args.stages);
    if (!normalized.ok) throw new Error(normalized.code);

    const nowMs = Date.now();
    const existing = await ctx.db
      .query("communityJourneyConfig")
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .unique();
    const autoAdvanceEnabled =
      args.autoAdvanceEnabled !== undefined
        ? args.autoAdvanceEnabled
        : existing?.autoAdvanceEnabled === true;

    if (existing) {
      await ctx.db.patch(existing._id, {
        stages: normalized.stages,
        autoAdvanceEnabled,
        updatedByUserId: actorUserId,
        updatedAt: nowMs,
      });
    } else {
      await ctx.db.insert("communityJourneyConfig", {
        communityId: args.communityId,
        stages: normalized.stages,
        autoAdvanceEnabled,
        updatedByUserId: actorUserId,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }

    // Reassign any member cards pointing to a removed stage onto the first remaining stage.
    const validKeys = new Set(normalized.stages.map((stage) => stage.key));
    const fallbackStageKey = normalized.stages[0]!.key;
    const cards = await ctx.db
      .query("communityMemberJourneyCards")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId))
      .take(500);
    for (const card of cards) {
      if (!validKeys.has(card.stageKey)) {
        await ctx.db.patch(card._id, {
          stageKey: fallbackStageKey,
          updatedByUserId: actorUserId,
          updatedAt: nowMs,
        });
      }
    }

    return {
      stages: normalized.stages,
      auto_advance_enabled: autoAdvanceEnabled,
    };
  },
});

export const updateMemberJourneyCard = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    membershipId: v.id("communityMemberships"),
    stageKey: v.optional(v.string()),
    statusOverride: v.optional(statusOverrideValidator),
    founderInstruction: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actorUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: actorUserId,
    });
    const membership: any = await ctx.db.get(args.membershipId);
    if (
      !membership ||
      String(membership.communityId) !== String(args.communityId) ||
      !communityMembershipRowIsActive(membership) ||
      String(membership.userId) === String(community.ownerId)
    ) {
      throw new Error("community_member_not_found");
    }

    const { stages } = await readStagesForCommunity(ctx, args.communityId);
    const validKeys = new Set(stages.map((stage) => stage.key));
    if (args.stageKey !== undefined && !validKeys.has(args.stageKey)) {
      throw new Error("journey_stage_not_found");
    }

    const nowMs = Date.now();
    const existing = await ctx.db
      .query("communityMemberJourneyCards")
      .withIndex("by_community_user", (q: any) =>
        q.eq("communityId", args.communityId).eq("userId", membership.userId),
      )
      .unique();

    const nextStageKey =
      args.stageKey ??
      (existing && validKeys.has(existing.stageKey)
        ? existing.stageKey
        : await resolveDerivedStageKeyForMember(ctx, {
            communityId: args.communityId,
            userId: membership.userId,
            stages,
            membership,
            nowMs,
          }));
    const nextStatusOverride: JourneyCardStatus | undefined =
      args.statusOverride === undefined
        ? existing?.statusOverride
        : args.statusOverride === "auto"
          ? undefined
          : args.statusOverride;
    const hasInstructionUpdate = args.founderInstruction !== undefined;
    const nextInstruction = hasInstructionUpdate
      ? normalizeFounderInstruction(args.founderInstruction)
      : normalizeFounderInstruction(existing?.founderInstruction);

    if (existing) {
      await ctx.db.patch(existing._id, {
        stageKey: nextStageKey,
        statusOverride: nextStatusOverride,
        ...(hasInstructionUpdate
          ? {
              founderInstruction: nextInstruction ?? undefined,
              founderInstructionUpdatedAt: nextInstruction ? nowMs : undefined,
            }
          : {}),
        updatedByUserId: actorUserId,
        updatedAt: nowMs,
      });
    } else {
      await ctx.db.insert("communityMemberJourneyCards", {
        communityId: args.communityId,
        userId: membership.userId,
        stageKey: nextStageKey,
        ...(nextStatusOverride ? { statusOverride: nextStatusOverride } : {}),
        ...(nextInstruction
          ? { founderInstruction: nextInstruction, founderInstructionUpdatedAt: nowMs }
          : {}),
        updatedByUserId: actorUserId,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }

    return {
      stage_key: nextStageKey,
      status_override: nextStatusOverride ?? null,
      founder_instruction: nextInstruction,
    };
  },
});
