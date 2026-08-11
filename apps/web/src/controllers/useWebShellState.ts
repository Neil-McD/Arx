import { useEffect, useState } from "react";

import type {
  AppPage,
  AppView,
  CommunitySettingsPane,
  CommunityTab,
  OperatorTab,
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
  CommunityExperienceMode,
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
import { isStandaloneWebApp } from "../../../../shared/browserRuntimeMode";
import type {
  MobileOverlay,
  MobileRootPage,
} from "../components/webShellChromeShared";
import { readFirstLocalStorageValue } from "../webAppRuntime";

export function useWebShellState() {
  const initialShellVariant: AppShellVariant =
    typeof window === "undefined"
      ? "standard"
      : resolveInitialAppShellVariant({
          pathname: window.location.pathname || "/",
          search: window.location.search,
          oauthShellVariant: readOAuthCallbackShellVariantFromLocation(),
          standalone: isStandaloneWebApp(),
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
  const [mobileOverlay, setMobileOverlay] = useState<MobileOverlay>(null);
  const [mobileRootPage, setMobileRootPage] =
    useState<MobileRootPage>("community");
  const [
    communityOnboardingFirstPostFocusRequest,
    setCommunityOnboardingFirstPostFocusRequest,
  ] = useState(0);
  const [mobileSettingsView, setMobileSettingsView] =
    useState<"index" | "detail">("detail");
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
  const [activeOperatorTab, setActiveOperatorTab] = useState<OperatorTab>(
    initialAppRoute?.operatorTab ?? "platform",
  );
  const [communityTab, setCommunityTab] = useState<CommunityTab>(
    initialAppRoute?.communityTab ?? "chat",
  );
  const [communityChannelSlug, setCommunityChannelSlug] = useState<string | null>(
    initialAppRoute?.page === "community" && initialAppRoute.communityTab === "chat"
      ? initialAppRoute.communityChannelSlug ?? null
      : null,
  );
  const [communityExperienceMode, setCommunityExperienceMode] =
    useState<CommunityExperienceMode>(
      initialAppRoute?.page === "community"
        ? initialAppRoute.communityExperienceMode ?? "standard"
        : "standard",
    );
  const [communityResourceModuleId, setCommunityResourceModuleId] =
    useState<string | null>(
      initialAppRoute?.page === "community"
      && initialAppRoute.communityTab === "resources"
        ? initialAppRoute.communityResourceModuleId ?? null
        : null,
    );
  const [communitySettingsPane, setCommunitySettingsPane] =
    useState<CommunitySettingsPane>(
      initialAppRoute?.page === "community"
      && initialAppRoute.communityTab === "settings"
        ? initialAppRoute.communitySettingsPane ?? "community"
        : "community",
    );
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
    communityOnboardingFirstPostFocusRequest,
    setCommunityOnboardingFirstPostFocusRequest,
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
    activeOperatorTab,
    setActiveOperatorTab,
    communityTab,
    setCommunityTab,
    communityChannelSlug,
    setCommunityChannelSlug,
    communityExperienceMode,
    setCommunityExperienceMode,
    communityResourceModuleId,
    setCommunityResourceModuleId,
    communitySettingsPane,
    setCommunitySettingsPane,
    appTheme,
    setAppTheme,
  };
}
