import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { ensureAuthenticatedActor, resolveUserIdForAuthenticatedRequest } from "./authActor";
import { readAuthenticatedIdentityProfile } from "./authIdentity";
import { validateProfileHandle } from "../shared/profileHandle";
import {
  communityMembershipRowIsActive,
  getUniqueCommunityMembershipByPair,
  normalizeCommunityRoleForOutput,
  requireCommunityChatAccess,
} from "./communityCore";
import { communityPresenceLeaseIsActive } from "./communityPresenceCore";
import { resolveViewerProfileRelationship } from "./profileRelationshipCore";
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
import { insertMissingBridgeSocialLinkFacts } from "./memberOntologyCore";
import { requireOperatorRole } from "./operatorAccess";
import {
  validateProfileBio,
  validateProfileDisplayName,
} from "../shared/profileText";
import {
  getUniqueUserByNormalizedHandle,
  getUniqueUserProfileDetailByUserId,
} from "./profileCore";

type ProfileMutationErrorCode =
  | "profile_avatar_invalid"
  | "profile_display_name_too_long"
  | "profile_bio_too_long"
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

const DEFAULT_BRIDGE_SOCIAL_LINK_BACKFILL_PROFILE_LIMIT = 250;
const MAX_BRIDGE_SOCIAL_LINK_BACKFILL_PROFILE_LIMIT = 1000;
const DEFAULT_BRIDGE_SOCIAL_LINK_BACKFILL_INSERT_LIMIT = 100;
const MAX_BRIDGE_SOCIAL_LINK_BACKFILL_INSERT_LIMIT = 500;

function listBridgeSocialLinks(links: SocialProfileLinks | undefined): string[] {
  if (!links) return [];
  return SOCIAL_PROFILE_KINDS.map((kind) => links[kind])
    .map((link) => String(link ?? "").trim())
    .filter(Boolean);
}

function normalizeBridgeSocialLinkBackfillLimit(
  raw: unknown,
  fallback: number,
  max: number,
): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
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
  return await getUniqueUserProfileDetailByUserId<ProfileDetailRow>(ctx, userId);
}

export const resolveCommunityAgentIdentityContextInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const [user, detail] = await Promise.all([
      ctx.db.get(args.userId) as Promise<UserRow | null>,
      findProfileDetailByUserId(ctx, args.userId),
    ]);
    if (!user) return null;

    return {
      display_name: detail?.displayName ?? user.displayName ?? null,
      handle: user.handle ?? null,
      bio: detail?.bio ?? null,
      timezone: (detail as any)?.timezone ?? null,
      social_links: normalizeSocialProfileLinks(detail?.socialLinks ?? {}),
    };
  },
});

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
    timezone: (detail as any)?.timezone ?? null,
    show_owned_communities: (detail as any)?.hideOwnedCommunities !== true,
    show_joined_communities: (detail as any)?.hideJoinedCommunities !== true,
    onboarding_completed_at:
      typeof detail?.onboardingCompletedAt === "number"
        ? new Date(detail.onboardingCompletedAt).toISOString()
        : null,
  };
}

/* Deterministic timezone capture: the browser's IANA zone, recorded silently
   and refreshed when it drifts. Never shown as a question to the member. */
const IANA_TIMEZONE_PATTERN = /^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+){0,2}$/;

