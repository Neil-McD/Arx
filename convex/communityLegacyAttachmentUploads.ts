import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireCommunityChatAccess } from "./communityCore";
import { requireProfileSetupCompleteForUser } from "./accountSetupCore";
import { requireAttachmentUploadScope } from "./communityAttachmentUploads";
import { communityAttachmentByteLimit, COMMUNITY_ATTACHMENT_MAX_COUNT } from "../shared/communityAttachmentPolicy";

export const LEGACY_ATTACHMENT_UPLOAD_PATH = "/runtime/community_attachment_legacy_upload";
const TTL = 30 * 60 * 1000;
async function requireOwner(ctx: any, ownerId: any, communityId: any) {
  await requireCommunityChatAccess({ ctx, communityId, userId: ownerId });
  await requireProfileSetupCompleteForUser(ctx, ownerId);
}

// Old clients POST bytes without auth headers. The URL is an expiring one-use
// capability issued only after authentication; raw storage URLs stay server-side.
export async function issueLegacyAttachmentTicket(ctx: any, ownerId: any, communityId: any) {
  await requireOwner(ctx, ownerId, communityId);
  const site = process.env.CONVEX_SITE_URL;
  if (!site) throw new Error("community_attachment_upload_unavailable");
  const pending = await ctx.db.query("communityInteractionAttachments")
    .withIndex("by_uploader_status", (q: any) => q.eq("createdByUserId", ownerId).eq("status", "pending")).take(16);
  if (pending.length >= 16) throw new Error("community_attachment_pending_limit");
  const now = Date.now(), token = crypto.randomUUID();
  const attachmentId = await ctx.db.insert("communityInteractionAttachments", {
    communityId, status: "pending", name: "attachment", attachmentKind: "file", sizeBytes: 0,
    createdByActorType: "human", createdByUserId: ownerId, createdAt: now, updatedAt: now,
    legacyUpload: true, legacyUploadToken: token, uploadMessageKey: `legacy:${token}`, uploadExpiresAt: now + TTL,
  });
  await ctx.scheduler.runAfter(TTL, (internal as any).communityAttachmentUploads.cleanupInternal, { attachmentId });
  const url = new URL(LEGACY_ATTACHMENT_UPLOAD_PATH, site);
  url.searchParams.set("attachmentId", attachmentId); url.searchParams.set("token", token);
  return { uploadUrl: url.toString() };
}

export const beginInternal = internalMutation({
  args: { attachmentId: v.id("communityInteractionAttachments"), token: v.string(), mime: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.attachmentId);
    if (!row?.legacyUpload || !row.legacyUploadToken || row.legacyUploadToken !== args.token ||
      row.status !== "pending" || row.storageId || (row.uploadExpiresAt ?? 0) <= Date.now()) {
      throw new Error("community_attachment_ticket_invalid");
    }
    await requireOwner(ctx, row.createdByUserId, row.communityId);
    await ctx.db.patch(row._id, { legacyUploadToken: undefined, mimeType: args.mime,
      attachmentKind: args.mime.startsWith("image/") ? "image" : args.mime.startsWith("video/") ? "video" : "file" });
    return { ownerId: row.createdByUserId!, uploadUrl: await ctx.storage.generateUploadUrl() };
  },
});

export const finishInternal = internalMutation({
  args: { attachmentId: v.id("communityInteractionAttachments"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.attachmentId);
    if (!row?.legacyUpload || row.legacyUploadToken || !row.mimeType || row.storageId ||
      row.status !== "pending" || row.rootId || row.replyId || (row.uploadExpiresAt ?? 0) <= Date.now()) {
      throw new Error("community_attachment_ticket_invalid");
    }
    await requireOwner(ctx, row.createdByUserId, row.communityId);
    const metadata = await ctx.db.system.get(args.storageId);
    if (!metadata || metadata.size <= 0 || metadata.size > communityAttachmentByteLimit(row.mimeType) || metadata.contentType !== row.mimeType) {
      throw new Error("community_attachment_metadata_invalid");
    }
    const claimed = await ctx.db.query("communityInteractionAttachments").withIndex("by_storage", q => q.eq("storageId", args.storageId)).first();
    if (claimed) throw new Error("community_attachment_storage_reused");
    await ctx.db.patch(row._id, { storageId: args.storageId, sizeBytes: metadata.size, contentHash: metadata.sha256, updatedAt: Date.now() });
  },
});

// Only server-recorded legacy uploads can become canonical claims. Client size,
// MIME, type and external URLs never establish ownership or content metadata.
export async function resolveLegacyComposerAttachments(ctx: any, args: {
  ownerId: any; communityId: any; channelId?: any; rootId?: any; messageKey: string; attachments: any[];
}): Promise<Array<{ attachmentId: any }>> {
  if (args.attachments.length > COMMUNITY_ATTACHMENT_MAX_COUNT) throw new Error("message_attachment_limit_exceeded");
  const out: Array<{ attachmentId: any }> = [];
  for (const input of args.attachments) {
    if (input.attachmentId) { out.push(input); continue; }
    const rows = input.storageId ? await ctx.db.query("communityInteractionAttachments")
      .withIndex("by_storage", (q: any) => q.eq("storageId", input.storageId)).take(2) : [];
    const row = rows.length === 1 ? rows[0] : null;
    if (!row?.legacyUpload || row.createdByUserId !== args.ownerId || row.communityId !== args.communityId) {
      throw new Error("Please reattach this file before sending. Its upload ownership could not be verified.");
    }
    if (!row.channelId) {
      if (row.status !== "pending" || row.rootId || row.replyId || (row.uploadExpiresAt ?? 0) <= Date.now()) throw new Error("community_attachment_upload_expired");
      const channel = await requireAttachmentUploadScope(ctx, { ...args, uploadRootId: args.rootId });
      await ctx.db.patch(row._id, { channelId: channel._id, uploadRootId: args.rootId ?? undefined,
        uploadMessageKey: args.messageKey.trim(), name: input.name.trim().slice(0, 256) || "attachment" });
    }
    out.push({ attachmentId: row._id });
  }
  return out;
}
