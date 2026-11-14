/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { communityPrivatePageUrl, communitySitePageUrl, registerCommunitySiteAddresses } from "./communitySites";
import { directMessageLink } from "./directMessageEmails";
import { enqueueCommunityAccessGrantedEmailInternal } from "./emailEvents";

// Members always use Polynet's app (Nov 13: custom sites are being removed),
// so every email that brings them back opens the app, even for a community
// whose stored switch says "site" and which has deployed one.
const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.now();

afterEach(() => { vi.unstubAllEnvs(); });

// withSite: the community's members use its own deployed site (the owner's
// switch); appWithSite: it has a site address but members use Polynet's app.
async function fixture(withSite: boolean, opts: { appWithSite?: boolean } = {}) {
  const sited = withSite || opts.appWithSite;
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet-staging.example.com");
  if (sited) {
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
      ...(withSite ? { memberExperience: "site" } : {}),
    } as any);
    if (withSite) {
      await ctx.db.insert("communitySiteDeploys", { communityId, userId: ownerId, hostname: "night-swimmers-staging.polynet.page", fileCount: 1, totalBytes: 10, createdAt: NOW });
    }
    await ctx.db.insert("communityMemberships", {
      communityId, userId: memberId, role: "member", accessSource: "free_grant", state: "active",
      activationSequence: 1, activatedAt: NOW, createdAt: NOW, updatedAt: NOW,
    } as any);
    await registerCommunitySiteAddresses(ctx, { _id: communityId, slug: "night-swimmers" });
    return { ownerId, memberId, communityId };
  });
  return { t, ...ids };
}

test("even with a deployed site and the switch on site, every link stays in the app", async () => {
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
  expect(links).toEqual({ chat: null, event: null, messages: null, bySlug: null });
});

test("members on Polynet's app (the default, even with a site address): every link stays in the app", async () => {
  const f = await fixture(false, { appWithSite: true });
  const links = await f.t.run(async (ctx) => {
    const community = (await ctx.db.get(f.communityId))!;
    return [
      await communitySitePageUrl(ctx, community, "/chat"),
      await communityPrivatePageUrl(ctx, community, "/messages/x"),
      await directMessageLink(ctx, community, "k97abc", f.memberId),
    ];
  });
  expect(links).toEqual([null, null, "https://polynet-staging.example.com/?dm=k97abc"]);
  // Choosing the site without a deployed site of its own still means the app.
  const chosenWithoutDeploy = await f.t.run(async (ctx) => {
    await ctx.db.patch(f.communityId, { memberExperience: "site" } as any);
    return await communitySitePageUrl(ctx, (await ctx.db.get(f.communityId))!, "/chat");
  });
  expect(chosenWithoutDeploy).toBeNull();
});

test("without a site there's no site link, so each email keeps its Studio link", async () => {
  const f = await fixture(false);
  const links = await f.t.run(async (ctx) => {
    const community = (await ctx.db.get(f.communityId))!;
    return [await communitySitePageUrl(ctx, community, "/chat"), await communityPrivatePageUrl(ctx, community, "/messages/x")];
  });
  expect(links).toEqual([null, null]);
});

test("a direct message opens this environment's Studio inbox, never a site or a hard-coded production address", async () => {
  const withSite = await fixture(true);
  const link = (f: Awaited<ReturnType<typeof fixture>>, userId: any) =>
    f.t.run(async (ctx) => directMessageLink(ctx, await ctx.db.get(f.communityId), "k97abc", userId));
  expect(await link(withSite, withSite.memberId)).toBe("https://polynet-staging.example.com/?dm=k97abc");
  // Begun outside any community: the same inbox, on this environment's own app.
  expect(await withSite.t.run((ctx) => directMessageLink(ctx, null, "k97abc", withSite.memberId))).toBe("https://polynet-staging.example.com/?dm=k97abc");
  vi.unstubAllEnvs();
  const noSite = await fixture(false);
  expect(await link(noSite, noSite.memberId)).toBe("https://polynet-staging.example.com/?dm=k97abc");
});

test("'you're in' opens the community's chat in the app, with or without a site", async () => {
  for (const withSite of [true, false]) {
    vi.unstubAllEnvs();
    const f = await fixture(withSite);
    const url = await f.t.run(async (ctx) => {
      await enqueueCommunityAccessGrantedEmailInternal({ ctx, userId: f.memberId, communityId: f.communityId, grantMarker: "m1", nowMs: NOW });
      const row = await ctx.db.query("emailOutbox").first();
      return row?.payload?.actionUrl ?? null;
    });
    expect(url, String(withSite)).toBe("https://polynet-staging.example.com/c/night-swimmers/chat");
  }
});
