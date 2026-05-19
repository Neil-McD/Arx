import {
  assert,
  buildMaintenancePayload,
  convexRunJson,
  parseCommonOptions,
  withMaintenanceToken,
} from "./staging_maintenance_cli.ts";

const options = parseCommonOptions();

const inspection = withMaintenanceToken(options, (token) =>
  convexRunJson(
    options,
    "stagingDaytonaWorkspaceLifecycleCanary:getDaytonaWorkspaceLifecycleInspection",
    buildMaintenancePayload(options, token),
  ),
);

assert(inspection && typeof inspection === "object", "inspection payload missing");
assert(inspection.ok === true, `workspace lifecycle inspection failed: ${inspection?.reason}`);
assert(typeof inspection.providerSandboxPresent === "boolean", "provider presence flag missing");
assert(
  "providerSandboxEffectiveIdleExpiresAt" in inspection,
  "effective idle expiry field missing",
);
assert(typeof inspection.idleExpired === "boolean", "idle expiry flag missing");
assert(typeof inspection.stopLeaseActive === "boolean", "stop lease flag missing");
assert(typeof inspection.creditBudgetExpired === "boolean", "credit budget expiry flag missing");
assert(
  typeof inspection.activeTerminalCount === "number",
  "active terminal count missing",
);
assert(
  typeof inspection.activeRuntimeRunCount === "number",
  "active runtime run count missing",
);
assert(
  typeof inspection.blockingActivityPresent === "boolean",
  "blocking activity flag missing",
);
assert(typeof inspection.shouldReconcile === "boolean", "reconcile decision flag missing");

console.log(
  JSON.stringify(
    {
      ok: true,
      project: inspection.project,
      providerSandboxPresent: inspection.providerSandboxPresent,
      providerSandboxState: inspection.providerSandboxState,
      providerSandboxIdleExpiresAt: inspection.providerSandboxIdleExpiresAt,
      providerSandboxEffectiveIdleExpiresAt: inspection.providerSandboxEffectiveIdleExpiresAt,
      idleExpired: inspection.idleExpired,
      stopLeaseActive: inspection.stopLeaseActive,
      creditBudgetExpired: inspection.creditBudgetExpired,
      activeTerminalCount: inspection.activeTerminalCount,
      activeRuntimeRunCount: inspection.activeRuntimeRunCount,
      blockingActivityPresent: inspection.blockingActivityPresent,
      shouldReconcile: inspection.shouldReconcile,
    },
    null,
    2,
  ),
);
