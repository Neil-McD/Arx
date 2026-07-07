import { internal } from "./_generated/api";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  DEFAULT_INCLUDED_TOOL_CREDITS,
  CREDIT_RESERVATION_EXPIRY_MS,
  creditsToUsd,
  estimateWorkspaceComputeUsd,
  formatWorkspaceToolBalanceUsdFromCredits,
  getSpendableWorkspaceToolBalanceCredits,
  getOutstandingWorkspaceToolUsageCredits,
  getPendingCardCollectionWorkspaceToolBalanceCredits,
  getUncollectedWorkspaceToolBalanceCredits,
  PAID_TOOL_LEDGER_TOOL_NAMES,
  priceWorkspaceUsageCredits,
  WORKSPACE_CARD_COLLECTION_MIN_CREDITS,
  WORKSPACE_CARD_COLLECTION_STALE_PREPARED_MS,
  WORKSPACE_CREDIT_TOPUP_CREDITS,
  WORKSPACE_CREDIT_LOW_BALANCE_THRESHOLD,
  WORKSPACE_TOOL_BALANCE_TOPUP_CHECKOUT_TTL_MS,
} from "../shared/workspaceCredits";
import { resolveAuthenticatedActor } from "./authActor";
import {
  getStripeClient,
} from "./stripeCore";
import {
  attachStripeCustomerToUser,
} from "./stripeCustomers";
import { requireOperatorRole } from "./operatorAccess";
import { recordPaidToolUsagePartnerCommission } from "./builderPartners";
import { loadBlaxelWorkspaceConfig } from "./blaxelWorkspaceClient";
import type {
  ProviderCostBillingDisposition,
  ProviderCostCategory,
  ProviderCostComponent,
  ProviderCostEvidenceType,
} from "../shared/providerCostAccounting";
import {
  BLAXEL_STANDBY_SNAPSHOT_STORAGE_USD_PER_GB_SECOND,
  BLAXEL_VOLUME_STORAGE_USD_PER_GB_SECOND,
  PROVIDER_COST_COMPONENTS,
  estimateBlaxelStorageCostUsd,
  roundProviderCostQuantity,
  roundProviderCostUsd,
  resolveProviderCostAccountingHourBucket,
} from "../shared/providerCostAccounting";
import {
  isWorkspaceProjectDisplayable,
  resolveWorkspaceProjectResourceTruth,
} from "../shared/workspaceProjectResources";

function roundCurrency(value: number): number {
  return Math.round((Number(value) || 0) * 10000) / 10000;
}

function roundCredits(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mbToGb(value: unknown): number {
  const mb = Math.max(0, Number(value) || 0);
  return mb / 1024;
}

function normalizeState(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isDeletedProviderState(value: unknown): boolean {
  const state = normalizeState(value);
  return state === "deleted" || state === "terminated" || state === "destroyed";
}

const PROVIDER_COST_STORAGE_ACCOUNTING_DEFAULT_PAGE_SIZE = 100;
const PROVIDER_COST_STORAGE_ACCOUNTING_MAX_PAGE_SIZE = 500;
const PROVIDER_COST_STORAGE_ACCOUNTING_MAX_PAGES_PER_RUN = 5;
const PROVIDER_COST_MARGIN_DIAGNOSTIC_DEFAULT_LIMIT = 1000;
const PROVIDER_COST_MARGIN_DIAGNOSTIC_MAX_LIMIT = 5000;
const PROVIDER_COST_MARGIN_DIAGNOSTIC_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const PROVIDER_COST_RECONCILIATION_DEFAULT_LEDGER_LIMIT = 250;
const PROVIDER_COST_RECONCILIATION_MAX_LEDGER_LIMIT = 1000;
const PROVIDER_COST_RECONCILIATION_DEFAULT_COMPUTE_LIMIT_PER_DEBIT_SOURCE = 100;
const PROVIDER_COST_RECONCILIATION_MAX_COMPUTE_LIMIT_PER_DEBIT_SOURCE = 250;
const PROVIDER_COST_RECONCILIATION_DEFAULT_SAMPLE_LIMIT = 25;
const PROVIDER_COST_RECONCILIATION_MAX_SAMPLE_LIMIT = 50;
const WORKSPACE_ACCOUNTING_RECONCILIATION_DEFAULT_LIMIT = 25;
const WORKSPACE_ACCOUNTING_RECONCILIATION_MAX_LIMIT = 100;
const WORKSPACE_ACCOUNTING_RECONCILIATION_LOOKBACK_MS = 31 * 24 * 60 * 60 * 1000;
const WORKSPACE_ACCOUNTING_AUTO_RECHARGE_PROCESSING_WITHOUT_PAYMENT_ID_STALE_MS =
  5 * 60 * 1000;
const WORKSPACE_ACCOUNTING_AUTO_RECHARGE_PROCESSING_WITHOUT_PAYMENT_ID_EXPIRED_MS =
  12 * 60 * 60 * 1000;
const WORKSPACE_ACCOUNTING_PAYMENT_INTENT_PROCESSING_STALE_MS = 30 * 60 * 1000;
const WORKSPACE_ACCOUNTING_INVARIANT_DEFAULT_LIMIT = 25;
const WORKSPACE_ACCOUNTING_INVARIANT_MAX_LIMIT = 100;
const WORKSPACE_COMPUTE_DEBIT_SOURCES = [
  "included",
  "purchased",
  "mixed",
  "unbilled",
] as const;

function clampProviderCostDiagnosticLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return PROVIDER_COST_MARGIN_DIAGNOSTIC_DEFAULT_LIMIT;
  return Math.max(
    1,
    Math.min(PROVIDER_COST_MARGIN_DIAGNOSTIC_MAX_LIMIT, Math.floor(parsed)),
  );
}

function clampProviderCostReconciliationLimit(
  value: unknown,
  defaults: { defaultLimit: number; maxLimit: number },
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaults.defaultLimit;
  return Math.max(1, Math.min(defaults.maxLimit, Math.floor(parsed)));
}

function clampProviderCostReconciliationLedgerLimit(value: unknown): number {
  return clampProviderCostReconciliationLimit(value, {
    defaultLimit: PROVIDER_COST_RECONCILIATION_DEFAULT_LEDGER_LIMIT,
    maxLimit: PROVIDER_COST_RECONCILIATION_MAX_LEDGER_LIMIT,
  });
}

function clampProviderCostReconciliationComputeLimitPerDebitSource(
  value: unknown,
): number {
  return clampProviderCostReconciliationLimit(value, {
    defaultLimit: PROVIDER_COST_RECONCILIATION_DEFAULT_COMPUTE_LIMIT_PER_DEBIT_SOURCE,
    maxLimit: PROVIDER_COST_RECONCILIATION_MAX_COMPUTE_LIMIT_PER_DEBIT_SOURCE,
  });
}

function clampProviderCostReconciliationSampleLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return PROVIDER_COST_RECONCILIATION_DEFAULT_SAMPLE_LIMIT;
  return Math.max(0, Math.min(PROVIDER_COST_RECONCILIATION_MAX_SAMPLE_LIMIT, Math.floor(parsed)));
}

function resolveWorkspaceProviderMarginDiagnosticPeriod(args: {
  periodStart?: number;
  periodEnd?: number;
  nowMs?: number;
}): { periodStart: number; periodEnd: number } {
  const explicitStart = normalizeOptionalNumber(args.periodStart);
  const explicitEnd = normalizeOptionalNumber(args.periodEnd);
  if (explicitStart !== undefined || explicitEnd !== undefined) {
    const periodStart = Math.max(0, Math.floor(explicitStart ?? 0));
    const fallbackEnd = periodStart + 31 * 24 * 60 * 60 * 1000;
    const periodEnd = Math.max(periodStart, Math.floor(explicitEnd ?? fallbackEnd));
    return { periodStart, periodEnd };
  }

  const nowMs = normalizeOptionalNumber(args.nowMs) ?? Date.now();
  const nowDate = new Date(nowMs);
  const periodStart = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1);
  const periodEnd = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() + 1, 1);
  return { periodStart, periodEnd };
}

function createDiagnosticMoneyBucket(label: string) {
  return {
    label,
    count: 0,
    polynetPriceUsd: 0,
    rawVendorCostUsd: 0,
  };
}

function roundDiagnosticUsd(value: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100000000) / 100000000;
}

function diagnosticAgeMs(nowMs: number, value: unknown): number | null {
  const timestamp = normalizeOptionalNumber(value);
  if (timestamp === undefined || !(timestamp > 0)) return null;
  return Math.max(0, nowMs - timestamp);
}

function diagnosticTimestamp(value: unknown): number | null {
  const timestamp = normalizeOptionalNumber(value);
  return timestamp !== undefined && timestamp > 0 ? timestamp : null;
}

function allocateProviderCostToDiagnosticPeriod(args: {
  row: any;
  periodStart: number;
  periodEnd: number;
}): number {
  const rawVendorCostUsd = normalizeOptionalNumber(args.row?.rawVendorCostUsd) ?? 0;
  if (!(rawVendorCostUsd > 0)) return 0;
  const rowPeriodStart = normalizeOptionalNumber(args.row?.periodStart) ?? args.periodStart;
  const rowPeriodEnd = Math.max(
    rowPeriodStart,
    normalizeOptionalNumber(args.row?.periodEnd) ?? rowPeriodStart,
  );
  if (!(rowPeriodEnd > rowPeriodStart)) {
    return rowPeriodStart >= args.periodStart && rowPeriodStart < args.periodEnd
      ? rawVendorCostUsd
      : 0;
  }
  const overlapStart = Math.max(rowPeriodStart, args.periodStart);
  const overlapEnd = Math.min(rowPeriodEnd, args.periodEnd);
  const overlapMs = Math.max(0, overlapEnd - overlapStart);
  if (overlapMs <= 0) return 0;
  return rawVendorCostUsd * (overlapMs / (rowPeriodEnd - rowPeriodStart));
}

function isBlaxelWorkspaceComputeReservation(entry: any): boolean {
  return (
    normalizeOptionalString(entry?.toolName) === "workspace_compute" &&
    normalizeOptionalString(entry?.vendor) === "blaxel" &&
    Boolean(entry?.projectId)
  );
}

function isBlaxelRuntimeWorkspaceReservation(entry: any): boolean {
  return (
    isBlaxelWorkspaceComputeReservation(entry) &&
    normalizeOptionalString(entry?.action) === "runtime_workspace_session"
  );
}

async function hasRunningRuntimeRunForWorkspaceReservation(ctx: any, entry: any): Promise<boolean> {
  if (!isBlaxelRuntimeWorkspaceReservation(entry)) return false;
  const runId = normalizeOptionalString(entry?.runId);
  if (!runId) return false;
  const projectId = normalizeOptionalString(entry?.projectId);
  if (!projectId) return false;
  const run = await ctx.db
    .query("runtimeRuns")
    .withIndex("by_owner_runId", (q: any) =>
      q.eq("ownerId", entry.userId).eq("runId", runId),
    )
    .first();
  return (
    normalizeOptionalString(run?.status) === "running" &&
    normalizeOptionalString(run?.projectId) === projectId
  );
}

async function hasActiveBlaxelProjectWorkspaceLeasePointer(ctx: any, entry: any): Promise<boolean> {
  if (!isBlaxelWorkspaceComputeReservation(entry)) return false;
  const projectId = entry?.projectId;
  if (!projectId) return false;
  const project = await ctx.db.get(projectId);
  const pointerMatches =
    normalizeOptionalString(project?.providerSandboxProviderId) === "blaxel" &&
    normalizeOptionalString(project?.providerSandboxCreditReservationKey) ===
      normalizeOptionalString(entry?.creditKey);
  return pointerMatches;
}

async function shouldSkipExpiredBlaxelWorkspaceReservation(ctx: any, entry: any): Promise<boolean> {
  if (await hasActiveBlaxelProjectWorkspaceLeasePointer(ctx, entry)) {
    return true;
  }
  if (isBlaxelRuntimeWorkspaceReservation(entry)) {
    return await hasRunningRuntimeRunForWorkspaceReservation(ctx, entry);
  }
  return false;
}

function hasRuntimeWorkspaceEvidence(run: any, reservations: any[]): boolean {
  const workspaceState = normalizeOptionalString(run?.workspaceSessionState);
  return (
    reservations.length > 0 ||
    Boolean(normalizeOptionalString(run?.workspaceProviderSandboxId)) ||
    (workspaceState !== undefined && workspaceState !== "none")
  );
}

async function resolveStaleRuntimeWorkspaceProviderSandboxId(params: {
  ctx: any;
  run: any;
  reservation: any;
}): Promise<string | undefined> {
  const runSandboxId = normalizeOptionalString(params.run?.workspaceProviderSandboxId);
  if (runSandboxId) return runSandboxId;
  const projectId = params.reservation?.projectId;
  if (!projectId) return undefined;
  try {
    const project = await params.ctx.runQuery(
      (internal as any).projects.getCloudProjectByIdInternal,
      {
        projectId,
      },
    );
    const projectSandboxId = normalizeOptionalString(project?.providerSandboxId);
    const reservationKeyMatches =
      normalizeOptionalString(project?.providerSandboxProviderId) === "blaxel" &&
      normalizeOptionalString(project?.providerSandboxCreditReservationKey) ===
        normalizeOptionalString(params.reservation?.creditKey);
    return reservationKeyMatches ? projectSandboxId : undefined;
  } catch {
    return undefined;
  }
}

function buildStaleRuntimeWorkspaceSettlement(params: {
  run: any;
  reservation: any;
  providerSandboxId: string;
  nowMs: number;
}): {
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  sandboxCpu: number;
  sandboxMemoryGiB: number;
  sandboxDiskGiB: number;
  computeCostUsd: number;
  creditsDebited: number;
  metadata: Record<string, unknown>;
} {
  const reservationMetadata = normalizeObjectMetadata(params.reservation?.metadata);
  const startedAt = Math.floor(
    normalizeOptionalNumber(params.reservation?.createdAt) ??
      normalizeOptionalNumber(params.run?.startedAt) ??
      params.nowMs,
  );
  const endedAt = Math.floor(params.nowMs);
  const durationSeconds = Math.max(0, (endedAt - startedAt) / 1000);
  const sandboxCpu = Math.max(0, normalizeOptionalNumber(reservationMetadata.sandbox_cpu) ?? 0);
  const sandboxMemoryGiB = Math.max(
    0,
    normalizeOptionalNumber(reservationMetadata.sandbox_memory_gib) ?? 0,
  );
  const sandboxDiskGiB = Math.max(
    0,
    normalizeOptionalNumber(reservationMetadata.sandbox_disk_gib) ?? 0,
  );
  const computeCostUsd = estimateWorkspaceComputeUsd({
    durationSeconds,
    sandboxCpu,
    sandboxMemoryGiB,
  });
  const creditsDebited = priceWorkspaceUsageCredits({ computeCostUsd });
  return {
    startedAt,
    endedAt,
    durationSeconds,
    sandboxCpu,
    sandboxMemoryGiB,
    sandboxDiskGiB,
    computeCostUsd,
    creditsDebited,
    metadata: {
      ...reservationMetadata,
      provider: "blaxel",
      provider_sandbox_id: params.providerSandboxId,
      settlement_source: "stale_runtime_workspace_run_reconciler",
      settlement_reason: "stale_runtime_workspace_run_reconciled",
      final_duration_seconds: roundCurrency(durationSeconds),
      final_compute_cost_usd: roundCurrency(computeCostUsd),
      final_credits_requested: roundCredits(creditsDebited),
      stale_run_id: normalizeOptionalString(params.run?.runId) ?? null,
    },
  };
}

function normalizeObjectMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function mergeLedgerMetadata(existing: unknown, patch: unknown): unknown {
  const patchObject = normalizeObjectMetadata(patch);
  if (Object.keys(patchObject).length === 0) return existing;
  return {
    ...normalizeObjectMetadata(existing),
    ...patchObject,
  };
}

type ProviderCostEntryInput = {
  costKey: string;
  userId?: any;
  projectId?: any;
  communityId?: any;
  runId?: string | null;
  category: ProviderCostCategory;
  component: ProviderCostComponent;
  provider: string;
  resourceId?: string | null;
  periodStart: number;
  periodEnd: number;
  quantityKind: string;
  quantity: number;
  rawVendorCostUsd: number;
  evidence: ProviderCostEvidenceType;
  billingDisposition: ProviderCostBillingDisposition;
  linkedCreditKey?: string | null;
  metadata?: unknown;
  nowMs?: number;
};

const PROVIDER_COST_EVIDENCE_RANK: Record<ProviderCostEvidenceType, number> = {
  estimated: 1,
  provider_reported: 2,
  exact: 3,
};

function resolveProviderCostEvidenceRank(value: unknown): number {
  const normalized = normalizeOptionalString(value);
  if (
    normalized === "estimated" ||
    normalized === "provider_reported" ||
    normalized === "exact"
  ) {
    return PROVIDER_COST_EVIDENCE_RANK[normalized];
  }
  return 0;
}

function normalizeProviderCostIdentityValue(value: unknown): string | null {
  return normalizeOptionalString(value) ?? null;
}

function createProviderCostEntryRow(
  args: ProviderCostEntryInput,
  costKey: string,
  nowMs: number,
) {
  const periodStart = normalizeOptionalNumber(args.periodStart) ?? nowMs;
  const periodEnd = Math.max(periodStart, normalizeOptionalNumber(args.periodEnd) ?? periodStart);
  const quantity = roundProviderCostQuantity(Math.max(0, Number(args.quantity) || 0));
  const rawVendorCostUsd = roundProviderCostUsd(
    Math.max(0, Number(args.rawVendorCostUsd) || 0),
  );
  return {
    costKey,
    ...(args.userId ? { userId: args.userId } : {}),
    ...(args.projectId ? { projectId: args.projectId } : {}),
    ...(args.communityId ? { communityId: args.communityId } : {}),
    ...(normalizeOptionalString(args.runId) ? { runId: normalizeOptionalString(args.runId) } : {}),
    category: args.category,
    component: args.component,
    provider: String(args.provider ?? "").trim() || "unknown",
    ...(normalizeOptionalString(args.resourceId)
      ? { resourceId: normalizeOptionalString(args.resourceId) }
      : {}),
    periodStart,
    periodEnd,
    quantityKind: String(args.quantityKind ?? "").trim() || "unit",
    quantity,
    rawVendorCostUsd,
    evidence: args.evidence,
    billingDisposition: args.billingDisposition,
    ...(normalizeOptionalString(args.linkedCreditKey)
      ? { linkedCreditKey: normalizeOptionalString(args.linkedCreditKey) }
      : {}),
    ...(args.metadata === undefined ? {} : { metadata: args.metadata }),
    createdAt: nowMs,
    updatedAt: nowMs,
  };
}

function resolveProviderCostIdentityMismatch(
  existing: any,
  incoming: ReturnType<typeof createProviderCostEntryRow>,
): { field: string; existing: string | null; incoming: string | null } | null {
  const identityFields = [
    "category",
    "component",
    "billingDisposition",
    "userId",
    "projectId",
    "communityId",
    "linkedCreditKey",
  ] as const;
  for (const field of identityFields) {
    const existingValue = normalizeProviderCostIdentityValue(existing?.[field]);
    const incomingValue = normalizeProviderCostIdentityValue(incoming?.[field]);
    if (existingValue !== incomingValue) {
      return { field, existing: existingValue, incoming: incomingValue };
    }
  }
  return null;
}

function buildProviderCostEvidenceUpgradePatch(
  existing: any,
  incoming: ReturnType<typeof createProviderCostEntryRow>,
  nowMs: number,
): Record<string, unknown> | null {
  const existingRank = resolveProviderCostEvidenceRank(existing?.evidence);
  const incomingRank = resolveProviderCostEvidenceRank(incoming.evidence);
  if (incomingRank <= existingRank) return null;
  const previousEvidence = normalizeOptionalString(existing?.evidence);
  const previousRawVendorCostUsd = normalizeOptionalNumber(existing?.rawVendorCostUsd);
  return {
    provider: incoming.provider,
    ...(normalizeOptionalString(incoming.resourceId)
      ? { resourceId: normalizeOptionalString(incoming.resourceId) }
      : {}),
    periodStart: incoming.periodStart,
    periodEnd: incoming.periodEnd,
    quantityKind: incoming.quantityKind,
    quantity: incoming.quantity,
    rawVendorCostUsd: incoming.rawVendorCostUsd,
    evidence: incoming.evidence,
    metadata: {
      ...normalizeObjectMetadata(existing?.metadata),
      ...normalizeObjectMetadata(incoming.metadata),
      previous_evidence: previousEvidence ?? null,
      previous_raw_vendor_cost_usd: previousRawVendorCostUsd ?? null,
      provider_cost_upgraded_at: nowMs,
    },
    updatedAt: nowMs,
  };
}

async function recordProviderCostEntry(ctx: any, args: ProviderCostEntryInput): Promise<any> {
  const costKey = normalizeOptionalString(args.costKey);
  if (!costKey) throw new Error("provider_cost_key_required");
  const nowMs = args.nowMs ?? Date.now();
  const row = createProviderCostEntryRow(args, costKey, nowMs);
  const existing = await ctx.db
    .query("providerCostEntries")
    .withIndex("by_costKey", (q: any) => q.eq("costKey", costKey))
    .first();
  if (existing) {
    const mismatch = resolveProviderCostIdentityMismatch(existing, row);
    if (mismatch) {
      console.warn("provider_cost_identity_mismatch", {
        cost_key: costKey,
        field: mismatch.field,
        existing: mismatch.existing,
        incoming: mismatch.incoming,
      });
      return existing;
    }
    const upgradePatch = buildProviderCostEvidenceUpgradePatch(existing, row, nowMs);
    if (!upgradePatch) return existing;
    await ctx.db.patch(existing._id, upgradePatch);
    return await ctx.db.get(existing._id);
  }

  const id = await ctx.db.insert("providerCostEntries", row);
  return await ctx.db.get(id);
}

async function recordProviderCostEntryBestEffort(
  ctx: any,
  args: ProviderCostEntryInput,
): Promise<any | null> {
  try {
    return await recordProviderCostEntry(ctx, args);
  } catch (error) {
    console.warn("provider_cost_record_failed", {
      cost_key: args.costKey,
      component: args.component,
      error: error instanceof Error ? error.message : String(error ?? ""),
    });
    return null;
  }
}

async function readProviderCostEntryByCostKey(ctx: any, costKey: string): Promise<any | null> {
  const normalizedCostKey = normalizeOptionalString(costKey);
  if (!normalizedCostKey) return null;
  return await ctx.db
    .query("providerCostEntries")
    .withIndex("by_costKey", (q: any) => q.eq("costKey", normalizedCostKey))
    .first();
}

async function readProviderCostEntryByLinkedCreditKey(
  ctx: any,
  creditKey: string,
): Promise<any | null> {
  const normalizedCreditKey = normalizeOptionalString(creditKey);
  if (!normalizedCreditKey) return null;
  return await ctx.db
    .query("providerCostEntries")
    .withIndex("by_linkedCreditKey", (q: any) =>
      q.eq("linkedCreditKey", normalizedCreditKey),
    )
    .first();
}

