import { internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { sanitizeCriticalAuditMetadata } from "./criticalAudit";
import {
  resolveDiscoverAppCatalogConnectPolicy,
} from "../shared/discoverCatalog";
import type { DeveloperAppAuthType } from "../shared/communityAppMountTypes";

type MoneyMetric = {
  currency: string;
  amountBaseUnits: number;
  currencyDecimals: number;
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "past_due", "cancel_at_period_end"]);
const CHECKOUT_STATUSES = ["pending", "complete", "expired"] as const;
const SECURITY_AUDIT_EVENT_TYPES = [
  "account_delete_blocked",
  "account_delete_completed",
  "builder_entitlement_granted",
  "builder_entitlement_revoked",
  "builder_subscription_synced",
  "community_subscription_synced",
  "operator_dashboard_accessed",
  "operator_role_deactivated",
  "operator_role_upserted",
  "stripe_connect_account_synced",
  "stripe_webhook_failed",
  "stripe_webhook_processed",
  "stripe_webhook_received",
] as const;
const SECURITY_AUDIT_EVENT_TYPE_SET = new Set<string>(SECURITY_AUDIT_EVENT_TYPES);
const WEBHOOK_FAILURE_AUDIT_EVENT_TYPES = new Set(["stripe_webhook_failed"]);
const DESTRUCTIVE_AUDIT_EVENT_TYPES = new Set([
  "account_delete_blocked",
  "account_delete_completed",
  "operator_role_deactivated",
]);
const OPERATOR_ROLE_AUDIT_EVENT_TYPES = new Set(["operator_role_deactivated", "operator_role_upserted"]);
const BILLING_TRUST_AUDIT_EVENT_TYPES = new Set([
  "builder_entitlement_granted",
  "builder_entitlement_revoked",
  "builder_subscription_synced",
  "community_subscription_synced",
  "stripe_connect_account_synced",
  "stripe_webhook_failed",
]);
const RUNTIME_RUN_STATUSES = ["running", "ok", "error", "cancelled"] as const;
const RUNTIME_TOOL_EVENT_TYPES = [
  "tool_call_started",
  "tool_call_finished",
  "runtime_diagnostics_detected",
  "workspace_session_create_completed",
] as const;
const PAID_TOOL_LEDGER_NAMES = ["daytona_workspace", "web_research", "voice_transcribe"] as const;
const WEB_DEPLOY_FRONTEND_CRASH_EVENT_TYPES = new Set([
  "deploy.frontend_crash",
  "deploy.route_load_failed",
]);
const WEB_DEPLOY_MODULE_LOAD_EVENT_TYPES = new Set([
  "deploy.module_load_recovery",
  "deploy.stale_asset_recovered",
]);
type DiagnosticSubsystem =
  | "auth"
  | "access"
  | "security"
  | "billing"
  | "runtime"
  | "mcp"
  | "tool"
  | "community"
  | "funnel"
  | "deploy"
  | "diagnostics";

type DeveloperAppPolicyAuditFinding = {
  developerAppId: string;
  ownerUserId: string;
  name: string;
  catalogAppId: string | null;
  endpointUrl: string;
  authType: string;
  status: string;
  lastValidatedAt: number | null;
  lastValidationError: string | null;
  userMountCount: number;
  communityMountCount: number;
  policyStatus: "blocked";
  policyCode: string;
  policyMessage: string;
  recommendedAction: "delete_or_migrate";
  updatedAt: number;
};

function normalizeLimit(value: number | undefined, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value)));
}

function normalizeCatalogAppIdForAudit(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized || null;
}

function normalizeRangeStart(range: string | undefined, nowMs: number): number | null {
  switch (range) {
    case "7d":
      return nowMs - 7 * 86400000;
    case "30d":
      return nowMs - 30 * 86400000;
    case "90d":
      return nowMs - 90 * 86400000;
    case "all":
    default:
      return null;
  }
}

function moneyFromPrice(price: any): MoneyMetric | null {
  if (!price) return null;
  return {
    currency: String(price.currency ?? "usd").toLowerCase(),
    amountBaseUnits: Number(price.amountBaseUnits ?? 0),
    currencyDecimals: Number(price.currencyDecimals ?? 2),
  };
}

function monthlyMoneyFromPricePoint(price: any): MoneyMetric | null {
  const metric = moneyFromPrice(price);
  if (!metric) return null;
  const billingPeriod = String(price?.billingPeriod ?? "monthly").toLowerCase();
  if (billingPeriod !== "annual") return metric;
  return {
    ...metric,
    amountBaseUnits: metric.amountBaseUnits / 12,
  };
}

function addMoney(a: MoneyMetric | null, b: MoneyMetric | null): MoneyMetric | null {
  if (!a) return b;
  if (!b) return a;
  if (a.currency !== b.currency || a.currencyDecimals !== b.currencyDecimals) return a;
  return {
    currency: a.currency,
    currencyDecimals: a.currencyDecimals,
    amountBaseUnits: a.amountBaseUnits + b.amountBaseUnits,
  };
}

function mapEvent(row: any) {
  const eventType = String(row.eventType ?? "");
  return {
    id: String(row._id),
    eventKey: String(row.eventKey ?? ""),
    eventType,
    severity: row.severity ?? "info",
    status: row.status ?? "started",
    actorUserId: row.actorUserId ? String(row.actorUserId) : null,
    subjectUserId: row.subjectUserId ? String(row.subjectUserId) : null,
    communityId: row.communityId ? String(row.communityId) : null,
    checkoutSessionId: row.checkoutSessionId ?? null,
    provider: row.provider ?? "polynet",
    providerObjectId: row.providerObjectId ?? null,
    metadata: sanitizeCriticalAuditMetadata(eventType, row.metadata) ?? null,
    createdAt: row.createdAt,
  };
}

function mapDiagnosticEvent(row: any) {
  return {
    id: String(row._id),
    eventKey: String(row.eventKey ?? ""),
    eventType: String(row.eventType ?? ""),
    subsystem: row.subsystem ?? "diagnostics",
    severity: row.severity ?? "info",
    status: row.status ?? "started",
    surface: row.surface ?? null,
    userId: row.userId ? String(row.userId) : null,
    communityId: row.communityId ? String(row.communityId) : null,
    projectId: row.projectId ? String(row.projectId) : null,
    threadId: row.threadId ? String(row.threadId) : null,
    runId: row.runId ?? null,
    requestId: row.requestId ?? null,
    release: row.release ?? null,
    latencyMs: typeof row.latencyMs === "number" ? row.latencyMs : null,
    errorCode: row.errorCode ?? null,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
  };
}

