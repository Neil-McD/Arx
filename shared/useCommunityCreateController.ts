import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type DragEvent,
  type SetStateAction,
} from "react";
import { type CreateCommunityIntentDraft } from "./createCommunityIntent";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";

import {
  createCloudCommunity,
  prepareCloudCommunityBrandingField,
} from "./cloudCommunityAdminGateway";
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

type UseCommunityCreateControllerArgs<
  SessionT extends SessionLike,
  CommunityT extends CommunityLike,
> = {
  session: SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
  isAccountSetupResolved: boolean;
  isAccountSetupComplete: boolean;
  onPrimaryUnauthenticated: (draft: CreateCommunityIntentDraft) => Promise<void> | void;
  onCreateUnauthenticated?: (draft: CreateCommunityIntentDraft) => Promise<void> | void;
  onAccountSetupRequired?: () => void;
  onAccountSetupUnavailable?: () => void;
  onCommunityCreated: (
    community: CommunityT,
    context: { founderSubscriptionId: string | null },
  ) => Promise<void> | void;
  onCommunityCreateRecoveryRequired?: (
    founderSubscriptionId: string | null,
  ) => Promise<void> | void;
  onRequiredCommunityCreateUnavailable?: (
    founderSubscriptionId: string,
    error: unknown,
  ) => Promise<void> | void;
  founderSubscriptionId: string | null;
  isCreateCommunityDismissible: boolean;
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
  setIsProcessingCreateAvatar: Dispatch<SetStateAction<boolean>>;
  setIsProcessingCreateBanner: Dispatch<SetStateAction<boolean>>;
  readBannerFileAsWideDataUrlWithinLimit: (file: File, maxChars: number) => Promise<string>;
  isLikelyImageFile: (file: File) => boolean;
  maxCreateImageDataUrlChars: number;
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
  if (message.includes("community_owner_limit_reached")) {
    return "You've reached the limit of live communities. Archive one to start another.";
  }
  if (message.includes("founder_subscription_already_attached")) {
    return "This Agent plan is already attached to a community.";
  }
  return message;
}

function isRequiredFounderSubscriptionUnavailableError(message: string): boolean {
  return [
    "founder_subscription_forbidden",
    "founder_subscription_risk_revoked",
    "founder_subscription_price_mismatch",
    "founder_subscription_inactive",
    "founder_stripe_price",
  ].some((code) => message.includes(code));
}

function slugifyCommunityCreateName(name: string): string {
  return slugifyCommunityName(name)
    .slice(0, 32)
    .replace(/-+$/g, "");
}

export function useCommunityCreateController<
  SessionT extends SessionLike,
  CommunityT extends CommunityLike,
