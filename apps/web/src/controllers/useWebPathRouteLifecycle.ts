import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  clearBuilderBillingQueryParams,
  parseBuilderBillingReturn,
  type BuilderBillingReturn,
} from "../../../../shared/builderBilling";
import type { AppPage, AppView, CommunityTab, SettingsPage } from "../../../../shared/appShellNavigation";
import type { AppRouteState, PublicRoute } from "../../../../shared/webAppRouteState";

export function useWebPathRouteLifecycle(params: {
  publicRouteKind: PublicRoute["kind"];
  activePage: AppPage;
  activeView: AppView;
  settingsPage: SettingsPage;
  activeCommunityId: string | null;
  activeCommunitySlug: string | null;
  communityTab: CommunityTab;
  activeThreadId: string | null;
  workspaceWantsNewChat: boolean;
  threadsHydratedRef: MutableRefObject<boolean>;
  setPublicRoute: Dispatch<SetStateAction<PublicRoute>>;
  setActivePage: Dispatch<SetStateAction<AppPage>>;
  setActiveView: Dispatch<SetStateAction<AppView>>;
  setSettingsPage: Dispatch<SetStateAction<SettingsPage>>;
  setActiveCommunityId: Dispatch<SetStateAction<string | null>>;
  setActiveCommunitySlug: Dispatch<SetStateAction<string | null>>;
  setCommunityTab: Dispatch<SetStateAction<CommunityTab>>;
  applyPublicRouteState: (route: PublicRoute) => void;
  applyWorkspaceRouteState: (state: {
    page: AppPage;
    view: AppView;
    threadId: string | null;
  }) => void;
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
  const applyLocationToState = () => {
    const nextPublicRoute = params.readPublicRouteFromLocation();
    params.setPublicRoute(nextPublicRoute);
    if (nextPublicRoute.kind !== "app") {
      params.applyPublicRouteState(nextPublicRoute);
      return;
    }

    const nextAppRoute = params.readAppRouteFromLocation();
    params.setActivePage(nextAppRoute.page);
    params.setActiveView(nextAppRoute.page === "workspace" ? nextAppRoute.view : "home");
    params.setSettingsPage(nextAppRoute.settingsPage);
    params.setActiveCommunityId(nextAppRoute.communityId);
    params.setActiveCommunitySlug(nextAppRoute.communitySlug);
    params.setCommunityTab(nextAppRoute.communityTab);
    params.applyWorkspaceRouteState({
      page: nextAppRoute.page,
      view: nextAppRoute.page === "workspace" ? nextAppRoute.view : "home",
      threadId: nextAppRoute.threadId,
    });
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
    params.workspaceWantsNewChat,
    params.threadsHydratedRef,
  ]);
}
