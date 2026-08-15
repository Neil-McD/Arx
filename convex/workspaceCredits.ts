import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  creditsToUsd,
  formatWorkspaceToolBalanceUsdFromCredits,
  PAID_TOOL_LEDGER_TOOL_NAMES,
  WORKSPACE_CARD_COLLECTION_STALE_PREPARED_MS,
  WORKSPACE_TOOL_BALANCE_TOPUP_CHECKOUT_TTL_MS,
} from "../shared/historicalToolCredits";
import { requireOperatorRole } from "./operatorAccess";
import {
  recordProviderCostEntry,
  type ProviderCostEntryInput,
} from "./providerCostCore";
import { PROVIDER_COST_COMPONENTS } from "../shared/providerCostAccounting";

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

export const recordProviderCostInternal = internalMutation({
  args: {
    costKey: v.string(),
    userId: v.optional(v.union(v.id("users"), v.null())),
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
        paymentIntentProcessingStaleMs:
          WORKSPACE_ACCOUNTING_PAYMENT_INTENT_PROCESSING_STALE_MS,
        usageCollectionStalePreparedMs: WORKSPACE_CARD_COLLECTION_STALE_PREPARED_MS,
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
      usageCollections: {
        policy: "active_collection_blocks_new_collection_duplicate_active_blocks_charging",
        activeUsers: activeUsageCollectionsByUser.size,
        duplicateActiveUsers: duplicateActiveUsageCollections.length,
        samples: duplicateActiveUsageCollections,
      },
    };
  },
});

function normalizeStripePaymentIntentId(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  return normalized && normalized.startsWith("pi_") ? normalized : undefined;
}

function readUncollectedCreditsBalance(balance: any): number {
  return roundCredits(Math.max(0, Number(balance?.uncollectedCreditsBalance ?? 0)));
}

function readPendingCardCollectionCreditsBalance(balance: any): number {
  return roundCredits(Math.max(0, Number(balance?.pendingCardCollectionCreditsBalance ?? 0)));
}

const DUPLICATE_WORKSPACE_CREDIT_BALANCE_ERROR = "workspace_credit_balance_duplicate";
const WORKSPACE_CREDIT_BALANCE_REPAIR_ROW_LIMIT = 25;

async function readWorkspaceCreditBalanceRowsByUser(ctx: any, userId: any, limit = 2) {
  return await ctx.db
    .query("workspaceCreditBalances")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .take(Math.max(1, Math.min(WORKSPACE_CREDIT_BALANCE_REPAIR_ROW_LIMIT, Math.floor(limit))));
}

async function readRecentWorkspaceCreditBalanceRows(ctx: any, limit: number) {
  return await ctx.db
    .query("workspaceCreditBalances")
    .withIndex("by_updatedAt")
    .order("desc")
    .take(Math.max(1, Math.min(500, Math.floor(limit))));
}

function normalizeBalanceNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function boundedLimit(value: unknown, defaultValue: number, maxValue: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.max(1, Math.min(maxValue, Math.floor(parsed)));
}

function effectiveWorkspaceCreditTopupCheckoutExpiresAt(row: any): number {
  const storedExpiresAt = normalizeBalanceNumber(row?.expiresAt);
  const createdAt = normalizeBalanceNumber(row?.createdAt);
  const boundedExpiresAt = createdAt > 0
    ? createdAt + WORKSPACE_TOOL_BALANCE_TOPUP_CHECKOUT_TTL_MS
    : 0;
  if (storedExpiresAt > 0 && boundedExpiresAt > 0) {
    return Math.min(storedExpiresAt, boundedExpiresAt);
  }
  return storedExpiresAt || boundedExpiresAt;
}
export const getWorkspaceToolBalance = query({
  args: {
    authSubject: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async () => ({
    retired: true,
    blocked: true,
    blockedReason: "workspace_tool_billing_retired",
  }),
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
