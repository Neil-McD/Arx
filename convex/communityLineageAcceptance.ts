import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import {
  buildCommunityInteractionEvidenceRef,
  type CommunityEvidenceSurface,
} from "../shared/communityEvidenceContract";
import { executeRetrievalHarnessTool } from "./runtimeAgentLoop";
import { executeConciergeTool } from "./communityAgentServeWorker";
import { handleMcpPost } from "./httpMcp";
import { processPendingArchiveDocuments } from "./communityArchiveEmbeddingPipeline";

const internalRefs = internal as any;
const ACCEPTANCE_CONFIRMATION = "isolated_lineage_acceptance" as const;
const ACCEPTANCE_QUERY = "lineage alpha";
const ARCHIVE_ONLY_QUERY = "zetaquartz";

type AcceptanceEvidenceToolName = "community_chat_search" | "community_chat_read";

function parseToolOutput(result: {
  status: string;
  outputText: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Record<string, any> {
  if (result.status !== "ok") {
    throw new Error(result.errorMessage ?? result.errorCode ?? "acceptance_tool_failed");
  }
  const parsed = JSON.parse(result.outputText);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("acceptance_tool_output_invalid");
  }
  return parsed as Record<string, any>;
}

function acceptanceJsonResponse(_req: Request, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function executeMcpAcceptanceTool(args: {
  ctx: any;
  fixture: any;
  toolName: AcceptanceEvidenceToolName;
  toolArgs: Record<string, unknown>;
}): Promise<Record<string, any>> {
  const mcpToolName = args.toolName === "community_chat_search"
    ? "polynet_community_chat_search"
    : "polynet_community_chat_read";
  const req = new Request("https://lineage-acceptance.invalid/runtime/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "mcp-protocol-version": "2025-06-18",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${args.fixture.runId}:${mcpToolName}`,
      method: "tools/call",
      params: {
        name: mcpToolName,
        arguments: {
          community_slug: args.fixture.communitySlug,
          ...args.toolArgs,
        },
      },
    }),
  });
  const response = await handleMcpPost({
    ctx: args.ctx,
    req,
    jsonResponse: acceptanceJsonResponse,
    requireAuthenticatedActor: async () => ({
      ok: true,
      actor: {
        userId: args.fixture.authSubject,
        dbUserId: args.fixture.ownerId,
        authSubject: args.fixture.authSubject,
        email: null,
        displayName: "Lineage acceptance owner",
        avatarUrl: null,
      },
    }),
    // The isolated fixture has no external identity-provider JWT. Inject only
    // the post-auth community selector; the canonical evidence action still
    // revalidates membership/ownership against database truth.
    listAccessibleCommunities: async () => [
      {
        community_id: String(args.fixture.communityId),
        communities: {
          slug: args.fixture.communitySlug,
          name: `Lineage acceptance ${args.fixture.runId}`,
        },
      } as any,
    ],
  });
  const payload = (await response.json()) as Record<string, any>;
  const structured = payload?.result?.structuredContent;
  if (!response.ok || !structured || typeof structured !== "object") {
    throw new Error(
      String(
        payload?.result?.structuredContent?.error ??
          payload?.error?.message ??
          "acceptance_mcp_tool_failed",
      ),
    );
  }
  return structured as Record<string, any>;
}

async function executeAcceptanceSurfaceTool(args: {
  ctx: any;
  fixture: any;
  surface: CommunityEvidenceSurface;
  toolName: AcceptanceEvidenceToolName;
  toolArgs: Record<string, unknown>;
}): Promise<Record<string, any>> {
  if (args.surface === "external_mcp") {
    return await executeMcpAcceptanceTool(args);
  }
  if (args.surface === "community_concierge") {
    return parseToolOutput(
      await executeConciergeTool({
        ctx: args.ctx,
        context: {
          request: {
            sponsorUserId: args.fixture.ownerId,
            communityId: args.fixture.communityId,
            attempt: 1,
          },
        },
        requestId: args.fixture.rootId,
        toolName: args.toolName,
        rawArguments: args.toolArgs,
      }),
    );
  }
  return parseToolOutput(
    await executeRetrievalHarnessTool({
      ctx: args.ctx,
      userId: String(args.fixture.ownerId),
      authSubject: args.fixture.authSubject,
      projectId: null,
      runId: `lineage-acceptance:${args.fixture.runId}:member-agent`,
      communityId: String(args.fixture.communityId),
      toolName: args.toolName,
      args: args.toolArgs,
      evidenceSurface: "member_agent_dock",
      workspaceSession: null,
    }),
  );
}

