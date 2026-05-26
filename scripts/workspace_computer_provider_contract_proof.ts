import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  blaxelSandboxLifecycleMatchesIntent,
  buildBlaxelWorkspacePathGuardCommand,
  normalizeBlaxelWorkspacePath,
  resolveBlaxelSandboxLifecyclePolicies,
  resolveBlaxelSandboxLifecycleIntent,
  resolveBlaxelSandboxLifecycleState,
  resolveBlaxelWorkspaceLifecyclePolicy,
  sanitizeBlaxelErrorDetails,
  shouldReplaceBlaxelSandboxForLifecycle,
  updateBlaxelWorkspaceSandboxLifecycle,
} from "../convex/blaxelWorkspaceClient.ts";
import {
  resolveWorkspaceComputerProviderPolicy,
} from "../convex/workspaceComputerProviderPolicy.ts";
import {
  WORKSPACE_COMPUTER_LIFECYCLE_POLICY,
  compareWorkspaceComputerLifecycleIntents,
  normalizeRecordedWorkspaceResourceProviderId,
  normalizeWorkspaceComputerLifecycleIntent,
  resolveRecordedWorkspaceResourceProviderId,
  resolveStrongestWorkspaceComputerLifecycleIntent,
} from "../shared/workspaceComputerProvider.ts";

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

