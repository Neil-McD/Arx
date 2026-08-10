import { useCallback, useRef, useState } from "react";

type CommunityPricingMode = "free" | "monthly" | "annual";

type CommunitySettingsSavedSnapshot = {
  communityId: string;
  name: string;
  slug: string;
  oneLiner: string;
  about: string;
  visibility: string;
  avatarUrl: string | null;
  avatarFocusX: number;
  avatarFocusY: number;
  avatarZoom: number;
  bannerUrl: string | null;
  bannerFocusX: number;
  bannerFocusY: number;
  bannerZoom: number;
  pricing: {
    mode: CommunityPricingMode;
    monthly: string;
    annual: string;
  } | null;
};

type CommunitySettingsIdentitySnapshot = Omit<
  CommunitySettingsSavedSnapshot,
  "communityId" | "pricing"
>;

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
  const [communitySettingsError, setCommunitySettingsError] = useState<string | null>(null);
  const [communitySettingsBannerUploadError, setCommunitySettingsBannerUploadError] =
    useState<string | null>(null);
  const [isProcessingCommunitySettingsBanner, setIsProcessingCommunitySettingsBanner] = useState(false);
  const [isCommunityAvatarFocusModalOpen, setIsCommunityAvatarFocusModalOpen] = useState(false);
  const [isCommunityBannerFocusModalOpen, setIsCommunityBannerFocusModalOpen] = useState(false);
  const [isSavingCommunitySettings, setIsSavingCommunitySettings] = useState(false);
  const [isSettingsBannerDragOver, setIsSettingsBannerDragOver] = useState(false);
  const [isSettingsAvatarDragOver, setIsSettingsAvatarDragOver] = useState(false);

  const communitySettingsLoadedCommunityIdRef = useRef<string | null>(null);
  const communitySettingsDirtyRef = useRef(false);
  const communityPricingDirtyRef = useRef(false);
  const communitySettingsDraftRevisionRef = useRef(0);
  const [isCommunitySettingsDirty, setIsCommunitySettingsDirty] = useState(false);
  const communitySettingsSavedSnapshotsRef = useRef(
    new Map<string, CommunitySettingsSavedSnapshot>(),
  );

  const setCommunitySettingsDirty = useCallback((nextDirty: boolean) => {
    communitySettingsDirtyRef.current = nextDirty;
    setIsCommunitySettingsDirty(nextDirty);
  }, []);

  const clearCommunitySettingsDirty = useCallback(() => {
    communitySettingsDirtyRef.current = false;
    communityPricingDirtyRef.current = false;
    setIsCommunitySettingsDirty(false);
  }, []);

  const markCommunitySettingsDirty = useCallback(() => {
    communitySettingsDraftRevisionRef.current += 1;
    setCommunitySettingsDirty(true);
  }, [setCommunitySettingsDirty]);

  const markCommunityPricingDirty = useCallback(() => {
    communityPricingDirtyRef.current = true;
    communitySettingsDraftRevisionRef.current += 1;
    setCommunitySettingsDirty(true);
  }, [setCommunitySettingsDirty]);

  const rememberSavedCommunityIdentity = useCallback((params: {
    communityId: string;
    identity: CommunitySettingsIdentitySnapshot;
  }) => {
    const current = communitySettingsSavedSnapshotsRef.current.get(
      params.communityId,
    );
    communitySettingsSavedSnapshotsRef.current.set(params.communityId, {
      communityId: params.communityId,
      ...params.identity,
      pricing: current?.pricing ?? null,
    });
  }, []);

  const rememberSavedCommunitySettings = useCallback((params: {
    communityId: string;
    identity: CommunitySettingsIdentitySnapshot;
    pricing: NonNullable<CommunitySettingsSavedSnapshot["pricing"]>;
  }) => {
    communitySettingsSavedSnapshotsRef.current.set(params.communityId, {
      communityId: params.communityId,
      ...params.identity,
      pricing: params.pricing,
    });
  }, []);

  const rememberSavedCommunityPricing = useCallback((pricing: {
    communityId: string;
    mode: CommunityPricingMode;
    monthly: string;
    annual: string;
  }) => {
    const current = communitySettingsSavedSnapshotsRef.current.get(
      pricing.communityId,
    );
    if (!current) return;
    communitySettingsSavedSnapshotsRef.current.set(pricing.communityId, {
      ...current,
      pricing: {
        mode: pricing.mode,
        monthly: pricing.monthly,
        annual: pricing.annual,
      },
    });
  }, []);

  const handleCancelCommunitySettings = useCallback(() => {
    const communityId = communitySettingsLoadedCommunityIdRef.current;
    if (!communityId) return;
    const saved = communitySettingsSavedSnapshotsRef.current.get(communityId);
    if (!saved) return;
    setCommunitySettingsName(saved.name);
    setCommunitySettingsSlug(saved.slug);
    setCommunitySettingsOneLiner(saved.oneLiner);
    setCommunitySettingsAbout(saved.about);
    setCommunitySettingsVisibility(saved.visibility);
    setCommunitySettingsAvatarUrl(saved.avatarUrl);
    setCommunitySettingsAvatarFocusX(saved.avatarFocusX);
    setCommunitySettingsAvatarFocusY(saved.avatarFocusY);
    setCommunitySettingsAvatarZoom(saved.avatarZoom);
    setCommunitySettingsBannerUrl(saved.bannerUrl);
    setCommunitySettingsBannerFocusX(saved.bannerFocusX);
    setCommunitySettingsBannerFocusY(saved.bannerFocusY);
    setCommunitySettingsBannerZoom(saved.bannerZoom);
    setCommunitySettingsPricingMode(saved.pricing?.mode ?? "free");
    setCommunitySettingsPriceUsdMonthly(saved.pricing?.monthly ?? "");
    setCommunitySettingsPriceUsdAnnual(saved.pricing?.annual ?? "");
    setCommunitySettingsError(null);
    setCommunitySettingsBannerUploadError(null);
    setIsSettingsBannerDragOver(false);
    setIsSettingsAvatarDragOver(false);
    setIsCommunityAvatarFocusModalOpen(false);
    setIsCommunityBannerFocusModalOpen(false);
    clearCommunitySettingsDirty();
  }, [clearCommunitySettingsDirty]);

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
    communitySettingsError,
    setCommunitySettingsError,
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
    isSettingsBannerDragOver,
    setIsSettingsBannerDragOver,
    isSettingsAvatarDragOver,
    setIsSettingsAvatarDragOver,
    communitySettingsLoadedCommunityIdRef,
    communitySettingsDirtyRef,
    communityPricingDirtyRef,
    communitySettingsDraftRevisionRef,
    isCommunitySettingsDirty,
    setCommunitySettingsDirty,
    clearCommunitySettingsDirty,
    markCommunitySettingsDirty,
    markCommunityPricingDirty,
    rememberSavedCommunityIdentity,
    rememberSavedCommunitySettings,
    rememberSavedCommunityPricing,
    handleCancelCommunitySettings,
  };
}
