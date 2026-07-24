import {
  normalizeIdValue,
} from "./communityCore";

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

export async function getLegacyChatLinkByMessage(
  ctx: any,
  messageId: any,
): Promise<CommunityInteractionLegacyChatLinkRow | null> {
  return (await ctx.db
    .query("communityInteractionLegacyChatLinks" as any)
    .withIndex("by_message", (q: any) => q.eq("messageId", messageId))
    .first()) as CommunityInteractionLegacyChatLinkRow | null;
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
