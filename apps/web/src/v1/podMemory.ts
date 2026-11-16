// Pods (docs/specs/pods-v0.md): the pod someone was last in is remembered per
// community in this browser, so the Pods page shows it first (it never
// redirects). Leaving a pod forgets it. A convenience only: the page works
// the same when storage is unavailable.

function communitySlugFromPath(): string {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const at = segments.indexOf("c");
  return at >= 0 ? segments[at + 1] ?? "" : "";
}

const key = () => `polynet_last_pod:${communitySlugFromPath()}`;

export function rememberPod(podSlug: string): void {
  try { if (podSlug) window.localStorage.setItem(key(), podSlug); } catch { /* not remembered */ }
}

export function forgetPod(): void {
  try { window.localStorage.removeItem(key()); } catch { /* nothing to forget */ }
}

export function recallPod(): string | null {
  try { return window.localStorage.getItem(key()); } catch { return null; }
}

// Asking to see a pod's outside page as members do (builders and hosts go
// straight into the room otherwise). One use, this tab.
const PREVIEW_KEY = "polynet_pod_page_preview";

export function askForPodPagePreview(podSlug: string): void {
  try { window.sessionStorage.setItem(PREVIEW_KEY, podSlug); } catch { /* opens the room instead */ }
}

export function takePodPagePreview(podSlug: string): boolean {
  try {
    const asked = window.sessionStorage.getItem(PREVIEW_KEY) === podSlug;
    if (asked) window.sessionStorage.removeItem(PREVIEW_KEY);
    return asked;
  } catch { return false; }
}

// In-app navigation from places that have no navigation prop: the shell
// already follows the address on popstate.
export function goToPodsPath(podSlug?: string): void {
  const community = communitySlugFromPath();
  if (!community) return;
  const mobile = window.location.pathname.startsWith("/m/") ? "/m" : "";
  const path = `${mobile}/c/${encodeURIComponent(community)}/pods${podSlug ? `/${encodeURIComponent(podSlug)}` : ""}`;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// Which pod the Pods page shows, read from the address and the lists (never
// stored by the page). /pods/<pod> shows that pod: its landing page for
// someone who can enter it, its pitch for anyone else (or for a builder who
// asked to see it as members do). /pods on a wide screen shows the pod they
// were last in, else their first, else the first they could join; on a
// narrow screen just the list. Nothing is shown until the lists have loaded,
// so a landing page never starts as a pitch.
export function podShown(input: {
  podSlug: string | null;
  mine: string[] | null;
  outside: string[];
  recalled: string | null;
  wide: boolean;
  preview: boolean;
}): { slug: string; kind: "landing" | "pitch" } | null {
  if (!input.mine) return null;
  if (input.podSlug) {
    const kind = input.mine.includes(input.podSlug) && !input.preview ? "landing" : "pitch";
    return { slug: input.podSlug, kind };
  }
  if (!input.wide) return null;
  const recalled = input.recalled && input.mine.includes(input.recalled) ? input.recalled : null;
  const slug = recalled ?? input.mine[0] ?? null;
  if (slug) return { slug, kind: "landing" };
  return input.outside[0] ? { slug: input.outside[0], kind: "pitch" } : null;
}
