export type CommunityResource = {
  id: string;
  module_id: string | null;
  type: "post" | "embed" | "link" | "file";
  title: string;
  body_md: string | null;
  url: string | null;
  pinned: boolean;
  sort_order: number | null;
  created_at: string;
};

export type CommunityResourceModule = {
  id: string;
  name: string;
  description_md: string | null;
  banner_url: string | null;
  banner_storage_id?: string | null;
  banner_focus_x: number | null;
  banner_focus_y: number | null;
  banner_zoom: number | null;
  sort_order: number;
  is_virtual?: boolean;
};

export type CommunityResourcesCapabilities = {
  hasActiveCommunity: boolean;
  activeCommunityName: string | null;
  canOperateResources: boolean;
};

export type CommunityResourcesState = {
  isLoadingResources: boolean;
  isLoadingResourceModules: boolean;
  modules: CommunityResourceModule[];
  resources: CommunityResource[];
  selectedModuleId: string | null;
  openResourceEmbedId: string | null;
};

export type CommunityResourcesActions = {
  setOpenResourceEmbedId: (id: string | null) => void;
  handleSelectModule: (moduleId: string | null) => void;
  openNewModuleModal: () => void;
  handleEditModule: (module: CommunityResourceModule) => void;
  handleDeleteModule: (moduleId: string) => Promise<boolean> | boolean;
  handleReorderModules: (moduleIds: string[]) => Promise<boolean> | boolean;
  handleReorderResources: (moduleId: string | null, resourceIds: string[]) => Promise<boolean> | boolean;
  openNewResourceModal: (moduleId?: string | null) => void;
  handleEditResource: (resource: CommunityResource) => void;
  handleDeleteResource: (resourceId: string) => Promise<boolean> | boolean;
};
