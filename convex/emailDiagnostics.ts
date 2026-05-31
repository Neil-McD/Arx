import { api, internal } from "./_generated/api";
import { action, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const EMAIL_OUTBOX_STATUSES = ["pending", "sending", "sent", "failed", "suppressed"] as const;
const WORKOS_USER_LOOKUP_TIMEOUT_MS = 4000;
const EMAIL_VERIFICATION_CLAIM_KEYS = [
  "email_verified",
  "emailVerified",
  "verified_email",
  "verifiedEmail",
] as const;

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // Convex environments may not expose process.env in every runtime.
  }
  return "";
}

function readFirstEnv(keys: readonly string[]): string {
  for (const key of keys) {
    const value = readEnv(key);
    if (value) return value;
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

async function fetchWorkosUserVerification(authSubject: string | null) {
  const apiKey = readFirstEnv(["ARX_WORKOS_API_KEY", "WORKOS_API_KEY"]);
  if (!authSubject) {
    return {
      status: "skipped" as const,
      reason: "auth_subject_missing",
      apiKeyConfigured: Boolean(apiKey),
    };
  }
  if (!apiKey) {
    return {
      status: "skipped" as const,
      reason: "workos_api_key_missing",
      apiKeyConfigured: false,
    };
  }

  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WORKOS_USER_LOOKUP_TIMEOUT_MS);
  try {
    response = await fetch(
      `https://api.workos.com/user_management/users/${encodeURIComponent(authSubject)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      },
    );
  } catch (error) {
    return {
      status: "error" as const,
      reason:
        error instanceof Error && error.name === "AbortError"
          ? "workos_user_fetch_timeout"
          : "workos_user_fetch_failed",
      apiKeyConfigured: true,
      timeoutMs: WORKOS_USER_LOOKUP_TIMEOUT_MS,
    };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return {
      status: response.status === 404 ? ("not_found" as const) : ("error" as const),
      reason: `workos_user_fetch_http_${response.status}`,
      apiKeyConfigured: true,
      httpStatus: response.status,
    };
  }

  const payload = asRecord(await response.json().catch(() => null));
  if (!payload) {
    return {
      status: "error" as const,
      reason: "workos_user_response_invalid",
      apiKeyConfigured: true,
      httpStatus: response.status,
    };
  }

  const responseUserId = readString(payload.id);
  const emailVerified = readBoolean(payload.email_verified) ?? readBoolean(payload.emailVerified);
  return {
    status: "ok" as const,
    apiKeyConfigured: true,
    httpStatus: response.status,
    subjectMatchedResponseId: responseUserId ? responseUserId === authSubject : null,
    hasEmail: Boolean(readString(payload.email)),
    emailVerified,
    profilePicturePresent: Boolean(
      readString(payload.profile_picture_url) || readString(payload.profilePictureUrl),
    ),
    updatedAtPresent: Boolean(readString(payload.updated_at) || readString(payload.updatedAt)),
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
    let sampledOutboxRows = 0;
    for (const status of EMAIL_OUTBOX_STATUSES) {
      const rows = await ctx.db
        .query("emailOutbox")
        .withIndex("by_status_scheduledAt", (q: any) => q.eq("status", status))
        .order("desc")
        .take(outboxPerStatusLimit);
      outboxByStatus[status] = rows.length;
      sampledOutboxRows += rows.length;
      for (const row of rows) {
        increment(outboxByKind, row.kind);
        increment(outboxByTemplate, row.templateKey);
        if (row.failureReason) increment(outboxFailures, row.failureReason);
        if (row.recipientUserId) {
          recipientMode.userId += 1;
        } else {
          recipientMode.directEmail += 1;
        }
      }
    }

    const deliveries = await ctx.db.query("emailDeliveries").order("desc").take(deliverySampleLimit);
    const deliveriesByEvent: Record<string, number> = {};
    for (const delivery of deliveries) {
      increment(deliveriesByEvent, delivery.eventType);
    }

    return {
      computedAt: Date.now(),
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
      },
      deliveries: {
        sampled: deliveries.length,
        byEvent: deliveriesByEvent,
        withOutboxId: deliveries.filter((delivery: any) => Boolean(delivery.outboxId)).length,
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
      ? await fetchWorkosUserVerification(authSubject)
      : {
          status: "skipped" as const,
          reason: "not_requested",
          apiKeyConfigured: Boolean(readFirstEnv(["ARX_WORKOS_API_KEY", "WORKOS_API_KEY"])),
        };

    return {
      ok: true,
      computedAt: Date.now(),
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
