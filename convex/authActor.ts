import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { resolveAuthenticatedSubject } from "./authIdentity";

type UserRow = {
  _id: any;
  authSubject?: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  createdAt: number;
  updatedAt: number;
};

export type AuthenticatedActor = {
  authSubject: string;
  dbUserId: any;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: number;
  updatedAt: number;
};

function normalizeIdValue(raw: unknown): string {
  return String(raw ?? "").trim();
}

function normalizeOptionalString(raw: unknown): string | undefined {
  const normalized = String(raw ?? "").trim();
  return normalized || undefined;
}

async function getUserByResolvedSubject(ctx: any, authSubject: string): Promise<UserRow | null> {
  const normalizedSubject = normalizeIdValue(authSubject);
  if (!normalizedSubject) return null;
  return ((await ctx.db
    .query("users")
    .withIndex("by_authSubject", (q: any) => q.eq("authSubject", normalizedSubject))
    .first()) as UserRow | null) ?? null;
}

function toActor(authSubject: string, user: UserRow): AuthenticatedActor {
  return {
    authSubject,
    dbUserId: user._id,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function ensureDefaultFreeEntitlement(ctx: any, userId: any, nowMs: number): Promise<void> {
  const rows = await ctx.db
    .query("userEntitlements")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .take(1);
  if (rows.length > 0) return;
  await ctx.db.insert("userEntitlements", {
    userId,
    tier: "free",
    source: "default",
    startsAt: nowMs,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
}

async function findActorByResolvedSubject(args: {
  ctx: any;
  authSubject: string;
  userId?: any;
}): Promise<AuthenticatedActor | null> {
  const user = await getUserByResolvedSubject(args.ctx, args.authSubject);
  if (!user) return null;
  const requestedUserId = normalizeIdValue(args.userId);
  const resolvedUserId = normalizeIdValue(user._id);
  if (requestedUserId && requestedUserId !== resolvedUserId) {
    throw new Error("user_id_mismatch");
  }
  return toActor(args.authSubject, user);
}

async function ensureActorByResolvedSubject(args: {
  ctx: any;
  authSubject: string;
  userId?: any;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  nowMs?: number;
}): Promise<AuthenticatedActor> {
  const nowMs = args.nowMs ?? Date.now();
  const requestedUserId = normalizeIdValue(args.userId);
  const email = normalizeOptionalString(args.email);
  const displayName = normalizeOptionalString(args.displayName);
  const avatarUrl = normalizeOptionalString(args.avatarUrl);

  const existing = await getUserByResolvedSubject(args.ctx, args.authSubject);

  let dbUserId = existing?._id ?? null;
  if (!existing) {
    dbUserId = await args.ctx.db.insert("users", {
      authSubject: args.authSubject,
      email,
      displayName,
      avatarUrl,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  } else {
    const resolvedUserId = normalizeIdValue(existing._id);
    if (requestedUserId && requestedUserId !== resolvedUserId) {
      throw new Error("user_id_mismatch");
    }
    const patch: {
      email?: string;
      displayName?: string;
      avatarUrl?: string;
      updatedAt?: number;
    } = {};
    if (email && email !== existing.email) patch.email = email;
    if (displayName && displayName !== existing.displayName) patch.displayName = displayName;
    if (avatarUrl && avatarUrl !== existing.avatarUrl) patch.avatarUrl = avatarUrl;
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = nowMs;
      await args.ctx.db.patch(existing._id, patch);
    }
    dbUserId = existing._id;
  }

  if (!dbUserId) throw new Error("user_not_found");
  await ensureDefaultFreeEntitlement(args.ctx, dbUserId, nowMs);
  const user = (await args.ctx.db.get(dbUserId)) as UserRow | null;
  if (!user) throw new Error("user_not_found");
  return toActor(args.authSubject, user);
}

export async function findAuthenticatedActorState(args: {
  ctx: any;
  authSubject?: string | null;
  userId?: any;
}): Promise<{ authSubject: string; actor: AuthenticatedActor | null }> {
  const authSubject = await resolveAuthenticatedSubject({
    ctx: args.ctx,
    authSubject: args.authSubject ?? null,
  });
  const actor = await findActorByResolvedSubject({
    ctx: args.ctx,
    authSubject,
    userId: args.userId,
  });
  return { authSubject, actor };
}

export async function resolveAuthenticatedActor(args: {
  ctx: any;
  authSubject?: string | null;
  userId?: any;
}): Promise<AuthenticatedActor> {
  const { actor } = await findAuthenticatedActorState(args);
  if (!actor) throw new Error("user_not_found");
  return actor;
}

export async function ensureAuthenticatedActor(args: {
  ctx: any;
  authSubject?: string | null;
  userId?: any;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  nowMs?: number;
}): Promise<AuthenticatedActor> {
  const authSubject = await resolveAuthenticatedSubject({
    ctx: args.ctx,
    authSubject: args.authSubject ?? null,
  });
  return await ensureActorByResolvedSubject({
    ctx: args.ctx,
    authSubject,
    userId: args.userId,
    email: args.email ?? null,
    displayName: args.displayName ?? null,
    avatarUrl: args.avatarUrl ?? null,
    nowMs: args.nowMs,
  });
}

export async function resolveUserIdForAuthenticatedRequest(args: {
  ctx: any;
  userId?: any;
  authSubject?: string | null;
}): Promise<any> {
  return (await resolveAuthenticatedActor(args)).dbUserId;
}

export const resolveAuthenticatedActorInternal = internalQuery({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await resolveAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
    });
  },
});

export const ensureAuthenticatedActorByExplicitSubjectInternal = internalMutation({
  args: {
    authSubject: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ensureActorByResolvedSubject({
      ctx,
      authSubject: args.authSubject,
      email: args.email ?? null,
      displayName: args.displayName ?? null,
      avatarUrl: args.avatarUrl ?? null,
      nowMs: args.nowMs,
    });
  },
});
