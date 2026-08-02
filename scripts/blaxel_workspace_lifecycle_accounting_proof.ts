import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function assertOrdered(source: string, snippets: string[], message: string) {
  let cursor = -1;
  for (const snippet of snippets) {
    const next = source.indexOf(snippet, cursor + 1);
    assert.ok(
      next > cursor,
      `${message}: expected snippet after index ${cursor}: ${snippet}`,
    );
    cursor = next;
  }
}

const runtimeExecutionSession = read("convex/runtimeExecutionSession.ts");
const blaxelWorkspaceWake = read("convex/blaxelWorkspaceWake.ts");
const workspaceTerminals = read("convex/workspaceTerminals.ts");
const blaxelWorkspaceClient = read("convex/blaxelWorkspaceClient.ts");
const workspaceRuntimeSession = read("convex/workspaceRuntimeSession.ts");
const sharedWorkspaceProvider = read("shared/workspaceComputerProvider.ts");
const crons = read("convex/crons.ts");

assertOrdered(
  runtimeExecutionSession,
  [
    "await resolveWorkspaceSessionAccountingReleaseDecision(workspaceSession)",
    "if (!releaseDecision.shouldRelease)",
    "workspace_session_accounting_kept_alive",
    "return;",
    "releaseBlaxelWorkspaceComputerIfIdle({",
    "workspace_session_provider_release_failed",
    "settleRuntimeWorkspaceSession({",
    "providerStandbyGraceSeconds: providerRelease.billableGraceSeconds",
    "releaseRuntimeWorkspaceSessionAccountingIfCurrent({",
  ],
  "runtime dispose must keep terminal-backed workspace accounting alive and release provider before settlement",
);
assert.match(
  runtimeExecutionSession,
  /resolveWorkspaceSessionAccountingReleaseDecision[\s\S]*refreshProjectSandboxActiveTerminalStatusInternal[\s\S]*active_terminal_still_running[\s\S]*no_active_terminal_remaining[\s\S]*active_terminal_refresh_failed/,
  "runtime dispose must refresh terminal truth and fail closed before releasing accounting",
);
assert.doesNotMatch(
  runtimeExecutionSession,
  /no_terminal_started|workspaceSessionStartedPersistentTerminal/,
  "runtime release cannot depend on whether the current turn started the terminal",
);
assert.match(
  workspaceRuntimeSession,
  /providerStandbyGraceSeconds[\s\S]*measuredDurationSeconds[\s\S]*durationSeconds = measuredDurationSeconds \+ providerStandbyGraceSeconds[\s\S]*provider_standby_grace_seconds/,
  "runtime workspace settlement must bill measured usage plus provider auto-standby grace",
);
assert.match(
  workspaceRuntimeSession,
  /recordPlatformToolCostBestEffort\([\s\S]*rawVendorCostUsd: computeCostUsd[\s\S]*metadata,[\s\S]*nowMs: endedAt/,
  "runtime workspace settlement must persist measured provider cost without charging a user ledger",
);
assert.match(
  workspaceRuntimeSession,
  /metadata = \{[\s\S]*duration_seconds:[\s\S]*measured_duration_seconds:[\s\S]*provider_standby_grace_seconds:[\s\S]*provider_release_reason:[\s\S]*provider_release_confirmed:/,
  "workspace provider-cost evidence must keep lifecycle split metadata",
);
assert.doesNotMatch(workspaceRuntimeSession, /recordWorkspaceComputeChargeInternal|reserveCreditsInternal|settleCreditsInternal/);

assert.equal(
  /BLAXEL_AUTO_STANDBY_GRACE_SECONDS = 15/.test(sharedWorkspaceProvider),
  true,
  "Blaxel auto-standby grace must be explicit and shared across accounting paths",
);
assert.match(
  blaxelWorkspaceClient,
  /releaseBlaxelWorkspaceSandboxIfIdle[\s\S]*mode: "provider_auto_standby"[\s\S]*releaseConfirmed: false[\s\S]*billableGraceSeconds: BLAXEL_AUTO_STANDBY_GRACE_SECONDS[\s\S]*blaxel_auto_standby_after_connection_idle/,
  "provider release must honestly represent Blaxel automatic standby instead of fake manual standby",
);
assert.doesNotMatch(
  blaxelWorkspaceClient,
  /releaseBlaxelWorkspaceSandboxIfIdle[\s\S]*mode: "provider_standby"[\s\S]*\n\s*};/,
  "provider release must not report confirmed standby without provider evidence",
);

assertOrdered(
  blaxelWorkspaceWake,
  [
    "async function resolveReusableProjectWorkspaceLease",
    "providerSandboxCreditReservationKey",
    "providerSandboxCreditBudgetExpiresAt",
    "projectCreditBudgetExpiresAt <= Date.now()",
    "inspectBlaxelWorkspaceComputer({",
  ],
  "reusable lease path must trust the active project pointer, bounded lease window, and provider truth",
);
assert.doesNotMatch(
  blaxelWorkspaceWake,
  /getCreditLedgerEntryByKeyInternal|reserveCreditsInternal|settleCreditsInternal|settleReservedCreditsBestEffort/,
  "workspace lifecycle must not consult or mutate the retired user-credit ledger",
);
assert.match(
  blaxelWorkspaceWake,
  /resolveReusableProjectWorkspaceLease[\s\S]*providerSandboxId\) !== params\.providerSandboxId[\s\S]*providerSandboxProviderId\) !== "blaxel"[\s\S]*providerVolumeId\) !== params\.providerVolumeId/,
  "lease reuse must fail closed on sandbox, provider, or volume mismatch",
);

assert.match(
  blaxelWorkspaceWake,
  /settleBillableBlaxelWorkspaceLeaseBestEffort[\s\S]*recordPlatformToolCostBestEffort\([\s\S]*rawVendorCostUsd: computeCostUsd[\s\S]*settlement_source: "project_workspace_lease"/,
  "released Blaxel workspace leases must record platform-absorbed provider cost",
);
assertOrdered(
  blaxelWorkspaceWake,
  [
    "export async function finalizeBillableBlaxelProjectWorkspaceLease",
    "providerSandboxProviderId) !== \"blaxel\"",
    "providerSandboxCreditReservationKey",
    "settleBillableBlaxelWorkspaceLeaseBestEffort({",
    "clearProjectWorkspaceLeaseAccounting({",
  ],
  "project finalizer must record and clear the current Blaxel workspace lease owned by the project pointer",
);

assertOrdered(
  workspaceTerminals,
  [
    "export const stopProjectWorkspaceComputer",
    "stopWorkspaceTerminalInternal",
    "releaseBlaxelWorkspaceComputerIfIdle({",
    "settleBillableBlaxelWorkspaceLeaseBestEffort({",
    'settlementReason: "workspace_computer_stopped"',
    "providerStandbyGraceSeconds: providerRelease.billableGraceSeconds",
    "setProjectBackgroundSandboxInternal",
    "clearSandboxAccounting: true",
  ],
  "manual terminal stop must hand off to provider auto-standby and bill grace before clearing project accounting",
);

assertOrdered(
  crons,
  [
    "finalize expired blaxel project workspace leases",
    "finalizeExpiredBlaxelProjectWorkspaceLeasesInternal",
    "record blaxel storage provider costs",
    "recordBlaxelStorageProviderCostsInternal",
  ],
  "cron order must finalize project leases before recording recurring provider costs",
);
assert.doesNotMatch(crons, /reconcileExpiredCreditReservationsInternal/);

console.log("blaxel_workspace_lifecycle_accounting_proof: ok");
