import { workflowSequenceReceipt } from "../shared/communityMemberWorkflow";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { communityMembershipRowIsActive, getUniqueCommunityMembershipByPair, requireCommunityChatAccess } from "./communityCore";
import { readSubmittedFormRecord, readSubmittedFormRecords, projectSubmittedFormEvidence } from "./communityFormEvidenceCore";
import { resolveMemberServiceChannel } from "./communityMemberServiceChannelCore";
import { workflowTriggerIdentity, type CommunityMemberWorkflowMilestone } from "../shared/communityMemberWorkflow";
import { getMemberMilestone, resolveCurrentMilestone } from "./communityMemberWorkflowReadCore";
import type { WorkflowMilestoneApproval, WorkflowActionProgress } from "../shared/communityMembershipContext";
import { buildCommunityInteractionEvidenceRef } from "../shared/communityEvidenceContract";

/** Private assembly: callers establish manager authority or trusted execution scope. No transition writes.
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
  const work = milestone.automations;
  if (!work.length) return { actions: [], all_actions_complete: false, scan_truncated: false };
  const runs = await ctx.db.query("communityMemberWorkflowRuns")
    .withIndex("by_workflow_membership_createdAt", q => q.eq("workflowId", workflow._id).eq("membershipId", membership._id))
    .order("desc").take(257);
  const actions: WorkflowActionProgress["actions"] = [];
  // Assessment is a separate goal judgment, not a configured action.
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
            && Boolean(request.workflowPreviousRunId ?? request.workflowTimerId ?? request.workflowFormRequestId ?? request.sourceReplyId ?? request.sourceRootId)
            && (!request.workflowPreviousRunId || request.workflowPreviousRunId === run.predecessorRunId)
            && run.triggerReceiptRef === (request.workflowPreviousRunId ? workflowSequenceReceipt(run) : request.workflowTimerId ? `workflow-timer:${request.workflowTimerId}`
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
    if (!seen && !item.evidence && rule.trigger.type === "previous_action_completed") {
      const predecessorKey = rule.trigger.predecessorActionKey;
      const predecessor = actions.find(a => a.action_key === predecessorKey);
      item.status = "waiting";
      item.waiting_for = predecessor?.label ?? "previous action";
    }
    actions.push(item);
  }
  return { actions, all_actions_complete: actions.length > 0 && actions.every(a => a.status === "complete"), scan_truncated: runs.length > 256 };
}


/** Private observation only. Callers authorize the builder projection; execution
 * omits projectedProgress and recomputes the current canonical evidence. */
export async function readWorkflowApprovalObservation(ctx: QueryCtx, args: {
  workflow: Doc<"communityMemberWorkflows">; membership: Doc<"communityMemberships">;
  projectedProgress?: WorkflowActionProgress;
}): Promise<WorkflowMilestoneApproval | null> {
  const { workflow, membership } = args;
  if (!communityMembershipRowIsActive(membership) || membership.communityId !== workflow.communityId) return null;
  try {
    await requireCommunityChatAccess({ ctx, communityId: workflow.communityId, userId: membership.userId });
    const pair = await getUniqueCommunityMembershipByPair({ ctx, communityId: workflow.communityId, userId: membership.userId });
    if (pair?._id !== membership._id) return null;
  } catch { return null; }
  const state = await getMemberMilestone({ ctx, workflowId: workflow._id, membershipId: membership._id });
  const current = resolveCurrentMilestone({ workflow, membership, state });
  if (current.completedAt || !current.milestone.requireHumanApproval ||
      ![workflow.revision, membership.activationSequence ?? 0, state?.transitionSeq ?? 0, current.milestoneEnteredAt]
        .every(value => Number.isSafeInteger(value) && value >= 0)) return null;
  const progress = args.projectedProgress ?? await readWorkflowActionProgress(ctx, { workflow, membership,
    milestone: current.milestone, milestoneEnteredAt: current.milestoneEnteredAt, transitionSeq: state?.transitionSeq ?? 0 });
  if (!progress.actions.length || !progress.all_actions_complete || progress.scan_truncated) return null;
  // The dossier must actually expose all reviewed form evidence without clipping.
  const forms = await readSubmittedFormRecords(ctx, membership);
  const projection = projectSubmittedFormEvidence(forms);
  if (projection.truncated || projection.unavailable_records) return null;
  const records = [];
  for (const action of progress.actions) {
    if (!action.evidence) return null;
    if (action.action_type !== "request_form") continue;
    const record = forms.records.find(r => String(r.request._id) === action.evidence!.source_id);
    if (!record || !projection.submissions.some(r => r.request_id === String(record.request._id))) return null;
    records.push({ request: String(record.request._id), version: String(record.version._id), revision: record.request.revision,
      form_name: record.version.name, version_revision: record.version.revision,
      questions: record.version.questions, answers: Object.fromEntries(Object.keys(record.request.answers).sort().map(key => [key, record.request.answers[key]])) });
  }
  const snapshot = JSON.stringify({ version: 1, workflowId: workflow._id, workflowRevision: workflow.revision,
    membershipId: membership._id, activation: membership.activationSequence ?? 0, transitionSeq: state?.transitionSeq ?? 0,
    milestoneKey: current.milestone.key, enteredAt: current.milestoneEnteredAt,
    instructions: current.milestone.instructions ?? "", goal: current.milestone.goal ?? "",
    requireHumanApproval: current.milestone.requireHumanApproval, automations: current.milestone.automations,
    actions: progress.actions, records });
  if (snapshot.length > 24_000) return null;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(snapshot));
  return { eligible: true, membership_ref: `membership:${membership._id}`,
    expected_activation_sequence: membership.activationSequence ?? 0,
    review_ref: `workflow-approval:v1:${Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("")}` };
}
