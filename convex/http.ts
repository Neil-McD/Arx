import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { httpRouter } from "convex/server";
import { registerRuntimeAuthRoutes } from "./httpAuth";
import { registerRuntimeAuthBridgeRoutes } from "./httpAuthBridge";
import { registerRuntimeBillingRoutes } from "./httpBilling";
import { registerRuntimeMcpRoutes } from "./httpMcp";
import { registerEmailRoutes } from "./httpEmail";
import { identityProfileFromClaims, readAuthenticatedIdentityProfile, type AuthenticatedIdentityProfile } from "./authIdentity";
import { bearerToken, verifyMcpAccessToken } from "../shared/mcpAccessToken.ts";
import { parseOptionalString } from "./httpInferenceConfig";
import { registerRuntimeTurnRoutes } from "./httpRuntimeRoutes";
import { registerRuntimeVoiceRoutes } from "./httpVoice";
import { registerCommunityAgentAttachmentRoutes } from "./httpCommunityAgentAttachments";
import { registerCommunityAttachmentRoutes } from "./httpCommunityAttachments";
import { registerDirectMessageAttachmentRoutes } from "./httpDirectMessageAttachments";
import { registerCommunityLessonFileRoutes } from "./httpCommunityLessonFiles";
import { registerCommunityLandingRoutes } from "./httpCommunityLanding";
import { registerConnectedAppRoutes } from "./httpConnectedApps";
import { sseResponseWithHeaders, type SseSource } from "./httpStreaming";
import type { RequireAuthenticatedActor } from "./runtimeTurnResolution";
import { normalizeEmailForVerification } from "./workosEmailVerification";

function buildCorsHeaders(req: Request): Headers {
  const origin = String(req.headers.get("origin") ?? "*").trim() || "*";
  const requestedHeaders = String(req.headers.get("access-control-request-headers") ?? "").trim();
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    requestedHeaders || "Content-Type, Authorization, apikey",
  );
  headers.set("Access-Control-Expose-Headers", "x-arx-request-id, x-arx-runtime-stage");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin, Access-Control-Request-Headers");
  headers.set("Cache-Control", "no-store");
  return headers;
}

function jsonResponse(req: Request, status: number, payload: unknown): Response {
  const headers = buildCorsHeaders(req);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), { status, headers });
}

function optionsResponse(req: Request): Response {
  try {
    console.log("runtime_cors_preflight", {
      path: new URL(req.url).pathname,
      origin: String(req.headers.get("origin") ?? "").trim() || null,
      request_method: String(req.headers.get("access-control-request-method") ?? "").trim() || null,
      request_headers: String(req.headers.get("access-control-request-headers") ?? "").trim() || null,
    });
  } catch {
    // ignore preflight logging failures
  }
  return new Response(null, { status: 204, headers: buildCorsHeaders(req) });
}

function sseResponse(req: Request, source: SseSource): Response {
  return sseResponseWithHeaders(buildCorsHeaders(req), source);
}

function hasBearerTokenHeader(req: Request): boolean {
  const raw = String(req.headers.get("authorization") ?? "").trim();
  if (!raw) return false;
  if (!raw.toLowerCase().startsWith("bearer ")) return false;
  return raw.slice(7).trim().length > 0;
}

