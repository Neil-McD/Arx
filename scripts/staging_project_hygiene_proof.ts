import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();

async function readRepoFile(relativePath: string): Promise<string> {
  return await readFile(path.join(rootDir, relativePath), "utf8");
}

async function main() {
  const hygiene = await readRepoFile("convex/stagingProjectHygiene.ts");
  const smoke = await readRepoFile("scripts/staging_environment_smoke.ts");
  const hygieneScript = await readRepoFile("scripts/staging_project_hygiene.ts");
  const staleRunsScript = await readRepoFile(
    "scripts/staging_project_hygiene_stale_runs.ts",
  );
  const packageJson = await readRepoFile("package.json");
  const cleanupMutationStart = hygiene.indexOf("export const cleanupDuplicateGeneralProjects = mutation");
  assert.notEqual(
    cleanupMutationStart,
    -1,
    "cleanupDuplicateGeneralProjects mutation must exist",
  );
  const cleanupMutation = hygiene.slice(cleanupMutationStart);

  assert.match(
    hygiene,
    /STAGING_PROJECT_HYGIENE_PROJECT_NAME = "General"/,
    "project hygiene must be scoped to the staging General project",
  );
  assert.match(
    hygiene,
    /throw new Error\("staging_project_hygiene_project_required"\)/,
    "project hygiene must reject non-General project names",
  );
  assert.match(
    hygiene,
    /assertStagingMaintenanceAllowed\(\{ maintenanceToken: args\.maintenanceToken \}\)/,
    "project hygiene functions must be maintenance-token gated",
  );
  assert.match(
    hygiene,
    /assertStagingMaintenanceAllowed[\s\S]*findOwnerUser/,
    "project hygiene must resolve the staging owner through the canonical helper",
  );
  assert.match(
    hygiene,
    /const ARCHIVED_DUPLICATE_NAME_PREFIX = "__staging_archived_duplicate__"/,
    "duplicate cleanup must archive by renaming instead of deleting evidence",
  );
  assert.match(
    hygiene,
    /const ARCHIVED_DUPLICATE_STATUS = "staging_archived_duplicate"/,
    "duplicate cleanup must mark archived staging duplicates with an explicit status",
  );
  assert.doesNotMatch(
    hygiene,
    /ctx\.db\.delete/,
    "staging duplicate hygiene must not delete project rows",
  );
  assert.match(
    hygiene,
    /isProjectSandboxActive[\s\S]*ACTIVE_PROJECT_SANDBOX_STATES[\s\S]*active_project_sandbox/,
    "duplicate cleanup must block rows with active project sandbox state",
  );
  assert.match(
    hygiene,
    /isWorkspaceTerminalActiveStatus[\s\S]*active_terminal_session/,
    "duplicate cleanup must block rows with active terminal sessions",
  );
  assert.match(
    hygiene,
    /activeRuntimeRows[\s\S]*row\.status === "running"[\s\S]*active_runtime_run/,
    "duplicate cleanup must block rows with active runtime runs",
  );
  assert.match(
    hygiene,
    /blockerSamples:\s*\{[\s\S]*activeRuntimeRuns/,
    "duplicate inspection should expose bounded active runtime samples for safe diagnosis",
  );
  assert.match(
    hygiene,
    /activeBridgeSessionRows[\s\S]*active_codex_bridge_session/,
    "duplicate cleanup must block rows with active Codex bridge sessions",
  );
  assert.match(
    hygiene,
    /activeBindingLockRows[\s\S]*active_codex_binding_lock/,
    "duplicate cleanup must block rows with active Codex binding locks",
  );
  assert.match(
    cleanupMutation,
    /const dryRun = args\.dryRun !== false/,
    "cleanup mutation must default to dry-run unless apply explicitly disables it",
  );
  assert.match(
    cleanupMutation,
    /if \(inspection\.blockedCount > 0\)[\s\S]*postDuplicateNameCount: inspection\.duplicateNameCount/,
    "cleanup mutation must refuse to mutate when any duplicate is blocked",
  );
  assert.match(
    cleanupMutation,
    /ctx\.db\.patch\(project\._id, buildArchivePatch/,
    "cleanup mutation must patch duplicate rows through the archive patch",
  );
  assert.match(
    hygiene,
    /reconcileStaleDuplicateProjectRuntimeRuns(?::\s*any)? = action[\s\S]*assertStagingMaintenanceAllowed/,
    "stale runtime reconciliation must be a maintenance-gated staging action",
  );
  assert.match(
    hygiene,
    /const dryRun = args\.dryRun !== false[\s\S]*finishCloudRuntimeRunInternal/,
    "stale runtime reconciliation must default to dry-run and use the canonical runtime finalizer",
  );
  assert.match(
    hygiene,
    /STALE_RUNTIME_RUN_BLOCKER_MS = 15 \* 60 \* 1000/,
    "stale runtime reconciliation should use a conservative 15 minute default threshold",
  );
  assert.match(
    staleRunsScript,
    /const apply = hasFlag\("--apply"\)[\s\S]*const dryRun = !apply/,
    "stale runtime script must default to dry-run and require --apply for mutation",
  );
  assert.match(
    hygieneScript,
    /const apply = hasFlag\("--apply"\)[\s\S]*const dryRun = !apply/,
    "staging hygiene script must default to dry-run and require --apply for mutation",
  );
  assert.match(
    hygieneScript,
    /Number\(result\.blockedCount \?\? 0\) === 0/,
    "staging hygiene script must fail when cleanup blockers are present",
  );
  assert.match(
    smoke,
    /Number\(fingerprint\?\.project\?\.duplicateNameCount \?\? 0\) <= 1/,
    "staging smoke must fail if the canonical General project name drifts back to duplicates",
  );
  assert.match(
    packageJson,
    /"check:staging-project-hygiene-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/staging_project_hygiene_proof\.ts"/,
    "staging project hygiene proof must be wired into package scripts",
  );
  assert.match(
    packageJson,
    /"check:staging-project-hygiene-dry-run": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/staging_project_hygiene\.ts"/,
    "staging project hygiene dry-run must be wired into package scripts",
  );
  assert.match(
    packageJson,
    /"check:staging-project-hygiene-stale-runs-dry-run": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/staging_project_hygiene_stale_runs\.ts"/,
    "staging stale runtime dry-run must be wired into package scripts",
  );
  assert.match(
    packageJson,
    /"staging:reconcile-stale-project-runs": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/staging_project_hygiene_stale_runs\.ts --apply"/,
    "staging stale runtime apply command must be explicitly wired",
  );
  assert.match(
    packageJson,
    /"staging:cleanup-duplicate-projects": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/staging_project_hygiene\.ts --apply"/,
    "staging duplicate cleanup apply command must be explicitly wired",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
