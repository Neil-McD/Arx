import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { normalizeIdValue } from "./communityCore";
import { normalizeCommunityLifecycle } from "../shared/communityLifecycle";
import { resolveMentionRecipientSource } from "./communityNotificationAccess";
import { settleMentionRowInternal } from "./communityMentionLifecycle";
import {
  EVERYBODY_MENTION_ROLE_KEY,
  mentionBroadcastAllowsEmail,
} from "./communityMentionBroadcasts";
import { readCommunityChannelReadState } from "./communityReadCursorCore";

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

const internalRefs = internal as any;

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
      communityId?: string;
      communityLifecycleGeneration?: number;
      emailSkipped?: boolean;
      read?: boolean;
    }> = [];
    const suppressOnlyJob = (mention: Record<string, any>) => {
      jobs.push({
        mentionId: normalizeIdValue(mention._id),
        recipientUserId: normalizeIdValue(mention.mentionedUserId),
        suppressed: true,
        collapsed: false,
      });
    };
    const readOnlyJob = (mention: Record<string, any>) => {
      jobs.push({
        mentionId: normalizeIdValue(mention._id),
        recipientUserId: normalizeIdValue(mention.mentionedUserId),
        suppressed: false,
        collapsed: false,
        read: true,
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
      const authorized = await resolveMentionRecipientSource({ ctx, mention, userId: mention.mentionedUserId });
      if (!authorized) {
        suppressOnlyJob(mention);
        continue;
      }
      let readState;
      try {
        readState = await readCommunityChannelReadState(
          ctx,
          mention.communityId,
          mention.mentionedUserId,
          authorized.channel,
        );
      } catch {
        // One corrupt or cross-community channel reference must fail closed
        // without starving every later mention in the bounded email batch.
        suppressOnlyJob(mention);
        continue;
      }
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
        });
        continue;
      }
      const source = authorized.source.row;
      const authorUserId = source.actorUserId ?? null;
      // Never ping someone about their own message.
      if (authorUserId && normalizeIdValue(authorUserId) === normalizeIdValue(mention.mentionedUserId)) {
        suppressOnlyJob(mention);
        continue;
      }
      const preferences = (await ctx.db
        .query("emailPreferences" as any)
        .withIndex("by_user", (q: any) => q.eq("userId", mention.mentionedUserId))
        .first()) as Record<string, any> | null;
      const suppressed = preferences?.mentionEmailsEnabled === false;
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
        communityId: normalizeIdValue(authorized.community._id),
        communityLifecycleGeneration: normalizeCommunityLifecycle(authorized.community).generation,
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
      communityId?: string;
      communityLifecycleGeneration?: number;
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
      const result = await ctx.runMutation(internalRefs.email.enqueueEmailJobInternal, {
        kind: "mention_notification",
        recipientUserId: job.recipientUserId,
        sourceMentionId: job.mentionId,
        communityId: job.communityId,
        communityLifecycleGeneration: job.communityLifecycleGeneration,
        templateKey: "mention_notification",
        payload: {},
        dedupeKey: `mention_notification:${job.mentionId}`,
      });
      if (result.status === "suppressed") {
        suppressed += 1;
        updates.push({ mentionId: job.mentionId, notifyState: "suppressed" });
        continue;
      }
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
