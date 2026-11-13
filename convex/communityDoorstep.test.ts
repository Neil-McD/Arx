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
    // The owner's Stripe account can take card payments, so the plan is on sale.
    await ctx.db.insert("userStripeConnectAccounts", {
      userId: ownerId, stripeAccountId: "acct_club", accountType: "express", country: "US", transfersEnabled: true, status: "ready",
      detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: true, requirementsCurrentlyDue: [], requirementsEventuallyDue: [],
      createdAt: now, updatedAt: now,
    });
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
  expect(projection.plans).toEqual([{ billing_period: "monthly", name: "Monthly", label: "Join $29/month", price: "$29", plan: null, title: "Monthly", includes: [] }]);
});

test("a course's line is its first paragraph as plain words, cut at a word", () => {
  expect(doorstepSummary(null)).toBeNull();
  expect(doorstepSummary("  \n\n ")).toBeNull();
  expect(doorstepSummary("> Eat for *steady* energy.\n\nSecond paragraph.")).toBe("Eat for steady energy.");
  const long = doorstepSummary(Array.from({ length: 40 }, () => "focus").join(" "));
  expect(long?.endsWith("focus…")).toBe(true);
  expect(long!.length).toBeLessThanOrEqual(181);
});

// The middle of the funnel: acting on the doorstep (joining, asking, starting a
// checkout) is counted once per person per half hour, between visits and new members.
test("acting on the doorstep counts as started joining, once per person a while", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const { communityId, visitorId } = await t.run(async (ctx) => {
    const user = (handle: string) => ctx.db.insert("users", {
      authSubject: `${handle}-subject`, displayName: handle, handle, normalizedHandle: handle, createdAt: now, updatedAt: now,
    });
    const ownerId = await user("owner");
    const visitorId = await user("visitor");
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "club", name: "Club", visibility: "published", inferenceFundingPolicy: "managed_required",
      entryPolicy: "approval", activeMemberCount: 1, createdAt: now, updatedAt: now,
    } as any);
    return { communityId, visitorId };
  });
  const { internal } = await import("./_generated/api");
  await t.mutation(internal.communityAppJoin.joinCommunityAppVisitorInternal, { userId: visitorId, communityId });
  await t.mutation(internal.communityAppJoin.cancelCommunityAppJoinRequestInternal, { userId: visitorId, communityId });
  await t.mutation(internal.communityAppJoin.joinCommunityAppVisitorInternal, { userId: visitorId, communityId });
  const started = await t.run(async (ctx) => (await ctx.db.query("communityAnalyticsEvents").collect())
    .filter((row) => row.eventType === "funnel_join_started").map((row) => [row.visitorKey, row.userId]));
  expect(started).toEqual([[`user:${visitorId}`, visitorId]]);
});

// The founder's sales sections: only the owner saves them, every limit is
// checked by name, a video only from YouTube, Vimeo or Loom, and a stale copy
// never overwrites a newer save. The doorstep reads what was saved.
test("the public page's sections: owner-only, checked, never overwritten from a stale copy", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const { communityId } = await t.run(async (ctx) => {
    const user = (handle: string) => ctx.db.insert("users", {
      authSubject: `${handle}-subject`, displayName: handle, handle, normalizedHandle: handle, createdAt: now, updatedAt: now,
    });
    const ownerId = await user("owner");
    await user("member");
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "club", name: "Club", visibility: "published", inferenceFundingPolicy: "managed_required",
      entryPolicy: "open", activeMemberCount: 1, createdAt: now, updatedAt: now,
    } as any);
    return { communityId };
  });
  const { api } = await import("./_generated/api");
  const blank = { for_you: [], not_for: [], first_steps: [], results: [], founder_bio: "", video_url: "", guarantee: "", objections: [] };
  const save = (authSubject: string, expectedRevision: number, page: Record<string, unknown>) =>
    t.withIdentity({ subject: authSubject }).mutation(api.communityPublicPage.saveMyCommunityPublicPage, { communityId, expectedRevision, page: { ...blank, ...page } as any });
  await expect(save("member-subject", 0, { guarantee: "Mine now." })).rejects.toThrow(/community_owner_required|community_forbidden/);
  await expect(save("owner-subject", 0, { for_you: ["a", "b", "c", "d", "e"] })).rejects.toThrow("community_public_page_for_you_too_many");
  await expect(save("owner-subject", 0, { guarantee: "x".repeat(161) })).rejects.toThrow("community_public_page_guarantee_too_long");
  await expect(save("owner-subject", 0, { video_url: "https://evil.example.com/watch?v=dQw4w9WgXcQ" })).rejects.toThrow("community_public_page_video_url_unsupported");
  await expect(save("owner-subject", 0, { results: [{ quote: "Great.", name: "", role: "" }] })).rejects.toThrow("community_public_page_results_incomplete");
  const saved = await save("owner-subject", 0, {
    for_you: ["  You run a business.  ", ""], first_steps: [{ title: "Join", text: "" }, { title: "", text: "" }],
    video_url: "https://youtu.be/dQw4w9WgXcQ", guarantee: "Refund in 30 days.",
  });
  expect(saved).toMatchObject({ revision: 1, page: { for_you: ["You run a business."], first_steps: [{ title: "Join", text: "" }], video: { provider: "youtube", id: "dQw4w9WgXcQ" } } });
  await expect(save("owner-subject", 0, { guarantee: "Older tab." })).rejects.toThrow("community_public_page_changed");
  const read = await t.withIdentity({ subject: "owner-subject" }).query(api.communityPublicPage.getMyCommunityPublicPage, { communityId });
  expect(read).toMatchObject({ revision: 1, page: { guarantee: "Refund in 30 days." } });
  const projection = await t.run(async (ctx) => communityAppJoinProjection(ctx, (await ctx.db.get(communityId)) as any, null));
  // The sales sections were removed from the join page (Nov 13, with custom sites); the stored copy is kept.
  expect(projection.community.page).toBeNull();
});

