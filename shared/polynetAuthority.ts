import type { CommunityAccess } from "./communityTypes.ts";

export type PolynetHumanAuthorityLane = "member" | "builder";
export type PolynetPrincipalKind =
  | "community_agent_for_member"
  | "external_mcp"
  | "community_agent"
  | "community_app";

export type PolynetResolvedAuthority = {
  principalKind: PolynetPrincipalKind;
  lane: PolynetHumanAuthorityLane;
  relation: "owner" | "admin" | "moderator" | "member";
  canReadMemberProjection: true;
  canWriteParticipation: boolean;
  canUseBuilderProjection: boolean;
  // The moderator lens (owners, admins and moderators): review join requests
  // and remove anyone's post. Never through a community app or the agent.
  canReviewJoinRequests: boolean;
  canModerateContent: boolean;
};

function normalizeRelation(
  raw: unknown,
): PolynetResolvedAuthority["relation"] | null {
  const relation = String(raw ?? "").trim().toLowerCase();
  if (
    relation === "owner" ||
    relation === "admin" ||
    relation === "moderator" ||
    relation === "member"
  ) {
    return relation;
  }
  return null;
}

export function derivePolynetHumanAuthority(args: {
  access: Partial<CommunityAccess>;
  principalKind: "community_agent_for_member" | "external_mcp" | "community_app";
}): PolynetResolvedAuthority | null {
  const relation = normalizeRelation(args.access.relation);
  if (
    !relation ||
    args.access.is_entitled !== true ||
    (args.access.can_enter_community !== true &&
      args.access.can_read_chat !== true)
  ) {
    return null;
  }
  // A community app acts for its member but never with builder authority, even
  // when that member owns the community.
  const lane: PolynetHumanAuthorityLane =
    args.principalKind !== "community_app" &&
    (relation === "owner" || relation === "admin") &&
    args.access.can_manage_resources === true
      ? "builder"
      : "member";
  return {
    principalKind: args.principalKind,
    lane,
    relation,
    canReadMemberProjection: true,
    canWriteParticipation:
      args.access.can_post_chat === true ||
      args.access.can_post_message === true,
    canUseBuilderProjection: lane === "builder",
    canReviewJoinRequests: args.principalKind === "external_mcp" && args.access.can_review_join_requests === true,
    canModerateContent: args.principalKind === "external_mcp" && args.access.can_moderate_content === true,
  };
}

export function derivePolynetCommunityAgentAuthority(): PolynetResolvedAuthority {
  return {
    principalKind: "community_agent",
    lane: "member",
    relation: "member",
    canReadMemberProjection: true,
    canWriteParticipation: true,
    canUseBuilderProjection: false,
    canReviewJoinRequests: false,
    canModerateContent: false,
  };
}
