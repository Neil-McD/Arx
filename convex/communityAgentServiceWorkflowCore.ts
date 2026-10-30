import { internal } from "./_generated/api";
import { readWorkflowActionProgress } from "./communityWorkflowCompletionCore";
import { workflowAgentSeesFacts, workflowAgentSeesFormKeys, workflowSequenceCompletionIsNew, workflowSequenceReceipt, workflowSequenceIssue } from "../shared/communityMemberWorkflow";
import { resolveWorkflowTimer } from "./communityMemberWorkflowTimerCore";
import { resolveMemberServiceChannel, requireMemberFormServiceAudience } from "./communityMemberServiceChannelCore";
import { getUniqueCommunityMembershipByPair, communityMembershipRowIsActive, requireCommunityChatAccess } from "./communityCore";
import { readSubmittedFormRecords, projectSubmittedFormEvidence } from "./communityFormEvidenceCore";
import { scheduleCommunityInteractionEvidenceSync } from "./communityInteractionEvidence";
import { CANONICAL_COMMUNITY_AGENT_KEY } from "../shared/communityAgentToolProtocol";
import { readBoundedMemberOrientationFacts } from "./memberOntologyCore";
import { readCanonicalUserIdentityProjection } from "./profileCore";
import { buildCommunityAgentServeRunId } from "../shared/communityAgentServeContract";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requestIsCurrent } from "./communityFormRequestCore";
import { requireWorkflowAssessment, readWorkflowAssessmentEvidence } from "./communityWorkflowAssessmentCore";

/** Member-facing projection only. Caller establishes live source/run authority.
 * Never workflow-only facts, account spine or the builder dossier.
 */
export async function readServiceMemberContext(ctx: QueryCtx, request: any) {
  if (request.workflowAssessment) return readWorkflowAssessmentEvidence(ctx, request);
  const member = await getUniqueCommunityMembershipByPair({ ctx, communityId: request.communityId, userId: request.requesterUserId });
  const membership = member ? await ctx.db.get(member._id as Id<"communityMemberships">) : null;
  if (!membership) throw new Error("workflow_member_context_unavailable");
  const predecessor = request.workflowPreviousRunId ? await ctx.db.get(request.workflowPreviousRunId as Id<"communityMemberWorkflowRuns">) : null;
  const formSourceId = request.workflowFormRequestId ?? predecessor?.actionResult?.formRequestId;
  // The step's picked inputs narrow today's bundle: facts only when ticked, and
  // forms limited to the ones it names (the form that started the step always stays).
  const run = request.workflowRunId ? await ctx.db.get(request.workflowRunId as Id<"communityMemberWorkflowRuns">) : null;
  const sees = run?.actionSnapshot?.type === "prompt_agent" ? run.actionSnapshot.sees : undefined;
  const formKeys = workflowAgentSeesFormKeys(sees);
  const page = await readSubmittedFormRecords(ctx, membership, formSourceId);
  if (formKeys) page.records = page.records.filter((record, index) =>
    (index === 0 && formSourceId && record.request._id === formSourceId) || formKeys.includes(record.request.formKey));
  const evidence = projectSubmittedFormEvidence(page);
  const audience = evidence.submissions.length
    ? await requireMemberFormServiceAudience({ ctx, membership }) : null;
  const { facts, truncated } = workflowAgentSeesFacts(sees)
    ? await readBoundedMemberOrientationFacts(ctx, { subjectUserId: request.requesterUserId, communityId: request.communityId })
    : { facts: [], truncated: false };
  const identity = await readCanonicalUserIdentityProjection(ctx, request.requesterUserId);
  return JSON.stringify({
    display_name: String(identity?.displayName || "the member").slice(0, 120),
    approved_community_facts: facts.map(fact => ({
      id: String(fact._id), version: fact.version, kind: fact.kind, body: fact.body.slice(0, 600),
    })),
    truncated: truncated || facts.some(fact => fact.body.length > 600),
    ...(audience ? { form_audience: audience, submitted_form_evidence: evidence } : {}),
  });
}

