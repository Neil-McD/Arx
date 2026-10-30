import { isTestMemberAuthSubject, resolveTestMemberStandIn } from "./communityTestMemberCore";

function normalizeSubject(raw: unknown): string {
  return String(raw ?? "").trim();
}

function readString(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function readIdentityString(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = readString(record[key]);
    if (value) return value;
  }
  return "";
}

function readIdentityBool(record: Record<string, unknown>, ...keys: string[]): boolean {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (typeof value !== "string") continue;
    const normalized = value.trim().toLowerCase();
    if (!normalized) continue;
    if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
      return false;
    }
  }
  return false;
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

function allowUnverifiedAuthSubjectFallback(): boolean {
  return readBoolEnv("ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT") && isExplicitLocalDevEnvironment();
}

async function readVerifiedIdentitySubject(ctx: any): Promise<string | null> {
  const identity = await readAuthenticatedIdentityProfile(ctx);
  return identity?.authSubject ?? null;
}

export type AuthenticatedIdentityProfile = {
  authSubject: string;
  email: string | null;
  emailVerified: boolean;
  emailVerificationSource: "oauth_provider" | null;
  displayName: string | null;
  avatarUrl: string | null;
};

export async function readAuthenticatedIdentityProfile(
  ctx: any,
): Promise<AuthenticatedIdentityProfile | null> {
  try {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const record = asRecord(identity);
    if (!record) return null;
    const authSubject = normalizeSubject(record.subject);
    if (!authSubject) return null;

    const email = readIdentityString(record, "email") || null;
    const emailVerified = email
      ? readIdentityBool(record, "email_verified", "emailVerified", "verified_email", "verifiedEmail")
      : false;
    const directDisplayName = readIdentityString(
      record,
      "name",
      "displayName",
      "display_name",
      "full_name",
      "fullName",
    );
    const givenName = readIdentityString(record, "given_name", "givenName", "first_name", "firstName");
    const familyName = readIdentityString(record, "family_name", "familyName", "last_name", "lastName");
    const displayName = directDisplayName || [givenName, familyName].filter(Boolean).join(" ").trim() || null;
    const avatarUrl =
      readIdentityString(
        record,
        "picture",
        "pictureUrl",
        "picture_url",
        "profile_picture_url",
        "profilePictureUrl",
        "avatarUrl",
        "avatar_url",
        "imageUrl",
        "image_url",
      ) || null;

    return {
      authSubject,
      email,
      emailVerified,
      emailVerificationSource: emailVerified ? "oauth_provider" : null,
      displayName,
      avatarUrl,
    };
  } catch {
    return null;
  }
}

export async function resolveAuthenticatedSubject(args: {
  ctx: any;
  authSubject?: string | null;
}): Promise<string> {
  const explicitSubject = normalizeSubject(args.authSubject);
  const verifiedSubject = await readVerifiedIdentitySubject(args.ctx);
  const allowUnverified = allowUnverifiedAuthSubjectFallback();

  if (verifiedSubject && explicitSubject && verifiedSubject !== explicitSubject) {
    // An owner's test-run tab asks as the test member they made.
    if (isTestMemberAuthSubject(explicitSubject)) {
      await resolveTestMemberStandIn(args.ctx, verifiedSubject, explicitSubject);
      return explicitSubject;
    }
    throw new Error("auth_subject_mismatch");
  }

  if (verifiedSubject) {
    return verifiedSubject;
  }

  if (!allowUnverified) {
    throw new Error("verified_identity_required");
  }

  if (!explicitSubject) throw new Error("auth_subject_required");
  return explicitSubject;
}

export async function resolveAuthenticatedIdentityProfile(args: {
  ctx: any;
  authSubject?: string | null;
}): Promise<AuthenticatedIdentityProfile> {
  const explicitSubject = normalizeSubject(args.authSubject);
  const verifiedIdentity = await readAuthenticatedIdentityProfile(args.ctx);
  const allowUnverified = allowUnverifiedAuthSubjectFallback();

  if (verifiedIdentity && explicitSubject && verifiedIdentity.authSubject !== explicitSubject) {
    if (isTestMemberAuthSubject(explicitSubject)) {
      // The test member's own profile: none of the owner's email or name.
      const row = await resolveTestMemberStandIn(args.ctx, verifiedIdentity.authSubject, explicitSubject);
      return {
        authSubject: explicitSubject,
        email: null,
        emailVerified: false,
        emailVerificationSource: null,
        displayName: row.label,
        avatarUrl: null,
      };
    }
    throw new Error("auth_subject_mismatch");
  }

  if (verifiedIdentity) {
    return verifiedIdentity;
  }

  if (!allowUnverified) {
    throw new Error("verified_identity_required");
  }

  if (!explicitSubject) throw new Error("auth_subject_required");
  return {
    authSubject: explicitSubject,
    email: null,
    emailVerified: false,
    emailVerificationSource: null,
    displayName: null,
    avatarUrl: null,
  };
}
