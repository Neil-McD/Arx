import type { ReactNode } from "react";
import type {
  AppPage,
  AppView,
  SettingsGroup,
} from "../../../../shared/appShellNavigation";
import type { WebShellChromeHostProps } from "../components/WebShellChromeHost";
import type { MobileMemberFace, MobileOverlay } from "../components/webShellChromeShared";
import type { CommunityShellCommunity } from "../../../../shared/communityTypes";

type CommunityLike = CommunityShellCommunity;

export function buildWebShellChromeHostProps(params: {
  showMobileAppShell: boolean;
  showMobileSettingsShell: boolean;
  showMobilePublicFunnel: boolean;
  mobileOverlay: MobileOverlay;
  mobileChromeAutoHideEnabled: boolean;
  mobileChromeReadingMode: boolean;
  showMobileShell: boolean;
  showMobileGlobalShell: boolean;
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
  handleExitMobileSettings: () => void;
  handleCloseMobileThreadPage: () => void;
  handleSelectMobileRootPage: WebShellChromeHostProps["communityShell"]["onSelectMobileRootPage"];
  prepareMobileGlobalNavigation: () => void;
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
  isLoadingCommunityChannels: boolean;
  selectedCommunityChannelSlug: string;
  communityChannelIndicators: WebShellChromeHostProps["communityShell"]["communityChannelIndicators"];
  handleSelectCommunityChannel: WebShellChromeHostProps["communityShell"]["onSelectCommunityChannel"];
  handleCreateCommunityChannel: WebShellChromeHostProps["communityShell"]["onCreateCommunityChannel"];
  isCreatingCommunityChannel: boolean;
  communityChannelCreateError: string | null;
  clearCommunityChannelCreateError: () => void;
  isAtCommunityChannelLimit: boolean;
  maxActiveCommunityChannels: number;
  handleReorderCommunityChannels: WebShellChromeHostProps["communityShell"]["onReorderCommunityChannels"];
  isReorderingCommunityChannels: boolean;
  communityChannelReorderError: string | null;
  clearCommunityChannelReorderError: () => void;
  canViewMembersActiveCommunity: boolean;
  canViewActiveCommunitySettings: boolean;
  canManageMembersActiveCommunity: boolean;
  canViewActiveCommunityAnalytics: boolean;
  isLoadingCommunityAccess: boolean;
  lockedCommunityNavTabs?: WebShellChromeHostProps["communityShell"]["lockedCommunityNavTabs"];
  handleSelectCommunityTab: (tab: WebShellChromeHostProps["communityShell"]["communityTab"]) => void;
  handleSelectCommunityTabFromMobile: (tab: WebShellChromeHostProps["communityShell"]["communityTab"]) => void;
  onCopyCommunityJoinLink: WebShellChromeHostProps["communityShell"]["onCopyCommunityJoinLink"];
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
  openCommunityHome: (slug: string) => void;
  openCommunityMembers: (slug: string) => void;
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
  const isMobileCommunityHome =
    params.showMobileAppShell &&
    !params.showMobileSettingsShell &&
    params.activePage === "community" &&
    params.activeView === "community_home" &&
    params.mobileRootPage === "community" &&
    !params.isPublicCommunityFunnel;
  const isMobileCommunityDetail =
    params.showMobileAppShell &&
    !params.showMobileSettingsShell &&
    params.activePage === "community" &&
    params.activeView === "home" &&
    params.mobileRootPage === "community" &&
    !params.isPublicCommunityFunnel;
  const isMobileCommunityMembers =
    params.showMobileAppShell &&
    !params.showMobileSettingsShell &&
    params.activePage === "community" &&
    params.activeView === "community_members" &&
    params.mobileRootPage === "community" &&
    !params.isPublicCommunityFunnel;
  const selectedMobileChannel = isMobileCommunityDetail && params.communityTab === "chat"
    ? params.communityChannels.find(
        (channel) => channel.slug === params.selectedCommunityChannelSlug,
      ) ?? null
    : null;
  const mobileChannelLabel = isMobileCommunityDetail && params.communityTab === "chat"
    ? selectedMobileChannel?.name ?? (
        params.selectedCommunityChannelSlug === "general"
          ? "General"
          : params.selectedCommunityChannelSlug.replace(/[-_]+/g, " ")
      )
    : null;
  return {
    showMobileAppShell: params.showMobileAppShell,
    showMobileSettingsShell: params.showMobileSettingsShell,
    showMobilePublicFunnel: params.showMobilePublicFunnel,
    mobileOverlay: params.mobileOverlay,
    mobileChromeAutoHideEnabled: params.mobileChromeAutoHideEnabled,
    mobileChromeReadingMode: params.mobileChromeReadingMode,
    mobileTopBarProps: {
      mode: params.mobileShellMode,
      rootPage: params.forceMobileCommunityRoot
          ? "community"
          : params.mobileRootPage,
      isThreadPage: params.mobileThreadPageOpen,
      isCommunityHome: isMobileCommunityHome,
      communityDetailLabel: isMobileCommunityMembers ? "Members" : mobileChannelLabel,
      communityDetailIcon: isMobileCommunityMembers ? "members" : "channel",
      showBackButton:
        params.showMobileSettingsIndex ||
        params.mobileThreadPageOpen ||
        isMobileCommunityMembers ||
        isMobileCommunityDetail,
      showDrawerButton:
        !params.isPublicCommunityFunnel &&
        !params.showMobileSettingsShell &&
        !params.mobileThreadPageOpen &&
        !isMobileCommunityHome &&
        !isMobileCommunityMembers &&
        !isMobileCommunityDetail,
      hasActiveCommunity: Boolean(params.activeCommunity),
      activeCommunityId: params.activeCommunity?.id ?? null,
      activeCommunityVisualIdentity:
        params.activeCommunity?.visual_identity ?? null,
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
      onOpenDrawer: () => params.setMobileOverlay("community_selector"),
      onBack: params.mobileThreadPageOpen
        ? params.handleCloseMobileThreadPage
        : params.showMobileSettingsIndex
          ? params.handleExitMobileSettings
          : isMobileCommunityDetail || isMobileCommunityMembers
            ? () => {
                const slug = String(params.activeCommunity?.slug ?? "").trim();
                if (slug) params.openCommunityHome(slug);
              }
          : null,
      canOpenCommunitySelector: !params.isPublicCommunityFunnel,
      onOpenCommunitySelector: () => params.setMobileOverlay("community_selector"),
      onOpenMembers: params.isPublicCommunityFunnel
        ? () => params.setMobileOverlay("members")
        : () => {
            const slug = String(params.activeCommunity?.slug ?? "").trim();
            if (slug) params.openCommunityMembers(slug);
          },
      canOpenCommunitySettings:
        isMobileCommunityHome && params.canViewActiveCommunitySettings,
      onOpenCommunitySettings: isMobileCommunityHome
        ? () => params.handleSelectCommunityTabFromMobile("settings")
        : null,
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
      showMobileGlobalShell: params.showMobileGlobalShell,
      mobileOverlay: params.mobileOverlay,
      mobileRootPage: params.mobileRootPage,
      forceMobileCommunityRoot: params.forceMobileCommunityRoot,
      setMobileOverlay: params.setMobileOverlay,
      onSelectMobileRootPage: params.handleSelectMobileRootPage,
      activeCommunity: params.activeCommunity,
      communityTab: params.communityTab,
      communityTabIndicators: params.communityTabIndicators,
      communityChannels: params.communityChannels,
      isLoadingCommunityChannels: params.isLoadingCommunityChannels,
      selectedCommunityChannelSlug: params.selectedCommunityChannelSlug,
      communityChannelIndicators: params.communityChannelIndicators,
      onSelectCommunityChannel: params.handleSelectCommunityChannel,
      onCreateCommunityChannel: params.handleCreateCommunityChannel,
      isCreatingCommunityChannel: params.isCreatingCommunityChannel,
      communityChannelCreateError: params.communityChannelCreateError,
      clearCommunityChannelCreateError: params.clearCommunityChannelCreateError,
      isAtCommunityChannelLimit: params.isAtCommunityChannelLimit,
      maxActiveCommunityChannels: params.maxActiveCommunityChannels,
      onReorderCommunityChannels: params.handleReorderCommunityChannels,
      isReorderingCommunityChannels: params.isReorderingCommunityChannels,
      communityChannelReorderError: params.communityChannelReorderError,
      clearCommunityChannelReorderError: params.clearCommunityChannelReorderError,
      canViewMembersActiveCommunity: params.canViewMembersActiveCommunity,
      activeCommunityMemberCount: params.activeCommunityMemberCount,
      onOpenMembers: params.isPublicCommunityFunnel
        ? () => params.setMobileOverlay("members")
        : () => {
            const slug = String(params.activeCommunity?.slug ?? "").trim();
            if (slug) params.openCommunityMembers(slug);
          },
      canViewActiveCommunitySettings: params.canViewActiveCommunitySettings,
      canManageMembersActiveCommunity: params.canManageMembersActiveCommunity,
      canViewActiveCommunityAnalytics: params.canViewActiveCommunityAnalytics,
      isLoadingCommunityAccess: params.isLoadingCommunityAccess,
      lockedCommunityNavTabs: params.lockedCommunityNavTabs ?? null,
      onSelectCommunityTab: params.handleSelectCommunityTab,
      onSelectCommunityTabFromMobile: params.handleSelectCommunityTabFromMobile,
      onCopyCommunityJoinLink: params.onCopyCommunityJoinLink,
      canOpenDirectMessages: params.canOpenDirectMessages,
      directMessagesUnreadCount: params.directMessagesUnreadCount,
      onOpenDiscover: () => {
        if (params.showMobileGlobalShell) params.prepareMobileGlobalNavigation();
        params.handleOpenDiscover();
      },
      onOpenMobileCreateCommunity: params.openMobileCreateCommunity,
      communities: params.communities,
      railCommunities: params.railCommunities,
      communityRailAttentionById: params.communityRailAttentionById,
      isLoadingCommunities: params.isLoadingCommunities,
      selectedActiveCommunitySlug: params.selectedActiveCommunitySlug,
      activePage: params.activePage,
      onSelectActiveCommunity: params.handleSelectActiveCommunity,
      onOpenCommunityChat: params.openCommunityChat,
      onOpenCommunityHome: (communitySlug) => {
        if (params.showMobileGlobalShell) params.prepareMobileGlobalNavigation();
        params.openCommunityHome(communitySlug);
      },
      communityInitials: params.communityInitials,
      showDesktopCommunityRail: params.showDesktopCommunityRail,
      showDesktopCommunityNav: params.showDesktopCommunityNav,
      hasCommunityRailMiddleContent: params.hasCommunityRailMiddleContent,
      canReorderCommunities: params.canReorderCommunities,
      draggingCommunityId: params.draggingCommunityId,
      setCommunityRailListElement: params.setCommunityRailListElement,
      getCommunityRailItemBindings: params.getCommunityRailItemBindings,
      onOpenCommunityCreateCta: () => {
        if (params.showMobileGlobalShell) params.prepareMobileGlobalNavigation();
        params.openCommunityCreateFlow();
      },
      communityCreateCtaLabel: "+",
      communityCreateCtaTitle: "Create community",
      activeView: params.activeView,
      onOpenGlobalSettings: () => {
        if (params.showMobileGlobalShell) params.prepareMobileGlobalNavigation();
        params.handleOpenGlobalSettings();
      },
    },
    settingsSidebar: {
      showMobileSettingsShell: params.showMobileSettingsShell,
      isGlobalSettings: params.isGlobalSettings,
      settingsGroup: params.settingsGroup,
      onSelectPage: params.setSettingsPage,
    },
    hasLeftPanel: params.hasLeftPanel,
    isGlobalSettings: params.isGlobalSettings,
  };
}
