/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import {
  AGENT_SOUL_MAX_CHARS,
  DEFAULT_COMMUNITY_SOUL_MD,
  DEFAULT_PERSONAL_SOUL_MD,
  cleanAgentSoulText,
  validateAgentSoulWrite,
} from "../shared/agentSoul";
import { applyPersonalMemoryOperations, renderPersonalMemory } from "../shared/personalMemory";
import { buildCommunityAgentServePromptBundle } from "../shared/communityAgentServePrompt";

const modules = import.meta.glob([
  "./memberMemory.ts",
  "./communityAgent.ts",
  "./_generated/**/*.*s",
]);

async function createFixture(t: ReturnType<typeof convexTest>, suffix: string) {
  return await t.run(async (ctx) => {
    const now = 50_000;
    const ownerId = await ctx.db.insert("users", {
      authSubject: `soul-owner-${suffix}`,
      displayName: "Founder",
      handle: `founder-${suffix}`,
      normalizedHandle: `founder-${suffix}`,
      createdAt: now,
      updatedAt: now,
    });
    const memberAId = await ctx.db.insert("users", {
      authSubject: `soul-member-a-${suffix}`,
      displayName: "Alice",
      handle: `alice-${suffix}`,
      normalizedHandle: `alice-${suffix}`,
      createdAt: now,
      updatedAt: now,
    });
    const memberBId = await ctx.db.insert("users", {
      authSubject: `soul-member-b-${suffix}`,
      displayName: "Bob",
      handle: `bob-${suffix}`,
      normalizedHandle: `bob-${suffix}`,
      createdAt: now,
      updatedAt: now,
    });
    const outsiderId = await ctx.db.insert("users", {
      authSubject: `soul-outsider-${suffix}`,
      displayName: "Eve",
      handle: `eve-${suffix}`,
      normalizedHandle: `eve-${suffix}`,
      createdAt: now,
      updatedAt: now,
    });
    const community1Id = await ctx.db.insert("communities", {
      ownerId,
      slug: `soul-comm-1-${suffix}`,
      name: "Community One",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 3,
      createdAt: now,
      updatedAt: now,
    });
    const community2Id = await ctx.db.insert("communities", {
      ownerId,
      slug: `soul-comm-2-${suffix}`,
      name: "Community Two",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 2,
      createdAt: now,
      updatedAt: now,
    });
    for (const [communityId, userId] of [
      [community1Id, memberAId],
      [community1Id, memberBId],
      [community2Id, memberAId],
    ] as const) {
      await ctx.db.insert("communityMemberships", {
        communityId,
        userId,
        role: "member",
        accessSource: "manual_grant",
        state: "active",
        createdAt: now,
        updatedAt: now,
      });
    }
    return {
      ownerId,
      ownerSubject: `soul-owner-${suffix}`,
      memberAId,
      memberASubject: `soul-member-a-${suffix}`,
      memberBId,
      memberBSubject: `soul-member-b-${suffix}`,
      outsiderSubject: `soul-outsider-${suffix}`,
      community1Id,
      community2Id,
    };
  });
}

