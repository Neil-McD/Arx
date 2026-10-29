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
    join_url: "https://polynet.example.com/c/apps-community", studio_url: "https://polynet.example.com/c/apps-community/settings/community",
    // Off the sites domain there's no private twin.
    site_origin: ORIGIN, private_origin: null,
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

test("every site gets the widget helper (embed.js), loadable from a sandboxed frame", async () => {
  resetEdgeCaches();
  const res = await edge.fetch(request("/__polynet/embed.js"), env());
  expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
  expect(res.headers.get("access-control-allow-origin")).toBe("*");
  const source = await res.text();
  expect(source).toContain("window.polynetEmbed = {");
  expect(source).toContain("event.source !== window.parent");
  expect(source).not.toContain("https://");
});

// Stands in for Cloudflare's HTMLRewriter (absent outside Workers) over a whole document.
class FakeRewriter {
  scripts?: (element: any) => void;
  head?: (element: any) => void;
  body?: (element: any) => void;
  title?: (element: any) => void;
  docEnd?: (end: any) => void;
  on(selector: string, handlers: { element(element: any): void }) {
    if (selector === "script[src]") this.scripts = handlers.element;
    if (selector === "head") this.head = handlers.element;
    if (selector === "body") this.body = handlers.element;
    if (selector === "head > title") this.title = handlers.element;
    return this;
  }
  onDocument(handlers: { end(end: any): void }) { this.docEnd = handlers.end; return this; }
  transform(response: Response) {
    const run = async () => {
      let html = await response.text();
      // An element's prepend goes right after its start tag.
      const opened = (name: string, extra: object = {}) => {
        const start = new RegExp(`<${name}\\b[^>]*>`).exec(html);
        if (!start) return null;
        const at = start.index + start[0].length;
        return { prepend: (content: string) => { html = html.slice(0, at) + content + html.slice(at); }, ...extra };
      };
      const title = /(<head\b[\s\S]*?<title\b[^>]*>)([\s\S]*?)(<\/title>)/.exec(html);
      if (title && this.title) {
        this.title({ setInnerContent: (content: string) => {
          const text = content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          html = html.replace(title[0], title[1] + text + title[3]);
        } });
      }
      const head = opened("head");
      if (head && this.head) this.head(head);
      if (this.scripts) for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]*)"/g)) this.scripts({ getAttribute: () => m[1] });
      let endTag: ((tag: any) => void) | undefined;
      const body = opened("body", { onEndTag: (handler: (tag: any) => void) => { endTag = handler; } });
      if (body && this.body) this.body(body);
      if (endTag && html.includes("</body>")) {
        const at = html.lastIndexOf("</body>");
        endTag({ before: (content: string) => { html = html.slice(0, at) + content + html.slice(at); } });
      }
      if (this.docEnd) this.docEnd({ append: (content: string) => { html += content; } });
      return html;
    };
    return new Response(new ReadableStream({ async start(c) { c.enqueue(new TextEncoder().encode(await run())); c.close(); } }), { headers: response.headers });
  }
}

test("the edge adds the shell to every page that doesn't load it, and leaves everything else alone", async () => {
  const tag = '<script type="module" src="/__polynet/ui.js"></script>';
  const link = '<link rel="stylesheet" href="/__polynet/ui.css">';
  const page = (html: string, type = "text/html; charset=utf-8") => withShell(new Response(html, { headers: { "content-type": type } }), FakeRewriter as any);
  // A bundled site: Vite moved the ui.js import into its own module.
  expect(await page('<html><body><script type="module" src="/assets/index-abc.js"></script></body></html>').text())
    .toBe(`<html><body>${link}<script type="module" src="/assets/index-abc.js"></script>${tag}</body></html>`);
  // A page that loads ui.js itself still gets the stylesheet, first in <head>.
  const already = `<html><head><meta charset="utf-8">${tag}</head><body><polynet-account></polynet-account></body></html>`;
  expect(await page(already).text()).toBe(already.replace("<head>", `<head>${link}`));
  expect(await page('<html><body><script type="module" src="/__polynet/ui.js?v=2"></script></body></html>').text()).not.toContain(tag);
  expect(await page("<!doctype html><title>Hi</title><p>No body tag").text()).toBe(`<!doctype html><title>Hi</title><p>No body tag${link}${tag}`);
  expect(await page("body { color: red }", "text/css").text()).toBe("body { color: red }");
  // Outside Workers there's no rewriter: the page passes through untouched.
  expect(await withShell(new Response("<html></html>", { headers: { "content-type": "text/html" } })).text()).toBe("<html></html>");
});

test("ui.css hides every Polynet tag until its script defines it, so slot content never flashes", async () => {
  const res = await edge.fetch(request("/__polynet/ui.css", { headers: { "sec-fetch-site": "cross-site" } }), env());
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("text/css; charset=utf-8");
  expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  const css = await res.text();
  for (const tag of ["polynet-account", "polynet-channels", "polynet-chat", "polynet-members", "polynet-profile", "polynet-page"]) {
    expect(css).toContain(`${tag}:not(:defined)`);
  }
  expect(css).toContain("{ visibility: hidden; }");
});

test("ui.js puts a shell in the corner of a page that has none, and gives way to one the page places", async () => {
  const source = await (await edge.fetch(request("/__polynet/ui.js"), env())).text();
  expect(source).toContain('shell.setAttribute("data-polynet-fallback", "")');
  expect(source).toContain('document.querySelectorAll("polynet-account[data-polynet-fallback]")');
  expect(source).toContain("position: fixed; top: max(12px, env(safe-area-inset-top)); right: max(12px, env(safe-area-inset-right));");
  // It links to the member's communities on the site's private twin (Polynet's list where
  // there's none); it never lists them in the page.
  expect(source).toContain('session.private_origin ? session.private_origin + "/communities" : links.communities');
  expect(source).toContain('[mine, "Your communities", onMine]');
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
  for (const name of ["kit", "channels", "chat", "composer", "members", "profile", "page", "events", "learn", "knowledge", "ask", "discover"]) {
    const res = await edge.fetch(request(`/__polynet/blocks/${name}.js`, { headers: { "sec-fetch-site": "cross-site" } }), env());
    expect(res.status, name).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    const source = await res.text();
    expect(source).not.toContain("https://");
    if (name !== "kit" && name !== "page") expect(source).toContain('import polynet from "/__polynet/sdk.js"');
  }
  expect(await (await edge.fetch(request("/__polynet/blocks/chat.js"), env())).text()).toContain('customElements.define("polynet-chat"');
  expect(await (await edge.fetch(request("/__polynet/blocks/channels.js"), env())).text()).toContain('customElements.define("polynet-channels"');
  expect(await (await edge.fetch(request("/__polynet/blocks/chat.js"), env())).text()).toContain('from "/__polynet/blocks/composer.js"');
  expect(await (await edge.fetch(request("/__polynet/blocks/composer.js"), env())).text()).toContain("export class Composer");
  expect(await (await edge.fetch(request("/__polynet/blocks/members.js"), env())).text()).toContain('customElements.define("polynet-members"');
  expect(await (await edge.fetch(request("/__polynet/blocks/profile.js"), env())).text()).toContain("export function openProfile");
  expect(await (await edge.fetch(request("/__polynet/blocks/page.js"), env())).text()).toContain('customElements.define("polynet-page"');
  for (const name of ["events", "learn", "knowledge", "ask", "discover"]) {
    expect(await (await edge.fetch(request(`/__polynet/blocks/${name}.js`), env())).text()).toContain(`customElements.define("polynet-${name}"`);
  }
  // Unknown blocks are Polynet's 404, never the site's own fallback page.
  const site = vi.fn(async () => new Response("<html>site</html>", { headers: { "content-type": "text/html" } }));
  const e = { ...env(), DEV_USER_WORKER: { fetch: site } };
  for (const path of ["/__polynet/blocks/courses.js", "/__polynet/blocks/", "/__polynet/blocks/%2e%2e%2fui.js", "/__polynet/blocks/Chat.js", "/__polynet/blocks/chat.js.map", "/__polynet/blocks/constructor.js"]) {
    const res = await edge.fetch(request(path), e);
    expect(res.status, path).toBe(404);
  }
  expect(site).not.toHaveBeenCalled();

  const ui = await (await edge.fetch(request("/__polynet/ui.js"), env())).text();
  expect(ui).toContain('"polynet-channels": "channels", "polynet-chat": "chat", "polynet-members": "members", "polynet-page": "page",');
  expect(ui).toContain('"polynet-events": "events", "polynet-learn": "learn", "polynet-knowledge": "knowledge", "polynet-ask": "ask",');
  expect(ui).toContain('"polynet-discover": "discover",');
  expect(ui).toContain('import("/__polynet/blocks/profile.js")');
  expect(ui).toContain('import("/__polynet/blocks/" + BLOCKS[tag] + ".js")');
});

