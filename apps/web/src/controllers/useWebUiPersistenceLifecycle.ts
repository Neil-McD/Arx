import { useEffect, useLayoutEffect, type Dispatch, type SetStateAction } from "react";
import {
  readProfileDraftForUser,
  writeProfileDraftForUser,
} from "../../../../shared/profileDraftStorage";

export function useWebUiPersistenceLifecycle(params: {
  communityAnalyticsRange: string;
  profileStorageUserId: string | null;
  profileName: string;
  profileHandle: string;
  profileBio: string;
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
    const nextDraft = readProfileDraftForUser(params.profileStorageUserId);
    params.setProfileName(nextDraft.name);
    params.setProfileHandle(nextDraft.handle);
    params.setProfileBio(nextDraft.bio);
  }, [params.profileStorageUserId]);

  useEffect(() => {
    writeProfileDraftForUser(params.profileStorageUserId, {
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
