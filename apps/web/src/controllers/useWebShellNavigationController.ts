import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { AuthSession } from "../auth";
import type { StripeConnectReturn } from "../../../../shared/accountCommerce";
import type {
  AppPage,
  AppView,
  CommunitySettingsPane,
  CommunityTab,
  OperatorTab,
  SettingsPage,
} from "../../../../shared/appShellNavigation";
import {
  formatBackTargetLabel,
  popDistinctNavSnapshot,
  pushUniqueNavSnapshot,
} from "../../../../shared/navSnapshot";
import { resolveAuthSubject } from "../../../../shared/authSession";
import { isStandaloneWebApp } from "../../../../shared/browserRuntimeMode";
import { hasOAuthCallbackParamsInLocation } from "../../../../shared/cloudPkce";
import {
  STANDALONE_APP_LAUNCH_SEARCH_PARAM,
  STANDALONE_APP_LAUNCH_SEARCH_VALUE,
  applyShellVariantToAppPath,
  applyShellVariantToKnownPath,
  buildAppRoutePath,
  buildCommunityFunnelPath,
  buildSettingsPath,
  readAppRouteFromLocation,
  readLegacyWorkspaceRouteContext,
  readPublicRouteFromLocation,
  readShellVariantFromPathname,
  type AppRouteState,
  type AppShellVariant,
  type CommunityExperienceMode,
  type PublicRoute,
} from "../../../../shared/webAppRouteState";
import type { WebNavSnapshot } from "../webAppContracts";
import { useWebPathRouteLifecycle } from "./useWebPathRouteLifecycle";

type MemberEntryActions = {
  resolveAndEnter: (options?: {
    session?: AuthSession | null;
    communitySlug?: string | null;
    replace?: boolean;
  }) => Promise<boolean>;
};

