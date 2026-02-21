export type CommunityRailCommunity = {
  id: string;
  name: string;
  avatar_url?: string | null;
};

export type DesktopCommunityRailState = {
  activePage: "workspace" | "community" | "discover";
  activeView: "home" | "settings";
  communities: CommunityRailCommunity[];
  activeCommunityId: string | null;
  emptyMessage: string | null;
};

export type DesktopCommunityRailActions = {
  getCommunityInitials: (name: string) => string;
  onOpenDiscover: () => void;
  onSelectCommunity: (communityId: string) => void;
  onMoveCommunityToIndex?: (draggedCommunityId: string, targetIndex: number) => void;
  onOpenCreateCommunity: () => void;
  onToggleSettings: () => void;
};
