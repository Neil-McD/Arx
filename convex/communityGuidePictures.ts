// Pictures a person attached in their private talk with the guide, put on a
// post or reply the guide makes for them (shared/actionTools.ts, the guide's
// `pictures` input). The guide names pictures only by place, never by a file
// id: the only pictures it can reach are the ones this person attached in
// this talk, found here from the run it is in. A talk's pictures are kept as
// cloudThreadAttachments rows (convex/threads.ts), one per stored file.
//
// A post gets its own copy of each file, made only when it is posted, so
// deleting the talk's message (which deletes its files) never breaks the
// post, and deleting or purging the post never breaks the talk. Nothing is
// copied for a question the person answers no to.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { requireAttachmentUploadScope } from "./communityAttachmentUploads";
import { parseCommunityConversationIdentity } from "../shared/communityConversationIdentity";
import {
  COMMUNITY_ATTACHMENT_IMAGE_BYTES, COMMUNITY_ATTACHMENT_MAX_COUNT, detectCommunityAttachmentMime,
} from "../shared/communityAttachmentPolicy";
import { COMMUNITY_AGENT_MAX_IMAGE_BYTES, isAllowedCommunityAgentImageMime } from "../shared/communityAgentAttachments";
import { choosePictures } from "../shared/guideQuestions";

// How far back in the talk the latest message with pictures is looked for.
const MESSAGES_LOOKED_AT = 50;
// A staged copy not posted within this is removed (communityAttachmentUploads).
const STAGED_TTL_MS = 30 * 60 * 1000;

type Picture = { id: string; name: string; mime: string; size: number };
type Answer = { ok: true; pictures: Picture[] } | { ok: false; code: string; message: string };

const NOT_HERE = { ok: false as const, code: "pictures_not_found", message: "There are no pictures in this talk. Ask the person to attach them to a message here first." };
const NOT_PICTURE = { ok: false as const, code: "pictures_not_images", message: "Only pictures can go on a post, and one of those isn't a picture." };

function storageIdsOf(contentJson: any): string[] {
  const attachments = contentJson && typeof contentJson === "object" && Array.isArray(contentJson.attachments) ? contentJson.attachments : [];
  return attachments.map((row: any) => String(row?.storageId ?? row?.storage_id ?? "").trim()).filter(Boolean);
}

// A talk picture as a post may carry it: this person's, in a talk of this
// community, attached to one of their messages, and an image within the limits.
async function checkedPicture(ctx: any, row: any, userId: string, communityId: string): Promise<Picture | "missing" | "not_image"> {
  if (!row || String(row.ownerId) !== userId || row.status !== "attached" || !row.attachedMessageId) return "missing";
  const thread = await ctx.db.get(row.threadId);
  let scope: string | null = null;
  try { scope = thread ? parseCommunityConversationIdentity(thread)?.communityId ?? null : null; } catch { scope = null; }
  if (!thread || String(thread.ownerId) !== userId || scope !== communityId) return "missing";
  if (!isAllowedCommunityAgentImageMime(row.mime) || !(row.size > 0) ||
    row.size > Math.min(COMMUNITY_AGENT_MAX_IMAGE_BYTES, COMMUNITY_ATTACHMENT_IMAGE_BYTES)) return "not_image";
  return { id: String(row._id), name: String(row.name), mime: String(row.mime), size: Number(row.size) };
}

