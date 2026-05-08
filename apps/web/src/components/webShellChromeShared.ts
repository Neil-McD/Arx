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

export type MobileOverlay = "agent" | "community" | "community_selector" | null;

export type CommunityLike = {
  id: string;
  slug: string | null;
  name: string;
  avatar_url: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  banner_url?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
};

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
  activeView: AppView;
  userWantsSessions: boolean;
  communityHomeButton: ReactNode;
  onExitPublicFunnelPreview: () => void;
  onBackFromPublicFunnel: () => void;
  onBackFromWorkspaceSettings: () => void;
  onToggleSessions: () => void;
  onStartNewThread: () => void;
  onBackToWorkspace: () => void;
};

export type WebCommunityShellProps = {
  showMobileShell: boolean;
  mobileOverlay: MobileOverlay;
  setMobileOverlay: (value: MobileOverlay) => void;
  activeCommunity: CommunityLike | null;
  communityTab: CommunityTab;
  communityTabIndicators: Partial<Record<CommunityTab, boolean>>;
  canViewMembersActiveCommunity: boolean;
  canViewActiveCommunitySettings: boolean;
  canViewActiveCommunityPolynet: boolean;
  canManageMembersActiveCommunity: boolean;
  canViewActiveCommunityAnalytics: boolean;
  onSelectCommunityTab: (tab: CommunityTab) => void;
  onSelectCommunityTabFromMobile: (tab: CommunityTab) => void;
  onOpenMobileAgentSettings: () => void;
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
  onToggleWorkspaceSettings: () => void;
};

export type WebSettingsSidebarProps = {
  showMobileSettingsShell: boolean;
  isWorkspaceSettings: boolean;
  settingsGroup: SettingsGroup;
  onSelectPage: (page: SettingsPage) => void;
};
