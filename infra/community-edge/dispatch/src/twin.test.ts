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
async function openTwin(type: BrowserType, path: string, token: string, siteToken?: string) {
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
  const { browser, page } = await openTwin(chromium, "/messages", TOKEN);
  try {
    const personal = page.locator("polynet-personal");
    await expect.poll(() => personal.getAttribute("state")).toBe("soon");
    expect(await personal.locator("[part=soon]").textContent()).toBe("This page is coming soon.");
    expect(await page.locator("polynet-page .pn-page-heading").textContent()).toBe("Messages");
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
