import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { resolveCanonicalAccountEntitlementFromRows } from "./accountEntitlementCore";

const MAX_ROWS = 500;

function readDeploymentKind(): string {
  try {
    return String((globalThis as any)?.process?.env?.POLYNET_DEPLOYMENT_KIND ?? "").trim();
  } catch {
    return "";
  }
}

function requireStaging(): void {
  if (readDeploymentKind() !== "staging") {
    throw new Error("account_entitlement_migration_staging_only");
  }
}

function newestFirst(a: any, b: any): number {
  return (
    Number(b.startsAt ?? 0) - Number(a.startsAt ?? 0) ||
    Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0) ||
    String(b._id).localeCompare(String(a._id))
  );
}

function legacyTierAt(rows: any[], atMs: number): "free" | "architect" {
  const active = rows
    .filter((row) => {
      const startsAt = Number(row.startsAt);
      if (!Number.isFinite(startsAt) || startsAt > atMs) return false;
      return !(typeof row.endsAt === "number" && atMs > row.endsAt);
    })
    .sort(newestFirst);
  return String(active[0]?.tier ?? "").trim().toLowerCase() === "architect"
    ? "architect"
    : "free";
}

function countTiers(values: Array<"free" | "architect">) {
  return {
    free: values.filter((value) => value === "free").length,
    architect: values.filter((value) => value === "architect").length,
  };
}

async function inspectEntitlements(ctx: any, nowMs: number) {
  const rows = await ctx.db.query("userEntitlements").take(MAX_ROWS + 1);
  if (rows.length > MAX_ROWS) throw new Error("account_entitlement_migration_scan_limit_exceeded");

  const byUser = new Map<string, any[]>();
  const byUserSource = new Map<string, any[]>();
  for (const row of rows) {
    const userKey = String(row.userId);
    const userRows = byUser.get(userKey) ?? [];
    userRows.push(row);
    byUser.set(userKey, userRows);
    const sourceKey = `${userKey}:${String(row.source)}`;
    const sourceRows = byUserSource.get(sourceKey) ?? [];
    sourceRows.push(row);
    byUserSource.set(sourceKey, sourceRows);
  }

  const targetByUser = new Map<string, any[]>();
  const keepIds = new Set<string>();
  for (const [userKey, userRows] of byUser) {
    const adminRows = userRows
      .filter((row) => row.source === "admin_override")
      .sort(newestFirst);
    const selected = adminRows[0] ?? null;
    const targetRows = selected ? [selected] : [];
    targetByUser.set(userKey, targetRows);
    if (selected) keepIds.add(String(selected._id));
  }

  const checkpoints = new Set<number>([nowMs]);
  for (const row of rows) {
    for (const raw of [row.startsAt, row.endsAt]) {
      const value = Number(raw);
      if (!Number.isFinite(value) || value < nowMs) continue;
      checkpoints.add(Math.max(nowMs, value - 1));
      checkpoints.add(value);
      checkpoints.add(value + 1);
    }
  }

  let parityMismatchUsers = 0;
  let futureParityMismatches = 0;
  const currentLegacyTiers: Array<"free" | "architect"> = [];
  const currentTargetTiers: Array<"free" | "architect"> = [];
  for (const [userKey, userRows] of byUser) {
    const targetRows = targetByUser.get(userKey) ?? [];
    const legacyCurrent = legacyTierAt(userRows, nowMs);
    const targetCurrent = resolveCanonicalAccountEntitlementFromRows(
      targetRows,
      nowMs,
    ).canonicalTier;
    currentLegacyTiers.push(legacyCurrent);
    currentTargetTiers.push(targetCurrent);
    if (legacyCurrent !== targetCurrent) parityMismatchUsers += 1;
    for (const checkpoint of checkpoints) {
      if (
        legacyTierAt(userRows, checkpoint) !==
        resolveCanonicalAccountEntitlementFromRows(targetRows, checkpoint).canonicalTier
      ) {
        futureParityMismatches += 1;
      }
    }
  }

  const sourceCounts = {
    default: rows.filter((row: any) => row.source === "default").length,
    adminOverride: rows.filter((row: any) => row.source === "admin_override").length,
    manualGrant: rows.filter((row: any) => row.source === "manual_grant").length,
    premiumSubscription: rows.filter((row: any) => row.source === "premium_subscription").length,
    unsupported: rows.filter(
      (row: any) =>
        row.source !== "default" &&
        row.source !== "admin_override" &&
        row.source !== "manual_grant" &&
        row.source !== "premium_subscription",
    ).length,
  };
  const pairSizes = [...byUserSource.values()].map((pairRows) => pairRows.length);
  const legacyCounts = countTiers(currentLegacyTiers);
  const targetCounts = countTiers(currentTargetTiers);
  const deleteIds = rows
    .filter((row: any) => !keepIds.has(String(row._id)))
    .map((row: any) => row._id);
  return {
    summary: {
      rowCount: rows.length,
      userCount: byUser.size,
      targetRowCount: keepIds.size,
      deleteRowCount: deleteIds.length,
      duplicateUserSourcePairs: pairSizes.filter((size) => size > 1).length,
      maxRowsPerUserSource: pairSizes.length ? Math.max(...pairSizes) : 0,
      sourceCounts,
      legacyTierCounts: legacyCounts,
      targetTierCounts: targetCounts,
      parityMismatchUsers,
      futureParityMismatches,
      checkpointCount: checkpoints.size,
      outputContainsIdentifiers: false,
    },
    deleteIds,
  };
}

export const auditAccountEntitlementNormalizationInternal = internalQuery({
  args: { nowMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    requireStaging();
    return (await inspectEntitlements(ctx, args.nowMs ?? Date.now())).summary;
  },
});

export const normalizeAccountEntitlementsInternal = internalMutation({
  args: {
    nowMs: v.number(),
    dryRun: v.boolean(),
    expectedRowCount: v.number(),
    expectedDeleteRowCount: v.number(),
    expectedTargetFreeCount: v.number(),
    expectedTargetArchitectCount: v.number(),
  },
  handler: async (ctx, args) => {
    requireStaging();
    const inspection = await inspectEntitlements(ctx, args.nowMs);
    const summary = inspection.summary;
    if (
      summary.rowCount !== args.expectedRowCount ||
      summary.deleteRowCount !== args.expectedDeleteRowCount ||
      summary.targetTierCounts.free !== args.expectedTargetFreeCount ||
      summary.targetTierCounts.architect !== args.expectedTargetArchitectCount
    ) {
      throw new Error("account_entitlement_migration_expectation_changed");
    }
    if (
      summary.sourceCounts.manualGrant !== 0 ||
      summary.sourceCounts.premiumSubscription !== 0 ||
      summary.sourceCounts.unsupported !== 0
    ) {
      throw new Error("account_entitlement_migration_source_blocked");
    }
    if (summary.parityMismatchUsers !== 0 || summary.futureParityMismatches !== 0) {
      throw new Error("account_entitlement_migration_parity_blocked");
    }
    if (args.dryRun) return { ...summary, dryRun: true, deletedRowCount: 0 };
    for (const rowId of inspection.deleteIds) await ctx.db.delete(rowId);
    return {
      ...summary,
      dryRun: false,
      deletedRowCount: inspection.deleteIds.length,
    };
  },
});
