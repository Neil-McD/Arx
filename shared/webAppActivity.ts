export const WEB_APP_RESUME_COOLDOWN_MS = 20_000;

export type WebAppActivityState = {
  isActive: boolean;
  resumeEpoch: number;
  inactiveSinceMs?: number | null;
};

export type WebAppActivityTransition = {
  isActive: boolean;
  forceResume?: boolean;
  nowMs?: number;
  minInactiveDurationMs?: number;
};

export function createWebAppActivityState(isActive: boolean): WebAppActivityState {
  return {
    isActive,
    resumeEpoch: 0,
    inactiveSinceMs: null,
  };
}

export function advanceWebAppActivity(
  state: WebAppActivityState,
  transition: WebAppActivityTransition,
): WebAppActivityState {
  const minInactiveDurationMs = Math.max(0, Math.floor(transition.minInactiveDurationMs ?? 0));
  const nowMs = typeof transition.nowMs === "number" && Number.isFinite(transition.nowMs)
    ? transition.nowMs
    : null;
  const returningFromInactive = transition.isActive && !state.isActive;
  const withinBriefCooldown = Boolean(
    returningFromInactive
    && !transition.forceResume
    && minInactiveDurationMs > 0
    && typeof state.inactiveSinceMs === "number"
    && nowMs !== null
    && nowMs - state.inactiveSinceMs < minInactiveDurationMs,
  );
  const shouldResume = transition.isActive && (
    transition.forceResume === true || (returningFromInactive && !withinBriefCooldown)
  );
  if (!shouldResume && state.isActive === transition.isActive) return state;
  if (!transition.isActive) {
    return {
      ...state,
      isActive: false,
      inactiveSinceMs: nowMs,
    };
  }
  if (withinBriefCooldown) {
    return {
      ...state,
      isActive: true,
      inactiveSinceMs: null,
    };
  }
  return {
    isActive: true,
    resumeEpoch: state.resumeEpoch + 1,
    inactiveSinceMs: null,
  };
}
