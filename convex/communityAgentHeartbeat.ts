import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { normalizeIdValue } from "./communityCore";
import { COMPILER_EVIDENCE_VISIBILITY_SCOPES } from "./communityCompilerEvidenceCore";

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

function selectedEvidenceFromMeasurement(
  measurement: Record<string, any>,
): Array<{ traceId: string; expectedUpdatedAt: number }> {
  if (!Array.isArray(measurement.selected_evidence_units)) return [];
  const selected: Array<{ traceId: string; expectedUpdatedAt: number }> = [];
  const seen = new Set<string>();
  for (const unit of measurement.selected_evidence_units) {
    const traceId = boundedText(unit?.trace_id, 128);
    const expectedUpdatedAt = Date.parse(boundedText(unit?.updated_at, 80));
    if (!traceId || seen.has(traceId) || !Number.isFinite(expectedUpdatedAt)) continue;
    seen.add(traceId);
    selected.push({ traceId, expectedUpdatedAt });
    if (selected.length >= 100) break;
  }
  return selected;
}

export const enqueueCommunityAgentHeartbeatInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    heartbeatId: v.optional(v.string()),
    compilerDigestId: v.optional(v.id("communityCompilerDigests")),
    runAfterMs: v.optional(v.number()),
    modelId: v.optional(v.string()),
    maxToolSteps: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community) throw new Error("community_agent_heartbeat_community_not_found");
    if (args.compilerDigestId) {
      const digest = (await ctx.db.get(args.compilerDigestId)) as Record<string, any> | null;
      if (!digest || normalizeIdValue(digest.communityId) !== normalizeIdValue(args.communityId)) {
        throw new Error("community_agent_heartbeat_digest_not_found");
      }
    }
    const nowMs = args.nowMs ?? Date.now();
    const heartbeatId = boundedText(args.heartbeatId, 200) || buildHeartbeatId(args.communityId, nowMs);
    const runAfterMs = clampDelayMs(args.runAfterMs);
    await ctx.scheduler.runAfter(
      runAfterMs,
      internalRefs.communityAgentHeartbeat.runCommunityAgentHeartbeatInternal,
      {
        communityId: args.communityId,
        heartbeatId,
        compilerDigestId: args.compilerDigestId,
        modelId: boundedText(args.modelId, 128) || undefined,
        maxToolSteps: clampToolSteps(args.maxToolSteps),
      },
    );
    return {
      ok: true,
      community_id: normalizeIdValue(args.communityId),
      heartbeat_id: heartbeatId,
      compiler_digest_id: args.compilerDigestId ? normalizeIdValue(args.compilerDigestId) : null,
      scheduled_after_ms: runAfterMs,
    };
  },
});

