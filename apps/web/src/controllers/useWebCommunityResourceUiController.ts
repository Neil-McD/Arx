import { useState, type ComponentProps, type Dispatch, type SetStateAction } from "react";

import { useCommunityResourceController } from "../../../../shared/useCommunityResourceController";
import { useCommunityResourceEditorController } from "../../../../shared/useCommunityResourceEditorController";
import { WebCommunityResourceModal } from "../components/WebCommunityResourceModal";
import { WebCommunityResourceModuleModal } from "../components/WebCommunityResourceModuleModal";

type SessionLike = unknown;

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
  resourceSuccess: boolean;
  setShowResourceModal: Dispatch<SetStateAction<boolean>>;
  setEditingResourceId: Dispatch<SetStateAction<string | null>>;
  setResourceTitleInput: Dispatch<SetStateAction<string>>;
  setResourceUrlInput: Dispatch<SetStateAction<string>>;
  setResourceBodyInput: Dispatch<SetStateAction<string>>;
  setResourcePinnedInput: Dispatch<SetStateAction<boolean>>;
  setResourceModuleIdInput: Dispatch<SetStateAction<string | null>>;
  setResourceError: Dispatch<SetStateAction<string | null>>;
  setIsSavingResource: Dispatch<SetStateAction<boolean>>;
  setResourceSuccess: Dispatch<SetStateAction<boolean>>;
  openNewModuleModal: () => void;
  openNewResourceModal: (moduleId?: string | null) => void;
  handleEditResource: (resource: ResourceT) => void;
  handleDeleteResource: (resourceId: string) => Promise<boolean>;
  resourceModuleModalProps: ComponentProps<typeof WebCommunityResourceModuleModal>;
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
  const [resourceTitleInput, setResourceTitleInput] = useState("");
  const [resourceUrlInput, setResourceUrlInput] = useState("");
  const [resourceBodyInput, setResourceBodyInput] = useState("");
  const [resourcePinnedInput, setResourcePinnedInput] = useState(false);
  const [resourceModuleIdInput, setResourceModuleIdInput] = useState<string | null>(null);
  const [moduleNameInput, setModuleNameInput] = useState("");
  const [moduleDescriptionInput, setModuleDescriptionInput] = useState("");
  const [moduleBannerUrlInput, setModuleBannerUrlInput] = useState("");
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [resourceModuleError, setResourceModuleError] = useState<string | null>(null);
  const [isSavingResource, setIsSavingResource] = useState(false);
  const [isSavingResourceModule, setIsSavingResourceModule] = useState(false);
  const [resourceSuccess, setResourceSuccess] = useState(false);

  const {
    loadCommunityResourceModules,
    loadCommunityResources,
    handleSaveCommunityResourceModule,
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
    editingResourceId,
    setCommunityResources: params.setCommunityResources,
    setCommunityResourceModules: params.setCommunityResourceModules,
    setIsLoadingResources: params.setIsLoadingResources,
    setIsLoadingResourceModules: params.setIsLoadingResourceModules,
    setIsSavingResource,
    setIsSavingResourceModule,
    setResourceError,
    setResourceModuleError,
    setResourceSuccess,
    setShowResourceModuleModal,
    setShowResourceModal,
    setEditingResourceId,
    setResourceTitleInput,
    setResourceUrlInput,
    setResourceBodyInput,
    setResourcePinnedInput,
    setResourceModuleIdInput,
    setModuleNameInput,
    setModuleDescriptionInput,
    setModuleBannerUrlInput,
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
    setModuleNameInput("");
    setModuleDescriptionInput("");
    setModuleBannerUrlInput("");
    setResourceModuleError(null);
    setShowResourceModuleModal(true);
  };

  return {
    resourceSuccess,
    setShowResourceModal,
    setEditingResourceId,
    setResourceTitleInput,
    setResourceUrlInput,
    setResourceBodyInput,
    setResourcePinnedInput,
    setResourceModuleIdInput,
    setResourceError,
    setIsSavingResource,
    setResourceSuccess,
    openNewModuleModal,
    openNewResourceModal,
    handleEditResource,
    handleDeleteResource,
    resourceModuleModalProps: {
      isOpen: showResourceModuleModal,
      hasActiveCommunity: Boolean(params.activeCommunityId),
      moduleNameInput,
      moduleDescriptionInput,
      moduleBannerUrlInput,
      moduleError: resourceModuleError,
      isSavingModule: isSavingResourceModule,
      onClose: () => setShowResourceModuleModal(false),
      onCancel: () => {
        setModuleNameInput("");
        setModuleDescriptionInput("");
        setModuleBannerUrlInput("");
        setResourceModuleError(null);
        setShowResourceModuleModal(false);
      },
      onSave: handleSaveCommunityResourceModule,
      onChangeName: setModuleNameInput,
      onChangeDescription: setModuleDescriptionInput,
      onChangeBannerUrl: setModuleBannerUrlInput,
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
