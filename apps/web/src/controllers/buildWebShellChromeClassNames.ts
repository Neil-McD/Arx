type BuildWebShellChromeClassNamesParams = {
  showMobileAppShell: boolean;
  showMobileSettingsShell: boolean;
  showMobilePublicFunnel: boolean;
  mobileOverlay: boolean;
  mobileChromeAutoHideEnabled: boolean;
  mobileChromeReadingMode: boolean;
  showDesktopCommunityRail: boolean;
  showDesktopCommunityNav: boolean;
  isGlobalSettings: boolean;
  hasLeftPanel: boolean;
  reserveCommunityNavTopbarSpace: boolean;
};

export function buildWebShellChromeClassNames(
  params: BuildWebShellChromeClassNamesParams,
): { rootClassName: string; shellClassName: string } {
  const rootClassName = `app-root${
    params.reserveCommunityNavTopbarSpace ? " community-nav-topbar-space" : ""
  }${
    params.showMobileAppShell ? " mobile-shell" : ""
  }${params.showMobileSettingsShell ? " mobile-settings-shell" : ""}${
    params.showMobilePublicFunnel ? " public-funnel-mobile" : ""
  }${params.mobileOverlay ? " mobile-overlay-open" : ""}${
    params.mobileChromeAutoHideEnabled ? " mobile-chrome-auto-hide" : ""
  }${params.mobileChromeReadingMode ? " mobile-reading-mode" : ""}`;

  const shellClassName = `app-shell${
    params.showDesktopCommunityRail ? " with-community-rail" : ""
  }${
    params.showDesktopCommunityRail || params.showDesktopCommunityNav
      ? " framed-shell"
      : ""
  }${
    params.showDesktopCommunityNav ? " community-layout" : ""
  }${
    params.showDesktopCommunityNav || params.isGlobalSettings
      ? " sessions-compact"
      : ""
  }${!params.hasLeftPanel ? " no-left" : ""} no-right`;

  return { rootClassName, shellClassName };
}
