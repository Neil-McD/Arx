import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import {
  normalizeIdValue,
  requireCommunityChatAccess,
  toIsoString,
} from "./communityCore";
import { truncateText } from "./communityText";
import {
  communityEvidenceSurfaceValidator,
  resolveTrustedCommunityEvidenceUserId,
} from "./communityEvidenceAudit";
import {
  resolveCommunityAiFeedEvidenceSource,
  type CommunityAiFeedEvidenceRow,
} from "./communityAiFeedEvidenceCore";
import {
  buildCommunityAiFeedEvidenceRef,
  deriveCommunityAiFeedLineageEnvelope,
  normalizeCommunityEvidenceSearchLimit,
  parseCommunityAiFeedEvidenceRef,
} from "../shared/communityEvidenceContract";

type CommunityRow = {
  _id: any;
  name?: string;
  slug?: string;
};

const RECENT_AI_FEED_SCAN_LIMIT = 80;

function tokenizeAiFeedQuery(raw: unknown): string[] {
  return Array.from(
    new Set(
      String(raw ?? "")
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    ),
  ).slice(0, 16);
}

function scoreAiFeedPost(row: CommunityAiFeedEvidenceRow, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const title = String(row.title ?? "").toLowerCase();
  const body = String(row.body ?? "").toLowerCase();
  const supportingNotes = Array.isArray(row.evidence)
    ? row.evidence.join("\n").toLowerCase()
    : "";
  let matched = 0;
  let weighted = 0;
  for (const token of tokens) {
    const tokenMatched =
      title.includes(token) || body.includes(token) || supportingNotes.includes(token);
    if (!tokenMatched) continue;
    matched += 1;
    if (title.includes(token)) weighted += 3;
    if (body.includes(token)) weighted += 1;
    if (supportingNotes.includes(token)) weighted += 0.5;
  }
  if (matched === 0) return 0;
  return Number((matched / tokens.length + weighted / Math.max(1, tokens.length)).toFixed(4));
}

function aiFeedSnippet(row: CommunityAiFeedEvidenceRow, tokens: string[]): string | null {
  const source = [row.title, row.body, ...(Array.isArray(row.evidence) ? row.evidence : [])]
    .map((value) => String(value ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" — ");
  if (!source) return null;
  const lower = source.toLowerCase();
  const firstIndex = tokens
    .map((token) => lower.indexOf(token))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, firstIndex - 120);
  return `${start > 0 ? "..." : ""}${source.slice(start, start + 500)}${
    start + 500 < source.length ? "..." : ""
  }`;
}

function mapAiFeedEvidenceItem(args: {
  community: CommunityRow;
  post: CommunityAiFeedEvidenceRow;
  retrievalScore: number | null;
  retrievalSource: "recent" | "archive";
  tokens?: string[];
}) {
  const postId = normalizeIdValue(args.post._id);
  const ref = buildCommunityAiFeedEvidenceRef(postId);
  const slug = String(args.community.slug ?? "").trim();
  const supportingNotes = Array.isArray(args.post.evidence)
    ? args.post.evidence.map((entry) => String(entry).trim()).filter(Boolean).slice(0, 4)
    : [];
  return {
    ref,
    source_type: "ai_feed" as const,
    source_id: postId,
    post_id: postId,
    post_type: args.post.type,
    title: String(args.post.title ?? "").trim() || null,
    snippet: aiFeedSnippet(args.post, args.tokens ?? []),
    supporting_notes: supportingNotes,
    why_now: String(args.post.whyNow ?? "").trim() || null,
    lineage: deriveCommunityAiFeedLineageEnvelope({
      communityId: normalizeIdValue(args.community._id),
      postId,
      agentKind: args.post.agentKind ?? null,
      agentKey: args.post.agentKey ?? null,
      recordedByUserId: args.post.authorUserId
        ? normalizeIdValue(args.post.authorUserId)
        : null,
    }),
    retrieval_score: args.retrievalScore,
    signal_score: Number(args.post.score ?? 0),
    reaction_counts: {
      good: Math.max(0, Number(args.post.goodCount ?? 0)),
      low_signal: Math.max(0, Number(args.post.lowSignalCount ?? 0)),
    },
    created_at: toIsoString(args.post.createdAt),
    updated_at: toIsoString(args.post.updatedAt),
    retrieval_source: args.retrievalSource,
    deep_link: slug
      ? `/c/${encodeURIComponent(slug)}/ai-feed?evidence=${encodeURIComponent(ref)}`
      : null,
  };
}

