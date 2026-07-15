import {
  normalizeIdValue,
  toIsoString,
} from "./communityCore";
import {
  applyTrustedCommunityIntelligenceChangeRequestCore,
  createOrReuseTrustedCommunityIntelligenceChangeRequest,
} from "./communityIntelligenceDirectory";
import {
  buildCommunityMemoryWorkKey,
  isCommunityMemoryWorkKey,
} from "./communityMemoryWorkKey";

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

type NodeType =
  | "playbook"
  | "insight"
  | "example"
  | "warning_failure"
  | "decision_judgment"
  | "open_question";

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
  "interaction",
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
    args.row.sourceVisibility === "redacted"
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
    if (trace.sourceType === "chat") {
      out.unresolvedSourceReferences.push({
        sourceType: "chat",
        sourceId: trace.sourceId ?? normalizeIdValue(trace._id),
        reason: "no_resolvable_source_type",
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

function buildCandidateTitle(item: DigestItem): string {
  return truncateText(item.title, 180) || "Compiler candidate";
}

type LearningEnvelope = {
  version: "compiler_learning_envelope_v1";
  learningQuestion: string;
  candidateClaim: string;
  rejectedAlternative: string;
  preferenceReason: string;
  evidenceSummary: string;
  uncertainty: string;
  falsificationCriteria: string;
};

function learningQuestionForItem(item: DigestItem): string {
  if (item.category === "chat_activity") {
    return "What repeated question, decision, warning, example, or workflow opportunity should be extracted from this conversation evidence?";
  }
  if (item.category === "ai_feed_signal") {
    return "What operational pattern, warning, or workflow hypothesis should be tested from this AI Feed signal?";
  }
  if (item.category === "resource_activity") {
    return "Does this resource evidence support, contradict, stale, or improve any community directory intelligence?";
  }
  if (item.category === "outcome_signal") {
    return "Which existing or candidate pattern did this outcome evidence support, weaken, or falsify?";
  }
  if (item.category === "source_trace_signal") {
    return "What reusable operational pattern might be inferred from these normalized source traces?";
  }
  return "Is there a supported, reusable community learning from this compiler signal?";
}

function rejectedAlternativeForItem(item: DigestItem): string {
  if (item.category === "chat_activity") {
    return "Treat the conversation as isolated chatter and extract no reusable question, warning, example, or workflow implication.";
  }
  if (item.category === "ai_feed_signal") {
    return "Treat the AI Feed signal as interesting commentary without testing whether it should affect future workflows.";
  }
  if (item.category === "resource_activity") {
    return "Treat the resource activity as canonical advice without checking reuse, staleness, contradiction, or outcome evidence.";
  }
  if (item.category === "outcome_signal") {
    return "Leave prior recommendations unchanged despite new outcome evidence.";
  }
  if (item.category === "source_trace_signal") {
    return "Leave normalized evidence uncompiled and unavailable to future workflow retrieval.";
  }
  return "Ignore this signal unless stronger evidence emerges.";
}

function falsificationCriteriaForItem(item: DigestItem): string {
  if (item.category === "outcome_signal") {
    return "Demote or contest the claim if later outcome observations fail to reproduce the same direction under similar conditions.";
  }
  if (item.category === "resource_activity") {
    return "Demote or contest the claim if the source resource becomes stale, contradicted, or unused in relevant workflows.";
  }
  return "Demote, reject, or convert to an open question if later traces fail to show repeated use, outcome movement, or workflow relevance.";
}

function buildLearningEnvelope(args: {
  item: DigestItem;
  sourceTraceResolution: SourceTraceResolution;
}): LearningEnvelope {
  const sourceTypes = uniqueBoundedStrings(args.item.sourceTypes, 8, 64).join(", ") || "none";
  const resolvedCount = args.sourceTraceResolution.sourceTraceIds.length;
  const unresolvedCount = args.sourceTraceResolution.unresolvedSourceReferences.length;
  const candidateClaim = truncateText(args.item.title || args.item.summary, 260) || "The compiler found a possible reusable community learning.";
  return {
    version: "compiler_learning_envelope_v1",
    learningQuestion: learningQuestionForItem(args.item),
    candidateClaim,
    rejectedAlternative: rejectedAlternativeForItem(args.item),
    preferenceReason: "Prefer the candidate only if the evidence shows it is more useful for future workflows than the rejected alternative.",
    evidenceSummary: truncateText(
      `${args.item.summary} Source types: ${sourceTypes}. Formal source traces resolved: ${resolvedCount}. Unresolved source references: ${unresolvedCount}.`,
      900,
    ),
    uncertainty: resolvedCount > 0
      ? "This is still candidate intelligence. It needs community-agent judgment and future outcome feedback before becoming validated memory."
      : "Formal source trace evidence is missing or unresolved, so this should stay low-confidence until evidence is attached.",
    falsificationCriteria: falsificationCriteriaForItem(args.item),
  };
}

function buildCandidateBody(args: {
  digest: CompilerDigestRow;
  item: DigestItem;
  learningEnvelope: LearningEnvelope;
}): string {
  const sourceTypes = (args.item.sourceTypes ?? []).filter(Boolean).join(", ") || "none";
  const sourceIds = (args.item.sourceIds ?? []).filter(Boolean).slice(0, 12).join(", ") || "none";
  return [
    "Compiler candidate generated from a non-canonical compiler digest item.",
    "",
    `Digest: ${normalizeIdValue(args.digest._id)}`,
    `Work key: ${args.item.workKey}`,
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
    "Retention boundary: this compiler output is validated and retained atomically. Fully resolved community-readable evidence may become promising memory; incomplete or higher-risk output remains admin-visible forming memory.",
  ].join("\n");
}

function buildCandidatePayload(args: {
  digest: CompilerDigestRow;
  item: DigestItem;
  nodeType: NodeType;
  sourceTraceResolution: SourceTraceResolution;
  proposedByCommunityAgentRunId?: string;
  proposedByCommunityAgentHeartbeatId?: string;
}) {
  const sourceTraceIds = args.sourceTraceResolution.sourceTraceIds;
  const needsTraceResolution =
    sourceTraceIds.length === 0 &&
    ((args.item.sourceIds ?? []).length > 0 || args.sourceTraceResolution.unresolvedSourceReferences.length > 0);
  const learningEnvelope = buildLearningEnvelope({
    item: args.item,
    sourceTraceResolution: args.sourceTraceResolution,
  });
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
    title: buildCandidateTitle(args.item),
    bodyMd: buildCandidateBody({
      digest: args.digest,
      item: args.item,
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

function mapCandidateProposal(row: ChangeRequestRow) {
  const payload = payloadObject(row.requestedPayload);
  const sourceTraceResolution = payloadObject(payload.sourceTraceResolution);
  return {
    id: normalizeIdValue(row._id),
    community_id: normalizeIdValue(row.communityId),
    operation: row.operation,
    status: row.status,
    work_key: row.workKey ?? null,
    candidate_source: payload.source ?? null,
    compiler_digest_id: typeof payload.compilerDigestId === "string" ? payload.compilerDigestId : null,
    compiler_digest_dedupe_key: typeof payload.compilerDigestDedupeKey === "string" ? payload.compilerDigestDedupeKey : null,
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
  await args.ctx.db.patch(args.row._id as any, {
    requestedPayload: autonomousMemoryPayload({
      payload: args.row.requestedPayload,
      sourceTraceIds: args.row.sourceTraceIds ?? [],
      privacyRisk: args.row.privacyRisk,
    }),
    updatedAt: args.nowMs,
  });
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

export async function retainCommunityIntelligenceFromDigestItemCore(args: {
  ctx: any;
  communityId: any;
  digestId: any;
  workKey: string;
  nodeType?: NodeType;
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
  const workKey = String(args.workKey ?? "").trim();
  if (!isCommunityMemoryWorkKey(workKey)) {
    throw new Error("community_compiler_digest_work_key_invalid");
  }
  const matchingItems = digest.items.filter((candidate) => candidate.workKey === workKey);
  if (matchingItems.length !== 1) {
    throw new Error(
      matchingItems.length === 0
        ? "community_compiler_digest_item_not_found"
        : "community_compiler_digest_work_key_duplicate",
    );
  }
  const item = matchingItems[0];
  const expectedWorkKey = await buildCommunityMemoryWorkKey({
    communityId: args.communityId,
    category: item.category,
    sourceTypes: item.sourceTypes,
    sourceIds: item.sourceIds,
    sourceTraceIds: item.sourceTraceIds,
  });
  if (expectedWorkKey !== workKey) {
    throw new Error("community_compiler_digest_work_key_mismatch");
  }
  const nodeType = normalizeNodeTypeOverride({
    category: item.category,
    override: args.nodeType,
  });
  const sourceTraceResolution = await resolveSourceTraceIdsForDigestItem({
    ctx: args.ctx,
    communityId: args.communityId,
    item,
  });
  const requestedPayload = buildCandidatePayload({
    digest,
    item,
    nodeType,
    sourceTraceResolution,
    proposedByCommunityAgentRunId: args.proposedByCommunityAgentRunId,
    proposedByCommunityAgentHeartbeatId: args.proposedByCommunityAgentHeartbeatId,
  });
  const nowMs = args.nowMs ?? Date.now();
  const actorType = args.actorType ?? "compiler";
  const actorAgentKey = args.actorAgentKey ?? COMMUNITY_COMPILER_CANDIDATE_AGENT_KEY;
  const privacyRisk = clampScore(
    0.25 + (sourceTraceResolution.sourceTraceIds.length === 0 && (item.sourceIds ?? []).length > 0 ? 0.1 : 0),
    0.25,
  );
  const auditRecord = await createOrReuseTrustedCommunityIntelligenceChangeRequest({
    ctx: args.ctx,
    communityId: args.communityId,
    workKey,
    operation: "create_node",
    sourceTraceIds: sourceTraceResolution.sourceTraceIds,
    requestedPayload,
    confidence: clampScore(item.confidence, 0.5),
    privacyRisk,
    actorType,
    actorAgentKey,
    nowMs,
  });
  const auditRow = (await args.ctx.db.get(auditRecord.changeRequest.id as any)) as ChangeRequestRow | null;
  if (!auditRow) throw new Error("community_compiler_candidate_create_failed");
  const retained = await retainCompilerCandidateAutonomously({
    ctx: args.ctx,
    row: auditRow,
    actorType,
    actorAgentKey,
    nowMs,
  });
  return {
    ok: true,
    reused_existing: auditRecord.reusedExisting,
    retention: mapCandidateProposal(retained),
  };
}
