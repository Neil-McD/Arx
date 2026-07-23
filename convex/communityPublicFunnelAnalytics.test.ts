/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./community.ts",
  "./communityPublic.ts",
  "./_generated/**/*.*s",
]);
const NOW_MS = 1_770_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
});

afterEach(() => {
  vi.useRealTimers();
});

async function createFixture(t: ReturnType<typeof convexTest>, suffix: string) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: `funnel-analytics-owner-${suffix}`,
      displayName: "Funnel analytics owner",
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const slug = `funnel-analytics-${suffix}`;
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug,
      name: "Funnel analytics",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    return { communityId, slug };
  });
}

describe("public funnel analytics", () => {
  test("stores only a hashed anonymous key and bounds deduplication by time", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "hash-only");
    const visitorKey = "anonymous-browser-key";

    expect(
      await t.mutation((api as any).community.recordPublicFunnelVisitBySlug, {
        communitySlug: fixture.slug,
        visitorKey,
      }),
    ).toEqual({ ok: true });
    expect(
      await t.mutation((api as any).community.recordPublicFunnelVisitBySlug, {
        communitySlug: fixture.slug,
        visitorKey,
      }),
    ).toEqual({ ok: true, deduped: true });

    let rows = await t.run(async (ctx) =>
      await ctx.db.query("communityAnalyticsEvents").collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      communityId: fixture.communityId,
      eventType: "funnel_visit",
      createdAt: NOW_MS,
    });
    expect(rows[0].visitorKeyHash).not.toBe(visitorKey);
    expect(rows[0]).not.toHaveProperty("visitorKey");
    expect(rows[0]).not.toHaveProperty("userId");

    vi.setSystemTime(NOW_MS + 30 * 60 * 1000 + 1);
    expect(
      await t.mutation((api as any).community.recordPublicFunnelVisitBySlug, {
        communitySlug: fixture.slug,
        visitorKey,
      }),
    ).toEqual({ ok: true });
    rows = await t.run(async (ctx) =>
      await ctx.db.query("communityAnalyticsEvents").collect(),
    );
    expect(rows).toHaveLength(2);
  });

  test("rejects missing keys and caller-supplied identity", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "identity-rejection");

    await expect(
      t.mutation((api as any).community.recordPublicFunnelVisitBySlug, {
        communitySlug: fixture.slug,
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation((api as any).community.recordPublicFunnelVisitBySlug, {
        communitySlug: fixture.slug,
        visitorKey: "anonymous-browser-key",
        authSubject: "spoofed-subject",
      }),
    ).rejects.toThrow();
    expect(
      await t.run(async (ctx) =>
        await ctx.db.query("communityAnalyticsEvents").collect(),
      ),
    ).toEqual([]);
  });
});
