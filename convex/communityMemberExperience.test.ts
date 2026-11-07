/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { registerCommunitySiteAddresses } from "./communitySites";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.now();

afterEach(() => { vi.unstubAllEnvs(); });

async function fixture() {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet-staging.example.com");
  vi.stubEnv("POLYNET_SITES_DOMAIN", "polynet.page");
  vi.stubEnv("POLYNET_SITES_HOST_SUFFIX", "-staging");
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (subject: string, handle: string) => ctx.db.insert("users", {
      authSubject: subject, displayName: handle, handle, normalizedHandle: handle, createdAt: NOW, updatedAt: NOW,
    } as any);
    const ownerId = await user("owner-subject", "owner");
    const adminId = await user("admin-subject", "admin");
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "dawn-club", name: "Dawn Club", visibility: "published", inferenceFundingPolicy: "managed_required",
      entryPolicy: "open", activeMemberCount: 2, builderAccessMode: "free", createdAt: NOW, updatedAt: NOW,
    } as any);
    for (const [userId, role] of [[adminId, "admin"]] as const) {
      await ctx.db.insert("communityMemberships", {
        communityId, userId, role, accessSource: "free_grant", state: "active", activationSequence: 1, activatedAt: NOW, createdAt: NOW, updatedAt: NOW,
      } as any);
    }
    await registerCommunitySiteAddresses(ctx, { _id: communityId, slug: "dawn-club" });
    return { ownerId, adminId, communityId };
  });
  const set = (subject: string, experience: "app" | "site") =>
    t.withIdentity({ subject }).mutation(api.communityLifecycle.setCommunityMemberExperience, { communityId: ids.communityId, experience });
  const stored = () => t.run(async (ctx) => (await ctx.db.get(ids.communityId) as any)?.memberExperience ?? null);
  return { t, ...ids, set, stored };
}

test("only the owner flips it, and only to a site they've deployed", async () => {
  const f = await fixture();
  await expect(f.set("admin-subject", "site")).rejects.toThrow(/community_owner_required/);
  await expect(f.set("owner-subject", "site")).rejects.toThrow(/community_custom_site_required/);
  expect(await f.stored()).toBeNull();
  await f.t.run((ctx) => ctx.db.insert("communitySiteDeploys", {
    communityId: f.communityId, userId: f.ownerId, hostname: "dawn-club-staging.polynet.page", fileCount: 1, totalBytes: 10, createdAt: NOW,
  }));
  await expect(f.set("admin-subject", "site")).rejects.toThrow(/community_owner_required/);
  expect(await f.set("owner-subject", "site")).toEqual({ member_experience: "site" });
  expect(await f.set("owner-subject", "app")).toEqual({ member_experience: "app" });
  expect(await f.stored()).toBe("app");
});

test("each change is recorded with who made it; saving the same choice records nothing", async () => {
  const f = await fixture();
  await f.t.run((ctx) => ctx.db.insert("communitySiteDeploys", {
    communityId: f.communityId, userId: f.ownerId, hostname: "dawn-club-staging.polynet.page", fileCount: 1, totalBytes: 10, createdAt: NOW,
  }));
  await f.set("owner-subject", "site");
  await f.set("owner-subject", "site");
  await f.set("owner-subject", "app");
  const audit = await f.t.run((ctx) => ctx.db.query("criticalAuditEvents").collect());
  const changes = audit.filter((row) => row.eventType === "community_member_experience_changed");
  expect(changes.map((row) => [String(row.actorUserId), (row.metadata as any)?.from, (row.metadata as any)?.to])).toEqual([
    [String(f.ownerId), "app", "site"],
    [String(f.ownerId), "site", "app"],
  ]);
});
