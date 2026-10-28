import { issueLegacyAttachmentTicket } from "./communityLegacyAttachmentUploads";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityChatMessageLike,
  type CommunityChatThreadLike,
  type CommunityMessageReactionLike,
  requireCommunityChatAccess,
  requireCommunityModerator,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import {
  clearCommunityTypingLease,
  renewCommunityTypingLease,
  resolveCommunityTypingPresence,
} from "./communityTypingPresenceCore";
import {
  recordLegacyChatMessageInteractionBestEffort,
  syncLegacyChatMessageDeleteToInteractionCore,
  syncLegacyChatMessageEditToInteractionCore,
} from "./communityInteractions";
import { requireProfileSetupCompleteForUser } from "./accountSetupCore";

type StoredCommunityChatAttachment = {
  id: string;
  name: string;
  type: "image" | "file";
  mime: string | null;
  size: number;
  storageId?: string | null;
  dataUrl?: string | null;
  text?: string | null;
  truncated?: boolean | null;
};

const MAX_REACTION_MESSAGE_IDS_PER_REQUEST = 100;
const MAX_REACTIONS_PER_MESSAGE = 100;
const MAX_REACTION_DELETE_ROWS = 500;
const MAX_STORED_CHAT_ATTACHMENTS = 8;
const MAX_STORED_CHAT_IMAGE_DATA_URL_CHARS = 600_000;
const MAX_STORED_CHAT_ATTACHMENT_TEXT_CHARS = 20_000;
const MAX_STORED_CHAT_ATTACHMENT_NAME_CHARS = 256;
const MAX_STORED_CHAT_ATTACHMENT_MIME_CHARS = 160;

async function getCanonicalCommunityChatThread(
  ctx: any,
  communityId: any,
): Promise<CommunityChatThreadLike | null> {
  return (await ctx.db
    .query("communityChatThreads")
    .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId))
    .order("asc")
    .first()) as CommunityChatThreadLike | null;
}

function createAttachmentId(): string {
  return `attachment-${Math.random().toString(36).slice(2, 10)}`;
}

async function maybeResolveStorageUrl(ctx: any, storageId: unknown): Promise<string | null> {
  const resolvedStorageId = String(storageId ?? "").trim();
  if (!resolvedStorageId) return null;
  const resolved = await ctx.storage.getUrl(resolvedStorageId as any);
  return typeof resolved === "string" && resolved.trim() ? resolved.trim() : null;
}

function normalizeStoredChatAttachment(
  raw: unknown,
  options: { enforceWritePolicy?: boolean } = {},
): StoredCommunityChatAttachment | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : createAttachmentId();
  const name = typeof record.name === "string" && record.name.trim() ? record.name.trim().slice(0, MAX_STORED_CHAT_ATTACHMENT_NAME_CHARS) : "attachment";
  const type = record.type === "image" ? "image" : "file";
  const mime = typeof record.mime === "string" && record.mime.trim() ? record.mime.trim().slice(0, MAX_STORED_CHAT_ATTACHMENT_MIME_CHARS) : null;
  const sizeRaw = Number(record.size);
  const size = Number.isFinite(sizeRaw) ? Math.max(0, Math.floor(sizeRaw)) : 0;
  const storageIdRaw =
    typeof record.storageId === "string"
      ? record.storageId
      : typeof record.storage_id === "string"
        ? record.storage_id
        : "";
  const storageId = storageIdRaw.trim() ? storageIdRaw.trim() : null;
  let dataUrl: string | null = null;
  if (typeof record.data_url === "string") {
    const normalizedDataUrl = record.data_url.trim();
    if (normalizedDataUrl.startsWith("data:image/")) {
      if (normalizedDataUrl.length > MAX_STORED_CHAT_IMAGE_DATA_URL_CHARS) {
        if (options.enforceWritePolicy) {
          throw new Error("message_attachment_payload_too_large");
        }
      } else {
        dataUrl = normalizedDataUrl;
      }
    }
  }
  const text = typeof record.text === "string" && record.text.trim() ? record.text.slice(0, MAX_STORED_CHAT_ATTACHMENT_TEXT_CHARS) : null;
  const truncated = typeof record.truncated === "boolean" ? record.truncated : null;
  if (!storageId && !dataUrl) return null;
  return {
    id,
    name,
    type,
    mime,
    size,
    ...(storageId ? { storageId } : null),
    ...(dataUrl ? { dataUrl } : null),
    ...(text ? { text } : null),
    ...(truncated !== null ? { truncated } : null),
  };
}

