// Polynet community edge: the one Worker in front of every community front end.
//
//   /__polynet/auth/*  "Sign in with Polynet" for this community's own domain
//   /__polynet/api     same-origin proxy to the Polynet backend, as the signed-in member
//   everything else    the community's own front end (a user Worker with static assets)
//
// The member session lives only in an HttpOnly cookie on the community's domain.
// Front-end code never sees a token. Production reaches user Workers through a
// Workers for Platforms dispatch namespace; local dev uses a service binding.

import { SDK_SOURCE } from "./sdk";
import { LLMS_TXT } from "./llms";
// The live-updates client, served from this domain so no community site loads a third-party script.
import LIVE_CLIENT_BUNDLE from "../../node_modules/convex/dist/browser.bundle.js";

const LIVE_CLIENT = LIVE_CLIENT_BUNDLE.replace(/\n\/\/# sourceMappingURL=.*\s*$/, "\n");

type Fetcher = { fetch(request: Request): Promise<Response> };

export interface Env {
  POLYNET_API_URL: string;
  POLYNET_AUTH_URL: string;
  POLYNET_EDGE_SECRET: string;
  // Convex client URL that front ends subscribe to for live updates.
  POLYNET_LIVE_URL: string;
  DISPATCHER?: { get(scriptName: string): Fetcher };
  ROUTES?: { get(key: string): Promise<string | null> };
  // The sites domain (e.g. polynet.page): its apex and www are the front door.
  POLYNET_SITES_DOMAIN?: string;
  DEV_ROUTES_JSON?: string;
  DEV_USER_WORKER?: Fetcher;
}

type Route = { script: string; community: string };

const API_PREFIX = "/__polynet/api";
const AUTH_PREFIX = "/__polynet/auth/";
const SESSION_COOKIE = "__polynet_session";
const SIGNIN_COOKIE = "__polynet_signin";
const MAX_API_BODY_BYTES = 64 * 1024;
const UPLOAD_PATH = "/__polynet/upload";
const AGENT_PATH = "/__polynet/agent";
const AGENT_MESSAGES_PATH = "/__polynet/agent/messages";
const FILES_PREFIX = "/__polynet/files/";
// Largest attachment the backend accepts (video and audio); it enforces exact limits.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const ATTACHMENT_ID_PATTERN = /^[a-z0-9]{20,40}$/;
const SIGNIN_TTL_SECONDS = 600;
const TOKEN_PATTERN = /^pna_[A-Za-z0-9_-]{43}$/;
const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// Hostname lookups are cached briefly per isolate, so a page load costs one KV
// read, not one per file. A new mapping reaches every isolate within this window.
const ROUTE_CACHE_MS = 30_000;
const ROUTE_CACHE_MAX = 5_000;
const routeCache = new Map<string, { raw: string | null; until: number }>();

async function readRoute(host: string, routes: NonNullable<Env["ROUTES"]>): Promise<string | null> {
  const now = Date.now();
  const cached = routeCache.get(host);
  if (cached && cached.until > now) return cached.raw;
  const raw = await routes.get(`host:${host}`);
  if (routeCache.size >= ROUTE_CACHE_MAX) routeCache.clear();
  routeCache.set(host, { raw, until: now + ROUTE_CACHE_MS });
  return raw;
}

export async function resolveRoute(hostname: string, env: Env): Promise<Route | null> {
  const host = hostname.toLowerCase();
  const raw = env.ROUTES ? await readRoute(host, env.ROUTES) : env.DEV_ROUTES_JSON
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

type PublicIdentity = { name: string; one_liner: string | null; about: string | null; member_count: number };
const IDENTITY_CACHE_MS = 60_000;
const identityCache = new Map<string, { identity: PublicIdentity | null; until: number }>();

// The community's public identity (name, one-liner, about, member count), cached
// briefly per isolate. A failure just leaves the fields null.
async function publicIdentity(env: Env, origin: string): Promise<PublicIdentity | null> {
  const cached = identityCache.get(origin);
  if (cached && cached.until > Date.now()) return cached.identity;
  let identity: PublicIdentity | null = null;
  try {
    const res = await backend(env, "/runtime/community_edge/public", { origin }, origin);
    const body = (await res.json().catch(() => null)) as { ok?: boolean; community?: PublicIdentity } | null;
    identity = res.ok && body?.ok && body.community ? body.community : null;
  } catch {
    identity = null;
  }
  if (identityCache.size >= ROUTE_CACHE_MAX) identityCache.clear();
  identityCache.set(origin, { identity, until: Date.now() + IDENTITY_CACHE_MS });
  return identity;
}

// Tests start each case with empty per-isolate caches.
export function resetEdgeCaches(): void {
  identityCache.clear();
  routeCache.clear();
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
    // Joining (open, approval or paid) happens on Polynet's own join page, which
    // is also where owners and admins manage the community (Polynet Studio).
    const joinUrl = new URL(`/c/${encodeURIComponent(route.community)}`, env.POLYNET_AUTH_URL).toString();
    const identity = await publicIdentity(env, url.origin);
    const base = {
      community: route.community,
      community_name: identity?.name ?? null,
      community_one_liner: identity?.one_liner ?? null,
      community_about: identity?.about ?? null,
      member_count: identity?.member_count ?? null,
      join_url: joinUrl,
      studio_url: joinUrl,
    };
    if (!TOKEN_PATTERN.test(token)) return json(200, { signed_in: false, ...base });
    return json(200, { signed_in: true, ...base, live: { url: env.POLYNET_LIVE_URL, token: await deriveWatchToken(token) } });
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

// Uploads and file downloads, forwarded server-side with the member session.
async function proxyFile(request: Request, url: URL, env: Env): Promise<Response> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || !TOKEN_PATTERN.test(token)) return json(401, { ok: false, code: "sign_in_required" });
  const base = env.POLYNET_API_URL.replace(/\/+$/, "");
  const headers: Record<string, string> = {
    Origin: url.origin, Authorization: `Bearer ${token}`, "x-polynet-edge-secret": env.POLYNET_EDGE_SECRET,
  };
  let upstream: Response;
  if (url.pathname === UPLOAD_PATH) {
    if (request.method !== "POST") return json(405, { ok: false, code: "method_not_allowed" });
    if (!request.body || Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) {
      return json(413, { ok: false, code: "request_too_large" });
    }
    for (const name of ["content-type", "content-length", "x-polynet-file-name", "x-polynet-channel", "x-polynet-root-id", "x-polynet-idempotency-key"]) {
      const value = request.headers.get(name);
      if (value) headers[name] = value;
    }
    upstream = await fetch(`${base}/runtime/app/upload`, { method: "POST", headers, body: request.body });
  } else {
    const attachmentId = url.pathname.slice(FILES_PREFIX.length);
    if (request.method !== "GET") return json(405, { ok: false, code: "method_not_allowed" });
    if (!ATTACHMENT_ID_PATTERN.test(attachmentId)) return json(404, { ok: false, code: "file_unavailable" });
    upstream = await fetch(`${base}/runtime/app/file`, {
      method: "POST", headers: { ...headers, "x-polynet-attachment-id": attachmentId },
    });
  }
  const out = new Headers();
  for (const name of ["content-type", "content-disposition", "x-content-type-options", "content-security-policy", "cache-control"]) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  if (upstream.status === 401) out.append("Set-Cookie", cookie(url, SESSION_COOKIE, "", 0));
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

// The member's personal agent: turns stream back as server-sent events.
async function proxyAgent(request: Request, url: URL, env: Env): Promise<Response> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || !TOKEN_PATTERN.test(token)) return json(401, { ok: false, code: "sign_in_required" });
  const history = url.pathname === AGENT_MESSAGES_PATH;
  if (request.method !== (history ? "GET" : "POST")) return json(405, { ok: false, code: "method_not_allowed" });
  const body = history ? "{}" : await request.text();
  if (body.length > MAX_API_BODY_BYTES) return json(413, { ok: false, code: "request_too_large" });
  const upstream = await fetch(`${env.POLYNET_API_URL.replace(/\/+$/, "")}/runtime/app/${history ? "agent_messages" : "agent"}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Origin: url.origin, Authorization: `Bearer ${token}`,
      "x-polynet-edge-secret": env.POLYNET_EDGE_SECRET,
    },
    body,
  });
  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  if (upstream.status === 401) headers.append("Set-Cookie", cookie(url, SESSION_COOKIE, "", 0));
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const frontDoorResponse = frontDoor(url, env);
    if (frontDoorResponse) return frontDoorResponse;
    const route = await resolveRoute(url.hostname, env);
    if (!route) return noSiteYet(url, env);
    if (url.pathname.startsWith(AUTH_PREFIX)) return await handleAuth(request, url, route, env);
    // The builder kit: the SDK every front end imports, its live client, and its doc.
    if (url.pathname === "/__polynet/live.js") {
      return new Response(LIVE_CLIENT, {
        headers: {
          "Content-Type": "text/javascript; charset=utf-8",
          "Cache-Control": "public, max-age=86400",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (url.pathname === "/__polynet/sdk.js" || url.pathname === "/__polynet/llms.txt") {
      const sdk = url.pathname.endsWith(".js");
      return new Response(sdk ? SDK_SOURCE : LLMS_TXT, {
        headers: {
          "Content-Type": sdk ? "text/javascript; charset=utf-8" : "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=300",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`)) {
      return await proxyApi(request, url, env);
    }
    if (url.pathname === AGENT_PATH || url.pathname === AGENT_MESSAGES_PATH) {
      return await proxyAgent(request, url, env);
    }
    if (url.pathname === UPLOAD_PATH || url.pathname.startsWith(FILES_PREFIX)) {
      return await proxyFile(request, url, env);
    }
    const worker = userWorker(route.script, env);
    if (!worker) return new Response("Community front end unavailable", { status: 503 });
    return untransformed(await worker.fetch(withoutPolynetCookies(request)));
  },
};

