import { api, internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { httpRouter } from "convex/server";
import { registerRuntimeAuthRoutes } from "./httpAuth";
import { registerRuntimeContextRoutes } from "./httpContext";
import { parseBoolish, parseOptionalString } from "./httpInferenceConfig";
import { registerRuntimeTurnRoutes } from "./httpRuntimeRoutes";
import { registerRuntimeVoiceRoutes } from "./httpVoice";

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

function sseResponse(req: Request, events: Array<{ event: string; data: Record<string, unknown> }>): Response {
  const headers = buildCorsHeaders(req);
  headers.set("Content-Type", "text/event-stream; charset=utf-8");
  headers.set("Connection", "keep-alive");
  const body = events.map((entry) => encodeSse(entry.event, entry.data)).join("");
  return new Response(body, { status: 200, headers });
}

type SseEventWriter = (event: string, data: Record<string, unknown>) => void;

function sseLiveResponse(
  req: Request,
  producer: (emit: SseEventWriter) => Promise<void>,
): Response {
  const headers = buildCorsHeaders(req);
  headers.set("Content-Type", "text/event-stream; charset=utf-8");
  headers.set("Connection", "keep-alive");
  headers.set("X-Accel-Buffering", "no");
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const emit: SseEventWriter = (event, data) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeSse(event, data)));
        } catch {
          closed = true;
        }
      };
      void Promise.resolve()
        .then(async () => {
          await producer(emit);
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          emit("error", {
            error: message || "stream_failed",
            message: message || "stream_failed",
          });
        })
        .finally(() => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            // ignore
          }
        });
    },
    cancel() {
      // best-effort: no background task cancellation in this path yet.
    },
  });
  return new Response(stream, { status: 200, headers });
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

  let identity: Awaited<ReturnType<typeof ctx.auth.getUserIdentity>>;
  try {
    identity = await ctx.auth.getUserIdentity();
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

  const authSubject = String(identity.subject ?? "").trim();
  if (!authSubject) {
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

  const identityRecord =
    identity && typeof identity === "object" && !Array.isArray(identity)
      ? (identity as Record<string, unknown>)
      : {};
  const readIdentityString = (...keys: string[]): string => {
    for (const key of keys) {
      const value = identityRecord[key];
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
    return "";
  };
  const email = typeof identity.email === "string" ? identity.email.trim() : "";
  const directDisplayName = readIdentityString("name", "displayName", "display_name", "full_name", "fullName");
  const givenName = readIdentityString("given_name", "givenName", "first_name", "firstName");
  const familyName = readIdentityString("family_name", "familyName", "last_name", "lastName");
  const displayName = directDisplayName || [givenName, familyName].filter(Boolean).join(" ").trim();
  const avatarUrl = readIdentityString(
    "picture",
    "pictureUrl",
    "picture_url",
    "profile_picture_url",
    "profilePictureUrl",
    "avatarUrl",
    "avatar_url",
    "imageUrl",
    "image_url",
  );
  return {
    ok: true,
    identity: {
      authSubject,
      email: email || null,
      displayName: displayName || null,
      avatarUrl: avatarUrl || null,
    },
  };
}

async function requireAuthenticatedUserId(
  ctx: any,
  req: Request,
): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const auth = await requireAuthenticatedActor(ctx, req);
  if (!auth.ok) return auth;
  return { ok: true, userId: auth.actor.userId };
}

async function requireAuthenticatedActor(
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
> {
  const authIdentity = await requireVerifiedIdentity(ctx, req);
  if (!authIdentity.ok) return authIdentity;
  const { authSubject, email, displayName, avatarUrl } = authIdentity.identity;
  const actor = (await ctx.runMutation(api.auth.bootstrapActor as any, {
    authState: "authenticated",
    authSubject,
    ...(email ? { email } : null),
    ...(displayName ? { displayName } : null),
    ...(avatarUrl ? { avatarUrl } : null),
  })) as { userId?: string | null };
  const userId = String(actor?.userId ?? "").trim();
  if (!userId) {
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
  const dbUserId = await ctx.runQuery(internal.providerConnections.getUserIdByAuthSubjectInternal as any, {
    authSubject,
  });
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
      userId,
      dbUserId,
      authSubject,
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
  parseBoolish,
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
  requireAuthenticatedUserId,
});

registerRuntimeTurnRoutes({
  http,
  httpAction,
  jsonResponse,
  optionsResponse,
  sseResponse,
  sseLiveResponse,
  requireAuthenticatedActor,
});

export default http;
