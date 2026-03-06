import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

type UserRow = {
  _id: any;
  authSubject: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  createdAt: number;
  updatedAt: number;
};

type ProfileDetailRow = {
  _id: any;
  userId: any;
  bio?: string;
  createdAt: number;
  updatedAt: number;
};

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

async function findOrCreateUserBySubject(args: {
  ctx: any;
  authSubject: string;
  nowMs: number;
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<UserRow> {
  const subject = normalizeSubject(args.authSubject);
  if (!subject) throw new Error("auth_subject_required");
  const existing = await findUserBySubject(args.ctx, subject);
  if (existing) return existing;
  const id = await args.ctx.db.insert("users", {
    authSubject: subject,
    displayName: String(args.displayName ?? "").trim() || undefined,
    avatarUrl: String(args.avatarUrl ?? "").trim() || undefined,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const created = (await args.ctx.db.get(id)) as UserRow | null;
  if (!created) throw new Error("user_create_failed");
  return created;
}

function mapProfileBase(row: UserRow) {
  return {
    user_id: row.authSubject,
    display_name: row.displayName ?? null,
    avatar_url: row.avatarUrl ?? null,
  };
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
    return {
      ...mapProfileBase(user),
      bio: detail?.bio ?? null,
    };
  },
});

export const upsertProfileDetail = mutation({
  args: {
    userId: v.string(),
    displayName: v.optional(v.union(v.string(), v.null())),
    avatarUrl: v.optional(v.union(v.string(), v.null())),
    bio: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const user = await findOrCreateUserBySubject({
      ctx,
      authSubject: args.userId,
      nowMs,
      displayName: args.displayName,
      avatarUrl: args.avatarUrl,
    });

    const userPatch: Record<string, unknown> = { updatedAt: nowMs };
    if (args.displayName !== undefined) {
      userPatch.displayName = String(args.displayName ?? "").trim() || undefined;
    }
    if (args.avatarUrl !== undefined) {
      userPatch.avatarUrl = String(args.avatarUrl ?? "").trim() || undefined;
    }
    await ctx.db.patch(user._id, userPatch);

    const existingDetail = (await ctx.db
      .query("userProfileDetails")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first()) as ProfileDetailRow | null;
    const nextBio = args.bio !== undefined ? String(args.bio ?? "").trim() || undefined : existingDetail?.bio;

    if (!existingDetail) {
      await ctx.db.insert("userProfileDetails", {
        userId: user._id,
        bio: nextBio,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    } else {
      await ctx.db.patch(existingDetail._id, {
        bio: nextBio,
        updatedAt: nowMs,
      });
    }

    const refreshedUser = (await ctx.db.get(user._id)) as UserRow | null;
    const detail = (await ctx.db
      .query("userProfileDetails")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first()) as ProfileDetailRow | null;

    if (!refreshedUser) throw new Error("user_not_found");

    return {
      ...mapProfileBase(refreshedUser),
      bio: detail?.bio ?? null,
    };
  },
});
