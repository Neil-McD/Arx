import { useEffect, useRef } from "react";
import type { AppPage, CommunityTab } from "./appShellNavigation";
import { resolveAuthPresentationIdentity, type AuthSessionLike } from "./authSession";

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
  const sessionRef = useRef(params.session);
  sessionRef.current = params.session;
  const sessionIdentity = resolveAuthPresentationIdentity(
    params.session as AuthSessionLike,
  );

  useEffect(() => {
    if (!sessionIdentity || !params.activeCommunityId) return;
    if (!needsCommunityDirectory(params.activePage, params.communityTab)) return;
    const communityId = params.activeCommunityId;
    const refresh = () => {
      const currentSession = sessionRef.current;
      if (!currentSession) return;
      void params.loadCommunityDirectoryMembers(communityId, currentSession);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    sessionIdentity,
    params.activeCommunityId,
    params.activePage,
    params.communityTab,
    params.loadCommunityDirectoryMembers,
  ]);
}
