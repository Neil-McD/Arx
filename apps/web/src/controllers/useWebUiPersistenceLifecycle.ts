import { useEffect, useLayoutEffect, type Dispatch, type SetStateAction } from "react";

type ProfileDraftLike = {
  name: string;
  username: string;
  bio: string;
  avatarUrl: string | null;
};

export function useWebUiPersistenceLifecycle<TModelToggles>(params: {
  communityAnalyticsRange: string;
  appTheme: string;
  profileStorageUserId: string;
  profileName: string;
  profileUsername: string;
  profileBio: string;
  profileAvatarUrl: string | null;
  modelToggles: TModelToggles;
  activeModelId: string;
  guestModelId: string;
  modelTogglesStorageKey: string;
  activeModelStorageKey: string;
  readProfileDraftForUser: (userId: string) => ProfileDraftLike;
  writeProfileDraftForUser: (userId: string, draft: ProfileDraftLike) => void;
  storeGuestModelId: (modelId: string) => void;
  setProfileName: Dispatch<SetStateAction<string>>;
  setProfileUsername: Dispatch<SetStateAction<string>>;
  setProfileBio: Dispatch<SetStateAction<string>>;
  setProfileAvatarUrl: Dispatch<SetStateAction<string | null>>;
}) {
  useEffect(() => {
    try {
      localStorage.setItem("arx-community-analytics-range", params.communityAnalyticsRange);
    } catch {
      // ignore
    }
  }, [params.communityAnalyticsRange]);

  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-theme", params.appTheme);
      localStorage.setItem("arx-theme", params.appTheme);
    } catch {
      return;
    }
  }, [params.appTheme]);

  useLayoutEffect(() => {
    const nextDraft = params.readProfileDraftForUser(params.profileStorageUserId);
    params.setProfileName(nextDraft.name);
    params.setProfileUsername(nextDraft.username);
    params.setProfileBio(nextDraft.bio);
    params.setProfileAvatarUrl(nextDraft.avatarUrl);
  }, [params.profileStorageUserId]);

  useEffect(() => {
    params.writeProfileDraftForUser(params.profileStorageUserId, {
      name: params.profileName,
      username: params.profileUsername,
      bio: params.profileBio,
      avatarUrl: params.profileAvatarUrl,
    });
  }, [
    params.profileStorageUserId,
    params.profileName,
    params.profileUsername,
    params.profileBio,
    params.profileAvatarUrl,
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
