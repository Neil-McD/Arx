import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { communityAppJoinProjection, doorstepSummary } from "./communityAppJoin";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

// The doorstep (the Join page on a community's twin) shows what members get:
// the live courses in the founder's order with their lesson counts, who runs
// it, the banner, and each plan's price on its own.
test("the doorstep's data: live courses with lesson counts, the host by name, the price on its own", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const projection = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "rashid-subject", displayName: "rashid_h", handle: "rashid", normalizedHandle: "rashid", createdAt: now, updatedAt: now,
    });
    await ctx.db.insert("userProfileDetails", { userId: ownerId, displayName: "Rashid", createdAt: now, updatedAt: now } as any);
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "club", name: "Club", oneLiner: "Get 12 hours of work done in 2.", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "paid_subscription", activeMemberCount: 2, createdAt: now, updatedAt: now,
    } as any);
    await ctx.db.insert("communityPricePoints", {
      communityId, billingPeriod: "monthly", name: "Monthly", amountBaseUnits: 2900, currency: "usd", currencyDecimals: 2,
      isCurrent: true, providerAccountId: "acct_x", providerPriceId: "price_x", createdAt: now, updatedAt: now,
    });
    const course = async (name: string, sortOrder: number, status: "live" | "draft", lessons: string[], descriptionMd?: string) => {
      const moduleId = await ctx.db.insert("communityResourceModules", {
        communityId, createdByUserId: ownerId, name, status, sortOrder, createdAt: now, updatedAt: now, ...(descriptionMd ? { descriptionMd } : {}),
      });
      for (const [index, title] of lessons.entries()) {
        await ctx.db.insert("communityResources", {
          communityId, moduleId, createdByUserId: ownerId, type: "post", role: "page", status: "published", title, bodyChars: 120, pinned: false,
          sortOrder: index, createdAt: now, updatedAt: now,
        } as any);
      }
    };
    await course("Lean Workflow", 2000, "live", ["One", "Two"], "Cut the **busy work**.\n\nMore later.");
    await course("High Performance Workbook", 1000, "live", ["A", "B", "C"], "## Start here\nA [daily routine](https://x.example) for deep work.");
    await course("Unfinished", 500, "draft", ["Draft lesson"]);
    await course("No lessons yet", 3000, "live", []);
    const community = await ctx.db.get(communityId);
    return communityAppJoinProjection(ctx, community as any, null);
  });
  expect(projection.community).toMatchObject({
    name: "Club", one_liner: "Get 12 hours of work done in 2.", banner_url: null, host: { name: "Rashid" },
    courses: [
      { title: "High Performance Workbook", summary: "Start here A daily routine for deep work.", lessons: 3 },
      { title: "Lean Workflow", summary: "Cut the busy work.", lessons: 2 },
    ],
  });
  expect(projection.plans).toEqual([{ billing_period: "monthly", name: "Monthly", label: "Join $29/month", price: "$29" }]);
});

test("a course's line is its first paragraph as plain words, cut at a word", () => {
  expect(doorstepSummary(null)).toBeNull();
  expect(doorstepSummary("  \n\n ")).toBeNull();
  expect(doorstepSummary("> Eat for *steady* energy.\n\nSecond paragraph.")).toBe("Eat for steady energy.");
  const long = doorstepSummary(Array.from({ length: 40 }, () => "focus").join(" "));
  expect(long?.endsWith("focus…")).toBe(true);
  expect(long!.length).toBeLessThanOrEqual(181);
});
