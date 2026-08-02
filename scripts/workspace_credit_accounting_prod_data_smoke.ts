import { spawnSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Row = Record<string, any>;

const DEFAULT_TABLE_LIMIT = 10_000;
const DEFAULT_RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

const TABLE_LIMIT = readPositiveIntegerEnv(
  "POLYNET_ACCOUNTING_PROD_DATA_SMOKE_LIMIT",
  DEFAULT_TABLE_LIMIT,
);
const RECENT_WINDOW_MS = readPositiveIntegerEnv(
  "POLYNET_ACCOUNTING_PROD_DATA_SMOKE_RECENT_MS",
  DEFAULT_RECENT_WINDOW_MS,
);

const PAID_TOOL_LEDGER_TOOL_NAMES = new Set([
  "workspace_compute",
  "web_research",
  "voice_transcribe",
]);
const TEMP_DIR = mkdtempSync(join(tmpdir(), "polynet-accounting-prod-data-smoke-"));

process.on("exit", () => {
  rmSync(TEMP_DIR, { recursive: true, force: true });
});

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? "");
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.max(1, Math.floor(raw));
}

function readProdTable(tableName: string): Row[] {
  const outputPath = join(TEMP_DIR, `${tableName}.json`);
  const stdoutFd = openSync(outputPath, "w");
  const result = spawnSync(
    "npx",
    [
      "convex",
      "data",
      "--prod",
      tableName,
      "--format",
      "jsonArray",
      "--limit",
      String(TABLE_LIMIT),
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      stdio: ["ignore", stdoutFd, "pipe"],
    },
  );
  closeSync(stdoutFd);

  if (result.status !== 0) {
    process.stderr.write(String(result.stderr ?? ""));
    process.exit(result.status ?? 1);
  }

  const output = readFileSync(outputPath, "utf8").trim();
  if (!output || output.startsWith("There are no documents")) return [];

  try {
    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    throw new Error(
      `Failed to parse Convex data output for ${tableName}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

function numberValue(value: unknown): number {
  const normalized = Number(value ?? 0);
  return Number.isFinite(normalized) ? normalized : 0;
}

function timestampValue(row: Row, fields: string[]): number {
  for (const field of fields) {
    const timestamp = numberValue(row[field]);
    if (timestamp > 0) return timestamp;
  }
  return 0;
}

function ageBucket(timestamp: number, nowMs: number): string {
  const ageMs = nowMs - timestamp;
  if (!(ageMs >= 0)) return "unknown_or_future";
  if (ageMs <= 24 * 60 * 60 * 1000) return "<=1d";
  if (ageMs <= 7 * 24 * 60 * 60 * 1000) return "<=7d";
  if (ageMs <= 31 * 24 * 60 * 60 * 1000) return "<=31d";
  return ">31d";
}

function isRecent(timestamp: number, nowMs: number): boolean {
  return timestamp > 0 && nowMs - timestamp <= RECENT_WINDOW_MS;
}

function increment(bucket: Record<string, number>, key: string, amount = 1): void {
  bucket[key] = (bucket[key] ?? 0) + amount;
}

function roundUsd(value: number): number {
  return Math.round(Math.max(0, value) * 1_000_000) / 1_000_000;
}

function sortedRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

const nowMs = Date.now();

const workspaceCreditBalances = readProdTable("workspaceCreditBalances");
const creditLedgerEntries = readProdTable("creditLedgerEntries");
const providerCostEntries = readProdTable("providerCostEntries");
const workspaceComputeCharges = readProdTable("workspaceComputeCharges");
const checkoutSessions = readProdTable("checkoutSessions");
const workspaceUsageCollections = readProdTable("workspaceUsageCollections");

const balanceRowsByUser = new Map<string, number>();
let negativeBalanceRows = 0;
let uncollectedBalanceRows = 0;
let pendingCardCollectionBalanceRows = 0;

for (const row of workspaceCreditBalances) {
  const userId = normalizeString(row.userId);
  if (userId) balanceRowsByUser.set(userId, (balanceRowsByUser.get(userId) ?? 0) + 1);
  if (
    [
      "includedCreditsBalance",
      "purchasedCreditsBalance",
      "uncollectedCreditsBalance",
      "pendingCardCollectionCreditsBalance",
    ].some((field) => numberValue(row[field]) < 0)
  ) {
    negativeBalanceRows += 1;
  }
  if (numberValue(row.uncollectedCreditsBalance) > 0) uncollectedBalanceRows += 1;
  if (numberValue(row.pendingCardCollectionCreditsBalance) > 0) {
    pendingCardCollectionBalanceRows += 1;
  }
}

const duplicateBalanceUsers = [...balanceRowsByUser.values()].filter((count) => count > 1).length;
const providerCostKeys = new Set(
  providerCostEntries.map((row) => normalizeString(row.costKey)).filter(Boolean),
);
const providerCostLinkedCreditKeys = new Set(
  providerCostEntries.map((row) => normalizeString(row.linkedCreditKey)).filter(Boolean),
);

let staleReservations = 0;
let reservedWithoutExpiryRows = 0;
let duePendingSettlements = 0;
let priceDriftRows = 0;
let succeededPaidLedgerRows = 0;
let providerCostMirrorGaps = 0;
let recentProviderCostMirrorGaps = 0;
let providerCostMirrorGapUsd = 0;
let latestProviderCostMirrorGapAt = 0;
const providerCostMirrorGapsByAge: Record<string, number> = {};
const providerCostMirrorGapsByToolVendorAge: Record<string, number> = {};

let daytonaLedgerRows = 0;
let daytonaProviderCostRows = 0;
let daytonaPositiveCostSucceededRows = 0;
let daytonaProviderCostMirrorGaps = 0;
let recentDaytonaProviderCostMirrorGaps = 0;
let latestDaytonaLedgerAt = 0;
const daytonaLedgerByStatus: Record<string, number> = {};

for (const providerCost of providerCostEntries) {
  if (
    normalizeString(providerCost.provider) === "daytona" ||
    normalizeString(providerCost.component) === "daytona_codex_runtime_active"
  ) {
    daytonaProviderCostRows += 1;
  }
}

for (const row of creditLedgerEntries) {
  const status = normalizeString(row.status) || "unknown";
  const toolName = normalizeString(row.toolName);
  const vendor = normalizeString(row.vendor) || "unknown";
  const creditKey = normalizeString(row.creditKey);
  const settledAt = timestampValue(row, ["settledAt", "updatedAt", "_creationTime"]);
  const expiresAt = numberValue(row.expiresAt);
  const isDaytona =
    vendor === "daytona" || creditKey.startsWith("workspace_compute:daytona:");
  const rawVendorCostUsd = numberValue(row.rawVendorCostUsd);

  if (isDaytona) {
    daytonaLedgerRows += 1;
    latestDaytonaLedgerAt = Math.max(latestDaytonaLedgerAt, settledAt);
    increment(daytonaLedgerByStatus, status);
  }

  if (status === "reserved") {
    if (expiresAt > 0 && expiresAt <= nowMs) staleReservations += 1;
    if (!(expiresAt > 0)) reservedWithoutExpiryRows += 1;
  }
  if (
    normalizeString(row.pendingSettlementStatus) === "succeeded" &&
    numberValue(row.pendingSettlementNextAttemptAt) <= nowMs
  ) {
    duePendingSettlements += 1;
  }

  if (isDaytona && status === "succeeded" && rawVendorCostUsd > 0) {
    daytonaPositiveCostSucceededRows += 1;
    const expectedProviderCostKey = `credit_ledger:${creditKey}:provider_cost`;
    const hasProviderCostMirror =
      providerCostKeys.has(expectedProviderCostKey) ||
      providerCostLinkedCreditKeys.has(creditKey);
    if (!hasProviderCostMirror) {
      daytonaProviderCostMirrorGaps += 1;
      if (isRecent(settledAt, nowMs)) recentDaytonaProviderCostMirrorGaps += 1;
    }
  }

  if (status !== "succeeded" || !PAID_TOOL_LEDGER_TOOL_NAMES.has(toolName)) continue;

  const creditsSettled = numberValue(row.creditsSettled);
  const polynetPriceUsd = numberValue(row.polynetPriceUsd);
  if (creditsSettled > 0 && Math.abs(polynetPriceUsd - creditsSettled / 100) > 0.0001) {
    priceDriftRows += 1;
  }

  if (!(rawVendorCostUsd > 0)) continue;

  succeededPaidLedgerRows += 1;
  const expectedProviderCostKey = `credit_ledger:${creditKey}:provider_cost`;
  const hasProviderCostMirror =
    providerCostKeys.has(expectedProviderCostKey) || providerCostLinkedCreditKeys.has(creditKey);
  if (hasProviderCostMirror) continue;

  providerCostMirrorGaps += 1;
  providerCostMirrorGapUsd += rawVendorCostUsd;
  latestProviderCostMirrorGapAt = Math.max(latestProviderCostMirrorGapAt, settledAt);
  const bucket = ageBucket(settledAt, nowMs);
  increment(providerCostMirrorGapsByAge, bucket);
  increment(providerCostMirrorGapsByToolVendorAge, `${toolName}:${vendor}:${bucket}`);
  if (isRecent(settledAt, nowMs)) recentProviderCostMirrorGaps += 1;
}

let unbilledComputeCharges = 0;
let recentUnbilledComputeCharges = 0;
let computeMissingProviderCostMirrors = 0;
let recentComputeMissingProviderCostMirrors = 0;
let latestComputeBacklogAt = 0;
const unbilledComputeChargesByAge: Record<string, number> = {};
const computeMissingProviderCostMirrorsByDebitSourceAge: Record<string, number> = {};

for (const row of workspaceComputeCharges) {
  const createdAt = timestampValue(row, ["createdAt", "_creationTime"]);
  const debitSource = normalizeString(row.debitSource) || "unknown";
  const isUnbilled = debitSource === "unbilled";
  if (isUnbilled) {
    unbilledComputeCharges += 1;
    latestComputeBacklogAt = Math.max(latestComputeBacklogAt, createdAt);
    increment(unbilledComputeChargesByAge, ageBucket(createdAt, nowMs));
    if (isRecent(createdAt, nowMs)) recentUnbilledComputeCharges += 1;
  }

  if (!(numberValue(row.computeCostUsd) > 0)) continue;
  const chargeKey = normalizeString(row.chargeKey);
  const creditReservationKey = normalizeString(row.creditReservationKey);
  const expectedProviderCostKey = creditReservationKey
    ? `credit_ledger:${creditReservationKey}:provider_cost`
    : `workspace_compute_charge:${chargeKey}:provider_cost`;
  const hasProviderCostMirror =
    providerCostKeys.has(expectedProviderCostKey) ||
    (creditReservationKey && providerCostLinkedCreditKeys.has(creditReservationKey));
  if (hasProviderCostMirror) continue;

  computeMissingProviderCostMirrors += 1;
  latestComputeBacklogAt = Math.max(latestComputeBacklogAt, createdAt);
  increment(computeMissingProviderCostMirrorsByDebitSourceAge, `${debitSource}:${ageBucket(createdAt, nowMs)}`);
  if (isRecent(createdAt, nowMs)) recentComputeMissingProviderCostMirrors += 1;
}

const staleTopupCheckouts = checkoutSessions.filter((row) =>
  normalizeString(row.mode) === "workspace_credit_topup" &&
  normalizeString(row.status) === "pending" &&
  numberValue(row.expiresAt) <= nowMs,
).length;

const activeUsageCollections = workspaceUsageCollections.filter((row) =>
  ["prepared", "processing"].includes(normalizeString(row.status)),
).length;
const stalePreparedUsageCollections = workspaceUsageCollections.filter((row) =>
  normalizeString(row.status) === "prepared" &&
  nowMs - timestampValue(row, ["updatedAt", "createdAt", "_creationTime"]) > 15 * 60 * 1000,
).length;
const failedUsageCollections = workspaceUsageCollections.filter((row) =>
  normalizeString(row.status) === "failed",
).length;

const critical = {
  duplicateBalanceUsers,
  negativeBalanceRows,
  staleReservations,
  duePendingSettlements,
  priceDriftRows,
  recentProviderCostMirrorGaps,
  recentUnbilledComputeCharges,
  recentComputeMissingProviderCostMirrors,
};
const criticalTotal = Object.values(critical).reduce((sum, value) => sum + value, 0);

const summary = {
  generatedAt: new Date(nowMs).toISOString(),
  source: "convex_data_prod_bounded_aggregate",
  tableLimit: TABLE_LIMIT,
  recentWindowMs: RECENT_WINDOW_MS,
  scanned: {
    workspaceCreditBalances: workspaceCreditBalances.length,
    creditLedgerEntries: creditLedgerEntries.length,
    providerCostEntries: providerCostEntries.length,
    workspaceComputeCharges: workspaceComputeCharges.length,
    checkoutSessions: checkoutSessions.length,
    workspaceUsageCollections: workspaceUsageCollections.length,
  },
  critical,
  currentRuntime: {
    daytonaLedgerRows,
    daytonaLedgerByStatus: sortedRecord(daytonaLedgerByStatus),
    daytonaProviderCostRows,
    daytonaPositiveCostSucceededRows,
    daytonaProviderCostMirrorGaps,
    recentDaytonaProviderCostMirrorGaps,
    latestDaytonaLedgerAt: latestDaytonaLedgerAt
      ? new Date(latestDaytonaLedgerAt).toISOString()
      : null,
  },
  reconciliationBacklog: {
    providerCostMirrorGaps,
    providerCostMirrorGapUsd: roundUsd(providerCostMirrorGapUsd),
    latestProviderCostMirrorGapAt: latestProviderCostMirrorGapAt
      ? new Date(latestProviderCostMirrorGapAt).toISOString()
      : null,
    providerCostMirrorGapsByAge: sortedRecord(providerCostMirrorGapsByAge),
    providerCostMirrorGapsByToolVendorAge: sortedRecord(providerCostMirrorGapsByToolVendorAge),
    unbilledComputeCharges,
    computeMissingProviderCostMirrors,
    latestComputeBacklogAt: latestComputeBacklogAt
      ? new Date(latestComputeBacklogAt).toISOString()
      : null,
    unbilledComputeChargesByAge: sortedRecord(unbilledComputeChargesByAge),
    computeMissingProviderCostMirrorsByDebitSourceAge:
      sortedRecord(computeMissingProviderCostMirrorsByDebitSourceAge),
  },
  watch: {
    uncollectedBalanceRows,
    pendingCardCollectionBalanceRows,
    reservedWithoutExpiryRows,
    staleTopupCheckouts,
    activeUsageCollections,
    stalePreparedUsageCollections,
    failedUsageCollections,
    succeededPaidLedgerRows,
  },
  health: criticalTotal === 0 ? "pass" : "fail",
};

console.log(JSON.stringify(summary, null, 2));

if (criticalTotal > 0) {
  throw new Error(`workspace_credit_accounting_prod_data_smoke_failed:${JSON.stringify(critical)}`);
}

console.log("workspace_credit_accounting_prod_data_smoke: ok");
