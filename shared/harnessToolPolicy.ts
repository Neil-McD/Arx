import {
  COMPUTER_USE_TOOL_NAMES,
  SANDBOX_FILE_SHELL_TOOL_NAMES,
  SANDBOX_PREVIEW_TOOL_NAMES,
  SANDBOX_TOOL_NAMES,
  type RetrievalToolName,
} from "./retrievalTools.ts";
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

export function buildPolynetHarnessToolPolicyReceipt(
  policy: PolynetHarnessToolPolicy,
): Record<string, unknown> {
  return {
    harness_kind: policy.harnessKind,
    fixed_runtime_tool_names: policy.fixedRuntimeToolNames,
    runtime_capabilities: policy.runtimeCapabilities,
  };
}
