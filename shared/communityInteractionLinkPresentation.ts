export type CommunityInteractionLinkEmbedLike = {
  embed_kind: string;
  status: string;
  source_url?: string | null;
  normalized_source_url?: string | null;
};

const MAX_RICH_INTERACTION_EMBEDS = 1;
const STANDALONE_HTTP_URL_RE = /^https?:\/\/\S+$/i;
const TRAILING_URL_PUNCTUATION_RE = /[.,;:!?)\]}'"]+$/;

function canonicalHttpUrl(raw: unknown): string | null {
  const trimmed = String(raw ?? "").trim().replace(TRAILING_URL_PUNCTUATION_RE, "");
  if (!trimmed || !STANDALONE_HTTP_URL_RE.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function embedUrlKey(embed: CommunityInteractionLinkEmbedLike): string | null {
  return canonicalHttpUrl(embed.normalized_source_url ?? embed.source_url);
}

export function selectRichInteractionEmbeds<T extends CommunityInteractionLinkEmbedLike>(
  embeds: readonly T[],
): T[] {
  return embeds
    .filter(
      (embed) =>
        (embed.status === "pending" || embed.status === "ready") &&
        (embed.embed_kind === "link" || embed.embed_kind === "workspace_ref"),
    )
    .slice(0, MAX_RICH_INTERACTION_EMBEDS);
}

export function interactionBodyTextForEmbeds(
  rawText: unknown,
  embeds: readonly CommunityInteractionLinkEmbedLike[],
): string {
  const text = String(rawText ?? "").trim();
  if (!text) return "";

  const readyVisibleLinkUrls = new Set(
    selectRichInteractionEmbeds(embeds)
      .filter((embed) => embed.embed_kind === "link" && embed.status === "ready")
      .map(embedUrlKey)
      .filter((url): url is string => Boolean(url)),
  );

  let previousStandaloneUrl: string | null = null;
  const nextLines: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      nextLines.push(line);
      continue;
    }

    const standaloneUrl = canonicalHttpUrl(trimmed);
    if (!standaloneUrl) {
      previousStandaloneUrl = null;
      nextLines.push(line);
      continue;
    }

    const isConsecutiveDuplicate = standaloneUrl === previousStandaloneUrl;
    previousStandaloneUrl = standaloneUrl;
    if (isConsecutiveDuplicate || readyVisibleLinkUrls.has(standaloneUrl)) continue;
    nextLines.push(line);
  }

  return nextLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
