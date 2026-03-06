import { useCallback, type Dispatch, type SetStateAction } from "react";

import { deleteCloudCommunity } from "./cloudCommunityAdminGateway";

type UseCommunityDeleteControllerArgs<
  SessionT,
  CommunityT,
  PageT extends string,
  ViewT extends string,
  TabT extends string,
> = {
  session: SessionT | null;
  activeCommunityId: string | null;
  loadCommunities: (session: SessionT) => Promise<void>;
  setDeleteCommunityError: Dispatch<SetStateAction<string | null>>;
  setDeleteCommunityNameInput: Dispatch<SetStateAction<string>>;
  setDeleteCommunityConfirmInput: Dispatch<SetStateAction<string>>;
  setShowDeleteCommunityModal: Dispatch<SetStateAction<boolean>>;
  setIsDeletingCommunity: Dispatch<SetStateAction<boolean>>;
  setActiveCommunityId: Dispatch<SetStateAction<string | null>>;
  setActivePage: Dispatch<SetStateAction<PageT>>;
  setActiveView: Dispatch<SetStateAction<ViewT>>;
  setCommunityTab: Dispatch<SetStateAction<TabT>>;
  setCommunities: Dispatch<SetStateAction<CommunityT[]>>;
  setCommunityRoleById: Dispatch<SetStateAction<Record<string, string>>>;
  getCommunityId: (community: CommunityT) => string;
  deleteFailureMessage?: string;
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return fallback;
}

export function useCommunityDeleteController<
  SessionT,
  CommunityT,
  PageT extends string,
  ViewT extends string,
  TabT extends string,
>(
  args: UseCommunityDeleteControllerArgs<SessionT, CommunityT, PageT, ViewT, TabT>,
): {
  openDeleteCommunityModal: () => void;
  closeDeleteCommunityModal: () => void;
  handleConfirmDeleteCommunity: () => Promise<void>;
} {
  const {
    session: session,
    activeCommunityId,
    loadCommunities,
    setDeleteCommunityError,
    setDeleteCommunityNameInput,
    setDeleteCommunityConfirmInput,
    setShowDeleteCommunityModal,
    setIsDeletingCommunity,
    setActiveCommunityId,
    setActivePage,
    setActiveView,
    setCommunityTab,
    setCommunities,
    setCommunityRoleById,
    getCommunityId,
    deleteFailureMessage,
  } = args;

  const openDeleteCommunityModal = useCallback(() => {
    setDeleteCommunityError(null);
    setDeleteCommunityNameInput("");
    setDeleteCommunityConfirmInput("");
    setShowDeleteCommunityModal(true);
  }, [setDeleteCommunityConfirmInput, setDeleteCommunityError, setDeleteCommunityNameInput, setShowDeleteCommunityModal]);

  const closeDeleteCommunityModal = useCallback(() => {
    setShowDeleteCommunityModal(false);
    setDeleteCommunityError(null);
    setDeleteCommunityNameInput("");
    setDeleteCommunityConfirmInput("");
    setIsDeletingCommunity(false);
  }, [setDeleteCommunityConfirmInput, setDeleteCommunityError, setDeleteCommunityNameInput, setIsDeletingCommunity, setShowDeleteCommunityModal]);

  const handleConfirmDeleteCommunity = useCallback(async () => {
    if (!session || !activeCommunityId) return;
    setDeleteCommunityError(null);
    setIsDeletingCommunity(true);
    try {
      const deletedId = activeCommunityId;
      await deleteCloudCommunity({
        session,
        communityId: deletedId,
      });
      setShowDeleteCommunityModal(false);
      setActiveCommunityId(null);
      setActivePage("workspace" as PageT);
      setActiveView("home" as ViewT);
      setCommunityTab("chat" as TabT);
      setCommunities((prev) => prev.filter((community) => getCommunityId(community) !== deletedId));
      setCommunityRoleById((prev) => {
        const next = { ...prev };
        delete next[deletedId];
        return next;
      });
      await loadCommunities(session);
    } catch (error) {
      setDeleteCommunityError(
        getErrorMessage(error, deleteFailureMessage ?? "Failed to delete community."),
      );
    } finally {
      setIsDeletingCommunity(false);
    }
  }, [
    activeCommunityId,
    deleteFailureMessage,
    getCommunityId,
    loadCommunities,
    setActiveCommunityId,
    setActivePage,
    setActiveView,
    setCommunities,
    setCommunityRoleById,
    setCommunityTab,
    setDeleteCommunityError,
    setIsDeletingCommunity,
    setShowDeleteCommunityModal,
    session,
  ]);

  return {
    openDeleteCommunityModal,
    closeDeleteCommunityModal,
    handleConfirmDeleteCommunity,
  };
}