/** A durable timer or submitted form is the source; the membership binding is the destination.
 * Reads and publication share this authority check. No synthetic interaction.
 */
export async function requireServiceWorkflowDestination(ctx: any, request: any) {
  if (request.workflowAssessment) return requireWorkflowAssessment(ctx, request);
  if (request.triggerKind !== "workflow" || [request.workflowTimerId, request.workflowFormRequestId, request.workflowPreviousRunId].filter(Boolean).length !== 1 || request.sourceRootId || request.sourceReplyId) {
    throw new Error("workflow_timer_source_invalid");
  }
  if (request._id && (request.status !== "running" || (request.leaseExpiresAt ?? 0) <= Date.now())) {
    throw new Error("workflow_execution_lease_expired");
  }
  const timer = request.workflowTimerId ? await ctx.db.get(request.workflowTimerId) : null;
  const run = request.workflowRunId ? await ctx.db.get(request.workflowRunId) : null;
  let resolved: any = timer ? await resolveWorkflowTimer(ctx, timer) : null;
  const configs = await ctx.db.query("communityAgentConfigs")
    .withIndex("by_community", (q: any) => q.eq("communityId", request.communityId)).take(5);
  if (configs.sort((a: any, b: any) => b.updatedAt - a.updatedAt)[0]?.agentEnabled === false) {
    throw new Error("workflow_agent_disabled");
  }
  if (request.workflowPreviousRunId) {
    const predecessor = await ctx.db.get(request.workflowPreviousRunId);
    const workflow = run ? await ctx.db.get(run.workflowId) : null;
    const membership = run ? await ctx.db.get(run.membershipId) : null;
    const state = run ? await ctx.db.query("communityMemberWorkflowMemberMilestones")
      .withIndex("by_workflow_membership", (q: any) => q.eq("workflowId", run.workflowId).eq("membershipId", run.membershipId)).unique() : null;
    const milestone = workflow?.milestones.find((m: any) => m.key === (state?.currentMilestoneKey ?? workflow.milestones[0]?.key));
    const automation = milestone?.automations.find((a: any) => a.key === run?.automationKey);
    if (!run || !predecessor || !workflow || !membership || !communityMembershipRowIsActive(membership)
      || membership.communityId !== request.communityId || workflow.communityId !== request.communityId
      || membership.userId !== request.requesterUserId || request.sponsorUserId !== request.requesterUserId
      || state?.completedAt || !milestone || workflowSequenceIssue(milestone.automations)
      || run.milestoneKey !== milestone.key || run.milestoneEnteredAt !== (state?.milestoneEnteredAt ?? membership.activatedAt ?? membership.createdAt)
      || run.transitionSeq !== (state?.transitionSeq ?? 0) || run.activationSequence !== (membership.activationSequence ?? 0)
      || run.communityId !== request.communityId || run.predecessorRunId !== predecessor._id
      || !automation || automation.trigger.type !== "previous_action_completed"
      || automation.trigger.predecessorActionKey !== predecessor.actionSnapshot.key
      || run.triggerReceiptRef !== workflowSequenceReceipt(run)
      || !["running", "finished"].includes(run.status)
      || (request._id && (run.status !== "finished" || run.actionResult?.serveRequestId !== request._id || run.actionResult?.status !== "complete"))
      || run.actionSnapshot.type !== "prompt_agent" || run.actionSnapshot.key !== request.workflowActionKey
      || run.actionSnapshot.prompt !== request.workflowPromptSnapshot
      || JSON.stringify(automation.action) !== JSON.stringify(run.actionSnapshot)
      || JSON.stringify(automation.trigger) !== JSON.stringify(run.triggerSnapshot)
      || (milestone.instructions ?? "") !== (run.milestoneContextSnapshot?.instructions ?? "")
      || (milestone.goal ?? "") !== (run.milestoneContextSnapshot?.goal ?? "")) throw new Error("workflow_sequence_authority_stale");
    const progress = await readWorkflowActionProgress(ctx, { workflow, membership, milestone,
      milestoneEnteredAt: run.milestoneEnteredAt, transitionSeq: run.transitionSeq });
    const source = [...progress.actions, ...(progress.reactive_actions ?? [])].find(a => a.evidence?.run_id === String(predecessor._id));
    if (progress.scan_truncated || !source || !workflowSequenceCompletionIsNew(automation, source.evidence!.completed_at, predecessor.workflowRevision))
      throw new Error("workflow_sequence_source_stale");
    await requireCommunityChatAccess({ ctx, communityId: request.communityId, userId: membership.userId, allowWelcome: true });
    resolved = { membership, workflow, automation };
  } else if (request.workflowFormRequestId) {
    const formRequest = await ctx.db.get(request.workflowFormRequestId);
    if (!formRequest || formRequest.status !== "submitted") throw new Error("workflow_form_source_stale");
    const membership = await ctx.db.get(formRequest.membershipId);
    const workflow = await ctx.db.get(formRequest.workflowId);
    // Intake requires the current visit. An admitted response is bound to its
    // durable source/run, not the member's subsequent pipeline position.
    if (!communityMembershipRowIsActive(membership) || !membership || !workflow
      || membership.communityId !== request.communityId || workflow.communityId !== request.communityId
      || (membership.activationSequence ?? 0) !== formRequest.activationSequence
      || (!request._id && !await requestIsCurrent(ctx, formRequest))) throw new Error("workflow_form_source_stale");
    await requireCommunityChatAccess({ ctx, communityId: request.communityId, userId: membership.userId, allowWelcome: true });
    const matches = workflow.milestones.find((m: any) => m.key === formRequest.milestoneKey)?.automations.filter((a: any) =>
      a.key === run?.automationKey && a.action.type === "prompt_agent"
      && a.trigger.type === "form_submitted" && a.trigger.formKey === formRequest.formKey) ?? [];
    const automation = matches.length === 1 ? matches[0] : null;
    if (!run || !automation || formRequest.communityId !== request.communityId
      || membership.userId !== request.requesterUserId || request.sponsorUserId !== request.requesterUserId
      || run.communityId !== request.communityId || run.workflowId !== formRequest.workflowId
      || run.membershipId !== formRequest.membershipId || run.milestoneKey !== formRequest.milestoneKey
      || run.milestoneEnteredAt !== formRequest.milestoneEnteredAt || run.automationKey !== automation.key
      || run.triggerReceiptRef !== `form_submission:${formRequest._id}`
      || !["running", "finished"].includes(run.status)
      || (request._id && (run.status !== "finished" || run.actionResult?.serveRequestId !== request._id || run.actionResult?.status !== "complete"))
      || run.actionSnapshot.type !== "prompt_agent" || run.actionSnapshot.key !== request.workflowActionKey
      || run.actionSnapshot.prompt !== request.workflowPromptSnapshot
      || JSON.stringify(automation.action) !== JSON.stringify(run.actionSnapshot)
      || JSON.stringify(automation.trigger) !== JSON.stringify(run.triggerSnapshot)) throw new Error("workflow_form_authority_stale");
    // Exact submitted evidence and private audience are required even at intake.
    await readServiceMemberContext(ctx, request);
    resolved = { membership, workflow, automation };
  } else if (!resolved || !run || timer.status === "obsolete"
    || (resolved.dueAt > Date.now() && timer.runEarlyAt === undefined)
    || run.communityId !== request.communityId || run.workflowId !== timer.workflowId
    || run.membershipId !== timer.membershipId || run.automationKey !== timer.automationKey
    || run.triggerReceiptRef !== `workflow-timer:${timer._id}`
    || run.milestoneKey !== timer.milestoneKey || run.milestoneEnteredAt !== timer.milestoneEnteredAt
    || !["running", "finished"].includes(run.status)
    || (request._id && (timer.status !== "consumed" || run.status !== "finished"
      || run.actionResult?.serveRequestId !== request._id || run.actionResult?.status !== "complete"))
    || resolved.membership.userId !== request.requesterUserId
    || request.sponsorUserId !== request.requesterUserId
    || run.actionSnapshot.type !== "prompt_agent"
    || run.actionSnapshot.key !== request.workflowActionKey
    || run.actionSnapshot.prompt !== request.workflowPromptSnapshot
    || JSON.stringify(resolved.automation.action) !== JSON.stringify(run.actionSnapshot)
    || JSON.stringify(resolved.automation.trigger) !== JSON.stringify(run.triggerSnapshot)) {
    throw new Error("workflow_timer_authority_stale");
  }
  const destination = await resolveMemberServiceChannel({ ctx, membership: resolved.membership as any });
  if (destination.status !== "available" || destination.channel_id !== String(request.serviceChannelId)
    || destination.revision !== request.serviceChannelRevision) {
    throw new Error("workflow_service_channel_unavailable");
  }
  if (request._id) {
    const snapshot = await ctx.db.query("communityAgentRunEvents")
      .withIndex("by_run_seq", (q: any) => q.eq("runId", buildCommunityAgentServeRunId(request._id, request.attempt)).eq("seq", 0)).first();
    if (snapshot?.kind === "context_snapshot") {
      const captured = JSON.parse(snapshot.content).timed_member_context;
      // Older prompt-only snapshots contain no member facts and need no new fence.
      if (captured !== undefined && captured !== await readServiceMemberContext(ctx, request)) {
        throw new Error("workflow_member_context_changed");
      }
    }
  }
  return { ...resolved, run, channelId: request.serviceChannelId };
}

