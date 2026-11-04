import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import {
  communityEvidenceSurfaceValidator,
  resolveTrustedCommunityEvidenceUserId,
} from "./communityEvidenceAudit";
import {
  normalizeCommunityEvidenceSearchLimit,
  parseCommunityInteractionEvidenceRef,
  parseCommunityResourceEvidenceRef,
} from "../shared/communityEvidenceContract";


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
  const channelSlug = requiredString(item.channel_slug, 80) ?? "general";
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(channelSlug)) {
    throw new Error("community_repository_search_interaction_channel_invalid");
  }
  return {
    ...item,
    ref,
    source_type: "interaction",
    source_id: ref,
    channel_slug: channelSlug,
    path: `/channels/${channelSlug}/${ref}.md`,
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

// Community notes live under memory/, one markdown file each.
function canonicalNoteItem(note: Record<string, unknown>): SearchItem {
  const slug = requiredString(note.slug, 80);
  if (!slug) throw new Error("community_repository_search_note_ref_invalid");
  return {
    source_type: "memory",
    source_id: slug,
    path: `/memory/${slug}.md`,
    title: requiredString(note.title, 180),
    snippet: requiredString(note.snippet, 500) ?? requiredString(note.title, 500) ?? "Community note",
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
    const [interactions, resources, notes] = await Promise.all([
      ctx.runQuery(
        (internal as any).communityInteractionEvidence
          .searchRecentCommunityInteractionEvidenceInternal,
        { userId, communityId: args.communityId, query, limit },
      ),
      ctx.runQuery(
        (internal as any).communityResourceEvidence
          .searchRecentCommunityResourceEvidenceInternal,
        { userId, communityId: args.communityId, query, limit },
      ),
      ctx.runQuery(
        (internal as any).communityNotes.searchCommunityNotesInternal,
        { communityId: args.communityId, query, limit },
      ),
    ]) as [
      Record<string, unknown>,
      Record<string, unknown>,
      { notes: Array<Record<string, unknown>> },
    ];

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
          items: (Array.isArray(resources.matches)
            ? resources.matches
            : []
          ).map((item) => canonicalResourceItem(item as SearchItem)),
          truncated: resources.truncated === true,
        },
        {
          items: notes.notes.map(canonicalNoteItem),
          truncated: false,
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
        domain_count: 3,
      },
    };
  },
});
