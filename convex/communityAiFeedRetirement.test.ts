/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import {
  AI_FEED_RETIREMENT_DELETE_ORDER,
  classifyAiFeedRetirementRow,
} from "./communityAiFeedRetirement";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityAiFeedRetirement.ts",
  "./_generated/**/*.*s",
]);

const feedTraceIds = new Set(["trace-feed"]);
const feedCitationIds = new Set(["citation-feed"]);
const feedNodeIds = new Set(["node-feed"]);
const feedEdgeIds = new Set(["edge-feed"]);

function classify(
  category: Parameters<typeof classifyAiFeedRetirementRow>[0]["category"],
  row: Record<string, unknown>,
) {
  return classifyAiFeedRetirementRow({
    category,
    row,
    feedTraceIds,
    feedCitationIds,
    feedNodeIds,
    feedEdgeIds,
  });
}

test("retirement classification is structural and blocks mixed memory", () => {
  expect(AI_FEED_RETIREMENT_DELETE_ORDER).not.toContain("operation_receipts");
  expect(
    classify("intelligence_mutations", {
      sourceTraceIds: [],
      beforeSnapshot: { body: "AI Feed is mentioned as prose." },
    }),
  ).toBe("keep");
  expect(
    classify("intelligence_change_requests", {
      sourceTraceIds: [],
      evidenceCitationIds: [],
      requestedPayload: { note: "AI Feed is mentioned as prose." },
    }),
  ).toBe("keep");

  expect(
    classify("intelligence_nodes", {
      status: "canonical",
      sourceTraceIds: ["trace-feed"],
      evidenceCitationIds: ["citation-feed"],
      outcomeObservationIds: [],
      workflowIds: [],
    }),
  ).toBe("blocked");
  expect(
    classify("intelligence_nodes", {
      sourceTraceIds: ["trace-feed", "trace-chat"],
      evidenceCitationIds: ["citation-feed"],
      outcomeObservationIds: [],
      workflowIds: [],
    }),
  ).toBe("blocked");
  expect(
    classify("intelligence_edges", {
      evidenceTraceIds: ["trace-feed", "trace-chat"],
      evidenceCitationIds: [],
    }),
  ).toBe("blocked");
  expect(
    classify("intelligence_edges", {
      fromNodeId: "node-feed",
      evidenceTraceIds: [],
      evidenceCitationIds: [],
    }),
  ).toBe("blocked");
  expect(
    classify("intelligence_mutations", {
      sourceTraceIds: [],
      targetNodeIds: ["node-feed"],
      targetEdgeIds: [],
    }),
  ).toBe("blocked");

  expect(
    classify("compiler_digests", {
      items: [{ category: "ai_feed_signal", sourceTypes: ["ai_feed"] }],
      signalCounts: { aiFeed: 1, aiFeedReactingMembers: 1 },
    }),
  ).toBe("blocked");
  expect(
    classify("compiler_digests", {
      items: [
        { category: "ai_feed_signal", sourceTypes: ["ai_feed"] },
        { category: "chat_activity", sourceTypes: ["chat"] },
      ],
      signalCounts: { aiFeed: 1, aiFeedReactingMembers: 1 },
    }),
  ).toBe("blocked");
  expect(
    classify("compiler_digests", {
      items: [],
      signalCounts: { aiFeed: 1, chat: 1 },
    }),
  ).toBe("blocked");
  expect(classify("member_settings", { aiFeedLastSeenAt: 123 })).toBe("patch");
  expect(
    classify("retrieval_logs", {
      capability: "community_repository_search",
      resultRefs: ["ai_feed:post", "interaction:root"],
    }),
  ).toBe("patch");
});

test("retirement order preserves derived evidence dependencies", () => {
  expect(
    AI_FEED_RETIREMENT_DELETE_ORDER.indexOf("intelligence_nodes"),
  ).toBeLessThan(AI_FEED_RETIREMENT_DELETE_ORDER.indexOf("evidence_citations"));
  expect(
    AI_FEED_RETIREMENT_DELETE_ORDER.indexOf("evidence_citations"),
  ).toBeLessThan(AI_FEED_RETIREMENT_DELETE_ORDER.indexOf("source_traces"));
  expect(AI_FEED_RETIREMENT_DELETE_ORDER.indexOf("reactions")).toBeLessThan(
    AI_FEED_RETIREMENT_DELETE_ORDER.indexOf("posts"),
  );
});

