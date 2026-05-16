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

export async function executeCodexHarnessReadOnlyPlatformTool(params: {
  ctx: any;
  userId: string;
  authSubject?: string | null;
  communityId?: string | null;
  toolName: string;
  args: Record<string, unknown>;
}): Promise<CodexHarnessDynamicToolCallResponse> {
  if (!isCodexHarnessReadOnlyDynamicToolName(params.toolName)) {
    return failDynamicTool(
      "codex_bridge_tool_not_allowed",
      "This tool is not allowed through the Codex dynamic bridge.",
    );
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
