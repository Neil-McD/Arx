import {
  buildCommunityOnboardingMilestonePatch,
  type CommunityOnboardingMilestone,
} from "../shared/communityOnboarding";

type CommunityOnboardingSessionRow = Record<string, any> & {
  _id: any;
  communityId: any;
  membershipId: any;
  userId: any;
  activationSequence: number;
  status: "active" | "completed" | "dismissed" | "superseded";
  orientationCompletedAt?: number;
  firstCommunityPostAt?: number;
  firstAgentDockTurnAt?: number;
  completedAt?: number;
  createdAt: number;
};

export async function createCommunityOnboardingSessionForActivation(args: {
  ctx: any;
  communityId: any;
  membershipId: any;
  userId: any;
  activationSequence: number;
  activatedAt: number;
}): Promise<any | null> {
  const config = (await args.ctx.db
    .query("communityOnboardingConfigs" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
    .first()) as Record<string, any> | null;
  if (!config?.enabled) return null;

  const existing = await args.ctx.db
    .query("communityOnboardingSessions" as any)
    .withIndex("by_membership_activation", (q: any) =>
      q.eq("membershipId", args.membershipId).eq("activationSequence", args.activationSequence),
    )
    .first();
  if (existing) return existing._id;

  const priorActiveSessions = (await args.ctx.db
    .query("communityOnboardingSessions" as any)
    .withIndex("by_user_community_status_createdAt", (q: any) =>
      q.eq("userId", args.userId).eq("communityId", args.communityId).eq("status", "active"),
    )
    .take(10)) as CommunityOnboardingSessionRow[];
  for (const prior of priorActiveSessions) {
    await args.ctx.db.patch(prior._id, {
      status: "superseded",
      supersededAt: args.activatedAt,
      updatedAt: args.activatedAt,
    });
  }

  const introVideoUrlSnapshot = String(config.introVideoUrl ?? "").trim() || undefined;
  return await args.ctx.db.insert("communityOnboardingSessions" as any, {
    communityId: args.communityId,
    membershipId: args.membershipId,
    userId: args.userId,
    activationSequence: args.activationSequence,
    welcomeMessageSnapshot: String(config.welcomeMessage ?? "").trim(),
    ...(introVideoUrlSnapshot ? { introVideoUrlSnapshot } : {}),
    status: "active",
    activatedAt: args.activatedAt,
    createdAt: args.activatedAt,
    updatedAt: args.activatedAt,
  });
}

export async function findActiveCommunityOnboardingSession(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<CommunityOnboardingSessionRow | null> {
  return (await args.ctx.db
    .query("communityOnboardingSessions" as any)
    .withIndex("by_user_community_status_createdAt", (q: any) =>
      q.eq("userId", args.userId).eq("communityId", args.communityId).eq("status", "active"),
    )
    .order("desc")
    .first()) as CommunityOnboardingSessionRow | null;
}

export async function recordCommunityOnboardingMilestone(args: {
  ctx: any;
  communityId: any;
  userId: any;
  milestone: CommunityOnboardingMilestone;
  nowMs: number;
}): Promise<CommunityOnboardingSessionRow | null> {
  const session = await findActiveCommunityOnboardingSession(args);
  if (!session) return null;
  return await recordCommunityOnboardingSessionMilestone({
    ctx: args.ctx,
    session,
    milestone: args.milestone,
    nowMs: args.nowMs,
  });
}

export async function recordCommunityOnboardingSessionMilestone(args: {
  ctx: any;
  session: CommunityOnboardingSessionRow;
  milestone: CommunityOnboardingMilestone;
  nowMs: number;
}): Promise<CommunityOnboardingSessionRow | null> {
  const session = args.session;
  const patch = buildCommunityOnboardingMilestonePatch(session, args.milestone, args.nowMs);
  if (!patch) return session;
  await args.ctx.db.patch(session._id, {
    ...patch,
    updatedAt: args.nowMs,
  });
  return (await args.ctx.db.get(session._id)) as CommunityOnboardingSessionRow | null;
}
