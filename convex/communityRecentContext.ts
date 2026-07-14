import { internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityLike,
  type CommunityResourceModuleLike,
  type CommunityResourceLike,
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
  normalizeIdValue,
  normalizeResourceRole,
  normalizeResourceStatus,
  requireCommunityChatAccess,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import {
  buildCommunityInteractionEvidenceRef,
  communityInteractionVisibilityIsEvidenceReadable,
} from "../shared/communityEvidenceContract";

type FeedPostRow = {
  _id: any;
  communityId: any;
  authorLabel: string;
  type: "observation" | "recommendation" | "action";
  title?: string;
  body: string;
  evidence?: string[];
  status: "live" | "hidden";
  createdAt: number;
  updatedAt: number;
};

type RecentContextSourceType = "interaction" | "ai_feed" | "resource";

type RecentContextItem = {
  source_type: RecentContextSourceType;
  source_id: string;
  title: string | null;
  snippet: string;
  created_at: string;
  score: number | null;
  author_label?: string | null;
  url?: string | null;
  post_type?: "observation" | "recommendation" | "action" | null;
  resource_type?: string | null;
  resource_role?: "page" | "source" | null;
  resource_status?: "draft" | "review" | "published" | "processing" | "failed" | null;
};

const INTERACTION_ROOT_WINDOW_LIMIT = 24;
const INTERACTION_REPLY_WINDOW_LIMIT = 48;
const AI_FEED_WINDOW_LIMIT = 12;
const RESOURCE_WINDOW_LIMIT = 12;
const RESOURCE_SCAN_LIMIT = 48;
const RECENT_CONTEXT_LIMIT = 12;

function normalizeQueryText(raw: unknown): string {
  return String(raw ?? "").trim().slice(0, 240);
}

function tokenizeQuery(raw: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const token of raw
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((value) => value.trim())
    .filter((value) => value.length >= 2)) {
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
    if (tokens.length >= 16) break;
  }
  return tokens;
}

