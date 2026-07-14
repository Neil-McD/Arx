import {
  buildCommunityAiFeedEvidenceRef,
  buildCommunityResourceEvidenceRef,
  buildCommunitySourceTraceEvidenceRef,
  parseCommunityAiFeedEvidenceRef,
  parseCommunityEvidenceRef,
  parseCommunityInteractionEvidenceRef,
  parseCommunityResourceEvidenceRef,
  type CommunityEvidenceRef,
} from "../shared/communityEvidenceContract.ts";
import { communityInteractionVisibilityIsEvidenceReadable } from "../shared/communityEvidenceContract.ts";
import { resolveCommunityAiFeedEvidenceSource } from "./communityAiFeedEvidenceCore";
import {
  resolveCommunityInteractionEvidenceSource,
  type ResolvedCommunityInteractionEvidence,
} from "./communityInteractionEvidenceCore";
import { hydrateCommunityResourceBody } from "./communityResourceContent";
import { resolveCommunityResourceEvidenceSource } from "./communityResourceEvidenceCore";

export type CommunityEvidenceVisibility = "private" | "admin" | "community" | "public";
export type CommunityEvidenceSourceKind =
  | "interaction"
  | "resource"
  | "ai_feed"
  | "source_trace";

export type ActiveCommunityEvidenceResolution = {
  status: "active";
  communityId: any;
  sourceKind: CommunityEvidenceSourceKind;
  sourceRef: CommunityEvidenceRef;
  sourceVersion: string;
  contentHash: string;
  provenanceHash: string;
  visibilityScope: CommunityEvidenceVisibility;
};

export type InactiveCommunityEvidenceResolution = {
  status: "invalid" | "not_readable" | "revoked";
  sourceRef: string;
};

export type CommunityEvidenceResolution =
  | ActiveCommunityEvidenceResolution
  | InactiveCommunityEvidenceResolution;

type SourceTraceRow = {
  _id: any;
  communityId: any;
  sourceType: string;
  sourceId?: string;
  title?: string;
  summary: string;
  visibilityScope: CommunityEvidenceVisibility;
  sourceVisibility: CommunityEvidenceVisibility | "redacted";
  actorType: string;
  actorUserId?: any;
  actorAgentKey?: string;
  workflowId?: string;
  artifactIds?: string[];
  outcomeObservationIds?: any[];
  updatedAt: number;
};

type InteractionChildRow = {
  _id: any;
  communityId: any;
  rootId?: any;
  replyId?: any;
  updatedAt?: number;
  [key: string]: unknown;
};

function normalizeIdValue(raw: unknown): string {
  return String(raw ?? "").trim();
}

function normalizeOptionalText(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  return value || null;
}

function sortedUniqueStrings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(raw.map((value) => normalizeIdValue(value)).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
}

