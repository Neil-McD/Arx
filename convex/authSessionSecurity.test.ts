/// <reference types="vite/client" />

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  AUTH_SECURE_RANDOM_UNAVAILABLE,
  classifyAuthSessionLogoutResolutionFailure,
  completeConfirmedAuthSessionLogout,
  createSecureAuthSessionId,
  hashAuthSessionCredential,
  resolveAuthSessionLifecycle,
} from "./authSessions";
import {
  AUTH_PROVIDER_RESPONSE_TIMEOUT_MS,
  AUTH_REQUEST_TIMEOUT,
  fetchAuthProviderText,
} from "./authProviderRequest";
import { registerRuntimeAuthRoutes } from "./httpAuth";
import { registerRuntimeAuthBridgeRoutes } from "./httpAuthBridge";
import {
  readAuthSessionCookie,
  readVerifiedAuthFlow,
  setAuthFlowCookie,
  setAuthSessionCookie,
} from "../api/auth/_cookies.js";
import {
  AUTH_CONVEX_RESPONSE_TIMEOUT_MS,
  AUTH_REQUEST_TIMEOUT as AUTH_BRIDGE_REQUEST_TIMEOUT,
  callRuntimeAuthJson,
  createAuthConvexDeadline,
} from "../api/auth/_bridge.js";
import googleAuthCallback from "../api/auth/google/callback.js";
import googleAuthStart from "../api/auth/google/start.js";
import logoutWebSession from "../api/auth/logout.js";
import refreshWebSession from "../api/auth/refresh.js";
import bootstrapWebSession from "../api/auth/session.js";
import { completeConfirmedSignOut } from "../apps/web/src/controllers/confirmedSignOut";

const VALID_UUID = "123e4567-e89b-42d3-a456-426614174000";

function createNodeResponseHarness() {
  const headers = new Map<string, unknown>();
  let body = "";
  const response = {
    statusCode: 0,
    setHeader: (name: string, value: unknown) => headers.set(name, value),
    getHeader: (name: string) => headers.get(name),
    end: (value?: unknown) => {
      body = String(value ?? "");
    },
  };
  return {
    response,
    headers,
    readJson: () => JSON.parse(body) as Record<string, unknown>,
  };
}

