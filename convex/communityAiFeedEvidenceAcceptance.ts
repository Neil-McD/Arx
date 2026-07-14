import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { executeRetrievalHarnessTool } from "./runtimeAgentLoop";
import { executeConciergeTool } from "./communityAgentServeWorker";
import { handleMcpPost } from "./httpMcp";
import { processPendingArchiveDocuments } from "./communityArchiveEmbeddingPipeline";
import { upsertArchiveDocumentForAiFeedPost } from "./communityArchiveDocuments";
import { upsertCommunitySourceTrace } from "./communityIntelligenceDirectory";
import {
  buildCommunityAiFeedEvidenceRef,
  type CommunityEvidenceSurface,
} from "../shared/communityEvidenceContract";
import { deriveCommunityCapabilityAuthority } from "../shared/communityCapabilityContract";

const internalRefs = internal as any;
const apiRefs = api as any;
const ACCEPTANCE_CONFIRMATION = "isolated_ai_feed_evidence_acceptance" as const;
const SEARCH_QUERY = "feed alpha";
const ARCHIVE_QUERY = "zetarestorium";

function acceptanceEnabled(): boolean {
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
  if (!value) throw new Error("community_ai_feed_evidence_acceptance_run_id_required");
  return value;
}

function parseToolOutput(result: {
  status: string;
  outputText: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Record<string, any> {
  if (result.status !== "ok") {
    throw new Error(result.errorMessage ?? result.errorCode ?? "ai_feed_acceptance_tool_failed");
  }
  return JSON.parse(result.outputText) as Record<string, any>;
}

function jsonResponse(_req: Request, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function executeMcpAiFeedTool(args: {
  ctx: any;
  fixture: any;
  operation: "search" | "read";
  toolArgs: Record<string, unknown>;
}): Promise<Record<string, any>> {
  const toolName = args.operation === "search"
    ? "polynet_workspace_ai_feed_search"
    : "polynet_workspace_ai_feed_read";
  const req = new Request("https://ai-feed-evidence-acceptance.invalid/runtime/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "mcp-protocol-version": "2025-06-18",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${args.fixture.runId}:${toolName}`,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: {
          workspace_context_id: `community:${args.fixture.communitySlug}`,
          ...args.toolArgs,
        },
      },
    }),
  });
  const response = await handleMcpPost({
    ctx: args.ctx,
    req,
    jsonResponse,
    requireAuthenticatedActor: async () => ({
      ok: true,
      actor: {
        userId: args.fixture.authSubject,
        dbUserId: args.fixture.ownerId,
        authSubject: args.fixture.authSubject,
        email: null,
        displayName: "AI Feed evidence acceptance owner",
        avatarUrl: null,
      },
    }),
    resolveWorkspaceContext: async ({ workspaceContextId }) => {
      if (workspaceContextId !== `community:${args.fixture.communitySlug}`) {
        return { ok: false, message: "Workspace not found or not accessible." };
      }
      const access = {
        community_id: String(args.fixture.communityId),
        relation: "owner" as const,
        is_entitled: true,
        can_view: true,
        can_enter_community: true,
        can_read_chat: true,
        can_post_chat: true,
        can_post_message: true,
        can_manage_resources: true,
        can_moderate_content: true,
        can_manage_members: true,
        can_review_join_requests: true,
        can_manage_pricing: true,
        can_manage_branding: true,
        can_manage_publishing: true,
        can_manage_payouts: true,
      };
      return {
        ok: true,
        context: {
          communityId: String(args.fixture.communityId),
          communitySlug: args.fixture.communitySlug,
          row: {
            community_id: String(args.fixture.communityId),
            role: "owner",
            communities: {
              slug: args.fixture.communitySlug,
              name: `AI Feed evidence ${args.fixture.runId}`,
              visibility: "unlisted",
              entry_policy: "open",
            },
          },
          access,
          authority: deriveCommunityCapabilityAuthority(access),
          workspace: {},
        },
      } as any;
    },
  });
  const payload = (await response.json()) as Record<string, any>;
  const structured = payload?.result?.structuredContent;
  if (!response.ok || !structured || typeof structured !== "object") {
    throw new Error(String(payload?.error?.message ?? "ai_feed_acceptance_mcp_tool_failed"));
  }
  return structured.ai_feed;
}

