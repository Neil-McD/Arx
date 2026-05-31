import { api, internal } from "./_generated/api";
import { action, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  fetchWorkosUserVerification,
  isWorkosApiKeyConfigured,
  redactWorkosUserVerificationLookup,
} from "./workosEmailVerification";

const EMAIL_OUTBOX_STATUSES = ["pending", "sending", "sent", "failed", "suppressed"] as const;
const EMAIL_VERIFICATION_CLAIM_KEYS = [
  "email_verified",
  "emailVerified",
  "verified_email",
  "verifiedEmail",
] as const;
const RESEND_API_KEY_ENV_KEYS = ["ARX_RESEND_API_KEY", "RESEND_API_KEY"] as const;
const EMAIL_FROM_ENV_KEYS = ["ARX_EMAIL_FROM", "ARX_RESEND_FROM_EMAIL"] as const;
const EMAIL_FROM_DOMAIN_ENV_KEYS = ["ARX_EMAIL_FROM_DOMAIN", "ARX_RESEND_DOMAIN"] as const;
const RESEND_WEBHOOK_SECRET_ENV_KEYS = ["ARX_RESEND_WEBHOOK_SECRET", "RESEND_WEBHOOK_SECRET"] as const;
const STALE_EMAIL_SENDING_MS = 15 * 60 * 1000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function hasAnyEnv(keys: readonly string[]): boolean {
  return keys.some((key) => Boolean(readEnv(key)));
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") return false;
  return null;
}

function increment(map: Record<string, number>, rawKey: unknown): void {
  const key = readString(rawKey) || "<missing>";
  map[key] = (map[key] ?? 0) + 1;
}

function readTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isStaleSendingRow(row: Record<string, unknown>, nowMs: number): boolean {
  const lastAttemptAt = readTimestamp(row.lastAttemptAt) ?? readTimestamp(row.updatedAt) ?? 0;
  return lastAttemptAt > 0 && nowMs - lastAttemptAt >= STALE_EMAIL_SENDING_MS;
}

function summarizeOutboxRow(row: Record<string, unknown>, nowMs: number) {
  const updatedAt = readTimestamp(row.updatedAt);
  const createdAt = readTimestamp(row.createdAt);
  const scheduledAt = readTimestamp(row.scheduledAt);
  return {
    id: String(row._id ?? ""),
    status: readString(row.status) || "unknown",
    kind: readString(row.kind) || "unknown",
    templateKey: readString(row.templateKey) || "unknown",
    failureReason: readString(row.failureReason) || null,
    attemptCount: typeof row.attemptCount === "number" ? row.attemptCount : 0,
    scheduledAt,
    updatedAt,
    createdAt,
    ageMs: createdAt ? Math.max(0, nowMs - createdAt) : null,
  };
}

function summarizeIdentity(identity: unknown) {
  const record = asRecord(identity);
  if (!record) {
    return {
      present: false,
      keyCount: 0,
      keys: [],
      hasSubject: false,
      hasIssuer: false,
      hasTokenIdentifier: false,
      hasEmail: false,
      emailVerificationClaimKeysPresent: [],
      emailVerifiedClaimValue: null,
    };
  }
  const keys = Object.keys(record).sort();
  const emailVerificationClaimKeysPresent = EMAIL_VERIFICATION_CLAIM_KEYS.filter((key) =>
    Object.prototype.hasOwnProperty.call(record, key),
  );
  const firstVerificationClaim = emailVerificationClaimKeysPresent
    .map((key) => readBoolean(record[key]))
    .find((value): value is boolean => typeof value === "boolean");
  return {
    present: true,
    keyCount: keys.length,
    keys,
    hasSubject: Boolean(readString(record.subject)),
    hasIssuer: Boolean(readString(record.issuer)),
    hasTokenIdentifier: Boolean(readString(record.tokenIdentifier)),
    hasEmail: Boolean(readString(record.email)),
    emailVerificationClaimKeysPresent,
    emailVerifiedClaimValue: firstVerificationClaim ?? null,
  };
}

