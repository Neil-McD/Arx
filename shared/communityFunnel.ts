import type {
  CommunityFunnelConfig,
  CommunityFunnelContentV2,
  CommunityFunnelHeroMediaKind,
  CommunityFunnelManagerConfig,
} from "./communityTypes";

export const DEFAULT_COMMUNITY_FUNNEL_CONFIG: CommunityFunnelConfig = {
  hero_media_url: null,
  hero_media_kind: "image",
  live_mode: "default",
  published_vsl_url: null,
  published_content_v2: null,
};

export const DEFAULT_COMMUNITY_FUNNEL_MANAGER_CONFIG: CommunityFunnelManagerConfig = {
  ...DEFAULT_COMMUNITY_FUNNEL_CONFIG,
  draft_vsl_url: null,
  draft_content_v2: null,
  draft_revision: 0,
  draft_updated_at: null,
  published_draft_revision: 0,
  published_at: null,
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
  const publishedContentV2 = normalizeCommunityFunnelContentV2(
    value.published_content_v2,
  );
  // Old rows predate the explicit selector; a published custom snapshot was
  // their live surface. Only an explicit `default` opts such a row out.
  const liveMode = publishedContentV2 && value.live_mode !== "default"
    ? "custom"
    : "default";
  return {
    hero_media_url: normalizeTrimmedString(value.hero_media_url, 2_000),
    hero_media_kind: normalizeHeroMediaKind(value.hero_media_kind),
    live_mode: liveMode,
    published_vsl_url: normalizeTrimmedString(value.published_vsl_url, 2_000),
    published_content_v2: liveMode === "custom" ? publishedContentV2 : null,
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
  return {
    ...publicConfig,
    published_vsl_url: normalizeTrimmedString(value.published_vsl_url, 2_000),
    published_content_v2: normalizeCommunityFunnelContentV2(value.published_content_v2),
    draft_vsl_url: normalizeTrimmedString(value.draft_vsl_url, 2_000),
    draft_content_v2: normalizeCommunityFunnelContentV2(value.draft_content_v2),
    draft_revision: normalizeRevision(value.draft_revision),
    draft_updated_at: normalizeTimestamp(value.draft_updated_at),
    published_draft_revision: normalizeRevision(value.published_draft_revision),
    published_at: normalizeTimestamp(value.published_at),
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
  const host = url.hostname.toLowerCase();
  const supported = ["youtube.com", "youtu.be", "vimeo.com", "loom.com", "wistia.com", "wistia.net"]
    .some((domain) => host === domain || host.endsWith(`.${domain}`));
  if (!supported) throw new Error("community_funnel_vsl_url_unsupported");
  return url.href;
}