function truncateText(raw: unknown, maxLen: number): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  return value.length <= maxLen ? value : `${value.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

function scoreText(snippet: string, tokens: string[]): number {
  const normalized = snippet.toLowerCase();
  if (tokens.length === 0) return 0.5;
  let matches = 0;
  for (const token of tokens) {
    if (normalized.includes(token)) matches += 1;
  }
  if (matches <= 0) return 0;
  return Number((matches / tokens.length).toFixed(4));
}

type InteractionContextRow = {
  _id: any;
  communityId: any;
  rootId?: any;
  actorType: "human" | "personal_agent" | "community_agent" | "system";
  actorUserId?: any;
  actorAgentKey?: string;
  status: "live" | "hidden" | "deleted";
  visibilityScope: "private" | "admin" | "community" | "public";
  title?: string;
  contentSummary: string;
  createdAt: number;
};

function interactionAuthorLabel(row: InteractionContextRow): string {
  if (row.actorType === "human") {
    return row.actorUserId ? `member:${String(row.actorUserId)}` : "member";
  }
  return row.actorAgentKey ? `${row.actorType}:${row.actorAgentKey}` : row.actorType;
}

async function listRecentInteractionItems(args: {
  ctx: any;
  communityId: any;
  tokens: string[];
}): Promise<{ items: RecentContextItem[]; considered: number }> {
  const [roots, replies] = (await Promise.all([
    args.ctx.db
      .query("communityInteractionRoots" as any)
      .withIndex("by_community_status_createdAt", (q: any) =>
        q.eq("communityId", args.communityId).eq("status", "live"),
      )
      .order("desc")
      .take(INTERACTION_ROOT_WINDOW_LIMIT),
    args.ctx.db
      .query("communityInteractionReplies" as any)
      .withIndex("by_community_status_createdAt", (q: any) =>
        q.eq("communityId", args.communityId).eq("status", "live"),
      )
      .order("desc")
      .take(INTERACTION_REPLY_WINDOW_LIMIT),
  ])) as [InteractionContextRow[], InteractionContextRow[]];
  const readableRoots = new Map(
    roots
      .filter((root) => communityInteractionVisibilityIsEvidenceReadable(root.visibilityScope))
      .map((root) => [String(root._id), root]),
  );
  for (const rootId of new Set(replies.map((reply) => String(reply.rootId ?? "")).filter(Boolean))) {
    if (readableRoots.has(rootId)) continue;
    const root = (await args.ctx.db.get(rootId as any)) as InteractionContextRow | null;
    if (
      root?.status === "live" &&
      normalizeIdValue(root.communityId) === normalizeIdValue(args.communityId) &&
      communityInteractionVisibilityIsEvidenceReadable(root.visibilityScope)
    ) {
      readableRoots.set(rootId, root);
    }
  }
  const rootItems = Array.from(readableRoots.values()).map((root) => {
    const snippet = truncateText(root.contentSummary, 280);
    return {
      source_type: "interaction" as const,
      source_id: buildCommunityInteractionEvidenceRef({ objectType: "root", objectId: String(root._id) }),
      title: String(root.title ?? "").trim() || null,
      snippet,
      created_at: toIsoString(root.createdAt),
      score: scoreText(`${root.title ?? ""} ${snippet}`, args.tokens),
      author_label: interactionAuthorLabel(root),
    };
  });
  const replyItems = replies
    .filter(
      (reply) =>
        communityInteractionVisibilityIsEvidenceReadable(reply.visibilityScope) &&
        readableRoots.has(String(reply.rootId ?? "")),
    )
    .map((reply) => {
      const root = readableRoots.get(String(reply.rootId))!;
      const snippet = truncateText(reply.contentSummary, 280);
      return {
        source_type: "interaction" as const,
        source_id: buildCommunityInteractionEvidenceRef({ objectType: "reply", objectId: String(reply._id) }),
        title: String(root.title ?? "").trim() || null,
        snippet,
        created_at: toIsoString(reply.createdAt),
        score: scoreText(snippet, args.tokens),
        author_label: interactionAuthorLabel(reply),
      };
    });
  return { items: [...rootItems, ...replyItems], considered: roots.length + replies.length };
}

async function listRecentAiFeedItems(args: {
  ctx: any;
  communityId: any;
  tokens: string[];
}): Promise<{ items: RecentContextItem[]; considered: number }> {
  const rows = (await args.ctx.db
    .query("communityAiFeedPosts" as any)
    .withIndex("by_community_status_createdAt", (q: any) =>
      q.eq("communityId", args.communityId).eq("status", "live"),
    )
    .order("desc")
    .take(AI_FEED_WINDOW_LIMIT)) as FeedPostRow[];
  const items = rows.map((row) => {
    const snippetSource = [row.title, row.body, ...(Array.isArray(row.evidence) ? row.evidence : [])]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join(" — ");
    const snippet = truncateText(snippetSource || row.body, 280);
    return {
      source_type: "ai_feed" as const,
      source_id: String(row._id),
      title: String(row.title ?? "").trim() || null,
      snippet,
      created_at: toIsoString(row.createdAt),
      score: scoreText(snippet, args.tokens),
      author_label: String(row.authorLabel ?? "").trim() || "Agent",
      post_type: row.type,
    };
  });
  return { items, considered: rows.length };
}

async function listRecentResourceItems(args: {
  ctx: any;
  communityId: any;
  tokens: string[];
}): Promise<{ items: RecentContextItem[]; considered: number }> {
  const modules = (await args.ctx.db
    .query("communityResourceModules" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
    .collect()) as CommunityResourceModuleLike[];
  const liveModuleIds = new Set(
    modules
      .filter(communityResourceModuleIsLive)
      .map((module) => String(module._id)),
  );
  const recentRows = (await args.ctx.db
    .query("communityResources" as any)
    .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId))
    .order("desc")
    .take(RESOURCE_SCAN_LIMIT)) as CommunityResourceLike[];
  const uniqueRows = new Map<string, CommunityResourceLike>();
  for (const row of recentRows) {
    uniqueRows.set(String(row._id), row);
  }
  const sorted = Array.from(uniqueRows.values())
    .filter((row) => communityResourceIsLiveModulePage(row, liveModuleIds))
    .sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return Boolean(a.pinned) ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
  const items = sorted.map((row) => {
    const snippetSource = [row.title, row.bodyMd ?? "", row.url ?? ""].filter(Boolean).join(" — ");
    const snippet = truncateText(snippetSource, 280);
    return {
      source_type: "resource" as const,
      source_id: String(row._id),
      title: row.title,
      snippet,
      created_at: toIsoString(row.createdAt),
      score: scoreText(snippet, args.tokens),
      url: row.url ?? null,
      resource_type: String(row.type ?? "").trim().toLowerCase() || null,
      resource_role: normalizeResourceRole(row.role),
      resource_status: normalizeResourceStatus(row.status),
    };
  }).slice(0, RESOURCE_WINDOW_LIMIT);
  return { items, considered: sorted.length };
}

function selectRecentContextItems(allItems: RecentContextItem[]): { items: RecentContextItem[]; fallbackUsed: boolean } {
  const matched = allItems
    .filter((item) => Number(item.score ?? 0) > 0)
    .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0) || Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, RECENT_CONTEXT_LIMIT);
  if (matched.length > 0) {
    return { items: matched, fallbackUsed: false };
  }
  return {
    items: allItems
      .slice()
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, RECENT_CONTEXT_LIMIT),
    fallbackUsed: true,
  };
}

function mapIdentity(community: CommunityLike) {
  return {
    community_id: String(community._id),
    name: String(community.name ?? "").trim() || null,
    slug: String(community.slug ?? "").trim() || null,
    one_liner: String(community.oneLiner ?? "").trim() || null,
    about: String(community.about ?? "").trim() || null,
  };
}

async function readCommunityRecentContextForUser(args: {
  ctx: any;
  userId: any;
  communityId: any;
  query: string;
}) {
  const { ctx, userId, communityId } = args;
  const startedAt = Date.now();
  const { community } = await requireCommunityChatAccess({
    ctx,
    communityId,
    userId,
  });
  const queryText = normalizeQueryText(args.query);
  const tokens = tokenizeQuery(queryText);

  let interactionFetchOk = false;
  let aiFeedFetchOk = false;
  let resourceFetchOk = false;
  let interactionItems: RecentContextItem[] = [];
  let aiFeedItems: RecentContextItem[] = [];
  let resourceItems: RecentContextItem[] = [];
  let interactionConsidered = 0;
  let aiFeedConsidered = 0;
  let resourceConsidered = 0;

  const [interactionResult, aiFeedResult, resourceResult] = await Promise.allSettled([
    listRecentInteractionItems({ ctx, communityId, tokens }),
    listRecentAiFeedItems({ ctx, communityId, tokens }),
    listRecentResourceItems({ ctx, communityId, tokens }),
  ]);

  if (interactionResult.status === "fulfilled") {
    interactionFetchOk = true;
    interactionItems = interactionResult.value.items;
    interactionConsidered = interactionResult.value.considered;
  }
  if (aiFeedResult.status === "fulfilled") {
    aiFeedFetchOk = true;
    aiFeedItems = aiFeedResult.value.items;
    aiFeedConsidered = aiFeedResult.value.considered;
  }
  if (resourceResult.status === "fulfilled") {
    resourceFetchOk = true;
    resourceItems = resourceResult.value.items;
    resourceConsidered = resourceResult.value.considered;
  }

  const selected = selectRecentContextItems([...interactionItems, ...aiFeedItems, ...resourceItems]);
  const retrievalLatencyMs = Math.max(0, Date.now() - startedAt);

  return {
    ok: true,
    community_id: String(communityId),
    identity: mapIdentity(community),
    retrieved_at: toIsoString(Date.now()),
    query: queryText,
    source_window: {
      interaction_items_considered: interactionConsidered,
      ai_feed_items_considered: aiFeedConsidered,
      resources_considered: resourceConsidered,
    },
    source_counts: {
      interaction: selected.items.filter((item) => item.source_type === "interaction").length,
      ai_feed: selected.items.filter((item) => item.source_type === "ai_feed").length,
      resource: selected.items.filter((item) => item.source_type === "resource").length,
    },
    recent_context: selected.items,
    diagnostics: {
      version: 1,
      retrieval_version: "recent_context_v2",
      retrieval_latency_ms: retrievalLatencyMs,
      retrieved_items_used: selected.items.length,
      fallback_used: selected.fallbackUsed,
      interaction_fetch_ok: interactionFetchOk,
      ai_feed_fetch_ok: aiFeedFetchOk,
      resource_fetch_ok: resourceFetchOk,
    },
  };
}

export const readCommunityRecentContextInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    return await readCommunityRecentContextForUser({
      ctx,
      userId: args.userId,
      communityId: args.communityId,
      query: args.query,
    });
  },
});

export const readCommunityRecentContext = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    return await readCommunityRecentContextForUser({
      ctx,
      userId,
      communityId: args.communityId,
      query: args.query,
    });
  },
});
