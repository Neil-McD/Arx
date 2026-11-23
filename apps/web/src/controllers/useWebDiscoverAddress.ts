import { useEffect } from "react";

import type { AppPage } from "../../../../shared/appShellNavigation";
import { buildCommunityTabPath } from "../../../../shared/webAppRouteState";

// Design v1: Discover is a page of the community you are in
// (/c/<slug>/discover). A signed-in member who arrives at the public address
// (/discover: a link, a bookmark) is moved into their community's frame. It
// is a correction, so it replaces the history entry. Someone in no community
// stays on /discover.
export function useWebDiscoverAddress(params: {
  activePage: AppPage;
  isSignedIn: boolean;
  communitySlug: string | null;
  navigateTo: (path: string, options?: { replace?: boolean }) => void;
}) {
  const { activePage, isSignedIn, communitySlug, navigateTo } = params;
  useEffect(() => {
    if (activePage !== "discover" || !isSignedIn || !communitySlug) return;
    const path = buildCommunityTabPath(communitySlug, "discover");
    if (path) navigateTo(path, { replace: true });
  }, [activePage, communitySlug, isSignedIn, navigateTo]);
}