async function readDiagnosticEventsBySubsystem(
  ctx: any,
  subsystem: DiagnosticSubsystem,
  rangeStart: number | null,
  limit: number,
) {
  const query = ctx.db.query("platformDiagnosticEvents").withIndex("by_subsystem_createdAt", (q: any) => {
    const scoped = q.eq("subsystem", subsystem);
    return rangeStart == null ? scoped : scoped.gte("createdAt", rangeStart);
  });
  return await query.order("desc").take(limit);
}

async function readRuntimeRunsByStatus(
  ctx: any,
  status: (typeof RUNTIME_RUN_STATUSES)[number],
  rangeStart: number | null,
  limit: number,
) {
  const query = ctx.db.query("runtimeRuns").withIndex("by_status_startedAt", (q: any) => {
    const scoped = q.eq("status", status);
    return rangeStart == null ? scoped : scoped.gte("startedAt", rangeStart);
  });
  return await query.order("desc").take(limit);
}

async function readRuntimeEventsByType(
  ctx: any,
  eventType: string,
  rangeStart: number | null,
  limit: number,
) {
  const query = ctx.db.query("runtimeRunEvents").withIndex("by_eventType_createdAt", (q: any) => {
    const scoped = q.eq("eventType", eventType);
    return rangeStart == null ? scoped : scoped.gte("createdAt", rangeStart);
  });
  return await query.order("desc").take(limit);
}

async function readCreditLedgerEntriesByTool(
  ctx: any,
  toolName: string,
  rangeStart: number | null,
  limit: number,
) {
  const query = ctx.db.query("creditLedgerEntries").withIndex("by_tool_createdAt", (q: any) => {
    const scoped = q.eq("toolName", toolName);
    return rangeStart == null ? scoped : scoped.gte("createdAt", rangeStart);
  });
  return await query.order("desc").take(limit);
}

async function readWorkspaceComputeChargesByDebitSource(
  ctx: any,
  debitSource: "included" | "purchased" | "mixed" | "unbilled",
  rangeStart: number | null,
  limit: number,
) {
  const query = ctx.db.query("workspaceComputeCharges").withIndex("by_debitSource_createdAt", (q: any) => {
    const scoped = q.eq("debitSource", debitSource);
    return rangeStart == null ? scoped : scoped.gte("createdAt", rangeStart);
  });
  return await query.order("desc").take(limit);
}

function readPayloadRecord(row: any): Record<string, unknown> {
  const payload = row?.payload;
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function normalizeOperatorKey(value: unknown, fallback: string): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || fallback;
}

function normalizeRuntimeFailureCode(value: unknown): string {
  const normalized = normalizeOperatorKey(value, "unknown_runtime_error");
  if (normalized === "credits_exhausted" || normalized === "workspace_credits_exhausted") {
    return "workspace_credits_exhausted";
  }
  if (normalized === "credits_unavailable" || normalized === "workspace_credits_unavailable") {
    return "workspace_credits_unavailable";
  }
  if (normalized.includes("rate_limit") || normalized.includes("rate_limited") || normalized === "too_many_requests") {
    return "provider_rate_limited";
  }
  if (normalized.includes("provider") || normalized.includes("model_")) {
    return "provider_failed";
  }
  if (normalized.includes("sandbox") || normalized.includes("workspace_session_create")) {
    return "sandbox_create_failed";
  }
  if (normalized.includes("timeout") || normalized.includes("timed_out")) {
    return "runtime_timeout";
  }
  return normalized;
}

function readToolFailureCode(row: any): string {
  const payload = readPayloadRecord(row);
  const failureSemantics =
    payload.failure_semantics && typeof payload.failure_semantics === "object" && !Array.isArray(payload.failure_semantics)
      ? (payload.failure_semantics as Record<string, unknown>)
      : null;
  return normalizeRuntimeFailureCode(
    payload.error_code ??
      payload.errorCode ??
      failureSemantics?.kind ??
      payload.code ??
      "tool_call_failed",
  );
}

function readToolName(row: any): string {
  const payload = readPayloadRecord(row);
  return normalizeOperatorKey(payload.tool_name ?? payload.toolName, "unknown_tool");
}

