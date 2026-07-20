/// <reference types="vite/client" />

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  AUTH_SECURE_RANDOM_UNAVAILABLE,
  classifyAuthSessionLogoutResolutionFailure,
  completeConfirmedAuthSessionLogout,
  createSecureAuthSessionId,
  prepareSecureAuthSessionRotation,
} from "./authSessions";
import { registerRuntimeAuthBridgeRoutes } from "./httpAuthBridge";
import logoutWebSession from "../api/auth/logout.js";
import refreshWebSession from "../api/auth/refresh.js";
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
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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

  test("reserves the replacement identifier before calling the upstream refresh provider", async () => {
    const effects: string[] = [];
    const result = await prepareSecureAuthSessionRotation({
      createSessionId: () => {
        effects.push("session-id");
        return VALID_UUID;
      },
      refreshUpstream: async () => {
        effects.push("upstream-refresh");
        return { accessToken: "refreshed" };
      },
    });

    expect(effects).toEqual(["session-id", "upstream-refresh"]);
    expect(result).toEqual({
      newSessionId: VALID_UUID,
      refreshed: { accessToken: "refreshed" },
    });
  });

  test("does not call the upstream refresh provider when identifier generation fails", async () => {
    let upstreamRefreshCalls = 0;

    await expect(
      prepareSecureAuthSessionRotation({
        createSessionId: () =>
          createSecureAuthSessionId(() => {
            throw new Error("rng unavailable");
          }),
        refreshUpstream: async () => {
          upstreamRefreshCalls += 1;
          return { accessToken: "must-not-exist" };
        },
      }),
    ).rejects.toThrow(AUTH_SECURE_RANDOM_UNAVAILABLE);

    expect(upstreamRefreshCalls).toBe(0);
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
  test("only a missing session is idempotent success; an invalid replacement chain fails closed", () => {
    expect(classifyAuthSessionLogoutResolutionFailure("auth_session_missing")).toEqual({
      status: "ok",
    });
    expect(classifyAuthSessionLogoutResolutionFailure("auth_session_chain_invalid")).toEqual({
      status: "transient_failure",
      reason: "auth_session_chain_invalid",
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
