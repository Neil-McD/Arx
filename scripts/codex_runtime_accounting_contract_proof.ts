import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

function assertContains(haystack: string, needle: string, label: string): void {
  assert.ok(haystack.includes(needle), `expected ${label}`);
}

function assertOrdered(
  haystack: string,
  first: string,
  second: string,
  label: string,
): void {
  const firstIndex = haystack.indexOf(first);
  const secondIndex = haystack.indexOf(second);
  assert.notEqual(firstIndex, -1, `expected ${label} first marker`);
  assert.notEqual(secondIndex, -1, `expected ${label} second marker`);
  assert.ok(firstIndex < secondIndex, `expected ${label}`);
}

const packageJson = read("package.json");
const accounting = read("convex/polynetCodexRuntimeAccounting.ts");
const handler = read("convex/runtimeTurnHandlers.ts");
const ingest = read("convex/polynetCodexWorkerIngest.ts");
const workspaceCredits = read("shared/workspaceCredits.ts");
const workspaceCreditSettlement = read("convex/workspaceCreditSettlement.ts");
const workspaceCreditsConvex = read("convex/workspaceCredits.ts");

assertContains(
  packageJson,
  '"check:codex-runtime-accounting-contract-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts/codex_runtime_accounting_contract_proof.ts"',
  "package script for Codex runtime accounting contract proof",
);

assertContains(
  workspaceCredits,
  "DAYTONA_WORKSPACE_COMPUTE_USD_PER_SECOND = 0.0082 / 3600",
  "Daytona workspace compute pricing constant",
);
assertContains(
  workspaceCredits,
  "priceDaytonaWorkspaceComputeCredits",
  "Daytona workspace compute credit pricing function",
);

assertContains(
  accounting,
  "reservePaidToolCredits",
  "Codex runtime accounting reserves through canonical paid tool reservation",
);
assertContains(
  accounting,
  'toolKind: "workspace_tools"',
  "Codex runtime accounting uses workspace tools kind",
);
assertContains(
  accounting,
  'toolName: "workspace_compute"',
  "Codex runtime accounting uses workspace compute ledger tool",
);
assertContains(
  accounting,
  'action: "codex_runtime_turn"',
  "Codex runtime accounting declares Codex runtime turn action",
);
assertContains(
  accounting,
  'vendor: "daytona"',
  "Codex runtime accounting records Daytona vendor",
);
assertContains(
  accounting,
  "WORKSPACE_SESSION_HOLD_SECONDS",
  "Codex runtime accounting reserves a bounded workspace hold",
);
assertContains(
  accounting,
  "WORKSPACE_SESSION_RESERVATION_EXPIRY_MS",
  "Codex runtime accounting expires stale reservations",
);
assertContains(
  accounting,
  "estimateDaytonaWorkspaceComputeVendorCostUsd",
  "Codex runtime accounting records estimated Daytona vendor cost",
);
assertContains(
  accounting,
  "priceDaytonaWorkspaceComputeCredits",
  "Codex runtime accounting prices Daytona runtime seconds into workspace credits",
);
assertContains(
  accounting,
  "settleReservedCreditsStrict",
  "Codex runtime accounting strictly settles succeeded compute usage",
);
assertContains(
  accounting,
  "settleReservedCreditsBestEffort",
  "Codex runtime accounting best-effort refunds not-started compute usage",
);
assertContains(
  accounting,
  "worker_timing_buckets_codex_turn_total_ms",
  "Codex runtime accounting falls back to Codex turn timing bucket",
);
assertContains(
  accounting,
  'status: "refunded"',
  "Codex runtime accounting can refund unused reservations before worker start",
);

assertContains(
  handler,
  "reservePolynetCodexRuntimeWorkspaceCompute",
  "runtime handler reserves workspace compute for Codex runtime",
);
assertContains(
  handler,
  "polynet_codex_runtime_workspace_compute_reserved",
  "runtime handler records workspace compute reservation evidence",
);
assertContains(
  handler,
  "buildPolynetCodexRuntimeWorkspaceComputeBillingContext",
  "runtime handler sends billing context to worker ingest",
);
assertContains(
  handler,
  "workspace_compute_billing",
  "runtime handler includes workspace compute billing context",
);
assertContains(
  handler,
  "refundPolynetCodexRuntimeWorkspaceComputeBestEffort",
  "runtime handler refunds pre-worker Daytona target failures",
);
assertContains(
  handler,
  "settlePolynetCodexRuntimeWorkspaceComputeBestEffort",
  "runtime handler settles or refunds after worker stream terminal result",
);
assertOrdered(
  handler,
  "await reservePolynetCodexRuntimeWorkspaceCompute({",
  "ensureDaytonaCodexRuntimeTargetInternal",
  "workspace compute reservation must happen before Daytona target creation",
);
assertOrdered(
  handler,
  "workerResult = await streamPolynetCodexWorkerTurn({",
  "await settlePolynetCodexRuntimeWorkspaceComputeBestEffort({",
  "worker stream must finish before local workspace compute settlement",
);
assertContains(
  handler,
  "workerTurnStartedAtMs",
  "runtime handler tracks worker start fallback duration",
);
assertContains(
  handler,
  "Math.max(1, Date.now() - workerTurnStartedAtMs)",
  "started worker paths must settle a positive bounded fallback duration",
);
assertContains(
  handler,
  "polynet_codex_runtime_workspace_compute_settled",
  "runtime handler records workspace compute settlement evidence",
);

assertContains(
  ingest,
  "workspace_compute_billing",
  "worker ingest reads workspace compute billing context",
);
assertContains(
  ingest,
  "codex_runtime_billing",
  "worker ingest preserves legacy Codex runtime billing context fallback",
);
assertContains(
  ingest,
  "readWorkerTimingDuration",
  "worker ingest normalizes timing duration",
);
assertContains(
  ingest,
  "worker_ingest_timing_buckets_codex_turn_total_ms",
  "worker ingest falls back to Codex timing bucket",
);
assertContains(
  ingest,
  "worker_ingest_started_without_timing",
  "worker ingest settles a minimal bounded duration when terminal evidence lacks timing",
);
assertContains(
  ingest,
  "settleReservedCreditsStrict",
  "worker ingest keeps strict settlement backstop",
);
assertContains(
  workspaceCreditSettlement,
  "queueCreditSettlementRetryInternal",
  "strict succeeded settlements queue retry evidence instead of silently dropping charges",
);
assertContains(
  workspaceCreditsConvex,
  'if (entry.status === args.status) return entry;',
  "credit settlement is idempotent when the same terminal path retries",
);
assertContains(
  workspaceCreditsConvex,
  'if (entry.status === "refunded" || entry.status === "succeeded") return entry;',
  "credit settlement is terminal and prevents double-settle or double-refund races",
);
assertContains(
  workspaceCreditsConvex,
  'if (!entry || entry.status !== "reserved") return null;',
  "settlement retry queue only keeps active reserved entries",
);

console.log("codex_runtime_accounting_contract_proof: ok");
