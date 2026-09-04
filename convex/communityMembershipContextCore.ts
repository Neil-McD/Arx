import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  communityMembershipRowIsActive,
  getUniqueCommunityMembershipByPair,
  requireCommunityChatAccess,
  requireCommunityManager,
  toIsoString,
} from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import {
  readBoundedMemberOrientationFacts,
  readMemberFactsForLens,
} from "./memberOntologyCore";
import type { CommunityMemberSelfContext } from "../shared/communityMemberSelfContext";
import { buildCommunityInteractionEvidenceRef } from "../shared/communityEvidenceContract";
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
  const { facts_truncated: _factsTruncated, ...context } =
    await readMembershipContextRecords({
      ctx: args.ctx,
      communityId: args.communityId,
      subjectUserId: membership.userId,
      membership,
      view: "builder",
    });
  return {
    ...context,
    membership_id: String(membership._id),
    joined_at: toIsoString(membership.activatedAt ?? membership.createdAt),
  };
}

export async function resolveSelfCommunityMembershipContext(args: {
  ctx: QueryCtx;
  actorUserId: Id<"users">;
  communityId: Id<"communities">;
}): Promise<CommunityMemberSelfContext> {
  const { community } = await requireCommunityChatAccess({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.actorUserId,
  });
  const membership = await getUniqueCommunityMembershipByPair({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.actorUserId,
  });
  const isOwner = String(community.ownerId) === String(args.actorUserId);
  if (!isOwner && !communityMembershipRowIsActive(membership)) {
    throw new Error("community_member_workflow_member_not_found");
  }
  const context = await readMembershipContextRecords({
    ctx: args.ctx,
    communityId: args.communityId,
    subjectUserId: args.actorUserId,
    membership: communityMembershipRowIsActive(membership)
      ? (membership as Doc<"communityMemberships">)
      : null,
    view: "self",
  });
  return {
    read_at: toIsoString(Date.now()),
    user_id: context.user_id,
    community_id: context.community_id,
    membership_id: context.membership_id,
    display_name: context.display_name,
    role: isOwner ? "owner" : membership!.role,
    joined_at: context.joined_at,
    workflow: context.workflow,
    approved_community_context: context.approved_community_context,
    facts_truncated: context.facts_truncated,
    recent_workflow_activity: context.recent_workflow_activity.map(
      ({ prompt: _prompt, ...activity }) => activity,
    ),
    milestone_history: context.milestone_history,
  };
}

// Private record assembly, not an authorization entry point. Both wrappers
// above establish their own actor/subject boundary before using it.
async function readMembershipContextRecords(args: {
  ctx: QueryCtx;
  communityId: Id<"communities">;
  subjectUserId: Id<"users">;
  membership: Doc<"communityMemberships"> | null;
  view: "builder" | "self";
}) {
  const membership = args.membership;
  const workflow = membership
    ? await getCommunityMemberWorkflowByCommunity({
        ctx: args.ctx,
        communityId: args.communityId,
      })
    : null;
  const state =
    workflow && membership
      ? await getMemberMilestone({
          ctx: args.ctx,
          workflowId: workflow._id,
          membershipId: membership._id,
        })
      : null;
  const current =
    workflow && membership
      ? resolveCurrentMilestone({ workflow, membership, state })
      : null;
  const [profile, factPage, transitionRows, workflowRunRows] =
    await Promise.all([
      resolveUserProfileDisplayProjection(args.ctx, args.subjectUserId),
      args.view === "self"
        ? readBoundedMemberOrientationFacts(args.ctx, {
            subjectUserId: args.subjectUserId,
            communityId: args.communityId,
          })
        : readMemberFactsForLens(args.ctx, {
            subjectUserId: args.subjectUserId,
            lens: {
              kind: "founder_admin",
              communityId: String(args.communityId),
            },
            scope: { communityId: args.communityId },
          }).then((facts) => ({ facts, truncated: false })),
      workflow && membership
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
      workflow && membership
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
  const recentWorkflowActivity = await Promise.all(
    workflowRunRows.map(async (run) => {
      // History pagination is presentation only, never outcome authority.
      // A missing or mismatched linked record does not establish live work.
      const validActionResult =
        run.communityId === args.communityId &&
        run.workflowId === workflow?._id &&
        run.membershipId === membership?._id &&
        run.actionResult?.actionKey === run.actionSnapshot.key &&
        run.actionResult?.status === "complete" &&
        run.status === "finished";
      if (run.actionSnapshot.type === "prompt_agent") {
        const serveRequest = run.actionResult?.serveRequestId
          ? await args.ctx.db.get(run.actionResult.serveRequestId)
          : null;
        const validRequest =
          validActionResult &&
          serveRequest &&
          serveRequest.communityId === args.communityId &&
          serveRequest.triggerKind === "workflow" &&
          serveRequest.requesterUserId === args.subjectUserId &&
          serveRequest.workflowRunId === run._id &&
          serveRequest.workflowActionKey === run.actionSnapshot.key &&
          serveRequest.workflowPromptSnapshot === run.actionSnapshot.prompt &&
          Boolean(serveRequest.sourceReplyId ?? serveRequest.sourceRootId) &&
          run.triggerReceiptRef ===
            buildCommunityInteractionEvidenceRef({
              objectType: serveRequest.sourceReplyId ? "reply" : "root",
              objectId: String(
                serveRequest.sourceReplyId ?? serveRequest.sourceRootId ?? "",
              ),
            });
        const status =
          run.status === "failed"
            ? ("failed" as const)
            : !validRequest
              ? ("unavailable" as const)
              : serveRequest.status === "error" ||
                  serveRequest.status === "skipped"
                ? ("failed" as const)
                : serveRequest.status;
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
      const linkedTransition = run.actionResult?.transitionId
        ? await args.ctx.db.get(run.actionResult.transitionId)
        : null;
      const transition =
        validActionResult &&
        linkedTransition &&
        linkedTransition.communityId === args.communityId &&
        linkedTransition.workflowId === run.workflowId &&
        linkedTransition.membershipId === run.membershipId &&
        linkedTransition.workflowRunId === run._id &&
        linkedTransition.actionKey === run.actionSnapshot.key &&
        linkedTransition.workflowRevision === run.workflowRevision &&
        linkedTransition.fromMilestoneKey === run.milestoneKey &&
        linkedTransition.milestoneEnteredAt === run.milestoneEnteredAt
          ? linkedTransition
          : null;
      const status =
        run.status === "failed"
          ? ("failed" as const)
          : transition?.completedWorkflow
            ? ("workflow_completed" as const)
            : transition
              ? ("moved" as const)
              : ("unavailable" as const);
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
    user_id: String(args.subjectUserId),
    community_id: String(args.communityId),
    membership_id: membership ? String(membership._id) : null,
    display_name: profile.display_name ?? "Member",
    avatar_url: profile.avatar_url,
    avatar_focus_x: profile.avatar_focus_x,
    avatar_focus_y: profile.avatar_focus_y,
    avatar_zoom: profile.avatar_zoom,
    joined_at: membership
      ? toIsoString(membership.activatedAt ?? membership.createdAt)
      : null,
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
    facts_truncated: factPage.truncated,
    approved_community_context: factPage.facts
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
      .filter(
        (transition) =>
          transition.communityId === args.communityId &&
          transition.workflowId === workflow?._id &&
          transition.membershipId === membership?._id,
      )
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
