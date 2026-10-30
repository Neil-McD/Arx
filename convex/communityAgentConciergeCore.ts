import { type StoredInteractionActorType } from "../shared/communityAgentIdentity";
import { internal } from "./_generated/api";
import { normalizeIdValue, requireCommunityChatAccess } from "./communityCore";
import { settleMentionRowInternal } from "./communityMentionLifecycle";
import { CANONICAL_COMMUNITY_AGENT_KEY } from "../shared/communityAgentToolProtocol";
import { COMMUNITY_AGENT_SERVE_RECOVERY_DELAYS_MS } from "../shared/communityAgentServeContract";
import { resolveCommunityInferenceFundingAdmission } from "./founderInferenceCore";
import { requireAgentSourceChannelAccess } from "./communityAgentChannelAccess";
import { requireServiceWorkflowDestination } from "./communityAgentServiceWorkflowCore";

const internalRefs = internal as any;

type VisibilityScope = "private" | "admin" | "community" | "public";
export type ServeRequestStatus = "queued" | "skipped" | "running" | "responded" | "error";
export type ServeRequestIntakeReason =
  | "accepted"
  | "duplicate"
  | "not_addressed"
  | "invalid_agent"
  | "source_missing"
  | "source_not_live"
  | "source_not_human"
  | "requester_missing"
  | "requester_access_missing"
  | "agent_disabled"
  | "founder_plan_required"
  | "founder_subscription_inactive"
  | "founder_subscription_ambiguous"
  | "founder_subscription_owner_mismatch";

export type ConciergeMentionRow = {
  _id: any;
  communityId: any;
  rootId?: any;
  replyId?: any;
  mentionKind: string;
  mentionedAgentKey?: string;
  notifyState: "pending" | "sent" | "suppressed" | "read";
};

type InteractionRootRow = {
  _id: any;
  communityId: any;
  channelId?: any;
  actorType: StoredInteractionActorType;
  actorUserId?: any;
  actorAgentKey?: string;
  status: "live" | "hidden" | "deleted";
  visibilityScope: VisibilityScope;
};

type InteractionReplyRow = {
  _id: any;
  communityId: any;
  rootId: any;
  actorType: StoredInteractionActorType;
  actorUserId?: any;
  actorAgentKey?: string;
  targetReplyId?: any;
  seq: number;
  status: "live" | "hidden" | "deleted";
  visibilityScope: VisibilityScope;
};

export type ConciergeIntakeResult = {
  mention_id: string | null;
  invocation_key: string;
  trigger_kind: "mention" | "direct_reply" | "workflow" | null;
  status: "queued" | "skipped" | "duplicate" | "ignored";
  intake_reason: ServeRequestIntakeReason;
  request_id: string | null;
};

type CommunityAgentTriggerKind = "mention" | "direct_reply" | "workflow";

function boundedText(raw: unknown, maxLength: number): string {
  return String(raw ?? "").trim().slice(0, maxLength);
}

function mentionSettledStateForServeStatus(status: ServeRequestStatus): "sent" | "suppressed" {
  return status === "skipped" || status === "error" ? "suppressed" : "sent";
}

async function latestCommunityAgentConfig(ctx: any, communityId: any): Promise<Record<string, any> | null> {
  const rows = (await ctx.db
    .query("communityAgentConfigs" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .take(5)) as Array<Record<string, any>>;
  return rows.slice().sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0))[0] ?? null;
}

async function existingServeRequestForMention(ctx: any, mentionId: any): Promise<Record<string, any> | null> {
  return (await ctx.db
    .query("communityAgentServeRequests" as any)
    .withIndex("by_sourceMention", (q: any) => q.eq("sourceMentionId", mentionId))
    .first()) as Record<string, any> | null;
}

