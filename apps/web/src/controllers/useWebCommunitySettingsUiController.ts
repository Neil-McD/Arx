import { useCallback, useRef, useState } from "react";

type CommunityPricingMode = "free" | "monthly" | "annual";

export function useWebCommunitySettingsUiController() {
  const [communitySettingsName, setCommunitySettingsName] = useState("");
  const [communitySettingsSlug, setCommunitySettingsSlug] = useState("");
  const [communitySettingsOneLiner, setCommunitySettingsOneLiner] = useState("");
  const [communitySettingsAbout, setCommunitySettingsAbout] = useState("");
  const [communitySettingsVisibility, setCommunitySettingsVisibility] = useState("unlisted");
  const [communitySettingsAvatarUrl, setCommunitySettingsAvatarUrl] = useState<string | null>(null);
  const [communitySettingsBannerUrl, setCommunitySettingsBannerUrl] = useState<string | null>(null);
  const [communitySettingsBannerFocusX, setCommunitySettingsBannerFocusX] = useState(0.5);
  const [communitySettingsBannerFocusY, setCommunitySettingsBannerFocusY] = useState(0.5);
  const [communitySettingsBannerZoom, setCommunitySettingsBannerZoom] = useState(1);
  const [communitySettingsPricingMode, setCommunitySettingsPricingMode] =
    useState<CommunityPricingMode>("free");
  const [communitySettingsPriceUsdMonthly, setCommunitySettingsPriceUsdMonthly] = useState("");
  const [communitySettingsPriceUsdAnnual, setCommunitySettingsPriceUsdAnnual] = useState("");
  const [communitySettingsError, setCommunitySettingsError] = useState<string | null>(null);
  const [communitySettingsBannerUploadError, setCommunitySettingsBannerUploadError] =
    useState<string | null>(null);
  const [isProcessingCommunitySettingsBanner, setIsProcessingCommunitySettingsBanner] = useState(false);
  const [isCommunityBannerFocusModalOpen, setIsCommunityBannerFocusModalOpen] = useState(false);
  const [isSavingCommunitySettings, setIsSavingCommunitySettings] = useState(false);
  const [isSettingsBannerDragOver, setIsSettingsBannerDragOver] = useState(false);
  const [isSettingsAvatarDragOver, setIsSettingsAvatarDragOver] = useState(false);

  const communitySettingsLoadedCommunityIdRef = useRef<string | null>(null);
  const communitySettingsDirtyRef = useRef(false);
  const communityPricingDirtyRef = useRef(false);

  const markCommunitySettingsDirty = useCallback(() => {
    communitySettingsDirtyRef.current = true;
  }, []);

  const markCommunityPricingDirty = useCallback(() => {
    communityPricingDirtyRef.current = true;
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
    communitySettingsError,
    setCommunitySettingsError,
    communitySettingsBannerUploadError,
    setCommunitySettingsBannerUploadError,
    isProcessingCommunitySettingsBanner,
    setIsProcessingCommunitySettingsBanner,
    isCommunityBannerFocusModalOpen,
    setIsCommunityBannerFocusModalOpen,
    isSavingCommunitySettings,
    setIsSavingCommunitySettings,
    isSettingsBannerDragOver,
    setIsSettingsBannerDragOver,
    isSettingsAvatarDragOver,
    setIsSettingsAvatarDragOver,
    communitySettingsLoadedCommunityIdRef,
    communitySettingsDirtyRef,
    communityPricingDirtyRef,
    markCommunitySettingsDirty,
    markCommunityPricingDirty,
  };
}
