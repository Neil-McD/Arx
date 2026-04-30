import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const CRITICAL_AUDIT_EVENT_TYPES = [
  "account_delete_blocked",
  "account_delete_completed",
  "builder_checkout_attached_to_stripe",
  "builder_checkout_created",
  "builder_entitlement_granted",
  "builder_entitlement_revoked",
  "builder_subscription_synced",
  "community_checkout_attached_to_stripe",
  "community_checkout_created",
  "community_purchase_claim_created",
  "community_purchase_claim_redeemed",
  "community_subscription_synced",
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

function cleanString(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
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
    metadata: input.metadata ?? undefined,
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
