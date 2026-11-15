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

// Phone width: a phone, or a desktop window narrowed to one (Neil, Nov 14:
// every phone gets the phone layout, /m/..., whatever link it opened; and a
// narrowed window must not fall into a third, undrawn layout between the two).
// There are two layouts, and this is the one line between them.
export const PHONE_VIEWPORT_MEDIA_QUERY = "(max-width: 720px)";

// Which layout a window gets when it crosses that line. A touch screen turned
// on its side keeps the phone layout it opened in.
export function shellVariantAfterResize(params: { phoneWidth: boolean; touch: boolean; current: "standard" | "mobile" }): "standard" | "mobile" {
  if (params.phoneWidth) return "mobile";
  return params.touch ? params.current : "standard";
}

export function isPhoneViewport(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia?.(PHONE_VIEWPORT_MEDIA_QUERY).matches === true;
  } catch {
    return false;
  }
}
