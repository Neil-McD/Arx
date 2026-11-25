import type { CommunityTab } from "../../../../shared/appShellNavigation";
import { buildCommunityTabPath } from "../../../../shared/webAppRouteState";
import {
  getWebCommunityEventsMonthRange,
  type useWebCommunityContentController,
} from "./useWebCommunityContentController";
import type { BuildWebCommunitySurfaceProjectionParams } from "./buildWebCommunitySurfaceProjection";

type CommunityContentController = ReturnType<typeof useWebCommunityContentController>;

export function buildWebCommunityContentProjectionBindings(params: {
  communityContent: CommunityContentController;
  communityResourceModuleId: string | null;
  setCommunityResourceModuleId: (moduleId: string | null) => void;
  session: BuildWebCommunitySurfaceProjectionParams["session"];
  ensureSession: BuildWebCommunitySurfaceProjectionParams["ensureSession"];
  activeCommunity: { id: string; name: string } | null;
  memberPreviewActive: boolean;
  communityTab: CommunityTab;
  communityPodSlug: string | null;
  selectedActiveCommunitySlug: string | null;
  navigateTo: (path: string) => void;
  createRoom: BuildWebCommunitySurfaceProjectionParams["podsProps"]["createRoom"];
  roomAttention: BuildWebCommunitySurfaceProjectionParams["podsProps"]["roomAttention"];
}): Pick<
  BuildWebCommunitySurfaceProjectionParams,
  | "resourcesState"
  | "resourcesActions"
  | "eventsState"
  | "eventsActions"
  | "podsProps"
> {
  const { communityContent } = params;
  return {
    resourcesState: {
      resourceRead: communityContent.resourceRead,
      moduleRead: communityContent.moduleRead,
      isLoadingResources: communityContent.isLoadingResources,
      isLoadingResourceModules: communityContent.isLoadingModules,
      modules: communityContent.modules,
      resources: communityContent.resources,
      selectedModuleId: params.communityResourceModuleId,
    },
    resourcesActions: {
      retryRead: communityContent.retryResourceRead,
      handleSelectModule: params.setCommunityResourceModuleId,
      openNewModuleModal: communityContent.openNewModuleModal,
      handleEditModule: communityContent.handleEditModule,
      handleSetModuleStatus: communityContent.handleSetModuleStatus,
      handleDeleteModule: communityContent.handleDeleteModule,
      handleReorderModules: communityContent.handleReorderModules,
      handleReorderResources: communityContent.handleReorderResources,
      handleMoveResourceToModule: communityContent.handleMoveResourceToModule,
      handleAddCommunitySources: communityContent.handleAddCommunitySources,
      resourceEditor: communityContent.resourceEditor,
      handleDeleteResource: communityContent.handleDeleteResource,
      handleCreateBlankPageDraft: communityContent.handleCreateBlankPageDraft,
    },
    eventsState: {
      events: communityContent.events,
      hasLoadedVisibleRange: communityContent.hasLoadedVisibleEventsRange,
      isLoadingEvents: communityContent.isLoadingEvents,
      eventsError: communityContent.eventsError,
      visibleMonthIso: communityContent.eventsVisibleMonthIso,
    },
    eventsActions: {
      setVisibleMonthIso: communityContent.setEventsVisibleMonthIso,
      // The range the controller loaded, so a reload after midnight asks
      // for the same window it is showing.
      getVisibleRange: (monthIso: string) =>
        monthIso === communityContent.eventsVisibleMonthIso
          ? communityContent.eventsVisibleRange
          : getWebCommunityEventsMonthRange(monthIso),
      reloadEvents: communityContent.reloadActiveEvents,
      saveEvent: communityContent.handleSaveCommunityEvent,
      cancelEvent: communityContent.handleCancelCommunityEvent,
    },
    podsProps: {
      session: params.session,
      ensureSession: params.ensureSession,
      communityId: params.activeCommunity?.id ?? null,
      communityName: params.activeCommunity?.name ?? "this community",
      asMember: params.memberPreviewActive,
      podSlug: params.communityTab === "pods" ? params.communityPodSlug : null,
      onNavigate: (to) => {
        const path =
          to.kind === "room"
            ? buildCommunityTabPath(params.selectedActiveCommunitySlug, "chat", null, null, to.slug)
            : buildCommunityTabPath(
                params.selectedActiveCommunitySlug,
                "pods",
                null,
                null,
                null,
                to.kind === "pod" ? to.slug : null,
              );
        if (path) params.navigateTo(path);
      },
      createRoom: params.createRoom,
      roomAttention: params.roomAttention,
    },
  };
}
