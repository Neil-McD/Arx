import assert from "node:assert/strict";

import {
  buildAttachStripeCustomerPatchForExisting,
} from "../shared/stripeCustomerIdempotency.ts";

const NOW = 1_765_000_000_000;

function assertPatchKeys(
  patch: Record<string, unknown> | null,
  expectedKeys: string[],
  message: string,
) {
  assert.ok(patch, message);
  assert.deepEqual(Object.keys(patch).sort(), expectedKeys.sort(), message);
}

function proveAttachSameCustomerNoops() {
  const patch = buildAttachStripeCustomerPatchForExisting({
    existing: {
      providerCustomerId: "cus_same",
      email: "user@example.com",
      updatedAt: NOW - 1,
    },
    providerCustomerId: "cus_same",
    email: "USER@example.com",
    nowMs: NOW,
  });
  assert.equal(patch, null, "same customer and normalized email must not patch");
  console.log("PASS: same Stripe customer attach is a no-op");
}

function proveAttachFillsMissingEmailOnly() {
  const patch = buildAttachStripeCustomerPatchForExisting({
    existing: {
      providerCustomerId: "cus_same",
      updatedAt: NOW - 1,
    },
    providerCustomerId: "cus_same",
    email: "user@example.com",
    nowMs: NOW,
  });
  assertPatchKeys(patch, ["email", "updatedAt"], "missing email should patch only email");
  assert.equal(patch?.email, "user@example.com");
  assert.equal(patch?.updatedAt, NOW);
  console.log("PASS: attach fills missing customer email without touching card state");
}

function proveAttachChangedCustomerResetsCardState() {
  const patch = buildAttachStripeCustomerPatchForExisting({
    existing: {
      providerCustomerId: "cus_old",
      email: "user@example.com",
      paymentMethodStatus: "active",
      providerDefaultPaymentMethodId: "pm_old",
      cardBrand: "visa",
      cardLast4: "4242",
      cardExpMonth: 12,
      cardExpYear: 2030,
      updatedAt: NOW - 1,
    },
    providerCustomerId: "cus_new",
    email: "user@example.com",
    nowMs: NOW,
  });
  assertPatchKeys(
    patch,
    [
      "cardBrand",
      "cardExpMonth",
      "cardExpYear",
      "cardLast4",
      "cardRemovedAt",
      "paymentMethodCheckedAt",
      "paymentMethodStatus",
      "providerCustomerId",
      "providerDefaultPaymentMethodId",
      "updatedAt",
    ],
    "changed customer should reset old card state",
  );
  assert.equal(patch?.providerCustomerId, "cus_new");
  assert.equal(patch?.paymentMethodStatus, "missing");
  assert.equal(patch?.providerDefaultPaymentMethodId, undefined);
  assert.equal(patch?.cardRemovedAt, NOW);
  console.log("PASS: changed Stripe customer resets stale card state");
}

proveAttachSameCustomerNoops();
proveAttachFillsMissingEmailOnly();
proveAttachChangedCustomerResetsCardState();

console.log("stripe_customer_idempotency_proof: ok");
