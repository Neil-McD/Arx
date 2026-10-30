import { useEffect, useMemo, useState } from "react";
import { DEFAULT_COMMUNITY_THEME, type CommunityThemeV1 } from "../../../../shared/communityTheme";

// DRAFT OPTIONS (2026-10-25): three Substack-feel looks for the Channels
// layout, and the far-left rail a little bigger and in the community's
// colours. The owner sets the community's default in Settings → Appearance →
// Customize (theme tokens channels_look, rail_size, rail_color), so it follows
// the theme's draft, preview and publish. Anyone can try another one from the
// Display menu at the top right (owners and admins only); that pick is this browser's only
// (localStorage) until "Community default" clears it. The address overrides
// both for screenshots: ?feel=, ?rail_size=, ?rail_color=.

export type ChannelsFeel = CommunityThemeV1["channels_look"];
export type RailSize = CommunityThemeV1["rail_size"];
export type RailColor = CommunityThemeV1["rail_color"];
export type DraftLook = { feel: ChannelsFeel; railSize: RailSize; railColor: RailColor };

export const CHANNELS_FEELS: { key: ChannelsFeel; label: string; description: string }[] = [
  { key: "current", label: "Current", description: "Today's Channels look" },
  { key: "quiet", label: "Quiet", description: "Plain nav, one centred column" },
  { key: "reader", label: "Reader", description: "Reading column and post lists" },
  { key: "publication", label: "Publication", description: "Masthead and editorial pages" },
];

export const RAIL_SIZES: { key: RailSize; label: string; description: string }[] = [
  { key: "standard", label: "Standard icons", description: "Today's rail" },
  { key: "large", label: "Bigger icons", description: "Larger community icons" },
];

export const RAIL_COLORS: { key: RailColor; label: string; description: string }[] = [
  { key: "polynet", label: "Polynet", description: "Today's dark rail" },
  { key: "blend", label: "Blend", description: "Same colour as the page" },
  { key: "tint", label: "Tint", description: "A soft wash of the brand colour" },
  { key: "brand", label: "Brand", description: "Solid brand colour" },
];

const FIELDS = [
  { field: "feel", param: "feel", storage: "polynet.channelsFeel", values: CHANNELS_FEELS },
  { field: "railSize", param: "rail_size", storage: "polynet.railSize", values: RAIL_SIZES },
  { field: "railColor", param: "rail_color", storage: "polynet.railColor", values: RAIL_COLORS },
] as const;
const EVENT = "polynet:draft-look";

function valid(entry: (typeof FIELDS)[number], value: string | null | undefined): boolean {
  return (entry.values as readonly { key: string }[]).some((option) => option.key === value);
}

const URL_OVERRIDE: Partial<DraftLook> = (() => {
  const override: Record<string, string> = {};
  try {
    const params = new URLSearchParams(window.location.search);
    for (const entry of FIELDS) {
      const value = params.get(entry.param);
      if (valid(entry, value)) override[entry.field] = value!;
    }
  } catch {
    // No address to read: no override.
  }
  return override as Partial<DraftLook>;
})();

function readPicks(): Partial<DraftLook> {
  const picks: Record<string, string> = {};
  for (const entry of FIELDS) {
    try {
      const stored = window.localStorage.getItem(entry.storage);
      if (valid(entry, stored)) picks[entry.field] = stored!;
    } catch {
      // Private windows: no picks.
    }
  }
  return picks as Partial<DraftLook>;
}

/** Saves this browser's pick; null clears every pick back to the community's default. */
export function chooseDraftLook(change: Partial<DraftLook> | null) {
  for (const entry of FIELDS) {
    try {
      if (change === null) window.localStorage.removeItem(entry.storage);
      else if (change[entry.field]) window.localStorage.setItem(entry.storage, change[entry.field]!);
    } catch {
      // The pick lasts until reload.
    }
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function communityDraftLook(theme: CommunityThemeV1 | null): DraftLook {
  const look = theme ?? DEFAULT_COMMUNITY_THEME;
  return {
    feel: look.channels_look ?? "current",
    railSize: look.rail_size ?? "standard",
    railColor: look.rail_color ?? "polynet",
  };
}

/** The look in force: the address, then this browser's pick, then the community's default.
 *  Only the owner's team can try other looks, so a member's
 *  old pick from before that is ignored. */
export function useDraftLook(theme: CommunityThemeV1 | null, options: { canPick?: boolean } = {}): { look: DraftLook; picked: boolean } {
  const canPick = options.canPick ?? true;
  const [picks, setPicks] = useState<Partial<DraftLook>>(() => (typeof window === "undefined" ? {} : readPicks()));
  useEffect(() => {
    const onChange = () => setPicks(readPicks());
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  const base = communityDraftLook(theme);
  return useMemo(() => ({
    look: { ...base, ...(canPick ? picks : {}), ...URL_OVERRIDE },
    picked: canPick && Object.keys(picks).length > 0,
  }), [base.feel, base.railSize, base.railColor, picks, canPick]);
}
