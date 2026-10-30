import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { httpRouter } from "convex/server";
import { registerRuntimeAuthRoutes } from "./httpAuth";
import { registerRuntimeAuthBridgeRoutes } from "./httpAuthBridge";
import { registerRuntimeBillingRoutes } from "./httpBilling";
import { registerRuntimeMcpRoutes } from "./httpMcp";
import { registerCommunitySiteRoutes } from "./httpCommunitySites";
import { registerEmailRoutes } from "./httpEmail";
import { readAuthenticatedIdentityProfile } from "./authIdentity";
import { parseOptionalString } from "./httpInferenceConfig";
import { registerRuntimeTurnRoutes } from "./httpRuntimeRoutes";
import { registerRuntimeVoiceRoutes } from "./httpVoice";
import { registerCommunityAgentAttachmentRoutes } from "./httpCommunityAgentAttachments";
import { registerCommunityAttachmentRoutes } from "./httpCommunityAttachments";
import { registerCommunityAppRoutes } from "./httpCommunityApps";
import { registerCommunityAccessRoutes } from "./httpCommunityAccess";
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

const requireAuthenticatedActor: RequireAuthenticatedActor = async (
  ctx: any,
  req: Request,
): Promise<
  | {
      ok: true;
      actor: {
        userId: string;
        dbUserId: any;
        authSubject: string;
        email: string | null;
        displayName: string | null;
        avatarUrl: string | null;
      };
    }
  | { ok: false; response: Response }
> => {
  const authIdentity = await requireVerifiedIdentity(ctx, req);
  if (!authIdentity.ok) return authIdentity;
  const {
    authSubject,
    email,
    emailVerified,
    emailVerificationSource,
    displayName,
    avatarUrl,
  } = authIdentity.identity;
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
};

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

registerCommunityAppRoutes({ http, httpAction });

registerCommunityAccessRoutes({ http, httpAction });

registerCommunitySiteRoutes({ http, httpAction, requireAuthenticatedActor });

registerRuntimeMcpRoutes({
  http,
  httpAction,
  jsonResponse,
  optionsResponse,
  requireAuthenticatedActor,
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
