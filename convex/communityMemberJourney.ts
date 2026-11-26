// Member Journey Board (docs/specs/proactive-community-agent-v0.md):
// Ordered plain-English stages + one card per active member, with live health
// status, privacy-safe agent outcome notes, and founder instructions that the
// proactive Chief of Staff reads on its next check-in.
//
// Manager-only (owners and admins): members and moderators fail closed.
// Founders see outcomes and their own instructions, NEVER members' private words.
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { communityAgentIsOn } from "./communityApps";
import {
  communityMembershipRowIsActive,
  getActiveCommunityBlock,
  getUniqueCommunityMembershipByPair,
  readCommunityActiveMemberCount,
  requireCommunityManager,
} from "./communityCore";
import {
  communityHasProactiveAgentTier,
  resolveCommunityInferenceFundingAdmission,
} from "./founderInferenceCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { verifiedUserIdForEmail } from "./communityCheckoutBuyer";
import { communityIsActive } from "../shared/communityLifecycle";
import { factVisibleToHost, moneyFor, planFor } from "../shared/communityMemberRecords";
import type { CommunityMemberJourneySelfSummary } from "../shared/communityMemberSelfContext";
import {
  DEFAULT_JOURNEY_STAGES,
  JOURNEY_CARD_STATUSES,
  JOURNEY_CARD_STATUS_SORT_RANK,
  MAX_AGENT_OUTCOME_CHARS,
  MAX_CARD_OUTCOMES,
  MAX_CHECKPOINT_LABEL_CHARS,
  MAX_JOURNEY_STAGES,
  MAX_STAGE_CHECKPOINTS,
  MIN_JOURNEY_STAGES,
  defaultStageKeyForMember,
  deriveMemberJourneyStatus,
  evaluateStageCheckpoints,
  formatCoachOutcomeSummary,
  formatMemberActivitySummary,
  normalizeFounderInstruction,
  normalizeJourneyStages,
  normalizeOutcomeText,
  normalizeStageCheckpoints,
  renderMemberGuideCoachingContext,
  slugifyJourneyStageKey,
  type JourneyCardStatus,
  type JourneyMilestoneSource,
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
      stages: DEFAULT_JOURNEY_STAGES.map((stage) => ({
        ...stage,
        checkpoints: stage.checkpoints.map((cp) => ({ ...cp })),
      })),
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
      checkpoints: normalizeStageCheckpoints(stage.checkpoints),
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

const COACH_UNANSWERED_STUCK_GRACE_MS = 48 * 60 * 60 * 1000;
const ONBOARDING_UNANSWERED_STUCK_GRACE_MS = 72 * 60 * 60 * 1000;

function isUnansweredCoachTouchStale(args: {
  status: string;
  reason?: string;
  sentAt: number;
  replied: boolean;
  nowMs: number;
}): boolean {
  if (args.status !== "sent" || args.replied || args.sentAt <= 0) return false;
  const graceMs =
    args.reason === "member_onboarding"
      ? ONBOARDING_UNANSWERED_STUCK_GRACE_MS
      : COACH_UNANSWERED_STUCK_GRACE_MS;
  return args.nowMs - args.sentAt >= graceMs;
}

function unconfiguredCompletedAppMilestoneLabels(args: {
  stages: readonly JourneyStageDefinition[];
  completedMilestones?: ReadonlyArray<{ key: string; label?: string; source?: string }> | null;
}): string[] {
  const configuredKeys = new Set(args.stages.flatMap((stage) => stage.checkpoints.map((cp) => cp.key)));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of args.completedMilestones ?? []) {
    if (!row || row.source !== "app" || !row.key || configuredKeys.has(String(row.key))) continue;
    const label = String(row.label ?? row.key).replace(/\s+/g, " ").trim();
    const norm = label.toLowerCase();
    if (!label || seen.has(norm)) continue;
    seen.add(norm);
    out.push(label.slice(0, MAX_CHECKPOINT_LABEL_CHARS));
  }
  return out.slice(0, 6);
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
  let stageGoal = stage?.goal ?? "";
  if (stage && stage.checkpoints.length > 0) {
    const [participation, goalRows] = await Promise.all([
      readMemberParticipationSignals(ctx, args.communityId, args.memberUserId),
      ctx.db
        .query("memberFacts")
        .withIndex("by_user_community", (q: any) =>
          q.eq("userId", args.memberUserId).eq("communityId", args.communityId),
        )
        .filter((q: any) => q.eq(q.field("kind"), "goal"))
        .take(10),
    ]);
    const hasSharedGoal = goalRows.some((fact: any) => fact.kind === "goal" && factVisibleToHost(fact));
    const evaluated = evaluateStageCheckpoints({
      checkpoints: stage.checkpoints,
      postsCount: participation.postsCount,
      lessonsDoneCount: participation.lessonsDoneCount,
      hasSharedGoal,
      completedMilestones: card?.completedMilestones,
    });
    const remaining = evaluated.filter((cp) => !cp.done).map((cp) => cp.label);
    if (remaining.length > 0) {
      stageGoal = `${stageGoal ? `${stageGoal} ` : ""}Next stage checkpoints: ${remaining.join(", ")}.`;
    }
  }
  const extraAppMilestones = unconfiguredCompletedAppMilestoneLabels({
    stages: config.stages,
    completedMilestones: card?.completedMilestones,
  });
  if (extraAppMilestones.length > 0) {
    stageGoal = `${stageGoal ? `${stageGoal} ` : ""}Completed product milestones: ${extraAppMilestones.join(", ")}.`;
  }
  return {
    stageName: stage?.name ?? "New",
    stageGoal,
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

async function computeCommunityMemberJourneyBoard(
  ctx: any,
  args: { communityId: any; community: any; nowMs: number },
) {
  const { nowMs, community } = args;
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
  const nonOwnerActive: Array<Record<string, any>> = activeRosterRows.filter(
    (row: any) => communityMembershipRowIsActive(row) && String(row.userId) !== ownerId,
  );
  const capped = nonOwnerActive.length > BOARD_MEMBER_CAP;
  const activeMemberships: Array<Record<string, any>> = nonOwnerActive.slice(0, BOARD_MEMBER_CAP);

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
        if (
          isUnansweredCoachTouchStale({
            status: check.status,
            reason: check.reason,
            sentAt,
            replied,
            nowMs,
          })
        ) {
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

      const currentStage = stages.find((entry) => entry.key === stageKey) ?? stages[0] ?? null;
      const workingOn = goalByUserId.get(userIdStr) ?? null;
      const evaluatedCheckpoints = evaluateStageCheckpoints({
        checkpoints: currentStage?.checkpoints ?? [],
        postsCount: participation.postsCount,
        lessonsDoneCount: participation.lessonsDoneCount,
        hasSharedGoal: Boolean(workingOn),
        completedMilestones: storedCard?.completedMilestones,
      });
      const checkpointsView = evaluatedCheckpoints.map((cp) => ({
        key: cp.key,
        label: cp.label,
        kind: cp.kind,
        done: cp.done,
        auto: cp.auto,
        completed_at: iso(cp.completedAtMs),
      }));
      const checkpointsDone = checkpointsView.filter((cp) => cp.done).length;
      const rawOutcomes = Array.isArray(storedCard?.outcomes) ? storedCard.outcomes : [];
      const outcomesView = [...rawOutcomes]
        .sort((a: any, b: any) => Number(b.at ?? 0) - Number(a.at ?? 0))
        .slice(0, MAX_CARD_OUTCOMES)
        .map((item: any) => ({
          id: String(item.id),
          text: String(item.text),
          at: iso(item.at) ?? new Date(nowMs).toISOString(),
          source: (item.source ?? "founder") as JourneyMilestoneSource,
        }));
      const latestOutcome = outcomesView[0]
        ? { text: outcomesView[0].text, at: outcomesView[0].at }
        : null;

      return {
        membership_id: String(membership._id),
        db_user_id: userIdStr,
        user_id: String(user?.authSubject ?? "").trim() || userIdStr,
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
        stage_name: currentStage?.name ?? stageKey,
        status,
        status_is_manual: Boolean(statusOverride),
        founder_instruction: normalizeFounderInstruction(storedCard?.founderInstruction),
        founder_instruction_updated_at: iso(storedCard?.founderInstructionUpdatedAt),
        agent_outcome: agentOutcome,
        agent_outcome_at: iso(agentOutcomeAt),
        working_on: workingOn,
        activity_summary: formatMemberActivitySummary({
          postsCount: participation.postsCount,
          lessonsDoneCount: participation.lessonsDoneCount,
          lessonsCapped: participation.lessonsCapped,
        }),
        checkpoints: checkpointsView,
        checkpoints_done: checkpointsDone,
        checkpoints_total: checkpointsView.length,
        outcomes: outcomesView,
        latest_outcome: latestOutcome,
        joined_at: iso(joinedAtMs),
        last_active_at: iso(lastActiveAtMs),
        dismissed_advance_for_stage_key: storedCard?.dismissedAdvanceForStageKey
          ? String(storedCard.dismissedAdvanceForStageKey)
          : null,
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
    const [board, agentOn, fundingAdmission] = await Promise.all([
      computeCommunityMemberJourneyBoard(ctx, {
        communityId: args.communityId,
        community,
        nowMs,
      }),
      communityAgentIsOn(ctx, args.communityId),
      resolveCommunityInferenceFundingAdmission(ctx, args.communityId, nowMs),
    ]);
    return {
      stages: board.stages,
      auto_advance_enabled: board.auto_advance_enabled,
      cards: board.cards.map(
        ({ db_user_id: _dbUserId, stage_name: _stageName, dismissed_advance_for_stage_key: _dismissed, ...card }) => card,
      ),
      total_active_members: board.total_active_members,
      capped: board.capped,
      hosted_ai_tier: (fundingAdmission.ok ? fundingAdmission.planTier : "free") as "free" | "guide" | "chief_of_staff",
      hosted_agent_on: agentOn,
    };
  },
});

// Canonical builder/journey.json (and filtered builder/journey/stage|status/*.json)
// snapshot for owners and admins through Official Polynet MCP and Studio Guide
// chat. Re-enforces requireCommunityManager directly; never exposes any member's
// private 1:1 conversation words.
export const readCommunityMemberJourneyBoardForTrustedManagerInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    filterStageKey: v.optional(v.string()),
    filterStatus: v.optional(
      v.union(
        v.literal("needs_you"),
        v.literal("stuck"),
        v.literal("ready_to_advance"),
        v.literal("on_track"),
        v.literal("quiet"),
        v.literal("done"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const nowMs = Date.now();
    const board = await computeCommunityMemberJourneyBoard(ctx, {
      communityId: args.communityId,
      community,
      nowMs,
    });
    if (args.filterStageKey && !board.stages.some((stage) => stage.key === args.filterStageKey)) {
      throw new Error("journey_stage_not_found");
    }
    const byStage: Record<string, number> = Object.fromEntries(board.stages.map((stage) => [stage.key, 0]));
    const byStatus: Record<JourneyCardStatus, number> = {
      needs_you: 0,
      stuck: 0,
      on_track: 0,
      quiet: 0,
      done: 0,
    };
    const firstStageKey = board.stages[0]?.key ?? null;
    const lastStageKey = board.stages[board.stages.length - 1]?.key ?? null;
    const isCardReadyToAdvance = (card: (typeof board.cards)[number]) =>
      card.checkpoints_total > 0 &&
      card.checkpoints_done >= card.checkpoints_total &&
      card.stage_key !== lastStageKey &&
      card.dismissed_advance_for_stage_key !== card.stage_key;
    let readyToAdvanceCount = 0;
    let activatedCount = 0;
    for (const card of board.cards) {
      byStage[card.stage_key] = (byStage[card.stage_key] ?? 0) + 1;
      const cardStatus = card.status as JourneyCardStatus;
      byStatus[cardStatus] = (byStatus[cardStatus] ?? 0) + 1;
      if (firstStageKey && card.stage_key !== firstStageKey) activatedCount += 1;
      if (isCardReadyToAdvance(card)) {
        readyToAdvanceCount += 1;
      }
    }
    const activatedPct = board.cards.length > 0 ? Math.round((activatedCount / board.cards.length) * 100) : 0;
    const filteredCards = board.cards.filter((card) => {
      if (args.filterStageKey && card.stage_key !== args.filterStageKey) return false;
      if (args.filterStatus === "ready_to_advance") {
        return isCardReadyToAdvance(card);
      }
      if (args.filterStatus && card.status !== args.filterStatus) return false;
      return true;
    });
    // Sort cards by highest actionability first (needs_you -> stuck -> ready_to_advance -> on_track -> done -> quiet)
    // so large communities always surface the highest-priority members within the 24 KB canonical JSON budget.
    const sortedCards = [...filteredCards].sort((left, right) => {
      const leftRank = JOURNEY_CARD_STATUS_SORT_RANK[left.status as JourneyCardStatus] ?? 9;
      const rightRank = JOURNEY_CARD_STATUS_SORT_RANK[right.status as JourneyCardStatus] ?? 9;
      if (leftRank !== rightRank) return leftRank - rightRank;
      const leftReady = isCardReadyToAdvance(left) ? 0 : 1;
      const rightReady = isCardReadyToAdvance(right) ? 0 : 1;
      if (leftReady !== rightReady) return leftReady - rightReady;
      return String(right.last_active_at ?? "").localeCompare(String(left.last_active_at ?? ""));
    });

    const projectedCards = sortedCards.map((card) => {
      const readyToAdvance = isCardReadyToAdvance(card);
      return {
        member_ref: `user:${card.db_user_id}`,
        handle: card.handle,
        name: card.name,
        role: card.role,
        plan_label: card.plan_label,
        ...(card.money_kind ? { money_kind: card.money_kind } : {}),
        stage_key: card.stage_key,
        stage_name: card.stage_name,
        status: card.status,
        status_is_manual: card.status_is_manual,
        checkpoints_done: card.checkpoints_done,
        checkpoints_total: card.checkpoints_total,
        ready_to_advance: readyToAdvance,
        ...(card.checkpoints.length
          ? {
              checkpoints_remaining: card.checkpoints.filter((cp) => !cp.done).map((cp) => cp.key),
            }
          : {}),
        ...(card.latest_outcome ? { latest_outcome: card.latest_outcome } : {}),
        ...(card.outcomes.length ? { outcomes: card.outcomes.slice(0, 3) } : {}),
        ...(card.founder_instruction ? { founder_instruction: card.founder_instruction } : {}),
        ...(card.agent_outcome ? { agent_outcome: card.agent_outcome } : {}),
        ...(card.working_on ? { working_on: card.working_on } : {}),
        ...(card.activity_summary ? { activity_summary: card.activity_summary } : {}),
        joined_at: card.joined_at,
        last_active_at: card.last_active_at,
      };
    });

    // Enforce a hard budget safely below CANONICAL_JSON_DOCUMENT_MAX_CHARS (24,000)
    // so builder/journey.json ALWAYS stays valid, parseable JSON even with 200 members.
    const BUILDER_JOURNEY_JSON_BUDGET_CHARS = 22_000;
    const filterMeta =
      args.filterStageKey
        ? { filter: { kind: "stage" as const, stage_key: args.filterStageKey } }
        : args.filterStatus
          ? { filter: { kind: "status" as const, status: args.filterStatus } }
          : {};
    const buildPayload = (cardsSlice: typeof projectedCards, cardsTruncated: boolean) => ({
      read_at: new Date(nowMs).toISOString(),
      ...filterMeta,
      stages: board.stages,
      summary: {
        total_active_members: board.total_active_members,
        matched_members: projectedCards.length,
        shown_members: cardsSlice.length,
        capped: board.capped || cardsTruncated,
        cards_truncated: cardsTruncated,
        activated_pct: activatedPct,
        ready_to_advance_count: readyToAdvanceCount,
        by_stage: byStage,
        by_status: byStatus,
      },
      cards: cardsSlice,
      ...(cardsTruncated
        ? { note: "Showing highest-priority members first. Read builder/journey/stage/<key>.json, builder/journey/status/<status>.json, or members/<handle>.json for specific members." }
        : {}),
    });

    let kept = projectedCards.length;
    let payload = buildPayload(projectedCards, false);
    if ((JSON.stringify(payload, null, 2)?.length ?? 0) > BUILDER_JOURNEY_JSON_BUDGET_CHARS) {
      let low = 0;
      let high = projectedCards.length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        const candidate = buildPayload(projectedCards.slice(0, mid), mid < projectedCards.length);
        if ((JSON.stringify(candidate, null, 2)?.length ?? 0) <= BUILDER_JOURNEY_JSON_BUDGET_CHARS) {
          low = mid;
        } else {
          high = mid - 1;
        }
      }
      kept = low;
      payload = buildPayload(projectedCards.slice(0, kept), kept < projectedCards.length);
    }
    return payload;
  },
});

export const listBuilderJourneySliceEntriesForTrustedManagerInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const { stages } = await readStagesForCommunity(ctx, args.communityId);
    return {
      stages: stages.map((stage) => ({ key: stage.key, name: stage.name })),
    };
  },
});

export const listStageAdvanceProposalsForTrustedManagerInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const nowMs = Date.now();
    const [agentOn, proactiveTier] = await Promise.all([
      communityAgentIsOn(ctx, args.communityId),
      communityHasProactiveAgentTier(ctx, args.communityId, nowMs),
    ]);
    if (!agentOn || !proactiveTier) {
      return {
        is_owner: String(community.ownerId) === String(args.userId),
        hosted_agent_on: agentOn,
        proactive_tier_active: proactiveTier,
        proposals: [] as Array<JourneyStageAdvanceProposalView & { member_ref: string }>,
      };
    }
    const board = await computeCommunityMemberJourneyBoard(ctx, {
      communityId: args.communityId,
      community,
      nowMs,
    });
    const userRefByMembershipId = new Map(
      board.cards.map((card) => [card.membership_id, `user:${card.db_user_id}`]),
    );
    const proposals = extractStageAdvanceProposalsFromBoard(board, STAGE_ADVANCE_PROPOSALS_LIMIT).map((proposal) => ({
      ...proposal,
      member_ref: userRefByMembershipId.get(proposal.membership_id) ?? "",
    }));
    return {
      is_owner: String(community.ownerId) === String(args.userId),
      hosted_agent_on: agentOn,
      proactive_tier_active: proactiveTier,
      proposals,
    };
  },
});

export type BuilderMemberJourneySummary = {
  stage_key: string;
  stage_name: string;
  status: JourneyCardStatus;
  status_is_manual: boolean;
  checkpoints_done: number;
  checkpoints_total: number;
  ready_to_advance: boolean;
  checkpoints: Array<{
    key: string;
    label: string;
    kind: string;
    done: boolean;
    auto: boolean;
    completed_at: string | null;
  }>;
  founder_instruction: string | null;
  agent_outcome: string | null;
  outcomes: Array<{ id: string; text: string; at: string; source: JourneyMilestoneSource }>;
};

