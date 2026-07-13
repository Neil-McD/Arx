import type { ReactNode, TouchEventHandler } from "react";
import type { AppPage, SettingsGroup } from "../../../../shared/appShellNavigation";
import type { WebShellChromeHostProps } from "../components/WebShellChromeHost";
import type { MobileOverlay } from "../components/webShellChromeShared";

type CommunityLike = {
  id: string;
  slug?: string | null;
  name: string;
  avatar_url?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  banner_url?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
};

export function buildWebShellChromeHostProps(params: {
  showHeaderIslands: boolean;
  showMobileAppShell: boolean;
  showMobileSettingsShell: boolean;
  showMobilePublicFunnel: boolean;
  mobileOverlay: MobileOverlay;
  showMobileShell: boolean;
  handleMobileShellTouchStart: TouchEventHandler<HTMLDivElement>;
  handleMobileShellTouchEnd: TouchEventHandler<HTMLDivElement>;
  handleMobileShellTouchCancel: TouchEventHandler<HTMLDivElement>;
  mobileShellMode: WebShellChromeHostProps["mobileTopBarProps"]["mode"];
  mobileRootPage: WebShellChromeHostProps["mobileTopBarProps"]["rootPage"];
  forceMobileCommunityRoot: boolean;
  mobileSecondaryMode: WebShellChromeHostProps["mobileTopBarProps"]["secondaryMode"];
  showMobileSettingsIndex: boolean;
  activePage: AppPage;
  hasSelectedCommunity: boolean;
  activeCommunity: CommunityLike | null;
  activeCommunityAttentionCount: number;
  openMobileDrawer: () => void;
  handleExitMobileSettings: () => void;
  handleSelectMobileRootPage: WebShellChromeHostProps["mobileTopBarProps"]["onSelectRootPage"];
  setMobileOverlay: (value: MobileOverlay) => void;
  isPublicCommunityFunnel: boolean;
  isPublicFunnelPreviewRoute: boolean;
  hasBackTargetSnapshot: boolean;
  backTargetLabel: string | null;
  activeView: "home" | "settings";
  directMessagesButton: ReactNode;
  handleExitPublicFunnelPreview: () => void;
  handleTopbarBackFromPublicFunnel: () => void;
  handleTopbarBackFromSettings: () => void;
  handleTopbarBackToCommunity: () => void;
  communityTab: WebShellChromeHostProps["communityShell"]["communityTab"];
  communityTabIndicators: WebShellChromeHostProps["communityShell"]["communityTabIndicators"];
  canViewMembersActiveCommunity: boolean;
  canViewActiveCommunitySettings: boolean;
  canViewActiveCommunityPolynet: boolean;
  canManageMembersActiveCommunity: boolean;
  canViewActiveCommunityAnalytics: boolean;
  lockedCommunityNavTabs?: WebShellChromeHostProps["communityShell"]["lockedCommunityNavTabs"];
  handleSelectCommunityTab: (tab: WebShellChromeHostProps["communityShell"]["communityTab"]) => void;
  handleSelectCommunityTabFromMobile: (tab: WebShellChromeHostProps["communityShell"]["communityTab"]) => void;
  onCopyCommunityJoinLink: WebShellChromeHostProps["communityShell"]["onCopyCommunityJoinLink"];
  openMobileAgentSettings: () => void;
  canOpenDirectMessages: boolean;
  directMessagesUnreadCount: number;
  handleOpenDirectMessages: () => void;
  handleOpenDiscover: () => void;
  openMobileCreateCommunity: () => void;
  hasCommunityCreateAccess: boolean;
  openCommunityCreateFlow: () => void;
  communities: CommunityLike[];
  railCommunities: CommunityLike[];
  communityRailAttentionById: WebShellChromeHostProps["communityShell"]["communityRailAttentionById"];
  isLoadingCommunities: boolean;
  selectedActiveCommunitySlug: string | null;
  handleSelectActiveCommunity: (community: CommunityLike) => boolean;
  openCommunityChat: (slug: string, options: { clearUnread: boolean }) => void;
  communityInitials: (value: string) => string;
  showDesktopCommunityRail: boolean;
  showDesktopCommunityNav: boolean;
  hasCommunityRailMiddleContent: boolean;
  canReorderCommunities: boolean;
  draggingCommunityId: string | null;
  setCommunityRailListElement: WebShellChromeHostProps["communityShell"]["setCommunityRailListElement"];
  getCommunityRailItemBindings: WebShellChromeHostProps["communityShell"]["getCommunityRailItemBindings"];
  setIsFreeAccountInfoOpen: (value: boolean) => void;
  handleOpenGlobalSettings: () => void;
  settingsGroup: SettingsGroup;
  setSettingsPage: (page: WebShellChromeHostProps["settingsSidebar"]["onSelectPage"] extends (page: infer T) => void ? T : never) => void;
  showOperatorConsole: boolean;
  openOperatorConsole: () => void;
  hasLeftPanel: boolean;
  isGlobalSettings: boolean;
  mainSurface: ReactNode;
  globalOverlays: ReactNode;
}): WebShellChromeHostProps {
  return {
    showHeaderIslands: params.showHeaderIslands,
    showMobileAppShell: params.showMobileAppShell,
    showMobileSettingsShell: params.showMobileSettingsShell,
    showMobilePublicFunnel: params.showMobilePublicFunnel,
    mobileOverlay: params.mobileOverlay,
    onTouchStart: params.showMobileShell
      ? params.handleMobileShellTouchStart
      : undefined,
    onTouchEnd: params.showMobileShell
      ? params.handleMobileShellTouchEnd
      : undefined,
    onTouchCancel: params.showMobileShell
      ? params.handleMobileShellTouchCancel
      : undefined,
    mobileTopBarProps: {
      mode: params.showMobileSettingsShell ? "agent" : params.mobileShellMode,
      rootPage: params.showMobileSettingsShell
        ? "agent"
        : params.forceMobileCommunityRoot
          ? "community"
          : params.mobileRootPage,
      secondaryMode: params.mobileSecondaryMode,
      showBackButton: params.showMobileSettingsIndex,
      showDrawerButton:
        !params.showMobileSettingsShell && params.activePage !== "discover",
      hasActiveCommunity: Boolean(params.activeCommunity),
      forceCommunityRoot: params.forceMobileCommunityRoot,
      activeCommunityName: params.activeCommunity?.name ?? null,
      activeCommunityAvatarUrl: params.activeCommunity?.avatar_url ?? null,
      activeCommunityAvatarFocusX:
        params.activeCommunity?.avatar_focus_x ?? null,
      activeCommunityAvatarFocusY:
        params.activeCommunity?.avatar_focus_y ?? null,
      activeCommunityAvatarZoom: params.activeCommunity?.avatar_zoom ?? null,
      activeCommunityInitials: params.communityInitials(
        params.activeCommunity?.name ?? "Community",
      ),
      activeCommunityAttentionCount: params.activeCommunityAttentionCount,
      onOpenDrawer: params.openMobileDrawer,
      onBack: params.showMobileSettingsIndex
        ? params.handleExitMobileSettings
        : null,
      onStartNewThread: null,
      onSelectRootPage: params.handleSelectMobileRootPage,
      onOpenCommunitySelector: () => params.setMobileOverlay("community_selector"),
    },
    desktopHeader: {
      isPublicCommunityFunnel: params.isPublicCommunityFunnel,
      isPublicFunnelPreviewRoute: params.isPublicFunnelPreviewRoute,
      hasBackTargetSnapshot: params.hasBackTargetSnapshot,
      backTargetLabel: params.backTargetLabel,
      activePage: params.activePage,
      directMessagesButton: params.directMessagesButton,
      onExitPublicFunnelPreview: params.handleExitPublicFunnelPreview,
      onBackFromPublicFunnel: params.handleTopbarBackFromPublicFunnel,
      onBackFromSettings: params.handleTopbarBackFromSettings,
      onBackToCommunity: params.handleTopbarBackToCommunity,
    },
    communityShell: {
      showMobileShell: params.showMobileShell,
      mobileOverlay: params.mobileOverlay,
      setMobileOverlay: params.setMobileOverlay,
      activeCommunity: params.activeCommunity
        ? {
            id: params.activeCommunity.id,
            slug: params.activeCommunity.slug ?? null,
            name: params.activeCommunity.name,
            avatar_url: params.activeCommunity.avatar_url ?? null,
            avatar_focus_x: params.activeCommunity.avatar_focus_x ?? null,
            avatar_focus_y: params.activeCommunity.avatar_focus_y ?? null,
            avatar_zoom: params.activeCommunity.avatar_zoom ?? null,
            banner_url: params.activeCommunity.banner_url ?? null,
            banner_focus_x: params.activeCommunity.banner_focus_x ?? null,
            banner_focus_y: params.activeCommunity.banner_focus_y ?? null,
            banner_zoom: params.activeCommunity.banner_zoom ?? null,
          }
        : null,
      communityTab: params.communityTab,
      communityTabIndicators: params.communityTabIndicators,
      canViewMembersActiveCommunity: params.canViewMembersActiveCommunity,
      canViewActiveCommunitySettings: params.canViewActiveCommunitySettings,
      canViewActiveCommunityPolynet: params.canViewActiveCommunityPolynet,
      canManageMembersActiveCommunity: params.canManageMembersActiveCommunity,
      canViewActiveCommunityAnalytics: params.canViewActiveCommunityAnalytics,
      lockedCommunityNavTabs: params.lockedCommunityNavTabs ?? null,
      onSelectCommunityTab: params.handleSelectCommunityTab,
      onSelectCommunityTabFromMobile: params.handleSelectCommunityTabFromMobile,
      onCopyCommunityJoinLink: params.onCopyCommunityJoinLink,
      onOpenMobileAgentSettings: params.openMobileAgentSettings,
      canOpenDirectMessages: params.canOpenDirectMessages,
      directMessagesUnreadCount: params.directMessagesUnreadCount,
      onOpenDirectMessages: params.handleOpenDirectMessages,
      onOpenDiscover: params.handleOpenDiscover,
      onOpenMobileCreateCommunity: params.openMobileCreateCommunity,
      communities: params.communities.map((community) => ({
        id: community.id,
        slug: community.slug ?? null,
        name: community.name,
        avatar_url: community.avatar_url ?? null,
        avatar_focus_x: community.avatar_focus_x ?? null,
        avatar_focus_y: community.avatar_focus_y ?? null,
        avatar_zoom: community.avatar_zoom ?? null,
      })),
      railCommunities: params.railCommunities.map((community) => ({
        id: community.id,
        slug: community.slug ?? null,
        name: community.name,
        avatar_url: community.avatar_url ?? null,
        avatar_focus_x: community.avatar_focus_x ?? null,
        avatar_focus_y: community.avatar_focus_y ?? null,
        avatar_zoom: community.avatar_zoom ?? null,
      })),
      communityRailAttentionById: params.communityRailAttentionById,
      isLoadingCommunities: params.isLoadingCommunities,
      selectedActiveCommunitySlug: params.selectedActiveCommunitySlug,
      activePage: params.activePage,
      onSelectActiveCommunity: params.handleSelectActiveCommunity,
      onOpenCommunityChat: (slug) =>
        params.openCommunityChat(slug, { clearUnread: true }),
      communityInitials: params.communityInitials,
      showDesktopCommunityRail: params.showDesktopCommunityRail,
      showDesktopCommunityNav: params.showDesktopCommunityNav,
      hasCommunityRailMiddleContent: params.hasCommunityRailMiddleContent,
      canReorderCommunities: params.canReorderCommunities,
      draggingCommunityId: params.draggingCommunityId,
      setCommunityRailListElement: params.setCommunityRailListElement,
      getCommunityRailItemBindings: params.getCommunityRailItemBindings,
      onOpenCommunityCreateCta: () => {
        if (params.hasCommunityCreateAccess) {
          params.openCommunityCreateFlow();
          return;
        }
        params.setIsFreeAccountInfoOpen(true);
      },
      communityCreateCtaLabel: "+",
      communityCreateCtaTitle: "Create community",
      activeView: params.activeView,
      onOpenGlobalSettings: params.handleOpenGlobalSettings,
    },
    settingsSidebar: {
      showMobileSettingsShell: params.showMobileSettingsShell,
      isGlobalSettings: params.isGlobalSettings,
      settingsGroup: params.settingsGroup,
      onSelectPage: params.setSettingsPage,
      showOperatorConsole: params.showOperatorConsole,
      onOpenOperatorConsole: params.openOperatorConsole,
    },
    hasLeftPanel: params.hasLeftPanel,
    showDesktopCommunityRail: params.showDesktopCommunityRail,
    showDesktopCommunityNav: params.showDesktopCommunityNav,
    isGlobalSettings: params.isGlobalSettings,
    mainSurface: params.mainSurface,
    globalOverlays: params.globalOverlays,
  };
}