async function existingServeRequestForInvocation(args: {
  ctx: any;
  communityId: any;
  invocationKey: string;
  mentionId?: any;
  rootId?: any;
  replyId?: any;
}): Promise<Record<string, any> | null> {
  const current = (await args.ctx.db
    .query("communityAgentServeRequests" as any)
    .withIndex("by_community_invocationKey", (q: any) =>
      q.eq("communityId", args.communityId).eq("invocationKey", args.invocationKey),
    )
    .first()) as Record<string, any> | null;
  if (current) return current;
  if (args.mentionId) {
    const historicalMentionRequest = await existingServeRequestForMention(args.ctx, args.mentionId);
    if (historicalMentionRequest) return historicalMentionRequest;
  }
  if (args.replyId) {
    return (await args.ctx.db
      .query("communityAgentServeRequests" as any)
      .withIndex("by_sourceReply", (q: any) => q.eq("sourceReplyId", args.replyId))
      .first()) as Record<string, any> | null;
  }
  if (!args.rootId) return null;
  const rootRequests = (await args.ctx.db
    .query("communityAgentServeRequests" as any)
    .withIndex("by_sourceRoot_createdAt", (q: any) => q.eq("sourceRootId", args.rootId))
    .order("asc")
    .take(10)) as Array<Record<string, any>>;
  return rootRequests.find((row) => !row.sourceReplyId) ?? null;
}

async function settleMentionFromServeRequest(args: {
  ctx: any;
  mention: ConciergeMentionRow;
  status: ServeRequestStatus;
  nowMs: number;
}): Promise<void> {
  await settleMentionRowInternal({
    ctx: args.ctx,
    mentionId: args.mention._id,
    toState: mentionSettledStateForServeStatus(args.status),
    nowMs: args.nowMs,
  });
}

async function scheduleImmediateServeWorker(args: {
  ctx: any;
  requestId: any;
}): Promise<void> {
  // This runs inside the intake mutation. Convex commits the queued request and
  // scheduled action atomically, so a global polling repair drain is unnecessary.
  // Scheduled actions are at-most-once. Attach a finite request-scoped recovery
  // budget atomically to intake instead of scanning the deployment every minute.
  for (const delayMs of COMMUNITY_AGENT_SERVE_RECOVERY_DELAYS_MS) {
    await args.ctx.scheduler.runAfter(
      delayMs,
      internalRefs.communityAgentServeWorker.processQueuedCommunityAgentServeRequestsInternal,
      {
        requestId: args.requestId,
        limit: 1,
      },
    );
  }
}

