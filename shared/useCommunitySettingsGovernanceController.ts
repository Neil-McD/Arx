import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";
import { toCanonicalCommunityVisibility } from "./communityVisibility";

import {
  leaveCloudCommunity,
  prepareCloudCommunityBrandingField,
  saveCloudCommunityMemberSettings,
  saveCloudCommunitySettings,
  type CloudCommunitySettingsSaveResult,
} from "./cloudCommunityAdminGateway";

type SessionLike = {
  user: {
    id: string;
  };
};

type UseCommunitySettingsGovernanceControllerArgs<SessionT extends SessionLike> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
  confirmAction: (message: string) => boolean;
  loadCommunities: (session: SessionT) => Promise<void>;
  onLeaveCommunityLocalState: (leavingCommunityId: string) => void;

  setCommunityMemberSettingsError: Dispatch<SetStateAction<string | null>>;
  setIsLoadingCommunityMemberSettings: Dispatch<SetStateAction<boolean>>;
  setCommunityMemberMuted: Dispatch<SetStateAction<boolean>>;
  setIsLeavingCommunity: Dispatch<SetStateAction<boolean>>;

  communitySettingsName: string;
  communitySettingsSlug: string;
  communitySettingsOneLiner: string;
  communitySettingsAbout: string;
  communitySettingsVisibility: string;
  communitySettingsAvatarUrl: string | null;
  communitySettingsAvatarFocusX: number;
  communitySettingsAvatarFocusY: number;
  communitySettingsAvatarZoom: number;
  communitySettingsBannerUrl: string | null;
  communitySettingsBannerFocusX: number;
  communitySettingsBannerFocusY: number;
  communitySettingsBannerZoom: number;
  activeCommunityAvatarStorageId?: string | null;
  activeCommunityBannerStorageId?: string | null;
  activeCommunityAvatarUrl?: string | null;
  activeCommunityBannerUrl?: string | null;
  communitySettingsPricingMode: string;
  communitySettingsPriceUsdMonthly: string;
  communitySettingsPriceUsdAnnual: string;
  isValidCommunitySlug: (slug: string) => boolean;
  setCommunitySettingsError: Dispatch<SetStateAction<string | null>>;
  setIsSavingCommunitySettings: Dispatch<SetStateAction<boolean>>;
  onSaveCommunitySettingsSuccess: (result: CloudCommunitySettingsSaveResult) => void;
};

function parsePriceBaseUnits(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const parsed = Number(text.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Prices must be positive numbers.");
  }
  return Math.round(parsed * 100);
}

function formatCommunitySettingsErrorMessage(error: unknown): string {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "Failed to save settings.";
  if (
    message === "community_monetization_owner_required" ||
    message === "community_owner_required"
  ) {
    return "Only the community owner can change identity, branding, publishing, or deletion settings.";
  }
  if (message === "community_builder_plan_required") {
    return "A paid creator plan is required before this community can charge for access.";
  }
  if (message === "community_stripe_connect_required") {
    return "Connect Stripe before enabling paid access for this community.";
  }
  if (message === "community_stripe_connect_not_ready") {
    return "Finish Stripe onboarding before enabling paid access for this community.";
  }
  return message;
}