// A deployed site as Cloudflare serves it: its files, /frame.html at /frame
// (auto-trailing-slash), and for a path with no file, index.html to a browser
// navigation (single-page-application) or 404 to anything else.
function deployedSite(files: Record<string, string>) {
  const seen: Array<{ path: string; navigate: boolean; conditional: boolean; cookie: string }> = [];
  const fetch = vi.fn(async (req: Request) => {
    const url = new URL(req.url);
    const navigate = req.headers.get("sec-fetch-mode") === "navigate";
    seen.push({ path: url.pathname + url.search, navigate, conditional: req.headers.has("if-none-match"), cookie: req.headers.get("cookie") ?? "" });
    if (Object.hasOwn(files, url.pathname)) {
      const body = files[url.pathname];
      if (body.startsWith("redirect:")) return new Response(null, { status: 307, headers: { location: body.slice(9) } });
      return new Response(req.method === "HEAD" ? null : body, { headers: { "content-type": "text/html; charset=utf-8", etag: '"frame-etag"', "cache-control": "public, max-age=0, must-revalidate" } });
    }
    if (navigate) return new Response(files["/"] ?? "", { headers: { "content-type": "text/html; charset=utf-8" } });
    return new Response("Not found", { status: 404 });
  });
  return { fetch, seen };
}
const FRAME = '<!doctype html><html lang="en"><head><title>Apps Club</title></head><body><header>Apps</header><main><polynet-page></polynet-page></main></body></html>';
const browse = (path: string, headers: Record<string, string> = {}) =>
  request(path, { headers: { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", ...headers } });
const identity = (name: string) => vi.fn(async () => Response.json({ ok: true, community: { slug: "apps-community", name, one_liner: null, about: null, member_count: 3 } }));

test("standard pages: the site's frame is served at each standard page and the addresses under it, titled, with the shell", async () => {
  resetEdgeCaches();
  vi.stubGlobal("fetch", identity("Apps Club"));
  vi.stubGlobal("HTMLRewriter", FakeRewriter);
  const site = deployedSite({ "/": "<html>home</html>", "/frame": FRAME });
  const e = { ...env(), DEV_USER_WORKER: site };
  for (const [path, title] of [["/chat", "Chat"], ["/chat?channel=crew", "Chat"], ["/people", "People"], ["/people/sam", "People"], ["/people/Sam_R-2", "People"],
    ["/events", "Events"], ["/events/k97abc_D-1~1793570400000", "Events"], ["/learn", "Learn"], ["/learn/start-here~k1", "Learn"],
    ["/learn/start-here~k1/first-steps~k2", "Learn"], ["/knowledge", "Knowledge"], ["/ask", "Ask"], ["/discover", "Discover"]]) {
    site.seen.length = 0;
    const res = await edge.fetch(browse(path, { "if-none-match": '"frame-etag"', cookie: `theme=dark; __Host-polynet_session=${TOKEN}` }), e);
    expect(res.status, path).toBe(200);
    const html = await res.text();
    expect(html).toContain(`<title>${title} · Apps Club</title>`);
    expect(html).toContain("<main><polynet-page></polynet-page></main>");
    // The same injection as every other page: the stylesheet first, ui.js last.
    expect(html).toContain('<head><link rel="stylesheet" href="/__polynet/ui.css">');
    expect(html).toContain('<script type="module" src="/__polynet/ui.js"></script></body>');
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate, no-transform");
    // One body per page, so the frame file's validator isn't passed on.
    expect(res.headers.get("etag")).toBeNull();
    // Asked first for its own page (not as a navigation, so no index.html fallback), then for the frame,
    // never with Polynet's cookies, and the frame never as a conditional request.
    expect(site.seen).toEqual([
      { path, navigate: false, conditional: true, cookie: "theme=dark" },
      { path: "/frame", navigate: false, conditional: false, cookie: "theme=dark" },
    ]);
  }
  // HEAD gets the frame's headers, no body.
  const head = await edge.fetch(request("/people", { method: "HEAD", headers: { "sec-fetch-mode": "navigate" } }), e);
  expect([head.status, head.headers.get("content-type"), await head.text()]).toEqual([200, "text/html; charset=utf-8", ""]);
});

test("standard pages: the site's own page wins; /chat/ without one goes to /chat", async () => {
  resetEdgeCaches();
  vi.stubGlobal("fetch", identity("Apps Club"));
  vi.stubGlobal("HTMLRewriter", FakeRewriter);
  const site = deployedSite({ "/": "<html>home</html>", "/frame": FRAME, "/chat": "<html><body>our own chat</body></html>", "/people/": "<html><body>our crew</body></html>", "/people": "redirect:/people/",
    "/events": "<html><body>our calendar</body></html>", "/ask": "<html><body>our oracle</body></html>" });
  const e = { ...env(), DEV_USER_WORKER: site };
  const own = await edge.fetch(browse("/chat"), e);
  expect(own.status).toBe(200);
  expect(await own.text()).toBe('<html><body><link rel="stylesheet" href="/__polynet/ui.css">our own chat<script type="module" src="/__polynet/ui.js"></script></body></html>');
  // people/index.html: Cloudflare's own redirect to /people/ passes through, and /people/ is the site's.
  const redirect = await edge.fetch(browse("/people"), e);
  expect([redirect.status, redirect.headers.get("location")]).toEqual([307, "/people/"]);
  expect(await (await edge.fetch(browse("/people/"), e)).text()).toContain("our crew");
  expect(await (await edge.fetch(browse("/events"), e)).text()).toContain("our calendar");
  expect(await (await edge.fetch(browse("/ask"), e)).text()).toContain("our oracle");
  expect(site.seen.map((s) => s.path)).not.toContain("/frame");
  // Its own /events page doesn't cover the addresses under it: those are the frame, where <polynet-page> shows the event.
  const event = await edge.fetch(browse("/events/k1~1793570400000"), e);
  expect([event.status, await event.text()]).toEqual([200, expect.stringContaining("<polynet-page></polynet-page>")]);

  const bare = deployedSite({ "/": "<html>home</html>", "/frame": FRAME });
  for (const [path, to] of [["/chat/", "/chat"], ["/people/sam/?x=1", "/people/sam?x=1"], ["/learn/a~k1/b~k2/", "/learn/a~k1/b~k2"], ["/knowledge/", "/knowledge"]]) {
    const res = await edge.fetch(browse(path), { ...env(), DEV_USER_WORKER: bare });
    expect([res.status, res.headers.get("location")], path).toEqual([307, to]);
  }
});

test("standard pages on a site with no frame: Polynet's page says so, never a blank", async () => {
  resetEdgeCaches();
  vi.stubGlobal("fetch", identity("Apps <Club>"));
  const site = deployedSite({ "/": "<html>home</html>" });
  const res = await edge.fetch(browse("/people/sam"), { ...env(), POLYNET_SITES_DOMAIN: "polynet.page", DEV_USER_WORKER: site });
  expect(res.status).toBe(404);
  expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
  expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; style-src 'unsafe-inline'");
  const html = await res.text();
  expect(html).toContain("<title>People · Apps &#60;Club&#62;</title>");
  expect(html).toContain("<h1>People isn't on this site yet.</h1>");
  expect(html).toContain("Add frame.html");
  expect(html).toContain('<a href="/">Go to the home page</a>');
  expect(html).toContain("https://polynet.page/llms.txt");
  expect(html).not.toContain("{{");
  expect(html).not.toContain("<html>home</html>");
});

test("standard pages never shadow Polynet's paths, the site's files, other methods or what isn't a handle", async () => {
  resetEdgeCaches();
  vi.stubGlobal("fetch", identity("Apps Club"));
  const site = deployedSite({ "/": "<html>home</html>", "/frame": FRAME, "/people/photo.jpg": "jpg" });
  const e = { ...env(), DEV_USER_WORKER: site };
  for (const path of ["/people/a.b", "/people/x/y", `/people/${"a".repeat(33)}`, "/people/s%20m", "/people/@sam", "/people/photo.jpg", "/chat/app.js", "/chats", "/Chat", "/frame",
    // Not an event, course or lesson address: the site's own (a file, or its client-side routes).
    "/events/123", "/events/k1~x", "/events/k1~1/more", "/events/photo.jpg", "/learn/intro", "/learn/Intro~k1", "/learn/a~k1/b~k2/c~k3", "/learn/a~k1/notes.md",
    "/knowledge/x", "/ask/anything", "/eventsx", "/Learn", "/discover/trail-club"]) {
    site.seen.length = 0;
    const res = await edge.fetch(browse(path), e);
    // Straight to the site, as the browser asked (a navigation keeps its index.html fallback).
    expect(site.seen, path).toEqual([{ path, navigate: true, conditional: false, cookie: "" }]);
    expect(res.status, path).toBe(200);
  }
  site.seen.length = 0;
  await edge.fetch(request("/chat", { method: "POST", body: "x", headers: { "sec-fetch-mode": "navigate" } }), e);
  expect(site.seen).toEqual([{ path: "/chat", navigate: true, conditional: false, cookie: "" }]);
  site.seen.length = 0;
  expect((await edge.fetch(request("/__polynet/ui.js"), e)).status).toBe(200);
  expect((await edge.fetch(request("/__polynet/blocks/page.js"), e)).status).toBe(200);
  expect(site.seen).toEqual([]);
});

// Published communities as the backend lists them for Discover.
const discoverBackend = (communities: unknown[]) => vi.fn(async (url: string) => {
  if (url.endsWith("/runtime/community_edge/discover")) return Response.json({ ok: true, communities });
  return Response.json({ ok: true, community: { slug: "apps-community", name: "Apps Club", one_liner: null, about: null, member_count: 3 } });
});
const discoverCalls = (backend: ReturnType<typeof discoverBackend>) =>
  backend.mock.calls.filter(([url]) => String(url).endsWith("/runtime/community_edge/discover"));

test("discover: anyone gets published communities' public cards, each linking to its own site on this domain or to Polynet", async () => {
  resetEdgeCaches();
  const backend = discoverBackend([
    { slug: "apps-community", name: "Apps Club", one_liner: "We build.", avatar_url: "https://files.example.com/a.png", member_count: 3,
      site_url: "https://apps-community-staging.polynet.page", owner_email: "never@example.com", about: "not on a card" },
    { slug: "trail-club", name: "Trail Club", one_liner: null, avatar_url: "javascript:alert(1)", member_count: 12.7, site_url: null },
    // A site address that isn't this edge's own for that community never becomes a link.
    { slug: "sneaky", name: "Sneaky", one_liner: null, avatar_url: null, member_count: 1, site_url: "https://evil.example.com" },
    { slug: "../admin", name: "Bad slug", site_url: null },
    "not a card",
  ]);
  vi.stubGlobal("fetch", backend);
  const e = { ...env(), POLYNET_SITES_DOMAIN: "polynet.page", POLYNET_SITES_HOST_SUFFIX: "-staging" };
  // Signed out, from anywhere: it's public.
  const res = await edge.fetch(request("/__polynet/discover", { headers: { "sec-fetch-site": "cross-site" } }), e);
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("public, max-age=60");
  expect(res.headers.get("set-cookie")).toBeNull();
  expect(await res.json()).toEqual({ ok: true, communities: [
    { slug: "apps-community", name: "Apps Club", one_liner: "We build.", avatar_url: "https://files.example.com/a.png", member_count: 3,
      url: "https://apps-community-staging.polynet.page", has_site: true, here: true },
    { slug: "trail-club", name: "Trail Club", one_liner: null, avatar_url: null, member_count: 12,
      url: "https://polynet.example.com/c/trail-club", has_site: false, here: false },
    { slug: "sneaky", name: "Sneaky", one_liner: null, avatar_url: null, member_count: 1,
      url: "https://polynet.example.com/c/sneaky", has_site: false, here: false },
  ] });
  // The backend is asked with the edge secret and this edge's sites domain, never a member's session.
  const [[url, init]] = discoverCalls(backend) as unknown as Array<[string, RequestInit]>;
  expect(url).toBe("https://api.example.convex.site/runtime/community_edge/discover");
  expect((init.headers as Record<string, string>)["x-polynet-edge-secret"]).toBe("edge-secret");
  expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  expect(JSON.parse(String(init.body))).toEqual({ sites_domain: "polynet.page", host_suffix: "-staging" });
  // Writes aren't a thing here.
  expect((await edge.fetch(request("/__polynet/discover", { method: "POST", body: "{}" }), e)).status).toBe(405);
});

test("discover: read from the backend at most once a minute; a failed read isn't kept", async () => {
  resetEdgeCaches();
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    const failing = vi.fn(async () => Response.json({ ok: false, code: "edge_unauthorized" }, { status: 401 }));
    vi.stubGlobal("fetch", failing);
    const down = await edge.fetch(request("/__polynet/discover"), env());
    expect([down.status, await down.json()]).toEqual([502, { ok: false, code: "discover_unavailable", message: "Couldn't load communities. Try again." }]);
    expect(down.headers.get("cache-control")).toBe("no-store");

    const backend = discoverBackend([{ slug: "trail-club", name: "Trail Club", member_count: 2, site_url: null }]);
    vi.stubGlobal("fetch", backend);
    // No sites domain (local dev): every card links to Polynet.
    const first = await (await edge.fetch(request("/__polynet/discover"), env())).json();
    expect(first.communities[0]).toMatchObject({ url: "https://polynet.example.com/c/trail-club", has_site: false });
    await Promise.all([1, 2, 3].map(() => edge.fetch(request("/__polynet/discover"), env())));
    expect(discoverCalls(backend)).toHaveLength(1);
    vi.setSystemTime(Date.now() + 61_000);
    await edge.fetch(request("/__polynet/discover"), env());
    expect(discoverCalls(backend)).toHaveLength(2);
  } finally {
    vi.useRealTimers();
  }
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
  const revoke = vi.fn(async () => new Response(JSON.stringify({ ok: true, signout_ticket: `${Date.now() + 60_000}.${"k".repeat(43)}` })));
  vi.stubGlobal("fetch", revoke);
  const res = await edge.fetch(request("/__polynet/auth/logout", { method: "POST", headers: { cookie: `__Host-polynet_session=${TOKEN}` } }), env());
  expect(res.status).toBe(200);
  expect(JSON.parse(String((revoke.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ token: TOKEN });
  expect(res.headers.get("set-cookie")).toMatch(/__Host-polynet_session=; .*Max-Age=0/);
  // Off the sites domain there's no private twin to sign out of too.
  expect(await res.json()).toEqual({ ok: true });
});

test("return paths stay on the community's own site", () => {
  expect(safeReturnPath("/lessons/3")).toBe("/lessons/3");
  for (const unsafe of ["//evil.example.com", "https://evil.example.com", "/\\evil.example.com", "javascript:alert(1)", null]) {
    expect(safeReturnPath(unsafe)).toBe("/");
  }
});

// The private twin: each site on the sites domain, and its members' own pages beside it.
const SITE = "https://apps-community-staging.polynet.page";
const TWIN = "https://apps-community--me-staging.polynet.page";
function sitesEnv(site = deployedSite({ "/": "<html>home</html>", "/frame": FRAME })): Env & { site: ReturnType<typeof deployedSite> } {
  return {
    ...env(), POLYNET_SITES_DOMAIN: "polynet.page", POLYNET_SITES_HOST_SUFFIX: "-staging", POLYNET_SITES_FRONT_DOOR: "staging.polynet.page",
    DEV_ROUTES_JSON: JSON.stringify({ "apps-community-staging.polynet.page": { script: "site-apps-community", community: "apps-community" } }),
    DEV_USER_WORKER: site, site,
  };
}
const at = (origin: string, path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  if (!headers.has("sec-fetch-site")) headers.set("sec-fetch-site", "same-origin");
  return new Request(`${origin}${path}`, { ...init, headers });
};

test("twin: one label beside the site's, mapped both ways by the shared helper, never a slug's own site", async () => {
  const { privateTwinHost, siteHostOfTwin, siteSlugShapeOk, personalPage } = await import("../../../../packages/polynet-cli/checks.mjs");
  expect(privateTwinHost("apps-community-staging.polynet.page", "polynet.page", "-staging")).toBe("apps-community--me-staging.polynet.page");
  expect(privateTwinHost("apps-community.polynet.page", "polynet.page")).toBe("apps-community--me.polynet.page");
  expect(siteHostOfTwin("apps-community--me-staging.polynet.page", "polynet.page", "-staging")).toBe("apps-community-staging.polynet.page");
  expect(siteHostOfTwin("Apps-Community--ME.polynet.page", "polynet.page")).toBe("apps-community.polynet.page");
  // A twin is never a site, and nothing else is a twin: other suffixes, other domains, deeper labels, bad slugs.
  for (const host of ["apps-community.polynet.page", "apps-community--me-staging.polynet.page", "a.b--me.polynet.page", "x--me.polynet.page",
    "apps-community--me.evil.page", "apps-community-staging--me.polynet.page", "apps--me--me.polynet.page", "--me.polynet.page"]) {
    expect(siteHostOfTwin(host, "polynet.page"), host).toBeNull();
  }
  // Slugs ending in the twin's mark (or the staging suffix) never get a site, so no site is another's twin.
  expect(siteSlugShapeOk("club--me")).toBe(false);
  expect(siteSlugShapeOk("club-staging")).toBe(false);
  expect(siteSlugShapeOk("club--mates")).toBe(true);
  expect(privateTwinHost("club--me.polynet.page", "polynet.page")).toBeNull();
  // Production's twin of a staging-looking host doesn't exist, and a twin has no twin.
  expect(privateTwinHost("apps-community-staging.polynet.page", "polynet.page")).toBeNull();
  expect(privateTwinHost("apps-community--me.polynet.page", "polynet.page")).toBeNull();
  expect(privateTwinHost("apps-community.polynet.page", "polynet.page/..", "")).toBeNull();
  expect(personalPage("/communities/")?.name).toBe("communities");
  expect(personalPage("/communities/x")).toBeNull();
  // Messages has addresses under it: a conversation, or a new one.
  expect(personalPage("/messages/new")?.name).toBe("messages");
  expect(personalPage(`/messages/${"k".repeat(32)}/`)?.name).toBe("messages");
  for (const path of ["/messages/new/x", "/messages/short", "/messages/has.dot.in.it.abcdefghijklmnop", "/messages/../settings"]) expect(personalPage(path), path).toBeNull();
});

test("twin: personal endpoints and the personal block never answer on the site, whoever asks", async () => {
  resetEdgeCaches();
  const backend = vi.fn(async () => Response.json({ ok: true, communities: [] }));
  vi.stubGlobal("fetch", backend);
  const e = sitesEnv();
  for (const path of ["/__polynet/me/communities", "/__polynet/me/anything", "/__polynet/blocks/personal.js"]) {
    const res = await edge.fetch(at(SITE, path, { headers: { cookie: `__Host-polynet_session=${TOKEN}` } }), e);
    expect(res.status, path).toBe(404);
  }
  expect(backend).not.toHaveBeenCalled();
  // On the twin, the personal block is served; another site's page (same site, other origin) can't call the data.
  const block = await edge.fetch(at(TWIN, "/__polynet/blocks/personal.js"), e);
  expect([block.status, block.headers.get("content-type")]).toEqual([200, "text/javascript; charset=utf-8"]);
  expect(await block.text()).toContain('customElements.define("polynet-personal"');
  const fromSite = await edge.fetch(at(TWIN, "/__polynet/me/communities", { headers: { "sec-fetch-site": "same-site", cookie: `__Host-polynet_session=${TOKEN}` } }), e);
  expect(fromSite.status).toBe(403);
  expect(backend).not.toHaveBeenCalled();
});

test("twin: your communities, read with the twin's own session, only the fields a card shows", async () => {
  resetEdgeCaches();
  const backend = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ ok: true, communities: [
    { slug: "apps-community", name: "Apps Club", role: "owner", avatar_url: "https://live.example.convex.cloud/api/storage/abc", site_url: SITE, email: "never@example.com" },
    { slug: "trail-club", name: "Trail Club", role: "superuser", avatar_url: "https://tracker.example.com/a.png", site_url: "https://evil.example.com" },
    { slug: "../x", name: "Bad" },
  ] }));
  vi.stubGlobal("fetch", backend);
  const e = sitesEnv();
  expect((await edge.fetch(at(TWIN, "/__polynet/me/communities"), e)).status).toBe(401);
  expect(backend).not.toHaveBeenCalled();
  const res = await edge.fetch(at(TWIN, "/__polynet/me/communities", { headers: { cookie: `__Host-polynet_session=${TOKEN}` } }), e);
  expect(res.status).toBe(200);
  expect(res.headers.get("cross-origin-resource-policy")).toBe("same-origin");
  expect(await res.json()).toEqual({ ok: true, communities: [
    { slug: "apps-community", name: "Apps Club", role: "owner", avatar_url: "https://live.example.convex.cloud/api/storage/abc", url: SITE, has_site: true, here: true },
    // Another host's avatar isn't shown (the page's policy allows only Polynet's storage), nor a site link that isn't its own.
    { slug: "trail-club", name: "Trail Club", role: "member", avatar_url: null, url: "https://polynet.example.com/c/trail-club", has_site: false, here: false },
  ] });
  const [path, init] = backend.mock.calls[0];
  expect(path).toBe("https://api.example.convex.site/runtime/app/me/communities");
  expect(init?.headers).toMatchObject({ Origin: TWIN, Authorization: `Bearer ${TOKEN}`, "x-polynet-edge-secret": "edge-secret" });
  expect(JSON.parse(String(init?.body))).toEqual({ sites_domain: "polynet.page", host_suffix: "-staging" });
  // A session the backend refuses is cleared.
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false }, { status: 401 })));
  const refused = await edge.fetch(at(TWIN, "/__polynet/me/communities", { headers: { cookie: `__Host-polynet_session=${TOKEN}` } }), e);
  expect(refused.status).toBe(401);
  expect(refused.headers.get("set-cookie")).toMatch(/^__Host-polynet_session=; Path=\/; HttpOnly; SameSite=Lax; Max-Age=0; Secure$/);
});

