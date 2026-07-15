import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { buildCommunityInteractionEvidenceRef } from "../shared/communityEvidenceContract";
import {
  listCommunityIntelligenceDirectoryViewCore,
  searchCommunityMemoryCore,
} from "./communityIntelligenceDirectory";

const internalRefs = internal as any;
const apiRefs = api as any;
const ACCEPTANCE_CONFIRMATION = "isolated_chat_memory_compiler_acceptance" as const;
const RETAINED_TITLE = "Compiler acceptance retained insight";
const ROLLED_BACK_TITLE = "Compiler acceptance must roll back";

function acceptanceEnabled(): boolean {
  return (
    String(process.env.POLYNET_DEPLOYMENT_KIND ?? "").trim().toLowerCase() === "staging" &&
    String(process.env.POLYNET_MEMORY_COMPILER_ACCEPTANCE_ENABLED ?? "").trim() === "1"
  );
}

function boundedRunId(raw: unknown): string {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  if (!value) throw new Error("community_chat_memory_compiler_acceptance_run_id_required");
  return value;
}

async function insertInteractionRoot(args: {
  ctx: any;
  communityId: any;
  ownerId: any;
  runId: string;
  key: string;
  text: string;
  nowMs: number;
}) {
  const rootId = await args.ctx.db.insert("communityInteractionRoots", {
    communityId: args.communityId,
    actorType: "human",
    actorUserId: args.ownerId,
    kind: "discussion",
    status: "live",
    visibilityScope: "community",
    title: args.text,
    contentSummary: args.text,
    replyCount: 0,
    reactionSummary: [],
    idempotencyKey: `chat-memory-compiler-acceptance:${args.runId}:${args.key}`,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const blockId = await args.ctx.db.insert("communityInteractionContentBlocks", {
    communityId: args.communityId,
    rootId,
    blockOrder: 0,
    blockType: "markdown_text",
    text: args.text,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  return {
    rootId,
    blockId,
    ref: buildCommunityInteractionEvidenceRef({
      objectType: "root",
      objectId: String(rootId),
    }),
  };
}

export const seedCommunityChatMemoryCompilerAcceptanceInternal = internalMutation({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    if (!acceptanceEnabled()) throw new Error("community_chat_memory_compiler_acceptance_disabled");
    const runId = boundedRunId(args.runId);
    const nowMs = Date.now();
    const ownerId = await ctx.db.insert("users", {
      authSubject: `chat-memory-compiler-acceptance:owner:${runId}`,
      email: `chat-memory-compiler-owner-${runId}@smoke.polynet.ai`,
      normalizedEmail: `chat-memory-compiler-owner-${runId}@smoke.polynet.ai`,
      displayName: "Chat memory compiler acceptance owner",
      handle: `cmc-owner-${runId}`.slice(0, 60),
      normalizedHandle: `cmc-owner-${runId}`.slice(0, 60),
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const memberId = await ctx.db.insert("users", {
      authSubject: `chat-memory-compiler-acceptance:member:${runId}`,
      email: `chat-memory-compiler-member-${runId}@smoke.polynet.ai`,
      normalizedEmail: `chat-memory-compiler-member-${runId}@smoke.polynet.ai`,
      displayName: "Chat memory compiler acceptance member",
      handle: `cmc-member-${runId}`.slice(0, 60),
      normalizedHandle: `cmc-member-${runId}`.slice(0, 60),
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: `chat-memory-compiler-${runId}`.slice(0, 120),
      name: `Chat memory compiler ${runId}`,
      oneLiner: "Isolated straight-through memory compiler acceptance fixture",
      visibility: "published",
      entryPolicy: "open",
      activeMemberCount: 2,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      accessSource: "free_grant",
      active: true,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const existingNodeId = await ctx.db.insert("communityIntelligenceNodes", {
      communityId,
      type: "insight",
      title: "Existing acceptance insight",
      bodyMd: "Existing durable knowledge that should receive exact supporting evidence.",
      status: "validated",
      visibilityScope: "community",
      sourceVisibility: "community",
      confidence: 0.8,
      evidenceStrength: "none",
      workflowIds: [],
      tags: ["acceptance_fixture"],
      sourceTraceIds: [],
      outcomeObservationIds: [],
      stalenessScore: 0,
      retrievalUsefulnessScore: 0,
      outcomeImpactScore: 0,
      createdByActorType: "system",
      createdByAgentKey: "chat_memory_compiler_acceptance",
      lastUpdatedByActorType: "system",
      lastUpdatedByAgentKey: "chat_memory_compiler_acceptance",
      version: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const retain = await insertInteractionRoot({
      ctx,
      communityId,
      ownerId,
      runId,
      key: "retain",
      text: "Always verify the source revision before retaining community memory.",
      nowMs,
    });
    const carry = await insertInteractionRoot({
      ctx,
      communityId,
      ownerId,
      runId,
      key: "carry",
      text: "This evidence supports the existing acceptance insight.",
      nowMs: nowMs + 1,
    });
    const dismiss = await insertInteractionRoot({
      ctx,
      communityId,
      ownerId,
      runId,
      key: "dismiss",
      text: "A one-off low-signal observation that should be dismissed.",
      nowMs: nowMs + 2,
    });
    return {
      runId,
      ownerId,
      memberId,
      communityId,
      communitySlug: `chat-memory-compiler-${runId}`.slice(0, 120),
      existingNodeId,
      primary: { retain, carry, dismiss },
    };
  },
});

export const seedCommunityChatMemoryCompilerRollbackInternal = internalMutation({
  args: {
    runId: v.string(),
    communityId: v.id("communities"),
    ownerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    if (!acceptanceEnabled()) throw new Error("community_chat_memory_compiler_acceptance_disabled");
    const nowMs = Date.now() + 100;
    const first = await insertInteractionRoot({
      ctx,
      communityId: args.communityId,
      ownerId: args.ownerId,
      runId: boundedRunId(args.runId),
      key: "rollback-first",
      text: "This valid first decision must roll back when the second item is stale.",
      nowMs,
    });
    const stale = await insertInteractionRoot({
      ctx,
      communityId: args.communityId,
      ownerId: args.ownerId,
      runId: boundedRunId(args.runId),
      key: "rollback-stale",
      text: "This source will change after the digest is created.",
      nowMs: nowMs + 1,
    });
    return { first, stale };
  },
});

export const mutateCommunityChatMemoryCompilerRootInternal = internalMutation({
  args: {
    rootId: v.id("communityInteractionRoots"),
    blockId: v.id("communityInteractionContentBlocks"),
    text: v.string(),
    hide: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (!acceptanceEnabled()) throw new Error("community_chat_memory_compiler_acceptance_disabled");
    const nowMs = Date.now() + 1_000;
    await ctx.db.patch(args.rootId, {
      contentSummary: args.text,
      title: args.text,
      ...(args.hide ? { status: "hidden" as const, hiddenAt: nowMs } : {}),
      editedAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.patch(args.blockId, { text: args.text, updatedAt: nowMs });
    return { ok: true, updatedAt: nowMs };
  },
});

export const readCommunityChatMemoryCompilerAcceptanceStateInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    refs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const traces = [];
    for (const ref of args.refs) {
      const row = await ctx.db
        .query("communitySourceTraces")
        .withIndex("by_community_source", (q) =>
          q.eq("communityId", args.communityId).eq("sourceType", "interaction").eq("sourceId", ref),
        )
        .first();
      traces.push({
        ref,
        id: row ? String(row._id) : null,
        compilerState: row?.compilerState ?? null,
        compilerDecision: row?.compilerDecision
          ? {
              workKey: row.compilerDecision.workKey,
              disposition: row.compilerDecision.disposition,
              targetNodeId: row.compilerDecision.targetNodeId
                ? String(row.compilerDecision.targetNodeId)
                : null,
            }
          : null,
        sourceVisibility: row?.sourceVisibility ?? null,
      });
    }
    const [nodes, changeRequests, mutations, citations, retrievalLogs] = await Promise.all([
      ctx.db
        .query("communityIntelligenceNodes")
        .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
        .collect(),
      ctx.db
        .query("communityIntelligenceChangeRequests")
        .withIndex("by_community_createdAt", (q) => q.eq("communityId", args.communityId))
        .collect(),
      ctx.db
        .query("communityIntelligenceMutations")
        .withIndex("by_community_createdAt", (q) => q.eq("communityId", args.communityId))
        .collect(),
      ctx.db
        .query("communityEvidenceCitations")
        .filter((q) => q.eq(q.field("communityId"), args.communityId))
        .collect(),
      ctx.db
        .query("communityIntelligenceRetrievalLogs")
        .withIndex("by_community_createdAt", (q) => q.eq("communityId", args.communityId))
        .collect(),
    ]);
    return {
      traces,
      nodes: nodes.map((row) => ({
        id: String(row._id),
        title: row.title,
        bodyMd: row.bodyMd,
        status: row.status,
        visibilityScope: row.visibilityScope,
        tags: row.tags,
        sourceTraceIds: row.sourceTraceIds.map(String),
      })),
      changeRequests: changeRequests.map((row) => ({
        id: String(row._id),
        workKey: row.workKey ?? null,
        operation: row.operation,
        status: row.status,
        targetNodeIds: row.targetNodeIds.map(String),
      })),
      mutationCount: mutations.length,
      citationCount: citations.length,
      retrievalLogCount: retrievalLogs.length,
    };
  },
});

export const readCommunityChatMemoryCompilerDigestStateInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    digestId: v.id("communityCompilerDigests"),
  },
  handler: async (ctx, args) => {
    const digest = await ctx.db.get(args.digestId);
    if (!digest || String(digest.communityId) !== String(args.communityId)) {
      throw new Error("community_chat_memory_compiler_acceptance_digest_not_found");
    }
    return {
      handoffState: digest.agentHandoffState ?? null,
      terminalReason: digest.agentTerminalReason ?? null,
      claimId: digest.agentClaimId ?? null,
      handledAt: digest.agentHandledAt ?? null,
    };
  },
});

export const listCommunityChatMemoryCompilerMemberDirectoryInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) =>
    await listCommunityIntelligenceDirectoryViewCore({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      view: "all",
      limit: 20,
    }),
});

export const searchCommunityChatMemoryCompilerMemberMemoryInternal = internalMutation({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    query: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!acceptanceEnabled()) throw new Error("community_chat_memory_compiler_acceptance_disabled");
    return await searchCommunityMemoryCore({
      ctx,
      userId: args.userId,
      communityId: args.communityId,
      query: args.query,
      limit: args.limit,
    });
  },
});

