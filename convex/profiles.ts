import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ensureAuthenticatedActor, resolveUserIdForAuthenticatedRequest } from "./authActor";
import { validateProfileHandle } from "../shared/profileHandle";
import {
  loadAccountSetupStatusForUser,
  type AccountSetupProfileDetailRow as ProfileDetailRow,
  type AccountSetupUserRow as UserRow,
} from "./accountSetupCore";

function normalizeSubject(value: unknown): string {
  return String(value ?? "").trim();
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

function mapProfileBase(row: UserRow) {
  return {
    user_id: row.authSubject,
    display_name: row.displayName ?? null,
    handle: row.handle ?? null,
    normalized_handle: row.normalizedHandle ?? null,
    avatar_url: row.avatarUrl ?? null,
  };
}

async function hasEstablishedAccountEvidence(ctx: any, userId: any): Promise<boolean> {
  const checks = [
    ctx.db.query("threads").withIndex("by_owner", (q: any) => q.eq("ownerId", userId)).first(),
    ctx.db.query("communityMemberships").withIndex("by_user", (q: any) => q.eq("userId", userId)).first(),
    ctx.db.query("communities").withIndex("by_owner", (q: any) => q.eq("ownerId", userId)).first(),
    ctx.db.query("checkoutSessions").withIndex("by_owner", (q: any) => q.eq("ownerUserId", userId)).first(),
    ctx.db.query("userProviderConnections").withIndex("by_user", (q: any) => q.eq("userId", userId)).first(),
    ctx.db.query("personalMemoryItems").withIndex("by_user", (q: any) => q.eq("userId", userId)).first(),
    ctx.db.query("cloudProjects").withIndex("by_owner", (q: any) => q.eq("ownerId", userId)).first(),
  ];
  const rows = await Promise.all(checks);
  return rows.some(Boolean);
}

function mapProfileDetail(user: UserRow, detail: ProfileDetailRow | null) {
  return {
    ...mapProfileBase(user),
    display_name: detail?.displayName ?? null,
    avatar_url: detail?.avatarUrl ?? null,
    bio: detail?.bio ?? null,
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
    ...mapProfileDetail(user, detail),
    account_setup: await loadAccountSetupStatusForUser(ctx, user, detail),
  };
}

async function assertHandleAvailable(ctx: any, normalizedHandle: string, userId: any): Promise<void> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_normalizedHandle", (q: any) => q.eq("normalizedHandle", normalizedHandle))
    .first();
  if (existing && existing._id !== userId) {
    throw new Error("profile_handle_taken");
  }
}

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
    }> = [];
    for (const userId of normalizedUserIds) {
      const user = await findUserBySubject(ctx, userId);
      if (!user) continue;
      rows.push(mapProfileBase(user));
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
    const detail = (await ctx.db
      .query("userProfileDetails")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first()) as ProfileDetailRow | null;
    return mapProfileDetail(user, detail);
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
      throw new Error("profile_forbidden");
    }

    const user = (await ctx.db.get(actor.dbUserId)) as UserRow | null;
    if (!user) throw new Error("user_not_found");

    const existingDetail = (await ctx.db
      .query("userProfileDetails")
      .withIndex("by_user", (q: any) => q.eq("userId", actor.dbUserId))
      .first()) as ProfileDetailRow | null;

    if (existingDetail?.onboardingCompletedAt) {
      return await mapProfileDetailWithSetup(ctx, user, existingDetail);
    }

    if (await hasEstablishedAccountEvidence(ctx, actor.dbUserId)) {
      if (existingDetail) {
        await ctx.db.patch(existingDetail._id, {
          onboardingCompletedAt: nowMs,
          updatedAt: nowMs,
        });
      } else {
        await ctx.db.insert("userProfileDetails", {
          userId: actor.dbUserId,
          onboardingCompletedAt: nowMs,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
      }
    }

    const detail = (await ctx.db
      .query("userProfileDetails")
      .withIndex("by_user", (q: any) => q.eq("userId", actor.dbUserId))
      .first()) as ProfileDetailRow | null;
    return await mapProfileDetailWithSetup(ctx, user, detail);
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
    if (!user) throw new Error("user_not_found");
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
    avatarUrl: v.optional(v.union(v.string(), v.null())),
    bio: v.optional(v.union(v.string(), v.null())),
    onboardingDirection: v.optional(
      v.union(
        v.literal("build_community"),
        v.literal("discover_community"),
        v.literal("learn_about_polynet"),
        v.null(),
      ),
    ),
    completeOnboarding: v.optional(v.boolean()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const actor = await ensureAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
      nowMs,
      displayName: args.displayName,
      avatarUrl: args.avatarUrl,
    });
    const requestedSubject = normalizeSubject(args.userId ?? actor.authSubject);
    if (requestedSubject !== actor.authSubject) {
      throw new Error("profile_forbidden");
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
        if (!handle.ok) throw new Error(`profile_handle_${handle.reason}`);
        await assertHandleAvailable(ctx, handle.normalizedHandle, actor.dbUserId);
        userPatch.handle = handle.handle;
        userPatch.normalizedHandle = handle.normalizedHandle;
      }
    }
    if (args.avatarUrl !== undefined) {
      userPatch.avatarUrl = String(args.avatarUrl ?? "").trim() || undefined;
    }
    await ctx.db.patch(actor.dbUserId, userPatch);

    const existingDetail = (await ctx.db
      .query("userProfileDetails")
      .withIndex("by_user", (q: any) => q.eq("userId", actor.dbUserId))
      .first()) as ProfileDetailRow | null;
    const nextDisplayName =
      args.displayName !== undefined
        ? String(args.displayName ?? "").trim() || undefined
        : existingDetail?.displayName;
    const nextAvatarUrl =
      args.avatarUrl !== undefined
        ? String(args.avatarUrl ?? "").trim() || undefined
        : existingDetail?.avatarUrl;
    const nextBio = args.bio !== undefined ? String(args.bio ?? "").trim() || undefined : existingDetail?.bio;
    const nextOnboardingDirection =
      args.onboardingDirection === undefined
        ? existingDetail?.onboardingDirection
        : args.onboardingDirection ?? undefined;

    if (!existingDetail) {
      await ctx.db.insert("userProfileDetails", {
        userId: actor.dbUserId,
        displayName: nextDisplayName,
        avatarUrl: nextAvatarUrl,
        bio: nextBio,
        onboardingDirection: nextOnboardingDirection,
        ...(args.completeOnboarding ? { onboardingCompletedAt: nowMs } : null),
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    } else {
      await ctx.db.patch(existingDetail._id, {
        displayName: nextDisplayName,
        avatarUrl: nextAvatarUrl,
        bio: nextBio,
        onboardingDirection: nextOnboardingDirection,
        ...(args.completeOnboarding && !existingDetail.onboardingCompletedAt
          ? { onboardingCompletedAt: nowMs }
          : null),
        updatedAt: nowMs,
      });
    }

    const refreshedUser = (await ctx.db.get(actor.dbUserId)) as UserRow | null;
    const detail = (await ctx.db
      .query("userProfileDetails")
      .withIndex("by_user", (q: any) => q.eq("userId", actor.dbUserId))
      .first()) as ProfileDetailRow | null;

    if (!refreshedUser) throw new Error("user_not_found");

    return await mapProfileDetailWithSetup(ctx, refreshedUser, detail);
  },
});