// Member-safe own coaching context for members/me/context.md (member_private and
// member_own_ai). Strictly excludes CRM health labels, founder instructions,
// check-in tracking metadata, and all other members.
export async function readMemberOwnJourneySummary(
  ctx: any,
  args: { communityId: any; userId: any; membership: any; nowMs: number },
): Promise<CommunityMemberJourneySelfSummary | null> {
  if (!args.membership || !communityMembershipRowIsActive(args.membership)) return null;
  const [config, storedCard, participation, goalRows] = await Promise.all([
    readStagesForCommunity(ctx, args.communityId),
    ctx.db
      .query("communityMemberJourneyCards")
      .withIndex("by_community_user", (q: any) =>
        q.eq("communityId", args.communityId).eq("userId", args.userId),
      )
      .unique(),
    readMemberParticipationSignals(ctx, args.communityId, args.userId),
    ctx.db
      .query("memberFacts")
      .withIndex("by_user_community", (q: any) =>
        q.eq("userId", args.userId).eq("communityId", args.communityId),
      )
      .filter((q: any) => q.eq(q.field("kind"), "goal"))
      .take(10),
  ]);
  const validStageKeys = new Set(config.stages.map((stage) => stage.key));
  const stageKey =
    storedCard && validStageKeys.has(storedCard.stageKey)
      ? String(storedCard.stageKey)
      : await resolveDerivedStageKeyForMember(ctx, {
          communityId: args.communityId,
          userId: args.userId,
          stages: config.stages,
          membership: args.membership,
          participation,
          nowMs: args.nowMs,
        });
  const stage = config.stages.find((entry) => entry.key === stageKey) ?? config.stages[0] ?? null;
  if (!stage) return null;
  const hasSharedGoal = goalRows.some((fact: any) => fact.kind === "goal" && factVisibleToHost(fact));
  const evaluated = evaluateStageCheckpoints({
    checkpoints: stage.checkpoints,
    postsCount: participation.postsCount,
    lessonsDoneCount: participation.lessonsDoneCount,
    hasSharedGoal,
    completedMilestones: storedCard?.completedMilestones,
  });
  const rawOutcomes = Array.isArray(storedCard?.outcomes) ? storedCard.outcomes : [];
  const recentWins = [...rawOutcomes]
    .sort((a: any, b: any) => Number(b.at ?? 0) - Number(a.at ?? 0))
    .slice(0, 5)
    .map((item: any) => ({
      text: String(item.text ?? "").slice(0, 180),
      at: iso(item.at) ?? new Date(args.nowMs).toISOString(),
    }))
    .filter((item) => Boolean(item.text));
  const extraAppMilestones = unconfiguredCompletedAppMilestoneLabels({
    stages: config.stages,
    completedMilestones: storedCard?.completedMilestones,
  });
  return {
    stage_name: stage.name,
    stage_goal: stage.goal,
    checkpoints_done: [...evaluated.filter((cp) => cp.done).map((cp) => cp.label), ...extraAppMilestones],
    checkpoints_remaining: evaluated.filter((cp) => !cp.done).map((cp) => cp.label),
    recent_wins: recentWins,
  };
}

// Per-member journey summary attached to members/<handle>.json ONLY under the
// builder lens (owners & admins). Never called for member or self views.
export async function readMemberJourneySummaryForBuilder(
  ctx: any,
  args: {
    communityId: any;
    userId: any;
    membership: any;
    subscription: any | null;
    presence: any | null;
    nowMs: number;
  },
): Promise<BuilderMemberJourneySummary | null> {
  if (!args.membership || !communityMembershipRowIsActive(args.membership)) return null;
  const [config, storedCard, userRaw, participation, goalRows, memberDrafts] = await Promise.all([
    readStagesForCommunity(ctx, args.communityId),
    ctx.db
      .query("communityMemberJourneyCards")
      .withIndex("by_community_user", (q: any) =>
        q.eq("communityId", args.communityId).eq("userId", args.userId),
      )
      .unique(),
    ctx.db.get(args.userId),
    readMemberParticipationSignals(ctx, args.communityId, args.userId),
    ctx.db
      .query("memberFacts")
      .withIndex("by_user_community", (q: any) =>
        q.eq("userId", args.userId).eq("communityId", args.communityId),
      )
      .filter((q: any) => q.eq(q.field("kind"), "goal"))
      .take(10),
    ctx.db
      .query("communityMemberCoachDrafts")
      .withIndex("by_community_member_createdAt", (q: any) =>
        q.eq("communityId", args.communityId).eq("memberUserId", args.userId),
      )
      .order("desc")
      .take(10),
  ]);
  const user: any = userRaw;
  const joinedAtMs = typeof args.membership.createdAt === "number" ? args.membership.createdAt : null;
  const bestActiveAt = Math.max(
    typeof args.presence?.lastSeenAt === "number" ? args.presence.lastSeenAt : 0,
    typeof user?.lastActiveAt === "number" ? user.lastActiveAt : 0,
    participation.lastParticipationAtMs ?? 0,
  );
  const lastActiveAtMs = bestActiveAt > 0 ? bestActiveAt : null;
  const validStageKeys = new Set(config.stages.map((stage) => stage.key));
  const stageKey =
    storedCard && validStageKeys.has(storedCard.stageKey)
      ? String(storedCard.stageKey)
      : defaultStageKeyForMember({
          stages: config.stages,
          joinedAtMs,
          lastActiveAtMs,
          participationCount: participation.participationCount,
          nowMs: args.nowMs,
        });
  const stage = config.stages.find((entry) => entry.key === stageKey) ?? config.stages[0] ?? null;
  if (!stage) return null;

  const activeDrafts = memberDrafts.filter((row: any) => row.status === "waiting" || row.status === "sent");
  const sentDrafts = activeDrafts.filter((row: any) => row.status === "sent");
  const lastGuideReplyAt =
    sentDrafts.length > 0
      ? await readLastMemberGuideReplyAt(ctx, {
          communityId: args.communityId,
          userId: args.userId,
          draftThreadIds: sentDrafts
            .map((check: any) => (typeof check.threadId === "string" ? check.threadId : ""))
            .filter(Boolean),
        })
      : null;
  let latestCoachSummary: { summary: string; at: number } | null = null;
  let unansweredCoachCount = 0;
  for (const check of activeDrafts) {
    const at = Number(check.sentAt ?? check.createdAt ?? 0);
    const replied =
      check.status === "sent" &&
      typeof lastGuideReplyAt === "number" &&
      at > 0 &&
      lastGuideReplyAt >= at;
    if (
      isUnansweredCoachTouchStale({
        status: check.status,
        reason: check.reason,
        sentAt: at,
        replied,
        nowMs: args.nowMs,
      })
    ) {
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
  const money = moneyFor({ membershipState: args.membership.state, subscription: args.subscription });
  const moneyKind = money?.kind === "on_hold" || money?.kind === "cancelling" ? money.kind : null;
  const statusOverride = (storedCard?.statusOverride ?? null) as JourneyCardStatus | null;
  const status = deriveMemberJourneyStatus({
    statusOverride,
    stageKey,
    stages: config.stages,
    moneyKind,
    lastActiveAtMs,
    joinedAtMs,
    unansweredCoachCount,
    nowMs: args.nowMs,
  });
  const storedOutcomeAt = typeof storedCard?.agentOutcomeAt === "number" ? storedCard.agentOutcomeAt : 0;
  const coachAt = latestCoachSummary?.at ?? 0;
  const agentOutcome =
    latestCoachSummary && coachAt >= storedOutcomeAt
      ? latestCoachSummary.summary
      : storedCard?.agentOutcomeNote
        ? String(storedCard.agentOutcomeNote)
        : latestCoachSummary?.summary ?? null;
  const hasSharedGoal = goalRows.some((fact: any) => fact.kind === "goal" && factVisibleToHost(fact));
  const evaluated = evaluateStageCheckpoints({
    checkpoints: stage.checkpoints,
    postsCount: participation.postsCount,
    lessonsDoneCount: participation.lessonsDoneCount,
    hasSharedGoal,
    completedMilestones: storedCard?.completedMilestones,
  });
  const checkpointsView = evaluated.map((cp) => ({
    key: cp.key,
    label: cp.label,
    kind: cp.kind,
    done: cp.done,
    auto: cp.auto,
    completed_at: iso(cp.completedAtMs),
  }));
  const checkpointsDone = checkpointsView.filter((cp) => cp.done).length;
  const lastStageKey = config.stages[config.stages.length - 1]?.key ?? null;
  const rawOutcomes = Array.isArray(storedCard?.outcomes) ? storedCard.outcomes : [];
  const outcomes = [...rawOutcomes]
    .sort((a: any, b: any) => Number(b.at ?? 0) - Number(a.at ?? 0))
    .slice(0, MAX_CARD_OUTCOMES)
    .map((item: any) => ({
      id: String(item.id),
      text: String(item.text),
      at: iso(item.at) ?? new Date(args.nowMs).toISOString(),
      source: (item.source ?? "founder") as JourneyMilestoneSource,
    }));
  return {
    stage_key: stageKey,
    stage_name: stage.name,
    status,
    status_is_manual: Boolean(statusOverride),
    checkpoints_done: checkpointsDone,
    checkpoints_total: checkpointsView.length,
    ready_to_advance:
      checkpointsView.length > 0 &&
      checkpointsDone >= checkpointsView.length &&
      stageKey !== lastStageKey,
    checkpoints: checkpointsView,
    founder_instruction: normalizeFounderInstruction(storedCard?.founderInstruction),
    agent_outcome: agentOutcome,
    outcomes,
  };
}

// Silent coaching focus for the hosted community AI in a member's own private
// talk (member_private ONLY). Re-verifies active non-owner unblocked membership;
// never exposed to MCP (member_own_ai) or public channel mentions.
export const readMemberGuideCoachingContextInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<string | null> => {
    const community: any = await ctx.db.get(args.communityId);
    if (!community || String(community.ownerId) === String(args.userId)) return null;
    const [membership, block] = await Promise.all([
      getUniqueCommunityMembershipByPair({ ctx, communityId: args.communityId, userId: args.userId }),
      getActiveCommunityBlock({ ctx, communityId: args.communityId, userId: args.userId }),
    ]);
    if (!membership || !communityMembershipRowIsActive(membership) || block) return null;
    const nowMs = Date.now();
    const [summary, storedCard] = await Promise.all([
      readMemberOwnJourneySummary(ctx, {
        communityId: args.communityId,
        userId: args.userId,
        membership,
        nowMs,
      }),
      ctx.db
        .query("communityMemberJourneyCards")
        .withIndex("by_community_user", (q: any) =>
          q.eq("communityId", args.communityId).eq("userId", args.userId),
        )
        .unique(),
    ]);
    return renderMemberGuideCoachingContext({
      stageGoal: summary?.stage_goal ?? null,
      checkpointsDone: summary?.checkpoints_done ?? [],
      checkpointsRemaining: summary?.checkpoints_remaining ?? [],
      recentWins: summary?.recent_wins ?? [],
      founderInstruction: normalizeFounderInstruction(storedCard?.founderInstruction),
    });
  },
});

