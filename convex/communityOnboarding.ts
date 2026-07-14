import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  normalizeIdValue,
  requireCommunityChatAccess,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import {
  COMMUNITY_ONBOARDING_AGENT_INSTRUCTIONS_MAX_CHARS,
  COMMUNITY_ONBOARDING_WELCOME_MAX_CHARS,
  buildCommunityOnboardingOrientationSeed,
  DEFAULT_COMMUNITY_ONBOARDING_AGENT_INSTRUCTIONS,
  DEFAULT_COMMUNITY_ONBOARDING_WELCOME,
  describeCommunityOnboardingPhaseObjective,
  deriveCommunityOnboardingPhase,
  normalizeCommunityOnboardingText,
  normalizeCommunityOnboardingVideoUrl,
} from "../shared/communityOnboarding";
import {
  findActiveCommunityOnboardingSession,
  recordCommunityOnboardingMilestone,
  recordCommunityOnboardingSessionMilestone,
} from "./communityOnboardingCore";
import { ensureGlobalMemberAgentChannelWithCommunityLensCore } from "./threads";

function mapConfig(row: Record<string, any> | null) {
  return {
    enabled: Boolean(row?.enabled),
    welcome_message: String(row?.welcomeMessage ?? DEFAULT_COMMUNITY_ONBOARDING_WELCOME),
    agent_instructions: String(
      row?.agentInstructions ?? DEFAULT_COMMUNITY_ONBOARDING_AGENT_INSTRUCTIONS,
    ),
    intro_video_url: String(row?.introVideoUrl ?? "").trim() || null,
    version: Math.max(0, Math.floor(Number(row?.version ?? 0))),
    updated_at: row?.updatedAt ? toIsoString(row.updatedAt) : null,
  };
}

function mapSession(row: Record<string, any>) {
  return {
    id: normalizeIdValue(row._id),
    community_id: normalizeIdValue(row.communityId),
    status: row.status,
    phase: deriveCommunityOnboardingPhase(row),
    welcome_message: String(row.welcomeMessageSnapshot ?? ""),
    agent_instructions: String(row.agentInstructionsSnapshot ?? ""),
    intro_video_url: String(row.introVideoUrlSnapshot ?? "").trim() || null,
    orientation_seeded_at: row.orientationSeededAt ? toIsoString(row.orientationSeededAt) : null,
    orientation_seed_message_key: String(row.orientationSeedMessageKey ?? "").trim() || null,
    orientation_seed_message_seq: Number.isFinite(Number(row.orientationSeedMessageSeq))
      ? Math.max(0, Math.floor(Number(row.orientationSeedMessageSeq)))
      : null,
    activated_at: toIsoString(row.activatedAt),
    opened_at: row.openedAt ? toIsoString(row.openedAt) : null,
    orientation_completed_at: row.orientationCompletedAt
      ? toIsoString(row.orientationCompletedAt)
      : null,
    first_community_post_at: row.firstCommunityPostAt
      ? toIsoString(row.firstCommunityPostAt)
      : null,
    first_agent_dock_turn_at: row.firstAgentDockTurnAt
      ? toIsoString(row.firstAgentDockTurnAt)
      : null,
    completed_at: row.completedAt ? toIsoString(row.completedAt) : null,
  };
}

async function requireOwnedActiveSession(args: {
  ctx: any;
  sessionId: any;
  communityId: any;
  userId: any;
}) {
  const session = await args.ctx.db.get(args.sessionId);
  if (
    !session ||
    session.status !== "active" ||
    normalizeIdValue(session.communityId) !== normalizeIdValue(args.communityId) ||
    normalizeIdValue(session.userId) !== normalizeIdValue(args.userId)
  ) {
    throw new Error("community_onboarding_session_not_found");
  }
  return session;
}

export const getCommunityOnboardingConfig = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const row = await ctx.db
      .query("communityOnboardingConfigs")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
      .first();
    return mapConfig(row);
  },
});

export const saveCommunityOnboardingConfig = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    enabled: v.boolean(),
    welcomeMessage: v.string(),
    agentInstructions: v.string(),
    introVideoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const welcomeMessage = normalizeCommunityOnboardingText(
      args.welcomeMessage,
      COMMUNITY_ONBOARDING_WELCOME_MAX_CHARS,
    );
    const agentInstructions = normalizeCommunityOnboardingText(
      args.agentInstructions,
      COMMUNITY_ONBOARDING_AGENT_INSTRUCTIONS_MAX_CHARS,
    );
    if (!welcomeMessage) throw new Error("community_onboarding_welcome_required");
    if (!agentInstructions) throw new Error("community_onboarding_instructions_required");
    const rawIntroVideoUrl = String(args.introVideoUrl ?? "").trim();
    const introVideoUrl = normalizeCommunityOnboardingVideoUrl(rawIntroVideoUrl);
    if (rawIntroVideoUrl && !introVideoUrl) {
      throw new Error("community_onboarding_video_url_invalid");
    }

    const nowMs = Date.now();
    const existing = await ctx.db
      .query("communityOnboardingConfigs")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
      .first();
    const next = {
      enabled: args.enabled,
      welcomeMessage,
      agentInstructions,
      version: Math.max(0, Math.floor(Number(existing?.version ?? 0))) + 1,
      updatedByUserId: userId,
      updatedAt: nowMs,
    };
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...next,
        introVideoUrl: introVideoUrl ?? undefined,
      });
      return mapConfig(await ctx.db.get(existing._id));
    }
    const id = await ctx.db.insert("communityOnboardingConfigs", {
      communityId: args.communityId,
      ...next,
      ...(introVideoUrl ? { introVideoUrl } : {}),
      createdAt: nowMs,
    });
    return mapConfig(await ctx.db.get(id));
  },
});

