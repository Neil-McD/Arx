import { useState } from "react";

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
  onPrimaryUnauthenticated: (draft: CreateCommunityIntentDraft) => Promise<void> | void;
  onCreateUnauthenticated?: (draft: CreateCommunityIntentDraft) => Promise<void> | void;
  onAccountSetupRequired?: () => void;
  onCommunityCreated: (community: CommunityT) => void;
  createUnauthenticatedErrorMessage: string;
};

type CommunityCreateModalHostProps = {
  isOpen: boolean;
  hasSession: boolean;
  createCommunityName: string;
  createCommunitySlug: string;
  createCommunityError: string | null;
  isCreatingCommunity: boolean;
  onClose: () => void;
  onPrimaryAction: () => Promise<void>;
  onChangeName: (value: string) => void;
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
  const [createCommunityError, setCreateCommunityError] = useState<string | null>(null);
  const [isCreatingCommunity, setIsCreatingCommunity] = useState(false);

  const {
    openCreateCommunityModal,
    closeCreateCommunityModal,
    resumeCreateCommunityIntent,
    handleCreateCommunityPrimaryAction,
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
    setCreateCommunityName,
    setCreateCommunitySlug,
    setCreateCommunitySlugEdited,
    setCreateCommunityError,
    setShowCreateCommunityModal,
    setIsCreatingCommunity,
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
        createCommunitySlug,
        createCommunityError,
        isCreatingCommunity,
        onClose: closeCreateCommunityModal,
        onPrimaryAction: handleCreateCommunityPrimaryAction,
        onChangeName: setCreateCommunityName,
        onChangeSlug: setCreateCommunitySlug,
        onChangeSlugEdited: setCreateCommunitySlugEdited,
      },
    },
  };
}
