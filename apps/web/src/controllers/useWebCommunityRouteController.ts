import { useCallback, useRef } from "react";
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
    communityChannelSlug?: string | null;
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

  const openPublicCommunityFunnel = useCallback((communitySlug: string, opts?: { pushSnapshot?: boolean }) => {
    const current = paramsRef.current;
    const slug = String(communitySlug ?? "").trim();
    if (!slug) return;
    if (opts?.pushSnapshot ?? true) current.pushNavSnapshot();
    current.navigateTo(`/c/${encodeURIComponent(slug)}`);
  }, []);

  const syncCommunitySelection = useCallback(
    (opts: {
      communityId?: string | null;
      communitySlug?: string | null;
    }) => {
      const current = paramsRef.current;
      const requestedSlug =
        opts.communitySlug !== undefined ? String(opts.communitySlug ?? "").trim() || null : undefined;
      const resolvedSlug =
        requestedSlug !== undefined ? requestedSlug : resolveCommunitySlugById(opts.communityId ?? null);
      current.applyCommunityShellState({
        communitySlug: resolvedSlug,
        communityId: opts.communityId ?? null,
        communityChannelSlug: null,
      });
    },
    [resolveCommunitySlugById],
  );

  const clearCommunitySelection = useCallback(() => {
    syncCommunitySelection({ communityId: null, communitySlug: null });
  }, [syncCommunitySelection]);

  const openCommunityTab = useCallback(
    (nextCommunitySlug: string, nextCommunityTab: CommunityTab, opts?: { clearUnread?: boolean; pushSnapshot?: boolean }) => {
      const current = paramsRef.current;
      const normalizedSlug = String(nextCommunitySlug ?? "").trim();
      if (!normalizedSlug) return;
      const matchedCommunity = resolveCommunityBySlug(normalizedSlug);
      if (!matchedCommunity) {
        if (nextCommunityTab === "chat") {
          openPublicCommunityFunnel(normalizedSlug, opts);
        }
        return;
      }
      const transition = deriveOpenCommunityTabTransition(
        {
          activePage: current.activePage,
          activeView: current.activeView,
          communityTab: current.communityTab,
          activeCommunityId: current.activeCommunityId ?? null,
        },
        matchedCommunity.id,
        nextCommunityTab,
      );
      if ((opts?.pushSnapshot ?? true) && transition.shouldPushSnapshot) current.pushNavSnapshot();
      current.setActiveView(transition.nextView);
      current.setActivePage(transition.nextPage);
      current.applyCommunityShellState({
        communitySlug: matchedCommunity.slug,
        communityTab: transition.nextCommunityTab,
      });
      if (opts?.clearUnread) current.setUnreadCount?.(0);
    },
    [openPublicCommunityFunnel, resolveCommunityBySlug],
  );

  const openCommunityChat = useCallback(
    (nextCommunitySlug: string, opts?: { clearUnread?: boolean; pushSnapshot?: boolean }) => {
      openCommunityTab(nextCommunitySlug, "chat", opts);
    },
    [openCommunityTab],
  );

  const openCommunityBySlug = useCallback(
    (communitySlug: string, opts?: { pushSnapshot?: boolean }) => {
      const slug = String(communitySlug ?? "").trim();
      if (!slug) return;
      const matchedCommunity = resolveCommunityBySlug(slug);
      if (matchedCommunity) {
        openCommunityChat(matchedCommunity.slug, opts);
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
