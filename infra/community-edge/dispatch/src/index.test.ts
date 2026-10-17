import { afterEach, expect, test, vi } from "vitest";
import edge, { safeReturnPath, type Env } from "./index";
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

function request(path: string, init: RequestInit = {}) {
  return new Request(`${ORIGIN}${path}`, init);
}

afterEach(() => vi.unstubAllGlobals());

test("unknown community hosts are not served", async () => {
  const res = await edge.fetch(new Request("https://other.example.com/"), env());
  expect(res.status).toBe(404);
});

test("start sends the member to Polynet sign-in with a state cookie scoped to the auth path", async () => {
  const res = await edge.fetch(request("/__polynet/auth/start?return=/lessons/3"), env());
  expect(res.status).toBe(302);
  const location = new URL(res.headers.get("location")!);
  expect(location.origin + location.pathname).toBe("https://polynet.example.com/api/auth/community-handoff");
  expect(location.searchParams.get("community")).toBe("apps-community");
  expect(location.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/__polynet/auth/callback`);
  const state = location.searchParams.get("state")!;
  expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const setCookie = res.headers.get("set-cookie")!;
  expect(setCookie).toContain(`__polynet_signin=${state}.${encodeURIComponent("/lessons/3")}`);
  expect(setCookie).toMatch(/HttpOnly/);
  expect(setCookie).toMatch(/Path=\/__polynet\/auth\//);
  expect(setCookie).not.toMatch(/Domain=/i);
});

test("callback refuses a state mismatch without calling the backend", async () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  const res = await edge.fetch(request(`/__polynet/auth/callback?code=pnh_x&state=${"b".repeat(43)}`, {
    headers: { cookie: `__polynet_signin=${"a".repeat(43)}.%2F` },
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
    headers: { cookie: `__polynet_signin=${state}.${encodeURIComponent("//evil.example.com")}` },
  }), env());
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe("/");
  const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://api.example.convex.site/runtime/community_edge/session_exchange");
  expect((init.headers as Record<string, string>)["x-polynet-edge-secret"]).toBe("edge-secret");
  expect(JSON.parse(String(init.body))).toEqual({ code: "pnh_x", state, origin: ORIGIN });
  const cookies = res.headers.get("set-cookie")!;
  expect(cookies).toContain(`__polynet_session=${TOKEN}`);
  expect(cookies).toMatch(/HttpOnly/);
  expect(cookies).toMatch(/Secure/);
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
    method: "POST", headers: { cookie: `__polynet_session=${TOKEN}`, authorization: "Bearer pna_forged" }, body: "{}",
  }), env());
  const [, init] = upstream.mock.calls[0] as unknown as [string, RequestInit];
  expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  expect((init.headers as Record<string, string>).Origin).toBe(ORIGIN);
  expect((init.headers as Record<string, string>)["x-polynet-edge-secret"]).toBe("edge-secret");
  expect(rejected.status).toBe(401);
  expect(rejected.headers.get("set-cookie")).toMatch(/__polynet_session=; .*Max-Age=0/);
});

test("the community's own Worker never receives Polynet's cookies", async () => {
  const seen: string[] = [];
  const e = { ...env(), DEV_USER_WORKER: { fetch: async (req: Request) => { seen.push(req.headers.get("cookie") ?? ""); return new Response("ok"); } } };
  await edge.fetch(request("/", { headers: { cookie: `theme=dark; __polynet_session=${TOKEN}; __polynet_signin=x.%2F` } }), e);
  await edge.fetch(request("/", { headers: { cookie: `__polynet_session=${TOKEN}` } }), e);
  expect(seen).toEqual(["theme=dark", ""]);
});

test("the session endpoint gives a signed-in page its watch-only token, matching the backend's", async () => {
  const anonymous = await (await edge.fetch(request("/__polynet/auth/session"), env())).json();
  expect(anonymous).toEqual({ signed_in: false, join_url: "https://polynet.example.com/c/apps-community" });
  const signedIn = await (await edge.fetch(request("/__polynet/auth/session", { headers: { cookie: `__polynet_session=${TOKEN}` } }), env())).json();
  expect(signedIn).toEqual({
    signed_in: true,
    join_url: "https://polynet.example.com/c/apps-community",
    live: { url: "https://live.example.convex.cloud", token: await deriveCommunityAppWatchToken(TOKEN) },
  });
  expect(JSON.stringify(signedIn)).not.toContain(TOKEN);
});

test("uploads and files go to the backend with the session and edge secret only", async () => {
  const upstream = vi.fn(async () => new Response("ok", { status: 200, headers: { "content-type": "image/png", "x-secret": "no" } }));
  vi.stubGlobal("fetch", upstream);
  const cookie = `__polynet_session=${TOKEN}`;
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

test("logout revokes the session and clears the cookie", async () => {
  const revoke = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
  vi.stubGlobal("fetch", revoke);
  const res = await edge.fetch(request("/__polynet/auth/logout", { method: "POST", headers: { cookie: `__polynet_session=${TOKEN}` } }), env());
  expect(res.status).toBe(200);
  expect(JSON.parse(String((revoke.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ token: TOKEN });
  expect(res.headers.get("set-cookie")).toMatch(/__polynet_session=; .*Max-Age=0/);
});

test("return paths stay on the community's own site", () => {
  expect(safeReturnPath("/lessons/3")).toBe("/lessons/3");
  for (const unsafe of ["//evil.example.com", "https://evil.example.com", "/\\evil.example.com", "javascript:alert(1)", null]) {
    expect(safeReturnPath(unsafe)).toBe("/");
  }
});
