// Layout before data (docs/specs/web-architecture-end-state.md, rule 3): the left
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

// The same for the rest of the left column: its page rows (Pods, Knowledge,
// Events, a connected app, Members) and its foot (Analytics, Invite people).
// What a person sees there depends on their role, which arrives with the
// access record, so the count they saw last time holds the place.
export type NavRowsPart = "pages" | "foot";
const NAV_DEFAULT_ROWS: Record<NavRowsPart, number> = { pages: 3, foot: 1 };
const navKey = (part: NavRowsPart, communitySlug: string) => `polynet_nav_rows:${part}:${communitySlug}`;

export function navRowsToReserve(part: NavRowsPart, remembered: number | null): number {
  if (remembered === null || !Number.isFinite(remembered)) return NAV_DEFAULT_ROWS[part];
  return Math.max(0, Math.min(MAX_ROWS, Math.floor(remembered)));
}

export function rememberNavRows(communitySlug: string | null | undefined, part: NavRowsPart, rows: number): void {
  const slug = String(communitySlug ?? "").trim();
  if (!slug || rows < 0) return;
  try { window.localStorage.setItem(navKey(part, slug), String(rows)); } catch { /* not remembered */ }
}

export function recallNavRows(communitySlug: string | null | undefined, part: NavRowsPart): number | null {
  const slug = String(communitySlug ?? "").trim();
  if (!slug) return null;
  try {
    const raw = window.localStorage.getItem(navKey(part, slug));
    const rows = raw === null ? NaN : Number(raw);
    return Number.isFinite(rows) && rows >= 0 ? rows : null;
  } catch { return null; }
}

// Knowledge's right column: reserve its space from the first paint on desktop
// so the course shelf never flashes full-width and collapses when the panel's
// data arrives. Hosts always have a right column; members remember per
// community (defaulting to reserved on first visit for active communities).
const knowledgeRailKey = (communityId: string, role: "host" | "member") =>
  `polynet_knowledge_rail:${role}:${communityId}`;

export function shouldReserveKnowledgeRail(args: {
  canManage: boolean;
  remembered: boolean | null;
  settled: boolean;
  hasContent: boolean;
}): boolean {
  if (args.settled) return args.hasContent;
  if (args.canManage) return true;
  return args.remembered ?? true;
}

export function rememberKnowledgeRail(
  communityId: string | null | undefined,
  canManage: boolean,
  hasRail: boolean,
): void {
  const id = String(communityId ?? "").trim();
  if (!id) return;
  const role = canManage ? "host" : "member";
  try { window.localStorage.setItem(knowledgeRailKey(id, role), hasRail ? "1" : "0"); } catch { /* not remembered */ }
}

export function recallKnowledgeRail(
  communityId: string | null | undefined,
  canManage: boolean,
): boolean | null {
  const id = String(communityId ?? "").trim();
  if (!id) return null;
  const role = canManage ? "host" : "member";
  try {
    const raw = window.localStorage.getItem(knowledgeRailKey(id, role));
    return raw === "1" ? true : raw === "0" ? false : null;
  } catch { return null; }
}
