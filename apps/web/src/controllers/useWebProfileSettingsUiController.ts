import { useEffect, useMemo, useRef, useState } from "react";

type SessionLike = {
  user?: {
    id?: string | null;
    email?: string | null;
  } | null;
} | null;

type CloudProfileLike = {
  display_name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
} | null;

type ProfileDraftLike = {
  name: string;
  username: string;
  bio: string;
};

type UseWebProfileSettingsUiControllerParams = {
  profileStorageUserId: string | null;
  initialProfileDraft: ProfileDraftLike;
  session: SessionLike;
  cloudProfile: CloudProfileLike;
};

export function useWebProfileSettingsUiController(
  params: UseWebProfileSettingsUiControllerParams,
) {
  const { profileStorageUserId, initialProfileDraft, session, cloudProfile } = params;

  const [profileName, setProfileName] = useState(() => initialProfileDraft.name);
  const [profileUsername, setProfileUsername] = useState(() => initialProfileDraft.username);
  const [profileBio, setProfileBio] = useState(() => initialProfileDraft.bio);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);
  const [isProfileAvatarDragOver, setIsProfileAvatarDragOver] = useState(false);
  const profileSaveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setProfileSaveError(null);
    setProfileSaveSuccess(false);
    if (profileSaveTimeoutRef.current) {
      window.clearTimeout(profileSaveTimeoutRef.current);
      profileSaveTimeoutRef.current = null;
    }
  }, [profileStorageUserId]);

  useEffect(() => {
    if (session) return;
    if (!profileName && !profileUsername && !profileBio && !profileAvatarUrl) return;
    setProfileName("");
    setProfileUsername("");
    setProfileBio("");
    setProfileAvatarUrl(null);
  }, [profileAvatarUrl, profileBio, profileName, profileUsername, session]);

  const applyLoadedProfileToLocal = (profile: NonNullable<CloudProfileLike>) => {
    setProfileName((prev) => (prev.trim() ? prev : profile.display_name ?? ""));
    setProfileBio((prev) => (prev.trim() ? prev : profile.bio ?? ""));
    setProfileAvatarUrl((prev) => prev ?? profile.avatar_url ?? null);
  };

  const isProfileDirty = useMemo(() => {
    if (!session) return false;
    const nextName = profileName.trim();
    const nextBio = profileBio.trim();
    const nextAvatar = profileAvatarUrl ?? null;
    const prevName = (cloudProfile?.display_name ?? "").trim();
    const prevBio = (cloudProfile?.bio ?? "").trim();
    const prevAvatar = cloudProfile?.avatar_url ?? null;
    if (!cloudProfile) {
      return Boolean(nextName || nextBio || nextAvatar);
    }
    return nextName !== prevName || nextBio !== prevBio || nextAvatar !== prevAvatar;
  }, [cloudProfile, profileAvatarUrl, profileBio, profileName, session]);

  const profileNeedsSave = Boolean(session && (isProfileDirty || cloudProfile === null));

  return {
    profileName,
    setProfileName,
    profileUsername,
    setProfileUsername,
    profileBio,
    setProfileBio,
    profileAvatarUrl,
    setProfileAvatarUrl,
    isSavingProfile,
    setIsSavingProfile,
    profileSaveError,
    setProfileSaveError,
    profileSaveSuccess,
    setProfileSaveSuccess,
    profileSaveTimeoutRef,
    isProfileAvatarDragOver,
    setIsProfileAvatarDragOver,
    isProfileDirty,
    profileNeedsSave,
    applyLoadedProfileToLocal,
  };
}
