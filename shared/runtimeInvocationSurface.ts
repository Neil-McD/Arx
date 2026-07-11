import type { CapabilityFamily } from "./canonicalGateEngine.ts";
import type { RetrievalToolName } from "./retrievalTools.ts";

export type RuntimeInvocationSurface = "workspace" | "member_agent_dock";

export const MEMBER_AGENT_THREAD_KEY_PREFIX = "member-agent";

const MEMBER_AGENT_DOCK_CAPABILITY_FAMILY_SET = new Set<CapabilityFamily>([
  "product_docs",
  "community_tools",
]);

const MEMBER_AGENT_DOCK_TOOL_NAME_SET = new Set<RetrievalToolName>([
  "search_product_docs",
  "get_product_doc",
  "get_active_community_context",
  "community_resources_map",
  "community_resources_read",
  "community_resources_list",
  "community_resource_read",
  "community_resources_search",
  "community_search",
]);

export function normalizeRuntimeInvocationSurface(raw: unknown): RuntimeInvocationSurface {
  return String(raw ?? "").trim() === "member_agent_dock"
    ? "member_agent_dock"
    : "workspace";
}

export function resolveRuntimeInvocationSurfaceForThread(params: {
  requestedSurface: unknown;
  threadKey: string;
}): RuntimeInvocationSurface {
  const threadKey = String(params.threadKey ?? "").trim();
  if (threadKey.startsWith(`${MEMBER_AGENT_THREAD_KEY_PREFIX}:`)) {
    return "member_agent_dock";
  }
  return normalizeRuntimeInvocationSurface(params.requestedSurface);
}

export function buildMemberAgentThreadKey(communityId: string): string {
  const normalizedCommunityId = String(communityId ?? "").trim();
  if (!normalizedCommunityId) throw new Error("member_agent_community_required");
  return `${MEMBER_AGENT_THREAD_KEY_PREFIX}:${normalizedCommunityId}`.slice(0, 200);
}

export function restrictCapabilityFamiliesForInvocationSurface(params: {
  invocationSurface: RuntimeInvocationSurface;
  capabilityFamilies: readonly CapabilityFamily[];
}): CapabilityFamily[] {
  if (params.invocationSurface !== "member_agent_dock") {
    return [...params.capabilityFamilies];
  }
  return params.capabilityFamilies.filter((family) =>
    MEMBER_AGENT_DOCK_CAPABILITY_FAMILY_SET.has(family),
  );
}

export function restrictToolNamesForInvocationSurface(params: {
  invocationSurface: RuntimeInvocationSurface;
  toolNames: readonly RetrievalToolName[];
}): RetrievalToolName[] {
  if (params.invocationSurface !== "member_agent_dock") {
    return [...params.toolNames];
  }
  return params.toolNames.filter((toolName) =>
    MEMBER_AGENT_DOCK_TOOL_NAME_SET.has(toolName),
  );
}

export function buildRuntimeInvocationSurfacePrompt(
  invocationSurface: RuntimeInvocationSurface,
): string | null {
  if (invocationSurface !== "member_agent_dock") return null;
  return [
    "INVOCATION_SURFACE",
    "You are speaking in the member's private agent dock inside the active community.",
    "You are the member's own Polynet agent working under this community lens.",
    "You are not the community's agent. The community has a separate community-owned agent on community surfaces.",
    "Treat this as a normal private conversation with the member. Use community context when relevant without pretending to speak for the community.",
    "Only the listed read tools are available on this surface. Do not propose or attempt workspace, sandbox, web, MCP, autonomous cognition, or community publishing actions.",
    "Do not mention plans, Premium, upgrades, billing, unavailable tools, or provider limits unless the member directly asks about them.",
  ].join("\n");
}
