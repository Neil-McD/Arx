export type WebAppActivityState = {
  isActive: boolean;
  resumeEpoch: number;
};

export type WebAppActivityTransition = {
  isActive: boolean;
  forceResume?: boolean;
};

export function createWebAppActivityState(isActive: boolean): WebAppActivityState {
  return {
    isActive,
    resumeEpoch: 0,
  };
}

export function advanceWebAppActivity(
  state: WebAppActivityState,
  transition: WebAppActivityTransition,
): WebAppActivityState {
  const shouldResume = transition.isActive && (
    !state.isActive || transition.forceResume === true
  );
  if (!shouldResume && state.isActive === transition.isActive) return state;
  if (!shouldResume) {
    return {
      ...state,
      isActive: false,
    };
  }
  return {
    isActive: true,
    resumeEpoch: state.resumeEpoch + 1,
  };
}
