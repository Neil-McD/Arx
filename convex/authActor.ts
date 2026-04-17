import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { resolveAuthenticatedSubject } from "./authIdentity";
import { isAnonymousAuthSubject, normalizeAuthRelinkEmail } from "../shared/authRelinkPolicy";

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
  return normalizeAuthRelinkEmail(raw);
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

async function listUsersByNormalizedEmail(ctx: any, normalizedEmail: string): Promise<UserRow[]> {
  const normalized = normalizeStoredEmail(normalizedEmail);
  if (!normalized) return [];
  const indexed = (await ctx.db
    .query("users")
    .withIndex("by_normalizedEmail", (q: any) => q.eq("normalizedEmail", normalized))
    .collect()) as UserRow[];
  if (indexed.length > 0) return indexed;
  const scanned = (await ctx.db.query("users").collect()) as UserRow[];
  return scanned.filter((user) => normalizeStoredEmail(user.email) === normalized);
}

async function findUniqueRelinkCandidateByNormalizedEmail(
  ctx: any,
  normalizedEmail: string,
): Promise<UserRow | null> {
  const users = await listUsersByNormalizedEmail(ctx, normalizedEmail);
  const candidates = users.filter((user) => {
    const authSubject = normalizeIdValue(user.authSubject);
    if (!authSubject || isAnonymousAuthSubject(authSubject)) return false;
    return normalizeStoredEmail(user.normalizedEmail ?? user.email) === normalizedEmail;
  });
  if (candidates.length !== 1) return null;
  return candidates[0] ?? null;
}

async function revokeAuthSessionsForUser(ctx: any, userId: any, nowMs: number): Promise<void> {
  const rows = await ctx.db
    .query("authSessions")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  for (const row of rows) {
    if (typeof row.revokedAt === "number") continue;
    await ctx.db.patch(row._id, {
      revokedAt: nowMs,
      updatedAt: nowMs,
    });
  }
}

function buildUserPatch(args: {
  existing: UserRow;
  authSubject?: string;
  email?: string;
  normalizedEmail?: string;
  emailVerified: boolean;
  emailVerificationSource?: "oauth_provider" | "magic_link" | "manual_change_code";
  displayName?: string;
  avatarUrl?: string;
  nowMs: number;
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const nextAuthSubject = normalizeIdValue(args.authSubject);
  if (nextAuthSubject && nextAuthSubject !== normalizeIdValue(args.existing.authSubject)) {
    patch.authSubject = nextAuthSubject;
  }

  const emailChanged = args.email !== args.existing.email;
  const normalizedEmailChanged =
    normalizeStoredEmail(args.normalizedEmail) !== normalizeStoredEmail(args.existing.normalizedEmail ?? args.existing.email);

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
  emailVerified?: boolean | null;
  emailVerificationSource?: "oauth_provider" | "magic_link" | "manual_change_code" | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  nowMs?: number;
}): Promise<AuthenticatedActor> {
  const nowMs = args.nowMs ?? Date.now();
  const requestedUserId = normalizeIdValue(args.userId);
  const email = normalizeEmailValue(args.email);
  const normalizedEmail = normalizeStoredEmail(email) ?? undefined;
  const emailVerified = Boolean(args.emailVerified && email);
  const emailVerificationSource =
    normalizeEmailVerificationSource(args.emailVerificationSource) ??
    (emailVerified ? "oauth_provider" : undefined);
  const displayName = normalizeOptionalString(args.displayName);
  const avatarUrl = normalizeOptionalString(args.avatarUrl);

  let existing = await getUserByResolvedSubject(args.ctx, args.authSubject);
  if (!existing && emailVerified && normalizedEmail) {
    const relinkCandidate = await findUniqueRelinkCandidateByNormalizedEmail(
      args.ctx,
      normalizedEmail,
    );
    if (relinkCandidate) {
      const resolvedUserId = normalizeIdValue(relinkCandidate._id);
      if (requestedUserId && requestedUserId !== resolvedUserId) {
        throw new Error("user_id_mismatch");
      }
      const authSubjectChanged =
        normalizeIdValue(relinkCandidate.authSubject) !== normalizeIdValue(args.authSubject);
      const patch = buildUserPatch({
        existing: relinkCandidate,
        authSubject: args.authSubject,
        email,
        normalizedEmail,
        emailVerified,
        emailVerificationSource,
        displayName,
        avatarUrl,
        nowMs,
      });
      if (Object.keys(patch).length > 0) {
        await args.ctx.db.patch(relinkCandidate._id, patch);
      }
      if (authSubjectChanged) {
        await revokeAuthSessionsForUser(args.ctx, relinkCandidate._id, nowMs);
      }
      existing = ((await args.ctx.db.get(relinkCandidate._id)) as UserRow | null) ?? relinkCandidate;
    }
  }

  let dbUserId = existing?._id ?? null;
  if (!existing) {
    dbUserId = await args.ctx.db.insert("users", {
      authSubject: args.authSubject,
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
