import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
  normalizeIdValue,
  normalizeOptionalText,
  normalizeSlug,
  requireCommunityChatAccess,
  requireCommunityManager,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
  type CommunityResourceLike,
  type CommunityResourceModuleLike,
} from "./communityCore";
import {
  compilerStateForSourceTraceLifecycle,
  type SourceTraceCompilerState,
} from "./communityCompilerEvidenceCore";
import {
  COMMUNITY_EVIDENCE_POLICY_VERSION,
  captureCommunityEvidenceCitationsForSourceTracesCore,
  checkCommunityEvidenceCitationCore,
  requireCommunityEvidenceCitationVisibilityCore,
  requireCommunityEvidenceCitationsActiveCore,
} from "./communityEvidenceCitations";
import { communityEvidenceSurfaceValidator } from "./communityEvidenceAudit";
import { requireLiveCommunityForCognitionWrite } from "./communityCognitionLifecycle";
import { isCommunityMemoryWorkKey } from "./communityMemoryWorkKey";
import {
  COMMUNITY_MEMORY_RETRIEVAL_RECEIPT_VERSION,
  parseCommunityResourceEvidenceRef,
  type CommunityEvidenceSurface,
  type CommunityMemoryRetrievalReceiptVersion,
} from "../shared/communityEvidenceContract";
import { communityIsActive } from "../shared/communityLifecycle";

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
type PolicyDecisionActor = {
  actorType: "admin" | "agent" | "compiler" | "system";
  actorUserId?: any;
  actorAgentKey?: string;
};
type OutcomeResultStatus = "worked" | "failed" | "mixed" | "unknown";
type SourceTraceType =
  | "chat"
  | "interaction"
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
  channelId?: any;
  sourceType: SourceTraceType;
  sourceId?: string;
  title?: string;
  summary: string;
  contentHash?: string;
  provenanceHash?: string;
  visibilityScope: VisibilityScope;
  sourceVisibility: SourceVisibility;
  workflowId?: string;
  artifactIds: string[];
  outcomeObservationIds: any[];
  actorType: ActorType;
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
  evidenceCitationIds?: any[];
  evidencePolicyVersion?: "citation_v1";
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
  originChangeRequestId?: any;
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
  evidenceCitationIds?: any[];
  evidencePolicyVersion?: "citation_v1";
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
  receiptVersion?: CommunityMemoryRetrievalReceiptVersion;
  surface?: CommunityEvidenceSurface;
  workflowId?: string;
  retrievedNodeIds: any[];
  injectedNodeIds: any[];
  outcomeObservationIds: any[];
  createdAt: number;
  updatedAt: number;
};

type OutcomeObservationRow = {
  _id: any;
  communityId: any;
  nodeId?: any;
  retrievalLogId?: any;
  workflowId?: string;
  metricName?: string;
  metricValue?: number;
  baselineValue?: number;
  resultStatus: OutcomeResultStatus;
  evidenceStrength: EvidenceStrength;
  notes?: string;
  observedByActorType: ActorType;
  observedByUserId?: any;
  observedByAgentKey?: string;
  observedAt: number;
  createdAt: number;
  updatedAt: number;
};

type IntelligenceChangeRequestRow = {
  _id: any;
  communityId: any;
  workKey?: string;
  operation: MutationOperation;
  status: ChangeRequestStatus;
  sourceTraceIds: any[];
  evidenceCitationIds?: any[];
  evidencePolicyVersion?: "citation_v1";
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
const ACCEPTED_MEMBER_MEMORY_STATUSES: NodeStatus[] = [
  "promising",
  "validated",
  "canonical",
];
const POLYNET_OVERVIEW_STATUSES: NodeStatus[] = [
  "promising",
  "validated",
  "canonical",
  "contested",
  "stale",
];
const EVIDENCE_SENSITIVE_NODE_OPERATIONS = new Set<MutationOperation>([
  "update_node",
  "promote_status",
  "update_confidence",
  "update_visibility",
]);
const ACCEPTED_MEMORY_MAX_CANDIDATE_ROWS = 240;
const ACCEPTED_MEMORY_MIN_CANDIDATE_ROWS = 48;
const POLYNET_OVERVIEW_DEFAULT_NODE_LIMIT = 80;
const POLYNET_OVERVIEW_MAX_NODE_LIMIT = 120;
const POLYNET_OVERVIEW_EDGE_LIMIT = 160;
const POLYNET_OVERVIEW_EDGES_PER_NODE_LIMIT = 8;
const POLYNET_OVERVIEW_RESOURCE_MODULE_SCAN_LIMIT = 500;
const POLYNET_OVERVIEW_RESOURCE_ROW_SCAN_MULTIPLIER = 4;
const POLYNET_OVERVIEW_RUN_LIMIT = 6;
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

function normalizeCommunityOutcomeNotes(raw: unknown): string | undefined {
  const text = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!text) return undefined;
  return text.slice(0, 1000);
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

function normalizeIdList(raw: unknown, maxItems = 20): string[] {
  if (!Array.isArray(raw)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const id = normalizeIdValue(entry);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= maxItems) break;
  }
  return result;
}

function normalizeActorKey(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim().slice(0, 256);
  return value || undefined;
}

function normalizeOptionalEvidenceFingerprint(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return undefined;
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error("community_source_trace_evidence_fingerprint_invalid");
  }
  return value;
}