function resolveStageSelector(
  stages: readonly JourneyStageDefinition[],
  selector: string,
): JourneyStageDefinition | null {
  const cleaned = String(selector ?? "").trim();
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  const byKey = stages.find((stage) => stage.key.toLowerCase() === lower);
  if (byKey) return byKey;
  const byName = stages.find((stage) => stage.name.trim().toLowerCase() === lower);
  if (byName) return byName;
  const slugged = slugifyJourneyStageKey(cleaned, 0);
  return stages.find((stage) => stage.key === slugged) ?? null;
}

// Used by askPersonFirst in convex/polynetCanonicalExecutor.ts to build an
// accurate Yes/No confirmation card before removing a Member Board stage.
export const describeJourneyStageRemovalInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    stage: v.string(),
    moveToStage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const { stages } = await readStagesForCommunity(ctx, args.communityId);
    const target = resolveStageSelector(stages, args.stage);
    if (!target) return { ok: false as const, code: "journey_stage_not_found" as const };
    if (stages.length <= MIN_JOURNEY_STAGES) {
      return { ok: false as const, code: "journey_stages_count_invalid" as const };
    }
    const remaining = stages.filter((entry) => entry.key !== target.key);
    let fallback = remaining[0]!;
    if (args.moveToStage !== undefined && args.moveToStage.trim()) {
      const requestedFallback = resolveStageSelector(remaining, args.moveToStage);
      if (!requestedFallback) {
        return { ok: false as const, code: "journey_fallback_stage_not_found" as const };
      }
      fallback = requestedFallback;
    }
    const board = await computeCommunityMemberJourneyBoard(ctx, {
      communityId: args.communityId,
      community,
      nowMs: Date.now(),
    });
    const memberCount = board.cards.filter((card) => card.stage_key === target.key).length;
    return {
      ok: true as const,
      stageKey: target.key,
      stageName: target.name,
      fallbackStageKey: fallback.key,
      fallbackStageName: fallback.name,
      memberCount,
    };
  },
});

async function resolveAutoAdvanceStageMove(
  ctx: any,
  args: {
    communityId: any;
    targetUserId: any;
    stages: readonly JourneyStageDefinition[];
    currentStageKey: string;
    dismissedAdvanceForStageKey?: string | null;
    completedMilestones?: ReadonlyArray<{ key: string; completedAt: number }> | null;
  },
): Promise<{ nextStageKey: string; outcomeNote: string } | null> {
  const stageIndex = args.stages.findIndex((stage) => stage.key === args.currentStageKey);
  if (stageIndex < 0 || stageIndex >= args.stages.length - 1) return null;
  if (args.dismissedAdvanceForStageKey === args.currentStageKey) return null;
  const currentStage = args.stages[stageIndex]!;
  if (currentStage.checkpoints.length === 0) return null;
  const [participation, goalRows] = await Promise.all([
    readMemberParticipationSignals(ctx, args.communityId, args.targetUserId),
    ctx.db
      .query("memberFacts")
      .withIndex("by_user_community", (q: any) =>
        q.eq("userId", args.targetUserId).eq("communityId", args.communityId),
      )
      .filter((q: any) => q.eq(q.field("kind"), "goal"))
      .take(10),
  ]);
  const hasSharedGoal = goalRows.some((fact: any) => fact.kind === "goal" && factVisibleToHost(fact));
  const evaluated = evaluateStageCheckpoints({
    checkpoints: currentStage.checkpoints,
    postsCount: participation.postsCount,
    lessonsDoneCount: participation.lessonsDoneCount,
    hasSharedGoal,
    completedMilestones: args.completedMilestones,
  });
  if (evaluated.length === 0 || !evaluated.every((cp) => cp.done)) return null;
  const nextStage = args.stages[stageIndex + 1]!;
  return {
    nextStageKey: nextStage.key,
    outcomeNote: `Auto-moved to ${nextStage.name} after finishing ${currentStage.name} checkpoints`.slice(
      0,
      MAX_AGENT_OUTCOME_CHARS,
    ),
  };
}