function resolveCreditLedgerProviderCostEntry(params: {
  entry: any;
  settlementMetadata: unknown;
  rawVendorCostUsd: number | undefined;
  nowMs: number;
}): ProviderCostEntryInput | null {
  const rawVendorCostUsd =
    typeof params.rawVendorCostUsd === "number"
      ? roundProviderCostUsd(params.rawVendorCostUsd)
      : 0;
  if (!(rawVendorCostUsd > 0)) return null;

  const toolName = normalizeOptionalString(params.entry?.toolName);
  const action = normalizeOptionalString(params.entry?.action);
  const vendor = normalizeOptionalString(params.entry?.vendor);
  const metadata = normalizeObjectMetadata(params.settlementMetadata);
  const durationSeconds =
    normalizeOptionalNumber(metadata.final_duration_seconds) ??
    normalizeOptionalNumber(metadata.duration_seconds) ??
    0;
  const sandboxMemoryGiB =
    normalizeOptionalNumber(metadata.sandbox_memory_gib) ??
    normalizeOptionalNumber(metadata.final_sandbox_memory_gib) ??
    0;

  if (toolName === "workspace_compute" && vendor === "blaxel") {
    return {
      costKey: `credit_ledger:${params.entry.creditKey}:provider_cost`,
      userId: params.entry.userId,
      projectId: params.entry.projectId,
      runId: normalizeOptionalString(params.entry.runId),
      category: "workspace",
      component: "blaxel_active_runtime",
      provider: "blaxel",
      resourceId:
        normalizeOptionalString(metadata.provider_sandbox_id) ??
        normalizeOptionalString(metadata.providerSandboxId),
      periodStart: durationSeconds > 0 ? params.nowMs - durationSeconds * 1000 : params.nowMs,
      periodEnd: params.nowMs,
      quantityKind: "memory_gib_seconds",
      quantity: durationSeconds * sandboxMemoryGiB,
      rawVendorCostUsd,
      evidence: "estimated",
      billingDisposition: "rolled_into_user_usage",
      linkedCreditKey: params.entry.creditKey,
      metadata: {
        ...metadata,
        provider_cost_source: "credit_ledger_settlement",
        provider_cost_action: action ?? null,
      },
      nowMs: params.nowMs,
    };
  }

  if (toolName === "workspace_compute" && vendor === "daytona") {
    return {
      costKey: `credit_ledger:${params.entry.creditKey}:provider_cost`,
      userId: params.entry.userId,
      projectId: params.entry.projectId,
      runId: normalizeOptionalString(params.entry.runId),
      category: "workspace",
      component: "daytona_codex_runtime_active",
      provider: "daytona",
      resourceId:
        normalizeOptionalString(metadata.sandbox_id) ??
        normalizeOptionalString(metadata.worker_machine_id) ??
        normalizeOptionalString(metadata.provider_sandbox_id) ??
        normalizeOptionalString(metadata.target_id),
      periodStart: durationSeconds > 0 ? params.nowMs - durationSeconds * 1000 : params.nowMs,
      periodEnd: params.nowMs,
      quantityKind: "runtime_seconds",
      quantity: durationSeconds,
      rawVendorCostUsd,
      evidence: "estimated",
      billingDisposition: "rolled_into_user_usage",
      linkedCreditKey: params.entry.creditKey,
      metadata: {
        ...metadata,
        provider_cost_source: "credit_ledger_settlement",
        provider_cost_action: action ?? null,
      },
      nowMs: params.nowMs,
    };
  }

  if (toolName === "web_research") {
    return {
      costKey: `credit_ledger:${params.entry.creditKey}:provider_cost`,
      userId: params.entry.userId,
      communityId: params.entry.communityId,
      projectId: params.entry.projectId,
      runId: normalizeOptionalString(params.entry.runId),
      category: "web",
      component: action === "crawl" ? "web_crawl_provider_call" : "web_research_call",
      provider: normalizeOptionalString(metadata.final_provider) ?? vendor ?? "web_provider",
      periodStart: params.nowMs,
      periodEnd: params.nowMs,
      quantityKind: "call",
      quantity: 1,
      rawVendorCostUsd,
      evidence:
        normalizeOptionalString(metadata.final_cost_source) &&
        normalizeOptionalString(metadata.final_cost_source) !== "estimated"
          ? "provider_reported"
          : "estimated",
      billingDisposition: "rolled_into_user_usage",
      linkedCreditKey: params.entry.creditKey,
      metadata: {
        ...metadata,
        provider_cost_source: "credit_ledger_settlement",
        provider_cost_action: action ?? null,
      },
      nowMs: params.nowMs,
    };
  }

  if (toolName === "voice_transcribe") {
    return {
      costKey: `credit_ledger:${params.entry.creditKey}:provider_cost`,
      userId: params.entry.userId,
      category: "voice",
      component: "voice_transcription",
      provider:
        normalizeOptionalString(metadata.final_provider) ??
        normalizeOptionalString(metadata.provider) ??
        vendor ??
        "voice_provider",
      periodStart: params.nowMs,
      periodEnd: params.nowMs,
      quantityKind: "audio_seconds",
      quantity:
        normalizeOptionalNumber(metadata.duration_seconds) ??
        normalizeOptionalNumber(metadata.final_duration_seconds) ??
        0,
      rawVendorCostUsd,
      evidence: "estimated",
      billingDisposition: "rolled_into_user_usage",
      linkedCreditKey: params.entry.creditKey,
      metadata: {
        ...metadata,
        provider_cost_source: "credit_ledger_settlement",
      },
      nowMs: params.nowMs,
    };
  }

  return null;
}

