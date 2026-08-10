import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { toCanonicalCommunityVisibility } from "./communityVisibility";

type CommunityLike = {
  id: string;
  name: string | null;
  slug: string | null;
  one_liner: string | null;
  about: string | null;
  visibility: string | null;
  avatar_url: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  banner_url: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
};

type UseCommunitySettingsFormControllerArgs = {
  slugifyCommunityName: (value: string) => string;
  communitySettingsLoadedCommunityIdRef: MutableRefObject<string | null>;
  communitySettingsDirtyRef: MutableRefObject<boolean>;
  clearCommunitySettingsDirty: () => void;
  rememberSavedCommunityIdentity: (params: {
    communityId: string;
    identity: {
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
    };
  }) => void;

  setCommunitySettingsError: Dispatch<SetStateAction<string | null>>;
  setCommunityMemberSettingsError: Dispatch<SetStateAction<string | null>>;
  setCommunitySettingsName: Dispatch<SetStateAction<string>>;
  setCommunitySettingsSlug: Dispatch<SetStateAction<string>>;
  setCommunitySettingsOneLiner: Dispatch<SetStateAction<string>>;
  setCommunitySettingsAbout: Dispatch<SetStateAction<string>>;
  setCommunitySettingsVisibility: Dispatch<SetStateAction<string>>;
  setCommunitySettingsAvatarUrl: Dispatch<SetStateAction<string | null>>;
  setCommunitySettingsAvatarFocusX: Dispatch<SetStateAction<number>>;
  setCommunitySettingsAvatarFocusY: Dispatch<SetStateAction<number>>;
  setCommunitySettingsAvatarZoom: Dispatch<SetStateAction<number>>;
  setCommunitySettingsBannerUrl: Dispatch<SetStateAction<string | null>>;
  setCommunitySettingsBannerFocusX: Dispatch<SetStateAction<number>>;
  setCommunitySettingsBannerFocusY: Dispatch<SetStateAction<number>>;
  setCommunitySettingsBannerZoom: Dispatch<SetStateAction<number>>;
  setCommunitySettingsPricingMode: Dispatch<SetStateAction<"free" | "monthly" | "annual">>;
  setCommunitySettingsPriceUsdMonthly: Dispatch<SetStateAction<string>>;
  setCommunitySettingsPriceUsdAnnual: Dispatch<SetStateAction<string>>;
  setCommunityMemberMuted: Dispatch<SetStateAction<boolean>>;

  setCommunitySettingsBannerUploadError?: Dispatch<SetStateAction<string | null>>;
  setIsProcessingCommunitySettingsBanner?: Dispatch<SetStateAction<boolean>>;
  clearBannerOnMissingCommunity?: boolean;
  onCommunitySwitched?: (nextCommunityId: string | null) => void;
  onNoCommunitySelected?: () => void;
};

