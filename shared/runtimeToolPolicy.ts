import type { BaseToolName, RetrievalToolName } from "./retrievalTools";
import { isBaseToolName } from "./retrievalTools.ts";
import { findPlatformOperationByNativeToolName } from "./platformOperationContract.ts";

export type RuntimeToolSource = "fixed" | "unknown";
export type RuntimeToolCategory = "docs" | "community" | "web" | "unknown";
export type RuntimeToolRiskLevel = "read" | "write" | "sensitive";

export type RuntimeToolPolicy = {
  toolName: string;
  source: RuntimeToolSource;
  category: RuntimeToolCategory;
  riskLevel: RuntimeToolRiskLevel;
  readOnly: boolean;
  mutatesState: boolean;
  parallelSafe: boolean;
  exclusive: boolean;
  requiresWorkspace: boolean;
  requiresCommunity: boolean;
};

export type RuntimeToolPolicySummary = {
  total: number;
  readOnly: number;
  mutating: number;
  parallelSafe: number;
  exclusive: number;
  requiresWorkspace: number;
  requiresCommunity: number;
  byRiskLevel: Record<RuntimeToolRiskLevel, number>;
  byCategory: Record<RuntimeToolCategory, number>;
};

function buildPlatformOperationRuntimePolicy(
  toolName: RetrievalToolName,
): RuntimeToolPolicy {
  const operation = findPlatformOperationByNativeToolName(toolName);
  if (!operation) {
    throw new Error(`platform_operation_native_projection_missing:${toolName}`);
  }
  const mutatesState =
    operation.effects.domainState === "write" ||
    operation.effects.external !== "none" ||
    operation.effects.receipt === "write";
  return {
    toolName,
    source: "fixed",
    category: operation.projections.native.category,
    riskLevel:
      operation.effects.external !== "none"
        ? "sensitive"
        : operation.effects.domainState === "write"
          ? "write"
          : "read",
    readOnly: !mutatesState,
    mutatesState,
    parallelSafe: !mutatesState && operation.projections.native.parallelSafe,
    exclusive: false,
    requiresWorkspace: false,
    requiresCommunity: operation.projections.native.requiresCommunity,
  };
}

const FIXED_TOOL_POLICIES: Record<BaseToolName, RuntimeToolPolicy> = {
  polynet_list: {
    toolName: "polynet_list", source: "fixed", category: "community", riskLevel: "read",
    readOnly: true, mutatesState: false, parallelSafe: true, exclusive: false,
    requiresWorkspace: false, requiresCommunity: false,
  },
  polynet_read: {
    toolName: "polynet_read", source: "fixed", category: "community", riskLevel: "read",
    readOnly: false, mutatesState: true, parallelSafe: false, exclusive: false,
    requiresWorkspace: false, requiresCommunity: false,
  },
  polynet_search: {
    toolName: "polynet_search", source: "fixed", category: "community", riskLevel: "read",
    readOnly: false, mutatesState: true, parallelSafe: false, exclusive: false,
    requiresWorkspace: false, requiresCommunity: false,
  },
  polynet_write: {
    toolName: "polynet_write", source: "fixed", category: "community", riskLevel: "write",
    readOnly: false, mutatesState: true, parallelSafe: false, exclusive: true,
    requiresWorkspace: false, requiresCommunity: false,
  },
  polynet_call: {
    toolName: "polynet_call", source: "fixed", category: "community", riskLevel: "write",
    readOnly: false, mutatesState: true, parallelSafe: false, exclusive: true,
    requiresWorkspace: false, requiresCommunity: false,
  },
  web_research: {
    toolName: "web_research", source: "fixed", category: "web", riskLevel: "read",
    readOnly: true, mutatesState: false, parallelSafe: true, exclusive: false,
    requiresWorkspace: false, requiresCommunity: true,
  },
};

function emptyRiskCounts(): Record<RuntimeToolRiskLevel, number> {
  return { read: 0, write: 0, sensitive: 0 };
}

function emptyCategoryCounts(): Record<RuntimeToolCategory, number> {
  return { docs: 0, community: 0, web: 0, unknown: 0 };
}

// A named action tool changes the community: one at a time, like the general
// action tools it is translated into.
export function getFixedRuntimeToolPolicy(toolName: RetrievalToolName): RuntimeToolPolicy {
  if (isBaseToolName(toolName)) return FIXED_TOOL_POLICIES[toolName];
  return { ...FIXED_TOOL_POLICIES.polynet_call, toolName };
}

export function getUnknownRuntimeToolPolicy(toolName: string): RuntimeToolPolicy {
  return {
    toolName, source: "unknown", category: "unknown", riskLevel: "sensitive",
    readOnly: false, mutatesState: true, parallelSafe: false, exclusive: true,
    requiresWorkspace: false, requiresCommunity: false,
  };
}

export function summarizeRuntimeToolPolicies(
  policies: readonly RuntimeToolPolicy[],
): RuntimeToolPolicySummary {
  const summary: RuntimeToolPolicySummary = {
    total: policies.length,
    readOnly: 0,
    mutating: 0,
    parallelSafe: 0,
    exclusive: 0,
    requiresWorkspace: 0,
    requiresCommunity: 0,
    byRiskLevel: emptyRiskCounts(),
    byCategory: emptyCategoryCounts(),
  };
  for (const policy of policies) {
    if (policy.readOnly) summary.readOnly += 1;
    if (policy.mutatesState) summary.mutating += 1;
    if (policy.parallelSafe) summary.parallelSafe += 1;
    if (policy.exclusive) summary.exclusive += 1;
    if (policy.requiresWorkspace) summary.requiresWorkspace += 1;
    if (policy.requiresCommunity) summary.requiresCommunity += 1;
    summary.byRiskLevel[policy.riskLevel] += 1;
    summary.byCategory[policy.category] += 1;
  }
  return summary;
}

export function buildRuntimeToolPolicySurface(params: {
  fixedToolNames: readonly RetrievalToolName[];
}): { policies: RuntimeToolPolicy[]; summary: RuntimeToolPolicySummary } {
  const policies = params.fixedToolNames.map(getFixedRuntimeToolPolicy);
  return { policies, summary: summarizeRuntimeToolPolicies(policies) };
}
