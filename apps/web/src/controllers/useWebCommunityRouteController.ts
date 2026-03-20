import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppPage, AppView, CommunityTab } from "../../../../shared/appShellNavigation";
import { deriveOpenCommunityTabTransition } from "../../../../shared/appNavTransitions";

type NavigateFn = (path: string, opts?: { replace?: boolean }) => void;

type CommunityLike = {
  id: string;
  slug: string;
};

export function useWebCommunityRouteController<TCommunity extends CommunityLike>(params: {
  activePage: AppPage;
  activeView: AppView;
  activeCommunityId: string | null;
  activeCommunitySlug: string | null;
  communityTab: CommunityTab;
  communities: TCommunity[];
  navigateTo: NavigateFn;
  pushNavSnapshot: () => void;
  setActivePage: Dispatch<SetStateAction<AppPage>>;
  setActiveView: Dispatch<SetStateAction<AppView>>;
  applyCommunityShellState: (opts: {
    communityId?: string | null;
    communitySlug?: string | null;
    communityTab?: CommunityTab;
  }) => void;
  setUnreadCount?: Dispatch<SetStateAction<number>>;
}) {
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const resolveCommunitySlugById = useCallback((communityId: string | null | undefined): string | null => {
    const id = String(communityId ?? "").trim();
    if (!id) return null;
    const community = paramsRef.current.communities.find((candidate) => candidate.id === id) ?? null;
    const slug = String(community?.slug ?? "").trim();
    return slug || null;
  }, []);

  const resolveCommunityBySlug = useCallback((communitySlug: string | null | undefined): TCommunity | null => {
    const slug = String(communitySlug ?? "").trim();
    if (!slug) return null;
    return paramsRef.current.communities.find((candidate) => String(candidate.slug ?? "").trim() === slug) ?? null;
  }, []);

  useEffect(() => {
    const current = paramsRef.current;
    const slug = resolveCommunitySlugById(current.activeCommunityId);
    if (!slug || slug === current.activeCommunitySlug) return;
    current.applyCommunityShellState({ communitySlug: slug });
  }, [params.activeCommunityId, params.communities, params.activeCommunitySlug, resolveCommunitySlugById]);

  useEffect(() => {
    const current = paramsRef.current;
    if (current.activePage !== "community") return;
    const slug = String(current.activeCommunitySlug ?? "").trim();
    if (!slug) return;
    const activeSlug = resolveCommunitySlugById(current.activeCommunityId);
    if (activeSlug === slug) return;
    const match = resolveCommunityBySlug(slug);
    if (match && current.activeCommunityId !== match.id) {
      current.applyCommunityShellState({ communityId: match.id });
    }
  }, [
    params.activePage,
    params.activeCommunityId,
    params.activeCommunitySlug,
    params.communities,
    resolveCommunityBySlug,
    resolveCommunitySlugById,
  ]);

  const openPublicCommunityFunnel = useCallback((communitySlug: string, opts?: { pushSnapshot?: boolean }) => {
    const current = paramsRef.current;
    const slug = String(communitySlug ?? "").trim();
    if (!slug) return;
    if (opts?.pushSnapshot ?? true) current.pushNavSnapshot();
    current.navigateTo(`/c/${encodeURIComponent(slug)}`);
  }, []);

  const syncCommunitySelection = useCallback(
    (opts: {
      communityId: string | null;
      communitySlug?: string | null;
    }) => {
      const current = paramsRef.current;
      const resolvedSlug =
        opts.communitySlug !== undefined ? String(opts.communitySlug ?? "").trim() || null : resolveCommunitySlugById(opts.communityId);
      current.applyCommunityShellState({
        communityId: opts.communityId,
        communitySlug: resolvedSlug,
      });
    },
    [resolveCommunitySlugById],
  );

  const clearCommunitySelection = useCallback(() => {
    syncCommunitySelection({ communityId: null, communitySlug: null });
  }, [syncCommunitySelection]);

  const openCommunityTab = useCallback(
    (nextCommunityId: string, nextCommunityTab: CommunityTab, opts?: { clearUnread?: boolean; pushSnapshot?: boolean }) => {
      const current = paramsRef.current;
      const transition = deriveOpenCommunityTabTransition(
        {
          activePage: current.activePage,
          activeView: current.activeView,
          communityTab: current.communityTab,
          activeCommunityId: current.activeCommunityId ?? null,
        },
        nextCommunityId,
        nextCommunityTab,
      );
      if ((opts?.pushSnapshot ?? true) && transition.shouldPushSnapshot) current.pushNavSnapshot();
      current.setActiveView(transition.nextView);
      current.setActivePage(transition.nextPage);
      current.applyCommunityShellState({
        communityId: transition.nextCommunityId,
        communityTab: transition.nextCommunityTab,
      });
      if (opts?.clearUnread) current.setUnreadCount?.(0);
    },
    [],
  );

  const openCommunityChat = useCallback(
    (nextCommunityId: string, opts?: { clearUnread?: boolean; pushSnapshot?: boolean }) => {
      openCommunityTab(nextCommunityId, "chat", opts);
    },
    [openCommunityTab],
  );

  const openCommunityBySlug = useCallback(
    (communitySlug: string, opts?: { pushSnapshot?: boolean }) => {
      const slug = String(communitySlug ?? "").trim();
      if (!slug) return;
      const matchedCommunity = resolveCommunityBySlug(slug);
      if (matchedCommunity) {
        openCommunityChat(matchedCommunity.id, opts);
        return;
      }
      openPublicCommunityFunnel(slug, opts);
    },
    [openCommunityChat, openPublicCommunityFunnel, resolveCommunityBySlug],
  );

  const openJoinedCommunityBySlug = useCallback(
    (communitySlug: string, opts?: { clearUnread?: boolean; pushSnapshot?: boolean }) => {
      openCommunityBySlug(communitySlug, opts);
    },
    [openCommunityBySlug],
  );

  return {
    resolveCommunitySlugById,
    resolveCommunityBySlug,
    syncCommunitySelection,
    clearCommunitySelection,
    openPublicCommunityFunnel,
    openCommunityTab,
    openCommunityChat,
    openCommunityBySlug,
    openJoinedCommunityBySlug,
  };
}
