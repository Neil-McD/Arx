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

async function proveReleaseDidNotPortRuntimeSubstrate() {
  const forbiddenPaths = [
    "convex/daytonaCodexRuntimeTargets.ts",
    "services/polynet-codex-worker/src/index.ts",
  ];
  for (const relativePath of forbiddenPaths) {
    try {
      await readRepoFile(relativePath);
      assert.fail(`${relativePath} should not be part of the runtime-boundary release slice`);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "ENOENT") throw error;
    }
  }
  const bridge = await readRepoFile("convex/polynetCodexWorkerBridge.ts");
  assert.equal(
    bridge.includes("Daytona") || bridge.includes("daytona"),
    false,
    "Codex worker bridge boundary must stay substrate-neutral in this slice",
  );
  assert.equal(
    bridge.includes("fetch("),
    false,
    "Codex worker bridge boundary must not add network transport before the transport slice",
  );
}

async function main() {
  proveRuntimeEngineBoundary();
  provePolynetHarnessCannotExposeRuntimeSubstrateTools();
  proveCodexHarnessOwnsWorkspaceRuntimeWithoutDuplicateShell();
  await proveReleaseDidNotPortRuntimeSubstrate();
  console.log("polynet_harness_isolation_contract_proof: ok");
}

void main();
