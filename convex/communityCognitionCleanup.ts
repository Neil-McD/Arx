import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {
  drainDeletedCommunityCognitionStepCore,
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

export const drainDeletedCommunityCognitionInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    phase: communityCognitionCleanupPhaseValidator,
  },
  handler: async (ctx, args) => {
    const result = await drainDeletedCommunityCognitionStepCore({
      db: ctx.db as any,
      communityId: args.communityId,
      phase: args.phase,
    });
    if (result.next_phase) {
      await ctx.scheduler.runAfter(
        0,
        (internal as any).communityCognitionCleanup
          .drainDeletedCommunityCognitionInternal,
        {
          communityId: args.communityId,
          phase: result.next_phase,
        },
      );
    }
    return result;
  },
});