async function applyCardPatchForMember(
  ctx: any,
  args: {
    actorUserId: any;
    communityId: any;
    community: any;
    stages: JourneyStageDefinition[];
    autoAdvanceEnabled?: boolean;
    targetUserId: any;
    nowMs: number;
    source: JourneyMilestoneSource;
    stageKey?: string;
    statusOverride?: JourneyCardStatus | "auto";
    founderInstruction?: string;
    toggleMilestone?: { key: string; label?: string; completed: boolean };
    addOutcomeText?: string;
    removeOutcomeId?: string;
  },
) {
  if (String(args.targetUserId) === String(args.community.ownerId)) {
    throw new Error("community_owner_not_on_board");
  }
  const membership = await getUniqueCommunityMembershipByPair({
    ctx,
    communityId: args.communityId,
    userId: args.targetUserId,
  });
  if (!membership || !communityMembershipRowIsActive(membership)) {
    throw new Error("community_member_not_found");
  }
  const validKeys = new Set(args.stages.map((stage) => stage.key));
  if (args.stageKey !== undefined && !validKeys.has(args.stageKey)) {
    throw new Error("journey_stage_not_found");
  }
  const existing = await ctx.db
    .query("communityMemberJourneyCards")
    .withIndex("by_community_user", (q: any) =>
      q.eq("communityId", args.communityId).eq("userId", args.targetUserId),
    )
    .unique();

  const prevStageKey =
    existing && validKeys.has(existing.stageKey)
      ? existing.stageKey
      : await resolveDerivedStageKeyForMember(ctx, {
          communityId: args.communityId,
          userId: args.targetUserId,
          stages: args.stages,
          membership,
          nowMs: args.nowMs,
        });
  const nextStageKey = args.stageKey ?? prevStageKey;
  const nextDismissedAdvanceForStageKey = resolveDismissedAdvanceOnStageChange({
    stages: args.stages,
    previousStageKey: prevStageKey,
    nextStageKey,
    stageWasExplicitlyChanged: args.stageKey !== undefined && args.stageKey !== prevStageKey,
    existingDismissed: existing?.dismissedAdvanceForStageKey,
  });
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

  let nextCompletedMilestones = Array.isArray(existing?.completedMilestones)
    ? [...existing.completedMilestones]
    : undefined;
  let milestoneKeyApplied: string | null = null;
  if (args.toggleMilestone) {
    const milestoneKey = slugifyJourneyStageKey(args.toggleMilestone.key, 0);
    milestoneKeyApplied = milestoneKey;
    const current = nextCompletedMilestones ?? [];
    const without = current.filter((row: any) => String(row.key) !== milestoneKey);
    if (args.toggleMilestone.completed) {
      const cleanLabel = args.toggleMilestone.label
        ? String(args.toggleMilestone.label).replace(/\s+/g, " ").trim().slice(0, MAX_CHECKPOINT_LABEL_CHARS)
        : undefined;
      without.push({
        key: milestoneKey,
        ...(cleanLabel ? { label: cleanLabel } : {}),
        completedAt: args.nowMs,
        source: args.source,
      });
    }
    const configuredKeys = new Set(args.stages.flatMap((stage) => stage.checkpoints.map((cp) => cp.key)));
    const maxStoredMilestones = Math.max(64, MAX_JOURNEY_STAGES * MAX_STAGE_CHECKPOINTS);
    if (without.length > maxStoredMilestones) {
      const active = without.filter((row: any) => configuredKeys.has(String(row.key)));
      const historical = without.filter((row: any) => !configuredKeys.has(String(row.key)));
      const remainingSlots = Math.max(0, maxStoredMilestones - active.length);
      nextCompletedMilestones = [...historical.slice(-remainingSlots), ...active];
    } else {
      nextCompletedMilestones = without;
    }
  }

  let nextOutcomes = Array.isArray(existing?.outcomes) ? [...existing.outcomes] : undefined;
  let addedOutcome: { id: string; text: string; at: string; source: JourneyMilestoneSource } | null = null;
  let removedOutcomeId: string | null = null;
  if (args.removeOutcomeId) {
    const beforeLen = (nextOutcomes ?? []).length;
    nextOutcomes = (nextOutcomes ?? []).filter(
      (item: any) => String(item.id) !== String(args.removeOutcomeId),
    );
    if (nextOutcomes.length === beforeLen) {
      throw new Error("journey_outcome_not_found");
    }
    removedOutcomeId = String(args.removeOutcomeId);
  }
  if (args.addOutcomeText !== undefined) {
    const text = normalizeOutcomeText(args.addOutcomeText);
    if (!text) throw new Error("journey_outcome_text_required");
    const existingDuplicate =
      args.source === "app"
        ? (nextOutcomes ?? []).find(
            (item: any) =>
              item?.source === "app" &&
              String(item?.text ?? "").trim().toLowerCase() === text.toLowerCase(),
          )
        : null;
    if (existingDuplicate) {
      addedOutcome = {
        id: String(existingDuplicate.id),
        text: String(existingDuplicate.text),
        at: iso(existingDuplicate.at) ?? new Date(args.nowMs).toISOString(),
        source: "app",
      };
    } else {
      const id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `out_${args.nowMs}_${Math.random().toString(36).slice(2, 8)}`;
      nextOutcomes = [
        { id, text, at: args.nowMs, source: args.source },
        ...(nextOutcomes ?? []),
      ].slice(0, MAX_CARD_OUTCOMES);
      addedOutcome = { id, text, at: new Date(args.nowMs).toISOString(), source: args.source };
    }
  }

  let finalStageKey = nextStageKey;
  let finalDismissedAdvanceForStageKey = nextDismissedAdvanceForStageKey;
  let autoAdvanceOutcomeNote: string | undefined;
  if (args.autoAdvanceEnabled && args.stageKey === undefined && args.toggleMilestone?.completed) {
    const autoMove = await resolveAutoAdvanceStageMove(ctx, {
      communityId: args.communityId,
      targetUserId: args.targetUserId,
      stages: args.stages,
      currentStageKey: finalStageKey,
      dismissedAdvanceForStageKey: finalDismissedAdvanceForStageKey,
      completedMilestones: nextCompletedMilestones,
    });
    if (autoMove) {
      finalStageKey = autoMove.nextStageKey;
      finalDismissedAdvanceForStageKey = undefined;
      autoAdvanceOutcomeNote = autoMove.outcomeNote;
    }
  }

  if (existing) {
    await ctx.db.patch(existing._id, {
      stageKey: finalStageKey,
      statusOverride: nextStatusOverride,
      dismissedAdvanceForStageKey: finalDismissedAdvanceForStageKey,
      ...(autoAdvanceOutcomeNote
        ? { agentOutcomeNote: autoAdvanceOutcomeNote, agentOutcomeAt: args.nowMs }
        : {}),
      ...(hasInstructionUpdate
        ? {
            founderInstruction: nextInstruction ?? undefined,
            founderInstructionUpdatedAt: nextInstruction ? args.nowMs : undefined,
          }
        : {}),
      ...(args.toggleMilestone ? { completedMilestones: nextCompletedMilestones } : {}),
      ...(args.addOutcomeText !== undefined || args.removeOutcomeId
        ? { outcomes: nextOutcomes }
        : {}),
      updatedByUserId: args.actorUserId,
      updatedAt: args.nowMs,
    });
  } else {
    await ctx.db.insert("communityMemberJourneyCards", {
      communityId: args.communityId,
      userId: args.targetUserId,
      stageKey: finalStageKey,
      ...(finalDismissedAdvanceForStageKey
        ? { dismissedAdvanceForStageKey: finalDismissedAdvanceForStageKey }
        : {}),
      ...(autoAdvanceOutcomeNote
        ? { agentOutcomeNote: autoAdvanceOutcomeNote, agentOutcomeAt: args.nowMs }
        : {}),
      ...(nextStatusOverride ? { statusOverride: nextStatusOverride } : {}),
      ...(nextInstruction
        ? { founderInstruction: nextInstruction, founderInstructionUpdatedAt: args.nowMs }
        : {}),
      ...(nextCompletedMilestones?.length ? { completedMilestones: nextCompletedMilestones } : {}),
      ...(nextOutcomes?.length ? { outcomes: nextOutcomes } : {}),
      updatedByUserId: args.actorUserId,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
  }

  const stageObj = args.stages.find((entry) => entry.key === finalStageKey) ?? null;
  return {
    stage_key: finalStageKey,
    stage_name: stageObj?.name ?? finalStageKey,
    status_override: nextStatusOverride ?? null,
    founder_instruction: nextInstruction,
    ...(milestoneKeyApplied ? { milestone_key: milestoneKeyApplied, done: Boolean(args.toggleMilestone?.completed) } : {}),
    ...(addedOutcome ? { outcome: addedOutcome } : {}),
    ...(removedOutcomeId ? { removed_outcome_id: removedOutcomeId } : {}),
  };
}

// Connected apps (POST /apps/v1/milestones): report a verified member's
// product milestone or win directly onto their Member Board card so onboarding
// and Chief of Staff check-ins reflect real software progress.
export const recordConnectedAppMilestoneInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    email: v.string(),
    milestone: v.optional(v.string()),
    label: v.optional(v.string()),
    done: v.optional(v.boolean()),
    outcome: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const community: any = await ctx.db.get(args.communityId);
    if (!community || !communityIsActive(community)) return { recorded: false as const };
    const email = args.email.trim().toLowerCase();
    const userId = email ? await verifiedUserIdForEmail(ctx, email) : null;
    if (!userId || String(userId) === String(community.ownerId)) {
      return { recorded: false as const };
    }
    const [membership, block] = await Promise.all([
      getUniqueCommunityMembershipByPair({ ctx, communityId: args.communityId, userId }),
      getActiveCommunityBlock({ ctx, communityId: args.communityId, userId }),
    ]);
    if (!membership || !communityMembershipRowIsActive(membership) || block) {
      return { recorded: false as const };
    }

    const { stages, autoAdvanceEnabled } = await readStagesForCommunity(ctx, args.communityId);
    const rawMilestone = typeof args.milestone === "string" ? args.milestone.trim() : "";
    const rawOutcome = typeof args.outcome === "string" ? normalizeOutcomeText(args.outcome) : null;
    if (!rawMilestone && !rawOutcome) return { recorded: false as const };

    let toggleMilestone: { key: string; label?: string; completed: boolean } | undefined;
    let implicitOutcomeText: string | null = null;
    if (rawMilestone) {
      const lower = rawMilestone.toLowerCase();
      const configured = stages
        .flatMap((stage) => stage.checkpoints)
        .find((cp) => cp.key.toLowerCase() === lower || cp.label.trim().toLowerCase() === lower);
      const key = configured ? configured.key : slugifyJourneyStageKey(rawMilestone, 0);
      const label =
        typeof args.label === "string" && args.label.trim()
          ? args.label.trim().slice(0, MAX_CHECKPOINT_LABEL_CHARS)
          : configured?.label ?? rawMilestone.slice(0, MAX_CHECKPOINT_LABEL_CHARS);
      const completed = args.done !== false;
      toggleMilestone = { key, label, completed };
      // If a connected app reports a custom milestone key not yet configured
      // on a stage (e.g. "first_win"), also surface it as an idempotent app win
      // when no explicit outcome was sent so it never disappears silently.
      if (!configured && completed && !rawOutcome) {
        implicitOutcomeText = normalizeOutcomeText(label);
      }
    }

    const effectiveOutcome = rawOutcome ?? implicitOutcomeText;
    const updated = await applyCardPatchForMember(ctx, {
      actorUserId: community.ownerId,
      communityId: args.communityId,
      community,
      stages,
      autoAdvanceEnabled,
      targetUserId: userId,
      nowMs: Date.now(),
      source: "app",
      ...(toggleMilestone ? { toggleMilestone } : {}),
      ...(effectiveOutcome ? { addOutcomeText: effectiveOutcome } : {}),
    });

    return {
      recorded: true as const,
      stage_key: updated.stage_key,
      stage_name: updated.stage_name,
      ...(updated.milestone_key ? { milestone_key: updated.milestone_key, done: updated.done } : {}),
      ...(updated.outcome ? { outcome: updated.outcome.text } : {}),
    };
  },
});

