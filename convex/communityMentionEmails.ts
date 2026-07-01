import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { normalizeIdValue } from "./communityCore";

// M2b: the mention email ping. In-app attention (the accent dot) is the
// primary signal; email is the fallback for people who are not around. A
// grace window gives the dot a chance first — mentions still "pending" after
// it are emailed, preference-gated, and their ledger rows advance to "sent"
// (or "suppressed" when the recipient has mention emails off).

const MENTION_EMAIL_GRACE_MS = 15 * 60 * 1000;
const MENTION_EMAIL_BATCH_LIMIT = 25;
const MENTION_EMAIL_SNIPPET_MAX_CHARS = 140;

const internalRefs = internal as any;

const PUBLIC_APP_URL_ENV_KEYS = ["ARX_PUBLIC_APP_URL", "PUBLIC_APP_URL", "VITE_PUBLIC_APP_URL", "VITE_APP_URL"] as const;

// Same resolution as the digest emails; empty string (no CTA button) when the
// public URL is not configured, rather than failing the whole ping run.
function buildAppActionUrl(path: string): string {
  for (const key of PUBLIC_APP_URL_ENV_KEYS) {
    try {
      const value = String((globalThis as any)?.process?.env?.[key] ?? "").trim().replace(/\/+$/, "");
      if (value && /^https?:\/\//i.test(value)) return new URL(path, `${value}/`).toString();
    } catch {
      // ignore
    }
  }
  return "";
}

function boundedText(raw: unknown, maxLength: number): string {
  return String(raw ?? "").trim().slice(0, maxLength);
}

async function readFirstMarkdownBlockText(
  ctx: any,
  target: { rootId?: any; replyId?: any },
): Promise<string> {
  const rows = target.replyId
    ? await ctx.db
        .query("communityInteractionContentBlocks" as any)
        .withIndex("by_reply_order", (q: any) => q.eq("replyId", target.replyId))
        .take(5)
    : target.rootId
      ? await ctx.db
          .query("communityInteractionContentBlocks" as any)
          .withIndex("by_root_order", (q: any) => q.eq("rootId", target.rootId))
          .take(5)
      : [];
  for (const row of rows as Array<Record<string, any>>) {
    if (row.blockType === "markdown_text" && String(row.text ?? "").trim()) {
      return boundedText(row.text, MENTION_EMAIL_SNIPPET_MAX_CHARS);
    }
  }
  return "";
}

export const listPendingMentionEmailJobsInternal = internalQuery({
  args: {
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const dueBefore = nowMs - MENTION_EMAIL_GRACE_MS;
    const pending = (await ctx.db
      .query("communityInteractionMentions" as any)
      .withIndex("by_notifyState_createdAt", (q: any) => q.eq("notifyState", "pending"))
      .take(100)) as Array<Record<string, any>>;
    const jobs: Array<{
      mentionId: string;
      recipientUserId: string;
      suppressed: boolean;
      communityName: string;
      mentionerName: string;
      snippet: string;
      urlPath: string;
    }> = [];
    for (const mention of pending) {
      if (jobs.length >= MENTION_EMAIL_BATCH_LIMIT) break;
      if (mention.mentionKind !== "user" || !mention.mentionedUserId) continue;
      if (Number(mention.createdAt ?? 0) > dueBefore) continue;
      const source = mention.replyId
        ? ((await ctx.db.get(mention.replyId)) as Record<string, any> | null)
        : mention.rootId
          ? ((await ctx.db.get(mention.rootId)) as Record<string, any> | null)
          : null;
      if (!source || source.status !== "live") continue;
      const authorUserId = source.actorUserId ?? null;
      // Never ping someone about their own message.
      if (authorUserId && normalizeIdValue(authorUserId) === normalizeIdValue(mention.mentionedUserId)) continue;
      const community = (await ctx.db.get(mention.communityId)) as Record<string, any> | null;
      if (!community) continue;
      const author = authorUserId
        ? ((await ctx.db.get(authorUserId)) as Record<string, any> | null)
        : null;
      const preferences = (await ctx.db
        .query("emailPreferences" as any)
        .withIndex("by_user", (q: any) => q.eq("userId", mention.mentionedUserId))
        .first()) as Record<string, any> | null;
      const snippet = await readFirstMarkdownBlockText(ctx, {
        rootId: mention.rootId,
        replyId: mention.replyId,
      });
      const slug = boundedText(community.slug, 200);
      jobs.push({
        mentionId: normalizeIdValue(mention._id),
        recipientUserId: normalizeIdValue(mention.mentionedUserId),
        suppressed: preferences?.mentionEmailsEnabled === false,
        communityName: boundedText(community.name, 200) || "your community",
        mentionerName: boundedText(author?.name, 120) || "A community member",
        snippet,
        urlPath: slug ? `/c/${encodeURIComponent(slug)}/chat` : "/",
      });
    }
    return jobs;
  },
});

export const markMentionNotifyStatesInternal = internalMutation({
  args: {
    updates: v.array(
      v.object({
        mentionId: v.id("communityInteractionMentions"),
        notifyState: v.union(v.literal("sent"), v.literal("suppressed")),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    for (const update of args.updates) {
      const row = (await ctx.db.get(update.mentionId)) as Record<string, any> | null;
      // Only pending rows advance here; a mention read in-app stays "read".
      if (!row || row.notifyState !== "pending") continue;
      await ctx.db.patch(update.mentionId, { notifyState: update.notifyState, updatedAt: nowMs });
    }
    return { ok: true };
  },
});

export const processPendingMentionEmailsInternal = internalAction({
  args: {},
  handler: async (ctx) => {
    const jobs = (await ctx.runQuery(internalRefs.communityMentionEmails.listPendingMentionEmailJobsInternal, {})) as Array<{
      mentionId: string;
      recipientUserId: string;
      suppressed: boolean;
      communityName: string;
      mentionerName: string;
      snippet: string;
      urlPath: string;
    }>;
    let enqueued = 0;
    let suppressed = 0;
    const updates: Array<{ mentionId: string; notifyState: "sent" | "suppressed" }> = [];
    for (const job of jobs) {
      if (job.suppressed) {
        suppressed += 1;
        updates.push({ mentionId: job.mentionId, notifyState: "suppressed" });
        continue;
      }
      await ctx.runMutation(internalRefs.email.enqueueEmailJobInternal, {
        kind: "mention_notification",
        recipientUserId: job.recipientUserId,
        templateKey: "mention_notification",
        payload: {
          communityName: job.communityName,
          mentionerName: job.mentionerName,
          snippet: job.snippet,
          actionUrl: buildAppActionUrl(job.urlPath),
        },
        dedupeKey: `mention_notification:${job.mentionId}`,
      });
      enqueued += 1;
      updates.push({ mentionId: job.mentionId, notifyState: "sent" });
    }
    if (updates.length > 0) {
      await ctx.runMutation(internalRefs.communityMentionEmails.markMentionNotifyStatesInternal, {
        updates: updates as any,
      });
    }
    return { ok: true, considered: jobs.length, enqueued, suppressed };
  },
});
