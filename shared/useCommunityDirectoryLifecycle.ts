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
  loadCommunityDirectoryMembers: (communityId: string, session: SessionT) => Promise<boolean | void>;
}) {
  const sessionRef = useRef(params.session);
  sessionRef.current = params.session;
  const lastLoadedRef = useRef<{ scope: string; at: number } | null>(null);
  const currentScopeRef = useRef<string | null>(null);
  const loadAttemptRef = useRef(0);
  const sessionIdentity = resolveAuthPresentationIdentity(
    params.session as AuthSessionLike,
  );
  const activeScope = sessionIdentity && params.activeCommunityId
    ? `${sessionIdentity}:${params.activeCommunityId}`
    : null;
  currentScopeRef.current = activeScope;

  const triggerDirectoryLoad = (communityId: string, currentSession: SessionT, scope: string) => {
    const attemptId = ++loadAttemptRef.current;
    void Promise.resolve(params.loadCommunityDirectoryMembers(communityId, currentSession))
      .then((loaded) => {
        if (loaded === false) return;
        if (loadAttemptRef.current !== attemptId || currentScopeRef.current !== scope) return;
        lastLoadedRef.current = { scope, at: Date.now() };
      })
      .catch(() => {
        // Leave failed loads uncached so returning to Chat retries cleanly.
      });
  };

  useEffect(() => {
    if (!sessionIdentity || !params.activeCommunityId || !activeScope) return;
    if (!needsCommunityDirectory(params.activePage, params.communityTab)) return;
    const communityId = params.activeCommunityId;
    const currentSession = sessionRef.current;
    if (!currentSession) return;
    const nowMs = Date.now();
    if (
      lastLoadedRef.current
      && lastLoadedRef.current.scope === activeScope
      && nowMs - lastLoadedRef.current.at < DIRECTORY_TAB_FRESHNESS_MS
    ) {
      return;
    }
    triggerDirectoryLoad(communityId, currentSession, activeScope);
  }, [
    sessionIdentity,
    params.activeCommunityId,
    activeScope,
    params.activePage,
    params.communityTab,
    params.loadCommunityDirectoryMembers,
  ]);

  useResumeEpochEffect(params.resumeEpoch, () => {
    if (!sessionIdentity || !params.activeCommunityId || !activeScope) return;
    if (!needsCommunityDirectory(params.activePage, params.communityTab)) return;
    const currentSession = sessionRef.current;
    if (!currentSession) return;
    triggerDirectoryLoad(params.activeCommunityId, currentSession, activeScope);
  });
}
