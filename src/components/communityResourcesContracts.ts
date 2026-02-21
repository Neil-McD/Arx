export type CommunityResource = {
  id: string;
  type: "post" | "embed" | "link" | "file";
  title: string;
  body_md: string | null;
  url: string | null;
  pinned: boolean;
  created_at: string;
};

export type CommunityResourcesCapabilities = {
  hasActiveCommunity: boolean;
  activeCommunityName: string | null;
  canCreateResources: boolean;
  canManageResources: boolean;
};

export type CommunityResourcesState = {
  isLoadingResources: boolean;
  resourceSuccess: boolean;
  resources: CommunityResource[];
  openResourceEmbedId: string | null;
};

export type CommunityResourcesActions = {
  setOpenResourceEmbedId: (id: string | null) => void;
  openNewResourceModal: () => void;
  handleEditResource: (resource: CommunityResource) => void;
  handleDeleteResource: (resourceId: string) => Promise<void> | void;
};