// The guide's selection, from the run it is in: the run is this person's, in
// a talk of this community; the pictures are those on their latest message
// in it that has pictures.
export const resolveTalkPicturesInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities"), runId: v.string(), selection: v.any() },
  handler: async (ctx, args): Promise<Answer> => {
    const run: any = await ctx.db.query("runtimeRuns")
      .withIndex("by_owner_runId", (q) => q.eq("ownerId", args.userId).eq("runId", args.runId)).first();
    const thread: any = run ? await ctx.db.get(run.threadId) : null;
    let scope: string | null = null;
    try { scope = thread ? parseCommunityConversationIdentity(thread)?.communityId ?? null : null; } catch { scope = null; }
    if (!thread || String(thread.ownerId) !== String(args.userId) || scope !== String(args.communityId) ||
      typeof thread.archivedAt === "number") return NOT_HERE;
    const recent = await ctx.db.query("cloudMessages")
      .withIndex("by_thread_seq", (q) => q.eq("threadId", thread._id)).order("desc").take(MESSAGES_LOOKED_AT);
    const message: any = recent.find((row: any) => row.role === "user" && String(row.ownerId) === String(args.userId) && storageIdsOf(row.contentJson).length > 0);
    const storageIds = message ? storageIdsOf(message.contentJson) : [];
    const chosen = choosePictures(args.selection, storageIds.length, COMMUNITY_ATTACHMENT_MAX_COUNT);
    if (!chosen.ok) return { ok: false, code: storageIds.length ? "invalid_tool_args" : NOT_HERE.code, message: chosen.message };
    const pictures: Picture[] = [];
    for (const place of chosen.positions) {
      const row = await ctx.db.query("cloudThreadAttachments")
        .withIndex("by_owner_thread_storage", (q) => q.eq("ownerId", args.userId).eq("threadId", thread._id).eq("storageId", storageIds[place - 1] as any))
        .unique();
      const picture = row && String(row.attachedMessageId) === String(message._id)
        ? await checkedPicture(ctx, row, String(args.userId), String(args.communityId)) : "missing";
      if (picture === "not_image") return NOT_PICTURE;
      if (picture === "missing") return NOT_HERE;
      pictures.push(picture);
    }
    return { ok: true, pictures };
  },
});

// The pictures a person said yes to, checked again: still theirs, still in
// a talk of this community, still images.
export const loadPicturesInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities"), pictureIds: v.array(v.string()) },
  handler: async (ctx, args): Promise<(Answer & { ok: false }) | { ok: true; pictures: Array<Picture & { storageId: string }> }> => {
    if (args.pictureIds.length === 0 || args.pictureIds.length > COMMUNITY_ATTACHMENT_MAX_COUNT ||
      new Set(args.pictureIds).size !== args.pictureIds.length) return NOT_HERE;
    const pictures: Array<Picture & { storageId: string }> = [];
    for (const raw of args.pictureIds) {
      const id = ctx.db.normalizeId("cloudThreadAttachments", raw);
      const row: any = id ? await ctx.db.get(id) : null;
      const picture = await checkedPicture(ctx, row, String(args.userId), String(args.communityId));
      if (picture === "not_image") return NOT_PICTURE;
      if (picture === "missing") {
        return { ok: false, code: "pictures_not_found", message: "A picture for this post is no longer in the talk, so nothing was posted." };
      }
      pictures.push({ ...picture, storageId: String(row.storageId) });
    }
    return { ok: true, pictures };
  },
});

// The post's own copies, as the uploads a person's own post would have made
// (communityInteractionAttachments, pending, for this one post's key), so the
// post claims them through the same attachment bridge and shows them the same.
export const stageRowsInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities"), channelId: v.optional(v.string()), rootId: v.optional(v.string()),
    messageKey: v.string(), pictures: v.array(v.object({ storageId: v.id("_storage"), name: v.string(), mime: v.string() })) },
  handler: async (ctx, args) => {
    const channelId = args.channelId ? ctx.db.normalizeId("communityChannels", args.channelId) : null;
    const uploadRootId = args.rootId ? ctx.db.normalizeId("communityInteractionRoots", args.rootId) : null;
    if ((args.channelId && !channelId) || (args.rootId && !uploadRootId)) throw new Error("community_attachment_scope_mismatch");
    // Who may attach here is the same rule as a person's own upload.
    const channel = await requireAttachmentUploadScope(ctx, { ownerId: args.userId, communityId: args.communityId,
      ...(channelId ? { channelId } : {}), ...(uploadRootId ? { uploadRootId } : {}) });
    const now = Date.now();
    const attachmentIds: string[] = [];
    for (const picture of args.pictures) {
      const metadata = await ctx.db.system.get(picture.storageId);
      // The bytes were checked as this image type when the copy was made.
      if (!metadata || metadata.size <= 0 || metadata.size > COMMUNITY_ATTACHMENT_IMAGE_BYTES ||
        (metadata.contentType && metadata.contentType !== picture.mime)) {
        throw new Error("community_attachment_metadata_invalid");
      }
      const attachmentId = await ctx.db.insert("communityInteractionAttachments", {
        communityId: args.communityId, channelId: channel._id, ...(uploadRootId ? { uploadRootId } : {}),
        uploadMessageKey: args.messageKey, uploadExpiresAt: now + STAGED_TTL_MS, status: "pending",
        name: picture.name.slice(0, 256) || "picture", mimeType: picture.mime, attachmentKind: "image",
        sizeBytes: metadata.size, storageId: picture.storageId, contentHash: metadata.sha256,
        createdByActorType: "human", createdByUserId: args.userId, createdAt: now, updatedAt: now,
      });
      await ctx.scheduler.runAfter(STAGED_TTL_MS, (internal as any).communityAttachmentUploads.cleanupInternal, { attachmentId });
      attachmentIds.push(String(attachmentId));
    }
    return attachmentIds;
  },
});

