import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {
  normalizeIdValue,
} from "./communityCore";
import { COMMUNITY_MEMORY_RETRIEVAL_RECEIPT_VERSION } from "../shared/communityEvidenceContract";

type ActorType = "member" | "admin" | "agent" | "compiler" | "system";
type EvidenceStrength = "none" | "anecdotal" | "observed" | "measured" | "validated";
type NodeStatus =
  | "draft"
  | "candidate"
  | "promising"
  | "validated"
  | "canonical"
  | "contested"
  | "stale"
  | "deprecated"
  | "archived";
type OutcomeResultStatus = "worked" | "failed" | "mixed" | "unknown";
type MetabolizerRunStatus = "settled" | "noop" | "error";
type MetabolizerTrigger = "sweep" | "manual" | "internal";

type IntelligenceNodeRow = {
  _id: any;
  communityId: any;
  type: string;
  title: string;
  bodyMd: string;
  status: NodeStatus;
  visibilityScope: string;
  sourceVisibility: string;
  confidence: number;
  evidenceStrength: EvidenceStrength;
  appliesWhen?: string;
  doesNotApplyWhen?: string;
  workflowIds: string[];
  tags: string[];
  sourceTraceIds: any[];
  outcomeObservationIds: any[];
  stalenessScore: number;
  retrievalUsefulnessScore: number;
  outcomeImpactScore: number;
  version: number;
  createdAt: number;
  updatedAt: number;
};

type RetrievalLogRow = {
  _id: any;
  communityId: any;
  receiptVersion?: "community_memory_retrieval_receipt:v1";
  retrievedNodeIds: any[];
  injectedNodeIds: any[];
  feedback?: "useful" | "not_useful" | "wrong" | "stale";
};

type OutcomeObservationRow = {
  _id: any;
  communityId: any;
  nodeId?: any;
  retrievalLogId?: any;
  resultStatus: OutcomeResultStatus;
  evidenceStrength: EvidenceStrength;
  observedByActorType: ActorType;
  observedByAgentKey?: string;
};

type MetabolizerNodeSignal = {
  nodeId: any;
  usefulFeedback: number;
  notUsefulFeedback: number;
  wrongFeedback: number;
  staleFeedback: number;
  workedOutcomeWeight: number;
  failedOutcomeWeight: number;
  mixedOutcomeWeight: number;
  unknownOutcomeWeight: number;
};

const ACTIVE_RETRIEVAL_STATUSES: NodeStatus[] = [
  "promising",
  "validated",
  "canonical",
  "contested",
  "stale",
];
const METABOLIZER_RETRIEVAL_LOG_LIMIT = 500;
const METABOLIZER_OUTCOME_LIMIT = 500;
const METABOLIZER_NODE_UPDATE_LIMIT = 200;
const METABOLIZER_SCORE_EPSILON = 0.005;
const METABOLIZER_EXCLUDED_AGENT_KEYS = new Set(["community_agent"]);

function boundedText(raw: unknown, maxLength: number): string {
  return String(raw ?? "").trim().slice(0, maxLength);
}

function clampScore(raw: unknown, fallback = 0): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function boundedMetabolizerLimit(raw: unknown, fallback: number, max: number): number {
  const parsed = Math.floor(Number(raw ?? fallback));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(max, parsed));
}

function normalizeMetabolizerTrigger(raw: unknown): MetabolizerTrigger {
  if (raw === "sweep" || raw === "manual" || raw === "internal") return raw;
  return "internal";
}

function retrievalLogNodeIds(log: RetrievalLogRow): any[] {
  const result: any[] = [];
  const seen = new Set<string>();
  for (const id of [...(log.retrievedNodeIds ?? []), ...(log.injectedNodeIds ?? [])]) {
    const normalized = normalizeIdValue(id);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(id);
  }
  return result;
}

function isCanonicalMemoryReceipt(log: RetrievalLogRow | null): log is RetrievalLogRow {
  return log?.receiptVersion === COMMUNITY_MEMORY_RETRIEVAL_RECEIPT_VERSION;
}

function canonicalReceiptInjectedNode(log: RetrievalLogRow, nodeId: any): boolean {
  const normalizedNodeId = normalizeIdValue(nodeId);
  return (log.injectedNodeIds ?? []).some(
    (injectedNodeId) => normalizeIdValue(injectedNodeId) === normalizedNodeId,
  );
}

