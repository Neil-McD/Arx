import { normalizeIdValue } from "./communityCore";
import { interactionTraceHasSharedSource } from "./communityInteractionEvidenceCore";
import {
  applyTrustedCommunityIntelligenceChangeRequestCore,
  createOrReuseTrustedCommunityIntelligenceChangeRequest,
} from "./communityIntelligenceDirectory";
import {
  buildCommunityMemoryWorkKey,
  isCommunityMemoryWorkKey,
} from "./communityMemoryWorkKey";
import { buildCommunitySourceTraceRevision } from "./communityCompilerEvidenceCore";
import type { CommunityMemoryDecisionV1 } from "../shared/communityMemoryDecisionContract";

const COMMUNITY_COMPILER_CANDIDATE_AGENT_KEY = "community_compiler_candidate_v1";
const COMMUNITY_COMPILER_CANDIDATE_PAYLOAD_SOURCE = "compiler_digest_item_v1";
const AUTONOMOUS_MEMORY_POLICY_VERSION = "autonomous_memory_v1";
const AUTONOMOUS_MEMORY_COMMUNITY_VISIBILITY_MAX_PRIVACY_RISK = 0.3;

type DigestCategory =
  | "chat_activity"
  | "ai_feed_signal"
  | "resource_activity"
  | "event_activity"
  | "member_state"
  | "outcome_signal"
  | "source_trace_signal";

type DigestItem = {
  workKey?: string;
  category: DigestCategory;
  title: string;
  summary: string;
  priority: number;
  confidence: number;
  sourceTypes: string[];
  sourceIds: string[];
  sourceTraceIds: any[];
  sourceRevisions?: string[];
};

type CompilerDigestRow = {
  _id: any;
  communityId: any;
  dedupeKey: string;
  windowStartedAt: number;
  windowEndedAt: number;
  summary: string;
  itemCount: number;
  items: DigestItem[];
  signalCounts: Record<string, number>;
  createdByActorType: string;
  createdByUserId?: any;
  createdByAgentKey?: string;
  createdAt: number;
  updatedAt: number;
};

type ChangeRequestRow = {
  _id: any;
  communityId: any;
  workKey?: string;
  operation: string;
  status: "pending_decision" | "accepted" | "rejected" | "applied";
  sourceTraceIds: any[];
  outcomeObservationIds: any[];
  targetNodeIds: any[];
  targetEdgeIds: any[];
  requestedPayload: unknown;
  confidence: number;
  privacyRisk: number;
  createdByActorType: string;
  createdByUserId?: any;
  createdByAgentKey?: string;
  createdAt: number;
  updatedAt: number;
  decidedAt?: number;
  appliedAt?: number;
};

type SourceTraceRow = {
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
  compilerState?: string;
  compilerContinuationReady?: boolean;
  compilerDecision?: {
    version?: number;
    workKey?: string;
    disposition?: string;
    targetNodeId?: any;
  };
  createdAt: number;
  updatedAt: number;
};

