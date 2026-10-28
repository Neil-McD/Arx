/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import {
  getCommunityAndMembership,
  normalizeVisibility,
  requireCommunityChatAccess,
  requireCommunityManager,
  requireCommunityModerator,
  resolveCommunityAccessBundle,
  resolveCommunityLens,
} from "./communityCore";
import { COMMUNITY_BUILDER_ACCESS_SUBSCRIPTION_REQUIRED } from "../shared/founderPlan";

const modules = import.meta.glob(["./_generated/**/*.*s"]);
const NOW = Date.now();

type Person = "owner" | "admin" | "moderator" | "member" | "lapsedPaidAdmin" | "blockedAdmin" | "removedAdmin" | "outsider";
const PEOPLE: Person[] = ["owner", "admin", "moderator", "member", "lapsedPaidAdmin", "blockedAdmin", "removedAdmin", "outsider"];

// One community, everyone in it, in a state where it can run or can't.
async function fixture(canRun: boolean) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (handle: string) => ctx.db.insert("users", { authSubject: `${handle}-subject`, displayName: handle, createdAt: NOW, updatedAt: NOW });
    const people: Record<string, any> = {};
    for (const person of PEOPLE) people[person] = await user(person);
    const communityId = await ctx.db.insert("communities", {
      ownerId: people.owner, slug: `lens-${canRun ? "runs" : "stopped"}`, name: "Lens", visibility: "unlisted",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 4, createdAt: NOW, updatedAt: NOW,
      ...(canRun ? {} : { builderAccessMode: COMMUNITY_BUILDER_ACCESS_SUBSCRIPTION_REQUIRED }),
    } as any);
    const membership = (person: Person, role: string, extra: Record<string, unknown> = {}) => ctx.db.insert("communityMemberships", {
      communityId, userId: people[person], role, accessSource: "free_grant", active: true,
      activationSequence: 1, activatedAt: NOW, createdAt: NOW, updatedAt: NOW, ...extra,
    } as any);
    await membership("admin", "admin");
    await membership("moderator", "moderator");
    await membership("member", "member");
    // A paid membership whose subscription lapsed: the row is still active.
    await membership("lapsedPaidAdmin", "admin", { accessSource: "paid_subscription" });
    await membership("blockedAdmin", "admin");
    await ctx.db.insert("communityBlocks", { communityId, userId: people.blockedAdmin, createdByUserId: people.owner, createdAt: NOW, updatedAt: NOW });
    await membership("removedAdmin", "admin", { active: false, revokedAt: NOW, revokedReason: "removed_by_manager" });
    return { communityId, people };
  });
  // Paid entry, so the lapsed paid membership isn't entitled (everyone else holds a free grant).
  await t.run((ctx) => ctx.db.patch(ids.communityId, { entryPolicy: "paid_subscription" } as any));
  return { t, ...ids };
}

// What each person is, and may do, when the community can run.
const EXPECTED: Record<Person, { relation: string | null; read: boolean; moderate: boolean; manage: boolean; own: boolean }> = {
  owner: { relation: "owner", read: true, moderate: true, manage: true, own: true },
  admin: { relation: "admin", read: true, moderate: true, manage: true, own: false },
  moderator: { relation: "moderator", read: true, moderate: true, manage: false, own: false },
  member: { relation: "member", read: true, moderate: false, manage: false, own: false },
  lapsedPaidAdmin: { relation: null, read: false, moderate: false, manage: false, own: false },
  blockedAdmin: { relation: null, read: false, moderate: false, manage: false, own: false },
  removedAdmin: { relation: null, read: false, moderate: false, manage: false, own: false },
  outsider: { relation: null, read: false, moderate: false, manage: false, own: false },
};

const outcome = async (check: () => Promise<unknown>) => {
  try {
    await check();
    return "ok";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

for (const canRun of [true, false]) {
  test(`one lens, ${canRun ? "a community that runs" : "a community that can't run"}: every person's relation and powers, and every check agrees`, async () => {
    const f = await fixture(canRun);
    for (const person of PEOPLE) {
      const userId = f.people[person];
      const expected = canRun
        ? EXPECTED[person]
        : { relation: null, read: false, moderate: false, manage: false, own: false };
      const { lens, bundle, chat, manager, moderator } = await f.t.run(async (ctx) => {
        const { community, membership } = await getCommunityAndMembership({ ctx, communityId: f.communityId, userId });
        const args = { ctx, communityId: f.communityId, userId };
        return {
          lens: await resolveCommunityLens({ ctx, community, membership, userId }),
          bundle: await resolveCommunityAccessBundle({ ctx, community, membership, userId }),
          chat: await outcome(() => requireCommunityChatAccess(args)),
          manager: await outcome(() => requireCommunityManager(args)),
          moderator: await outcome(() => requireCommunityModerator(args)),
        };
      });
      const label = `${person} (${canRun ? "runs" : "stopped"})`;
      expect(lens.relation, label).toBe(expected.relation);
      expect([lens.can.readChat, lens.can.postChat, lens.can.enter], label).toEqual([expected.read, expected.read, expected.read]);
      expect([lens.can.moderateContent, lens.can.reviewJoinRequests], label).toEqual([expected.moderate, expected.moderate]);
      expect([lens.can.manageMembers, lens.can.manageResources, lens.can.managePricing], label).toEqual([expected.manage, expected.manage, expected.manage]);
      expect([lens.can.manageBranding, lens.can.managePublishing, lens.can.managePayouts], label).toEqual([expected.own, expected.own, expected.own]);
      // Studio's bundle says the same, and its effective role is what they are now.
      expect(bundle.effective_role, label).toBe(expected.relation);
      expect([bundle.can_read_chat, bundle.can_moderate_content, bundle.can_manage_members, bundle.can_manage_payouts], label)
        .toEqual([expected.read, expected.moderate, expected.manage, expected.own]);
      // The checks refuse in a fixed order: can't run, then blocked, then not in, then not allowed.
      const refusal = !canRun ? "community_temporarily_unavailable" : person === "blockedAdmin" ? "community_user_blocked" : null;
      expect(chat, label).toBe(refusal ?? (expected.read ? "ok" : "community_entitlement_required"));
      expect(manager, label).toBe(refusal ?? (expected.manage ? "ok" : "community_forbidden"));
      expect(moderator, label).toBe(refusal ?? (expected.moderate ? "ok" : "community_forbidden"));
    }
  });
}

test("a visibility write is exactly published or unlisted; anything else is refused, never published", () => {
  expect(normalizeVisibility("published")).toBe("published");
  expect(normalizeVisibility(" Unlisted ")).toBe("unlisted");
  for (const value of ["public", "", null, undefined, "PUBLISHED!", 1]) {
    expect(() => normalizeVisibility(value), String(value)).toThrow("community_visibility_invalid");
  }
});
