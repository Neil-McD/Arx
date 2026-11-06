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
    const root = (key: string, actorType: "personal_agent" | "human") => ctx.db.insert("communityInteractionRoots", {
      communityId, actorType, actorUserId: ownerId, kind: "discussion", status: "live", visibilityScope: "community",
      contentSummary: key, replyCount: 0, reactionSummary: [], idempotencyKey: key, createdAt: now, updatedAt: now,
    });
    const oldRoot = await root("old-root", "personal_agent");
    const humanRoot = await root("human-root", "human");
    return { oldReceipt, currentReceipt, oldRoot, humanRoot };
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

test("old agent posts become community agent posts with the canonical agent key", async () => {
  const { t, ids } = await fixture();
  await t.mutation(internal.retiredTablesCleanup.rewriteRetiredPersonalAgentInternal, { table: "roots" });
  const oldRoot = await t.run((ctx) => ctx.db.get(ids.oldRoot));
  expect(oldRoot).toMatchObject({ actorType: "community_agent", actorAgentKey: "community_agent" });
  const humanRoot = await t.run((ctx) => ctx.db.get(ids.humanRoot));
  expect(humanRoot?.actorType).toBe("human");
  expect(humanRoot?.actorAgentKey).toBeUndefined();
});

test("a dry run pages through tables larger than one page", async () => {
  const { t } = await fixture();
  await t.run(async (ctx) => {
    const now = Date.now();
    const { communityId } = (await ctx.db.query("communityFunnels").first()) as any;
    for (let index = 0; index < 250; index += 1) {
      await ctx.db.insert("communityFunnels", { communityId, createdAt: now, updatedAt: now } as any);
    }
  });
  let cursor: string | null = null;
  let total = 0;
  for (let pages = 0; pages < 5; pages += 1) {
    const result: any = await t.mutation(internal.retiredTablesCleanup.emptyRetiredTableInternal, {
      table: "communityFunnels", dryRun: true, cursor,
    });
    total += result.rows;
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  expect(total).toBe(253);
  expect(await t.run(async (ctx) => (await ctx.db.query("communityFunnels").collect()).length)).toBe(253);
});

test("retired checkout fields: a dry run counts, the real run clears them and nothing else", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const [claimed, plain] = await t.run(async (ctx) => {
    const base = { sessionId: "", mode: "community_join", provider: "stripe", status: "pending", expiresAt: now, createdAt: now, updatedAt: now } as any;
    return [
      await ctx.db.insert("checkoutSessions", { ...base, sessionId: "chk_claimed", claimToken: "claim-1", amountBaseUnits: 600 }),
      await ctx.db.insert("checkoutSessions", { ...base, sessionId: "chk_plain", amountBaseUnits: 600 }),
    ];
  });
  expect(await t.mutation(internal.retiredTablesCleanup.clearRetiredCheckoutFieldsInternal, { dryRun: true }))
    .toMatchObject({ dryRun: true, matched: 1, isDone: true });
  expect((await t.run((ctx) => ctx.db.get(claimed)))?.claimToken).toBe("claim-1");
  expect(await t.mutation(internal.retiredTablesCleanup.clearRetiredCheckoutFieldsInternal, {}))
    .toMatchObject({ dryRun: false, matched: 1, isDone: true });
  const after = await t.run(async (ctx) => [await ctx.db.get(claimed), await ctx.db.get(plain)]);
  expect(after.map((row) => [row?.sessionId, row?.claimToken, row?.amountBaseUnits])).toEqual([["chk_claimed", undefined, 600], ["chk_plain", undefined, 600]]);
});
