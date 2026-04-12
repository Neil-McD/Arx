import { useState, type ComponentProps, type Dispatch, type SetStateAction } from "react";

import { useCommunityResourceController } from "../../../../shared/useCommunityResourceController";
import { useCommunityResourceEditorController } from "../../../../shared/useCommunityResourceEditorController";
import { WebCommunityResourceModal } from "../components/WebCommunityResourceModal";

type SessionLike = unknown;

type ResourceLike = {
  id: string;
  type: string;
  title: string;
  body_md: string | null;
  url: string | null;
  pinned: boolean;
};

type UseWebCommunityResourceUiControllerParams<
  SessionT extends SessionLike,
  ResourceT extends ResourceLike,
> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  ensureSession?: (session?: SessionT | null) => Promise<SessionT | null>;
  parseEmbedUrl: (url: string) => unknown;
  setCommunityResources: Dispatch<SetStateAction<ResourceT[]>>;
  setIsLoadingResources: Dispatch<SetStateAction<boolean>>;
};

export type UseWebCommunityResourceUiControllerResult<
  SessionT extends SessionLike,
  ResourceT extends ResourceLike,
> = {
  resourceSuccess: boolean;
  setShowResourceModal: Dispatch<SetStateAction<boolean>>;
  setEditingResourceId: Dispatch<SetStateAction<string | null>>;
  setResourceTitleInput: Dispatch<SetStateAction<string>>;
  setResourceUrlInput: Dispatch<SetStateAction<string>>;
  setResourceBodyInput: Dispatch<SetStateAction<string>>;
  setResourcePinnedInput: Dispatch<SetStateAction<boolean>>;
  setResourceError: Dispatch<SetStateAction<string | null>>;
  setIsSavingResource: Dispatch<SetStateAction<boolean>>;
  setResourceSuccess: Dispatch<SetStateAction<boolean>>;
  openNewResourceModal: () => void;
  handleEditResource: (resource: ResourceT) => void;
  handleDeleteResource: (resourceId: string) => Promise<boolean>;
  resourceModalProps: ComponentProps<typeof WebCommunityResourceModal>;
  loadCommunityResources: (communityId: string, session: SessionT) => Promise<void>;
};

export function useWebCommunityResourceUiController<
  SessionT extends SessionLike,
  ResourceT extends ResourceLike,
>(
  params: UseWebCommunityResourceUiControllerParams<SessionT, ResourceT>,
): UseWebCommunityResourceUiControllerResult<SessionT, ResourceT> {
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [resourceTitleInput, setResourceTitleInput] = useState("");
  const [resourceUrlInput, setResourceUrlInput] = useState("");
  const [resourceBodyInput, setResourceBodyInput] = useState("");
  const [resourcePinnedInput, setResourcePinnedInput] = useState(false);
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [isSavingResource, setIsSavingResource] = useState(false);
  const [resourceSuccess, setResourceSuccess] = useState(false);

  const {
    loadCommunityResources,
    handleSaveCommunityResource,
    handleDeleteResource,
  } = useCommunityResourceController<SessionT, ResourceT>({
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
    editingResourceId,
    setCommunityResources: params.setCommunityResources,
    setIsLoadingResources: params.setIsLoadingResources,
    setIsSavingResource,
    setResourceError,
    setResourceSuccess,
    setShowResourceModal,
    setEditingResourceId,
    setResourceTitleInput,
    setResourceUrlInput,
    setResourceBodyInput,
    setResourcePinnedInput,
  });

  const {
    resetResourceForm,
    openNewResourceModal,
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
  });

  return {
    resourceSuccess,
    setShowResourceModal,
    setEditingResourceId,
    setResourceTitleInput,
    setResourceUrlInput,
    setResourceBodyInput,
    setResourcePinnedInput,
    setResourceError,
    setIsSavingResource,
    setResourceSuccess,
    openNewResourceModal,
    handleEditResource,
    handleDeleteResource,
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
    loadCommunityResources,
  };
}