test("twin: signs in through the same hop to its own callback, and its session names both origins", async () => {
  resetEdgeCaches();
  vi.stubGlobal("fetch", identity("Apps Club"));
  const e = sitesEnv();
  const start = await edge.fetch(at(TWIN, "/__polynet/auth/start?return=/communities"), e);
  const location = new URL(start.headers.get("location")!);
  expect(location.searchParams.get("community")).toBe("apps-community");
  expect(location.searchParams.get("redirect_uri")).toBe(`${TWIN}/__polynet/auth/callback`);
  expect(start.headers.get("set-cookie")).toMatch(/^__Host-polynet_signin=[^;]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=600; Secure$/);
  const onTwin = await (await edge.fetch(at(TWIN, "/__polynet/auth/session"), e)).json();
  expect(onTwin).toMatchObject({ community: "apps-community", community_name: "Apps Club", site_origin: SITE, private_origin: TWIN });
  const onSite = await (await edge.fetch(at(SITE, "/__polynet/auth/session"), e)).json();
  expect(onSite).toMatchObject({ site_origin: SITE, private_origin: TWIN });
});

test("twin: personal pages only; everything else is the site's, and a member with no session here signs in first", async () => {
  resetEdgeCaches();
  vi.stubGlobal("fetch", identity("Apps Club"));
  const e = sitesEnv();
  const nav = (path: string, headers: Record<string, string> = {}) =>
    edge.fetch(at(TWIN, path, { headers: { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", ...headers } }), e);
  for (const [path, to] of [["/", `${SITE}/`], ["/chat?channel=crew", `${SITE}/chat?channel=crew`], ["/?polynet=join", `${SITE}/?polynet=join`], ["/styles.css", `${SITE}/styles.css`]]) {
    const res = await nav(path);
    expect([res.status, res.headers.get("location")], path).toEqual([302, to]);
  }
  // Never a script, and nothing but reads.
  expect((await nav("/app.js", { "sec-fetch-dest": "script" })).status).toBe(404);
  expect((await edge.fetch(at(TWIN, "/chat", { method: "POST", body: "x" }), e)).status).toBe(404);
  const slash = await nav("/communities/?x=1");
  expect([slash.status, slash.headers.get("location")]).toEqual([307, "/communities?x=1"]);
  for (const path of ["/communities", "/messages", "/settings"]) {
    const res = await nav(path);
    expect([res.status, res.headers.get("location")], path).toEqual([302, `/__polynet/auth/start?return=${encodeURIComponent(path)}`]);
  }
  expect(e.site.seen).toEqual([]);
  // Join is for someone who isn't a member yet.
  expect((await nav("/join")).status).toBe(200);
  // A twin of a site that doesn't exist is simply not found.
  expect((await edge.fetch(at("https://nobody--me-staging.polynet.page", "/communities"), e)).status).toBe(404);
});

test("twin: with no rewriter to strip the frame, never the site's frame: Polynet's plain page, under the twin's policy", async () => {
  resetEdgeCaches();
  vi.stubGlobal("fetch", identity("Apps <Club>"));
  const e = sitesEnv(deployedSite({ "/": "<html>home</html>", "/frame": '<html><body><script>steal()</script><polynet-page></polynet-page></body></html>' }));
  const res = await edge.fetch(at(TWIN, "/communities", { headers: { "sec-fetch-mode": "navigate", cookie: `theme=dark; __Host-polynet_session=${TOKEN}` } }), e);
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).not.toContain("steal()");
  expect(html).toContain("<title>Your communities · Apps &#60;Club&#62;</title>");
  expect(html).toContain(`<a href="${SITE}/">Back to Apps &#60;Club&#62;</a>`);
  expect(html).toContain("<main><polynet-page></polynet-page></main>");
  expect(html).toContain('<script type="module" src="/__polynet/ui.js"></script>');
  const policy = res.headers.get("content-security-policy")!;
  expect(policy).toMatch(/^default-src 'none'; script-src 'self'; style-src 'self' https:\/\/apps-community-staging\.polynet\.page https:\/\/fonts\.googleapis\.com 'sha256-[A-Za-z0-9+/=]+'; /);
  for (const part of ["font-src https://apps-community-staging.polynet.page https://fonts.gstatic.com data:",
    "img-src 'self' data: https://apps-community-staging.polynet.page https://live.example.convex.cloud", "connect-src 'self' https://live.example.convex.cloud wss://live.example.convex.cloud;",
    "form-action 'self'", "frame-ancestors 'none'", "base-uri 'none'", "object-src 'none'"]) expect(policy).toContain(part);
  expect(policy).not.toContain("unsafe-inline");
  expect(Object.fromEntries(["x-frame-options", "referrer-policy", "cache-control", "cross-origin-opener-policy", "cross-origin-resource-policy", "x-content-type-options", "origin-agent-cluster"]
    .map((name) => [name, res.headers.get(name)]))).toEqual({
    "x-frame-options": "DENY", "referrer-policy": "same-origin", "cache-control": "no-store, no-transform", "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin", "x-content-type-options": "nosniff", "origin-agent-cluster": "?1",
  });
  // The frame is asked for as the site's own file, without Polynet's cookies.
  expect(e.site.seen).toEqual([{ path: "/frame", navigate: false, conditional: false, cookie: "theme=dark" }]);
  // No frame at all: the same plain page.
  const bare = sitesEnv(deployedSite({ "/": "<html>home</html>" }));
  const plain = await edge.fetch(at(TWIN, "/settings", { headers: { cookie: `__Host-polynet_session=${TOKEN}` } }), bare);
  expect([plain.status, await plain.text()]).toEqual([200, expect.stringContaining("<title>Settings · Apps &#60;Club&#62;</title>")]);
});

test("twin: the site sends its members' own pages to its twin, unless it has its own file there", async () => {
  resetEdgeCaches();
  const e = sitesEnv(deployedSite({ "/": "<html>home</html>", "/frame": FRAME, "/join": "<html><body>our join page</body></html>" }));
  const res = await edge.fetch(at(SITE, "/communities?from=menu", { headers: { "sec-fetch-mode": "navigate" } }), e);
  expect([res.status, res.headers.get("location")]).toEqual([302, `${TWIN}/communities?from=menu`]);
  expect(e.site.seen).toEqual([{ path: "/communities?from=menu", navigate: false, conditional: false, cookie: "" }]);
  expect(await (await edge.fetch(at(SITE, "/join", { headers: { "sec-fetch-mode": "navigate" } }), e)).text()).toContain("our join page");
  // Off the sites domain there's no twin: the site's own, as before.
  const local = await edge.fetch(request("/communities", { headers: { "sec-fetch-mode": "navigate" } }), env());
  expect(local.status).toBe(200);
});

// Settings on the twin: Studio's member settings through /__polynet/me/*.
const SETTINGS_PATHS: Array<[string, "GET" | "POST"]> = [
  ["/__polynet/me/settings", "GET"], ["/__polynet/me/handle?handle=sam", "GET"], ["/__polynet/me/profile", "POST"],
  ["/__polynet/me/avatar/upload", "POST"], ["/__polynet/me/avatar", "POST"], ["/__polynet/me/notifications", "POST"], ["/__polynet/me/leave", "POST"],
];
const settingsCall = (origin: string, path: string, method: string, headers: Record<string, string> = {}, body = "{}") =>
  at(origin, path, { method, headers: { cookie: `__Host-polynet_session=${TOKEN}`, ...(method === "POST" ? { "content-type": "application/json" } : {}), ...headers },
    body: method === "POST" ? body : undefined });

test("twin settings: the routes and the settings module exist only on the twin, for its own pages", async () => {
  resetEdgeCaches();
  const backend = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", backend);
  const e = sitesEnv();
  for (const [path, method] of SETTINGS_PATHS) {
    expect((await edge.fetch(settingsCall(SITE, path, method), e)).status, `site ${path}`).toBe(404);
    // Another site's page (same site, other origin), or anything cross-site, can't call them on the twin.
    for (const site of ["same-site", "cross-site"]) {
      const res = await edge.fetch(settingsCall(TWIN, path, method, { "sec-fetch-site": site }), e);
      expect(res.status, `${site} ${path}`).toBe(403);
    }
  }
  expect((await edge.fetch(at(SITE, "/__polynet/blocks/settings.js"), e)).status).toBe(404);
  expect(backend).not.toHaveBeenCalled();
  const module = await edge.fetch(at(TWIN, "/__polynet/blocks/settings.js"), e);
  expect([module.status, module.headers.get("content-type")]).toEqual([200, "text/javascript; charset=utf-8"]);
  const source = await module.text();
  expect(source).toContain("export function mountSettings");
  expect(source).not.toContain("__POLYNET_SETTINGS_MESSAGES__");
  expect(source).not.toContain("innerHTML");
});

test("twin settings: reads are GETs, writes small same-origin JSON POSTs; no session, no call", async () => {
  resetEdgeCaches();
  const backend = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", backend);
  const e = sitesEnv();
  for (const [path, method] of SETTINGS_PATHS) {
    const other = method === "GET" ? "POST" : "GET";
    expect((await edge.fetch(settingsCall(TWIN, path, other), e)).status, `${other} ${path}`).toBe(405);
    expect((await edge.fetch(at(TWIN, path, { method, body: method === "POST" ? "{}" : undefined, headers: { "content-type": "application/json" } }), e)).status, path).toBe(401);
    if (method !== "POST") continue;
    // A form any page can post never reaches a write.
    expect((await edge.fetch(settingsCall(TWIN, path, method, { "content-type": "application/x-www-form-urlencoded" }, "a=1"), e)).status, path).toBe(415);
    expect((await edge.fetch(settingsCall(TWIN, path, method, { "content-type": "text/plain" }), e)).status, path).toBe(415);
  }
  // Size limits: the profile takes up to 8 KB, the rest 1 KB; a lying Content-Length doesn't help.
  const big = (bytes: number) => JSON.stringify({ bio: "x".repeat(bytes) });
  expect((await edge.fetch(settingsCall(TWIN, "/__polynet/me/profile", "POST", {}, big(9000)), e)).status).toBe(413);
  expect((await edge.fetch(settingsCall(TWIN, "/__polynet/me/notifications", "POST", {}, big(2000)), e)).status).toBe(413);
  expect((await edge.fetch(settingsCall(TWIN, "/__polynet/me/leave", "POST", { "content-length": "999999" }), e)).status).toBe(413);
  expect(backend).not.toHaveBeenCalled();
  expect((await edge.fetch(settingsCall(TWIN, "/__polynet/me/profile", "POST", {}, big(7000)), e)).status).toBe(200);
  expect(backend).toHaveBeenCalledTimes(1);
});

test("twin settings: forwarded with the twin's session to Studio's cores; only the fields the page shows come back", async () => {
  resetEdgeCaches();
  const answers: Record<string, unknown> = {
    "/runtime/app/me/settings": { ok: true, email: "never@example.com",
      profile: { display_name: "Sam", handle: "sam", bio: "Hi", avatar_url: "https://tracker.example.com/a.png", user_id: "secret", social_links: { youtube: "https://youtube.com/@sam", x: "", instagram: "", tiktok: "z" } },
      community: { name: "Apps Club", role: "superuser", id: "k1" }, notifications: { muted: true, weekly_digest: false, other: 1 } },
    "/runtime/app/me/handle": { ok: true, available: false, status: "taken", handle: "sam", owner: "someone" },
    "/runtime/app/me/avatar_upload": { ok: true, upload_url: "https://live.example.convex.cloud/api/storage/upload?token=t" },
    "/runtime/app/me/avatar": { ok: true, profile: { display_name: "Sam", handle: "sam", bio: null, avatar_url: "https://live.example.convex.cloud/api/storage/kg2", social_links: {} } },
    "/runtime/app/me/leave": { ok: true, extra: 1 },
  };
  const backend = vi.fn(async (url: string, _init?: RequestInit) => Response.json(answers[new URL(url).pathname] ?? { ok: false }));
  vi.stubGlobal("fetch", backend);
  const e = sitesEnv();
  const read = async (path: string, method = "GET", body = "{}") => {
    const res = await edge.fetch(settingsCall(TWIN, path, method, {}, body), e);
    return [res.status, await res.json()];
  };
  expect(await read("/__polynet/me/settings")).toEqual([200, { ok: true,
    profile: { display_name: "Sam", handle: "sam", bio: "Hi", avatar_url: null, social_links: { youtube: "https://youtube.com/@sam", x: "", instagram: "" } },
    community: { name: "Apps Club", role: "member" }, notifications: { muted: true, weekly_digest: false },
    account_url: "https://polynet.example.com/settings/account" }]);
  const [path, init] = backend.mock.calls[0];
  expect(path).toBe("https://api.example.convex.site/runtime/app/me/settings");
  expect(init?.headers).toMatchObject({ Origin: TWIN, Authorization: `Bearer ${TOKEN}`, "x-polynet-edge-secret": "edge-secret" });
  expect(await read("/__polynet/me/handle?handle=sam")).toEqual([200, { ok: true, available: false, status: "taken", handle: "sam" }]);
  expect(JSON.parse(String(backend.mock.calls[1][1]?.body))).toEqual({ handle: "sam" });
  expect(await read("/__polynet/me/avatar/upload", "POST")).toEqual([200, { ok: true, upload_url: "https://live.example.convex.cloud/api/storage/upload?token=t" }]);
  expect((await read("/__polynet/me/avatar", "POST", '{"storage_id":"kg2"}'))[1]).toMatchObject({ profile: { avatar_url: "https://live.example.convex.cloud/api/storage/kg2" } });
  expect(JSON.parse(String(backend.mock.calls[3][1]?.body))).toEqual({ storage_id: "kg2" });
  expect(await read("/__polynet/me/leave", "POST")).toEqual([200, { ok: true }]);
  // An upload address anywhere but Polynet's storage is never handed to the page.
  answers["/runtime/app/me/avatar_upload"] = { ok: true, upload_url: "https://evil.example.com/api/storage/upload?token=t" };
  expect(await read("/__polynet/me/avatar/upload", "POST")).toEqual([502, { ok: false, code: "settings_unavailable" }]);
  // A core's refusal keeps its code; a session the backend refuses is cleared.
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, code: "profile_handle_taken", message: "<b>raw</b>" }, { status: 400 })));
  expect(await read("/__polynet/me/profile", "POST", '{"handle":"sam"}')).toEqual([400, { ok: false, code: "profile_handle_taken" }]);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false }, { status: 401 })));
  const refused = await edge.fetch(settingsCall(TWIN, "/__polynet/me/settings", "GET"), e);
  expect(refused.status).toBe(401);
  expect(refused.headers.get("set-cookie")).toMatch(/^__Host-polynet_session=; Path=\/; HttpOnly; SameSite=Lax; Max-Age=0; Secure$/);
});

