import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { httpRouter } from "convex/server";
import { registerRuntimeAuthRoutes } from "./httpAuth";
import { registerRuntimeAuthBridgeRoutes } from "./httpAuthBridge";
import { registerAppOAuthRoutes } from "./httpAppOAuth";
import { registerRuntimeBillingRoutes } from "./httpBilling";
import { registerRuntimeContextRoutes } from "./httpContext";
import { registerCommunitySourceIntegrationRoutes } from "./httpCommunitySourceIntegrations";
import { registerRuntimeMcpRoutes } from "./httpMcp";
import { registerEmailRoutes } from "./httpEmail";
import { readAuthenticatedIdentityProfile } from "./authIdentity";
import { parseBoolish, parseOptionalString } from "./httpInferenceConfig";
import { registerRuntimeTurnRoutes } from "./httpRuntimeRoutes";
import {
  handlePolynetCodexWorkerIngest,
  POLYNET_CODEX_WORKER_INGEST_PATH,
} from "./polynetCodexWorkerIngest";
import { registerRuntimeVoiceRoutes } from "./httpVoice";
import type { RequireAuthenticatedActor } from "./runtimeTurnResolution";
import { normalizeEmailForVerification, resolveTrustedEmailVerification } from "./workosEmailVerification";

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

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

function encodeSse(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function sseResponse(
  req: Request,
  source:
    | Array<{ event: string; data: Record<string, unknown> }>
    | ((writer: {
        send: (entry: { event: string; data: Record<string, unknown> }) => void;
        close: () => void;
      }) => Promise<void> | void),
): Response {
  const headers = buildCorsHeaders(req);
  headers.set("Content-Type", "text/event-stream; charset=utf-8");
  headers.set("Connection", "keep-alive");
  if (Array.isArray(source)) {
    const body = source.map((entry) => encodeSse(entry.event, entry.data)).join("");
    return new Response(body, { status: 200, headers });
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const writer = {
        send(entry: { event: string; data: Record<string, unknown> }) {
          if (closed) return;
          controller.enqueue(encoder.encode(encodeSse(entry.event, entry.data)));
        },
        close() {
          if (closed) return;
          closed = true;
          controller.close();
        },
      };
      Promise.resolve(source(writer))
        .then(() => {
          writer.close();
        })
        .catch((error) => {
          const message =
            typeof error === "string"
              ? error
              : error instanceof Error
                ? error.message
                : "Stream failed.";
          writer.send({
            event: "error",
            data: {
              error: message || "Stream failed.",
            },
          });
          writer.close();
        });
    },
  });
  return new Response(body, { status: 200, headers });
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

async function requireAuthenticatedSubject(
  ctx: any,
  req: Request,
): Promise<{ ok: true; authSubject: string } | { ok: false; response: Response }> {
  const auth = await requireAuthenticatedActor(ctx, req);
  if (!auth.ok) return auth;
  return { ok: true, authSubject: auth.actor.authSubject };
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
      : await resolveTrustedEmailVerification({
          authSubject,
          email,
          identityEmail: email,
          identityEmailVerified: emailVerified,
          identityEmailVerificationSource: emailVerificationSource,
        });
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

registerAppOAuthRoutes({
  http,
  httpAction,
});

registerCommunitySourceIntegrationRoutes({
  http,
  httpAction,
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

registerRuntimeContextRoutes({
  http,
  httpAction,
  jsonResponse,
  optionsResponse,
  requireAuthenticatedSubject,
});

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

http.route({
  path: POLYNET_CODEX_WORKER_INGEST_PATH,
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await handlePolynetCodexWorkerIngest(ctx, req);
  }),
});

export default http;
