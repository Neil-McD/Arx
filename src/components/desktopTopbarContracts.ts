export type TopbarCommunity = {
  id: string;
  name: string;
  avatar_url?: string | null;
};

export type DesktopTopbarState = {
  activePage: "workspace" | "community" | "discover";
  activeView: "home" | "settings";
  userWantsSessions: boolean;
  backTargetLabel: string | null;
  defaultBackLabel: string;
  activeCommunity: TopbarCommunity | null;
  unreadCount: number;
};

export type DesktopTopbarActions = {
  getCommunityInitials: (name: string) => string;
  onBackFromWorkspaceSettings: () => void;
  onToggleThreadsPanel: () => void;
  onNewThread: () => void;
  onBackToWorkspace: () => void;
  onOpenCommunity: () => void;
};
