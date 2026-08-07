import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  INTERACTION_EMBED_REFRESH_LEASE_MS,
  INTERACTION_EMBED_RESOLVER_VERSION,
  interactionXStatusIdentity,
} from "../shared/interactionEmbedPreviewContract";

const DEFAULT_REFRESH_BATCH_SIZE = 50;
const MAX_REFRESH_BATCH_SIZE = 100;
const MAX_REFRESH_SCAN_SIZE = 500;
const REFRESHABLE_PROVIDERS = [
  "x",
  "x.com",
  "twitter.com",
  "loom.com",
  "youtube.com",
  "youtube-nocookie.com",
  "youtu.be",
] as const;
const PROVIDER_REFRESHABLE_STATUSES = ["pending", "ready"] as const;

function refreshableHttpsSource(raw: unknown): URL | null {
  try {
    const parsed = new URL(String(raw ?? ""));
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      (parsed.port && parsed.port !== "443")
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

function refreshableSourceMatchesProvider(raw: unknown, provider: string): boolean {
  const parsed = refreshableHttpsSource(raw);
  if (!parsed) return false;
  try {
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/\.+$/, "");
    if (provider === "x" || provider === "x.com" || provider === "twitter.com") {
      return interactionXStatusIdentity(parsed.toString()) !== null;
    }
    return host === provider;
  } catch {
    return false;
  }
}

export const scheduleDueInteractionEmbedPreviewRefresh = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const requestedLimit = Math.floor(Number(args.limit ?? DEFAULT_REFRESH_BATCH_SIZE));
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(requestedLimit, MAX_REFRESH_BATCH_SIZE))
      : DEFAULT_REFRESH_BATCH_SIZE;
    const nowMs = Date.now();
    let scanned = 0;
    let scheduled = 0;

    const failedRows = await ctx.db
      .query("communityInteractionEmbeds")
      .withIndex("by_status_nextRefreshAt", (query) => query.eq("status", "failed"))
      .take(Math.min(MAX_REFRESH_SCAN_SIZE, limit * 5));
    for (const embed of failedRows) {
      scanned += 1;
      const sourceUrl = embed.sourceUrl ?? embed.normalizedSourceUrl;
      if (embed.embedKind !== "link" || !refreshableHttpsSource(sourceUrl)) continue;
      const dueByVersion =
        embed.resolverVersion !== INTERACTION_EMBED_RESOLVER_VERSION &&
        typeof embed.nextRefreshAt !== "number";
      const dueByTime = typeof embed.nextRefreshAt !== "number" || embed.nextRefreshAt <= nowMs;
      if (!dueByVersion && !dueByTime) break;
      await ctx.db.patch(embed._id, {
        nextRefreshAt: nowMs + INTERACTION_EMBED_REFRESH_LEASE_MS,
        updatedAt: nowMs,
      });
      await ctx.scheduler.runAfter(0, internal.communityInteractions.enrichInteractionEmbed, {
        embedId: String(embed._id),
        refresh: true,
      });
      scheduled += 1;
      if (scheduled >= limit) break;
    }

    for (const provider of REFRESHABLE_PROVIDERS) {
      for (const status of PROVIDER_REFRESHABLE_STATUSES) {
        if (scheduled >= limit) break;
        const rows = await ctx.db
          .query("communityInteractionEmbeds")
          .withIndex("by_provider_status_nextRefreshAt", (query) =>
            query.eq("provider", provider).eq("status", status),
          )
          .take(limit - scheduled);
        for (const embed of rows) {
          scanned += 1;
          if (
            embed.embedKind !== "link" ||
            !refreshableSourceMatchesProvider(embed.sourceUrl ?? embed.normalizedSourceUrl, provider)
          ) continue;
          const dueByVersion =
            embed.resolverVersion !== INTERACTION_EMBED_RESOLVER_VERSION &&
            typeof embed.nextRefreshAt !== "number";
          const dueByTime = typeof embed.nextRefreshAt !== "number" || embed.nextRefreshAt <= nowMs;
          if (!dueByVersion && !dueByTime) break;
          await ctx.db.patch(embed._id, {
            nextRefreshAt: nowMs + INTERACTION_EMBED_REFRESH_LEASE_MS,
            updatedAt: nowMs,
          });
          await ctx.scheduler.runAfter(0, internal.communityInteractions.enrichInteractionEmbed, {
            embedId: String(embed._id),
            refresh: status !== "pending",
          });
          scheduled += 1;
          if (scheduled >= limit) break;
        }
      }
      if (scheduled >= limit) break;
    }

    return { scanned, scheduled, limit };
  },
});