test("twin sign-out: each origin ends its own session; the other ends its own on a visit, only with the member's ticket", async () => {
  resetEdgeCaches();
  const ticket = `${Date.now() + 60_000}.${"k".repeat(43)}`;
  const revoke = vi.fn(async (_url: string, init?: RequestInit) =>
    Response.json(JSON.parse(String(init?.body)).ticket ? { ok: true } : { ok: true, signout_ticket: ticket }));
  vi.stubGlobal("fetch", revoke);
  const e = sitesEnv();
  const cookie = `__Host-polynet_session=${TOKEN}`;
  // From the twin: back to the site's home, through the site's own sign-out.
  const onTwin = await edge.fetch(at(TWIN, "/__polynet/auth/logout", { method: "POST", headers: { cookie } }), e);
  expect(await onTwin.json()).toEqual({ ok: true, then: `${SITE}/__polynet/auth/signout?ticket=${ticket}&return=%2F` });
  // From the site: through the twin's, then back to the same page.
  const onSite = await edge.fetch(at(SITE, "/__polynet/auth/logout?return=/chat%3Fchannel%3Dcrew", { method: "POST", headers: { cookie } }), e);
  expect(await onSite.json()).toEqual({ ok: true, then: `${TWIN}/__polynet/auth/signout?ticket=${ticket}&return=%2Fchat%3Fchannel%3Dcrew` });
  // The visit: a top-level navigation from the other origin, so no same-origin rule; the ticket goes to the backend.
  revoke.mockClear();
  const visit = (origin: string, query: string, headers: Record<string, string> = { cookie }) =>
    edge.fetch(at(origin, `/__polynet/auth/signout${query}`, { headers: { "sec-fetch-site": "same-site", "sec-fetch-mode": "navigate", ...headers } }), e);
  const ended = await visit(SITE, `?ticket=${ticket}&return=%2F`);
  expect([ended.status, ended.headers.get("location")]).toEqual([302, `${SITE}/`]);
  expect(ended.headers.get("set-cookie")).toMatch(/^__Host-polynet_session=; .*Max-Age=0/);
  expect(JSON.parse(String(revoke.mock.calls[0][1]?.body))).toEqual({ token: TOKEN, ticket });
  const twinEnded = await visit(TWIN, `?ticket=${ticket}&return=%2Fchat`);
  expect([twinEnded.status, twinEnded.headers.get("location")]).toEqual([302, `${SITE}/chat`]);
  // Without a ticket, with a bad one, or with one the backend refuses: nothing ends, and it never leaves the site.
  revoke.mockClear();
  for (const query of ["", "?ticket=nope", "?return=https://evil.example.com", "?return=//evil.example.com"]) {
    const res = await visit(SITE, query);
    expect([res.status, res.headers.get("location"), res.headers.get("set-cookie")], query).toEqual([302, `${SITE}/`, null]);
  }
  expect(revoke).not.toHaveBeenCalled();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, code: "signout_ticket_invalid" }, { status: 403 })));
  expect((await visit(SITE, `?ticket=${ticket}`)).headers.get("set-cookie")).toBeNull();
});

