import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { communityMembershipRowIsActive } from "./communityCore";
import { readSubmittedFormRecord } from "./communityFormEvidenceCore";
import { resolveMemberServiceChannel } from "./communityMemberServiceChannelCore";
import { workflowTriggerIdentity, type CommunityMemberWorkflowMilestone } from "../shared/communityMemberWorkflow";
import type { WorkflowActionProgress } from "../shared/communityMembershipContext";
import { buildCommunityInteractionEvidenceRef } from "../shared/communityEvidenceContract";

/** Private assembly: callers establish manager authority. No transition writes.
 * A successful dispatch is not completion. Read the exact linked product result.
 * At least one proven execution completes an action for this definition/visit;
 * repeated triggers are not additional tasks and failures cannot erase proof.
 */
export async function readWorkflowActionProgress(ctx: QueryCtx, args: {
  workflow: Doc<"communityMemberWorkflows">;
  membership: Doc<"communityMemberships">;
  milestone: CommunityMemberWorkflowMilestone;
  milestoneEnteredAt: number;
  transitionSeq: number;
}): Promise<WorkflowActionProgress> {
  const { workflow, membership, milestone } = args;
  if (!communityMembershipRowIsActive(membership) || membership.communityId !== workflow.communityId)
    throw new Error("workflow_completion_scope_invalid");
  const work = milestone.automations.filter(a => a.action.type !== "move_member" && a.action.type !== "evaluate_goal");
  if (!work.length) return { actions: [], all_actions_complete: false, scan_truncated: false };
  const runs = await ctx.db.query("communityMemberWorkflowRuns")
    .withIndex("by_workflow_membership_createdAt", q => q.eq("workflowId", workflow._id).eq("membershipId", membership._id))
    .order("desc").take(257);
  const actions: WorkflowActionProgress["actions"] = [];
  // Assessment is the separate goal judgment; legacy movement is not work.
  for (const rule of work) {
    const formKey = rule.action.type === "request_form" ? rule.action.formKey : null;
    const form = formKey ? await ctx.db.query("communityForms")
      .withIndex("by_community_key", q => q.eq("communityId", workflow.communityId).eq("key", formKey)).unique() : null;
    const item: WorkflowActionProgress["actions"][number] = {
      automation_key: rule.key, action_key: rule.action.key, action_type: rule.action.type as "prompt_agent" | "request_form" | "create_service_channel",
      label: rule.action.type === "request_form" ? `Request ${form?.name ?? "selected form"}`
        : rule.action.type === "prompt_agent" ? `Ask agent: ${rule.action.prompt.slice(0, 120)}${rule.action.prompt.length > 120 ? "…" : ""}` : "Create private channel",
      status: "unavailable", evidence: null,
    };
    let seen = false;
    for (const run of runs.slice(0, 256)) {
      if (run.communityId !== workflow.communityId || run.workflowId !== workflow._id || run.membershipId !== membership._id
        || run.activationSequence !== (membership.activationSequence ?? 0) || run.transitionSeq !== args.transitionSeq
        || run.milestoneKey !== milestone.key || run.milestoneEnteredAt !== args.milestoneEnteredAt
        // Older receipts remain proof when this rule and visit still match.
        // Keep rejecting impossible future-revision receipts.
        || run.workflowRevision > workflow.revision || run.automationKey !== rule.key
        || !run.triggerSnapshot || workflowTriggerIdentity(run.triggerSnapshot) !== workflowTriggerIdentity(rule.trigger)
        || run.actionSnapshot.key !== rule.action.key || run.actionSnapshot.type !== rule.action.type
        || (rule.action.type === "prompt_agent" && (run.actionSnapshot.type !== "prompt_agent" || run.actionSnapshot.prompt !== rule.action.prompt))
        || (rule.action.type === "request_form" && (run.actionSnapshot.type !== "request_form" || run.actionSnapshot.formKey !== rule.action.formKey))
        || (run.milestoneContextSnapshot?.instructions ?? "") !== (milestone.instructions ?? "")
        || (run.milestoneContextSnapshot?.goal ?? "") !== (milestone.goal ?? "")) continue;
      let status: typeof item.status = "unavailable";
      let evidence: typeof item.evidence = null;
      const result = run.actionResult;
      if (run.status === "failed") status = "failed";
      else if (run.status === "running") status = "running";
      else if (result?.status === "complete" && result.actionKey === rule.action.key) {
        if (rule.action.type === "request_form") {
          const request = result.formRequestId ? await ctx.db.get(result.formRequestId) : null;
          if (request && request.workflowRunId === run._id && request.communityId === workflow.communityId
            && request.workflowId === workflow._id && request.membershipId === membership._id
            && request.activationSequence === run.activationSequence && request.automationKey === rule.key
            && request.milestoneKey === milestone.key && request.milestoneEnteredAt === args.milestoneEnteredAt
            && request.formKey === rule.action.formKey) {
            status = request.status === "pending" ? "pending" : "unavailable";
            if (request.status === "submitted") {
              // Canonical pinned-version/answer validation, not just a status flag.
              if (await readSubmittedFormRecord(ctx, membership, request)) {
                evidence = { run_id: String(run._id), source_id: String(request._id), completed_at: request.submittedAt! };
              }
            }
          }
        } else if (rule.action.type === "create_service_channel") {
          const destination = await resolveMemberServiceChannel({ ctx, membership });
          if (destination.status === "available" && result.serviceChannelId
            && destination.channel_id === String(result.serviceChannelId) && run.finishedAt !== undefined)
            evidence = { run_id: String(run._id), source_id: String(result.serviceChannelId), completed_at: run.finishedAt };
        } else if (rule.action.type === "prompt_agent") {
          const request = result.serveRequestId ? await ctx.db.get(result.serveRequestId) : null;
          if (request && request.communityId === workflow.communityId && request.workflowRunId === run._id
            && request.triggerKind === "workflow" && !request.workflowAssessment
            && request.requesterUserId === membership.userId && request.sponsorUserId === membership.userId
            && request.workflowActionKey === rule.action.key && request.workflowPromptSnapshot === rule.action.prompt
            && Boolean(request.workflowTimerId ?? request.workflowFormRequestId ?? request.sourceReplyId ?? request.sourceRootId)
            && run.triggerReceiptRef === (request.workflowTimerId ? `workflow-timer:${request.workflowTimerId}`
              : request.workflowFormRequestId ? `form_submission:${request.workflowFormRequestId}`
              : buildCommunityInteractionEvidenceRef({ objectType: request.sourceReplyId ? "reply" : "root",
                objectId: String(request.sourceReplyId ?? request.sourceRootId) }))) {
            status = request.status === "queued" ? "pending" : request.status === "running" ? "running"
              : request.status === "error" || request.status === "skipped" ? "failed" : "unavailable";
            if (request.status === "responded" && request.respondedAt !== undefined) {
              const responseId = request.responseReplyId ?? request.responseRootId;
              const response = responseId ? await ctx.db.get(responseId) : null;
              if (response && response.communityId === workflow.communityId && response.status === "live"
                && response.actorType === "community_agent" && response.actorAgentKey === request.agentKey
                && (request.responseReplyId ? "rootId" in response && response.rootId === request.sourceRootId
                  : "channelId" in response && response.channelId === request.serviceChannelId)
                && response.idempotencyKey === `community_agent_serve:${request._id}`)
                evidence = { run_id: String(run._id), source_id: String(responseId), completed_at: request.respondedAt };
            }
          }
        }
      }
      if (evidence) { item.status = "complete"; item.evidence = evidence; break; }
      // Runs are newest first. Keep the latest result, but keep searching for
      // an earlier proven success in this exact definition and visit.
      if (!seen) {
        item.status = status;
        seen = true;
      }
    }
    actions.push(item);
  }
  return { actions, all_actions_complete: actions.length > 0 && actions.every(a => a.status === "complete"), scan_truncated: runs.length > 256 };
}
