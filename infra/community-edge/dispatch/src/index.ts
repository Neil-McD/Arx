// Polynet community edge: the one Worker in front of every community front end.
//
//   /__polynet/auth/*  "Sign in with Polynet" for this community's own domain
//   /__polynet/api     same-origin proxy to the Polynet backend, as the signed-in member
//   everything else    the community's own front end (a user Worker with static assets)
//
// The member session lives only in an HttpOnly cookie on the community's domain.
// Front-end code never sees a token. Production reaches user Workers through a
// Workers for Platforms dispatch namespace; local dev uses a service binding.

type Fetcher = { fetch(request: Request): Promise<Response> };

export interface Env {
  POLYNET_API_URL: string;
  POLYNET_AUTH_URL: string;
  POLYNET_EDGE_SECRET: string;
  // Convex client URL that front ends subscribe to for live updates.
  POLYNET_LIVE_URL: string;
  DISPATCHER?: { get(scriptName: string): Fetcher };
  ROUTES?: { get(key: string): Promise<string | null> };
  DEV_ROUTES_JSON?: string;
  DEV_USER_WORKER?: Fetcher;
}

type Route = { script: string; community: string };

const API_PREFIX = "/__polynet/api";
const AUTH_PREFIX = "/__polynet/auth/";
const SESSION_COOKIE = "__polynet_session";
const SIGNIN_COOKIE = "__polynet_signin";
const MAX_API_BODY_BYTES = 64 * 1024;
const SIGNIN_TTL_SECONDS = 600;
const TOKEN_PATTERN = /^pna_[A-Za-z0-9_-]{43}$/;
const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export async function resolveRoute(hostname: string, env: Env): Promise<Route | null> {
  const host = hostname.toLowerCase();
  const raw = env.ROUTES ? await env.ROUTES.get(`host:${host}`) : env.DEV_ROUTES_JSON
    ? JSON.stringify((JSON.parse(env.DEV_ROUTES_JSON) as Record<string, Route>)[host] ?? null)
    : null;
  if (!raw) return null;
  const route = JSON.parse(raw) as Route | null;
  return route && typeof route.script === "string" && typeof route.community === "string" ? route : null;
}

function userWorker(scriptName: string, env: Env): Fetcher | null {
  if (env.DISPATCHER) return env.DISPATCHER.get(scriptName);
  return env.DEV_USER_WORKER ?? null;
}

function json(status: number, body: Record<string, unknown>, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

export function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

// Watch-only token for live updates, derived from the session token exactly as
// the backend derives it (shared/communityAppSession.ts). It can only ask
// whether a channel the member can read has changed.
export async function deriveWatchToken(sessionToken: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`polynet-watch:${sessionToken}`));
  return `pnw_${base64Url(new Uint8Array(digest))}`;
}

// The front end's own Worker never receives Polynet's cookies.
export function withoutPolynetCookies(request: Request): Request {
  const kept = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith(`${SESSION_COOKIE}=`) && !part.startsWith(`${SIGNIN_COOKIE}=`));
  const headers = new Headers(request.headers);
  if (kept.length) headers.set("cookie", kept.join("; "));
  else headers.delete("cookie");
  return new Request(request, { headers });
}

// Host-only (no Domain attribute), so one community can never read another's.
function cookie(url: URL, name: string, value: string, maxAgeSeconds: number, path = "/"): string {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${name}=${value}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}${secure}`;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomState(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

// Only same-site paths; never a scheme-relative or absolute URL.
export function safeReturnPath(raw: string | null): string {
  const value = String(raw ?? "/");
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

function backend(env: Env, path: string, body: Record<string, unknown>, origin: string): Promise<Response> {
  return fetch(`${env.POLYNET_API_URL.replace(/\/+$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, "x-polynet-edge-secret": env.POLYNET_EDGE_SECRET },
    body: JSON.stringify(body),
  });
}

