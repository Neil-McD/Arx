import { expect, test } from "vitest";
import { bearerTokenAudienceIncludes } from "./httpMcp";

const MCP = "https://www.polynet.ai/runtime/mcp";
const b64url = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = (claims: Record<string, unknown>) => `${b64url({ alg: "RS256" })}.${b64url(claims)}.sig`;
const req = (authorization?: string) => new Request("https://x.convex.site/runtime/mcp", {
  method: "POST", headers: authorization ? { authorization } : {},
});

test("MCP takes only tokens minted for MCP", () => {
  // An MCP client's token: audience is this resource (alone or among others).
  expect(bearerTokenAudienceIncludes(req(`Bearer ${token({ sub: "u", aud: MCP })}`), MCP)).toBe(true);
  expect(bearerTokenAudienceIncludes(req(`Bearer ${token({ sub: "u", aud: ["other", MCP] })}`), MCP)).toBe(true);
  // A Studio browser token (no aud), another app's token, or anything else: refused.
  expect(bearerTokenAudienceIncludes(req(`Bearer ${token({ sub: "u" })}`), MCP)).toBe(false);
  expect(bearerTokenAudienceIncludes(req(`Bearer ${token({ sub: "u", aud: "studio-client" })}`), MCP)).toBe(false);
  expect(bearerTokenAudienceIncludes(req("Bearer not-a-jwt"), MCP)).toBe(false);
  expect(bearerTokenAudienceIncludes(req(), MCP)).toBe(false);
  // Unconfigured: fail closed.
  expect(bearerTokenAudienceIncludes(req(`Bearer ${token({ sub: "u", aud: MCP })}`), "")).toBe(false);
});
