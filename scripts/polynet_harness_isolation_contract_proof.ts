import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  NON_SANDBOX_TOOL_NAMES,
  SANDBOX_TOOL_NAMES,
} from "../shared/retrievalTools.ts";
import {
  DEFAULT_ACTIVE_RUNTIME_ENGINE,
  RUNTIME_ENGINE_CODEX,
  RUNTIME_ENGINE_POLYNET,
  normalizeActiveWorkspaceRuntimeEngine,
  normalizeRuntimeEngine,
} from "../shared/runtimeEngine.ts";
import {
  CODEX_COMPUTER_OPEN_URL_TOOL_NAME,
  CODEX_COMPUTER_SCREENSHOT_TOOL_NAME,
  CODEX_NATIVE_WORKSPACE_FORBIDDEN_TOOL_NAMES,
  CODEX_WORKSPACE_SERVE_TOOL_NAME,
  resolveCodexHarnessToolPolicy,
  resolvePolynetHarnessToolPolicy,
} from "../shared/harnessToolPolicy.ts";

const rootDir = process.cwd();

async function readRepoFile(relativePath: string): Promise<string> {
  return await readFile(path.join(rootDir, relativePath), "utf8");
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function proveRuntimeEngineBoundary() {
  assert.equal(DEFAULT_ACTIVE_RUNTIME_ENGINE, RUNTIME_ENGINE_CODEX);
  assert.equal(normalizeRuntimeEngine("polynet"), RUNTIME_ENGINE_POLYNET);
  assert.equal(normalizeRuntimeEngine("codex"), RUNTIME_ENGINE_CODEX);
  assert.equal(normalizeRuntimeEngine("unknown"), null);
  assert.equal(normalizeActiveWorkspaceRuntimeEngine("codex"), RUNTIME_ENGINE_CODEX);
  assert.equal(
    normalizeActiveWorkspaceRuntimeEngine("polynet"),
    RUNTIME_ENGINE_CODEX,
    "PolyNet agent-loop execution must not be an active workspace runtime",
  );
}

function provePolynetHarnessCannotExposeRuntimeSubstrateTools() {
  const policy = resolvePolynetHarnessToolPolicy({
    allowedToolNames: [...NON_SANDBOX_TOOL_NAMES, ...SANDBOX_TOOL_NAMES],
  });
  assert.equal(policy.harnessKind, "polynet");
  assert.deepEqual(
    sorted(policy.fixedRuntimeToolNames),
    sorted(NON_SANDBOX_TOOL_NAMES),
    "PolyNet harness should retain platform/community/web tools only",
  );
  for (const forbiddenToolName of SANDBOX_TOOL_NAMES) {
    assert.equal(
      policy.fixedRuntimeToolNames.includes(forbiddenToolName),
      false,
      `${forbiddenToolName} must not be exposed through the PolyNet harness`,
    );
  }
  assert.deepEqual(
    policy.runtimeCapabilities,
    [],
    "PolyNet harness should not advertise runtime substrate capabilities",
  );
}

function proveCodexHarnessOwnsWorkspaceRuntimeWithoutDuplicateShell() {
  const policy = resolveCodexHarnessToolPolicy({
    polynetPlatformToolProjection: {
      hasCommunity: true,
      communityResourceLane: {
        lane: "builder",
        can_read_live_resources: true,
        can_use_resource_builder: true,
      },
      canManageResources: true,
      canModerateCommunity: true,
      canManageCommunity: true,
    },
    workspaceServeAvailable: true,
    computerAdaptersAvailable: true,
  });
  assert.equal(policy.harnessKind, "codex");
  assert.equal(policy.workspaceAccess.mode, "native_codex");
  assert.equal(policy.workspaceAccess.nativeCodex, true);
  assert.equal(policy.workspaceAccess.duplicateShellTool, false);
  assert.equal(policy.workspaceAccess.shellTool, null);
  assert.deepEqual(
    sorted(policy.runtimeAdapterToolNames),
    sorted([
      CODEX_WORKSPACE_SERVE_TOOL_NAME,
      CODEX_COMPUTER_OPEN_URL_TOOL_NAME,
      CODEX_COMPUTER_SCREENSHOT_TOOL_NAME,
    ]),
  );
  assert(policy.runtimeCapabilities.some((capability) => capability.name === "workspace_files"));
  assert(policy.runtimeCapabilities.some((capability) => capability.name === "workspace_shell"));
  assert(policy.runtimeCapabilities.some((capability) => capability.name === "app_preview"));
  assert(policy.runtimeCapabilities.some((capability) => capability.name === "computer_use"));
  assert(policy.polynetPlatformToolNames.includes("search_product_docs"));
  assert(policy.polynetPlatformToolNames.includes("get_active_community_context"));
  assert(policy.polynetPlatformToolNames.includes("community_resource_builder_stage_changeset"));
  for (const forbiddenToolName of CODEX_NATIVE_WORKSPACE_FORBIDDEN_TOOL_NAMES) {
    assert.equal(
      policy.polynetPlatformToolNames.includes(forbiddenToolName as never),
      false,
      `${forbiddenToolName} must remain native to Codex, not bridged as a PolyNet platform tool`,
    );
  }
}

async function proveDaytonaRuntimeSubstrateIsIsolatedFromHarnessPolicy() {
  const targetStore = await readRepoFile("convex/daytonaCodexRuntimeTargets.ts");
  assert.equal(
    targetStore.includes("daytonaCodexRuntimeTargets") &&
      targetStore.includes("getActiveDaytonaCodexRuntimeSubstrateForThreadInternal") &&
      targetStore.includes("previewLeaseState") &&
      targetStore.includes("providerTeardownState"),
    true,
    "Daytona runtime target storage must be first-class operational substrate state",
  );

  const targetActions = await readRepoFile("convex/daytonaCodexRuntimeTargetActions.ts");
  assert.equal(
    targetActions.includes("DAYTONA_API_KEY") &&
      targetActions.includes("DAYTONA_JWT_TOKEN") &&
      targetActions.includes("POLYNET_CODEX_WORKER_AUTH_TOKEN") &&
      targetActions.includes("DAYTONA_CODEX_WORKSPACE_ROOT"),
    true,
    "Daytona runtime actions must own provider credentials, worker auth, and workspace setup",
  );
  assert.equal(
    targetActions.includes("sanitizeDaytonaRuntimeError") &&
      targetActions.includes("readFirstEnv") &&
      targetActions.includes("ensureDaytonaCodexRuntimeTargetInternal"),
    true,
    "Daytona runtime actions must sanitize provider errors and expose explicit target ensure lifecycle",
  );

  const runtimePolicy = await readRepoFile("shared/daytonaCodexRuntimePolicy.ts");
  assert.equal(
    runtimePolicy.includes('mode: "native_codex"') &&
      runtimePolicy.includes("duplicateShellTool: false") &&
      runtimePolicy.includes("publicPreview: false") &&
      runtimePolicy.includes("providerEphemeralByLifecycle"),
    true,
    "Daytona runtime policy must keep Codex native workspace access, no duplicate shell, private previews, and explicit lifecycle ephemerality",
  );

  const bridge = await readRepoFile("convex/polynetCodexWorkerBridge.ts");
  assert.equal(
    bridge.includes("POLYNET_CODEX_WORKER_RUNTIME_ENABLED") &&
      bridge.includes("DAYTONA_API_KEY") &&
      bridge.includes("DAYTONA_JWT_TOKEN") &&
      bridge.includes("target?.workerUrl") &&
      bridge.includes("WORKER_BUSY_RETRY_DELAYS_MS"),
    true,
    "Codex worker transport must remain feature-gated, Daytona-backed, and bounded",
  );
}

async function main() {
  proveRuntimeEngineBoundary();
  provePolynetHarnessCannotExposeRuntimeSubstrateTools();
  proveCodexHarnessOwnsWorkspaceRuntimeWithoutDuplicateShell();
  await proveDaytonaRuntimeSubstrateIsIsolatedFromHarnessPolicy();
  console.log("polynet_harness_isolation_contract_proof: ok");
}

void main();
