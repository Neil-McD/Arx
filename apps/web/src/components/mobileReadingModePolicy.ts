export const MOBILE_READING_MODE_POLICY = {
  hideTravelPx: 48,
  showTravelPx: 28,
  bottomLockEnterPx: 96,
  bottomLockExitPx: 160,
  transitionLockMs: 220,
  scrollSettleMs: 240,
  instantProgrammaticScrollLockMs: 80,
  smoothProgrammaticScrollLockMs: 700,
} as const;

export type MobileReadingModeState = {
  active: boolean;
  lastScrollTop: number | null;
  gestureAnchorScrollTop: number | null;
  bottomLocked: boolean;
  transitionLockedUntilMs: number;
  programmaticLockedUntilMs: number;
  gestureTracked: boolean;
  gestureTransitioned: boolean;
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

function resetGestureAnchor(state: MobileReadingModeState): MobileReadingModeState {
  return {
    ...state,
    gestureAnchorScrollTop: null,
  };
}

function transition(
  state: MobileReadingModeState,
  active: boolean,
  nowMs: number,
): MobileReadingModeResult {
  if (state.active === active) {
    return { state, changed: false };
  }
  return {
    state: {
      ...state,
      active,
      transitionLockedUntilMs: nowMs + MOBILE_READING_MODE_POLICY.transitionLockMs,
      gestureTransitioned: state.gestureTracked || state.gestureTransitioned,
    },
    changed: true,
  };
}

export function createMobileReadingModeState(): MobileReadingModeState {
  return {
    active: false,
    lastScrollTop: null,
    gestureAnchorScrollTop: null,
    bottomLocked: false,
    transitionLockedUntilMs: 0,
    programmaticLockedUntilMs: 0,
    gestureTracked: false,
    gestureTransitioned: false,
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
    gestureAnchorScrollTop: clampedScrollTop,
    programmaticLockedUntilMs: nowMs,
    gestureTracked: true,
    gestureTransitioned: false,
  };
}

export function endMobileReadingModeGesture(
  state: MobileReadingModeState,
): MobileReadingModeState {
  return {
    ...resetGestureAnchor(state),
    gestureTracked: false,
    gestureTransitioned: false,
  };
}

export function forceMobileReadingMode(
  state: MobileReadingModeState,
  active: boolean,
  nowMs: number,
): MobileReadingModeResult {
  return transition(
    {
      ...state,
      gestureTracked: false,
      gestureTransitioned: false,
    },
    active,
    nowMs,
  );
}

export function suppressProgrammaticMobileScroll(
  state: MobileReadingModeState,
  nowMs: number,
  durationMs: number,
  forceVisible = false,
): MobileReadingModeResult {
  const baseState: MobileReadingModeState = {
    ...resetGestureAnchor(state),
    programmaticLockedUntilMs: Math.max(
      state.programmaticLockedUntilMs,
      nowMs + durationMs,
    ),
    gestureTracked: false,
    gestureTransitioned: false,
  };
  if (!forceVisible) return { state: baseState, changed: false };
  return transition(baseState, false, nowMs);
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

  const mayTransitionThisGesture =
    !nextState.gestureTracked || !nextState.gestureTransitioned;
  if (sample.composerFocused) {
    nextState = resetGestureAnchor(nextState);
    if (
      nextState.active
      && mayTransitionThisGesture
      && sample.nowMs >= nextState.transitionLockedUntilMs
    ) {
      return transition(nextState, false, sample.nowMs);
    }
    return { state: nextState, changed: false };
  }

  if (sample.nowMs < nextState.programmaticLockedUntilMs) {
    return { state: resetGestureAnchor(nextState), changed: false };
  }

  if (bottomLocked) {
    nextState = resetGestureAnchor(nextState);
    if (
      nextState.active
      && mayTransitionThisGesture
      && sample.nowMs >= nextState.transitionLockedUntilMs
    ) {
      return transition(nextState, false, sample.nowMs);
    }
    return { state: nextState, changed: false };
  }

  if (
    state.lastScrollTop === null
    || sample.nowMs < nextState.transitionLockedUntilMs
    || !mayTransitionThisGesture
  ) {
    return { state: nextState, changed: false };
  }

  const gestureAnchorScrollTop = state.gestureAnchorScrollTop ?? state.lastScrollTop;
  nextState = { ...nextState, gestureAnchorScrollTop };
  const netTravelPx = scrollTop - gestureAnchorScrollTop;

  if (
    !nextState.active
    && netTravelPx <= -MOBILE_READING_MODE_POLICY.hideTravelPx
  ) {
    return transition(nextState, true, sample.nowMs);
  }
  if (
    nextState.active
    && netTravelPx >= MOBILE_READING_MODE_POLICY.showTravelPx
  ) {
    return transition(nextState, false, sample.nowMs);
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
    return transition(settledState, false, sample.nowMs);
  }
  return { state: settledState, changed: false };
}
