export type LocalProfileDraft = {
  name: string;
  handle: string;
  bio: string;
  touched?: Partial<Record<"name" | "handle" | "bio", boolean>>;
};

function emptyDraft(): LocalProfileDraft {
  return { name: "", handle: "", bio: "" };
}

function profileStorageScopeForUser(userId: string | null | undefined): {
  isGuest: boolean;
  keys: {
    name: string;
    username: string;
    bio: string;
    avatar: string;
  };
} {
  const raw = (userId ?? "").trim();
  const isGuest = !raw;
  const suffix = isGuest ? "guest_" : `user_${raw}_`;
  return {
    isGuest,
    keys: {
      name: `arx_profile_${suffix}name`,
      username: `arx_profile_${suffix}username`,
      bio: `arx_profile_${suffix}bio`,
      avatar: `arx_profile_${suffix}avatar`,
    },
  };
}

export function readProfileDraftForUser(userId: string | null | undefined): LocalProfileDraft {
  const { keys, isGuest } = profileStorageScopeForUser(userId);
  if (isGuest) {
    // Signed-out profile is intentionally blank in MVP.
    return emptyDraft();
  }
  try {
    const name = localStorage.getItem(keys.name) ?? "";
    const handle = localStorage.getItem(keys.username) ?? "";
    const bio = localStorage.getItem(keys.bio) ?? "";
    const scopedDraft: LocalProfileDraft = {
      name,
      handle,
      bio,
    };
    const rawState = localStorage.getItem(`${keys.name}:draft-state`);
    if (rawState) {
      try {
        const state = JSON.parse(rawState);
        if (state.version === 1) scopedDraft.touched = {
          name: state.name === true, handle: state.handle === true, bio: state.bio === true,
        };
      } catch { /* Ignore malformed local metadata, not the existing text draft. */ }
    }
    return scopedDraft;
  } catch {
    return emptyDraft();
  }
}

export function writeProfileDraftForUser(userId: string | null | undefined, draft: LocalProfileDraft): void {
  const { keys, isGuest } = profileStorageScopeForUser(userId);
  if (isGuest) {
    try {
      localStorage.removeItem(keys.name);
      localStorage.removeItem(keys.username);
      localStorage.removeItem(keys.bio);
      localStorage.removeItem(keys.avatar);
      localStorage.removeItem(`${keys.name}:draft-state`);
    } catch {
      // ignore
    }
    return;
  }
  const name = draft.name.trim();
  const handle = draft.handle.trim();
  const bio = draft.bio.trim();
  try {
    if (name) localStorage.setItem(keys.name, name);
    else localStorage.removeItem(keys.name);
    if (handle) localStorage.setItem(keys.username, handle);
    else localStorage.removeItem(keys.username);
    if (bio) localStorage.setItem(keys.bio, bio);
    else localStorage.removeItem(keys.bio);
    localStorage.removeItem(keys.avatar);
    if (draft.touched) localStorage.setItem(`${keys.name}:draft-state`, JSON.stringify({ version: 1, ...draft.touched }));
    else localStorage.removeItem(`${keys.name}:draft-state`);
  } catch {
    // ignore
  }
}
