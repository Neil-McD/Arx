import { communityMembershipRowIsActive, requireCommunityChatAccess, requireCommunityManager } from "./communityCore";
import { getMemberMilestone, resolveCurrentMilestone } from "./communityMemberWorkflowReadCore";
import { readWorkflowActionProgress } from "./communityWorkflowCompletionCore";
import { readSubmittedFormRecord, projectSubmittedFormEvidence } from "./communityFormEvidenceCore";
import { WORKFLOW_ASSESSMENT_PROMPT } from "../shared/communityWorkflowAssessment";
import type { WorkflowActionProgress } from "../shared/communityMembershipContext";

export const COMPLETION_REVIEW_KEY = "all_actions_complete_goal_review";

function reviewFailureReason(request: any): string {
  if (!request) return "The agent review is unavailable. No advancement was made; review the member's evidence manually.";
  if (request?.status !== "skipped") return "The agent review failed after it started. No advancement was made; review the member's evidence manually.";
  switch (request.intakeReason) {
    case "agent_disabled": return "The community agent is disabled. Enable it before retrying.";
    case "founder_plan_required":
    case "founder_subscription_inactive": return "Community AI funding is unavailable. Restore the founder plan before retrying.";
    case "founder_subscription_ambiguous":
    case "founder_subscription_owner_mismatch": return "Community AI funding needs attention before retrying.";
    case "requester_access_missing": return "The member or workflow no longer has the required access. Restore access before retrying.";
    default: return "The review could not start. Check the community agent and member access before retrying.";
  }
}

export async function readCompletionReviewStatus(ctx: any, workflow: any, membership: any, progress?: WorkflowActionProgress) {
  const review = await readCompletionReviewSnapshot(ctx, workflow, membership, progress);
  if (!review) return progress?.all_actions_complete
    ? { status: "insufficient_evidence" as const, reason: "Current evidence cannot be safely reviewed within the evidence limits. No advancement was made." }
    : { status: "waiting" as const };
  const run = await ctx.db.query("communityMemberWorkflowRuns")
    .withIndex("by_workflow_membership_trigger_automation", (q: any) => q.eq("workflowId", workflow._id)
      .eq("membershipId", membership._id).eq("triggerReceiptRef", review.receiptRef).eq("automationKey", COMPLETION_REVIEW_KEY)).first();
  if (!run) return { status: "not_started" as const };
  const request = run.actionResult?.serveRequestId ? await ctx.db.get(run.actionResult.serveRequestId) : null;
  if (run.status === "failed" || run.errorCode || !request || ["error", "skipped"].includes(request.status)) {
    const retryable = run.status === "failed" && run.actionResult?.status === "failed"
      && !run.completionReviewRetry && request?.status === "skipped"
      && request.attempt === undefined && !request.runId
      && request.workflowRunId === run._id && request.workflowAssessment !== false
      && request.workflowCompletionReview !== false;
    return { status: "failed" as const, reason: reviewFailureReason(request),
      ...(retryable ? { retryable: true, receipt_ref: review.receiptRef } : {}) };
  }
  if (request.status === "responded" && run.goalAssessment) return { status: run.goalAssessment.verdict as "achieved" | "not_yet" | "insufficient_evidence", reason: run.goalAssessment.reason as string };
  return { status: "reviewing" as const };
}

