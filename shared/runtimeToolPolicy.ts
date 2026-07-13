import type { RetrievalToolName } from "./retrievalTools";
import {
  classifyShellCommand,
  type ShellCommandAuditSeverity,
  type ShellCommandEffect,
} from "./shellCommandPolicy.ts";

export type RuntimeToolSource = "fixed" | "mounted_mcp" | "resolver" | "unknown";
export type RuntimeToolCategory =
  | "docs"
  | "community"
  | "web"
  | "workspace_fs"
  | "workspace_shell"
  | "terminal"
  | "computer"
  | "mcp"
  | "resolver"
  | "unknown";
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
  requiresMcpSession: boolean;
};

export type RuntimeMountedToolPolicyInput = {
  scope: "user" | "community";
  runtime_tool_name: string;
  risk_level: RuntimeToolRiskLevel;
};

export type RuntimeToolPolicySummary = {
  total: number;
  readOnly: number;
  mutating: number;
  parallelSafe: number;
  exclusive: number;
  requiresWorkspace: number;
  requiresCommunity: number;
  requiresMcpSession: number;
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
  | "not_parallel_safe"
  | "requires_mcp_session";

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
  requiresMcpSession: boolean;
  shellCommandEffect?: ShellCommandEffect;
  shellCommandAuditSeverity?: ShellCommandAuditSeverity;
  shellCommandReasons?: string[];
  shellCommandParsedCommands?: string[];
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
  requiresMcpSession: number;
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

export type RuntimeShellCommandAuditMetadata = {
  shell_command_effect: ShellCommandEffect;
  shell_command_audit_severity: ShellCommandAuditSeverity;
  shell_command_reasons: string[];
  shell_command_parsed_commands: string[];
};

const FIXED_TOOL_POLICIES: Record<RetrievalToolName, RuntimeToolPolicy> = {
  search_product_docs: {
    toolName: "search_product_docs",
    source: "fixed",
    category: "docs",
    riskLevel: "read",
    readOnly: true,
    mutatesState: false,
    parallelSafe: true,
    exclusive: false,
    requiresWorkspace: false,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  get_product_doc: {
    toolName: "get_product_doc",
    source: "fixed",
    category: "docs",
    riskLevel: "read",
    readOnly: true,
    mutatesState: false,
    parallelSafe: true,
    exclusive: false,
    requiresWorkspace: false,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  get_active_community_context: {
    toolName: "get_active_community_context",
    source: "fixed",
    category: "community",
    riskLevel: "read",
    readOnly: true,
    mutatesState: false,
    parallelSafe: true,
    exclusive: false,
    requiresWorkspace: false,
    requiresCommunity: true,
    requiresMcpSession: false,
  },
  member_profile_confirm_facts: {
    toolName: "member_profile_confirm_facts",
    source: "fixed",
    category: "community",
    riskLevel: "write",
    readOnly: false,
    mutatesState: true,
    parallelSafe: false,
    exclusive: true,
    requiresWorkspace: false,
    requiresCommunity: true,
    requiresMcpSession: false,
  },
  community_resources_map: {
    toolName: "community_resources_map",
    source: "fixed",
    category: "community",
    riskLevel: "read",
    readOnly: true,
    mutatesState: false,
    parallelSafe: true,
    exclusive: false,
    requiresWorkspace: false,
    requiresCommunity: true,
    requiresMcpSession: false,
  },
  member_conversations_list: {
    toolName: "member_conversations_list",
    source: "fixed",
    category: "community",
    riskLevel: "read",
    readOnly: true,
    mutatesState: false,
    parallelSafe: true,
    exclusive: false,
    requiresWorkspace: false,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  member_conversation_read: {
    toolName: "member_conversation_read",
    source: "fixed",
    category: "community",
    riskLevel: "read",
    readOnly: true,
    mutatesState: false,
    parallelSafe: true,
    exclusive: false,
    requiresWorkspace: false,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  community_resources_read: {
    toolName: "community_resources_read",
    source: "fixed",
    category: "community",
    riskLevel: "read",
    readOnly: true,
    mutatesState: false,
    parallelSafe: true,
    exclusive: false,
    requiresWorkspace: false,
    requiresCommunity: true,
    requiresMcpSession: false,
  },
  community_resources_list: {
    toolName: "community_resources_list",
    source: "fixed",
    category: "community",
    riskLevel: "read",
    readOnly: true,
    mutatesState: false,
    parallelSafe: true,
    exclusive: false,
    requiresWorkspace: false,
    requiresCommunity: true,
    requiresMcpSession: false,
  },
  community_resource_read: {
    toolName: "community_resource_read",
    source: "fixed",
    category: "community",
    riskLevel: "read",
    readOnly: true,
    mutatesState: false,
    parallelSafe: true,
    exclusive: false,
    requiresWorkspace: false,
    requiresCommunity: true,
    requiresMcpSession: false,
  },
  community_resources_search: {
    toolName: "community_resources_search",
    source: "fixed",
    category: "community",
    riskLevel: "read",
    readOnly: true,
    mutatesState: false,
    parallelSafe: true,
    exclusive: false,
    requiresWorkspace: false,
    requiresCommunity: true,
    requiresMcpSession: false,
  },
  community_resource_builder_list: {
    toolName: "community_resource_builder_list",
    source: "fixed",
    category: "community",
    riskLevel: "read",
    readOnly: true,
    mutatesState: false,
    parallelSafe: true,
    exclusive: false,
    requiresWorkspace: false,
    requiresCommunity: true,
    requiresMcpSession: false,
  },
  community_resource_builder_read: {
    toolName: "community_resource_builder_read",
    source: "fixed",
    category: "community",
    riskLevel: "read",
    readOnly: true,
    mutatesState: false,
    parallelSafe: true,
    exclusive: false,
    requiresWorkspace: false,
    requiresCommunity: true,
    requiresMcpSession: false,
  },
  community_resource_builder_stage_changeset: {
    toolName: "community_resource_builder_stage_changeset",
    source: "fixed",
    category: "community",
    riskLevel: "write",
    readOnly: false,
    mutatesState: true,
    parallelSafe: false,
    exclusive: true,
    requiresWorkspace: false,
    requiresCommunity: true,
    requiresMcpSession: false,
  },
  community_resource_builder_apply_changeset: {
    toolName: "community_resource_builder_apply_changeset",
    source: "fixed",
    category: "community",
    riskLevel: "write",
    readOnly: false,
    mutatesState: true,
    parallelSafe: false,
    exclusive: true,
    requiresWorkspace: false,
    requiresCommunity: true,
    requiresMcpSession: false,
  },
  community_search: {
    toolName: "community_search",
    source: "fixed",
    category: "community",
    riskLevel: "read",
    readOnly: true,
    mutatesState: false,
    parallelSafe: true,
    exclusive: false,
    requiresWorkspace: false,
    requiresCommunity: true,
    requiresMcpSession: false,
  },
  community_write: {
    toolName: "community_write",
    source: "fixed",
    category: "community",
    riskLevel: "write",
    readOnly: false,
    mutatesState: true,
    parallelSafe: false,
    exclusive: true,
    requiresWorkspace: false,
    requiresCommunity: true,
    requiresMcpSession: false,
  },
  web_research: {
    toolName: "web_research",
    source: "fixed",
    category: "web",
    riskLevel: "read",
    readOnly: true,
    mutatesState: false,
    parallelSafe: true,
    exclusive: false,
    requiresWorkspace: false,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  web_crawl: {
    toolName: "web_crawl",
    source: "fixed",
    category: "web",
    riskLevel: "write",
    readOnly: false,
    mutatesState: true,
    parallelSafe: false,
    exclusive: true,
    requiresWorkspace: false,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  list_dir: {
    toolName: "list_dir",
    source: "fixed",
    category: "workspace_fs",
    riskLevel: "read",
    readOnly: true,
    mutatesState: false,
    parallelSafe: true,
    exclusive: false,
    requiresWorkspace: true,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  read: {
    toolName: "read",
    source: "fixed",
    category: "workspace_fs",
    riskLevel: "read",
    readOnly: true,
    mutatesState: false,
    parallelSafe: true,
    exclusive: false,
    requiresWorkspace: true,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  glob: {
    toolName: "glob",
    source: "fixed",
    category: "workspace_fs",
    riskLevel: "read",
    readOnly: true,
    mutatesState: false,
    parallelSafe: true,
    exclusive: false,
    requiresWorkspace: true,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  grep: {
    toolName: "grep",
    source: "fixed",
    category: "workspace_fs",
    riskLevel: "read",
    readOnly: true,
    mutatesState: false,
    parallelSafe: true,
    exclusive: false,
    requiresWorkspace: true,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  sha256: {
    toolName: "sha256",
    source: "fixed",
    category: "workspace_fs",
    riskLevel: "read",
    readOnly: true,
    mutatesState: false,
    parallelSafe: true,
    exclusive: false,
    requiresWorkspace: true,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  write: {
    toolName: "write",
    source: "fixed",
    category: "workspace_fs",
    riskLevel: "write",
    readOnly: false,
    mutatesState: true,
    parallelSafe: false,
    exclusive: true,
    requiresWorkspace: true,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  edit: {
    toolName: "edit",
    source: "fixed",
    category: "workspace_fs",
    riskLevel: "write",
    readOnly: false,
    mutatesState: true,
    parallelSafe: false,
    exclusive: true,
    requiresWorkspace: true,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  bash: {
    toolName: "bash",
    source: "fixed",
    category: "workspace_shell",
    riskLevel: "sensitive",
    readOnly: false,
    mutatesState: true,
    parallelSafe: false,
    exclusive: true,
    requiresWorkspace: true,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  terminal_start: {
    toolName: "terminal_start",
    source: "fixed",
    category: "terminal",
    riskLevel: "sensitive",
    readOnly: false,
    mutatesState: true,
    parallelSafe: false,
    exclusive: true,
    requiresWorkspace: true,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  terminal_read: {
    toolName: "terminal_read",
    source: "fixed",
    category: "terminal",
    riskLevel: "read",
    readOnly: true,
    mutatesState: false,
    parallelSafe: false,
    exclusive: true,
    requiresWorkspace: true,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  terminal_write: {
    toolName: "terminal_write",
    source: "fixed",
    category: "terminal",
    riskLevel: "sensitive",
    readOnly: false,
    mutatesState: true,
    parallelSafe: false,
    exclusive: true,
    requiresWorkspace: true,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  terminal_stop: {
    toolName: "terminal_stop",
    source: "fixed",
    category: "terminal",
    riskLevel: "write",
    readOnly: false,
    mutatesState: true,
    parallelSafe: false,
    exclusive: true,
    requiresWorkspace: true,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  computer_open_url: {
    toolName: "computer_open_url",
    source: "fixed",
    category: "computer",
    riskLevel: "sensitive",
    readOnly: false,
    mutatesState: true,
    parallelSafe: false,
    exclusive: true,
    requiresWorkspace: true,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  computer_screenshot: {
    toolName: "computer_screenshot",
    source: "fixed",
    category: "computer",
    riskLevel: "read",
    readOnly: true,
    mutatesState: false,
    parallelSafe: false,
    exclusive: true,
    requiresWorkspace: true,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  computer_click: {
    toolName: "computer_click",
    source: "fixed",
    category: "computer",
    riskLevel: "sensitive",
    readOnly: false,
    mutatesState: true,
    parallelSafe: false,
    exclusive: true,
    requiresWorkspace: true,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  computer_type: {
    toolName: "computer_type",
    source: "fixed",
    category: "computer",
    riskLevel: "sensitive",
    readOnly: false,
    mutatesState: true,
    parallelSafe: false,
    exclusive: true,
    requiresWorkspace: true,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  computer_keypress: {
    toolName: "computer_keypress",
    source: "fixed",
    category: "computer",
    riskLevel: "sensitive",
    readOnly: false,
    mutatesState: true,
    parallelSafe: false,
    exclusive: true,
    requiresWorkspace: true,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  computer_scroll: {
    toolName: "computer_scroll",
    source: "fixed",
    category: "computer",
    riskLevel: "sensitive",
    readOnly: false,
    mutatesState: true,
    parallelSafe: false,
    exclusive: true,
    requiresWorkspace: true,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
  computer_stop: {
    toolName: "computer_stop",
    source: "fixed",
    category: "computer",
    riskLevel: "write",
    readOnly: false,
    mutatesState: true,
    parallelSafe: false,
    exclusive: true,
    requiresWorkspace: true,
    requiresCommunity: false,
    requiresMcpSession: false,
  },
};

const RISK_LEVELS = ["read", "write", "sensitive"] as const;
function emptyRiskCounts(): Record<RuntimeToolRiskLevel, number> {
  return {
    read: 0,
    write: 0,
    sensitive: 0,
  };
}

function emptyCategoryCounts(): Record<RuntimeToolCategory, number> {
  return {
    docs: 0,
    community: 0,
    web: 0,
    workspace_fs: 0,
    workspace_shell: 0,
    terminal: 0,
    computer: 0,
    mcp: 0,
    resolver: 0,
    unknown: 0,
  };
}

function normalizeRiskLevel(value: unknown): RuntimeToolRiskLevel {
  return RISK_LEVELS.includes(value as RuntimeToolRiskLevel)
    ? (value as RuntimeToolRiskLevel)
    : "sensitive";
}

export function getFixedRuntimeToolPolicy(
  toolName: RetrievalToolName,
): RuntimeToolPolicy {
  return FIXED_TOOL_POLICIES[toolName];
}

export function getUnknownRuntimeToolPolicy(toolName: string): RuntimeToolPolicy {
  return {
    toolName,
    source: "unknown",
    category: "unknown",
    riskLevel: "sensitive",
    readOnly: false,
    mutatesState: true,
    parallelSafe: false,
    exclusive: true,
    requiresWorkspace: false,
    requiresCommunity: false,
    requiresMcpSession: false,
  };
}

export function getResolverRuntimeToolPolicy(toolName: string): RuntimeToolPolicy {
  return {
    toolName,
    source: "resolver",
    category: "resolver",
    riskLevel: "read",
    readOnly: false,
    mutatesState: true,
    parallelSafe: false,
    exclusive: true,
    requiresWorkspace: false,
    requiresCommunity: false,
    requiresMcpSession: false,
  };
}

export function getMountedRuntimeToolPolicy(
  tool: RuntimeMountedToolPolicyInput,
): RuntimeToolPolicy {
  const riskLevel = normalizeRiskLevel(tool.risk_level);
  const readOnly = riskLevel === "read";
  return {
    toolName: tool.runtime_tool_name,
    source: "mounted_mcp",
    category: "mcp",
    riskLevel,
    readOnly,
    mutatesState: !readOnly,
    parallelSafe: false,
    exclusive: true,
    requiresWorkspace: false,
    requiresCommunity: tool.scope === "community",
    requiresMcpSession: true,
  };
}

export function summarizeRuntimeToolPolicies(
  policies: readonly RuntimeToolPolicy[],
): RuntimeToolPolicySummary {
  const byRiskLevel = emptyRiskCounts();
  const byCategory = emptyCategoryCounts();
  const summary: RuntimeToolPolicySummary = {
    total: policies.length,
    readOnly: 0,
    mutating: 0,
    parallelSafe: 0,
    exclusive: 0,
    requiresWorkspace: 0,
    requiresCommunity: 0,
    requiresMcpSession: 0,
    byRiskLevel,
    byCategory,
  };

  for (const policy of policies) {
    if (policy.readOnly) summary.readOnly += 1;
    if (policy.mutatesState) summary.mutating += 1;
    if (policy.parallelSafe) summary.parallelSafe += 1;
    if (policy.exclusive) summary.exclusive += 1;
    if (policy.requiresWorkspace) summary.requiresWorkspace += 1;
    if (policy.requiresCommunity) summary.requiresCommunity += 1;
    if (policy.requiresMcpSession) summary.requiresMcpSession += 1;
    byRiskLevel[policy.riskLevel] += 1;
    byCategory[policy.category] += 1;
  }

  return summary;
}

export function buildRuntimeToolPolicySurface(params: {
  fixedToolNames: readonly RetrievalToolName[];
  includeResolver: boolean;
  resolverToolName: string;
  mountedTools: readonly RuntimeMountedToolPolicyInput[];
}): {
  policies: RuntimeToolPolicy[];
  summary: RuntimeToolPolicySummary;
} {
  const policies = [
    ...params.fixedToolNames.map(getFixedRuntimeToolPolicy),
    ...(params.includeResolver
      ? [getResolverRuntimeToolPolicy(params.resolverToolName)]
      : []),
    ...params.mountedTools.map(getMountedRuntimeToolPolicy),
  ];
  return {
    policies,
    summary: summarizeRuntimeToolPolicies(policies),
  };
}

export function isRuntimeToolPolicyParallelEligible(
  policy: RuntimeToolPolicy,
): boolean {
  return policy.parallelSafe && policy.readOnly && !policy.exclusive;
}

function getRuntimeToolScheduleReasons(
  policy: RuntimeToolPolicy,
): RuntimeToolScheduleReason[] {
  const reasons: RuntimeToolScheduleReason[] = [];
  if (isRuntimeToolPolicyParallelEligible(policy)) {
    reasons.push("parallel_safe_read_only");
    return reasons;
  }
  if (policy.source === "unknown") reasons.push("unknown_policy");
  if (policy.exclusive) reasons.push("exclusive_tool");
  if (policy.mutatesState) reasons.push("mutates_state");
  if (!policy.readOnly) reasons.push("not_read_only");
  if (!policy.parallelSafe) reasons.push("not_parallel_safe");
  if (policy.requiresMcpSession) reasons.push("requires_mcp_session");
  return reasons;
}

function riskLevelForShellEffect(effect: ShellCommandEffect): RuntimeToolRiskLevel {
  if (effect === "read_only") return "read";
  if (effect === "writes_workspace") return "write";
  return "sensitive";
}

export function getShellCommandAuditMetadataForToolCall(params: {
  toolName: string;
  normalizedArgs?: Record<string, unknown>;
}): RuntimeShellCommandAuditMetadata | null {
  if (String(params.toolName ?? "").trim() !== "bash") return null;
  const command = String(params.normalizedArgs?.command ?? "").trim();
  if (!command) return null;
  const classification = classifyShellCommand(command);
  return {
    shell_command_effect: classification.effect,
    shell_command_audit_severity: classification.auditSeverity,
    shell_command_reasons: classification.reasons,
    shell_command_parsed_commands: classification.parsedCommands,
  };
}

function getEffectiveRuntimeToolPolicyForSchedule(params: {
  toolName: string;
  basePolicy: RuntimeToolPolicy;
  normalizedArgs?: Record<string, unknown>;
}): {
  policy: RuntimeToolPolicy;
  shellClassification?: ReturnType<typeof classifyShellCommand>;
} {
  if (params.toolName !== "bash") {
    return { policy: params.basePolicy };
  }
  const command = String(params.normalizedArgs?.command ?? "").trim();
  if (!command) {
    return { policy: params.basePolicy };
  }
  const shellClassification = classifyShellCommand(command);
  const isReadOnlyShell = shellClassification.effect === "read_only";
  return {
    policy: {
      ...params.basePolicy,
      riskLevel: riskLevelForShellEffect(shellClassification.effect),
      readOnly: isReadOnlyShell,
      mutatesState: !isReadOnlyShell,
      parallelSafe: isReadOnlyShell,
      exclusive: !isReadOnlyShell,
    },
    shellClassification,
  };
}

export function classifyRuntimeToolSchedule(params: {
  toolCalls: readonly RuntimeToolScheduleInputCall[];
  policies: readonly RuntimeToolPolicy[];
  enableParallelReadBatches?: boolean;
}): RuntimeToolSchedulePlan {
  const policiesByToolName = new Map<string, RuntimeToolPolicy>();
  for (const policy of params.policies) {
    if (!policiesByToolName.has(policy.toolName)) {
      policiesByToolName.set(policy.toolName, policy);
    }
  }

  const calls = params.toolCalls.map((toolCall, fallbackIndex) => {
    const toolName = String(toolCall.toolName ?? "").trim();
    const basePolicy =
      policiesByToolName.get(toolName) ?? getUnknownRuntimeToolPolicy(toolName);
    const { policy, shellClassification } = getEffectiveRuntimeToolPolicyForSchedule({
      toolName,
      basePolicy,
      normalizedArgs: toolCall.normalizedArgs,
    });
    return {
      providerCallId: String(toolCall.providerCallId ?? "").trim(),
      toolName,
      index:
        typeof toolCall.index === "number" && Number.isFinite(toolCall.index)
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
      requiresMcpSession: policy.requiresMcpSession,
      ...(shellClassification
        ? {
            shellCommandEffect: shellClassification.effect,
            shellCommandAuditSeverity: shellClassification.auditSeverity,
            shellCommandReasons: shellClassification.reasons,
            shellCommandParsedCommands: shellClassification.parsedCommands,
          }
        : {}),
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
    requiresMcpSession: 0,
  };

  for (const call of calls) {
    if (call.parallelEligible) summary.parallelEligible += 1;
    if (call.exclusive) summary.exclusive += 1;
    if (call.source === "unknown") summary.unknown += 1;
    if (call.mutatesState) summary.mutating += 1;
    if (call.readOnly) summary.readOnly += 1;
    if (call.requiresWorkspace) summary.requiresWorkspace += 1;
    if (call.requiresCommunity) summary.requiresCommunity += 1;
    if (call.requiresMcpSession) summary.requiresMcpSession += 1;
  }

  const allCallsParallelEligible =
    calls.length > 1 && summary.parallelEligible === calls.length;
  if (params.enableParallelReadBatches === true && allCallsParallelEligible) {
    return {
      decision: "parallel_read_batch_enabled",
      executionMode: "parallel_read_batch",
      reason: "parallel_read_batch_enabled",
      calls,
      summary,
    };
  }

  const reason =
    calls.length <= 1
      ? "single_tool_call_serialized"
      : allCallsParallelEligible
        ? "parallel_capable_batch_serialized"
        : "contains_non_parallel_tools";

  return {
    decision: "serial_execution_enforced",
    executionMode: "serial_batch",
    reason,
    calls,
    summary,
  };
}
