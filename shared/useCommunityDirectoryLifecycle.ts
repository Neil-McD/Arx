import { useEffect, useRef } from "react";
import { isCommunityChatBackedTab, type AppPage, type CommunityTab } from "./appShellNavigation";
import { resolveAuthPresentationIdentity, type AuthSessionLike } from "./authSession";
import { useResumeEpochEffect } from "./useResumeEpochEffect";

function needsCommunityDirectory(
  activePage: AppPage,
  communityTab: CommunityTab,
): boolean {
  return activePage === "community" &&
    isCommunityChatBackedTab(communityTab);
}

export function useCommunityDirectoryLifecycle<SessionT>(params: {
  activePage: AppPage;
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
    if (!needsCommunityDirectory(params.activePage, params.communityTab)) return;
    const communityId = params.activeCommunityId;
    const currentSession = sessionRef.current;
    if (!currentSession) return;
    void params.loadCommunityDirectoryMembers(communityId, currentSession);
  }, [
    sessionIdentity,
    params.activeCommunityId,
    params.activePage,
    params.communityTab,
    params.loadCommunityDirectoryMembers,
  ]);

  useResumeEpochEffect(params.resumeEpoch, () => {
    if (!sessionIdentity || !params.activeCommunityId) return;
    if (!needsCommunityDirectory(params.activePage, params.communityTab)) return;
    const currentSession = sessionRef.current;
    if (!currentSession) return;
    void params.loadCommunityDirectoryMembers(params.activeCommunityId, currentSession);
  });
}
