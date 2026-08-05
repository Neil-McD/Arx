import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { normalizeIdValue } from "./communityCore";
import {
  communityIsOperational,
  COMMUNITY_LIFECYCLE_GENERATION_STALE_ERROR,
  normalizeCommunityLifecycleGeneration,
  requireOperationalCommunityById,
  resolveCommunityNewOperationsErrorCode,
} from "./communityLifecycleCore";
import {
  buildCommunitySourceTraceRevision,
  measureCommunityCompilerEvidenceForCommunity,
} from "./communityCompilerEvidenceCore";

const COMMUNITY_AGENT_HEARTBEAT_MAX_DELAY_MS = 24 * 60 * 60 * 1000;
const COMMUNITY_AGENT_HEARTBEAT_MAX_TOOL_STEPS = 8;
const COMMUNITY_AGENT_CYCLES_PER_DAY_CAP = 2;
const COMMUNITY_AGENT_HANDOFF_LEASE_MS = 30 * 60 * 1000;
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

function heartbeatLifecycleStopReason(value: unknown): string | null {
  const reason = boundedText(value, 120);
  return reason === "community_archiving" ||
    reason === "community_archived" ||
    reason === COMMUNITY_LIFECYCLE_GENERATION_STALE_ERROR
    ? reason
    : null;
}

function wakeEvidenceFromMeasurement(
  measurement: Record<string, any>,
  handoff?: { digestId?: unknown; versionKey?: unknown; itemCount?: unknown },
) {
  return {
    reason: boundedText(measurement.reason, 120) || "no_trigger",
    pendingTotal: Math.max(0, Number(measurement.pending_total ?? 0)),
    pendingTraceTotal: Math.max(0, Number(measurement.pending_trace_total ?? measurement.pending_total ?? 0)),
    pendingContinuation: Math.max(0, Number(measurement.pending_continuation ?? 0)),
    pendingStandard: Math.max(0, Number(measurement.pending_standard ?? 0)),
    pendingStrong: Math.max(0, Number(measurement.pending_strong ?? 0)),
    pendingCritical: Math.max(0, Number(measurement.pending_critical ?? 0)),
    oldestPendingAt: boundedText(measurement.oldest_pending_at, 80) || undefined,
    hasMorePending: Boolean(measurement.has_more_pending),
    countsAreLowerBound: Boolean(measurement.counts_are_lower_bound),
    compilerDigestId: boundedText(handoff?.digestId, 128) || undefined,
    compilerDigestVersionKey: boundedText(handoff?.versionKey, 128) || undefined,
    compilerWorkItemCount: handoff?.itemCount === undefined
      ? undefined
      : Math.max(0, Number(handoff.itemCount ?? 0)),
  };
}

async function classifyCommunityCompilerDigestWork(
  ctx: any,
  communityId: any,
  digest: Record<string, any>,
): Promise<"claimable" | "settled" | "superseded"> {
  const items = Array.isArray(digest.items) ? digest.items : [];
  if (!boundedText(digest.versionKey, 128) || items.length === 0) return "superseded";
  let settledCount = 0;
  for (const item of items) {
    const workKey = boundedText(item?.workKey, 128);
    const traceIds = Array.isArray(item?.sourceTraceIds) ? item.sourceTraceIds : [];
    const revisions = Array.isArray(item?.sourceRevisions) ? item.sourceRevisions : [];
    if (!workKey || traceIds.length !== 1 || revisions.length !== 1) return "superseded";
    const trace = (await ctx.db.get(traceIds[0] as any)) as Record<string, any> | null;
    if (!trace || normalizeIdValue(trace.communityId) !== normalizeIdValue(communityId)) {
      return "superseded";
    }
    if (await buildCommunitySourceTraceRevision(trace as any) !== String(revisions[0])) {
      return "superseded";
    }
    if (boundedText(trace.compilerDecision?.workKey, 128) === workKey) {
      settledCount += 1;
      continue;
    }
    if (
      trace.compilerState !== "pending" ||
      trace.visibilityScope === "private" ||
      trace.sourceVisibility === "private" ||
      trace.sourceVisibility === "redacted"
    ) {
      return "superseded";
    }
  }
  if (settledCount === items.length) return "settled";
  return settledCount === 0 ? "claimable" : "superseded";
}