function readRowCreatedAt(row: any): number {
  const value = Number(row?.createdAt ?? row?.startedAt ?? row?.updatedAt ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function isToolFailureRow(row: any): boolean {
  const payload = readPayloadRecord(row);
  const status = normalizeOperatorKey(payload.status, "");
  return (
    status === "error" ||
    status === "failed" ||
    payload.success === false ||
    Boolean(payload.error_code || payload.errorCode || payload.failure_semantics)
  );
}

function formatOperatorBucketLabel(key: string): string {
  switch (key) {
    case "workspace_credits_exhausted":
      return "Tool balance exhausted";
    case "workspace_credits_unavailable":
      return "Tool balance unavailable";
    case "provider_failed":
      return "Provider failed";
    case "provider_rate_limited":
      return "Provider rate-limited";
    case "sandbox_create_failed":
      return "Sandbox create failed";
    case "runtime_timeout":
      return "Runtime timeout";
    case "tool_call_failed":
      return "Tool call failed";
    case "unknown_runtime_error":
      return "Unknown runtime error";
    default:
      return key
        .split(/[._:-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function buildRuntimeBucket(
  rows: any[],
  readKey: (row: any) => string,
  options?: { errorKeys?: Set<string> },
) {
  const buckets = new Map<
    string,
    { key: string; label: string; count: number; latestAt: number | null; severity: "warning" | "error" }
  >();
  for (const row of rows) {
    const key = normalizeOperatorKey(readKey(row), "unknown_runtime_error");
    const latestAt = readRowCreatedAt(row);
    const current =
      buckets.get(key) ??
      {
        key,
        label: formatOperatorBucketLabel(key),
        count: 0,
        latestAt: null,
        severity: options?.errorKeys?.has(key) ? "error" : "warning",
      };
    current.count += 1;
    current.latestAt = Math.max(current.latestAt ?? 0, latestAt) || current.latestAt;
    if (options?.errorKeys?.has(key)) current.severity = "error";
    buckets.set(key, current);
  }
  return [...buckets.values()]
    .sort((a, b) => b.count - a.count || Number(b.latestAt ?? 0) - Number(a.latestAt ?? 0))
    .slice(0, 8);
}

async function readCriticalAuditEventsByType(
  ctx: any,
  eventType: string,
  rangeStart: number | null,
  limit: number,
) {
  const query = ctx.db.query("criticalAuditEvents").withIndex("by_type_createdAt", (q: any) => {
    const scoped = q.eq("eventType", eventType);
    return rangeStart == null ? scoped : scoped.gte("createdAt", rangeStart);
  });
  return await query.order("desc").take(limit);
}

async function readCriticalAuditEventsBySeverity(
  ctx: any,
  severity: "warning" | "error",
  rangeStart: number | null,
  limit: number,
) {
  const query = ctx.db.query("criticalAuditEvents").withIndex("by_severity_createdAt", (q: any) => {
    const scoped = q.eq("severity", severity);
    return rangeStart == null ? scoped : scoped.gte("createdAt", rangeStart);
  });
  return await query.order("desc").take(limit);
}

function dedupeAuditRows(rows: any[]): any[] {
  const seen = new Set<string>();
  const deduped: any[] = [];
  for (const row of rows) {
    const id = String(row._id);
    if (seen.has(id)) continue;
    seen.add(id);
    deduped.push(row);
  }
  return deduped.sort((a: any, b: any) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0));
}

function formatSecurityAuditTitle(row: any): string {
  switch (String(row.eventType ?? "")) {
    case "account_delete_blocked":
      return "Account deletion blocked";
    case "account_delete_completed":
      return "Account deleted";
    case "operator_dashboard_accessed":
      return row.status === "blocked" ? "Operator access blocked" : "Operator dashboard accessed";
    case "operator_role_deactivated":
      return "Operator role deactivated";
    case "operator_role_upserted":
      return "Operator role changed";
    case "stripe_webhook_failed":
      return "Stripe webhook failed";
    case "stripe_webhook_processed":
      return "Stripe webhook processed";
    case "stripe_webhook_received":
      return "Stripe webhook received";
    case "stripe_connect_account_synced":
      return "Stripe Connect account synced";
    case "builder_entitlement_granted":
      return "Builder entitlement granted";
    case "builder_entitlement_revoked":
      return "Builder entitlement revoked";
    case "builder_subscription_synced":
      return "Builder subscription synced";
    case "community_subscription_synced":
      return "Community subscription synced";
    default:
      return String(row.eventType ?? "Audit event")
        .split(/[._:-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function mapSecurityAuditAttentionItem(row: any) {
  const eventType = String(row.eventType ?? "");
  const isError = row.severity === "error" || row.status === "failed" || WEBHOOK_FAILURE_AUDIT_EVENT_TYPES.has(eventType);
  return {
    id: `critical-audit:${String(row._id)}`,
    severity: isError ? "error" : "warning",
    title: formatSecurityAuditTitle(row),
    eventType,
    status: row.status ?? "started",
    eventId: String(row._id),
    actorUserId: row.actorUserId ? String(row.actorUserId) : null,
    subjectUserId: row.subjectUserId ? String(row.subjectUserId) : null,
    communityId: row.communityId ? String(row.communityId) : null,
    createdAt: row.createdAt,
    evidence: {
      sourceTables: ["criticalAuditEvents"],
    },
  };
}

async function readActiveTier(ctx: any, userId: any, nowMs: number): Promise<"free" | "builder" | "architect" | "unknown"> {
  const rows = await ctx.db
    .query("userEntitlements")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  let tier: "free" | "builder" | "architect" | "unknown" = "unknown";
  for (const row of rows) {
    if (row.startsAt > nowMs) continue;
    if (typeof row.endsAt === "number" && row.endsAt <= nowMs) continue;
    if (row.tier === "architect") return "architect";
    if (row.tier === "builder") tier = "builder";
    if (row.tier === "free" && tier === "unknown") tier = "free";
  }
  return tier;
}

async function readPayoutStatus(ctx: any, userId: any) {
  const row = await ctx.db
    .query("userStripeConnectAccounts")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
  return row?.status ?? "not_connected";
}

async function readCommunitySubscriptionsByStatuses(ctx: any, communityId: any, statuses: Set<string>) {
  const rows = [];
  for (const status of statuses) {
    const statusRows = await ctx.db
      .query("communitySubscriptions")
      .withIndex("by_community_status", (q: any) => q.eq("communityId", communityId).eq("status", status))
      .collect();
    rows.push(...statusRows);
  }
  return rows;
}

async function readCheckoutSessionsByCommunity(ctx: any, communityId: any) {
  const rows = [];
  for (const status of CHECKOUT_STATUSES) {
    const statusRows = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_community_status", (q: any) => q.eq("communityId", communityId).eq("status", status))
      .collect();
    rows.push(...statusRows);
  }
  return rows;
}

async function estimateSubscriptionMrr(ctx: any, subscriptions: any[]): Promise<MoneyMetric | null> {
  let total: MoneyMetric | null = null;
  for (const subscription of subscriptions) {
    const pricePoint = await ctx.db.get(subscription.pricePointId);
    total = addMoney(total, monthlyMoneyFromPricePoint(pricePoint));
  }
  return total;
}

async function buildBuilderRecord(ctx: any, community: any, nowMs: number) {
  const owner = await ctx.db.get(community.ownerId);
  const memberships = await ctx.db
    .query("communityMemberships")
    .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
    .collect();
  const activeMemberships = memberships.filter((row: any) => row.active !== false && !row.revokedAt);
  const removedMemberships = memberships.filter((row: any) => row.active === false || Boolean(row.revokedAt));
  const price = await ctx.db
    .query("communityPricePoints")
    .withIndex("by_community_current", (q: any) => q.eq("communityId", community._id).eq("isCurrent", true))
    .first();
  const revenueSubscriptions = await readCommunitySubscriptionsByStatuses(ctx, community._id, ACTIVE_SUBSCRIPTION_STATUSES);
  const activePaidMembers = revenueSubscriptions.length;
  const checkouts = await readCheckoutSessionsByCommunity(ctx, community._id);
  const pendingCheckouts = checkouts.filter((row: any) => row.status === "pending");
  const completedCheckouts = checkouts.filter((row: any) => row.status === "complete");
  const currentPrice = moneyFromPrice(price);
  const estimatedMrr = await estimateSubscriptionMrr(ctx, revenueSubscriptions);
  const riskFlags: string[] = [];
  if (community.entryPolicy === "paid_subscription" && activePaidMembers === 0) {
    riskFlags.push("paid_enabled_no_sales");
  }
  const payoutStatus = await readPayoutStatus(ctx, community.ownerId);
  if (community.entryPolicy === "paid_subscription" && payoutStatus !== "ready") {
    riskFlags.push("payout_not_ready");
  }
  if (pendingCheckouts.length > completedCheckouts.length && pendingCheckouts.length >= 3) {
    riskFlags.push("checkout_abandonment");
  }

  const tier = await readActiveTier(ctx, community.ownerId, nowMs);
  const checkoutStarts = checkouts.length;
  return {
    builder: {
      userId: String(community.ownerId),
      displayName: owner?.displayName ?? null,
      email: owner?.email ?? null,
      avatarUrl: owner?.avatarUrl ?? null,
      tier,
      payoutStatus,
    },
    community: {
      communityId: String(community._id),
      slug: community.slug,
      name: community.name,
      visibility: community.visibility,
      entryPolicy: community.entryPolicy ?? "open",
      createdAt: community.createdAt,
      updatedAt: community.updatedAt,
    },
    money: {
      currentPrice,
      activePaidMembers,
      estimatedMrr,
      checkoutStarts,
      checkoutCompletions: completedCheckouts.length,
      checkoutConversionRate: checkoutStarts > 0 ? completedCheckouts.length / checkoutStarts : null,
    },
    members: {
      totalMembers: activeMemberships.length,
      activeMemberships: activeMemberships.length,
      removedMembers: removedMemberships.length,
    },
    activity: {
      lastMemberActivityAt: activeMemberships.reduce((latest: number | null, row: any) => {
        const updatedAt = typeof row.updatedAt === "number" ? row.updatedAt : null;
        if (updatedAt == null) return latest;
        return latest == null ? updatedAt : Math.max(latest, updatedAt);
      }, null),
    },
    risk: {
      flags: riskFlags,
      severity: riskFlags.length > 0 ? "warning" : "none",
    },
    evidence: {
      sourceTables: [
        "users",
        "userEntitlements",
        "userStripeConnectAccounts",
        "communities",
        "communityMemberships",
        "communityPricePoints",
        "communitySubscriptions",
        "checkoutSessions",
      ],
      eventIds: [],
      computedAt: nowMs,
    },
  };
}

export const listOperatorBuildersInternal = internalQuery({
  args: {
    query: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const limit = normalizeLimit(args.limit, 50, 200);
    const rows = await ctx.db.query("communities").collect();
    const records = [];
    const normalizedQuery = String(args.query ?? "").trim().toLowerCase();
    for (const community of rows) {
      const record = await buildBuilderRecord(ctx, community, nowMs);
      if (normalizedQuery) {
        const haystack = [
          record.builder.displayName,
          record.builder.email,
          record.community.name,
          record.community.slug,
        ].join(" ").toLowerCase();
        if (!haystack.includes(normalizedQuery)) continue;
      }
      records.push(record);
    }
    return records.slice(0, limit);
  },
});

export const listOperatorDeveloperAppPolicyAuditInternal = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = normalizeLimit(args.limit, 100, 500);
    const apps = (await ctx.db.query("developerApps").collect()) as any[];
    const summary = {
      totalApps: apps.length,
      catalogedApps: 0,
      uncatalogedApps: 0,
      policyOkApps: 0,
      policyBlockedApps: 0,
    };
    const findings: DeveloperAppPolicyAuditFinding[] = [];

    for (const app of apps) {
      const catalogAppId = normalizeCatalogAppIdForAudit(app.catalogAppId);
      if (catalogAppId) {
        summary.catalogedApps += 1;
      } else {
        summary.uncatalogedApps += 1;
      }
      const policy = resolveDiscoverAppCatalogConnectPolicy({
        catalogAppId: catalogAppId ?? undefined,
        name: app.name,
        endpointUrl: app.endpointUrl,
        authType: app.authType as DeveloperAppAuthType,
      });
      if (policy.ok) {
        summary.policyOkApps += 1;
        continue;
      }

      summary.policyBlockedApps += 1;
      const userMountRows = (await ctx.db
        .query("userPlatformAppMounts")
        .withIndex("by_app", (q: any) => q.eq("developerAppId", app._id))
        .collect()) as any[];
      const communityMountRows = (await ctx.db
        .query("communityAppMounts")
        .withIndex("by_app", (q: any) => q.eq("developerAppId", app._id))
        .collect()) as any[];
      findings.push({
        developerAppId: String(app._id),
        ownerUserId: String(app.ownerUserId),
        name: String(app.name ?? ""),
        catalogAppId,
        endpointUrl: String(app.endpointUrl ?? ""),
        authType: String(app.authType ?? ""),
        status: String(app.status ?? ""),
        lastValidatedAt:
          typeof app.lastValidatedAt === "number" ? app.lastValidatedAt : null,
        lastValidationError:
          typeof app.lastValidationError === "string"
            ? app.lastValidationError
            : null,
        userMountCount: userMountRows.length,
        communityMountCount: communityMountRows.length,
        policyStatus: "blocked",
        policyCode: policy.code,
        policyMessage: policy.message,
        recommendedAction: "delete_or_migrate",
        updatedAt: Number(app.updatedAt ?? 0),
      });
    }

    findings.sort(
      (left, right) =>
        right.userMountCount +
          right.communityMountCount -
          (left.userMountCount + left.communityMountCount) ||
        right.updatedAt - left.updatedAt,
    );
    return {
      summary,
      findings: findings.slice(0, limit),
      truncated: findings.length > limit,
      computedAt: Date.now(),
    };
  },
});

export const getOperatorBuilderSnapshotInternal = internalQuery({
  args: {
    communityId: v.optional(v.id("communities")),
    builderUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    let community = args.communityId ? await ctx.db.get(args.communityId) : null;
    if (!community && args.builderUserId) {
      community = await ctx.db
        .query("communities")
        .withIndex("by_owner", (q: any) => q.eq("ownerId", args.builderUserId))
        .first();
    }
    if (!community) return null;
    return await buildBuilderRecord(ctx, community, Date.now());
  },
});

export const getOperatorOverviewInternal = internalQuery({
  args: {
    range: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("all"))),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const rangeStart = normalizeRangeStart(args.range, nowMs);
    const communities = await ctx.db.query("communities").collect();
    let estimatedMrr: MoneyMetric | null = null;
    let activePaidMembers = 0;
    let paidCommunities = 0;
    let riskItems = 0;
    for (const community of communities) {
      const record = await buildBuilderRecord(ctx, community, nowMs);
      activePaidMembers += record.money.activePaidMembers;
      if (record.money.activePaidMembers > 0) paidCommunities += 1;
      estimatedMrr = addMoney(estimatedMrr, record.money.estimatedMrr);
      if (record.risk.flags.length > 0) riskItems += record.risk.flags.length;
    }
    const events = await ctx.db.query("criticalAuditEvents").collect();
    const recentCriticalEvents = rangeStart == null
      ? events.length
      : events.filter((row: any) => row.createdAt >= rangeStart).length;
    return {
      computedAt: nowMs,
      totals: {
        builders: new Set(communities.map((row: any) => String(row.ownerId))).size,
        communities: communities.length,
        paidCommunities,
        activePaidMembers,
        estimatedMrr,
        riskItems,
        recentCriticalEvents,
      },
      evidence: {
        sourceTables: [
          "communities",
          "communityMemberships",
          "communityPricePoints",
          "communitySubscriptions",
          "checkoutSessions",
          "criticalAuditEvents",
        ],
      },
    };
  },
});

export const getOperatorWebDeployDiagnosticsInternal = internalQuery({
  args: {
    range: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("all"))),
  },
  handler: async (ctx, args): Promise<any> => {
    const nowMs = Date.now();
    const range = args.range ?? "30d";
    const rangeStart = normalizeRangeStart(range, nowMs);
    const scannedEventLimit = 300;
    const deployRows = await readDiagnosticEventsBySubsystem(ctx, "deploy", rangeStart, scannedEventLimit);
    const warningRows = deployRows.filter((row: any) => row.severity === "warning");
    const errorRows = deployRows.filter((row: any) => row.severity === "error" || row.status === "failed");
    const frontendCrashEvents = deployRows.filter((row: any) =>
      WEB_DEPLOY_FRONTEND_CRASH_EVENT_TYPES.has(String(row.eventType ?? "")),
    );
    const moduleLoadRecoveries = deployRows.filter((row: any) =>
      WEB_DEPLOY_MODULE_LOAD_EVENT_TYPES.has(String(row.eventType ?? "")),
    );
    const staleBuildWarnings = deployRows.filter((row: any) => {
      const eventType = String(row.eventType ?? "").toLowerCase();
      const errorCode = String(row.errorCode ?? "").toLowerCase();
      return eventType.includes("stale") || errorCode.includes("stale");
    });
    const health: "healthy" | "degraded" | "incident" =
      errorRows.length > 0 || frontendCrashEvents.length > 0
        ? "incident"
        : warningRows.length > 0 || moduleLoadRecoveries.length > 0 || staleBuildWarnings.length > 0
          ? "degraded"
          : "healthy";

    return {
      computedAt: nowMs,
      range,
      health,
      currentBuild: {
        buildId: null,
        source: "unknown",
        checkedAt: null,
      },
      totals: {
        deployEvents: deployRows.length,
        warnings: warningRows.length,
        errors: errorRows.length,
        routeChecks: 0,
        routeFailures: 0,
        frontendCrashEvents: frontendCrashEvents.length,
        moduleLoadRecoveries: moduleLoadRecoveries.length,
        staleBuildWarnings: staleBuildWarnings.length,
      },
      routeChecks: [],
      latestEvents: deployRows.slice(0, 8).map(mapDiagnosticEvent),
      evidence: {
        sourceTables: ["platformDiagnosticEvents"],
        routeProbePaths: [],
        versionJsonReachable: null,
        scannedEventLimit,
        isTruncated: deployRows.length >= scannedEventLimit,
      },
    };
  },
});

export const getOperatorMonetizationInternal = internalQuery({
  args: {
    range: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("all"))),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const rangeStart = normalizeRangeStart(args.range, nowMs);
    const checkouts = await ctx.db.query("checkoutSessions").collect();
    const inRangeCheckouts = rangeStart == null
      ? checkouts
      : checkouts.filter((row: any) => row.createdAt >= rangeStart);
    const activeSubscriptions = [];
    for (const status of ACTIVE_SUBSCRIPTION_STATUSES) {
      const rows = await ctx.db
        .query("communitySubscriptions")
        .withIndex("by_status", (q: any) => q.eq("status", status))
        .collect();
      activeSubscriptions.push(...rows);
    }
    let estimatedCommunityMrr: MoneyMetric | null = null;
    for (const row of activeSubscriptions) {
      const price = await ctx.db.get(row.pricePointId);
      estimatedCommunityMrr = addMoney(estimatedCommunityMrr, monthlyMoneyFromPricePoint(price));
    }
    return {
      computedAt: nowMs,
      creditTopupCheckoutStarts: inRangeCheckouts.filter((row: any) => row.mode === "workspace_credit_topup").length,
      creditTopupCheckoutCompletions: inRangeCheckouts.filter((row: any) => row.mode === "workspace_credit_topup" && row.status === "complete").length,
      communityCheckoutStarts: inRangeCheckouts.filter((row: any) => row.mode === "community_join").length,
      communityCheckoutCompletions: inRangeCheckouts.filter((row: any) => row.mode === "community_join" && row.status === "complete").length,
      activeCommunitySubscriptions: activeSubscriptions.length,
      estimatedCommunityMrr,
      evidence: {
        sourceTables: ["checkoutSessions", "communitySubscriptions", "communityPricePoints"],
      },
    };
  },
});

