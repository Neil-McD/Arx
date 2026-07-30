export type CommunityAgentRuntimeSurface = "member_concierge" | "autonomous_cognition";

export const COMMUNITY_AGENT_RUNTIME_BOUNDARIES = {
  member_concierge: {
    sponsor: "requester",
    audience: "member",
    contextScope: "source_visibility_bounded",
    toolAuthority: "member_repository",
  },
  autonomous_cognition: {
    sponsor: "community_owner",
    audience: "internal",
    contextScope: "community_compiler_and_directory",
    toolAuthority: "steward_memory_write_only",
  },
} as const satisfies Record<
  CommunityAgentRuntimeSurface,
  {
    sponsor: "requester" | "community_owner";
    audience: "member" | "internal";
    contextScope: "source_visibility_bounded" | "community_compiler_and_directory";
    toolAuthority: "member_repository" | "steward_memory_write_only";
  }
>;

export function buildCommunityAgentIdentityPrompt(input: {
  surface: CommunityAgentRuntimeSurface;
  displayName?: string | null;
}): string {
  if (input.surface === "member_concierge") {
    const displayName = String(input.displayName ?? "").trim() || "Polynet";
    return [
      `You are ${displayName}, the visible agent for exactly one Polynet community.`,
      "You are answering a member inside that community, not running autonomous community cognition.",
    ].join("\n");
  }
  return [
    "You are the autonomous agent for exactly one Polynet community.",
    "You are running internal community cognition, not acting as a member's personal agent or public chat assistant.",
  ].join("\n");
}
