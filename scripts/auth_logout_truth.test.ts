// Match the web hook's React installation to its renderer.
import React from "../apps/web/node_modules/react/index.js";
import { renderToStaticMarkup } from "../apps/web/node_modules/react-dom/server.node.js";
import { afterEach, expect, test, vi } from "vitest";
import logoutHandler from "../api/auth/logout.js";
import { logoutAuthSessionRemote } from "../shared/authCore";
import { useWebAppAuthController } from "../apps/web/src/controllers/useWebAppAuthController";
import { WebSignOutConfirmModal } from "../apps/web/src/components/WebSignOutConfirmModal";

vi.mock("react", () => import("../apps/web/node_modules/react/index.js"));
vi.mock("../apps/web/src/lib/runtimeInstrumentation", () => ({ emitAgentRuntimeEvent: vi.fn(), formatRuntimeInstrumentationError: vi.fn() }));
vi.mock("../apps/web/src/instrument", () => ({ captureAppException: vi.fn() }));
vi.mock("../apps/web/src/posthogAnalytics", () => ({ captureProductAnalyticsEvent: vi.fn() }));
const ensure = vi.hoisted(() => vi.fn());
vi.mock("../apps/web/src/auth", async importOriginal => ({ ...await importOriginal<object>(), ensureAuthSessionForAuthenticatedSendResult: ensure }));
const message = "Sign out couldn't be confirmed. Try again.";
const fixture = { access_token: "synthetic-access", expires_at: Math.floor(Date.now()/1000)+300, user: { id: "fixture-user" } };
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); ensure.mockReset(); });
function setup() {
  vi.stubEnv("VITE_CONVEX_SITE_URL", "https://synthetic.invalid");
  vi.stubEnv("ARX_AUTH_BRIDGE_SECRET", "synthetic-secret");
  vi.stubGlobal("window", { location: { origin: "https://staging.test", href: "https://staging.test/settings/account" }, setTimeout, clearTimeout });
}
function reply() {
  const headers = new Map<string, unknown>();
  let body: any;
  const res = { statusCode: 0, setHeader: (name: string, value: unknown) => headers.set(name,value), getHeader: (name: string) => headers.get(name), end: (value: string) => { body = JSON.parse(value); } };
  return { res, headers, body: () => body };
}
const request = { method: "POST", headers: { host: "localhost", origin: "https://localhost", cookie: "arx-auth-session=synthetic-session" } };
function json(value: unknown, status=200) { return new Response(JSON.stringify(value), { status }); }

test.each(["503", "401", "bad-json", "false-success", "network"])("API retains retry cookie and reports unconfirmed %s", async failure => {
  setup(); const r=reply();
  vi.stubGlobal("fetch", vi.fn(async () => { if(failure==="network") throw Error("synthetic failure"); return failure==="bad-json" ? new Response("invalid", { status:200 }) : json({ ok: failure!=="false-success" }, failure==="503"?503:failure==="401"?401:200); }));
  await logoutHandler(request,r.res);
  expect(r.res.statusCode).toBe(503); expect(r.body()).toMatchObject({ok:false,error:"logout_unconfirmed"});
  expect(r.headers.has("Set-Cookie")).toBe(false);
});

test("API clears the cookie only when the bridge reports a permanently invalid session", async () => {
  setup(); const r=reply();
  vi.stubGlobal("fetch", vi.fn(async () => json({ ok:false, code:"auth_session_invalid", error:"auth_session_invalid" }, 401)));
  await logoutHandler(request,r.res);
  expect(r.res.statusCode).toBe(200); expect(r.body()).toEqual({ok:true});
  expect(String(r.headers.get("Set-Cookie"))).toContain("Max-Age=0");
  const unauthorized=reply();
  vi.stubGlobal("fetch", vi.fn(async () => json({ ok:false, code:"auth_bridge_unauthorized" }, 401)));
  await logoutHandler(request,unauthorized.res);
  expect(unauthorized.res.statusCode).toBe(503); expect(unauthorized.headers.has("Set-Cookie")).toBe(false);
});

test("API timeout fails explicitly and remains retryable", async () => {
  setup(); vi.useFakeTimers(); const r=reply();
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => new Promise((_resolve,reject) => init.signal!.addEventListener("abort",()=>reject(Error("aborted")))));
  const result=logoutHandler(request,r.res); await vi.advanceTimersByTimeAsync(5_000); await result;
  expect(r.res.statusCode).toBe(503); expect(r.headers.has("Set-Cookie")).toBe(false);
});

function stalledBody(signal: AbortSignal) {
  return new Response(new ReadableStream({ start(body) {
    body.enqueue(new TextEncoder().encode('{"ok":'));
    signal.addEventListener("abort",()=>body.error(new DOMException("aborted","AbortError")),{once:true});
  } }), {status:200});
}

test("API retains the cookie when bridge headers arrive but its body stalls", async () => {
  setup(); vi.useFakeTimers(); const r=reply();
  vi.stubGlobal("fetch",async(_url:string,init:RequestInit)=>stalledBody(init.signal!));
  const pending=logoutHandler(request,r.res);
  await vi.advanceTimersByTimeAsync(5_000); await pending;
  expect(r.res.statusCode).toBe(503); expect(r.body().error).toBe("logout_unconfirmed");
  expect(r.headers.has("Set-Cookie")).toBe(false);
});

