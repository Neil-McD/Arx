import { internal } from "./_generated/api";
import { action, internalAction, internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  EMAIL_TEMPLATE_KEYS,
  type EmailTemplateKey,
  sendRenderedEmail,
} from "./emailCore";
import { ensureAuthenticatedActor } from "./authActor";

const EMAIL_TEMPLATE_VALIDATOR = v.union(
  ...EMAIL_TEMPLATE_KEYS.map((value) => v.literal(value)),
);

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
    templateKey === "weekly_founder_digest" ||
    templateKey === "event_reminder"
  );
}

function preferenceAllowsTemplate(preferences: Record<string, unknown>, templateKey: EmailTemplateKey): boolean {
  if (templateKey === "weekly_member_digest") {
    return preferences.weeklyDigestEnabled !== false;
  }
  if (templateKey === "weekly_founder_digest") {
    return preferences.founderDigestEnabled !== false;
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
        weeklyDigestEnabled: Boolean(row.weeklyDigestEnabled),
        founderDigestEnabled: Boolean(row.founderDigestEnabled),
        eventReminderEnabled: Boolean(row.eventReminderEnabled),
        founderAdminEmailsEnabled: Boolean(row.founderAdminEmailsEnabled),
      }
    : {
        weeklyDigestEnabled: true,
        founderDigestEnabled: true,
        eventReminderEnabled: true,
        founderAdminEmailsEnabled: true,
      };
}

async function findExistingDedupeRow(ctx: any, dedupeKey: string) {
  return await ctx.db
    .query("emailOutbox")
    .withIndex("by_dedupeKey", (q: any) => q.eq("dedupeKey", dedupeKey))
    .first();
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
      if (existing && ["pending", "sending", "sent"].includes(existing.status)) {
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
      recipientEmail,
      templateKey,
      payload: args.payload ?? {},
      dedupeKey: dedupeKey ?? undefined,
      provider: "resend",
      status,
      scheduledAt: Math.max(nowMs, Math.floor(args.scheduledAt ?? nowMs)),
      attemptCount: 0,
      ...(suppressed ? { failureReason: suppressionReason as string } : null),
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { ok: true, deduped: false, outboxId, status };
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
      recipientEmail: row.recipientEmail,
      templateKey: row.templateKey,
      payload: row.payload,
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
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const claimed = (await ctx.runMutation((internal as any).email.claimDueEmailOutboxBatchInternal, {
      limit: args.limit ?? 10,
      nowMs,
    })) as Array<{
      _id: any;
      recipientEmail: string;
      templateKey: EmailTemplateKey;
      payload: unknown;
      dedupeKey?: string | null;
    }>;

    let sent = 0;
    let failed = 0;
    for (const job of claimed) {
      try {
        const response = await sendRenderedEmail({
          to: job.recipientEmail,
          templateKey: job.templateKey,
          payload: job.payload,
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
    };
  },
});

export const processPendingEmailOutbox = action({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.runAction((internal as any).email.processPendingEmailOutboxInternal, {
      limit: args.limit ?? 10,
      nowMs: Date.now(),
    });
  },
});

export const listMyEmailOutboxPreview = query({
  args: {
    authSubject: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await ensureAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const rows = await ctx.db
      .query("emailOutbox")
      .withIndex("by_recipientUserId", (q: any) => q.eq("recipientUserId", actor.dbUserId))
      .collect();
    return rows
      .slice()
      .sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0))
      .slice(0, Math.max(1, Math.min(50, Math.floor(args.limit ?? 20))))
      .map((row) => ({
        id: String(row._id),
        kind: row.kind,
        template_key: row.templateKey,
        status: row.status,
        scheduled_at: row.scheduledAt,
        sent_at: row.sentAt ?? null,
        failure_reason: row.failureReason ?? null,
      }));
  },
});
