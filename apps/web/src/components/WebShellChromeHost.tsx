import type {
  ComponentProps,
  ReactNode,
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
  showMobileAppShell: boolean;
  showMobileSettingsShell: boolean;
  showMobilePublicFunnel: boolean;
  mobileOverlay: MobileOverlay;
  mobileChromeAutoHideEnabled: boolean;
  mobileChromeReadingMode: boolean;
  mobileTopBarProps: ComponentProps<typeof WebMobileTopBar>;
  desktopHeader: WebDesktopShellHeaderProps;
  communityShell: WebCommunityShellProps;
  settingsSidebar: WebSettingsSidebarProps;
  hasLeftPanel: boolean;
  isGlobalSettings: boolean;
  mainSurface: ReactNode;
  globalOverlays: ReactNode;
};

export function WebShellChromeHost(props: WebShellChromeHostProps) {
  const isMobileDedicatedRoot =
    props.showMobileAppShell &&
    !props.showMobileSettingsShell &&
    (props.communityShell.mobileRootPage === "agent" ||
      props.communityShell.mobileRootPage === "messages");
  const shellHeader = props.showMobileAppShell ? (
    isMobileDedicatedRoot ? null : (
      <WebMobileTopBar {...props.mobileTopBarProps} />
    )
  ) : (
    <WebDesktopShellHeader {...props.desktopHeader} />
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
          channels={props.communityShell.communityChannels}
          isLoadingChannels={props.communityShell.isLoadingCommunityChannels}
          selectedChannelSlug={props.communityShell.selectedCommunityChannelSlug}
          channelIndicators={props.communityShell.communityChannelIndicators}
          onSelectChannel={props.communityShell.onSelectCommunityChannel}
          onCreateChannel={props.communityShell.onCreateCommunityChannel}
          isCreatingChannel={props.communityShell.isCreatingCommunityChannel}
          createChannelError={props.communityShell.communityChannelCreateError}
          clearCreateChannelError={props.communityShell.clearCommunityChannelCreateError}
          isAtChannelLimit={props.communityShell.isAtCommunityChannelLimit}
          maxActiveChannels={props.communityShell.maxActiveCommunityChannels}
          canViewMembersActiveCommunity={props.communityShell.canViewMembersActiveCommunity}
          canViewActiveCommunitySettings={props.communityShell.canViewActiveCommunitySettings}
          canManageMembersActiveCommunity={props.communityShell.canManageMembersActiveCommunity}
          canViewActiveCommunityAnalytics={props.communityShell.canViewActiveCommunityAnalytics}
          isLoadingAccess={props.communityShell.isLoadingCommunityAccess}
          lockedTabs={props.communityShell.lockedCommunityNavTabs ?? undefined}
          onCopyCommunityJoinLink={props.communityShell.onCopyCommunityJoinLink}
          onSelectTab={props.communityShell.onSelectCommunityTab}
        />
      ) : null}
    </>
  );

  const { rootClassName, shellClassName } = buildWebShellChromeClassNames({
    showMobileAppShell: props.showMobileAppShell,
    showMobileSettingsShell: props.showMobileSettingsShell,
    showMobilePublicFunnel: props.showMobilePublicFunnel,
    mobileOverlay: Boolean(props.mobileOverlay),
    mobileChromeAutoHideEnabled: props.mobileChromeAutoHideEnabled,
    mobileChromeReadingMode: props.mobileChromeReadingMode,
    showDesktopCommunityRail: props.communityShell.showDesktopCommunityRail,
    showDesktopCommunityNav: props.communityShell.showDesktopCommunityNav,
    isGlobalSettings: props.isGlobalSettings,
    hasLeftPanel: props.hasLeftPanel,
    reserveCommunityNavTopbarSpace:
      !props.showMobileAppShell &&
      props.desktopHeader.isPublicCommunityFunnel &&
      (props.desktopHeader.isPublicFunnelPreviewRoute ||
        props.desktopHeader.hasBackTargetSnapshot),
  });

  return (
    <div className={rootClassName}>
      {shellHeader}
      <WebMobileCommunityShell communityShell={props.communityShell} />

      <div className={shellClassName}>
        {shellSidePanels}
        {isMobileDedicatedRoot ? null : props.mainSurface}
      </div>

      {props.globalOverlays}
    </div>
  );
}
