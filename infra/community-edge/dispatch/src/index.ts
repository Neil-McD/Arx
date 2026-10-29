// Polynet community edge: the one Worker in front of every community front end.
//
//   /__polynet/auth/*  "Sign in with Polynet" for this community's own domain
//   /__polynet/api     same-origin proxy to the Polynet backend, as the signed-in member
//   /__polynet/discover published communities' public cards for <polynet-discover>, anyone, cached
//   /__polynet/blocks/ Polynet's blocks (<polynet-channels>, <polynet-chat> and its composer,
//                      <polynet-members>, the profile panel, <polynet-page>, <polynet-events>,
//                      <polynet-learn>, <polynet-knowledge>, <polynet-ask>, <polynet-discover>), loaded by ui.js
//   /chat, /people[/<handle>], /events[/<event>], /learn[/<course>[/<lesson>]], /knowledge, /ask, /discover
//                      Polynet's standard pages: the site's own file if it has one,
//                      else the site's frame (/frame.html), which <polynet-page> fills
//   /communities, /messages, /settings, /join
//                      the member's own pages: never on the site. They live on its
//                      private twin, <slug>--me<suffix>.<sites domain> (twin.ts),
//                      which draws the site's frame with every script removed, so
//                      only Polynet's code runs there. The site sends them there.
//   /__polynet/me/*    personal data, settings, messages and joining, on the twin only, for its own session
//   everything else    the community's own front end (a user Worker with static assets);
//                      on the twin, a redirect to the site
//
// The member session lives only in an HttpOnly cookie on the community's domain.
// Front-end code never sees a token. Production reaches user Workers through a
// Workers for Platforms dispatch namespace; local dev uses a service binding.

import { SDK_SOURCE } from "./sdk";
import { LLMS_TXT } from "./llms";
import { UI_CSS, UI_SOURCE } from "./ui";
import { EMBED_SOURCE } from "./embed";
import { KIT_SOURCE } from "./blocks/kit";
import { CHANNELS_SOURCE } from "./blocks/channels";
import { CHAT_SOURCE } from "./blocks/chat";
import { COMPOSER_SOURCE } from "./blocks/composer";
import { MEMBERS_SOURCE } from "./blocks/members";
import { PROFILE_SOURCE } from "./blocks/profile";
import { PAGE_SOURCE } from "./blocks/page";
import { EVENTS_SOURCE } from "./blocks/events";
import { LEARN_SOURCE } from "./blocks/learn";
import { KNOWLEDGE_SOURCE } from "./blocks/knowledge";
import { ASK_SOURCE } from "./blocks/ask";
import { DISCOVER_SOURCE } from "./blocks/discover";
import { PERSONAL_SOURCE } from "./blocks/personal";
import { SETTINGS_SOURCE } from "./blocks/settings";
import { MESSAGES_SOURCE } from "./blocks/messages";
import { JOIN_SOURCE } from "./blocks/join";
import { MODERATION_SOURCE } from "./blocks/moderation";
import {
  plainStyleHash, plainTwinPage, stripFrame, twinPageHeaders, twinPolicy, withTwinHeaders, type StripRewriterClass,
} from "./twin";
// The one route table for the standard and personal pages and the one site <-> twin
// host mapping, shared with the site checks, the backend and the CLI.
import {
  personalPage, privateTwinHost, siteHostOfTwin, standardPage, type PersonalPage, type StandardPage,
} from "../../../../packages/polynet-cli/checks.mjs";
// The live-updates client, served from this domain so no community site loads a third-party script.
import LIVE_CLIENT_BUNDLE from "../../node_modules/convex/dist/browser.bundle.js";

// Polynet's blocks, each its own module at /__polynet/blocks/<name>.js (ui.js loads them).
const BLOCKS: Record<string, string> = {
  kit: KIT_SOURCE, channels: CHANNELS_SOURCE, chat: CHAT_SOURCE, composer: COMPOSER_SOURCE, members: MEMBERS_SOURCE, profile: PROFILE_SOURCE,
  page: PAGE_SOURCE, events: EVENTS_SOURCE, learn: LEARN_SOURCE, knowledge: KNOWLEDGE_SOURCE, ask: ASK_SOURCE,
  discover: DISCOVER_SOURCE,
};
// Blocks that only the private twin serves: they read the member's own data.
const TWIN_BLOCKS: Record<string, string> = { personal: PERSONAL_SOURCE, settings: SETTINGS_SOURCE, messages: MESSAGES_SOURCE, join: JOIN_SOURCE, moderation: MODERATION_SOURCE };
const BLOCKS_PREFIX = "/__polynet/blocks/";

const LIVE_CLIENT = LIVE_CLIENT_BUNDLE.replace(/\n\/\/# sourceMappingURL=.*\s*$/, "\n");

type Fetcher = { fetch(request: Request): Promise<Response> };

// Cloudflare's streaming HTML rewriter (a Workers global), as far as the edge uses it.
type RewriterText = { before(content: string, options?: { html?: boolean }): unknown; append(content: string, options?: { html?: boolean }): unknown };
type RewriterElement = {
  getAttribute(name: string): string | null;
  prepend(content: string, options?: { html?: boolean }): unknown;
  setInnerContent(content: string, options?: { html?: boolean }): unknown;
  onEndTag(handler: (tag: RewriterText) => void): void;
};
interface Rewriter {
  on(selector: string, handlers: { element(element: RewriterElement): void }): Rewriter;
  onDocument(handlers: { end(end: RewriterText): void }): Rewriter;
  transform(response: Response): Response;
}
declare const HTMLRewriter: { new (): Rewriter } | undefined;

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
  // Staging shares the domain: sites at <slug>-staging.polynet.page and the
  // front door at staging.polynet.page. Production sets neither.
  POLYNET_SITES_HOST_SUFFIX?: string;
  POLYNET_SITES_FRONT_DOOR?: string;
  DEV_ROUTES_JSON?: string;
  DEV_USER_WORKER?: Fetcher;
}

type Route = { script: string; community: string };

// Where a request landed: the community's site, or its private twin. Both know
// each other's origin (privateOrigin is null where there's no twin, as off the
// sites domain in local dev).
type Place = { twin: boolean; siteOrigin: string; privateOrigin: string | null };

function sitesOf(env: Env): { domain: string; suffix: string } | null {
  const domain = (env.POLYNET_SITES_DOMAIN ?? "").toLowerCase();
  return domain ? { domain, suffix: (env.POLYNET_SITES_HOST_SUFFIX ?? "").toLowerCase() } : null;
}

// The twin's host for a site host, or the site's host for a twin host.
export function twinHostFor(siteHost: string, env: Env): string | null {
  const sites = sitesOf(env);
  return sites ? privateTwinHost(siteHost.toLowerCase(), sites.domain, sites.suffix) : null;
}

export function siteHostForTwin(host: string, env: Env): string | null {
  const sites = sitesOf(env);
  return sites ? siteHostOfTwin(host.toLowerCase(), sites.domain, sites.suffix) : null;
}

const API_PREFIX = "/__polynet/api";
const AUTH_PREFIX = "/__polynet/auth/";
// __Host- cookies are Secure, Path=/ and host-only, and a browser refuses any
// other kind under these names. No sibling site on the sites domain (one that
// sets Domain=polynet.page) can shadow a member's session or fixate them into its own.
const SESSION_COOKIE = "__Host-polynet_session";
const SIGNIN_COOKIE = "__Host-polynet_signin";
// Names the edge used before, and any a sibling site plants: never read, never passed on.
const LEGACY_COOKIE_PREFIX = "__polynet_";
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
const SIGNOUT_TICKET_PATTERN = /^[0-9]{13}\.[A-Za-z0-9_-]{43}$/;
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

