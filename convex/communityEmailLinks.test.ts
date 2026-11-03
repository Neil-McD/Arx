/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { communityPrivatePageUrl, communitySitePageUrl, registerCommunitySiteAddresses } from "./communitySites";
import { directMessageLink } from "./directMessageEmails";
import { enqueueCommunityAccessGrantedEmailInternal } from "./emailEvents";

// Members live on the community's own site, so the emails that bring them back
// open it there; without a site (production until its sites run) they keep
// their Studio links.
const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.now();

afterEach(() => { vi.unstubAllEnvs(); });

async function fixture(withSite: boolean) {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet-staging.example.com");
  if (withSite) {
    vi.stubEnv("POLYNET_SITES_DOMAIN", "polynet.page");
    vi.stubEnv("POLYNET_SITES_HOST_SUFFIX", "-staging");
  }
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { authSubject: "owner-subject", displayName: "Owner", createdAt: NOW, updatedAt: NOW });
    const memberId = await ctx.db.insert("users", { authSubject: "member-subject", displayName: "Member", email: "member@example.com", createdAt: NOW, updatedAt: NOW } as any);
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "night-swimmers", name: "Night Swimmers", visibility: "unlisted", inferenceFundingPolicy: "managed_required",
      entryPolicy: "approval", activeMemberCount: 1, createdAt: NOW, updatedAt: NOW,
    } as any);
    await ctx.db.insert("communityMemberships", {
      communityId, userId: memberId, role: "member", accessSource: "free_grant", active: true,
      activationSequence: 1, activatedAt: NOW, createdAt: NOW, updatedAt: NOW,
    } as any);
    await registerCommunitySiteAddresses(ctx, { _id: communityId, slug: "night-swimmers" });
    return { ownerId, memberId, communityId };
  });
  return { t, ...ids };
}

test("with a site, a community's links are its site's pages and its private pages", async () => {
  const f = await fixture(true);
  const links = await f.t.run(async (ctx) => {
    const community = (await ctx.db.get(f.communityId))!;
    return {
      chat: await communitySitePageUrl(ctx, community, "/chat?channel=crew"),
      event: await communitySitePageUrl(ctx, community, "/events/abc~1793570400000"),
      messages: await communityPrivatePageUrl(ctx, community, "/messages/k97abc"),
      bySlug: await ctx.runQuery(internal.communitySites.communitySitePageUrlBySlugInternal, { slug: "night-swimmers", path: "/" }),
    };
  });
  expect(links).toEqual({
    chat: "https://night-swimmers-staging.polynet.page/chat?channel=crew",
    event: "https://night-swimmers-staging.polynet.page/events/abc~1793570400000",
    messages: "https://night-swimmers--me-staging.polynet.page/messages/k97abc",
    bySlug: "https://night-swimmers-staging.polynet.page/",
  });
});

test("without a site there's no site link, so each email keeps its Studio link", async () => {
  const f = await fixture(false);
  const links = await f.t.run(async (ctx) => {
    const community = (await ctx.db.get(f.communityId))!;
    return [await communitySitePageUrl(ctx, community, "/chat"), await communityPrivatePageUrl(ctx, community, "/messages/x")];
  });
  expect(links).toEqual([null, null]);
});

test("a direct message opens on the community's private pages, or this environment's Studio inbox, never a hard-coded production address", async () => {
  const withSite = await fixture(true);
  const link = (f: Awaited<ReturnType<typeof fixture>>, userId: any) =>
    f.t.run(async (ctx) => directMessageLink(ctx, await ctx.db.get(f.communityId), "k97abc", userId));
  // A member still in the community: that conversation on its private pages.
  expect(await link(withSite, withSite.memberId)).toBe("https://night-swimmers--me-staging.polynet.page/messages/k97abc");
  // Someone who has since left: Messages there would refuse them, so Studio's inbox.
  await withSite.t.run(async (ctx) => {
    const row = (await ctx.db.query("communityMemberships").collect()).find((m) => m.userId === withSite.memberId)!;
    await ctx.db.patch(row._id, { active: false, revokedAt: NOW });
  });
  expect(await link(withSite, withSite.memberId)).toBe("https://polynet-staging.example.com/?dm=k97abc");
  // Begun outside any community: Studio's inbox, on this environment's own app.
  expect(await withSite.t.run((ctx) => directMessageLink(ctx, null, "k97abc", withSite.memberId))).toBe("https://polynet-staging.example.com/?dm=k97abc");
  vi.unstubAllEnvs();
  const noSite = await fixture(false);
  expect(await link(noSite, noSite.memberId)).toBe("https://polynet-staging.example.com/?dm=k97abc");
});

test("'you're in' opens the community's chat on its site; without a site, Studio's", async () => {
  for (const withSite of [true, false]) {
    vi.unstubAllEnvs();
    const f = await fixture(withSite);
    const url = await f.t.run(async (ctx) => {
      await enqueueCommunityAccessGrantedEmailInternal({ ctx, userId: f.memberId, communityId: f.communityId, grantMarker: "m1", nowMs: NOW });
      const row = await ctx.db.query("emailOutbox").first();
      return row?.payload?.actionUrl ?? null;
    });
    expect(url, String(withSite)).toBe(withSite
      ? "https://night-swimmers-staging.polynet.page/chat"
      : "https://polynet-staging.example.com/c/night-swimmers/chat");
  }
});
