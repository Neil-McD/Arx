type BuildWebShellChromeClassNamesParams = {
  showHeaderIslands: boolean;
  isSessionsDrawerOpen: boolean;
  showMobileAppShell: boolean;
  showMobileSettingsShell: boolean;
  showMobilePublicFunnel: boolean;
  mobileOverlay: boolean;
  showDesktopCommunityRail: boolean;
  showDesktopCommunityNav: boolean;
  isWorkspaceSettings: boolean;
  hasLeftPanel: boolean;
};

export function buildWebShellChromeClassNames(
  params: BuildWebShellChromeClassNamesParams,
): { rootClassName: string; shellClassName: string } {
  const rootClassName = `app-root${
    params.showHeaderIslands ? " web-header-islands" : ""
  }${params.isSessionsDrawerOpen ? " sessions-drawer-open" : ""}${
    params.showMobileAppShell ? " mobile-shell" : ""
  }${params.showMobileSettingsShell ? " mobile-settings-shell" : ""}${
    params.showMobilePublicFunnel ? " public-funnel-mobile" : ""
  }${params.mobileOverlay ? " mobile-overlay-open" : ""}`;

  const shellClassName = `app-shell${
    params.showDesktopCommunityRail ? " with-community-rail" : ""
  }${params.showDesktopCommunityNav ? " community-layout" : ""}${
    params.showDesktopCommunityNav || params.isWorkspaceSettings
      ? " sessions-compact"
      : ""
  }${!params.hasLeftPanel ? " no-left" : ""} no-right`;

  return { rootClassName, shellClassName };
}
