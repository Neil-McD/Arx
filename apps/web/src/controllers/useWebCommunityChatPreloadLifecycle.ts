import { useEffect } from "react";
import type { AppPage, CommunityTab } from "../../../../shared/appShellNavigation";

export function useWebCommunityChatPreloadLifecycle<SessionT>(params: {
  session: SessionT | null;
  activePage: AppPage;
  activeCommunityId: string | null;
  communityTab: CommunityTab;
  hasResolvedCommunityChat: boolean;
  loadCommunityChat: (communityId: string, session: SessionT) => Promise<void>;
}) {
  const session = params.session;

  useEffect(() => {
    if (
      !session ||
      !params.activeCommunityId ||
      params.activePage !== "community" ||
      params.communityTab !== "chat" ||
      params.hasResolvedCommunityChat
    ) {
      return;
    }
    void params.loadCommunityChat(params.activeCommunityId, session);
  }, [
    session,
    params.activeCommunityId,
    params.activePage,
    params.communityTab,
    params.hasResolvedCommunityChat,
    params.loadCommunityChat,
  ]);
}
