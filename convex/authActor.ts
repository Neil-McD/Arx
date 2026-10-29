import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { resolveAuthenticatedSubject } from "./authIdentity";
import { isTestMemberAuthSubject } from "./communityTestMemberCore";
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

export type AuthContinuityResolutionPath =
  | "subject_match"
  | "email_relink"
  | "ambiguous_email"
  | "missing_verified_email"
  | "new_user";

export type AuthContinuityResolutionBlocker =
  | "missing_email"
  | "email_not_verified"
  | "ambiguous_email_candidates"
  | "no_matching_email_candidate"
  | "email_relink_disabled"
  | "requested_user_id_mismatch";

export type AuthContinuityUserSummary = {
  userId: string;
  authSubject: string | null;
  email: string | null;
  normalizedEmail: string | null;
  emailVerifiedAt: number | null;
  emailVerificationSource: "oauth_provider" | "magic_link" | "manual_change_code" | null;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: number;
  updatedAt: number;
  isAnonymousAuthSubject: boolean;
};

export type AuthContinuityResolutionPreview = {
  authSubject: string;
  requestedUserId: string | null;
  email: string | null;
  normalizedEmail: string | null;
  emailVerified: boolean;
  emailVerificationSource: "oauth_provider" | "magic_link" | "manual_change_code" | null;
  displayName: string | null;
  avatarUrl: string | null;
  subjectMatchUser: AuthContinuityUserSummary | null;
  emailUsers: AuthContinuityUserSummary[];
  eligibleRelinkCandidates: AuthContinuityUserSummary[];
  relinkCandidateUser: AuthContinuityUserSummary | null;
  resolutionPath: AuthContinuityResolutionPath;
  blockers: AuthContinuityResolutionBlocker[];
  resolvedUserId: string | null;
  wouldCreateNewUser: boolean;
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

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function readBoolEnv(name: string): boolean {
  const normalized = readEnv(name).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isExplicitLocalDevEnvironment(): boolean {
  const nodeEnv = readEnv("NODE_ENV").toLowerCase();
  return nodeEnv === "development" || nodeEnv === "test";
}

function allowAutomaticEmailRelink(): boolean {
  return readBoolEnv("ARX_AUTH_ENABLE_EMAIL_RELINK") && isExplicitLocalDevEnvironment();
}

function toAuthContinuityUserSummary(user: UserRow): AuthContinuityUserSummary {
  const authSubject = normalizeIdValue(user.authSubject) || null;
  return {
    userId: normalizeIdValue(user._id),
    authSubject,
    email: user.email ?? null,
    normalizedEmail: normalizeStoredEmail(user.normalizedEmail ?? user.email),
    emailVerifiedAt: typeof user.emailVerifiedAt === "number" ? user.emailVerifiedAt : null,
    emailVerificationSource: user.emailVerificationSource ?? null,
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    isAnonymousAuthSubject: authSubject ? isAnonymousAuthSubject(authSubject) : false,
  };
}

type ActorResolutionState = {
  requestedUserId: string | null;
  email: string | null;
  normalizedEmail: string | null;
  emailVerified: boolean;
  emailVerificationSource: "oauth_provider" | "magic_link" | "manual_change_code" | null;
  displayName: string | null;
  avatarUrl: string | null;
  subjectMatchUser: UserRow | null;
  emailUsers: UserRow[];
  eligibleRelinkCandidates: UserRow[];
  relinkCandidateUser: UserRow | null;
  resolutionPath: AuthContinuityResolutionPath;
  blockers: AuthContinuityResolutionBlocker[];
  resolvedUserId: string | null;
  wouldCreateNewUser: boolean;
};

async function readActorResolutionState(args: {
  ctx: any;
  authSubject: string;
  userId?: any;
  email?: string | null;
  emailVerified?: boolean | null;
  emailVerificationSource?: "oauth_provider" | "magic_link" | "manual_change_code" | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<ActorResolutionState> {
  const requestedUserId = normalizeIdValue(args.userId) || null;
  const email = normalizeEmailValue(args.email) ?? null;
  const normalizedEmail = normalizeStoredEmail(email);
  const emailVerified = Boolean(args.emailVerified && normalizedEmail);
  const emailVerificationSource =
    normalizeEmailVerificationSource(args.emailVerificationSource) ??
    (emailVerified ? "oauth_provider" : undefined);
  const displayName = normalizeOptionalString(args.displayName) ?? null;
  const avatarUrl = normalizeOptionalString(args.avatarUrl) ?? null;

  const subjectMatchUser = await getUserByResolvedSubject(args.ctx, args.authSubject);
  const emailUsers = normalizedEmail ? await listUsersByNormalizedEmail(args.ctx, normalizedEmail) : [];
  const automaticEmailRelinkEnabled = allowAutomaticEmailRelink();
  const eligibleRelinkCandidates = normalizedEmail
    ? emailUsers.filter((user) => {
        const userAuthSubject = normalizeIdValue(user.authSubject);
        if (!userAuthSubject || isAnonymousAuthSubject(userAuthSubject)) return false;
        return normalizeStoredEmail(user.normalizedEmail ?? user.email) === normalizedEmail;
      })
    : [];
  const relinkCandidateUser =
    !subjectMatchUser && automaticEmailRelinkEnabled && emailVerified && eligibleRelinkCandidates.length === 1
      ? (eligibleRelinkCandidates[0] ?? null)
      : null;

  const blockers: AuthContinuityResolutionBlocker[] = [];
  if (requestedUserId) {
    const resolvedUserId = normalizeIdValue(subjectMatchUser?._id ?? relinkCandidateUser?._id);
    if (resolvedUserId && resolvedUserId !== requestedUserId) {
      blockers.push("requested_user_id_mismatch");
    }
  }
  if (!email || !normalizedEmail) {
    blockers.push("missing_email");
  }
  if (!emailVerified) {
    blockers.push("email_not_verified");
  }
  if (!subjectMatchUser && eligibleRelinkCandidates.length > 1) {
    blockers.push("ambiguous_email_candidates");
  }
  if (
    !subjectMatchUser &&
    !automaticEmailRelinkEnabled &&
    emailVerified &&
    normalizedEmail &&
    eligibleRelinkCandidates.length === 1
  ) {
    blockers.push("email_relink_disabled");
  }
  if (!subjectMatchUser && emailVerified && normalizedEmail && eligibleRelinkCandidates.length === 0) {
    blockers.push("no_matching_email_candidate");
  }

  let resolutionPath: AuthContinuityResolutionPath = "new_user";
  if (subjectMatchUser) {
    resolutionPath = "subject_match";
  } else if (relinkCandidateUser) {
    resolutionPath = "email_relink";
  } else if (!emailVerified || !normalizedEmail) {
    resolutionPath = "missing_verified_email";
  } else if (eligibleRelinkCandidates.length > 1) {
    resolutionPath = "ambiguous_email";
  }

  const resolvedUserId = normalizeIdValue(subjectMatchUser?._id ?? relinkCandidateUser?._id) || null;

  return {
    requestedUserId,
    email,
    normalizedEmail,
    emailVerified,
    emailVerificationSource: emailVerificationSource ?? null,
    displayName,
    avatarUrl,
    subjectMatchUser,
    emailUsers,
    eligibleRelinkCandidates,
    relinkCandidateUser,
    resolutionPath,
    blockers,
    resolvedUserId,
    wouldCreateNewUser: !subjectMatchUser && !relinkCandidateUser,
  };
}

function toAuthContinuityResolutionPreview(
  authSubject: string,
  state: ActorResolutionState,
): AuthContinuityResolutionPreview {
  return {
    authSubject,
    requestedUserId: state.requestedUserId,
    email: state.email,
    normalizedEmail: state.normalizedEmail,
    emailVerified: state.emailVerified,
    emailVerificationSource: state.emailVerificationSource,
    displayName: state.displayName,
    avatarUrl: state.avatarUrl,
    subjectMatchUser: state.subjectMatchUser ? toAuthContinuityUserSummary(state.subjectMatchUser) : null,
    emailUsers: state.emailUsers.map(toAuthContinuityUserSummary),
    eligibleRelinkCandidates: state.eligibleRelinkCandidates.map(toAuthContinuityUserSummary),
    relinkCandidateUser: state.relinkCandidateUser ? toAuthContinuityUserSummary(state.relinkCandidateUser) : null,
    resolutionPath: state.resolutionPath,
    blockers: state.blockers,
    resolvedUserId: state.resolvedUserId,
    wouldCreateNewUser: state.wouldCreateNewUser,
  };
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

  const hasEmailUpdate = args.email !== undefined && args.normalizedEmail !== undefined;
  const emailChanged = hasEmailUpdate && args.email !== args.existing.email;
  const normalizedEmailChanged =
    hasEmailUpdate &&
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

export async function resolveAuthenticatedActorByTrustedSubject(args: {
  ctx: any;
  authSubject: string;
  userId?: any;
}): Promise<AuthenticatedActor> {
  const authSubject = normalizeIdValue(args.authSubject);
  if (!authSubject) throw new Error("auth_subject_required");
  // Trusted subjects come from actions and workers; test members run neither.
  if (isTestMemberAuthSubject(authSubject)) throw new Error("test_member_unavailable_here");
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
  const state = await readActorResolutionState({
    ctx: args.ctx,
    authSubject: args.authSubject,
    userId: args.userId,
    email: args.email ?? null,
    emailVerified: args.emailVerified ?? false,
    emailVerificationSource: args.emailVerificationSource ?? null,
    displayName: args.displayName ?? null,
    avatarUrl: args.avatarUrl ?? null,
  });
  const requestedUserId = state.requestedUserId;
  const email = state.email ?? undefined;
  const normalizedEmail = state.normalizedEmail ?? undefined;
  const emailVerified = state.emailVerified;
  const emailVerificationSource = state.emailVerificationSource ?? undefined;
  const displayName = state.displayName ?? undefined;
  const avatarUrl = state.avatarUrl ?? undefined;

  let existing = state.subjectMatchUser;
  if (!existing && state.relinkCandidateUser) {
    const relinkCandidate = state.relinkCandidateUser;
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
    existing = ((await args.ctx.db.get(relinkCandidate._id)) as UserRow | null) ?? relinkCandidate;
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

export async function previewAuthenticatedActorResolutionBySubject(args: {
  ctx: any;
  authSubject: string;
  userId?: any;
  email?: string | null;
  emailVerified?: boolean | null;
  emailVerificationSource?: "oauth_provider" | "magic_link" | "manual_change_code" | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<AuthContinuityResolutionPreview> {
  const authSubject = normalizeIdValue(args.authSubject);
  if (!authSubject) throw new Error("auth_subject_required");
  const state = await readActorResolutionState({
    ctx: args.ctx,
    authSubject,
    userId: args.userId,
    email: args.email ?? null,
    emailVerified: args.emailVerified ?? false,
    emailVerificationSource: args.emailVerificationSource ?? null,
    displayName: args.displayName ?? null,
    avatarUrl: args.avatarUrl ?? null,
  });
  return toAuthContinuityResolutionPreview(authSubject, state);
}

export async function ensureAuthenticatedActorDetailed(args: {
  ctx: any;
  authSubject?: string | null;
  userId?: any;
  email?: string | null;
  emailVerified?: boolean | null;
  emailVerificationSource?: "oauth_provider" | "magic_link" | "manual_change_code" | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  nowMs?: number;
}): Promise<{
  actor: AuthenticatedActor;
  continuity: AuthContinuityResolutionPreview;
}> {
  const authSubject = await resolveAuthenticatedSubject({
    ctx: args.ctx,
    authSubject: args.authSubject ?? null,
  });
  const continuity = await previewAuthenticatedActorResolutionBySubject({
    ctx: args.ctx,
    authSubject,
    userId: args.userId,
    email: args.email ?? null,
    emailVerified: args.emailVerified ?? false,
    emailVerificationSource: args.emailVerificationSource ?? null,
    displayName: args.displayName ?? null,
    avatarUrl: args.avatarUrl ?? null,
  });
  const actor = await ensureActorByResolvedSubject({
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
  return { actor, continuity };
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
  return (
    await ensureAuthenticatedActorDetailed({
      ctx: args.ctx,
      authSubject: args.authSubject ?? null,
      userId: args.userId,
      email: args.email ?? null,
      emailVerified: args.emailVerified ?? false,
      emailVerificationSource: args.emailVerificationSource ?? null,
      displayName: args.displayName ?? null,
      avatarUrl: args.avatarUrl ?? null,
      nowMs: args.nowMs,
    })
  ).actor;
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
    // Actions resolve their user here; they reach payments, providers and
    // agents, so a test member never runs one.
    if (isTestMemberAuthSubject(args.authSubject)) throw new Error("test_member_unavailable_here");
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
