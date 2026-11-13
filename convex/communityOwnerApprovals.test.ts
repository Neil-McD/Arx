/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import { registerCommunitySiteAddresses } from "./communitySites";
import { OWNER_APPROVAL_TTL_MS } from "./communityOwnerApprovals";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.now();

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

async function fixture(opts: { deployed?: boolean } = {}) {
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
      entryPolicy: "open", activeMemberCount: 2, createdAt: NOW, updatedAt: NOW,
    } as any);
    await ctx.db.insert("communityMemberships", {
      communityId, userId: adminId, role: "admin", accessSource: "free_grant", state: "active", activationSequence: 1, activatedAt: NOW, createdAt: NOW, updatedAt: NOW,
    } as any);
    await registerCommunitySiteAddresses(ctx, { _id: communityId, slug: "dawn-club" });
    if (opts.deployed !== false) {
      await ctx.db.insert("communitySiteDeploys", { communityId, userId: ownerId, hostname: "dawn-club-staging.polynet.page", fileCount: 1, totalBytes: 10, createdAt: NOW });
    }
    return { ownerId, adminId, communityId };
  });
  // The AI's request operation was retired; a request left waiting is a row, as it was stored.
  const ask = async (userId: any, to: "app" | "site") => {
    const id = await t.run(async (ctx) => {
      const waiting = await ctx.db.query("communityOwnerApprovals").collect();
      for (const row of waiting) if (row.status === "pending") await ctx.db.patch(row._id, { status: "replaced", decidedAt: Date.now() });
      return ctx.db.insert("communityOwnerApprovals", { communityId: ids.communityId, kind: "member_experience", requestedByUserId: userId,
        fromValue: "app", toValue: to, status: "pending", expiresAt: Date.now() + OWNER_APPROVAL_TTL_MS, createdAt: Date.now() } as any);
    });
    return { request: { request_id: String(id) } };
  };
  const decide = (subject: string, requestId: any, decision: "approve" | "decline") =>
    t.withIdentity({ subject }).mutation(api.communityOwnerApprovals.decideMemberExperienceRequest, { communityId: ids.communityId, requestId, decision });
  const membersUse = () => t.query(internal.communityOwnerApprovals.readMemberExperienceForTrustedManagerInternal, { userId: ids.ownerId, communityId: ids.communityId });
  return { t, ...ids, ask, decide, membersUse };
}

test("a request left waiting changes nothing until the owner approves it", async () => {
  const f = await fixture();
  const asked = await f.ask(f.ownerId, "site");
  expect(await f.membersUse()).toMatchObject({ members_use: "app", waiting_for_owner_approval: { to: "site" } });
  // Only the owner sees and decides it.
  await expect(f.t.withIdentity({ subject: "admin-subject" }).query(api.communityOwnerApprovals.getMyPendingMemberExperienceRequest, { communityId: f.communityId }))
    .rejects.toThrow(/community_owner_required/);
  await expect(f.decide("admin-subject", asked.request!.request_id, "approve")).rejects.toThrow(/community_owner_required/);
  expect(await f.decide("owner-subject", asked.request!.request_id, "approve")).toEqual({ status: "approved", members_use: "site" });
  expect(await f.membersUse()).toMatchObject({ members_use: "site", waiting_for_owner_approval: null });
  // Recorded as the owner's change, approved from their AI's request.
  const audit = await f.t.run((ctx) => ctx.db.query("criticalAuditEvents").collect());
  expect(audit.filter((row) => row.eventType === "community_member_experience_changed").map((row) => row.metadata))
    .toEqual([{ from: "app", to: "site", via: "owner_ai_approved" }]);
  // A decided request can't be decided again.
  await expect(f.decide("owner-subject", asked.request!.request_id, "approve")).rejects.toThrow(/community_approval_not_found/);
});


test("declined, replaced, expired and out-of-date requests change nothing", async () => {
  const f = await fixture();
  const first = await f.ask(f.ownerId, "site");
  const second = await f.ask(f.ownerId, "site");
  // The newer request replaced the first.
  await expect(f.decide("owner-subject", first.request!.request_id, "approve")).rejects.toThrow(/community_approval_not_found/);
  expect(await f.decide("owner-subject", second.request!.request_id, "decline")).toEqual({ status: "declined", members_use: "app" });
  // Expired.
  const late = await f.ask(f.ownerId, "site");
  await f.t.run((ctx) => ctx.db.patch(late.request!.request_id as any, { expiresAt: Date.now() - 1 }));
  expect(await f.decide("owner-subject", late.request!.request_id, "approve")).toEqual({ status: "expired", members_use: "app" });
  expect(await f.membersUse()).toMatchObject({ waiting_for_owner_approval: null });
  // Out of date: the owner already switched in Studio since the AI asked.
  const stale = await f.ask(f.ownerId, "site");
  await f.t.withIdentity({ subject: "owner-subject" }).mutation(api.communityLifecycle.setCommunityMemberExperience, { communityId: f.communityId, experience: "site" });
  expect(await f.decide("owner-subject", stale.request!.request_id, "approve")).toEqual({ status: "stale", members_use: "site" });
  expect(OWNER_APPROVAL_TTL_MS).toBe(24 * 60 * 60 * 1000);
});

test("an archived community can't be changed through a request, even one made before it was archived", async () => {
  const f = await fixture();
  const asked = await f.ask(f.ownerId, "site");
  await f.t.run((ctx) => ctx.db.patch(f.communityId, { lifecycleStatus: "archived", lifecycleGeneration: 1 } as any));
  await expect(f.decide("owner-subject", asked.request!.request_id, "approve")).rejects.toThrow();
  const stored = await f.t.run(async (ctx) => (await ctx.db.get(f.communityId) as any)?.memberExperience ?? null);
  expect(stored).toBeNull();
});
