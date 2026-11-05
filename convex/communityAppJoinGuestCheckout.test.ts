import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const SESSION = `chk_${"b".repeat(32)}`;
const CLAIM = `claim_${"c".repeat(32)}`;

// A paid community and a guest checkout (no owner yet) still waiting on Stripe.
async function fixture() {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const user = (handle: string) => ctx.db.insert("users", {
      authSubject: `${handle}-subject`, displayName: handle, handle, normalizedHandle: handle, createdAt: now, updatedAt: now,
    });
    const ownerId = await user("owner");
    const buyerId = await user("buyer");
    const otherId = await user("other");
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "club", name: "Club", visibility: "unlisted", inferenceFundingPolicy: "managed_required",
      entryPolicy: "paid_subscription", activeMemberCount: 1, createdAt: now, updatedAt: now,
    } as any);
    await ctx.db.insert("checkoutSessions", {
      sessionId: SESSION, mode: "community_join", communityId, communityLifecycleGeneration: 0, billingPeriod: "monthly",
      claimToken: CLAIM, status: "pending", expiresAt: now + 60_000, createdAt: now, updatedAt: now,
    } as any);
    await ctx.db.insert("purchaseClaims", {
      claimToken: CLAIM, communityId, billingPeriod: "monthly", status: "pending", sourceSessionId: SESSION,
      expiresAt: now + 60_000, createdAt: now, updatedAt: now,
    } as any);
    return { communityId, buyerId, otherId };
  });
  const finish = (userId: any, claimToken?: string) =>
    t.mutation(internal.communityAppJoin.finishCommunityAppCheckoutInternal, {
      userId, communityId: ids.communityId, sessionId: SESSION, ...(claimToken ? { claimToken } : {}),
    });
  const owners = () => t.run(async (ctx) => {
    const session = await ctx.db.query("checkoutSessions").withIndex("by_sessionId", (q) => q.eq("sessionId", SESSION)).first();
    const claim = await ctx.db.query("purchaseClaims").withIndex("by_claimToken", (q) => q.eq("claimToken", CLAIM)).first();
    return [session?.ownerUserId ?? null, claim?.ownerUserId ?? null];
  });
  return { t, ids, finish, owners };
}

test("a guest checkout belongs to nobody until someone signs in holding its claim", async () => {
  const { ids, finish, owners } = await fixture();
  expect(await finish(ids.buyerId)).toEqual({ status: "not_found" });
  expect(await finish(ids.buyerId, `claim_${"d".repeat(32)}`)).toEqual({ status: "not_found" });
  expect(await owners()).toEqual([null, null]);
});

test("the buyer's claim makes the payment theirs (still pending on Stripe), and nobody else's after", async () => {
  const { ids, finish, owners } = await fixture();
  expect(await finish(ids.buyerId, CLAIM)).toEqual({ status: "pending" });
  expect(await owners()).toEqual([ids.buyerId, ids.buyerId]);
  // The same claim in another account's hands finds nothing.
  expect(await finish(ids.otherId, CLAIM)).toEqual({ status: "not_found" });
  expect(await owners()).toEqual([ids.buyerId, ids.buyerId]);
  // The buyer keeps finishing without it, as any signed-in checkout does.
  expect(await finish(ids.buyerId)).toEqual({ status: "pending" });
});
