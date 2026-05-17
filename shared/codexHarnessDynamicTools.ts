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
export const CODEX_HARNESS_DYNAMIC_TOOL_SURFACE_VERSION =
  "codex_dynamic_tool_surface_v0";

export type CodexHarnessDynamicToolSurfaceFingerprint = {
  version: typeof CODEX_HARNESS_DYNAMIC_TOOL_SURFACE_VERSION;
  fingerprint: string;
  dynamicToolCount: number;
  dynamicToolNames: string[];
};

const CODEX_HARNESS_READ_ONLY_DYNAMIC_TOOL_NAME_SET =
  new Set<RetrievalToolName>(CODEX_HARNESS_READ_ONLY_DYNAMIC_TOOL_NAMES);

const CODEX_APP_SERVER_NATIVE_TOOL_EXCLUDES = new Set<string>([
  ...WORKSPACE_SANDBOX_TOOL_NAMES,
  "apply_patch",
  "exec",
  "process",
  "update_plan",
]);

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

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

export async function buildCodexHarnessDynamicToolSurfaceFingerprint(params: {
  dynamicToolSpecs: readonly CodexHarnessDynamicToolSpec[];
  codexMcpProjection?: {
    version?: string | null;
    mode?: string | null;
    fingerprint?: string | null;
  } | null;
}): Promise<CodexHarnessDynamicToolSurfaceFingerprint> {
  const dynamicTools = params.dynamicToolSpecs
    .map((tool) => ({
      name: String(tool.name ?? "").trim(),
      description: String(tool.description ?? "").trim(),
      inputSchema: tool.inputSchema ?? null,
    }))
    .filter((tool) => tool.name)
    .sort((left, right) => left.name.localeCompare(right.name));
  const codexMcpProjection =
    params.codexMcpProjection && dynamicTools.length > 0
      ? {
          version: String(params.codexMcpProjection.version ?? "").trim(),
          mode: String(params.codexMcpProjection.mode ?? "").trim(),
          fingerprint: String(params.codexMcpProjection.fingerprint ?? "").trim(),
        }
      : null;
  return {
    version: CODEX_HARNESS_DYNAMIC_TOOL_SURFACE_VERSION,
    fingerprint: await sha256Hex(
      stableJson({
        version: CODEX_HARNESS_DYNAMIC_TOOL_SURFACE_VERSION,
        dynamicTools,
        codexMcpProjection,
      }),
    ),
    dynamicToolCount: dynamicTools.length,
    dynamicToolNames: dynamicTools.map((tool) => tool.name),
  };
}

export function normalizeCodexHarnessDynamicToolArguments(
  toolName: CodexHarnessReadOnlyDynamicToolName,
  rawArgs: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return normalizeToolArguments(toolName, rawArgs);
}