function ensureMetabolizerSignal(map: Map<string, MetabolizerNodeSignal>, nodeId: any): MetabolizerNodeSignal | null {
  const normalized = normalizeIdValue(nodeId);
  if (!normalized) return null;
  const existing = map.get(normalized);
  if (existing) return existing;
  const signal: MetabolizerNodeSignal = {
    nodeId,
    usefulFeedback: 0,
    notUsefulFeedback: 0,
    wrongFeedback: 0,
    staleFeedback: 0,
    workedOutcomeWeight: 0,
    failedOutcomeWeight: 0,
    mixedOutcomeWeight: 0,
    unknownOutcomeWeight: 0,
  };
  map.set(normalized, signal);
  return signal;
}

function applyRetrievalFeedbackSignal(signal: MetabolizerNodeSignal, feedback?: RetrievalLogRow["feedback"]): void {
  if (feedback === "useful") signal.usefulFeedback += 1;
  if (feedback === "not_useful") signal.notUsefulFeedback += 1;
  if (feedback === "wrong") signal.wrongFeedback += 1;
  if (feedback === "stale") signal.staleFeedback += 1;
}

function evidenceStrengthWeight(strength: EvidenceStrength): number {
  if (strength === "validated") return 1;
  if (strength === "measured") return 0.85;
  if (strength === "observed") return 0.6;
  if (strength === "anecdotal") return 0.4;
  return 0.2;
}

function applyOutcomeSignal(signal: MetabolizerNodeSignal, outcome: OutcomeObservationRow): void {
  const weight = evidenceStrengthWeight(outcome.evidenceStrength);
  if (outcome.resultStatus === "worked") signal.workedOutcomeWeight += weight;
  if (outcome.resultStatus === "failed") signal.failedOutcomeWeight += weight;
  if (outcome.resultStatus === "mixed") signal.mixedOutcomeWeight += weight;
  if (outcome.resultStatus === "unknown") signal.unknownOutcomeWeight += weight;
}

function volumeAdjustedRatio(args: {
  positive: number;
  negative: number;
  neutral?: number;
  volumeUnit?: number;
}): number {
  const positive = Math.max(0, args.positive);
  const negative = Math.max(0, args.negative);
  const neutral = Math.max(0, args.neutral ?? 0);
  const total = positive + negative + neutral;
  if (total <= 0) return 0;
  const ratio = (positive + neutral * 0.5) / total;
  const volume = Math.min(1, total / Math.max(1, args.volumeUnit ?? 4));
  return clampScore(ratio * volume);
}

function metabolizedRetrievalUsefulnessScore(signal: MetabolizerNodeSignal): number {
  return volumeAdjustedRatio({
    positive: signal.usefulFeedback,
    negative: signal.notUsefulFeedback * 0.75 + signal.wrongFeedback + signal.staleFeedback * 0.6,
    volumeUnit: 4,
  });
}

function hasMetabolizerRetrievalSignal(signal: MetabolizerNodeSignal): boolean {
  return (
    signal.usefulFeedback +
      signal.notUsefulFeedback +
      signal.wrongFeedback +
      signal.staleFeedback >
    0
  );
}

function metabolizedOutcomeImpactScore(signal: MetabolizerNodeSignal): number {
  return volumeAdjustedRatio({
    positive: signal.workedOutcomeWeight,
    negative: signal.failedOutcomeWeight,
    neutral: signal.mixedOutcomeWeight + signal.unknownOutcomeWeight * 0.25,
    volumeUnit: 3,
  });
}

function hasMetabolizerOutcomeSignal(signal: MetabolizerNodeSignal): boolean {
  return (
    signal.workedOutcomeWeight +
      signal.failedOutcomeWeight +
      signal.mixedOutcomeWeight +
      signal.unknownOutcomeWeight >
    0
  );
}

