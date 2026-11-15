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
// phone layout, /m/..., whatever link it opened). A desktop window is never a
// phone, however narrow it is dragged: the two layouts are separate, and the
// window's width does not pick between them.
export const PHONE_VIEWPORT_MEDIA_QUERY = "(max-width: 720px) and (pointer: coarse)";

// Which of the two layouts the styles draw. The app writes it on the page's
// root (data-layout) from the shell it chose; design-v1.css and the kit key
// every phone rule and every desktop rule on it, never on the window's width.
export type AppLayout = "phone" | "desktop";
export function appLayoutForShell(shellVariant: "standard" | "mobile"): AppLayout {
  return shellVariant === "mobile" ? "phone" : "desktop";
}

export function isPhoneViewport(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia?.(PHONE_VIEWPORT_MEDIA_QUERY).matches === true;
  } catch {
    return false;
  }
}
