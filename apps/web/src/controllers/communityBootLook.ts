// The loading screen wears the community's own look.
// Once a community's theme is on screen, its resolved colours, name and logo
// are kept in this browser under the community's address. On the next visit,
// index.html sets those colours on the page before the app starts, so the
// wait is in the community's colours instead of Polynet's, and the hold names
// the community. The real theme replaces them as soon as it loads.

export const COMMUNITY_BOOT_LOOK_PREFIX = "polynet-boot-look:";
// Must match the attribute and the storage shape read in index.html.
const BOOT_ATTRIBUTE = "data-boot-look";
const MAX_LOGO_CHARS = 60_000;

export type CommunityBootLook = {
  v: 1;
  name: string;
  logo: string | null;
  vars: Record<string, string>;
};

function routeSlug(): string | null {
  const match = /^\/c\/([^/?#]+)/.exec(window.location.pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function readCommunityBootLook(slug = routeSlug()): CommunityBootLook | null {
  if (!slug) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(COMMUNITY_BOOT_LOOK_PREFIX + slug) ?? "null") as CommunityBootLook | null;
    return parsed?.v === 1 && parsed.vars && typeof parsed.vars === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** Keeps the colours the theme resolved to on `surface` (fonts load later, so they're left out). */
export function rememberCommunityBootLook(args: {
  slug: string;
  name: string;
  logoUrl: string | null;
  surface: HTMLElement;
  compiledCss: string;
}) {
  const style = getComputedStyle(args.surface);
  const vars: Record<string, string> = {};
  for (const match of args.compiledCss.matchAll(/(--[\w-]+)\s*:/g)) {
    const name = match[1];
    if (name in vars || /font|radius|shadow|type-|weight|tracking|case|numerals|columns|ratio|height|gap|pad|width|max|space|display|scale|siblings|banner-name/.test(name)) continue;
    const value = style.getPropertyValue(name).trim();
    if (value && value.length <= 200) vars[name] = value;
  }
  const look: CommunityBootLook = {
    v: 1,
    name: args.name,
    logo: args.logoUrl && args.logoUrl.length <= MAX_LOGO_CHARS ? args.logoUrl : null,
    vars,
  };
  try {
    localStorage.setItem(COMMUNITY_BOOT_LOOK_PREFIX + args.slug, JSON.stringify(look));
  } catch {
    // Storage full or blocked: the next load just starts in Polynet's look.
  }
}

export function forgetCommunityBootLook(slug: string) {
  try {
    localStorage.removeItem(COMMUNITY_BOOT_LOOK_PREFIX + slug);
  } catch {
    // Nothing to forget.
  }
}

/** Takes the boot colours off the page, once the real theme is on or not coming. */
export function clearCommunityBootLook() {
  const root = document.documentElement;
  const names = (root.getAttribute(BOOT_ATTRIBUTE) ?? "").split(" ").filter(Boolean);
  if (!names.length) return;
  names.forEach((name) => root.style.removeProperty(name));
  root.removeAttribute(BOOT_ATTRIBUTE);
}

// A safety net: the boot colours never outstay a slow or failed theme read.
if (typeof window !== "undefined") window.setTimeout(clearCommunityBootLook, 20_000);