// Builder-only Member Board actions invoked via Official Polynet MCP or Studio
// Guide chat through convex/communityOperations.ts (atomic with receipt).
export const applyJourneyOperationForTrustedManagerInternal = internalMutation({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    operation: v.string(),
    input: v.any(),
    source: v.union(v.literal("mcp"), v.literal("agent")),
  },
  handler: async (ctx, args) => {
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const input = (args.input && typeof args.input === "object" ? args.input : {}) as Record<string, unknown>;
    const nowMs = Date.now();
    const { stages, autoAdvanceEnabled } = await readStagesForCommunity(ctx, args.communityId);

    const parseUserRef = (raw: unknown): any | null => {
      const match = typeof raw === "string" ? /^user:([A-Za-z0-9]+)$/.exec(raw.trim()) : null;
      return match ? ctx.db.normalizeId("users", match[1]) : null;
    };

    if (args.operation === "community.journey.move_stage" || args.operation === "community.journey.set_status") {
      const rawMembers = Array.isArray(input.members) ? input.members : [];
      if (rawMembers.length === 0 || rawMembers.length > 50) {
        throw new Error("journey_members_invalid");
      }
      let targetStage: JourneyStageDefinition | null = null;
      let statusOverride: JourneyCardStatus | "auto" | undefined = undefined;
      if (args.operation === "community.journey.move_stage") {
        targetStage = resolveStageSelector(stages, String(input.stage ?? ""));
        if (!targetStage) throw new Error("journey_stage_not_found");
      } else {
        const rawStatus = String(input.status ?? "");
        if (rawStatus !== "auto" && !(JOURNEY_CARD_STATUSES as readonly string[]).includes(rawStatus)) {
          throw new Error("journey_status_invalid");
        }
        statusOverride = rawStatus as JourneyCardStatus | "auto";
      }
      const results: Array<Record<string, unknown>> = [];
      let succeeded = 0;
      let failed = 0;
      for (const rawRef of rawMembers) {
        const ref = String(rawRef);
        const targetUserId = parseUserRef(rawRef);
        if (!targetUserId) {
          failed += 1;
          results.push({ member: ref, ok: false, code: "member_not_found", message: "They aren't an active member of this community." });
          continue;
        }
        try {
          const updated = await applyCardPatchForMember(ctx, {
            actorUserId: args.userId,
            communityId: args.communityId,
            community,
            stages,
            targetUserId,
            nowMs,
            source: args.source,
            ...(targetStage ? { stageKey: targetStage.key } : {}),
            ...(statusOverride !== undefined ? { statusOverride } : {}),
          });
          succeeded += 1;
          results.push({ member: ref, ok: true, ...updated });
        } catch (error) {
          failed += 1;
          const raw = error instanceof Error ? error.message : "";
          const code = raw.includes("community_owner_not_on_board") ? "owner_not_on_board" : "member_not_found";
          const message =
            code === "owner_not_on_board"
              ? "The community owner doesn't sit on the Member Board."
              : "They aren't an active member of this community.";
          results.push({ member: ref, ok: false, code, message });
        }
      }
      return { results, succeeded, failed };
    }

    if (
      args.operation === "community.journey.set_milestone" ||
      args.operation === "community.journey.record_win" ||
      args.operation === "community.journey.set_guide_note"
    ) {
      const targetUserId = parseUserRef(input.member);
      if (!targetUserId) throw new Error("community_member_not_found");
      if (args.operation === "community.journey.set_milestone") {
        const rawMilestone = String(input.milestone ?? "").trim();
        if (!rawMilestone) throw new Error("journey_milestone_required");
        const lower = rawMilestone.toLowerCase();
        const configured = stages
          .flatMap((stage) => stage.checkpoints)
          .find((cp) => cp.key.toLowerCase() === lower || cp.label.trim().toLowerCase() === lower);
        const key = configured ? configured.key : slugifyJourneyStageKey(rawMilestone, 0);
        const label =
          typeof input.label === "string" && input.label.trim()
            ? input.label.trim()
            : configured?.label ?? rawMilestone;
        const completed = input.done !== false;
        const updated = await applyCardPatchForMember(ctx, {
          actorUserId: args.userId,
          communityId: args.communityId,
          community,
          stages,
          autoAdvanceEnabled,
          targetUserId,
          nowMs,
          source: args.source,
          toggleMilestone: { key, label, completed },
        });
        return { member: String(input.member), ...updated };
      }
      if (args.operation === "community.journey.record_win") {
        const hasText = typeof input.text === "string" && input.text.trim().length > 0;
        const hasRemove = typeof input.remove_outcome_id === "string" && input.remove_outcome_id.trim().length > 0;
        if (hasText === hasRemove) throw new Error("journey_outcome_input_invalid");
        const updated = await applyCardPatchForMember(ctx, {
          actorUserId: args.userId,
          communityId: args.communityId,
          community,
          stages,
          targetUserId,
          nowMs,
          source: args.source,
          ...(hasText ? { addOutcomeText: String(input.text) } : {}),
          ...(hasRemove ? { removeOutcomeId: String(input.remove_outcome_id).trim() } : {}),
        });
        return { member: String(input.member), ...updated };
      }
      const note = typeof input.note === "string" ? input.note : "";
      const updated = await applyCardPatchForMember(ctx, {
        actorUserId: args.userId,
        communityId: args.communityId,
        community,
        stages,
        targetUserId,
        nowMs,
        source: args.source,
        founderInstruction: note,
      });
      return { member: String(input.member), ...updated };
    }

    if (args.operation === "community.journey.save_stages") {
      const normalized = normalizeJourneyStages((Array.isArray(input.stages) ? input.stages : []) as any);
      if (!normalized.ok) throw new Error(normalized.code);
      const nextKeys = new Set(normalized.stages.map((stage) => stage.key));
      const dropped = stages.filter((stage) => !nextKeys.has(stage.key));
      if (dropped.length > 0) {
        throw new Error(`journey_stage_removal_requires_tool:${dropped.map((s) => s.name).join(", ")}`);
      }
      const existing = await ctx.db
        .query("communityJourneyConfig")
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          stages: normalized.stages,
          autoAdvanceEnabled,
          updatedByUserId: args.userId,
          updatedAt: nowMs,
        });
      } else {
        await ctx.db.insert("communityJourneyConfig", {
          communityId: args.communityId,
          stages: normalized.stages,
          autoAdvanceEnabled,
          updatedByUserId: args.userId,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
      }
      return { stages: normalized.stages };
    }

    if (args.operation === "community.journey.remove_stage") {
      const target = resolveStageSelector(stages, String(input.stage ?? ""));
      if (!target) throw new Error("journey_stage_not_found");
      if (stages.length <= MIN_JOURNEY_STAGES) throw new Error("journey_stages_count_invalid");
      const remaining = stages
        .filter((entry) => entry.key !== target.key)
        .map((entry, position) => ({ ...entry, position }));
      let fallback = remaining[0]!;
      if (typeof input.move_to_stage === "string" && input.move_to_stage.trim()) {
        const requested = resolveStageSelector(remaining, input.move_to_stage);
        if (!requested) throw new Error("journey_fallback_stage_not_found");
        fallback = requested;
      }
      const boardBefore = await computeCommunityMemberJourneyBoard(ctx, {
        communityId: args.communityId,
        community,
        nowMs,
      });
      const activeUsersOnRemovedStage = boardBefore.cards
        .filter((card) => card.stage_key === target.key)
        .map((card) => card.db_user_id);

      const existing = await ctx.db
        .query("communityJourneyConfig")
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          stages: remaining,
          autoAdvanceEnabled,
          updatedByUserId: args.userId,
          updatedAt: nowMs,
        });
      } else {
        await ctx.db.insert("communityJourneyConfig", {
          communityId: args.communityId,
          stages: remaining,
          autoAdvanceEnabled,
          updatedByUserId: args.userId,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
      }
      const storedCards = await ctx.db
        .query("communityMemberJourneyCards")
        .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId))
        .take(500);
      const patchedUserIds = new Set<string>();
      let movedCardsCount = 0;
      for (const card of storedCards) {
        if (card.stageKey === target.key) {
          await ctx.db.patch(card._id, {
            stageKey: fallback.key,
            updatedByUserId: args.userId,
            updatedAt: nowMs,
          });
          patchedUserIds.add(String(card.userId));
          movedCardsCount += 1;
        }
      }
      // Also move active members who sat on the removed stage via derived placement
      // (no stored card yet) so the confirmation card's move_to_stage promise holds 100%.
      for (const userIdStr of activeUsersOnRemovedStage) {
        if (patchedUserIds.has(userIdStr)) continue;
        const normalizedUserId = ctx.db.normalizeId("users", userIdStr);
        if (!normalizedUserId) continue;
        await ctx.db.insert("communityMemberJourneyCards", {
          communityId: args.communityId,
          userId: normalizedUserId,
          stageKey: fallback.key,
          updatedByUserId: args.userId,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
        movedCardsCount += 1;
      }
      return {
        removed_stage_key: target.key,
        removed_stage_name: target.name,
        moved_to_stage_key: fallback.key,
        moved_to_stage_name: fallback.name,
        moved_cards_count: movedCardsCount,
        stages: remaining,
      };
    }

    if (args.operation === "community.journey.decide_stage_move") {
      const [agentOn, proactiveTier] = await Promise.all([
        communityAgentIsOn(ctx, args.communityId),
        communityHasProactiveAgentTier(ctx, args.communityId, nowMs),
      ]);
      if (!agentOn || !proactiveTier) {
        throw new Error("chief_of_staff_plan_required");
      }
      const memberRef = typeof input.member === "string" ? input.member : "";
      const decision = input.decision === "approve" || input.decision === "dismiss" ? input.decision : null;
      if (!decision) throw new Error("invalid_tool_args");
      const targetUserId = parseUserRef(memberRef);
      if (!targetUserId) throw new Error("community_member_not_found");
      if (String(targetUserId) === String(community.ownerId)) {
        throw new Error("community_owner_not_on_board");
      }
      const membership: any = await getUniqueCommunityMembershipByPair({
        ctx,
        communityId: args.communityId,
        userId: targetUserId,
      });
      if (!membership || !communityMembershipRowIsActive(membership)) {
        throw new Error("community_member_not_found");
      }
      const validKeys = new Set(stages.map((stage) => stage.key));
      const existing = await ctx.db
        .query("communityMemberJourneyCards")
        .withIndex("by_community_user", (q: any) =>
          q.eq("communityId", args.communityId).eq("userId", targetUserId),
        )
        .unique();
      const currentStageKey =
        existing && validKeys.has(existing.stageKey)
          ? String(existing.stageKey)
          : await resolveDerivedStageKeyForMember(ctx, {
              communityId: args.communityId,
              userId: targetUserId,
              stages,
              membership,
              nowMs,
            });
      const expectedFrom =
        typeof input.expected_from_stage === "string" && input.expected_from_stage.trim()
          ? resolveStageSelector(stages, input.expected_from_stage.trim())?.key ?? input.expected_from_stage.trim()
          : null;
      if (expectedFrom && currentStageKey !== expectedFrom) {
        return { member: memberRef, decision, status: "already_moved" as const, stage_key: currentStageKey };
      }

      if (decision === "dismiss") {
        if (existing) {
          await ctx.db.patch(existing._id, {
            stageKey: currentStageKey,
            dismissedAdvanceForStageKey: currentStageKey,
            updatedByUserId: args.userId,
            updatedAt: nowMs,
          });
        } else {
          await ctx.db.insert("communityMemberJourneyCards", {
            communityId: args.communityId,
            userId: targetUserId,
            stageKey: currentStageKey,
            dismissedAdvanceForStageKey: currentStageKey,
            updatedByUserId: args.userId,
            createdAt: nowMs,
            updatedAt: nowMs,
          });
        }
        return {
          member: memberRef,
          decision: "dismiss" as const,
          status: "dismissed" as const,
          stage_key: currentStageKey,
        };
      }

      // Approve: re-evaluate live checkpoint completion and next-stage eligibility.
      const liveBoard = await computeCommunityMemberJourneyBoard(ctx, {
        communityId: args.communityId,
        community,
        nowMs,
      });
      const liveProposal = extractStageAdvanceProposalsFromBoard(
        liveBoard,
        Math.max(liveBoard.cards.length, 1),
      ).find(
        (proposal) =>
          proposal.membership_id === String(membership._id) &&
          proposal.from_stage_key === currentStageKey,
      );
      const requestedTarget =
        typeof input.target_stage === "string" && input.target_stage.trim()
          ? resolveStageSelector(stages, input.target_stage.trim())?.key ?? input.target_stage.trim()
          : null;
      if (!liveProposal || (requestedTarget && liveProposal.to_stage_key !== requestedTarget)) {
        return {
          member: memberRef,
          decision: "approve" as const,
          status: "no_longer_ready" as const,
          stage_key: currentStageKey,
        };
      }
      const outcomeNote = `Moved to ${liveProposal.to_stage_name} after finishing ${liveProposal.from_stage_name} checkpoints`.slice(
        0,
        MAX_AGENT_OUTCOME_CHARS,
      );
      if (existing) {
        await ctx.db.patch(existing._id, {
          stageKey: liveProposal.to_stage_key,
          dismissedAdvanceForStageKey: undefined,
          agentOutcomeNote: outcomeNote,
          agentOutcomeAt: nowMs,
          updatedByUserId: args.userId,
          updatedAt: nowMs,
        });
      } else {
        await ctx.db.insert("communityMemberJourneyCards", {
          communityId: args.communityId,
          userId: targetUserId,
          stageKey: liveProposal.to_stage_key,
          agentOutcomeNote: outcomeNote,
          agentOutcomeAt: nowMs,
          updatedByUserId: args.userId,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
      }
      return {
        member: memberRef,
        decision: "approve" as const,
        status: "moved" as const,
        from_stage_key: liveProposal.from_stage_key,
        stage_key: liveProposal.to_stage_key,
        stage_name: liveProposal.to_stage_name,
      };
    }

    throw new Error("operation_not_found");
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
        checkpoints: v.optional(
          v.array(
            v.object({
              key: v.optional(v.string()),
              label: v.string(),
              kind: v.union(
                v.literal("first_post"),
                v.literal("regular_posts"),
                v.literal("first_lesson"),
                v.literal("shared_goal"),
                v.literal("custom"),
              ),
            }),
          ),
        ),
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
    toggleMilestone: v.optional(
      v.object({
        key: v.string(),
        label: v.optional(v.string()),
        completed: v.boolean(),
      }),
    ),
    addOutcomeText: v.optional(v.string()),
    removeOutcomeId: v.optional(v.string()),
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

    const { stages, autoAdvanceEnabled } = await readStagesForCommunity(ctx, args.communityId);
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

    const prevStageKey =
      existing && validKeys.has(existing.stageKey)
        ? existing.stageKey
        : await resolveDerivedStageKeyForMember(ctx, {
            communityId: args.communityId,
            userId: membership.userId,
            stages,
            membership,
            nowMs,
          });
    const nextStageKey = args.stageKey ?? prevStageKey;
    const nextDismissedAdvanceForStageKey = resolveDismissedAdvanceOnStageChange({
      stages,
      previousStageKey: prevStageKey,
      nextStageKey,
      stageWasExplicitlyChanged: args.stageKey !== undefined && args.stageKey !== prevStageKey,
      existingDismissed: existing?.dismissedAdvanceForStageKey,
    });
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

    let nextCompletedMilestones = Array.isArray(existing?.completedMilestones)
      ? [...existing.completedMilestones]
      : undefined;
    if (args.toggleMilestone) {
      const milestoneKey = slugifyJourneyStageKey(args.toggleMilestone.key, 0);
      const current = nextCompletedMilestones ?? [];
      const without = current.filter((row: any) => String(row.key) !== milestoneKey);
      if (args.toggleMilestone.completed) {
        const cleanLabel = args.toggleMilestone.label
          ? String(args.toggleMilestone.label).replace(/\s+/g, " ").trim().slice(0, MAX_CHECKPOINT_LABEL_CHARS)
          : undefined;
        without.push({
          key: milestoneKey,
          ...(cleanLabel ? { label: cleanLabel } : {}),
          completedAt: nowMs,
          source: "founder" as const,
        });
      }
      const configuredKeys = new Set(stages.flatMap((stage) => stage.checkpoints.map((cp) => cp.key)));
      const maxStoredMilestones = Math.max(64, MAX_JOURNEY_STAGES * MAX_STAGE_CHECKPOINTS);
      if (without.length > maxStoredMilestones) {
        const active = without.filter((row: any) => configuredKeys.has(String(row.key)));
        const historical = without.filter((row: any) => !configuredKeys.has(String(row.key)));
        const remainingSlots = Math.max(0, maxStoredMilestones - active.length);
        nextCompletedMilestones = [...historical.slice(-remainingSlots), ...active];
      } else {
        nextCompletedMilestones = without;
      }
    }

    let nextOutcomes = Array.isArray(existing?.outcomes) ? [...existing.outcomes] : undefined;
    if (args.removeOutcomeId) {
      nextOutcomes = (nextOutcomes ?? []).filter(
        (item: any) => String(item.id) !== String(args.removeOutcomeId),
      );
    }
    if (args.addOutcomeText !== undefined) {
      const text = normalizeOutcomeText(args.addOutcomeText);
      if (text) {
        const id =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `out_${nowMs}_${Math.random().toString(36).slice(2, 8)}`;
        nextOutcomes = [
          { id, text, at: nowMs, source: "founder" as const },
          ...(nextOutcomes ?? []),
        ].slice(0, MAX_CARD_OUTCOMES);
      }
    }

    let finalStageKey = nextStageKey;
    let finalDismissedAdvanceForStageKey = nextDismissedAdvanceForStageKey;
    let autoAdvanceOutcomeNote: string | undefined;
    if (autoAdvanceEnabled && args.stageKey === undefined && args.toggleMilestone?.completed) {
      const autoMove = await resolveAutoAdvanceStageMove(ctx, {
        communityId: args.communityId,
        targetUserId: membership.userId,
        stages,
        currentStageKey: finalStageKey,
        dismissedAdvanceForStageKey: finalDismissedAdvanceForStageKey,
        completedMilestones: nextCompletedMilestones,
      });
      if (autoMove) {
        finalStageKey = autoMove.nextStageKey;
        finalDismissedAdvanceForStageKey = undefined;
        autoAdvanceOutcomeNote = autoMove.outcomeNote;
      }
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        stageKey: finalStageKey,
        statusOverride: nextStatusOverride,
        dismissedAdvanceForStageKey: finalDismissedAdvanceForStageKey,
        ...(autoAdvanceOutcomeNote
          ? { agentOutcomeNote: autoAdvanceOutcomeNote, agentOutcomeAt: nowMs }
          : {}),
        ...(hasInstructionUpdate
          ? {
              founderInstruction: nextInstruction ?? undefined,
              founderInstructionUpdatedAt: nextInstruction ? nowMs : undefined,
            }
          : {}),
        ...(args.toggleMilestone ? { completedMilestones: nextCompletedMilestones } : {}),
        ...(args.addOutcomeText !== undefined || args.removeOutcomeId
          ? { outcomes: nextOutcomes }
          : {}),
        updatedByUserId: actorUserId,
        updatedAt: nowMs,
      });
    } else {
      await ctx.db.insert("communityMemberJourneyCards", {
        communityId: args.communityId,
        userId: membership.userId,
        stageKey: finalStageKey,
        ...(finalDismissedAdvanceForStageKey
          ? { dismissedAdvanceForStageKey: finalDismissedAdvanceForStageKey }
          : {}),
        ...(autoAdvanceOutcomeNote
          ? { agentOutcomeNote: autoAdvanceOutcomeNote, agentOutcomeAt: nowMs }
          : {}),
        ...(nextStatusOverride ? { statusOverride: nextStatusOverride } : {}),
        ...(nextInstruction
          ? { founderInstruction: nextInstruction, founderInstructionUpdatedAt: nowMs }
          : {}),
        ...(nextCompletedMilestones?.length ? { completedMilestones: nextCompletedMilestones } : {}),
        ...(nextOutcomes?.length ? { outcomes: nextOutcomes } : {}),
        updatedByUserId: actorUserId,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }

    return {
      stage_key: finalStageKey,
      status_override: nextStatusOverride ?? null,
      founder_instruction: nextInstruction,
    };
  },
});

