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

type AccountCommerceStatusLike = {
  account_tier: string;
  max_communities: number;
};

type Visibility = "published" | "unlisted";

type UseWebCommunityUiControllerParams<
  SessionT extends SessionLike,
  CommunityT extends CommunityLike,
  BillingStatusT extends AccountCommerceStatusLike,
> = {
  session: SessionT | null;
  ensureSession?: (session?: SessionT | null) => Promise<SessionT | null>;
  communities: CommunityT[];
  communityRoleById: Record<string, string>;
  accountCommerceStatus: BillingStatusT | null;
  accountCommerceError: string | null;
  isAccountSetupComplete: boolean;
  communityInitials: (value: string) => string;
  loadAccountCommerceStatus: (session: SessionT) => Promise<BillingStatusT | null>;
  persistCreateCommunityIntent: (draft: CreateCommunityIntentDraft) => void;
  onPrimaryUnauthenticated: (draft: CreateCommunityIntentDraft) => Promise<void> | void;
  onCreateUnauthenticated?: (draft: CreateCommunityIntentDraft) => Promise<void> | void;
  onAccountSetupRequired?: () => void;
  onOwnedCommunityLimitReached?: () => void;
  onCommunityCreated: (community: CommunityT) => void;
  readBannerFileAsWideDataUrlWithinLimit: (file: File, maxChars: number) => Promise<string>;
  isLikelyImageFile: (file: File) => boolean;
  maxCreateImageDataUrlChars: number;
  createUnauthenticatedErrorMessage: string;
  bannerLoadFailureMessage: string;
};

type CommunityCreateModalHostProps<
  CommunityT extends CommunityLike,
  BillingStatusT extends AccountCommerceStatusLike,
> = {
  isOpen: boolean;
  hasSession: boolean;
  communities: CommunityT[];
  communityRoleById: Record<string, string>;
  accountCommerceStatus: BillingStatusT | null;
  accountCommerceError: string | null;
  isCreateBannerDragOver: boolean;
  isCreateAvatarDragOver: boolean;
  createCommunityBannerUrl: string | null;
  createCommunityAvatarUrl: string | null;
  createCommunityName: string;
  createCommunityOneLiner: string;
  createCommunitySlug: string;
  createCommunityVisibility: Visibility;
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
  onChangeVisibility: (value: Visibility) => void;
};

export type WebCommunityModalHostPropsShape<
  CommunityT extends CommunityLike,
  BillingStatusT extends AccountCommerceStatusLike,
> = {
  createModal: CommunityCreateModalHostProps<CommunityT, BillingStatusT>;
};

export type UseWebCommunityUiControllerResult<
  CommunityT extends CommunityLike,
  BillingStatusT extends AccountCommerceStatusLike,
> = {
  openCreateCommunityModal: (draft?: CreateCommunityIntentDraft | null) => void;
  resumeCreateCommunityIntent: (draft?: CreateCommunityIntentDraft | null) => void;
  modalHostProps: WebCommunityModalHostPropsShape<CommunityT, BillingStatusT>;
};

export function useWebCommunityUiController<
  SessionT extends SessionLike,
  CommunityT extends CommunityLike,
  BillingStatusT extends AccountCommerceStatusLike,
>(
  params: UseWebCommunityUiControllerParams<SessionT, CommunityT, BillingStatusT>,
): UseWebCommunityUiControllerResult<CommunityT, BillingStatusT> {
  const [showCreateCommunityModal, setShowCreateCommunityModal] = useState(false);
  const [createCommunityName, setCreateCommunityName] = useState("");
  const [createCommunitySlug, setCreateCommunitySlug] = useState("");
  const [createCommunitySlugEdited, setCreateCommunitySlugEdited] = useState(false);
  const [createCommunityVisibility, setCreateCommunityVisibility] = useState<Visibility>("unlisted");
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
  } = useCommunityCreateController<SessionT, CommunityT, BillingStatusT>({
    session: params.session,
    ensureSession: params.ensureSession,
    accountCommerceStatus: params.accountCommerceStatus,
    isAccountSetupComplete: params.isAccountSetupComplete,
    communities: params.communities,
    communityRoleById: params.communityRoleById,
    loadAccountCommerceStatus: params.loadAccountCommerceStatus,
    persistCreateCommunityIntent: params.persistCreateCommunityIntent,
    onPrimaryUnauthenticated: params.onPrimaryUnauthenticated,
    onCreateUnauthenticated: params.onCreateUnauthenticated,
    onAccountSetupRequired: params.onAccountSetupRequired,
    onOwnedCommunityLimitReached: params.onOwnedCommunityLimitReached,
    onCommunityCreated: params.onCommunityCreated,
    createCommunityName,
    createCommunitySlug,
    createCommunitySlugEdited,
    createCommunityVisibility,
    createCommunityAvatarUrl,
    createCommunityOneLiner,
    createCommunityBannerUrl,
    setCreateCommunityName,
    setCreateCommunitySlug,
    setCreateCommunitySlugEdited,
    setCreateCommunityVisibility,
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
        communities: params.communities,
        communityRoleById: params.communityRoleById,
        accountCommerceStatus: params.accountCommerceStatus,
        accountCommerceError: params.accountCommerceError,
        isCreateBannerDragOver,
        isCreateAvatarDragOver,
        createCommunityBannerUrl,
        createCommunityAvatarUrl,
        createCommunityName,
        createCommunityOneLiner,
        createCommunitySlug,
        createCommunityVisibility,
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
        onChangeVisibility: setCreateCommunityVisibility,
      },
    },
  };
}
