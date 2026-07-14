export const DEFAULT_COMMUNITY_ONBOARDING_WELCOME =
  "Welcome! Let’s get you oriented and help you take your first useful steps in this community.";

export const DEFAULT_COMMUNITY_ONBOARDING_AGENT_INSTRUCTIONS =
  "Orient the member to this community. Be concise, use only permission-approved community context, and suggest one concrete next action.";

export const COMMUNITY_ONBOARDING_WELCOME_MAX_CHARS = 1_200;
export const COMMUNITY_ONBOARDING_AGENT_INSTRUCTIONS_MAX_CHARS = 4_000;
export const COMMUNITY_ONBOARDING_VIDEO_URL_MAX_CHARS = 2_000;

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
  intro_video_url: string | null;
  concierge_display_name: string;
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
  concierge_display_name: string;
  orientation_seeded_at: string | null;
  orientation_seed_reply_id: string | null;
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

export function normalizeCommunityOnboardingVideoUrl(raw: unknown): string | null {
  const value = normalizeCommunityOnboardingText(raw, COMMUNITY_ONBOARDING_VIDEO_URL_MAX_CHARS);
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function buildCommunityOnboardingOrientationSeed(params: {
  communityName: string;
  welcomeMessage: string;
  conciergeDisplayName: string;
  hasIntroVideo?: boolean;
}): string {
  const communityName = String(params.communityName ?? "").trim() || "this community";
  const conciergeDisplayName = String(params.conciergeDisplayName ?? "").trim() || communityName;
  const welcomeMessage = normalizeCommunityOnboardingText(
    params.welcomeMessage,
    COMMUNITY_ONBOARDING_WELCOME_MAX_CHARS,
  );
  return [
    welcomeMessage,
    `I’m ${conciergeDisplayName}, the community concierge for ${communityName}. I’ll help you get oriented and take your first useful step.`,
    params.hasIntroVideo
      ? "Start with the short founder video above. Then tell me what you hope to get from this community."
      : "What brought you here: learning, meeting people, or building something?",
  ].filter(Boolean).join("\n\n");
}

export function describeCommunityOnboardingPhaseObjective(
  phase: CommunityOnboardingPhase,
): string {
  if (phase === "orientation") {
    return "Help the member understand this community and answer their orientation questions before they continue.";
  }
  if (phase === "first_community_post") {
    return "Help the member make one useful, authentic first contribution in the community chat.";
  }
  if (phase === "first_agent_dock_turn") {
    return "Help the member use their private personal agent for one concrete next action in this community.";
  }
  return "Onboarding is complete; respond normally under the active community lens.";
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
    intro_video_url: params.config.intro_video_url,
    concierge_display_name: params.config.concierge_display_name,
    orientation_seeded_at: params.nowIso,
    orientation_seed_reply_id: null,
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