test("bounded apply is dry-run by input, idempotent, and patches settings", async () => {
  const t = convexTest(schema, modules);
  const now = 1_786_214_400_000;
  const fixture = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "ai-feed-retirement-owner",
      displayName: "Retirement owner",
      handle: "retirement-owner",
      normalizedHandle: "retirement-owner",
      createdAt: now,
      updatedAt: now,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "retirement-community",
      name: "Retirement community",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: now,
      updatedAt: now,
    });
    const foreignCommunityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "retirement-foreign-community",
      name: "Retirement foreign community",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: now,
      updatedAt: now,
    });
    const postId = await ctx.db.insert("communityAiFeedPosts", {
      communityId,
      authorType: "agent",
      authorLabel: "Retired agent",
      type: "observation",
      body: "Retired post",
      status: "live",
      score: 0,
      goodCount: 0,
      lowSignalCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    const settingsId = await ctx.db.insert("communityMemberSettings", {
      communityId,
      userId: ownerId,
      muted: true,
      chatLastSeenAt: now - 1,
      aiFeedLastSeenAt: now,
      resourcesLastSeenAt: now - 2,
      createdAt: now,
      updatedAt: now,
    });
    const retrievalLogId = await ctx.db.insert("communityEvidenceRetrievalLogs", {
      communityId,
      userId: ownerId,
      surface: "external_mcp",
      capability: "community_repository_search",
      resultRefs: ["ai_feed:retired-post", "interaction:retained-root"],
      createdAt: now,
    });
    const receiptId = await ctx.db.insert("polynetCanonicalOperationReceipts", {
      communityId,
      userId: ownerId,
      principalKind: "external_mcp",
      toolName: "polynet_write",
      idempotencyKey: "historical-feed-write",
      requestFingerprint: "feed-request-fingerprint",
      status: "completed",
      result: { path: "/communities/retirement-community/ai-feed/post.md" },
      createdAt: now,
      updatedAt: now,
    });
    return {
      communityId,
      foreignCommunityId,
      postId,
      settingsId,
      retrievalLogId,
      receiptId,
    };
  });

  const dryRun = await t.mutation(
    internal.communityAiFeedRetirement.applyAiFeedRetirementBatchInternal,
    {
      communityId: fixture.communityId,
      category: "posts",
      ids: [String(fixture.postId)],
      dryRun: true,
    },
  );
  expect(dryRun).toMatchObject({ deleted: 0, wouldDelete: 1 });
  await expect(
    t.run((ctx) => ctx.db.get(fixture.postId)),
  ).resolves.toBeTruthy();

  await expect(
    t.mutation(
      internal.communityAiFeedRetirement.applyAiFeedRetirementBatchInternal,
      {
        communityId: fixture.foreignCommunityId,
        category: "posts",
        ids: [String(fixture.postId)],
        dryRun: true,
      },
    ),
  ).rejects.toThrow("ai_feed_retirement_id_community_mismatch");

  const applied = await t.mutation(
    internal.communityAiFeedRetirement.applyAiFeedRetirementBatchInternal,
    {
      communityId: fixture.communityId,
      category: "posts",
      ids: [String(fixture.postId)],
      dryRun: false,
    },
  );
  expect(applied).toMatchObject({ deleted: 1, skipped: 0 });
  await expect(t.run((ctx) => ctx.db.get(fixture.postId))).resolves.toBeNull();
  await expect(t.run((ctx) => ctx.db.get(fixture.receiptId))).resolves.toBeTruthy();

  const retried = await t.mutation(
    internal.communityAiFeedRetirement.applyAiFeedRetirementBatchInternal,
    {
      communityId: fixture.communityId,
      category: "posts",
      ids: [String(fixture.postId)],
      dryRun: false,
    },
  );
  expect(retried).toMatchObject({ deleted: 0, skipped: 1 });

  const patched = await t.mutation(
    internal.communityAiFeedRetirement.applyAiFeedRetirementBatchInternal,
    {
      communityId: fixture.communityId,
      category: "member_settings",
      ids: [String(fixture.settingsId)],
      dryRun: false,
    },
  );
  expect(patched).toMatchObject({ patched: 1, wouldPatch: 1 });
  const settings = await t.run((ctx) => ctx.db.get(fixture.settingsId));
  expect(settings).toMatchObject({
    muted: true,
    chatLastSeenAt: now - 1,
    resourcesLastSeenAt: now - 2,
  });
  expect(settings?.aiFeedLastSeenAt).toBeUndefined();

  const patchedRetrieval = await t.mutation(
    internal.communityAiFeedRetirement.applyAiFeedRetirementBatchInternal,
    {
      communityId: fixture.communityId,
      category: "retrieval_logs",
      ids: [String(fixture.retrievalLogId)],
      dryRun: false,
    },
  );
  expect(patchedRetrieval).toMatchObject({ patched: 1, wouldPatch: 1 });
  await expect(
    t.run((ctx) => ctx.db.get(fixture.retrievalLogId)),
  ).resolves.toMatchObject({ resultRefs: ["interaction:retained-root"] });
  const completedCensus = await t.action(
    internal.communityAiFeedRetirement.inspectAiFeedRetirementInternal,
    { communityId: fixture.communityId },
  );
  expect(completedCensus.retirementComplete).toBe(true);
  await expect(t.run((ctx) => ctx.db.get(fixture.receiptId))).resolves.toBeTruthy();

  await expect(
    t.mutation(
      internal.communityAiFeedRetirement.applyAiFeedRetirementBatchInternal,
      {
        communityId: fixture.communityId,
        category: "posts",
        ids: [String(fixture.settingsId)],
        dryRun: false,
      },
    ),
  ).rejects.toThrow("ai_feed_retirement_id_table_mismatch");

  await expect(
    t.mutation(
      internal.communityAiFeedRetirement.applyAiFeedRetirementBatchInternal,
      {
        communityId: fixture.communityId,
        category: "posts",
        ids: Array.from({ length: 101 }, () => String(fixture.postId)),
        dryRun: true,
      },
    ),
  ).rejects.toThrow("ai_feed_retirement_batch_limit_exceeded");
});

