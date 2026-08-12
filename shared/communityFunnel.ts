import type {
  CommunityCustomFunnelSlot,
  CommunityFunnelConfig,
  CommunityFunnelContentV2,
  CommunityFunnelHeroMediaKind,
  CommunityFunnelManagerConfig,
  CommunityFunnelSlot,
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
  return raw === "custom_1" || raw === "custom_2" ? raw : "default";
}

export const DEFAULT_COMMUNITY_FUNNEL_CONFIG: CommunityFunnelConfig = {
  hero_media_url: null,
  hero_media_kind: "image",
  active_slot: "default",
  published_vsl_url: null,
  published_content_v2: null,
};

export const DEFAULT_COMMUNITY_FUNNEL_MANAGER_CONFIG: CommunityFunnelManagerConfig = {
  ...DEFAULT_COMMUNITY_FUNNEL_CONFIG,
  custom_funnels: {
    custom_1: null,
    custom_2: null,
  },
};

function normalizeTrimmedString(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  return value.slice(0, maxLength);
}

function normalizeHeroMediaKind(raw: unknown): CommunityFunnelHeroMediaKind {
  return raw === "video" ? "video" : "image";
}

function validateRequiredText(
  raw: unknown,
  maxLength: number,
  requiredCode: string,
  tooLongCode: string,
): string {
  if (typeof raw !== "string") throw new Error(requiredCode);
  const value = raw.trim();
  if (!value) throw new Error(requiredCode);
  if (value.length > maxLength) throw new Error(tooLongCode);
  return value;
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  code: string,
) {
  const allowedKeys = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new Error(code);
  }
}

function assertSafeLongFormMarkdown(value: string) {
  // Long-form content enters a bounded renderer. Raw HTML, links, images,
  // tables, and code are intentionally outside the MVP grammar.
  if (/<\/?[a-z][^>]*>/i.test(value)) {
    throw new Error("community_funnel_long_form_html_forbidden");
  }
  if (/!?\[[^\]]*\]\([^)]*\)/.test(value)) {
    throw new Error("community_funnel_long_form_links_forbidden");
  }
  if (/```|`[^`]+`/.test(value)) {
    throw new Error("community_funnel_long_form_code_forbidden");
  }
  if (/^\s*\|.*\|\s*$/m.test(value)) {
    throw new Error("community_funnel_long_form_tables_forbidden");
  }
}

export function validateCommunityFunnelContentV2(
  raw: unknown,
): CommunityFunnelContentV2 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("community_funnel_content_invalid");
  }
  const value = raw as Record<string, unknown>;
  assertExactKeys(
    value,
    ["version", "headline", "subheadline", "pillars", "long_form_markdown"],
    "community_funnel_content_fields_invalid",
  );
  if (value.version !== 2) {
    throw new Error("community_funnel_content_version_invalid");
  }
  if (!Array.isArray(value.pillars) || value.pillars.length !== 3) {
    throw new Error("community_funnel_content_requires_three_pillars");
  }
  const pillars = value.pillars.map((rawPillar) => {
    if (!rawPillar || typeof rawPillar !== "object" || Array.isArray(rawPillar)) {
      throw new Error("community_funnel_pillar_invalid");
    }
    const pillar = rawPillar as Record<string, unknown>;
    assertExactKeys(
      pillar,
      ["title", "body"],
      "community_funnel_pillar_fields_invalid",
    );
    return {
      title: validateRequiredText(
        pillar.title,
        90,
        "community_funnel_pillar_title_required",
        "community_funnel_pillar_title_too_long",
      ),
      body: validateRequiredText(
        pillar.body,
        320,
        "community_funnel_pillar_body_required",
        "community_funnel_pillar_body_too_long",
      ),
    };
  }) as CommunityFunnelContentV2["pillars"];
  const longForm = validateRequiredText(
    value.long_form_markdown,
    12_000,
    "community_funnel_long_form_required",
    "community_funnel_long_form_too_long",
  );
  assertSafeLongFormMarkdown(longForm);
  return {
    version: 2,
    headline: validateRequiredText(
      value.headline,
      180,
      "community_funnel_headline_required",
      "community_funnel_headline_too_long",
    ),
    subheadline: validateRequiredText(
      value.subheadline,
      480,
      "community_funnel_subheadline_required",
      "community_funnel_subheadline_too_long",
    ),
    pillars,
    long_form_markdown: longForm,
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

export function normalizeCommunityFunnelConfig(raw: unknown): CommunityFunnelConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_COMMUNITY_FUNNEL_CONFIG;
  }
  const value = raw as Record<string, unknown>;
  const publishedContentV2 = normalizeCommunityFunnelContentV2(value.published_content_v2);
  const legacyActiveSlot = publishedContentV2 && value.live_mode !== "default"
    ? "custom_1"
    : "default";
  const activeSlot = Object.prototype.hasOwnProperty.call(value, "active_slot")
    ? normalizeCommunityFunnelSlot(value.active_slot)
    : legacyActiveSlot;
  return {
    hero_media_url: normalizeTrimmedString(value.hero_media_url, 2_000),
    hero_media_kind: normalizeHeroMediaKind(value.hero_media_kind),
    active_slot: activeSlot,
    published_vsl_url: normalizeTrimmedString(value.published_vsl_url, 2_000),
    published_content_v2: activeSlot === "default" ? null : publishedContentV2,
  };
}

