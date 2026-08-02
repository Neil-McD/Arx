import { getUniqueUserProfileDetailByUserId } from "./profileCore";

type UserProfileProjectionUserRow = {
  _id: any;
  displayName?: string;
  avatarUrl?: string;
};

type UserProfileProjectionDetailRow = {
  displayName?: string;
  avatarUrl?: string;
  avatarStorageId?: any;
  avatarFocusX?: number;
  avatarFocusY?: number;
  avatarZoom?: number;
};

function normalizeOptionalText(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeAvatarFocus(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0.5;
  return Math.max(0, Math.min(1, parsed));
}

function normalizeAvatarZoom(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(2.5, parsed));
}

async function maybeResolveStorageUrl(ctx: any, storageId: unknown): Promise<string | null> {
  if (!storageId) return null;
  try {
    const resolved = await ctx.storage.getUrl(storageId);
    return normalizeOptionalText(resolved);
  } catch {
    return null;
  }
}

export async function resolveUserProfileDisplayProjectionForUser(
  ctx: any,
  user: UserProfileProjectionUserRow,
  detail?: UserProfileProjectionDetailRow | null,
) {
  const profile =
    detail === undefined
      ? await getUniqueUserProfileDetailByUserId<UserProfileProjectionDetailRow>(
          ctx,
          user._id,
        )
      : detail;
  const storageAvatarUrl = await maybeResolveStorageUrl(ctx, profile?.avatarStorageId);
  const profileAvatarUrl = normalizeOptionalText(profile?.avatarUrl);
  const accountAvatarUrl = normalizeOptionalText(user.avatarUrl);

  return {
    display_name: normalizeOptionalText(profile?.displayName) ?? normalizeOptionalText(user.displayName),
    avatar_url: storageAvatarUrl ?? profileAvatarUrl ?? accountAvatarUrl,
    avatar_storage_id: profile?.avatarStorageId ? String(profile.avatarStorageId) : null,
    avatar_focus_x: normalizeAvatarFocus(profile?.avatarFocusX),
    avatar_focus_y: normalizeAvatarFocus(profile?.avatarFocusY),
    avatar_zoom: normalizeAvatarZoom(profile?.avatarZoom),
  };
}

export async function resolveUserProfileDisplayProjection(ctx: any, userId: any) {
  const user = (await ctx.db.get(userId)) as UserProfileProjectionUserRow | null;
  if (!user) {
    return {
      display_name: null,
      avatar_url: null,
      avatar_storage_id: null,
      avatar_focus_x: 0.5,
      avatar_focus_y: 0.5,
      avatar_zoom: 1,
    };
  }
  return await resolveUserProfileDisplayProjectionForUser(ctx, user);
}
