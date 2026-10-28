import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { buildTelemetryRouteLabel } from "../shared/routePrivacy.ts";

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

assert.equal(
  buildTelemetryRouteLabel({
    pathname: "/claim",
    search: "?token=claim_secret&tab=community",
  }),
  "/claim?tab=community",
);
assert.equal(
  buildTelemetryRouteLabel({
    pathname: "/checkout/success",
    search: "?session_id=checkout_secret&source=funnel",
  }),
  "/checkout/success?source=funnel",
);
assert.equal(
  buildTelemetryRouteLabel({
    pathname: "/api/auth/google/callback",
    search: "?code=oauth_code&state=oauth_state&error=access_denied",
  }),
  "/api/auth/google/callback?error=access_denied",
);

const telemetryLifecycleSource = readText(
  new URL(
    "../apps/web/src/controllers/useWebTelemetryLifecycle.ts",
    import.meta.url,
  ),
);
const mainSource = readText(new URL("../apps/web/src/main.tsx", import.meta.url));
const payFirstSource = readText(new URL("../shared/pay_first.ts", import.meta.url));
const billingCoreSource = readText(new URL("../convex/billingCore.ts", import.meta.url));
const communityCommerceSource = readText(new URL("../convex/communityCommerce.ts", import.meta.url));
const publicAppUrlSource = readText(new URL("../convex/publicAppUrl.ts", import.meta.url));

assert.ok(
  telemetryLifecycleSource.includes("buildCurrentTelemetryPathname()"),
  "expected the telemetry lifecycle to use sanitized route labels",
);
const appTelemetryContextBlock = sliceBetween(
  telemetryLifecycleSource,
  "useEffect(() => {\n    const pathname = buildCurrentTelemetryPathname();",
  "  }, [\n    params.accountTier,",
);
assert.ok(
  !appTelemetryContextBlock.includes("`${window.location.pathname}${window.location.search}${window.location.hash}`"),
  "expected App telemetry context to avoid full URL search/hash capture",
);
assert.ok(
  mainSource.includes("buildTelemetryRouteLabel({"),
  "expected module-load recovery target to use sanitized route labels",
);

assert.ok(
  payFirstSource.includes("PENDING_PURCHASE_CLAIM_TOKEN_TTL_MS"),
  "expected pending purchase claim token storage to define a TTL",
);
assert.ok(
  payFirstSource.includes("expires_at"),
  "expected pending purchase claim token storage to persist an expiry",
);
assert.ok(
  payFirstSource.includes("clearPendingPurchaseClaimToken();"),
  "expected expired pending purchase claim tokens to be cleared",
);

assert.ok(
  billingCoreSource.includes("export function requireCanonicalCheckoutReturnUrl"),
  "expected billingCore to expose canonical checkout return URL validation",
);
assert.ok(
  billingCoreSource.includes('from "./publicAppUrl"'),
  "expected billingCore checkout validation to use the shared canonical public app origin helper",
);
assert.ok(
  publicAppUrlSource.includes("export function readCanonicalPublicAppOrigin(): string"),
  "expected checkout URL validation to share the public app origin helper",
);
assert.ok(
  billingCoreSource.includes("parsed.origin !== readCanonicalPublicAppOrigin()"),
  "expected checkout return URL validation to compare against canonical app origin",
);
const buildCheckoutSuccessUrlBlock = sliceBetween(
  billingCoreSource,
  "export function buildCheckoutSuccessUrl",
  "export async function ensureCommunityMembership",
);
assert.ok(
  buildCheckoutSuccessUrlBlock.includes("requireCanonicalCheckoutReturnUrl("),
  "expected community checkout success URL builder to validate canonical origin",
);

const startPublicCommunityCheckoutBlock = sliceBetween(
  communityCommerceSource,
  "export const startPublicCommunityCheckout = action({",
  "export const requirePublicCommunityCheckoutNotBlockedInternal = internalQuery({",
);
assert.ok(
  startPublicCommunityCheckoutBlock.includes("requireCanonicalCheckoutReturnUrl("),
  "expected public community checkout cancel URL to be canonical-origin validated",
);

assert.ok(
  !existsSync(new URL("../convex/workspaceCredits.ts", import.meta.url)),
  "the workspace credit module, with its top-up checkout, stays deleted",
);

console.log("PASS: purchase token hygiene boundaries are enforced");
