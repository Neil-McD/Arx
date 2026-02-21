import type { CommunityResource } from "./communityResourcesContracts";

export type LibraryResource = CommunityResource;

export type CommunityLibraryCapabilities = {
  hasActiveCommunity: boolean;
};

export type CommunityLibraryState = {
  isLoadingResources: boolean;
  libraryResources: LibraryResource[];
  selectedLibraryResourceId: string | null;
  selectedLibraryResource: LibraryResource | null;
};

export type CommunityLibraryActions = {
  setSelectedLibraryResourceId: (id: string) => void;
};
