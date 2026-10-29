import type { Doc } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { communityMembershipRowIsActive } from "./communityCore";
import { getCommunityChannelCapabilities, resolveCommunityChannelActor } from "./communityChannelAccess";
import type { CommunityMemberServiceChannel } from "../shared/communityMembershipContext";

/** Caller establishes builder/workflow authority. Never repairs grants. */
export async function bindMemberServiceChannel(args: {
  ctx: MutationCtx; membership: Doc<"communityMemberships">;
  channelId: Doc<"communityChannels">["_id"] | null; expectedRevision: number;
}) {
  const { ctx, membership, channelId, expectedRevision } = args;
  const revision = membership.serviceChannelRevision ?? 0;
  if (!communityMembershipRowIsActive(membership)) throw new Error("community_member_workflow_member_not_found");
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== revision) throw new Error("community_member_service_channel_revision_conflict");
  if (channelId !== null && (await resolveMemberServiceChannel({ ctx, membership, channelId })).status !== "available") {
    throw new Error("community_member_service_channel_unavailable");
  }
  if ((membership.serviceChannelId ?? null) === channelId) return { revision };
  await ctx.db.patch(membership._id, { serviceChannelId: channelId ?? undefined,
    serviceChannelRevision: revision + 1, updatedAt: Date.now() });
  return { revision: revision + 1 };
}

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
    // The welcome flow holds the member out of rooms for now; it does not change
    // which room is theirs, so a join rule can still set it up during the hold.
    const actorArgs = { ctx, communityId: membership.communityId, userId: membership.userId, allowWelcome: true };
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

/** Additional disclosure boundary for member-supplied form evidence, not a new
 * channel access policy. Call again in the publication transaction. Managers
 * already have canonical private-room access; other client grants are forbidden.
 */
export async function requireMemberFormServiceAudience(args: {
  ctx: QueryCtx; membership: Doc<"communityMemberships">;
}) {
  const { ctx, membership } = args;
  const destination = await resolveMemberServiceChannel(args);
  if (destination.status !== "available" || !membership.serviceChannelId) {
    throw new Error("workflow_form_audience_unavailable");
  }
  const channel = (await ctx.db.get(membership.serviceChannelId))!;
  const grants = await ctx.db.query("communityChannelParticipants")
    .withIndex("by_channel_principal", q => q.eq("channelId", channel._id)).take(201);
  // Fail closed rather than silently skipping uninspected audience rows.
  if (grants.length > 200) throw new Error("workflow_form_audience_unavailable");
  for (const grant of grants) {
    if (grant.status !== "active") continue;
    if (grant.communityId !== membership.communityId) throw new Error("workflow_form_audience_unavailable");
    if (grant.principalKey === "community_agent") continue;
    const participant = grant.membershipId ? await ctx.db.get(grant.membershipId) : null;
    if (!participant || participant.communityId !== membership.communityId ||
      grant.principalKey !== `user:${participant.userId}`) throw new Error("workflow_form_audience_unavailable");
    // Old activation grants do not authorize reading under canonical channel policy.
    if (!communityMembershipRowIsActive(participant) ||
      grant.membershipActivationSequence !== (participant.activationSequence ?? 0)) continue;
    try {
      // A participant still in the welcome flow counts as the reader they will become.
      const actor = await resolveCommunityChannelActor({ ctx, communityId: membership.communityId, userId: participant.userId, allowWelcome: true });
      const capabilities = await getCommunityChannelCapabilities({ ctx, channel, actor });
      if (capabilities.canRead && participant._id !== membership._id && !actor.isManager) {
        throw new Error("workflow_form_audience_unavailable");
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("community_")) {
        throw new Error("workflow_form_audience_unavailable");
      }
      throw error;
    }
  }
  return { policy: "member_and_managers" as const, channel_id: destination.channel_id,
    service_channel_revision: destination.revision };
}
