import type {
  CommunityFunnelConfig,
  CommunityFunnelHeroMediaKind,
} from "./communityTypes";

export const DEFAULT_COMMUNITY_FUNNEL_CONFIG: CommunityFunnelConfig = {
  hero_media_url: null,
  hero_media_kind: "image",
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
