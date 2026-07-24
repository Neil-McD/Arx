import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  communityMembershipRowIsActive,
  getUniqueCommunityMembershipByPair,
  normalizeIdValue,
} from "./communityCore";
import { settleMentionRowInternal } from "./communityMentionLifecycle";
import {
  EVERYBODY_MENTION_ROLE_KEY,
  mentionBroadcastAllowsEmail,
} from "./communityMentionBroadcasts";
import { buildConfiguredPublicAppUrl } from "./emailCore";

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
      emailSkipped?: boolean;
    }> = [];
    const suppressOnlyJob = (mention: Record<string, any>) => {
      jobs.push({
        mentionId: normalizeIdValue(mention._id),
        recipientUserId: normalizeIdValue(mention.mentionedUserId),
        suppressed: true,
        collapsed: false,
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
      let membership;
      try {
        membership = await getUniqueCommunityMembershipByPair({
          ctx,
          communityId: mention.communityId,
          userId: mention.mentionedUserId,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "community_membership_pair_not_unique"
        ) {
          suppressOnlyJob(mention);
          continue;
        }
        throw error;
      }
      const preferences = (await ctx.db
        .query("emailPreferences" as any)
        .withIndex("by_user", (q: any) => q.eq("userId", mention.mentionedUserId))
        .first()) as Record<string, any> | null;
      const suppressed =
        (
          normalizeIdValue(community.ownerId) !== normalizeIdValue(mention.mentionedUserId) &&
          !communityMembershipRowIsActive(membership as any)
        ) ||
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
      jobs.push({
        mentionId: normalizeIdValue(mention._id),
        recipientUserId: recipientKey,
        suppressed,
        collapsed,
      });
    }
    return jobs;
  },
});

export const resolveMentionEmailPayloadForSendInternal = internalQuery({
  args: {
    recipientUserId: v.id("users"),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const payload =
      args.payload && typeof args.payload === "object" && !Array.isArray(args.payload)
        ? (args.payload as Record<string, any>)
        : {};
    const mentionId = payload.mentionId;
    if (!mentionId) {
      return { ok: false as const, reason: "email_content_reference_missing" };
    }
    const mention = (await ctx.db.get(mentionId)) as Record<string, any> | null;
    if (
      !mention ||
      normalizeIdValue(mention.mentionedUserId) !== normalizeIdValue(args.recipientUserId)
    ) {
      return { ok: false as const, reason: "email_content_unavailable" };
    }
    const isBroadcastCreatedMention =
      mention.sourceBroadcastId &&
      mention.mentionKind === "user" &&
      mention.mentionedRoleKey === EVERYBODY_MENTION_ROLE_KEY &&
      typeof mention.emailEligible === "boolean";
    if (
      mention.emailEligible === false ||
      (
        isBroadcastCreatedMention &&
        !(await mentionBroadcastAllowsEmail({
          ctx,
          broadcastId: mention.sourceBroadcastId,
        }))
      )
    ) {
      return { ok: false as const, reason: "email_content_unavailable" };
    }
    const source = mention.replyId
      ? ((await ctx.db.get(mention.replyId)) as Record<string, any> | null)
      : mention.rootId
        ? ((await ctx.db.get(mention.rootId)) as Record<string, any> | null)
        : null;
    if (
      !source ||
      source.status !== "live" ||
      !["community", "public"].includes(String(source.visibilityScope ?? ""))
    ) {
      return { ok: false as const, reason: "email_content_unavailable" };
    }
    if (mention.replyId) {
      const root = source.rootId
        ? ((await ctx.db.get(source.rootId)) as Record<string, any> | null)
        : null;
      if (
        !root ||
        root.status !== "live" ||
        !["community", "public"].includes(String(root.visibilityScope ?? ""))
      ) {
        return { ok: false as const, reason: "email_content_unavailable" };
      }
    }
    const community = (await ctx.db.get(mention.communityId)) as Record<string, any> | null;
    if (!community || normalizeIdValue(source.communityId) !== normalizeIdValue(community._id)) {
      return { ok: false as const, reason: "email_content_unavailable" };
    }
    if (normalizeIdValue(community.ownerId) !== normalizeIdValue(args.recipientUserId)) {
      let membership;
      try {
        membership = await getUniqueCommunityMembershipByPair({
          ctx,
          communityId: community._id,
          userId: args.recipientUserId,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "community_membership_pair_not_unique"
        ) {
          return { ok: false as const, reason: "email_recipient_access_revoked" };
        }
        throw error;
      }
      if (!communityMembershipRowIsActive(membership)) {
        return { ok: false as const, reason: "email_recipient_access_revoked" };
      }
    }
    const authorUserId = source.actorUserId ?? null;
    if (
      authorUserId &&
      normalizeIdValue(authorUserId) === normalizeIdValue(args.recipientUserId)
    ) {
      return { ok: false as const, reason: "email_content_unavailable" };
    }
    const author = authorUserId
      ? ((await ctx.db.get(authorUserId)) as Record<string, any> | null)
      : null;
    const slug = boundedText(community.slug, 200);
    return {
      ok: true as const,
      payload: {
        communityName: boundedText(community.name, 200) || "your community",
        mentionerName: boundedText(author?.displayName, 120) || "A community member",
        snippet: await readFirstMarkdownBlockText(ctx, {
          rootId: mention.rootId,
          replyId: mention.replyId,
        }),
        actionUrl: buildConfiguredPublicAppUrl(
          slug ? `/c/${encodeURIComponent(slug)}/chat` : "/",
        ),
      },
    };
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
      emailSkipped?: boolean;
    }>;
    let enqueued = 0;
    let suppressed = 0;
    let collapsed = 0;
    let emailSkipped = 0;
    const updates: Array<{ mentionId: string; notifyState: "sent" | "suppressed" }> = [];
    for (const job of jobs) {
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
          mentionId: job.mentionId,
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
    return { ok: true, considered: jobs.length, enqueued, suppressed, collapsed, emailSkipped };
  },
});
