import type {
  ComponentProps,
  ReactNode,
} from "react";
import { WebMobileTopBar } from "./WebMobileTopBar";
import { buildWebShellChromeClassNames } from "../controllers/buildWebShellChromeClassNames";
import { WebDesktopShellHeader } from "./WebDesktopShellHeader";
import { WebCommunityRail } from "./WebCommunityRail";
import { WebMobileCommunityShell } from "./WebMobileCommunityShell";
import { WebMobileCommunityHome } from "./WebMobileCommunityHome";
import { WebCommunityNavSurface } from "./WebCommunityNavSurface";
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
  const isMobileCommunityHome =
    props.showMobileAppShell &&
    !props.showMobileSettingsShell &&
    props.communityShell.mobileRootPage === "community" &&
    props.communityShell.activePage === "community" &&
    props.communityShell.activeView === "community_home";
  const showMobileCommunityRail =
    isMobileCommunityHome && !props.communityShell.forceMobileCommunityRoot;
  const shellHeader = props.showMobileAppShell ? (
    isMobileDedicatedRoot ? null : (
      <WebMobileTopBar
        {...props.mobileTopBarProps}
        hasCommunityRail={showMobileCommunityRail}
      />
    )
  ) : (
    <WebDesktopShellHeader {...props.desktopHeader} />
  );

  const desktopCommunityNav = props.communityShell.showDesktopCommunityNav ? (
    <WebCommunityNavSurface
      communityShell={props.communityShell}
      presentation="desktop"
    />
  ) : null;
  const mainSurface = isMobileCommunityHome ? (
    <WebMobileCommunityHome
      communityShell={props.communityShell}
      hasCommunityRail={showMobileCommunityRail}
    />
  ) : props.mainSurface;
  const desktopSettingsSidebar = (
    <WebSettingsSidebar settingsSidebar={props.settingsSidebar} />
  );
  const desktopFrameMode = desktopCommunityNav
    ? "community"
    : props.isGlobalSettings
      ? "settings"
      : "single";

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
        <WebCommunityRail
          communityShell={props.communityShell}
          presentation="desktop"
        />
        {props.communityShell.showDesktopCommunityRail ? (
          <div
            className={`product-shell-surface product-shell-surface--${desktopFrameMode}`}
          >
            {desktopFrameMode === "settings" ? desktopSettingsSidebar : null}
            {desktopCommunityNav}
            {isMobileDedicatedRoot ? null : mainSurface}
          </div>
        ) : desktopCommunityNav ? (
          <div className="product-shell-surface product-shell-surface--community">
            {desktopCommunityNav}
            {isMobileDedicatedRoot ? null : mainSurface}
          </div>
        ) : (
          <>
            {desktopSettingsSidebar}
            {isMobileDedicatedRoot ? null : mainSurface}
          </>
        )}
      </div>

      {props.globalOverlays}
    </div>
  );
}
