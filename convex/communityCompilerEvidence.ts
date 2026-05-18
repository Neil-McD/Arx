import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { measureCommunityCompilerEvidenceForCommunity } from "./communityCompilerEvidenceCore";

export const measureCommunityCompilerEvidenceInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community) throw new Error("community_compiler_evidence_community_not_found");

    const { measurement } = await measureCommunityCompilerEvidenceForCommunity({
      ctx,
      communityId: args.communityId,
      nowMs: args.nowMs ?? Date.now(),
    });
    return measurement;
  },
});