export const recordMemberTimezone = mutation({
  args: {
    authSubject: v.optional(v.string()),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const timezone = args.timezone.trim();
    if (!timezone || timezone.length > 64 || !IANA_TIMEZONE_PATTERN.test(timezone)) {
      throw new Error("member_timezone_invalid");
    }
    const nowMs = Date.now();
    const detail = await findProfileDetailByUserId(ctx, userId);
    if (detail) {
      if ((detail as any).timezone === timezone) return { ok: true };
      await ctx.db.patch(detail._id, { timezone, timezoneCapturedAt: nowMs, updatedAt: nowMs });
    } else {
      await ctx.db.insert("userProfileDetails", {
        userId,
        timezone,
        timezoneCapturedAt: nowMs,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }
    return { ok: true };
  },
});

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
  const existing = await getUniqueUserByNormalizedHandle<UserRow>(
    ctx,
    normalizedHandle,
  );
  if (existing && existing._id !== userId) {
    throwProfileMutationError("profile_handle_taken");
  }
}

// Your settings > Profile: whether your profile lists the communities you
// own or co-create, and the public ones you've joined.
export const setMyProfileCommunityVisibility = mutation({
  args: {
    authSubject: v.optional(v.string()),
    showOwned: v.optional(v.boolean()),
    showJoined: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = Date.now();
    const patch: Record<string, unknown> = { updatedAt: nowMs };
    if (args.showOwned !== undefined) patch.hideOwnedCommunities = args.showOwned ? undefined : true;
    if (args.showJoined !== undefined) patch.hideJoinedCommunities = args.showJoined ? undefined : true;
    const detail = await findProfileDetailByUserId(ctx, userId);
    if (detail) {
      await ctx.db.patch(detail._id, patch);
    } else {
      await ctx.db.insert("userProfileDetails", {
        userId,
        ...(args.showOwned === false ? { hideOwnedCommunities: true } : {}),
        ...(args.showJoined === false ? { hideJoinedCommunities: true } : {}),
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }
    return { ok: true };
  },
});

// A person's own Light/Dark pick. Only they set it: from Display, or through an
// agent working for them (member.display.theme.set). Nobody sets it for them.
const projectDisplayPreferences = (detail: ProfileDetailRow | null) => ({
  theme: (detail as any)?.displayTheme ?? null,
  look_everywhere: typeof (detail as any)?.displayLookEverywhere === "boolean" ? (detail as any).displayLookEverywhere : null,
});

export const getMyDisplayPreferences = query({
  args: { authSubject: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    return projectDisplayPreferences(await findProfileDetailByUserId(ctx, userId));
  },
});

export const setMyDisplayPreferences = mutation({
  args: {
    authSubject: v.optional(v.string()),
    theme: v.optional(v.union(v.literal("light"), v.literal("dark"))),
    lookEverywhere: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    const nowMs = Date.now();
    const patch: Record<string, unknown> = { updatedAt: nowMs };
    if (args.theme !== undefined) patch.displayTheme = args.theme;
    if (args.lookEverywhere !== undefined) patch.displayLookEverywhere = args.lookEverywhere;
    const detail = await findProfileDetailByUserId(ctx, userId);
    if (detail) await ctx.db.patch(detail._id, patch);
    else await ctx.db.insert("userProfileDetails", { userId, ...patch, createdAt: nowMs } as any);
    return projectDisplayPreferences(await findProfileDetailByUserId(ctx, userId));
  },
});

export const checkHandleAvailability = query({
  args: {
    authSubject: v.optional(v.string()),
    handle: v.string(),
  },
  handler: async (ctx, args) => {
    const validation = validateProfileHandle(args.handle);
    const currentUserId = validation.ok && args.authSubject
      ? await resolveUserIdForAuthenticatedRequest({
          ctx,
          authSubject: args.authSubject,
        })
      : null;
    return await readHandleAvailability(ctx, args.handle, currentUserId);
  },
});

// Whether a handle is free for this user (their own counts as free): Studio's
// check (checkHandleAvailability) and the private twin's.
async function readHandleAvailability(ctx: any, rawHandle: string, currentUserId: any) {
  const validation = validateProfileHandle(rawHandle);
  if (!validation.ok) {
    return {
      available: false,
      status: validation.reason,
      handle: null,
      normalized_handle: null,
    };
  }
  const existing = await getUniqueUserByNormalizedHandle<UserRow>(
    ctx,
    validation.normalizedHandle,
  );
  const ownedByCurrentUser = Boolean(existing && currentUserId && String(existing._id) === String(currentUserId));
  const available = !existing || ownedByCurrentUser;
  return {
    available,
    status: available ? "available" : "taken",
    handle: validation.handle,
    normalized_handle: validation.normalizedHandle,
  };
}

export const checkHandleAvailabilityForTrustedUserInternal = internalQuery({
  args: { userId: v.id("users"), handle: v.string() },
  handler: async (ctx, args) => await readHandleAvailability(ctx, args.handle, args.userId),
});

// The member's own profile as Studio's settings read it, for the private twin.
export const readOwnProfileDetailForTrustedUserInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = (await ctx.db.get(args.userId)) as UserRow | null;
    if (!user) return null;
    return await mapProfileDetail(ctx, user, await findProfileDetailByUserId(ctx, args.userId));
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
      bio: string | null;
      social_links: SocialProfileLinks;
      avatar_url: string | null;
      avatar_storage_id: string | null;
      avatar_focus_x: number;
      avatar_focus_y: number;
      avatar_zoom: number;
    }> = [];
    for (const userId of normalizedUserIds) {
      const user = await findUserBySubject(ctx, userId);
      if (!user) continue;
      const detail = await findProfileDetailByUserId(ctx, user._id);
      rows.push({
        user_id: user.authSubject,
        handle: user.handle ?? null,
        normalized_handle: user.normalizedHandle ?? null,
        bio: detail?.bio ?? null,
        social_links: normalizeSocialProfileLinks(detail?.socialLinks ?? {}),
        ...(await resolveUserProfileDisplayProjectionForUser(ctx, user, detail)),
      });
    }
    return rows;
  },
});