export const recordProviderCostInternal = internalMutation({
  args: {
    costKey: v.string(),
    userId: v.optional(v.union(v.id("users"), v.null())),
    projectId: v.optional(v.union(v.id("cloudProjects"), v.null())),
    communityId: v.optional(v.union(v.id("communities"), v.null())),
    runId: v.optional(v.union(v.string(), v.null())),
    category: v.union(v.literal("workspace"), v.literal("web"), v.literal("voice")),
    component: v.union(
      v.literal("blaxel_active_runtime"),
      v.literal("blaxel_volume_storage"),
      v.literal("blaxel_standby_snapshot"),
      v.literal("web_research_call"),
      v.literal("web_crawl_provider_call"),
      v.literal("web_screenshot_provider_call"),
      v.literal("daytona_codex_runtime_active"),
      v.literal("voice_transcription"),
      v.literal("knowledge_model_inference"),
    ),
    provider: v.string(),
    resourceId: v.optional(v.union(v.string(), v.null())),
    periodStart: v.number(),
    periodEnd: v.number(),
    quantityKind: v.string(),
    quantity: v.number(),
    rawVendorCostUsd: v.number(),
    evidence: v.union(
      v.literal("estimated"),
      v.literal("provider_reported"),
      v.literal("exact"),
    ),
    billingDisposition: v.union(
      v.literal("tracked_only"),
      v.literal("rolled_into_user_usage"),
      v.literal("platform_absorbed"),
    ),
    linkedCreditKey: v.optional(v.union(v.string(), v.null())),
    metadata: v.optional(v.any()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await recordProviderCostEntry(ctx, args);
  },
});

export const getWorkspaceProviderMarginDiagnosticInternal = internalQuery({
  args: {
    periodStart: v.optional(v.number()),
    periodEnd: v.optional(v.number()),
    nowMs: v.optional(v.number()),
    ledgerLimit: v.optional(v.number()),
    providerCostLimitPerComponent: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const period = resolveWorkspaceProviderMarginDiagnosticPeriod(args);
    const ledgerLimit = clampProviderCostDiagnosticLimit(args.ledgerLimit);
    const providerCostLimitPerComponent = clampProviderCostDiagnosticLimit(
      args.providerCostLimitPerComponent,
    );
    const paidToolNames = new Set<string>(PAID_TOOL_LEDGER_TOOL_NAMES);

    const providerCostPeriodStart = Math.max(
      0,
      period.periodStart - PROVIDER_COST_MARGIN_DIAGNOSTIC_LOOKBACK_MS,
    );
    const byTool = new Map<string, ReturnType<typeof createDiagnosticMoneyBucket>>();
    let settledPolynetPriceUsd = 0;
    let settledRawVendorCostUsd = 0;
    let userUsageScanLimitReached = false;

    const ledgerRows = await ctx.db
      .query("creditLedgerEntries")
      .withIndex("by_status_settledAt", (q: any) =>
        q
          .eq("status", "succeeded")
          .gte("settledAt", period.periodStart)
          .lt("settledAt", period.periodEnd),
      )
      .take(ledgerLimit);
    userUsageScanLimitReached = ledgerRows.length >= ledgerLimit;

    for (const row of ledgerRows) {
      const toolName = normalizeOptionalString(row.toolName) ?? "unknown";
      if (!paidToolNames.has(toolName)) continue;
      const polynetPriceUsd =
        normalizeOptionalNumber(row.polynetPriceUsd) ??
        creditsToUsd(normalizeOptionalNumber(row.creditsSettled) ?? 0);
      const rawVendorCostUsd = normalizeOptionalNumber(row.rawVendorCostUsd) ?? 0;
      let bucket = byTool.get(toolName);
      if (!bucket) {
        bucket = createDiagnosticMoneyBucket(toolName);
        byTool.set(toolName, bucket);
      }
      bucket.count += 1;
      bucket.polynetPriceUsd += polynetPriceUsd;
      bucket.rawVendorCostUsd += rawVendorCostUsd;
      settledPolynetPriceUsd += polynetPriceUsd;
      settledRawVendorCostUsd += rawVendorCostUsd;
    }

    const overheadByComponent = new Map<string, ReturnType<typeof createDiagnosticMoneyBucket>>();
    const mirrorByComponent = new Map<string, ReturnType<typeof createDiagnosticMoneyBucket>>();
    let trackedOnlyRawVendorCostUsd = 0;
    let rolledIntoUserUsageRawVendorCostUsd = 0;
    let providerCostScanLimitReached = false;

    for (const component of PROVIDER_COST_COMPONENTS) {
      const rows = await ctx.db
        .query("providerCostEntries")
        .withIndex("by_component_period", (q: any) =>
          q
            .eq("component", component)
            .gte("periodStart", providerCostPeriodStart)
            .lt("periodStart", period.periodEnd),
        )
        .take(providerCostLimitPerComponent);
      if (rows.length >= providerCostLimitPerComponent) {
        providerCostScanLimitReached = true;
      }
      for (const row of rows) {
        const allocatedRawVendorCostUsd = allocateProviderCostToDiagnosticPeriod({
          row,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
        });
        if (!(allocatedRawVendorCostUsd > 0)) continue;
        const billingDisposition = normalizeOptionalString(row.billingDisposition);
        if (
          billingDisposition !== "tracked_only" &&
          billingDisposition !== "rolled_into_user_usage"
        ) {
          continue;
        }
        const targetMap =
          billingDisposition === "tracked_only" ? overheadByComponent : mirrorByComponent;
        let bucket = targetMap.get(component);
        if (!bucket) {
          bucket = createDiagnosticMoneyBucket(component);
          targetMap.set(component, bucket);
        }
        bucket.count += 1;
        bucket.rawVendorCostUsd += allocatedRawVendorCostUsd;
        if (billingDisposition === "tracked_only") {
          trackedOnlyRawVendorCostUsd += allocatedRawVendorCostUsd;
        } else if (billingDisposition === "rolled_into_user_usage") {
          rolledIntoUserUsageRawVendorCostUsd += allocatedRawVendorCostUsd;
        }
      }
    }

    const roundedSettledPolynetPriceUsd = roundDiagnosticUsd(settledPolynetPriceUsd);
    const roundedSettledRawVendorCostUsd = roundDiagnosticUsd(settledRawVendorCostUsd);
    const roundedTrackedOnlyRawVendorCostUsd = roundDiagnosticUsd(trackedOnlyRawVendorCostUsd);
    const roundedRolledIntoUserUsageRawVendorCostUsd = roundDiagnosticUsd(
      rolledIntoUserUsageRawVendorCostUsd,
    );
    const totalProviderExposureUsd = roundDiagnosticUsd(
      roundedTrackedOnlyRawVendorCostUsd + roundedRolledIntoUserUsageRawVendorCostUsd,
    );
    const uncollectedProviderExposureUsd = roundDiagnosticUsd(
      Math.max(
        0,
        roundedRolledIntoUserUsageRawVendorCostUsd - roundedSettledRawVendorCostUsd,
      ),
    );
    const totalMarginRawVendorCostUsd = roundDiagnosticUsd(
      roundedSettledRawVendorCostUsd + roundedTrackedOnlyRawVendorCostUsd,
    );
    const grossProfitUsd = roundDiagnosticUsd(
      roundedSettledPolynetPriceUsd - totalMarginRawVendorCostUsd,
    );
    const grossMarginBps =
      roundedSettledPolynetPriceUsd > 0
        ? Math.round((grossProfitUsd / roundedSettledPolynetPriceUsd) * 10000)
        : null;

    return {
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      userUsage: {
        settledPolynetPriceUsd: roundedSettledPolynetPriceUsd,
        settledRawVendorCostUsd: roundedSettledRawVendorCostUsd,
        byTool: Array.from(byTool.values()).map((bucket) => ({
          toolName: bucket.label,
          count: bucket.count,
          polynetPriceUsd: roundDiagnosticUsd(bucket.polynetPriceUsd),
          rawVendorCostUsd: roundDiagnosticUsd(bucket.rawVendorCostUsd),
        })),
      },
      providerCosts: {
        totalRawVendorCostUsd: totalProviderExposureUsd,
        trackedOnlyRawVendorCostUsd: roundedTrackedOnlyRawVendorCostUsd,
        rolledIntoUserUsageRawVendorCostUsd: roundedRolledIntoUserUsageRawVendorCostUsd,
        trackedOnlyByComponent: Array.from(overheadByComponent.values()).map((bucket) => ({
          component: bucket.label,
          count: bucket.count,
          rawVendorCostUsd: roundDiagnosticUsd(bucket.rawVendorCostUsd),
        })),
        rolledIntoUserUsageByComponent: Array.from(mirrorByComponent.values()).map((bucket) => ({
          component: bucket.label,
          count: bucket.count,
          rawVendorCostUsd: roundDiagnosticUsd(bucket.rawVendorCostUsd),
        })),
      },
      providerExposure: {
        ledgerRawVendorCostUsd: roundedSettledRawVendorCostUsd,
        trackedOnlyProviderCostUsd: roundedTrackedOnlyRawVendorCostUsd,
        rolledIntoUserUsageProviderCostUsd: roundedRolledIntoUserUsageRawVendorCostUsd,
        totalProviderCostUsd: totalProviderExposureUsd,
        uncollectedProviderExposureUsd,
      },
      margin: {
        revenueUsd: roundedSettledPolynetPriceUsd,
        ledgerRawVendorCostUsd: roundedSettledRawVendorCostUsd,
        trackedOnlyProviderCostUsd: roundedTrackedOnlyRawVendorCostUsd,
        totalRawVendorCostUsd: totalMarginRawVendorCostUsd,
        grossProfitUsd,
        grossMarginBps,
      },
      reconciliation: {
        ledgerRawVendorCostUsd: roundedSettledRawVendorCostUsd,
        rolledIntoUserUsageProviderCostUsd: roundedRolledIntoUserUsageRawVendorCostUsd,
        mirrorDeltaUsd: roundDiagnosticUsd(
          roundedRolledIntoUserUsageRawVendorCostUsd - roundedSettledRawVendorCostUsd,
        ),
      },
      scanLimitReached: userUsageScanLimitReached || providerCostScanLimitReached,
      scanLimits: {
        ledgerLimit,
        providerCostLimitPerComponent,
        providerCostLookbackMs: PROVIDER_COST_MARGIN_DIAGNOSTIC_LOOKBACK_MS,
        userUsageScanLimitReached,
        providerCostScanLimitReached,
      },
    };
  },
});

export const getProviderCostReconciliationDiagnosticInternal = internalQuery({
  args: {
    periodStart: v.optional(v.number()),
    periodEnd: v.optional(v.number()),
    nowMs: v.optional(v.number()),
    ledgerLimit: v.optional(v.number()),
    computeChargeLimitPerDebitSource: v.optional(v.number()),
    sampleLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const period = resolveWorkspaceProviderMarginDiagnosticPeriod(args);
    const ledgerLimit = clampProviderCostReconciliationLedgerLimit(args.ledgerLimit);
    const computeChargeLimitPerDebitSource = clampProviderCostReconciliationComputeLimitPerDebitSource(
      args.computeChargeLimitPerDebitSource,
    );
    const sampleLimit = clampProviderCostReconciliationSampleLimit(args.sampleLimit);
    const paidToolNames = new Set<string>(PAID_TOOL_LEDGER_TOOL_NAMES);
    const missingProviderCostUsdByCostKey = new Map<string, number>();

    const recordMissingProviderCost = (costKey: string, rawVendorCostUsd: number) => {
      const normalizedCostKey = normalizeOptionalString(costKey);
      if (!normalizedCostKey) return;
      const normalizedCostUsd = roundDiagnosticUsd(Math.max(0, Number(rawVendorCostUsd) || 0));
      const existing = missingProviderCostUsdByCostKey.get(normalizedCostKey) ?? 0;
      missingProviderCostUsdByCostKey.set(
        normalizedCostKey,
        Math.max(existing, normalizedCostUsd),
      );
    };

    const ledgerRows = await ctx.db
      .query("creditLedgerEntries")
      .withIndex("by_status_settledAt", (q: any) =>
        q
          .eq("status", "succeeded")
          .gte("settledAt", period.periodStart)
          .lt("settledAt", period.periodEnd),
      )
      .take(ledgerLimit);
    let ledgerPaidRowsInspected = 0;
    let ledgerMissingProviderCostRows = 0;
    let ledgerMissingRawVendorCostUsd = 0;
    const ledgerMissingSamples: any[] = [];

    for (const row of ledgerRows) {
      const toolName = normalizeOptionalString(row.toolName) ?? "unknown";
      if (!paidToolNames.has(toolName)) continue;
      const rawVendorCostUsd = normalizeOptionalNumber(row.rawVendorCostUsd) ?? 0;
      if (!(rawVendorCostUsd > 0)) continue;
      const creditKey = normalizeOptionalString(row.creditKey);
      if (!creditKey) continue;
      ledgerPaidRowsInspected += 1;
      const expectedProviderCostKey = `credit_ledger:${creditKey}:provider_cost`;
      const providerCostEntry = await readProviderCostEntryByCostKey(
        ctx,
        expectedProviderCostKey,
      );
      if (providerCostEntry) continue;
      ledgerMissingProviderCostRows += 1;
      ledgerMissingRawVendorCostUsd += rawVendorCostUsd;
      recordMissingProviderCost(expectedProviderCostKey, rawVendorCostUsd);
      if (ledgerMissingSamples.length < sampleLimit) {
        ledgerMissingSamples.push({
          creditKey,
          expectedProviderCostKey,
          toolName,
          action: normalizeOptionalString(row.action),
          vendor: normalizeOptionalString(row.vendor),
          userId: String(row.userId),
          projectId: row.projectId ? String(row.projectId) : null,
          communityId: row.communityId ? String(row.communityId) : null,
          rawVendorCostUsd: roundDiagnosticUsd(rawVendorCostUsd),
          settledAt: normalizeOptionalNumber(row.settledAt) ?? null,
        });
      }
    }

    let computeChargesScanned = 0;
    let computeMissingProviderCostRows = 0;
    let computeMissingRawVendorCostUsd = 0;
    let computeChargeScanLimitReached = false;
    const computeMissingSamples: any[] = [];

    // Legacy Blaxel/runtime mirror: canonical paid-tool usage lives in creditLedgerEntries.
    for (const debitSource of WORKSPACE_COMPUTE_DEBIT_SOURCES) {
      const rows = await ctx.db
        .query("workspaceComputeCharges")
        .withIndex("by_debitSource_createdAt", (q: any) =>
          q
            .eq("debitSource", debitSource)
            .gte("createdAt", period.periodStart)
            .lt("createdAt", period.periodEnd),
        )
        .take(computeChargeLimitPerDebitSource);
      if (rows.length >= computeChargeLimitPerDebitSource) {
        computeChargeScanLimitReached = true;
      }
      computeChargesScanned += rows.length;
      for (const row of rows) {
        const chargeKey = normalizeOptionalString(row.chargeKey);
        if (!chargeKey) continue;
        const creditReservationKey = normalizeOptionalString(row.creditReservationKey);
        const expectedProviderCostKey = creditReservationKey
          ? `credit_ledger:${creditReservationKey}:provider_cost`
          : `workspace_compute_charge:${chargeKey}:provider_cost`;
        const providerCostEntry = await readProviderCostEntryByCostKey(
          ctx,
          expectedProviderCostKey,
        );
        if (providerCostEntry) continue;
        const computeCostUsd = normalizeOptionalNumber(row.computeCostUsd) ?? 0;
        computeMissingProviderCostRows += 1;
        computeMissingRawVendorCostUsd += computeCostUsd;
        recordMissingProviderCost(expectedProviderCostKey, computeCostUsd);
        if (computeMissingSamples.length < sampleLimit) {
          computeMissingSamples.push({
            chargeKey,
            expectedProviderCostKey,
            creditReservationKey: creditReservationKey ?? null,
            debitSource,
            userId: String(row.userId),
            projectId: String(row.projectId),
            runId: normalizeOptionalString(row.runId),
            providerSandboxId: normalizeOptionalString(row.providerSandboxId),
            computeCostUsd: roundDiagnosticUsd(computeCostUsd),
            createdAt: normalizeOptionalNumber(row.createdAt) ?? null,
          });
        }
      }
    }

    const totalMissingProviderCostUsd = Array.from(
      missingProviderCostUsdByCostKey.values(),
    ).reduce((sum, value) => sum + value, 0);
    const canonicalMissingProviderCostUsd = roundDiagnosticUsd(
      totalMissingProviderCostUsd,
    );

    return {
      scope: "user_usage_provider_cost_mirrors",
      coverage: {
        creditLedgerEntries: true,
        workspaceComputeCharges: true,
        trackedOnlyStorageCosts: false,
        providerInvoiceRows: false,
      },
      sourceBreakdownCanOverlap: true,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      ledger: {
        rowsScanned: ledgerRows.length,
        paidRowsInspected: ledgerPaidRowsInspected,
        missingProviderCostRows: ledgerMissingProviderCostRows,
        missingRawVendorCostUsd: roundDiagnosticUsd(ledgerMissingRawVendorCostUsd),
        samples: ledgerMissingSamples,
        scanLimitReached: ledgerRows.length >= ledgerLimit,
      },
      workspaceComputeCharges: {
        rowsScanned: computeChargesScanned,
        missingProviderCostRows: computeMissingProviderCostRows,
        missingRawVendorCostUsd: roundDiagnosticUsd(computeMissingRawVendorCostUsd),
        samples: computeMissingSamples,
        scanLimitReached: computeChargeScanLimitReached,
      },
      total: {
        uniqueMissingProviderCostKeys: missingProviderCostUsdByCostKey.size,
        missingProviderCostUsd: canonicalMissingProviderCostUsd,
        canonicalMissingProviderCostUsd,
      },
      canonicalMissingProviderCostUsd,
      scanLimitReached:
        ledgerRows.length >= ledgerLimit || computeChargeScanLimitReached,
      scanLimits: {
        ledgerLimit,
        computeChargeLimitPerDebitSource,
        sampleLimit,
      },
    };
  },
});

export const getWorkspaceAccountingReconciliationDiagnosticsForOperator = query({
  args: {
    authSubject: v.optional(v.string()),
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const operator = await requireOperatorRole(ctx, args.authSubject, "operator");
    const nowMs = args.nowMs ?? Date.now();
    const limit = boundedLimit(
      args.limit,
      WORKSPACE_ACCOUNTING_RECONCILIATION_DEFAULT_LIMIT,
      WORKSPACE_ACCOUNTING_RECONCILIATION_MAX_LIMIT,
    );
    const lookbackStart = Math.max(
      0,
      nowMs - WORKSPACE_ACCOUNTING_RECONCILIATION_LOOKBACK_MS,
    );

    const activeAutoRechargeAttempts: any[] = [];
    const preparedAutoRechargeAttempts = await ctx.db
      .query("workspaceAutoRechargeAttempts")
      .withIndex("by_status_updatedAt", (q: any) => q.eq("status", "prepared"))
      .order("asc")
      .take(limit);
    const processingAutoRechargeAttempts = await ctx.db
      .query("workspaceAutoRechargeAttempts")
      .withIndex("by_status_updatedAt", (q: any) => q.eq("status", "processing"))
      .order("asc")
      .take(limit);
    activeAutoRechargeAttempts.push(
      ...preparedAutoRechargeAttempts,
      ...processingAutoRechargeAttempts,
    );
    const autoRechargeFailedRows = await ctx.db
      .query("workspaceAutoRechargeAttempts")
      .withIndex("by_status_updatedAt", (q: any) => q.eq("status", "failed"))
      .order("desc")
      .take(limit);

    const autoRechargeProcessingWithoutProviderId = processingAutoRechargeAttempts
      .filter((attempt: any) => !normalizeStripePaymentIntentId(attempt.providerPaymentId))
      .map((attempt: any) => {
        const createdAgeMs = diagnosticAgeMs(nowMs, attempt.createdAt);
        const updatedAgeMs = diagnosticAgeMs(nowMs, attempt.updatedAt);
        const expired =
          createdAgeMs === null ||
          createdAgeMs >=
            WORKSPACE_ACCOUNTING_AUTO_RECHARGE_PROCESSING_WITHOUT_PAYMENT_ID_EXPIRED_MS;
        const stale =
          updatedAgeMs !== null &&
          updatedAgeMs >=
            WORKSPACE_ACCOUNTING_AUTO_RECHARGE_PROCESSING_WITHOUT_PAYMENT_ID_STALE_MS;
        return {
          attemptKey: attempt.attemptKey,
          userId: String(attempt.userId),
          status: attempt.status,
          createdAt: diagnosticTimestamp(attempt.createdAt),
          updatedAt: diagnosticTimestamp(attempt.updatedAt),
          createdAgeMs,
          updatedAgeMs,
          providerIdempotencyKey: normalizeOptionalString(attempt.providerIdempotencyKey) ?? null,
          providerCustomerId: normalizeOptionalString(attempt.providerCustomerId) ?? null,
          providerPaymentMethodId: normalizeOptionalString(attempt.providerPaymentMethodId) ?? null,
          failureReason: normalizeOptionalString(attempt.failureReason) ?? null,
          severity: expired ? "manual_review" : stale ? "retryable" : "fresh",
          recommendedAction: expired
            ? "review_stripe_by_idempotency_key_then_fail_or_finalize"
            : stale
              ? "retry_provider_create_with_frozen_attempt_params"
              : "wait_for_executor_or_sweep",
        };
      });

    const autoRechargeProcessingWithProviderIdStale = processingAutoRechargeAttempts
      .filter((attempt: any) => normalizeStripePaymentIntentId(attempt.providerPaymentId))
      .filter((attempt: any) => {
        const updatedAgeMs = diagnosticAgeMs(nowMs, attempt.updatedAt);
        return (
          updatedAgeMs !== null &&
          updatedAgeMs >= WORKSPACE_ACCOUNTING_PAYMENT_INTENT_PROCESSING_STALE_MS
        );
      })
      .map((attempt: any) => ({
        attemptKey: attempt.attemptKey,
        userId: String(attempt.userId),
        providerPaymentId: normalizeStripePaymentIntentId(attempt.providerPaymentId) ?? null,
        providerIdempotencyKey: normalizeOptionalString(attempt.providerIdempotencyKey) ?? null,
        updatedAt: diagnosticTimestamp(attempt.updatedAt),
        updatedAgeMs: diagnosticAgeMs(nowMs, attempt.updatedAt),
        recommendedAction: "retrieve_payment_intent_and_finalize_attempt",
      }));

    const activeAttemptsByUser = new Map<string, any[]>();
    for (const attempt of activeAutoRechargeAttempts) {
      const key = String(attempt.userId);
      activeAttemptsByUser.set(key, [...(activeAttemptsByUser.get(key) ?? []), attempt]);
    }
    const duplicateActiveAutoRechargeAttempts = Array.from(activeAttemptsByUser.entries())
      .filter(([, rows]) => rows.length > 1)
      .slice(0, limit)
      .map(([userId, rows]) => ({
        userId,
        activeAttempts: rows.length,
        attemptKeys: rows.slice(0, 5).map((row) => row.attemptKey),
        statuses: rows.slice(0, 5).map((row) => row.status),
        recommendedAction: "inspect_user_auto_recharge_attempts_before_next_charge",
      }));

    const usageCollectionsProcessing = await ctx.db
      .query("workspaceUsageCollections")
      .withIndex("by_status_updatedAt", (q: any) => q.eq("status", "processing"))
      .order("asc")
      .take(limit);
    const usageCollectionsStalePrepared = await ctx.db
      .query("workspaceUsageCollections")
      .withIndex("by_status_updatedAt", (q: any) =>
        q
          .eq("status", "prepared")
          .lt("updatedAt", nowMs - WORKSPACE_CARD_COLLECTION_STALE_PREPARED_MS),
      )
      .order("asc")
      .take(limit);
    const usageCollectionsFailed = await ctx.db
      .query("workspaceUsageCollections")
      .withIndex("by_status_updatedAt", (q: any) => q.eq("status", "failed"))
      .order("desc")
      .take(limit);

    const usageProcessingWithoutProviderPaymentIntent = usageCollectionsProcessing
      .filter((collection: any) =>
        !normalizeStripePaymentIntentId(collection.providerPaymentIntentId),
      )
      .map((collection: any) => ({
        collectionKey: collection.collectionKey,
        userId: String(collection.userId),
        creditsAmount: roundCredits(collection.creditsAmount),
        providerCustomerId: normalizeOptionalString(collection.providerCustomerId) ?? null,
        createdAt: diagnosticTimestamp(collection.createdAt),
        updatedAt: diagnosticTimestamp(collection.updatedAt),
        updatedAgeMs: diagnosticAgeMs(nowMs, collection.updatedAt),
        recommendedAction: "release_collection_or_reconcile_provider_attempt",
      }));
    const usageProcessingWithProviderPaymentIntentStale = usageCollectionsProcessing
      .filter((collection: any) =>
        normalizeStripePaymentIntentId(collection.providerPaymentIntentId),
      )
      .filter((collection: any) => {
        const updatedAgeMs = diagnosticAgeMs(nowMs, collection.updatedAt);
        return (
          updatedAgeMs !== null &&
          updatedAgeMs >= WORKSPACE_ACCOUNTING_PAYMENT_INTENT_PROCESSING_STALE_MS
        );
      })
      .map((collection: any) => ({
        collectionKey: collection.collectionKey,
        userId: String(collection.userId),
        creditsAmount: roundCredits(collection.creditsAmount),
        providerPaymentIntentId:
          normalizeStripePaymentIntentId(collection.providerPaymentIntentId) ?? null,
        updatedAt: diagnosticTimestamp(collection.updatedAt),
        updatedAgeMs: diagnosticAgeMs(nowMs, collection.updatedAt),
        recommendedAction: "retrieve_payment_intent_and_finalize_collection",
      }));

    const pendingSettlementRows = await ctx.db
      .query("creditLedgerEntries")
      .withIndex("by_pendingSettlementStatus_nextAttemptAt", (q: any) =>
        q
          .eq("pendingSettlementStatus", "succeeded")
          .lt("pendingSettlementNextAttemptAt", nowMs),
      )
      .order("asc")
      .take(limit);
    const staleReservedLedgerRows = await ctx.db
      .query("creditLedgerEntries")
      .withIndex("by_status_expiresAt", (q: any) =>
        q.eq("status", "reserved").lt("expiresAt", nowMs),
      )
      .order("asc")
      .take(limit);

    const paidToolNames = new Set<string>(PAID_TOOL_LEDGER_TOOL_NAMES);
    const recentSucceededLedgerRows = await ctx.db
      .query("creditLedgerEntries")
      .withIndex("by_status_settledAt", (q: any) =>
        q
          .eq("status", "succeeded")
          .gte("settledAt", lookbackStart)
          .lt("settledAt", nowMs),
      )
      .order("desc")
      .take(limit);
    let paidLedgerRowsInspected = 0;
    const missingProviderCostMirrors: any[] = [];
    for (const row of recentSucceededLedgerRows) {
      const toolName = normalizeOptionalString(row.toolName) ?? "unknown";
      if (!paidToolNames.has(toolName)) continue;
      const rawVendorCostUsd = normalizeOptionalNumber(row.rawVendorCostUsd) ?? 0;
      if (!(rawVendorCostUsd > 0)) continue;
      paidLedgerRowsInspected += 1;
      const creditKey = normalizeOptionalString(row.creditKey);
      if (!creditKey) continue;
      const providerCostEntry = await readProviderCostEntryByLinkedCreditKey(ctx, creditKey);
      if (providerCostEntry) continue;
      if (missingProviderCostMirrors.length < limit) {
        missingProviderCostMirrors.push({
          creditKey,
          userId: String(row.userId),
          toolName,
          action: normalizeOptionalString(row.action) ?? null,
          vendor: normalizeOptionalString(row.vendor) ?? null,
          runId: normalizeOptionalString(row.runId) ?? null,
          rawVendorCostUsd: roundDiagnosticUsd(rawVendorCostUsd),
          settledAt: diagnosticTimestamp(row.settledAt),
          expectedLinkedCreditKey: creditKey,
          recommendedAction: "record_or_reconcile_provider_cost_mirror",
        });
      }
    }

    let legacyComputeChargesScanned = 0;
    let legacyComputeChargesWithoutCreditReservationKey = 0;
    let legacyComputeChargeScanLimitReached = false;
    const legacyComputeChargeSamples: any[] = [];
    for (const debitSource of WORKSPACE_COMPUTE_DEBIT_SOURCES) {
      const rows = await ctx.db
        .query("workspaceComputeCharges")
        .withIndex("by_debitSource_createdAt", (q: any) =>
          q
            .eq("debitSource", debitSource)
            .gte("createdAt", lookbackStart)
            .lt("createdAt", nowMs),
        )
        .order("desc")
        .take(limit);
      legacyComputeChargesScanned += rows.length;
      if (rows.length >= limit) legacyComputeChargeScanLimitReached = true;
      for (const row of rows) {
        if (!normalizeOptionalString(row.creditReservationKey)) {
          legacyComputeChargesWithoutCreditReservationKey += 1;
        }
        if (legacyComputeChargeSamples.length < limit) {
          legacyComputeChargeSamples.push({
            chargeKey: row.chargeKey,
            userId: String(row.userId),
            runId: normalizeOptionalString(row.runId) ?? null,
            debitSource,
            creditReservationKey: normalizeOptionalString(row.creditReservationKey) ?? null,
            createdAt: diagnosticTimestamp(row.createdAt),
            recommendedAction: "confirm_legacy_charge_is_not_active_billing_truth",
          });
        }
      }
    }

    return {
      scope: "workspace_accounting_reconciliation",
      generatedAt: nowMs,
      operator: {
        userId: operator.userId,
        role: operator.role,
      },
      limits: {
        limit,
        lookbackStart,
        lookbackMs: WORKSPACE_ACCOUNTING_RECONCILIATION_LOOKBACK_MS,
        autoRechargeProcessingWithoutPaymentIdStaleMs:
          WORKSPACE_ACCOUNTING_AUTO_RECHARGE_PROCESSING_WITHOUT_PAYMENT_ID_STALE_MS,
        autoRechargeProcessingWithoutPaymentIdExpiredMs:
          WORKSPACE_ACCOUNTING_AUTO_RECHARGE_PROCESSING_WITHOUT_PAYMENT_ID_EXPIRED_MS,
        paymentIntentProcessingStaleMs:
          WORKSPACE_ACCOUNTING_PAYMENT_INTENT_PROCESSING_STALE_MS,
        usageCollectionStalePreparedMs: WORKSPACE_CARD_COLLECTION_STALE_PREPARED_MS,
      },
      autoRecharge: {
        activePreparedRowsScanned: preparedAutoRechargeAttempts.length,
        activeProcessingRowsScanned: processingAutoRechargeAttempts.length,
        processingWithoutProviderPaymentId: {
          rows: autoRechargeProcessingWithoutProviderId.length,
          staleRows: autoRechargeProcessingWithoutProviderId.filter(
            (row) => row.severity === "retryable",
          ).length,
          expiredRows: autoRechargeProcessingWithoutProviderId.filter(
            (row) => row.severity === "manual_review",
          ).length,
          samples: autoRechargeProcessingWithoutProviderId.slice(0, limit),
        },
        processingWithProviderPaymentIdStale: {
          rows: autoRechargeProcessingWithProviderIdStale.length,
          samples: autoRechargeProcessingWithProviderIdStale.slice(0, limit),
        },
        duplicateActiveAttempts: {
          users: duplicateActiveAutoRechargeAttempts.length,
          samples: duplicateActiveAutoRechargeAttempts,
        },
        recentFailed: {
          rows: autoRechargeFailedRows.length,
          samples: autoRechargeFailedRows.slice(0, limit).map((attempt: any) => ({
            attemptKey: attempt.attemptKey,
            userId: String(attempt.userId),
            providerPaymentId: normalizeStripePaymentIntentId(attempt.providerPaymentId) ?? null,
            failureReason: normalizeOptionalString(attempt.failureReason) ?? null,
            updatedAt: diagnosticTimestamp(attempt.updatedAt),
            recommendedAction: "inspect_failure_reason_before_reenable",
          })),
        },
      },
      usageCollections: {
        processingRowsScanned: usageCollectionsProcessing.length,
        stalePrepared: {
          rows: usageCollectionsStalePrepared.length,
          samples: usageCollectionsStalePrepared.slice(0, limit).map((collection: any) => ({
            collectionKey: collection.collectionKey,
            userId: String(collection.userId),
            creditsAmount: roundCredits(collection.creditsAmount),
            providerCustomerId: normalizeOptionalString(collection.providerCustomerId) ?? null,
            updatedAt: diagnosticTimestamp(collection.updatedAt),
            updatedAgeMs: diagnosticAgeMs(nowMs, collection.updatedAt),
            recommendedAction: "retry_or_release_prepared_collection",
          })),
        },
        processingWithoutProviderPaymentIntent: {
          rows: usageProcessingWithoutProviderPaymentIntent.length,
          samples: usageProcessingWithoutProviderPaymentIntent.slice(0, limit),
        },
        processingWithProviderPaymentIntentStale: {
          rows: usageProcessingWithProviderPaymentIntentStale.length,
          samples: usageProcessingWithProviderPaymentIntentStale.slice(0, limit),
        },
        recentFailed: {
          rows: usageCollectionsFailed.length,
          samples: usageCollectionsFailed.slice(0, limit).map((collection: any) => ({
            collectionKey: collection.collectionKey,
            userId: String(collection.userId),
            creditsAmount: roundCredits(collection.creditsAmount),
            providerPaymentIntentId:
              normalizeStripePaymentIntentId(collection.providerPaymentIntentId) ?? null,
            failureReason: normalizeOptionalString(collection.failureReason) ?? null,
            updatedAt: diagnosticTimestamp(collection.updatedAt),
            recommendedAction: "inspect_failure_reason_and_balance_restore",
          })),
        },
      },
      ledgerSettlements: {
        pendingRetriesDue: {
          rows: pendingSettlementRows.length,
          samples: pendingSettlementRows.map((entry: any) => ({
            creditKey: entry.creditKey,
            userId: String(entry.userId),
            toolName: entry.toolName,
            runId: normalizeOptionalString(entry.runId) ?? null,
            attempts: entry.pendingSettlementAttempts ?? 0,
            nextAttemptAt: diagnosticTimestamp(entry.pendingSettlementNextAttemptAt),
            error: normalizeOptionalString(entry.pendingSettlementError) ?? null,
            recommendedAction: "rerun_or_inspect_pending_settlement_retry",
          })),
        },
        staleReserved: {
          rows: staleReservedLedgerRows.length,
          samples: staleReservedLedgerRows.map((entry: any) => ({
            creditKey: entry.creditKey,
            userId: String(entry.userId),
            toolName: entry.toolName,
            runId: normalizeOptionalString(entry.runId) ?? null,
            expiresAt: diagnosticTimestamp(entry.expiresAt),
            expiredAgeMs: diagnosticAgeMs(nowMs, entry.expiresAt),
            recommendedAction: "refund_or_finalize_expired_reservation",
          })),
        },
      },
      providerCostMirrors: {
        recentSucceededLedgerRowsScanned: recentSucceededLedgerRows.length,
        paidLedgerRowsInspected,
        missingRows: missingProviderCostMirrors.length,
        samples: missingProviderCostMirrors,
        scanLimitReached: recentSucceededLedgerRows.length >= limit,
      },
      legacyDrift: {
        workspaceComputeCharges: {
          rowsScanned: legacyComputeChargesScanned,
          rowsWithoutCreditReservationKey: legacyComputeChargesWithoutCreditReservationKey,
          samples: legacyComputeChargeSamples,
          scanLimitReached: legacyComputeChargeScanLimitReached,
          canonicalUsageTruth: "creditLedgerEntries",
        },
      },
    };
  },
});

export const getWorkspaceAccountingInvariantDiagnosticsForOperator = query({
  args: {
    authSubject: v.optional(v.string()),
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const operator = await requireOperatorRole(ctx, args.authSubject, "operator");
    const nowMs = args.nowMs ?? Date.now();
    const limit = boundedLimit(
      args.limit,
      WORKSPACE_ACCOUNTING_INVARIANT_DEFAULT_LIMIT,
      WORKSPACE_ACCOUNTING_INVARIANT_MAX_LIMIT,
    );

    const recentBalanceRows = await readRecentWorkspaceCreditBalanceRows(ctx, limit * 5);
    const balanceRowsById = new Map<string, any>();
    for (const row of recentBalanceRows) {
      balanceRowsById.set(String(row._id), row);
      const userRows = await readWorkspaceCreditBalanceRowsByUser(ctx, row.userId, 5);
      for (const userRow of userRows) {
        balanceRowsById.set(String(userRow._id), userRow);
      }
    }
    const balanceDiagnostics = buildWorkspaceCreditBalanceDiagnostics(
      [...balanceRowsById.values()],
      nowMs,
      limit,
    );

    const autoRechargeSettingsRows: any[] = [];
    for (const status of ["active", "paused_payment_failed", "disabled"] as const) {
      const rows = await ctx.db
        .query("workspaceAutoRechargeSettings")
        .withIndex("by_status_updatedAt", (q: any) => q.eq("status", status))
        .order("desc")
        .take(limit);
      autoRechargeSettingsRows.push(...rows);
    }
    const autoRechargeSettingsByUser = new Map<string, any[]>();
    for (const row of autoRechargeSettingsRows) {
      const key = String(row.userId);
      autoRechargeSettingsByUser.set(key, [
        ...(autoRechargeSettingsByUser.get(key) ?? []),
        row,
      ]);
    }
    const duplicateAutoRechargeSettings = Array.from(autoRechargeSettingsByUser.entries())
      .filter(([, rows]) => rows.length > 1)
      .slice(0, limit)
      .map(([userId, rows]) => ({
        userId,
        rows: rows.length,
        statuses: rows.slice(0, 5).map((row) => row.status),
        enabledValues: rows.slice(0, 5).map((row) => row.enabled === true),
        recommendedAction: "block_auto_recharge_until_settings_are_canonical",
      }));

    const preparedAutoRechargeAttempts = await ctx.db
      .query("workspaceAutoRechargeAttempts")
      .withIndex("by_status_updatedAt", (q: any) => q.eq("status", "prepared"))
      .order("asc")
      .take(limit);
    const processingAutoRechargeAttempts = await ctx.db
      .query("workspaceAutoRechargeAttempts")
      .withIndex("by_status_updatedAt", (q: any) => q.eq("status", "processing"))
      .order("asc")
      .take(limit);
    const activeAutoRechargeAttemptsByUser = new Map<string, any[]>();
    for (const row of [...preparedAutoRechargeAttempts, ...processingAutoRechargeAttempts]) {
      const key = String(row.userId);
      activeAutoRechargeAttemptsByUser.set(key, [
        ...(activeAutoRechargeAttemptsByUser.get(key) ?? []),
        row,
      ]);
    }
    const duplicateActiveAutoRechargeAttempts = Array.from(
      activeAutoRechargeAttemptsByUser.entries(),
    )
      .filter(([, rows]) => rows.length > 1)
      .slice(0, limit)
      .map(([userId, rows]) => ({
        userId,
        rows: rows.length,
        attemptKeys: rows.slice(0, 5).map((row) => row.attemptKey),
        statuses: rows.slice(0, 5).map((row) => row.status),
        providerPaymentIds: rows
          .slice(0, 5)
          .map((row) => normalizeStripePaymentIntentId(row.providerPaymentId) ?? null),
        recommendedAction: "block_new_auto_recharge_charge_until_attempts_are_reconciled",
      }));

    const preparedUsageCollections = await ctx.db
      .query("workspaceUsageCollections")
      .withIndex("by_status_updatedAt", (q: any) => q.eq("status", "prepared"))
      .order("asc")
      .take(limit);
    const processingUsageCollections = await ctx.db
      .query("workspaceUsageCollections")
      .withIndex("by_status_updatedAt", (q: any) => q.eq("status", "processing"))
      .order("asc")
      .take(limit);
    const activeUsageCollectionsByUser = new Map<string, any[]>();
    for (const row of [...preparedUsageCollections, ...processingUsageCollections]) {
      const key = String(row.userId);
      activeUsageCollectionsByUser.set(key, [
        ...(activeUsageCollectionsByUser.get(key) ?? []),
        row,
      ]);
    }
    const duplicateActiveUsageCollections = Array.from(activeUsageCollectionsByUser.entries())
      .filter(([, rows]) => rows.length > 1)
      .slice(0, limit)
      .map(([userId, rows]) => ({
        userId,
        rows: rows.length,
        collectionKeys: rows.slice(0, 5).map((row) => row.collectionKey),
        statuses: rows.slice(0, 5).map((row) => row.status),
        providerPaymentIntentIds: rows
          .slice(0, 5)
          .map((row) => normalizeStripePaymentIntentId(row.providerPaymentIntentId) ?? null),
        recommendedAction: "block_new_usage_collection_charge_until_collections_are_reconciled",
      }));

    const repairableIssueCount = balanceDiagnostics.duplicateUsers;
    const blockedClosedIssueCount =
      balanceDiagnostics.negativeBalanceRows +
      duplicateAutoRechargeSettings.length +
      duplicateActiveAutoRechargeAttempts.length +
      duplicateActiveUsageCollections.length;
    const disposition =
      blockedClosedIssueCount > 0
        ? "blocked_closed"
        : repairableIssueCount > 0
          ? "repairable"
          : "clean";

    return {
      scope: "workspace_accounting_invariants",
      generatedAt: nowMs,
      disposition,
      operator: {
        userId: operator.userId,
        role: operator.role,
      },
      limits: {
        limit,
        balanceRowsScanned: recentBalanceRows.length,
        autoRechargeSettingsRowsScanned: autoRechargeSettingsRows.length,
        activeAutoRechargeAttemptsScanned:
          preparedAutoRechargeAttempts.length + processingAutoRechargeAttempts.length,
        activeUsageCollectionsScanned:
          preparedUsageCollections.length + processingUsageCollections.length,
      },
      balances: {
        policy: "duplicate_rows_are_repairable_negative_rows_block_closed",
        duplicateUsers: balanceDiagnostics.duplicateUsers,
        duplicateRows: balanceDiagnostics.duplicateRows,
        negativeBalanceRows: balanceDiagnostics.negativeBalanceRows,
        duplicateSamples: balanceDiagnostics.duplicateSamples,
        negativeBalanceSamples: balanceDiagnostics.negativeBalanceSamples,
      },
      autoRechargeSettings: {
        policy: "duplicate_settings_block_auto_recharge",
        duplicateUsers: duplicateAutoRechargeSettings.length,
        samples: duplicateAutoRechargeSettings,
      },
      autoRechargeAttempts: {
        policy: "duplicate_active_attempts_block_new_auto_recharge_charges",
        activeUsers: activeAutoRechargeAttemptsByUser.size,
        duplicateActiveUsers: duplicateActiveAutoRechargeAttempts.length,
        samples: duplicateActiveAutoRechargeAttempts,
      },
      usageCollections: {
        policy: "active_collection_blocks_new_collection_duplicate_active_blocks_charging",
        activeUsers: activeUsageCollectionsByUser.size,
        duplicateActiveUsers: duplicateActiveUsageCollections.length,
        samples: duplicateActiveUsageCollections,
      },
    };
  },
});

export const listBlaxelStorageAccountingProjectIdsInternal = internalQuery({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const pageSize = Math.max(
      1,
      Math.min(
        PROVIDER_COST_STORAGE_ACCOUNTING_MAX_PAGE_SIZE,
        Math.floor(
          args.paginationOpts.numItems ??
            PROVIDER_COST_STORAGE_ACCOUNTING_DEFAULT_PAGE_SIZE,
        ),
      ),
    );
    const page = await ctx.db
      .query("cloudProjects")
      .withIndex("by_providerVolumeProviderId_updatedAt", (q: any) =>
        q.eq("providerVolumeProviderId", "blaxel"),
      )
      .paginate({
        ...args.paginationOpts,
        numItems: pageSize,
        maximumRowsRead: Math.max(
          args.paginationOpts.maximumRowsRead ?? pageSize,
          pageSize,
        ),
      });
    return {
      projectIds: page.page.map((project: any) => project._id),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const recordBlaxelStorageProviderCostsForProjectsInternal = internalMutation({
  args: {
    projectIds: v.array(v.id("cloudProjects")),
    bucketStart: v.number(),
    bucketEnd: v.number(),
    bucketKey: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const bucket = {
      periodStart: args.bucketStart,
      periodEnd: args.bucketEnd,
      bucketKey: args.bucketKey,
    };
    if (!(bucket.periodEnd > bucket.periodStart)) {
      return {
        ok: true,
        skipped: true,
        reason: "provider_cost_bucket_empty",
        inspected: 0,
        recordedVolumeStorage: 0,
        recordedStandbySnapshot: 0,
      };
    }
    const loadedConfig = loadBlaxelWorkspaceConfig();
    if (!loadedConfig.ok) {
      return {
        ok: false,
        skipped: true,
        reason: loadedConfig.code,
        inspected: 0,
        recordedVolumeStorage: 0,
        recordedStandbySnapshot: 0,
      };
    }

    const volumeSizeGb = mbToGb(loadedConfig.config.volumeSizeMb);
    const standbySnapshotSizeGb = mbToGb(loadedConfig.config.memoryMb);
    let inspected = 0;
    let skippedInactive = 0;
    let skippedNoVolume = 0;
    let skippedDeletedVolume = 0;
    let recordedVolumeStorage = 0;
    let recordedStandbySnapshot = 0;

    for (const projectId of args.projectIds) {
      const project = await ctx.db.get(projectId);
      if (!project) continue;
      inspected += 1;
      if (!isWorkspaceProjectDisplayable(project)) {
        skippedInactive += 1;
        continue;
      }
      const truth = resolveWorkspaceProjectResourceTruth(project);
      const volumeId = normalizeOptionalString(truth.volume.resourceId);
      if (!volumeId || truth.volume.providerId !== "blaxel") {
        skippedNoVolume += 1;
        continue;
      }
      if (
        truth.volume.retentionState === "deleted" ||
        truth.volume.deletedAt ||
        isDeletedProviderState(truth.volume.providerState)
      ) {
        skippedDeletedVolume += 1;
        continue;
      }

      const volumeKnownAt =
        normalizeOptionalNumber(truth.volume.lastSeenAt) ??
        normalizeOptionalNumber(project.createdAt) ??
        bucket.periodStart;
      const volumePeriodStart = Math.max(bucket.periodStart, volumeKnownAt);
      if (bucket.periodEnd > volumePeriodStart && volumeSizeGb > 0) {
        const durationSeconds = (bucket.periodEnd - volumePeriodStart) / 1000;
        await recordProviderCostEntry(ctx, {
          costKey: `blaxel_volume_storage:${project._id}:${volumeId}:${bucket.bucketKey}`,
          userId: project.ownerId,
          projectId: project._id,
          category: "workspace",
          component: "blaxel_volume_storage",
          provider: "blaxel",
          resourceId: volumeId,
          periodStart: volumePeriodStart,
          periodEnd: bucket.periodEnd,
          quantityKind: "gb_seconds",
          quantity: volumeSizeGb * durationSeconds,
          rawVendorCostUsd: estimateBlaxelStorageCostUsd({
            sizeGb: volumeSizeGb,
            durationSeconds,
            usdPerGbSecond: BLAXEL_VOLUME_STORAGE_USD_PER_GB_SECOND,
          }),
          evidence: "estimated",
          billingDisposition: "tracked_only",
          metadata: {
            provider_cost_source: "blaxel_storage_hourly_reconciler",
            bucket_start: bucket.periodStart,
            bucket_end: bucket.periodEnd,
            storage_size_gb: volumeSizeGb,
            rate_usd_per_gb_second: BLAXEL_VOLUME_STORAGE_USD_PER_GB_SECOND,
            provider_volume_state: truth.volume.providerState,
            volume_retention_state: truth.volume.retentionState,
          },
          nowMs,
        });
        recordedVolumeStorage += 1;
      }

      const sandboxId = normalizeOptionalString(truth.sandbox.resourceId);
      const sandboxState = normalizeState(truth.sandbox.providerState);
      if (
        !sandboxId ||
        truth.sandbox.providerId !== "blaxel" ||
        sandboxState !== "standby" ||
        standbySnapshotSizeGb <= 0
      ) {
        continue;
      }
      const standbyKnownAt =
        normalizeOptionalNumber(truth.sandbox.lastSeenAt) ??
        normalizeOptionalNumber(truth.sandbox.lastActivityAt) ??
        normalizeOptionalNumber(project.updatedAt) ??
        bucket.periodStart;
      const standbyPeriodStart = Math.max(bucket.periodStart, standbyKnownAt);
      if (bucket.periodEnd <= standbyPeriodStart) continue;
      const standbyDurationSeconds = (bucket.periodEnd - standbyPeriodStart) / 1000;
      await recordProviderCostEntry(ctx, {
        costKey: `blaxel_standby_snapshot:${project._id}:${sandboxId}:${bucket.bucketKey}`,
        userId: project.ownerId,
        projectId: project._id,
        category: "workspace",
        component: "blaxel_standby_snapshot",
        provider: "blaxel",
        resourceId: sandboxId,
        periodStart: standbyPeriodStart,
        periodEnd: bucket.periodEnd,
        quantityKind: "gb_seconds",
        quantity: standbySnapshotSizeGb * standbyDurationSeconds,
        rawVendorCostUsd: estimateBlaxelStorageCostUsd({
          sizeGb: standbySnapshotSizeGb,
          durationSeconds: standbyDurationSeconds,
          usdPerGbSecond: BLAXEL_STANDBY_SNAPSHOT_STORAGE_USD_PER_GB_SECOND,
        }),
        evidence: "estimated",
        billingDisposition: "tracked_only",
        metadata: {
          provider_cost_source: "blaxel_storage_hourly_reconciler",
          bucket_start: bucket.periodStart,
          bucket_end: bucket.periodEnd,
          storage_size_gb: standbySnapshotSizeGb,
          rate_usd_per_gb_second: BLAXEL_STANDBY_SNAPSHOT_STORAGE_USD_PER_GB_SECOND,
          provider_sandbox_state: truth.sandbox.providerState,
        },
        nowMs,
      });
      recordedStandbySnapshot += 1;
    }

    return {
      ok: true,
      bucket,
      inspected,
      skippedInactive,
      skippedNoVolume,
      skippedDeletedVolume,
      recordedVolumeStorage,
      recordedStandbySnapshot,
      volumeSizeGb,
      standbySnapshotSizeGb,
    };
  },
});

export const recordBlaxelStorageProviderCostsInternal = internalAction({
  args: {
    nowMs: v.optional(v.number()),
    pageSize: v.optional(v.number()),
    maxPages: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
    bucketStart: v.optional(v.number()),
    bucketEnd: v.optional(v.number()),
    bucketKey: v.optional(v.string()),
    pagesProcessed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const resolvedBucket = resolveProviderCostAccountingHourBucket(nowMs);
    const bucket = {
      periodStart: args.bucketStart ?? resolvedBucket.periodStart,
      periodEnd: args.bucketEnd ?? resolvedBucket.periodEnd,
      bucketKey: args.bucketKey ?? resolvedBucket.bucketKey,
    };
    if (!(bucket.periodEnd > bucket.periodStart)) {
      return {
        ok: true,
        skipped: true,
        reason: "provider_cost_bucket_empty",
        bucket,
        pagesScanned: 0,
        projectsInspected: 0,
        recordedVolumeStorage: 0,
        recordedStandbySnapshot: 0,
        hasMore: false,
      };
    }
    const loadedConfig = loadBlaxelWorkspaceConfig();
    if (!loadedConfig.ok) {
      return {
        ok: false,
        skipped: true,
        reason: loadedConfig.code,
        bucket,
        pagesScanned: 0,
        projectsListed: 0,
        projectsInspected: 0,
        recordedVolumeStorage: 0,
        recordedStandbySnapshot: 0,
        hasMore: false,
      };
    }

    const pageSize = Math.max(
      1,
      Math.min(
        PROVIDER_COST_STORAGE_ACCOUNTING_MAX_PAGE_SIZE,
        Math.floor(args.pageSize ?? PROVIDER_COST_STORAGE_ACCOUNTING_DEFAULT_PAGE_SIZE),
      ),
    );
    const maxPages = Math.max(
      1,
      Math.min(
        20,
        Math.floor(args.maxPages ?? PROVIDER_COST_STORAGE_ACCOUNTING_MAX_PAGES_PER_RUN),
      ),
    );

    let cursor = args.cursor ?? null;
    let isDone = false;
    let pagesScanned = 0;
    let projectsListed = 0;
    let projectsInspected = 0;
    let recordedVolumeStorage = 0;
    let recordedStandbySnapshot = 0;
    let skippedInactive = 0;
    let skippedNoVolume = 0;
    let skippedDeletedVolume = 0;

    while (!isDone && pagesScanned < maxPages) {
      const page = (await ctx.runQuery(
        (internal as any).workspaceCredits.listBlaxelStorageAccountingProjectIdsInternal,
        {
          paginationOpts: {
            cursor,
            numItems: pageSize,
            maximumRowsRead: pageSize,
          },
        },
      )) as {
        projectIds?: any[];
        continueCursor?: string | null;
        isDone?: boolean;
      };
      pagesScanned += 1;
      const projectIds = Array.isArray(page.projectIds) ? page.projectIds : [];
      projectsListed += projectIds.length;
      if (projectIds.length > 0) {
        const result = (await ctx.runMutation(
          (internal as any).workspaceCredits.recordBlaxelStorageProviderCostsForProjectsInternal,
          {
            projectIds,
            bucketStart: bucket.periodStart,
            bucketEnd: bucket.periodEnd,
            bucketKey: bucket.bucketKey,
            nowMs,
          },
        )) as any;
        projectsInspected += Number(result?.inspected ?? 0);
        recordedVolumeStorage += Number(result?.recordedVolumeStorage ?? 0);
        recordedStandbySnapshot += Number(result?.recordedStandbySnapshot ?? 0);
        skippedInactive += Number(result?.skippedInactive ?? 0);
        skippedNoVolume += Number(result?.skippedNoVolume ?? 0);
        skippedDeletedVolume += Number(result?.skippedDeletedVolume ?? 0);
      }
      isDone = Boolean(page.isDone);
      cursor = typeof page.continueCursor === "string" ? page.continueCursor : null;
      if (!cursor) isDone = true;
    }

    const hasMore = !isDone && Boolean(cursor);
    if (hasMore) {
      await ctx.scheduler.runAfter(
        0,
        (internal as any).workspaceCredits.recordBlaxelStorageProviderCostsInternal,
        {
          nowMs,
          pageSize,
          maxPages,
          cursor,
          bucketStart: bucket.periodStart,
          bucketEnd: bucket.periodEnd,
          bucketKey: bucket.bucketKey,
          pagesProcessed: Number(args.pagesProcessed ?? 0) + pagesScanned,
        },
      );
    }

    return {
      ok: true,
      bucket,
      pageSize,
      maxPages,
      pagesScanned,
      pagesProcessed: Number(args.pagesProcessed ?? 0) + pagesScanned,
      projectsListed,
      projectsInspected,
      skippedInactive,
      skippedNoVolume,
      skippedDeletedVolume,
      recordedVolumeStorage,
      recordedStandbySnapshot,
      hasMore,
      continueCursor: hasMore ? cursor : null,
    };
  },
});

function normalizeStripePriceId(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  return normalized && normalized.startsWith("price_") ? normalized : undefined;
}

function normalizeStripeCustomerId(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  return normalized && normalized.startsWith("cus_") ? normalized : undefined;
}

function normalizeStripePaymentMethodId(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  return normalized && normalized.startsWith("pm_") ? normalized : undefined;
}

function normalizeStripePaymentIntentId(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  return normalized && normalized.startsWith("pi_") ? normalized : undefined;
}

function clampCredits(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, roundCredits(value)));
}

function readUncollectedCreditsBalance(balance: any): number {
  return roundCredits(Math.max(0, Number(balance?.uncollectedCreditsBalance ?? 0)));
}

function readPendingCardCollectionCreditsBalance(balance: any): number {
  return roundCredits(Math.max(0, Number(balance?.pendingCardCollectionCreditsBalance ?? 0)));
}

function readOutstandingWorkspaceUsageCreditsBalance(balance: any): number {
  return roundCredits(
    readUncollectedCreditsBalance(balance) + readPendingCardCollectionCreditsBalance(balance),
  );
}

const DUPLICATE_WORKSPACE_CREDIT_BALANCE_ERROR = "workspace_credit_balance_duplicate";
const WORKSPACE_CREDIT_BALANCE_REPAIR_ROW_LIMIT = 25;
const CARD_BACKED_PENDING_RESERVATION_SCAN_LIMIT = 1000;
const WORKSPACE_BILLING_OVERVIEW_MONTHS = 6;
const WORKSPACE_BILLING_OVERVIEW_ROW_LIMIT = 1000;
const UTC_BILLING_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

async function readWorkspaceCreditBalanceRowsByUser(ctx: any, userId: any, limit = 2) {
  return await ctx.db
    .query("workspaceCreditBalances")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .take(Math.max(1, Math.min(WORKSPACE_CREDIT_BALANCE_REPAIR_ROW_LIMIT, Math.floor(limit))));
}

async function readCanonicalWorkspaceCreditBalance(ctx: any, userId: any) {
  const rows = await readWorkspaceCreditBalanceRowsByUser(ctx, userId, 2);
  if (rows.length > 1) throw new Error(DUPLICATE_WORKSPACE_CREDIT_BALANCE_ERROR);
  return rows[0] ?? null;
}

async function scheduleWorkspaceAutoRechargeAfterSettlementBestEffort(
  ctx: any,
  userId: any,
  nowMs: number,
): Promise<void> {
  try {
    const settingsRows = await ctx.db
      .query("workspaceAutoRechargeSettings")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .take(2);
    if (settingsRows.length !== 1) return;
    const settings = settingsRows[0];
    if (settings.enabled !== true || settings.status !== "active") return;
    const balance = await readCanonicalWorkspaceCreditBalance(ctx, userId);
    if (!balance) return;
    const spendableCredits = getSpendableWorkspaceToolBalanceCredits(balance);
    const uncollectedCredits = getUncollectedWorkspaceToolBalanceCredits(balance);
    const pendingCollectionCredits = getPendingCardCollectionWorkspaceToolBalanceCredits(balance);
    if (spendableCredits > Number(settings.thresholdCredits ?? 0)) return;
    if (uncollectedCredits > 0 || pendingCollectionCredits > 0) return;
    await ctx.scheduler.runAfter(
      0,
      (internal as any).workspaceAutoRecharge.executeWorkspaceAutoRechargeForUserInternal,
      {
        userId,
        nowMs,
      },
    );
  } catch (error) {
    console.warn("workspace_auto_recharge_settlement_schedule_failed", {
      user_id: String(userId ?? ""),
      error: error instanceof Error ? error.message : String(error ?? ""),
    });
  }
}

function cardBackedReservationExposureCredits(entry: any, nowMs: number): number {
  if (normalizeOptionalString(entry?.status) !== "reserved") return 0;
  const expiresAt = Number(entry?.expiresAt ?? 0);
  if (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt <= nowMs) return 0;
  const metadata = normalizeObjectMetadata(entry?.metadata);
  if (
    metadata.billing_mode !== "card_backed" &&
    metadata.funding_source !== "card_on_file"
  ) {
    return 0;
  }
  return roundCredits(
    Math.max(
      0,
      Number(entry?.creditsReserved ?? 0) -
        Number(entry?.includedCreditsDebited ?? 0) -
        Number(entry?.purchasedCreditsDebited ?? 0),
    ),
  );
}

async function readPendingCardBackedReservationExposureCredits(
  ctx: any,
  userId: any,
  nowMs: number,
): Promise<number> {
  const rows = await ctx.db
    .query("creditLedgerEntries")
    .withIndex("by_status_expiresAt", (q: any) =>
      q.eq("status", "reserved").gt("expiresAt", nowMs),
    )
    .take(CARD_BACKED_PENDING_RESERVATION_SCAN_LIMIT);
  if (rows.length >= CARD_BACKED_PENDING_RESERVATION_SCAN_LIMIT) {
    throw new Error("credits_pending_reservation_scan_truncated");
  }
  return roundCredits(
    rows.reduce(
      (sum: number, row: any) =>
        String(row?.userId ?? "") === String(userId ?? "")
          ? sum + cardBackedReservationExposureCredits(row, nowMs)
          : sum,
      0,
    ),
  );
}

async function readRecentWorkspaceCreditBalanceRows(ctx: any, limit: number) {
  return await ctx.db
    .query("workspaceCreditBalances")
    .withIndex("by_updatedAt")
    .order("desc")
    .take(Math.max(1, Math.min(500, Math.floor(limit))));
}

function buildEmptyWorkspaceCreditBalanceForUser(userId: unknown, nowMs: number) {
  return {
    userId,
    includedCreditsBalance: 0,
    purchasedCreditsBalance: 0,
    uncollectedCreditsBalance: 0,
    pendingCardCollectionCreditsBalance: 0,
    includedCycleCredits: 0,
    includedCycleStartedAt: nowMs,
    includedCycleEndsAt: nowMs,
    createdAt: nowMs,
    updatedAt: nowMs,
  };
}

function buildWorkspaceToolBalanceProjection(balance: any, userId: unknown, nowMs: number) {
  const normalizedBalance = balance ?? buildEmptyWorkspaceCreditBalanceForUser(userId, nowMs);
  const spendableCreditsBalance = roundCredits(
    getSpendableWorkspaceToolBalanceCredits(normalizedBalance),
  );
  const uncollectedCreditsBalance = roundCredits(
    getUncollectedWorkspaceToolBalanceCredits(normalizedBalance),
  );
  const pendingCardCollectionCreditsBalance = roundCredits(
    getPendingCardCollectionWorkspaceToolBalanceCredits(normalizedBalance),
  );
  const outstandingUsageCreditsBalance = roundCredits(
    getOutstandingWorkspaceToolUsageCredits(normalizedBalance),
  );
  return {
    ...normalizedBalance,
    uncollectedCreditsBalance,
    pendingCardCollectionCreditsBalance,
    outstandingUsageCreditsBalance,
    spendableCreditsBalance,
    displayBalanceUsd: formatWorkspaceToolBalanceUsdFromCredits(spendableCreditsBalance),
    blocked: outstandingUsageCreditsBalance > 0,
    blockedReason: outstandingUsageCreditsBalance > 0 ? "uncollected_usage" : null,
    lowBalance: outstandingUsageCreditsBalance <= 0 &&
      spendableCreditsBalance <= WORKSPACE_CREDIT_LOW_BALANCE_THRESHOLD,
  };
}

function normalizeBalanceNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function boundedLimit(value: unknown, defaultValue: number, maxValue: number): number {
  const parsed = Math.floor(Number(value ?? defaultValue));
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.max(1, Math.min(maxValue, parsed));
}

function startOfUtcMonth(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function addUtcMonths(monthStartMs: number, deltaMonths: number): number {
  const date = new Date(monthStartMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + deltaMonths, 1);
}

function formatUtcBillingMonthLabel(monthStartMs: number): string {
  const date = new Date(monthStartMs);
  return `${UTC_BILLING_MONTH_NAMES[date.getUTCMonth()] ?? "Month"} ${date.getUTCFullYear()}`;
}

function formatUtcBillingMonthKey(monthStartMs: number): string {
  const date = new Date(monthStartMs);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function buildWorkspaceBillingMonthBucket(monthStartMs: number) {
  const monthEndMs = addUtcMonths(monthStartMs, 1);
  return {
    key: formatUtcBillingMonthKey(monthStartMs),
    label: formatUtcBillingMonthLabel(monthStartMs),
    startAt: monthStartMs,
    endAt: monthEndMs,
    workspaceUsageCredits: 0,
    paidCredits: 0,
  };
}

function findWorkspaceBillingMonthBucket(
  buckets: Map<string, ReturnType<typeof buildWorkspaceBillingMonthBucket>>,
  occurredAt: unknown,
) {
  const parsed = Number(occurredAt);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const key = formatUtcBillingMonthKey(startOfUtcMonth(parsed));
  return buckets.get(key) ?? null;
}

function workspaceBillingMonthToPublic(bucket: ReturnType<typeof buildWorkspaceBillingMonthBucket>) {
  const workspaceUsageCredits = roundCredits(bucket.workspaceUsageCredits);
  const paidCredits = roundCredits(bucket.paidCredits);
  return {
    key: bucket.key,
    label: bucket.label,
    startAt: bucket.startAt,
    endAt: bucket.endAt,
    workspaceUsageCredits,
    workspaceUsageUsd: formatWorkspaceToolBalanceUsdFromCredits(workspaceUsageCredits),
    paidCredits,
    paidUsd: formatWorkspaceToolBalanceUsdFromCredits(paidCredits),
  };
}

function readCreditLedgerBillingUsageCredits(row: any): number {
  const metadata = normalizeObjectMetadata(row?.metadata);
  const requestedCreditsSettled = normalizeOptionalNumber(metadata.requested_credits_settled);
  const creditsSettled = normalizeOptionalNumber(row?.creditsSettled);
  return roundCredits(Math.max(0, requestedCreditsSettled ?? creditsSettled ?? 0));
}

function effectiveWorkspaceCreditTopupCheckoutExpiresAt(row: any): number {
  const storedExpiresAt = normalizeBalanceNumber(row?.expiresAt);
  const createdAt = normalizeBalanceNumber(row?.createdAt);
  const ttlExpiresAt = createdAt > 0
    ? createdAt + WORKSPACE_TOOL_BALANCE_TOPUP_CHECKOUT_TTL_MS
    : 0;
  if (storedExpiresAt > 0 && ttlExpiresAt > 0) {
    return Math.min(storedExpiresAt, ttlExpiresAt);
  }
  return storedExpiresAt > 0 ? storedExpiresAt : ttlExpiresAt;
}

function splitSettledCredits(args: {
  includedDebited: number;
  purchasedDebited: number;
  creditsSettled: number;
}): {
  includedSettled: number;
  purchasedSettled: number;
  includedRefunded: number;
  purchasedRefunded: number;
} {
  const includedDebited = roundCredits(args.includedDebited);
  const purchasedDebited = roundCredits(args.purchasedDebited);
  const creditsSettled = clampCredits(
    args.creditsSettled,
    0,
    includedDebited + purchasedDebited,
  );
  const includedSettled = Math.min(includedDebited, creditsSettled);
  const purchasedSettled = Math.min(
    purchasedDebited,
    Math.max(0, creditsSettled - includedSettled),
  );
  return {
    includedSettled: roundCredits(includedSettled),
    purchasedSettled: roundCredits(purchasedSettled),
    includedRefunded: roundCredits(includedDebited - includedSettled),
    purchasedRefunded: roundCredits(purchasedDebited - purchasedSettled),
  };
}

async function recordSettledPaidToolPartnerCommission(ctx: any, args: {
  creditKey: string | undefined;
  userId: any;
  purchasedCreditsSettled: number;
  totalCreditsSettled: number;
  rawVendorCostUsd: number | undefined;
  nowMs: number;
}) {
  const creditKey = String(args.creditKey ?? "").trim();
  const purchasedCreditsSettled = roundCredits(args.purchasedCreditsSettled);
  const totalCreditsSettled = roundCredits(args.totalCreditsSettled);
  if (!creditKey || !(purchasedCreditsSettled > 0) || !(totalCreditsSettled > 0)) return;
  if (typeof args.rawVendorCostUsd !== "number" || !Number.isFinite(args.rawVendorCostUsd)) return;
  const paidUsageRatio = Math.min(1, Math.max(0, purchasedCreditsSettled / totalCreditsSettled));
  await recordPaidToolUsagePartnerCommission(ctx, {
    referredUserId: args.userId,
    creditKey,
    polynetPriceUsd: creditsToUsd(purchasedCreditsSettled),
    rawVendorCostUsd: roundCurrency(args.rawVendorCostUsd * paidUsageRatio),
    nowMs: args.nowMs,
  });
}

function applySpendableCreditRefund(args: {
  split: ReturnType<typeof splitSettledCredits>;
}): {
  includedRefunded: number;
  purchasedRefunded: number;
} {
  return {
    includedRefunded: 0,
    purchasedRefunded: args.split.purchasedRefunded,
  };
}

async function debitAvailableWorkspaceCredits(params: {
  ctx: any;
  userId: any;
  credits: number;
  nowMs: number;
}): Promise<{ includedDebited: number; purchasedDebited: number }> {
  const requestedCredits = roundCredits(Math.max(0, Number(params.credits) || 0));
  if (!(requestedCredits > 0)) {
    return { includedDebited: 0, purchasedDebited: 0 };
  }
  const balance = await readCanonicalWorkspaceCreditBalance(params.ctx, params.userId);
  if (!balance) {
    return { includedDebited: 0, purchasedDebited: 0 };
  }
  const purchasedDebited = Math.min(balance.purchasedCreditsBalance, requestedCredits);
  const debitedCredits = roundCredits(purchasedDebited);
  if (debitedCredits > 0) {
    await params.ctx.db.patch(balance._id, {
      purchasedCreditsBalance: roundCredits(balance.purchasedCreditsBalance - purchasedDebited),
      updatedAt: params.nowMs,
    });
  }
  return {
    includedDebited: 0,
    purchasedDebited: roundCredits(purchasedDebited),
  };
}

async function addUncollectedWorkspaceCredits(params: {
  ctx: any;
  userId: any;
  credits: number;
  nowMs: number;
}): Promise<number> {
  const uncollectedCredits = roundCredits(Math.max(0, Number(params.credits) || 0));
  if (!(uncollectedCredits > 0)) return 0;
  const balance = await readCanonicalWorkspaceCreditBalance(params.ctx, params.userId);
  if (!balance) {
    await params.ctx.db.insert("workspaceCreditBalances", {
      userId: params.userId,
      includedCreditsBalance: 0,
      purchasedCreditsBalance: 0,
      uncollectedCreditsBalance: uncollectedCredits,
      pendingCardCollectionCreditsBalance: 0,
      includedCycleCredits: 0,
      includedCycleStartedAt: params.nowMs,
      includedCycleEndsAt: params.nowMs,
      createdAt: params.nowMs,
      updatedAt: params.nowMs,
    });
    return uncollectedCredits;
  }
  await params.ctx.db.patch(balance._id, {
    uncollectedCreditsBalance: roundCredits(
      readUncollectedCreditsBalance(balance) + uncollectedCredits,
    ),
    updatedAt: params.nowMs,
  });
  return uncollectedCredits;
}

async function readWorkspaceUsageCollectionByKey(ctx: any, collectionKey: string) {
  const normalizedKey = String(collectionKey ?? "").trim();
  if (!normalizedKey) return null;
  return await ctx.db
    .query("workspaceUsageCollections")
    .withIndex("by_collectionKey", (q: any) => q.eq("collectionKey", normalizedKey))
    .first();
}

async function readActiveWorkspaceUsageCardCollectionsForUser(
  ctx: any,
  userId: any,
  limit = 3,
) {
  const bounded = Math.max(1, Math.min(10, Math.floor(limit)));
  const prepared = await ctx.db
    .query("workspaceUsageCollections")
    .withIndex("by_user_status", (q: any) =>
      q.eq("userId", userId).eq("status", "prepared"),
    )
    .order("asc")
    .take(bounded);
  const processing = await ctx.db
    .query("workspaceUsageCollections")
    .withIndex("by_user_status", (q: any) =>
      q.eq("userId", userId).eq("status", "processing"),
    )
    .order("asc")
    .take(bounded);
  return [...prepared, ...processing].slice(0, bounded);
}

function hasActiveWorkspaceCardOnFile(stripeCustomer: any): boolean {
  return (
    stripeCustomer?.paymentMethodStatus === "active" &&
    Boolean(normalizeStripeCustomerId(stripeCustomer.providerCustomerId)) &&
    Boolean(normalizeStripePaymentMethodId(stripeCustomer.providerDefaultPaymentMethodId)) &&
    !(Number(stripeCustomer?.cardRemovedAt ?? 0) > 0)
  );
}

function workspaceUsageCollectionAmountCents(credits: number): number {
  return Math.floor(creditsToUsd(roundCredits(credits)) * 100);
}

function paymentIntentIsSucceeded(status: unknown): boolean {
  return String(status ?? "").trim() === "succeeded";
}

function paymentIntentIsTerminalFailure(status: unknown): boolean {
  return [
    "canceled",
    "requires_action",
    "requires_capture",
    "requires_confirmation",
    "requires_payment_method",
  ].includes(String(status ?? "").trim());
}

function paymentIntentIsProcessing(status: unknown): boolean {
  return String(status ?? "").trim() === "processing";
}

function normalizePaymentIntentFailureReason(intent: any, fallback: string): string {
  return (
    normalizeOptionalString(intent?.last_payment_error?.code) ??
    normalizeOptionalString(intent?.last_payment_error?.message) ??
    normalizeOptionalString(intent?.cancellation_reason) ??
    fallback
  );
}

function readStripeObjectId(value: unknown, prefix: string): string | undefined {
  if (typeof value === "string") {
    const normalized = normalizeOptionalString(value);
    return normalized && normalized.startsWith(prefix) ? normalized : undefined;
  }
  if (value && typeof value === "object") {
    const id = normalizeOptionalString((value as { id?: unknown }).id);
    return id && id.startsWith(prefix) ? id : undefined;
  }
  return undefined;
}

function buildWorkspaceUsageCollectionKey(candidate: any): string {
  const userId = String(candidate?.userId ?? "").trim();
  const balanceUpdatedAt = Math.floor(Number(candidate?.balanceUpdatedAt ?? 0) || 0);
  const chargeableCredits = Math.floor(
    Math.max(0, Number(candidate?.uncollectedCreditsBalance ?? 0) || 0),
  );
  return `workspace_usage:${userId}:${balanceUpdatedAt}:${chargeableCredits}`;
}

function buildWorkspaceUsagePaymentIntentMetadata(params: {
  collectionKey: string;
  userId: unknown;
  creditsAmount: number;
}) {
  return {
    polynet_collection_key: params.collectionKey,
    polynet_user_id: String(params.userId),
    workspace_usage_credits: String(roundCredits(params.creditsAmount)),
    purpose: "workspace_usage_card_collection",
  };
}

function readStripeErrorPaymentIntent(error: unknown): any | null {
  const candidate = error as { payment_intent?: unknown; paymentIntent?: unknown; raw?: unknown };
  const direct = candidate?.payment_intent ?? candidate?.paymentIntent;
  if (direct && typeof direct === "object") return direct;
  const raw = candidate?.raw;
  if (raw && typeof raw === "object") {
    const rawIntent = (raw as { payment_intent?: unknown; paymentIntent?: unknown }).payment_intent ??
      (raw as { paymentIntent?: unknown }).paymentIntent;
    if (rawIntent && typeof rawIntent === "object") return rawIntent;
  }
  return null;
}

function readStripeErrorCode(error: unknown): string {
  const candidate = error as { code?: unknown; type?: unknown; message?: unknown };
  return (
    normalizeOptionalString(candidate?.code) ??
    normalizeOptionalString(candidate?.type) ??
    normalizeOptionalString(candidate?.message) ??
    "stripe_payment_failed"
  );
}

async function listActiveWorkspaceUsageCardCollectionCandidates(params: {
  ctx: any;
  minCredits: number;
  limit: number;
}) {
  const minCredits = roundCredits(Math.max(0, Number(params.minCredits) || 0));
  const limit = Math.max(1, Math.min(50, Math.floor(params.limit)));
  const scanLimit = Math.min(500, Math.max(limit * 10, limit));
  const rows = await params.ctx.db
    .query("workspaceCreditBalances")
    .withIndex("by_updatedAt")
    .order("desc")
    .take(scanLimit);
  const candidates: any[] = [];
  for (const balance of rows) {
    if (readUncollectedCreditsBalance(balance) < minCredits) continue;
    if (readPendingCardCollectionCreditsBalance(balance) > 0) continue;
    const activeCollections = await readActiveWorkspaceUsageCardCollectionsForUser(
      params.ctx,
      balance.userId,
      2,
    );
    if (activeCollections.length > 0) continue;
    const stripeCustomer = await params.ctx.db
      .query("userStripeCustomers")
      .withIndex("by_user", (q: any) => q.eq("userId", balance.userId))
      .first();
    if (!hasActiveWorkspaceCardOnFile(stripeCustomer)) continue;
    candidates.push({
      userId: balance.userId,
      balanceId: balance._id,
      balanceUpdatedAt: balance.updatedAt,
      uncollectedCreditsBalance: readUncollectedCreditsBalance(balance),
      providerCustomerId: normalizeStripeCustomerId(stripeCustomer.providerCustomerId),
      providerDefaultPaymentMethodId: normalizeStripePaymentMethodId(
        stripeCustomer.providerDefaultPaymentMethodId,
      ),
    });
    if (candidates.length >= limit) break;
  }
  return {
    candidates,
    scanned: rows.length,
    truncated: rows.length >= scanLimit,
  };
}

export const listWorkspaceUsageCardCollectionCandidatesInternal = internalQuery({
  args: {
    minCredits: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    await listActiveWorkspaceUsageCardCollectionCandidates({
      ctx,
      minCredits: args.minCredits ?? WORKSPACE_CARD_COLLECTION_MIN_CREDITS,
      limit: args.limit ?? 10,
    }),
});

export const listWorkspaceUsageCardCollectionsByStatusInternal = internalQuery({
  args: {
    status: v.union(v.literal("prepared"), v.literal("processing")),
    olderThanMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(50, Math.floor(args.limit ?? 10)));
    const query = ctx.db
      .query("workspaceUsageCollections")
      .withIndex("by_status_updatedAt", (q) => {
        const scoped = q.eq("status", args.status);
        return typeof args.olderThanMs === "number"
          ? scoped.lt("updatedAt", args.olderThanMs)
          : scoped;
      });
    return await query.take(limit);
  },
});

export const listActiveWorkspaceUsageCardCollectionsForUserInternal = internalQuery({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    await readActiveWorkspaceUsageCardCollectionsForUser(
      ctx,
      args.userId,
      args.limit ?? 3,
    ),
});

export const prepareWorkspaceUsageCardCollectionInternal = internalMutation({
  args: {
    collectionKey: v.string(),
    userId: v.id("users"),
    requestedCredits: v.optional(v.number()),
    providerCustomerId: v.optional(v.union(v.string(), v.null())),
    metadata: v.optional(v.any()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const collectionKey = String(args.collectionKey ?? "").trim();
    if (!collectionKey) throw new Error("workspace_usage_collection_key_required");
    const existing = await readWorkspaceUsageCollectionByKey(ctx, collectionKey);
    if (existing) {
      if (String(existing.userId ?? "") !== String(args.userId ?? "")) {
        throw new Error("workspace_usage_collection_owner_mismatch");
      }
      return {
        ok: true,
        alreadyExists: true,
        collection: existing,
        collectionKey,
        creditsAmount: roundCredits(existing.creditsAmount),
        status: existing.status,
      };
    }

    const activeCollections = await readActiveWorkspaceUsageCardCollectionsForUser(
      ctx,
      args.userId,
      3,
    );
    if (activeCollections.length > 0) {
      return {
        ok: false,
        reason: activeCollections.length > 1
          ? "duplicate_active_workspace_usage_collections"
          : "active_workspace_usage_collection_exists",
        collectionKey,
        creditsAmount: 0,
        activeCollections: activeCollections.map((collection: any) => ({
          collectionKey: collection.collectionKey,
          status: collection.status,
          providerPaymentIntentId:
            normalizeStripePaymentIntentId(collection.providerPaymentIntentId) ?? null,
          updatedAt: diagnosticTimestamp(collection.updatedAt),
        })),
      };
    }

    const balance = await readCanonicalWorkspaceCreditBalance(ctx, args.userId);
    const uncollectedCredits = readUncollectedCreditsBalance(balance);
    const requestedCredits =
      typeof args.requestedCredits === "number"
        ? roundCredits(Math.max(0, args.requestedCredits))
        : uncollectedCredits;
    const creditsAmount = roundCredits(Math.min(uncollectedCredits, requestedCredits));
    if (!(creditsAmount > 0)) {
      return {
        ok: false,
        reason: "no_uncollected_usage",
        collectionKey,
        creditsAmount: 0,
      };
    }
    if (!balance) throw new Error("workspace_usage_collection_balance_missing");

    await ctx.db.patch(balance._id, {
      uncollectedCreditsBalance: roundCredits(uncollectedCredits - creditsAmount),
      pendingCardCollectionCreditsBalance: roundCredits(
        readPendingCardCollectionCreditsBalance(balance) + creditsAmount,
      ),
      updatedAt: nowMs,
    });

    const id = await ctx.db.insert("workspaceUsageCollections", {
      collectionKey,
      userId: args.userId,
      status: "prepared",
      creditsAmount,
      provider: "stripe",
      providerCustomerId: normalizeOptionalString(args.providerCustomerId),
      metadata: args.metadata,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return {
      ok: true,
      alreadyExists: false,
      collection: await ctx.db.get(id),
      collectionKey,
      creditsAmount,
      status: "prepared",
    };
  },
});

export const markWorkspaceUsageCardCollectionProcessingInternal = internalMutation({
  args: {
    collectionKey: v.string(),
    providerCustomerId: v.optional(v.union(v.string(), v.null())),
    providerPaymentIntentId: v.optional(v.union(v.string(), v.null())),
    metadata: v.optional(v.any()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const collectionKey = String(args.collectionKey ?? "").trim();
    if (!collectionKey) throw new Error("workspace_usage_collection_key_required");
    const collection = await readWorkspaceUsageCollectionByKey(ctx, collectionKey);
    if (!collection) throw new Error("workspace_usage_collection_not_found");
    if (
      collection.status === "succeeded" ||
      collection.status === "failed" ||
      collection.status === "released"
    ) {
      return {
        ok: true,
        alreadyCompleted: true,
        collection,
        collectionKey,
        status: collection.status,
      };
    }
    await ctx.db.patch(collection._id, {
      status: "processing",
      provider: "stripe",
      providerCustomerId:
        normalizeOptionalString(args.providerCustomerId) ?? collection.providerCustomerId,
      providerPaymentIntentId:
        normalizeOptionalString(args.providerPaymentIntentId) ??
        collection.providerPaymentIntentId,
      metadata: mergeLedgerMetadata(collection.metadata, normalizeObjectMetadata(args.metadata)),
      updatedAt: nowMs,
    });
    return {
      ok: true,
      alreadyCompleted: false,
      collection: await ctx.db.get(collection._id),
      collectionKey,
      status: "processing",
    };
  },
});

export const completeWorkspaceUsageCardCollectionInternal = internalMutation({
  args: {
    collectionKey: v.string(),
    status: v.union(
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("released"),
    ),
    providerCustomerId: v.optional(v.union(v.string(), v.null())),
    providerPaymentIntentId: v.optional(v.union(v.string(), v.null())),
    failureReason: v.optional(v.union(v.string(), v.null())),
    metadata: v.optional(v.any()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const collectionKey = String(args.collectionKey ?? "").trim();
    if (!collectionKey) throw new Error("workspace_usage_collection_key_required");
    const collection = await readWorkspaceUsageCollectionByKey(ctx, collectionKey);
    if (!collection) throw new Error("workspace_usage_collection_not_found");
    if (
      collection.status === "succeeded" ||
      collection.status === "failed" ||
      collection.status === "released"
    ) {
      return {
        ok: true,
        alreadyCompleted: true,
        collection,
        collectionKey,
        status: collection.status,
      };
    }
    if (collection.status !== "prepared" && collection.status !== "processing") {
      throw new Error("workspace_usage_collection_status_invalid");
    }

    const creditsAmount = roundCredits(Math.max(0, Number(collection.creditsAmount ?? 0)));
    if (!(creditsAmount > 0)) {
      throw new Error("workspace_usage_collection_amount_invalid");
    }
    const balance = await readCanonicalWorkspaceCreditBalance(ctx, collection.userId);
    if (!balance) throw new Error("workspace_usage_collection_balance_missing");
    const pendingCredits = readPendingCardCollectionCreditsBalance(balance);
    if (pendingCredits + 0.000001 < creditsAmount) {
      throw new Error("workspace_usage_collection_pending_balance_mismatch");
    }

    const restoreToUncollected = args.status !== "succeeded";
    await ctx.db.patch(balance._id, {
      uncollectedCreditsBalance: restoreToUncollected
        ? roundCredits(readUncollectedCreditsBalance(balance) + creditsAmount)
        : readUncollectedCreditsBalance(balance),
      pendingCardCollectionCreditsBalance: roundCredits(pendingCredits - creditsAmount),
      updatedAt: nowMs,
    });

    await ctx.db.patch(collection._id, {
      status: args.status,
      provider: "stripe",
      providerCustomerId:
        normalizeOptionalString(args.providerCustomerId) ?? collection.providerCustomerId,
      providerPaymentIntentId:
        normalizeOptionalString(args.providerPaymentIntentId) ?? collection.providerPaymentIntentId,
      failureReason: normalizeOptionalString(args.failureReason),
      metadata: mergeLedgerMetadata(collection.metadata, normalizeObjectMetadata(args.metadata)),
      completedAt: nowMs,
      updatedAt: nowMs,
    });

    const updated = await ctx.db.get(collection._id);
    return {
      ok: true,
      alreadyCompleted: false,
      collection: updated,
      collectionKey,
      status: args.status,
      creditsAmount,
    };
  },
});

async function finalizeWorkspaceUsagePaymentIntent(params: {
  ctx: any;
  collection: any;
  paymentIntent: any;
  nowMs: number;
}) {
  const collectionKey = String(params.collection?.collectionKey ?? "").trim();
  if (!collectionKey) return { disposition: "skipped", reason: "collection_key_missing" };
  const paymentIntentId = normalizeStripePaymentIntentId(params.paymentIntent?.id);
  const providerCustomerId =
    readStripeObjectId(params.paymentIntent?.customer, "cus_") ??
    normalizeStripeCustomerId(params.collection?.providerCustomerId);
  const status = String(params.paymentIntent?.status ?? "").trim();
  const metadata = {
    stripe_status: status || null,
    stripe_amount: Number(params.paymentIntent?.amount ?? 0) || 0,
    stripe_amount_received: Number(params.paymentIntent?.amount_received ?? 0) || 0,
  };
  if (paymentIntentIsSucceeded(status)) {
    await params.ctx.runMutation(
      (internal as any).workspaceCredits.completeWorkspaceUsageCardCollectionInternal,
      {
        collectionKey,
        status: "succeeded",
        providerCustomerId,
        providerPaymentIntentId: paymentIntentId,
        metadata,
        nowMs: params.nowMs,
      },
    );
    return { disposition: "succeeded", providerPaymentIntentId: paymentIntentId };
  }
  if (paymentIntentIsProcessing(status)) {
    await params.ctx.runMutation(
      (internal as any).workspaceCredits.markWorkspaceUsageCardCollectionProcessingInternal,
      {
        collectionKey,
        providerCustomerId,
        providerPaymentIntentId: paymentIntentId,
        metadata,
        nowMs: params.nowMs,
      },
    );
    return { disposition: "processing", providerPaymentIntentId: paymentIntentId };
  }
  if (paymentIntentIsTerminalFailure(status) || status) {
    await params.ctx.runMutation(
      (internal as any).workspaceCredits.completeWorkspaceUsageCardCollectionInternal,
      {
        collectionKey,
        status: "failed",
        providerCustomerId,
        providerPaymentIntentId: paymentIntentId,
        failureReason: normalizePaymentIntentFailureReason(
          params.paymentIntent,
          status || "stripe_payment_failed",
        ),
        metadata,
        nowMs: params.nowMs,
      },
    );
    return { disposition: "failed", providerPaymentIntentId: paymentIntentId };
  }
  return { disposition: "skipped", reason: "payment_intent_status_missing" };
}

async function attemptWorkspaceUsageStripeCollection(params: {
  ctx: any;
  stripe: ReturnType<typeof getStripeClient>;
  collection: any;
  providerCustomerId: string;
  providerPaymentMethodId: string;
  nowMs: number;
}) {
  const collectionKey = String(params.collection?.collectionKey ?? "").trim();
  const creditsAmount = roundCredits(Math.max(0, Number(params.collection?.creditsAmount ?? 0)));
  const amountCents = workspaceUsageCollectionAmountCents(creditsAmount);
  if (!collectionKey) return { disposition: "skipped", reason: "collection_key_missing" };
  if (amountCents < WORKSPACE_CARD_COLLECTION_MIN_CREDITS) {
    await params.ctx.runMutation(
      (internal as any).workspaceCredits.completeWorkspaceUsageCardCollectionInternal,
      {
        collectionKey,
        status: "released",
        providerCustomerId: params.providerCustomerId,
        failureReason: "workspace_usage_collection_below_stripe_minimum",
        metadata: {
          amount_cents: amountCents,
          minimum_amount_cents: WORKSPACE_CARD_COLLECTION_MIN_CREDITS,
        },
        nowMs: params.nowMs,
      },
    );
    return { disposition: "released_below_minimum" };
  }

  try {
    const paymentIntent = await params.stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        customer: params.providerCustomerId,
        payment_method: params.providerPaymentMethodId,
        confirm: true,
        off_session: true,
        description: "Polynet workspace tool usage",
        metadata: buildWorkspaceUsagePaymentIntentMetadata({
          collectionKey,
          userId: params.collection.userId,
          creditsAmount,
        }),
      },
      {
        idempotencyKey: `polynet-workspace-usage:${collectionKey}`,
      },
    );
    return await finalizeWorkspaceUsagePaymentIntent({
      ctx: params.ctx,
      collection: params.collection,
      paymentIntent,
      nowMs: params.nowMs,
    });
  } catch (error) {
    const paymentIntent = readStripeErrorPaymentIntent(error);
    if (paymentIntent) {
      return await finalizeWorkspaceUsagePaymentIntent({
        ctx: params.ctx,
        collection: params.collection,
        paymentIntent,
        nowMs: params.nowMs,
      });
    }
    const errorCode = readStripeErrorCode(error);
    if (
      [
        "card_declined",
        "expired_card",
        "incorrect_cvc",
        "processing_error",
        "authentication_required",
      ].includes(errorCode)
    ) {
      await params.ctx.runMutation(
        (internal as any).workspaceCredits.completeWorkspaceUsageCardCollectionInternal,
        {
          collectionKey,
          status: "failed",
          providerCustomerId: params.providerCustomerId,
          failureReason: errorCode,
          metadata: {
            stripe_error_code: errorCode,
          },
          nowMs: params.nowMs,
        },
      );
      return { disposition: "failed", failureReason: errorCode };
    }
    return {
      disposition: "retry_later",
      failureReason: errorCode,
    };
  }
}

export const collectWorkspaceUsageByCardInternal = internalAction({
  args: {
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = Math.max(1, Math.min(25, Math.floor(args.limit ?? 10)));
    let stripe: ReturnType<typeof getStripeClient> | null = null;
    const readStripe = () => {
      stripe ??= getStripeClient();
      return stripe;
    };
    let succeeded = 0;
    let processing = 0;
    let failed = 0;
    let released = 0;
    let retriedPrepared = 0;
    let prepared = 0;
    let skipped = 0;
    const failedSamples: Array<Record<string, unknown>> = [];
    const readStripeForCollection = (collectionKey: unknown) => {
      try {
        return readStripe();
      } catch (error) {
        skipped += 1;
        if (failedSamples.length < 5) {
          failedSamples.push({
            collectionKey: String(collectionKey ?? ""),
            failureReason: readStripeErrorCode(error),
          });
        }
        return null;
      }
    };

    const processingCollections = await ctx.runQuery(
      (internal as any).workspaceCredits.listWorkspaceUsageCardCollectionsByStatusInternal,
      {
        status: "processing",
        limit,
      },
    ) as any[];
    for (const collection of processingCollections) {
      const paymentIntentId = normalizeStripePaymentIntentId(collection?.providerPaymentIntentId);
      if (!paymentIntentId) {
        await ctx.runMutation(
          (internal as any).workspaceCredits.completeWorkspaceUsageCardCollectionInternal,
          {
            collectionKey: collection.collectionKey,
            status: "released",
            failureReason: "workspace_usage_processing_payment_intent_missing",
            nowMs,
          },
        );
        released += 1;
        continue;
      }
      try {
        const paymentIntent = await readStripe().paymentIntents.retrieve(paymentIntentId);
        const finalized = await finalizeWorkspaceUsagePaymentIntent({
          ctx,
          collection,
          paymentIntent,
          nowMs,
        });
        if (finalized.disposition === "succeeded") succeeded += 1;
        else if (finalized.disposition === "processing") processing += 1;
        else if (finalized.disposition === "failed") failed += 1;
        else skipped += 1;
      } catch (error) {
        skipped += 1;
        if (failedSamples.length < 5) {
          failedSamples.push({
            collectionKey: collection.collectionKey,
            failureReason: readStripeErrorCode(error),
          });
        }
      }
    }

    const stalePrepared = await ctx.runQuery(
      (internal as any).workspaceCredits.listWorkspaceUsageCardCollectionsByStatusInternal,
      {
        status: "prepared",
        olderThanMs: nowMs - WORKSPACE_CARD_COLLECTION_STALE_PREPARED_MS,
        limit,
      },
    ) as any[];
    for (const collection of stalePrepared) {
      const activeCollections = await ctx.runQuery(
        (internal as any).workspaceCredits
          .listActiveWorkspaceUsageCardCollectionsForUserInternal,
        {
          userId: collection.userId,
          limit: 3,
        },
      ) as any[];
      if (activeCollections.length > 1) {
        skipped += 1;
        if (failedSamples.length < 5) {
          failedSamples.push({
            collectionKey: collection.collectionKey,
            failureReason: "duplicate_active_workspace_usage_collections",
          });
        }
        continue;
      }
      const metadata = normalizeObjectMetadata(collection?.metadata);
      const providerCustomerId =
        normalizeStripeCustomerId(collection?.providerCustomerId) ??
        normalizeStripeCustomerId(metadata.provider_customer_id);
      const providerPaymentMethodId = normalizeStripePaymentMethodId(
        metadata.provider_payment_method_id,
      );
      if (!providerCustomerId || !providerPaymentMethodId) {
        await ctx.runMutation(
          (internal as any).workspaceCredits.completeWorkspaceUsageCardCollectionInternal,
          {
            collectionKey: collection.collectionKey,
            status: "released",
            failureReason: "workspace_usage_prepared_collection_unretryable",
            nowMs,
          },
        );
        released += 1;
        continue;
      }
      const stripeClient = readStripeForCollection(collection.collectionKey);
      if (!stripeClient) continue;
      const attempt = await attemptWorkspaceUsageStripeCollection({
        ctx,
        stripe: stripeClient,
        collection,
        providerCustomerId,
        providerPaymentMethodId,
        nowMs,
      });
      retriedPrepared += 1;
      if (attempt.disposition === "succeeded") succeeded += 1;
      else if (attempt.disposition === "processing") processing += 1;
      else if (attempt.disposition === "failed") failed += 1;
      else if (String(attempt.disposition).startsWith("released")) released += 1;
      else skipped += 1;
    }

    const candidateResult = await ctx.runQuery(
      (internal as any).workspaceCredits.listWorkspaceUsageCardCollectionCandidatesInternal,
      {
        minCredits: WORKSPACE_CARD_COLLECTION_MIN_CREDITS,
        limit,
      },
    ) as any;
    const candidates = Array.isArray(candidateResult?.candidates)
      ? candidateResult.candidates
      : [];
    for (const candidate of candidates) {
      const providerCustomerId = normalizeStripeCustomerId(candidate.providerCustomerId);
      const providerPaymentMethodId = normalizeStripePaymentMethodId(
        candidate.providerDefaultPaymentMethodId,
      );
      const requestedCredits = Math.floor(
        Math.max(0, Number(candidate.uncollectedCreditsBalance ?? 0) || 0),
      );
      if (
        !providerCustomerId ||
        !providerPaymentMethodId ||
        requestedCredits < WORKSPACE_CARD_COLLECTION_MIN_CREDITS
      ) {
        skipped += 1;
        continue;
      }
      const collectionKey = buildWorkspaceUsageCollectionKey(candidate);
      const activeBeforePrepare = await ctx.runQuery(
        (internal as any).workspaceCredits
          .listActiveWorkspaceUsageCardCollectionsForUserInternal,
        {
          userId: candidate.userId,
          limit: 2,
        },
      ) as any[];
      if (activeBeforePrepare.length > 0) {
        skipped += 1;
        continue;
      }
      const collectionResult = await ctx.runMutation(
        (internal as any).workspaceCredits.prepareWorkspaceUsageCardCollectionInternal,
        {
          collectionKey,
          userId: candidate.userId,
          requestedCredits,
          providerCustomerId,
          metadata: {
            provider_customer_id: providerCustomerId,
            provider_payment_method_id: providerPaymentMethodId,
            balance_updated_at: candidate.balanceUpdatedAt,
          },
          nowMs,
        },
      ) as any;
      if (!collectionResult?.ok || !collectionResult?.collection) {
        skipped += 1;
        continue;
      }
      if (
        collectionResult.collection.status === "succeeded" ||
        collectionResult.collection.status === "failed" ||
        collectionResult.collection.status === "released"
      ) {
        skipped += 1;
        continue;
      }
      const activeAfterPrepare = await ctx.runQuery(
        (internal as any).workspaceCredits
          .listActiveWorkspaceUsageCardCollectionsForUserInternal,
        {
          userId: candidate.userId,
          limit: 3,
        },
      ) as any[];
      if (activeAfterPrepare.length > 1) {
        skipped += 1;
        if (failedSamples.length < 5) {
          failedSamples.push({
            collectionKey,
            failureReason: "duplicate_active_workspace_usage_collections",
          });
        }
        continue;
      }
      const stripeClient = readStripeForCollection(collectionKey);
      if (!stripeClient) continue;
      prepared += collectionResult.alreadyExists ? 0 : 1;
      const attempt = await attemptWorkspaceUsageStripeCollection({
        ctx,
        stripe: stripeClient,
        collection: collectionResult.collection,
        providerCustomerId,
        providerPaymentMethodId,
        nowMs,
      });
      if (attempt.disposition === "succeeded") succeeded += 1;
      else if (attempt.disposition === "processing") processing += 1;
      else if (attempt.disposition === "failed") {
        failed += 1;
        if (failedSamples.length < 5) {
          failedSamples.push({
            collectionKey,
            failureReason: (attempt as any).failureReason ?? "stripe_payment_failed",
          });
        }
      } else if (String(attempt.disposition).startsWith("released")) {
        released += 1;
      } else {
        skipped += 1;
      }
    }

    return {
      scannedCandidates: candidates.length,
      scannedProcessing: processingCollections.length,
      scannedStalePrepared: stalePrepared.length,
      prepared,
      retriedPrepared,
      succeeded,
      processing,
      failed,
      released,
      skipped,
      candidateScanTruncated: Boolean(candidateResult?.truncated),
      failedSamples,
    };
  },
});

export const getWorkspaceCreditBalanceInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await readCanonicalWorkspaceCreditBalance(ctx, args.userId);
  },
});

export const getCreditLedgerEntryByKeyInternal = internalQuery({
  args: {
    creditKey: v.string(),
  },
  handler: async (ctx, args) => {
    const creditKey = String(args.creditKey ?? "").trim();
    if (!creditKey) return null;
    return await ctx.db
      .query("creditLedgerEntries")
      .withIndex("by_creditKey", (q) => q.eq("creditKey", creditKey))
      .first();
  },
});

export const listReservedBlaxelRuntimeWorkspaceReservationsByRunInternal = internalQuery({
  args: {
    userId: v.id("users"),
    runId: v.string(),
    projectId: v.optional(v.id("cloudProjects")),
  },
  handler: async (ctx, args) => {
    const runId = normalizeOptionalString(args.runId);
    if (!runId) return [];
    const rows = await ctx.db
      .query("creditLedgerEntries")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    return rows.filter((entry) => {
      if (entry.status !== "reserved") return false;
      if (!isBlaxelRuntimeWorkspaceReservation(entry)) return false;
      if (String(entry.userId ?? "") !== String(args.userId ?? "")) return false;
      if (args.projectId && String(entry.projectId ?? "") !== String(args.projectId)) {
        return false;
      }
      return true;
    });
  },
});

async function readWorkspaceToolBalanceProjection(ctx: any, args: {
  authSubject?: string;
  nowMs?: number;
}) {
  const actor = await resolveAuthenticatedActor({
    ctx,
    authSubject: args.authSubject ?? null,
  });
  const rows = await readWorkspaceCreditBalanceRowsByUser(ctx, actor.dbUserId, 2);
  if (rows.length > 1) {
    return {
      ...buildWorkspaceToolBalanceProjection(null, actor.dbUserId, args.nowMs ?? Date.now()),
      blocked: true,
      blockedReason: DUPLICATE_WORKSPACE_CREDIT_BALANCE_ERROR,
    };
  }
  const row = rows[0] ?? null;
  return buildWorkspaceToolBalanceProjection(row, actor.dbUserId, args.nowMs ?? Date.now());
}

export const getWorkspaceToolBalance = query({
  args: {
    authSubject: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => await readWorkspaceToolBalanceProjection(ctx, args),
});

export const getWorkspaceCreditBalance = query({
  args: {
    authSubject: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => await readWorkspaceToolBalanceProjection(ctx, args),
});

export const getWorkspaceBillingOverview = query({
  args: {
    authSubject: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const actor = await resolveAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const balanceRows = await readWorkspaceCreditBalanceRowsByUser(ctx, actor.dbUserId, 2);
    const balance =
      balanceRows.length > 1
        ? null
        : balanceRows[0] ?? null;
    const baseBalanceProjection = buildWorkspaceToolBalanceProjection(
      balance,
      actor.dbUserId,
      nowMs,
    );
    const balanceProjection =
      balanceRows.length > 1
        ? {
            ...baseBalanceProjection,
            blocked: true,
            blockedReason: DUPLICATE_WORKSPACE_CREDIT_BALANCE_ERROR,
          }
        : baseBalanceProjection;

    const currentMonthStart = startOfUtcMonth(nowMs);
    const buckets = Array.from({ length: WORKSPACE_BILLING_OVERVIEW_MONTHS }, (_, index) =>
      buildWorkspaceBillingMonthBucket(addUtcMonths(currentMonthStart, -index)),
    );
    const bucketsByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
    const paidToolLedgerToolNames = new Set<string>(PAID_TOOL_LEDGER_TOOL_NAMES);
    const canonicalPaidToolCreditKeys = new Set<string>();

    const creditLedgerEntries = await ctx.db
      .query("creditLedgerEntries")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", actor.dbUserId))
      .order("desc")
      .take(WORKSPACE_BILLING_OVERVIEW_ROW_LIMIT);
    for (const entry of creditLedgerEntries) {
      if (entry.status !== "succeeded") continue;
      const toolName = normalizeOptionalString(entry.toolName);
      if (!toolName || !paidToolLedgerToolNames.has(toolName)) continue;
      const creditKey = normalizeOptionalString(entry.creditKey);
      if (creditKey) canonicalPaidToolCreditKeys.add(creditKey);
      const bucket = findWorkspaceBillingMonthBucket(
        bucketsByKey,
        entry.settledAt ?? entry.updatedAt ?? entry.createdAt,
      );
      if (!bucket) continue;
      const usageCredits = readCreditLedgerBillingUsageCredits(entry);
      if (!(usageCredits > 0)) continue;
      bucket.workspaceUsageCredits = roundCredits(
        bucket.workspaceUsageCredits + usageCredits,
      );
    }

    // Legacy billing fallback: creditLedgerEntries above is the canonical paid-tool usage source.
    const workspaceCharges = await ctx.db
      .query("workspaceComputeCharges")
      .withIndex("by_user", (q) => q.eq("userId", actor.dbUserId))
      .order("desc")
      .take(WORKSPACE_BILLING_OVERVIEW_ROW_LIMIT);
    for (const charge of workspaceCharges) {
      const creditReservationKey = normalizeOptionalString(charge.creditReservationKey);
      if (creditReservationKey && canonicalPaidToolCreditKeys.has(creditReservationKey)) {
        continue;
      }
      const bucket = findWorkspaceBillingMonthBucket(
        bucketsByKey,
        charge.endedAt ?? charge.createdAt,
      );
      if (!bucket) continue;
      bucket.workspaceUsageCredits = roundCredits(
        bucket.workspaceUsageCredits +
          priceWorkspaceUsageCredits({ computeCostUsd: Number(charge.computeCostUsd ?? 0) || 0 }),
      );
    }

    const usageCollections = await ctx.db
      .query("workspaceUsageCollections")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", actor.dbUserId).eq("status", "succeeded"),
      )
      .order("desc")
      .take(WORKSPACE_BILLING_OVERVIEW_ROW_LIMIT);
    for (const collection of usageCollections) {
      const bucket = findWorkspaceBillingMonthBucket(
        bucketsByKey,
        collection.completedAt ?? collection.updatedAt ?? collection.createdAt,
      );
      if (!bucket) continue;
      bucket.paidCredits = roundCredits(
        bucket.paidCredits + Math.max(0, Number(collection.creditsAmount ?? 0) || 0),
      );
    }

    const topups = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerUserId", actor.dbUserId).eq("status", "complete"),
      )
      .order("desc")
      .take(WORKSPACE_BILLING_OVERVIEW_ROW_LIMIT);
    for (const topup of topups) {
      if (topup.mode !== "workspace_credit_topup") continue;
      const bucket = findWorkspaceBillingMonthBucket(
        bucketsByKey,
        topup.workspaceCreditsGrantedAt ?? topup.updatedAt ?? topup.createdAt,
      );
      if (!bucket) continue;
      bucket.paidCredits = roundCredits(
        bucket.paidCredits + Math.max(0, Number(topup.workspaceCreditsAmount ?? 0) || 0),
      );
    }

    const [currentPeriod, ...history] = buckets.map(workspaceBillingMonthToPublic);
    const prepaidBalanceCredits = roundCredits(
      Number(balanceProjection.spendableCreditsBalance ?? 0) || 0,
    );
    const currentUsageCredits = roundCredits(
      Number(balanceProjection.outstandingUsageCreditsBalance ?? 0) || 0,
    );
    const pendingCardCollectionCredits = roundCredits(
      Number(balanceProjection.pendingCardCollectionCreditsBalance ?? 0) || 0,
    );

    return {
      userId: actor.dbUserId,
      generatedAt: nowMs,
      currentPeriod: {
        ...currentPeriod,
        prepaidBalanceCredits,
        prepaidBalanceUsd: formatWorkspaceToolBalanceUsdFromCredits(prepaidBalanceCredits),
        currentUsageCredits,
        currentUsageUsd: formatWorkspaceToolBalanceUsdFromCredits(currentUsageCredits),
        pendingCardCollectionCredits,
        pendingCardCollectionUsd:
          formatWorkspaceToolBalanceUsdFromCredits(pendingCardCollectionCredits),
      },
      history,
      scan: {
        creditLedgerEntriesTruncated:
          creditLedgerEntries.length >= WORKSPACE_BILLING_OVERVIEW_ROW_LIMIT,
        workspaceChargesTruncated:
          workspaceCharges.length >= WORKSPACE_BILLING_OVERVIEW_ROW_LIMIT,
        usageCollectionsTruncated:
          usageCollections.length >= WORKSPACE_BILLING_OVERVIEW_ROW_LIMIT,
        topupsTruncated: topups.length >= WORKSPACE_BILLING_OVERVIEW_ROW_LIMIT,
      },
    };
  },
});

export const upsertWorkspaceCreditBalanceInternal = internalMutation({
  args: {
    userId: v.id("users"),
    includedCreditsBalance: v.optional(v.number()),
    purchasedCreditsBalance: v.optional(v.number()),
    includedCycleCredits: v.optional(v.number()),
    includedCycleStartedAt: v.optional(v.number()),
    includedCycleEndsAt: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const existing = await readCanonicalWorkspaceCreditBalance(ctx, args.userId);
    const patch = {
      includedCreditsBalance:
        typeof args.includedCreditsBalance === "number"
          ? roundCredits(args.includedCreditsBalance)
          : existing?.includedCreditsBalance ?? DEFAULT_INCLUDED_TOOL_CREDITS,
      purchasedCreditsBalance:
        typeof args.purchasedCreditsBalance === "number"
          ? roundCredits(args.purchasedCreditsBalance)
          : existing?.purchasedCreditsBalance ?? 0,
      uncollectedCreditsBalance: readUncollectedCreditsBalance(existing),
      pendingCardCollectionCreditsBalance: readPendingCardCollectionCreditsBalance(existing),
      includedCycleCredits:
        typeof args.includedCycleCredits === "number"
          ? roundCredits(args.includedCycleCredits)
          : existing?.includedCycleCredits ?? DEFAULT_INCLUDED_TOOL_CREDITS,
      includedCycleStartedAt:
        typeof args.includedCycleStartedAt === "number"
          ? args.includedCycleStartedAt
          : existing?.includedCycleStartedAt ?? nowMs,
      includedCycleEndsAt:
        typeof args.includedCycleEndsAt === "number"
          ? args.includedCycleEndsAt
          : existing?.includedCycleEndsAt ?? nowMs,
      updatedAt: nowMs,
    };
    if (!existing) {
      const id = await ctx.db.insert("workspaceCreditBalances", {
        userId: args.userId,
        ...patch,
        createdAt: nowMs,
      });
      return await ctx.db.get(id);
    }
    await ctx.db.patch(existing._id, patch);
    return await ctx.db.get(existing._id);
  },
});

function mergeWorkspaceCreditBalanceRows(rows: any[], nowMs: number) {
  const ordered = [...rows].sort((a, b) => {
    const updatedDelta = normalizeBalanceNumber(b.updatedAt) - normalizeBalanceNumber(a.updatedAt);
    if (updatedDelta !== 0) return updatedDelta;
    return normalizeBalanceNumber(b.createdAt) - normalizeBalanceNumber(a.createdAt);
  });
  const canonical = ordered[0];
  const cycle = ordered.reduce((best, row) => {
    if (!best) return row;
    const bestEndsAt = normalizeBalanceNumber(best.includedCycleEndsAt);
    const rowEndsAt = normalizeBalanceNumber(row.includedCycleEndsAt);
    if (rowEndsAt !== bestEndsAt) return rowEndsAt > bestEndsAt ? row : best;
    return normalizeBalanceNumber(row.updatedAt) > normalizeBalanceNumber(best.updatedAt) ? row : best;
  }, canonical);
  const cycleStartedAt = normalizeBalanceNumber(cycle?.includedCycleStartedAt) || nowMs;
  const cycleEndsAt = normalizeBalanceNumber(cycle?.includedCycleEndsAt) || nowMs;
  const includedCreditsBalance = cycleEndsAt > nowMs
    ? rows.reduce((sum, row) => {
        const rowStartedAt = normalizeBalanceNumber(row.includedCycleStartedAt);
        const rowEndsAt = normalizeBalanceNumber(row.includedCycleEndsAt);
        if (rowStartedAt !== cycleStartedAt || rowEndsAt !== cycleEndsAt) return sum;
        return sum + Math.max(0, normalizeBalanceNumber(row.includedCreditsBalance));
      }, 0)
    : 0;
  return {
    canonical,
    patch: {
      includedCreditsBalance: roundCredits(includedCreditsBalance),
      purchasedCreditsBalance: roundCredits(
        rows.reduce((sum, row) => sum + Math.max(0, normalizeBalanceNumber(row.purchasedCreditsBalance)), 0),
      ),
      uncollectedCreditsBalance: roundCredits(
        rows.reduce((sum, row) => sum + readUncollectedCreditsBalance(row), 0),
      ),
      pendingCardCollectionCreditsBalance: roundCredits(
        rows.reduce((sum, row) => sum + readPendingCardCollectionCreditsBalance(row), 0),
      ),
      includedCycleCredits: roundCredits(
        Math.max(0, normalizeBalanceNumber(cycle?.includedCycleCredits)),
      ),
      includedCycleStartedAt: cycleStartedAt,
      includedCycleEndsAt: cycleEndsAt,
      createdAt: Math.min(...rows.map((row) => normalizeBalanceNumber(row.createdAt) || nowMs)),
      updatedAt: nowMs,
    },
    duplicateRows: ordered.slice(1),
  };
}

async function repairWorkspaceCreditBalanceRowsForUser(params: {
  ctx: any;
  userId: any;
  nowMs: number;
  dryRun: boolean;
}) {
  const rows = await readWorkspaceCreditBalanceRowsByUser(
    params.ctx,
    params.userId,
    WORKSPACE_CREDIT_BALANCE_REPAIR_ROW_LIMIT,
  );
  const truncated = rows.length >= WORKSPACE_CREDIT_BALANCE_REPAIR_ROW_LIMIT;
  if (rows.length <= 1) {
    return {
      userId: String(params.userId),
      rows: rows.length,
      duplicateRows: 0,
      mergedDuplicateRows: 0,
      canonicalId: rows[0]?._id ? String(rows[0]._id) : null,
      dryRun: params.dryRun,
      repaired: false,
      truncated,
    };
  }
  if (truncated && !params.dryRun) {
    throw new Error("workspace_credit_balance_repair_row_limit_exceeded");
  }

  const merged = mergeWorkspaceCreditBalanceRows(rows, params.nowMs);
  if (!params.dryRun) {
    await params.ctx.db.patch(merged.canonical._id, merged.patch);
    for (const duplicate of merged.duplicateRows) {
      await params.ctx.db.delete(duplicate._id);
    }
  }

  return {
    userId: String(params.userId),
    rows: rows.length,
    duplicateRows: merged.duplicateRows.length,
    mergedDuplicateRows: merged.duplicateRows.length,
    canonicalId: String(merged.canonical._id),
    dryRun: params.dryRun,
    repaired: !params.dryRun,
    truncated,
  };
}

function buildWorkspaceCreditBalanceDiagnostics(rows: any[], nowMs: number, sampleLimit: number) {
  const byUser = new Map<string, any[]>();
  for (const row of rows) {
    const key = String(row.userId);
    byUser.set(key, [...(byUser.get(key) ?? []), row]);
  }

  let duplicateUsers = 0;
  let duplicateRows = 0;
  let balancesWithUncollectedUsage = 0;
  let uncollectedCreditsBalance = 0;
  let balancesWithPendingCardCollections = 0;
  let pendingCardCollectionCreditsBalance = 0;
  let negativeBalanceRows = 0;
  const duplicateSamples: Array<{
    userId: string;
    rows: number;
    canonicalId: string;
    mergedDuplicateRows: number;
  }> = [];
  const uncollectedSamples: Array<{
    userId: string;
    balanceId: string;
    uncollectedCreditsBalance: number;
    uncollectedBalanceUsd: string;
  }> = [];
  const pendingCardCollectionSamples: Array<{
    userId: string;
    balanceId: string;
    pendingCardCollectionCreditsBalance: number;
    pendingCardCollectionBalanceUsd: string;
  }> = [];
  const negativeBalanceSamples: Array<{
    userId: string;
    balanceId: string;
    includedCreditsBalance: number;
    purchasedCreditsBalance: number;
    uncollectedCreditsBalance: number;
    pendingCardCollectionCreditsBalance: number;
  }> = [];

  for (const userRows of byUser.values()) {
    if (userRows.length > 1) {
      const merged = mergeWorkspaceCreditBalanceRows(userRows, nowMs);
      duplicateUsers += 1;
      duplicateRows += merged.duplicateRows.length;
      if (duplicateSamples.length < sampleLimit) {
        duplicateSamples.push({
          userId: String(merged.canonical.userId),
          rows: userRows.length,
          canonicalId: String(merged.canonical._id),
          mergedDuplicateRows: merged.duplicateRows.length,
        });
      }
    }
  }

  for (const row of rows) {
    const includedCreditsBalance = roundCredits(normalizeBalanceNumber(row.includedCreditsBalance));
    const purchasedCreditsBalance = roundCredits(normalizeBalanceNumber(row.purchasedCreditsBalance));
    const rowUncollectedCreditsBalance = readUncollectedCreditsBalance(row);
    const rowPendingCardCollectionCreditsBalance = readPendingCardCollectionCreditsBalance(row);
    if (rowUncollectedCreditsBalance > 0) {
      balancesWithUncollectedUsage += 1;
      uncollectedCreditsBalance = roundCredits(uncollectedCreditsBalance + rowUncollectedCreditsBalance);
      if (uncollectedSamples.length < sampleLimit) {
        uncollectedSamples.push({
          userId: String(row.userId),
          balanceId: String(row._id),
          uncollectedCreditsBalance: rowUncollectedCreditsBalance,
          uncollectedBalanceUsd: formatWorkspaceToolBalanceUsdFromCredits(rowUncollectedCreditsBalance),
        });
      }
    }
    if (rowPendingCardCollectionCreditsBalance > 0) {
      balancesWithPendingCardCollections += 1;
      pendingCardCollectionCreditsBalance = roundCredits(
        pendingCardCollectionCreditsBalance + rowPendingCardCollectionCreditsBalance,
      );
      if (pendingCardCollectionSamples.length < sampleLimit) {
        pendingCardCollectionSamples.push({
          userId: String(row.userId),
          balanceId: String(row._id),
          pendingCardCollectionCreditsBalance: rowPendingCardCollectionCreditsBalance,
          pendingCardCollectionBalanceUsd: formatWorkspaceToolBalanceUsdFromCredits(
            rowPendingCardCollectionCreditsBalance,
          ),
        });
      }
    }
    if (
      includedCreditsBalance < 0 ||
      purchasedCreditsBalance < 0 ||
      rowUncollectedCreditsBalance < 0 ||
      rowPendingCardCollectionCreditsBalance < 0
    ) {
      negativeBalanceRows += 1;
      if (negativeBalanceSamples.length < sampleLimit) {
        negativeBalanceSamples.push({
          userId: String(row.userId),
          balanceId: String(row._id),
          includedCreditsBalance,
          purchasedCreditsBalance,
          uncollectedCreditsBalance: rowUncollectedCreditsBalance,
          pendingCardCollectionCreditsBalance: rowPendingCardCollectionCreditsBalance,
        });
      }
    }
  }

  return {
    scannedRows: rows.length,
    duplicateUsers,
    duplicateRows,
    duplicateSamples,
    balancesWithUncollectedUsage,
    uncollectedCreditsBalance: roundCredits(uncollectedCreditsBalance),
    uncollectedBalanceUsd: formatWorkspaceToolBalanceUsdFromCredits(uncollectedCreditsBalance),
    uncollectedSamples,
    balancesWithPendingCardCollections,
    pendingCardCollectionCreditsBalance: roundCredits(pendingCardCollectionCreditsBalance),
    pendingCardCollectionBalanceUsd: formatWorkspaceToolBalanceUsdFromCredits(
      pendingCardCollectionCreditsBalance,
    ),
    pendingCardCollectionSamples,
    negativeBalanceRows,
    negativeBalanceSamples,
  };
}

export const getWorkspaceToolCreditDiagnosticsForOperator = query({
  args: {
    authSubject: v.optional(v.string()),
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const operator = await requireOperatorRole(ctx, args.authSubject, "operator");
    const nowMs = args.nowMs ?? Date.now();
    const limit = boundedLimit(args.limit, 25, 100);
    const recentBalanceRows = await readRecentWorkspaceCreditBalanceRows(ctx, limit);
    const balanceRowsById = new Map<string, any>();
    for (const row of recentBalanceRows) {
      balanceRowsById.set(String(row._id), row);
    }
    const sampledUserIds = new Set(recentBalanceRows.map((row: any) => String(row.userId)));
    for (const userId of sampledUserIds) {
      const userRows = await readWorkspaceCreditBalanceRowsByUser(ctx, userId, 5);
      for (const row of userRows) {
        balanceRowsById.set(String(row._id), row);
      }
    }
    const balanceRows = [...balanceRowsById.values()];
    const balanceDiagnostics = buildWorkspaceCreditBalanceDiagnostics(balanceRows, nowMs, limit);
    const pendingTopups = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_mode_status", (q) =>
        q.eq("mode", "workspace_credit_topup").eq("status", "pending"),
      )
      .take(500);
    const staleTopups = pendingTopups
      .filter((row) => effectiveWorkspaceCreditTopupCheckoutExpiresAt(row) <= nowMs)
      .slice(0, limit)
      .map((row) => ({
        sessionId: row.sessionId,
        ownerUserId: row.ownerUserId ? String(row.ownerUserId) : null,
        workspaceCreditsAmount: row.workspaceCreditsAmount ?? null,
        expiresAt: row.expiresAt,
        effectiveExpiresAt: effectiveWorkspaceCreditTopupCheckoutExpiresAt(row),
      }));
    const pendingSettlements = await ctx.db
      .query("creditLedgerEntries")
      .withIndex("by_pendingSettlementStatus_nextAttemptAt", (q) =>
        q.eq("pendingSettlementStatus", "succeeded").lt("pendingSettlementNextAttemptAt", nowMs),
      )
      .take(limit);

    return {
      generatedAt: nowMs,
      operator: {
        userId: operator.userId,
        role: operator.role,
      },
      balances: balanceDiagnostics,
      uncollectedUsage: {
        balanceRows: balanceDiagnostics.balancesWithUncollectedUsage,
        uncollectedCreditsBalance: balanceDiagnostics.uncollectedCreditsBalance,
        uncollectedBalanceUsd: balanceDiagnostics.uncollectedBalanceUsd,
        samples: balanceDiagnostics.uncollectedSamples,
      },
      pendingCardCollections: {
        balanceRows: balanceDiagnostics.balancesWithPendingCardCollections,
        pendingCardCollectionCreditsBalance:
          balanceDiagnostics.pendingCardCollectionCreditsBalance,
        pendingCardCollectionBalanceUsd:
          balanceDiagnostics.pendingCardCollectionBalanceUsd,
        samples: balanceDiagnostics.pendingCardCollectionSamples,
      },
      staleTopupCheckouts: {
        scannedPendingRows: pendingTopups.length,
        staleRowsInScan: pendingTopups.filter((row) =>
          effectiveWorkspaceCreditTopupCheckoutExpiresAt(row) <= nowMs
        ).length,
        isTruncated: pendingTopups.length >= 500,
        samples: staleTopups,
      },
      pendingSettlements: {
        dueRows: pendingSettlements.length,
        samples: pendingSettlements.map((entry) => ({
          creditKey: entry.creditKey,
          userId: String(entry.userId),
          toolName: entry.toolName,
          attempts: entry.pendingSettlementAttempts ?? 0,
          nextAttemptAt: entry.pendingSettlementNextAttemptAt ?? null,
          error: entry.pendingSettlementError ?? null,
        })),
      },
      repair: {
        duplicateBalanceRowsDryRun: {
          duplicateUsers: balanceDiagnostics.duplicateUsers,
          mergedDuplicateRows: balanceDiagnostics.duplicateRows,
          samples: balanceDiagnostics.duplicateSamples,
        },
      },
    };
  },
});

export const repairDuplicateWorkspaceCreditBalancesInternal = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    limitUsers: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const dryRun = args.dryRun === true;
    const limitUsers = Math.max(1, Math.min(100, Math.floor(args.limitUsers ?? 25)));
    const recentRows = await readRecentWorkspaceCreditBalanceRows(ctx, limitUsers * 5);
    const byUser = new Map<string, any[]>();
    for (const recentRow of recentRows) {
      const userRows = await readWorkspaceCreditBalanceRowsByUser(ctx, recentRow.userId, 25);
      const key = String(recentRow.userId);
      byUser.set(key, userRows);
    }

    let duplicateUsers = 0;
    let repairedUsers = 0;
    let deletedRows = 0;
    const samples: Array<{ userId: string; rows: number; canonicalId: string | null; truncated: boolean }> = [];
    for (const [userId, userRows] of byUser.entries()) {
      if (userRows.length <= 1) continue;
      duplicateUsers += 1;
      if (repairedUsers >= limitUsers) continue;
      const repaired = await repairWorkspaceCreditBalanceRowsForUser({
        ctx,
        userId: userRows[0].userId,
        nowMs,
        dryRun,
      });
      samples.push({
        userId,
        rows: repaired.rows,
        canonicalId: repaired.canonicalId,
        truncated: repaired.truncated,
      });
      deletedRows += repaired.mergedDuplicateRows;
      repairedUsers += 1;
    }
    return {
      scannedRows: recentRows.length,
      duplicateUsers,
      repairedUsers,
      mergedDuplicateRows: deletedRows,
      dryRun,
      samples,
    };
  },
});

