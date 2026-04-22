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
  communityPricingDirtyRef: MutableRefObject<boolean>;

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
      current.communitySettingsDirtyRef.current = false;
      current.communityPricingDirtyRef.current = false;
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

    if (!switchingCommunity && current.communitySettingsDirtyRef.current) return;

    current.setCommunitySettingsError(null);
    current.setCommunityMemberSettingsError(null);
    clearBannerState(false);
    current.setCommunitySettingsName(selectedCommunity.name ?? "");
    current.setCommunitySettingsSlug(current.slugifyCommunityName(selectedCommunity.slug ?? ""));
    current.setCommunitySettingsOneLiner(selectedCommunity.one_liner ?? "");
    current.setCommunitySettingsAbout(selectedCommunity.about ?? "");
    current.setCommunitySettingsVisibility(toCanonicalCommunityVisibility(selectedCommunity.visibility, "unlisted"));
    current.setCommunitySettingsAvatarUrl(selectedCommunity.avatar_url ?? null);
    current.setCommunitySettingsAvatarFocusX(
      typeof selectedCommunity.avatar_focus_x === "number" && Number.isFinite(selectedCommunity.avatar_focus_x)
        ? Math.max(0, Math.min(1, selectedCommunity.avatar_focus_x))
        : 0.5,
    );
    current.setCommunitySettingsAvatarFocusY(
      typeof selectedCommunity.avatar_focus_y === "number" && Number.isFinite(selectedCommunity.avatar_focus_y)
        ? Math.max(0, Math.min(1, selectedCommunity.avatar_focus_y))
        : 0.5,
    );
    current.setCommunitySettingsAvatarZoom(
      typeof selectedCommunity.avatar_zoom === "number" && Number.isFinite(selectedCommunity.avatar_zoom)
        ? Math.max(1, Math.min(2.5, selectedCommunity.avatar_zoom))
        : 1,
    );
    current.setCommunitySettingsBannerUrl(selectedCommunity.banner_url ?? null);
    current.setCommunitySettingsBannerFocusX(
      typeof selectedCommunity.banner_focus_x === "number" && Number.isFinite(selectedCommunity.banner_focus_x)
        ? Math.max(0, Math.min(1, selectedCommunity.banner_focus_x))
        : 0.5,
    );
    current.setCommunitySettingsBannerFocusY(
      typeof selectedCommunity.banner_focus_y === "number" && Number.isFinite(selectedCommunity.banner_focus_y)
        ? Math.max(0, Math.min(1, selectedCommunity.banner_focus_y))
        : 0.5,
    );
    current.setCommunitySettingsBannerZoom(
      typeof selectedCommunity.banner_zoom === "number" && Number.isFinite(selectedCommunity.banner_zoom)
        ? Math.max(1, Math.min(2.5, selectedCommunity.banner_zoom))
        : 1,
    );
  }, [clearBannerState]);

  return {
    syncCommunitySettingsSelection,
  };
}