// Every community shares the sites domain, which isn't a public suffix, so a
// browser counts sibling sites as the same site and sends this site's SameSite
// cookies with their requests. The member endpoints answer only this site's own
// pages: a sibling can't post, ask the agent, upload or sign out as the member.
const MEMBER_PATHS = new Set([`${AUTH_PREFIX}session`, `${AUTH_PREFIX}logout`, "/__polynet/account", API_PREFIX, AGENT_PATH, AGENT_MESSAGES_PATH, UPLOAD_PATH]);
// The member's own data: only the private twin answers it, only to its own pages.
const PERSONAL_API_PREFIX = "/__polynet/me/";
const MY_COMMUNITIES_PATH = "/__polynet/me/communities";
// Settings and Messages: reads are GET (query: what of the address the backend
// is sent, or null to refuse it); writes are POST with a small JSON body.
type MyRoute = { method: "GET" | "POST"; backend: string; maxBytes: number; query?: (url: URL) => Record<string, unknown> | null };
const MY_SETTINGS: Record<string, MyRoute> = {
  "/__polynet/me/settings": { method: "GET", backend: "/runtime/app/me/settings", maxBytes: 0 },
  "/__polynet/me/handle": { method: "GET", backend: "/runtime/app/me/handle", maxBytes: 0,
    query: (url) => ({ handle: (url.searchParams.get("handle") ?? "").slice(0, 64) }) },
  "/__polynet/me/profile": { method: "POST", backend: "/runtime/app/me/profile", maxBytes: 8 * 1024 },
  "/__polynet/me/avatar/upload": { method: "POST", backend: "/runtime/app/me/avatar_upload", maxBytes: 1024 },
  "/__polynet/me/avatar": { method: "POST", backend: "/runtime/app/me/avatar", maxBytes: 1024 },
  "/__polynet/me/notifications": { method: "POST", backend: "/runtime/app/me/notifications", maxBytes: 1024 },
  "/__polynet/me/leave": { method: "POST", backend: "/runtime/app/me/leave", maxBytes: 1024 },
};
// A conversation by its id, a person by their handle: the only names the page uses.
const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9]{20,40}$/;
const HANDLE_PATTERN = /^@?[A-Za-z0-9_-]{1,32}$/;
const MY_MESSAGES: Record<string, MyRoute> = {
  "/__polynet/me/messages": { method: "GET", backend: "/runtime/app/me/messages", maxBytes: 0, query: () => ({}) },
  "/__polynet/me/messages/conversation": { method: "GET", backend: "/runtime/app/me/messages/conversation", maxBytes: 0, query: (url) => {
    const id = url.searchParams.get("id") ?? "";
    const before = url.searchParams.get("before");
    if (!CONVERSATION_ID_PATTERN.test(id) || (before !== null && !/^[1-9][0-9]{0,9}$/.test(before))) return null;
    return { conversation_id: id, ...(before !== null ? { before_seq: Number(before) } : {}) };
  } },
  "/__polynet/me/messages/start": { method: "GET", backend: "/runtime/app/me/messages/start", maxBytes: 0, query: (url) => {
    const handle = url.searchParams.get("to") ?? "";
    return HANDLE_PATTERN.test(handle) ? { handle } : null;
  } },
  // Text up to Studio's 4,000 characters (each up to 4 bytes), and up to 8 attachments.
  "/__polynet/me/messages/send": { method: "POST", backend: "/runtime/app/me/messages/send", maxBytes: 24 * 1024 },
  "/__polynet/me/messages/upload": { method: "POST", backend: "/runtime/app/me/messages/upload", maxBytes: 1024 },
  "/__polynet/me/messages/read": { method: "POST", backend: "/runtime/app/me/messages/read", maxBytes: 1024 },
  "/__polynet/me/messages/mute": { method: "POST", backend: "/runtime/app/me/messages/mute", maxBytes: 1024 },
  "/__polynet/me/messages/typing": { method: "POST", backend: "/runtime/app/me/messages/typing", maxBytes: 1024 },
  "/__polynet/me/messages/block": { method: "POST", backend: "/runtime/app/me/messages/block", maxBytes: 1024 },
};

// Moderation (owners, admins, moderators; the backend decides): a post to
// remove, by its ref, and the join requests to review, by id.
const INTERACTION_REF_PATTERN = /^interaction:(root|reply):[A-Za-z0-9_-]{1,64}$/;
const MY_MODERATION: Record<string, MyRoute> = {
  "/__polynet/me/moderation/post": { method: "GET", backend: "/runtime/app/me/moderation/post", maxBytes: 0, query: (url) => {
    const ref = url.searchParams.get("ref") ?? "";
    return INTERACTION_REF_PATTERN.test(ref) ? { ref } : null;
  } },
  "/__polynet/me/moderation/remove": { method: "POST", backend: "/runtime/app/me/moderation/remove", maxBytes: 1024 },
  "/__polynet/me/requests": { method: "GET", backend: "/runtime/app/me/requests", maxBytes: 0, query: () => ({}) },
  "/__polynet/me/requests/approve": { method: "POST", backend: "/runtime/app/me/requests/approve", maxBytes: 1024 },
  "/__polynet/me/requests/deny": { method: "POST", backend: "/runtime/app/me/requests/deny", maxBytes: 1024 },
};

// Join: the page reads (GET, signed out too) and acts (small JSON POSTs, signed
// in on the twin). Each action runs Studio's own join, cancel and checkout cores.
const MY_JOIN_PATH = "/__polynet/me/join";
const MY_JOIN: Record<string, MyRoute> = {
  "/__polynet/me/join": { method: "POST", backend: "/runtime/app/me/join/request", maxBytes: 1024 },
  "/__polynet/me/join/cancel": { method: "POST", backend: "/runtime/app/me/join/cancel", maxBytes: 1024 },
  "/__polynet/me/join/checkout": { method: "POST", backend: "/runtime/app/me/join/checkout", maxBytes: 1024 },
  "/__polynet/me/join/finish": { method: "POST", backend: "/runtime/app/me/join/finish", maxBytes: 1024 },
};
// Where a paid plan's checkout may send the member: Stripe's own hosted page only.
const STRIPE_CHECKOUT_PREFIX = "https://checkout.stripe.com/";

function isMemberEndpoint(pathname: string): boolean {
  return MEMBER_PATHS.has(pathname) || pathname.startsWith(`${API_PREFIX}/`) || pathname.startsWith(FILES_PREFIX) || pathname.startsWith(PERSONAL_API_PREFIX);
}

export function fromThisSite(request: Request, url: URL): boolean {
  const readOnly = request.method === "GET" || request.method === "HEAD";
  // Opening a file link is a navigation: the page that started it can't read the file.
  if (readOnly && url.pathname.startsWith(FILES_PREFIX) && request.headers.get("sec-fetch-mode") === "navigate") return true;
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  // Browsers without Fetch Metadata still send Origin on every write.
  const origin = request.headers.get("origin");
  if (origin) return origin === url.origin;
  return readOnly;
}

// The front end's own Worker never receives Polynet's cookies.
export function withoutPolynetCookies(request: Request): Request {
  const kept = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith(`${SESSION_COOKIE}=`) && !part.startsWith(`${SIGNIN_COOKIE}=`) && !part.startsWith(LEGACY_COOKIE_PREFIX));
  const headers = new Headers(request.headers);
  if (kept.length) headers.set("cookie", kept.join("; "));
  else headers.delete("cookie");
  return new Request(request, { headers });
}

// ...and can never set them: a site's response that names a Polynet cookie loses that Set-Cookie.
function isPolynetCookie(setCookie: string): boolean {
  const name = setCookie.split("=", 1)[0].trim().toLowerCase();
  return name.startsWith("__host-polynet_") || name.startsWith(LEGACY_COOKIE_PREFIX);
}