export const cleanupCommunityChatMemoryCompilerAcceptanceInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    ownerId: v.id("users"),
    memberId: v.id("users"),
  },
  handler: async (ctx, args) => {
    if (!acceptanceEnabled()) throw new Error("community_chat_memory_compiler_acceptance_disabled");
    const indexedTables: Array<[string, string]> = [
      ["communityIntelligenceRetrievalLogs", "by_community_createdAt"],
      ["communityIntelligenceMutations", "by_community_createdAt"],
      ["communityIntelligenceChangeRequests", "by_community_createdAt"],
      ["communityIntelligenceEdges", "by_community"],
      ["communityIntelligenceNodes", "by_community"],
      ["communityCompilerDigests", "by_community_createdAt"],
      ["communitySourceTraces", "by_community"],
      ["communityArchiveDocuments", "by_community"],
      ["communityInteractionContentBlocks", "by_community_createdAt"],
      ["communityInteractionRoots", "by_community_createdAt"],
      ["communityMemberships", "by_community"],
    ];
    for (const [table, index] of indexedTables) {
      const rows = await ctx.db
        .query(table as any)
        .withIndex(index as any, (q: any) => q.eq("communityId", args.communityId))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
    const citations = await ctx.db
      .query("communityEvidenceCitations")
      .filter((q) => q.eq(q.field("communityId"), args.communityId))
      .collect();
    for (const row of citations) await ctx.db.delete(row._id);
    await ctx.db.delete(args.communityId);
    await ctx.db.delete(args.memberId);
    await ctx.db.delete(args.ownerId);
    return { ok: true };
  },
});