// An address on the sites domain with nothing deployed yet says how to deploy;
// anything else is simply not found.
function noSiteYet(url: URL, env: Env): Response {
  const domain = (env.POLYNET_SITES_DOMAIN ?? "").toLowerCase();
  const host = url.hostname.toLowerCase();
  if (!domain || !host.endsWith(`.${domain}`)) return new Response("Community not found", { status: 404 });
  const slug = host.slice(0, -(domain.length + 1));
  const text = `No site is published at ${host} yet.\n\nIf this is your community, build its site and deploy it:\n  npx @polynet/cli deploy --community ${slug}\n\nStart here: https://${domain}/llms.txt\n`;
  return new Response(text, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

// polynet.page itself: where a founder's AI starts. The guide, and a page that says how.
export function frontDoor(url: URL, env: Env): Response | null {
  const domain = (env.POLYNET_SITES_DOMAIN ?? "").toLowerCase();
  const host = url.hostname.toLowerCase();
  if (!domain || (host !== domain && host !== `www.${domain}`)) return null;
  if (host !== domain) return Response.redirect(`https://${domain}${url.pathname}${url.search}`, 301);
  if (url.pathname === "/llms.txt" || url.pathname === "/__polynet/llms.txt") {
    return new Response(LLMS_TXT, { headers: {
      "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
  }
  if (url.pathname !== "/") return new Response("Not found", { status: 404 });
  const studio = env.POLYNET_AUTH_URL.replace(/\/+$/, "");
  return new Response(FRONT_DOOR_HTML.replaceAll("{{DOMAIN}}", domain).replaceAll("{{STUDIO}}", studio), {
    headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300, no-transform",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'", "X-Content-Type-Options": "nosniff",
    },
  });
}

const FRONT_DOOR_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Polynet sites</title>
<style>
  :root { color-scheme: light dark; --bg: #fbfaf7; --text: #1c1b19; --muted: #6b6760; --card: #ffffff; --line: #e6e2da; }
  @media (prefers-color-scheme: dark) { :root { --bg: #131312; --text: #f1efe9; --muted: #a29d93; --card: #1c1b19; --line: #2c2a27; } }
  body { margin: 0; background: var(--bg); color: var(--text); font: 17px/1.55 system-ui, sans-serif; }
  main { max-width: 640px; margin: 0 auto; padding: 64px 20px; }
  h1 { font-size: 30px; line-height: 1.2; margin: 0 0 12px; }
  p { color: var(--muted); margin: 0 0 20px; }
  pre { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px; white-space: pre-wrap; font: 15px/1.5 ui-monospace, monospace; color: var(--text); }
  a { color: inherit; }
</style></head>
<body><main>
  <h1>Every Polynet community gets its own site.</h1>
  <p>Your community runs on Polynet: members, payments, posts, events, courses, memory and its AI agent. Its site is yours to design, at <strong>your-community.{{DOMAIN}}</strong>.</p>
  <p>Build it with your AI. Tell it:</p>
  <pre>Build my community's site for &lt;your community slug&gt;.
Read https://{{DOMAIN}}/llms.txt first.</pre>
  <p>Your AI deploys it with <code>npx @polynet/cli deploy</code>. You sign in once, as the community's owner or an admin.</p>
  <p><a href="/llms.txt">The builder guide</a> · <a href="{{STUDIO}}">Polynet</a></p>
</main></body></html>
`;

// Pages reach members exactly as the founder built them: no-transform stops
// Cloudflare from rewriting HTML (for example injecting its analytics script),
// so the only scripts a community page runs are its own and /__polynet/*.
function untransformed(response: Response): Response {
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) return response;
  const headers = new Headers(response.headers);
  const cacheControl = headers.get("cache-control");
  if (!/no-transform/i.test(cacheControl ?? "")) headers.set("cache-control", cacheControl ? `${cacheControl}, no-transform` : "no-transform");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
