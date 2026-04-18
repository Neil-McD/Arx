import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  clearBuilderBillingQueryParams,
  parseBuilderBillingReturn,
  type BuilderBillingReturn,
} from "../../../../shared/builderBilling";
import type { AppPage, AppView, CommunityTab, SettingsPage } from "../../../../shared/appShellNavigation";
import type { AppRouteState, PublicRoute } from "../../../../shared/webAppRouteState";

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
  activeThreadId: string | null;
  setPublicRoute: Dispatch<SetStateAction<PublicRoute>>;
  applyPublicRouteState: (route: PublicRoute) => void;
  applyAppRouteState: (route: AppRouteState) => void;
  setBuilderBillingReturn: Dispatch<SetStateAction<BuilderBillingReturn | null>>;
  readPublicRouteFromLocation: () => PublicRoute;
  readAppRouteFromLocation: () => AppRouteState;
  buildAppRoutePath: (state: {
    page: AppPage;
    view: AppView;
    settingsPage: SettingsPage;
    communitySlug: string | null;
    communityTab: CommunityTab;
    threadId: string | null;
  }) => string | null;
}) {
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const applyLocationToState = () => {
    const current = paramsRef.current;
    const nextPublicRoute = current.readPublicRouteFromLocation();
    current.setPublicRoute(nextPublicRoute);
    if (nextPublicRoute.kind !== "app") {
      current.applyPublicRouteState(nextPublicRoute);
      return;
    }

    current.applyAppRouteState(current.readAppRouteFromLocation());
  };

  useEffect(() => {
    const url = new URL(window.location.href);
    const billingReturn = parseBuilderBillingReturn(url.searchParams);
    if (!billingReturn) return;

    params.setBuilderBillingReturn(billingReturn);

    clearBuilderBillingQueryParams(url.searchParams);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    applyLocationToState();
  }, []);

  useEffect(() => {
    const handlePopState = () => applyLocationToState();
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
    params.activeThreadId,
  ]);
}
