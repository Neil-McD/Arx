import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withStrictCors } from "../_shared/http.ts";
import { isAuthApiError, requireVerifiedUserId } from "../_shared/auth.ts";
import {
  loadCommunityEntitlement,
  normalizeCommunitySearchLimit,
  normalizeCommunitySearchQuery,
  parseCommunitySearchSourceTypes,
  runCanonicalCommunitySearch,
  runCanonicalCommunityDeepResearch,
  sanitizeCommunitySearchPayloadChatRows,
  sanitizeCommunitySearchPayloadMemoryRows,
  sanitizeCommunitySearchPayloadResourceRows,
} from "../_shared/community_research_orchestrator.ts";

type CommunityResearchInput = {
  community_id?: string;
  community_name?: string;
  query?: string;
  source_types?: string[];
  limit?: number;
};

async function readJsonBounded<T>(req: Request, maxChars = 32_000): Promise<T> {
  const text = await req.text();
  if (!text) throw new Error("Missing JSON body");
  if (text.length > maxChars) throw new Error("request_too_large");
  return JSON.parse(text) as T;
}

Deno.serve(async (req: Request) => {
  const cors = withStrictCors(noStoreHeaders(), req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: cors.allowed ? 204 : 403, headers: cors.headers });
  }
  if (!cors.allowed) {
    return jsonResponse({ ok: false, error: "cors_origin_not_allowed" }, { status: 403, headers: cors.headers });
  }
  const headers = cors.headers;
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405, headers });
  }

  try {
    const userId = await requireVerifiedUserId(req);
    const input = await readJsonBounded<CommunityResearchInput>(req);
    const communityId = String(input?.community_id ?? "").trim();
    const communityName = String(input?.community_name ?? "").trim();

    if (!communityId) {
      return jsonResponse(
        {
          ok: false,
          tool: "community_search",
          reason_code: "no_active_community",
          error: "community tool calls require an active thread community context.",
        },
        { status: 400, headers },
      );
    }

    const hasEntitlement = await loadCommunityEntitlement({
      userId,
      communityId,
    });
    if (!hasEntitlement) {
      return jsonResponse(
        {
          ok: false,
          tool: "community_search",
          reason_code: "community_entitlement_required",
          error: "Active community entitlement is required for community_search.",
        },
        { status: 403, headers },
      );
    }

    const query = normalizeCommunitySearchQuery(input?.query);
    const limit = normalizeCommunitySearchLimit(input?.limit);
    const sourceTypes = parseCommunitySearchSourceTypes({ source_types: input?.source_types ?? [] });

    const result = await (async () => {
      try {
        return await runCanonicalCommunityDeepResearch({
          userId,
          communityId,
          query,
          limit,
          sourceTypes,
        });
      } catch {
        return await runCanonicalCommunitySearch({
          userId,
          communityId,
          query,
          limit,
          sourceTypes,
        });
      }
    })();

    const payloadChatRows = sanitizeCommunitySearchPayloadChatRows(result.chatRows);
    const payloadResourceRows = sanitizeCommunitySearchPayloadResourceRows(result.resourceRows);
    const payloadMemoryRows = sanitizeCommunitySearchPayloadMemoryRows(result.memoryRows);

    return jsonResponse(
      {
        ok: true,
        tool: "community_search",
        canonical_tool: "community_search",
        community_scope: "thread_context",
        ...(communityName ? { community_name: communityName } : {}),
        query: result.query,
        limit: result.limit,
        source_types: result.sourceTypes,
        query_plan: result.queryPlan,
        executed_queries: result.executedQueries,
        ...("deepQueryPlan" in result ? { deep_query_plan: result.deepQueryPlan } : null),
        ...("passCount" in result ? { pass_count: result.passCount } : null),
        ...("stopReason" in result ? { stop_reason: result.stopReason } : null),
        diagnostics: result.diagnostics,
        meta_recent_fallback_used: result.metaRecentFallbackUsed,
        rows: {
          chat: payloadChatRows,
          resources: payloadResourceRows,
          memory: payloadMemoryRows,
        },
      },
      { status: 200, headers },
    );
  } catch (error) {
    if (isAuthApiError(error)) {
      return jsonResponse(
        {
          ok: false,
          error: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : null),
        },
        { status: error.status, headers },
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(
      {
        ok: false,
        error: "community_research_failed",
        message,
      },
      { status: 500, headers },
    );
  }
});
