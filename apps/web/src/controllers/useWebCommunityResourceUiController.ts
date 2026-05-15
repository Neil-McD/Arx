import { useState, type ComponentProps, type Dispatch, type DragEvent, type SetStateAction } from "react";

import { readBannerFileAsWideDataUrlWithinLimit } from "../../../../shared/imageTransforms";
import { useCommunityResourceController } from "../../../../shared/useCommunityResourceController";
import { useCommunityResourceEditorController } from "../../../../shared/useCommunityResourceEditorController";
import { WebDeleteResourceModuleModal } from "../components/WebDeleteResourceModuleModal";
import { WebCommunityResourceModal } from "../components/WebCommunityResourceModal";
import { WebCommunityResourceModuleModal } from "../components/WebCommunityResourceModuleModal";

type SessionLike = unknown;

const MODULE_BANNER_DATA_URL_CHAR_LIMIT = 1_200_000;

type ResourceLike = {
  id: string;
  module_id?: string | null;
  type: string;
  title: string;
  body_md: string | null;
  url: string | null;
  pinned: boolean;
};

type ResourceModuleLike = {
  id: string;
  name: string;
  description_md: string | null;
  banner_url: string | null;
  banner_storage_id?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
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
  setIsLoadingResources: Dispatch<SetStateAction<boolean>>;
  setIsLoadingResourceModules: Dispatch<SetStateAction<boolean>>;
};

export type UseWebCommunityResourceUiControllerResult<
  SessionT extends SessionLike,
  ResourceT extends ResourceLike,
  ResourceModuleT extends ResourceModuleLike,
