import { internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityChatMessageLike,
  type CommunityChatThreadLike,
  type CommunityLike,
  type CommunityResourceModuleLike,
  type CommunityResourceLike,
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
  normalizeResourceRole,
  normalizeResourceStatus,
  requireCommunityChatAccess,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";

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

type RecentContextSourceType = "chat" | "ai_feed" | "resource";

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

const CHAT_WINDOW_LIMIT = 24;
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

function extractMessageText(contentJson: unknown): string {
  if (typeof contentJson === "string") return String(contentJson).trim();
  if (contentJson && typeof contentJson === "object" && !Array.isArray(contentJson)) {
    const text = String((contentJson as Record<string, unknown>).text ?? "").trim();
    if (text) return text;
  }
  return "";
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

async function getCanonicalChatThread(ctx: any, communityId: any): Promise<CommunityChatThreadLike | null> {
  const rows = (await ctx.db
    .query("communityChatThreads" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .collect()) as CommunityChatThreadLike[];
  return (
    rows
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt || a.updatedAt - b.updatedAt)[0] ?? null
  );
}

async function listRecentChatItems(args: {
  ctx: any;
  communityId: any;
  tokens: string[];
}): Promise<{ items: RecentContextItem[]; considered: number }> {
  const thread = await getCanonicalChatThread(args.ctx, args.communityId);
  if (!thread) return { items: [], considered: 0 };
  const rows = (await args.ctx.db
    .query("communityChatMessages" as any)
    .withIndex("by_thread_seq", (q: any) => q.eq("threadId", thread._id))
    .order("desc")
    .take(CHAT_WINDOW_LIMIT)) as CommunityChatMessageLike[];
  const userIdCache = new Map<string, string | null>();
  const items = await Promise.all(
    rows.map(async (row) => {
      const snippet = truncateText(extractMessageText(row.contentJson), 280);
      const senderId = row.senderUserId
        ? await resolvePublicUserId(args.ctx, row.senderUserId, userIdCache)
        : null;
      return {
        source_type: "chat" as const,
        source_id: String(row._id),
        title: null,
        snippet,
        created_at: toIsoString(row.createdAt),
        score: scoreText(snippet, args.tokens),
        author_label: senderId ? `member:${senderId}` : "member",
      };
    }),
  );
  return { items, considered: rows.length };
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

  let chatFetchOk = false;
  let aiFeedFetchOk = false;
  let resourceFetchOk = false;
  let chatItems: RecentContextItem[] = [];
  let aiFeedItems: RecentContextItem[] = [];
  let resourceItems: RecentContextItem[] = [];
  let chatConsidered = 0;
  let aiFeedConsidered = 0;
  let resourceConsidered = 0;

  const [chatResult, aiFeedResult, resourceResult] = await Promise.allSettled([
    listRecentChatItems({ ctx, communityId, tokens }),
    listRecentAiFeedItems({ ctx, communityId, tokens }),
    listRecentResourceItems({ ctx, communityId, tokens }),
  ]);

  if (chatResult.status === "fulfilled") {
    chatFetchOk = true;
    chatItems = chatResult.value.items;
    chatConsidered = chatResult.value.considered;
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

  const selected = selectRecentContextItems([...chatItems, ...aiFeedItems, ...resourceItems]);
  const retrievalLatencyMs = Math.max(0, Date.now() - startedAt);

  return {
    ok: true,
    community_id: String(communityId),
    identity: mapIdentity(community),
    retrieved_at: toIsoString(Date.now()),
    query: queryText,
    source_window: {
      chat_messages_considered: chatConsidered,
      ai_feed_items_considered: aiFeedConsidered,
      resources_considered: resourceConsidered,
    },
    source_counts: {
      chat: selected.items.filter((item) => item.source_type === "chat").length,
      ai_feed: selected.items.filter((item) => item.source_type === "ai_feed").length,
      resource: selected.items.filter((item) => item.source_type === "resource").length,
    },
    recent_context: selected.items,
    diagnostics: {
      version: 1,
      retrieval_version: "recent_context_v1",
      retrieval_latency_ms: retrievalLatencyMs,
      retrieved_items_used: selected.items.length,
      fallback_used: selected.fallbackUsed,
      chat_fetch_ok: chatFetchOk,
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
