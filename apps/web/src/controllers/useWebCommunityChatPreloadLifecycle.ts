import { useEffect } from "react";
import type { AppPage } from "../../../../shared/appShellNavigation";

export function useWebCommunityChatPreloadLifecycle<SessionT>(params: {
  session: SessionT | null;
  activePage: AppPage;
  activeCommunityId: string | null;
  hasResolvedCommunityChat: boolean;
  loadCommunityChat: (communityId: string, session: SessionT) => Promise<void>;
  shouldPreload?: boolean;
}) {
  const session = params.session;

  useEffect(() => {
    if (
      !session ||
      !params.activeCommunityId ||
      (params.activePage !== "community" && !params.shouldPreload) ||
      params.hasResolvedCommunityChat
    ) {
      return;
    }
    void params.loadCommunityChat(params.activeCommunityId, session);
  }, [
    session,
    params.activeCommunityId,
    params.activePage,
    params.hasResolvedCommunityChat,
    params.loadCommunityChat,
    params.shouldPreload,
  ]);
}
