import { useEffect, useMemo, useRef, useState } from "react";
import {
  SOCIAL_PROFILE_KINDS,
  emptySocialProfileLinks,
  normalizeSocialProfileLinks,
  type SocialProfileKind,
  type SocialProfileLinks,
} from "../../../../shared/socialProfileLinks";

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
  social_links?: Partial<Record<SocialProfileKind, string | null>> | null;
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

function trimSocialProfileLinks(links: SocialProfileLinks): SocialProfileLinks {
  return {
    youtube: links.youtube.trim(),
    x: links.x.trim(),
    instagram: links.instagram.trim(),
  };
}

export function useWebProfileSettingsUiController(
  params: UseWebProfileSettingsUiControllerParams,
) {
  const { profileStorageUserId, initialProfileDraft, session, cloudProfile } = params;

  const [profileName, setProfileName] = useState(() => initialProfileDraft.name);
  const [profileHandle, setProfileHandle] = useState(() => initialProfileDraft.handle);
  const [profileBio, setProfileBio] = useState(() => initialProfileDraft.bio);
  const [profileSocialLinks, setProfileSocialLinks] = useState<SocialProfileLinks>(() => emptySocialProfileLinks());
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
    if (
      !profileName &&
      !profileHandle &&
      !profileBio &&
      !SOCIAL_PROFILE_KINDS.some((kind) => profileSocialLinks[kind].trim()) &&
      !profileAvatarUrl &&
      !profileAvatarStorageId
    ) return;
    setProfileName("");
    setProfileHandle("");
    setProfileBio("");
    setProfileSocialLinks(emptySocialProfileLinks());
    setProfileAvatarUrl(null);
    setProfileAvatarStorageId(null);
    setProfileAvatarFocusX(0.5);
    setProfileAvatarFocusY(0.5);
    setProfileAvatarZoom(1);
    setIsProfileAvatarFocusModalOpen(false);
  }, [profileAvatarStorageId, profileAvatarUrl, profileBio, profileHandle, profileName, profileSocialLinks, session]);

  const applyLoadedProfileToLocal = (profile: NonNullable<CloudProfileLike>) => {
    setProfileName((prev) => (prev.trim() ? prev : profile.display_name ?? ""));
    setProfileHandle((prev) => (prev.trim() ? prev : profile.handle ?? ""));
    setProfileBio((prev) => (prev.trim() ? prev : profile.bio ?? ""));
    setProfileSocialLinks((prev) =>
      SOCIAL_PROFILE_KINDS.some((kind) => prev[kind].trim())
        ? prev
        : normalizeSocialProfileLinks(profile.social_links ?? {}),
    );
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
    const nextSocialLinks = trimSocialProfileLinks(profileSocialLinks);
    const nextAvatar = profileAvatarUrl ?? null;
    const nextAvatarStorageId = profileAvatarStorageId ?? null;
    const nextAvatarFocusX = profileAvatarFocusX;
    const nextAvatarFocusY = profileAvatarFocusY;
    const nextAvatarZoom = profileAvatarZoom;
    const prevName = (cloudProfile?.display_name ?? "").trim();
    const prevHandle = (cloudProfile?.handle ?? "").trim();
    const prevBio = (cloudProfile?.bio ?? "").trim();
    const prevSocialLinks = normalizeSocialProfileLinks(cloudProfile?.social_links ?? {});
    const prevAvatar = cloudProfile?.avatar_url ?? null;
    const prevAvatarStorageId = cloudProfile?.avatar_storage_id ?? null;
    const prevAvatarFocusX = cloudProfile?.avatar_focus_x ?? 0.5;
    const prevAvatarFocusY = cloudProfile?.avatar_focus_y ?? 0.5;
    const prevAvatarZoom = cloudProfile?.avatar_zoom ?? 1;
    if (!cloudProfile) {
      return Boolean(
        nextName ||
        nextHandle ||
        nextBio ||
        SOCIAL_PROFILE_KINDS.some((kind) => nextSocialLinks[kind]) ||
        nextAvatar,
      );
    }
    return (
      nextName !== prevName ||
      nextHandle !== prevHandle ||
      nextBio !== prevBio ||
      SOCIAL_PROFILE_KINDS.some((kind) => nextSocialLinks[kind] !== prevSocialLinks[kind]) ||
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
    profileSocialLinks,
    session,
  ]);

  const setProfileSocialLink = (kind: SocialProfileKind, value: string) => {
    setProfileSocialLinks((prev) => ({
      ...prev,
      [kind]: value,
    }));
  };

  const profileNeedsSave = Boolean(session && (isProfileDirty || cloudProfile === null));

  return {
    profileName,
    setProfileName,
    profileHandle,
    setProfileHandle,
    profileBio,
    setProfileBio,
    profileSocialLinks,
    setProfileSocialLinks,
    setProfileSocialLink,
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

export type UseWebProfileSettingsUiControllerResult = ReturnType<
  typeof useWebProfileSettingsUiController
>;
