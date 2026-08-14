import type { RetrievalToolName } from "./retrievalTools";
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

export type RuntimeToolScheduleDecision =
  | "serial_execution_enforced"
  | "parallel_read_batch_enabled";
export type RuntimeToolScheduleExecutionMode =
  | "serial_batch"
  | "parallel_read_batch";
export type RuntimeToolScheduleReason =
  | "parallel_safe_read_only"
  | "unknown_policy"
  | "exclusive_tool"
  | "mutates_state"
  | "not_read_only"
  | "not_parallel_safe";

export type RuntimeToolScheduleCall = {
  providerCallId: string;
  toolName: string;
  index: number;
  source: RuntimeToolSource;
  category: RuntimeToolCategory;
  riskLevel: RuntimeToolRiskLevel;
  readOnly: boolean;
  mutatesState: boolean;
  parallelSafe: boolean;
  parallelEligible: boolean;
  exclusive: boolean;
  requiresWorkspace: boolean;
  requiresCommunity: boolean;
  reasons: RuntimeToolScheduleReason[];
};

export type RuntimeToolScheduleSummary = {
  total: number;
  parallelEligible: number;
  exclusive: number;
  unknown: number;
  mutating: number;
  readOnly: number;
  requiresWorkspace: number;
  requiresCommunity: number;
};

export type RuntimeToolSchedulePlan = {
  decision: RuntimeToolScheduleDecision;
  executionMode: RuntimeToolScheduleExecutionMode;
  reason:
    | "single_tool_call_serialized"
    | "parallel_capable_batch_serialized"
    | "contains_non_parallel_tools"
    | "parallel_read_batch_enabled";
  calls: RuntimeToolScheduleCall[];
  summary: RuntimeToolScheduleSummary;
};

export type RuntimeToolScheduleInputCall = {
  providerCallId: string;
  toolName: string;
  index?: number;
  normalizedArgs?: Record<string, unknown>;
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

const FIXED_TOOL_POLICIES: Record<RetrievalToolName, RuntimeToolPolicy> = {
  search_product_docs: buildPlatformOperationRuntimePolicy("search_product_docs"),
  get_product_doc: buildPlatformOperationRuntimePolicy("get_product_doc"),
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
  member_conversations_list: {
    toolName: "member_conversations_list", source: "fixed", category: "community", riskLevel: "read",
    readOnly: true, mutatesState: false, parallelSafe: true, exclusive: false,
    requiresWorkspace: false, requiresCommunity: false,
  },
  member_conversation_read: {
    toolName: "member_conversation_read", source: "fixed", category: "community", riskLevel: "read",
    readOnly: true, mutatesState: false, parallelSafe: true, exclusive: false,
    requiresWorkspace: false, requiresCommunity: false,
  },
  member_profile_confirm_facts: {
    toolName: "member_profile_confirm_facts", source: "fixed", category: "community", riskLevel: "write",
    readOnly: false, mutatesState: true, parallelSafe: false, exclusive: true,
    requiresWorkspace: false, requiresCommunity: true,
  },
  web_research: {
    toolName: "web_research", source: "fixed", category: "web", riskLevel: "read",
    readOnly: true, mutatesState: false, parallelSafe: true, exclusive: false,
    requiresWorkspace: false, requiresCommunity: true,
  },
  web_crawl: {
    toolName: "web_crawl", source: "fixed", category: "web", riskLevel: "write",
    readOnly: false, mutatesState: true, parallelSafe: false, exclusive: true,
    requiresWorkspace: false, requiresCommunity: true,
  },
};

function emptyRiskCounts(): Record<RuntimeToolRiskLevel, number> {
  return { read: 0, write: 0, sensitive: 0 };
}

function emptyCategoryCounts(): Record<RuntimeToolCategory, number> {
  return { docs: 0, community: 0, web: 0, unknown: 0 };
}

export function getFixedRuntimeToolPolicy(toolName: RetrievalToolName): RuntimeToolPolicy {
  return FIXED_TOOL_POLICIES[toolName];
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

export function isRuntimeToolPolicyParallelEligible(policy: RuntimeToolPolicy): boolean {
  return policy.parallelSafe && policy.readOnly && !policy.exclusive;
}

function getRuntimeToolScheduleReasons(policy: RuntimeToolPolicy): RuntimeToolScheduleReason[] {
  if (isRuntimeToolPolicyParallelEligible(policy)) return ["parallel_safe_read_only"];
  const reasons: RuntimeToolScheduleReason[] = [];
  if (policy.source === "unknown") reasons.push("unknown_policy");
  if (policy.exclusive) reasons.push("exclusive_tool");
  if (policy.mutatesState) reasons.push("mutates_state");
  if (!policy.readOnly) reasons.push("not_read_only");
  if (!policy.parallelSafe) reasons.push("not_parallel_safe");
  return reasons;
}

export function classifyRuntimeToolSchedule(params: {
  toolCalls: readonly RuntimeToolScheduleInputCall[];
  policies: readonly RuntimeToolPolicy[];
  enableParallelReadBatches?: boolean;
}): RuntimeToolSchedulePlan {
  const policiesByToolName = new Map(params.policies.map((policy) => [policy.toolName, policy]));
  const calls = params.toolCalls.map((toolCall, fallbackIndex) => {
    const toolName = String(toolCall.toolName ?? "").trim();
    const policy = policiesByToolName.get(toolName) ?? getUnknownRuntimeToolPolicy(toolName);
    return {
      providerCallId: String(toolCall.providerCallId ?? "").trim(),
      toolName,
      index: typeof toolCall.index === "number" && Number.isFinite(toolCall.index)
        ? toolCall.index
        : fallbackIndex,
      source: policy.source,
      category: policy.category,
      riskLevel: policy.riskLevel,
      readOnly: policy.readOnly,
      mutatesState: policy.mutatesState,
      parallelSafe: policy.parallelSafe,
      parallelEligible: isRuntimeToolPolicyParallelEligible(policy),
      exclusive: policy.exclusive,
      requiresWorkspace: policy.requiresWorkspace,
      requiresCommunity: policy.requiresCommunity,
      reasons: getRuntimeToolScheduleReasons(policy),
    };
  });
  const summary: RuntimeToolScheduleSummary = {
    total: calls.length,
    parallelEligible: 0,
    exclusive: 0,
    unknown: 0,
    mutating: 0,
    readOnly: 0,
    requiresWorkspace: 0,
    requiresCommunity: 0,
  };
  for (const call of calls) {
    if (call.parallelEligible) summary.parallelEligible += 1;
    if (call.exclusive) summary.exclusive += 1;
    if (call.source === "unknown") summary.unknown += 1;
    if (call.mutatesState) summary.mutating += 1;
    if (call.readOnly) summary.readOnly += 1;
    if (call.requiresWorkspace) summary.requiresWorkspace += 1;
    if (call.requiresCommunity) summary.requiresCommunity += 1;
  }
  const allParallelEligible = calls.length > 1 && calls.every((call) => call.parallelEligible);
  const parallelEnabled = params.enableParallelReadBatches === true && allParallelEligible;
  return {
    decision: parallelEnabled ? "parallel_read_batch_enabled" : "serial_execution_enforced",
    executionMode: parallelEnabled ? "parallel_read_batch" : "serial_batch",
    reason: calls.length <= 1
      ? "single_tool_call_serialized"
      : parallelEnabled
        ? "parallel_read_batch_enabled"
        : allParallelEligible
          ? "parallel_capable_batch_serialized"
          : "contains_non_parallel_tools",
    calls,
    summary,
  };
}
