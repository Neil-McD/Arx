const INTERACTION_PREVIEW_RESOLVER_VERSION = 4;

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

function decodedCodePoint(raw, radix) {
  const value = Number.parseInt(raw, radix);
  if (!Number.isFinite(value) || value < 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
    return " ";
  }
  return String.fromCodePoint(value);
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
      return decodedCodePoint(lower.slice(2), 16);
    }
    if (lower.startsWith("#")) {
      return decodedCodePoint(lower.slice(1), 10);
    }
    return named[lower] ?? " ";
  });
}

function normalizedText(raw, maxChars) {
  const value = decodeHtmlEntities(raw)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gi, "")
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

export function interactionOEmbedResponseUrlIsAllowed(sourceUrl, responseUrl) {
  const rule = providerRuleForSourceUrl(sourceUrl);
  if (!rule) return false;
  try {
    const parsed = new URL(responseUrl);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      (parsed.port && parsed.port !== "443")
    ) {
      return false;
    }
    return rule.endpointHosts.has(normalizeHost(parsed.hostname));
  } catch {
    return false;
  }
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
        endpointUrl.searchParams.set("hide_media", "true");
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
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      (parsed.port && parsed.port !== "443")
    ) return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export function interactionXStatusIdentity(sourceUrl) {
  try {
    const parsed = new URL(sourceUrl);
    const host = normalizeHost(parsed.hostname);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      (parsed.port && parsed.port !== "443") ||
      (host !== "x.com" && host !== "twitter.com")
    ) return null;
    const match = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,24})\/?$/i.exec(parsed.pathname);
    if (!match) return null;
    return {
      statusId: match[2],
      handle: match[1].toLowerCase() === "i" ? null : match[1],
    };
  } catch {
    return null;
  }
}

function xSyndicationToken(statusId) {
  const numericId = Number(statusId);
  if (!Number.isFinite(numericId)) return null;
  return ((numericId / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "") || null;
}

export function interactionXSyndicationUrl(sourceUrl) {
  const statusId = interactionXStatusIdentity(sourceUrl)?.statusId ?? null;
  const token = statusId ? xSyndicationToken(statusId) : null;
  if (!statusId || !token) return null;
  const endpoint = new URL("https://cdn.syndication.twimg.com/tweet-result");
  endpoint.searchParams.set("id", statusId);
  endpoint.searchParams.set("lang", "en");
  endpoint.searchParams.set("token", token);
  return endpoint.toString();
}

export function interactionXSyndicationResponseUrlIsAllowed(sourceUrl, responseUrl) {
  const requestUrl = interactionXSyndicationUrl(sourceUrl);
  if (!requestUrl) return false;
  try {
    const expectedStatusId = new URL(requestUrl).searchParams.get("id");
    const parsed = new URL(responseUrl);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      (!parsed.port || parsed.port === "443") &&
      normalizeHost(parsed.hostname) === "cdn.syndication.twimg.com" &&
      parsed.pathname === "/tweet-result" &&
      parsed.searchParams.get("id") === expectedStatusId
    );
  } catch {
    return false;
  }
}

function xProfileAvatarUrl(raw) {
  const url = safeHttpUrl(raw);
  if (!url) return null;
  const parsed = new URL(url);
  return normalizeHost(parsed.hostname) === "pbs.twimg.com" && /^\/profile_images\//.test(parsed.pathname)
    ? url
    : null;
}

function xAuthorHandle(raw) {
  const value = String(raw ?? "").trim().replace(/^@/, "");
  return /^[A-Za-z0-9_]{1,15}$/.test(value) ? value : null;
}

function xSyndicationPostBody(syndication) {
  const rawText = String(syndication?.text ?? "");
  const range = Array.isArray(syndication?.display_text_range)
    ? syndication.display_text_range
    : null;
  const rangeStart = Number(range?.[0]);
  const rangeEnd = Number(range?.[1]);
  const visibleText =
    Number.isInteger(rangeStart) &&
    Number.isInteger(rangeEnd) &&
    rangeStart >= 0 &&
    rangeEnd >= rangeStart &&
    rangeEnd <= rawText.length
      ? rawText.slice(rangeStart, rangeEnd)
      : rawText.replace(/\s+https:\/\/t\.co\/[A-Za-z0-9]+\s*$/i, "");
  return normalizedText(visibleText, 600);
}

function xPublishedAt(raw) {
  const timestamp = Date.parse(String(raw ?? ""));
  const earliestTweetMs = Date.UTC(2006, 2, 21);
  const latestReasonableMs = Date.now() + 24 * 60 * 60 * 1000;
  return Number.isFinite(timestamp) && timestamp >= earliestTweetMs && timestamp <= latestReasonableMs
    ? timestamp
    : null;
}

