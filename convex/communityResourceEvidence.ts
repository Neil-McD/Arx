import { readCommunityPaidLockedLessonIds } from "./communityLessonTracks";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import {
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
  normalizeIdValue,
  requireCommunityChatAccess,
  resolvePublicUserId,
  toIsoString,
  type CommunityResourceLike,
  type CommunityResourceModuleLike,
} from "./communityCore";
import { hydrateCommunityResourceBody } from "./communityResourceContent";
import { truncateText } from "./communityText";
import {
  communityEvidenceSurfaceValidator,
  resolveTrustedCommunityEvidenceUserId,
} from "./communityEvidenceAudit";
import {
  buildCommunityResourceDirectoryFields,
} from "../shared/communityResourceDirectory";
import {
  buildCommunityResourceEvidenceRef,
  deriveCommunityResourceLineageEnvelope,
  parseCommunityResourceEvidenceRef,
} from "../shared/communityEvidenceContract";
import { buildCommunityResourceSemanticDocumentPath } from "../shared/communitySemanticRepository";

type CommunityRow = {
  _id: any;
  name?: string;
  slug?: string;
};

const RECENT_RESOURCE_SCAN_LIMIT = 80;
const RESOURCE_MODULE_SCAN_LIMIT = 500;

function normalizeResourceSearchLimit(raw: unknown): number {
  const parsed = Math.floor(Number(raw ?? 10));
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(1, Math.min(20, parsed));
}

function tokenizeResourceQuery(raw: unknown): string[] {
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

function scoreResource(row: CommunityResourceLike, tokens: string[]): number {
  const title = String(row.title ?? "").toLowerCase();
  const body = String(row.bodyMd ?? "").toLowerCase();
  const url = String(row.url ?? "").toLowerCase();
  if (tokens.length === 0 || !tokens.every((token) => `${title}\n${body}\n${url}`.includes(token))) {
    return 0;
  }
  let score = 1;
  for (const token of tokens) {
    if (title.includes(token)) score += 3;
    if (body.includes(token)) score += 1;
    if (url.includes(token)) score += 0.5;
  }
  if (row.pinned) score += 0.5;
  return Number(score.toFixed(3));
}

function resourceSnippet(row: CommunityResourceLike, tokens: string[]): string | null {
  const source = String(row.bodyMd ?? row.url ?? row.title ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!source) return null;
  const lower = source.toLowerCase();
  const firstIndex = tokens
    .map((token) => lower.indexOf(token))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, firstIndex - 120);
  return `${start > 0 ? "..." : ""}${source.slice(start, start + 420)}${
    start + 420 < source.length ? "..." : ""
  }`;
}

async function mapResourceEvidenceItem(args: {
  ctx: any;
  community: CommunityRow;
  resource: CommunityResourceLike;
  module: CommunityResourceModuleLike;
  score: number | null;
  source: "recent" | "archive";
  tokens?: string[];
  userIdCache?: Map<string, string | null>;
}) {
  const resourceId = normalizeIdValue(args.resource._id);
  const ref = buildCommunityResourceEvidenceRef(resourceId);
  const directory = buildCommunityResourceDirectoryFields({
    communityId: normalizeIdValue(args.community._id),
    moduleId: normalizeIdValue(args.module._id),
    moduleName: args.module.name,
    resourceId,
    resourceTitle: args.resource.title,
    resourceRole: args.resource.role,
  });
  const slug = String(args.community.slug ?? "").trim();
  const path = buildCommunityResourceSemanticDocumentPath({
    title: args.resource.title,
    ref,
    directoryUri: directory.directory_uri,
    directoryPath: directory.directory_path,
  });
  const recordedByUserId = args.resource.createdByUserId
    ? await resolvePublicUserId(
        args.ctx,
        args.resource.createdByUserId,
        args.userIdCache,
      )
    : null;
  return {
    ref,
    source_type: "resource" as const,
    source_id: resourceId,
    resource_id: resourceId,
    title: args.resource.title,
    path,
    directory_path: directory.directory_path,
    directory_uri: directory.directory_uri,
    url: args.resource.url ?? null,
    snippet: resourceSnippet(args.resource, args.tokens ?? []),
    lineage: deriveCommunityResourceLineageEnvelope({
      communityId: normalizeIdValue(args.community._id),
      resourceId,
      recordedByUserId,
    }),
    created_at: toIsoString(args.resource.createdAt),
    updated_at: toIsoString(args.resource.updatedAt),
    score: args.score,
    retrieval_source: args.source,
    deep_link: slug
      ? `/c/${encodeURIComponent(slug)}/resources?evidence=${encodeURIComponent(ref)}`
      : null,
  };
}

export const searchRecentCommunityResourceEvidenceInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    query: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: args.userId });
    const community = (await ctx.db.get(args.communityId)) as CommunityRow | null;
    if (!community) throw new Error("community_not_found");
    const modules = (await ctx.db
      .query("communityResourceModules" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .take(RESOURCE_MODULE_SCAN_LIMIT)) as CommunityResourceModuleLike[];
    const liveModules = modules.filter(communityResourceModuleIsLive);
    const moduleById = new Map(
      liveModules.map((module) => [normalizeIdValue(module._id), module]),
    );
    const recent = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId))
      .order("desc")
      .take(RECENT_RESOURCE_SCAN_LIMIT)) as CommunityResourceLike[];
    // Lessons sold through an offer the member doesn't have stay out of answers.
    const paid = await readCommunityPaidLockedLessonIds(ctx, args.communityId, args.userId);
    const visible = recent.filter((row) =>
      communityResourceIsLiveModulePage(row, new Set(moduleById.keys())) && !paid.has(normalizeIdValue(row._id)),
    );
    const hydrated = await Promise.all(
      visible.map(async (row) => (await hydrateCommunityResourceBody(ctx, row)) ?? row),
    );
    const tokens = tokenizeResourceQuery(args.query);
    const rankedMatches = hydrated
      .map((resource) => ({
        resource,
        module: moduleById.get(normalizeIdValue(resource.moduleId)),
        score: scoreResource(resource, tokens),
      }))
      .filter(
        (candidate): candidate is typeof candidate & { module: CommunityResourceModuleLike } =>
          Boolean(candidate.module && candidate.score > 0),
      )
      .sort((a, b) => b.score - a.score || b.resource.updatedAt - a.resource.updatedAt);
    const limit = normalizeResourceSearchLimit(args.limit);
    const userIdCache = new Map<string, string | null>();
    const matches = await Promise.all(
      rankedMatches.slice(0, limit).map((candidate) =>
        mapResourceEvidenceItem({
          ctx,
          community,
          resource: candidate.resource,
          module: candidate.module,
          score: candidate.score,
          source: "recent",
          tokens,
          userIdCache,
        }),
      ),
    );
    return {
      community: {
        id: normalizeIdValue(community._id),
        slug: String(community.slug ?? "").trim() || null,
        name: String(community.name ?? "").trim() || "Community",
      },
      matches,
      truncated: rankedMatches.length > limit,
    };
  },
});

export const searchCommunityResourceEvidenceInternal = internalAction({
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
    if (!query) throw new Error("community_resource_search_query_required");
    const limit = normalizeResourceSearchLimit(args.limit);
    const recent = (await ctx.runQuery(
      (internal as any).communityResourceEvidence.searchRecentCommunityResourceEvidenceInternal,
      { userId, communityId: args.communityId, query, limit },
    )) as {
      community: Record<string, unknown>;
      matches: Array<Record<string, unknown>>;
      truncated: boolean;
    };
    const matches = recent.matches;
    const resultRefs = matches.map((match) => String(match.ref ?? "")).filter(Boolean);
    const retrievalId: any = await ctx.runMutation(
      (internal as any).communityEvidenceAudit.recordCommunityEvidenceRetrievalInternal,
      {
        communityId: args.communityId,
        userId,
        surface: args.surface,
        capability: "community_resources_search",
        resultRefs,
      },
    );
    return {
      ok: true,
      kind: "community_resources_search",
      community: recent.community,
      query,
      matches,
      truncated: recent.truncated,
      retrieval_id: normalizeIdValue(retrievalId),
      diagnostics: {
        version: 2,
        source: "community_resources",
        strategy: "bounded_lexical",
      },
    };
  },
});

export const readCommunityResourceEvidenceForToolInternal = internalAction({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    ref: v.string(),
    offset: v.optional(v.number()),
    limit: v.optional(v.number()),
    surface: communityEvidenceSurfaceValidator,
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const userId = await resolveTrustedCommunityEvidenceUserId({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const payload = (await ctx.runQuery(
      (internal as any).communityResources.readCommunityResourceDirectoryInternal,
      {
        userId,
        communityId: args.communityId,
        ref: truncateText(args.ref, 1024),
        offset: args.offset,
        limit: args.limit,
      },
    )) as Record<string, any>;
    if (payload?.ok !== true) return payload;
    const canonicalRef = String(payload?.resource?.ref ?? "").trim();
    if (!parseCommunityResourceEvidenceRef(canonicalRef)) {
      throw new Error("community_resource_evidence_ref_invalid");
    }
    const retrievalId: any = await ctx.runMutation(
      (internal as any).communityEvidenceAudit.recordCommunityEvidenceRetrievalInternal,
      {
        communityId: args.communityId,
        userId,
        surface: args.surface,
        capability: "community_resource_read",
        resultRefs: [canonicalRef],
      },
    );
    return { ...payload, retrieval_id: normalizeIdValue(retrievalId) };
  },
});

