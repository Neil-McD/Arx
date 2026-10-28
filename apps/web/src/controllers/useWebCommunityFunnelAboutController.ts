import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  saveCloudCommunityAbout,
} from "../../../../shared/cloudCommunityAboutGateway";
import type { AuthSession } from "../auth";
import type { WebCommunityRecord } from "../webAppContracts";

type UseWebCommunityFunnelAboutControllerParams = {
  activeCommunity: WebCommunityRecord | null;
  about: string;
  hasOtherSettingsDirty: () => boolean;
  setSettingsDirty: (value: boolean) => void;
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

  const reset = useCallback(() => {
    params.setAbout(params.activeCommunity?.about ?? "");
    params.setError(null);
    params.setSettingsDirty(params.hasOtherSettingsDirty());
  }, [
    params.activeCommunity?.about,
    params.hasOtherSettingsDirty,
    params.setAbout,
    params.setError,
    params.setSettingsDirty,
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
      params.setSettingsDirty(params.hasOtherSettingsDirty());
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
    params.about,
    params.activeCommunity,
    params.ensureSession,
    params.hasOtherSettingsDirty,
    params.setCommunities,
    params.setError,
    params.setIsSaving,
    params.setSettingsDirty,
  ]);

  return {
    isDirty,
    reset,
    save,
  };
}
