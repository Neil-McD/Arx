/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { readCanonicalCommunityAgentContext } from "./communityAgentContext";

const modules = import.meta.glob([
  "./communityAgent.ts",
  "./communityDirectory.ts",
  "./_generated/**/*.*s",
]);

const OWNER_SUBJECT = "agent-profile-owner";
const MEMBER_SUBJECT = "agent-profile-member";

async function createFixture(t: ReturnType<typeof convexTest>) {
  const nowMs = 1_750_000_000_000;
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { authSubject: OWNER_SUBJECT, displayName: "Owner", createdAt: nowMs, updatedAt: nowMs });
    const memberId = await ctx.db.insert("users", { authSubject: MEMBER_SUBJECT, displayName: "Member", createdAt: nowMs, updatedAt: nowMs });
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "ai-employee-builders", name: "AI Employee Builders", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeFunnelSlot: "default", createdAt: nowMs, updatedAt: nowMs,
    });
    await ctx.db.insert("communityMemberships", {
      communityId, userId: memberId, role: "member", accessSource: "manual_grant", active: true, createdAt: nowMs, updatedAt: nowMs,
    });
    return { communityId };
  });
}

test("the agent goes by the community's name and icon until the owner sets its own", async () => {
  const t = convexTest(schema, modules);
  const { communityId } = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });

  expect(await t.query(api.communityAgent.getCommunityAgentProfile, { communityId })).toMatchObject({
    name: "AI Employee Builders", custom_name: null, avatar_url: null,
  });

  await expect(asMember.mutation(api.communityAgent.saveCommunityAgentProfile, { communityId, displayName: "Mine" })).rejects.toThrow();
  await expect(asOwner.mutation(api.communityAgent.saveCommunityAgentProfile, { communityId, displayName: "x".repeat(61) }))
    .rejects.toThrow(/community_agent_name_too_long/);
  await expect(asOwner.mutation(api.communityAgent.saveCommunityAgentProfile, { communityId, avatarUrl: "http://example.com/a.png" }))
    .rejects.toThrow(/community_agent_avatar_url_invalid/);

  const named = await asOwner.mutation(api.communityAgent.saveCommunityAgentProfile, {
    communityId, displayName: "  Ava   the guide ", avatarUrl: "https://example.com/ava.png",
  });
  expect(named).toMatchObject({ name: "Ava the guide", custom_name: "Ava the guide", avatar_url: "https://example.com/ava.png" });
  // The agent itself answers under the same name.
  expect((await t.run((ctx) => readCanonicalCommunityAgentContext(ctx, communityId)))?.agentDisplayName).toBe("Ava the guide");

  // Instructions saved later keep the profile.
  await asOwner.mutation(api.communityAgent.saveCommunityAgentConfig, { communityId, communitySystemPrompt: "Be brief." });
  expect(await t.query(api.communityAgent.getCommunityAgentProfile, { communityId })).toMatchObject({ custom_name: "Ava the guide" });

  const reset = await asOwner.mutation(api.communityAgent.saveCommunityAgentProfile, { communityId, displayName: null, avatarUrl: null });
  expect(reset).toMatchObject({ name: "AI Employee Builders", custom_name: null, avatar_url: null });
});

test("an uploaded photo replaces a URL one, and going back to the icon deletes the upload", async () => {
  const t = convexTest(schema, modules);
  const { communityId } = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["png"], { type: "image/png" })));

  await asOwner.mutation(api.communityAgent.saveCommunityAgentProfile, { communityId, avatarUrl: "https://example.com/ava.png" });
  const uploaded = await asOwner.mutation(api.communityAgent.saveCommunityAgentProfile, { communityId, avatarStorageId: storageId });
  expect(uploaded?.avatar_storage_id).toBe(String(storageId));
  expect(uploaded?.avatar_url).not.toBe("https://example.com/ava.png");
  expect(uploaded?.avatar_url).toBeTruthy();

  const back = await asOwner.mutation(api.communityAgent.saveCommunityAgentProfile, { communityId, avatarStorageId: null });
  expect(back).toMatchObject({ avatar_url: null, avatar_storage_id: null });
  expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).toBeNull();
});

test("@mention search offers the agent under its profile name, and still finds it by the community's", async () => {
  const t = convexTest(schema, modules);
  const { communityId } = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });
  await asOwner.mutation(api.communityAgent.saveCommunityAgentProfile, { communityId, displayName: "The Builder" });

  for (const query of ["the bui", "employee"]) {
    const rows = await asMember.query(api.communityDirectory.searchCommunityMentionCandidates, { communityId, query });
    expect(rows.find((row: { kind: string }) => row.kind === "community_agent"), query).toMatchObject({ display_name: "The Builder" });
  }
  expect(await t.query(api.communityAgent.getCommunityAgentProfile, { communityId })).toMatchObject({ community_avatar_url: null });
});
