import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const CRITICAL_AUDIT_EVENT_TYPES = [
  "account_delete_blocked",
  "account_delete_completed",
  "community_checkout_attached_to_stripe",
  "community_checkout_created",
  "community_archived",
  "community_archive_billing_cleanup_completed",
  "community_archive_billing_cleanup_failed",
  "community_restored",
  "community_purchase_claim_created",
  "community_purchase_claim_redeemed",
  "community_operator_retirement_completed",
  "community_subscription_synced",
  "harness_app_source_provenance_backfill",
  "operator_dashboard_accessed",
  "operator_role_deactivated",
  "operator_role_upserted",
  "stripe_connect_onboarding_failed",
  "stripe_connect_account_synced",
  "stripe_webhook_failed",
  "stripe_webhook_processed",
  "stripe_webhook_received",
] as const;

const SEVERITY_VALIDATOR = v.union(v.literal("info"), v.literal("warning"), v.literal("error"));
const STATUS_VALIDATOR = v.union(
  v.literal("started"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("blocked"),
  v.literal("ignored"),
);
const PROVIDER_VALIDATOR = v.union(v.literal("polynet"), v.literal("stripe"), v.literal("convex"));

type CriticalAuditEventInput = {
  eventKey: string;
  eventType: string;
  severity?: "info" | "warning" | "error";
  status: "started" | "succeeded" | "failed" | "blocked" | "ignored";
  actorUserId?: unknown;
  subjectUserId?: unknown;
  communityId?: unknown;
  checkoutSessionId?: string | null;
  provider?: "polynet" | "stripe" | "convex";
  providerObjectId?: string | null;
  metadata?: unknown;
  createdAt?: number;
};

type CriticalAuditMetadataValue = string | number | boolean;

const CRITICAL_AUDIT_METADATA_STRING_MAX_LENGTH = 300;

const CRITICAL_AUDIT_METADATA_BLOCKED_KEY_PARTS = [
  "token",
  "secret",
  "password",
  "cookie",
  "authorization",
  "bearer",
  "session",
  "api_key",
  "apikey",
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "id_token",
  "idtoken",
  "encrypted",
  "payload",
  "body",
  "raw",
  "community_builder_access_freed",
];

const CRITICAL_AUDIT_METADATA_ALLOWLIST: Record<string, readonly string[]> = {
  account_delete_blocked: ["reason"],
  account_delete_completed: [],
  community_archived: ["lifecycleGeneration"],
  community_archive_billing_cleanup_completed: [
    "lifecycleGeneration",
    "attemptCount",
  ],
  community_archive_billing_cleanup_failed: [
    "lifecycleGeneration",
    "attemptCount",
    "errorCode",
  ],
  community_restored: ["lifecycleGeneration"],
  community_checkout_created: [
    "billingPeriod",
    "pricePointId",
    "amountBaseUnits",
    "currency",
    "currencyDecimals",
    "providerAccountId",
    "expiresAt",
  ],
  community_checkout_attached_to_stripe: ["providerAccountId", "providerCustomerId", "providerSubscriptionId", "providerPriceId"],
  community_purchase_claim_created: ["billingPeriod", "pricePointId", "amountBaseUnits", "currency"],
  community_purchase_claim_redeemed: ["accessGranted", "grantMarker", "pricePointId"],
  community_operator_retirement_completed: [
    "policyVersion",
    "communitySlug",
    "deletedProductRowCount",
    "deletedCanonicalControlRowCount",
    "deletedStorageObjectCount",
    "detachedAgentChannelCount",
    "preservedFinancialRowCount",
  ],
  community_subscription_synced: [
    "membershipId",
    "pricePointId",
    "communitySubscriptionStatus",
    "subscriptionStatus",
    "source",
    "cancelAtPeriodEnd",
    "markComplete",
    "providerAccountId",
    "providerPriceId",
    "currentPeriodStartAt",
    "currentPeriodEndAt",
  ],
  operator_dashboard_accessed: ["surface", "role", "source", "error"],
  operator_role_deactivated: ["previousRole"],
  operator_role_upserted: ["role", "active"],
  stripe_connect_onboarding_failed: [
    "context",
    "communitySlug",
    "country",
    "stage",
    "stripeAccountId",
    "stripeErrorType",
    "stripeErrorCode",
    "stripeRequestId",
    "stripeStatusCode",
    "errorMessage",
  ],
  stripe_connect_account_synced: [
    "connectStatus",
    "country",
    "serviceAgreement",
    "transfersEnabled",
    "chargesEnabled",
    "payoutsEnabled",
    "detailsSubmitted",
  ],
  stripe_webhook_failed: ["stripeEventType", "stripeEventId", "stripeAccountId", "webhookScope", "requestPath", "errorMessage"],
  stripe_webhook_processed: ["stripeEventType", "stripeEventId", "stripeAccountId", "webhookScope"],
  stripe_webhook_received: ["stripeEventType", "stripeEventId", "stripeAccountId", "webhookScope"],
};

function cleanString(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function normalizeMetadataKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function criticalAuditMetadataKeyLooksSensitive(key: string): boolean {
  const normalizedKey = normalizeMetadataKey(key);
  return CRITICAL_AUDIT_METADATA_BLOCKED_KEY_PARTS.some((part) =>
    normalizedKey.includes(normalizeMetadataKey(part)),
  );
}

function sanitizeCriticalAuditMetadataValue(value: unknown): CriticalAuditMetadataValue | undefined {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized
      ? normalized.slice(0, CRITICAL_AUDIT_METADATA_STRING_MAX_LENGTH)
      : undefined;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;
  return undefined;
}

export function sanitizeCriticalAuditMetadata(
  eventType: string,
  metadata: unknown,
): Record<string, CriticalAuditMetadataValue> | undefined {
  const allowedKeys = CRITICAL_AUDIT_METADATA_ALLOWLIST[eventType] ?? [];
  if (
    allowedKeys.length === 0 ||
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    return undefined;
  }

  const input = metadata as Record<string, unknown>;
  const sanitized: Record<string, CriticalAuditMetadataValue> = {};
  for (const key of allowedKeys) {
    if (criticalAuditMetadataKeyLooksSensitive(key)) continue;
    const safeValue = sanitizeCriticalAuditMetadataValue(input[key]);
    if (safeValue !== undefined) sanitized[key] = safeValue;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export async function recordCriticalAuditEvent(ctx: any, input: CriticalAuditEventInput) {
  const eventKey = cleanString(input.eventKey);
  const eventType = cleanString(input.eventType);
  if (!eventKey || !eventType) return null;

  const existing = await ctx.db
    .query("criticalAuditEvents")
    .withIndex("by_eventKey", (q: any) => q.eq("eventKey", eventKey))
    .first();
  if (existing) return existing._id;

  return await ctx.db.insert("criticalAuditEvents", {
    eventKey,
    eventType,
    severity: input.severity ?? "info",
    status: input.status,
    actorUserId: input.actorUserId || undefined,
    subjectUserId: input.subjectUserId || undefined,
    communityId: input.communityId || undefined,
    checkoutSessionId: cleanString(input.checkoutSessionId),
    provider: input.provider ?? "polynet",
    providerObjectId: cleanString(input.providerObjectId),
    metadata: sanitizeCriticalAuditMetadata(eventType, input.metadata),
    createdAt:
      typeof input.createdAt === "number" && Number.isFinite(input.createdAt)
        ? input.createdAt
        : Date.now(),
  });
}

export async function recordCriticalAuditEventBestEffort(
  ctx: any,
  input: CriticalAuditEventInput,
): Promise<void> {
  try {
    await recordCriticalAuditEvent(ctx, input);
  } catch (error) {
    console.error("critical_audit_event_record_failed", {
      eventType: input.eventType,
      eventKey: input.eventKey,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const recordCriticalAuditEventInternal = internalMutation({
  args: {
    eventKey: v.string(),
    eventType: v.string(),
    severity: v.optional(SEVERITY_VALIDATOR),
    status: STATUS_VALIDATOR,
    actorUserId: v.optional(v.id("users")),
    subjectUserId: v.optional(v.id("users")),
    communityId: v.optional(v.id("communities")),
    checkoutSessionId: v.optional(v.union(v.string(), v.null())),
    provider: v.optional(PROVIDER_VALIDATOR),
    providerObjectId: v.optional(v.union(v.string(), v.null())),
    metadata: v.optional(v.any()),
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => recordCriticalAuditEvent(ctx, args),
});

export const listCriticalAuditEventsInternal = internalQuery({
  args: {
    eventType: v.optional(v.string()),
    severity: v.optional(SEVERITY_VALIDATOR),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(100, Math.max(1, Math.floor(args.limit ?? 50)));
    if (args.eventType) {
      const rows = await ctx.db
        .query("criticalAuditEvents")
        .withIndex("by_type_createdAt", (q) => q.eq("eventType", args.eventType as string))
        .order("desc")
        .take(limit);
      return rows;
    }
    if (args.severity) {
      const rows = await ctx.db
        .query("criticalAuditEvents")
        .withIndex("by_severity_createdAt", (q) => q.eq("severity", args.severity as any))
        .order("desc")
        .take(limit);
      return rows;
    }
    const rows = await ctx.db.query("criticalAuditEvents").order("desc").take(limit);
    return rows;
  },
});