test("operator action defaults to dry-run and enforces order and census version", async () => {
  const t = convexTest(schema, modules);
  const now = 1_786_214_400_000;
  const fixture = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "ai-feed-retirement-action-owner",
      displayName: "Retirement action owner",
      handle: "retirement-action-owner",
      normalizedHandle: "retirement-action-owner",
      createdAt: now,
      updatedAt: now,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "retirement-action-community",
      name: "Retirement action community",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: now,
      updatedAt: now,
    });
    for (const body of ["First retired post", "Second retired post"]) {
      await ctx.db.insert("communityAiFeedPosts", {
        communityId,
        authorType: "agent",
        authorLabel: "Retired agent",
        type: "observation",
        body,
        status: "live",
        score: 0,
        goodCount: 0,
        lowSignalCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.insert("communityMemberSettings", {
      communityId,
      userId: ownerId,
      muted: false,
      aiFeedLastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return { communityId };
  });

  await expect(
    t.action(
      internal.communityAiFeedRetirement.deleteAiFeedRetirementBatchInternal,
      {
        communityId: fixture.communityId,
        category: "posts",
        expectedCensusVersion: "wrong-version",
      },
    ),
  ).rejects.toThrow("ai_feed_retirement_census_version_mismatch");

  await expect(
    t.action(
      internal.communityAiFeedRetirement.deleteAiFeedRetirementBatchInternal,
      {
        communityId: fixture.communityId,
        category: "posts",
        expectedCensusVersion: "ai_feed_retirement_census_v3",
        dryRun: true,
      },
    ),
  ).rejects.toThrow("ai_feed_retirement_order_blocked:member_settings");

  const settingsDryRun = await t.action(
    internal.communityAiFeedRetirement.deleteAiFeedRetirementBatchInternal,
    {
      communityId: fixture.communityId,
      category: "member_settings",
      expectedCensusVersion: "ai_feed_retirement_census_v3",
    },
  );
  expect(settingsDryRun).toMatchObject({
    dryRun: true,
    wouldPatch: 1,
    patched: 0,
  });
  await t.action(
    internal.communityAiFeedRetirement.deleteAiFeedRetirementBatchInternal,
    {
      communityId: fixture.communityId,
      category: "member_settings",
      expectedCensusVersion: "ai_feed_retirement_census_v3",
      dryRun: false,
    },
  );

  const dryRun = await t.action(
    internal.communityAiFeedRetirement.deleteAiFeedRetirementBatchInternal,
    {
      communityId: fixture.communityId,
      category: "posts",
      expectedCensusVersion: "ai_feed_retirement_census_v3",
      limit: 1,
    },
  );
  expect(dryRun).toMatchObject({
    dryRun: true,
    wouldDelete: 1,
    deleted: 0,
    remaining: 2,
    hasMore: true,
  });

  const applied = await t.action(
    internal.communityAiFeedRetirement.deleteAiFeedRetirementBatchInternal,
    {
      communityId: fixture.communityId,
      category: "posts",
      expectedCensusVersion: "ai_feed_retirement_census_v3",
      limit: 1,
      dryRun: false,
    },
  );
  expect(applied).toMatchObject({
    dryRun: false,
    deleted: 1,
    remaining: 1,
    hasMore: true,
  });

});

test("destructive mutation derives lineage and cannot be forged by its caller", async () => {
  const t = convexTest(schema, modules);
  const now = 1_786_214_400_000;
  const fixture = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "ai-feed-retirement-forgery-owner",
      displayName: "Forgery owner",
      handle: "forgery-owner",
      normalizedHandle: "forgery-owner",
      createdAt: now,
      updatedAt: now,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "retirement-forgery-community",
      name: "Retirement forgery community",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: now,
      updatedAt: now,
    });
    const chatTraceId = await ctx.db.insert("communitySourceTraces", {
      communityId,
      sourceType: "chat",
      sourceId: "chat-root",
      summary: "Ordinary chat evidence",
      visibilityScope: "community",
      sourceVisibility: "community",
      artifactIds: [],
      outcomeObservationIds: [],
      actorType: "member",
      actorUserId: ownerId,
      createdAt: now,
      updatedAt: now,
    });
    return { communityId, chatTraceId };
  });

  const result = await t.mutation(
    internal.communityAiFeedRetirement.applyAiFeedRetirementBatchInternal,
    {
      communityId: fixture.communityId,
      category: "source_traces",
      ids: [String(fixture.chatTraceId)],
      dryRun: false,
    },
  );
  expect(result).toMatchObject({ deleted: 0, skipped: 1 });
  await expect(
    t.run((ctx) => ctx.db.get(fixture.chatTraceId)),
  ).resolves.toBeTruthy();

  await expect(
    t.mutation(
      internal.communityAiFeedRetirement.applyAiFeedRetirementBatchInternal,
      {
        communityId: fixture.communityId,
        category: "source_traces",
        ids: [String(fixture.chatTraceId)],
        feedTraceIds: [String(fixture.chatTraceId)],
        dryRun: false,
      } as any,
    ),
  ).rejects.toThrow(/Unexpected field `feedTraceIds`/);
});

