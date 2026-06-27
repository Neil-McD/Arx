import {
  COMPUTER_USE_TOOL_NAMES,
  SANDBOX_FILE_SHELL_TOOL_NAMES,
  SANDBOX_PREVIEW_TOOL_NAMES,
  SANDBOX_TOOL_NAMES,
  type RetrievalToolName,
} from "./retrievalTools.ts";
import {
  buildPolynetPlatformToolNames,
  buildPolynetPlatformToolSpecs,
  type PolynetPlatformToolProjectionParams,
  type PolynetPlatformToolSpec,
} from "./polynetPlatformToolSurface.ts";

export type RuntimeHarnessKind = "polynet" | "codex";

export type HarnessRuntimeCapabilityName =
  | "workspace_files"
  | "workspace_shell"
  | "app_preview"
  | "computer_use";

export type HarnessRuntimeCapability = {
  name: HarnessRuntimeCapabilityName;
  toolNames: string[];
};

export type PolynetHarnessToolPolicy = {
  harnessKind: "polynet";
  fixedRuntimeToolNames: RetrievalToolName[];
  runtimeCapabilities: HarnessRuntimeCapability[];
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
  runtimeCapabilities: HarnessRuntimeCapability[];
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

export const POLYNET_HARNESS_FORBIDDEN_RUNTIME_TOOL_NAMES: readonly RetrievalToolName[] =
  [
    "terminal_read",
    "terminal_write",
    ...COMPUTER_USE_TOOL_NAMES,
  ];

export const POLYNET_HARNESS_DAYTONA_WORKSPACE_TOOL_NAMES: readonly RetrievalToolName[] =
  SANDBOX_FILE_SHELL_TOOL_NAMES;

export const POLYNET_HARNESS_DAYTONA_PREVIEW_TOOL_NAMES: readonly RetrievalToolName[] =
  SANDBOX_PREVIEW_TOOL_NAMES;

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

function selectIncludedToolNames<T extends string>(
  candidates: readonly T[],
  available: ReadonlySet<string>,
): T[] {
  return candidates.filter((toolName) => available.has(toolName));
}

function buildCodexRuntimeCapabilities(
  runtimeAdapterToolNames: readonly CodexRuntimeAdapterToolName[],
): HarnessRuntimeCapability[] {
  const available = new Set<string>(runtimeAdapterToolNames);
  const capabilities: HarnessRuntimeCapability[] = [
    {
      name: "workspace_files",
      toolNames: ["native_codex_workspace"],
    },
    {
      name: "workspace_shell",
      toolNames: ["native_codex_shell"],
    },
  ];
  if (available.has(CODEX_WORKSPACE_SERVE_TOOL_NAME)) {
    capabilities.push({
      name: "app_preview",
      toolNames: [CODEX_WORKSPACE_SERVE_TOOL_NAME],
    });
  }
  const computerToolNames = selectIncludedToolNames(
    [
      CODEX_COMPUTER_OPEN_URL_TOOL_NAME,
      CODEX_COMPUTER_SCREENSHOT_TOOL_NAME,
    ] as const,
    available,
  );
  if (computerToolNames.length > 0) {
    capabilities.push({ name: "computer_use", toolNames: computerToolNames });
  }
  return capabilities;
}

function buildPolynetRuntimeCapabilities(
  fixedRuntimeToolNames: readonly RetrievalToolName[],
): HarnessRuntimeCapability[] {
  const available = new Set<string>(fixedRuntimeToolNames);
  const capabilities: HarnessRuntimeCapability[] = [];
  const fileToolNames = selectIncludedToolNames(
    [
      "list_dir",
      "read",
      "glob",
      "grep",
      "sha256",
      "write",
      "edit",
    ] as const,
    available,
  );
  if (fileToolNames.length > 0) {
    capabilities.push({
      name: "workspace_files",
      toolNames: fileToolNames,
    });
  }
  if (available.has("bash")) {
    capabilities.push({
      name: "workspace_shell",
      toolNames: ["bash"],
    });
  }
  const previewToolNames = selectIncludedToolNames(
    ["terminal_start", "terminal_stop"] as const,
    available,
  );
  if (previewToolNames.includes("terminal_start")) {
    capabilities.push({
      name: "app_preview",
      toolNames: previewToolNames,
    });
  }
  return capabilities;
}

const POLYNET_HARNESS_FORBIDDEN_RUNTIME_TOOL_NAME_SET = new Set<RetrievalToolName>(
  POLYNET_HARNESS_FORBIDDEN_RUNTIME_TOOL_NAMES,
);

function excludePolynetRuntimeSubstrateToolNames(
  values: readonly RetrievalToolName[],
): RetrievalToolName[] {
  return values.filter(
    (toolName) => !POLYNET_HARNESS_FORBIDDEN_RUNTIME_TOOL_NAME_SET.has(toolName),
  );
}

export function resolvePolynetHarnessToolPolicy(params: {
  allowedToolNames: readonly RetrievalToolName[];
}): PolynetHarnessToolPolicy {
  const fixedRuntimeToolNames = uniqueRetrievalToolNames(
    excludePolynetRuntimeSubstrateToolNames(params.allowedToolNames),
  );
  return {
    harnessKind: "polynet",
    fixedRuntimeToolNames,
    runtimeCapabilities: buildPolynetRuntimeCapabilities(fixedRuntimeToolNames),
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
    runtimeCapabilities: buildCodexRuntimeCapabilities(runtimeAdapterToolNames),
  };
}

export function buildPolynetHarnessToolPolicyReceipt(
  policy: PolynetHarnessToolPolicy,
): Record<string, unknown> {
  return {
    harness_kind: policy.harnessKind,
    fixed_runtime_tool_names: policy.fixedRuntimeToolNames,
    runtime_capabilities: policy.runtimeCapabilities,
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
    runtime_capabilities: policy.runtimeCapabilities,
  };
}
