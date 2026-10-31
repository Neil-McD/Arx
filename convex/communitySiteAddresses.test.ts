/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";

// Every community is on its own site from the start: Polynet's default site
// serves its addresses until the founder deploys their own.
const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.now();

afterEach(() => { vi.unstubAllEnvs(); });

async function founder(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authSubject: "site-founder-subject", displayName: "Site Founder", handle: "site-founder", normalizedHandle: "site-founder", createdAt: NOW, updatedAt: NOW,
    });
    await ctx.db.insert("userProfileDetails", { userId, displayName: "Site Founder", avatarUrl: "https://example.com/f.png", createdAt: NOW, updatedAt: NOW });
    for (const document of PLATFORM_LEGAL_DOCUMENTS) {
      await ctx.db.insert("legalAcceptances", { userId, documentKey: document.key, documentVersion: document.version, acceptedAt: NOW, source: "test", createdAt: NOW });
    }
  });
  return t.withIdentity({ subject: "site-founder-subject" });
}

const addresses = (t: ReturnType<typeof convexTest>) => t.run(async (ctx) =>
  (await ctx.db.query("communityDomains").collect()).map((row) => [row.origin, row.kind ?? "site"]).sort());

test("a new community gets its site and private twin addresses when it's created", async () => {
  vi.stubEnv("POLYNET_SITES_DOMAIN", "polynet.page");
  vi.stubEnv("POLYNET_SITES_HOST_SUFFIX", "-staging");
  const t = convexTest(schema, modules);
  const asOwner = await founder(t);
  await asOwner.mutation(api.communityLifecycle.createCommunity, { name: "Night Swimmers", slug: "night-swimmers" });
  expect(await addresses(t)).toEqual([
    ["https://night-swimmers--me-staging.polynet.page", "private"],
    ["https://night-swimmers-staging.polynet.page", "site"],
  ]);
  // Its public identity answers there, so the edge can serve it.
  const identity = await t.query(internal.communityApps.getCommunityPublicIdentityByOriginInternal, { origin: "https://night-swimmers-staging.polynet.page" });
  expect(identity).toMatchObject({ slug: "night-swimmers", name: "Night Swimmers", avatar_url: null, banner_url: null, listed: false });
});

test("without a sites domain, or with a slug that can't be an address, a community is still created, just without one", async () => {
  const t = convexTest(schema, modules);
  const asOwner = await founder(t);
  await asOwner.mutation(api.communityLifecycle.createCommunity, { name: "Quiet Club", slug: "quiet-club" });
  expect(await addresses(t)).toEqual([]);
  vi.stubEnv("POLYNET_SITES_DOMAIN", "polynet.page");
  // "admin" is reserved: never a community's address.
  await expect(asOwner.mutation(api.communityLifecycle.createCommunity, { name: "Admin", slug: "admin" })).resolves.toMatchObject({ slug: "admin" });
  expect(await addresses(t)).toEqual([]);
});

test("the backfill gives older communities their addresses, skips archived ones, and is safe to run twice", async () => {
  const t = convexTest(schema, modules);
  const asOwner = await founder(t);
  await asOwner.mutation(api.communityLifecycle.createCommunity, { name: "Old Club", slug: "old-club" });
  const gone = await asOwner.mutation(api.communityLifecycle.createCommunity, { name: "Gone Club", slug: "gone-club" });
  await t.run((ctx) => ctx.db.patch(gone.id as any, { lifecycleStatus: "archived" } as any));
  vi.stubEnv("POLYNET_SITES_DOMAIN", "polynet.page");
  const dry = await t.mutation(internal.communitySites.registerCommunitySiteAddressesInternal, { dryRun: true });
  expect(dry).toMatchObject({ registered: ["https://old-club.polynet.page"], isDone: true });
  expect(await addresses(t)).toEqual([]);
  const run = await t.mutation(internal.communitySites.registerCommunitySiteAddressesInternal, {});
  expect(run.registered.sort()).toEqual(["https://old-club--me.polynet.page", "https://old-club.polynet.page"]);
  const again = await t.mutation(internal.communitySites.registerCommunitySiteAddressesInternal, {});
  expect(again.registered).toEqual([]);
  expect(await addresses(t)).toEqual([
    ["https://old-club--me.polynet.page", "private"],
    ["https://old-club.polynet.page", "site"],
  ]);
});