test("twin settings: the profile refusals read exactly as Studio words them", async () => {
  const { SETTINGS_MESSAGES } = await import("./blocks/settings");
  const { PROFILE_MUTATION_ERROR_MESSAGES } = await import("../../../../shared/profileMutationErrors");
  const profileCodes = Object.keys(SETTINGS_MESSAGES).filter((code) => code.startsWith("profile_"));
  expect(profileCodes.length).toBe(12);
  for (const code of profileCodes) expect(SETTINGS_MESSAGES[code], code).toBe((PROFILE_MUTATION_ERROR_MESSAGES as Record<string, string>)[code]);
});

// Messages on the twin: the member's DMs through /__polynet/me/messages*.
const CONVERSATION = "k".repeat(32);
const MESSAGE_PATHS: Array<[string, "GET" | "POST"]> = [
  ["/__polynet/me/messages", "GET"], [`/__polynet/me/messages/conversation?id=${CONVERSATION}`, "GET"], ["/__polynet/me/messages/start?to=sam", "GET"],
  ["/__polynet/me/messages/send", "POST"], ["/__polynet/me/messages/upload", "POST"], ["/__polynet/me/messages/read", "POST"],
  ["/__polynet/me/messages/mute", "POST"], ["/__polynet/me/messages/typing", "POST"], ["/__polynet/me/messages/block", "POST"],
];