export function normalizeCommunityFunnelManagerConfig(
  raw: unknown,
): CommunityFunnelManagerConfig {
  const publicConfig = normalizeCommunityFunnelConfig(raw);
  const value = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const normalizeRevision = (candidate: unknown) => {
    const revision = Math.floor(Number(candidate));
    return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
  };
  const normalizeTimestamp = (candidate: unknown) => {
    const timestamp = Number(candidate);
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
  };
  const normalizeVariantCandidate = (
    rawVariant: unknown,
    slot: CommunityCustomFunnelSlot,
  ): CommunityFunnelVariantConfig | null => {
    if (!rawVariant || typeof rawVariant !== "object" || Array.isArray(rawVariant)) {
      return null;
    }
    const candidate = rawVariant as Record<string, unknown>;
    const draftContent = normalizeCommunityFunnelContentV2(candidate.draft_content_v2);
    const publishedContent = normalizeCommunityFunnelContentV2(candidate.published_content_v2);
    const draftVsl = normalizeTrimmedString(candidate.draft_vsl_url, 2_000);
    const publishedVsl = normalizeTrimmedString(candidate.published_vsl_url, 2_000);
    if (!draftContent && !publishedContent && !draftVsl && !publishedVsl) return null;
    return {
      slot,
      draft_vsl_url: draftVsl,
      draft_content_v2: draftContent,
      draft_revision: normalizeRevision(candidate.draft_revision),
      draft_updated_at: normalizeTimestamp(candidate.draft_updated_at),
      published_vsl_url: publishedVsl,
      published_content_v2: publishedContent,
      published_draft_revision: normalizeRevision(candidate.published_draft_revision),
      published_at: normalizeTimestamp(candidate.published_at),
    };
  };
  const legacyVariant = normalizeVariantCandidate(value, "custom_1");
  const rawCustomFunnels =
    value.custom_funnels && typeof value.custom_funnels === "object" && !Array.isArray(value.custom_funnels)
      ? value.custom_funnels as Record<string, unknown>
      : {};
  return {
    ...publicConfig,
    custom_funnels: {
      custom_1:
        normalizeVariantCandidate(rawCustomFunnels.custom_1, "custom_1") ?? legacyVariant,
      custom_2: normalizeVariantCandidate(rawCustomFunnels.custom_2, "custom_2"),
    },
  };
}

export function normalizeCommunityFunnelVslUrl(raw: unknown): string | null {
  const value = normalizeTrimmedString(raw, 2_000);
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("community_funnel_vsl_url_unsupported");
  }
  if (url.protocol !== "https:") {
    throw new Error("community_funnel_vsl_url_unsupported");
  }
  if (!isSupportedCommunityFunnelVideoUrl(url.href)) {
    throw new Error("community_funnel_vsl_url_unsupported");
  }
  return url.href;
}

function isHostOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function isSupportedCommunityFunnelVideoUrl(raw: string | null): boolean {
  if (!raw) return false;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be" && Boolean(parts[0])) return true;
  if (
    isHostOrSubdomain(host, "youtube.com") ||
    isHostOrSubdomain(host, "youtube-nocookie.com")
  ) {
    if (url.pathname === "/watch" && url.searchParams.get("v")) return true;
    return ["embed", "shorts", "live", "v"].includes(parts[0] ?? "") && Boolean(parts[1]);
  }
  if (
    isHostOrSubdomain(host, "vimeo.com") &&
    parts.some((part) => /^\d{6,}$/.test(part))
  ) {
    return true;
  }
  if (
    isHostOrSubdomain(host, "loom.com") &&
    ["share", "embed"].includes(parts[0] ?? "") &&
    Boolean(parts[1])
  ) {
    return true;
  }
  if (
    isHostOrSubdomain(host, "wistia.com") ||
    isHostOrSubdomain(host, "wistia.net")
  ) {
    if (url.searchParams.get("wvideo")) return true;
    return parts.some(
      (part, index) => ["medias", "iframe"].includes(part) && Boolean(parts[index + 1]),
    );
  }
  return false;
}
