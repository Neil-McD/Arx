import { useCallback, useEffect, useRef, type Dispatch, type DragEvent, type SetStateAction } from "react";
import { type CreateCommunityDraft } from "./communityDraftStorage";

import { createCloudCommunity, prepareCloudCommunityBrandingField } from "./cloudCommunityAdminGateway";
import { isValidCommunitySlug, slugifyCommunityName } from "./communitySlug";
import { toCanonicalCommunityVisibility } from "./communityVisibility";

type SessionLike = {
  user: {
    id: string;
  };
};

type CommunityLike = {
  id: string;
};

type BillingStatusLike = {
  builder_tier: string;
  max_communities: number;
};

type Visibility = "published" | "unlisted";

type UseCommunityCreateControllerArgs<
  SessionT extends SessionLike,
  CommunityT extends CommunityLike,
  BillingStatusT extends BillingStatusLike,
> = {
  session: SessionT | null;
  builderBillingStatus: BillingStatusT | null;
  communities: CommunityT[];
  communityRoleById: Record<string, string>;
  loadBuilderBillingStatus: (session: SessionT) => Promise<BillingStatusT | null>;
  openBuilderBillingPortal: (context: "create_community") => Promise<void>;
  onStartUpgradeFlow: () => void;
  onPrimaryUnauthenticated: (draft: CreateCommunityDraft | null) => Promise<void> | void;
  buildDraftOnPrimaryUnauthenticated: boolean;
  onCreateUnauthenticated?: (draft: CreateCommunityDraft | null) => Promise<void> | void;
  buildDraftOnCreateUnauthenticated: boolean;
  onOwnedCommunityLimitReached?: () => void;
  onCommunityCreated: (community: CommunityT) => void;
  onDraftCreatedCommunitySuccess?: () => void;
  getOwnedCountForOpenModal?: (communities: CommunityT[], communityRoleById: Record<string, string>) => number;
  getOwnedCountForPrimary?: (communities: CommunityT[], communityRoleById: Record<string, string>) => number;
  createCommunityName: string;
  createCommunitySlug: string;
  createCommunitySlugEdited: boolean;
  createCommunityVisibility: Visibility;
  createCommunityAvatarUrl: string | null;
  createCommunityDescription: string;
  createCommunityBannerUrl: string | null;
  setCreateCommunityName: Dispatch<SetStateAction<string>>;
  setCreateCommunitySlug: Dispatch<SetStateAction<string>>;
  setCreateCommunitySlugEdited: Dispatch<SetStateAction<boolean>>;
  setCreateCommunityVisibility: Dispatch<SetStateAction<Visibility>>;
  setCreateCommunityAvatarUrl: Dispatch<SetStateAction<string | null>>;
  setCreateCommunityDescription: Dispatch<SetStateAction<string>>;
  setCreateCommunityBannerUrl: Dispatch<SetStateAction<string | null>>;
  setCreateCommunityError: Dispatch<SetStateAction<string | null>>;
  setShowCreateCommunityModal: Dispatch<SetStateAction<boolean>>;
  setIsCreatingCommunity: Dispatch<SetStateAction<boolean>>;
  setIsFinalizingCreateCommunityFromBilling: Dispatch<SetStateAction<boolean>>;
  setFinalizeCreateCommunityError: Dispatch<SetStateAction<string | null>>;
  setIsCreateAvatarDragOver: Dispatch<SetStateAction<boolean>>;
  setIsCreateBannerDragOver: Dispatch<SetStateAction<boolean>>;
  readAvatarFileAsSquareDataUrl: (file: File, size?: number) => Promise<string>;
  readBannerFileAsWideDataUrlWithinLimit: (file: File, maxChars: number) => Promise<string>;
  isLikelyImageFile: (file: File) => boolean;
  maxCreateImageDataUrlChars: number;
  createDraftId: () => string;
  loadCreateDraft: () => CreateCommunityDraft | null;
  saveCreateDraft: (draft: CreateCommunityDraft) => void;
  clearCreateDraft: () => void;
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
    return "Builder is required to create a community.";
  }
  if (message === "community_owner_limit_reached") {
    return "You've reached your Builder community limit.";
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

  const closeCreateCommunityModal = useCallback(() => {
    const current = argsRef.current;
    current.setShowCreateCommunityModal(false);
    current.setCreateCommunityError(null);
  }, []);

  const openCreateCommunityModal = useCallback(() => {
    const current = argsRef.current;
    const tier = (current.builderBillingStatus?.builder_tier ?? "free").toLowerCase();
    const max = current.builderBillingStatus?.max_communities ?? 0;
    const ownedCount = getOwnedCountForOpenModal();
    if (tier === "builder" && max > 0 && ownedCount >= max) {
      current.onOwnedCommunityLimitReached?.();
      return;
    }

    current.setCreateCommunityError(null);
    const draft = current.loadCreateDraft();
    const session = current.session;
    const currentUserId = session?.user.id ?? null;
    if (draft && draft.user_id && currentUserId && draft.user_id !== currentUserId) {
      current.clearCreateDraft();
    }
    const safeDraft = draft && (!draft.user_id || !currentUserId || draft.user_id === currentUserId) ? draft : null;
    current.setCreateCommunityName(safeDraft?.name ?? "");
    current.setCreateCommunitySlug(safeDraft?.slug ?? "");
    current.setCreateCommunitySlugEdited(Boolean(safeDraft?.slug_edited));
    current.setCreateCommunityVisibility(toCanonicalCommunityVisibility(safeDraft?.visibility, "unlisted"));
    current.setCreateCommunityAvatarUrl(safeDraft?.avatar_url ?? null);
    current.setCreateCommunityDescription(safeDraft?.description ?? "");
    current.setCreateCommunityBannerUrl(safeDraft?.banner_url ?? null);
    current.setIsCreateAvatarDragOver(false);
    current.setIsCreateBannerDragOver(false);
    current.setShowCreateCommunityModal(true);
  }, [getOwnedCountForOpenModal]);

  const buildCreateCommunityDraftFromState = useCallback((): CreateCommunityDraft | null => {
    const current = argsRef.current;
    const session = current.session;
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
    if (!["published", "unlisted"].includes(current.createCommunityVisibility)) {
      current.setCreateCommunityError("Visibility must be published or unlisted.");
      return null;
    }

    const draft: CreateCommunityDraft = {
      v: 1,
      id: current.createDraftId(),
      created_at: Date.now(),
      user_id: session?.user.id ?? null,
      name,
      slug,
      slug_edited: current.createCommunitySlugEdited,
      visibility: current.createCommunityVisibility,
      avatar_url: current.createCommunityAvatarUrl?.trim() || null,
      banner_url: current.createCommunityBannerUrl?.trim() || null,
      description: current.createCommunityDescription.trim() || null,
    };
    current.saveCreateDraft(draft);
    return draft;
  }, []);

  const createCommunityFromDraft = useCallback(async (
    draft: CreateCommunityDraft,
    session: SessionT,
  ): Promise<CommunityT | null> => {
    const current = argsRef.current;
    current.setFinalizeCreateCommunityError(null);
    current.setIsFinalizingCreateCommunityFromBilling(true);
    try {
      const [avatarField, bannerField] = await Promise.all([
        prepareCloudCommunityBrandingField({
          session,
          kind: "avatar",
          nextValue: draft.avatar_url,
        }),
        prepareCloudCommunityBrandingField({
          session,
          kind: "banner",
          nextValue: draft.banner_url,
        }),
      ]);
      const community = await createCloudCommunity<SessionT, CommunityT>({
        session,
        name: draft.name,
        slug: draft.slug,
        visibility: draft.visibility,
        avatarStorageId: avatarField.storageId ?? null,
        avatarUrl: avatarField.url ?? null,
        description: draft.description,
        bannerStorageId: bannerField.storageId ?? null,
        bannerUrl: bannerField.url ?? null,
      });
      if (!community?.id) throw new Error("Failed to create community.");

      current.onCommunityCreated(community);
      current.clearCreateDraft();
      closeCreateCommunityModal();
      current.onDraftCreatedCommunitySuccess?.();
      return community;
    } catch (error) {
      current.setFinalizeCreateCommunityError(mapCreateCommunityErrorMessage(error));
      return null;
    } finally {
      current.setIsFinalizingCreateCommunityFromBilling(false);
    }
  }, [closeCreateCommunityModal]);

  const handleCreateCommunity = useCallback(async () => {
    const current = argsRef.current;
    const session = current.session;
    current.setCreateCommunityError(null);

    if (!session) {
      const draft = current.buildDraftOnCreateUnauthenticated ? buildCreateCommunityDraftFromState() : null;
      if (current.onCreateUnauthenticated) {
        await current.onCreateUnauthenticated(draft);
      } else {
        current.setCreateCommunityError(current.createUnauthenticatedErrorMessage);
      }
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

    if (!["published", "unlisted"].includes(current.createCommunityVisibility)) {
      current.setCreateCommunityError("Visibility must be published or unlisted.");
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
        visibility: current.createCommunityVisibility,
        avatarStorageId: avatarField.storageId ?? null,
        avatarUrl: avatarField.url ?? null,
        description: current.createCommunityDescription.trim() || null,
        bannerStorageId: bannerField.storageId ?? null,
        bannerUrl: bannerField.url ?? null,
      });
      if (!community?.id) {
        current.setCreateCommunityError("Failed to create community.");
        return;
      }
      current.onCommunityCreated(community);
      current.clearCreateDraft();
      closeCreateCommunityModal();
    } catch (error) {
      current.setCreateCommunityError(mapCreateCommunityErrorMessage(error));
    } finally {
      current.setIsCreatingCommunity(false);
    }
  }, [buildCreateCommunityDraftFromState, closeCreateCommunityModal]);

  const handleCreateCommunityPrimaryAction = useCallback(async (): Promise<void> => {
    const current = argsRef.current;
    const session = current.session;
    current.setFinalizeCreateCommunityError(null);
    if (!session) {
      const draft = current.buildDraftOnPrimaryUnauthenticated ? buildCreateCommunityDraftFromState() : null;
      closeCreateCommunityModal();
      await current.onPrimaryUnauthenticated(draft);
      return;
    }

    const status = current.builderBillingStatus ?? await current.loadBuilderBillingStatus(session);
    if (!status) {
      current.setCreateCommunityError("Couldn't check your plan. Try again.");
      return;
    }
    const tier = (status.builder_tier ?? "free").toLowerCase();
    const max = status.max_communities ?? 0;
    const ownedCount = getOwnedCountForPrimary();
    const needsPlan = tier === "free";
    const limitReached = tier !== "free" && max > 0 && ownedCount >= max;
    const canCreate = !needsPlan && !limitReached;
    if (canCreate) {
      await handleCreateCommunity();
      return;
    }

    const draft = buildCreateCommunityDraftFromState();
    if (!draft) return;

    closeCreateCommunityModal();
    if (limitReached) {
      await current.openBuilderBillingPortal("create_community");
      return;
    }
    current.onStartUpgradeFlow();
  }, [buildCreateCommunityDraftFromState, closeCreateCommunityModal, getOwnedCountForPrimary, handleCreateCommunity]);

  const handleCreateCommunityAvatarUpload = useCallback(async (file: File | null) => {
    const current = argsRef.current;
    if (!file) return;
    try {
      const dataUrl = await current.readAvatarFileAsSquareDataUrl(file, 128);
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
    buildCreateCommunityDraftFromState,
    createCommunityFromDraft,
    handleCreateCommunityPrimaryAction,
    handleCreateCommunity,
    handleCreateCommunityAvatarUpload,
    handleCreateCommunityBannerUpload,
    handleCreateBannerDrop,
    handleCreateAvatarDrop,
  };
}
