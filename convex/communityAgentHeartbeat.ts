import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { normalizeIdValue } from "./communityCore";
import {
  buildCommunitySourceTraceRevision,
  measureCommunityCompilerEvidenceForCommunity,
} from "./communityCompilerEvidenceCore";
import {
  communitySourceTraceRowHasCurrentCanonicalEvidence,
} from "./communityDerivedEvidenceReadability";

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
    if (!await communitySourceTraceRowHasCurrentCanonicalEvidence({
      ctx,
      communityId,
      trace,
    })) {
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
    reason: config?.agentEnabled === false
      ? "agent_disabled"
      : cyclesToday >= COMMUNITY_AGENT_CYCLES_PER_DAY_CAP
        ? "daily_cycle_cap_reached"
        : null,
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
    const runningRows = (await ctx.db
      .query("communityCompilerDigests" as any)
      .withIndex("by_community_agentHandoffState_createdAt", (q: any) =>
        q.eq("communityId", args.communityId).eq("agentHandoffState", "running"),
      )
      .order("asc")
      .take(20)) as Array<Record<string, any>>;
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
    const pendingRows = (await ctx.db
      .query("communityCompilerDigests" as any)
      .withIndex("by_community_agentHandoffState_createdAt", (q: any) =>
        q.eq("communityId", args.communityId).eq("agentHandoffState", "pending"),
      )
      .order("asc")
      .take(20)) as Array<Record<string, any>>;
    const staleRunning = runningRows.find(
      (row) => Number(row.agentClaimedAt ?? 0) < nowMs - COMMUNITY_AGENT_HANDOFF_LEASE_MS,
    ) ?? null;
    const candidates = [...pendingRows, staleRunning]
      .filter((row): row is Record<string, any> => Boolean(row))
      .sort((a, b) => Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0));
    for (const digest of candidates) {
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
    if (args.outcome === "handled") {
      await ctx.scheduler.runAfter(
        0,
        internalRefs.communityCompilerDigest.runCommunityCompilerDigestPassInternal,
        {
          communityId: args.communityId,
          requireTrigger: true,
        },
      );
    }
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
    heartbeatId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    maxToolSteps: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const heartbeatId = boundedText(args.heartbeatId, 200) || buildHeartbeatId(args.communityId, Date.now());
    const modelId = boundedText(args.modelId, 128) || undefined;
    await ctx.runMutation(
      internalRefs.communityCompilerEvidence.drainSelfAuthoredPendingSourceTracesInternal,
      {
        communityId: args.communityId,
      },
    );
    const assessment = (await ctx.runQuery(
      internalRefs.communityAgentHeartbeat.assessCommunityAgentCycleInternal,
      { communityId: args.communityId },
    )) as Record<string, any>;
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
    const resolved = (await ctx.runQuery(
      internalRefs.communityAgentRuntime.resolveCommunityAgentRunContextInternal,
      { communityId: args.communityId },
    )) as Record<string, any>;
    const connection = (await ctx.runQuery(
      internalRefs.providerConnections.getChatgptConnectionForUserInternal,
      { userId: resolved.sponsorUserId },
    )) as Record<string, any> | null;
    if (!connection?.encryptedSecretHex) {
      return await recordSkipped("owner_connection_missing");
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
    const rows = (await ctx.db.query("communities" as any).take(limit)) as Array<Record<string, any>>;
    return rows
      .filter((row) => Boolean(row.ownerId))
      .map((row) => ({
        communityId: normalizeIdValue(row._id),
        ownerId: normalizeIdValue(row.ownerId),
      }));
  },
});

// One read-only planner for both the sweep preflight and the heartbeat's final
// cost gate. Compiler evidence means the compiler has work. A pending or stale
// digest handoff means the agent has work. Raw source timestamps are neither.
export const assessCommunityAgentCycleInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const controlGate = await readCommunityAgentControlGate({
      ctx,
      communityId: args.communityId,
      nowMs,
    });
    if (controlGate.reason) {
      return {
        enqueue: false,
        reason: controlGate.reason,
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
    const [pendingHandoff, runningHandoffs, compilerEvidenceResult] = await Promise.all([
      ctx.db
        .query("communityCompilerDigests" as any)
        .withIndex("by_community_agentHandoffState_createdAt", (q: any) =>
          q.eq("communityId", args.communityId).eq("agentHandoffState", "pending"),
        )
        .order("asc")
        .first() as Promise<Record<string, any> | null>,
      ctx.db
        .query("communityCompilerDigests" as any)
        .withIndex("by_community_agentHandoffState_createdAt", (q: any) =>
          q.eq("communityId", args.communityId).eq("agentHandoffState", "running"),
        )
        .order("asc")
        .take(20) as Promise<Array<Record<string, any>>>,
      measureCommunityCompilerEvidenceForCommunity({
        ctx,
        communityId: args.communityId,
        nowMs,
      }),
    ]);
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
    })) as Array<{ communityId: string; ownerId: string }>;
    let enqueued = 0;
    const skipped: Record<string, number> = {};
    for (const target of targets) {
      const assessment = (await ctx.runQuery(internalRefs.communityAgentHeartbeat.assessCommunityAgentCycleInternal, {
        communityId: target.communityId,
      })) as { enqueue: boolean; reason: string };
      if (!assessment.enqueue) {
        skipped[assessment.reason] = (skipped[assessment.reason] ?? 0) + 1;
        continue;
      }
      // Founder-funded: no usable owner connection means no cycle, checked
      // cheaply here and rechecked by the heartbeat immediately before work.
      const connection = (await ctx.runQuery(internalRefs.providerConnections.getChatgptConnectionForUserInternal, {
        userId: target.ownerId,
      })) as Record<string, any> | null;
      if (!connection?.encryptedSecretHex) {
        skipped.owner_connection_missing = (skipped.owner_connection_missing ?? 0) + 1;
        continue;
      }
      await ctx.runMutation(internalRefs.communityAgentHeartbeat.enqueueCommunityAgentHeartbeatInternal, {
        communityId: target.communityId,
        runAfterMs: 0,
      });
      enqueued += 1;
    }
    return { ok: true, targets: targets.length, enqueued, skipped };
  },
});