function normalizeStoredChatAttachments(
  raw: unknown,
  options: { enforceWritePolicy?: boolean } = {},
): StoredCommunityChatAttachment[] {
  if (!Array.isArray(raw)) return [];
  if (options.enforceWritePolicy && raw.length > MAX_STORED_CHAT_ATTACHMENTS) {
    throw new Error("message_attachment_limit_exceeded");
  }
  const out: StoredCommunityChatAttachment[] = [];
  for (const item of raw) {
    if (out.length >= MAX_STORED_CHAT_ATTACHMENTS) break;
    const normalized = normalizeStoredChatAttachment(item, options);
    if (normalized) out.push(normalized);
  }
  return out;
}

async function mapMessageContentJsonForRead(ctx: any, contentJson: unknown): Promise<unknown> {
  if (!contentJson || typeof contentJson !== "object" || Array.isArray(contentJson)) {
    return contentJson;
  }
  const record = contentJson as Record<string, unknown>;
  const attachments = normalizeStoredChatAttachments(record.attachments);
  if (attachments.length === 0) {
    return Array.isArray(record.attachments)
      ? { ...record, attachments: [] }
      : contentJson;
  }
  const resolvedAttachments = await Promise.all(
    attachments.map(async (attachment) => ({
      id: attachment.id,
      name: attachment.name,
      type: attachment.type,
      mime: attachment.mime,
      size: attachment.size,
      ...(attachment.storageId ? { storage_id: attachment.storageId } : null),
      ...(attachment.storageId ? { url: await maybeResolveStorageUrl(ctx, attachment.storageId) } : null),
      ...(attachment.dataUrl ? { data_url: attachment.dataUrl } : null),
      ...(attachment.text ? { text: attachment.text } : null),
      ...(attachment.truncated !== null && typeof attachment.truncated !== "undefined"
        ? { truncated: attachment.truncated }
        : null),
    })),
  );
  return {
    ...record,
    attachments: resolvedAttachments,
  };
}

function normalizeEmoji(raw: unknown): string {
  const emoji = String(raw ?? "").trim();
  if (!emoji) throw new Error("emoji_required");
  return emoji.slice(0, 32);
}

async function mapCommunityChatMessageRow(
  ctx: any,
  row: CommunityChatMessageLike,
  userIdCache?: Map<string, string | null>,
) {
  return {
    id: String(row._id),
    thread_id: String(row.threadId),
    seq: Math.max(0, Math.floor(row.seq)),
    role: row.role,
    content_json: await mapMessageContentJsonForRead(ctx, row.contentJson),
    sender_id: await resolvePublicUserId(ctx, row.senderUserId, userIdCache),
    reply_to_id: row.replyToMessageId ? String(row.replyToMessageId) : null,
    created_at: toIsoString(row.createdAt),
  };
}

async function mapCommunityMessageReactionRow(
  ctx: any,
  row: CommunityMessageReactionLike,
  userIdCache?: Map<string, string | null>,
) {
  return {
    id: String(row._id),
    message_id: String(row.messageId),
    user_id: (await resolvePublicUserId(ctx, row.userId, userIdCache)) ?? String(row.userId),
    emoji: row.emoji,
    created_at: toIsoString(row.createdAt),
  };
}

export function extractMessageText(contentJson: unknown): string {
  if (typeof contentJson === "string") return contentJson.trim();
  if (contentJson && typeof contentJson === "object" && !Array.isArray(contentJson)) {
    const text = String((contentJson as Record<string, unknown>).text ?? "").trim();
    if (text) return text;
  }
  return "";
}

