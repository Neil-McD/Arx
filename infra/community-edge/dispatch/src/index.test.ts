import { afterEach, expect, test, vi } from "vitest";
import edge, { resetEdgeCaches, resolveRoute, safeReturnPath, withShell, withoutPolynetSetCookies, type Env } from "./index";
import { deriveCommunityAppWatchToken } from "../../../../shared/communityAppSession";

const ORIGIN = "https://hello.example.com";
const TOKEN = `pna_${"a".repeat(43)}`;

function env(): Env {
  return {
    POLYNET_API_URL: "https://api.example.convex.site",
    POLYNET_AUTH_URL: "https://polynet.example.com",
    POLYNET_EDGE_SECRET: "edge-secret",
    POLYNET_LIVE_URL: "https://live.example.convex.cloud",
    DEV_ROUTES_JSON: JSON.stringify({ "hello.example.com": { script: "hello", community: "apps-community" } }),
    DEV_USER_WORKER: { fetch: async () => new Response("front end", { status: 200 }) },
  };
}

// The site's own page calling its edge, as a browser marks it.
function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("sec-fetch-site")) headers.set("sec-fetch-site", "same-origin");
  return new Request(`${ORIGIN}${path}`, { ...init, headers });
}

afterEach(() => vi.unstubAllGlobals());

test("unknown community hosts are not served", async () => {
  const res = await edge.fetch(new Request("https://other.example.com/"), env());
  expect(res.status).toBe(404);
});