async function readCommunityAgentControlGate(args: {
  ctx: any;
  communityId: any;
  nowMs: number;
}) {
  const community = await args.ctx.db.get(args.communityId);
  if (!community) {
    return { cyclesToday: 0, lifecycleGeneration: 0, reason: "community_not_found" };
  }
  const lifecycleGeneration = normalizeCommunityLifecycleGeneration(
    community.lifecycleGeneration,
  );
  if (!communityIsOperational(community)) {
    return {
      cyclesToday: 0,
      lifecycleGeneration,
      reason:
        resolveCommunityNewOperationsErrorCode(community) ??
        "community_lifecycle_status_invalid",
    };
  }
  const dayStartMs = new Date(new Date(args.nowMs).toISOString().slice(0, 10)).getTime();
  const [config, stewardRunsToday] = await Promise.all([
    args.ctx.db
      .query("communityAgentConfigs" as any)
      .withIndex("by_community_updatedAt", (q: any) => q.eq("communityId", args.communityId))
      .order("desc")
      .first() as Promise<Record<string, any> | null>,
    args.ctx.db
      .query("communityAgentRuns" as any)
      .withIndex("by_community_role_triggerType_createdAt", (q: any) =>
        q
          .eq("communityId", args.communityId)
          .eq("role", "steward")
          .eq("triggerType", "heartbeat")
          .gte("createdAt", dayStartMs),
      )
      .take(COMMUNITY_AGENT_CYCLES_PER_DAY_CAP) as Promise<Array<Record<string, any>>>,
  ]);
  const cyclesToday = stewardRunsToday.length;
  return {
    cyclesToday,
    lifecycleGeneration,
    reason: config?.agentEnabled === false
      ? "agent_disabled"
      : cyclesToday >= COMMUNITY_AGENT_CYCLES_PER_DAY_CAP
        ? "daily_cycle_cap_reached"
        : null,
  };
}

async function listCurrentGenerationHandoffs(args: {
  ctx: any;
  communityId: any;
  lifecycleGeneration: number;
  state: "pending" | "running";
  limit: number;
}): Promise<Array<Record<string, any>>> {
  const currentRows = (await args.ctx.db
    .query("communityCompilerDigests" as any)
    .withIndex("by_community_generation_agentHandoffState_createdAt", (q: any) =>
      q
        .eq("communityId", args.communityId)
        .eq("communityLifecycleGeneration", args.lifecycleGeneration)
        .eq("agentHandoffState", args.state),
    )
    .order("asc")
    .take(args.limit)) as Array<Record<string, any>>;
  if (args.lifecycleGeneration !== 0 || currentRows.length >= args.limit) {
    return currentRows;
  }
  const legacyRows = (await args.ctx.db
    .query("communityCompilerDigests" as any)
    .withIndex("by_community_agentHandoffState_createdAt", (q: any) =>
      q.eq("communityId", args.communityId).eq("agentHandoffState", args.state),
    )
    .order("asc")
    .take(args.limit)) as Array<Record<string, any>>;
  return Array.from(
    new Map(
      [...currentRows, ...legacyRows.filter((row) => row.communityLifecycleGeneration === undefined)]
        .map((row) => [normalizeIdValue(row._id), row]),
    ).values(),
  )
    .sort((a, b) => Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0))
    .slice(0, args.limit);
}

