import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  deleteDeletedCommunityCognitionBatchCore,
  inspectDeletedCommunityCognitionCore,
} from "./communityCognitionCleanupCore";

const communityCognitionCleanupPhaseValidator = v.union(
  v.literal("agent_run_events"),
  v.literal("agent_runs"),
  v.literal("metabolizer_runs"),
  v.literal("compiler_digests"),
  v.literal("outcome_observations"),
  v.literal("memory_retrieval_logs"),
  v.literal("evidence_retrieval_logs"),
  v.literal("change_requests"),
  v.literal("mutations"),
  v.literal("edges"),
  v.literal("nodes"),
  v.literal("evidence_citations"),
  v.literal("source_traces"),
  v.literal("archive_documents"),
);

export const inspectDeletedCommunityCognitionInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    return await inspectDeletedCommunityCognitionCore({
      db: ctx.db as any,
      communityId: args.communityId,
    });
  },
});

export const deleteDeletedCommunityCognitionBatchInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    phase: communityCognitionCleanupPhaseValidator,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await deleteDeletedCommunityCognitionBatchCore({
      db: ctx.db as any,
      communityId: args.communityId,
      phase: args.phase,
      limit: args.limit,
    });
  },
});
