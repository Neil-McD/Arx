import { useEffect } from "react";
import type { AppPage, CommunityTab } from "./appShellNavigation";

function needsCommunityMemberRoster(activePage: AppPage, communityTab: CommunityTab): boolean {
  if (activePage !== "community") return false;
  // The chat view's right-rail member list needs the roster too, not just the
  // dedicated Members tab.
  return communityTab === "members" || communityTab === "chat";
}

export function useCommunityMemberRosterLifecycle<SessionT>(params: {
  activePage: AppPage;
  communityTab: CommunityTab;
  session: SessionT | null;
  activeCommunityId: string | null;
  loadCommunityMembers: (communityId: string, session: SessionT) => Promise<void>;
}) {
  const session = params.session;

  useEffect(() => {
    if (!session || !params.activeCommunityId) return;
    if (!needsCommunityMemberRoster(params.activePage, params.communityTab)) return;
    const communityId = params.activeCommunityId;
    void params.loadCommunityMembers(communityId, session);
  }, [
    session,
    params.activeCommunityId,
    params.activePage,
    params.communityTab,
    params.loadCommunityMembers,
  ]);
}