export const repairWorkspaceCreditBalanceForOperator = mutation({
  args: {
    authSubject: v.optional(v.string()),
    userId: v.id("users"),
    dryRun: v.optional(v.boolean()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const operator = await requireOperatorRole(ctx, args.authSubject, "operator");
    const nowMs = args.nowMs ?? Date.now();
    const result = await repairWorkspaceCreditBalanceRowsForUser({
      ctx,
      userId: args.userId,
      nowMs,
      dryRun: args.dryRun !== false,
    });
    return {
      generatedAt: nowMs,
      operator: {
        userId: operator.userId,
        role: operator.role,
      },
      ...result,
    };
  },
});

export const getWorkspaceCreditTopupCheckoutSessionInternal = internalQuery({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!row || row.mode !== "workspace_credit_topup") return null;
    return row;
  },
});

export const expireStaleWorkspaceCreditTopupCheckoutSessionsInternal = internalMutation({
  args: {
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 50)));
    const pending = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_mode_status", (q) =>
        q.eq("mode", "workspace_credit_topup").eq("status", "pending"),
      )
      .take(limit);
    let expired = 0;
    for (const row of pending) {
      if (effectiveWorkspaceCreditTopupCheckoutExpiresAt(row) > nowMs) continue;
      await ctx.db.patch(row._id, {
        status: "expired",
        updatedAt: nowMs,
      });
      expired += 1;
    }
    return {
      scanned: pending.length,
      expired,
    };
  },
});

