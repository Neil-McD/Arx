import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { isYouTubeVideoId, parseYouTubeChapters, youTubeDescriptionFromWatchPage, type VideoChapter } from "../shared/youtubeChapters";

// Chapters for a lesson's YouTube video, without the owner pasting anything
//. They come from the video's public description: with the
// YouTube Data API when YOUTUBE_API_KEY is set, otherwise from the watch page.
// One read serves every lesson and member for a day; a video without chapters
// is asked again after an hour, so chapters added on YouTube show up soon.

const FOUND_FRESH_MS = 24 * 60 * 60 * 1000;
const MISSING_FRESH_MS = 60 * 60 * 1000;

export const readYouTubeChaptersInternal = internalQuery({
  args: { authSubject: v.optional(v.string()), videoId: v.string() },
  handler: async (ctx, args) => {
    await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    const row = await ctx.db.query("youtubeVideoChapters").withIndex("by_video", (q) => q.eq("videoId", args.videoId)).unique();
    return row ? { chapters: row.chapters, found: row.found, fetchedAt: row.fetchedAt } : null;
  },
});

export const storeYouTubeChaptersInternal = internalMutation({
  args: {
    videoId: v.string(),
    chapters: v.array(v.object({ seconds: v.number(), time: v.string(), label: v.string() })),
    found: v.boolean(),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("youtubeVideoChapters").withIndex("by_video", (q) => q.eq("videoId", args.videoId)).unique();
    const value = { chapters: args.chapters, found: args.found, fetchedAt: args.fetchedAt };
    if (row) await ctx.db.patch(row._id, value);
    else await ctx.db.insert("youtubeVideoChapters", { videoId: args.videoId, ...value });
  },
});

async function fetchYouTubeDescription(videoId: string): Promise<string | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (key) {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("id", videoId);
    url.searchParams.set("key", key);
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (response.ok) {
      const data = await response.json() as { items?: Array<{ snippet?: { description?: string } }> };
      const description = data.items?.[0]?.snippet?.description;
      if (typeof description === "string") return description;
    }
  }
  const response = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`, {
    headers: { "accept-language": "en", cookie: "CONSENT=YES+1", "user-agent": "Mozilla/5.0 (compatible; Polynet lesson chapters)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  return youTubeDescriptionFromWatchPage(await response.text());
}

/** The video's chapters, or [] when it has none. Any signed-in member may ask: it's public. */
export const loadYouTubeChapters = action({
  args: { authSubject: v.optional(v.string()), videoId: v.string() },
  handler: async (ctx, args): Promise<VideoChapter[]> => {
    if (!isYouTubeVideoId(args.videoId)) return [];
    const cached = await ctx.runQuery(internal.youtubeChapters.readYouTubeChaptersInternal, args);
    const now = Date.now();
    if (cached && now - cached.fetchedAt < (cached.found ? FOUND_FRESH_MS : MISSING_FRESH_MS)) return cached.chapters;
    let description: string | null = null;
    try {
      description = await fetchYouTubeDescription(args.videoId);
    } catch {
      description = null;
    }
    // A failed read keeps the chapters already known.
    if (description === null) return cached?.chapters ?? [];
    const chapters = parseYouTubeChapters(description);
    await ctx.runMutation(internal.youtubeChapters.storeYouTubeChaptersInternal, {
      videoId: args.videoId, chapters, found: chapters.length > 0, fetchedAt: now,
    });
    return chapters;
  },
});
