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
  expect(identity).toMatchObject({ slug: "night-swimmers", name: "Night Swimmers", avatar_url: null, banner_url: null });
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