export async function publishServiceWorkflowPost(ctx: any, request: any, content: string, nowMs: number) {
  if (request.workflowAssessment) throw new Error("workflow_assessment_cannot_publish");
  const { channelId } = await requireServiceWorkflowDestination(ctx, request);
  // Even a missing/deleted snapshot must not bypass the form disclosure fence.
  const currentContext = await readServiceMemberContext(ctx, request);
  if (JSON.parse(currentContext).submitted_form_evidence) {
    const snapshot = await ctx.db.query("communityAgentRunEvents")
      .withIndex("by_run_seq", (q: any) => q.eq("runId", buildCommunityAgentServeRunId(request._id, request.attempt)).eq("seq", 0)).first();
    if (snapshot?.kind !== "context_snapshot" || JSON.parse(snapshot.content).timed_member_context !== currentContext) {
      throw new Error("workflow_form_context_snapshot_missing");
    }
  }
  if (!content) throw new Error("workflow_agent_empty_response");
  const idempotencyKey = `community_agent_serve:${request._id}`;
  const existing = await ctx.db.query("communityInteractionRoots")
    .withIndex("by_community_idempotencyKey", (q: any) => q.eq("communityId", request.communityId).eq("idempotencyKey", idempotencyKey)).first();
  const rootId = existing?._id ?? await ctx.db.insert("communityInteractionRoots", {
    communityId: request.communityId, channelId, actorType: "community_agent", actorAgentKey: CANONICAL_COMMUNITY_AGENT_KEY,
    kind: "discussion", status: "live", visibilityScope: "community", contentSummary: content.slice(0, 500),
    replyCount: 0, reactionSummary: [], idempotencyKey, createdAt: nowMs, updatedAt: nowMs,
  });
  if (!existing) {
    await ctx.db.insert("communityInteractionContentBlocks", { communityId: request.communityId, rootId,
      blockOrder: 0, blockType: "markdown_text", text: content, createdAt: nowMs, updatedAt: nowMs });
    await scheduleCommunityInteractionEvidenceSync({ ctx, communityId: request.communityId, objectType: "root", objectId: rootId });
  }
  await ctx.db.patch(request._id, { status: "responded", responseRootId: rootId,
    respondedAt: nowMs, leaseExpiresAt: undefined, updatedAt: nowMs });
  await ctx.scheduler.runAfter(0, internal.communityMemberWorkflows.reconcileCompletedWorkflowActionsInternal,
    { workflowRunId: request.workflowRunId });
  return { ok: true, duplicate: Boolean(existing), responseRootId: rootId };
}
