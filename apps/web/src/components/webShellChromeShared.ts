import type {
  CSSProperties,
  MouseEventHandler,
  PointerEventHandler,
  ReactNode,
} from "react";
import type {
  AppPage,
  CommunityTab,
  SettingsGroup,
  SettingsPage,
} from "../../../../shared/appShellNavigation";
import type {
  CommunityActivityEvent,
  CommunityPresenceFace,
  CommunityShellCommunity,
} from "../../../../shared/communityTypes";
import type { WebDestination } from "../../../../shared/webAppRouteState";

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
  hasBackTargetSnapshot: boolean;
  backTargetLabel: string | null;
  activePage: AppPage;
  directMessagesButton: ReactNode;
  onBackFromPublicFunnel: () => void;
  onBackFromSettings: () => void;
  onBackToCommunity: () => void;
};

export type WebCommunityShellProps = {
  memberNextStep?: ReactNode;
  showMobileShell: boolean;
  showMobileGlobalShell: boolean;
  mobileOverlay: MobileOverlay;
  mobileRootPage: MobileRootPage;
  setMobileOverlay: (value: MobileOverlay) => void;
  onSelectMobileRootPage: (page: MobileRootPage) => void;
  activeCommunity: CommunityLike | null;
  destination: WebDestination;
  communityTab: CommunityTab;
  communityTabIndicators: Partial<Record<CommunityTab, boolean>>;
  communityChannels: Array<{
    id: string;
    slug: string;
    name: string;
    is_general: boolean;
    position: number;
    access_mode?: "all_members" | "restricted";
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
  onCreateCommunityChannel: (name: string, accessMode?: "all_members" | "restricted") => Promise<unknown>;
  isCreatingCommunityChannel: boolean;
  communityChannelCreateError: string | null;
  clearCommunityChannelCreateError: () => void;
  isAtCommunityChannelLimit: boolean;
  maxActiveCommunityChannels: number;
  onReorderCommunityChannels: (orderedChannelIds: string[], movedChannelId: string) => Promise<boolean> | boolean;
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
  onSelectCommunityTab: (tab: CommunityTab) => void;
  onSelectCommunityTabFromMobile: (tab: CommunityTab) => void;
  onCopyCommunityJoinLink: (joinUrl: string) => Promise<void> | void;
  canOpenDirectMessages: boolean;
  directMessagesUnreadCount: number;
  /* The top tab bar carries the messages button and a notifications list
     itself, so a top-nav layout has the same header tools as Polynet's. */
  directMessagesButton?: ReactNode;
  communityActivityEvents?: CommunityActivityEvent[];
  onOpenDiscover: () => void;
  onOpenMobileCreateCommunity: () => void;
  communities: CommunityLike[];
  railCommunities: CommunityLike[];
  communityRailAttentionById: Record<string, boolean>;
  isLoadingCommunities: boolean;
  selectedActiveCommunitySlug: string | null;
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
  onOpenGlobalSettings: () => void;
  /* The signed-in person, for the profile button at the top right. */
  viewerFace?: { name: string; avatarUrl: string | null; focusX: number; focusY: number; zoom: number } | null;
};

export type WebSettingsSidebarProps = {
  showMobileSettingsShell: boolean;
  isGlobalSettings: boolean;
  settingsGroup: SettingsGroup;
  onSelectPage: (page: SettingsPage) => void;
};
