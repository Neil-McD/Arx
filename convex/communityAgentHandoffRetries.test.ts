/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import { stewardMaxOutputTokens } from "./communityAgentRuntime";
import { buildCommunitySourceTraceRevision } from "../shared/communitySourceTraceRevision";

const modules = import.meta.glob([
  "./communityAgentHeartbeat.ts",
  "./_generated/**/*.*s",
]);
const internalRefs = internal as any;

async function pendingTrace(ctx: any, communityId: any, summary: string) {
  return await ctx.db.insert("communitySourceTraces", {
    communityId, sourceType: "manual", summary, visibilityScope: "community", sourceVisibility: "community",
    artifactIds: [], outcomeObservationIds: [], actorType: "system",
    compilerState: "pending", compilerPendingSince: 2, createdAt: 2, updatedAt: 2,
  });
}

async function runningDigest(t: ReturnType<typeof convexTest>, retries: number, attempts: number) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { authSubject: "handoff-owner", createdAt: 1, updatedAt: 1 });
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "handoff-retries", name: "Handoff retries", visibility: "unlisted",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", createdAt: 1, updatedAt: 1,
    });
    const digestTraceId = await pendingTrace(ctx, communityId, "In the stuck digest");
    const updatedTraceId = await pendingTrace(ctx, communityId, "Updated after the digest was built");
    const newerTraceId = await pendingTrace(ctx, communityId, "Newer evidence");
    const revisionOf = async (id: any) => await buildCommunitySourceTraceRevision((await ctx.db.get(id)) as any);
    const digestTraceRevision = await revisionOf(digestTraceId);
    const staleRevision = await revisionOf(updatedTraceId);
    await ctx.db.patch(updatedTraceId, { summary: "Materially updated while the last run failed", updatedAt: 3 });
    const digestId = await ctx.db.insert("communityCompilerDigests", {
      communityId, dedupeKey: "handoff-retries", versionKey: "v1",
      agentHandoffState: "running", agentClaimId: "claim-1", agentClaimedAt: 10,
      agentAttemptCount: attempts, agentRetryCount: retries,
      windowStartedAt: 0, windowEndedAt: 5, summary: "Stuck handoff", itemCount: 2,
      items: [
        { category: "source_trace_signal", title: "Stuck item", summary: "Stuck item", priority: 1, confidence: 0.5,
          sourceTypes: ["manual"], sourceIds: ["stuck"], sourceTraceIds: [digestTraceId], sourceRevisions: [digestTraceRevision] },
        { category: "source_trace_signal", title: "Updated item", summary: "Updated item", priority: 1, confidence: 0.5,
          sourceTypes: ["manual"], sourceIds: ["updated"], sourceTraceIds: [updatedTraceId], sourceRevisions: [staleRevision] },
      ],
      signalCounts: { chat: 0, aiFeed: 0, resources: 0, events: 0, sourceTraces: 0, outcomes: 0,
        newMembers: 0, activeMembers: 0, postingMembers: 0, aiFeedReactingMembers: 0 },
      createdByActorType: "compiler", createdAt: 5, updatedAt: 5,
    });
    return { communityId, digestId, digestTraceId, updatedTraceId, newerTraceId };
  });
}

const retry = (t: ReturnType<typeof convexTest>, ids: { communityId: any; digestId: any }) =>
  t.mutation(internalRefs.communityAgentHeartbeat.settleCommunityCompilerDigestHandoffInternal, {
    communityId: ids.communityId, digestId: ids.digestId, versionKey: "v1", claimId: "claim-1",
    outcome: "retry", nowMs: 100,
  });

test("a failed run returns its digest to pending and counts the retry", async () => {
  const t = convexTest(schema, modules);
  // Attempts from before the cap (production had 56) do not count against it.
  const ids = await runningDigest(t, 0, 56);
  await expect(retry(t, ids)).resolves.toMatchObject({ state: "pending" });
  const digest = await t.run((ctx) => ctx.db.get(ids.digestId));
  expect(digest).toMatchObject({ agentHandoffState: "pending", agentRetryCount: 1 });
});

test("the fifth failed run stops retrying the digest", async () => {
  const t = convexTest(schema, modules);
  const ids = await runningDigest(t, 4, 9);
  await expect(retry(t, ids)).resolves.toMatchObject({ state: "handled", terminal_reason: "retries_exhausted" });
  const digest = await t.run((ctx) => ctx.db.get(ids.digestId));
  expect(digest).toMatchObject({ agentHandoffState: "handled", agentTerminalReason: "retries_exhausted", agentRetryCount: 5 });
  // Its evidence leaves the compiler queue so newer evidence is not starved.
  const [quarantined, updated, newer] = await t.run((ctx) => Promise.all([
    ctx.db.get(ids.digestTraceId), ctx.db.get(ids.updatedTraceId), ctx.db.get(ids.newerTraceId),
  ]));
  expect(quarantined).toMatchObject({ compilerState: "agent_retries_exhausted", compilerLastDigestId: ids.digestId });
  // Evidence updated after the digest was built is newer work and stays pending.
  expect(updated).toMatchObject({ compilerState: "pending" });
  expect(newer).toMatchObject({ compilerState: "pending" });
});

test("the steward's output limit grows with the digest it must settle", () => {
  const withItems = (count: number) => ({ latest_digest: { items: Array.from({ length: count }, () => ({})) } });
  expect(stewardMaxOutputTokens(undefined)).toBe(2_450);
  expect(stewardMaxOutputTokens(withItems(22))).toBe(11_900);
  expect(stewardMaxOutputTokens(withItems(96))).toBe(45_200);
  expect(stewardMaxOutputTokens(withItems(500))).toBe(48_000);
});
