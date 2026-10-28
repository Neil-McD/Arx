/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import { buildCommunityConversationThreadKey } from "../shared/communityConversationIdentity";
import {
  buildRuntimeProviderContextAttestation,
  type RuntimeProviderContextAttestationV1,
} from "../shared/runtimeProviderContextAttestation";
import {
  buildGlobalMemberAgentEpisodeThreadKey,
} from "../shared/runtimeInvocationSurface";

const modules = import.meta.glob(["./threads.ts", "./_generated/**/*.*s"]);
const internalRefs = internal as any;

async function createFixture(
  surface: RuntimeProviderContextAttestationV1["surface"],
) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const nowMs = 1_000;
    const userId = await ctx.db.insert("users", {
      authSubject: `attestation-${surface}`,
      displayName: "Attestation User",
      handle: `attestation-${surface}`,
      normalizedHandle: `attestation-${surface}`,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId: userId,
      slug: `attestation-${surface}`,
      name: "Attestation Community",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityIdText = String(communityId);
    const threadKey = buildGlobalMemberAgentEpisodeThreadKey(1);
    const threadId = await ctx.db.insert("threads", {
      ownerId: userId,
      threadKey,
      titleSource: "auto",
      communityId: communityIdText,
      modelId: "gpt-test",
      contextVersion: 4,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const runId = `run-${surface}`;
    await ctx.db.insert("runtimeRuns", {
      ownerId: userId,
      threadId,
      runId,
      lane: "platform",
      communityId,
      communityContextVersion: 4,
      modelId: "gpt-test",
      status: "running",
      lastEventSeq: 1,
      startedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("runtimeRunEvents", {
      ownerId: userId,
      threadId,
      runId,
      seq: 1,
      eventType: "runtime_context_resolved",
      eventKey: `${runId}:runtime_context_resolved:1`,
      payload: {
        run_id: runId,
        invocation_surface: surface,
        community_id: communityIdText,
        community_context_version: 4,
      },
      createdAt: nowMs,
    });
    return { userId, communityId, threadId, runId };
  });
  const attestation = await buildRuntimeProviderContextAttestation({
    surface,
    runId: ids.runId,
    userId: String(ids.userId),
    threadId: String(ids.threadId),
    communityId: String(ids.communityId),
    communityContextVersion: 4,
    funnelSlot: null,
    requestedModelId: "gpt-test",
    inferenceSource: "platform",
    modelRef: "openai/gpt-test",
    maxOutputTokens: 1024,
    toolChoice: "auto",
    parallelToolCalls: true,
    messages: [{ role: "system", content: "private" }],
    promptSections: [
      {
        id: "platform_doctrine",
        layer: "stable",
        slot: "instruction",
        owner: "platform",
        authority: "platform_policy",
        rendered: true,
        chars: 7,
        source: "fixture",
        reason: "test",
      },
    ],
    contextManifest: { version: 2 },
    toolSchemaFormat: "responses_api",
    toolNames: ["polynet_list"],
    providerTools: [{ type: "function", name: "polynet_list" }],
  });
  return { t, ids, attestation };
}

test.each(["member_agent_dock"] as const)(
  "%s attestation persists in the existing event table",
  async (surface) => {
    const { t, ids, attestation } = await createFixture(surface);
    await expect(
      t.mutation(
        internalRefs.threads.recordRuntimeProviderContextAttestationInternal,
        {
          ownerId: ids.userId,
          threadId: ids.threadId,
          runId: ids.runId,
          attestation,
          nowMs: 2_000,
        },
      ),
    ).resolves.toMatchObject({ ok: true, duplicate: false });
    const events = await t.run((ctx) =>
      ctx.db
        .query("runtimeRunEvents")
        .withIndex("by_owner_run_seq", (q) =>
          q.eq("ownerId", ids.userId).eq("runId", ids.runId),
        )
        .collect(),
    );
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      eventType: "runtime_provider_context_attested",
      payload: attestation,
    });
    expect(JSON.stringify(events[1].payload)).not.toContain("private");
  },
);

test("community-bound threads retain canonical provider-context receipt validation", async () => {
  const { t, ids, attestation } = await createFixture("member_agent_dock");
  await t.run(async ctx => {
    const thread = await ctx.db.get(ids.threadId);
    await ctx.db.patch(ids.threadId, { threadKey: buildCommunityConversationThreadKey(String(thread!.communityId), 1) });
    const channelId = await ctx.db.insert("memberAgentChannels", { ownerId: ids.userId, communityId: thread!.communityId as any, scopeKey: "community", nextOrdinal: 2, createdAt: 1000, updatedAt: 1000 });
    const episodeId = await ctx.db.insert("memberAgentEpisodes", { channelId, threadId: ids.threadId, ordinal: 1, status: "active", startedAt: 1000, createdAt: 1000, updatedAt: 1000 });
    await ctx.db.patch(channelId, { activeEpisodeId: episodeId });
  });
  await expect(t.mutation(internalRefs.threads.recordRuntimeProviderContextAttestationInternal, { ownerId: ids.userId, threadId: ids.threadId, runId: ids.runId, attestation, nowMs: 2000 })).resolves.toMatchObject({ ok: true, duplicate: false });
});

test("attestation persistence deduplicates exact retries and rejects conflicts", async () => {
  const { t, ids, attestation } = await createFixture("member_agent_dock");
  const args = {
    ownerId: ids.userId,
    threadId: ids.threadId,
    runId: ids.runId,
    attestation,
  };
  await expect(
    t.mutation(
      internalRefs.threads.recordRuntimeProviderContextAttestationInternal,
      args,
    ),
  ).resolves.toMatchObject({ ok: true, duplicate: false });
  await expect(
    t.mutation(
      internalRefs.threads.recordRuntimeProviderContextAttestationInternal,
      args,
    ),
  ).resolves.toMatchObject({ ok: true, duplicate: true });
  await expect(
    t.mutation(
      internalRefs.threads.recordRuntimeProviderContextAttestationInternal,
      {
        ...args,
        attestation: {
          ...attestation,
          provider_request_sha256: "b".repeat(64),
        },
      },
    ),
  ).resolves.toMatchObject({
    ok: false,
    errorCode: "runtime_provider_context_attestation_conflict",
  });
  await expect(
    t.mutation(
      internalRefs.threads.recordRuntimeProviderContextAttestationInternal,
      {
        ...args,
        attestation: {
          ...attestation,
          model: { ...attestation.model, requested_model_id: "wrong-model" },
        },
      },
    ),
  ).resolves.toMatchObject({
    ok: false,
    errorCode: "runtime_provider_context_attestation_scope_conflict",
  });
  const events = await t.run((ctx) =>
    ctx.db.query("runtimeRunEvents").collect(),
  );
  expect(events).toHaveLength(2);
});
