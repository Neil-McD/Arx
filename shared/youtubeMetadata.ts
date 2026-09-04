export type YouTubeMetadata = { title: string; author: string };
const cache = new Map<string, Promise<YouTubeMetadata | null>>();

/** Public provider metadata only: never send message text, credentials, or provider HTML. */
export function loadYouTubeMetadata(id: string): Promise<YouTubeMetadata | null> {
  if (!/^[A-Za-z0-9_-]{6,}$/.test(id)) return Promise.resolve(null);
  const cached = cache.get(id);
  if (cached) return cached;
  const request = (async () => {
    try {
      const query = new URLSearchParams({ url: `https://www.youtube.com/watch?v=${id}`, format: "json" });
      const response = await fetch(`https://www.youtube.com/oembed?${query}`, {
        credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (typeof data.title !== "string" || !data.title.trim()) return null;
      return { title: data.title.trim().slice(0, 300), author: typeof data.author_name === "string" ? data.author_name.slice(0, 150) : "" };
    } catch { return null; }
  })();
  if (cache.size >= 200) cache.delete(cache.keys().next().value!);
  cache.set(id, request);
  return request;
}