describe("living Soul & structured Memory across lenses", () => {
  test("sanitizes Soul text, enforces size cap, and renders categorized Memory cleanly", () => {
    expect(cleanAgentSoulText("  Direct\u200B & warm.\r\nBe crisp.  ")).toBe("Direct & warm.\nBe crisp.");
    expect(validateAgentSoulWrite("   ").ok).toBe(false);
    expect(validateAgentSoulWrite("a".repeat(AGENT_SOUL_MAX_CHARS + 1)).ok).toBe(false);

    const applied = applyPersonalMemoryOperations(
      [],
      [
        { action: "add", content: "Building a fitness app.", category: "fact" },
        { action: "add", content: "Keep answers short and direct.", category: "preference" },
        { action: "add", content: "Ship onboarding by Friday.", category: "commitment" },
      ],
      { sourceRef: "run:r1", at: 100 },
    );
    expect("entries" in applied).toBe(true);
    if ("entries" in applied) {
      const rendered = renderPersonalMemory(applied.entries);
      expect(rendered).toContain("## Facts");
      expect(rendered).toContain("- Building a fitness app.");
      expect(rendered).toContain("## Preferences");
      expect(rendered).toContain("- Keep answers short and direct.");
      expect(rendered).toContain("## Commitments");
      expect(rendered).toContain("- Ship onboarding by Friday.");
    }

    const servePrompt = buildCommunityAgentServePromptBundle({
      community: { name: "Builders", slug: "builders" },
      agent: { displayName: "Builders Guide" },
      threadContext: { rendered: "Member: hello" },
      communitySoulMd: "Be crisp and grounded.",
    });
    expect(servePrompt.systemPromptBundle.text).toContain("COMMUNITY_SOUL");
    expect(servePrompt.systemPromptBundle.text).toContain("Be crisp and grounded.");
  });

  test("personal Soul & Memory stay strictly isolated per member and per community, with safe autonomous updates", async () => {
    const t = convexTest(schema, modules);
    const fx = await createFixture(t, "iso");
    const alice = t.withIdentity({ subject: fx.memberASubject });
    const bob = t.withIdentity({ subject: fx.memberBSubject });
    const eve = t.withIdentity({ subject: fx.outsiderSubject });

    // Starter defaults before any writes.
    const initial = await alice.query(api.memberMemory.getMyGuideSoulAndMemory, {
      authSubject: fx.memberASubject,
      communityId: fx.community1Id,
    });
    expect(initial.soul_is_default).toBe(true);
    expect(initial.soul_md).toBe(DEFAULT_PERSONAL_SOUL_MD);
    expect(initial.entries).toEqual([]);

    // Alice saves her own Soul and categorized Memory in Community 1.
    const afterSoul = await alice.mutation(api.memberMemory.saveMyGuideSoul, {
      authSubject: fx.memberASubject,
      communityId: fx.community1Id,
      soulMd: "Coach me directly and push back when I overcomplicate things.",
    });
    expect(afterSoul.soul_is_default).toBe(false);
    expect(afterSoul.soul_updated_by).toBe("member");

    const afterMemory = await alice.mutation(api.memberMemory.saveMyGuideMemory, {
      authSubject: fx.memberASubject,
      communityId: fx.community1Id,
      operation: { action: "add", text: "Launching beta next Tuesday.", category: "commitment" },
    });
    const afterPref = await alice.mutation(api.memberMemory.saveMyGuideMemory, {
      authSubject: fx.memberASubject,
      communityId: fx.community1Id,
      operation: { action: "add", text: "Prefer bullet lists.", category: "preference" },
    });
    expect(afterMemory.entries).toHaveLength(1);
    expect(afterPref.entries).toHaveLength(2);
    expect(afterPref.entries[0]?.category).toBe("commitment");
    expect(afterPref.entries[1]?.category).toBe("preference");

    // Atomic remove preserves entries added concurrently; stale snapshot is rejected.
    await expect(
      alice.mutation(api.memberMemory.saveMyGuideMemory, {
        authSubject: fx.memberASubject,
        communityId: fx.community1Id,
        entries: [{ text: "Stale snapshot", category: "fact" }],
        expectedUpdatedAt: 1,
      }),
    ).rejects.toThrow("memory_stale");
    const afterRemove = await alice.mutation(api.memberMemory.saveMyGuideMemory, {
      authSubject: fx.memberASubject,
      communityId: fx.community1Id,
      operation: { action: "remove", text: "Prefer bullet lists." },
    });
    expect(afterRemove.entries.map((e: any) => e.text)).toEqual(["Launching beta next Tuesday."]);

    // Bob in Community 1 sees NONE of Alice's Soul or Memory.
    const bobView = await bob.query(api.memberMemory.getMyGuideSoulAndMemory, {
      authSubject: fx.memberBSubject,
      communityId: fx.community1Id,
    });
    expect(bobView.soul_is_default).toBe(true);
    expect(bobView.entries).toEqual([]);

    // Alice in Community 2 sees NONE of her Community 1 Soul or Memory.
    const aliceComm2 = await alice.query(api.memberMemory.getMyGuideSoulAndMemory, {
      authSubject: fx.memberASubject,
      communityId: fx.community2Id,
    });
    expect(aliceComm2.soul_is_default).toBe(true);
    expect(aliceComm2.entries).toEqual([]);

    // Outsider Eve is rejected fail-closed.
    await expect(
      eve.query(api.memberMemory.getMyGuideSoulAndMemory, {
        authSubject: fx.outsiderSubject,
        communityId: fx.community1Id,
      }),
    ).rejects.toThrow();

    // Autonomous guide Soul refinement requires a real private run owned by (alice, community1).
    const deniedAuto = await t.mutation(internal.memberMemory.updateMemberSoulInternal, {
      communityId: fx.community1Id,
      userId: fx.memberAId,
      runId: "missing-run",
      operationKey: "op-1",
      soulMd: "Should fail without a valid private run.",
      nowMs: 60_000,
    });
    expect(deniedAuto.ok).toBe(false);

    await t.run(async (ctx) => {
      const threadId = await ctx.db.insert("threads", {
        ownerId: fx.memberAId,
        title: "Private guide thread",
        titleSource: "auto",
        createdAt: 60_000,
        updatedAt: 60_000,
      });
      await ctx.db.insert("runtimeRuns", {
        runId: "run-alice-1",
        ownerId: fx.memberAId,
        threadId,
        lane: "default",
        communityId: fx.community1Id,
        status: "running",
        lastEventSeq: 0,
        startedAt: 60_000,
        createdAt: 60_000,
        updatedAt: 60_000,
      });
    });
    const allowedAuto = await t.mutation(internal.memberMemory.updateMemberSoulInternal, {
      communityId: fx.community1Id,
      userId: fx.memberAId,
      runId: "run-alice-1",
      operationKey: "op-2",
      soulMd: "Keep coaching brisk, high-signal, and focused on weekly shipping milestones.",
      nowMs: 61_000,
    });
    expect(allowedAuto).toMatchObject({ ok: true, changed: true });

    // Retrying same operationKey is idempotent.
    const retriedAuto = await t.mutation(internal.memberMemory.updateMemberSoulInternal, {
      communityId: fx.community1Id,
      userId: fx.memberAId,
      runId: "run-alice-1",
      operationKey: "op-2",
      soulMd: "Ignored duplicate payload.",
      nowMs: 62_000,
    });
    expect(retriedAuto).toMatchObject({ ok: true, changed: false });

    // Alice can reset her Soul back to default anytime.
    const resetView = await alice.mutation(api.memberMemory.saveMyGuideSoul, {
      authSubject: fx.memberASubject,
      communityId: fx.community1Id,
      soulMd: null,
    });
    expect(resetView.soul_is_default).toBe(true);
    expect(resetView.soul_md).toBe(DEFAULT_PERSONAL_SOUL_MD);
  });

  test("Community Soul is manager-only to edit and supports autonomous nightly refinement", async () => {
    const t = convexTest(schema, modules);
    const fx = await createFixture(t, "comm-soul");
    const founder = t.withIdentity({ subject: fx.ownerSubject });
    const alice = t.withIdentity({ subject: fx.memberASubject });

    // Regular member cannot read or edit the founder Community Soul settings view.
    await expect(
      alice.query(api.communityAgent.getCommunityGuideSoulAndMemory, {
        authSubject: fx.memberASubject,
        communityId: fx.community1Id,
      }),
    ).rejects.toThrow();

    const initial = await founder.query(api.communityAgent.getCommunityGuideSoulAndMemory, {
      authSubject: fx.ownerSubject,
      communityId: fx.community1Id,
    });
    expect(initial.soul_is_default).toBe(true);
    expect(initial.soul_md).toBe(DEFAULT_COMMUNITY_SOUL_MD);

    // Nightly review refines Community Soul autonomously.
    const autoRes = await t.mutation(internal.communityAgent.updateCommunitySoulFromReviewInternal, {
      communityId: fx.community1Id,
      soulMd: "Keep answers grounded in members' real builds; encourage concrete demos over theory.",
      nowMs: 70_000,
    });
    expect(autoRes.ok).toBe(true);

    const afterAuto = await founder.query(api.communityAgent.getCommunityGuideSoulAndMemory, {
      authSubject: fx.ownerSubject,
      communityId: fx.community1Id,
    });
    expect(afterAuto.soul_is_default).toBe(false);
    expect(afterAuto.soul_updated_by).toBe("guide");

    // Founder edits and then resets Community Soul cleanly.
    const edited = await founder.mutation(api.communityAgent.saveCommunityGuideSoul, {
      authSubject: fx.ownerSubject,
      communityId: fx.community1Id,
      soulMd: "Warm, punchy, and builder-first.",
    });
    expect(edited.soul_updated_by).toBe("founder");
    expect(edited.soul_md).toBe("Warm, punchy, and builder-first.");

    const reset = await founder.mutation(api.communityAgent.saveCommunityGuideSoul, {
      authSubject: fx.ownerSubject,
      communityId: fx.community1Id,
      soulMd: null,
    });
    expect(reset.soul_is_default).toBe(true);
    expect(reset.soul_md).toBe(DEFAULT_COMMUNITY_SOUL_MD);
  });
});
