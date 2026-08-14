/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import { getCommunityAgentRoleDefinition } from "../shared/communityAgentRoles";
import { buildCommunityAgentStewardPromptBundle } from "../shared/communityAgentStewardPrompt";

const modules = import.meta.glob([
  "./communityAgentRuntime.ts",
  "./_generated/**/*.*s",
]);
const internalRefs = internal as any;

async function sha256HexText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

test("Steward context snapshot is mandatory-shaped, exact, and idempotent", async () => {
  const t = convexTest(schema, modules);
  const fixture = await t.run(async (ctx) => {
    const nowMs = 1_000;
    const userId = await ctx.db.insert("users", {
      authSubject: "steward-snapshot-owner",
      displayName: "Steward Owner",
      handle: "steward-snapshot-owner",
      normalizedHandle: "steward-snapshot-owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId: userId,
      slug: "steward-snapshot",
      name: "Steward Snapshot",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const runId = await ctx.db.insert("communityAgentRuns", {
      communityId,
      agentKey: "community_agent",
      role: "steward",
      triggerType: "heartbeat",
      sponsorUserId: userId,
      modelId: "gpt-5.6-luna",
      status: "running",
      toolStepCount: 0,
      appliedChangeRequestIds: [],
      startedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { communityId, runId };
  });
  const prompt = buildCommunityAgentStewardPromptBundle({
    community: { id: String(fixture.communityId), name: "Steward Snapshot" },
    agentKey: "community_agent",
    triggerType: "heartbeat",
    runId: String(fixture.runId),
    role: getCommunityAgentRoleDefinition("steward"),
  });
  const buildSnapshot = async (messages: typeof prompt.messages) =>
    JSON.stringify({
      version: 1,
      surface: "community_steward",
      schema: "community_steward_context_snapshot_v1",
      sha256: await sha256HexText(JSON.stringify(messages)),
      messages,
      prompt_sections: prompt.systemPromptBundle.sections,
    });
  const snapshotJson = await buildSnapshot(prompt.messages);

  await expect(
    t.mutation(
      internalRefs.communityAgentRuntime
        .recordCommunityAgentStewardContextSnapshotInternal,
      {
        communityId: fixture.communityId,
        runId: fixture.runId,
        snapshotJson: snapshotJson.replace(/[a-f0-9]{64}/, "0".repeat(64)),
        nowMs: 2_000,
      },
    ),
  ).resolves.toMatchObject({
    ok: false,
    errorCode: "community_agent_context_snapshot_invalid",
  });
  await expect(
    t.mutation(
      internalRefs.communityAgentRuntime
        .recordCommunityAgentStewardContextSnapshotInternal,
      {
        communityId: fixture.communityId,
        runId: fixture.runId,
        snapshotJson,
        nowMs: 2_001,
      },
    ),
  ).resolves.toMatchObject({ ok: true, duplicate: false });
  await expect(
    t.mutation(
      internalRefs.communityAgentRuntime
        .recordCommunityAgentStewardContextSnapshotInternal,
      {
        communityId: fixture.communityId,
        runId: fixture.runId,
        snapshotJson,
        nowMs: 2_002,
      },
    ),
  ).resolves.toMatchObject({ ok: true, duplicate: true });

  const changedMessages = prompt.messages.map((message, index) =>
    index === 1
      ? { ...message, content: `${message.content}\nchanged` }
      : message,
  );
  const changedSnapshotJson = await buildSnapshot(changedMessages);
  await expect(
    t.mutation(
      internalRefs.communityAgentRuntime
        .recordCommunityAgentStewardContextSnapshotInternal,
      {
        communityId: fixture.communityId,
        runId: fixture.runId,
        snapshotJson: changedSnapshotJson,
        nowMs: 2_003,
      },
    ),
  ).resolves.toMatchObject({
    ok: false,
    errorCode: "community_agent_context_snapshot_conflict",
  });

  const events = await t.run((ctx) =>
    ctx.db.query("communityAgentRunEvents").collect(),
  );
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    runId: String(fixture.runId),
    seq: 0,
    kind: "context_snapshot",
    status: "captured",
    content: snapshotJson,
  });
});
