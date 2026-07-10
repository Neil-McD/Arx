import { normalizeIdValue, toIsoString } from "./communityCore";

export const COMPILER_EVIDENCE_BATCH_THRESHOLD = 20;
export const COMPILER_EVIDENCE_STRONG_THRESHOLD = 5;
export const COMPILER_EVIDENCE_AGE_THRESHOLD_MS = 72 * 60 * 60 * 1000;
export const COMPILER_EVIDENCE_RUN_LIMIT = 100;
export const COMPILER_EVIDENCE_SCAN_LIMIT = 500;
export const COMPILER_EVIDENCE_VISIBILITY_SCOPES = ["admin", "community", "public"] as const;
export const COMMUNITY_AGENT_SELF_AUTHORED_TRACE_AGENT_KEY = "community_agent";
export const COMPILER_DIGEST_SIGNAL_SOURCE_ID_PREFIX = "community_compiler_digest_signal:";

export type EvidencePriority = "standard" | "strong" | "critical";
export type SourceTraceCompilerState =
  | "pending"
  | "compiled"
  | "dismissed_low_signal"
  | "carried_forward"
  | "excluded_by_visibility"
  | "excluded_self_authored";
type CompilerEligibleVisibility = typeof COMPILER_EVIDENCE_VISIBILITY_SCOPES[number];
type TriggerReason =
  | "critical_evidence"
  | "strong_evidence_threshold"
  | "batch_threshold"
  | "oldest_pending_age"
  | "no_trigger";

export type SourceTraceRow = {
  _id: any;
  communityId: any;
  sourceType: string;
  sourceId?: string;
  title?: string;
  summary: string;
  visibilityScope: string;
  sourceVisibility: string;
  workflowId?: string;
  artifactIds?: string[];
  outcomeObservationIds?: any[];
  actorType: string;
  actorUserId?: any;
  actorAgentKey?: string;
  compilerState?: SourceTraceCompilerState;
  compilerPendingSince?: number;
  compilerLastHandledAt?: number;
  compilerLastDigestId?: any;
  createdAt: number;
  updatedAt: number;
};

export function isCommunityCompilerEligibleVisibility(visibilityScope: string): visibilityScope is CompilerEligibleVisibility {
  return COMPILER_EVIDENCE_VISIBILITY_SCOPES.includes(visibilityScope as CompilerEligibleVisibility);
}

export function compilerStateForSourceTraceVisibility(visibilityScope: string): SourceTraceCompilerState {
  return isCommunityCompilerEligibleVisibility(visibilityScope) ? "pending" : "excluded_by_visibility";
}

export function isCommunityAgentSelfAuthoredTrace(row: { actorAgentKey?: string }): boolean {
  return String(row.actorAgentKey ?? "").trim() === COMMUNITY_AGENT_SELF_AUTHORED_TRACE_AGENT_KEY;
}

export function compilerStateForSourceTraceLifecycle(args: {
  visibilityScope: string;
  actorAgentKey?: string;
}): SourceTraceCompilerState {
  if (isCommunityAgentSelfAuthoredTrace(args)) return "excluded_self_authored";
  return compilerStateForSourceTraceVisibility(args.visibilityScope);
}

export function isCommunityCompilerEvidenceTrace(row: {
  visibilityScope: string;
  actorAgentKey?: string;
}): boolean {
  return !isCommunityAgentSelfAuthoredTrace(row) && isCommunityCompilerEligibleVisibility(row.visibilityScope);
}

function compilerState(row: SourceTraceRow): SourceTraceCompilerState {
  return row.compilerState ?? compilerStateForSourceTraceLifecycle(row);
}

export function compilerPendingSince(row: SourceTraceRow): number {
  if (typeof row.compilerPendingSince === "number") return row.compilerPendingSince;
  return row.createdAt;
}

function containsCriticalLanguage(row: SourceTraceRow): boolean {
  const text = `${row.title ?? ""} ${row.summary ?? ""}`.toLowerCase();
  return /\b(failed|failure|blocker|blocked|wrong|stale|contradict|contradiction|regression|broken|invalid|unsafe)\b/.test(text);
}

