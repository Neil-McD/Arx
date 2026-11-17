import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { communityAttachmentByteLimit, COMMUNITY_ATTACHMENT_MAX_COUNT } from "../shared/communityAttachmentPolicy";
import {
  findDirectConversationByUsers, findUserByPublicId, normalizePublicUserId,
  requireActiveUserParticipant, requireDirectConversationSendAccess, requireDirectMessageRelationshipAccess,
} from "./directMessages";

// Files in direct messages, the way channels do theirs (communityAttachmentUploads):
// the sender reserves a row, the HTTP handler alone is given the upload URL and
// streams the bytes, the row is finished against what storage actually holds,
// and one send claims it. A reservation nobody sends is cleaned up.
const PENDING_TTL_MS = 30 * 60 * 1000;
const LATE_UPLOAD_GRACE_MS = 30 * 60 * 1000;
const MAX_PENDING_PER_USER = 16;

// Who the sender may send a file to: a conversation they can write in, or, for
// a first message, a person they are allowed to message.
async function requireUploadScope(ctx: any, args: { ownerId: any; conversationId?: string | null; targetUserId?: string | null; communityId?: string | null }) {
  const conversationId = args.conversationId ? ctx.db.normalizeId("dmConversations", args.conversationId) : null;
  if (conversationId) {
    const { conversation } = await requireActiveUserParticipant({ ctx, conversationId, userId: args.ownerId });
    await requireDirectConversationSendAccess({ ctx, conversation, viewerUserId: args.ownerId });
    return { conversationId: conversation._id, targetUserId: undefined };
  }
  const target = await findUserByPublicId(ctx, normalizePublicUserId(args.targetUserId));
  if (!target || String(target._id) === String(args.ownerId)) throw new Error("dm_conversation_access_required");
  await requireDirectMessageRelationshipAccess({ ctx, viewerUserId: args.ownerId, targetUserId: target._id,
    preferredCommunityId: args.communityId ? ctx.db.normalizeId("communities", args.communityId) : null });
  const existing = await findDirectConversationByUsers(ctx, args.ownerId, target._id);
  return existing ? { conversationId: existing._id, targetUserId: undefined } : { conversationId: undefined, targetUserId: target._id };
}

export const prepareInternal = internalMutation({
  args: { ownerId: v.id("users"), conversationId: v.optional(v.string()), targetUserId: v.optional(v.string()),
    communityId: v.optional(v.string()), messageKey: v.string(), name: v.string(), mime: v.string() },
  handler: async (ctx, args) => {
    const messageKey = args.messageKey.trim();
    if (!messageKey || messageKey.length > 160) throw new Error("dm_attachment_message_key_invalid");
    const scope = await requireUploadScope(ctx, args);
    const pending = await ctx.db.query("dmAttachments")
      .withIndex("by_uploader_status", q => q.eq("uploaderUserId", args.ownerId).eq("status", "pending"))
      .take(MAX_PENDING_PER_USER);
    if (pending.length >= MAX_PENDING_PER_USER ||
      pending.filter(row => row.uploadMessageKey === messageKey).length >= COMMUNITY_ATTACHMENT_MAX_COUNT) {
      throw new Error("dm_attachment_pending_limit");
    }
    const now = Date.now();
    const attachmentId = await ctx.db.insert("dmAttachments", {
      uploaderUserId: args.ownerId, conversationId: scope.conversationId, targetUserId: scope.targetUserId,
      uploadMessageKey: messageKey, uploadExpiresAt: now + PENDING_TTL_MS, status: "pending",
      name: args.name.trim().slice(0, 256) || "attachment", mimeType: args.mime,
      attachmentKind: args.mime.startsWith("image/") ? "image" : args.mime.startsWith("video/") ? "video" : "file",
      sizeBytes: 0, createdAt: now, updatedAt: now,
    });
    await ctx.scheduler.runAfter(PENDING_TTL_MS, (internal as any).directMessageAttachments.cleanupInternal, { attachmentId });
    // Only the authenticated HTTP handler receives this capability, never the client.
    return { attachmentId, uploadUrl: await ctx.storage.generateUploadUrl() };
  },
});

