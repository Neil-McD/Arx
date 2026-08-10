import { useCallback, useEffect, useState } from "react";
import type { AuthSession } from "../auth";
import { isValidCommunitySlug, slugifyCommunityName } from "../../../../shared/communitySlug";
import { toCanonicalCommunityVisibility } from "../../../../shared/communityVisibility";
import { useCommunitySettingsDataController } from "../../../../shared/useCommunitySettingsDataController";
import { useCommunitySettingsFormController } from "../../../../shared/useCommunitySettingsFormController";
import { useCommunitySettingsGovernanceController } from "../../../../shared/useCommunitySettingsGovernanceController";
import type { WebCommunityRecord } from "../webAppContracts";
import type { useWebCommunityAdminUiController } from "./useWebCommunityAdminUiController";
import type { useWebCommunitySettingsUiController } from "./useWebCommunitySettingsUiController";
import {
  coerceCommunityVisualIdentity,
  type CommunityVisualIdentity,
} from "../../../../shared/communityVisualIdentity";
import {
  archiveCloudCommunity,
  type CloudCommunityArchiveResult,
} from "../../../../shared/cloudCommunityAdminGateway";

type EnsureAuthSession = (
  session?: AuthSession | null,
  source?: string,
  options?: { forceRefresh?: boolean },
) => Promise<AuthSession | null>;

