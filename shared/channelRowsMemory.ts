// Layout before data (docs/specs/web-architecture-end-state.md): the left
// column reserves its channel rows before the list arrives, so the pages
// under it never move when it does. How many rows a community had last time
// is remembered in this browser; a first visit reserves two (General and one
// more, the commonest shape). A convenience only: with no storage it is two.

const DEFAULT_ROWS = 2;
const MAX_ROWS = 12;

const key = (communitySlug: string) => `polynet_channel_rows:${communitySlug}`;

export function channelRowsToReserve(remembered: number | null): number {
  if (remembered === null || !Number.isFinite(remembered)) return DEFAULT_ROWS;
  return Math.max(1, Math.min(MAX_ROWS, Math.floor(remembered)));
}

export function rememberChannelRows(communitySlug: string | null | undefined, rows: number): void {
  const slug = String(communitySlug ?? "").trim();
  if (!slug || rows <= 0) return;
  try { window.localStorage.setItem(key(slug), String(rows)); } catch { /* not remembered */ }
}

export function recallChannelRows(communitySlug: string | null | undefined): number | null {
  const slug = String(communitySlug ?? "").trim();
  if (!slug) return null;
  try {
    const raw = window.localStorage.getItem(key(slug));
    const rows = raw === null ? NaN : Number(raw);
    return Number.isFinite(rows) && rows > 0 ? rows : null;
  } catch { return null; }
}

// The community in the address (/c/<slug>/..., or /m/c/<slug>/... on a
// phone), for the moments before the community itself has loaded.
export function communitySlugInAddress(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const at = segments.indexOf("c");
  return at >= 0 && at <= 1 ? segments[at + 1] ?? null : null;
}
