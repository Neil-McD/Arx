import {
  WORKSPACE_SANDBOX_TOOL_NAMES,
  type RetrievalToolName,
} from "./retrievalTools.ts";
import type { CodexMcpProjectionMountedTool } from "./codexMcpProjection.ts";
import {
  getToolDefinition,
  normalizeToolArguments,
  type ToolRegistryEntry,
} from "./toolRegistry.ts";

export const CODEX_HARNESS_READ_ONLY_DYNAMIC_TOOL_NAMES = [
  "get_active_community_context",
  "community_search",
] as const satisfies readonly RetrievalToolName[];

export type CodexHarnessReadOnlyDynamicToolName =
  (typeof CODEX_HARNESS_READ_ONLY_DYNAMIC_TOOL_NAMES)[number];

export type CodexHarnessDynamicToolSpec = {
  name: string;
  description: string;
  inputSchema: ToolRegistryEntry["inputSchema"];
};

export const CODEX_HARNESS_DYNAMIC_TOOL_BRIDGE_ROUTE =
  "/runtime/codex_harness_dynamic_tool";

const CODEX_HARNESS_READ_ONLY_DYNAMIC_TOOL_NAME_SET =
  new Set<RetrievalToolName>(CODEX_HARNESS_READ_ONLY_DYNAMIC_TOOL_NAMES);

const CODEX_APP_SERVER_NATIVE_TOOL_EXCLUDES = new Set<string>([
  ...WORKSPACE_SANDBOX_TOOL_NAMES,
  "apply_patch",
  "exec",
  "process",
  "update_plan",
]);

export function isCodexHarnessReadOnlyDynamicToolName(
  toolName: string,
): toolName is CodexHarnessReadOnlyDynamicToolName {
  return CODEX_HARNESS_READ_ONLY_DYNAMIC_TOOL_NAME_SET.has(
    toolName as RetrievalToolName,
  );
}

export function isCodexAppServerNativeToolName(toolName: string): boolean {
  return CODEX_APP_SERVER_NATIVE_TOOL_EXCLUDES.has(toolName.trim());
}

export function buildCodexHarnessDynamicToolSpecs(
  allowedToolNames: readonly (RetrievalToolName | string)[],
): CodexHarnessDynamicToolSpec[] {
  const allowed = new Set(allowedToolNames.map((toolName) => String(toolName)));
  return CODEX_HARNESS_READ_ONLY_DYNAMIC_TOOL_NAMES
    .filter((toolName) => allowed.has(toolName))
    .map((toolName) => {
      const definition = getToolDefinition(toolName);
      return {
        name: toolName,
        description: definition.description,
        inputSchema: definition.inputSchema,
      };
    });
}

export function buildCodexHarnessMountedMcpDynamicToolSpecs(params: {
  mountedTools: readonly CodexMcpProjectionMountedTool[];
  eligibleRuntimeToolNames: readonly string[];
}): CodexHarnessDynamicToolSpec[] {
  const eligibleRuntimeToolNames = new Set(
    params.eligibleRuntimeToolNames.map((toolName) => String(toolName).trim()),
  );
  const specs: CodexHarnessDynamicToolSpec[] = [];
  const seen = new Set<string>();
  for (const tool of params.mountedTools) {
    const runtimeToolName = String(tool.runtime_tool_name ?? "").trim();
    if (
      !runtimeToolName ||
      seen.has(runtimeToolName) ||
      !eligibleRuntimeToolNames.has(runtimeToolName) ||
      tool.scope !== "user" ||
      tool.risk_level !== "read"
    ) {
      continue;
    }
    seen.add(runtimeToolName);
    specs.push({
      name: runtimeToolName,
      description:
        String(tool.description ?? "").trim() ||
        `Call the read-only ${tool.app_name || "MCP app"} tool ${tool.tool_name}.`,
      inputSchema:
        tool.input_schema &&
        typeof tool.input_schema === "object" &&
        !Array.isArray(tool.input_schema)
          ? (tool.input_schema as ToolRegistryEntry["inputSchema"])
          : {
              type: "object",
              additionalProperties: true,
              properties: {},
            },
    });
  }
  return specs.sort((left, right) => left.name.localeCompare(right.name));
}

export function normalizeCodexHarnessDynamicToolArguments(
  toolName: CodexHarnessReadOnlyDynamicToolName,
  rawArgs: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return normalizeToolArguments(toolName, rawArgs);
}