async function insertServeRequest(args: {
  workflowCompletionReview?: boolean;
  workflowAssessment?: boolean;
  ctx: any;
  communityId: any;
  invocationKey: string;
  triggerKind: CommunityAgentTriggerKind;
  mention?: ConciergeMentionRow;
  status: ServeRequestStatus;
  intakeReason: ServeRequestIntakeReason;
  sourceRootId?: any;
  sourceReplyId?: any;
  requesterUserId?: any;
  workflowRunId?: any;
  workflowActionKey?: string;
  workflowPromptSnapshot?: string;
  workflowPreviousRunId?: any;
  workflowTimerId?: any;
  workflowFormRequestId?: any;
  serviceChannelId?: any;
  serviceChannelRevision?: number;
  sourceVisibilityScope?: VisibilityScope;
  responseVisibilityScope?: VisibilityScope;
  skipReason?: string;
  nowMs: number;
}): Promise<any> {
  const sponsorUserId = args.requesterUserId;
  if (args.status === "queued") {
    if (!args.requesterUserId || normalizeIdValue(sponsorUserId) !== normalizeIdValue(args.requesterUserId)) {
      throw new Error("community_agent_serve_request_sponsor_must_equal_requester");
    }
    if (!args.sourceVisibilityScope || !args.responseVisibilityScope) {
      throw new Error("community_agent_serve_request_visibility_required");
    }
  }
  return await args.ctx.db.insert("communityAgentServeRequests" as any, {
    ...(args.workflowCompletionReview ? { workflowCompletionReview: true } : {}),
    ...(args.workflowAssessment ? { workflowAssessment: true } : {}),
    communityId: args.communityId,
    agentKey: CANONICAL_COMMUNITY_AGENT_KEY,
    ...(args.mention ? { sourceMentionId: args.mention._id } : {}),
    invocationKey: args.invocationKey,
    triggerKind: args.triggerKind,
    ...(args.sourceRootId ? { sourceRootId: args.sourceRootId } : {}),
    ...(args.sourceReplyId ? { sourceReplyId: args.sourceReplyId } : {}),
    ...(args.requesterUserId ? { requesterUserId: args.requesterUserId, sponsorUserId } : {}),
    ...(args.workflowRunId ? { workflowRunId: args.workflowRunId } : {}),
    ...((args.workflowPreviousRunId || args.workflowTimerId || args.workflowFormRequestId) ? { workflowPreviousRunId: args.workflowPreviousRunId, workflowTimerId: args.workflowTimerId, workflowFormRequestId: args.workflowFormRequestId,
      serviceChannelId: args.serviceChannelId, serviceChannelRevision: args.serviceChannelRevision } : {}),
    ...(args.workflowActionKey ? { workflowActionKey: args.workflowActionKey } : {}),
    ...(args.workflowPromptSnapshot
      ? { workflowPromptSnapshot: args.workflowPromptSnapshot }
      : {}),
    status: args.status,
    intakeReason: args.intakeReason,
    ...(args.sourceVisibilityScope ? { sourceVisibilityScope: args.sourceVisibilityScope } : {}),
    ...(args.responseVisibilityScope ? { responseVisibilityScope: args.responseVisibilityScope } : {}),
    ...(args.skipReason ? { skipReason: boundedText(args.skipReason, 240) } : {}),
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
}

async function skipInvocation(args: {
  workflowCompletionReview?: boolean;
  workflowAssessment?: boolean;
  ctx: any;
  communityId: any;
  invocationKey: string;
  triggerKind: CommunityAgentTriggerKind;
  mention?: ConciergeMentionRow;
  intakeReason: Exclude<ServeRequestIntakeReason, "accepted">;
  sourceRootId?: any;
  sourceReplyId?: any;
  requesterUserId?: any;
  workflowRunId?: any;
  workflowActionKey?: string;
  workflowPromptSnapshot?: string;
  workflowPreviousRunId?: any;
  workflowTimerId?: any;
  workflowFormRequestId?: any;
  serviceChannelId?: any;
  serviceChannelRevision?: number;
  sourceVisibilityScope?: VisibilityScope;
  responseVisibilityScope?: VisibilityScope;
  skipReason?: string;
  nowMs: number;
}): Promise<{ status: "skipped"; intake_reason: ServeRequestIntakeReason; request_id: string }> {
  const requestId = await insertServeRequest({
    workflowCompletionReview: args.workflowCompletionReview,
    workflowAssessment: args.workflowAssessment,
    ctx: args.ctx,
    communityId: args.communityId,
    invocationKey: args.invocationKey,
    triggerKind: args.triggerKind,
    mention: args.mention,
    status: "skipped",
    intakeReason: args.intakeReason,
    sourceRootId: args.sourceRootId,
    sourceReplyId: args.sourceReplyId,
    requesterUserId: args.requesterUserId,
    workflowRunId: args.workflowRunId,
    workflowActionKey: args.workflowActionKey,
    workflowPromptSnapshot: args.workflowPromptSnapshot,
    workflowPreviousRunId: args.workflowPreviousRunId, workflowTimerId: args.workflowTimerId,
    workflowFormRequestId: args.workflowFormRequestId,
    serviceChannelId: args.serviceChannelId,
    serviceChannelRevision: args.serviceChannelRevision,
    sourceVisibilityScope: args.sourceVisibilityScope,
    responseVisibilityScope: args.responseVisibilityScope,
    skipReason: args.skipReason,
    nowMs: args.nowMs,
  });
  if (args.mention) {
    await settleMentionFromServeRequest({
      ctx: args.ctx,
      mention: args.mention,
      status: "skipped",
      nowMs: args.nowMs,
    });
  }
  return {
    status: "skipped",
    intake_reason: args.intakeReason,
    request_id: normalizeIdValue(requestId),
  };
}

function invocationKeyForSource(args: {
  rootId?: any;
  replyId?: any;
  mentionId?: any;
}): string {
  if (args.replyId) return `community_agent_turn:reply:${normalizeIdValue(args.replyId)}`;
  if (args.rootId) return `community_agent_turn:root:${normalizeIdValue(args.rootId)}`;
  return `community_agent_turn:mention:${normalizeIdValue(args.mentionId)}`;
}

async function resolveInvocationSource(args: {
  ctx: any;
  communityId: any;
  rootId?: any;
  replyId?: any;
}): Promise<{
  root: InteractionRootRow | null;
  reply: InteractionReplyRow | null;
  sourceRootId?: any;
  sourceReplyId?: any;
  actorType?: string;
  requesterUserId?: any;
  visibilityScope?: VisibilityScope;
}> {
  if (args.replyId) {
    const reply = (await args.ctx.db.get(args.replyId as any)) as InteractionReplyRow | null;
    if (!reply || normalizeIdValue(reply.communityId) !== normalizeIdValue(args.communityId)) {
      return { root: null, reply: null };
    }
    const root = (await args.ctx.db.get(reply.rootId as any)) as InteractionRootRow | null;
    if (
      !root ||
      normalizeIdValue(root.communityId) !== normalizeIdValue(args.communityId) ||
      (args.rootId && normalizeIdValue(root._id) !== normalizeIdValue(args.rootId))
    ) {
      return { root: null, reply };
    }
    return {
      root,
      reply,
      sourceRootId: root._id,
      sourceReplyId: reply._id,
      actorType: reply.actorType,
      requesterUserId: reply.actorUserId,
      visibilityScope: reply.visibilityScope,
    };
  }
  if (args.rootId) {
    const root = (await args.ctx.db.get(args.rootId as any)) as InteractionRootRow | null;
    if (!root || normalizeIdValue(root.communityId) !== normalizeIdValue(args.communityId)) {
      return { root: null, reply: null };
    }
    return {
      root,
      reply: null,
      sourceRootId: root._id,
      actorType: root.actorType,
      requesterUserId: root.actorUserId,
      visibilityScope: root.visibilityScope,
    };
  }
  return { root: null, reply: null };
}

async function resolveTriggerKind(args: {
  ctx: any;
  source: Awaited<ReturnType<typeof resolveInvocationSource>>;
  mention?: ConciergeMentionRow;
}): Promise<CommunityAgentTriggerKind | null> {
  const { root, reply } = args.source;
  if (reply?.targetReplyId) {
    const target = (await args.ctx.db.get(reply.targetReplyId as any)) as InteractionReplyRow | null;
    if (
      target &&
      target.status === "live" &&
      target.actorType === "community_agent" &&
      target.actorAgentKey === CANONICAL_COMMUNITY_AGENT_KEY &&
      normalizeIdValue(target.communityId) === normalizeIdValue(reply.communityId) &&
      normalizeIdValue(target.rootId) === normalizeIdValue(reply.rootId)
    ) {
      return "direct_reply";
    }
  }
  if (args.mention) return "mention";
  if (
    reply &&
    !reply.targetReplyId &&
    root?.actorType === "community_agent" &&
    root.actorAgentKey === CANONICAL_COMMUNITY_AGENT_KEY
  ) {
    return "direct_reply";
  }
  // A member's guide channel is a conversation with the agent: anything the
  // member posts there is for it, no @mention needed.
  if (await isPostInOwnGuideChannel(args.ctx, args.source)) return "direct_reply";
  return null;
}

async function isPostInOwnGuideChannel(
  ctx: any,
  source: Awaited<ReturnType<typeof resolveInvocationSource>>,
): Promise<boolean> {
  const channelId = source.root?.channelId;
  if (source.actorType !== "human" || !channelId || !source.requesterUserId) return false;
  const memberships = await ctx.db
    .query("communityMemberships")
    .withIndex("by_community_user", (q: any) =>
      q.eq("communityId", source.root!.communityId).eq("userId", source.requesterUserId))
    .collect();
  return memberships.some((membership: any) =>
    membership.active !== false && normalizeIdValue(membership.serviceChannelId) === normalizeIdValue(channelId));
}

export async function intakeCommunityAgentTurn(args: {
  ctx: any;
  communityId: any;
  rootId?: any;
  replyId?: any;
  mention?: ConciergeMentionRow;
  nowMs: number;
}): Promise<ConciergeIntakeResult> {
  const mentionId = args.mention?._id;
  const invocationKey = invocationKeyForSource({
    rootId: args.rootId ?? args.mention?.rootId,
    replyId: args.replyId ?? args.mention?.replyId,
    mentionId,
  });
  const existing = await existingServeRequestForInvocation({
    ctx: args.ctx,
    communityId: args.communityId,
    invocationKey,
    mentionId,
    rootId: args.rootId ?? args.mention?.rootId,
    replyId: args.replyId ?? args.mention?.replyId,
  });
  if (existing) {
    if (args.mention) {
      await settleMentionFromServeRequest({
        ctx: args.ctx,
        mention: args.mention,
        status: existing.status,
        nowMs: args.nowMs,
      });
    }
    return {
      mention_id: mentionId ? normalizeIdValue(mentionId) : null,
      invocation_key: invocationKey,
      trigger_kind: existing.triggerKind ?? (args.mention ? "mention" : null),
      status: "duplicate",
      intake_reason: "duplicate",
      request_id: normalizeIdValue(existing._id),
    };
  }

  if (
    args.mention &&
    (args.mention.mentionKind !== "community_agent" ||
      args.mention.mentionedAgentKey !== CANONICAL_COMMUNITY_AGENT_KEY)
  ) {
    const skipped = await skipInvocation({
      ctx: args.ctx,
      communityId: args.communityId,
      invocationKey,
      triggerKind: "mention",
      mention: args.mention,
      intakeReason: "invalid_agent",
      skipReason: "Only the canonical community agent can be served by Concierge intake.",
      nowMs: args.nowMs,
    });
    return {
      mention_id: mentionId ? normalizeIdValue(mentionId) : null,
      invocation_key: invocationKey,
      trigger_kind: "mention",
      ...skipped,
    };
  }

  const source = await resolveInvocationSource({
    ctx: args.ctx,
    communityId: args.communityId,
    rootId: args.rootId ?? args.mention?.rootId,
    replyId: args.replyId ?? args.mention?.replyId,
  });
  const triggerKind = await resolveTriggerKind({
    ctx: args.ctx,
    source,
    mention: args.mention,
  });
  if (!source.root && !source.reply) {
    const skipped = await skipInvocation({
      ctx: args.ctx,
      communityId: args.communityId,
      invocationKey,
      triggerKind: triggerKind ?? "mention",
      mention: args.mention,
      intakeReason: "source_missing",
      skipReason: "The mentioned interaction no longer exists.",
      nowMs: args.nowMs,
    });
    return {
      mention_id: mentionId ? normalizeIdValue(mentionId) : null,
      invocation_key: invocationKey,
      trigger_kind: triggerKind,
      ...skipped,
    };
  }
  if (!triggerKind) {
    return {
      mention_id: null,
      invocation_key: invocationKey,
      trigger_kind: null,
      status: "ignored",
      intake_reason: "not_addressed",
      request_id: null,
    };
  }
  if (source.root?.status !== "live" || (source.reply && source.reply.status !== "live")) {
    const skipped = await skipInvocation({
      ctx: args.ctx,
      communityId: args.communityId,
      invocationKey,
      triggerKind,
      mention: args.mention,
      intakeReason: "source_not_live",
      sourceRootId: source.sourceRootId,
      sourceReplyId: source.sourceReplyId,
      requesterUserId: source.requesterUserId,
      sourceVisibilityScope: source.visibilityScope,
      responseVisibilityScope: source.visibilityScope,
      skipReason: "The mentioned interaction is not live.",
      nowMs: args.nowMs,
    });
    return {
      mention_id: mentionId ? normalizeIdValue(mentionId) : null,
      invocation_key: invocationKey,
      trigger_kind: triggerKind,
      ...skipped,
    };
  }
  if (source.actorType !== "human") {
    const skipped = await skipInvocation({
      ctx: args.ctx,
      communityId: args.communityId,
      invocationKey,
      triggerKind,
      mention: args.mention,
      intakeReason: "source_not_human",
      sourceRootId: source.sourceRootId,
      sourceReplyId: source.sourceReplyId,
      requesterUserId: source.requesterUserId,
      sourceVisibilityScope: source.visibilityScope,
      responseVisibilityScope: source.visibilityScope,
      skipReason: "Concierge intake only serves human-authored mentions.",
      nowMs: args.nowMs,
    });
    return {
      mention_id: mentionId ? normalizeIdValue(mentionId) : null,
      invocation_key: invocationKey,
      trigger_kind: triggerKind,
      ...skipped,
    };
  }
  if (!source.requesterUserId) {
    const skipped = await skipInvocation({
      ctx: args.ctx,
      communityId: args.communityId,
      invocationKey,
      triggerKind,
      mention: args.mention,
      intakeReason: "requester_missing",
      sourceRootId: source.sourceRootId,
      sourceReplyId: source.sourceReplyId,
      sourceVisibilityScope: source.visibilityScope,
      responseVisibilityScope: source.visibilityScope,
      skipReason: "The mention author could not be resolved.",
      nowMs: args.nowMs,
    });
    return {
      mention_id: mentionId ? normalizeIdValue(mentionId) : null,
      invocation_key: invocationKey,
      trigger_kind: triggerKind,
      ...skipped,
    };
  }
  try {
    await requireCommunityChatAccess({
      ctx: args.ctx,
      communityId: args.communityId,
      userId: source.requesterUserId,
    });
    await requireAgentSourceChannelAccess({ ctx: args.ctx, root: source.root, userId: source.requesterUserId });
  } catch {
    const skipped = await skipInvocation({
      ctx: args.ctx,
      communityId: args.communityId,
      invocationKey,
      triggerKind,
      mention: args.mention,
      intakeReason: "requester_access_missing",
      sourceRootId: source.sourceRootId,
      sourceReplyId: source.sourceReplyId,
      requesterUserId: source.requesterUserId,
      sourceVisibilityScope: source.visibilityScope,
      responseVisibilityScope: source.visibilityScope,
      skipReason: "The mention author no longer has community chat access.",
      nowMs: args.nowMs,
    });
    return {
      mention_id: mentionId ? normalizeIdValue(mentionId) : null,
      invocation_key: invocationKey,
      trigger_kind: triggerKind,
      ...skipped,
    };
  }
  const config = await latestCommunityAgentConfig(args.ctx, args.communityId);
  if (config?.agentEnabled === false) {
    const skipped = await skipInvocation({
      ctx: args.ctx,
      communityId: args.communityId,
      invocationKey,
      triggerKind,
      mention: args.mention,
      intakeReason: "agent_disabled",
      sourceRootId: source.sourceRootId,
      sourceReplyId: source.sourceReplyId,
      requesterUserId: source.requesterUserId,
      sourceVisibilityScope: source.visibilityScope,
      responseVisibilityScope: source.visibilityScope,
      skipReason: "The community agent is disabled by the owner.",
      nowMs: args.nowMs,
    });
    return {
      mention_id: mentionId ? normalizeIdValue(mentionId) : null,
      invocation_key: invocationKey,
      trigger_kind: triggerKind,
      ...skipped,
    };
  }
  const funding = await resolveCommunityInferenceFundingAdmission(
    args.ctx,
    args.communityId,
  );
  if (funding.ok === false) {
    const intakeReason = funding.code === "community_not_found"
      ? "source_missing"
      : funding.code;
    const skipped = await skipInvocation({
      ctx: args.ctx,
      communityId: args.communityId,
      invocationKey,
      triggerKind,
      mention: args.mention,
      intakeReason,
      sourceRootId: source.sourceRootId,
      sourceReplyId: source.sourceReplyId,
      requesterUserId: source.requesterUserId,
      sourceVisibilityScope: source.visibilityScope,
      responseVisibilityScope: source.visibilityScope,
      skipReason: funding.code === "founder_subscription_inactive"
          ? "The community founder subscription is inactive."
          : funding.code === "founder_plan_required"
            ? "The community requires an active founder plan."
            : "Community inference funding could not be resolved.",
      nowMs: args.nowMs,
    });
    return {
      mention_id: mentionId ? normalizeIdValue(mentionId) : null,
      invocation_key: invocationKey,
      trigger_kind: triggerKind,
      ...skipped,
    };
  }
  const requestId = await insertServeRequest({
    ctx: args.ctx,
    communityId: args.communityId,
    invocationKey,
    triggerKind,
    mention: args.mention,
    status: "queued",
    intakeReason: "accepted",
    sourceRootId: source.sourceRootId,
    sourceReplyId: source.sourceReplyId,
    requesterUserId: source.requesterUserId,
    sourceVisibilityScope: source.visibilityScope,
    responseVisibilityScope: source.visibilityScope,
    nowMs: args.nowMs,
  });
  if (args.mention) {
    await settleMentionFromServeRequest({
      ctx: args.ctx,
      mention: args.mention,
      status: "queued",
      nowMs: args.nowMs,
    });
  }
  await scheduleImmediateServeWorker({
    ctx: args.ctx,
    requestId,
  });
  return {
    mention_id: mentionId ? normalizeIdValue(mentionId) : null,
    invocation_key: invocationKey,
    trigger_kind: triggerKind,
    status: "queued",
    intake_reason: "accepted",
    request_id: normalizeIdValue(requestId),
  };
}

export async function intakeCommunityAgentWorkflowAction(args: {
  workflowCompletionReview?: boolean;
  workflowAssessment?: boolean;
  retrySkippedRequestId?: any;
  ctx: any;
  communityId: any;
  rootId?: any;
  workflowPreviousRunId?: any;
  workflowTimerId?: any;
  workflowFormRequestId?: any;
  replyId?: any;
  requesterUserId: any;
  workflowRunId: any;
  workflowActionKey: string;
  workflowPromptSnapshot: string;
  nowMs: number;
}): Promise<ConciergeIntakeResult> {
  const workflowActionKey = boundedText(args.workflowActionKey, 64);
  const workflowPromptSnapshot = String(args.workflowPromptSnapshot ?? "")
    .trim()
    .slice(0, 4_000);
  if (!workflowActionKey || !workflowPromptSnapshot) {
    throw new Error("community_agent_workflow_action_invalid");
  }
  const workflowRun = await args.ctx.db.get(args.workflowRunId);
  if (
    !workflowRun ||
    workflowRun.status !== "running" ||
    normalizeIdValue(workflowRun.communityId) !== normalizeIdValue(args.communityId) ||
    workflowRun.actionSnapshot?.type !== (args.workflowAssessment ? "evaluate_goal" : "prompt_agent") ||
    workflowRun.actionSnapshot?.key !== workflowActionKey ||
    (!args.workflowAssessment && workflowRun.actionSnapshot?.prompt !== workflowPromptSnapshot)
  ) {
    throw new Error("community_agent_workflow_run_authority_invalid");
  }
  const invocationKey = `workflow:${normalizeIdValue(args.workflowRunId)}:${workflowActionKey}`;
  const existing = (await args.ctx.db
    .query("communityAgentServeRequests" as any)
    .withIndex("by_community_invocationKey", (q: any) =>
      q.eq("communityId", args.communityId).eq("invocationKey", invocationKey),
    )
    .first()) as Record<string, any> | null;
  const retryRequest = args.retrySkippedRequestId && existing
    && normalizeIdValue(existing._id) === normalizeIdValue(args.retrySkippedRequestId)
    && existing.status === "skipped" && existing.attempt === undefined
    && existing.workflowCompletionReview !== false && existing.workflowAssessment !== false
    && normalizeIdValue(existing.workflowRunId) === normalizeIdValue(args.workflowRunId)
    ? existing : null;
  if (args.retrySkippedRequestId && !retryRequest) {
    throw new Error("community_agent_workflow_review_retry_unavailable");
  }
  if (existing && !retryRequest) {
    return {
      mention_id: null,
      invocation_key: invocationKey,
      trigger_kind: "workflow",
      status: "duplicate",
      intake_reason: "duplicate",
      request_id: normalizeIdValue(existing._id),
    };
  }
  const timedMembership = (args.workflowPreviousRunId || args.workflowTimerId || args.workflowFormRequestId || args.workflowCompletionReview) ? await args.ctx.db.get(workflowRun.membershipId) : null;
  const timedDestination = (args.workflowPreviousRunId || args.workflowTimerId || args.workflowFormRequestId || args.workflowCompletionReview) ? {
    ...(args.workflowCompletionReview ? { workflowCompletionReview: true } : {}),
    ...(args.workflowAssessment ? { workflowAssessment: true } : {}),
    workflowPreviousRunId: args.workflowPreviousRunId, workflowTimerId: args.workflowTimerId,
    workflowFormRequestId: args.workflowFormRequestId,
    serviceChannelId: args.workflowAssessment ? undefined : timedMembership?.serviceChannelId,
    serviceChannelRevision: timedMembership?.serviceChannelRevision ?? 0,
  } : {};
  const source = await resolveInvocationSource({
    ctx: args.ctx,
    communityId: args.communityId,
    rootId: args.rootId,
    replyId: args.replyId,
  });
  const skip = async (
    intakeReason: Exclude<ServeRequestIntakeReason, "accepted">,
    skipReason: string,
  ): Promise<ConciergeIntakeResult> => {
    if (retryRequest) {
      await args.ctx.db.patch(retryRequest._id, { intakeReason, skipReason: boundedText(skipReason, 240), updatedAt: args.nowMs });
      return { mention_id: null, invocation_key: invocationKey, trigger_kind: "workflow",
        status: "skipped", intake_reason: intakeReason, request_id: normalizeIdValue(retryRequest._id) };
    }
    return {
      mention_id: null,
      invocation_key: invocationKey,
      trigger_kind: "workflow",
      ...(await skipInvocation({
      ctx: args.ctx,
      communityId: args.communityId,
      invocationKey,
      triggerKind: "workflow",
      intakeReason,
      sourceRootId: source.sourceRootId ?? args.rootId,
      sourceReplyId: source.sourceReplyId ?? args.replyId,
      requesterUserId: source.requesterUserId ?? args.requesterUserId,
      workflowRunId: args.workflowRunId,
      workflowActionKey,
      workflowPromptSnapshot,
      ...timedDestination,
      sourceVisibilityScope: source.visibilityScope,
      responseVisibilityScope: source.visibilityScope,
      skipReason,
      nowMs: args.nowMs,
      })),
    };
  };
  if (args.workflowPreviousRunId || args.workflowTimerId || args.workflowFormRequestId || args.workflowCompletionReview) {
    try {
      await requireServiceWorkflowDestination(args.ctx, {
        ...args, ...timedDestination, triggerKind: "workflow", sponsorUserId: args.requesterUserId,
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("workflow_")) throw error;
      return await skip(error.message === "workflow_agent_disabled" ? "agent_disabled" : "requester_access_missing", error.message);
    }
  } else {
  if (!source.root && !source.reply) {
    return await skip("source_missing", "The triggering contribution no longer exists.");
  }
  if (source.root?.status !== "live" || (source.reply && source.reply.status !== "live")) {
    return await skip("source_not_live", "The triggering contribution is not live.");
  }
  if (
    source.actorType !== "human" ||
    !source.requesterUserId ||
    normalizeIdValue(source.requesterUserId) !== normalizeIdValue(args.requesterUserId)
  ) {
    return await skip("source_not_human", "The workflow trigger is not an eligible member contribution.");
  }
  }
  try {
    await requireCommunityChatAccess({
      ctx: args.ctx,
      communityId: args.communityId,
      userId: args.requesterUserId,
    });
    if (!args.workflowPreviousRunId && !args.workflowTimerId && !args.workflowFormRequestId && !args.workflowCompletionReview) await requireAgentSourceChannelAccess({ ctx: args.ctx, root: source.root, userId: args.requesterUserId });
  } catch {
    return await skip(
      "requester_access_missing",
      "The triggering member no longer has community chat access.",
    );
  }
  const config = await latestCommunityAgentConfig(args.ctx, args.communityId);
  if (config?.agentEnabled === false) {
    return await skip("agent_disabled", "The community agent is disabled by the owner.");
  }
  const funding = await resolveCommunityInferenceFundingAdmission(
    args.ctx,
    args.communityId,
  );
  if (funding.ok === false) {
    const intakeReason = funding.code === "community_not_found"
      ? "source_missing"
      : funding.code;
    return await skip(
      intakeReason,
      funding.code === "founder_subscription_inactive"
        ? "The community founder subscription is inactive."
        : funding.code === "founder_plan_required"
          ? "The community requires an active founder plan."
          : "Community inference funding could not be resolved.",
    );
  }
  const requestId = retryRequest ? retryRequest._id : await insertServeRequest({
    ctx: args.ctx,
    communityId: args.communityId,
    invocationKey,
    triggerKind: "workflow",
    status: "queued",
    intakeReason: "accepted",
    sourceRootId: source.sourceRootId,
    sourceReplyId: source.sourceReplyId,
    requesterUserId: args.requesterUserId,
    workflowRunId: args.workflowRunId,
    workflowActionKey,
    workflowPromptSnapshot,
    ...timedDestination,
    sourceVisibilityScope: args.workflowAssessment ? "admin" : (args.workflowPreviousRunId || args.workflowTimerId || args.workflowFormRequestId) ? "community" : source.visibilityScope,
    responseVisibilityScope: args.workflowAssessment ? "admin" : (args.workflowPreviousRunId || args.workflowTimerId || args.workflowFormRequestId) ? "community" : source.visibilityScope,
    nowMs: args.nowMs,
  });
  if (retryRequest) {
    await args.ctx.db.patch(requestId, { status: "queued", intakeReason: "accepted",
      workflowCompletionReview: true, workflowAssessment: true,
      sourceVisibilityScope: "admin", responseVisibilityScope: "admin", skipReason: undefined, updatedAt: args.nowMs });
  }
  await scheduleImmediateServeWorker({ ctx: args.ctx, requestId });
  return {
    mention_id: null,
    invocation_key: invocationKey,
    trigger_kind: "workflow",
    status: "queued",
    intake_reason: "accepted",
    request_id: normalizeIdValue(requestId),
  };
}
