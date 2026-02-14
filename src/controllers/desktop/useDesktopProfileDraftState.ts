import { useEffect, useRef, useState } from "react";

export type DesktopProfileDraft = {
  name: string;
  username: string;
  bio: string;
  avatarUrl: string | null;
};

export function useDesktopProfileDraftState<CloudProfileT = unknown>(params: {
  profileStorageUserId: string | null;
  initialProfileDraft: DesktopProfileDraft;
}) {
  const [profileName, setProfileName] = useState(() => params.initialProfileDraft.name);
  const [profileUsername, setProfileUsername] = useState(() => params.initialProfileDraft.username);
  const [profileBio, setProfileBio] = useState(() => params.initialProfileDraft.bio);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(() => params.initialProfileDraft.avatarUrl);
  const [cloudProfile, setCloudProfile] = useState<CloudProfileT | null>(null);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isResettingLocalCache, setIsResettingLocalCache] = useState(false);
  const profileSaveTimeoutRef = useRef<number | null>(null);
  const [isProfileAvatarDragOver, setIsProfileAvatarDragOver] = useState(false);

  useEffect(() => {
    setCloudProfile(null);
    setProfileSaveError(null);
    setProfileSaveSuccess(false);
    if (profileSaveTimeoutRef.current) {
      window.clearTimeout(profileSaveTimeoutRef.current);
      profileSaveTimeoutRef.current = null;
    }
  }, [params.profileStorageUserId]);

  return {
    profileName,
    setProfileName,
    profileUsername,
    setProfileUsername,
    profileBio,
    setProfileBio,
    profileAvatarUrl,
    setProfileAvatarUrl,
    cloudProfile,
    setCloudProfile,
    profileSaveError,
    setProfileSaveError,
    profileSaveSuccess,
    setProfileSaveSuccess,
    isSavingProfile,
    setIsSavingProfile,
    isResettingLocalCache,
    setIsResettingLocalCache,
    profileSaveTimeoutRef,
    isProfileAvatarDragOver,
    setIsProfileAvatarDragOver,
  };
}

