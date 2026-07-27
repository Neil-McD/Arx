import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  clearStripeConnectQueryParams,
  parseStripeConnectReturn,
  type StripeConnectReturn,
} from "../../../../shared/accountCommerce";
import type {
  AppPage,
  AppView,
  CommunitySettingsPane,
  CommunityTab,
  OperatorTab,
  SettingsPage,
} from "../../../../shared/appShellNavigation";
import {
  isLegacyWorkspaceRoutePath,
  type CommunityExperienceMode,
  type PublicRoute,
} from "../../../../shared/webAppRouteState";

function hasPendingOAuthCallbackParams(): boolean {
  try {
    const url = new URL(window.location.href);
    return (
      url.searchParams.has("code") ||
      url.searchParams.has("error") ||
      url.searchParams.has("app_oauth")
    );
  } catch {
    return false;
  }
}

export function useWebPathRouteLifecycle(params: {
  publicRouteKind: PublicRoute["kind"];
  activePage: AppPage;
  activeView: AppView;
  settingsPage: SettingsPage;
  activeCommunitySlug: string | null;
  communityTab: CommunityTab;
  communityExperienceMode: CommunityExperienceMode;
  communityResourceModuleId: string | null;
  communitySettingsPane: CommunitySettingsPane;
  docsSlug: string | null;
  operatorTab: OperatorTab | null;
  applyLocationToState: () => void;
  setStripeConnectReturn: Dispatch<SetStateAction<StripeConnectReturn | null>>;
  buildAppRoutePath: (state: {
    page: AppPage;
    view: AppView;
    settingsPage: SettingsPage;
    communitySlug: string | null;
    communityTab: CommunityTab;
    communityExperienceMode?: CommunityExperienceMode;
    communityResourceModuleId?: string | null;
    communitySettingsPane?: CommunitySettingsPane | null;
    docsSlug: string | null;
    operatorTab?: OperatorTab | null;
  }) => string | null;
}) {
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    const url = new URL(window.location.href);
    const connectReturn = parseStripeConnectReturn(url.searchParams);
    if (!connectReturn) return;

    params.setStripeConnectReturn(connectReturn);
    clearStripeConnectQueryParams(url.searchParams);

    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    paramsRef.current.applyLocationToState();
  }, []);

  useEffect(() => {
    const handlePopState = () => paramsRef.current.applyLocationToState();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (params.publicRouteKind !== "app") return;
    if (hasPendingOAuthCallbackParams()) return;
    if (isLegacyWorkspaceRoutePath(window.location.pathname)) return;

    const nextPath = params.buildAppRoutePath({
      page: params.activePage,
      view: params.activeView,
      settingsPage: params.settingsPage,
      communitySlug: params.activeCommunitySlug,
      communityTab: params.communityTab,
      communityExperienceMode:
        params.activePage === "community" ? params.communityExperienceMode : "standard",
      communityResourceModuleId:
        params.activePage === "community" && params.communityTab === "resources"
          ? params.communityResourceModuleId
          : null,
      communitySettingsPane:
        params.activePage === "community" && params.communityTab === "settings"
          ? params.communitySettingsPane
          : null,
      docsSlug: params.docsSlug,
      operatorTab: params.activePage === "operator" ? params.operatorTab : null,
    });
    if (!nextPath) return;

    const currentPath = `${window.location.pathname}${window.location.search}`;
    if (currentPath === nextPath) return;
    window.history.replaceState({}, "", nextPath);
  }, [
    params.publicRouteKind,
    params.activePage,
    params.activeView,
    params.settingsPage,
    params.activeCommunitySlug,
    params.communityTab,
    params.communityExperienceMode,
    params.communityResourceModuleId,
    params.communitySettingsPane,
    params.docsSlug,
    params.operatorTab,
  ]);
}
