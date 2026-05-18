import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  normalizeIdValue,
  normalizeOptionalText,
  requireCommunityChatAccess,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";

type ActorType = "member" | "admin" | "agent" | "compiler" | "system";
type VisibilityScope = "private" | "admin" | "community" | "public";
type SourceVisibility = VisibilityScope | "redacted";
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
type NodeType =
  | "playbook"
  | "insight"
  | "example"
  | "warning_failure"
  | "decision_judgment"
  | "open_question";
type MutationOperation =
  | "create_node"
  | "update_node"
  | "create_edge"
  | "attach_evidence"
  | "attach_outcome"
  | "promote_status"
  | "mark_contested"
  | "mark_stale"
  | "deprecate_node"
  | "update_confidence"
  | "update_visibility";
type ChangeRequestStatus = "pending_decision" | "accepted" | "rejected" | "applied";
type SourceTraceType =
  | "chat"
  | "ai_feed"
  | "resource"
  | "workflow_run"
  | "agent_run"
  | "artifact"
  | "tool_call"
  | "outcome"
  | "feedback"
  | "transcript"
  | "manual"
  | "external";

type SourceTraceRow = {
  _id: any;
  communityId: any;
  sourceType: SourceTraceType;
  sourceId?: string;
  title?: string;
  summary: string;
  visibilityScope: VisibilityScope;
  sourceVisibility: SourceVisibility;
  workflowId?: string;
  artifactIds: string[];
  outcomeObservationIds: any[];
  actorType: ActorType;
  actorUserId?: any;
  actorAgentKey?: string;
  createdAt: number;
  updatedAt: number;
};

type IntelligenceNodeRow = {
  _id: any;
  communityId: any;
  type: NodeType;
  title: string;
  bodyMd: string;
  status: NodeStatus;
  visibilityScope: VisibilityScope;
  sourceVisibility: SourceVisibility;
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
  createdByActorType: ActorType;
  createdByUserId?: any;
  createdByAgentKey?: string;
  lastUpdatedByActorType: ActorType;
  lastUpdatedByUserId?: any;
  lastUpdatedByAgentKey?: string;
  lastValidatedAt?: number;
  deprecatedByNodeId?: any;
  version: number;
  createdAt: number;
  updatedAt: number;
};

type IntelligenceEdgeRow = {
  _id: any;
  communityId: any;
  fromNodeId: any;
  toNodeId?: any;
  toReferenceType?: string;
  toReferenceId?: string;
  type: string;
  confidence: number;
  evidenceTraceIds: any[];
  visibilityScope: VisibilityScope;
  createdByActorType: ActorType;
  createdByUserId?: any;
  createdByAgentKey?: string;
  compilerRunId?: string;
  createdAt: number;
  updatedAt: number;
};

type RetrievalLogRow = {
  _id: any;
  communityId: any;
  userId: any;
  workflowId?: string;
  query?: string;
  retrievedNodeIds: any[];
  injectedNodeIds: any[];
  feedback?: "useful" | "not_useful" | "wrong" | "stale";
  feedbackNote?: string;
  outcomeObservationIds: any[];
  createdAt: number;
  updatedAt: number;
};

type OutcomeObservationRow = {
  _id: any;
  communityId: any;
  nodeId?: any;
  retrievalLogId?: any;
  observedByActorType: ActorType;
  observedByUserId?: any;
  observedByAgentKey?: string;
};

type IntelligenceChangeRequestRow = {
  _id: any;
  communityId: any;
  operation: MutationOperation;
  status: ChangeRequestStatus;
  sourceTraceIds: any[];
  outcomeObservationIds: any[];
  targetNodeIds: any[];
  targetEdgeIds: any[];
  primaryTargetNodeId?: any;
  primaryTargetEdgeId?: any;
  targetNodeSnapshots: Array<{ nodeId: any; version: number; updatedAt: number }>;
  targetEdgeSnapshots: Array<{ edgeId: any; updatedAt: number }>;
  requestedPayload: unknown;
  confidence: number;
  privacyRisk: number;
  createdByActorType: ActorType;
  createdByUserId?: any;
  createdByAgentKey?: string;
  decidedByActorType?: "admin" | "agent" | "compiler" | "system";
  decidedByUserId?: any;
  decidedByAgentKey?: string;
  decisionReason?: string;
  appliedMutationId?: any;
  createdAt: number;
  updatedAt: number;
  decidedAt?: number;
  appliedAt?: number;
};

const ACTIVE_RETRIEVAL_STATUSES: NodeStatus[] = [
  "promising",
  "validated",
  "canonical",
  "contested",
  "stale",
];
const NODE_TYPES = new Set<NodeType>([
  "playbook",
  "insight",
  "example",
  "warning_failure",
  "decision_judgment",
  "open_question",
]);
const NODE_STATUSES = new Set<NodeStatus>([
  "draft",
  "candidate",
  "promising",
  "validated",
  "canonical",
  "contested",
  "stale",
  "deprecated",
  "archived",
]);
const EVIDENCE_STRENGTHS = new Set<EvidenceStrength>([
  "none",
  "anecdotal",
  "observed",
  "measured",
  "validated",
]);
const EDGE_TYPES = new Set([
  "supports",
  "contradicts",
  "derived_from",
  "applies_to_workflow",
  "has_example",
  "validated_by",
  "deprecated_by",
]);
const EDGE_REFERENCE_TYPES = new Set([
  "trace",
  "workflow",
  "artifact",
  "outcome",
  "person",
  "tool",
  "agent_run",
  "resource",
]);
const MEMBER_READABLE_STATUSES = new Set<NodeStatus>(ACTIVE_RETRIEVAL_STATUSES);
const DRAFT_STATUSES = new Set<NodeStatus>(["draft", "candidate"]);

function clampScore(raw: unknown, fallback = 0): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function normalizeBoundedText(raw: unknown, maxLen: number, errorCode: string): string {
  const text = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!text) throw new Error(errorCode);
  return text.slice(0, maxLen);
}

function normalizeBody(raw: unknown): string {
  const text = String(raw ?? "").trim();
  if (!text) throw new Error("community_intelligence_body_required");
  return text.slice(0, 40_000);
}

function normalizeOptionalLongText(raw: unknown, maxLen: number): string | undefined {
  const text = String(raw ?? "").trim();
  if (!text) return undefined;
  return text.slice(0, maxLen);
}

function normalizeStringList(raw: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of raw) {
    const value = String(entry ?? "").trim().replace(/\s+/g, " ").slice(0, maxLen);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length >= maxItems) break;
  }
  return result;
}

function normalizeWorkflowId(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim().slice(0, 256);
  return value || undefined;
}

function normalizeActorKey(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim().slice(0, 256);
  return value || undefined;
}

function payloadObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function payloadNodeType(raw: unknown, fallback: NodeType = "insight"): NodeType {
  return typeof raw === "string" && NODE_TYPES.has(raw as NodeType) ? (raw as NodeType) : fallback;
}

function payloadNodeStatus(raw: unknown, fallback: NodeStatus): NodeStatus {
  return typeof raw === "string" && NODE_STATUSES.has(raw as NodeStatus) ? (raw as NodeStatus) : fallback;
}

function payloadEvidenceStrength(raw: unknown, fallback: EvidenceStrength): EvidenceStrength {
  return typeof raw === "string" && EVIDENCE_STRENGTHS.has(raw as EvidenceStrength)
    ? (raw as EvidenceStrength)
    : fallback;
}

function payloadVisibility(raw: unknown): VisibilityScope | undefined {
  return raw === "private" || raw === "admin" || raw === "community" || raw === "public"
    ? raw
    : undefined;
}

function payloadSourceVisibility(raw: unknown): SourceVisibility | undefined {
  return raw === "private" || raw === "admin" || raw === "community" || raw === "public" || raw === "redacted"
    ? raw
    : undefined;
}

function canViewerReadVisibility(scope: VisibilityScope, isManager: boolean): boolean {
  if (scope === "public" || scope === "community") return true;
  return isManager;
}

function isSourceTraceRow(row: unknown): row is SourceTraceRow {
  const candidate = row as Partial<SourceTraceRow> | null;
  return Boolean(
    candidate &&
      typeof candidate.sourceType === "string" &&
      typeof candidate.summary === "string" &&
      typeof candidate.visibilityScope === "string" &&
      typeof candidate.sourceVisibility === "string" &&
      Array.isArray(candidate.artifactIds),
  );
}

function isIntelligenceNodeRow(row: unknown): row is IntelligenceNodeRow {
  const candidate = row as Partial<IntelligenceNodeRow> | null;
  return Boolean(
    candidate &&
      typeof candidate.type === "string" &&
      NODE_TYPES.has(candidate.type as NodeType) &&
      typeof candidate.title === "string" &&
      typeof candidate.bodyMd === "string" &&
      typeof candidate.status === "string" &&
      Array.isArray(candidate.sourceTraceIds),
  );
}

function isIntelligenceEdgeRow(row: unknown): row is IntelligenceEdgeRow {
  const candidate = row as Partial<IntelligenceEdgeRow> | null;
  return Boolean(
    candidate &&
      candidate.fromNodeId &&
      typeof candidate.type === "string" &&
      EDGE_TYPES.has(candidate.type) &&
      Array.isArray(candidate.evidenceTraceIds),
  );
}

function isOutcomeObservationRow(row: unknown): row is OutcomeObservationRow {
  const candidate = row as (Partial<OutcomeObservationRow> & { resultStatus?: unknown }) | null;
  return Boolean(
    candidate &&
      typeof candidate.observedByActorType === "string" &&
      typeof candidate.resultStatus === "string",
  );
}

function canViewerReadNode(row: IntelligenceNodeRow, isManager: boolean): boolean {
  if (!canViewerReadVisibility(row.visibilityScope, isManager)) return false;
  if (isManager) return true;
  return MEMBER_READABLE_STATUSES.has(row.status);
}

function canViewerReadTrace(row: SourceTraceRow, isManager: boolean, userId?: any): boolean {
  if (isManager) return true;
  if (
    userId &&
    row.actorUserId &&
    normalizeIdValue(row.actorUserId) === normalizeIdValue(userId) &&
    row.visibilityScope === "private" &&
    row.sourceVisibility !== "redacted"
  ) {
    return true;
  }
  if (!canViewerReadVisibility(row.visibilityScope, false)) return false;
  if (row.sourceVisibility === "redacted") return false;
  return canViewerReadVisibility(row.sourceVisibility, false);
}

function normalizeRequestedStatuses(statuses: NodeStatus[] | undefined, isManager: boolean): Set<NodeStatus> {
  const requested = statuses?.length ? statuses : ACTIVE_RETRIEVAL_STATUSES;
  if (isManager) return new Set(requested);
  const readable = requested.filter((status) => MEMBER_READABLE_STATUSES.has(status));
  return new Set(readable.length ? readable : ACTIVE_RETRIEVAL_STATUSES);
}

function resolveNodeVisibility(args: {
  status: NodeStatus;
  requestedVisibility?: VisibilityScope;
  requestedSourceVisibility?: SourceVisibility;
}): { visibilityScope: VisibilityScope; sourceVisibility: SourceVisibility } {
  if (!DRAFT_STATUSES.has(args.status)) {
    const visibilityScope = args.requestedVisibility ?? "community";
    return {
      visibilityScope,
      sourceVisibility: args.requestedSourceVisibility ?? visibilityScope,
    };
  }

  const requestedVisibility = args.requestedVisibility ?? "admin";
  const visibilityScope = requestedVisibility === "private" ? "private" : "admin";
  const requestedSourceVisibility = args.requestedSourceVisibility;
  const sourceVisibility =
    requestedSourceVisibility === "private" || requestedSourceVisibility === "redacted"
      ? requestedSourceVisibility
      : visibilityScope;
  return { visibilityScope, sourceVisibility };
}

function retrievalLogBelongsToUser(log: RetrievalLogRow, userId: any, isManager: boolean): boolean {
  return isManager || normalizeIdValue(log.userId) === normalizeIdValue(userId);
}

