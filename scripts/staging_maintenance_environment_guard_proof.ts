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
  const stagingMaintenance = await readRepoFile("convex/stagingMaintenance.ts");
  const stagingLifecycleCanary = await readRepoFile(
    "convex/stagingDaytonaWorkspaceLifecycleCanary.ts",
  );
  const stagingCli = await readRepoFile("scripts/staging_maintenance_cli.ts");
  const packageJson = await readRepoFile("package.json");
  const allowBlock = sliceBetween(
    stagingMaintenance,
    "export function assertStagingMaintenanceAllowed",
    "function defaultExpectedCommunities",
  );

  assert.match(
    stagingMaintenance,
    /const STAGING_HOSTNAME = "polynet-staging\.vercel\.app"/,
    "staging maintenance should have one exact staging hostname allowlist",
  );
  assert.match(
    stagingMaintenance,
    /function readStagingHostname\(\)[\s\S]*ARX_PUBLIC_APP_URL[\s\S]*VITE_PUBLIC_APP_URL[\s\S]*new URL\(raw\)\.hostname\.toLowerCase\(\)/,
    "staging maintenance should derive environment from configured app URL host",
  );
  assert.match(
    allowBlock,
    /POLYNET_STAGING_MAINTENANCE_ENABLED[\s\S]*=== "true"[\s\S]*if \(!enabled\)[\s\S]*staging_maintenance_disabled/,
    "staging maintenance should require an explicit enable flag",
  );
  assert.match(
    allowBlock,
    /hostname !== STAGING_HOSTNAME[\s\S]*staging_maintenance_wrong_environment/,
    "staging maintenance should fail closed outside the staging hostname",
  );
  assert.match(
    allowBlock,
    /POLYNET_STAGING_MAINTENANCE_TOKEN[\s\S]*staging_maintenance_token_not_configured[\s\S]*staging_maintenance_token_invalid/,
    "staging maintenance should require the exact maintenance token",
  );
  assert.match(
    stagingLifecycleCanary,
    /assertStagingMaintenanceAllowed[\s\S]*runDaytonaWorkspaceLifecycleReleaseCanary/,
    "Daytona lifecycle release canary should use the canonical staging maintenance gate",
  );
  assert.match(
    stagingLifecycleCanary,
    /STAGING_LIFECYCLE_CANARY_PROJECT_NAME = "Lifecycle Canary"[\s\S]*requireLifecycleCanaryProjectName/,
    "Daytona lifecycle release canary should remain scoped to the dedicated canary project",
  );
  assert.match(
    stagingCli,
    /deploymentName:\s*readFlag\("--deployment-name"\) \?\? "quick-porcupine-949"/,
    "staging maintenance CLI should default to the staging Convex deployment",
  );
  assert.match(
    stagingCli,
    /stagingUrl:\s*readFlag\("--staging-url"\) \?\? "https:\/\/polynet-staging\.vercel\.app"/,
    "staging maintenance CLI should default to the staging web URL",
  );
  assert.match(
    packageJson,
    /"check:staging-maintenance-environment-guard": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/staging_maintenance_environment_guard_proof\.ts"/,
    "staging maintenance environment guard proof should be wired into package scripts",
  );

  console.log("staging_maintenance_environment_guard_proof: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