test("twin messages: the routes and the messages module exist only on the twin, for its own pages", async () => {
  resetEdgeCaches();
  const backend = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", backend);
  const e = sitesEnv();
  for (const [path, method] of MESSAGE_PATHS) {
    expect((await edge.fetch(settingsCall(SITE, path, method), e)).status, `site ${path}`).toBe(404);
    for (const site of ["same-site", "cross-site"]) {
      expect((await edge.fetch(settingsCall(TWIN, path, method, { "sec-fetch-site": site }), e)).status, `${site} ${path}`).toBe(403);
    }
    // No session, no call; the other method, refused.
    expect((await edge.fetch(at(TWIN, path, { method, body: method === "POST" ? "{}" : undefined, headers: { "content-type": "application/json" } }), e)).status, path).toBe(401);
    expect((await edge.fetch(settingsCall(TWIN, path, method === "GET" ? "POST" : "GET"), e)).status, path).toBe(405);
    if (method === "POST") expect((await edge.fetch(settingsCall(TWIN, path, method, { "content-type": "text/plain" }), e)).status, path).toBe(415);
  }
  expect((await edge.fetch(at(SITE, "/__polynet/blocks/messages.js"), e)).status).toBe(404);
  // Addresses the page never makes are refused before the backend.
  for (const path of ["/__polynet/me/messages/conversation?id=../x", "/__polynet/me/messages/conversation", `/__polynet/me/messages/conversation?id=${CONVERSATION}&before=0`,
    "/__polynet/me/messages/start?to=a%20b", "/__polynet/me/messages/start"]) {
    expect((await edge.fetch(settingsCall(TWIN, path, "GET"), e)).status, path).toBe(400);
  }
  // Sizes: a message up to Studio's 4,000 characters of any script fits, more doesn't; the rest take 1 KB.
  const send = (text: string) => settingsCall(TWIN, "/__polynet/me/messages/send", "POST", {}, JSON.stringify({ conversation_id: CONVERSATION, text }));
  expect((await edge.fetch(send("😀".repeat(7000)), e)).status).toBe(413);
  expect((await edge.fetch(settingsCall(TWIN, "/__polynet/me/messages/typing", "POST", {}, JSON.stringify({ x: "y".repeat(2000) })), e)).status).toBe(413);
  expect(backend).not.toHaveBeenCalled();
  expect((await edge.fetch(send("😀".repeat(4000)), e)).status).toBe(502);
  expect(backend).toHaveBeenCalledTimes(1);
  const module = await edge.fetch(at(TWIN, "/__polynet/blocks/messages.js"), e);
  expect([module.status, module.headers.get("content-type")]).toEqual([200, "text/javascript; charset=utf-8"]);
  const source = await module.text();
  expect(source).toContain("export function mountMessages");
  expect(source).toContain('"communityLive:watchMessages"');
  expect(source).not.toContain("__POLYNET_MESSAGES_TEXT__");
  expect(source).not.toContain("innerHTML");
});

test("twin messages: forwarded with the twin's session; only what the page draws comes back", async () => {
  resetEdgeCaches();
  const storage = "https://live.example.convex.cloud/api/storage";
  const conversation = {
    id: CONVERSATION, peer: { name: "Sam", handle: "sam", avatar_url: "https://tracker.example.com/a.png", user_id: "sam-subject", email: "sam@example.com" },
    community_name: "Apps Club", unread_count: 2, muted: false, blocked: false, last_seq: 2, read_seq: 0, peer_read_seq: 2,
    last_message: { preview: "Hi", from_me: false, at: "2026-10-28T10:00:00.000Z", sender_user_id: "sam-subject" }, participants: [{ user_id: "x" }],
  };
  const message = { id: "m1", seq: 1, from_me: false, text: "Hi", created_at: "2026-10-28T10:00:00.000Z", client_message_id: "key-1", sender_user_id: "sam-subject",
    attachments: [{ id: "a1", name: "wall.png", kind: "image", mime: "image/png", size: 4, url: `${storage}/f1`, storage_id: "kg1" },
      { id: "a2", name: "x.html", kind: "file", mime: "text/html", size: 4, url: "https://evil.example.com/x.html" }] };
  const answers: Record<string, unknown> = {
    "/runtime/app/me/messages": { ok: true, conversations: [conversation, { id: "../bad" }] },
    "/runtime/app/me/messages/conversation": { ok: true, conversation, messages: [message], has_more: true },
    "/runtime/app/me/messages/start": { ok: true, conversation_id: null, peer: conversation.peer },
    "/runtime/app/me/messages/send": { ok: true, conversation_id: CONVERSATION, message },
    "/runtime/app/me/messages/upload": { ok: true, upload_url: "https://live.example.convex.cloud/api/storage/upload?token=t" },
    "/runtime/app/me/messages/block": { ok: true, conversation: { ...conversation, blocked: true } },
    "/runtime/app/me/messages/typing": { ok: true, typing: true, by: "x" },
  };
  const backend = vi.fn(async (url: string, _init?: RequestInit) => Response.json(answers[new URL(url).pathname] ?? { ok: false }));
  vi.stubGlobal("fetch", backend);
  const e = sitesEnv();
  const read = async (path: string, method = "GET", body = "{}") => {
    const res = await edge.fetch(settingsCall(TWIN, path, method, {}, body), e);
    return [res.status, await res.json()];
  };
  const shaped = {
    id: CONVERSATION, peer: { name: "Sam", handle: "sam", avatar_url: null }, community_name: "Apps Club", unread_count: 2, muted: false, blocked: false,
    last_seq: 2, read_seq: 0, peer_read_seq: 2, last_message: { preview: "Hi", from_me: false, at: "2026-10-28T10:00:00.000Z" },
  };
  const shapedMessage = { id: "m1", seq: 1, from_me: false, text: "Hi", created_at: "2026-10-28T10:00:00.000Z", client_message_id: "key-1",
    attachments: [{ id: "a1", name: "wall.png", kind: "image", mime: "image/png", size: 4, url: `${storage}/f1` }] };
  expect(await read("/__polynet/me/messages")).toEqual([200, { ok: true, conversations: [shaped] }]);
  const [path, init] = backend.mock.calls[0];
  expect(path).toBe("https://api.example.convex.site/runtime/app/me/messages");
  expect(init?.headers).toMatchObject({ Origin: TWIN, Authorization: `Bearer ${TOKEN}`, "x-polynet-edge-secret": "edge-secret" });
  expect(await read(`/__polynet/me/messages/conversation?id=${CONVERSATION}&before=7`)).toEqual([200, { ok: true, conversation: shaped, messages: [shapedMessage], has_more: true }]);
  expect(JSON.parse(String(backend.mock.calls[1][1]?.body))).toEqual({ conversation_id: CONVERSATION, before_seq: 7 });
  expect(await read("/__polynet/me/messages/start?to=%40sam")).toEqual([200, { ok: true, conversation_id: null, peer: { name: "Sam", handle: "sam", avatar_url: null } }]);
  expect(JSON.parse(String(backend.mock.calls[2][1]?.body))).toEqual({ handle: "@sam" });
  const sendBody = JSON.stringify({ to: "sam", text: "Hi", client_message_id: "key-1" });
  expect(await read("/__polynet/me/messages/send", "POST", sendBody)).toEqual([200, { ok: true, conversation_id: CONVERSATION, message: shapedMessage }]);
  expect(String(backend.mock.calls[3][1]?.body)).toBe(sendBody);
  expect(await read("/__polynet/me/messages/upload", "POST", JSON.stringify({ conversation_id: CONVERSATION }))).toEqual([200, { ok: true, upload_url: "https://live.example.convex.cloud/api/storage/upload?token=t" }]);
  expect(await read("/__polynet/me/messages/block", "POST", JSON.stringify({ conversation_id: CONVERSATION, blocked: true }))).toEqual([200, { ok: true, conversation: { ...shaped, blocked: true } }]);
  expect(await read("/__polynet/me/messages/typing", "POST", JSON.stringify({ conversation_id: CONVERSATION, typing: true }))).toEqual([200, { ok: true, typing: true }]);
  // Nothing about anyone's account, and no storage ids, ever leaves the edge.
  expect(JSON.stringify(await Promise.all(["/__polynet/me/messages", `/__polynet/me/messages/conversation?id=${CONVERSATION}`].map((p) => read(p))))).not.toMatch(/subject|example\.com\/x|storage_id|kg1|participants/);
  // An upload address anywhere but Polynet's storage is never handed to the page.
  answers["/runtime/app/me/messages/upload"] = { ok: true, upload_url: "https://evil.example.com/api/storage/upload?token=t" };
  expect(await read("/__polynet/me/messages/upload", "POST", "{}")).toEqual([502, { ok: false, code: "messages_unavailable" }]);
  // A core's refusal keeps its code (never its message); a session the backend refuses is cleared.
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, code: "dm_rate_limited", message: "<b>raw</b>" }, { status: 429 })));
  expect(await read("/__polynet/me/messages/send", "POST", sendBody)).toEqual([429, { ok: false, code: "dm_rate_limited" }]);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false }, { status: 401 })));
  const refused = await edge.fetch(settingsCall(TWIN, "/__polynet/me/messages", "GET"), e);
  expect(refused.status).toBe(401);
  expect(refused.headers.get("set-cookie")).toMatch(/^__Host-polynet_session=; Path=\/; HttpOnly; SameSite=Lax; Max-Age=0; Secure$/);
});

