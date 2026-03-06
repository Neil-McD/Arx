type RuntimeAuthBeginGoogleSignInInput = {
  provider?: unknown;
  redirect_to?: unknown;
  code_challenge?: unknown;
  code_challenge_method?: unknown;
  state?: unknown;
};

type RuntimeAuthPkceExchangeInput = {
  auth_code?: unknown;
  code_verifier?: unknown;
  redirect_to?: unknown;
};

type RuntimeAuthRefreshSessionInput = {
  refresh_token?: unknown;
};

type RuntimeAuthMagicLinkOtpInput = {
  email?: unknown;
  create_user?: unknown;
  redirect_to?: unknown;
  email_redirect_to?: unknown;
};

type RuntimeAuthLogoutInput = {
  scope?: unknown;
  access_token?: unknown;
};

type HttpRouterLike = {
  route: (config: {
    path: string;
    method: string;
    handler: unknown;
  }) => void;
};

type HttpActionLike = (handler: (ctx: unknown, req: Request) => Promise<Response>) => unknown;

type RegisterRuntimeAuthRoutesArgs = {
  http: HttpRouterLike;
  httpAction: HttpActionLike;
  buildCorsHeaders: (req: Request) => Headers;
  jsonResponse: (req: Request, status: number, payload: unknown) => Response;
  optionsResponse: (req: Request) => Response;
  parseOptionalString: (raw: unknown, maxLen: number) => string | null;
  parseBoolish: (raw: unknown, fallback?: boolean) => boolean;
};

const DEFAULT_OAUTH_SCOPE = "openid profile email offline_access";
const WORKOS_AUTHORIZE_UPSTREAM_URL = "https://api.workos.com/user_management/authorize";
const WORKOS_AUTHENTICATE_UPSTREAM_URL = "https://api.workos.com/user_management/authenticate";

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function resolveOAuthAuthorizeUrl(): string {
  return readEnv("ARX_AUTH_AUTHORIZE_URL");
}

function resolveOAuthTokenUrl(): string {
  return readEnv("ARX_AUTH_TOKEN_URL");
}

function resolveOAuthLogoutUrl(): string {
  return readEnv("ARX_AUTH_LOGOUT_URL");
}

function resolveMagicLinkEndpointUrl(): string {
  return readEnv("ARX_AUTH_MAGIC_LINK_URL");
}

function resolveOAuthClientId(): string {
  return readEnv("ARX_AUTH_CLIENT_ID");
}

function resolveOAuthClientSecret(): string {
  return readEnv("ARX_AUTH_CLIENT_SECRET");
}

function resolveOAuthScope(): string {
  return readEnv("ARX_AUTH_SCOPE") || DEFAULT_OAUTH_SCOPE;
}

function resolveOAuthAudience(): string {
  return readEnv("ARX_AUTH_AUDIENCE");
}

function resolveOAuthProviderQueryKey(): string {
  return readEnv("ARX_AUTH_PROVIDER_QUERY_KEY");
}

function isLikelyWorkOsAuthUrl(value: string): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.trim().toLowerCase();
    const path = parsed.pathname.trim().toLowerCase();
    if (host === "api.workos.com" && path.startsWith("/user_management/")) return true;
    if (host.endsWith(".authkit.app")) return true;
    return false;
  } catch {
    return false;
  }
}

function isLikelyWorkOsAuthConfiguration(params: {
  authorizeUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  issuer?: string;
  jwksUrl?: string;
}): boolean {
  const clientId = String(params.clientId ?? "").trim();
  if (!clientId.startsWith("client_")) return false;
  const candidates = [params.authorizeUrl, params.tokenUrl, params.issuer, params.jwksUrl];
  return candidates.some((value) => isLikelyWorkOsAuthUrl(String(value ?? "")));
}

function normalizeWorkOsProvider(provider: string): string {
  const raw = String(provider ?? "").trim();
  if (!raw) return "GoogleOAuth";
  const normalized = raw.toLowerCase();
  if (normalized === "google") return "GoogleOAuth";
  if (normalized === "authkit") return "authkit";
  return raw;
}

