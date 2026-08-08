import { useState, type DragEvent } from "react";

import { type CreateCommunityIntentDraft } from "../../../../shared/createCommunityIntent";
import { useCommunityCreateController } from "../../../../shared/useCommunityCreateController";

type SessionLike = {
  user: {
    id: string;
  };
};

type CommunityLike = {
  id: string;
};

type UseWebCommunityUiControllerParams<
  SessionT extends SessionLike,
  CommunityT extends CommunityLike,
> = {
  session: SessionT | null;
  ensureSession?: (session?: SessionT | null) => Promise<SessionT | null>;
  isAccountSetupResolved: boolean;
  isAccountSetupComplete: boolean;
  onPrimaryUnauthenticated: (draft: CreateCommunityIntentDraft) => Promise<void> | void;
  onCreateUnauthenticated?: (draft: CreateCommunityIntentDraft) => Promise<void> | void;
  onAccountSetupRequired?: () => void;
  onAccountSetupUnavailable?: () => void;
  onCommunityCreated: (community: CommunityT) => void;
  onCommunityCreateRecoveryRequired?: () => Promise<void> | void;
  getFounderSubscriptionId?: () => string | null;
  readBannerFileAsWideDataUrlWithinLimit: (file: File, maxChars: number) => Promise<string>;
  isLikelyImageFile: (file: File) => boolean;
  maxCreateImageDataUrlChars: number;
  createUnauthenticatedErrorMessage: string;
};

type CommunityCreateModalHostProps = {
  isOpen: boolean;
  hasSession: boolean;
  createCommunityName: string;
  createCommunityOneLiner: string;
  createCommunitySlug: string;
  createCommunityAvatarUrl: string | null;
  createCommunityBannerUrl: string | null;
  createCommunityError: string | null;
  isCreatingCommunity: boolean;
  isCreateAvatarDragOver: boolean;
  isCreateBannerDragOver: boolean;
  isProcessingCreateAvatar: boolean;
  isProcessingCreateBanner: boolean;
  onClose: () => void;
  onPrimaryAction: () => Promise<void>;
  onSetAvatarDragOver: (value: boolean) => void;
  onSetBannerDragOver: (value: boolean) => void;
  onAvatarDrop: (event: DragEvent<HTMLDivElement>) => void;
  onBannerDrop: (event: DragEvent<HTMLDivElement>) => void;
  onUploadAvatar: (file: File | null) => Promise<void>;
  onUploadBanner: (file: File | null) => Promise<void>;
  onRemoveAvatar: () => void;
  onRemoveBanner: () => void;
  onChangeName: (value: string) => void;
  onChangeOneLiner: (value: string) => void;
  onChangeSlug: (value: string) => void;
  onChangeSlugEdited: (value: boolean) => void;
};

export type WebCommunityModalHostPropsShape = {
  createModal: CommunityCreateModalHostProps;
};

export type UseWebCommunityUiControllerResult<
  CommunityT extends CommunityLike,
> = {
  openCreateCommunityModal: (draft?: CreateCommunityIntentDraft | null) => void;
  resumeCreateCommunityIntent: (draft?: CreateCommunityIntentDraft | null) => void;
  modalHostProps: WebCommunityModalHostPropsShape;
};

export function useWebCommunityUiController<
  SessionT extends SessionLike,
  CommunityT extends CommunityLike,