export function withoutPolynetSetCookies(response: Response): Response {
  const cookies = response.headers.getSetCookie();
  if (!cookies.some(isPolynetCookie)) return response;
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  for (const value of cookies) if (!isPolynetCookie(value)) headers.append("set-cookie", value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// Host-only (no Domain attribute), so one community can never read another's.
// The __Host- prefix needs exactly this: Secure, Path=/, no Domain (browsers
// accept Secure on http://localhost too, so local dev works).
function cookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; Secure`;
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

// Discover: every published community's public card, the same for every site,
// read from the backend at most once a minute per isolate. Only these fields
// ever leave the edge, whatever the backend sends.
const DISCOVER_PATH = "/__polynet/discover";
const DISCOVER_CACHE_MS = 60_000;
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
type DiscoverCard = { slug: string; name: string; one_liner: string | null; avatar_url: string | null; member_count: number; site_url: string | null };
let discoverCache: { cards: Promise<DiscoverCard[] | null>; until: number } | null = null;

function discoverCard(raw: unknown): DiscoverCard | null {
  const card = (raw ?? {}) as Record<string, unknown>;
  const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
  const slug = typeof card.slug === "string" && SLUG_PATTERN.test(card.slug) ? card.slug : null;
  if (!slug) return null;
  return {
    slug,
    name: text(card.name, 120) ?? slug,
    one_liner: text(card.one_liner, 300),
    avatar_url: typeof card.avatar_url === "string" && /^https?:\/\//.test(card.avatar_url) ? card.avatar_url : null,
    member_count: Math.max(0, Math.floor(Number(card.member_count) || 0)),
    site_url: typeof card.site_url === "string" ? card.site_url : null,
  };
}

async function readDiscover(env: Env, origin: string): Promise<DiscoverCard[] | null> {
  try {
    const res = await backend(env, "/runtime/community_edge/discover", {
      sites_domain: (env.POLYNET_SITES_DOMAIN ?? "").toLowerCase(), host_suffix: (env.POLYNET_SITES_HOST_SUFFIX ?? "").toLowerCase(),
    }, origin);
    const body = (await res.json().catch(() => null)) as { ok?: boolean; communities?: unknown } | null;
    if (!res.ok || !body?.ok || !Array.isArray(body.communities)) return null;
    return body.communities.map(discoverCard).filter((card): card is DiscoverCard => card !== null);
  } catch {
    return null;
  }
}

// Concurrent misses share one read; a failed read isn't kept, so the next visitor retries.
function discoverCards(env: Env, origin: string): Promise<DiscoverCard[] | null> {
  if (discoverCache && discoverCache.until > Date.now()) return discoverCache.cards;
  const entry = { cards: readDiscover(env, origin), until: Date.now() + DISCOVER_CACHE_MS };
  discoverCache = entry;
  entry.cards.then((cards) => { if (!cards && discoverCache === entry) discoverCache = null; });
  return entry.cards;
}

// Public, so no session and no same-site rule: each card links to that
// community's own site on this sites domain (only the address the edge itself
// would serve it at), else to its public page in Studio. here: this site's own.
async function handleDiscover(request: Request, url: URL, route: Route, env: Env): Promise<Response> {
  if (request.method !== "GET") return json(405, { ok: false, code: "method_not_allowed" });
  const cards = await discoverCards(env, url.origin);
  if (!cards) return json(502, { ok: false, code: "discover_unavailable", message: "Couldn't load communities. Try again." });
  const domain = (env.POLYNET_SITES_DOMAIN ?? "").toLowerCase();
  const suffix = (env.POLYNET_SITES_HOST_SUFFIX ?? "").toLowerCase();
  const communities = cards.map((card) => {
    const site = domain && card.site_url === `https://${card.slug}${suffix}.${domain}` ? card.site_url : null;
    return {
      slug: card.slug, name: card.name, one_liner: card.one_liner, avatar_url: card.avatar_url, member_count: card.member_count,
      url: site ?? new URL(`/c/${encodeURIComponent(card.slug)}`, env.POLYNET_AUTH_URL).toString(),
      has_site: Boolean(site), here: card.slug === route.community,
    };
  });
  return json(200, { ok: true, communities }, { "Cache-Control": "public, max-age=60" });
}

// Tests start each case with empty per-isolate caches.
export function resetEdgeCaches(): void {
  identityCache.clear();
  routeCache.clear();
  discoverCache = null;
}

