import { resolveWorkflowTimer } from "./communityMemberWorkflowTimerCore";
import { resolveMemberServiceChannel } from "./communityMemberServiceChannelCore";
import { scheduleCommunityInteractionEvidenceSync } from "./communityInteractionEvidence";
import { CANONICAL_COMMUNITY_AGENT_KEY } from "../shared/communityAgentToolProtocol";
import { readBoundedMemberOrientationFacts } from "./memberOntologyCore";
import { readCanonicalUserIdentityProjection } from "./profileCore";
import { buildCommunityAgentServeRunId } from "../shared/communityAgentServeContract";

/** Community-approved orientation only; never the account spine or builder dossier. */
export async function readTimedMemberContext(ctx: any, request: any) {
  const { facts, truncated } = await readBoundedMemberOrientationFacts(ctx, {
    subjectUserId: request.requesterUserId, communityId: request.communityId,
  });
  const identity = await readCanonicalUserIdentityProjection(ctx, request.requesterUserId);
  return JSON.stringify({
    display_name: String(identity?.displayName || "the member").slice(0, 120),
    approved_community_facts: facts.map(fact => ({
      id: String(fact._id), version: fact.version, kind: fact.kind, body: fact.body.slice(0, 600),
    })),
    truncated: truncated || facts.some(fact => fact.body.length > 600),
  });
}

/** A durable timer is the source; a captured membership binding is the destination.
 * Reads and publication share this authority check. No synthetic interaction.
 */
export async function requireTimedWorkflowDestination(ctx: any, request: any) {
  if (request.triggerKind !== "workflow" || !request.workflowTimerId || request.sourceRootId || request.sourceReplyId) {
    throw new Error("workflow_timer_source_invalid");
  }
  const timer = await ctx.db.get(request.workflowTimerId);
  const run = request.workflowRunId ? await ctx.db.get(request.workflowRunId) : null;
  const resolved = timer ? await resolveWorkflowTimer(ctx, timer) : null;
  const configs = await ctx.db.query("communityAgentConfigs")
    .withIndex("by_community", (q: any) => q.eq("communityId", request.communityId)).take(5);
  if (configs.sort((a: any, b: any) => b.updatedAt - a.updatedAt)[0]?.agentEnabled === false) {
    throw new Error("workflow_agent_disabled");
  }
  if (!resolved || !run || timer.status === "obsolete"
    || resolved.dueAt > Date.now()
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
      if (captured !== undefined && captured !== await readTimedMemberContext(ctx, request)) {
        throw new Error("workflow_member_context_changed");
      }
    }
  }
  return { ...resolved, run, channelId: request.serviceChannelId };
}

export async function publishTimedWorkflowPost(ctx: any, request: any, content: string, nowMs: number) {
  const { channelId } = await requireTimedWorkflowDestination(ctx, request);
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
  return { ok: true, duplicate: Boolean(existing), responseRootId: rootId };
}
