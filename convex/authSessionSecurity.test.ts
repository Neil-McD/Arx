/// <reference types="vite/client" />

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  AUTH_SECURE_RANDOM_UNAVAILABLE,
  createSecureAuthSessionId,
  prepareSecureAuthSessionRotation,
} from "./authSessions";
import { registerRuntimeAuthBridgeRoutes } from "./httpAuthBridge";
import refreshWebSession from "../api/auth/refresh.js";

const VALID_UUID = "123e4567-e89b-42d3-a456-426614174000";

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
});
