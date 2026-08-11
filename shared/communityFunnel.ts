import type {
  CommunityCustomFunnelSlot,
  CommunityFunnelConfig,
  CommunityFunnelContentV2,
  CommunityFunnelDocumentV1,
  CommunityFunnelHeroMediaKind,
  CommunityFunnelManagerConfig,
  CommunityFunnelSectionV1,
  CommunityFunnelSlot,
  CommunityFunnelThemeV1,
  CommunityFunnelVariantConfig,
} from "./communityTypes";

export const COMMUNITY_CUSTOM_FUNNEL_SLOTS = [
  "custom_1",
  "custom_2",
] as const satisfies readonly CommunityCustomFunnelSlot[];

export const DEFAULT_COMMUNITY_FUNNEL_SLOT: CommunityFunnelSlot = "default";

export function normalizeCommunityCustomFunnelSlot(
  raw: unknown,
): CommunityCustomFunnelSlot {
  return raw === "custom_2" ? "custom_2" : "custom_1";
}

export function normalizeCommunityFunnelSlot(
  raw: unknown,
): CommunityFunnelSlot {
  if (raw === "custom_1" || raw === "custom_2") return raw;
  return DEFAULT_COMMUNITY_FUNNEL_SLOT;
}

export const DEFAULT_COMMUNITY_FUNNEL_CONFIG: CommunityFunnelConfig = {
  hero_media_url: null,
  hero_media_kind: "image",
  published_vsl_url: null,
  published_content_v2: null,
  published_document_v1: null,
};

export const DEFAULT_COMMUNITY_FUNNEL_MANAGER_CONFIG: CommunityFunnelManagerConfig =
  {
    ...DEFAULT_COMMUNITY_FUNNEL_CONFIG,
    active_slot: DEFAULT_COMMUNITY_FUNNEL_SLOT,
    custom_funnels: {
      custom_1: null,
      custom_2: null,
    },
    draft_vsl_url: null,
    draft_content_v2: null,
    draft_document_v1: null,
    draft_revision: 0,
    draft_updated_at: null,
    published_draft_revision: 0,
    published_at: null,
  };

export const DEFAULT_COMMUNITY_FUNNEL_THEME: CommunityFunnelThemeV1 = {
  appearance: "inherit",
  character: "editorial",
  accent: "blue",
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

export function normalizeCommunityFunnelVslUrl(raw: unknown): string | null {
  const value = normalizeTrimmedString(raw, 2_000);
  if (!value) return null;
  const url = normalizeExternalUrl(value);
  if (!url || !isSupportedCommunityFunnelVideoUrl(url.href)) {
    throw new Error("community_funnel_vsl_url_unsupported");
  }
  return url.href;
}

export function resolveCommunityFunnelDocumentVslUrl(
  document: CommunityFunnelDocumentV1 | null | undefined,
): string | null {
  const mediaSection = document?.sections.find(
    (section): section is Extract<CommunityFunnelSectionV1, { type: "media" }> =>
      section.type === "media" && Boolean(section.media_url),
  );
  try {
    return normalizeCommunityFunnelVslUrl(mediaSection?.media_url ?? null);
  } catch {
    return null;
  }
}

export function withoutCommunityFunnelMediaSections(
  document: CommunityFunnelDocumentV1,
): CommunityFunnelDocumentV1 {
  return {
    ...document,
    sections: document.sections.filter((section) => section.type !== "media"),
  };
}

export function normalizeCommunityFunnelConfig(
  raw: unknown,
): CommunityFunnelConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_COMMUNITY_FUNNEL_CONFIG;
  }
  const value = raw as Record<string, unknown>;
  const heroMediaUrl = normalizeTrimmedString(value.hero_media_url, 2_000);
  const heroMediaKind = normalizeHeroMediaKind(value.hero_media_kind);
  const publishedDocumentV1 = normalizeCommunityFunnelDocumentV1(
    value.published_document_v1,
  );
  const publishedContentV2 = normalizeCommunityFunnelContentV2(
    value.published_content_v2,
  );
  let publishedVslUrl: string | null = null;
  try {
    publishedVslUrl = normalizeCommunityFunnelVslUrl(
      value.published_vsl_url,
    );
  } catch {
    publishedVslUrl = null;
  }
  if (!Object.prototype.hasOwnProperty.call(value, "published_vsl_url")) {
    publishedVslUrl =
      resolveCommunityFunnelDocumentVslUrl(publishedDocumentV1) ??
      (heroMediaKind === "video"
        ? (() => {
            try {
              return normalizeCommunityFunnelVslUrl(heroMediaUrl);
            } catch {
              return null;
            }
          })()
        : null);
  }
  return {
    hero_media_url: heroMediaUrl,
    hero_media_kind: heroMediaKind,
    published_vsl_url: publishedVslUrl,
    published_content_v2: publishedContentV2,
    published_document_v1: publishedDocumentV1,
  };
}

