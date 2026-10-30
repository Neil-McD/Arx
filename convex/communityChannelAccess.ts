import {
  getUniqueCommunityMembershipByPair,
  normalizeIdValue,
  requireCommunityChatAccess,
} from "./communityCore";

export type ChannelActorKind = "human" | "community_agent_for_member" | "external_mcp" | "community_agent";
export type ChannelCapabilities = { canRead: boolean; canPost: boolean; canReply: boolean; canManage: boolean };
export type ChannelPolicy = {
  _id?: any;
  communityId: any;
  status: "active" | "archived";
  accessMode: "all_members" | "restricted";
  postingPolicy: "members" | "managers";
  replyPolicy?: "members" | "managers" | "disabled";
};

// Constructed by server handlers AFTER authenticating the caller. Never accept
// this object, its manager bit, or its principal key from a public API argument.
export type ChannelActor = {
  communityId: any;
  kind: ChannelActorKind;
  principalKey: string;
  isManager: boolean;
  membershipId?: string;
  membershipActivationSequence?: number;
};

export async function resolveCommunityChannelActor(args: {
  ctx: any; communityId: any; userId: any; kind?: ChannelActorKind;
  /** Destination and audience checks only: judge the member as they will be once the welcome flow ends. */
  allowWelcome?: boolean;
}): Promise<ChannelActor> {
  const kind = args.kind ?? "human";
  if (!["human", "community_agent_for_member", "external_mcp", "community_agent"].includes(kind)) {
    throw new Error("community_channel_actor_invalid");
  }
  const { community } = await requireCommunityChatAccess(args);
  // A sponsor keeps the community run authorized, but never lends their
  // private-room grants or administrative privileges to the community agent.
  if (kind === "community_agent") {
    return { communityId: community._id, kind, principalKey: "community_agent", isManager: false };
  }
  const membership = normalizeIdValue(community.ownerId) === normalizeIdValue(args.userId)
    ? null
    : await getUniqueCommunityMembershipByPair(args);
  return {
    communityId: community._id,
    kind,
    principalKey: `user:${normalizeIdValue(args.userId)}`,
    isManager: normalizeIdValue(community.ownerId) === normalizeIdValue(args.userId) || membership?.role === "admin",
    ...(membership ? {
      membershipId: normalizeIdValue(membership._id),
      membershipActivationSequence: Math.max(0, Math.floor(Number(membership.activationSequence ?? 0))),
    } : {}),
  };
}

export function evaluateCommunityChannelCapabilities(args: {
  channel: ChannelPolicy; actor: ChannelActor; hasGrant: boolean;
}): ChannelCapabilities {
  const { channel, actor, hasGrant } = args;
  const denied = { canRead: false, canPost: false, canReply: false, canManage: false };
  if (
    !["human", "community_agent_for_member", "external_mcp", "community_agent"].includes(actor.kind) ||
    !actor.principalKey ||
    !normalizeIdValue(channel.communityId) ||
    normalizeIdValue(channel.communityId) !== normalizeIdValue(actor.communityId) ||
    channel.status !== "active" ||
    !["all_members", "restricted"].includes(channel.accessMode) ||
    !["members", "managers"].includes(channel.postingPolicy) ||
    !["members", "managers", "disabled"].includes(channel.replyPolicy ?? "members")
  ) return denied;
  const manager = actor.kind !== "community_agent" && actor.isManager;
  const canRead = channel.accessMode === "all_members" || manager || hasGrant;
  const publisher = manager || (actor.kind === "community_agent" && hasGrant);
  return {
    canRead,
    canPost: canRead && (channel.postingPolicy === "members" || publisher),
    canReply: canRead && (channel.replyPolicy !== "disabled") &&
      ((channel.replyPolicy ?? "members") === "members" || publisher),
    canManage: canRead && actor.kind === "human" && manager,
  };
}

export async function getCommunityChannelCapabilities(args: {
  ctx: any; channel: ChannelPolicy; actor: ChannelActor;
}): Promise<ChannelCapabilities> {
  let hasGrant = false;
  if (args.channel._id && normalizeIdValue(args.channel.communityId) === normalizeIdValue(args.actor.communityId)) {
    // Shared member-post rooms need no grant lookup. Manager-only publishing
    // by a community agent, and all restricted access, require an exact grant.
    if (args.channel.accessMode === "restricted" || args.channel.postingPolicy === "managers" || args.channel.replyPolicy === "managers") {
      const rows = await args.ctx.db.query("communityChannelParticipants")
        .withIndex("by_channel_principal", (q: any) =>
          q.eq("channelId", args.channel._id).eq("principalKey", args.actor.principalKey))
        .take(2);
      if (rows.length > 1) throw new Error("community_channel_participant_duplicate");
      const grant = rows[0];
      hasGrant = grant?.status === "active" &&
        normalizeIdValue(grant.communityId) === normalizeIdValue(args.channel.communityId) &&
        (args.actor.kind === "community_agent" || (
          Boolean(args.actor.membershipId) &&
          normalizeIdValue(grant.membershipId) === args.actor.membershipId &&
          grant.membershipActivationSequence === args.actor.membershipActivationSequence
        ));
    }
  }
  return evaluateCommunityChannelCapabilities({ ...args, hasGrant });
}

export async function requireCommunityChannelCapability(args: {
  ctx: any; channel: ChannelPolicy; actor: ChannelActor; capability: keyof ChannelCapabilities;
}): Promise<ChannelCapabilities> {
  const capabilities = await getCommunityChannelCapabilities(args);
  if (!capabilities[args.capability]) throw new Error("community_channel_unavailable");
  return capabilities;
}
