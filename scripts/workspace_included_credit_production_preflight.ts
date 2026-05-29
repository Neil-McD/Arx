import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

type WorkspaceCreditBalanceRow = {
  _id?: unknown;
  userId?: unknown;
  includedCreditsBalance?: unknown;
  purchasedCreditsBalance?: unknown;
  uncollectedCreditsBalance?: unknown;
  pendingCardCollectionCreditsBalance?: unknown;
  includedCycleCredits?: unknown;
  includedCycleStartedAt?: unknown;
  includedCycleEndsAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type PreflightMode = "gate" | "plan";

function readArg(name: string, fallback: string): string {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function readMode(): PreflightMode {
  const mode = readArg("--mode", "gate").trim().toLowerCase();
  return mode === "plan" ? "plan" : "gate";
}

export function readLimit(): number {
  const raw = readArg("--limit", process.env.WORKSPACE_INCLUDED_CREDIT_AUDIT_LIMIT || "10000");
  const parsed = Math.floor(Number(raw));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50000) : 10000;
}

function normalizeNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCredits(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function previewId(value: unknown): { prefix: string; length: number } | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return {
    prefix: normalized.slice(0, 12),
    length: normalized.length,
  };
}

function parseConvexJsonArray(raw: string): WorkspaceCreditBalanceRow[] {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  const json = start >= 0 && end >= start ? trimmed.slice(start, end + 1) : trimmed;
  if (!json || /There are no documents in this table/i.test(json)) return [];
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error("convex_data_output_not_array");
  }
  return parsed as WorkspaceCreditBalanceRow[];
}

export function runConvexProductionWorkspaceCreditBalances(limit: number): WorkspaceCreditBalanceRow[] {
  let lastFailure: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = spawnSync(
      "npx",
      [
        "convex",
        "data",
        "--prod",
        "workspaceCreditBalances",
        "--format",
        "jsonArray",
        "--limit",
        String(limit),
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      },
    );

    if (result.status !== 0) {
      const message = String(result.stderr || result.stdout || "convex_data_failed").slice(0, 1000);
      throw new Error(message);
    }

    try {
      return parseConvexJsonArray(String(result.stdout ?? ""));
    } catch (error) {
      lastFailure = error;
      if (attempt >= 2) break;
    }
  }

  throw lastFailure instanceof Error ? lastFailure : new Error("convex_data_parse_failed");
}

function isCleanupCandidate(row: WorkspaceCreditBalanceRow): boolean {
  return normalizeNumber(row.includedCreditsBalance) > 0 ||
    normalizeNumber(row.includedCycleCredits) > 0;
}

export function buildProductionWorkspaceIncludedCreditPreflight(
  rows: WorkspaceCreditBalanceRow[],
  limit: number,
  mode: PreflightMode,
) {
  const candidates = rows.filter(isCleanupCandidate);
  const negativeBalanceRows = rows.filter((row) =>
    normalizeNumber(row.includedCreditsBalance) < 0 ||
    normalizeNumber(row.purchasedCreditsBalance) < 0 ||
    normalizeNumber(row.uncollectedCreditsBalance) < 0 ||
    normalizeNumber(row.pendingCardCollectionCreditsBalance) < 0
  );
  const totalPurchasedCredits = roundCredits(
    rows.reduce((sum, row) => sum + Math.max(0, normalizeNumber(row.purchasedCreditsBalance)), 0),
  );
  const totalUncollectedCredits = roundCredits(
    rows.reduce((sum, row) => sum + Math.max(0, normalizeNumber(row.uncollectedCreditsBalance)), 0),
  );
  const totalPendingCardCollectionCredits = roundCredits(
    rows.reduce((sum, row) => sum + Math.max(0, normalizeNumber(row.pendingCardCollectionCreditsBalance)), 0),
  );
  const totalLegacyIncludedCredits = roundCredits(
    candidates.reduce((sum, row) => sum + Math.max(0, normalizeNumber(row.includedCreditsBalance)), 0),
  );
  const totalLegacyIncludedCycleCredits = roundCredits(
    candidates.reduce((sum, row) => sum + Math.max(0, normalizeNumber(row.includedCycleCredits)), 0),
  );
  const truncated = rows.length >= limit;
  const blocksProduction = truncated || candidates.length > 0 || negativeBalanceRows.length > 0;

  return {
    ok: !blocksProduction,
    readOnly: true,
    dryRun: true,
    writePathAvailable: false,
    writeCommand: null,
    explicitAcceptanceRequired: false,
    mode,
    releaseGate: {
      blocksProduction,
      exitCodeWhenRunAsGate: blocksProduction ? 1 : 0,
      reason: truncated
        ? "production_workspace_credit_balance_scan_truncated_increase_limit_before_release"
        : negativeBalanceRows.length > 0
          ? "negative_workspace_credit_balance_rows_require_manual_review"
          : candidates.length > 0
            ? "legacy_included_workspace_credit_fields_must_be_cleared"
            : "no_legacy_included_workspace_credit_fields_detected",
    },
    summary: {
      scannedRows: rows.length,
      truncated,
      cleanupCandidateRows: candidates.length,
      negativeBalanceRows: negativeBalanceRows.length,
      totalPurchasedCredits,
      totalPurchasedUsd: roundCredits(totalPurchasedCredits) / 100,
      totalUncollectedCredits,
      totalUncollectedUsd: roundCredits(totalUncollectedCredits) / 100,
      totalPendingCardCollectionCredits,
      totalPendingCardCollectionUsd: roundCredits(totalPendingCardCollectionCredits) / 100,
      totalLegacyIncludedCredits,
      totalLegacyIncludedUsd: roundCredits(totalLegacyIncludedCredits) / 100,
      totalLegacyIncludedCycleCredits,
      totalLegacyIncludedCycleUsd: roundCredits(totalLegacyIncludedCycleCredits) / 100,
    },
    diagnostic: {
      invariant:
        "workspace tool balance is purchased credits plus card-backed usage; legacy included-credit fields must stay zero",
      requiredReview: candidates.length > 0
        ? "legacy included-credit fields are nonzero and must be reviewed before release"
        : "none",
      authoritativeBalanceFields: [
        "purchasedCreditsBalance",
        "uncollectedCreditsBalance",
        "pendingCardCollectionCreditsBalance",
      ],
      candidateSamples: candidates.slice(0, 10).map((row) => ({
        balanceId: previewId(row._id),
        userId: previewId(row.userId),
        includedCreditsBalance: roundCredits(normalizeNumber(row.includedCreditsBalance)),
        includedCycleCredits: roundCredits(normalizeNumber(row.includedCycleCredits)),
        purchasedCreditsBalance: roundCredits(normalizeNumber(row.purchasedCreditsBalance)),
        uncollectedCreditsBalance: roundCredits(normalizeNumber(row.uncollectedCreditsBalance)),
        pendingCardCollectionCreditsBalance: roundCredits(
          normalizeNumber(row.pendingCardCollectionCreditsBalance),
        ),
        updatedAt: normalizeNumber(row.updatedAt),
      })),
    },
  };
}

function main() {
  const mode = readMode();
  const limit = readLimit();
  const rows = runConvexProductionWorkspaceCreditBalances(limit);
  const preflight = buildProductionWorkspaceIncludedCreditPreflight(rows, limit, mode);
  console.log(JSON.stringify(preflight, null, 2));
  if (mode === "gate" && preflight.releaseGate.blocksProduction) {
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entrypoint === import.meta.url) {
  main();
}