function nullDecisionFields() {
  return {
    nodeType: null,
    title: null,
    bodyMd: null,
    appliesWhen: null,
    doesNotApplyWhen: null,
    confidence: null,
    existingNodeId: null,
  };
}

function itemForRef(digest: any, ref: string): any {
  const matches = (digest?.items ?? []).filter((item: any) => item?.sourceIds?.[0] === ref);
  if (matches.length !== 1) throw new Error(`community_chat_memory_compiler_digest_item_missing:${ref}`);
  return matches[0];
}

async function syncRoot(ctx: any, communityId: any, rootId: any) {
  return await ctx.runMutation(
    internalRefs.communityInteractionEvidence.syncCommunityInteractionEvidenceInternal,
    { communityId, objectType: "root", objectId: String(rootId) },
  );
}

async function writeDecisions(ctx: any, fixture: any, digest: any, decisions: any[]) {
  const claimId = `chat-memory-compiler-acceptance:${fixture.runId}:${digest.id}`;
  return await ctx.runMutation(
    internalRefs.communityAgentFilesystem.writeCommunityAgentFilesystemInternal,
    {
      context: {
        communityId: fixture.communityId,
        agentKey: "community_agent",
        runId: `chat-memory-compiler-acceptance:${fixture.runId}`,
        heartbeatId: claimId,
        compilerDigestId: digest.id,
        compilerDigestVersionKey: digest.version_key,
      },
      operation: "settle_compiler_digest_items",
      payload: { digestId: digest.id, decisions },
    },
  );
}