export const completeWorkspaceCreditTopupCheckoutSessionInternal = internalMutation({
  args: {
    localSessionId: v.string(),
    providerCheckoutSessionId: v.optional(v.union(v.string(), v.null())),
    providerCustomerId: v.optional(v.union(v.string(), v.null())),
    providerPriceId: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const row = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.localSessionId))
      .first();
    if (!row) throw new Error("workspace_credit_topup_checkout_session_not_found");
    if (row.mode !== "workspace_credit_topup") throw new Error("workspace_credit_topup_checkout_session_invalid");
    if (!row.ownerUserId) throw new Error("workspace_credit_topup_owner_missing");
    const ownerUserId = row.ownerUserId;
    await attachStripeCustomerToUser({
      ctx,
      userId: ownerUserId,
      providerCustomerId: args.providerCustomerId,
      nowMs,
    });
    if (typeof row.workspaceCreditsGrantedAt === "number") {
      return {
        ok: true,
        alreadyGranted: true,
        ownerUserId,
        grantedCredits: row.workspaceCreditsAmount ?? 0,
      };
    }

    const grantedCredits = roundCredits(row.workspaceCreditsAmount ?? WORKSPACE_CREDIT_TOPUP_CREDITS);
    if (!(grantedCredits > 0)) {
      throw new Error("workspace_credit_topup_amount_invalid");
    }

    const existingBalance = await readCanonicalWorkspaceCreditBalance(ctx, ownerUserId);

    let uncollectedCreditsPaid = 0;
    if (!existingBalance) {
      await ctx.db.insert("workspaceCreditBalances", {
        userId: ownerUserId,
        includedCreditsBalance: 0,
        purchasedCreditsBalance: grantedCredits,
        uncollectedCreditsBalance: 0,
        pendingCardCollectionCreditsBalance: 0,
        includedCycleCredits: 0,
        includedCycleStartedAt: nowMs,
        includedCycleEndsAt: nowMs,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    } else {
      const existingUncollectedCredits = readUncollectedCreditsBalance(existingBalance);
      uncollectedCreditsPaid = Math.min(existingUncollectedCredits, grantedCredits);
      const purchasedCreditsGranted = roundCredits(grantedCredits - uncollectedCreditsPaid);
      await ctx.db.patch(existingBalance._id, {
        purchasedCreditsBalance: roundCredits(
          existingBalance.purchasedCreditsBalance + purchasedCreditsGranted,
        ),
        uncollectedCreditsBalance: roundCredits(
          existingUncollectedCredits - uncollectedCreditsPaid,
        ),
        updatedAt: nowMs,
      });
    }

    await ctx.db.patch(row._id, {
      provider: "stripe",
      providerCheckoutSessionId:
        String(args.providerCheckoutSessionId ?? "").trim() || row.providerCheckoutSessionId,
      providerCustomerId:
        String(args.providerCustomerId ?? "").trim() || row.providerCustomerId,
      providerPriceId: normalizeStripePriceId(args.providerPriceId) ?? normalizeStripePriceId(row.providerPriceId),
      workspaceCreditsAmount: grantedCredits,
      workspaceCreditsGrantedAt: nowMs,
      workspaceCreditsUncollectedPaid: roundCredits(uncollectedCreditsPaid),
      status: "complete",
      updatedAt: nowMs,
    });

    return {
      ok: true,
      alreadyGranted: false,
      ownerUserId: row.ownerUserId,
      grantedCredits,
    };
  },
});

