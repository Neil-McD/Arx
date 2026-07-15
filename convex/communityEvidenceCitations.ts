import {
  communityEvidenceRefForSourceTrace,
  resolveCommunityEvidenceRefCore,
  type ActiveCommunityEvidenceResolution,
  type CommunityEvidenceSourceKind,
  type CommunityEvidenceVisibility,
} from "./communityEvidenceCore";

export const COMMUNITY_EVIDENCE_POLICY_VERSION = "citation_v1" as const;
export const MAX_COMMUNITY_EVIDENCE_CITATIONS_PER_CHANGE_REQUEST = 50;

export type CommunityEvidencePolicyVersion = typeof COMMUNITY_EVIDENCE_POLICY_VERSION;
export type CommunityEvidenceActorType =
  | "member"
  | "admin"
  | "agent"
  | "compiler"
  | "system";

type SourceTraceRow = {
  _id: any;
  communityId: any;
  sourceType: string;
  sourceId?: string;
  visibilityScope: CommunityEvidenceVisibility;
  sourceVisibility: CommunityEvidenceVisibility | "redacted";
};

export type CommunityEvidenceCitationRow = {
  _id: any;
  communityId: any;
  sourceKind: CommunityEvidenceSourceKind;
  sourceRef: string;
  sourceTraceId?: any;
  sourceVersion: string;
  contentHash: string;
  provenanceHash: string;
  capturedVisibility: CommunityEvidenceVisibility;
  capturedAt: number;
};

function normalizeIdValue(raw: unknown): string {
  return String(raw ?? "").trim();
}

function traceIsAdmissibleForActor(
  trace: SourceTraceRow,
  actorType: CommunityEvidenceActorType,
): boolean {
  if (trace.sourceVisibility === "redacted") return false;
  if (actorType === "agent" || actorType === "compiler" || actorType === "system") {
    return (
      trace.visibilityScope !== "private" &&
      trace.sourceVisibility !== "private"
    );
  }
  return true;
}

async function insertOrReuseCitation(args: {
  ctx: { db: any };
  resolution: ActiveCommunityEvidenceResolution;
  sourceTraceId?: any;
  capturedAt: number;
}): Promise<any> {
  const candidates = (await args.ctx.db
    .query("communityEvidenceCitations" as any)
    .withIndex("by_community_ref_version", (q: any) =>
      q
        .eq("communityId", args.resolution.communityId)
        .eq("sourceRef", args.resolution.sourceRef)
        .eq("sourceVersion", args.resolution.sourceVersion),
    )
    .take(8)) as CommunityEvidenceCitationRow[];
  const matching = candidates.find(
    (row) =>
      row.sourceKind === args.resolution.sourceKind &&
      row.contentHash === args.resolution.contentHash &&
      row.provenanceHash === args.resolution.provenanceHash,
  );
  if (matching) return matching._id;
  if (candidates.length > 0) {
    throw new Error("community_evidence_citation_version_hash_conflict");
  }
  return await args.ctx.db.insert("communityEvidenceCitations" as any, {
    communityId: args.resolution.communityId,
    sourceKind: args.resolution.sourceKind,
    sourceRef: args.resolution.sourceRef,
    ...(args.sourceTraceId ? { sourceTraceId: args.sourceTraceId } : {}),
    sourceVersion: args.resolution.sourceVersion,
    contentHash: args.resolution.contentHash,
    provenanceHash: args.resolution.provenanceHash,
    capturedVisibility: args.resolution.visibilityScope,
    capturedAt: args.capturedAt,
  });
}

export async function captureCommunityEvidenceCitationCore(args: {
  ctx: { db: any };
  communityId: any;
  ref: string;
  sourceTraceId?: any;
  capturedAt: number;
}): Promise<any> {
  const resolution = await resolveCommunityEvidenceRefCore({
    ctx: args.ctx,
    communityId: args.communityId,
    ref: args.ref,
  });
  if (resolution.status !== "active") {
    throw new Error("community_evidence_not_admissible");
  }
  return await insertOrReuseCitation({
    ctx: args.ctx,
    resolution,
    sourceTraceId: args.sourceTraceId,
    capturedAt: args.capturedAt,
  });
}