async function claimDigest(ctx: any, fixture: any, digest: any) {
  const claimId = `chat-memory-compiler-acceptance:${fixture.runId}:${digest.id}`;
  const claim = await ctx.runMutation(
    internalRefs.communityAgentHeartbeat.claimCommunityCompilerDigestHandoffInternal,
    {
      communityId: fixture.communityId,
      claimId,
    },
  );
  if (
    !claim?.claimed ||
    String(claim.digest_id ?? "") !== String(digest.id) ||
    String(claim.version_key ?? "") !== String(digest.version_key)
  ) {
    throw new Error(`community_chat_memory_compiler_canonical_claim_failed:${claim?.reason ?? "unknown"}`);
  }
  return { claimId, claim };
}

async function settleDigestHandoff(
  ctx: any,
  fixture: any,
  digest: any,
  outcome: "handled" | "retry",
) {
  return await ctx.runMutation(
    internalRefs.communityAgentHeartbeat.settleCommunityCompilerDigestHandoffInternal,
    {
      communityId: fixture.communityId,
      digestId: digest.id,
      versionKey: digest.version_key,
      claimId: `chat-memory-compiler-acceptance:${fixture.runId}:${digest.id}`,
      outcome,
    },
  );
}

function nodeIdsFromResult(raw: any): string[] {
  return (raw?.nodes ?? []).map((node: any) => String(node?.id ?? "")).filter(Boolean);
}