function backend(env: Env, path: string, body: Record<string, unknown>, origin: string): Promise<Response> {
  return fetch(`${env.POLYNET_API_URL.replace(/\/+$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, "x-polynet-edge-secret": env.POLYNET_EDGE_SECRET },
    body: JSON.stringify(body),
  });
}

// The same sign-in on the site and on its private twin: each origin gets its
// own host-only session through the same Polynet hop (silent for a member
// already signed in to Polynet). The backend records which kind each is.
async function handleAuth(request: Request, url: URL, route: Route, place: Place, env: Env): Promise<Response> {
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
        "Set-Cookie": cookie(SIGNIN_COOKIE, `${state}.${encodeURIComponent(returnPath)}`, SIGNIN_TTL_SECONDS),
      },
    });
  }

  if (action === "callback" && request.method === "GET") {
    const [expectedState, encodedReturn] = String(readCookie(request, SIGNIN_COOKIE) ?? "").split(".");
    const state = url.searchParams.get("state") ?? "";
    const code = url.searchParams.get("code") ?? "";
    const clearSignin = cookie(SIGNIN_COOKIE, "", 0);
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
    headers.append("Set-Cookie", cookie(SESSION_COOKIE, payload.token as string, maxAge));
    headers.append("Set-Cookie", clearSignin);
    return new Response(null, { status: 302, headers });
  }

  if (action === "session" && request.method === "GET") {
    const token = String(readCookie(request, SESSION_COOKIE) ?? "");
    // Joining (open, approval or paid) is the community's own /join, on its
    // private twin (Polynet's join page where a site has no twin); owners and
    // admins manage the community in Studio's community settings.
    const joinUrl = place.privateOrigin ? `${place.privateOrigin}/join` : studioJoinUrl(route, env);
    const studioUrl = new URL(`/c/${encodeURIComponent(route.community)}/settings/community`, env.POLYNET_AUTH_URL).toString();
    const identity = await publicIdentity(env, place.siteOrigin);
    const base = {
      community: route.community,
      // The site and its private twin (the member's own pages), for links between them.
      site_origin: place.siteOrigin,
      private_origin: place.privateOrigin,
      community_name: identity?.name ?? null,
      community_one_liner: identity?.one_liner ?? null,
      community_about: identity?.about ?? null,
      member_count: identity?.member_count ?? null,
      join_url: joinUrl,
      studio_url: studioUrl,
    };
    if (!TOKEN_PATTERN.test(token)) return json(200, { signed_in: false, ...base });
    return json(200, { signed_in: true, ...base, live: { url: env.POLYNET_LIVE_URL, token: await deriveWatchToken(token) } });
  }

  // Signing out of the site signs out of its private twin too, and back. The
  // other origin's cookie only goes away on a visit there, so the answer names
  // it ("then"): its sign-out, with the backend's short-lived ticket for this
  // member, returning to the site (the twin's pages are the member's own).
  if (action === "logout" && request.method === "POST") {
    const token = readCookie(request, SESSION_COOKIE);
    let ticket: string | null = null;
    if (token && TOKEN_PATTERN.test(token)) {
      const revoked = await backend(env, "/runtime/community_edge/session_revoke", { token }, url.origin).catch(() => null);
      const body = revoked?.ok ? ((await revoked.json().catch(() => null)) as { signout_ticket?: unknown } | null) : null;
      ticket = typeof body?.signout_ticket === "string" && SIGNOUT_TICKET_PATTERN.test(body.signout_ticket) ? body.signout_ticket : null;
    }
    const other = place.twin ? place.siteOrigin : place.privateOrigin;
    const back = place.twin ? "/" : safeReturnPath(url.searchParams.get("return"));
    const then = ticket && other ? `${other}${AUTH_PREFIX}signout?ticket=${ticket}&return=${encodeURIComponent(back)}` : null;
    return json(200, { ok: true, ...(then ? { then } : {}) }, { "Set-Cookie": cookie(SESSION_COOKIE, "", 0) });
  }

  // The other half: a top-level visit from the site (or its twin). It ends this
  // origin's session only with a valid ticket for the same member; anything
  // else (a sibling site bouncing a member here) just passes through. Then on
  // to the site.
  if (action === "signout" && request.method === "GET") {
    const token = readCookie(request, SESSION_COOKIE);
    const ticket = url.searchParams.get("ticket") ?? "";
    const headers = new Headers({ Location: `${place.siteOrigin}${safeReturnPath(url.searchParams.get("return"))}`, "Cache-Control": "no-store" });
    if (token && TOKEN_PATTERN.test(token) && SIGNOUT_TICKET_PATTERN.test(ticket)) {
      const revoked = await backend(env, "/runtime/community_edge/session_revoke", { token, ticket }, url.origin).catch(() => null);
      if (revoked?.ok) headers.append("Set-Cookie", cookie(SESSION_COOKIE, "", 0));
    }
    return new Response(null, { status: 302, headers });
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
  if (upstream.status === 401) headers.append("Set-Cookie", cookie(SESSION_COOKIE, "", 0));
  return new Response(upstream.body, { status: upstream.status, headers });
}

// The member's Polynet account for the shell (who they are, their communities,
// Polynet's links), read server-side with the member session.
async function proxyAccount(request: Request, url: URL, env: Env): Promise<Response> {
  if (request.method !== "GET") return json(405, { ok: false, code: "method_not_allowed" });
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || !TOKEN_PATTERN.test(token)) return json(401, { ok: false, code: "sign_in_required" });
  const upstream = await fetch(`${env.POLYNET_API_URL.replace(/\/+$/, "")}/runtime/app/account`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Origin: url.origin, Authorization: `Bearer ${token}`,
      "x-polynet-edge-secret": env.POLYNET_EDGE_SECRET,
    },
    body: "{}",
  });
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  if (upstream.status === 401) headers.append("Set-Cookie", cookie(SESSION_COOKIE, "", 0));
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
  if (upstream.status === 401) out.append("Set-Cookie", cookie(SESSION_COOKIE, "", 0));
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
  if (upstream.status === 401) headers.append("Set-Cookie", cookie(SESSION_COOKIE, "", 0));
  return new Response(upstream.body, { status: upstream.status, headers });
}

// Your communities, for the twin's own page: read server-side with the twin's
// session (the backend refuses any other kind), and only these fields leave
// the edge. Each links to that community's own site on this sites domain, else
// to its page on Polynet; avatars only from Polynet's storage (the page's
// policy allows no other image host).
const ROLES = new Set(["owner", "admin", "moderator", "member"]);
async function proxyMyCommunities(request: Request, url: URL, route: Route, env: Env): Promise<Response> {
  if (request.method !== "GET") return json(405, { ok: false, code: "method_not_allowed" });
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || !TOKEN_PATTERN.test(token)) return json(401, { ok: false, code: "sign_in_required" });
  const sites = sitesOf(env);
  const upstream = await fetch(`${env.POLYNET_API_URL.replace(/\/+$/, "")}/runtime/app/me/communities`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Origin: url.origin, Authorization: `Bearer ${token}`,
      "x-polynet-edge-secret": env.POLYNET_EDGE_SECRET,
    },
    body: JSON.stringify({ sites_domain: sites?.domain ?? "", host_suffix: sites?.suffix ?? "" }),
  });
  const body = (await upstream.json().catch(() => null)) as { ok?: boolean; code?: string; communities?: unknown } | null;
  if (upstream.status === 401) return json(401, { ok: false, code: "sign_in_required" }, { "Set-Cookie": cookie(SESSION_COOKIE, "", 0) });
  if (!upstream.ok || !body?.ok || !Array.isArray(body.communities)) {
    return json(upstream.ok ? 502 : upstream.status, { ok: false, code: typeof body?.code === "string" ? body.code : "communities_unavailable" });
  }
  const storage = storageOrigin(env);
  const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
  const communities = body.communities.flatMap((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const slug = typeof row.slug === "string" && SLUG_PATTERN.test(row.slug) ? row.slug : null;
    if (!slug) return [];
    const site = sites && row.site_url === `https://${slug}${sites.suffix}.${sites.domain}` ? row.site_url : null;
    const avatar = typeof row.avatar_url === "string" && storage && row.avatar_url.startsWith(`${storage}/api/storage/`) ? row.avatar_url : null;
    return [{
      slug, name: text(row.name, 120) ?? slug, role: typeof row.role === "string" && ROLES.has(row.role) ? row.role : "member",
      avatar_url: avatar, url: site ?? new URL(`/c/${encodeURIComponent(slug)}`, env.POLYNET_AUTH_URL).toString(),
      has_site: Boolean(site), here: slug === route.community,
    }];
  });
  return json(200, { ok: true, communities });
}

// Settings, Messages and Join's actions, for the twin's own pages: each call
// forwarded with the twin's session (the backend refuses any other kind and
// runs Studio's own cores), writes only as small same-origin JSON, and only the
// fields the page shows leave the edge.
type Shape = (path: string, answer: Record<string, unknown>, env: Env, place: Place) => Record<string, unknown> | null;
async function proxyMine(request: Request, url: URL, env: Env, place: Place, route: MyRoute, shape: Shape, unavailable: string): Promise<Response> {
  if (request.method !== route.method) return json(405, { ok: false, code: "method_not_allowed" });
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || !TOKEN_PATTERN.test(token)) return json(401, { ok: false, code: "sign_in_required" });
  let body = "{}";
  if (route.method === "POST") {
    // JSON only: a plain form (which any page can send) never reaches a write.
    if (!/^application\/json(;|$)/i.test(request.headers.get("content-type") ?? "")) return json(415, { ok: false, code: "json_required" });
    if (Number(request.headers.get("content-length") ?? 0) > route.maxBytes) return json(413, { ok: false, code: "request_too_large" });
    body = await request.text();
    if (new TextEncoder().encode(body).length > route.maxBytes) return json(413, { ok: false, code: "request_too_large" });
  } else if (route.query) {
    const query = route.query(url);
    if (!query) return json(400, { ok: false, code: "invalid_request" });
    body = JSON.stringify(query);
  }
  const upstream = await fetch(`${env.POLYNET_API_URL.replace(/\/+$/, "")}${route.backend}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Origin: url.origin, Authorization: `Bearer ${token}`,
      "x-polynet-edge-secret": env.POLYNET_EDGE_SECRET,
    },
    body,
  });
  const answer = (await upstream.json().catch(() => null)) as Record<string, unknown> | null;
  if (upstream.status === 401) return json(401, { ok: false, code: "sign_in_required" }, { "Set-Cookie": cookie(SESSION_COOKIE, "", 0) });
  if (!upstream.ok || !answer || answer.ok !== true) {
    const code = typeof answer?.code === "string" && /^[a-z_]{1,64}$/.test(answer.code) ? answer.code : unavailable;
    return json(upstream.ok ? 502 : upstream.status, { ok: false, code });
  }
  const shaped = shape(url.pathname, answer, env, place);
  return shaped ? json(200, { ok: true, ...shaped }) : json(502, { ok: false, code: unavailable });
}

function studioJoinUrl(route: Route, env: Env): string {
  return new URL(`/c/${encodeURIComponent(route.community)}`, env.POLYNET_AUTH_URL).toString();
}

// Join's read: anyone may see the community's pitch and how it lets people in;
// with the twin's session, also where they stand. A session the backend refuses
// reads as signed out (and is cleared), so the pitch still shows.
async function proxyJoinRead(request: Request, url: URL, env: Env, place: Place): Promise<Response> {
  if (request.method !== "GET") return json(405, { ok: false, code: "method_not_allowed" });
  const token = readCookie(request, SESSION_COOKIE);
  const signedIn = Boolean(token && TOKEN_PATTERN.test(token));
  const read = (withSession: boolean) => fetch(`${env.POLYNET_API_URL.replace(/\/+$/, "")}/runtime/app/me/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Origin: url.origin, "x-polynet-edge-secret": env.POLYNET_EDGE_SECRET,
      ...(withSession ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: "{}",
  });
  let upstream = await read(signedIn);
  const cleared = signedIn && upstream.status === 401;
  if (cleared) upstream = await read(false);
  const answer = (await upstream.json().catch(() => null)) as Record<string, unknown> | null;
  const headers: Record<string, string> = cleared ? { "Set-Cookie": cookie(SESSION_COOKIE, "", 0) } : {};
  if (!upstream.ok || !answer || answer.ok !== true) {
    const code = typeof answer?.code === "string" && /^[a-z_]{1,64}$/.test(answer.code) ? answer.code : "join_unavailable";
    return json(upstream.ok ? 502 : upstream.status, { ok: false, code }, headers);
  }
  const shaped = joinView(answer, env, place);
  return shaped ? json(200, { ok: true, ...shaped }, headers) : json(502, { ok: false, code: "join_unavailable" }, headers);
}