function truncateText(raw: unknown, maxLen: number): string {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!value) return "";
  return value.length <= maxLen ? value : `${value.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

function payloadObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

async function getCommunitySourceTraceById(args: {
  ctx: any;
  communityId: any;
  traceId: any;
}): Promise<SourceTraceRow | null> {
  const id = normalizeIdValue(args.traceId);
  if (!id) return null;
  const trace = (await args.ctx.db.get(args.traceId as any)) as SourceTraceRow | null;
  if (!trace || normalizeIdValue(trace.communityId) !== normalizeIdValue(args.communityId)) return null;
  return trace;
}

function autonomousMemoryPayload(args: {
  payload: unknown;
  sourceTraceIds: any[];
  privacyRisk: number;
}): Record<string, unknown> {
  const payload = payloadObject(args.payload);
  const sourceTraceResolution = payloadObject(payload.sourceTraceResolution);
  const evidenceFullyResolved =
    args.sourceTraceIds.length > 0 &&
    sourceTraceResolution.status === "resolved" &&
    (payload.sourceVisibility === "community" || payload.sourceVisibility === "public");
  const retainForCommunity =
    evidenceFullyResolved &&
    args.privacyRisk <= AUTONOMOUS_MEMORY_COMMUNITY_VISIBILITY_MAX_PRIVACY_RISK;
  return {
    ...payload,
    status: retainForCommunity ? "promising" : "candidate",
    visibilityScope: retainForCommunity ? "community" : "admin",
    autonomousMemoryPolicyVersion: AUTONOMOUS_MEMORY_POLICY_VERSION,
    autonomousMemoryDisposition: retainForCommunity ? "retained" : "forming",
  };
}

async function retainCompilerCandidateAutonomously(args: {
  ctx: any;
  row: ChangeRequestRow;
  actorType: "compiler" | "agent";
  actorAgentKey: string;
  nowMs: number;
}): Promise<ChangeRequestRow> {
  if (args.row.status === "applied") return args.row;
  if (args.row.status !== "pending_decision" && args.row.status !== "accepted") {
    throw new Error("community_compiler_candidate_not_autonomously_applicable");
  }
  if (args.row.operation === "create_node") {
    await args.ctx.db.patch(args.row._id as any, {
      requestedPayload: autonomousMemoryPayload({
        payload: args.row.requestedPayload,
        sourceTraceIds: args.row.sourceTraceIds ?? [],
        privacyRisk: args.row.privacyRisk,
      }),
      updatedAt: args.nowMs,
    });
  } else if (args.row.operation !== "attach_evidence") {
    throw new Error("community_compiler_candidate_operation_not_autonomously_applicable");
  }
  await applyTrustedCommunityIntelligenceChangeRequestCore({
    ctx: args.ctx,
    changeRequestId: args.row._id,
    actor: {
      actorType: args.actorType,
      actorAgentKey: args.actorAgentKey,
    },
    applicationMode: "autonomous_compiler_memory",
    reason: AUTONOMOUS_MEMORY_POLICY_VERSION,
    nowMs: args.nowMs,
  });
  const applied = (await args.ctx.db.get(args.row._id as any)) as ChangeRequestRow | null;
  if (!applied || applied.status !== "applied") {
    throw new Error("community_compiler_candidate_autonomous_apply_failed");
  }
  return applied;
}

async function getDigestOrThrow(ctx: any, digestId: any): Promise<CompilerDigestRow> {
  const digest = (await ctx.db.get(digestId as any)) as CompilerDigestRow | null;
  if (!digest) throw new Error("community_compiler_digest_not_found");
  return digest;
}

async function resolveCurrentDigestItemTrace(args: {
  ctx: any;
  communityId: any;
  item: DigestItem;
  workKey: string;
  nowMs: number;
}): Promise<SourceTraceRow | null> {
  if (args.item.sourceTraceIds.length !== 1 || (args.item.sourceRevisions ?? []).length !== 1) {
    throw new Error("community_compiler_digest_item_exact_trace_required");
  }
  const trace = await getCommunitySourceTraceById({
    ctx: args.ctx,
    communityId: args.communityId,
    traceId: args.item.sourceTraceIds[0],
  });
  if (!trace) throw new Error("community_compiler_digest_item_trace_not_found");
  if (!(await interactionTraceHasSharedSource({ ctx: args.ctx, communityId: args.communityId, trace }))) {
    await args.ctx.db.patch(trace._id, {
      compilerState: "excluded_by_visibility",
      compilerPendingSince: undefined,
      compilerContinuationReady: undefined,
      compilerLastHandledAt: args.nowMs,
      compilerLastDigestId: undefined,
      updatedAt: args.nowMs,
    });
    return null;
  }
  if (await buildCommunitySourceTraceRevision(trace) !== args.item.sourceRevisions?.[0]) {
    throw new Error("community_compiler_digest_item_source_revision_mismatch");
  }
  if (trace.compilerDecision?.workKey === args.workKey) return trace;
  if (trace.compilerState !== "pending") {
    throw new Error("community_compiler_digest_item_trace_not_pending");
  }
  if (
    trace.visibilityScope === "private" ||
    trace.sourceVisibility === "private" ||
    trace.sourceVisibility === "redacted"
  ) {
    throw new Error("community_compiler_digest_item_trace_not_retainable");
  }
  return trace;
}

function directDecisionPayload(args: {
  digest: CompilerDigestRow;
  item: DigestItem;
  decision: CommunityMemoryDecisionV1;
  trace: SourceTraceRow;
  runId?: string;
  heartbeatId?: string;
}): Record<string, unknown> {
  const communityReadable =
    (args.trace.visibilityScope === "community" || args.trace.visibilityScope === "public") &&
    (args.trace.sourceVisibility === "community" || args.trace.sourceVisibility === "public");
  return {
    source: COMMUNITY_COMPILER_CANDIDATE_PAYLOAD_SOURCE,
    compilerDigestId: normalizeIdValue(args.digest._id),
    compilerDigestDedupeKey: args.digest.dedupeKey,
    digestItemCategory: args.item.category,
    ...(args.runId ? { proposedByCommunityAgentRunId: args.runId } : {}),
    ...(args.heartbeatId ? { proposedByCommunityAgentHeartbeatId: args.heartbeatId } : {}),
    sourceTraceResolution: {
      status: "resolved",
      sourceTraceIds: [normalizeIdValue(args.trace._id)],
      resolvedSourceReferences: [{
        sourceType: args.trace.sourceType,
        sourceId: args.trace.sourceId ?? normalizeIdValue(args.trace._id),
        sourceTraceId: normalizeIdValue(args.trace._id),
        resolution: "explicit_trace",
      }],
      unresolvedSourceReferences: [],
    },
    type: args.decision.nodeType,
    title: args.decision.title,
    bodyMd: args.decision.bodyMd,
    status: "candidate",
    visibilityScope: "admin",
    sourceVisibility: communityReadable ? args.trace.sourceVisibility : "redacted",
    confidence: args.decision.confidence,
    evidenceStrength: "observed",
    appliesWhen: args.decision.appliesWhen ?? undefined,
    doesNotApplyWhen: args.decision.doesNotApplyWhen ?? undefined,
    workflowIds: [],
    tags: ["compiler_memory", `source:${truncateText(args.trace.sourceType, 40)}`],
    decisionReason: args.decision.reason,
  };
}

async function patchTraceDecision(args: {
  ctx: any;
  trace: SourceTraceRow;
  digestId: any;
  decision: CommunityMemoryDecisionV1;
  runId?: string;
  targetNodeId?: any;
  nowMs: number;
}) {
  const compilerState = args.decision.disposition === "retain"
    ? "compiled"
    : args.decision.disposition === "dismiss_low_signal"
      ? "dismissed_low_signal"
      : "carried_forward";
  await args.ctx.db.patch(args.trace._id as any, {
    compilerState,
    compilerPendingSince: undefined,
    compilerContinuationReady: undefined,
    compilerLastHandledAt: args.nowMs,
    compilerLastDigestId: args.digestId,
    compilerDecision: {
      version: 1 as const,
      workKey: args.decision.workKey,
      disposition: args.decision.disposition,
      reason: args.decision.reason,
      ...(args.runId ? { runId: args.runId } : {}),
      ...(args.targetNodeId ? { targetNodeId: args.targetNodeId } : {}),
      decidedAt: args.nowMs,
    },
  });
}

export async function settleCommunityIntelligenceFromDigestItemsCore(args: {
  ctx: any;
  communityId: any;
  digestId: any;
  decisions: CommunityMemoryDecisionV1[];
  actorType?: "compiler" | "agent";
  actorAgentKey?: string;
  runId?: string;
  heartbeatId?: string;
  nowMs?: number;
}) {
  const digest = await getDigestOrThrow(args.ctx, args.digestId);
  if (normalizeIdValue(digest.communityId) !== normalizeIdValue(args.communityId)) {
    throw new Error("community_compiler_digest_not_found");
  }
  const digestWorkKeys = digest.items.map((item) => item.workKey).filter(Boolean) as string[];
  const decisionWorkKeys = args.decisions.map((decision) => decision.workKey);
  if (
    digestWorkKeys.length !== digest.items.length ||
    decisionWorkKeys.length !== digestWorkKeys.length ||
    new Set(decisionWorkKeys).size !== decisionWorkKeys.length ||
    digestWorkKeys.some((workKey) => !decisionWorkKeys.includes(workKey))
  ) {
    throw new Error("community_compiler_digest_decisions_incomplete");
  }
  const nowMs = args.nowMs ?? Date.now();
  const actorType = args.actorType ?? "agent";
  const actorAgentKey = args.actorAgentKey ?? COMMUNITY_COMPILER_CANDIDATE_AGENT_KEY;
  const results: Array<Record<string, unknown>> = [];
  const appliedChangeRequestIds: string[] = [];

  for (const decision of args.decisions) {
    if (!isCommunityMemoryWorkKey(decision.workKey)) {
      throw new Error("community_compiler_digest_work_key_invalid");
    }
    const item = digest.items.find((candidate) => candidate.workKey === decision.workKey);
    if (!item) throw new Error("community_compiler_digest_item_not_found");
    const expectedWorkKey = await buildCommunityMemoryWorkKey({
      communityId: args.communityId,
      category: item.category,
      sourceTypes: item.sourceTypes,
      sourceIds: item.sourceIds,
      sourceTraceIds: item.sourceTraceIds,
      contentRevisions: item.sourceRevisions,
    });
    if (expectedWorkKey !== decision.workKey) {
      throw new Error("community_compiler_digest_work_key_mismatch");
    }
    const trace = await resolveCurrentDigestItemTrace({
      ctx: args.ctx,
      communityId: args.communityId,
      item,
      workKey: decision.workKey,
      nowMs,
    });
    if (!trace) {
      results.push({ work_key: decision.workKey, status: "excluded_by_visibility" });
      continue;
    }
    if (trace.compilerDecision?.workKey === decision.workKey) {
      results.push({
        work_key: decision.workKey,
        disposition: trace.compilerDecision.disposition,
        reused_existing: true,
        target_node_id: trace.compilerDecision.targetNodeId
          ? normalizeIdValue(trace.compilerDecision.targetNodeId)
          : null,
      });
      continue;
    }
    if (decision.disposition === "dismiss_low_signal") {
      await patchTraceDecision({
        ctx: args.ctx,
        trace,
        digestId: digest._id,
        decision,
        runId: args.runId,
        nowMs,
      });
      results.push({ work_key: decision.workKey, disposition: decision.disposition, reused_existing: false });
      continue;
    }

    const operation = decision.disposition === "retain" ? "create_node" : "attach_evidence";
    const targetNodeId = decision.existingNodeId
      ? args.ctx.db.normalizeId("communityIntelligenceNodes", decision.existingNodeId)
      : null;
    if (decision.disposition === "carried_forward" && !targetNodeId) {
      throw new Error("community_compiler_existing_node_not_found");
    }
    const requestedPayload = decision.disposition === "retain"
      ? directDecisionPayload({
          digest,
          item,
          decision,
          trace,
          runId: args.runId,
          heartbeatId: args.heartbeatId,
        })
      : {
          source: COMMUNITY_COMPILER_CANDIDATE_PAYLOAD_SOURCE,
          compilerDigestId: normalizeIdValue(digest._id),
          digestItemCategory: item.category,
          decisionReason: decision.reason,
        };
    const privacyRisk =
      trace.visibilityScope === "community" || trace.visibilityScope === "public" ? 0.25 : 0.75;
    const auditRecord = await createOrReuseTrustedCommunityIntelligenceChangeRequest({
      ctx: args.ctx,
      communityId: args.communityId,
      workKey: decision.workKey,
      operation,
      sourceTraceIds: [trace._id],
      targetNodeIds: targetNodeId ? [targetNodeId] : [],
      requestedPayload,
      confidence: decision.confidence ?? item.confidence,
      privacyRisk,
      actorType,
      actorAgentKey,
      nowMs,
    });
    const auditRow = (await args.ctx.db.get(auditRecord.changeRequest.id as any)) as ChangeRequestRow | null;
    if (!auditRow) throw new Error("community_compiler_candidate_create_failed");
    const applied = await retainCompilerCandidateAutonomously({
      ctx: args.ctx,
      row: auditRow,
      actorType,
      actorAgentKey,
      nowMs,
    });
    const appliedNodeId = applied.targetNodeIds?.[0] ?? targetNodeId;
    await patchTraceDecision({
      ctx: args.ctx,
      trace,
      digestId: digest._id,
      decision,
      runId: args.runId,
      targetNodeId: appliedNodeId,
      nowMs,
    });
    appliedChangeRequestIds.push(normalizeIdValue(applied._id));
    results.push({
      work_key: decision.workKey,
      disposition: decision.disposition,
      reused_existing: auditRecord.reusedExisting,
      change_request_id: normalizeIdValue(applied._id),
      target_node_id: appliedNodeId ? normalizeIdValue(appliedNodeId) : null,
    });
  }

  return {
    ok: true,
    digest_id: normalizeIdValue(digest._id),
    decisions: results,
    applied_change_request_ids: appliedChangeRequestIds,
  };
}
