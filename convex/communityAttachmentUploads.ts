import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { resolveCommunityChannelActor, requireCommunityChannelCapability } from "./communityChannelAccess";
import { resolveAuthorizedCommunityChannel, requireChannelForAddressableRoot } from "./communityChannelCore";
import { requireProfileSetupCompleteForUser } from "./accountSetupCore";
import { communityAttachmentByteLimit, COMMUNITY_ATTACHMENT_MAX_COUNT } from "../shared/communityAttachmentPolicy";

const PENDING_TTL_MS = 30 * 60 * 1000;
const MAX_PENDING_PER_MEMBER = 16;

export async function requireAttachmentUploadScope(ctx: any, args: {
  ownerId: any; communityId: any; channelId?: any; uploadRootId?: any;
}) {
  const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId: args.ownerId });
  await requireProfileSetupCompleteForUser(ctx, args.ownerId);
  if (args.uploadRootId) {
    const root = await ctx.db.get(args.uploadRootId);
    if (!root || String(root.communityId) !== String(args.communityId) || root.status !== "live" || root.lockedAt) {
      throw new Error("community_attachment_target_unavailable");
    }
    const channel = await requireChannelForAddressableRoot({ ctx, root });
    if (args.channelId && String(channel._id) !== String(args.channelId)) throw new Error("community_attachment_scope_mismatch");
    await requireCommunityChannelCapability({ ctx, channel, actor, capability: "canReply" });
    return channel;
  }
  return resolveAuthorizedCommunityChannel({ ctx, communityId: args.communityId,
    channelId: args.channelId, actor, capability: "canPost", ensureGeneralForWrite: true });
}

export const prepareInternal = internalMutation({
  args: { ownerId: v.id("users"), communityId: v.id("communities"),
    channelId: v.optional(v.id("communityChannels")), uploadRootId: v.optional(v.id("communityInteractionRoots")),
    messageKey: v.string(), name: v.string(), mime: v.string() },
  handler: async (ctx, args) => {
    const messageKey = args.messageKey.trim();
    if (!messageKey || messageKey.length > 160) throw new Error("community_attachment_message_key_invalid");
    const channel = await requireAttachmentUploadScope(ctx, args);
    const pending = await ctx.db.query("communityInteractionAttachments")
      .withIndex("by_uploader_status", q => q.eq("createdByUserId", args.ownerId).eq("status", "pending"))
      .take(MAX_PENDING_PER_MEMBER);
    if (pending.length >= MAX_PENDING_PER_MEMBER ||
      pending.filter(row => row.uploadMessageKey === messageKey).length >= COMMUNITY_ATTACHMENT_MAX_COUNT) {
      throw new Error("community_attachment_pending_limit");
    }
    const now = Date.now();
    const attachmentId = await ctx.db.insert("communityInteractionAttachments", {
      communityId: args.communityId, channelId: channel._id,
      uploadRootId: args.uploadRootId, uploadMessageKey: messageKey,
      uploadExpiresAt: now + PENDING_TTL_MS, status: "pending",
      name: args.name.trim().slice(0, 256) || "attachment", mimeType: args.mime,
      attachmentKind: args.mime.startsWith("image/") ? "image" : args.mime.startsWith("video/") ? "video" : "file",
      sizeBytes: 0, createdByActorType: "human", createdByUserId: args.ownerId, createdAt: now, updatedAt: now,
    });
    await ctx.scheduler.runAfter(PENDING_TTL_MS, (internal as any).communityAttachmentUploads.cleanupInternal, { attachmentId });
    // Only the authenticated HTTP handler receives this capability, never the client.
    return { attachmentId, uploadUrl: await ctx.storage.generateUploadUrl() };
  },
});

export const finishInternal = internalMutation({
  args: { ownerId: v.id("users"), attachmentId: v.id("communityInteractionAttachments"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.attachmentId);
    if (!row || row.createdByUserId !== args.ownerId || row.status !== "pending" || row.rootId || row.replyId ||
      !row.uploadExpiresAt || row.uploadExpiresAt <= Date.now()) throw new Error("community_attachment_upload_expired");
    await requireAttachmentUploadScope(ctx, { ownerId: args.ownerId, communityId: row.communityId,
      channelId: row.channelId, uploadRootId: row.uploadRootId });
    if (row.storageId && row.storageId !== args.storageId) throw new Error("community_attachment_already_stored");
    const claimed = await ctx.db.query("communityInteractionAttachments").withIndex("by_storage", q => q.eq("storageId", args.storageId)).first();
    if (claimed && claimed._id !== row._id) throw new Error("community_attachment_storage_reused");
    const metadata = await ctx.db.system.get(args.storageId);
    if (!metadata || metadata.size <= 0 || metadata.size > communityAttachmentByteLimit(row.mimeType ?? "") ||
      metadata.contentType !== row.mimeType) throw new Error("community_attachment_metadata_invalid");
    await ctx.db.patch(row._id, { storageId: args.storageId, sizeBytes: metadata.size,
      contentHash: metadata.sha256, updatedAt: Date.now() });
    return { attachmentId: row._id, name: row.name, mime: row.mimeType, size: metadata.size, type: row.attachmentKind };
  },
});

export const cleanupInternal = internalMutation({
  args: { attachmentId: v.id("communityInteractionAttachments"),
    // Only the HTTP handler may cancel its reservation early, with the blob it just received.
    cancelOwnerId: v.optional(v.id("users")), storageId: v.optional(v.id("_storage")) },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.attachmentId);
    if (!row || row.status !== "pending" || row.rootId || row.replyId) return;
    if (args.cancelOwnerId ? row.createdByUserId !== args.cancelOwnerId : (row.uploadExpiresAt ?? Infinity) > Date.now()) return;
    const storageId = row.storageId ?? args.storageId;
    if (storageId) {
      const claims = await ctx.db.query("communityInteractionAttachments").withIndex("by_storage", q => q.eq("storageId", storageId)).take(2);
      if (claims.some(claim => claim._id !== row._id)) throw new Error("community_attachment_storage_reused");
      await ctx.storage.delete(storageId);
    }
    await ctx.db.delete(row._id);
  },
});
