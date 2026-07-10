import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  drainSelfAuthoredPendingSourceTracesForCommunity,
  measureCommunityCompilerEvidenceForCommunity,
  settleCommunityCompilerEvidenceForCycle,
} from "./communityCompilerEvidenceCore";

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

export const drainSelfAuthoredPendingSourceTracesInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community) throw new Error("community_compiler_evidence_community_not_found");

    const drained = await drainSelfAuthoredPendingSourceTracesForCommunity({
      ctx,
      communityId: args.communityId,
      nowMs: args.nowMs ?? Date.now(),
    });
    return { ok: true, drained };
  },
});

export const settleCommunityCompilerEvidenceCycleInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    evidence: v.array(v.object({
      traceId: v.id("communitySourceTraces"),
      expectedUpdatedAt: v.number(),
    })),
    compilerDigestId: v.optional(v.id("communityCompilerDigests")),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community) throw new Error("community_compiler_evidence_community_not_found");

    return await settleCommunityCompilerEvidenceForCycle({
      ctx,
      communityId: args.communityId,
      evidence: args.evidence,
      compilerDigestId: args.compilerDigestId,
      nowMs: args.nowMs ?? Date.now(),
    });
  },
});
