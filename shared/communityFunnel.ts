import type {
  CommunityFunnelConfig,
  CommunityFunnelDocumentV1,
  CommunityFunnelHeroMediaKind,
  CommunityFunnelManagerConfig,
  CommunityFunnelSectionV1,
  CommunityFunnelThemeV1,
} from "./communityTypes";

export const DEFAULT_COMMUNITY_FUNNEL_CONFIG: CommunityFunnelConfig = {
  hero_media_url: null,
  hero_media_kind: "image",
  published_document_v1: null,
};

export const DEFAULT_COMMUNITY_FUNNEL_MANAGER_CONFIG: CommunityFunnelManagerConfig =
  {
    ...DEFAULT_COMMUNITY_FUNNEL_CONFIG,
    draft_document_v1: null,
    draft_revision: 0,
    draft_updated_at: null,
    published_draft_revision: 0,
    published_at: null,
  };

export const DEFAULT_COMMUNITY_FUNNEL_THEME: CommunityFunnelThemeV1 = {
  appearance: "dark",
  character: "editorial",
  accent: "rose",
  density: "balanced",
  radius: "soft",
};

const FUNNEL_SECTION_TYPES = new Set<CommunityFunnelSectionV1["type"]>([
  "hero",
  "media",
  "benefits",
  "social_proof",
  "testimonial",
  "faq",
  "cta",
]);

function normalizeTrimmedString(
  raw: unknown,
  maxLength: number,
): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  return value.slice(0, maxLength);
}

function normalizeRequiredText(
  raw: unknown,
  maxLength: number,
  code: string,
): string {
  const value = normalizeTrimmedString(raw, maxLength);
  if (!value) throw new Error(code);
  return value;
}

function normalizeHeroMediaKind(raw: unknown): CommunityFunnelHeroMediaKind {
  return raw === "video" ? "video" : "image";
}

function normalizeEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = String(raw ?? "").trim() as T;
  return allowed.includes(value) ? value : fallback;
}

function normalizeExternalUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed);
  } catch {
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

function isHostOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function isSupportedCommunityFunnelVideoUrl(
  raw: string | null,
): boolean {
  if (!raw) return false;
  const url = normalizeExternalUrl(raw);
  if (!url || url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  if (host === "youtu.be" && parts[0]) return true;
  if (
    isHostOrSubdomain(host, "youtube.com") ||
    isHostOrSubdomain(host, "youtube-nocookie.com")
  ) {
    if (url.pathname === "/watch" && url.searchParams.get("v")) return true;
    if (["embed", "shorts", "live", "v"].includes(parts[0] ?? "") && parts[1])
      return true;
  }
  if (
    isHostOrSubdomain(host, "vimeo.com") &&
    parts.some((part) => /^\d{6,}$/.test(part))
  )
    return true;
  if (
    (host === "loom.com" || host === "www.loom.com") &&
    ["share", "embed"].includes(parts[0] ?? "") &&
    parts[1]
  ) {
    return true;
  }
  if (
    isHostOrSubdomain(host, "wistia.com") ||
    isHostOrSubdomain(host, "wistia.net")
  ) {
    if (url.searchParams.get("wvideo")) return true;
    return parts.some(
      (part, index) =>
        ["medias", "iframe"].includes(part) && Boolean(parts[index + 1]),
    );
  }
  return false;
}

export function normalizeCommunityFunnelConfig(
  raw: unknown,
): CommunityFunnelConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_COMMUNITY_FUNNEL_CONFIG;
  }
  const value = raw as Record<string, unknown>;
  return {
    hero_media_url: normalizeTrimmedString(value.hero_media_url, 2_000),
    hero_media_kind: normalizeHeroMediaKind(value.hero_media_kind),
    published_document_v1: normalizeCommunityFunnelDocumentV1(
      value.published_document_v1,
    ),
  };
}

