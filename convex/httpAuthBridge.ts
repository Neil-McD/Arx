import { internal } from "./_generated/api";
import { readAuthenticatedIdentityProfile } from "./authIdentity";
import {
  AUTH_SECURE_RANDOM_UNAVAILABLE,
  createSecureAuthSessionId,
  hashAuthSessionCredential,
  normalizeStoredState,
} from "./authSessions";
import { normalizeEmailForVerification, resolveTrustedEmailVerification } from "./workosEmailVerification";

type HttpRouteMethod = "GET" | "POST" | "DELETE" | "OPTIONS" | "PUT" | "PATCH";

type HttpRouterLike = {
  route: (config: {
    path: string;
    method: HttpRouteMethod;
    handler: any;
  }) => void;
};

type HttpActionLike = (handler: (ctx: any, req: Request) => Promise<Response>) => any;

type RegisterRuntimeAuthBridgeRoutesArgs = {
  http: HttpRouterLike;
  httpAction: HttpActionLike;
  jsonResponse: (req: Request, status: number, payload: unknown) => Response;
  optionsResponse: (req: Request) => Response;
  parseOptionalString: (raw: unknown, maxLen: number) => string | null;
  createSessionId?: () => string;
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

function readBridgeSecret(): string {
  return readEnv("ARX_AUTH_BRIDGE_SECRET");
}

function hasValidBridgeSecret(req: Request): boolean {
  const expected = readBridgeSecret();
  if (!expected) return false;
  const provided = String(req.headers.get("x-arx-auth-bridge-secret") ?? "").trim();
  return Boolean(provided) && provided === expected;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

async function buildSessionLookup(sessionCredential: string) {
  return {
    sessionTokenHash: await hashAuthSessionCredential(sessionCredential),
  };
}

function toPublicSession(stored: {
  accessToken: string;
  idToken?: string | null;
  accessTokenExpiresAt?: number | null;
  user: {
    id: string;
    email?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
  };
}) {
  return {
    access_token: stored.accessToken,
    ...(stored.idToken ? { id_token: stored.idToken } : null),
    expires_at: stored.accessTokenExpiresAt ?? Math.floor(Date.now() / 1000) + 60,
    user: {
      id: stored.user.id,
      ...(stored.user.email ? { email: stored.user.email } : null),
      ...(stored.user.displayName ? { displayName: stored.user.displayName } : null),
      ...(stored.user.avatarUrl ? { avatarUrl: stored.user.avatarUrl } : null),
    },
  };
}

async function requireVerifiedIdentity(
  ctx: any,
  req: Request,
  jsonResponse: RegisterRuntimeAuthBridgeRoutesArgs["jsonResponse"],
): Promise<
  | {
      ok: true;
      identity: {
        authSubject: string;
        email: string | null;
        emailVerified: boolean;
        emailVerificationSource: "oauth_provider" | null;
        displayName: string | null;
        avatarUrl: string | null;
      };
    }
  | { ok: false; response: Response }
> {
  const rawAuthorization = String(req.headers.get("authorization") ?? "").trim();
  if (!rawAuthorization.toLowerCase().startsWith("bearer ") || !rawAuthorization.slice(7).trim()) {
    return {
      ok: false,
      response: jsonResponse(req, 401, {
        ok: false,
        code: "auth_missing_bearer_token",
        error: "auth_missing_bearer_token",
        message: "Missing bearer token.",
      }),
    };
  }

  let identity: Awaited<ReturnType<typeof readAuthenticatedIdentityProfile>>;
  try {
    identity = await readAuthenticatedIdentityProfile(ctx);
  } catch {
    return {
      ok: false,
      response: jsonResponse(req, 503, {
        ok: false,
        code: "auth_upstream_unavailable",
        error: "auth_upstream_unavailable",
        message: "Authentication is temporarily unavailable.",
      }),
    };
  }

  if (!identity) {
    return {
      ok: false,
      response: jsonResponse(req, 401, {
        ok: false,
        code: "auth_invalid_bearer_token",
        error: "auth_invalid_bearer_token",
        message: "Invalid bearer token.",
      }),
    };
  }

  return {
    ok: true,
    identity: {
      authSubject: identity.authSubject,
      email: identity.email,
      emailVerified: identity.emailVerified,
      emailVerificationSource: identity.emailVerificationSource,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
    },
  };
}

async function readJsonBody(
  req: Request,
  jsonResponse: RegisterRuntimeAuthBridgeRoutesArgs["jsonResponse"],
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  try {
    const body = (await req.json()) as unknown;
    return { ok: true, body: asObject(body) ?? {} };
  } catch {
    return {
      ok: false,
      response: jsonResponse(req, 400, {
        ok: false,
        code: "invalid_json",
        error: "invalid_json",
        message: "Request body must be valid JSON.",
      }),
    };
  }
}

function mapBridgeSessionActionResult(
  req: Request,
  jsonResponse: RegisterRuntimeAuthBridgeRoutesArgs["jsonResponse"],
  result: any,
): Response {
  if (result?.status === "ready" || result?.status === "refreshed") {
    return jsonResponse(req, 200, {
      ok: true,
      session: result.session,
      ...(asObject(result?.trace) ? { trace: result.trace } : null),
    });
  }
  if (result?.status === "ok") {
    return jsonResponse(req, 200, { ok: true });
  }
  if (result?.status === "terminal_failure") {
    return jsonResponse(req, 401, {
      ok: false,
      code: "auth_session_invalid",
      error: "auth_session_invalid",
      message: readString(result?.reason) ?? "Session is no longer valid.",
    });
  }
  return jsonResponse(req, 503, {
    ok: false,
    code: "auth_session_unavailable",
    error: "auth_session_unavailable",
    message: readString(result?.reason) ?? "Auth session is temporarily unavailable.",
  });
}

export function registerRuntimeAuthBridgeRoutes(args: RegisterRuntimeAuthBridgeRoutesArgs): void {
  const { http, httpAction, jsonResponse, optionsResponse, parseOptionalString } = args;
  const createSessionId = args.createSessionId ?? createSecureAuthSessionId;

  const registerOptions = (path: string) => {
    http.route({
      path,
      method: "OPTIONS",
      handler: httpAction(async (_ctx, req) => optionsResponse(req)),
    });
  };

  const bridgePaths = [
    "/runtime/auth_bridge_session_create",
    "/runtime/auth_bridge_session_bootstrap",
    "/runtime/auth_bridge_session_refresh",
    "/runtime/auth_bridge_session_logout",
  ];
  for (const path of bridgePaths) registerOptions(path);

  http.route({
    path: "/runtime/auth_bridge_session_create",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      if (!hasValidBridgeSecret(req)) {
        return jsonResponse(req, 401, {
          ok: false,
          code: "auth_bridge_unauthorized",
          error: "auth_bridge_unauthorized",
          message: "Auth bridge secret is invalid.",
        });
      }

      const verified = await requireVerifiedIdentity(ctx, req, jsonResponse);
      if (!verified.ok) return verified.response;

      const bodyResult = await readJsonBody(req, jsonResponse);
      if (!bodyResult.ok) return bodyResult.response;

      const payload = bodyResult.body;
      const stored = normalizeStoredState((payload.payload ?? payload) as unknown, {
        requireRefreshToken: true,
      });
      if (!stored?.refreshToken) {
        return jsonResponse(req, 400, {
          ok: false,
          code: "invalid_auth_session_payload",
          error: "invalid_auth_session_payload",
          message: "Auth session payload is incomplete.",
        });
      }

      const authSubject = verified.identity.authSubject;
      const normalizedStored = {
        ...stored,
        user: {
          id: authSubject,
          email: verified.identity.email ?? stored.user.email ?? null,
          displayName: verified.identity.displayName ?? stored.user.displayName ?? null,
          avatarUrl: verified.identity.avatarUrl ?? stored.user.avatarUrl ?? null,
        },
      };
      let sessionId: string;
      let sessionTokenHash: string;
      try {
        sessionId = createSessionId();
        sessionTokenHash = await hashAuthSessionCredential(sessionId);
      } catch {
        return jsonResponse(req, 503, {
          ok: false,
          code: AUTH_SECURE_RANDOM_UNAVAILABLE,
          error: AUTH_SECURE_RANDOM_UNAVAILABLE,
          message: "Secure session creation is temporarily unavailable.",
        });
      }
      const normalizedStoredEmail = normalizeEmailForVerification(normalizedStored.user.email);
      const identityEmailMatchesStored =
        Boolean(verified.identity.email) &&
        normalizeEmailForVerification(verified.identity.email) === normalizedStoredEmail;
      const emailVerification = await resolveTrustedEmailVerification({
        authSubject,
        email: normalizedStored.user.email,
        identityEmail: verified.identity.email,
        identityEmailVerified: identityEmailMatchesStored ? verified.identity.emailVerified : false,
        identityEmailVerificationSource: identityEmailMatchesStored
          ? verified.identity.emailVerificationSource
          : null,
      });

      const actor = await ctx.runMutation(internal.authActor.ensureAuthenticatedActorByExplicitSubjectInternal as any, {
        authSubject,
        ...(normalizedStored.user.email ? { email: normalizedStored.user.email } : null),
        emailVerified: emailVerification.emailVerified,
        ...(emailVerification.emailVerificationSource
          ? { emailVerificationSource: emailVerification.emailVerificationSource }
          : null),
        ...(normalizedStored.user.displayName ? { displayName: normalizedStored.user.displayName } : null),
        ...(normalizedStored.user.avatarUrl ? { avatarUrl: normalizedStored.user.avatarUrl } : null),
        nowMs: Date.now(),
      });

      await ctx.runMutation(internal.authSessions.createAuthSessionInternal as any, {
        sessionTokenHash,
        userId: actor.dbUserId,
        accessToken: normalizedStored.accessToken,
        ...(normalizedStored.idToken ? { idToken: normalizedStored.idToken } : null),
        refreshToken: normalizedStored.refreshToken,
        ...(typeof normalizedStored.accessTokenExpiresAt === "number"
          ? { accessTokenExpiresAt: normalizedStored.accessTokenExpiresAt }
          : null),
        ...(normalizedStored.user.email ? { email: normalizedStored.user.email } : null),
        ...(normalizedStored.user.displayName ? { displayName: normalizedStored.user.displayName } : null),
        ...(normalizedStored.user.avatarUrl ? { avatarUrl: normalizedStored.user.avatarUrl } : null),
        externalUserId: normalizedStored.user.id,
        nowMs: Date.now(),
      });

      return jsonResponse(req, 200, {
        ok: true,
        session_id: sessionId,
        session: toPublicSession(normalizedStored),
      });
    }),
  });

  http.route({
    path: "/runtime/auth_bridge_session_bootstrap",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      if (!hasValidBridgeSecret(req)) {
        return jsonResponse(req, 401, {
          ok: false,
          code: "auth_bridge_unauthorized",
          error: "auth_bridge_unauthorized",
          message: "Auth bridge secret is invalid.",
        });
      }
      const bodyResult = await readJsonBody(req, jsonResponse);
      if (!bodyResult.ok) return bodyResult.response;
      const sessionId = parseOptionalString(bodyResult.body.session_id, 256);
      if (!sessionId) {
        return jsonResponse(req, 400, {
          ok: false,
          code: "auth_session_missing",
          error: "auth_session_missing",
          message: "Session id is required.",
        });
      }
      const result = await ctx.runAction(internal.authSessions.bootstrapAuthSessionInternal as any, {
        ...(await buildSessionLookup(sessionId)),
      });
      return mapBridgeSessionActionResult(req, jsonResponse, result);
    }),
  });

  http.route({
    path: "/runtime/auth_bridge_session_refresh",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      if (!hasValidBridgeSecret(req)) {
        return jsonResponse(req, 401, {
          ok: false,
          code: "auth_bridge_unauthorized",
          error: "auth_bridge_unauthorized",
          message: "Auth bridge secret is invalid.",
        });
      }
      const bodyResult = await readJsonBody(req, jsonResponse);
      if (!bodyResult.ok) return bodyResult.response;
      const sessionId = parseOptionalString(bodyResult.body.session_id, 256);
      if (!sessionId) {
        return jsonResponse(req, 400, {
          ok: false,
          code: "auth_session_missing",
          error: "auth_session_missing",
          message: "Session id is required.",
        });
      }
      const result = await ctx.runAction(internal.authSessions.refreshAuthSessionInternal as any, {
        ...(await buildSessionLookup(sessionId)),
      });
      return mapBridgeSessionActionResult(req, jsonResponse, result);
    }),
  });

  http.route({
    path: "/runtime/auth_bridge_session_logout",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      if (!hasValidBridgeSecret(req)) {
        return jsonResponse(req, 401, {
          ok: false,
          code: "auth_bridge_unauthorized",
          error: "auth_bridge_unauthorized",
          message: "Auth bridge secret is invalid.",
        });
      }
      const bodyResult = await readJsonBody(req, jsonResponse);
      if (!bodyResult.ok) return bodyResult.response;
      const sessionId = parseOptionalString(bodyResult.body.session_id, 256);
      if (!sessionId) {
        return jsonResponse(req, 200, { ok: true });
      }
      const result = await ctx.runAction(internal.authSessions.logoutAuthSessionInternal as any, {
        ...(await buildSessionLookup(sessionId)),
      });
      return mapBridgeSessionActionResult(req, jsonResponse, result);
    }),
  });
}
