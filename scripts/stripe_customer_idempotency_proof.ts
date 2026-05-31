import assert from "node:assert/strict";

import {
  buildAttachStripeCustomerPatchForExisting,
  buildSyncStripeCustomerPaymentMethodPatch,
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

function proveSameActiveCardNoops() {
  const patch = buildSyncStripeCustomerPaymentMethodPatch({
    existing: {
      provider: "stripe",
      providerCustomerId: "cus_same",
      paymentMethodStatus: "active",
      providerDefaultPaymentMethodId: "pm_same",
      paymentMethodCheckedAt: NOW - 1,
      cardBrand: "visa",
      cardLast4: "4242",
      cardExpMonth: 12,
      cardExpYear: 2030,
    },
    providerCustomerId: "cus_same",
    status: "active",
    providerDefaultPaymentMethodId: "pm_same",
    cardBrand: "visa",
    cardLast4: "4242",
    cardExpMonth: 12,
    cardExpYear: 2030,
    nowMs: NOW,
  });
  assert.equal(patch, null, "same active card snapshot must not patch checkedAt only");
  console.log("PASS: same active card sync is a no-op");
}

function proveActiveCardClearsRemovedMarker() {
  const patch = buildSyncStripeCustomerPaymentMethodPatch({
    existing: {
      provider: "stripe",
      providerCustomerId: "cus_same",
      paymentMethodStatus: "active",
      providerDefaultPaymentMethodId: "pm_same",
      cardBrand: "visa",
      cardLast4: "4242",
      cardExpMonth: 12,
      cardExpYear: 2030,
      cardRemovedAt: NOW - 100,
    },
    providerCustomerId: "cus_same",
    status: "active",
    providerDefaultPaymentMethodId: "pm_same",
    cardBrand: "visa",
    cardLast4: "4242",
    cardExpMonth: 12,
    cardExpYear: 2030,
    nowMs: NOW,
  });
  assertPatchKeys(
    patch,
    ["cardRemovedAt", "paymentMethodCheckedAt", "updatedAt"],
    "active card must clear stale removed marker",
  );
  assert.equal(patch?.cardRemovedAt, undefined);
  console.log("PASS: active card sync clears stale removed marker");
}

function proveChangedActiveCardPatchesOnlyMaterialState() {
  const patch = buildSyncStripeCustomerPaymentMethodPatch({
    existing: {
      provider: "stripe",
      providerCustomerId: "cus_same",
      paymentMethodStatus: "active",
      providerDefaultPaymentMethodId: "pm_old",
      cardBrand: "visa",
      cardLast4: "4242",
      cardExpMonth: 12,
      cardExpYear: 2030,
    },
    providerCustomerId: "cus_same",
    status: "active",
    providerDefaultPaymentMethodId: "pm_new",
    cardBrand: "amex",
    cardLast4: "1009",
    cardExpMonth: 1,
    cardExpYear: 2031,
    nowMs: NOW,
  });
  assertPatchKeys(
    patch,
    [
      "cardBrand",
      "cardExpMonth",
      "cardExpYear",
      "cardLast4",
      "paymentMethodCheckedAt",
      "providerDefaultPaymentMethodId",
      "updatedAt",
    ],
    "changed active card should patch card fields and timestamps",
  );
  assert.equal(patch?.providerDefaultPaymentMethodId, "pm_new");
  assert.equal(patch?.cardLast4, "1009");
  console.log("PASS: changed active card sync patches material state");
}

function proveRepeatedMissingCardNoops() {
  const patch = buildSyncStripeCustomerPaymentMethodPatch({
    existing: {
      provider: "stripe",
      providerCustomerId: "cus_same",
      paymentMethodStatus: "missing",
      paymentMethodCheckedAt: NOW - 1,
    },
    providerCustomerId: "cus_same",
    status: "missing",
    providerDefaultPaymentMethodId: null,
    nowMs: NOW,
  });
  assert.equal(patch, null, "repeated missing card sync must not patch checkedAt only");
  console.log("PASS: repeated missing card sync is a no-op");
}

function proveActiveToMissingClearsCardState() {
  const patch = buildSyncStripeCustomerPaymentMethodPatch({
    existing: {
      provider: "stripe",
      providerCustomerId: "cus_same",
      paymentMethodStatus: "active",
      providerDefaultPaymentMethodId: "pm_old",
      cardBrand: "visa",
      cardLast4: "4242",
      cardExpMonth: 12,
      cardExpYear: 2030,
    },
    providerCustomerId: "cus_same",
    status: "missing",
    providerDefaultPaymentMethodId: null,
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
      "providerDefaultPaymentMethodId",
      "updatedAt",
    ],
    "active to missing should clear card state",
  );
  assert.equal(patch?.paymentMethodStatus, "missing");
  assert.equal(patch?.providerDefaultPaymentMethodId, undefined);
  assert.equal(patch?.cardRemovedAt, NOW);
  console.log("PASS: active-to-missing card sync clears card state");
}

proveAttachSameCustomerNoops();
proveAttachFillsMissingEmailOnly();
proveAttachChangedCustomerResetsCardState();
proveSameActiveCardNoops();
proveActiveCardClearsRemovedMarker();
proveChangedActiveCardPatchesOnlyMaterialState();
proveRepeatedMissingCardNoops();
proveActiveToMissingClearsCardState();

console.log("stripe_customer_idempotency_proof: ok");
