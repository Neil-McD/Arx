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
