import { useEffect, useRef } from "react";
import type { AppPage, AppView, CommunityTab } from "./appShellNavigation";
import { resolveAuthPresentationIdentity, type AuthSessionLike } from "./authSession";
import { useResumeEpochEffect } from "./useResumeEpochEffect";

function needsCommunityDirectory(
  activePage: AppPage,
  activeView: AppView,
  communityTab: CommunityTab,
): boolean {
  return activePage === "community" &&
    (activeView === "community_members" || communityTab === "chat");
}

export function useCommunityDirectoryLifecycle<SessionT>(params: {
  activePage: AppPage;
  activeView: AppView;
  communityTab: CommunityTab;
  session: SessionT | null;
  resumeEpoch: number;
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
    if (!needsCommunityDirectory(params.activePage, params.activeView, params.communityTab)) return;
    const communityId = params.activeCommunityId;
    const currentSession = sessionRef.current;
    if (!currentSession) return;
    void params.loadCommunityDirectoryMembers(communityId, currentSession);
  }, [
    sessionIdentity,
    params.activeCommunityId,
    params.activePage,
    params.activeView,
    params.communityTab,
    params.loadCommunityDirectoryMembers,
  ]);

  useResumeEpochEffect(params.resumeEpoch, () => {
    if (!sessionIdentity || !params.activeCommunityId) return;
    if (!needsCommunityDirectory(params.activePage, params.activeView, params.communityTab)) return;
    const currentSession = sessionRef.current;
    if (!currentSession) return;
    void params.loadCommunityDirectoryMembers(params.activeCommunityId, currentSession);
  });
}
