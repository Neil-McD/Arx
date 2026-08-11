import type { CapabilityFamily } from "./canonicalGateEngine.ts";
import type { RetrievalToolName } from "./retrievalTools.ts";
import type { MemberAgentSurfaceContextV1 } from "./memberAgentSurfaceContext.ts";

export type RuntimeInvocationSurface =
  | "workspace"
  | "member_agent_dock"
  | "community_funnel_builder";

export type RuntimeInvocationFundingPolicy =
  | "generic_gate"
  | "community_owner"
  | "platform_managed";

export const MEMBER_AGENT_THREAD_KEY_PREFIX = "member-agent";
export const MEMBER_AGENT_GLOBAL_SCOPE_KEY = "global";
export const COMMUNITY_FUNNEL_THREAD_KEY_PREFIX = "community-funnel";

const MEMBER_AGENT_DOCK_CAPABILITY_FAMILY_SET = new Set<CapabilityFamily>([
  "product_docs",
  "community_tools",
]);

const MEMBER_AGENT_DOCK_TOOL_NAME_SET = new Set<RetrievalToolName>([
  "polynet_list",
  "polynet_read",
  "polynet_search",
  "polynet_write",
  "polynet_call",
]);

const COMMUNITY_FUNNEL_BUILDER_TOOL_NAME_SET = new Set<RetrievalToolName>([
  "polynet_list",
  "polynet_read",
  "polynet_call",
]);

export function normalizeRuntimeInvocationSurface(
  raw: unknown,
): RuntimeInvocationSurface {
  const value = String(raw ?? "").trim();
  if (value === "member_agent_dock" || value === "community_funnel_builder")
    return value;
  return "workspace";
}

export function resolveRuntimeInvocationFundingPolicy(
  invocationSurface: RuntimeInvocationSurface,
): RuntimeInvocationFundingPolicy {
  if (invocationSurface === "member_agent_dock") return "community_owner";
  if (invocationSurface === "community_funnel_builder") {
    return "platform_managed";
  }
  return "generic_gate";
}

export function shouldRecordCommunityOnboardingAgentTurn(params: {
  invocationSurface: RuntimeInvocationSurface;
  surfaceKind: string | null;
  hasCommunityId: boolean;
}): boolean {
  return (
    params.invocationSurface === "member_agent_dock" &&
    params.surfaceKind === "community" &&
    params.hasCommunityId
  );
}

export function resolveRuntimeInvocationSurfaceForThread(params: {
  requestedSurface: unknown;
  threadKey: string;
}): RuntimeInvocationSurface {
  const threadKey = String(params.threadKey ?? "").trim();
  if (threadKey.startsWith(`${MEMBER_AGENT_THREAD_KEY_PREFIX}:`)) {
    return "member_agent_dock";
  }
  if (threadKey.startsWith(`${COMMUNITY_FUNNEL_THREAD_KEY_PREFIX}:`)) {
    return "community_funnel_builder";
  }
  return normalizeRuntimeInvocationSurface(params.requestedSurface);
}

export function buildCommunityFunnelThreadKey(communityId: string): string {
  const normalizedCommunityId = String(communityId ?? "").trim();
  if (!normalizedCommunityId)
    throw new Error("community_funnel_thread_community_required");
  return `${COMMUNITY_FUNNEL_THREAD_KEY_PREFIX}:${normalizedCommunityId}`.slice(
    0,
    200,
  );
}

export function isCommunityFunnelThreadKeyForCommunity(
  threadKey: string,
  communityId: string,
): boolean {
  return (
    String(threadKey ?? "").trim() ===
    buildCommunityFunnelThreadKey(communityId)
  );
}

export function buildMemberAgentThreadKey(communityId: string): string {
  const normalizedCommunityId = String(communityId ?? "").trim();
  if (!normalizedCommunityId)
    throw new Error("member_agent_community_required");
  return `${MEMBER_AGENT_THREAD_KEY_PREFIX}:${normalizedCommunityId}`.slice(
    0,
    200,
  );
}