async function terminalizeStaleGenerationHandoffs(args: {
  ctx: any;
  communityId: any;
  lifecycleGeneration: number;
  nowMs: number;
}): Promise<void> {
  for (const state of ["pending", "running"] as const) {
    const rows = (await args.ctx.db
      .query("communityCompilerDigests" as any)
      .withIndex("by_community_agentHandoffState_createdAt", (q: any) =>
        q.eq("communityId", args.communityId).eq("agentHandoffState", state),
      )
      .order("asc")
      .take(20)) as Array<Record<string, any>>;
    for (const row of rows) {
      if (
        normalizeCommunityLifecycleGeneration(row.communityLifecycleGeneration) ===
        args.lifecycleGeneration
      ) {
        continue;
      }
      await args.ctx.db.patch(row._id as any, {
        agentHandoffState: "handled" as const,
        agentClaimId: undefined,
        agentClaimedAt: undefined,
        agentHandledAt: args.nowMs,
        agentTerminalReason: COMMUNITY_LIFECYCLE_GENERATION_STALE_ERROR,
        updatedAt: args.nowMs,
      });
    }
  }
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
    const community = await requireOperationalCommunityById<Record<string, any>>({
      ctx,
      communityId: args.communityId,
    });
    const communityLifecycleGeneration = normalizeCommunityLifecycleGeneration(
      community.lifecycleGeneration,
    );
    const nowMs = args.nowMs ?? Date.now();
    const heartbeatId = boundedText(args.heartbeatId, 200) || buildHeartbeatId(args.communityId, nowMs);
    const runAfterMs = clampDelayMs(args.runAfterMs);
    await ctx.scheduler.runAfter(
      runAfterMs,
      internalRefs.communityAgentHeartbeat.runCommunityAgentHeartbeatInternal,
      {
        communityId: args.communityId,
        communityLifecycleGeneration,
        heartbeatId,
        modelId: boundedText(args.modelId, 128) || undefined,
        maxToolSteps: clampToolSteps(args.maxToolSteps),
      },
    );
    return {
      ok: true,
      community_id: normalizeIdValue(args.communityId),
      heartbeat_id: heartbeatId,
      community_lifecycle_generation: communityLifecycleGeneration,
      scheduled_after_ms: runAfterMs,
    };
  },
});

export const claimCommunityCompilerDigestHandoffInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    claimId: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const claimId = boundedText(args.claimId, 200);
    if (!claimId) throw new Error("community_compiler_handoff_claim_required");
    const controlGate = await readCommunityAgentControlGate({
      ctx,
      communityId: args.communityId,
      nowMs,
    });
    if (controlGate.reason) {
      return { claimed: false, reason: controlGate.reason, digest_id: null };
    }
    await terminalizeStaleGenerationHandoffs({
      ctx,
      communityId: args.communityId,
      lifecycleGeneration: controlGate.lifecycleGeneration,
      nowMs,
    });
    const runningRows = await listCurrentGenerationHandoffs({
      ctx,
      communityId: args.communityId,
      lifecycleGeneration: controlGate.lifecycleGeneration,
      state: "running",
      limit: 20,
    });
    const freshRunning = runningRows.find(
      (row) => Number(row.agentClaimedAt ?? 0) >= nowMs - COMMUNITY_AGENT_HANDOFF_LEASE_MS,
    );
    if (freshRunning) {
      return {
        claimed: false,
        reason: "handoff_already_running",
        digest_id: normalizeIdValue(freshRunning._id),
      };
    }
    const pendingRows = await listCurrentGenerationHandoffs({
      ctx,
      communityId: args.communityId,
      lifecycleGeneration: controlGate.lifecycleGeneration,
      state: "pending",
      limit: 20,
    });
    const staleRunning = runningRows.find(
      (row) => Number(row.agentClaimedAt ?? 0) < nowMs - COMMUNITY_AGENT_HANDOFF_LEASE_MS,
    ) ?? null;
    const candidates = [...pendingRows, staleRunning]
      .filter((row): row is Record<string, any> => Boolean(row))
      .sort((a, b) => Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0));
    for (const digest of candidates) {
      if (
        normalizeCommunityLifecycleGeneration(digest.communityLifecycleGeneration) !==
        controlGate.lifecycleGeneration
      ) {
        await ctx.db.patch(digest._id as any, {
          agentHandoffState: "handled" as const,
          agentClaimId: undefined,
          agentClaimedAt: undefined,
          agentHandledAt: nowMs,
          agentTerminalReason: COMMUNITY_LIFECYCLE_GENERATION_STALE_ERROR,
          updatedAt: nowMs,
        });
        continue;
      }
      const workState = await classifyCommunityCompilerDigestWork(ctx, args.communityId, digest);
      if (workState !== "claimable") {
        await ctx.db.patch(digest._id as any, {
          agentHandoffState: "handled" as const,
          agentClaimId: undefined,
          agentClaimedAt: undefined,
          agentHandledAt: nowMs,
          agentTerminalReason: workState,
          updatedAt: nowMs,
        });
        continue;
      }
      const versionKey = boundedText(digest.versionKey, 128);
      await ctx.db.patch(digest._id as any, {
        agentHandoffState: "running" as const,
        agentClaimId: claimId,
        agentClaimedAt: nowMs,
        agentHandledAt: undefined,
        agentTerminalReason: undefined,
        agentAttemptCount: Math.max(0, Number(digest.agentAttemptCount ?? 0)) + 1,
        updatedAt: nowMs,
      });
      return {
        claimed: true,
        reason: staleRunning && normalizeIdValue(staleRunning._id) === normalizeIdValue(digest._id)
          ? "stale_handoff_reclaimed"
          : "pending_compiler_handoff",
        digest_id: normalizeIdValue(digest._id),
        version_key: versionKey,
        item_count: Math.max(0, Number(digest.itemCount ?? 0)),
      };
    }
    return { claimed: false, reason: "no_pending_compiler_handoff", digest_id: null };
  },
});

export const settleCommunityCompilerDigestHandoffInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    digestId: v.id("communityCompilerDigests"),
    versionKey: v.string(),
    claimId: v.string(),
    outcome: v.union(v.literal("handled"), v.literal("retry")),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const digest = (await ctx.db.get(args.digestId)) as Record<string, any> | null;
    if (!digest || normalizeIdValue(digest.communityId) !== normalizeIdValue(args.communityId)) {
      throw new Error("community_compiler_handoff_not_found");
    }
    if (boundedText(digest.versionKey, 128) !== boundedText(args.versionKey, 128)) {
      throw new Error("community_compiler_handoff_version_mismatch");
    }
    if (
      digest.agentHandoffState !== "running" ||
      boundedText(digest.agentClaimId, 200) !== boundedText(args.claimId, 200)
    ) {
      throw new Error("community_compiler_handoff_claim_mismatch");
    }
    const nowMs = args.nowMs ?? Date.now();
    if (args.outcome === "handled") {
      const workState = await classifyCommunityCompilerDigestWork(ctx, args.communityId, digest);
      if (workState !== "settled") {
        throw new Error("community_compiler_handoff_unsettled");
      }
    }
    await ctx.db.patch(args.digestId, args.outcome === "handled"
      ? {
          agentHandoffState: "handled" as const,
          agentClaimId: undefined,
          agentClaimedAt: undefined,
          agentHandledAt: nowMs,
          agentTerminalReason: "settled",
          updatedAt: nowMs,
        }
      : {
          agentHandoffState: "pending" as const,
          agentClaimId: undefined,
          agentClaimedAt: undefined,
          agentHandledAt: undefined,
          agentTerminalReason: undefined,
          updatedAt: nowMs,
        });
    return {
      ok: true,
      digest_id: normalizeIdValue(args.digestId),
      version_key: boundedText(args.versionKey, 128),
      state: args.outcome === "handled" ? "handled" : "pending",
    };
  },
});

