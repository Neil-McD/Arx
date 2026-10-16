import { afterEach, expect, test, vi } from "vitest";
import handler, { parseCommunityCallback } from "../api/auth/community-handoff.js";

const STATE = "s".repeat(43);
const CALLBACK = "https://hello.example.com/__polynet/auth/callback";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function setup() {
  vi.stubEnv("VITE_CONVEX_SITE_URL", "https://synthetic.invalid");
  vi.stubEnv("ARX_AUTH_BRIDGE_SECRET", "synthetic-secret");
}

function reply() {
  const headers = new Map<string, unknown>();
  let body = "";
  const res = { statusCode: 0, setHeader: (name: string, value: unknown) => headers.set(name.toLowerCase(), value), end: (value?: string) => { body = value ?? ""; } };
  return { res, headers, body: () => body };
}

function request(query: Record<string, string>, cookie = "__Secure-arx-auth-session=synthetic-session") {
  const search = new URLSearchParams(query).toString();
  return { method: "GET", url: `/api/auth/community-handoff?${search}`, headers: { host: "polynet.example.com", cookie } };
}

const valid = { community: "apps-community", redirect_uri: CALLBACK, state: STATE };

test("only an exact callback on HTTPS or a local dev host is accepted", () => {
  expect(parseCommunityCallback(CALLBACK)?.origin).toBe("https://hello.example.com");
  expect(parseCommunityCallback("http://hello.localhost:8787/__polynet/auth/callback")?.origin).toBe("http://hello.localhost:8787");
  for (const bad of ["http://hello.example.com/__polynet/auth/callback", "https://hello.example.com/other", `${CALLBACK}?x=1`, "javascript:alert(1)", ""]) {
    expect(parseCommunityCallback(bad)).toBeNull();
  }
});

test("invalid links get an error page, never a redirect", async () => {
  setup();
  for (const query of [{ ...valid, state: "short" }, { ...valid, community: "Bad Slug" }, { ...valid, redirect_uri: "https://evil.example.com/" }]) {
    const r = reply();
    await handler(request(query), r.res);
    expect(r.res.statusCode).toBe(400);
    expect(r.headers.has("location")).toBe(false);
  }
});

test("a member without a Polynet session is sent to sign in and back", async () => {
  setup();
  const r = reply();
  await handler(request(valid, ""), r.res);
  expect(r.res.statusCode).toBe(302);
  const location = String(r.headers.get("location"));
  expect(location.startsWith("/login?returnTo=")).toBe(true);
  expect(decodeURIComponent(location.slice("/login?returnTo=".length))).toContain("/api/auth/community-handoff?");
});

test("a signed-in member is returned to the community with a one-time code", async () => {
  setup();
  const bridge = vi.fn(async () => new Response(JSON.stringify({ ok: true, code: `pnh_${"c".repeat(43)}` }), { status: 200 }));
  vi.stubGlobal("fetch", bridge);
  const r = reply();
  await handler(request(valid), r.res);
  expect(r.res.statusCode).toBe(302);
  const target = new URL(String(r.headers.get("location")));
  expect(`${target.origin}${target.pathname}`).toBe(CALLBACK);
  expect(target.searchParams.get("state")).toBe(STATE);
  expect(target.searchParams.get("code")).toBe(`pnh_${"c".repeat(43)}`);
  const [url, init] = bridge.mock.calls[0] as unknown as [string, RequestInit];
  expect(String(url)).toContain("/runtime/auth_bridge_community_handoff");
  expect(JSON.parse(String(init.body))).toEqual({
    session_id: "synthetic-session", community_slug: "apps-community", origin: "https://hello.example.com", state: STATE, consent: false,
  });
});

test("non-members go to the community gate; unregistered addresses get no redirect", async () => {
  setup();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, code: "not_a_member" }), { status: 403 })));
  const member = reply();
  await handler(request(valid), member.res);
  expect(member.headers.get("location")).toBe("/c/apps-community");

  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, code: "address_not_registered" }), { status: 403 })));
  const unregistered = reply();
  await handler(request(valid), unregistered.res);
  expect(unregistered.res.statusCode).toBe(400);
  expect(unregistered.headers.has("location")).toBe(false);
});

function post(form: Record<string, string>, origin = "https://polynet.example.com", cookie = "__Secure-arx-auth-session=synthetic-session") {
  return { method: "POST", url: "/api/auth/community-handoff", headers: { host: "polynet.example.com", origin, cookie }, body: form };
}

test("first sign-in shows an escaped consent page instead of a code", async () => {
  setup();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    ok: false, code: "consent_required",
    app: { name: "<Hello>", origin: "https://hello.example.com", community_name: "Apps & Co", tools: ["polynet_list", "polynet_write"] },
  }), { status: 200 })));
  const r = reply();
  await handler(request(valid), r.res);
  expect(r.res.statusCode).toBe(200);
  expect(r.headers.has("location")).toBe(false);
  const html = r.body();
  expect(html).toContain("Allow &lt;Hello&gt;?");
  expect(html).toContain("Apps &amp; Co");
  expect(html).toContain("Post as you");
  expect(html).toContain('<form method="post">');
  expect(html).not.toContain("<Hello>");
});

test("approving from the consent page requests a code with consent", async () => {
  setup();
  const bridge = vi.fn(async () => new Response(JSON.stringify({ ok: true, code: `pnh_${"d".repeat(43)}` }), { status: 200 }));
  vi.stubGlobal("fetch", bridge);
  const r = reply();
  await handler(post({ ...valid, decision: "approve" }), r.res);
  expect(r.res.statusCode).toBe(302);
  expect(String(r.headers.get("location"))).toContain("code=pnh_");
  expect(JSON.parse(String((bridge.mock.calls[0] as unknown as [string, RequestInit])[1].body)).consent).toBe(true);
});

test("cancel returns to the community without a code; cross-site posts are refused", async () => {
  setup();
  const bridge = vi.fn();
  vi.stubGlobal("fetch", bridge);
  const cancel = reply();
  await handler(post({ ...valid, decision: "cancel" }), cancel.res);
  expect(cancel.headers.get("location")).toBe("https://hello.example.com/");
  const forged = reply();
  await handler(post({ ...valid, decision: "approve" }, "https://evil.example.com"), forged.res);
  expect(forged.res.statusCode).toBe(403);
  expect(bridge).not.toHaveBeenCalled();
});

