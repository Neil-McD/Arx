import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./retiredTablesCleanup.ts", "./_generated/**/*.*s"]);

async function fixture() {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "owner-subject", displayName: "Owner", handle: "owner", normalizedHandle: "owner", createdAt: now, updatedAt: now,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "club", name: "Club", visibility: "unlisted", inferenceFundingPolicy: "managed_required",
      entryPolicy: "open", activeMemberCount: 1, createdAt: now, updatedAt: now,
    });
    const receipt = (key: string, principalKind: string) => ctx.db.insert("polynetCanonicalOperationReceipts", {
      communityId, userId: ownerId, principalKind: principalKind as any, toolName: "polynet_call",
      idempotencyKey: key, requestFingerprint: `${key}-fp`, status: "completed", result: {}, createdAt: now, updatedAt: now,
    });
    const oldReceipt = await receipt("old", "personal_agent");
    const currentReceipt = await receipt("current", "external_mcp");
    for (let index = 0; index < 3; index += 1) {
      await ctx.db.insert("communityFunnels", { communityId, createdAt: now, updatedAt: now } as any);
    }
    return { oldReceipt, currentReceipt };
  });
  return { t, ids };
}

test("the dry run counts retired rows and changes nothing; the real run empties the table", async () => {
  const { t } = await fixture();
  const empty = (dryRun?: boolean) =>
    t.mutation(internal.retiredTablesCleanup.emptyRetiredTableInternal, { table: "communityFunnels", dryRun });
  expect(await empty(true)).toMatchObject({ rows: 3, dryRun: true, isDone: true });
  expect(await t.run(async (ctx) => (await ctx.db.query("communityFunnels").collect()).length)).toBe(3);
  expect(await empty()).toMatchObject({ rows: 3, dryRun: false, isDone: true });
  expect(await t.run(async (ctx) => (await ctx.db.query("communityFunnels").collect()).length)).toBe(0);
});

test("old personal_agent receipts become community_agent_for_member; others are untouched", async () => {
  const { t, ids } = await fixture();
  const rewrite = (dryRun?: boolean) =>
    t.mutation(internal.retiredTablesCleanup.rewriteRetiredPersonalAgentInternal, { table: "receipts", dryRun });
  expect(await rewrite(true)).toMatchObject({ matched: 1, isDone: true });
  expect((await t.run((ctx) => ctx.db.get(ids.oldReceipt)))?.principalKind).toBe("personal_agent");
  expect(await rewrite()).toMatchObject({ matched: 1 });
  expect((await t.run((ctx) => ctx.db.get(ids.oldReceipt)))?.principalKind).toBe("community_agent_for_member");
  expect((await t.run((ctx) => ctx.db.get(ids.currentReceipt)))?.principalKind).toBe("external_mcp");
  expect(await rewrite()).toMatchObject({ matched: 0 });
});
