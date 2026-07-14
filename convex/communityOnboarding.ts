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
  DEFAULT_COMMUNITY_ONBOARDING_AGENT_INSTRUCTIONS,
  DEFAULT_COMMUNITY_ONBOARDING_WELCOME,
  deriveCommunityOnboardingPhase,
  normalizeCommunityOnboardingText,
} from "../shared/communityOnboarding";
import {
  findActiveCommunityOnboardingSession,
  recordCommunityOnboardingMilestone,
  recordCommunityOnboardingSessionMilestone,
} from "./communityOnboardingCore";

function mapConfig(row: Record<string, any> | null) {
  return {
    enabled: Boolean(row?.enabled),
    welcome_message: String(row?.welcomeMessage ?? DEFAULT_COMMUNITY_ONBOARDING_WELCOME),
    agent_instructions: String(
      row?.agentInstructions ?? DEFAULT_COMMUNITY_ONBOARDING_AGENT_INSTRUCTIONS,
    ),
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
      await ctx.db.patch(existing._id, next);
      return mapConfig(await ctx.db.get(existing._id));
    }
    const id = await ctx.db.insert("communityOnboardingConfigs", {
      communityId: args.communityId,
      ...next,
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
      milestone: "opened",
      nowMs: Date.now(),
    });
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
    if (
      !session ||
      deriveCommunityOnboardingPhase({
        orientationCompletedAt: session.orientationCompletedAt,
        firstCommunityPostAt: session.firstCommunityPostAt,
        firstAgentDockTurnAt: session.firstAgentDockTurnAt,
      }) !== "first_agent_dock_turn"
    ) {
      return null;
    }
    const instructions = normalizeCommunityOnboardingText(
      session.agentInstructionsSnapshot,
      COMMUNITY_ONBOARDING_AGENT_INSTRUCTIONS_MAX_CHARS,
    );
    if (!instructions) return null;
    return {
      sessionId: session._id,
      instructions,
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