function classifyEvidencePriority(row: SourceTraceRow): EvidencePriority {
  if (
    row.actorType === "compiler" &&
    String(row.sourceId ?? "").startsWith(COMPILER_DIGEST_SIGNAL_SOURCE_ID_PREFIX)
  ) {
    return row.sourceType === "outcome" ? "critical" : "strong";
  }
  if (row.sourceType === "outcome" || row.sourceType === "feedback") return "critical";
  if (containsCriticalLanguage(row)) return "critical";
  if (
    row.sourceType === "workflow_run" ||
    row.sourceType === "agent_run" ||
    row.sourceType === "transcript"
  ) {
    return "strong";
  }
  return "standard";
}

function priorityRank(priority: EvidencePriority): number {
  if (priority === "critical") return 0;
  if (priority === "strong") return 1;
  return 2;
}

function decideTrigger(args: {
  criticalCount: number;
  strongCount: number;
  totalCount: number;
  oldestPendingAt: number | null;
  nowMs: number;
}): TriggerReason {
  if (args.criticalCount >= 1) return "critical_evidence";
  if (args.strongCount >= COMPILER_EVIDENCE_STRONG_THRESHOLD) return "strong_evidence_threshold";
  if (args.totalCount >= COMPILER_EVIDENCE_BATCH_THRESHOLD) return "batch_threshold";
  if (args.oldestPendingAt !== null && args.nowMs - args.oldestPendingAt >= COMPILER_EVIDENCE_AGE_THRESHOLD_MS) {
    return "oldest_pending_age";
  }
  return "no_trigger";
}

