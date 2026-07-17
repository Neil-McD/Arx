import type { CommunityResourceLike } from "./communityCore";
import { normalizeIdValue } from "./communityCore";
import {
  deleteArchiveDocumentBySource,
  truncateText,
  upsertArchiveDocumentForResource,
} from "./communityArchiveDocuments";
import { recordTrustedCommunitySourceTraceCore } from "./communityIntelligenceDirectory";
import { buildCommunityResourceEvidenceRef } from "../shared/communityEvidenceContract";

const COMMUNITY_RESOURCE_MEMORY_AGENT_KEY = "community_resource_memory_projection";
const COMMUNITY_RESOURCE_TRACE_SUMMARY_MAX_CHARS = 4_000;

type ResourceMemoryProjectionContext = {
  db: any;
};

function resourceEvidenceRef(resource: CommunityResourceLike): string {
  return buildCommunityResourceEvidenceRef(normalizeIdValue(resource._id));
}

export function buildCommunityResourceTraceSummary(resource: CommunityResourceLike): string {
  return truncateText(
    [resource.title, resource.bodyMd, resource.url]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join("\n\n"),
    COMMUNITY_RESOURCE_TRACE_SUMMARY_MAX_CHARS,
  );
}

async function readCommunityResourceSourceTrace(
  ctx: ResourceMemoryProjectionContext,
  resource: CommunityResourceLike,
): Promise<Record<string, any> | null> {
  return ((await ctx.db
    .query("communitySourceTraces" as any)
    .withIndex("by_community_source", (q: any) =>
      q
        .eq("communityId", resource.communityId)
        .eq("sourceType", "resource")
        .eq("sourceId", resourceEvidenceRef(resource)),
    )
    .first()) as Record<string, any> | null) ?? null;
}

async function redactCommunityResourceSourceTrace(
  ctx: ResourceMemoryProjectionContext,
  resource: CommunityResourceLike,
  nowMs: number,
): Promise<boolean> {
  const existing = await readCommunityResourceSourceTrace(ctx, resource);
  if (!existing) return false;
  await recordTrustedCommunitySourceTraceCore({
    ctx,
    communityId: resource.communityId,
    sourceType: "resource",
    sourceId: resourceEvidenceRef(resource),
    title: null,
    summary: "Resource is no longer member-visible.",
    visibilityScope: "admin",
    sourceVisibility: "redacted",
    actorType: "system",
    actorUserId: resource.createdByUserId,
    actorAgentKey: COMMUNITY_RESOURCE_MEMORY_AGENT_KEY,
    nowMs,
  });
  return true;
}

/**
 * Canonical resource -> memory lifecycle. The resource row remains product
 * truth; archive and source-trace rows are deterministic retrieval/compiler
 * projections. No model call or approval gate occurs on this write path.
 */
export async function syncCommunityResourceMemoryProjection(
  ctx: ResourceMemoryProjectionContext,
  resource: CommunityResourceLike,
  nowMs = Date.now(),
): Promise<{ indexed: boolean; traced: boolean; sourceRef: string }> {
  const archive = await upsertArchiveDocumentForResource(ctx, resource);
  const sourceRef = resourceEvidenceRef(archive.resource);
  if (!archive.indexed) {
    const traced = await redactCommunityResourceSourceTrace(ctx, archive.resource, nowMs);
    return { indexed: false, traced, sourceRef };
  }

  await recordTrustedCommunitySourceTraceCore({
    ctx,
    communityId: archive.resource.communityId,
    sourceType: "resource",
    sourceId: sourceRef,
    title: archive.resource.title,
    summary: buildCommunityResourceTraceSummary(archive.resource),
    visibilityScope: "community",
    sourceVisibility: "community",
    actorType: "system",
    actorUserId: archive.resource.createdByUserId,
    actorAgentKey: COMMUNITY_RESOURCE_MEMORY_AGENT_KEY,
    nowMs,
  });
  return { indexed: true, traced: true, sourceRef };
}

/** Revoke derived retrieval/compiler projections before deleting source truth. */
export async function revokeCommunityResourceMemoryProjection(
  ctx: ResourceMemoryProjectionContext,
  resource: CommunityResourceLike,
  nowMs = Date.now(),
): Promise<void> {
  await deleteArchiveDocumentBySource(ctx, {
    communityId: resource.communityId,
    sourceType: "resource",
    sourceId: normalizeIdValue(resource._id),
  });
  await redactCommunityResourceSourceTrace(ctx, resource, nowMs);
}
