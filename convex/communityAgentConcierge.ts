import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  type ConciergeIntakeResult,
  type ConciergeMentionRow,
  type ServeRequestIntakeReason,
  intakeCommunityAgentMention,
} from "./communityAgentConciergeCore";
import {
  normalizeIdValue,
  requireCommunityChatAccess,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import { CANONICAL_COMMUNITY_AGENT_KEY } from "../shared/communityAgentToolProtocol";

const CONCIERGE_REPAIR_DEFAULT_LIMIT = 25;
const CONCIERGE_REPAIR_MAX_LIMIT = 50;
const CONCIERGE_SERVE_ISSUE_WINDOW_MS = 30 * 60 * 1000;

function boundedLimit(raw: unknown): number {
  const parsed = Math.floor(Number(raw ?? CONCIERGE_REPAIR_DEFAULT_LIMIT));
  if (!Number.isFinite(parsed) || parsed <= 0) return CONCIERGE_REPAIR_DEFAULT_LIMIT;
  return Math.max(1, Math.min(CONCIERGE_REPAIR_MAX_LIMIT, parsed));
}

type CommunityAgentServeRequestIssueRow = {
  _id: any;
  communityId: any;
  agentKey: string;
  requesterUserId?: any;
  status: string;
  intakeReason: string;
  createdAt: number;
};

function coerceTimestampMs(raw: unknown, fallback: number): number {
  const parsed = Math.floor(Number(raw));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function userHasChatgptConnection(ctx: any, userId: any): Promise<boolean> {
  const row = (await ctx.db
    .query("userProviderConnections" as any)
    .withIndex("by_user_provider", (q: any) =>
      q.eq("userId", userId).eq("provider", "chatgpt"),
    )
    .first()) as Record<string, any> | null;
  return Boolean(row?.encryptedSecretHex);
}

export const getMyLatestCommunityAgentServeIssue = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });
    if (await userHasChatgptConnection(ctx, userId)) {
      return null;
    }

    const nowMs = Date.now();
    const rows = (await ctx.db
      .query("communityAgentServeRequests" as any)
      .withIndex("by_requester_community_createdAt", (q: any) =>
        q.eq("requesterUserId", userId).eq("communityId", args.communityId),
      )
      .order("desc")
      .take(10)) as CommunityAgentServeRequestIssueRow[];

    const issue = rows.find((row) => {
      if (row.agentKey !== CANONICAL_COMMUNITY_AGENT_KEY) return false;
      if (row.status !== "skipped") return false;
      if (row.intakeReason !== "requester_connection_missing") return false;
      if (normalizeIdValue(row.communityId) !== normalizeIdValue(args.communityId)) return false;
      if (normalizeIdValue(row.requesterUserId) !== normalizeIdValue(userId)) return false;
      const createdAt = coerceTimestampMs(row.createdAt, 0);
      return createdAt > 0 && nowMs - createdAt <= CONCIERGE_SERVE_ISSUE_WINDOW_MS;
    });

    if (!issue) return null;
    const createdAt = coerceTimestampMs(issue.createdAt, nowMs);
    return {
      id: normalizeIdValue(issue._id),
      community_id: normalizeIdValue(args.communityId),
      reason: "provider_connection_required",
      cta: "connect_chatgpt",
      message: "Connect ChatGPT to use the community agent.",
      created_at: new Date(createdAt).toISOString(),
    };
  },
});

export const consumePendingCommunityAgentMentionsInternal = internalMutation({
  args: {
    limit: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = boundedLimit(args.limit);
    const nowMs = args.nowMs ?? Date.now();
    const mentions = (await ctx.db
      .query("communityInteractionMentions" as any)
      .withIndex("by_mentionKind_notifyState_createdAt", (q: any) =>
        q.eq("mentionKind", "community_agent").eq("notifyState", "pending"),
      )
      .order("asc")
      .take(limit)) as ConciergeMentionRow[];

    const results: ConciergeIntakeResult[] = [];
    const counts: Record<string, number> = {};
    for (const mention of mentions) {
      const result = await intakeCommunityAgentMention({ ctx, mention, nowMs });
      results.push(result);
      counts[result.status] = (counts[result.status] ?? 0) + 1;
      counts[result.intake_reason] = (counts[result.intake_reason] ?? 0) + 1;
    }
    return {
      ok: true,
      repair: true,
      inspected: mentions.length,
      queued: counts.queued ?? 0,
      skipped: counts.skipped ?? 0,
      duplicate: counts.duplicate ?? 0,
      counts: counts as Record<ServeRequestIntakeReason | string, number>,
      results,
    };
  },
});
