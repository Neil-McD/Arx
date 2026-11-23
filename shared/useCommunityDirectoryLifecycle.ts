import { useEffect, useRef } from "react";
import type { AppPage, CommunityTab } from "./appShellNavigation";
import { resolveAuthPresentationIdentity, type AuthSessionLike } from "./authSession";
import { useResumeEpochEffect } from "./useResumeEpochEffect";

export const DIRECTORY_TAB_FRESHNESS_MS = 60_000;

function needsCommunityDirectory(
  activePage: AppPage,
  communityTab: CommunityTab,
): boolean {
  return activePage === "community" &&
    communityTab === "chat";
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
  const lastLoadedRef = useRef<{ scope: string; at: number } | null>(null);
  const sessionIdentity = resolveAuthPresentationIdentity(
    params.session as AuthSessionLike,
  );

  useEffect(() => {
    if (!sessionIdentity || !params.activeCommunityId) return;
    if (!needsCommunityDirectory(params.activePage, params.communityTab)) return;
    const communityId = params.activeCommunityId;
    const currentSession = sessionRef.current;
    if (!currentSession) return;
    const scope = `${sessionIdentity}:${communityId}`;
    const nowMs = Date.now();
    if (
      lastLoadedRef.current
      && lastLoadedRef.current.scope === scope
      && nowMs - lastLoadedRef.current.at < DIRECTORY_TAB_FRESHNESS_MS
    ) {
      return;
    }
    lastLoadedRef.current = { scope, at: nowMs };
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
    lastLoadedRef.current = {
      scope: `${sessionIdentity}:${params.activeCommunityId}`,
      at: Date.now(),
    };
    void params.loadCommunityDirectoryMembers(params.activeCommunityId, currentSession);
  });
}
