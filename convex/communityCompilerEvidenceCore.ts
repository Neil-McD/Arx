import { normalizeIdValue, toIsoString } from "./communityCore";
import { interactionTraceHasSharedSource } from "./communityInteractionEvidenceCore";
export { buildCommunitySourceTraceRevision } from "../shared/communitySourceTraceRevision.ts";

export const COMPILER_EVIDENCE_BATCH_THRESHOLD = 8;
export const COMPILER_EVIDENCE_STRONG_THRESHOLD = 5;
// One eligible shared post becomes memory the same day in a small community; the
// six-hour sweep, daily cycle cap and funding gate still bound cost.
export const COMPILER_EVIDENCE_AGE_THRESHOLD_MS = 6 * 60 * 60 * 1000;
export const COMPILER_EVIDENCE_PACKET_LIMIT = 8;
export const COMPILER_EVIDENCE_TRACES_PER_PACKET_LIMIT = 12;
export const COMPILER_EVIDENCE_RUN_LIMIT =
  COMPILER_EVIDENCE_PACKET_LIMIT * COMPILER_EVIDENCE_TRACES_PER_PACKET_LIMIT;
export const COMPILER_EVIDENCE_SCAN_LIMIT = 500;
export const COMPILER_EVIDENCE_VISIBILITY_SCOPES = ["admin", "community", "public"] as const;
export const COMMUNITY_AGENT_SELF_AUTHORED_TRACE_AGENT_KEY = "community_agent";

export type EvidencePriority = "standard" | "strong" | "critical";
export type SourceTraceCompilerState =
  | "pending"
  | "compiled"
  | "dismissed_low_signal"
  | "carried_forward"
  | "excluded_by_visibility"
  | "excluded_self_authored"
  | "agent_retries_exhausted";
type CompilerEligibleVisibility = typeof COMPILER_EVIDENCE_VISIBILITY_SCOPES[number];
type TriggerReason =
  | "critical_evidence"
  | "bounded_continuation"
  | "full_packet"
  | "strong_evidence_threshold"
  | "batch_threshold"
  | "oldest_pending_age"
  | "no_trigger";

