/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityAdmin.ts",
  "./communityPublic.ts",
  "./communityDirectory.ts",
  "./_generated/**/*.*s",
]);

async function fixture() {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const ids = await t.run(async (ctx) => {
    const user = (subject: string, handle: string) => ctx.db.insert("users", {
      authSubject: subject, displayName: handle, handle, normalizedHandle: handle, createdAt: nowMs, updatedAt: nowMs,
    });
    const ownerId = await user("cc-owner", "rashid");
    const janeId = await user("cc-jane", "jane");
    const adminId = await user("cc-admin", "ada");
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "aieb", name: "AI Employee Builders", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 2, createdAt: nowMs, updatedAt: nowMs,
    });
    const member = (userId: any, role: "admin" | "member") => ctx.db.insert("communityMemberships", {
      communityId, userId, role, accessSource: "free_grant", active: true, activationSequence: 1,
      activatedAt: nowMs, createdAt: nowMs, updatedAt: nowMs,
    });
    const janeMembership = await member(janeId, "member");
    const adminMembership = await member(adminId, "admin");
    return { communityId, janeMembership, adminMembership };
  });
  return { t, ...ids, asOwner: t.withIdentity({ subject: "cc-owner" }), asAdmin: t.withIdentity({ subject: "cc-admin" }) };
}

describe("co-creators", () => {
  test("the owner makes a member a co-creator; they show as a creator and can change the look", async () => {
    const f = await fixture();
    expect((await f.t.query(api.communityPublic.listCommunityCreators, { communityId: f.communityId })).creators.map((c) => [c.display_name, c.role]))
      .toEqual([["rashid", "owner"]]);

    await f.asOwner.mutation(api.communityAdmin.setCommunityMemberRole, { communityId: f.communityId, targetMembershipId: f.janeMembership, role: "co_creator" });
    const row = await f.t.run((ctx) => ctx.db.get(f.janeMembership));
    expect(row).toMatchObject({ role: "admin", coCreator: true });
    expect((await f.t.query(api.communityPublic.listCommunityCreators, { communityId: f.communityId })).creators.map((c) => [c.display_name, c.role]))
      .toEqual([["rashid", "owner"], ["jane", "co_creator"]]);

    // Back to member: no longer a creator, and the flag is gone.
    await f.asOwner.mutation(api.communityAdmin.setCommunityMemberRole, { communityId: f.communityId, targetMembershipId: f.janeMembership, role: "member" });
    expect(await f.t.run((ctx) => ctx.db.get(f.janeMembership))).toMatchObject({ role: "member" });
    expect((await f.t.run((ctx) => ctx.db.get(f.janeMembership)))?.coCreator).toBeUndefined();
    expect((await f.t.query(api.communityPublic.listCommunityCreators, { communityId: f.communityId })).creators).toHaveLength(1);
  });

  test("admins are listed after the creators, and a co-creator admin shows once", async () => {
    const f = await fixture();
    const list = () => f.t.query(api.communityPublic.listCommunityCreators, { communityId: f.communityId });
    expect((await list()).admins.map((c) => [c.display_name, c.role])).toEqual([["ada", "admin"]]);
    await f.asOwner.mutation(api.communityAdmin.setCommunityMemberRole, { communityId: f.communityId, targetMembershipId: f.adminMembership, role: "co_creator" });
    const after = await list();
    expect(after.creators.map((c) => c.display_name)).toEqual(["rashid", "ada"]);
    expect(after.admins).toEqual([]);
  });

  test("an admin cannot make anyone a co-creator", async () => {
    const f = await fixture();
    await expect(f.asAdmin.mutation(api.communityAdmin.setCommunityMemberRole, { communityId: f.communityId, targetMembershipId: f.janeMembership, role: "co_creator" }))
      .rejects.toThrow(/community_owner_required_for_admin_role/);
  });
});

describe("profile community lists", () => {
  const profileModules = import.meta.glob([
    "./communityAdmin.ts",
    "./profiles.ts",
    "./_generated/**/*.*s",
  ]);

  test("a profile lists owned, co-created and joined public communities, and each list can be hidden", async () => {
    const t = convexTest(schema, profileModules);
    const nowMs = Date.now();
    await t.run(async (ctx) => {
      const user = (subject: string, handle: string) => ctx.db.insert("users", {
        authSubject: subject, displayName: handle, handle, normalizedHandle: handle, createdAt: nowMs, updatedAt: nowMs,
      });
      const janeId = await user("p-jane", "jane");
      const otherOwner = await user("p-owner", "olive");
      await user("p-viewer", "vic");
      const community = (ownerId: any, slug: string, visibility: "published" | "unlisted") => ctx.db.insert("communities", {
        ownerId, slug, name: slug, visibility, inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 1, createdAt: nowMs, updatedAt: nowMs,
      });
      await community(janeId, "janes-own", "published");
      const coCreated = await community(otherOwner, "co-made", "published");
      const joinedPublic = await community(otherOwner, "joined-public", "published");
      const joinedPrivate = await community(otherOwner, "joined-private", "unlisted");
      const member = (communityId: any, extra: Record<string, unknown> = {}) => ctx.db.insert("communityMemberships", {
        communityId, userId: janeId, role: "member", accessSource: "free_grant", active: true, activationSequence: 1,
        activatedAt: nowMs, createdAt: nowMs, updatedAt: nowMs, ...extra,
      });
      await member(coCreated, { role: "admin", coCreator: true });
      await member(joinedPublic);
      await member(joinedPrivate);
    });
    const asViewer = t.withIdentity({ subject: "p-viewer" });
    const asJane = t.withIdentity({ subject: "p-jane" });
    const read = async () => {
      const context = await asViewer.query(api.profiles.getProfileCommunityContext, { targetUserId: "p-jane" });
      return {
        owned: context.owned_communities.map((c: any) => [c.slug, Boolean(c.co_creator)]),
        joined: (context.joined_communities ?? []).map((c: any) => c.slug),
      };
    };
    expect(await read()).toEqual({ owned: [["janes-own", false], ["co-made", true]], joined: ["joined-public"] });

    await asJane.mutation(api.profiles.setMyProfileCommunityVisibility, { showJoined: false });
    expect(await read()).toEqual({ owned: [["janes-own", false], ["co-made", true]], joined: [] });
    await asJane.mutation(api.profiles.setMyProfileCommunityVisibility, { showOwned: false, showJoined: true });
    expect(await read()).toEqual({ owned: [], joined: ["joined-public"] });

    // Jane always sees her own lists.
    const own = await asJane.query(api.profiles.getProfileCommunityContext, { targetUserId: "p-jane" });
    expect(own.owned_communities.length).toBe(2);
  });
});