function normalizeTheme(raw: unknown): CommunityFunnelThemeV1 {
  const value =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    appearance: normalizeEnum(
      value.appearance,
      ["light", "dark"],
      DEFAULT_COMMUNITY_FUNNEL_THEME.appearance,
    ),
    character: normalizeEnum(
      value.character,
      ["minimal", "editorial", "cinematic"],
      DEFAULT_COMMUNITY_FUNNEL_THEME.character,
    ),
    accent: normalizeEnum(
      value.accent,
      ["blue", "violet", "rose", "amber", "emerald"],
      DEFAULT_COMMUNITY_FUNNEL_THEME.accent,
    ),
    density: normalizeEnum(
      value.density,
      ["compact", "balanced", "airy"],
      DEFAULT_COMMUNITY_FUNNEL_THEME.density,
    ),
    radius: normalizeEnum(
      value.radius,
      ["subtle", "soft"],
      DEFAULT_COMMUNITY_FUNNEL_THEME.radius,
    ),
  };
}

function normalizeSectionId(raw: unknown, index: number): string {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return value || `section-${index + 1}`;
}

function normalizeSection(
  raw: unknown,
  index: number,
): CommunityFunnelSectionV1 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("community_funnel_section_invalid");
  }
  const value = raw as Record<string, unknown>;
  const type = String(
    value.type ?? "",
  ).trim() as CommunityFunnelSectionV1["type"];
  if (!FUNNEL_SECTION_TYPES.has(type))
    throw new Error("community_funnel_section_type_invalid");
  const id = normalizeSectionId(value.id, index);
  if (type === "hero") {
    return {
      id,
      type,
      eyebrow: normalizeTrimmedString(value.eyebrow, 80),
      headline: normalizeRequiredText(
        value.headline,
        180,
        "community_funnel_hero_headline_required",
      ),
      body: normalizeRequiredText(
        value.body,
        480,
        "community_funnel_hero_body_required",
      ),
      alignment: value.alignment === "left" ? "left" : "center",
    };
  }
  if (type === "media") {
    const mediaUrl = normalizeTrimmedString(value.media_url, 2_000);
    if (mediaUrl && !isSupportedCommunityFunnelVideoUrl(mediaUrl)) {
      throw new Error("community_funnel_media_url_unsupported");
    }
    return {
      id,
      type,
      media_url: mediaUrl,
      caption: normalizeTrimmedString(value.caption, 240),
    };
  }
  if (type === "benefits") {
    const rawItems = Array.isArray(value.items) ? value.items : [];
    if (rawItems.length > 4) {
      throw new Error("community_funnel_benefits_limit_exceeded");
    }
    const items = rawItems.map((item) => {
        const row =
          item && typeof item === "object" && !Array.isArray(item)
            ? (item as Record<string, unknown>)
            : {};
        return {
          title: normalizeRequiredText(
            row.title,
            90,
            "community_funnel_benefit_title_required",
          ),
          body: normalizeRequiredText(
            row.body,
            320,
            "community_funnel_benefit_body_required",
          ),
        };
      });
    if (items.length < 2)
      throw new Error("community_funnel_benefits_require_two_items");
    return {
      id,
      type,
      heading: normalizeTrimmedString(value.heading, 140),
      items,
    };
  }
  if (type === "social_proof") {
    return {
      id,
      type,
      headline: normalizeTrimmedString(value.headline, 160),
      body: normalizeTrimmedString(value.body, 360),
    };
  }
  if (type === "testimonial") {
    return {
      id,
      type,
      quote: normalizeRequiredText(
        value.quote,
        1_200,
        "community_funnel_testimonial_quote_required",
      ),
      attribution: normalizeRequiredText(
        value.attribution,
        160,
        "community_funnel_testimonial_attribution_required",
      ),
    };
  }
  if (type === "faq") {
    const rawItems = Array.isArray(value.items) ? value.items : [];
    if (rawItems.length > 5) {
      throw new Error("community_funnel_faq_limit_exceeded");
    }
    const items = rawItems.map((item) => {
        const row =
          item && typeof item === "object" && !Array.isArray(item)
            ? (item as Record<string, unknown>)
            : {};
        return {
          question: normalizeRequiredText(
            row.question,
            180,
            "community_funnel_faq_question_required",
          ),
          answer: normalizeRequiredText(
            row.answer,
            1_200,
            "community_funnel_faq_answer_required",
          ),
        };
      });
    if (items.length < 1) throw new Error("community_funnel_faq_requires_item");
    return {
      id,
      type,
      heading: normalizeTrimmedString(value.heading, 140),
      items,
    };
  }
  return {
    id,
    type: "cta",
    headline: normalizeRequiredText(
      value.headline,
      180,
      "community_funnel_cta_headline_required",
    ),
    body: normalizeTrimmedString(value.body, 360),
  };
}

