// What the guide read to answer (shared/communityKnowledgeUse.ts): one small
// record per answer, written by the run entry (convex/communityAgentRun.ts)
// when an answer to a person finishes. The community brain reads them for
// how much each note and lesson is used and what is answered together.
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { KNOWLEDGE_USE_DAYS, knowledgeUseDay, knowledgeUseRefs, summarizeKnowledgeUse, type KnowledgeUse } from "../shared/communityKnowledgeUse";

// The most records read for one summary: enough for a busy month, and a
// bound on what a page load can cost.
const RECORDS_READ_MAX = 2_000;

export const recordKnowledgeUseInternal = internalMutation({
  args: { communityId: v.id("communities"), refs: v.array(v.string()), nowMs: v.number() },
  handler: async (ctx, args) => {
    const refs = knowledgeUseRefs(args.refs);
    if (refs.length === 0) return { recorded: 0 };
    // The day only: a record can't be matched to a conversation by its time.
    await ctx.db.insert("communityKnowledgeUse", { communityId: args.communityId, day: knowledgeUseDay(args.nowMs), refs });
    return { recorded: refs.length };
  },
});

// Use over the last month, newest records first when there are too many.
export async function knowledgeUseFor(ctx: any, communityId: any, nowMs: number): Promise<KnowledgeUse> {
  const since = knowledgeUseDay(nowMs) - KNOWLEDGE_USE_DAYS;
  const records: any[] = await ctx.db.query("communityKnowledgeUse")
    .withIndex("by_community_day", (q: any) => q.eq("communityId", communityId).gte("day", since)).order("desc").take(RECORDS_READ_MAX);
  return summarizeKnowledgeUse(records);
}

// Operator diagnostic (and the map's read, next): a community's use summary.
export const readKnowledgeUseInternal = internalQuery({
  args: { communityId: v.id("communities") },
  handler: async (ctx, args) => await knowledgeUseFor(ctx, args.communityId, Date.now()),
});