// Join: only what the page draws leaves the edge. The community's public face,
// how it lets people in (in Studio's words), where the member stands, and the
// ways onward: into the site (its own sign-in, silent once they're a member),
// and Polynet's account setup.
const JOIN_GATES = new Set(["join", "request_access", "checkout"]);
const JOIN_STATES = new Set(["member", "pending", "denied", "blocked", "visitor"]);
const JOIN_OUTCOMES = new Set(["joined", "approval_pending", "approval_denied", "paid_plan_required"]);
const FINISH_STATUSES = new Set(["joined", "pending", "expired", "not_found"]);
function joinView(answer: Record<string, unknown>, env: Env, place: Place): Record<string, unknown> | null {
  const storage = storageOrigin(env);
  const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
  const community = (answer.community ?? null) as Record<string, unknown> | null;
  const gate = typeof answer.gate === "string" && JOIN_GATES.has(answer.gate) ? answer.gate : null;
  if (!community || !gate) return null;
  const viewer = answer.viewer && typeof answer.viewer === "object" ? answer.viewer as Record<string, unknown> : null;
  const state = viewer && typeof viewer.state === "string" && JOIN_STATES.has(viewer.state) ? viewer.state : null;
  const plans = (Array.isArray(answer.plans) ? answer.plans : []).slice(0, 2).flatMap((raw) => {
    const plan = (raw ?? {}) as Record<string, unknown>;
    const period = plan.billing_period === "monthly" || plan.billing_period === "annual" ? plan.billing_period : null;
    const label = text(plan.label, 80);
    return period && label ? [{ billing_period: period, name: text(plan.name, 120), label }] : [];
  });
  return {
    signed_in: answer.signed_in === true,
    community: {
      name: text(community.name, 120) ?? "", one_liner: text(community.one_liner, 500), about: text(community.about, 4000),
      member_count: Math.max(0, Math.floor(Number(community.member_count) || 0)),
      avatar_url: typeof community.avatar_url === "string" && storage && community.avatar_url.startsWith(`${storage}/api/storage/`) ? community.avatar_url : null,
    },
    gate, available: answer.available === true, action_label: text(answer.action_label, 80) ?? "Join", plans,
    viewer: state ? {
      state, can_request_again: viewer?.can_request_again === true,
      reapply_at: typeof viewer?.reapply_at === "string" && !Number.isNaN(Date.parse(viewer.reapply_at)) ? viewer.reapply_at : null,
      setup_required: viewer?.setup_required === true,
    } : null,
    // Into the site: its own sign-in, which is silent for a member already signed in to Polynet.
    enter_url: `${place.siteOrigin}${AUTH_PREFIX}start?return=${encodeURIComponent("/chat")}`,
    setup_url: new URL("/onboarding", env.POLYNET_AUTH_URL).toString(),
  };
}

function myJoinAnswer(path: string, answer: Record<string, unknown>, env: Env, place: Place): Record<string, unknown> | null {
  if (path === "/__polynet/me/join/checkout") {
    const url = typeof answer.checkout_url === "string" && answer.checkout_url.startsWith(STRIPE_CHECKOUT_PREFIX) ? answer.checkout_url : null;
    return url ? { checkout_url: url } : null;
  }
  const view = joinView(answer, env, place);
  if (!view) return null;
  if (path === "/__polynet/me/join") return { ...view, outcome: typeof answer.outcome === "string" && JOIN_OUTCOMES.has(answer.outcome) ? answer.outcome : null };
  if (path === "/__polynet/me/join/finish") return { ...view, status: typeof answer.status === "string" && FINISH_STATUSES.has(answer.status) ? answer.status : "pending" };
  return view;
}

const SETTINGS_ROLES = new Set(["owner", "admin", "moderator", "member"]);
function mySettingsAnswer(path: string, answer: Record<string, unknown>, env: Env): Record<string, unknown> | null {
  const storage = storageOrigin(env);
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : null);
  const profile = (raw: unknown) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const links = (row.social_links ?? {}) as Record<string, unknown>;
    const avatar = typeof row.avatar_url === "string" && storage && row.avatar_url.startsWith(`${storage}/api/storage/`) ? row.avatar_url : null;
    return {
      display_name: text(row.display_name, 120), handle: text(row.handle, 32), bio: text(row.bio, 500), avatar_url: avatar,
      social_links: { youtube: text(links.youtube, 240) ?? "", x: text(links.x, 240) ?? "", instagram: text(links.instagram, 240) ?? "" },
    };
  };
  const notifications = (raw: unknown) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    return {
      ...(typeof row.muted === "boolean" ? { muted: row.muted } : {}),
      ...(typeof row.weekly_digest === "boolean" ? { weekly_digest: row.weekly_digest } : {}),
    };
  };
  switch (path) {
    case "/__polynet/me/settings": {
      const community = (answer.community ?? {}) as Record<string, unknown>;
      return {
        profile: profile(answer.profile),
        community: { name: text(community.name, 120) ?? "", role: typeof community.role === "string" && SETTINGS_ROLES.has(community.role) ? community.role : "member" },
        notifications: notifications(answer.notifications),
        // The one way out for account-level things: Polynet's own account settings.
        account_url: new URL("/settings/account", env.POLYNET_AUTH_URL).toString(),
      };
    }
    case "/__polynet/me/handle":
      return { available: answer.available === true, status: text(answer.status, 32) ?? "invalid_format", handle: text(answer.handle, 32) };
    case "/__polynet/me/profile":
    case "/__polynet/me/avatar":
      return { profile: profile(answer.profile) };
    case "/__polynet/me/avatar/upload": {
      // The file goes straight to Polynet's storage, nowhere else.
      const upload = typeof answer.upload_url === "string" && storage && answer.upload_url.startsWith(`${storage}/api/storage/upload?`) ? answer.upload_url : null;
      return upload ? { upload_url: upload } : null;
    }
    case "/__polynet/me/notifications":
      return { notifications: notifications(answer.notifications) };
    default:
      return {};
  }
}

// Messages: only what the page draws leaves the edge, whatever the backend
// sends. People by name, handle and avatar; files only at Polynet's storage.
// Only what the moderation pages show: the post being removed (author, text,
// whether it's the member's own) and each request's name, handle and photo.
function myModerationAnswer(path: string, answer: Record<string, unknown>, env: Env): Record<string, unknown> | null {
  const storage = storageOrigin(env);
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : null);
  switch (path) {
    case "/__polynet/me/moderation/post": {
      const post = (answer.post ?? {}) as Record<string, unknown>;
      const ref = typeof post.ref === "string" && INTERACTION_REF_PATTERN.test(post.ref) ? post.ref : null;
      return { post: { ref, author: text(post.author, 120), text: text(post.text, 600), mine: post.mine === true } };
    }
    case "/__polynet/me/requests": {
      const requests = Array.isArray(answer.requests) ? answer.requests.slice(0, 100) : [];
      return {
        paid: answer.paid === true,
        requests: requests.flatMap((raw) => {
          const row = (raw ?? {}) as Record<string, unknown>;
          const id = typeof row.id === "string" && /^[A-Za-z0-9_]{1,64}$/.test(row.id) ? row.id : null;
          if (!id) return [];
          const handle = typeof row.handle === "string" && /^[a-z0-9_-]{1,32}$/.test(row.handle) ? row.handle : null;
          const avatar = typeof row.avatar_url === "string" && storage && row.avatar_url.startsWith(`${storage}/api/storage/`) ? row.avatar_url : null;
          return [{ id, name: text(row.name, 120) ?? "Someone", handle, avatar_url: avatar }];
        }),
      };
    }
    default:
      return {};
  }
}

