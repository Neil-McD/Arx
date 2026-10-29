import { workflowActionIsInstant, workflowSequenceReceipt } from "../shared/communityMemberWorkflow";
import type { Doc, Id } from "./_generated/dataModel";
import { buildCommunityAgentServeRunId } from "../shared/communityAgentServeContract";
import { readAssessmentCitations } from "../shared/communityWorkflowAssessment";
import { readWorkflowActionProgress, readWorkflowApprovalObservation } from "./communityWorkflowCompletionCore";
import { readCompletionReviewStatus } from "./communityWorkflowGoalReviewCore";
import { workflowActivityExplanation } from "../shared/workflowActivityExplanation";
import type { QueryCtx } from "./_generated/server";
import { readSubmittedFormRecords, projectSubmittedFormEvidence } from "./communityFormEvidenceCore";
import {
  communityMembershipRowIsActive,
  getUniqueCommunityMembershipByPair,
  requireCommunityChatAccess,
  requireCommunityManager,
  toIsoString,
} from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { resolveMemberServiceChannel } from "./communityMemberServiceChannelCore";
import { requireServiceWorkflowDestination } from "./communityAgentServiceWorkflowCore";
import { requireAgentSourceChannelAccess } from "./communityAgentChannelAccess";
import { buildCommunityTabPath } from "../shared/webAppRouteState";
import {
  readBoundedMemberOrientationFacts,
  readMemberFactsForLens,
} from "./memberOntologyCore";
import type { CommunityMemberSelfContext } from "../shared/communityMemberSelfContext";
import { buildCommunityInteractionEvidenceRef } from "../shared/communityEvidenceContract";
import { evaluateCommunityChannelCapabilities, resolveCommunityChannelActor } from "./communityChannelAccess";
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
    channel_access: await readBuilderMemberChannelAccess(args.ctx, args.communityId, membership),
    membership_status: "active",
    membership_id: String(membership._id),
    joined_at: toIsoString(membership.activatedAt ?? membership.createdAt),
  };
}

// Project current access from canonical channels and activation-bound grants.
// This is a bounded read, never a copied member/channel index.
async function readBuilderMemberChannelAccess(ctx: QueryCtx, communityId: Id<"communities">, membership: Doc<"communityMemberships">) {
  let actor: Awaited<ReturnType<typeof resolveCommunityChannelActor>>;
  try {
    actor = await resolveCommunityChannelActor({ ctx, communityId, userId: membership.userId });
  } catch {
    return { status: "unavailable" as const, channels: [], truncated: false };
  }
  const rows = await ctx.db.query("communityChannels")
    .withIndex("by_community_status_position", q => q.eq("communityId", communityId).eq("status", "active"))
    .take(101);
  const grants = actor.isManager ? [] : await ctx.db.query("communityChannelParticipants")
    .withIndex("by_community_principal_status", q => q.eq("communityId", communityId)
      .eq("principalKey", `user:${membership.userId}`).eq("status", "active"))
    .take(101);
  const grantIds = new Set(grants.filter(grant =>
    grant.membershipId === membership._id &&
    grant.membershipActivationSequence === Math.max(0, Math.floor(Number(membership.activationSequence ?? 0))),
  ).map(grant => String(grant.channelId)));
  const channels = rows.slice(0, 100).filter(channel =>
    evaluateCommunityChannelCapabilities({ channel, actor, hasGrant: grantIds.has(String(channel._id)) }).canRead,
  ).map(channel => ({ name: channel.name, slug: channel.slug, access_mode: channel.accessMode }));
  return { status: "available" as const, channels, truncated: rows.length > 100 || grants.length > 100 };
}

