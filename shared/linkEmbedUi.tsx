import { memo, type ReactNode } from "react";
import { extractCommunityInteractionLinkSources } from "./communityInteractionLinkExtraction";
import { normalizeExternalUrl, parseEmbedUrl, parseYouTubeEmbedUrl, type ParsedEmbed } from "./videoEmbed";
export { normalizeExternalUrl, parseEmbedUrl, parseYouTubeEmbedUrl, type ParsedEmbed };

const CHAT_LINK_RE = /\b(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;


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