test("lost completion response is resolved by idempotent retry without false initial success", async () => {
  setup(); let revoked=false;
  vi.stubGlobal("fetch", vi.fn(async () => { if(!revoked){revoked=true; throw Error("response lost after revocation");}return json({ok:true}); }));
  const first=reply(); await logoutHandler(request,first.res);
  expect(first.body().ok).toBe(false); expect(first.headers.has("Set-Cookie")).toBe(false);
  const retry=reply(); await logoutHandler(request,retry.res);
  expect(retry.body().ok).toBe(true); expect(String(retry.headers.get("Set-Cookie"))).toContain("Max-Age=0");
});

test("missing cookie is idempotent and origin/method guards do not contact the bridge", async () => {
  setup(); const fetch=vi.fn(); vi.stubGlobal("fetch",fetch);
  const missing=reply(); await logoutHandler({...request,headers:{...request.headers,cookie:""}},missing.res);
  expect(missing.res.statusCode).toBe(200); expect(missing.body().ok).toBe(true);
  for(const [bad,status] of [[{...request,method:"GET"},405],[{...request,headers:{...request.headers,origin:"https://other.test"}},403],[{...request,headers:{...request.headers,host:""}},403]] as const) {
    const r=reply(); await logoutHandler(bad,r.res); expect(r.res.statusCode).toBe(status); expect(r.headers.has("Set-Cookie")).toBe(false);
  }
  expect(fetch).not.toHaveBeenCalled();
});

test.each([undefined, "http://localhost"])("shared origin guard accepts the existing %s origin posture", async origin => {
  setup(); const fetch=vi.fn(async()=>json({ok:true})); vi.stubGlobal("fetch",fetch);
  const r=reply();
  await logoutHandler({...request,headers:{...request.headers,origin,"x-forwarded-proto":"http"}},r.res);
  expect(r.res.statusCode).toBe(200); expect(r.body().ok).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1); expect(String(r.headers.get("Set-Cookie"))).toContain("Max-Age=0");
});

test.each(["503", "malformed", "false-success", "network"])("client rejects %s rather than completing logout", async failure => {
  setup(); vi.stubGlobal("fetch",async()=>{if(failure==="network")throw Error("network");return failure==="malformed"?new Response("invalid"):json({ok:failure!=="false-success"},failure==="503"?503:200);});
  await expect(logoutAuthSessionRemote()).rejects.toThrow(message);
});

test("client request timeout is an unconfirmed outcome", async () => {
  setup(); vi.useFakeTimers(); vi.stubGlobal("window", { location:{origin:"https://staging.test"},setTimeout,clearTimeout });
  vi.stubGlobal("fetch",(_url:string, init:RequestInit)=>new Promise((_resolve,reject)=>init.signal!.addEventListener("abort",()=>reject(Error("aborted")))));
  const result=logoutAuthSessionRemote(); const assertion=expect(result).rejects.toThrow(message);
  await vi.advanceTimersByTimeAsync(10_000); await assertion;
});

function controller(events:string[]) {
  let captured!: ReturnType<typeof useWebAppAuthController>;
  function Harness() { captured=useWebAppAuthController({resumeEpoch:0,onSessionLost:()=>{events.push("local-clear");},onSessionMissingAfterBootstrap:()=>{},onSessionReady:()=>{},onSessionResumeReady:()=>{},onDidJustSignIn:()=>{},onAfterSignOut:()=>{events.push("completed");}});return null; }
  renderToStaticMarkup(React.createElement(Harness)); captured.sessionRef.current=fixture; return captured;
}

test("controller preserves local session on failure and clears it only after confirmed retry", async () => {
  setup();const events:string[]=[]; let fail=true;
  vi.stubGlobal("fetch",async()=>{events.push("remote");return json({ok:!fail},fail?503:200);});
  const c=controller(events);
  await expect(c.handleSignOut()).rejects.toThrow(message);
  expect(c.sessionRef.current).toBe(fixture); expect(events).toEqual(["remote"]);
  fail=false; await c.handleSignOut();
  expect(c.sessionRef.current).toBeNull(); expect(events).toEqual(["remote","remote","local-clear","completed"]);
});

test("controller preserves local authentication after body timeout and confirmed retry clears it", async () => {
  vi.useFakeTimers(); setup(); const events:string[]=[]; const c=controller(events);
  vi.stubGlobal("fetch",async(_url:string,init:RequestInit)=>stalledBody(init.signal!));
  const pending=c.handleSignOut(); const rejected=expect(pending).rejects.toThrow(message);
  await vi.advanceTimersByTimeAsync(10_000); await rejected;
  expect(c.sessionRef.current).toBe(fixture); expect(events).toEqual([]);
  vi.stubGlobal("fetch",async()=>json({ok:true}));
  await c.handleSignOut(); expect(c.sessionRef.current).toBeNull();
  expect(events).toEqual(["local-clear","completed"]);
});

test("late refresh cannot restore the session after confirmed logout", async () => {
  setup();const c=controller([]); let resolve!: (value:unknown)=>void;
  ensure.mockImplementation(()=>new Promise(done=>{resolve=done;}));
  vi.stubGlobal("fetch",async()=>json({ok:true}));
  const pending=c.ensureUsableAuthSession(fixture,"late-refresh");
  await c.handleSignOut(); resolve({status:"ready",session:{...fixture,access_token:"late-token"}});
  expect(await pending).toBeNull(); expect(c.sessionRef.current).toBeNull();
});

test("logout confirmation displays its retry error accessibly and retains the action", () => {
  const html=renderToStaticMarkup(React.createElement(WebSignOutConfirmModal,{isOpen:true,isSubmitting:false,error:message,onClose:()=>{},onConfirm:()=>{}}));
  expect(html).toContain('role="alert"'); expect(html).toContain("couldn&#x27;t be confirmed"); expect(html).toContain("Sign out</button>");
});
