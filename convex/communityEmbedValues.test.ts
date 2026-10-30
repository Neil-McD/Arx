/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
const modules = import.meta.glob(["./*.ts", "./_generated/**/*.*s"]);

test("a member's widget answers are kept on the server, per member, and an outsider can neither read nor write them", async () => {
  const t = convexTest(schema, modules);
  const f = await t.run(async ctx => {
    const now = Date.now();
    const ownerId = await ctx.db.insert("users", { authSubject: "embed-owner", displayName: "Owner", createdAt: now, updatedAt: now });
    const memberId = await ctx.db.insert("users", { authSubject: "embed-member", displayName: "Member", createdAt: now, updatedAt: now });
    await ctx.db.insert("users", { authSubject: "embed-outsider", displayName: "Outsider", createdAt: now, updatedAt: now });
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: now, updatedAt: now });
    const communityId = await ctx.db.insert("communities", { ownerId, slug: "embed-values", name: "Embed values", lifecycleStatus: "active",
      visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "approval", createdAt: now, updatedAt: now });
    await activateCommunityMembershipCore({ ctx, communityId, userId: memberId, accessSource: "manual_grant", activationReason: "test", nowMs: now });
    return { communityId };
  });
  const member = t.withIdentity({ subject: "embed-member" });
  const owner = t.withIdentity({ subject: "embed-owner" });
  const outsider = t.withIdentity({ subject: "embed-outsider" });
  const key = { communityId: f.communityId, key: "goal-planner" };
  expect(await member.query(api.communityEmbedValues.getOwnEmbedValue, key)).toBeNull();
  await member.mutation(api.communityEmbedValues.saveOwnEmbedValue, { ...key, value: "{\"goal\":\"ship\"}" });
  await member.mutation(api.communityEmbedValues.saveOwnEmbedValue, { ...key, value: "{\"goal\":\"ship it\"}" });
  expect(await member.query(api.communityEmbedValues.getOwnEmbedValue, key)).toBe("{\"goal\":\"ship it\"}");
  // Each member has their own copy; the owner sees theirs, not the member's.
  expect(await owner.query(api.communityEmbedValues.getOwnEmbedValue, key)).toBeNull();
  await expect(outsider.query(api.communityEmbedValues.getOwnEmbedValue, key)).rejects.toThrow();
  await expect(outsider.mutation(api.communityEmbedValues.saveOwnEmbedValue, { ...key, value: "x" })).rejects.toThrow();
  await expect(member.mutation(api.communityEmbedValues.saveOwnEmbedValue, { ...key, key: "k".repeat(101), value: "x" })).rejects.toThrow("embed_key_invalid");
  expect(await t.run(ctx => ctx.db.query("communityEmbedValues").collect())).toHaveLength(1);
});
