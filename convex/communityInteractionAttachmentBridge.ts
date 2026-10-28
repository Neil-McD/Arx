
import { normalizeIdValue } from "./communityCore";
import { requireAttachmentUploadScope } from "./communityAttachmentUploads";
import { COMMUNITY_ATTACHMENT_MAX_COUNT } from "../shared/communityAttachmentPolicy";

type CanonicalAttachmentKind = "image" | "video" | "file";

type CommunityInteractionAttachmentRow = {
  _id: any;
  channelId?: any;
  rootId?: any;
  replyId?: any;
  attachmentKind: CanonicalAttachmentKind;
  name: string;
  mimeType?: string;
  sizeBytes: number;
  storageId?: any;
  externalUrl?: string;
};

export type NormalizedInteractionAttachmentInput = {
  attachmentId?: string;
  id: string;
  name: string;
  attachmentKind: CanonicalAttachmentKind;
  mimeType?: string;
  sizeBytes: number;
  storageId?: string;
  dataUrl?: string;
};


// New writes accept only canonical claims. Metadata and storage handles are read
// from the server-owned row.
export async function resolveInteractionAttachmentClaims(args: {
  ctx: any; communityId: any; actorUserId: any; messageKey: string;
  rootId?: any; attachments: Array<{ attachmentId: any }>;
}): Promise<NormalizedInteractionAttachmentInput[]> {
  if (args.attachments.length > COMMUNITY_ATTACHMENT_MAX_COUNT) throw new Error("message_attachment_limit_exceeded");
  const seen = new Set<string>();
  const out: NormalizedInteractionAttachmentInput[] = [];
  for (const input of args.attachments) {
    const row = await args.ctx.db.get(input.attachmentId);
    if (seen.has(String(input.attachmentId))) throw new Error("community_attachment_duplicate");
    seen.add(String(input.attachmentId));
    if (!row || !row.storageId || row.createdByUserId !== args.actorUserId || row.communityId !== args.communityId ||
      !row.uploadMessageKey || row.uploadMessageKey !== args.messageKey.trim() ||
      String(row.uploadRootId ?? "") !== String(args.rootId ?? "") ||
      !["pending", "uploaded"].includes(row.status) ||
      (row.status === "pending" && (!row.uploadExpiresAt || row.uploadExpiresAt <= Date.now()))) {
      throw new Error("community_attachment_claim_invalid");
    }
    out.push({ attachmentId: String(row._id), id: String(row._id), name: row.name,
      attachmentKind: row.attachmentKind, mimeType: row.mimeType, sizeBytes: row.sizeBytes });
  }
  return out;
}

export async function claimInteractionAttachmentsForTarget(args: {
  ctx: any; communityId: any; rootId?: any; replyId?: any;
  attachments: NormalizedInteractionAttachmentInput[]; actorUserId: any; nowMs: number; messageKey: string;
}) {
  if (Boolean(args.rootId) === Boolean(args.replyId)) throw new Error("interaction_attachment_target_required");
  if (!args.attachments.length) return;
  const reply = args.replyId ? await args.ctx.db.get(args.replyId) : null;
  const root = await args.ctx.db.get(args.rootId ?? reply?.rootId);
  if (!root || root.communityId !== args.communityId || (reply && reply.communityId !== args.communityId)) {
    throw new Error("community_attachment_scope_mismatch");
  }
  const channel = await requireAttachmentUploadScope(args.ctx, {
    ownerId: args.actorUserId, communityId: args.communityId, channelId: root.channelId,
    uploadRootId: reply ? root._id : undefined,
  });
  for (const input of args.attachments) {
    const row = input.attachmentId ? await args.ctx.db.get(input.attachmentId) : null;
    if (!row || row.createdByUserId !== args.actorUserId || row.communityId !== args.communityId ||
      row.channelId !== channel._id || row.uploadMessageKey !== args.messageKey.trim() || !row.storageId ||
      String(row.uploadRootId ?? "") !== String(reply ? root._id : "")) throw new Error("community_attachment_scope_mismatch");
    if (row.status === "uploaded" && row.rootId === args.rootId && row.replyId === args.replyId) continue;
    if (row.status !== "pending" || row.rootId || row.replyId || (row.uploadExpiresAt ?? 0) <= args.nowMs) {
      throw new Error("community_attachment_already_claimed");
    }
    await args.ctx.db.patch(row._id, { rootId: args.rootId, replyId: args.replyId,
      status: "uploaded", updatedAt: args.nowMs });
  }
}

async function mapCanonicalInteractionAttachment(ctx: any, row: CommunityInteractionAttachmentRow) {
  const reply = row.replyId ? await ctx.db.get(row.replyId) : null;
  const root = row.rootId || reply?.rootId ? await ctx.db.get(row.rootId ?? reply.rootId) : null;
  const channelId = root?.channelId ?? row.channelId;
  const channel = channelId ? await ctx.db.get(channelId) : null;
  if (!root || (channelId && (!channel || channel.communityId !== root.communityId)) ||
    (root.channelId && row.channelId && root.channelId !== row.channelId)) {
    throw new Error("community_attachment_scope_mismatch");
  }
  if (channel?.accessMode === "restricted") {
    // The caller authorizes the message. The download endpoint independently
    // authorizes the current reader; this projection contains no bearer URL.
    return { id: normalizeIdValue(row._id), name: row.name, type: row.attachmentKind,
      mime: row.mimeType ?? null, size: Math.max(0, Math.floor(Number(row.sizeBytes) || 0)),
      protected_download: Boolean(row.storageId) };
  }
  const storageId = row.storageId ? normalizeIdValue(row.storageId) : null;
  const resolvedStorageUrl = row.storageId ? await ctx.storage.getUrl(row.storageId as any) : null;
  const externalUrl = typeof row.externalUrl === "string" && row.externalUrl.trim()
    ? row.externalUrl.trim()
    : null;
  const externalDataUrl = externalUrl?.startsWith("data:image/") ? externalUrl : null;
  const externalHref = externalUrl && !externalDataUrl ? externalUrl : null;
  const url = typeof resolvedStorageUrl === "string" && resolvedStorageUrl.trim()
    ? resolvedStorageUrl.trim()
    : externalHref;
  return {
    id: normalizeIdValue(row._id),
    name: row.name,
    type: row.attachmentKind,
    mime: row.mimeType ?? null,
    size: Math.max(0, Math.floor(Number(row.sizeBytes) || 0)),
    ...(storageId ? { storage_id: storageId } : null),
    ...(url ? { url } : null),
    ...(externalDataUrl ? { data_url: externalDataUrl } : null),
  };
}

export async function listCanonicalInteractionAttachmentsForTarget(args: {
  ctx: any;
  rootId?: any;
  replyId?: any;
}): Promise<Array<Record<string, unknown>>> {
  if (Boolean(args.rootId) === Boolean(args.replyId)) {
    throw new Error("interaction_attachment_target_required");
  }
  const rows = args.rootId
    ? await args.ctx.db
        .query("communityInteractionAttachments" as any)
        .withIndex("by_root", (q: any) => q.eq("rootId", args.rootId))
        .take(COMMUNITY_ATTACHMENT_MAX_COUNT)
    : await args.ctx.db
        .query("communityInteractionAttachments" as any)
        .withIndex("by_reply", (q: any) => q.eq("replyId", args.replyId))
        .take(COMMUNITY_ATTACHMENT_MAX_COUNT);
  return await Promise.all(
    rows
      .filter((row: any) => row?.status === "uploaded")
      .map((row: CommunityInteractionAttachmentRow) => mapCanonicalInteractionAttachment(args.ctx, row)),
  );
}