function xPostContext(syndication) {
  if (syndication?.quoted_tweet && typeof syndication.quoted_tweet === "object") return "quote";
  if (String(syndication?.quoted_status_id_str ?? "").trim()) return "quote";
  if (String(syndication?.in_reply_to_status_id_str ?? "").trim()) return "reply";
  return "post";
}

function embedPathIsAllowed(rule, parsed) {
  if (rule.provider === "loom") {
    return /^\/embed\/[A-Za-z0-9_-]{8,160}\/?$/.test(parsed.pathname);
  }
  if (rule.provider === "youtube") {
    return (
      /^\/embed\/[A-Za-z0-9_-]{6,80}\/?$/.test(parsed.pathname) ||
      (parsed.pathname === "/embed" && Boolean(parsed.searchParams.get("list")))
    );
  }
  return false;
}

function extractIframeSrc(html, rule) {
  const iframe = String(html ?? "").match(/<iframe\b[^>]*>/i)?.[0] ?? "";
  const rawSrc = decodeHtmlEntities(attributeValue(iframe, "src"));
  const src = safeHttpUrl(rawSrc);
  if (!src) return null;
  const parsed = new URL(src);
  const host = normalizeHost(parsed.hostname);
  return rule.embedHosts.has(host) && embedPathIsAllowed(rule, parsed) ? src : null;
}

function extractFirstParagraphText(html) {
  const body = String(html ?? "").match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "";
  return normalizedText(body, 600);
}

function openGraphFallback(openGraph, sourceUrl) {
  const provider = providerRuleForSourceUrl(sourceUrl)?.provider ?? null;
  const suppressDescription = provider === "loom";
  return {
    preview_kind: "link",
    preview_provider: null,
    preview_provider_post_id: null,
    preview_published_at: null,
    preview_post_context: null,
    preview_author_name: null,
    preview_author_handle: null,
    preview_author_avatar: null,
    preview_title: normalizedText(openGraph?.og_title, 300),
    preview_description: suppressDescription ? null : normalizedText(openGraph?.og_description, 600),
    preview_image: null,
    preview_image_alt: null,
    preview_video_url: null,
    preview_resolver_version: INTERACTION_PREVIEW_RESOLVER_VERSION,
  };
}

export function normalizeInteractionOEmbedPreview({ sourceUrl, openGraph, oEmbed, syndication = null }) {
  const fallback = openGraphFallback(openGraph, sourceUrl);
  const rule = providerRuleForSourceUrl(sourceUrl);
  if (!rule) return fallback;

  if (rule.provider === "x") {
    const sourceIdentity = interactionXStatusIdentity(sourceUrl);
    const sourceStatusId = sourceIdentity?.statusId ?? null;
    const oEmbedIdentity = interactionXStatusIdentity(String(oEmbed?.url ?? ""));
    const validOEmbed =
      oEmbed &&
      typeof oEmbed === "object" &&
      !Array.isArray(oEmbed) &&
      String(oEmbed.type ?? "").toLowerCase() === "rich" &&
      sourceStatusId === oEmbedIdentity?.statusId;
    const validSyndication =
      syndication &&
      typeof syndication === "object" &&
      !Array.isArray(syndication) &&
      sourceStatusId === String(syndication.id_str ?? "");
    const syndicationUser = validSyndication && syndication.user && typeof syndication.user === "object"
      ? syndication.user
      : null;
    const authorName =
      normalizedText(syndicationUser?.name, 160) ??
      (validOEmbed ? normalizedText(oEmbed.author_name, 160) : null);
    const postBody =
      (validSyndication ? xSyndicationPostBody(syndication) : null) ??
      (validOEmbed ? extractFirstParagraphText(oEmbed.html) : null);
    if (!authorName || !postBody) return fallback;
    return {
      ...fallback,
      preview_kind: "social_post",
      preview_provider: "x",
      preview_provider_post_id: sourceStatusId,
      preview_published_at: validSyndication ? xPublishedAt(syndication.created_at) : null,
      preview_post_context: validSyndication ? xPostContext(syndication) : null,
      preview_author_name: authorName,
      preview_author_handle: xAuthorHandle(syndicationUser?.screen_name) ?? sourceIdentity?.handle ?? null,
      preview_author_avatar: xProfileAvatarUrl(syndicationUser?.profile_image_url_https),
      preview_title: authorName,
      preview_description: postBody,
      preview_image: null,
      preview_image_alt: null,
    };
  }

  if (!oEmbed || typeof oEmbed !== "object" || Array.isArray(oEmbed)) return fallback;

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
      preview_image: safeHttpUrl(oEmbed.thumbnail_url) ?? safeHttpUrl(openGraph?.og_image),
      preview_image_alt: normalizedText(openGraph?.og_image_alt, 300),
      preview_video_url: videoUrl,
    };
  }

  return fallback;
}

export function interactionPreviewOpenGraphFallback(openGraph, sourceUrl = null) {
  return openGraphFallback(openGraph, sourceUrl);
}
