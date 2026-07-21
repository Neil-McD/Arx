import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { resolveAuthenticatedSubject } from "./authIdentity";

type UserRow = {
  _id: any;
  authSubject?: string;
  email?: string;
  normalizedEmail?: string;
  emailVerifiedAt?: number;
  emailVerificationSource?: "oauth_provider" | "magic_link" | "manual_change_code";
  displayName?: string;
  avatarUrl?: string;
  createdAt: number;
  updatedAt: number;
};

export type AuthenticatedActor = {
  authSubject: string;
  dbUserId: any;
  email: string | null;
  emailVerifiedAt: number | null;
  emailVerificationSource: "oauth_provider" | "magic_link" | "manual_change_code" | null;
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

function normalizeEmailValue(raw: unknown): string | undefined {
  return normalizeOptionalString(raw);
}

function normalizeStoredEmail(raw: unknown): string | null {
  const normalized = String(raw ?? "").trim().toLowerCase();
  return normalized || null;
}

function normalizeEmailVerificationSource(
  raw: unknown,
): "oauth_provider" | "magic_link" | "manual_change_code" | undefined {
  const normalized = String(raw ?? "").trim().toLowerCase();
  if (normalized === "oauth_provider") return "oauth_provider";
  if (normalized === "magic_link") return "magic_link";
  if (normalized === "manual_change_code") return "manual_change_code";
  return undefined;
}

async function getUserByResolvedSubject(ctx: any, authSubject: string): Promise<UserRow | null> {
  const normalizedSubject = normalizeIdValue(authSubject);
  if (!normalizedSubject) return null;
  return ((await ctx.db
    .query("users")
    .withIndex("by_authSubject", (q: any) => q.eq("authSubject", normalizedSubject))
    .first()) as UserRow | null) ?? null;
}

function buildUserPatch(args: {
  existing: UserRow;
  email?: string;
  normalizedEmail?: string;
  emailVerified: boolean;
  emailVerificationSource?: "oauth_provider" | "magic_link" | "manual_change_code";
  displayName?: string;
  avatarUrl?: string;
  nowMs: number;
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const emailProvided = args.email !== undefined;
  const emailChanged = emailProvided && args.email !== args.existing.email;
  const normalizedEmailChanged =
    emailProvided &&
    normalizeStoredEmail(args.normalizedEmail) !== normalizeStoredEmail(args.existing.normalizedEmail);

  if (emailChanged) patch.email = args.email;
  if (normalizedEmailChanged) patch.normalizedEmail = args.normalizedEmail;

  if (args.displayName !== undefined && args.displayName !== args.existing.displayName) {
    patch.displayName = args.displayName;
  }
  if (args.avatarUrl !== undefined && args.avatarUrl !== args.existing.avatarUrl) {
    patch.avatarUrl = args.avatarUrl;
  }

  if ((emailChanged || normalizedEmailChanged) && !args.emailVerified) {
    patch.emailVerifiedAt = undefined;
    patch.emailVerificationSource = undefined;
  }

  if (
    args.emailVerified &&
    (
      emailChanged ||
      normalizedEmailChanged ||
      typeof args.existing.emailVerifiedAt !== "number" ||
      args.existing.emailVerificationSource !== args.emailVerificationSource
    )
  ) {
    patch.emailVerifiedAt = args.nowMs;
    patch.emailVerificationSource = args.emailVerificationSource;
  }

  if (Object.keys(patch).length > 0) {
    patch.updatedAt = args.nowMs;
  }
  return patch;
}

function toActor(authSubject: string, user: UserRow): AuthenticatedActor {
  return {
    authSubject,
    dbUserId: user._id,
    email: user.email ?? null,
    emailVerifiedAt: typeof user.emailVerifiedAt === "number" ? user.emailVerifiedAt : null,
    emailVerificationSource: user.emailVerificationSource ?? null,
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
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

export async function resolveAuthenticatedActorByTrustedSubject(args: {
  ctx: any;
  authSubject: string;
  userId?: any;
}): Promise<AuthenticatedActor> {
  const authSubject = normalizeIdValue(args.authSubject);
  if (!authSubject) throw new Error("auth_subject_required");
  const actor = await findActorByResolvedSubject({
    ctx: args.ctx,
    authSubject,
    userId: args.userId,
  });
  if (!actor) throw new Error("user_not_found");
  return actor;
}

async function ensureActorByResolvedSubject(args: {
  ctx: any;
  authSubject: string;
  userId?: any;
  email?: string | null;
  emailVerified?: boolean | null;
  emailVerificationSource?: "oauth_provider" | "magic_link" | "manual_change_code" | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  nowMs?: number;
}): Promise<AuthenticatedActor> {
  const nowMs = args.nowMs ?? Date.now();
  const authSubject = normalizeIdValue(args.authSubject);
  if (!authSubject) throw new Error("auth_subject_required");
  const requestedUserId = normalizeIdValue(args.userId);
  const email = normalizeEmailValue(args.email);
  const normalizedEmail = normalizeStoredEmail(email) ?? undefined;
  const emailVerified = Boolean(args.emailVerified && normalizedEmail);
  const emailVerificationSource =
    normalizeEmailVerificationSource(args.emailVerificationSource) ??
    (emailVerified ? "oauth_provider" : undefined);
  const displayName = normalizeOptionalString(args.displayName);
  const avatarUrl = normalizeOptionalString(args.avatarUrl);
  const existing = await getUserByResolvedSubject(args.ctx, authSubject);

  let dbUserId = existing?._id ?? null;
  if (!existing) {
    if (requestedUserId) throw new Error("user_id_mismatch");
    dbUserId = await args.ctx.db.insert("users", {
      authSubject,
      email,
      normalizedEmail,
      ...(emailVerified ? { emailVerifiedAt: nowMs, emailVerificationSource } : null),
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
    const patch = buildUserPatch({
      existing,
      email,
      normalizedEmail,
      emailVerified,
      emailVerificationSource,
      displayName,
      avatarUrl,
      nowMs,
    });
    if (Object.keys(patch).length > 0) {
      await args.ctx.db.patch(existing._id, patch);
    }
    dbUserId = existing._id;
  }

  if (!dbUserId) throw new Error("user_not_found");
  const user = (await args.ctx.db.get(dbUserId)) as UserRow | null;
  if (!user) throw new Error("user_not_found");
  return toActor(authSubject, user);
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
  emailVerified?: boolean | null;
  emailVerificationSource?: "oauth_provider" | "magic_link" | "manual_change_code" | null;
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
    emailVerified: args.emailVerified ?? false,
    emailVerificationSource: args.emailVerificationSource ?? null,
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

export const resolveAuthenticatedActorByTrustedSubjectInternal = internalQuery({
  args: {
    authSubject: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    return await resolveAuthenticatedActorByTrustedSubject({
      ctx,
      authSubject: args.authSubject,
      userId: args.userId,
    });
  },
});

export const ensureAuthenticatedActorByExplicitSubjectInternal = internalMutation({
  args: {
    authSubject: v.string(),
    email: v.optional(v.string()),
    emailVerified: v.optional(v.boolean()),
    emailVerificationSource: v.optional(
      v.union(
        v.literal("oauth_provider"),
        v.literal("magic_link"),
        v.literal("manual_change_code"),
      ),
    ),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ensureActorByResolvedSubject({
      ctx,
      authSubject: args.authSubject,
      email: args.email ?? null,
      emailVerified: args.emailVerified ?? false,
      emailVerificationSource: args.emailVerificationSource ?? null,
      displayName: args.displayName ?? null,
      avatarUrl: args.avatarUrl ?? null,
      nowMs: args.nowMs,
    });
  },
});
