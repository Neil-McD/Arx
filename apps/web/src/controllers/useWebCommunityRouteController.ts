import { useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppPage, AppView, CommunityTab } from "../../../../shared/appShellNavigation";
import { deriveOpenCommunityTabTransition } from "../../../../shared/appNavTransitions";
import {
  buildCommunityHomePath,
  buildCommunityTabPath,
} from "../../../../shared/webAppRouteState";

type NavigateFn = (path: string, opts?: { replace?: boolean }) => void;

type CommunityLike = {
  id: string;
  slug: string;
};

// Choosing a page of a community (the left column, Home's shortcuts, the
// palette): the address to go to as a history step, or "here" when you are on
// it already, exactly as it is, so Back needs no extra press.
export function communityPageStep(input: {
  communitySlug: string;
  communityTab: CommunityTab;
  sameCommunity: boolean;
  channelSlug: string | null;
  here: string;
}): { kind: "go"; path: string } | { kind: "here" } | { kind: "none" } {
  const path = buildCommunityTabPath(
    input.communitySlug,
    input.communityTab,
    null,
    null,
    // Back to the channels keeps the channel you were in.
    input.communityTab === "chat" && input.sameCommunity ? input.channelSlug : null,
  );
  if (!path) return { kind: "none" };
  // The phone layout's addresses are the same pages under /m.
  const herePath = input.here.replace(/^\/m(?=\/)/, "");
  return herePath === path ? { kind: "here" } : { kind: "go", path };
}

export function useWebCommunityRouteController<TCommunity extends CommunityLike>(params: {
  activePage: AppPage;
  activeView: AppView;
  activeCommunityId: string | null;
  activeCommunitySlug: string | null;
  communityTab: CommunityTab;
  // The channel open now; remembered per community for going back to the channels.
  communityChannelSlug?: string | null;
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
}) {
  const paramsRef = useRef(params);
  paramsRef.current = params;
  // The channel last open in each community, so going back to the channels
  // from another page returns to it (the address drops it off the channels).
  const lastChannelRef = useRef<Record<string, string>>({});
  if (params.activePage === "community" && params.activeCommunityId && params.communityTab === "chat") {
    // No channel in the address is General.
    lastChannelRef.current[params.activeCommunityId] = params.communityChannelSlug || "general";
  }

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
      preserveChannel?: boolean;
    }) => {
      const current = paramsRef.current;
      const requestedSlug =
        opts.communitySlug !== undefined ? String(opts.communitySlug ?? "").trim() || null : undefined;
      const resolvedSlug =
        requestedSlug !== undefined ? requestedSlug : resolveCommunitySlugById(opts.communityId ?? null);
      current.applyCommunityShellState({
        communitySlug: resolvedSlug,
        communityId: opts.communityId ?? null,
        ...(opts.preserveChannel ? {} : { communityChannelSlug: null }),
      });
    },
    [resolveCommunitySlugById],
  );

  const clearCommunitySelection = useCallback(() => {
    syncCommunitySelection({ communityId: null, communitySlug: null });
  }, [syncCommunitySelection]);

  const openCommunityTab = useCallback(
    (nextCommunitySlug: string, nextCommunityTab: CommunityTab, opts?: { pushSnapshot?: boolean }) => {
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
      // A page you choose is a step in history (Back returns to where you
      // were); the screen follows the address. Corrections (a page you can't
      // open, a community's real address) replace instead, elsewhere.
      const step = communityPageStep({
        communitySlug: matchedCommunity.slug,
        communityTab: transition.nextCommunityTab,
        sameCommunity: matchedCommunity.id === (current.activeCommunityId ?? null),
        channelSlug: lastChannelRef.current[matchedCommunity.id] ?? null,
        here: window.location.pathname,
      });
      if (step.kind === "go") current.navigateTo(step.path);
      if (step.kind !== "none") return;
      current.setActiveView(transition.nextView);
      current.setActivePage(transition.nextPage);
      current.applyCommunityShellState({
        communitySlug: matchedCommunity.slug,
        communityTab: transition.nextCommunityTab,
      });
    },
    [openPublicCommunityFunnel, resolveCommunityBySlug],
  );

  const openCommunityChat = useCallback(
    (nextCommunitySlug: string, opts?: { pushSnapshot?: boolean }) => {
      openCommunityTab(nextCommunitySlug, "chat", opts);
    },
    [openCommunityTab],
  );

  const openCommunityHome = useCallback(
    (nextCommunitySlug: string, opts?: { pushSnapshot?: boolean }) => {
      const current = paramsRef.current;
      const normalizedSlug = String(nextCommunitySlug ?? "").trim();
      if (!normalizedSlug) return;
      const matchedCommunity = resolveCommunityBySlug(normalizedSlug);
      if (!matchedCommunity) {
        openPublicCommunityFunnel(normalizedSlug, opts);
        return;
      }
      const path = buildCommunityHomePath(matchedCommunity.slug);
      if (!path) return;
      const isAlreadyOpen =
        current.activePage === "community" &&
        current.activeView === "community_home" &&
        current.activeCommunityId === matchedCommunity.id;
      if ((opts?.pushSnapshot ?? true) && !isAlreadyOpen) current.pushNavSnapshot();
      current.navigateTo(path);
    },
    [openPublicCommunityFunnel, resolveCommunityBySlug],
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
    (communitySlug: string, opts?: { pushSnapshot?: boolean }) => {
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
    openCommunityHome,
    openCommunityChat,
    openJoinedCommunityBySlug,
  };
}