async function handleAuth(request: Request, url: URL, route: Route, env: Env): Promise<Response> {
  const action = url.pathname.slice(AUTH_PREFIX.length);

  if (action === "start" && request.method === "GET") {
    const state = randomState();
    const returnPath = safeReturnPath(url.searchParams.get("return"));
    const login = new URL("/api/auth/community-handoff", env.POLYNET_AUTH_URL);
    login.searchParams.set("community", route.community);
    login.searchParams.set("redirect_uri", `${url.origin}${AUTH_PREFIX}callback`);
    login.searchParams.set("state", state);
    return new Response(null, {
      status: 302,
      headers: {
        Location: login.toString(),
        "Cache-Control": "no-store",
        "Set-Cookie": cookie(url, SIGNIN_COOKIE, `${state}.${encodeURIComponent(returnPath)}`, SIGNIN_TTL_SECONDS, AUTH_PREFIX),
      },
    });
  }

  if (action === "callback" && request.method === "GET") {
    const [expectedState, encodedReturn] = String(readCookie(request, SIGNIN_COOKIE) ?? "").split(".");
    const state = url.searchParams.get("state") ?? "";
    const code = url.searchParams.get("code") ?? "";
    const clearSignin = cookie(url, SIGNIN_COOKIE, "", 0, AUTH_PREFIX);
    if (!STATE_PATTERN.test(state) || state !== expectedState || !code) {
      return new Response("Sign-in could not be completed. Try again.", {
        status: 400, headers: { "Cache-Control": "no-store", "Set-Cookie": clearSignin },
      });
    }
    const exchanged = await backend(env, "/runtime/community_edge/session_exchange", { code, state, origin: url.origin }, url.origin);
    const payload = (await exchanged.json().catch(() => null)) as { ok?: boolean; token?: string; expires_at?: string } | null;
    if (!exchanged.ok || payload?.ok !== true || !TOKEN_PATTERN.test(String(payload.token ?? ""))) {
      return new Response("Sign-in could not be completed. Try again.", {
        status: 403, headers: { "Cache-Control": "no-store", "Set-Cookie": clearSignin },
      });
    }
    const maxAge = (Date.parse(String(payload.expires_at)) - Date.now()) / 1000;
    const headers = new Headers({ Location: safeReturnPath(decodeURIComponent(encodedReturn ?? "/")), "Cache-Control": "no-store" });
    headers.append("Set-Cookie", cookie(url, SESSION_COOKIE, payload.token as string, maxAge));
    headers.append("Set-Cookie", clearSignin);
    return new Response(null, { status: 302, headers });
  }

  if (action === "session" && request.method === "GET") {
    const token = String(readCookie(request, SESSION_COOKIE) ?? "");
    if (!TOKEN_PATTERN.test(token)) return json(200, { signed_in: false });
    return json(200, { signed_in: true, live: { url: env.POLYNET_LIVE_URL, token: await deriveWatchToken(token) } });
  }

  if (action === "logout" && request.method === "POST") {
    const token = readCookie(request, SESSION_COOKIE);
    if (token && TOKEN_PATTERN.test(token)) {
      await backend(env, "/runtime/community_edge/session_revoke", { token }, url.origin).catch(() => null);
    }
    return json(200, { ok: true }, { "Set-Cookie": cookie(url, SESSION_COOKIE, "", 0) });
  }

  return json(404, { ok: false, code: "not_found" });
}

// The browser talks only to its own community origin. The edge forwards the
// call server-side with the member session from the HttpOnly cookie; any
// Authorization header from page code is ignored.
async function proxyApi(request: Request, url: URL, env: Env): Promise<Response> {
  if (request.method !== "POST") return json(405, { ok: false, code: "method_not_allowed" });
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || !TOKEN_PATTERN.test(token)) return json(401, { ok: false, code: "sign_in_required" });
  const body = await request.text();
  if (body.length > MAX_API_BODY_BYTES) return json(413, { ok: false, code: "request_too_large" });
  const upstream = await fetch(`${env.POLYNET_API_URL.replace(/\/+$/, "")}/runtime/app`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Origin: url.origin, Authorization: `Bearer ${token}`,
      "x-polynet-edge-secret": env.POLYNET_EDGE_SECRET,
    },
    body,
  });
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  if (upstream.status === 401) headers.append("Set-Cookie", cookie(url, SESSION_COOKIE, "", 0));
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const route = await resolveRoute(url.hostname, env);
    if (!route) return new Response("Community not found", { status: 404 });
    if (url.pathname.startsWith(AUTH_PREFIX)) return await handleAuth(request, url, route, env);
    if (url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`)) {
      return await proxyApi(request, url, env);
    }
    const worker = userWorker(route.script, env);
    if (!worker) return new Response("Community front end unavailable", { status: 503 });
    return await worker.fetch(withoutPolynetCookies(request));
  },
};
