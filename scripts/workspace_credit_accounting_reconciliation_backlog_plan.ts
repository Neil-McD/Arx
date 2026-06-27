import { spawnSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Row = Record<string, any>;

const DEFAULT_TABLE_LIMIT = 10_000;
const TABLE_LIMIT = readPositiveIntegerEnv(
  "POLYNET_ACCOUNTING_RECONCILIATION_PLAN_LIMIT",
  DEFAULT_TABLE_LIMIT,
);
const TEMP_DIR = mkdtempSync(join(tmpdir(), "polynet-accounting-reconciliation-plan-"));

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
  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [];
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

function increment(bucket: Record<string, number>, key: string, amount = 1): void {
  bucket[key] = (bucket[key] ?? 0) + amount;
}

function addUsd(bucket: Record<string, number>, key: string, amount: number): void {
  bucket[key] = roundUsd((bucket[key] ?? 0) + amount);
}

function roundUsd(value: number): number {
  return Math.round(Math.max(0, value) * 1_000_000) / 1_000_000;
}

function sortedRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

function missingProviderCostMirror(args: {
  expectedCostKey: string;
  linkedCreditKey?: string | null;
  providerCostKeys: Set<string>;
  providerCostLinkedCreditKeys: Set<string>;
}): boolean {
  if (args.providerCostKeys.has(args.expectedCostKey)) return false;
  const linkedCreditKey = normalizeString(args.linkedCreditKey);
  if (linkedCreditKey && args.providerCostLinkedCreditKeys.has(linkedCreditKey)) return false;
  return true;
}

function supportedCreditLedgerProviderCostMirror(toolName: string, vendor: string): boolean {
  if (toolName === "workspace_compute" && (vendor === "blaxel" || vendor === "daytona")) {
    return true;
  }
  if (toolName === "web_research") return true;
  if (toolName === "voice_transcribe") return true;
  return false;
}

const nowMs = Date.now();
const creditLedgerEntries = readProdTable("creditLedgerEntries");
const providerCostEntries = readProdTable("providerCostEntries");
const workspaceComputeCharges = readProdTable("workspaceComputeCharges");

const providerCostKeys = new Set(
  providerCostEntries.map((row) => normalizeString(row.costKey)).filter(Boolean),
);
const providerCostLinkedCreditKeys = new Set(
  providerCostEntries.map((row) => normalizeString(row.linkedCreditKey)).filter(Boolean),
);

const uniqueMissingProviderCostKeys = new Set<string>();
const supportedProviderCostMirrorKeys = new Set<string>();
const decisionRequiredProviderCostKeys = new Set<string>();
const overlappingSourceCostKeys = new Set<string>();
const seenMissingSourceCostKeys = new Set<string>();

let supportedCreditLedgerRows = 0;
let supportedCreditLedgerUsd = 0;
let decisionCreditLedgerRows = 0;
let decisionCreditLedgerUsd = 0;
let latestSupportedCreditLedgerAt = 0;
let latestDecisionCreditLedgerAt = 0;
const supportedCreditLedgerByToolVendorAge: Record<string, number> = {};
const supportedCreditLedgerUsdByToolVendorAge: Record<string, number> = {};
const decisionCreditLedgerByToolVendorAge: Record<string, number> = {};
const decisionCreditLedgerUsdByToolVendorAge: Record<string, number> = {};

for (const row of creditLedgerEntries) {
  if (normalizeString(row.status) !== "succeeded") continue;
  const rawVendorCostUsd = numberValue(row.rawVendorCostUsd);
  if (!(rawVendorCostUsd > 0)) continue;

  const creditKey = normalizeString(row.creditKey);
  if (!creditKey) continue;
  const expectedCostKey = `credit_ledger:${creditKey}:provider_cost`;
  if (
    !missingProviderCostMirror({
      expectedCostKey,
      linkedCreditKey: creditKey,
      providerCostKeys,
      providerCostLinkedCreditKeys,
    })
  ) {
    continue;
  }

  if (seenMissingSourceCostKeys.has(expectedCostKey)) overlappingSourceCostKeys.add(expectedCostKey);
  seenMissingSourceCostKeys.add(expectedCostKey);
  uniqueMissingProviderCostKeys.add(expectedCostKey);

  const toolName = normalizeString(row.toolName) || "unknown";
  const vendor = normalizeString(row.vendor) || "unknown";
  const settledAt = timestampValue(row, ["settledAt", "updatedAt", "_creationTime"]);
  const bucketKey = `${toolName}:${vendor}:${ageBucket(settledAt, nowMs)}`;

  if (supportedCreditLedgerProviderCostMirror(toolName, vendor)) {
    supportedCreditLedgerRows += 1;
    supportedCreditLedgerUsd += rawVendorCostUsd;
    latestSupportedCreditLedgerAt = Math.max(latestSupportedCreditLedgerAt, settledAt);
    supportedProviderCostMirrorKeys.add(expectedCostKey);
    increment(supportedCreditLedgerByToolVendorAge, bucketKey);
    addUsd(supportedCreditLedgerUsdByToolVendorAge, bucketKey, rawVendorCostUsd);
  } else {
    decisionCreditLedgerRows += 1;
    decisionCreditLedgerUsd += rawVendorCostUsd;
    latestDecisionCreditLedgerAt = Math.max(latestDecisionCreditLedgerAt, settledAt);
    decisionRequiredProviderCostKeys.add(expectedCostKey);
    increment(decisionCreditLedgerByToolVendorAge, bucketKey);
    addUsd(decisionCreditLedgerUsdByToolVendorAge, bucketKey, rawVendorCostUsd);
  }
}

let supportedWorkspaceComputeRows = 0;
let supportedWorkspaceComputeUsd = 0;
let decisionWorkspaceComputeRows = 0;
let decisionWorkspaceComputeUsd = 0;
let latestSupportedWorkspaceComputeAt = 0;
let latestDecisionWorkspaceComputeAt = 0;
const supportedWorkspaceComputeByDebitSourceAge: Record<string, number> = {};
const supportedWorkspaceComputeUsdByDebitSourceAge: Record<string, number> = {};
const decisionWorkspaceComputeByDebitSourceAge: Record<string, number> = {};
const decisionWorkspaceComputeUsdByDebitSourceAge: Record<string, number> = {};

for (const row of workspaceComputeCharges) {
  const computeCostUsd = numberValue(row.computeCostUsd);
  if (!(computeCostUsd > 0)) continue;

  const chargeKey = normalizeString(row.chargeKey);
  const creditReservationKey = normalizeString(row.creditReservationKey);
  const expectedCostKey = creditReservationKey
    ? `credit_ledger:${creditReservationKey}:provider_cost`
    : `workspace_compute_charge:${chargeKey}:provider_cost`;
  if (
    !missingProviderCostMirror({
      expectedCostKey,
      linkedCreditKey: creditReservationKey || null,
      providerCostKeys,
      providerCostLinkedCreditKeys,
    })
  ) {
    continue;
  }

  if (seenMissingSourceCostKeys.has(expectedCostKey)) overlappingSourceCostKeys.add(expectedCostKey);
  seenMissingSourceCostKeys.add(expectedCostKey);
  uniqueMissingProviderCostKeys.add(expectedCostKey);

  const createdAt = timestampValue(row, ["createdAt", "_creationTime"]);
  const debitSource = normalizeString(row.debitSource) || "unknown";
  const bucketKey = `${debitSource}:hasReservation=${Boolean(creditReservationKey)}:${ageBucket(createdAt, nowMs)}`;
  const isUnbilled = debitSource === "unbilled";

  if (isUnbilled) {
    decisionWorkspaceComputeRows += 1;
    decisionWorkspaceComputeUsd += computeCostUsd;
    latestDecisionWorkspaceComputeAt = Math.max(latestDecisionWorkspaceComputeAt, createdAt);
    decisionRequiredProviderCostKeys.add(expectedCostKey);
    increment(decisionWorkspaceComputeByDebitSourceAge, bucketKey);
    addUsd(decisionWorkspaceComputeUsdByDebitSourceAge, bucketKey, computeCostUsd);
  } else {
    supportedWorkspaceComputeRows += 1;
    supportedWorkspaceComputeUsd += computeCostUsd;
    latestSupportedWorkspaceComputeAt = Math.max(latestSupportedWorkspaceComputeAt, createdAt);
    supportedProviderCostMirrorKeys.add(expectedCostKey);
    increment(supportedWorkspaceComputeByDebitSourceAge, bucketKey);
    addUsd(supportedWorkspaceComputeUsdByDebitSourceAge, bucketKey, computeCostUsd);
  }
}

const supportedUniqueProviderCostMirrorKeys = [...supportedProviderCostMirrorKeys].filter(
  (key) => !decisionRequiredProviderCostKeys.has(key),
).length;
const decisionRequiredUniqueProviderCostKeys = decisionRequiredProviderCostKeys.size;

const plan = {
  generatedAt: new Date(nowMs).toISOString(),
  source: "convex_data_prod_bounded_reconciliation_plan",
  tableLimit: TABLE_LIMIT,
  scanned: {
    creditLedgerEntries: creditLedgerEntries.length,
    providerCostEntries: providerCostEntries.length,
    workspaceComputeCharges: workspaceComputeCharges.length,
  },
  recommendation: {
    nextAction: "operator_review_before_any_provider_cost_mirror_write",
    scriptMutatesProduction: false,
    mutateCreditBalances: false,
    retroactivelyDebitUsers: false,
    onlyConsiderProviderCostMirrorWrites: true,
    requiresHumanDecisionBeforeWrite: decisionRequiredUniqueProviderCostKeys > 0,
  },
  missingProviderCostKeys: {
    uniqueTotal: uniqueMissingProviderCostKeys.size,
    supportedUniqueProviderCostMirrorKeys,
    decisionRequiredUniqueProviderCostKeys,
    overlappingSourceCostKeys: overlappingSourceCostKeys.size,
  },
  supportedProviderCostMirrorCandidates: {
    creditLedger: {
      rows: supportedCreditLedgerRows,
      rawVendorCostUsd: roundUsd(supportedCreditLedgerUsd),
      latestAt: latestSupportedCreditLedgerAt
        ? new Date(latestSupportedCreditLedgerAt).toISOString()
        : null,
      byToolVendorAge: sortedRecord(supportedCreditLedgerByToolVendorAge),
      rawVendorCostUsdByToolVendorAge: sortedRecord(supportedCreditLedgerUsdByToolVendorAge),
    },
    workspaceComputeCharges: {
      rows: supportedWorkspaceComputeRows,
      rawVendorCostUsd: roundUsd(supportedWorkspaceComputeUsd),
      latestAt: latestSupportedWorkspaceComputeAt
        ? new Date(latestSupportedWorkspaceComputeAt).toISOString()
        : null,
      byDebitSourceAge: sortedRecord(supportedWorkspaceComputeByDebitSourceAge),
      rawVendorCostUsdByDebitSourceAge:
        sortedRecord(supportedWorkspaceComputeUsdByDebitSourceAge),
    },
  },
  decisionRequired: {
    creditLedger: {
      rows: decisionCreditLedgerRows,
      rawVendorCostUsd: roundUsd(decisionCreditLedgerUsd),
      latestAt: latestDecisionCreditLedgerAt
        ? new Date(latestDecisionCreditLedgerAt).toISOString()
        : null,
      reason:
        "tool/vendor pairs do not map to the current provider-cost resolver without an explicit legacy mapping",
      byToolVendorAge: sortedRecord(decisionCreditLedgerByToolVendorAge),
      rawVendorCostUsdByToolVendorAge: sortedRecord(decisionCreditLedgerUsdByToolVendorAge),
    },
    workspaceComputeCharges: {
      rows: decisionWorkspaceComputeRows,
      rawVendorCostUsd: roundUsd(decisionWorkspaceComputeUsd),
      latestAt: latestDecisionWorkspaceComputeAt
        ? new Date(latestDecisionWorkspaceComputeAt).toISOString()
        : null,
      reason:
        "unbilled legacy compute should not be retrocharged; decide tracked_only vs historical rolled_into_user_usage mirror",
      byDebitSourceAge: sortedRecord(decisionWorkspaceComputeByDebitSourceAge),
      rawVendorCostUsdByDebitSourceAge:
        sortedRecord(decisionWorkspaceComputeUsdByDebitSourceAge),
    },
  },
};

console.log(JSON.stringify(plan, null, 2));
console.log("workspace_credit_accounting_reconciliation_backlog_plan: ok");