function metabolizedStalenessScore(signal: MetabolizerNodeSignal): number {
  const feedbackWeight =
    signal.usefulFeedback +
    signal.notUsefulFeedback +
    signal.wrongFeedback +
    signal.staleFeedback;
  const outcomeWeight =
    signal.workedOutcomeWeight +
    signal.failedOutcomeWeight +
    signal.mixedOutcomeWeight +
    signal.unknownOutcomeWeight;
  const total = feedbackWeight + outcomeWeight;
  if (total <= 0) return 0;
  const stalePressure =
    signal.staleFeedback +
    signal.wrongFeedback * 0.8 +
    signal.notUsefulFeedback * 0.25 +
    signal.failedOutcomeWeight * 0.4;
  return clampScore((stalePressure / total) * Math.min(1, total / 4));
}

function scoreChanged(current: number, next: number): boolean {
  return Math.abs(clampScore(current) - clampScore(next)) >= METABOLIZER_SCORE_EPSILON;
}

function mapNodeSnapshot(row: IntelligenceNodeRow) {
  return {
    id: normalizeIdValue(row._id),
    community_id: normalizeIdValue(row.communityId),
    type: row.type,
    title: row.title,
    status: row.status,
    visibility_scope: row.visibilityScope,
    source_visibility: row.sourceVisibility,
    confidence: row.confidence,
    evidence_strength: row.evidenceStrength,
    applies_when: row.appliesWhen ?? null,
    does_not_apply_when: row.doesNotApplyWhen ?? null,
    workflow_ids: row.workflowIds ?? [],
    tags: row.tags ?? [],
    source_trace_ids: (row.sourceTraceIds ?? []).map(normalizeIdValue),
    outcome_observation_ids: (row.outcomeObservationIds ?? []).map(normalizeIdValue),
    staleness_score: row.stalenessScore,
    retrieval_usefulness_score: row.retrievalUsefulnessScore,
    outcome_impact_score: row.outcomeImpactScore,
    version: row.version,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

async function insertMetabolizerMutationLog(args: {
  ctx: any;
  communityId: any;
  targetNodeId: any;
  beforeSnapshot: unknown;
  afterSnapshot: unknown;
  nowMs: number;
}): Promise<any> {
  return await args.ctx.db.insert("communityIntelligenceMutations" as any, {
    communityId: args.communityId,
    operation: "update_node",
    actorType: "system",
    targetNodeIds: [args.targetNodeId],
    targetEdgeIds: [],
    primaryTargetNodeId: args.targetNodeId,
    sourceTraceIds: [],
    beforeSnapshot: args.beforeSnapshot,
    afterSnapshot: args.afterSnapshot,
    reason: "metabolizer_score_settlement",
    createdAt: args.nowMs,
  });
}

async function insertMetabolizerRunLedger(args: {
  ctx: any;
  communityId: any;
  status: MetabolizerRunStatus;
  trigger: MetabolizerTrigger;
  inspectedRetrievalLogCount: number;
  inspectedOutcomeCount: number;
  signalNodeCount: number;
  inspectedNodeCount: number;
  settledNodeCount: number;
  nodeUpdateLimit: number;
  changedNodeIds: any[];
  errorCode?: string;
  errorMessage?: string;
  startedAt: number;
  finishedAt: number;
}): Promise<any> {
  return await args.ctx.db.insert("communityMemoryMetabolizerRuns" as any, {
    communityId: args.communityId,
    status: args.status,
    trigger: args.trigger,
    inspectedRetrievalLogCount: Math.max(0, Math.floor(args.inspectedRetrievalLogCount)),
    inspectedOutcomeCount: Math.max(0, Math.floor(args.inspectedOutcomeCount)),
    signalNodeCount: Math.max(0, Math.floor(args.signalNodeCount)),
    inspectedNodeCount: Math.max(0, Math.floor(args.inspectedNodeCount)),
    settledNodeCount: Math.max(0, Math.floor(args.settledNodeCount)),
    nodeUpdateLimit: Math.max(0, Math.floor(args.nodeUpdateLimit)),
    changedNodeIds: args.changedNodeIds,
    errorCode: boundedText(args.errorCode, 120) || undefined,
    errorMessage: boundedText(args.errorMessage, 500) || undefined,
    startedAt: args.startedAt,
    finishedAt: args.finishedAt,
    createdAt: args.finishedAt,
  });
}

export const recordCommunityMemoryMetabolizerErrorRunInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    trigger: v.optional(v.union(v.literal("sweep"), v.literal("manual"), v.literal("internal"))),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community) throw new Error("community_metabolizer_community_not_found");
    const startedAt = args.startedAt ?? args.finishedAt ?? Date.now();
    const finishedAt = Math.max(startedAt, args.finishedAt ?? Date.now());
    const runId = await insertMetabolizerRunLedger({
      ctx,
      communityId: args.communityId,
      status: "error",
      trigger: normalizeMetabolizerTrigger(args.trigger),
      inspectedRetrievalLogCount: 0,
      inspectedOutcomeCount: 0,
      signalNodeCount: 0,
      inspectedNodeCount: 0,
      settledNodeCount: 0,
      nodeUpdateLimit: 0,
      changedNodeIds: [],
      errorCode: args.errorCode,
      errorMessage: args.errorMessage,
      startedAt,
      finishedAt,
    });
    return {
      ok: true,
      run_id: normalizeIdValue(runId),
      community_id: normalizeIdValue(args.communityId),
      status: "error",
    };
  },
});

export const settleCommunityMemorySignalsInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    trigger: v.optional(v.union(v.literal("sweep"), v.literal("manual"), v.literal("internal"))),
    retrievalLogLimit: v.optional(v.number()),
    outcomeLimit: v.optional(v.number()),
    nodeUpdateLimit: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community) throw new Error("community_metabolizer_community_not_found");

    const retrievalLogLimit = boundedMetabolizerLimit(
      args.retrievalLogLimit,
      METABOLIZER_RETRIEVAL_LOG_LIMIT,
      METABOLIZER_RETRIEVAL_LOG_LIMIT,
    );
    const outcomeLimit = boundedMetabolizerLimit(
      args.outcomeLimit,
      METABOLIZER_OUTCOME_LIMIT,
      METABOLIZER_OUTCOME_LIMIT,
    );
    const nodeUpdateLimit = boundedMetabolizerLimit(
      args.nodeUpdateLimit,
      METABOLIZER_NODE_UPDATE_LIMIT,
      METABOLIZER_NODE_UPDATE_LIMIT,
    );
    const nowMs = args.nowMs ?? Date.now();
    const startedAt = nowMs;
    const trigger = normalizeMetabolizerTrigger(args.trigger);

    const [retrievalLogs, outcomes] = await Promise.all([
      ctx.db
        .query("communityIntelligenceRetrievalLogs" as any)
        .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId))
        .order("desc")
        .take(retrievalLogLimit) as Promise<RetrievalLogRow[]>,
      ctx.db
        .query("communityOutcomeObservations" as any)
        .withIndex("by_community_observedAt", (q: any) => q.eq("communityId", args.communityId))
        .order("desc")
        .take(outcomeLimit) as Promise<OutcomeObservationRow[]>,
    ]);

    const retrievalLogById = new Map<string, RetrievalLogRow>();
    for (const log of retrievalLogs) {
      retrievalLogById.set(normalizeIdValue(log._id), log);
    }

    const signals = new Map<string, MetabolizerNodeSignal>();
    for (const log of retrievalLogs) {
      if (!isCanonicalMemoryReceipt(log) || !log.feedback) continue;
      for (const nodeId of retrievalLogNodeIds(log)) {
        const signal = ensureMetabolizerSignal(signals, nodeId);
        if (signal) applyRetrievalFeedbackSignal(signal, log.feedback);
      }
    }

    for (const outcome of outcomes) {
      if (METABOLIZER_EXCLUDED_AGENT_KEYS.has(String(outcome.observedByAgentKey ?? ""))) continue;
      const targetNodeIds: any[] = [];
      let retrievalLog: RetrievalLogRow | null = null;
      if (outcome.retrievalLogId) {
        const logId = normalizeIdValue(outcome.retrievalLogId);
        retrievalLog = retrievalLogById.get(logId) ?? null;
        if (!retrievalLog) {
          const fetched = (await ctx.db.get(outcome.retrievalLogId as any)) as RetrievalLogRow | null;
          retrievalLog =
            fetched && normalizeIdValue(fetched.communityId) === normalizeIdValue(args.communityId)
              ? fetched
              : null;
          if (retrievalLog) retrievalLogById.set(logId, retrievalLog);
        }
        if (!isCanonicalMemoryReceipt(retrievalLog)) continue;
      }
      if (outcome.nodeId) {
        if (retrievalLog && !canonicalReceiptInjectedNode(retrievalLog, outcome.nodeId)) continue;
        targetNodeIds.push(outcome.nodeId);
      }
      for (const nodeId of targetNodeIds) {
        const signal = ensureMetabolizerSignal(signals, nodeId);
        if (signal) applyOutcomeSignal(signal, outcome);
      }
    }

    const changedNodes: Array<{
      id: any;
      node_id: string;
      title: string;
      staleness_score: number;
      retrieval_usefulness_score: number;
      outcome_impact_score: number;
    }> = [];
    let inspectedNodes = 0;
    for (const signal of signals.values()) {
      inspectedNodes += 1;
      const node = (await ctx.db.get(signal.nodeId as any)) as IntelligenceNodeRow | null;
      if (!node || normalizeIdValue(node.communityId) !== normalizeIdValue(args.communityId)) continue;
      if (!ACTIVE_RETRIEVAL_STATUSES.includes(node.status)) continue;

      const hasRetrievalSignal = hasMetabolizerRetrievalSignal(signal);
      const hasOutcomeSignal = hasMetabolizerOutcomeSignal(signal);
      const nextRetrievalUsefulnessScore = hasRetrievalSignal
        ? metabolizedRetrievalUsefulnessScore(signal)
        : node.retrievalUsefulnessScore;
      const nextOutcomeImpactScore = hasOutcomeSignal
        ? metabolizedOutcomeImpactScore(signal)
        : node.outcomeImpactScore;
      const nextStalenessScore = metabolizedStalenessScore(signal);
      if (
        !scoreChanged(node.retrievalUsefulnessScore, nextRetrievalUsefulnessScore) &&
        !scoreChanged(node.outcomeImpactScore, nextOutcomeImpactScore) &&
        !scoreChanged(node.stalenessScore, nextStalenessScore)
      ) {
        continue;
      }

      const beforeSnapshot = mapNodeSnapshot(node);
      await ctx.db.patch(node._id as any, {
        retrievalUsefulnessScore: nextRetrievalUsefulnessScore,
        outcomeImpactScore: nextOutcomeImpactScore,
        stalenessScore: nextStalenessScore,
      });
      const updated = (await ctx.db.get(node._id as any)) as IntelligenceNodeRow | null;
      if (!updated) throw new Error("community_metabolizer_node_not_found_after_patch");
      await insertMetabolizerMutationLog({
        ctx,
        communityId: args.communityId,
        targetNodeId: node._id,
        beforeSnapshot,
        afterSnapshot: mapNodeSnapshot(updated),
        nowMs,
      });
      changedNodes.push({
        id: updated._id,
        node_id: normalizeIdValue(updated._id),
        title: updated.title,
        staleness_score: updated.stalenessScore,
        retrieval_usefulness_score: updated.retrievalUsefulnessScore,
        outcome_impact_score: updated.outcomeImpactScore,
      });
      if (changedNodes.length >= nodeUpdateLimit) break;
    }

    const finishedAt = Math.max(startedAt, Date.now());
    const runId = await insertMetabolizerRunLedger({
      ctx,
      communityId: args.communityId,
      status: changedNodes.length > 0 ? "settled" : "noop",
      trigger,
      inspectedRetrievalLogCount: retrievalLogs.length,
      inspectedOutcomeCount: outcomes.length,
      signalNodeCount: signals.size,
      inspectedNodeCount: inspectedNodes,
      settledNodeCount: changedNodes.length,
      nodeUpdateLimit,
      changedNodeIds: changedNodes.map((node) => node.id),
      startedAt,
      finishedAt,
    });

    return {
      ok: true,
      run_id: normalizeIdValue(runId),
      community_id: normalizeIdValue(args.communityId),
      status: changedNodes.length > 0 ? "settled" : "noop",
      inspected_retrieval_log_count: retrievalLogs.length,
      inspected_outcome_count: outcomes.length,
      signal_node_count: signals.size,
      inspected_node_count: inspectedNodes,
      settled_node_count: changedNodes.length,
      node_update_limit: nodeUpdateLimit,
      changed_nodes: changedNodes.map((node) => ({
        node_id: node.node_id,
        title: node.title,
        staleness_score: node.staleness_score,
        retrieval_usefulness_score: node.retrieval_usefulness_score,
        outcome_impact_score: node.outcome_impact_score,
      })),
    };
  },
});