export const getMyCommunityOnboardingSession = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const session = await findActiveCommunityOnboardingSession({
      ctx,
      communityId: args.communityId,
      userId,
    });
    return session ? mapSession(session) : null;
  },
});

export const openMyCommunityOnboardingSession = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    sessionId: v.id("communityOnboardingSessions"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const access = await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const ownedSession = await requireOwnedActiveSession({
      ctx,
      sessionId: args.sessionId,
      communityId: args.communityId,
      userId,
    });
    let session = await recordCommunityOnboardingSessionMilestone({
      ctx,
      session: ownedSession,
      milestone: "opened",
      nowMs: Date.now(),
    });
    if (session && !session.orientationSeededAt) {
      const nowMs = Date.now();
      const channel = await ensureGlobalMemberAgentChannelWithCommunityLensCore({
        ctx,
        ownerId: userId,
        community: access.community,
        nowMs,
      });
      const thread = (await ctx.db.get(channel.thread_id as any)) as Record<string, any> | null;
      if (!thread || normalizeIdValue(thread.ownerId) !== normalizeIdValue(userId)) {
        throw new Error("member_agent_thread_not_found");
      }
      const messageKey = `community-onboarding:${normalizeIdValue(session._id)}:orientation`;
      let seedMessage = await ctx.db
        .query("cloudMessages")
        .withIndex("by_owner_messageKey", (q) =>
          q.eq("ownerId", userId).eq("messageKey", messageKey),
        )
        .first();
      if (seedMessage && normalizeIdValue(seedMessage.threadId) !== normalizeIdValue(thread._id)) {
        throw new Error("community_onboarding_seed_message_conflict");
      }
      if (!seedMessage) {
        const seq = Math.max(0, Math.floor(Number(thread.lastSeq ?? 0))) + 1;
        const seedMessageId = await ctx.db.insert("cloudMessages", {
          ownerId: userId,
          threadId: thread._id,
          messageKey,
          seq,
          role: "assistant",
          contentJson: {
            text: buildCommunityOnboardingOrientationSeed({
              communityName: String(access.community?.name ?? "").trim(),
              welcomeMessage: String(session.welcomeMessageSnapshot ?? ""),
            }),
          },
          engineId: "polynet_onboarding",
          createdAt: nowMs,
        });
        seedMessage = await ctx.db.get(seedMessageId);
        await ctx.db.patch(thread._id, { lastSeq: seq, updatedAt: nowMs });
      }
      if (!seedMessage) throw new Error("community_onboarding_seed_failed");
      await ctx.db.patch(session._id, {
        orientationSeededAt: nowMs,
        orientationSeedMessageKey: messageKey,
        orientationSeedMessageSeq: seedMessage.seq,
        updatedAt: nowMs,
      });
      session = (await ctx.db.get(session._id)) as typeof session;
    }
    return session ? mapSession(session) : null;
  },
});

export const completeMyCommunityOnboardingOrientation = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    sessionId: v.id("communityOnboardingSessions"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const ownedSession = await requireOwnedActiveSession({
      ctx,
      sessionId: args.sessionId,
      communityId: args.communityId,
      userId,
    });
    const session = await recordCommunityOnboardingSessionMilestone({
      ctx,
      session: ownedSession,
      milestone: "orientation_completed",
      nowMs: Date.now(),
    });
    return session ? mapSession(session) : null;
  },
});

export const dismissMyCommunityOnboardingSession = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    sessionId: v.id("communityOnboardingSessions"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const session = await requireOwnedActiveSession({
      ctx,
      sessionId: args.sessionId,
      communityId: args.communityId,
      userId,
    });
    const nowMs = Date.now();
    await ctx.db.patch(session._id, {
      status: "dismissed",
      dismissedAt: nowMs,
      updatedAt: nowMs,
    });
    return { dismissed: true };
  },
});

export const resolveActivePersonalAgentGuidanceInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const session = await findActiveCommunityOnboardingSession({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    if (!session) return null;
    const phase = deriveCommunityOnboardingPhase(session);
    const instructions = normalizeCommunityOnboardingText(
      session.agentInstructionsSnapshot,
      COMMUNITY_ONBOARDING_AGENT_INSTRUCTIONS_MAX_CHARS,
    );
    if (!instructions) return null;
    return {
      sessionId: session._id,
      phase,
      objective: describeCommunityOnboardingPhaseObjective(phase),
      instructions: [
        `Current onboarding phase: ${phase}.`,
        `Phase objective: ${describeCommunityOnboardingPhaseObjective(phase)}`,
        `Community guidance: ${instructions}`,
      ].join("\n"),
    };
  },
});

export const recordPersonalAgentDockTurnInternal = internalMutation({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    occurredAt: v.number(),
  },
  handler: async (ctx, args) => {
    const activeSession = await findActiveCommunityOnboardingSession({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    if (!activeSession || deriveCommunityOnboardingPhase(activeSession) !== "first_agent_dock_turn") {
      return { recorded: false };
    }
    const session = await recordCommunityOnboardingMilestone({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      milestone: "first_agent_dock_turn",
      nowMs: args.occurredAt,
    });
    return { recorded: Boolean(session?.firstAgentDockTurnAt) };
  },
});