// Legacy Blaxel/runtime compatibility writer. New paid-tool usage should reserve and
// settle creditLedgerEntries directly; this remains for older workspace-session evidence.
export const recordWorkspaceComputeChargeInternal = internalMutation({
  args: {
    chargeKey: v.string(),
    userId: v.id("users"),
    projectId: v.id("cloudProjects"),
    runId: v.string(),
    providerSandboxId: v.string(),
    startedAt: v.number(),
    endedAt: v.number(),
    durationSeconds: v.optional(v.number()),
    measuredDurationSeconds: v.optional(v.number()),
    providerStandbyGraceSeconds: v.optional(v.number()),
    providerReleaseReason: v.optional(v.union(v.string(), v.null())),
    providerReleaseConfirmed: v.optional(v.union(v.boolean(), v.null())),
    sandboxCpu: v.number(),
    sandboxMemoryGiB: v.number(),
    sandboxDiskGiB: v.number(),
    computeCostUsd: v.optional(v.number()),
    creditsDebited: v.optional(v.number()),
    creditReservationKey: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const existing = await ctx.db
      .query("workspaceComputeCharges")
      .withIndex("by_chargeKey", (q) => q.eq("chargeKey", args.chargeKey))
      .first();
    if (existing) return existing;

    const durationSeconds = Math.max(
      0,
      typeof args.durationSeconds === "number"
        ? args.durationSeconds
        : (args.endedAt - args.startedAt) / 1000,
    );
    const measuredDurationSeconds = Math.max(
      0,
      typeof args.measuredDurationSeconds === "number" &&
        Number.isFinite(args.measuredDurationSeconds)
        ? args.measuredDurationSeconds
        : (args.endedAt - args.startedAt) / 1000,
    );
    const providerStandbyGraceSeconds = Math.max(
      0,
      typeof args.providerStandbyGraceSeconds === "number" &&
        Number.isFinite(args.providerStandbyGraceSeconds)
        ? args.providerStandbyGraceSeconds
        : Math.max(0, durationSeconds - measuredDurationSeconds),
    );
    const providerReleaseReason = normalizeOptionalString(args.providerReleaseReason);
    const providerReleaseConfirmed = args.providerReleaseConfirmed === true;
    const providerCostPeriodEnd = Math.max(
      args.endedAt,
      args.startedAt + durationSeconds * 1000,
    );
    const computeCostUsd = roundCurrency(
      typeof args.computeCostUsd === "number"
        ? args.computeCostUsd
        : estimateWorkspaceComputeUsd({
            durationSeconds,
            sandboxCpu: args.sandboxCpu,
            sandboxMemoryGiB: args.sandboxMemoryGiB,
          }),
    );
    const requestedCredits = roundCredits(
      typeof args.creditsDebited === "number"
        ? args.creditsDebited
        : priceWorkspaceUsageCredits({ computeCostUsd }),
    );

    let debitIncluded = 0;
    let debitPurchased = 0;
    const creditReservationKey = normalizeOptionalString(args.creditReservationKey);
    if (creditReservationKey) {
      const reservation = await ctx.db
        .query("creditLedgerEntries")
        .withIndex("by_creditKey", (q) => q.eq("creditKey", creditReservationKey))
        .first();
      if (reservation?.status === "reserved") {
        const split = splitSettledCredits({
          includedDebited: reservation.includedCreditsDebited,
          purchasedDebited: reservation.purchasedCreditsDebited,
          creditsSettled: requestedCredits,
        });
        const refund = applySpendableCreditRefund({ split });
        const hasRefund = refund.purchasedRefunded > 0;
        if (hasRefund) {
          const balance = await readCanonicalWorkspaceCreditBalance(ctx, reservation.userId);
          if (balance) {
            await ctx.db.patch(balance._id, {
              purchasedCreditsBalance: roundCredits(
                balance.purchasedCreditsBalance + refund.purchasedRefunded,
              ),
              updatedAt: nowMs,
            });
          } else {
            await ctx.db.insert("workspaceCreditBalances", {
              userId: reservation.userId,
              includedCreditsBalance: 0,
              purchasedCreditsBalance: refund.purchasedRefunded,
              uncollectedCreditsBalance: 0,
              pendingCardCollectionCreditsBalance: 0,
              includedCycleCredits: 0,
              includedCycleStartedAt: nowMs,
              includedCycleEndsAt: nowMs,
              createdAt: nowMs,
              updatedAt: nowMs,
            });
          }
        }
        debitIncluded = split.includedSettled;
        debitPurchased = split.purchasedSettled;
        let extraIncludedDebited = 0;
        let extraPurchasedDebited = 0;
        const remainingCredits = roundCredits(
          requestedCredits - debitIncluded - debitPurchased,
        );
        if (remainingCredits > 0) {
          const extraDebit = await debitAvailableWorkspaceCredits({
            ctx,
            userId: args.userId,
            credits: remainingCredits,
            nowMs,
          });
          extraIncludedDebited = extraDebit.includedDebited;
          extraPurchasedDebited = extraDebit.purchasedDebited;
          debitIncluded = roundCredits(debitIncluded + extraDebit.includedDebited);
          debitPurchased = roundCredits(debitPurchased + extraDebit.purchasedDebited);
        }
        const totalCreditsSettled = roundCredits(debitIncluded + debitPurchased);
        const uncollectedCredits = roundCredits(
          Math.max(0, requestedCredits - totalCreditsSettled),
        );
        const uncollectedCreditsRecorded = await addUncollectedWorkspaceCredits({
          ctx,
          userId: args.userId,
          credits: uncollectedCredits,
          nowMs,
        });
        const chargedRatio = requestedCredits > 0
          ? Math.min(1, totalCreditsSettled / requestedCredits)
          : 0;
        const existingMetadata =
          reservation.metadata &&
          typeof reservation.metadata === "object" &&
          !Array.isArray(reservation.metadata)
            ? reservation.metadata
            : {};
        await ctx.db.patch(reservation._id, {
          status: "succeeded",
          creditsSettled: totalCreditsSettled,
          includedCreditsDebited: roundCredits(
            Number(reservation.includedCreditsDebited ?? 0) + extraIncludedDebited,
          ),
          purchasedCreditsDebited: roundCredits(
            Number(reservation.purchasedCreditsDebited ?? 0) + extraPurchasedDebited,
          ),
          includedCreditsRefunded: refund.includedRefunded,
          purchasedCreditsRefunded: refund.purchasedRefunded,
          rawVendorCostUsd: roundCurrency(computeCostUsd * chargedRatio),
          polynetPriceUsd: creditsToUsd(totalCreditsSettled),
          metadata: {
            ...existingMetadata,
            final_duration_seconds: roundCurrency(durationSeconds),
            measured_duration_seconds: roundCurrency(measuredDurationSeconds),
            provider_standby_grace_seconds: roundCurrency(providerStandbyGraceSeconds),
            provider_release_reason: providerReleaseReason ?? null,
            provider_release_confirmed: providerReleaseConfirmed,
            final_compute_cost_usd: computeCostUsd,
            final_credits_requested: requestedCredits,
            final_credits_settled: totalCreditsSettled,
            uncollected_credits: uncollectedCreditsRecorded,
            uncollected_reason:
              uncollectedCreditsRecorded > 0 ? "insufficient_balance_at_settlement" : null,
            extra_credits_debited: roundCredits(
              extraIncludedDebited + extraPurchasedDebited,
            ),
          },
          settledAt: nowMs,
          updatedAt: nowMs,
        });
        await recordSettledPaidToolPartnerCommission(ctx, {
          creditKey: creditReservationKey,
          userId: reservation.userId,
          purchasedCreditsSettled: debitPurchased,
          totalCreditsSettled,
          rawVendorCostUsd: roundCurrency(computeCostUsd * chargedRatio),
          nowMs,
        });
      } else if (reservation?.status === "succeeded") {
        const settledCredits = roundCredits(
          typeof reservation.creditsSettled === "number"
            ? reservation.creditsSettled
            : requestedCredits,
        );
        debitIncluded = Math.min(
          Number(reservation.includedCreditsDebited ?? 0),
          settledCredits,
        );
        debitPurchased = Math.min(
          Number(reservation.purchasedCreditsDebited ?? 0),
          Math.max(0, settledCredits - debitIncluded),
        );
        await recordSettledPaidToolPartnerCommission(ctx, {
          creditKey: creditReservationKey,
          userId: reservation.userId,
          purchasedCreditsSettled: debitPurchased,
          totalCreditsSettled: settledCredits,
          rawVendorCostUsd: reservation.rawVendorCostUsd,
          nowMs,
        });
      }
    } else {
      const directDebit = await debitAvailableWorkspaceCredits({
        ctx,
        userId: args.userId,
        credits: requestedCredits,
        nowMs,
      });
      debitIncluded = directDebit.includedDebited;
      debitPurchased = directDebit.purchasedDebited;
      await addUncollectedWorkspaceCredits({
        ctx,
        userId: args.userId,
        credits: roundCredits(Math.max(0, requestedCredits - debitIncluded - debitPurchased)),
        nowMs,
      });
    }

    const debitedCredits = roundCredits(debitIncluded + debitPurchased);
    const debitSource =
      debitedCredits <= 0
        ? "unbilled"
        : debitIncluded > 0 && debitPurchased > 0
          ? "mixed"
          : debitPurchased > 0
            ? "purchased"
            : "included";
    await recordProviderCostEntryBestEffort(ctx, {
      costKey: creditReservationKey
        ? `credit_ledger:${creditReservationKey}:provider_cost`
        : `workspace_compute_charge:${args.chargeKey}:provider_cost`,
      userId: args.userId,
      projectId: args.projectId,
      runId: args.runId,
      category: "workspace",
      component: "blaxel_active_runtime",
      provider: "blaxel",
      resourceId: args.providerSandboxId,
      periodStart: args.startedAt,
      periodEnd: providerCostPeriodEnd,
      quantityKind: "memory_gib_seconds",
      quantity: durationSeconds * args.sandboxMemoryGiB,
      rawVendorCostUsd: computeCostUsd,
      evidence: "estimated",
      billingDisposition: "rolled_into_user_usage",
      linkedCreditKey: creditReservationKey,
      metadata: {
        provider_cost_source: "workspace_compute_charge",
        duration_seconds: roundCurrency(durationSeconds),
        measured_duration_seconds: roundCurrency(measuredDurationSeconds),
        provider_standby_grace_seconds: roundCurrency(providerStandbyGraceSeconds),
        provider_release_reason: providerReleaseReason ?? null,
        provider_release_confirmed: providerReleaseConfirmed,
        sandbox_cpu: args.sandboxCpu,
        sandbox_memory_gib: args.sandboxMemoryGiB,
        sandbox_disk_gib: args.sandboxDiskGiB,
        debited_credits: debitedCredits,
        debit_source: debitSource,
      },
      nowMs,
    });

    const id = await ctx.db.insert("workspaceComputeCharges", {
      chargeKey: args.chargeKey,
      userId: args.userId,
      projectId: args.projectId,
      runId: args.runId,
      providerSandboxId: args.providerSandboxId,
      startedAt: args.startedAt,
      endedAt: args.endedAt,
      durationSeconds: roundCurrency(durationSeconds),
      sandboxCpu: args.sandboxCpu,
      sandboxMemoryGiB: args.sandboxMemoryGiB,
      sandboxDiskGiB: args.sandboxDiskGiB,
      computeCostUsd,
      creditsDebited: debitedCredits,
      creditReservationKey,
      debitSource,
      createdAt: nowMs,
    });
    return await ctx.db.get(id);
  },
});