test("twin messages: the addresses under /messages are the twin's pages, and the site sends them there", async () => {
  resetEdgeCaches();
  vi.stubGlobal("fetch", identity("Apps Club"));
  const e = sitesEnv();
  const nav = (origin: string, path: string, headers: Record<string, string> = {}) =>
    edge.fetch(at(origin, path, { headers: { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", ...headers } }), e);
  // A profile's Message on the site: to the twin, the handle kept.
  for (const path of ["/messages/new?to=sam", `/messages/${CONVERSATION}`]) {
    const res = await nav(SITE, path);
    expect([res.status, res.headers.get("location")], path).toEqual([302, `${TWIN}${path}`]);
  }
  // On the twin: signed in first (back to the same address), then the page in the site's frame.
  const out = await nav(TWIN, "/messages/new?to=sam");
  expect([out.status, out.headers.get("location")]).toEqual([302, `/__polynet/auth/start?return=${encodeURIComponent("/messages/new?to=sam")}`]);
  const cookie = `__Host-polynet_session=${TOKEN}`;
  const page = await nav(TWIN, `/messages/${CONVERSATION}`, { cookie });
  expect(page.status).toBe(200);
  expect(await page.text()).toContain("<title>Messages · Apps Club</title>");
  const slash = await nav(TWIN, `/messages/${CONVERSATION}/`, { cookie });
  expect([slash.status, slash.headers.get("location")]).toEqual([307, `/messages/${CONVERSATION}`]);
  // Anything else under /messages isn't a page here.
  const other = await nav(TWIN, "/messages/../../x", { cookie });
  expect(other.status).toBe(302);
  expect(other.headers.get("location")).toMatch(new RegExp(`^${SITE.replace(/\./g, "\\.")}/`));
});

test("twin messages: the refusals read as Studio words them", async () => {
  const { MESSAGES_TEXT } = await import("./blocks/messages");
  const { readFileSync } = await import("node:fs");
  const studio = readFileSync(new URL("../../../../apps/web/src/components/WebDirectMessagesHost.tsx", import.meta.url), "utf8");
  for (const code of ["dm_rate_limited", "dm_conversation_access_required", "dm_target_not_found", "dm_message_payload_required", "dm_attachment_invalid"]) {
    expect(studio, code).toContain(JSON.stringify(MESSAGES_TEXT[code]));
  }
});

// Join on the twin: the community's own join page, through /__polynet/me/join*.
const JOIN_ANSWER = {
  ok: true, signed_in: true,
  community: { slug: "apps-community", name: "Apps Club", one_liner: "We build.", about: "About us.", member_count: 12,
    avatar_url: "https://live.example.convex.cloud/api/storage/av", owner_email: "owner@example.com" },
  gate: "checkout", available: true, action_label: "Join $10/month",
  plans: [{ billing_period: "monthly", name: "Monthly", label: "Join $10/month", price_id: "price_x" }, { billing_period: "weekly", label: "Join $1/week" }],
  viewer: { state: "visitor", can_request_again: false, reapply_at: null, setup_required: false, user_id: "u1" },
};
const SHAPED_JOIN = {
  ok: true, signed_in: true,
  community: { name: "Apps Club", one_liner: "We build.", about: "About us.", member_count: 12, avatar_url: "https://live.example.convex.cloud/api/storage/av" },
  gate: "checkout", available: true, action_label: "Join $10/month", plans: [{ billing_period: "monthly", name: "Monthly", label: "Join $10/month" }],
  viewer: { state: "visitor", can_request_again: false, reapply_at: null, setup_required: false },
  enter_url: `${SITE}/__polynet/auth/start?return=%2Fchat`, setup_url: "https://polynet.example.com/onboarding",
};
const JOIN_ACTIONS = ["/__polynet/me/join", "/__polynet/me/join/cancel", "/__polynet/me/join/checkout", "/__polynet/me/join/finish"];

test("twin join: join_url is the community's own /join on its twin, from the site and the twin; Polynet's join page where there's no twin", async () => {
  resetEdgeCaches();
  vi.stubGlobal("fetch", identity("Apps Club"));
  const e = sitesEnv();
  for (const origin of [SITE, TWIN]) {
    expect((await (await edge.fetch(at(origin, "/__polynet/auth/session"), e)).json()).join_url, origin).toBe(`${TWIN}/join`);
  }
  expect((await (await edge.fetch(request("/__polynet/auth/session"), env())).json()).join_url).toBe("https://polynet.example.com/c/apps-community");
  // The site's /join goes to its twin; off the sites domain, to Polynet's join page unless the site has its own.
  const res = await edge.fetch(at(SITE, "/join", { headers: { "sec-fetch-mode": "navigate" } }), e);
  expect([res.status, res.headers.get("location")]).toEqual([302, `${TWIN}/join`]);
  const local = deployedSite({ "/": "<html>home</html>" });
  const off = await edge.fetch(request("/join", { headers: { "sec-fetch-mode": "navigate" } }), { ...env(), DEV_USER_WORKER: local });
  expect([off.status, off.headers.get("location")]).toEqual([302, "https://polynet.example.com/c/apps-community"]);
  const own = await edge.fetch(request("/join", { headers: { "sec-fetch-mode": "navigate" } }), { ...env(), DEV_USER_WORKER: deployedSite({ "/join": "<html>ours</html>" }) });
  expect(await own.text()).toContain("ours");
});

test("twin join: the routes and the join module exist only on the twin, for its own pages; actions are small JSON POSTs with its session", async () => {
  resetEdgeCaches();
  const backend = vi.fn(async () => Response.json(JOIN_ANSWER));
  vi.stubGlobal("fetch", backend);
  const e = sitesEnv();
  for (const path of JOIN_ACTIONS) {
    expect((await edge.fetch(settingsCall(SITE, path, "POST"), e)).status, `site ${path}`).toBe(404);
    for (const site of ["same-site", "cross-site"]) expect((await edge.fetch(settingsCall(TWIN, path, "POST", { "sec-fetch-site": site }), e)).status, `${site} ${path}`).toBe(403);
    // No session, no call; a form any page can post never reaches an action; 1 KB at most.
    expect((await edge.fetch(at(TWIN, path, { method: "POST", body: "{}", headers: { "content-type": "application/json" } }), e)).status, path).toBe(401);
    expect((await edge.fetch(settingsCall(TWIN, path, "POST", { "content-type": "application/x-www-form-urlencoded" }, "a=1"), e)).status, path).toBe(415);
    expect((await edge.fetch(settingsCall(TWIN, path, "POST", {}, JSON.stringify({ x: "y".repeat(1100) })), e)).status, path).toBe(413);
  }
  for (const path of JOIN_ACTIONS.slice(1)) expect((await edge.fetch(settingsCall(TWIN, path, "GET"), e)).status, path).toBe(405);
  expect((await edge.fetch(settingsCall(SITE, "/__polynet/me/join", "GET"), e)).status).toBe(404);
  expect((await edge.fetch(settingsCall(TWIN, "/__polynet/me/join", "GET", { "sec-fetch-site": "same-site" }), e)).status).toBe(403);
  expect((await edge.fetch(at(SITE, "/__polynet/blocks/join.js"), e)).status).toBe(404);
  expect(backend).not.toHaveBeenCalled();
  const module = await edge.fetch(at(TWIN, "/__polynet/blocks/join.js"), e);
  expect([module.status, module.headers.get("content-type")]).toEqual([200, "text/javascript; charset=utf-8"]);
  const source = await module.text();
  expect(source).toContain("export function mountJoin");
  expect(source).not.toContain("__POLYNET_JOIN_MESSAGES__");
  expect(source).not.toContain("innerHTML");
});

test("twin join: the read works signed out; signed in it carries the twin's session; only the fields the page draws leave the edge", async () => {
  resetEdgeCaches();
  const backend = vi.fn(async (_url: string, _init?: RequestInit) => Response.json(JOIN_ANSWER));
  vi.stubGlobal("fetch", backend);
  const e = sitesEnv();
  const anonymous = await edge.fetch(at(TWIN, "/__polynet/me/join"), e);
  expect(anonymous.status).toBe(200);
  expect(await anonymous.json()).toEqual(SHAPED_JOIN);
  const [path, init] = backend.mock.calls[0];
  expect(path).toBe("https://api.example.convex.site/runtime/app/me/join");
  expect(init?.headers).toEqual({ "Content-Type": "application/json", Origin: TWIN, "x-polynet-edge-secret": "edge-secret" });
  const signedIn = await edge.fetch(settingsCall(TWIN, "/__polynet/me/join", "GET"), e);
  expect(await signedIn.json()).toEqual(SHAPED_JOIN);
  expect(backend.mock.calls[1][1]?.headers).toMatchObject({ Origin: TWIN, Authorization: `Bearer ${TOKEN}` });
  // An avatar anywhere but Polynet's storage isn't shown; an unknown state reads as signed out.
  backend.mockImplementation(async () => Response.json({ ...JOIN_ANSWER, community: { ...JOIN_ANSWER.community, avatar_url: "https://tracker.example.com/a.png" }, viewer: { state: "superuser" } }));
  expect(await (await edge.fetch(at(TWIN, "/__polynet/me/join"), e)).json()).toMatchObject({ community: { avatar_url: null }, viewer: null });
  // A session the backend refuses reads as signed out, and is cleared: the pitch still shows.
  const calls: Array<string | null> = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string>).Authorization ?? null;
    calls.push(auth);
    return auth ? Response.json({ ok: false }, { status: 401 }) : Response.json({ ...JOIN_ANSWER, signed_in: false, viewer: null });
  }));
  const refused = await edge.fetch(settingsCall(TWIN, "/__polynet/me/join", "GET"), e);
  expect([refused.status, (await refused.json()).signed_in]).toEqual([200, false]);
  expect(refused.headers.get("set-cookie")).toMatch(/^__Host-polynet_session=; Path=\/; HttpOnly; SameSite=Lax; Max-Age=0; Secure$/);
  expect(calls).toEqual([`Bearer ${TOKEN}`, null]);
});

