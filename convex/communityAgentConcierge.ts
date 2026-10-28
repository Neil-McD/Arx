import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  normalizeIdValue,
  requireCommunityChatAccess,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import { CANONICAL_COMMUNITY_AGENT_KEY } from "../shared/communityAgentToolProtocol";
import { resolveCommunityInferenceFundingAdmission } from "./founderInferenceCore";
import {
  PLATFORM_HOME_COMMUNITY_AGENT_LIMIT_REACHED,
  formatPlatformHomeMemberLimitMessage,
} from "../shared/founderInference";

const CONCIERGE_SERVE_ISSUE_WINDOW_MS = 30 * 60 * 1000;

type CommunityAgentServeRequestIssueRow = {
  _id: any;
  communityId: any;
  agentKey: string;
  requesterUserId?: any;
  status: string;
  intakeReason: string;
  errorCode?: string;
  createdAt: number;
};

function coerceTimestampMs(raw: unknown, fallback: number): number {
  const parsed = Math.floor(Number(raw));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
      if (row.status !== "skipped" && row.status !== "error") return false;
      const issueCode = row.status === "skipped" ? row.intakeReason : row.errorCode;
      if (
        issueCode !== PLATFORM_HOME_COMMUNITY_AGENT_LIMIT_REACHED &&
        issueCode !== "founder_plan_required" &&
        issueCode !== "founder_subscription_inactive" &&
        issueCode !== "founder_subscription_ambiguous" &&
        issueCode !== "founder_subscription_owner_mismatch" &&
        issueCode !== "founder_usage_exhausted" &&
        issueCode !== "founder_usage_cycle_missing" &&
        issueCode !== "founder_usage_cycle_ambiguous" &&
        issueCode !== "founder_usage_cycle_community_mismatch" &&
        issueCode !== "founder_inference_pricing_misconfigured"
      ) return false;
      if (normalizeIdValue(row.communityId) !== normalizeIdValue(args.communityId)) return false;
      if (normalizeIdValue(row.requesterUserId) !== normalizeIdValue(userId)) return false;
      const createdAt = coerceTimestampMs(row.createdAt, 0);
      return createdAt > 0 && nowMs - createdAt <= CONCIERGE_SERVE_ISSUE_WINDOW_MS;
    });

    if (!issue) return null;
    const issueCode = issue.status === "skipped" ? issue.intakeReason : issue.errorCode;
    if (issueCode === PLATFORM_HOME_COMMUNITY_AGENT_LIMIT_REACHED) {
      // The requester's own monthly allowance, not a community billing problem.
      return {
        id: normalizeIdValue(issue._id),
        community_id: normalizeIdValue(args.communityId),
        reason: "member_agent_limit_reached",
        cta: "start_builder",
        message: formatPlatformHomeMemberLimitMessage(nowMs),
        created_at: new Date(coerceTimestampMs(issue.createdAt, nowMs)).toISOString(),
      };
    }
    const funding = await resolveCommunityInferenceFundingAdmission(ctx, args.communityId);
    const usageIssue =
      issueCode === "founder_usage_exhausted" ||
      issueCode === "founder_usage_cycle_missing" ||
      issueCode === "founder_usage_cycle_ambiguous" ||
      issueCode === "founder_usage_cycle_community_mismatch" ||
      issueCode === "founder_inference_pricing_misconfigured";
    if (
      !usageIssue &&
      funding.ok
    ) return null;
    const createdAt = coerceTimestampMs(issue.createdAt, nowMs);
    return {
      id: normalizeIdValue(issue._id),
      community_id: normalizeIdValue(args.communityId),
      reason: "community_owner_action_required",
      cta: null,
      message: "Community AI is temporarily unavailable. The community owner needs to update inference settings.",
      created_at: new Date(createdAt).toISOString(),
    };
  },
});
