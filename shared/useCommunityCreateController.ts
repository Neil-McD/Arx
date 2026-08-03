import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { type CreateCommunityIntentDraft } from "./createCommunityIntent";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";

import { createCloudCommunity } from "./cloudCommunityAdminGateway";
import { isValidCommunitySlug, slugifyCommunityName } from "./communitySlug";

type SessionLike = {
  user: {
    id: string;
  };
};

type CommunityLike = {
  id: string;
};

type UseCommunityCreateControllerArgs<
  SessionT extends SessionLike,
  CommunityT extends CommunityLike,
> = {
  session: SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
  isAccountSetupComplete: boolean;
  onPrimaryUnauthenticated: (draft: CreateCommunityIntentDraft) => Promise<void> | void;
  onCreateUnauthenticated?: (draft: CreateCommunityIntentDraft) => Promise<void> | void;
  onAccountSetupRequired?: () => void;
  onCommunityCreated: (community: CommunityT) => void;
  createCommunityName: string;
  createCommunitySlug: string;
  createCommunitySlugEdited: boolean;
  setCreateCommunityName: Dispatch<SetStateAction<string>>;
  setCreateCommunitySlug: Dispatch<SetStateAction<string>>;
  setCreateCommunitySlugEdited: Dispatch<SetStateAction<boolean>>;
  setCreateCommunityError: Dispatch<SetStateAction<string | null>>;
  setShowCreateCommunityModal: Dispatch<SetStateAction<boolean>>;
  setIsCreatingCommunity: Dispatch<SetStateAction<boolean>>;
  createUnauthenticatedErrorMessage: string;
};

function mapCreateCommunityErrorMessage(error: unknown): string {
  const message = typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : "Failed to create community.";
  if (message === "community_builder_required") {
    return "Your account cannot create a community yet.";
  }
  if (message.includes("account_setup_required")) {
    return "Finish account setup before creating a community.";
  }
  if (message.includes("profile_setup_required")) {
    return "Finish your profile before creating a community.";
  }
  if (message.includes("community_publish_ready_required")) {
    return "Published communities need a name, one-liner, avatar, and banner.";
  }
  if (message.includes("community_funding_required_before_create")) {
    return "Fund your existing community before creating another one.";
  }
  return message;
}

export function useCommunityCreateController<
  SessionT extends SessionLike,
  CommunityT extends CommunityLike,
>(args: UseCommunityCreateControllerArgs<SessionT, CommunityT>) {
  const argsRef = useRef(args);
  argsRef.current = args;

  useEffect(() => {
    if (args.createCommunitySlugEdited) return;
    args.setCreateCommunitySlug(slugifyCommunityName(args.createCommunityName));
  }, [args.createCommunityName, args.createCommunitySlugEdited, args.setCreateCommunitySlug]);

  const resetCreateCommunityForm = useCallback((draft: CreateCommunityIntentDraft | null = null) => {
    const current = argsRef.current;
    current.setCreateCommunityName(draft?.name ?? "");
    current.setCreateCommunitySlug(draft?.slug ?? "");
    current.setCreateCommunitySlugEdited(Boolean(draft?.slug_edited));
  }, []);

  const closeCreateCommunityModal = useCallback(() => {
    const current = argsRef.current;
    current.setShowCreateCommunityModal(false);
    current.setCreateCommunityError(null);
  }, []);

  const openCreateCommunityModal = useCallback((draft: CreateCommunityIntentDraft | null = null) => {
    const current = argsRef.current;
    if (current.session && !current.isAccountSetupComplete) {
      current.onAccountSetupRequired?.();
      return;
    }
    current.setCreateCommunityError(null);
    resetCreateCommunityForm(draft);
    current.setShowCreateCommunityModal(true);
  }, [resetCreateCommunityForm]);

  const buildCreateCommunityIntentFromState = useCallback((): CreateCommunityIntentDraft | null => {
    const current = argsRef.current;
    current.setCreateCommunityError(null);

    const name = current.createCommunityName.trim();
    const rawSlug = current.createCommunitySlug.trim() || slugifyCommunityName(name);
    const slug = rawSlug.toLowerCase();
    if (!name || !slug) {
      current.setCreateCommunityError("Name and slug are required.");
      return null;
    }
    if (!isValidCommunitySlug(slug)) {
      current.setCreateCommunityError("Slug must be 3–32 chars, lowercase, and may include dashes.");
      return null;
    }
    return {
      name,
      slug,
      slug_edited: current.createCommunitySlugEdited,
      visibility: "unlisted",
      one_liner: null,
    };
  }, []);

  const handleCreateCommunity = useCallback(async () => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    current.setCreateCommunityError(null);

    if (!session) {
      const draft = buildCreateCommunityIntentFromState();
      if (!draft) return;
      if (current.onCreateUnauthenticated) {
        await current.onCreateUnauthenticated(draft);
      } else {
        current.setCreateCommunityError(current.createUnauthenticatedErrorMessage);
      }
      return;
    }
    if (!current.isAccountSetupComplete) {
      current.setCreateCommunityError("Finish account setup before creating a community.");
      current.onAccountSetupRequired?.();
      return;
    }

    const name = current.createCommunityName.trim();
    const rawSlug = current.createCommunitySlug.trim() || slugifyCommunityName(name);
    const slug = rawSlug.toLowerCase();
    if (!name || !slug) {
      current.setCreateCommunityError("Name and slug are required.");
      return;
    }
    if (!isValidCommunitySlug(slug)) {
      current.setCreateCommunityError("Slug must be 3–32 chars, lowercase, and may include dashes.");
      return;
    }

    current.setIsCreatingCommunity(true);
    try {
      const community = await createCloudCommunity<SessionT, CommunityT>({
        session,
        name,
        slug,
        visibility: "unlisted",
        avatarStorageId: null,
        avatarUrl: null,
        oneLiner: null,
        bannerStorageId: null,
        bannerUrl: null,
      });
      if (!community?.id) {
        current.setCreateCommunityError("Failed to create community.");
        return;
      }
      current.onCommunityCreated(community);
      resetCreateCommunityForm();
      closeCreateCommunityModal();
    } catch (error) {
      current.setCreateCommunityError(mapCreateCommunityErrorMessage(error));
    } finally {
      current.setIsCreatingCommunity(false);
    }
  }, [buildCreateCommunityIntentFromState, closeCreateCommunityModal, resetCreateCommunityForm]);

  const handleCreateCommunityPrimaryAction = useCallback(async (): Promise<void> => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session) {
      const draft = buildCreateCommunityIntentFromState();
      if (!draft) return;
      closeCreateCommunityModal();
      await current.onPrimaryUnauthenticated(draft);
      return;
    }
    if (!current.isAccountSetupComplete) {
      current.setCreateCommunityError("Finish account setup before creating a community.");
      current.onAccountSetupRequired?.();
      return;
    }

    await handleCreateCommunity();
  }, [buildCreateCommunityIntentFromState, closeCreateCommunityModal, handleCreateCommunity]);

  return {
    openCreateCommunityModal,
    closeCreateCommunityModal,
    resumeCreateCommunityIntent: openCreateCommunityModal,
    handleCreateCommunityPrimaryAction,
    handleCreateCommunity,
  };
}