// A rename of the community's address, as Studio's settings save it.
async function rename(asOwner: any, communityId: any, slug: string) {
  const current = await asOwner.query(api.communityLifecycle.getCommunitySettings, { communityId });
  return await asOwner.mutation(api.communityLifecycle.saveCommunitySettings, {
    communityId, expectedSettingsRevision: current.settings_revision, name: current.name, slug,
    oneLiner: current.one_liner ?? "", about: current.about ?? "", avatarStorageId: null, avatarUrl: null,
    bannerStorageId: null, bannerUrl: null, visibility: "unlisted", monthlyAmountBaseUnits: null, annualAmountBaseUnits: null,
  });
}

test("renaming a community's address moves its site with it, and frees the old address for someone else", async () => {
  vi.stubEnv("POLYNET_SITES_DOMAIN", "polynet.page");
  const t = convexTest(schema, modules);
  const asOwner = await founder(t);
  const first = await asOwner.mutation(api.communityLifecycle.createCommunity, { name: "Night Swimmers", slug: "night-swimmers" });
  await rename(asOwner, first.id, "night-owls");
  expect(await addresses(t)).toEqual([
    ["https://night-owls--me.polynet.page", "private"],
    ["https://night-owls.polynet.page", "site"],
  ]);
  // The old name, taken by a new community, comes with its own addresses.
  const second = await asOwner.mutation(api.communityLifecycle.createCommunity, { name: "Night Swimmers II", slug: "night-swimmers" });
  const owners = await t.run(async (ctx) => Object.fromEntries((await ctx.db.query("communityDomains").collect()).map((row) => [row.origin, String(row.communityId)])));
  expect(owners["https://night-swimmers.polynet.page"]).toBe(String(second.id));
  expect(owners["https://night-owls.polynet.page"]).toBe(String(first.id));
});

test("a community with a deployed site keeps its address; a new address someone else holds is refused; neither changes anything", async () => {
  vi.stubEnv("POLYNET_SITES_DOMAIN", "polynet.page");
  const t = convexTest(schema, modules);
  const asOwner = await founder(t);
  const built = await asOwner.mutation(api.communityLifecycle.createCommunity, { name: "Built Club", slug: "built-club" });
  await t.run(async (ctx) => {
    const userId = (await ctx.db.query("users").first())!._id;
    await ctx.db.insert("communitySiteDeploys", { communityId: built.id as any, userId, hostname: "built-club.polynet.page", fileCount: 2, totalBytes: 10, createdAt: NOW });
  });
  await expect(rename(asOwner, built.id, "built-elsewhere")).rejects.toThrow("community_slug_locked_by_site");
  const other = await asOwner.mutation(api.communityLifecycle.createCommunity, { name: "Other Club", slug: "other-club" });
  // An address left registered to another community (before renames moved addresses).
  await t.run((ctx) => ctx.db.insert("communityDomains", { communityId: built.id as any, origin: "https://claimed.polynet.page", createdAt: NOW }));
  await expect(rename(asOwner, other.id, "claimed")).rejects.toThrow("community_slug_taken");
  const slugs = await t.run(async (ctx) => (await ctx.db.query("communities").collect()).map((row) => row.slug).sort());
  expect(slugs).toEqual(["built-club", "other-club"]);
  expect((await addresses(t)).map(([origin]) => origin)).toEqual([
    "https://built-club--me.polynet.page", "https://built-club.polynet.page", "https://claimed.polynet.page",
    "https://other-club--me.polynet.page", "https://other-club.polynet.page",
  ]);
});

test("Studio's community list and the /c/<slug> page both carry the community's site, its front door", async () => {
  vi.stubEnv("POLYNET_SITES_DOMAIN", "polynet.page");
  vi.stubEnv("POLYNET_SITES_HOST_SUFFIX", "-staging");
  const t = convexTest(schema, modules);
  const asOwner = await founder(t);
  await asOwner.mutation(api.communityLifecycle.createCommunity, { name: "Night Swimmers", slug: "night-swimmers" });
  const funnel = await t.query(api.communityPublic.resolvePublicFunnelBySlug, { communitySlug: "night-swimmers" });
  expect((funnel as any).community.site_url).toBe("https://night-swimmers-staging.polynet.page");
  const mine = await asOwner.query(api.communityAdmin.listCommunityMemberships, {});
  expect((mine as any[]).map((row) => row.community?.site_url ?? row.communities?.site_url)).toEqual(["https://night-swimmers-staging.polynet.page"]);
  // Where sites aren't set up, there's no site to send anyone to.
  vi.unstubAllEnvs();
  expect(((await t.query(api.communityPublic.resolvePublicFunnelBySlug, { communitySlug: "night-swimmers" })) as any).community.site_url).toBeNull();
});
