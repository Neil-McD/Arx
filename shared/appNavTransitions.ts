import type { AppPage, AppView, CommunityTab } from "./appShellNavigation";

export type AppNavState = {
  activePage: AppPage;
  activeView: AppView;
  communityTab: CommunityTab;
  activeCommunityId: string | null;
};

export type OpenCommunityChatTransition = {
  shouldPushSnapshot: boolean;
  nextPage: "community";
  nextView: "home";
  nextCommunityTab: "chat";
  nextCommunityId: string;
};

export type OpenCommunityTabTransition<TTab extends CommunityTab = CommunityTab> = {
  shouldPushSnapshot: boolean;
  nextPage: "community";
  nextView: "home";
  nextCommunityTab: TTab;
  nextCommunityId: string;
};

export function deriveOpenCommunityTabTransition<TTab extends CommunityTab>(
  state: AppNavState,
  nextCommunityId: string,
  nextCommunityTab: TTab,
): OpenCommunityTabTransition<TTab> {
  return {
    shouldPushSnapshot:
      state.activeView !== "home" ||
      state.activePage !== "community" ||
      state.communityTab !== nextCommunityTab ||
      (state.activeCommunityId ?? null) !== nextCommunityId,
    nextPage: "community",
    nextView: "home",
    nextCommunityTab,
    nextCommunityId,
  };
}

export function deriveOpenCommunityChatTransition(
  state: AppNavState,
  nextCommunityId: string,
): OpenCommunityChatTransition {
  const transition = deriveOpenCommunityTabTransition(state, nextCommunityId, "chat");
  return transition;
}

export type OpenDiscoverTransition = {
  shouldPushSnapshot: boolean;
  nextPage: "discover";
  nextView: "home";
};

export function deriveOpenDiscoverTransition(state: Pick<AppNavState, "activePage">): OpenDiscoverTransition {
  return {
    shouldPushSnapshot: state.activePage !== "discover",
    nextPage: "discover",
    nextView: "home",
  };
}

export type ToggleWorkspaceSettingsTransition = {
  shouldPushSnapshot: boolean;
  nextPage: "workspace";
  nextView: AppView;
};

export function deriveToggleWorkspaceSettingsTransition(
  state: Pick<AppNavState, "activePage" | "activeView">,
): ToggleWorkspaceSettingsTransition {
  const nextView: AppView = state.activePage === "workspace" && state.activeView === "settings" ? "home" : "settings";
  return {
    shouldPushSnapshot: nextView === "settings",
    nextPage: "workspace",
    nextView,
  };
}

export function deriveBackFromWorkspaceSettingsFallbackTransition(): { nextView: "home" } {
  return { nextView: "home" };
}

export function deriveBackToWorkspaceFallbackTransition(
  state: Pick<AppNavState, "activeView">,
  opts?: { forceHomeView?: boolean },
): { nextPage: "workspace"; nextView: AppView } {
  return {
    nextPage: "workspace",
    nextView: opts?.forceHomeView ? "home" : state.activeView,
  };
}