export const getOperatorEmailAuthDiagnosticAggregateInternal = internalQuery({
  args: {
    authSubject: v.optional(v.string()),
    userSampleLimit: v.optional(v.number()),
    outboxPerStatusLimit: v.optional(v.number()),
    deliverySampleLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const userSampleLimit = Math.max(1, Math.min(500, Math.floor(args.userSampleLimit ?? 200)));
    const outboxPerStatusLimit = Math.max(1, Math.min(250, Math.floor(args.outboxPerStatusLimit ?? 100)));
    const deliverySampleLimit = Math.max(1, Math.min(250, Math.floor(args.deliverySampleLimit ?? 100)));

    const currentUser = args.authSubject
      ? await ctx.db
          .query("users")
          .withIndex("by_authSubject", (q: any) => q.eq("authSubject", args.authSubject))
          .first()
      : null;
    const users = await ctx.db.query("users").order("desc").take(userSampleLimit);
    const userVerificationSources: Record<string, number> = {};
    for (const user of users) {
      increment(userVerificationSources, user.emailVerificationSource);
    }

    const outboxByStatus: Record<string, number> = {};
    const outboxByKind: Record<string, number> = {};
    const outboxByTemplate: Record<string, number> = {};
    const outboxFailures: Record<string, number> = {};
    const recipientMode = { userId: 0, directEmail: 0 };
    const sampledOutboxRowsForRecent: Record<string, unknown>[] = [];
    let staleSending = 0;
    let sampledOutboxRows = 0;
    for (const status of EMAIL_OUTBOX_STATUSES) {
      const rows = await ctx.db
        .query("emailOutbox")
        .withIndex("by_status_scheduledAt", (q: any) => q.eq("status", status))
        .order("desc")
        .take(outboxPerStatusLimit);
      outboxByStatus[status] = rows.length;
      sampledOutboxRows += rows.length;
      sampledOutboxRowsForRecent.push(...rows);
      for (const row of rows) {
        increment(outboxByKind, row.kind);
        increment(outboxByTemplate, row.templateKey);
        if (row.failureReason) increment(outboxFailures, row.failureReason);
        if (status === "sending" && isStaleSendingRow(row, nowMs)) staleSending += 1;
        if (row.recipientUserId) {
          recipientMode.userId += 1;
        } else {
          recipientMode.directEmail += 1;
        }
      }
    }

    const pendingDueNow = await ctx.db
      .query("emailOutbox")
      .withIndex("by_status_scheduledAt", (q: any) => q.eq("status", "pending").lte("scheduledAt", nowMs))
      .take(250);
    const oldestPending = await ctx.db
      .query("emailOutbox")
      .withIndex("by_status_scheduledAt", (q: any) => q.eq("status", "pending"))
      .first();
    const recentOutboxRows = sampledOutboxRowsForRecent
      .sort((a, b) => Number(b.updatedAt ?? b.createdAt ?? 0) - Number(a.updatedAt ?? a.createdAt ?? 0))
      .slice(0, 12)
      .map((row) => summarizeOutboxRow(row, nowMs));
    const recentFailureRows = sampledOutboxRowsForRecent
      .filter((row) => readString(row.status) === "failed" || Boolean(readString(row.failureReason)))
      .sort((a, b) => Number(b.updatedAt ?? b.createdAt ?? 0) - Number(a.updatedAt ?? a.createdAt ?? 0))
      .slice(0, 8)
      .map((row) => summarizeOutboxRow(row, nowMs));

    const deliveries = await ctx.db.query("emailDeliveries").order("desc").take(deliverySampleLimit);
    const deliveriesByEvent: Record<string, number> = {};
    for (const delivery of deliveries) {
      increment(deliveriesByEvent, delivery.eventType);
    }
    const lastDelivery = deliveries[0] ?? null;

    return {
      computedAt: nowMs,
      currentUser: currentUser
        ? {
            rowPresent: true,
            hasEmail: Boolean(readString(currentUser.email)),
            emailVerifiedAtPresent: typeof currentUser.emailVerifiedAt === "number",
            emailVerificationSource: readString(currentUser.emailVerificationSource) || null,
          }
        : {
            rowPresent: false,
            hasEmail: false,
            emailVerifiedAtPresent: false,
            emailVerificationSource: null,
          },
      users: {
        sampled: users.length,
        withEmail: users.filter((user: any) => Boolean(readString(user.email))).length,
        withEmailVerifiedAt: users.filter((user: any) => typeof user.emailVerifiedAt === "number").length,
        byEmailVerificationSource: userVerificationSources,
      },
      outbox: {
        sampled: sampledOutboxRows,
        byStatus: outboxByStatus,
        byKind: outboxByKind,
        byTemplate: outboxByTemplate,
        failures: outboxFailures,
        recipientMode,
        pendingDueNow: pendingDueNow.length,
        pendingDueNowTruncated: pendingDueNow.length >= 250,
        staleSending,
        oldestPendingAt: readTimestamp(oldestPending?.scheduledAt),
        recentRows: recentOutboxRows,
        recentFailures: recentFailureRows,
      },
      deliveries: {
        sampled: deliveries.length,
        byEvent: deliveriesByEvent,
        withOutboxId: deliveries.filter((delivery: any) => Boolean(delivery.outboxId)).length,
        lastEventType: readString(lastDelivery?.eventType) || null,
        lastEventAt: readTimestamp(lastDelivery?.createdAt),
      },
      evidence: {
        sourceTables: ["users", "emailOutbox", "emailDeliveries"],
        userSampleLimit,
        outboxPerStatusLimit,
        deliverySampleLimit,
        redacted: true,
        readOnly: true,
      },
    };
  },
});

