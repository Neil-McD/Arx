// Builder's Own Proactive Heartbeat (docs/specs/proactive-community-agent-v0.md):
// Strictly private commitment follow-ups for community Owners and active Admins.
// Kept separate from the place-level Daily Founder Brief and from Member Coach
// drafts/win-back metrics so co-builders stay private and are never coached like students.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { communityAgentIsOn } from "./communityApps";
import {
  communityMembershipRowIsActive,
  getActiveCommunityBlock,
  getUniqueCommunityMembershipByPair,
  requireCommunityChatAccess,
} from "./communityCore";
import { communityTimeZone } from "./communityMemory";
import { resolveCommunityInferenceFundingForAction } from "./founderInferenceRuntime";
import { startFundedInferenceRun } from "./fundedInferenceGateway";
import { deliverAssistantMessageToMemberCommunityThread } from "./threads";
import { enqueueSingleEmailJob } from "./email";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { communityIsActive, normalizeCommunityLifecycle } from "../shared/communityLifecycle";
import { renderCommunityHandbook } from "../shared/communityHandbook";
import { DEFAULT_PERSONAL_SOUL_MD, cleanAgentSoulText } from "../shared/agentSoul";
import { renderPersonalMemory } from "../shared/personalMemory";
import {
  COMMITMENT_FOLLOWUP_MAX_AGE_MS,
  COMMITMENT_FOLLOWUP_MIN_AGE_MS,
  UNSEEN_COACH_EMAIL_GRACE_MS,
  UNSEEN_COACH_EMAIL_MAX_AGE_MS,
  classifyMemberHeartbeatTemperature,
  countConsecutiveUnansweredCoachTouches,
} from "../shared/agentHeartbeat";
import { parseMemberCoachJudgeResponse } from "../shared/communityMemberCoach";
import {
  BUILDER_HEARTBEAT_INSTRUCTIONS,
  BUILDER_HEARTBEAT_SCAN_INTERVAL_MS,
  evaluateBuilderHeartbeatGate,
  type BuilderHeartbeatHistoryRow,
} from "../shared/builderHeartbeat";
import type { BuilderHeartbeatPreferenceView } from "../shared/communityMemberCoachTypes";

const internalRefs = internal as any;
const DAY_MS = 24 * 60 * 60_000;
const CLAIM_LEASE_MS = 10 * 60_000;
const MAX_COMMUNITIES_PER_RUN = 20;
const COMMUNITY_CONCURRENCY = 4;
const MAX_ADMINS_PER_COMMUNITY = 20;
const JUDGE_MAX_OUTPUT_TOKENS = 400;
const HANDBOOK_EXCERPT_CHARS = 1_500;
const UNSEEN_EMAIL_BATCH_LIMIT = 50;

function daysBetween(olderMs: number, newerMs: number): number {
  return Math.max(1, Math.floor((newerMs - olderMs) / DAY_MS));
}

async function resolveActiveBuilder(
  ctx: any,
  community: any,
  userId: Id<"users">,
): Promise<{ ok: true; isOwner: boolean; joinedAt: number } | { ok: false; code: string }> {
  if (String(community.ownerId) === String(userId)) {
    return { ok: true, isOwner: true, joinedAt: Number(community.createdAt ?? 0) };
  }
  const [membership, block] = await Promise.all([
    getUniqueCommunityMembershipByPair({ ctx, communityId: community._id, userId }),
    getActiveCommunityBlock({ ctx, communityId: community._id, userId }),
  ]);
  if (!communityMembershipRowIsActive(membership) || membership?.role !== "admin") {
    return { ok: false, code: "not_builder" };
  }
  if (block) return { ok: false, code: "builder_blocked" };
  return {
    ok: true,
    isOwner: false,
    joinedAt: Number(membership.activatedAt ?? membership.createdAt ?? 0),
  };
}