export function useCommunitySettingsGovernanceController<SessionT extends SessionLike>(
  args: UseCommunitySettingsGovernanceControllerArgs<SessionT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const handleToggleCommunityMute = useCallback(async (nextMuted: boolean) => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    const communityId = current.activeCommunityId;
    if (!session || !communityId) return;
    current.setCommunityMemberSettingsError(null);
    current.setIsLoadingCommunityMemberSettings(true);
    try {
      await saveCloudCommunityMemberSettings({
        session,
        communityId,
        muted: nextMuted,
        mutedUntil: null,
      });
      current.setCommunityMemberMuted(nextMuted);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to update settings.";
      current.setCommunityMemberSettingsError(message);
    } finally {
      current.setIsLoadingCommunityMemberSettings(false);
    }
  }, []);

  const handleLeaveCommunity = useCallback(async () => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    const communityId = current.activeCommunityId;
    if (!session || !communityId) return;

    const confirmed = current.confirmAction("Leave this community? You will lose access immediately.");
    if (!confirmed) return;
    current.setCommunityMemberSettingsError(null);
    current.setIsLeavingCommunity(true);
    try {
      await leaveCloudCommunity({
        session,
        communityId,
      });
      current.onLeaveCommunityLocalState(communityId);
      await current.loadCommunities(session);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to leave community.";
      current.setCommunityMemberSettingsError(message);
    } finally {
      current.setIsLeavingCommunity(false);
    }
  }, []);

  const handleSaveCommunitySettings = useCallback(async () => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    const communityId = current.activeCommunityId;
    if (!session || !communityId) return;

    current.setCommunitySettingsError(null);
    current.setIsSavingCommunitySettings(true);
    const name = current.communitySettingsName.trim();
    const slug = current.communitySettingsSlug.trim().toLowerCase();
    if (!name || !slug) {
      current.setCommunitySettingsError("Name and slug are required.");
      current.setIsSavingCommunitySettings(false);
      return;
    }
    if (!current.isValidCommunitySlug(slug)) {
      current.setCommunitySettingsError("Slug must be 3–32 characters (letters, numbers, hyphens).");
      current.setIsSavingCommunitySettings(false);
      return;
    }

    const rawVisibility = String(current.communitySettingsVisibility ?? "")
      .trim()
      .toLowerCase();
    if (rawVisibility && !["published", "unlisted", "public", "private"].includes(rawVisibility)) {
      current.setCommunitySettingsError("Visibility must be published or unlisted.");
      current.setIsSavingCommunitySettings(false);
      return;
    }
    const visibility = toCanonicalCommunityVisibility(rawVisibility || "unlisted", "unlisted");

    try {
      const monthlyEnabled = current.communitySettingsPricingMode === "monthly";
      const annualEnabled = current.communitySettingsPricingMode === "annual";
      const monthlyAmount = monthlyEnabled ? parsePriceBaseUnits(current.communitySettingsPriceUsdMonthly) : null;
      const annualAmount = annualEnabled ? parsePriceBaseUnits(current.communitySettingsPriceUsdAnnual) : null;
      if (monthlyEnabled && monthlyAmount == null) throw new Error("Enter a monthly price.");
      if (annualEnabled && annualAmount == null) throw new Error("Enter an annual price.");
      const [avatarField, bannerField] = await Promise.all([
        prepareCloudCommunityBrandingField({
          session,
          kind: "avatar",
          nextValue: current.communitySettingsAvatarUrl,
          currentStorageId: current.activeCommunityAvatarStorageId ?? null,
          currentResolvedUrl: current.activeCommunityAvatarUrl ?? null,
        }),
        prepareCloudCommunityBrandingField({
          session,
          kind: "banner",
          nextValue: current.communitySettingsBannerUrl,
          currentStorageId: current.activeCommunityBannerStorageId ?? null,
          currentResolvedUrl: current.activeCommunityBannerUrl ?? null,
        }),
      ]);

      const result = await saveCloudCommunitySettings({
        session,
        communityId,
        name,
        slug,
        oneLiner: current.communitySettingsOneLiner.trim() || null,
        about: current.communitySettingsAbout.trim() || null,
        avatarStorageId: avatarField.storageId ?? null,
        avatarUrl: avatarField.url ?? null,
        avatarFocusX: current.communitySettingsAvatarFocusX,
        avatarFocusY: current.communitySettingsAvatarFocusY,
        avatarZoom: current.communitySettingsAvatarZoom,
        bannerStorageId: bannerField.storageId ?? null,
        bannerUrl: bannerField.url ?? null,
        bannerFocusX: current.communitySettingsBannerFocusX,
        bannerFocusY: current.communitySettingsBannerFocusY,
        bannerZoom: current.communitySettingsBannerZoom,
        visibility,
        monthlyAmountBaseUnits: monthlyAmount,
        annualAmountBaseUnits: annualAmount,
      });
      if (result?.community_id) {
        current.onSaveCommunitySettingsSuccess({
          ...result,
          visibility: toCanonicalCommunityVisibility(result.visibility, "unlisted"),
        });
      }
    } catch (error) {
      current.setCommunitySettingsError(formatCommunitySettingsErrorMessage(error));
    } finally {
      current.setIsSavingCommunitySettings(false);
    }
  }, []);

  return {
    handleToggleCommunityMute,
    handleLeaveCommunity,
    handleSaveCommunitySettings,
  };
}
