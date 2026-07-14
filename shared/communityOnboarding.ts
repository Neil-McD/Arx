export const DEFAULT_COMMUNITY_ONBOARDING_WELCOME =
  "Welcome! Let’s get you oriented and help you take your first useful steps in this community.";

export const DEFAULT_COMMUNITY_ONBOARDING_AGENT_INSTRUCTIONS =
  "Orient the member to this community. Be concise, use only permission-approved community context, and suggest one concrete next action.";

export const COMMUNITY_ONBOARDING_WELCOME_MAX_CHARS = 1_200;
export const COMMUNITY_ONBOARDING_AGENT_INSTRUCTIONS_MAX_CHARS = 4_000;

export type CommunityOnboardingStatus =
  | "active"
  | "completed"
  | "dismissed"
  | "superseded";

export type CommunityOnboardingPhase =
  | "orientation"
  | "first_community_post"
  | "first_agent_dock_turn"
  | "complete";

export type CommunityOnboardingConfig = {
  enabled: boolean;
  welcome_message: string;
  agent_instructions: string;
  version: number;
  updated_at: string | null;
};

export type CommunityOnboardingSession = {
  id: string;
  community_id: string;
  status: CommunityOnboardingStatus;
  phase: CommunityOnboardingPhase;
  welcome_message: string;
  agent_instructions: string;
  intro_video_url: string | null;
  activated_at: string;
  opened_at: string | null;
  orientation_completed_at: string | null;
  first_community_post_at: string | null;
  first_agent_dock_turn_at: string | null;
  completed_at: string | null;
};

export type CommunityOnboardingMilestoneRow = {
  status: CommunityOnboardingStatus;
  openedAt?: number;
  orientationCompletedAt?: number;
  firstCommunityPostAt?: number;
  firstAgentDockTurnAt?: number;
  completedAt?: number;
};

export type CommunityOnboardingMilestone =
  | "opened"
  | "orientation_completed"
  | "first_community_post"
  | "first_agent_dock_turn";

export function normalizeCommunityOnboardingText(raw: unknown, maxChars: number): string {
  return String(raw ?? "").trim().slice(0, maxChars);
}

export function deriveCommunityOnboardingPhase(
  session: Pick<
    CommunityOnboardingMilestoneRow,
    "orientationCompletedAt" | "firstCommunityPostAt" | "firstAgentDockTurnAt"
  >,
): CommunityOnboardingPhase {
  if (!session.orientationCompletedAt) return "orientation";
  if (!session.firstCommunityPostAt) return "first_community_post";
  if (!session.firstAgentDockTurnAt) return "first_agent_dock_turn";
  return "complete";
}

export function shouldPresentCommunityOnboardingOrientation(
  session: Pick<CommunityOnboardingSession, "status" | "phase"> | null | undefined,
): boolean {
  return session?.status === "active" && session.phase === "orientation";
}

export function shouldPresentCommunityOnboardingFirstPost(
  session: Pick<CommunityOnboardingSession, "status" | "phase"> | null | undefined,
): boolean {
  return session?.status === "active" && session.phase === "first_community_post";
}

export function shouldPresentCommunityOnboardingAgentStep(
  session: Pick<CommunityOnboardingSession, "status" | "phase"> | null | undefined,
): boolean {
  return session?.status === "active" && session.phase === "first_agent_dock_turn";
}

export function createCommunityOnboardingPreviewSession(params: {
  communityId: string;
  config: CommunityOnboardingConfig;
  introVideoUrl?: string | null;
  nowIso: string;
  previewId: string;
}): CommunityOnboardingSession {
  return {
    id: `preview:${params.communityId}:${params.config.version}:${params.previewId}`,
    community_id: params.communityId,
    status: "active",
    phase: "orientation",
    welcome_message: params.config.welcome_message,
    agent_instructions: params.config.agent_instructions,
    intro_video_url: String(params.introVideoUrl ?? "").trim() || null,
    activated_at: params.nowIso,
    opened_at: params.nowIso,
    orientation_completed_at: null,
    first_community_post_at: null,
    first_agent_dock_turn_at: null,
    completed_at: null,
  };
}

export function advanceCommunityOnboardingPreviewSession(
  session: CommunityOnboardingSession,
  nowIso: string,
): CommunityOnboardingSession {
  if (session.status !== "active") return session;
  if (session.phase === "orientation") {
    return {
      ...session,
      phase: "first_community_post",
      orientation_completed_at: session.orientation_completed_at ?? nowIso,
    };
  }
  if (session.phase === "first_community_post") {
    return {
      ...session,
      phase: "first_agent_dock_turn",
      first_community_post_at: session.first_community_post_at ?? nowIso,
    };
  }
  if (session.phase === "first_agent_dock_turn") {
    return {
      ...session,
      status: "completed",
      phase: "complete",
      first_agent_dock_turn_at: session.first_agent_dock_turn_at ?? nowIso,
      completed_at: session.completed_at ?? nowIso,
    };
  }
  return session;
}

/**
 * Pure, idempotent milestone transition used by the Convex write paths and the
 * behavioral contract proof. A milestone never rewrites an earlier timestamp.
 */
export function buildCommunityOnboardingMilestonePatch(
  session: CommunityOnboardingMilestoneRow,
  milestone: CommunityOnboardingMilestone,
  nowMs: number,
): Partial<CommunityOnboardingMilestoneRow> | null {
  if (session.status !== "active") return null;
  const timestamp = Math.max(0, Math.floor(nowMs));
  const patch: Partial<CommunityOnboardingMilestoneRow> = {};

  if (milestone === "opened" && !session.openedAt) patch.openedAt = timestamp;
  if (milestone === "orientation_completed") {
    if (!session.openedAt) patch.openedAt = timestamp;
    if (!session.orientationCompletedAt) patch.orientationCompletedAt = timestamp;
  }
  if (milestone === "first_community_post" && !session.firstCommunityPostAt) {
    patch.firstCommunityPostAt = timestamp;
  }
  if (milestone === "first_agent_dock_turn" && !session.firstAgentDockTurnAt) {
    patch.firstAgentDockTurnAt = timestamp;
  }

  const next = { ...session, ...patch };
  if (
    next.orientationCompletedAt &&
    next.firstCommunityPostAt &&
    next.firstAgentDockTurnAt &&
    !session.completedAt
  ) {
    patch.status = "completed";
    patch.completedAt = timestamp;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}
