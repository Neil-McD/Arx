// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildProxyHeaders, proxyConvexRuntimeRequest } from "../api/mcp/_proxy.js";

function fakeResponse() {
  const headers = new Map();
  return {
    body: Buffer.alloc(0),
    headers,
    statusCode: 0,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), String(value));
    },
    end(value) {
      this.body = value === undefined ? Buffer.alloc(0) : Buffer.from(value);
    },
  };
}

const originalSiteUrl = process.env.VITE_CONVEX_SITE_URL;
const originalPublicKey = process.env.VITE_CONVEX_PUBLIC_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalSiteUrl === undefined) delete process.env.VITE_CONVEX_SITE_URL;
  else process.env.VITE_CONVEX_SITE_URL = originalSiteUrl;
  if (originalPublicKey === undefined) delete process.env.VITE_CONVEX_PUBLIC_KEY;
  else process.env.VITE_CONVEX_PUBLIC_KEY = originalPublicKey;
});

describe("MCP proxy request headers", () => {
  it("forwards only MCP application headers and reconstructs proxy headers", () => {
    process.env.VITE_CONVEX_PUBLIC_KEY = "convex-public-key";
    const headers = buildProxyHeaders(
      {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "access-control-request-headers": "authorization, mcp-protocol-version",
          "access-control-request-method": "POST",
          authorization: "Bearer member-token",
          connection: "keep-alive, x-remove-me",
          "content-length": "123",
          "content-type": "application/json",
          cookie: "session=private",
          expect: "100-continue",
          host: "www.polynet.ai",
          "keep-alive": "timeout=5",
          "last-event-id": "event-7",
          "mcp-protocol-version": "2025-11-25",
          "mcp-session-id": "session-4",
          origin: "https://client.example",
          te: "trailers",
          trailer: "x-checksum",
          "transfer-encoding": "chunked",
          upgrade: "websocket",
          "x-forwarded-for": "203.0.113.1",
          "x-forwarded-proto": "https",
          "x-remove-me": "private",
          "x-vercel-id": "iad1::private",
        },
      },
      "request-123",
    );

    expect(Object.fromEntries(headers.entries())).toEqual({
      accept: "application/json, text/event-stream",
      apikey: "convex-public-key",
      authorization: "Bearer member-token",
      "content-type": "application/json",
      "last-event-id": "event-7",
      "mcp-protocol-version": "2025-11-25",
      "mcp-session-id": "session-4",
      origin: "https://client.example",
      "x-arx-request-id": "request-123",
      "x-forwarded-host": "www.polynet.ai",
      "x-forwarded-proto": "https",
    });
  });

  it("honors Connection-nominated headers even when they are normally allowed", () => {
    const headers = buildProxyHeaders(
      {
        headers: {
          authorization: "Bearer member-token",
          connection: "authorization",
          host: "www.polynet.ai",
        },
      },
      "request-connection-token",
    );

    expect(headers.has("authorization")).toBe(false);
  });

  it("forwards CORS negotiation only for OPTIONS", () => {
    const requestHeaders = {
      "access-control-request-headers":
        "authorization, content-type, mcp-protocol-version",
      "access-control-request-method": "POST",
      connection: "keep-alive",
      expect: "100-continue",
      host: "www.polynet.ai",
      origin: "https://client.example",
      "transfer-encoding": "chunked",
    };
    const optionsHeaders = buildProxyHeaders(
      { method: "OPTIONS", headers: requestHeaders },
      "request-options",
    );
    const postHeaders = buildProxyHeaders(
      { method: "POST", headers: requestHeaders },
      "request-post",
    );

    expect(optionsHeaders.get("access-control-request-method")).toBe("POST");
    expect(optionsHeaders.get("access-control-request-headers")).toBe(
      "authorization, content-type, mcp-protocol-version",
    );
    expect(optionsHeaders.get("origin")).toBe("https://client.example");
    expect(optionsHeaders.get("transfer-encoding")).toBeNull();
    expect(optionsHeaders.get("expect")).toBeNull();
    expect(postHeaders.get("access-control-request-method")).toBeNull();
    expect(postHeaders.get("access-control-request-headers")).toBeNull();
  });
});