export const listOperatorEventsInternal = internalQuery({
  args: {
    eventType: v.optional(v.string()),
    severity: v.optional(v.union(v.literal("info"), v.literal("warning"), v.literal("error"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = normalizeLimit(args.limit, 50, 200);
    if (args.eventType) {
      const rows = await ctx.db
        .query("criticalAuditEvents")
        .withIndex("by_type_createdAt", (q: any) => q.eq("eventType", args.eventType))
        .order("desc")
        .take(limit);
      return rows
        .filter((row: any) => !args.severity || row.severity === args.severity)
        .map(mapEvent);
    }
    if (args.severity) {
      const rows = await ctx.db
        .query("criticalAuditEvents")
        .withIndex("by_severity_createdAt", (q: any) => q.eq("severity", args.severity))
        .order("desc")
        .take(limit);
      return rows.map(mapEvent);
    }
    const rows = await ctx.db.query("criticalAuditEvents").order("desc").take(limit);
    return rows.map(mapEvent);
  },
});

export const getOperatorAuthAccessDiagnosticsInternal = internalQuery({
  args: {
    range: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("all"))),
  },
  handler: async (ctx, args): Promise<any> => {
    const nowMs = Date.now();
    const range = args.range ?? "30d";
    const rangeStart = normalizeRangeStart(range, nowMs);
    const scannedEventLimit = 500;
    const [authRows, accessRows, entitlementFindings]: [any[], any[], any] = await Promise.all([
      readDiagnosticEventsBySubsystem(ctx, "auth", rangeStart, scannedEventLimit),
      readDiagnosticEventsBySubsystem(ctx, "access", rangeStart, scannedEventLimit),
      ctx.runQuery((internal as any).communityAccessAudit.listCommunityAccessStateAuditFindingsInternal, {
        limit: 500,
      }),
    ]);
    const rows: any[] = [...authRows, ...accessRows].sort((a: any, b: any) => b.createdAt - a.createdAt);
    const warningRows = rows.filter((row: any) => row.severity === "warning");
    const errorRows: any[] = rows.filter((row: any) => row.severity === "error");
    const authFailureRows = rows.filter((row: any) => row.subsystem === "auth" && row.status === "failed");
    const entitlementFindingsList = Array.isArray(entitlementFindings) ? entitlementFindings : [];
    const entitlementErrorFindings = entitlementFindingsList.filter((finding: any) => finding.severity === "error").length;
    const unknownAuthErrors = authFailureRows.filter((row: any) => {
      const errorCode = String(row.errorCode ?? "").trim().toLowerCase();
      return !errorCode || errorCode === "unknown" || errorCode === "auth_unknown";
    }).length;
    const health: "healthy" | "degraded" | "incident" =
      errorRows.length > 0 || entitlementErrorFindings > 0
        ? "incident"
        : warningRows.length > 0 || authFailureRows.length > 0 || entitlementFindingsList.length > 0
          ? "degraded"
          : "healthy";

    return {
      computedAt: nowMs,
      range,
      health,
      totals: {
        events: rows.length,
        warnings: warningRows.length,
        errors: errorRows.length,
        authFailures: authFailureRows.length,
        sessionEstablished: rows.filter((row: any) => row.eventType === "auth.session_established").length,
        sessionRefreshFailures: rows.filter((row: any) => row.eventType === "auth.session_refresh_failed").length,
        operatorAccessGranted: rows.filter((row: any) => row.eventType === "access.operator_access_granted").length,
        operatorAccessDenied: rows.filter((row: any) => row.eventType === "access.operator_access_denied").length,
        communityAccessDenied: rows.filter((row: any) => row.eventType === "access.community_denied").length,
        entitlementFindings: entitlementFindingsList.length,
        entitlementErrorFindings,
        unknownAuthErrors,
      },
      latestEvents: rows.slice(0, 8).map(mapDiagnosticEvent),
      evidence: {
        sourceTables: ["platformDiagnosticEvents", "communityAccessAudit"],
        scannedEventLimit,
        isTruncated: authRows.length >= scannedEventLimit || accessRows.length >= scannedEventLimit,
      },
    };
  },
});

export const getOperatorSecurityAuditDiagnosticsInternal = internalQuery({
  args: {
    range: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("all"))),
  },
  handler: async (ctx, args): Promise<any> => {
    const nowMs = Date.now();
    const range = args.range ?? "30d";
    const rangeStart = normalizeRangeStart(range, nowMs);
    const scannedEventLimit = 200;
    const perTypeLimit = 100;
    const [typedRowGroups, errorRows, warningRows] = await Promise.all([
      Promise.all(
        SECURITY_AUDIT_EVENT_TYPES.map((eventType) =>
          readCriticalAuditEventsByType(ctx, eventType, rangeStart, perTypeLimit),
        ),
      ),
      readCriticalAuditEventsBySeverity(ctx, "error", rangeStart, scannedEventLimit),
      readCriticalAuditEventsBySeverity(ctx, "warning", rangeStart, scannedEventLimit),
    ]);
    const rows = dedupeAuditRows([...typedRowGroups.flat(), ...errorRows, ...warningRows]);
    const errors = rows.filter((row: any) => row.severity === "error" || row.status === "failed");
    const warnings = rows.filter((row: any) => row.severity === "warning");
    const webhookFailures = rows.filter((row: any) =>
      WEBHOOK_FAILURE_AUDIT_EVENT_TYPES.has(String(row.eventType ?? "")),
    );
    const blockedActions = rows.filter((row: any) => row.status === "blocked");
    const destructiveActions = rows.filter((row: any) =>
      DESTRUCTIVE_AUDIT_EVENT_TYPES.has(String(row.eventType ?? "")),
    );
    const operatorRoleChanges = rows.filter((row: any) =>
      OPERATOR_ROLE_AUDIT_EVENT_TYPES.has(String(row.eventType ?? "")),
    );
    const operatorAccessBlocks = rows.filter(
      (row: any) => row.eventType === "operator_dashboard_accessed" && row.status === "blocked",
    );
    const billingTrustEvents = rows.filter((row: any) =>
      BILLING_TRUST_AUDIT_EVENT_TYPES.has(String(row.eventType ?? "")),
    );
    const unknownSecurityEvents = rows.filter((row: any) => {
      const eventType = String(row.eventType ?? "");
      if (SECURITY_AUDIT_EVENT_TYPE_SET.has(eventType)) return false;
      return row.severity !== "info" || row.status === "failed" || row.status === "blocked";
    });
    const health: "healthy" | "degraded" | "incident" =
      errors.length > 0 || webhookFailures.length > 0 || unknownSecurityEvents.length > 0
        ? "incident"
        : warnings.length > 0 || blockedActions.length > 0
          ? "degraded"
          : "healthy";
    const attentionRows = rows.filter((row: any) => {
      const eventType = String(row.eventType ?? "");
      return (
        row.severity === "error" ||
        row.severity === "warning" ||
        row.status === "failed" ||
        row.status === "blocked" ||
        WEBHOOK_FAILURE_AUDIT_EVENT_TYPES.has(eventType) ||
        DESTRUCTIVE_AUDIT_EVENT_TYPES.has(eventType) ||
        OPERATOR_ROLE_AUDIT_EVENT_TYPES.has(eventType)
      );
    });

    return {
      computedAt: nowMs,
      range,
      health,
      totals: {
        events: rows.length,
        warnings: warnings.length,
        errors: errors.length,
        webhookFailures: webhookFailures.length,
        blockedActions: blockedActions.length,
        destructiveActions: destructiveActions.length,
        operatorRoleChanges: operatorRoleChanges.length,
        operatorAccessBlocks: operatorAccessBlocks.length,
        billingTrustEvents: billingTrustEvents.length,
        unknownSecurityEvents: unknownSecurityEvents.length,
      },
      attentionItems: attentionRows.slice(0, 8).map(mapSecurityAuditAttentionItem),
      latestEvents: rows.slice(0, 8).map(mapEvent),
      evidence: {
        sourceTables: ["criticalAuditEvents"],
        scannedEventLimit,
        isTruncated:
          errorRows.length >= scannedEventLimit ||
          warningRows.length >= scannedEventLimit ||
          typedRowGroups.some((group: any[]) => group.length >= perTypeLimit),
      },
    };
  },
});