async function readBuilderMutedState(
  ctx: any,
  communityId: Id<"communities">,
  userId: Id<"users">,
): Promise<{ muted: boolean; builderCoachMuted: boolean }> {
  const row = await ctx.db
    .query("communityMemberSettings")
    .withIndex("by_community_user", (q: any) =>
      q.eq("communityId", communityId).eq("userId", userId),
    )
    .first();
  return {
    muted: Boolean(row?.muted),
    builderCoachMuted: Boolean(row?.builderCoachMuted),
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

async function readLatestBuilderChannelActivityAt(
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

async function readLatestFounderBriefSentAt(
  ctx: any,
  communityId: Id<"communities">,
): Promise<number | null> {
  const latest = await ctx.db
    .query("communityFounderBriefs")
    .withIndex("by_community_status_windowEnd", (q: any) =>
      q.eq("communityId", communityId).eq("status", "sent"),
    )
    .order("desc")
    .first();
  if (!latest) return null;
  const ts = typeof latest.sentAt === "number" ? latest.sentAt : Number(latest.windowEndMs ?? 0);
  return ts > 0 ? ts : null;
}

async function readRecentBuilderHeartbeatHistory(
  ctx: any,
  communityId: Id<"communities">,
  builderUserId: Id<"users">,
): Promise<BuilderHeartbeatHistoryRow[]> {
  const rows = await ctx.db
    .query("communityBuilderHeartbeats")
    .withIndex("by_community_builder_createdAt", (q: any) =>
      q.eq("communityId", communityId).eq("builderUserId", builderUserId),
    )
    .order("desc")
    .take(25);
  return rows.map((row: any) => ({
    status: row.status,
    dedupeKey: String(row.dedupeKey ?? ""),
    createdAt: Number(row.createdAt ?? 0),
    ...(typeof row.sentAt === "number" ? { sentAt: row.sentAt } : {}),
  }));
}

// ---------- Scan scheduling & candidate selection ----------

export const listDueBuilderHeartbeatCommunitiesInternal = internalQuery({
  args: { nowMs: v.number() },
  handler: async (ctx, args) => {
    // Bound lower range at 1 so Convex skips legacy rows whose optional
    // builderNextScanAt is undefined (undefined sorts before numbers in indexes).
    const due = await ctx.db
      .query("communityMemberCoachSettings")
      .withIndex("by_builderNextScanAt", (q) =>
        q.gte("builderNextScanAt", 1).lte("builderNextScanAt", args.nowMs),
      )
      .take(MAX_COMMUNITIES_PER_RUN);
    return due.map((row) => ({ settingsId: row._id, communityId: row.communityId }));
  },
});

export const claimBuilderHeartbeatScanInternal = internalMutation({
  args: { settingsId: v.id("communityMemberCoachSettings"), nowMs: v.number() },
  handler: async (ctx, args) => {
    const settings = await ctx.db.get(args.settingsId);
    if (!settings) return null;
    if (typeof settings.builderLeaseUntil === "number" && settings.builderLeaseUntil > args.nowMs) {
      return null;
    }
    if (
      typeof settings.builderNextScanAt === "number" &&
      settings.builderNextScanAt > args.nowMs + 60_000
    ) {
      return null;
    }
    const community = await ctx.db.get(settings.communityId);
    if (!community || !communityIsActive(community) || !(await communityAgentIsOn(ctx, settings.communityId))) {
      await ctx.db.patch(settings._id, {
        builderNextScanAt: args.nowMs + BUILDER_HEARTBEAT_SCAN_INTERVAL_MS,
        builderLeaseUntil: undefined,
        updatedAt: args.nowMs,
      });
      return null;
    }
    await ctx.db.patch(settings._id, {
      builderLeaseUntil: args.nowMs + CLAIM_LEASE_MS,
      updatedAt: args.nowMs,
    });
    return {
      settingsId: settings._id,
      communityId: community._id,
      communityName: String(community.name ?? "this community"),
      communityOneLiner: String(community.oneLiner ?? "").trim() || null,
      ownerUserId: community.ownerId,
    };
  },
});

export const finishBuilderHeartbeatScanInternal = internalMutation({
  args: { settingsId: v.id("communityMemberCoachSettings"), nowMs: v.number() },
  handler: async (ctx, args) => {
    const settings = await ctx.db.get(args.settingsId);
    if (!settings) return;
    await ctx.db.patch(settings._id, {
      builderLeaseUntil: undefined,
      builderNextScanAt: args.nowMs + BUILDER_HEARTBEAT_SCAN_INTERVAL_MS,
      updatedAt: args.nowMs,
    });
  },
});

// Deterministic candidate selector for Builders (Owner + active Admins).
// Returns at most one eligible builder per scan, strictly reading ONLY that
// builder's own private Soul and Memory (zero cross-builder leakage).
export const readNextBuilderHeartbeatCandidateInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const community: any = await ctx.db.get(args.communityId);
    if (!community || !communityIsActive(community) || !(await communityAgentIsOn(ctx, args.communityId))) {
      return null;
    }
    const [tz, adminRows] = await Promise.all([
      communityTimeZone(ctx, args.communityId),
      ctx.db
        .query("communityMemberships")
        .withIndex("by_community_role_state", (q) =>
          q.eq("communityId", args.communityId).eq("role", "admin").eq("state", "active"),
        )
        .take(MAX_ADMINS_PER_COMMUNITY),
    ]);

    const builderTargets: Array<{ userId: Id<"users">; isOwner: boolean; joinedAt: number }> = [
      {
        userId: community.ownerId,
        isOwner: true,
        joinedAt: Number(community.createdAt ?? 0),
      },
    ];
    const seen = new Set<string>([String(community.ownerId)]);
    for (const row of adminRows) {
      if (!communityMembershipRowIsActive(row)) continue;
      const key = String(row.userId);
      if (seen.has(key)) continue;
      seen.add(key);
      builderTargets.push({
        userId: row.userId,
        isOwner: false,
        joinedAt: Number(row.activatedAt ?? row.createdAt ?? 0),
      });
    }

    type Candidate = {
      commitAt: number;
      builderUserId: Id<"users">;
      isOwner: boolean;
      dedupeKey: string;
      signalDetail: string;
      memRow: any;
    };

    const candidates: Candidate[] = [];
    for (const target of builderTargets) {
      if (!target.isOwner) {
        const block = await getActiveCommunityBlock({
          ctx,
          communityId: args.communityId,
          userId: target.userId,
        });
        if (block) continue;
      }
      const [muteState, memRow] = await Promise.all([
        readBuilderMutedState(ctx, args.communityId, target.userId),
        ctx.db
          .query("memberMemories")
          .withIndex("by_community_user", (q: any) =>
            q.eq("communityId", args.communityId).eq("userId", target.userId),
          )
          .unique(),
      ]);
      if (muteState.muted || muteState.builderCoachMuted) continue;

      const qualifyingCommitments = (memRow?.entries ?? [])
        .filter((entry: any) => {
          if (entry?.category !== "commitment") return false;
          const ageMs = args.nowMs - Number(entry.at ?? 0);
          return ageMs >= COMMITMENT_FOLLOWUP_MIN_AGE_MS && ageMs <= COMMITMENT_FOLLOWUP_MAX_AGE_MS;
        })
        .sort((a: any, b: any) => Number(b.at ?? 0) - Number(a.at ?? 0));
      if (qualifyingCommitments.length === 0) continue;

      const [lastChannelAt, lastUserAgentAt, recentHistory, lastFounderBriefSentAt] = await Promise.all([
        readLatestBuilderChannelActivityAt(ctx, args.communityId, target.userId),
        readLastUserAgentMessageAt(ctx, args.communityId, target.userId),
        readRecentBuilderHeartbeatHistory(ctx, args.communityId, target.userId),
        target.isOwner ? readLatestFounderBriefSentAt(ctx, args.communityId) : Promise.resolve(null),
      ]);

      const newestCommitmentAt = Number(qualifyingCommitments[0]?.at ?? 0);
      const lastRealActivityMs = Math.max(
        lastChannelAt ?? 0,
        lastUserAgentAt ?? 0,
        newestCommitmentAt,
      );
      const consecutiveUnanswered = countConsecutiveUnansweredCoachTouches(
        recentHistory,
        lastRealActivityMs > 0 ? lastRealActivityMs : null,
      );
      const temp = classifyMemberHeartbeatTemperature({
        nowMs: args.nowMs,
        lastActivityAtMs: lastRealActivityMs > 0 ? lastRealActivityMs : null,
        joinedAtMs: target.joinedAt,
        consecutiveUnanswered,
      });
      if (temp.handoffToSystem) continue;

      // Check each qualifying commitment (newest first) so a recently deduped
      // commitment never shadows another eligible commitment for the same builder.
      for (const commitmentEntry of qualifyingCommitments) {
        const commitAt = Number(commitmentEntry.at ?? args.nowMs);
        const dedupeKey = `builder_commitment:${Math.floor(commitAt / (7 * DAY_MS))}:${String(commitmentEntry.text ?? "").slice(0, 32).toLowerCase()}`;
        const gate = evaluateBuilderHeartbeatGate({
          nowMs: args.nowMs,
          builderMuted: false,
          dedupeKey,
          lastUserThreadMessageAt: lastUserAgentAt,
          lastFounderBriefSentAt,
          recentHistory,
          communityTimeZone: tz,
          builderTemperature: temp.temperature,
          consecutiveUnanswered,
        });
        if (!gate.allowed) {
          if (gate.blockReason === "commitment_deduped") continue;
          break;
        }

        const daysAgo = daysBetween(commitAt, args.nowMs);
        candidates.push({
          commitAt,
          builderUserId: target.userId,
          isOwner: target.isOwner,
          dedupeKey,
          signalDetail: `The ${target.isOwner ? "founder" : "admin"} shared a private commitment ${daysAgo} ${daysAgo === 1 ? "day" : "days"} ago: "${String(commitmentEntry.text ?? "")}". Check in cleanly like a sharp chief of staff and offer one concrete two-minute assist right in this thread.`,
          memRow,
        });
        break;
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.commitAt - b.commitAt);
    const chosen = candidates[0]!;
    const [profile, user] = await Promise.all([
      resolveUserProfileDisplayProjection(ctx, chosen.builderUserId),
      ctx.db.get(chosen.builderUserId),
    ]);
    const builderName =
      profile.display_name || user?.displayName || (user?.handle ? `@${user.handle}` : "Builder");

    return {
      builderUserId: chosen.builderUserId,
      builderName,
      builderRole: chosen.isOwner ? ("owner" as const) : ("admin" as const),
      dedupeKey: chosen.dedupeKey,
      signalDetail: chosen.signalDetail,
      personalSoulMd: cleanAgentSoulText(chosen.memRow?.soulMd) || DEFAULT_PERSONAL_SOUL_MD,
      personalMemoryExcerpt: chosen.memRow?.entries?.length
        ? renderPersonalMemory(chosen.memRow.entries).slice(0, 800)
        : null,
    };
  },
});

export const recordBuilderHeartbeatOutcomeInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    builderUserId: v.id("users"),
    dedupeKey: v.string(),
    decision: v.union(v.literal("send"), v.literal("skip")),
    text: v.optional(v.string()),
    skipReason: v.optional(v.string()),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const community: any = await ctx.db.get(args.communityId);
    if (!community || !communityIsActive(community) || !(await communityAgentIsOn(ctx, args.communityId))) {
      return { ok: false as const, code: "community_unavailable" };
    }
    const builder = await resolveActiveBuilder(ctx, community, args.builderUserId);
    if (!builder.ok) return { ok: false as const, code: builder.code };

    const [muteState, lastChannelAt, lastUserAgentAt, recentHistory, lastFounderBriefSentAt, tz, memRow] =
      await Promise.all([
        readBuilderMutedState(ctx, args.communityId, args.builderUserId),
        readLatestBuilderChannelActivityAt(ctx, args.communityId, args.builderUserId),
        readLastUserAgentMessageAt(ctx, args.communityId, args.builderUserId),
        readRecentBuilderHeartbeatHistory(ctx, args.communityId, args.builderUserId),
        builder.isOwner ? readLatestFounderBriefSentAt(ctx, args.communityId) : Promise.resolve(null),
        communityTimeZone(ctx, args.communityId),
        ctx.db
          .query("memberMemories")
          .withIndex("by_community_user", (q: any) =>
            q.eq("communityId", args.communityId).eq("userId", args.builderUserId),
          )
          .unique(),
      ]);

    const latestCommitmentAt = (memRow?.entries ?? [])
      .filter((entry: any) => entry?.category === "commitment")
      .reduce((best: number, entry: any) => Math.max(best, Number(entry?.at ?? 0)), 0);
    const lastRealActivityMs = Math.max(
      lastChannelAt ?? 0,
      lastUserAgentAt ?? 0,
      latestCommitmentAt,
    );
    const consecutiveUnanswered = countConsecutiveUnansweredCoachTouches(
      recentHistory,
      lastRealActivityMs > 0 ? lastRealActivityMs : null,
    );
    const temp = classifyMemberHeartbeatTemperature({
      nowMs: args.nowMs,
      lastActivityAtMs: lastRealActivityMs > 0 ? lastRealActivityMs : null,
      joinedAtMs: builder.joinedAt,
      consecutiveUnanswered,
    });

    const gate = evaluateBuilderHeartbeatGate({
      nowMs: args.nowMs,
      builderMuted: muteState.muted || muteState.builderCoachMuted,
      dedupeKey: args.dedupeKey,
      lastUserThreadMessageAt: lastUserAgentAt,
      lastFounderBriefSentAt,
      recentHistory,
      communityTimeZone: tz,
      builderTemperature: temp.temperature,
      consecutiveUnanswered,
    });
    if (!gate.allowed) return { ok: false as const, code: gate.blockReason };

    if (args.decision === "skip" || !args.text?.trim()) {
      await ctx.db.insert("communityBuilderHeartbeats", {
        communityId: args.communityId,
        builderUserId: args.builderUserId,
        dedupeKey: args.dedupeKey,
        status: "judge_skipped",
        skipReason: String(args.skipReason ?? "judge_chose_silence").slice(0, 160),
        createdAt: args.nowMs,
        updatedAt: args.nowMs,
      });
      return { ok: true as const, outcome: "judge_skipped" as const };
    }

    const cleanText = args.text.trim();
    const receiptId = await ctx.db.insert("communityBuilderHeartbeats", {
      communityId: args.communityId,
      builderUserId: args.builderUserId,
      dedupeKey: args.dedupeKey,
      status: "sent",
      sentText: cleanText,
      unseenEmailState: "pending",
      sentAt: args.nowMs,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    const threadMessageKey = `builder-heartbeat:${String(receiptId)}`;
    const delivered = await deliverAssistantMessageToMemberCommunityThread(ctx, {
      communityId: args.communityId,
      memberUserId: args.builderUserId,
      messageKey: threadMessageKey,
      contentJson: {
        text: cleanText,
        meta: {
          kind: "builder_heartbeat",
          reason: "builder_commitment_followup",
          receipt_id: String(receiptId),
          delivery_mode: "auto",
        },
      },
    });
    await ctx.db.patch(receiptId, {
      threadId: delivered.threadId,
      threadMessageKey,
      updatedAt: args.nowMs,
    });
    return {
      ok: true as const,
      outcome: "sent" as const,
      receiptId: String(receiptId),
      threadId: delivered.threadId,
    };
  },
});