test("start sends the member to Polynet sign-in with a __Host- state cookie", async () => {
  const res = await edge.fetch(request("/__polynet/auth/start?return=/lessons/3"), env());
  expect(res.status).toBe(302);
  const location = new URL(res.headers.get("location")!);
  expect(location.origin + location.pathname).toBe("https://polynet.example.com/api/auth/community-handoff");
  expect(location.searchParams.get("community")).toBe("apps-community");
  expect(location.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/__polynet/auth/callback`);
  const state = location.searchParams.get("state")!;
  expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const setCookie = res.headers.get("set-cookie")!;
  expect(setCookie).toContain(`__Host-polynet_signin=${state}.${encodeURIComponent("/lessons/3")}`);
  expect(setCookie).toMatch(/HttpOnly/);
  expect(setCookie).toMatch(/^__Host-polynet_signin=[^;]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=600; Secure$/);
  expect(setCookie).not.toMatch(/Domain=/i);
});

test("callback refuses a state mismatch without calling the backend", async () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  const res = await edge.fetch(request(`/__polynet/auth/callback?code=pnh_x&state=${"b".repeat(43)}`, {
    headers: { cookie: `__Host-polynet_signin=${"a".repeat(43)}.%2F` },
  }), env());
  expect(res.status).toBe(400);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("callback swaps the code for an HttpOnly, host-only session and returns to a safe path", async () => {
  const state = "c".repeat(43);
  const fetchSpy = vi.fn(async () => new Response(JSON.stringify({
    ok: true, token: TOKEN, expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  }), { status: 200 }));
  vi.stubGlobal("fetch", fetchSpy);
  const res = await edge.fetch(request(`/__polynet/auth/callback?code=pnh_x&state=${state}`, {
    headers: { cookie: `__Host-polynet_signin=${state}.${encodeURIComponent("//evil.example.com")}` },
  }), env());
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe("/");
  const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://api.example.convex.site/runtime/community_edge/session_exchange");
  expect((init.headers as Record<string, string>)["x-polynet-edge-secret"]).toBe("edge-secret");
  expect(JSON.parse(String(init.body))).toEqual({ code: "pnh_x", state, origin: ORIGIN });
  const cookies = res.headers.get("set-cookie")!;
  expect(cookies).toContain(`__Host-polynet_session=${TOKEN}`);
  expect(cookies).toMatch(/HttpOnly/);
  expect(cookies).toMatch(new RegExp(`^__Host-polynet_session=${TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=\\d+; Secure, __Host-polynet_signin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure$`));
  expect(cookies).not.toMatch(/Domain=/i);
});

test("API calls use only the session cookie and clear it when the backend rejects it", async () => {
  const noCookie = vi.fn();
  vi.stubGlobal("fetch", noCookie);
  const anonymous = await edge.fetch(request("/__polynet/api", {
    method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: "{}",
  }), env());
  expect(anonymous.status).toBe(401);
  expect(noCookie).not.toHaveBeenCalled();

  const upstream = vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 401 }));
  vi.stubGlobal("fetch", upstream);
  const rejected = await edge.fetch(request("/__polynet/api", {
    method: "POST", headers: { cookie: `__Host-polynet_session=${TOKEN}`, authorization: "Bearer pna_forged" }, body: "{}",
  }), env());
  const [, init] = upstream.mock.calls[0] as unknown as [string, RequestInit];
  expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  expect((init.headers as Record<string, string>).Origin).toBe(ORIGIN);
  expect((init.headers as Record<string, string>)["x-polynet-edge-secret"]).toBe("edge-secret");
  expect(rejected.status).toBe(401);
  expect(rejected.headers.get("set-cookie")).toMatch(/__Host-polynet_session=; .*Max-Age=0/);
});

test("a cookie a sibling site plants on the parent domain is never read as the member's session", async () => {
  // Any site on the sites domain can set Domain=polynet.page cookies. Only __Host- names count.
  const upstream = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", upstream);
  const planted = `pna_${"z".repeat(43)}`;
  const legacyOnly = await edge.fetch(request("/__polynet/api", { method: "POST", headers: { cookie: `__polynet_session=${planted}` }, body: "{}" }), env());
  expect(legacyOnly.status).toBe(401);
  expect(upstream).not.toHaveBeenCalled();
  await edge.fetch(request("/__polynet/api", {
    method: "POST", headers: { cookie: `__polynet_session=${planted}; __Host-polynet_session=${TOKEN}` }, body: "{}",
  }), env());
  const [, init] = upstream.mock.calls[0] as unknown as [string, RequestInit];
  expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  // A planted sign-in state can't complete someone else's sign-in either.
  const state = "d".repeat(43);
  const callback = await edge.fetch(request(`/__polynet/auth/callback?code=pnh_x&state=${state}`, {
    headers: { cookie: `__polynet_signin=${state}.%2F` },
  }), env());
  expect(callback.status).toBe(400);
});

test("a sibling site can't use the member's session: member endpoints answer only this site's own pages", async () => {
  // Sibling sites share the sites domain, so the browser sends this site's cookies with their requests.
  const upstream = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", upstream);
  const cookie = `__Host-polynet_session=${TOKEN}`;
  const sibling = { cookie, "sec-fetch-site": "same-site", origin: "https://sibling.example.com" };
  const forged: Array<[string, RequestInit]> = [
    ["/__polynet/auth/logout", { method: "POST" }],
    ["/__polynet/api", { method: "POST", body: "{}" }],
    ["/__polynet/api/anything", { method: "POST", body: "{}" }],
    ["/__polynet/agent", { method: "POST", body: "{}" }],
    ["/__polynet/upload", { method: "POST", body: "x" }],
    ["/__polynet/agent/messages", {}],
    ["/__polynet/account", {}],
    ["/__polynet/auth/session", {}],
    ["/__polynet/files/j97y81p9dam48njv1jqnm1wv4s8gfm67", {}],
  ];
  for (const [path, init] of forged) {
    for (const site of ["same-site", "cross-site", "none"]) {
      const res = await edge.fetch(request(path, { ...init, headers: { ...sibling, "sec-fetch-site": site } }), env());
      expect(res.status, `${site} ${path}`).toBe(403);
      expect(await res.json()).toMatchObject({ ok: false, code: "cross_site_request" });
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  }
  expect(upstream).not.toHaveBeenCalled();

  // Browsers without Fetch Metadata: a write needs this site's Origin; a plain read passes (CORS keeps it unreadable).
  const old = (path: string, init: RequestInit, origin?: string) => edge.fetch(new Request(`${ORIGIN}${path}`, {
    ...init, headers: { cookie, ...(origin ? { origin } : {}) },
  }), env());
  expect((await old("/__polynet/api", { method: "POST", body: "{}" }, "https://sibling.example.com")).status).toBe(403);
  expect((await old("/__polynet/api", { method: "POST", body: "{}" })).status).toBe(403);
  expect((await old("/__polynet/api", { method: "POST", body: "{}" }, ORIGIN)).status).toBe(200);
  expect((await old("/__polynet/account", {})).status).toBe(200);

  // Opening a file link is a navigation, which the opener can't read.
  const opened = await edge.fetch(new Request(`${ORIGIN}/__polynet/files/j97y81p9dam48njv1jqnm1wv4s8gfm67`, {
    headers: { cookie, "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate" },
  }), env());
  expect(opened.status).toBe(200);
  // The SDK on the site's own page is unaffected; sign-in start and the public kit need no check.
  expect((await edge.fetch(request("/__polynet/api", { method: "POST", headers: { cookie }, body: "{}" }), env())).status).toBe(200);
  for (const path of ["/__polynet/auth/start", "/__polynet/sdk.js", "/__polynet/ui.js", "/__polynet/llms.txt"]) {
    expect((await edge.fetch(request(path, { headers: { "sec-fetch-site": "cross-site" } }), env())).status, path).not.toBe(403);
  }
});

test("a site's own responses can't set Polynet's cookies", async () => {
  const headers = new Headers({ "content-type": "text/html" });
  headers.append("set-cookie", `__Host-polynet_session=${TOKEN}; Path=/; Secure`);
  headers.append("set-cookie", "__HOST-Polynet_signin=x; Path=/; Secure");
  headers.append("set-cookie", "__polynet_session=y; Domain=polynet.page");
  headers.append("set-cookie", "theme=dark; Path=/");
  const e = { ...env(), DEV_USER_WORKER: { fetch: async () => new Response("<p>hi</p>", { headers }) } };
  const res = await edge.fetch(request("/"), e);
  expect(res.headers.getSetCookie()).toEqual(["theme=dark; Path=/"]);
  const plain = new Response("ok", { headers: { "set-cookie": "theme=dark" } });
  expect(withoutPolynetSetCookies(plain)).toBe(plain);
});

test("the community's own Worker never receives Polynet's cookies", async () => {
  const seen: string[] = [];
  const e = { ...env(), DEV_USER_WORKER: { fetch: async (req: Request) => { seen.push(req.headers.get("cookie") ?? ""); return new Response("ok"); } } };
  await edge.fetch(request("/", { headers: { cookie: `theme=dark; __Host-polynet_session=${TOKEN}; __Host-polynet_signin=x.%2F; __polynet_session=${TOKEN}` } }), e);
  await edge.fetch(request("/", { headers: { cookie: `__Host-polynet_session=${TOKEN}` } }), e);
  expect(seen).toEqual(["theme=dark", ""]);
});

test("the session endpoint gives every visitor the community's public identity, and a signed-in page its watch-only token", async () => {
  resetEdgeCaches();
  const backend = vi.fn(async () => Response.json({ ok: true, community: { slug: "apps-community", name: "Apps Club", one_liner: "We build.", about: "About us.", member_count: 12 } }));
  vi.stubGlobal("fetch", backend);
  const identity = {
    community: "apps-community", community_name: "Apps Club", community_one_liner: "We build.", community_about: "About us.", member_count: 12,
    join_url: "https://polynet.example.com/c/apps-community", studio_url: "https://polynet.example.com/c/apps-community",
  };
  const anonymous = await (await edge.fetch(request("/__polynet/auth/session"), env())).json();
  expect(anonymous).toEqual({ signed_in: false, ...identity });
  const signedIn = await (await edge.fetch(request("/__polynet/auth/session", { headers: { cookie: `__Host-polynet_session=${TOKEN}` } }), env())).json();
  expect(signedIn).toEqual({
    signed_in: true,
    ...identity,
    live: { url: "https://live.example.convex.cloud", token: await deriveCommunityAppWatchToken(TOKEN) },
  });
  // The identity comes from the backend once (edge secret, by the site's origin), then from the cache.
  expect(backend).toHaveBeenCalledTimes(1);
  const [path, init] = backend.mock.calls[0] as unknown as [string, RequestInit];
  expect(path).toBe("https://api.example.convex.site/runtime/community_edge/public");
  expect((init.headers as Record<string, string>)["x-polynet-edge-secret"]).toBeTruthy();
  expect(JSON.parse(String(init.body))).toEqual({ origin: "https://hello.example.com" });
  expect(JSON.stringify(signedIn)).not.toContain(TOKEN);
});

test("uploads and files go to the backend with the session and edge secret only", async () => {
  const upstream = vi.fn(async () => new Response("ok", { status: 200, headers: { "content-type": "image/png", "x-secret": "no" } }));
  vi.stubGlobal("fetch", upstream);
  const cookie = `__Host-polynet_session=${TOKEN}`;
  expect((await edge.fetch(request("/__polynet/upload", { method: "POST", body: "x" }), env())).status).toBe(401);
  await edge.fetch(request("/__polynet/upload", { method: "POST", body: "png", headers: {
    cookie, "content-type": "image/png", "x-polynet-channel": "general", "x-polynet-idempotency-key": "k", authorization: "Bearer pna_forged",
  } }), env());
  const [uploadUrl, uploadInit] = upstream.mock.calls[0] as unknown as [string, RequestInit];
  expect(uploadUrl).toBe("https://api.example.convex.site/runtime/app/upload");
  expect(uploadInit.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}`, "x-polynet-edge-secret": "edge-secret",
    "x-polynet-channel": "general", "x-polynet-idempotency-key": "k", Origin: ORIGIN });
  const file = await edge.fetch(request("/__polynet/files/j97y81p9dam48njv1jqnm1wv4s8gfm67", { headers: { cookie } }), env());
  const [fileUrl, fileInit] = upstream.mock.calls[1] as unknown as [string, RequestInit];
  expect(fileUrl).toBe("https://api.example.convex.site/runtime/app/file");
  expect(fileInit.headers).toMatchObject({ "x-polynet-attachment-id": "j97y81p9dam48njv1jqnm1wv4s8gfm67" });
  expect(file.headers.get("content-type")).toBe("image/png");
  expect(file.headers.get("x-secret")).toBeNull();
  expect((await edge.fetch(request("/__polynet/files/Not_An-Id", { headers: { cookie } }), env())).status).toBe(404);
  expect(upstream).toHaveBeenCalledTimes(2);
});

