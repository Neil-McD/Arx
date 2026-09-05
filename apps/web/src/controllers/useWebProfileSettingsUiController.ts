import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { type SocialProfileKind } from "../../../../shared/socialProfileLinks";
import {
  writeProfileDraftForUser,
  type LocalProfileDraft,
} from "../../../../shared/profileDraftStorage";
import {
  createProfileDraft,
  editProfileDraft,
  equalProfileFields,
  hydrateProfileDraft,
  profileFields,
  type LoadedProfile,
  type ProfileDraftSnapshot,
  type ProfileField,
  type ProfileFields,
} from "../../../../shared/profileDraftState";

export type ProfileLoadStatus =
  | "idle"
  | "loading"
  | "ready"
  | "missing"
  | "error";

export function useWebProfileSettingsUiController(params: {
  profileStorageUserId: string | null;
  initialProfileDraft: LocalProfileDraft;
  session: {
    user?: { id?: string | null; email?: string | null } | null;
  } | null;
  cloudProfile: LoadedProfile | null;
}) {
  const accountId = params.profileStorageUserId;
  const [draft, setDraft] = useState(() =>
    createProfileDraft(accountId, params.initialProfileDraft),
  );
  const [load, setLoad] = useState<{
    accountId: string | null;
    status: ProfileLoadStatus;
  }>({ accountId, status: params.cloudProfile ? "ready" : "idle" });
  const current =
    draft.accountId === accountId
      ? draft
      : createProfileDraft(accountId, params.initialProfileDraft);
  if (current !== draft) setDraft(current);
  const draftRef = useRef(current);
  draftRef.current = current;
  const [isProfileAvatarFocusModalOpen, setIsProfileAvatarFocusModalOpen] =
    useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [isProfileAvatarDragOver, setIsProfileAvatarDragOver] = useState(false);

  useEffect(() => {
    setProfileSaveError(null);
    setIsSavingProfile(false);
    setIsProfileAvatarFocusModalOpen(false);
  }, [accountId]);

  useEffect(() => {
    writeProfileDraftForUser(current.accountId, {
      ...current.values,
      touched: {
        name: current.touched.name === true,
        handle: current.touched.handle === true,
        bio: current.touched.bio === true,
      },
    });
  }, [
    current.accountId,
    current.values.name,
    current.values.handle,
    current.values.bio,
    current.touched.name,
    current.touched.handle,
    current.touched.bio,
  ]);

  const updateDraft = useCallback((next: ProfileDraftSnapshot) => {
    draftRef.current = next;
    setDraft(next);
  }, []);
  const setters = useMemo(() => {
    const fieldSetter =
      <K extends ProfileField>(field: K) =>
      (action: SetStateAction<ProfileFields[K]>) => {
        const previous = draftRef.current;
        if (previous.accountId !== accountId) return;
        const value =
          typeof action === "function"
            ? (action as (v: ProfileFields[K]) => ProfileFields[K])(
                previous.values[field],
              )
            : action;
        updateDraft(editProfileDraft(previous, field, value));
      };
    return {
      setProfileName: fieldSetter("name"),
      setProfileHandle: fieldSetter("handle"),
      setProfileBio: fieldSetter("bio"),
      setProfileSocialLinks: fieldSetter("socialLinks"),
      setProfileAvatarUrl: fieldSetter("avatarUrl"),
      setProfileAvatarStorageId: fieldSetter("avatarStorageId"),
      setProfileAvatarFocusX: fieldSetter("avatarFocusX"),
      setProfileAvatarFocusY: fieldSetter("avatarFocusY"),
      setProfileAvatarZoom: fieldSetter("avatarZoom"),
    };
  }, [accountId, updateDraft]);
  const applyLoadedProfileToLocal = useCallback(
    (profile: LoadedProfile) => {
      if (profile.user_id && profile.user_id !== draftRef.current.accountId)
        return;
      updateDraft(hydrateProfileDraft(draftRef.current, profile));
    },
    [updateDraft],
  );
  const captureProfileDraft = useCallback(() => draftRef.current, []);
  const applySavedProfileToLocal = useCallback(
    (profile: LoadedProfile, submitted: ProfileDraftSnapshot) => {
      updateDraft(hydrateProfileDraft(draftRef.current, profile, submitted));
    },
    [updateDraft],
  );
  const setProfileLoadStatus = useCallback((status: ProfileLoadStatus) => {
    setLoad({ accountId: draftRef.current.accountId, status });
  }, []);
  const profileLoadStatus = load.accountId === accountId ? load.status : "idle";
  const cloudProfile =
    params.cloudProfile?.user_id && params.cloudProfile.user_id !== accountId
      ? null
      : params.cloudProfile;
  const isProfileDirty = Boolean(
    params.session &&
    !equalProfileFields(current.values, profileFields(cloudProfile ?? {})),
  );
  const isProfileResolved =
    profileLoadStatus === "ready" ||
    profileLoadStatus === "missing" ||
    Boolean(cloudProfile);
  const profileNeedsSave = Boolean(
    params.session &&
    isProfileResolved &&
    (isProfileDirty || profileLoadStatus === "missing"),
  );
  const v = current.values;
  return {
    profileName: v.name,
    profileHandle: v.handle,
    profileBio: v.bio,
    profileSocialLinks: v.socialLinks,
    profileAvatarUrl: v.avatarUrl,
    profileAvatarStorageId: v.avatarStorageId,
    profileAvatarFocusX: v.avatarFocusX,
    profileAvatarFocusY: v.avatarFocusY,
    profileAvatarZoom: v.avatarZoom,
    ...setters,
    setProfileSocialLink: (kind: SocialProfileKind, value: string) =>
      setters.setProfileSocialLinks((prev) => ({ ...prev, [kind]: value })),
    isProfileAvatarFocusModalOpen,
    setIsProfileAvatarFocusModalOpen,
    isSavingProfile,
    setIsSavingProfile,
    profileSaveError,
    setProfileSaveError,
    isProfileAvatarDragOver,
    setIsProfileAvatarDragOver,
    isProfileDirty,
    profileNeedsSave,
    profileLoadStatus,
    setProfileLoadStatus,
    applyLoadedProfileToLocal,
    captureProfileDraft,
    applySavedProfileToLocal,
  };
}
export type UseWebProfileSettingsUiControllerResult = ReturnType<
  typeof useWebProfileSettingsUiController
>;
