import {
  communityInteractionVisibilityIsEvidenceReadable,
  type CommunityInteractionEvidenceObjectType,
} from "../shared/communityEvidenceContract.ts";

function normalizeIdValue(raw: unknown): string {
  return String(raw ?? "").trim();
}

export type CommunityInteractionEvidenceRow = {
  _id: any;
  communityId: any;
  rootId?: any;
  actorType: "human" | "personal_agent" | "community_agent" | "system";
  actorUserId?: any;
  actorAgentKey?: string;
  targetReplyId?: any;
  status: "live" | "hidden" | "deleted";
  visibilityScope: "private" | "admin" | "community" | "public";
  kind?: string;
  title?: string;
  contentSummary: string;
  createdAt: number;
  updatedAt: number;
  editedAt?: number;
};

export type ResolvedCommunityInteractionEvidence = {
  objectType: CommunityInteractionEvidenceObjectType;
  row: CommunityInteractionEvidenceRow;
  root: CommunityInteractionEvidenceRow;
};

function evidenceTableForObjectType(
  objectType: CommunityInteractionEvidenceObjectType,
): "communityInteractionRoots" | "communityInteractionReplies" {
  return objectType === "root"
    ? "communityInteractionRoots"
    : "communityInteractionReplies";
}

/**
 * Resolve structural source truth without applying viewer authority.
 *
 * The reference type selects the only table the id may resolve against. Both
 * the source row and its root must belong to the requested community. This is
 * the canonical boundary used by reads, archive synchronization, and source
 * trace promotion.
 */
export async function resolveCommunityInteractionEvidenceSource(args: {
  ctx: { db: any };
  communityId: any;
  objectType: CommunityInteractionEvidenceObjectType;
  objectId: unknown;
}): Promise<ResolvedCommunityInteractionEvidence | null> {
  const table = evidenceTableForObjectType(args.objectType);
  const objectId = args.ctx.db.normalizeId(table as any, String(args.objectId ?? "").trim());
  if (!objectId) return null;
  const row = (await args.ctx.db.get(objectId)) as CommunityInteractionEvidenceRow | null;
  if (!row || normalizeIdValue(row.communityId) !== normalizeIdValue(args.communityId)) {
    return null;
  }

  if (args.objectType === "root") {
    return { objectType: args.objectType, row, root: row };
  }

  const rootId = args.ctx.db.normalizeId(
    "communityInteractionRoots" as any,
    normalizeIdValue(row.rootId),
  );
  if (!rootId) return null;
  const root = (await args.ctx.db.get(rootId)) as CommunityInteractionEvidenceRow | null;
  if (
    !root ||
    normalizeIdValue(root.communityId) !== normalizeIdValue(args.communityId) ||
    normalizeIdValue(root.communityId) !== normalizeIdValue(row.communityId)
  ) {
    return null;
  }
  return { objectType: args.objectType, row, root };
}

export function communityInteractionEvidenceSourceIsReadable(
  source: ResolvedCommunityInteractionEvidence,
): boolean {
  return (
    source.row.status === "live" &&
    source.root.status === "live" &&
    communityInteractionVisibilityIsEvidenceReadable(source.row.visibilityScope) &&
    communityInteractionVisibilityIsEvidenceReadable(source.root.visibilityScope)
  );
}
