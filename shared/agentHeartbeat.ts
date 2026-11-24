// Activity-Tapered Heartbeats ("Prospecting Rep" Model):
// Pure deterministic classification of member and community heartbeat tiers
// so active members/communities get warm, timely coaching while quiet ones
// taper automatically to $0 AI spend and hand off to zero-cost system follow-up.

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

export type MemberHeartbeatTemperature = "hot" | "warm" | "cooling" | "cold";
export type CommunityHeartbeatTier = "active" | "warm" | "cooling" | "paused";

export type MemberTemperatureCounts = {
  hot: number;
  warm: number;
  cooling: number;
  cold: number;
};

// Member activity cutoffs (confirmed defaults):
export const MEMBER_HOT_MAX_IDLE_MS = 3 * DAY_MS;
export const MEMBER_WARM_MAX_IDLE_MS = 14 * DAY_MS;
export const MEMBER_COOLING_MAX_IDLE_MS = 30 * DAY_MS;
// Two unanswered proactive AI check-ins in a row drop the member to Cold ($0 AI)
// until they return and participate again.
export const MEMBER_COLD_UNANSWERED_CAP = 2;

// Community heartbeat cadence cutoffs:
export const COMMUNITY_ACTIVE_MAX_IDLE_MS = 24 * HOUR_MS;
export const COMMUNITY_WARM_MAX_IDLE_MS = 7 * DAY_MS;
export const COMMUNITY_COOLING_MAX_IDLE_MS = 14 * DAY_MS;

export const COMMUNITY_HEARTBEAT_INTERVAL_MS: Record<CommunityHeartbeatTier, number> = {
  active: 2 * HOUR_MS,
  warm: 6 * HOUR_MS,
  cooling: 24 * HOUR_MS,
  paused: 72 * HOUR_MS,
};

// Commitment follow-up timing:
export const COMMITMENT_FOLLOWUP_MIN_AGE_MS = 2 * DAY_MS;
export const COMMITMENT_FOLLOWUP_MAX_AGE_MS = 21 * DAY_MS;

// Unseen proactive check-in email nudge window:
export const UNSEEN_COACH_EMAIL_GRACE_MS = 24 * HOUR_MS;
export const UNSEEN_COACH_EMAIL_MAX_AGE_MS = 72 * HOUR_MS;

export function countConsecutiveUnansweredCoachTouches(
  recentHistory: ReadonlyArray<{ status: string; sentAt?: number; createdAt: number }>,
  lastMemberActivityAtMs: number | null,
): number {
  const baseline = typeof lastMemberActivityAtMs === "number" && lastMemberActivityAtMs > 0
    ? lastMemberActivityAtMs
    : 0;
  const sentRows = recentHistory
    .filter((row) => row.status === "sent")
    .map((row) => (typeof row.sentAt === "number" ? row.sentAt : row.createdAt))
    .sort((a, b) => b - a);
  let unanswered = 0;
  for (const sentAt of sentRows) {
    if (sentAt > baseline) {
      unanswered += 1;
    } else {
      break;
    }
  }
  return unanswered;
}

export function classifyMemberHeartbeatTemperature(input: {
  nowMs: number;
  lastActivityAtMs: number | null;
  joinedAtMs: number;
  consecutiveUnanswered: number;
}): {
  temperature: MemberHeartbeatTemperature;
  idleMs: number;
  handoffToSystem: boolean;
} {
  const anchorMs =
    typeof input.lastActivityAtMs === "number" && input.lastActivityAtMs > 0
      ? Math.max(input.lastActivityAtMs, input.joinedAtMs)
      : input.joinedAtMs;
  const idleMs = Math.max(0, input.nowMs - anchorMs);

  if (
    input.consecutiveUnanswered >= MEMBER_COLD_UNANSWERED_CAP ||
    idleMs > MEMBER_COOLING_MAX_IDLE_MS
  ) {
    return { temperature: "cold", idleMs, handoffToSystem: true };
  }
  if (idleMs <= MEMBER_HOT_MAX_IDLE_MS) {
    return { temperature: "hot", idleMs, handoffToSystem: false };
  }
  if (idleMs <= MEMBER_WARM_MAX_IDLE_MS) {
    return { temperature: "warm", idleMs, handoffToSystem: false };
  }
  return { temperature: "cooling", idleMs, handoffToSystem: false };
}

export function classifyCommunityHeartbeatCadence(input: {
  nowMs: number;
  lastCommunityActivityAtMs: number | null;
}): {
  tier: CommunityHeartbeatTier;
  nextIntervalMs: number;
  skipAiScan: boolean;
} {
  if (
    typeof input.lastCommunityActivityAtMs !== "number" ||
    input.lastCommunityActivityAtMs <= 0
  ) {
    return {
      tier: "paused",
      nextIntervalMs: COMMUNITY_HEARTBEAT_INTERVAL_MS.paused,
      skipAiScan: true,
    };
  }
  const idleMs = Math.max(0, input.nowMs - input.lastCommunityActivityAtMs);
  if (idleMs <= COMMUNITY_ACTIVE_MAX_IDLE_MS) {
    return {
      tier: "active",
      nextIntervalMs: COMMUNITY_HEARTBEAT_INTERVAL_MS.active,
      skipAiScan: false,
    };
  }
  if (idleMs <= COMMUNITY_WARM_MAX_IDLE_MS) {
    return {
      tier: "warm",
      nextIntervalMs: COMMUNITY_HEARTBEAT_INTERVAL_MS.warm,
      skipAiScan: false,
    };
  }
  if (idleMs <= COMMUNITY_COOLING_MAX_IDLE_MS) {
    return {
      tier: "cooling",
      nextIntervalMs: COMMUNITY_HEARTBEAT_INTERVAL_MS.cooling,
      skipAiScan: false,
    };
  }
  return {
    tier: "paused",
    nextIntervalMs: COMMUNITY_HEARTBEAT_INTERVAL_MS.paused,
    skipAiScan: true,
  };
}
