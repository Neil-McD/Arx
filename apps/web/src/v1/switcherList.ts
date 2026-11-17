// The community switcher's list. Up to ten communities are one list, the
// one you're in first. From SWITCHER_GROUPS_FROM it is "Recent" (where you
// are, then the two you last opened) and "All". When each was last opened is
// remembered in this browser; a convenience only, the list works without it.

// A list long enough to search gets a search box.
export const SWITCHER_SEARCH_FROM = 7;
export const SWITCHER_GROUPS_FROM = 11;
const RECENT_SHOWN = 3;
const KEY = "polynet_community_opened";

type Listed = { id: string; slug?: string | null; name?: string | null };

export function recallCommunitiesOpened(): Record<string, number> {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
  } catch { return {}; }
}

export function rememberCommunityOpened(slug: string, now: number): void {
  if (!slug) return;
  try {
    // Keep the 20 most recent, so the record never grows without end.
    const kept = Object.entries({ ...recallCommunitiesOpened(), [slug]: now }).sort((a, b) => b[1] - a[1]).slice(0, 20);
    window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch { /* not remembered */ }
}

export function switcherGroups<C extends Listed>(communities: C[], selectedSlug: string | null, openedAt: Record<string, number>, query: string): { recent: C[]; all: C[] } {
  const slugOf = (community: C) => String(community.slug ?? "");
  const current = communities.filter((community) => slugOf(community) === selectedSlug);
  const others = communities.filter((community) => slugOf(community) !== selectedSlug);
  const needle = query.trim().toLowerCase();
  if (needle) return { recent: [], all: [...current, ...others].filter((community) => String(community.name ?? "").toLowerCase().includes(needle)) };
  if (communities.length < SWITCHER_GROUPS_FROM) return { recent: [], all: [...current, ...others] };
  const lately = others
    .filter((community) => openedAt[slugOf(community)] !== undefined)
    .sort((a, b) => openedAt[slugOf(b)]! - openedAt[slugOf(a)]!)
    .slice(0, RECENT_SHOWN - current.length);
  const recent = [...current, ...lately];
  return { recent, all: others.filter((community) => !lately.includes(community)) };
}

// A community with no picture of its own gets a colour that is always the
// same for it, so its tile can be told from the others at a glance.
const TONES = [
  "linear-gradient(135deg,#5b6cf0,#8e6bd9)",
  "linear-gradient(135deg,#f08a4b,#d9596b)",
  "linear-gradient(135deg,#7c5cff,#3b2a8a)",
  "linear-gradient(135deg,#3d8fd6,#1f3b8a)",
  "linear-gradient(135deg,#3dae8c,#1d5c4a)",
  "linear-gradient(135deg,#f0667a,#3b3a6b)",
];

export function communityMarkTone(id: string): string {
  let sum = 0;
  for (let index = 0; index < id.length; index += 1) sum = (sum * 31 + id.charCodeAt(index)) >>> 0;
  return TONES[sum % TONES.length]!;
}