function normalizeTheme(raw: unknown): CommunityFunnelThemeV1 {
  const value =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    // Polynet owns appearance. Accepting a legacy light/dark value here is
    // intentionally a read-compatibility behavior, never a second authority.
    appearance: "inherit",
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

export function validateCommunityFunnelContentV2(
  raw: unknown,
): CommunityFunnelContentV2 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("community_funnel_content_invalid");
  }
  const value = raw as Record<string, unknown>;
  if (Number(value.version) !== 2) {
    throw new Error("community_funnel_content_version_invalid");
  }
  const rawPillars = Array.isArray(value.pillars) ? value.pillars : [];
  if (rawPillars.length !== 3) {
    throw new Error("community_funnel_content_requires_three_pillars");
  }
  const pillars = rawPillars.map((rawPillar) => {
    if (!rawPillar || typeof rawPillar !== "object" || Array.isArray(rawPillar)) {
      throw new Error("community_funnel_pillar_invalid");
    }
    const pillar = rawPillar as Record<string, unknown>;
    return {
      title: normalizeRequiredText(
        pillar.title,
        90,
        "community_funnel_pillar_title_required",
      ),
      body: normalizeRequiredText(
        pillar.body,
        320,
        "community_funnel_pillar_body_required",
      ),
    };
  }) as CommunityFunnelContentV2["pillars"];
  return {
    version: 2,
    headline: normalizeRequiredText(
      value.headline,
      180,
      "community_funnel_headline_required",
    ),
    subheadline: normalizeRequiredText(
      value.subheadline,
      480,
      "community_funnel_subheadline_required",
    ),
    pillars,
    long_form_markdown: normalizeRequiredText(
      value.long_form_markdown,
      12_000,
      "community_funnel_long_form_required",
    ),
  };
}

