import { buildCommunityAgentServeRunId } from "../shared/communityAgentServeContract";
import { parseWorkflowGoalAssessment } from "../shared/communityWorkflowAssessment";
import { requireCompletionReview } from "./communityWorkflowGoalReviewCore";
import { internal } from "./_generated/api";

/** Private execution authority, never authority to publish or move a member. */
export async function requireWorkflowAssessment(ctx: any, request: any) {
  return requireCompletionReview(ctx, request);
}

export async function readWorkflowAssessmentEvidence(ctx: any, request: any) {
  return (await requireCompletionReview(ctx, request)).review.snapshot;
}

export async function finalizeWorkflowAssessment(ctx: any, request: any, content: string, nowMs: number) {
  const { run, review } = await requireWorkflowAssessment(ctx, request);
  const evidenceJson = await readWorkflowAssessmentEvidence(ctx, request);
  const snapshot = await ctx.db.query("communityAgentRunEvents").withIndex("by_run_seq", (q: any) => q.eq("runId", buildCommunityAgentServeRunId(request._id, request.attempt)).eq("seq", 0)).first();
  if (snapshot?.kind !== "context_snapshot" || JSON.parse(snapshot.content).timed_member_context !== evidenceJson) throw new Error("workflow_assessment_evidence_changed");
  const evidence = JSON.parse(evidenceJson);
  const assessment = parseWorkflowGoalAssessment(content, evidence.evidenceRefs, evidence.evidence.truncated);
  await ctx.db.patch(run._id, { goalAssessment: { ...assessment, assessedAt: nowMs }, updatedAt: nowMs });
  await ctx.db.patch(request._id, { status: "responded", respondedAt: nowMs, leaseExpiresAt: undefined, updatedAt: nowMs });
  if (assessment.verdict === "achieved" && !review.current.milestone.requireHumanApproval)
    await ctx.scheduler.runAfter(0, internal.communityMemberWorkflows.applyCompletedGoalReviewInternal, { workflowRunId: run._id });
  return { ok: true, assessmentRecorded: true };
}