export const runCommunityAgentHeartbeatInternal = internalAction({
  args: {
    communityId: v.id("communities"),
    heartbeatId: v.optional(v.string()),
    compilerDigestId: v.optional(v.id("communityCompilerDigests")),
    modelId: v.optional(v.string()),
    maxToolSteps: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const heartbeatId = boundedText(args.heartbeatId, 200) || undefined;
    const modelId = boundedText(args.modelId, 128) || undefined;
    await ctx.runMutation(
      internalRefs.communityCompilerEvidence.drainSelfAuthoredPendingSourceTracesInternal,
      {
        communityId: args.communityId,
      },
    );
    const compilerEvidence = (await ctx.runQuery(
      internalRefs.communityCompilerEvidence.measureCommunityCompilerEvidenceInternal,
      {
        communityId: args.communityId,
      },
    )) as Record<string, any>;
    const wakeEvidence = wakeEvidenceFromMeasurement(compilerEvidence);
    const selectedEvidence = selectedEvidenceFromMeasurement(compilerEvidence);
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
        accepted_change_request_ids: [],
        rejected_change_request_ids: [],
        applied_change_request_ids: [],
        wake_reason: wakeEvidence.reason,
        wake_evidence: wakeEvidence,
      };
    }
    // A woken heartbeat runs the full role cycle (observer -> questioner ->
    // steward over a shared ledger); the observer ends the cycle early when
    // the window holds no real signal.
    const cycleResult = (await ctx.runAction(internalRefs.communityAgentRuntime.runCommunityAgentCycleInternal, {
      communityId: args.communityId,
      triggerType: "heartbeat",
      heartbeatId,
      modelId,
      wakeReason: wakeEvidence.reason,
      wakeEvidence,
    })) as Record<string, any>;
    if (!cycleResult.evidence_processed) {
      return {
        ...cycleResult,
        evidence_settlement: {
          ok: true,
          skipped: true,
          reason: "cognition_cycle_did_not_process_evidence",
          requested_count: selectedEvidence.length,
          settled_count: 0,
        },
      };
    }
    try {
      const evidenceSettlement = await ctx.runMutation(
        internalRefs.communityCompilerEvidence.settleCommunityCompilerEvidenceCycleInternal,
        {
          communityId: args.communityId,
          evidence: selectedEvidence,
          compilerDigestId: args.compilerDigestId,
        },
      );
      return { ...cycleResult, evidence_settlement: evidenceSettlement };
    } catch (error) {
      return {
        ...cycleResult,
        ok: false,
        evidence_settlement: {
          ok: false,
          skipped: false,
          reason: "community_compiler_evidence_settlement_failed",
          requested_count: selectedEvidence.length,
          settled_count: 0,
          error_code: boundedText(
            error instanceof Error ? error.message : "community_compiler_evidence_settlement_failed",
            120,
          ),
        },
      };
    }
  },
});

// ---------------------------------------------------------------------------
// Ignition: the 6-hour memory sweep.
//
// Economics (contract Amendment v1.1): memory is founder-funded, so the sweep
// is gated three ways before any tokens can be spent — owner off-switch,
// daily cycle cap, and a delta check so unchanged signal never re-wakes the
// roles. The compiler pass itself is deterministic (no LLM) and free.
// ---------------------------------------------------------------------------

const COMMUNITY_AGENT_CYCLES_PER_DAY_CAP = 2;
const COMMUNITY_AGENT_SWEEP_HEARTBEAT_DELAY_MS = 10 * 60 * 1000;

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

