export type CommunitySourceTraceRevisionMaterial = {
  _id: unknown;
  communityId: unknown;
  sourceType: string;
  sourceId?: string;
  title?: string;
  summary: string;
  visibilityScope: string;
  sourceVisibility: string;
  workflowId?: string;
  artifactIds?: string[];
  outcomeObservationIds?: unknown[];
  actorType: string;
  actorUserId?: unknown;
  actorAgentKey?: string;
  compilerGroupKey?: string;
  compilerContinuationReady?: boolean;
};

function normalizeIdValue(raw: unknown): string {
  return String(raw ?? "").trim();
}

export async function buildCommunitySourceTraceRevision(
  row: CommunitySourceTraceRevisionMaterial,
): Promise<string> {
  const material = JSON.stringify({
    version: 1,
    traceId: normalizeIdValue(row._id),
    communityId: normalizeIdValue(row.communityId),
    sourceType: row.sourceType,
    sourceId: row.sourceId ?? null,
    title: row.title ?? null,
    summary: row.summary,
    visibilityScope: row.visibilityScope,
    sourceVisibility: row.sourceVisibility,
    workflowId: row.workflowId ?? null,
    artifactIds: Array.from(new Set(row.artifactIds ?? [])).sort(),
    outcomeObservationIds: Array.from(
      new Set((row.outcomeObservationIds ?? []).map(normalizeIdValue)),
    ).sort(),
    actorType: row.actorType,
    actorUserId: row.actorUserId ? normalizeIdValue(row.actorUserId) : null,
    actorAgentKey: row.actorAgentKey ?? null,
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `trace_revision:v1:${hex}`;
}