export async function captureCommunityEvidenceCitationsForSourceTracesCore(args: {
  ctx: { db: any };
  communityId: any;
  sourceTraceIds: any[];
  actorType: CommunityEvidenceActorType;
  capturedAt: number;
}): Promise<any[]> {
  if (args.sourceTraceIds.length > MAX_COMMUNITY_EVIDENCE_CITATIONS_PER_CHANGE_REQUEST) {
    throw new Error("community_evidence_source_trace_limit_exceeded");
  }
  const citationIds: any[] = [];
  const seenTraceIds = new Set<string>();
  for (const sourceTraceId of args.sourceTraceIds) {
    const normalizedTraceId = normalizeIdValue(sourceTraceId);
    if (!normalizedTraceId || seenTraceIds.has(normalizedTraceId)) continue;
    seenTraceIds.add(normalizedTraceId);
    const trace = (await args.ctx.db.get(sourceTraceId as any)) as SourceTraceRow | null;
    if (
      !trace ||
      normalizeIdValue(trace.communityId) !== normalizeIdValue(args.communityId) ||
      !traceIsAdmissibleForActor(trace, args.actorType)
    ) {
      throw new Error("community_evidence_source_trace_not_admissible");
    }
    const ref = communityEvidenceRefForSourceTrace(trace);
    if (!ref) throw new Error("community_evidence_source_ref_required");
    citationIds.push(
      await captureCommunityEvidenceCitationCore({
        ctx: args.ctx,
        communityId: args.communityId,
        ref,
        sourceTraceId: trace._id,
        capturedAt: args.capturedAt,
      }),
    );
  }
  return citationIds;
}

export async function checkCommunityEvidenceCitationCore(args: {
  ctx: { db: any };
  communityId: any;
  citationId: any;
}): Promise<"active" | "superseded" | "revoked" | "invalid"> {
  const citation = (await args.ctx.db.get(args.citationId as any)) as CommunityEvidenceCitationRow | null;
  if (!citation || normalizeIdValue(citation.communityId) !== normalizeIdValue(args.communityId)) {
    return "invalid";
  }
  const resolution = await resolveCommunityEvidenceRefCore({
    ctx: args.ctx,
    communityId: args.communityId,
    ref: citation.sourceRef,
  });
  if (resolution.status === "revoked" || resolution.status === "not_readable") {
    return "revoked";
  }
  if (resolution.status !== "active") return "invalid";
  if (
    resolution.sourceKind !== citation.sourceKind ||
    resolution.sourceVersion !== citation.sourceVersion ||
    resolution.contentHash !== citation.contentHash ||
    resolution.provenanceHash !== citation.provenanceHash ||
    resolution.visibilityScope !== citation.capturedVisibility
  ) {
    return "superseded";
  }
  return "active";
}

export async function requireCommunityEvidenceCitationsActiveCore(args: {
  ctx: { db: any };
  communityId: any;
  citationIds: any[];
}): Promise<void> {
  if (args.citationIds.length > MAX_COMMUNITY_EVIDENCE_CITATIONS_PER_CHANGE_REQUEST) {
    throw new Error("community_evidence_citation_limit_exceeded");
  }
  const seen = new Set<string>();
  for (const citationId of args.citationIds) {
    const id = normalizeIdValue(citationId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const status = await checkCommunityEvidenceCitationCore({
      ctx: args.ctx,
      communityId: args.communityId,
      citationId,
    });
    if (status !== "active") {
      throw new Error(`community_evidence_citation_${status}`);
    }
  }
}

function visibilityRank(scope: CommunityEvidenceVisibility | "redacted"): number {
  if (scope === "redacted") return -1;
  if (scope === "private") return 0;
  if (scope === "admin") return 1;
  if (scope === "community") return 2;
  return 3;
}

export async function requireCommunityEvidenceCitationVisibilityCore(args: {
  ctx: { db: any };
  communityId: any;
  citationIds: any[];
  outputVisibility: CommunityEvidenceVisibility | "redacted";
}): Promise<void> {
  const outputRank = visibilityRank(args.outputVisibility);
  for (const citationId of args.citationIds) {
    const citation = (await args.ctx.db.get(citationId as any)) as CommunityEvidenceCitationRow | null;
    if (!citation || normalizeIdValue(citation.communityId) !== normalizeIdValue(args.communityId)) {
      throw new Error("community_evidence_citation_invalid");
    }
    if (outputRank > visibilityRank(citation.capturedVisibility)) {
      throw new Error("community_evidence_visibility_escalation");
    }
  }
}