export const searchRecentCommunityAiFeedEvidenceInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    query: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const community = (await ctx.db.get(args.communityId)) as CommunityRow | null;
    if (!community) throw new Error("community_not_found");
    const posts = (await ctx.db
      .query("communityAiFeedPosts" as any)
      .withIndex("by_community_status_createdAt", (q: any) =>
        q.eq("communityId", args.communityId).eq("status", "live"),
      )
      .order("desc")
      .take(RECENT_AI_FEED_SCAN_LIMIT)) as CommunityAiFeedEvidenceRow[];
    const tokens = tokenizeAiFeedQuery(args.query);
    const matches = posts
      .map((post) => ({ post, score: scoreAiFeedPost(post, tokens) }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score || b.post.updatedAt - a.post.updatedAt)
      .slice(0, normalizeCommunityEvidenceSearchLimit(args.limit))
      .map((candidate) =>
        mapAiFeedEvidenceItem({
          community,
          post: candidate.post,
          retrievalScore: candidate.score,
          retrievalSource: "recent",
          tokens,
        }),
      );
    return {
      community: {
        id: normalizeIdValue(community._id),
        slug: String(community.slug ?? "").trim() || null,
        name: String(community.name ?? "").trim() || "Community",
      },
      matches,
    };
  },
});

export const readCommunityAiFeedEvidenceItemsInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    refs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const community = (await ctx.db.get(args.communityId)) as CommunityRow | null;
    if (!community) throw new Error("community_not_found");
    const items = [];
    for (const ref of args.refs.slice(0, 40)) {
      const postId = parseCommunityAiFeedEvidenceRef(ref);
      if (!postId) continue;
      const post = await resolveCommunityAiFeedEvidenceSource({
        ctx,
        communityId: args.communityId,
        postId,
      });
      if (!post) continue;
      items.push(
        mapAiFeedEvidenceItem({
          community,
          post,
          retrievalScore: null,
          retrievalSource: "archive",
        }),
      );
    }
    return items;
  },
});

export const readCommunityAiFeedEvidenceInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    ref: v.string(),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const postId = parseCommunityAiFeedEvidenceRef(args.ref);
    if (!postId) throw new Error("community_ai_feed_evidence_ref_invalid");
    const post = await resolveCommunityAiFeedEvidenceSource({
      ctx,
      communityId: args.communityId,
      postId,
    });
    if (!post) throw new Error("community_ai_feed_evidence_not_found");
    const community = (await ctx.db.get(args.communityId)) as CommunityRow | null;
    if (!community) throw new Error("community_not_found");
    return {
      ...mapAiFeedEvidenceItem({
        community,
        post,
        retrievalScore: null,
        retrievalSource: "recent",
      }),
      body: post.body,
    };
  },
});

export const searchCommunityAiFeedEvidenceInternal = internalAction({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    query: v.string(),
    limit: v.optional(v.number()),
    surface: communityEvidenceSurfaceValidator,
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const userId = await resolveTrustedCommunityEvidenceUserId({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const query = truncateText(args.query, 240);
    if (!query) throw new Error("community_ai_feed_search_query_required");
    const limit = normalizeCommunityEvidenceSearchLimit(args.limit);
    const recent = (await ctx.runQuery(
      (internal as any).communityAiFeedEvidence.searchRecentCommunityAiFeedEvidenceInternal,
      { userId, communityId: args.communityId, query, limit },
    )) as { community: Record<string, unknown>; matches: Array<Record<string, unknown>> };
    const matches = recent.matches;
    const resultRefs = matches.map((match) => String(match.ref ?? "")).filter(Boolean);
    const retrievalId: any = await ctx.runMutation(
      (internal as any).communityEvidenceAudit.recordCommunityEvidenceRetrievalInternal,
      {
        communityId: args.communityId,
        userId,
        surface: args.surface,
        capability: "community_ai_feed_search",
        resultRefs,
      },
    );
    return {
      ok: true,
      kind: "community_ai_feed_search",
      community: recent.community,
      query,
      matches,
      retrieval_id: normalizeIdValue(retrievalId),
      diagnostics: {
        version: 2,
        source: "community_ai_feed_posts",
        strategy: "bounded_lexical",
      },
    };
  },
});

export const readCommunityAiFeedEvidenceForToolInternal = internalAction({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    ref: v.string(),
    surface: communityEvidenceSurfaceValidator,
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const userId = await resolveTrustedCommunityEvidenceUserId({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const ref = truncateText(args.ref, 512);
    if (!parseCommunityAiFeedEvidenceRef(ref)) {
      throw new Error("community_ai_feed_evidence_ref_invalid");
    }
    const evidence = await ctx.runQuery(
      (internal as any).communityAiFeedEvidence.readCommunityAiFeedEvidenceInternal,
      { userId, communityId: args.communityId, ref },
    );
    const retrievalId: any = await ctx.runMutation(
      (internal as any).communityEvidenceAudit.recordCommunityEvidenceRetrievalInternal,
      {
        communityId: args.communityId,
        userId,
        surface: args.surface,
        capability: "community_ai_feed_read",
        resultRefs: [ref],
      },
    );
    return {
      ok: true,
      evidence,
      retrieval_id: normalizeIdValue(retrievalId),
    };
  },
});
