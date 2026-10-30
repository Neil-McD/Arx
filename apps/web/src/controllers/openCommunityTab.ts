import type { CommunityTab } from "../../../../shared/appShellNavigation";
import { buildCommunityTabPath } from "../../../../shared/webAppRouteState";

/** Opens another tab of the community in view, with optional query params; false when not in a community. */
export function openCommunityTab(tab: CommunityTab, params: Record<string, string> = {}): boolean {
  const slug = window.location.pathname.match(/^\/c\/([^/]+)/)?.[1];
  const path = slug ? buildCommunityTabPath(decodeURIComponent(slug), tab) : null;
  if (!path) return false;
  const search = new URLSearchParams(params).toString();
  window.history.pushState(window.history.state, "", search ? `${path}?${search}` : path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  return true;
}