export const getProfileCommunityContext = query({
  args: {
    authSubject: v.optional(v.string()),
    targetUserId: v.string(),
    preferredCommunityId: v.optional(v.union(v.id("communities"), v.null())),
  },
  handler: async (ctx, args) => {
    const viewerUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject,
    });
    const targetUser = await findUserBySubject(ctx, args.targetUserId);
    if (!targetUser) {
      return {
        owned_communities: [],
        mutual_communities: [],
        is_self: false,
        can_message: false,
        message_context_community_id: null,
        message_unavailable_reason: "no_mutual_community" as const,
      };
    }

    return await resolveViewerProfileRelationship({
      ctx,
      viewerUserId,
      targetUserId: targetUser._id,
      preferredCommunityId: args.preferredCommunityId ?? null,
    });
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
    const profile = await mapProfileDetail(ctx, user, detail);
    // Anyone can read a public profile; the time zone and onboarding state are the owner's alone.
    const viewer = await readAuthenticatedIdentityProfile(ctx).catch(() => null);
    if (viewer?.authSubject === user.authSubject) return profile;
    return { ...profile, timezone: null, onboarding_completed_at: null };
  },
});

// A fellow member's profile as a community's site (or a member's own harness)
// shows it: exactly what Studio shows another member, never the owner-only
// time zone or onboarding state. Reader and subject must both be active in
// this community; anyone else reads as not found (null).
export const readCommunityMemberProfileInternal = internalQuery({
  args: {
    viewerUserId: v.id("users"),
    communityId: v.id("communities"),
    handle: v.optional(v.string()),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { community } = await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: args.viewerUserId });
    const handle = args.handle !== undefined ? validateProfileHandle(args.handle) : null;
    const subjectId = args.userId !== undefined ? ctx.db.normalizeId("users", args.userId) : null;
    const user = handle?.ok
      ? await getUniqueUserByNormalizedHandle<UserRow>(ctx, handle.normalizedHandle)
      : subjectId ? ((await ctx.db.get(subjectId)) as UserRow | null) : null;
    if (!user) return null;
    const isOwner = String(community.ownerId) === String(user._id);
    const membership = isOwner ? null
      : await getUniqueCommunityMembershipByPair({ ctx, communityId: args.communityId, userId: user._id });
    if (!isOwner && !communityMembershipRowIsActive(membership)) return null;
    try {
      await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: user._id });
    } catch {
      return null;
    }
    const profile = await mapProfileDetail(ctx, user, await findProfileDetailByUserId(ctx, user._id));
    const presence = await ctx.db
      .query("communityPresence")
      .withIndex("by_community_user", (q) => q.eq("communityId", args.communityId).eq("userId", user._id))
      .first();
    const ownHandle = validateProfileHandle(user.normalizedHandle ?? user.handle);
    return {
      ref: `user:${String(user._id)}`,
      name: profile.display_name ?? user.displayName ?? null,
      handle: ownHandle.ok ? ownHandle.normalizedHandle : null,
      avatar_url: profile.avatar_url,
      role: isOwner ? "owner" : normalizeCommunityRoleForOutput(membership?.role) || "member",
      online: communityPresenceLeaseIsActive(presence, Date.now()),
      bio: profile.bio,
      links: {
        youtube: profile.social_links.youtube || null,
        x: profile.social_links.x || null,
        instagram: profile.social_links.instagram || null,
      },
    };
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