function resolveDismissedAdvanceOnStageChange(args: {
  stages: readonly JourneyStageDefinition[];
  previousStageKey: string;
  nextStageKey: string;
  stageWasExplicitlyChanged: boolean;
  existingDismissed?: string | null;
}): string | undefined {
  if (!args.stageWasExplicitlyChanged) {
    return args.existingDismissed ? String(args.existingDismissed) : undefined;
  }
  const prevIndex = args.stages.findIndex((stage) => stage.key === args.previousStageKey);
  const nextIndex = args.stages.findIndex((stage) => stage.key === args.nextStageKey);
  // If a host manually moves a member backward, suppress immediate bounce-back
  // advancement proposals for the stage they moved them into. Moving forward
  // clears any earlier dismissal so future stage completions propose normally.
  if (prevIndex >= 0 && nextIndex >= 0 && nextIndex < prevIndex) {
    return args.nextStageKey;
  }
  return undefined;
}

export type JourneyStageAdvanceProposalView = {
  membership_id: string;
  member_name: string;
  member_handle: string | null;
  from_stage_key: string;
  from_stage_name: string;
  to_stage_key: string;
  to_stage_name: string;
  to_stage_goal: string;
  completed_labels: string[];
};

const STAGE_ADVANCE_PROPOSALS_LIMIT = 10;