test("agent turns stream through with the session and edge secret; history is read the same way", async () => {
  const upstream = vi.fn(async () => new Response("event: done\ndata: {}\n\n", { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" } }));
  vi.stubGlobal("fetch", upstream);
  const cookie = `__Host-polynet_session=${TOKEN}`;
  expect((await edge.fetch(request("/__polynet/agent", { method: "POST", body: "{}" }), env())).status).toBe(401);
  const turn = await edge.fetch(request("/__polynet/agent", { method: "POST", headers: { cookie }, body: JSON.stringify({ text: "hi", message_key: "abcdefgh" }) }), env());
  expect(turn.headers.get("content-type")).toContain("text/event-stream");
  expect(await turn.text()).toContain("event: done");
  const [turnUrl, turnInit] = upstream.mock.calls[0] as unknown as [string, RequestInit];
  expect(turnUrl).toBe("https://api.example.convex.site/runtime/app/agent");
  expect(turnInit.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}`, "x-polynet-edge-secret": "edge-secret", Origin: ORIGIN });
  await edge.fetch(request("/__polynet/agent/messages", { headers: { cookie } }), env());
  expect((upstream.mock.calls[1] as unknown as [string])[0]).toBe("https://api.example.convex.site/runtime/app/agent_messages");
  expect((await edge.fetch(request("/__polynet/agent", { headers: { cookie } }), env())).status).toBe(405);
});

test("community pages are served untransformed, so Cloudflare injects no scripts", async () => {
  const page = (headers: HeadersInit) => ({ ...env(), DEV_USER_WORKER: { fetch: async () => new Response("<html></html>", { headers }) } });
  const html = await edge.fetch(request("/"), page({ "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate" }));
  expect(html.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate, no-transform");
  expect(await html.text()).toBe("<html></html>");
  const bare = await edge.fetch(request("/about"), page({ "content-type": "text/html" }));
  expect(bare.headers.get("cache-control")).toBe("no-transform");
  const css = await edge.fetch(request("/app.css"), page({ "content-type": "text/css", "cache-control": "public, max-age=3600" }));
  expect(css.headers.get("cache-control")).toBe("public, max-age=3600");
});

// Stands in for Cloudflare's HTMLRewriter (absent outside Workers) over a whole document.
class FakeRewriter {
  scripts?: (element: any) => void;
  body?: (element: any) => void;
  docEnd?: (end: any) => void;
  on(selector: string, handlers: { element(element: any): void }) {
    if (selector === "script[src]") this.scripts = handlers.element;
    if (selector === "body") this.body = handlers.element;
    return this;
  }
  onDocument(handlers: { end(end: any): void }) { this.docEnd = handlers.end; return this; }
  transform(response: Response) {
    const run = async () => {
      let html = await response.text();
      for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]*)"/g)) this.scripts!({ getAttribute: () => m[1] });
      let endTag: ((tag: any) => void) | undefined;
      if (/<body\b/.test(html)) this.body!({ onEndTag: (handler: (tag: any) => void) => { endTag = handler; } });
      if (endTag && html.includes("</body>")) {
        const at = html.lastIndexOf("</body>");
        endTag({ before: (content: string) => { html = html.slice(0, at) + content + html.slice(at); } });
      }
      this.docEnd!({ append: (content: string) => { html += content; } });
      return html;
    };
    return new Response(new ReadableStream({ async start(c) { c.enqueue(new TextEncoder().encode(await run())); c.close(); } }), { headers: response.headers });
  }
}

test("the edge adds the shell to every page that doesn't load it, and leaves everything else alone", async () => {
  const tag = '<script type="module" src="/__polynet/ui.js"></script>';
  const page = (html: string, type = "text/html; charset=utf-8") => withShell(new Response(html, { headers: { "content-type": type } }), FakeRewriter as any);
  // A bundled site: Vite moved the ui.js import into its own module.
  expect(await page('<html><body><script type="module" src="/assets/index-abc.js"></script></body></html>').text())
    .toBe(`<html><body><script type="module" src="/assets/index-abc.js"></script>${tag}</body></html>`);
  const already = `<html><head>${tag}</head><body><polynet-account></polynet-account></body></html>`;
  expect(await page(already).text()).toBe(already);
  expect(await page('<html><body><script type="module" src="/__polynet/ui.js?v=2"></script></body></html>').text()).not.toContain(tag);
  expect(await page("<!doctype html><title>Hi</title><p>No body tag").text()).toBe(`<!doctype html><title>Hi</title><p>No body tag${tag}`);
  expect(await page("body { color: red }", "text/css").text()).toBe("body { color: red }");
  // Outside Workers there's no rewriter: the page passes through untouched.
  expect(await withShell(new Response("<html></html>", { headers: { "content-type": "text/html" } })).text()).toBe("<html></html>");
});

test("ui.js puts a shell in the corner of a page that has none, and gives way to one the page places", async () => {
  const source = await (await edge.fetch(request("/__polynet/ui.js"), env())).text();
  expect(source).toContain('shell.setAttribute("data-polynet-fallback", "")');
  expect(source).toContain('document.querySelectorAll("polynet-account[data-polynet-fallback]")');
  expect(source).toContain("position: fixed; top: max(12px, env(safe-area-inset-top)); right: max(12px, env(safe-area-inset-right));");
  // It links out to the member's communities; it never lists them in the page.
  expect(source).toContain('[links.communities, "Your communities"]');
  expect(source).not.toContain("account.communities");
});

test("every site gets the shell (ui.js) and the member's account, read with their session", async () => {
  resetEdgeCaches();
  const ui = await edge.fetch(request("/__polynet/ui.js"), env());
  expect(ui.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
  const source = await ui.text();
  expect(source).toContain('customElements.define("polynet-account"');
  expect(source).toContain('import polynet from "/__polynet/sdk.js"');
  expect(source).not.toContain("https://");

  expect((await edge.fetch(request("/__polynet/account"), env())).status).toBe(401);
  const upstream = vi.fn(async () => Response.json({ ok: true, account: { member: { name: "Sam" }, community: { slug: "apps-community", role: "member" }, links: {} } }));
  vi.stubGlobal("fetch", upstream);
  const res = await edge.fetch(request("/__polynet/account", { headers: { cookie: `__Host-polynet_session=${TOKEN}` } }), env());
  expect(await res.json()).toMatchObject({ ok: true, account: { member: { name: "Sam" } } });
  const [path, init] = upstream.mock.calls[0] as unknown as [string, RequestInit];
  expect(path).toBe("https://api.example.convex.site/runtime/app/account");
  expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  expect((init.headers as Record<string, string>)["x-polynet-edge-secret"]).toBeTruthy();
});

test("every site serves Polynet's blocks as modules; ui.js loads them only where they're placed", async () => {
  for (const name of ["kit", "channels", "chat", "composer", "members", "profile"]) {
    const res = await edge.fetch(request(`/__polynet/blocks/${name}.js`, { headers: { "sec-fetch-site": "cross-site" } }), env());
    expect(res.status, name).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    const source = await res.text();
    expect(source).not.toContain("https://");
    if (name !== "kit") expect(source).toContain('import polynet from "/__polynet/sdk.js"');
  }
  expect(await (await edge.fetch(request("/__polynet/blocks/chat.js"), env())).text()).toContain('customElements.define("polynet-chat"');
  expect(await (await edge.fetch(request("/__polynet/blocks/channels.js"), env())).text()).toContain('customElements.define("polynet-channels"');
  expect(await (await edge.fetch(request("/__polynet/blocks/chat.js"), env())).text()).toContain('from "/__polynet/blocks/composer.js"');
  expect(await (await edge.fetch(request("/__polynet/blocks/composer.js"), env())).text()).toContain("export class Composer");
  expect(await (await edge.fetch(request("/__polynet/blocks/members.js"), env())).text()).toContain('customElements.define("polynet-members"');
  expect(await (await edge.fetch(request("/__polynet/blocks/profile.js"), env())).text()).toContain("export function openProfile");
  // Unknown blocks are Polynet's 404, never the site's own fallback page.
  const site = vi.fn(async () => new Response("<html>site</html>", { headers: { "content-type": "text/html" } }));
  const e = { ...env(), DEV_USER_WORKER: { fetch: site } };
  for (const path of ["/__polynet/blocks/events.js", "/__polynet/blocks/", "/__polynet/blocks/%2e%2e%2fui.js", "/__polynet/blocks/Chat.js", "/__polynet/blocks/chat.js.map", "/__polynet/blocks/constructor.js"]) {
    const res = await edge.fetch(request(path), e);
    expect(res.status, path).toBe(404);
  }
  expect(site).not.toHaveBeenCalled();

  const ui = await (await edge.fetch(request("/__polynet/ui.js"), env())).text();
  expect(ui).toContain('const BLOCKS = { "polynet-channels": "channels", "polynet-chat": "chat", "polynet-members": "members" };');
  expect(ui).toContain('import("/__polynet/blocks/profile.js")');
  expect(ui).toContain('import("/__polynet/blocks/" + BLOCKS[tag] + ".js")');
});

test("polynet.page itself is the front door: a page and the builder guide", async () => {
  const e = { ...env(), POLYNET_SITES_DOMAIN: "polynet.page" };
  const page = await edge.fetch(new Request("https://polynet.page/"), e);
  expect(page.status).toBe(200);
  expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");
  const html = await page.text();
  expect(html).toContain("Read https://polynet.page/llms.txt first.");
  expect(html).not.toContain("{{");
  const guide = await edge.fetch(new Request("https://polynet.page/llms.txt"), e);
  expect(await guide.text()).toContain("npx @polynet/cli deploy --community <slug>");
  expect((await edge.fetch(new Request("https://www.polynet.page/llms.txt"), e)).headers.get("location")).toBe("https://polynet.page/llms.txt");
  expect((await edge.fetch(new Request("https://polynet.page/anything"), e)).status).toBe(404);
  // Community sites are unaffected.
  expect(await (await edge.fetch(request("/"), e)).text()).toBe("front end");
});

test("an address on the sites domain with nothing deployed says how to deploy", async () => {
  resetEdgeCaches();
  const e = { ...env(), POLYNET_SITES_DOMAIN: "polynet.page", DEV_ROUTES_JSON: "{}" };
  const res = await edge.fetch(new Request("https://new-club.polynet.page/"), e);
  expect(res.status).toBe(404);
  expect(await res.text()).toContain("npx @polynet/cli deploy --community new-club");
  expect(await (await edge.fetch(new Request("https://elsewhere.example/"), e)).text()).toBe("Community not found");
});

test("staging shares polynet.page: its front door and unpublished addresses carry the staging suffix", async () => {
  resetEdgeCaches();
  const e = { ...env(), POLYNET_SITES_DOMAIN: "polynet.page", POLYNET_SITES_HOST_SUFFIX: "-staging",
    POLYNET_SITES_FRONT_DOOR: "staging.polynet.page", DEV_ROUTES_JSON: "{}" };
  const page = await edge.fetch(new Request("https://staging.polynet.page/"), e);
  expect(page.status).toBe(200);
  const html = await page.text();
  expect(html).toContain("Read https://staging.polynet.page/llms.txt first.");
  expect(html).toContain("your-community-staging.polynet.page");
  expect((await edge.fetch(new Request("https://staging.polynet.page/llms.txt"), e)).status).toBe(200);
  // The production front door is not staging's.
  expect(await (await edge.fetch(new Request("https://polynet.page/"), e)).text()).toBe("Community not found");
  const unpublished = await edge.fetch(new Request("https://new-club-staging.polynet.page/"), e);
  expect(unpublished.status).toBe(404);
  const text = await unpublished.text();
  expect(text).toContain("npx @polynet/cli deploy --community new-club --staging");
  expect(text).toContain("https://staging.polynet.page/llms.txt");
  expect(await (await edge.fetch(new Request("https://-staging.polynet.page/"), e)).text()).toBe("Community not found");
});

test("hostname lookups read the routes map once, then use a short cache", async () => {
  const get = vi.fn(async (key: string) => key === "host:cached.polynet.page" ? JSON.stringify({ script: "site-cached", community: "cached" }) : null);
  const routes = { get };
  expect(await resolveRoute("Cached.Polynet.Page", { ROUTES: routes } as any)).toEqual({ script: "site-cached", community: "cached" });
  expect(await resolveRoute("cached.polynet.page", { ROUTES: routes } as any)).toEqual({ script: "site-cached", community: "cached" });
  expect(await resolveRoute("unknown.polynet.page", { ROUTES: routes } as any)).toBeNull();
  expect(await resolveRoute("unknown.polynet.page", { ROUTES: routes } as any)).toBeNull();
  expect(get.mock.calls.map(([key]) => key)).toEqual(["host:cached.polynet.page", "host:unknown.polynet.page"]);
});

test("the builder kit is served on every community's domain", async () => {
  const sdk = await edge.fetch(request("/__polynet/sdk.js"), env());
  expect(sdk.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
  expect(await sdk.text()).toContain("export default polynet;");
  const doc = await edge.fetch(request("/__polynet/llms.txt"), env());
  expect(doc.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  expect(await doc.text()).toContain('import polynet from "/__polynet/sdk.js";');
  // The live client comes from this domain too: no third-party script runs with a member's powers.
  const live = await edge.fetch(request("/__polynet/live.js"), env());
  expect(live.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
  const liveSource = await live.text();
  expect(liveSource).toContain("ConvexClient");
  expect(liveSource).not.toContain("sourceMappingURL");
  expect(await (await edge.fetch(request("/__polynet/sdk.js"), env())).text()).not.toContain("https://");
});

test("logout revokes the session and clears the cookie", async () => {
  const revoke = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
  vi.stubGlobal("fetch", revoke);
  const res = await edge.fetch(request("/__polynet/auth/logout", { method: "POST", headers: { cookie: `__Host-polynet_session=${TOKEN}` } }), env());
  expect(res.status).toBe(200);
  expect(JSON.parse(String((revoke.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ token: TOKEN });
  expect(res.headers.get("set-cookie")).toMatch(/__Host-polynet_session=; .*Max-Age=0/);
});

test("return paths stay on the community's own site", () => {
  expect(safeReturnPath("/lessons/3")).toBe("/lessons/3");
  for (const unsafe of ["//evil.example.com", "https://evil.example.com", "/\\evil.example.com", "javascript:alert(1)", null]) {
    expect(safeReturnPath(unsafe)).toBe("/");
  }
});
