import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { resolveUserProfileDisplayProjectionForUser } from "./userProfileProjection";
import { stripChatInlineMarkdown } from "../shared/chatInlineMarkdown";

const DM_EMAIL_SNIPPET_MAX_CHARS = 120;
const DM_EMAIL_DEDUPE_WINDOW_MS = 4 * 60 * 60 * 1000;
const MAX_DM_EMAIL_PRESENCE_ROWS = 8;

function normalizeIdValue(raw: unknown): string {
  return String(raw ?? "").trim();
}

function readMessageSnippet(contentJson: unknown): string {
  const rawText =
    typeof contentJson === "string"
      ? contentJson
      : contentJson && typeof contentJson === "object" && !Array.isArray(contentJson)
        ? (contentJson as Record<string, unknown>).text
        : null;
  const normalized = stripChatInlineMarkdown(rawText).replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= DM_EMAIL_SNIPPET_MAX_CHARS) return normalized;
  return `${normalized.slice(0, DM_EMAIL_SNIPPET_MAX_CHARS - 3).trimEnd()}...`;
}

// Read-only suppression stack + payload build; the action enqueues on pass.
export const evaluateDirectMessageEmailInternal = internalQuery({
  args: {
    conversationId: v.id("dmConversations"),
    messageSeq: v.number(),
    recipientUserId: v.id("users"),
    senderUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const participant = (await ctx.db
      .query("dmParticipants" as any)
      .withIndex("by_conversation_user", (q: any) =>
        q.eq("conversationId", args.conversationId).eq("userId", args.recipientUserId),
      )
      .first()) as Record<string, any> | null;
    if (!participant || participant.status !== "active") {
      return { shouldSend: false as const, skipped: "participant" };
    }
    if (Math.max(0, Math.floor(Number(participant.lastReadSeq ?? 0))) >= args.messageSeq) {
      return { shouldSend: false as const, skipped: "read" };
    }
    if (participant.mutedAt) {
      return { shouldSend: false as const, skipped: "muted" };
    }

    const preferences = (await ctx.db
      .query("emailPreferences" as any)
      .withIndex("by_user", (q: any) => q.eq("userId", args.recipientUserId))
      .first()) as Record<string, any> | null;
    if (preferences?.dmEmailsEnabled === false) {
      return { shouldSend: false as const, skipped: "preference" };
    }

    const message = (await ctx.db
      .query("dmMessages" as any)
      .withIndex("by_conversation_seq", (q: any) =>
        q.eq("conversationId", args.conversationId).eq("seq", args.messageSeq),
      )
      .first()) as Record<string, any> | null;
    if (!message) {
      return { shouldSend: false as const, skipped: "message_missing" };
    }

    const presenceRows = (await ctx.db
      .query("communityPresence" as any)
      .withIndex("by_user", (q: any) => q.eq("userId", args.recipientUserId))
      .take(MAX_DM_EMAIL_PRESENCE_ROWS)) as Array<Record<string, any>>;
    for (const row of presenceRows) {
      const lastSeenAt = Number(row.lastSeenAt ?? 0);
      if (Number.isFinite(lastSeenAt) && lastSeenAt >= Number(message.createdAt ?? 0)) {
        return { shouldSend: false as const, skipped: "present" };
      }
    }

    const sender = args.senderUserId ? await ctx.db.get(args.senderUserId) : null;
    const senderProfile = sender
      ? await resolveUserProfileDisplayProjectionForUser(ctx, sender)
      : null;
    const senderName =
      String(senderProfile?.display_name ?? (sender as any)?.displayName ?? "").trim() ||
      "Someone";
    const conversation = (await ctx.db.get(args.conversationId)) as Record<string, any> | null;
    const community = conversation?.createdFromCommunityId
      ? ((await ctx.db.get(conversation.createdFromCommunityId)) as Record<string, any> | null)
      : null;

    const dedupeBucket = Math.floor(Date.now() / DM_EMAIL_DEDUPE_WINDOW_MS);
    return {
      shouldSend: true as const,
      dedupeKey: `dm:${normalizeIdValue(args.conversationId)}:${normalizeIdValue(args.recipientUserId)}:${dedupeBucket}`,
      payload: {
        senderName,
        communityName: String(community?.name ?? "").trim() || null,
        snippet: readMessageSnippet(message.contentJson),
        actionUrl: `https://www.polynet.ai/?dm=${normalizeIdValue(args.conversationId)}`,
      },
    };
  },
});

type DirectMessageEmailEvaluation = {
  shouldSend: boolean;
  skipped?: string;
  dedupeKey?: string;
  payload?: Record<string, unknown>;
};

export const maybeNotifyRecipientInternal = internalAction({
  args: {
    conversationId: v.id("dmConversations"),
    messageSeq: v.number(),
    recipientUserId: v.id("users"),
    senderUserId: v.id("users"),
  },
  handler: async (ctx, args): Promise<{ sent: boolean; skipped?: string; deduped?: boolean }> => {
    const evaluation = (await ctx.runQuery(
      (internal as any).directMessageEmails.evaluateDirectMessageEmailInternal,
      args,
    )) as DirectMessageEmailEvaluation | null;
    if (!evaluation?.shouldSend) {
      return { sent: false, skipped: evaluation?.skipped ?? "unknown" };
    }
    const result = (await ctx.runMutation((internal as any).email.enqueueEmailJobInternal, {
      kind: "dm_message_notification",
      recipientUserId: args.recipientUserId,
      templateKey: "dm_message_notification",
      payload: evaluation.payload,
      dedupeKey: evaluation.dedupeKey,
    })) as { deduped?: boolean } | null;
    return { sent: true, deduped: Boolean(result?.deduped) };
  },
});
