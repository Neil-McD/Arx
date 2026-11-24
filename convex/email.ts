import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {
  EMAIL_TEMPLATE_KEYS,
  type EmailTemplateKey,
  sendRenderedEmail,
} from "./emailCore";
import {
  communityIsActive,
  communityLifecycleGenerationMatches,
} from "../shared/communityLifecycle";
import { communityMembershipRowIsActive } from "./communityCore";
import { resolveMentionEmailDelivery } from "./communityMentionEmailDelivery";

const EMAIL_TEMPLATE_VALIDATOR = v.union(
  ...EMAIL_TEMPLATE_KEYS.map((value) => v.literal(value)),
);

const EMAIL_PRIORITY_URGENT = 0;
const EMAIL_PRIORITY_MENTION = 1;
const EMAIL_PRIORITY_BULK = 2;
const EMAIL_SEND_CONCURRENCY = 5;
const MAX_EMAIL_OUTBOX_CONTINUATION_ROUNDS = 10;
const MAX_EMAIL_ENQUEUE_BATCH_SIZE = 100;

export function emailPriorityRankForTemplate(templateKey: EmailTemplateKey): number {
  if (templateKey === "event_reminder" || templateKey === "weekly_member_digest") {
    return EMAIL_PRIORITY_BULK;
  }
  if (templateKey === "mention_notification" || templateKey === "member_coach_nudge") {
    return EMAIL_PRIORITY_MENTION;
  }
  return EMAIL_PRIORITY_URGENT;
}

const ENQUEUE_EMAIL_JOB_FIELDS = {
  kind: v.string(),
  sourceMentionId: v.optional(v.id("communityInteractionMentions")),
  communityId: v.optional(v.id("communities")),
  communityLifecycleGeneration: v.optional(v.number()),
  recipientUserId: v.optional(v.id("users")),
  recipientEmail: v.optional(v.string()),
  templateKey: EMAIL_TEMPLATE_VALIDATOR,
  payload: v.any(),
  dedupeKey: v.optional(v.string()),
  scheduledAt: v.optional(v.number()),
  nowMs: v.optional(v.number()),
};

type EmailOutboxStatus = "pending" | "sending" | "sent" | "failed" | "suppressed";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function maybeNormalizeRecipientEmail(value: unknown): string | null {
  const email = readString(value).toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("email_recipient_invalid");
  }
  return email;
}

function normalizeRecipientEmail(value: unknown): string {
  const email = maybeNormalizeRecipientEmail(value);
  if (!email) {
    throw new Error("email_recipient_invalid");
  }
  return email;
}

function normalizeStatus(value: unknown): EmailOutboxStatus {
  const normalized = readString(value).toLowerCase();
  if (normalized === "pending") return "pending";
  if (normalized === "sending") return "sending";
  if (normalized === "sent") return "sent";
  if (normalized === "failed") return "failed";
  if (normalized === "suppressed") return "suppressed";
  throw new Error("email_status_invalid");
}

function readRetryDelayMs(attemptCount: number): number {
  if (attemptCount <= 1) return 5 * 60 * 1000;
  if (attemptCount === 2) return 30 * 60 * 1000;
  return 2 * 60 * 60 * 1000;
}

function isStaleSendingRow(row: Record<string, unknown>, nowMs: number): boolean {
  const status = readString(row.status).toLowerCase();
  if (status !== "sending") return false;
  const lastAttemptAt =
    typeof row.lastAttemptAt === "number"
      ? row.lastAttemptAt
      : typeof row.updatedAt === "number"
        ? row.updatedAt
        : 0;
  return lastAttemptAt > 0 && nowMs - lastAttemptAt >= 15 * 60 * 1000;
}

function isPreferenceControlledTemplate(templateKey: EmailTemplateKey): boolean {
  return (
    templateKey === "weekly_member_digest" ||
    templateKey === "event_reminder" ||
    templateKey === "mention_notification" ||
    templateKey === "member_coach_nudge"
  );
}