async function executeSurfaceSearch(args: {
  ctx: any;
  fixture: any;
  surface: CommunityEvidenceSurface;
  query: string;
  limit?: number;
}): Promise<Record<string, any>> {
  if (args.surface === "external_mcp") {
    return await executeMcpAiFeedTool({
      ctx: args.ctx,
      fixture: args.fixture,
      operation: "search",
      toolArgs: { query: args.query, limit: args.limit ?? 10 },
    });
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
        requestId: args.fixture.agentPostId,
        toolName: "community_ai_feed_search",
        rawArguments: { query: args.query, limit: args.limit ?? 10 },
      }),
    );
  }
  return parseToolOutput(
    await executeRetrievalHarnessTool({
      ctx: args.ctx,
      userId: String(args.fixture.ownerId),
      authSubject: args.fixture.authSubject,
      projectId: null,
      runId: `ai-feed-acceptance:${args.fixture.runId}:member-agent`,
      communityId: String(args.fixture.communityId),
      toolName: "community_ai_feed_search",
      args: { query: args.query, limit: args.limit ?? 10 },
      evidenceSurface: "member_agent_dock",
      workspaceSession: null,
    }),
  );
}

async function executeSurfaceRead(args: {
  ctx: any;
  fixture: any;
  surface: CommunityEvidenceSurface;
  ref: string;
}): Promise<Record<string, any>> {
  if (args.surface === "external_mcp") {
    return await executeMcpAiFeedTool({
      ctx: args.ctx,
      fixture: args.fixture,
      operation: "read",
      toolArgs: { ref: args.ref },
    });
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
        requestId: args.fixture.agentPostId,
        toolName: "community_ai_feed_read",
        rawArguments: { ref: args.ref },
      }),
    );
  }
  return parseToolOutput(
    await executeRetrievalHarnessTool({
      ctx: args.ctx,
      userId: String(args.fixture.ownerId),
      authSubject: args.fixture.authSubject,
      projectId: null,
      runId: `ai-feed-acceptance:${args.fixture.runId}:member-agent`,
      communityId: String(args.fixture.communityId),
      toolName: "community_ai_feed_read",
      args: { ref: args.ref },
      evidenceSurface: "member_agent_dock",
      workspaceSession: null,
    }),
  );
}

async function insertPost(args: {
  ctx: any;
  communityId: any;
  ownerId: any;
  title: string;
  body: string;
  nowMs: number;
  status?: "live" | "hidden";
  agentKey?: string;
  score?: number;
}) {
  const id = await args.ctx.db.insert("communityAiFeedPosts", {
    communityId: args.communityId,
    authorType: "agent",
    authorUserId: args.ownerId,
    ...(args.agentKey ? { agentKey: args.agentKey } : null),
    authorLabel: "Community agent",
    type: "observation",
    title: args.title,
    body: args.body,
    evidence: ["Supporting note, not a typed citation"],
    status: args.status ?? "live",
    score: args.score ?? 0,
    goodCount: Math.max(0, args.score ?? 0),
    lowSignalCount: 0,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
    ...(args.status === "hidden" ? { hiddenAt: args.nowMs } : null),
  });
  const post = await args.ctx.db.get(id);
  if (!post) throw new Error("community_ai_feed_acceptance_post_insert_failed");
  await upsertArchiveDocumentForAiFeedPost(args.ctx, post as any);
  await upsertCommunitySourceTrace({
    ctx: args.ctx,
    communityId: args.communityId,
    sourceType: "ai_feed",
    sourceId: String(id),
    title: args.title,
    summary: `${args.title}\n${args.body}`,
    visibilityScope: args.status === "hidden" ? "admin" : "community",
    sourceVisibility: args.status === "hidden" ? "redacted" : "community",
    actorType: "agent",
    actorUserId: args.ownerId,
    actorAgentKey: args.agentKey,
    allowExistingUpdate: true,
    nowMs: args.nowMs,
  });
  return id;
}

