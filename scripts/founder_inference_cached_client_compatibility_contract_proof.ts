import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const backend = read("convex/founderInference.ts");
const billing = read("convex/founderBilling.ts");
const compatibilityStart = backend.indexOf(
  "const FOUNDER_INFERENCE_BYOK_RETIRED",
);
const compatibilityEnd = backend.indexOf("function fundingAuthorityMatches");
assert.ok(compatibilityStart >= 0 && compatibilityEnd > compatibilityStart);
const compatibility = backend.slice(compatibilityStart, compatibilityEnd);

for (const legacyOperation of [
  "getCurrentFounderInferenceStatus",
  "activateFounderInference",
  "suspendFounderInference",
]) {
  assert.match(
    compatibility,
    new RegExp(`export const ${legacyOperation}\\b`),
    `${legacyOperation} must remain during the cached-client window`,
  );
}
assert.match(compatibility, /eligible: false/);
assert.match(compatibility, /key_connected: false/);
assert.match(compatibility, /communities: \[\]/);
assert.match(compatibility, /throw new Error\(FOUNDER_INFERENCE_BYOK_RETIRED\)/);
assert.match(compatibility, /status: "retired" as const/);
assert.match(compatibility, /founder_inference_byok_retired/);
assert.doesNotMatch(
  compatibility,
  /ctx\.|db\.|runQuery|runMutation|userProviderConnections|founderInferenceGrants|legalAcceptances|decrypt|apiKey|Stripe/i,
  "cached-client tombstones must expose no authority or credential access",
);

assert.doesNotMatch(
  backend,
  /export const (?:prepareFounderInferenceActivationInternal|completeFounderInferenceActivationInternal)\b/,
  "retired activation internals must not return",
);
for (const builderOperation of [
  "startPublicBuilderCheckout",
  "getFounderCheckoutReceiptStatus",
  "claimFounderCheckoutReceipt",
  "claimFounderCheckoutReceiptByVerifiedEmail",
]) {
  assert.match(
    billing,
    new RegExp(`export const ${builderOperation}\\b`),
    `candidate backend missing ${builderOperation}`,
  );
}

console.log(
  "PASS: cached founder clients fail safely while canonical Builder checkout RPCs remain available.",
);