export const ensureCommunityChatThread = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = Date.now();
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const existing = await getCanonicalCommunityChatThread(ctx, args.communityId);
    if (existing) {
      return { thread_id: String(existing._id) };
    }

    const threadId = await ctx.db.insert("communityChatThreads" as any, {
      communityId: args.communityId,
      lastSeq: 0,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { thread_id: String(threadId) };
  },
});

export const listThreadMessages = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadId: v.id("communityChatThreads"),
    beforeSeq: v.optional(v.union(v.number(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const thread = (await ctx.db.get(args.threadId)) as CommunityChatThreadLike | null;
    if (!thread) return [];
    await requireCommunityChatAccess({
      ctx,
      communityId: thread.communityId,
      userId: args.userId,
    });

    const safeLimit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 100)));
    const beforeSeq =
      typeof args.beforeSeq === "number" && Number.isFinite(args.beforeSeq)
        ? Math.max(0, Math.floor(args.beforeSeq))
        : null;
    const rows = (await ctx.db
      .query("communityChatMessages" as any)
      .withIndex("by_thread_seq", (q: any) =>
        beforeSeq === null ? q.eq("threadId", args.threadId) : q.eq("threadId", args.threadId).lt("seq", beforeSeq),
      )
      .order("desc")
      .take(safeLimit)) as CommunityChatMessageLike[];
    const userIdCache = new Map<string, string | null>();
    return await Promise.all(rows.map((row) => mapCommunityChatMessageRow(ctx, row, userIdCache)));
  },
});

export const setCommunityTyping = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.optional(v.id("communityChannels")),
    rootId: v.optional(v.id("communityInteractionRoots")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });

    const lease = await renewCommunityTypingLease({
      ctx,
      communityId: args.communityId,
      channelId: args.channelId,
      userId: args.userId,
      rootId: args.rootId,
    });
    return { ok: true, display_until_ms: lease.displayUntil };
  },
});

export const clearCommunityTyping = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.optional(v.id("communityChannels")),
    rootId: v.optional(v.id("communityInteractionRoots")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const result = await clearCommunityTypingLease({
      ctx,
      communityId: args.communityId,
      channelId: args.channelId,
      userId,
      rootId: args.rootId,
    });
    return { ok: true, cleared: result.cleared };
  },
});

export const listCommunityTyping = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    channelId: v.optional(v.id("communityChannels")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const { community } = await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const presence = await resolveCommunityTypingPresence({
      ctx,
      community,
      channelId: args.channelId,
      viewerUserId: args.userId,
    });
    return {
      users: presence.users,
      total_count: presence.totalCount,
      total_count_capped: presence.totalCountCapped,
    };
  },
});

export const createThreadUserMessage = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    threadId: v.id("communityChatThreads"),
    text: v.string(),
    attachments: v.optional(v.array(v.any())),
    replyToId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = Date.now();
    const thread = (await ctx.db.get(args.threadId)) as CommunityChatThreadLike | null;
    if (!thread) throw new Error("thread_not_found");
    await requireCommunityChatAccess({
      ctx,
      communityId: thread.communityId,
      userId: args.userId,
    });
    await requireProfileSetupCompleteForUser(ctx, userId);

    const seq = Math.max(0, Math.floor(thread.lastSeq ?? 0) + 1);
    const text = String(args.text ?? "").trim();
    if ((args.attachments?.length ?? 0) > 0) throw new Error("community_attachment_use_canonical_composer");
    const attachments = normalizeStoredChatAttachments(args.attachments, { enforceWritePolicy: true });
    if (!text && attachments.length === 0) throw new Error("message_payload_required");

    let replyToMessageId: any | undefined = undefined;
    const replyToRaw = String(args.replyToId ?? "").trim();
    if (replyToRaw) {
      const reply = (await ctx.db.get(replyToRaw as any)) as CommunityChatMessageLike | null;
      if (reply && reply.threadId === thread._id) {
        replyToMessageId = reply._id;
      }
    }

    const contentJson = attachments.length > 0 ? { text, attachments } : { text };

    const messageId = await ctx.db.insert("communityChatMessages" as any, {
      threadId: thread._id,
      seq,
      role: "user",
      contentJson,
      senderUserId: args.userId,
      ...(replyToMessageId ? { replyToMessageId } : null),
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.patch(thread._id as any, {
      lastSeq: seq,
      updatedAt: nowMs,
    });
    const row = (await ctx.db.get(messageId as any)) as CommunityChatMessageLike | null;
    if (!row) throw new Error("message_create_failed");
    await recordLegacyChatMessageInteractionBestEffort({
      ctx,
      thread,
      message: row,
      nowMs,
    });
    return await mapCommunityChatMessageRow(ctx, row);
  },
});