function proveRecordedWorkspaceResourceProviderOwnership() {
  assert.equal(
    normalizeRecordedWorkspaceResourceProviderId("blaxel"),
    "blaxel",
    "expected explicit Blaxel provider ownership to normalize",
  );
  assert.equal(
    normalizeRecordedWorkspaceResourceProviderId("daytona"),
    "daytona",
    "expected explicit Daytona provider ownership to normalize",
  );
  assert.equal(
    normalizeRecordedWorkspaceResourceProviderId("bogus"),
    null,
    "expected invalid recorded provider ownership not to default",
  );
  assert.equal(
    resolveRecordedWorkspaceResourceProviderId({
      providerId: "blaxel",
      resourceId: "some-daytona-shaped-id",
    }),
    "blaxel",
    "expected explicit provider ownership to beat id shape",
  );
  assert.equal(
    resolveRecordedWorkspaceResourceProviderId({
      providerId: null,
      resourceId: "pn-p-project123",
    }),
    "blaxel",
    "expected legacy Blaxel project resource ids to be inferred centrally",
  );
  assert.equal(
    resolveRecordedWorkspaceResourceProviderId({
      providerId: null,
      resourceId: "daytona-resource-id",
    }),
    "daytona",
    "expected legacy non-Blaxel resource ids to remain Daytona-owned",
  );
  assert.equal(
    resolveRecordedWorkspaceResourceProviderId({
      providerId: null,
      resourceId: "",
    }),
    null,
    "expected missing project resource ids to have no provider owner",
  );
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

  const command = buildBlaxelWorkspacePathGuardCommand({
    workspaceRoot: "/workspace",
    path: "/workspace/link-to-etc-passwd",
    kind: "file",
  });
  assertIncludes(
    command,
    'if [ -L "$abs" ]; then printf symlink; exit 0; fi;',
    "expected Blaxel runtime path guard to reject symlink path components",
  );
  assertIncludes(
    command,
    'resolved="$( { realpath -- "$abs" 2>/dev/null || readlink -f -- "$abs" 2>/dev/null || true; } | sed -n "1p" )";',
    "expected Blaxel runtime path guard to resolve paths inside the sandbox",
  );
  assertIncludes(
    command,
    'case "$resolved" in "$resolved_root"|"$resolved_root"/*) ;; *) printf outside; exit 0;; esac;',
    "expected Blaxel runtime path guard to fail closed outside the workspace root",
  );
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

function proveWorkspaceComputerLifecyclePolicy() {
  assert.equal(
    normalizeWorkspaceComputerLifecycleIntent("file_inspection"),
    "file_inspection",
    "expected file inspection lifecycle intent to normalize",
  );
  assert.equal(
    normalizeWorkspaceComputerLifecycleIntent("agent_run"),
    "agent_run",
    "expected agent run lifecycle intent to normalize",
  );
  assert.equal(
    normalizeWorkspaceComputerLifecycleIntent("bogus"),
    "interactive",
    "expected unknown lifecycle intent to fall back to interactive",
  );
  assert.equal(
    compareWorkspaceComputerLifecycleIntents("agent_run", "file_inspection") > 0,
    true,
    "expected agent lifecycle intent to rank above file inspection",
  );
  assert.equal(
    compareWorkspaceComputerLifecycleIntents("file_inspection", "agent_run") < 0,
    true,
    "expected file inspection lifecycle intent to rank below agent runs",
  );
  assert.equal(
    resolveStrongestWorkspaceComputerLifecycleIntent([
      "file_inspection",
      "agent_run",
      "interactive",
    ]),
    "agent_run",
    "expected strongest lifecycle intent helper to choose the highest-cost active intent",
  );
  assert.equal(
    resolveStrongestWorkspaceComputerLifecycleIntent([]),
    null,
    "expected strongest lifecycle intent helper to distinguish missing observations from interactive fallback",
  );
  assert.equal(
    WORKSPACE_COMPUTER_LIFECYCLE_POLICY.file_inspection.idleDeleteAfter,
    "5m",
    "expected file inspection to use a five-minute idle window",
  );
  assert.equal(
    WORKSPACE_COMPUTER_LIFECYCLE_POLICY.interactive.idleDeleteAfter,
    "30m",
    "expected normal interactive work to use a thirty-minute idle window",
  );
  assert.equal(
    WORKSPACE_COMPUTER_LIFECYCLE_POLICY.interactive.maxAgeDeleteAfter,
    "1h",
    "expected non-agent workspace computers to use a one-hour max age",
  );
  assert.equal(
    WORKSPACE_COMPUTER_LIFECYCLE_POLICY.agent_run.maxAgeDeleteAfter,
    null,
    "active agent runs must not receive an unconditional provider max-age kill switch",
  );
  assert.equal(
    WORKSPACE_COMPUTER_LIFECYCLE_POLICY.agent_run.allowActiveRunPastMaxAge,
    true,
    "expected agent work to be allowed past the non-agent max age while active",
  );

  const config = {
    fileInspectionIdleDeleteAfter: "5m",
    interactiveIdleDeleteAfter: "30m",
    nonAgentMaxAgeDeleteAfter: "1h",
  };
  const filePolicy = resolveBlaxelWorkspaceLifecyclePolicy({
    lifecycleIntent: "file_inspection",
    config,
  });
  assert.deepEqual(
    filePolicy.expirationPolicies,
    [
      { type: "ttl-idle", value: "5m", action: "delete" },
      { type: "ttl-max-age", value: "1h", action: "delete" },
    ],
    "expected file inspection Blaxel policy to be cheap and bounded",
  );

  const interactivePolicy = resolveBlaxelWorkspaceLifecyclePolicy({
    lifecycleIntent: "interactive",
    config,
  });
  assert.deepEqual(
    interactivePolicy.expirationPolicies,
    [
      { type: "ttl-idle", value: "30m", action: "delete" },
      { type: "ttl-max-age", value: "1h", action: "delete" },
    ],
    "expected interactive Blaxel policy to idle at thirty minutes and max at one hour",
  );

  const agentPolicy = resolveBlaxelWorkspaceLifecyclePolicy({
    lifecycleIntent: "agent_run",
    config,
  });
  assert.deepEqual(
    agentPolicy.expirationPolicies,
    [{ type: "ttl-idle", value: "30m", action: "delete" }],
    "expected agent Blaxel policy to omit ttl-max-age while the run is active",
  );
  assert.equal(
    agentPolicy.allowActiveRunPastMaxAge,
    true,
    "expected resolved agent lifecycle policy to preserve active run allowance",
  );

  assert.equal(
    resolveBlaxelSandboxLifecycleIntent({
      metadata: { labels: { lifecycle_intent: "file_inspection" } },
    }),
    "file_inspection",
    "expected Blaxel sandbox lifecycle intent to read metadata labels",
  );
  assert.equal(
    resolveBlaxelSandboxLifecycleIntent({
      labels: { lifecycle_intent: "agent_run" },
    }),
    "agent_run",
    "expected Blaxel sandbox lifecycle intent to read direct labels",
  );
  assert.equal(
    resolveBlaxelSandboxLifecycleIntent({ metadata: { labels: {} } }),
    "interactive",
    "expected missing Blaxel lifecycle labels to fall back to interactive",
  );
  const fileInspectionSandbox = {
    metadata: { labels: { lifecycle_intent: "file_inspection" } },
    spec: {
      lifecycle: {
        expirationPolicies: filePolicy.expirationPolicies,
      },
    },
  };
  assert.deepEqual(
    resolveBlaxelSandboxLifecyclePolicies(fileInspectionSandbox),
    filePolicy.expirationPolicies,
    "expected Blaxel sandbox lifecycle policies to be readable from provider spec",
  );
  assert.equal(
    blaxelSandboxLifecycleMatchesIntent({
      sandbox: fileInspectionSandbox,
      lifecycleIntent: "file_inspection",
      config,
    }),
    true,
    "expected a labeled file-inspection sandbox to match its provider lifecycle",
  );
  assert.equal(
    blaxelSandboxLifecycleMatchesIntent({
      sandbox: {
        metadata: { labels: { lifecycle_intent: "file_inspection" } },
        spec: {
          lifecycle: {
            expirationPolicies: [
              ...filePolicy.expirationPolicies,
              { type: "date", value: "2099-01-01T00:00:00Z", action: "delete" },
            ],
          },
        },
      },
      lifecycleIntent: "file_inspection",
      config,
    }),
    false,
    "expected unexpected provider expiration policies to force lifecycle repair",
  );
  const unlabeledFileInspectionState = resolveBlaxelSandboxLifecycleState({
    sandbox: {
      metadata: { labels: {} },
      spec: {
        lifecycle: {
          expirationPolicies: filePolicy.expirationPolicies,
        },
      },
    },
    config,
  });
  assert.equal(
    unlabeledFileInspectionState.inferredIntent,
    "file_inspection",
    "expected lifecycle state to infer intent from provider policies when labels are missing",
  );
  assert.equal(
    unlabeledFileInspectionState.effectiveIntent,
    "file_inspection",
    "expected inferred lifecycle intent to prevent accidental downgrade/upgrade decisions",
  );
  assert.equal(
    unlabeledFileInspectionState.labelMatchesEffectiveIntent,
    false,
    "expected missing lifecycle labels to be repaired even when provider policy is correct",
  );
  const staleFileLabelAgentPolicyState = resolveBlaxelSandboxLifecycleState({
    sandbox: {
      metadata: { labels: { lifecycle_intent: "file_inspection" } },
      spec: {
        lifecycle: {
          expirationPolicies: agentPolicy.expirationPolicies,
        },
      },
    },
    config,
  });
  assert.equal(
    staleFileLabelAgentPolicyState.labelIntent,
    "file_inspection",
    "expected stale lifecycle label to remain observable",
  );
  assert.equal(
    staleFileLabelAgentPolicyState.inferredIntent,
    "agent_run",
    "expected lifecycle state to infer stronger agent intent from provider policy",
  );
  assert.equal(
    staleFileLabelAgentPolicyState.effectiveIntent,
    "agent_run",
    "expected strongest observed lifecycle fact to prevent stale label downgrades",
  );
  assert.equal(
    staleFileLabelAgentPolicyState.policyMatchesEffectiveIntent,
    true,
    "expected agent provider policy to match the stronger effective intent",
  );
  assert.equal(
    staleFileLabelAgentPolicyState.labelMatchesEffectiveIntent,
    false,
    "expected stale lifecycle labels to be repaired after provider policy wins",
  );
  assert.equal(
    shouldReplaceBlaxelSandboxForLifecycle({
      currentIntent: "file_inspection",
      requestedIntent: "agent_run",
    }),
    true,
    "expected agent work to replace a file-inspection sandbox",
  );
  assert.equal(
    shouldReplaceBlaxelSandboxForLifecycle({
      currentIntent: "interactive",
      requestedIntent: "agent_run",
    }),
    true,
    "expected agent work to require a stronger lifecycle than an interactive sandbox",
  );
  assert.equal(
    shouldReplaceBlaxelSandboxForLifecycle({
      currentIntent: "agent_run",
      requestedIntent: "file_inspection",
    }),
    false,
    "expected file inspection to reuse a stronger active agent sandbox",
  );
  assert.equal(
    shouldReplaceBlaxelSandboxForLifecycle({
      currentIntent: "interactive",
      requestedIntent: "file_inspection",
    }),
    false,
    "expected file inspection not to downgrade an interactive sandbox",
  );
}

async function proveBlaxelLifecycleUpdateHelper() {
  const config = {
    fileInspectionIdleDeleteAfter: "5m",
    interactiveIdleDeleteAfter: "30m",
    nonAgentMaxAgeDeleteAfter: "1h",
  };
  const calls: string[] = [];
  let observedLifecycle: unknown = null;
  let observedMetadata: unknown = null;
  const fakeSandboxInstance = {
    async updateLifecycle(
      sandboxName: string,
      lifecycle: { expirationPolicies: unknown[] },
    ) {
      calls.push(`updateLifecycle:${sandboxName}`);
      observedLifecycle = lifecycle;
      return {
        metadata: {
          labels: {
            existing: "preserved",
            lifecycle_intent: "file_inspection",
          },
        },
        spec: { lifecycle },
      };
    },
    async updateMetadata(sandboxName: string, metadata: unknown) {
      calls.push(`updateMetadata:${sandboxName}`);
      observedMetadata = metadata;
      return {
        metadata,
        spec: { lifecycle: observedLifecycle },
      };
    },
  };

  await updateBlaxelWorkspaceSandboxLifecycle({
    SandboxInstance: fakeSandboxInstance,
    sandboxName: "pn-p-example",
    lifecycleIntent: "agent_run",
    config,
    labels: { purpose: "contract-proof" },
  });

  assert.deepEqual(
    calls,
    ["updateLifecycle:pn-p-example", "updateMetadata:pn-p-example"],
    "expected lifecycle upgrades to update provider lifecycle before metadata",
  );
  assert.deepEqual(
    observedLifecycle,
    {
      expirationPolicies: [{ type: "ttl-idle", value: "30m", action: "delete" }],
    },
    "expected agent lifecycle update to omit ttl-max-age",
  );
  assert.deepEqual(
    observedMetadata,
    {
      labels: {
        existing: "preserved",
        lifecycle_intent: "agent_run",
        purpose: "contract-proof",
        owner: "polynet",
        provider: "blaxel",
      },
    },
    "expected lifecycle metadata update to preserve labels and write authoritative intent",
  );
}

async function proveWorkspaceComputerProviderContract() {
  const schemaSource = await readRepoFile("convex/schema.ts");
  const projectsSource = await readRepoFile("convex/projects.ts");
  const sharedSource = await readRepoFile("shared/workspaceComputerProvider.ts");
  const policySource = await readRepoFile(
    "convex/workspaceComputerProviderPolicy.ts",
  );
  const blaxelStubSource = await readRepoFile(
    "convex/blaxelWorkspaceComputerProvider.ts",
  );
  const blaxelClientSource = await readRepoFile("convex/blaxelWorkspaceClient.ts");
  const blaxelProjectNamesSource = await readRepoFile(
    "convex/blaxelWorkspaceProjectNames.ts",
  );
  const blaxelInspectorDiagnosticsSource = await readRepoFile(
    "convex/blaxelWorkspaceInspectorDiagnostics.ts",
  );
  const blaxelDiagnosticsSource = await readRepoFile(
    "convex/blaxelWorkspaceDiagnostics.ts",
  );
  const blaxelSandboxSmokeActionSource = await readRepoFile(
    "convex/blaxelWorkspaceSandboxSmoke.ts",
  );
  const blaxelVolumeSmokeActionSource = await readRepoFile(
    "convex/blaxelWorkspaceVolumeSmoke.ts",
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
  const convexVolumeSmokeSource = await readRepoFile(
    "scripts/blaxel_convex_volume_smoke.ts",
  );
  const inspectorDiagnosticScriptSource = await readRepoFile(
    "scripts/blaxel_workspace_inspector_diagnostic.ts",
  );
  const inspectorDiagnosticRunnerSource = await readRepoFile(
    "scripts/run_blaxel_workspace_inspector_diagnostic.sh",
  );
  const backgroundServiceSource = await readRepoFile(
    "convex/workspaceTerminalBackgroundService.ts",
  );
  const workspaceTerminalsSource = await readRepoFile("convex/workspaceTerminals.ts");
  const inspectorSource = await readRepoFile("convex/workspaceInspector.ts");
  const runtimeSessionSource = await readRepoFile(
    "convex/workspaceRuntimeSession.ts",
  );
  const runtimeToolsSource = await readRepoFile(
    "convex/workspaceRuntimeTools.ts",
  );
  const executionSessionSource = await readRepoFile(
    "convex/runtimeExecutionSession.ts",
  );
  const httpDaytonaSource = await readRepoFile("convex/httpDaytona.ts");
  const workspacePanelSource = await readRepoFile(
    "apps/web/src/components/WebWorkspaceUserDataPanel.tsx",
  );
  const readinessGuardSource = await readRepoFile(
    "scripts/blaxel_staging_readiness_guard.sh",
  );
  const contractDocSource = await readRepoFile(
    "docs/workspace-computer-provider-contract.md",
  );
  const packageJson = JSON.parse(await readRepoFile("package.json"));

  assertIncludes(
    sharedSource,
    'WORKSPACE_COMPUTER_PROVIDER_IDS = ["daytona", "blaxel"]',
    "expected the provider contract to name Daytona and Blaxel explicitly",
  );
  assertIncludes(
    schemaSource,
    "providerSandboxProviderId",
    "expected cloudProjects to persist sandbox provider ownership",
  );
  assertIncludes(
    schemaSource,
    "providerVolumeProviderId",
    "expected cloudProjects to persist volume provider ownership",
  );
  assertIncludes(
    projectsSource,
    "providerVolumeProviderId: args.providerId",
    "expected project volume attachment to write provider ownership",
  );
  assertIncludes(
    projectsSource,
    'existingVolumeProviderId !== "daytona"',
    "expected Daytona volume creation to reject non-Daytona project volume ids",
  );
  assertIncludes(
    sharedSource,
    'resourceId.startsWith("pn-p-") ? "blaxel" : "daytona"',
    "expected legacy Blaxel project resource ids to be inferred only by the shared provider ownership helper",
  );
  for (const [sourceName, source] of [
    ["projects", projectsSource],
    ["workspace terminals", workspaceTerminalsSource],
    ["background service", backgroundServiceSource],
  ] as const) {
    assertIncludes(
      source,
      "resolveRecordedWorkspaceResourceProviderId",
      `expected ${sourceName} to use the shared provider ownership helper`,
    );
    assertExcludes(
      source,
      "function recordedWorkspaceResourceProviderId",
      `expected ${sourceName} not to duplicate provider ownership inference`,
    );
  }
  assertIncludes(
    projectsSource,
    "destroyBlaxelWorkspaceVolume",
    "expected project deletion to dispatch Blaxel volume cleanup by provider owner",
  );
  assertIncludes(
    projectsSource,
    "destroyBlaxelWorkspaceSandbox",
    "expected project deletion to dispatch Blaxel sandbox cleanup by provider owner",
  );
  assertIncludes(
    blaxelClientSource,
    "destroyBlaxelWorkspaceVolume",
    "expected Blaxel client to expose volume cleanup for project deletion",
  );
  assertIncludes(
    workspaceTerminalsSource,
    "providerSandboxProviderId: args.providerSandboxProviderId",
    "expected project sandbox setter to write provider ownership",
  );
  assertIncludes(
    workspaceTerminalsSource,
    "clearSandboxAccounting",
    "expected project sandbox setter to clear stale accounting when ownership changes",
  );
  assertIncludes(
    backgroundServiceSource,
    "workspace_computer_provider_mismatch",
    "expected Daytona background service to fail closed on non-Daytona project resources",
  );
  assertIncludes(
    sharedSource,
    'DEFAULT_WORKSPACE_COMPUTER_PROVIDER_ID =\n  "daytona"',
    "expected Daytona to remain the default workspace computer provider",
  );
  assertIncludes(
    sharedSource,
    'WORKSPACE_COMPUTER_LIFECYCLE_INTENTS = [\n  "file_inspection",\n  "interactive",\n  "agent_run"',
    "expected provider contract to expose explicit workspace lifecycle intents",
  );
  assertIncludes(
    sharedSource,
    'file_inspection: {\n    idleDeleteAfter: "5m"',
    "expected file inspection lifecycle policy to use five-minute idle cleanup",
  );
  assertIncludes(
    sharedSource,
    'interactive: {\n    idleDeleteAfter: "30m"',
    "expected interactive lifecycle policy to use thirty-minute idle cleanup",
  );
  assertIncludes(
    sharedSource,
    'maxAgeDeleteAfter: "1h"',
    "expected non-agent lifecycle policy to use one-hour max age",
  );
  assertIncludes(
    sharedSource,
    'agent_run: {\n    idleDeleteAfter: "30m",\n    maxAgeDeleteAfter: null',
    "expected agent lifecycle policy to omit unconditional max-age cleanup",
  );
  assertIncludes(
    sharedSource,
    "resolveStrongestWorkspaceComputerLifecycleIntent",
    "expected provider contract to expose strongest-observed lifecycle intent resolution",
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
    "buildBlaxelWorkspacePathGuardCommand",
    "expected Blaxel client to build a runtime path guard for provider file operations",
  );
  assertIncludes(
    blaxelClientSource,
    "resolveGuardedBlaxelWorkspacePath",
    "expected Blaxel client to resolve paths inside the sandbox before provider file operations",
  );
  assertIncludes(
    blaxelClientSource,
    "workspace_symlink_not_supported",
    "expected Blaxel client to reject workspace symlinks before provider file operations",
  );
  assertIncludes(
    blaxelClientSource,
    'kind: "writable_file"',
    "expected Blaxel writes to use the guarded writable-file path mode",
  );
  assertIncludes(
    blaxelClientSource,
    "sanitizeBlaxelErrorDetails",
    "expected Blaxel client to expose a safe provider error sanitizer",
  );
  assertIncludes(
    blaxelClientSource,
    "resolveBlaxelWorkspaceLifecyclePolicy",
    "expected Blaxel client to resolve provider lifecycle from explicit intent",
  );
  assertIncludes(
    blaxelClientSource,
    "resolveBlaxelSandboxLifecycleIntent",
    "expected Blaxel client to read existing sandbox lifecycle intent from provider labels",
  );
  assertIncludes(
    blaxelClientSource,
    "shouldReplaceBlaxelSandboxForLifecycle",
    "expected Blaxel client to expose the stronger-intent-wins replacement guard",
  );
  assertIncludes(
    blaxelClientSource,
    "resolveBlaxelSandboxLifecycleState",
    "expected Blaxel client to resolve existing lifecycle from labels and provider policy",
  );
  assertIncludes(
    blaxelClientSource,
    "updateBlaxelWorkspaceSandboxLifecycle",
    "expected Blaxel client to expose a provider lifecycle update helper",
  );
  assertIncludes(
    blaxelClientSource,
    "inspectBlaxelWorkspaceSandbox",
    "expected Blaxel client to expose a read-only sandbox inspection primitive",
  );
  assertIncludes(
    blaxelClientSource,
    'mode: "provider_standby"',
    "expected Blaxel release to acknowledge provider standby instead of deleting the sandbox",
  );
  assertIncludes(
    blaxelClientSource,
    'exists: false,\n        state: "missing",\n        missingReason: "not_found"',
    "expected Blaxel sandbox inspection to classify definitely missing sandboxes without treating them as provider failures",
  );
  assertIncludes(
    blaxelStubSource,
    "inspectBlaxelWorkspaceComputer",
    "expected Blaxel provider wrapper to expose sandbox inspection behind server policy",
  );
  assertIncludes(
    blaxelClientSource,
    "await params.SandboxInstance.updateLifecycle",
    "expected Blaxel lifecycle update helper to call updateLifecycle",
  );
  assertIncludes(
    blaxelClientSource,
    "await params.SandboxInstance.updateMetadata",
    "expected Blaxel lifecycle update helper to repair metadata after updateLifecycle",
  );
  assert.ok(
    blaxelClientSource.indexOf("await params.SandboxInstance.updateLifecycle") <
      blaxelClientSource.indexOf("await params.SandboxInstance.updateMetadata"),
    "expected Blaxel lifecycle update helper to update lifecycle before metadata",
  );
  assertIncludes(
    blaxelClientSource,
    "await SandboxInstance.get(sandboxName)",
    "expected Blaxel ensure to inspect an existing sandbox before createIfNotExists",
  );
  assert.ok(
    blaxelClientSource.indexOf("await SandboxInstance.get(sandboxName)") <
      blaxelClientSource.indexOf("SandboxInstance.createIfNotExists"),
    "expected Blaxel ensure to inspect and optionally replace before createIfNotExists",
  );
  assertIncludes(
    blaxelClientSource,
    "await SandboxInstance.delete(sandboxName)",
    "expected Blaxel ensure to preserve a delete/recreate fallback from the same volume",
  );
  assertIncludes(
    blaxelClientSource,
    "BLAXEL_WORKSPACE_FILE_INSPECTION_IDLE_DELETE_AFTER",
    "expected Blaxel client to allow file inspection idle policy override",
  );
  assertIncludes(
    blaxelClientSource,
    "BLAXEL_WORKSPACE_INTERACTIVE_IDLE_DELETE_AFTER",
    "expected Blaxel client to allow interactive idle policy override",
  );
  assertIncludes(
    blaxelClientSource,
    "BLAXEL_WORKSPACE_NON_AGENT_MAX_AGE_DELETE_AFTER",
    "expected Blaxel client to allow non-agent max-age policy override",
  );
  assertExcludes(
    blaxelClientSource,
    "BLAXEL_WORKSPACE_IDLE_DELETE_AFTER",
    "Blaxel lifecycle policy should not inherit the old generic idle env across all intents",
  );
  assertExcludes(
    blaxelClientSource,
    "BLAXEL_WORKSPACE_MAX_AGE_DELETE_AFTER",
    "Blaxel lifecycle policy should not inherit the old generic max-age env across all intents",
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
  assertIncludes(
    providerSmokeSource,
    "symlinkReadRejected",
    "expected provider smoke to prove symlink reads are rejected",
  );
  assertIncludes(
    providerSmokeSource,
    "symlinkWriteRejected",
    "expected provider smoke to prove symlink writes are rejected",
  );
  assertIncludes(
    providerSmokeSource,
    "symlinkListRejected",
    "expected provider smoke to prove symlink directory listing is rejected",
  );
  assertIncludes(
    providerSmokeSource,
    "symlinkCwdRejected",
    "expected provider smoke to prove symlink cwd execution is rejected",
  );
  assertExcludes(
    providerSmokeSource,
    "JSON.stringify(error)",
    "provider smoke must not stringify raw provider error objects",
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
    blaxelVolumeSmokeActionSource,
    '"use node";',
    "expected Blaxel Convex volume smoke to be isolated in a Node action",
  );
  assertIncludes(
    blaxelVolumeSmokeActionSource,
    "export const smokeBlaxelConvexVolume = action({",
    "expected a Blaxel Convex volume smoke action",
  );
  assertIncludes(
    blaxelVolumeSmokeActionSource,
    "blaxel_convex_volume_smoke_staging_only",
    "expected volume smoke action to fail closed outside staging",
  );
  assertIncludes(
    blaxelVolumeSmokeActionSource,
    "const volumeName = \"polynet-blaxel-convex-volume-smoke\"",
    "expected volume smoke to use one stable reusable test volume",
  );
  assertIncludes(
    blaxelVolumeSmokeActionSource,
    "volumeName,",
    "expected volume smoke action to intentionally attach a volume",
  );
  assertIncludes(
    blaxelVolumeSmokeActionSource,
    "const VOLUME_SMOKE_SIZE_MB = 2048",
    "expected volume smoke action to request Blaxel volume sizes in MB",
  );
  assertIncludes(
    blaxelVolumeSmokeActionSource,
    "volumeSizeMb: VOLUME_SMOKE_SIZE_MB",
    "expected volume smoke action to pass MB volume size through the provider wrapper",
  );
  assertIncludes(
    blaxelVolumeSmokeActionSource,
    "COLD_ATTACH_RETRY_TIMEOUT_MS = 90_000",
    "expected volume smoke action to use bounded retry for cold volume attachment",
  );
  assertIncludes(
    blaxelVolumeSmokeActionSource,
    "isTransientVolumeAttachFailure",
    "expected volume smoke action to retry transient volume attach failures",
  );
  const lifecycleProbeSource = await readRepoFile(
    "scripts/blaxel_workspace_lifecycle_probe.ts",
  );
  const lifecycleUpgradeProbeSource = await readRepoFile(
    "scripts/blaxel_workspace_lifecycle_upgrade_probe.ts",
  );
  const lifecycleUpgradeProbeRunnerSource = await readRepoFile(
    "scripts/run_blaxel_workspace_lifecycle_upgrade_probe.sh",
  );
  assertIncludes(
    lifecycleProbeSource,
    "volumeSizeMb: number",
    "expected lifecycle probe config to name Blaxel volume size units as MB",
  );
  assertIncludes(
    lifecycleProbeSource,
    'readIntEnv("BLAXEL_WORKSPACE_PROBE_VOLUME_SIZE_MB", 0)',
    "expected lifecycle probe to prefer MB volume size env",
  );
  assertIncludes(
    lifecycleProbeSource,
    'readIntEnv("BLAXEL_WORKSPACE_PROBE_VOLUME_SIZE_GB", 0)',
    "expected lifecycle probe to keep legacy GB env compatibility",
  );
  assertIncludes(
    lifecycleProbeSource,
    "legacyGb * 1024",
    "expected lifecycle probe to convert legacy GB env to MB",
  );
  assertIncludes(
    lifecycleProbeSource,
    "size: result.config.volumeSizeMb",
    "expected lifecycle probe to pass MB volume size to Blaxel",
  );
  assertExcludes(
    lifecycleProbeSource,
    "JSON.stringify(error)",
    "lifecycle probe must not stringify raw provider error objects",
  );
  assertIncludes(
    lifecycleUpgradeProbeSource,
    "SandboxInstance.updateLifecycle",
    "expected lifecycle upgrade probe to call Blaxel updateLifecycle",
  );
  assertIncludes(
    lifecycleUpgradeProbeSource,
    "SandboxInstance.updateMetadata",
    "expected lifecycle upgrade probe to repair lifecycle metadata",
  );
  assertIncludes(
    lifecycleUpgradeProbeSource,
    "agentPolicyHasNoMaxAge",
    "expected lifecycle upgrade probe to verify active agent policy omits max age",
  );
  assertIncludes(
    lifecycleUpgradeProbeSource,
    "processSurvivedAgentUpgrade",
    "expected lifecycle upgrade probe to verify process continuity across upgrade",
  );
  assertIncludes(
    lifecycleUpgradeProbeSource,
    "interactivePolicyHasMaxAge",
    "expected lifecycle upgrade probe to verify interactive policy restores max age",
  );
  assertExcludes(
    lifecycleUpgradeProbeSource,
    "JSON.stringify(error)",
    "lifecycle upgrade probe must not stringify raw provider error objects",
  );
  assertIncludes(
    lifecycleUpgradeProbeRunnerSource,
    ".env.blaxel.local",
    "expected lifecycle upgrade probe runner to load local Blaxel credentials",
  );
  for (const requiredWrapper of [
    "ensureBlaxelWorkspaceComputer",
    "writeBlaxelWorkspaceFile",
    "readBlaxelWorkspaceFile",
    "listBlaxelWorkspaceDirectory",
    "destroyBlaxelWorkspaceComputer",
  ]) {
    assertIncludes(
      blaxelVolumeSmokeActionSource,
      requiredWrapper,
      `expected volume smoke action to use provider wrapper ${requiredWrapper}`,
    );
  }
  assertIncludes(
    blaxelVolumeSmokeActionSource,
    "} finally {",
    "expected volume smoke action to clean up sandboxes in finally",
  );
  assertIncludes(
    blaxelVolumeSmokeActionSource,
    "blaxel_volume_quota_exceeded",
    "expected volume smoke action to preserve the known volume quota blocker",
  );
  assertIncludes(
    blaxelVolumeSmokeActionSource,
    "stable_volume_retained_for_reuse",
    "expected volume smoke action to make retained test volume behavior explicit",
  );
  assert.ok(
    blaxelVolumeSmokeActionSource.indexOf('if (deploymentKind !== "staging")') <
      blaxelVolumeSmokeActionSource.indexOf(
        "const policy = resolveWorkspaceComputerProviderFromServerEnv()",
      ),
    "expected volume smoke action to gate non-staging before reading provider policy",
  );
  for (const forbidden of [
    "VolumeInstance",
    "SandboxInstance",
    "await import(\"@blaxel/core\")",
    "createIfNotExists",
    "JSON.stringify(error)",
    ".stack",
    "BL_WORKSPACE",
    "BL_API_KEY",
  ]) {
    assertExcludes(
      blaxelVolumeSmokeActionSource,
      forbidden,
      `volume smoke action must stay wrapper-based and secret-safe: ${forbidden}`,
    );
  }
  assertIncludes(
    convexVolumeSmokeSource,
    "EXPECTED_CONVEX_DEPLOYMENT = \"quick-porcupine-949\"",
    "expected Convex volume smoke to target staging Convex explicitly",
  );
  assertIncludes(
    convexVolumeSmokeSource,
    "blaxelWorkspaceVolumeSmoke:smokeBlaxelConvexVolume",
    "expected Convex volume smoke to call the volume smoke action",
  );
  assertIncludes(
    convexVolumeSmokeSource,
    "ACCEPTABLE_BLOCKING_CODE = \"blaxel_volume_quota_exceeded\"",
    "expected Convex volume smoke to make the current quota blocker explicit",
  );
  assertIncludes(
    convexVolumeSmokeSource,
    "stable_volume_retained_for_reuse",
    "expected Convex volume smoke to verify reusable volume retention on success",
  );
  assertIncludes(
    convexVolumeSmokeSource,
    "hot_cleanup_not_confirmed",
    "expected Convex volume smoke to fail if hot sandbox cleanup is not confirmed",
  );
  assertIncludes(
    convexVolumeSmokeSource,
    "cold_cleanup_not_confirmed",
    "expected Convex volume smoke to fail if cold sandbox cleanup is not confirmed",
  );
  assertIncludes(
    convexVolumeSmokeSource,
    "--push",
    "expected Convex volume smoke to push the smoke action to staging before running",
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
    runtimeSessionSource,
    "resolveWorkspaceComputerProviderFromServerEnv",
    "expected runtime workspace session creation to use server-owned provider policy",
  );
  assertIncludes(
    runtimeSessionSource,
    "ensureProjectBackgroundSandbox",
    "expected runtime workspace session creation to preserve the Daytona provider path",
  );
  assertIncludes(
    runtimeSessionSource,
    "ensureBlaxelWorkspaceComputer",
    "expected runtime workspace session creation to use the Blaxel provider wrapper",
  );
  assertIncludes(
    runtimeSessionSource,
    "buildBlaxelProjectWorkspaceNames",
    "expected runtime workspace sessions to use stable project Blaxel names",
  );
  assertIncludes(
    runtimeSessionSource,
    'lifecycleIntent: "agent_run"',
    "expected agent workspace tools to upgrade/reuse Blaxel sandboxes with agent-run lifecycle",
  );
  assertIncludes(
    runtimeSessionSource,
    'providerId: "blaxel"',
    "expected Blaxel runtime workspace sessions to carry provider identity",
  );
  assertIncludes(
    runtimeSessionSource,
    'providerId: "daytona"',
    "expected Daytona runtime workspace sessions to carry provider identity",
  );
  assertIncludes(
    runtimeSessionSource,
    'providerId: "blaxel"',
    "expected Blaxel runtime session to record provider ownership",
  );
  assertIncludes(
    runtimeSessionSource,
    'providerSandboxProviderId: "blaxel"',
    "expected Blaxel runtime session to record sandbox provider ownership",
  );
  assertIncludes(
    runtimeSessionSource,
    "workspace_computer_provider_mismatch",
    "expected runtime workspace session creation to fail closed on provider ownership mismatches",
  );
  assertIncludes(
    runtimeToolsSource,
    "executeRuntimeWorkspaceTool",
    "expected a provider-neutral runtime workspace tool executor",
  );
  assertIncludes(
    runtimeToolsSource,
    'params.session.providerId === "blaxel"',
    "expected runtime workspace tools to dispatch Blaxel by session provider",
  );
  assertIncludes(
    runtimeToolsSource,
    "executeDaytonaRuntimeWorkspaceTool",
    "expected runtime workspace tools to preserve Daytona tool behavior behind the provider branch",
  );
  for (const wrapper of [
    "executeBlaxelWorkspaceCommand",
    "readBlaxelWorkspaceFile",
    "writeBlaxelWorkspaceFile",
  ]) {
    assertIncludes(
      runtimeToolsSource,
      wrapper,
      `expected Blaxel runtime workspace tools to use provider wrapper ${wrapper}`,
    );
  }
  assertIncludes(
    runtimeToolsSource,
    "mkdir -p --",
    "expected Blaxel write tool to create parent directories for generated apps",
  );
  assertIncludes(
    runtimeToolsSource,
    "write_verification_failed",
    "expected Blaxel write tool to verify writes",
  );
  assertIncludes(
    executionSessionSource,
    "createProjectRuntimeWorkspaceSession",
    "expected runtime execution session to create provider-neutral workspace sessions",
  );
  const createWorkspaceSessionSource = executionSessionSource.slice(
    executionSessionSource.indexOf("async createWorkspaceSession"),
    executionSessionSource.indexOf("async ensureWorkspaceForTool"),
  );
  assertIncludes(
    createWorkspaceSessionSource,
    "createProjectRuntimeWorkspaceSession",
    "expected createWorkspaceSession to avoid calling the Daytona-only background service directly",
  );
  assertExcludes(
    createWorkspaceSessionSource,
    "ensureProjectBackgroundSandbox",
    "expected createWorkspaceSession not to route all workspace tools through Daytona",
  );
  assertIncludes(
    createWorkspaceSessionSource,
    "provider_id: workspaceSession.providerId",
    "expected workspace session events to include provider identity",
  );
  const workspaceToolBranchSource = httpDaytonaSource.slice(
    httpDaytonaSource.indexOf('params.toolName === "list_dir"'),
    httpDaytonaSource.indexOf('return {\n    status: "error",', httpDaytonaSource.indexOf('params.toolName === "list_dir"')),
  );
  assertIncludes(
    workspaceToolBranchSource,
    "executeRuntimeWorkspaceTool",
    "expected chat workspace tool calls to execute through the provider-neutral workspace tool executor",
  );
  assertExcludes(
    workspaceToolBranchSource,
    "listDaytonaWorkspaceDirectory({",
    "expected chat workspace tool branch not to call Daytona list directly",
  );

  assertIncludes(
    inspectorSource,
    'import { DAYTONA_WORKSPACE_ROOT } from "./daytonaSandboxClient";',
    "expected right-panel inspection to preserve the Daytona workspace root for Daytona paths",
  );
  assertIncludes(
    inspectorSource,
    'import { resolveProjectBackgroundSandboxIfReady } from "./workspaceTerminalBackgroundService";',
    "expected right-panel inspection to keep using the existing Daytona background sandbox resolver",
  );
  assertIncludes(
    inspectorSource,
    "resolveWorkspaceComputerProviderFromServerEnv",
    "expected right-panel inspection provider selection to be server-owned",
  );
  assertIncludes(
    inspectorSource,
    'if (resolveWorkspaceComputerProviderFromServerEnv().providerId === "blaxel")',
    "expected right-panel directory listing to route to Blaxel only through server policy",
  );
  assertIncludes(
    inspectorSource,
    "ensureBlaxelWorkspaceComputer",
    "expected right-panel Blaxel listing to create or reuse a workspace computer through the provider wrapper",
  );
  assertIncludes(
    inspectorSource,
    "inspectBlaxelWorkspaceComputer",
    "expected right-panel Blaxel listing to inspect existing project sandbox truth before creating",
  );
  assertIncludes(
    inspectorSource,
    "clearBlaxelInspectorWorkspaceState",
    "expected right-panel Blaxel listing to clear stale matching sandbox ids",
  );
  assertIncludes(
    inspectorSource,
    "runWithBlaxelInspectorWorkspace",
    "expected right-panel Blaxel Files operations to share stale sandbox reconciliation",
  );
  assertIncludes(
    inspectorSource,
    'code !== "blaxel_request_failed"',
    "expected stale Blaxel detection to tolerate provider request wrappers",
  );
  assertIncludes(
    inspectorSource,
    'code !== "workspace_inspector_unavailable"',
    "expected stale Blaxel detection to tolerate inspector-wrapped provider failures",
  );
  assertIncludes(
    inspectorSource,
    "\\b404\\b",
    "expected stale Blaxel detection to recognize provider 404 evidence",
  );
  assertIncludes(
    inspectorSource,
    "providerSandboxId: params.sandboxName",
    "expected stale Blaxel cleanup to clear only the matching project sandbox id",
  );
  const clearBlaxelInspectorWorkspaceSource = inspectorSource.slice(
    inspectorSource.indexOf("async function clearBlaxelInspectorWorkspaceState"),
    inspectorSource.indexOf("async function runWithBlaxelInspectorWorkspace"),
  );
  assertExcludes(
    clearBlaxelInspectorWorkspaceSource,
    "providerVolumeId",
    "expected stale Blaxel sandbox cleanup to preserve the durable project volume pointer",
  );
  const runWithBlaxelInspectorWorkspaceSource = inspectorSource.slice(
    inspectorSource.indexOf("async function runWithBlaxelInspectorWorkspace"),
    inspectorSource.indexOf("function mapFailure"),
  );
  assertIncludes(
    runWithBlaxelInspectorWorkspaceSource,
    "sandboxName: names.sandboxName",
    "expected stale Blaxel cleanup during ensure to clear only the deterministic project sandbox",
  );
  assertIncludes(
    runWithBlaxelInspectorWorkspaceSource,
    "sandboxName: workspace.sandboxName",
    "expected stale Blaxel cleanup during file operations to clear only the active matching sandbox",
  );
  assertIncludes(
    runWithBlaxelInspectorWorkspaceSource,
    "blaxel_workspace_recreate_failed",
    "expected stale Blaxel retry exhaustion to return a provider-neutral Files failure",
  );
  const listBlaxelInspectorDirectorySource = inspectorSource.slice(
    inspectorSource.indexOf("async function listBlaxelInspectorDirectory"),
    inspectorSource.indexOf("async function readBlaxelInspectorFilePreview"),
  );
  assertIncludes(
    listBlaxelInspectorDirectorySource,
    "runWithBlaxelInspectorWorkspace",
    "expected Blaxel directory listing to retry through the shared stale sandbox wrapper",
  );
  const readBlaxelInspectorFilePreviewSource = inspectorSource.slice(
    inspectorSource.indexOf("async function readBlaxelInspectorFilePreview"),
    inspectorSource.indexOf("function parseDirectoryEntries"),
  );
  assertIncludes(
    readBlaxelInspectorFilePreviewSource,
    "runWithBlaxelInspectorWorkspace",
    "expected Blaxel file preview to retry through the shared stale sandbox wrapper",
  );
  assertIncludes(
    workspacePanelSource,
    'result.code === "blaxel_sandbox_not_found"',
    "expected Files UI to avoid exposing raw Blaxel sandbox-not-found provider text",
  );
  assertIncludes(
    workspacePanelSource,
    "Workspace is waking up. Try again in a moment.",
    "expected Files UI to show provider-neutral wakeup copy for Blaxel stale sandbox failures",
  );
  assertIncludes(
    inspectorSource,
    'providerId: "blaxel"',
    "expected Blaxel inspector volume state to record Blaxel provider ownership",
  );
  assertIncludes(
    inspectorSource,
    'providerSandboxProviderId: "blaxel"',
    "expected Blaxel inspector sandbox state to record Blaxel provider ownership",
  );
  assertIncludes(
    inspectorSource,
    "clearSandboxAccounting: true",
    "expected Blaxel inspector sandbox state to clear stale Daytona accounting fields",
  );
  assertIncludes(
    inspectorSource,
    "recordBlaxelInspectorWorkspaceState",
    "expected right-panel Blaxel listing to record sandbox and volume truth on the project",
  );
  assertIncludes(
    inspectorSource,
    "validateBlaxelInspectorWorkspaceOwnership",
    "expected right-panel Blaxel listing to validate provider ownership before creating Blaxel resources",
  );
  assertIncludes(
    inspectorSource,
    "workspace_provider_transition_required",
    "expected right-panel Blaxel listing to reject implicit Daytona-to-Blaxel transitions",
  );
  const ensureBlaxelInspectorWorkspaceSource = inspectorSource.slice(
    inspectorSource.indexOf("async function ensureBlaxelInspectorWorkspace"),
  );
  assert.ok(
    ensureBlaxelInspectorWorkspaceSource.indexOf("const ownership = await validateBlaxelInspectorWorkspaceOwnership") <
      ensureBlaxelInspectorWorkspaceSource.indexOf("const ensured = await ensureBlaxelWorkspaceComputer"),
    "expected Blaxel Files provider ownership guard to run before provider ensure creates resources",
  );
  assertIncludes(
    inspectorSource,
    "attachCloudProjectVolumeInternal",
    "expected right-panel Blaxel listing to preserve the project volume id separately from the sandbox id",
  );
  assertIncludes(
    inspectorSource,
    "attempt < 2",
    "expected right-panel Blaxel listing to retry once after a stale sandbox expires",
  );
  assertIncludes(
    inspectorSource,
    'lifecycleIntent: "file_inspection"',
    "expected right-panel Blaxel listing to use the cheap file-inspection lifecycle intent",
  );
  assertIncludes(
    contractDocSource,
    "Stale Sandbox Reconciliation",
    "expected the provider contract to document stale Blaxel sandbox reconciliation",
  );
  assertIncludes(
    contractDocSource,
    "Before routing\n`agent_run` through an existing Blaxel project computer",
    "expected the contract to call out existing-sandbox lifecycle upgrade risk before agent routing",
  );
  assertIncludes(
    contractDocSource,
    "weaker existing intent: update lifecycle in place, then repair metadata",
    "expected the contract to prefer Blaxel lifecycle update over sandbox replacement",
  );
  assertIncludes(
    contractDocSource,
    "provider update failure: delete and recreate from the same volume as fallback",
    "expected the contract to preserve delete/recreate fallback after update failure",
  );
  assertIncludes(
    inspectorSource,
    "listBlaxelWorkspaceDirectory",
    "expected right-panel Blaxel listing to list through the provider wrapper",
  );
  assertIncludes(
    inspectorSource,
    "readBlaxelWorkspaceFile",
    "expected right-panel Blaxel preview to read through the provider wrapper",
  );
  assertIncludes(
    inspectorSource,
    "buildBlaxelProjectWorkspaceNames",
    "expected right-panel Blaxel listing to derive stable project workspace names",
  );
  assertIncludes(
    blaxelProjectNamesSource,
    "sandboxName: `pn-p-${resourcePart}`",
    "expected shared Blaxel project helper to keep sandbox names inside Blaxel metadata name limits",
  );
  assertIncludes(
    blaxelProjectNamesSource,
    "volumeName: `pn-p-${resourcePart}-v`",
    "expected shared Blaxel project helper to keep volume names inside Blaxel metadata name limits",
  );
  assertIncludes(
    blaxelInspectorDiagnosticsSource,
    "diagnoseBlaxelWorkspaceInspectorProject",
    "expected a Blaxel workspace inspector diagnostic action",
  );
  assertIncludes(
    blaxelInspectorDiagnosticsSource,
    "blaxel_workspace_inspector_diagnostic_staging_only",
    "expected Blaxel workspace inspector diagnostics to be staging-only",
  );
  assertIncludes(
    blaxelInspectorDiagnosticsSource,
    "blaxel_workspace_inspector_diagnostic_auth_subject_required",
    "expected Blaxel workspace inspector diagnostics to require auth subject for real Files listing",
  );
  assertIncludes(
    blaxelInspectorDiagnosticsSource,
    "providerVolumeProviderId",
    "expected Blaxel workspace inspector diagnostics to report volume provider ownership",
  );
  assertIncludes(
    blaxelInspectorDiagnosticsSource,
    "providerSandboxProviderId",
    "expected Blaxel workspace inspector diagnostics to report sandbox provider ownership",
  );
  assertIncludes(
    blaxelInspectorDiagnosticsSource,
    "buildBlaxelProjectWorkspaceNames",
    "expected diagnostics to use the same Blaxel project naming helper as the Files panel",
  );
  assertIncludes(
    blaxelInspectorDiagnosticsSource,
    "inspectBlaxelWorkspaceComputer",
    "expected diagnostics to inspect provider sandbox truth",
  );
  assertIncludes(
    blaxelInspectorDiagnosticsSource,
    'projectSandboxOwner === "blaxel"',
    "expected diagnostics to inspect sandbox truth only for Blaxel-owned project sandboxes",
  );
  assertIncludes(
    blaxelInspectorDiagnosticsSource,
    "workspace_provider_mismatch",
    "expected diagnostics to report provider mismatch instead of inspecting Daytona ids through Blaxel",
  );
  assertIncludes(
    blaxelInspectorDiagnosticsSource,
    "api.workspaceInspector.listWorkspaceDirectory",
    "expected diagnostics to call the real workspaceInspector.listWorkspaceDirectory path",
  );
  assertIncludes(
    inspectorDiagnosticScriptSource,
    "blaxelWorkspaceInspectorDiagnostics:diagnoseBlaxelWorkspaceInspectorProject",
    "expected local diagnostic script to call the Convex inspector diagnostic action",
  );
  assertIncludes(
    inspectorDiagnosticScriptSource,
    "auth_subject_required_for_list_diagnostic",
    "expected local diagnostic script to require auth subject for real list diagnostics",
  );
  assertIncludes(
    inspectorDiagnosticScriptSource,
    "project_volume_provider_not_blaxel_after_list",
    "expected local diagnostic script to validate Blaxel volume ownership after listing",
  );
  assertIncludes(
    inspectorDiagnosticScriptSource,
    "workspace_inspector_list_not_ok",
    "expected local diagnostic script to fail when the real inspector list path fails",
  );
  assertIncludes(
    inspectorDiagnosticRunnerSource,
    "blaxel_staging_readiness_guard.sh",
    "expected local diagnostic runner to verify staging safety before calling Convex",
  );
  assertIncludes(
    inspectorSource,
    "readBlaxelInspectorFilePreview",
    "expected right-panel Blaxel preview to have an isolated preview helper",
  );
  assertIncludes(
    inspectorSource,
    "parentWorkspacePath(params.relPath)",
    "expected right-panel Blaxel preview to inspect target metadata through the parent directory",
  );
  assertIncludes(
    inspectorSource,
    "File size is unavailable, so this file is not previewed.",
    "expected right-panel Blaxel preview to fail closed when file size is unavailable",
  );
  assertIncludes(
    inspectorSource,
    "sizeBytes > TEXT_PREVIEW_MAX_BYTES",
    "expected right-panel Blaxel preview to avoid reading oversized text files",
  );
  assertIncludes(
    inspectorSource,
    "Image preview is not available for Blaxel workspaces yet.",
    "expected right-panel Blaxel preview to leave image preview unsupported until binary reads are explicit",
  );
  assertIncludes(
    inspectorSource,
    "isLikelyBinaryText",
    "expected right-panel Blaxel preview to reject binary-looking text",
  );
  assertIncludes(
    inspectorSource,
    "return await readBlaxelInspectorFilePreview({",
    "expected readWorkspaceFilePreview to route to Blaxel only through server policy",
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
    packageJson.scripts["probe:blaxel-workspace-lifecycle-upgrade"],
    "bash scripts/run_blaxel_workspace_lifecycle_upgrade_probe.sh",
    "expected package script for the Blaxel lifecycle upgrade probe",
  );
  assert.equal(
    packageJson.scripts["diagnose:blaxel-workspace-inspector"],
    "bash scripts/run_blaxel_workspace_inspector_diagnostic.sh",
    "expected package script for the Blaxel workspace inspector diagnostic",
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
  assert.equal(
    packageJson.scripts["smoke:blaxel-convex-volume"],
    "bash scripts/run_blaxel_convex_volume_smoke.sh",
    "expected package script for the Blaxel Convex volume smoke",
  );

  proveProviderPolicyMatrix();
  proveRecordedWorkspaceResourceProviderOwnership();
  proveWorkspaceComputerLifecyclePolicy();
  await proveBlaxelLifecycleUpdateHelper();
  proveBlaxelWorkspacePathGuard();
  proveBlaxelErrorSanitizer();

  console.log("PASS workspace computer provider contract proof");
}

await proveWorkspaceComputerProviderContract();