export const getOperatorRuntimeToolDiagnosticsInternal = internalQuery({
  args: {
    range: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("all"))),
  },
  handler: async (ctx, args): Promise<any> => {
    const nowMs = Date.now();
    const range = args.range ?? "30d";
    const rangeStart = normalizeRangeStart(range, nowMs);
    const scannedRunLimit = 250;
    const scannedEventLimit = 400;
    const scannedCreditLimit = 300;
    const scannedComputeLimit = 200;
    const [
      runtimeRunGroups,
      runtimeEventGroups,
      diagnosticGroups,
      paidToolCreditGroups,
      unbilledComputeCharges,
    ] = await Promise.all([
      Promise.all(
        RUNTIME_RUN_STATUSES.map((status) =>
          readRuntimeRunsByStatus(ctx, status, rangeStart, scannedRunLimit),
        ),
      ),
      Promise.all(
        RUNTIME_TOOL_EVENT_TYPES.map((eventType) =>
          readRuntimeEventsByType(ctx, eventType, rangeStart, scannedEventLimit),
        ),
      ),
      Promise.all(
        (["runtime", "tool", "mcp", "billing"] as const).map((subsystem) =>
          readDiagnosticEventsBySubsystem(ctx, subsystem, rangeStart, scannedEventLimit),
        ),
      ),
      Promise.all(
        PAID_TOOL_LEDGER_NAMES.map((toolName) =>
          readCreditLedgerEntriesByTool(ctx, toolName, rangeStart, scannedCreditLimit),
        ),
      ),
      readWorkspaceComputeChargesByDebitSource(ctx, "unbilled", rangeStart, scannedComputeLimit),
    ]);

    const runs: any[] = runtimeRunGroups.flat();
    const runtimeEvents: any[] = runtimeEventGroups.flat();
    const diagnosticRows: any[] = diagnosticGroups.flat().sort((a: any, b: any) => b.createdAt - a.createdAt);
    const paidToolLedgerRows: any[] = paidToolCreditGroups.flat();
    const toolStartedRows = runtimeEvents.filter((row: any) => row.eventType === "tool_call_started");
    const toolFinishedRows = runtimeEvents.filter((row: any) => row.eventType === "tool_call_finished");
    const runtimeDiagnosticRows = runtimeEvents.filter((row: any) => row.eventType === "runtime_diagnostics_detected");
    const workspaceSessionCreateRows = runtimeEvents.filter(
      (row: any) => row.eventType === "workspace_session_create_completed",
    );
    const workspaceSessionCreateFailureRows = workspaceSessionCreateRows.filter((row: any) => {
      const payload = readPayloadRecord(row);
      return normalizeOperatorKey(payload.status, "") === "error";
    });
    const toolFailureRows = toolFinishedRows.filter(isToolFailureRow);
    const runFailureRows = runs.filter((row: any) => row.status === "error");
    const normalizedRunFailureCodes = runFailureRows.map((row: any) =>
      normalizeRuntimeFailureCode(row.errorCode ?? row.reason ?? "unknown_runtime_error"),
    );
    const normalizedToolFailureCodes = toolFailureRows.map(readToolFailureCode);
    const normalizedWorkspaceSessionCreateFailureCodes = workspaceSessionCreateFailureRows.map((row: any) => {
      const payload = readPayloadRecord(row);
      return normalizeRuntimeFailureCode(
        payload.code ??
          payload.error_code ??
          payload.errorCode ??
          "sandbox_create_failed",
      );
    });
    const allFailureCodeRows = [
      ...runFailureRows.map((row: any) => ({
        ...row,
        __operatorFailureCode: normalizeRuntimeFailureCode(row.errorCode ?? row.reason ?? "unknown_runtime_error"),
      })),
      ...toolFailureRows.map((row: any) => ({
        ...row,
        __operatorFailureCode: readToolFailureCode(row),
      })),
      ...runtimeDiagnosticRows.map((row: any) => {
        const payload = readPayloadRecord(row);
        const failureSemantics =
          payload.failure_semantics && typeof payload.failure_semantics === "object" && !Array.isArray(payload.failure_semantics)
            ? (payload.failure_semantics as Record<string, unknown>)
            : null;
        return {
          ...row,
          __operatorFailureCode: normalizeRuntimeFailureCode(
            failureSemantics?.kind ?? payload.diagnostic_source ?? "runtime_diagnostics_detected",
          ),
        };
      }),
      ...workspaceSessionCreateFailureRows.map((row: any) => {
        const payload = readPayloadRecord(row);
        return {
          ...row,
          __operatorFailureCode: normalizeRuntimeFailureCode(
            payload.code ??
              payload.error_code ??
              payload.errorCode ??
              "sandbox_create_failed",
          ),
        };
      }),
      ...paidToolLedgerRows
        .filter((row: any) => row.status === "refunded" || row.failureReason)
        .map((row: any) => ({
          ...row,
          __operatorFailureCode: normalizeRuntimeFailureCode(row.failureReason ?? "paid_tool_ledger_failure"),
        })),
      ...unbilledComputeCharges.map((row: any) => ({
        ...row,
        __operatorFailureCode: "unbilled_compute",
      })),
    ];
    const providerFailures =
      normalizedRunFailureCodes.filter((code) => code === "provider_failed").length +
      normalizedToolFailureCodes.filter((code) => code === "provider_failed").length;
    const rateLimitFailures =
      normalizedRunFailureCodes.filter((code) => code === "provider_rate_limited").length +
      normalizedToolFailureCodes.filter((code) => code === "provider_rate_limited").length;
    const workspaceCreditFailures =
      normalizedRunFailureCodes.filter((code) => code.startsWith("workspace_credits_")).length +
      normalizedToolFailureCodes.filter((code) => code.startsWith("workspace_credits_")).length +
      normalizedWorkspaceSessionCreateFailureCodes.filter((code) => code.startsWith("workspace_credits_")).length +
      paidToolLedgerRows.filter((row: any) =>
        String(row.failureReason ?? "").toLowerCase().includes("credits"),
      ).length;
    const paidToolLedgerFailures = paidToolLedgerRows.filter(
      (row: any) => row.status === "refunded" || row.failureReason,
    ).length;
    const sandboxCreateFailures =
      workspaceSessionCreateFailureRows.length +
      normalizedToolFailureCodes.filter((code) => code === "sandbox_create_failed").length;
    const toolCalls = Math.max(toolStartedRows.length, toolFinishedRows.length);
    const turnTerminalCount = runs.filter((row: any) => row.status !== "running").length;
    const turnSuccessRate =
      turnTerminalCount > 0
        ? runs.filter((row: any) => row.status === "ok").length / turnTerminalCount
        : null;
    const toolFailureRate =
      toolFinishedRows.length > 0 ? toolFailureRows.length / toolFinishedRows.length : null;
    const incidentCount =
      providerFailures +
      workspaceCreditFailures +
      paidToolLedgerFailures +
      sandboxCreateFailures +
      unbilledComputeCharges.length;
    const health: "healthy" | "degraded" | "incident" =
      incidentCount > 0
        ? "incident"
        : runFailureRows.length > 0 || toolFailureRows.length > 0 || runtimeDiagnosticRows.length > 0
          ? "degraded"
          : "healthy";
    const errorKeys = new Set(["provider_failed", "workspace_credits_exhausted", "sandbox_create_failed", "unbilled_compute"]);

    return {
      computedAt: nowMs,
      range,
      health,
      totals: {
        turnsStarted: runs.length,
        turnsSucceeded: runs.filter((row: any) => row.status === "ok").length,
        turnsFailed: runFailureRows.length,
        turnsCancelled: runs.filter((row: any) => row.status === "cancelled").length,
        turnsRunning: runs.filter((row: any) => row.status === "running").length,
        toolCalls,
        toolFailures: toolFailureRows.length,
        runtimeDiagnosticEvents: runtimeDiagnosticRows.length,
        providerFailures,
        rateLimitFailures,
        workspaceCreditFailures,
        paidToolLedgerFailures,
        sandboxCreateFailures,
        unbilledComputeCharges: unbilledComputeCharges.length,
      },
      rates: {
        turnSuccessRate,
        toolFailureRate,
      },
      topFailureCodes: buildRuntimeBucket(
        allFailureCodeRows,
        (row: any) => row.__operatorFailureCode ?? "unknown_runtime_error",
        { errorKeys },
      ),
      topFailingTools: buildRuntimeBucket(toolFailureRows, readToolName, {
        errorKeys: new Set(toolFailureRows.map(readToolName)),
      }),
      latestEvents: diagnosticRows.slice(0, 8).map(mapDiagnosticEvent),
      evidence: {
        sourceTables: [
          "runtimeRuns",
          "runtimeRunEvents",
          "platformDiagnosticEvents",
          "creditLedgerEntries",
          "workspaceComputeCharges",
        ],
        scannedRunLimit,
        scannedEventLimit,
        scannedCreditLimit,
        scannedComputeLimit,
        isTruncated:
          runtimeRunGroups.some((group: any[]) => group.length >= scannedRunLimit) ||
          runtimeEventGroups.some((group: any[]) => group.length >= scannedEventLimit) ||
          diagnosticGroups.some((group: any[]) => group.length >= scannedEventLimit) ||
          paidToolCreditGroups.some((group: any[]) => group.length >= scannedCreditLimit) ||
          unbilledComputeCharges.length >= scannedComputeLimit,
      },
    };
  },
});

