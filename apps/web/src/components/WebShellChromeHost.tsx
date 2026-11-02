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
import { useWebCommunityThemeStyle } from "../controllers/useWebCommunityThemeStyle";
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

// Where a community's own look applies (docs/community-theme-v1.md): its pages
// and its settings, so the Appearance editor wears the community's colours.
// The community rail and everything outside a community keep Polynet's look.
const COMMUNITY_THEMED_DESTINATIONS = new Set([
  "community_home",
  "community_chat",
  "community_resources",
  "community_events",
  "community_agent",
  "community_workflows",
  "community_settings",
  "community_analytics",
]);

export function WebShellChromeHost(props: WebShellChromeHostProps) {
  const communityTheme = useWebCommunityThemeStyle(
    COMMUNITY_THEMED_DESTINATIONS.has(props.communityShell.destination.kind)
      ? props.communityShell.activeCommunity?.id ?? null
      : null,
  );
  const communityThemeAttribute = communityTheme.attribute ?? undefined;
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

  const desktopCommunityNav = props.communityShell.showDesktopCommunityNav ? (
    <WebCommunityNavSurface
      communityShell={props.communityShell}
      presentation="desktop"
    />
  ) : null;
  const mobileGlobalShellContent = isMobileCommunityHome ? (
    <WebCommunityNavSurface
      communityShell={props.communityShell}
      presentation="mobile-home"
    />
  ) : isMobileDedicatedRoot ? null : props.mainSurface;
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
  const unthemedMainSurface = showMobileGlobalShell ? (
    <WebMobileGlobalShell
      communityShell={props.communityShell}
      isCommunityHome={isMobileCommunityHome}
      label={mobileGlobalShellLabel}
    >
      {mobileGlobalShellContent}
    </WebMobileGlobalShell>
  ) : props.mainSurface;
  // On desktop the community surface below carries the theme. Elsewhere the
  // page is wrapped without a box of its own, so layout is unchanged.
  const mainSurface =
    communityThemeAttribute && !desktopCommunityNav ? (
      <div className="community-theme-scope" data-community-theme={communityThemeAttribute}>
        {unthemedMainSurface}
      </div>
    ) : unthemedMainSurface;
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
    showMobileGlobalShell,
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
      props.desktopHeader.hasBackTargetSnapshot,
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
            data-community-theme={desktopCommunityNav ? communityThemeAttribute : undefined}
          >
            {desktopFrameMode === "settings" ? desktopSettingsSidebar : null}
            {desktopCommunityNav}
            {mainSurface}
          </div>
        ) : desktopCommunityNav ? (
          <div className="product-shell-surface product-shell-surface--community" data-community-theme={communityThemeAttribute}>
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

      {communityThemeAttribute ? (
        // Inside a community, Messages and other overlays take its look too.
        <div className="community-theme-scope" data-community-theme={communityThemeAttribute}>
          {props.globalOverlays}
        </div>
      ) : (
        props.globalOverlays
      )}
    </div>
  );
}
