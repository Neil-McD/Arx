export const MOBILE_READING_MODE_POLICY = {
  hideTravelPx: 36,
  showTravelPx: 8,
  bottomLockEnterPx: 96,
  bottomLockExitPx: 160,
  scrollSettleMs: 240,
  instantProgrammaticScrollLockMs: 80,
  smoothProgrammaticScrollLockMs: 700,
} as const;

export type MobileReadingModeState = {
  active: boolean;
  lastScrollTop: number | null;
  directionAnchorScrollTop: number | null;
  travelDirection: "older" | "latest" | null;
  bottomLocked: boolean;
  programmaticLockedUntilMs: number;
};

export type MobileReadingModeSample = {
  scrollTop: number;
  maxScrollTop: number;
  nowMs: number;
  composerFocused: boolean;
};

export type MobileReadingModeResult = {
  state: MobileReadingModeState;
  changed: boolean;
};

function clampScrollTop(scrollTop: number, maxScrollTop: number): number {
  return Math.min(Math.max(0, scrollTop), Math.max(0, maxScrollTop));
}

function resetDirectionalTravel(state: MobileReadingModeState): MobileReadingModeState {
  return {
    ...state,
    directionAnchorScrollTop: null,
    travelDirection: null,
  };
}

function transition(
  state: MobileReadingModeState,
  active: boolean,
): MobileReadingModeResult {
  if (state.active === active) {
    return { state, changed: false };
  }
  return {
    state: {
      ...state,
      active,
    },
    changed: true,
  };
}

export function createMobileReadingModeState(): MobileReadingModeState {
  return {
    active: false,
    lastScrollTop: null,
    directionAnchorScrollTop: null,
    travelDirection: null,
    bottomLocked: false,
    programmaticLockedUntilMs: 0,
  };
}

export function beginMobileReadingModeGesture(
  state: MobileReadingModeState,
  scrollTop: number,
  maxScrollTop: number,
  nowMs: number,
): MobileReadingModeState {
  const clampedScrollTop = clampScrollTop(scrollTop, maxScrollTop);
  return {
    ...state,
    lastScrollTop: clampedScrollTop,
    directionAnchorScrollTop: null,
    travelDirection: null,
    programmaticLockedUntilMs: nowMs,
  };
}

export function endMobileReadingModeGesture(
  state: MobileReadingModeState,
): MobileReadingModeState {
  return resetDirectionalTravel(state);
}

export function forceMobileReadingMode(
  state: MobileReadingModeState,
  active: boolean,
  _nowMs: number,
): MobileReadingModeResult {
  return transition(resetDirectionalTravel(state), active);
}

export function suppressProgrammaticMobileScroll(
  state: MobileReadingModeState,
  nowMs: number,
  durationMs: number,
  forceVisible = false,
): MobileReadingModeResult {
  const baseState: MobileReadingModeState = {
    ...resetDirectionalTravel(state),
    programmaticLockedUntilMs: Math.max(
      state.programmaticLockedUntilMs,
      nowMs + durationMs,
    ),
  };
  if (!forceVisible) return { state: baseState, changed: false };
  return transition(baseState, false);
}

export function advanceMobileReadingMode(
  state: MobileReadingModeState,
  sample: MobileReadingModeSample,
): MobileReadingModeResult {
  const maxScrollTop = Math.max(0, sample.maxScrollTop);
  const scrollTop = clampScrollTop(sample.scrollTop, maxScrollTop);
  const distanceFromBottom = Math.max(0, maxScrollTop - scrollTop);
  const bottomLocked = state.bottomLocked
    ? distanceFromBottom <= MOBILE_READING_MODE_POLICY.bottomLockExitPx
    : distanceFromBottom <= MOBILE_READING_MODE_POLICY.bottomLockEnterPx;
  let nextState: MobileReadingModeState = {
    ...state,
    lastScrollTop: scrollTop,
    bottomLocked,
  };

  if (sample.composerFocused) {
    nextState = resetDirectionalTravel(nextState);
    if (nextState.active) {
      return transition(nextState, false);
    }
    return { state: nextState, changed: false };
  }

  if (sample.nowMs < nextState.programmaticLockedUntilMs) {
    return { state: resetDirectionalTravel(nextState), changed: false };
  }

  if (bottomLocked) {
    nextState = resetDirectionalTravel(nextState);
    if (nextState.active) {
      return transition(nextState, false);
    }
    return { state: nextState, changed: false };
  }

  if (state.lastScrollTop === null) {
    return { state: nextState, changed: false };
  }

  const delta = scrollTop - state.lastScrollTop;
  if (Math.abs(delta) < 0.5) return { state: nextState, changed: false };

  const travelDirection = delta < 0 ? "older" : "latest";
  const directionAnchorScrollTop = state.travelDirection === travelDirection
    ? (state.directionAnchorScrollTop ?? state.lastScrollTop)
    : state.lastScrollTop;
  nextState = { ...nextState, directionAnchorScrollTop, travelDirection };
  const directionalTravelPx = Math.abs(scrollTop - directionAnchorScrollTop);

  if (
    !nextState.active
    && travelDirection === "older"
    && directionalTravelPx >= MOBILE_READING_MODE_POLICY.hideTravelPx
  ) {
    return transition(nextState, true);
  }
  if (
    nextState.active
    && travelDirection === "latest"
    && directionalTravelPx >= MOBILE_READING_MODE_POLICY.showTravelPx
  ) {
    return transition(nextState, false);
  }
  return { state: nextState, changed: false };
}

export function settleMobileReadingMode(
  state: MobileReadingModeState,
  sample: MobileReadingModeSample,
): MobileReadingModeResult {
  const maxScrollTop = Math.max(0, sample.maxScrollTop);
  const scrollTop = clampScrollTop(sample.scrollTop, maxScrollTop);
  const distanceFromBottom = Math.max(0, maxScrollTop - scrollTop);
  const mustBeVisible =
    sample.composerFocused
    || distanceFromBottom <= MOBILE_READING_MODE_POLICY.bottomLockEnterPx;
  const settledState: MobileReadingModeState = {
    ...endMobileReadingModeGesture(state),
    lastScrollTop: scrollTop,
    bottomLocked: mustBeVisible,
  };
  if (mustBeVisible && settledState.active) {
    return transition(settledState, false);
  }
  return { state: settledState, changed: false };
}
