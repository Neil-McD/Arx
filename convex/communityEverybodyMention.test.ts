import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { resolveMentionedUserIdsForInteractionWrite } from "./communityInteractions";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

// @everybody notifies the whole community, so the backend decides who may send
// it at write time: the owner and admins, on a new post only. Moderators and
// members can't, a reply can't, and a payload that doesn't match the visible
// text (or names another role) is refused.
test("@everybody: only the owner and admins, only on a new post, only as written", async () => {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (handle: string) => ctx.db.insert("users", {
      authSubject: handle, displayName: handle, handle, normalizedHandle: handle, createdAt: 1, updatedAt: 1,
    });
    const ownerId = await user("owner");
    const communityId = await ctx.db.insert("communities", {
      ownerId, name: "Club", slug: "club", visibility: "unlisted", entryPolicy: "open", inferenceFundingPolicy: "managed_required",
      lifecycleStatus: "active", lifecycleGeneration: 0, createdAt: 1, updatedAt: 1,
    } as any);
    const member = async (handle: string, role: string) => {
      const userId = await user(handle);
      await ctx.db.insert("communityMemberships", { communityId, userId, role, state: "active", createdAt: 1, updatedAt: 1 } as any);
      return userId;
    };
    return {
      communityId, ownerId,
      adminId: await member("admin", "admin"),
      moderatorId: await member("moderator", "moderator"),
      memberId: await member("member", "member"),
    };
  });
  const write = (actorUserId: any, options: { targetKind?: "root" | "reply"; text?: string; mention?: Record<string, unknown> } = {}) =>
    t.run((ctx) => resolveMentionedUserIdsForInteractionWrite({
      ctx, communityId: ids.communityId, actorUserId, targetKind: options.targetKind ?? "root",
      text: options.text ?? "Big news @everybody", mentions: [(options.mention ?? { roleKey: "everybody" }) as any],
    }));

  expect(await write(ids.ownerId)).toEqual([{ kind: "role", roleKey: "everybody" }]);
  expect(await write(ids.adminId)).toEqual([{ kind: "role", roleKey: "everybody" }]);
  await expect(write(ids.moderatorId)).rejects.toThrow();
  await expect(write(ids.memberId)).rejects.toThrow();
  await expect(write(ids.ownerId, { targetKind: "reply" })).rejects.toThrow("interaction_mention_everybody_reply_not_allowed");
  await expect(write(ids.ownerId, { text: "Big news, everyone" })).rejects.toThrow("interaction_mention_token_missing");
  await expect(write(ids.ownerId, { mention: { roleKey: "admins" } })).rejects.toThrow("interaction_mention_role_unknown");
  await expect(write(ids.ownerId, { mention: { roleKey: "everybody", userId: ids.memberId } })).rejects.toThrow("interaction_mention_payload_ambiguous");
});
