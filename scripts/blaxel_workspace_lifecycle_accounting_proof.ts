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
const runtimeWorkspaceSessionDisposal = read("convex/runtimeWorkspaceSessionDisposal.ts");
const workspaceCredits = read("convex/workspaceCredits.ts");
const blaxelWorkspaceWake = read("convex/blaxelWorkspaceWake.ts");
const workspaceTerminals = read("convex/workspaceTerminals.ts");
const blaxelWorkspaceClient = read("convex/blaxelWorkspaceClient.ts");
const workspaceRuntimeSession = read("convex/workspaceRuntimeSession.ts");
const sharedWorkspaceProvider = read("shared/workspaceComputerProvider.ts");
const crons = read("convex/crons.ts");

assertOrdered(
  runtimeWorkspaceSessionDisposal,
  [
    "await resolveWorkspaceSessionAccountingReleaseDecision({",
    "if (!releaseDecision.shouldRelease)",
    "workspace_session_accounting_kept_alive",
    'outcome: "kept_alive"',
    "releaseBlaxelWorkspaceComputerIfIdle({",
    "workspace_session_provider_release_failed",
    "settleRuntimeWorkspaceSession({",
    "providerStandbyGraceSeconds: providerRelease.billableGraceSeconds",
    "releaseRuntimeWorkspaceSessionAccountingIfCurrent({",
  ],
  "runtime dispose must keep terminal-backed workspace accounting alive and release provider before settlement",
);
assert.match(
  runtimeWorkspaceSessionDisposal,
  /resolveWorkspaceSessionAccountingReleaseDecision[\s\S]*refreshProjectSandboxActiveTerminalStatusInternal[\s\S]*active_terminal_still_running[\s\S]*no_active_terminal_remaining[\s\S]*active_terminal_refresh_failed/,
  "runtime dispose must refresh terminal truth and fail closed before releasing accounting",
);
assert.doesNotMatch(
  runtimeWorkspaceSessionDisposal,
  /no_terminal_started|workspaceSessionStartedPersistentTerminal/,
  "runtime release cannot depend on whether the current turn started the terminal",
);
assert.match(
  runtimeExecutionSession,
  /disposeRuntimeWorkspaceSession\(\{[\s\S]*session: workspaceSession[\s\S]*finalState: finalWorkspaceState/,
  "native runtime must delegate workspace disposal to the shared terminal-aware helper",
);
assert.match(
  workspaceRuntimeSession,
  /providerStandbyGraceSeconds[\s\S]*measuredDurationSeconds[\s\S]*durationSeconds = measuredDurationSeconds \+ providerStandbyGraceSeconds[\s\S]*provider_standby_grace_seconds/,
  "runtime workspace settlement must bill measured usage plus provider auto-standby grace",
);
assert.match(
  workspaceRuntimeSession,
  /recordWorkspaceComputeChargeInternal[\s\S]*measuredDurationSeconds,[\s\S]*providerStandbyGraceSeconds,[\s\S]*providerReleaseReason:[\s\S]*providerReleaseConfirmed:/,
  "runtime workspace settlement must persist measured/grace/release metadata into the charge writer",
);
assert.match(
  workspaceCredits,
  /recordWorkspaceComputeChargeInternal[\s\S]*measuredDurationSeconds: v\.optional\(v\.number\(\)\)[\s\S]*providerStandbyGraceSeconds: v\.optional\(v\.number\(\)\)[\s\S]*providerReleaseReason: v\.optional\(v\.union\(v\.string\(\), v\.null\(\)\)\)[\s\S]*providerReleaseConfirmed: v\.optional\(v\.union\(v\.boolean\(\), v\.null\(\)\)\)/,
  "workspace compute charge writer must accept provider lifecycle split metadata",
);
assert.match(
  workspaceCredits,
  /metadata: \{[\s\S]*final_duration_seconds[\s\S]*measured_duration_seconds[\s\S]*provider_standby_grace_seconds[\s\S]*provider_release_reason[\s\S]*provider_release_confirmed/,
  "workspace compute charge writer must store provider lifecycle split metadata on the ledger",
);
assert.match(
  workspaceCredits,
  /provider_cost_source: "workspace_compute_charge"[\s\S]*duration_seconds[\s\S]*measured_duration_seconds[\s\S]*provider_standby_grace_seconds[\s\S]*provider_release_reason[\s\S]*provider_release_confirmed/,
  "workspace compute provider-cost mirror must store provider lifecycle split metadata",
);

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

assert.match(
  workspaceCredits,
  /function isBlaxelWorkspaceComputeReservation\(entry: any\)[\s\S]*toolName\) === "workspace_compute"[\s\S]*vendor\) === "blaxel"[\s\S]*Boolean\(entry\?\.projectId\)/,
  "Blaxel workspace reservation detection must require provider, tool name, and project ownership",
);
assert.match(
  workspaceCredits,
  /hasActiveBlaxelProjectWorkspaceLeasePointer[\s\S]*isBlaxelWorkspaceComputeReservation\(entry\)[\s\S]*providerSandboxProviderId\) === "blaxel"[\s\S]*providerSandboxCreditReservationKey[\s\S]*entry\?\.creditKey/,
  "active project pointer protection must be keyed by the current Blaxel sandbox reservation",
);
assert.doesNotMatch(
  workspaceCredits,
  /hasActiveBlaxelProjectWorkspaceLeasePointer[\s\S]*isBlaxelProjectWorkspaceLeaseReservation/,
  "project pointer protection must not exclude runtime_workspace_session by action type",
);
assertOrdered(
  workspaceCredits,
  [
    "async function shouldSkipExpiredBlaxelWorkspaceReservation",
    "await hasActiveBlaxelProjectWorkspaceLeasePointer(ctx, entry)",
    "return true;",
    "if (isBlaxelRuntimeWorkspaceReservation(entry))",
    "return await hasRunningRuntimeRunForWorkspaceReservation(ctx, entry)",
    "return false;",
  ],
  "generic expired cleanup must prefer project pointer truth, then running runtime truth",
);
assert.match(
  workspaceCredits,
  /hasRunningRuntimeRunForWorkspaceReservation[\s\S]*by_owner_runId[\s\S]*status\) === "running"[\s\S]*run\?\.projectId\) === projectId/,
  "orphan runtime reservations must still require an active matching runtime run",
);

