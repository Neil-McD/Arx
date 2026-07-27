import { useEffect, useLayoutEffect, type Dispatch, type SetStateAction } from "react";
import { applyAppThemeAttributes, type AppTheme } from "../../../../shared/theme";

type ProfileDraftLike = {
  name: string;
  handle: string;
  bio: string;
};

export function useWebUiPersistenceLifecycle(params: {
  communityAnalyticsRange: string;
  appTheme: AppTheme;
  profileStorageUserId: string | null;
  profileName: string;
  profileHandle: string;
  profileBio: string;
  readProfileDraftForUser: (userId: string | null) => ProfileDraftLike;
  writeProfileDraftForUser: (userId: string | null, draft: ProfileDraftLike) => void;
  setProfileName: Dispatch<SetStateAction<string>>;
  setProfileHandle: Dispatch<SetStateAction<string>>;
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
    params.setProfileHandle(nextDraft.handle);
    params.setProfileBio(nextDraft.bio);
  }, [params.profileStorageUserId]);

  useEffect(() => {
    params.writeProfileDraftForUser(params.profileStorageUserId, {
      name: params.profileName,
      handle: params.profileHandle,
      bio: params.profileBio,
    });
  }, [
    params.profileStorageUserId,
    params.profileName,
    params.profileHandle,
    params.profileBio,
  ]);

}
