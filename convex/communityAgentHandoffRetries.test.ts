/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import { stewardMaxOutputTokens } from "./communityAgentRuntime";

const modules = import.meta.glob([
  "./communityAgentHeartbeat.ts",
  "./_generated/**/*.*s",
]);
const internalRefs = internal as any;

async function runningDigest(t: ReturnType<typeof convexTest>, retries: number, attempts: number) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { authSubject: "handoff-owner", createdAt: 1, updatedAt: 1 });
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "handoff-retries", name: "Handoff retries", visibility: "unlisted",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", createdAt: 1, updatedAt: 1,
    });
    const digestId = await ctx.db.insert("communityCompilerDigests", {
      communityId, dedupeKey: "handoff-retries", versionKey: "v1",
      agentHandoffState: "running", agentClaimId: "claim-1", agentClaimedAt: 10,
      agentAttemptCount: attempts, agentRetryCount: retries,
      windowStartedAt: 0, windowEndedAt: 5, summary: "Stuck handoff", itemCount: 0, items: [],
      signalCounts: { chat: 0, aiFeed: 0, resources: 0, events: 0, sourceTraces: 0, outcomes: 0,
        newMembers: 0, activeMembers: 0, postingMembers: 0, aiFeedReactingMembers: 0 },
      createdByActorType: "compiler", createdAt: 5, updatedAt: 5,
    });
    return { communityId, digestId };
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
});

test("the steward's output limit grows with the digest it must settle", () => {
  const withItems = (count: number) => ({ latest_digest: { items: Array.from({ length: count }, () => ({})) } });
  expect(stewardMaxOutputTokens(undefined)).toBe(2_450);
  expect(stewardMaxOutputTokens(withItems(22))).toBe(11_900);
  expect(stewardMaxOutputTokens(withItems(96))).toBe(45_200);
  expect(stewardMaxOutputTokens(withItems(500))).toBe(48_000);
});