export function useWebShellNavigationController(params: {
  session: AuthSession | null;
  isAuthBootstrapComplete: boolean;
  canonicalSessionUserId: string | null;
  isOperatorAccessResolved: boolean;
  operatorAccess: unknown;
  hasOperatorAccess: boolean;
  publicRoute: PublicRoute;
  setPublicRoute: Dispatch<SetStateAction<PublicRoute>>;
  shellVariant: AppShellVariant;
  setShellVariant: Dispatch<SetStateAction<AppShellVariant>>;
  activePage: AppPage;
  setActivePage: Dispatch<SetStateAction<AppPage>>;
  activeView: AppView;
  setActiveView: Dispatch<SetStateAction<AppView>>;
  settingsPage: SettingsPage;
  setSettingsPage: Dispatch<SetStateAction<SettingsPage>>;
  selectedProductDocSlug: string | null;
  setSelectedProductDocSlug: Dispatch<SetStateAction<string | null>>;
  activeOperatorTab: OperatorTab;
  setActiveOperatorTab: Dispatch<SetStateAction<OperatorTab>>;
  selectedActiveCommunitySlug: string | null;
  communityTab: CommunityTab;
  communityExperienceMode: CommunityExperienceMode;
  setCommunityExperienceMode: Dispatch<
    SetStateAction<CommunityExperienceMode>
  >;
  communityResourceModuleId: string | null;
  setCommunityResourceModuleId: Dispatch<SetStateAction<string | null>>;
  communitySettingsPane: CommunitySettingsPane;
  setCommunitySettingsPane: Dispatch<SetStateAction<CommunitySettingsPane>>;
  applyCommunityShellState: (options: {
    communitySlug?: string | null;
    communityTab?: CommunityTab;
  }) => void;
  setStripeConnectReturn: Dispatch<SetStateAction<StripeConnectReturn | null>>;
}) {
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const memberEntryActionsRef = useRef<MemberEntryActions>({
    resolveAndEnter: async () => false,
  });
  const navStackRef = useRef<WebNavSnapshot[]>([]);
  const legacyWorkspaceRedirectRef = useRef<string | null>(null);
  const operatorRouteRedirectRef = useRef<string | null>(null);

  const applyAppRouteState = useCallback((nextAppRoute: AppRouteState) => {
    const current = paramsRef.current;
    const communitySlug =
      String(nextAppRoute.communitySlug ?? "").trim() || null;
    current.setActivePage(nextAppRoute.page);
    current.setActiveView("home");
    current.setSettingsPage(nextAppRoute.settingsPage);
    if (nextAppRoute.page === "docs") {
      current.setSelectedProductDocSlug(nextAppRoute.docsSlug ?? null);
    }
    if (nextAppRoute.page === "operator") {
      current.setActiveOperatorTab(nextAppRoute.operatorTab ?? "platform");
    }
    if (nextAppRoute.page === "community") {
      current.setCommunityExperienceMode(
        nextAppRoute.communityExperienceMode ?? "standard",
      );
      current.applyCommunityShellState({
        communitySlug,
        communityTab: nextAppRoute.communityTab,
      });
      current.setCommunityResourceModuleId(
        nextAppRoute.communityTab === "resources"
          ? nextAppRoute.communityResourceModuleId ?? null
          : null,
      );
      current.setCommunitySettingsPane(
        nextAppRoute.communityTab === "settings"
          ? nextAppRoute.communitySettingsPane ?? "community"
          : "community",
      );
      return;
    }
    current.setCommunityExperienceMode("standard");
    current.setCommunityResourceModuleId(null);
    current.setCommunitySettingsPane("community");
  }, []);

  const applyLocationToState = useCallback(() => {
    const current = paramsRef.current;
    current.setShellVariant(
      readShellVariantFromPathname(window.location.pathname || "/"),
    );
    const nextPublicRoute = readPublicRouteFromLocation();
    current.setPublicRoute(nextPublicRoute);
    if (nextPublicRoute.kind === "app") {
      applyAppRouteState(readAppRouteFromLocation());
    }
    return nextPublicRoute;
  }, [applyAppRouteState]);

  const navigateTo = useCallback(
    (
      path: string,
      options: { replace?: boolean; state?: unknown } = {},
    ): void => {
      const nextPath = applyShellVariantToKnownPath(
        path,
        paramsRef.current.shellVariant,
      );
      const historyState = options.state ?? {};
      if (options.replace) {
        window.history.replaceState(historyState, document.title, nextPath);
      } else {
        window.history.pushState(historyState, document.title, nextPath);
      }
      applyLocationToState();
    },
    [applyLocationToState],
  );

  const readCurrentRoutePath = useCallback(
    () => `${window.location.pathname}${window.location.search}` || "/",
    [],
  );
  const buildCurrentAppRoutePath = useCallback((): string | null => {
    const current = paramsRef.current;
    return (
      applyShellVariantToAppPath(
        buildAppRoutePath({
          page: current.activePage,
          view: current.activeView,
          settingsPage: current.settingsPage,
          communitySlug: current.selectedActiveCommunitySlug,
          communityTab: current.communityTab,
          communityResourceModuleId:
            current.activePage === "community" &&
            current.communityTab === "resources"
              ? current.communityResourceModuleId
              : null,
          communitySettingsPane:
            current.activePage === "community" &&
            current.communityTab === "settings"
              ? current.communitySettingsPane
              : null,
          docsSlug:
            current.activePage === "docs"
              ? current.selectedProductDocSlug
              : null,
          operatorTab:
            current.activePage === "operator"
              ? current.activeOperatorTab
              : null,
        }) ?? "",
        current.shellVariant,
      ) || null
    );
  }, []);
  const pushNavSnapshot = useCallback(() => {
    const current = paramsRef.current;
    const snapshot: WebNavSnapshot = {
      page: current.activePage,
      view: current.activeView,
      settingsPage: current.settingsPage,
      communitySlug: current.selectedActiveCommunitySlug,
      communityTab: current.communityTab,
      routePath: buildCurrentAppRoutePath() ?? readCurrentRoutePath(),
    };
    pushUniqueNavSnapshot(navStackRef.current, snapshot);
  }, [buildCurrentAppRoutePath, readCurrentRoutePath]);
  const openGlobalSettings = useCallback(
    (page: SettingsPage): void => {
      const current = paramsRef.current;
      if (current.activePage === "settings" && current.settingsPage === page) {
        return;
      }
      if (current.activePage !== "settings") pushNavSnapshot();
      navigateTo(buildSettingsPath(page));
    },
    [navigateTo, pushNavSnapshot],
  );
  const openOperatorConsole = useCallback(
    (tab: OperatorTab = "platform"): void => {
      const current = paramsRef.current;
      if (!current.hasOperatorAccess) return;
      if (current.activePage !== "operator") pushNavSnapshot();
      navigateTo(`/operator/${tab}`);
    },
    [navigateTo, pushNavSnapshot],
  );
  const goBack = useCallback((): boolean => {
    const snapshot = popDistinctNavSnapshot(
      navStackRef.current,
      readCurrentRoutePath(),
    );
    if (!snapshot) return false;
    navigateTo(snapshot.routePath?.trim() || "/", { replace: true });
    return true;
  }, [navigateTo, readCurrentRoutePath]);

  useEffect(() => {
    const current = paramsRef.current;
    if (
      !current.isAuthBootstrapComplete ||
      current.publicRoute.kind !== "app"
    ) {
      return;
    }
    const pathname = window.location.pathname || "/";
    const legacyContext = readLegacyWorkspaceRouteContext(pathname);
    if (!legacyContext) return;
    const redirectKey = `${resolveAuthSubject(current.session) ?? "signed-out"}:${pathname}`;
    if (legacyWorkspaceRedirectRef.current === redirectKey) return;
    legacyWorkspaceRedirectRef.current = redirectKey;

    if (!current.session) {
      navigateTo(
        legacyContext.communitySlug
          ? buildCommunityFunnelPath(legacyContext.communitySlug) ?? "/"
          : "/",
        { replace: true },
      );
      return;
    }
    void memberEntryActionsRef.current
      .resolveAndEnter({
        session: current.session,
        communitySlug: legacyContext.communitySlug,
        replace: true,
      })
      .then((entered) => {
        if (entered) return;
        navigateTo(
          legacyContext.communitySlug
            ? buildCommunityFunnelPath(legacyContext.communitySlug) ??
                "/discover"
            : "/discover",
          { replace: true },
        );
      });
  }, [
    navigateTo,
    params.isAuthBootstrapComplete,
    params.publicRoute.kind,
    params.session,
  ]);

  useEffect(() => {
    if (!isStandaloneWebApp()) return;
    const currentUrl = new URL(window.location.href);
    if (
      currentUrl.searchParams.get(STANDALONE_APP_LAUNCH_SEARCH_PARAM) !==
      STANDALONE_APP_LAUNCH_SEARCH_VALUE
    ) {
      return;
    }
    currentUrl.searchParams.delete(STANDALONE_APP_LAUNCH_SEARCH_PARAM);
    const nextPath =
      `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}` || "/";
    window.history.replaceState(
      window.history.state ?? {},
      document.title,
      nextPath,
    );
  }, []);

  useEffect(() => {
    const current = paramsRef.current;
    if (current.activePage !== "operator") {
      operatorRouteRedirectRef.current = null;
      return;
    }
    if (!current.isAuthBootstrapComplete) return;
    if (!current.session) {
      navigateTo("/", { replace: true });
      return;
    }
    if (!current.isOperatorAccessResolved || current.operatorAccess) return;
    const redirectKey = String(
      current.canonicalSessionUserId ?? "operator-denied",
    );
    if (operatorRouteRedirectRef.current === redirectKey) return;
    operatorRouteRedirectRef.current = redirectKey;
    void memberEntryActionsRef.current
      .resolveAndEnter({ session: current.session, replace: true })
      .then((entered) => {
        if (!entered) navigateTo("/discover", { replace: true });
      });
  }, [
    navigateTo,
    params.activePage,
    params.canonicalSessionUserId,
    params.isAuthBootstrapComplete,
    params.isOperatorAccessResolved,
    params.operatorAccess,
    params.session,
  ]);

  useWebPathRouteLifecycle({
    publicRouteKind: params.publicRoute.kind,
    activePage: params.activePage,
    activeView: params.activeView,
    settingsPage: params.settingsPage,
    activeCommunitySlug: params.selectedActiveCommunitySlug,
    communityTab: params.communityTab,
    communityExperienceMode: params.communityExperienceMode,
    communityResourceModuleId: params.communityResourceModuleId,
    communitySettingsPane: params.communitySettingsPane,
    docsSlug:
      params.activePage === "docs" ? params.selectedProductDocSlug : null,
    operatorTab:
      params.activePage === "operator" ? params.activeOperatorTab : null,
    applyLocationToState,
    setStripeConnectReturn: params.setStripeConnectReturn,
    buildAppRoutePath: (state) =>
      applyShellVariantToAppPath(
        buildAppRoutePath(state) ?? "",
        params.shellVariant,
      ) || null,
  });

  const isLikelyMobileDevice = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const userAgent = navigator.userAgent || "";
    const platform = navigator.platform || "";
    return (
      /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
        userAgent,
      ) ||
      (/iPad|Macintosh/i.test(platform) && navigator.maxTouchPoints > 1)
    );
  }, []);

  useEffect(() => {
    if (params.shellVariant !== "standard" || !isLikelyMobileDevice) return;
    if (hasOAuthCallbackParamsInLocation()) return;
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const nextPath = applyShellVariantToKnownPath(currentPath, "mobile");
    if (!nextPath || nextPath === currentPath) return;
    window.history.replaceState(
      window.history.state ?? {},
      document.title,
      nextPath,
    );
    applyLocationToState();
  }, [applyLocationToState, isLikelyMobileDevice, params.shellVariant]);

  if (!params.session) navStackRef.current = [];
  const backTargetSnapshot =
    [...navStackRef.current].reverse()[0] ?? null;

  return {
    memberEntryActionsRef,
    navigateTo,
    applyAppRouteState,
    applyLocationToState,
    buildCurrentAppRoutePath,
    pushNavSnapshot,
    openGlobalSettings,
    openOperatorConsole,
    goBack,
    backTargetSnapshot,
    backTargetLabel: backTargetSnapshot
      ? formatBackTargetLabel(backTargetSnapshot)
      : null,
  };
}
