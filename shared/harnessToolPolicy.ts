import type { RetrievalToolName } from "./retrievalTools.ts";
import {
  buildPolynetPlatformToolNames,
  buildPolynetPlatformToolSpecs,
  type PolynetPlatformToolProjectionParams,
  type PolynetPlatformToolSpec,
} from "./polynetPlatformToolSurface.ts";

export type RuntimeHarnessKind = "polynet" | "codex";

export type PolynetHarnessToolPolicy = {
  harnessKind: "polynet";
  fixedRuntimeToolNames: RetrievalToolName[];
};

export type CodexWorkspaceToolAccessMode = "native_codex";

export const CODEX_WORKSPACE_SERVE_TOOL_NAME = "workspace_serve" as const;
export const CODEX_COMPUTER_OPEN_URL_TOOL_NAME = "computer_open_url" as const;
export const CODEX_COMPUTER_SCREENSHOT_TOOL_NAME = "computer_screenshot" as const;

export const CODEX_RUNTIME_ADAPTER_TOOL_NAMES = [
  CODEX_WORKSPACE_SERVE_TOOL_NAME,
  CODEX_COMPUTER_OPEN_URL_TOOL_NAME,
  CODEX_COMPUTER_SCREENSHOT_TOOL_NAME,
] as const;

export type CodexRuntimeAdapterToolName =
  (typeof CODEX_RUNTIME_ADAPTER_TOOL_NAMES)[number];

export type CodexHarnessToolPolicy = {
  harnessKind: "codex";
  workspaceAccess: {
    mode: CodexWorkspaceToolAccessMode;
    nativeCodex: boolean;
    duplicateShellTool: boolean;
    shellTool: null;
  };
  polynetPlatformToolNames: RetrievalToolName[];
  polynetPlatformTools: PolynetPlatformToolSpec[];
  runtimeAdapterToolNames: CodexRuntimeAdapterToolName[];
};

export const CODEX_NATIVE_WORKSPACE_FORBIDDEN_TOOL_NAMES = [
  "workspace_bash",
  "list_dir",
  "read",
  "glob",
  "grep",
  "sha256",
  "write",
  "edit",
  "bash",
  "terminal_start",
  "terminal_read",
  "terminal_write",
  "terminal_stop",
] as const;

function uniqueRetrievalToolNames(values: readonly RetrievalToolName[]): RetrievalToolName[] {
  const seen = new Set<string>();
  const out: RetrievalToolName[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function resolvePolynetHarnessToolPolicy(params: {
  allowedToolNames: readonly RetrievalToolName[];
}): PolynetHarnessToolPolicy {
  return {
    harnessKind: "polynet",
    fixedRuntimeToolNames: uniqueRetrievalToolNames(params.allowedToolNames),
  };
}

export function resolveCodexHarnessToolPolicy(params: {
  polynetPlatformToolProjection: PolynetPlatformToolProjectionParams;
  workspaceServeAvailable: boolean;
  computerAdaptersAvailable: boolean;
}): CodexHarnessToolPolicy {
  const polynetPlatformTools = buildPolynetPlatformToolSpecs(
    params.polynetPlatformToolProjection,
  );
  const runtimeAdapterToolNames: CodexRuntimeAdapterToolName[] = [];
  if (params.workspaceServeAvailable) {
    runtimeAdapterToolNames.push(CODEX_WORKSPACE_SERVE_TOOL_NAME);
  }
  if (params.computerAdaptersAvailable) {
    runtimeAdapterToolNames.push(
      CODEX_COMPUTER_OPEN_URL_TOOL_NAME,
      CODEX_COMPUTER_SCREENSHOT_TOOL_NAME,
    );
  }
  return {
    harnessKind: "codex",
    workspaceAccess: {
      mode: "native_codex",
      nativeCodex: true,
      duplicateShellTool: false,
      shellTool: null,
    },
    polynetPlatformToolNames: buildPolynetPlatformToolNames(
      params.polynetPlatformToolProjection,
    ),
    polynetPlatformTools,
    runtimeAdapterToolNames,
  };
}

export function buildPolynetHarnessToolPolicyReceipt(
  policy: PolynetHarnessToolPolicy,
): Record<string, unknown> {
  return {
    harness_kind: policy.harnessKind,
    fixed_runtime_tool_names: policy.fixedRuntimeToolNames,
  };
}

export function buildCodexHarnessToolPolicyReceipt(
  policy: CodexHarnessToolPolicy,
): Record<string, unknown> {
  return {
    harness_kind: policy.harnessKind,
    workspace_access: {
      mode: policy.workspaceAccess.mode,
      native_codex: policy.workspaceAccess.nativeCodex,
      duplicate_shell_tool: policy.workspaceAccess.duplicateShellTool,
      shell_tool: policy.workspaceAccess.shellTool,
    },
    polynet_platform_tool_names: policy.polynetPlatformToolNames,
    runtime_adapter_tool_names: policy.runtimeAdapterToolNames,
  };
}
