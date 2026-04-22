import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const builderCommerceSource = readFileSync(
  new URL("../convex/builderCommerce.ts", import.meta.url),
  "utf8",
);
const webBuilderBillingSource = readFileSync(
  new URL("../apps/web/src/controllers/useWebBuilderBillingActions.ts", import.meta.url),
  "utf8",
);
const cloudBuilderBillingGatewaySource = readFileSync(
  new URL("../shared/cloudBuilderBillingGateway.ts", import.meta.url),
  "utf8",
);
const builderBillingSharedSource = readFileSync(
  new URL("../shared/builderBilling.ts", import.meta.url),
  "utf8",
);

function sliceBetween(source: string, startMarker: string, endMarker?: string): string {
  const start = source.indexOf(startMarker);
  assert(start >= 0, `expected source to contain marker: ${startMarker}`);
  if (!endMarker) return source.slice(start);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(end >= 0, `expected source to contain marker: ${endMarker}`);
  return source.slice(start, end);
}

const startBuilderCheckoutBlock = sliceBetween(
  builderCommerceSource,
  "export const startBuilderCheckout = action({",
  "export const openBuilderBillingPortal = action({",
);
const openBuilderBillingPortalBlock = sliceBetween(
  builderCommerceSource,
  "export const openBuilderBillingPortal = action({",
  "export const startConnectOnboarding = action({",
);
const startConnectOnboardingBlock = sliceBetween(
  builderCommerceSource,
  "export const startConnectOnboarding = action({",
);
const startCloudBuilderCheckoutBlock = sliceBetween(
  cloudBuilderBillingGatewaySource,
  "export async function startCloudBuilderCheckout",
  "export async function openCloudBuilderBillingPortal",
);
const openCloudBuilderBillingPortalBlock = sliceBetween(
  cloudBuilderBillingGatewaySource,
  "export async function openCloudBuilderBillingPortal",
  "export async function startCloudWorkspaceCreditTopupCheckout",
);
const startCloudConnectOnboardingBlock = sliceBetween(
  cloudBuilderBillingGatewaySource,
  "export async function startCloudConnectOnboarding",
);

assert(
  builderCommerceSource.includes("function readCanonicalPublicAppOrigin(): string"),
  "expected builderCommerce to define a canonical public app origin helper",
);
assert(
  builderCommerceSource.includes("function buildBuilderBillingRedirectUrls"),
  "expected builderCommerce to build billing redirect URLs on the server",
);
assert(
  builderCommerceSource.includes("context: BUILDER_BILLING_CONTEXT_VALIDATOR"),
  "expected builder billing actions to accept semantic context",
);
assert(
  !startBuilderCheckoutBlock.includes("successUrl: v.string()"),
  "expected builder checkout action to stop accepting client successUrl",
);
assert(
  !startBuilderCheckoutBlock.includes("cancelUrl: v.string()"),
  "expected builder checkout action to stop accepting client cancelUrl",
);
assert(
  !openBuilderBillingPortalBlock.includes("returnUrl: v.string()"),
  "expected builder portal action to stop accepting client returnUrl",
);
assert(
  !startConnectOnboardingBlock.includes("returnUrl: v.string()"),
  "expected connect onboarding action to stop accepting client returnUrl",
);
assert(
  !startConnectOnboardingBlock.includes("refreshUrl: v.string()"),
  "expected connect onboarding action to stop accepting client refreshUrl",
);
assert(
  startConnectOnboardingBlock.includes('context: BUILDER_CONNECT_CONTEXT_VALIDATOR'),
  "expected connect onboarding action to accept semantic context",
);

assert(
  !webBuilderBillingSource.includes("window.location.origin"),
  "expected web builder billing actions to stop reading browser origin",
);
assert(
  !webBuilderBillingSource.includes("buildBuilderCheckoutRequestPayload"),
  "expected web builder billing actions to stop building checkout URLs locally",
);
assert(
  !webBuilderBillingSource.includes("buildBuilderPortalRequestPayload"),
  "expected web builder billing actions to stop building portal URLs locally",
);

assert(
  cloudBuilderBillingGatewaySource.includes("context: params.context"),
  "expected cloud builder billing gateway to forward semantic context",
);
assert(
  !startCloudBuilderCheckoutBlock.includes("successUrl: params.successUrl"),
  "expected cloud builder checkout gateway to stop forwarding successUrl",
);
assert(
  !startCloudBuilderCheckoutBlock.includes("cancelUrl: params.cancelUrl"),
  "expected cloud builder checkout gateway to stop forwarding cancelUrl",
);
assert(
  !openCloudBuilderBillingPortalBlock.includes("returnUrl: params.returnUrl"),
  "expected cloud builder portal gateway to stop forwarding returnUrl",
);
assert(
  !startCloudConnectOnboardingBlock.includes("returnUrl: params.returnUrl"),
  "expected cloud connect onboarding gateway to stop forwarding returnUrl",
);
assert(
  !startCloudConnectOnboardingBlock.includes("refreshUrl: params.refreshUrl"),
  "expected cloud connect onboarding gateway to stop forwarding refreshUrl",
);

assert(
  !builderBillingSharedSource.includes("export function buildBuilderCheckoutRequestPayload"),
  "expected shared builder billing helpers to drop client checkout URL builders",
);
assert(
  !builderBillingSharedSource.includes("export function buildBuilderPortalRequestPayload"),
  "expected shared builder billing helpers to drop client portal URL builders",
);

console.log("PASS: builder billing redirect authority is server-owned");