export const patchOwnMessageContent = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    messageId: v.string(),
    contentJson: v.any(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = Date.now();
    const message = (await ctx.db.get(args.messageId as any)) as CommunityChatMessageLike | null;
    if (!message) throw new Error("message_not_found");
    const thread = (await ctx.db.get(message.threadId)) as CommunityChatThreadLike | null;
    if (!thread) throw new Error("thread_not_found");
    await requireCommunityChatAccess({
      ctx,
      communityId: thread.communityId,
      userId: args.userId,
    });
    const isOwnMessage = Boolean(message.senderUserId) && String(message.senderUserId) === String(args.userId);
    if (!isOwnMessage) {
      await requireCommunityModerator({
        ctx,
        communityId: thread.communityId,
        userId: args.userId,
      });
    }
    const nextText = extractMessageText(args.contentJson);
    const nextAttachments =
      args.contentJson && typeof args.contentJson === "object" && !Array.isArray(args.contentJson)
        ? normalizeStoredChatAttachments((args.contentJson as Record<string, unknown>).attachments, { enforceWritePolicy: true })
        : [];
    const storedAttachments = normalizeStoredChatAttachments(
      message.contentJson && typeof message.contentJson === "object"
        ? (message.contentJson as Record<string, unknown>).attachments : [],
    );
    if (nextAttachments.some(next => !storedAttachments.some(stored => JSON.stringify(stored) === JSON.stringify(next)))) {
      throw new Error("community_attachment_legacy_edit_cannot_add");
    }
    if (!nextText && nextAttachments.length === 0) {
      throw new Error("message_payload_required");
    }
    await syncLegacyChatMessageEditToInteractionCore({
      ctx,
      communityId: thread.communityId,
      messageId: message._id,
      text: nextText,
      attachments: nextAttachments,
      actorUserId: userId,
      nowMs,
    });
    await ctx.db.patch(message._id as any, {
      contentJson: nextAttachments.length > 0 ? { text: nextText, attachments: nextAttachments } : { text: nextText },
      updatedAt: nowMs,
    });
    return { ok: true };
  },
});

export const deleteOwnMessage = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    messageId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = Date.now();
    const message = (await ctx.db.get(args.messageId as any)) as CommunityChatMessageLike | null;
    if (!message) return { ok: true, deleted: false };
    const thread = (await ctx.db.get(message.threadId)) as CommunityChatThreadLike | null;
    if (!thread) return { ok: true, deleted: false };
    await requireCommunityChatAccess({
      ctx,
      communityId: thread.communityId,
      userId: args.userId,
    });
    const isOwnMessage = Boolean(message.senderUserId) && String(message.senderUserId) === String(args.userId);
    if (!isOwnMessage) {
      await requireCommunityModerator({
        ctx,
        communityId: thread.communityId,
        userId: args.userId,
      });
    }

    const reactions = (await ctx.db
      .query("communityMessageReactions" as any)
      .withIndex("by_message", (q: any) => q.eq("messageId", message._id))
      .take(MAX_REACTION_DELETE_ROWS + 1)) as CommunityMessageReactionLike[];
    if (reactions.length > MAX_REACTION_DELETE_ROWS) {
      throw new Error("message_reaction_delete_limit_exceeded");
    }
    for (const reaction of reactions) {
      await ctx.db.delete(reaction._id as any);
    }
    await syncLegacyChatMessageDeleteToInteractionCore({
      ctx,
      communityId: thread.communityId,
      messageId: message._id,
      actorUserId: userId,
      nowMs,
    });
    await ctx.db.delete(message._id as any);
    await ctx.db.patch(thread._id as any, {
      updatedAt: nowMs,
    });

    return { ok: true, deleted: true };
  },
});

