import type { Dispatch, SetStateAction } from "react";
import type { useWebCommunityAdministrationState } from "./useWebCommunityAdministrationState";
import type { useWebCommunitySettingsController } from "./useWebCommunitySettingsController";
import type { useWebSettingsImageUploadController } from "../../../../shared/useWebSettingsImageUploadController";
import type { useWebOnboardingProfileController } from "./useWebOnboardingProfileController";
import type { BuildWebCommunitySurfaceProjectionParams } from "./buildWebCommunitySurfaceProjection";

type CommunityAdministration = ReturnType<typeof useWebCommunityAdministrationState>;
type CommunitySettingsController = ReturnType<typeof useWebCommunitySettingsController>;
type SettingsImageUploadController = ReturnType<typeof useWebSettingsImageUploadController>;
type ProfileUi = ReturnType<typeof useWebOnboardingProfileController>["profile"];

export function buildWebCommunitySettingsImageUploadArgs(params: {
  settingsUi: CommunityAdministration["settingsUi"];
  profileUi: ProfileUi;
  isLikelyImageFile: (file: File) => boolean;
  maxWebImageDataUrlChars: number;
  setAuthError: Dispatch<SetStateAction<string | null>>;
}) {
  const { settingsUi, profileUi } = params;
  return {
    setIsSettingsBannerDragOver: settingsUi.setIsSettingsBannerDragOver,
    setIsSettingsAvatarDragOver: settingsUi.setIsSettingsAvatarDragOver,
    setIsProfileAvatarDragOver: profileUi.setIsProfileAvatarDragOver,
    setCommunitySettingsAvatarUrl: settingsUi.setCommunitySettingsAvatarUrl,
    setCommunitySettingsAvatarFocusX: settingsUi.setCommunitySettingsAvatarFocusX,
    setCommunitySettingsAvatarFocusY: settingsUi.setCommunitySettingsAvatarFocusY,
    setCommunitySettingsAvatarZoom: settingsUi.setCommunitySettingsAvatarZoom,
    setCommunitySettingsBannerUrl: settingsUi.setCommunitySettingsBannerUrl,
    setCommunitySettingsBannerFocusX: settingsUi.setCommunitySettingsBannerFocusX,
    setCommunitySettingsBannerFocusY: settingsUi.setCommunitySettingsBannerFocusY,
    setCommunitySettingsBannerZoom: settingsUi.setCommunitySettingsBannerZoom,
    setCommunitySettingsError: settingsUi.setCommunitySettingsError,
    setCommunitySettingsBannerUploadError: settingsUi.setCommunitySettingsBannerUploadError,
    setIsProcessingCommunitySettingsBanner: settingsUi.setIsProcessingCommunitySettingsBanner,
    markCommunitySettingsDirty: settingsUi.markCommunitySettingsDirty,
    onCommunityAvatarUploadSuccess: () => settingsUi.setIsCommunityAvatarFocusModalOpen(true),
    onCommunityBannerUploadSuccess: () => settingsUi.setIsCommunityBannerFocusModalOpen(true),
    isLikelyImageFile: params.isLikelyImageFile,
    maxWebImageDataUrlChars: params.maxWebImageDataUrlChars,
    setProfileAvatarUrl: profileUi.setProfileAvatarUrl,
    setProfileAvatarStorageId: profileUi.setProfileAvatarStorageId,
    setProfileAvatarFocusX: profileUi.setProfileAvatarFocusX,
    setProfileAvatarFocusY: profileUi.setProfileAvatarFocusY,
    setProfileAvatarZoom: profileUi.setProfileAvatarZoom,
    setAuthError: params.setAuthError,
    onProfileAvatarUploadSuccess: () => profileUi.setIsProfileAvatarFocusModalOpen(true),
  };
}

export function buildWebCommunitySettingsSignOutResetArgs(
  settingsUi: CommunityAdministration["settingsUi"],
) {
  return {
    setCommunitySettingsName: settingsUi.setCommunitySettingsName,
    setCommunitySettingsSlug: settingsUi.setCommunitySettingsSlug,
    setCommunitySettingsOneLiner: settingsUi.setCommunitySettingsOneLiner,
    setCommunitySettingsVisibility: settingsUi.setCommunitySettingsVisibility,
    setCommunitySettingsAvatarUrl: settingsUi.setCommunitySettingsAvatarUrl,
    setCommunitySettingsBannerUrl: settingsUi.setCommunitySettingsBannerUrl,
    setCommunitySettingsError: settingsUi.setCommunitySettingsError,
    setIsSavingCommunitySettings: settingsUi.setIsSavingCommunitySettings,
    setIsSettingsBannerDragOver: settingsUi.setIsSettingsBannerDragOver,
    setIsSettingsAvatarDragOver: settingsUi.setIsSettingsAvatarDragOver,
  };
}

