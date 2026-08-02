import type { ReactNode } from "react";
import type {
  AppPage,
  AppView,
  SettingsGroup,
} from "../../../../shared/appShellNavigation";
import type { WebShellChromeHostProps } from "../components/WebShellChromeHost";
import type { MobileMemberFace, MobileOverlay } from "../components/webShellChromeShared";

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
  showMobileAppShell: boolean;
  showMobileSettingsShell: boolean;
  showMobilePublicFunnel: boolean;
  mobileOverlay: MobileOverlay;
  mobileChromeAutoHideEnabled: boolean;
  mobileChromeReadingMode: boolean;
  showMobileShell: boolean;
  mobileShellMode: WebShellChromeHostProps["mobileTopBarProps"]["mode"];
  mobileRootPage: WebShellChromeHostProps["mobileTopBarProps"]["rootPage"];
  mobileThreadPageOpen: boolean;
  forceMobileCommunityRoot: boolean;
  showMobileSettingsIndex: boolean;
  activePage: AppPage;
  activeCommunity: CommunityLike | null;
  activeCommunityAttentionCount: number;
  activeCommunityMemberFaces: MobileMemberFace[];
  activeCommunityMemberCount: number | null;
  canOpenMobileMembers: boolean;
  openMobileDrawer: () => void;
  handleExitMobileSettings: () => void;
  handleCloseMobileThreadPage: () => void;
  handleSelectMobileRootPage: WebShellChromeHostProps["communityShell"]["onSelectMobileRootPage"];
  setMobileOverlay: (value: MobileOverlay) => void;
  isPublicCommunityFunnel: boolean;
  isPublicFunnelPreviewRoute: boolean;
  hasBackTargetSnapshot: boolean;
  backTargetLabel: string | null;
  activeView: AppView;
  directMessagesButton: ReactNode;
  publicFunnelPreviewExitPath: string | null;
  handleTopbarBackFromPublicFunnel: () => void;
  handleTopbarBackFromSettings: () => void;
  handleTopbarBackToCommunity: () => void;
  communityTab: WebShellChromeHostProps["communityShell"]["communityTab"];
  communityTabIndicators: WebShellChromeHostProps["communityShell"]["communityTabIndicators"];
  communityChannels: WebShellChromeHostProps["communityShell"]["communityChannels"];
  selectedCommunityChannelSlug: string;
  communityChannelIndicators: WebShellChromeHostProps["communityShell"]["communityChannelIndicators"];
  handleSelectCommunityChannel: WebShellChromeHostProps["communityShell"]["onSelectCommunityChannel"];
  handleCreateCommunityChannel: WebShellChromeHostProps["communityShell"]["onCreateCommunityChannel"];
  isCreatingCommunityChannel: boolean;
  communityChannelCreateError: string | null;
  clearCommunityChannelCreateError: () => void;
  isAtCommunityChannelLimit: boolean;
  maxActiveCommunityChannels: number;
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
  handleOpenDiscover: () => void;
  openMobileCreateCommunity: () => void;
  openCommunityCreateFlow: () => void;
  communities: CommunityLike[];
  railCommunities: CommunityLike[];
  communityRailAttentionById: WebShellChromeHostProps["communityShell"]["communityRailAttentionById"];
  isLoadingCommunities: boolean;
  selectedActiveCommunitySlug: string | null;
  handleSelectActiveCommunity: (community: CommunityLike) => boolean;
  openCommunityChat: (slug: string) => void;
  communityInitials: (value: string) => string;
  showDesktopCommunityRail: boolean;
  showDesktopCommunityNav: boolean;
  hasCommunityRailMiddleContent: boolean;
  canReorderCommunities: boolean;
  draggingCommunityId: string | null;
  setCommunityRailListElement: WebShellChromeHostProps["communityShell"]["setCommunityRailListElement"];
  getCommunityRailItemBindings: WebShellChromeHostProps["communityShell"]["getCommunityRailItemBindings"];
  handleOpenGlobalSettings: () => void;
  settingsGroup: SettingsGroup;
  setSettingsPage: (page: WebShellChromeHostProps["settingsSidebar"]["onSelectPage"] extends (page: infer T) => void ? T : never) => void;
  hasLeftPanel: boolean;
  isGlobalSettings: boolean;
}): Omit<WebShellChromeHostProps, "mainSurface" | "globalOverlays"> {
  return {
    showMobileAppShell: params.showMobileAppShell,
    showMobileSettingsShell: params.showMobileSettingsShell,
    showMobilePublicFunnel: params.showMobilePublicFunnel,
    mobileOverlay: params.mobileOverlay,
    mobileChromeAutoHideEnabled: params.mobileChromeAutoHideEnabled,
    mobileChromeReadingMode: params.mobileChromeReadingMode,
    mobileTopBarProps: {
      mode: params.showMobileSettingsShell ? "agent" : params.mobileShellMode,
      rootPage: params.forceMobileCommunityRoot
          ? "community"
          : params.mobileRootPage,
      isThreadPage: params.mobileThreadPageOpen,
      showBackButton: params.showMobileSettingsIndex || params.mobileThreadPageOpen,
      showDrawerButton:
        !params.showMobileSettingsShell && !params.mobileThreadPageOpen,
      hasActiveCommunity: Boolean(params.activeCommunity),
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
      canViewMembers: params.canOpenMobileMembers,
      memberFaces: params.activeCommunityMemberFaces,
      memberCount: params.activeCommunityMemberCount,
      onOpenDrawer: params.openMobileDrawer,
      onBack: params.mobileThreadPageOpen
        ? params.handleCloseMobileThreadPage
        : params.showMobileSettingsIndex
          ? params.handleExitMobileSettings
          : null,
      onOpenCommunitySelector: () => params.setMobileOverlay("community_selector"),
      onOpenMembers: () => params.setMobileOverlay("members"),
    },
    desktopHeader: {
      isPublicCommunityFunnel: params.isPublicCommunityFunnel,
      isPublicFunnelPreviewRoute: params.isPublicFunnelPreviewRoute,
      hasBackTargetSnapshot: params.hasBackTargetSnapshot,
      backTargetLabel: params.backTargetLabel,
      activePage: params.activePage,
      directMessagesButton: params.directMessagesButton,
      publicFunnelPreviewExitPath: params.publicFunnelPreviewExitPath,
      onBackFromPublicFunnel: params.handleTopbarBackFromPublicFunnel,
      onBackFromSettings: params.handleTopbarBackFromSettings,
      onBackToCommunity: params.handleTopbarBackToCommunity,
    },
    communityShell: {
      showMobileShell: params.showMobileShell,
      mobileOverlay: params.mobileOverlay,
      mobileRootPage: params.mobileRootPage,
      forceMobileCommunityRoot: params.forceMobileCommunityRoot,
      setMobileOverlay: params.setMobileOverlay,
      onSelectMobileRootPage: params.handleSelectMobileRootPage,
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
      communityChannels: params.communityChannels,
      selectedCommunityChannelSlug: params.selectedCommunityChannelSlug,
      communityChannelIndicators: params.communityChannelIndicators,
      onSelectCommunityChannel: params.handleSelectCommunityChannel,
      onCreateCommunityChannel: params.handleCreateCommunityChannel,
      isCreatingCommunityChannel: params.isCreatingCommunityChannel,
      communityChannelCreateError: params.communityChannelCreateError,
      clearCommunityChannelCreateError: params.clearCommunityChannelCreateError,
      isAtCommunityChannelLimit: params.isAtCommunityChannelLimit,
      maxActiveCommunityChannels: params.maxActiveCommunityChannels,
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
      onOpenCommunityChat: params.openCommunityChat,
      communityInitials: params.communityInitials,
      showDesktopCommunityRail: params.showDesktopCommunityRail,
      showDesktopCommunityNav: params.showDesktopCommunityNav,
      hasCommunityRailMiddleContent: params.hasCommunityRailMiddleContent,
      canReorderCommunities: params.canReorderCommunities,
      draggingCommunityId: params.draggingCommunityId,
      setCommunityRailListElement: params.setCommunityRailListElement,
      getCommunityRailItemBindings: params.getCommunityRailItemBindings,
      onOpenCommunityCreateCta: params.openCommunityCreateFlow,
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
    },
    hasLeftPanel: params.hasLeftPanel,
    showDesktopCommunityRail: params.showDesktopCommunityRail,
    showDesktopCommunityNav: params.showDesktopCommunityNav,
    isGlobalSettings: params.isGlobalSettings,
  };
}
