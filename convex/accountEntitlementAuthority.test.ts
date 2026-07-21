/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import {
  readCanonicalAccountEntitlement,
  resolveCanonicalAccountEntitlementFromRows,
  upsertCurrentAccountEntitlementSource,
} from "./accountEntitlementCore";
import schema from "./schema";

const modules = import.meta.glob(["./accountEntitlementCore.ts", "./_generated/**/*.*s"]);

function row(overrides: Record<string, unknown> = {}) {
  return {
    _id: "entitlement_1",
    tier: "architect",
    source: "premium_subscription",
    startsAt: 100,
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

describe("canonical account entitlement authority", () => {
  test("absence is free and active windows are half-open", () => {
    expect(resolveCanonicalAccountEntitlementFromRows([], 100)).toMatchObject({
      canonicalTier: "free",
      reason: "default_free",
      corrupt: false,
    });
    expect(resolveCanonicalAccountEntitlementFromRows([row({ startsAt: 101 })], 100).canonicalTier).toBe("free");
    expect(resolveCanonicalAccountEntitlementFromRows([row({ endsAt: 101 })], 100).canonicalTier).toBe("architect");
    expect(resolveCanonicalAccountEntitlementFromRows([row({ endsAt: 101 })], 101).canonicalTier).toBe("free");
  });

  test("latest active source wins and expiration reveals the older active source", () => {
    const rows = [
      row({ _id: "admin", source: "admin_override", tier: "free", startsAt: 200, endsAt: 300 }),
      row({ _id: "premium", source: "premium_subscription", tier: "architect", startsAt: 100 }),
    ];
    expect(resolveCanonicalAccountEntitlementFromRows(rows, 250)).toMatchObject({
      canonicalTier: "free",
      source: "admin_override",
    });
    expect(resolveCanonicalAccountEntitlementFromRows(rows, 300)).toMatchObject({
      canonicalTier: "architect",
      source: "premium_subscription",
    });
    expect(
      resolveCanonicalAccountEntitlementFromRows(
        [
          row({ _id: "admin", source: "admin_override", startsAt: 100 }),
          row({ _id: "premium", tier: "free", startsAt: 200, endsAt: 200 }),
        ],
        200,
      ),
    ).toMatchObject({
      canonicalTier: "architect",
      source: "admin_override",
      corrupt: false,
    });
  });

  test("unsupported, duplicate, excessive, invalid, and conflicting state fails closed", () => {
    expect(resolveCanonicalAccountEntitlementFromRows([row({ source: "default" })], 100)).toMatchObject({
      canonicalTier: "free",
      reason: "unsupported_source",
      corrupt: true,
    });
    expect(
      resolveCanonicalAccountEntitlementFromRows(
        [row(), row({ _id: "duplicate", startsAt: 200 })],
        250,
      ),
    ).toMatchObject({ canonicalTier: "free", reason: "duplicate_source", corrupt: true });
    expect(
      resolveCanonicalAccountEntitlementFromRows(
        [row(), row({ _id: "admin", source: "admin_override" }), row({ _id: "third" })],
        100,
      ),
    ).toMatchObject({ canonicalTier: "free", reason: "too_many_rows", corrupt: true });
    expect(resolveCanonicalAccountEntitlementFromRows([row({ endsAt: 99 })], 99)).toMatchObject({
      canonicalTier: "free",
      reason: "invalid_row",
      corrupt: true,
    });
    expect(resolveCanonicalAccountEntitlementFromRows([row({ tier: "operator" })], 100)).toMatchObject({
      canonicalTier: "free",
      reason: "invalid_row",
      corrupt: true,
    });
    expect(resolveCanonicalAccountEntitlementFromRows([row()], Number.NaN)).toMatchObject({
      canonicalTier: "free",
      reason: "invalid_evaluation_time",
      corrupt: true,
    });
    expect(
      resolveCanonicalAccountEntitlementFromRows(
        [row(), row({ _id: "admin", source: "admin_override", tier: "free" })],
        100,
      ),
    ).toMatchObject({ canonicalTier: "free", reason: "conflicting_revision", corrupt: true });
  });

  test("per-source writes are monotonic, idempotent, and bounded", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      await ctx.db.insert("users", {
        authSubject: "entitlement-authority-user",
        createdAt: 1,
        updatedAt: 1,
      }),
    );

    const first = await t.run(async (ctx) =>
      await upsertCurrentAccountEntitlementSource({
        ctx,
        userId,
        source: "admin_override",
        tier: "architect",
        startsAt: 100,
        nowMs: 100,
      }),
    );
    expect(first.outcome).toBe("inserted");
    expect(
      (
        await t.run(async (ctx) =>
          await upsertCurrentAccountEntitlementSource({
            ctx,
            userId,
            source: "admin_override",
            tier: "architect",
            startsAt: 100,
            nowMs: 101,
          }),
        )
      ).outcome,
    ).toBe("retry");
    expect(
      (
        await t.run(async (ctx) =>
          await upsertCurrentAccountEntitlementSource({
            ctx,
            userId,
            source: "admin_override",
            tier: "free",
            startsAt: 99,
            nowMs: 102,
          }),
        )
      ).outcome,
    ).toBe("stale");
    expect(
      (
        await t.run(async (ctx) =>
          await upsertCurrentAccountEntitlementSource({
            ctx,
            userId,
            source: "admin_override",
            tier: "free",
            startsAt: 101,
            nowMs: 103,
          }),
        )
      ).outcome,
    ).toBe("updated");

    const state = await t.run(async (ctx) => ({
      rows: await ctx.db.query("userEntitlements").collect(),
      resolved: await readCanonicalAccountEntitlement(ctx, userId, 101),
    }));
    expect(state.rows).toHaveLength(1);
    expect(state.resolved).toMatchObject({
      canonicalTier: "free",
      source: "admin_override",
      corrupt: false,
    });
  });

  test("same-time conflicting source writes close access until a newer revision", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      await ctx.db.insert("users", {
        authSubject: "entitlement-conflict-user",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    await t.run(async (ctx) =>
      upsertCurrentAccountEntitlementSource({
        ctx,
        userId,
        source: "premium_subscription",
        tier: "architect",
        startsAt: 100,
        nowMs: 100,
      }),
    );
    expect(
      (
        await t.run(async (ctx) =>
        upsertCurrentAccountEntitlementSource({
          ctx,
          userId,
          source: "premium_subscription",
          tier: "free",
          startsAt: 100,
          nowMs: 101,
        }),
        )
      ).outcome,
    ).toBe("conflict_closed");
    expect(
      await t.run(async (ctx) => readCanonicalAccountEntitlement(ctx, userId, 101)),
    ).toMatchObject({ canonicalTier: "free", corrupt: false });
    expect(
      (
        await t.run(async (ctx) =>
          upsertCurrentAccountEntitlementSource({
            ctx,
            userId,
            source: "premium_subscription",
            tier: "architect",
            startsAt: 102,
            nowMs: 102,
          }),
        )
      ).outcome,
    ).toBe("updated");
    expect(
      await t.run(async (ctx) => readCanonicalAccountEntitlement(ctx, userId, 102)),
    ).toMatchObject({ canonicalTier: "architect", corrupt: false });
  });
});
