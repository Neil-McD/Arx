import { internal } from "./_generated/api";
import { normalizeIdValue, requireCommunityChatAccess } from "./communityCore";
import { settleMentionRowInternal } from "./communityMentionLifecycle";
import { CANONICAL_COMMUNITY_AGENT_KEY } from "../shared/communityAgentToolProtocol";
import { resolveCommunityInferenceFundingAdmission } from "./founderInferenceCore";

const internalRefs = internal as any;

type VisibilityScope = "private" | "admin" | "community" | "public";
export type ServeRequestStatus = "queued" | "skipped" | "running" | "responded" | "error";
export type ServeRequestIntakeReason =
  | "accepted"
  | "duplicate"
  | "invalid_agent"
  | "source_missing"
  | "source_not_live"
  | "source_not_human"
  | "requester_missing"
  | "requester_access_missing"
  | "agent_disabled"
  | "owner_funding_choice_required"
  | "owner_credential_missing"
  | "owner_funding_suspended"
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
  actorType: "human" | "personal_agent" | "community_agent" | "system";
  actorUserId?: any;
  status: "live" | "hidden" | "deleted";
  visibilityScope: VisibilityScope;
};

type InteractionReplyRow = {
  _id: any;
  communityId: any;
  rootId: any;
  actorType: "human" | "personal_agent" | "community_agent" | "system";
  actorUserId?: any;
  status: "live" | "hidden" | "deleted";
  visibilityScope: VisibilityScope;
};

export type ConciergeIntakeResult = {
  mention_id: string;
  status: "queued" | "skipped" | "duplicate";
  intake_reason: ServeRequestIntakeReason;
  request_id: string | null;
};

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
  try {
    await args.ctx.scheduler.runAfter(
      0,
      internalRefs.communityAgentServeWorker.processQueuedCommunityAgentServeRequestsInternal,
      {
        requestId: args.requestId,
        limit: 1,
      },
    );
  } catch {
    // Chat writes should not fail because the immediate serve schedule failed;
    // the queued request remains durable and the serve repair cron will drain it.
  }
}