function stringArraysEqual(left: readonly string[] = [], right: readonly string[] = []): boolean {
  const normalizedLeft = Array.from(new Set(left.map(String))).sort();
  const normalizedRight = Array.from(new Set(right.map(String))).sort();
  if (normalizedLeft.length !== normalizedRight.length) return false;
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function idArraysEqual(left: readonly any[] = [], right: readonly any[] = []): boolean {
  const leftIds = left.map(normalizeIdValue);
  const rightIds = right.map(normalizeIdValue);
  return stringArraysEqual(leftIds, rightIds);
}

function sourceTraceMaterialChanged(existing: SourceTraceRow, next: {
  channelId?: any;
  title?: string;
  summary: string;
  contentHash?: string;
  provenanceHash?: string;
  visibilityScope: VisibilityScope;
  sourceVisibility: SourceVisibility;
  workflowId?: string;
  artifactIds: string[];
  outcomeObservationIds?: any[];
  actorType: ActorType;
  actorUserId?: any;
  actorAgentKey?: string;
  compilerGroupKey?: string;
}): boolean {
  return (
    normalizeIdValue(existing.channelId) !== normalizeIdValue(next.channelId) ||
    (existing.title ?? undefined) !== (next.title ?? undefined) ||
    existing.summary !== next.summary ||
    (next.contentHash !== undefined && existing.contentHash !== next.contentHash) ||
    (next.provenanceHash !== undefined && existing.provenanceHash !== next.provenanceHash) ||
    existing.visibilityScope !== next.visibilityScope ||
    existing.sourceVisibility !== next.sourceVisibility ||
    (existing.workflowId ?? undefined) !== (next.workflowId ?? undefined) ||
    !stringArraysEqual(existing.artifactIds ?? [], next.artifactIds) ||
    (next.outcomeObservationIds !== undefined && !idArraysEqual(existing.outcomeObservationIds ?? [], next.outcomeObservationIds)) ||
    existing.actorType !== next.actorType ||
    normalizeIdValue(existing.actorUserId) !== normalizeIdValue(next.actorUserId) ||
    (existing.actorAgentKey ?? undefined) !== (next.actorAgentKey ?? undefined)
  );
}

function sourceTraceCompilerState(row: SourceTraceRow): SourceTraceCompilerState {
  return row.compilerState ?? compilerStateForSourceTraceLifecycle(row);
}

function shouldMarkSourceTracePending(existing: SourceTraceRow, materialChanged: boolean): boolean {
  if (existing.compilerState === undefined) return true;
  if (existing.compilerState === "pending" && typeof existing.compilerPendingSince !== "number") return true;
  return materialChanged;
}

function nextSourceTracePendingSince(existing: SourceTraceRow, materialChanged: boolean, nowMs: number): number {
  if (existing.compilerState === "pending" && typeof existing.compilerPendingSince === "number") {
    return existing.compilerPendingSince;
  }
  return materialChanged ? nowMs : existing.createdAt;
}

function sourceTraceCompilerLifecyclePatch(args: {
  existing?: SourceTraceRow;
  visibilityScope: VisibilityScope;
  sourceVisibility: SourceVisibility;
  actorAgentKey?: string;
  materialChanged: boolean;
  nowMs: number;
}) {
  const nextState = compilerStateForSourceTraceLifecycle({
    visibilityScope: args.visibilityScope,
    sourceVisibility: args.sourceVisibility,
    actorAgentKey: args.actorAgentKey,
  });
  if (nextState === "excluded_by_visibility" || nextState === "excluded_self_authored") {
    return {
      compilerState: nextState,
      compilerPendingSince: undefined,
      compilerLastHandledAt: undefined,
      compilerLastDigestId: undefined,
      compilerDecision: undefined,
      compilerContinuationReady: undefined,
    };
  }
  if (!args.existing) {
    return {
      compilerState: "pending" as const,
      compilerPendingSince: args.nowMs,
      compilerContinuationReady: undefined,
    };
  }
  if (!shouldMarkSourceTracePending(args.existing, args.materialChanged)) return {};
  return {
    compilerState: "pending" as const,
    compilerPendingSince: nextSourceTracePendingSince(args.existing, args.materialChanged, args.nowMs),
    compilerLastHandledAt: undefined,
    compilerLastDigestId: undefined,
    compilerDecision: undefined,
    compilerContinuationReady: undefined,
  };
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
  if (row.sourceVisibility === "redacted") return false;
  if (isManager) return true;
  if (
    userId &&
    row.actorUserId &&
    normalizeIdValue(row.actorUserId) === normalizeIdValue(userId) &&
    row.visibilityScope === "private"
  ) {
    return true;
  }
  if (!canViewerReadVisibility(row.visibilityScope, false)) return false;
  return canViewerReadVisibility(row.sourceVisibility, false);
}

async function compilerMemoryEvidenceIsCurrentlyReadable(args: {
  ctx: any;
  node: IntelligenceNodeRow;
  isManager: boolean;
}): Promise<boolean> {
  if (!(args.node.tags ?? []).includes("compiler_memory")) return true;
  if ((args.node.sourceTraceIds ?? []).length === 0) return false;
  for (const traceId of args.node.sourceTraceIds ?? []) {
    const trace = (await args.ctx.db.get(traceId as any)) as SourceTraceRow | null;
    if (
      !trace ||
      normalizeIdValue(trace.communityId) !== normalizeIdValue(args.node.communityId) ||
      !canViewerReadTrace(trace, args.isManager)
    ) {
      return false;
    }
  }
  if (
    args.node.evidencePolicyVersion !== COMMUNITY_EVIDENCE_POLICY_VERSION ||
    (args.node.evidenceCitationIds ?? []).length === 0
  ) {
    return false;
  }
  for (const citationId of args.node.evidenceCitationIds ?? []) {
    if (await checkCommunityEvidenceCitationCore({
      ctx: args.ctx,
      communityId: args.node.communityId,
      citationId,
    }) !== "active") {
      return false;
    }
  }
  return true;
}

async function canViewerReadNodeWithCurrentEvidence(args: {
  ctx: any;
  node: IntelligenceNodeRow;
  isManager: boolean;
}): Promise<boolean> {
  return (
    canViewerReadNode(args.node, args.isManager) &&
    await compilerMemoryEvidenceIsCurrentlyReadable(args)
  );
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

async function requireCanonicalCommunityMemoryReceipt(args: {
  ctx: any;
  retrievalLogId: any;
  communityId: any;
  userId: any;
  surface: CommunityEvidenceSurface;
  nodeId: any;
  requiredNodeState: "returned" | "injected";
}): Promise<RetrievalLogRow> {
  const receipt = (await args.ctx.db.get(args.retrievalLogId as any)) as RetrievalLogRow | null;
  if (
    !receipt ||
    normalizeIdValue(receipt.communityId) !== normalizeIdValue(args.communityId)
  ) {
    throw new Error("community_intelligence_retrieval_log_not_found");
  }
  if (normalizeIdValue(receipt.userId) !== normalizeIdValue(args.userId)) {
    throw new Error("community_intelligence_retrieval_log_forbidden");
  }
  if (receipt.receiptVersion !== COMMUNITY_MEMORY_RETRIEVAL_RECEIPT_VERSION) {
    throw new Error("community_intelligence_retrieval_receipt_version_required");
  }
  if (receipt.surface !== args.surface) {
    throw new Error("community_intelligence_retrieval_receipt_surface_mismatch");
  }
  const nodeIds =
    args.requiredNodeState === "injected"
      ? receipt.injectedNodeIds ?? []
      : receipt.retrievedNodeIds ?? [];
  const normalizedNodeId = normalizeIdValue(args.nodeId);
  if (!nodeIds.some((nodeId) => normalizeIdValue(nodeId) === normalizedNodeId)) {
    throw new Error(
      args.requiredNodeState === "injected"
        ? "community_intelligence_retrieval_node_not_injected"
        : "community_intelligence_retrieval_node_not_returned",
    );
  }
  return receipt;
}

async function resolveExistingReceiptOutcomeForNode(args: {
  ctx: any;
  receipt: RetrievalLogRow;
  communityId: any;
  nodeId: any;
  resultStatus: Exclude<OutcomeResultStatus, "unknown">;
  notes?: string;
}): Promise<OutcomeObservationRow | null> {
  const receiptId = normalizeIdValue(args.receipt._id);
  const communityId = normalizeIdValue(args.communityId);
  const nodeId = normalizeIdValue(args.nodeId);
  const injectedNodeIds = new Set(
    (args.receipt.injectedNodeIds ?? []).map(normalizeIdValue),
  );
  const seenOutcomeIds = new Set<string>();
  const matchingOutcomes: OutcomeObservationRow[] = [];

  for (const outcomeId of args.receipt.outcomeObservationIds ?? []) {
    const normalizedOutcomeId = normalizeIdValue(outcomeId);
    if (!normalizedOutcomeId || seenOutcomeIds.has(normalizedOutcomeId)) {
      throw new Error("community_memory_outcome_receipt_corrupt");
    }
    seenOutcomeIds.add(normalizedOutcomeId);

    const outcome = (await args.ctx.db.get(outcomeId as any)) as OutcomeObservationRow | null;
    if (
      !outcome ||
      normalizeIdValue(outcome.communityId) !== communityId ||
      normalizeIdValue(outcome.retrievalLogId) !== receiptId ||
      !outcome.nodeId ||
      !injectedNodeIds.has(normalizeIdValue(outcome.nodeId))
    ) {
      throw new Error("community_memory_outcome_receipt_corrupt");
    }
    if (normalizeIdValue(outcome.nodeId) === nodeId) {
      matchingOutcomes.push(outcome);
    }
  }

  if (matchingOutcomes.length > 1) {
    throw new Error("community_memory_outcome_duplicate");
  }
  const existingOutcome = matchingOutcomes[0] ?? null;
  if (!existingOutcome) return null;
  if (
    existingOutcome.resultStatus !== args.resultStatus ||
    existingOutcome.evidenceStrength !== "observed" ||
    (existingOutcome.notes ?? undefined) !== args.notes
  ) {
    throw new Error("community_memory_outcome_conflict");
  }
  return existingOutcome;
}

function retrievalLogBelongsToUser(log: RetrievalLogRow, userId: any): boolean {
  return normalizeIdValue(log.userId) === normalizeIdValue(userId);
}

async function createCommunityMemoryRetrievalReceipt(args: {
  ctx: any;
  communityId: any;
  userId: any;
  surface: CommunityEvidenceSurface;
  workflowId?: string;
  retrievedNodeIds: any[];
  injectedNodeIds: any[];
  nowMs: number;
}): Promise<RetrievalLogRow> {
  const receiptId = await args.ctx.db.insert("communityIntelligenceRetrievalLogs" as any, {
    communityId: args.communityId,
    userId: args.userId,
    receiptVersion: COMMUNITY_MEMORY_RETRIEVAL_RECEIPT_VERSION,
    surface: args.surface,
    ...(args.workflowId ? { workflowId: args.workflowId } : {}),
    retrievedNodeIds: args.retrievedNodeIds,
    injectedNodeIds: args.injectedNodeIds,
    outcomeObservationIds: [],
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const receipt = (await args.ctx.db.get(receiptId as any)) as RetrievalLogRow | null;
  if (!receipt) throw new Error("community_intelligence_retrieval_log_create_failed");
  return receipt;
}

function mapTraceRow(row: SourceTraceRow) {
  const compilerState = sourceTraceCompilerState(row);
  return {
    id: normalizeIdValue(row._id),
    community_id: normalizeIdValue(row.communityId),
    channel_id: row.channelId ? normalizeIdValue(row.channelId) : null,
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
    compiler_group_key: row.compilerGroupKey ?? null,
    compiler_continuation_ready: row.compilerContinuationReady === true,
    compiler_state: compilerState,
    compiler_pending_since: typeof row.compilerPendingSince === "number"
      ? toIsoString(row.compilerPendingSince)
      : compilerState === "pending"
        ? toIsoString(row.createdAt)
        : null,
    compiler_last_handled_at: typeof row.compilerLastHandledAt === "number" ? toIsoString(row.compilerLastHandledAt) : null,
    compiler_last_digest_id: row.compilerLastDigestId ? normalizeIdValue(row.compilerLastDigestId) : null,
    compiler_decision: row.compilerDecision ?? null,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

function evidencePolicyLabel(args: {
  evidencePolicyVersion?: "citation_v1";
  sourceTraceIds?: any[];
}): "citation_v1" | "legacy_unversioned" | "none" {
  if (args.evidencePolicyVersion === COMMUNITY_EVIDENCE_POLICY_VERSION) {
    return COMMUNITY_EVIDENCE_POLICY_VERSION;
  }
  return (args.sourceTraceIds ?? []).length > 0 ? "legacy_unversioned" : "none";
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
    evidence_citation_ids: (row.evidenceCitationIds ?? []).map(normalizeIdValue),
    evidence_policy_version: evidencePolicyLabel(row),
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

async function mapNodeRowForAuthorizedRead(
  ctx: any,
  row: IntelligenceNodeRow,
  userIdCache: Map<string, string | null>,
) {
  return {
    ...mapNodeRow(row),
    created_by_user_id: row.createdByUserId
      ? await resolvePublicUserId(ctx, row.createdByUserId, userIdCache)
      : null,
    last_updated_by_user_id: row.lastUpdatedByUserId
      ? await resolvePublicUserId(ctx, row.lastUpdatedByUserId, userIdCache)
      : null,
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
    evidence_citation_ids: (row.evidenceCitationIds ?? []).map(normalizeIdValue),
    evidence_policy_version: evidencePolicyLabel({
      evidencePolicyVersion: row.evidencePolicyVersion,
      sourceTraceIds: row.evidenceTraceIds,
    }),
    visibility_scope: row.visibilityScope,
    created_by_actor_type: row.createdByActorType,
    created_by_user_id: row.createdByUserId ? normalizeIdValue(row.createdByUserId) : null,
    created_by_agent_key: row.createdByAgentKey ?? null,
    compiler_run_id: row.compilerRunId ?? null,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

async function mapEdgeRowForAuthorizedRead(
  ctx: any,
  row: IntelligenceEdgeRow,
  userIdCache: Map<string, string | null>,
) {
  return {
    ...mapEdgeRow(row),
    created_by_user_id: row.createdByUserId
      ? await resolvePublicUserId(ctx, row.createdByUserId, userIdCache)
      : null,
  };
}

function mapCommunityMemoryRetrievalReceipt(row: RetrievalLogRow) {
  return {
    id: normalizeIdValue(row._id),
    version: row.receiptVersion ?? null,
    surface: row.surface ?? null,
    workflow_id: row.workflowId ?? null,
    retrieved_node_ids: (row.retrievedNodeIds ?? []).map(normalizeIdValue),
    injected_node_ids: (row.injectedNodeIds ?? []).map(normalizeIdValue),
    outcome_observation_ids: (row.outcomeObservationIds ?? []).map(normalizeIdValue),
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

function mapOutcomeObservationRow(row: OutcomeObservationRow) {
  return {
    id: normalizeIdValue(row._id),
    community_id: normalizeIdValue(row.communityId),
    node_id: row.nodeId ? normalizeIdValue(row.nodeId) : null,
    retrieval_log_id: row.retrievalLogId ? normalizeIdValue(row.retrievalLogId) : null,
    workflow_id: row.workflowId ?? null,
    metric_name: row.metricName ?? null,
    metric_value: typeof row.metricValue === "number" ? row.metricValue : null,
    baseline_value: typeof row.baselineValue === "number" ? row.baselineValue : null,
    result_status: row.resultStatus,
    evidence_strength: row.evidenceStrength,
    notes: row.notes ?? null,
    observed_by_actor_type: row.observedByActorType,
    observed_by_user_id: row.observedByUserId ? normalizeIdValue(row.observedByUserId) : null,
    observed_by_agent_key: row.observedByAgentKey ?? null,
    observed_at: toIsoString(row.observedAt),
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

function directoryGraphNodeId(nodeId: any): string {
  return `directory_node:${normalizeIdValue(nodeId)}`;
}

function communityGraphRootId(communityId: any): string {
  return `community:${normalizeIdValue(communityId)}`;
}

function communityMemoryLineageId(changeRequestId: any): string {
  return `change_request:${normalizeIdValue(changeRequestId)}`;
}

function resourceGraphNodeId(resourceId: any): string {
  return `resource_node:${normalizeIdValue(resourceId)}`;
}

function resourceMemoryLineageId(resourceId: any): string {
  return `resource:${normalizeIdValue(resourceId)}`;
}

function nodeStatusRank(status: NodeStatus): number {
  if (status === "canonical") return 5;
  if (status === "validated") return 4;
  if (status === "promising") return 3;
  if (status === "contested") return 2;
  if (status === "stale") return 1;
  return 0;
}

function overviewNodeScore(row: IntelligenceNodeRow): number {
  return (
    nodeStatusRank(row.status) +
    clampScore(row.confidence) +
    clampScore(row.outcomeImpactScore) * 0.6 +
    clampScore(row.retrievalUsefulnessScore) * 0.4 -
    clampScore(row.stalenessScore) * 0.5
  );
}

function emptyCountMap<T extends string>(values: readonly T[]): Record<T, number> {
  const result = {} as Record<T, number>;
  for (const value of values) result[value] = 0;
  return result;
}

function mapPolynetOverviewNode(row: IntelligenceNodeRow) {
  return {
    id: directoryGraphNodeId(row._id),
    lineage_id: row.originChangeRequestId
      ? communityMemoryLineageId(row.originChangeRequestId)
      : directoryGraphNodeId(row._id),
    kind: "directory_node",
    node_id: normalizeIdValue(row._id),
    type: row.type,
    label: row.title,
    title: row.title,
    status: row.status,
    confidence: row.confidence,
    evidence_strength: row.evidenceStrength,
    staleness_score: row.stalenessScore,
    retrieval_usefulness_score: row.retrievalUsefulnessScore,
    outcome_impact_score: row.outcomeImpactScore,
    updated_at: toIsoString(row.updatedAt),
  };
}

function mapPolynetOverviewResourceNode(row: CommunityResourceLike) {
  return {
    id: resourceGraphNodeId(row._id),
    lineage_id: resourceMemoryLineageId(row._id),
    kind: "resource_node",
    type: "resource",
    label: row.title,
    title: row.title,
    status: "source",
    updated_at: toIsoString(row.updatedAt),
  };
}

function mapPolynetOverviewEdge(row: IntelligenceEdgeRow) {
  return {
    id: `directory_edge:${normalizeIdValue(row._id)}`,
    kind: "directory_edge",
    edge_id: normalizeIdValue(row._id),
    from: directoryGraphNodeId(row.fromNodeId),
    to: directoryGraphNodeId(row.toNodeId),
    type: row.type,
    confidence: row.confidence,
    updated_at: toIsoString(row.updatedAt),
  };
}

function mapPolynetOverviewResourceEdge(communityId: any, row: CommunityResourceLike) {
  const resourceId = normalizeIdValue(row._id);
  return {
    id: `resource_edge:${resourceId}`,
    kind: "resource_edge",
    edge_id: `resource:${resourceId}`,
    from: communityGraphRootId(communityId),
    to: resourceGraphNodeId(row._id),
    type: "contains_resource",
    confidence: 1,
    updated_at: toIsoString(row.updatedAt),
  };
}

function mapPolynetOverviewResourceDerivationEdge(
  node: IntelligenceNodeRow,
  resource: CommunityResourceLike,
  trace: SourceTraceRow,
) {
  const nodeId = normalizeIdValue(node._id);
  const resourceId = normalizeIdValue(resource._id);
  return {
    id: `resource_derivation_edge:${nodeId}:${resourceId}`,
    kind: "resource_edge",
    edge_id: `derived_from:${nodeId}:${resourceId}`,
    from: directoryGraphNodeId(node._id),
    to: resourceGraphNodeId(resource._id),
    type: "derived_from",
    confidence: 1,
    updated_at: toIsoString(Math.max(node.updatedAt, resource.updatedAt, trace.updatedAt)),
  };
}

function communityAgentActivityState(row: Record<string, any> | null): string {
  if (!row) return "not_started";
  if (row.status === "running") return "running";
  if (row.status === "error") return "error";
  if (row.status === "skipped") return "resting";
  if (normalizeIdList(row.appliedChangeRequestIds).length > 0) return "updated_directory";
  return "resting";
}

function mapPolynetOverviewRun(row: Record<string, any>) {
  return {
    id: normalizeIdValue(row._id),
    status: row.status,
    activity_state: communityAgentActivityState(row),
    trigger_type: row.triggerType,
    heartbeat_id: row.heartbeatId ?? null,
    wake_reason: row.wakeReason ?? null,
    stop_reason: row.stopReason ?? null,
    tool_step_count: typeof row.toolStepCount === "number" ? row.toolStepCount : 0,
    applied_change_request_count: normalizeIdList(row.appliedChangeRequestIds).length,
    started_at: typeof row.startedAt === "number" ? toIsoString(row.startedAt) : null,
    finished_at: typeof row.finishedAt === "number" ? toIsoString(row.finishedAt) : null,
  };
}

async function readPolynetOverviewNodes(args: {
  ctx: any;
  communityId: any;
  isManager: boolean;
  limit: number;
}): Promise<{ nodes: IntelligenceNodeRow[]; hasMoreNodes: boolean }> {
  const rows: IntelligenceNodeRow[] = [];
  let hasMoreNodes = false;
  for (const status of POLYNET_OVERVIEW_STATUSES) {
    const bucket = (await args.ctx.db
      .query("communityIntelligenceNodes" as any)
      .withIndex("by_community_status_updatedAt", (q: any) =>
        q.eq("communityId", args.communityId).eq("status", status),
      )
      .order("desc")
      .take(args.limit)) as IntelligenceNodeRow[];
    if (bucket.length >= args.limit) hasMoreNodes = true;
    rows.push(...bucket);
  }

  const deduped = new Map<string, IntelligenceNodeRow>();
  for (const row of rows) {
    if (!(await canViewerReadNodeWithCurrentEvidence({
      ctx: args.ctx,
      node: row,
      isManager: args.isManager,
    }))) continue;
    const rowId = normalizeIdValue(row._id);
    if (!rowId || deduped.has(rowId)) continue;
    deduped.set(rowId, row);
  }

  return {
    nodes: Array.from(deduped.values())
      .sort((a, b) => overviewNodeScore(b) - overviewNodeScore(a) || b.updatedAt - a.updatedAt)
      .slice(0, args.limit),
    hasMoreNodes,
  };
}

async function readPolynetOverviewResources(args: {
  ctx: any;
  communityId: any;
  limit: number;
}): Promise<{ resources: CommunityResourceLike[]; hasMoreResources: boolean }> {
  const moduleRows = (await args.ctx.db
    .query("communityResourceModules" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
    .take(POLYNET_OVERVIEW_RESOURCE_MODULE_SCAN_LIMIT)) as CommunityResourceModuleLike[];
  const liveModules = moduleRows
    .filter(communityResourceModuleIsLive)
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
  const liveModuleIds = new Set(liveModules.map((module) => normalizeIdValue(module._id)));
  const scanLimit = Math.max(args.limit + 1, args.limit * POLYNET_OVERVIEW_RESOURCE_ROW_SCAN_MULTIPLIER);
  const deduped = new Map<string, CommunityResourceLike>();
  let scannedRows = 0;
  let scannedModules = 0;
  let hasMoreResources = moduleRows.length >= POLYNET_OVERVIEW_RESOURCE_MODULE_SCAN_LIMIT;

  for (const module of liveModules) {
    if (deduped.size > args.limit || scannedRows >= scanLimit) {
      hasMoreResources = true;
      break;
    }
    const remainingScan = scanLimit - scannedRows;
    const remainingCandidates = args.limit + 1 - deduped.size;
    const takeLimit = Math.max(1, Math.min(remainingScan, remainingCandidates));
    const rows = (await args.ctx.db
      .query("communityResources" as any)
      .withIndex("by_community_module", (q: any) =>
        q.eq("communityId", args.communityId).eq("moduleId", module._id),
      )
      .take(takeLimit)) as CommunityResourceLike[];
    scannedRows += rows.length;
    scannedModules += 1;
    if (rows.length >= takeLimit) hasMoreResources = true;
    for (const row of rows) {
      if (!communityResourceIsLiveModulePage(row, liveModuleIds)) continue;
      const rowId = normalizeIdValue(row._id);
      if (!rowId || deduped.has(rowId)) continue;
      deduped.set(rowId, row);
    }
  }
  if (scannedModules < liveModules.length) hasMoreResources = true;

  const resources = Array.from(deduped.values())
    .sort((a, b) =>
      Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
      b.updatedAt - a.updatedAt ||
      String(a.title ?? "").localeCompare(String(b.title ?? "")),
    )
    .slice(0, args.limit);
  if (deduped.size > resources.length) hasMoreResources = true;
  return { resources, hasMoreResources };
}

type PolynetOverviewSelectionItem =
  | { kind: "directory"; row: IntelligenceNodeRow }
  | { kind: "resource"; row: CommunityResourceLike };

function selectPolynetOverviewItems(args: {
  nodes: IntelligenceNodeRow[];
  resources: CommunityResourceLike[];
  limit: number;
}): PolynetOverviewSelectionItem[] {
  const selected: PolynetOverviewSelectionItem[] = [];
  let nodeIndex = 0;
  let resourceIndex = 0;
  while (selected.length < args.limit) {
    const node = args.nodes[nodeIndex];
    const resource = args.resources[resourceIndex];
    if (!node && !resource) break;
    if (node) {
      selected.push({ kind: "directory", row: node });
      nodeIndex += 1;
    }
    if (selected.length >= args.limit) break;
    if (resource) {
      selected.push({ kind: "resource", row: resource });
      resourceIndex += 1;
    }
  }
  return selected;
}

function mapPolynetOverviewSelectionNode(item: PolynetOverviewSelectionItem) {
  return item.kind === "directory"
    ? mapPolynetOverviewNode(item.row)
    : mapPolynetOverviewResourceNode(item.row);
}

async function readPolynetOverviewEdges(args: {
  ctx: any;
  communityId: any;
  nodes: IntelligenceNodeRow[];
  isManager: boolean;
}): Promise<{ edges: IntelligenceEdgeRow[]; hasMoreEdges: boolean }> {
  const nodeIds = new Set(args.nodes.map((node) => normalizeIdValue(node._id)));
  const deduped = new Map<string, IntelligenceEdgeRow>();
  let hasMoreEdges = false;

  for (const node of args.nodes) {
    const bucket = (await args.ctx.db
      .query("communityIntelligenceEdges" as any)
      .withIndex("by_fromNode", (q: any) => q.eq("fromNodeId", node._id))
      .take(POLYNET_OVERVIEW_EDGES_PER_NODE_LIMIT)) as IntelligenceEdgeRow[];
    if (bucket.length >= POLYNET_OVERVIEW_EDGES_PER_NODE_LIMIT) hasMoreEdges = true;
    for (const edge of bucket) {
      const edgeId = normalizeIdValue(edge._id);
      if (!edgeId || deduped.has(edgeId)) continue;
      if (normalizeIdValue(edge.communityId) !== normalizeIdValue(args.communityId)) continue;
      if (!edge.toNodeId) continue;
      if (!nodeIds.has(normalizeIdValue(edge.fromNodeId)) || !nodeIds.has(normalizeIdValue(edge.toNodeId))) continue;
      if (!canViewerReadVisibility(edge.visibilityScope, args.isManager)) continue;
      deduped.set(edgeId, edge);
      if (deduped.size >= POLYNET_OVERVIEW_EDGE_LIMIT) {
        hasMoreEdges = true;
        break;
      }
    }
    if (deduped.size >= POLYNET_OVERVIEW_EDGE_LIMIT) break;
  }

  return {
    edges: Array.from(deduped.values())
      .sort((a, b) => b.confidence - a.confidence || b.updatedAt - a.updatedAt)
      .slice(0, POLYNET_OVERVIEW_EDGE_LIMIT),
    hasMoreEdges,
  };
}

async function readPolynetOverviewResourceDerivationEdges(args: {
  ctx: any;
  communityId: any;
  nodes: IntelligenceNodeRow[];
  resources: CommunityResourceLike[];
  isManager: boolean;
}): Promise<{
  edges: ReturnType<typeof mapPolynetOverviewResourceDerivationEdge>[];
  hasMoreEdges: boolean;
}> {
  const resourcesById = new Map(
    args.resources.map((resource) => [normalizeIdValue(resource._id), resource]),
  );
  if (resourcesById.size === 0 || args.nodes.length === 0) {
    return { edges: [], hasMoreEdges: false };
  }

  const allCandidateRefs = args.nodes.flatMap((node) =>
    (node.sourceTraceIds ?? [])
      .slice(0, POLYNET_OVERVIEW_EDGES_PER_NODE_LIMIT)
      .map((rawTraceId) => ({ node, rawTraceId, traceId: normalizeIdValue(rawTraceId) }))
      .filter((candidate) => Boolean(candidate.traceId)),
  );
  const hasMoreEdges =
    args.nodes.some(
      (node) => (node.sourceTraceIds ?? []).length > POLYNET_OVERVIEW_EDGES_PER_NODE_LIMIT,
    ) || allCandidateRefs.length > POLYNET_OVERVIEW_EDGE_LIMIT;
  const candidateRefs = allCandidateRefs.slice(0, POLYNET_OVERVIEW_EDGE_LIMIT);
  const traceIds = new Map(
    candidateRefs.map((candidate) => [candidate.traceId, candidate.rawTraceId]),
  );

  const tracesById = new Map<string, SourceTraceRow>();
  await Promise.all(
    Array.from(traceIds.entries()).map(async ([traceId, rawTraceId]) => {
      const trace = await args.ctx.db.get(rawTraceId as any);
      if (isSourceTraceRow(trace)) tracesById.set(traceId, trace);
    }),
  );

  const edges = new Map<string, ReturnType<typeof mapPolynetOverviewResourceDerivationEdge>>();
  for (const candidate of candidateRefs) {
    const trace = tracesById.get(candidate.traceId);
    if (!trace) continue;
    if (normalizeIdValue(trace.communityId) !== normalizeIdValue(args.communityId)) continue;
    if (trace.sourceType !== "resource" || !canViewerReadTrace(trace, args.isManager)) continue;
    const resourceId = parseCommunityResourceEvidenceRef(trace.sourceId);
    if (!resourceId) continue;
    const resource = resourcesById.get(normalizeIdValue(resourceId));
    if (!resource) continue;
    const edgeKey = `${normalizeIdValue(candidate.node._id)}:${normalizeIdValue(resource._id)}`;
    if (edges.has(edgeKey)) continue;
    edges.set(edgeKey, mapPolynetOverviewResourceDerivationEdge(candidate.node, resource, trace));
  }

  return { edges: Array.from(edges.values()), hasMoreEdges };
}

function summarizePolynetOverviewMemory(
  items: PolynetOverviewSelectionItem[],
  hasMoreNodes: boolean,
  hasMoreEdges: boolean,
) {
  const countsByType: Record<string, number> = {
    ...emptyCountMap(Array.from(NODE_TYPES).sort() as NodeType[]),
    resource: 0,
  };
  const countsByStatus: Record<string, number> = {
    ...emptyCountMap(POLYNET_OVERVIEW_STATUSES),
    source: 0,
  };
  let staleCount = 0;
  let contestedCount = 0;
  let learnedNodeCount = 0;
  let sourceNodeCount = 0;
  for (const item of items) {
    if (item.kind === "resource") {
      countsByType.resource += 1;
      countsByStatus.source += 1;
      sourceNodeCount += 1;
      continue;
    }
    const node = item.row;
    countsByType[node.type] += 1;
    countsByStatus[node.status] += 1;
    learnedNodeCount += 1;
    if (node.status === "stale") staleCount += 1;
    if (node.status === "contested") contestedCount += 1;
  }
  return {
    total_visible_nodes: items.length,
    learned_node_count: learnedNodeCount,
    source_node_count: sourceNodeCount,
    counts_by_type: countsByType,
    counts_by_status: countsByStatus,
    stale_count: staleCount,
    contested_count: contestedCount,
    node_counts_are_lower_bound: hasMoreNodes,
    edge_counts_are_lower_bound: hasMoreEdges,
  };
}

function communityMemoryGrade(status: NodeStatus): "validated" | "promising" | "unproven" | "contested" | "stale" {
  if (status === "canonical" || status === "validated") return "validated";
  if (status === "promising") return "promising";
  if (status === "contested") return "contested";
  if (status === "stale") return "stale";
  return "unproven";
}

function mapCompactMemoryNode(row: IntelligenceNodeRow) {
  return {
    id: normalizeIdValue(row._id),
    type: row.type,
    title: row.title,
    status: row.status,
    grade: communityMemoryGrade(row.status),
    confidence: row.confidence,
    evidence_strength: row.evidenceStrength,
    evidence_citation_ids: (row.evidenceCitationIds ?? []).map(normalizeIdValue),
    evidence_policy_version: evidencePolicyLabel(row),
    applies_when: row.appliesWhen ?? null,
    tags: row.tags ?? [],
    updated_at: toIsoString(row.updatedAt),
  };
}

function memoryToolError(error: unknown, fallbackCode: string) {
  const message = error instanceof Error ? error.message : String(error);
  const reasonCode = /^[a-z0-9_]+$/.test(message) ? message : fallbackCode;
  return {
    ok: false,
    reason_code: reasonCode || fallbackCode,
    message: message || "Community memory tool failed.",
  };
}

function mapChangeRequestRow(row: IntelligenceChangeRequestRow) {
  return {
    id: normalizeIdValue(row._id),
    community_id: normalizeIdValue(row.communityId),
    work_key: row.workKey ?? null,
    operation: row.operation,
    status: row.status,
    source_trace_ids: (row.sourceTraceIds ?? []).map(normalizeIdValue),
    evidence_citation_ids: (row.evidenceCitationIds ?? []).map(normalizeIdValue),
    evidence_policy_version: evidencePolicyLabel(row),
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
    if (log && retrievalLogBelongsToUser(log, args.userId)) return true;
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
    if (!(await canViewerReadNodeWithCurrentEvidence({
      ctx: args.ctx,
      node,
      isManager: args.isManager,
    }))) {
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
  if (
    normalizeIdValue(fromNode.communityId) !== normalizeIdValue(args.communityId) ||
    !(await canViewerReadNodeWithCurrentEvidence({ ctx: args.ctx, node: fromNode, isManager: false }))
  ) {
    return false;
  }
  if (args.edge.toNodeId) {
    const toNode = await getIntelligenceNodeOrThrow(args.ctx, args.edge.toNodeId);
    if (
      normalizeIdValue(toNode.communityId) !== normalizeIdValue(args.communityId) ||
      !(await canViewerReadNodeWithCurrentEvidence({ ctx: args.ctx, node: toNode, isManager: false }))
    ) {
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
  channelId?: any;
  sourceType: SourceTraceType;
  sourceId?: string;
  title?: string | null;
  summary: string;
  contentHash?: string;
  provenanceHash?: string;
  visibilityScope?: VisibilityScope;
  sourceVisibility?: SourceVisibility;
  workflowId?: string | null;
  artifactIds?: string[] | null;
  outcomeObservationIds?: any[] | null;
  actorType: ActorType;
  actorUserId?: any;
  actorAgentKey?: string;
  compilerGroupKey?: string;
  allowExistingUpdate?: boolean;
  nowMs: number;
}): Promise<ReturnType<typeof mapTraceRow>> {
  await requireLiveCommunityForCognitionWrite(args.ctx, args.communityId);
  if (args.channelId) {
    if (args.sourceType !== "interaction") {
      throw new Error("community_source_trace_channel_source_type_invalid");
    }
    const channel = await args.ctx.db.get(args.channelId);
    if (
      !channel ||
      normalizeIdValue(channel.communityId) !== normalizeIdValue(args.communityId)
    ) {
      throw new Error("community_source_trace_channel_invalid");
    }
  }
  const sourceId = normalizeOptionalLongText(args.sourceId, 512);
  const title = normalizeOptionalLongText(args.title, 240);
  const summary = normalizeBoundedText(
    args.summary,
    4000,
    "community_source_trace_summary_required",
  );
  const contentHash = normalizeOptionalEvidenceFingerprint(args.contentHash);
  const provenanceHash = normalizeOptionalEvidenceFingerprint(args.provenanceHash);
  const visibilityScope = args.visibilityScope ?? "community";
  const sourceVisibility = args.sourceVisibility ?? visibilityScope;
  const workflowId = normalizeWorkflowId(args.workflowId);
  const artifactIds = normalizeStringList(args.artifactIds, 50, 512);
  const outcomeObservationIds = Array.isArray(args.outcomeObservationIds)
    ? args.outcomeObservationIds
    : undefined;
  const actorAgentKey = normalizeActorKey(args.actorAgentKey);
  const compilerGroupKey = normalizeOptionalLongText(args.compilerGroupKey, 512);

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
    const materialChanged = sourceTraceMaterialChanged(existing, {
      channelId: args.channelId,
      title,
      summary,
      contentHash,
      provenanceHash,
      visibilityScope,
      sourceVisibility,
      workflowId,
      artifactIds,
      outcomeObservationIds,
      actorType: args.actorType,
      actorUserId: args.actorUserId,
      actorAgentKey,
      compilerGroupKey,
    });
    const compilerLifecyclePatch = sourceTraceCompilerLifecyclePatch({
      existing,
      visibilityScope,
      sourceVisibility,
      actorAgentKey,
      materialChanged,
      nowMs: args.nowMs,
    });
    await args.ctx.db.patch(existing._id as any, {
      ...(args.channelId ? { channelId: args.channelId } : { channelId: undefined }),
      title,
      summary,
      ...(contentHash !== undefined ? { contentHash } : {}),
      ...(provenanceHash !== undefined ? { provenanceHash } : {}),
      visibilityScope,
      sourceVisibility,
      workflowId,
      artifactIds,
      ...(outcomeObservationIds ? { outcomeObservationIds } : {}),
      actorType: args.actorType,
      ...(args.actorUserId ? { actorUserId: args.actorUserId } : { actorUserId: undefined }),
      ...(actorAgentKey ? { actorAgentKey } : { actorAgentKey: undefined }),
      ...(compilerGroupKey ? { compilerGroupKey } : { compilerGroupKey: undefined }),
      ...compilerLifecyclePatch,
      // Evidence versions are content-addressed. A no-op source sync must not
      // supersede otherwise-active citations by advancing a transport clock.
      updatedAt: materialChanged ? args.nowMs : existing.updatedAt,
    });
    const updated = (await args.ctx.db.get(existing._id as any)) as SourceTraceRow | null;
    if (!updated) throw new Error("community_source_trace_not_found");
    return mapTraceRow(updated);
  }

  const compilerLifecyclePatch = sourceTraceCompilerLifecyclePatch({
    visibilityScope,
    sourceVisibility,
    actorAgentKey,
    materialChanged: true,
    nowMs: args.nowMs,
  });
  const id = await args.ctx.db.insert("communitySourceTraces" as any, {
    communityId: args.communityId,
    ...(args.channelId ? { channelId: args.channelId } : {}),
    sourceType: args.sourceType,
    ...(sourceId ? { sourceId } : {}),
    title,
    summary,
    ...(contentHash !== undefined ? { contentHash } : {}),
    ...(provenanceHash !== undefined ? { provenanceHash } : {}),
    visibilityScope,
    sourceVisibility,
    workflowId,
    artifactIds,
    outcomeObservationIds: outcomeObservationIds ?? [],
    actorType: args.actorType,
    ...(args.actorUserId ? { actorUserId: args.actorUserId } : {}),
    ...(actorAgentKey ? { actorAgentKey } : {}),
    ...(compilerGroupKey ? { compilerGroupKey } : {}),
    ...compilerLifecyclePatch,
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
  channelId?: any;
  sourceType: SourceTraceType;
  sourceId: string;
  title?: string | null;
  summary: string;
  contentHash?: string;
  provenanceHash?: string;
  visibilityScope?: VisibilityScope;
  sourceVisibility?: SourceVisibility;
  workflowId?: string | null;
  artifactIds?: string[] | null;
  outcomeObservationIds?: any[] | null;
  actorType?: ActorType;
  actorUserId?: any;
  actorAgentKey?: string;
  compilerGroupKey?: string;
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
    channelId: args.channelId,
    sourceType: args.sourceType,
    sourceId,
    title: args.title,
    summary: args.summary,
    contentHash: args.contentHash,
    provenanceHash: args.provenanceHash,
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
    compilerGroupKey: args.compilerGroupKey,
    allowExistingUpdate: true,
    nowMs: args.nowMs ?? Date.now(),
  });
}

async function insertChangeRequest(args: {
  ctx: any;
  communityId: any;
  workKey?: string;
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
  const sourceTraceIds = args.sourceTraceIds ?? [];
  const evidenceCitationIds = await captureCommunityEvidenceCitationsForSourceTracesCore({
    ctx: args.ctx,
    communityId: args.communityId,
    sourceTraceIds,
    actorType: args.actorType,
    capturedAt: args.nowMs,
  });
  const targetNodeSnapshots = await getNodeSnapshots(args.ctx, args.communityId, targetNodeIds);
  const targetEdgeSnapshots = await getEdgeSnapshots(args.ctx, args.communityId, targetEdgeIds);
  return await args.ctx.db.insert("communityIntelligenceChangeRequests" as any, {
    communityId: args.communityId,
    ...(args.workKey ? { workKey: args.workKey } : {}),
    operation: args.operation,
    status: "pending_decision",
    sourceTraceIds,
    evidenceCitationIds,
    evidencePolicyVersion: COMMUNITY_EVIDENCE_POLICY_VERSION,
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

export async function createOrReuseTrustedCommunityIntelligenceChangeRequest(args: {
  ctx: any;
  communityId: any;
  workKey?: string;
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
}): Promise<{
  changeRequest: ReturnType<typeof mapChangeRequestRow>;
  reusedExisting: boolean;
}> {
  await requireLiveCommunityForCognitionWrite(args.ctx, args.communityId);
  const workKey = String(args.workKey ?? "").trim() || undefined;
  if (workKey && !isCommunityMemoryWorkKey(workKey)) {
    throw new Error("community_intelligence_work_key_invalid");
  }
  if (workKey) {
    const existingRows = (await args.ctx.db
      .query("communityIntelligenceChangeRequests" as any)
      .withIndex("by_community_workKey", (q: any) =>
        q.eq("communityId", args.communityId).eq("workKey", workKey),
      )
      .take(2)) as IntelligenceChangeRequestRow[];
    if (existingRows.length > 1) {
      throw new Error("community_intelligence_work_key_duplicate");
    }
    const existing = existingRows[0];
    if (existing) {
      if (existing.operation !== args.operation) {
        throw new Error("community_intelligence_work_key_conflict");
      }
      return {
        changeRequest: mapChangeRequestRow(existing),
        reusedExisting: true,
      };
    }
  }
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
    workKey,
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
  return {
    changeRequest: mapChangeRequestRow(changeRequest),
    reusedExisting: false,
  };
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

function normalizePolicyDecisionActor(actor: PolicyDecisionActor): PolicyDecisionActor {
  if (actor.actorType === "admin") {
    if (!actor.actorUserId) throw new Error("community_intelligence_admin_actor_user_required");
    return {
      actorType: "admin",
      actorUserId: actor.actorUserId,
    };
  }
  const actorAgentKey = normalizeActorKey(actor.actorAgentKey) ?? actor.actorType;
  return {
    actorType: actor.actorType,
    actorAgentKey,
  };
}

function actorUserPatch(actor: PolicyDecisionActor, userField: string, agentField: string) {
  return actor.actorType === "admin"
    ? {
        [userField]: actor.actorUserId,
        [agentField]: undefined,
      }
    : {
        [userField]: undefined,
        [agentField]: actor.actorAgentKey,
      };
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

async function retrieveAcceptedCommunityMemoryNodes(args: {
  ctx: any;
  communityId: any;
  isManager: boolean;
  workflowId?: string;
  query?: string;
  types?: NodeType[];
  limit: number;
}): Promise<{ nodes: IntelligenceNodeRow[]; truncated: boolean }> {
  const typeSet = new Set((args.types ?? []).filter((type) => NODE_TYPES.has(type)));
  const statuses = ACCEPTED_MEMBER_MEMORY_STATUSES;
  const bucketCount = statuses.length * Math.max(1, typeSet.size || 1);
  const maxCandidateRows = Math.max(
    ACCEPTED_MEMORY_MIN_CANDIDATE_ROWS,
    Math.min(ACCEPTED_MEMORY_MAX_CANDIDATE_ROWS, args.limit * 24),
  );
  const perBucketLimit = Math.max(4, Math.ceil(maxCandidateRows / bucketCount));
  const queries: Array<Promise<IntelligenceNodeRow[]>> = [];

  if (typeSet.size > 0) {
    for (const type of typeSet) {
      for (const status of statuses) {
        queries.push(
          args.ctx.db
            .query("communityIntelligenceNodes" as any)
            .withIndex("by_community_type_status_updatedAt", (q: any) =>
              q.eq("communityId", args.communityId).eq("type", type).eq("status", status),
            )
            .order("desc")
            .take(perBucketLimit) as Promise<IntelligenceNodeRow[]>,
        );
      }
    }
  } else {
    for (const status of statuses) {
      queries.push(
        args.ctx.db
          .query("communityIntelligenceNodes" as any)
          .withIndex("by_community_status_updatedAt", (q: any) =>
            q.eq("communityId", args.communityId).eq("status", status),
          )
          .order("desc")
          .take(perBucketLimit) as Promise<IntelligenceNodeRow[]>,
      );
    }
  }

  const deduped = new Map<string, IntelligenceNodeRow>();
  for (const row of (await Promise.all(queries)).flat()) {
    const rowId = normalizeIdValue(row._id);
    if (!rowId || deduped.has(rowId)) continue;
    deduped.set(rowId, row);
  }

  const evidenceReadableRows: IntelligenceNodeRow[] = [];
  for (const row of Array.from(deduped.values())) {
    if (!(await canViewerReadNodeWithCurrentEvidence({
      ctx: args.ctx,
      node: row,
      isManager: args.isManager,
    }))) continue;
    evidenceReadableRows.push(row);
  }
  const ranked = evidenceReadableRows
    .filter((row) => {
      if (!args.workflowId) return true;
      if ((row.workflowIds ?? []).length === 0) return true;
      return (row.workflowIds ?? []).includes(args.workflowId);
    })
    .map((node) => ({ node, score: retrievalScore({ node, workflowId: args.workflowId, query: args.query }) }))
    .filter((entry) => entry.score > -0.5)
    .sort((a, b) => b.score - a.score || b.node.updatedAt - a.node.updatedAt);
  return {
    nodes: ranked.slice(0, args.limit).map((entry) => entry.node),
    truncated: ranked.length > args.limit,
  };
}

export async function decideTrustedCommunityIntelligenceChangeRequestCore(args: {
  ctx: any;
  changeRequestId: any;
  status: "accepted" | "rejected";
  decisionReason?: string;
  actor: PolicyDecisionActor;
  nowMs?: number;
}): Promise<ReturnType<typeof mapChangeRequestRow>> {
  const changeRequest = await getChangeRequestOrThrow(args.ctx, args.changeRequestId);
  if (changeRequest.status === "applied") {
    throw new Error("community_intelligence_change_request_already_applied");
  }
  const actor = normalizePolicyDecisionActor(args.actor);
  const nowMs = args.nowMs ?? Date.now();
  await args.ctx.db.patch(changeRequest._id as any, {
    status: args.status,
    decidedByActorType: actor.actorType,
    ...actorUserPatch(actor, "decidedByUserId", "decidedByAgentKey"),
    decisionReason: normalizeOptionalLongText(args.decisionReason, 2000),
    decidedAt: nowMs,
    updatedAt: nowMs,
  });
  return mapChangeRequestRow(await getChangeRequestOrThrow(args.ctx, changeRequest._id));
}

export async function applyTrustedCommunityIntelligenceChangeRequestCore(args: {
  ctx: any;
  changeRequestId: any;
  actor: PolicyDecisionActor;
  applicationMode?: "accepted_request" | "autonomous_compiler_memory";
  reason?: string;
  nowMs?: number;
}): Promise<ReturnType<typeof mapChangeRequestRow>> {
  const changeRequest = await getChangeRequestOrThrow(args.ctx, args.changeRequestId);
  await requireLiveCommunityForCognitionWrite(args.ctx, changeRequest.communityId);
  const payload = payloadObject(changeRequest.requestedPayload);
  const autonomousCompilerMemory = args.applicationMode === "autonomous_compiler_memory";
  if (autonomousCompilerMemory) {
    if (
      (changeRequest.status !== "pending_decision" && changeRequest.status !== "accepted") ||
      (changeRequest.operation !== "create_node" && changeRequest.operation !== "attach_evidence") ||
      payload.source !== "compiler_digest_item_v1" ||
      (changeRequest.createdByActorType !== "compiler" && changeRequest.createdByActorType !== "agent")
    ) {
      throw new Error("community_intelligence_autonomous_memory_policy_forbidden");
    }
  } else if (changeRequest.status !== "accepted") {
    throw new Error("community_intelligence_change_request_must_be_accepted");
  }
  const actor = normalizePolicyDecisionActor(args.actor);
  if (
    autonomousCompilerMemory &&
    actor.actorType !== "compiler" &&
    actor.actorType !== "agent"
  ) {
    throw new Error("community_intelligence_autonomous_memory_actor_forbidden");
  }
  const nowMs = args.nowMs ?? Date.now();
  await requireChangeRequestReferencesAllowedForApply(args.ctx, changeRequest);
  let evidenceCitationIds = changeRequest.evidenceCitationIds ?? [];
  let evidencePolicyVersion = changeRequest.evidencePolicyVersion;
  if (
    autonomousCompilerMemory &&
    (changeRequest.sourceTraceIds ?? []).length > 0 &&
    (evidencePolicyVersion !== COMMUNITY_EVIDENCE_POLICY_VERSION ||
      evidenceCitationIds.length === 0)
  ) {
    evidenceCitationIds = await captureCommunityEvidenceCitationsForSourceTracesCore({
      ctx: args.ctx,
      communityId: changeRequest.communityId,
      sourceTraceIds: changeRequest.sourceTraceIds ?? [],
      actorType: changeRequest.createdByActorType === "agent" ? "agent" : "compiler",
      capturedAt: nowMs,
    });
    evidencePolicyVersion = COMMUNITY_EVIDENCE_POLICY_VERSION;
    await args.ctx.db.patch(changeRequest._id as any, {
      evidenceCitationIds,
      evidencePolicyVersion,
      updatedAt: nowMs,
    });
  }
  if (
    (changeRequest.sourceTraceIds ?? []).length > 0 &&
    (evidencePolicyVersion !== COMMUNITY_EVIDENCE_POLICY_VERSION ||
      evidenceCitationIds.length === 0)
  ) {
    throw new Error("community_evidence_citation_review_required");
  }
  if (evidencePolicyVersion === COMMUNITY_EVIDENCE_POLICY_VERSION) {
    await requireCommunityEvidenceCitationsActiveCore({
      ctx: args.ctx,
      communityId: changeRequest.communityId,
      citationIds: evidenceCitationIds,
    });
  }
  if (
    evidenceCitationIds.length === 0 &&
    (payload.evidenceStrength === "observed" ||
      payload.evidenceStrength === "measured" ||
      payload.evidenceStrength === "validated")
  ) {
    throw new Error("community_evidence_citation_required");
  }
  await requireChangeRequestTargetsCurrent(args.ctx, changeRequest);
  if (EVIDENCE_SENSITIVE_NODE_OPERATIONS.has(changeRequest.operation)) {
    for (const nodeId of changeRequest.targetNodeIds ?? []) {
      const node = await getIntelligenceNodeOrThrow(args.ctx, nodeId);
      const nodeCitationIds = node.evidenceCitationIds ?? [];
      if (
        (node.sourceTraceIds ?? []).length > 0 &&
        (node.evidencePolicyVersion !== COMMUNITY_EVIDENCE_POLICY_VERSION ||
          nodeCitationIds.length === 0)
      ) {
        throw new Error("community_evidence_citation_review_required");
      }
      if (node.evidencePolicyVersion === COMMUNITY_EVIDENCE_POLICY_VERSION) {
        await requireCommunityEvidenceCitationsActiveCore({
          ctx: args.ctx,
          communityId: changeRequest.communityId,
          citationIds: nodeCitationIds,
        });
      }
    }
  }

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
    await requireCommunityEvidenceCitationVisibilityCore({
      ctx: args.ctx,
      communityId: changeRequest.communityId,
      citationIds: evidenceCitationIds,
      outputVisibility: nodeVisibility.visibilityScope,
    });
    await requireCommunityEvidenceCitationVisibilityCore({
      ctx: args.ctx,
      communityId: changeRequest.communityId,
      citationIds: evidenceCitationIds,
      outputVisibility: nodeVisibility.sourceVisibility,
    });
    const nodeId = await args.ctx.db.insert("communityIntelligenceNodes" as any, {
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
      evidenceCitationIds,
      evidencePolicyVersion: COMMUNITY_EVIDENCE_POLICY_VERSION,
      outcomeObservationIds: changeRequest.outcomeObservationIds ?? [],
      stalenessScore: clampScore(payload.stalenessScore, 0),
      retrievalUsefulnessScore: clampScore(payload.retrievalUsefulnessScore, 0),
      outcomeImpactScore: clampScore(payload.outcomeImpactScore, 0),
      createdByActorType: actor.actorType,
      ...actorUserPatch(actor, "createdByUserId", "createdByAgentKey"),
      lastUpdatedByActorType: actor.actorType,
      ...actorUserPatch(actor, "lastUpdatedByUserId", "lastUpdatedByAgentKey"),
      ...(changeRequest.outcomeObservationIds?.length ? { lastValidatedAt: nowMs } : {}),
      originChangeRequestId: changeRequest._id,
      version: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const node = await getIntelligenceNodeOrThrow(args.ctx, nodeId);
    appliedNodeIds = [node._id];
    appliedMutationId = await insertMutationLog({
      ctx: args.ctx,
      communityId: changeRequest.communityId,
      operation: "create_node",
      actorType: actor.actorType,
      actorUserId: actor.actorUserId,
      actorAgentKey: actor.actorAgentKey,
      targetNodeIds: appliedNodeIds,
      afterSnapshot: mapNodeRow(node),
      sourceTraceIds: changeRequest.sourceTraceIds ?? [],
      policyDecisionId: normalizeIdValue(changeRequest._id),
      reason:
        args.reason ??
        (autonomousCompilerMemory
          ? "autonomous_compiler_memory_create_node"
          : "accepted_change_request_create_node"),
      nowMs,
    });
  } else if (changeRequest.operation === "create_edge") {
    const fromNodeId = changeRequest.primaryTargetNodeId;
    if (!fromNodeId) throw new Error("community_intelligence_edge_from_node_required");
    if (payload.fromNodeId && normalizeIdValue(payload.fromNodeId) !== normalizeIdValue(fromNodeId)) {
      throw new Error("community_intelligence_edge_from_node_mismatch");
    }
    const fromNode = await getIntelligenceNodeOrThrow(args.ctx, fromNodeId);
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
      const toNode = await getIntelligenceNodeOrThrow(args.ctx, toNodeId);
      if (normalizeIdValue(toNode.communityId) !== normalizeIdValue(changeRequest.communityId)) {
        throw new Error("community_intelligence_to_node_not_found");
      }
    }
    await requireReferenceBelongsToCommunity(args.ctx, changeRequest.communityId, toReferenceType, toReferenceId);
    const edgeType =
      typeof payload.type === "string" && EDGE_TYPES.has(payload.type) ? payload.type : undefined;
    if (!edgeType) throw new Error("community_intelligence_edge_type_required");
    const edgeVisibility = payloadVisibility(payload.visibilityScope) ?? "community";
    await requireCommunityEvidenceCitationVisibilityCore({
      ctx: args.ctx,
      communityId: changeRequest.communityId,
      citationIds: evidenceCitationIds,
      outputVisibility: edgeVisibility,
    });
    const edgeId = await args.ctx.db.insert("communityIntelligenceEdges" as any, {
      communityId: changeRequest.communityId,
      fromNodeId,
      ...(toNodeId ? { toNodeId } : {}),
      ...(toReferenceType ? { toReferenceType } : {}),
      ...(toReferenceId ? { toReferenceId } : {}),
      type: edgeType,
      confidence: clampScore(payload.confidence, changeRequest.confidence),
      evidenceTraceIds: changeRequest.sourceTraceIds ?? [],
      evidenceCitationIds,
      evidencePolicyVersion: COMMUNITY_EVIDENCE_POLICY_VERSION,
      visibilityScope: edgeVisibility,
      createdByActorType: actor.actorType,
      ...actorUserPatch(actor, "createdByUserId", "createdByAgentKey"),
      ...(typeof payload.compilerRunId === "string"
        ? { compilerRunId: normalizeBoundedText(payload.compilerRunId, 512, "compiler_run_id_required") }
        : {}),
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const edge = (await args.ctx.db.get(edgeId as any)) as IntelligenceEdgeRow | null;
    if (!edge) throw new Error("community_intelligence_edge_create_failed");
    appliedNodeIds = [fromNodeId, ...(toNodeId ? [toNodeId] : [])];
    appliedEdgeIds = [edge._id];
    appliedMutationId = await insertMutationLog({
      ctx: args.ctx,
      communityId: changeRequest.communityId,
      operation: "create_edge",
      actorType: actor.actorType,
      actorUserId: actor.actorUserId,
      actorAgentKey: actor.actorAgentKey,
      targetNodeIds: appliedNodeIds,
      targetEdgeIds: appliedEdgeIds,
      afterSnapshot: mapEdgeRow(edge),
      sourceTraceIds: changeRequest.sourceTraceIds ?? [],
      policyDecisionId: normalizeIdValue(changeRequest._id),
      reason:
        args.reason ??
        (autonomousCompilerMemory
          ? "autonomous_compiler_memory_create_edge"
          : "accepted_change_request_create_edge"),
      nowMs,
    });
  } else {
    const targetNodeId = changeRequest.primaryTargetNodeId ?? changeRequest.targetNodeIds?.[0];
    if (!targetNodeId) throw new Error("community_intelligence_change_request_target_node_required");
    const existing = await getIntelligenceNodeOrThrow(args.ctx, targetNodeId);
    if (normalizeIdValue(existing.communityId) !== normalizeIdValue(changeRequest.communityId)) {
      throw new Error("community_intelligence_node_not_found");
    }
    const nextSourceTraceIds =
      changeRequest.operation === "attach_evidence"
        ? Array.from(new Set([...(existing.sourceTraceIds ?? []), ...(changeRequest.sourceTraceIds ?? [])]))
        : existing.sourceTraceIds ?? [];
    const requestTraceIds = new Set((changeRequest.sourceTraceIds ?? []).map(normalizeIdValue));
    const requestRecapturesAllExistingTraces = (existing.sourceTraceIds ?? []).every((traceId) =>
      requestTraceIds.has(normalizeIdValue(traceId)),
    );
    const nextEvidenceCitationIds =
      changeRequest.operation === "attach_evidence"
        ? requestRecapturesAllExistingTraces
          ? evidenceCitationIds
          : Array.from(
              new Set([...(existing.evidenceCitationIds ?? []), ...evidenceCitationIds]),
            )
        : existing.evidenceCitationIds ?? [];
    if (
      changeRequest.operation === "attach_evidence" &&
      !requestRecapturesAllExistingTraces &&
      existing.evidencePolicyVersion === COMMUNITY_EVIDENCE_POLICY_VERSION
    ) {
      await requireCommunityEvidenceCitationsActiveCore({
        ctx: args.ctx,
        communityId: changeRequest.communityId,
        citationIds: existing.evidenceCitationIds ?? [],
      });
    }
    const effectiveEvidenceCitationIds = Array.from(
      new Set([...nextEvidenceCitationIds, ...evidenceCitationIds]),
    );
    const nextEvidencePolicyVersion =
      existing.evidencePolicyVersion === COMMUNITY_EVIDENCE_POLICY_VERSION ||
      ((existing.sourceTraceIds ?? []).length === 0 && evidenceCitationIds.length > 0) ||
      (changeRequest.operation === "attach_evidence" && requestRecapturesAllExistingTraces)
        ? COMMUNITY_EVIDENCE_POLICY_VERSION
        : undefined;
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
    await requireCommunityEvidenceCitationVisibilityCore({
      ctx: args.ctx,
      communityId: changeRequest.communityId,
      citationIds: effectiveEvidenceCitationIds,
      outputVisibility: nodeVisibility.visibilityScope,
    });
    await requireCommunityEvidenceCitationVisibilityCore({
      ctx: args.ctx,
      communityId: changeRequest.communityId,
      citationIds: effectiveEvidenceCitationIds,
      outputVisibility: nodeVisibility.sourceVisibility,
    });
    const patch: Record<string, unknown> = {
      updatedAt: nowMs,
      version: Number(existing.version ?? 1) + 1,
      lastUpdatedByActorType: actor.actorType,
      ...actorUserPatch(actor, "lastUpdatedByUserId", "lastUpdatedByAgentKey"),
      sourceTraceIds: nextSourceTraceIds,
      evidenceCitationIds: nextEvidenceCitationIds,
      ...(nextEvidencePolicyVersion ? { evidencePolicyVersion: nextEvidencePolicyVersion } : {}),
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
      const deprecatedBy = await getIntelligenceNodeOrThrow(args.ctx, payload.deprecatedByNodeId as any);
      if (normalizeIdValue(deprecatedBy.communityId) !== normalizeIdValue(changeRequest.communityId)) {
        throw new Error("community_intelligence_deprecated_by_node_not_found");
      }
      patch.deprecatedByNodeId = payload.deprecatedByNodeId;
    }
    if (changeRequest.operation === "attach_outcome" && changeRequest.outcomeObservationIds?.length) {
      patch.lastValidatedAt = nowMs;
    }
    await args.ctx.db.patch(existing._id as any, patch);
    const updated = await getIntelligenceNodeOrThrow(args.ctx, existing._id);
    appliedNodeIds = [existing._id];
    appliedMutationId = await insertMutationLog({
      ctx: args.ctx,
      communityId: changeRequest.communityId,
      operation: changeRequest.operation,
      actorType: actor.actorType,
      actorUserId: actor.actorUserId,
      actorAgentKey: actor.actorAgentKey,
      targetNodeIds: appliedNodeIds,
      beforeSnapshot: mapNodeRow(existing),
      afterSnapshot: mapNodeRow(updated),
      sourceTraceIds: changeRequest.sourceTraceIds ?? [],
      policyDecisionId: normalizeIdValue(changeRequest._id),
      reason:
        args.reason ??
        (autonomousCompilerMemory
          ? "autonomous_compiler_memory_apply"
          : "accepted_change_request_apply"),
      nowMs,
    });
  }

  await args.ctx.db.patch(changeRequest._id as any, {
    status: "applied",
    appliedMutationId,
    targetNodeIds: appliedNodeIds,
    targetEdgeIds: appliedEdgeIds,
    primaryTargetNodeId: appliedNodeIds[0],
    primaryTargetEdgeId: appliedEdgeIds[0],
    appliedAt: nowMs,
    updatedAt: nowMs,
  });
  return mapChangeRequestRow(await getChangeRequestOrThrow(args.ctx, changeRequest._id));
}

export const getCommunityPolynetOverview = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    nodeLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const { community } = await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const isManager = await viewerCanManageCommunity(ctx, args.communityId, userId);
    const nodeLimit = Math.max(
      1,
      Math.min(POLYNET_OVERVIEW_MAX_NODE_LIMIT, Math.floor(args.nodeLimit ?? POLYNET_OVERVIEW_DEFAULT_NODE_LIMIT)),
    );

    const [nodeResult, resourceResult] = await Promise.all([
      readPolynetOverviewNodes({
        ctx,
        communityId: args.communityId,
        isManager,
        limit: nodeLimit,
      }),
      readPolynetOverviewResources({
        ctx,
        communityId: args.communityId,
        limit: nodeLimit,
      }),
    ]);
    const selectedItems = selectPolynetOverviewItems({
      nodes: nodeResult.nodes,
      resources: resourceResult.resources,
      limit: nodeLimit,
    });
    const nodes = selectedItems
      .filter((item): item is Extract<PolynetOverviewSelectionItem, { kind: "directory" }> => item.kind === "directory")
      .map((item) => item.row);
    const resources = selectedItems
      .filter((item): item is Extract<PolynetOverviewSelectionItem, { kind: "resource" }> => item.kind === "resource")
      .map((item) => item.row);
    const hasMoreNodes =
      nodeResult.hasMoreNodes ||
      resourceResult.hasMoreResources ||
      nodes.length < nodeResult.nodes.length ||
      resources.length < resourceResult.resources.length;
    const [directoryEdgeResult, resourceDerivationEdgeResult] = await Promise.all([
      readPolynetOverviewEdges({
        ctx,
        communityId: args.communityId,
        nodes,
        isManager,
      }),
      readPolynetOverviewResourceDerivationEdges({
        ctx,
        communityId: args.communityId,
        nodes,
        resources,
        isManager,
      }),
    ]);
    const hasMoreEdges =
      directoryEdgeResult.hasMoreEdges || resourceDerivationEdgeResult.hasMoreEdges;
    const recentRunRows = ((await ctx.db
      .query("communityAgentRuns" as any)
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId))
      .order("desc")
      .take(POLYNET_OVERVIEW_RUN_LIMIT * 2)) as Record<string, any>[])
      .filter((row) => row.agentKey === "community_agent")
      .slice(0, POLYNET_OVERVIEW_RUN_LIMIT);
    const latestRun = recentRunRows[0] ?? null;
    const recentRuns = recentRunRows.map(mapPolynetOverviewRun);
    const recentActionSummary = recentRunRows.reduce(
      (acc, row) => {
        acc.applied += normalizeIdList(row.appliedChangeRequestIds).length;
        return acc;
      },
      { applied: 0 },
    );

    return {
      community: {
        id: normalizeIdValue(community._id),
        name: community.name,
        slug: community.slug,
      },
      viewer: {
        is_manager: isManager,
      },
      agent: {
        key: "community_agent",
        status: latestRun?.status ?? "not_started",
        activity_state: communityAgentActivityState(latestRun),
        last_run_at: typeof latestRun?.startedAt === "number" ? toIsoString(latestRun.startedAt) : null,
        last_run_status: latestRun?.status ?? null,
        last_wake_reason: latestRun?.wakeReason ?? null,
        recent_actions_summary: recentActionSummary,
        recent_runs: recentRuns,
      },
      graph: {
        root_node_id: communityGraphRootId(args.communityId),
        nodes: [
          {
            id: communityGraphRootId(args.communityId),
            lineage_id: communityGraphRootId(args.communityId),
            kind: "community",
            community_id: normalizeIdValue(args.communityId),
            label: community.name,
            type: "community",
          },
          ...selectedItems.map(mapPolynetOverviewSelectionNode),
        ],
        edges: [
          ...directoryEdgeResult.edges.map(mapPolynetOverviewEdge),
          ...resources.map((row) => mapPolynetOverviewResourceEdge(args.communityId, row)),
          ...resourceDerivationEdgeResult.edges,
        ],
        node_limit: nodeLimit,
        edge_limit: POLYNET_OVERVIEW_EDGE_LIMIT * 2 + nodeLimit,
        has_more_nodes: hasMoreNodes,
        has_more_edges: hasMoreEdges,
      },
      memory: summarizePolynetOverviewMemory(selectedItems, hasMoreNodes, hasMoreEdges),
    };
  },
});

/* Visitor lens: the memory graph's SHAPE for the public community page —
   member-readable nodes and edges as anonymous dots. Titles and labels are
   stripped, no run history, published communities only. Viewable, never
   selectable; resource and learned-memory content never leave the community. */
export const resolvePublicCommunityMemoryOverviewBySlug = query({
  args: {
    communitySlug: v.string(),
  },
  handler: async (ctx, args) => {
    const slug = normalizeSlug(args.communitySlug);
    const community = await ctx.db
      .query("communities")
      .withIndex("by_slug", (q: any) => q.eq("slug", slug))
      .first();
    if (!community || !communityIsActive(community)) {
      return { ok: false as const };
    }

    const [nodeResult, resourceResult] = await Promise.all([
      readPolynetOverviewNodes({
        ctx,
        communityId: community._id,
        isManager: false,
        limit: POLYNET_OVERVIEW_DEFAULT_NODE_LIMIT,
      }),
      readPolynetOverviewResources({
        ctx,
        communityId: community._id,
        limit: POLYNET_OVERVIEW_DEFAULT_NODE_LIMIT,
      }),
    ]);
    const selectedItems = selectPolynetOverviewItems({
      nodes: nodeResult.nodes,
      resources: resourceResult.resources,
      limit: POLYNET_OVERVIEW_DEFAULT_NODE_LIMIT,
    });
    const nodes = selectedItems
      .filter((item): item is Extract<PolynetOverviewSelectionItem, { kind: "directory" }> => item.kind === "directory")
      .map((item) => item.row);
    const resources = selectedItems
      .filter((item): item is Extract<PolynetOverviewSelectionItem, { kind: "resource" }> => item.kind === "resource")
      .map((item) => item.row);
    const hasMoreNodes =
      nodeResult.hasMoreNodes ||
      resourceResult.hasMoreResources ||
      nodes.length < nodeResult.nodes.length ||
      resources.length < resourceResult.resources.length;
    const [directoryEdgeResult, resourceDerivationEdgeResult] = await Promise.all([
      readPolynetOverviewEdges({
        ctx,
        communityId: community._id,
        nodes,
        isManager: false,
      }),
      readPolynetOverviewResourceDerivationEdges({
        ctx,
        communityId: community._id,
        nodes,
        resources,
        isManager: false,
      }),
    ]);
    const hasMoreEdges =
      directoryEdgeResult.hasMoreEdges || resourceDerivationEdgeResult.hasMoreEdges;
    const latestRun = ((await ctx.db
      .query("communityAgentRuns" as any)
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", community._id))
      .order("desc")
      .take(POLYNET_OVERVIEW_RUN_LIMIT * 2)) as Record<string, any>[])
      .filter((row) => row.agentKey === "community_agent")[0] ?? null;

    return {
      ok: true as const,
      overview: {
        community: {
          id: normalizeIdValue(community._id),
          name: community.name,
          slug: community.slug,
        },
        viewer: {
          is_manager: false,
        },
        agent: {
          key: "community_agent",
          status: latestRun?.status ?? "not_started",
          activity_state: communityAgentActivityState(latestRun),
          last_run_at: null,
          last_run_status: null,
          last_wake_reason: null,
          recent_actions_summary: { applied: 0 },
          recent_runs: [],
        },
        graph: {
          root_node_id: communityGraphRootId(community._id),
          nodes: [
            {
              id: communityGraphRootId(community._id),
              lineage_id: communityGraphRootId(community._id),
              kind: "community",
              community_id: normalizeIdValue(community._id),
              label: community.name,
              type: "community",
            },
            ...selectedItems.map((item) => ({
              ...mapPolynetOverviewSelectionNode(item),
              label: null,
              title: null,
            })),
          ],
          edges: [
            ...directoryEdgeResult.edges.map(mapPolynetOverviewEdge),
            ...resources.map((row) => mapPolynetOverviewResourceEdge(community._id, row)),
            ...resourceDerivationEdgeResult.edges,
          ],
          node_limit: POLYNET_OVERVIEW_DEFAULT_NODE_LIMIT,
          edge_limit:
            POLYNET_OVERVIEW_EDGE_LIMIT * 2 + POLYNET_OVERVIEW_DEFAULT_NODE_LIMIT,
          has_more_nodes: hasMoreNodes,
          has_more_edges: hasMoreEdges,
        },
        memory: summarizePolynetOverviewMemory(selectedItems, hasMoreNodes, hasMoreEdges),
      },
    };
  },
});

export async function searchCommunityMemoryCore(args: {
  ctx: any;
  userId: any;
  communityId: any;
  surface: CommunityEvidenceSurface;
  query?: string;
  types?: NodeType[];
  limit?: number;
  forceMemberView?: boolean;
}) {
  await requireCommunityChatAccess({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  const isManager =
    args.forceMemberView === true
      ? false
      : await viewerCanManageCommunity(
          args.ctx,
          args.communityId,
          args.userId,
        );
  const limit = Math.max(1, Math.min(12, Math.floor(args.limit ?? 5)));
  const queryText = normalizeOptionalLongText(args.query, 512);
  const { nodes, truncated } = await retrieveAcceptedCommunityMemoryNodes({
    ctx: args.ctx,
    communityId: args.communityId,
    isManager,
    query: queryText,
    types: args.types,
    limit,
  });
  const nowMs = Date.now();
  const receipt = await createCommunityMemoryRetrievalReceipt({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
    surface: args.surface,
    retrievedNodeIds: nodes.map((node) => node._id),
    injectedNodeIds: [],
    nowMs,
  });
  return {
    ok: true,
    retrieval_log_id: normalizeIdValue(receipt._id),
    retrieval_receipt: mapCommunityMemoryRetrievalReceipt(receipt),
    epistemic_note: "This result contains accepted community intelligence. Use the canonical channels/ repository subtree for raw recent community evidence.",
    nodes: nodes.map(mapCompactMemoryNode),
    truncated,
  };
}

export const searchCommunityMemoryInternal = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    // Set only by the canonical executor for a member it already authenticated
    // without a Convex identity (a community front end).
    trustedUserId: v.optional(v.id("users")),
    communityId: v.id("communities"),
    surface: communityEvidenceSurfaceValidator,
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
    limit: v.optional(v.number()),
    forceMemberView: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    try {
      const userId = args.trustedUserId ?? await resolveUserIdForAuthenticatedRequest({
        ctx,
        userId: args.userId,
        authSubject: args.authSubject ?? null,
      });
      return await searchCommunityMemoryCore({
        ctx,
        userId,
        communityId: args.communityId,
        surface: args.surface,
        query: args.query,
        types: args.types,
        limit: args.limit,
        forceMemberView: args.forceMemberView,
      });
    } catch (error) {
      return memoryToolError(error, "community_memory_search_failed");
    }
  },
});

export const readCommunityMemoryInternal = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    // Set only by the canonical executor for a member it already authenticated
    // without a Convex identity (a community front end).
    trustedUserId: v.optional(v.id("users")),
    communityId: v.id("communities"),
    surface: communityEvidenceSurfaceValidator,
    nodeId: v.id("communityIntelligenceNodes"),
    retrievalLogId: v.optional(v.id("communityIntelligenceRetrievalLogs")),
    forceMemberView: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    try {
      const userId = args.trustedUserId ?? await resolveUserIdForAuthenticatedRequest({
        ctx,
        userId: args.userId,
        authSubject: args.authSubject ?? null,
      });
      await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
      const isManager =
        args.forceMemberView === true
          ? false
          : await viewerCanManageCommunity(ctx, args.communityId, userId);
      const node = await getIntelligenceNodeOrThrow(ctx, args.nodeId);
      if (normalizeIdValue(node.communityId) !== normalizeIdValue(args.communityId)) {
        throw new Error("community_intelligence_node_not_found");
      }
      if (
        !ACCEPTED_MEMBER_MEMORY_STATUSES.includes(node.status) ||
        !canViewerReadNode(node, isManager)
      ) {
        throw new Error("community_intelligence_node_not_readable");
      }
      if (!(await compilerMemoryEvidenceIsCurrentlyReadable({ ctx, node, isManager }))) {
        throw new Error("community_intelligence_node_evidence_not_readable");
      }

      const [outgoingEdges, incomingEdges] = await Promise.all([
        ctx.db
          .query("communityIntelligenceEdges" as any)
          .withIndex("by_fromNode", (q: any) => q.eq("fromNodeId", args.nodeId))
          .take(24) as Promise<IntelligenceEdgeRow[]>,
        ctx.db
          .query("communityIntelligenceEdges" as any)
          .withIndex("by_toNode", (q: any) => q.eq("toNodeId", args.nodeId))
          .take(24) as Promise<IntelligenceEdgeRow[]>,
      ]);
      const edgeCandidates = [
        ...outgoingEdges.map((edge) => ({ edge, direction: "outgoing" as const })),
        ...incomingEdges.map((edge) => ({ edge, direction: "incoming" as const })),
      ];
      const readableEdges: Array<{
        edge: IntelligenceEdgeRow;
        direction: "incoming" | "outgoing";
      }> = [];
      const publicUserIdCache = new Map<string, string | null>();
      const seenEdgeIds = new Set<string>();
      for (const candidate of edgeCandidates) {
        const edgeId = normalizeIdValue(candidate.edge._id);
        if (!edgeId || seenEdgeIds.has(edgeId)) continue;
        seenEdgeIds.add(edgeId);
        if (normalizeIdValue(candidate.edge.communityId) !== normalizeIdValue(args.communityId)) continue;
        if (!(await canViewerReadEdge({
          ctx,
          communityId: args.communityId,
          edge: candidate.edge,
          userId,
          isManager,
        }))) {
          continue;
        }
        readableEdges.push(candidate);
      }
      const edges = [];
      for (const candidate of readableEdges
        .sort((a, b) => {
          const aContradicts = a.edge.type === "contradicts" ? 1 : 0;
          const bContradicts = b.edge.type === "contradicts" ? 1 : 0;
          return bContradicts - aContradicts || b.edge.updatedAt - a.edge.updatedAt;
        })
        .slice(0, 12)) {
        let neighbor: ReturnType<typeof mapCompactMemoryNode> | null = null;
        const neighborNodeId = candidate.direction === "outgoing" ? candidate.edge.toNodeId : candidate.edge.fromNodeId;
        if (neighborNodeId) {
          try {
            const neighborNode = await getIntelligenceNodeOrThrow(ctx, neighborNodeId);
            if (
              normalizeIdValue(neighborNode.communityId) === normalizeIdValue(args.communityId) &&
              ACCEPTED_MEMBER_MEMORY_STATUSES.includes(neighborNode.status) &&
              canViewerReadNode(neighborNode, isManager) &&
              await compilerMemoryEvidenceIsCurrentlyReadable({ ctx, node: neighborNode, isManager })
            ) {
              neighbor = mapCompactMemoryNode(neighborNode);
            }
          } catch {
            neighbor = null;
          }
        }
        if (!neighbor) continue;
        edges.push({
          direction: candidate.direction,
          edge: await mapEdgeRowForAuthorizedRead(
            ctx,
            candidate.edge,
            publicUserIdCache,
          ),
          neighbor,
        });
      }

      const nowMs = Date.now();
      let retrievalLog: RetrievalLogRow | null = null;
      if (args.retrievalLogId) {
        retrievalLog = await requireCanonicalCommunityMemoryReceipt({
          ctx,
          retrievalLogId: args.retrievalLogId,
          communityId: args.communityId,
          userId,
          surface: args.surface,
          nodeId: node._id,
          requiredNodeState: "returned",
        });
        const injectedNodeIds = Array.from(
          new Map(
            [...(retrievalLog.injectedNodeIds ?? []), node._id].map((id) => [normalizeIdValue(id), id]),
          ).values(),
        );
        await ctx.db.patch(retrievalLog._id as any, {
          injectedNodeIds,
          updatedAt: nowMs,
        });
        retrievalLog = (await ctx.db.get(retrievalLog._id as any)) as RetrievalLogRow | null;
      } else {
        retrievalLog = await createCommunityMemoryRetrievalReceipt({
          ctx,
          communityId: args.communityId,
          userId,
          surface: args.surface,
          retrievedNodeIds: [node._id],
          injectedNodeIds: [node._id],
          nowMs,
        });
      }
      if (!retrievalLog) throw new Error("community_intelligence_retrieval_log_not_found");
      return {
        ok: true,
        retrieval_log_id: normalizeIdValue(retrievalLog._id),
        retrieval_receipt: mapCommunityMemoryRetrievalReceipt(retrievalLog),
        node: {
          ...(await mapNodeRowForAuthorizedRead(
            ctx,
            node,
            publicUserIdCache,
          )),
          grade: communityMemoryGrade(node.status),
        },
        edges,
      };
    } catch (error) {
      return memoryToolError(error, "community_memory_read_failed");
    }
  },
});

async function recordCommunityOutcomeObservationCore(args: {
  ctx: any;
  userId: any;
  communityId: any;
  nodeId: any;
  retrievalLogId: any;
  resultStatus: Exclude<OutcomeResultStatus, "unknown">;
  notes?: string;
  receiptSurface: CommunityEvidenceSurface;
}) {
  await requireCommunityChatAccess({ ctx: args.ctx, communityId: args.communityId, userId: args.userId });
  const actor = await resolveWriteActor({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  const node = await getIntelligenceNodeOrThrow(args.ctx, args.nodeId);
  if (normalizeIdValue(node.communityId) !== normalizeIdValue(args.communityId)) {
    throw new Error("community_intelligence_node_not_found");
  }
  const retrievalLog = await requireCanonicalCommunityMemoryReceipt({
    ctx: args.ctx,
    retrievalLogId: args.retrievalLogId,
    communityId: args.communityId,
    userId: args.userId,
    surface: args.receiptSurface,
    nodeId: node._id,
    requiredNodeState: "injected",
  });
  const normalizedNotes = normalizeCommunityOutcomeNotes(args.notes);
  const existingOutcome = await resolveExistingReceiptOutcomeForNode({
    ctx: args.ctx,
    receipt: retrievalLog,
    communityId: args.communityId,
    nodeId: node._id,
    resultStatus: args.resultStatus,
    notes: normalizedNotes,
  });
  if (existingOutcome) {
    return {
      outcome: mapOutcomeObservationRow(existingOutcome),
      deduplicated: true,
    };
  }
  const nowMs = Date.now();
  const observedAt = nowMs;
  const outcomeId = await args.ctx.db.insert("communityOutcomeObservations" as any, {
    communityId: args.communityId,
    nodeId: args.nodeId,
    retrievalLogId: args.retrievalLogId,
    resultStatus: args.resultStatus,
    evidenceStrength: "observed",
    notes: normalizedNotes,
    observedByActorType: actor.actorType,
    ...(actor.actorUserId ? { observedByUserId: actor.actorUserId } : {}),
    observedAt,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  const community = (await args.ctx.db.get(args.communityId)) as Record<string, any> | null;
  if (!community) throw new Error("community_intelligence_outcome_community_not_found");
  const memoryMetabolismRevision =
    Math.max(0, Math.floor(Number(community.memoryMetabolismRevision ?? 0))) + 1;
  await args.ctx.db.patch(community._id as any, {
    memoryMetabolismPending: true,
    memoryMetabolismRevision,
    memoryMetabolismRequestedAt: nowMs,
  });
  await insertChangeRequest({
    ctx: args.ctx,
    communityId: args.communityId,
    operation: "attach_outcome",
    outcomeObservationIds: [outcomeId],
    targetNodeIds: [node._id],
    requestedPayload: {
      outcomeObservationId: normalizeIdValue(outcomeId),
      retrievalLogId: normalizeIdValue(args.retrievalLogId),
      resultStatus: args.resultStatus,
      evidenceStrength: "observed",
      workflowId: null,
      notes: normalizedNotes ?? null,
    },
    confidence: args.resultStatus === "worked" ? 0.55 : args.resultStatus === "failed" ? 0.45 : 0.35,
    privacyRisk: 0.2,
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    nowMs,
  });
  await args.ctx.db.patch(retrievalLog._id as any, {
    outcomeObservationIds: Array.from(
      new Map(
        [...(retrievalLog.outcomeObservationIds ?? []), outcomeId].map((id) => [
          normalizeIdValue(id),
          id,
        ]),
      ).values(),
    ),
    updatedAt: nowMs,
  });
  const outcome = (await args.ctx.db.get(outcomeId as any)) as OutcomeObservationRow | null;
  if (!outcome) throw new Error("community_outcome_observation_not_found");
  return {
    outcome: mapOutcomeObservationRow(outcome),
    deduplicated: false,
  };
}

export const recordCommunityOutcomeObservationInternal = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    // Set only by the canonical executor for a member it already authenticated
    // without a Convex identity (a community front end).
    trustedUserId: v.optional(v.id("users")),
    communityId: v.id("communities"),
    surface: communityEvidenceSurfaceValidator,
    nodeId: v.id("communityIntelligenceNodes"),
    retrievalLogId: v.id("communityIntelligenceRetrievalLogs"),
    resultStatus: v.union(
      v.literal("worked"),
      v.literal("failed"),
      v.literal("mixed"),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const userId = args.trustedUserId ?? await resolveUserIdForAuthenticatedRequest({
        ctx,
        userId: args.userId,
        authSubject: args.authSubject ?? null,
      });
      const result = await recordCommunityOutcomeObservationCore({
        ctx,
        userId,
        communityId: args.communityId,
        nodeId: args.nodeId,
        retrievalLogId: args.retrievalLogId,
        receiptSurface: args.surface,
        resultStatus: args.resultStatus,
        notes: args.notes,
      });
      return {
        ok: true,
        outcome_observation_id: result.outcome.id,
        outcome: result.outcome,
        deduplicated: result.deduplicated,
      };
    } catch (error) {
      return memoryToolError(error, "community_memory_outcome_failed");
    }
  },
});

