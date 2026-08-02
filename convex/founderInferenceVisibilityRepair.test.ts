/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./founderInferenceMigration.ts",
  "./criticalAudit.ts",
  "./_generated/**/*.*s",
]);

async function insertFixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "thomas-visibility-repair",
      displayName: "Thomas",
      handle: "thomasthomison",
      normalizedHandle: "thomasthomison",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const practiceId = await ctx.db.insert("communities", {
      ownerId,
      slug: "orchestrator-practice",
      name: "The Orchestrator Practice",
      visibility: "unlisted",
      entryPolicy: "approval",
      inferenceFundingPolicy: "managed_required",
      activeMemberCount: 1,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const impactId = await ctx.db.insert("communities", {
      ownerId,
      slug: "orchestrators-minds-impact",
      name: "Orchestrators+Minds=Impact",
      visibility: "unlisted",
      entryPolicy: "paid_subscription",
      inferenceFundingPolicy: "managed_required",
      activeMemberCount: 1,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    return { ownerId, practiceId, impactId };
  });
}

test("Thomas visibility repair is dry-runnable, exact, auditable, and idempotent", async () => {
  const t = convexTest(schema, modules);
  const fixture = await insertFixture(t);
  const args = {
    userId: fixture.ownerId,
    expectedCommunityIds: [fixture.practiceId, fixture.impactId],
  };

  await expect(
    t.mutation(
      internal.founderInferenceMigration.restoreThomasPublishedVisibilityInternal,
      { ...args, dryRun: true, nowMs: 2_000 },
    ),
  ).resolves.toMatchObject({
    dry_run: true,
    already_repaired: false,
    audit_event_ids: [],
    communities: [
      {
        slug: "orchestrator-practice",
        previous_visibility: "unlisted",
        next_visibility: "published",
      },
      {
        slug: "orchestrators-minds-impact",
        previous_visibility: "unlisted",
        next_visibility: "published",
      },
    ],
  });
  await t.run(async (ctx) => {
    expect(await ctx.db.query("criticalAuditEvents").collect()).toHaveLength(0);
    await expect(ctx.db.get(fixture.practiceId)).resolves.toMatchObject({
      visibility: "unlisted",
      updatedAt: 1_000,
    });
  });

  await expect(
    t.mutation(
      internal.founderInferenceMigration.restoreThomasPublishedVisibilityInternal,
      { ...args, nowMs: 3_000 },
    ),
  ).resolves.toMatchObject({
    dry_run: false,
    already_repaired: false,
    audit_event_ids: [expect.any(String), expect.any(String)],
  });
  await t.run(async (ctx) => {
    const [practice, impact, auditEvents] = await Promise.all([
      ctx.db.get(fixture.practiceId),
      ctx.db.get(fixture.impactId),
      ctx.db.query("criticalAuditEvents").collect(),
    ]);
    expect(practice).toMatchObject({
      visibility: "published",
      entryPolicy: "approval",
      inferenceFundingPolicy: "managed_required",
      updatedAt: 3_000,
    });
    expect(impact).toMatchObject({
      visibility: "published",
      entryPolicy: "paid_subscription",
      inferenceFundingPolicy: "managed_required",
      updatedAt: 3_000,
    });
    expect(auditEvents).toHaveLength(2);
    expect(auditEvents.every((event) => event.eventType === "community_visibility_repair_completed")).toBe(true);
  });

  await expect(
    t.mutation(
      internal.founderInferenceMigration.restoreThomasPublishedVisibilityInternal,
      { ...args, nowMs: 4_000 },
    ),
  ).resolves.toMatchObject({
    already_repaired: true,
    audit_event_ids: [expect.any(String), expect.any(String)],
  });
  await t.run(async (ctx) => {
    expect(await ctx.db.query("criticalAuditEvents").collect()).toHaveLength(2);
    await expect(ctx.db.get(fixture.practiceId)).resolves.toMatchObject({ updatedAt: 3_000 });
    await expect(ctx.db.get(fixture.impactId)).resolves.toMatchObject({ updatedAt: 3_000 });
  });
});

test("Thomas visibility repair fails closed on identity, ownership, policy, and mixed state", async () => {
  const t = convexTest(schema, modules);
  const fixture = await insertFixture(t);
  const args = {
    userId: fixture.ownerId,
    expectedCommunityIds: [fixture.practiceId, fixture.impactId],
    dryRun: true,
  };

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.ownerId, { normalizedHandle: "not-thomas" });
  });
  await expect(
    t.mutation(internal.founderInferenceMigration.restoreThomasPublishedVisibilityInternal, args),
  ).rejects.toThrow("thomas_visibility_repair_handle_mismatch");

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.ownerId, { normalizedHandle: "thomasthomison" });
  });
  await expect(
    t.mutation(internal.founderInferenceMigration.restoreThomasPublishedVisibilityInternal, {
      ...args,
      expectedCommunityIds: [fixture.practiceId],
    }),
  ).rejects.toThrow("thomas_visibility_repair_community_id_set_mismatch");

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.practiceId, { inferenceFundingPolicy: "legacy_byok_allowed" });
  });
  await expect(
    t.mutation(internal.founderInferenceMigration.restoreThomasPublishedVisibilityInternal, args),
  ).rejects.toThrow("thomas_visibility_repair_funding_policy_mismatch");

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.practiceId, {
      inferenceFundingPolicy: "managed_required",
      visibility: "published",
    });
  });
  await expect(
    t.mutation(internal.founderInferenceMigration.restoreThomasPublishedVisibilityInternal, args),
  ).rejects.toThrow("thomas_visibility_repair_visibility_state_mismatch");
});
