import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { executeRetrievalHarnessTool } from "./runtimeAgentLoop";
import { executeConciergeTool } from "./communityAgentServeWorker";
import { handleMcpPost } from "./httpMcp";
import { processPendingArchiveDocuments } from "./communityArchiveEmbeddingPipeline";
import { upsertArchiveDocumentForResource } from "./communityArchiveDocuments";
import {
  buildCommunityResourceEvidenceRef,
  type CommunityEvidenceSurface,
} from "../shared/communityEvidenceContract";
import { deriveCommunityCapabilityAuthority } from "../shared/communityCapabilityContract";

const internalRefs = internal as any;
const ACCEPTANCE_CONFIRMATION = "isolated_resource_evidence_acceptance" as const;
const SEARCH_QUERY = "resource alpha";
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
  if (!value) throw new Error("community_resource_evidence_acceptance_run_id_required");
  return value;
}

function parseToolOutput(result: {
  status: string;
  outputText: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Record<string, any> {
  if (result.status !== "ok") {
    throw new Error(result.errorMessage ?? result.errorCode ?? "resource_acceptance_tool_failed");
  }
  return JSON.parse(result.outputText) as Record<string, any>;
}

function jsonResponse(_req: Request, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function executeMcpResourceTool(args: {
  ctx: any;
  fixture: any;
  operation: "search" | "read";
  toolArgs: Record<string, unknown>;
}): Promise<Record<string, any>> {
  const toolName = args.operation === "search"
    ? "polynet_workspace_resources_search"
    : "polynet_workspace_resource_read";
  const req = new Request("https://resource-evidence-acceptance.invalid/runtime/mcp", {
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
        displayName: "Resource evidence acceptance owner",
        avatarUrl: null,
      },
    }),
    // The isolated fixture has no external identity-provider JWT. Inject only
    // the already-authenticated workspace selector; canonical resource actions
    // still revalidate owner/member access against database truth.
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
      const row = {
        community_id: String(args.fixture.communityId),
        role: "owner",
        communities: {
          slug: args.fixture.communitySlug,
          name: `Resource evidence ${args.fixture.runId}`,
          visibility: "unlisted",
          entry_policy: "open",
        },
      };
      return {
        ok: true,
        context: {
          communityId: String(args.fixture.communityId),
          communitySlug: args.fixture.communitySlug,
          row,
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
    throw new Error(
      String(payload?.error?.message ?? "resource_acceptance_mcp_tool_failed"),
    );
  }
  return args.operation === "search" ? structured.resources : structured.resource;
}

async function executeSurfaceSearch(args: {
  ctx: any;
  fixture: any;
  surface: CommunityEvidenceSurface;
  query: string;
  limit?: number;
}): Promise<Record<string, any>> {
  if (args.surface === "external_mcp") {
    return await executeMcpResourceTool({
      ctx: args.ctx,
      fixture: args.fixture,
      operation: "search",
      toolArgs: { query: args.query, limit: args.limit ?? 5 },
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
        requestId: args.fixture.visibleResourceId,
        toolName: "community_resources_search",
        rawArguments: { query: args.query, limit: args.limit ?? 5 },
      }),
    );
  }
  return parseToolOutput(
    await executeRetrievalHarnessTool({
      ctx: args.ctx,
      userId: String(args.fixture.ownerId),
      authSubject: args.fixture.authSubject,
      projectId: null,
      runId: `resource-acceptance:${args.fixture.runId}:member-agent`,
      communityId: String(args.fixture.communityId),
      toolName: "community_resources_search",
      args: { query: args.query, limit: args.limit ?? 5 },
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
    return await executeMcpResourceTool({
      ctx: args.ctx,
      fixture: args.fixture,
      operation: "read",
      toolArgs: { ref: args.ref, limit: 10_000 },
    });
  }
  if (args.surface === "community_concierge") {
    const batch = parseToolOutput(
      await executeConciergeTool({
        ctx: args.ctx,
        context: {
          request: {
            sponsorUserId: args.fixture.ownerId,
            communityId: args.fixture.communityId,
            attempt: 1,
          },
        },
        requestId: args.fixture.visibleResourceId,
        toolName: "community_resources_read",
        rawArguments: { refs: [args.ref], maxChars: 10_000, perResourceChars: 10_000 },
      }),
    );
    const item = Array.isArray(batch.resources) ? batch.resources[0] : null;
    if (!item?.ok) throw new Error(item?.message ?? "resource_acceptance_concierge_read_failed");
    return { ...item, retrieval_id: batch.retrieval_id };
  }
  return parseToolOutput(
    await executeRetrievalHarnessTool({
      ctx: args.ctx,
      userId: String(args.fixture.ownerId),
      authSubject: args.fixture.authSubject,
      projectId: null,
      runId: `resource-acceptance:${args.fixture.runId}:member-agent`,
      communityId: String(args.fixture.communityId),
      toolName: "community_resource_read",
      args: { ref: args.ref, limit: 10_000 },
      evidenceSurface: "member_agent_dock",
      workspaceSession: null,
    }),
  );
}

export const seedCommunityResourceEvidenceAcceptanceInternal = internalMutation({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    if (!acceptanceEnabled()) throw new Error("community_resource_evidence_acceptance_disabled");
    const runId = boundedRunId(args.runId);
    const nowMs = Date.now();
    const authSubject = `resource-evidence:owner:${runId}`;
    const communitySlug = `resource-evidence-${runId}`.slice(0, 120);
    const ownerId = await ctx.db.insert("users", {
      authSubject,
      email: `resource-owner-${runId}@smoke.polynet.ai`,
      normalizedEmail: `resource-owner-${runId}@smoke.polynet.ai`,
      displayName: "Resource evidence owner",
      handle: `resource-owner-${runId}`.slice(0, 60),
      normalizedHandle: `resource-owner-${runId}`.slice(0, 60),
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const outsiderId = await ctx.db.insert("users", {
      authSubject: `resource-evidence:outsider:${runId}`,
      email: `resource-outsider-${runId}@smoke.polynet.ai`,
      normalizedEmail: `resource-outsider-${runId}@smoke.polynet.ai`,
      displayName: "Resource evidence outsider",
      handle: `resource-outsider-${runId}`.slice(0, 60),
      normalizedHandle: `resource-outsider-${runId}`.slice(0, 60),
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: communitySlug,
      name: `Resource evidence ${runId}`,
      oneLiner: "Isolated resource evidence acceptance fixture",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const foreignCommunityId = await ctx.db.insert("communities", {
      ownerId,
      slug: `resource-foreign-${runId}`.slice(0, 120),
      name: `Resource foreign ${runId}`,
      oneLiner: "Foreign resource fixture",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const liveModuleId = await ctx.db.insert("communityResourceModules", {
      communityId,
      createdByUserId: ownerId,
      status: "live",
      name: "Published knowledge",
      sortOrder: 1000,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const movedModuleId = await ctx.db.insert("communityResourceModules", {
      communityId,
      createdByUserId: ownerId,
      status: "live",
      name: "Moved knowledge",
      sortOrder: 2000,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const draftModuleId = await ctx.db.insert("communityResourceModules", {
      communityId,
      createdByUserId: ownerId,
      status: "draft",
      name: "Draft knowledge",
      sortOrder: 3000,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const foreignModuleId = await ctx.db.insert("communityResourceModules", {
      communityId: foreignCommunityId,
      createdByUserId: ownerId,
      status: "live",
      name: "Foreign knowledge",
      sortOrder: 1000,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const sourceResourceId = await ctx.db.insert("communityResources", {
      communityId,
      moduleId: liveModuleId,
      createdByUserId: ownerId,
      type: "post",
      role: "source",
      status: "review",
      title: "Resource alpha hidden source",
      bodyMd: "Resource alpha builder-only source evidence",
      bodyChars: 43,
      sourceIngestionStatus: "ready",
      sourceIngestionKind: "manual",
      pinned: false,
      sortOrder: 1000,
      createdAt: nowMs - 1000,
      updatedAt: nowMs - 1000,
    });
    const visibleResourceId = await ctx.db.insert("communityResources", {
      communityId,
      moduleId: liveModuleId,
      createdByUserId: ownerId,
      type: "post",
      role: "page",
      status: "draft",
      sourceResourceId,
      title: "Resource alpha canonical page",
      bodyMd: "Resource alpha canonical member evidence",
      bodyChars: 40,
      sourceIngestionStatus: "not_required",
      sourceIngestionKind: "manual",
      pinned: true,
      sortOrder: 2000,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const draftResourceId = await ctx.db.insert("communityResources", {
      communityId,
      moduleId: draftModuleId,
      createdByUserId: ownerId,
      type: "post",
      role: "page",
      status: "draft",
      title: "Resource alpha draft page",
      bodyMd: "Resource alpha draft module evidence must stay hidden",
      bodyChars: 53,
      sourceIngestionStatus: "not_required",
      sourceIngestionKind: "manual",
      pinned: false,
      sortOrder: 1000,
      createdAt: nowMs + 1,
      updatedAt: nowMs + 1,
    });
    const foreignResourceId = await ctx.db.insert("communityResources", {
      communityId: foreignCommunityId,
      moduleId: foreignModuleId,
      createdByUserId: ownerId,
      type: "post",
      role: "page",
      status: "draft",
      title: "Resource alpha foreign page",
      bodyMd: "Resource alpha foreign evidence must stay hidden",
      bodyChars: 48,
      sourceIngestionStatus: "not_required",
      sourceIngestionKind: "manual",
      pinned: false,
      sortOrder: 1000,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const archiveOnlyResourceId = await ctx.db.insert("communityResources", {
      communityId,
      moduleId: liveModuleId,
      createdByUserId: ownerId,
      type: "post",
      role: "page",
      status: "draft",
      title: "Zetarestorium archive page",
      bodyMd: "Zetarestorium resource evidence beyond the recent scan",
      bodyChars: 54,
      sourceIngestionStatus: "not_required",
      sourceIngestionKind: "manual",
      pinned: false,
      sortOrder: 3000,
      createdAt: nowMs - 60_000,
      updatedAt: nowMs - 60_000,
    });
    for (let index = 0; index < 85; index += 1) {
      await ctx.db.insert("communityResources", {
        communityId,
        moduleId: liveModuleId,
        createdByUserId: ownerId,
        type: "post",
        role: "page",
        status: "draft",
        title: `Recent resource filler ${index}`,
        bodyMd: `Recent resource filler content ${index}`,
        bodyChars: 35,
        sourceIngestionStatus: "not_required",
        sourceIngestionKind: "manual",
        pinned: false,
        sortOrder: 4000 + index,
        createdAt: nowMs - 30_000 + index,
        updatedAt: nowMs - 30_000 + index,
      });
    }
    for (const resourceId of [
      visibleResourceId,
      draftResourceId,
      sourceResourceId,
      archiveOnlyResourceId,
    ]) {
      const row = await ctx.db.get(resourceId);
      if (row) await upsertArchiveDocumentForResource(ctx, row as any);
    }
    return {
      runId,
      authSubject,
      communitySlug,
      ownerId,
      outsiderId,
      communityId,
      foreignCommunityId,
      liveModuleId,
      movedModuleId,
      draftModuleId,
      sourceResourceId,
      visibleResourceId,
      draftResourceId,
      foreignResourceId,
      archiveOnlyResourceId,
      refs: {
        visible: buildCommunityResourceEvidenceRef(String(visibleResourceId)),
        draft: buildCommunityResourceEvidenceRef(String(draftResourceId)),
        source: buildCommunityResourceEvidenceRef(String(sourceResourceId)),
        foreign: buildCommunityResourceEvidenceRef(String(foreignResourceId)),
        wrongType: buildCommunityResourceEvidenceRef(String(liveModuleId)),
        archiveOnly: buildCommunityResourceEvidenceRef(String(archiveOnlyResourceId)),
      },
    };
  },
});

export const moveCommunityResourceEvidenceAcceptanceInternal = internalMutation({
  args: {
    resourceId: v.id("communityResources"),
    moduleId: v.id("communityResourceModules"),
  },
  handler: async (ctx, args) => {
    if (!acceptanceEnabled()) throw new Error("community_resource_evidence_acceptance_disabled");
    await ctx.db.patch(args.resourceId, { moduleId: args.moduleId, updatedAt: Date.now() });
    const row = await ctx.db.get(args.resourceId);
    if (!row) throw new Error("community_resource_not_found");
    await upsertArchiveDocumentForResource(ctx, row as any);
    return { ok: true };
  },
});

export const hideCommunityResourceModuleAcceptanceInternal = internalMutation({
  args: {
    moduleId: v.id("communityResourceModules"),
    resourceId: v.id("communityResources"),
  },
  handler: async (ctx, args) => {
    if (!acceptanceEnabled()) throw new Error("community_resource_evidence_acceptance_disabled");
    await ctx.db.patch(args.moduleId, { status: "draft", updatedAt: Date.now() });
    const row = await ctx.db.get(args.resourceId);
    if (row) await upsertArchiveDocumentForResource(ctx, row as any);
    return { ok: true };
  },
});

export const readCommunityResourceEvidenceAcceptanceStateInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    resourceIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const archives = [];
    for (const sourceId of args.resourceIds) {
      const row = await ctx.db
        .query("communityArchiveDocuments")
        .withIndex("by_community_source", (q) =>
          q.eq("communityId", args.communityId).eq("sourceType", "resource").eq("sourceId", sourceId),
        )
        .first();
      archives.push({ sourceId, exists: Boolean(row) });
    }
    const traces = await ctx.db
      .query("communitySourceTraces")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
      .filter((q) => q.eq(q.field("sourceType"), "resource"))
      .take(20);
    const retrievalLogs = await ctx.db
      .query("communityEvidenceRetrievalLogs")
      .withIndex("by_community_createdAt", (q) => q.eq("communityId", args.communityId))
      .order("asc")
      .take(50);
    return {
      archives,
      traceCount: traces.length,
      retrievalLogs: retrievalLogs.map((row) => ({
        surface: row.surface,
        capability: row.capability,
        resultRefs: row.resultRefs,
        hasRawQuery: typeof row.query === "string" && row.query.length > 0,
      })),
    };
  },
});

export const runCommunityResourceEvidenceAcceptance = action({
  args: {
    runId: v.string(),
    confirmation: v.literal(ACCEPTANCE_CONFIRMATION),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    if (!acceptanceEnabled()) {
      return { ok: false, code: "community_resource_evidence_acceptance_disabled" };
    }
    const fixture: any = await ctx.runMutation(
      internalRefs.communityResourceEvidenceAcceptance.seedCommunityResourceEvidenceAcceptanceInternal,
      { runId: args.runId },
    );
    const failures: string[] = [];
    const embedding = await processPendingArchiveDocuments({
      ctx,
      communityId: fixture.communityId,
    });
    if (embedding.error || embedding.succeeded < 2) {
      failures.push(`resource_archive_embedding_unavailable:${embedding.error ?? embedding.succeeded}`);
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
          limit: 5,
        });
        const refs = Array.isArray(search.matches)
          ? search.matches.map((row: any) => String(row?.ref ?? "")).filter(Boolean)
          : [];
        if (!refs.includes(fixture.refs.visible)) {
          failures.push(`${surface}:resource_search_refs_invalid`);
        }
        if (
          refs.includes(fixture.refs.draft) ||
          refs.includes(fixture.refs.source) ||
          refs.includes(fixture.refs.foreign)
        ) {
          failures.push(`${surface}:builder_or_foreign_resource_leaked`);
        }
        const hit = search.matches?.[0];
        if (
          hit?.lineage?.authority?.type !== "community" ||
          hit?.lineage?.credit !== null ||
          hit?.lineage?.profile_projection !== "none"
        ) {
          failures.push(`${surface}:resource_lineage_invalid`);
        }
        const read = await executeSurfaceRead({
          ctx,
          fixture,
          surface,
          ref: fixture.refs.visible,
        });
        if (
          read?.resource?.ref !== fixture.refs.visible ||
          read?.source !== null ||
          !String(read?.content?.body_md ?? "").includes("canonical member evidence")
        ) {
          failures.push(`${surface}:resource_read_invalid`);
        }
        surfaceResults.push({
          surface,
          refs,
          searchRetrievalId: search.retrieval_id,
          readRetrievalId: read.retrieval_id,
          directoryUri: read.resource.directory_uri,
        });
      } catch (error) {
        failures.push(`${surface}:adapter_failed:${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const mapResult = parseToolOutput(
      await executeRetrievalHarnessTool({
        ctx,
        userId: String(fixture.ownerId),
        authSubject: fixture.authSubject,
        projectId: null,
        runId: `resource-acceptance:${fixture.runId}:member-map`,
        communityId: String(fixture.communityId),
        toolName: "community_resources_map",
        args: { limit: 100, perModuleLimit: 100 },
        evidenceSurface: "member_agent_dock",
        workspaceSession: null,
      }),
    );
    const mapJson = JSON.stringify(mapResult);
    if (
      mapResult.scope !== "member" ||
      mapJson.includes(String(fixture.draftResourceId)) ||
      mapJson.includes(String(fixture.sourceResourceId))
    ) {
      failures.push("member_resource_map_builder_state_leaked");
    }

    const builderDirectory: any = await ctx.runQuery(
      internalRefs.communityResources.listCommunityResourceBuilderDirectoryInternal,
      { userId: fixture.ownerId, communityId: fixture.communityId, limit: 250 },
    );
    const builderIds = new Set(
      (builderDirectory.resources ?? []).map((row: any) => String(row?.id ?? "")),
    );
    if (
      !builderIds.has(String(fixture.draftResourceId)) ||
      !builderIds.has(String(fixture.sourceResourceId))
    ) {
      failures.push("explicit_builder_resource_lane_unavailable");
    }

    const outsider = await executeRetrievalHarnessTool({
      ctx,
      userId: String(fixture.outsiderId),
      projectId: null,
      runId: `resource-acceptance:${fixture.runId}:outsider`,
      communityId: String(fixture.communityId),
      toolName: "community_resources_search",
      args: { query: SEARCH_QUERY, limit: 5 },
      evidenceSurface: "member_agent_dock",
      workspaceSession: null,
    });
    const outsiderDenied = outsider.status !== "ok";
    if (!outsiderDenied) failures.push("resource_outsider_access_not_denied");

    const deniedRefs: Record<string, boolean> = {};
    for (const [name, ref] of Object.entries({
      draft: fixture.refs.draft,
      source: fixture.refs.source,
      foreign: fixture.refs.foreign,
      wrongType: fixture.refs.wrongType,
    })) {
      try {
        await ctx.runAction(
          internalRefs.communityResourceEvidence.readCommunityResourceEvidenceForToolInternal,
          {
            userId: fixture.ownerId,
            communityId: fixture.communityId,
            ref,
            surface: "member_agent_dock",
          },
        );
        deniedRefs[name] = false;
        failures.push(`${name}_resource_ref_not_denied`);
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
        failures.push("resource_archive_only_retrieval_not_proven");
      }
      if (archiveOnlyResult?.diagnostics?.archive_available !== true) {
        failures.push("resource_archive_vector_path_not_available");
      }
    } catch (error) {
      failures.push(`resource_archive_adapter_failed:${error instanceof Error ? error.message : String(error)}`);
    }

    const beforeMove = await executeSurfaceRead({
      ctx,
      fixture,
      surface: "member_agent_dock",
      ref: fixture.refs.visible,
    });
    await ctx.runMutation(
      internalRefs.communityResourceEvidenceAcceptance.moveCommunityResourceEvidenceAcceptanceInternal,
      { resourceId: fixture.visibleResourceId, moduleId: fixture.movedModuleId },
    );
    const afterMove = await executeSurfaceRead({
      ctx,
      fixture,
      surface: "member_agent_dock",
      ref: fixture.refs.visible,
    });
    const moveStable =
      beforeMove.resource?.ref === afterMove.resource?.ref &&
      beforeMove.resource?.directory_uri !== afterMove.resource?.directory_uri;
    if (!moveStable) failures.push("resource_identity_not_move_stable");

    const beforeHide: any = await ctx.runQuery(
      internalRefs.communityResourceEvidenceAcceptance.readCommunityResourceEvidenceAcceptanceStateInternal,
      {
        communityId: fixture.communityId,
        resourceIds: [String(fixture.visibleResourceId), String(fixture.archiveOnlyResourceId)],
      },
    );
    if (beforeHide.traceCount !== 0) failures.push("resource_automatically_promoted_to_compiler");
    if (beforeHide.retrievalLogs.some((row: any) => row.hasRawQuery)) {
      failures.push("resource_retrieval_audit_copied_raw_query");
    }

    await ctx.runMutation(
      internalRefs.communityResourceEvidenceAcceptance.hideCommunityResourceModuleAcceptanceInternal,
      { moduleId: fixture.movedModuleId, resourceId: fixture.visibleResourceId },
    );
    let hiddenReadDenied = false;
    try {
      await ctx.runAction(
        internalRefs.communityResourceEvidence.readCommunityResourceEvidenceForToolInternal,
        {
          userId: fixture.ownerId,
          communityId: fixture.communityId,
          ref: fixture.refs.visible,
          surface: "member_agent_dock",
        },
      );
    } catch {
      hiddenReadDenied = true;
    }
    if (!hiddenReadDenied) failures.push("hidden_resource_read_not_denied");
    const afterHide: any = await ctx.runQuery(
      internalRefs.communityResourceEvidenceAcceptance.readCommunityResourceEvidenceAcceptanceStateInternal,
      {
        communityId: fixture.communityId,
        resourceIds: [String(fixture.visibleResourceId), String(fixture.archiveOnlyResourceId)],
      },
    );
    const visibleArchive = afterHide.archives.find(
      (row: any) => row.sourceId === String(fixture.visibleResourceId),
    );
    if (visibleArchive?.exists) failures.push("hidden_resource_archive_not_deleted");

    return {
      ok: failures.length === 0,
      code: failures.length === 0
        ? "community_resource_evidence_acceptance_passed"
        : "community_resource_evidence_acceptance_failed",
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
      moveStable,
      hiddenReadDenied,
      beforeHide,
      afterHide,
    };
  },
});
