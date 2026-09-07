import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { communityMembershipRowIsActive } from "./communityCore";
import { getCommunityChannelCapabilities, resolveCommunityChannelActor } from "./communityChannelAccess";
import type { CommunityMemberServiceChannel } from "../shared/communityMembershipContext";

/** Resolves a destination, never grants access or reads channel content. */
export async function resolveMemberServiceChannel(args: {
  ctx: QueryCtx;
  membership: Doc<"communityMemberships"> | null;
  channelId?: Doc<"communityChannels">["_id"];
}): Promise<CommunityMemberServiceChannel> {
  const { ctx, membership } = args;
  const channelId = args.channelId ?? membership?.serviceChannelId;
  const empty = { revision: membership?.serviceChannelRevision ?? 0, channel_id: null, name: null };
  if (!channelId) return { ...empty, status: "unassigned" };
  const unavailable: CommunityMemberServiceChannel = { ...empty, status: "unavailable" };
  if (!membership || !communityMembershipRowIsActive(membership)) return unavailable;
  const channel = await ctx.db.get(channelId);
  if (!channel || channel.communityId !== membership.communityId
    || channel.status !== "active" || channel.accessMode !== "restricted") return unavailable;
  try {
    const actorArgs = { ctx, communityId: membership.communityId, userId: membership.userId };
    const member = await resolveCommunityChannelActor(actorArgs);
    const agent = await resolveCommunityChannelActor({ ...actorArgs, kind: "community_agent" });
    const memberAccess = await getCommunityChannelCapabilities({ ctx, channel, actor: member });
    const agentAccess = await getCommunityChannelCapabilities({ ctx, channel, actor: agent });
    if (!memberAccess.canRead || !agentAccess.canPost) return unavailable;
  } catch (error) {
    // Access/entitlement policy failures are unavailable, infrastructure failures
    // remain errors. In neither case disclose the inaccessible room's identity.
    if (error instanceof Error && error.message.startsWith("community_")) return unavailable;
    throw error;
  }
  return { ...empty, status: "available", channel_id: String(channel._id), name: channel.name };
}