export function useCommunitySettingsFormController<CommunityT extends CommunityLike>(
  args: UseCommunitySettingsFormControllerArgs,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const clearBannerState = useCallback((onMissingCommunity: boolean) => {
    const current = argsRef.current;
    if (onMissingCommunity && !current.clearBannerOnMissingCommunity) return;
    current.setCommunitySettingsBannerUploadError?.(null);
    current.setIsProcessingCommunitySettingsBanner?.(false);
  }, []);

  const syncCommunitySettingsSelection = useCallback((params: { activeCommunityId: string | null; communities: CommunityT[] }) => {
    const current = argsRef.current;
    const nextLoadedId = params.activeCommunityId ?? null;
    const switchingCommunity = current.communitySettingsLoadedCommunityIdRef.current !== nextLoadedId;
    if (switchingCommunity) {
      current.communitySettingsLoadedCommunityIdRef.current = nextLoadedId;
      current.clearCommunitySettingsDirty();
      current.setCommunitySettingsPricingMode("free");
      current.setCommunitySettingsPriceUsdMonthly("");
      current.setCommunitySettingsPriceUsdAnnual("");
      current.onCommunitySwitched?.(nextLoadedId);
    }

    const selectedCommunity = params.communities.find((community) => community.id === params.activeCommunityId) ?? null;
    if (!selectedCommunity) {
      current.setCommunitySettingsError(null);
      current.setCommunityMemberSettingsError(null);
      clearBannerState(true);
      current.setCommunitySettingsName("");
      current.setCommunitySettingsSlug("");
      current.setCommunitySettingsOneLiner("");
      current.setCommunitySettingsAbout("");
      current.setCommunitySettingsVisibility("unlisted");
      current.setCommunitySettingsAvatarUrl(null);
      current.setCommunitySettingsAvatarFocusX(0.5);
      current.setCommunitySettingsAvatarFocusY(0.5);
      current.setCommunitySettingsAvatarZoom(1);
      current.setCommunitySettingsBannerUrl(null);
      current.setCommunitySettingsBannerFocusX(0.5);
      current.setCommunitySettingsBannerFocusY(0.5);
      current.setCommunitySettingsBannerZoom(1);
      current.setCommunitySettingsPriceUsdMonthly("");
      current.setCommunitySettingsPriceUsdAnnual("");
      current.setCommunityMemberMuted(false);
      current.onNoCommunitySelected?.();
      return;
    }

    if (
      !switchingCommunity &&
      current.communitySettingsDirtyRef.current
    ) {
      return;
    }

    const identity = {
      name: selectedCommunity.name ?? "",
      slug: current.slugifyCommunityName(selectedCommunity.slug ?? ""),
      oneLiner: selectedCommunity.one_liner ?? "",
      about: selectedCommunity.about ?? "",
      visibility: toCanonicalCommunityVisibility(selectedCommunity.visibility, "unlisted"),
      avatarUrl: selectedCommunity.avatar_url ?? null,
      avatarFocusX:
        typeof selectedCommunity.avatar_focus_x === "number" && Number.isFinite(selectedCommunity.avatar_focus_x)
          ? Math.max(0, Math.min(1, selectedCommunity.avatar_focus_x))
          : 0.5,
      avatarFocusY:
        typeof selectedCommunity.avatar_focus_y === "number" && Number.isFinite(selectedCommunity.avatar_focus_y)
          ? Math.max(0, Math.min(1, selectedCommunity.avatar_focus_y))
          : 0.5,
      avatarZoom:
        typeof selectedCommunity.avatar_zoom === "number" && Number.isFinite(selectedCommunity.avatar_zoom)
          ? Math.max(1, Math.min(2.5, selectedCommunity.avatar_zoom))
          : 1,
      bannerUrl: selectedCommunity.banner_url ?? null,
      bannerFocusX:
        typeof selectedCommunity.banner_focus_x === "number" && Number.isFinite(selectedCommunity.banner_focus_x)
          ? Math.max(0, Math.min(1, selectedCommunity.banner_focus_x))
          : 0.5,
      bannerFocusY:
        typeof selectedCommunity.banner_focus_y === "number" && Number.isFinite(selectedCommunity.banner_focus_y)
          ? Math.max(0, Math.min(1, selectedCommunity.banner_focus_y))
          : 0.5,
      bannerZoom:
        typeof selectedCommunity.banner_zoom === "number" && Number.isFinite(selectedCommunity.banner_zoom)
          ? Math.max(1, Math.min(2.5, selectedCommunity.banner_zoom))
          : 1,
    };
    current.rememberSavedCommunityIdentity({
      communityId: selectedCommunity.id,
      identity,
    });
    current.setCommunitySettingsError(null);
    current.setCommunityMemberSettingsError(null);
    clearBannerState(false);
    current.setCommunitySettingsName(identity.name);
    current.setCommunitySettingsSlug(identity.slug);
    current.setCommunitySettingsOneLiner(identity.oneLiner);
    current.setCommunitySettingsAbout(identity.about);
    current.setCommunitySettingsVisibility(identity.visibility);
    current.setCommunitySettingsAvatarUrl(identity.avatarUrl);
    current.setCommunitySettingsAvatarFocusX(identity.avatarFocusX);
    current.setCommunitySettingsAvatarFocusY(identity.avatarFocusY);
    current.setCommunitySettingsAvatarZoom(identity.avatarZoom);
    current.setCommunitySettingsBannerUrl(identity.bannerUrl);
    current.setCommunitySettingsBannerFocusX(identity.bannerFocusX);
    current.setCommunitySettingsBannerFocusY(identity.bannerFocusY);
    current.setCommunitySettingsBannerZoom(identity.bannerZoom);
  }, [clearBannerState]);

  return {
    syncCommunitySettingsSelection,
  };
}
