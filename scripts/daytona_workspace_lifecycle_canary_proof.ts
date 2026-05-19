import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();

async function readRepoFile(relativePath: string): Promise<string> {
  return await readFile(path.join(rootDir, relativePath), "utf8");
}

function sliceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `expected source to include ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `expected source to include ${endNeedle}`);
  return source.slice(start, end);
}

async function main() {
  const lifecycle = await readRepoFile("convex/daytonaWorkspaceLifecycle.ts");
  const workspaceTerminals = await readRepoFile("convex/workspaceTerminals.ts");
  const stagingMaintenance = await readRepoFile("convex/stagingMaintenance.ts");
  const stagingLifecycleCanary = await readRepoFile(
    "convex/stagingDaytonaWorkspaceLifecycleCanary.ts",
  );
  const diagnostics = await readRepoFile("convex/platformDiagnostics.ts");
  const schema = await readRepoFile("convex/schema.ts");
  const packageJson = await readRepoFile("package.json");
  const stagingCanary = await readRepoFile("scripts/staging_daytona_workspace_lifecycle_canary.ts");
  const stagingReleaseCanary = await readRepoFile(
    "scripts/staging_daytona_workspace_lifecycle_release_canary.ts",
  );
  const stagingMaintenanceCli = await readRepoFile("scripts/staging_maintenance_cli.ts");
  const eventKeyBlock = sliceBetween(lifecycle, "const eventKeyParts = [", "try {");
  const stagingCliRunBlock = sliceBetween(
    stagingMaintenanceCli,
    "export function run(",
    "const SENSITIVE_KEY_PATTERN",
  );

  assert.match(
    diagnostics,
    /"runtime\.daytona_workspace_lifecycle\.started": \["limit", "candidateCount"\]/,
    "lifecycle started diagnostics should keep a narrow metadata allowlist",
  );
  assert.match(
    diagnostics,
    /"runtime\.daytona_workspace_lifecycle\.candidate": \[[\s\S]*"candidateIndex"[\s\S]*"reason"[\s\S]*"sandboxState"[\s\S]*"idleExpired"[\s\S]*"stopLeaseActive"[\s\S]*"leaseAcquired"[\s\S]*"providerSandboxPresent"[\s\S]*\]/,
    "candidate diagnostics should expose only lifecycle-safe fields",
  );
  assert.match(
    diagnostics,
    /"runtime\.daytona_workspace_lifecycle\.completed": \[[\s\S]*"limit"[\s\S]*"candidateCount"[\s\S]*"scanned"[\s\S]*"released"[\s\S]*"skipped"[\s\S]*"activeRuns"[\s\S]*"failed"[\s\S]*\]/,
    "completed diagnostics should expose aggregate reconciliation counters",
  );

  assert.match(
    lifecycle,
    /recordLifecycleDiagnostic[\s\S]*subsystem:\s*"runtime"[\s\S]*surface:\s*LIFECYCLE_DIAGNOSTIC_SURFACE[\s\S]*recordPlatformDiagnosticEventInternal/,
    "lifecycle reconciler should write canonical runtime platform diagnostics",
  );
  assert.match(
    lifecycle,
    /eventKeyParts = \[[\s\S]*LIFECYCLE_DIAGNOSTIC_SURFACE[\s\S]*input\.runKey[\s\S]*input\.eventName[\s\S]*input\.candidateIndex \?\? "run"[\s\S]*input\.status[\s\S]*\]/,
    "lifecycle diagnostic event keys should avoid raw provider sandbox ids",
  );
  assert.doesNotMatch(
    eventKeyBlock,
    /providerSandboxId/,
    "lifecycle diagnostic event keys must not include raw Daytona sandbox ids",
  );
  assert.match(
    lifecycle,
    /runtime\.daytona_workspace_lifecycle\.\$\{input\.eventName\}/,
    "lifecycle diagnostics should use stable lifecycle event types",
  );
  assert.match(
    lifecycle,
    /eventName:\s*"started"[\s\S]*candidateCount:\s*candidates\.length[\s\S]*eventName:\s*"completed"[\s\S]*scanned[\s\S]*released[\s\S]*skipped[\s\S]*activeRuns[\s\S]*failed/,
    "lifecycle reconciler should record start and completion evidence",
  );
  assert.match(
    lifecycle,
    /if \(candidates\.length > 0\) \{[\s\S]*eventName:\s*"started"[\s\S]*if \(candidates\.length > 0\) \{[\s\S]*eventName:\s*"completed"/,
    "lifecycle reconciler should avoid writing no-op diagnostic rows every cron tick",
  );
  assert.match(
    lifecycle,
    /stopLease\?\.acquired !== true[\s\S]*reason[\s\S]*active_runtime_run[\s\S]*leaseAcquired:\s*false/,
    "lifecycle reconciler should record blocked stop-lease outcomes",
  );
  assert.match(
    lifecycle,
    /status:\s*"blocked"[\s\S]*reason:\s*"release_retained_sandbox"[\s\S]*status:\s*"succeeded"[\s\S]*reason:\s*"released"/,
    "lifecycle reconciler should distinguish retained sandboxes from released sandboxes",
  );
  assert.match(
    lifecycle,
    /errorCode:\s*"daytona_workspace_lifecycle_candidate_failed"[\s\S]*reason:\s*"exception"/,
    "lifecycle reconciler should record candidate cleanup failures",
  );

  assert.match(
    lifecycle,
    /inspectProjectBackgroundSandboxLifecycleInternal = internalQuery/,
    "lifecycle inspection should be internal and read-only",
  );
  assert.match(
    lifecycle,
    /export async function inspectProjectBackgroundSandboxLifecycle/,
    "lifecycle inspection should have one shared implementation for internal and staging callers",
  );
  assert.match(
    lifecycle,
    /projectId:\s*v\.id\("cloudProjects"\)[\s\S]*ownerId:\s*v\.optional\(v\.id\("users"\)\)/,
    "lifecycle inspection should be scoped by project and optional owner",
  );
  assert.match(
    lifecycle,
    /args\.ownerId && project\.ownerId !== args\.ownerId[\s\S]*reason:\s*"project_not_found"/,
    "lifecycle inspection should fail closed on owner mismatch",
  );
  assert.match(
    lifecycle,
    /query\("workspaceTerminalSessions"\)[\s\S]*withIndex\("by_providerSandboxId"[\s\S]*isWorkspaceTerminalActiveStatus[\s\S]*activeTerminalCount/,
    "inspection should explain terminal activity blocking cleanup",
  );
  assert.match(
    lifecycle,
    /query\("runtimeRuns"\)[\s\S]*by_workspaceSessionState_providerSandboxId_status[\s\S]*eq\("status", "running"\)[\s\S]*activeRuntimeRunCount/,
    "inspection should explain active Codex runtime runs blocking cleanup",
  );
  assert.match(
    lifecycle,
    /deriveProjectSandboxIdleExpiresAt[\s\S]*providerSandboxEffectiveIdleExpiresAt[\s\S]*idleExpired[\s\S]*stopLeaseActive[\s\S]*creditBudgetExpired[\s\S]*blockingActivityPresent[\s\S]*shouldReconcile/,
    "inspection should expose lifecycle decision booleans",
  );
  assert.match(
    workspaceTerminals,
    /providerSandboxIdleExpiresAt:\s*readProjectSandboxIdleExpiresAt\(row\) \|\| null/,
    "idle lifecycle candidates should return the effective derived idle expiry for compatibility rows",
  );

  assert.match(
    stagingLifecycleCanary,
    /getDaytonaWorkspaceLifecycleInspection = query[\s\S]*assertStagingMaintenanceAllowed[\s\S]*inspectProjectBackgroundSandboxLifecycle/,
    "staging lifecycle inspection should be maintenance-gated and reuse the canonical inspector",
  );
  assert.match(
    stagingLifecycleCanary,
    /runDaytonaWorkspaceLifecycleReleaseCanary(?::\s*any)? = action[\s\S]*assertStagingMaintenanceAllowed[\s\S]*requireLifecycleCanaryProjectName\(projectName\)/,
    "staging lifecycle release canary should be a maintenance-gated action scoped to the dedicated canary project",
  );
  assert.match(
    stagingLifecycleCanary,
    /prepareDaytonaWorkspaceLifecycleReleaseCanaryInternal = internalMutation[\s\S]*ensureExpectedProject[\s\S]*STAGING_LIFECYCLE_CANARY_PROJECT_NAME/,
    "release canary should prepare a dedicated staging-only lifecycle project",
  );
  assert.match(
    stagingLifecycleCanary,
    /forceDaytonaWorkspaceLifecycleCanaryIdleInternal = internalMutation[\s\S]*providerSandboxId !== args\.providerSandboxId[\s\S]*providerSandboxStopLeaseExpiresAt:\s*undefined/,
    "release canary force-idle should require the exact project sandbox id and clear stale stop leases",
  );
  assert.match(
    stagingLifecycleCanary,
    /ensureProjectBackgroundSandbox[\s\S]*forceDaytonaWorkspaceLifecycleCanaryIdleInternal[\s\S]*reconcileIdleProjectSandboxesInternal[\s\S]*getDaytonaWorkspaceLifecycleCanaryChargeEvidenceInternal/,
    "release canary should start a real Daytona sandbox, force it idle, reconcile it, and verify charge evidence",
  );
  assert.match(
    stagingLifecycleCanary,
    /projectId:\s*v\.optional\(v\.id\("cloudProjects"\)\)[\s\S]*projectName:\s*v\.optional\(v\.string\(\)\)/,
    "staging lifecycle inspection should support explicit project ids and default staging project names",
  );
  assert.doesNotMatch(
    stagingMaintenance,
    /runDaytonaWorkspaceLifecycleReleaseCanary|forceDaytonaWorkspaceLifecycleCanaryIdleInternal|getDaytonaWorkspaceLifecycleCanaryChargeEvidenceInternal/,
    "Daytona lifecycle canary code should live outside the broad staging maintenance module",
  );
  assert.match(
    stagingCanary,
    /stagingDaytonaWorkspaceLifecycleCanary:getDaytonaWorkspaceLifecycleInspection/,
    "staging lifecycle canary should call the maintenance-gated inspection query",
  );
  assert.match(
    stagingCanary,
    /providerSandboxPresent[\s\S]*providerSandboxEffectiveIdleExpiresAt[\s\S]*idleExpired[\s\S]*stopLeaseActive[\s\S]*activeRuntimeRunCount[\s\S]*shouldReconcile/,
    "staging lifecycle canary should assert the lifecycle decision shape",
  );
  assert.match(
    stagingReleaseCanary,
    /LIFECYCLE_CANARY_PROJECT_NAME = "Lifecycle Canary"[\s\S]*stagingDaytonaWorkspaceLifecycleCanary:runDaytonaWorkspaceLifecycleReleaseCanary/,
    "staging lifecycle release canary script should call the autonomous release action against the dedicated project",
  );
  assert.match(
    stagingReleaseCanary,
    /providerSandboxPresent === true[\s\S]*forced\?\.idleExpired === true[\s\S]*providerSandboxPresent === false[\s\S]*chargeEvidence\?\.chargeCount/,
    "staging lifecycle release canary script should assert start, idle, cleanup, diagnostics, and charge evidence",
  );
  assert.match(
    stagingLifecycleCanary,
    /chargeEvidence:\s*\{[\s\S]*chargeCount:\s*Number\(\(chargeEvidence as any\)\?\.chargeCount[\s\S]*totalCreditsDebited:\s*Number\(/,
    "release canary public action should return aggregate charge evidence only",
  );
  assert.doesNotMatch(
    stagingLifecycleCanary.slice(
      stagingLifecycleCanary.indexOf("export const runDaytonaWorkspaceLifecycleReleaseCanary"),
    ),
    /chargeEvidence,\s*$/m,
    "release canary public action should not expose raw internal charge rows",
  );
  assert.match(
    stagingMaintenanceCli,
    /catch \(error\)[\s\S]*Command failed: \$\{command\} \$\{formatSafeCommandArgs\(args\)\}[\s\S]*redactSensitiveText\(String\(failure\.stderr\)\)/,
    "staging maintenance CLI should redact sensitive command args and stderr on exec failures",
  );
  assert.doesNotMatch(
    stagingCliRunBlock,
    /throw error;/,
    "staging maintenance CLI should not rethrow raw exec errors that can include maintenance tokens",
  );

  assert.match(
    schema,
    /platformDiagnosticEvents: defineTable[\s\S]*\.index\("by_type_createdAt", \["eventType", "createdAt"\]\)/,
    "platform diagnostics should remain queryable by lifecycle event type",
  );
  assert.match(
    packageJson,
    /"check:daytona-workspace-lifecycle-canary-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/daytona_workspace_lifecycle_canary_proof\.ts"/,
    "lifecycle canary proof should be wired into package scripts",
  );
  assert.match(
    packageJson,
    /"check:staging-daytona-workspace-lifecycle-canary": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/staging_daytona_workspace_lifecycle_canary\.ts"/,
    "staging lifecycle canary should be wired into package scripts",
  );
  assert.match(
    packageJson,
    /"check:staging-daytona-workspace-lifecycle-release-canary": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/staging_daytona_workspace_lifecycle_release_canary\.ts"/,
    "staging lifecycle release canary should be wired into package scripts",
  );

  console.log("daytona_workspace_lifecycle_canary_proof: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
