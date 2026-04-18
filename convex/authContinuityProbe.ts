import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  previewAuthenticatedActorResolutionBySubject,
  type AuthContinuityResolutionPreview,
} from "./authActor";
import { buildAuthContinuityAccountSnapshot } from "./authContinuityShared";
import { normalizeAuthRelinkEmail } from "../shared/authRelinkPolicy";

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

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function assertProbeSecret(secret: string): void {
  const configured = readEnv("ARX_AUTH_MIGRATION_AUDIT_SECRET");
  if (!configured || secret !== configured) {
    throw new Error("auth_continuity_probe_unauthorized");
  }
}

function normalizeId(raw: unknown): string {
  return String(raw ?? "").trim();
}

function normalizeOptionalString(raw: unknown): string | null {
  const normalized = String(raw ?? "").trim();
  return normalized || null;
}

function toUserSummary(user: UserRow) {
  return {
    userId: normalizeId(user._id),
    authSubject: normalizeOptionalString(user.authSubject),
    email: normalizeOptionalString(user.email),
    normalizedEmail: normalizeAuthRelinkEmail(user.normalizedEmail ?? user.email),
    emailVerifiedAt: typeof user.emailVerifiedAt === "number" ? user.emailVerifiedAt : null,
    emailVerificationSource: user.emailVerificationSource ?? null,
    displayName: normalizeOptionalString(user.displayName),
    avatarUrl: normalizeOptionalString(user.avatarUrl),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function getUserByAuthSubject(ctx: any, authSubject: string | null): Promise<UserRow | null> {
  const normalized = normalizeOptionalString(authSubject);
  if (!normalized) return null;
  return ((await ctx.db
    .query("users")
    .withIndex("by_authSubject", (q: any) => q.eq("authSubject", normalized))
    .first()) as UserRow | null) ?? null;
}

async function listUsersByNormalizedEmail(ctx: any, email: string | null): Promise<UserRow[]> {
  const normalized = normalizeAuthRelinkEmail(email);
  if (!normalized) return [];
  const indexed = (await ctx.db
    .query("users")
    .withIndex("by_normalizedEmail", (q: any) => q.eq("normalizedEmail", normalized))
    .collect()) as UserRow[];
  if (indexed.length > 0) return indexed;
  const scanned = (await ctx.db.query("users").collect()) as UserRow[];
  return scanned.filter((user) => normalizeAuthRelinkEmail(user.normalizedEmail ?? user.email) === normalized);
}

async function resolvePreviewSnapshotUser(
  ctx: any,
  preview: AuthContinuityResolutionPreview | null,
): Promise<UserRow | null> {
  if (!preview) return null;
  const subjectMatch = await getUserByAuthSubject(ctx, preview.subjectMatchUser?.authSubject ?? null);
  if (subjectMatch) return subjectMatch;
  return await getUserByAuthSubject(ctx, preview.relinkCandidateUser?.authSubject ?? null);
}

export const inspectAuthContinuity = query({
  args: {
    secret: v.string(),
    authSubject: v.optional(v.string()),
    email: v.optional(v.string()),
    communitySlug: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertProbeSecret(args.secret);
    const nowMs = args.nowMs ?? Date.now();
    const authSubject = normalizeOptionalString(args.authSubject);
    const email = normalizeOptionalString(args.email);
    const normalizedEmail = normalizeAuthRelinkEmail(email);
    const matchedUsers = await listUsersByNormalizedEmail(ctx, email);
    const preview = authSubject
      ? await previewAuthenticatedActorResolutionBySubject({
          ctx,
          authSubject,
          email,
          emailVerified: Boolean(normalizedEmail),
          emailVerificationSource: normalizedEmail ? "oauth_provider" : null,
        })
      : null;

    const resolvedUser =
      (await resolvePreviewSnapshotUser(ctx, preview)) ??
      (matchedUsers.length === 1 ? matchedUsers[0] ?? null : null);
    const resolvedSnapshot = resolvedUser
      ? await buildAuthContinuityAccountSnapshot(ctx, resolvedUser._id, nowMs)
      : null;

    const targetCommunity = args.communitySlug
      ? await ctx.db
          .query("communities")
          .withIndex("by_slug", (q: any) => q.eq("slug", args.communitySlug!))
          .first()
      : null;
    const targetMembership =
      targetCommunity && resolvedUser
        ? await ctx.db
            .query("communityMemberships")
            .withIndex("by_community_user", (q: any) =>
              q.eq("communityId", targetCommunity._id).eq("userId", resolvedUser._id),
            )
            .first()
        : null;

    return {
      generatedAt: nowMs,
      input: {
        authSubject,
        email,
        normalizedEmail,
        communitySlug: normalizeOptionalString(args.communitySlug),
      },
      preview,
      matchedUsers: matchedUsers.map(toUserSummary),
      resolvedSnapshot,
      targetCommunity:
        targetCommunity && resolvedUser
          ? {
              communityId: normalizeId(targetCommunity._id),
              slug: targetCommunity.slug,
              name: targetCommunity.name,
              owner: normalizeId(targetCommunity.ownerId) === normalizeId(resolvedUser._id),
              membership: targetMembership
                ? {
                    membershipId: normalizeId(targetMembership._id),
                    role: targetMembership.role,
                    active: targetMembership.active !== false && typeof targetMembership.revokedAt !== "number",
                    revokedAt: typeof targetMembership.revokedAt === "number" ? targetMembership.revokedAt : null,
                  }
                : null,
            }
          : null,
    };
  },
});
