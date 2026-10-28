import { type StoredInteractionActorType } from "../shared/communityAgentIdentity";
import {
  communityInteractionVisibilityIsEvidenceReadable,
  parseCommunityInteractionEvidenceRef,
  type CommunityInteractionEvidenceObjectType,
} from "../shared/communityEvidenceContract.ts";
import { interactionBelongsToChannel, requireSharedChannelForInteraction } from "./communityChannelCore";

function normalizeIdValue(raw: unknown): string {
  return String(raw ?? "").trim();
}

export type CommunityInteractionEvidenceRow = {
  _id: any;
  communityId: any;
  channelId?: any;
  rootId?: any;
  actorType: StoredInteractionActorType;
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
  targetReply?: CommunityInteractionEvidenceRow;
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
    normalizeIdValue(root.communityId) !== normalizeIdValue(row.communityId) ||
    (
      row.channelId &&
      root.channelId &&
      normalizeIdValue(root.channelId) !== normalizeIdValue(row.channelId)
    )
  ) {
    return null;
  }
  if (!row.targetReplyId) {
    return { objectType: args.objectType, row, root };
  }
  const targetReplyId = args.ctx.db.normalizeId(
    "communityInteractionReplies" as any,
    normalizeIdValue(row.targetReplyId),
  );
  if (!targetReplyId) return null;
  const targetReply = (await args.ctx.db.get(targetReplyId)) as CommunityInteractionEvidenceRow | null;
  if (
    !targetReply ||
    normalizeIdValue(targetReply.communityId) !== normalizeIdValue(args.communityId) ||
    normalizeIdValue(targetReply.rootId) !== normalizeIdValue(root._id)
  ) {
    return null;
  }
  return { objectType: args.objectType, row, root, targetReply };
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

export async function requireSharedInteractionEvidenceChannel(args: {
  ctx: { db: any };
  communityId: any;
  source: ResolvedCommunityInteractionEvidence;
}) {
  if (!communityInteractionEvidenceSourceIsReadable(args.source)) {
    throw new Error("community_interaction_evidence_not_readable");
  }
  const channel = await requireSharedChannelForInteraction({
    ctx: args.ctx,
    communityId: args.communityId,
    row: args.source.root,
  });
  if (
    !interactionBelongsToChannel(args.source.row, channel) ||
    (args.source.targetReply && !interactionBelongsToChannel(args.source.targetReply, channel))
  ) {
    throw new Error("community_interaction_evidence_channel_not_readable");
  }
  return channel;
}

// Read source truth again at consumption time: a captured trace's visibility
// is not proof of its room's current audience. Non-interaction trace handling
// remains owned by its existing domain policy.
export async function interactionTraceHasSharedSource(args: {
  ctx: { db: any };
  communityId: any;
  trace: { sourceType: string; sourceId?: string; channelId?: any };
}): Promise<boolean> {
  if (args.trace.sourceType !== "interaction") return true;
  const parsed = parseCommunityInteractionEvidenceRef(args.trace.sourceId);
  if (!parsed) return false;
  const source = await resolveCommunityInteractionEvidenceSource({
    ctx: args.ctx,
    communityId: args.communityId,
    objectType: parsed.objectType,
    objectId: parsed.objectId,
  });
  if (!source) return false;
  try {
    const channel = await requireSharedInteractionEvidenceChannel({ ...args, source });
    return !args.trace.channelId || normalizeIdValue(args.trace.channelId) === normalizeIdValue(channel._id);
  } catch {
    return false;
  }
}
