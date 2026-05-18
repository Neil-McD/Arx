import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { normalizeIdValue } from "./communityCore";

const COMMUNITY_AGENT_HEARTBEAT_MAX_DELAY_MS = 24 * 60 * 60 * 1000;
const COMMUNITY_AGENT_HEARTBEAT_MAX_TOOL_STEPS = 8;
const internalRefs = internal as any;

function boundedText(raw: unknown, maxLength: number): string {
  return String(raw ?? "").trim().slice(0, maxLength);
}

function clampDelayMs(raw: unknown): number {
  const parsed = Math.floor(Number(raw ?? 0));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(COMMUNITY_AGENT_HEARTBEAT_MAX_DELAY_MS, parsed));
}

function clampToolSteps(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const parsed = Math.floor(Number(raw));
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(1, Math.min(COMMUNITY_AGENT_HEARTBEAT_MAX_TOOL_STEPS, parsed));
}

function buildHeartbeatId(communityId: unknown, nowMs: number): string {
  return `community:${normalizeIdValue(communityId)}:${nowMs}`;
}

function wakeEvidenceFromMeasurement(measurement: Record<string, any>) {
  return {
    reason: boundedText(measurement.reason, 120) || "no_trigger",
    pendingTotal: Math.max(0, Number(measurement.pending_total ?? 0)),
    pendingStandard: Math.max(0, Number(measurement.pending_standard ?? 0)),
    pendingStrong: Math.max(0, Number(measurement.pending_strong ?? 0)),
    pendingCritical: Math.max(0, Number(measurement.pending_critical ?? 0)),
    oldestPendingAt: boundedText(measurement.oldest_pending_at, 80) || undefined,
    hasMorePending: Boolean(measurement.has_more_pending),
    countsAreLowerBound: Boolean(measurement.counts_are_lower_bound),
  };
}

export const enqueueCommunityAgentHeartbeatInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    heartbeatId: v.optional(v.string()),
    runAfterMs: v.optional(v.number()),
    modelId: v.optional(v.string()),
    maxToolSteps: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community) throw new Error("community_agent_heartbeat_community_not_found");
    const nowMs = args.nowMs ?? Date.now();
    const heartbeatId = boundedText(args.heartbeatId, 200) || buildHeartbeatId(args.communityId, nowMs);
    const runAfterMs = clampDelayMs(args.runAfterMs);
    await ctx.scheduler.runAfter(
      runAfterMs,
      internalRefs.communityAgentHeartbeat.runCommunityAgentHeartbeatInternal,
      {
        communityId: args.communityId,
        heartbeatId,
        modelId: boundedText(args.modelId, 128) || undefined,
        maxToolSteps: clampToolSteps(args.maxToolSteps),
      },
    );
    return {
      ok: true,
      community_id: normalizeIdValue(args.communityId),
      heartbeat_id: heartbeatId,
      scheduled_after_ms: runAfterMs,
    };
  },
});

export const runCommunityAgentHeartbeatInternal = internalAction({
  args: {
    communityId: v.id("communities"),
    heartbeatId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    maxToolSteps: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const heartbeatId = boundedText(args.heartbeatId, 200) || undefined;
    const modelId = boundedText(args.modelId, 128) || undefined;
    const compilerEvidence = (await ctx.runQuery(
      internalRefs.communityCompilerEvidence.measureCommunityCompilerEvidenceInternal,
      {
        communityId: args.communityId,
      },
    )) as Record<string, any>;
    const wakeEvidence = wakeEvidenceFromMeasurement(compilerEvidence);
    if (!compilerEvidence.should_run) {
      const skippedRun = await ctx.runMutation(
        internalRefs.communityAgentRuntime.recordCommunityAgentSkippedRunInternal,
        {
          communityId: args.communityId,
          triggerType: "heartbeat",
          heartbeatId,
          modelId,
          wakeReason: wakeEvidence.reason,
          wakeEvidence,
        },
      );
      return {
        ok: true,
        skipped: true,
        run: skippedRun,
        stop_reason: wakeEvidence.reason,
        tool_step_count: 0,
        candidate_proposal_ids: [],
        wake_reason: wakeEvidence.reason,
        wake_evidence: wakeEvidence,
      };
    }
    return await ctx.runAction(internalRefs.communityAgentRuntime.runCommunityAgentLoopInternal, {
      communityId: args.communityId,
      triggerType: "heartbeat",
      heartbeatId,
      modelId,
      maxToolSteps: clampToolSteps(args.maxToolSteps),
      wakeReason: wakeEvidence.reason,
      wakeEvidence,
    });
  },
});
