export const COMMUNITY_AGENT_COMMUNITY_SECTIONS = [
  "chat",
  "agent",
  "resources",
  "events",
  "settings",
  "polynet",
  "ai_agent",
  "workflows",
  "funnel",
  "analytics",
] as const;

export type CommunityAgentCommunitySection =
  (typeof COMMUNITY_AGENT_COMMUNITY_SECTIONS)[number];

export const COMMUNITY_AGENT_PLATFORM_PAGES = [
  "settings",
  "docs",
  "operator",
  "workspace",
] as const;

export type CommunityAgentPlatformPage =
  (typeof COMMUNITY_AGENT_PLATFORM_PAGES)[number];

export type CommunityAgentSurfaceContextV1 =
  | {
      version: 1;
      kind: "discover";
      section: "communities";
    }
  | {
      version: 1;
      kind: "community";
      community_slug: string;
      /** Server-derived from the persisted thread; never accepted by normalization. */
      community_conversation?: true;
      section: CommunityAgentCommunitySection;
    }
  | {
      version: 1;
      kind: "platform";
      page: CommunityAgentPlatformPage;
      section: string | null;
    };

const COMMUNITY_SECTION_SET = new Set<string>(COMMUNITY_AGENT_COMMUNITY_SECTIONS);
const PLATFORM_PAGE_SET = new Set<string>(COMMUNITY_AGENT_PLATFORM_PAGES);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeCommunitySlug(value: unknown): string | null {
  const slug = String(value ?? "").trim().toLowerCase();
  return /^[a-z0-9-]{3,64}$/.test(slug) ? slug : null;
}

function normalizeSection(value: unknown, maxLength = 80): string | null {
  const section = String(value ?? "").trim().toLowerCase();
  if (!section || section.length > maxLength) return null;
  return /^[a-z0-9_-]+$/.test(section) ? section : null;
}

export function normalizeCommunityAgentSurfaceContext(
  value: unknown,
): CommunityAgentSurfaceContextV1 | null {
  const row = asRecord(value);
  if (!row || row.version !== 1) return null;
  const kind = String(row.kind ?? "").trim().toLowerCase();
  if (kind === "discover") {
    return { version: 1, kind: "discover", section: "communities" };
  }
  if (kind === "community") {
    const communitySlug = normalizeCommunitySlug(row.community_slug);
    const section = normalizeSection(row.section);
    if (!communitySlug || !section || !COMMUNITY_SECTION_SET.has(section)) return null;
    return {
      version: 1,
      kind: "community",
      community_slug: communitySlug,
      section: section as CommunityAgentCommunitySection,
    };
  }
  if (kind === "platform") {
    const page = normalizeSection(row.page);
    if (!page || !PLATFORM_PAGE_SET.has(page)) return null;
    const rawSection = String(row.section ?? "").trim();
    const section = normalizeSection(rawSection);
    if (rawSection && !section) return null;
    return {
      version: 1,
      kind: "platform",
      page: page as CommunityAgentPlatformPage,
      section,
    };
  }
  return null;
}

function titleCase(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function describeCommunityAgentSurface(
  surface: CommunityAgentSurfaceContextV1,
  communityName?: string | null,
): string {
  if (surface.kind === "discover") return "Discover";
  if (surface.kind === "community") {
    const name = String(communityName ?? "").trim() || surface.community_slug;
    return `${name} · ${titleCase(surface.section)}`;
  }
  return surface.section
    ? `${titleCase(surface.page)} · ${titleCase(surface.section)}`
    : titleCase(surface.page);
}

export type CommunityAgentSurfacePresentation = {
  surfaceLabel: string;
  title: string;
  composerLabel: string;
  emptyLabel: string;
  loadingLabel: string;
};

export function buildCommunityAgentSurfacePresentation(
  surface: CommunityAgentSurfaceContextV1,
  communityName?: string | null,
): CommunityAgentSurfacePresentation {
  const surfaceLabel = describeCommunityAgentSurface(surface, communityName);
  return {
    surfaceLabel,
    title: "Polynet Intelligence",
    composerLabel: "Message Polynet Intelligence",
    emptyLabel: surface.kind === "discover"
      ? "Ask Polynet Intelligence to help you explore communities."
      : `Ask Polynet Intelligence about ${surfaceLabel}.`,
    loadingLabel: "Opening Polynet Intelligence",
  };
}

export function renderCommunityAgentSurfaceContextForPrompt(
  surface: CommunityAgentSurfaceContextV1 | null | undefined,
  communityName?: string | null,
): string | null {
  if (!surface) return null;
  if (surface.kind === "discover") {
    return [
      "CURRENT_SURFACE",
      "The member is currently on Polynet Discover, browsing communities.",
      "Primary orientation: help them discover, compare, understand, and choose communities.",
      "No community is the active lens on this surface. Do not treat Polynet or the last visited community as implicitly active.",
      "This surface description guides relevance only. Tool availability and backend authorization remain authoritative.",
    ].join("\n");
  }
  if (surface.kind === "community") {
    const name = String(communityName ?? "").trim() || surface.community_slug;
    return [
      "CURRENT_SURFACE",
      `The member is currently inside the ${name} community on its ${surface.section} section.`,
      "Treat the active community as the primary context for this turn while preserving the member's broader intent.",
      "Use tools for the active community first when the request depends on community-specific facts or resources.",
      "This surface description guides relevance only. The server-validated community lens and tool policy remain authoritative.",
    ].join("\n");
  }
  return [
    "CURRENT_SURFACE",
    `The member is currently on the Polynet ${surface.page} page${surface.section ? ` in the ${surface.section} section` : ""}.`,
    "No community is the active lens on this surface.",
    "Orient the answer to this platform page without inventing page state or available actions.",
    "This surface description guides relevance only. Tool availability and backend authorization remain authoritative.",
  ].join("\n");
}