test("census fails closed when a retained row has a dangling reference", async () => {
  const t = convexTest(schema, modules);
  const now = 1_786_214_400_000;
  const fixture = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "ai-feed-retirement-dangling-owner",
      displayName: "Dangling owner",
      handle: "dangling-owner",
      normalizedHandle: "dangling-owner",
      createdAt: now,
      updatedAt: now,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "retirement-dangling-community",
      name: "Retirement dangling community",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: now,
      updatedAt: now,
    });
    const traceId = await ctx.db.insert("communitySourceTraces", {
      communityId,
      sourceType: "chat",
      sourceId: "deleted-chat-root",
      summary: "Trace deleted to exercise the closure check",
      visibilityScope: "community",
      sourceVisibility: "community",
      artifactIds: [],
      outcomeObservationIds: [],
      actorType: "member",
      actorUserId: ownerId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("communityEvidenceCitations", {
      communityId,
      sourceKind: "source_trace",
      sourceRef: `source_trace:${String(traceId)}`,
      sourceTraceId: traceId,
      sourceVersion: "v1",
      contentHash: "content-hash",
      provenanceHash: "provenance-hash",
      capturedVisibility: "community",
      capturedAt: now,
    });
    await ctx.db.delete(traceId);
    return { communityId };
  });

  const census = await t.action(
    internal.communityAiFeedRetirement.inspectAiFeedRetirementInternal,
    { communityId: fixture.communityId },
  );
  expect(census.danglingReferences.count).toBe(1);
  expect(census.danglingReferences.sample[0]).toMatchObject({
    category: "evidence_citations",
    field: "sourceTraceId",
  });
  expect(census.batchDeletionReady).toBe(false);
  expect(census.retirementComplete).toBe(false);
});
