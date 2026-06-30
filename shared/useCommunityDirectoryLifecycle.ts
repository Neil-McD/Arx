import { useEffect } from "react";
import type { AppPage, CommunityTab } from "./appShellNavigation";

function needsCommunityDirectory(activePage: AppPage, communityTab: CommunityTab): boolean {
  return activePage === "community" && communityTab === "chat";
}

export function useCommunityDirectoryLifecycle<SessionT>(params: {
  activePage: AppPage;
  communityTab: CommunityTab;
  session: SessionT | null;
  activeCommunityId: string | null;
  loadCommunityDirectoryMembers: (communityId: string, session: SessionT) => Promise<void>;
}) {
  const session = params.session;

  useEffect(() => {
    if (!session || !params.activeCommunityId) return;
    if (!needsCommunityDirectory(params.activePage, params.communityTab)) return;
    const communityId = params.activeCommunityId;
    void params.loadCommunityDirectoryMembers(communityId, session);
  }, [
    session,
    params.activeCommunityId,
    params.activePage,
    params.communityTab,
    params.loadCommunityDirectoryMembers,
  ]);
}