// 24-hour unseen Builder check-in email nudge: strictly neutral preview so
// private builder commitments never leak into plaintext email.
export const processUnseenBuilderHeartbeatEmailsInternal = internalMutation({
  args: { nowMs: v.number() },
  handler: async (ctx, args) => {
    const oldestMs = args.nowMs - UNSEEN_COACH_EMAIL_MAX_AGE_MS;
    const dueBeforeMs = args.nowMs - UNSEEN_COACH_EMAIL_GRACE_MS;
    const candidates = await ctx.db
      .query("communityBuilderHeartbeats")
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

    for (const receipt of candidates) {
      const sentAt = Number(receipt.sentAt ?? receipt.createdAt ?? 0);
      if (sentAt <= 0 || args.nowMs - sentAt < UNSEEN_COACH_EMAIL_GRACE_MS) continue;

      const community: any = await ctx.db.get(receipt.communityId);
      if (!community || !communityIsActive(community) || !(await communityAgentIsOn(ctx, receipt.communityId))) {
        await ctx.db.patch(receipt._id, {
          unseenEmailState: "suppressed",
          unseenEmailCheckedAt: args.nowMs,
          updatedAt: args.nowMs,
        });
        suppressed += 1;
        continue;
      }

      const [builder, muteState] = await Promise.all([
        resolveActiveBuilder(ctx, community, receipt.builderUserId),
        readBuilderMutedState(ctx, receipt.communityId, receipt.builderUserId),
      ]);
      if (!builder.ok || muteState.muted || muteState.builderCoachMuted) {
        await ctx.db.patch(receipt._id, {
          unseenEmailState: "suppressed",
          unseenEmailCheckedAt: args.nowMs,
          updatedAt: args.nowMs,
        });
        suppressed += 1;
        continue;
      }

      const lastUserAgentAt = await readLastUserAgentMessageAt(
        ctx,
        receipt.communityId,
        receipt.builderUserId,
      );
      if (typeof lastUserAgentAt === "number" && lastUserAgentAt >= sentAt) {
        await ctx.db.patch(receipt._id, {
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
      const emailResult = await enqueueSingleEmailJob(
        ctx,
        {
          kind: "member_coach_nudge",
          communityId: receipt.communityId,
          communityLifecycleGeneration: lifecycle.generation,
          recipientUserId: receipt.builderUserId,
          templateKey: "member_coach_nudge",
          payload: {
            communityName,
            guideName: `${communityName} guide`,
            bodyPreview: "Your guide left a private check-in waiting for you.",
            actionUrl: slug ? `${origin}/c/${encodeURIComponent(slug)}/agent` : origin,
          },
          dedupeKey: `builder-heartbeat-nudge:${String(receipt._id)}`,
          nowMs: args.nowMs,
        },
        communityCache,
      );
      const nextState = emailResult.status === "suppressed" ? "suppressed" : "enqueued";
      await ctx.db.patch(receipt._id, {
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

async function runBuilderHeartbeatForCommunity(
  ctx: any,
  item: { settingsId: Id<"communityMemberCoachSettings">; communityId: Id<"communities"> },
  nowMs: number,
): Promise<string> {
  const claim = await ctx.runMutation(
    internalRefs.communityBuilderHeartbeat.claimBuilderHeartbeatScanInternal,
    { settingsId: item.settingsId, nowMs },
  );
  if (!claim) return "skipped";

  try {
    const candidate = await ctx.runQuery(
      internalRefs.communityBuilderHeartbeat.readNextBuilderHeartbeatCandidateInternal,
      { communityId: claim.communityId, nowMs },
    );
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
        receiptKey: `builder_heartbeat:${String(claim.communityId)}:${String(candidate.builderUserId)}:${candidate.dedupeKey}:${nowMs}`,
        sourceRunId: `builder-heartbeat:${String(claim.communityId)}:${nowMs}`,
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
      BUILDER_HEARTBEAT_INSTRUCTIONS,
      `Community: ${claim.communityName}${claim.communityOneLiner ? ` — ${claim.communityOneLiner}` : ""}`,
      ...(handbookExcerpt ? [`Community handbook (excerpt):\n${handbookExcerpt}`] : []),
      `Your Soul with this builder (tone and working habits only):\n${candidate.personalSoulMd}`,
    ].join("\n\n");

    const user = [
      `Builder: ${candidate.builderName} (${candidate.builderRole})`,
      ...(candidate.personalMemoryExcerpt
        ? [`Private memory with this builder (for this private check-in only):\n${candidate.personalMemoryExcerpt}`]
        : []),
      `Signal: ${candidate.signalDetail}`,
      "Decide whether to send a short, sharp chief-of-staff check-in now or skip.",
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
        .fail(error instanceof Error ? error.message.slice(0, 120) : "builder_heartbeat_provider_failed")
        .catch(() => {});
      return "provider_failed";
    }

    const saved = await ctx.runMutation(
      internalRefs.communityBuilderHeartbeat.recordBuilderHeartbeatOutcomeInternal,
      {
        communityId: claim.communityId,
        builderUserId: candidate.builderUserId,
        dedupeKey: candidate.dedupeKey,
        decision: decision.action,
        ...(decision.action === "send" ? { text: decision.text } : { skipReason: decision.reason }),
        nowMs: Date.now(),
      },
    );
    return saved?.ok ? saved.outcome : `blocked:${saved?.code ?? "unknown"}`;
  } finally {
    await ctx.runMutation(
      internalRefs.communityBuilderHeartbeat.finishBuilderHeartbeatScanInternal,
      { settingsId: item.settingsId, nowMs: Date.now() },
    );
  }
}

// Invoked from processDueMemberCoachScansInternal so funded communities run
// Builder commitment heartbeats cleanly alongside member heartbeats without a separate cron.
export async function runDueBuilderHeartbeatsForAction(ctx: any, nowMs: number) {
  const due = await ctx.runQuery(
    internalRefs.communityBuilderHeartbeat.listDueBuilderHeartbeatCommunitiesInternal,
    { nowMs },
  );
  const outcomes: Record<string, number> = {};
  for (let start = 0; start < due.length; start += COMMUNITY_CONCURRENCY) {
    const chunk = due.slice(start, start + COMMUNITY_CONCURRENCY);
    const results = await Promise.all(
      chunk.map((item: { settingsId: Id<"communityMemberCoachSettings">; communityId: Id<"communities"> }) =>
        runBuilderHeartbeatForCommunity(ctx, item, nowMs),
      ),
    );
    for (const outcome of results) {
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    }
  }
  const unseen = await ctx.runMutation(
    internalRefs.communityBuilderHeartbeat.processUnseenBuilderHeartbeatEmailsInternal,
    { nowMs },
  );
  return {
    scanned: due.length,
    outcomes,
    unseenEmailsEnqueued: unseen?.enqueued ?? 0,
  };
}

// ---------- Per-Builder self-service toggle (Owner + active Admins only) ----------

export const getMyBuilderHeartbeatPreference = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args): Promise<BuilderHeartbeatPreferenceView> => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const { community } = await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const builder = await resolveActiveBuilder(ctx, community, userId);
    if (!builder.ok) {
      return { eligible: false, enabled: false, community_muted: false };
    }
    const state = await readBuilderMutedState(ctx, args.communityId, userId);
    return {
      eligible: true,
      enabled: !state.builderCoachMuted,
      community_muted: state.muted,
    };
  },
});

export const setMyBuilderHeartbeatPreference = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args): Promise<BuilderHeartbeatPreferenceView> => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const { community } = await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const builder = await resolveActiveBuilder(ctx, community, userId);
    if (!builder.ok) {
      throw new Error("builder_heartbeat_builder_required");
    }
    const nowMs = Date.now();
    const existing = await ctx.db
      .query("communityMemberSettings")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", args.communityId).eq("userId", userId),
      )
      .first();
    const builderCoachMuted = !args.enabled;
    if (existing) {
      await ctx.db.patch(existing._id, {
        builderCoachMuted,
        updatedAt: nowMs,
      });
      return {
        eligible: true,
        enabled: args.enabled,
        community_muted: Boolean(existing.muted),
      };
    }
    await ctx.db.insert("communityMemberSettings", {
      communityId: args.communityId,
      userId,
      muted: false,
      builderCoachMuted,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return {
      eligible: true,
      enabled: args.enabled,
      community_muted: false,
    };
  },
});
