import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthSession } from "../auth";
import { isValidCommunitySlug } from "../../../../shared/communitySlug";
import { useCommunityMemberSettingsDataController } from "../../../../shared/useCommunityMemberSettingsDataController";
import { useCommunitySettingsGovernanceController } from "../../../../shared/useCommunitySettingsGovernanceController";
import type { WebCommunityRecord } from "../webAppContracts";
import type { useWebCommunityAdminUiController } from "./useWebCommunityAdminUiController";
import {
  type CommunitySettingsSavedSnapshot,
  type useWebCommunitySettingsUiController,
} from "./useWebCommunitySettingsUiController";
import {
  coerceCommunityVisualIdentity,
  type CommunityVisualIdentity,
} from "../../../../shared/communityVisualIdentity";
import {
  archiveCloudCommunity,
  fetchCloudCommunitySettings,
  type CloudCommunityArchiveResult,
  type CloudCommunitySettingsSnapshot,
} from "../../../../shared/cloudCommunityAdminGateway";

type EnsureAuthSession = (
  session?: AuthSession | null,
  source?: string,
  options?: { forceRefresh?: boolean },
) => Promise<AuthSession | null>;

function formatPriceBaseUnits(value: number | null): string {
  if (value === null) return "";
  return (value / 100).toFixed(2).replace(/\.?0+$/, "");
}