// The private twin's photo upload, step 1 of Studio's flow: an upload URL for
// a member whose twin session the caller already checked. The browser sends
// the file straight to storage; step 2 is the profile write with its id.
export const generateProfileAvatarUploadUrlForTrustedUserInternal = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    if (!(await ctx.db.get(args.userId))) throwProfileMutationError("user_not_found");
    return { uploadUrl: await ctx.storage.generateUploadUrl() };
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

    const existingDetail = await findProfileDetailByUserId(ctx, actor.dbUserId);

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
    const detail = await findProfileDetailByUserId(ctx, userId);
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
    markOnboardingDismissed: v.optional(v.boolean()),
    // Compatibility alias for older clients. Account setup truth is the returned `account_setup`.
    completeOnboarding: v.optional(v.boolean()),
    termsOfServiceVersion: v.optional(v.union(v.string(), v.null())),
    privacyPolicyVersion: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const text = validateProfileDetailText(args);
    const actor = await ensureAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
      nowMs,
      displayName: text.displayName,
      avatarUrl: args.avatarStorageId ? undefined : args.avatarUrl,
    });
    const requestedSubject = normalizeSubject(args.userId ?? actor.authSubject);
    if (requestedSubject !== actor.authSubject) {
      throwProfileMutationError("profile_forbidden");
    }
    return await writeProfileDetailForUser(ctx, actor.dbUserId, args, nowMs, text);
  },
});

type ProfileDetailWrite = {
  displayName?: string | null;
  handle?: string | null;
  avatarStorageId?: any;
  avatarUrl?: string | null;
  avatarFocusX?: number;
  avatarFocusY?: number;
  avatarZoom?: number;
  bio?: string | null;
  socialLinks?: { youtube?: string | null; x?: string | null; instagram?: string | null } | null;
  markOnboardingDismissed?: boolean;
  completeOnboarding?: boolean;
  termsOfServiceVersion?: string | null;
  privacyPolicyVersion?: string | null;
};

// Name and bio limits, checked before anything is written.
function validateProfileDetailText(args: Pick<ProfileDetailWrite, "displayName" | "bio">) {
  const displayNameValidation =
    args.displayName === undefined ? null : validateProfileDisplayName(args.displayName);
  if (displayNameValidation && !displayNameValidation.ok) {
    throwProfileMutationError("profile_display_name_too_long");
  }
  const bioValidation = args.bio === undefined ? null : validateProfileBio(args.bio);
  if (bioValidation && !bioValidation.ok) {
    throwProfileMutationError("profile_bio_too_long");
  }
  return { displayName: displayNameValidation?.value, bio: bioValidation?.value };
}

