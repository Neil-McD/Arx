import { useState, type Dispatch, type DragEvent, type SetStateAction } from "react";

import { type CreateCommunityIntentDraft } from "../../../../shared/createCommunityIntent";
import { useCommunityCreateController } from "../../../../shared/useCommunityCreateController";
import { useCommunityDeleteController } from "../../../../shared/useCommunityDeleteController";

type SessionLike = {
  user: {
    id: string;
  };
};

type CommunityLike = {
  id: string;
};

type BuilderBillingStatusLike = {
  builder_tier: string;
  max_communities: number;
};

type Visibility = "published" | "unlisted";

type ModalCommunityLike = {
  id: string;
  name: string;
};

type UseWebCommunityUiControllerParams<
  SessionT extends SessionLike,
  CommunityT extends CommunityLike,
  BillingStatusT extends BuilderBillingStatusLike,
  PageT extends string,
  ViewT extends string,
  TabT extends string,
> = {
  session: SessionT | null;
  ensureSession?: (session?: SessionT | null) => Promise<SessionT | null>;
  communities: CommunityT[];
  communityRoleById: Record<string, string>;
  builderBillingStatus: BillingStatusT | null;
  builderBillingError: string | null;
  activeCommunity: ModalCommunityLike | null;
  activeCommunityId: string | null;
  communityInitials: (value: string) => string;
  loadBuilderBillingStatus: (session: SessionT) => Promise<BillingStatusT | null>;
  persistCreateCommunityIntent: (draft: CreateCommunityIntentDraft) => void;
  onStartUpgradeFlow: () => void;
  onPrimaryUnauthenticated: (draft: CreateCommunityIntentDraft) => Promise<void> | void;
  onCreateUnauthenticated?: (draft: CreateCommunityIntentDraft) => Promise<void> | void;
  onOwnedCommunityLimitReached?: () => void;
  onCommunityCreated: (community: CommunityT) => void;
  readAvatarFileAsSquareDataUrl: (file: File, size?: number) => Promise<string>;
  readBannerFileAsWideDataUrlWithinLimit: (file: File, maxChars: number) => Promise<string>;
  isLikelyImageFile: (file: File) => boolean;
  maxCreateImageDataUrlChars: number;
  createUnauthenticatedErrorMessage: string;
  bannerLoadFailureMessage: string;
  loadCommunities: (session: SessionT) => Promise<void>;
  setActiveCommunityId: Dispatch<SetStateAction<string | null>>;
  setActivePage: Dispatch<SetStateAction<PageT>>;
  setActiveView: Dispatch<SetStateAction<ViewT>>;
  setCommunityTab: Dispatch<SetStateAction<TabT>>;
  setCommunities: Dispatch<SetStateAction<CommunityT[]>>;
  setCommunityRoleById: Dispatch<SetStateAction<Record<string, string>>>;
  getCommunityId: (community: CommunityT) => string;
};

type CommunityCreateModalHostProps<
  CommunityT extends CommunityLike,
  BillingStatusT extends BuilderBillingStatusLike,
