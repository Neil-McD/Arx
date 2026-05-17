import { internal } from "./_generated/api";
import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  buildActiveCommunityContextToolPayload,
} from "../shared/communityContextTool.ts";
import {
  requireCommunityChatAccess,
} from "./communityCore";
import {
  isCodexHarnessReadOnlyDynamicToolName,
  normalizeCodexHarnessDynamicToolArguments,
  type CodexHarnessReadOnlyDynamicToolName,
} from "../shared/codexHarnessDynamicTools.ts";
import {
  buildCodexMcpProjection,
} from "../shared/codexMcpProjection.ts";
import {
  normalizeRuntimeMountedUserPlatformAppTools,
} from "./runtimeHarnessShaping.ts";
import {
  createRuntimeMcpManager,
  type RuntimeMountedMcpTool,
} from "./runtimeMcpManager.ts";

export type CodexHarnessDynamicToolCallResponse = {
  success: boolean;
  contentItems: Array<{ type: "inputText"; text: string }>;
  errorCode?: string | null;
};

async function requireTrustedBridgeActor(args: {
  ctx: any;
  userId: any;
  authSubject: string;
}) {
  const user = await args.ctx.db.get(args.userId);
  const expected = String(args.authSubject ?? "").trim();
  const actual = String(user?.authSubject ?? "").trim();
  if (!user || !expected || actual !== expected) {
    throw new Error("trusted_identity_mismatch");
  }
  return user._id;
}