function readBearerToken(req: Request): string | null {
  const raw = String(req.headers.get("authorization") ?? "").trim();
  if (!raw) return null;
  if (!raw.toLowerCase().startsWith("bearer ")) return null;
  const token = raw.slice(7).trim();
  return token || null;
}

function buildAuthProxyHeaders(params: {
  req: Request;
  contentType?: "json" | "form";
  includeJsonContentType?: boolean;
  accessToken?: string | null;
}): Headers {
  const headers = new Headers();
  if (params.contentType === "form") {
    headers.set("Content-Type", "application/x-www-form-urlencoded");
  } else if (params.includeJsonContentType !== false) {
    headers.set("Content-Type", "application/json");
  }
  const bearer = String(params.accessToken ?? "").trim() || readBearerToken(params.req) || null;
  if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
  return headers;
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
  method?: "GET" | "POST";
  payload?: Record<string, unknown>;
  accessToken?: string | null;
  buildCorsHeaders: RegisterRuntimeAuthRoutesArgs["buildCorsHeaders"];
  jsonResponse: RegisterRuntimeAuthRoutesArgs["jsonResponse"];
}): Promise<Response> {
  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(params.upstreamUrl);
  } catch {
    return toAuthMisconfiguredResponse(params.req, params.jsonResponse, "Auth upstream URL is invalid.");
  }

  const hasBody = params.method !== "GET" && typeof params.payload === "object" && params.payload !== null;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl.toString(), {
      method: params.method ?? "POST",
      headers: buildAuthProxyHeaders({
        req: params.req,
        contentType: "json",
        accessToken: params.accessToken ?? null,
        includeJsonContentType: hasBody,
      }),
      ...(hasBody ? { body: JSON.stringify(params.payload) } : null),
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

async function forwardAuthFormRequest(params: {
  req: Request;
  upstreamUrl: string;
  formData: URLSearchParams;
  accessToken?: string | null;
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
      headers: buildAuthProxyHeaders({
        req: params.req,
        contentType: "form",
        accessToken: params.accessToken ?? null,
      }),
      body: params.formData.toString(),
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
    path: "/runtime/auth_begin_google_sign_in",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/runtime/auth_exchange_pkce_code",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/runtime/auth_refresh_session",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/runtime/auth_send_magic_link_otp",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/runtime/auth_logout_session",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/runtime/auth_begin_google_sign_in",
    method: "POST",
    handler: httpAction(async (_ctx, req) => {
      let input: RuntimeAuthBeginGoogleSignInInput;
      try {
        input = (await req.json()) as RuntimeAuthBeginGoogleSignInInput;
      } catch {
        return jsonResponse(req, 400, {
          ok: false,
          code: "invalid_request",
          error: "invalid_request",
          message: "Invalid JSON payload.",
        });
      }

      const authorizeUrlRaw = resolveOAuthAuthorizeUrl();
      const clientId = resolveOAuthClientId();
      const isWorkOsAuth = isLikelyWorkOsAuthConfiguration({
        authorizeUrl: authorizeUrlRaw,
        tokenUrl: resolveOAuthTokenUrl(),
        clientId,
        issuer: readEnv("ARX_AUTH_JWT_ISSUER"),
        jwksUrl: readEnv("ARX_AUTH_JWT_JWKS_URL"),
      });
      const provider = isWorkOsAuth
        ? normalizeWorkOsProvider(parseOptionalString(input.provider, 64) || "GoogleOAuth")
        : parseOptionalString(input.provider, 64) || "google";
      const redirectTo = parseOptionalString(input.redirect_to, 2048);
      const codeChallenge = parseOptionalString(input.code_challenge, 1024);
      const codeChallengeMethod = parseOptionalString(input.code_challenge_method, 64) || "S256";
      const state = parseOptionalString(input.state, 1024);
      if (!redirectTo || !codeChallenge) {
        return jsonResponse(req, 400, {
          ok: false,
          code: "invalid_request",
          error: "invalid_request",
          message: "redirect_to and code_challenge are required.",
        });
      }

      if (!authorizeUrlRaw) {
        return jsonResponse(req, 503, {
          ok: false,
          code: "auth_verifier_misconfigured",
          error: "auth_verifier_misconfigured",
          message: "Auth authorize URL is not configured.",
        });
      }
      if (!clientId) {
        return jsonResponse(req, 503, {
          ok: false,
          code: "auth_verifier_misconfigured",
          error: "auth_verifier_misconfigured",
          message: "Auth client id is not configured.",
        });
      }

      let authUrl: URL;
      try {
        authUrl = new URL(isWorkOsAuth ? WORKOS_AUTHORIZE_UPSTREAM_URL : authorizeUrlRaw);
      } catch {
        return jsonResponse(req, 503, {
          ok: false,
          code: "auth_verifier_misconfigured",
          error: "auth_verifier_misconfigured",
          message: "Auth authorize URL is invalid.",
        });
      }
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectTo);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", codeChallengeMethod);
      if (isWorkOsAuth) {
        if (provider) authUrl.searchParams.set("provider", provider);
      } else {
        authUrl.searchParams.set("scope", resolveOAuthScope());
        const audience = resolveOAuthAudience();
        if (audience) authUrl.searchParams.set("audience", audience);
        const providerQueryKey = resolveOAuthProviderQueryKey();
        if (provider && providerQueryKey) {
          authUrl.searchParams.set(providerQueryKey, provider);
        }
      }
      if (state) authUrl.searchParams.set("state", state);

      return jsonResponse(req, 200, {
        ok: true,
        auth_url: authUrl.toString(),
        provider,
      });
    }),
  });

  http.route({
    path: "/runtime/auth_exchange_pkce_code",
    method: "POST",
    handler: httpAction(async (_ctx, req) => {
      let input: RuntimeAuthPkceExchangeInput;
      try {
        input = (await req.json()) as RuntimeAuthPkceExchangeInput;
      } catch {
        return jsonResponse(req, 400, {
          ok: false,
          code: "invalid_request",
          error: "invalid_request",
          message: "Invalid JSON payload.",
        });
      }

      const authCode = parseOptionalString(input.auth_code, 2048);
      const codeVerifier = parseOptionalString(input.code_verifier, 2048);
      const redirectTo = parseOptionalString(input.redirect_to, 2048);
      if (!authCode || !codeVerifier) {
        return jsonResponse(req, 400, {
          ok: false,
          code: "invalid_request",
          error: "invalid_request",
          message: "auth_code and code_verifier are required.",
        });
      }
      const tokenUrlRaw = resolveOAuthTokenUrl();
      if (!tokenUrlRaw) {
        return jsonResponse(req, 503, {
          ok: false,
          code: "auth_verifier_misconfigured",
          error: "auth_verifier_misconfigured",
          message: "Auth token URL is not configured.",
        });
      }
      const clientId = resolveOAuthClientId();
      if (!clientId) {
        return jsonResponse(req, 503, {
          ok: false,
          code: "auth_verifier_misconfigured",
          error: "auth_verifier_misconfigured",
          message: "Auth client id is not configured.",
        });
      }
      const isWorkOsAuth = isLikelyWorkOsAuthConfiguration({
        authorizeUrl: resolveOAuthAuthorizeUrl(),
        tokenUrl: tokenUrlRaw,
        clientId,
        issuer: readEnv("ARX_AUTH_JWT_ISSUER"),
        jwksUrl: readEnv("ARX_AUTH_JWT_JWKS_URL"),
      });
      const form = new URLSearchParams();
      form.set("grant_type", "authorization_code");
      form.set("code", authCode);
      form.set("code_verifier", codeVerifier);
      form.set("client_id", clientId);
      if (redirectTo) form.set("redirect_uri", redirectTo);
      if (!isWorkOsAuth) {
        const clientSecret = resolveOAuthClientSecret();
        if (clientSecret) form.set("client_secret", clientSecret);
        const audience = resolveOAuthAudience();
        if (audience) form.set("audience", audience);
      }

      return await forwardAuthFormRequest({
        req,
        upstreamUrl: isWorkOsAuth ? WORKOS_AUTHENTICATE_UPSTREAM_URL : tokenUrlRaw,
        formData: form,
        buildCorsHeaders,
        jsonResponse,
      });
    }),
  });

  http.route({
    path: "/runtime/auth_refresh_session",
    method: "POST",
    handler: httpAction(async (_ctx, req) => {
      let input: RuntimeAuthRefreshSessionInput;
      try {
        input = (await req.json()) as RuntimeAuthRefreshSessionInput;
      } catch {
        return jsonResponse(req, 400, {
          ok: false,
          code: "invalid_request",
          error: "invalid_request",
          message: "Invalid JSON payload.",
        });
      }

      const refreshToken = parseOptionalString(input.refresh_token, 4096);
      if (!refreshToken) {
        return jsonResponse(req, 400, {
          ok: false,
          code: "invalid_request",
          error: "invalid_request",
          message: "refresh_token is required.",
        });
      }
      const tokenUrlRaw = resolveOAuthTokenUrl();
      if (!tokenUrlRaw) {
        return jsonResponse(req, 503, {
          ok: false,
          code: "auth_verifier_misconfigured",
          error: "auth_verifier_misconfigured",
          message: "Auth token URL is not configured.",
        });
      }
      const clientId = resolveOAuthClientId();
      if (!clientId) {
        return jsonResponse(req, 503, {
          ok: false,
          code: "auth_verifier_misconfigured",
          error: "auth_verifier_misconfigured",
          message: "Auth client id is not configured.",
        });
      }
      const isWorkOsAuth = isLikelyWorkOsAuthConfiguration({
        authorizeUrl: resolveOAuthAuthorizeUrl(),
        tokenUrl: tokenUrlRaw,
        clientId,
        issuer: readEnv("ARX_AUTH_JWT_ISSUER"),
        jwksUrl: readEnv("ARX_AUTH_JWT_JWKS_URL"),
      });
      const form = new URLSearchParams();
      form.set("grant_type", "refresh_token");
      form.set("refresh_token", refreshToken);
      form.set("client_id", clientId);
      if (!isWorkOsAuth) {
        const clientSecret = resolveOAuthClientSecret();
        if (clientSecret) form.set("client_secret", clientSecret);
        const audience = resolveOAuthAudience();
        if (audience) form.set("audience", audience);
      }

      return await forwardAuthFormRequest({
        req,
        upstreamUrl: isWorkOsAuth ? WORKOS_AUTHENTICATE_UPSTREAM_URL : tokenUrlRaw,
        formData: form,
        buildCorsHeaders,
        jsonResponse,
      });
    }),
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
        method: "POST",
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

  http.route({
    path: "/runtime/auth_logout_session",
    method: "POST",
    handler: httpAction(async (_ctx, req) => {
      let input: RuntimeAuthLogoutInput = {};
      try {
        input = (await req.json()) as RuntimeAuthLogoutInput;
      } catch {
        input = {};
      }

      const scope = parseOptionalString(input.scope, 64) || "local";
      const accessToken = parseOptionalString(input.access_token, 4096) || readBearerToken(req);
      if (!accessToken) {
        return jsonResponse(req, 401, {
          ok: false,
          code: "auth_missing_bearer_token",
          error: "auth_missing_bearer_token",
          message: "Missing bearer token.",
        });
      }

      const logoutUrl = resolveOAuthLogoutUrl();
      if (!logoutUrl) {
        return jsonResponse(req, 200, {
          ok: true,
          logged_out: false,
        });
      }

      return await forwardAuthJsonRequest({
        req,
        upstreamUrl: logoutUrl,
        method: "POST",
        accessToken,
        payload: { scope, access_token: accessToken },
        buildCorsHeaders,
        jsonResponse,
      });
    }),
  });
}
