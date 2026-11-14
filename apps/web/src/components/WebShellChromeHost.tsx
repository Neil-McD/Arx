import { WebSettingsNavV1 } from "./WebSettingsNavV1";
import type {
  ComponentProps,
  ReactNode,
} from "react";
import { WebMobileTopBar } from "./WebMobileTopBar";
import { buildWebShellChromeClassNames } from "../controllers/buildWebShellChromeClassNames";
import { WebDesktopShellHeader } from "./WebDesktopShellHeader";
import { WebCommunityRail } from "./WebCommunityRail";
import { WebMobileCommunityShell } from "./WebMobileCommunityShell";
import { WebMobileGlobalShell } from "./WebMobileGlobalShell";
import { WebCommunityNavSurface } from "./WebCommunityNavSurface";
import { WebSettingsSidebar } from "./WebSettingsSidebar";
import { isDesignV1Active } from "../../../../shared/designSystem";
import { WebGlobalNavV1 } from "./WebGlobalNavV1";
import type {
  MobileOverlay,
  WebCommunityShellProps,
  WebDesktopShellHeaderProps,
  WebSettingsSidebarProps,
} from "./webShellChromeShared";

export type WebShellChromeHostProps = {
  showMobileAppShell: boolean;
  showMobileSettingsShell: boolean;
  showMobileSettingsIndex?: boolean;
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
    (props.communityShell.mobileRootPage === "agent" ||
      props.communityShell.mobileRootPage === "messages");
  const isMobileCommunityHome =
    props.showMobileAppShell &&
    !props.showMobileSettingsShell &&
    props.communityShell.mobileRootPage === "community" &&
    props.communityShell.destination.kind === "community_home";
  const showMobileGlobalShell = props.communityShell.showMobileGlobalShell;
  const isMobileDiscoverRoot =
    props.showMobileAppShell &&
    showMobileGlobalShell &&
    props.communityShell.destination.kind === "discover";
  const shellHeader = props.showMobileAppShell ? (
    isMobileDedicatedRoot || isMobileDiscoverRoot ? null : (
      <WebMobileTopBar
        {...props.mobileTopBarProps}
        hasCommunityRail={showMobileGlobalShell}
      />
    )
  ) : (
    <WebDesktopShellHeader {...props.desktopHeader} />
  );

  // Design v1, one Settings page: on the community's settings the left column
  // is the Settings sidebar (the same one your own settings show). It doesn't
  // wait for your account to load (its footer does), or a refresh would show
  // the community's own column first.
  const communitySettingsNav = props.communityShell.showDesktopCommunityNav && !props.showMobileAppShell && isDesignV1Active()
    && props.communityShell.destination.kind === "community_settings";
  const desktopCommunityNav = props.communityShell.showDesktopCommunityNav ? (
    communitySettingsNav ? (
      <WebSettingsNavV1
        communityShell={props.communityShell}
        settingsSidebar={props.settingsSidebar}
        current={{ kind: "community", pane: props.communityShell.communitySettingsPane ?? "community" }}
        onBack={() => {
          const slug = String(props.communityShell.activeCommunity?.slug ?? "").trim();
          if (slug) props.communityShell.onOpenCommunityHome(slug);
          else props.desktopHeader.onBackToCommunity();
        }}
      />
    ) : (
    <WebCommunityNavSurface
      communityShell={props.communityShell}
      presentation="desktop"
    />
    )
  ) : null;
  // Design v1 on a phone: Settings' index is the same Settings sidebar as
  // desktop, full width (you, then the community's sections); a section
  // opens its page of rows.
  const isPhoneV1 = isDesignV1Active() && props.showMobileAppShell;
  const isPhoneSettings = isPhoneV1 && (props.isGlobalSettings || props.communityShell.destination.kind === "community_settings");
  const phoneSettingsIndex = isPhoneV1 && props.showMobileSettingsIndex ? (
    <WebSettingsNavV1
      communityShell={props.communityShell}
      settingsSidebar={props.settingsSidebar}
      current={{ kind: "index" }}
      onBack={() => {
        const slug = String(props.communityShell.activeCommunity?.slug ?? "").trim();
        if (slug) props.communityShell.onOpenCommunityHome(slug);
        else props.desktopHeader.onBackToCommunity();
      }}
    />
  ) : null;
  const mobileGlobalShellContent = phoneSettingsIndex ?? (isMobileCommunityHome ? (
    <WebCommunityNavSurface
      communityShell={props.communityShell}
      presentation="mobile-home"
    />
  ) : isMobileDedicatedRoot ? null : props.mainSurface);
  const mobileGlobalShellLabel = isMobileCommunityHome
    ? "Community home"
    : props.communityShell.mobileRootPage === "agent"
      ? "Polynet AI"
      : props.communityShell.mobileRootPage === "messages"
        ? "Direct messages"
        : props.communityShell.destination.kind === "global_settings"
          ? "Settings"
          : props.communityShell.destination.kind === "community_settings"
            ? "Community settings"
          : props.communityShell.destination.kind === "discover"
            ? "Discover"
            : "Polynet";
  const mainSurface = showMobileGlobalShell ? (
    <WebMobileGlobalShell
      communityShell={props.communityShell}
      isCommunityHome={isMobileCommunityHome}
      hideRail={isPhoneV1 && (isMobileCommunityHome || isPhoneSettings)}
      label={mobileGlobalShellLabel}
    >
      {mobileGlobalShellContent}
    </WebMobileGlobalShell>
  ) : props.mainSurface;
  const desktopSettingsSidebar = (
    <WebSettingsSidebar settingsSidebar={props.settingsSidebar} />
  );
  // Design system v1: inside a community there is one left column and no rail.
  // Switching community lives in that column's banner (WebCommunitySwitcher).
  // Discover and your own settings get the same frame, with their own left
  // column in the rail's place.
  const destinationKind = props.communityShell.destination.kind;
  const globalNavMode =
    !props.showMobileAppShell &&
    isDesignV1Active() &&
    !desktopCommunityNav &&
    props.communityShell.showDesktopCommunityRail &&
    // Settings doesn't wait for your account (the sidebar's footer does), or a
    // refresh would show the old rail first. Discover waits: signed out, it's
    // a different page.
    (props.communityShell.account || destinationKind === "global_settings")
      ? destinationKind === "discover"
        ? ("discover" as const)
        : destinationKind === "global_settings"
          ? ("settings" as const)
          : null
      : null;
  const showDesktopCommunityRail =
    props.communityShell.showDesktopCommunityRail &&
    !((desktopCommunityNav || globalNavMode) && isDesignV1Active());
  const desktopFrameMode = desktopCommunityNav
    ? "community"
    : props.isGlobalSettings
      ? "settings"
      : "single";

  const { rootClassName, shellClassName } = buildWebShellChromeClassNames({
    showMobileAppShell: props.showMobileAppShell,
    showMobileSettingsShell: props.showMobileSettingsShell,
    showMobileGlobalShell,
    showMobilePublicFunnel: props.showMobilePublicFunnel,
    mobileOverlay: Boolean(props.mobileOverlay),
    mobileChromeAutoHideEnabled: props.mobileChromeAutoHideEnabled,
    mobileChromeReadingMode: props.mobileChromeReadingMode,
    showDesktopCommunityRail,
    showDesktopCommunityNav: props.communityShell.showDesktopCommunityNav || Boolean(globalNavMode),
    isGlobalSettings: props.isGlobalSettings,
    hasLeftPanel: props.hasLeftPanel || Boolean(globalNavMode),
    reserveCommunityNavTopbarSpace:
      !props.showMobileAppShell &&
      props.desktopHeader.isPublicCommunityFunnel &&
      props.desktopHeader.hasBackTargetSnapshot,
  });

  return (
    <div className={rootClassName}>
      {shellHeader}
      <WebMobileCommunityShell communityShell={props.communityShell} />

      <div className={shellClassName}>
        {showDesktopCommunityRail ? (
          <WebCommunityRail
            communityShell={props.communityShell}
            presentation="desktop"
          />
        ) : null}
        {showDesktopCommunityRail ? (
          <div
            className={`product-shell-surface product-shell-surface--${desktopFrameMode}`}
          >
            {desktopFrameMode === "settings" ? desktopSettingsSidebar : null}
            {desktopCommunityNav}
            {mainSurface}
          </div>
        ) : globalNavMode ? (
          <div className="product-shell-surface product-shell-surface--community">
            <WebGlobalNavV1
              mode={globalNavMode}
              communityShell={props.communityShell}
              settingsSidebar={props.settingsSidebar}
              onBackFromSettings={props.desktopHeader.onBackFromSettings}
            />
            {mainSurface}
          </div>
        ) : desktopCommunityNav ? (
          <div className="product-shell-surface product-shell-surface--community">
            {desktopCommunityNav}
            {mainSurface}
          </div>
        ) : (
          <>
            {desktopSettingsSidebar}
            {mainSurface}
          </>
        )}
      </div>

      {props.globalOverlays}
    </div>
  );
}
