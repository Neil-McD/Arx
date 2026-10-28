/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./polynetCanonicalReceipts.ts",
  "./_generated/**/*.*s",
]);

async function createScope(t: ReturnType<typeof convexTest>) {
  const nowMs = 1_760_000_000_000;
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authSubject: "receipt-owner-subject",
      displayName: "Receipt owner",
      handle: "receipt-owner",
      normalizedHandle: "receipt-owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId: userId,
      slug: "receipt-community",
      name: "Receipt community",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { communityId, userId };
  });
}

function receiptArgs(scope: Awaited<ReturnType<typeof createScope>>) {
  return {
    ...scope,
    principalKind: "community_agent_for_member" as const,
    toolName: "polynet_write" as const,
    idempotencyKey: "receipt-operation-1",
    requestFingerprint: '{"operation":"write"}',
  };
}

test("concurrent reservations grant one attempt and reject the other while its lease is live", async () => {
  const t = convexTest(schema, modules);
  const args = receiptArgs(await createScope(t));
  const reserve = () =>
    t.mutation(
      (internal as any).polynetCanonicalReceipts
        .reserveCanonicalOperationReceiptInternal,
      args,
    );

  const results = await Promise.all([reserve(), reserve()]);
  const granted = results.filter((result) => result.ok === true);
  const blocked = results.filter((result) => result.ok === false);

  expect(granted).toHaveLength(1);
  expect(granted[0]).toMatchObject({
    status: "executing",
    attemptToken: expect.stringMatching(/^canonical_attempt:/),
    attemptCount: 1,
  });
  expect(blocked).toHaveLength(1);
  expect(blocked[0]).toMatchObject({
    code: "operation_in_progress",
    retryAfterMs: expect.any(Number),
  });
  await t.run(async (ctx) => {
    expect(
      await ctx.db.query("polynetCanonicalOperationReceipts").collect(),
    ).toHaveLength(1);
  });
});

test("an expired executing receipt is reclaimed after a crash before the domain write", async () => {
  const t = convexTest(schema, modules);
  const args = receiptArgs(await createScope(t));
  const first = await t.mutation(
    (internal as any).polynetCanonicalReceipts
      .reserveCanonicalOperationReceiptInternal,
    args,
  );
  await t.run(async (ctx) => {
    const receipt = (
      await ctx.db.query("polynetCanonicalOperationReceipts").collect()
    )[0]!;
    await ctx.db.patch(receipt._id, { leaseExpiresAt: 0 });
  });

  const reclaimed = await t.mutation(
    (internal as any).polynetCanonicalReceipts
      .reserveCanonicalOperationReceiptInternal,
    args,
  );

  expect(reclaimed).toMatchObject({
    ok: true,
    status: "executing",
    attemptCount: 2,
    reclaimed: true,
  });
  expect(reclaimed.attemptToken).not.toBe(first.attemptToken);
});

