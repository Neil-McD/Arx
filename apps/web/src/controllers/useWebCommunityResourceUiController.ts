import { useState, type ComponentProps, type Dispatch, type DragEvent, type SetStateAction } from "react";

import { readBannerFileAsWideDataUrlWithinLimit } from "../../../../shared/imageTransforms";
import {
  useCommunityResourceController,
  type CommunitySourceIntakePhase,
  type CommunitySourceIntakeResult,
  type ResourceReadState,
} from "../../../../shared/useCommunityResourceController";
import { useCommunityResourceEditorController } from "../../../../shared/useCommunityResourceEditorController";
import { WebDeleteResourceModuleModal } from "../components/WebDeleteResourceModuleModal";
import { WebCommunityResourceModuleModal } from "../components/WebCommunityResourceModuleModal";
import type { CommunityResourceRestoreTarget, CommunityResourceVersion } from "../components/communityResourcesContracts";

type SessionLike = unknown;

const MODULE_BANNER_DATA_URL_CHAR_LIMIT = 1_200_000;

type ResourceLike = {
  id: string;
  module_id?: string | null;
  type: string;
  resource_role?: "page" | "source";
  resource_status?: "draft" | "review" | "published" | "processing" | "failed";
  title: string;
  body_md: string | null;
  url: string | null;
  pinned: boolean;
  sort_order?: number | null;
  created_at?: string;
};

type ResourceModuleLike = {
  id: string;
  name: string;
  module_status?: "draft" | "live";
  description_md?: string | null;
  banner_url?: string | null;
  banner_storage_id?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
  lesson_style?: "article" | "video" | null;
  sort_order?: number;
};

type UseWebCommunityResourceUiControllerParams<
  SessionT extends SessionLike,
  ResourceT extends ResourceLike,
  ResourceModuleT extends ResourceModuleLike,
> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  ensureSession?: (session?: SessionT | null) => Promise<SessionT | null>;
  parseEmbedUrl: (url: string) => unknown;
  communityResources: ResourceT[];
  communityResourceModules: ResourceModuleT[];
  setCommunityResources: Dispatch<SetStateAction<ResourceT[]>>;
  setCommunityResourceModules: Dispatch<SetStateAction<ResourceModuleT[]>>;
};

export type UseWebCommunityResourceUiControllerResult<
  SessionT extends SessionLike,
  ResourceT extends ResourceLike,
  ResourceModuleT extends ResourceModuleLike,
> = {
  setEditingResourceId: Dispatch<SetStateAction<string | null>>;
  resourceRead: ResourceReadState;
  moduleRead: ResourceReadState;
  refreshCommunityResources: (communityId: string, session: SessionT, collections?: ("resources" | "modules")[]) => Promise<void>;
  setResourceTitleInput: Dispatch<SetStateAction<string>>;
  setResourceUrlInput: Dispatch<SetStateAction<string>>;
  setResourceBodyInput: Dispatch<SetStateAction<string>>;
  setResourcePinnedInput: Dispatch<SetStateAction<boolean>>;
  setResourceModuleIdInput: Dispatch<SetStateAction<string | null>>;
  setResourceError: Dispatch<SetStateAction<string | null>>;
  setIsSavingResource: Dispatch<SetStateAction<boolean>>;
  openNewModuleModal: () => void;
  handleEditModule: (module: ResourceModuleT) => void;
  handleSetModuleStatus: (module: ResourceModuleT, status: "draft" | "live") => Promise<boolean>;
  handleSetModuleLessonStyle: (module: ResourceModuleT, lessonStyle: "article" | "video") => Promise<boolean>;
  handleDeleteModule: (moduleId: string) => Promise<boolean>;
  handleReorderModules: (moduleIds: string[]) => Promise<boolean>;
  handleReorderResources: (moduleId: string | null, resourceIds: string[]) => Promise<boolean>;
  handleMoveResourceToModule: (
    resourceId: string,
    targetModuleId: string | null,
    beforeResourceId?: string | null,
  ) => Promise<boolean>;
  handleAddCommunitySources: (input: {
    links: string[];
    files: File[];
    retryExisting?: boolean;
    onPhase?: (phase: CommunitySourceIntakePhase) => void;
  }) => Promise<CommunitySourceIntakeResult | null>;
  resourceEditor: {
    editingResourceId: string | null;
    titleInput: string;
    urlInput: string;
    bodyInput: string;
    pinnedInput: boolean;
    roleInput: "page" | "source";
    error: string | null;
    isSaving: boolean;
    beginInlineEditResource: (resource: ResourceT) => void;
    cancelInlineEditResource: () => void;
    saveInlineEditResource: (options?: { keepEditing?: boolean }) => Promise<boolean>;
    uploadImage: (file: File) => Promise<string>;
    listVersions: (resourceId: string) => Promise<CommunityResourceVersion[]>;
    restoreVersion: (target: CommunityResourceRestoreTarget) => Promise<boolean>;
    onChangeTitle: (value: string) => void;
    onChangeUrl: (value: string) => void;
    onChangeBody: (value: string) => void;
    onChangePinned: (value: boolean) => void;
  };
  handleDeleteResource: (resourceId: string) => Promise<boolean>;
  handleCreateBlankPageDraft: (moduleId: string, lesson?: { order: number }) => Promise<ResourceT | null>;
  resourceModuleModalProps: ComponentProps<typeof WebCommunityResourceModuleModal>;
  resourceModuleDeleteModalProps: ComponentProps<typeof WebDeleteResourceModuleModal>;
  loadCommunityResourceModules: (communityId: string, session: SessionT) => Promise<void>;
  loadCommunityResources: (communityId: string, session: SessionT) => Promise<void>;
};

