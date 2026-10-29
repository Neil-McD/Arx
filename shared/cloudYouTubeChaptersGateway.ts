import { api } from "../convex/_generated/api";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { VideoChapter } from "./youtubeChapters";

// One request per video per page load; the server keeps them for everyone.
const loaded = new Map<string, Promise<VideoChapter[]>>();

export function loadCloudYouTubeChapters(session: unknown, videoId: string): Promise<VideoChapter[]> {
  const known = loaded.get(videoId);
  if (known) return known;
  const request = (async () => {
    const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
    return await client.action(api.youtubeChapters.loadYouTubeChapters, { authSubject, videoId }) as VideoChapter[];
  })().catch(() => {
    loaded.delete(videoId);
    return [];
  });
  loaded.set(videoId, request);
  return request;
}
