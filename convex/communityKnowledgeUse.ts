// What the guide read to answer (shared/communityKnowledgeUse.ts): one row
// of counts per community per day. The run entry (convex/communityAgentRun.ts)
// schedules an answer's refs to be added at a random time within a few hours,
// so neither a row nor the moment it changes can be matched to a
// conversation. The community brain reads the last month of rows.
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { KNOWLEDGE_USE_DAYS, addToKnowledgeUseDay, knowledgeUseDay, summarizeKnowledgeUse, type KnowledgeUse } from "../shared/communityKnowledgeUse";

// An answer's refs reach its day's row this long after it, at most.
export const KNOWLEDGE_USE_DELAY_MAX_MS = 4 * 60 * 60_000;

export const addKnowledgeUseInternal = internalMutation({
  // day: the day the answer happened (days since 1970, UTC).
  args: { communityId: v.id("communities"), day: v.number(), refs: v.array(v.string()) },
  handler: async (ctx, args) => {
    const row: any = await ctx.db.query("communityKnowledgeUse")
      .withIndex("by_community_day", (q: any) => q.eq("communityId", args.communityId).eq("day", args.day)).first();
    const next = addToKnowledgeUseDay(row ?? { uses: [], pairs: [] }, args.refs);
    if (next.uses.length === 0) return { added: false };
    if (row) await ctx.db.patch(row._id, next);
    else await ctx.db.insert("communityKnowledgeUse", { communityId: args.communityId, day: args.day, ...next });
    return { added: true };
  },
});

// Use over the last month.
export async function knowledgeUseFor(ctx: any, communityId: any, nowMs: number): Promise<KnowledgeUse> {
  const since = knowledgeUseDay(nowMs) - KNOWLEDGE_USE_DAYS;
  const days: any[] = await ctx.db.query("communityKnowledgeUse")
    .withIndex("by_community_day", (q: any) => q.eq("communityId", communityId).gte("day", since)).take(KNOWLEDGE_USE_DAYS + 2);
  return summarizeKnowledgeUse(days);
}

// Operator diagnostic (and the map's read, next): a community's use summary.
export const readKnowledgeUseInternal = internalQuery({
  args: { communityId: v.id("communities") },
  handler: async (ctx, args) => await knowledgeUseFor(ctx, args.communityId, Date.now()),
});
