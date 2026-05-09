import { useEffect, useMemo, useRef, useState } from "react";

type SessionLike = {
  user?: {
    id?: string | null;
    email?: string | null;
  } | null;
} | null;

type CloudProfileLike = {
  display_name?: string | null;
  handle?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  avatar_storage_id?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
} | null;

type ProfileDraftLike = {
  name: string;
  handle: string;
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
  const [profileHandle, setProfileHandle] = useState(() => initialProfileDraft.handle);
  const [profileBio, setProfileBio] = useState(() => initialProfileDraft.bio);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [profileAvatarStorageId, setProfileAvatarStorageId] = useState<string | null>(null);
  const [profileAvatarFocusX, setProfileAvatarFocusX] = useState(0.5);
  const [profileAvatarFocusY, setProfileAvatarFocusY] = useState(0.5);
  const [profileAvatarZoom, setProfileAvatarZoom] = useState(1);
  const [isProfileAvatarFocusModalOpen, setIsProfileAvatarFocusModalOpen] = useState(false);
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
    if (!profileName && !profileHandle && !profileBio && !profileAvatarUrl && !profileAvatarStorageId) return;
    setProfileName("");
    setProfileHandle("");
    setProfileBio("");
    setProfileAvatarUrl(null);
    setProfileAvatarStorageId(null);
    setProfileAvatarFocusX(0.5);
    setProfileAvatarFocusY(0.5);
    setProfileAvatarZoom(1);
    setIsProfileAvatarFocusModalOpen(false);
  }, [profileAvatarStorageId, profileAvatarUrl, profileBio, profileHandle, profileName, session]);

  const applyLoadedProfileToLocal = (profile: NonNullable<CloudProfileLike>) => {
    setProfileName((prev) => (prev.trim() ? prev : profile.display_name ?? ""));
    setProfileHandle((prev) => (prev.trim() ? prev : profile.handle ?? ""));
    setProfileBio((prev) => (prev.trim() ? prev : profile.bio ?? ""));
    setProfileAvatarUrl((prev) => prev ?? profile.avatar_url ?? null);
    setProfileAvatarStorageId((prev) => prev ?? profile.avatar_storage_id ?? null);
    setProfileAvatarFocusX(profile.avatar_focus_x ?? 0.5);
    setProfileAvatarFocusY(profile.avatar_focus_y ?? 0.5);
    setProfileAvatarZoom(profile.avatar_zoom ?? 1);
  };

  const isProfileDirty = useMemo(() => {
    if (!session) return false;
    const nextName = profileName.trim();
    const nextHandle = profileHandle.trim();
    const nextBio = profileBio.trim();
    const nextAvatar = profileAvatarUrl ?? null;
    const nextAvatarStorageId = profileAvatarStorageId ?? null;
    const nextAvatarFocusX = profileAvatarFocusX;
    const nextAvatarFocusY = profileAvatarFocusY;
    const nextAvatarZoom = profileAvatarZoom;
    const prevName = (cloudProfile?.display_name ?? "").trim();
    const prevHandle = (cloudProfile?.handle ?? "").trim();
    const prevBio = (cloudProfile?.bio ?? "").trim();
    const prevAvatar = cloudProfile?.avatar_url ?? null;
    const prevAvatarStorageId = cloudProfile?.avatar_storage_id ?? null;
    const prevAvatarFocusX = cloudProfile?.avatar_focus_x ?? 0.5;
    const prevAvatarFocusY = cloudProfile?.avatar_focus_y ?? 0.5;
    const prevAvatarZoom = cloudProfile?.avatar_zoom ?? 1;
    if (!cloudProfile) {
      return Boolean(nextName || nextHandle || nextBio || nextAvatar);
    }
    return (
      nextName !== prevName ||
      nextHandle !== prevHandle ||
      nextBio !== prevBio ||
      nextAvatar !== prevAvatar ||
      nextAvatarStorageId !== prevAvatarStorageId ||
      nextAvatarFocusX !== prevAvatarFocusX ||
      nextAvatarFocusY !== prevAvatarFocusY ||
      nextAvatarZoom !== prevAvatarZoom
    );
  }, [
    cloudProfile,
    profileAvatarFocusX,
    profileAvatarFocusY,
    profileAvatarStorageId,
    profileAvatarUrl,
    profileAvatarZoom,
    profileBio,
    profileHandle,
    profileName,
    session,
  ]);

  const profileNeedsSave = Boolean(session && (isProfileDirty || cloudProfile === null));

  return {
    profileName,
    setProfileName,
    profileHandle,
    setProfileHandle,
    profileBio,
    setProfileBio,
    profileAvatarUrl,
    setProfileAvatarUrl,
    profileAvatarStorageId,
    setProfileAvatarStorageId,
    profileAvatarFocusX,
    setProfileAvatarFocusX,
    profileAvatarFocusY,
    setProfileAvatarFocusY,
    profileAvatarZoom,
    setProfileAvatarZoom,
    isProfileAvatarFocusModalOpen,
    setIsProfileAvatarFocusModalOpen,
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