export function normalizeCommunityFunnelContentV2(
  raw: unknown,
): CommunityFunnelContentV2 | null {
  try {
    return validateCommunityFunnelContentV2(raw);
  } catch {
    return null;
  }
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
  const draftDocumentV1 = normalizeCommunityFunnelDocumentV1(
    value.draft_document_v1,
  );
  const draftContentV2 = normalizeCommunityFunnelContentV2(
    value.draft_content_v2,
  );
  let draftVslUrl: string | null = null;
  try {
    draftVslUrl = normalizeCommunityFunnelVslUrl(value.draft_vsl_url);
  } catch {
    draftVslUrl = null;
  }
  if (!Object.prototype.hasOwnProperty.call(value, "draft_vsl_url")) {
    draftVslUrl =
      resolveCommunityFunnelDocumentVslUrl(draftDocumentV1) ??
      (base.hero_media_kind === "video"
        ? (() => {
            try {
              return normalizeCommunityFunnelVslUrl(base.hero_media_url);
            } catch {
              return null;
            }
          })()
        : null);
  }
  const legacyVariant: CommunityFunnelVariantConfig | null =
    draftContentV2 ||
    base.published_content_v2 ||
    draftDocumentV1 ||
    base.published_document_v1 ||
    draftVslUrl ||
    base.published_vsl_url
      ? {
          slot: "custom_1",
          draft_vsl_url: draftVslUrl,
          draft_content_v2: draftContentV2,
          draft_document_v1: draftDocumentV1,
          draft_revision:
            Number.isFinite(revision) && revision >= 0 ? revision : 0,
          draft_updated_at:
            Number.isFinite(draftUpdatedAt) && draftUpdatedAt > 0
              ? draftUpdatedAt
              : null,
          published_vsl_url: base.published_vsl_url,
          published_content_v2: base.published_content_v2,
          published_document_v1: base.published_document_v1,
          published_draft_revision:
            Number.isFinite(publishedRevision) && publishedRevision >= 0
              ? publishedRevision
              : 0,
          published_at:
            Number.isFinite(publishedAt) && publishedAt > 0
              ? publishedAt
              : null,
        }
      : null;
  const rawCustomFunnels =
    value.custom_funnels &&
    typeof value.custom_funnels === "object" &&
    !Array.isArray(value.custom_funnels)
      ? (value.custom_funnels as Record<string, unknown>)
      : {};
  const normalizeVariantCandidate = (
    candidate: Record<string, unknown>,
    slot: CommunityCustomFunnelSlot,
  ): CommunityFunnelVariantConfig => {
    const candidateBase = normalizeCommunityFunnelConfig(candidate);
    const candidateDraftDocument = normalizeCommunityFunnelDocumentV1(
      candidate.draft_document_v1,
    );
    const candidateDraftContent = normalizeCommunityFunnelContentV2(
      candidate.draft_content_v2,
    );
    let candidateDraftVsl: string | null = null;
    let candidatePublishedVsl: string | null = null;
    try {
      candidateDraftVsl = normalizeCommunityFunnelVslUrl(
        candidate.draft_vsl_url,
      );
    } catch {
      candidateDraftVsl = null;
    }
    try {
      candidatePublishedVsl = normalizeCommunityFunnelVslUrl(
        candidate.published_vsl_url,
      );
    } catch {
      candidatePublishedVsl = null;
    }
    const candidateRevision = Math.floor(Number(candidate.draft_revision));
    const candidatePublishedRevision = Math.floor(
      Number(candidate.published_draft_revision),
    );
    const candidateDraftUpdatedAt = Number(candidate.draft_updated_at);
    const candidatePublishedAt = Number(candidate.published_at);
    return {
      slot,
      draft_vsl_url: candidateDraftVsl,
      draft_content_v2: candidateDraftContent,
      draft_document_v1: candidateDraftDocument,
      draft_revision:
        Number.isFinite(candidateRevision) && candidateRevision >= 0
          ? candidateRevision
          : 0,
      draft_updated_at:
        Number.isFinite(candidateDraftUpdatedAt) && candidateDraftUpdatedAt > 0
          ? candidateDraftUpdatedAt
          : null,
      published_vsl_url:
        candidatePublishedVsl ?? candidateBase.published_vsl_url,
      published_content_v2: candidateBase.published_content_v2,
      published_document_v1: candidateBase.published_document_v1,
      published_draft_revision:
        Number.isFinite(candidatePublishedRevision) &&
        candidatePublishedRevision >= 0
          ? candidatePublishedRevision
          : 0,
      published_at:
        Number.isFinite(candidatePublishedAt) && candidatePublishedAt > 0
          ? candidatePublishedAt
          : null,
    };
  };
  const normalizeVariant = (
    slot: CommunityCustomFunnelSlot,
  ): CommunityFunnelVariantConfig | null => {
    const candidate = rawCustomFunnels[slot];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return slot === "custom_1" ? legacyVariant : null;
    }
    return normalizeVariantCandidate(
      candidate as Record<string, unknown>,
      slot,
    );
  };
  const customFunnels = {
    custom_1: normalizeVariant("custom_1"),
    custom_2: normalizeVariant("custom_2"),
  };
  return {
    ...base,
    active_slot: normalizeCommunityFunnelSlot(value.active_slot),
    custom_funnels: customFunnels,
    draft_vsl_url: draftVslUrl,
    draft_content_v2: draftContentV2,
    draft_document_v1: draftDocumentV1,
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
