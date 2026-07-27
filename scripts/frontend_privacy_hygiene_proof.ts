import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readText(path: string | URL): string {
  return readFileSync(path, "utf8");
}

const vercelConfig = JSON.parse(readText(new URL("../vercel.json", import.meta.url))) as {
  headers?: unknown;
  routes?: Array<{
    src?: unknown;
    headers?: Record<string, unknown>;
    continue?: unknown;
  }>;
};

assert.equal(
  vercelConfig.headers,
  undefined,
  "expected Vercel anti-framing headers to use routes because this config already uses routes",
);

const antiFramingRoute = (vercelConfig.routes ?? []).find((route) => {
  const headers = route.headers ?? {};
  return (
    headers["Content-Security-Policy"] === "frame-ancestors 'self'" &&
    headers["X-Frame-Options"] === "SAMEORIGIN"
  );
});
assert.ok(antiFramingRoute, "expected a routes-compatible anti-framing header rule");
assert.equal(
  antiFramingRoute?.continue,
  true,
  "expected anti-framing header route to continue into normal SPA routing",
);

assert.equal(
  antiFramingRoute?.headers?.["Content-Security-Policy"],
  "frame-ancestors 'self'",
  "expected Vercel CSP to restrict framing to same-origin",
);
assert.equal(
  antiFramingRoute?.headers?.["X-Frame-Options"],
  "SAMEORIGIN",
  "expected Vercel X-Frame-Options fallback to restrict framing to same-origin",
);

const appSource = readText(new URL("../apps/web/src/App.tsx", import.meta.url));

for (const retiredGuestMarker of [
  "polynet_guest_thread_v1",
  "arx_guest_thread_v1",
  "GuestThreadStorageV1",
  "loadGuestThreadStorage",
  "storeGuestThreadStorage",
  "guestStoredToThreadMessages",
  "setGuestInferenceIssueById",
  "useWebGuestThreadLifecycle",
]) {
  assert.ok(
    !appSource.includes(retiredGuestMarker),
    `expected deleted guest conversation storage marker to remain absent: ${retiredGuestMarker}`,
  );
}

console.log("PASS: frontend privacy hygiene and guest conversation-storage absence are enforced");
