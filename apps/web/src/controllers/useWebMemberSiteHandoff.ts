import { useEffect } from "react";

import type { AppPage, AppView, CommunityTab } from "../../../../shared/appShellNavigation";
import { cameFromSite, communityMemberSiteUrl } from "../../../../shared/webAppRouteState";

// The app's router rewrites the address shortly after load, so whether the
// site just sent this visit here (pn_from=site) is captured once, when this
// module loads, with the page it arrived on: only that page is never sent
// straight back (no loops); moving on to another page in Studio hands off again.
const arrivedFromSiteAt: string | null =
  typeof window !== "undefined" && window.location && cameFromSite(window.location.search) ? window.location.pathname : null;

export function isArrivalFromSite(pathname: string, arrivedAt: string | null = arrivedFromSiteAt): boolean {
  return arrivedAt !== null && pathname.replace(/\/+$/, "") === arrivedAt.replace(/\/+$/, "");
}

// Members live on the community's site; Studio is the back office. Someone who
// only belongs (communityAccessRunsCommunity is false) is handed over to the site's matching page when Studio opens a member screen.
// Anyone who runs the community stays; so does everyone while their access is
// still loading or failed, and in a community with no site yet.
export function useWebMemberSiteHandoff(params: {
  activePage: AppPage;
  activeView: AppView;
  communityTab: CommunityTab;
  communityChannelSlug: string | null;
  activeCommunityId: string | null;
  activeCommunityAccessId: string | null;
  activeCommunitySiteUrl: string | null | undefined;
  isLoadingCommunityAccess: boolean;
  communityAccessLoadError: unknown;
  runsCommunity: boolean;
}) {
  const target =
    params.activePage === "community" &&
    params.activeCommunityId &&
    !params.isLoadingCommunityAccess &&
    !params.communityAccessLoadError &&
    params.activeCommunityAccessId === params.activeCommunityId &&
    !params.runsCommunity &&
    // The site just sent them here: never send them straight back (no loops).
    !isArrivalFromSite(window.location.pathname)
      ? communityMemberSiteUrl(params.activeCommunitySiteUrl, params.activeView, params.communityTab, params.communityChannelSlug)
      : null;

  useEffect(() => {
    if (target) window.location.replace(target);
  }, [target]);
}