test("recent legacy executing receipts receive a rollout grace lease", async () => {
  const t = convexTest(schema, modules);
  const args = receiptArgs(await createScope(t));
  const nowMs = Date.now();
  await t.run(async (ctx) => {
    await ctx.db.insert("polynetCanonicalOperationReceipts", {
      ...args,
      status: "executing",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  });

  await expect(
    t.mutation(
      (internal as any).polynetCanonicalReceipts
        .reserveCanonicalOperationReceiptInternal,
      args,
    ),
  ).resolves.toMatchObject({
    ok: false,
    code: "operation_in_progress",
    retryAfterMs: expect.any(Number),
  });
});

test("stale legacy executing receipts are reclaimed without a data migration", async () => {
  const t = convexTest(schema, modules);
  const args = receiptArgs(await createScope(t));
  await t.run(async (ctx) => {
    await ctx.db.insert("polynetCanonicalOperationReceipts", {
      ...args,
      status: "executing",
      createdAt: 1_760_000_000_000,
      updatedAt: 1_760_000_000_000,
    });
  });

  await expect(
    t.mutation(
      (internal as any).polynetCanonicalReceipts
        .reserveCanonicalOperationReceiptInternal,
      args,
    ),
  ).resolves.toMatchObject({
    ok: true,
    status: "executing",
    attemptCount: 2,
    reclaimed: true,
  });
});

test("completed receipts from before lease fields existed remain replayable", async () => {
  const t = convexTest(schema, modules);
  const args = receiptArgs(await createScope(t));
  await t.run(async (ctx) => {
    await ctx.db.insert("polynetCanonicalOperationReceipts", {
      ...args,
      status: "completed",
      result: { retained: true },
      createdAt: 1_760_000_000_000,
      updatedAt: 1_760_000_000_000,
    });
  });

  await expect(
    t.mutation(
      (internal as any).polynetCanonicalReceipts
        .reserveCanonicalOperationReceiptInternal,
      args,
    ),
  ).resolves.toMatchObject({
    ok: true,
    status: "completed",
    result: { retained: true },
  });
});

test("a write completed under the retired personal_agent name is not repeated after the rename", async () => {
  const t = convexTest(schema, modules);
  const args = receiptArgs(await createScope(t));
  await t.run(async (ctx) => {
    await ctx.db.insert("polynetCanonicalOperationReceipts", {
      ...args,
      principalKind: "personal_agent",
      status: "completed",
      result: { posted: "before-deploy" },
      createdAt: 1_760_000_000_000,
      updatedAt: 1_760_000_000_000,
    });
  });

  await expect(
    t.mutation(
      (internal as any).polynetCanonicalReceipts
        .reserveCanonicalOperationReceiptInternal,
      args,
    ),
  ).resolves.toMatchObject({
    ok: true,
    status: "completed",
    result: { posted: "before-deploy" },
  });
});

test("failed attempts are retryable and only the current attempt owns settlement", async () => {
  const t = convexTest(schema, modules);
  const args = receiptArgs(await createScope(t));
  const first = await t.mutation(
    (internal as any).polynetCanonicalReceipts
      .reserveCanonicalOperationReceiptInternal,
    args,
  );
  await t.mutation(
    (internal as any).polynetCanonicalReceipts
      .failCanonicalOperationReceiptInternal,
    {
      ...args,
      attemptToken: first.attemptToken,
      errorCode: "domain_write_failed",
      errorMessage: "Retryable domain failure.",
    },
  );
  await t.run(async (ctx) => {
    const receipt = (
      await ctx.db.query("polynetCanonicalOperationReceipts").collect()
    )[0]!;
    expect(receipt).toMatchObject({
      status: "failed",
      attemptCount: 1,
      lastErrorCode: "domain_write_failed",
      lastErrorMessage: "Retryable domain failure.",
    });
    expect(receipt.leaseExpiresAt).toBeUndefined();
  });
  await expect(
    t.mutation(
      (internal as any).polynetCanonicalReceipts
        .completeCanonicalOperationReceiptInternal,
      {
        ...args,
        attemptToken: first.attemptToken,
        result: { owner: "failed" },
      },
    ),
  ).rejects.toThrow("polynet_operation_attempt_not_active");

  const second = await t.mutation(
    (internal as any).polynetCanonicalReceipts
      .reserveCanonicalOperationReceiptInternal,
    args,
  );
  expect(second).toMatchObject({
    ok: true,
    status: "executing",
    attemptCount: 2,
    reclaimed: true,
  });
  expect(second.attemptToken).not.toBe(first.attemptToken);

  await expect(
    t.mutation(
      (internal as any).polynetCanonicalReceipts
        .completeCanonicalOperationReceiptInternal,
      {
        ...args,
        attemptToken: first.attemptToken,
        result: { owner: "stale" },
      },
    ),
  ).rejects.toThrow("polynet_operation_attempt_not_owner");
  await expect(
    t.mutation(
      (internal as any).polynetCanonicalReceipts
        .failCanonicalOperationReceiptInternal,
      {
        ...args,
        attemptToken: first.attemptToken,
        errorCode: "stale_failure",
        errorMessage: "A stale attempt cannot fail the current owner.",
      },
    ),
  ).rejects.toThrow("polynet_operation_attempt_not_owner");

  const completed = await t.mutation(
    (internal as any).polynetCanonicalReceipts
      .completeCanonicalOperationReceiptInternal,
    {
      ...args,
      attemptToken: second.attemptToken,
      result: { owner: "current" },
    },
  );
  expect(completed).toMatchObject({
    ok: true,
    deduped: false,
    result: { owner: "current" },
  });
  await expect(
    t.mutation(
      (internal as any).polynetCanonicalReceipts
        .completeCanonicalOperationReceiptInternal,
      {
        ...args,
        attemptToken: second.attemptToken,
        result: { owner: "changed" },
      },
    ),
  ).resolves.toMatchObject({
    ok: true,
    deduped: true,
    result: { owner: "current" },
  });
  await t.run(async (ctx) => {
    const receipt = (
      await ctx.db.query("polynetCanonicalOperationReceipts").collect()
    )[0]!;
    expect(receipt).toMatchObject({
      status: "completed",
      attemptCount: 2,
      lastErrorCode: "domain_write_failed",
      lastErrorMessage: "Retryable domain failure.",
    });
  });
});