export const listOperatorRisksInternal = internalQuery({
  args: {
    severity: v.optional(v.union(v.literal("warning"), v.literal("error"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const limit = normalizeLimit(args.limit, 50, 200);
    const errorEvents = await ctx.db
      .query("criticalAuditEvents")
      .withIndex("by_severity_createdAt", (q: any) => q.eq("severity", "error"))
      .order("desc")
      .take(limit);
    const riskItems: any[] = errorEvents.map((event: any) => ({
      id: `event:${String(event._id)}`,
      severity: "error",
      kind: event.eventType,
      title: `${event.eventType} ${event.status}`,
      builderUserId: event.subjectUserId ? String(event.subjectUserId) : null,
      communityId: event.communityId ? String(event.communityId) : null,
      eventId: String(event._id),
      createdAt: event.createdAt,
      evidence: {
        sourceTables: ["criticalAuditEvents"],
      },
    }));
    if (args.severity === "error") return riskItems.slice(0, limit);

    const communities = await ctx.db.query("communities").collect();
    for (const community of communities) {
      const record = await buildBuilderRecord(ctx, community, nowMs);
      for (const flag of record.risk.flags) {
        riskItems.push({
          id: `builder:${record.community.communityId}:${flag}`,
          severity: "warning",
          kind: flag,
          title: `${record.community.name}: ${flag}`,
          builderUserId: record.builder.userId,
          communityId: record.community.communityId,
          eventId: null,
          createdAt: record.community.updatedAt,
          evidence: {
            sourceTables: record.evidence.sourceTables,
          },
        });
      }
    }
    return riskItems.slice(0, limit);
  },
});
