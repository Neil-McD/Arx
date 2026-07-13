import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  normalizeIdValue,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import { createTrustedCommunityIntelligenceChangeRequest } from "./communityIntelligenceDirectory";
import type { CommunityAgentLearningEnvelope } from "../shared/communityAgentToolProtocol";

const COMMUNITY_COMPILER_CANDIDATE_AGENT_KEY = "community_compiler_candidate_v1";
const COMMUNITY_COMPILER_CANDIDATE_PAYLOAD_SOURCE = "compiler_digest_item_v1";

type DigestCategory =
  | "chat_activity"
  | "ai_feed_signal"
  | "resource_activity"
  | "event_activity"
  | "member_state"
  | "outcome_signal"
  | "source_trace_signal"
  | "pending_directory_decision";

type NodeType =
  | "playbook"
  | "insight"
  | "example"
  | "warning_failure"
  | "decision_judgment"
  | "open_question";

type DigestItem = {
  category: DigestCategory;
  title: string;
  summary: string;
  priority: number;
  confidence: number;
  sourceTypes: string[];
  sourceIds: string[];
  sourceTraceIds: any[];
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
  sourceType: string;
  sourceId?: string;
  visibilityScope: string;
  sourceVisibility: string;
};

type ResolvedSourceReference = {
  sourceType: string;
  sourceId: string;
  sourceTraceId: string;
  resolution: "explicit_trace" | "source_reference";
};

type UnresolvedSourceReference = {
  sourceType: string;
  sourceId: string;
  reason: "trace_not_found" | "source_trace_not_found" | "no_resolvable_source_type" | "ambiguous_source_type";
};

type SourceTraceResolution = {
  sourceTraceIds: any[];
  resolvedSourceReferences: ResolvedSourceReference[];
  unresolvedSourceReferences: UnresolvedSourceReference[];
  allResolvedTracesCommunityVisible: boolean;
};

const RESOLVABLE_SOURCE_TRACE_TYPES = new Set([
  "chat",
  "ai_feed",
  "resource",
  "workflow_run",
  "agent_run",
  "artifact",
  "tool_call",
  "outcome",
  "feedback",
  "transcript",
  "manual",
  "external",
]);

