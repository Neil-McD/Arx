import { afterEach, beforeEach, expect, test } from "vitest";

import { enqueueFounderCheckoutRecoveryEmailInternal } from "./emailEvents";

const priorPublicAppUrl = process.env.ARX_PUBLIC_APP_URL;

beforeEach(() => {
  process.env.ARX_PUBLIC_APP_URL = "https://polynet.test";
});

afterEach(() => {
  if (priorPublicAppUrl === undefined) delete process.env.ARX_PUBLIC_APP_URL;
  else process.env.ARX_PUBLIC_APP_URL = priorPublicAppUrl;
});

test("paid checkout recovery is durably enqueued with an idempotent key", async () => {
  let callCount = 0;
  let mutationArgs: Record<string, unknown> | null = null;
  const runMutation = async (_operation: unknown, args: Record<string, unknown>) => {
    callCount += 1;
    mutationArgs = args;
    return { ok: true, outboxId: "outbox_1" };
  };

  await expect(enqueueFounderCheckoutRecoveryEmailInternal({
    ctx: { runMutation },
    recipientEmail: "builder@example.com",
    sessionId: "founder_checkout_123",
    nowMs: 1_750_000_000_000,
  })).resolves.toMatchObject({ ok: true, outboxId: "outbox_1" });

  expect(callCount).toBe(1);
  expect(mutationArgs).toMatchObject({
    kind: "founder_checkout_recovery",
    recipientEmail: "builder@example.com",
    dedupeKey: "founder_checkout_recovery:founder_checkout_123",
    payload: {
      actionUrl:
        "https://polynet.test/?founder_checkout=recover&session_id=founder_checkout_123",
    },
  });
});

test("paid checkout recovery enqueue failure propagates for Stripe retry", async () => {
  const runMutation = async () => {
    throw new Error("email_outbox_unavailable");
  };

  await expect(enqueueFounderCheckoutRecoveryEmailInternal({
    ctx: { runMutation },
    recipientEmail: "builder@example.com",
    sessionId: "founder_checkout_retry",
    nowMs: 1_750_000_000_000,
  })).rejects.toThrow("email_outbox_unavailable");
});
