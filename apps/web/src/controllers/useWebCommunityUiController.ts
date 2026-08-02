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
  isAccountSetupComplete: boolean;
  communityInitials: (value: string) => string;
  onPrimaryUnauthenticated: (draft: CreateCommunityIntentDraft) => Promise<void> | void;
  onCreateUnauthenticated?: (draft: CreateCommunityIntentDraft) => Promise<void> | void;
  onAccountSetupRequired?: () => void;
  onCommunityCreated: (community: CommunityT) => void;
  readBannerFileAsWideDataUrlWithinLimit: (file: File, maxChars: number) => Promise<string>;
  isLikelyImageFile: (file: File) => boolean;
  maxCreateImageDataUrlChars: number;
  createUnauthenticatedErrorMessage: string;
  bannerLoadFailureMessage: string;
};

type CommunityCreateModalHostProps = {
  isOpen: boolean;
  hasSession: boolean;
  isCreateBannerDragOver: boolean;
  isCreateAvatarDragOver: boolean;
  createCommunityBannerUrl: string | null;
  createCommunityAvatarUrl: string | null;
  createCommunityName: string;
  createCommunityOneLiner: string;
  createCommunitySlug: string;
  createCommunityError: string | null;
  isCreatingCommunity: boolean;
  communityInitials: (value: string) => string;
  onClose: () => void;
  onPrimaryAction: () => Promise<void>;
  onSetBannerDragOver: (value: boolean) => void;
  onSetAvatarDragOver: (value: boolean) => void;
  onBannerDrop: (event: DragEvent<HTMLDivElement>) => void;
  onAvatarDrop: (event: DragEvent<HTMLDivElement>) => void;
  onUploadBanner: (file: File | null) => Promise<void>;
  onUploadAvatar: (file: File | null) => Promise<void>;
  onRemoveBanner: () => void;
  onRemoveAvatar: () => void;
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

  const {
    openCreateCommunityModal,
    closeCreateCommunityModal,
    resumeCreateCommunityIntent,
    handleCreateCommunityPrimaryAction,
    handleCreateCommunityAvatarUpload,
    handleCreateCommunityBannerUpload,
    handleCreateBannerDrop,
    handleCreateAvatarDrop,
  } = useCommunityCreateController<SessionT, CommunityT>({
    session: params.session,
    ensureSession: params.ensureSession,
    isAccountSetupComplete: params.isAccountSetupComplete,
    onPrimaryUnauthenticated: params.onPrimaryUnauthenticated,
    onCreateUnauthenticated: params.onCreateUnauthenticated,
    onAccountSetupRequired: params.onAccountSetupRequired,
    onCommunityCreated: params.onCommunityCreated,
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
    readBannerFileAsWideDataUrlWithinLimit: params.readBannerFileAsWideDataUrlWithinLimit,
    isLikelyImageFile: params.isLikelyImageFile,
    maxCreateImageDataUrlChars: params.maxCreateImageDataUrlChars,
    createUnauthenticatedErrorMessage: params.createUnauthenticatedErrorMessage,
    bannerLoadFailureMessage: params.bannerLoadFailureMessage,
  });

  return {
    openCreateCommunityModal,
    resumeCreateCommunityIntent,
    modalHostProps: {
      createModal: {
        isOpen: showCreateCommunityModal,
        hasSession: Boolean(params.session),
        isCreateBannerDragOver,
        isCreateAvatarDragOver,
        createCommunityBannerUrl,
        createCommunityAvatarUrl,
        createCommunityName,
        createCommunityOneLiner,
        createCommunitySlug,
        createCommunityError,
        isCreatingCommunity,
        communityInitials: params.communityInitials,
        onClose: closeCreateCommunityModal,
        onPrimaryAction: handleCreateCommunityPrimaryAction,
        onSetBannerDragOver: setIsCreateBannerDragOver,
        onSetAvatarDragOver: setIsCreateAvatarDragOver,
        onBannerDrop: handleCreateBannerDrop,
        onAvatarDrop: handleCreateAvatarDrop,
        onUploadBanner: handleCreateCommunityBannerUpload,
        onUploadAvatar: handleCreateCommunityAvatarUpload,
        onRemoveBanner: () => setCreateCommunityBannerUrl(null),
        onRemoveAvatar: () => setCreateCommunityAvatarUrl(null),
        onChangeName: setCreateCommunityName,
        onChangeOneLiner: setCreateCommunityOneLiner,
        onChangeSlug: setCreateCommunitySlug,
        onChangeSlugEdited: setCreateCommunitySlugEdited,
      },
    },
  };
}