export const getOperatorEmailAuthDiagnostic = action({
  args: {
    authSubject: v.optional(v.string()),
    includeWorkosUserLookup: v.optional(v.boolean()),
    userSampleLimit: v.optional(v.number()),
    outboxPerStatusLimit: v.optional(v.number()),
    deliverySampleLimit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any> => {
    const operator = await ctx.runQuery((api as any).operatorDashboard.getOperatorAccess, {
      authSubject: args.authSubject,
    });
    if (!operator) throw new Error("operator_access_forbidden");

    const identity = await ctx.auth.getUserIdentity();
    const identityRecord = asRecord(identity);
    const authSubject = readString(identityRecord?.subject) || readString(args.authSubject) || null;
    const aggregate = await ctx.runQuery(
      (internal as any).emailDiagnostics.getOperatorEmailAuthDiagnosticAggregateInternal,
      {
        authSubject: authSubject ?? undefined,
        userSampleLimit: args.userSampleLimit,
        outboxPerStatusLimit: args.outboxPerStatusLimit,
        deliverySampleLimit: args.deliverySampleLimit,
      },
    );

    const workosUser = args.includeWorkosUserLookup
      ? redactWorkosUserVerificationLookup(await fetchWorkosUserVerification(authSubject))
      : {
          status: "skipped" as const,
          reason: "not_requested",
          apiKeyConfigured: isWorkosApiKeyConfigured(),
        };

    return {
      ok: true,
      computedAt: Date.now(),
      configuration: {
        resendApiKeyConfigured: hasAnyEnv(RESEND_API_KEY_ENV_KEYS),
        senderConfigured: hasAnyEnv(EMAIL_FROM_ENV_KEYS) || hasAnyEnv(EMAIL_FROM_DOMAIN_ENV_KEYS),
        webhookSecretConfigured: hasAnyEnv(RESEND_WEBHOOK_SECRET_ENV_KEYS),
      },
      operator: {
        role: operator.role,
        source: operator.source,
      },
      identity: summarizeIdentity(identity),
      workosUser,
      aggregate,
      evidence: {
        redacted: true,
        readOnly: true,
        mutatesUsers: false,
        mutatesEmailOutbox: false,
        workosLookupRequested: Boolean(args.includeWorkosUserLookup),
      },
    };
  },
});
