import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();

async function readRepoFile(relativePath: string): Promise<string> {
  return await readFile(path.join(rootDir, relativePath), "utf8");
}

async function proveWorkspaceCreditAccountingContract() {
  const schemaSource = await readRepoFile("convex/schema.ts");
  const sharedCreditsSource = await readRepoFile("shared/workspaceCredits.ts");
  const creditsSource = await readRepoFile("convex/workspaceCredits.ts");
  const daytonaSessionSource = await readRepoFile("convex/daytonaWorkspaceSession.ts");
  const backgroundServiceSource = await readRepoFile("convex/workspaceTerminalBackgroundService.ts");
  const orphanReconcilerSource = await readRepoFile("convex/daytonaOrphanReconciler.ts");
  const httpDaytonaSource = await readRepoFile("convex/httpDaytona.ts");
  const httpVoiceSource = await readRepoFile("convex/httpVoice.ts");
  const runtimeSessionSource = await readRepoFile("convex/runtimeExecutionSession.ts");
  const cronsSource = await readRepoFile("convex/crons.ts");
  const accountSource = await readRepoFile("convex/account.ts");

  assert.match(
    schemaSource,
    /creditReservationKey:\s*v\.optional\(v\.string\(\)\)/,
    "expected workspace compute charges to retain the source credit reservation key",
  );
  assert.match(
    schemaSource,
    /creditsSettled:\s*v\.optional\(v\.number\(\)\)/,
    "expected credit ledger entries to distinguish reserved from settled credits",
  );
  assert.match(
    schemaSource,
    /includedCycleStartedAt:\s*v\.optional\(v\.number\(\)\)[\s\S]*includedCycleEndsAt:\s*v\.optional\(v\.number\(\)\)/,
    "expected credit ledger entries to remember the included-credit cycle they debited",
  );
  assert.match(
    schemaSource,
    /\.index\("by_status_expiresAt",\s*\["status",\s*"expiresAt"\]\)/,
    "expected expired reservations to be queryable by status and expiry",
  );
  assert.match(
    schemaSource,
    /providerSandboxCreditReservationKey:\s*v\.optional\(v\.string\(\)\)/,
    "expected background sandboxes to persist their credit reservation key",
  );

  assert.match(
    sharedCreditsSource,
    /DAYTONA_WORKSPACE_SESSION_BUDGET_SECONDS\s*=\s*60\s*\*\s*60/,
    "expected Daytona runtime budget to be explicitly duration based",
  );
  assert.match(
    sharedCreditsSource,
    /DAYTONA_WORKSPACE_SESSION_RESERVE_SECONDS\s*=[\s\S]*DAYTONA_WORKSPACE_SESSION_BUDGET_SECONDS\s*\+[\s\S]*DAYTONA_WORKSPACE_SESSION_STOP_GRACE_SECONDS/,
    "expected Daytona reservations to cover the runtime budget plus cleanup grace",
  );
  assert.match(
    sharedCreditsSource,
    /export function estimateDaytonaWorkspaceReservationCredits/,
    "expected a shared Daytona reservation estimator",
  );

  assert.match(
    creditsSource,
    /expiresAt:\s*[\s\S]*CREDIT_RESERVATION_EXPIRY_MS/,
    "expected reserved credits to receive an expiry deadline",
  );
  assert.match(
    creditsSource,
    /export const settleCreditsInternal[\s\S]*creditsSettled/,
    "expected credit settlement to support partial settlement",
  );
  assert.match(
    creditsSource,
    /export const reconcileExpiredCreditReservationsInternal/,
    "expected stranded reservations to have a durable reconciliation path",
  );
  assert.match(
    creditsSource,
    /reservation\?\.status === "reserved"[\s\S]*ctx\.db\.patch\(reservation\._id,\s*\{[\s\S]*status:\s*"succeeded"/,
    "expected compute charges to atomically settle reserved credits before recording usage",
  );
  assert.match(
    creditsSource,
    /reservation\?\.status === "succeeded"/,
    "expected compute charges to remain idempotent for already-settled reservations",
  );
  assert.match(
    creditsSource,
    /canRefundIncludedCreditsForEntry[\s\S]*includedCycleStartedAt[\s\S]*includedCycleEndsAt/,
    "expected included-credit refunds to be cycle-aware",
  );
  assert.match(
    creditsSource,
    /includedCycleStartedAt:[\s\S]*balance\.includedCycleStartedAt[\s\S]*includedCycleEndsAt:[\s\S]*balance\.includedCycleEndsAt/,
    "expected reservations to persist the active included-credit cycle",
  );

  assert.match(
    daytonaSessionSource,
    /reserveCreditsInternal[\s\S]*ensureCloudProjectVolume[\s\S]*executeDaytonaProbeToolCall/,
    "expected temporary Daytona sessions to reserve credits before provider volume or sandbox creation",
  );
  assert.match(
    daytonaSessionSource,
    /settleCreditsInternal[\s\S]*recordWorkspaceComputeChargeInternal[\s\S]*creditReservationKey/,
    "expected temporary Daytona teardown to settle the reservation before recording the charge",
  );

  assert.match(
    backgroundServiceSource,
    /reserveCreditsInternal[\s\S]*ensureCloudProjectVolume[\s\S]*createDaytonaSandbox/,
    "expected background Daytona sandboxes to reserve credits before provider volume or sandbox creation",
  );
  assert.match(
    backgroundServiceSource,
    /providerSandboxCreditReservationKey:\s*creditReservationKey/,
    "expected background sandbox reservation keys to be persisted on the project",
  );
  assert.match(
    orphanReconcilerSource,
    /creditBudgetExpiresAt[\s\S]*terminalRows\.some\(\(row\) => isActiveTerminalStatus\(row\.status\)\) &&\s*!budgetExpired/,
    "expected the orphan reconciler to stop budget-expired background sandboxes even with active terminals",
  );

  assert.match(
    httpDaytonaSource,
    /buildWorkspaceCreditBudgetSignal/,
    "expected Daytona tool calls to receive a budget deadline abort signal",
  );
  assert.match(
    runtimeSessionSource,
    /buildWorkspaceCreditBudgetSignal/,
    "expected computer-use tool calls to receive a budget deadline abort signal",
  );
  assert.match(
    httpDaytonaSource,
    /web_research[\s\S]*reserveCreditsInternal[\s\S]*executeWebResearch[\s\S]*settleReservedCreditsStrict/,
    "expected successful web research to reserve and then strictly settle credits",
  );
  assert.match(
    httpVoiceSource,
    /reservedCreditKey[\s\S]*reserveCreditsInternal[\s\S]*primary\.ok[\s\S]*settleReservedCreditsStrict[\s\S]*fallback\.ok[\s\S]*settleReservedCreditsStrict/,
    "expected successful voice transcription to reserve and then strictly settle credits",
  );
  assert.doesNotMatch(
    httpDaytonaSource,
    /status:\s*"succeeded"[\s\S]{0,240}settleReservedCreditsBestEffort/,
    "successful web research settlement must not be best-effort",
  );
  assert.doesNotMatch(
    httpVoiceSource,
    /status:\s*"succeeded"[\s\S]{0,240}settleReservedCreditsBestEffort/,
    "successful voice settlement must not be best-effort",
  );
  assert.match(
    cronsSource,
    /reconcileExpiredCreditReservationsInternal/,
    "expected expired credit reservation reconciliation to be scheduled",
  );
  assert.match(
    accountSource,
    /creditLedgerEntries[\s\S]*by_user_createdAt[\s\S]*userId/,
    "expected account deletion to remove user-scoped credit ledger rows",
  );

  console.log("PASS: workspace credit accounting contract is wired correctly");
}

await proveWorkspaceCreditAccountingContract();