function acceptanceEnvironmentEnabled(): boolean {
  return (
    String(process.env.POLYNET_DEPLOYMENT_KIND ?? "").trim().toLowerCase() === "staging" &&
    String(process.env.POLYNET_LINEAGE_ACCEPTANCE_ENABLED ?? "").trim() === "1"
  );
}

function boundedRunId(raw: unknown): string {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!value) throw new Error("community_lineage_acceptance_run_id_required");
  return value;
}

export const seedCommunityLineageAcceptanceInternal = internalMutation({
  args: {
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    if (!acceptanceEnvironmentEnabled()) {
      throw new Error("community_lineage_acceptance_disabled");
    }
    const runId = boundedRunId(args.runId);
    const nowMs = Date.now();
    const authSubject = `lineage-acceptance:owner:${runId}`;
    const communitySlug = `lineage-acceptance-${runId}`.slice(0, 120);
    const ownerId = await ctx.db.insert("users", {
      authSubject,
      email: `lineage-owner-${runId}@smoke.polynet.ai`,
      normalizedEmail: `lineage-owner-${runId}@smoke.polynet.ai`,
      displayName: "Lineage acceptance owner",
      handle: `lineage-owner-${runId}`.slice(0, 60),
      normalizedHandle: `lineage-owner-${runId}`.slice(0, 60),
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const outsiderId = await ctx.db.insert("users", {
      authSubject: `lineage-acceptance:outsider:${runId}`,
      email: `lineage-outsider-${runId}@smoke.polynet.ai`,
      normalizedEmail: `lineage-outsider-${runId}@smoke.polynet.ai`,
      displayName: "Lineage acceptance outsider",
      handle: `lineage-outsider-${runId}`.slice(0, 60),
      normalizedHandle: `lineage-outsider-${runId}`.slice(0, 60),
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: communitySlug,
      name: `Lineage acceptance ${runId}`,
      oneLiner: "Isolated evidence-lineage acceptance fixture",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });

    const rootId = await ctx.db.insert("communityInteractionRoots", {
      communityId,
      actorType: "human",
      actorUserId: ownerId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      title: "Lineage alpha decision",
      contentSummary: "Lineage alpha direct human evidence",
      replyCount: 2,
      reactionSummary: [],
      idempotencyKey: `lineage-acceptance:root:${runId}`,
      lastReplyAt: nowMs + 2,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const humanReplyId = await ctx.db.insert("communityInteractionReplies", {
      communityId,
      rootId,
      seq: 1,
      actorType: "human",
      actorUserId: ownerId,
      status: "live",
      visibilityScope: "community",
      contentSummary: "Lineage alpha human reply evidence",
      reactionSummary: [],
      idempotencyKey: `lineage-acceptance:human-reply:${runId}`,
      createdAt: nowMs + 1,
      updatedAt: nowMs + 1,
    });
    const agentReplyId = await ctx.db.insert("communityInteractionReplies", {
      communityId,
      rootId,
      seq: 2,
      actorType: "community_agent",
      actorAgentKey: "community_agent",
      targetReplyId: humanReplyId,
      status: "live",
      visibilityScope: "community",
      contentSummary: "Lineage alpha autonomous community agent evidence",
      reactionSummary: [],
      idempotencyKey: `lineage-acceptance:agent-reply:${runId}`,
      createdAt: nowMs + 2,
      updatedAt: nowMs + 2,
    });
    const privateRootId = await ctx.db.insert("communityInteractionRoots", {
      communityId,
      actorType: "human",
      actorUserId: ownerId,
      kind: "discussion",
      status: "live",
      visibilityScope: "private",
      contentSummary: "Lineage alpha private evidence must stay excluded",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: `lineage-acceptance:private-root:${runId}`,
      createdAt: nowMs + 3,
      updatedAt: nowMs + 3,
    });
    const foreignCommunityId = await ctx.db.insert("communities", {
      ownerId,
      slug: `lineage-foreign-${runId}`.slice(0, 120),
      name: `Lineage foreign ${runId}`,
      oneLiner: "Cross-community parent integrity fixture",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const foreignRootId = await ctx.db.insert("communityInteractionRoots", {
      communityId: foreignCommunityId,
      actorType: "human",
      actorUserId: ownerId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      contentSummary: "Foreign community root must never parent local evidence",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: `lineage-acceptance:foreign-root:${runId}`,
      createdAt: nowMs + 4,
      updatedAt: nowMs + 4,
    });
    const crossCommunityReplyId = await ctx.db.insert("communityInteractionReplies", {
      communityId,
      rootId: foreignRootId,
      seq: 1,
      actorType: "human",
      actorUserId: ownerId,
      status: "live",
      visibilityScope: "community",
      contentSummary: "Lineage alpha cross-community parent must fail closed",
      reactionSummary: [],
      idempotencyKey: `lineage-acceptance:cross-community-reply:${runId}`,
      createdAt: nowMs + 5,
      updatedAt: nowMs + 5,
    });
    const archiveOnlyRootId = await ctx.db.insert("communityInteractionRoots", {
      communityId,
      actorType: "human",
      actorUserId: ownerId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      title: "Zetaquartz archive lineage",
      contentSummary: "Zetaquartz lineage archive evidence exists beyond the recent scan",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: `lineage-acceptance:archive-only-root:${runId}`,
      createdAt: nowMs - 60_000,
      updatedAt: nowMs - 60_000,
    });
    for (let index = 0; index < 85; index += 1) {
      await ctx.db.insert("communityInteractionRoots", {
        communityId,
        actorType: "system",
        actorAgentKey: "lineage_acceptance_filler",
        kind: "discussion",
        status: "live",
        visibilityScope: "community",
        contentSummary: `Recent scan filler ${index}`,
        replyCount: 0,
        reactionSummary: [],
        idempotencyKey: `lineage-acceptance:filler:${runId}:${index}`,
        createdAt: nowMs - 30_000 + index,
        updatedAt: nowMs - 30_000 + index,
      });
    }

    for (const item of [
      { rootId, text: "Lineage alpha direct human evidence" },
      { replyId: humanReplyId, text: "Lineage alpha human reply evidence" },
      { replyId: agentReplyId, text: "Lineage alpha autonomous community agent evidence" },
      { rootId: privateRootId, text: "Lineage alpha private evidence must stay excluded" },
      {
        replyId: crossCommunityReplyId,
        text: "Lineage alpha cross-community parent must fail closed",
      },
      {
        rootId: archiveOnlyRootId,
        text: "Zetaquartz lineage archive evidence exists beyond the recent scan",
      },
    ]) {
      await ctx.db.insert("communityInteractionContentBlocks", {
        communityId,
        ...(item.rootId ? { rootId: item.rootId } : {}),
        ...(item.replyId ? { replyId: item.replyId } : {}),
        blockOrder: 0,
        blockType: "markdown_text",
        text: item.text,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }

    return {
      runId,
      authSubject,
      communitySlug,
      ownerId,
      outsiderId,
      communityId,
      rootId,
      humanReplyId,
      agentReplyId,
      privateRootId,
      foreignCommunityId,
      foreignRootId,
      crossCommunityReplyId,
      archiveOnlyRootId,
      refs: {
        root: buildCommunityInteractionEvidenceRef({
          objectType: "root",
          objectId: String(rootId),
        }),
        humanReply: buildCommunityInteractionEvidenceRef({
          objectType: "reply",
          objectId: String(humanReplyId),
        }),
        agentReply: buildCommunityInteractionEvidenceRef({
          objectType: "reply",
          objectId: String(agentReplyId),
        }),
        privateRoot: buildCommunityInteractionEvidenceRef({
          objectType: "root",
          objectId: String(privateRootId),
        }),
        crossCommunityReply: buildCommunityInteractionEvidenceRef({
          objectType: "reply",
          objectId: String(crossCommunityReplyId),
        }),
        archiveOnlyRoot: buildCommunityInteractionEvidenceRef({
          objectType: "root",
          objectId: String(archiveOnlyRootId),
        }),
      },
    };
  },
});

export const hideCommunityLineageAcceptanceRootInternal = internalMutation({
  args: {
    rootId: v.id("communityInteractionRoots"),
  },
  handler: async (ctx, args) => {
    if (!acceptanceEnvironmentEnabled()) {
      throw new Error("community_lineage_acceptance_disabled");
    }
    const nowMs = Date.now();
    await ctx.db.patch(args.rootId, {
      status: "hidden",
      hiddenAt: nowMs,
      updatedAt: nowMs,
    });
    return { ok: true, hiddenAt: nowMs };
  },
});

export const readCommunityLineageAcceptanceStateInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    refs: v.array(v.string()),
    archiveSourceIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const traces = [];
    const links = [];
    for (const ref of args.refs) {
      const trace = await ctx.db
        .query("communitySourceTraces")
        .withIndex("by_community_source", (q) =>
          q.eq("communityId", args.communityId).eq("sourceType", "interaction").eq("sourceId", ref),
        )
        .first();
      traces.push(
        trace
          ? {
              ref,
              id: String(trace._id),
              actorType: trace.actorType,
              actorUserId: trace.actorUserId ? String(trace.actorUserId) : null,
              actorAgentKey: trace.actorAgentKey ?? null,
              sourceVisibility: trace.sourceVisibility,
              compilerState: trace.compilerState ?? null,
            }
          : { ref, id: null },
      );
      const link = await ctx.db
        .query("communityInteractionSourceTraceLinks")
        .withIndex("by_community_sourceId", (q) =>
          q.eq("communityId", args.communityId).eq("sourceTraceSourceId", ref),
        )
        .first();
      links.push(
        link
          ? {
              ref,
              state: link.linkState,
              promotionReason: link.promotionReason,
              actorType: link.actorType,
              actorUserId: link.actorUserId ? String(link.actorUserId) : null,
              actorAgentKey: link.actorAgentKey ?? null,
            }
          : { ref, state: null },
      );
    }
    const archives = [];
    for (const sourceId of args.archiveSourceIds) {
      const row = await ctx.db
        .query("communityArchiveDocuments")
        .withIndex("by_community_source", (q) =>
          q.eq("communityId", args.communityId).eq("sourceType", "interaction").eq("sourceId", sourceId),
        )
        .first();
      archives.push({ sourceId, exists: Boolean(row) });
    }
    const retrievalLogs = await ctx.db
      .query("communityEvidenceRetrievalLogs")
      .withIndex("by_community_createdAt", (q) => q.eq("communityId", args.communityId))
      .order("asc")
      .take(50);
    return {
      traces,
      links,
      archives,
      retrievalLogs: retrievalLogs.map((row) => ({
        surface: row.surface,
        capability: row.capability,
        resultRefs: row.resultRefs,
        hasRawQuery: typeof row.query === "string" && row.query.length > 0,
      })),
    };
  },
});

export const runCommunityLineageAcceptance = action({
  args: {
    runId: v.string(),
    confirmation: v.literal(ACCEPTANCE_CONFIRMATION),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    if (!acceptanceEnvironmentEnabled()) {
      return {
        ok: false,
        code: "community_lineage_acceptance_disabled",
      };
    }
    const fixture: any = await ctx.runMutation(
      internalRefs.communityLineageAcceptance.seedCommunityLineageAcceptanceInternal,
      { runId: args.runId },
    );
    const objects = [
      { objectType: "root", objectId: String(fixture.rootId) },
      { objectType: "reply", objectId: String(fixture.humanReplyId) },
      { objectType: "reply", objectId: String(fixture.agentReplyId) },
      { objectType: "root", objectId: String(fixture.privateRootId) },
      { objectType: "reply", objectId: String(fixture.crossCommunityReplyId) },
      { objectType: "root", objectId: String(fixture.archiveOnlyRootId) },
    ];
    const syncResults = [];
    for (const object of objects) {
      syncResults.push(
        await ctx.runMutation(
          internalRefs.communityInteractionEvidence.syncCommunityInteractionEvidenceInternal,
          {
            communityId: fixture.communityId,
            objectType: object.objectType,
            objectId: object.objectId,
          },
        ),
      );
    }

    const failures: string[] = [];
    if (syncResults.slice(0, 3).some((row: any) => !row.indexed || row.promoted)) {
      failures.push("ordinary_evidence_archive_promotion_boundary_invalid");
    }
    if (syncResults[3]?.indexed || syncResults[4]?.indexed) {
      failures.push("private_or_cross_community_evidence_indexed");
    }

    const expectedRefs = [
      fixture.refs.root,
      fixture.refs.humanReply,
      fixture.refs.agentReply,
    ].sort();
    const refs = [fixture.refs.root, fixture.refs.humanReply, fixture.refs.agentReply];
    const archiveSourceIds = [
      `root:${String(fixture.rootId)}`,
      `reply:${String(fixture.humanReplyId)}`,
      `reply:${String(fixture.agentReplyId)}`,
    ];
    const unpromotedState: any = await ctx.runQuery(
      internalRefs.communityLineageAcceptance.readCommunityLineageAcceptanceStateInternal,
      { communityId: fixture.communityId, refs, archiveSourceIds },
    );
    if (unpromotedState.traces.some((row: any) => row.id)) {
      failures.push("ordinary_evidence_automatically_promoted");
    }
    if (unpromotedState.links.some((row: any) => row.state)) {
      failures.push("ordinary_evidence_link_created_without_promotion");
    }

    let wrongTypeDenied = false;
    try {
      await ctx.runAction(
        internalRefs.communityInteractionEvidence.readCommunityInteractionEvidenceForToolInternal,
        {
          userId: fixture.ownerId,
          communityId: fixture.communityId,
          ref: `interaction:root:${String(fixture.humanReplyId)}`,
          surface: "member_agent_dock",
        },
      );
    } catch {
      wrongTypeDenied = true;
    }
    if (!wrongTypeDenied) failures.push("wrong_table_reference_not_denied");

    let crossCommunityParentDenied = false;
    try {
      await ctx.runAction(
        internalRefs.communityInteractionEvidence.readCommunityInteractionEvidenceForToolInternal,
        {
          userId: fixture.ownerId,
          communityId: fixture.communityId,
          ref: fixture.refs.crossCommunityReply,
          surface: "member_agent_dock",
        },
      );
    } catch {
      crossCommunityParentDenied = true;
    }
    if (!crossCommunityParentDenied) failures.push("cross_community_parent_not_denied");

    const recentContext = await ctx.runQuery(
      internalRefs.communityRecentContext.readCommunityRecentContextInternal,
      {
        userId: fixture.ownerId,
        communityId: fixture.communityId,
        query: "Foreign community root",
      },
    );
    const recentContextRefs = Array.isArray(recentContext?.recent_context)
      ? recentContext.recent_context.map((row: any) => String(row?.source_id ?? ""))
      : [];
    const foreignRootRef = buildCommunityInteractionEvidenceRef({
      objectType: "root",
      objectId: String(fixture.foreignRootId),
    });
    const recentContextForeignParentDenied =
      !recentContextRefs.includes(foreignRootRef) &&
      !recentContextRefs.includes(fixture.refs.crossCommunityReply);
    if (!recentContextForeignParentDenied) {
      failures.push("recent_context_cross_community_parent_not_denied");
    }

    await ctx.runMutation(
      internalRefs.communityInteractionEvidence.promoteCommunityInteractionEvidenceInternal,
      {
        communityId: fixture.communityId,
        ref: fixture.refs.root,
        promotionReason: "high_signal",
      },
    );
    await ctx.runMutation(
      internalRefs.communityInteractionEvidence.promoteCommunityInteractionEvidenceInternal,
      {
        communityId: fixture.communityId,
        ref: fixture.refs.agentReply,
        promotionReason: "agent_signal",
      },
    );

    const embedding = await processPendingArchiveDocuments({
      ctx,
      communityId: fixture.communityId,
    });
    if (embedding.error || embedding.succeeded < 4) {
      failures.push(`archive_embedding_unavailable:${embedding.error ?? embedding.succeeded}`);
    }

    const surfaces: CommunityEvidenceSurface[] = [
      "member_agent_dock",
      "community_concierge",
      "external_mcp",
    ];
    const surfaceResults = [];
    for (const surface of surfaces) {
      try {
        const search = await executeAcceptanceSurfaceTool({
          ctx,
          fixture,
          surface,
          toolName: "community_chat_search",
          toolArgs: { query: ACCEPTANCE_QUERY, limit: 3 },
        });
        const results = Array.isArray(search?.results) ? search.results : [];
        const returnedRefs = results
          .map((row: any) => String(row?.ref ?? ""))
          .filter(Boolean)
          .sort();
        if (JSON.stringify(returnedRefs) !== JSON.stringify(expectedRefs)) {
          failures.push(`${surface}:search_refs_mismatch`);
        }
        if (results.some((row: any) => row.ref === fixture.refs.privateRoot)) {
          failures.push(`${surface}:private_evidence_leaked`);
        }
        const human = results.find((row: any) => row.ref === fixture.refs.root);
        const agent = results.find((row: any) => row.ref === fixture.refs.agentReply);
        if (
          human?.lineage?.attribution_mode !== "direct" ||
          human?.lineage?.credit?.type !== "user" ||
          human?.lineage?.episode?.ref !== fixture.refs.root ||
          human?.lineage?.profile_projection !== "source_only"
        ) {
          failures.push(`${surface}:human_lineage_invalid`);
        }
        if (
          agent?.lineage?.attribution_mode !== "autonomous" ||
          agent?.lineage?.credit?.type !== "agent" ||
          agent?.lineage?.relation?.ref !== fixture.refs.humanReply
        ) {
          failures.push(`${surface}:agent_lineage_invalid`);
        }
        const read = await executeAcceptanceSurfaceTool({
          ctx,
          fixture,
          surface,
          toolName: "community_chat_read",
          toolArgs: { ref: fixture.refs.root },
        });
        if (read?.evidence?.lineage?.evidence?.ref !== fixture.refs.root) {
          failures.push(`${surface}:read_lineage_invalid`);
        }
        surfaceResults.push({
          surface,
          refs: returnedRefs,
          searchRetrievalId: search.retrieval_id,
          readRetrievalId: read.retrieval_id,
        });
      } catch (error) {
        failures.push(
          `${surface}:adapter_failed:${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const outsiderResult = await executeRetrievalHarnessTool({
      ctx,
      userId: String(fixture.outsiderId),
      projectId: null,
      runId: `lineage-acceptance:${fixture.runId}:outsider`,
      communityId: String(fixture.communityId),
      toolName: "community_chat_search",
      args: { query: ACCEPTANCE_QUERY, limit: 3 },
      evidenceSurface: "member_agent_dock",
      workspaceSession: null,
    });
    const outsiderDenied = outsiderResult.status !== "ok";
    if (!outsiderDenied) failures.push("outsider_access_not_denied");

    let archiveOnlyResult: Record<string, any> | null = null;
    try {
      archiveOnlyResult = await executeAcceptanceSurfaceTool({
        ctx,
        fixture,
        surface: "member_agent_dock",
        toolName: "community_chat_search",
        toolArgs: { query: ARCHIVE_ONLY_QUERY, limit: 5 },
      });
      const archiveHit = (archiveOnlyResult.results ?? []).find(
        (row: any) => row.ref === fixture.refs.archiveOnlyRoot,
      );
      if (!archiveHit || archiveHit.retrieval_source !== "archive") {
        failures.push("archive_only_retrieval_not_proven");
      }
      if (archiveOnlyResult?.diagnostics?.archive_available !== true) {
        failures.push("archive_vector_path_not_available");
      }
    } catch (error) {
      failures.push(
        `archive_only_adapter_failed:${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const beforeRedaction: any = await ctx.runQuery(
      internalRefs.communityLineageAcceptance.readCommunityLineageAcceptanceStateInternal,
      {
        communityId: fixture.communityId,
        refs,
        archiveSourceIds: [
          ...archiveSourceIds,
          `reply:${String(fixture.crossCommunityReplyId)}`,
          `root:${String(fixture.archiveOnlyRootId)}`,
        ],
      },
    );
    if (beforeRedaction.retrievalLogs.length !== surfaces.length * 2 + 1) {
      failures.push("retrieval_audit_count_invalid");
    }
    if (beforeRedaction.retrievalLogs.some((row: any) => row.hasRawQuery)) {
      failures.push("retrieval_audit_copied_raw_query");
    }
    const rootTrace = beforeRedaction.traces.find((row: any) => row.ref === fixture.refs.root);
    const humanReplyTrace = beforeRedaction.traces.find(
      (row: any) => row.ref === fixture.refs.humanReply,
    );
    const agentTrace = beforeRedaction.traces.find((row: any) => row.ref === fixture.refs.agentReply);
    if (
      rootTrace?.actorType !== "member" ||
      rootTrace?.actorUserId !== String(fixture.ownerId) ||
      rootTrace?.compilerState !== "pending"
    ) {
      failures.push("human_source_trace_attribution_invalid");
    }
    if (humanReplyTrace?.id) failures.push("unpromoted_reply_source_trace_present");
    if (
      agentTrace?.actorType !== "agent" ||
      agentTrace?.actorAgentKey !== "community_agent" ||
      agentTrace?.compilerState !== "excluded_self_authored"
    ) {
      failures.push("agent_source_trace_attribution_invalid");
    }
    const rootLink = beforeRedaction.links.find((row: any) => row.ref === fixture.refs.root);
    const agentLink = beforeRedaction.links.find((row: any) => row.ref === fixture.refs.agentReply);
    if (rootLink?.promotionReason !== "high_signal" || agentLink?.promotionReason !== "agent_signal") {
      failures.push("explicit_promotion_reason_not_preserved");
    }
    const crossArchive = beforeRedaction.archives.find(
      (row: any) => row.sourceId === `reply:${String(fixture.crossCommunityReplyId)}`,
    );
    if (crossArchive?.exists) failures.push("cross_community_archive_present");

    await ctx.runMutation(
      internalRefs.communityLineageAcceptance.hideCommunityLineageAcceptanceRootInternal,
      { rootId: fixture.rootId },
    );
    await ctx.runMutation(
      internalRefs.communityInteractionEvidence.syncCommunityInteractionEvidenceInternal,
      {
        communityId: fixture.communityId,
        objectType: "root",
        objectId: String(fixture.rootId),
      },
    );
    await ctx.runMutation(
      internalRefs.communityInteractionEvidence.redactCommunityInteractionEvidenceChildrenInternal,
      {
        communityId: fixture.communityId,
        rootId: String(fixture.rootId),
      },
    );

    let redactedReadDenied = false;
    try {
      await ctx.runAction(
        internalRefs.communityInteractionEvidence.readCommunityInteractionEvidenceForToolInternal,
        {
          userId: fixture.ownerId,
          communityId: fixture.communityId,
          ref: fixture.refs.agentReply,
          surface: "member_agent_dock",
        },
      );
    } catch {
      redactedReadDenied = true;
    }
    if (!redactedReadDenied) failures.push("redacted_child_read_not_denied");

    let hiddenParentTypeConfusionDenied = false;
    try {
      await ctx.runAction(
        internalRefs.communityInteractionEvidence.readCommunityInteractionEvidenceForToolInternal,
        {
          userId: fixture.ownerId,
          communityId: fixture.communityId,
          ref: `interaction:root:${String(fixture.agentReplyId)}`,
          surface: "member_agent_dock",
        },
      );
    } catch {
      hiddenParentTypeConfusionDenied = true;
    }
    if (!hiddenParentTypeConfusionDenied) {
      failures.push("hidden_parent_type_confusion_not_denied");
    }

    const afterRedaction: any = await ctx.runQuery(
      internalRefs.communityLineageAcceptance.readCommunityLineageAcceptanceStateInternal,
      { communityId: fixture.communityId, refs, archiveSourceIds },
    );
    const redactedTraces = afterRedaction.traces.filter((row: any) => row.id);
    if (
      redactedTraces.length !== 2 ||
      redactedTraces.some(
        (row: any) =>
          row.sourceVisibility !== "redacted" ||
          row.compilerState !== "excluded_by_visibility",
      )
    ) {
      failures.push("trace_redaction_incomplete");
    }
    const existingLinks = afterRedaction.links.filter((row: any) => row.state);
    if (existingLinks.length !== 2 || existingLinks.some((row: any) => row.state !== "removed")) {
      failures.push("lineage_link_redaction_incomplete");
    }
    if (afterRedaction.archives.some((row: any) => row.exists)) {
      failures.push("archive_redaction_incomplete");
    }

    return {
      ok: failures.length === 0,
      code: failures.length === 0
        ? "community_lineage_acceptance_passed"
        : "community_lineage_acceptance_failed",
      failures,
      deploymentKind: process.env.POLYNET_DEPLOYMENT_KIND,
      fixture: {
        runId: fixture.runId,
        communityId: String(fixture.communityId),
        ownerId: String(fixture.ownerId),
        refs: fixture.refs,
      },
      syncResults,
      surfaceResults,
      embedding,
      archiveOnlyResult,
      outsiderDenied,
      wrongTypeDenied,
      crossCommunityParentDenied,
      recentContextForeignParentDenied,
      redactedReadDenied,
      hiddenParentTypeConfusionDenied,
      unpromotedState,
      beforeRedaction,
      afterRedaction,
    };
  },
});
