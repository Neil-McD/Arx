export function isStandaloneWebApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) {
      return true;
    }
  } catch {
    // ignore
  }
  try {
    return window.matchMedia?.("(display-mode: standalone)").matches === true;
  } catch {
    return false;
  }
}

// A phone: a narrow screen worked by touch (Neil, Nov 14: every phone gets the
// phone layout, /m/..., whatever link it opened). A narrow desktop window keeps
// the regular layout.
export const PHONE_VIEWPORT_MEDIA_QUERY = "(max-width: 720px) and (pointer: coarse)";

export function isPhoneViewport(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia?.(PHONE_VIEWPORT_MEDIA_QUERY).matches === true;
  } catch {
    return false;
  }
}
