import { communityMembershipRowIsActive, requireCommunityChatAccess, requireCommunityManager } from "./communityCore";
import { requestIsCurrent } from "./communityFormRequestCore";
import { readSubmittedFormRecords, projectSubmittedFormEvidence } from "./communityFormEvidenceCore";
import { buildCommunityAgentServeRunId } from "../shared/communityAgentServeContract";
import { parseWorkflowGoalAssessment, WORKFLOW_ASSESSMENT_PROMPT } from "../shared/communityWorkflowAssessment";
import { requireCompletionReview } from "./communityWorkflowGoalReviewCore";
import { internal } from "./_generated/api";

/** Private execution authority, never authority to publish or move a member. */
export async function requireWorkflowAssessment(ctx: any, request: any) {
  if (request.workflowCompletionReview) return requireCompletionReview(ctx, request);
  if (!request.workflowAssessment || request.triggerKind !== "workflow" || !request.workflowFormRequestId
    || request.workflowPreviousRunId || request.workflowTimerId || request.sourceRootId || request.sourceReplyId || request.serviceChannelId) throw new Error("workflow_assessment_source_invalid");
  if (request._id && (request.status !== "running" || (request.leaseExpiresAt ?? 0) <= Date.now())) throw new Error("workflow_assessment_lease_expired");
  const run = request.workflowRunId ? await ctx.db.get(request.workflowRunId) : null;
  const form = await ctx.db.get(request.workflowFormRequestId);
  const member = form ? await ctx.db.get(form.membershipId) : null;
  const workflow = run ? await ctx.db.get(run.workflowId) : null;
  const milestone = workflow?.milestones.find((m: any) => m.key === run.milestoneKey);
  const rule = milestone?.automations.find((a: any) => a.key === run.automationKey);
  if (!run || !form || !member || !workflow || !communityMembershipRowIsActive(member)
    || form.status !== "submitted" || !await requestIsCurrent(ctx, form)
    || form.communityId !== request.communityId || workflow.communityId !== request.communityId || member.communityId !== request.communityId
    || run.communityId !== request.communityId || run.membershipId !== member._id || form.workflowId !== workflow._id
    || member.userId !== request.requesterUserId || request.sponsorUserId !== member.userId
    || form.milestoneKey !== run.milestoneKey || form.milestoneEnteredAt !== run.milestoneEnteredAt
    || (member.activationSequence ?? 0) !== form.activationSequence
    || workflow.revision !== run.workflowRevision || !milestone.goal?.trim()
    || run.milestoneContextSnapshot?.goal !== milestone.goal || run.milestoneContextSnapshot?.instructions !== (milestone.instructions ?? "")
    || run.actionSnapshot.type !== "evaluate_goal" || run.actionSnapshot.key !== request.workflowActionKey
    || request.workflowPromptSnapshot !== WORKFLOW_ASSESSMENT_PROMPT
    || rule?.action.type !== "evaluate_goal" || rule.action.key !== request.workflowActionKey
    || rule.trigger.type !== "form_submitted" || rule.trigger.formKey !== form.formKey
    || JSON.stringify(rule.trigger) !== JSON.stringify(run.triggerSnapshot)
    || run.triggerReceiptRef !== `form_submission:${form._id}`
    || !["running", "finished"].includes(run.status)
    || (request._id && (run.status !== "finished" || run.actionResult?.status !== "complete" || run.actionResult?.serveRequestId !== request._id))) throw new Error("workflow_assessment_stale");
  try {
    await requireCommunityChatAccess({ ctx, communityId: request.communityId, userId: member.userId });
    await requireCommunityManager({ ctx, communityId: request.communityId, userId: workflow.updatedByUserId });
  } catch { throw new Error("workflow_assessment_access_changed"); }
  const config = await ctx.db.query("communityAgentConfigs").withIndex("by_community", (q: any) => q.eq("communityId", request.communityId)).take(5);
  if (config.sort((a: any, b: any) => b.updatedAt - a.updatedAt)[0]?.agentEnabled === false) throw new Error("workflow_agent_disabled");
  return { run, membership: member, workflow, form };
}

export async function readWorkflowAssessmentEvidence(ctx: any, request: any) {
  if (request.workflowCompletionReview) return (await requireCompletionReview(ctx, request)).review.snapshot;
  const { membership, form } = await requireWorkflowAssessment(ctx, request);
  const page = await readSubmittedFormRecords(ctx, membership, form._id);
  const evidence = projectSubmittedFormEvidence({ ...page, records: page.records.slice(0, 1), scan_truncated: false });
  const evidenceRefs = evidence.submissions.flatMap(s => s.questions.filter(q => q.answer !== null && q.answer !== "" && (!Array.isArray(q.answer) || q.answer.length > 0) && !q.truncated)
    .map(q => `${s.request_id}:${s.version_id}:${q.key}`));
  return JSON.stringify({ evidence, evidenceRefs });
}

export async function finalizeWorkflowAssessment(ctx: any, request: any, content: string, nowMs: number) {
  const { run } = await requireWorkflowAssessment(ctx, request);
  const evidenceJson = await readWorkflowAssessmentEvidence(ctx, request);
  const snapshot = await ctx.db.query("communityAgentRunEvents").withIndex("by_run_seq", (q: any) => q.eq("runId", buildCommunityAgentServeRunId(request._id, request.attempt)).eq("seq", 0)).first();
  if (snapshot?.kind !== "context_snapshot" || JSON.parse(snapshot.content).timed_member_context !== evidenceJson) throw new Error("workflow_assessment_evidence_changed");
  const evidence = JSON.parse(evidenceJson);
  const assessment = parseWorkflowGoalAssessment(content, evidence.evidenceRefs, evidence.evidence.truncated);
  await ctx.db.patch(run._id, { goalAssessment: { ...assessment, assessedAt: nowMs }, updatedAt: nowMs });
  await ctx.db.patch(request._id, { status: "responded", respondedAt: nowMs, leaseExpiresAt: undefined, updatedAt: nowMs });
  if (request.workflowCompletionReview && assessment.verdict === "achieved")
    await ctx.scheduler.runAfter(0, internal.communityMemberWorkflows.applyCompletedGoalReviewInternal, { workflowRunId: run._id });
  return { ok: true, assessmentRecorded: true };
}
