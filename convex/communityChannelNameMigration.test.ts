/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { ensureGeneralChannel, renameActiveCommunityChannel } from "./communityChannelCore";
import { internal } from "./_generated/api";
import { summarizeChannelNamePreflight, type ChannelNameInspection } from "../scripts/channelNameMigrationPreflight";
const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
async function fixture(names: string[]) {
  const t = convexTest(schema, modules);
  await t.run(async ({ db }) => {
    const ownerId = await db.insert("users", { authSubject: "migration-owner", createdAt: 1, updatedAt: 1 });
    const communityId = await db.insert("communities", { ownerId, name: "Migration", slug: "migration", visibility: "unlisted", entryPolicy: "open", inferenceFundingPolicy: "managed_required", createdAt: 1, updatedAt: 1 });
    for (const [position, name] of names.entries()) await db.insert("communityChannels", {
      communityId, name, slug: `room-${position}`, position: position + 1, status: "active", accessMode: "all_members", postingPolicy: "members", createdAt: 1, updatedAt: 1,
    });
  });
  const inspect = async () => {
    const rows: ChannelNameInspection[] = []; let cursor: string | null = null;
    for (;;) {
      const page: any = await t.query((internal as any).communityChannels.inspectChannelNamesInternal, { paginationOpts: { cursor, numItems: 1 } });
      rows.push(...page.page); if (page.isDone) return summarizeChannelNamePreflight(rows, true); cursor = page.continueCursor;
    }
  };
  return { t, inspect };
}
test("read-only preflight finds case/whitespace collisions across pages and invalid names", async () => {
  const { t, inspect } = await fixture([" Room One ", "room   one", ""]);
  const before = await t.run(ctx => ctx.db.query("communityChannels").collect());
  const summary = await inspect();
  expect(summary.collisions).toHaveLength(1); expect(summary.invalid).toHaveLength(1); expect(summary.safeToBackfill).toBe(false);
  expect(await t.run(ctx => ctx.db.query("communityChannels").collect())).toEqual(before);
});
test("backfill resumes across pages, preserves names and is idempotent", async () => {
  const { t, inspect } = await fixture([" One ", "Two"]);
  expect(await inspect()).toMatchObject({ safeToBackfill: true, readyForEnforcement: false, needsBackfill: 2 });
  const first = await t.mutation(internal.communityChannels.backfillChannelNamesInternal, { paginationOpts: { cursor: null, numItems: 1 } });
  await t.mutation(internal.communityChannels.backfillChannelNamesInternal, { paginationOpts: { cursor: first.continueCursor, numItems: 100 } });
  expect(await inspect()).toMatchObject({ readyForEnforcement: true, needsBackfill: 0 });
  expect((await t.run(ctx => ctx.db.query("communityChannels").collect())).map(r => r.name)).toEqual([" One ", "Two"]);
  expect(await t.mutation(internal.communityChannels.backfillChannelNamesInternal, { paginationOpts: { cursor: null, numItems: 100 } })).toMatchObject({ updated: 0, isDone: true });
});
test("collision rolls back its entire batch and incomplete scans never approve", async () => {
  const { t } = await fixture(["One", "one"]);
  await expect(t.mutation(internal.communityChannels.backfillChannelNamesInternal, { paginationOpts: { cursor: null, numItems: 100 } })).rejects.toThrow("name_taken");
  expect((await t.run(ctx => ctx.db.query("communityChannels").collect())).every(r => r.normalizedName === undefined)).toBe(true);
  expect(summarizeChannelNamePreflight([], false)).toMatchObject({ safeToBackfill: false, readyForEnforcement: false });
});


test("final candidate repairs General normalized name without changing display or policies", async () => {
  const { t } = await fixture([]);
  const communityId = await t.run(async ctx => (await ctx.db.query("communities").first())!._id);
  const general = await t.run(ctx => ensureGeneralChannel({ ctx, communityId }));
  await t.run(ctx => ctx.db.patch(general._id, { normalizedName: undefined }));
  const repaired = await t.run(ctx => ensureGeneralChannel({ ctx, communityId }));
  expect(repaired.normalizedName).toBe("general");
  expect(repaired.name).toBe(general.name);
  expect(repaired.accessMode).toBe(general.accessMode);
  expect(await t.run(ctx => ensureGeneralChannel({ ctx, communityId }))).toEqual(repaired);
});

test("final candidate repairs stale same-name index and still blocks unmigrated custom rows", async () => {
  const { t } = await fixture(["One"]);
  const row = await t.run(async ctx => (await ctx.db.query("communityChannels").first())!);
  await expect(t.run(ctx => renameActiveCommunityChannel({ctx, communityId: row.communityId, channelId: row._id, name: "One"}))).rejects.toThrow("migration_required");
  await t.run(ctx => ctx.db.patch(row._id, { position: 1, normalizedName: "stale" }));
  await t.run(ctx => renameActiveCommunityChannel({ctx, communityId: row.communityId, channelId: row._id, name: "One"}));
  expect((await t.run(ctx => ctx.db.get(row._id)))?.normalizedName).toBe("one");
});
