const WORKOS_USER_LOOKUP_TIMEOUT_MS = 4000;
const WORKOS_API_KEY_ENV_KEYS = ["ARX_WORKOS_API_KEY", "WORKOS_API_KEY"] as const;

export type WorkosUserVerificationLookup = {
  status: "ok" | "skipped" | "not_found" | "error";
  reason?: string;
  apiKeyConfigured: boolean;
  timeoutMs?: number;
  httpStatus?: number;
  subjectMatchedResponseId?: boolean | null;
  userId?: string | null;
  email?: string | null;
  emailVerified?: boolean | null;
  profilePicturePresent?: boolean;
  updatedAtPresent?: boolean;
};

export type RedactedWorkosUserVerificationLookup = Omit<WorkosUserVerificationLookup, "userId" | "email"> & {
  hasEmail?: boolean;
};

export type TrustedEmailVerificationResolution = {
  emailVerified: boolean;
  emailVerificationSource: "oauth_provider" | null;
  reason: string | null;
  workosLookup?: WorkosUserVerificationLookup;
};

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // Convex environments may not expose process.env in every runtime.
  }
  return "";
}

function readFirstEnv(keys: readonly string[]): string {
  for (const key of keys) {
    const value = readEnv(key);
    if (value) return value;
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") return false;
  return null;
}

export function normalizeEmailForVerification(value: unknown): string | null {
  const normalized = readString(value).toLowerCase();
  return normalized && normalized.includes("@") ? normalized : null;
}

export function isWorkosApiKeyConfigured(): boolean {
  return Boolean(readFirstEnv(WORKOS_API_KEY_ENV_KEYS));
}

export async function fetchWorkosUserVerification(
  authSubject: string | null,
): Promise<WorkosUserVerificationLookup> {
  const apiKey = readFirstEnv(WORKOS_API_KEY_ENV_KEYS);
  if (!authSubject) {
    return {
      status: "skipped",
      reason: "auth_subject_missing",
      apiKeyConfigured: Boolean(apiKey),
    };
  }
  if (!apiKey) {
    return {
      status: "skipped",
      reason: "workos_api_key_missing",
      apiKeyConfigured: false,
    };
  }

  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WORKOS_USER_LOOKUP_TIMEOUT_MS);
  try {
    response = await fetch(
      `https://api.workos.com/user_management/users/${encodeURIComponent(authSubject)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      },
    );
  } catch (error) {
    return {
      status: "error",
      reason:
        error instanceof Error && error.name === "AbortError"
          ? "workos_user_fetch_timeout"
          : "workos_user_fetch_failed",
      apiKeyConfigured: true,
      timeoutMs: WORKOS_USER_LOOKUP_TIMEOUT_MS,
    };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return {
      status: response.status === 404 ? "not_found" : "error",
      reason: `workos_user_fetch_http_${response.status}`,
      apiKeyConfigured: true,
      httpStatus: response.status,
    };
  }

  const payload = asRecord(await response.json().catch(() => null));
  if (!payload) {
    return {
      status: "error",
      reason: "workos_user_response_invalid",
      apiKeyConfigured: true,
      httpStatus: response.status,
    };
  }

  const responseUserId = readString(payload.id);
  const email = readString(payload.email);
  const emailVerified = readBoolean(payload.email_verified) ?? readBoolean(payload.emailVerified);
  return {
    status: "ok",
    apiKeyConfigured: true,
    httpStatus: response.status,
    subjectMatchedResponseId: responseUserId ? responseUserId === authSubject : null,
    userId: responseUserId || null,
    email: email || null,
    emailVerified,
    profilePicturePresent: Boolean(
      readString(payload.profile_picture_url) || readString(payload.profilePictureUrl),
    ),
    updatedAtPresent: Boolean(readString(payload.updated_at) || readString(payload.updatedAt)),
  };
}

export function redactWorkosUserVerificationLookup(
  lookup: WorkosUserVerificationLookup,
): RedactedWorkosUserVerificationLookup {
  const { userId: _userId, email, ...rest } = lookup;
  return {
    ...rest,
    hasEmail: Boolean(normalizeEmailForVerification(email)),
  };
}

export async function resolveTrustedWorkosEmailVerification(args: {
  authSubject: string | null;
  email: string | null;
}): Promise<TrustedEmailVerificationResolution> {
  const normalizedEmail = normalizeEmailForVerification(args.email);
  if (!normalizedEmail) {
    return {
      emailVerified: false,
      emailVerificationSource: null,
      reason: "email_missing",
    };
  }

  const lookup = await fetchWorkosUserVerification(args.authSubject);
  if (lookup.status !== "ok") {
    return {
      emailVerified: false,
      emailVerificationSource: null,
      reason: lookup.reason ?? lookup.status,
      workosLookup: lookup,
    };
  }
  if (lookup.subjectMatchedResponseId !== true) {
    return {
      emailVerified: false,
      emailVerificationSource: null,
      reason: "workos_subject_mismatch",
      workosLookup: lookup,
    };
  }
  if (lookup.emailVerified !== true) {
    return {
      emailVerified: false,
      emailVerificationSource: null,
      reason: "workos_email_unverified",
      workosLookup: lookup,
    };
  }
  if (normalizeEmailForVerification(lookup.email) !== normalizedEmail) {
    return {
      emailVerified: false,
      emailVerificationSource: null,
      reason: "workos_email_mismatch",
      workosLookup: lookup,
    };
  }

  return {
    emailVerified: true,
    emailVerificationSource: "oauth_provider",
    reason: null,
    workosLookup: lookup,
  };
}

export async function resolveTrustedEmailVerification(args: {
  authSubject: string | null;
  email: string | null;
  identityEmail?: string | null;
  identityEmailVerified?: boolean | null;
  identityEmailVerificationSource?: "oauth_provider" | null;
}): Promise<TrustedEmailVerificationResolution> {
  const normalizedEmail = normalizeEmailForVerification(args.email);
  const normalizedIdentityEmail = normalizeEmailForVerification(args.identityEmail);
  if (
    args.identityEmailVerified === true &&
    normalizedEmail &&
    normalizedIdentityEmail === normalizedEmail
  ) {
    return {
      emailVerified: true,
      emailVerificationSource: args.identityEmailVerificationSource ?? "oauth_provider",
      reason: null,
    };
  }

  return await resolveTrustedWorkosEmailVerification({
    authSubject: args.authSubject,
    email: args.email,
  });
}
