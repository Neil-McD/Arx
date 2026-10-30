import { memo, type ReactNode } from "react";
import { extractCommunityInteractionLinkSources } from "./communityInteractionLinkExtraction";

const CHAT_LINK_RE = /\b(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;

export type ParsedEmbed =
  | { provider: "youtube"; id: string; src: string; thumbnailUrl: string; thumbnailUrls: string[] }
  | { provider: "vimeo"; id: string; src: string }
  | { provider: "loom"; id: string; src: string }
  | { provider: "wistia"; id: string; src: string }
  | { provider: "descript"; id: string; src: string };

function splitUrlAndTrailingPunctuation(candidate: string): { url: string; trailing: string } {
  let url = candidate;
  let trailing = "";
  while (url.length > 0) {
    const last = url.slice(-1);
    if (").,!?;:]}'\"".includes(last)) {
      trailing = last + trailing;
      url = url.slice(0, -1);
      continue;
    }
    break;
  }
  return { url, trailing };
}

export function renderTextWithLinks(
  text: string,
  opts?: { onOpenUrl?: (url: string) => void },
): ReactNode {
  if (!text) return "";
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(CHAT_LINK_RE)) {
    const index = match.index ?? -1;
    if (index < 0) continue;
    if (index > lastIndex) nodes.push(text.slice(lastIndex, index));
    const raw = match[0] ?? "";
    const { url, trailing } = splitUrlAndTrailingPunctuation(raw);
    const href = url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;
    nodes.push(
      <a
        key={`link-${index}`}
        className="chat-link"
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        onClick={
          opts?.onOpenUrl
            ? (event) => {
                event.preventDefault();
                opts.onOpenUrl?.(href);
              }
            : undefined
        }
      >
        {url}
      </a>,
    );
    if (trailing) nodes.push(trailing);
    lastIndex = index + raw.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.length > 0 ? <>{nodes}</> : text;
}

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

// Descript share links (/view/ID) and embeds (/embed/ID) both play in its
// embed player; plenty of course lessons are recorded there.
function parseDescriptId(url: URL): string | null {
  if (url.hostname.toLowerCase() !== "share.descript.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2 || (parts[0] !== "view" && parts[0] !== "embed")) return null;
  const id = (parts[1] ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
  return id.length >= 6 ? id : null;
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

  const descriptId = parseDescriptId(url);
  if (descriptId) {
    return { provider: "descript", id: descriptId, src: `https://share.descript.com/embed/${descriptId}` };
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

/** One preview per video, in authored order; code samples remain plain text. */
export function youTubeEmbedsInText(text: string) {
  const seen = new Set<string>();
  return extractCommunityInteractionLinkSources(text, (url) => {
    const embed = parseYouTubeEmbedUrl(url);
    if (!embed || seen.has(embed.id)) return null;
    seen.add(embed.id);
    return url;
  }, 12).map((href) => ({ href, embed: parseYouTubeEmbedUrl(href)! }));
}

export const StableMediaEmbedFrame = memo(function StableMediaEmbedFrame(props: {
  src: string;
  title: string;
}) {
  return (
    <iframe
      data-resource-media="true"
      src={props.src}
      title={props.title}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      allowFullScreen
    />
  );
});
