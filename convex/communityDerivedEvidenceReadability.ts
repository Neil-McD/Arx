import {
  communityEvidenceRefForSourceTrace,
  resolveCommunityEvidenceRefCore,
} from "./communityEvidenceCore";
import {
  COMMUNITY_EVIDENCE_POLICY_VERSION,
  checkCommunityEvidenceCitationCore,
} from "./communityEvidenceCitations";
import { buildCommunitySourceTraceRevision } from "../shared/communitySourceTraceRevision";

const MAX_DERIVED_EVIDENCE_REFS = 50;

type SourceTraceRow = {
  _id: any;
  communityId: any;
  sourceType: string;
  sourceId?: string;
  title?: string;
  summary: string;
  visibilityScope: string;
  sourceVisibility: string;
  workflowId?: string;
  artifactIds?: string[];
  outcomeObservationIds?: any[];
  actorType: string;
  actorUserId?: any;
  actorAgentKey?: string;
  compilerGroupKey?: string;
  compilerContinuationReady?: boolean;
};

type EvidencedNodeRow = {
  communityId: any;
  tags?: string[];
  sourceTraceIds?: any[];
  evidenceCitationIds?: any[];
  evidencePolicyVersion?: string;
};

type DigestItem = {
  sourceTraceIds?: any[];
  sourceRevisions?: string[];
};

type DigestRow = {
  communityId: any;
  items?: unknown[];
};

function normalizeIdValue(raw: unknown): string {
  return String(raw ?? "").trim();
}

function isSourceTraceRow(raw: unknown): raw is SourceTraceRow {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const row = raw as Partial<SourceTraceRow>;
  return Boolean(
    row._id &&
      row.communityId &&
      typeof row.sourceType === "string" &&
      typeof row.summary === "string" &&
      typeof row.visibilityScope === "string" &&
      typeof row.sourceVisibility === "string" &&
      typeof row.actorType === "string",
  );
}

function normalizeUniqueIds(raw: unknown): any[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_DERIVED_EVIDENCE_REFS) return null;
  const seen = new Set<string>();
  const ids: any[] = [];
  for (const value of raw) {
    const id = normalizeIdValue(value);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    ids.push(value);
  }
  return ids;
}

export async function communitySourceTraceRowHasCurrentCanonicalEvidence(args: {
  ctx: { db: any };
  communityId: any;
  trace: unknown;
}): Promise<boolean> {
  if (
    !isSourceTraceRow(args.trace) ||
    normalizeIdValue(args.trace.communityId) !== normalizeIdValue(args.communityId) ||
    args.trace.sourceVisibility === "redacted"
  ) {
    return false;
  }
  const ref = communityEvidenceRefForSourceTrace(args.trace);
  if (!ref) return false;
  const resolution = await resolveCommunityEvidenceRefCore({
    ctx: args.ctx,
    communityId: args.communityId,
    ref,
  });
  return resolution.status === "active";
}

export async function communitySourceTraceHasCurrentCanonicalEvidence(args: {
  ctx: { db: any };
  communityId: any;
  sourceTraceId: any;
}): Promise<boolean> {
  return await communitySourceTraceRowHasCurrentCanonicalEvidence({
    ctx: args.ctx,
    communityId: args.communityId,
    trace: await args.ctx.db.get(args.sourceTraceId as any),
  });
}

export async function communityEvidenceLineageIsCurrentlyActive(args: {
  ctx: { db: any };
  communityId: any;
  sourceTraceIds?: any[];
  evidenceCitationIds?: any[];
}): Promise<boolean> {
  const sourceTraceIds = normalizeUniqueIds(args.sourceTraceIds ?? []);
  const evidenceCitationIds = normalizeUniqueIds(args.evidenceCitationIds ?? []);
  if (!sourceTraceIds || !evidenceCitationIds) return false;
  for (const sourceTraceId of sourceTraceIds) {
    if (!await communitySourceTraceHasCurrentCanonicalEvidence({
      ctx: args.ctx,
      communityId: args.communityId,
      sourceTraceId,
    })) {
      return false;
    }
  }
  for (const citationId of evidenceCitationIds) {
    if (await checkCommunityEvidenceCitationCore({
      ctx: args.ctx,
      communityId: args.communityId,
      citationId,
    }) !== "active") {
      return false;
    }
  }
  return true;
}

export async function communityIntelligenceNodeEvidenceIsCurrentlyActive(args: {
  ctx: { db: any };
  node: EvidencedNodeRow;
}): Promise<boolean> {
  const sourceTraceIds = normalizeUniqueIds(args.node.sourceTraceIds ?? []);
  const evidenceCitationIds = normalizeUniqueIds(args.node.evidenceCitationIds ?? []);
  if (!sourceTraceIds || !evidenceCitationIds) return false;
  const isCompilerMemory = (args.node.tags ?? []).includes("compiler_memory");
  const usesCitationPolicy =
    args.node.evidencePolicyVersion === COMMUNITY_EVIDENCE_POLICY_VERSION;

  if (isCompilerMemory && sourceTraceIds.length === 0) return false;
  if ((isCompilerMemory || usesCitationPolicy) && evidenceCitationIds.length === 0) {
    return false;
  }
  if (!usesCitationPolicy && evidenceCitationIds.length > 0) return false;
  if (sourceTraceIds.length === 0 && evidenceCitationIds.length === 0) return true;

  return await communityEvidenceLineageIsCurrentlyActive({
    ctx: args.ctx,
    communityId: args.node.communityId,
    sourceTraceIds,
    evidenceCitationIds,
  });
}

export async function communityCompilerDigestItemEvidenceIsCurrentlyActive(args: {
  ctx: { db: any };
  communityId: any;
  item: unknown;
}): Promise<boolean> {
  if (!args.item || typeof args.item !== "object" || Array.isArray(args.item)) {
    return false;
  }
  const item = args.item as DigestItem;
  const sourceTraceIds = normalizeUniqueIds(item.sourceTraceIds ?? []);
  if (!sourceTraceIds || sourceTraceIds.length !== 1) return false;
  const sourceTraceId = sourceTraceIds[0];
  const trace = await args.ctx.db.get(sourceTraceId as any);
  if (
    !isSourceTraceRow(trace) ||
    trace.visibilityScope === "private" ||
    trace.sourceVisibility === "private" ||
    trace.sourceVisibility === "redacted"
  ) {
    return false;
  }
  if (!await communitySourceTraceRowHasCurrentCanonicalEvidence({
    ctx: args.ctx,
    communityId: args.communityId,
    trace,
  })) {
    return false;
  }
  const sourceRevisions = Array.isArray(item.sourceRevisions)
    ? item.sourceRevisions.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];
  if (sourceRevisions.length === 0) return true;
  if (sourceRevisions.length !== 1) return false;
  return sourceRevisions[0] === await buildCommunitySourceTraceRevision(trace);
}

export async function communityCompilerDigestEvidenceIsCurrentlyActive(args: {
  ctx: { db: any };
  digest: DigestRow;
}): Promise<boolean> {
  const items = Array.isArray(args.digest.items) ? args.digest.items : [];
  if (items.length === 0 || items.length > 96) return false;
  for (const item of items) {
    if (!await communityCompilerDigestItemEvidenceIsCurrentlyActive({
      ctx: args.ctx,
      communityId: args.digest.communityId,
      item,
    })) {
      return false;
    }
  }
  return true;
}
