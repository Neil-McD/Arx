import { internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { sanitizeCriticalAuditMetadata } from "./criticalAudit";
import {
  creditsToUsd,
  getPaidToolLedgerLabel,
  PAID_TOOL_LEDGER_TOOL_NAMES,
  PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
  WORKSPACE_CREDITS_PER_USD,
} from "../shared/workspaceCredits";
import {
  ACCOUNT_SETUP_MISSING_FIELDS,
  ACCOUNT_SETUP_STEPS,
  type AccountSetupMissing,
  type AccountSetupStep,
} from "../shared/accountSetup";
import { isAnonymousAuthSubject } from "../shared/authRelinkPolicy";
import { buildAccountSetupStatusForRows } from "./accountSetupCore";
import { POLYNET_COMMUNITY_PLATFORM_FEE_BPS } from "../shared/founderPlan";

type MoneyMetric = {
  currency: string;
  amountBaseUnits: number;
  currencyDecimals: number;
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "past_due", "cancel_at_period_end"]);
const CHECKOUT_STATUSES = ["pending", "complete", "expired"] as const;
const STALE_COMMUNITY_ACTIVITY_AGE_MS = 30 * 86400000;
const COMMUNITY_SETUP_RISK_FLAGS = new Set([
  "no_members",
  "paid_missing_price",
  "paid_enabled_no_sales",
  "payout_not_ready",
  "checkout_abandonment",
]);
const SECURITY_AUDIT_EVENT_TYPES = [
  "account_delete_blocked",
  "account_delete_completed",
  "community_subscription_synced",
  "operator_dashboard_accessed",
  "operator_role_deactivated",
  "operator_role_upserted",
  "stripe_connect_onboarding_failed",
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

function isAccountUserRow(row: any): boolean {
  return !isAnonymousAuthSubject(row?.authSubject);
}
const OPERATOR_ROLE_AUDIT_EVENT_TYPES = new Set(["operator_role_deactivated", "operator_role_upserted"]);
const BILLING_TRUST_AUDIT_EVENT_TYPES = new Set([
  "community_subscription_synced",
  "stripe_connect_onboarding_failed",
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
const PAID_TOOL_LEDGER_TOOL_NAME_SET = new Set<string>(PAID_TOOL_LEDGER_TOOL_NAMES as readonly string[]);
const WEB_DEPLOY_FRONTEND_CRASH_EVENT_TYPES = new Set([
  "deploy.frontend_crash",
  "deploy.route_load_failed",
]);
const WEB_DEPLOY_MODULE_LOAD_EVENT_TYPES = new Set([
  "deploy.module_load_recovery",
  "deploy.stale_asset_recovered",
]);
const AUTH_AVAILABILITY_EVENT_TYPES = new Set([
  "auth.session_established",
  "auth.session_refreshed",
  "auth.bootstrap_failed",
  "auth.session_refresh_failed",
]);
const AUTH_AVAILABILITY_SUCCESS_EVENT_TYPES = new Set([
  "auth.session_established",
  "auth.session_refreshed",
]);
const AUTH_AVAILABILITY_RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const ACCOUNT_SETUP_SOURCE_TABLES = [
  "users",
  "userProfileDetails",
  "userProviderConnections",
  "legalAcceptances",
  "communities",
  "communityMemberships",
];
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

function normalizeLimit(value: number | undefined, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value)));
}

function clampOperatorScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildOperatorHealthFromScore(score: number | null): "healthy" | "degraded" | "incident" | "unknown" {
  if (score === null) return "unknown";
  if (score < 60) return "incident";
  if (score < 85) return "degraded";
  return "healthy";
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

function incrementStringCount(map: Map<string, number>, key: unknown, amount = 1): void {
  const normalized = String(key ?? "").trim();
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) ?? 0) + amount);
}

function pushByUserId(map: Map<string, any[]>, row: any): void {
  const key = String(row?.userId ?? "").trim();
  if (!key) return;
  const rows = map.get(key) ?? [];
  rows.push(row);
  map.set(key, rows);
}

function buildEmptyStepCounts(): Record<AccountSetupStep, number> {
  return Object.fromEntries(ACCOUNT_SETUP_STEPS.map((step) => [step, 0])) as Record<AccountSetupStep, number>;
}

function buildEmptyMissingCounts(): Record<AccountSetupMissing, number> {
  return Object.fromEntries(ACCOUNT_SETUP_MISSING_FIELDS.map((field) => [field, 0])) as Record<
    AccountSetupMissing,
    number
  >;
}