>(
  params: UseWebCommunityUiControllerParams<SessionT, CommunityT>,
): UseWebCommunityUiControllerResult<CommunityT> {
  const [showCreateCommunityModal, setShowCreateCommunityModal] = useState(false);
  const [createCommunityName, setCreateCommunityName] = useState("");
  const [createCommunitySlug, setCreateCommunitySlug] = useState("");
  const [createCommunitySlugEdited, setCreateCommunitySlugEdited] = useState(false);
  const [createCommunityAvatarUrl, setCreateCommunityAvatarUrl] = useState<string | null>(null);
  const [createCommunityOneLiner, setCreateCommunityOneLiner] = useState("");
  const [createCommunityBannerUrl, setCreateCommunityBannerUrl] = useState<string | null>(null);
  const [createCommunityError, setCreateCommunityError] = useState<string | null>(null);
  const [isCreatingCommunity, setIsCreatingCommunity] = useState(false);
  const [isCreateAvatarDragOver, setIsCreateAvatarDragOver] = useState(false);
  const [isCreateBannerDragOver, setIsCreateBannerDragOver] = useState(false);
  const [isProcessingCreateAvatar, setIsProcessingCreateAvatar] = useState(false);
  const [isProcessingCreateBanner, setIsProcessingCreateBanner] = useState(false);

  const {
    openCreateCommunityModal,
    closeCreateCommunityModal,
    resumeCreateCommunityIntent,
    handleCreateCommunityPrimaryAction,
    handleCreateCommunityAvatarUpload,
    handleCreateCommunityBannerUpload,
    handleCreateAvatarDrop,
    handleCreateBannerDrop,
  } = useCommunityCreateController<SessionT, CommunityT>({
    session: params.session,
    ensureSession: params.ensureSession,
    isAccountSetupResolved: params.isAccountSetupResolved,
    isAccountSetupComplete: params.isAccountSetupComplete,
    onPrimaryUnauthenticated: params.onPrimaryUnauthenticated,
    onCreateUnauthenticated: params.onCreateUnauthenticated,
    onAccountSetupRequired: params.onAccountSetupRequired,
    onAccountSetupUnavailable: params.onAccountSetupUnavailable,
    onCommunityCreated: params.onCommunityCreated,
    onCommunityCreateRecoveryRequired: params.onCommunityCreateRecoveryRequired,
    getFounderSubscriptionId: params.getFounderSubscriptionId,
    createCommunityName,
    createCommunitySlug,
    createCommunitySlugEdited,
    createCommunityAvatarUrl,
    createCommunityOneLiner,
    createCommunityBannerUrl,
    setCreateCommunityName,
    setCreateCommunitySlug,
    setCreateCommunitySlugEdited,
    setCreateCommunityAvatarUrl,
    setCreateCommunityOneLiner,
    setCreateCommunityBannerUrl,
    setCreateCommunityError,
    setShowCreateCommunityModal,
    setIsCreatingCommunity,
    setIsCreateAvatarDragOver,
    setIsCreateBannerDragOver,
    setIsProcessingCreateAvatar,
    setIsProcessingCreateBanner,
    readBannerFileAsWideDataUrlWithinLimit: params.readBannerFileAsWideDataUrlWithinLimit,
    isLikelyImageFile: params.isLikelyImageFile,
    maxCreateImageDataUrlChars: params.maxCreateImageDataUrlChars,
    createUnauthenticatedErrorMessage: params.createUnauthenticatedErrorMessage,
  });

  return {
    openCreateCommunityModal,
    resumeCreateCommunityIntent,
    modalHostProps: {
      createModal: {
        isOpen: showCreateCommunityModal,
        hasSession: Boolean(params.session),
        createCommunityName,
        createCommunityOneLiner,
        createCommunitySlug,
        createCommunityAvatarUrl,
        createCommunityBannerUrl,
        createCommunityError,
        isCreatingCommunity,
        isCreateAvatarDragOver,
        isCreateBannerDragOver,
        isProcessingCreateAvatar,
        isProcessingCreateBanner,
        onClose: closeCreateCommunityModal,
        onPrimaryAction: handleCreateCommunityPrimaryAction,
        onSetAvatarDragOver: setIsCreateAvatarDragOver,
        onSetBannerDragOver: setIsCreateBannerDragOver,
        onAvatarDrop: handleCreateAvatarDrop,
        onBannerDrop: handleCreateBannerDrop,
        onUploadAvatar: handleCreateCommunityAvatarUpload,
        onUploadBanner: handleCreateCommunityBannerUpload,
        onRemoveAvatar: () => setCreateCommunityAvatarUrl(null),
        onRemoveBanner: () => setCreateCommunityBannerUrl(null),
        onChangeName: setCreateCommunityName,
        onChangeOneLiner: setCreateCommunityOneLiner,
        onChangeSlug: setCreateCommunitySlug,
        onChangeSlugEdited: setCreateCommunitySlugEdited,
      },
    },
  };
}