test("twin join: each action goes to Studio's core with the twin's session; checkout only ever to Stripe's own page", async () => {
  resetEdgeCaches();
  const answers: Record<string, unknown> = {
    "/runtime/app/me/join/request": { ...JOIN_ANSWER, outcome: "approval_pending", viewer: { state: "pending" } },
    "/runtime/app/me/join/cancel": JOIN_ANSWER,
    "/runtime/app/me/join/checkout": { ok: true, checkout_url: "https://checkout.stripe.com/c/pay/cs_test_a1", session_id: `chk_${"a".repeat(32)}` },
    "/runtime/app/me/join/finish": { ...JOIN_ANSWER, status: "pending" },
  };
  const backend = vi.fn(async (url: string, _init?: RequestInit) => Response.json(answers[new URL(url).pathname] ?? { ok: false }));
  vi.stubGlobal("fetch", backend);
  const e = sitesEnv();
  const act = async (path: string, body = "{}") => {
    const res = await edge.fetch(settingsCall(TWIN, path, "POST", {}, body), e);
    return [res.status, await res.json()];
  };
  expect(await act("/__polynet/me/join")).toEqual([200, { ...SHAPED_JOIN, outcome: "approval_pending",
    viewer: { state: "pending", can_request_again: false, reapply_at: null, setup_required: false } }]);
  expect(await act("/__polynet/me/join/cancel")).toEqual([200, SHAPED_JOIN]);
  const checkoutBody = JSON.stringify({ billing_period: "monthly" });
  // The page gets the address the backend made with Stripe, and nothing else (not even our own session id).
  expect(await act("/__polynet/me/join/checkout", checkoutBody)).toEqual([200, { ok: true, checkout_url: "https://checkout.stripe.com/c/pay/cs_test_a1" }]);
  expect(await act("/__polynet/me/join/finish", JSON.stringify({ session_id: `chk_${"a".repeat(32)}` }))).toEqual([200, { ...SHAPED_JOIN, status: "pending" }]);
  expect(backend.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
    "/runtime/app/me/join/request", "/runtime/app/me/join/cancel", "/runtime/app/me/join/checkout", "/runtime/app/me/join/finish"]);
  for (const [, init] of backend.mock.calls) expect(init?.headers).toMatchObject({ Origin: TWIN, Authorization: `Bearer ${TOKEN}`, "x-polynet-edge-secret": "edge-secret" });
  expect(String(backend.mock.calls[2][1]?.body)).toBe(checkoutBody);
  // A checkout address anywhere but Stripe's own page never reaches the page.
  for (const url of ["https://evil.example.com/pay", "https://checkout.stripe.com.evil.example.com/x", "javascript:alert(1)"]) {
    answers["/runtime/app/me/join/checkout"] = { ok: true, checkout_url: url };
    expect(await act("/__polynet/me/join/checkout", checkoutBody), url).toEqual([502, { ok: false, code: "join_unavailable" }]);
  }
  // Studio's refusals keep their code, never their message.
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, code: "community_checkout_unavailable", message: "<b>raw</b>" }, { status: 409 })));
  expect(await act("/__polynet/me/join/checkout", checkoutBody)).toEqual([409, { ok: false, code: "community_checkout_unavailable" }]);
});

// Moderation on the twin: removing a post and reviewing join requests, through
// /__polynet/me/* (the backend decides who moderates); never on the site.
const MODERATION_PATHS: Array<[string, "GET" | "POST"]> = [
  ["/__polynet/me/moderation/post?ref=interaction:root:abc123", "GET"], ["/__polynet/me/moderation/remove", "POST"],
  ["/__polynet/me/requests", "GET"], ["/__polynet/me/requests/approve", "POST"], ["/__polynet/me/requests/deny", "POST"],
];

test("twin moderation: the routes and the moderation module exist only on the twin, as same-origin JSON", async () => {
  resetEdgeCaches();
  const backend = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", backend);
  const e = sitesEnv();
  for (const [path, method] of MODERATION_PATHS) {
    expect((await edge.fetch(settingsCall(SITE, path, method), e)).status, `site ${path}`).toBe(404);
    for (const site of ["same-site", "cross-site"]) {
      expect((await edge.fetch(settingsCall(TWIN, path, method, { "sec-fetch-site": site }), e)).status, `${site} ${path}`).toBe(403);
    }
    const other = method === "GET" ? "POST" : "GET";
    expect((await edge.fetch(settingsCall(TWIN, path, other), e)).status, `${other} ${path}`).toBe(405);
    expect((await edge.fetch(at(TWIN, path, { method, body: method === "POST" ? "{}" : undefined, headers: { "content-type": "application/json" } }), e)).status, path).toBe(401);
    if (method === "POST") expect((await edge.fetch(settingsCall(TWIN, path, method, { "content-type": "application/x-www-form-urlencoded" }, "a=1"), e)).status, path).toBe(415);
  }
  // A post is named only by its ref.
  expect((await edge.fetch(settingsCall(TWIN, "/__polynet/me/moderation/post?ref=../users", "GET"), e)).status).toBe(400);
  expect((await edge.fetch(at(SITE, "/__polynet/blocks/moderation.js"), e)).status).toBe(404);
  expect(backend).not.toHaveBeenCalled();
  const module = await edge.fetch(at(TWIN, "/__polynet/blocks/moderation.js"), e);
  expect(module.status).toBe(200);
  const source = await module.text();
  expect(source).toContain("export function mountModerate");
  expect(source).toContain("export function mountRequests");
  expect(source).not.toContain("innerHTML");
});

test("twin moderation: forwarded with the twin's session; only what the pages show comes back", async () => {
  resetEdgeCaches();
  const answers: Record<string, unknown> = {
    "/runtime/app/me/moderation/post": { ok: true, post: { ref: "interaction:root:abc123", author: "Sam", text: "Selling rope", mine: false, author_user_id: "secret", created_at: "x" } },
    "/runtime/app/me/requests": { ok: true, paid: false, requests: [
      { id: "req1", name: "Ana", handle: "ana", avatar_url: "https://evil.example/a.png", email: "ana@example.com" },
      { id: "../x", name: "Bad" },
    ] },
  };
  const seen: Array<{ path: string; body: string; auth: string | null }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    seen.push({ path: url.pathname, body: String(init?.body ?? ""), auth: new Headers(init?.headers).get("authorization") });
    return Response.json(answers[url.pathname] ?? { ok: true });
  }));
  const e = sitesEnv();
  const post = await (await edge.fetch(settingsCall(TWIN, "/__polynet/me/moderation/post?ref=interaction:root:abc123", "GET"), e)).json();
  expect(post).toEqual({ ok: true, post: { ref: "interaction:root:abc123", author: "Sam", text: "Selling rope", mine: false } });
  const requests = await (await edge.fetch(settingsCall(TWIN, "/__polynet/me/requests", "GET"), e)).json();
  expect(requests).toEqual({ ok: true, paid: false, requests: [{ id: "req1", name: "Ana", handle: "ana", avatar_url: null }] });
  await edge.fetch(settingsCall(TWIN, "/__polynet/me/requests/approve", "POST", {}, JSON.stringify({ request_id: "req1" })), e);
  expect(seen.map((call) => [call.path, call.body, call.auth])).toEqual([
    ["/runtime/app/me/moderation/post", JSON.stringify({ ref: "interaction:root:abc123" }), `Bearer ${TOKEN}`],
    ["/runtime/app/me/requests", "{}", `Bearer ${TOKEN}`],
    ["/runtime/app/me/requests/approve", JSON.stringify({ request_id: "req1" }), `Bearer ${TOKEN}`],
  ]);
});
