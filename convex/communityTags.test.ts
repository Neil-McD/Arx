import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";

const modules = import.meta.glob("./**/*.*s");

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const user = async (handle: string) => {
      const userId = await ctx.db.insert("users", { authSubject: `${handle}-subject`, displayName: handle, handle, normalizedHandle: handle, createdAt: 1, updatedAt: 1 });
      for (const document of PLATFORM_LEGAL_DOCUMENTS) {
        await ctx.db.insert("legalAcceptances", { userId, documentKey: document.key, documentVersion: document.version, acceptedAt: 1, source: "test", createdAt: 1 });
      }
      return userId;
    };
    const owner = await user("owner");
    const communityId = await ctx.db.insert("communities", { ownerId: owner, slug: "run-club", name: "Run club", visibility: "unlisted",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 3, createdAt: 1, updatedAt: 1 });
    const join = async (handle: string, role: "member" | "moderator") => {
      const userId = await user(handle);
      await ctx.db.insert("communityMemberships", { communityId, userId, role, accessSource: "free_grant", active: true, activationSequence: 1, activatedAt: 1, createdAt: 1, updatedAt: 1 });
      return userId;
    };
    return { owner, communityId, mod: await join("mod", "moderator"), ana: await join("ana", "member"), sam: await join("sam", "member"), stranger: await user("stranger") };
  });
  const as = (handle: string) => t.withIdentity({ subject: `${handle}-subject` });
  return { t, ...ids, as };
}

test("Studio: owners make tags and tag a page of people; moderators read them; members can't", async () => {
  const f = await fixture();
  const owner = f.as("owner");
  const scope = { authSubject: "owner-subject", communityId: f.communityId };
  expect(await owner.mutation(api.communityTags.createCommunityTag, { ...scope, name: "Cohort 3" })).toMatchObject({ slug: "cohort-3", created: true });
  // A stranger in the selection is skipped; the members are tagged.
  expect(await owner.mutation(api.communityTags.setCommunityMemberTags, { ...scope, tag: "cohort-3", targetUserIds: [f.ana, f.sam, f.stranger], on: true }))
    .toEqual({ changed: 2, skipped: [String(f.stranger)] });
  const mod = f.as("mod");
  const modScope = { authSubject: "mod-subject", communityId: f.communityId };
  expect(await mod.query(api.communityTags.listCommunityTags, modScope)).toMatchObject({ can_manage: false, tags: [{ slug: "cohort-3", people: 2 }] });
  expect((await mod.query(api.communityTags.listCommunityMemberTags, { ...modScope, targetUserIds: [f.ana, f.mod] }))[String(f.ana)])
    .toEqual([{ slug: "cohort-3", name: "Cohort 3" }]);
  await expect(mod.mutation(api.communityTags.setCommunityMemberTags, { ...modScope, tag: "cohort-3", targetUserIds: [f.mod], on: true })).rejects.toThrow();
  const ana = f.as("ana");
  await expect(ana.query(api.communityTags.listCommunityTags, { authSubject: "ana-subject", communityId: f.communityId })).rejects.toThrow();
  // More than a page at once is refused.
  await expect(owner.mutation(api.communityTags.setCommunityMemberTags, { ...scope, tag: "cohort-3", targetUserIds: Array(51).fill(f.ana), on: false })).rejects.toThrow();
  expect(await owner.mutation(api.communityTags.setCommunityMemberTags, { ...scope, tag: "cohort-3", targetUserIds: [f.ana], on: false })).toEqual({ changed: 1, skipped: [] });
});