// The one profile write, once the caller knows whose profile it is: Studio's
// signed-in user (upsertProfileDetail) or a community site's private twin
// (updateProfileDetailForTrustedUserInternal). Same validation, same rows.
async function writeProfileDetailForUser(
  ctx: any,
  userId: any,
  args: ProfileDetailWrite,
  nowMs: number,
  text: { displayName: string | null | undefined; bio: string | null | undefined },
) {
  const normalizedDisplayName = text.displayName;
  const normalizedBio = text.bio;
  const actor = { dbUserId: userId };
  const userPatch: Record<string, unknown> = { updatedAt: nowMs };
  if (args.displayName !== undefined) {
    userPatch.displayName = normalizedDisplayName ?? undefined;
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

  const existingDetail = await findProfileDetailByUserId(ctx, actor.dbUserId);
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
      ? normalizedDisplayName ?? undefined
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
  const nextBio = args.bio !== undefined ? normalizedBio ?? undefined : existingDetail?.bio;
  const nextSocialLinks =
    args.socialLinks === undefined
      ? existingDetail?.socialLinks
      : normalizeProfileSocialLinksForStorage(args.socialLinks);
  const shouldMarkOnboardingDismissed =
    args.markOnboardingDismissed === true || args.completeOnboarding === true;
  const shouldSeedFirstCompletionBridgeFacts =
    args.completeOnboarding === true && !existingDetail?.onboardingCompletedAt;
  const bridgeSocialLinks = shouldSeedFirstCompletionBridgeFacts
    ? listBridgeSocialLinks(nextSocialLinks)
    : [];

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
      ...(shouldMarkOnboardingDismissed && !existingDetail.onboardingCompletedAt
        ? { onboardingCompletedAt: nowMs }
        : null),
      updatedAt: nowMs,
    });
  }

  if (shouldSeedFirstCompletionBridgeFacts) {
    if (bridgeSocialLinks.length > 0) {
      await insertMissingBridgeSocialLinkFacts(ctx, {
        userId: actor.dbUserId,
        links: bridgeSocialLinks,
        createdByUserId: actor.dbUserId,
        confirmMarker: "bridge:account_setup_completed",
        nowMs,
      });
    }
  }

  // A replaced photo's file is left in storage, never deleted here: the file
  // a profile points at isn't proven to be the member's own upload, and
  // deleting it could remove someone else's file (another photo, a banner, an
  // attachment) that a member pointed their profile at.

  const refreshedUser = (await ctx.db.get(actor.dbUserId)) as UserRow | null;
  const detail = await findProfileDetailByUserId(ctx, actor.dbUserId);

  if (!refreshedUser) throwProfileMutationError("user_not_found");

  return await mapProfileDetailWithSetup(ctx, refreshedUser, detail);
}

const PROFILE_AVATAR_CLAIM_WINDOW_MS = 60 * 60 * 1000;

