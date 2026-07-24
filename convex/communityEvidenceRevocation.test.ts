/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import { captureCommunityEvidenceCitationCore } from "./communityEvidenceCitations";
import schema from "./schema";
import { buildCommunitySourceTraceRevision } from "../shared/communitySourceTraceRevision";

const modules = import.meta.glob([
  "./community.ts",
  "./communityInteractions.ts",
  "./communityInteractionEvidence.ts",
  "./communityIntelligenceDirectory.ts",
  "./communityAgentFilesystem.ts",
  "./communityAgentHeartbeat.ts",
  "./_generated/**/*.*s",
]);

const OWNER_SUBJECT = "community-evidence-revocation-owner";
const AUTHOR_SUBJECT = "community-evidence-revocation-author";
const SECRET = "revoked reply must never resurface";
const AGENT_CONTEXT = {
  agentKey: "community_agent",
};

test("canonical interaction revocation contains every derived read before evidence sync", async () => {
  const t = convexTest(schema, modules);
  const now = 1_750_000_000_000;

  const fixture = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: OWNER_SUBJECT,
      displayName: "Evidence revocation owner",
      createdAt: now,
      updatedAt: now,
    });
    const authorId = await ctx.db.insert("users", {
      authSubject: AUTHOR_SUBJECT,
      displayName: "Evidence revocation author",
      createdAt: now,
      updatedAt: now,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "community-evidence-revocation",
      name: "Community evidence revocation",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 2,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: ownerId,
      role: "admin",
      accessSource: "free_grant",
      active: true,
      activationSequence: 1,
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: authorId,
      role: "member",
      accessSource: "free_grant",
      active: true,
      activationSequence: 2,
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const rootId = await ctx.db.insert("communityInteractionRoots", {
      communityId,
      actorType: "human",
      actorUserId: ownerId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      title: "Owner-controlled thread",
      contentSummary: "The root and its ownership must survive.",
      replyCount: 1,
      reactionSummary: [],
      idempotencyKey: "community-evidence-revocation-root",
      lastReplyAt: now + 1,
      createdAt: now,
      updatedAt: now + 1,
    });
    const replyId = await ctx.db.insert("communityInteractionReplies", {
      communityId,
      rootId,
      seq: 1,
      actorType: "human",
      actorUserId: authorId,
      status: "live",
      visibilityScope: "community",
      contentSummary: SECRET,
      reactionSummary: [],
      idempotencyKey: "community-evidence-revocation-reply",
      createdAt: now + 1,
      updatedAt: now + 1,
    });
    const contentBlockId = await ctx.db.insert("communityInteractionContentBlocks", {
      communityId,
      replyId,
      blockOrder: 0,
      blockType: "markdown_text",
      text: SECRET,
      createdAt: now + 1,
      updatedAt: now + 1,
    });
    const sourceRef = `interaction:reply:${replyId}`;
    const sourceTraceId = await ctx.db.insert("communitySourceTraces", {
      communityId,
      sourceType: "interaction",
      sourceId: sourceRef,
      title: "Owner-controlled thread",
      summary: SECRET,
      visibilityScope: "community",
      sourceVisibility: "community",
      artifactIds: [],
      outcomeObservationIds: [],
      actorType: "member",
      actorUserId: authorId,
      compilerGroupKey: `interaction_episode:${rootId}`,
      compilerState: "pending",
      compilerPendingSince: now + 1,
      createdAt: now + 1,
      updatedAt: now + 1,
    });
    const citationId = await captureCommunityEvidenceCitationCore({
      ctx,
      communityId,
      ref: sourceRef,
      sourceTraceId,
      capturedAt: now + 2,
    });
    const nodeId = await ctx.db.insert("communityIntelligenceNodes", {
      communityId,
      type: "insight",
      title: SECRET,
      bodyMd: `Derived memory: ${SECRET}.`,
      status: "promising",
      visibilityScope: "community",
      sourceVisibility: "community",
      confidence: 0.8,
      evidenceStrength: "observed",
      workflowIds: [],
      tags: ["non_compiler_fixture"],
      sourceTraceIds: [sourceTraceId],
      evidenceCitationIds: [citationId],
      evidencePolicyVersion: "citation_v1",
      outcomeObservationIds: [],
      stalenessScore: 0,
      retrievalUsefulnessScore: 0.8,
      outcomeImpactScore: 0,
      createdByActorType: "admin",
      createdByUserId: ownerId,
      lastUpdatedByActorType: "admin",
      lastUpdatedByUserId: ownerId,
      version: 1,
      createdAt: now + 2,
      updatedAt: now + 2,
    });
    const edgeId = await ctx.db.insert("communityIntelligenceEdges", {
      communityId,
      fromNodeId: nodeId,
      toReferenceType: "trace",
      toReferenceId: String(sourceTraceId),
      type: "derived_from",
      confidence: 0.8,
      evidenceTraceIds: [sourceTraceId],
      evidenceCitationIds: [citationId],
      evidencePolicyVersion: "citation_v1",
      visibilityScope: "community",
      createdByActorType: "admin",
      createdByUserId: ownerId,
      createdAt: now + 2,
      updatedAt: now + 2,
    });
    const changeRequestId = await ctx.db.insert("communityIntelligenceChangeRequests", {
      communityId,
      workKey: "community-evidence-revocation-work",
      operation: "update_node",
      status: "pending_decision",
      sourceTraceIds: [sourceTraceId],
      evidenceCitationIds: [citationId],
      evidencePolicyVersion: "citation_v1",
      outcomeObservationIds: [],
      targetNodeIds: [nodeId],
      targetEdgeIds: [edgeId],
      primaryTargetNodeId: nodeId,
      targetNodeSnapshots: [{ nodeId, version: 1, updatedAt: now + 2 }],
      targetEdgeSnapshots: [{ edgeId, updatedAt: now + 2 }],
      requestedPayload: {
        title: SECRET,
        bodyMd: `Requested payload: ${SECRET}.`,
      },
      confidence: 0.8,
      privacyRisk: 0.2,
      createdByActorType: "admin",
      createdByUserId: ownerId,
      createdAt: now + 2,
      updatedAt: now + 2,
    });
    const sourceTrace = await ctx.db.get(sourceTraceId);
    if (!sourceTrace) throw new Error("revocation_fixture_trace_missing");
    const sourceRevision = await buildCommunitySourceTraceRevision(sourceTrace);
    const digestId = await ctx.db.insert("communityCompilerDigests", {
      communityId,
      dedupeKey: "community-evidence-revocation-digest",
      versionKey: "community-evidence-revocation-version",
      agentHandoffState: "pending",
      agentAttemptCount: 0,
      windowStartedAt: now,
      windowEndedAt: now + 2,
      summary: `Digest summary copy: ${SECRET}.`,
      itemCount: 1,
      items: [{
        workKey: "community-evidence-revocation-work",
        category: "source_trace_signal",
        title: SECRET,
        summary: `Digest copy: ${SECRET}.`,
        priority: 0.8,
        confidence: 0.8,
        sourceTypes: ["interaction"],
        sourceIds: [sourceRef],
        sourceTraceIds: [sourceTraceId],
        sourceRevisions: [sourceRevision],
      }],
      signalCounts: {
        chat: 1,
        aiFeed: 0,
        resources: 0,
        events: 0,
        sourceTraces: 1,
        outcomes: 0,
        newMembers: 0,
        activeMembers: 2,
        postingMembers: 1,
        aiFeedReactingMembers: 0,
      },
      createdByActorType: "compiler",
      createdByAgentKey: "community_compiler_digest_v1",
      createdAt: now + 2,
      updatedAt: now + 2,
    });
    return {
      ownerId,
      authorId,
      communityId,
      rootId,
      replyId,
      contentBlockId,
      sourceRef,
      sourceTraceId,
      citationId,
      nodeId,
      edgeId,
      changeRequestId,
      digestId,
    };
  });

  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  const author = t.withIdentity({ subject: AUTHOR_SUBJECT });
  const context = { ...AGENT_CONTEXT, communityId: fixture.communityId };

  const directoryBefore = await owner.query(
    api.community.listCommunityIntelligenceDirectoryView,
    {
      authSubject: OWNER_SUBJECT,
      communityId: fixture.communityId,
      view: "all",
      limit: 10,
    },
  );
  expect(directoryBefore.some((row: any) => row.id === String(fixture.nodeId))).toBe(true);

  const edgesBefore = await owner.query(api.community.listCommunityIntelligenceEdges, {
    authSubject: OWNER_SUBJECT,
    communityId: fixture.communityId,
    limit: 10,
  });
  expect(edgesBefore.some((row: any) => row.id === String(fixture.edgeId))).toBe(true);

  const memoryBefore = await owner.mutation(
    internal.communityIntelligenceDirectory.searchCommunityMemoryInternal,
    {
      authSubject: OWNER_SUBJECT,
      communityId: fixture.communityId,
      surface: "member_agent_dock",
      query: SECRET,
      limit: 5,
    },
  ) as any;
  expect(memoryBefore.nodes.some((row: any) => row.id === String(fixture.nodeId))).toBe(true);

  const digestBefore = await t.query(
    internal.communityAgentFilesystem.readCommunityAgentFilesystemInternal,
    {
      context,
      path: `/compiler/digests/${fixture.digestId}`,
    },
  );
  expect(JSON.stringify(digestBefore)).toContain(SECRET);

  const nodeBefore = await t.query(
    internal.communityAgentFilesystem.readCommunityAgentFilesystemInternal,
    {
      context,
      path: `/directory/nodes/${fixture.nodeId}`,
    },
  );
  expect(JSON.stringify(nodeBefore)).toContain(SECRET);

  const requestBefore = await t.query(
    internal.communityAgentFilesystem.readCommunityAgentFilesystemInternal,
    {
      context,
      path: `/directory/change-requests/${fixture.changeRequestId}`,
    },
  );
  expect(JSON.stringify(requestBefore)).toContain(SECRET);

  await author.mutation(api.community.deleteCommunityInteractionMessage, {
    authSubject: AUTHOR_SUBJECT,
    targetType: "reply",
    targetId: String(fixture.replyId),
  });

  const immediateState = await t.run(async (ctx) => ({
    root: await ctx.db.get(fixture.rootId),
    reply: await ctx.db.get(fixture.replyId),
    block: await ctx.db.get(fixture.contentBlockId),
    trace: await ctx.db.get(fixture.sourceTraceId),
    citation: await ctx.db.get(fixture.citationId),
    node: await ctx.db.get(fixture.nodeId),
    digest: await ctx.db.get(fixture.digestId),
    request: await ctx.db.get(fixture.changeRequestId),
  }));
  expect(immediateState.root?.status).toBe("live");
  expect(immediateState.reply).toMatchObject({ status: "deleted", contentSummary: SECRET });
  expect(immediateState.block?.text).toBe(SECRET);
  expect(immediateState.trace).toMatchObject({
    sourceVisibility: "community",
    summary: SECRET,
  });
  expect(immediateState.citation).not.toBeNull();
  expect(immediateState.node).not.toBeNull();
  expect(immediateState.digest).not.toBeNull();
  expect(immediateState.request).not.toBeNull();

  await expect(
    t.query(internal.communityInteractionEvidence.readCommunityInteractionEvidenceInternal, {
      userId: fixture.ownerId,
      communityId: fixture.communityId,
      ref: fixture.sourceRef,
    }),
  ).rejects.toThrow("community_interaction_evidence_not_readable");

  const directoryAfter = await owner.query(
    api.community.listCommunityIntelligenceDirectoryView,
    {
      authSubject: OWNER_SUBJECT,
      communityId: fixture.communityId,
      view: "all",
      limit: 10,
    },
  );
  expect(directoryAfter).toEqual([]);

  const edgesAfter = await owner.query(api.community.listCommunityIntelligenceEdges, {
    authSubject: OWNER_SUBJECT,
    communityId: fixture.communityId,
    limit: 10,
  });
  expect(edgesAfter).toEqual([]);

  const memoryAfter = await owner.mutation(
    internal.communityIntelligenceDirectory.searchCommunityMemoryInternal,
    {
      authSubject: OWNER_SUBJECT,
      communityId: fixture.communityId,
      surface: "member_agent_dock",
      query: SECRET,
      limit: 5,
    },
  ) as any;
  expect(memoryAfter.nodes).toEqual([]);

  const managerDigests = await owner.query(api.community.listCommunityCompilerDigests, {
    authSubject: OWNER_SUBJECT,
    communityId: fixture.communityId,
    limit: 10,
  });
  expect(managerDigests).toHaveLength(1);
  expect(managerDigests[0]).toMatchObject({
    privacy_redacted_item_count: 1,
    summary: "Some canonical source evidence is no longer readable.",
    items: [{
      title: "Evidence unavailable",
      sourceTypes: [],
      sourceIds: [],
    }],
  });
  expect(JSON.stringify(managerDigests)).not.toContain(SECRET);

  const managerRequests = await owner.query(
    api.community.listCommunityIntelligenceChangeRequests,
    {
      authSubject: OWNER_SUBJECT,
      communityId: fixture.communityId,
      limit: 10,
    },
  );
  expect(managerRequests).toHaveLength(1);
  expect(managerRequests[0]?.requested_payload).toEqual({ privacy_redacted: true });
  expect(JSON.stringify(managerRequests)).not.toContain(SECRET);

  const agentNodes = await t.query(
    internal.communityAgentFilesystem.listCommunityAgentFilesystemInternal,
    { context, path: "/directory/nodes", limit: 10 },
  );
  expect(agentNodes.entries).toEqual([]);
  await expect(
    t.query(internal.communityAgentFilesystem.readCommunityAgentFilesystemInternal, {
      context,
      path: `/directory/nodes/${fixture.nodeId}`,
    }),
  ).rejects.toThrow("community_agent_filesystem_node_evidence_not_readable");

  const agentEdges = await t.query(
    internal.communityAgentFilesystem.listCommunityAgentFilesystemInternal,
    { context, path: "/directory/edges", limit: 10 },
  );
  expect(agentEdges.entries).toEqual([]);
  await expect(
    t.query(internal.communityAgentFilesystem.readCommunityAgentFilesystemInternal, {
      context,
      path: `/directory/edges/${fixture.edgeId}`,
    }),
  ).rejects.toThrow("community_agent_filesystem_edge_evidence_not_readable");

  const agentDigests = await t.query(
    internal.communityAgentFilesystem.listCommunityAgentFilesystemInternal,
    { context, path: "/compiler/digests", limit: 10 },
  );
  expect(agentDigests.entries).toEqual([]);
  await expect(
    t.query(internal.communityAgentFilesystem.readCommunityAgentFilesystemInternal, {
      context,
      path: `/compiler/digests/${fixture.digestId}`,
    }),
  ).rejects.toThrow("community_agent_filesystem_digest_evidence_not_readable");

  const requestAfter = await t.query(
    internal.communityAgentFilesystem.readCommunityAgentFilesystemInternal,
    {
      context,
      path: `/directory/change-requests/${fixture.changeRequestId}`,
    },
  ) as any;
  expect(requestAfter.change_request.requested_payload).toEqual({ privacy_redacted: true });
  expect(JSON.stringify(requestAfter)).not.toContain(SECRET);

  const searchAfter = await t.query(
    internal.communityAgentFilesystem.searchCommunityAgentFilesystemInternal,
    { context, query: SECRET, limit: 10 },
  );
  expect(searchAfter.matches).toEqual([]);

  const claim = await t.mutation(
    internal.communityAgentHeartbeat.claimCommunityCompilerDigestHandoffInternal,
    {
      communityId: fixture.communityId,
      claimId: "community-evidence-revocation-claim",
      nowMs: now + 3,
    },
  );
  expect(claim).toMatchObject({
    claimed: false,
    reason: "no_pending_compiler_handoff",
  });
  expect(await t.run(async (ctx) => await ctx.db.get(fixture.digestId))).toMatchObject({
    agentHandoffState: "handled",
    agentTerminalReason: "superseded",
  });
});
