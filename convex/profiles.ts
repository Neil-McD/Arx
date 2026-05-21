import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { ensureAuthenticatedActor, resolveUserIdForAuthenticatedRequest } from "./authActor";
import { validateProfileHandle } from "../shared/profileHandle";
import { maybeDeleteStorageAsset } from "./communityCore";
import { recordCurrentPlatformLegalAcceptance } from "./legalAcceptances";
import { resolveUserProfileDisplayProjectionForUser } from "./userProfileProjection";
import {
  SOCIAL_PROFILE_KINDS,
  normalizeSocialProfileLinks,
  normalizeSocialProfileUrl,
  type SocialProfileKind,
  type SocialProfileLinks,
} from "../shared/socialProfileLinks";
import {
  loadAccountSetupStatusForUser,
  type AccountSetupProfileDetailRow as ProfileDetailRow,
  type AccountSetupUserRow as UserRow,
} from "./accountSetupCore";

type ProfileMutationErrorCode =
  | "profile_avatar_invalid"
  | "profile_handle_taken"
  | "profile_handle_empty"
  | "profile_handle_reserved"
  | "profile_handle_too_short"
  | "profile_handle_too_long"
  | "profile_handle_invalid_format"
  | "profile_forbidden"
  | "profile_link_invalid_youtube"
  | "profile_link_invalid_x"
  | "profile_link_invalid_instagram"
  | "platform_legal_versions_required"
  | "user_not_found";

function throwProfileMutationError(code: ProfileMutationErrorCode): never {
  throw new ConvexError({ code, reason: code });
}

function normalizeSubject(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeOptionalText(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
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

function normalizeProfileSocialLink(kind: SocialProfileKind, raw: unknown): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  const normalized = normalizeSocialProfileUrl(kind, trimmed);
  if (!normalized) throwProfileMutationError(`profile_link_invalid_${kind}`);
  return normalized;
}

function normalizeProfileSocialLinksForStorage(raw: unknown): SocialProfileLinks | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const input = raw as Partial<Record<SocialProfileKind, unknown>>;
  const links = {
    youtube: normalizeProfileSocialLink("youtube", input.youtube),
    x: normalizeProfileSocialLink("x", input.x),
    instagram: normalizeProfileSocialLink("instagram", input.instagram),
  };
  return SOCIAL_PROFILE_KINDS.some((kind) => links[kind]) ? links : undefined;
}

async function maybeResolveStorageUrl(ctx: any, storageId: unknown): Promise<string | null> {
  if (!storageId) return null;
  const resolved = await ctx.storage.getUrl(storageId);
  return typeof resolved === "string" && resolved.trim() ? resolved.trim() : null;
}

async function assertProfileAvatarStorageResolvable(ctx: any, storageId: unknown): Promise<void> {
  if (!storageId) return;
  try {
    const resolved = await maybeResolveStorageUrl(ctx, storageId);
    if (resolved) return;
  } catch {
    // Normalize storage errors into the profile mutation contract.
  }
  throwProfileMutationError("profile_avatar_invalid");
}

async function findUserBySubject(ctx: any, authSubject: string): Promise<UserRow | null> {
  const normalized = normalizeSubject(authSubject);
  if (!normalized) return null;
  const row = (await ctx.db
    .query("users")
    .withIndex("by_authSubject", (q: any) => q.eq("authSubject", normalized))
    .first()) as UserRow | null;
  return row;
}

async function findProfileDetailByUserId(ctx: any, userId: any): Promise<ProfileDetailRow | null> {
  return (await ctx.db
    .query("userProfileDetails")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first()) as ProfileDetailRow | null;
}

async function resolveProfileAvatarFields(ctx: any, detail: ProfileDetailRow | null) {
  const avatarUrl = await maybeResolveStorageUrl(ctx, detail?.avatarStorageId);
  return {
    avatar_url: avatarUrl ?? detail?.avatarUrl ?? null,
    avatar_storage_id: detail?.avatarStorageId ? String(detail.avatarStorageId) : null,
    avatar_focus_x: normalizeAvatarFocus(detail?.avatarFocusX),
    avatar_focus_y: normalizeAvatarFocus(detail?.avatarFocusY),
    avatar_zoom: normalizeAvatarZoom(detail?.avatarZoom),
  };
}