function resolveTraceVisibility(args: {
  requestedVisibility?: VisibilityScope;
  requestedSourceVisibility?: SourceVisibility;
  isManager: boolean;
}): { visibilityScope: VisibilityScope; sourceVisibility: SourceVisibility } {
  if (args.isManager) {
    const visibilityScope = args.requestedVisibility ?? "community";
    return {
      visibilityScope,
      sourceVisibility: args.requestedSourceVisibility ?? visibilityScope,
    };
  }
  const visibilityScope = args.requestedVisibility === "private" ? "private" : "community";
  return {
    visibilityScope,
    sourceVisibility: visibilityScope,
  };
}

function mapTraceRow(row: SourceTraceRow) {
  return {
    id: normalizeIdValue(row._id),
    community_id: normalizeIdValue(row.communityId),
    source_type: row.sourceType,
    source_id: row.sourceId ?? null,
    title: row.title ?? null,
    summary: row.summary,
    visibility_scope: row.visibilityScope,
    source_visibility: row.sourceVisibility,
    workflow_id: row.workflowId ?? null,
    artifact_ids: row.artifactIds ?? [],
    outcome_observation_ids: (row.outcomeObservationIds ?? []).map(normalizeIdValue),
    actor_type: row.actorType,
    actor_user_id: row.actorUserId ? normalizeIdValue(row.actorUserId) : null,
    actor_agent_key: row.actorAgentKey ?? null,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

function mapNodeRow(row: IntelligenceNodeRow) {
  return {
    id: normalizeIdValue(row._id),
    community_id: normalizeIdValue(row.communityId),
    type: row.type,
    title: row.title,
    body_md: row.bodyMd,
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
    created_by_actor_type: row.createdByActorType,
    created_by_user_id: row.createdByUserId ? normalizeIdValue(row.createdByUserId) : null,
    created_by_agent_key: row.createdByAgentKey ?? null,
    last_updated_by_actor_type: row.lastUpdatedByActorType,
    last_updated_by_user_id: row.lastUpdatedByUserId ? normalizeIdValue(row.lastUpdatedByUserId) : null,
    last_updated_by_agent_key: row.lastUpdatedByAgentKey ?? null,
    last_validated_at: typeof row.lastValidatedAt === "number" ? toIsoString(row.lastValidatedAt) : null,
    deprecated_by_node_id: row.deprecatedByNodeId ? normalizeIdValue(row.deprecatedByNodeId) : null,
    version: row.version,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

function mapEdgeRow(row: IntelligenceEdgeRow) {
  return {
    id: normalizeIdValue(row._id),
    community_id: normalizeIdValue(row.communityId),
    from_node_id: normalizeIdValue(row.fromNodeId),
    to_node_id: row.toNodeId ? normalizeIdValue(row.toNodeId) : null,
    to_reference_type: row.toReferenceType ?? null,
    to_reference_id: row.toReferenceId ?? null,
    type: row.type,
    confidence: row.confidence,
    evidence_trace_ids: (row.evidenceTraceIds ?? []).map(normalizeIdValue),
    visibility_scope: row.visibilityScope,
    created_by_actor_type: row.createdByActorType,
    created_by_user_id: row.createdByUserId ? normalizeIdValue(row.createdByUserId) : null,
    created_by_agent_key: row.createdByAgentKey ?? null,
    compiler_run_id: row.compilerRunId ?? null,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

function mapRetrievalLogRow(row: RetrievalLogRow) {
  return {
    id: normalizeIdValue(row._id),
    community_id: normalizeIdValue(row.communityId),
    user_id: normalizeIdValue(row.userId),
    workflow_id: row.workflowId ?? null,
    query: row.query ?? null,
    retrieved_node_ids: (row.retrievedNodeIds ?? []).map(normalizeIdValue),
    injected_node_ids: (row.injectedNodeIds ?? []).map(normalizeIdValue),
    feedback: row.feedback ?? null,
    feedback_note: row.feedbackNote ?? null,
    outcome_observation_ids: (row.outcomeObservationIds ?? []).map(normalizeIdValue),
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

function mapChangeRequestRow(row: IntelligenceChangeRequestRow) {
  return {
    id: normalizeIdValue(row._id),
    community_id: normalizeIdValue(row.communityId),
    operation: row.operation,
    status: row.status,
    source_trace_ids: (row.sourceTraceIds ?? []).map(normalizeIdValue),
    outcome_observation_ids: (row.outcomeObservationIds ?? []).map(normalizeIdValue),
    target_node_ids: (row.targetNodeIds ?? []).map(normalizeIdValue),
    target_edge_ids: (row.targetEdgeIds ?? []).map(normalizeIdValue),
    primary_target_node_id: row.primaryTargetNodeId ? normalizeIdValue(row.primaryTargetNodeId) : null,
    primary_target_edge_id: row.primaryTargetEdgeId ? normalizeIdValue(row.primaryTargetEdgeId) : null,
    target_node_snapshots: (row.targetNodeSnapshots ?? []).map((snapshot) => ({
      node_id: normalizeIdValue(snapshot.nodeId),
      version: snapshot.version,
      updated_at: toIsoString(snapshot.updatedAt),
    })),
    target_edge_snapshots: (row.targetEdgeSnapshots ?? []).map((snapshot) => ({
      edge_id: normalizeIdValue(snapshot.edgeId),
      updated_at: toIsoString(snapshot.updatedAt),
    })),
    requested_payload: row.requestedPayload ?? {},
    confidence: row.confidence,
    privacy_risk: row.privacyRisk,
    created_by_actor_type: row.createdByActorType,
    created_by_user_id: row.createdByUserId ? normalizeIdValue(row.createdByUserId) : null,
    created_by_agent_key: row.createdByAgentKey ?? null,
    decided_by_actor_type: row.decidedByActorType ?? null,
    decided_by_user_id: row.decidedByUserId ? normalizeIdValue(row.decidedByUserId) : null,
    decided_by_agent_key: row.decidedByAgentKey ?? null,
    decision_reason: row.decisionReason ?? null,
    applied_mutation_id: row.appliedMutationId ? normalizeIdValue(row.appliedMutationId) : null,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
    decided_at: typeof row.decidedAt === "number" ? toIsoString(row.decidedAt) : null,
    applied_at: typeof row.appliedAt === "number" ? toIsoString(row.appliedAt) : null,
  };
}

async function viewerCanManageCommunity(ctx: any, communityId: any, userId: any): Promise<boolean> {
  try {
    await requireCommunityManager({ ctx, communityId, userId });
    return true;
  } catch {
    return false;
  }
}

async function requireTraceIdsBelongToCommunity(ctx: any, communityId: any, traceIds: any[]): Promise<void> {
  const seen = new Set<string>();
  for (const traceId of traceIds) {
    const id = normalizeIdValue(traceId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const trace = (await ctx.db.get(traceId as any)) as unknown;
    if (!isSourceTraceRow(trace) || normalizeIdValue(trace.communityId) !== normalizeIdValue(communityId)) {
      throw new Error("community_source_trace_not_found");
    }
  }
}

async function requireTraceIdsReadableByViewer(args: {
  ctx: any;
  communityId: any;
  traceIds: any[];
  userId: any;
  isManager: boolean;
}): Promise<void> {
  const seen = new Set<string>();
  for (const traceId of args.traceIds) {
    const id = normalizeIdValue(traceId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const trace = (await args.ctx.db.get(traceId as any)) as unknown;
    if (!isSourceTraceRow(trace) || normalizeIdValue(trace.communityId) !== normalizeIdValue(args.communityId)) {
      throw new Error("community_source_trace_not_found");
    }
    if (!canViewerReadTrace(trace, args.isManager, args.userId)) {
      throw new Error("community_source_trace_not_readable");
    }
  }
}

async function requireOutcomeIdsBelongToCommunity(ctx: any, communityId: any, outcomeIds: any[]): Promise<void> {
  const seen = new Set<string>();
  for (const outcomeId of outcomeIds) {
    const id = normalizeIdValue(outcomeId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const outcome = (await ctx.db.get(outcomeId as any)) as unknown;
    if (!isOutcomeObservationRow(outcome) || normalizeIdValue(outcome.communityId) !== normalizeIdValue(communityId)) {
      throw new Error("community_outcome_observation_not_found");
    }
  }
}

async function canViewerReadOutcome(args: {
  ctx: any;
  outcome: OutcomeObservationRow;
  userId: any;
  isManager: boolean;
}): Promise<boolean> {
  if (args.isManager) return true;
  if (args.outcome.observedByUserId && normalizeIdValue(args.outcome.observedByUserId) === normalizeIdValue(args.userId)) {
    return true;
  }
  if (args.outcome.retrievalLogId) {
    const log = (await args.ctx.db.get(args.outcome.retrievalLogId as any)) as RetrievalLogRow | null;
    if (log && retrievalLogBelongsToUser(log, args.userId, false)) return true;
  }
  return false;
}

async function requireOutcomeIdsReadableByViewer(args: {
  ctx: any;
  communityId: any;
  outcomeIds: any[];
  userId: any;
  isManager: boolean;
}): Promise<void> {
  const seen = new Set<string>();
  for (const outcomeId of args.outcomeIds) {
    const id = normalizeIdValue(outcomeId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const outcome = (await args.ctx.db.get(outcomeId as any)) as unknown;
    if (!isOutcomeObservationRow(outcome) || normalizeIdValue(outcome.communityId) !== normalizeIdValue(args.communityId)) {
      throw new Error("community_outcome_observation_not_found");
    }
    if (!(await canViewerReadOutcome({
      ctx: args.ctx,
      outcome,
      userId: args.userId,
      isManager: args.isManager,
    }))) {
      throw new Error("community_outcome_observation_not_readable");
    }
  }
}

async function requireNodeIdsBelongToCommunity(ctx: any, communityId: any, nodeIds: any[]): Promise<void> {
  const seen = new Set<string>();
  for (const nodeId of nodeIds) {
    const id = normalizeIdValue(nodeId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const node = await getIntelligenceNodeOrThrow(ctx, nodeId);
    if (normalizeIdValue(node.communityId) !== normalizeIdValue(communityId)) {
      throw new Error("community_intelligence_node_not_found");
    }
  }
}

async function requireNodeIdsReadableByViewer(args: {
  ctx: any;
  communityId: any;
  nodeIds: any[];
  isManager: boolean;
}): Promise<void> {
  const seen = new Set<string>();
  for (const nodeId of args.nodeIds) {
    const id = normalizeIdValue(nodeId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const node = await getIntelligenceNodeOrThrow(args.ctx, nodeId);
    if (normalizeIdValue(node.communityId) !== normalizeIdValue(args.communityId)) {
      throw new Error("community_intelligence_node_not_found");
    }
    if (!canViewerReadNode(node, args.isManager)) {
      throw new Error("community_intelligence_node_not_readable");
    }
  }
}

async function requireEdgeIdsBelongToCommunity(ctx: any, communityId: any, edgeIds: any[]): Promise<void> {
  const seen = new Set<string>();
  for (const edgeId of edgeIds) {
    const id = normalizeIdValue(edgeId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const edge = (await ctx.db.get(edgeId as any)) as unknown;
    if (!isIntelligenceEdgeRow(edge) || normalizeIdValue(edge.communityId) !== normalizeIdValue(communityId)) {
      throw new Error("community_intelligence_edge_not_found");
    }
  }
}

async function canViewerReadEdge(args: {
  ctx: any;
  communityId: any;
  edge: IntelligenceEdgeRow;
  userId: any;
  isManager: boolean;
}): Promise<boolean> {
  if (!canViewerReadVisibility(args.edge.visibilityScope, args.isManager)) return false;
  if (args.isManager) return true;
  const fromNode = await getIntelligenceNodeOrThrow(args.ctx, args.edge.fromNodeId);
  if (normalizeIdValue(fromNode.communityId) !== normalizeIdValue(args.communityId) || !canViewerReadNode(fromNode, false)) {
    return false;
  }
  if (args.edge.toNodeId) {
    const toNode = await getIntelligenceNodeOrThrow(args.ctx, args.edge.toNodeId);
    if (normalizeIdValue(toNode.communityId) !== normalizeIdValue(args.communityId) || !canViewerReadNode(toNode, false)) {
      return false;
    }
  }
  if (args.edge.toReferenceType === "trace" && args.edge.toReferenceId) {
    const trace = (await args.ctx.db.get(args.edge.toReferenceId as any)) as unknown;
    if (!isSourceTraceRow(trace) || normalizeIdValue(trace.communityId) !== normalizeIdValue(args.communityId)) return false;
    return canViewerReadTrace(trace, false, args.userId);
  }
  if (args.edge.toReferenceType === "outcome" && args.edge.toReferenceId) {
    const outcome = (await args.ctx.db.get(args.edge.toReferenceId as any)) as unknown;
    if (!isOutcomeObservationRow(outcome) || normalizeIdValue(outcome.communityId) !== normalizeIdValue(args.communityId)) return false;
    return await canViewerReadOutcome({
      ctx: args.ctx,
      outcome,
      userId: args.userId,
      isManager: false,
    });
  }
  return true;
}

async function requireEdgeIdsReadableByViewer(args: {
  ctx: any;
  communityId: any;
  edgeIds: any[];
  userId: any;
  isManager: boolean;
}): Promise<void> {
  const seen = new Set<string>();
  for (const edgeId of args.edgeIds) {
    const id = normalizeIdValue(edgeId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const edge = (await args.ctx.db.get(edgeId as any)) as unknown;
    if (!isIntelligenceEdgeRow(edge) || normalizeIdValue(edge.communityId) !== normalizeIdValue(args.communityId)) {
      throw new Error("community_intelligence_edge_not_found");
    }
    if (!(await canViewerReadEdge({
      ctx: args.ctx,
      communityId: args.communityId,
      edge,
      userId: args.userId,
      isManager: args.isManager,
    }))) {
      throw new Error("community_intelligence_edge_not_readable");
    }
  }
}

async function getNodeSnapshots(ctx: any, communityId: any, nodeIds: any[]) {
  const snapshots: Array<{ nodeId: any; version: number; updatedAt: number }> = [];
  const seen = new Set<string>();
  for (const nodeId of nodeIds) {
    const id = normalizeIdValue(nodeId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const node = await getIntelligenceNodeOrThrow(ctx, nodeId);
    if (normalizeIdValue(node.communityId) !== normalizeIdValue(communityId)) {
      throw new Error("community_intelligence_node_not_found");
    }
    snapshots.push({
      nodeId,
      version: Number(node.version ?? 0),
      updatedAt: Number(node.updatedAt ?? 0),
    });
  }
  return snapshots;
}

async function getEdgeSnapshots(ctx: any, communityId: any, edgeIds: any[]) {
  const snapshots: Array<{ edgeId: any; updatedAt: number }> = [];
  const seen = new Set<string>();
  for (const edgeId of edgeIds) {
    const id = normalizeIdValue(edgeId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const edge = (await ctx.db.get(edgeId as any)) as unknown;
    if (!isIntelligenceEdgeRow(edge) || normalizeIdValue(edge.communityId) !== normalizeIdValue(communityId)) {
      throw new Error("community_intelligence_edge_not_found");
    }
    snapshots.push({
      edgeId,
      updatedAt: Number(edge.updatedAt ?? 0),
    });
  }
  return snapshots;
}

async function requireChangeRequestTargetsCurrent(ctx: any, changeRequest: IntelligenceChangeRequestRow): Promise<void> {
  for (const snapshot of changeRequest.targetNodeSnapshots ?? []) {
    const node = await getIntelligenceNodeOrThrow(ctx, snapshot.nodeId);
    if (normalizeIdValue(node.communityId) !== normalizeIdValue(changeRequest.communityId)) {
      throw new Error("community_intelligence_node_not_found");
    }
    if (Number(node.version ?? 0) !== Number(snapshot.version) || Number(node.updatedAt ?? 0) !== Number(snapshot.updatedAt)) {
      throw new Error("community_intelligence_change_request_target_stale");
    }
  }

  for (const snapshot of changeRequest.targetEdgeSnapshots ?? []) {
    const edge = (await ctx.db.get(snapshot.edgeId as any)) as unknown;
    if (!isIntelligenceEdgeRow(edge) || normalizeIdValue(edge.communityId) !== normalizeIdValue(changeRequest.communityId)) {
      throw new Error("community_intelligence_edge_not_found");
    }
    if (Number(edge.updatedAt ?? 0) !== Number(snapshot.updatedAt)) {
      throw new Error("community_intelligence_change_request_target_stale");
    }
  }
}

async function requireReferenceBelongsToCommunity(
  ctx: any,
  communityId: any,
  referenceType: string | undefined,
  referenceId: string | undefined,
): Promise<void> {
  if (!referenceType || !referenceId) return;
  if (referenceType === "trace") {
    let trace: unknown = null;
    try {
      trace = await ctx.db.get(referenceId as any);
    } catch {
      trace = null;
    }
    if (!isSourceTraceRow(trace) || normalizeIdValue(trace.communityId) !== normalizeIdValue(communityId)) {
      throw new Error("community_source_trace_not_found");
    }
  }
  if (referenceType === "outcome") {
    let outcome: unknown = null;
    try {
      outcome = await ctx.db.get(referenceId as any);
    } catch {
      outcome = null;
    }
    if (!isOutcomeObservationRow(outcome) || normalizeIdValue(outcome.communityId) !== normalizeIdValue(communityId)) {
      throw new Error("community_outcome_observation_not_found");
    }
  }
}

async function getIntelligenceNodeOrThrow(ctx: any, nodeId: any): Promise<IntelligenceNodeRow> {
  const row = (await ctx.db.get(nodeId as any)) as unknown;
  if (!isIntelligenceNodeRow(row)) throw new Error("community_intelligence_node_not_found");
  return row;
}

async function requireChangeRequestPayloadReferencesAllowed(args: {
  ctx: any;
  communityId: any;
  operation: MutationOperation;
  requestedPayload: unknown;
  targetNodeIds: any[];
  userId?: any;
  isManager: boolean;
}): Promise<void> {
  const payload = payloadObject(args.requestedPayload);

  if (args.operation === "create_edge") {
    const targetNodeIds = new Set(args.targetNodeIds.map(normalizeIdValue));
    if (payload.toNodeId) {
      if (!targetNodeIds.has(normalizeIdValue(payload.toNodeId))) {
        throw new Error("community_intelligence_edge_to_node_target_required");
      }
      if (args.isManager) {
        await requireNodeIdsBelongToCommunity(args.ctx, args.communityId, [payload.toNodeId]);
      } else {
        await requireNodeIdsReadableByViewer({
          ctx: args.ctx,
          communityId: args.communityId,
          nodeIds: [payload.toNodeId],
          isManager: false,
        });
      }
    }

    const toReferenceType =
      typeof payload.toReferenceType === "string" && EDGE_REFERENCE_TYPES.has(payload.toReferenceType)
        ? payload.toReferenceType
        : undefined;
    const toReferenceId = normalizeOptionalLongText(payload.toReferenceId, 512);
    if (toReferenceType === "trace" && toReferenceId) {
      if (args.isManager) {
        await requireTraceIdsBelongToCommunity(args.ctx, args.communityId, [toReferenceId]);
      } else {
        await requireTraceIdsReadableByViewer({
          ctx: args.ctx,
          communityId: args.communityId,
          traceIds: [toReferenceId],
          userId: args.userId,
          isManager: false,
        });
      }
    }
    if (toReferenceType === "outcome" && toReferenceId) {
      if (args.isManager) {
        await requireOutcomeIdsBelongToCommunity(args.ctx, args.communityId, [toReferenceId]);
      } else {
        await requireOutcomeIdsReadableByViewer({
          ctx: args.ctx,
          communityId: args.communityId,
          outcomeIds: [toReferenceId],
          userId: args.userId,
          isManager: false,
        });
      }
    }
  }

  if (payload.deprecatedByNodeId) {
    if (args.isManager) {
      await requireNodeIdsBelongToCommunity(args.ctx, args.communityId, [payload.deprecatedByNodeId]);
    } else {
      await requireNodeIdsReadableByViewer({
        ctx: args.ctx,
        communityId: args.communityId,
        nodeIds: [payload.deprecatedByNodeId],
        isManager: false,
      });
    }
  }
}

async function getChangeRequestOrThrow(ctx: any, changeRequestId: any): Promise<IntelligenceChangeRequestRow> {
  const row = (await ctx.db.get(changeRequestId as any)) as IntelligenceChangeRequestRow | null;
  if (!row) throw new Error("community_intelligence_change_request_not_found");
  return row;
}

async function requireChangeRequestReferencesAllowedForApply(ctx: any, changeRequest: IntelligenceChangeRequestRow): Promise<void> {
  const sourceTraceIds = changeRequest.sourceTraceIds ?? [];
  const outcomeObservationIds = changeRequest.outcomeObservationIds ?? [];
  const targetNodeIds = changeRequest.targetNodeIds ?? [];
  const targetEdgeIds = changeRequest.targetEdgeIds ?? [];

  if (changeRequest.createdByActorType === "member") {
    if (!changeRequest.createdByUserId) {
      throw new Error("community_intelligence_change_request_member_actor_required");
    }
    await requireTraceIdsReadableByViewer({
      ctx,
      communityId: changeRequest.communityId,
      traceIds: sourceTraceIds,
      userId: changeRequest.createdByUserId,
      isManager: false,
    });
    await requireOutcomeIdsReadableByViewer({
      ctx,
      communityId: changeRequest.communityId,
      outcomeIds: outcomeObservationIds,
      userId: changeRequest.createdByUserId,
      isManager: false,
    });
    await requireNodeIdsReadableByViewer({
      ctx,
      communityId: changeRequest.communityId,
      nodeIds: targetNodeIds,
      isManager: false,
    });
    await requireEdgeIdsReadableByViewer({
      ctx,
      communityId: changeRequest.communityId,
      edgeIds: targetEdgeIds,
      userId: changeRequest.createdByUserId,
      isManager: false,
    });
    await requireChangeRequestPayloadReferencesAllowed({
      ctx,
      communityId: changeRequest.communityId,
      operation: changeRequest.operation,
      requestedPayload: changeRequest.requestedPayload,
      targetNodeIds,
      userId: changeRequest.createdByUserId,
      isManager: false,
    });
    return;
  }

  await requireTraceIdsBelongToCommunity(ctx, changeRequest.communityId, sourceTraceIds);
  await requireOutcomeIdsBelongToCommunity(ctx, changeRequest.communityId, outcomeObservationIds);
  await requireNodeIdsBelongToCommunity(ctx, changeRequest.communityId, targetNodeIds);
  await requireEdgeIdsBelongToCommunity(ctx, changeRequest.communityId, targetEdgeIds);
  await requireChangeRequestPayloadReferencesAllowed({
    ctx,
    communityId: changeRequest.communityId,
    operation: changeRequest.operation,
    requestedPayload: changeRequest.requestedPayload,
    targetNodeIds,
    userId: changeRequest.createdByUserId,
    isManager: true,
  });
}

async function insertMutationLog(args: {
  ctx: any;
  communityId: any;
  operation: MutationOperation;
  actorType: ActorType;
  actorUserId?: any;
  actorAgentKey?: string;
  targetNodeIds?: any[];
  targetEdgeIds?: any[];
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
  sourceTraceIds?: any[];
  compilerRunId?: string;
  policyDecisionId?: string;
  reason?: string;
  nowMs: number;
}): Promise<any> {
  const targetNodeIds = args.targetNodeIds ?? [];
  const targetEdgeIds = args.targetEdgeIds ?? [];
  return await args.ctx.db.insert("communityIntelligenceMutations" as any, {
    communityId: args.communityId,
    operation: args.operation,
    actorType: args.actorType,
    ...(args.actorUserId ? { actorUserId: args.actorUserId } : {}),
    ...(args.actorAgentKey ? { actorAgentKey: args.actorAgentKey } : {}),
    targetNodeIds,
    targetEdgeIds,
    primaryTargetNodeId: targetNodeIds[0],
    primaryTargetEdgeId: targetEdgeIds[0],
    ...(args.beforeSnapshot !== undefined ? { beforeSnapshot: args.beforeSnapshot } : {}),
    ...(args.afterSnapshot !== undefined ? { afterSnapshot: args.afterSnapshot } : {}),
    sourceTraceIds: args.sourceTraceIds ?? [],
    ...(args.compilerRunId ? { compilerRunId: args.compilerRunId } : {}),
    ...(args.policyDecisionId ? { policyDecisionId: args.policyDecisionId } : {}),
    reason: normalizeOptionalText(args.reason, 2000) ?? "typed_directory_mutation",
    createdAt: args.nowMs,
  });
}

export async function upsertCommunitySourceTrace(args: {
  ctx: any;
  communityId: any;
  sourceType: SourceTraceType;
  sourceId?: string;
  title?: string | null;
  summary: string;
  visibilityScope?: VisibilityScope;
  sourceVisibility?: SourceVisibility;
  workflowId?: string | null;
  artifactIds?: string[] | null;
  outcomeObservationIds?: any[] | null;
  actorType: ActorType;
  actorUserId?: any;
  actorAgentKey?: string;
  allowExistingUpdate?: boolean;
  nowMs: number;
}): Promise<ReturnType<typeof mapTraceRow>> {
  const sourceId = normalizeOptionalLongText(args.sourceId, 512);
  const title = normalizeOptionalLongText(args.title, 240);
  const summary = normalizeBoundedText(
    args.summary,
    4000,
    "community_source_trace_summary_required",
  );
  const visibilityScope = args.visibilityScope ?? "community";
  const sourceVisibility = args.sourceVisibility ?? visibilityScope;
  const workflowId = normalizeWorkflowId(args.workflowId);
  const artifactIds = normalizeStringList(args.artifactIds, 50, 512);
  const outcomeObservationIds = Array.isArray(args.outcomeObservationIds)
    ? args.outcomeObservationIds
    : undefined;
  const actorAgentKey = normalizeActorKey(args.actorAgentKey);

  const existing = sourceId
    ? ((await args.ctx.db
        .query("communitySourceTraces" as any)
        .withIndex("by_community_source", (q: any) =>
          q.eq("communityId", args.communityId).eq("sourceType", args.sourceType).eq("sourceId", sourceId),
        )
        .first()) as SourceTraceRow | null)
    : null;

  if (existing) {
    if (!args.allowExistingUpdate) {
      throw new Error("community_source_trace_source_conflict");
    }
    await args.ctx.db.patch(existing._id as any, {
      title,
      summary,
      visibilityScope,
      sourceVisibility,
      workflowId,
      artifactIds,
      ...(outcomeObservationIds ? { outcomeObservationIds } : {}),
      actorType: args.actorType,
      ...(args.actorUserId ? { actorUserId: args.actorUserId } : { actorUserId: undefined }),
      ...(actorAgentKey ? { actorAgentKey } : { actorAgentKey: undefined }),
      updatedAt: args.nowMs,
    });
    const updated = (await args.ctx.db.get(existing._id as any)) as SourceTraceRow | null;
    if (!updated) throw new Error("community_source_trace_not_found");
    return mapTraceRow(updated);
  }

  const id = await args.ctx.db.insert("communitySourceTraces" as any, {
    communityId: args.communityId,
    sourceType: args.sourceType,
    ...(sourceId ? { sourceId } : {}),
    title,
    summary,
    visibilityScope,
    sourceVisibility,
    workflowId,
    artifactIds,
    outcomeObservationIds: outcomeObservationIds ?? [],
    actorType: args.actorType,
    ...(args.actorUserId ? { actorUserId: args.actorUserId } : {}),
    ...(actorAgentKey ? { actorAgentKey } : {}),
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const created = (await args.ctx.db.get(id as any)) as SourceTraceRow | null;
  if (!created) throw new Error("community_source_trace_create_failed");
  return mapTraceRow(created);
}

export async function recordTrustedCommunitySourceTraceCore(args: {
  ctx: any;
  communityId: any;
  sourceType: SourceTraceType;
  sourceId: string;
  title?: string | null;
  summary: string;
  visibilityScope?: VisibilityScope;
  sourceVisibility?: SourceVisibility;
  workflowId?: string | null;
  artifactIds?: string[] | null;
  outcomeObservationIds?: any[] | null;
  actorType?: ActorType;
  actorUserId?: any;
  actorAgentKey?: string;
  nowMs?: number;
}): Promise<ReturnType<typeof mapTraceRow>> {
  const community = await args.ctx.db.get(args.communityId);
  if (!community) throw new Error("community_not_found");
  if (args.sourceType === "manual" || args.sourceType === "external") {
    throw new Error("community_source_trace_trusted_source_type_required");
  }
  const sourceId = normalizeBoundedText(
    args.sourceId,
    512,
    "community_source_trace_source_id_required",
  );
  const visibilityScope = args.visibilityScope ?? "admin";
  const sourceVisibility = args.sourceVisibility ?? visibilityScope;
  const actorType = args.actorType ?? "system";
  if ((actorType === "member" || actorType === "admin") && !args.actorUserId) {
    throw new Error("community_source_trace_actor_user_required");
  }
  const outcomeObservationIds = args.outcomeObservationIds ?? [];
  if (outcomeObservationIds.length > 0) {
    await requireOutcomeIdsBelongToCommunity(args.ctx, args.communityId, outcomeObservationIds);
  }
  return await upsertCommunitySourceTrace({
    ctx: args.ctx,
    communityId: args.communityId,
    sourceType: args.sourceType,
    sourceId,
    title: args.title,
    summary: args.summary,
    visibilityScope,
    sourceVisibility,
    workflowId: args.workflowId,
    artifactIds: args.artifactIds,
    outcomeObservationIds,
    actorType,
    actorUserId: args.actorUserId,
    actorAgentKey:
      actorType === "agent" || actorType === "compiler" || actorType === "system"
        ? args.actorAgentKey ?? "trusted_evidence_bridge"
        : args.actorAgentKey,
    allowExistingUpdate: true,
    nowMs: args.nowMs ?? Date.now(),
  });
}

async function insertChangeRequest(args: {
  ctx: any;
  communityId: any;
  operation: MutationOperation;
  sourceTraceIds?: any[];
  outcomeObservationIds?: any[];
  targetNodeIds?: any[];
  targetEdgeIds?: any[];
  requestedPayload?: unknown;
  confidence?: number;
  privacyRisk?: number;
  actorType: ActorType;
  actorUserId?: any;
  actorAgentKey?: string;
  nowMs: number;
}): Promise<any> {
  const targetNodeIds = args.targetNodeIds ?? [];
  const targetEdgeIds = args.targetEdgeIds ?? [];
  const targetNodeSnapshots = await getNodeSnapshots(args.ctx, args.communityId, targetNodeIds);
  const targetEdgeSnapshots = await getEdgeSnapshots(args.ctx, args.communityId, targetEdgeIds);
  return await args.ctx.db.insert("communityIntelligenceChangeRequests" as any, {
    communityId: args.communityId,
    operation: args.operation,
    status: "pending_decision",
    sourceTraceIds: args.sourceTraceIds ?? [],
    outcomeObservationIds: args.outcomeObservationIds ?? [],
    targetNodeIds,
    targetEdgeIds,
    primaryTargetNodeId: targetNodeIds[0],
    primaryTargetEdgeId: targetEdgeIds[0],
    targetNodeSnapshots,
    targetEdgeSnapshots,
    requestedPayload: args.requestedPayload ?? {},
    confidence: clampScore(args.confidence, 0.5),
    privacyRisk: clampScore(args.privacyRisk, 0.2),
    createdByActorType: args.actorType,
    ...(args.actorUserId ? { createdByUserId: args.actorUserId } : {}),
    ...(args.actorAgentKey ? { createdByAgentKey: args.actorAgentKey } : {}),
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
}

export async function createTrustedCommunityIntelligenceChangeRequest(args: {
  ctx: any;
  communityId: any;
  operation: MutationOperation;
  sourceTraceIds?: any[];
  outcomeObservationIds?: any[];
  targetNodeIds?: any[];
  targetEdgeIds?: any[];
  requestedPayload?: unknown;
  confidence?: number;
  privacyRisk?: number;
  actorType: "admin" | "agent" | "compiler" | "system";
  actorUserId?: any;
  actorAgentKey?: string;
  nowMs: number;
}): Promise<ReturnType<typeof mapChangeRequestRow>> {
  const sourceTraceIds = args.sourceTraceIds ?? [];
  const outcomeObservationIds = args.outcomeObservationIds ?? [];
  const targetNodeIds = args.targetNodeIds ?? [];
  const targetEdgeIds = args.targetEdgeIds ?? [];
  if (args.operation !== "create_node" && targetNodeIds.length === 0 && targetEdgeIds.length === 0) {
    throw new Error("community_intelligence_change_request_target_required");
  }
  if (args.operation === "create_edge" && targetNodeIds.length === 0) {
    throw new Error("community_intelligence_change_request_edge_from_node_required");
  }
  await requireTraceIdsBelongToCommunity(args.ctx, args.communityId, sourceTraceIds);
  await requireOutcomeIdsBelongToCommunity(args.ctx, args.communityId, outcomeObservationIds);
  await requireNodeIdsBelongToCommunity(args.ctx, args.communityId, targetNodeIds);
  await requireEdgeIdsBelongToCommunity(args.ctx, args.communityId, targetEdgeIds);
  await requireChangeRequestPayloadReferencesAllowed({
    ctx: args.ctx,
    communityId: args.communityId,
    operation: args.operation,
    requestedPayload: args.requestedPayload,
    targetNodeIds,
    userId: args.actorUserId,
    isManager: true,
  });
  const changeRequestId = await insertChangeRequest({
    ctx: args.ctx,
    communityId: args.communityId,
    operation: args.operation,
    sourceTraceIds,
    outcomeObservationIds,
    targetNodeIds,
    targetEdgeIds,
    requestedPayload: args.requestedPayload,
    confidence: args.confidence,
    privacyRisk: args.privacyRisk,
    actorType: args.actorType,
    actorUserId: args.actorType === "admin" ? args.actorUserId : undefined,
    actorAgentKey:
      args.actorType === "admin"
        ? undefined
        : normalizeActorKey(args.actorAgentKey) ?? args.actorType,
    nowMs: args.nowMs,
  });
  const changeRequest = await getChangeRequestOrThrow(args.ctx, changeRequestId);
  return mapChangeRequestRow(changeRequest);
}

async function resolveWriteActor(args: {
  ctx: any;
  communityId: any;
  userId: any;
  requestedActorType?: "member" | "admin";
}): Promise<{ actorType: "member" | "admin"; actorUserId: any; isManager: boolean }> {
  const isManager = await viewerCanManageCommunity(args.ctx, args.communityId, args.userId);
  const actorType = args.requestedActorType ?? (isManager ? "admin" : "member");
  if (actorType === "admin" && !isManager) {
    throw new Error("community_intelligence_actor_forbidden");
  }
  return {
    actorType,
    actorUserId: args.userId,
    isManager,
  };
}

async function resolveAdminTruthActor(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<{ actorType: "admin"; actorUserId: any; isManager: true }> {
  await requireCommunityManager({ ctx: args.ctx, communityId: args.communityId, userId: args.userId });
  return {
    actorType: "admin",
    actorUserId: args.userId,
    isManager: true,
  };
}

async function resolvePolicyDecisionActor(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<{
  actorType: "admin";
  actorUserId: any;
  isManager: true;
}> {
  await requireCommunityManager({ ctx: args.ctx, communityId: args.communityId, userId: args.userId });
  return {
    actorType: "admin",
    actorUserId: args.userId,
    isManager: true,
  };
}

function typeMatchesView(type: NodeType, view: string): boolean {
  if (view === "all" || view === "workflow_context") return true;
  if (view === "playbooks") return type === "playbook";
  if (view === "insights") return type === "insight";
  if (view === "examples") return type === "example";
  if (view === "warnings") return type === "warning_failure";
  if (view === "decisions") return type === "decision_judgment";
  if (view === "open_questions") return type === "open_question";
  return true;
}

function statusMatchesView(status: NodeStatus, view: string): boolean {
  if (view === "canonical") return status === "canonical";
  if (view === "contested") return status === "contested";
  if (view === "stale") return status === "stale";
  return true;
}

function textScore(node: IntelligenceNodeRow, queryText: string): number {
  const query = queryText.trim().toLowerCase();
  if (!query) return 0;
  const tokens = query.split(/\s+/).filter((token) => token.length >= 2).slice(0, 12);
  if (tokens.length === 0) return 0;
  const haystack = [
    node.title,
    node.bodyMd,
    node.appliesWhen ?? "",
    node.doesNotApplyWhen ?? "",
    ...(node.tags ?? []),
  ].join(" ").toLowerCase();
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0) / tokens.length;
}

function retrievalScore(args: {
  node: IntelligenceNodeRow;
  workflowId?: string;
  query?: string;
}): number {
  const statusWeight: Record<NodeStatus, number> = {
    draft: -1,
    candidate: 0,
    promising: 0.35,
    validated: 0.7,
    canonical: 0.85,
    contested: 0.1,
    stale: -0.1,
    deprecated: -1,
    archived: -1,
  };
  const workflowMatch = args.workflowId && (args.node.workflowIds ?? []).includes(args.workflowId) ? 0.8 : 0;
  return (
    (statusWeight[args.node.status] ?? 0) +
    workflowMatch +
    clampScore(args.node.confidence) * 0.6 +
    clampScore(args.node.retrievalUsefulnessScore) * 0.35 +
    clampScore(args.node.outcomeImpactScore) * 0.35 +
    textScore(args.node, args.query ?? "") * 0.8 -
    clampScore(args.node.stalenessScore) * 0.5
  );
}

async function retrieveNodesForWorkflow(args: {
  ctx: any;
  communityId: any;
  userId: any;
  isManager: boolean;
  workflowId?: string;
  query?: string;
  types?: NodeType[];
  statuses?: NodeStatus[];
  limit: number;
}): Promise<IntelligenceNodeRow[]> {
  const statusSet = normalizeRequestedStatuses(args.statuses, args.isManager);
  const typeSet = new Set(args.types ?? []);
  const rows = (await args.ctx.db
    .query("communityIntelligenceNodes" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
    .collect()) as IntelligenceNodeRow[];
  return rows
    .filter((row) => statusSet.has(row.status))
    .filter((row) => typeSet.size === 0 || typeSet.has(row.type))
    .filter((row) => canViewerReadNode(row, args.isManager))
    .filter((row) => {
      if (!args.workflowId) return true;
      if ((row.workflowIds ?? []).length === 0) return true;
      return (row.workflowIds ?? []).includes(args.workflowId);
    })
    .map((node) => ({ node, score: retrievalScore({ node, workflowId: args.workflowId, query: args.query }) }))
    .filter((entry) => entry.score > -0.5)
    .sort((a, b) => b.score - a.score || b.node.updatedAt - a.node.updatedAt)
    .slice(0, args.limit)
    .map((entry) => entry.node);
}

export const recordCommunitySourceTrace = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    sourceType: v.union(v.literal("manual"), v.literal("external")),
    sourceId: v.optional(v.string()),
    title: v.optional(v.string()),
    summary: v.string(),
    visibilityScope: v.optional(
      v.union(v.literal("private"), v.literal("admin"), v.literal("community"), v.literal("public")),
    ),
    sourceVisibility: v.optional(
      v.union(
        v.literal("private"),
        v.literal("admin"),
        v.literal("community"),
        v.literal("public"),
        v.literal("redacted"),
      ),
    ),
    workflowId: v.optional(v.string()),
    artifactIds: v.optional(v.array(v.string())),
    actorType: v.optional(
      v.union(
        v.literal("member"),
        v.literal("admin"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const actor = await resolveWriteActor({
      ctx,
      communityId: args.communityId,
      userId,
      requestedActorType: args.actorType,
    });
    const traceVisibility = resolveTraceVisibility({
      requestedVisibility: args.visibilityScope,
      requestedSourceVisibility: args.sourceVisibility,
      isManager: actor.isManager,
    });
    return await upsertCommunitySourceTrace({
      ctx,
      communityId: args.communityId,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      title: args.title,
      summary: args.summary,
      visibilityScope: traceVisibility.visibilityScope,
      sourceVisibility: traceVisibility.sourceVisibility,
      workflowId: args.workflowId,
      artifactIds: args.artifactIds,
      actorType: actor.actorType,
      actorUserId: actor.actorUserId,
      allowExistingUpdate: actor.isManager,
      nowMs: Date.now(),
    });
  },
});

export const createCommunityIntelligenceNode = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    type: v.union(
      v.literal("playbook"),
      v.literal("insight"),
      v.literal("example"),
      v.literal("warning_failure"),
      v.literal("decision_judgment"),
      v.literal("open_question"),
    ),
    title: v.string(),
    bodyMd: v.string(),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("candidate"),
        v.literal("promising"),
        v.literal("validated"),
        v.literal("canonical"),
        v.literal("contested"),
        v.literal("stale"),
        v.literal("deprecated"),
        v.literal("archived"),
      ),
    ),
    visibilityScope: v.optional(
      v.union(v.literal("private"), v.literal("admin"), v.literal("community"), v.literal("public")),
    ),
    sourceVisibility: v.optional(
      v.union(
        v.literal("private"),
        v.literal("admin"),
        v.literal("community"),
        v.literal("public"),
        v.literal("redacted"),
      ),
    ),
    confidence: v.optional(v.number()),
    evidenceStrength: v.optional(
      v.union(
        v.literal("none"),
        v.literal("anecdotal"),
        v.literal("observed"),
        v.literal("measured"),
        v.literal("validated"),
      ),
    ),
    appliesWhen: v.optional(v.string()),
    doesNotApplyWhen: v.optional(v.string()),
    workflowIds: v.optional(v.array(v.string())),
    tags: v.optional(v.array(v.string())),
    sourceTraceIds: v.optional(v.array(v.id("communitySourceTraces"))),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const actor = await resolveAdminTruthActor({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const sourceTraceIds = args.sourceTraceIds ?? [];
    await requireTraceIdsBelongToCommunity(ctx, args.communityId, sourceTraceIds);
    const nowMs = Date.now();
    const status = args.status ?? "candidate";
    const nodeVisibility = resolveNodeVisibility({
      status,
      requestedVisibility: args.visibilityScope,
      requestedSourceVisibility: args.sourceVisibility,
    });
    const id = await ctx.db.insert("communityIntelligenceNodes" as any, {
      communityId: args.communityId,
      type: args.type,
      title: normalizeBoundedText(args.title, 240, "community_intelligence_title_required"),
      bodyMd: normalizeBody(args.bodyMd),
      status,
      visibilityScope: nodeVisibility.visibilityScope,
      sourceVisibility: nodeVisibility.sourceVisibility,
      confidence: clampScore(args.confidence, 0.5),
      evidenceStrength: args.evidenceStrength ?? "none",
      appliesWhen: normalizeOptionalLongText(args.appliesWhen, 4000),
      doesNotApplyWhen: normalizeOptionalLongText(args.doesNotApplyWhen, 4000),
      workflowIds: normalizeStringList(args.workflowIds, 50, 256),
      tags: normalizeStringList(args.tags, 50, 80),
      sourceTraceIds,
      outcomeObservationIds: [],
      stalenessScore: 0,
      retrievalUsefulnessScore: 0,
      outcomeImpactScore: 0,
      createdByActorType: actor.actorType,
      createdByUserId: actor.actorUserId,
      lastUpdatedByActorType: actor.actorType,
      lastUpdatedByUserId: actor.actorUserId,
      version: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = await getIntelligenceNodeOrThrow(ctx, id);
    await insertMutationLog({
      ctx,
      communityId: args.communityId,
      operation: "create_node",
      actorType: actor.actorType,
      actorUserId: actor.actorUserId,
      targetNodeIds: [created._id],
      afterSnapshot: mapNodeRow(created),
      sourceTraceIds,
      reason: args.reason,
      nowMs,
    });
    return mapNodeRow(created);
  },
});

export const updateCommunityIntelligenceNode = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    nodeId: v.id("communityIntelligenceNodes"),
    operation: v.optional(
      v.union(
        v.literal("update_node"),
        v.literal("attach_evidence"),
        v.literal("promote_status"),
        v.literal("mark_contested"),
        v.literal("mark_stale"),
        v.literal("deprecate_node"),
        v.literal("update_confidence"),
        v.literal("update_visibility"),
      ),
    ),
    updates: v.object({
      title: v.optional(v.string()),
      bodyMd: v.optional(v.string()),
      status: v.optional(
        v.union(
          v.literal("draft"),
          v.literal("candidate"),
          v.literal("promising"),
          v.literal("validated"),
          v.literal("canonical"),
          v.literal("contested"),
          v.literal("stale"),
          v.literal("deprecated"),
          v.literal("archived"),
        ),
      ),
      visibilityScope: v.optional(
        v.union(v.literal("private"), v.literal("admin"), v.literal("community"), v.literal("public")),
      ),
      sourceVisibility: v.optional(
        v.union(
          v.literal("private"),
          v.literal("admin"),
          v.literal("community"),
          v.literal("public"),
          v.literal("redacted"),
        ),
      ),
      confidence: v.optional(v.number()),
      evidenceStrength: v.optional(
        v.union(
          v.literal("none"),
          v.literal("anecdotal"),
          v.literal("observed"),
          v.literal("measured"),
          v.literal("validated"),
        ),
      ),
      appliesWhen: v.optional(v.string()),
      doesNotApplyWhen: v.optional(v.string()),
      workflowIds: v.optional(v.array(v.string())),
      tags: v.optional(v.array(v.string())),
      sourceTraceIds: v.optional(v.array(v.id("communitySourceTraces"))),
      stalenessScore: v.optional(v.number()),
      retrievalUsefulnessScore: v.optional(v.number()),
      outcomeImpactScore: v.optional(v.number()),
      deprecatedByNodeId: v.optional(v.id("communityIntelligenceNodes")),
    }),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await getIntelligenceNodeOrThrow(ctx, args.nodeId);
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const actor = await resolveAdminTruthActor({
      ctx,
      communityId: existing.communityId,
      userId,
    });
    const updates = args.updates ?? {};
    const sourceTraceIds = updates.sourceTraceIds ?? existing.sourceTraceIds ?? [];
    await requireTraceIdsBelongToCommunity(ctx, existing.communityId, sourceTraceIds);
    if (updates.deprecatedByNodeId) {
      const deprecatedBy = await getIntelligenceNodeOrThrow(ctx, updates.deprecatedByNodeId);
      if (normalizeIdValue(deprecatedBy.communityId) !== normalizeIdValue(existing.communityId)) {
        throw new Error("community_intelligence_deprecated_by_node_not_found");
      }
    }
    const nowMs = Date.now();
    const nextStatus = updates.status ?? existing.status;
    const nodeVisibility = resolveNodeVisibility({
      status: nextStatus,
      requestedVisibility: updates.visibilityScope ?? existing.visibilityScope,
      requestedSourceVisibility: updates.sourceVisibility ?? existing.sourceVisibility,
    });
    const patch: Record<string, unknown> = {
      updatedAt: nowMs,
      version: Number(existing.version ?? 1) + 1,
      lastUpdatedByActorType: actor.actorType,
      lastUpdatedByUserId: actor.actorUserId,
      lastUpdatedByAgentKey: undefined,
    };
    if (updates.title !== undefined) {
      patch.title = normalizeBoundedText(updates.title, 240, "community_intelligence_title_required");
    }
    if (updates.bodyMd !== undefined) patch.bodyMd = normalizeBody(updates.bodyMd);
    if (updates.status !== undefined) patch.status = nextStatus;
    if (
      updates.status !== undefined ||
      updates.visibilityScope !== undefined ||
      updates.sourceVisibility !== undefined ||
      DRAFT_STATUSES.has(nextStatus)
    ) {
      patch.visibilityScope = nodeVisibility.visibilityScope;
      patch.sourceVisibility = nodeVisibility.sourceVisibility;
    }
    if (updates.confidence !== undefined) patch.confidence = clampScore(updates.confidence);
    if (updates.evidenceStrength !== undefined) patch.evidenceStrength = updates.evidenceStrength;
    if (updates.appliesWhen !== undefined) patch.appliesWhen = normalizeOptionalLongText(updates.appliesWhen, 4000);
    if (updates.doesNotApplyWhen !== undefined) {
      patch.doesNotApplyWhen = normalizeOptionalLongText(updates.doesNotApplyWhen, 4000);
    }
    if (updates.workflowIds !== undefined) patch.workflowIds = normalizeStringList(updates.workflowIds, 50, 256);
    if (updates.tags !== undefined) patch.tags = normalizeStringList(updates.tags, 50, 80);
    if (updates.sourceTraceIds !== undefined) patch.sourceTraceIds = sourceTraceIds;
    if (updates.stalenessScore !== undefined) patch.stalenessScore = clampScore(updates.stalenessScore);
    if (updates.retrievalUsefulnessScore !== undefined) {
      patch.retrievalUsefulnessScore = clampScore(updates.retrievalUsefulnessScore);
    }
    if (updates.outcomeImpactScore !== undefined) patch.outcomeImpactScore = clampScore(updates.outcomeImpactScore);
    if (updates.deprecatedByNodeId !== undefined) patch.deprecatedByNodeId = updates.deprecatedByNodeId;

    await ctx.db.patch(existing._id as any, patch);
    const updated = await getIntelligenceNodeOrThrow(ctx, existing._id);
    await insertMutationLog({
      ctx,
      communityId: existing.communityId,
      operation: args.operation ?? "update_node",
      actorType: actor.actorType,
      actorUserId: actor.actorUserId,
      targetNodeIds: [existing._id],
      beforeSnapshot: mapNodeRow(existing),
      afterSnapshot: mapNodeRow(updated),
      sourceTraceIds,
      reason: args.reason,
      nowMs,
    });
    return mapNodeRow(updated);
  },
});

export const createCommunityIntelligenceEdge = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    fromNodeId: v.id("communityIntelligenceNodes"),
    toNodeId: v.optional(v.id("communityIntelligenceNodes")),
    toReferenceType: v.optional(
      v.union(
        v.literal("trace"),
        v.literal("workflow"),
        v.literal("artifact"),
        v.literal("outcome"),
        v.literal("person"),
        v.literal("tool"),
        v.literal("agent_run"),
        v.literal("resource"),
      ),
    ),
    toReferenceId: v.optional(v.string()),
    type: v.union(
      v.literal("supports"),
      v.literal("contradicts"),
      v.literal("derived_from"),
      v.literal("applies_to_workflow"),
      v.literal("has_example"),
      v.literal("validated_by"),
      v.literal("deprecated_by"),
    ),
    confidence: v.optional(v.number()),
    evidenceTraceIds: v.optional(v.array(v.id("communitySourceTraces"))),
    visibilityScope: v.optional(
      v.union(v.literal("private"), v.literal("admin"), v.literal("community"), v.literal("public")),
    ),
    compilerRunId: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const actor = await resolveAdminTruthActor({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const fromNode = await getIntelligenceNodeOrThrow(ctx, args.fromNodeId);
    if (normalizeIdValue(fromNode.communityId) !== normalizeIdValue(args.communityId)) {
      throw new Error("community_intelligence_from_node_not_found");
    }
    const hasNodeTarget = Boolean(args.toNodeId);
    const hasReferenceTarget = Boolean(args.toReferenceType && args.toReferenceId);
    if (hasNodeTarget === hasReferenceTarget) {
      throw new Error("community_intelligence_edge_target_invalid");
    }
    if (args.toNodeId) {
      const toNode = await getIntelligenceNodeOrThrow(ctx, args.toNodeId);
      if (normalizeIdValue(toNode.communityId) !== normalizeIdValue(args.communityId)) {
        throw new Error("community_intelligence_to_node_not_found");
      }
    }
    const evidenceTraceIds = args.evidenceTraceIds ?? [];
    await requireTraceIdsBelongToCommunity(ctx, args.communityId, evidenceTraceIds);
    const toReferenceId = args.toReferenceId
      ? normalizeBoundedText(args.toReferenceId, 512, "reference_id_required")
      : undefined;
    await requireReferenceBelongsToCommunity(ctx, args.communityId, args.toReferenceType, toReferenceId);
    const nowMs = Date.now();
    const id = await ctx.db.insert("communityIntelligenceEdges" as any, {
      communityId: args.communityId,
      fromNodeId: args.fromNodeId,
      ...(args.toNodeId ? { toNodeId: args.toNodeId } : {}),
      ...(args.toReferenceType ? { toReferenceType: args.toReferenceType } : {}),
      ...(toReferenceId ? { toReferenceId } : {}),
      type: args.type,
      confidence: clampScore(args.confidence, 0.5),
      evidenceTraceIds,
      visibilityScope: args.visibilityScope ?? "community",
      createdByActorType: actor.actorType,
      createdByUserId: actor.actorUserId,
      ...(args.compilerRunId ? { compilerRunId: normalizeBoundedText(args.compilerRunId, 512, "compiler_run_id_required") } : {}),
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id as any)) as IntelligenceEdgeRow | null;
    if (!created) throw new Error("community_intelligence_edge_create_failed");
    await insertMutationLog({
      ctx,
      communityId: args.communityId,
      operation: "create_edge",
      actorType: actor.actorType,
      actorUserId: actor.actorUserId,
      targetNodeIds: [args.fromNodeId, ...(args.toNodeId ? [args.toNodeId] : [])],
      targetEdgeIds: [created._id],
      afterSnapshot: mapEdgeRow(created),
      sourceTraceIds: evidenceTraceIds,
      compilerRunId: args.compilerRunId,
      reason: args.reason,
      nowMs,
    });
    return mapEdgeRow(created);
  },
});

export const createCommunityIntelligenceChangeRequest = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    operation: v.union(
      v.literal("create_node"),
      v.literal("update_node"),
      v.literal("create_edge"),
      v.literal("attach_evidence"),
      v.literal("attach_outcome"),
      v.literal("promote_status"),
      v.literal("mark_contested"),
      v.literal("mark_stale"),
      v.literal("deprecate_node"),
      v.literal("update_confidence"),
      v.literal("update_visibility"),
    ),
    sourceTraceIds: v.optional(v.array(v.id("communitySourceTraces"))),
    outcomeObservationIds: v.optional(v.array(v.id("communityOutcomeObservations"))),
    targetNodeIds: v.optional(v.array(v.id("communityIntelligenceNodes"))),
    targetEdgeIds: v.optional(v.array(v.id("communityIntelligenceEdges"))),
    requestedPayload: v.optional(v.any()),
    confidence: v.optional(v.number()),
    privacyRisk: v.optional(v.number()),
    actorType: v.optional(
      v.union(
        v.literal("member"),
        v.literal("admin"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const actor = await resolveWriteActor({
      ctx,
      communityId: args.communityId,
      userId,
      requestedActorType: args.actorType,
    });
    const sourceTraceIds = args.sourceTraceIds ?? [];
    const outcomeObservationIds = args.outcomeObservationIds ?? [];
    const targetNodeIds = args.targetNodeIds ?? [];
    const targetEdgeIds = args.targetEdgeIds ?? [];
    if (args.operation !== "create_node" && targetNodeIds.length === 0 && targetEdgeIds.length === 0) {
      throw new Error("community_intelligence_change_request_target_required");
    }
    if (args.operation === "create_edge" && targetNodeIds.length === 0) {
      throw new Error("community_intelligence_change_request_edge_from_node_required");
    }
    if (actor.isManager) {
      await requireTraceIdsBelongToCommunity(ctx, args.communityId, sourceTraceIds);
      await requireOutcomeIdsBelongToCommunity(ctx, args.communityId, outcomeObservationIds);
      await requireNodeIdsBelongToCommunity(ctx, args.communityId, targetNodeIds);
      await requireEdgeIdsBelongToCommunity(ctx, args.communityId, targetEdgeIds);
    } else {
      await requireTraceIdsReadableByViewer({
        ctx,
        communityId: args.communityId,
        traceIds: sourceTraceIds,
        userId,
        isManager: false,
      });
      await requireOutcomeIdsReadableByViewer({
        ctx,
        communityId: args.communityId,
        outcomeIds: outcomeObservationIds,
        userId,
        isManager: false,
      });
      await requireNodeIdsReadableByViewer({
        ctx,
        communityId: args.communityId,
        nodeIds: targetNodeIds,
        isManager: false,
      });
      await requireEdgeIdsReadableByViewer({
        ctx,
        communityId: args.communityId,
        edgeIds: targetEdgeIds,
        userId,
        isManager: false,
      });
    }
    await requireChangeRequestPayloadReferencesAllowed({
      ctx,
      communityId: args.communityId,
      operation: args.operation,
      requestedPayload: args.requestedPayload,
      targetNodeIds,
      userId,
      isManager: actor.isManager,
    });
    const nowMs = Date.now();
    const changeRequestId = await insertChangeRequest({
      ctx,
      communityId: args.communityId,
      operation: args.operation,
      sourceTraceIds,
      outcomeObservationIds,
      targetNodeIds,
      targetEdgeIds,
      requestedPayload: args.requestedPayload,
      confidence: args.confidence,
      privacyRisk: args.privacyRisk,
      actorType: actor.actorType,
      actorUserId: actor.actorUserId,
      nowMs,
    });
    const changeRequest = await getChangeRequestOrThrow(ctx, changeRequestId);
    return mapChangeRequestRow(changeRequest);
  },
});

export const listCommunityIntelligenceChangeRequests = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    status: v.optional(
      v.union(
        v.literal("pending_decision"),
        v.literal("accepted"),
        v.literal("rejected"),
        v.literal("applied"),
      ),
    ),
    operation: v.optional(
      v.union(
        v.literal("create_node"),
        v.literal("update_node"),
        v.literal("create_edge"),
        v.literal("attach_evidence"),
        v.literal("attach_outcome"),
        v.literal("promote_status"),
        v.literal("mark_contested"),
        v.literal("mark_stale"),
        v.literal("deprecate_node"),
        v.literal("update_confidence"),
        v.literal("update_visibility"),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 100)));
    const rows = args.status
      ? ((await ctx.db
          .query("communityIntelligenceChangeRequests" as any)
          .withIndex("by_community_status", (q: any) =>
            q.eq("communityId", args.communityId).eq("status", args.status),
          )
          .order("desc")
          .take(limit * 2)) as IntelligenceChangeRequestRow[])
      : ((await ctx.db
          .query("communityIntelligenceChangeRequests" as any)
          .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId))
          .order("desc")
          .take(limit * 2)) as IntelligenceChangeRequestRow[]);
    return rows
      .filter((row) => !args.operation || row.operation === args.operation)
      .slice(0, limit)
      .map(mapChangeRequestRow);
  },
});

export const decideCommunityIntelligenceChangeRequest = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    changeRequestId: v.id("communityIntelligenceChangeRequests"),
    status: v.union(v.literal("accepted"), v.literal("rejected")),
    decisionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const changeRequest = await getChangeRequestOrThrow(ctx, args.changeRequestId);
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const actor = await resolvePolicyDecisionActor({
      ctx,
      communityId: changeRequest.communityId,
      userId,
    });
    if (changeRequest.status === "applied") {
      throw new Error("community_intelligence_change_request_already_applied");
    }
    const nowMs = Date.now();
    await ctx.db.patch(changeRequest._id as any, {
      status: args.status,
      decidedByActorType: actor.actorType,
      ...(actor.actorUserId ? { decidedByUserId: actor.actorUserId } : { decidedByUserId: undefined }),
      decidedByAgentKey: undefined,
      decisionReason: normalizeOptionalLongText(args.decisionReason, 2000),
      decidedAt: nowMs,
      updatedAt: nowMs,
    });
    return mapChangeRequestRow(await getChangeRequestOrThrow(ctx, changeRequest._id));
  },
});

export const applyCommunityIntelligenceChangeRequest = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    changeRequestId: v.id("communityIntelligenceChangeRequests"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const changeRequest = await getChangeRequestOrThrow(ctx, args.changeRequestId);
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    if (changeRequest.status !== "accepted") {
      throw new Error("community_intelligence_change_request_must_be_accepted");
    }
    const actor = await resolvePolicyDecisionActor({
      ctx,
      communityId: changeRequest.communityId,
      userId,
    });
    await requireChangeRequestReferencesAllowedForApply(ctx, changeRequest);
    await requireChangeRequestTargetsCurrent(ctx, changeRequest);

    const nowMs = Date.now();
    const payload = payloadObject(changeRequest.requestedPayload);
    let appliedMutationId: any = undefined;
    let appliedNodeIds = changeRequest.targetNodeIds ?? [];
    let appliedEdgeIds = changeRequest.targetEdgeIds ?? [];

    if (changeRequest.operation === "create_node") {
      const status = payloadNodeStatus(payload.status, "candidate");
      const nodeVisibility = resolveNodeVisibility({
        status,
        requestedVisibility: payloadVisibility(payload.visibilityScope),
        requestedSourceVisibility: payloadSourceVisibility(payload.sourceVisibility),
      });
      const nodeId = await ctx.db.insert("communityIntelligenceNodes" as any, {
        communityId: changeRequest.communityId,
        type: payloadNodeType(payload.type),
        title: normalizeBoundedText(payload.title, 240, "community_intelligence_title_required"),
        bodyMd: normalizeBody(payload.bodyMd),
        status,
        visibilityScope: nodeVisibility.visibilityScope,
        sourceVisibility: nodeVisibility.sourceVisibility,
        confidence: clampScore(payload.confidence, changeRequest.confidence),
        evidenceStrength: payloadEvidenceStrength(payload.evidenceStrength, "none"),
        appliesWhen: normalizeOptionalLongText(payload.appliesWhen, 4000),
        doesNotApplyWhen: normalizeOptionalLongText(payload.doesNotApplyWhen, 4000),
        workflowIds: normalizeStringList(payload.workflowIds, 50, 256),
        tags: normalizeStringList(payload.tags, 50, 80),
        sourceTraceIds: changeRequest.sourceTraceIds ?? [],
        outcomeObservationIds: changeRequest.outcomeObservationIds ?? [],
        stalenessScore: clampScore(payload.stalenessScore, 0),
        retrievalUsefulnessScore: clampScore(payload.retrievalUsefulnessScore, 0),
        outcomeImpactScore: clampScore(payload.outcomeImpactScore, 0),
        createdByActorType: actor.actorType,
        ...(actor.actorUserId ? { createdByUserId: actor.actorUserId } : {}),
        lastUpdatedByActorType: actor.actorType,
        ...(actor.actorUserId ? { lastUpdatedByUserId: actor.actorUserId } : {}),
        ...(changeRequest.outcomeObservationIds?.length ? { lastValidatedAt: nowMs } : {}),
        version: 1,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const node = await getIntelligenceNodeOrThrow(ctx, nodeId);
      appliedNodeIds = [node._id];
      appliedMutationId = await insertMutationLog({
        ctx,
        communityId: changeRequest.communityId,
        operation: "create_node",
        actorType: actor.actorType,
        actorUserId: actor.actorUserId,
        targetNodeIds: appliedNodeIds,
        afterSnapshot: mapNodeRow(node),
        sourceTraceIds: changeRequest.sourceTraceIds ?? [],
        policyDecisionId: normalizeIdValue(changeRequest._id),
        reason: args.reason ?? "accepted_change_request_create_node",
        nowMs,
      });
    } else if (changeRequest.operation === "create_edge") {
      const fromNodeId = changeRequest.primaryTargetNodeId;
      if (!fromNodeId) throw new Error("community_intelligence_edge_from_node_required");
      if (payload.fromNodeId && normalizeIdValue(payload.fromNodeId) !== normalizeIdValue(fromNodeId)) {
        throw new Error("community_intelligence_edge_from_node_mismatch");
      }
      const fromNode = await getIntelligenceNodeOrThrow(ctx, fromNodeId);
      if (normalizeIdValue(fromNode.communityId) !== normalizeIdValue(changeRequest.communityId)) {
        throw new Error("community_intelligence_from_node_not_found");
      }
      const toNodeId = payload.toNodeId as any;
      const toReferenceType =
        typeof payload.toReferenceType === "string" && EDGE_REFERENCE_TYPES.has(payload.toReferenceType)
          ? payload.toReferenceType
          : undefined;
      const toReferenceId = normalizeOptionalLongText(payload.toReferenceId, 512);
      const hasNodeTarget = Boolean(toNodeId);
      const hasReferenceTarget = Boolean(toReferenceType && toReferenceId);
      if (hasNodeTarget === hasReferenceTarget) {
        throw new Error("community_intelligence_edge_target_invalid");
      }
      if (toNodeId) {
        const targetNodeIds = new Set((changeRequest.targetNodeIds ?? []).map(normalizeIdValue));
        if (!targetNodeIds.has(normalizeIdValue(toNodeId))) {
          throw new Error("community_intelligence_edge_to_node_target_required");
        }
        const toNode = await getIntelligenceNodeOrThrow(ctx, toNodeId);
        if (normalizeIdValue(toNode.communityId) !== normalizeIdValue(changeRequest.communityId)) {
          throw new Error("community_intelligence_to_node_not_found");
        }
      }
      await requireReferenceBelongsToCommunity(ctx, changeRequest.communityId, toReferenceType, toReferenceId);
      const edgeType =
        typeof payload.type === "string" && EDGE_TYPES.has(payload.type) ? payload.type : undefined;
      if (!edgeType) throw new Error("community_intelligence_edge_type_required");
      const edgeId = await ctx.db.insert("communityIntelligenceEdges" as any, {
        communityId: changeRequest.communityId,
        fromNodeId,
        ...(toNodeId ? { toNodeId } : {}),
        ...(toReferenceType ? { toReferenceType } : {}),
        ...(toReferenceId ? { toReferenceId } : {}),
        type: edgeType,
        confidence: clampScore(payload.confidence, changeRequest.confidence),
        evidenceTraceIds: changeRequest.sourceTraceIds ?? [],
        visibilityScope: payloadVisibility(payload.visibilityScope) ?? "community",
        createdByActorType: actor.actorType,
        ...(actor.actorUserId ? { createdByUserId: actor.actorUserId } : {}),
        ...(typeof payload.compilerRunId === "string"
          ? { compilerRunId: normalizeBoundedText(payload.compilerRunId, 512, "compiler_run_id_required") }
          : {}),
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const edge = (await ctx.db.get(edgeId as any)) as IntelligenceEdgeRow | null;
      if (!edge) throw new Error("community_intelligence_edge_create_failed");
      appliedNodeIds = [fromNodeId, ...(toNodeId ? [toNodeId] : [])];
      appliedEdgeIds = [edge._id];
      appliedMutationId = await insertMutationLog({
        ctx,
        communityId: changeRequest.communityId,
        operation: "create_edge",
        actorType: actor.actorType,
        actorUserId: actor.actorUserId,
        targetNodeIds: appliedNodeIds,
        targetEdgeIds: appliedEdgeIds,
        afterSnapshot: mapEdgeRow(edge),
        sourceTraceIds: changeRequest.sourceTraceIds ?? [],
        policyDecisionId: normalizeIdValue(changeRequest._id),
        reason: args.reason ?? "accepted_change_request_create_edge",
        nowMs,
      });
    } else {
      const targetNodeId = changeRequest.primaryTargetNodeId ?? changeRequest.targetNodeIds?.[0];
      if (!targetNodeId) throw new Error("community_intelligence_change_request_target_node_required");
      const existing = await getIntelligenceNodeOrThrow(ctx, targetNodeId);
      if (normalizeIdValue(existing.communityId) !== normalizeIdValue(changeRequest.communityId)) {
        throw new Error("community_intelligence_node_not_found");
      }
      const nextSourceTraceIds =
        changeRequest.operation === "attach_evidence"
          ? Array.from(new Set([...(existing.sourceTraceIds ?? []), ...(changeRequest.sourceTraceIds ?? [])]))
          : existing.sourceTraceIds ?? [];
      const nextOutcomeIds =
        changeRequest.operation === "attach_outcome"
          ? Array.from(new Set([...(existing.outcomeObservationIds ?? []), ...(changeRequest.outcomeObservationIds ?? [])]))
          : existing.outcomeObservationIds ?? [];
      const inferredStatus: NodeStatus | undefined =
        changeRequest.operation === "mark_contested"
          ? "contested"
          : changeRequest.operation === "mark_stale"
            ? "stale"
            : changeRequest.operation === "deprecate_node"
              ? "deprecated"
              : undefined;
      const nextStatus = payloadNodeStatus(payload.status, inferredStatus ?? existing.status);
      const nodeVisibility = resolveNodeVisibility({
        status: nextStatus,
        requestedVisibility: payloadVisibility(payload.visibilityScope) ?? existing.visibilityScope,
        requestedSourceVisibility: payloadSourceVisibility(payload.sourceVisibility) ?? existing.sourceVisibility,
      });
      const patch: Record<string, unknown> = {
        updatedAt: nowMs,
        version: Number(existing.version ?? 1) + 1,
        lastUpdatedByActorType: actor.actorType,
        lastUpdatedByUserId: actor.actorUserId,
        sourceTraceIds: nextSourceTraceIds,
        outcomeObservationIds: nextOutcomeIds,
      };
      if (payload.title !== undefined) {
        patch.title = normalizeBoundedText(payload.title, 240, "community_intelligence_title_required");
      }
      if (payload.bodyMd !== undefined) patch.bodyMd = normalizeBody(payload.bodyMd);
      if (payload.status !== undefined || inferredStatus) patch.status = nextStatus;
      if (
        payload.status !== undefined ||
        inferredStatus ||
        payload.visibilityScope !== undefined ||
        payload.sourceVisibility !== undefined ||
        DRAFT_STATUSES.has(nextStatus)
      ) {
        patch.visibilityScope = nodeVisibility.visibilityScope;
        patch.sourceVisibility = nodeVisibility.sourceVisibility;
      }
      if (payload.confidence !== undefined || changeRequest.operation === "update_confidence") {
        patch.confidence = clampScore(payload.confidence, changeRequest.confidence);
      }
      if (payload.evidenceStrength !== undefined) {
        patch.evidenceStrength = payloadEvidenceStrength(payload.evidenceStrength, existing.evidenceStrength);
      }
      if (payload.appliesWhen !== undefined) patch.appliesWhen = normalizeOptionalLongText(payload.appliesWhen, 4000);
      if (payload.doesNotApplyWhen !== undefined) {
        patch.doesNotApplyWhen = normalizeOptionalLongText(payload.doesNotApplyWhen, 4000);
      }
      if (payload.workflowIds !== undefined) patch.workflowIds = normalizeStringList(payload.workflowIds, 50, 256);
      if (payload.tags !== undefined) patch.tags = normalizeStringList(payload.tags, 50, 80);
      if (payload.stalenessScore !== undefined) patch.stalenessScore = clampScore(payload.stalenessScore);
      if (payload.retrievalUsefulnessScore !== undefined) {
        patch.retrievalUsefulnessScore = clampScore(payload.retrievalUsefulnessScore);
      }
      if (payload.outcomeImpactScore !== undefined) patch.outcomeImpactScore = clampScore(payload.outcomeImpactScore);
      if (payload.deprecatedByNodeId !== undefined) {
        const deprecatedBy = await getIntelligenceNodeOrThrow(ctx, payload.deprecatedByNodeId as any);
        if (normalizeIdValue(deprecatedBy.communityId) !== normalizeIdValue(changeRequest.communityId)) {
          throw new Error("community_intelligence_deprecated_by_node_not_found");
        }
        patch.deprecatedByNodeId = payload.deprecatedByNodeId;
      }
      if (changeRequest.operation === "attach_outcome" && changeRequest.outcomeObservationIds?.length) {
        patch.lastValidatedAt = nowMs;
      }
      await ctx.db.patch(existing._id as any, patch);
      const updated = await getIntelligenceNodeOrThrow(ctx, existing._id);
      appliedNodeIds = [existing._id];
      appliedMutationId = await insertMutationLog({
        ctx,
        communityId: changeRequest.communityId,
        operation: changeRequest.operation,
        actorType: actor.actorType,
        actorUserId: actor.actorUserId,
        targetNodeIds: appliedNodeIds,
        beforeSnapshot: mapNodeRow(existing),
        afterSnapshot: mapNodeRow(updated),
        sourceTraceIds: changeRequest.sourceTraceIds ?? [],
        policyDecisionId: normalizeIdValue(changeRequest._id),
        reason: args.reason ?? "accepted_change_request_apply",
        nowMs,
      });
    }

    await ctx.db.patch(changeRequest._id as any, {
      status: "applied",
      appliedMutationId,
      targetNodeIds: appliedNodeIds,
      targetEdgeIds: appliedEdgeIds,
      primaryTargetNodeId: appliedNodeIds[0],
      primaryTargetEdgeId: appliedEdgeIds[0],
      appliedAt: nowMs,
      updatedAt: nowMs,
    });
    return mapChangeRequestRow(await getChangeRequestOrThrow(ctx, changeRequest._id));
  },
});

export const listCommunityIntelligenceDirectoryView = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    view: v.optional(
      v.union(
        v.literal("all"),
        v.literal("playbooks"),
        v.literal("insights"),
        v.literal("examples"),
        v.literal("warnings"),
        v.literal("decisions"),
        v.literal("open_questions"),
        v.literal("canonical"),
        v.literal("contested"),
        v.literal("stale"),
        v.literal("workflow_context"),
      ),
    ),
    workflowId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const isManager = await viewerCanManageCommunity(ctx, args.communityId, userId);
    const view = args.view ?? "all";
    const workflowId = normalizeWorkflowId(args.workflowId);
    const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 100)));
    const rows = (await ctx.db
      .query("communityIntelligenceNodes" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as IntelligenceNodeRow[];
    return rows
      .filter((row) => canViewerReadNode(row, isManager))
      .filter((row) => typeMatchesView(row.type, view))
      .filter((row) => statusMatchesView(row.status, view))
      .filter((row) => {
        if (view !== "workflow_context" || !workflowId) return true;
        if ((row.workflowIds ?? []).length === 0) return true;
        return (row.workflowIds ?? []).includes(workflowId);
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
      .map(mapNodeRow);
  },
});

export const listCommunityIntelligenceEdges = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    nodeId: v.optional(v.id("communityIntelligenceNodes")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const isManager = await viewerCanManageCommunity(ctx, args.communityId, userId);
    const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 100)));
    const rows = args.nodeId
      ? ((await ctx.db
          .query("communityIntelligenceEdges" as any)
          .withIndex("by_fromNode", (q: any) => q.eq("fromNodeId", args.nodeId))
          .collect()) as IntelligenceEdgeRow[])
      : ((await ctx.db
          .query("communityIntelligenceEdges" as any)
          .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
          .collect()) as IntelligenceEdgeRow[]);
    const readableRows: IntelligenceEdgeRow[] = [];
    for (const row of rows) {
      if (normalizeIdValue(row.communityId) !== normalizeIdValue(args.communityId)) continue;
      if (!(await canViewerReadEdge({ ctx, communityId: args.communityId, edge: row, userId, isManager }))) continue;
      readableRows.push(row);
    }
    return readableRows
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
      .map(mapEdgeRow);
  },
});

export const retrieveCommunityIntelligenceForWorkflow = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    workflowId: v.optional(v.string()),
    query: v.optional(v.string()),
    types: v.optional(
      v.array(
        v.union(
          v.literal("playbook"),
          v.literal("insight"),
          v.literal("example"),
          v.literal("warning_failure"),
          v.literal("decision_judgment"),
          v.literal("open_question"),
        ),
      ),
    ),
    statuses: v.optional(
      v.array(
        v.union(
          v.literal("draft"),
          v.literal("candidate"),
          v.literal("promising"),
          v.literal("validated"),
          v.literal("canonical"),
          v.literal("contested"),
          v.literal("stale"),
          v.literal("deprecated"),
          v.literal("archived"),
        ),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const isManager = await viewerCanManageCommunity(ctx, args.communityId, userId);
    const limit = Math.max(1, Math.min(12, Math.floor(args.limit ?? 5)));
    const workflowId = normalizeWorkflowId(args.workflowId);
    const queryText = normalizeOptionalLongText(args.query, 1000);
    const nodes = await retrieveNodesForWorkflow({
      ctx,
      communityId: args.communityId,
      userId,
      isManager,
      workflowId,
      query: queryText,
      types: args.types,
      statuses: args.statuses,
      limit,
    });
    const nowMs = Date.now();
    const logId = await ctx.db.insert("communityIntelligenceRetrievalLogs" as any, {
      communityId: args.communityId,
      userId,
      workflowId,
      query: queryText,
      retrievedNodeIds: nodes.map((node) => node._id),
      injectedNodeIds: nodes.map((node) => node._id),
      outcomeObservationIds: [],
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const log = (await ctx.db.get(logId as any)) as RetrievalLogRow | null;
    if (!log) throw new Error("community_intelligence_retrieval_log_create_failed");
    return {
      retrieval_log: mapRetrievalLogRow(log),
      nodes: nodes.map(mapNodeRow),
    };
  },
});

export const recordCommunityIntelligenceRetrievalFeedback = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    retrievalLogId: v.id("communityIntelligenceRetrievalLogs"),
    feedback: v.union(
      v.literal("useful"),
      v.literal("not_useful"),
      v.literal("wrong"),
      v.literal("stale"),
    ),
    feedbackNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const log = (await ctx.db.get(args.retrievalLogId as any)) as RetrievalLogRow | null;
    if (!log) throw new Error("community_intelligence_retrieval_log_not_found");
    await requireCommunityChatAccess({ ctx, communityId: log.communityId, userId });
    const isManager = await viewerCanManageCommunity(ctx, log.communityId, userId);
    if (!isManager && normalizeIdValue(log.userId) !== normalizeIdValue(userId)) {
      throw new Error("community_intelligence_retrieval_feedback_forbidden");
    }
    const nowMs = Date.now();
    await ctx.db.patch(log._id as any, {
      feedback: args.feedback,
      feedbackNote: normalizeOptionalLongText(args.feedbackNote, 2000),
      updatedAt: nowMs,
    });
    const updated = (await ctx.db.get(log._id as any)) as RetrievalLogRow | null;
    if (!updated) throw new Error("community_intelligence_retrieval_log_not_found");
    return mapRetrievalLogRow(updated);
  },
});

export const recordCommunityOutcomeObservation = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    nodeId: v.optional(v.id("communityIntelligenceNodes")),
    retrievalLogId: v.optional(v.id("communityIntelligenceRetrievalLogs")),
    workflowId: v.optional(v.string()),
    metricName: v.optional(v.string()),
    metricValue: v.optional(v.number()),
    baselineValue: v.optional(v.number()),
    resultStatus: v.union(
      v.literal("worked"),
      v.literal("failed"),
      v.literal("mixed"),
      v.literal("unknown"),
    ),
    evidenceStrength: v.union(
      v.literal("none"),
      v.literal("anecdotal"),
      v.literal("observed"),
      v.literal("measured"),
      v.literal("validated"),
    ),
    notes: v.optional(v.string()),
    actorType: v.optional(
      v.union(
        v.literal("member"),
        v.literal("admin"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const actor = await resolveWriteActor({
      ctx,
      communityId: args.communityId,
      userId,
      requestedActorType: args.actorType,
    });
    let node: IntelligenceNodeRow | null = null;
    if (args.nodeId) {
      node = await getIntelligenceNodeOrThrow(ctx, args.nodeId);
      if (normalizeIdValue(node.communityId) !== normalizeIdValue(args.communityId)) {
        throw new Error("community_intelligence_node_not_found");
      }
    }
    let retrievalLog: RetrievalLogRow | null = null;
    if (args.retrievalLogId) {
      retrievalLog = (await ctx.db.get(args.retrievalLogId as any)) as RetrievalLogRow | null;
      if (!retrievalLog || normalizeIdValue(retrievalLog.communityId) !== normalizeIdValue(args.communityId)) {
        throw new Error("community_intelligence_retrieval_log_not_found");
      }
    }
    if (!actor.isManager) {
      if (!retrievalLog) {
        throw new Error("community_intelligence_outcome_retrieval_required");
      }
      if (!retrievalLogBelongsToUser(retrievalLog, userId, actor.isManager)) {
        throw new Error("community_intelligence_outcome_retrieval_forbidden");
      }
      if (node) {
        const retrievalNodeIds = new Set(
          [...(retrievalLog.retrievedNodeIds ?? []), ...(retrievalLog.injectedNodeIds ?? [])].map(normalizeIdValue),
        );
        if (!retrievalNodeIds.has(normalizeIdValue(node._id))) {
          throw new Error("community_intelligence_outcome_node_not_retrieved");
        }
      }
    }
    const nowMs = Date.now();
    const observedAt = nowMs;
    const outcomeId = await ctx.db.insert("communityOutcomeObservations" as any, {
      communityId: args.communityId,
      ...(args.nodeId ? { nodeId: args.nodeId } : {}),
      ...(args.retrievalLogId ? { retrievalLogId: args.retrievalLogId } : {}),
      workflowId: normalizeWorkflowId(args.workflowId),
      metricName: normalizeOptionalText(args.metricName, 120),
      ...(typeof args.metricValue === "number" ? { metricValue: args.metricValue } : {}),
      ...(typeof args.baselineValue === "number" ? { baselineValue: args.baselineValue } : {}),
      resultStatus: args.resultStatus,
      evidenceStrength: args.evidenceStrength,
      notes: normalizeOptionalLongText(args.notes, 4000),
      observedByActorType: actor.actorType,
      ...(actor.actorUserId ? { observedByUserId: actor.actorUserId } : {}),
      observedAt,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    if (node) {
      await insertChangeRequest({
        ctx,
        communityId: args.communityId,
        operation: "attach_outcome",
        outcomeObservationIds: [outcomeId],
        targetNodeIds: [node._id],
        requestedPayload: {
          outcomeObservationId: normalizeIdValue(outcomeId),
          retrievalLogId: args.retrievalLogId ? normalizeIdValue(args.retrievalLogId) : null,
          resultStatus: args.resultStatus,
          evidenceStrength: args.evidenceStrength,
          workflowId: normalizeWorkflowId(args.workflowId) ?? null,
          notes: normalizeOptionalLongText(args.notes, 1000) ?? null,
        },
        confidence: args.resultStatus === "worked" ? 0.55 : args.resultStatus === "failed" ? 0.45 : 0.35,
        privacyRisk: 0.2,
        actorType: actor.actorType,
        actorUserId: actor.actorUserId,
        nowMs,
      });
    }
    if (retrievalLog) {
      await ctx.db.patch(retrievalLog._id as any, {
        outcomeObservationIds: [...(retrievalLog.outcomeObservationIds ?? []), outcomeId],
        updatedAt: nowMs,
      });
    }
    const outcome = (await ctx.db.get(outcomeId as any)) as any;
    return {
      id: normalizeIdValue(outcome._id),
      community_id: normalizeIdValue(outcome.communityId),
      node_id: outcome.nodeId ? normalizeIdValue(outcome.nodeId) : null,
      retrieval_log_id: outcome.retrievalLogId ? normalizeIdValue(outcome.retrievalLogId) : null,
      workflow_id: outcome.workflowId ?? null,
      metric_name: outcome.metricName ?? null,
      metric_value: typeof outcome.metricValue === "number" ? outcome.metricValue : null,
      baseline_value: typeof outcome.baselineValue === "number" ? outcome.baselineValue : null,
      result_status: outcome.resultStatus,
      evidence_strength: outcome.evidenceStrength,
      notes: outcome.notes ?? null,
      observed_by_actor_type: outcome.observedByActorType,
      observed_by_user_id: outcome.observedByUserId ? normalizeIdValue(outcome.observedByUserId) : null,
      observed_by_agent_key: outcome.observedByAgentKey ?? null,
      observed_at: toIsoString(outcome.observedAt),
      created_at: toIsoString(outcome.createdAt),
      updated_at: toIsoString(outcome.updatedAt),
    };
  },
});

export const listCommunityIntelligenceMutations = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 100)));
    const rows = await ctx.db
      .query("communityIntelligenceMutations" as any)
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId))
      .order("desc")
      .take(limit);
    return rows.map((row: any) => ({
      id: normalizeIdValue(row._id),
      community_id: normalizeIdValue(row.communityId),
      operation: row.operation,
      actor_type: row.actorType,
      actor_user_id: row.actorUserId ? normalizeIdValue(row.actorUserId) : null,
      actor_agent_key: row.actorAgentKey ?? null,
      target_node_ids: (row.targetNodeIds ?? []).map(normalizeIdValue),
      target_edge_ids: (row.targetEdgeIds ?? []).map(normalizeIdValue),
      primary_target_node_id: row.primaryTargetNodeId ? normalizeIdValue(row.primaryTargetNodeId) : null,
      primary_target_edge_id: row.primaryTargetEdgeId ? normalizeIdValue(row.primaryTargetEdgeId) : null,
      source_trace_ids: (row.sourceTraceIds ?? []).map(normalizeIdValue),
      compiler_run_id: row.compilerRunId ?? null,
      policy_decision_id: row.policyDecisionId ?? null,
      reason: row.reason,
      created_at: toIsoString(row.createdAt),
    }));
  },
});
