import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import {
  communityEvidenceSurfaceValidator,
  resolveTrustedCommunityEvidenceUserId,
} from "./communityEvidenceAudit";
import {
  normalizeCommunityEvidenceSearchLimit,
  parseCommunityAiFeedEvidenceRef,
  parseCommunityInteractionEvidenceRef,
  parseCommunityResourceEvidenceRef,
} from "../shared/communityEvidenceContract";

const MEMORY_TYPES = new Set([
  "playbook",
  "insight",
  "example",
  "warning_failure",
  "decision_judgment",
  "open_question",
]);

type SearchItem = Record<string, unknown>;
type SearchDomain = {
  items: SearchItem[];
  truncated: boolean;
};

function requiredString(value: unknown, maxLength = 1_024): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function canonicalInteractionItem(item: SearchItem): SearchItem {
  const ref = requiredString(item.ref, 512);
  if (!ref || !parseCommunityInteractionEvidenceRef(ref)) {
    throw new Error("community_repository_search_interaction_ref_invalid");
  }
  return {
    ...item,
    ref,
    source_type: "interaction",
    source_id: ref,
    path: `/channels/general/${ref}.md`,
  };
}

function canonicalAiFeedItem(item: SearchItem): SearchItem {
  const ref = requiredString(item.ref, 512);
  if (!ref || !parseCommunityAiFeedEvidenceRef(ref)) {
    throw new Error("community_repository_search_ai_feed_ref_invalid");
  }
  return {
    ...item,
    ref,
    source_type: "ai_feed",
    source_id: requiredString(item.source_id, 180),
    path: `/ai-feed/${ref}.md`,
  };
}

function canonicalResourceItem(item: SearchItem): SearchItem {
  const ref = requiredString(item.ref, 512);
  const path = requiredString(item.path, 1_024);
  if (
    !ref ||
    !parseCommunityResourceEvidenceRef(ref) ||
    !path?.startsWith("/resources/")
  ) {
    throw new Error("community_repository_search_resource_ref_invalid");
  }
  return {
    ...item,
    ref,
    source_type: "resource",
    source_id: requiredString(item.source_id, 180),
    path,
  };
}

function canonicalMemoryItem(item: SearchItem): SearchItem {
  const nodeId = requiredString(item.id ?? item.node_id ?? item._id, 180);
  if (!nodeId) {
    throw new Error("community_repository_search_memory_ref_invalid");
  }
  const path = `/memory/${nodeId}.md`;
  return {
    ...item,
    source_type: "memory",
    source_id: nodeId,
    path,
    snippet:
      requiredString(item.snippet, 500) ??
      requiredString(item.title, 500) ??
      "Accepted community memory",
  };
}

function interleaveDomains(
  domains: SearchDomain[],
  limit: number,
): { results: SearchItem[]; truncated: boolean } {
  const results: SearchItem[] = [];
  const available = domains.reduce((total, domain) => total + domain.items.length, 0);
  const maxLength = Math.max(0, ...domains.map((domain) => domain.items.length));
  for (let rank = 0; rank < maxLength && results.length < limit; rank += 1) {
    for (const domain of domains) {
      const item = domain.items[rank];
      if (!item) continue;
      results.push(item);
      if (results.length >= limit) break;
    }
  }
  return {
    results,
    truncated:
      available > limit || domains.some((domain) => domain.truncated),
  };
}

export const searchCommunityRepositoryInternal = internalAction({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    query: v.string(),
    types: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
    surface: communityEvidenceSurfaceValidator,
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const userId = await resolveTrustedCommunityEvidenceUserId({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const query = requiredString(args.query, 240);
    if (!query) throw new Error("community_repository_search_query_required");
    const limit = normalizeCommunityEvidenceSearchLimit(args.limit);
    const memoryTypes = (args.types ?? [])
      .map((value) => String(value ?? "").trim())
      .filter((value) => MEMORY_TYPES.has(value));

    const [interactions, aiFeed, resources, memory] = await Promise.all([
      ctx.runQuery(
        (internal as any).communityInteractionEvidence
          .searchRecentCommunityInteractionEvidenceInternal,
        { userId, communityId: args.communityId, query, limit },
      ),
      ctx.runQuery(
        (internal as any).communityAiFeedEvidence
          .searchRecentCommunityAiFeedEvidenceInternal,
        { userId, communityId: args.communityId, query, limit },
      ),
      ctx.runQuery(
        (internal as any).communityResourceEvidence
          .searchRecentCommunityResourceEvidenceInternal,
        { userId, communityId: args.communityId, query, limit },
      ),
      ctx.runMutation(
        (internal as any).communityIntelligenceDirectory
          .searchCommunityMemoryInternal,
        {
          userId,
          communityId: args.communityId,
          query,
          limit,
          surface: args.surface,
          forceMemberView: true,
          ...(memoryTypes.length ? { types: memoryTypes } : {}),
        },
      ),
    ]) as [
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
    ];

    if (memory?.ok !== true) {
      throw new Error(
        requiredString(memory?.reason_code, 180) ??
          "community_repository_search_memory_failed",
      );
    }

    const merged = interleaveDomains(
      [
        {
          items: (Array.isArray(interactions.results)
            ? interactions.results
            : []
          ).map((item) => canonicalInteractionItem(item as SearchItem)),
          truncated: interactions.truncated === true,
        },
        {
          items: (Array.isArray(aiFeed.matches) ? aiFeed.matches : []).map(
            (item) => canonicalAiFeedItem(item as SearchItem),
          ),
          truncated: aiFeed.truncated === true,
        },
        {
          items: (Array.isArray(resources.matches)
            ? resources.matches
            : []
          ).map((item) => canonicalResourceItem(item as SearchItem)),
          truncated: resources.truncated === true,
        },
        {
          items: (Array.isArray(memory.nodes) ? memory.nodes : []).map((item) =>
            canonicalMemoryItem(item as SearchItem),
          ),
          truncated: memory.truncated === true,
        },
      ],
      limit,
    );

    const resultRefs = merged.results.map(
      (item) =>
        requiredString(item.ref, 512) ??
        requiredString(item.path, 1_024) ??
        "",
    );
    const retrievalId = await ctx.runMutation(
      (internal as any).communityEvidenceAudit
        .recordCommunityEvidenceRetrievalInternal,
      {
        communityId: args.communityId,
        userId,
        surface: args.surface,
        capability: "community_repository_search",
        resultRefs,
      },
    );

    return {
      ok: true,
      query,
      results: merged.results,
      truncated: merged.truncated,
      retrieval_id: String(retrievalId),
      diagnostics: {
        version: 1,
        source: "canonical_community_repository",
        strategy: "bounded_rank_interleave",
        domain_count: 4,
      },
    };
  },
});