function sourceVersion(args: {
  updatedAtValues: unknown[];
  contentHash: string;
  provenanceHash: string;
}): string {
  const maxUpdatedAt = args.updatedAtValues.reduce<number>((max, raw) => {
    const value = Math.floor(Number(raw));
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
  return `u:${Math.max(1, maxUpdatedAt)}:c:${args.contentHash.slice(0, 16)}:p:${args.provenanceHash.slice(0, 16)}`;
}

async function sha256HexText(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function stableRowId(row: { _id: any }): string {
  return normalizeIdValue(row._id);
}

function childBelongsToSource(args: {
  child: InteractionChildRow;
  communityId: any;
  source: ResolvedCommunityInteractionEvidence;
}): boolean {
  if (normalizeIdValue(args.child.communityId) !== normalizeIdValue(args.communityId)) {
    return false;
  }
  const objectId = normalizeIdValue(args.source.row._id);
  if (args.source.objectType === "root") {
    return (
      normalizeIdValue(args.child.rootId) === objectId &&
      !normalizeIdValue(args.child.replyId)
    );
  }
  return (
    normalizeIdValue(args.child.replyId) === objectId &&
    !normalizeIdValue(args.child.rootId)
  );
}

async function resolveInteractionEvidence(args: {
  ctx: { db: any };
  communityId: any;
  sourceRef: CommunityEvidenceRef;
  objectType: "root" | "reply";
  objectId: string;
}): Promise<CommunityEvidenceResolution> {
  const source = await resolveCommunityInteractionEvidenceSource({
    ctx: args.ctx,
    communityId: args.communityId,
    objectType: args.objectType,
    objectId: args.objectId,
  });
  if (!source) return { status: "not_readable", sourceRef: args.sourceRef };
  if (
    source.row.status !== "live" ||
    source.root.status !== "live" ||
    !communityInteractionVisibilityIsEvidenceReadable(source.row.visibilityScope) ||
    !communityInteractionVisibilityIsEvidenceReadable(source.root.visibilityScope)
  ) {
    return { status: "revoked", sourceRef: args.sourceRef };
  }

  const parentIndex = args.objectType === "root" ? "by_root" : "by_reply";
  const blockIndex = args.objectType === "root" ? "by_root_order" : "by_reply_order";
  const parentField = args.objectType === "root" ? "rootId" : "replyId";
  const [blocks, attachments, embeds] = (await Promise.all([
    args.ctx.db
      .query("communityInteractionContentBlocks" as any)
      .withIndex(blockIndex, (q: any) => q.eq(parentField, source.row._id))
      .take(65),
    args.ctx.db
      .query("communityInteractionAttachments" as any)
      .withIndex(parentIndex, (q: any) => q.eq(parentField, source.row._id))
      .take(33),
    args.ctx.db
      .query("communityInteractionEmbeds" as any)
      .withIndex(parentIndex, (q: any) => q.eq(parentField, source.row._id))
      .take(33),
  ])) as [InteractionChildRow[], InteractionChildRow[], InteractionChildRow[]];

  if (blocks.length > 64 || attachments.length > 32 || embeds.length > 32) {
    return { status: "invalid", sourceRef: args.sourceRef };
  }
  if (
    [...blocks, ...attachments, ...embeds].some(
      (child) => !childBelongsToSource({ child, communityId: args.communityId, source }),
    )
  ) {
    return { status: "invalid", sourceRef: args.sourceRef };
  }

  const readableEmbeds = embeds.filter(
    (embed) =>
      embed.status !== "redacted" &&
      communityInteractionVisibilityIsEvidenceReadable(String(embed.visibilityScope ?? "private")),
  );
  const liveAttachments = attachments.filter((attachment) => attachment.status !== "deleted");
  const orderedBlocks = blocks.slice().sort((a, b) => {
    return Number(a.blockOrder ?? 0) - Number(b.blockOrder ?? 0) || stableRowId(a).localeCompare(stableRowId(b));
  });
  liveAttachments.sort((a, b) => stableRowId(a).localeCompare(stableRowId(b)));
  readableEmbeds.sort((a, b) => stableRowId(a).localeCompare(stableRowId(b)));
  const attachmentPayload = await Promise.all(
    liveAttachments.map(async (attachment) => {
      const externalUrl = normalizeOptionalText(attachment.externalUrl);
      return {
        id: stableRowId(attachment),
        kind: normalizeOptionalText(attachment.attachmentKind),
        status: normalizeOptionalText(attachment.status),
        name: normalizeOptionalText(attachment.name),
        mime_type: normalizeOptionalText(attachment.mimeType),
        size_bytes: Number(attachment.sizeBytes ?? 0),
        content_hash: normalizeOptionalText(attachment.contentHash),
        external_url_hash: externalUrl ? await sha256HexText(externalUrl) : null,
      };
    }),
  );

  const contentPayload = {
    title: normalizeOptionalText(source.root.title),
    summary: String(source.row.contentSummary ?? ""),
    blocks: orderedBlocks.map((block) => ({
      id: stableRowId(block),
      order: Number(block.blockOrder ?? 0),
      type: normalizeOptionalText(block.blockType),
      text: normalizeOptionalText(block.text),
      url: normalizeOptionalText(block.url),
      workspace_ref_kind: normalizeOptionalText(block.workspaceRefKind),
      workspace_ref_id: normalizeOptionalText(block.workspaceRefId),
    })),
    attachments: attachmentPayload,
    embeds: readableEmbeds.map((embed) => ({
      id: stableRowId(embed),
      kind: normalizeOptionalText(embed.embedKind),
      status: normalizeOptionalText(embed.status),
      source_url: normalizeOptionalText(embed.sourceUrl),
      workspace_ref_kind: normalizeOptionalText(embed.workspaceRefKind),
      workspace_ref_id: normalizeOptionalText(embed.workspaceRefId),
      title: normalizeOptionalText(embed.title),
      description: normalizeOptionalText(embed.description),
    })),
  };
  const provenancePayload = {
    community_id: normalizeIdValue(args.communityId),
    object_type: args.objectType,
    object_id: normalizeIdValue(source.row._id),
    root_id: normalizeIdValue(source.root._id),
    target_reply_id: source.targetReply ? normalizeIdValue(source.targetReply._id) : null,
    actor_type: source.row.actorType,
    actor_user_id: source.row.actorUserId ? normalizeIdValue(source.row.actorUserId) : null,
    actor_agent_key: normalizeOptionalText(source.row.actorAgentKey),
    visibility_scope: source.row.visibilityScope,
  };
  const contentHash = await sha256HexText(JSON.stringify(contentPayload));
  const provenanceHash = await sha256HexText(JSON.stringify(provenancePayload));
  return {
    status: "active",
    communityId: args.communityId,
    sourceKind: "interaction",
    sourceRef: args.sourceRef,
    sourceVersion: sourceVersion({
      updatedAtValues: [
        source.row.updatedAt,
        ...blocks.map((row) => row.updatedAt),
        ...attachments.map((row) => row.updatedAt),
        ...embeds.map((row) => row.updatedAt),
      ],
      contentHash,
      provenanceHash,
    }),
    contentHash,
    provenanceHash,
    visibilityScope: source.row.visibilityScope,
  };
}

async function resolveResourceEvidence(args: {
  ctx: { db: any };
  communityId: any;
  sourceRef: CommunityEvidenceRef;
  resourceId: string;
}): Promise<CommunityEvidenceResolution> {
  const source = await resolveCommunityResourceEvidenceSource({
    ctx: args.ctx,
    communityId: args.communityId,
    resourceId: args.resourceId,
  });
  if (!source) return { status: "not_readable", sourceRef: args.sourceRef };
  const hydrated = await hydrateCommunityResourceBody(args.ctx, source.resource);
  if (!hydrated) return { status: "not_readable", sourceRef: args.sourceRef };
  const contentPayload = {
    title: hydrated.title,
    body_md: hydrated.bodyMd ?? null,
    body_hash: hydrated.bodyHash ?? null,
    url: hydrated.url ?? null,
    type: hydrated.type,
    role: hydrated.role ?? null,
    module_name: source.module.name,
    module_description_md: source.module.descriptionMd ?? null,
  };
  const provenancePayload = {
    community_id: normalizeIdValue(args.communityId),
    resource_id: normalizeIdValue(hydrated._id),
    module_id: normalizeIdValue(source.module._id),
    created_by_user_id: normalizeIdValue(hydrated.createdByUserId),
    visibility_scope: "community",
  };
  const contentHash = await sha256HexText(JSON.stringify(contentPayload));
  const provenanceHash = await sha256HexText(JSON.stringify(provenancePayload));
  return {
    status: "active",
    communityId: args.communityId,
    sourceKind: "resource",
    sourceRef: args.sourceRef,
    sourceVersion: sourceVersion({
      updatedAtValues: [hydrated.updatedAt, source.module.updatedAt],
      contentHash,
      provenanceHash,
    }),
    contentHash,
    provenanceHash,
    visibilityScope: "community",
  };
}

async function resolveAiFeedEvidence(args: {
  ctx: { db: any };
  communityId: any;
  sourceRef: CommunityEvidenceRef;
  postId: string;
}): Promise<CommunityEvidenceResolution> {
  const post = await resolveCommunityAiFeedEvidenceSource({
    ctx: args.ctx,
    communityId: args.communityId,
    postId: args.postId,
  });
  if (!post) return { status: "not_readable", sourceRef: args.sourceRef };
  const contentPayload = {
    title: post.title ?? null,
    body: post.body,
    evidence: Array.isArray(post.evidence) ? post.evidence.map(String) : [],
    why_now: post.whyNow ?? null,
    post_type: post.type,
  };
  const provenancePayload = {
    community_id: normalizeIdValue(args.communityId),
    post_id: normalizeIdValue(post._id),
    author_type: post.authorType,
    author_user_id: post.authorUserId ? normalizeIdValue(post.authorUserId) : null,
    agent_key: normalizeOptionalText(post.agentKey),
    visibility_scope: "community",
  };
  const contentHash = await sha256HexText(JSON.stringify(contentPayload));
  const provenanceHash = await sha256HexText(JSON.stringify(provenancePayload));
  return {
    status: "active",
    communityId: args.communityId,
    sourceKind: "ai_feed",
    sourceRef: args.sourceRef,
    sourceVersion: sourceVersion({
      updatedAtValues: [post.updatedAt],
      contentHash,
      provenanceHash,
    }),
    contentHash,
    provenanceHash,
    visibilityScope: "community",
  };
}

async function resolveSourceTraceEvidence(args: {
  ctx: { db: any };
  communityId: any;
  sourceRef: CommunityEvidenceRef;
  sourceTraceId: string;
}): Promise<CommunityEvidenceResolution> {
  const traceId = args.ctx.db.normalizeId("communitySourceTraces" as any, args.sourceTraceId);
  if (!traceId) return { status: "invalid", sourceRef: args.sourceRef };
  const trace = (await args.ctx.db.get(traceId)) as SourceTraceRow | null;
  if (!trace || normalizeIdValue(trace.communityId) !== normalizeIdValue(args.communityId)) {
    return { status: "not_readable", sourceRef: args.sourceRef };
  }
  if (trace.sourceVisibility === "redacted") {
    return { status: "revoked", sourceRef: args.sourceRef };
  }
  const contentPayload = {
    title: trace.title ?? null,
    summary: trace.summary,
    source_type: trace.sourceType,
    source_id: trace.sourceId ?? null,
    workflow_id: trace.workflowId ?? null,
    artifact_ids: sortedUniqueStrings(trace.artifactIds),
    outcome_observation_ids: sortedUniqueStrings(trace.outcomeObservationIds),
  };
  const provenancePayload = {
    community_id: normalizeIdValue(args.communityId),
    source_trace_id: normalizeIdValue(trace._id),
    actor_type: trace.actorType,
    actor_user_id: trace.actorUserId ? normalizeIdValue(trace.actorUserId) : null,
    actor_agent_key: normalizeOptionalText(trace.actorAgentKey),
    visibility_scope: trace.visibilityScope,
    source_visibility: trace.sourceVisibility,
  };
  const contentHash = await sha256HexText(JSON.stringify(contentPayload));
  const provenanceHash = await sha256HexText(JSON.stringify(provenancePayload));
  return {
    status: "active",
    communityId: args.communityId,
    sourceKind: "source_trace",
    sourceRef: args.sourceRef,
    sourceVersion: sourceVersion({
      updatedAtValues: [trace.updatedAt],
      contentHash,
      provenanceHash,
    }),
    contentHash,
    provenanceHash,
    visibilityScope: trace.visibilityScope,
  };
}

export async function resolveCommunityEvidenceRefCore(args: {
  ctx: { db: any };
  communityId: any;
  ref: unknown;
}): Promise<CommunityEvidenceResolution> {
  const parsed = parseCommunityEvidenceRef(args.ref);
  const sourceRef = String(args.ref ?? "").trim();
  if (!parsed) return { status: "invalid", sourceRef };
  if (parsed.source_type === "interaction") {
    return await resolveInteractionEvidence({
      ctx: args.ctx,
      communityId: args.communityId,
      sourceRef: parsed.ref,
      objectType: parsed.object_type,
      objectId: parsed.object_id,
    });
  }
  if (parsed.source_type === "resource") {
    return await resolveResourceEvidence({
      ctx: args.ctx,
      communityId: args.communityId,
      sourceRef: parsed.ref,
      resourceId: parsed.resource_id,
    });
  }
  if (parsed.source_type === "ai_feed") {
    return await resolveAiFeedEvidence({
      ctx: args.ctx,
      communityId: args.communityId,
      sourceRef: parsed.ref,
      postId: parsed.post_id,
    });
  }
  return await resolveSourceTraceEvidence({
    ctx: args.ctx,
    communityId: args.communityId,
    sourceRef: parsed.ref,
    sourceTraceId: parsed.source_trace_id,
  });
}

export function communityEvidenceRefForSourceTrace(
  trace: Pick<SourceTraceRow, "_id" | "sourceType" | "sourceId">,
): CommunityEvidenceRef | null {
  const sourceId = String(trace.sourceId ?? "").trim();
  if (trace.sourceType === "interaction") {
    return parseCommunityInteractionEvidenceRef(sourceId)
      ? (sourceId as CommunityEvidenceRef)
      : null;
  }
  if (trace.sourceType === "resource") {
    const resourceId = parseCommunityResourceEvidenceRef(sourceId) ?? sourceId;
    return resourceId ? buildCommunityResourceEvidenceRef(resourceId) : null;
  }
  if (trace.sourceType === "ai_feed") {
    const postId = parseCommunityAiFeedEvidenceRef(sourceId) ?? sourceId;
    return postId ? buildCommunityAiFeedEvidenceRef(postId) : null;
  }
  if (trace.sourceType === "chat") {
    // Legacy chat traces cannot prove canonical lifecycle or deletion state.
    // Their linked canonical interaction must be promoted instead.
    return null;
  }
  return buildCommunitySourceTraceEvidenceRef(normalizeIdValue(trace._id));
}