async function requireVerifiedIdentity(
  ctx: any,
  req: Request,
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
  if (!hasBearerTokenHeader(req)) {
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

  let identity;
  try {
    identity = await readAuthenticatedIdentityProfile(ctx);
  } catch {
    identity = null;
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

type ActorResult = Awaited<ReturnType<RequireAuthenticatedActor>>;

const requireAuthenticatedActor: RequireAuthenticatedActor = async (ctx: any, req: Request) => {
  const authIdentity = await requireVerifiedIdentity(ctx, req);
  if (!authIdentity.ok) return authIdentity;
  return await actorForVerifiedIdentity(ctx, req, authIdentity.identity);
};

// The MCP door: only a token minted for it (shared/mcpAccessToken.ts), which
// the backend's general sign-in does not accept.
const requireMcpActor: RequireAuthenticatedActor = async (ctx: any, req: Request) => {
  const algorithm = readEnvValue("ARX_AUTH_JWT_ALGORITHM").toUpperCase() === "ES256" ? "ES256" as const : "RS256" as const;
  const issuer = readEnvValue("ARX_AUTH_JWT_ISSUER").replace(/\/+$/, "");
  const verified = await verifyMcpAccessToken(bearerToken(req), {
    issuer,
    jwksUrl: readEnvValue("ARX_AUTH_JWT_JWKS_URL") || (issuer ? `${issuer}/.well-known/jwks.json` : ""),
    audience: readEnvValue("ARX_MCP_AUTH_JWT_AUDIENCE"),
    algorithm,
  });
  const identity = verified.ok ? identityProfileFromClaims(verified.claims) : null;
  if (!identity) {
    return { ok: false, response: jsonResponse(req, 401, { ok: false, code: "auth_invalid_bearer_token", reason: verified.ok ? "no_subject" : verified.reason }) };
  }
  return await actorForVerifiedIdentity(ctx, req, identity);
};

function readEnvValue(name: string): string {
  return String((globalThis as any)?.process?.env?.[name] ?? "").trim();
}

async function actorForVerifiedIdentity(
  ctx: any,
  req: Request,
  identity: AuthenticatedIdentityProfile,
): Promise<ActorResult> {
  const {
    authSubject,
    email,
    emailVerified,
    emailVerificationSource,
    displayName,
    avatarUrl,
  } = identity;
  const normalizedIdentityEmail = normalizeEmailForVerification(email);
  const existingActor = await ctx
    .runQuery((internal as any).authActor.resolveAuthenticatedActorInternal, { authSubject })
    .catch(() => null);
  const trustedEmailVerification =
    typeof existingActor?.emailVerifiedAt === "number" &&
    normalizeEmailForVerification(existingActor?.email) === normalizedIdentityEmail
      ? {
          emailVerified: true,
          emailVerificationSource: existingActor?.emailVerificationSource ?? "oauth_provider",
        }
      : {
          emailVerified: Boolean(email && emailVerified),
          emailVerificationSource:
            email && emailVerified ? emailVerificationSource ?? "oauth_provider" : null,
        };
  const actor = (await ctx.runMutation(internal.authActor.ensureAuthenticatedActorByExplicitSubjectInternal as any, {
    authSubject,
    ...(email ? { email } : null),
    ...(email ? { emailVerified: trustedEmailVerification.emailVerified } : null),
    ...(trustedEmailVerification.emailVerificationSource
      ? { emailVerificationSource: trustedEmailVerification.emailVerificationSource }
      : null),
    ...(displayName ? { displayName } : null),
    ...(avatarUrl ? { avatarUrl } : null),
  })) as { authSubject?: string | null; dbUserId?: any };
  const actorAuthSubject = String(actor?.authSubject ?? "").trim();
  if (actorAuthSubject && actorAuthSubject !== authSubject) {
    return {
      ok: false,
      response: jsonResponse(req, 401, {
        ok: false,
        code: "auth_invalid_user",
        error: "auth_invalid_user",
        message: "Authenticated user is not available.",
      }),
    };
  }
  const dbUserId = actor?.dbUserId;
  if (!dbUserId) {
    return {
      ok: false,
      response: jsonResponse(req, 401, {
        ok: false,
        code: "auth_invalid_user",
        error: "auth_invalid_user",
        message: "Authenticated user is not available.",
      }),
    };
  }
  return {
    ok: true,
    actor: {
      userId: String(dbUserId),
      authSubject,
      dbUserId,
      email,
      displayName,
      avatarUrl,
    },
  };
}

const http = httpRouter();

registerRuntimeAuthRoutes({
  http,
  httpAction,
  buildCorsHeaders,
  jsonResponse,
  optionsResponse,
  parseOptionalString,
});

registerRuntimeAuthBridgeRoutes({
  http,
  httpAction,
  jsonResponse,
  optionsResponse,
  parseOptionalString,
});

registerRuntimeBillingRoutes({
  http,
  httpAction,
  jsonResponse,
  optionsResponse,
});

registerEmailRoutes({
  http,
  httpAction,
  jsonResponse,
  optionsResponse,
});

registerRuntimeVoiceRoutes({
  http,
  httpAction,
  jsonResponse,
  optionsResponse,
  requireAuthenticatedActor,
});

registerCommunityAgentAttachmentRoutes({
  http,
  httpAction,
  jsonResponse,
  optionsResponse,
  requireAuthenticatedActor,
});

registerCommunityAttachmentRoutes({ http, httpAction, jsonResponse, optionsResponse, requireAuthenticatedActor });
registerDirectMessageAttachmentRoutes({ http, httpAction, jsonResponse, optionsResponse, requireAuthenticatedActor });
registerCommunityLessonFileRoutes({ http, httpAction, jsonResponse, optionsResponse, requireAuthenticatedActor });

registerCommunityLandingRoutes({ http, httpAction });
registerConnectedAppRoutes({ http, httpAction });


registerRuntimeMcpRoutes({
  http,
  httpAction,
  jsonResponse,
  optionsResponse,
  requireAuthenticatedActor: requireMcpActor,
});

registerRuntimeTurnRoutes({
  http,
  httpAction,
  jsonResponse,
  optionsResponse,
  sseResponse,
  requireAuthenticatedActor,
});

export default http;
