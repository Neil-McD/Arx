import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { normalizeIdValue, toIsoString } from "./communityCore";
import { settleCommunityIntelligenceFromDigestItemsCore } from "./communityCompilerCandidates";
import { CANONICAL_COMMUNITY_AGENT_KEY } from "../shared/communityAgentToolProtocol";
import { normalizeCommunityMemoryDecision } from "../shared/communityMemoryDecisionContract";

const DEFAULT_LIMIT = 50;

type CommunityAgentFilesystemContext = {
  communityId: any;
  agentKey: string;
  runId?: string;
  heartbeatId?: string;
  compilerDigestId?: any;
  compilerDigestVersionKey?: string;
};

type ResolvedCommunityAgentFilesystemContext = {
  communityId: any;
  agentKey: string;
  runId?: string;
  heartbeatId?: string;
  compilerDigestId?: any;
  compilerDigestVersionKey?: string;
};

type DigestRow = {
  _id: any;
  communityId: any;
  dedupeKey: string;
  versionKey?: string;
  agentHandoffState?: "pending" | "running" | "handled";
  agentTerminalReason?: "settled" | "superseded" | "retries_exhausted";
  agentClaimId?: string;
  windowStartedAt: number;
  windowEndedAt: number;
  summary: string;
  itemCount: number;
  items: unknown[];
  signalCounts: Record<string, number>;
  createdAt: number;
  updatedAt: number;
};

type NodeRow = {
  _id: any;
  communityId: any;
  type: string;
  title: string;
  bodyMd: string;
  status: string;
  visibilityScope: string;
  sourceVisibility: string;
  confidence: number;
  evidenceStrength: string;
  workflowIds: string[];
  tags: string[];
  updatedAt: number;
  createdAt: number;
};

type EdgeRow = {
  _id: any;
  communityId: any;
  fromNodeId: any;
  toNodeId?: any;
  toReferenceType?: string;
  toReferenceId?: string;
  type: string;
  confidence: number;
  visibilityScope: string;
  updatedAt: number;
  createdAt: number;
};

type ChangeRequestRow = {
  _id: any;
  communityId: any;
  workKey?: string;
  operation: string;
  status: string;
  requestedPayload: unknown;
  sourceTraceIds: any[];
  targetNodeIds: any[];
  targetEdgeIds: any[];
  confidence: number;
  privacyRisk: number;
  createdByActorType: string;
  createdByAgentKey?: string;
  decidedByActorType?: string;
  decidedByAgentKey?: string;
  decisionReason?: string;
  createdAt: number;
  updatedAt: number;
  decidedAt?: number;
  appliedAt?: number;
};

function boundedLimit(raw: unknown): number {
  const parsed = Math.floor(Number(raw ?? DEFAULT_LIMIT));
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(100, parsed));
}

function normalizePath(raw: unknown): string {
  const value = String(raw ?? "/").trim();
  const withRoot = value.startsWith("/") ? value : `/${value}`;
  const collapsed = withRoot.replace(/\/+/g, "/");
  return collapsed.length > 1 ? collapsed.replace(/\/$/, "") : "/";
}

function pathParts(path: string): string[] {
  return normalizePath(path).split("/").filter(Boolean);
}

function payloadObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

const communityAgentFilesystemContextValidator = v.object({
  communityId: v.id("communities"),
  agentKey: v.string(),
  runId: v.optional(v.string()),
  heartbeatId: v.optional(v.string()),
  compilerDigestId: v.optional(v.id("communityCompilerDigests")),
  compilerDigestVersionKey: v.optional(v.string()),
});

function isRecord(raw: unknown): raw is Record<string, any> {
  return !!raw && typeof raw === "object" && !Array.isArray(raw);
}

function hasString(row: Record<string, any>, key: string): boolean {
  return typeof row[key] === "string";
}

function hasNumber(row: Record<string, any>, key: string): boolean {
  return typeof row[key] === "number" && Number.isFinite(row[key]);
}

function hasArray(row: Record<string, any>, key: string): boolean {
  return Array.isArray(row[key]);
}

function hasCommunityId(row: Record<string, any>): boolean {
  return row.communityId !== undefined && row.communityId !== null;
}