export const seedCommunityAiFeedEvidenceAcceptanceInternal = internalMutation({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    if (!acceptanceEnabled()) throw new Error("community_ai_feed_evidence_acceptance_disabled");
    const runId = boundedRunId(args.runId);
    const nowMs = Date.now();
    const authSubject = `ai-feed-evidence:owner:${runId}`;
    const communitySlug = `ai-feed-evidence-${runId}`.slice(0, 120);
    const ownerId = await ctx.db.insert("users", {
      authSubject,
      email: `ai-feed-owner-${runId}@smoke.polynet.ai`,
      normalizedEmail: `ai-feed-owner-${runId}@smoke.polynet.ai`,
      displayName: "AI Feed evidence owner",
      handle: `ai-feed-owner-${runId}`.slice(0, 60),
      normalizedHandle: `ai-feed-owner-${runId}`.slice(0, 60),
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const outsiderId = await ctx.db.insert("users", {
      authSubject: `ai-feed-evidence:outsider:${runId}`,
      email: `ai-feed-outsider-${runId}@smoke.polynet.ai`,
      normalizedEmail: `ai-feed-outsider-${runId}@smoke.polynet.ai`,
      displayName: "AI Feed evidence outsider",
      handle: `ai-feed-outsider-${runId}`.slice(0, 60),
      normalizedHandle: `ai-feed-outsider-${runId}`.slice(0, 60),
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: communitySlug,
      name: `AI Feed evidence ${runId}`,
      oneLiner: "Isolated AI Feed evidence acceptance fixture",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const foreignCommunityId = await ctx.db.insert("communities", {
      ownerId,
      slug: `ai-feed-foreign-${runId}`.slice(0, 120),
      name: `AI Feed foreign ${runId}`,
      oneLiner: "Foreign AI Feed fixture",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const agentPostId = await insertPost({
      ctx,
      communityId,
      ownerId,
      title: "Feed alpha attributed signal",
      body: "Feed alpha canonical live evidence from the community steward",
      agentKey: "community_steward",
      score: 3,
      nowMs,
    });
    const missingAgentPostId = await insertPost({
      ctx,
      communityId,
      ownerId,
      title: "Feed alpha unattributed signal",
      body: "Feed alpha canonical live evidence without an agent key",
      score: 1,
      nowMs: nowMs - 1,
    });
    const hiddenPostId = await insertPost({
      ctx,
      communityId,
      ownerId,
      title: "Feed alpha hidden signal",
      body: "Feed alpha hidden evidence must never be readable",
      status: "hidden",
      nowMs: nowMs - 2,
    });
    const foreignPostId = await insertPost({
      ctx,
      communityId: foreignCommunityId,
      ownerId,
      title: "Feed alpha foreign signal",
      body: "Feed alpha foreign evidence must never cross communities",
      agentKey: "foreign_steward",
      nowMs: nowMs - 3,
    });
    const archiveOnlyPostId = await insertPost({
      ctx,
      communityId,
      ownerId,
      title: "Zetarestorium archive signal",
      body: "Zetarestorium AI Feed evidence beyond the recent scan",
      agentKey: "community_steward",
      nowMs: nowMs - 120_000,
    });
    for (let index = 0; index < 85; index += 1) {
      await ctx.db.insert("communityAiFeedPosts", {
        communityId,
        authorType: "agent",
        authorUserId: ownerId,
        authorLabel: "Community agent",
        type: "observation",
        title: `Recent AI Feed filler ${index}`,
        body: `Recent AI Feed filler content ${index}`,
        evidence: [],
        status: "live",
        score: 0,
        goodCount: 0,
        lowSignalCount: 0,
        createdAt: nowMs - 60_000 + index,
        updatedAt: nowMs - 60_000 + index,
      });
    }
    return {
      runId,
      authSubject,
      communitySlug,
      ownerId,
      outsiderId,
      communityId,
      foreignCommunityId,
      agentPostId,
      missingAgentPostId,
      hiddenPostId,
      foreignPostId,
      archiveOnlyPostId,
      refs: {
        agent: buildCommunityAiFeedEvidenceRef(String(agentPostId)),
        missingAgent: buildCommunityAiFeedEvidenceRef(String(missingAgentPostId)),
        hidden: buildCommunityAiFeedEvidenceRef(String(hiddenPostId)),
        foreign: buildCommunityAiFeedEvidenceRef(String(foreignPostId)),
        archiveOnly: buildCommunityAiFeedEvidenceRef(String(archiveOnlyPostId)),
        wrongType: buildCommunityAiFeedEvidenceRef(String(ownerId)),
      },
    };
  },
});

export const readCommunityAiFeedEvidenceAcceptanceStateInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    postIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const archives = [];
    const traces = [];
    for (const sourceId of args.postIds) {
      const archive = await ctx.db
        .query("communityArchiveDocuments")
        .withIndex("by_community_source", (q) =>
          q.eq("communityId", args.communityId).eq("sourceType", "ai_feed").eq("sourceId", sourceId),
        )
        .first();
      const trace = await ctx.db
        .query("communitySourceTraces")
        .withIndex("by_community_source", (q) =>
          q.eq("communityId", args.communityId).eq("sourceType", "ai_feed").eq("sourceId", sourceId),
        )
        .first();
      archives.push({ sourceId, exists: Boolean(archive) });
      traces.push({
        sourceId,
        exists: Boolean(trace),
        sourceVisibility: trace?.sourceVisibility ?? null,
        visibilityScope: trace?.visibilityScope ?? null,
        actorAgentKey: trace?.actorAgentKey ?? null,
      });
    }
    const retrievalLogs = await ctx.db
      .query("communityEvidenceRetrievalLogs")
      .withIndex("by_community_createdAt", (q) => q.eq("communityId", args.communityId))
      .order("asc")
      .take(100);
    return {
      archives,
      traces,
      retrievalLogs: retrievalLogs.map((row) => ({
        surface: row.surface,
        capability: row.capability,
        resultRefs: row.resultRefs,
        hasRawQuery: typeof row.query === "string" && row.query.length > 0,
      })),
    };
  },
});

export const runCommunityAiFeedEvidenceAcceptance = action({
  args: {
    runId: v.string(),
    confirmation: v.literal(ACCEPTANCE_CONFIRMATION),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    if (!acceptanceEnabled()) {
      return { ok: false, code: "community_ai_feed_evidence_acceptance_disabled" };
    }
    const fixture: any = await ctx.runMutation(
      internalRefs.communityAiFeedEvidenceAcceptance.seedCommunityAiFeedEvidenceAcceptanceInternal,
      { runId: args.runId },
    );
    const failures: string[] = [];
    const embedding = await processPendingArchiveDocuments({
      ctx,
      communityId: fixture.communityId,
    });
    if (embedding.error || embedding.succeeded < 3) {
      failures.push(`ai_feed_archive_embedding_unavailable:${embedding.error ?? embedding.succeeded}`);
    }

    const surfaces: CommunityEvidenceSurface[] = [
      "member_agent_dock",
      "community_concierge",
      "external_mcp",
    ];
    const surfaceResults = [];
    for (const surface of surfaces) {
      try {
        const search = await executeSurfaceSearch({
          ctx,
          fixture,
          surface,
          query: SEARCH_QUERY,
          limit: 10,
        });
        const matches = Array.isArray(search.matches) ? search.matches : [];
        const refs = matches.map((row: any) => String(row?.ref ?? "")).filter(Boolean);
        if (!refs.includes(fixture.refs.agent) || !refs.includes(fixture.refs.missingAgent)) {
          failures.push(`${surface}:ai_feed_search_refs_invalid`);
        }
        if (refs.includes(fixture.refs.hidden) || refs.includes(fixture.refs.foreign)) {
          failures.push(`${surface}:hidden_or_foreign_ai_feed_leaked`);
        }
        const attributed = matches.find((row: any) => row?.ref === fixture.refs.agent);
        const unattributed = matches.find((row: any) => row?.ref === fixture.refs.missingAgent);
        if (
          attributed?.lineage?.credit?.agent_key !== "community_steward" ||
          attributed?.lineage?.recorded_by?.user_id !== String(fixture.ownerId) ||
          attributed?.retrieval_score == null ||
          attributed?.signal_score !== 3 ||
          attributed?.reaction_counts?.good !== 3
        ) {
          failures.push(`${surface}:attributed_ai_feed_lineage_or_signal_invalid`);
        }
        if (
          unattributed?.lineage?.actor?.agent_key !== null ||
          unattributed?.lineage?.credit !== null ||
          unattributed?.lineage?.attribution_mode !== "unattributed"
        ) {
          failures.push(`${surface}:missing_agent_key_was_invented`);
        }
        const read = await executeSurfaceRead({
          ctx,
          fixture,
          surface,
          ref: fixture.refs.agent,
        });
        if (
          read?.evidence?.ref !== fixture.refs.agent ||
          !String(read?.evidence?.body ?? "").includes("canonical live evidence")
        ) {
          failures.push(`${surface}:ai_feed_read_invalid`);
        }
        surfaceResults.push({
          surface,
          refs,
          searchRetrievalId: search.retrieval_id,
          readRetrievalId: read.retrieval_id,
        });
      } catch (error) {
        failures.push(`${surface}:adapter_failed:${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const outsider = await executeRetrievalHarnessTool({
      ctx,
      userId: String(fixture.outsiderId),
      projectId: null,
      runId: `ai-feed-acceptance:${fixture.runId}:outsider`,
      communityId: String(fixture.communityId),
      toolName: "community_ai_feed_search",
      args: { query: SEARCH_QUERY, limit: 5 },
      evidenceSurface: "member_agent_dock",
      workspaceSession: null,
    });
    const outsiderDenied = outsider.status !== "ok";
    if (!outsiderDenied) failures.push("ai_feed_outsider_access_not_denied");

    const deniedRefs: Record<string, boolean> = {};
    for (const [name, ref] of Object.entries({
      hidden: fixture.refs.hidden,
      foreign: fixture.refs.foreign,
      wrongType: fixture.refs.wrongType,
    })) {
      try {
        await ctx.runAction(
          internalRefs.communityAiFeedEvidence.readCommunityAiFeedEvidenceForToolInternal,
          {
            userId: fixture.ownerId,
            communityId: fixture.communityId,
            ref,
            surface: "member_agent_dock",
          },
        );
        deniedRefs[name] = false;
        failures.push(`${name}_ai_feed_ref_not_denied`);
      } catch {
        deniedRefs[name] = true;
      }
    }

    let archiveOnlyResult: Record<string, any> | null = null;
    try {
      archiveOnlyResult = await executeSurfaceSearch({
        ctx,
        fixture,
        surface: "member_agent_dock",
        query: ARCHIVE_QUERY,
        limit: 5,
      });
      const hit = (archiveOnlyResult.matches ?? []).find(
        (row: any) => row?.ref === fixture.refs.archiveOnly,
      );
      if (!hit || hit.retrieval_source !== "archive") {
        failures.push("ai_feed_archive_only_retrieval_not_proven");
      }
      if (archiveOnlyResult?.diagnostics?.archive_available !== true) {
        failures.push("ai_feed_archive_vector_path_not_available");
      }
    } catch (error) {
      failures.push(`ai_feed_archive_adapter_failed:${error instanceof Error ? error.message : String(error)}`);
    }

    const compilerInputs: any = await ctx.runQuery(
      apiRefs.communityCompilerInputs.listCommunityCompilerInputs,
      {
        userId: fixture.ownerId,
        authSubject: fixture.authSubject,
        communityId: fixture.communityId,
        sourceTraceLimit: 100,
        aiFeedLimit: 100,
        outcomeLimit: 10,
      },
    );
    const compilerWindow: any = await ctx.runQuery(
      apiRefs.communityCompilerWindow.readCommunityCompilerWindow,
      {
        userId: fixture.ownerId,
        authSubject: fixture.authSubject,
        communityId: fixture.communityId,
        archiveActivityLimit: 200,
        sourceTraceLimit: 200,
        aiFeedLimit: 100,
      },
    );
    for (const postId of [String(fixture.agentPostId), String(fixture.missingAgentPostId)]) {
      const inputRepresentations = [
        ...(compilerInputs.ranked_ai_feed_signals ?? []).filter((row: any) => row.id === postId),
        ...(compilerInputs.recent_source_traces ?? []).filter(
          (row: any) => row.source_type === "ai_feed" && row.source_id === postId,
        ),
      ];
      const windowRepresentations = [
        ...(compilerWindow.ranked_ai_feed_signals ?? []).filter((row: any) => row.id === postId),
        ...(compilerWindow.recent_source_traces ?? []).filter(
          (row: any) => row.source_type === "ai_feed" && row.source_id === postId,
        ),
        ...(compilerWindow.archive_activity ?? []).filter(
          (row: any) => row.source_type === "ai_feed" && row.source_id === postId,
        ),
      ];
      if (inputRepresentations.length !== 1 || windowRepresentations.length !== 1) {
        failures.push(`ai_feed_compiler_projection_not_deduplicated:${postId}`);
      }
    }

    const beforeHide: any = await ctx.runQuery(
      internalRefs.communityAiFeedEvidenceAcceptance.readCommunityAiFeedEvidenceAcceptanceStateInternal,
      {
        communityId: fixture.communityId,
        postIds: [String(fixture.agentPostId), String(fixture.missingAgentPostId)],
      },
    );
    if (beforeHide.retrievalLogs.some((row: any) => row.hasRawQuery)) {
      failures.push("ai_feed_retrieval_audit_copied_raw_query");
    }
    const surfacesLogged = new Set(beforeHide.retrievalLogs.map((row: any) => row.surface));
    const capabilitiesLogged = new Set(beforeHide.retrievalLogs.map((row: any) => row.capability));
    for (const surface of surfaces) {
      if (!surfacesLogged.has(surface)) failures.push(`ai_feed_retrieval_surface_not_audited:${surface}`);
    }
    for (const capability of ["community_ai_feed_search", "community_ai_feed_read"]) {
      if (!capabilitiesLogged.has(capability)) failures.push(`ai_feed_capability_not_audited:${capability}`);
    }
    const attributedTrace = beforeHide.traces.find(
      (row: any) => row.sourceId === String(fixture.agentPostId),
    );
    const unattributedTrace = beforeHide.traces.find(
      (row: any) => row.sourceId === String(fixture.missingAgentPostId),
    );
    if (attributedTrace?.actorAgentKey !== "community_steward") {
      failures.push("ai_feed_source_trace_agent_key_missing");
    }
    if (unattributedTrace?.actorAgentKey !== null) {
      failures.push("ai_feed_source_trace_invented_agent_key");
    }

    await ctx.runMutation(apiRefs.communityAiFeed.hideCommunityAiFeedPost, {
      userId: fixture.ownerId,
      postId: fixture.agentPostId,
    });
    let hiddenReadDenied = false;
    try {
      await ctx.runAction(
        internalRefs.communityAiFeedEvidence.readCommunityAiFeedEvidenceForToolInternal,
        {
          userId: fixture.ownerId,
          communityId: fixture.communityId,
          ref: fixture.refs.agent,
          surface: "member_agent_dock",
        },
      );
    } catch {
      hiddenReadDenied = true;
    }
    if (!hiddenReadDenied) failures.push("hidden_ai_feed_read_not_denied");
    const afterHide: any = await ctx.runQuery(
      internalRefs.communityAiFeedEvidenceAcceptance.readCommunityAiFeedEvidenceAcceptanceStateInternal,
      {
        communityId: fixture.communityId,
        postIds: [String(fixture.agentPostId)],
      },
    );
    if (afterHide.archives[0]?.exists) failures.push("hidden_ai_feed_archive_not_deleted");
    if (
      afterHide.traces[0]?.sourceVisibility !== "redacted" ||
      afterHide.traces[0]?.visibilityScope !== "admin" ||
      afterHide.traces[0]?.actorAgentKey !== "community_steward"
    ) {
      failures.push("hidden_ai_feed_source_trace_redaction_or_lineage_invalid");
    }

    return {
      ok: failures.length === 0,
      code: failures.length === 0
        ? "community_ai_feed_evidence_acceptance_passed"
        : "community_ai_feed_evidence_acceptance_failed",
      failures,
      fixture: {
        runId: fixture.runId,
        communityId: String(fixture.communityId),
        refs: fixture.refs,
      },
      embedding,
      surfaceResults,
      archiveOnlyResult,
      outsiderDenied,
      deniedRefs,
      compilerDiagnostics: {
        inputs: compilerInputs.diagnostics,
        window: compilerWindow.diagnostics,
      },
      hiddenReadDenied,
      beforeHide,
      afterHide,
    };
  },
});
