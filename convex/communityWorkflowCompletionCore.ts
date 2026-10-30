import { workflowSequenceReceipt } from "../shared/communityMemberWorkflow";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { communityMembershipRowIsActive, getUniqueCommunityMembershipByPair, requireCommunityChatAccess } from "./communityCore";
import { readSubmittedFormRecord, readSubmittedFormRecords, projectSubmittedFormEvidence } from "./communityFormEvidenceCore";
import { resolveMemberServiceChannel } from "./communityMemberServiceChannelCore";
import { workflowActionIsInstant, workflowTriggerIsReactive, workflowRuleIsNudge, workflowRunWasSkipped, workflowTriggerIdentity, type CommunityMemberWorkflowMilestone } from "../shared/communityMemberWorkflow";
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
  // A property write is bookkeeping, not member work, so it never holds a stage
  // open, unless finishing a lesson or course sets it: then that is the work.
  const finishes = (rule: CommunityMemberWorkflowMilestone["automations"][number]) =>
    rule.trigger.type === "lesson_completed" || rule.trigger.type === "course_completed" || rule.trigger.type === "track_completed";
  // A nudge only runs while they're still here, so waiting on it would keep them here.
  // A write on a path (another step follows it, or it follows another step) counts too.
  const followed = new Set(milestone.automations.flatMap(rule =>
    rule.trigger.type === "previous_action_completed" ? [rule.trigger.predecessorActionKey] : []));
  // A step that only happens if something else does (a record change, a date
  // on their record, or the member starting or leaving an offer) is tracked apart, with the steps after
  // it (reactive_actions, so a chain can follow them), and never holds the stage.
  const reactive = new Set<string>();
  for (const rule of milestone.automations) {
    if (workflowTriggerIsReactive(rule.trigger.type)
      || (rule.trigger.type === "previous_action_completed" && reactive.has(rule.trigger.predecessorActionKey))) reactive.add(rule.action.key);
  }
  const work = milestone.automations.filter(rule => !workflowRuleIsNudge(rule)
    && (!workflowActionIsInstant(rule.action.type) || finishes(rule) || followed.has(rule.action.key)
      || rule.trigger.type === "previous_action_completed"));
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
    const propertyKey = rule.action.type === "set_client_property" ? rule.action.propertyKey : null;
    const property = propertyKey ? await ctx.db.query("communityClientProperties")
      .withIndex("by_community_key", q => q.eq("communityId", workflow.communityId).eq("key", propertyKey)).unique() : null;
    const finished = rule.trigger.type === "course_completed" ? "Course finished" : rule.trigger.type === "track_completed" ? "Track finished" : "Lesson done";
    const item: WorkflowActionProgress["actions"][number] = {
      automation_key: rule.key, action_key: rule.action.key, action_type: rule.action.type as WorkflowActionProgress["actions"][number]["action_type"],
      label: rule.action.type === "request_form" ? `Request ${form?.name ?? "selected form"}`
        : rule.action.type === "prompt_agent" ? `Ask agent: ${rule.action.prompt.slice(0, 120)}${rule.action.prompt.length > 120 ? "…" : ""}`
        : rule.action.type === "send_email" ? `Email: ${rule.action.subject}`
        : rule.action.type === "set_pod_member" ? rule.action.active ? "Add to a pod" : "Take out of a pod"
        : propertyKey ? `${finished}, then set ${property?.name ?? propertyKey}` : "Create a personal pod for this member",
      status: "unavailable", evidence: null,
    };
    let seen = false;
    // This rule's trigger fired in this visit, whatever the action looked like then.
    let fired = false, newestRunning = false;
    // Only a rule's newest property write sets what the member has now; runs
    // before it, done or failed, no longer say anything.
    let wrote = false;
    for (const run of runs.slice(0, 256)) {
      if (run.communityId !== workflow.communityId || run.workflowId !== workflow._id || run.membershipId !== membership._id
        || run.activationSequence !== (membership.activationSequence ?? 0) || run.transitionSeq !== args.transitionSeq
        || run.milestoneKey !== milestone.key || run.milestoneEnteredAt !== args.milestoneEnteredAt
        // Older receipts remain proof when this rule and visit still match.
        // Keep rejecting impossible future-revision receipts.
        || run.workflowRevision > workflow.revision || run.automationKey !== rule.key
        || !run.triggerSnapshot || workflowTriggerIdentity(run.triggerSnapshot) !== workflowTriggerIdentity(rule.trigger)) continue;
      if (!fired) newestRunning = run.status === "running";
      fired = true;
      if (rule.action.type === "set_client_property") {
        if (wrote) continue;
        wrote = run.status === "finished";
      }
      if (run.actionSnapshot.key !== rule.action.key || run.actionSnapshot.type !== rule.action.type
        || (rule.action.type === "prompt_agent" && (run.actionSnapshot.type !== "prompt_agent" || run.actionSnapshot.prompt !== rule.action.prompt))
        || (rule.action.type === "request_form" && (run.actionSnapshot.type !== "request_form" || run.actionSnapshot.formKey !== rule.action.formKey))
        // A write of another property or value is not this rule's write.
        || (rule.action.type === "set_client_property" && (run.actionSnapshot.type !== "set_client_property"
          || run.actionSnapshot.propertyKey !== rule.action.propertyKey
          || JSON.stringify(run.actionSnapshot.value ?? null) !== JSON.stringify(rule.action.value ?? null)))
        || (run.milestoneContextSnapshot?.instructions ?? "") !== (milestone.instructions ?? "")
        || (run.milestoneContextSnapshot?.goal ?? "") !== (milestone.goal ?? "")) continue;
      let status: typeof item.status = "unavailable";
      let evidence: typeof item.evidence = null;
      const result = run.actionResult;
      if (run.status === "failed") status = "failed";
      else if (run.status === "running") status = "running";
      else if (result?.status === "complete" && result.actionKey === rule.action.key) {
        if (workflowRunWasSkipped(run)) {
          // A path not taken counts as done, but only under the "Only if" it was judged by.
          if (run.finishedAt !== undefined && JSON.stringify(run.conditionSnapshot ?? null) === JSON.stringify(rule.condition ?? null))
            evidence = { run_id: String(run._id), source_id: String(run._id), completed_at: run.finishedAt };
        } else if (rule.action.type === "request_form") {
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
        } else if (workflowActionIsInstant(rule.action.type)) {
          if (run.finishedAt !== undefined) evidence = { run_id: String(run._id), source_id: String(run._id), completed_at: run.finishedAt };
        } else if (rule.action.type === "create_service_channel") {
          const destination = await resolveMemberServiceChannel({ ctx, membership });
          if (destination.status === "available" && result.serviceChannelId
            && destination.channel_id === String(result.serviceChannelId) && run.finishedAt !== undefined)
            evidence = { run_id: String(run._id), source_id: String(result.serviceChannelId), completed_at: run.finishedAt };
        } else if (rule.action.type === "prompt_agent" && result.resultCode === "agent_previewed") {
          // Only a test member's Autoplay previews an agent step; the preview stands in for the reply.
          if (run.finishedAt !== undefined) evidence = { run_id: String(run._id), source_id: String(run._id), completed_at: run.finishedAt };
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
    } else if (!seen && !item.evidence && rule.trigger.type === "client_property_changed") {
      item.status = "waiting";
      item.waiting_for = "their record to change";
    } else if (!seen && !item.evidence && rule.trigger.type === "pod_member_added") {
      item.status = "waiting";
      item.waiting_for = "someone to add them to a pod";
    } else if (!seen && !item.evidence && finishes(rule) && !fired) {
      item.status = "waiting";
      item.waiting_for = rule.trigger.type === "course_completed" ? "the course to be finished"
        : rule.trigger.type === "track_completed" ? "the track to be finished" : "the lesson to be done";
    }
    // The lesson or course is done but the write failed, or ran before the
    // builder changed it. The trigger won't fire again, so a builder can rerun it.
    if (rule.action.type === "set_client_property" && fired && !newestRunning && !item.evidence) item.retryable = true;
    actions.push(item);
  }
  const holding = actions.filter(a => !reactive.has(a.action_key));
  const reacting = actions.filter(a => reactive.has(a.action_key));
  return { actions: holding, ...(reacting.length ? { reactive_actions: reacting } : {}),
    all_actions_complete: holding.length > 0 && holding.every(a => a.status === "complete"), scan_truncated: runs.length > 256 };
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
    await requireCommunityChatAccess({ ctx, communityId: workflow.communityId, userId: membership.userId, allowWelcome: true });
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
