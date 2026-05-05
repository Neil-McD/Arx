import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readText(path: string | URL): string {
  return readFileSync(path, "utf8");
}

function sliceBetween(source: string, startMarker: string, endMarker?: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `expected source to contain marker: ${startMarker}`);
  if (!endMarker) return source.slice(start);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end >= 0, `expected source to contain marker: ${endMarker}`);
  return source.slice(start, end);
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

assert.ok(
  appSource.includes("const GUEST_THREAD_STORAGE_TTL_MS = 24 * 60 * 60 * 1000;"),
  "expected guest chat storage to use a 24-hour TTL",
);
assert.ok(
  appSource.includes("stored_at?: number;"),
  "expected guest chat storage to persist stored_at metadata",
);
assert.ok(
  appSource.includes("expires_at?: number;"),
  "expected guest chat storage to persist expires_at metadata",
);

const loadGuestThreadStorageBlock = sliceBetween(
  appSource,
  "function loadGuestThreadStorage(): GuestThreadStorageV1",
  "function storeGuestThreadStorage(storage: GuestThreadStorageV1): void",
);
assert.ok(
  loadGuestThreadStorageBlock.includes("isExpiredGuestThreadStorage("),
  "expected guest chat storage reads to reject expired storage",
);
assert.ok(
  loadGuestThreadStorageBlock.includes("clearGuestThreadStorage();"),
  "expected expired guest chat storage to be removed from localStorage",
);
assert.ok(
  loadGuestThreadStorageBlock.includes("storeGuestThreadStorage(storage);"),
  "expected legacy guest chat storage to be migrated to TTL storage",
);

const storeGuestThreadStorageBlock = sliceBetween(
  appSource,
  "function storeGuestThreadStorage(storage: GuestThreadStorageV1): void",
  "function guestStoredToThreadMessages(storage: GuestThreadStorageV1): ThreadMessage[]",
);
assert.ok(
  storeGuestThreadStorageBlock.includes("expires_at: nowMs + GUEST_THREAD_STORAGE_TTL_MS"),
  "expected guest chat storage writes to refresh expiry",
);

const postAuthGuestCleanupBlock = sliceBetween(
  appSource,
  "useEffect(() => {\n    if (!session) return;\n    setGuestInferenceIssueById({});",
  "  }, [session]);",
);
assert.ok(
  postAuthGuestCleanupBlock.includes("clearGuestThreadStorage();"),
  "expected guest chat storage to clear when the user signs in",
);

console.log("PASS: frontend privacy hygiene boundaries are enforced");
