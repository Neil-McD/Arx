export type LocalProfileDraft = {
  name: string;
  username: string;
  bio: string;
  avatarUrl: string | null;
};

function emptyDraft(): LocalProfileDraft {
  return { name: "", username: "", bio: "", avatarUrl: null };
}

function profileStorageKeysForUser(userId: string | null | undefined): {
  name: string;
  username: string;
  bio: string;
  avatar: string;
} {
  const raw = (userId ?? "").trim();
  const suffix = raw ? `user_${raw}_` : "guest_";
  return {
    name: `arx_profile_${suffix}name`,
    username: `arx_profile_${suffix}username`,
    bio: `arx_profile_${suffix}bio`,
    avatar: `arx_profile_${suffix}avatar`,
  };
}

export function readProfileDraftForUser(userId: string | null | undefined): LocalProfileDraft {
  const keys = profileStorageKeysForUser(userId);
  try {
    const name = localStorage.getItem(keys.name) ?? "";
    const username = localStorage.getItem(keys.username) ?? "";
    const bio = localStorage.getItem(keys.bio) ?? "";
    const avatarRaw = localStorage.getItem(keys.avatar);
    const scopedDraft: LocalProfileDraft = {
      name,
      username,
      bio,
      avatarUrl: avatarRaw && avatarRaw.trim() ? avatarRaw : null,
    };
    return scopedDraft;
  } catch {
    return emptyDraft();
  }
}

export function writeProfileDraftForUser(userId: string | null | undefined, draft: LocalProfileDraft): void {
  const keys = profileStorageKeysForUser(userId);
  const name = draft.name.trim();
  const username = draft.username.trim();
  const bio = draft.bio.trim();
  const avatar = (draft.avatarUrl ?? "").trim();
  try {
    if (name) localStorage.setItem(keys.name, name);
    else localStorage.removeItem(keys.name);
    if (username) localStorage.setItem(keys.username, username);
    else localStorage.removeItem(keys.username);
    if (bio) localStorage.setItem(keys.bio, bio);
    else localStorage.removeItem(keys.bio);
    if (avatar) localStorage.setItem(keys.avatar, avatar);
    else localStorage.removeItem(keys.avatar);
  } catch {
    // ignore
  }
}
