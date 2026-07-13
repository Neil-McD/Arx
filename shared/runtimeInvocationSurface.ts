import type { CapabilityFamily } from "./canonicalGateEngine.ts";
import type { RetrievalToolName } from "./retrievalTools.ts";
import type { MemberAgentSurfaceContextV1 } from "./memberAgentSurfaceContext.ts";

export type RuntimeInvocationSurface = "workspace" | "member_agent_dock";

export const MEMBER_AGENT_THREAD_KEY_PREFIX = "member-agent";
export const MEMBER_AGENT_GLOBAL_SCOPE_KEY = "global";

const MEMBER_AGENT_DOCK_CAPABILITY_FAMILY_SET = new Set<CapabilityFamily>([
  "product_docs",
  "community_tools",
]);

const MEMBER_AGENT_DOCK_TOOL_NAME_SET = new Set<RetrievalToolName>([
  "search_product_docs",
  "get_product_doc",
  "get_active_community_context",
  "member_conversations_list",
  "member_conversation_read",
  "polynet_list_communities",
  "polynet_get_community",
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

export function buildGlobalMemberAgentEpisodeThreadKey(ordinal: number): string {
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) {
    throw new Error("member_agent_episode_ordinal_invalid");
  }
  return `${MEMBER_AGENT_THREAD_KEY_PREFIX}:${MEMBER_AGENT_GLOBAL_SCOPE_KEY}:episode:${ordinal}`;
}

export function isGlobalMemberAgentEpisodeThreadKey(threadKey: string): boolean {
  const normalizedThreadKey = String(threadKey ?? "").trim();
  const prefix = `${MEMBER_AGENT_THREAD_KEY_PREFIX}:${MEMBER_AGENT_GLOBAL_SCOPE_KEY}:episode:`;
  return normalizedThreadKey.startsWith(prefix) && /^[1-9]\d*$/.test(normalizedThreadKey.slice(prefix.length));
}

export function isReadOnlyLegacyMemberAgentThreadKey(threadKey: string): boolean {
  const normalizedThreadKey = String(threadKey ?? "").trim();
  return (
    normalizedThreadKey.startsWith(`${MEMBER_AGENT_THREAD_KEY_PREFIX}:`) &&
    !isGlobalMemberAgentEpisodeThreadKey(normalizedThreadKey)
  );
}

export function isMemberAgentThreadKeyForCommunity(
  threadKey: string,
  communityId: string,
): boolean {
  const normalizedThreadKey = String(threadKey ?? "").trim();
  const legacyKey = buildMemberAgentThreadKey(communityId);
  if (normalizedThreadKey === legacyKey) return true;
  const episodeOrdinal = normalizedThreadKey.slice(`${legacyKey}:episode:`.length);
  return (
    normalizedThreadKey.startsWith(`${legacyKey}:episode:`) &&
    /^[1-9]\d*$/.test(episodeOrdinal)
  );
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
  surfaceContext?: MemberAgentSurfaceContextV1 | null,
): string | null {
  if (invocationSurface !== "member_agent_dock") return null;
  const hasCommunityLens = surfaceContext?.kind === "community";
  return [
    "INVOCATION_SURFACE",
    "You are speaking in the member's private Polynet agent dock on their current Polynet surface.",
    hasCommunityLens
      ? "You are the member's own Polynet agent working under the server-validated active community lens."
      : "You are the member's own Polynet agent. No community lens is active on this surface.",
    "You are not the community's agent. The community has a separate community-owned agent on community surfaces.",
    "Treat this as a normal private conversation with the member. Use community context when relevant without pretending to speak for the community.",
    "Your conversation episodes belong to this member across Polynet, not to individual communities. Prior episodes are not injected automatically. When the member refers to earlier work and the current episode is insufficient, list their conversations first, then read only the relevant episode before answering.",
    "Never claim to remember a prior conversation unless the current episode or a successful conversation-read tool call supports the claim.",
    "The polynet_list_communities and polynet_get_community tools are native, read-only Polynet directory tools. Use joined scope for the member's communities and discover scope for public Published communities.",
    "Reading another community is temporary inspection only. It never changes the active community lens, the current page, or the conversation episode.",
    "Only the listed read tools are available on this surface. Do not propose or attempt workspace, sandbox, web, external MCP, autonomous cognition, or community publishing actions.",
    "Do not mention plans, Premium, upgrades, billing, unavailable tools, or provider limits unless the member directly asks about them.",
  ].join("\n");
}