/** Bounded product evidence only. Delivery is not proof of an external outcome. */
export async function readCompletionReviewSnapshot(ctx: any, workflow: any, membership: any, projectedProgress?: WorkflowActionProgress) {
  const state = await getMemberMilestone({ ctx, workflowId: workflow._id, membershipId: membership._id });
  const current = resolveCurrentMilestone({ workflow, membership, state });
  const milestone = current.milestone;
  if (!communityMembershipRowIsActive(membership) || membership.communityId !== workflow.communityId
    || current.completedAt || !milestone.goal?.trim()) return null;
  // The read-only dossier can reuse its projection. Authority callers always
  // omit this argument and resolve proof from canonical records again.
  const progress = projectedProgress ?? await readWorkflowActionProgress(ctx, { workflow, membership, milestone,
    milestoneEnteredAt: current.milestoneEnteredAt, transitionSeq: Number(state?.transitionSeq ?? 0) });
  if (!progress.all_actions_complete || progress.scan_truncated || progress.actions.length > 40) return null;
  const records = [];
  const facts = [];
  for (const action of progress.actions) {
    const proof = action.evidence!;
    facts.push({ ref: `action:${proof.run_id}:${proof.source_id}`, action: action.action_type,
      statement: action.action_type === "create_service_channel" ? "The member's personal pod was created."
        : action.action_type === "request_form" ? "The member submitted the requested form."
        : action.action_type === "set_client_property" ? `The member finished what this rule waits for (${action.label}).`
        : "An agent response was delivered. This establishes delivery only, not the claimed outcome.", ...proof });
    if (action.action_type === "request_form") {
      const request = await ctx.db.get(proof.source_id);
      const record = request ? await readSubmittedFormRecord(ctx, membership, request) : null;
      if (!record) return null;
      records.push(record);
    }
  }
  const evidence = projectSubmittedFormEvidence({ records, scan_truncated: false, unavailable: 0 });
  // Do not spend inference on an incomplete evidence envelope.
  if (evidence.truncated) return null;
  const evidenceRefs = [...facts.map(f => f.ref), ...evidence.submissions.flatMap(s => s.questions
    .filter(q => q.answer !== null && q.answer !== "" && (!Array.isArray(q.answer) || q.answer.length > 0) && !q.truncated)
    .map(q => `${s.request_id}:${s.version_id}:${q.key}`))];
  const snapshot = JSON.stringify({ workflowId: workflow._id, workflowRevision: workflow.revision,
    membershipId: membership._id, activationSequence: membership.activationSequence ?? 0,
    transitionSeq: state?.transitionSeq ?? 0, milestoneKey: milestone.key, milestoneEnteredAt: current.milestoneEnteredAt,
    goal: milestone.goal, instructions: milestone.instructions ?? "", requireHumanApproval: milestone.requireHumanApproval ?? false,
    automations: milestone.automations,
    evidence, facts, evidenceRefs });
  if (snapshot.length > 14000) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(snapshot));
  const receiptRef = `completion-review:${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("")}`;
  return { snapshot, receiptRef, progress, current, state };
}

/** Admission and delivery both recheck the identical current visit/evidence. */
export async function requireCompletionReview(ctx: any, request: any, completed = false) {
  if (!request.workflowCompletionReview || !request.workflowAssessment || request.triggerKind !== "workflow"
    || request.workflowFormRequestId || request.workflowPreviousRunId || request.workflowTimerId || request.sourceRootId || request.sourceReplyId || request.serviceChannelId)
    throw new Error("workflow_assessment_source_invalid");
  const run = request.workflowRunId ? await ctx.db.get(request.workflowRunId) : null;
  const workflow = run ? await ctx.db.get(run.workflowId) : null;
  const membership = run ? await ctx.db.get(run.membershipId) : null;
  if (!run || !workflow || !membership || run.triggerType !== "all_actions_complete"
    || run.automationKey !== COMPLETION_REVIEW_KEY || run.actionSnapshot.type !== "evaluate_goal"
    || run.actionSnapshot.key !== COMPLETION_REVIEW_KEY || request.workflowActionKey !== COMPLETION_REVIEW_KEY
    || request.workflowPromptSnapshot !== WORKFLOW_ASSESSMENT_PROMPT
    || run.communityId !== request.communityId || workflow.communityId !== request.communityId
    || membership.userId !== request.requesterUserId || request.sponsorUserId !== membership.userId
    || !["running", "finished"].includes(run.status)
    || (completed && (!request._id || request.status !== "responded" || run.goalAssessment?.verdict !== "achieved"))
    || (request._id && ((!completed && (request.status !== "running" || (request.leaseExpiresAt ?? 0) <= Date.now()))
      || run.status !== "finished" || run.actionResult?.status !== "complete" || run.actionResult?.serveRequestId !== request._id)))
    throw new Error("workflow_assessment_stale");
  const review = await readCompletionReviewSnapshot(ctx, workflow, membership);
  if (!review || review.snapshot !== run.completionReviewSnapshot || review.receiptRef !== run.triggerReceiptRef
    || run.workflowRevision !== workflow.revision || run.milestoneKey !== review.current.milestone.key
    || run.milestoneContextSnapshot?.goal !== review.current.milestone.goal
    || run.milestoneContextSnapshot?.instructions !== (review.current.milestone.instructions ?? "")
    || run.milestoneEnteredAt !== review.current.milestoneEnteredAt
    || run.activationSequence !== (membership.activationSequence ?? 0) || run.transitionSeq !== (review.state?.transitionSeq ?? 0))
    throw new Error("workflow_assessment_stale");
  try {
    await requireCommunityChatAccess({ ctx, communityId: request.communityId, userId: membership.userId, allowWelcome: true });
    await requireCommunityManager({ ctx, communityId: request.communityId, userId: workflow.updatedByUserId });
  } catch { throw new Error("workflow_assessment_access_changed"); }
  const configs = await ctx.db.query("communityAgentConfigs").withIndex("by_community", (q: any) => q.eq("communityId", request.communityId)).take(5);
  if (configs.sort((a: any, b: any) => b.updatedAt - a.updatedAt)[0]?.agentEnabled === false) throw new Error("workflow_agent_disabled");
  return { run, workflow, membership, form: null, review };
}
