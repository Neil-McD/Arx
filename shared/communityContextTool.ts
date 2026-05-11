export type RuntimeCommunityContextToolInput = {
  community_name?: unknown;
  community_slug?: unknown;
  community_one_liner?: unknown;
  community_about?: unknown;
};

export type ActiveCommunityContextToolPayload = {
  ok: true;
  active_community: {
    name: string | null;
    slug: string | null;
    one_liner: string | null;
    about_excerpt: string | null;
  };
};

const COMMUNITY_CONTEXT_NAME_CHARS = 120;
const COMMUNITY_CONTEXT_SLUG_CHARS = 120;
const COMMUNITY_CONTEXT_ONE_LINER_CHARS = 240;
const COMMUNITY_CONTEXT_ABOUT_CHARS = 2_000;

function truncateCommunityContextText(value: unknown, limit: number): string | null {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 3).trimEnd()}...`;
}

export function buildActiveCommunityContextToolPayload(
  input: RuntimeCommunityContextToolInput,
): ActiveCommunityContextToolPayload {
  return {
    ok: true,
    active_community: {
      name: truncateCommunityContextText(
        input.community_name,
        COMMUNITY_CONTEXT_NAME_CHARS,
      ),
      slug: truncateCommunityContextText(
        input.community_slug,
        COMMUNITY_CONTEXT_SLUG_CHARS,
      ),
      one_liner: truncateCommunityContextText(
        input.community_one_liner,
        COMMUNITY_CONTEXT_ONE_LINER_CHARS,
      ),
      about_excerpt: truncateCommunityContextText(
        input.community_about,
        COMMUNITY_CONTEXT_ABOUT_CHARS,
      ),
    },
  };
}