export const resolveCodexHarnessTrustedCommunityContextInternal = internalQuery({
  args: {
    userId: v.id("users"),
    authSubject: v.string(),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await requireTrustedBridgeActor({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const { community } = await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const config = await ctx.db
      .query("communityAgentConfigs" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .order("desc")
      .first();
    return {
      community_id: String(args.communityId),
      community_name: String(community.name ?? "").trim() || null,
      community_slug: String(community.slug ?? "").trim() || null,
      community_one_liner: String(community.oneLiner ?? "").trim() || null,
      community_about: String(community.about ?? "").trim() || null,
      community_system_prompt: config?.systemPrompt ?? null,
      system_prompt: config?.systemPrompt ?? null,
    };
  },
});

export const resolveCodexHarnessTrustedBridgeActorInternal = internalQuery({
  args: {
    userId: v.id("users"),
    authSubject: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireTrustedBridgeActor({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    return {
      user_id: String(userId),
    };
  },
});

function formatJsonToolOutput(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function failDynamicTool(
  errorCode: string,
  message: string,
): CodexHarnessDynamicToolCallResponse {
  return {
    success: false,
    contentItems: [{ type: "inputText", text: message }],
    errorCode,
  };
}

function okDynamicTool(payload: unknown): CodexHarnessDynamicToolCallResponse {
  return {
    success: true,
    contentItems: [{ type: "inputText", text: formatJsonToolOutput(payload) }],
    errorCode: null,
  };
}

function okTextDynamicTool(text: string): CodexHarnessDynamicToolCallResponse {
  return {
    success: true,
    contentItems: [{ type: "inputText", text }],
    errorCode: null,
  };
}

function toRuntimeMountedMcpTools(value: unknown): RuntimeMountedMcpTool[] {
  return normalizeRuntimeMountedUserPlatformAppTools(value).map((tool) => ({
    scope: "user",
    mount_id: tool.user_platform_app_mount_id,
    runtime_tool_name: `me__${tool.namespaced_tool_name}`,
    developer_app_id: tool.developer_app_id,
    catalog_app_id: tool.catalog_app_id,
    app_name: tool.app_name,
    endpoint_url: tool.endpoint_url,
    auth_type: tool.auth_type,
    tool_name: tool.tool_name,
    namespaced_tool_name: tool.namespaced_tool_name,
    description: tool.description,
    input_schema: tool.input_schema,
    risk_level: tool.risk_level,
  }));
}

async function executeCodexHarnessReadOnlyMountedMcpTool(params: {
  ctx: any;
  userId: string;
  authSubject?: string | null;
  runId?: string | null;
  toolName: string;
  args: Record<string, unknown>;
  appendRunEvent?: (event: {
    eventType: string;
    eventKey?: string;
    payload: Record<string, unknown>;
  }) => Promise<void>;
}): Promise<CodexHarnessDynamicToolCallResponse> {
  const authSubject = String(params.authSubject ?? "").trim();
  const toolName = String(params.toolName ?? "").trim();
  if (!authSubject) {
    return failDynamicTool(
      "auth_subject_required",
      `${toolName || "MCP tool"} requires authenticated bridge identity context.`,
    );
  }

  try {
    await params.ctx.runQuery(
      (internal as any).codexHarnessPlatformTools
        .resolveCodexHarnessTrustedBridgeActorInternal,
      {
        userId: params.userId as any,
        authSubject,
      },
    );
  } catch (error) {
    return failDynamicTool(
      "trusted_identity_mismatch",
      error instanceof Error ? error.message : String(error),
    );
  }

  const mountedTools = toRuntimeMountedMcpTools(
    await params.ctx.runQuery(
      internal.userPlatformAppMounts.listRuntimeUserPlatformMountedToolsInternal as any,
      {
        userId: params.userId as any,
      },
    ),
  );
  const mountedTool = mountedTools.find(
    (tool) => tool.runtime_tool_name === toolName,
  );
  if (!mountedTool) {
    return failDynamicTool(
      "codex_mcp_tool_not_found",
      "Mounted MCP tool was not found in the active user harness.",
    );
  }

  const projection = await buildCodexMcpProjection({ mountedTools });
  const projectedTool = projection.tools.find(
    (tool) => tool.runtime_tool_name === toolName,
  );
  if (projectedTool?.status !== "eligible" || mountedTool.risk_level !== "read") {
    return failDynamicTool(
      "codex_mcp_tool_not_eligible",
      "Mounted MCP tool is not eligible for the read-only Codex bridge.",
    );
  }

  const manager = createRuntimeMcpManager({
    runId: String(params.runId ?? "").trim() || `codex_bridge:${crypto.randomUUID()}`,
    mountedTools: [mountedTool],
    appendRunEvent: params.appendRunEvent,
    loadConnectionBundle: async ({ developerAppId }) =>
      (await params.ctx.runAction(
        internal.appOAuth.getFreshDeveloperAppConnectionBundleInternal as any,
        {
          developerAppId: developerAppId as any,
        },
      )) as any,
  });
  const result = await manager.execute({
    runtimeToolName: toolName,
    argumentsObject: params.args,
  });
  if (result.status !== "ok") {
    return failDynamicTool(
      result.errorCode ?? "codex_mcp_tool_failed",
      result.errorMessage ||
        result.outputText ||
        "Mounted MCP tool failed.",
    );
  }
  return okTextDynamicTool(
    result.outputText ||
      formatJsonToolOutput({
        status: "ok",
        tool_name: toolName,
        details: result.details ?? null,
      }),
  );
}

export async function executeCodexHarnessReadOnlyPlatformTool(params: {
  ctx: any;
  userId: string;
  authSubject?: string | null;
  communityId?: string | null;
  runId?: string | null;
  toolName: string;
  args: Record<string, unknown>;
  appendRunEvent?: (event: {
    eventType: string;
    eventKey?: string;
    payload: Record<string, unknown>;
  }) => Promise<void>;
}): Promise<CodexHarnessDynamicToolCallResponse> {
  if (!isCodexHarnessReadOnlyDynamicToolName(params.toolName)) {
    return await executeCodexHarnessReadOnlyMountedMcpTool(params);
  }

  let normalizedArgs: Record<string, unknown>;
  const toolName = params.toolName as CodexHarnessReadOnlyDynamicToolName;
  try {
    normalizedArgs = normalizeCodexHarnessDynamicToolArguments(
      toolName,
      params.args,
    );
  } catch (error) {
    return failDynamicTool(
      "invalid_tool_args",
      error instanceof Error ? error.message : String(error),
    );
  }

  if (!params.communityId) {
    return failDynamicTool(
      "community_required",
      `${toolName} requires an active community context.`,
    );
  }
  if (!params.authSubject) {
    return failDynamicTool(
      "auth_subject_required",
      `${toolName} requires authenticated bridge identity context.`,
    );
  }

  if (toolName === "get_active_community_context") {
    try {
      const resolvedCommunity = await params.ctx.runQuery(
        (internal as any).codexHarnessPlatformTools
          .resolveCodexHarnessTrustedCommunityContextInternal,
        {
          userId: params.userId as any,
          authSubject: params.authSubject,
          communityId: params.communityId as any,
        },
      );
      const resolvedCommunityId = String(
        (resolvedCommunity as { community_id?: unknown } | null)?.community_id ??
          "",
      ).trim();
      if (!resolvedCommunityId) {
        throw new Error("community_context_unavailable");
      }
      return okDynamicTool(
        buildActiveCommunityContextToolPayload(
          (resolvedCommunity ?? {}) as Record<string, unknown>,
        ),
      );
    } catch (error) {
      return failDynamicTool(
        "community_context_failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (toolName === "community_search") {
    try {
      const payload = await params.ctx.runAction(
        internal.communityArchive.searchCodexHarnessTrustedCommunityKnowledgeInternal as any,
        {
          userId: params.userId as any,
          authSubject: params.authSubject,
          communityId: params.communityId as any,
          query: String(normalizedArgs.query ?? "").trim(),
        },
      );
      const ok = Boolean((payload as { ok?: boolean } | null)?.ok);
      if (!ok) {
        const reasonCode = String(
          (payload as { reason_code?: unknown } | null)?.reason_code ?? "",
        ).trim();
        const message = String(
          (payload as { message?: unknown } | null)?.message ?? "",
        ).trim();
        return failDynamicTool(
          reasonCode || "community_search_failed",
          message || "Community search failed.",
        );
      }
      return okDynamicTool(payload);
    } catch (error) {
      return failDynamicTool(
        "community_search_failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return failDynamicTool(
    "codex_bridge_tool_not_allowed",
    "This tool is not allowed through the Codex dynamic bridge.",
  );
}
