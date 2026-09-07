import { v } from "convex/values";
import { internal } from "./_generated/api";
import { communityMembershipRowIsActive, requireCommunityManager } from "./communityCore";
import { communityIsActive, normalizeCommunityLifecycle } from "../shared/communityLifecycle";
import { getCommunityMemberWorkflowByCommunity, getMemberMilestone, resolveCurrentMilestone } from "./communityMemberWorkflowReadCore";
import { createActiveCommunityChannel, MAX_COMMUNITY_CHANNEL_NAME_CHARS } from "./communityChannelCore";
import { setChannelParticipantCore } from "./communityChannelParticipants";
import { bindMemberServiceChannel, requireMemberFormServiceAudience } from "./communityMemberServiceChannelCore";

export const workflowJoinArgs = {
  membershipId: v.id("communityMemberships"), workflowId: v.id("communityMemberWorkflows"),
  workflowRevision: v.number(), lifecycleGeneration: v.number(),
  serviceChannelRevision: v.number(), activatedAt: v.number(),
};

/** Called transactionally only on first membership creation. Not an activity-feed hook. */
export async function scheduleFirstMemberWorkflowJoin(ctx: any, membership: any) {
  if (membership.activationSequence !== 1 || membership.role !== "member") return;
  const workflow = await getCommunityMemberWorkflowByCommunity({ ctx, communityId: membership.communityId });
  if (!workflow?.milestones[0]?.automations.some(a => a.trigger.type === "member_joined")) return;
  const community = await ctx.db.get(membership.communityId);
  if (!community || !communityIsActive(community)) return;
  await ctx.scheduler.runAfter(0, (internal as any).communityMemberWorkflows.handleFirstMemberJoinInternal, {
    membershipId: membership._id, workflowId: workflow._id, workflowRevision: workflow.revision,
    lifecycleGeneration: normalizeCommunityLifecycle(community).generation,
    serviceChannelRevision: membership.serviceChannelRevision ?? 0, activatedAt: membership.activatedAt,
  });
}

/** A queued join cannot pick up later builder edits, another activation, or milestone entry. */
export async function resolveFirstMemberWorkflowJoin(ctx: any, args: any) {
  const membership = await ctx.db.get(args.membershipId);
  const workflow = await ctx.db.get(args.workflowId);
  if (!workflow || workflow.revision !== args.workflowRevision || !communityMembershipRowIsActive(membership)
    || membership.communityId !== workflow.communityId || membership.role !== "member"
    || membership.activationSequence !== 1 || membership.activatedAt !== args.activatedAt) return null;
  const community = await ctx.db.get(workflow.communityId);
  if (!community || !communityIsActive(community)
    || normalizeCommunityLifecycle(community).generation !== args.lifecycleGeneration) return null;
  const state = await getMemberMilestone({ ctx, workflowId: workflow._id, membershipId: membership._id });
  if (state?.completedAt || (state?.transitionSeq ?? 0) !== 0) return null;
  const current = resolveCurrentMilestone({ workflow, membership, state });
  if (current.milestoneIndex !== 0 || current.milestoneEnteredAt !== args.activatedAt) return null;
  const automation = current.milestone.automations.find(a => a.trigger.type === "member_joined" && a.action.type === "create_service_channel");
  return automation ? { workflow, membership, current, automation } : null;
}

/** Executed in a subtransaction: room, grants, binding all commit or all roll back. */
export async function provisionJoinedMemberServiceChannel(ctx: any, args: any) {
  const resolved = await resolveFirstMemberWorkflowJoin(ctx, args);
  if (!resolved) throw new Error("workflow_join_authority_changed");
  const { workflow, membership } = resolved;
  await requireCommunityManager({ ctx, communityId: workflow.communityId, userId: workflow.updatedByUserId });
  if ((membership.serviceChannelRevision ?? 0) !== args.serviceChannelRevision) throw new Error("community_member_service_channel_revision_conflict");
  if (membership.serviceChannelId) {
    await requireMemberFormServiceAudience({ ctx, membership });
    return { channelId: membership.serviceChannelId, resultCode: "service_channel_reused" };
  }
  // An explicitly cleared assignment is a builder decision, not an invitation to recreate it.
  if (args.serviceChannelRevision !== 0) throw new Error("workflow_service_channel_assignment_cleared");
  const member = await ctx.db.get(membership.userId);
  const suffix = ` · ${membership._id}`;
  const channel = await createActiveCommunityChannel({ ctx, communityId: workflow.communityId,
    createdByUserId: workflow.updatedByUserId, accessMode: "restricted",
    name: `${String(member?.displayName || "Member").slice(0, MAX_COMMUNITY_CHANNEL_NAME_CHARS - suffix.length)}${suffix}` });
  for (const target of [{ kind: "member" as const, userId: membership.userId }, { kind: "community_agent" as const }]) {
    await setChannelParticipantCore(ctx, { communityId: workflow.communityId, channelId: channel._id,
      createdByUserId: workflow.updatedByUserId, target, active: true });
  }
  await bindMemberServiceChannel({ ctx, membership, channelId: channel._id, expectedRevision: args.serviceChannelRevision });
  await requireMemberFormServiceAudience({ ctx, membership: (await ctx.db.get(membership._id))! });
  return { channelId: channel._id, resultCode: "service_channel_created" };
}