function preferenceAllowsTemplate(preferences: Record<string, unknown>, templateKey: EmailTemplateKey): boolean {
  if (templateKey === "weekly_member_digest") {
    return preferences.weeklyDigestEnabled !== false;
  }
  if (templateKey === "mention_notification" || templateKey === "member_coach_nudge") {
    return preferences.mentionEmailsEnabled !== false;
  }
  if (templateKey === "event_reminder") {
    return preferences.eventReminderEnabled !== false;
  }
  return true;
}

async function getUserEmailDeliveryState(ctx: any, userId: any): Promise<{
  userExists: boolean;
  verifiedEmail: string | null;
  recordEmail: string | null;
}> {
  const user = await ctx.db.get(userId);
  if (!user) {
    return {
      userExists: false,
      verifiedEmail: null,
      recordEmail: null,
    };
  }
  let recordEmail: string | null = null;
  try {
    recordEmail = maybeNormalizeRecipientEmail(user.email);
  } catch {
    recordEmail = null;
  }
  return {
    userExists: true,
    verifiedEmail: typeof user.emailVerifiedAt === "number" ? recordEmail : null,
    recordEmail,
  };
}

async function getEmailPreferencesByUserId(ctx: any, userId: any): Promise<Record<string, unknown>> {
  const row = await ctx.db
    .query("emailPreferences")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
  return row
    ? {
        weeklyDigestEnabled: row.weeklyDigestEnabled !== false,
        eventReminderEnabled: Boolean(row.eventReminderEnabled),
        // Opt-out (absent = enabled): keeps the outbox-layer gate real so a
        // preference change between enqueue and send is still honored.
        mentionEmailsEnabled: row.mentionEmailsEnabled !== false,
      }
    : {
        weeklyDigestEnabled: true,
        eventReminderEnabled: true,
        mentionEmailsEnabled: true,
      };
}

async function findExistingDedupeRow(ctx: any, dedupeKey: string) {
  return await ctx.db
    .query("emailOutbox")
    .withIndex("by_dedupeKey", (q: any) => q.eq("dedupeKey", dedupeKey))
    .first();
}

async function weeklyDigestRecipientHasCommunityAccess(
  ctx: any,
  communityId: any,
  userId: any,
): Promise<boolean> {
  const community = await ctx.db.get(communityId);
  if (!community || !communityIsActive(community)) return false;
  if (String(community.ownerId) === String(userId)) return true;
  const membership = await ctx.db
    .query("communityMemberships")
    .withIndex("by_community_user", (q: any) =>
      q.eq("communityId", communityId).eq("userId", userId),
    )
    .unique();
  return communityMembershipRowIsActive(membership);
}

export const enqueueEmailJobInternal = internalMutation({
  args: ENQUEUE_EMAIL_JOB_FIELDS,
  handler: async (ctx, args) => enqueueSingleEmailJob(ctx, args),
});

export const enqueueEmailJobsBatchInternal = internalMutation({
  args: {
    jobs: v.array(v.object(ENQUEUE_EMAIL_JOB_FIELDS)),
  },
  handler: async (ctx, args) => {
    if (args.jobs.length > MAX_EMAIL_ENQUEUE_BATCH_SIZE) {
      throw new Error("email_enqueue_batch_too_large");
    }
    const communityCache = new Map<string, any>();
    let enqueued = 0;
    let deduped = 0;
    let suppressed = 0;
    const results: Array<{
      ok: true;
      deduped: boolean;
      outboxId?: any;
      status: EmailOutboxStatus;
      reason?: string;
    }> = [];
    for (const job of args.jobs) {
      const result = await enqueueSingleEmailJob(ctx, job, communityCache);
      results.push(result);
      if (result.deduped) deduped += 1;
      else if (result.status === "suppressed") suppressed += 1;
      else enqueued += 1;
    }
    return {
      ok: true as const,
      enqueued,
      deduped,
      suppressed,
      results,
    };
  },
});