async function buildOperatorAccountSetupRecords(ctx: any, nowMs: number) {
  const [users, details, providerConnections, legalAcceptances, memberships, communities] = await Promise.all([
    ctx.db.query("users").collect(),
    ctx.db.query("userProfileDetails").collect(),
    ctx.db.query("userProviderConnections").collect(),
    ctx.db.query("legalAcceptances").collect(),
    ctx.db.query("communityMemberships").collect(),
    ctx.db.query("communities").collect(),
  ]);
  const accountUsers = users.filter(isAccountUserRow);
  const detailsByUser = new Map<string, any>();
  const providersByUser = new Map<string, any[]>();
  const legalAcceptancesByUser = new Map<string, any[]>();
  const ownedCommunitiesByUser = new Map<string, number>();
  const joinedCommunitiesByUser = new Map<string, number>();

  for (const row of details) detailsByUser.set(String(row.userId), row);
  for (const row of providerConnections) pushByUserId(providersByUser, row);
  for (const row of legalAcceptances) pushByUserId(legalAcceptancesByUser, row);
  for (const row of communities) incrementStringCount(ownedCommunitiesByUser, row.ownerId);
  for (const row of memberships) {
    if (row.active === false || row.revokedAt) continue;
    incrementStringCount(joinedCommunitiesByUser, row.userId);
  }

  return accountUsers.map((user: any) => {
    const userId = String(user._id);
    const setup = buildAccountSetupStatusForRows({
      user,
      detail: detailsByUser.get(userId) ?? null,
      providerConnections: providersByUser.get(userId) ?? [],
      legalAcceptances: legalAcceptancesByUser.get(userId) ?? [],
    });
    return {
      user: {
        userId: String(user.authSubject ?? ""),
        dbUserId: userId,
        email: user.email ?? null,
        displayName: user.displayName ?? null,
        handle: user.handle ?? null,
        avatarUrl: user.avatarUrl ?? null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      setup,
      communities: {
        owned: ownedCommunitiesByUser.get(userId) ?? 0,
        joined: joinedCommunitiesByUser.get(userId) ?? 0,
      },
      evidence: {
        sourceTables: ACCOUNT_SETUP_SOURCE_TABLES,
        computedAt: nowMs,
      },
    };
  });
}

function matchesAccountSetupUserQuery(record: any, query: string): boolean {
  if (!query) return true;
  const haystack = [
    record.user.userId,
    record.user.dbUserId,
    record.user.email,
    record.user.displayName,
    record.user.handle,
    record.setup.current_step,
    ...record.setup.missing,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function sortAccountSetupRecords(a: any, b: any): number {
  if (a.setup.completed !== b.setup.completed) return a.setup.completed ? 1 : -1;
  if (a.setup.percent !== b.setup.percent) return a.setup.percent - b.setup.percent;
  return Number(b.user.updatedAt ?? 0) - Number(a.user.updatedAt ?? 0);
}

function buildOperatorAccountSetupOverview(records: any[], nowMs: number) {
  const byStep = buildEmptyStepCounts();
  const byMissing = buildEmptyMissingCounts();
  let completed = 0;
  let percentTotal = 0;

  for (const record of records) {
    byStep[record.setup.current_step as AccountSetupStep] += 1;
    percentTotal += record.setup.percent;
    if (record.setup.completed) completed += 1;
    for (const missing of record.setup.missing) {
      byMissing[missing as AccountSetupMissing] += 1;
    }
  }

  return {
    computedAt: nowMs,
    totals: {
      users: records.length,
      completed,
      incomplete: records.length - completed,
      averagePercent: records.length > 0 ? Math.round(percentTotal / records.length) : 0,
    },
    byStep,
    byMissing,
    evidence: {
      sourceTables: ACCOUNT_SETUP_SOURCE_TABLES,
    },
  };
}

function buildOperatorAccountSetupUserList(
  records: any[],
  args: {
    query?: string;
    currentStep?: string;
    completed?: boolean;
    limit?: number;
  },
) {
  const limit = normalizeLimit(args.limit, 50, 200);
  const query = String(args.query ?? "").trim().toLowerCase();
  const matching = records
    .filter((record: any) => args.currentStep == null || record.setup.current_step === args.currentStep)
    .filter((record: any) => typeof args.completed !== "boolean" || record.setup.completed === args.completed)
    .filter((record: any) => matchesAccountSetupUserQuery(record, query))
    .sort(sortAccountSetupRecords);

  return {
    rows: matching.slice(0, limit),
    totalMatching: matching.length,
    isTruncated: matching.length > limit,
    limit,
  };
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

function divideMoney(metric: MoneyMetric | null, divisor: number): MoneyMetric | null {
  if (!metric || !(divisor > 0)) return null;
  return {
    ...metric,
    amountBaseUnits: Math.round(metric.amountBaseUnits / divisor),
  };
}

function applyBpsToMoneyMetric(metric: MoneyMetric | null, bps: number): MoneyMetric | null {
  if (!metric) return null;
  const normalizedBps = Math.max(0, Math.floor(Number(bps) || 0));
  if (normalizedBps <= 0) return null;
  return {
    ...metric,
    amountBaseUnits: Math.round(metric.amountBaseUnits * normalizedBps / 10000),
  };
}

function moneyFromUsd(value: number): MoneyMetric | null {
  const dollars = Number(value);
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  return {
    currency: "usd",
    amountBaseUnits: Math.round(dollars * 100),
    currencyDecimals: 2,
  };
}

function moneyFromCheckout(row: any): MoneyMetric | null {
  const amountBaseUnits = Number(row?.amountBaseUnits ?? 0);
  if (!Number.isFinite(amountBaseUnits) || amountBaseUnits <= 0) return null;
  return {
    currency: String(row?.currency ?? "usd").toLowerCase(),
    amountBaseUnits,
    currencyDecimals: Number(row?.currencyDecimals ?? 2),
  };
}

function conversionRate(completions: number, starts: number): number | null {
  return starts > 0 ? completions / starts : null;
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

async function readWorkspaceCreditBalanceRows(ctx: any, limit: number) {
  return await ctx.db
    .query("workspaceCreditBalances")
    .withIndex("by_updatedAt")
    .order("desc")
    .take(limit);
}

async function readStaleReservedCreditLedgerRows(ctx: any, nowMs: number, limit: number) {
  return await ctx.db
    .query("creditLedgerEntries")
    .withIndex("by_status_expiresAt", (q: any) =>
      q.eq("status", "reserved").lt("expiresAt", nowMs),
    )
    .take(limit);
}

async function readDuePendingCreditSettlementRows(ctx: any, nowMs: number, limit: number) {
  return await ctx.db
    .query("creditLedgerEntries")
    .withIndex("by_pendingSettlementStatus_nextAttemptAt", (q: any) =>
      q.eq("pendingSettlementStatus", "succeeded").lt("pendingSettlementNextAttemptAt", nowMs),
    )
    .take(limit);
}

async function readCreditLedgerEntriesByUser(ctx: any, userId: any, limit: number) {
  return await ctx.db
    .query("creditLedgerEntries")
    .withIndex("by_user_createdAt", (q: any) => q.eq("userId", userId))
    .order("desc")
    .take(limit);
}

async function readCompletedWorkspaceCreditTopupsByUser(ctx: any, userId: any, limit: number) {
  const rows = await ctx.db
    .query("checkoutSessions")
    .withIndex("by_owner_status", (q: any) => q.eq("ownerUserId", userId).eq("status", "complete"))
    .order("desc")
    .take(limit);
  return rows.filter((row: any) => row.mode === "workspace_credit_topup");
}

async function readWorkspaceComputeChargesByUser(ctx: any, userId: any, limit: number) {
  return await ctx.db
    .query("workspaceComputeCharges")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .order("desc")
    .take(limit);
}

async function readWorkspaceUsageCollectionsByUser(ctx: any, userId: any, limit: number) {
  return await ctx.db
    .query("workspaceUsageCollections")
    .withIndex("by_user_createdAt", (q: any) => q.eq("userId", userId))
    .order("desc")
    .take(limit);
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

function readLedgerCredits(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100) / 100;
}

function readLedgerUsd(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 10000) / 10000;
}

function readSignedLedgerUsd(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 10000) / 10000;
}

function readLedgerSettledCredits(row: any): number {
  if (typeof row?.creditsSettled === "number") {
    return readLedgerCredits(row.creditsSettled);
  }
  return row?.status === "succeeded" ? readLedgerCredits(row?.creditsReserved) : 0;
}

function readLedgerReleasedCredits(row: any): number {
  const explicitRelease = readLedgerCredits(row?.includedCreditsRefunded) + readLedgerCredits(row?.purchasedCreditsRefunded);
  if (explicitRelease > 0) return readLedgerCredits(explicitRelease);
  // Legacy ledger status name: "refunded" means an unused internal hold was
  // released back to tool balance, not a cash refund.
  if (row?.status !== "refunded") return 0;
  return readLedgerCredits(readLedgerCredits(row?.creditsReserved) - readLedgerSettledCredits(row));
}

function readLedgerMetadataNumber(row: any, key: string): number {
  const metadata = row?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return 0;
  return readLedgerCredits((metadata as Record<string, unknown>)[key]);
}

function buildToolBalanceIssue(args: {
  kind: "negative_balance" | "duplicate_balance" | "stale_reservation" | "pending_settlement" | "unbilled_compute" | "missing_cost" | "price_drift" | "balance_mismatch" | "reconciliation_coverage_gap";
  severity: "warning" | "error";
  label: string;
  userId?: unknown;
  creditKey?: unknown;
  amountCredits?: number | null;
  amountUsd?: number | null;
  latestAt?: number | null;
}) {
  return {
    kind: args.kind,
    severity: args.severity,
    label: args.label,
    userId: args.userId == null ? null : String(args.userId),
    creditKey: args.creditKey == null ? null : String(args.creditKey),
    amountCredits: typeof args.amountCredits === "number" ? readLedgerCredits(args.amountCredits) : null,
    amountUsd: typeof args.amountUsd === "number" ? readSignedLedgerUsd(args.amountUsd) : null,
    latestAt: typeof args.latestAt === "number" && Number.isFinite(args.latestAt) ? args.latestAt : null,
  };
}

function buildSampledBalanceReconciliation(args: {
  balance: any;
  topups: any[];
  ledgerRows: any[];
  computeRows: any[];
  collectionRows: any[];
  userLedgerLimit: number;
  userTopupLimit: number;
  userComputeLimit: number;
  userCollectionLimit: number;
}) {
  const completedTopups = args.topups.filter((row) => row.mode === "workspace_credit_topup");
  const legacyTopupCoverageGaps = completedTopups.filter((row) =>
    typeof row.workspaceCreditsGrantedAt === "number" &&
    typeof row.workspaceCreditsUncollectedPaid !== "number"
  ).length;
  const userPaidToolLedgerRows = args.ledgerRows.filter((row) =>
    PAID_TOOL_LEDGER_TOOL_NAME_SET.has(String(row?.toolName ?? "")),
  );
  const unbilledComputeRows = args.computeRows.filter((row) => row.debitSource === "unbilled");
  const scanTruncated =
    args.ledgerRows.length >= args.userLedgerLimit ||
    args.topups.length >= args.userTopupLimit ||
    args.computeRows.length >= args.userComputeLimit ||
    args.collectionRows.length >= args.userCollectionLimit;
  const coverageGap =
    legacyTopupCoverageGaps > 0 ||
    unbilledComputeRows.length > 0 ||
    scanTruncated;

  const topupPurchasedCredits = readLedgerCredits(
    completedTopups.reduce((sum, row) => {
      const credits = readLedgerCredits(row.workspaceCreditsAmount);
      const paidUncollected = readLedgerCredits(row.workspaceCreditsUncollectedPaid);
      return sum + Math.max(0, credits - paidUncollected);
    }, 0),
  );
  const topupUncollectedPaidCredits = readLedgerCredits(
    completedTopups.reduce((sum, row) => sum + readLedgerCredits(row.workspaceCreditsUncollectedPaid), 0),
  );
  const purchasedLedgerDebits = readLedgerCredits(
    userPaidToolLedgerRows.reduce((sum, row) => sum + readLedgerCredits(row.purchasedCreditsDebited), 0),
  );
  const purchasedLedgerRefunds = readLedgerCredits(
    userPaidToolLedgerRows.reduce((sum, row) => sum + readLedgerCredits(row.purchasedCreditsRefunded), 0),
  );
  const uncollectedCreatedCredits = readLedgerCredits(
    userPaidToolLedgerRows.reduce((sum, row) => sum + readLedgerMetadataNumber(row, "uncollected_credits"), 0),
  );
  const preparedCollectionCredits = readLedgerCredits(
    args.collectionRows.reduce(
      (sum, row) => sum + (row.status === "prepared" ? readLedgerCredits(row.creditsAmount) : 0),
      0,
    ),
  );
  const succeededCollectionCredits = readLedgerCredits(
    args.collectionRows.reduce(
      (sum, row) => sum + (row.status === "succeeded" ? readLedgerCredits(row.creditsAmount) : 0),
      0,
    ),
  );

  const expectedPurchasedCredits = readSignedLedgerUsd(
    topupPurchasedCredits - purchasedLedgerDebits + purchasedLedgerRefunds,
  );
  const expectedUncollectedCredits = readSignedLedgerUsd(
    uncollectedCreatedCredits -
      topupUncollectedPaidCredits -
      preparedCollectionCredits -
      succeededCollectionCredits,
  );
  const expectedPendingCollectionCredits = readSignedLedgerUsd(preparedCollectionCredits);
  const actualPurchasedCredits = readLedgerCredits(args.balance?.purchasedCreditsBalance);
  const actualUncollectedCredits = readLedgerCredits(args.balance?.uncollectedCreditsBalance);
  const actualPendingCollectionCredits = readLedgerCredits(
    args.balance?.pendingCardCollectionCreditsBalance,
  );
  const purchasedDelta = readSignedLedgerUsd(actualPurchasedCredits - expectedPurchasedCredits);
  const uncollectedDelta = readSignedLedgerUsd(actualUncollectedCredits - expectedUncollectedCredits);
  const pendingCollectionDelta = readSignedLedgerUsd(
    actualPendingCollectionCredits - expectedPendingCollectionCredits,
  );
  const mismatch =
    !coverageGap &&
    (
      Math.abs(purchasedDelta) > 0.01 ||
      Math.abs(uncollectedDelta) > 0.01 ||
      Math.abs(pendingCollectionDelta) > 0.01
    );

  return {
    coverageGap,
    mismatch,
    purchasedDelta,
    uncollectedDelta,
    pendingCollectionDelta,
    legacyTopupCoverageGaps,
    unbilledComputeRows: unbilledComputeRows.length,
    scanTruncated,
  };
}

function formatPaidToolName(toolName: string): string {
  return getPaidToolLedgerLabel(toolName) ?? formatOperatorBucketLabel(toolName);
}

function buildEmptyToolEconomicsLane(toolName: string) {
  return {
    toolName,
    label: formatPaidToolName(toolName),
    settledRows: 0,
    revenueUsd: 0,
    vendorCostUsd: 0,
    grossMarginUsd: 0,
    grossMarginRate: null as number | null,
    missingCostRows: 0,
    latestAt: null as number | null,
  };
}

function finalizeToolEconomicsLane<T extends ReturnType<typeof buildEmptyToolEconomicsLane>>(lane: T): T {
  const grossMarginRate = lane.revenueUsd > 0 ? lane.grossMarginUsd / lane.revenueUsd : null;
  return {
    ...lane,
    revenueUsd: readLedgerUsd(lane.revenueUsd),
    vendorCostUsd: readLedgerUsd(lane.vendorCostUsd),
    grossMarginUsd: readSignedLedgerUsd(lane.grossMarginUsd),
    grossMarginRate,
  };
}

function buildPaidToolEconomics(paidToolLedgerRows: any[]) {
  const lanes = new Map<string, ReturnType<typeof buildEmptyToolEconomicsLane>>(
    PAID_TOOL_LEDGER_TOOL_NAMES.map((toolName) => [
      toolName,
      buildEmptyToolEconomicsLane(toolName),
    ]),
  );
  const settledRows = paidToolLedgerRows.filter((row: any) => row.status === "succeeded");

  for (const row of settledRows) {
    const toolName = String(row?.toolName ?? "unknown").trim() || "unknown";
    const lane = lanes.get(toolName) ?? buildEmptyToolEconomicsLane(toolName);
    const revenueUsd = typeof row?.polynetPriceUsd === "number"
      ? readLedgerUsd(row.polynetPriceUsd)
      : readLedgerUsd(creditsToUsd(readLedgerSettledCredits(row)));
    const hasCostEvidence = typeof row?.rawVendorCostUsd === "number" && Number.isFinite(row.rawVendorCostUsd);
    const vendorCostUsd = hasCostEvidence ? readLedgerUsd(row.rawVendorCostUsd) : 0;
    const grossMarginUsd = readSignedLedgerUsd(revenueUsd - vendorCostUsd);

    lane.settledRows += 1;
    lane.revenueUsd = readLedgerUsd(lane.revenueUsd + revenueUsd);
    lane.vendorCostUsd = readLedgerUsd(lane.vendorCostUsd + vendorCostUsd);
    lane.grossMarginUsd = readSignedLedgerUsd(lane.grossMarginUsd + grossMarginUsd);
    if (!hasCostEvidence) lane.missingCostRows += 1;
    const latestAt = readRowCreatedAt(row);
    lane.latestAt = Math.max(lane.latestAt ?? 0, latestAt) || lane.latestAt;
    lanes.set(toolName, lane);
  }

  const finalizedLanes = [...lanes.values()]
    .map(finalizeToolEconomicsLane)
    .sort((a, b) =>
      b.revenueUsd - a.revenueUsd ||
      b.settledRows - a.settledRows ||
      Number(b.latestAt ?? 0) - Number(a.latestAt ?? 0) ||
      a.label.localeCompare(b.label),
    );
  const totals = finalizeToolEconomicsLane(
    finalizedLanes.reduce((total, lane) => ({
      ...total,
      settledRows: total.settledRows + lane.settledRows,
      revenueUsd: readLedgerUsd(total.revenueUsd + lane.revenueUsd),
      vendorCostUsd: readLedgerUsd(total.vendorCostUsd + lane.vendorCostUsd),
      grossMarginUsd: readSignedLedgerUsd(total.grossMarginUsd + lane.grossMarginUsd),
      missingCostRows: total.missingCostRows + lane.missingCostRows,
      latestAt: Math.max(total.latestAt ?? 0, lane.latestAt ?? 0) || total.latestAt,
    }), buildEmptyToolEconomicsLane("total")),
  );

  return {
    targets: {
      grossMarginBps: PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
    },
    totals: {
      ...totals,
      toolName: "all",
      label: "All paid tools",
      costEvidenceCoverage: totals.settledRows > 0
        ? (totals.settledRows - totals.missingCostRows) / totals.settledRows
        : null,
    },
    lanes: finalizedLanes,
  };
}

async function buildToolBalanceAccountingIntegrity(params: {
  ctx: any;
  nowMs: number;
  paidToolLedgerRows: any[];
  unbilledComputeCharges: any[];
  balanceRows: any[];
  staleReservedRows: any[];
  pendingSettlementRows: any[];
  balanceSampleLimit: number;
  userLedgerLimit: number;
  userTopupLimit: number;
  userComputeLimit: number;
  userCollectionLimit: number;
}) {
  const issues: ReturnType<typeof buildToolBalanceIssue>[] = [];
  const duplicateUsers = new Set<string>();
  const sampledRowsByUser = new Map<string, any[]>();
  for (const row of params.balanceRows) {
    const key = String(row.userId);
    sampledRowsByUser.set(key, [...(sampledRowsByUser.get(key) ?? []), row]);
  }
  for (const [userId, rows] of sampledRowsByUser.entries()) {
    if (rows.length <= 1) continue;
    duplicateUsers.add(userId);
    if (issues.length < 10) {
      issues.push(buildToolBalanceIssue({
        kind: "duplicate_balance",
        severity: "warning",
        label: `${rows.length} sampled balance rows for one user`,
        userId,
        latestAt: Math.max(...rows.map((row) => readRowCreatedAt(row))),
      }));
    }
  }

  const negativeBalanceRows = params.balanceRows.filter((row) =>
    Number(row.includedCreditsBalance ?? 0) < 0 ||
    Number(row.purchasedCreditsBalance ?? 0) < 0 ||
    Number(row.uncollectedCreditsBalance ?? 0) < 0 ||
    Number(row.pendingCardCollectionCreditsBalance ?? 0) < 0
  );
  for (const row of negativeBalanceRows.slice(0, Math.max(0, 10 - issues.length))) {
    issues.push(buildToolBalanceIssue({
      kind: "negative_balance",
      severity: "error",
      label: "Negative tool balance row",
      userId: row.userId,
      amountCredits:
        Math.min(
          Number(row.includedCreditsBalance ?? 0),
          Number(row.purchasedCreditsBalance ?? 0),
          Number(row.uncollectedCreditsBalance ?? 0),
          Number(row.pendingCardCollectionCreditsBalance ?? 0),
        ),
      latestAt: row.updatedAt,
    }));
  }

  const uncollectedBalanceRows = params.balanceRows.filter((row) =>
    readLedgerCredits(row.uncollectedCreditsBalance) > 0 ||
    readLedgerCredits(row.pendingCardCollectionCreditsBalance) > 0
  );

  const staleReservedRows = params.staleReservedRows.filter((row) =>
    row.pendingSettlementStatus !== "succeeded"
  );
  for (const row of staleReservedRows.slice(0, Math.max(0, 10 - issues.length))) {
    issues.push(buildToolBalanceIssue({
      kind: "stale_reservation",
      severity: "error",
      label: "Expired paid-tool reservation still reserved",
      userId: row.userId,
      creditKey: row.creditKey,
      amountCredits: row.creditsReserved,
      latestAt: row.expiresAt ?? row.updatedAt,
    }));
  }

  for (const row of params.pendingSettlementRows.slice(0, Math.max(0, 10 - issues.length))) {
    issues.push(buildToolBalanceIssue({
      kind: "pending_settlement",
      severity: "warning",
      label: "Provider-success settlement retry is due",
      userId: row.userId,
      creditKey: row.creditKey,
      amountCredits: row.pendingCreditsSettled ?? row.creditsReserved,
      latestAt: row.pendingSettlementNextAttemptAt ?? row.updatedAt,
    }));
  }

  for (const row of params.unbilledComputeCharges.slice(0, Math.max(0, 10 - issues.length))) {
    issues.push(buildToolBalanceIssue({
      kind: "unbilled_compute",
      severity: "error",
      label: "Workspace compute charge was recorded as unbilled",
      userId: row.userId,
      amountUsd: row.computeCostUsd,
      latestAt: row.createdAt,
    }));
  }

  const settledRows = params.paidToolLedgerRows.filter((row) => row.status === "succeeded");
  const settledRowsMissingVendorCost = settledRows.filter((row) =>
    typeof row.rawVendorCostUsd !== "number" || !Number.isFinite(row.rawVendorCostUsd)
  );
  for (const row of settledRowsMissingVendorCost.slice(0, Math.max(0, 10 - issues.length))) {
    issues.push(buildToolBalanceIssue({
      kind: "missing_cost",
      severity: "warning",
      label: "Settled paid-tool row is missing vendor cost",
      userId: row.userId,
      creditKey: row.creditKey,
      amountCredits: readLedgerSettledCredits(row),
      latestAt: row.settledAt ?? row.updatedAt,
    }));
  }

  const priceDriftRows = settledRows.filter((row) => {
    const expected = creditsToUsd(readLedgerSettledCredits(row));
    const actual = typeof row.polynetPriceUsd === "number" ? row.polynetPriceUsd : expected;
    return Math.abs(readSignedLedgerUsd(actual - expected)) > 0.0001;
  });
  for (const row of priceDriftRows.slice(0, Math.max(0, 10 - issues.length))) {
    issues.push(buildToolBalanceIssue({
      kind: "price_drift",
      severity: "error",
      label: "Settled paid-tool price does not match settled credits",
      userId: row.userId,
      creditKey: row.creditKey,
      amountCredits: readLedgerSettledCredits(row),
      latestAt: row.settledAt ?? row.updatedAt,
    }));
  }

  let balanceMismatchUsers = 0;
  let reconciliationCoverageGaps = 0;
  const reconciliationRows = params.balanceRows.slice(0, params.balanceSampleLimit);
  for (const balance of reconciliationRows) {
    const [topups, ledgerRows, computeRows, collectionRows] = await Promise.all([
      readCompletedWorkspaceCreditTopupsByUser(params.ctx, balance.userId, params.userTopupLimit),
      readCreditLedgerEntriesByUser(params.ctx, balance.userId, params.userLedgerLimit),
      readWorkspaceComputeChargesByUser(params.ctx, balance.userId, params.userComputeLimit),
      readWorkspaceUsageCollectionsByUser(params.ctx, balance.userId, params.userCollectionLimit),
    ]);
    const reconciliation = buildSampledBalanceReconciliation({
      balance,
      topups,
      ledgerRows,
      computeRows,
      collectionRows,
      userLedgerLimit: params.userLedgerLimit,
      userTopupLimit: params.userTopupLimit,
      userComputeLimit: params.userComputeLimit,
      userCollectionLimit: params.userCollectionLimit,
    });
    if (reconciliation.coverageGap) {
      reconciliationCoverageGaps += 1;
      if (issues.length < 10) {
        issues.push(buildToolBalanceIssue({
          kind: "reconciliation_coverage_gap",
          severity: "warning",
          label: reconciliation.scanTruncated
            ? "Sampled user has more accounting rows than the diagnostic scan limit"
            : reconciliation.legacyTopupCoverageGaps > 0
              ? "Older top-up row lacks uncollected-usage allocation evidence"
              : "Sampled user has unbilled compute outside credit-ledger replay",
          userId: balance.userId,
          latestAt: balance.updatedAt,
        }));
      }
      continue;
    }
    if (reconciliation.mismatch) {
      balanceMismatchUsers += 1;
      if (issues.length < 10) {
        issues.push(buildToolBalanceIssue({
          kind: "balance_mismatch",
          severity: "error",
          label: "Materialized balance differs from replayed paid-tool ledger evidence",
          userId: balance.userId,
          amountCredits:
            Math.abs(reconciliation.purchasedDelta) +
            Math.abs(reconciliation.uncollectedDelta) +
            Math.abs(reconciliation.pendingCollectionDelta),
          latestAt: balance.updatedAt,
        }));
      }
    }
  }

  const errorCount =
    negativeBalanceRows.length +
    staleReservedRows.length +
    params.unbilledComputeCharges.length +
    priceDriftRows.length +
    balanceMismatchUsers;
  const warningCount =
    duplicateUsers.size +
    uncollectedBalanceRows.length +
    params.pendingSettlementRows.length +
    settledRowsMissingVendorCost.length +
    reconciliationCoverageGaps;
  const score = clampOperatorScore(
    100 -
      Math.min(70, errorCount * 14) -
      Math.min(35, warningCount * 4),
  );

  return {
    health: buildOperatorHealthFromScore(score),
    score,
    totals: {
      sampledBalanceRows: params.balanceRows.length,
      duplicateBalanceUsers: duplicateUsers.size,
      negativeBalanceRows: negativeBalanceRows.length,
      uncollectedBalanceRows: uncollectedBalanceRows.length,
      staleReservations: staleReservedRows.length,
      pendingSettlementsDue: params.pendingSettlementRows.length,
      unbilledComputeCharges: params.unbilledComputeCharges.length,
      settledRowsMissingVendorCost: settledRowsMissingVendorCost.length,
      priceDriftRows: priceDriftRows.length,
      balanceMismatchUsers,
      reconciliationCoverageGaps,
    },
    issues,
  };
}

function buildPaidToolDiagnostics(paidToolLedgerRows: any[], unbilledComputeCharges: any[]) {
  const lanes = new Map<
    string,
    {
      toolName: string;
      label: string;
      reservations: number;
      succeeded: number;
      released: number;
      stillReserved: number;
      failures: number;
      reservedCredits: number;
      settledCredits: number;
      releasedCredits: number;
      latestAt: number | null;
    }
  >();
  for (const toolName of PAID_TOOL_LEDGER_TOOL_NAMES) {
    lanes.set(toolName, {
      toolName,
      label: formatPaidToolName(toolName),
      reservations: 0,
      succeeded: 0,
      released: 0,
      stillReserved: 0,
      failures: 0,
      reservedCredits: 0,
      settledCredits: 0,
      releasedCredits: 0,
      latestAt: null,
    });
  }
  for (const row of paidToolLedgerRows) {
    const toolName = String(row?.toolName ?? "unknown").trim() || "unknown";
    const lane =
      lanes.get(toolName) ??
      {
        toolName,
        label: formatPaidToolName(toolName),
        reservations: 0,
        succeeded: 0,
        released: 0,
        stillReserved: 0,
        failures: 0,
        reservedCredits: 0,
        settledCredits: 0,
        releasedCredits: 0,
        latestAt: null,
      };
    const status = String(row?.status ?? "").trim().toLowerCase();
    lane.reservations += 1;
    lane.reservedCredits = readLedgerCredits(lane.reservedCredits + readLedgerCredits(row?.creditsReserved));
    lane.settledCredits = readLedgerCredits(lane.settledCredits + readLedgerSettledCredits(row));
    lane.releasedCredits = readLedgerCredits(lane.releasedCredits + readLedgerReleasedCredits(row));
    if (status === "succeeded") lane.succeeded += 1;
    if (status === "refunded") lane.released += 1;
    if (status === "reserved") lane.stillReserved += 1;
    if (status === "refunded" || row?.failureReason) lane.failures += 1;
    const latestAt = readRowCreatedAt(row);
    lane.latestAt = Math.max(lane.latestAt ?? 0, latestAt) || lane.latestAt;
    lanes.set(toolName, lane);
  }
  const orderedLanes = [...lanes.values()].sort(
    (a, b) =>
      b.reservations - a.reservations ||
      Number(b.latestAt ?? 0) - Number(a.latestAt ?? 0) ||
      a.label.localeCompare(b.label),
  );
  return {
    totals: {
      reservations: orderedLanes.reduce((sum, lane) => sum + lane.reservations, 0),
      succeeded: orderedLanes.reduce((sum, lane) => sum + lane.succeeded, 0),
      released: orderedLanes.reduce((sum, lane) => sum + lane.released, 0),
      stillReserved: orderedLanes.reduce((sum, lane) => sum + lane.stillReserved, 0),
      failures: orderedLanes.reduce((sum, lane) => sum + lane.failures, 0),
      reservedCredits: readLedgerCredits(orderedLanes.reduce((sum, lane) => sum + lane.reservedCredits, 0)),
      settledCredits: readLedgerCredits(orderedLanes.reduce((sum, lane) => sum + lane.settledCredits, 0)),
      releasedCredits: readLedgerCredits(orderedLanes.reduce((sum, lane) => sum + lane.releasedCredits, 0)),
      unbilledComputeCharges: unbilledComputeCharges.length,
    },
    lanes: orderedLanes,
  };
}

async function buildOperatorToolEconomicsSnapshot(ctx: any, range: "7d" | "30d" | "90d" | "all", nowMs: number) {
  const rangeStart = normalizeRangeStart(range, nowMs);
  const scannedCreditLimit = 300;
  const scannedComputeLimit = 200;
  const scannedBalanceLimit = 200;
  const scannedIntegritySampleLimit = 25;
  const userLedgerLimit = 500;
  const userTopupLimit = 250;
  const userComputeLimit = 250;
  const userCollectionLimit = 250;
  const [
    paidToolCreditGroups,
    unbilledComputeCharges,
    balanceRows,
    staleReservedRows,
    pendingSettlementRows,
  ] = await Promise.all([
    Promise.all(
      PAID_TOOL_LEDGER_TOOL_NAMES.map((toolName) =>
        readCreditLedgerEntriesByTool(ctx, toolName, rangeStart, scannedCreditLimit),
      ),
    ),
    readWorkspaceComputeChargesByDebitSource(ctx, "unbilled", rangeStart, scannedComputeLimit),
    readWorkspaceCreditBalanceRows(ctx, scannedBalanceLimit),
    readStaleReservedCreditLedgerRows(ctx, nowMs, scannedIntegritySampleLimit),
    readDuePendingCreditSettlementRows(ctx, nowMs, scannedIntegritySampleLimit),
  ]);

  const paidToolLedgerRows: any[] = paidToolCreditGroups.flat();
  const paidToolLedgerFailureRows = paidToolLedgerRows.filter(
    (row: any) => row.status === "refunded" || row.failureReason,
  );
  const paidToolLedgerFailureCodeRows = paidToolLedgerFailureRows.map((row: any) => ({
    ...row,
    __operatorFailureCode: normalizeRuntimeFailureCode(row.failureReason ?? "paid_tool_ledger_failure"),
  }));
  const unbilledComputeCodeRows = unbilledComputeCharges.map((row: any) => ({
    ...row,
    __operatorFailureCode: "unbilled_compute",
  }));
  const workspaceCreditFailures = paidToolLedgerRows.filter((row: any) =>
    String(row.failureReason ?? "").toLowerCase().includes("credits"),
  ).length;
  const paidToolLedgerFailures = paidToolLedgerFailureRows.length;
  const usageIntegrityFailureCodeRows = [
    ...paidToolLedgerFailureCodeRows,
    ...unbilledComputeCodeRows,
  ];
  const usageErrorKeys = new Set(["workspace_credits_exhausted", "unbilled_compute", "paid_tool_ledger_failure"]);
  const usageIntegrityScore = clampOperatorScore(
    100 -
      Math.min(30, workspaceCreditFailures * 10) -
      Math.min(24, paidToolLedgerFailures * 8) -
      Math.min(30, unbilledComputeCharges.length * 10),
  );
  const paidTools = buildPaidToolDiagnostics(paidToolLedgerRows, unbilledComputeCharges);
  const paidToolEconomics = buildPaidToolEconomics(paidToolLedgerRows);
  const accountingIntegrity = await buildToolBalanceAccountingIntegrity({
    ctx,
    nowMs,
    paidToolLedgerRows,
    unbilledComputeCharges,
    balanceRows,
    staleReservedRows,
    pendingSettlementRows,
    balanceSampleLimit: scannedIntegritySampleLimit,
    userLedgerLimit,
    userTopupLimit,
    userComputeLimit,
    userCollectionLimit,
  });

  return {
    computedAt: nowMs,
    range,
    usageIntegrity: {
      health: buildOperatorHealthFromScore(usageIntegrityScore),
      score: usageIntegrityScore,
      workspaceCreditFailures,
      paidToolLedgerFailures,
      unbilledComputeCharges: unbilledComputeCharges.length,
      topFailureCodes: buildRuntimeBucket(
        usageIntegrityFailureCodeRows,
        (row: any) => row.__operatorFailureCode ?? "unknown_runtime_error",
        { errorKeys: usageErrorKeys },
      ),
    },
    paidTools,
    paidToolEconomics,
    accountingIntegrity,
    evidence: {
      sourceTables: [
        "creditLedgerEntries",
        "workspaceComputeCharges",
        "workspaceCreditBalances",
        "workspaceUsageCollections",
        "checkoutSessions",
      ],
      scannedCreditLimit,
      scannedComputeLimit,
      scannedBalanceLimit,
      scannedIntegritySampleLimit,
      isTruncated:
        paidToolCreditGroups.some((group: any[]) => group.length >= scannedCreditLimit) ||
        unbilledComputeCharges.length >= scannedComputeLimit ||
        balanceRows.length >= scannedBalanceLimit ||
        staleReservedRows.length >= scannedIntegritySampleLimit ||
        pendingSettlementRows.length >= scannedIntegritySampleLimit,
    },
  };
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

async function readActiveTier(ctx: any, userId: any, nowMs: number): Promise<"free" | "architect" | "unknown"> {
  const rows = await ctx.db
    .query("userEntitlements")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  let tier: "free" | "architect" | "unknown" = "unknown";
  for (const row of rows) {
    if (row.startsAt > nowMs) continue;
    if (typeof row.endsAt === "number" && row.endsAt <= nowMs) continue;
    if (row.tier === "architect") return "architect";
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

async function buildOperatorCommunityRecord(ctx: any, community: any, nowMs: number) {
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
  const lastMemberActivityAt = activeMemberships.reduce((latest: number | null, row: any) => {
    const updatedAt = typeof row.updatedAt === "number" ? row.updatedAt : null;
    if (updatedAt == null) return latest;
    return latest == null ? updatedAt : Math.max(latest, updatedAt);
  }, null);
  const riskFlags: string[] = [];
  if (activeMemberships.length === 0) {
    riskFlags.push("no_members");
  }
  if (community.entryPolicy === "paid_subscription" && !currentPrice) {
    riskFlags.push("paid_missing_price");
  }
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
  if (lastMemberActivityAt != null && nowMs - lastMemberActivityAt >= STALE_COMMUNITY_ACTIVITY_AGE_MS) {
    riskFlags.push("stale_member_activity");
  }

  const tier = await readActiveTier(ctx, community.ownerId, nowMs);
  const checkoutStarts = checkouts.length;
  return {
    creator: {
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
      lastMemberActivityAt,
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

export const listOperatorCommunitiesInternal = internalQuery({
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
      const record = await buildOperatorCommunityRecord(ctx, community, nowMs);
      if (normalizedQuery) {
        const haystack = [
          record.creator.displayName,
          record.creator.email,
          record.community.name,
          record.community.slug,
        ].join(" ").toLowerCase();
        if (!haystack.includes(normalizedQuery)) continue;
      }
      records.push(record);
    }
    records.sort((left: any, right: any) => {
      const mrrDelta =
        Number(right.money?.estimatedMrr?.amountBaseUnits ?? 0) -
        Number(left.money?.estimatedMrr?.amountBaseUnits ?? 0);
      if (mrrDelta !== 0) return mrrDelta;
      const memberDelta =
        Number(right.members?.activeMemberships ?? 0) -
        Number(left.members?.activeMemberships ?? 0);
      if (memberDelta !== 0) return memberDelta;
      const updatedDelta =
        Number(right.community?.updatedAt ?? 0) -
        Number(left.community?.updatedAt ?? 0);
      if (updatedDelta !== 0) return updatedDelta;
      return String(left.community?.name ?? "").localeCompare(String(right.community?.name ?? ""));
    });
    return records.slice(0, limit);
  },
});

export const getOperatorCommunitySnapshotInternal = internalQuery({
  args: {
    communityId: v.optional(v.id("communities")),
    communityCreatorUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    let community = args.communityId ? await ctx.db.get(args.communityId) : null;
    if (!community && args.communityCreatorUserId) {
      community = await ctx.db
        .query("communities")
        .withIndex("by_owner", (q: any) => q.eq("ownerId", args.communityCreatorUserId))
        .first();
    }
    if (!community) return null;
    return await buildOperatorCommunityRecord(ctx, community, Date.now());
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
    let activeCommunities = 0;
    let totalCommunityMembers = 0;
    let setupRiskCommunities = 0;
    let staleCommunities = 0;
    let riskItems = 0;
    for (const community of communities) {
      const record = await buildOperatorCommunityRecord(ctx, community, nowMs);
      activePaidMembers += record.money.activePaidMembers;
      if (record.money.activePaidMembers > 0) paidCommunities += 1;
      totalCommunityMembers += record.members.activeMemberships;
      if (record.members.activeMemberships > 0) activeCommunities += 1;
      estimatedMrr = addMoney(estimatedMrr, record.money.estimatedMrr);
      if (record.risk.flags.some((flag: string) => COMMUNITY_SETUP_RISK_FLAGS.has(flag))) setupRiskCommunities += 1;
      if (record.risk.flags.includes("stale_member_activity")) staleCommunities += 1;
      if (record.risk.flags.length > 0) riskItems += record.risk.flags.length;
    }
    const events = await ctx.db.query("criticalAuditEvents").collect();
    const recentCriticalEvents = rangeStart == null
      ? events.length
      : events.filter((row: any) => row.createdAt >= rangeStart).length;
    return {
      computedAt: nowMs,
      totals: {
        communityCreators: new Set(communities.map((row: any) => String(row.ownerId))).size,
        communities: communities.length,
        activeCommunities,
        totalCommunityMembers,
        averageMembersPerCommunity: communities.length > 0 ? totalCommunityMembers / communities.length : null,
        paidCommunities,
        paidCommunityConversionRate: conversionRate(paidCommunities, communities.length),
        activePaidMembers,
        estimatedMrr,
        averageMrrPerCommunity: divideMoney(estimatedMrr, communities.length),
        setupRiskCommunities,
        staleCommunities,
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

export const getOperatorAccountSetupSnapshotInternal = internalQuery({
  args: {
    query: v.optional(v.string()),
    currentStep: v.optional(
      v.union(
        v.literal("identity"),
        v.literal("inference"),
        v.literal("complete"),
      ),
    ),
    completed: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const records = await buildOperatorAccountSetupRecords(ctx, nowMs);
    return {
      overview: buildOperatorAccountSetupOverview(records, nowMs),
      users: buildOperatorAccountSetupUserList(records, args),
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
        assetChecks: 0,
        assetFailures: 0,
        frontendCrashEvents: frontendCrashEvents.length,
        moduleLoadRecoveries: moduleLoadRecoveries.length,
        staleBuildWarnings: staleBuildWarnings.length,
      },
      routeChecks: [],
      assetChecks: [],
      latestEvents: deployRows.slice(0, 8).map(mapDiagnosticEvent),
      evidence: {
        sourceTables: ["platformDiagnosticEvents"],
        routeProbePaths: [],
        assetProbePaths: [],
        routeProbeTimeoutMs: null,
        versionJsonReachable: null,
        frontendCrashSource: "platformDiagnosticEvents",
        frontendCrashCoverage: "first_party_deploy_events_only",
        sentryBacked: false,
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
    const businessVisitRowsPromise = rangeStart == null
      ? ctx.db.query("platformBusinessVisits" as any).collect()
      : ctx.db
        .query("platformBusinessVisits" as any)
        .withIndex("by_createdAt", (q: any) => q.gte("createdAt", rangeStart))
        .collect();
    const [
      checkouts,
      users,
      communities,
      communityMemberships,
      businessVisitRows,
      emailOutboxRows,
      emailDeliveryRows,
    ] = await Promise.all([
      ctx.db.query("checkoutSessions").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("communities").collect(),
      ctx.db.query("communityMemberships").collect(),
      businessVisitRowsPromise,
      ctx.db.query("emailOutbox").collect(),
      ctx.db.query("emailDeliveries").collect(),
    ]);
    const accountUsers = users.filter(isAccountUserRow);
    const accountUserIds = new Set<string>(accountUsers.map((row: any) => String(row._id)));
    const communityById = new Map<string, any>(communities.map((row: any) => [String(row._id), row]));
    const communityCreatorUserIds = new Set<string>(communities.map((row: any) => String(row.ownerId)));
    const communitiesWithFirstMemberIds = new Set<string>();
    const activatedCommunityCreatorIds = new Set<string>();
    for (const membership of communityMemberships) {
      if (membership.active === false || membership.revokedAt) continue;
      const communityId = String(membership.communityId ?? "");
      const community = communityById.get(communityId);
      if (!community) continue;
      if (String(membership.userId) === String(community.ownerId)) continue;
      communitiesWithFirstMemberIds.add(communityId);
      activatedCommunityCreatorIds.add(String(community.ownerId));
    }
    const inRangeCheckouts = rangeStart == null
      ? checkouts
      : checkouts.filter((row: any) => row.createdAt >= rangeStart);
    const newUsers = rangeStart == null
      ? accountUsers
      : accountUsers.filter((row: any) => row.createdAt >= rangeStart);
    const newCommunities = rangeStart == null
      ? communities
      : communities.filter((row: any) => row.createdAt >= rangeStart);
    const newCommunitiesWithFirstMember = newCommunities.filter((row: any) =>
      communitiesWithFirstMemberIds.has(String(row._id)),
    );
    const uniqueVisitorHashes = new Set(
      businessVisitRows
        .map((row: any) => String(row.visitorKeyHash ?? "").trim())
        .filter(Boolean),
    );
    const uniqueVisitorCount = uniqueVisitorHashes.size;
    const identifiedVisitorHashes = new Set(
      businessVisitRows
        .filter((row: any) => row.userId)
        .map((row: any) => String(row.visitorKeyHash ?? "").trim())
        .filter(Boolean),
    );
    const identifiedVisitorCount = identifiedVisitorHashes.size;
    const inRangeEmailOutboxRows = rangeStart == null
      ? emailOutboxRows
      : emailOutboxRows.filter((row: any) => row.createdAt >= rangeStart);
    const inRangeEmailDeliveryRows = rangeStart == null
      ? emailDeliveryRows
      : emailDeliveryRows.filter((row: any) => row.createdAt >= rangeStart);
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
    const activePaidCommunityIds = new Set<string>(
      activeSubscriptions
        .map((row: any) => String(row.communityId ?? "").trim())
        .filter(Boolean),
    );
    const paidCommunitiesWithMembers = Array.from(activePaidCommunityIds).filter((communityId) =>
      communitiesWithFirstMemberIds.has(communityId),
    ).length;
    const completedCheckouts = checkouts.filter((row: any) => row.status === "complete");
    const creditTopupCheckouts = inRangeCheckouts.filter((row: any) => row.mode === "workspace_credit_topup");
    const creditTopupCompletions = creditTopupCheckouts.filter((row: any) => row.status === "complete");
    const communityJoinCheckouts = inRangeCheckouts.filter((row: any) => row.mode === "community_join");
    const communityJoinCompletions = communityJoinCheckouts.filter((row: any) => row.status === "complete");
    const totalCompletions = inRangeCheckouts.filter((row: any) => row.status === "complete").length;
    const expiredCheckouts = inRangeCheckouts.filter((row: any) => row.status === "expired");
    const stalePendingCheckouts = inRangeCheckouts.filter((row: any) => {
      if (row.status !== "pending") return false;
      const expiresAt = Number(row.expiresAt ?? 0);
      return Number.isFinite(expiresAt) && expiresAt <= nowMs;
    });
    const activePayingCustomerIds = new Set<string>();
    for (const row of activeSubscriptions) {
      const userId = String(row.userId ?? "");
      if (accountUserIds.has(userId)) activePayingCustomerIds.add(userId);
    }
    const checkoutPurchaserIds = new Set<string>();
    for (const row of inRangeCheckouts) {
      const userId = String(row.ownerUserId ?? "");
      if (row.status === "complete" && accountUserIds.has(userId)) checkoutPurchaserIds.add(userId);
    }
    const usageBuyerIds = new Set<string>();
    for (const row of creditTopupCompletions) {
      const userId = String(row.ownerUserId ?? "");
      if (accountUserIds.has(userId)) usageBuyerIds.add(userId);
    }
    const knownPayingCustomerIds = new Set<string>([
      ...Array.from(activePayingCustomerIds),
      ...Array.from(checkoutPurchaserIds),
    ]);
    const lifetimeCheckoutPurchaserIds = new Set<string>();
    for (const row of completedCheckouts) {
      const userId = String(row.ownerUserId ?? "");
      if (accountUserIds.has(userId)) lifetimeCheckoutPurchaserIds.add(userId);
    }
    const communityCheckoutRevenueInRange = communityJoinCompletions.reduce(
      (total: MoneyMetric | null, row: any) => addMoney(total, moneyFromCheckout(row)),
      null,
    );
    let communityPlatformRevShareInRange: MoneyMetric | null = null;
    for (const row of communityJoinCompletions) {
      const communityId = String(row.communityId ?? "").trim();
      const community = communityById.get(communityId);
      const ownerId = String(community?.ownerId ?? "").trim();
      if (!ownerId) continue;
      communityPlatformRevShareInRange = addMoney(
        communityPlatformRevShareInRange,
        applyBpsToMoneyMetric(
          moneyFromCheckout(row),
          POLYNET_COMMUNITY_PLATFORM_FEE_BPS,
        ),
      );
    }
    const creditTopupRevenueInRange = creditTopupCompletions.reduce((total: MoneyMetric | null, row: any) => {
      const credits = Number(row.workspaceCreditsAmount ?? 0);
      const usd = credits > 0 ? credits / WORKSPACE_CREDITS_PER_USD : 0;
      return addMoney(total, moneyFromUsd(usd));
    }, null);
    const lifetimeCommunityCheckoutRevenue = completedCheckouts
      .filter((row: any) => row.mode === "community_join")
      .reduce((total: MoneyMetric | null, row: any) => addMoney(total, moneyFromCheckout(row)), null);
    const lifetimeCreditTopupRevenue = completedCheckouts
      .filter((row: any) => row.mode === "workspace_credit_topup")
      .reduce((total: MoneyMetric | null, row: any) => {
        const credits = Number(row.workspaceCreditsAmount ?? 0);
        const usd = credits > 0 ? credits / WORKSPACE_CREDITS_PER_USD : 0;
        return addMoney(total, moneyFromUsd(usd));
      }, null);
    const lifetimeGrossRevenue = addMoney(lifetimeCommunityCheckoutRevenue, lifetimeCreditTopupRevenue);
    const emailSent = inRangeEmailOutboxRows.filter((row: any) => row.status === "sent").length;
    const emailDelivered = inRangeEmailDeliveryRows.filter((row: any) => {
      const eventType = String(row.eventType ?? "").toLowerCase();
      return eventType.includes("delivered");
    }).length;
    const emailOpened = inRangeEmailDeliveryRows.filter((row: any) => {
      const eventType = String(row.eventType ?? "").toLowerCase();
      return eventType.includes("opened");
    }).length;
    const emailClicked = inRangeEmailDeliveryRows.filter((row: any) => {
      const eventType = String(row.eventType ?? "").toLowerCase();
      return eventType.includes("clicked");
    }).length;
    const emailBouncedOrFailed = inRangeEmailDeliveryRows.filter((row: any) => {
      const eventType = String(row.eventType ?? "").toLowerCase();
      return eventType.includes("bounced") ||
        eventType.includes("failed") ||
        eventType.includes("suppressed") ||
        eventType.includes("complained");
    }).length;
    const grossRevenueInRange = addMoney(communityCheckoutRevenueInRange, creditTopupRevenueInRange);
    return {
      computedAt: nowMs,
      creditTopupCheckoutStarts: creditTopupCheckouts.length,
      creditTopupCheckoutCompletions: creditTopupCompletions.length,
      communityCheckoutStarts: communityJoinCheckouts.length,
      communityCheckoutCompletions: communityJoinCompletions.length,
      activeCommunitySubscriptions: activeSubscriptions.length,
      estimatedCommunityMrr,
      businessKpis: {
        visitors: {
          total: uniqueVisitorCount,
          identified: identifiedVisitorCount,
          visitorToUserConversionRate: conversionRate(identifiedVisitorCount, uniqueVisitorCount),
          availability: "available",
          source: "first_party",
        },
        users: {
          total: accountUsers.length,
          newInRange: newUsers.length,
          activePayingCustomers: activePayingCustomerIds.size,
          usageBuyersInRange: usageBuyerIds.size,
          checkoutPurchasersInRange: checkoutPurchaserIds.size,
          knownPayingCustomers: knownPayingCustomerIds.size,
          visitorToUserConversionRate: conversionRate(identifiedVisitorCount, uniqueVisitorCount),
          userToPayingCustomerConversionRate: conversionRate(checkoutPurchaserIds.size, newUsers.length),
        },
        communities: {
          totalCreated: communities.length,
          createdInRange: newCommunities.length,
          creationRateFromNewUsers: conversionRate(newCommunities.length, newUsers.length),
          totalCommunityCreators: communityCreatorUserIds.size,
          activatedCommunityCreators: activatedCommunityCreatorIds.size,
          communityCreatorActivationRate: conversionRate(
            activatedCommunityCreatorIds.size,
            communityCreatorUserIds.size,
          ),
          communitiesWithFirstMember: communitiesWithFirstMemberIds.size,
          communityActivationRate: conversionRate(communitiesWithFirstMemberIds.size, communities.length),
          paidCommunitiesWithMembers,
          paidCommunityMemberActivationRate: conversionRate(paidCommunitiesWithMembers, activePaidCommunityIds.size),
          createdInRangeWithFirstMember: newCommunitiesWithFirstMember.length,
          createdInRangeActivationRate: conversionRate(newCommunitiesWithFirstMember.length, newCommunities.length),
        },
        revenue: {
          communitySubscriptionMrr: estimatedCommunityMrr,
          communityCheckoutRevenueInRange,
          communityPlatformRevShareInRange,
          communityPlatformRevShareAvailability: "estimated_from_current_fee_policy",
          creditTopupRevenueInRange,
          grossRevenueInRange,
          averageRecordedLifetimeValue: divideMoney(lifetimeGrossRevenue, lifetimeCheckoutPurchaserIds.size),
          platformNetRevenueInRange: null,
          platformNetRevenueAvailability: "not_instrumented",
        },
        checkouts: {
          totalStarts: inRangeCheckouts.length,
          totalCompletions,
          totalConversionRate: conversionRate(totalCompletions, inRangeCheckouts.length),
          failedOrAbandoned: expiredCheckouts.length + stalePendingCheckouts.length,
          pending: inRangeCheckouts.filter((row: any) => row.status === "pending").length,
          expired: expiredCheckouts.length,
          communityStarts: communityJoinCheckouts.length,
          communityCompletions: communityJoinCompletions.length,
          creditTopupStarts: creditTopupCheckouts.length,
          creditTopupCompletions: creditTopupCompletions.length,
        },
        email: {
          sent: emailSent,
          delivered: emailDelivered,
          opened: emailOpened,
          clicked: emailClicked,
          bouncedOrFailed: emailBouncedOrFailed,
          clickRate: conversionRate(emailClicked, emailDelivered || emailSent),
          conversionRate: null,
          conversionAvailability: "not_attributed",
        },
      },
      evidence: {
        sourceTables: [
          "users",
          "communities",
          "communityMemberships",
          "platformBusinessVisits",
          "checkoutSessions",
          "communitySubscriptions",
          "communityPricePoints",
          "emailOutbox",
          "emailDeliveries",
        ],
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
    const recentAuthRows = authRows.filter(
      (row: any) =>
        Number(row.createdAt ?? 0) >= nowMs - AUTH_AVAILABILITY_RECENT_WINDOW_MS &&
        AUTH_AVAILABILITY_EVENT_TYPES.has(String(row.eventType ?? "")),
    );
    const recentAuthSuccessRows = recentAuthRows.filter((row: any) =>
      AUTH_AVAILABILITY_SUCCESS_EVENT_TYPES.has(String(row.eventType ?? "")) &&
      row.status === "succeeded",
    );
    const recentAuthFailureRows = recentAuthRows.filter((row: any) => row.status === "failed");
    const recentUnknownAuthFailures = recentAuthFailureRows.filter((row: any) => {
      const errorCode = String(row.errorCode ?? "").trim().toLowerCase();
      return !errorCode || errorCode === "unknown" || errorCode === "auth_unknown";
    });
    const recentAffectedUsers = new Set(
      recentAuthFailureRows
        .map((row: any) => String(row.userId ?? "").trim())
        .filter(Boolean),
    );
    const recentUnattributedFailures = recentAuthFailureRows.filter((row: any) => !row.userId).length;
    const authAttempts = recentAuthRows.length;
    const authSuccessRate = authAttempts > 0 ? recentAuthSuccessRows.length / authAttempts : null;
    const authAvailabilityScore =
      authSuccessRate === null
        ? null
        : clampOperatorScore(
            100 -
              Math.max(recentAuthFailureRows.length > 0 ? 1 : 0, Math.round((1 - authSuccessRate) * 70)) -
              Math.min(20, recentUnknownAuthFailures.length * 5) -
              Math.min(12, recentUnattributedFailures * 2),
          );
    const authAvailabilityHealth: "healthy" | "degraded" | "incident" | "unknown" =
      authSuccessRate === null
        ? "unknown"
        : authSuccessRate < 0.95 || recentUnknownAuthFailures.length >= 3
          ? "incident"
          : authSuccessRate < 0.99 || recentUnknownAuthFailures.length > 0
            ? "degraded"
            : "healthy";
    const entitlementFindingsList = Array.isArray(entitlementFindings) ? entitlementFindings : [];
    const entitlementErrorFindings = entitlementFindingsList.filter((finding: any) => finding.severity === "error").length;
    const unknownAuthErrors = authFailureRows.filter((row: any) => {
      const errorCode = String(row.errorCode ?? "").trim().toLowerCase();
      return !errorCode || errorCode === "unknown" || errorCode === "auth_unknown";
    }).length;
    const accessWarningRows = accessRows.filter((row: any) => row.severity === "warning");
    const accessErrorRows = accessRows.filter((row: any) => row.severity === "error");
    const accessIntegrityScore = clampOperatorScore(
      100 -
        Math.min(45, accessErrorRows.length * 12 + entitlementErrorFindings * 10) -
        Math.min(30, accessWarningRows.length * 6) -
        Math.min(25, Math.max(0, entitlementFindingsList.length - entitlementErrorFindings) * 4),
    );
    const accessIntegrityHealth: "healthy" | "degraded" | "incident" | "unknown" =
      accessErrorRows.length > 0 || entitlementErrorFindings > 0
        ? "incident"
        : accessWarningRows.length > 0 || entitlementFindingsList.length > 0
          ? "degraded"
          : buildOperatorHealthFromScore(accessIntegrityScore);
    const health: "healthy" | "degraded" | "incident" | "unknown" =
      authAvailabilityHealth === "incident" || accessIntegrityHealth === "incident"
        ? "incident"
        : authAvailabilityHealth === "unknown"
          ? "unknown"
          : authAvailabilityHealth === "degraded" || accessIntegrityHealth === "degraded"
            ? "degraded"
            : "healthy";

    return {
      computedAt: nowMs,
      range,
      health,
      authAvailability: {
        health: authAvailabilityHealth,
        score: authAvailabilityScore,
        windowMs: AUTH_AVAILABILITY_RECENT_WINDOW_MS,
        attempts: authAttempts,
        successes: recentAuthSuccessRows.length,
        failures: recentAuthFailureRows.length,
        successRate: authSuccessRate,
        affectedUsers: recentAffectedUsers.size,
        unattributedFailures: recentUnattributedFailures,
        bootstrapFailures: recentAuthFailureRows.filter((row: any) => row.eventType === "auth.bootstrap_failed").length,
        refreshFailures: recentAuthFailureRows.filter((row: any) => row.eventType === "auth.session_refresh_failed").length,
        unknownFailures: recentUnknownAuthFailures.length,
      },
      accessIntegrity: {
        health: accessIntegrityHealth,
        score: accessIntegrityScore,
        accessEvents: accessRows.length,
        warnings: accessWarningRows.length,
        errors: accessErrorRows.length,
        operatorAccessDenied: accessRows.filter((row: any) => row.eventType === "access.operator_access_denied").length,
        communityAccessDenied: accessRows.filter((row: any) => row.eventType === "access.community_denied").length,
        entitlementFindings: entitlementFindingsList.length,
        entitlementErrorFindings,
      },
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
    const failedSecurityEvents = rows.filter((row: any) => row.severity === "error" || row.status === "failed");
    const unknownSecurityEventIds = new Set(unknownSecurityEvents.map((row: any) => String(row._id)));
    const failedTrustEvents = failedSecurityEvents.filter((row: any) => {
      const eventType = String(row.eventType ?? "");
      if (WEBHOOK_FAILURE_AUDIT_EVENT_TYPES.has(eventType)) return false;
      return !unknownSecurityEventIds.has(String(row._id));
    });
    const operatorAccessBlockIds = new Set(operatorAccessBlocks.map((row: any) => String(row._id)));
    const blockedBoundaryActions = blockedActions.filter((row: any) => {
      const eventType = String(row.eventType ?? "");
      if (eventType === "account_delete_blocked") return false;
      return !operatorAccessBlockIds.has(String(row._id));
    });
    const trustBoundaryRows = dedupeAuditRows([
      ...failedSecurityEvents,
      ...webhookFailures,
      ...blockedBoundaryActions,
      ...operatorAccessBlocks,
      ...unknownSecurityEvents,
    ]);
    const trustBoundaryScore = clampOperatorScore(
      100 -
        Math.min(45, webhookFailures.length * 18) -
        Math.min(32, failedTrustEvents.length * 16) -
        Math.min(32, operatorAccessBlocks.length * 16) -
        Math.min(24, unknownSecurityEvents.length * 20) -
        Math.min(24, blockedBoundaryActions.length * 16),
    );
    const health = buildOperatorHealthFromScore(trustBoundaryScore);
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
      trustBoundary: {
        health,
        score: trustBoundaryScore,
        findings: trustBoundaryRows.length,
        failedEvents: failedTrustEvents.length,
        webhookFailures: webhookFailures.length,
        blockedBoundaryActions: blockedBoundaryActions.length,
        operatorAccessBlocks: operatorAccessBlocks.length,
        unknownSecurityEvents: unknownSecurityEvents.length,
        attentionItems: trustBoundaryRows.slice(0, 8).map(mapSecurityAuditAttentionItem),
      },
      auditActivity: {
        events: rows.length,
        warnings: warnings.length,
        errors: errors.length,
        blockedActions: blockedActions.length,
        destructiveActions: destructiveActions.length,
        operatorRoleChanges: operatorRoleChanges.length,
        billingTrustEvents: billingTrustEvents.length,
      },
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

export const getOperatorToolEconomicsInternal = internalQuery({
  args: {
    range: v.optional(v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("all"))),
  },
  handler: async (ctx, args): Promise<any> => {
    const nowMs = Date.now();
    const range = args.range ?? "30d";
    return await buildOperatorToolEconomicsSnapshot(ctx, range, nowMs);
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
    const [
      runtimeRunGroups,
      runtimeEventGroups,
      diagnosticGroups,
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
    ]);

    const runs: any[] = runtimeRunGroups.flat();
    const runtimeEvents: any[] = runtimeEventGroups.flat();
    const diagnosticRows: any[] = diagnosticGroups.flat().sort((a: any, b: any) => b.createdAt - a.createdAt);
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
    const runFailureCodeRows = runFailureRows.map((row: any) => ({
      ...row,
      __operatorFailureCode: normalizeRuntimeFailureCode(row.errorCode ?? row.reason ?? "unknown_runtime_error"),
    }));
    const toolFailureCodeRows = toolFailureRows.map((row: any) => ({
      ...row,
      __operatorFailureCode: readToolFailureCode(row),
    }));
    const runtimeDiagnosticCodeRows = runtimeDiagnosticRows.map((row: any) => {
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
    });
    const workspaceSessionCreateFailureCodeRows = workspaceSessionCreateFailureRows.map((row: any) => {
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
    });
    const isWorkspaceCreditFailureCodeRow = (row: any) =>
      String(row.__operatorFailureCode ?? "").startsWith("workspace_credits_");
    const executionRunFailureCodeRows = runFailureCodeRows.filter(
      (row: any) => !isWorkspaceCreditFailureCodeRow(row),
    );
    const executionToolFailureCodeRows = toolFailureCodeRows.filter(
      (row: any) => !isWorkspaceCreditFailureCodeRow(row),
    );
    const executionWorkspaceSessionCreateFailureCodeRows = workspaceSessionCreateFailureCodeRows.filter(
      (row: any) => !isWorkspaceCreditFailureCodeRow(row),
    );
    const executionRuntimeDiagnosticCodeRows = runtimeDiagnosticCodeRows.filter(
      (row: any) => !isWorkspaceCreditFailureCodeRow(row),
    );
    const executionFailureCodeRows = [
      ...executionRunFailureCodeRows,
      ...executionToolFailureCodeRows,
      ...executionRuntimeDiagnosticCodeRows,
      ...executionWorkspaceSessionCreateFailureCodeRows,
    ];
    const providerFailures =
      normalizedRunFailureCodes.filter((code) => code === "provider_failed").length +
      normalizedToolFailureCodes.filter((code) => code === "provider_failed").length;
    const rateLimitFailures =
      normalizedRunFailureCodes.filter((code) => code === "provider_rate_limited").length +
      normalizedToolFailureCodes.filter((code) => code === "provider_rate_limited").length;
    const sandboxCreateFailures =
      normalizedWorkspaceSessionCreateFailureCodes.filter((code) => code === "sandbox_create_failed").length +
      normalizedToolFailureCodes.filter((code) => code === "sandbox_create_failed").length;
    const toolCalls = Math.max(toolStartedRows.length, toolFinishedRows.length);
    const turnsSucceeded = runs.filter((row: any) => row.status === "ok").length;
    const turnsCancelled = runs.filter((row: any) => row.status === "cancelled").length;
    const turnsRunning = runs.filter((row: any) => row.status === "running").length;
    const turnTerminalCount = runs.filter((row: any) => row.status !== "running").length;
    const turnSuccessRate =
      turnTerminalCount > 0
        ? turnsSucceeded / turnTerminalCount
        : null;
    const toolFailureRate =
      toolFinishedRows.length > 0 ? toolFailureRows.length / toolFinishedRows.length : null;
    const executionTurnTerminalCount = turnsSucceeded + executionRunFailureCodeRows.length;
    const executionTurnSuccessRate =
      executionTurnTerminalCount > 0 ? turnsSucceeded / executionTurnTerminalCount : null;
    const workspaceCreditToolFailures = toolFailureCodeRows.length - executionToolFailureCodeRows.length;
    const executionToolFinishedCount = Math.max(0, toolFinishedRows.length - workspaceCreditToolFailures);
    const executionToolFailureRate =
      executionToolFinishedCount > 0 ? executionToolFailureCodeRows.length / executionToolFinishedCount : null;
    const executionToolFailureRows = toolFailureRows.filter(
      (row: any) => !readToolFailureCode(row).startsWith("workspace_credits_"),
    );
    const workspaceSessionCreateSuccessRows = workspaceSessionCreateRows.filter((row: any) => {
      const payload = readPayloadRecord(row);
      return normalizeOperatorKey(payload.status, "") !== "error";
    });
    const hasExecutionEvidence =
      turnsSucceeded > 0 ||
      executionRunFailureCodeRows.length > 0 ||
      executionToolFinishedCount > 0 ||
      workspaceSessionCreateSuccessRows.length > 0 ||
      executionWorkspaceSessionCreateFailureCodeRows.length > 0 ||
      executionRuntimeDiagnosticCodeRows.length > 0;
    const executionAvailabilityScore = hasExecutionEvidence
      ? clampOperatorScore(
          100 -
            (executionTurnSuccessRate == null ? 4 : Math.max(0, Math.round((1 - executionTurnSuccessRate) * 45))) -
            Math.min(35, Math.round((executionToolFailureRate ?? 0) * 45)) -
            Math.min(30, providerFailures * 12) -
            Math.min(18, rateLimitFailures * 6) -
            Math.min(30, sandboxCreateFailures * 10) -
            Math.min(15, executionRuntimeDiagnosticCodeRows.length * 3),
        )
      : null;
    const health = buildOperatorHealthFromScore(executionAvailabilityScore);
    const executionErrorKeys = new Set(["provider_failed", "sandbox_create_failed"]);

    return {
      computedAt: nowMs,
      range,
      health,
      executionAvailability: {
        health,
        score: executionAvailabilityScore,
        turnsStarted: runs.length,
        turnsSucceeded,
        turnsFailed: executionRunFailureCodeRows.length,
        turnsCancelled,
        turnsRunning,
        turnSuccessRate: executionTurnSuccessRate,
        toolCalls,
        toolFailures: executionToolFailureCodeRows.length,
        toolFailureRate: executionToolFailureRate,
        providerFailures,
        rateLimitFailures,
        sandboxCreateFailures,
        runtimeDiagnosticEvents: executionRuntimeDiagnosticCodeRows.length,
        topFailureCodes: buildRuntimeBucket(
          executionFailureCodeRows,
          (row: any) => row.__operatorFailureCode ?? "unknown_runtime_error",
          { errorKeys: executionErrorKeys },
        ),
        topFailingTools: buildRuntimeBucket(executionToolFailureRows, readToolName, {
          errorKeys: new Set(executionToolFailureRows.map(readToolName)),
        }),
      },
      totals: {
        turnsStarted: runs.length,
        turnsSucceeded,
        turnsFailed: runFailureRows.length,
        turnsCancelled,
        turnsRunning,
        toolCalls,
        toolFailures: toolFailureRows.length,
        runtimeDiagnosticEvents: runtimeDiagnosticRows.length,
        providerFailures,
        rateLimitFailures,
        sandboxCreateFailures,
      },
      rates: {
        turnSuccessRate,
        toolFailureRate,
      },
      topFailureCodes: buildRuntimeBucket(
        executionFailureCodeRows,
        (row: any) => row.__operatorFailureCode ?? "unknown_runtime_error",
        { errorKeys: executionErrorKeys },
      ),
      topFailingTools: buildRuntimeBucket(executionToolFailureRows, readToolName, {
        errorKeys: new Set(executionToolFailureRows.map(readToolName)),
      }),
      latestEvents: diagnosticRows.slice(0, 8).map(mapDiagnosticEvent),
      evidence: {
        sourceTables: [
          "runtimeRuns",
          "runtimeRunEvents",
          "platformDiagnosticEvents",
        ],
        scannedRunLimit,
        scannedEventLimit,
        isTruncated:
          runtimeRunGroups.some((group: any[]) => group.length >= scannedRunLimit) ||
          runtimeEventGroups.some((group: any[]) => group.length >= scannedEventLimit) ||
          diagnosticGroups.some((group: any[]) => group.length >= scannedEventLimit),
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
      communityCreatorUserId: event.subjectUserId ? String(event.subjectUserId) : null,
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
      const record = await buildOperatorCommunityRecord(ctx, community, nowMs);
      for (const flag of record.risk.flags) {
        riskItems.push({
          id: `community_creator:${record.community.communityId}:${flag}`,
          severity: "warning",
          kind: flag,
          title: `${record.community.name}: ${flag}`,
          communityCreatorUserId: record.creator.userId,
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