export const runCommunityAgentHeartbeatInternal = internalAction({
  args: {
    communityId: v.id("communities"),
    communityLifecycleGeneration: v.optional(v.number()),
    heartbeatId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    maxToolSteps: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const heartbeatId = boundedText(args.heartbeatId, 200) || buildHeartbeatId(args.communityId, Date.now());
    const modelId = boundedText(args.modelId, 128) || undefined;
    const communityLifecycleGeneration = normalizeCommunityLifecycleGeneration(
      args.communityLifecycleGeneration,
    );
    const operationalAssessment = (await ctx.runQuery(
      internalRefs.communityAgentHeartbeat.assessCommunityAgentCycleInternal,
      { communityId: args.communityId, communityLifecycleGeneration },
    )) as Record<string, any>;
    const initialLifecycleStopReason = heartbeatLifecycleStopReason(
      operationalAssessment.reason,
    );
    if (initialLifecycleStopReason) {
      const stopReason = initialLifecycleStopReason;
      return {
        ok: true,
        skipped: true,
        run: null,
        stop_reason: stopReason,
        tool_step_count: 0,
        applied_change_request_ids: [],
        wake_reason: stopReason,
        wake_evidence: null,
      };
    }
    await ctx.runMutation(
      internalRefs.communityCompilerEvidence.drainSelfAuthoredPendingSourceTracesInternal,
      {
        communityId: args.communityId,
      },
    );
    const assessment = (await ctx.runQuery(
      internalRefs.communityAgentHeartbeat.assessCommunityAgentCycleInternal,
      { communityId: args.communityId, communityLifecycleGeneration },
    )) as Record<string, any>;
    const finalLifecycleStopReason = heartbeatLifecycleStopReason(
      assessment.reason,
    );
    if (finalLifecycleStopReason) {
      return {
        ok: true,
        skipped: true,
        run: null,
        stop_reason: finalLifecycleStopReason,
        tool_step_count: 0,
        applied_change_request_ids: [],
        wake_reason: finalLifecycleStopReason,
        wake_evidence: null,
      };
    }
    const compilerEvidence = assessment.compiler_evidence ?? {};
    const initialWakeEvidence = {
      ...wakeEvidenceFromMeasurement(compilerEvidence, {
        digestId: assessment.pending_handoff_id,
        versionKey: assessment.pending_handoff_version_key,
        itemCount: assessment.pending_handoff_item_count,
      }),
      reason: boundedText(assessment.reason, 120) || "no_compiler_work",
    };
    const recordSkipped = async (reason: string, wakeEvidence = initialWakeEvidence) => {
      const skippedRun = await ctx.runMutation(
        internalRefs.communityAgentRuntime.recordCommunityAgentSkippedRunInternal,
        {
          communityId: args.communityId,
          triggerType: "heartbeat",
          heartbeatId,
          modelId,
          wakeReason: reason,
          wakeEvidence: { ...wakeEvidence, reason },
        },
      );
      return {
        ok: true,
        skipped: true,
        run: skippedRun,
        stop_reason: reason,
        tool_step_count: 0,
        applied_change_request_ids: [],
        wake_reason: reason,
        wake_evidence: { ...wakeEvidence, reason },
      };
    };
    if (!assessment.enqueue) {
      return await recordSkipped(initialWakeEvidence.reason);
    }
    if (compilerEvidence.should_run) {
      try {
        await ctx.runMutation(
          internalRefs.communityCompilerDigest.runCommunityCompilerDigestPassInternal,
          { communityId: args.communityId, requireTrigger: true },
        );
      } catch {
        if (!assessment.has_pending_handoff) {
          return await recordSkipped("compiler_digest_failed");
        }
      }
    }
    const claim = (await ctx.runMutation(
      internalRefs.communityAgentHeartbeat.claimCommunityCompilerDigestHandoffInternal,
      {
        communityId: args.communityId,
        claimId: heartbeatId,
      },
    )) as Record<string, any>;
    if (!claim.claimed) {
      return await recordSkipped(boundedText(claim.reason, 120) || "no_pending_compiler_handoff");
    }
    const wakeEvidence = {
      ...wakeEvidenceFromMeasurement(compilerEvidence, {
        digestId: claim.digest_id,
        versionKey: claim.version_key,
        itemCount: claim.item_count,
      }),
      reason: boundedText(assessment.reason, 120) || "pending_compiler_handoff",
    };
    try {
      const cycle = (await ctx.runAction(
        internalRefs.communityAgentRuntime.runCommunityAgentCycleInternal,
        {
          communityId: args.communityId,
          communityLifecycleGeneration,
          triggerType: "heartbeat",
          heartbeatId,
          modelId,
          maxToolSteps: clampToolSteps(args.maxToolSteps),
          compilerDigestId: claim.digest_id,
          compilerDigestVersionKey: claim.version_key,
          wakeReason: wakeEvidence.reason,
          wakeEvidence,
        },
      )) as Record<string, any>;
      const handled = cycle.ok === true && cycle.completed === true;
      await ctx.runMutation(
        internalRefs.communityAgentHeartbeat.settleCommunityCompilerDigestHandoffInternal,
        {
          communityId: args.communityId,
          digestId: claim.digest_id,
          versionKey: claim.version_key,
          claimId: heartbeatId,
          outcome: handled ? "handled" : "retry",
        },
      );
      return {
        ...cycle,
        compiler_digest_id: claim.digest_id,
        compiler_digest_version_key: claim.version_key,
        compiler_handoff_state: handled ? "handled" : "pending",
        wake_reason: wakeEvidence.reason,
        wake_evidence: wakeEvidence,
      };
    } catch (error) {
      try {
        await ctx.runMutation(
          internalRefs.communityAgentHeartbeat.settleCommunityCompilerDigestHandoffInternal,
          {
            communityId: args.communityId,
            digestId: claim.digest_id,
            versionKey: claim.version_key,
            claimId: heartbeatId,
            outcome: "retry",
          },
        );
      } catch {
        // The lease makes an orphaned running claim retryable.
      }
      throw error;
    }
  },
});

