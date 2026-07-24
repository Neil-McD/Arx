import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  EMAIL_TEMPLATE_KEYS,
  type EmailTemplateKey,
  sendRenderedEmail,
} from "./emailCore";

const EMAIL_TEMPLATE_VALIDATOR = v.union(
  ...EMAIL_TEMPLATE_KEYS.map((value) => v.literal(value)),
);

type EmailOutboxStatus = "pending" | "sending" | "sent" | "failed" | "suppressed";
const EMAIL_RECEIPT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const TERMINAL_EMAIL_STATUSES = ["sent", "failed", "suppressed"] as const;

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

function normalizeFailureReason(value: unknown): string {
  const reason = readString(value).toLowerCase();
  if (/^[a-z0-9_.:-]{1,120}$/.test(reason)) return reason;
  return "email_provider_rejected";
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
    templateKey === "weekly_founder_digest" ||
    templateKey === "event_reminder" ||
    templateKey === "mention_notification" ||
    templateKey === "dm_message_notification"
  );
}

function preferenceAllowsTemplate(preferences: Record<string, unknown>, templateKey: EmailTemplateKey): boolean {
  if (templateKey === "weekly_member_digest") {
    return preferences.weeklyDigestEnabled !== false;
  }
  if (templateKey === "weekly_founder_digest") {
    return preferences.founderDigestEnabled !== false;
  }
  if (templateKey === "mention_notification") {
    return preferences.mentionEmailsEnabled !== false;
  }
  if (templateKey === "event_reminder") {
    return preferences.eventReminderEnabled !== false;
  }
  if (templateKey === "dm_message_notification") {
    return preferences.dmEmailsEnabled !== false;
  }
  return true;
}