> = {
  isOpen: boolean;
  hasSession: boolean;
  communities: CommunityT[];
  communityRoleById: Record<string, string>;
  builderBillingStatus: BillingStatusT | null;
  builderBillingError: string | null;
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

type CommunityDeleteModalHostProps = {
  isOpen: boolean;
  activeCommunity: ModalCommunityLike | null;
  deleteCommunityNameInput: string;
  deleteCommunityConfirmInput: string;
  deleteCommunityError: string | null;
  isDeletingCommunity: boolean;
  onClose: () => void;
  onChangeDeleteCommunityNameInput: (value: string) => void;
  onChangeDeleteCommunityConfirmInput: (value: string) => void;
  onConfirmDelete: () => Promise<void>;
};

export type WebCommunityModalHostPropsShape<
  CommunityT extends CommunityLike,
  BillingStatusT extends BuilderBillingStatusLike,
> = {
  createModal: CommunityCreateModalHostProps<CommunityT, BillingStatusT>;
  deleteModal: CommunityDeleteModalHostProps;
};

export type UseWebCommunityUiControllerResult<
  CommunityT extends CommunityLike,
  BillingStatusT extends BuilderBillingStatusLike,
> = {
  openCreateCommunityModal: (draft?: CreateCommunityIntentDraft | null) => void;
  resumeCreateCommunityIntent: (draft?: CreateCommunityIntentDraft | null) => void;
  openDeleteCommunityModal: () => void;
  modalHostProps: WebCommunityModalHostPropsShape<CommunityT, BillingStatusT>;
};

export function useWebCommunityUiController<
  SessionT extends SessionLike,
  CommunityT extends CommunityLike,
  BillingStatusT extends BuilderBillingStatusLike,
  PageT extends string,
  ViewT extends string,
  TabT extends string,
>(
  params: UseWebCommunityUiControllerParams<SessionT, CommunityT, BillingStatusT, PageT, ViewT, TabT>,
): UseWebCommunityUiControllerResult<CommunityT, BillingStatusT> {
  const [showCreateCommunityModal, setShowCreateCommunityModal] = useState(false);
  const [showDeleteCommunityModal, setShowDeleteCommunityModal] = useState(false);
  const [deleteCommunityNameInput, setDeleteCommunityNameInput] = useState("");
  const [deleteCommunityConfirmInput, setDeleteCommunityConfirmInput] = useState("");
  const [deleteCommunityError, setDeleteCommunityError] = useState<string | null>(null);
  const [isDeletingCommunity, setIsDeletingCommunity] = useState(false);
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
    builderBillingStatus: params.builderBillingStatus,
    communities: params.communities,
    communityRoleById: params.communityRoleById,
    loadBuilderBillingStatus: params.loadBuilderBillingStatus,
    persistCreateCommunityIntent: params.persistCreateCommunityIntent,
    onStartUpgradeFlow: params.onStartUpgradeFlow,
    onPrimaryUnauthenticated: params.onPrimaryUnauthenticated,
    onCreateUnauthenticated: params.onCreateUnauthenticated,
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
    readAvatarFileAsSquareDataUrl: params.readAvatarFileAsSquareDataUrl,
    readBannerFileAsWideDataUrlWithinLimit: params.readBannerFileAsWideDataUrlWithinLimit,
    isLikelyImageFile: params.isLikelyImageFile,
    maxCreateImageDataUrlChars: params.maxCreateImageDataUrlChars,
    createUnauthenticatedErrorMessage: params.createUnauthenticatedErrorMessage,
    bannerLoadFailureMessage: params.bannerLoadFailureMessage,
  });

  const {
    openDeleteCommunityModal,
    closeDeleteCommunityModal,
    handleConfirmDeleteCommunity,
  } = useCommunityDeleteController<SessionT, CommunityT, PageT, ViewT, TabT>({
    session: params.session,
    ensureSession: params.ensureSession,
    activeCommunityId: params.activeCommunityId,
    loadCommunities: params.loadCommunities,
    setDeleteCommunityError,
    setDeleteCommunityNameInput,
    setDeleteCommunityConfirmInput,
    setShowDeleteCommunityModal,
    setIsDeletingCommunity,
    setActiveCommunityId: params.setActiveCommunityId,
    setActivePage: params.setActivePage,
    setActiveView: params.setActiveView,
    setCommunityTab: params.setCommunityTab,
    setCommunities: params.setCommunities,
    setCommunityRoleById: params.setCommunityRoleById,
    getCommunityId: params.getCommunityId,
  });

  return {
    openCreateCommunityModal,
    resumeCreateCommunityIntent,
    openDeleteCommunityModal,
    modalHostProps: {
      createModal: {
        isOpen: showCreateCommunityModal,
        hasSession: Boolean(params.session),
        communities: params.communities,
        communityRoleById: params.communityRoleById,
        builderBillingStatus: params.builderBillingStatus,
        builderBillingError: params.builderBillingError,
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
      deleteModal: {
        isOpen: showDeleteCommunityModal,
        activeCommunity: params.activeCommunity,
        deleteCommunityNameInput,
        deleteCommunityConfirmInput,
        deleteCommunityError,
        isDeletingCommunity,
        onClose: closeDeleteCommunityModal,
        onChangeDeleteCommunityNameInput: setDeleteCommunityNameInput,
        onChangeDeleteCommunityConfirmInput: setDeleteCommunityConfirmInput,
        onConfirmDelete: handleConfirmDeleteCommunity,
      },
    },
  };
}