export const createMessageReaction = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    messageId: v.string(),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = Date.now();
    const emoji = normalizeEmoji(args.emoji);
    const message = (await ctx.db.get(args.messageId as any)) as CommunityChatMessageLike | null;
    if (!message) throw new Error("message_not_found");
    const thread = (await ctx.db.get(message.threadId)) as CommunityChatThreadLike | null;
    if (!thread) throw new Error("thread_not_found");
    await requireCommunityChatAccess({
      ctx,
      communityId: thread.communityId,
      userId: args.userId,
    });

    const existing = (await ctx.db
      .query("communityMessageReactions" as any)
      .withIndex("by_message_user_emoji", (q: any) =>
        q.eq("messageId", message._id).eq("userId", args.userId).eq("emoji", emoji),
      )
      .first()) as CommunityMessageReactionLike | null;
    if (existing) return await mapCommunityMessageReactionRow(ctx, existing);

    const reactionId = await ctx.db.insert("communityMessageReactions" as any, {
      messageId: message._id,
      userId: args.userId,
      emoji,
      createdAt: nowMs,
    });
    const created = (await ctx.db.get(reactionId as any)) as CommunityMessageReactionLike | null;
    if (!created) throw new Error("reaction_create_failed");
    return await mapCommunityMessageReactionRow(ctx, created);
  },
});

export const deleteMessageReactionById = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    reactionId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const reaction = (await ctx.db.get(args.reactionId as any)) as CommunityMessageReactionLike | null;
    if (!reaction) return { ok: true, deleted: false };
    if (String(reaction.userId) !== String(args.userId)) throw new Error("reaction_forbidden");
    await ctx.db.delete(reaction._id as any);
    return { ok: true, deleted: true };
  },
});

export const listMessageReactions = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    messageIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const uniqueIds = Array.from(
      new Set(
        args.messageIds
          .map((value) => String(value ?? "").trim())
          .filter((value) => value.length > 0),
      ),
    ).slice(0, MAX_REACTION_MESSAGE_IDS_PER_REQUEST);
    if (uniqueIds.length === 0) return [];

    const out: CommunityMessageReactionLike[] = [];
    const verifiedThreadIds = new Set<string>();
    for (const messageId of uniqueIds) {
      const message = (await ctx.db.get(messageId as any)) as CommunityChatMessageLike | null;
      if (!message) continue;
      const threadId = String(message.threadId);
      if (!verifiedThreadIds.has(threadId)) {
        const thread = (await ctx.db.get(message.threadId)) as CommunityChatThreadLike | null;
        if (!thread) continue;
        await requireCommunityChatAccess({
          ctx,
          communityId: thread.communityId,
          userId: args.userId,
        });
        verifiedThreadIds.add(threadId);
      }
      const rows = (await ctx.db
        .query("communityMessageReactions" as any)
        .withIndex("by_message", (q: any) => q.eq("messageId", message._id))
        .take(MAX_REACTIONS_PER_MESSAGE)) as CommunityMessageReactionLike[];
      out.push(...rows);
    }
    const userIdCache = new Map<string, string | null>();
    return await Promise.all(out.map((row) => mapCommunityMessageReactionRow(ctx, row, userIdCache)));
  },
});

export const generateCommunityChatAttachmentUploadUrl = mutation({
  args: { userId: v.optional(v.id("users")), authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    return issueLegacyAttachmentTicket(ctx, userId, args.communityId);
  },
});