export function buildGlobalMemberAgentEpisodeThreadKey(
  ordinal: number,
): string {
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) {
    throw new Error("member_agent_episode_ordinal_invalid");
  }
  return `${MEMBER_AGENT_THREAD_KEY_PREFIX}:${MEMBER_AGENT_GLOBAL_SCOPE_KEY}:episode:${ordinal}`;
}

export function isGlobalMemberAgentEpisodeThreadKey(
  threadKey: string,
): boolean {
  const normalizedThreadKey = String(threadKey ?? "").trim();
  const prefix = `${MEMBER_AGENT_THREAD_KEY_PREFIX}:${MEMBER_AGENT_GLOBAL_SCOPE_KEY}:episode:`;
  return (
    normalizedThreadKey.startsWith(prefix) &&
    /^[1-9]\d*$/.test(normalizedThreadKey.slice(prefix.length))
  );
}

export function isReadOnlyLegacyMemberAgentThreadKey(
  threadKey: string,
): boolean {
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
  if (
    params.invocationSurface !== "member_agent_dock" &&
    params.invocationSurface !== "community_funnel_builder"
  ) {
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
  if (params.invocationSurface === "community_funnel_builder") {
    return params.toolNames.filter((toolName) =>
      COMMUNITY_FUNNEL_BUILDER_TOOL_NAME_SET.has(toolName),
    );
  }
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
  if (invocationSurface === "community_funnel_builder") {
    return [
      "INVOCATION_SURFACE",
      "You are Polynet's bounded community funnel composer working for an authorized community manager.",
      "Your only job is to create or revise the current community's manager-only funnel draft.",
      "Start by reading the exact authorized funnel capability and its current state. Use only the manager's instructions and reference attachments, the community identity and description, authorized community resources, and the current draft state as evidence.",
      "Never invent an audience, offer, price, member count, result, testimonial, endorsement, or other proof. Omit unsupported proof and FAQ content instead of manufacturing it.",
      "Build a focused conversion path: an outcome-led hero, one dominant call to action, the saved intro video immediately after the hero when current_state reports one, up to three concise benefits, only supported proof or testimonials, FAQ only for real objections, and a final call to action.",
      "Appearance always inherits the manager's canonical Polynet theme. Set appearance to inherit, then choose accent, density, and corner radius intentionally from the community identity and manager's direction. Do not default every funnel to a rose accent.",
      "Treat reference images only as inspiration for hierarchy, composition, spacing, and mood. Never copy their brand, words, people, claims, or color palette unless the manager explicitly requests that palette.",
      "The draft is a versioned Funnel V1 document made only from the allowed theme tokens and section types. Never propose custom HTML, CSS, JavaScript, external hosting, or a second page.",
      "The manager owns the intro video separately. Compose around the saved video reported in current_state, but never add, replace, remove, or request a media section or video URL in the document.",
      "Read the exact authorized capability under the current community's capabilities directory, then use polynet_call to update the complete draft with its current expected revision.",
      "Never publish, change pricing, change access policy, or claim the draft is live. A human manager controls publication in a later workflow.",
      "After a successful update, briefly summarize the visual direction and the most important conversion choices. Do not print the full JSON document to the user.",
    ].join("\n");
  }
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
    "Your conversation episodes belong to this member across Polynet, not to individual communities. Prior episodes are not injected automatically.",
    "Never claim to remember a prior conversation unless the current episode or evidence explicitly available in this turn supports the claim.",
    "The five Polynet tools expose one server-authorized repository. Start with polynet_list at /, follow returned paths, and never invent paths or operations.",
    "Reading another community is temporary inspection only. It never changes the active community lens, the current page, or the conversation episode.",
    "Use polynet_search and polynet_read for evidence. Use polynet_write only for an explicit member request to post to an authorized channel or stage a manager-authorized resource changeset. Use polynet_call only for an operation first discovered under capabilities/.",
    "Do not propose or attempt workspace, sandbox, external MCP, or autonomous cognition actions from this surface.",
    "Do not mention plans, billing, unavailable tools, or provider limits unless the member directly asks about them.",
  ].join("\n");
}