// ---------------------------------------------------------------------------
// Ignition: the 6-hour memory sweep. The sweep only discovers work and
// schedules heartbeats. The heartbeat owns compile -> claim -> run -> settle.
// ---------------------------------------------------------------------------

export const listCommunityMemorySweepTargetsInternal = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(1000, Math.floor(Number(args.limit ?? 500))));
    const lifecycleRows = await Promise.all(
      ([undefined, "active"] as const).map((lifecycleStatus) =>
        ctx.db
          .query("communities" as any)
          .withIndex("by_lifecycle_updatedAt", (q: any) => q.eq("lifecycleStatus", lifecycleStatus))
          .order("desc")
          .take(limit) as Promise<Array<Record<string, any>>>,
      ),
    );
    const rows = Array.from(
      new Map(lifecycleRows.flat().map((row) => [normalizeIdValue(row._id), row])).values(),
    )
      .sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0))
      .slice(0, limit);
    return rows.map((row) => ({
      communityId: normalizeIdValue(row._id),
    }));
  },
});

// One read-only planner for both the sweep preflight and the heartbeat's final
// cost gate. Compiler evidence means the compiler has work. A pending or stale
// digest handoff means the agent has work. Raw source timestamps are neither.
export const assessCommunityAgentCycleInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    communityLifecycleGeneration: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const expectedLifecycleGeneration =
      args.communityLifecycleGeneration === undefined
        ? undefined
        : normalizeCommunityLifecycleGeneration(args.communityLifecycleGeneration);
    const controlGate = await readCommunityAgentControlGate({
      ctx,
      communityId: args.communityId,
      nowMs,
    });
    const controlReason = controlGate.reason ??
      (expectedLifecycleGeneration !== undefined &&
      controlGate.lifecycleGeneration !== expectedLifecycleGeneration
        ? COMMUNITY_LIFECYCLE_GENERATION_STALE_ERROR
        : null);
    if (controlReason) {
      return {
        enqueue: false,
        reason: controlReason,
        cycles_today: controlGate.cyclesToday,
        has_pending_handoff: false,
        pending_handoff_id: null,
        pending_handoff_version_key: null,
        pending_handoff_item_count: 0,
        compiler_evidence: {
          should_run: false,
          reason: "not_measured_control_gate",
          pending_total: 0,
          pending_standard: 0,
          pending_strong: 0,
          pending_critical: 0,
          oldest_pending_at: null,
          has_more_pending: false,
          counts_are_lower_bound: false,
        },
      };
    }
    const [pendingHandoffs, runningHandoffs, compilerEvidenceResult] = await Promise.all([
      listCurrentGenerationHandoffs({
        ctx,
        communityId: args.communityId,
        lifecycleGeneration: controlGate.lifecycleGeneration,
        state: "pending",
        limit: 20,
      }),
      listCurrentGenerationHandoffs({
        ctx,
        communityId: args.communityId,
        lifecycleGeneration: controlGate.lifecycleGeneration,
        state: "running",
        limit: 20,
      }),
      measureCommunityCompilerEvidenceForCommunity({
        ctx,
        communityId: args.communityId,
        nowMs,
      }),
    ]);
    const pendingHandoff = pendingHandoffs[0] ?? null;
    const compilerEvidence = compilerEvidenceResult.measurement;
    const freshRunningHandoff = runningHandoffs.find(
      (row) => Number(row.agentClaimedAt ?? 0) >= nowMs - COMMUNITY_AGENT_HANDOFF_LEASE_MS,
    ) ?? null;
    const staleRunningHandoff = runningHandoffs.find(
      (row) => Number(row.agentClaimedAt ?? 0) < nowMs - COMMUNITY_AGENT_HANDOFF_LEASE_MS,
    ) ?? null;
    const plannedHandoff = [pendingHandoff, staleRunningHandoff]
      .filter((row): row is Record<string, any> => Boolean(row))
      .sort((a, b) => Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0))[0] ?? null;
    const base = {
      compiler_evidence: compilerEvidence,
      cycles_today: controlGate.cyclesToday,
      has_pending_handoff: Boolean(plannedHandoff),
      pending_handoff_id: plannedHandoff ? normalizeIdValue(plannedHandoff._id) : null,
      pending_handoff_version_key: boundedText(plannedHandoff?.versionKey, 128) || null,
      pending_handoff_item_count: Math.max(0, Number(plannedHandoff?.itemCount ?? 0)),
    };
    if (freshRunningHandoff) {
      return { ...base, enqueue: false, reason: "handoff_already_running" };
    }
    if (plannedHandoff) {
      return { ...base, enqueue: true, reason: "pending_compiler_handoff" };
    }
    if (compilerEvidence.should_run) {
      return { ...base, enqueue: true, reason: compilerEvidence.reason };
    }
    return { ...base, enqueue: false, reason: "no_compiler_work" };
  },
});

