import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  communityMembershipRowIsActive,
  requireCommunityManager,
  toIsoString,
} from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { readMemberFactsForLens } from "./memberOntologyCore";
import {
  getCommunityMemberWorkflowByCommunity,
  getMemberMilestone,
  resolveCurrentMilestone,
} from "./communityMemberWorkflowReadCore";
import {
  COMMUNITY_MEMBER_SUCCESS_ACTIVITY_LIMIT,
  COMMUNITY_MEMBER_SUCCESS_HISTORY_LIMIT,
  type CommunityMembershipContext,
} from "../shared/communityMembershipContext";

// Builder-only projection: the caller resolves actorUserId from authentication.
// Canonical records stay authoritative; no directory or Markdown copy is persisted.
export async function resolveBuilderCommunityMembershipContext(args: {
  ctx: QueryCtx;
  actorUserId: Id<"users">;
  communityId: Id<"communities">;
  membershipId: Id<"communityMemberships">;
}): Promise<CommunityMembershipContext> {
  await requireCommunityManager({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.actorUserId,
  });
  const membership = await args.ctx.db.get(args.membershipId);
  if (
    !membership ||
    !communityMembershipRowIsActive(membership) ||
    membership.communityId !== args.communityId
  ) {
    throw new Error("community_member_workflow_member_not_found");
  }
  const workflow = await getCommunityMemberWorkflowByCommunity({
    ctx: args.ctx,
    communityId: args.communityId,
  });
  const state = workflow
    ? await getMemberMilestone({
        ctx: args.ctx,
        workflowId: workflow._id,
        membershipId: membership._id,
      })
    : null;
  const current = workflow
    ? resolveCurrentMilestone({ workflow, membership, state })
    : null;
  const [profile, approvedFacts, transitionRows, workflowRunRows] =
    await Promise.all([
      resolveUserProfileDisplayProjection(args.ctx, membership.userId),
      readMemberFactsForLens(args.ctx, {
        subjectUserId: membership.userId,
        lens: {
          kind: "founder_admin",
          communityId: String(args.communityId),
        },
        scope: { communityId: args.communityId },
      }),
      workflow
        ? args.ctx.db
            .query("communityMemberWorkflowTransitions")
            .withIndex("by_workflow_membership_seq", (q) =>
              q
                .eq("workflowId", workflow._id)
                .eq("membershipId", membership._id),
            )
            .order("desc")
            .take(COMMUNITY_MEMBER_SUCCESS_HISTORY_LIMIT)
        : Promise.resolve([]),
      workflow
        ? args.ctx.db
            .query("communityMemberWorkflowRuns")
            .withIndex("by_workflow_membership_createdAt", (q) =>
              q
                .eq("workflowId", workflow._id)
                .eq("membershipId", membership._id),
            )
            .order("desc")
            .take(COMMUNITY_MEMBER_SUCCESS_ACTIVITY_LIMIT)
        : Promise.resolve([]),
    ]);
  const transitionById = new Map(
    transitionRows.map((transition) => [String(transition._id), transition]),
  );
  const recentWorkflowActivity = await Promise.all(
    workflowRunRows.map(async (run) => {
      if (run.actionSnapshot.type === "prompt_agent") {
        const serveRequest = run.actionResult?.serveRequestId
          ? await args.ctx.db.get(run.actionResult.serveRequestId)
          : null;
        const status =
          run.status === "failed" ||
          serveRequest?.status === "error" ||
          serveRequest?.status === "skipped"
            ? ("failed" as const)
            : serveRequest?.status === "responded"
              ? ("responded" as const)
              : serveRequest?.status === "running"
                ? ("running" as const)
                : ("queued" as const);
        return {
          id: String(run._id),
          action_type: "prompt_agent" as const,
          status,
          milestone_key: run.milestoneKey,
          milestone_name: run.milestoneName,
          next_milestone_key: null,
          next_milestone_name: null,
          prompt: run.actionSnapshot.prompt,
          occurred_at: toIsoString(run.createdAt),
        };
      }
      const transition = run.actionResult?.transitionId
        ? (transitionById.get(String(run.actionResult.transitionId)) ?? null)
        : null;
      const status =
        run.status === "failed"
          ? ("failed" as const)
          : transition?.completedWorkflow
            ? ("workflow_completed" as const)
            : transition
              ? ("moved" as const)
              : ("running" as const);
      return {
        id: String(run._id),
        action_type: "move_member" as const,
        status,
        milestone_key: run.milestoneKey,
        milestone_name: run.milestoneName,
        next_milestone_key: transition?.toMilestoneKey ?? null,
        next_milestone_name: transition?.toMilestoneName ?? null,
        prompt: null,
        occurred_at: toIsoString(run.createdAt),
      };
    }),
  );
  return {
    user_id: String(membership.userId),
    community_id: String(args.communityId),
    membership_id: String(membership._id),
    display_name: profile.display_name ?? "Member",
    avatar_url: profile.avatar_url,
    avatar_focus_x: profile.avatar_focus_x,
    avatar_focus_y: profile.avatar_focus_y,
    avatar_zoom: profile.avatar_zoom,
    joined_at: toIsoString(membership.activatedAt ?? membership.createdAt),
    workflow:
      workflow && current
        ? {
            id: String(workflow._id),
            revision: workflow.revision,
            current_milestone_key: current.milestone.key,
            current_milestone_name: current.milestone.name,
            current_milestone_entered_at: toIsoString(
              current.milestoneEnteredAt,
            ),
            completed_at: current.completedAt
              ? toIsoString(current.completedAt)
              : null,
          }
        : null,
    approved_community_context: approvedFacts
      .map((fact) => ({
        id: String(fact._id),
        kind: fact.kind,
        body: fact.body,
        provenance: fact.provenance,
        created_at: toIsoString(fact.createdAt),
        updated_at: toIsoString(fact.updatedAt),
      }))
      .sort((left, right) =>
        left.kind === right.kind
          ? left.body.localeCompare(right.body)
          : left.kind.localeCompare(right.kind),
      ),
    recent_workflow_activity: recentWorkflowActivity,
    milestone_history: transitionRows
      .slice()
      .reverse()
      .map((transition) => ({
        id: String(transition._id),
        sequence: transition.seq,
        milestone_key: transition.fromMilestoneKey,
        milestone_name: transition.fromMilestoneName,
        next_milestone_key: transition.toMilestoneKey ?? null,
        next_milestone_name: transition.toMilestoneName ?? null,
        completed_workflow: transition.completedWorkflow,
        occurred_at: toIsoString(transition.occurredAt),
      })),
  };
}
