import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { isWorkflowMembersSearch, workflowSectionFromSearch, workflowSectionUrl } from "../../../../shared/workflowSection";
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
  buildCommunityTabPath,
  isLegacyWorkspaceRoutePath,
  type PublicRoute,
} from "../../../../shared/webAppRouteState";

function hasPendingRouteIntentParams(): boolean {
  try {
    const url = new URL(window.location.href);
    return (
      url.searchParams.has("code") ||
      url.searchParams.has("error") ||
      url.searchParams.has("app_oauth") ||
      url.searchParams.has("builder_checkout")
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
  settingsIndex: boolean;
  activeCommunitySlug: string | null;
  communityTab: CommunityTab;
  communityChannelSlug: string | null;
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
    settingsIndex?: boolean;
    communitySlug: string | null;
    communityTab: CommunityTab;
    communityChannelSlug?: string | null;
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
    if (hasPendingRouteIntentParams()) return;
    if (isLegacyWorkspaceRoutePath(window.location.pathname)) return;

    let nextPath = params.buildAppRoutePath({
      page: params.activePage,
      view: params.activeView,
      settingsPage: params.settingsPage,
      settingsIndex: params.settingsIndex,
      communitySlug: params.activeCommunitySlug,
      communityTab: params.communityTab,
      communityChannelSlug:
        params.activePage === "community" && params.communityTab === "chat"
          ? params.communityChannelSlug
          : null,
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
    if (params.activePage === "community" && params.communityTab === "workflows" && window.location.pathname === nextPath) {
      // Workflows › Members became the community's own Members tab.
      if (isWorkflowMembersSearch(window.location.search)) {
        const peoplePath = buildCommunityTabPath(params.activeCommunitySlug, "people");
        if (peoplePath) {
          window.history.replaceState({}, "", peoplePath);
          window.dispatchEvent(new PopStateEvent("popstate"));
          return;
        }
      }
      nextPath = workflowSectionUrl(new URL(nextPath, window.location.origin).href, workflowSectionFromSearch(window.location.search));
    }
    // Members keeps its open member and stage filter in the address.
    if (params.activePage === "community" && params.communityTab === "people" && window.location.pathname === nextPath) {
      const kept = new URLSearchParams();
      const search = new URLSearchParams(window.location.search);
      for (const key of ["member", "stage"]) { const value = search.get(key); if (value) kept.set(key, value); }
      if (kept.size) nextPath = `${nextPath}?${kept}`;
    }

    const currentPath = `${window.location.pathname}${window.location.search}`;
    if (currentPath === nextPath) return;
    window.history.replaceState({}, "", nextPath);
  }, [
    params.publicRouteKind,
    params.activePage,
    params.activeView,
    params.settingsPage,
    params.settingsIndex,
    params.activeCommunitySlug,
    params.communityTab,
    params.communityChannelSlug,
    params.communityResourceModuleId,
    params.communitySettingsPane,
    params.docsSlug,
    params.operatorTab,
  ]);
}
