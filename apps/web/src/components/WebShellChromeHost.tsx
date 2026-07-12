import type {
  ComponentProps,
  ReactNode,
  TouchEventHandler,
} from "react";
import { CommunityNav } from "../../../../shared/CommunityNav";
import { WebMobileTopBar } from "./WebMobileTopBar";
import { buildWebShellChromeClassNames } from "../controllers/buildWebShellChromeClassNames";
import { WebDesktopShellHeader } from "./WebDesktopShellHeader";
import { WebDesktopCommunityRail } from "./WebDesktopCommunityRail";
import { WebMobileCommunityShell } from "./WebMobileCommunityShell";
import { WebSettingsSidebar } from "./WebSettingsSidebar";
import type {
  MobileOverlay,
  WebCommunityShellProps,
  WebDesktopShellHeaderProps,
  WebSettingsSidebarProps,
} from "./webShellChromeShared";

export type WebShellChromeHostProps = {
  showHeaderIslands: boolean;
  isSessionsDrawerOpen: boolean;
  shouldOverlaySessionsDrawer: boolean;
  showMobileAppShell: boolean;
  showMobileSettingsShell: boolean;
  showMobilePublicFunnel: boolean;
  mobileOverlay: MobileOverlay;
  onTouchStart?: TouchEventHandler<HTMLDivElement>;
  onTouchEnd?: TouchEventHandler<HTMLDivElement>;
  onTouchCancel?: TouchEventHandler<HTMLDivElement>;
  mobileTopBarProps: ComponentProps<typeof WebMobileTopBar>;
  desktopHeader: WebDesktopShellHeaderProps;
  workspaceShellPanels: ReactNode;
  communityShell: WebCommunityShellProps;
  settingsSidebar: WebSettingsSidebarProps;
  hasLeftPanel: boolean;
  showDesktopCommunityRail: boolean;
  showDesktopCommunityNav: boolean;
  isGlobalSettings: boolean;
  mainSurface: ReactNode;
  globalOverlays: ReactNode;
};

export function WebShellChromeHost(props: WebShellChromeHostProps) {
  const shellHeader = props.showMobileAppShell ? (
    <WebMobileTopBar {...props.mobileTopBarProps} />
  ) : (
    <WebDesktopShellHeader {...props.desktopHeader} />
  );

  const shellExtras = (
    <>
      {props.workspaceShellPanels}
      <WebMobileCommunityShell communityShell={props.communityShell} />
    </>
  );

  const shellSidePanels = (
    <>
      <WebDesktopCommunityRail communityShell={props.communityShell} />
      <WebSettingsSidebar settingsSidebar={props.settingsSidebar} />

      {props.communityShell.showDesktopCommunityNav ? (
        <CommunityNav
          activeCommunity={props.communityShell.activeCommunity}
          communityTab={props.communityShell.communityTab}
          tabIndicators={props.communityShell.communityTabIndicators}
          canViewMembersActiveCommunity={props.communityShell.canViewMembersActiveCommunity}
          canViewActiveCommunitySettings={props.communityShell.canViewActiveCommunitySettings}
          canViewActiveCommunityPolynet={props.communityShell.canViewActiveCommunityPolynet}
          canManageMembersActiveCommunity={props.communityShell.canManageMembersActiveCommunity}
          canViewActiveCommunityAnalytics={props.communityShell.canViewActiveCommunityAnalytics}
          lockedTabs={props.communityShell.lockedCommunityNavTabs ?? undefined}
          buttonType="button"
          includeButtonTitles
          showPolynetItem={false}
          onCopyCommunityJoinLink={props.communityShell.onCopyCommunityJoinLink}
          onSelectTab={props.communityShell.onSelectCommunityTab}
        />
      ) : null}
    </>
  );

  const { rootClassName, shellClassName } = buildWebShellChromeClassNames({
    showHeaderIslands: props.showHeaderIslands,
    isSessionsDrawerOpen: props.isSessionsDrawerOpen,
    shouldOverlaySessionsDrawer: props.shouldOverlaySessionsDrawer,
    showMobileAppShell: props.showMobileAppShell,
    showMobileSettingsShell: props.showMobileSettingsShell,
    showMobilePublicFunnel: props.showMobilePublicFunnel,
    mobileOverlay: Boolean(props.mobileOverlay),
    showDesktopCommunityRail: props.showDesktopCommunityRail,
    showDesktopCommunityNav: props.showDesktopCommunityNav,
    isGlobalSettings: props.isGlobalSettings,
    hasLeftPanel: props.hasLeftPanel,
  });

  return (
    <div
      className={rootClassName}
      onTouchStart={props.onTouchStart}
      onTouchEnd={props.onTouchEnd}
      onTouchCancel={props.onTouchCancel}
    >
      {shellHeader}
      {shellExtras}

      <div className={shellClassName}>
        {shellSidePanels}
        {props.mainSurface}
      </div>

      {props.globalOverlays}
    </div>
  );
}