function isDigestRow(row: unknown): row is DigestRow {
  return (
    isRecord(row) &&
    hasCommunityId(row) &&
    hasString(row, "dedupeKey") &&
    hasNumber(row, "windowStartedAt") &&
    hasNumber(row, "windowEndedAt") &&
    hasString(row, "summary") &&
    hasNumber(row, "itemCount") &&
    hasArray(row, "items") &&
    isRecord(row.signalCounts) &&
    hasNumber(row, "createdAt") &&
    hasNumber(row, "updatedAt")
  );
}

function isNodeRow(row: unknown): row is NodeRow {
  return (
    isRecord(row) &&
    hasCommunityId(row) &&
    hasString(row, "type") &&
    hasString(row, "title") &&
    hasString(row, "bodyMd") &&
    hasString(row, "status") &&
    hasString(row, "visibilityScope") &&
    hasString(row, "sourceVisibility") &&
    hasNumber(row, "confidence") &&
    hasString(row, "evidenceStrength") &&
    hasArray(row, "workflowIds") &&
    hasArray(row, "tags") &&
    hasNumber(row, "createdAt") &&
    hasNumber(row, "updatedAt")
  );
}

function isEdgeRow(row: unknown): row is EdgeRow {
  return (
    isRecord(row) &&
    hasCommunityId(row) &&
    row.fromNodeId !== undefined &&
    row.fromNodeId !== null &&
    hasString(row, "type") &&
    hasNumber(row, "confidence") &&
    hasString(row, "visibilityScope") &&
    hasNumber(row, "createdAt") &&
    hasNumber(row, "updatedAt")
  );
}

function isChangeRequestRow(row: unknown): row is ChangeRequestRow {
  return (
    isRecord(row) &&
    hasCommunityId(row) &&
    hasString(row, "operation") &&
    hasString(row, "status") &&
    row.requestedPayload !== undefined &&
    hasArray(row, "sourceTraceIds") &&
    hasArray(row, "targetNodeIds") &&
    hasArray(row, "targetEdgeIds") &&
    hasNumber(row, "confidence") &&
    hasNumber(row, "privacyRisk") &&
    hasString(row, "createdByActorType") &&
    hasNumber(row, "createdAt") &&
    hasNumber(row, "updatedAt")
  );
}

function ensureCommunityRow<T extends { communityId?: any }>(
  row: T | null,
  communityId: any,
  errorCode: string,
): T {
  if (!row || normalizeIdValue(row.communityId) !== normalizeIdValue(communityId)) {
    throw new Error(errorCode);
  }
  return row;
}

function normalizeContextToken(raw: unknown, maxLength: number): string | undefined {
  const value = String(raw ?? "").trim();
  return value ? value.slice(0, maxLength) : undefined;
}

async function resolveFilesystemContext(
  ctx: any,
  context: CommunityAgentFilesystemContext,
): Promise<ResolvedCommunityAgentFilesystemContext> {
  const communityId = context.communityId;
  if (!communityId) throw new Error("community_agent_filesystem_context_community_required");
  const community = await ctx.db.get(communityId);
  if (!community) throw new Error("community_not_found");
  const agentKey = normalizeContextToken(context.agentKey, 120);
  if (!agentKey) throw new Error("community_agent_filesystem_context_agent_required");
  if (agentKey !== CANONICAL_COMMUNITY_AGENT_KEY) {
    throw new Error("community_agent_filesystem_context_agent_not_canonical");
  }
  const compilerDigestId = context.compilerDigestId;
  const compilerDigestVersionKey = normalizeContextToken(context.compilerDigestVersionKey, 128);
  if (Boolean(compilerDigestId) !== Boolean(compilerDigestVersionKey)) {
    throw new Error("community_agent_filesystem_digest_identity_incomplete");
  }
  if (compilerDigestId && compilerDigestVersionKey) {
    const digest = await ctx.db.get(compilerDigestId);
    if (
      !isDigestRow(digest) ||
      normalizeIdValue(digest.communityId) !== normalizeIdValue(communityId) ||
      digest.versionKey !== compilerDigestVersionKey
    ) {
      throw new Error("community_agent_filesystem_digest_identity_mismatch");
    }
    if (
      digest.agentHandoffState !== "running" ||
      !context.heartbeatId ||
      digest.agentClaimId !== normalizeContextToken(context.heartbeatId, 200)
    ) {
      throw new Error("community_agent_filesystem_digest_claim_mismatch");
    }
  }
  return {
    communityId,
    agentKey,
    runId: normalizeContextToken(context.runId, 200),
    heartbeatId: normalizeContextToken(context.heartbeatId, 200),
    compilerDigestId,
    compilerDigestVersionKey,
  };
}

