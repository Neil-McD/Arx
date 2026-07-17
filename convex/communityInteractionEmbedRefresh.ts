import { paginationOptsValidator } from "convex/server";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const INTERACTION_EMBED_RESOLVER_VERSION = 2;
const REFRESH_BATCH_DELAY_MS = 100;
const DEFAULT_REFRESH_BATCH_SIZE = 50;
const MAX_REFRESH_BATCH_SIZE = 100;
const SUPPORTED_SOURCE_HOSTS = new Set([
  "loom.com",
  "youtube.com",
  "youtube-nocookie.com",
  "youtu.be",
  "x.com",
  "twitter.com",
]);

function isSupportedSourceUrl(raw: unknown): boolean {
  try {
    const parsed = new URL(String(raw ?? ""));
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return parsed.protocol === "https:" && SUPPORTED_SOURCE_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

export const scheduleStaleInteractionEmbedPreviewRefresh = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const requestedBatchSize = Math.floor(Number(args.paginationOpts.numItems));
    const batchSize = Number.isFinite(requestedBatchSize)
      ? Math.max(1, Math.min(requestedBatchSize, MAX_REFRESH_BATCH_SIZE))
      : DEFAULT_REFRESH_BATCH_SIZE;
    const page = await ctx.db
      .query("communityInteractionEmbeds")
      .order("asc")
      .paginate({ cursor: args.paginationOpts.cursor, numItems: batchSize });
    let scheduled = 0;
    for (const embed of page.page) {
      if (
        embed.embedKind !== "link" ||
        (embed.status !== "ready" && embed.status !== "failed") ||
        embed.resolverVersion === INTERACTION_EMBED_RESOLVER_VERSION ||
        !isSupportedSourceUrl(embed.sourceUrl ?? embed.normalizedSourceUrl)
      ) {
        continue;
      }
      await ctx.scheduler.runAfter(0, internal.communityInteractions.enrichInteractionEmbed, {
        embedId: String(embed._id),
        refresh: true,
      });
      scheduled += 1;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        REFRESH_BATCH_DELAY_MS,
        internal.communityInteractionEmbedRefresh.scheduleStaleInteractionEmbedPreviewRefresh,
        {
          paginationOpts: {
            cursor: page.continueCursor,
            numItems: batchSize,
          },
        },
      );
    }
    return {
      complete: page.isDone,
      continue_cursor: page.continueCursor,
      scanned: page.page.length,
      scheduled,
    };
  },
});
