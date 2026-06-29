import {
  type CommunityChatMessageLike,
  type CommunityChatThreadLike,
  normalizeIdValue,
  resolvePublicUserId,
  toIsoString,
} from "./communityCore";
import { upsertArchiveDocumentForChatMessage } from "./communityArchiveDocuments";

export type CommunityInteractionLegacyChatLinkRow = {
  _id: any;
  communityId: any;
  threadId: any;
  messageId: any;
  targetMessageId?: any;
  linkKind: "root" | "reply";
  rootId?: any;
  replyId?: any;
  createdAt: number;
  updatedAt: number;
};

export function legacyChatIdempotencyKey(messageId: any, kind: "root" | "reply"): string {
  return `legacy_chat_message:${normalizeIdValue(messageId)}:${kind}`;
}

export async function ensureLegacyCompatibilityChatThread(
  ctx: any,
  communityId: any,
  nowMs: number,
): Promise<CommunityChatThreadLike> {
  const existing = (await ctx.db
    .query("communityChatThreads" as any)
    .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId))
    .order("asc")
    .first()) as CommunityChatThreadLike | null;
  if (existing) return existing;
  const threadId = await ctx.db.insert("communityChatThreads" as any, {
    communityId,
    lastSeq: 0,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  const thread = (await ctx.db.get(threadId as any)) as CommunityChatThreadLike | null;
  if (!thread) throw new Error("community_chat_thread_create_failed");
  return thread;
}

export async function mapLegacyCompatibilityMessageRow(
  ctx: any,
  row: CommunityChatMessageLike,
  userIdCache?: Map<string, string | null>,
) {
  return {
    id: String(row._id),
    thread_id: String(row.threadId),
    seq: Math.max(0, Math.floor(row.seq)),
    role: row.role,
    content_json: row.contentJson,
    sender_id: (await resolvePublicUserId(ctx, row.senderUserId, userIdCache)) ?? normalizeIdValue(row.senderUserId),
    reply_to_id: row.replyToMessageId ? String(row.replyToMessageId) : null,
    created_at: toIsoString(row.createdAt),
  };
}

export async function getLegacyChatLinkByMessage(
  ctx: any,
  messageId: any,
): Promise<CommunityInteractionLegacyChatLinkRow | null> {
  return (await ctx.db
    .query("communityInteractionLegacyChatLinks" as any)
    .withIndex("by_message", (q: any) => q.eq("messageId", messageId))
    .first()) as CommunityInteractionLegacyChatLinkRow | null;
}

export async function getLegacyChatLinkByRoot(
  ctx: any,
  rootId: any,
): Promise<CommunityInteractionLegacyChatLinkRow | null> {
  return (await ctx.db
    .query("communityInteractionLegacyChatLinks" as any)
    .withIndex("by_root", (q: any) => q.eq("rootId", rootId))
    .first()) as CommunityInteractionLegacyChatLinkRow | null;
}

export async function getLegacyChatLinkByReply(
  ctx: any,
  replyId: any,
): Promise<CommunityInteractionLegacyChatLinkRow | null> {
  return (await ctx.db
    .query("communityInteractionLegacyChatLinks" as any)
    .withIndex("by_reply", (q: any) => q.eq("replyId", replyId))
    .first()) as CommunityInteractionLegacyChatLinkRow | null;
}

export async function getLinkedLegacyCompatibilityMessage(
  ctx: any,
  link: CommunityInteractionLegacyChatLinkRow | null,
): Promise<CommunityChatMessageLike | null> {
  if (!link?.messageId) return null;
  return (await ctx.db.get(link.messageId as any)) as CommunityChatMessageLike | null;
}

export async function insertLegacyChatLinkIfMissing(args: {
  ctx: any;
  communityId: any;
  threadId: any;
  messageId: any;
  targetMessageId?: any;
  linkKind: "root" | "reply";
  rootId?: any;
  replyId?: any;
  nowMs: number;
}): Promise<CommunityInteractionLegacyChatLinkRow> {
  const existing = await getLegacyChatLinkByMessage(args.ctx, args.messageId);
  if (existing) {
    if (
      existing.linkKind !== args.linkKind ||
      (args.rootId && normalizeIdValue(existing.rootId) !== normalizeIdValue(args.rootId)) ||
      (args.replyId && normalizeIdValue(existing.replyId) !== normalizeIdValue(args.replyId)) ||
      (args.targetMessageId && normalizeIdValue(existing.targetMessageId) !== normalizeIdValue(args.targetMessageId))
    ) {
      throw new Error("legacy_chat_interaction_link_conflict");
    }
    return existing;
  }
  const linkId = await args.ctx.db.insert("communityInteractionLegacyChatLinks" as any, {
    communityId: args.communityId,
    threadId: args.threadId,
    messageId: args.messageId,
    ...(args.targetMessageId ? { targetMessageId: args.targetMessageId } : {}),
    linkKind: args.linkKind,
    ...(args.rootId ? { rootId: args.rootId } : {}),
    ...(args.replyId ? { replyId: args.replyId } : {}),
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const created = (await args.ctx.db.get(linkId as any)) as CommunityInteractionLegacyChatLinkRow | null;
  if (!created) throw new Error("legacy_chat_interaction_link_create_failed");
  return created;
}

export async function createLegacyCompatibilityChatMessageForInteraction(args: {
  ctx: any;
  thread: CommunityChatThreadLike;
  actorUserId: any;
  text: string;
  attachments?: Array<Record<string, unknown>>;
  replyToMessageId?: any;
  nowMs: number;
}): Promise<CommunityChatMessageLike> {
  let replyToMessageId: any | undefined;
  if (args.replyToMessageId) {
    const target = (await args.ctx.db.get(args.replyToMessageId as any)) as CommunityChatMessageLike | null;
    if (!target || normalizeIdValue(target.threadId) !== normalizeIdValue(args.thread._id)) {
      throw new Error("interaction_legacy_reply_target_invalid");
    }
    replyToMessageId = target._id;
  }
  const seq = Math.max(0, Math.floor(args.thread.lastSeq ?? 0)) + 1;
  const messageId = await args.ctx.db.insert("communityChatMessages" as any, {
    threadId: args.thread._id,
    seq,
    role: "user",
    contentJson: args.attachments && args.attachments.length > 0
      ? { text: args.text, attachments: args.attachments }
      : { text: args.text },
    senderUserId: args.actorUserId,
    ...(replyToMessageId ? { replyToMessageId } : {}),
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  await args.ctx.db.patch(args.thread._id as any, {
    lastSeq: seq,
    updatedAt: args.nowMs,
  });
  const row = (await args.ctx.db.get(messageId as any)) as CommunityChatMessageLike | null;
  if (!row) throw new Error("interaction_legacy_message_create_failed");
  await upsertArchiveDocumentForChatMessage(args.ctx, {
    thread: args.thread,
    message: row,
  });
  return row;
}
