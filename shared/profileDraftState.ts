import {
  normalizeSocialProfileLinks,
  type SocialProfileLinks,
} from "./socialProfileLinks";
import type { LocalProfileDraft } from "./profileDraftStorage";

export type ProfileFields = {
  name: string;
  handle: string;
  bio: string;
  socialLinks: SocialProfileLinks;
  avatarUrl: string | null;
  avatarStorageId: string | null;
  avatarFocusX: number;
  avatarFocusY: number;
  avatarZoom: number;
};
export type ProfileField = keyof ProfileFields;
export type ProfileDraftSnapshot = {
  accountId: string | null;
  values: ProfileFields;
  versions: Partial<Record<ProfileField, number>>;
  touched: Partial<Record<ProfileField, boolean>>;
};
export type LoadedProfile = {
  user_id?: string;
  display_name?: string | null;
  handle?: string | null;
  bio?: string | null;
  social_links?: Partial<SocialProfileLinks> | null;
  avatar_url?: string | null;
  avatar_storage_id?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

export function profileFields(profile: LoadedProfile): ProfileFields {
  return {
    name: profile.display_name ?? "",
    handle: profile.handle ?? "",
    bio: profile.bio ?? "",
    socialLinks: normalizeSocialProfileLinks(profile.social_links ?? {}),
    avatarUrl: profile.avatar_url ?? null,
    avatarStorageId: profile.avatar_storage_id ?? null,
    avatarFocusX: profile.avatar_focus_x ?? 0.5,
    avatarFocusY: profile.avatar_focus_y ?? 0.5,
    avatarZoom: profile.avatar_zoom ?? 1,
  };
}

export function createProfileDraft(
  accountId: string | null,
  initial: LocalProfileDraft,
): ProfileDraftSnapshot {
  const values = {
    ...profileFields({}),
    ...(accountId
      ? { name: initial.name, handle: initial.handle, bio: initial.bio }
      : {}),
  };
  // Preserve existing local drafts; subsequent edits track intentional empty values too.
  const versions: ProfileDraftSnapshot["versions"] = {};
  for (const key of ["name", "handle", "bio"] as const)
    if (
      accountId &&
      (initial.touched ? initial.touched[key] : Boolean(values[key]))
    )
      versions[key] = 1;
  return {
    accountId,
    values,
    versions,
    touched: Object.fromEntries(
      Object.keys(versions).map((key) => [key, true]),
    ),
  };
}

export function editProfileDraft<K extends ProfileField>(
  draft: ProfileDraftSnapshot,
  field: K,
  value: ProfileFields[K],
): ProfileDraftSnapshot {
  return {
    ...draft,
    values: { ...draft.values, [field]: value },
    versions: { ...draft.versions, [field]: (draft.versions[field] ?? 0) + 1 },
    touched: { ...draft.touched, [field]: true },
  };
}

export function hydrateProfileDraft(
  draft: ProfileDraftSnapshot,
  profile: LoadedProfile,
  submitted?: ProfileDraftSnapshot,
): ProfileDraftSnapshot {
  if (submitted && submitted.accountId !== draft.accountId) return draft;
  const incoming = profileFields(profile);
  const values = { ...draft.values };
  const touched = { ...draft.touched };
  for (const field of Object.keys(incoming) as ProfileField[]) {
    const canApply = submitted
      ? (draft.versions[field] ?? 0) === (submitted.versions[field] ?? 0)
      : !draft.touched[field];
    if (canApply) {
      Object.assign(values, { [field]: incoming[field] });
      if (submitted) delete touched[field];
    }
  }
  // Versions are monotonic so edits during later saves cannot match an older revision.
  return { ...draft, values, touched };
}

export function equalProfileFields(
  a: ProfileFields,
  b: ProfileFields,
): boolean {
  const normalized = (v: ProfileFields) => ({
    ...v,
    name: v.name.trim(),
    handle: v.handle.trim(),
    bio: v.bio.trim(),
    socialLinks: normalizeSocialProfileLinks(v.socialLinks),
  });
  return JSON.stringify(normalized(a)) === JSON.stringify(normalized(b));
}