export async function resolveSelfCommunityMembershipContext(args: {
  ctx: QueryCtx;
  actorUserId: Id<"users">;
  communityId: Id<"communities">;
  /** The member's own progress read, which a member in the welcome flow may make. */
  allowWelcome?: boolean;
}): Promise<CommunityMemberSelfContext> {
  const { community } = await requireCommunityChatAccess({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.actorUserId,
    allowWelcome: args.allowWelcome,
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
    service_channel: context.service_channel,
    approved_community_context: context.approved_community_context,
    facts_truncated: context.facts_truncated,
    submitted_form_evidence: context.submitted_form_evidence,
    recent_workflow_activity: context.recent_workflow_activity.map(
      (entry) => {
        const { prompt: _prompt, ...activity } = entry;
        if ("assessment" in activity) delete activity.assessment;
        return activity;
      },
    ),
    milestone_history: context.milestone_history,
  };
}

// Internal execution authority, never an owner-supplied user/community selector.
// Reading this dossier does not authorize putting it in a channel prompt.
export async function resolveWorkflowExecutionMembershipContext(args: {
  ctx: QueryCtx; requestId: Id<"communityAgentServeRequests">; expectedAttempt: number;
}): Promise<CommunityMembershipContext> {
  const { ctx } = args;
  const request = await ctx.db.get(args.requestId);
  if (!request || request.triggerKind !== "workflow" || request.status !== "running" ||
    request.attempt !== args.expectedAttempt || (request.leaseExpiresAt ?? 0) <= Date.now() ||
    !request.workflowRunId || !request.requesterUserId) throw new Error("workflow_context_forbidden");
  await requireCommunityChatAccess({ ctx, communityId: request.communityId, userId: request.requesterUserId, allowWelcome: true });
  const run = await ctx.db.get(request.workflowRunId);
  const membership = await getUniqueCommunityMembershipByPair({ ctx,
    communityId: request.communityId, userId: request.requesterUserId });
  if (!run || !membership || !communityMembershipRowIsActive(membership) ||
    run.communityId !== request.communityId || run.membershipId !== membership._id ||
    run.status !== "finished" || run.actionSnapshot.type !== "prompt_agent" ||
    run.actionSnapshot.key !== request.workflowActionKey || run.actionSnapshot.prompt !== request.workflowPromptSnapshot ||
    run.actionResult?.status !== "complete" || run.actionResult.serveRequestId !== request._id) {
    throw new Error("workflow_context_forbidden");
  }
  const configs = await ctx.db.query("communityAgentConfigs")
    .withIndex("by_community", q => q.eq("communityId", request.communityId)).take(5);
  if (configs.sort((a, b) => b.updatedAt - a.updatedAt)[0]?.agentEnabled === false) throw new Error("workflow_context_forbidden");
  if (request.workflowPreviousRunId || request.workflowTimerId || request.workflowFormRequestId) {
    await requireServiceWorkflowDestination(ctx, request);
  } else {
    const root = request.sourceRootId ? await ctx.db.get(request.sourceRootId) : null;
    const source = request.sourceReplyId ? await ctx.db.get(request.sourceReplyId) : root;
    if (!root || !source || root.communityId !== request.communityId || source.communityId !== request.communityId ||
      source.status !== "live" || source.actorUserId !== request.requesterUserId ||
      source.channelId !== root.channelId ||
      ("rootId" in source && source.rootId !== root._id) ||
      run.triggerReceiptRef !== buildCommunityInteractionEvidenceRef({ objectType: request.sourceReplyId ? "reply" : "root", objectId: String(source._id) })) {
      throw new Error("workflow_context_forbidden");
    }
    await requireAgentSourceChannelAccess({ ctx, root, userId: request.requesterUserId });
  }
  const { facts_truncated: _truncated, ...context } = await readMembershipContextRecords({
    ctx, communityId: request.communityId, subjectUserId: request.requesterUserId,
    membership: membership as Doc<"communityMemberships">, view: "workflow",
  });
  return { ...context, membership_id: String(membership._id), joined_at: toIsoString(membership.activatedAt ?? membership.createdAt) };
}

// Private record assembly, not an authorization entry point. The wrappers
// above establish their own actor/subject boundary before using it.
async function readMembershipContextRecords(args: {
  ctx: QueryCtx;
  communityId: Id<"communities">;
  subjectUserId: Id<"users">;
  membership: Doc<"communityMemberships"> | null;
  view: "builder" | "self" | "workflow";
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
              kind: args.view === "workflow" ? "workflow_execution" : "founder_admin",
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
  // Property writes are bookkeeping; the client timeline shows them.
  const recentWorkflowActivity = await Promise.all(
    workflowRunRows.filter((run) => !workflowActionIsInstant(run.actionSnapshot.type)).map(async (run) => {
      // History pagination is presentation only, never outcome authority.
      // A missing or mismatched linked record does not establish live work.
      const validActionResult =
        run.communityId === args.communityId &&
        run.workflowId === workflow?._id &&
        run.membershipId === membership?._id &&
        run.actionResult?.actionKey === run.actionSnapshot.key &&
        run.actionResult?.status === "complete" &&
        run.status === "finished";
      if (run.actionSnapshot.type === "request_form") {
        const request = run.actionResult?.formRequestId ? await args.ctx.db.get(run.actionResult.formRequestId) : null;
        const valid = validActionResult && request?.communityId === run.communityId && request?.membershipId === run.membershipId
          && request?.workflowId === run.workflowId && request?.automationKey === run.automationKey && request?.milestoneEnteredAt === run.milestoneEnteredAt;
        return { id: String(run._id), action_type: "request_form" as const, status: run.status === "failed" ? "failed" as const : valid ? "requested" as const : "unavailable" as const,
          ...workflowActivityExplanation(run.status === "failed" ? "failed" : valid ? "requested" : "unavailable", run.errorCode),
          milestone_key: run.milestoneKey, milestone_name: run.milestoneName, next_milestone_key: null, next_milestone_name: null, prompt: null, occurred_at: toIsoString(run.createdAt) };
      }
      if (run.actionSnapshot.type === "evaluate_goal") {
        const request = run.actionResult?.serveRequestId ? await args.ctx.db.get(run.actionResult.serveRequestId) : null;
        const valid = validActionResult && request?.workflowRunId === run._id && request?.workflowAssessment === true
          && request.communityId === run.communityId && request.requesterUserId === membership?.userId;
        const snapshot = args.view !== "self" && valid && request.status === "responded" && run.goalAssessment
          ? await args.ctx.db.query("communityAgentRunEvents").withIndex("by_run_seq", q => q.eq("runId", buildCommunityAgentServeRunId(request._id, request.attempt)).eq("seq", 0)).first() : null;
        return { id: String(run._id), action_type: "evaluate_goal" as const,
          status: run.status === "failed" || (valid && ["error", "skipped"].includes(request.status)) ? "failed" as const : valid ? request.status as "queued" | "running" | "responded" : "unavailable" as const,
          ...workflowActivityExplanation(run.status === "failed" || (valid && ["error", "skipped"].includes(request.status)) ? "failed" : valid ? request.status : "unavailable", valid ? request.errorCode ?? request.intakeReason : run.errorCode),
          ...(args.view !== "self" && valid && request.status === "responded" && run.goalAssessment ? { assessment: { ...run.goalAssessment,
            goal: run.milestoneContextSnapshot?.goal,
            citations: readAssessmentCitations(snapshot?.kind === "context_snapshot" ? snapshot.content : undefined, run.goalAssessment.evidenceRefs),
          } } : {}),
          milestone_key: run.milestoneKey, milestone_name: run.milestoneName, next_milestone_key: null, next_milestone_name: null, prompt: null, occurred_at: toIsoString(run.createdAt) };
      }
      if (run.actionSnapshot.type === "create_service_channel") {
        const channel = run.actionResult?.serviceChannelId ? await args.ctx.db.get(run.actionResult.serviceChannelId) : null;
        const valid = validActionResult && channel?.communityId === run.communityId
          && membership?.serviceChannelId === channel._id
          && (await resolveMemberServiceChannel({ ctx: args.ctx, membership })).status === "available";
        return { id: String(run._id), action_type: "create_service_channel" as const,
          status: run.status === "failed" ? "failed" as const : valid ? "channel_ready" as const : "unavailable" as const,
          ...workflowActivityExplanation(run.status === "failed" ? "failed" : valid ? "channel_ready" : "unavailable", run.errorCode),
          milestone_key: run.milestoneKey, milestone_name: run.milestoneName, next_milestone_key: null,
          next_milestone_name: null, prompt: null, occurred_at: toIsoString(run.createdAt) };
      }
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
          Boolean(serveRequest.workflowPreviousRunId ?? serveRequest.workflowTimerId ?? serveRequest.workflowFormRequestId ?? serveRequest.sourceReplyId ?? serveRequest.sourceRootId) &&
          (!serveRequest.workflowPreviousRunId || serveRequest.workflowPreviousRunId === run.predecessorRunId) &&
          run.triggerReceiptRef ===
            (serveRequest.workflowPreviousRunId ? workflowSequenceReceipt(run) : serveRequest.workflowTimerId ? `workflow-timer:${serveRequest.workflowTimerId}` : serveRequest.workflowFormRequestId ? `form_submission:${serveRequest.workflowFormRequestId}` : buildCommunityInteractionEvidenceRef({
              objectType: serveRequest.sourceReplyId ? "reply" : "root",
              objectId: String(
                serveRequest.sourceReplyId ?? serveRequest.sourceRootId ?? "",
              ),
            }));
        const status =
          run.status === "failed"
            ? ("failed" as const)
            : !validRequest
              ? ("unavailable" as const)
              : serveRequest.status === "error" ||
                  serveRequest.status === "skipped"
                ? ("failed" as const)
                : serveRequest.status;
        let deliveryChannelUrl: string | null = null;
        if (validRequest && status === "responded" && (serveRequest.workflowPreviousRunId || serveRequest.workflowTimerId || serveRequest.workflowFormRequestId) && serveRequest.responseRootId) {
          const root = await args.ctx.db.get(serveRequest.responseRootId);
          if (root?.status === "live" && root.communityId === args.communityId
            && root.channelId === serveRequest.serviceChannelId
            && root.idempotencyKey === `community_agent_serve:${serveRequest._id}`) {
            const destination = await resolveMemberServiceChannel({ ctx: args.ctx, membership, channelId: root.channelId });
            if (destination.status === "available" && root.channelId) {
              const channel = await args.ctx.db.get(root.channelId);
              const community = await args.ctx.db.get(args.communityId);
              deliveryChannelUrl = buildCommunityTabPath(community?.slug, "chat", null, null, channel?.slug);
            }
          }
        }
        return {
          id: String(run._id),
          action_type: "prompt_agent" as const,
          status,
          ...workflowActivityExplanation(status, validRequest ? serveRequest.errorCode ?? serveRequest.intakeReason : run.errorCode),
          ...(run.triggerType === "milestone_elapsed" ? {
            delivery_channel_url: deliveryChannelUrl,
          } : {}),
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
              : validActionResult && run.actionResult?.resultCode === "requirement_satisfied"
                ? ("requirement_satisfied" as const)
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
  const actionProgress = args.view !== "workflow" && workflow && membership && current && !current.completedAt
    ? await readWorkflowActionProgress(args.ctx, { workflow, membership, milestone: current.milestone,
      milestoneEnteredAt: current.milestoneEnteredAt, transitionSeq: Number(state?.transitionSeq ?? 0) }) : undefined;
  return {
    user_id: String(args.subjectUserId),
    community_id: String(args.communityId),
    service_channel: await resolveMemberServiceChannel({ ctx: args.ctx, membership }),
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
            ...(args.view === "self" ? {
              goal: current.milestone.goal ?? "",
              require_human_approval: current.milestone.requireHumanApproval ?? false,
              ...(actionProgress ? { action_progress: { ...actionProgress,
                actions: actionProgress.actions.map(action => ({ ...action,
                  // Builder prompt text is not member-facing action context.
                  label: action.action_type === "prompt_agent" ? "Agent assistance" : action.label,
                })),
              } } : {}),
            } : {}),
            ...(args.view === "builder" ? {
              approval: membership ? await readWorkflowApprovalObservation(args.ctx, { workflow, membership, projectedProgress: actionProgress }) : null,
              instructions: current.milestone.instructions ?? "",
              ...(actionProgress ? { action_progress: actionProgress } : {}),
              require_human_approval: current.milestone.requireHumanApproval ?? false,
              ...(!current.completedAt && current.milestone.goal?.trim()
                ? { goal_review: await readCompletionReviewStatus(args.ctx, workflow, membership, actionProgress) } : {}),
              goal: current.milestone.goal ?? "", override_state: {
              activation_sequence: Number(membership?.activationSequence ?? 0), transition_seq: Number(state?.transitionSeq ?? 0),
              next_milestone_name: workflow.milestones[current.milestoneIndex + 1]?.name ?? null,
            } } : {}),
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
    submitted_form_evidence: membership
      ? projectSubmittedFormEvidence(await readSubmittedFormRecords(args.ctx, membership))
      : { submissions: [], truncated: false, unavailable_records: 0 },
    approved_community_context: factPage.facts
      .map((fact) => ({
        id: String(fact._id),
        ...(fact.contextKind === "workflow" ? { context_kind: "workflow" as const } : {}),
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
        ...(args.view !== "self" && transition.forcedByUserId ? { forced_by_user_id: String(transition.forcedByUserId) } : {}),
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