export const runCommunityMemorySweepInternal = internalAction({
  args: {
    limitCommunities: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const targets = (await ctx.runQuery(internalRefs.communityAgentHeartbeat.listCommunityMemorySweepTargetsInternal, {
      limit: args.limitCommunities,
    })) as Array<{ communityId: string }>;
    let enqueued = 0;
    let metabolized = 0;
    const skipped: Record<string, number> = {};
    for (const target of targets) {
      // Mechanical memory metabolism is independent of paid cognition work.
      try {
        const metabolizerResult = (await ctx.runMutation(
          internalRefs.communityMemoryMetabolizer.settleCommunityMemorySignalsInternal,
          {
            communityId: target.communityId,
            trigger: "sweep",
          },
        )) as Record<string, any>;
        if (Number(metabolizerResult.settled_node_count ?? 0) > 0) metabolized += 1;
      } catch (error) {
        // Score settlement is mechanical memory metabolism; it should not
        // block the heartbeat's evidence gate or role cycle.
        try {
          await ctx.runMutation(
            internalRefs.communityMemoryMetabolizer.recordCommunityMemoryMetabolizerErrorRunInternal,
            {
              communityId: target.communityId,
              trigger: "sweep",
              errorCode: error instanceof Error ? error.message.slice(0, 120) : "community_metabolizer_error",
              errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
            },
          );
        } catch {
          // Error ledger failure must not block the heartbeat either.
        }
      }
      const assessment = (await ctx.runQuery(internalRefs.communityAgentHeartbeat.assessCommunityAgentCycleInternal, {
        communityId: target.communityId,
      })) as { enqueue: boolean; reason: string };
      if (!assessment.enqueue) {
        skipped[assessment.reason] = (skipped[assessment.reason] ?? 0) + 1;
        continue;
      }
      await ctx.runMutation(internalRefs.communityAgentHeartbeat.enqueueCommunityAgentHeartbeatInternal, {
        communityId: target.communityId,
        runAfterMs: 0,
      });
      enqueued += 1;
    }
    return { ok: true, targets: targets.length, enqueued, metabolized, skipped };
  },
});