async function getUserEmailDeliveryState(ctx: any, userId: any): Promise<{
  userExists: boolean;
  verifiedEmail: string | null;
}> {
  const user = await ctx.db.get(userId);
  if (!user) {
    return {
      userExists: false,
      verifiedEmail: null,
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
  };
}

async function getEmailPreferencesByUserId(ctx: any, userId: any): Promise<Record<string, unknown>> {
  const rows = await ctx.db
    .query("emailPreferences")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .take(2);
  if (rows.length > 1) throw new Error("email_preferences_not_unique");
  const row = rows[0];
  return row
    ? {
        weeklyDigestEnabled: Boolean(row.weeklyDigestEnabled),
        founderDigestEnabled: Boolean(row.founderDigestEnabled),
        eventReminderEnabled: Boolean(row.eventReminderEnabled),
        // Opt-out (absent = enabled): keeps the outbox-layer gate real so a
        // preference change between enqueue and send is still honored.
        mentionEmailsEnabled: row.mentionEmailsEnabled !== false,
        dmEmailsEnabled: row.dmEmailsEnabled !== false,
      }
    : {
        weeklyDigestEnabled: true,
        founderDigestEnabled: true,
        eventReminderEnabled: true,
        mentionEmailsEnabled: true,
        dmEmailsEnabled: true,
      };
}

async function findExistingDedupeRow(ctx: any, dedupeKey: string) {
  const rows = await ctx.db
    .query("emailOutbox")
    .withIndex("by_dedupeKey", (q: any) => q.eq("dedupeKey", dedupeKey))
    .take(2);
  if (rows.length > 1) throw new Error("email_outbox_dedupe_not_unique");
  return rows[0] ?? null;
}

export const enqueueEmailJobInternal = internalMutation({
  args: {
    kind: v.string(),
    recipientUserId: v.optional(v.id("users")),
    recipientEmail: v.optional(v.string()),
    templateKey: EMAIL_TEMPLATE_VALIDATOR,
    payload: v.any(),
    dedupeKey: v.optional(v.string()),
    scheduledAt: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const dedupeKey = readString(args.dedupeKey) || null;
    if (dedupeKey) {
      const existing = await findExistingDedupeRow(ctx, dedupeKey);
      if (existing) {
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
    let recipientEmail: string | null = null;
    let suppressionReason: string | null = null;
    if (recipientUserId) {
      const deliveryState = await getUserEmailDeliveryState(ctx, recipientUserId);
      if (!deliveryState.verifiedEmail) {
        suppressionReason = deliveryState.userExists
          ? "email_recipient_unverified"
          : "email_recipient_missing";
      }
    } else {
      recipientEmail = normalizeRecipientEmail(rawRecipientEmail);
    }

    const preferences =
      !suppressionReason && recipientUserId && isPreferenceControlledTemplate(templateKey)
        ? await getEmailPreferencesByUserId(ctx, recipientUserId)
        : null;
    if (!suppressionReason && preferences && !preferenceAllowsTemplate(preferences, templateKey)) {
      suppressionReason = "email_preference_disabled";
    }
    const suppressed = Boolean(suppressionReason);
    const status: EmailOutboxStatus = suppressed ? "suppressed" : "pending";

    const outboxId = await ctx.db.insert("emailOutbox", {
      kind: readString(args.kind) || templateKey,
      recipientUserId: recipientUserId ?? undefined,
      ...(!suppressed && recipientEmail ? { recipientEmail } : null),
      templateKey,
      ...(!suppressed ? { payload: args.payload ?? {} } : null),
      dedupeKey: dedupeKey ?? undefined,
      provider: "resend",
      status,
      scheduledAt: Math.max(nowMs, Math.floor(args.scheduledAt ?? nowMs)),
      attemptCount: 0,
      ...(suppressed ? { failureReason: suppressionReason as string } : null),
      ...(suppressed ? { contentMinimizedAt: nowMs } : null),
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { ok: true, deduped: false, outboxId, status };
  },
});

export const resolveEmailRecipientForSendInternal = internalQuery({
  args: {
    recipientUserId: v.optional(v.id("users")),
    recipientEmail: v.optional(v.string()),
    templateKey: EMAIL_TEMPLATE_VALIDATOR,
  },
  handler: async (ctx, args) => {
    const templateKey = args.templateKey as EmailTemplateKey;
    if (args.recipientUserId) {
      const deliveryState = await getUserEmailDeliveryState(ctx, args.recipientUserId);
      if (!deliveryState.verifiedEmail) {
        return {
          ok: false as const,
          reason: deliveryState.userExists
            ? "email_recipient_unverified"
            : "email_recipient_missing",
        };
      }
      if (isPreferenceControlledTemplate(templateKey)) {
        const preferences = await getEmailPreferencesByUserId(ctx, args.recipientUserId);
        if (!preferenceAllowsTemplate(preferences, templateKey)) {
          return { ok: false as const, reason: "email_preference_disabled" };
        }
      }
      return { ok: true as const, recipientEmail: deliveryState.verifiedEmail };
    }
    try {
      return {
        ok: true as const,
        recipientEmail: normalizeRecipientEmail(args.recipientEmail),
      };
    } catch {
      return { ok: false as const, reason: "email_recipient_invalid" };
    }
  },
});

export const claimDueEmailOutboxBatchInternal = internalMutation({
  args: {
    limit: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = Math.max(1, Math.min(25, Math.floor(args.limit ?? 10)));
    const pendingRows = await ctx.db
      .query("emailOutbox")
      .withIndex("by_status_scheduledAt", (q: any) => q.eq("status", "pending").lte("scheduledAt", nowMs))
      .take(limit);
    const staleSendingRows = await ctx.db
      .query("emailOutbox")
      .withIndex("by_status_scheduledAt", (q: any) => q.eq("status", "sending"))
      .take(limit * 5);
    const rows = [...pendingRows];
    for (const row of staleSendingRows) {
      if (rows.length >= limit) break;
      if (isStaleSendingRow(row, nowMs)) rows.push(row);
    }
    for (const row of rows) {
      await ctx.db.patch(row._id, {
        status: "sending",
        attemptCount: Number(row.attemptCount ?? 0) + 1,
        lastAttemptAt: nowMs,
        updatedAt: nowMs,
      });
    }
    return rows.map((row) => ({
      _id: row._id,
      kind: row.kind,
      recipientUserId: row.recipientUserId,
      recipientEmail: row.recipientEmail,
      templateKey: row.templateKey,
      payload: row.payload ?? {},
      dedupeKey: row.dedupeKey ?? null,
      attemptCount: Number(row.attemptCount ?? 0) + 1,
    }));
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
      recipientEmail: undefined,
      payload: undefined,
      contentMinimizedAt: nowMs,
      sentAt: nowMs,
      updatedAt: nowMs,
    });
  },
});

export const markEmailJobSuppressedInternal = internalMutation({
  args: {
    outboxId: v.id("emailOutbox"),
    reason: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    await ctx.db.patch(args.outboxId, {
      status: "suppressed",
      failureReason: normalizeFailureReason(args.reason),
      recipientEmail: undefined,
      payload: undefined,
      contentMinimizedAt: nowMs,
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
      failureReason: normalizeFailureReason(args.reason || "email_send_failed"),
      scheduledAt: terminal ? row.scheduledAt : nowMs + readRetryDelayMs(attemptCount),
      ...(terminal
        ? {
            recipientEmail: undefined,
            payload: undefined,
            contentMinimizedAt: nowMs,
          }
        : null),
      updatedAt: nowMs,
    });
  },
});

export const recordEmailDeliveryWebhookInternal = internalMutation({
  args: {
    provider: v.string(),
    providerEventId: v.string(),
    providerMessageId: v.optional(v.union(v.string(), v.null())),
    eventType: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const provider = readString(args.provider) || "resend";
    const providerEventId = readString(args.providerEventId);
    if (!providerEventId) throw new Error("email_provider_event_id_missing");
    const existingEvents = await ctx.db
      .query("emailDeliveries")
      .withIndex("by_provider_providerEventId", (q: any) =>
        q.eq("provider", provider).eq("providerEventId", providerEventId),
      )
      .take(2);
    if (existingEvents.length > 1) throw new Error("email_provider_event_id_not_unique");
    if (existingEvents.length === 1) {
      return {
        ok: true,
        deduped: true,
        outboxId: existingEvents[0].outboxId ?? null,
      };
    }
    const providerMessageId = readString(args.providerMessageId) || null;
    const outboxRows = providerMessageId
      ? await ctx.db
          .query("emailOutbox")
          .withIndex("by_providerMessageId", (q: any) => q.eq("providerMessageId", providerMessageId))
          .take(2)
      : [];
    if (outboxRows.length > 1) throw new Error("email_provider_message_id_not_unique");
    const outbox = outboxRows[0] ?? null;
    await ctx.db.insert("emailDeliveries", {
      outboxId: outbox?._id,
      provider,
      providerEventId,
      providerMessageId: providerMessageId ?? undefined,
      eventType: readString(args.eventType) || "unknown",
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
        recipientEmail: undefined,
        payload: undefined,
        contentMinimizedAt: nowMs,
        updatedAt: nowMs,
      });
    }
    return { ok: true, deduped: false, outboxId: outbox?._id ?? null };
  },
});

export const pruneTerminalEmailReceiptsInternal = internalMutation({
  args: {
    limit: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const cutoff = nowMs - EMAIL_RECEIPT_RETENTION_MS;
    const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 100)));
    const deliveries = await ctx.db
      .query("emailDeliveries")
      .withIndex("by_createdAt", (q: any) => q.lte("createdAt", cutoff))
      .take(limit);
    for (const delivery of deliveries) {
      await ctx.db.delete(delivery._id);
    }
    let deletedOutboxRows = 0;
    const remainingLimit = limit - deliveries.length;
    for (const status of TERMINAL_EMAIL_STATUSES) {
      if (deletedOutboxRows >= remainingLimit) break;
      const rows = await ctx.db
        .query("emailOutbox")
        .withIndex("by_status_updatedAt", (q: any) =>
          q.eq("status", status).lte("updatedAt", cutoff),
        )
        .take(remainingLimit - deletedOutboxRows);
      for (const row of rows) {
        const retainedDelivery = await ctx.db
          .query("emailDeliveries")
          .withIndex("by_outbox", (q: any) => q.eq("outboxId", row._id))
          .first();
        if (retainedDelivery) continue;
        await ctx.db.delete(row._id);
        deletedOutboxRows += 1;
      }
    }
    return {
      ok: true,
      cutoff,
      deletedDeliveries: deliveries.length,
      deletedOutboxRows,
    };
  },
});