export function buildWebCommunitySettingsProjectionBindings(params: {
  administration: CommunityAdministration;
  settingsController: CommunitySettingsController;
  imageUpload: SettingsImageUploadController;
  handleSaveCommunityAgentConfig: () => Promise<boolean> | boolean;
}): Pick<
  BuildWebCommunitySurfaceProjectionParams,
  | "settingsState"
  | "settingsActions"
  | "setIsCommunityAvatarFocusModalOpen"
  | "setIsCommunityBannerFocusModalOpen"
  | "communitySettingsAvatarUrl"
  | "communitySettingsAvatarFocusX"
  | "communitySettingsAvatarFocusY"
  | "communitySettingsAvatarZoom"
  | "communitySettingsBannerUrl"
  | "communitySettingsBannerFocusX"
  | "communitySettingsBannerFocusY"
  | "communitySettingsBannerZoom"
  | "markCommunitySettingsDirty"
  | "isLoadingCommunityAgentConfig"
  | "communityAgentConfigError"
  | "aiAgentInstructionsEditorProps"
  | "analyticsState"
  | "analyticsActions"
> {
  const { settingsUi, agentConfigUi, adminUi, analytics } = params.administration;
  const { settingsController, imageUpload } = params;

  return {
    settingsState: {
      isSettingsBannerDragOver: settingsUi.isSettingsBannerDragOver,
      isProcessingCommunitySettingsBanner: settingsUi.isProcessingCommunitySettingsBanner,
      isCommunityAvatarFocusModalOpen: settingsUi.isCommunityAvatarFocusModalOpen,
      isCommunityBannerFocusModalOpen: settingsUi.isCommunityBannerFocusModalOpen,
      communitySettingsAvatarFocusX: settingsUi.communitySettingsAvatarFocusX,
      communitySettingsAvatarFocusY: settingsUi.communitySettingsAvatarFocusY,
      communitySettingsAvatarZoom: settingsUi.communitySettingsAvatarZoom,
      communitySettingsBannerUrl: settingsUi.communitySettingsBannerUrl,
      communitySettingsBannerFocusX: settingsUi.communitySettingsBannerFocusX,
      communitySettingsBannerFocusY: settingsUi.communitySettingsBannerFocusY,
      communitySettingsBannerZoom: settingsUi.communitySettingsBannerZoom,
      communitySettingsBannerUploadError: settingsUi.communitySettingsBannerUploadError,
      isSettingsAvatarDragOver: settingsUi.isSettingsAvatarDragOver,
      communitySettingsAvatarUrl: settingsUi.communitySettingsAvatarUrl,
      communitySettingsName: settingsUi.communitySettingsName,
      communitySettingsSlug: settingsUi.communitySettingsSlug,
      communitySettingsOneLiner: settingsUi.communitySettingsOneLiner,
      communitySettingsAbout: settingsUi.communitySettingsAbout,
      communitySettingsVisibility: settingsUi.communitySettingsVisibility,
      communitySettingsPricingMode: settingsUi.communitySettingsPricingMode,
      communitySettingsPriceUsdMonthly: settingsUi.communitySettingsPriceUsdMonthly,
      communitySettingsPriceUsdAnnual: settingsUi.communitySettingsPriceUsdAnnual,
      isCommunitySettingsDirty: settingsUi.isCommunitySettingsDirty,
      isLoadingCommunitySettings: settingsUi.isLoadingCommunitySettings,
      isCommunitySettingsReady: settingsUi.isCommunitySettingsReady,
      communitySettingsConflict: settingsUi.communitySettingsConflict,
      communitySettingsError: settingsUi.communitySettingsError,
      isSavingCommunitySettings: settingsUi.isSavingCommunitySettings,
      communityMemberMuted: adminUi.communityMemberMuted,
      isLoadingCommunityMemberSettings: adminUi.isLoadingCommunityMemberSettings,
      isLeavingCommunity: adminUi.isLeavingCommunity,
      communityMemberSettingsError: adminUi.communityMemberSettingsError,
      isArchivingCommunity: settingsController.isArchivingCommunity,
      communityArchiveError: settingsController.communityArchiveError,
    },
    settingsActions: {
      setIsSettingsBannerDragOver: settingsUi.setIsSettingsBannerDragOver,
      handleSettingsBannerDrop: imageUpload.handleSettingsBannerDrop,
      handleCommunityBannerUpload: imageUpload.handleCommunityBannerUpload,
      setCommunitySettingsBannerUrl: settingsUi.setCommunitySettingsBannerUrl,
      setCommunitySettingsBannerFocusX: settingsUi.setCommunitySettingsBannerFocusX,
      setCommunitySettingsBannerFocusY: settingsUi.setCommunitySettingsBannerFocusY,
      setCommunitySettingsBannerZoom: settingsUi.setCommunitySettingsBannerZoom,
      setCommunitySettingsBannerUploadError: settingsUi.setCommunitySettingsBannerUploadError,
      markCommunitySettingsDirty: settingsUi.markCommunitySettingsDirty,
      setIsSettingsAvatarDragOver: settingsUi.setIsSettingsAvatarDragOver,
      handleSettingsAvatarDrop: imageUpload.handleSettingsAvatarDrop,
      handleCommunityAvatarUpload: imageUpload.handleCommunityAvatarUpload,
      setCommunitySettingsAvatarUrl: settingsUi.setCommunitySettingsAvatarUrl,
      setCommunitySettingsAvatarFocusX: settingsUi.setCommunitySettingsAvatarFocusX,
      setCommunitySettingsAvatarFocusY: settingsUi.setCommunitySettingsAvatarFocusY,
      setCommunitySettingsAvatarZoom: settingsUi.setCommunitySettingsAvatarZoom,
      setCommunitySettingsName: settingsUi.setCommunitySettingsName,
      setCommunitySettingsSlug: settingsUi.setCommunitySettingsSlug,
      setCommunitySettingsOneLiner: settingsUi.setCommunitySettingsOneLiner,
      setCommunitySettingsAbout: settingsUi.setCommunitySettingsAbout,
      setCommunitySettingsVisibility: settingsUi.setCommunitySettingsVisibility,
      setCommunitySettingsPricingMode: settingsUi.setCommunitySettingsPricingMode,
      setCommunitySettingsPriceUsdMonthly: settingsUi.setCommunitySettingsPriceUsdMonthly,
      setCommunitySettingsPriceUsdAnnual: settingsUi.setCommunitySettingsPriceUsdAnnual,
      handleCancelCommunitySettings: settingsController.handleCancelCommunitySettings,
      handleReloadLatestCommunitySettings: settingsController.handleReloadLatestCommunitySettings,
      handleSaveCommunitySettings: settingsController.handleSaveCommunitySettings,
      handleToggleCommunityMute: settingsController.handleToggleCommunityMute,
      handleLeaveCommunity: settingsController.handleLeaveCommunity,
      handleArchiveCommunity: settingsController.handleArchiveCommunity,
    },
    setIsCommunityAvatarFocusModalOpen: settingsUi.setIsCommunityAvatarFocusModalOpen,
    setIsCommunityBannerFocusModalOpen: settingsUi.setIsCommunityBannerFocusModalOpen,
    communitySettingsAvatarUrl: settingsUi.communitySettingsAvatarUrl,
    communitySettingsAvatarFocusX: settingsUi.communitySettingsAvatarFocusX,
    communitySettingsAvatarFocusY: settingsUi.communitySettingsAvatarFocusY,
    communitySettingsAvatarZoom: settingsUi.communitySettingsAvatarZoom,
    communitySettingsBannerUrl: settingsUi.communitySettingsBannerUrl,
    communitySettingsBannerFocusX: settingsUi.communitySettingsBannerFocusX,
    communitySettingsBannerFocusY: settingsUi.communitySettingsBannerFocusY,
    communitySettingsBannerZoom: settingsUi.communitySettingsBannerZoom,
    markCommunitySettingsDirty: settingsUi.markCommunitySettingsDirty,
    isLoadingCommunityAgentConfig: agentConfigUi.isLoadingCommunityAgentConfig,
    communityAgentConfigError: agentConfigUi.communityAgentConfigError,
    aiAgentInstructionsEditorProps: {
      communityAgentConfigDirtyRef: agentConfigUi.communityAgentConfigDirtyRef,
      handleSaveCommunityAgentConfig: params.handleSaveCommunityAgentConfig,
      handleResetCommunityAgentConfig: agentConfigUi.handleResetCommunityAgentConfig,
      isSavingCommunityAgentConfig: agentConfigUi.isSavingCommunityAgentConfig,
      communityAgentConfigSaveError: agentConfigUi.communityAgentConfigSaveError,
      communityAgentConfigCommunitySystemPrompt:
        agentConfigUi.communityAgentConfigCommunitySystemPrompt,
      setCommunityAgentConfigCommunitySystemPrompt:
        agentConfigUi.setCommunityAgentConfigCommunitySystemPrompt,
      markCommunityAgentConfigDirty: agentConfigUi.markCommunityAgentConfigDirty,
    },
    analyticsState: {
      communityAnalyticsRange: analytics.range,
      isLoadingCommunityAnalytics: analytics.isLoading,
      communityAnalyticsError: analytics.error,
      communityAnalyticsSummary: analytics.summary,
      communityAnalyticsSeries: analytics.series,
    },
    analyticsActions: {
      setCommunityAnalyticsRange: analytics.setRange,
    },
  };
}
