import { useCallback, useRef, useState } from "react";
import {
  buildDefaultCommunityMemberOnboardingConfig,
  type CommunityMemberOnboardingConfig,
} from "../../../../shared/communityMemberOnboarding";

type CommunityPricingMode = "free" | "monthly" | "annual";

export function useWebCommunitySettingsUiController() {
  const [communitySettingsName, setCommunitySettingsName] = useState("");
  const [communitySettingsSlug, setCommunitySettingsSlug] = useState("");
  const [communitySettingsOneLiner, setCommunitySettingsOneLiner] = useState("");
  const [communitySettingsAbout, setCommunitySettingsAbout] = useState("");
  const [communitySettingsVisibility, setCommunitySettingsVisibility] = useState("unlisted");
  const [communitySettingsAvatarUrl, setCommunitySettingsAvatarUrl] = useState<string | null>(null);
  const [communitySettingsAvatarFocusX, setCommunitySettingsAvatarFocusX] = useState(0.5);
  const [communitySettingsAvatarFocusY, setCommunitySettingsAvatarFocusY] = useState(0.5);
  const [communitySettingsAvatarZoom, setCommunitySettingsAvatarZoom] = useState(1);
  const [communitySettingsBannerUrl, setCommunitySettingsBannerUrl] = useState<string | null>(null);
  const [communitySettingsBannerFocusX, setCommunitySettingsBannerFocusX] = useState(0.5);
  const [communitySettingsBannerFocusY, setCommunitySettingsBannerFocusY] = useState(0.5);
  const [communitySettingsBannerZoom, setCommunitySettingsBannerZoom] = useState(1);
  const [communitySettingsPricingMode, setCommunitySettingsPricingMode] =
    useState<CommunityPricingMode>("free");
  const [communitySettingsPriceUsdMonthly, setCommunitySettingsPriceUsdMonthly] = useState("");
  const [communitySettingsPriceUsdAnnual, setCommunitySettingsPriceUsdAnnual] = useState("");
  const [communityMemberOnboardingConfig, setCommunityMemberOnboardingConfig] =
    useState<CommunityMemberOnboardingConfig>(() =>
      buildDefaultCommunityMemberOnboardingConfig(),
    );
  const [communitySettingsError, setCommunitySettingsError] = useState<string | null>(null);
  const [communityMemberOnboardingError, setCommunityMemberOnboardingError] =
    useState<string | null>(null);
  const [communitySettingsBannerUploadError, setCommunitySettingsBannerUploadError] =
    useState<string | null>(null);
  const [isProcessingCommunitySettingsBanner, setIsProcessingCommunitySettingsBanner] = useState(false);
  const [isCommunityAvatarFocusModalOpen, setIsCommunityAvatarFocusModalOpen] = useState(false);
  const [isCommunityBannerFocusModalOpen, setIsCommunityBannerFocusModalOpen] = useState(false);
  const [isSavingCommunitySettings, setIsSavingCommunitySettings] = useState(false);
  const [isSavingCommunityMemberOnboarding, setIsSavingCommunityMemberOnboarding] =
    useState(false);
  const [isSettingsBannerDragOver, setIsSettingsBannerDragOver] = useState(false);
  const [isSettingsAvatarDragOver, setIsSettingsAvatarDragOver] = useState(false);

  const communitySettingsLoadedCommunityIdRef = useRef<string | null>(null);
  const communitySettingsDirtyRef = useRef(false);
  const communityMemberOnboardingDirtyRef = useRef(false);
  const communityPricingDirtyRef = useRef(false);

  const markCommunitySettingsDirty = useCallback(() => {
    communitySettingsDirtyRef.current = true;
  }, []);

  const markCommunityPricingDirty = useCallback(() => {
    communityPricingDirtyRef.current = true;
  }, []);

  const markCommunityMemberOnboardingDirty = useCallback(() => {
    communityMemberOnboardingDirtyRef.current = true;
  }, []);

  return {
    communitySettingsName,
    setCommunitySettingsName,
    communitySettingsSlug,
    setCommunitySettingsSlug,
    communitySettingsOneLiner,
    setCommunitySettingsOneLiner,
    communitySettingsAbout,
    setCommunitySettingsAbout,
    communitySettingsVisibility,
    setCommunitySettingsVisibility,
    communitySettingsAvatarUrl,
    setCommunitySettingsAvatarUrl,
    communitySettingsAvatarFocusX,
    setCommunitySettingsAvatarFocusX,
    communitySettingsAvatarFocusY,
    setCommunitySettingsAvatarFocusY,
    communitySettingsAvatarZoom,
    setCommunitySettingsAvatarZoom,
    communitySettingsBannerUrl,
    setCommunitySettingsBannerUrl,
    communitySettingsBannerFocusX,
    setCommunitySettingsBannerFocusX,
    communitySettingsBannerFocusY,
    setCommunitySettingsBannerFocusY,
    communitySettingsBannerZoom,
    setCommunitySettingsBannerZoom,
    communitySettingsPricingMode,
    setCommunitySettingsPricingMode,
    communitySettingsPriceUsdMonthly,
    setCommunitySettingsPriceUsdMonthly,
    communitySettingsPriceUsdAnnual,
    setCommunitySettingsPriceUsdAnnual,
    communityMemberOnboardingConfig,
    setCommunityMemberOnboardingConfig,
    communitySettingsError,
    setCommunitySettingsError,
    communityMemberOnboardingError,
    setCommunityMemberOnboardingError,
    communitySettingsBannerUploadError,
    setCommunitySettingsBannerUploadError,
    isProcessingCommunitySettingsBanner,
    setIsProcessingCommunitySettingsBanner,
    isCommunityAvatarFocusModalOpen,
    setIsCommunityAvatarFocusModalOpen,
    isCommunityBannerFocusModalOpen,
    setIsCommunityBannerFocusModalOpen,
    isSavingCommunitySettings,
    setIsSavingCommunitySettings,
    isSavingCommunityMemberOnboarding,
    setIsSavingCommunityMemberOnboarding,
    isSettingsBannerDragOver,
    setIsSettingsBannerDragOver,
    isSettingsAvatarDragOver,
    setIsSettingsAvatarDragOver,
    communitySettingsLoadedCommunityIdRef,
    communitySettingsDirtyRef,
    communityMemberOnboardingDirtyRef,
    communityPricingDirtyRef,
    markCommunitySettingsDirty,
    markCommunityPricingDirty,
    markCommunityMemberOnboardingDirty,
  };
}
