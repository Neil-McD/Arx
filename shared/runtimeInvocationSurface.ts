import type { CapabilityFamily } from "./canonicalGateEngine.ts";
import type { RetrievalToolName } from "./retrievalTools.ts";
import { COMMUNITY_CONVERSATION_PREFIX } from "./communityConversationIdentity.ts";

export type RuntimeInvocationSurface = "member_agent_dock";

export type RuntimeInvocationFundingPolicy = "community_owner";

export const COMMUNITY_AGENT_THREAD_KEY_PREFIX = "member-agent";
export const COMMUNITY_AGENT_GLOBAL_SCOPE_KEY = "global";

const COMMUNITY_AGENT_DOCK_CAPABILITY_FAMILY_SET = new Set<CapabilityFamily>([
  "product_docs",
  "community_tools",
  "web_research",
]);

const COMMUNITY_AGENT_DOCK_TOOL_NAME_SET = new Set<RetrievalToolName>([
  "polynet_list",
  "polynet_read",
  "polynet_search",
  "polynet_write",
  "polynet_call",
  "web_research",
  "web_crawl",
]);

export function normalizeRuntimeInvocationSurface(
  raw: unknown,
): RuntimeInvocationSurface | null {
  const value = String(raw ?? "").trim();
  if (value === "member_agent_dock") return value;
  return null;
}

export function resolveRuntimeInvocationFundingPolicy(
  invocationSurface: RuntimeInvocationSurface,
): RuntimeInvocationFundingPolicy {
  if (invocationSurface !== "member_agent_dock") {
    throw new Error("invalid_runtime_invocation_surface");
  }
  return "community_owner";
}

export function resolveRuntimeInvocationSurfaceForThread(params: {
  requestedSurface: unknown;
  threadKey: string;
}): RuntimeInvocationSurface | null {
  const requestedSurface = normalizeRuntimeInvocationSurface(
    params.requestedSurface,
  );
  if (!requestedSurface) return null;
  const threadKey = String(params.threadKey ?? "").trim();
  const threadSurface = threadKey.startsWith(COMMUNITY_CONVERSATION_PREFIX) ? "member_agent_dock" : threadKey.startsWith(
    `${COMMUNITY_AGENT_THREAD_KEY_PREFIX}:`,
  )
    ? "member_agent_dock"
    : null;
  return requestedSurface === threadSurface ? requestedSurface : null;
}

export function buildCommunityAgentThreadKey(communityId: string): string {
  const normalizedCommunityId = String(communityId ?? "").trim();
  if (!normalizedCommunityId)
    throw new Error("member_agent_community_required");
  return `${COMMUNITY_AGENT_THREAD_KEY_PREFIX}:${normalizedCommunityId}`.slice(
    0,
    200,
  );
}

export function buildGlobalCommunityAgentEpisodeThreadKey(
  ordinal: number,
): string {
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) {
    throw new Error("member_agent_episode_ordinal_invalid");
  }
  return `${COMMUNITY_AGENT_THREAD_KEY_PREFIX}:${COMMUNITY_AGENT_GLOBAL_SCOPE_KEY}:episode:${ordinal}`;
}

export function isGlobalCommunityAgentEpisodeThreadKey(
  threadKey: string,
): boolean {
  const normalizedThreadKey = String(threadKey ?? "").trim();
  const prefix = `${COMMUNITY_AGENT_THREAD_KEY_PREFIX}:${COMMUNITY_AGENT_GLOBAL_SCOPE_KEY}:episode:`;
  return (
    normalizedThreadKey.startsWith(prefix) &&
    /^[1-9]\d*$/.test(normalizedThreadKey.slice(prefix.length))
  );
}

export function isReadOnlyLegacyCommunityAgentThreadKey(
  threadKey: string,
): boolean {
  // Every member-agent conversation predates the one community agent: per-community
  // threads and the retired personal agent's global episodes are history only.
  const normalizedThreadKey = String(threadKey ?? "").trim();
  return normalizedThreadKey.startsWith(`${COMMUNITY_AGENT_THREAD_KEY_PREFIX}:`);
}

export function isCommunityAgentThreadKeyForCommunity(
  threadKey: string,
  communityId: string,
): boolean {
  const normalizedThreadKey = String(threadKey ?? "").trim();
  const legacyKey = buildCommunityAgentThreadKey(communityId);
  if (normalizedThreadKey === legacyKey) return true;
  const episodeOrdinal = normalizedThreadKey.slice(
    `${legacyKey}:episode:`.length,
  );
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
    throw new Error("invalid_runtime_invocation_surface");
  }
  return params.capabilityFamilies.filter((family) =>
    COMMUNITY_AGENT_DOCK_CAPABILITY_FAMILY_SET.has(family),
  );
}

export function restrictToolNamesForInvocationSurface(params: {
  invocationSurface: RuntimeInvocationSurface;
  toolNames: readonly RetrievalToolName[];
}): RetrievalToolName[] {
  if (params.invocationSurface !== "member_agent_dock") {
    throw new Error("invalid_runtime_invocation_surface");
  }
  return params.toolNames.filter((toolName) =>
    COMMUNITY_AGENT_DOCK_TOOL_NAME_SET.has(toolName),
  );
}

// The dock is the community's Agent page: the one community agent in a private
// conversation with the member.
export function buildRuntimeInvocationSurfacePrompt(
  invocationSurface: RuntimeInvocationSurface,
): string {
  if (invocationSurface !== "member_agent_dock") {
    throw new Error("invalid_runtime_invocation_surface");
  }
  return [
    "INVOCATION_SURFACE",
    "You are this community's agent in a private conversation with the authenticated member.",
    "Use the server-provided community instructions and authorized member context. This conversation belongs only to this member within this community.",
    "Your identity does not grant administrative authority. Tools enforce the requesting member's current permissions; never claim owner or autonomous-workflow privileges.",
    "Keep private conversations and builder-private workflow notes separate. Do not expose another member's information.",
    "Only use the mounted community repository. Start with polynet_list at / and follow returned paths. Never invent paths or operations.",
    "Use polynet_read and polynet_search for evidence. Make changes only when explicitly requested and authorized, using the existing approval process.",
    "Prior sessions are not automatically injected. Never claim memory without evidence available in this turn.",
    "Do not claim to have completed an action unless the tool result confirms it.",
  ].join("\n");
}
