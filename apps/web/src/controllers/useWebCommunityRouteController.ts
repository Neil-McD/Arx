import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppPage, AppView, CommunityTab } from "../../../../shared/appShellNavigation";
import type { PublicRoute } from "../../../../shared/webAppRouteState";
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
  isLoadingCommunities: boolean;
  publicRouteKind: PublicRoute["kind"];
  navigateTo: NavigateFn;
  pushNavSnapshot: () => void;
  setActivePage: Dispatch<SetStateAction<AppPage>>;
  setActiveView: Dispatch<SetStateAction<AppView>>;
  setActiveCommunityId: Dispatch<SetStateAction<string | null>>;
  setActiveCommunitySlug: Dispatch<SetStateAction<string | null>>;
  setCommunityTab: Dispatch<SetStateAction<CommunityTab>>;
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
    current.setActiveCommunitySlug(slug);
  }, [params.activeCommunityId, params.communities, params.activeCommunitySlug, resolveCommunitySlugById]);

  useEffect(() => {
    const current = paramsRef.current;
    if (current.activePage !== "community") return;
    const slug = String(current.activeCommunitySlug ?? "").trim();
    if (!slug) return;
    const activeSlug = resolveCommunitySlugById(current.activeCommunityId);
    if (activeSlug === slug) return;
    const match = resolveCommunityBySlug(slug);
    if (match) {
      if (current.activeCommunityId !== match.id) current.setActiveCommunityId(match.id);
      return;
    }
    if (!current.isLoadingCommunities && current.publicRouteKind === "app") {
      current.navigateTo(`/c/${encodeURIComponent(slug)}`, { replace: true });
    }
  }, [
    params.activePage,
    params.activeCommunityId,
    params.activeCommunitySlug,
    params.communities,
    params.isLoadingCommunities,
    params.publicRouteKind,
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
      current.setActiveCommunityId(opts.communityId);
      const resolvedSlug =
        opts.communitySlug !== undefined ? String(opts.communitySlug ?? "").trim() || null : resolveCommunitySlugById(opts.communityId);
      current.setActiveCommunitySlug(resolvedSlug);
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
      current.setCommunityTab(transition.nextCommunityTab);
      if (opts?.clearUnread) current.setUnreadCount?.(0);
      syncCommunitySelection({ communityId: transition.nextCommunityId });
    },
    [syncCommunitySelection],
  );

  const openCommunityChat = useCallback(
    (nextCommunityId: string, opts?: { clearUnread?: boolean; pushSnapshot?: boolean }) => {
      openCommunityTab(nextCommunityId, "chat", opts);
    },
    [openCommunityTab],
  );

  const openJoinedCommunityBySlug = useCallback(
    (communitySlug: string, opts?: { clearUnread?: boolean; pushSnapshot?: boolean }) => {
      const community = resolveCommunityBySlug(communitySlug);
      if (!community) {
        openPublicCommunityFunnel(communitySlug, opts);
        return;
      }
      openCommunityChat(community.id, opts);
    },
    [openCommunityChat, openPublicCommunityFunnel, resolveCommunityBySlug],
  );

  return {
    resolveCommunitySlugById,
    resolveCommunityBySlug,
    syncCommunitySelection,
    clearCommunitySelection,
    openPublicCommunityFunnel,
    openCommunityTab,
    openCommunityChat,
    openJoinedCommunityBySlug,
  };
}