export const processPendingEmailOutboxInternal = internalAction({
  args: {
    limit: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const claimed = (await ctx.runMutation((internal as any).email.claimDueEmailOutboxBatchInternal, {
      limit: args.limit ?? 10,
      nowMs,
    })) as Array<{
      _id: any;
      recipientUserId?: any;
      recipientEmail?: string;
      templateKey: EmailTemplateKey;
      payload: unknown;
      dedupeKey?: string | null;
    }>;

    let sent = 0;
    let failed = 0;
    let suppressed = 0;
    for (const job of claimed) {
      try {
        const recipient = (await ctx.runQuery(
          (internal as any).email.resolveEmailRecipientForSendInternal,
          {
            recipientUserId: job.recipientUserId,
            recipientEmail: job.recipientEmail,
            templateKey: job.templateKey,
          },
        )) as
          | { ok: true; recipientEmail: string }
          | { ok: false; reason: string };
        if (!recipient.ok) {
          await ctx.runMutation((internal as any).email.markEmailJobSuppressedInternal, {
            outboxId: job._id,
            reason: recipient.reason,
            nowMs: Date.now(),
          });
          suppressed += 1;
          continue;
        }
        let renderedPayload = job.payload;
        if (
          job.templateKey === "weekly_member_digest" ||
          job.templateKey === "mention_notification" ||
          job.templateKey === "dm_message_notification"
        ) {
          if (!job.recipientUserId) {
            await ctx.runMutation((internal as any).email.markEmailJobSuppressedInternal, {
              outboxId: job._id,
              reason: "email_recipient_missing",
              nowMs: Date.now(),
            });
            suppressed += 1;
            continue;
          }
          const resolver =
            job.templateKey === "weekly_member_digest"
              ? (internal as any).emailDigests.resolveWeeklyMemberDigestPayloadForSendInternal
              : job.templateKey === "mention_notification"
                ? (internal as any).communityMentionEmails.resolveMentionEmailPayloadForSendInternal
                : (internal as any).directMessageEmails.resolveDirectMessageEmailPayloadForSendInternal;
          const content = (await ctx.runQuery(resolver, {
            recipientUserId: job.recipientUserId,
            payload: job.payload,
            ...(job.templateKey === "weekly_member_digest" ? { nowMs: Date.now() } : null),
          })) as
            | { ok: true; payload: Record<string, unknown> }
            | { ok: false; reason: string };
          if (!content.ok) {
            await ctx.runMutation((internal as any).email.markEmailJobSuppressedInternal, {
              outboxId: job._id,
              reason: content.reason,
              nowMs: Date.now(),
            });
            suppressed += 1;
            continue;
          }
          renderedPayload = content.payload;
        }
        const response = await sendRenderedEmail({
          to: recipient.recipientEmail,
          templateKey: job.templateKey,
          payload: renderedPayload,
          idempotencyKey: readString(job.dedupeKey) || String(job._id),
        });
        await ctx.runMutation((internal as any).email.markEmailJobSentInternal, {
          outboxId: job._id,
          providerMessageId: response.providerMessageId,
          nowMs: Date.now(),
        });
        sent += 1;
      } catch (error) {
        const reason =
          error instanceof Error && error.message.trim() ? error.message.trim() : "email_send_failed";
        await ctx.runMutation((internal as any).email.markEmailJobFailedInternal, {
          outboxId: job._id,
          reason,
          nowMs: Date.now(),
        });
        failed += 1;
      }
    }
    return {
      ok: true,
      claimed: claimed.length,
      sent,
      failed,
      suppressed,
    };
  },
});