test("a video link is read only from YouTube, Vimeo or Loom, by its id", async () => {
  const { communityPublicPageVideoFromUrl } = await import("../shared/communityPublicPage");
  expect(communityPublicPageVideoFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toEqual({ provider: "youtube", id: "dQw4w9WgXcQ" });
  expect(communityPublicPageVideoFromUrl("https://youtube.com/shorts/dQw4w9WgXcQ")).toEqual({ provider: "youtube", id: "dQw4w9WgXcQ" });
  expect(communityPublicPageVideoFromUrl("https://vimeo.com/76979871")).toEqual({ provider: "vimeo", id: "76979871" });
  expect(communityPublicPageVideoFromUrl(`https://www.loom.com/share/${"a".repeat(32)}?sid=1`)).toEqual({ provider: "loom", id: "a".repeat(32) });
  for (const bad of ["http://youtu.be/dQw4w9WgXcQ", "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ", "https://youtu.be/short", "javascript:alert(1)", "https://vimeo.com/channels/x"]) {
    expect(communityPublicPageVideoFromUrl(bad)).toBeNull();
  }
});

// "Draft with AI": owner-only, only from the founder's own words, never results
// or a guarantee, and only items within limits; a stale answer never lands.
test("Draft with AI: the model's answer is kept only within limits, and only for the request it answers", async () => {
  const { parseCommunityPublicPageDraft } = await import("../shared/communityPublicPage");
  expect(parseCommunityPublicPageDraft("no json")).toBeNull();
  expect(parseCommunityPublicPageDraft('{"for_you": [], "not_for": []}')).toBeNull();
  const draft = parseCommunityPublicPageDraft(`Here you go: ${JSON.stringify({
    for_you: ["You run a business.", "x".repeat(141), "", "Two", "Three", "Four"],
    not_for: ["You want hacks."],
    first_steps: [{ title: "Join", text: "One tap." }, { title: "", text: "No title" }],
    objections: [{ question: "Time?", answer: "Two hours." }],
    results: [{ quote: "Invented.", name: "Nobody" }], guarantee: "Invented promise",
  })}`);
  expect(draft).toEqual({
    for_you: ["You run a business.", "Two", "Three", "Four"], not_for: ["You want hacks."],
    first_steps: [{ title: "Join", text: "One tap." }], objections: [{ question: "Time?", answer: "Two hours." }],
  });

  const t = convexTest(schema, modules);
  const now = Date.now();
  const { communityId } = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "owner-subject", displayName: "owner", handle: "owner", normalizedHandle: "owner", createdAt: now, updatedAt: now,
    });
    await ctx.db.insert("users", { authSubject: "member-subject", displayName: "m", handle: "m", normalizedHandle: "m", createdAt: now, updatedAt: now });
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "club", name: "Club", oneLiner: "Focus.", visibility: "published", inferenceFundingPolicy: "managed_required",
      entryPolicy: "open", activeMemberCount: 1, createdAt: now, updatedAt: now,
    } as any);
    return { communityId };
  });
  const { api, internal } = await import("./_generated/api");
  await expect(t.withIdentity({ subject: "member-subject" }).mutation(api.communityPublicPage.requestMyCommunityPublicPageDraft, { communityId }))
    .rejects.toThrow(/community_owner_required|community_forbidden/);
  const asked = await t.withIdentity({ subject: "owner-subject" }).mutation(api.communityPublicPage.requestMyCommunityPublicPageDraft, { communityId });
  expect(asked.status).toBe("drafting");
  const requestedAt = await t.run(async (ctx) => (await ctx.db.query("communityPublicPages").first())!.draftRequestedAt!);
  const answer = { for_you: ["You run a business."], not_for: [], first_steps: [], objections: [] };
  // An older request's answer is ignored; this one's lands as a suggestion, never the page.
  await t.mutation(internal.communityPublicPage.recordCommunityPublicPageDraftInternal, { communityId, requestedAt: requestedAt - 1, draft: answer });
  expect((await t.withIdentity({ subject: "owner-subject" }).query(api.communityPublicPage.getMyCommunityPublicPage, { communityId })).ai.status).toBe("drafting");
  await t.mutation(internal.communityPublicPage.recordCommunityPublicPageDraftInternal, { communityId, requestedAt, draft: answer });
  const read = await t.withIdentity({ subject: "owner-subject" }).query(api.communityPublicPage.getMyCommunityPublicPage, { communityId });
  expect(read).toMatchObject({ revision: 0, page: { for_you: [] }, ai: { status: "ready", draft: { for_you: ["You run a business."] } } });
});