export const reserveCreditsInternal = internalMutation({
  args: {
    creditKey: v.string(),
    userId: v.id("users"),
    communityId: v.optional(v.union(v.id("communities"), v.null())),
    projectId: v.optional(v.union(v.id("cloudProjects"), v.null())),
    runId: v.optional(v.union(v.string(), v.null())),
    toolName: v.string(),
    action: v.optional(v.union(v.string(), v.null())),
    vendor: v.optional(v.union(v.string(), v.null())),
    credits: v.number(),
    rawVendorCostUsd: v.optional(v.number()),
    polynetPriceUsd: v.optional(v.number()),
    metadata: v.optional(v.any()),
    allowUncollectedReservation: v.optional(v.boolean()),
    uncollectedReservationLimitCredits: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const creditKey = String(args.creditKey ?? "").trim();
    if (!creditKey) throw new Error("credits_key_required");
    const existing = await ctx.db
      .query("creditLedgerEntries")
      .withIndex("by_creditKey", (q) => q.eq("creditKey", creditKey))
      .first();
    if (existing) return existing;

    const requestedCredits = roundCredits(args.credits);
    if (!(requestedCredits > 0)) throw new Error("credits_amount_invalid");

    const balance = await readCanonicalWorkspaceCreditBalance(ctx, args.userId);
    const allowUncollectedReservation = args.allowUncollectedReservation === true;
    const currentOutstandingUsageCredits = readOutstandingWorkspaceUsageCreditsBalance(balance);
    if (!allowUncollectedReservation && currentOutstandingUsageCredits > 0) {
      throw new Error("credits_exhausted");
    }
    const remainingCredits = getSpendableWorkspaceToolBalanceCredits(balance);
    if (!allowUncollectedReservation && (!balance || remainingCredits < requestedCredits)) {
      throw new Error("credits_exhausted");
    }

    const debitIncluded = 0;
    const debitPurchased = Math.min(balance?.purchasedCreditsBalance ?? 0, requestedCredits);
    const debitedCredits = roundCredits(debitPurchased);
    if (!allowUncollectedReservation && debitedCredits < requestedCredits) {
      throw new Error("credits_exhausted");
    }
    if (allowUncollectedReservation) {
      const uncollectedReservationLimitCredits = roundCredits(
        Math.max(0, Number(args.uncollectedReservationLimitCredits ?? 0) || 0),
      );
      const pendingUncollectedReservationCredits =
        await readPendingCardBackedReservationExposureCredits(ctx, args.userId, nowMs);
      const uncollectedExposureCredits = roundCredits(
        Math.max(0, requestedCredits - debitedCredits),
      );
      if (
        !(uncollectedReservationLimitCredits > 0) ||
        currentOutstandingUsageCredits +
          pendingUncollectedReservationCredits +
          uncollectedExposureCredits >
          uncollectedReservationLimitCredits
      ) {
        throw new Error("credits_exhausted");
      }
    }

    if (balance && debitedCredits > 0) {
      await ctx.db.patch(balance._id, {
        purchasedCreditsBalance: roundCredits(balance.purchasedCreditsBalance - debitPurchased),
        updatedAt: nowMs,
      });
    }

    const id = await ctx.db.insert("creditLedgerEntries", {
      creditKey,
      userId: args.userId,
      communityId: args.communityId ?? undefined,
      projectId: args.projectId ?? undefined,
      runId: normalizeOptionalString(args.runId),
      toolName: String(args.toolName ?? "").trim() || "unknown",
      action: normalizeOptionalString(args.action),
      vendor: normalizeOptionalString(args.vendor),
      status: "reserved",
      creditsReserved: requestedCredits,
      includedCreditsDebited: roundCredits(debitIncluded),
      purchasedCreditsDebited: roundCredits(debitPurchased),
      includedCycleStartedAt:
        typeof balance?.includedCycleStartedAt === "number"
          ? balance.includedCycleStartedAt
          : undefined,
      includedCycleEndsAt:
        typeof balance?.includedCycleEndsAt === "number"
          ? balance.includedCycleEndsAt
          : undefined,
      rawVendorCostUsd:
        typeof args.rawVendorCostUsd === "number" ? roundCurrency(args.rawVendorCostUsd) : undefined,
      polynetPriceUsd:
        typeof args.polynetPriceUsd === "number" ? roundCurrency(args.polynetPriceUsd) : undefined,
      metadata: args.metadata,
      expiresAt:
        typeof args.expiresAt === "number" && Number.isFinite(args.expiresAt)
          ? args.expiresAt
          : nowMs + CREDIT_RESERVATION_EXPIRY_MS,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return await ctx.db.get(id);
  },
});

export const settleCreditsInternal = internalMutation({
  args: {
    creditKey: v.string(),
    status: v.union(v.literal("succeeded"), v.literal("refunded")),
    creditsSettled: v.optional(v.number()),
    failureReason: v.optional(v.union(v.string(), v.null())),
    rawVendorCostUsd: v.optional(v.number()),
    metadata: v.optional(v.any()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const creditKey = String(args.creditKey ?? "").trim();
    if (!creditKey) throw new Error("credits_key_required");
    const entry = await ctx.db
      .query("creditLedgerEntries")
      .withIndex("by_creditKey", (q) => q.eq("creditKey", creditKey))
      .first();
    if (!entry) throw new Error("credits_ledger_entry_not_found");
    if (entry.status === args.status) return entry;
    if (entry.status === "refunded" || entry.status === "succeeded") return entry;

    const requestedCreditsSettled =
      args.status === "refunded"
        ? 0
        : typeof args.creditsSettled === "number"
          ? roundCredits(Math.max(0, args.creditsSettled))
          : roundCredits(entry.creditsReserved);
    const reservedCreditsSettled = clampCredits(
      requestedCreditsSettled,
      0,
      entry.creditsReserved,
    );
    const split = splitSettledCredits({
      includedDebited: entry.includedCreditsDebited,
      purchasedDebited: entry.purchasedCreditsDebited,
      creditsSettled: reservedCreditsSettled,
    });
    const reservedCollectedCredits = roundCredits(
      split.includedSettled + split.purchasedSettled,
    );
    let extraIncludedDebited = 0;
    let extraPurchasedDebited = 0;
    if (args.status === "succeeded" && requestedCreditsSettled > reservedCreditsSettled) {
      const extraDebit = await debitAvailableWorkspaceCredits({
        ctx,
        userId: entry.userId,
        credits: requestedCreditsSettled - reservedCreditsSettled,
        nowMs,
      });
      extraIncludedDebited = extraDebit.includedDebited;
      extraPurchasedDebited = extraDebit.purchasedDebited;
    }
    const creditsSettled = roundCredits(
      reservedCollectedCredits + extraIncludedDebited + extraPurchasedDebited,
    );
    const purchasedCreditsSettled = roundCredits(split.purchasedSettled + extraPurchasedDebited);
    const uncollectedCredits = roundCredits(
      Math.max(0, requestedCreditsSettled - creditsSettled),
    );
    const settledRawVendorCostUsd =
      args.status === "succeeded" && typeof args.rawVendorCostUsd === "number"
        ? roundCurrency(args.rawVendorCostUsd)
        : args.status === "refunded"
          ? 0
          : entry.rawVendorCostUsd;
    const settledPolynetPriceUsd =
      args.status === "succeeded"
        ? creditsToUsd(creditsSettled)
        : 0;
    const balance = await readCanonicalWorkspaceCreditBalance(ctx, entry.userId);
    const refund = applySpendableCreditRefund({ split });
    const hasRefund = refund.purchasedRefunded > 0;

    if (hasRefund) {
      if (balance && refund.purchasedRefunded > 0) {
        await ctx.db.patch(balance._id, {
          purchasedCreditsBalance: roundCredits(
            balance.purchasedCreditsBalance + refund.purchasedRefunded,
          ),
          updatedAt: nowMs,
        });
      } else {
        await ctx.db.insert("workspaceCreditBalances", {
          userId: entry.userId,
          includedCreditsBalance: 0,
          purchasedCreditsBalance: refund.purchasedRefunded,
          uncollectedCreditsBalance: 0,
          pendingCardCollectionCreditsBalance: 0,
          includedCycleCredits: 0,
          includedCycleStartedAt: nowMs,
          includedCycleEndsAt: nowMs,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
      }
    }
    const uncollectedCreditsRecorded = await addUncollectedWorkspaceCredits({
      ctx,
      userId: entry.userId,
      credits: uncollectedCredits,
      nowMs,
    });
    const settlementMetadata = mergeLedgerMetadata(entry.metadata, {
      ...normalizeObjectMetadata(args.metadata),
      requested_credits_settled: requestedCreditsSettled,
      collected_credits_settled: creditsSettled,
      uncollected_credits: uncollectedCreditsRecorded,
      uncollected_reason:
        uncollectedCreditsRecorded > 0 ? "insufficient_balance_at_settlement" : null,
      collected_polynet_price_usd: settledPolynetPriceUsd,
    });

    await ctx.db.patch(entry._id, {
      status: args.status,
      creditsSettled,
      includedCreditsDebited: roundCredits(
        Number(entry.includedCreditsDebited ?? 0) + extraIncludedDebited,
      ),
      purchasedCreditsDebited: roundCredits(
        Number(entry.purchasedCreditsDebited ?? 0) + extraPurchasedDebited,
      ),
      includedCreditsRefunded: refund.includedRefunded,
      purchasedCreditsRefunded: refund.purchasedRefunded,
      failureReason: normalizeOptionalString(args.failureReason),
      rawVendorCostUsd: settledRawVendorCostUsd,
      polynetPriceUsd: settledPolynetPriceUsd,
      pendingSettlementStatus: undefined,
      pendingCreditsSettled: undefined,
      pendingRawVendorCostUsd: undefined,
      pendingSettlementMetadata: undefined,
      pendingSettlementAttempts: undefined,
      pendingSettlementNextAttemptAt: undefined,
      pendingSettlementError: undefined,
      pendingSettlementUpdatedAt: undefined,
      metadata: settlementMetadata,
      settledAt: nowMs,
      updatedAt: nowMs,
    });
    if (args.status === "succeeded") {
      const providerCostEntry = resolveCreditLedgerProviderCostEntry({
        entry,
        settlementMetadata,
        rawVendorCostUsd: settledRawVendorCostUsd,
        nowMs,
      });
      if (providerCostEntry) {
        await recordProviderCostEntryBestEffort(ctx, providerCostEntry);
      }
      await recordSettledPaidToolPartnerCommission(ctx, {
        creditKey,
        userId: entry.userId,
        purchasedCreditsSettled,
        totalCreditsSettled: creditsSettled,
        rawVendorCostUsd: settledRawVendorCostUsd,
        nowMs,
      });
      await scheduleWorkspaceAutoRechargeAfterSettlementBestEffort(ctx, entry.userId, nowMs);
    }
    return await ctx.db.get(entry._id);
  },
});

export const queueCreditSettlementRetryInternal = internalMutation({
  args: {
    creditKey: v.string(),
    status: v.literal("succeeded"),
    creditsSettled: v.optional(v.number()),
    rawVendorCostUsd: v.optional(v.number()),
    metadata: v.optional(v.any()),
    error: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const creditKey = String(args.creditKey ?? "").trim();
    if (!creditKey) throw new Error("credits_key_required");
    const entry = await ctx.db
      .query("creditLedgerEntries")
      .withIndex("by_creditKey", (q) => q.eq("creditKey", creditKey))
      .first();
    if (!entry || entry.status !== "reserved") return null;
    const attempts = Math.max(0, Math.floor(Number(entry.pendingSettlementAttempts ?? 0))) + 1;
    const retryDelayMs = Math.min(60 * 60 * 1000, attempts * attempts * 60 * 1000);
    await ctx.db.patch(entry._id, {
      pendingSettlementStatus: args.status,
      pendingCreditsSettled:
        typeof args.creditsSettled === "number"
          ? roundCredits(Math.max(0, args.creditsSettled))
          : undefined,
      pendingRawVendorCostUsd:
        typeof args.rawVendorCostUsd === "number"
          ? roundCurrency(Math.max(0, args.rawVendorCostUsd))
          : undefined,
      pendingSettlementMetadata: args.metadata,
      pendingSettlementAttempts: attempts,
      pendingSettlementNextAttemptAt: nowMs + retryDelayMs,
      pendingSettlementError: normalizeOptionalString(args.error),
      pendingSettlementUpdatedAt: nowMs,
      expiresAt: nowMs + Math.max(CREDIT_RESERVATION_EXPIRY_MS, retryDelayMs + 60 * 60 * 1000),
      updatedAt: nowMs,
    });
    return {
      queued: true,
      attempts,
      nextAttemptAt: nowMs + retryDelayMs,
    };
  },
});

export const listPendingCreditSettlementsInternal = internalQuery({
  args: {
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 25)));
    return await ctx.db
      .query("creditLedgerEntries")
      .withIndex("by_pendingSettlementStatus_nextAttemptAt", (q) =>
        q.eq("pendingSettlementStatus", "succeeded").lt("pendingSettlementNextAttemptAt", nowMs),
      )
      .take(limit);
  },
});

export const retryPendingCreditSettlementsInternal = internalAction({
  args: {
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 25)));
    const entries = await ctx.runQuery(
      (internal as any).workspaceCredits.listPendingCreditSettlementsInternal,
      { nowMs, limit },
    ) as any[];
    let settled = 0;
    let requeued = 0;
    for (const entry of entries) {
      const creditKey = String(entry.creditKey ?? "").trim();
      if (!creditKey) continue;
      try {
        await ctx.runMutation((internal as any).workspaceCredits.settleCreditsInternal, {
          creditKey,
          status: "succeeded",
          creditsSettled: entry.pendingCreditsSettled,
          rawVendorCostUsd: entry.pendingRawVendorCostUsd,
          metadata: entry.pendingSettlementMetadata,
          nowMs,
        });
        settled += 1;
      } catch (error) {
        requeued += 1;
        await ctx.runMutation((internal as any).workspaceCredits.queueCreditSettlementRetryInternal, {
          creditKey,
          status: "succeeded",
          creditsSettled: entry.pendingCreditsSettled,
          rawVendorCostUsd: entry.pendingRawVendorCostUsd,
          metadata: entry.pendingSettlementMetadata,
          error: error instanceof Error ? error.message : String(error ?? ""),
          nowMs,
        });
      }
    }
    return {
      scanned: entries.length,
      settled,
      requeued,
    };
  },
});

