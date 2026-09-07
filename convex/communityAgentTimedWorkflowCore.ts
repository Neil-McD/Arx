import { resolveWorkflowTimer } from "./communityMemberWorkflowTimerCore";
import { resolveMemberServiceChannel } from "./communityMemberServiceChannelCore";
import { scheduleCommunityInteractionEvidenceSync } from "./communityInteractionEvidence";
import { CANONICAL_COMMUNITY_AGENT_KEY } from "../shared/communityAgentToolProtocol";

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
