import { useEffect, useLayoutEffect, type Dispatch, type SetStateAction } from "react";

type ProfileDraftLike = {
  name: string;
  handle: string;
  bio: string;
};

export function useWebUiPersistenceLifecycle(params: {
  communityAnalyticsRange: string;
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
