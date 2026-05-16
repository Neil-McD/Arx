import {
  WORKSPACE_SANDBOX_TOOL_NAMES,
  type RetrievalToolName,
} from "./retrievalTools.ts";
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
  name: CodexHarnessReadOnlyDynamicToolName;
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

export function normalizeCodexHarnessDynamicToolArguments(
  toolName: CodexHarnessReadOnlyDynamicToolName,
  rawArgs: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return normalizeToolArguments(toolName, rawArgs);
}