async function invokeWebLogoutWithCookie() {
  const harness = createNodeResponseHarness();
  await logoutWebSession(
    {
      method: "POST",
      headers: {
        host: "localhost:5174",
        origin: "http://localhost:5174",
        "x-forwarded-proto": "http",
        cookie: "arx-auth-session=existing-secure-session-id",
      },
    },
    harness.response,
  );
  return harness;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("auth provider whole-response deadline", () => {
  test("returns one text snapshot and clears the deadline on success", async () => {
    vi.useFakeTimers();
    const providerResponse = new Response('{"ok":true}', {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const readBody = vi.spyOn(providerResponse, "text");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => providerResponse),
    );

    const result = await fetchAuthProviderText("https://auth.example.test/token", {
      method: "POST",
    });

    expect(result).toMatchObject({ ok: true, status: 200, bodyText: '{"ok":true}' });
    expect(readBody).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("times out a provider stall before headers and clears the deadline", async () => {
    vi.useFakeTimers();
    let providerSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        providerSignal = init?.signal ?? undefined;
        return await new Promise<Response>(() => undefined);
      }),
    );

    const resultPromise = fetchAuthProviderText("https://auth.example.test/token");
    const rejection = expect(resultPromise).rejects.toThrow(AUTH_REQUEST_TIMEOUT);
    await vi.advanceTimersByTimeAsync(AUTH_PROVIDER_RESPONSE_TIMEOUT_MS);

    await rejection;
    expect(providerSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("times out a stalled response body after headers and reads it only once", async () => {
    vi.useFakeTimers();
    let providerSignal: AbortSignal | undefined;
    const providerResponse = new Response(null, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const readBody = vi
      .spyOn(providerResponse, "text")
      .mockImplementation(async () => await new Promise<string>(() => undefined));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        providerSignal = init?.signal ?? undefined;
        return providerResponse;
      }),
    );

    const resultPromise = fetchAuthProviderText("https://auth.example.test/token");
    const rejection = expect(resultPromise).rejects.toThrow(AUTH_REQUEST_TIMEOUT);
    await vi.advanceTimersByTimeAsync(AUTH_PROVIDER_RESPONSE_TIMEOUT_MS);

    await rejection;
    expect(providerSignal?.aborted).toBe(true);
    expect(readBody).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("clears the deadline after a non-timeout provider failure", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("provider unavailable");
      }),
    );

    await expect(fetchAuthProviderText("https://auth.example.test/token")).rejects.toThrow(
      "provider unavailable",
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  test("PKCE body timeout returns one canonical retryable response", async () => {
    vi.useFakeTimers();
    vi.stubEnv("ARX_AUTH_BRIDGE_SECRET", "test-bridge-secret");
    vi.stubEnv("ARX_AUTH_TOKEN_URL", "https://auth.example.test/token");
    vi.stubEnv("ARX_AUTH_CLIENT_ID", "test-client-id");
    const routes: Array<{ path: string; method: string; handler: any }> = [];
    const providerResponse = new Response(null, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const readBody = vi
      .spyOn(providerResponse, "text")
      .mockImplementation(async () => await new Promise<string>(() => undefined));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => providerResponse),
    );
    registerRuntimeAuthRoutes({
      http: { route: (config) => routes.push(config) },
      httpAction: (handler) => handler,
      buildCorsHeaders: () => new Headers(),
      jsonResponse: (_req, status, payload) =>
        new Response(JSON.stringify(payload), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      optionsResponse: () => new Response(null, { status: 204 }),
      parseOptionalString: (raw) => (typeof raw === "string" && raw.trim() ? raw.trim() : null),
    });
    const route = routes.find(
      (candidate) =>
        candidate.path === "/runtime/auth_exchange_pkce_code" && candidate.method === "POST",
    );
    expect(route).toBeDefined();

    const responsePromise = route!.handler(
      {},
      new Request("https://polynet.test/runtime/auth_exchange_pkce_code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Arx-Auth-Bridge-Secret": "test-bridge-secret",
        },
        body: JSON.stringify({
          auth_code: "provider-code",
          code_verifier: "pkce-verifier",
          redirect_to: "https://polynet.test/api/auth/google/callback",
        }),
      }),
    );
    await vi.advanceTimersByTimeAsync(AUTH_PROVIDER_RESPONSE_TIMEOUT_MS);
    const response = await responsePromise;

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      code: AUTH_REQUEST_TIMEOUT,
      error: AUTH_REQUEST_TIMEOUT,
      message: "Auth provider request timed out.",
    });
    expect(readBody).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Vercel auth bridge whole-response deadline", () => {
  test("buffers one response snapshot and clears the route deadline on success", async () => {
    vi.useFakeTimers();
    vi.stubEnv("ARX_AUTH_BRIDGE_SECRET", "test-bridge-secret");
    vi.stubEnv("VITE_CONVEX_SITE_URL", "https://staging-convex.test");
    const convexResponse = new Response('{"ok":true}', {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const readBody = vi.spyOn(convexResponse, "text");
    vi.stubGlobal("fetch", vi.fn(async () => convexResponse));

    const response = await callRuntimeAuthJson(
      "/runtime/auth-test",
      {},
      createAuthConvexDeadline(),
    );

    expect(await response.json()).toEqual({ ok: true });
    expect(readBody).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("times out a Convex stall before headers and clears the route deadline", async () => {
    vi.useFakeTimers();
    vi.stubEnv("ARX_AUTH_BRIDGE_SECRET", "test-bridge-secret");
    vi.stubEnv("VITE_CONVEX_SITE_URL", "https://staging-convex.test");
    let convexSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        convexSignal = init?.signal ?? undefined;
        return await new Promise<Response>(() => undefined);
      }),
    );

    const resultPromise = callRuntimeAuthJson(
      "/runtime/auth-test",
      {},
      createAuthConvexDeadline(),
    );
    const rejection = expect(resultPromise).rejects.toThrow(AUTH_BRIDGE_REQUEST_TIMEOUT);
    await vi.advanceTimersByTimeAsync(AUTH_CONVEX_RESPONSE_TIMEOUT_MS);

    await rejection;
    expect(convexSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("times out a stalled Convex body after headers and reads it only once", async () => {
    vi.useFakeTimers();
    vi.stubEnv("ARX_AUTH_BRIDGE_SECRET", "test-bridge-secret");
    vi.stubEnv("VITE_CONVEX_SITE_URL", "https://staging-convex.test");
    let convexSignal: AbortSignal | undefined;
    const convexResponse = new Response(null, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const readBody = vi
      .spyOn(convexResponse, "text")
      .mockImplementation(async () => await new Promise<string>(() => undefined));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        convexSignal = init?.signal ?? undefined;
        return convexResponse;
      }),
    );

    const resultPromise = callRuntimeAuthJson(
      "/runtime/auth-test",
      {},
      createAuthConvexDeadline(),
    );
    const rejection = expect(resultPromise).rejects.toThrow(AUTH_BRIDGE_REQUEST_TIMEOUT);
    await vi.advanceTimersByTimeAsync(AUTH_CONVEX_RESPONSE_TIMEOUT_MS);

    await rejection;
    expect(convexSignal?.aborted).toBe(true);
    expect(readBody).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("clears the route deadline after a non-timeout Convex failure", async () => {
    vi.useFakeTimers();
    vi.stubEnv("ARX_AUTH_BRIDGE_SECRET", "test-bridge-secret");
    vi.stubEnv("VITE_CONVEX_SITE_URL", "https://staging-convex.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("convex unavailable");
      }),
    );

    await expect(
      callRuntimeAuthJson("/runtime/auth-test", {}, createAuthConvexDeadline()),
    ).rejects.toThrow("convex unavailable");
    expect(vi.getTimerCount()).toBe(0);
  });

  test("the OAuth callback shares one route deadline across exchange and session creation", async () => {
    vi.useFakeTimers();
    vi.stubEnv("ARX_AUTH_BRIDGE_SECRET", "test-bridge-secret");
    vi.stubEnv("VITE_CONVEX_SITE_URL", "https://staging-convex.test");
    const requestHeaders = {
      host: "localhost:5174",
      "x-forwarded-proto": "http",
    };
    const flowHarness = createNodeResponseHarness();
    setAuthFlowCookie(flowHarness.response, { headers: requestHeaders }, {
      state: "callback-state",
      codeVerifier: "callback-code-verifier",
      redirectTo: "http://localhost:5174/api/auth/google/callback",
      returnTo: "/c/polynet/chat",
      createdAtMs: Date.now(),
    });
    const flowCookie = String(flowHarness.headers.get("Set-Cookie")).split(";", 1)[0];
    let createSignal: AbortSignal | undefined;
    const bridgeFetch = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        if (bridgeFetch.mock.calls.length === 1) {
          return await new Promise<Response>((resolve) => {
            setTimeout(
              () =>
                resolve(
                  new Response(
                    JSON.stringify({
                      access_token: "verified-access-token",
                      refresh_token: "refresh-token",
                      user: { id: "workos:callback-fixture" },
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } },
                  ),
                ),
              10_000,
            );
          });
        }
        createSignal = init?.signal ?? undefined;
        return await new Promise<Response>(() => undefined);
      },
    );
    vi.stubGlobal("fetch", bridgeFetch);
    const responseHarness = createNodeResponseHarness();

    const callbackPromise = googleAuthCallback(
      {
        method: "GET",
        headers: {
          ...requestHeaders,
          cookie: `${flowCookie}; arx-auth-session=existing-secure-session-id`,
        },
        query: { code: "provider-code", state: "callback-state" },
      },
      responseHarness.response,
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect(bridgeFetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(createSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await callbackPromise;

    expect(createSignal?.aborted).toBe(true);
    expect(responseHarness.response.statusCode).toBe(302);
    expect(String(responseHarness.headers.get("Location"))).toContain(
      `error_description=${AUTH_BRIDGE_REQUEST_TIMEOUT}`,
    );
    const setCookie = String(responseHarness.headers.get("Set-Cookie"));
    expect(setCookie).toContain("arx-auth-flow=");
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).not.toContain("arx-auth-session=");
    expect(vi.getTimerCount()).toBe(0);
  });

  test("OAuth start timeout does not create flow or session credentials", async () => {
    vi.useFakeTimers();
    vi.stubEnv("ARX_AUTH_BRIDGE_SECRET", "test-bridge-secret");
    vi.stubEnv("VITE_CONVEX_SITE_URL", "https://staging-convex.test");
    vi.stubGlobal("fetch", vi.fn(async () => await new Promise<Response>(() => undefined)));
    const harness = createNodeResponseHarness();

    const startPromise = googleAuthStart(
      {
        method: "GET",
        headers: { host: "localhost:5174", "x-forwarded-proto": "http" },
        query: { return_to: "/c/polynet/chat" },
      },
      harness.response,
    );
    await vi.advanceTimersByTimeAsync(AUTH_CONVEX_RESPONSE_TIMEOUT_MS);
    await startPromise;

    expect(harness.response.statusCode).toBe(302);
    expect(String(harness.headers.get("Location"))).toContain("error=auth_start_failed");
    expect(String(harness.headers.get("Location"))).toContain(
      `error_description=${AUTH_BRIDGE_REQUEST_TIMEOUT}`,
    );
    expect(harness.headers.has("Set-Cookie")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("bootstrap and refresh timeouts preserve an existing browser credential", async () => {
    vi.useFakeTimers();
    vi.stubEnv("ARX_AUTH_BRIDGE_SECRET", "test-bridge-secret");
    vi.stubEnv("VITE_CONVEX_SITE_URL", "https://staging-convex.test");

    for (const route of [
      { handler: bootstrapWebSession, method: "GET" },
      { handler: refreshWebSession, method: "POST" },
    ]) {
      vi.stubGlobal("fetch", vi.fn(async () => await new Promise<Response>(() => undefined)));
      const harness = createNodeResponseHarness();
      const routePromise = route.handler(
        {
          method: route.method,
          headers: {
            host: "localhost:5174",
            origin: "http://localhost:5174",
            "x-forwarded-proto": "http",
            cookie: "arx-auth-session=existing-secure-session-id",
          },
        },
        harness.response,
      );
      await vi.advanceTimersByTimeAsync(AUTH_CONVEX_RESPONSE_TIMEOUT_MS);
      await routePromise;

      expect(harness.response.statusCode).toBe(503);
      expect(harness.readJson()).toMatchObject({
        ok: false,
        error: AUTH_BRIDGE_REQUEST_TIMEOUT,
      });
      expect(harness.headers.has("Set-Cookie")).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  test("logout timeout remains retryable and preserves the browser credential", async () => {
    vi.useFakeTimers();
    vi.stubEnv("ARX_AUTH_BRIDGE_SECRET", "test-bridge-secret");
    vi.stubEnv("VITE_CONVEX_SITE_URL", "https://staging-convex.test");
    vi.stubGlobal("fetch", vi.fn(async () => await new Promise<Response>(() => undefined)));

    const logoutPromise = invokeWebLogoutWithCookie();
    await vi.advanceTimersByTimeAsync(AUTH_CONVEX_RESPONSE_TIMEOUT_MS);
    const harness = await logoutPromise;

    expect(harness.response.statusCode).toBe(503);
    expect(harness.readJson()).toMatchObject({
      ok: false,
      code: "auth_logout_unavailable",
    });
    expect(harness.headers.has("Set-Cookie")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("auth functions retain a platform ceiling above the application deadline", async () => {
    const config = await import("../vercel.json");
    expect(AUTH_BRIDGE_REQUEST_TIMEOUT).toBe(AUTH_REQUEST_TIMEOUT);
    expect(config.default.functions["api/auth/**/*.js"].maxDuration).toBe(25);
    expect(config.default.functions["api/auth/**/*.js"].maxDuration * 1_000).toBeGreaterThan(
      AUTH_CONVEX_RESPONSE_TIMEOUT_MS,
    );
  });
});

describe("malformed auth cookie recovery", () => {
  test("the session-cookie boundary distinguishes valid, missing, and invalid input without throwing", () => {
    const baseHeaders = {
      host: "localhost:5174",
      "x-forwarded-proto": "http",
    };
    expect(readAuthSessionCookie({ headers: baseHeaders })).toEqual({ status: "missing" });
    expect(
      readAuthSessionCookie({
        headers: { ...baseHeaders, cookie: `arx-auth-session=${VALID_UUID}` },
      }),
    ).toEqual({ status: "valid", value: VALID_UUID });
    expect(
      readAuthSessionCookie({
        headers: { ...baseHeaders, cookie: "arx-auth-session=%E0%A4%A" },
      }),
    ).toEqual({ status: "invalid" });
    expect(
      readAuthSessionCookie({
        headers: { ...baseHeaders, cookie: `arx-auth-session=${"a".repeat(257)}` },
      }),
    ).toEqual({ status: "invalid" });
  });

  test("valid OAuth flow cookies still round-trip through the same signed boundary", () => {
    vi.stubEnv("ARX_AUTH_BRIDGE_SECRET", "test-bridge-secret");
    const harness = createNodeResponseHarness();
    const request = {
      headers: {
        host: "localhost:5174",
        "x-forwarded-proto": "http",
      },
    };
    const createdAtMs = Date.now();
    setAuthFlowCookie(harness.response, request, {
      state: "valid-state",
      codeVerifier: "valid-code-verifier",
      redirectTo: "http://localhost:5174/api/auth/google/callback",
      returnTo: "/c/polynet/chat",
      createdAtMs,
    });
    const cookie = String(harness.headers.get("Set-Cookie")).split(";", 1)[0];

    expect(
      readVerifiedAuthFlow({
        headers: {
          ...request.headers,
          cookie,
        },
      }),
    ).toEqual({
      state: "valid-state",
      codeVerifier: "valid-code-verifier",
      redirectTo: "http://localhost:5174/api/auth/google/callback",
      returnTo: "/c/polynet/chat",
      createdAtMs,
    });
  });

  test("bootstrap preserves the missing-cookie signed-out path without writing a cookie", async () => {
    const bridgeFetch = vi.fn(async () => {
      throw new Error("auth bridge must not run");
    });
    vi.stubGlobal("fetch", bridgeFetch);
    const harness = createNodeResponseHarness();

    await bootstrapWebSession(
      {
        method: "GET",
        headers: {
          host: "polynet.test",
          origin: "https://polynet.test",
          "x-forwarded-proto": "https",
        },
      },
      harness.response,
    );

    expect(harness.response.statusCode).toBe(200);
    expect(harness.readJson()).toMatchObject({
      ok: true,
      session: null,
      trace: { bootstrap_path: "missing_cookie" },
    });
    expect(harness.headers.has("Set-Cookie")).toBe(false);
    expect(bridgeFetch).not.toHaveBeenCalled();
  });

  test("bootstrap clears a malformed cookie and returns signed-out state without a bridge call", async () => {
    const bridgeFetch = vi.fn(async () => {
      throw new Error("auth bridge must not run");
    });
    vi.stubGlobal("fetch", bridgeFetch);
    const harness = createNodeResponseHarness();

    await bootstrapWebSession(
      {
        method: "GET",
        headers: {
          host: "polynet.test",
          origin: "https://polynet.test",
          "x-forwarded-proto": "https",
          cookie: "__Secure-arx-auth-session=%E0%A4%A",
        },
      },
      harness.response,
    );

    expect(harness.response.statusCode).toBe(200);
    expect(harness.readJson()).toMatchObject({
      ok: true,
      session: null,
      trace: { bootstrap_path: "cleared_invalid_cookie" },
    });
    expect(String(harness.headers.get("Set-Cookie"))).toContain("Max-Age=0");
    expect(bridgeFetch).not.toHaveBeenCalled();
  });

  test("refresh clears a malformed cookie and fails closed without a bridge call", async () => {
    const bridgeFetch = vi.fn(async () => {
      throw new Error("auth bridge must not run");
    });
    vi.stubGlobal("fetch", bridgeFetch);
    const harness = createNodeResponseHarness();

    await refreshWebSession(
      {
        method: "POST",
        headers: {
          host: "localhost:5174",
          origin: "http://localhost:5174",
          "x-forwarded-proto": "http",
          cookie: "arx-auth-session=%E0%A4%A",
        },
      },
      harness.response,
    );

    expect(harness.response.statusCode).toBe(401);
    expect(harness.readJson()).toMatchObject({ ok: false, error: "Missing auth session." });
    expect(String(harness.headers.get("Set-Cookie"))).toContain("Max-Age=0");
    expect(bridgeFetch).not.toHaveBeenCalled();
  });

  test("logout clears a malformed cookie as idempotent success without a bridge call", async () => {
    const bridgeFetch = vi.fn(async () => {
      throw new Error("auth bridge must not run");
    });
    vi.stubGlobal("fetch", bridgeFetch);
    const harness = createNodeResponseHarness();

    await logoutWebSession(
      {
        method: "POST",
        headers: {
          host: "localhost:5174",
          origin: "http://localhost:5174",
          "x-forwarded-proto": "http",
          cookie: "arx-auth-session=%E0%A4%A",
        },
      },
      harness.response,
    );

    expect(harness.response.statusCode).toBe(200);
    expect(harness.readJson()).toEqual({ ok: true });
    expect(String(harness.headers.get("Set-Cookie"))).toContain("Max-Age=0");
    expect(bridgeFetch).not.toHaveBeenCalled();
  });

  test("the OAuth callback clears malformed flow state without exchanging credentials", async () => {
    const bridgeFetch = vi.fn(async () => {
      throw new Error("auth exchange must not run");
    });
    vi.stubGlobal("fetch", bridgeFetch);
    const harness = createNodeResponseHarness();

    await googleAuthCallback(
      {
        method: "GET",
        headers: {
          host: "polynet.test",
          "x-forwarded-proto": "https",
          cookie: "__Secure-arx-auth-flow=%E0%A4%A",
        },
        query: {},
      },
      harness.response,
    );

    expect(harness.response.statusCode).toBe(302);
    expect(String(harness.headers.get("Location"))).toContain("error=auth_callback_failed");
    expect(String(harness.headers.get("Set-Cookie"))).toContain("__Secure-arx-auth-flow=");
    expect(String(harness.headers.get("Set-Cookie"))).toContain("Max-Age=0");
    expect(bridgeFetch).not.toHaveBeenCalled();
  });
});

describe("secure auth session identifiers", () => {
  test("accepts only a secure UUID and fails closed when secure randomness is unavailable", () => {
    expect(createSecureAuthSessionId(() => VALID_UUID)).toBe(VALID_UUID);
    expect(() => createSecureAuthSessionId(() => "predictable-session-id")).toThrow(
      AUTH_SECURE_RANDOM_UNAVAILABLE,
    );
    expect(() =>
      createSecureAuthSessionId(() => {
        throw new Error("rng unavailable");
      }),
    ).toThrow(AUTH_SECURE_RANDOM_UNAVAILABLE);
  });

  test("stores a deterministic one-way credential hash rather than the raw session identifier", async () => {
    const hash = await hashAuthSessionCredential(VALID_UUID);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(VALID_UUID);
    expect(await hashAuthSessionCredential(VALID_UUID)).toBe(hash);
  });

  test("server lifecycle fails closed at absolute expiry and after revocation", () => {
    expect(resolveAuthSessionLifecycle({ expiresAt: 2_000 }, 1_999)).toEqual({
      status: "active",
      expiresAt: 2_000,
    });
    expect(resolveAuthSessionLifecycle({ expiresAt: 2_000 }, 2_000)).toEqual({
      status: "terminal",
      reason: "auth_session_expired",
    });
    expect(resolveAuthSessionLifecycle({ expiresAt: 4_000, revokedAt: 1_000 }, 2_000)).toEqual({
      status: "terminal",
      reason: "auth_session_revoked",
    });
  });

  test("session creation returns a retryable failure before provisioning an actor or session", async () => {
    vi.stubEnv("ARX_AUTH_BRIDGE_SECRET", "test-bridge-secret");
    const routes: Array<{ path: string; method: string; handler: any }> = [];
    let mutationCalls = 0;

    registerRuntimeAuthBridgeRoutes({
      http: {
        route: (config) => routes.push(config),
      },
      httpAction: (handler) => handler,
      jsonResponse: (_req, status, payload) =>
        new Response(JSON.stringify(payload), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      optionsResponse: () => new Response(null, { status: 204 }),
      parseOptionalString: (raw) => (typeof raw === "string" && raw.trim() ? raw.trim() : null),
      createSessionId: () => {
        throw new Error(AUTH_SECURE_RANDOM_UNAVAILABLE);
      },
    });

    const route = routes.find(
      (candidate) =>
        candidate.path === "/runtime/auth_bridge_session_create" && candidate.method === "POST",
    );
    expect(route).toBeDefined();

    const response = await route!.handler(
      {
        auth: {
          getUserIdentity: async () => ({ subject: "secure-session-test-user" }),
        },
        runMutation: async () => {
          mutationCalls += 1;
          throw new Error("mutation must not run");
        },
      },
      new Request("https://polynet.test/runtime/auth_bridge_session_create", {
        method: "POST",
        headers: {
          Authorization: "Bearer verified-token",
          "Content-Type": "application/json",
          "X-Arx-Auth-Bridge-Secret": "test-bridge-secret",
        },
        body: JSON.stringify({
          payload: {
            access_token: "access-token",
            refresh_token: "refresh-token",
            user: { id: "secure-session-test-user" },
          },
        }),
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: AUTH_SECURE_RANDOM_UNAVAILABLE,
      error: AUTH_SECURE_RANDOM_UNAVAILABLE,
    });
    expect(mutationCalls).toBe(0);
  });

  test("a retryable refresh failure preserves the existing browser session cookie", async () => {
    vi.stubEnv("ARX_AUTH_BRIDGE_SECRET", "test-bridge-secret");
    vi.stubEnv("VITE_CONVEX_SITE_URL", "https://staging-convex.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: false,
            code: AUTH_SECURE_RANDOM_UNAVAILABLE,
            error: AUTH_SECURE_RANDOM_UNAVAILABLE,
            message: "Secure session refresh is temporarily unavailable.",
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const responseHeaders = new Map<string, unknown>();
    let responseBody = "";
    const response = {
      statusCode: 0,
      setHeader: (name: string, value: unknown) => responseHeaders.set(name, value),
      getHeader: (name: string) => responseHeaders.get(name),
      end: (value?: unknown) => {
        responseBody = String(value ?? "");
      },
    };

    await refreshWebSession(
      {
        method: "POST",
        headers: {
          host: "localhost:5174",
          origin: "http://localhost:5174",
          "x-forwarded-proto": "http",
          cookie: "arx-auth-session=existing-secure-session-id",
        },
      },
      response,
    );

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(responseBody)).toMatchObject({
      ok: false,
      error: "Secure session refresh is temporarily unavailable.",
    });
    expect(responseHeaders.has("Set-Cookie")).toBe(false);
  });

  test("a terminal subject mismatch clears the existing browser session cookie", async () => {
    vi.stubEnv("ARX_AUTH_BRIDGE_SECRET", "test-bridge-secret");
    vi.stubEnv("VITE_CONVEX_SITE_URL", "https://staging-convex.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: false,
            code: "auth_session_invalid",
            error: "auth_session_invalid",
            message: "auth_session_subject_mismatch",
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const harness = createNodeResponseHarness();

    await refreshWebSession(
      {
        method: "POST",
        headers: {
          host: "localhost:5174",
          origin: "http://localhost:5174",
          "x-forwarded-proto": "http",
          cookie: "arx-auth-session=existing-secure-session-id",
        },
      },
      harness.response,
    );

    expect(harness.response.statusCode).toBe(401);
    expect(harness.readJson()).toMatchObject({
      ok: false,
      error: "auth_session_subject_mismatch",
    });
    expect(String(harness.headers.get("Set-Cookie"))).toContain("Max-Age=0");
  });

  test("a successful refresh preserves the same browser credential", async () => {
    vi.stubEnv("ARX_AUTH_BRIDGE_SECRET", "test-bridge-secret");
    vi.stubEnv("VITE_CONVEX_SITE_URL", "https://staging-convex.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: true,
            session: {
              access_token: "refreshed-access-token",
              expires_at: Math.floor(Date.now() / 1_000) + 3_600,
              user: { id: "workos:refresh-fixture" },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const harness = createNodeResponseHarness();

    await refreshWebSession(
      {
        method: "POST",
        headers: {
          host: "localhost:5174",
          origin: "http://localhost:5174",
          "x-forwarded-proto": "http",
          cookie: "arx-auth-session=existing-secure-session-id",
        },
      },
      harness.response,
    );

    expect(harness.response.statusCode).toBe(200);
    expect(harness.readJson()).toMatchObject({
      ok: true,
      session: { access_token: "refreshed-access-token" },
    });
    expect(harness.headers.has("Set-Cookie")).toBe(false);
  });

  test("the browser credential lifetime cannot exceed server absolute expiry", () => {
    vi.stubEnv("ARX_AUTH_SESSION_COOKIE_MAX_AGE_SECONDS", String(365 * 24 * 60 * 60));
    const harness = createNodeResponseHarness();
    setAuthSessionCookie(
      harness.response,
      {
        headers: {
          host: "localhost:5174",
          "x-forwarded-proto": "http",
        },
      },
      VALID_UUID,
    );

    expect(String(harness.headers.get("Set-Cookie"))).toContain("Max-Age=2592000");
  });

  test("a logout bridge transport failure is retryable and preserves the browser session cookie", async () => {
    vi.stubEnv("ARX_AUTH_BRIDGE_SECRET", "test-bridge-secret");
    vi.stubEnv("VITE_CONVEX_SITE_URL", "https://staging-convex.test");
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("bridge unavailable");
    }));
    const harness = await invokeWebLogoutWithCookie();

    expect(harness.response.statusCode).toBe(503);
    expect(harness.readJson()).toMatchObject({
      ok: false,
      code: "auth_logout_unavailable",
    });
    expect(harness.headers.has("Set-Cookie")).toBe(false);
  });

  test("an unsuccessful logout bridge response preserves the browser session cookie", async () => {
    vi.stubEnv("ARX_AUTH_BRIDGE_SECRET", "test-bridge-secret");
    vi.stubEnv("VITE_CONVEX_SITE_URL", "https://staging-convex.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: false,
            code: "auth_session_unavailable",
            error: "auth_session_unavailable",
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const harness = await invokeWebLogoutWithCookie();

    expect(harness.response.statusCode).toBe(503);
    expect(harness.headers.has("Set-Cookie")).toBe(false);
  });

  test("a confirmed logout clears the browser session cookie", async () => {
    vi.stubEnv("ARX_AUTH_BRIDGE_SECRET", "test-bridge-secret");
    vi.stubEnv("VITE_CONVEX_SITE_URL", "https://staging-convex.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const harness = await invokeWebLogoutWithCookie();

    expect(harness.response.statusCode).toBe(200);
    expect(String(harness.headers.get("Set-Cookie"))).toContain("Max-Age=0");
  });
});

describe("confirmed auth logout", () => {
  test("only a missing session is idempotent success; an invalid session fails closed", () => {
    expect(classifyAuthSessionLogoutResolutionFailure("auth_session_missing")).toEqual({
      status: "ok",
    });
    expect(classifyAuthSessionLogoutResolutionFailure("auth_session_invalid")).toEqual({
      status: "transient_failure",
      reason: "auth_session_invalid",
    });
  });

  test("browser state changes only after remote logout is confirmed", async () => {
    const failedEffects: string[] = [];
    const failed = await completeConfirmedSignOut({
      confirmRemoteLogout: async () => {
        failedEffects.push("remote");
        return { status: "transient_failure", reason: "bridge unavailable" };
      },
      beforeLocalClear: () => {
        failedEffects.push("before-local-clear");
      },
      clearLocalSession: () => {
        failedEffects.push("clear-local-session");
      },
      afterLocalClear: () => {
        failedEffects.push("after-local-clear");
      },
    });

    expect(failed).toEqual({ status: "transient_failure", reason: "bridge unavailable" });
    expect(failedEffects).toEqual(["remote"]);

    const confirmedEffects: string[] = [];
    const confirmed = await completeConfirmedSignOut({
      confirmRemoteLogout: async () => {
        confirmedEffects.push("remote");
        return { status: "signed_out" };
      },
      beforeLocalClear: () => {
        confirmedEffects.push("before-local-clear");
      },
      clearLocalSession: () => {
        confirmedEffects.push("clear-local-session");
      },
      afterLocalClear: () => {
        confirmedEffects.push("after-local-clear");
      },
    });

    expect(confirmed).toEqual({ status: "signed_out" });
    expect(confirmedEffects).toEqual([
      "remote",
      "before-local-clear",
      "clear-local-session",
      "after-local-clear",
    ]);
  });

  test("local server revocation is authoritative and precedes provider logout", async () => {
    const effects: string[] = [];
    const result = await completeConfirmedAuthSessionLogout({
      revokeLocalSession: async () => {
        effects.push("local-revocation");
      },
      logoutProvider: async () => {
        effects.push("provider-logout");
        return "succeeded";
      },
    });

    expect(result).toEqual({ status: "ok", providerLogoutOutcome: "succeeded" });
    expect(effects).toEqual(["local-revocation", "provider-logout"]);
  });

  test("local revocation failure remains retryable and prevents provider logout", async () => {
    let providerCalls = 0;
    const result = await completeConfirmedAuthSessionLogout({
      revokeLocalSession: async () => {
        throw new Error("local revoke unavailable");
      },
      logoutProvider: async () => {
        providerCalls += 1;
        return "succeeded";
      },
    });

    expect(result).toEqual({
      status: "transient_failure",
      reason: "local revoke unavailable",
    });
    expect(providerCalls).toBe(0);
  });

  test("provider failure cannot undo confirmed local revocation", async () => {
    const result = await completeConfirmedAuthSessionLogout({
      revokeLocalSession: async () => {},
      logoutProvider: async () => {
        throw new Error("provider unavailable");
      },
    });

    expect(result).toEqual({ status: "ok", providerLogoutOutcome: "failed" });
  });
});
