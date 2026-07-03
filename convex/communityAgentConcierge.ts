import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {
  type ConciergeIntakeResult,
  type ConciergeMentionRow,
  type ServeRequestIntakeReason,
  intakeCommunityAgentMention,
} from "./communityAgentConciergeCore";

const CONCIERGE_REPAIR_DEFAULT_LIMIT = 25;
const CONCIERGE_REPAIR_MAX_LIMIT = 50;

function boundedLimit(raw: unknown): number {
  const parsed = Math.floor(Number(raw ?? CONCIERGE_REPAIR_DEFAULT_LIMIT));
  if (!Number.isFinite(parsed) || parsed <= 0) return CONCIERGE_REPAIR_DEFAULT_LIMIT;
  return Math.max(1, Math.min(CONCIERGE_REPAIR_MAX_LIMIT, parsed));
}

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
