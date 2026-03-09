import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityChatMessageLike,
  type CommunityChatThreadLike,
  type CommunityLike,
  type CommunityResourceLike,
  requireCommunityChatAccess,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";

type CommunityAiFeedPostLike = {
  _id: any;
  communityId: any;
  title?: string;
  body: string;
  status?: string;
  score?: number;
  createdAt: number;
  updatedAt: number;
};

const CHAT_SCAN_LIMIT = 150;
const CHAT_SIGNAL_LIMIT = 6;
const RESOURCE_LIMIT = 5;
const RANKED_LIMIT = 5;
const REPEATED_QUESTION_LIMIT = 5;
const DEFAULT_COMPILED_LIMIT = 12;
const MAX_COMPILED_LIMIT = 24;
const RANKED_INSIGHT_THRESHOLD = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeResearchText(raw: unknown, maxLen: number): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  return value.slice(0, maxLen);
}

function tokenizeResearchQuery(raw: string): string[] {
  const tokens = raw
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    deduped.push(token);
    if (deduped.length >= 16) break;
  }
  return deduped;
}

function scoreResearchSnippet(snippet: string, tokens: string[]): number {
  const normalizedSnippet = snippet.toLowerCase();
  if (tokens.length === 0) return 0.5;
  let matches = 0;
  for (const token of tokens) {
    if (normalizedSnippet.includes(token)) matches += 1;
  }
  if (matches <= 0) return 0;
  return Number((matches / tokens.length).toFixed(4));
}

function extractMessageText(contentJson: unknown): string {
  if (typeof contentJson === "string") return contentJson.trim();
  if (contentJson && typeof contentJson === "object" && !Array.isArray(contentJson)) {
    const text = String((contentJson as Record<string, unknown>).text ?? "").trim();
    if (text) return text;
  }
  return "";
}

function isPotentialQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.endsWith("?")) return true;
  return /^(how|what|why|when|where|who|can|could|should|would|is|are|do|does|did)\b/i.test(trimmed);
}

function normalizeQuestionSignature(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function decayForPost(post: CommunityAiFeedPostLike, nowMs: number): number {
  return Math.max(0, Math.floor((Math.max(nowMs, post.createdAt) - post.createdAt) / DAY_MS));
}

function effectiveScoreForPost(post: CommunityAiFeedPostLike, nowMs: number): number {
  return Math.max(0, Number(post.score ?? 0) - decayForPost(post, nowMs));
}

function normalizeCompiledLimit(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_COMPILED_LIMIT;
  return Math.max(1, Math.min(MAX_COMPILED_LIMIT, Math.floor(value)));
}

function applyCompiledItemLimit<T>(args: {
  limit: number;
  sections: Array<{ key: string; items: T[] }>;
}): Record<string, T[]> {
  const normalizedLimit = normalizeCompiledLimit(args.limit);
  const buckets = new Map<string, T[]>(args.sections.map((section) => [section.key, []]));
  const cursors = new Map<string, number>(args.sections.map((section) => [section.key, 0]));
  let remaining = normalizedLimit;

  while (remaining > 0) {
    let advanced = false;
    for (const section of args.sections) {
      if (remaining <= 0) break;
      const cursor = cursors.get(section.key) ?? 0;
      if (cursor >= section.items.length) continue;
      buckets.get(section.key)!.push(section.items[cursor]!);
      cursors.set(section.key, cursor + 1);
      remaining -= 1;
      advanced = true;
    }
    if (!advanced) break;
  }

  return Object.fromEntries(args.sections.map((section) => [section.key, buckets.get(section.key) ?? []]));
}

async function listCommunityChatThreadsForCommunity(
  ctx: any,
  communityId: any,
): Promise<CommunityChatThreadLike[]> {
  const rows = (await ctx.db
    .query("communityChatThreads")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .collect()) as CommunityChatThreadLike[];
  return rows
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt || a.updatedAt - b.updatedAt);
}

async function getCanonicalCommunityChatThread(
  ctx: any,
  communityId: any,
): Promise<CommunityChatThreadLike | null> {
  const rows = await listCommunityChatThreadsForCommunity(ctx, communityId);
  return rows[0] ?? null;
}

