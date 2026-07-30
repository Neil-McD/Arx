import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { communityMembershipRowIsActive, normalizeIdValue } from "./communityCore";
import { settleMentionRowInternal } from "./communityMentionLifecycle";
import {
  EVERYBODY_MENTION_ROLE_KEY,
  mentionBroadcastAllowsEmail,
} from "./communityMentionBroadcasts";
import { readCommunityChatReadState } from "./communityReadCursorCore";

// M2b: the mention email ping. In-app attention (the accent dot) is the
// primary signal; email is the fallback for people who are not around. A
// grace window gives the dot a chance first — mentions still "pending" after
// it are emailed, preference-gated, and their ledger rows advance to "sent"
// (or "suppressed" when the recipient has mention emails off).
//
// Abuse posture: membership is re-checked at email time (the mention was
// written >=15 minutes earlier — ex-members must not receive message
// content), and volume is capped per recipient: one email per run (extra due
// mentions collapse into it) plus a cooldown between runs (mentions inside
// it stay pending and batch into the next email).

const MENTION_EMAIL_GRACE_MS = 15 * 60 * 1000;
const MENTION_EMAIL_RECIPIENT_COOLDOWN_MS = 60 * 60 * 1000;
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
      .withIndex("by_mentionKind_notifyState_createdAt", (q: any) =>
        q.eq("mentionKind", "user").eq("notifyState", "pending"),
      )
      .order("asc")
      .take(100)) as Array<Record<string, any>>;
    const jobs: Array<{
      mentionId: string;
      recipientUserId: string;
      suppressed: boolean;
      collapsed: boolean;
      communityName: string;
      mentionerName: string;
      snippet: string;
      urlPath: string;
      emailSkipped?: boolean;
      read?: boolean;
    }> = [];
    const suppressOnlyJob = (mention: Record<string, any>) => {
      jobs.push({
        mentionId: normalizeIdValue(mention._id),
        recipientUserId: normalizeIdValue(mention.mentionedUserId),
        suppressed: true,
        collapsed: false,
        communityName: "",
        mentionerName: "",
        snippet: "",
        urlPath: "/",
      });
    };
    const readOnlyJob = (mention: Record<string, any>) => {
      jobs.push({
        mentionId: normalizeIdValue(mention._id),
        recipientUserId: normalizeIdValue(mention.mentionedUserId),
        suppressed: false,
        collapsed: false,
        read: true,
        communityName: "",
        mentionerName: "",
        snippet: "",
        urlPath: "/",
      });
    };
    // Per-recipient email caps: one send per run, and a cooldown since the
    // recipient's last mention email (checked once per recipient).
    const cooldownByRecipient = new Map<string, boolean>();
    const emailedThisRun = new Set<string>();
    let emailJobsThisRun = 0;
    for (const mention of pending) {
      if (!mention.mentionedUserId) {
        suppressOnlyJob(mention);
        continue;
      }
      if (Number(mention.createdAt ?? 0) > dueBefore) continue;
      const readState = await readCommunityChatReadState(
        ctx,
        mention.communityId,
        mention.mentionedUserId,
      );
      if (
        readState.mentionSeenThroughAt >=
        Math.floor(Number(mention.createdAt ?? 0))
      ) {
        readOnlyJob(mention);
        continue;
      }
      const isBroadcastCreatedMention =
        mention.sourceBroadcastId &&
        mention.mentionKind === "user" &&
        mention.mentionedRoleKey === EVERYBODY_MENTION_ROLE_KEY &&
        typeof mention.emailEligible === "boolean";
      if (
        isBroadcastCreatedMention &&
        !(await mentionBroadcastAllowsEmail({
          ctx,
          broadcastId: mention.sourceBroadcastId,
        }))
      ) {
        suppressOnlyJob(mention);
        continue;
      }
      if (mention.emailEligible === false) {
        jobs.push({
          mentionId: normalizeIdValue(mention._id),
          recipientUserId: normalizeIdValue(mention.mentionedUserId),
          suppressed: false,
          collapsed: false,
          emailSkipped: true,
          communityName: "",
          mentionerName: "",
          snippet: "",
          urlPath: "/",
        });
        continue;
      }
      const source = mention.replyId
        ? ((await ctx.db.get(mention.replyId)) as Record<string, any> | null)
        : mention.rootId
          ? ((await ctx.db.get(mention.rootId)) as Record<string, any> | null)
          : null;
      if (!source || source.status !== "live") {
        suppressOnlyJob(mention);
        continue;
      }
      if (mention.replyId && source.rootId) {
        const root = (await ctx.db.get(source.rootId)) as Record<string, any> | null;
        if (!root || root.status !== "live") {
          suppressOnlyJob(mention);
          continue;
        }
      }
      const authorUserId = source.actorUserId ?? null;
      // Never ping someone about their own message.
      if (authorUserId && normalizeIdValue(authorUserId) === normalizeIdValue(mention.mentionedUserId)) {
        suppressOnlyJob(mention);
        continue;
      }
      const community = (await ctx.db.get(mention.communityId)) as Record<string, any> | null;
      if (!community) {
        suppressOnlyJob(mention);
        continue;
      }
      // Membership re-check at email time: the recipient may have left (or
      // been removed) since the mention was written; no content leaves the
      // community for ex-members.
      const membership = (await ctx.db
        .query("communityMemberships" as any)
        .withIndex("by_community_user", (q: any) =>
          q.eq("communityId", mention.communityId).eq("userId", mention.mentionedUserId))
        .first()) as Record<string, any> | null;
      const preferences = (await ctx.db
        .query("emailPreferences" as any)
        .withIndex("by_user", (q: any) => q.eq("userId", mention.mentionedUserId))
        .first()) as Record<string, any> | null;
      const suppressed =
        !communityMembershipRowIsActive(membership as any) ||
        preferences?.mentionEmailsEnabled === false;
      const recipientKey = normalizeIdValue(mention.mentionedUserId);
      let collapsed = false;
      if (!suppressed) {
        if (!cooldownByRecipient.has(recipientKey)) {
          const lastMentionEmail = (await ctx.db
            .query("emailOutbox" as any)
            .withIndex("by_recipientUserId", (q: any) => q.eq("recipientUserId", mention.mentionedUserId))
            .order("desc")
            .filter((q: any) => q.eq(q.field("kind"), "mention_notification"))
            .first()) as Record<string, any> | null;
          cooldownByRecipient.set(
            recipientKey,
            Number(lastMentionEmail?.createdAt ?? 0) > nowMs - MENTION_EMAIL_RECIPIENT_COOLDOWN_MS,
          );
        }
        // In cooldown: leave the mention pending so it batches into the
        // recipient's next email instead of sending now.
        if (cooldownByRecipient.get(recipientKey)) continue;
        collapsed = emailedThisRun.has(recipientKey);
        if (!collapsed) {
          if (emailJobsThisRun >= MENTION_EMAIL_BATCH_LIMIT) continue;
          emailedThisRun.add(recipientKey);
          emailJobsThisRun += 1;
        }
      }
      const author = authorUserId
        ? ((await ctx.db.get(authorUserId)) as Record<string, any> | null)
        : null;
      const snippet =
        suppressed || collapsed
          ? ""
          : await readFirstMarkdownBlockText(ctx, {
              rootId: mention.rootId,
              replyId: mention.replyId,
            });
      const slug = boundedText(community.slug, 200);
      jobs.push({
        mentionId: normalizeIdValue(mention._id),
        recipientUserId: recipientKey,
        suppressed,
        collapsed,
        communityName: boundedText(community.name, 200) || "your community",
        mentionerName: boundedText(author?.displayName, 120) || "A community member",
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
        notifyState: v.union(
          v.literal("sent"),
          v.literal("suppressed"),
          v.literal("read"),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    for (const update of args.updates) {
      // Only pending rows advance here; a mention read in-app stays "read".
      await settleMentionRowInternal({
        ctx,
        mentionId: update.mentionId,
        toState: update.notifyState,
        nowMs,
      });
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
      collapsed: boolean;
      communityName: string;
      mentionerName: string;
      snippet: string;
      urlPath: string;
      emailSkipped?: boolean;
      read?: boolean;
    }>;
    let enqueued = 0;
    let suppressed = 0;
    let collapsed = 0;
    let emailSkipped = 0;
    let read = 0;
    const updates: Array<{
      mentionId: string;
      notifyState: "sent" | "suppressed" | "read";
    }> = [];
    for (const job of jobs) {
      if (job.read) {
        read += 1;
        updates.push({ mentionId: job.mentionId, notifyState: "read" });
        continue;
      }
      if (job.emailSkipped) {
        emailSkipped += 1;
        updates.push({ mentionId: job.mentionId, notifyState: "sent" });
        continue;
      }
      if (job.suppressed) {
        suppressed += 1;
        updates.push({ mentionId: job.mentionId, notifyState: "suppressed" });
        continue;
      }
      if (job.collapsed) {
        // Covered by the one email this run's earlier mention sent to the
        // same recipient; the ledger still advances so we never re-ping.
        collapsed += 1;
        updates.push({ mentionId: job.mentionId, notifyState: "sent" });
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
    return {
      ok: true,
      considered: jobs.length,
      enqueued,
      suppressed,
      collapsed,
      emailSkipped,
      read,
    };
  },
});
