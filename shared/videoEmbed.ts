// Which links a lesson or a message can play as a video: YouTube, Vimeo, Loom
// and Wistia. No React here, so the server checks a lesson's video with the
// same rule the app uses (docs/specs/lesson-video-v0.md).
export type ParsedEmbed =
  | { provider: "youtube"; id: string; src: string; thumbnailUrl: string; thumbnailUrls: string[] }
  | { provider: "vimeo"; id: string; src: string }
  | { provider: "loom"; id: string; src: string }
  | { provider: "wistia"; id: string; src: string };

function parseTimeToSeconds(value: string): number | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  let seconds = 0;
  let matched = false;
  const re = /(\d+)(h|m|s)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trimmed))) {
    matched = true;
    const qty = Number.parseInt(m[1] ?? "0", 10);
    const unit = m[2];
    if (unit === "h") seconds += qty * 3600;
    if (unit === "m") seconds += qty * 60;
    if (unit === "s") seconds += qty;
  }
  return matched ? seconds : null;
}

export function normalizeExternalUrl(raw: string | null): URL | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    try {
      url = new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url;
}

function hostMatches(host: string, apex: string): boolean {
  return host === apex || host.endsWith(`.${apex}`);
}

const YOUTUBE_PAGE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

function parseYouTubeId(url: URL): { id: string; startSeconds: number | null } | null {
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  let id: string | null = null;
  if (host === "youtu.be") {
    id = parts[0] ?? null;
  } else if (YOUTUBE_PAGE_HOSTS.has(host)) {
    if (url.pathname === "/watch") {
      id = url.searchParams.get("v");
    } else if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live" || parts[0] === "v") {
      id = parts[1] ?? null;
    }
  }

  if (!id) return null;
  id = id.replace(/[^a-zA-Z0-9_-]/g, "");
  if (id.length < 6) return null;

  const startRaw = url.searchParams.get("start") ?? url.searchParams.get("t");
  const startSeconds = startRaw ? parseTimeToSeconds(startRaw) : null;
  return { id, startSeconds };
}

function buildYouTubeThumbnailUrls(id: string): string[] {
  return [
    `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  ];
}

function parseWistiaId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (!hostMatches(host, "wistia.com") && !hostMatches(host, "wistia.net")) return null;

  const fromQuery = url.searchParams.get("wvideo");
  if (fromQuery && /^[a-zA-Z0-9]+$/.test(fromQuery)) return fromQuery;

  const match = url.pathname.match(/(?:medias|iframe)\/([a-zA-Z0-9]+)/);
  if (match && match[1]) return match[1];
  return null;
}

function parseVimeoId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (!hostMatches(host, "vimeo.com")) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const candidate = parts[index] ?? "";
    if (/^\d{6,}$/.test(candidate)) return candidate;
  }
  return null;
}

function parseLoomId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (host !== "loom.com" && host !== "www.loom.com") return null;

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  if (parts[0] !== "share" && parts[0] !== "embed") return null;
  const id = (parts[1] ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
  return id.length >= 8 ? id : null;
}

export function parseEmbedUrl(rawUrl: string): ParsedEmbed | null {
  const url = normalizeExternalUrl(rawUrl);
  if (!url) return null;

  const youtube = parseYouTubeEmbedUrl(url.toString());
  if (youtube) return youtube;

  const wistiaId = parseWistiaId(url);
  if (wistiaId) {
    const src = `https://fast.wistia.net/embed/iframe/${wistiaId}?seo=false&videoFoam=true`;
    return { provider: "wistia", id: wistiaId, src };
  }

  const vimeoId = parseVimeoId(url);
  if (vimeoId) {
    const src = `https://player.vimeo.com/video/${vimeoId}`;
    return { provider: "vimeo", id: vimeoId, src };
  }

  const loomId = parseLoomId(url);
  if (loomId) {
    const src = `https://www.loom.com/embed/${loomId}`;
    return { provider: "loom", id: loomId, src };
  }

  return null;
}

export function parseYouTubeEmbedUrl(
  rawUrl: string,
): Extract<ParsedEmbed, { provider: "youtube" }> | null {
  const url = normalizeExternalUrl(rawUrl);
  if (
    !url ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) return null;
  const youtube = parseYouTubeId(url);
  if (!youtube) return null;
  const params = new URLSearchParams();
  if (youtube.startSeconds && youtube.startSeconds > 0) {
    params.set("start", String(youtube.startSeconds));
  }
  const src = `https://www.youtube.com/embed/${youtube.id}${params.toString() ? `?${params.toString()}` : ""}`;
  const thumbnailUrls = buildYouTubeThumbnailUrls(youtube.id);
  return {
    provider: "youtube",
    id: youtube.id,
    src,
    thumbnailUrl: thumbnailUrls[0]!,
    thumbnailUrls,
  };
}

export type LessonVideoProvider = ParsedEmbed["provider"];

// The provider of a link a lesson can play, or null when it can't play it.
export function lessonVideoProvider(raw: unknown): LessonVideoProvider | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  return value ? parseEmbedUrl(value)?.provider ?? null : null;
}

export const LESSON_VIDEO_UNPLAYABLE = "lesson_video_unplayable";
export const LESSON_VIDEO_UNPLAYABLE_MESSAGE = "That link isn't a video we can play. Use YouTube, Loom, Vimeo or Wistia.";

// Whether a lesson's video may change from previous to next. Empty clears it.
// A link the lesson already had stays allowed even when it is a page, not a
// video (older lessons), so only a new or changed link is checked.
export function lessonVideoProblem(next: unknown, previous: unknown): typeof LESSON_VIDEO_UNPLAYABLE | null {
  const value = typeof next === "string" ? next.trim() : "";
  if (!value) return null;
  if (value === (typeof previous === "string" ? previous.trim() : "")) return null;
  return lessonVideoProvider(value) ? null : LESSON_VIDEO_UNPLAYABLE;
}
