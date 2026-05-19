import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const authSubject =
  process.env.POLYNET_OPERATOR_AUTH_SUBJECT ??
  process.env.OPERATOR_AUTH_SUBJECT ??
  "";

if (!authSubject.trim()) {
  throw new Error(
    "Missing POLYNET_OPERATOR_AUTH_SUBJECT or OPERATOR_AUTH_SUBJECT. This smoke is read-only but must run as an operator.",
  );
}

function runConvexQuery(functionName: string, args: Record<string, unknown>) {
  const result = spawnSync(
    "npx",
    [
      "convex",
      "run",
      "--prod",
      "--typecheck",
      "disable",
      "--codegen",
      "disable",
      functionName,
      JSON.stringify(args),
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }

  const output = result.stdout.trim();
  const firstBrace = output.indexOf("{");
  assert.ok(firstBrace >= 0, `expected ${functionName} output to include JSON`);
  return JSON.parse(output.slice(firstBrace));
}

const limit = Number(process.env.POLYNET_ACCOUNTING_SMOKE_LIMIT ?? 50);
const workspaceDiagnostics = runConvexQuery(
  "workspaceCredits:getWorkspaceToolCreditDiagnosticsForOperator",
  {
    authSubject,
    limit,
  },
);
const toolEconomics = runConvexQuery("operatorDashboard:getOperatorToolEconomics", {
  authSubject,
  range: process.env.POLYNET_ACCOUNTING_SMOKE_RANGE ?? "30d",
});

const duplicateRows = Number(workspaceDiagnostics?.balances?.duplicateRows ?? 0);
const negativeBalanceRows = Number(workspaceDiagnostics?.balances?.negativeBalanceRows ?? 0);
const pendingSettlementsDue = Number(workspaceDiagnostics?.pendingSettlements?.dueRows ?? 0);
const staleTopups = Number(workspaceDiagnostics?.staleTopupCheckouts?.staleRowsInScan ?? 0);
const uncollectedRows = Number(workspaceDiagnostics?.uncollectedUsage?.balanceRows ?? 0);
const accountingTotals = toolEconomics?.accountingIntegrity?.totals ?? {};
const criticalIssues = {
  duplicateBalanceRows: duplicateRows,
  negativeBalanceRows,
  staleReservations: Number(accountingTotals.staleReservations ?? 0),
  unbilledComputeCharges: Number(accountingTotals.unbilledComputeCharges ?? 0),
  priceDriftRows: Number(accountingTotals.priceDriftRows ?? 0),
  balanceMismatchUsers: Number(accountingTotals.balanceMismatchUsers ?? 0),
};
const criticalIssueTotal = Object.values(criticalIssues).reduce((sum, value) => sum + value, 0);

console.log(JSON.stringify({
  generatedAt: workspaceDiagnostics?.generatedAt ?? toolEconomics?.computedAt ?? null,
  range: toolEconomics?.range ?? null,
  scannedBalanceRows: workspaceDiagnostics?.balances?.scannedRows ?? null,
  duplicateBalanceRows: duplicateRows,
  negativeBalanceRows,
  staleTopupCheckouts: staleTopups,
  pendingSettlementsDue,
  uncollectedUsageRows: uncollectedRows,
  accountingIntegrityHealth: toolEconomics?.accountingIntegrity?.health ?? null,
  accountingIntegrityScore: toolEconomics?.accountingIntegrity?.score ?? null,
  staleReservations: criticalIssues.staleReservations,
  unbilledComputeCharges: criticalIssues.unbilledComputeCharges,
  priceDriftRows: criticalIssues.priceDriftRows,
  balanceMismatchUsers: criticalIssues.balanceMismatchUsers,
}, null, 2));

if (criticalIssueTotal > 0) {
  throw new Error(`workspace_credit_accounting_health_smoke_failed:${JSON.stringify(criticalIssues)}`);
}

console.log("workspace_credit_accounting_health_smoke: ok");
