import { useEffect, useLayoutEffect, type Dispatch, type SetStateAction } from "react";
import { applyAppThemeAttributes, type AppTheme } from "../../../../shared/theme";

type ProfileDraftLike = {
  name: string;
  username: string;
  bio: string;
};

export function useWebUiPersistenceLifecycle<TModelToggles>(params: {
  communityAnalyticsRange: string;
  appTheme: AppTheme;
  profileStorageUserId: string | null;
  profileName: string;
  profileUsername: string;
  profileBio: string;
  modelToggles: TModelToggles;
  activeModelId: string | null;
  guestModelId: string;
  modelTogglesStorageKey: string;
  activeModelStorageKey: string;
  readProfileDraftForUser: (userId: string | null) => ProfileDraftLike;
  writeProfileDraftForUser: (userId: string | null, draft: ProfileDraftLike) => void;
  storeGuestModelId: (modelId: string) => void;
  setProfileName: Dispatch<SetStateAction<string>>;
  setProfileUsername: Dispatch<SetStateAction<string>>;
  setProfileBio: Dispatch<SetStateAction<string>>;
}) {
  useEffect(() => {
    try {
      localStorage.setItem("polynet-community-analytics-range", params.communityAnalyticsRange);
    } catch {
      // ignore
    }
  }, [params.communityAnalyticsRange]);

  useEffect(() => {
    try {
      applyAppThemeAttributes(params.appTheme, document.documentElement);
      localStorage.setItem("polynet-theme", params.appTheme);
    } catch {
      return;
    }
  }, [params.appTheme]);

  useLayoutEffect(() => {
    const nextDraft = params.readProfileDraftForUser(params.profileStorageUserId);
    params.setProfileName(nextDraft.name);
    params.setProfileUsername(nextDraft.username);
    params.setProfileBio(nextDraft.bio);
  }, [params.profileStorageUserId]);

  useEffect(() => {
    params.writeProfileDraftForUser(params.profileStorageUserId, {
      name: params.profileName,
      username: params.profileUsername,
      bio: params.profileBio,
    });
  }, [
    params.profileStorageUserId,
    params.profileName,
    params.profileUsername,
    params.profileBio,
  ]);

  useEffect(() => {
    try {
      localStorage.setItem(params.modelTogglesStorageKey, JSON.stringify(params.modelToggles));
    } catch {
      return;
    }
  }, [params.modelToggles, params.modelTogglesStorageKey]);

  useEffect(() => {
    try {
      if (params.activeModelId) {
        localStorage.setItem(params.activeModelStorageKey, params.activeModelId);
      } else {
        localStorage.removeItem(params.activeModelStorageKey);
      }
    } catch {
      return;
    }
  }, [params.activeModelId, params.activeModelStorageKey]);

  useEffect(() => {
    params.storeGuestModelId(params.guestModelId);
  }, [params.guestModelId]);
}