export const finishInternal = internalMutation({
  args: { ownerId: v.id("users"), attachmentId: v.id("dmAttachments"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.attachmentId);
    if (!row || row.uploaderUserId !== args.ownerId || row.status !== "pending" || row.messageId ||
      row.uploadExpiresAt <= Date.now()) throw new Error("dm_attachment_upload_expired");
    if (row.storageId && row.storageId !== args.storageId) throw new Error("dm_attachment_already_stored");
    const claimed = await ctx.db.query("dmAttachments").withIndex("by_storage", q => q.eq("storageId", args.storageId)).first();
    const claimedByChannel = await ctx.db.query("communityInteractionAttachments").withIndex("by_storage", q => q.eq("storageId", args.storageId)).first();
    if ((claimed && claimed._id !== row._id) || claimedByChannel) throw new Error("dm_attachment_storage_reused");
    const metadata = await ctx.db.system.get(args.storageId);
    if (!metadata || metadata.size <= 0 || metadata.size > communityAttachmentByteLimit(row.mimeType) ||
      metadata.contentType !== row.mimeType) throw new Error("dm_attachment_metadata_invalid");
    await ctx.db.patch(row._id, { storageId: args.storageId, sizeBytes: metadata.size, contentHash: metadata.sha256, updatedAt: Date.now() });
    return { attachmentId: row._id, name: row.name, mime: row.mimeType, size: metadata.size, type: row.attachmentKind };
  },
});

export const cleanupInternal = internalMutation({
  args: { attachmentId: v.id("dmAttachments"),
    // Only the HTTP handler may cancel its reservation early, with the blob it just received.
    cancelOwnerId: v.optional(v.id("users")), storageId: v.optional(v.id("_storage")) },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.attachmentId);
    if (!row || (row.status !== "pending" && row.status !== "failed") || row.messageId) return;
    const now = Date.now();
    if (args.cancelOwnerId ? row.uploaderUserId !== args.cancelOwnerId : row.uploadExpiresAt > now) return;
    if (args.storageId && (!args.cancelOwnerId || (row.storageId && row.storageId !== args.storageId))) {
      throw new Error("dm_attachment_cleanup_scope_mismatch");
    }
    const storageId = row.storageId ?? args.storageId;
    if (storageId) {
      const claims = await ctx.db.query("dmAttachments").withIndex("by_storage", q => q.eq("storageId", storageId)).take(2);
      if (claims.some(claim => claim._id !== row._id)) throw new Error("dm_attachment_storage_reused");
      await ctx.storage.delete(storageId);
    } else if (now < row.uploadExpiresAt + LATE_UPLOAD_GRACE_MS) {
      // Storage may still finish after expiry or cancellation: keep the row,
      // unclaimable, so the HTTP handler can reconcile its blob.
      if (row.status === "pending") {
        await ctx.db.patch(row._id, { status: "failed", updatedAt: now });
        await ctx.scheduler.runAfter(row.uploadExpiresAt + LATE_UPLOAD_GRACE_MS - now,
          (internal as any).directMessageAttachments.cleanupInternal, { attachmentId: row._id });
      }
      return;
    }
    await ctx.db.delete(row._id);
  },
});

// The HTTP handler alone is given the storage URL, and only for someone who is
// in the conversation the file was sent in. The sender's own unsent upload is
// not served: the composer shows the file it still holds.
export const resolveDownloadInternal = internalQuery({
  args: { userId: v.id("users"), attachmentId: v.string() },
  handler: async (ctx, args) => {
    const rowId = ctx.db.normalizeId("dmAttachments", args.attachmentId);
    const row = rowId ? await ctx.db.get(rowId) : null;
    if (!row || row.status !== "sent" || !row.storageId || !row.messageId) return null;
    const message = await ctx.db.get(row.messageId);
    if (!message || !row.conversationId || String(message.conversationId) !== String(row.conversationId)) return null;
    try {
      await requireActiveUserParticipant({ ctx, conversationId: message.conversationId, userId: args.userId });
    } catch {
      return null;
    }
    const claims = await ctx.db.query("dmAttachments").withIndex("by_storage", q => q.eq("storageId", row.storageId)).take(2);
    if (claims.length !== 1 || claims[0]._id !== row._id) return null;
    const url = await ctx.storage.getUrl(row.storageId);
    return url ? { url, name: row.name, mime: row.mimeType, size: row.sizeBytes } : null;
  },
});