async function enqueueSingleEmailJob(
  ctx: any,
  args: {
    kind: string;
    sourceMentionId?: any;
    communityId?: any;
    communityLifecycleGeneration?: number;
    recipientUserId?: any;
    recipientEmail?: string;
    templateKey: EmailTemplateKey;
    payload: any;
    dedupeKey?: string;
    scheduledAt?: number;
    nowMs?: number;
  },
  communityCache?: Map<string, any>,
): Promise<{
  ok: true;
  deduped: boolean;
  outboxId?: any;
  status: EmailOutboxStatus;
  reason?: string;
}> {
  const nowMs = args.nowMs ?? Date.now();
  if (Boolean(args.communityId) !== (args.communityLifecycleGeneration !== undefined)) {
    throw new Error("email_community_lifecycle_scope_invalid");
  }
  if (args.communityId) {
    const cacheKey = String(args.communityId);
    let community: any;
    if (communityCache && communityCache.has(cacheKey)) {
      community = communityCache.get(cacheKey);
    } else {
      community = await ctx.db.get(args.communityId);
      if (communityCache) communityCache.set(cacheKey, community);
    }
    if (
      !community ||
      !communityIsActive(community) ||
      !communityLifecycleGenerationMatches(
        community,
        args.communityLifecycleGeneration,
      )
    ) {
      return {
        ok: true,
        deduped: false,
        status: "suppressed" as const,
        reason: "community_inactive",
      };
    }
  }
  const dedupeKey = readString(args.dedupeKey) || null;
  if (dedupeKey) {
    const existing = await findExistingDedupeRow(ctx, dedupeKey);
    if (
      existing &&
      ["pending", "sending", "sent", "failed", "suppressed"].includes(existing.status)
    ) {
      return {
        ok: true,
        deduped: true,
        outboxId: existing._id,
        status: normalizeStatus(existing.status),
      };
    }
  }

  const recipientUserId = args.recipientUserId ?? null;
  const rawRecipientEmail = readString(args.recipientEmail);
  if (recipientUserId && rawRecipientEmail) {
    throw new Error("email_recipient_ambiguous");
  }
  if (!recipientUserId && !rawRecipientEmail) {
    throw new Error("email_recipient_missing");
  }

  const templateKey = args.templateKey as EmailTemplateKey;
  if (args.sourceMentionId && templateKey !== "mention_notification") throw new Error("email_mention_template_invalid");
  let recipientEmail: string;
  let suppressionReason: string | null = null;
  if (recipientUserId) {
    const deliveryState = await getUserEmailDeliveryState(ctx, recipientUserId);
    if (deliveryState.verifiedEmail) {
      recipientEmail = deliveryState.verifiedEmail;
    } else {
      suppressionReason = deliveryState.userExists
        ? "email_recipient_unverified"
        : "email_recipient_missing";
      recipientEmail =
        deliveryState.recordEmail || `suppressed+${String(recipientUserId)}@invalid.local`;
    }
  } else {
    recipientEmail = normalizeRecipientEmail(rawRecipientEmail);
  }

  if (
    !suppressionReason &&
    (templateKey === "weekly_member_digest" || templateKey === "member_coach_nudge") &&
    args.communityId &&
    recipientUserId &&
    !(await weeklyDigestRecipientHasCommunityAccess(
      ctx,
      args.communityId,
      recipientUserId,
    ))
  ) {
    suppressionReason = "community_membership_inactive";
  }

  const preferences =
    !suppressionReason && recipientUserId && isPreferenceControlledTemplate(templateKey)
      ? await getEmailPreferencesByUserId(ctx, recipientUserId)
      : null;
  if (!suppressionReason && preferences && !preferenceAllowsTemplate(preferences, templateKey)) {
    suppressionReason = "email_preference_disabled";
  }
  if (!suppressionReason && templateKey === "mention_notification" &&
    !(await resolveMentionEmailDelivery({ ctx, ...args }))) {
    suppressionReason = "mention_source_unavailable";
  }
  const suppressed = Boolean(suppressionReason);
  const status: EmailOutboxStatus = suppressed ? "suppressed" : "pending";

  const outboxId = await ctx.db.insert("emailOutbox", {
    kind: readString(args.kind) || templateKey,
    sourceMentionId: args.sourceMentionId,
    communityId: args.communityId,
    communityLifecycleGeneration: args.communityLifecycleGeneration,
    recipientUserId: recipientUserId ?? undefined,
    recipientEmail,
    templateKey,
    payload: templateKey === "mention_notification" ? {} : args.payload ?? {},
    dedupeKey: dedupeKey ?? undefined,
    provider: "resend",
    status,
    priorityRank: emailPriorityRankForTemplate(templateKey),
    scheduledAt: Math.max(nowMs, Math.floor(args.scheduledAt ?? nowMs)),
    attemptCount: 0,
    ...(suppressed ? { failureReason: suppressionReason as string } : null),
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  return { ok: true, deduped: false, outboxId, status };
}

async function prepareMentionJob(ctx: any, row: any, nowMs: number, sealContent = false) {
  const payload = await resolveMentionEmailDelivery({ ctx, ...row });
  const preferences = row.recipientUserId ? await getEmailPreferencesByUserId(ctx, row.recipientUserId) : null;
  const email = row.recipientUserId ? await getUserEmailDeliveryState(ctx, row.recipientUserId) : null;
  if (!payload || preferences?.mentionEmailsEnabled === false || !email?.verifiedEmail || email.verifiedEmail !== row.recipientEmail) {
    await ctx.db.patch(row._id, {
      status: "suppressed", payload: {}, failureReason: "mention_source_or_recipient_unavailable", updatedAt: nowMs,
    });
    return null;
  }
  // A provider retry must never reuse the original idempotency key with a
  // different body. Retain only its fingerprint, not a private message copy.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
  const contentHash = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
  const previousHash = readString(asRecord(row.payload).mentionContentHash);
  if (previousHash && previousHash !== contentHash) {
    await ctx.db.patch(row._id, { status: "suppressed", payload: {}, failureReason: "mention_content_changed", updatedAt: nowMs });
    return null;
  }
  if (sealContent && !previousHash) await ctx.db.patch(row._id, { payload: { mentionContentHash: contentHash } });
  return payload;
}

export const claimDueEmailOutboxBatchInternal = internalMutation({
  args: {
    limit: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = Math.max(1, Math.min(25, Math.floor(args.limit ?? 10)));
    const candidateCap = limit * 2;
    const rows: any[] = [];
    const seenIds = new Set<string>();
    const appendRows = (batch: any[]) => {
      for (const item of batch) {
        if (rows.length >= candidateCap) break;
        const key = String(item._id);
        if (seenIds.has(key)) continue;
        seenIds.add(key);
        rows.push(item);
      }
    };

    // Priority lanes: urgent (0) -> mentions (1) -> bulk reminders/digests (2) -> legacy unranked.
    for (const rank of [EMAIL_PRIORITY_URGENT, EMAIL_PRIORITY_MENTION, EMAIL_PRIORITY_BULK, undefined] as const) {
      if (rows.length >= candidateCap) break;
      const laneRows = await ctx.db
        .query("emailOutbox")
        .withIndex("by_status_priority_scheduledAt", (q: any) =>
          q.eq("status", "pending").eq("priorityRank", rank).lte("scheduledAt", nowMs),
        )
        .take(candidateCap - rows.length);
      appendRows(laneRows);
    }

    if (rows.length < candidateCap) {
      const staleSendingRows = await ctx.db
        .query("emailOutbox")
        .withIndex("by_status_scheduledAt", (q: any) => q.eq("status", "sending"))
        .take(limit * 5);
      for (const row of staleSendingRows) {
        if (rows.length >= candidateCap) break;
        if (isStaleSendingRow(row, nowMs)) appendRows([row]);
      }
    }

    const claimedRows = [];
    for (const row of rows) {
      if (claimedRows.length >= limit) break;
      if (row.templateKey === "mention_notification") {
        const payload = await prepareMentionJob(ctx, row, nowMs);
        if (!payload) continue;
        // Only the claimed response contains the freshly authorized preview.
        row.payload = payload;
      }
      if (row.communityId) {
        const community = (await ctx.db.get(row.communityId)) as any;
        if (
          !community ||
          !communityIsActive(community) ||
          !communityLifecycleGenerationMatches(
            community,
            row.communityLifecycleGeneration,
          )
        ) {
          await ctx.db.patch(row._id, {
            status: "suppressed",
            failureReason: "community_inactive",
            updatedAt: nowMs,
          });
          continue;
        }
      }
      if (row.recipientUserId && isPreferenceControlledTemplate(row.templateKey as EmailTemplateKey)) {
        if (
          row.templateKey === "weekly_member_digest" &&
          row.communityId &&
          !(await weeklyDigestRecipientHasCommunityAccess(
            ctx,
            row.communityId,
            row.recipientUserId,
          ))
        ) {
          await ctx.db.patch(row._id, {
            status: "suppressed",
            failureReason: "community_membership_inactive",
            updatedAt: nowMs,
          });
          continue;
        }
        const preferences = await getEmailPreferencesByUserId(ctx, row.recipientUserId);
        if (!preferenceAllowsTemplate(preferences, row.templateKey as EmailTemplateKey)) {
          await ctx.db.patch(row._id, {
            status: "suppressed",
            failureReason: "email_preference_disabled",
            updatedAt: nowMs,
          });
          continue;
        }
      }
      await ctx.db.patch(row._id, {
        status: "sending",
        attemptCount: Number(row.attemptCount ?? 0) + 1,
        lastAttemptAt: nowMs,
        updatedAt: nowMs,
      });
      claimedRows.push(row);
    }
    return claimedRows.map((row) => ({
      _id: row._id,
      kind: row.kind,
      recipientEmail: row.recipientEmail,
      templateKey: row.templateKey,
      payload: row.payload,
      dedupeKey: row.dedupeKey ?? null,
      attemptCount: Number(row.attemptCount ?? 0) + 1,
    }));
  },
});

// Recheck each mention immediately before the provider call, not merely when a
// batch was claimed. The attempt check fences workers superseded by a retry.
export const prepareMentionEmailDispatchInternal = internalMutation({
  args: { outboxId: v.id("emailOutbox"), attemptCount: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.outboxId);
    if (!row || row.templateKey !== "mention_notification" || row.status !== "sending" || row.attemptCount !== args.attemptCount) return null;
    const payload = await prepareMentionJob(ctx, row, Date.now(), true);
    return payload ? { recipientEmail: row.recipientEmail, payload } : null;
  },
});

export const markEmailJobSentInternal = internalMutation({
  args: {
    outboxId: v.id("emailOutbox"),
    providerMessageId: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    await ctx.db.patch(args.outboxId, {
      status: "sent",
      provider: "resend",
      providerMessageId: readString(args.providerMessageId) || undefined,
      sentAt: nowMs,
      updatedAt: nowMs,
    });
  },
});

export const markEmailJobFailedInternal = internalMutation({
  args: {
    outboxId: v.id("emailOutbox"),
    reason: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const row = await ctx.db.get(args.outboxId);
    if (!row) return;
    const attemptCount = Number(row.attemptCount ?? 0);
    const terminal = attemptCount >= 3;
    await ctx.db.patch(row._id, {
      status: terminal ? "failed" : "pending",
      failureReason: readString(args.reason) || "email_send_failed",
      scheduledAt: terminal ? row.scheduledAt : nowMs + readRetryDelayMs(attemptCount),
      updatedAt: nowMs,
    });
  },
});

export const recordEmailDeliveryWebhookInternal = internalMutation({
  args: {
    provider: v.string(),
    providerMessageId: v.optional(v.union(v.string(), v.null())),
    eventType: v.string(),
    payload: v.any(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const providerMessageId = readString(args.providerMessageId) || null;
    const outbox =
      providerMessageId
        ? await ctx.db
            .query("emailOutbox")
            .withIndex("by_providerMessageId", (q: any) => q.eq("providerMessageId", providerMessageId))
            .first()
        : null;
    await ctx.db.insert("emailDeliveries", {
      outboxId: outbox?._id,
      provider: readString(args.provider) || "resend",
      providerMessageId: providerMessageId ?? undefined,
      eventType: readString(args.eventType) || "unknown",
      payload: args.payload ?? {},
      createdAt: nowMs,
    });
    const terminalFailureEvents = new Set([
      "email.bounced",
      "email.failed",
      "email.suppressed",
      "email.complained",
    ]);
    if (outbox && terminalFailureEvents.has(readString(args.eventType))) {
      await ctx.db.patch(outbox._id, {
        status: "failed",
        failureReason: readString(args.eventType),
        updatedAt: nowMs,
      });
    }
    return { ok: true, outboxId: outbox?._id ?? null };
  },
});

export const processPendingEmailOutboxInternal = internalAction({
  args: {
    limit: v.optional(v.number()),
    nowMs: v.optional(v.number()),
    continuationRound: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = Math.max(1, Math.min(25, Math.floor(args.limit ?? 25)));
    const continuationRound = Math.max(0, Math.floor(args.continuationRound ?? 0));
    const claimed = (await ctx.runMutation((internal as any).email.claimDueEmailOutboxBatchInternal, {
      limit,
      nowMs,
    })) as Array<{
      _id: any;
      recipientEmail: string;
      templateKey: EmailTemplateKey;
      payload: unknown;
      dedupeKey?: string | null;
      attemptCount: number;
    }>;

    let sent = 0;
    let failed = 0;
    let suppressed = 0;
    for (let start = 0; start < claimed.length; start += EMAIL_SEND_CONCURRENCY) {
      const chunk = claimed.slice(start, start + EMAIL_SEND_CONCURRENCY);
      const outcomes = await Promise.all(
        chunk.map(async (job) => {
          try {
            let recipientEmail = job.recipientEmail;
            let payload = job.payload;
            if (job.templateKey === "mention_notification") {
              const prepared = await ctx.runMutation((internal as any).email.prepareMentionEmailDispatchInternal, {
                outboxId: job._id,
                attemptCount: job.attemptCount,
              });
              if (!prepared) return "suppressed" as const;
              recipientEmail = prepared.recipientEmail;
              payload = prepared.payload;
            }
            const response = await sendRenderedEmail({
              to: recipientEmail,
              templateKey: job.templateKey,
              payload,
              idempotencyKey: readString(job.dedupeKey) || String(job._id),
            });
            await ctx.runMutation((internal as any).email.markEmailJobSentInternal, {
              outboxId: job._id,
              providerMessageId: response.providerMessageId,
              nowMs: Date.now(),
            });
            return "sent" as const;
          } catch (error) {
            const reason =
              error instanceof Error && error.message.trim() ? error.message.trim() : "email_send_failed";
            await ctx.runMutation((internal as any).email.markEmailJobFailedInternal, {
              outboxId: job._id,
              reason,
              nowMs: Date.now(),
            });
            return "failed" as const;
          }
        }),
      );
      for (const outcome of outcomes) {
        if (outcome === "sent") sent += 1;
        else if (outcome === "suppressed") suppressed += 1;
        else failed += 1;
      }
    }

    let continued = false;
    // Back off to the 5-minute cron if the entire batch failed (provider outage).
    if (
      claimed.length >= limit &&
      sent + suppressed > 0 &&
      continuationRound < MAX_EMAIL_OUTBOX_CONTINUATION_ROUNDS
    ) {
      await ctx.scheduler.runAfter(2_000, (internal as any).email.processPendingEmailOutboxInternal, {
        limit,
        continuationRound: continuationRound + 1,
        ...(args.nowMs !== undefined ? { nowMs: args.nowMs } : {}),
      });
      continued = true;
    }

    return {
      ok: true,
      claimed: claimed.length,
      sent,
      failed,
      suppressed,
      continued,
    };
  },
});