assertOrdered(
  blaxelWorkspaceWake,
  [
    "async function resolveReusableProjectWorkspaceLease",
    "providerSandboxCreditReservationKey",
    "getCreditLedgerEntryByKeyInternal",
    'ledgerEntry.status !== "reserved"',
    'String(ledgerEntry.userId ?? "") !== String(params.ownerId ?? "")',
    "normalizeOptionalString(ledgerEntry.projectId) !== String(params.projectId)",
    "!isBlaxelWorkspaceLeaseLedgerEntry(ledgerEntry)",
    "canReuseWorkspaceLeaseForIntent({",
    "inspectBlaxelWorkspaceComputer({",
  ],
  "reusable lease path must trust the active project pointer and reserved ledger entry before provider reuse",
);
assert.doesNotMatch(
  blaxelWorkspaceWake,
  /isRuntimeWorkspaceSessionLeaseLedgerEntry|isRunningRuntimeWorkspaceSessionLease/,
  "project-attached runtime workspace leases must not require the original runtime run to still be running",
);
assert.match(
  blaxelWorkspaceWake,
  /canReuseWorkspaceLeaseForIntent[\s\S]*compareWorkspaceComputerLifecycleIntents[\s\S]*requestedLifecycleIntent/,
  "lease reuse must still reject weaker lifecycle leases",
);
assert.match(
  blaxelWorkspaceWake,
  /resolveReusableProjectWorkspaceLease[\s\S]*providerSandboxId\) !== params\.providerSandboxId[\s\S]*providerSandboxProviderId\) !== "blaxel"[\s\S]*providerVolumeId\) !== params\.providerVolumeId/,
  "lease reuse must fail closed on sandbox, provider, or volume mismatch",
);

assert.match(
  blaxelWorkspaceWake,
  /async function recordTrackedBlaxelWorkspaceLeaseProviderCostBestEffort[\s\S]*recordProviderCostInternal[\s\S]*billingDisposition: "tracked_only"[\s\S]*provider_cost_source: "workspace_lease_release_without_user_charge"/,
  "released Blaxel workspace leases must still track provider cost before refunding the user-facing reservation",
);
assertOrdered(
  blaxelWorkspaceWake,
  [
    "await recordTrackedBlaxelWorkspaceLeaseProviderCostBestEffort({",
    "await settleReservedCreditsBestEffort({",
    'status: "refunded"',
  ],
  "released Blaxel workspace leases must record tracked provider cost before refunding the user-facing reservation",
);
assertOrdered(
  blaxelWorkspaceWake,
  [
    "export async function finalizeBillableBlaxelProjectWorkspaceLease",
    "providerSandboxProviderId) !== \"blaxel\"",
    "providerSandboxCreditReservationKey",
    'ledgerEntry.status !== "reserved"',
    "ledgerOwnerMatches",
    "ledgerProjectMatches",
    "params.requireExpiredReservation === true",
    "!isBlaxelWorkspaceLeaseLedgerEntry(ledgerEntry)",
    "settleBillableBlaxelWorkspaceLeaseBestEffort({",
    "clearProjectWorkspaceLeaseAccounting({",
  ],
  "project finalizer must settle and clear any current Blaxel workspace lease action owned by the project pointer",
);
assert.doesNotMatch(
  blaxelWorkspaceWake,
  /isProjectFinalizableBlaxelWorkspaceLeaseLedgerEntry/,
  "project finalization must not keep an action-type exclusion wrapper",
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
    "reconcile stale runtime workspace runs",
    "reconcileStaleRuntimeWorkspaceRunsInternal",
    "finalize expired blaxel project workspace leases",
    "finalizeExpiredBlaxelProjectWorkspaceLeasesInternal",
    "reconcile expired credit reservations",
    "reconcileExpiredCreditReservationsInternal",
  ],
  "cron order must reconcile stale runtime runs and project leases before generic reservation cleanup",
);

console.log("blaxel_workspace_lifecycle_accounting_proof: ok");
