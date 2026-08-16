import { useCallback, useRef, useState } from "react";

export type CommunityPricingMode = "free" | "monthly" | "annual";

export type CommunitySettingsSavedSnapshot = {
  communityId: string;
  settingsRevision: number;
  updatedAt: string;
  brandingRevision: number | null;
  name: string;
  slug: string;
  oneLiner: string;
  about: string;
  visibility: "published" | "unlisted";
  conciergeWelcomesEnabled: boolean;
  avatarUrl: string | null;
  avatarStorageId: string | null;
  avatarFocusX: number;
  avatarFocusY: number;
  avatarZoom: number;
  bannerUrl: string | null;
  bannerStorageId: string | null;
  bannerFocusX: number;
  bannerFocusY: number;
  bannerZoom: number;
  pricing: {
    mode: CommunityPricingMode;
    monthly: string;
    annual: string;
  };
};

export function useWebCommunitySettingsUiController() {
  const [communitySettingsName, setCommunitySettingsName] = useState("");
  const [communitySettingsSlug, setCommunitySettingsSlug] = useState("");
  const [communitySettingsOneLiner, setCommunitySettingsOneLiner] = useState("");
  const [communitySettingsAbout, setCommunitySettingsAbout] = useState("");
  const [communitySettingsVisibility, setCommunitySettingsVisibility] =
    useState("unlisted");
  const [communitySettingsConciergeWelcomesEnabled, setCommunitySettingsConciergeWelcomesEnabled] =
    useState(true);
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
  const [isLoadingCommunitySettings, setIsLoadingCommunitySettings] = useState(false);
  const [isCommunitySettingsReady, setIsCommunitySettingsReady] = useState(false);
  const [communitySettingsConflict, setCommunitySettingsConflict] = useState(false);
  const [isSettingsBannerDragOver, setIsSettingsBannerDragOver] = useState(false);
  const [isSettingsAvatarDragOver, setIsSettingsAvatarDragOver] = useState(false);

  const communitySettingsLoadedCommunityIdRef = useRef<string | null>(null);
  const communitySettingsDirtyRef = useRef(false);
  const communitySettingsDraftRevisionRef = useRef(0);
  const communitySettingsLoadSequenceRef = useRef(0);
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
    setIsCommunitySettingsDirty(false);
  }, []);

  const markCommunitySettingsDirty = useCallback(() => {
    communitySettingsDraftRevisionRef.current += 1;
    setCommunitySettingsDirty(true);
  }, [setCommunitySettingsDirty]);

  const clearCommunitySettingsDraft = useCallback(() => {
    setCommunitySettingsName("");
    setCommunitySettingsSlug("");
    setCommunitySettingsOneLiner("");
    setCommunitySettingsAbout("");
    setCommunitySettingsVisibility("unlisted");
    setCommunitySettingsConciergeWelcomesEnabled(true);
    setCommunitySettingsAvatarUrl(null);
    setCommunitySettingsAvatarFocusX(0.5);
    setCommunitySettingsAvatarFocusY(0.5);
    setCommunitySettingsAvatarZoom(1);
    setCommunitySettingsBannerUrl(null);
    setCommunitySettingsBannerFocusX(0.5);
    setCommunitySettingsBannerFocusY(0.5);
    setCommunitySettingsBannerZoom(1);
    setCommunitySettingsPricingMode("free");
    setCommunitySettingsPriceUsdMonthly("");
    setCommunitySettingsPriceUsdAnnual("");
    setCommunitySettingsError(null);
    setCommunitySettingsBannerUploadError(null);
    setIsProcessingCommunitySettingsBanner(false);
    setIsSettingsBannerDragOver(false);
    setIsSettingsAvatarDragOver(false);
    setIsCommunityAvatarFocusModalOpen(false);
    setIsCommunityBannerFocusModalOpen(false);
  }, []);

  const resetCommunitySettingsSelection = useCallback(
    (communityId: string | null) => {
      if (communitySettingsLoadedCommunityIdRef.current === communityId) return;
      communitySettingsLoadSequenceRef.current += 1;
      communitySettingsDraftRevisionRef.current += 1;
      communitySettingsLoadedCommunityIdRef.current = communityId;
      clearCommunitySettingsDirty();
      setCommunitySettingsConflict(false);
      setIsCommunitySettingsReady(false);
      setIsLoadingCommunitySettings(false);
      clearCommunitySettingsDraft();
    },
    [clearCommunitySettingsDirty, clearCommunitySettingsDraft],
  );

  const setDraftFromSnapshot = useCallback((snapshot: CommunitySettingsSavedSnapshot) => {
    setCommunitySettingsName(snapshot.name);
    setCommunitySettingsSlug(snapshot.slug);
    setCommunitySettingsOneLiner(snapshot.oneLiner);
    setCommunitySettingsAbout(snapshot.about);
    setCommunitySettingsVisibility(snapshot.visibility);
    setCommunitySettingsConciergeWelcomesEnabled(snapshot.conciergeWelcomesEnabled);
    setCommunitySettingsAvatarUrl(snapshot.avatarUrl);
    setCommunitySettingsAvatarFocusX(snapshot.avatarFocusX);
    setCommunitySettingsAvatarFocusY(snapshot.avatarFocusY);
    setCommunitySettingsAvatarZoom(snapshot.avatarZoom);
    setCommunitySettingsBannerUrl(snapshot.bannerUrl);
    setCommunitySettingsBannerFocusX(snapshot.bannerFocusX);
    setCommunitySettingsBannerFocusY(snapshot.bannerFocusY);
    setCommunitySettingsBannerZoom(snapshot.bannerZoom);
    setCommunitySettingsPricingMode(snapshot.pricing.mode);
    setCommunitySettingsPriceUsdMonthly(snapshot.pricing.monthly);
    setCommunitySettingsPriceUsdAnnual(snapshot.pricing.annual);
    setCommunitySettingsError(null);
    setCommunitySettingsBannerUploadError(null);
    setIsSettingsBannerDragOver(false);
    setIsSettingsAvatarDragOver(false);
    setIsCommunityAvatarFocusModalOpen(false);
    setIsCommunityBannerFocusModalOpen(false);
  }, []);

  const rememberSavedCommunitySettings = useCallback(
    (snapshot: CommunitySettingsSavedSnapshot) => {
      communitySettingsSavedSnapshotsRef.current.set(snapshot.communityId, snapshot);
    },
    [],
  );

  const applyCommunitySettingsSnapshot = useCallback(
    (snapshot: CommunitySettingsSavedSnapshot) => {
      communitySettingsLoadedCommunityIdRef.current = snapshot.communityId;
      communitySettingsSavedSnapshotsRef.current.set(snapshot.communityId, snapshot);
      setDraftFromSnapshot(snapshot);
      setCommunitySettingsConflict(false);
      setIsCommunitySettingsReady(true);
      clearCommunitySettingsDirty();
    },
    [clearCommunitySettingsDirty, setDraftFromSnapshot],
  );

  const getSavedCommunitySettingsSnapshot = useCallback(
    (communityId?: string | null) => {
      const id = communityId ?? communitySettingsLoadedCommunityIdRef.current;
      return id ? communitySettingsSavedSnapshotsRef.current.get(id) ?? null : null;
    },
    [],
  );

  const handleCancelCommunitySettings = useCallback(() => {
    const saved = getSavedCommunitySettingsSnapshot();
    if (!saved) return;
    communitySettingsDraftRevisionRef.current += 1;
    setDraftFromSnapshot(saved);
    clearCommunitySettingsDirty();
  }, [clearCommunitySettingsDirty, getSavedCommunitySettingsSnapshot, setDraftFromSnapshot]);

  const hasCommunitySettingsChangesExceptAbout = useCallback(() => {
    const saved = getSavedCommunitySettingsSnapshot();
    if (!saved) return false;
    const changedNumber = (left: number, right: number) => Math.abs(left - right) >= 0.0001;
    return (
      communitySettingsName !== saved.name ||
      communitySettingsSlug !== saved.slug ||
      communitySettingsOneLiner !== saved.oneLiner ||
      communitySettingsVisibility !== saved.visibility ||
      communitySettingsConciergeWelcomesEnabled !== saved.conciergeWelcomesEnabled ||
      communitySettingsAvatarUrl !== saved.avatarUrl ||
      changedNumber(communitySettingsAvatarFocusX, saved.avatarFocusX) ||
      changedNumber(communitySettingsAvatarFocusY, saved.avatarFocusY) ||
      changedNumber(communitySettingsAvatarZoom, saved.avatarZoom) ||
      communitySettingsBannerUrl !== saved.bannerUrl ||
      changedNumber(communitySettingsBannerFocusX, saved.bannerFocusX) ||
      changedNumber(communitySettingsBannerFocusY, saved.bannerFocusY) ||
      changedNumber(communitySettingsBannerZoom, saved.bannerZoom) ||
      communitySettingsPricingMode !== saved.pricing.mode ||
      communitySettingsPriceUsdMonthly !== saved.pricing.monthly ||
      communitySettingsPriceUsdAnnual !== saved.pricing.annual
    );
  }, [
    communitySettingsAvatarFocusX,
    communitySettingsAvatarFocusY,
    communitySettingsAvatarUrl,
    communitySettingsAvatarZoom,
    communitySettingsBannerFocusX,
    communitySettingsBannerFocusY,
    communitySettingsBannerUrl,
    communitySettingsBannerZoom,
    communitySettingsName,
    communitySettingsOneLiner,
    communitySettingsPriceUsdAnnual,
    communitySettingsPriceUsdMonthly,
    communitySettingsPricingMode,
    communitySettingsSlug,
    communitySettingsVisibility,
    communitySettingsConciergeWelcomesEnabled,
    getSavedCommunitySettingsSnapshot,
  ]);

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
    communitySettingsConciergeWelcomesEnabled,
    setCommunitySettingsConciergeWelcomesEnabled,
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
    isLoadingCommunitySettings,
    setIsLoadingCommunitySettings,
    isCommunitySettingsReady,
    communitySettingsConflict,
    setCommunitySettingsConflict,
    isSettingsBannerDragOver,
    setIsSettingsBannerDragOver,
    isSettingsAvatarDragOver,
    setIsSettingsAvatarDragOver,
    communitySettingsLoadedCommunityIdRef,
    communitySettingsDirtyRef,
    communitySettingsDraftRevisionRef,
    communitySettingsLoadSequenceRef,
    isCommunitySettingsDirty,
    setCommunitySettingsDirty,
    clearCommunitySettingsDirty,
    markCommunitySettingsDirty,
    resetCommunitySettingsSelection,
    applyCommunitySettingsSnapshot,
    rememberSavedCommunitySettings,
    getSavedCommunitySettingsSnapshot,
    handleCancelCommunitySettings,
    hasCommunitySettingsChangesExceptAbout,
  };
}