export const runCommunityChatMemoryCompilerAcceptance = action({
  args: {
    runId: v.string(),
    confirmation: v.literal(ACCEPTANCE_CONFIRMATION),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    if (!acceptanceEnabled()) {
      return { ok: false, code: "community_chat_memory_compiler_acceptance_disabled" };
    }
    let fixture: any = null;
    const failures: string[] = [];
    try {
      fixture = await ctx.runMutation(
        internalRefs.communityChatMemoryCompilerAcceptance.seedCommunityChatMemoryCompilerAcceptanceInternal,
        { runId: args.runId },
      );
      const primaryRows = Object.values(fixture.primary) as any[];
      const syncResults = [];
      for (const row of primaryRows) {
        syncResults.push(await syncRoot(ctx, fixture.communityId, row.rootId));
      }
      if (syncResults.some((row: any) => !row.indexed || !row.traced || row.promoted)) {
        failures.push("chat_evidence_not_automatically_traced");
      }

      const digest: any = await ctx.runMutation(
        internalRefs.communityCompilerDigest.runCommunityCompilerDigestPassInternal,
        { communityId: fixture.communityId, requireTrigger: false },
      );
      if (
        digest.item_count !== 3 ||
        digest.items.some(
          (item: any) =>
            !item.workKey ||
            item.sourceTraceIds?.length !== 1 ||
            item.sourceRevisions?.length !== 1,
        )
      ) {
        failures.push("digest_is_not_exact_versioned_work");
      }
      const retainItem = itemForRef(digest, fixture.primary.retain.ref);
      const carryItem = itemForRef(digest, fixture.primary.carry.ref);
      const dismissItem = itemForRef(digest, fixture.primary.dismiss.ref);
      const decisions = [
        {
          workKey: retainItem.workKey,
          disposition: "retain",
          nodeType: "insight",
          title: RETAINED_TITLE,
          bodyMd: "Retained from one exact, versioned chat evidence object.",
          appliesWhen: "When compiling community chat into durable memory.",
          doesNotApplyWhen: "When the cited chat evidence is no longer readable.",
          confidence: 0.9,
          existingNodeId: null,
          reason: "The chat contains a reusable operational rule.",
        },
        {
          workKey: carryItem.workKey,
          disposition: "carried_forward",
          ...nullDecisionFields(),
          existingNodeId: String(fixture.existingNodeId),
          reason: "The exact evidence supports an existing insight.",
        },
        {
          workKey: dismissItem.workKey,
          disposition: "dismiss_low_signal",
          ...nullDecisionFields(),
          reason: "The observation is not reusable community memory.",
        },
      ];
      const canonicalClaim = await claimDigest(ctx, fixture, digest);
      const firstWrite: any = await writeDecisions(ctx, fixture, digest, decisions);
      const settled: any = await ctx.runQuery(
        internalRefs.communityAgentFilesystem.inspectCommunityCompilerDigestSettlementInternal,
        {
          communityId: fixture.communityId,
          digestId: digest.id,
          versionKey: digest.version_key,
        },
      );
      if (!settled.complete || settled.item_count !== 3) {
        failures.push("digest_not_durably_settled");
      }
      const stateAfterFirst: any = await ctx.runQuery(
        internalRefs.communityChatMemoryCompilerAcceptance.readCommunityChatMemoryCompilerAcceptanceStateInternal,
        {
          communityId: fixture.communityId,
          refs: primaryRows.map((row) => row.ref),
        },
      );
      const traceByRef = new Map(stateAfterFirst.traces.map((row: any) => [row.ref, row]));
      const retainedTrace: any = traceByRef.get(fixture.primary.retain.ref);
      const carriedTrace: any = traceByRef.get(fixture.primary.carry.ref);
      const dismissedTrace: any = traceByRef.get(fixture.primary.dismiss.ref);
      const retainedNode = stateAfterFirst.nodes.find((row: any) => row.title === RETAINED_TITLE);
      const existingNode = stateAfterFirst.nodes.find(
        (row: any) => row.id === String(fixture.existingNodeId),
      );
      if (
        retainedTrace?.compilerState !== "compiled" ||
        retainedTrace?.compilerDecision?.disposition !== "retain" ||
        retainedTrace?.compilerDecision?.targetNodeId !== retainedNode?.id ||
        retainedNode?.bodyMd !== "Retained from one exact, versioned chat evidence object." ||
        !retainedNode?.tags?.includes("compiler_memory") ||
        !retainedNode?.sourceTraceIds?.includes(retainedTrace?.id)
      ) {
        failures.push("retain_transaction_invalid");
      }
      if (
        carriedTrace?.compilerState !== "carried_forward" ||
        carriedTrace?.compilerDecision?.disposition !== "carried_forward" ||
        carriedTrace?.compilerDecision?.targetNodeId !== String(fixture.existingNodeId) ||
        !existingNode?.sourceTraceIds?.includes(carriedTrace?.id)
      ) {
        failures.push("carry_forward_transaction_invalid");
      }
      if (
        dismissedTrace?.compilerState !== "dismissed_low_signal" ||
        dismissedTrace?.compilerDecision?.disposition !== "dismiss_low_signal"
      ) {
        failures.push("dismiss_transaction_invalid");
      }
      if (
        stateAfterFirst.changeRequests.length !== 2 ||
        stateAfterFirst.changeRequests.some((row: any) => row.status !== "applied") ||
        stateAfterFirst.mutationCount !== 2 ||
        stateAfterFirst.citationCount !== 2
      ) {
        failures.push("autonomous_audit_or_citation_envelope_invalid");
      }

      const secondWrite: any = await writeDecisions(ctx, fixture, digest, decisions);
      const stateAfterSecond: any = await ctx.runQuery(
        internalRefs.communityChatMemoryCompilerAcceptance.readCommunityChatMemoryCompilerAcceptanceStateInternal,
        {
          communityId: fixture.communityId,
          refs: primaryRows.map((row) => row.ref),
        },
      );
      if (
        secondWrite?.result?.decisions?.some((row: any) => row.reused_existing !== true) ||
        stateAfterSecond.nodes.length !== stateAfterFirst.nodes.length ||
        stateAfterSecond.changeRequests.length !== stateAfterFirst.changeRequests.length ||
        stateAfterSecond.mutationCount !== stateAfterFirst.mutationCount ||
        stateAfterSecond.citationCount !== stateAfterFirst.citationCount
      ) {
        failures.push("idempotent_replay_created_duplicate_state");
      }
      const canonicalSettlement: any = await settleDigestHandoff(
        ctx,
        fixture,
        digest,
        "handled",
      );
      const terminalDigestState: any = await ctx.runQuery(
        internalRefs.communityChatMemoryCompilerAcceptance.readCommunityChatMemoryCompilerDigestStateInternal,
        {
          communityId: fixture.communityId,
          digestId: digest.id,
        },
      );
      if (
        canonicalSettlement?.state !== "handled" ||
        terminalDigestState?.handoffState !== "handled" ||
        terminalDigestState?.terminalReason !== "settled" ||
        terminalDigestState?.claimId !== null ||
        typeof terminalDigestState?.handledAt !== "number"
      ) {
        failures.push("canonical_handoff_not_terminally_settled");
      }

      const beforeMemberSearch: any = await ctx.runMutation(
        internalRefs.communityChatMemoryCompilerAcceptance.searchCommunityChatMemoryCompilerMemberMemoryInternal,
        {
          userId: fixture.memberId,
          communityId: fixture.communityId,
          query: "exact versioned chat evidence",
          limit: 8,
        },
      );
      const beforeMemberList: any = await ctx.runQuery(
        internalRefs.communityChatMemoryCompilerAcceptance.listCommunityChatMemoryCompilerMemberDirectoryInternal,
        { userId: fixture.memberId, communityId: fixture.communityId },
      );
      const beforePublic: any = await ctx.runQuery(
        apiRefs.communityIntelligenceDirectory.resolvePublicCommunityMemoryOverviewBySlug,
        { communitySlug: fixture.communitySlug },
      );
      const visibleBeforeRevocation = {
        search: nodeIdsFromResult(beforeMemberSearch).includes(retainedNode?.id),
        directory: beforeMemberList.some((row: any) => row.id === retainedNode?.id),
        publicOverview: Boolean(
          beforePublic?.overview?.graph?.nodes?.some((row: any) => row.node_id === retainedNode?.id),
        ),
      };
      if (
        !visibleBeforeRevocation.search ||
        !visibleBeforeRevocation.directory ||
        !visibleBeforeRevocation.publicOverview
      ) {
        failures.push("retained_memory_not_visible_before_revocation");
      }

      await ctx.runMutation(
        internalRefs.communityChatMemoryCompilerAcceptance.mutateCommunityChatMemoryCompilerRootInternal,
        {
          rootId: fixture.primary.retain.rootId,
          blockId: fixture.primary.retain.blockId,
          text: "Hidden acceptance evidence",
          hide: true,
        },
      );
      await syncRoot(ctx, fixture.communityId, fixture.primary.retain.rootId);
      const afterMemberSearch: any = await ctx.runMutation(
        internalRefs.communityChatMemoryCompilerAcceptance.searchCommunityChatMemoryCompilerMemberMemoryInternal,
        {
          userId: fixture.memberId,
          communityId: fixture.communityId,
          query: "exact versioned chat evidence",
          limit: 8,
        },
      );
      const afterMemberList: any = await ctx.runQuery(
        internalRefs.communityChatMemoryCompilerAcceptance.listCommunityChatMemoryCompilerMemberDirectoryInternal,
        { userId: fixture.memberId, communityId: fixture.communityId },
      );
      const afterPublic: any = await ctx.runQuery(
        apiRefs.communityIntelligenceDirectory.resolvePublicCommunityMemoryOverviewBySlug,
        { communitySlug: fixture.communitySlug },
      );
      const afterMemberRead: any = await ctx.runMutation(
        internalRefs.communityIntelligenceDirectory.readCommunityMemoryInternal,
        {
          userId: fixture.memberId,
          communityId: fixture.communityId,
          nodeId: retainedNode.id,
        },
      );
      if (
        nodeIdsFromResult(afterMemberSearch).includes(retainedNode?.id) ||
        afterMemberList.some((row: any) => row.id === retainedNode?.id) ||
        afterPublic?.overview?.graph?.nodes?.some((row: any) => row.node_id === retainedNode?.id) ||
        afterMemberRead?.ok !== false
      ) {
        failures.push("revoked_evidence_memory_remained_member_readable");
      }

      const rollback: any = await ctx.runMutation(
        internalRefs.communityChatMemoryCompilerAcceptance.seedCommunityChatMemoryCompilerRollbackInternal,
        {
          runId: fixture.runId,
          communityId: fixture.communityId,
          ownerId: fixture.ownerId,
        },
      );
      await syncRoot(ctx, fixture.communityId, rollback.first.rootId);
      await syncRoot(ctx, fixture.communityId, rollback.stale.rootId);
      const rollbackDigest: any = await ctx.runMutation(
        internalRefs.communityCompilerDigest.runCommunityCompilerDigestPassInternal,
        { communityId: fixture.communityId, requireTrigger: false },
      );
      const rollbackFirstItem = itemForRef(rollbackDigest, rollback.first.ref);
      const rollbackStaleItem = itemForRef(rollbackDigest, rollback.stale.ref);
      await claimDigest(ctx, fixture, rollbackDigest);
      await ctx.runMutation(
        internalRefs.communityChatMemoryCompilerAcceptance.mutateCommunityChatMemoryCompilerRootInternal,
        {
          rootId: rollback.stale.rootId,
          blockId: rollback.stale.blockId,
          text: "The source changed after digest creation and invalidates the stale revision.",
        },
      );
      await syncRoot(ctx, fixture.communityId, rollback.stale.rootId);
      let rollbackError = "";
      try {
        await writeDecisions(ctx, fixture, rollbackDigest, [
          {
            workKey: rollbackFirstItem.workKey,
            disposition: "retain",
            nodeType: "warning_failure",
            title: ROLLED_BACK_TITLE,
            bodyMd: "This write must not survive the failed batch.",
            appliesWhen: null,
            doesNotApplyWhen: null,
            confidence: 0.8,
            existingNodeId: null,
            reason: "Valid first item used to prove transaction rollback.",
          },
          {
            workKey: rollbackStaleItem.workKey,
            disposition: "dismiss_low_signal",
            ...nullDecisionFields(),
            reason: "Stale second item must reject the complete batch.",
          },
        ]);
      } catch (error) {
        rollbackError = error instanceof Error ? error.message : String(error);
      }
      let prematureHandledError = "";
      try {
        await settleDigestHandoff(ctx, fixture, rollbackDigest, "handled");
      } catch (error) {
        prematureHandledError = error instanceof Error ? error.message : String(error);
      }
      await settleDigestHandoff(ctx, fixture, rollbackDigest, "retry");
      const rollbackState: any = await ctx.runQuery(
        internalRefs.communityChatMemoryCompilerAcceptance.readCommunityChatMemoryCompilerAcceptanceStateInternal,
        {
          communityId: fixture.communityId,
          refs: [rollback.first.ref, rollback.stale.ref],
        },
      );
      if (
        !rollbackError.includes("community_compiler_digest_item_source_revision_mismatch") ||
        !prematureHandledError.includes("community_compiler_handoff_unsettled") ||
        rollbackState.traces.some(
          (row: any) => row.compilerState !== "pending" || row.compilerDecision !== null,
        ) ||
        rollbackState.nodes.some((row: any) => row.title === ROLLED_BACK_TITLE) ||
        rollbackState.changeRequests.some((row: any) => row.workKey === rollbackFirstItem.workKey)
      ) {
        failures.push("stale_revision_batch_did_not_roll_back_atomically");
      }

      return {
        ok: failures.length === 0,
        code: failures.length === 0
          ? "community_chat_memory_compiler_acceptance_passed"
          : "community_chat_memory_compiler_acceptance_failed",
        failures,
        deploymentKind: process.env.POLYNET_DEPLOYMENT_KIND,
        digestId: digest.id,
        firstWrite,
        idempotentReplay: secondWrite,
        settlement: settled,
        canonicalClaim: canonicalClaim.claim,
        canonicalSettlement,
        terminalDigestState,
        rollbackError,
        prematureHandledError,
        proof: {
          automaticTraceCount: syncResults.filter((row: any) => row.traced).length,
          exactDigestItemCount: digest.item_count,
          terminalStates: stateAfterFirst.traces.map((row: any) => row.compilerState),
          appliedChangeRequestCount: stateAfterFirst.changeRequests.length,
          mutationCount: stateAfterFirst.mutationCount,
          citationCount: stateAfterFirst.citationCount,
          visibleBeforeRevocation,
          canonicalHandoffSettled:
            terminalDigestState?.handoffState === "handled" &&
            terminalDigestState?.terminalReason === "settled",
          revokedFromMemberSearch: !nodeIdsFromResult(afterMemberSearch).includes(retainedNode?.id),
          revokedFromMemberDirectory: !afterMemberList.some((row: any) => row.id === retainedNode?.id),
          revokedFromPublicOverview: !afterPublic?.overview?.graph?.nodes?.some(
            (row: any) => row.node_id === retainedNode?.id,
          ),
          staleBatchRolledBack: rollbackState.nodes.every(
            (row: any) => row.title !== ROLLED_BACK_TITLE,
          ),
        },
      };
    } catch (error) {
      return {
        ok: false,
        code: "community_chat_memory_compiler_acceptance_crashed",
        failures,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (fixture) {
        await ctx.runMutation(
          internalRefs.communityChatMemoryCompilerAcceptance.cleanupCommunityChatMemoryCompilerAcceptanceInternal,
          {
            communityId: fixture.communityId,
            ownerId: fixture.ownerId,
            memberId: fixture.memberId,
          },
        );
      }
    }
  },
});
