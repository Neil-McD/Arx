export const DEFAULT_COMMUNITY_ONBOARDING_WELCOME =
  "Welcome! Let’s get you oriented and help you take your first useful steps in this community.";

export const COMMUNITY_ONBOARDING_WELCOME_MAX_CHARS = 1_200;
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
  | "agent_turn_review"
  | "mcp_handoff"
  | "complete";

export type CommunityOnboardingConfig = {
  enabled: boolean;
  welcome_message: string;
  intro_video_url: string | null;
  updated_at: string | null;
};

export type CommunityOnboardingOrientationNarration = {
  status: "idle" | "running" | "ready" | "fallback";
  text: string | null;
};

export type CommunityOnboardingSession = {
  id: string;
  community_id: string;
  status: CommunityOnboardingStatus;
  phase: CommunityOnboardingPhase;
  welcome_message: string;
  intro_video_url: string | null;
  orientation_narration: CommunityOnboardingOrientationNarration | null;
  activated_at: string;
  orientation_completed_at: string | null;
  first_community_post_at: string | null;
  first_agent_dock_turn_at: string | null;
  agent_turn_acknowledged_at: string | null;
  mcp_handoff_completed_at: string | null;
  completed_at: string | null;
};

export type CommunityOnboardingMilestoneRow = {
  status: CommunityOnboardingStatus;
  orientationCompletedAt?: number;
  firstCommunityPostAt?: number;
  firstAgentDockTurnAt?: number;
  agentTurnAcknowledgedAt?: number;
  mcpHandoffCompletedAt?: number;
  completedAt?: number;
};

export type CommunityOnboardingMilestone =
  | "orientation_completed"
  | "first_community_post"
  | "first_agent_dock_turn"
  | "agent_turn_acknowledged"
  | "mcp_handoff_completed";

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

export function buildCommunityOnboardingIntroductionDraft(params: {
  displayName?: string | null;
}): string {
  const displayName = String(params.displayName ?? "").trim();
  const firstName = displayName.split(/\s+/)[0]?.trim() ?? "";
  return firstName
    ? `Hi, I’m ${firstName}. I joined because `
    : "Hi! I joined because ";
}

export function isCommunityOnboardingIntroductionReady(params: {
  text: string;
  seededDraft: string;
}): boolean {
  const text = String(params.text ?? "").trim();
  const seededDraft = String(params.seededDraft ?? "").trim();
  if (!text || text === seededDraft) return false;
  const memberContribution = text.startsWith(seededDraft)
    ? text.slice(seededDraft.length).trim()
    : text;
  return memberContribution.length >= 3;
}

export function deriveCommunityOnboardingPhase(
  session: Pick<
    CommunityOnboardingMilestoneRow,
    | "orientationCompletedAt"
    | "firstCommunityPostAt"
    | "firstAgentDockTurnAt"
    | "agentTurnAcknowledgedAt"
    | "mcpHandoffCompletedAt"
    | "completedAt"
  >,
): CommunityOnboardingPhase {
  if (session.completedAt) return "complete";
  if (!session.orientationCompletedAt) return "orientation";
  if (!session.firstCommunityPostAt) return "first_community_post";
  if (!session.firstAgentDockTurnAt) return "first_agent_dock_turn";
  if (!session.agentTurnAcknowledgedAt) return "agent_turn_review";
  if (!session.mcpHandoffCompletedAt) return "mcp_handoff";
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

export function shouldPresentCommunityOnboardingAgentReview(
  session: Pick<CommunityOnboardingSession, "status" | "phase"> | null | undefined,
): boolean {
  return session?.status === "active" && session.phase === "agent_turn_review";
}

export function shouldPresentCommunityOnboardingMcpHandoff(
  session: Pick<CommunityOnboardingSession, "status" | "phase"> | null | undefined,
): boolean {
  return session?.status === "active" && session.phase === "mcp_handoff";
}

export function createCommunityOnboardingPreviewSession(params: {
  communityId: string;
  config: CommunityOnboardingConfig;
  nowIso: string;
  previewId: string;
}): CommunityOnboardingSession {
  return {
    id: `preview:${params.communityId}:${params.previewId}`,
    community_id: params.communityId,
    status: "active",
    phase: "orientation",
    welcome_message: params.config.welcome_message,
    intro_video_url: params.config.intro_video_url,
    orientation_narration: null,
    activated_at: params.nowIso,
    orientation_completed_at: null,
    first_community_post_at: null,
    first_agent_dock_turn_at: null,
    agent_turn_acknowledged_at: null,
    mcp_handoff_completed_at: null,
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
      phase: "agent_turn_review",
      first_agent_dock_turn_at: session.first_agent_dock_turn_at ?? nowIso,
    };
  }
  if (session.phase === "agent_turn_review") {
    return {
      ...session,
      phase: "mcp_handoff",
      agent_turn_acknowledged_at: session.agent_turn_acknowledged_at ?? nowIso,
    };
  }
  if (session.phase === "mcp_handoff") {
    return {
      ...session,
      status: "completed",
      phase: "complete",
      mcp_handoff_completed_at: session.mcp_handoff_completed_at ?? nowIso,
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

  if (milestone === "orientation_completed") {
    if (!session.orientationCompletedAt) patch.orientationCompletedAt = timestamp;
  }
  if (milestone === "first_community_post" && !session.firstCommunityPostAt) {
    patch.firstCommunityPostAt = timestamp;
  }
  if (milestone === "first_agent_dock_turn" && !session.firstAgentDockTurnAt) {
    patch.firstAgentDockTurnAt = timestamp;
  }
  if (milestone === "agent_turn_acknowledged" && !session.agentTurnAcknowledgedAt) {
    patch.agentTurnAcknowledgedAt = timestamp;
  }
  if (milestone === "mcp_handoff_completed" && !session.mcpHandoffCompletedAt) {
    patch.mcpHandoffCompletedAt = timestamp;
  }

  const next = { ...session, ...patch };
  if (
    next.orientationCompletedAt &&
    next.firstCommunityPostAt &&
    next.firstAgentDockTurnAt &&
    next.agentTurnAcknowledgedAt &&
    next.mcpHandoffCompletedAt &&
    !session.completedAt
  ) {
    patch.status = "completed";
    patch.completedAt = timestamp;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}
