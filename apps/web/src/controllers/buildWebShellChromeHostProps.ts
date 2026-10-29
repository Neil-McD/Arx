import type { ReactNode } from "react";
import type {
  AppPage,
  SettingsGroup,
} from "../../../../shared/appShellNavigation";
import {
  isWebCommunityDetailDestination,
  type WebDestination,
} from "../../../../shared/webAppRouteState";
import type { WebShellChromeHostProps } from "../components/WebShellChromeHost";
import type { MobileMemberFace, MobileOverlay } from "../components/webShellChromeShared";
import type { CommunityShellCommunity } from "../../../../shared/communityTypes";
import type { AppTheme } from "../../../../shared/theme";

type CommunityLike = CommunityShellCommunity;

export function buildWebShellChromeHostProps(params: {
  onOpenCommunityMembers: () => void;
  viewerFace?: WebShellChromeHostProps["communityShell"]["viewerFace"];
  memberNextStep?: ReactNode;
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
  showMobileSettingsIndex: boolean;
  activePage: AppPage;
  destination: WebDestination;
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
  hasBackTargetSnapshot: boolean;
  backTargetLabel: string | null;
  directMessagesButton: ReactNode;
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
  handleSelectCommunityTab: (tab: WebShellChromeHostProps["communityShell"]["communityTab"]) => void;
  handleSelectCommunityTabFromMobile: (tab: WebShellChromeHostProps["communityShell"]["communityTab"]) => void;
  onCopyCommunityJoinLink: WebShellChromeHostProps["communityShell"]["onCopyCommunityJoinLink"];
  canOpenDirectMessages: boolean;
  directMessagesUnreadCount: number;
  communityActivityEvents?: WebShellChromeHostProps["communityShell"]["communityActivityEvents"];
  handleOpenDiscover: () => void;
  openMobileCreateCommunity: () => void;
  openCommunityCreateFlow: () => void;
  communities: CommunityLike[];
  railCommunities: CommunityLike[];
  communityRailAttentionById: WebShellChromeHostProps["communityShell"]["communityRailAttentionById"];
  isLoadingCommunities: boolean;
  selectedActiveCommunitySlug: string | null;
  handleSelectActiveCommunity: (community: CommunityLike) => boolean;
  openCommunityHome: (slug: string) => void;
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
  themeDraftSession?: unknown;
  memberSession?: unknown;
  onCommunityLayoutPositionChange?: WebShellChromeHostProps["onCommunityLayoutPositionChange"];
  onOpenCommunityAgent?: WebShellChromeHostProps["onOpenCommunityAgent"];
  appTheme: AppTheme;
  setAppTheme: (theme: AppTheme) => void;
}): Omit<WebShellChromeHostProps, "mainSurface" | "globalOverlays"> {
  const isMobileCommunityHome =
    params.showMobileAppShell &&
    !params.showMobileSettingsShell &&
    params.mobileRootPage === "community" &&
    (params.destination.kind === "community_home" || params.isPublicCommunityFunnel);
  const isMobileCommunityDetail =
    params.showMobileAppShell &&
    !params.showMobileSettingsShell &&
    isWebCommunityDetailDestination(params.destination) &&
    params.mobileRootPage === "community" &&
    !params.isPublicCommunityFunnel;
  const mobileChannelSlug = params.destination.kind === "community_chat"
    ? params.destination.channelSlug ?? "general"
    : null;
  const selectedMobileChannel = mobileChannelSlug
    ? params.communityChannels.find(
        (channel) => channel.slug === mobileChannelSlug,
      ) ?? null
    : null;
  const mobileChannelLabel = mobileChannelSlug
    ? selectedMobileChannel?.name ?? (
        mobileChannelSlug === "general"
          ? "General"
          : mobileChannelSlug.replace(/[-_]+/g, " ")
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
      rootPage: params.mobileRootPage,
      isThreadPage: params.mobileThreadPageOpen,
      isCommunityHome: isMobileCommunityHome,
      communityDetailLabel: mobileChannelLabel,
      showBackButton:
        params.showMobileSettingsIndex ||
        params.mobileThreadPageOpen ||
        isMobileCommunityDetail,
      showDrawerButton:
        !params.isPublicCommunityFunnel &&
        !params.showMobileSettingsShell &&
        !params.mobileThreadPageOpen &&
        !isMobileCommunityHome &&
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
          : isMobileCommunityDetail
            ? () => {
                const slug = String(params.activeCommunity?.slug ?? "").trim();
                if (slug) params.openCommunityHome(slug);
              }
          : null,
      canOpenCommunitySelector: !params.isPublicCommunityFunnel,
      onOpenCommunitySelector: () => params.setMobileOverlay("community_selector"),
      onOpenMembers: params.isPublicCommunityFunnel
        ? () => params.setMobileOverlay("members")
        : params.onOpenCommunityMembers,
      canOpenCommunitySettings:
        isMobileCommunityHome && params.canViewActiveCommunitySettings,
      onOpenCommunitySettings: isMobileCommunityHome
        ? () => params.handleSelectCommunityTabFromMobile("settings")
        : null,
    },
    desktopHeader: {
      isPublicCommunityFunnel: params.isPublicCommunityFunnel,
      hasBackTargetSnapshot: params.hasBackTargetSnapshot,
      backTargetLabel: params.backTargetLabel,
      activePage: params.activePage,
      directMessagesButton: params.directMessagesButton,
      onBackFromPublicFunnel: params.handleTopbarBackFromPublicFunnel,
      onBackFromSettings: params.handleTopbarBackFromSettings,
      onBackToCommunity: params.handleTopbarBackToCommunity,
    },
    communityShell: {
      showMobileShell: params.showMobileShell,
      showMobileGlobalShell: params.showMobileGlobalShell,
      mobileOverlay: params.mobileOverlay,
      mobileRootPage: params.mobileRootPage,
      setMobileOverlay: params.setMobileOverlay,
      onSelectMobileRootPage: params.handleSelectMobileRootPage,
      activeCommunity: params.activeCommunity,
      destination: params.destination,
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
        : params.onOpenCommunityMembers,
      canViewActiveCommunitySettings: params.canViewActiveCommunitySettings,
      canManageMembersActiveCommunity: params.canManageMembersActiveCommunity,
      canViewActiveCommunityAnalytics: params.canViewActiveCommunityAnalytics,
      isLoadingCommunityAccess: params.isLoadingCommunityAccess,
      onSelectCommunityTab: params.handleSelectCommunityTab,
      onSelectCommunityTabFromMobile: params.handleSelectCommunityTabFromMobile,
      onCopyCommunityJoinLink: params.onCopyCommunityJoinLink,
      memberNextStep: params.memberNextStep,
      canOpenDirectMessages: params.canOpenDirectMessages,
      directMessagesUnreadCount: params.directMessagesUnreadCount,
      directMessagesButton: params.directMessagesButton,
      communityActivityEvents: params.communityActivityEvents,
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
      onOpenGlobalSettings: () => {
        if (params.showMobileGlobalShell) params.prepareMobileGlobalNavigation();
        params.handleOpenGlobalSettings();
      },
      viewerFace: params.viewerFace ?? null,
    },
    settingsSidebar: {
      showMobileSettingsShell: params.showMobileSettingsShell,
      isGlobalSettings: params.isGlobalSettings,
      settingsGroup: params.settingsGroup,
      onSelectPage: params.setSettingsPage,
    },
    hasLeftPanel: params.hasLeftPanel,
    isGlobalSettings: params.isGlobalSettings,
    themeDraftSession: params.themeDraftSession ?? null,
    memberSession: params.memberSession ?? null,
    onCommunityLayoutPositionChange: params.onCommunityLayoutPositionChange,
    onOpenCommunityAgent: params.onOpenCommunityAgent,
    appTheme: params.appTheme,
    onChooseAppTheme: params.setAppTheme,
  };
}
