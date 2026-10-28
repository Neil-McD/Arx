import {
  communityEvidenceRefForSourceTrace,
  resolveCommunityEvidenceRefCore,
  type ActiveCommunityEvidenceResolution,
  type CommunityEvidenceSourceKind,
  type CommunityEvidenceVisibility,
} from "./communityEvidenceCore";

export const COMMUNITY_EVIDENCE_POLICY_VERSION = "citation_v1" as const;
export const MAX_COMMUNITY_EVIDENCE_CITATIONS_PER_CHANGE_REQUEST = 50;
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

function citationMatchesResolution(
  citation: CommunityEvidenceCitationRow,
  resolution: ActiveCommunityEvidenceResolution,
): boolean {
  return (
    citation.sourceKind === resolution.sourceKind &&
    (
      citation.sourceVersion === resolution.sourceVersion ||
      resolution.sourceKind === "resource"
    ) &&
    citation.contentHash === resolution.contentHash &&
    citation.provenanceHash === resolution.provenanceHash &&
    citation.capturedVisibility === resolution.visibilityScope
  );
}

async function insertOrReuseCitation(args: {
  ctx: { db: any };
  resolution: ActiveCommunityEvidenceResolution;
  sourceTraceId?: any;
  capturedAt: number;
}): Promise<any> {
  if (args.resolution.sourceKind === "resource") {
    const equivalentCandidates = (await args.ctx.db
      .query("communityEvidenceCitations" as any)
      .withIndex("by_community_ref_fingerprints", (q: any) =>
        q
          .eq("communityId", args.resolution.communityId)
          .eq("sourceRef", args.resolution.sourceRef)
          .eq("contentHash", args.resolution.contentHash)
          .eq("provenanceHash", args.resolution.provenanceHash),
      )
      .take(8)) as CommunityEvidenceCitationRow[];
    const equivalent = equivalentCandidates.find((row) =>
      citationMatchesResolution(row, args.resolution)
    );
    if (equivalent) return equivalent._id;
  }

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
    (row) => citationMatchesResolution(row, args.resolution),
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
  // AI Feed is retained only as historical evidence during the rolling
  // retirement. Existing citations can still be revalidated below, but no
  // retired source may enter a new citation or memory proposal.
  if (resolution.sourceKind === "ai_feed") {
    throw new Error("community_evidence_source_retired");
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
    if (trace.sourceType === "ai_feed") {
      throw new Error("community_evidence_source_retired");
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
    !citationMatchesResolution(citation, resolution)
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
