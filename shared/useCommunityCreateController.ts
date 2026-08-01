import { useCallback, useEffect, useRef, type Dispatch, type DragEvent, type SetStateAction } from "react";
import { type CreateCommunityIntentDraft } from "./createCommunityIntent";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";

import { createCloudCommunity, prepareCloudCommunityBrandingField } from "./cloudCommunityAdminGateway";
import { isValidCommunitySlug, slugifyCommunityName } from "./communitySlug";
import { readCommunityAvatarFileAsDataUrlWithinLimit } from "./imageTransforms";

type SessionLike = {
  user: {
    id: string;
  };
};

type CommunityLike = {
  id: string;
};

type BillingStatusLike = {
  account_tier: string;
  max_communities: number;
};

type UseCommunityCreateControllerArgs<
  SessionT extends SessionLike,
  CommunityT extends CommunityLike,
  BillingStatusT extends BillingStatusLike,
> = {
  session: SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
  accountCommerceStatus: BillingStatusT | null;
  isAccountSetupComplete: boolean;
  communities: CommunityT[];
  communityRoleById: Record<string, string>;
  loadAccountCommerceStatus: (session: SessionT) => Promise<BillingStatusT | null>;
  persistCreateCommunityIntent: (draft: CreateCommunityIntentDraft) => void;
  onPrimaryUnauthenticated: (draft: CreateCommunityIntentDraft) => Promise<void> | void;
  onCreateUnauthenticated?: (draft: CreateCommunityIntentDraft) => Promise<void> | void;
  onAccountSetupRequired?: () => void;
  onOwnedCommunityLimitReached?: () => void;
  onCommunityCreated: (community: CommunityT) => void;
  getOwnedCountForOpenModal?: (communities: CommunityT[], communityRoleById: Record<string, string>) => number;
  getOwnedCountForPrimary?: (communities: CommunityT[], communityRoleById: Record<string, string>) => number;
  createCommunityName: string;
  createCommunitySlug: string;
  createCommunitySlugEdited: boolean;
  createCommunityAvatarUrl: string | null;
  createCommunityOneLiner: string;
  createCommunityBannerUrl: string | null;
  setCreateCommunityName: Dispatch<SetStateAction<string>>;
  setCreateCommunitySlug: Dispatch<SetStateAction<string>>;
  setCreateCommunitySlugEdited: Dispatch<SetStateAction<boolean>>;
  setCreateCommunityAvatarUrl: Dispatch<SetStateAction<string | null>>;
  setCreateCommunityOneLiner: Dispatch<SetStateAction<string>>;
  setCreateCommunityBannerUrl: Dispatch<SetStateAction<string | null>>;
  setCreateCommunityError: Dispatch<SetStateAction<string | null>>;
  setShowCreateCommunityModal: Dispatch<SetStateAction<boolean>>;
  setIsCreatingCommunity: Dispatch<SetStateAction<boolean>>;
  setIsCreateAvatarDragOver: Dispatch<SetStateAction<boolean>>;
  setIsCreateBannerDragOver: Dispatch<SetStateAction<boolean>>;
  readBannerFileAsWideDataUrlWithinLimit: (file: File, maxChars: number) => Promise<string>;
  isLikelyImageFile: (file: File) => boolean;
  maxCreateImageDataUrlChars: number;
  createUnauthenticatedErrorMessage: string;
  bannerLoadFailureMessage: string;
};

function defaultOwnedCount<CommunityT extends CommunityLike>(
  communities: CommunityT[],
  communityRoleById: Record<string, string>,
): number {
  return communities.reduce(
    (acc, community) => acc + (communityRoleById[community.id] === "owner" ? 1 : 0),
    0,
  );
}

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
  if (message === "community_owner_limit_reached") {
    return "You've reached your community limit.";
  }
  return message;
}

export function useCommunityCreateController<
  SessionT extends SessionLike,
  CommunityT extends CommunityLike,
  BillingStatusT extends BillingStatusLike,