// A member's own profile from a community site's private twin: the session
// already says who they are. Only what the twin's settings page edits, through
// Studio's own write.
export const updateProfileDetailForTrustedUserInternal = internalMutation({
  args: {
    userId: v.id("users"),
    displayName: v.optional(v.union(v.string(), v.null())),
    handle: v.optional(v.union(v.string(), v.null())),
    // Any text: a storage id is checked below, so a bad one is the profile's own refusal.
    avatarStorageId: v.optional(v.union(v.string(), v.null())),
    bio: v.optional(v.union(v.string(), v.null())),
    socialLinks: v.optional(
      v.object({
        youtube: v.optional(v.union(v.string(), v.null())),
        x: v.optional(v.union(v.string(), v.null())),
        instagram: v.optional(v.union(v.string(), v.null())),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const { userId, avatarStorageId: rawAvatar, ...fields } = args;
    const text = validateProfileDetailText(fields);
    if (!(await ctx.db.get(userId))) throwProfileMutationError("user_not_found");
    let avatar: { avatarStorageId?: any; avatarFocusX?: number; avatarFocusY?: number; avatarZoom?: number } = {};
    if (rawAvatar === null) avatar = { avatarStorageId: null };
    if (typeof rawAvatar === "string") {
      // Only a photo just uploaded (upload URLs last an hour), never another
      // member's existing file: replacing a photo deletes the old one.
      const storageId = ctx.db.system.normalizeId("_storage", rawAvatar);
      const file = storageId ? await ctx.db.system.get(storageId) : null;
      if (!file || !String(file.contentType ?? "").startsWith("image/") || file._creationTime < nowMs - PROFILE_AVATAR_CLAIM_WINDOW_MS) {
        throwProfileMutationError("profile_avatar_invalid");
      }
      // A new photo starts centered, as it does in Studio.
      avatar = { avatarStorageId: storageId, avatarFocusX: 0.5, avatarFocusY: 0.5, avatarZoom: 1 };
    }
    return await writeProfileDetailForUser(ctx, userId, { ...fields, ...avatar }, nowMs, text);
  },
});

export const backfillCompletedProfileBridgeSocialLinkFacts = mutation({
  args: {
    authSubject: v.optional(v.string()),
    dryRun: v.optional(v.boolean()),
    maxProfiles: v.optional(v.number()),
    maxInserts: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await requireOperatorRole(ctx, args.authSubject, "operator");
    const dryRun = args.dryRun !== false;
    const maxProfiles = normalizeBridgeSocialLinkBackfillLimit(
      args.maxProfiles,
      DEFAULT_BRIDGE_SOCIAL_LINK_BACKFILL_PROFILE_LIMIT,
      MAX_BRIDGE_SOCIAL_LINK_BACKFILL_PROFILE_LIMIT,
    );
    const maxInserts = normalizeBridgeSocialLinkBackfillLimit(
      args.maxInserts,
      DEFAULT_BRIDGE_SOCIAL_LINK_BACKFILL_INSERT_LIMIT,
      MAX_BRIDGE_SOCIAL_LINK_BACKFILL_INSERT_LIMIT,
    );
    const nowMs = Date.now();
    const page = await ctx.db
      .query("userProfileDetails")
      .order("asc")
      .paginate({
        cursor: args.cursor ?? null,
        numItems: maxProfiles,
        maximumRowsRead: maxProfiles,
      });
    const rows = page.page as ProfileDetailRow[];
    let scannedProfiles = 0;
    let completedProfiles = 0;
    let profilesWithLinks = 0;
    let profilesWithMissingLinks = 0;
    let requestedLinks = 0;
    let existingLinks = 0;
    let missingLinks = 0;
    let insertedLinks = 0;
    let truncated = !page.isDone;

    for (const detail of rows) {
      scannedProfiles += 1;
      if (typeof detail.onboardingCompletedAt !== "number") continue;
      completedProfiles += 1;

      const storedLinks = normalizeSocialProfileLinks((detail as any).socialLinks ?? {});
      const links = listBridgeSocialLinks(storedLinks);
      if (links.length === 0) continue;
      profilesWithLinks += 1;

      const remainingInsertBudget = maxInserts - insertedLinks;
      if (!dryRun && remainingInsertBudget <= 0) {
        truncated = true;
        break;
      }

      const preview = await insertMissingBridgeSocialLinkFacts(ctx, {
        userId: detail.userId,
        links,
        createdByUserId: detail.userId,
        confirmMarker: "bridge:social_link_backfill",
        nowMs,
        dryRun: true,
      });
      requestedLinks += preview.requested;
      existingLinks += preview.existing;
      missingLinks += preview.missing.length;
      if (preview.missing.length > 0) profilesWithMissingLinks += 1;
      if (dryRun || preview.missing.length === 0) continue;

      const linksToInsert = preview.missing.slice(0, remainingInsertBudget);
      if (linksToInsert.length < preview.missing.length) {
        truncated = true;
      }
      const result = await insertMissingBridgeSocialLinkFacts(ctx, {
        userId: detail.userId,
        links: linksToInsert,
        createdByUserId: detail.userId,
        confirmMarker: "bridge:social_link_backfill",
        nowMs,
      });
      insertedLinks += result.inserted;
      if (!dryRun && insertedLinks >= maxInserts) {
        truncated = true;
        break;
      }
    }

    return {
      dry_run: dryRun,
      max_profiles: maxProfiles,
      max_inserts: maxInserts,
      cursor: args.cursor ?? null,
      next_cursor: page.isDone ? null : page.continueCursor,
      scanned_profiles: scannedProfiles,
      completed_profiles: completedProfiles,
      profiles_with_links: profilesWithLinks,
      profiles_with_missing_links: profilesWithMissingLinks,
      requested_links: requestedLinks,
      existing_links: existingLinks,
      missing_links: missingLinks,
      inserted_links: dryRun ? 0 : insertedLinks,
      truncated,
    };
  },
});
