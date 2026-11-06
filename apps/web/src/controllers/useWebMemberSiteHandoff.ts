import { useEffect } from "react";

import type { AppPage, AppView, CommunityTab } from "../../../../shared/appShellNavigation";
import { communityMemberSiteUrl } from "../../../../shared/webAppRouteState";

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
    !params.runsCommunity
      ? communityMemberSiteUrl(params.activeCommunitySiteUrl, params.activeView, params.communityTab, params.communityChannelSlug)
      : null;

  useEffect(() => {
    if (target) window.location.replace(target);
  }, [target]);
}
