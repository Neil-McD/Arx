import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

type PageLike = string;
type TabLike = string;

export function useWebThreadDiscoverChatLifecycle<SessionT, ThreadMessageT>(params: {
  supabaseSession: SessionT | null;
  activeThreadId: string | null;
  guestThreadId: string;
  activePage: PageLike;
  activeCommunityId: string | null;
  communityTab: TabLike;
  isLoadingThreadRef: MutableRefObject<boolean>;
  autoScrollEnabledRef: MutableRefObject<boolean>;
  lastWorkspaceScrollTopRef: MutableRefObject<number>;
  setIsWorkspaceAtBottom: Dispatch<SetStateAction<boolean>>;
  setThreadMessages: Dispatch<SetStateAction<ThreadMessageT[]>>;
  loadThreadMessages: (threadId: string, session: SessionT) => Promise<void>;
  loadDiscoverCommunities: () => Promise<void>;
  loadCommunityChat: (communityId: string, session: SessionT) => Promise<void>;
}) {
  useEffect(() => {
    if (!params.supabaseSession) return;
    if (!params.activeThreadId || params.activeThreadId === params.guestThreadId) {
      params.setThreadMessages([]);
      return;
    }
    params.isLoadingThreadRef.current = true;
    params.autoScrollEnabledRef.current = true;
    params.setIsWorkspaceAtBottom(true);
    params.lastWorkspaceScrollTopRef.current = 0;
    void params.loadThreadMessages(params.activeThreadId, params.supabaseSession);
  }, [params.supabaseSession, params.activeThreadId]);

  useEffect(() => {
    if (params.activePage !== "discover") return;
    void params.loadDiscoverCommunities();
  }, [params.activePage]);

  useEffect(() => {
    if (
      !params.supabaseSession ||
      !params.activeCommunityId ||
      params.activePage !== "community" ||
      params.communityTab !== "chat"
    ) {
      return;
    }
    void params.loadCommunityChat(params.activeCommunityId, params.supabaseSession);
  }, [params.supabaseSession, params.activeCommunityId, params.activePage, params.communityTab]);
}
