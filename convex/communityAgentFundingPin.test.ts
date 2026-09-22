/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./communityAgentRuntime.ts", "./_generated/**/*.*s"]);
const internalRefs = internal as any;

test("a steward run pins its exact-surface canary model before provider work", async () => {
  const t = convexTest(schema, modules);
  const fixture = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "steward-model-owner",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const insertCommunity = async (suffix: string) => await ctx.db.insert("communities", {
      ownerId,
      slug: `steward-model-${suffix}`,
      name: `Steward model ${suffix}`,
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    return { ownerId, targetId: await insertCommunity("target"), otherId: await insertCommunity("other") };
  });
  const priorCommunity = process.env.POLYNET_LUNA6_CANARY_COMMUNITY_ID;
  const priorSurface = process.env.POLYNET_LUNA6_CANARY_SURFACE;
  try {
    process.env.POLYNET_LUNA6_CANARY_COMMUNITY_ID = String(fixture.targetId);
    process.env.POLYNET_LUNA6_CANARY_SURFACE = "community_autonomous_cognition";
    const targetRun = await t.mutation(internalRefs.communityAgentRuntime.createCommunityAgentRunInternal, {
      communityId: fixture.targetId,
      sponsorUserId: fixture.ownerId,
      triggerType: "heartbeat",
      role: "steward",
      heartbeatId: "steward-model-target",
      nowMs: 2_000,
    });
    expect(targetRun).toMatchObject({ created: true, run: { model_id: "gpt-6-luna" } });

    process.env.POLYNET_LUNA6_CANARY_SURFACE = "community_workflow_action";
    const otherRun = await t.mutation(internalRefs.communityAgentRuntime.createCommunityAgentRunInternal, {
      communityId: fixture.otherId,
      sponsorUserId: fixture.ownerId,
      triggerType: "heartbeat",
      role: "steward",
      heartbeatId: "steward-model-other",
      nowMs: 2_001,
    });
    expect(otherRun).toMatchObject({ created: true, run: { model_id: "gpt-5.6-luna" } });
    const pinned = await t.run(async (ctx) => await ctx.db.get(targetRun.run.id as any));
    expect((pinned as any)?.modelId).toBe("gpt-6-luna");
  } finally {
    if (priorCommunity === undefined) delete process.env.POLYNET_LUNA6_CANARY_COMMUNITY_ID;
    else process.env.POLYNET_LUNA6_CANARY_COMMUNITY_ID = priorCommunity;
    if (priorSurface === undefined) delete process.env.POLYNET_LUNA6_CANARY_SURFACE;
    else process.env.POLYNET_LUNA6_CANARY_SURFACE = priorSurface;
  }
});
