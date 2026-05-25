import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  resolveWorkspaceComputerProviderPolicy,
} from "../convex/workspaceComputerProviderPolicy.ts";

const rootDir = process.cwd();

async function readRepoFile(relativePath: string): Promise<string> {
  return await readFile(path.join(rootDir, relativePath), "utf8");
}

function assertIncludes(source: string, needle: string, message: string) {
  assert.ok(source.includes(needle), message);
}

function assertExcludes(source: string, needle: string, message: string) {
  assert.equal(source.includes(needle), false, message);
}

function proveProviderPolicyMatrix() {
  const cases = [
    {
      name: "default provider",
      input: {},
      providerId: "daytona",
      reason: "default_provider",
    },
    {
      name: "invalid provider falls back",
      input: { serverConfiguredProviderId: "bogus" },
      providerId: "daytona",
      reason: "server_configured_provider",
    },
    {
      name: "Blaxel disabled falls back",
      input: { serverConfiguredProviderId: "blaxel" },
      providerId: "daytona",
      reason: "blaxel_provider_not_enabled",
    },
    {
      name: "Blaxel enabled without deployment falls back",
      input: {
        serverConfiguredProviderId: "blaxel",
        blaxelEnabled: "true",
      },
      providerId: "daytona",
      reason: "blaxel_provider_staging_only",
    },
    {
      name: "Blaxel enabled in production falls back",
      input: {
        serverConfiguredProviderId: "blaxel",
        blaxelEnabled: "true",
        deploymentKind: "production",
      },
      providerId: "daytona",
      reason: "blaxel_provider_staging_only",
    },
    {
      name: "Blaxel enabled in development falls back",
      input: {
        serverConfiguredProviderId: "blaxel",
        blaxelEnabled: "true",
        deploymentKind: "development",
      },
      providerId: "daytona",
      reason: "blaxel_provider_staging_only",
    },
    {
      name: "Blaxel enabled in staging is selected",
      input: {
        serverConfiguredProviderId: "blaxel",
        blaxelEnabled: "true",
        deploymentKind: "staging",
      },
      providerId: "blaxel",
      reason: "server_configured_provider",
    },
  ] as const;

  for (const testCase of cases) {
    const decision = resolveWorkspaceComputerProviderPolicy(testCase.input);
    assert.equal(
      decision.providerId,
      testCase.providerId,
      `${testCase.name}: unexpected provider`,
    );
    assert.equal(
      decision.reason,
      testCase.reason,
      `${testCase.name}: unexpected reason`,
    );
  }
}