function extractStageAdvanceProposalsFromBoard(
  board: Awaited<ReturnType<typeof computeCommunityMemberJourneyBoard>>,
  limit = STAGE_ADVANCE_PROPOSALS_LIMIT,
): JourneyStageAdvanceProposalView[] {
  const stageIndexByKey = new Map(board.stages.map((stage, index) => [stage.key, index]));
  const proposals: Array<{ sortAt: string; view: JourneyStageAdvanceProposalView }> = [];
  for (const card of board.cards) {
    if (card.checkpoints_total <= 0 || card.checkpoints_done < card.checkpoints_total) continue;
    const index = stageIndexByKey.get(card.stage_key);
    if (index === undefined || index >= board.stages.length - 1) continue;
    if (card.dismissed_advance_for_stage_key === card.stage_key) continue;
    const fromStage = board.stages[index]!;
    const toStage = board.stages[index + 1]!;
    proposals.push({
      sortAt: String(card.last_active_at ?? card.joined_at ?? ""),
      view: {
        membership_id: card.membership_id,
        member_name: card.name,
        member_handle: card.handle,
        from_stage_key: fromStage.key,
        from_stage_name: fromStage.name,
        to_stage_key: toStage.key,
        to_stage_name: toStage.name,
        to_stage_goal: toStage.goal,
        completed_labels: card.checkpoints.filter((cp) => cp.done).map((cp) => cp.label),
      },
    });
  }
  proposals.sort((a, b) => b.sortAt.localeCompare(a.sortAt));
  return proposals.slice(0, limit).map((item) => item.view);
}

export type FounderJourneyPulseSummary = {
  readyToAdvanceCount: number;
  readyToAdvanceNames: string[];
  needsAttentionCount: number;
  needsAttentionNames: string[];
  recentWins: Array<{ memberName: string; text: string }>;
};

// Privacy-safe Member Board highlights for the Daily Founder Brief and Chief of
// Staff signals: counts and names of ready-to-advance members, board cards
// stuck/needing attention, and wins logged in the brief window. NEVER reads or
// exposes members' private 1:1 conversations or founder coaching notes.
export async function readFounderJourneyPulse(
  ctx: any,
  args: { community: any; windowStartMs: number; nowMs: number },
): Promise<FounderJourneyPulseSummary> {
  const board = await computeCommunityMemberJourneyBoard(ctx, {
    communityId: args.community._id,
    community: args.community,
    nowMs: args.nowMs,
  });
  const proposals = extractStageAdvanceProposalsFromBoard(board, 50);
  const attentionCards = board.cards
    .filter((card) => card.status === "needs_you" || card.status === "stuck")
    .sort((a, b) => {
      const rank = (s: string) => (s === "needs_you" ? 0 : 1);
      return rank(a.status) - rank(b.status) || String(b.last_active_at ?? "").localeCompare(String(a.last_active_at ?? ""));
    });
  const recentWins: Array<{ atMs: number; memberName: string; text: string }> = [];
  for (const card of board.cards) {
    for (const outcome of card.outcomes) {
      const atMs = Date.parse(outcome.at);
      if (Number.isFinite(atMs) && atMs >= args.windowStartMs && atMs <= args.nowMs) {
        recentWins.push({
          atMs,
          memberName: card.name,
          text: String(outcome.text).slice(0, 120),
        });
      }
    }
  }
  recentWins.sort((a, b) => b.atMs - a.atMs);
  return {
    readyToAdvanceCount: proposals.length,
    readyToAdvanceNames: proposals
      .slice(0, 3)
      .map((p) => `${p.member_name} (${p.from_stage_name} → ${p.to_stage_name})`),
    needsAttentionCount: attentionCards.length,
    needsAttentionNames: attentionCards.slice(0, 3).map((c) => c.name),
    recentWins: recentWins.slice(0, 3).map(({ memberName, text }) => ({ memberName, text })),
  };
}

// Home "Your guide suggests" one-click stage-move proposals for owners/admins
// on the Chief of Staff ($100 proactive) tier with the community agent enabled.
export const listJourneyStageAdvanceProposals = query({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args): Promise<JourneyStageAdvanceProposalView[]> => {
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
    const [agentOn, proactiveTier] = await Promise.all([
      communityAgentIsOn(ctx, args.communityId),
      communityHasProactiveAgentTier(ctx, args.communityId, nowMs),
    ]);
    if (!agentOn || !proactiveTier) return [];
    const board = await computeCommunityMemberJourneyBoard(ctx, {
      communityId: args.communityId,
      community,
      nowMs,
    });
    return extractStageAdvanceProposalsFromBoard(board, STAGE_ADVANCE_PROPOSALS_LIMIT);
  },
});

export const approveJourneyStageAdvance = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    membershipId: v.id("communityMemberships"),
    expectedFromStageKey: v.string(),
    targetStageKey: v.string(),
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
    const targetStage = stages.find((stage) => stage.key === args.targetStageKey) ?? null;
    if (!targetStage) throw new Error("journey_stage_not_found");
    const fromStage = stages.find((stage) => stage.key === args.expectedFromStageKey) ?? null;
    const validKeys = new Set(stages.map((stage) => stage.key));
    const nowMs = Date.now();
    const existing = await ctx.db
      .query("communityMemberJourneyCards")
      .withIndex("by_community_user", (q: any) =>
        q.eq("communityId", args.communityId).eq("userId", membership.userId),
      )
      .unique();
    const currentStageKey =
      existing && validKeys.has(existing.stageKey)
        ? String(existing.stageKey)
        : await resolveDerivedStageKeyForMember(ctx, {
            communityId: args.communityId,
            userId: membership.userId,
            stages,
            membership,
            nowMs,
          });
    if (currentStageKey !== args.expectedFromStageKey) {
      return { status: "already_moved" as const, stage_key: currentStageKey };
    }
    // Re-evaluate live checkpoint completion and next-stage eligibility at
    // approval time so a stale Home tab cannot advance a member whose
    // milestones were unchecked or whose stage checkpoints changed.
    const liveBoard = await computeCommunityMemberJourneyBoard(ctx, {
      communityId: args.communityId,
      community,
      nowMs,
    });
    const liveProposal = extractStageAdvanceProposalsFromBoard(
      liveBoard,
      Math.max(liveBoard.cards.length, 1),
    ).find(
      (proposal) =>
        proposal.membership_id === String(args.membershipId) &&
        proposal.from_stage_key === args.expectedFromStageKey &&
        proposal.to_stage_key === targetStage.key,
    );
    if (!liveProposal) {
      return { status: "no_longer_ready" as const, stage_key: currentStageKey };
    }
    const outcomeNote = fromStage
      ? `Moved to ${targetStage.name} after finishing ${fromStage.name} checkpoints`
      : `Moved to ${targetStage.name}`;
    const trimmedNote = outcomeNote.slice(0, MAX_AGENT_OUTCOME_CHARS);
    if (existing) {
      await ctx.db.patch(existing._id, {
        stageKey: targetStage.key,
        dismissedAdvanceForStageKey: undefined,
        agentOutcomeNote: trimmedNote,
        agentOutcomeAt: nowMs,
        updatedByUserId: actorUserId,
        updatedAt: nowMs,
      });
    } else {
      await ctx.db.insert("communityMemberJourneyCards", {
        communityId: args.communityId,
        userId: membership.userId,
        stageKey: targetStage.key,
        agentOutcomeNote: trimmedNote,
        agentOutcomeAt: nowMs,
        updatedByUserId: actorUserId,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }
    return { status: "moved" as const, stage_key: targetStage.key };
  },
});

export const dismissJourneyStageAdvance = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    membershipId: v.id("communityMemberships"),
    expectedFromStageKey: v.string(),
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
    if (!validKeys.has(args.expectedFromStageKey)) {
      throw new Error("journey_stage_not_found");
    }
    const nowMs = Date.now();
    const existing = await ctx.db
      .query("communityMemberJourneyCards")
      .withIndex("by_community_user", (q: any) =>
        q.eq("communityId", args.communityId).eq("userId", membership.userId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        dismissedAdvanceForStageKey: args.expectedFromStageKey,
        updatedByUserId: actorUserId,
        updatedAt: nowMs,
      });
    } else {
      await ctx.db.insert("communityMemberJourneyCards", {
        communityId: args.communityId,
        userId: membership.userId,
        stageKey: args.expectedFromStageKey,
        dismissedAdvanceForStageKey: args.expectedFromStageKey,
        updatedByUserId: actorUserId,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }
    return { dismissed_for_stage_key: args.expectedFromStageKey };
  },
});
