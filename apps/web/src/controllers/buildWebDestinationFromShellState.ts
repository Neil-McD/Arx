import type {
  AppPage,
  AppView,
  CommunitySettingsPane,
  CommunityTab,
  OperatorTab,
  SettingsPage,
} from "../../../../shared/appShellNavigation";
import {
  deriveWebDestination,
  type CommunityExperienceMode,
  type PublicRoute,
  type WebDestination,
} from "../../../../shared/webAppRouteState";

type WebDestinationShellState = {
  activePage: AppPage;
  activeView: AppView;
  settingsPage: SettingsPage;
  mobileSettingsView: "index" | "detail";
  communityTab: CommunityTab;
  communityExperienceMode: CommunityExperienceMode;
  communityChannelSlug: string | null;
  communityResourceModuleId: string | null;
  communitySettingsPane: CommunitySettingsPane;
  selectedProductDocSlug: string | null;
  activeOperatorTab: OperatorTab;
};

export function buildWebDestinationFromShellState(params: {
  publicRoute: PublicRoute;
  shellState: WebDestinationShellState;
  selectedCommunitySlug: string | null;
}): WebDestination {
  const state = params.shellState;
  return deriveWebDestination({
    publicRoute: params.publicRoute,
    appRoute: {
      page: state.activePage,
      view: state.activeView,
      settingsPage: state.settingsPage,
      ...(state.activePage === "settings" && state.mobileSettingsView === "index"
        ? { settingsIndex: true }
        : {}),
      communitySlug: params.selectedCommunitySlug,
      communityTab: state.communityTab,
      communityExperienceMode: state.communityExperienceMode,
      communityChannelSlug: state.communityChannelSlug,
      communityResourceModuleId: state.communityResourceModuleId,
      communitySettingsPane: state.communitySettingsPane,
      docsSlug: state.selectedProductDocSlug,
      operatorTab: state.activeOperatorTab,
    },
  });
}
