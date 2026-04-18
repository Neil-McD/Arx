import type { PublicHttpAction } from "convex/server";

type RuntimeAuthMagicLinkOtpInput = {
  email?: unknown;
  create_user?: unknown;
  redirect_to?: unknown;
  email_redirect_to?: unknown;
};

type HttpRouteMethod = "GET" | "POST" | "DELETE" | "OPTIONS" | "PUT" | "PATCH";

type HttpRouterLike = {
  route: (config: {
    path: string;
    method: HttpRouteMethod;
    handler: PublicHttpAction;
  }) => void;
};

type HttpActionLike = (handler: (ctx: unknown, req: Request) => Promise<Response>) => PublicHttpAction;

type RegisterRuntimeAuthRoutesArgs = {
  http: HttpRouterLike;
  httpAction: HttpActionLike;
  buildCorsHeaders: (req: Request) => Headers;
  jsonResponse: (req: Request, status: number, payload: unknown) => Response;
  optionsResponse: (req: Request) => Response;
  parseOptionalString: (raw: unknown, maxLen: number) => string | null;
  parseBoolish: (raw: unknown, fallback?: boolean) => boolean;
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

function resolveMagicLinkEndpointUrl(): string {
  return readEnv("ARX_AUTH_MAGIC_LINK_URL");
}

function toAuthMisconfiguredResponse(
  req: Request,
  jsonResponse: RegisterRuntimeAuthRoutesArgs["jsonResponse"],
  message: string,
): Response {
  return jsonResponse(req, 503, {
    ok: false,
    code: "auth_verifier_misconfigured",
    error: "auth_verifier_misconfigured",
    message,
  });
}

async function proxyUpstreamResponse(params: {
  req: Request;
  upstream: Response;
  buildCorsHeaders: RegisterRuntimeAuthRoutesArgs["buildCorsHeaders"];
}): Promise<Response> {
  const headers = params.buildCorsHeaders(params.req);
  headers.set(
    "Content-Type",
    String(params.upstream.headers.get("content-type") ?? "application/json; charset=utf-8"),
  );
  const bodyText = await params.upstream.text();
  return new Response(bodyText, {
    status: params.upstream.status,
    headers,
  });
}

async function forwardAuthJsonRequest(params: {
  req: Request;
  upstreamUrl: string;
  payload?: Record<string, unknown>;
  buildCorsHeaders: RegisterRuntimeAuthRoutesArgs["buildCorsHeaders"];
  jsonResponse: RegisterRuntimeAuthRoutesArgs["jsonResponse"];
}): Promise<Response> {
  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(params.upstreamUrl);
  } catch {
    return toAuthMisconfiguredResponse(params.req, params.jsonResponse, "Auth upstream URL is invalid.");
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params.payload ?? {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return params.jsonResponse(params.req, 503, {
      ok: false,
      code: "auth_upstream_unavailable",
      error: "auth_upstream_unavailable",
      message: message || "Auth upstream is unavailable.",
    });
  }

  return await proxyUpstreamResponse({
    req: params.req,
    upstream,
    buildCorsHeaders: params.buildCorsHeaders,
  });
}

export function registerRuntimeAuthRoutes(args: RegisterRuntimeAuthRoutesArgs): void {
  const { http, httpAction, buildCorsHeaders, jsonResponse, optionsResponse, parseOptionalString, parseBoolish } =
    args;

  http.route({
    path: "/runtime/auth_send_magic_link_otp",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/runtime/auth_send_magic_link_otp",
    method: "POST",
    handler: httpAction(async (_ctx, req) => {
      let input: RuntimeAuthMagicLinkOtpInput;
      try {
        input = (await req.json()) as RuntimeAuthMagicLinkOtpInput;
      } catch {
        return jsonResponse(req, 400, {
          ok: false,
          code: "invalid_request",
          error: "invalid_request",
          message: "Invalid JSON payload.",
        });
      }

      const email = parseOptionalString(input.email, 320);
      if (!email) {
        return jsonResponse(req, 400, {
          ok: false,
          code: "invalid_request",
          error: "invalid_request",
          message: "email is required.",
        });
      }

      const createUser = parseBoolish(input.create_user, true);
      const redirectTo = parseOptionalString(input.redirect_to, 2048);
      const emailRedirectTo = parseOptionalString(input.email_redirect_to, 2048);
      const magicLinkUrl = resolveMagicLinkEndpointUrl();
      if (!magicLinkUrl) {
        return jsonResponse(req, 501, {
          ok: false,
          code: "auth_magic_link_not_supported",
          error: "auth_magic_link_not_supported",
          message: "Magic link sign-in is not configured for this deployment.",
        });
      }

      return await forwardAuthJsonRequest({
        req,
        upstreamUrl: magicLinkUrl,
        payload: {
          email,
          create_user: createUser,
          redirect_to: redirectTo,
          email_redirect_to: emailRedirectTo,
        },
        buildCorsHeaders,
        jsonResponse,
      });
    }),
  });
}