>(args: UseCommunityCreateControllerArgs<SessionT, CommunityT, BillingStatusT>) {
  const argsRef = useRef(args);
  argsRef.current = args;

  useEffect(() => {
    if (args.createCommunitySlugEdited) return;
    args.setCreateCommunitySlug(slugifyCommunityName(args.createCommunityName));
  }, [args.createCommunityName, args.createCommunitySlugEdited, args.setCreateCommunitySlug]);

  const getOwnedCountForOpenModal = useCallback(() => {
    const current = argsRef.current;
    if (current.getOwnedCountForOpenModal) {
      return current.getOwnedCountForOpenModal(current.communities, current.communityRoleById);
    }
    return defaultOwnedCount(current.communities, current.communityRoleById);
  }, []);

  const getOwnedCountForPrimary = useCallback(() => {
    const current = argsRef.current;
    if (current.getOwnedCountForPrimary) {
      return current.getOwnedCountForPrimary(current.communities, current.communityRoleById);
    }
    return defaultOwnedCount(current.communities, current.communityRoleById);
  }, []);

  const resetCreateCommunityForm = useCallback((draft: CreateCommunityIntentDraft | null = null) => {
    const current = argsRef.current;
    current.setCreateCommunityName(draft?.name ?? "");
    current.setCreateCommunitySlug(draft?.slug ?? "");
    current.setCreateCommunitySlugEdited(Boolean(draft?.slug_edited));
    current.setCreateCommunityAvatarUrl(null);
    current.setCreateCommunityOneLiner(draft?.one_liner ?? "");
    current.setCreateCommunityBannerUrl(null);
    current.setIsCreateAvatarDragOver(false);
    current.setIsCreateBannerDragOver(false);
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
    const max = current.accountCommerceStatus?.max_communities ?? 0;
    const ownedCount = getOwnedCountForOpenModal();
    if (max > 0 && ownedCount >= max) {
      current.onOwnedCommunityLimitReached?.();
      return;
    }

    current.setCreateCommunityError(null);
    resetCreateCommunityForm(draft);
    current.setShowCreateCommunityModal(true);
  }, [getOwnedCountForOpenModal, resetCreateCommunityForm]);

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
      one_liner: current.createCommunityOneLiner.trim() || null,
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
      const [avatarField, bannerField] = await Promise.all([
        prepareCloudCommunityBrandingField({
          session,
          kind: "avatar",
          nextValue: current.createCommunityAvatarUrl,
        }),
        prepareCloudCommunityBrandingField({
          session,
          kind: "banner",
          nextValue: current.createCommunityBannerUrl,
        }),
      ]);
      const community = await createCloudCommunity<SessionT, CommunityT>({
        session,
        name,
        slug,
        visibility: "unlisted",
        avatarStorageId: avatarField.storageId ?? null,
        avatarUrl: avatarField.url ?? null,
        oneLiner: current.createCommunityOneLiner.trim() || null,
        bannerStorageId: bannerField.storageId ?? null,
        bannerUrl: bannerField.url ?? null,
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

    const status = current.accountCommerceStatus ?? await current.loadAccountCommerceStatus(session);
    if (!status) {
      current.setCreateCommunityError("Couldn't check your account status. Try again.");
      return;
    }
    const max = status.max_communities ?? 0;
    const ownedCount = getOwnedCountForPrimary();
    const needsCommunityCreationAccess = max <= 0;
    const limitReached = max > 0 && ownedCount >= max;
    const canCreate = !needsCommunityCreationAccess && !limitReached;
    if (canCreate) {
      await handleCreateCommunity();
      return;
    }
    if (needsCommunityCreationAccess) {
      current.setCreateCommunityError("Your account cannot create a community yet.");
      return;
    }

    const draft = buildCreateCommunityIntentFromState();
    if (!draft) return;

    current.persistCreateCommunityIntent(draft);
    closeCreateCommunityModal();
    if (limitReached) {
      current.onOwnedCommunityLimitReached?.();
      return;
    }
  }, [buildCreateCommunityIntentFromState, closeCreateCommunityModal, getOwnedCountForPrimary, handleCreateCommunity]);

  const handleCreateCommunityAvatarUpload = useCallback(async (file: File | null) => {
    const current = argsRef.current;
    if (!file) return;
    try {
      const dataUrl = await readCommunityAvatarFileAsDataUrlWithinLimit(file, current.maxCreateImageDataUrlChars);
      current.setCreateCommunityAvatarUrl(dataUrl);
    } catch (error) {
      const message = typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "Failed to load image.";
      current.setCreateCommunityError(message);
    }
  }, []);

  const handleCreateCommunityBannerUpload = useCallback(async (file: File | null) => {
    const current = argsRef.current;
    if (!file) return;
    if (!current.isLikelyImageFile(file)) {
      current.setCreateCommunityError("Banner must be an image file.");
      return;
    }
    try {
      const dataUrl = await current.readBannerFileAsWideDataUrlWithinLimit(file, current.maxCreateImageDataUrlChars);
      current.setCreateCommunityBannerUrl(dataUrl);
    } catch (error) {
      const message = typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : current.bannerLoadFailureMessage;
      current.setCreateCommunityError(message);
    }
  }, []);

  const handleCreateBannerDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    const current = argsRef.current;
    event.preventDefault();
    event.stopPropagation();
    current.setIsCreateBannerDragOver(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    if (file) void handleCreateCommunityBannerUpload(file);
  }, [handleCreateCommunityBannerUpload]);

  const handleCreateAvatarDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    const current = argsRef.current;
    event.preventDefault();
    event.stopPropagation();
    current.setIsCreateAvatarDragOver(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    if (file) void handleCreateCommunityAvatarUpload(file);
  }, [handleCreateCommunityAvatarUpload]);

  return {
    openCreateCommunityModal,
    closeCreateCommunityModal,
    resumeCreateCommunityIntent: openCreateCommunityModal,
    handleCreateCommunityPrimaryAction,
    handleCreateCommunity,
    handleCreateCommunityAvatarUpload,
    handleCreateCommunityBannerUpload,
    handleCreateBannerDrop,
    handleCreateAvatarDrop,
  };
}
