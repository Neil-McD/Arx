import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  normalizeBlaxelWorkspacePath,
  sanitizeBlaxelErrorDetails,
} from "../convex/blaxelWorkspaceClient.ts";
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

function proveBlaxelWorkspacePathGuard() {
  const acceptedCases = [
    { raw: ".", expected: "/workspace" },
    { raw: "src/App.tsx", expected: "/workspace/src/App.tsx" },
    { raw: "/workspace/src/App.tsx", expected: "/workspace/src/App.tsx" },
    { raw: "nested/./file.txt", expected: "/workspace/nested/file.txt" },
    { raw: "", expected: "/workspace" },
  ];
  for (const testCase of acceptedCases) {
    assert.equal(
      normalizeBlaxelWorkspacePath(testCase.raw),
      testCase.expected,
      `expected Blaxel path guard to accept ${JSON.stringify(testCase.raw)}`,
    );
  }

  for (const raw of ["..", "../secret", "src/../../secret", "/etc/passwd", "/tmp/foo", "a\0b"]) {
    assert.throws(
      () => normalizeBlaxelWorkspacePath(raw),
      /workspace_path_outside_root/,
      `expected Blaxel path guard to reject ${JSON.stringify(raw)}`,
    );
  }
}

function proveBlaxelErrorSanitizer() {
  const details = sanitizeBlaxelErrorDetails({
    name: "ProviderError",
    message: "Quota exceeded: 0/0 volumes",
    config: {
      headers: {
        Authorization: "Bearer should-not-leak",
      },
      apiKey: "should-not-leak",
    },
    response: {
      status: 429,
      headers: {
        authorization: "Bearer should-not-leak",
      },
      data: {
        code: "quota_exceeded",
        error: "Quota exceeded: 0/0 volumes",
        apiKey: "should-not-leak",
      },
    },
  });
  assert.equal(details.errorName, "ProviderError");
  assert.equal(details.errorMessage, "Quota exceeded: 0/0 volumes");
  assert.equal(details.responseStatus, 429);
  assert.equal(details.providerCode, "quota_exceeded");
  const serialized = JSON.stringify(details);
  for (const forbidden of [
    "should-not-leak",
    "Authorization",
    "authorization",
    "headers",
    "apiKey",
    "config",
  ]) {
    assert.equal(
      serialized.includes(forbidden),
      false,
      `expected sanitized Blaxel error details not to include ${forbidden}`,
    );
  }

  const sensitiveErrorDetails = sanitizeBlaxelErrorDetails(
    new Error("Authorization: Bearer should-not-leak apiKey=should-not-leak"),
  );
  const sensitiveSerialized = JSON.stringify(sensitiveErrorDetails);
  assert.equal(
    sensitiveSerialized.includes("should-not-leak"),
    false,
    "expected sanitized Error messages not to include secret-like values",
  );
  assert.equal(
    sensitiveSerialized.includes("Authorization"),
    false,
    "expected sanitized Error messages not to include authorization details",
  );
}

