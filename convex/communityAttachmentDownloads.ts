import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { resolveNotificationRecipientSource } from "./communityNotificationAccess";

// The HTTP adapter alone receives the provider URL. It streams the bytes;
// neither storage IDs nor permanent provider URLs are a private-file API.
export const resolveInternal = internalQuery({
  args: { userId: v.id("users"), attachmentId: v.id("communityInteractionAttachments") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.attachmentId);
    if (!row || row.status !== "uploaded" || !row.storageId || !row.channelId || Boolean(row.rootId) === Boolean(row.replyId)) return null;
    const source = await resolveNotificationRecipientSource({ ctx, communityId: row.communityId, userId: args.userId,
      channelId: row.channelId, rootId: row.rootId, replyId: row.replyId });
    if (!source || String(source.channel._id) !== String(row.channelId)) return null;
    const claims = await ctx.db.query("communityInteractionAttachments")
      .withIndex("by_storage", q => q.eq("storageId", row.storageId)).take(2);
    if (claims.length !== 1 || claims[0]._id !== row._id) return null;
    const url = await ctx.storage.getUrl(row.storageId);
    return url ? { url, name: row.name, mime: row.mimeType ?? "application/octet-stream", size: row.sizeBytes } : null;
  },
});