async function insertServeRequest(args: {
  ctx: any;
  mention: ConciergeMentionRow;
  status: ServeRequestStatus;
  intakeReason: ServeRequestIntakeReason;
  sourceRootId?: any;
  sourceReplyId?: any;
  requesterUserId?: any;
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
    communityId: args.mention.communityId,
    agentKey: CANONICAL_COMMUNITY_AGENT_KEY,
    sourceMentionId: args.mention._id,
    ...(args.sourceRootId ? { sourceRootId: args.sourceRootId } : {}),
    ...(args.sourceReplyId ? { sourceReplyId: args.sourceReplyId } : {}),
    ...(args.requesterUserId ? { requesterUserId: args.requesterUserId, sponsorUserId } : {}),
    status: args.status,
    intakeReason: args.intakeReason,
    ...(args.sourceVisibilityScope ? { sourceVisibilityScope: args.sourceVisibilityScope } : {}),
    ...(args.responseVisibilityScope ? { responseVisibilityScope: args.responseVisibilityScope } : {}),
    ...(args.skipReason ? { skipReason: boundedText(args.skipReason, 240) } : {}),
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
}

async function skipMention(args: {
  ctx: any;
  mention: ConciergeMentionRow;
  intakeReason: Exclude<ServeRequestIntakeReason, "accepted">;
  sourceRootId?: any;
  sourceReplyId?: any;
  requesterUserId?: any;
  sourceVisibilityScope?: VisibilityScope;
  responseVisibilityScope?: VisibilityScope;
  skipReason?: string;
  nowMs: number;
}): Promise<{ status: "skipped"; intake_reason: ServeRequestIntakeReason; request_id: string }> {
  const requestId = await insertServeRequest({
    ctx: args.ctx,
    mention: args.mention,
    status: "skipped",
    intakeReason: args.intakeReason,
    sourceRootId: args.sourceRootId,
    sourceReplyId: args.sourceReplyId,
    requesterUserId: args.requesterUserId,
    sourceVisibilityScope: args.sourceVisibilityScope,
    responseVisibilityScope: args.responseVisibilityScope,
    skipReason: args.skipReason,
    nowMs: args.nowMs,
  });
  await settleMentionFromServeRequest({
    ctx: args.ctx,
    mention: args.mention,
    status: "skipped",
    nowMs: args.nowMs,
  });
  return {
    status: "skipped",
    intake_reason: args.intakeReason,
    request_id: normalizeIdValue(requestId),
  };
}

async function resolveMentionSource(ctx: any, mention: ConciergeMentionRow): Promise<{
  root: InteractionRootRow | null;
  reply: InteractionReplyRow | null;
  sourceRootId?: any;
  sourceReplyId?: any;
  actorType?: string;
  requesterUserId?: any;
  visibilityScope?: VisibilityScope;
}> {
  if (mention.replyId) {
    const reply = (await ctx.db.get(mention.replyId as any)) as InteractionReplyRow | null;
    if (!reply || normalizeIdValue(reply.communityId) !== normalizeIdValue(mention.communityId)) {
      return { root: null, reply: null };
    }
    const root = (await ctx.db.get(reply.rootId as any)) as InteractionRootRow | null;
    if (!root || normalizeIdValue(root.communityId) !== normalizeIdValue(mention.communityId)) {
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
  if (mention.rootId) {
    const root = (await ctx.db.get(mention.rootId as any)) as InteractionRootRow | null;
    if (!root || normalizeIdValue(root.communityId) !== normalizeIdValue(mention.communityId)) {
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

export async function intakeCommunityAgentMention(args: {
  ctx: any;
  mention: ConciergeMentionRow;
  nowMs: number;
}): Promise<ConciergeIntakeResult> {
  const existing = await existingServeRequestForMention(args.ctx, args.mention._id);
  if (existing) {
    await settleMentionFromServeRequest({
      ctx: args.ctx,
      mention: args.mention,
      status: existing.status,
      nowMs: args.nowMs,
    });
    return {
      mention_id: normalizeIdValue(args.mention._id),
      status: "duplicate",
      intake_reason: "duplicate",
      request_id: normalizeIdValue(existing._id),
    };
  }

  if (
    args.mention.mentionKind !== "community_agent" ||
    args.mention.mentionedAgentKey !== CANONICAL_COMMUNITY_AGENT_KEY
  ) {
    const skipped = await skipMention({
      ctx: args.ctx,
      mention: args.mention,
      intakeReason: "invalid_agent",
      skipReason: "Only the canonical community agent can be served by Concierge intake.",
      nowMs: args.nowMs,
    });
    return { mention_id: normalizeIdValue(args.mention._id), ...skipped };
  }

  const source = await resolveMentionSource(args.ctx, args.mention);
  if (!source.root && !source.reply) {
    const skipped = await skipMention({
      ctx: args.ctx,
      mention: args.mention,
      intakeReason: "source_missing",
      skipReason: "The mentioned interaction no longer exists.",
      nowMs: args.nowMs,
    });
    return { mention_id: normalizeIdValue(args.mention._id), ...skipped };
  }
  if (source.root?.status !== "live" || (source.reply && source.reply.status !== "live")) {
    const skipped = await skipMention({
      ctx: args.ctx,
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
    return { mention_id: normalizeIdValue(args.mention._id), ...skipped };
  }
  if (source.actorType !== "human") {
    const skipped = await skipMention({
      ctx: args.ctx,
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
    return { mention_id: normalizeIdValue(args.mention._id), ...skipped };
  }
  if (!source.requesterUserId) {
    const skipped = await skipMention({
      ctx: args.ctx,
      mention: args.mention,
      intakeReason: "requester_missing",
      sourceRootId: source.sourceRootId,
      sourceReplyId: source.sourceReplyId,
      sourceVisibilityScope: source.visibilityScope,
      responseVisibilityScope: source.visibilityScope,
      skipReason: "The mention author could not be resolved.",
      nowMs: args.nowMs,
    });
    return { mention_id: normalizeIdValue(args.mention._id), ...skipped };
  }
  try {
    await requireCommunityChatAccess({
      ctx: args.ctx,
      communityId: args.mention.communityId,
      userId: source.requesterUserId,
    });
  } catch {
    const skipped = await skipMention({
      ctx: args.ctx,
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
    return { mention_id: normalizeIdValue(args.mention._id), ...skipped };
  }
  const config = await latestCommunityAgentConfig(args.ctx, args.mention.communityId);
  if (config?.agentEnabled === false) {
    const skipped = await skipMention({
      ctx: args.ctx,
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
    return { mention_id: normalizeIdValue(args.mention._id), ...skipped };
  }
  const funding = await resolveCommunityInferenceFundingAdmission(
    args.ctx,
    args.mention.communityId,
  );
  if (funding.ok === false) {
    const intakeReason = funding.code === "community_not_found"
      ? "source_missing"
      : funding.code;
    const skipped = await skipMention({
      ctx: args.ctx,
      mention: args.mention,
      intakeReason,
      sourceRootId: source.sourceRootId,
      sourceReplyId: source.sourceReplyId,
      requesterUserId: source.requesterUserId,
      sourceVisibilityScope: source.visibilityScope,
      responseVisibilityScope: source.visibilityScope,
      skipReason: funding.code === "owner_credential_missing"
        ? "The community owner must connect an OpenAI API key."
        : funding.code === "owner_funding_choice_required"
          ? "The community owner must activate an OpenAI API key or fund this community at $79/month."
        : funding.code === "owner_funding_suspended"
          ? "Community inference funding is suspended."
          : funding.code === "founder_subscription_inactive"
            ? "The community founder subscription is inactive."
          : funding.code === "founder_plan_required"
            ? "The community requires an active founder plan."
            : "Community inference funding could not be resolved.",
      nowMs: args.nowMs,
    });
    return { mention_id: normalizeIdValue(args.mention._id), ...skipped };
  }
  const requestId = await insertServeRequest({
    ctx: args.ctx,
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
  await settleMentionFromServeRequest({
    ctx: args.ctx,
    mention: args.mention,
    status: "queued",
    nowMs: args.nowMs,
  });
  await scheduleImmediateServeWorker({
    ctx: args.ctx,
    requestId,
  });
  return {
    mention_id: normalizeIdValue(args.mention._id),
    status: "queued",
    intake_reason: "accepted",
    request_id: normalizeIdValue(requestId),
  };
}