async function mapProfileBase(ctx: any, user: UserRow, detail?: ProfileDetailRow | null) {
  const resolvedDetail = detail === undefined ? await findProfileDetailByUserId(ctx, user._id) : detail;
  return {
    user_id: user.authSubject,
    display_name: resolvedDetail?.displayName ?? null,
    handle: user.handle ?? null,
    normalized_handle: user.normalizedHandle ?? null,
    ...(await resolveProfileAvatarFields(ctx, resolvedDetail)),
  };
}

async function mapProfileDetail(ctx: any, user: UserRow, detail: ProfileDetailRow | null) {
  return {
    ...(await mapProfileBase(ctx, user, detail)),
    bio: detail?.bio ?? null,
    social_links: normalizeSocialProfileLinks(detail?.socialLinks ?? {}),
    onboarding_direction: detail?.onboardingDirection ?? null,
    onboarding_completed_at:
      typeof detail?.onboardingCompletedAt === "number"
        ? new Date(detail.onboardingCompletedAt).toISOString()
        : null,
  };
}

async function mapProfileDetailWithSetup(
  ctx: any,
  user: UserRow,
  detail: ProfileDetailRow | null,
) {
  return {
    ...(await mapProfileDetail(ctx, user, detail)),
    account_setup: await loadAccountSetupStatusForUser(ctx, user, detail),
  };
}

async function assertHandleAvailable(ctx: any, normalizedHandle: string, userId: any): Promise<void> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_normalizedHandle", (q: any) => q.eq("normalizedHandle", normalizedHandle))
    .first();
  if (existing && existing._id !== userId) {
    throwProfileMutationError("profile_handle_taken");
  }
}

export const checkHandleAvailability = query({
  args: {
    authSubject: v.optional(v.string()),
    handle: v.string(),
  },
  handler: async (ctx, args) => {
    const validation = validateProfileHandle(args.handle);
    if (!validation.ok) {
      return {
        available: false,
        status: validation.reason,
        handle: null,
        normalized_handle: null,
      };
    }

    const currentUserId = args.authSubject
      ? await resolveUserIdForAuthenticatedRequest({
          ctx,
          authSubject: args.authSubject,
        })
      : null;
    const existing = await ctx.db
      .query("users")
      .withIndex("by_normalizedHandle", (q: any) => q.eq("normalizedHandle", validation.normalizedHandle))
      .first();
    const ownedByCurrentUser = Boolean(existing && currentUserId && String(existing._id) === String(currentUserId));
    const available = !existing || ownedByCurrentUser;
    return {
      available,
      status: available ? "available" : "taken",
      handle: validation.handle,
      normalized_handle: validation.normalizedHandle,
    };
  },
});

export const listProfilesByUserIds = query({
  args: {
    userIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const normalizedUserIds = Array.from(
      new Set(args.userIds.map((value) => normalizeSubject(value)).filter(Boolean)),
    );
    const rows: Array<{
      user_id: string;
      display_name: string | null;
      handle: string | null;
      normalized_handle: string | null;
      avatar_url: string | null;
      avatar_storage_id: string | null;
      avatar_focus_x: number;
      avatar_focus_y: number;
      avatar_zoom: number;
    }> = [];
    for (const userId of normalizedUserIds) {
      const user = await findUserBySubject(ctx, userId);
      if (!user) continue;
      rows.push({
        user_id: user.authSubject,
        handle: user.handle ?? null,
        normalized_handle: user.normalizedHandle ?? null,
        ...(await resolveUserProfileDisplayProjectionForUser(ctx, user)),
      });
    }
    return rows;
  },
});

export const getProfileDetailByUserId = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await findUserBySubject(ctx, args.userId);
    if (!user) return null;
    const detail = await findProfileDetailByUserId(ctx, user._id);
    // Detail/setup reads expose explicit profile fields only; public display fallback lives in userProfileProjection.
    return await mapProfileDetail(ctx, user, detail);
  },
});

export const generateProfileAvatarUploadUrl = mutation({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    return {
      uploadUrl: await ctx.storage.generateUploadUrl(),
    };
  },
});

