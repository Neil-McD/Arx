import { afterEach, expect, test } from "vitest";
import {
  FOUNDER_CHECKOUT_RECOVERY_EMAIL_HASH_VERSION,
  hashFounderCheckoutAttemptId,
  hashFounderCheckoutClaimToken,
  hashFounderCheckoutRecoveryEmail,
} from "./founderCheckoutReceiptCore";

const priorSecret = process.env.POLYNET_FOUNDER_CHECKOUT_RECOVERY_SECRET;

afterEach(() => {
  if (priorSecret === undefined) {
    delete process.env.POLYNET_FOUNDER_CHECKOUT_RECOVERY_SECRET;
  } else {
    process.env.POLYNET_FOUNDER_CHECKOUT_RECOVERY_SECRET = priorSecret;
  }
});

test("claim and attempt receipts are deterministic but domain separated", async () => {
  const opaque = "builder_receipt_value_1234567890";
  const claimHash = await hashFounderCheckoutClaimToken(opaque);
  const attemptHash = await hashFounderCheckoutAttemptId(opaque);
  expect(claimHash).toMatch(/^[a-f0-9]{64}$/);
  expect(attemptHash).toMatch(/^[a-f0-9]{64}$/);
  expect(claimHash).not.toBe(attemptHash);
  await expect(hashFounderCheckoutClaimToken(opaque)).resolves.toBe(claimHash);
});

test("recovery email uses a secret HMAC over normalized email", async () => {
  process.env.POLYNET_FOUNDER_CHECKOUT_RECOVERY_SECRET =
    "test-only-founder-checkout-recovery-secret-123456";
  expect(FOUNDER_CHECKOUT_RECOVERY_EMAIL_HASH_VERSION).toBe("hmac_sha256_v1");
  const normalized = await hashFounderCheckoutRecoveryEmail(" Builder@Example.com ");
  await expect(hashFounderCheckoutRecoveryEmail("builder@example.com")).resolves.toBe(
    normalized,
  );
  expect(normalized).toMatch(/^[a-f0-9]{64}$/);
});

test("recovery fails closed without a stable secret", async () => {
  delete process.env.POLYNET_FOUNDER_CHECKOUT_RECOVERY_SECRET;
  await expect(hashFounderCheckoutRecoveryEmail("builder@example.com")).rejects.toThrow(
    "founder_checkout_recovery_secret_missing",
  );
});
