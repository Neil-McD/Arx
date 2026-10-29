/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";
const modules = import.meta.glob(["./*.ts", "./_generated/**/*.*s"]);

async function fixture() {
  const t = convexTest(schema, modules);
  const f = await t.run(async ctx => {
    const now = Date.now();
    const ownerId = await ctx.db.insert("users", { authSubject: "ref-owner", displayName: "Owner", createdAt: now, updatedAt: now });
    const memberId = await ctx.db.insert("users", { authSubject: "ref-member", displayName: "Member", handle: "ref-member", normalizedHandle: "ref-member", createdAt: now, updatedAt: now });
    await ctx.db.insert("userProfileDetails", { userId: memberId, displayName: "Member", avatarUrl: "https://example.com/m.png", onboardingCompletedAt: now, createdAt: now, updatedAt: now });
    for (const document of PLATFORM_LEGAL_DOCUMENTS) {
      await ctx.db.insert("legalAcceptances", { userId: memberId, documentKey: document.key, documentVersion: document.version, acceptedAt: now, source: "test", createdAt: now });
    }
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: now, updatedAt: now });
    const community = (slug: string, visibility: "published" | "unlisted") => ctx.db.insert("communities", { ownerId, slug, name: slug, lifecycleStatus: "active",
      visibility, inferenceFundingPolicy: "managed_required", entryPolicy: "approval", createdAt: now, updatedAt: now });
    return { now, ownerId, memberId, communityId: await community("aieb", "published"),
      clubId: await community("two-hour-club", "published"), hiddenId: await community("draft-club", "unlisted") };
  });
  return { t, ...f };
}

test("the join-link ref is kept first touch and shows as Referred by on the client row", async () => {
  const f = await fixture();
  const member = f.t.withIdentity({ subject: "ref-member" });
  const owner = f.t.withIdentity({ subject: "ref-owner" });
  await member.mutation(api.communityPublic.joinPublicCommunityBySlug, { communitySlug: "aieb", ref: "dean" });
  await member.mutation(api.communityPublic.joinPublicCommunityBySlug, { communitySlug: "aieb", ref: "someone-else" });
  await member.mutation(api.communityPublic.joinPublicCommunityBySlug, { communitySlug: "two-hour-club", ref: "not a ref!" });
  expect((await f.t.run(ctx => ctx.db.query("communityReferrals").collect())).map(row => row.ref)).toEqual(["dean"]);
  await f.t.run(ctx => activateCommunityMembershipCore({ ctx, communityId: f.communityId, userId: f.memberId,
    accessSource: "manual_grant", activationReason: "test", nowMs: f.now }));
  const list = await owner.query(api.communityClients.listClientsForOwner, { communityId: f.communityId });
  expect(list.clients.map((row: any) => row.referred_by)).toContain("dean");
});

test("a community lists its owner's other public communities, never itself or an unlisted one", async () => {
  const f = await fixture();
  const result = await f.t.query(api.communityPublic.listSiblingCommunities, { communityId: f.communityId });
  expect(result.communities.map((row: any) => row.slug)).toEqual(["two-hour-club"]);
});