describe("MCP proxy behavior", () => {
  it("preserves the body and upstream OAuth response without forwarding framing", async () => {
    process.env.VITE_CONVEX_SITE_URL = "https://example.convex.site";
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" });
    let forwarded;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        forwarded = { url, init };
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: {
            "content-type": "application/json",
            "www-authenticate": 'Bearer resource_metadata="https://www.polynet.ai/.well-known/oauth-protected-resource"',
          },
        });
      }),
    );
    const response = fakeResponse();

    await proxyConvexRuntimeRequest(
      {
        method: "POST",
        body,
        headers: {
          accept: "application/json, text/event-stream",
          authorization: "Bearer member-token",
          "content-type": "application/json",
          expect: "100-continue",
          host: "www.polynet.ai",
          "mcp-protocol-version": "2025-11-25",
          "transfer-encoding": "chunked",
        },
      },
      response,
      "/runtime/mcp",
    );

    expect(forwarded.url).toBe("https://example.convex.site/runtime/mcp");
    expect(forwarded.init.body).toBe(body);
    expect(forwarded.init.headers.get("transfer-encoding")).toBeNull();
    expect(forwarded.init.headers.get("expect")).toBeNull();
    expect(forwarded.init.headers.get("content-length")).toBeNull();
    expect(forwarded.init.headers.get("authorization")).toBe("Bearer member-token");
    expect(response.statusCode).toBe(401);
    expect(response.headers.get("www-authenticate")).toMatch(/^Bearer /);
    expect(response.headers.get("x-arx-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(response.body.toString())).toEqual({ error: "unauthorized" });
  });

  it("returns a correlated sanitized 502 without logging credentials or content", async () => {
    process.env.VITE_CONVEX_SITE_URL = "https://example.convex.site";
    const fetchError = new TypeError("fetch failed");
    fetchError.cause = { code: "UND_ERR_INVALID_ARG" };
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(fetchError)));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = fakeResponse();

    await proxyConvexRuntimeRequest(
      {
        method: "POST",
        body: JSON.stringify({ text: "private channel message" }),
        headers: {
          authorization: "Bearer private-token",
          expect: "100-continue",
          host: "www.polynet.ai",
          "transfer-encoding": "chunked",
        },
      },
      response,
      "/runtime/mcp",
    );

    expect(response.statusCode).toBe(502);
    const payload = JSON.parse(response.body.toString());
    expect(payload).toMatchObject({
      error: "mcp_runtime_proxy_failed",
      error_description: "MCP runtime proxy request failed.",
    });
    expect(payload.request_id).toBe(response.headers.get("x-arx-request-id"));
    const logged = consoleError.mock.calls.flat().join(" ");
    expect(logged).toContain('"causeCode":"UND_ERR_INVALID_ARG"');
    expect(logged).toContain('"transferEncoding":true');
    expect(logged).toContain('"expect":true');
    expect(logged).not.toContain("private-token");
    expect(logged).not.toContain("private channel message");
  });

  it("preserves an upstream CORS preflight response", async () => {
    process.env.VITE_CONVEX_SITE_URL = "https://example.convex.site";
    let forwarded;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        forwarded = { url, init };
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-headers":
              "authorization, content-type, mcp-protocol-version",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-origin": "https://client.example",
          },
        });
      }),
    );
    const response = fakeResponse();

    await proxyConvexRuntimeRequest(
      {
        method: "OPTIONS",
        body: "",
        headers: {
          "access-control-request-headers":
            "authorization, content-type, mcp-protocol-version",
          "access-control-request-method": "POST",
          host: "www.polynet.ai",
          origin: "https://client.example",
          "transfer-encoding": "chunked",
        },
      },
      response,
      "/runtime/mcp",
    );

    expect(forwarded.url).toBe("https://example.convex.site/runtime/mcp");
    expect(forwarded.init.method).toBe("OPTIONS");
    expect(forwarded.init.headers.get("access-control-request-method")).toBe("POST");
    expect(forwarded.init.headers.get("access-control-request-headers")).toBe(
      "authorization, content-type, mcp-protocol-version",
    );
    expect(forwarded.init.headers.get("transfer-encoding")).toBeNull();
    expect(response.statusCode).toBe(204);
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "authorization, content-type, mcp-protocol-version",
    );
    expect(response.body.byteLength).toBe(0);
  });
});
