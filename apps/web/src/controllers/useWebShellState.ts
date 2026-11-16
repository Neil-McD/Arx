import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import type {
  AppPage,
  AppView,
  CommunitySettingsPane,
  CommunityTab,
  SettingsPage,
} from "../../../../shared/appShellNavigation";
import {
  settingsGroupForPage,
} from "../../../../shared/appShellNavigation";
import type { StripeConnectReturn } from "../../../../shared/accountCommerce";
import {
  APP_THEME_STORAGE_KEY,
  DEFAULT_APP_THEME,
  LEGACY_APP_THEME_STORAGE_KEY,
  applyAppThemeAttributes,
  parseAppTheme,
  type AppTheme,
} from "../../../../shared/theme";
import type {
  AppRouteState,
  AppShellVariant,
  PublicRoute,
} from "../../../../shared/webAppRouteState";
import {
  readAppRouteFromLocation,
  readPublicRouteFromLocation,
  resolveInitialAppShellVariant,
} from "../../../../shared/webAppRouteState";
import {
  readOAuthCallbackShellVariantFromLocation,
} from "../../../../shared/cloudPkce";
import { appLayoutForShell, isPhoneViewport, isStandaloneWebApp } from "../../../../shared/browserRuntimeMode";
import type {
  MobileOverlay,
  MobileRootPage,
} from "../components/webShellChromeShared";
import { phoneTabForRoute } from "../components/webShellChromeShared";
import { isDesignV1Active } from "../../../../shared/designSystem";
import { readFirstLocalStorageValue } from "../webAppRuntime";

const ignorePhoneTab: Dispatch<SetStateAction<MobileRootPage>> = () => undefined;

export function useWebShellState() {
  const initialShellVariant: AppShellVariant =
    typeof window === "undefined"
      ? "standard"
      : resolveInitialAppShellVariant({
          pathname: window.location.pathname || "/",
          search: window.location.search,
          oauthShellVariant: readOAuthCallbackShellVariantFromLocation(),
          standalone: isStandaloneWebApp(),
          phone: isPhoneViewport(),
        });
  const initialPublicRoute: PublicRoute = readPublicRouteFromLocation();
  const initialAppRoute: AppRouteState | null =
    initialPublicRoute.kind === "app"
      ? readAppRouteFromLocation()
      : null;
  const [publicRoute, setPublicRoute] = useState<PublicRoute>(
    initialPublicRoute,
  );
  const [shellVariant, setShellVariant] = useState<AppShellVariant>(
    initialShellVariant,
  );
  // The styles draw the phone layout or the desktop one from this mark, never
  // from the window's width. Written here so it is set before any page renders.
  if (typeof document !== "undefined") {
    const layout = appLayoutForShell(shellVariant);
    if (document.documentElement.dataset.layout !== layout) document.documentElement.dataset.layout = layout;
  }
  const [mobileOverlay, setMobileOverlay] = useState<MobileOverlay>(null);
  // The classic layout's stored phone tab (design v1 reads it from the
  // address below; this goes when the classic layout is deleted).
  const [storedMobileRootPage, setStoredMobileRootPage] =
    useState<MobileRootPage>("community");
  const [mobileSettingsView, setMobileSettingsView] =
    useState<"index" | "detail">(
      initialAppRoute?.page === "settings" && initialAppRoute.settingsIndex
        ? "index"
        : "detail",
    );
  const [mobileChromeReadingMode, setMobileChromeReadingMode] = useState(false);
  const [stripeConnectReturn, setStripeConnectReturn] =
    useState<StripeConnectReturn | null>(null);
  const [activePage, setActivePage] = useState<AppPage>(
    initialAppRoute?.page ?? "landing",
  );
  const [activeView, setActiveView] = useState<AppView>(
    initialAppRoute?.view ?? "home",
  );
  const [settingsPage, setSettingsPage] = useState<SettingsPage>(
    initialAppRoute?.settingsPage ?? "profile",
  );
  const [selectedProductDocSlug, setSelectedProductDocSlug] =
    useState<string | null>(initialAppRoute?.docsSlug ?? null);
  const [communityTab, setCommunityTab] = useState<CommunityTab>(
    initialAppRoute?.communityTab ?? "chat",
  );
  const [communityChannelSlug, setCommunityChannelSlug] = useState<string | null>(
    initialAppRoute?.page === "community" && initialAppRoute.communityTab === "chat"
      ? initialAppRoute.communityChannelSlug ?? null
      : null,
  );
  const [communityResourceModuleId, setCommunityResourceModuleId] =
    useState<string | null>(
      initialAppRoute?.page === "community"
      && initialAppRoute.communityTab === "resources"
        ? initialAppRoute.communityResourceModuleId ?? null
        : null,
    );
  const [communityPodSlug, setCommunityPodSlug] = useState<string | null>(
    initialAppRoute?.page === "community" && initialAppRoute.communityTab === "pods"
      ? initialAppRoute.communityPodSlug ?? null
      : null,
  );
  const [communitySettingsPane, setCommunitySettingsPane] =
    useState<CommunitySettingsPane>(
      initialAppRoute?.page === "community"
      && initialAppRoute.communityTab === "settings"
        ? initialAppRoute.communitySettingsPane ?? "community"
        : "community",
    );
  const designV1 = isDesignV1Active();
  const mobileRootPage = designV1 ? phoneTabForRoute(activePage, communityTab) : storedMobileRootPage;
  // Design v1: the tab follows the address, so there is nothing to set; a tab
  // is chosen by going to its address.
  const setMobileRootPage = designV1 ? ignorePhoneTab : setStoredMobileRootPage;
  const [appTheme, setAppTheme] = useState<AppTheme>(() => {
    try {
      return parseAppTheme(readFirstLocalStorageValue([
        APP_THEME_STORAGE_KEY,
        LEGACY_APP_THEME_STORAGE_KEY,
      ])) ?? DEFAULT_APP_THEME;
    } catch {
      return DEFAULT_APP_THEME;
    }
  });

  useEffect(() => {
    applyAppThemeAttributes(appTheme, document.documentElement);
    try {
      localStorage.setItem(APP_THEME_STORAGE_KEY, appTheme);
      localStorage.removeItem(LEGACY_APP_THEME_STORAGE_KEY);
    } catch {
      // The active document theme is already applied.
    }
  }, [appTheme]);

  return {
    publicRoute,
    setPublicRoute,
    initialCommunitySlug: initialAppRoute?.communitySlug ?? null,
    shellVariant,
    setShellVariant,
    mobileOverlay,
    setMobileOverlay,
    mobileRootPage,
    setMobileRootPage,
    mobileSettingsView,
    setMobileSettingsView,
    mobileChromeReadingMode,
    setMobileChromeReadingMode,
    stripeConnectReturn,
    setStripeConnectReturn,
    activePage,
    setActivePage,
    activeView,
    setActiveView,
    settingsPage,
    setSettingsPage,
    settingsGroup: settingsGroupForPage(settingsPage),
    selectedProductDocSlug,
    setSelectedProductDocSlug,
    communityTab,
    setCommunityTab,
    communityChannelSlug,
    setCommunityChannelSlug,
    communityResourceModuleId,
    setCommunityResourceModuleId,
    communityPodSlug,
    setCommunityPodSlug,
    communitySettingsPane,
    setCommunitySettingsPane,
    appTheme,
    setAppTheme,
  };
}
