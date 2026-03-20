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
  setLoadingThreadMessagesThreadId: Dispatch<SetStateAction<string | null>>;
  setThreadMessages: Dispatch<SetStateAction<ThreadMessageT[]>>;
  discoverCommunitiesCount: number;
  loadThreadMessages: (threadId: string, session: SessionT) => Promise<void>;
  loadDiscoverCommunities: () => Promise<void>;
  loadCommunityChat: (communityId: string, session: SessionT) => Promise<void>;
}) {
  const session = params.session;

  useEffect(() => {
    if (!session) {
      params.setLoadingThreadMessagesThreadId(null);
      return;
    }
    if (!params.activeThreadId || params.activeThreadId === params.guestThreadId) {
      params.setLoadingThreadMessagesThreadId(null);
      params.setThreadMessages([]);
      return;
    }
    const targetThreadId = params.activeThreadId;
    let cancelled = false;
    params.isLoadingThreadRef.current = true;
    params.autoScrollEnabledRef.current = true;
    params.setIsWorkspaceAtBottom(true);
    params.lastWorkspaceScrollTopRef.current = 0;
    params.setLoadingThreadMessagesThreadId(targetThreadId);
    void (async () => {
      try {
        await params.loadThreadMessages(targetThreadId, session);
      } finally {
        if (!cancelled) {
          params.setLoadingThreadMessagesThreadId((current) => (current === targetThreadId ? null : current));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, params.activeThreadId]);

  useEffect(() => {
    if (params.activePage !== "discover") return;
    if (params.discoverCommunitiesCount > 0) return;
    void params.loadDiscoverCommunities();
  }, [params.activePage, params.discoverCommunitiesCount]);

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
