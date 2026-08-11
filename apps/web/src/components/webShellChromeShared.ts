import type {
  CSSProperties,
  MouseEventHandler,
  PointerEventHandler,
  ReactNode,
} from "react";
import type {
  AppPage,
  AppView,
  CommunityTab,
  SettingsGroup,
  SettingsPage,
} from "../../../../shared/appShellNavigation";
import type {
  CommunityPresenceFace,
  CommunityShellCommunity,
} from "../../../../shared/communityTypes";

export type MobileOverlay =
  | "community_selector"
  | "members"
  | null;
export type MobileRootPage = "agent" | "community" | "messages";

export type MobileMemberFace = CommunityPresenceFace;

export type CommunityLike = CommunityShellCommunity;

export type CommunityRailBindings = {
  ref: (node: HTMLButtonElement | null) => void;
  onClickCapture?: MouseEventHandler<HTMLButtonElement>;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  style?: CSSProperties;
};

export type WebDesktopShellHeaderProps = {
  isPublicCommunityFunnel: boolean;
  isPublicFunnelPreviewRoute: boolean;
  hasBackTargetSnapshot: boolean;
  backTargetLabel: string | null;
  activePage: AppPage;
  directMessagesButton: ReactNode;
  publicFunnelPreviewExitPath: string | null;
  onBackFromPublicFunnel: () => void;
  onBackFromSettings: () => void;
  onBackToCommunity: () => void;
};

export type WebCommunityShellProps = {
  showMobileShell: boolean;
  showMobileGlobalShell: boolean;
  mobileOverlay: MobileOverlay;
  mobileRootPage: MobileRootPage;
  forceMobileCommunityRoot: boolean;
  setMobileOverlay: (value: MobileOverlay) => void;
  onSelectMobileRootPage: (page: MobileRootPage) => void;
  activeCommunity: CommunityLike | null;
  communityTab: CommunityTab;
  communityTabIndicators: Partial<Record<CommunityTab, boolean>>;
  communityChannels: Array<{
    id: string;
    slug: string;
    name: string;
    is_general: boolean;
    position: number;
  }>;
  isLoadingCommunityChannels: boolean;
  selectedCommunityChannelSlug: string;
  communityChannelIndicators: Record<string, { chat: boolean; mentions: boolean }>;
  onSelectCommunityChannel: (channel: {
    id: string;
    slug: string;
    name: string;
    is_general: boolean;
    position: number;
  }) => void;
  onCreateCommunityChannel: (name: string) => Promise<unknown>;
  isCreatingCommunityChannel: boolean;
  communityChannelCreateError: string | null;
  clearCommunityChannelCreateError: () => void;
  isAtCommunityChannelLimit: boolean;
  maxActiveCommunityChannels: number;
  onReorderCommunityChannels: (orderedChannelIds: string[]) => Promise<boolean> | boolean;
  isReorderingCommunityChannels: boolean;
  communityChannelReorderError: string | null;
  clearCommunityChannelReorderError: () => void;
  canViewMembersActiveCommunity: boolean;
  activeCommunityMemberCount: number | null;
  onOpenMembers: () => void;
  canViewActiveCommunitySettings: boolean;
  canManageMembersActiveCommunity: boolean;
  canViewActiveCommunityAnalytics: boolean;
  isLoadingCommunityAccess: boolean;
  /* Visitor lens: tabs render locked instead of hidden. */
  lockedCommunityNavTabs?: Partial<Record<CommunityTab, boolean>> | null;
  onSelectCommunityTab: (tab: CommunityTab) => void;
  onSelectCommunityTabFromMobile: (tab: CommunityTab) => void;
  onCopyCommunityJoinLink: (joinUrl: string) => Promise<void> | void;
  canOpenDirectMessages: boolean;
  directMessagesUnreadCount: number;
  onOpenDiscover: () => void;
  onOpenMobileCreateCommunity: () => void;
  communities: CommunityLike[];
  railCommunities: CommunityLike[];
  communityRailAttentionById: Record<string, boolean>;
  isLoadingCommunities: boolean;
  selectedActiveCommunitySlug: string | null;
  activePage: AppPage;
  onSelectActiveCommunity: (community: CommunityLike) => boolean;
  onOpenCommunityChat: (slug: string) => void;
  onOpenCommunityHome: (slug: string) => void;
  communityInitials: (value: string) => string;
  showDesktopCommunityRail: boolean;
  showDesktopCommunityNav: boolean;
  hasCommunityRailMiddleContent: boolean;
  canReorderCommunities: boolean;
  draggingCommunityId: string | null;
  setCommunityRailListElement: (node: HTMLDivElement | null) => void;
  getCommunityRailItemBindings: (communityId: string) => CommunityRailBindings;
  onOpenCommunityCreateCta: () => void;
  communityCreateCtaLabel: string;
  communityCreateCtaTitle: string;
  activeView: AppView;
  onOpenGlobalSettings: () => void;
};

export type WebSettingsSidebarProps = {
  showMobileSettingsShell: boolean;
  isGlobalSettings: boolean;
  settingsGroup: SettingsGroup;
  onSelectPage: (page: SettingsPage) => void;
};
