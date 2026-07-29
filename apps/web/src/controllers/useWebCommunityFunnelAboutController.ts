import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import {
  saveCloudCommunityAbout,
} from "../../../../shared/cloudCommunityFunnelGateway";
import { slugifyCommunityName } from "../../../../shared/communitySlug";
import {
  toCanonicalCommunityVisibility,
} from "../../../../shared/communityVisibility";
import type { AuthSession } from "../auth";
import type { WebCommunityRecord } from "../webAppContracts";

type UseWebCommunityFunnelAboutControllerParams = {
  activeCommunity: WebCommunityRecord | null;
  about: string;
  name: string;
  slug: string;
  oneLiner: string;
  visibility: string;
  avatarUrl: string | null;
  avatarFocusX: number;
  avatarFocusY: number;
  avatarZoom: number;
  bannerUrl: string | null;
  bannerFocusX: number;
  bannerFocusY: number;
  bannerZoom: number;
  pricingDirtyRef: MutableRefObject<boolean>;
  settingsDirtyRef: MutableRefObject<boolean>;
  ensureSession: () => Promise<AuthSession | null>;
  setAbout: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setIsSaving: Dispatch<SetStateAction<boolean>>;
  setCommunities: Dispatch<SetStateAction<WebCommunityRecord[]>>;
};

export function useWebCommunityFunnelAboutController(
  params: UseWebCommunityFunnelAboutControllerParams,
) {
  const isDirty =
    Boolean(params.activeCommunity) &&
    params.about !== (params.activeCommunity?.about ?? "");

  const hasOtherSettingsDirty = useCallback(() => {
    const community = params.activeCommunity;
    if (!community) return false;
    const numberChanged = (left: number, right: number) =>
      Math.abs(left - right) >= 0.0001;
    return (
      params.pricingDirtyRef.current ||
      params.name !== (community.name ?? "") ||
      params.slug !== slugifyCommunityName(community.slug ?? "") ||
      params.oneLiner !== (community.one_liner ?? "") ||
      params.visibility !==
        toCanonicalCommunityVisibility(
          community.visibility,
          "unlisted",
        ) ||
      params.avatarUrl !== (community.avatar_url ?? null) ||
      numberChanged(
        params.avatarFocusX,
        community.avatar_focus_x ?? 0.5,
      ) ||
      numberChanged(
        params.avatarFocusY,
        community.avatar_focus_y ?? 0.5,
      ) ||
      numberChanged(
        params.avatarZoom,
        community.avatar_zoom ?? 1,
      ) ||
      params.bannerUrl !== (community.banner_url ?? null) ||
      numberChanged(
        params.bannerFocusX,
        community.banner_focus_x ?? 0.5,
      ) ||
      numberChanged(
        params.bannerFocusY,
        community.banner_focus_y ?? 0.5,
      ) ||
      numberChanged(
        params.bannerZoom,
        community.banner_zoom ?? 1,
      )
    );
  }, [
    params.activeCommunity,
    params.avatarFocusX,
    params.avatarFocusY,
    params.avatarUrl,
    params.avatarZoom,
    params.bannerFocusX,
    params.bannerFocusY,
    params.bannerUrl,
    params.bannerZoom,
    params.name,
    params.oneLiner,
    params.pricingDirtyRef,
    params.slug,
    params.visibility,
  ]);

  const reset = useCallback(() => {
    params.setAbout(params.activeCommunity?.about ?? "");
    params.setError(null);
    params.settingsDirtyRef.current = hasOtherSettingsDirty();
  }, [
    hasOtherSettingsDirty,
    params.activeCommunity?.about,
    params.setAbout,
    params.setError,
    params.settingsDirtyRef,
  ]);

  const save = useCallback(async (): Promise<boolean> => {
    const session = await params.ensureSession();
    const community = params.activeCommunity;
    if (!session || !community) {
      params.setError(
        "Sign in and select a community before saving funnel text.",
      );
      return false;
    }
    params.setError(null);
    params.setIsSaving(true);
    try {
      const result = await saveCloudCommunityAbout({
        session,
        communityId: community.id,
        about: params.about.trim() || null,
      });
      if (!result) throw new Error("Failed to save funnel text.");
      params.setCommunities((current) =>
        current.map((candidate) =>
          candidate.id === result.community_id
            ? {
                ...candidate,
                about: result.about,
                updated_at: result.updated_at,
              }
            : candidate,
        ),
      );
      params.settingsDirtyRef.current = hasOtherSettingsDirty();
      return true;
    } catch (error) {
      params.setError(
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to save funnel text.",
      );
      return false;
    } finally {
      params.setIsSaving(false);
    }
  }, [
    hasOtherSettingsDirty,
    params.about,
    params.activeCommunity,
    params.ensureSession,
    params.setCommunities,
    params.setError,
    params.setIsSaving,
    params.settingsDirtyRef,
  ]);

  return {
    isDirty,
    reset,
    save,
  };
}