export type SourceTraceRow = {
  _id: any;
  communityId: any;
  channelId?: any;
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
  compilerGroupKey?: string;
  compilerContinuationReady?: boolean;
  compilerState?: SourceTraceCompilerState;
  compilerPendingSince?: number;
  compilerLastHandledAt?: number;
  compilerLastDigestId?: any;
  compilerDecision?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export function isCommunityCompilerEligibleVisibility(visibilityScope: string): visibilityScope is CompilerEligibleVisibility {
  return COMPILER_EVIDENCE_VISIBILITY_SCOPES.includes(visibilityScope as CompilerEligibleVisibility);
}

export function compilerStateForSourceTraceVisibility(
  visibilityScope: string,
  sourceVisibility = visibilityScope,
): SourceTraceCompilerState {
  return (
    isCommunityCompilerEligibleVisibility(visibilityScope) &&
    sourceVisibility !== "private" &&
    sourceVisibility !== "redacted"
  ) ? "pending" : "excluded_by_visibility";
}

export function isCommunityAgentSelfAuthoredTrace(row: { actorAgentKey?: string }): boolean {
  return String(row.actorAgentKey ?? "").trim() === COMMUNITY_AGENT_SELF_AUTHORED_TRACE_AGENT_KEY;
}

export function compilerStateForSourceTraceLifecycle(args: {
  visibilityScope: string;
  sourceVisibility?: string;
  actorAgentKey?: string;
}): SourceTraceCompilerState {
  if (isCommunityAgentSelfAuthoredTrace(args)) return "excluded_self_authored";
  return compilerStateForSourceTraceVisibility(args.visibilityScope, args.sourceVisibility);
}

export function isCommunityCompilerEvidenceTrace(row: {
  sourceType: string;
  visibilityScope: string;
  sourceVisibility?: string;
  actorAgentKey?: string;
}): boolean {
  return (
    row.sourceType !== "ai_feed" &&
    !isCommunityAgentSelfAuthoredTrace(row) &&
    compilerStateForSourceTraceVisibility(row.visibilityScope, row.sourceVisibility) === "pending"
  );
}

function compilerState(row: SourceTraceRow): SourceTraceCompilerState {
  return row.compilerState ?? compilerStateForSourceTraceLifecycle(row);
}

export function compilerPendingSince(row: SourceTraceRow): number {
  if (typeof row.compilerPendingSince === "number") return row.compilerPendingSince;
  return row.createdAt;
}

function classifyEvidencePriority(row: SourceTraceRow): EvidencePriority {
  if (row.sourceType === "outcome" || row.sourceType === "feedback") return "critical";
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

function admissionRank(item: PendingEvidence): number {
  if (item.priority === "critical") return 0;
  if (item.row.compilerContinuationReady === true) return 1;
  if (item.priority === "strong") return 2;
  return 3;
}

function decideTrigger(args: {
  criticalCount: number;
  continuationCount: number;
  strongCount: number;
  totalCount: number;
  largestPacketSize: number;
  oldestPendingAt: number | null;
  nowMs: number;
}): TriggerReason {
  if (args.criticalCount >= 1) return "critical_evidence";
  if (args.continuationCount >= 1) return "bounded_continuation";
  if (args.largestPacketSize >= COMPILER_EVIDENCE_TRACES_PER_PACKET_LIMIT) return "full_packet";
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
    compiler_group_key: compilerGroupKey(row),
    compiler_continuation_ready: row.compilerContinuationReady === true,
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

function compilerGroupKey(row: SourceTraceRow): string {
  const explicit = String(row.compilerGroupKey ?? "").trim();
  return explicit || `source_trace:${normalizeIdValue(row._id)}`;
}

type PendingEvidence = { row: SourceTraceRow; priority: EvidencePriority };
type EvidencePacket = {
  key: string;
  priority: EvidencePriority;
  admissionRank: number;
  oldestPendingAt: number;
  items: PendingEvidence[];
};

function groupPendingEvidence(pending: PendingEvidence[]): EvidencePacket[] {
  const byKey = new Map<string, PendingEvidence[]>();
  for (const item of pending) {
    const key = compilerGroupKey(item.row);
    const bucket = byKey.get(key) ?? [];
    bucket.push(item);
    byKey.set(key, bucket);
  }
  return Array.from(byKey.entries()).map(([key, items]) => {
    const sortedItems = items.slice().sort((a, b) =>
      admissionRank(a) - admissionRank(b) ||
      compilerPendingSince(a.row) - compilerPendingSince(b.row) ||
      a.row.createdAt - b.row.createdAt ||
      normalizeIdValue(a.row._id).localeCompare(normalizeIdValue(b.row._id))
    );
    return {
      key,
      priority: sortedItems.reduce<EvidencePriority>(
        (best, item) => priorityRank(item.priority) < priorityRank(best) ? item.priority : best,
        "standard",
      ),
      admissionRank: Math.min(...sortedItems.map(admissionRank)),
      oldestPendingAt: Math.min(...sortedItems.map((item) => compilerPendingSince(item.row))),
      items: sortedItems,
    };
  }).sort((a, b) =>
    a.admissionRank - b.admissionRank ||
    a.oldestPendingAt - b.oldestPendingAt ||
    a.key.localeCompare(b.key)
  );
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
  const fetchHasMorePending =
    pendingRowsByVisibility.some((rows) => rows.length > COMPILER_EVIDENCE_SCAN_LIMIT) ||
    legacyRowsByVisibility.some((rows) => rows.length > COMPILER_EVIDENCE_SCAN_LIMIT);
  const eligibleTraceRows = uniqueTraceRows([
    ...pendingRowsFetch,
    ...legacyPendingRows,
  ])
    .filter((row) => compilerState(row) === "pending")
    .filter((row) => isCommunityCompilerEvidenceTrace(row))
    .sort((a, b) =>
      compilerPendingSince(a) - compilerPendingSince(b) ||
      a.createdAt - b.createdAt ||
      a.updatedAt - b.updatedAt ||
      normalizeIdValue(a._id).localeCompare(normalizeIdValue(b._id))
    );
  const sharedEligibility = await Promise.all(eligibleTraceRows.map((trace) =>
    interactionTraceHasSharedSource({ ctx: args.ctx, communityId: args.communityId, trace })));
  const sharedTraceRows = eligibleTraceRows.filter((_row, index) => sharedEligibility[index]);
  const hasMorePending = fetchHasMorePending || sharedTraceRows.length > COMPILER_EVIDENCE_SCAN_LIMIT;
  const traceRows = sharedTraceRows.slice(0, COMPILER_EVIDENCE_SCAN_LIMIT);
  const pending: PendingEvidence[] = traceRows.map((row) => ({ row, priority: classifyEvidencePriority(row) }));
  const packets = groupPendingEvidence(pending);

  const standardCount = packets.filter((packet) => packet.priority === "standard").length;
  const strongCount = packets.filter((packet) => packet.priority === "strong").length;
  const criticalCount = packets.filter((packet) => packet.priority === "critical").length;
  const continuationCount = packets.filter((packet) =>
    packet.items.some((item) => item.row.compilerContinuationReady === true)
  ).length;
  const oldestPendingAt = packets.length > 0
    ? Math.min(...packets.map((packet) => packet.oldestPendingAt).filter(Number.isFinite))
    : null;
  const reason = decideTrigger({
    criticalCount,
    continuationCount,
    strongCount,
    totalCount: packets.length,
    largestPacketSize: packets.reduce((largest, packet) => Math.max(largest, packet.items.length), 0),
    oldestPendingAt,
    nowMs: args.nowMs,
  });
  const selectedPackets = packets.slice(0, COMPILER_EVIDENCE_PACKET_LIMIT);
  const selected = selectedPackets.flatMap((packet) =>
    packet.items.slice(0, COMPILER_EVIDENCE_TRACES_PER_PACKET_LIMIT)
  );
  const selectedTraceIds = new Set(selected.map((item) => normalizeIdValue(item.row._id)));
  const continuation = packets
    .flatMap((packet) => packet.items)
    .filter((item) => !selectedTraceIds.has(normalizeIdValue(item.row._id)))
    .slice(0, COMPILER_EVIDENCE_RUN_LIMIT);
  const selectionHasMore =
    packets.length > selectedPackets.length ||
    selectedPackets.some((packet) => packet.items.length > COMPILER_EVIDENCE_TRACES_PER_PACKET_LIMIT);

  return {
    measurement: {
      ok: true,
      community_id: normalizeIdValue(args.communityId),
      measured_at: toIsoString(args.nowMs),
      should_run: reason !== "no_trigger",
      reason,
      pending_total: packets.length,
      pending_trace_total: pending.length,
      pending_standard: standardCount,
      pending_strong: strongCount,
      pending_critical: criticalCount,
      pending_continuation: continuationCount,
      oldest_pending_at: oldestPendingAt === null ? null : toIsoString(oldestPendingAt),
      has_more_pending: hasMorePending || selectionHasMore,
      counts_are_lower_bound: hasMorePending,
      selected_packet_count: selectedPackets.length,
      selected_packet_keys: selectedPackets.map((packet) => packet.key),
      selected_trace_ids: selected.map((item) => normalizeIdValue(item.row._id)),
      selected_evidence_units: selected.map((item) => mapEvidenceUnit(item.row, item.priority)),
      thresholds: {
        batch: COMPILER_EVIDENCE_BATCH_THRESHOLD,
        strong: COMPILER_EVIDENCE_STRONG_THRESHOLD,
        critical: 1,
        oldest_pending_age_hours: COMPILER_EVIDENCE_AGE_THRESHOLD_MS / (60 * 60 * 1000),
        run_limit: COMPILER_EVIDENCE_RUN_LIMIT,
        packet_limit: COMPILER_EVIDENCE_PACKET_LIMIT,
        traces_per_packet_limit: COMPILER_EVIDENCE_TRACES_PER_PACKET_LIMIT,
        scan_limit: COMPILER_EVIDENCE_SCAN_LIMIT,
      },
    },
    selectedRows: selected.map((item) => item.row),
    continuationRows: continuation.map((item) => item.row),
  };
}

export async function drainIneligiblePendingSourceTracesForCommunity(args: {
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
      const selfAuthored = isCommunityAgentSelfAuthoredTrace(row);
      const sharedSource = selfAuthored || await interactionTraceHasSharedSource({
        ctx: args.ctx, communityId: args.communityId, trace: row,
      });
      if (!selfAuthored && sharedSource) continue;
      await args.ctx.db.patch(row._id as any, {
        compilerState: selfAuthored ? "excluded_self_authored" : "excluded_by_visibility",
        compilerPendingSince: undefined,
        compilerContinuationReady: undefined,
        compilerLastHandledAt: args.nowMs,
        compilerLastDigestId: undefined,
        updatedAt: args.nowMs,
      });
      drained += 1;
    }
  }
  return drained;
}
