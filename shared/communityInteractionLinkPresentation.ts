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

    const standaloneUrl = canonicalHttpUrl(trimmed);
    if (!standaloneUrl) {
      previousStandaloneUrl = null;
      textLines.push(line);
      continue;
    }

    const isConsecutiveDuplicate = standaloneUrl === previousStandaloneUrl;
    previousStandaloneUrl = standaloneUrl;
    if (isConsecutiveDuplicate) continue;

    if (!visibleEmbedPlaced && readyVisibleLinkUrl === standaloneUrl && visibleEmbed) {
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
