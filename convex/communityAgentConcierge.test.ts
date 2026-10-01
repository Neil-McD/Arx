import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { CANONICAL_COMMUNITY_AGENT_KEY } from "../shared/communityAgentToolProtocol";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityAgentConcierge.ts",
  "./_generated/**/*.*s",
]);

const nowMs = Date.UTC(2026, 9, 1, 12);

async function fixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const insertUser = (suffix: string) => ctx.db.insert("users", {
      authSubject: `concierge-${suffix}`,
      displayName: suffix,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const ownerId = await insertUser("owner");
    const memberId = await insertUser("member");
    const otherId = await insertUser("other");
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "polynet",
      name: "Polynet",
      visibility: "published",
      entryPolicy: "open",
      inferenceFundingPolicy: "managed_required",
      activeMemberCount: 3,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    for (const userId of [memberId, otherId]) {
      await ctx.db.insert("communityMemberships", {
        communityId,
        userId,
        role: "member",
        accessSource: "free_grant",
        active: true,
        activationSequence: 1,
        activatedAt: nowMs,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }
    await ctx.db.insert("communityAgentServeRequests", {
      communityId,
      agentKey: CANONICAL_COMMUNITY_AGENT_KEY,
      requesterUserId: memberId,
      sponsorUserId: memberId,
      status: "error",
      intakeReason: "accepted",
      errorCode: "platform_home_member_agent_limit_reached",
      errorMessage: "The community inference provider request failed.",
      sourceVisibilityScope: "community",
      responseVisibilityScope: "community",
      createdAt: nowMs - 60_000,
      updatedAt: nowMs - 60_000,
    } as any);
    return { communityId };
  });
}

describe("community agent serve issue", () => {
  test("a mention past the monthly allowance shows the requester the limit and the Builder action", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    try {
      const t = convexTest(schema, modules);
      const f = await fixture(t);
      const issue = await t.withIdentity({ subject: "concierge-member" }).query(
        api.communityAgentConcierge.getMyLatestCommunityAgentServeIssue,
        { communityId: f.communityId },
      );
      expect(issue).toMatchObject({
        community_id: String(f.communityId),
        reason: "member_agent_limit_reached",
        cta: "start_builder",
      });
      expect(issue?.message).toContain("25 free agent messages");
      expect(issue?.message).toContain("November 1");
    } finally {
      vi.useRealTimers();
    }
  });

  test("another member never sees someone else's allowance issue", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    try {
      const t = convexTest(schema, modules);
      const f = await fixture(t);
      await expect(t.withIdentity({ subject: "concierge-other" }).query(
        api.communityAgentConcierge.getMyLatestCommunityAgentServeIssue,
        { communityId: f.communityId },
      )).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
