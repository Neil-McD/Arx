const INTERACTION_PREVIEW_RESOLVER_VERSION = 2;

const OEMBED_PROVIDER_RULES = [
  {
    provider: "loom",
    sourceHosts: new Set(["loom.com"]),
    endpointHosts: new Set(["loom.com"]),
    embedHosts: new Set(["loom.com"]),
  },
  {
    provider: "youtube",
    sourceHosts: new Set(["youtube.com", "youtube-nocookie.com", "youtu.be"]),
    endpointHosts: new Set(["youtube.com"]),
    embedHosts: new Set(["youtube.com", "youtube-nocookie.com"]),
  },
  {
    provider: "x",
    sourceHosts: new Set(["x.com", "twitter.com"]),
    endpointHosts: new Set(["publish.x.com", "publish.twitter.com"]),
    embedHosts: new Set(),
  },
];

function normalizeHost(raw) {
  return String(raw ?? "").trim().toLowerCase().replace(/^www\./, "").replace(/\.+$/, "");
}

function decodeHtmlEntities(raw) {
  const named = {
    amp: "&",
    gt: ">",
    lt: "<",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return String(raw ?? "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_match, entity) => {
    const lower = String(entity).toLowerCase();
    if (lower.startsWith("#x")) {
      const value = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(value) ? String.fromCodePoint(value) : " ";
    }
    if (lower.startsWith("#")) {
      const value = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : " ";
    }
    return named[lower] ?? " ";
  });
}

function normalizedText(raw, maxChars) {
  const value = decodeHtmlEntities(raw)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!value) return null;
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function attributeValue(tag, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i");
  return pattern.exec(String(tag ?? ""))?.[2] ?? null;
}

function providerRuleForSourceUrl(sourceUrl) {
  try {
    const sourceHost = normalizeHost(new URL(sourceUrl).hostname);
    return OEMBED_PROVIDER_RULES.find((rule) => rule.sourceHosts.has(sourceHost)) ?? null;
  } catch {
    return null;
  }
}

export function extractInteractionOEmbedDiscoveryUrl(html, sourceUrl) {
  const rule = providerRuleForSourceUrl(sourceUrl);
  if (!rule) return null;
  const tags = String(html ?? "").match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const rel = String(attributeValue(tag, "rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const type = String(attributeValue(tag, "type") ?? "").toLowerCase();
    if (!rel.includes("alternate") || type !== "application/json+oembed") continue;
    const href = decodeHtmlEntities(attributeValue(tag, "href"));
    if (!href) continue;
    try {
      const endpointUrl = new URL(href, sourceUrl);
      if (endpointUrl.protocol !== "https:" || endpointUrl.username || endpointUrl.password) continue;
      const endpointHost = normalizeHost(endpointUrl.hostname);
      if (!rule.endpointHosts.has(endpointHost)) continue;
      endpointUrl.hash = "";
      endpointUrl.searchParams.set("format", "json");
      endpointUrl.searchParams.set("maxwidth", "550");
      if (rule.provider === "x") {
        endpointUrl.searchParams.set("omit_script", "true");
        endpointUrl.searchParams.set("dnt", "true");
        endpointUrl.searchParams.set("theme", "dark");
        endpointUrl.searchParams.set("hide_thread", "true");
      } else {
        endpointUrl.searchParams.set("maxheight", "360");
      }
      return endpointUrl.toString();
    } catch {
      continue;
    }
  }
  return null;
}

function safeHttpUrl(raw) {
  try {
    const parsed = new URL(String(raw ?? ""));
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function extractIframeSrc(html, rule) {
  const iframe = String(html ?? "").match(/<iframe\b[^>]*>/i)?.[0] ?? "";
  const rawSrc = decodeHtmlEntities(attributeValue(iframe, "src"));
  const src = safeHttpUrl(rawSrc);
  if (!src) return null;
  const host = normalizeHost(new URL(src).hostname);
  return rule.embedHosts.has(host) ? src : null;
}

function extractFirstParagraphText(html) {
  const body = String(html ?? "").match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "";
  return normalizedText(body, 600);
}

function openGraphFallback(openGraph) {
  return {
    preview_kind: "link",
    preview_author_name: null,
    preview_title: normalizedText(openGraph?.og_title, 300),
    preview_description: normalizedText(openGraph?.og_description, 600),
    preview_image: safeHttpUrl(openGraph?.og_image),
    preview_image_alt: normalizedText(openGraph?.og_image_alt, 300),
    preview_video_url: null,
    preview_resolver_version: INTERACTION_PREVIEW_RESOLVER_VERSION,
  };
}

export function normalizeInteractionOEmbedPreview({ sourceUrl, openGraph, oEmbed }) {
  const fallback = openGraphFallback(openGraph);
  const rule = providerRuleForSourceUrl(sourceUrl);
  if (!rule || !oEmbed || typeof oEmbed !== "object" || Array.isArray(oEmbed)) return fallback;

  if (rule.provider === "x" && String(oEmbed.type ?? "").toLowerCase() === "rich") {
    const authorName = normalizedText(oEmbed.author_name, 160);
    const postBody = extractFirstParagraphText(oEmbed.html);
    if (!authorName || !postBody) return fallback;
    return {
      ...fallback,
      preview_kind: "social_post",
      preview_author_name: authorName,
      preview_title: authorName,
      preview_description: postBody,
    };
  }

  if (String(oEmbed.type ?? "").toLowerCase() === "video") {
    const videoUrl = extractIframeSrc(oEmbed.html, rule);
    const title = normalizedText(oEmbed.title, 300);
    if (!videoUrl || !title) return fallback;
    return {
      ...fallback,
      preview_kind: "video",
      preview_author_name: normalizedText(oEmbed.author_name, 160),
      preview_title: title,
      preview_description: null,
      preview_image: safeHttpUrl(oEmbed.thumbnail_url) ?? fallback.preview_image,
      preview_video_url: videoUrl,
    };
  }

  return fallback;
}

export function interactionPreviewOpenGraphFallback(openGraph) {
  return openGraphFallback(openGraph);
}
