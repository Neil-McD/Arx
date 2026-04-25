import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  clearBuilderConnectQueryParams,
  clearBuilderBillingQueryParams,
  parseBuilderConnectReturn,
  parseBuilderBillingReturn,
  type BuilderConnectReturn,
  type BuilderBillingReturn,
} from "../../../../shared/builderBilling";
import type { AppPage, AppView, CommunityTab, DiscoverTab, SettingsPage } from "../../../../shared/appShellNavigation";
import type { PublicRoute } from "../../../../shared/webAppRouteState";

function hasPendingOAuthCallbackParams(): boolean {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.has("code") || url.searchParams.has("error");
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
  discoverTab: DiscoverTab;
  activeThreadId: string | null;
  applyLocationToState: () => void;
  setBuilderConnectReturn: Dispatch<SetStateAction<BuilderConnectReturn | null>>;
  setBuilderBillingReturn: Dispatch<SetStateAction<BuilderBillingReturn | null>>;
  buildAppRoutePath: (state: {
    page: AppPage;
    view: AppView;
    settingsPage: SettingsPage;
    communitySlug: string | null;
    communityTab: CommunityTab;
    discoverTab: DiscoverTab;
    threadId: string | null;
  }) => string | null;
}) {
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    const url = new URL(window.location.href);
    const connectReturn = parseBuilderConnectReturn(url.searchParams);
    const billingReturn = parseBuilderBillingReturn(url.searchParams);
    if (!connectReturn && !billingReturn) return;

    if (connectReturn) {
      params.setBuilderConnectReturn(connectReturn);
      clearBuilderConnectQueryParams(url.searchParams);
    }
    if (billingReturn) {
      params.setBuilderBillingReturn(billingReturn);
      clearBuilderBillingQueryParams(url.searchParams);
    }

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

    const nextPath = params.buildAppRoutePath({
      page: params.activePage,
      view: params.activeView,
      settingsPage: params.settingsPage,
      communitySlug: params.activeCommunitySlug,
      communityTab: params.communityTab,
      discoverTab: params.discoverTab,
      threadId: params.activePage === "workspace" && params.activeView === "home" ? params.activeThreadId : null,
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
    params.discoverTab,
    params.activeThreadId,
  ]);
}