// Decides whether a community earns a cycle attempt this sweep. Pure reads.
export const assessCommunityAgentCycleInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args): Promise<{ enqueue: boolean; reason: string }> => {
    // Owner off-switch (absent config or absent flag means enabled).
    const configRows = (await ctx.db
      .query("communityAgentConfigs" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .take(5)) as Array<Record<string, any>>;
    const config = configRows
      .slice()
      .sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0))[0] ?? null;
    if (config?.agentEnabled === false) {
      return { enqueue: false, reason: "agent_disabled" };
    }
    // Daily cap: count observer-role heartbeat runs since UTC midnight. Every
    // attempted cycle counts, so an erroring community cannot burn extra spend.
    const dayStartMs = new Date(new Date().toISOString().slice(0, 10)).getTime();
    const recentRuns = (await ctx.db
      .query("communityAgentRuns" as any)
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId))
      .order("desc")
      .take(60)) as Array<Record<string, any>>;
    const cyclesToday = recentRuns.filter(
      (row) =>
        row.role === "observer" &&
        row.triggerType === "heartbeat" &&
        Number(row.createdAt ?? 0) >= dayStartMs,
    ).length;
    if (cyclesToday >= COMMUNITY_AGENT_CYCLES_PER_DAY_CAP) {
      return { enqueue: false, reason: "daily_cycle_cap_reached" };
    }
    // Pending evidence is unfinished work. It must be allowed to retry even if
    // an earlier observer succeeded before a later role or settlement failed.
    // This only earns the free digest + delayed knock; the heartbeat's evidence
    // thresholds still decide whether any model tokens are spent.
    const pendingEvidenceRows = await Promise.all(
      COMPILER_EVIDENCE_VISIBILITY_SCOPES.map((visibilityScope) =>
        ctx.db
          .query("communitySourceTraces" as any)
          .withIndex("by_community_compilerState_visibility_pendingSince", (q: any) =>
            q
              .eq("communityId", args.communityId)
              .eq("compilerState", "pending")
              .eq("visibilityScope", visibilityScope),
          )
          .order("asc")
          .first() as Promise<Record<string, any> | null>,
      ),
    );
    if (pendingEvidenceRows.some(Boolean)) {
      return { enqueue: true, reason: "pending_evidence" };
    }
    // Delta gate: only new raw learning signal since the last successful
    // observer pass earns a wake. This intentionally looks at the archive and
    // outcome lanes too, because the free digest pass is what bridges those
    // signals into source traces for the heartbeat evidence gate.
    const [newestTrace, newestArchiveDoc, newestOutcome] = await Promise.all([
      ctx.db
        .query("communitySourceTraces" as any)
        .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId))
        .order("desc")
        .first() as Promise<Record<string, any> | null>,
      ctx.db
        .query("communityArchiveDocuments" as any)
        .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId))
        .order("desc")
        .first() as Promise<Record<string, any> | null>,
      ctx.db
        .query("communityOutcomeObservations" as any)
        .withIndex("by_community_observedAt", (q: any) => q.eq("communityId", args.communityId))
        .order("desc")
        .first() as Promise<Record<string, any> | null>,
    ]);
    const newestSignalAt = Math.max(
      Number(newestTrace?.createdAt ?? 0),
      Number(newestArchiveDoc?.createdAt ?? 0),
      Number(newestArchiveDoc?.updatedAt ?? 0),
      Number(newestOutcome?.observedAt ?? 0),
      Number(newestOutcome?.createdAt ?? 0),
    );
    if (!Number.isFinite(newestSignalAt) || newestSignalAt <= 0) {
      return { enqueue: false, reason: "no_source_traces" };
    }
    const lastOkObserver = recentRuns.find((row) => row.role === "observer" && row.status === "ok");
    if (lastOkObserver && newestSignalAt <= Number(lastOkObserver.startedAt ?? 0)) {
      return { enqueue: false, reason: "no_new_signal" };
    }
    return { enqueue: true, reason: lastOkObserver ? "new_signal" : "first_cycle" };
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
    let metabolized = 0;
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
      // cheaply (row existence, no decryption, no refresh).
      const connection = (await ctx.runQuery(internalRefs.providerConnections.getChatgptConnectionForUserInternal, {
        userId: target.ownerId,
      })) as Record<string, any> | null;
      if (!connection?.encryptedSecretHex) {
        skipped.owner_connection_missing = (skipped.owner_connection_missing ?? 0) + 1;
        continue;
      }
      // Fresh digest first (free), then the cycle knock 10 minutes behind so
      // the roles always wake to current material. The evidence gate inside
      // the heartbeat still has the final word.
      let compilerDigestId: string | undefined;
      try {
        const digest = (await ctx.runMutation(internalRefs.communityCompilerDigest.runCommunityCompilerDigestPassInternal, {
          communityId: target.communityId,
        })) as Record<string, any>;
        compilerDigestId = boundedText(digest?.id, 128) || undefined;
      } catch {
        // A failed digest pass should not block the knock; the gate decides.
      }
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
      await ctx.runMutation(internalRefs.communityAgentHeartbeat.enqueueCommunityAgentHeartbeatInternal, {
        communityId: target.communityId,
        compilerDigestId,
        runAfterMs: COMMUNITY_AGENT_SWEEP_HEARTBEAT_DELAY_MS,
      });
      enqueued += 1;
    }
    return { ok: true, targets: targets.length, enqueued, metabolized, skipped };
  },
});