// Copies each picture's bytes into a file of the post's own, checking the
// bytes are the image they claim to be, then stages them for the post.
export const stagePicturesInternal = internalAction({
  args: { userId: v.id("users"), communityId: v.id("communities"), channelId: v.optional(v.string()), rootId: v.optional(v.string()),
    messageKey: v.string(), pictureIds: v.array(v.string()) },
  handler: async (ctx, args): Promise<{ ok: true; attachmentIds: string[] } | { ok: false; code: string; message: string }> => {
    const loaded: any = await ctx.runQuery((internal as any).communityGuidePictures.loadPicturesInternal,
      { userId: args.userId, communityId: args.communityId, pictureIds: args.pictureIds });
    if (!loaded.ok) return loaded;
    const copies: Array<{ storageId: any; name: string; mime: string }> = [];
    try {
      for (const picture of loaded.pictures as Array<Picture & { storageId: string }>) {
        const blob = await ctx.storage.get(picture.storageId as any);
        if (!blob) {
          for (const copy of copies) await ctx.storage.delete(copy.storageId);
          return { ok: false, code: "pictures_not_found", message: "A picture for this post is no longer in the talk, so nothing was posted." };
        }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let mime = "";
        try { mime = detectCommunityAttachmentMime(bytes.subarray(0, 64), picture.mime); } catch { mime = ""; }
        if (!isAllowedCommunityAgentImageMime(mime) || bytes.byteLength <= 0 || bytes.byteLength > COMMUNITY_ATTACHMENT_IMAGE_BYTES) {
          for (const copy of copies) await ctx.storage.delete(copy.storageId);
          return NOT_PICTURE;
        }
        copies.push({ storageId: await ctx.storage.store(new Blob([bytes], { type: mime })), name: picture.name, mime });
      }
      const attachmentIds: string[] = await ctx.runMutation((internal as any).communityGuidePictures.stageRowsInternal, {
        userId: args.userId, communityId: args.communityId, ...(args.channelId ? { channelId: args.channelId } : {}),
        ...(args.rootId ? { rootId: args.rootId } : {}), messageKey: args.messageKey, pictures: copies });
      return { ok: true, attachmentIds };
    } catch (error) {
      // Not staged: the copies belong to nothing, so they go now.
      for (const copy of copies) await ctx.storage.delete(copy.storageId).catch(() => undefined);
      throw error;
    }
  },
});

// A staged copy whose post was not made goes at once, with its file.
export const discardStagedInternal = internalMutation({
  args: { userId: v.id("users"), attachmentIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    for (const raw of args.attachmentIds) {
      const id = ctx.db.normalizeId("communityInteractionAttachments", raw);
      const row: any = id ? await ctx.db.get(id) : null;
      if (!row || String(row.createdByUserId) !== String(args.userId) || row.status !== "pending" || row.rootId || row.replyId) continue;
      if (row.storageId) await ctx.storage.delete(row.storageId);
      await ctx.db.delete(row._id);
    }
  },
});