export const reconcileStaleRuntimeWorkspaceRunsInternal = internalAction({
  args: {
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 50)));
    const runs = await ctx.runQuery(
      (internal as any).threads.listStaleRunningRuntimeRunsInternal,
      {
        nowMs,
        limit,
      },
    ) as any[];

    let skippedNoWorkspaceEvidence = 0;
    let settledReservations = 0;
    let releasedReservations = 0;
    let requeuedSettlements = 0;
    let failedClosed = 0;
    let finalizedRuns = 0;
    let skippedRace = 0;
    const failedSamples: Array<Record<string, unknown>> = [];

    for (const run of runs) {
      const runId = normalizeOptionalString(run?.runId);
      const ownerId = run?.ownerId;
      const threadId = run?.threadId;
      if (!runId || !ownerId || !threadId) {
        skippedRace += 1;
        continue;
      }
      const reservationQueryArgs: Record<string, unknown> = {
        userId: ownerId,
        runId,
      };
      if (run?.projectId) reservationQueryArgs.projectId = run.projectId;
      const reservations = await ctx.runQuery(
        (internal as any).workspaceCredits.listReservedBlaxelRuntimeWorkspaceReservationsByRunInternal,
        reservationQueryArgs,
      ) as any[];
      if (!hasRuntimeWorkspaceEvidence(run, reservations)) {
        skippedNoWorkspaceEvidence += 1;
        continue;
      }

      let runFailedClosed = false;
      for (const reservation of reservations) {
        const creditKey = normalizeOptionalString(reservation?.creditKey);
        if (!creditKey) continue;
        const providerSandboxId = await resolveStaleRuntimeWorkspaceProviderSandboxId({
          ctx,
          run,
          reservation,
        });
        if (!providerSandboxId) {
          try {
            await ctx.runMutation((internal as any).workspaceCredits.settleCreditsInternal, {
              creditKey,
              status: "refunded",
              failureReason: "stale_runtime_workspace_run_released_before_start",
              metadata: {
                provider: "blaxel",
                settlement_source: "stale_runtime_workspace_run_reconciler",
                settlement_reason: "stale_runtime_workspace_run_released_before_start",
                stale_run_id: runId,
              },
              nowMs,
            });
            releasedReservations += 1;
          } catch (error) {
            failedClosed += 1;
            runFailedClosed = true;
            if (failedSamples.length < 5) {
              failedSamples.push({
                run_id: runId,
                credit_key: creditKey,
                error_message: error instanceof Error ? error.message : String(error ?? ""),
              });
            }
          }
          continue;
        }

        const settlement = buildStaleRuntimeWorkspaceSettlement({
          run,
          reservation,
          providerSandboxId,
          nowMs,
        });
        try {
          await ctx.runMutation((internal as any).workspaceCredits.recordWorkspaceComputeChargeInternal, {
            chargeKey: creditKey,
            userId: ownerId,
            projectId: reservation.projectId,
            runId,
            providerSandboxId,
            startedAt: settlement.startedAt,
            endedAt: settlement.endedAt,
            durationSeconds: settlement.durationSeconds,
            sandboxCpu: settlement.sandboxCpu,
            sandboxMemoryGiB: settlement.sandboxMemoryGiB,
            sandboxDiskGiB: settlement.sandboxDiskGiB,
            computeCostUsd: settlement.computeCostUsd,
            creditsDebited: settlement.creditsDebited,
            creditReservationKey: creditKey,
            nowMs,
          });
          settledReservations += 1;
        } catch (error) {
          try {
            await ctx.runMutation((internal as any).workspaceCredits.queueCreditSettlementRetryInternal, {
              creditKey,
              status: "succeeded",
              creditsSettled: settlement.creditsDebited,
              rawVendorCostUsd: settlement.computeCostUsd,
              metadata: settlement.metadata,
              error: error instanceof Error ? error.message : String(error ?? ""),
              nowMs,
            });
            requeuedSettlements += 1;
          } catch (queueError) {
            failedClosed += 1;
            runFailedClosed = true;
            if (failedSamples.length < 5) {
              failedSamples.push({
                run_id: runId,
                credit_key: creditKey,
                error_message: queueError instanceof Error
                  ? queueError.message
                  : String(queueError ?? ""),
              });
            }
          }
        }
      }

      if (runFailedClosed) continue;
      const finalized = await ctx.runMutation(
        (internal as any).threads.finalizeStaleCloudRuntimeRunInternal,
        {
          ownerId,
          threadId,
          runId,
          nowMs,
        },
      ) as any;
      if (finalized?.finalized === true) {
        finalizedRuns += 1;
      } else {
        skippedRace += 1;
      }
    }

    return {
      scanned: runs.length,
      finalizedRuns,
      settledReservations,
      releasedReservations,
      requeuedSettlements,
      skippedNoWorkspaceEvidence,
      skippedRace,
      failedClosed,
      failedSamples,
    };
  },
});

export const reconcileExpiredCreditReservationsInternal = internalMutation({
  args: {
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 50)));
    const expired = await ctx.db
      .query("creditLedgerEntries")
      .withIndex("by_status_expiresAt", (q) =>
        q.eq("status", "reserved").lt("expiresAt", nowMs),
      )
      .take(limit);
    let refunded = 0;
    let skippedBlaxelWorkspaceReservations = 0;
    for (const entry of expired) {
      if (entry.pendingSettlementStatus === "succeeded") continue;
      if (await shouldSkipExpiredBlaxelWorkspaceReservation(ctx, entry)) {
        skippedBlaxelWorkspaceReservations += 1;
        continue;
      }
      const split = splitSettledCredits({
        includedDebited: entry.includedCreditsDebited,
        purchasedDebited: entry.purchasedCreditsDebited,
        creditsSettled: 0,
      });
      const balance = await readCanonicalWorkspaceCreditBalance(ctx, entry.userId);
      const refund = applySpendableCreditRefund({ split });
      if (balance && refund.purchasedRefunded > 0) {
        await ctx.db.patch(balance._id, {
          purchasedCreditsBalance: roundCredits(
            balance.purchasedCreditsBalance + refund.purchasedRefunded,
          ),
          updatedAt: nowMs,
        });
      } else if (refund.purchasedRefunded > 0) {
        await ctx.db.insert("workspaceCreditBalances", {
          userId: entry.userId,
          includedCreditsBalance: 0,
          purchasedCreditsBalance: refund.purchasedRefunded,
          uncollectedCreditsBalance: 0,
          pendingCardCollectionCreditsBalance: 0,
          includedCycleCredits: 0,
          includedCycleStartedAt: nowMs,
          includedCycleEndsAt: nowMs,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
      }
      await ctx.db.patch(entry._id, {
        status: "refunded",
        creditsSettled: 0,
        includedCreditsRefunded: refund.includedRefunded,
        purchasedCreditsRefunded: refund.purchasedRefunded,
        failureReason: "reservation_expired",
        settledAt: nowMs,
        updatedAt: nowMs,
      });
      refunded += 1;
    }
    return {
      scanned: expired.length,
      refunded,
      skippedBlaxelProjectWorkspaceLeases: skippedBlaxelWorkspaceReservations,
      skippedBlaxelWorkspaceReservations,
    };
  },
});