function mapEvidenceUnit(row: SourceTraceRow, priority: EvidencePriority) {
  return {
    trace_id: normalizeIdValue(row._id),
    source_type: row.sourceType,
    source_id: row.sourceId ?? null,
    priority,
    title: row.title ?? null,
    workflow_id: row.workflowId ?? null,
    artifact_ids: row.artifactIds ?? [],
    outcome_observation_ids: (row.outcomeObservationIds ?? []).map(normalizeIdValue),
    compiler_state: compilerState(row),
    compiler_pending_since: toIsoString(compilerPendingSince(row)),
    compiler_last_handled_at: typeof row.compilerLastHandledAt === "number" ? toIsoString(row.compilerLastHandledAt) : null,
    compiler_last_digest_id: row.compilerLastDigestId ? normalizeIdValue(row.compilerLastDigestId) : null,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

function uniqueTraceRows(rows: SourceTraceRow[]): SourceTraceRow[] {
  const out: SourceTraceRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = normalizeIdValue(row._id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

export async function measureCommunityCompilerEvidenceForCommunity(args: {
  ctx: any;
  communityId: any;
  nowMs: number;
}) {
  const [pendingRowsByVisibility, legacyRowsByVisibility] = await Promise.all([
    Promise.all(
      COMPILER_EVIDENCE_VISIBILITY_SCOPES.map((visibilityScope) =>
        args.ctx.db
          .query("communitySourceTraces" as any)
          .withIndex("by_community_compilerState_visibility_pendingSince", (q: any) =>
            q
              .eq("communityId", args.communityId)
              .eq("compilerState", "pending")
              .eq("visibilityScope", visibilityScope),
          )
          .order("asc")
          .take(COMPILER_EVIDENCE_SCAN_LIMIT + 1) as Promise<SourceTraceRow[]>,
      ),
    ),
    Promise.all(
      COMPILER_EVIDENCE_VISIBILITY_SCOPES.map((visibilityScope) =>
        args.ctx.db
          .query("communitySourceTraces" as any)
          .withIndex("by_community_visibility_createdAt", (q: any) =>
            q.eq("communityId", args.communityId).eq("visibilityScope", visibilityScope),
          )
          .order("asc")
          .take(COMPILER_EVIDENCE_SCAN_LIMIT + 1) as Promise<SourceTraceRow[]>,
      ),
    ),
  ]);
  const pendingRowsFetch = pendingRowsByVisibility.flatMap((rows) => rows.slice(0, COMPILER_EVIDENCE_SCAN_LIMIT));
  const legacyRowsFetch = legacyRowsByVisibility.flatMap((rows) => rows.slice(0, COMPILER_EVIDENCE_SCAN_LIMIT));
  const legacyPendingRows = legacyRowsFetch.filter((row) =>
    row.compilerState === undefined && isCommunityCompilerEvidenceTrace(row)
  );
  const hasMorePending =
    pendingRowsByVisibility.some((rows) => rows.length > COMPILER_EVIDENCE_SCAN_LIMIT) ||
    legacyRowsByVisibility.some((rows) => rows.length > COMPILER_EVIDENCE_SCAN_LIMIT);
  const traceRows = uniqueTraceRows([
    ...pendingRowsFetch,
    ...legacyPendingRows,
  ])
    .filter((row) => compilerState(row) === "pending")
    .filter((row) => isCommunityCompilerEvidenceTrace(row))
    .sort((a, b) => compilerPendingSince(a) - compilerPendingSince(b) || a.createdAt - b.createdAt || a.updatedAt - b.updatedAt)
    .slice(0, COMPILER_EVIDENCE_SCAN_LIMIT);
  const pending = traceRows.map((row) => ({ row, priority: classifyEvidencePriority(row) }));

  const standardCount = pending.filter((item) => item.priority === "standard").length;
  const strongCount = pending.filter((item) => item.priority === "strong").length;
  const criticalCount = pending.filter((item) => item.priority === "critical").length;
  const oldestPendingAt = pending.length > 0
    ? Math.min(...pending.map((item) => Number(compilerPendingSince(item.row))).filter(Number.isFinite))
    : null;
  const reason = decideTrigger({
    criticalCount,
    strongCount,
    totalCount: pending.length,
    oldestPendingAt,
    nowMs: args.nowMs,
  });
  const selected = pending
    .slice()
    .sort((a, b) =>
      priorityRank(a.priority) - priorityRank(b.priority) ||
      compilerPendingSince(a.row) - compilerPendingSince(b.row) ||
      a.row.createdAt - b.row.createdAt
    )
    .slice(0, COMPILER_EVIDENCE_RUN_LIMIT);

  return {
    measurement: {
      ok: true,
      community_id: normalizeIdValue(args.communityId),
      measured_at: toIsoString(args.nowMs),
      should_run: reason !== "no_trigger",
      reason,
      pending_total: pending.length,
      pending_standard: standardCount,
      pending_strong: strongCount,
      pending_critical: criticalCount,
      oldest_pending_at: oldestPendingAt === null ? null : toIsoString(oldestPendingAt),
      has_more_pending: hasMorePending,
      counts_are_lower_bound: hasMorePending,
      selected_trace_ids: selected.map((item) => normalizeIdValue(item.row._id)),
      selected_evidence_units: selected.map((item) => mapEvidenceUnit(item.row, item.priority)),
      thresholds: {
        batch: COMPILER_EVIDENCE_BATCH_THRESHOLD,
        strong: COMPILER_EVIDENCE_STRONG_THRESHOLD,
        critical: 1,
        oldest_pending_age_hours: COMPILER_EVIDENCE_AGE_THRESHOLD_MS / (60 * 60 * 1000),
        run_limit: COMPILER_EVIDENCE_RUN_LIMIT,
        scan_limit: COMPILER_EVIDENCE_SCAN_LIMIT,
      },
    },
    selectedRows: selected.map((item) => item.row),
  };
}

export async function drainSelfAuthoredPendingSourceTracesForCommunity(args: {
  ctx: any;
  communityId: any;
  nowMs: number;
}): Promise<number> {
  let drained = 0;
  for (const visibilityScope of COMPILER_EVIDENCE_VISIBILITY_SCOPES) {
    const rows = (await args.ctx.db
      .query("communitySourceTraces" as any)
      .withIndex("by_community_compilerState_visibility_pendingSince", (q: any) =>
        q
          .eq("communityId", args.communityId)
          .eq("compilerState", "pending")
          .eq("visibilityScope", visibilityScope),
      )
      .order("asc")
      .take(COMPILER_EVIDENCE_SCAN_LIMIT)) as SourceTraceRow[];
    for (const row of rows) {
      if (!isCommunityAgentSelfAuthoredTrace(row)) continue;
      await args.ctx.db.patch(row._id as any, {
        compilerState: "excluded_self_authored" as const,
        compilerPendingSince: undefined,
        compilerLastHandledAt: args.nowMs,
        compilerLastDigestId: undefined,
        updatedAt: args.nowMs,
      });
      drained += 1;
    }
  }
  return drained;
}

export async function settleCommunityCompilerEvidenceForCycle(args: {
  ctx: any;
  communityId: any;
  evidence: Array<{ traceId: any; expectedUpdatedAt: number }>;
  compilerDigestId?: any;
  nowMs: number;
}) {
  const communityId = normalizeIdValue(args.communityId);
  if (args.compilerDigestId) {
    const digest = (await args.ctx.db.get(args.compilerDigestId as any)) as { communityId?: any } | null;
    if (!digest || normalizeIdValue(digest.communityId) !== communityId) {
      throw new Error("community_compiler_evidence_digest_not_found");
    }
  }

  const requestedEvidence: Array<{ traceId: any; expectedUpdatedAt: number }> = [];
  const seen = new Set<string>();
  for (const evidence of args.evidence) {
    const id = normalizeIdValue(evidence.traceId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    requestedEvidence.push({
      traceId: evidence.traceId,
      expectedUpdatedAt: Number(evidence.expectedUpdatedAt),
    });
    if (requestedEvidence.length >= COMPILER_EVIDENCE_RUN_LIMIT) break;
  }

  const rows: Array<{ row: SourceTraceRow; expectedUpdatedAt: number }> = [];
  for (const evidence of requestedEvidence) {
    const row = (await args.ctx.db.get(evidence.traceId as any)) as SourceTraceRow | null;
    if (!row || normalizeIdValue(row.communityId) !== communityId) {
      throw new Error("community_compiler_evidence_trace_not_found");
    }
    rows.push({ row, expectedUpdatedAt: evidence.expectedUpdatedAt });
  }

  const settledTraceIds: any[] = [];
  let alreadyTerminalCount = 0;
  let excludedSelfAuthoredCount = 0;
  let changedSinceSelectionCount = 0;
  for (const selection of rows) {
    const { row } = selection;
    if (isCommunityAgentSelfAuthoredTrace(row)) {
      if (compilerState(row) === "pending") {
        await args.ctx.db.patch(row._id as any, {
          compilerState: "excluded_self_authored" as const,
          compilerPendingSince: undefined,
          compilerLastHandledAt: args.nowMs,
          compilerLastDigestId: undefined,
        });
      }
      excludedSelfAuthoredCount += 1;
      continue;
    }
    if (compilerState(row) !== "pending") {
      alreadyTerminalCount += 1;
      continue;
    }
    if (!Number.isFinite(selection.expectedUpdatedAt) || row.updatedAt !== selection.expectedUpdatedAt) {
      changedSinceSelectionCount += 1;
      continue;
    }
    await args.ctx.db.patch(row._id as any, {
      compilerState: "compiled" as const,
      compilerPendingSince:
        typeof row.compilerPendingSince === "number" ? row.compilerPendingSince : row.createdAt,
      compilerLastHandledAt: args.nowMs,
      ...(args.compilerDigestId ? { compilerLastDigestId: args.compilerDigestId } : {}),
    });
    settledTraceIds.push(row._id);
  }

  return {
    ok: true,
    community_id: communityId,
    requested_count: requestedEvidence.length,
    settled_count: settledTraceIds.length,
    already_terminal_count: alreadyTerminalCount,
    excluded_self_authored_count: excludedSelfAuthoredCount,
    changed_since_selection_count: changedSinceSelectionCount,
    settled_trace_ids: settledTraceIds.map(normalizeIdValue),
  };
}