async function proveWorkspaceComputerProviderContract() {
  const sharedSource = await readRepoFile("shared/workspaceComputerProvider.ts");
  const policySource = await readRepoFile(
    "convex/workspaceComputerProviderPolicy.ts",
  );
  const blaxelStubSource = await readRepoFile(
    "convex/blaxelWorkspaceComputerProvider.ts",
  );
  const backgroundServiceSource = await readRepoFile(
    "convex/workspaceTerminalBackgroundService.ts",
  );
  const inspectorSource = await readRepoFile("convex/workspaceInspector.ts");
  const readinessGuardSource = await readRepoFile(
    "scripts/blaxel_staging_readiness_guard.sh",
  );
  const packageJson = JSON.parse(await readRepoFile("package.json"));

  assertIncludes(
    sharedSource,
    'WORKSPACE_COMPUTER_PROVIDER_IDS = ["daytona", "blaxel"]',
    "expected the provider contract to name Daytona and Blaxel explicitly",
  );
  assertIncludes(
    sharedSource,
    'DEFAULT_WORKSPACE_COMPUTER_PROVIDER_ID =\n  "daytona"',
    "expected Daytona to remain the default workspace computer provider",
  );
  for (const operation of [
    "ensureWorkspaceComputer",
    "resolveWorkspaceComputerIfReady",
    "releaseWorkspaceComputerIfIdle",
    "destroyWorkspaceComputer",
    "executeWorkspaceCommand",
    "listWorkspaceDirectory",
    "readWorkspaceFile",
    "writeWorkspaceFile",
    "getWorkspacePreviewUrl",
  ]) {
    assertIncludes(
      sharedSource,
      `"${operation}"`,
      `expected provider contract to include ${operation}`,
    );
  }

  assertIncludes(
    policySource,
    "serverConfiguredProviderId",
    "expected provider selection to be server-configured",
  );
  assertExcludes(
    policySource,
    "clientConfiguredProviderId",
    "provider selection must not accept client-configured provider ids",
  );
  assertIncludes(
    policySource,
    "POLYNET_WORKSPACE_COMPUTER_PROVIDER",
    "expected provider policy to read the server provider env",
  );
  assertIncludes(
    policySource,
    "POLYNET_ENABLE_BLAXEL_WORKSPACE_PROVIDER",
    "expected Blaxel to require an explicit server enable flag",
  );
  assertIncludes(
    policySource,
    'reason: "blaxel_provider_staging_only"',
    "expected non-staging policy to refuse Blaxel",
  );
  assertIncludes(
    policySource,
    'providerId: DEFAULT_WORKSPACE_COMPUTER_PROVIDER_ID',
    "expected refused Blaxel policy to fall back to Daytona",
  );

  assertIncludes(
    blaxelStubSource,
    'BLAXEL_WORKSPACE_PROVIDER_DISABLED_CODE =\n  "blaxel_provider_not_enabled"',
    "expected Blaxel provider to be disabled explicitly",
  );
  assertExcludes(
    blaxelStubSource,
    "@blaxel/core",
    "disabled Blaxel provider stub must not import the Blaxel SDK yet",
  );

  assertIncludes(
    backgroundServiceSource,
    "export async function ensureProjectBackgroundSandbox",
    "expected existing Daytona background sandbox entrypoint to remain exported",
  );
  assertIncludes(
    backgroundServiceSource,
    "createDaytonaSandbox",
    "expected Daytona sandbox creation to remain wired in the live background service",
  );
  assertIncludes(
    backgroundServiceSource,
    "deleteDaytonaSandbox",
    "expected Daytona cleanup to remain wired in the live background service",
  );
  assertExcludes(
    backgroundServiceSource,
    "blaxelWorkspaceComputerProvider",
    "this slice must not route live background sandbox behavior to Blaxel",
  );

  assertIncludes(
    inspectorSource,
    'import { DAYTONA_WORKSPACE_ROOT } from "./daytonaSandboxClient";',
    "expected right-panel inspection to stay on the Daytona workspace root in this slice",
  );
  assertIncludes(
    inspectorSource,
    'import { resolveProjectBackgroundSandboxIfReady } from "./workspaceTerminalBackgroundService";',
    "expected right-panel inspection to keep using the existing background sandbox resolver",
  );

  assertIncludes(
    readinessGuardSource,
    'EXPECTED_VERCEL_PROJECT_NAME="polynet-staging"',
    "expected Blaxel staging readiness guard to target the staging Vercel project",
  );
  assertIncludes(
    readinessGuardSource,
    'fail "refusing production Vercel project"',
    "expected readiness guard to refuse production Vercel",
  );
  assertIncludes(
    readinessGuardSource,
    'fail "refusing production Convex deployment"',
    "expected readiness guard to refuse production Convex",
  );

  assert.equal(
    packageJson.scripts["check:blaxel-staging-readiness"],
    "bash scripts/blaxel_staging_readiness_guard.sh",
    "expected package script for the Blaxel staging guard",
  );
  assert.equal(
    packageJson.scripts["probe:blaxel-workspace-lifecycle"],
    "bash scripts/run_blaxel_workspace_lifecycle_probe.sh",
    "expected package script for the Blaxel lifecycle probe",
  );
  assert.equal(
    packageJson.scripts["check:workspace-computer-provider-contract"],
    "node --experimental-strip-types --experimental-specifier-resolution=node scripts/workspace_computer_provider_contract_proof.ts",
    "expected package script for the workspace computer provider contract proof",
  );

  proveProviderPolicyMatrix();

  console.log("PASS workspace computer provider contract proof");
}

await proveWorkspaceComputerProviderContract();