function toSavedSnapshot(
  result: CloudCommunitySettingsSnapshot,
): CommunitySettingsSavedSnapshot {
  return {
    communityId: result.community_id,
    settingsRevision: result.settings_revision,
    updatedAt: result.updated_at,
    brandingRevision: result.branding_revision ?? null,
    name: result.name,
    slug: result.slug,
    oneLiner: result.one_liner ?? "",
    about: result.about ?? "",
    visibility: result.visibility,
    avatarUrl: result.avatar_url,
    avatarStorageId: result.avatar_storage_id,
    avatarFocusX: result.avatar_focus_x,
    avatarFocusY: result.avatar_focus_y,
    avatarZoom: result.avatar_zoom,
    bannerUrl: result.banner_url,
    bannerStorageId: result.banner_storage_id,
    bannerFocusX: result.banner_focus_x,
    bannerFocusY: result.banner_focus_y,
    bannerZoom: result.banner_zoom,
    pricing: {
      mode: result.pricing.mode,
      monthly: formatPriceBaseUnits(result.pricing.monthly_amount_base_units),
      annual: formatPriceBaseUnits(result.pricing.annual_amount_base_units),
    },
  };
}

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
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const { adminUi, settingsUi } = params;
  const [isArchivingCommunity, setIsArchivingCommunity] = useState(false);
  const [communityArchiveError, setCommunityArchiveError] = useState<string | null>(null);

  useEffect(() => {
    setIsArchivingCommunity(false);
    setCommunityArchiveError(null);
  }, [params.activeCommunityId]);

  const { loadCommunityMemberSettings } =
    useCommunityMemberSettingsDataController<AuthSession>({
      ensureSession: params.ensureSession,
      setCommunityMemberMuted: adminUi.setCommunityMemberMuted,
      setIsLoadingCommunityMemberSettings:
        adminUi.setIsLoadingCommunityMemberSettings,
      setCommunityMemberSettingsError:
        adminUi.setCommunityMemberSettingsError,
    });

  const resetCommunitySettingsSelection = useCallback(
    (communityId: string | null) => {
      paramsRef.current.settingsUi.resetCommunitySettingsSelection(communityId);
      paramsRef.current.adminUi.setCommunityMemberSettingsError(null);
      if (!communityId) paramsRef.current.adminUi.setCommunityMemberMuted(false);
    },
    [],
  );

  const loadCommunitySettings = useCallback(async (input: {
    communityId: string;
    session: AuthSession;
    force?: boolean;
    shouldIgnore?: () => boolean;
  }) => {
    const current = paramsRef.current;
    const ui = current.settingsUi;
    const requestSequence = ++ui.communitySettingsLoadSequenceRef.current;
    const draftRevision = ui.communitySettingsDraftRevisionRef.current;
    ui.setIsLoadingCommunitySettings(true);
    ui.setCommunitySettingsError(null);
    try {
      const session = await current.ensureSession(input.session);
      if (!session) throw new Error("community_settings_session_required");
      const result = await fetchCloudCommunitySettings({
        session,
        communityId: input.communityId,
      });
      if (!result) throw new Error("community_settings_snapshot_missing");
      if (
        input.shouldIgnore?.() ||
        ui.communitySettingsLoadSequenceRef.current !== requestSequence ||
        ui.communitySettingsLoadedCommunityIdRef.current !== input.communityId
      ) {
        return;
      }
      if (
        !input.force &&
        (ui.communitySettingsDirtyRef.current ||
          ui.communitySettingsDraftRevisionRef.current !== draftRevision)
      ) {
        return;
      }
      ui.applyCommunitySettingsSnapshot(toSavedSnapshot(result));
    } catch (error) {
      if (
        input.shouldIgnore?.() ||
        ui.communitySettingsLoadSequenceRef.current !== requestSequence ||
        ui.communitySettingsLoadedCommunityIdRef.current !== input.communityId
      ) {
        return;
      }
      ui.setCommunitySettingsError(
        String(error ?? "").includes("community_settings_forbidden")
          ? "You do not have permission to manage these settings."
          : "Community settings could not be loaded. Try again.",
      );
    } finally {
      if (ui.communitySettingsLoadSequenceRef.current === requestSequence) {
        ui.setIsLoadingCommunitySettings(false);
      }
    }
  }, []);

  const handleReloadLatestCommunitySettings = useCallback(async () => {
    const current = paramsRef.current;
    const communityId = current.activeCommunityId;
    const session = current.session;
    if (!communityId || !session) return;
    await loadCommunitySettings({ communityId, session, force: true });
  }, [loadCommunitySettings]);

  const governance = useCommunitySettingsGovernanceController<AuthSession>({
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
    getCommunitySettingsBaseline: () =>
      settingsUi.getSavedCommunitySettingsSnapshot(params.activeCommunityId),
    onCommunitySettingsConflict: () => {
      settingsUi.setCommunitySettingsConflict(true);
    },
    onSaveCommunitySettingsSuccess: (result, context) => {
      const latest = paramsRef.current;
      const latestSettingsUi = latest.settingsUi;
      const visualIdentity = coerceCommunityVisualIdentity(
        result.visual_identity,
        { id: result.community_id, ...result },
      );
      if (visualIdentity) latest.onVisualIdentitySaved?.(visualIdentity);
      latest.setCommunities((current) =>
        current.map((community) =>
          community.id === result.community_id
            ? {
                ...community,
                name: result.name,
                slug: result.slug,
                one_liner: result.one_liner,
                about: result.about,
                avatar_url: result.avatar_url,
                avatar_storage_id: result.avatar_storage_id,
                avatar_focus_x: result.avatar_focus_x,
                avatar_focus_y: result.avatar_focus_y,
                avatar_zoom: result.avatar_zoom,
                banner_url: result.banner_url,
                banner_storage_id: result.banner_storage_id,
                banner_focus_x: result.banner_focus_x,
                banner_focus_y: result.banner_focus_y,
                banner_zoom: result.banner_zoom,
                visibility: result.visibility,
                updated_at: result.updated_at,
                branding_revision:
                  result.branding_revision ?? community.branding_revision ?? null,
                visual_identity:
                  visualIdentity ?? community.visual_identity ?? null,
              }
            : community,
        ),
      );
      if (latest.activeCommunityId === result.community_id) {
        latest.onCommunityIdentityChanged(result.community_id, result.slug);
      }
      const snapshot = toSavedSnapshot(result);
      latestSettingsUi.rememberSavedCommunitySettings(snapshot);
      latestSettingsUi.setCommunitySettingsConflict(false);
      if (
        latestSettingsUi.communitySettingsLoadedCommunityIdRef.current ===
          result.community_id &&
        latestSettingsUi.communitySettingsDraftRevisionRef.current ===
          context.savedDraftRevision
      ) {
        latestSettingsUi.applyCommunitySettingsSnapshot(snapshot);
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
    resetCommunitySettingsSelection,
    loadCommunitySettings,
    loadCommunityMemberSettings,
    handleToggleCommunityMute: governance.handleToggleCommunityMute,
    handleLeaveCommunity: governance.handleLeaveCommunity,
    handleSaveCommunitySettings: governance.handleSaveCommunitySettings,
    handleCancelCommunitySettings: settingsUi.handleCancelCommunitySettings,
    handleReloadLatestCommunitySettings,
    handleArchiveCommunity,
    isArchivingCommunity,
    communityArchiveError,
  };
}
