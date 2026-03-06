import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { AppPage, CommunityTab } from "../../../../shared/appShellNavigation";

export function useWebThreadDiscoverChatLifecycle<SessionT, ThreadMessageT>(params: {
  session: SessionT | null;
  activeThreadId: string | null;
  guestThreadId: string;
  activePage: AppPage;
  activeCommunityId: string | null;
  communityTab: CommunityTab;
  isLoadingThreadRef: MutableRefObject<boolean>;
  autoScrollEnabledRef: MutableRefObject<boolean>;
  lastWorkspaceScrollTopRef: MutableRefObject<number>;
  setIsWorkspaceAtBottom: Dispatch<SetStateAction<boolean>>;
  setThreadMessages: Dispatch<SetStateAction<ThreadMessageT[]>>;
  loadThreadMessages: (threadId: string, session: SessionT) => Promise<void>;
  loadDiscoverCommunities: () => Promise<void>;
  loadCommunityChat: (communityId: string, session: SessionT) => Promise<void>;
}) {
  const session = params.session;

  useEffect(() => {
    if (!session) return;
    if (!params.activeThreadId || params.activeThreadId === params.guestThreadId) {
      params.setThreadMessages([]);
      return;
    }
    params.isLoadingThreadRef.current = true;
    params.autoScrollEnabledRef.current = true;
    params.setIsWorkspaceAtBottom(true);
    params.lastWorkspaceScrollTopRef.current = 0;
    void params.loadThreadMessages(params.activeThreadId, session);
  }, [session, params.activeThreadId]);

  useEffect(() => {
    if (params.activePage !== "discover") return;
    void params.loadDiscoverCommunities();
  }, [params.activePage]);

  useEffect(() => {
    if (
      !session ||
      !params.activeCommunityId ||
      params.activePage !== "community" ||
      params.communityTab !== "chat"
    ) {
      return;
    }
    void params.loadCommunityChat(params.activeCommunityId, session);
  }, [session, params.activeCommunityId, params.activePage, params.communityTab]);
}