function myMessagesAnswer(path: string, answer: Record<string, unknown>, env: Env): Record<string, unknown> | null {
  const storage = storageOrigin(env);
  const stored = (value: unknown) => (typeof value === "string" && storage && value.startsWith(`${storage}/api/storage/`) ? value : null);
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : null);
  const count = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));
  const id = (value: unknown) => (typeof value === "string" && CONVERSATION_ID_PATTERN.test(value) ? value : null);
  const person = (raw: unknown) => {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as Record<string, unknown>;
    const handle = typeof row.handle === "string" && /^[a-z0-9_-]{1,32}$/.test(row.handle) ? row.handle : null;
    return { name: text(row.name, 120), handle, avatar_url: stored(row.avatar_url) };
  };
  const conversation = (raw: unknown) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const last = row.last_message && typeof row.last_message === "object" ? row.last_message as Record<string, unknown> : null;
    const conversationId = id(row.id);
    if (!conversationId) return null;
    return {
      id: conversationId, peer: person(row.peer), community_name: text(row.community_name, 120),
      unread_count: count(row.unread_count), muted: row.muted === true, blocked: row.blocked === true,
      last_seq: count(row.last_seq), read_seq: count(row.read_seq), peer_read_seq: count(row.peer_read_seq),
      last_message: last && typeof last.preview === "string"
        ? { preview: last.preview.slice(0, 160), from_me: last.from_me === true, at: text(last.at, 40) } : null,
    };
  };
  const message = (raw: unknown) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const attachments = (Array.isArray(row.attachments) ? row.attachments : []).slice(0, 8).flatMap((item) => {
      const file = (item ?? {}) as Record<string, unknown>;
      const url = stored(file.url);
      return url ? [{
        id: text(file.id, 64) ?? "", name: text(file.name, 256) ?? "attachment", kind: file.kind === "image" ? "image" : "file",
        mime: text(file.mime, 160), size: count(file.size), url,
      }] : [];
    });
    const key = typeof row.client_message_id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(row.client_message_id) ? row.client_message_id : null;
    return {
      id: text(row.id, 64) ?? "", seq: count(row.seq), from_me: row.from_me === true, text: text(row.text, 4000) ?? "",
      attachments, created_at: text(row.created_at, 40) ?? "", client_message_id: key,
    };
  };
  switch (path) {
    case "/__polynet/me/messages":
      return Array.isArray(answer.conversations)
        ? { conversations: answer.conversations.slice(0, 50).map(conversation).filter((row) => row !== null) } : null;
    case "/__polynet/me/messages/conversation": {
      const shaped = conversation(answer.conversation);
      return shaped && Array.isArray(answer.messages)
        ? { conversation: shaped, messages: answer.messages.slice(0, 50).map(message), has_more: answer.has_more === true } : null;
    }
    case "/__polynet/me/messages/start":
      return { conversation_id: id(answer.conversation_id), peer: person(answer.peer) };
    case "/__polynet/me/messages/send": {
      const conversationId = id(answer.conversation_id);
      return conversationId ? { conversation_id: conversationId, message: message(answer.message) } : null;
    }
    case "/__polynet/me/messages/upload": {
      // The file goes straight to Polynet's storage, nowhere else.
      const upload = typeof answer.upload_url === "string" && storage && answer.upload_url.startsWith(`${storage}/api/storage/upload?`) ? answer.upload_url : null;
      return upload ? { upload_url: upload } : null;
    }
    case "/__polynet/me/messages/typing":
      return { typing: answer.typing === true };
    default: {
      // read, mute and block answer with the conversation as it now is.
      const shaped = conversation(answer.conversation);
      return shaped ? { conversation: shaped } : null;
    }
  }
}

// Where Polynet's files (avatars) are served from: the deployment's storage.
function storageOrigin(env: Env): string | null {
  try {
    return new URL(env.POLYNET_LIVE_URL).origin;
  } catch {
    return null;
  }
}