function clampScore(raw: unknown, fallback = 0.5): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function truncateText(raw: unknown, maxLen: number): string {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!value) return "";
  return value.length <= maxLen ? value : `${value.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

function normalizeItemIndex(raw: unknown): number {
  const parsed = Math.floor(Number(raw));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("community_compiler_digest_item_index_invalid");
  }
  return parsed;
}

function payloadObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function defaultNodeTypeForDigestCategory(category: DigestCategory): NodeType {
  if (category === "chat_activity") return "open_question";
  if (category === "ai_feed_signal") return "insight";
  if (category === "resource_activity") return "insight";
  if (category === "outcome_signal") return "insight";
  if (category === "source_trace_signal") return "insight";
  throw new Error("community_compiler_digest_item_not_candidate");
}

function normalizeNodeTypeOverride(args: {
  category: DigestCategory;
  override?: NodeType;
}): NodeType {
  if (args.category === "pending_directory_decision") {
    throw new Error("community_compiler_digest_item_already_in_airlock");
  }
  if (args.category === "event_activity" || args.category === "member_state") {
    throw new Error("community_compiler_digest_item_not_learning_signal");
  }
  return args.override ?? defaultNodeTypeForDigestCategory(args.category);
}

function sourceTraceIdsFromItem(item: DigestItem): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const traceId of item.sourceTraceIds ?? []) {
    const id = normalizeIdValue(traceId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(traceId);
    if (out.length >= 12) break;
  }
  return out;
}

function uniqueBoundedStrings(raw: unknown[] | undefined, maxItems: number, maxLen: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw ?? []) {
    const value = truncateText(entry, maxLen);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= maxItems) break;
  }
  return out;
}

function addResolvedTrace(args: {
  row: SourceTraceRow;
  sourceId: string;
  resolution: "explicit_trace" | "source_reference";
  seen: Set<string>;
  out: SourceTraceResolution;
}): void {
  const sourceTraceId = normalizeIdValue(args.row._id);
  if (!sourceTraceId || args.seen.has(sourceTraceId)) return;
  args.seen.add(sourceTraceId);
  args.out.sourceTraceIds.push(args.row._id);
  args.out.resolvedSourceReferences.push({
    sourceType: args.row.sourceType,
    sourceId: args.sourceId,
    sourceTraceId,
    resolution: args.resolution,
  });
  if (
    !(args.row.visibilityScope === "community" || args.row.visibilityScope === "public") ||
    !(args.row.sourceVisibility === "community" || args.row.sourceVisibility === "public")
  ) {
    args.out.allResolvedTracesCommunityVisible = false;
  }
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

async function getCommunitySourceTraceBySource(args: {
  ctx: any;
  communityId: any;
  sourceType: string;
  sourceId: string;
}): Promise<SourceTraceRow | null> {
  return (await args.ctx.db
    .query("communitySourceTraces" as any)
    .withIndex("by_community_source", (q: any) =>
      q.eq("communityId", args.communityId).eq("sourceType", args.sourceType).eq("sourceId", args.sourceId),
    )
    .first()) as SourceTraceRow | null;
}

async function resolveSourceTraceIdsForDigestItem(args: {
  ctx: any;
  communityId: any;
  item: DigestItem;
}): Promise<SourceTraceResolution> {
  const seen = new Set<string>();
  const out: SourceTraceResolution = {
    sourceTraceIds: [],
    resolvedSourceReferences: [],
    unresolvedSourceReferences: [],
    allResolvedTracesCommunityVisible: true,
  };

  for (const traceId of sourceTraceIdsFromItem(args.item)) {
    const trace = await getCommunitySourceTraceById({
      ctx: args.ctx,
      communityId: args.communityId,
      traceId,
    });
    if (!trace) {
      out.unresolvedSourceReferences.push({
        sourceType: "source_trace",
        sourceId: normalizeIdValue(traceId),
        reason: "trace_not_found",
      });
      continue;
    }
    addResolvedTrace({
      row: trace,
      sourceId: trace.sourceId ?? normalizeIdValue(trace._id),
      resolution: "explicit_trace",
      seen,
      out,
    });
    if (out.sourceTraceIds.length >= 12) return out;
  }

  const sourceIds = uniqueBoundedStrings(args.item.sourceIds, 12, 512);
  if (sourceIds.length === 0 || out.sourceTraceIds.length >= 12) return out;

  const sourceTypes = uniqueBoundedStrings(args.item.sourceTypes, 12, 64)
    .filter((sourceType) => RESOLVABLE_SOURCE_TRACE_TYPES.has(sourceType));
  if (sourceTypes.length !== 1) {
    const reason = sourceTypes.length === 0 ? "no_resolvable_source_type" : "ambiguous_source_type";
    for (const sourceId of sourceIds) {
      out.unresolvedSourceReferences.push({
        sourceType: sourceTypes.join(",") || "unknown",
        sourceId,
        reason,
      });
    }
    return out;
  }

  const sourceType = sourceTypes[0];
  for (const sourceId of sourceIds) {
    const trace = await getCommunitySourceTraceBySource({
      ctx: args.ctx,
      communityId: args.communityId,
      sourceType,
      sourceId,
    });
    if (!trace) {
      out.unresolvedSourceReferences.push({
        sourceType,
        sourceId,
        reason: "source_trace_not_found",
      });
      continue;
    }
    addResolvedTrace({
      row: trace,
      sourceId,
      resolution: "source_reference",
      seen,
      out,
    });
    if (out.sourceTraceIds.length >= 12) break;
  }
  return out;
}

type LearningEnvelope = CommunityAgentLearningEnvelope & {
  version: "compiler_learning_envelope_v1";
};

function requireLearningEnvelopeField(
  raw: unknown,
  field: keyof CommunityAgentLearningEnvelope,
  maxLength: number,
): string {
  const value = truncateText(raw, maxLength);
  if (!value) throw new Error(`community_compiler_learning_envelope_${field}_required`);
  return value;
}

export function normalizeCommunityCompilerLearningEnvelope(raw: CommunityAgentLearningEnvelope): LearningEnvelope {
  const record = payloadObject(raw);
  return {
    version: "compiler_learning_envelope_v1",
    learningQuestion: requireLearningEnvelopeField(record.learningQuestion, "learningQuestion", 600),
    candidateClaim: requireLearningEnvelopeField(record.candidateClaim, "candidateClaim", 800),
    rejectedAlternative: requireLearningEnvelopeField(record.rejectedAlternative, "rejectedAlternative", 800),
    preferenceReason: requireLearningEnvelopeField(record.preferenceReason, "preferenceReason", 1_000),
    evidenceSummary: requireLearningEnvelopeField(record.evidenceSummary, "evidenceSummary", 2_000),
    uncertainty: requireLearningEnvelopeField(record.uncertainty, "uncertainty", 1_000),
    falsificationCriteria: requireLearningEnvelopeField(record.falsificationCriteria, "falsificationCriteria", 1_000),
  };
}

function buildCandidateTitle(learningEnvelope: LearningEnvelope): string {
  return truncateText(learningEnvelope.candidateClaim, 180) || "Compiler candidate";
}

function buildCandidateBody(args: {
  digest: CompilerDigestRow;
  item: DigestItem;
  itemIndex: number;
  learningEnvelope: LearningEnvelope;
}): string {
  const sourceTypes = (args.item.sourceTypes ?? []).filter(Boolean).join(", ") || "none";
  const sourceIds = (args.item.sourceIds ?? []).filter(Boolean).slice(0, 12).join(", ") || "none";
  return [
    "Compiler candidate generated from a non-canonical compiler digest item.",
    "",
    `Digest: ${normalizeIdValue(args.digest._id)}`,
    `Digest item index: ${args.itemIndex}`,
    `Digest category: ${args.item.category}`,
    `Digest window: ${toIsoString(args.digest.windowStartedAt)} to ${toIsoString(args.digest.windowEndedAt)}`,
    "",
    "Learning question:",
    args.learningEnvelope.learningQuestion,
    "",
    "Candidate claim:",
    args.learningEnvelope.candidateClaim,
    "",
    "Rejected alternative:",
    args.learningEnvelope.rejectedAlternative,
    "",
    "Preference reason:",
    args.learningEnvelope.preferenceReason,
    "",
    "Evidence summary:",
    args.learningEnvelope.evidenceSummary,
    "",
    "Uncertainty:",
    args.learningEnvelope.uncertainty,
    "",
    "Falsification criteria:",
    args.learningEnvelope.falsificationCriteria,
    "",
    "Candidate summary:",
    args.item.summary,
    "",
    `Source types: ${sourceTypes}`,
    `Source ids: ${sourceIds}`,
    "",
    "Review boundary: this is candidate intelligence only. It must be accepted and applied through the community intelligence airlock before it becomes directory truth.",
  ].join("\n");
}

function buildCandidatePayload(args: {
  digest: CompilerDigestRow;
  item: DigestItem;
  itemIndex: number;
  nodeType: NodeType;
  sourceTraceResolution: SourceTraceResolution;
  learningEnvelope: LearningEnvelope;
  proposedByCommunityAgentRunId?: string;
  proposedByCommunityAgentHeartbeatId?: string;
}) {
  const sourceTraceIds = args.sourceTraceResolution.sourceTraceIds;
  const needsTraceResolution =
    sourceTraceIds.length === 0 &&
    ((args.item.sourceIds ?? []).length > 0 || args.sourceTraceResolution.unresolvedSourceReferences.length > 0);
  const learningEnvelope = args.learningEnvelope;
  return {
    source: COMMUNITY_COMPILER_CANDIDATE_PAYLOAD_SOURCE,
    learningEnvelopeVersion: learningEnvelope.version,
    learningQuestion: learningEnvelope.learningQuestion,
    candidateClaim: learningEnvelope.candidateClaim,
    rejectedAlternative: learningEnvelope.rejectedAlternative,
    preferenceReason: learningEnvelope.preferenceReason,
    evidenceSummary: learningEnvelope.evidenceSummary,
    uncertainty: learningEnvelope.uncertainty,
    falsificationCriteria: learningEnvelope.falsificationCriteria,
    compilerDigestId: normalizeIdValue(args.digest._id),
    compilerDigestDedupeKey: args.digest.dedupeKey,
    digestItemIndex: args.itemIndex,
    digestItemCategory: args.item.category,
    ...(args.proposedByCommunityAgentRunId
      ? { proposedByCommunityAgentRunId: args.proposedByCommunityAgentRunId }
      : {}),
    ...(args.proposedByCommunityAgentHeartbeatId
      ? { proposedByCommunityAgentHeartbeatId: args.proposedByCommunityAgentHeartbeatId }
      : {}),
    digestWindowStartedAt: args.digest.windowStartedAt,
    digestWindowEndedAt: args.digest.windowEndedAt,
    digestSourceTypes: args.item.sourceTypes ?? [],
    digestSourceIds: args.item.sourceIds ?? [],
    sourceTraceResolution: {
      status: sourceTraceIds.length > 0
        ? args.sourceTraceResolution.unresolvedSourceReferences.length > 0
          ? "partial"
          : "resolved"
        : "unresolved",
      sourceTraceIds: sourceTraceIds.map(normalizeIdValue),
      resolvedSourceReferences: args.sourceTraceResolution.resolvedSourceReferences,
      unresolvedSourceReferences: args.sourceTraceResolution.unresolvedSourceReferences,
    },
    type: args.nodeType,
    title: buildCandidateTitle(learningEnvelope),
    bodyMd: buildCandidateBody({
      digest: args.digest,
      item: args.item,
      itemIndex: args.itemIndex,
      learningEnvelope,
    }),
    status: "candidate",
    visibilityScope: "admin",
    sourceVisibility:
      sourceTraceIds.length > 0 && args.sourceTraceResolution.allResolvedTracesCommunityVisible
        ? "community"
        : "redacted",
    confidence: clampScore(args.item.confidence, 0.5),
    evidenceStrength: sourceTraceIds.length > 0 ? "observed" : "anecdotal",
    workflowIds: [],
    tags: [
      "compiler_candidate",
      `digest:${args.item.category}`,
      ...((args.item.sourceTypes ?? []).slice(0, 6).map((sourceType) => `source:${truncateText(sourceType, 40)}`)),
      ...(needsTraceResolution ? ["needs_trace_resolution"] : []),
    ],
  };
}

function candidatePayloadMatchesDigestItem(payload: unknown, digestId: string, itemIndex: number): boolean {
  const record = payloadObject(payload);
  return (
    record.source === COMMUNITY_COMPILER_CANDIDATE_PAYLOAD_SOURCE &&
    record.compilerDigestId === digestId &&
    Number(record.digestItemIndex) === itemIndex
  );
}

function mapCandidateProposal(row: ChangeRequestRow) {
  const payload = payloadObject(row.requestedPayload);
  const sourceTraceResolution = payloadObject(payload.sourceTraceResolution);
  return {
    id: normalizeIdValue(row._id),
    community_id: normalizeIdValue(row.communityId),
    operation: row.operation,
    status: row.status,
    candidate_source: payload.source ?? null,
    compiler_digest_id: typeof payload.compilerDigestId === "string" ? payload.compilerDigestId : null,
    compiler_digest_dedupe_key: typeof payload.compilerDigestDedupeKey === "string" ? payload.compilerDigestDedupeKey : null,
    digest_item_index: typeof payload.digestItemIndex === "number" ? payload.digestItemIndex : null,
    digest_item_category: typeof payload.digestItemCategory === "string" ? payload.digestItemCategory : null,
    candidate_type: typeof payload.type === "string" ? payload.type : null,
    title: typeof payload.title === "string" ? payload.title : null,
    learning_question: typeof payload.learningQuestion === "string" ? payload.learningQuestion : null,
    candidate_claim: typeof payload.candidateClaim === "string" ? payload.candidateClaim : null,
    rejected_alternative: typeof payload.rejectedAlternative === "string" ? payload.rejectedAlternative : null,
    preference_reason: typeof payload.preferenceReason === "string" ? payload.preferenceReason : null,
    source_trace_resolution_status:
      typeof sourceTraceResolution.status === "string" ? sourceTraceResolution.status : null,
    confidence: row.confidence,
    privacy_risk: row.privacyRisk,
    source_trace_ids: (row.sourceTraceIds ?? []).map(normalizeIdValue),
    created_by_actor_type: row.createdByActorType,
    created_by_agent_key: row.createdByAgentKey ?? null,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
    decided_at: typeof row.decidedAt === "number" ? toIsoString(row.decidedAt) : null,
    applied_at: typeof row.appliedAt === "number" ? toIsoString(row.appliedAt) : null,
  };
}

async function getDigestOrThrow(ctx: any, digestId: any): Promise<CompilerDigestRow> {
  const digest = (await ctx.db.get(digestId as any)) as CompilerDigestRow | null;
  if (!digest) throw new Error("community_compiler_digest_not_found");
  return digest;
}

async function findExistingDigestItemCandidate(args: {
  ctx: any;
  communityId: any;
  digestId: string;
  itemIndex: number;
}): Promise<ChangeRequestRow | null> {
  const rows = (await args.ctx.db
    .query("communityIntelligenceChangeRequests" as any)
    .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId))
    .order("desc")
    .take(500)) as ChangeRequestRow[];
  return (
    rows.find((row) =>
      row.operation === "create_node" &&
      row.status !== "rejected" &&
      candidatePayloadMatchesDigestItem(row.requestedPayload, args.digestId, args.itemIndex)
    ) ?? null
  );
}

export async function proposeCommunityIntelligenceFromDigestItemCore(args: {
  ctx: any;
  communityId: any;
  digestId: any;
  itemIndex: number;
  nodeType?: NodeType;
  learningEnvelope: CommunityAgentLearningEnvelope;
  actorType?: "compiler" | "agent";
  actorAgentKey?: string;
  proposedByCommunityAgentRunId?: string;
  proposedByCommunityAgentHeartbeatId?: string;
  nowMs?: number;
}) {
  const digest = await getDigestOrThrow(args.ctx, args.digestId);
  if (normalizeIdValue(digest.communityId) !== normalizeIdValue(args.communityId)) {
    throw new Error("community_compiler_digest_not_found");
  }
  const itemIndex = normalizeItemIndex(args.itemIndex);
  const item = digest.items[itemIndex];
  if (!item) throw new Error("community_compiler_digest_item_not_found");
  const nodeType = normalizeNodeTypeOverride({
    category: item.category,
    override: args.nodeType,
  });
  const digestId = normalizeIdValue(digest._id);
  const existing = await findExistingDigestItemCandidate({
    ctx: args.ctx,
    communityId: args.communityId,
    digestId,
    itemIndex,
  });
  if (existing) {
    return {
      ok: true,
      reused_existing: true,
      proposal: mapCandidateProposal(existing),
    };
  }
  const sourceTraceResolution = await resolveSourceTraceIdsForDigestItem({
    ctx: args.ctx,
    communityId: args.communityId,
    item,
  });
  const learningEnvelope = normalizeCommunityCompilerLearningEnvelope(args.learningEnvelope);
  const requestedPayload = buildCandidatePayload({
    digest,
    item,
    itemIndex,
    nodeType,
    sourceTraceResolution,
    learningEnvelope,
    proposedByCommunityAgentRunId: args.proposedByCommunityAgentRunId,
    proposedByCommunityAgentHeartbeatId: args.proposedByCommunityAgentHeartbeatId,
  });
  const proposal = await createTrustedCommunityIntelligenceChangeRequest({
    ctx: args.ctx,
    communityId: args.communityId,
    operation: "create_node",
    sourceTraceIds: sourceTraceResolution.sourceTraceIds,
    requestedPayload,
    confidence: clampScore(item.confidence, 0.5),
    privacyRisk: clampScore(
      0.25 +
        (sourceTraceResolution.sourceTraceIds.length === 0 && (item.sourceIds ?? []).length > 0 ? 0.1 : 0) +
        (!sourceTraceResolution.allResolvedTracesCommunityVisible ? 0.15 : 0),
      0.25,
    ),
    actorType: args.actorType ?? "compiler",
    actorAgentKey: args.actorAgentKey ?? COMMUNITY_COMPILER_CANDIDATE_AGENT_KEY,
    nowMs: args.nowMs ?? Date.now(),
  });
  return {
    ok: true,
    reused_existing: false,
    proposal,
  };
}

export const listCommunityCompilerCandidateProposals = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    digestId: v.optional(v.id("communityCompilerDigests")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 50)));
    const digestId = args.digestId ? normalizeIdValue(args.digestId) : null;
    const rows = (await ctx.db
      .query("communityIntelligenceChangeRequests" as any)
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId))
      .order("desc")
      .take(Math.max(100, limit * 4))) as ChangeRequestRow[];
    return rows
      .filter((row) => row.operation === "create_node")
      .filter((row) => {
        const payload = payloadObject(row.requestedPayload);
        if (payload.source !== COMMUNITY_COMPILER_CANDIDATE_PAYLOAD_SOURCE) return false;
        if (!digestId) return true;
        return payload.compilerDigestId === digestId;
      })
      .slice(0, limit)
      .map(mapCandidateProposal);
  },
});
