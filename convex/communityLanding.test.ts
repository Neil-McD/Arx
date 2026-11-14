/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

// A community's landing page in the app (/c/<slug>, Nov 13): what anyone sees
// signed out, where a signed-in viewer stands, joining through Studio's own
// join decision, and one counted visit per visitor per half hour.
const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

async function fixture(entryPolicy: "open" | "approval") {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "owner-subject", displayName: "Maya", handle: "maya", normalizedHandle: "maya", createdAt: NOW, updatedAt: NOW,
    } as any);
    await ctx.db.insert("userProfileDetails", { userId: ownerId, displayName: "Maya Chen", bio: "Route setter and coach.", createdAt: NOW, updatedAt: NOW } as any);
    await ctx.db.insert("users", {
      authSubject: "visitor-subject", displayName: "Sam", handle: "sam", normalizedHandle: "sam", createdAt: NOW, updatedAt: NOW,
    } as any);
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "sunrise", name: "Sunrise Climbing Club", oneLiner: "Early sessions.", about: "We climb at 6:30.",
      visibility: "published", inferenceFundingPolicy: "managed_required", entryPolicy, activeMemberCount: 148, createdAt: NOW, updatedAt: NOW,
    } as any);
    const event = (title: string, startsAt: number, visibility: "public" | "members") => ctx.db.insert("communityEvents", {
      communityId, title, startsAt, visibility, status: "live", locationType: "online", timezone: "America/New_York",
      createdByUserId: ownerId, createdAt: NOW, updatedAt: NOW,
    } as any);
    await event("Sunrise session", NOW + DAY, "public");
    await event("Members-only call", NOW + 2 * DAY, "members");
    await event("Last week's session", NOW - 7 * DAY, "public");
    await ctx.db.insert("connectedApps", {
      communityId, appId: "app_1", name: "Sunrise Log", secretHash: "x", secretHint: "x", signingSecret: "x",
      appUrl: "https://sunriselog.app", createdByUserId: ownerId, createdAt: NOW, updatedAt: NOW,
    } as any);
    return { ownerId, communityId };
  });
  return { t, ...ids };
}

test("signed out, the page shows the community, its public upcoming events, its host and its app; nobody's standing", async () => {
  const f = await fixture("open");
  const page = (await f.t.query(api.communityLanding.getCommunityLandingPage, { communitySlug: "Sunrise" })) as any;
  expect(page.ok).toBe(true);
  expect(page.community).toMatchObject({ slug: "sunrise", name: "Sunrise Climbing Club", one_liner: "Early sessions.", member_count: 148 });
  expect(page.gate).toBe("join");
  expect(page.viewer).toBeNull();
  expect(page.signed_in).toBe(false);
  expect(page.is_owner).toBe(false);
  expect(page.host).toMatchObject({ name: "Maya Chen", bio: "Route setter and coach." });
  expect(page.events.map((event: any) => event.title)).toEqual(["Sunrise session"]);
  expect(page.app).toEqual({ name: "Sunrise Log", url: "https://sunriselog.app", host: "sunriselog.app" });
  expect(await f.t.query(api.communityLanding.getCommunityLandingPage, { communitySlug: "nobody-here" })).toEqual({ ok: false });
});

test("joining needs a signed-in caller, and runs Studio's join decision (approval: a request that can be withdrawn)", async () => {
  const f = await fixture("approval");
  await expect(f.t.mutation(api.communityLanding.joinCommunityFromLanding, { communitySlug: "sunrise" })).rejects.toThrow(/auth/);
  const visitor = f.t.withIdentity({ subject: "visitor-subject" });
  await visitor.mutation(api.communityLanding.joinCommunityFromLanding, { communitySlug: "sunrise", authSubject: "visitor-subject" });
  const waiting = (await visitor.query(api.communityLanding.getCommunityLandingPage, { communitySlug: "sunrise", authSubject: "visitor-subject" })) as any;
  expect(waiting.viewer.state).toBe("pending");
  await visitor.mutation(api.communityLanding.cancelCommunityJoinRequestFromLanding, { communitySlug: "sunrise", authSubject: "visitor-subject" });
  const after = (await visitor.query(api.communityLanding.getCommunityLandingPage, { communitySlug: "sunrise", authSubject: "visitor-subject" })) as any;
  expect(after.viewer.state).toBe("visitor");
  // The owner sees the page as its owner.
  const owner = (await f.t.withIdentity({ subject: "owner-subject" }).query(api.communityLanding.getCommunityLandingPage, {
    communitySlug: "sunrise", authSubject: "owner-subject",
  })) as any;
  expect(owner.is_owner).toBe(true);
});

test("a visit counts once per visitor per half hour; a malformed key counts nothing", async () => {
  const f = await fixture("open");
  const visit = (visitorKey: string) => f.t.mutation(api.communityLanding.recordCommunityLandingVisit, { communitySlug: "sunrise", visitorKey });
  await visit("a1b2c3d4e5f6a7b8c9d0");
  await visit("a1b2c3d4e5f6a7b8c9d0");
  await visit("ffffffffffffffffffff");
  expect(await visit("short")).toEqual({ ok: false });
  const visits = await f.t.run(async (ctx) => (await ctx.db.query("communityAnalyticsEvents").collect()).filter((row) => row.eventType === "funnel_visit"));
  expect(visits).toHaveLength(2);
});