function polynetAsset(body: string, type: string, maxAge: number): Response {
  return new Response(body, {
    headers: { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": `public, max-age=${maxAge}`, "X-Content-Type-Options": "nosniff" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const frontDoorResponse = frontDoor(url, env);
    if (frontDoorResponse) return frontDoorResponse;
    // A private twin is found through its site's route: it never has one of its own.
    const twinOf = siteHostForTwin(url.hostname, env);
    const route = await resolveRoute(twinOf ?? url.hostname, env);
    if (!route) return twinOf ? new Response("Community not found", { status: 404 }) : noSiteYet(url, env);
    const twinHost = twinOf ? null : twinHostFor(url.hostname, env);
    const place: Place = twinOf
      ? { twin: true, siteOrigin: `${url.protocol}//${twinOf}`, privateOrigin: url.origin }
      : { twin: false, siteOrigin: url.origin, privateOrigin: twinHost ? `${url.protocol}//${twinHost}` : null };
    const response = await serve(request, url, route, place, env);
    return place.twin ? withTwinHeaders(response) : response;
  },
};

async function serve(request: Request, url: URL, route: Route, place: Place, env: Env): Promise<Response> {
  // The member's own data never answers on the site, whoever asks.
  if (!place.twin && (url.pathname.startsWith(PERSONAL_API_PREFIX) || Object.keys(TWIN_BLOCKS).some((name) => url.pathname.startsWith(`${BLOCKS_PREFIX}${name}`)))) {
    return json(404, { ok: false, code: "not_found" });
  }
  if (isMemberEndpoint(url.pathname) && !fromThisSite(request, url)) {
    return json(403, { ok: false, code: "cross_site_request", message: "Call this from the community's own site." });
  }
  if (url.pathname.startsWith(AUTH_PREFIX)) return await handleAuth(request, url, route, place, env);
  // The builder kit: the SDK every front end imports, its live client, and its doc.
  if (url.pathname === "/__polynet/live.js") return polynetAsset(LIVE_CLIENT, "text/javascript", 86400);
  if (url.pathname === "/__polynet/sdk.js") return polynetAsset(SDK_SOURCE, "text/javascript", 300);
  if (url.pathname === "/__polynet/llms.txt") return polynetAsset(LLMS_TXT, "text/plain", 300);
  if (url.pathname === MY_COMMUNITIES_PATH) return await proxyMyCommunities(request, url, route, env);
  if (Object.hasOwn(MY_SETTINGS, url.pathname)) return await proxyMine(request, url, env, place, MY_SETTINGS[url.pathname], mySettingsAnswer, "settings_unavailable");
  if (Object.hasOwn(MY_MESSAGES, url.pathname)) return await proxyMine(request, url, env, place, MY_MESSAGES[url.pathname], myMessagesAnswer, "messages_unavailable");
  if (url.pathname === MY_JOIN_PATH && request.method === "GET") return await proxyJoinRead(request, url, env, place);
  if (Object.hasOwn(MY_JOIN, url.pathname)) return await proxyMine(request, url, env, place, MY_JOIN[url.pathname], myJoinAnswer, "join_unavailable");
  if (Object.hasOwn(MY_MODERATION, url.pathname)) return await proxyMine(request, url, env, place, MY_MODERATION[url.pathname], myModerationAnswer, "moderation_unavailable");
  if (url.pathname.startsWith(PERSONAL_API_PREFIX)) return json(404, { ok: false, code: "not_found" });
  if (url.pathname === "/__polynet/account") return await proxyAccount(request, url, env);
  if (url.pathname === DISCOVER_PATH) return await handleDiscover(request, url, route, env);
  if (url.pathname.startsWith(BLOCKS_PREFIX)) {
    const name = /^([a-z]+)\.js$/.exec(url.pathname.slice(BLOCKS_PREFIX.length))?.[1];
    const source = name && Object.hasOwn(BLOCKS, name) ? BLOCKS[name] : name && place.twin && Object.hasOwn(TWIN_BLOCKS, name) ? TWIN_BLOCKS[name] : null;
    if (!source) {
      return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    }
    return polynetAsset(source, "text/javascript", 300);
  }
  if (url.pathname === "/__polynet/embed.js") {
    // Widgets run in frames with an opaque origin; the script must load from there.
    const response = polynetAsset(EMBED_SOURCE, "text/javascript", 300);
    response.headers.set("Access-Control-Allow-Origin", "*");
    return response;
  }
  if (url.pathname === "/__polynet/ui.js") return polynetAsset(UI_SOURCE, "text/javascript", 300);
  if (url.pathname === "/__polynet/ui.css") return polynetAsset(UI_CSS, "text/css", 300);
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
  const read = request.method === "GET" || request.method === "HEAD";
  const personal = read ? personalPage(url.pathname) : null;
  if (place.twin) return await serveTwin(request, url, personal, route, place, worker, env);
  // A personal page asked for on the site: on its twin (unless the site has its own file there).
  if (personal && place.privateOrigin) {
    const own = await worker.fetch(siteRequest(request, url.pathname + url.search, NAVIGATION_HEADERS));
    if (own.status !== 404) return sitePage(own);
    await own.body?.cancel();
    return new Response(null, { status: 302, headers: { Location: `${place.privateOrigin}${url.pathname}${url.search}`, "Cache-Control": "no-store" } });
  }
  // No twin (off the sites domain): Join is Polynet's own join page, unless the site has its own.
  if (personal?.name === "join") {
    const own = await worker.fetch(siteRequest(request, url.pathname + url.search, NAVIGATION_HEADERS));
    if (own.status !== 404) return sitePage(own);
    await own.body?.cancel();
    return new Response(null, { status: 302, headers: { Location: studioJoinUrl(route, env), "Cache-Control": "no-store" } });
  }
  const standard = read ? standardPage(url.pathname) : null;
  if (standard) return await serveStandardPage(request, url, standard, worker, env);
  return sitePage(await worker.fetch(withoutPolynetCookies(request)));
}

// The private twin serves only Polynet's paths (above) and the member's own
// pages; anything else is the site's, so it goes there. Never a script: the
// twin's policy runs only its own.
const SCRIPT_DESTINATIONS = new Set(["script", "worker", "sharedworker", "serviceworker", "audioworklet", "paintworklet"]);
async function serveTwin(
  request: Request, url: URL, personal: PersonalPage | null, route: Route, place: Place, worker: Fetcher, env: Env,
): Promise<Response> {
  const read = request.method === "GET" || request.method === "HEAD";
  if (!personal) {
    if (!read || SCRIPT_DESTINATIONS.has(request.headers.get("sec-fetch-dest") ?? "")) return new Response("Not found", { status: 404 });
    return new Response(null, { status: 302, headers: { Location: `${place.siteOrigin}${url.pathname}${url.search}`, "Cache-Control": "no-store" } });
  }
  // One address per page: /messages/ is /messages.
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    return new Response(null, { status: 307, headers: { Location: url.pathname.slice(0, -1) + url.search, "Cache-Control": "no-store" } });
  }
  // A member's page with no session here yet: the same silent hop the site uses.
  // (A session the backend later refuses shows the page's own sign-in instead, so this never loops.)
  const token = readCookie(request, SESSION_COOKIE);
  if (personal.signIn && (!token || !TOKEN_PATTERN.test(token))) {
    const start = `${AUTH_PREFIX}start?return=${encodeURIComponent(url.pathname + url.search)}`;
    return new Response(null, { status: 302, headers: { Location: start, "Cache-Control": "no-store" } });
  }
  return await serveTwinPage(request, personal, route, place, worker, env);
}

const MAX_FRAME_BYTES = 1024 * 1024;

// A personal page: the site's frame with every script removed, Polynet's shell
// added, under a policy that runs only the twin's own scripts. No frame (or
// none the edge can draw): Polynet's plain page, which works the same.
async function serveTwinPage(
  request: Request, page: PersonalPage, route: Route, place: Place, worker: Fetcher, env: Env,
): Promise<Response> {
  const name = publicIdentity(env, place.siteOrigin).then((identity) => identity?.name ?? null);
  const frameRequest = siteRequest(new Request(`${place.siteOrigin}${page.path}`, request), "/frame", [...NAVIGATION_HEADERS, ...CONDITIONAL_HEADERS]);
  const frame = await worker.fetch(new Request(frameRequest, { method: "GET" }));
  const communityName = await name;
  const title = communityName ? `${page.title} · ${communityName}` : page.title;
  const Rewriter = typeof HTMLRewriter === "undefined" ? undefined : (HTMLRewriter as unknown as StripRewriterClass);
  const storage = storageOrigin(env);
  let html: string | null = null;
  let policy = "";
  if (frame.ok && (frame.headers.get("content-type") ?? "").includes("text/html") && Rewriter) {
    const text = await frame.text();
    if (text.length <= MAX_FRAME_BYTES) {
      const stripped = await stripFrame(new Response(text, { headers: { "Content-Type": "text/html; charset=utf-8" } }), Rewriter, {
        siteOrigin: place.siteOrigin, twinOrigin: place.privateOrigin ?? "", title,
      });
      html = await withShell(new Response(stripped.html, { headers: { "Content-Type": "text/html; charset=utf-8" } }), Rewriter as never).text();
      policy = twinPolicy({ siteOrigin: place.siteOrigin, storageOrigin: storage, styleHashes: stripped.styleHashes, attributeHashes: stripped.attributeHashes });
    }
  } else {
    await frame.body?.cancel();
  }
  if (html === null) {
    html = plainTwinPage({ title, communityName, siteOrigin: place.siteOrigin });
    policy = twinPolicy({ siteOrigin: place.siteOrigin, storageOrigin: storage, styleHashes: [await plainStyleHash()] });
  }
  return new Response(request.method === "HEAD" ? null : html, { status: 200, headers: twinPageHeaders(policy) });
}

// Every page the site serves reaches the member the same way: no Polynet
// cookies set by it, untransformed, with the shell.
function sitePage(response: Response): Response {
  return withShell(untransformed(withoutPolynetSetCookies(response)));
}

// Headers that make a request a browser navigation (a site whose unknown paths
// fall back to index.html answers a navigation with index.html, never 404),
// and those that could make the frame answer 304 or a part of itself.
const NAVIGATION_HEADERS = ["sec-fetch-mode", "sec-fetch-dest"];
const CONDITIONAL_HEADERS = ["if-none-match", "if-modified-since", "if-match", "if-unmodified-since", "if-range", "range"];

function siteRequest(request: Request, path: string, drop: string[]): Request {
  const clean = withoutPolynetCookies(request);
  const headers = new Headers(clean.headers);
  for (const name of drop) headers.delete(name);
  return new Request(new URL(path, request.url).toString(), { method: request.method === "HEAD" ? "HEAD" : "GET", headers });
}

// Polynet's standard pages exist on every site from its first deploy. The
// site's own file at the path wins (asked for as a plain fetch, not a
// navigation, so a single-page app's index.html fallback doesn't count as one).
// Otherwise the site's frame (/frame.html: its header, navigation and footer
// around one <polynet-page>) is served there with status 200, and
// <polynet-page> renders the page inside it. No frame: Polynet says so.
async function serveStandardPage(
  request: Request, url: URL, standard: { page: StandardPage; slash: boolean }, worker: Fetcher, env: Env,
): Promise<Response> {
  const own = await worker.fetch(siteRequest(request, url.pathname + url.search, NAVIGATION_HEADERS));
  if (own.status !== 404) return sitePage(own);
  await own.body?.cancel();
  // One address per page: /chat/ (with no file of its own) is /chat.
  if (standard.slash) {
    return new Response(null, { status: 307, headers: { Location: url.pathname.slice(0, -1) + url.search, "Cache-Control": "no-store" } });
  }
  // The community's name (for the title) is read beside the frame, from a short per-isolate cache.
  const name = publicIdentity(env, url.origin).then((identity) => identity?.name ?? null);
  // html_handling auto-trailing-slash serves /frame.html at /frame (and redirects /frame.html there).
  const frame = await worker.fetch(siteRequest(request, "/frame", [...NAVIGATION_HEADERS, ...CONDITIONAL_HEADERS]));
  const communityName = await name;
  if (!frame.ok || !(frame.headers.get("content-type") ?? "").includes("text/html")) {
    await frame.body?.cancel();
    return frameMissing(standard.page, communityName, env);
  }
  // The body differs per page (its <title>), so the frame file's validators don't apply.
  const headers = new Headers(frame.headers);
  for (const header of ["etag", "last-modified", "content-length"]) headers.delete(header);
  let page = new Response(frame.body, { status: 200, headers });
  if (typeof HTMLRewriter !== "undefined" && page.body && communityName) {
    const title = `${standard.page.title} · ${communityName}`;
    page = new HTMLRewriter().on("head > title", { element(element) { element.setInnerContent(title); } }).transform(page);
  }
  return sitePage(page);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

// A site deployed before frames existed (or one that dropped its frame): a
// clear page, never a blank, with a way home and what the builder should do.
function frameMissing(page: StandardPage, communityName: string | null, env: Env): Response {
  const front = frontDoorHost(env);
  const here = communityName ? escapeHtml(communityName) : "This community";
  const html = FRAME_MISSING_HTML
    .replaceAll("{{TITLE}}", escapeHtml(communityName ? `${page.title} · ${communityName}` : page.title))
    .replaceAll("{{PAGE}}", escapeHtml(page.title))
    .replaceAll("{{HERE}}", here)
    .replace("{{GUIDE}}", front ? ` The guide: <a href="https://${escapeHtml(front)}/llms.txt">https://${escapeHtml(front)}/llms.txt</a>.` : "");
  return new Response(html, {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, no-transform",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'", "X-Content-Type-Options": "nosniff",
    },
  });
}

const FRAME_MISSING_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{TITLE}}</title>
<style>
  :root { color-scheme: light dark; --bg: #fbfaf7; --text: #1c1b19; --muted: #6b6760; }
  @media (prefers-color-scheme: dark) { :root { --bg: #131312; --text: #f1efe9; --muted: #a29d93; } }
  body { margin: 0; background: var(--bg); color: var(--text); font: 17px/1.55 system-ui, sans-serif; }
  main { max-width: 560px; margin: 0 auto; padding: 64px 20px; }
  h1 { font-size: 26px; line-height: 1.25; margin: 0 0 12px; }
  p { margin: 0 0 16px; }
  .muted { color: var(--muted); font-size: 15px; }
  a { color: inherit; }
</style></head>
<body><main>
  <h1>{{PAGE}} isn't on this site yet.</h1>
  <p>{{HERE}} shows its {{PAGE}} page inside its site's own frame, and the site doesn't have one yet.</p>
  <p><a href="/">Go to the home page</a></p>
  <p class="muted">Building this site? Add frame.html (your header, navigation and footer, with one &lt;polynet-page&gt;&lt;/polynet-page&gt; where the page goes) and deploy again.{{GUIDE}}</p>
</main></body></html>
`;

// An address on the sites domain with nothing deployed yet says how to deploy;
// anything else is simply not found.
function noSiteYet(url: URL, env: Env): Response {
  const domain = (env.POLYNET_SITES_DOMAIN ?? "").toLowerCase();
  const suffix = (env.POLYNET_SITES_HOST_SUFFIX ?? "").toLowerCase();
  const host = url.hostname.toLowerCase();
  const ending = `${suffix}.${domain}`;
  if (!domain || !host.endsWith(ending) || host.length === ending.length) return new Response("Community not found", { status: 404 });
  const slug = host.slice(0, -ending.length);
  const staging = suffix ? " --staging" : "";
  const text = `No site is published at ${host} yet.\n\nIf this is your community, build its site and deploy it:\n  npx @polynet/cli deploy --community ${slug}${staging}\n\nStart here: https://${frontDoorHost(env)}/llms.txt\n`;
  return new Response(text, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

function frontDoorHost(env: Env): string {
  return (env.POLYNET_SITES_FRONT_DOOR || env.POLYNET_SITES_DOMAIN || "").toLowerCase();
}

// polynet.page itself (staging.polynet.page on staging): where a founder's AI
// starts. The guide, and a page that says how.
export function frontDoor(url: URL, env: Env): Response | null {
  const domain = (env.POLYNET_SITES_DOMAIN ?? "").toLowerCase();
  const front = frontDoorHost(env);
  const host = url.hostname.toLowerCase();
  const www = front === domain ? `www.${domain}` : null;
  if (!front || (host !== front && host !== www)) return null;
  if (host !== front) return Response.redirect(`https://${front}${url.pathname}${url.search}`, 301);
  if (url.pathname === "/llms.txt" || url.pathname === "/__polynet/llms.txt") {
    return new Response(LLMS_TXT, { headers: {
      "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
  }
  if (url.pathname !== "/") return new Response("Not found", { status: 404 });
  const studio = env.POLYNET_AUTH_URL.replace(/\/+$/, "");
  const example = `your-community${(env.POLYNET_SITES_HOST_SUFFIX ?? "").toLowerCase()}.${domain}`;
  return new Response(FRONT_DOOR_HTML.replaceAll("{{SITE}}", example).replaceAll("{{FRONT}}", front).replaceAll("{{STUDIO}}", studio), {
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
  <p>Your community runs on Polynet: members, payments, posts, events, courses, memory and its AI agent. Its site is yours to design, at <strong>{{SITE}}</strong>.</p>
  <p>Build it with your AI. Tell it:</p>
  <pre>Build my community's site for &lt;your community slug&gt;.
Read https://{{FRONT}}/llms.txt first.</pre>
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

const SHELL_SRC = /^\/__polynet\/ui\.js(\?.*)?$/;
const SHELL_TAG = '<script type="module" src="/__polynet/ui.js"></script>';
const SHELL_STYLE_TAG = '<link rel="stylesheet" href="/__polynet/ui.css">';

// Every page carries the Polynet shell, including one whose bundler moved the
// ui.js import into its own script (a second load is free: modules run once).
// ui.js then puts <polynet-account> in the corner if the page has none. Its
// stylesheet goes first in <head> (or <body>), before anything renders, so a
// block's slot content stays hidden until the block is defined.
export function withShell(response: Response, Rewriter = typeof HTMLRewriter === "undefined" ? undefined : HTMLRewriter): Response {
  if (!Rewriter || !response.body || !(response.headers.get("content-type") ?? "").includes("text/html")) return response;
  let present = false;
  let added = false;
  let styled = false;
  const add = (at: RewriterText, where: "before" | "append") => {
    if (present || added) return;
    added = true;
    at[where](SHELL_TAG, { html: true });
  };
  const style = (at: RewriterElement) => {
    if (styled) return;
    styled = true;
    at.prepend(SHELL_STYLE_TAG, { html: true });
  };
  return new Rewriter()
    .on("script[src]", { element(element) { if (SHELL_SRC.test(element.getAttribute("src") ?? "")) present = true; } })
    .on("head", { element: style })
    .on("body", { element(element) { style(element); element.onEndTag((end) => add(end, "before")); } })
    // A page with no </body> gets them at the very end, which browsers still read as the body.
    .onDocument({ end(end) {
      if (!styled) { styled = true; end.append(SHELL_STYLE_TAG, { html: true }); }
      add(end, "append");
    } })
    .transform(response);
}
