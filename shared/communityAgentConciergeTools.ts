import type { RetrievalToolName } from "./retrievalTools.ts";
import {
  buildResponsesApiFunctionTools,
  normalizeToolArguments,
} from "./toolRegistry.ts";

export const COMMUNITY_AGENT_CONCIERGE_TOOL_NAMES = [
  "polynet_list",
  "polynet_read",
  "polynet_search",
  "polynet_write",
  "polynet_call",
] as const satisfies readonly RetrievalToolName[];

export type CommunityAgentConciergeToolName =
  (typeof COMMUNITY_AGENT_CONCIERGE_TOOL_NAMES)[number];

const COMMUNITY_AGENT_CONCIERGE_TOOL_NAME_SET = new Set<string>(
  COMMUNITY_AGENT_CONCIERGE_TOOL_NAMES,
);

export function isCommunityAgentConciergeToolName(
  value: unknown,
): value is CommunityAgentConciergeToolName {
  return COMMUNITY_AGENT_CONCIERGE_TOOL_NAME_SET.has(String(value ?? ""));
}

export function buildCommunityAgentConciergeFunctionTools() {
  return buildResponsesApiFunctionTools(COMMUNITY_AGENT_CONCIERGE_TOOL_NAMES);
}

export function normalizeCommunityAgentConciergeToolArguments(
  toolName: CommunityAgentConciergeToolName,
  rawArgs: Record<string, unknown>,
): Record<string, unknown> {
  if (!isCommunityAgentConciergeToolName(toolName)) {
    throw new Error("community_agent_concierge_tool_not_allowed");
  }
  return normalizeToolArguments(toolName, rawArgs);
}