export function useWebCommunitySettingsController(params: {
  activeCommunity: WebCommunityRecord | null;
  activeCommunityId: string | null;
  adminUi: ReturnType<typeof useWebCommunityAdminUiController>;
  ensureSession: EnsureAuthSession;
  loadCommunities: (session: AuthSession) => Promise<void>;
  onCommunityIdentityChanged: (
    communityId: string,
    communitySlug: string,
  ) => void;
  onLeaveCommunity: (communityId: string) => void;
  onCommunityArchived: (
    communityId: string,
    result: CloudCommunityArchiveResult,
  ) => void;
  session: AuthSession | null;
  settingsUi: ReturnType<typeof useWebCommunitySettingsUiController>;
  setCommunities: (
    updater: (current: WebCommunityRecord[]) => WebCommunityRecord[],
  ) => void;
  onVisualIdentitySaved?: (identity: CommunityVisualIdentity) => void;
}) {
  const { adminUi, settingsUi } = params;
  const [isArchivingCommunity, setIsArchivingCommunity] = useState(false);
  const [communityArchiveError, setCommunityArchiveError] = useState<string | null>(null);

  useEffect(() => {
    setIsArchivingCommunity(false);
    setCommunityArchiveError(null);
  }, [params.activeCommunityId]);
  const { syncCommunitySettingsSelection } =
    useCommunitySettingsFormController<WebCommunityRecord>({
      slugifyCommunityName,
      communitySettingsLoadedCommunityIdRef:
        settingsUi.communitySettingsLoadedCommunityIdRef,
      communitySettingsDirtyRef: settingsUi.communitySettingsDirtyRef,
      clearCommunitySettingsDirty: settingsUi.clearCommunitySettingsDirty,
      rememberSavedCommunityIdentity:
        settingsUi.rememberSavedCommunityIdentity,
      setCommunitySettingsError: settingsUi.setCommunitySettingsError,
      setCommunityMemberSettingsError:
        adminUi.setCommunityMemberSettingsError,
      setCommunitySettingsName: settingsUi.setCommunitySettingsName,
      setCommunitySettingsSlug: settingsUi.setCommunitySettingsSlug,
      setCommunitySettingsOneLiner: settingsUi.setCommunitySettingsOneLiner,
      setCommunitySettingsAbout: settingsUi.setCommunitySettingsAbout,
      setCommunitySettingsVisibility:
        settingsUi.setCommunitySettingsVisibility,
      setCommunitySettingsAvatarUrl: settingsUi.setCommunitySettingsAvatarUrl,
      setCommunitySettingsAvatarFocusX:
        settingsUi.setCommunitySettingsAvatarFocusX,
      setCommunitySettingsAvatarFocusY:
        settingsUi.setCommunitySettingsAvatarFocusY,
      setCommunitySettingsAvatarZoom:
        settingsUi.setCommunitySettingsAvatarZoom,
      setCommunitySettingsBannerUrl: settingsUi.setCommunitySettingsBannerUrl,
      setCommunitySettingsBannerFocusX:
        settingsUi.setCommunitySettingsBannerFocusX,
      setCommunitySettingsBannerFocusY:
        settingsUi.setCommunitySettingsBannerFocusY,
      setCommunitySettingsBannerZoom:
        settingsUi.setCommunitySettingsBannerZoom,
      setCommunitySettingsPricingMode:
        settingsUi.setCommunitySettingsPricingMode,
      setCommunitySettingsPriceUsdMonthly:
        settingsUi.setCommunitySettingsPriceUsdMonthly,
      setCommunitySettingsPriceUsdAnnual:
        settingsUi.setCommunitySettingsPriceUsdAnnual,
      setCommunityMemberMuted: adminUi.setCommunityMemberMuted,
      setCommunitySettingsBannerUploadError:
        settingsUi.setCommunitySettingsBannerUploadError,
      setIsProcessingCommunitySettingsBanner:
        settingsUi.setIsProcessingCommunitySettingsBanner,
    });

  const {
    loadCommunityMemberSettings,
    loadCommunityPricing,
  } = useCommunitySettingsDataController<AuthSession>({
    ensureSession: params.ensureSession,
    communitySettingsLoadedCommunityIdRef:
      settingsUi.communitySettingsLoadedCommunityIdRef,
    communityPricingDirtyRef: settingsUi.communityPricingDirtyRef,
    setCommunityMemberMuted: adminUi.setCommunityMemberMuted,
    setIsLoadingCommunityMemberSettings:
      adminUi.setIsLoadingCommunityMemberSettings,
    setCommunityMemberSettingsError:
      adminUi.setCommunityMemberSettingsError,
    setCommunitySettingsPricingMode:
      settingsUi.setCommunitySettingsPricingMode,
    setCommunitySettingsPriceUsdMonthly:
      settingsUi.setCommunitySettingsPriceUsdMonthly,
    setCommunitySettingsPriceUsdAnnual:
      settingsUi.setCommunitySettingsPriceUsdAnnual,
    rememberSavedCommunityPricing: settingsUi.rememberSavedCommunityPricing,
  });

  const handleCancelCommunitySettings = useCallback(() => {
    settingsUi.handleCancelCommunitySettings();
    const communityId = params.activeCommunityId;
    const session = params.session;
    if (!communityId || !session) return;
    void loadCommunityPricing({
      communityId,
      session,
    });
  }, [
    loadCommunityPricing,
    params.activeCommunityId,
    params.session,
    settingsUi,
  ]);

  const governance = useCommunitySettingsGovernanceController<AuthSession>({
    activeCommunityName: params.activeCommunity?.name ?? null,
    activeCommunityOneLiner: params.activeCommunity?.one_liner ?? null,
    activeCommunityVisibility: params.activeCommunity?.visibility ?? null,
    activeCommunityAvatarStorageId:
      params.activeCommunity?.avatar_storage_id ?? null,
    activeCommunityBannerStorageId:
      params.activeCommunity?.banner_storage_id ?? null,
    activeCommunityAvatarUrl: params.activeCommunity?.avatar_url ?? null,
    activeCommunityBannerUrl: params.activeCommunity?.banner_url ?? null,
    activeCommunityId: params.activeCommunityId,
    session: params.session,
    ensureSession: params.ensureSession,
    confirmAction: (message) => confirm(message),
    loadCommunities: params.loadCommunities,
    onLeaveCommunityLocalState: params.onLeaveCommunity,
    setCommunityMemberSettingsError:
      adminUi.setCommunityMemberSettingsError,
    setIsLoadingCommunityMemberSettings:
      adminUi.setIsLoadingCommunityMemberSettings,
    setCommunityMemberMuted: adminUi.setCommunityMemberMuted,
    setIsLeavingCommunity: adminUi.setIsLeavingCommunity,
    communitySettingsName: settingsUi.communitySettingsName,
    communitySettingsSlug: settingsUi.communitySettingsSlug,
    communitySettingsOneLiner: settingsUi.communitySettingsOneLiner,
    communitySettingsAbout: settingsUi.communitySettingsAbout,
    communitySettingsVisibility: settingsUi.communitySettingsVisibility,
    communitySettingsAvatarUrl: settingsUi.communitySettingsAvatarUrl,
    communitySettingsAvatarFocusX: settingsUi.communitySettingsAvatarFocusX,
    communitySettingsAvatarFocusY: settingsUi.communitySettingsAvatarFocusY,
    communitySettingsAvatarZoom: settingsUi.communitySettingsAvatarZoom,
    communitySettingsBannerUrl: settingsUi.communitySettingsBannerUrl,
    communitySettingsBannerFocusX: settingsUi.communitySettingsBannerFocusX,
    communitySettingsBannerFocusY: settingsUi.communitySettingsBannerFocusY,
    communitySettingsBannerZoom: settingsUi.communitySettingsBannerZoom,
    communitySettingsPricingMode: settingsUi.communitySettingsPricingMode,
    communitySettingsPriceUsdMonthly:
      settingsUi.communitySettingsPriceUsdMonthly,
    communitySettingsPriceUsdAnnual:
      settingsUi.communitySettingsPriceUsdAnnual,
    isValidCommunitySlug,
    setCommunitySettingsError: settingsUi.setCommunitySettingsError,
    setIsSavingCommunitySettings: settingsUi.setIsSavingCommunitySettings,
    getCommunitySettingsDraftRevision: () =>
      settingsUi.communitySettingsDraftRevisionRef.current,
    onSaveCommunitySettingsSuccess: (result, context) => {
      const visualIdentity = coerceCommunityVisualIdentity(
        result.visual_identity,
        { id: result.community_id, ...result },
      );
      if (visualIdentity) params.onVisualIdentitySaved?.(visualIdentity);
      params.setCommunities((current) =>
        current.map((community) =>
          community.id === result.community_id
            ? {
                ...community,
                name: result.name,
                slug: result.slug,
                one_liner: result.one_liner,
                about: result.about ?? null,
                avatar_url: result.avatar_url,
                avatar_storage_id: result.avatar_storage_id ?? null,
                avatar_focus_x: result.avatar_focus_x ?? 0.5,
                avatar_focus_y: result.avatar_focus_y ?? 0.5,
                avatar_zoom: result.avatar_zoom ?? 1,
                banner_url: result.banner_url,
                banner_storage_id: result.banner_storage_id ?? null,
                banner_focus_x: result.banner_focus_x ?? 0.5,
                banner_focus_y: result.banner_focus_y ?? 0.5,
                banner_zoom: result.banner_zoom ?? 1,
                visibility: toCanonicalCommunityVisibility(
                  result.visibility,
                  "unlisted",
                ),
                updated_at: result.updated_at,
                branding_revision:
                  result.branding_revision ?? community.branding_revision ?? null,
                visual_identity:
                  visualIdentity ?? community.visual_identity ?? null,
              }
            : community,
        ),
      );
      if (params.activeCommunityId === result.community_id) {
        params.onCommunityIdentityChanged(result.community_id, result.slug);
      }
      settingsUi.rememberSavedCommunitySettings({
        communityId: result.community_id,
        identity: {
          name: result.name,
          slug: result.slug,
          oneLiner: result.one_liner ?? "",
          about: result.about ?? "",
          visibility: toCanonicalCommunityVisibility(result.visibility, "unlisted"),
          avatarUrl: result.avatar_url,
          avatarFocusX: result.avatar_focus_x ?? 0.5,
          avatarFocusY: result.avatar_focus_y ?? 0.5,
          avatarZoom: result.avatar_zoom ?? 1,
          bannerUrl: result.banner_url,
          bannerFocusX: result.banner_focus_x ?? 0.5,
          bannerFocusY: result.banner_focus_y ?? 0.5,
          bannerZoom: result.banner_zoom ?? 1,
        },
        pricing: context.pricing,
      });
      if (
        settingsUi.communitySettingsLoadedCommunityIdRef.current ===
          result.community_id &&
        settingsUi.communitySettingsDraftRevisionRef.current ===
          context.savedDraftRevision
      ) {
        settingsUi.clearCommunitySettingsDirty();
      }
    },
  });

  const handleArchiveCommunity = async (): Promise<void> => {
    const communityId = String(params.activeCommunityId ?? "").trim();
    if (!communityId || isArchivingCommunity) return;
    const session = await params.ensureSession(params.session ?? undefined);
    if (!session) return;
    setIsArchivingCommunity(true);
    setCommunityArchiveError(null);
    try {
      const result = await archiveCloudCommunity({ session, communityId });
      params.onCommunityArchived(communityId, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "");
      setCommunityArchiveError(
        message.includes("community_archive_platform_home_forbidden")
          ? "The Polynet home community cannot be archived."
          : message.includes("community_archive_forbidden")
            ? "Only the community owner can archive this community."
            : message.trim() || "This community could not be archived.",
      );
    } finally {
      setIsArchivingCommunity(false);
    }
  };

  return {
    syncCommunitySettingsSelection,
    loadCommunityMemberSettings,
    loadCommunityPricing,
    handleToggleCommunityMute: governance.handleToggleCommunityMute,
    handleLeaveCommunity: governance.handleLeaveCommunity,
    handleSaveCommunitySettings: governance.handleSaveCommunitySettings,
    handleCancelCommunitySettings,
    handleArchiveCommunity,
    isArchivingCommunity,
    communityArchiveError,
  };
}
