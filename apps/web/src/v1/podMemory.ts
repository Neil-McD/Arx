// Pods (docs/specs/pods-v0.md): the pod someone is in is remembered per
// community in this browser, so "Pods" in the left column goes back to it.
// The pod's "← Pods" arrow forgets it and shows every pod. A convenience
// only: the page works the same when storage is unavailable.

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
