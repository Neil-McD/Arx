import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { CommunityMembershipLike } from "./communityCore";
type WorkflowRow = Doc<"communityMemberWorkflows">;
type MemberMilestoneRow = Doc<"communityMemberWorkflowMemberMilestones">;

// Shared read rules. Defaulting never creates member state.
export async function getCommunityMemberWorkflowByCommunity(args: {
  ctx: Pick<QueryCtx, "db">;
  communityId: Id<"communities">;
}): Promise<WorkflowRow | null> {
  const rows = (await args.ctx.db
    .query("communityMemberWorkflows")
    .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
    .take(2)) as WorkflowRow[];
  if (rows.length > 1) throw new Error("community_member_workflow_ambiguous");
  return rows[0] ?? null;
}

export async function getMemberMilestone(args: {
  ctx: Pick<QueryCtx, "db">;
  workflowId: Id<"communityMemberWorkflows">;
  membershipId: Id<"communityMemberships">;
}): Promise<MemberMilestoneRow | null> {
  const rows = (await args.ctx.db
    .query("communityMemberWorkflowMemberMilestones")
    .withIndex("by_workflow_membership", (q) =>
      q.eq("workflowId", args.workflowId).eq("membershipId", args.membershipId),
    )
    .take(2)) as MemberMilestoneRow[];
  if (rows.length > 1) {
    throw new Error("community_member_workflow_member_milestone_ambiguous");
  }
  return rows[0] ?? null;
}

export function resolveCurrentMilestone(args: {
  workflow: WorkflowRow;
  membership: CommunityMembershipLike;
  state: MemberMilestoneRow | null;
}) {
  const currentMilestoneKey =
    args.state?.currentMilestoneKey ?? args.workflow.milestones[0]?.key;
  const milestoneIndex = args.workflow.milestones.findIndex(
    (milestone) => milestone.key === currentMilestoneKey,
  );
  if (milestoneIndex < 0) {
    throw new Error("community_member_workflow_member_milestone_invalid");
  }
  return {
    milestone: args.workflow.milestones[milestoneIndex],
    milestoneIndex,
    milestoneEnteredAt:
      args.state?.milestoneEnteredAt ??
      args.membership.activatedAt ??
      args.membership.createdAt,
    completedAt: args.state?.completedAt ?? null,
  };
}

/** A deleted membership's stage position goes with it; a rejoin starts a new membership. */
export async function deleteMemberWorkflowPosition(args: {
  ctx: Pick<MutationCtx, "db">;
  communityId: Id<"communities">;
  membershipId: Id<"communityMemberships">;
}): Promise<void> {
  const workflow = await getCommunityMemberWorkflowByCommunity(args);
  if (!workflow) return;
  const rows = await args.ctx.db
    .query("communityMemberWorkflowMemberMilestones")
    .withIndex("by_workflow_membership", (q) =>
      q.eq("workflowId", workflow._id).eq("membershipId", args.membershipId),
    )
    .take(8);
  for (const row of rows) await args.ctx.db.delete(row._id);
}