export function useWebCommunityResourceUiController<
  SessionT extends SessionLike,
  ResourceT extends ResourceLike,
  ResourceModuleT extends ResourceModuleLike,
>(
  params: UseWebCommunityResourceUiControllerParams<SessionT, ResourceT, ResourceModuleT>,
): UseWebCommunityResourceUiControllerResult<SessionT, ResourceT, ResourceModuleT> {
  const [showResourceModuleModal, setShowResourceModuleModal] = useState(false);
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [editingResourceModuleId, setEditingResourceModuleId] = useState<string | null>(null);
  const [editingResourceModuleBannerStorageId, setEditingResourceModuleBannerStorageId] = useState<string | null>(null);
  const [editingResourceModuleBannerUrl, setEditingResourceModuleBannerUrl] = useState<string | null>(null);
  const [resourceTitleInput, setResourceTitleInput] = useState("");
  const [resourceUrlInput, setResourceUrlInput] = useState("");
  const [resourceBodyInput, setResourceBodyInput] = useState("");
  const [resourcePinnedInput, setResourcePinnedInput] = useState(false);
  const [resourceRoleInput, setResourceRoleInput] = useState<"page" | "source">("page");
  const [resourceStatusInput, setResourceStatusInput] =
    useState<"draft" | "review" | "published" | "processing" | "failed">("draft");
  const [resourceModuleIdInput, setResourceModuleIdInput] = useState<string | null>(null);
  const [moduleNameInput, setModuleNameInput] = useState("");
  const [moduleDescriptionInput, setModuleDescriptionInput] = useState("");
  const [moduleBannerUrlInput, setModuleBannerUrlInput] = useState("");
  const [moduleBannerFocusX, setModuleBannerFocusX] = useState(0.5);
  const [moduleBannerFocusY, setModuleBannerFocusY] = useState(0.5);
  const [moduleBannerZoom, setModuleBannerZoom] = useState(1);
  const [moduleLessonStyleInput, setModuleLessonStyleInput] = useState<"article" | "video">("article");
  const [isModuleBannerDragOver, setIsModuleBannerDragOver] = useState(false);
  const [isProcessingModuleBanner, setIsProcessingModuleBanner] = useState(false);
  const [moduleBannerUploadError, setModuleBannerUploadError] = useState<string | null>(null);
  const [isModuleBannerFocusModalOpen, setIsModuleBannerFocusModalOpen] = useState(false);
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [resourceModuleError, setResourceModuleError] = useState<string | null>(null);
  const [resourceModuleDeleteError, setResourceModuleDeleteError] = useState<string | null>(null);
  const [isSavingResource, setIsSavingResource] = useState(false);
  const [isSavingResourceModule, setIsSavingResourceModule] = useState(false);
  const [pendingDeleteResourceModuleId, setPendingDeleteResourceModuleId] = useState<string | null>(null);
  const [moduleDeleteNameInput, setModuleDeleteNameInput] = useState("");
  const [moduleDeleteWordInput, setModuleDeleteWordInput] = useState("");
  const [isDeletingResourceModule, setIsDeletingResourceModule] = useState(false);

  const {
    resourceRead,
    moduleRead,
    refreshCommunityResources,
    loadCommunityResourceModules,
    loadCommunityResources,
    handleSaveCommunityResourceModule,
    handleSetCommunityResourceModuleStatus,
    handleSetCommunityResourceModuleLessonStyle,
    handleListCommunityResourceRevisions,
    handleRestoreCommunityResource,
    handleDeleteCommunityResourceModule,
    handleReorderCommunityResourceModules,
    handleReorderCommunityResources,
    handleMoveCommunityResourceToModule,
    handleSaveCommunityResource,
    handleUploadCommunityResourceImage,
    handleDeleteResource,
    handleCreateBlankPageDraft,
    handleAddCommunitySources,
  } = useCommunityResourceController<SessionT, ResourceT, ResourceModuleT>({
    activeCommunityId: params.activeCommunityId,
    session: params.session,
    ensureSession: params.ensureSession,
    parseEmbedUrl: params.parseEmbedUrl,
    includeCommunityIdOnPatch: false,
    includeFileKeyOnSave: false,
    clearErrorWhenEditingDeleted: true,
    saveFailureMessage: "Failed to save resource.",
    deleteFailureMessage: "Failed to delete resource.",
    resourceTitleInput,
    resourceUrlInput,
    resourceBodyInput,
    resourcePinnedInput,
    resourceRoleInput,
    resourceStatusInput,
    resourceModuleIdInput,
    moduleNameInput,
    moduleDescriptionInput,
    moduleBannerUrlInput,
    moduleBannerFocusX,
    moduleBannerFocusY,
    moduleBannerZoom,
    moduleLessonStyleInput,
    editingResourceId,
    editingResourceModuleId,
    editingResourceModuleBannerStorageId,
    editingResourceModuleBannerUrl,
    communityResources: params.communityResources,
    setCommunityResources: params.setCommunityResources,
    setCommunityResourceModules: params.setCommunityResourceModules,
    setIsSavingResource,
    setIsSavingResourceModule,
    setResourceError,
    setResourceModuleError,
    setShowResourceModuleModal,
    setEditingResourceId,
    setEditingResourceModuleId,
    setEditingResourceModuleBannerStorageId,
    setEditingResourceModuleBannerUrl,
    setResourceTitleInput,
    setResourceUrlInput,
    setResourceBodyInput,
    setResourcePinnedInput,
    setResourceRoleInput,
    setResourceStatusInput,
    setResourceModuleIdInput,
    setModuleNameInput,
    setModuleDescriptionInput,
    setModuleBannerUrlInput,
    setModuleBannerFocusX,
    setModuleBannerFocusY,
    setModuleBannerZoom,
    setModuleLessonStyleInput,
  });

  const {
    resetResourceForm,
    handleEditResource,
  } = useCommunityResourceEditorController<ResourceT>({
    setEditingResourceId,
    setResourceTitleInput,
    setResourceUrlInput,
    setResourceBodyInput,
    setResourcePinnedInput,
    setResourceRoleInput,
    setResourceStatusInput,
    setResourceError,
    onReset: () => setResourceModuleIdInput(null),
    onEdit: (resource) => setResourceModuleIdInput(resource.module_id ?? null),
  });

  const beginInlineEditResource = (resource: ResourceT) => {
    handleEditResource(resource);
  };

  const cancelInlineEditResource = () => {
    resetResourceForm();
  };

  const saveInlineEditResource = async (options?: { keepEditing?: boolean }) => {
    const didSave = await handleSaveCommunityResource(options);
    return didSave === true;
  };

  const openNewModuleModal = () => {
    setEditingResourceModuleId(null);
    setEditingResourceModuleBannerStorageId(null);
    setEditingResourceModuleBannerUrl(null);
    setModuleNameInput("");
    setModuleDescriptionInput("");
    setModuleBannerUrlInput("");
    setModuleBannerFocusX(0.5);
    setModuleBannerFocusY(0.5);
    setModuleBannerZoom(1);
    setModuleLessonStyleInput("article");
    setModuleBannerUploadError(null);
    setIsModuleBannerFocusModalOpen(false);
    setResourceModuleError(null);
    setShowResourceModuleModal(true);
  };

  const handleEditModule = (module: ResourceModuleT) => {
    setEditingResourceModuleId(module.id);
    setEditingResourceModuleBannerStorageId(module.banner_storage_id ?? null);
    setEditingResourceModuleBannerUrl(module.banner_url ?? null);
    setModuleNameInput(module.name);
    setModuleDescriptionInput(module.description_md ?? "");
    setModuleBannerUrlInput(module.banner_url ?? "");
    setModuleBannerFocusX(module.banner_focus_x ?? 0.5);
    setModuleBannerFocusY(module.banner_focus_y ?? 0.5);
    setModuleBannerZoom(module.banner_zoom ?? 1);
    setModuleLessonStyleInput(module.lesson_style === "video" ? "video" : "article");
    setModuleBannerUploadError(null);
    setIsModuleBannerFocusModalOpen(false);
    setResourceModuleError(null);
    setShowResourceModuleModal(true);
  };

  const handleModuleBannerUpload = async (file: File | null) => {
    if (!file) return;
    if (!file.type.toLowerCase().startsWith("image/")) {
      setModuleBannerUploadError("Banner must be an image file.");
      return;
    }
    setModuleBannerUploadError(null);
    setIsProcessingModuleBanner(true);
    try {
      const dataUrl = await readBannerFileAsWideDataUrlWithinLimit(file, MODULE_BANNER_DATA_URL_CHAR_LIMIT);
      setModuleBannerUrlInput(dataUrl);
      setModuleBannerFocusX(0.5);
      setModuleBannerFocusY(0.5);
      setModuleBannerZoom(1);
      setIsModuleBannerFocusModalOpen(true);
    } catch (error) {
      setModuleBannerUploadError(error instanceof Error ? error.message : "Failed to load banner image.");
    } finally {
      setIsProcessingModuleBanner(false);
    }
  };

  const handleModuleBannerDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsModuleBannerDragOver(false);
    void handleModuleBannerUpload(event.dataTransfer.files?.[0] ?? null);
  };

  const pendingDeleteResourceModule =
    params.communityResourceModules.find((module) => module.id === pendingDeleteResourceModuleId) ?? null;
  const pendingDeleteResourceModuleLessonCount = pendingDeleteResourceModuleId
    ? params.communityResources.filter(
        (resource) =>
          resource.module_id === pendingDeleteResourceModuleId && resource.resource_role !== "source",
      ).length
    : 0;

  const resetModuleDeleteState = () => {
    setPendingDeleteResourceModuleId(null);
    setModuleDeleteNameInput("");
    setModuleDeleteWordInput("");
    setResourceModuleDeleteError(null);
  };

  const handleDeleteModule = async (moduleId: string) => {
    const module = params.communityResourceModules.find((candidate) => candidate.id === moduleId);
    if (!module) {
      setResourceModuleError("Course not found. Refresh resources and try again.");
      return false;
    }
    setPendingDeleteResourceModuleId(moduleId);
    setModuleDeleteNameInput("");
    setModuleDeleteWordInput("");
    setResourceModuleDeleteError(null);
    setResourceModuleError(null);
    return false;
  };

  const confirmDeleteModule = async () => {
    if (!pendingDeleteResourceModuleId || isDeletingResourceModule) return;
    const moduleName = pendingDeleteResourceModule?.name.trim() ?? "";
    if (!moduleName || moduleDeleteNameInput.trim() !== moduleName || moduleDeleteWordInput.trim() !== "delete") {
      setResourceModuleDeleteError("Type the course name and delete to confirm.");
      return;
    }

    setIsDeletingResourceModule(true);
    setResourceModuleDeleteError(null);
    setResourceModuleError(null);
    const didDelete = await handleDeleteCommunityResourceModule(pendingDeleteResourceModuleId);
    setIsDeletingResourceModule(false);
    if (didDelete !== false) {
      resetModuleDeleteState();
      return;
    }
  };

  return {
    setEditingResourceId,
    setResourceTitleInput,
    setResourceUrlInput,
    setResourceBodyInput,
    setResourcePinnedInput,
    setResourceModuleIdInput,
    setResourceError,
    setIsSavingResource,
    openNewModuleModal,
    handleEditModule,
    handleSetModuleStatus: handleSetCommunityResourceModuleStatus,
    handleSetModuleLessonStyle: handleSetCommunityResourceModuleLessonStyle,
    handleDeleteModule,
    handleReorderModules: handleReorderCommunityResourceModules,
    handleReorderResources: handleReorderCommunityResources,
    handleMoveResourceToModule: handleMoveCommunityResourceToModule,
    handleAddCommunitySources,
    resourceEditor: {
      editingResourceId,
      titleInput: resourceTitleInput,
      urlInput: resourceUrlInput,
      bodyInput: resourceBodyInput,
      pinnedInput: resourcePinnedInput,
      roleInput: resourceRoleInput,
      error: resourceError,
      isSaving: isSavingResource,
      beginInlineEditResource,
      cancelInlineEditResource,
      saveInlineEditResource,
      uploadImage: handleUploadCommunityResourceImage,
      listVersions: handleListCommunityResourceRevisions,
      restoreVersion: handleRestoreCommunityResource,
      onChangeTitle: setResourceTitleInput,
      onChangeUrl: setResourceUrlInput,
      onChangeBody: setResourceBodyInput,
      onChangePinned: setResourcePinnedInput,
    },
    handleDeleteResource,
    handleCreateBlankPageDraft,
    resourceModuleModalProps: {
      isOpen: showResourceModuleModal,
      isEditingModule: Boolean(editingResourceModuleId),
      hasActiveCommunity: Boolean(params.activeCommunityId),
      moduleNameInput,
      moduleDescriptionInput,
      moduleBannerUrlInput,
      moduleBannerFocusX,
      moduleBannerFocusY,
      moduleBannerZoom,
      moduleLessonStyleInput,
      isModuleBannerDragOver,
      isProcessingModuleBanner,
      moduleBannerUploadError,
      isModuleBannerFocusModalOpen,
      moduleError: resourceModuleError,
      isSavingModule: isSavingResourceModule,
      onClose: () => {
        setShowResourceModuleModal(false);
        setIsModuleBannerFocusModalOpen(false);
      },
      onCancel: () => {
        setEditingResourceModuleId(null);
        setEditingResourceModuleBannerStorageId(null);
        setEditingResourceModuleBannerUrl(null);
        setModuleNameInput("");
        setModuleDescriptionInput("");
        setModuleBannerUrlInput("");
        setModuleBannerFocusX(0.5);
        setModuleBannerFocusY(0.5);
        setModuleBannerZoom(1);
        setModuleLessonStyleInput("article");
        setModuleBannerUploadError(null);
        setIsModuleBannerFocusModalOpen(false);
        setResourceModuleError(null);
        setShowResourceModuleModal(false);
      },
      onSave: handleSaveCommunityResourceModule,
      onDelete: editingResourceModuleId ? () => handleDeleteModule(editingResourceModuleId) : null,
      onChangeName: setModuleNameInput,
      onChangeDescription: setModuleDescriptionInput,
      onChangeBannerFocusX: setModuleBannerFocusX,
      onChangeBannerFocusY: setModuleBannerFocusY,
      onChangeBannerZoom: setModuleBannerZoom,
      onChangeLessonStyle: setModuleLessonStyleInput,
      onSetBannerDragOver: setIsModuleBannerDragOver,
      onBannerDrop: handleModuleBannerDrop,
      onBannerUpload: handleModuleBannerUpload,
      onOpenBannerFocusModal: () => setIsModuleBannerFocusModalOpen(true),
      onCloseBannerFocusModal: () => setIsModuleBannerFocusModalOpen(false),
      onRemoveBanner: () => {
        setModuleBannerUrlInput("");
        setModuleBannerFocusX(0.5);
        setModuleBannerFocusY(0.5);
        setModuleBannerZoom(1);
        setModuleBannerUploadError(null);
        setIsModuleBannerFocusModalOpen(false);
      },
    },
    resourceModuleDeleteModalProps: {
      isOpen: Boolean(pendingDeleteResourceModule),
      moduleName: pendingDeleteResourceModule?.name ?? null,
      lessonCount: pendingDeleteResourceModuleLessonCount,
      moduleNameInput: moduleDeleteNameInput,
      deleteInput: moduleDeleteWordInput,
      isDeleting: isDeletingResourceModule,
      error: resourceModuleDeleteError ?? resourceModuleError,
      onChangeModuleNameInput: setModuleDeleteNameInput,
      onChangeDeleteInput: setModuleDeleteWordInput,
      onClose: () => {
        if (isDeletingResourceModule) return;
        resetModuleDeleteState();
      },
      onConfirm: confirmDeleteModule,
    },
    resourceRead,
    moduleRead,
    refreshCommunityResources,
    loadCommunityResourceModules,
    loadCommunityResources,
  };
}
