export type CommunityInteractionLinkEmbedLike = {
  embed_kind: string;
  status: string;
  source_url?: string | null;
  normalized_source_url?: string | null;
};

export type CommunityInteractionPresentationSegment<T extends CommunityInteractionLinkEmbedLike> =
  | { type: "text"; text: string }
  | { type: "embed"; embed: T };

export type CommunityInteractionPresentation<T extends CommunityInteractionLinkEmbedLike> = {
  bodySegments: CommunityInteractionPresentationSegment<T>[];
  trailingEmbeds: T[];
};

const MAX_RICH_INTERACTION_EMBEDS = 1;
const STANDALONE_HTTP_URL_RE = /^https?:\/\/\S+$/i;
const TRAILING_URL_PUNCTUATION_RE = /[.,;:!?)\]}'"]+$/;

function stripPresentationTrackingParams(parsed: URL): void {
  for (const key of Array.from(parsed.searchParams.keys())) {
    const lower = key.toLowerCase();
    if (
      lower.startsWith("utm_") ||
      lower === "fbclid" ||
      lower === "gclid" ||
      lower === "mc_cid" ||
      lower === "mc_eid"
    ) {
      parsed.searchParams.delete(key);
    }
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (hostname === "x.com" || hostname === "twitter.com") {
    parsed.hostname = "x.com";
    for (const key of ["s", "t", "ref_src"]) parsed.searchParams.delete(key);
  }
  if (hostname === "loom.com") parsed.searchParams.delete("sid");
  if (hostname === "youtube.com" || hostname === "youtu.be") {
    parsed.searchParams.delete("si");
    parsed.searchParams.delete("feature");
  }
}

function canonicalHttpUrl(raw: unknown): string | null {
  const trimmed = String(raw ?? "").trim().replace(TRAILING_URL_PUNCTUATION_RE, "");
  if (!trimmed || !STANDALONE_HTTP_URL_RE.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.hash = "";
    stripPresentationTrackingParams(parsed);
    return parsed.toString();
  } catch {
    return null;
  }
}

function trailingBareHttpUrl(line: string): { prefix: string; url: string } | null {
  const trimmedEnd = line.trimEnd();
  const match = /https?:\/\/\S+$/i.exec(trimmedEnd);
  if (!match) return null;
  const start = match.index;
  if (start > 0 && !/\s/.test(trimmedEnd[start - 1] ?? "")) return null;
  const url = canonicalHttpUrl(match[0]);
  if (!url) return null;
  return {
    prefix: trimmedEnd.slice(0, start).trimEnd(),
    url,
  };
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

export function interactionPresentationForEmbeds<T extends CommunityInteractionLinkEmbedLike>(
  rawText: unknown,
  embeds: readonly T[],
): CommunityInteractionPresentation<T> {
  const text = String(rawText ?? "").trim();
  const visibleEmbed = selectRichInteractionEmbeds(embeds)[0] ?? null;
  if (!text) {
    return {
      bodySegments: [],
      trailingEmbeds: visibleEmbed ? [visibleEmbed] : [],
    };
  }

  const readyVisibleLinkUrl =
    visibleEmbed?.embed_kind === "link" && visibleEmbed.status === "ready"
      ? embedUrlKey(visibleEmbed)
      : null;

  let previousStandaloneUrl: string | null = null;
  let visibleEmbedPlaced = false;
  let insideCodeFence = false;
  let textLines: string[] = [];
  const bodySegments: CommunityInteractionPresentationSegment<T>[] = [];
  const flushText = () => {
    const segmentText = textLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    textLines = [];
    if (segmentText) bodySegments.push({ type: "text", text: segmentText });
  };

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (/^```(?:[A-Za-z0-9_+-]*)\s*$/.test(trimmed)) {
      insideCodeFence = !insideCodeFence;
      previousStandaloneUrl = null;
      textLines.push(line);
      continue;
    }
    if (insideCodeFence) {
      textLines.push(line);
      continue;
    }
    if (!trimmed) {
      textLines.push(line);
      continue;
    }

    const trailingBareUrl = trailingBareHttpUrl(line);
    if (!trailingBareUrl) {
      previousStandaloneUrl = null;
      textLines.push(line);
      continue;
    }

    const isStandaloneUrl = !trailingBareUrl.prefix;
    const isConsecutiveDuplicate =
      isStandaloneUrl && trailingBareUrl.url === previousStandaloneUrl;
    previousStandaloneUrl = isStandaloneUrl ? trailingBareUrl.url : null;
    if (isConsecutiveDuplicate) continue;

    if (!visibleEmbedPlaced && readyVisibleLinkUrl === trailingBareUrl.url && visibleEmbed) {
      if (trailingBareUrl.prefix) textLines.push(trailingBareUrl.prefix);
      flushText();
      bodySegments.push({ type: "embed", embed: visibleEmbed });
      visibleEmbedPlaced = true;
      continue;
    }

    textLines.push(line);
  }
  flushText();

  return {
    bodySegments,
    trailingEmbeds: visibleEmbed && !visibleEmbedPlaced ? [visibleEmbed] : [],
  };
}