function buildSummary(args: {
  repeatedQuestions: Array<{ label: string }>;
  relevantResourcesCount: number;
  rankedInsightsCount: number;
  recentChatSignalsCount: number;
}): string | null {
  const parts: string[] = [];
  if (args.repeatedQuestions.length > 0) {
    parts.push(`Repeated member questions are emerging around "${args.repeatedQuestions[0]!.label}".`);
  }
  if (args.relevantResourcesCount > 0) {
    parts.push(`${args.relevantResourcesCount} relevant resources are available for grounding.`);
  }
  if (args.rankedInsightsCount > 0) {
    parts.push(`${args.rankedInsightsCount} ranked insights are already validated by community signal.`);
  }
  if (parts.length === 0 && args.recentChatSignalsCount > 0) {
    parts.push(`Recent community chat provides ${args.recentChatSignalsCount} live signals.`);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

export const readCompiledCommunityContext = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    query: v.string(),
    limit: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    const nowMs = args.nowMs ?? startedAt;
    const compiledLimit = normalizeCompiledLimit(args.limit);
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;

    const community = (await ctx.db.get(args.communityId)) as CommunityLike | null;
    if (!community) {
      return {
        ok: false,
        reason_code: "community_not_found",
        message: "community_not_found",
      };
    }

    try {
      await requireCommunityChatAccess({
        ctx,
        communityId: args.communityId,
        userId: args.userId,
      });
    } catch {
      return {
        ok: false,
        reason_code: "not_entitled",
        message: "community_entitlement_required",
      };
    }

    const normalizedQuery = normalizeResearchText(args.query, 240);
    const queryTokens = tokenizeResearchQuery(normalizedQuery);

    const profileNameCache = new Map<string, string>();
    const resolveSenderDisplay = async (userIdRaw: unknown): Promise<string> => {
      const userIdText = String(userIdRaw ?? "").trim();
      if (!userIdText) return "member";
      const cached = profileNameCache.get(userIdText);
      if (cached) return cached;
      const user = await ctx.db.get(userIdText as any);
      const display = String((user as any)?.displayName ?? "").trim() || "member";
      profileNameCache.set(userIdText, display);
      return display;
    };

    const thread = await getCanonicalCommunityChatThread(ctx, args.communityId);
    const [resources, feedPosts, chatMessages] = await Promise.all([
      ctx.db
        .query("communityResources")
        .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
        .collect() as Promise<CommunityResourceLike[]>,
      ctx.db
        .query("communityAiFeedPosts")
        .withIndex("by_community_status_createdAt", (q: any) =>
          q.eq("communityId", args.communityId).eq("status", "live"),
        )
        .collect() as Promise<CommunityAiFeedPostLike[]>,
      thread
        ? (ctx.db
            .query("communityChatMessages")
            .withIndex("by_thread_seq", (q: any) => q.eq("threadId", thread._id))
            .order("desc")
            .take(CHAT_SCAN_LIMIT) as Promise<CommunityChatMessageLike[]>)
        : Promise.resolve([] as CommunityChatMessageLike[]),
    ]);

    const recentChatSignalsAll = (
      await Promise.all(
        chatMessages
          .map(async (message) => {
            const snippet = normalizeResearchText(extractMessageText(message.contentJson), 260);
            if (!snippet) return null;
            const score = scoreResearchSnippet(snippet, queryTokens);
            if (queryTokens.length > 0 && score <= 0) return null;
            return {
              message_id: String(message._id),
              sender_label: await resolveSenderDisplay(message.senderUserId),
              snippet,
              score,
              created_at: toIsoString(message.createdAt),
              _createdAtMs: message.createdAt,
            };
          }),
      )
    )
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => b.score - a.score || b._createdAtMs - a._createdAtMs)
      .slice(0, CHAT_SIGNAL_LIMIT)
      .map(({ _createdAtMs, ...row }) => row);

    const questionBuckets = new Map<
      string,
      { label: string; count: number; supportingIds: string[]; latestMs: number }
    >();
    for (const message of chatMessages) {
      const text = normalizeResearchText(extractMessageText(message.contentJson), 220);
      if (!isPotentialQuestion(text)) continue;
      const signature = normalizeQuestionSignature(text);
      if (!signature) continue;
      const existing = questionBuckets.get(signature);
      if (existing) {
        existing.count += 1;
        if (existing.supportingIds.length < 4) existing.supportingIds.push(String(message._id));
        existing.latestMs = Math.max(existing.latestMs, message.createdAt);
      } else {
        questionBuckets.set(signature, {
          label: text.slice(0, 160),
          count: 1,
          supportingIds: [String(message._id)],
          latestMs: message.createdAt,
        });
      }
    }
    const repeatedQuestionsAll = Array.from(questionBuckets.values())
      .filter((bucket) => bucket.count >= 2)
      .sort((a, b) => b.count - a.count || b.latestMs - a.latestMs)
      .slice(0, REPEATED_QUESTION_LIMIT)
      .map((bucket) => ({
        label: bucket.label,
        count_hint: bucket.count,
        supporting_chat_message_ids: bucket.supportingIds,
      }));

    const relevantResourcesAll = resources
      .map((resource) => {
        const title = normalizeResearchText(resource.title, 100) || "Community resource";
        const snippet = normalizeResearchText(resource.bodyMd ?? resource.title ?? "", 220) || title;
        const whyRelevant =
          queryTokens.length > 0
            ? scoreResearchSnippet(`${title}\n${snippet}`, queryTokens) > 0
              ? "Matches the current community question."
              : null
            : null;
        const score = scoreResearchSnippet(`${title}\n${snippet}`, queryTokens);
        if (queryTokens.length > 0 && score <= 0) return null;
        return {
          resource_id: String(resource._id),
          title,
          why_relevant: whyRelevant,
          url: resource.url ?? null,
          snippet,
          score,
          _createdAtMs: resource.createdAt,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => b.score - a.score || b._createdAtMs - a._createdAtMs)
      .slice(0, RESOURCE_LIMIT)
      .map(({ _createdAtMs, ...row }) => row);

    const rankedInsightsAll = feedPosts
      .map((post) => {
        const title = normalizeResearchText(post.title ?? "AI feed item", 100) || "AI feed item";
        const body = normalizeResearchText(post.body ?? "", 220);
        if (!body) return null;
        const effectiveScore = effectiveScoreForPost(post, nowMs);
        if (effectiveScore < RANKED_INSIGHT_THRESHOLD) return null;
        if (queryTokens.length > 0 && scoreResearchSnippet(`${title}\n${body}`, queryTokens) <= 0) return null;
        return {
          post_id: String(post._id),
          title,
          body,
          effective_score: effectiveScore,
          created_at: toIsoString(post.createdAt),
          _createdAtMs: post.updatedAt ?? post.createdAt,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => b.effective_score - a.effective_score || b._createdAtMs - a._createdAtMs)
      .slice(0, RANKED_LIMIT)
      .map(({ _createdAtMs, ...row }) => row);

    const limited = applyCompiledItemLimit({
      limit: compiledLimit,
      sections: [
        { key: "rankedInsights", items: rankedInsightsAll },
        { key: "relevantResources", items: relevantResourcesAll },
        { key: "repeatedQuestions", items: repeatedQuestionsAll },
        { key: "recentChatSignals", items: recentChatSignalsAll },
      ],
    }) as {
      rankedInsights: typeof rankedInsightsAll;
      relevantResources: typeof relevantResourcesAll;
      repeatedQuestions: typeof repeatedQuestionsAll;
      recentChatSignals: typeof recentChatSignalsAll;
    };

    const rankedInsights = limited.rankedInsights;
    const relevantResources = limited.relevantResources;
    const repeatedQuestions = limited.repeatedQuestions;
    const recentChatSignals = limited.recentChatSignals;

    const summary = buildSummary({
      repeatedQuestions,
      relevantResourcesCount: relevantResources.length,
      rankedInsightsCount: rankedInsights.length,
      recentChatSignalsCount: recentChatSignals.length,
    });

    const compiledItemsUsed =
      recentChatSignals.length + relevantResources.length + rankedInsights.length;
    const retrievalLatencyMs = Math.max(0, Date.now() - startedAt);

    return {
      ok: true,
      compiled: {
        community_id: String(args.communityId),
        compiled_at: toIsoString(nowMs),
        source_window: {
          chat_messages_considered: chatMessages.length,
          resources_considered: resources.length,
          ranked_feed_items_considered: feedPosts.filter(
            (post) => effectiveScoreForPost(post, nowMs) >= RANKED_INSIGHT_THRESHOLD,
          ).length,
        },
        summary,
        repeated_questions: repeatedQuestions,
        relevant_resources: relevantResources,
        ranked_insights: rankedInsights,
        recent_chat_signals: recentChatSignals,
        diagnostics: {
          version: 1,
          fallback_used: false,
          compiler_latency_ms: retrievalLatencyMs,
        },
      },
      diagnostics: {
        attempted: true,
        compiled_fetch_ok: true,
        compiled_items_used: compiledItemsUsed,
        compile_version: 1,
        fallback_used: false,
        chat_fetch_ok: true,
        ai_feed_fetch_ok: true,
        resource_fetch_ok: true,
        retrieval_latency_ms: retrievalLatencyMs,
        failure_class: "none",
      },
    };
  },
});