async function proveWorkspaceComputerProviderContract() {
  const sharedSource = await readRepoFile("shared/workspaceComputerProvider.ts");
  const policySource = await readRepoFile(
    "convex/workspaceComputerProviderPolicy.ts",
  );
  const blaxelStubSource = await readRepoFile(
    "convex/blaxelWorkspaceComputerProvider.ts",
  );
  const blaxelClientSource = await readRepoFile("convex/blaxelWorkspaceClient.ts");
  const blaxelDiagnosticsSource = await readRepoFile(
    "convex/blaxelWorkspaceDiagnostics.ts",
  );
  const blaxelSandboxSmokeActionSource = await readRepoFile(
    "convex/blaxelWorkspaceSandboxSmoke.ts",
  );
  const providerSmokeSource = await readRepoFile(
    "scripts/blaxel_workspace_provider_smoke.ts",
  );
  const convexRuntimeProbeSource = await readRepoFile(
    "scripts/blaxel_convex_runtime_probe.ts",
  );
  const convexSandboxSmokeSource = await readRepoFile(
    "scripts/blaxel_convex_sandbox_smoke.ts",
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
  assertIncludes(
    blaxelStubSource,
    "resolveWorkspaceComputerProviderFromServerEnv",
    "expected Blaxel provider calls to be gated by server-owned provider policy",
  );
  assertExcludes(
    blaxelStubSource,
    "policyInput",
    "provider calls must not accept caller-supplied provider policy input",
  );
  assertIncludes(
    blaxelClientSource,
    'await import("@blaxel/core")',
    "expected Blaxel SDK loading to stay isolated to the Blaxel client wrapper",
  );
  assertIncludes(
    blaxelClientSource,
    "blaxel_credentials_missing",
    "expected Blaxel client to normalize missing credentials",
  );
  assertIncludes(
    blaxelClientSource,
    "blaxel_volume_quota_exceeded",
    "expected Blaxel client to normalize volume quota failures",
  );
  assertIncludes(
    blaxelClientSource,
    "normalizeBlaxelWorkspacePath",
    "expected Blaxel client to expose a workspace path guard",
  );
  assertIncludes(
    blaxelClientSource,
    "sanitizeBlaxelErrorDetails",
    "expected Blaxel client to expose a safe provider error sanitizer",
  );
  assertExcludes(
    blaxelClientSource,
    "JSON.stringify(error)",
    "Blaxel client must not stringify raw provider error objects",
  );
  assertIncludes(
    providerSmokeSource,
    "ensureBlaxelWorkspaceComputer",
    "expected provider smoke to exercise the Blaxel provider wrapper",
  );
  const providerSmokeRunnerSource = await readRepoFile(
    "scripts/run_blaxel_workspace_provider_smoke.sh",
  );
  assertIncludes(
    providerSmokeRunnerSource,
    "POLYNET_WORKSPACE_COMPUTER_PROVIDER",
    "expected provider smoke runner to enable Blaxel through server env",
  );
  assertIncludes(
    providerSmokeRunnerSource,
    "POLYNET_DEPLOYMENT_KIND",
    "expected provider smoke runner to set staging deployment kind through server env",
  );
  assertIncludes(
    blaxelDiagnosticsSource,
    '"use node";',
    "expected Blaxel Convex runtime diagnostics to be isolated in a Node action",
  );
  assertIncludes(
    blaxelDiagnosticsSource,
    "export const diagnoseBlaxelConvexRuntime = action({",
    "expected a Blaxel Convex runtime diagnostic action",
  );
  assertIncludes(
    blaxelDiagnosticsSource,
    "resolveWorkspaceComputerProviderFromServerEnv",
    "expected diagnostic action to report the server-owned provider policy",
  );
  assertIncludes(
    blaxelDiagnosticsSource,
    "blaxel_diagnostic_staging_only",
    "expected diagnostic action to fail closed outside staging",
  );
  assertIncludes(
    blaxelDiagnosticsSource,
    'readEnv("POLYNET_DEPLOYMENT_KIND")',
    "expected diagnostic action to use server deployment kind",
  );
  assertIncludes(
    blaxelDiagnosticsSource,
    'await import("@blaxel/core")',
    "expected diagnostic action to prove the Blaxel SDK imports inside Convex",
  );
  assertIncludes(
    blaxelDiagnosticsSource,
    "SandboxInstance",
    "expected diagnostic action to verify SandboxInstance export shape",
  );
  assertIncludes(
    blaxelDiagnosticsSource,
    "VolumeInstance",
    "expected diagnostic action to verify VolumeInstance export shape",
  );
  assert.ok(
    blaxelDiagnosticsSource.indexOf('if (deploymentKind !== "staging")') <
      blaxelDiagnosticsSource.indexOf(
        "const policy = resolveWorkspaceComputerProviderFromServerEnv()",
      ),
    "expected diagnostic action to gate non-staging before reading provider policy",
  );
  assert.ok(
    blaxelDiagnosticsSource.indexOf('if (deploymentKind !== "staging")') <
      blaxelDiagnosticsSource.indexOf('readEnv("BL_WORKSPACE")'),
    "expected diagnostic action to gate non-staging before reading Blaxel env",
  );
  assertIncludes(
    blaxelDiagnosticsSource,
    "blWorkspacePresent",
    "expected diagnostic action to report only BL_WORKSPACE presence",
  );
  assertIncludes(
    blaxelDiagnosticsSource,
    "blApiKeyPresent",
    "expected diagnostic action to report only BL_API_KEY presence",
  );
  for (const forbidden of [
    "SandboxInstance.create",
    "SandboxInstance.createIfNotExists",
    "VolumeInstance.create",
    "VolumeInstance.createIfNotExists",
    ".process.",
    ".fs.",
    ".delete(",
    "JSON.stringify(error)",
    ".stack",
  ]) {
    assertExcludes(
      blaxelDiagnosticsSource,
      forbidden,
      `diagnostic action must not create/delete sandboxes, execute tools, or leak raw errors: ${forbidden}`,
    );
  }
  for (const forbidden of [
    "workspace: readEnv",
    "apiKey: readEnv",
    "BL_WORKSPACE: readEnv",
    "BL_API_KEY: readEnv",
  ]) {
    assertExcludes(
      blaxelDiagnosticsSource,
      forbidden,
      `diagnostic action must not return raw provider env values: ${forbidden}`,
    );
  }
  assertIncludes(
    convexRuntimeProbeSource,
    "EXPECTED_CONVEX_DEPLOYMENT = \"quick-porcupine-949\"",
    "expected Convex runtime probe to target staging Convex explicitly",
  );
  assertIncludes(
    convexRuntimeProbeSource,
    "blaxelWorkspaceDiagnostics:diagnoseBlaxelConvexRuntime",
    "expected Convex runtime probe to call the diagnostic action",
  );
  assertIncludes(
    convexRuntimeProbeSource,
    "--deployment-name",
    "expected Convex runtime probe to pass the staging deployment explicitly",
  );
  assertIncludes(
    convexRuntimeProbeSource,
    "--push",
    "expected Convex runtime probe to push the diagnostic action to staging before running",
  );
  assertIncludes(
    convexRuntimeProbeSource,
    "remote_bl_api_key_missing",
    "expected Convex runtime probe to fail if staging Convex lacks Blaxel API key env",
  );
  assertIncludes(
    blaxelSandboxSmokeActionSource,
    '"use node";',
    "expected Blaxel Convex sandbox smoke to be isolated in a Node action",
  );
  assertIncludes(
    blaxelSandboxSmokeActionSource,
    "export const smokeBlaxelConvexSandbox = action({",
    "expected a Blaxel Convex sandbox smoke action",
  );
  assertIncludes(
    blaxelSandboxSmokeActionSource,
    "blaxel_convex_sandbox_smoke_staging_only",
    "expected sandbox smoke action to fail closed outside staging",
  );
  assertIncludes(
    blaxelSandboxSmokeActionSource,
    "ensureBlaxelWorkspaceComputer",
    "expected sandbox smoke action to create through the provider wrapper",
  );
  assertIncludes(
    blaxelSandboxSmokeActionSource,
    "writeBlaxelWorkspaceFile",
    "expected sandbox smoke action to write through the provider wrapper",
  );
  assertIncludes(
    blaxelSandboxSmokeActionSource,
    "readBlaxelWorkspaceFile",
    "expected sandbox smoke action to read through the provider wrapper",
  );
  assertIncludes(
    blaxelSandboxSmokeActionSource,
    "executeBlaxelWorkspaceCommand",
    "expected sandbox smoke action to execute through the provider wrapper",
  );
  assertIncludes(
    blaxelSandboxSmokeActionSource,
    "listBlaxelWorkspaceDirectory",
    "expected sandbox smoke action to list through the provider wrapper",
  );
  assertIncludes(
    blaxelSandboxSmokeActionSource,
    "destroyBlaxelWorkspaceComputer",
    "expected sandbox smoke action to destroy through the provider wrapper",
  );
  assertIncludes(
    blaxelSandboxSmokeActionSource,
    "} finally {",
    "expected sandbox smoke action to clean up in finally",
  );
  assert.ok(
    blaxelSandboxSmokeActionSource.indexOf('if (deploymentKind !== "staging")') <
      blaxelSandboxSmokeActionSource.indexOf(
        "const policy = resolveWorkspaceComputerProviderFromServerEnv()",
      ),
    "expected sandbox smoke action to gate non-staging before reading provider policy",
  );
  for (const forbidden of [
    "VolumeInstance",
    "volumeName",
    "volumes",
    "createIfNotExists",
    "await import(\"@blaxel/core\")",
    "SandboxInstance",
    "JSON.stringify(error)",
    ".stack",
    "BL_WORKSPACE",
    "BL_API_KEY",
  ]) {
    assertExcludes(
      blaxelSandboxSmokeActionSource,
      forbidden,
      `sandbox smoke action must stay volume-free, wrapper-based, and secret-safe: ${forbidden}`,
    );
  }
  assertIncludes(
    convexSandboxSmokeSource,
    "EXPECTED_CONVEX_DEPLOYMENT = \"quick-porcupine-949\"",
    "expected Convex sandbox smoke to target staging Convex explicitly",
  );
  assertIncludes(
    convexSandboxSmokeSource,
    "blaxelWorkspaceSandboxSmoke:smokeBlaxelConvexSandbox",
    "expected Convex sandbox smoke to call the smoke action",
  );
  assertIncludes(
    convexSandboxSmokeSource,
    "--deployment-name",
    "expected Convex sandbox smoke to pass the staging deployment explicitly",
  );
  assertIncludes(
    convexSandboxSmokeSource,
    "--push",
    "expected Convex sandbox smoke to push the smoke action to staging before running",
  );
  assertIncludes(
    convexSandboxSmokeSource,
    "cleanup_not_confirmed",
    "expected Convex sandbox smoke to fail if cleanup is not confirmed",
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
  assert.equal(
    packageJson.scripts["smoke:blaxel-workspace-provider"],
    "bash scripts/run_blaxel_workspace_provider_smoke.sh",
    "expected package script for the Blaxel provider smoke",
  );
  assert.equal(
    packageJson.scripts["probe:blaxel-convex-runtime"],
    "bash scripts/run_blaxel_convex_runtime_probe.sh",
    "expected package script for the Blaxel Convex runtime probe",
  );
  assert.equal(
    packageJson.scripts["smoke:blaxel-convex-sandbox"],
    "bash scripts/run_blaxel_convex_sandbox_smoke.sh",
    "expected package script for the Blaxel Convex sandbox smoke",
  );

  proveProviderPolicyMatrix();
  proveBlaxelWorkspacePathGuard();
  proveBlaxelErrorSanitizer();

  console.log("PASS workspace computer provider contract proof");
}

await proveWorkspaceComputerProviderContract();
