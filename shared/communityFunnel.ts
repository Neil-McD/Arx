import type {
  CommunityFunnelConfig,
  CommunityFunnelDocumentV1,
  CommunityFunnelHeroMediaKind,
  CommunityFunnelManagerConfig,
} from "./communityTypes";

export const DEFAULT_COMMUNITY_FUNNEL_CONFIG: CommunityFunnelConfig = {
  hero_media_url: null,
  hero_media_kind: "image",
};

export const DEFAULT_COMMUNITY_FUNNEL_MANAGER_CONFIG: CommunityFunnelManagerConfig = {
  ...DEFAULT_COMMUNITY_FUNNEL_CONFIG,
  draft_document_v1: null,
  draft_revision: 0,
};

export const DEFAULT_COMMUNITY_FUNNEL_PILLARS: CommunityFunnelDocumentV1["pillars"] = [
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
];

function normalizeTrimmedString(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  return value.slice(0, maxLength);
}

function normalizeHeroMediaKind(raw: unknown): CommunityFunnelHeroMediaKind {
  return raw === "video" ? "video" : "image";
}

export function normalizeCommunityFunnelConfig(raw: unknown): CommunityFunnelConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_COMMUNITY_FUNNEL_CONFIG;
  }
  const value = raw as Record<string, unknown>;
  return {
    hero_media_url: normalizeTrimmedString(value.hero_media_url, 2_000),
    hero_media_kind: normalizeHeroMediaKind(value.hero_media_kind),
  };
}

function normalizeRequiredText(raw: unknown, maxLength: number): string {
  return typeof raw === "string" ? raw.trim().slice(0, maxLength) : "";
}

export function normalizeCommunityFunnelDocumentV1(raw: unknown): CommunityFunnelDocumentV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const rawPillars = Array.isArray(value.pillars) ? value.pillars : [];
  const pillars = DEFAULT_COMMUNITY_FUNNEL_PILLARS.map((fallback, index) => {
    const rawPillar = rawPillars[index];
    const pillar = rawPillar && typeof rawPillar === "object" && !Array.isArray(rawPillar)
      ? rawPillar as Record<string, unknown>
      : {};
    return {
      title: normalizeRequiredText(pillar.title, 80) || fallback.title,
      body: normalizeRequiredText(pillar.body, 280) || fallback.body,
    };
  }) as CommunityFunnelDocumentV1["pillars"];
  const faq = (Array.isArray(value.faq) ? value.faq : [])
    .slice(0, 3)
    .map((rawItem) => {
      const item = rawItem && typeof rawItem === "object" && !Array.isArray(rawItem)
        ? rawItem as Record<string, unknown>
        : {};
      return {
        question: normalizeRequiredText(item.question, 160),
        answer: normalizeRequiredText(item.answer, 1_200),
      };
    });
  return {
    version: 1,
    template: "editorial_vsl",
    headline: normalizeRequiredText(value.headline, 160),
    subheadline: normalizeRequiredText(value.subheadline, 360),
    intro_video_url: normalizeTrimmedString(value.intro_video_url, 2_000),
    pillars,
    founder_quote: normalizeTrimmedString(value.founder_quote, 1_200),
    faq,
  };
}

export function buildDefaultCommunityFunnelDocumentV1(params: {
  communityName: string;
  oneLiner?: string | null;
  about?: string | null;
  heroMediaUrl?: string | null;
}): CommunityFunnelDocumentV1 {
  const communityName = normalizeRequiredText(params.communityName, 80) || "this community";
  const oneLiner = normalizeRequiredText(params.oneLiner, 160);
  const about = normalizeRequiredText(params.about, 360);
  return {
    version: 1,
    template: "editorial_vsl",
    headline: oneLiner || `Join ${communityName}`,
    subheadline: about || `Meet the people, knowledge, and agents inside ${communityName}.`,
    intro_video_url: normalizeTrimmedString(params.heroMediaUrl, 2_000),
    pillars: DEFAULT_COMMUNITY_FUNNEL_PILLARS.map((pillar) => ({ ...pillar })) as CommunityFunnelDocumentV1["pillars"],
    founder_quote: null,
    faq: [],
  };
}

export function normalizeCommunityFunnelManagerConfig(raw: unknown): CommunityFunnelManagerConfig {
  const base = normalizeCommunityFunnelConfig(raw);
  const value = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const revision = Math.floor(Number(value.draft_revision));
  return {
    ...base,
    draft_document_v1: normalizeCommunityFunnelDocumentV1(value.draft_document_v1),
    draft_revision: Number.isFinite(revision) && revision >= 0 ? revision : 0,
  };
}