export const resolveOnboardingProfileDetail = mutation({
  args: {
    authSubject: v.optional(v.string()),
    userId: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const actor = await ensureAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
      nowMs,
    });
    const requestedSubject = normalizeSubject(args.userId ?? actor.authSubject);
    if (requestedSubject !== actor.authSubject) {
      throwProfileMutationError("profile_forbidden");
    }

    const user = (await ctx.db.get(actor.dbUserId)) as UserRow | null;
    if (!user) throwProfileMutationError("user_not_found");

    const existingDetail = (await ctx.db
      .query("userProfileDetails")
      .withIndex("by_user", (q: any) => q.eq("userId", actor.dbUserId))
      .first()) as ProfileDetailRow | null;

    return await mapProfileDetailWithSetup(ctx, user, existingDetail);
  },
});

export const getMyAccountSetupStatus = query({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const user = (await ctx.db.get(userId)) as UserRow | null;
    if (!user) throwProfileMutationError("user_not_found");
    const detail = (await ctx.db
      .query("userProfileDetails")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .first()) as ProfileDetailRow | null;
    return await loadAccountSetupStatusForUser(ctx, user, detail);
  },
});

export const upsertProfileDetail = mutation({
  args: {
    authSubject: v.optional(v.string()),
    userId: v.optional(v.string()),
    displayName: v.optional(v.union(v.string(), v.null())),
    handle: v.optional(v.union(v.string(), v.null())),
    avatarStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    avatarUrl: v.optional(v.union(v.string(), v.null())),
    avatarFocusX: v.optional(v.number()),
    avatarFocusY: v.optional(v.number()),
    avatarZoom: v.optional(v.number()),
    bio: v.optional(v.union(v.string(), v.null())),
    socialLinks: v.optional(
      v.union(
        v.object({
          youtube: v.optional(v.union(v.string(), v.null())),
          x: v.optional(v.union(v.string(), v.null())),
          instagram: v.optional(v.union(v.string(), v.null())),
        }),
        v.null(),
      ),
    ),
    onboardingDirection: v.optional(
      v.union(
        v.literal("build_community"),
        v.literal("discover_community"),
        v.literal("learn_about_polynet"),
        v.null(),
      ),
    ),
    markOnboardingDismissed: v.optional(v.boolean()),
    // Compatibility alias for older clients. Account setup truth is the returned `account_setup`.
    completeOnboarding: v.optional(v.boolean()),
    termsOfServiceVersion: v.optional(v.union(v.string(), v.null())),
    privacyPolicyVersion: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const actor = await ensureAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
      nowMs,
      displayName: args.displayName,
      avatarUrl: args.avatarStorageId ? undefined : args.avatarUrl,
    });
    const requestedSubject = normalizeSubject(args.userId ?? actor.authSubject);
    if (requestedSubject !== actor.authSubject) {
      throwProfileMutationError("profile_forbidden");
    }

    const userPatch: Record<string, unknown> = { updatedAt: nowMs };
    if (args.displayName !== undefined) {
      userPatch.displayName = String(args.displayName ?? "").trim() || undefined;
    }
    if (args.handle !== undefined) {
      const rawHandle = String(args.handle ?? "").trim();
      if (!rawHandle) {
        userPatch.handle = undefined;
        userPatch.normalizedHandle = undefined;
      } else {
        const handle = validateProfileHandle(rawHandle);
        if (!handle.ok) throwProfileMutationError(`profile_handle_${handle.reason}`);
        await assertHandleAvailable(ctx, handle.normalizedHandle, actor.dbUserId);
        userPatch.handle = handle.handle;
        userPatch.normalizedHandle = handle.normalizedHandle;
      }
    }
    if (args.avatarUrl !== undefined || args.avatarStorageId !== undefined) {
      userPatch.avatarUrl = args.avatarStorageId ? undefined : normalizeOptionalText(args.avatarUrl);
    }
    await ctx.db.patch(actor.dbUserId, userPatch);

    const existingDetail = (await ctx.db
      .query("userProfileDetails")
      .withIndex("by_user", (q: any) => q.eq("userId", actor.dbUserId))
      .first()) as ProfileDetailRow | null;
    if (args.avatarStorageId) {
      await assertProfileAvatarStorageResolvable(ctx, args.avatarStorageId);
    }
    const termsOfServiceVersion = normalizeOptionalText(args.termsOfServiceVersion);
    const privacyPolicyVersion = normalizeOptionalText(args.privacyPolicyVersion);
    if (termsOfServiceVersion || privacyPolicyVersion) {
      if (!termsOfServiceVersion || !privacyPolicyVersion) {
        throwProfileMutationError("platform_legal_versions_required");
      }
      await recordCurrentPlatformLegalAcceptance(ctx, {
        userId: actor.dbUserId,
        termsVersion: termsOfServiceVersion,
        privacyPolicyVersion,
        source: "account_onboarding_profile",
        acceptedAt: Date.now(),
      });
    }
    const nextDisplayName =
      args.displayName !== undefined
        ? String(args.displayName ?? "").trim() || undefined
        : existingDetail?.displayName;
    const nextAvatarStorageId =
      args.avatarStorageId !== undefined
        ? args.avatarStorageId ?? undefined
        : existingDetail?.avatarStorageId;
    const nextAvatarUrl =
      nextAvatarStorageId
        ? undefined
        : args.avatarUrl !== undefined || args.avatarStorageId !== undefined
          ? normalizeOptionalText(args.avatarUrl)
          : existingDetail?.avatarUrl;
    const nextAvatarFocusX =
      args.avatarFocusX !== undefined
        ? normalizeAvatarFocus(args.avatarFocusX)
        : normalizeAvatarFocus(existingDetail?.avatarFocusX);
    const nextAvatarFocusY =
      args.avatarFocusY !== undefined
        ? normalizeAvatarFocus(args.avatarFocusY)
        : normalizeAvatarFocus(existingDetail?.avatarFocusY);
    const nextAvatarZoom =
      args.avatarZoom !== undefined
        ? normalizeAvatarZoom(args.avatarZoom)
        : normalizeAvatarZoom(existingDetail?.avatarZoom);
    const nextBio = args.bio !== undefined ? String(args.bio ?? "").trim() || undefined : existingDetail?.bio;
    const nextSocialLinks =
      args.socialLinks === undefined
        ? existingDetail?.socialLinks
        : normalizeProfileSocialLinksForStorage(args.socialLinks);
    const nextOnboardingDirection =
      args.onboardingDirection === undefined
        ? existingDetail?.onboardingDirection
        : args.onboardingDirection ?? undefined;
    const shouldMarkOnboardingDismissed =
      args.markOnboardingDismissed === true || args.completeOnboarding === true;

    if (!existingDetail) {
      await ctx.db.insert("userProfileDetails", {
        userId: actor.dbUserId,
        displayName: nextDisplayName,
        avatarUrl: nextAvatarUrl,
        avatarStorageId: nextAvatarStorageId,
        avatarFocusX: nextAvatarFocusX,
        avatarFocusY: nextAvatarFocusY,
        avatarZoom: nextAvatarZoom,
        bio: nextBio,
        socialLinks: nextSocialLinks,
        onboardingDirection: nextOnboardingDirection,
        ...(shouldMarkOnboardingDismissed ? { onboardingCompletedAt: nowMs } : null),
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    } else {
      await ctx.db.patch(existingDetail._id, {
        displayName: nextDisplayName,
        avatarUrl: nextAvatarUrl,
        avatarStorageId: nextAvatarStorageId,
        avatarFocusX: nextAvatarFocusX,
        avatarFocusY: nextAvatarFocusY,
        avatarZoom: nextAvatarZoom,
        bio: nextBio,
        socialLinks: nextSocialLinks,
        onboardingDirection: nextOnboardingDirection,
        ...(shouldMarkOnboardingDismissed && !existingDetail.onboardingCompletedAt
          ? { onboardingCompletedAt: nowMs }
          : null),
        updatedAt: nowMs,
      });
    }

    if (
      existingDetail?.avatarStorageId &&
      String(existingDetail.avatarStorageId) !== String(nextAvatarStorageId ?? "")
    ) {
      await maybeDeleteStorageAsset(ctx, existingDetail.avatarStorageId);
    }

    const refreshedUser = (await ctx.db.get(actor.dbUserId)) as UserRow | null;
    const detail = await findProfileDetailByUserId(ctx, actor.dbUserId);

    if (!refreshedUser) throwProfileMutationError("user_not_found");

    return await mapProfileDetailWithSetup(ctx, refreshedUser, detail);
  },
});