>(args: UseCommunityCreateControllerArgs<SessionT, CommunityT>) {
  const argsRef = useRef(args);
  const createInFlightRef = useRef(false);
  argsRef.current = args;

  useEffect(() => {
    if (args.createCommunitySlugEdited) return;
    args.setCreateCommunitySlug(slugifyCommunityCreateName(args.createCommunityName));
  }, [args.createCommunityName, args.createCommunitySlugEdited, args.setCreateCommunitySlug]);

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
    current.setIsProcessingCreateAvatar(false);
    current.setIsProcessingCreateBanner(false);
  }, []);

  const closeCreateCommunityModal = useCallback(() => {
    const current = argsRef.current;
    if (createInFlightRef.current || !current.isCreateCommunityDismissible) return;
    current.setShowCreateCommunityModal(false);
    current.setCreateCommunityError(null);
  }, []);

  const openCreateCommunityModal = useCallback((draft: CreateCommunityIntentDraft | null = null) => {
    const current = argsRef.current;
    if (current.session && !current.isAccountSetupResolved) {
      current.onAccountSetupUnavailable?.();
      return;
    }
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
    const rawSlug = current.createCommunitySlug.trim() || slugifyCommunityCreateName(name);
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
    if (createInFlightRef.current) return;
    createInFlightRef.current = true;
    const current = argsRef.current;
    try {
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
      if (!current.isAccountSetupResolved) {
        current.setCreateCommunityError(
          "We are still verifying your account. Try again in a moment.",
        );
        return;
      }
      if (!current.isAccountSetupComplete) {
        current.setCreateCommunityError("Finish account setup before creating a community.");
        current.onAccountSetupRequired?.();
        return;
      }

      const name = current.createCommunityName.trim();
      const rawSlug = current.createCommunitySlug.trim() || slugifyCommunityCreateName(name);
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
      const founderSubscriptionId = current.founderSubscriptionId;
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
        avatarFocusX: 0.5,
        avatarFocusY: 0.5,
        avatarZoom: 1,
        oneLiner: current.createCommunityOneLiner.trim() || null,
        bannerStorageId: bannerField.storageId ?? null,
        bannerUrl: bannerField.url ?? null,
        bannerFocusX: 0.5,
        bannerFocusY: 0.5,
        bannerZoom: 1,
        founderSubscriptionId,
      });
      if (!community?.id) {
        current.setCreateCommunityError("Failed to create community.");
        return;
      }
      await current.onCommunityCreated(community, { founderSubscriptionId });
      resetCreateCommunityForm();
      current.setShowCreateCommunityModal(false);
      current.setCreateCommunityError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "");
      if (
        message.includes("founder_subscription_already_attached")
        && current.onCommunityCreateRecoveryRequired
      ) {
        try {
          await current.onCommunityCreateRecoveryRequired(current.founderSubscriptionId);
          current.setShowCreateCommunityModal(false);
          current.setCreateCommunityError(null);
        } catch {
          current.setCreateCommunityError(
            "Your Builder subscription is already attached. Refresh to load its community.",
          );
        }
        return;
      }
      if (
        current.founderSubscriptionId
        && isRequiredFounderSubscriptionUnavailableError(message)
        && current.onRequiredCommunityCreateUnavailable
      ) {
        await current.onRequiredCommunityCreateUnavailable(
          current.founderSubscriptionId,
          error,
        );
        current.setShowCreateCommunityModal(false);
        current.setCreateCommunityError(null);
        return;
      }
      current.setCreateCommunityError(mapCreateCommunityErrorMessage(error));
    } finally {
      current.setIsCreatingCommunity(false);
      createInFlightRef.current = false;
    }
  }, [buildCreateCommunityIntentFromState, resetCreateCommunityForm]);

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
    if (!current.isAccountSetupResolved) {
      current.setCreateCommunityError(
        "We are still verifying your account. Try again in a moment.",
      );
      return;
    }
    if (!current.isAccountSetupComplete) {
      current.setCreateCommunityError("Finish account setup before creating a community.");
      current.onAccountSetupRequired?.();
      return;
    }

    await handleCreateCommunity();
  }, [buildCreateCommunityIntentFromState, closeCreateCommunityModal, handleCreateCommunity]);

  const handleCreateCommunityAvatarUpload = useCallback(async (file: File | null) => {
    const current = argsRef.current;
    if (!file) return;
    if (!current.isLikelyImageFile(file)) {
      current.setCreateCommunityError("Avatar must be an image file.");
      return;
    }
    current.setCreateCommunityError(null);
    current.setIsProcessingCreateAvatar(true);
    try {
      const dataUrl = await readCommunityAvatarFileAsDataUrlWithinLimit(
        file,
        current.maxCreateImageDataUrlChars,
      );
      current.setCreateCommunityAvatarUrl(dataUrl);
    } catch (error) {
      current.setCreateCommunityError(mapCreateCommunityErrorMessage(error));
    } finally {
      current.setIsProcessingCreateAvatar(false);
    }
  }, []);

  const handleCreateCommunityBannerUpload = useCallback(async (file: File | null) => {
    const current = argsRef.current;
    if (!file) return;
    if (!current.isLikelyImageFile(file)) {
      current.setCreateCommunityError("Banner must be an image file.");
      return;
    }
    current.setCreateCommunityError(null);
    current.setIsProcessingCreateBanner(true);
    try {
      const dataUrl = await current.readBannerFileAsWideDataUrlWithinLimit(
        file,
        current.maxCreateImageDataUrlChars,
      );
      current.setCreateCommunityBannerUrl(dataUrl);
    } catch (error) {
      current.setCreateCommunityError(mapCreateCommunityErrorMessage(error));
    } finally {
      current.setIsProcessingCreateBanner(false);
    }
  }, []);

  const handleCreateBannerDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    const current = argsRef.current;
    event.preventDefault();
    event.stopPropagation();
    current.setIsCreateBannerDragOver(false);
    void handleCreateCommunityBannerUpload(event.dataTransfer.files?.[0] ?? null);
  }, [handleCreateCommunityBannerUpload]);

  const handleCreateAvatarDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    const current = argsRef.current;
    event.preventDefault();
    event.stopPropagation();
    current.setIsCreateAvatarDragOver(false);
    void handleCreateCommunityAvatarUpload(event.dataTransfer.files?.[0] ?? null);
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