> = {
  setShowResourceModal: Dispatch<SetStateAction<boolean>>;
  setEditingResourceId: Dispatch<SetStateAction<string | null>>;
  setResourceTitleInput: Dispatch<SetStateAction<string>>;
  setResourceUrlInput: Dispatch<SetStateAction<string>>;
  setResourceBodyInput: Dispatch<SetStateAction<string>>;
  setResourcePinnedInput: Dispatch<SetStateAction<boolean>>;
  setResourceModuleIdInput: Dispatch<SetStateAction<string | null>>;
  setResourceError: Dispatch<SetStateAction<string | null>>;
  setIsSavingResource: Dispatch<SetStateAction<boolean>>;
  openNewModuleModal: () => void;
  handleEditModule: (module: ResourceModuleT) => void;
  handleDeleteModule: (moduleId: string) => Promise<boolean>;
  handleReorderModules: (moduleIds: string[]) => Promise<boolean>;
  openNewResourceModal: (moduleId?: string | null) => void;
  handleEditResource: (resource: ResourceT) => void;
  handleDeleteResource: (resourceId: string) => Promise<boolean>;
  resourceModuleModalProps: ComponentProps<typeof WebCommunityResourceModuleModal>;
  resourceModuleDeleteModalProps: ComponentProps<typeof WebDeleteResourceModuleModal>;
  resourceModalProps: ComponentProps<typeof WebCommunityResourceModal>;
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
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [showResourceModuleModal, setShowResourceModuleModal] = useState(false);
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [editingResourceModuleId, setEditingResourceModuleId] = useState<string | null>(null);
  const [editingResourceModuleBannerStorageId, setEditingResourceModuleBannerStorageId] = useState<string | null>(null);
  const [editingResourceModuleBannerUrl, setEditingResourceModuleBannerUrl] = useState<string | null>(null);
  const [resourceTitleInput, setResourceTitleInput] = useState("");
  const [resourceUrlInput, setResourceUrlInput] = useState("");
  const [resourceBodyInput, setResourceBodyInput] = useState("");
  const [resourcePinnedInput, setResourcePinnedInput] = useState(false);
  const [resourceModuleIdInput, setResourceModuleIdInput] = useState<string | null>(null);
  const [moduleNameInput, setModuleNameInput] = useState("");
  const [moduleDescriptionInput, setModuleDescriptionInput] = useState("");
  const [moduleBannerUrlInput, setModuleBannerUrlInput] = useState("");
  const [moduleBannerFocusX, setModuleBannerFocusX] = useState(0.5);
  const [moduleBannerFocusY, setModuleBannerFocusY] = useState(0.5);
  const [moduleBannerZoom, setModuleBannerZoom] = useState(1);
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
    loadCommunityResourceModules,
    loadCommunityResources,
    handleSaveCommunityResourceModule,
    handleDeleteCommunityResourceModule,
    handleReorderCommunityResourceModules,
    handleSaveCommunityResource,
    handleDeleteResource,
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
    resourceModuleIdInput,
    moduleNameInput,
    moduleDescriptionInput,
    moduleBannerUrlInput,
    moduleBannerFocusX,
    moduleBannerFocusY,
    moduleBannerZoom,
    editingResourceId,
    editingResourceModuleId,
    editingResourceModuleBannerStorageId,
    editingResourceModuleBannerUrl,
    setCommunityResources: params.setCommunityResources,
    setCommunityResourceModules: params.setCommunityResourceModules,
    setIsLoadingResources: params.setIsLoadingResources,
    setIsLoadingResourceModules: params.setIsLoadingResourceModules,
    setIsSavingResource,
    setIsSavingResourceModule,
    setResourceError,
    setResourceModuleError,
    setShowResourceModuleModal,
    setShowResourceModal,
    setEditingResourceId,
    setEditingResourceModuleId,
    setEditingResourceModuleBannerStorageId,
    setEditingResourceModuleBannerUrl,
    setResourceTitleInput,
    setResourceUrlInput,
    setResourceBodyInput,
    setResourcePinnedInput,
    setResourceModuleIdInput,
    setModuleNameInput,
    setModuleDescriptionInput,
    setModuleBannerUrlInput,
    setModuleBannerFocusX,
    setModuleBannerFocusY,
    setModuleBannerZoom,
  });

  const {
    resetResourceForm,
    openNewResourceModal: rawOpenNewResourceModal,
    closeResourceModal,
    handleEditResource,
  } = useCommunityResourceEditorController<ResourceT>({
    setEditingResourceId,
    setResourceTitleInput,
    setResourceUrlInput,
    setResourceBodyInput,
    setResourcePinnedInput,
    setResourceError,
    setShowResourceModal,
    onReset: () => setResourceModuleIdInput(null),
    onEdit: (resource) => setResourceModuleIdInput(resource.module_id ?? null),
  });

  const openNewResourceModal = (moduleId?: string | null) => {
    rawOpenNewResourceModal();
    setResourceModuleIdInput(moduleId ?? null);
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
    setModuleBannerUploadError(null);
    setIsModuleBannerFocusModalOpen(false);
    setResourceModuleError(null);
    setShowResourceModuleModal(true);
  };

  const pendingDeleteResourceModule =
    params.communityResourceModules.find((module) => module.id === pendingDeleteResourceModuleId) ?? null;
  const pendingDeleteResourceModuleResourceCount = pendingDeleteResourceModuleId
    ? params.communityResources.filter((resource) => resource.module_id === pendingDeleteResourceModuleId).length
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
      setResourceModuleError("Module not found. Refresh resources and try again.");
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
      setResourceModuleDeleteError("Type the module name and delete to confirm.");
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
      setModuleBannerUploadError(
        error instanceof Error ? error.message : "Failed to load banner image.",
      );
    } finally {
      setIsProcessingModuleBanner(false);
    }
  };

  const handleModuleBannerDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsModuleBannerDragOver(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    void handleModuleBannerUpload(file);
  };

  return {
    setShowResourceModal,
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
    handleDeleteModule,
    handleReorderModules: handleReorderCommunityResourceModules,
    openNewResourceModal,
    handleEditResource,
    handleDeleteResource,
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
      resourceCount: pendingDeleteResourceModuleResourceCount,
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
    resourceModalProps: {
      isOpen: showResourceModal,
      hasActiveCommunity: Boolean(params.activeCommunityId),
      editingResourceId,
      resourceTitleInput,
      resourceUrlInput,
      resourceBodyInput,
      resourcePinnedInput,
      resourceError,
      isSavingResource,
      onClose: closeResourceModal,
      onCancel: () => {
        resetResourceForm();
        closeResourceModal();
      },
      onSave: handleSaveCommunityResource,
      onChangeTitle: setResourceTitleInput,
      onChangeUrl: setResourceUrlInput,
      onChangeBody: setResourceBodyInput,
      onChangePinned: setResourcePinnedInput,
    },
    loadCommunityResourceModules,
    loadCommunityResources,
  };
}