function contextMetadata(context: ResolvedCommunityAgentFilesystemContext) {
  return {
    community_id: normalizeIdValue(context.communityId),
    agent_key: context.agentKey,
    run_id: context.runId ?? null,
    heartbeat_id: context.heartbeatId ?? null,
    compiler_digest_id: context.compilerDigestId ? normalizeIdValue(context.compilerDigestId) : null,
    compiler_digest_version_key: context.compilerDigestVersionKey ?? null,
  };
}

function mapDigest(row: DigestRow) {
  return {
    id: normalizeIdValue(row._id),
    path: `/compiler/digests/${normalizeIdValue(row._id)}`,
    dedupe_key: row.dedupeKey,
    version_key: row.versionKey ?? null,
    agent_handoff_state: row.agentHandoffState ?? null,
    agent_terminal_reason: row.agentTerminalReason ?? null,
    window_started_at: toIsoString(row.windowStartedAt),
    window_ended_at: toIsoString(row.windowEndedAt),
    summary: row.summary,
    item_count: row.itemCount,
    items: row.items ?? [],
    signal_counts: row.signalCounts ?? {},
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

function mapNode(row: NodeRow) {
  return {
    id: normalizeIdValue(row._id),
    path: `/directory/nodes/${normalizeIdValue(row._id)}`,
    type: row.type,
    title: row.title,
    body_md: row.bodyMd,
    status: row.status,
    visibility_scope: row.visibilityScope,
    source_visibility: row.sourceVisibility,
    confidence: row.confidence,
    evidence_strength: row.evidenceStrength,
    workflow_ids: row.workflowIds ?? [],
    tags: row.tags ?? [],
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

function mapEdge(row: EdgeRow) {
  return {
    id: normalizeIdValue(row._id),
    path: `/directory/edges/${normalizeIdValue(row._id)}`,
    from_node_id: normalizeIdValue(row.fromNodeId),
    to_node_id: row.toNodeId ? normalizeIdValue(row.toNodeId) : null,
    to_reference_type: row.toReferenceType ?? null,
    to_reference_id: row.toReferenceId ?? null,
    type: row.type,
    confidence: row.confidence,
    visibility_scope: row.visibilityScope,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

function mapChangeRequest(row: ChangeRequestRow) {
  const payload = payloadObject(row.requestedPayload);
  return {
    id: normalizeIdValue(row._id),
    path: `/directory/change-requests/${normalizeIdValue(row._id)}`,
    operation: row.operation,
    status: row.status,
    requested_payload: payload,
    source_trace_ids: (row.sourceTraceIds ?? []).map(normalizeIdValue),
    target_node_ids: (row.targetNodeIds ?? []).map(normalizeIdValue),
    target_edge_ids: (row.targetEdgeIds ?? []).map(normalizeIdValue),
    confidence: row.confidence,
    privacy_risk: row.privacyRisk,
    created_by_actor_type: row.createdByActorType,
    created_by_agent_key: row.createdByAgentKey ?? null,
    candidate_source: payload.source ?? null,
    work_key: row.workKey ?? null,
    compiler_digest_id: payload.compilerDigestId ?? null,
    title: typeof payload.title === "string" ? payload.title : null,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
    decided_at: typeof row.decidedAt === "number" ? toIsoString(row.decidedAt) : null,
    applied_at: typeof row.appliedAt === "number" ? toIsoString(row.appliedAt) : null,
  };
}

async function latestDigests(ctx: any, communityId: any, limit: number): Promise<DigestRow[]> {
  return (await ctx.db
    .query("communityCompilerDigests" as any)
    .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId))
    .order("desc")
    .take(limit)) as DigestRow[];
}

async function latestChangeRequests(ctx: any, communityId: any, limit: number): Promise<ChangeRequestRow[]> {
  return (await ctx.db
    .query("communityIntelligenceChangeRequests" as any)
    .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId))
    .order("desc")
    .take(limit)) as ChangeRequestRow[];
}

async function latestNodes(ctx: any, communityId: any, limit: number): Promise<NodeRow[]> {
  const statuses = ["canonical", "validated", "promising", "contested", "stale", "candidate"];
  const rows: NodeRow[] = [];
  for (const status of statuses) {
    const batch = (await ctx.db
      .query("communityIntelligenceNodes" as any)
      .withIndex("by_community_status_updatedAt", (q: any) =>
        q.eq("communityId", communityId).eq("status", status),
      )
      .order("desc")
      .take(Math.max(5, Math.ceil(limit / 2)))) as NodeRow[];
    rows.push(...batch);
  }
  return rows.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
}

async function readExpectedRow<T extends { communityId?: any }>(
  ctx: any,
  communityId: any,
  id: string,
  errorCode: string,
  isExpectedRow: (row: unknown) => row is T,
): Promise<T> {
  let row: unknown;
  try {
    row = await ctx.db.get(id as any);
  } catch {
    throw new Error(errorCode);
  }
  if (!isExpectedRow(row)) throw new Error(errorCode);
  return ensureCommunityRow(row, communityId, errorCode);
}

async function compilerDigestsForContext(
  ctx: any,
  context: ResolvedCommunityAgentFilesystemContext,
  limit: number,
): Promise<DigestRow[]> {
  if (!context.compilerDigestId) {
    return await latestDigests(ctx, context.communityId, limit);
  }
  const digest = await readExpectedRow(
    ctx,
    context.communityId,
    normalizeIdValue(context.compilerDigestId),
    "community_compiler_digest_not_found",
    isDigestRow,
  );
  if (digest.versionKey !== context.compilerDigestVersionKey) {
    throw new Error("community_agent_filesystem_digest_identity_mismatch");
  }
  return [digest];
}

export const readCommunityAgentFilesystemInternal = internalQuery({
  args: {
    context: communityAgentFilesystemContextValidator,
    path: v.string(),
  },
  handler: async (ctx, args) => {
    const context = await resolveFilesystemContext(ctx, args.context);
    const path = normalizePath(args.path);
    const parts = pathParts(path);

    if (path === "/compiler/window") {
      const [digest] = await compilerDigestsForContext(ctx, context, 1);
      return {
        ...contextMetadata(context),
        path,
        kind: "compiler_window_summary",
        latest_digest: digest ? mapDigest(digest) : null,
      };
    }

    if (parts[0] === "compiler" && parts[1] === "digests" && parts[2]) {
      if (
        context.compilerDigestId &&
        normalizeIdValue(context.compilerDigestId) !== parts[2]
      ) {
        throw new Error("community_agent_filesystem_digest_outside_claim");
      }
      const row = await readExpectedRow(ctx, context.communityId, parts[2], "community_compiler_digest_not_found", isDigestRow);
      return { ...contextMetadata(context), path, kind: "compiler_digest", digest: mapDigest(row) };
    }

    if (parts[0] === "directory" && parts[1] === "nodes" && parts[2]) {
      const row = await readExpectedRow(ctx, context.communityId, parts[2], "community_intelligence_node_not_found", isNodeRow);
      return { ...contextMetadata(context), path, kind: "directory_node", node: mapNode(row) };
    }

    if (parts[0] === "directory" && parts[1] === "edges" && parts[2]) {
      const row = await readExpectedRow(ctx, context.communityId, parts[2], "community_intelligence_edge_not_found", isEdgeRow);
      return { ...contextMetadata(context), path, kind: "directory_edge", edge: mapEdge(row) };
    }

    if (parts[0] === "directory" && parts[1] === "change-requests" && parts[2]) {
      const row = await readExpectedRow(ctx, context.communityId, parts[2], "community_intelligence_change_request_not_found", isChangeRequestRow);
      return { ...contextMetadata(context), path, kind: "directory_change_request", change_request: mapChangeRequest(row) };
    }

    throw new Error("community_agent_filesystem_path_not_readable");
  },
});

export const searchCommunityAgentFilesystemInternal = internalQuery({
  args: {
    context: communityAgentFilesystemContextValidator,
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const context = await resolveFilesystemContext(ctx, args.context);
    const queryText = String(args.query ?? "").trim().toLowerCase();
    if (!queryText) throw new Error("community_agent_filesystem_search_query_required");
    const limit = boundedLimit(args.limit);
    const [digests, nodes, changeRequests] = await Promise.all([
      compilerDigestsForContext(ctx, context, limit),
      latestNodes(ctx, context.communityId, limit),
      latestChangeRequests(ctx, context.communityId, limit),
    ]);
    const matches = [
      ...digests
        .filter((row) => `${row.summary} ${row.dedupeKey}`.toLowerCase().includes(queryText))
        .map((row) => ({ kind: "compiler_digest", path: `/compiler/digests/${normalizeIdValue(row._id)}`, score: 0.7, item: mapDigest(row) })),
      ...nodes
        .filter((row) => `${row.title} ${row.bodyMd} ${row.type} ${row.status}`.toLowerCase().includes(queryText))
        .map((row) => ({ kind: "directory_node", path: `/directory/nodes/${normalizeIdValue(row._id)}`, score: 0.9, item: mapNode(row) })),
      ...changeRequests
        .filter((row) => JSON.stringify(row.requestedPayload ?? {}).toLowerCase().includes(queryText))
        .map((row) => ({ kind: "directory_change_request", path: `/directory/change-requests/${normalizeIdValue(row._id)}`, score: 0.8, item: mapChangeRequest(row) })),
    ];
    return { ...contextMetadata(context), query: args.query, matches: matches.slice(0, limit) };
  },
});

export const inspectCommunityCompilerDigestSettlementInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    digestId: v.id("communityCompilerDigests"),
    versionKey: v.string(),
  },
  handler: async (ctx, args) => {
    const digest = await ctx.db.get(args.digestId);
    if (
      !digest ||
      normalizeIdValue((digest as any).communityId) !== normalizeIdValue(args.communityId) ||
      String((digest as any).versionKey ?? "") !== args.versionKey
    ) {
      throw new Error("community_compiler_digest_not_found");
    }
    const items = Array.isArray((digest as any).items) ? (digest as any).items : [];
    const unsettledWorkKeys: string[] = [];
    for (const item of items) {
      const workKey = String(item?.workKey ?? "").trim();
      const traceIds = Array.isArray(item?.sourceTraceIds) ? item.sourceTraceIds : [];
      if (!workKey || traceIds.length !== 1) {
        unsettledWorkKeys.push(workKey || "missing_work_key");
        continue;
      }
      const trace = await ctx.db.get(traceIds[0] as any);
      if (
        !trace ||
        normalizeIdValue((trace as any).communityId) !== normalizeIdValue(args.communityId) ||
        String((trace as any).compilerDecision?.workKey ?? "") !== workKey
      ) {
        unsettledWorkKeys.push(workKey);
      }
    }
    return {
      complete: items.length > 0 && unsettledWorkKeys.length === 0,
      item_count: items.length,
      unsettled_work_keys: unsettledWorkKeys,
    };
  },
});

