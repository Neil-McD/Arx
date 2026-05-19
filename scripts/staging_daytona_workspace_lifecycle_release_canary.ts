import {
  assert,
  buildMaintenancePayload,
  convexRunJson,
  parseCommonOptions,
  readFlag,
  withMaintenanceToken,
} from "./staging_maintenance_cli.ts";

const LIFECYCLE_CANARY_PROJECT_NAME = "Lifecycle Canary";

const options = parseCommonOptions();
const ownerId = readFlag("--owner-id");
const limit = Number(readFlag("--limit") ?? 25);

const result = withMaintenanceToken(options, (token) =>
  convexRunJson(
    options,
    "stagingDaytonaWorkspaceLifecycleCanary:runDaytonaWorkspaceLifecycleReleaseCanary",
    buildMaintenancePayload(options, token, {
      ownerId: ownerId ?? undefined,
      projectName: LIFECYCLE_CANARY_PROJECT_NAME,
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    }),
  ),
);

assert(result && typeof result === "object", "release canary payload missing");
assert(result.ok === true, `release canary failed: ${result?.reason}`);
assert(result.project?.name === LIFECYCLE_CANARY_PROJECT_NAME, "release canary must use dedicated project");
assert(result.start?.ok === true, "release canary should start a Daytona sandbox");
assert(
  result.start?.providerSandboxPresent === true,
  "release canary should observe a live provider sandbox after start",
);
assert(
  typeof result.start?.providerSandboxEffectiveIdleExpiresAt === "number",
  "release canary should expose effective idle expiry after start",
);
assert(result.forced?.ok === true, "release canary should force only the canary sandbox idle");
assert(result.forced?.idleExpired === true, "forced canary sandbox should be idle-expired");
assert(
  result.forced?.blockingActivityPresent === false,
  "forced canary sandbox should not have blocking terminal or runtime activity",
);
assert(
  Number(result.reconcile?.released ?? 0) >= 1,
  "lifecycle reconciler should release the canary sandbox",
);
assert(
  Number(result.reconcile?.failed ?? 0) === 0,
  "lifecycle reconciler should not fail during release canary",
);
assert(
  result.after?.providerSandboxPresent === false,
  "canary project should not retain provider sandbox after lifecycle reconcile",
);
assert(
  result.after?.activeTerminalCount === 0 && result.after?.activeRuntimeRunCount === 0,
  "canary project should have no active workspace blockers after reconcile",
);
assert(
  Number(result.diagnostics?.releasedCandidateCount ?? 0) >= 1,
  "release canary should produce lifecycle candidate release diagnostics",
);
assert(
  Number(result.diagnostics?.completedReleased ?? 0) >= 1,
  "release canary should produce lifecycle completed release diagnostics",
);
assert(
  Number(result.chargeEvidence?.chargeCount ?? 0) >= 1,
  "release canary should record workspace compute charge evidence",
);

console.log(
  JSON.stringify(
    {
      ok: true,
      project: result.project,
      preflightCleanup: result.preflightCleanup
        ? {
            providerSandboxPresentAfter:
              result.preflightCleanup.providerSandboxPresentAfter,
            released: result.preflightCleanup.reconcile?.released ?? 0,
            failed: result.preflightCleanup.reconcile?.failed ?? 0,
          }
        : null,
      start: {
        providerSandboxPresent: result.start.providerSandboxPresent,
        providerSandboxState: result.start.providerSandboxState,
        providerSandboxEffectiveIdleExpiresAt:
          result.start.providerSandboxEffectiveIdleExpiresAt,
        sandboxCpu: result.start.sandboxCpu,
        sandboxMemoryGiB: result.start.sandboxMemoryGiB,
        sandboxDiskGiB: result.start.sandboxDiskGiB,
      },
      forced: result.forced,
      reconcile: result.reconcile,
      after: result.after,
      diagnostics: result.diagnostics,
      chargeEvidence: {
        chargeCount: result.chargeEvidence.chargeCount,
        totalDurationSeconds: result.chargeEvidence.totalDurationSeconds,
        totalCreditsDebited: result.chargeEvidence.totalCreditsDebited,
      },
    },
    null,
    2,
  ),
);
