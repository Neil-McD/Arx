import type { CommunityResourceLike } from "./communityCore";
import { normalizeIdValue } from "./communityCore";
import { hydrateCommunityResourceBody } from "./communityResourceContent";
import { resolveCommunityResourceEvidenceSource } from "./communityResourceEvidenceCore";
import { truncateText } from "./communityText";
import { recordTrustedCommunitySourceTraceCore } from "./communityIntelligenceDirectory";
import { resolveCommunityEvidenceRefCore } from "./communityEvidenceCore";
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
 * truth; its source trace is the deterministic compiler projection. No model
 * call, duplicate content row, or approval gate occurs on this write path.
 */
export async function syncCommunityResourceMemoryProjection(
  ctx: ResourceMemoryProjectionContext,
  resource: CommunityResourceLike,
  nowMs = Date.now(),
): Promise<{ visible: boolean; traced: boolean; sourceRef: string }> {
  const sourceRef = resourceEvidenceRef(resource);
  const resolved = await resolveCommunityResourceEvidenceSource({
    ctx,
    communityId: resource.communityId,
    resourceId: resource._id,
  });
  if (!resolved) {
    const traced = await redactCommunityResourceSourceTrace(ctx, resource, nowMs);
    return { visible: false, traced, sourceRef };
  }
  const canonicalResource =
    (await hydrateCommunityResourceBody(ctx, resolved.resource)) ?? resolved.resource;

  const evidence = await resolveCommunityEvidenceRefCore({
    ctx,
    communityId: canonicalResource.communityId,
    ref: sourceRef,
  });
  if (evidence.status !== "active" || evidence.sourceKind !== "resource") {
    throw new Error("community_resource_memory_evidence_resolution_failed");
  }

  await recordTrustedCommunitySourceTraceCore({
    ctx,
    communityId: canonicalResource.communityId,
    sourceType: "resource",
    sourceId: sourceRef,
    title: canonicalResource.title,
    summary: buildCommunityResourceTraceSummary(canonicalResource),
    contentHash: evidence.contentHash,
    provenanceHash: evidence.provenanceHash,
    visibilityScope: "community",
    sourceVisibility: "community",
    actorType: "system",
    actorUserId: canonicalResource.createdByUserId,
    actorAgentKey: COMMUNITY_RESOURCE_MEMORY_AGENT_KEY,
    nowMs,
  });
  return { visible: true, traced: true, sourceRef };
}

/** Revoke derived retrieval/compiler projections before deleting source truth. */
export async function revokeCommunityResourceMemoryProjection(
  ctx: ResourceMemoryProjectionContext,
  resource: CommunityResourceLike,
  nowMs = Date.now(),
): Promise<void> {
  await redactCommunityResourceSourceTrace(ctx, resource, nowMs);
}