export function validateCommunityFunnelDocumentV1(
  raw: unknown,
): CommunityFunnelDocumentV1 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("community_funnel_document_invalid");
  }
  const value = raw as Record<string, unknown>;
  if (Number(value.version) !== 1)
    throw new Error("community_funnel_document_version_invalid");
  const rawSections = Array.isArray(value.sections) ? value.sections : [];
  if (rawSections.length > 10)
    throw new Error("community_funnel_document_too_many_sections");
  const sections = rawSections.map(normalizeSection);
  if (sections.length < 2)
    throw new Error("community_funnel_document_requires_sections");
  const ids = new Set(sections.map((section) => section.id));
  if (ids.size !== sections.length)
    throw new Error("community_funnel_section_id_duplicate");
  if (sections.filter((section) => section.type === "hero").length !== 1) {
    throw new Error("community_funnel_document_requires_one_hero");
  }
  if (sections.filter((section) => section.type === "cta").length !== 1) {
    throw new Error("community_funnel_document_requires_one_cta");
  }
  return { version: 1, theme: normalizeTheme(value.theme), sections };
}

export function normalizeCommunityFunnelDocumentV1(
  raw: unknown,
): CommunityFunnelDocumentV1 | null {
  try {
    return validateCommunityFunnelDocumentV1(raw);
  } catch {
    return null;
  }
}

export function buildDefaultCommunityFunnelDocumentV1(params: {
  communityName: string;
  oneLiner?: string | null;
  about?: string | null;
  heroMediaUrl?: string | null;
}): CommunityFunnelDocumentV1 {
  const communityName =
    normalizeTrimmedString(params.communityName, 80) || "this community";
  const oneLiner = normalizeTrimmedString(params.oneLiner, 180);
  const about = normalizeTrimmedString(params.about, 480);
  const mediaUrl = normalizeTrimmedString(params.heroMediaUrl, 2_000);
  return {
    version: 1,
    theme: { ...DEFAULT_COMMUNITY_FUNNEL_THEME },
    sections: [
      {
        id: "hero",
        type: "hero",
        eyebrow: communityName,
        headline: oneLiner || `Join ${communityName}`,
        body:
          about ||
          `Meet the people, knowledge, and agents inside ${communityName}.`,
        alignment: "center",
      },
      {
        id: "media",
        type: "media",
        media_url:
          mediaUrl && isSupportedCommunityFunnelVideoUrl(mediaUrl)
            ? mediaUrl
            : null,
        caption: null,
      },
      {
        id: "benefits",
        type: "benefits",
        heading: "What happens inside",
        items: [
          {
            title: "Think together",
            body: "Collaborate with people who care about the same problems and outcomes.",
          },
          {
            title: "Remember everything",
            body: "Turn conversations and resources into shared intelligence that compounds.",
          },
          {
            title: "Act with agents",
            body: "Use community intelligence to plan, execute, and deliver better outcomes.",
          },
        ],
      },
      { id: "proof", type: "social_proof", headline: null, body: null },
      {
        id: "cta",
        type: "cta",
        headline: `Build with ${communityName}`,
        body: oneLiner,
      },
    ],
  };
}

export function normalizeCommunityFunnelManagerConfig(
  raw: unknown,
): CommunityFunnelManagerConfig {
  const base = normalizeCommunityFunnelConfig(raw);
  const value =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const revision = Math.floor(Number(value.draft_revision));
  const publishedRevision = Math.floor(Number(value.published_draft_revision));
  const draftUpdatedAt = Number(value.draft_updated_at);
  const publishedAt = Number(value.published_at);
  return {
    ...base,
    draft_document_v1: normalizeCommunityFunnelDocumentV1(
      value.draft_document_v1,
    ),
    draft_revision: Number.isFinite(revision) && revision >= 0 ? revision : 0,
    draft_updated_at:
      Number.isFinite(draftUpdatedAt) && draftUpdatedAt > 0
        ? draftUpdatedAt
        : null,
    published_draft_revision:
      Number.isFinite(publishedRevision) && publishedRevision >= 0
        ? publishedRevision
        : 0,
    published_at:
      Number.isFinite(publishedAt) && publishedAt > 0 ? publishedAt : null,
  };
}
