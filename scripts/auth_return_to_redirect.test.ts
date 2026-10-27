import { expect, test } from "vitest";
// @ts-expect-error plain ES module without types
import { buildRedirectUrl, normalizeReturnToPath } from "../api/auth/_cookies.js";

const req = { headers: { host: "polynet.ai", "x-forwarded-proto": "https" } };

test("after sign-in, the redirect never leaves Polynet", () => {
  for (const hostile of ["//evil.com", "/\\evil.com", "/\\/evil.com", "/\t/evil.com", "/\n/evil.com", "https://evil.com", "javascript:alert(1)"]) {
    expect(normalizeReturnToPath(hostile)).toBe("/");
    expect(buildRedirectUrl(req, hostile)).toBe("https://polynet.ai/");
  }
});

test("same-site paths, queries and hashes survive", () => {
  expect(buildRedirectUrl(req, "/c/run-club/agent?tab=1#top")).toBe("https://polynet.ai/c/run-club/agent?tab=1#top");
  expect(buildRedirectUrl(req, "#settings")).toBe("https://polynet.ai/#settings");
  expect(buildRedirectUrl(req, "/", { error: "auth_callback_failed" })).toBe("https://polynet.ai/?error=auth_callback_failed");
});
