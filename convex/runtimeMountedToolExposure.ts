import type { RuntimeMountedMcpTool } from "./runtimeMcpManager.ts";

export const RESOLVE_MOUNTED_TOOLS_TOOL_NAME = "resolve_mounted_tools";
const DEFAULT_EXPOSURE_LIMIT = 4;
const MAX_EXPOSURE_LIMIT = 8;
const DEFAULT_MAX_EXPOSED_TOOLS = 12;

export type ResolveMountedToolsArgs = {
  query: string;
  scope: "any" | "user" | "community";
  limit: number;
};

type RuntimeMountedToolMatch = {
  tool: RuntimeMountedMcpTool;
  score: number;
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function scoreMountedToolMatch(params: {
  tool: RuntimeMountedMcpTool;
  query: string;
  tokens: string[];
}): number {
  const query = params.query.toLowerCase();
  const appName = params.tool.app_name.toLowerCase();
  const toolName = params.tool.tool_name.toLowerCase();
  const namespacedToolName = params.tool.namespaced_tool_name.toLowerCase();
  const runtimeToolName = params.tool.runtime_tool_name.toLowerCase();
  const description = String(params.tool.description ?? "").toLowerCase();
  let score = 0;

  if (runtimeToolName === query || namespacedToolName === query) score += 180;
  if (toolName === query) score += 170;
  if (appName === query) score += 140;

  if (runtimeToolName.includes(query)) score += 120;
  if (namespacedToolName.includes(query)) score += 110;
  if (toolName.includes(query)) score += 100;
  if (appName.includes(query)) score += 80;
  if (description.includes(query)) score += 30;

  for (const token of params.tokens) {
    if (runtimeToolName.includes(token)) score += 18;
    if (namespacedToolName.includes(token)) score += 16;
    if (toolName.includes(token)) score += 14;
    if (appName.includes(token)) score += 10;
    if (description.includes(token)) score += 4;
  }

  if (params.tool.scope === "user") score += 1;
  return score;
}

export function normalizeResolveMountedToolsArguments(
  rawArgs: Record<string, unknown> | null | undefined,
): ResolveMountedToolsArgs {
  const args =
    rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)
      ? rawArgs
      : {};
  const query = normalizeString(args.query);
  if (!query) throw new Error("resolve_mounted_tools requires query.");
  const rawScope = normalizeString(args.scope).toLowerCase();
  const scope: ResolveMountedToolsArgs["scope"] =
    rawScope === "user" || rawScope === "community" ? rawScope : "any";
  const rawLimit =
    typeof args.limit === "number"
      ? args.limit
      : typeof args.limit === "string"
        ? Number(args.limit)
        : Number.NaN;
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(MAX_EXPOSURE_LIMIT, Math.floor(rawLimit)))
    : DEFAULT_EXPOSURE_LIMIT;
  return {
    query: query.slice(0, 240),
    scope,
    limit,
  };
}

export function createRuntimeMountedToolExposureState(params: {
  mountedTools: RuntimeMountedMcpTool[];
  maxExposedTools?: number;
}) {
  const catalog = [...params.mountedTools].sort((left, right) =>
    left.runtime_tool_name.localeCompare(right.runtime_tool_name),
  );
  const exposedToolNames = new Set<string>();
  const maxExposedTools = Math.max(
    1,
    Math.floor(params.maxExposedTools ?? DEFAULT_MAX_EXPOSED_TOOLS),
  );

  return {
    hasMountedTools(): boolean {
      return catalog.length > 0;
    },
    getExposedTools(): RuntimeMountedMcpTool[] {
      return catalog.filter((tool) => exposedToolNames.has(tool.runtime_tool_name));
    },
    resolve(args: ResolveMountedToolsArgs): {
      outputText: string;
      resolution: {
        query: string;
        scope: ResolveMountedToolsArgs["scope"];
        requestedLimit: number;
        totalCatalogCount: number;
        totalMatchedCount: number;
        totalExposedCount: number;
        newlyExposedTools: Array<{
          runtime_tool_name: string;
          scope: "user" | "community";
          app_name: string;
          tool_name: string;
          namespaced_tool_name: string;
          risk_level: "read" | "write" | "sensitive";
          description: string | null;
        }>;
        alreadyExposedTools: string[];
        remainingExposureCapacity: number;
      };
    } {
      const tokens = tokenize(args.query);
      const matched = catalog
        .filter((tool) => args.scope === "any" || tool.scope === args.scope)
        .map((tool) => ({
          tool,
          score: scoreMountedToolMatch({
            tool,
            query: args.query,
            tokens,
          }),
        }))
        .filter((match) => match.score > 0)
        .sort((left, right) => {
          if (right.score !== left.score) return right.score - left.score;
          return left.tool.runtime_tool_name.localeCompare(
            right.tool.runtime_tool_name,
          );
        });

      const selectedMatches = matched.slice(0, args.limit);
      const remainingCapacity = Math.max(
        0,
        maxExposedTools - exposedToolNames.size,
      );
      const newlyExposedTools: RuntimeMountedToolMatch[] = [];
      const alreadyExposedTools: string[] = [];

      for (const match of selectedMatches) {
        if (exposedToolNames.has(match.tool.runtime_tool_name)) {
          alreadyExposedTools.push(match.tool.runtime_tool_name);
          continue;
        }
        if (newlyExposedTools.length >= remainingCapacity) continue;
        exposedToolNames.add(match.tool.runtime_tool_name);
        newlyExposedTools.push(match);
      }

      const resolution = {
        query: args.query,
        scope: args.scope,
        requestedLimit: args.limit,
        totalCatalogCount: catalog.length,
        totalMatchedCount: matched.length,
        totalExposedCount: exposedToolNames.size,
        newlyExposedTools: newlyExposedTools.map(({ tool }) => ({
          runtime_tool_name: tool.runtime_tool_name,
          scope: tool.scope,
          app_name: tool.app_name,
          tool_name: tool.tool_name,
          namespaced_tool_name: tool.namespaced_tool_name,
          risk_level: tool.risk_level,
          description: tool.description,
        })),
        alreadyExposedTools,
        remainingExposureCapacity: Math.max(
          0,
          maxExposedTools - exposedToolNames.size,
        ),
      };

      return {
        outputText: JSON.stringify(resolution),
        resolution,
      };
    },
  };
}