export const writeCommunityAgentFilesystemInternal = internalMutation({
  args: {
    context: communityAgentFilesystemContextValidator,
    operation: v.literal("settle_compiler_digest_items"),
    payload: v.object({
      digestId: v.id("communityCompilerDigests"),
      decisions: v.array(v.object({
        workKey: v.string(),
        disposition: v.union(
          v.literal("retain"),
          v.literal("carried_forward"),
          v.literal("dismiss_low_signal"),
        ),
        nodeType: v.union(
          v.literal("playbook"),
          v.literal("insight"),
          v.literal("example"),
          v.literal("warning_failure"),
          v.literal("decision_judgment"),
          v.literal("open_question"),
          v.null(),
        ),
        title: v.union(v.string(), v.null()),
        bodyMd: v.union(v.string(), v.null()),
        appliesWhen: v.union(v.string(), v.null()),
        doesNotApplyWhen: v.union(v.string(), v.null()),
        confidence: v.union(v.number(), v.null()),
        existingNodeId: v.union(v.string(), v.null()),
        reason: v.string(),
      })),
    }),
  },
  handler: async (ctx, args) => {
    const context = await resolveFilesystemContext(ctx, args.context);
    const payload = args.payload ?? {};
    if (payload.decisions.length === 0 || payload.decisions.length > 96) {
      throw new Error("community_agent_filesystem_digest_decisions_required");
    }
    if (!context.compilerDigestId || !context.compilerDigestVersionKey || !context.heartbeatId) {
      throw new Error("community_agent_filesystem_digest_claim_required");
    }
    if (normalizeIdValue(context.compilerDigestId) !== normalizeIdValue(payload.digestId)) {
      throw new Error("community_agent_filesystem_digest_outside_claim");
    }
    const decisions = payload.decisions.map((decision) =>
      normalizeCommunityMemoryDecision(decision),
    );
    const result = await settleCommunityIntelligenceFromDigestItemsCore({
      ctx,
      communityId: context.communityId,
      digestId: payload.digestId,
      decisions,
      actorType: "agent",
      actorAgentKey: context.agentKey,
      runId: context.runId,
      heartbeatId: context.heartbeatId,
    });
    return { ok: true, operation: args.operation, ...contextMetadata(context), result };
  },
});
