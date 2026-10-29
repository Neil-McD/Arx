// Ready-made colour themes for Settings → Appearance → Customize → Colours.
// A palette only sets colours: fonts, corners, course cards and the rest of
// the owner's look stay as they are. Each palette has a light and a dark
// scheme that pass the theme contract's contrast floors; applying one keeps
// the schemes the theme already uses (light only, dark only, or both).
// Agents and the CLI name them by id. Unlike the UI design skill, which
// derives colours from a founder's brand, this is a menu people pick from.
import { DEFAULT_COMMUNITY_THEME, contrastRatio, nearestPassingColor, normalizeCommunityTheme, type CommunityThemeColors, type CommunityThemeScheme, type CommunityThemeV1 } from "./communityTheme";
import { COMMUNITY_THEME_PRESETS } from "./communityThemePresets";

export type CommunityThemePalette = {
  id: string;
  name: string;
  description: string;
  schemes: Record<CommunityThemeScheme, CommunityThemeColors>;
};

type Raw = [background: string, surface: string, text: string, muted: string, border: string,
  accent: string, on_accent: string, button: string, on_button: string];

function colors(raw: Raw): CommunityThemeColors {
  const [background, surface, text, muted, border, accent, on_accent, button, on_button] = raw;
  return { background, surface, text, muted, border, accent, on_accent, button, on_button };
}

const RAW_PALETTES: { id: string; name: string; description: string; light: Raw; dark: Raw }[] = [
  { id: "maroon-gold", name: "Maroon & Gold", description: "Deep maroon buttons with antique-gold links on warm paper.",
    light: ["#FBF8F3", "#FFFFFF", "#2A1215", "#6B5457", "#EADFD6", "#8A6A12", "#FFFFFF", "#7A1F2B", "#FFFFFF"],
    dark: ["#1A0D10", "#241418", "#F7EFE6", "#C9B8AE", "#3A2428", "#D4AF37", "#1A0D10", "#D4AF37", "#1A0D10"] },
  { id: "purple-sky", name: "Purple & Light Blue", description: "Royal purple with a clear sky-blue accent.",
    light: ["#F7F6FC", "#FFFFFF", "#1E1830", "#5D5870", "#E2DFF0", "#2F6FB0", "#FFFFFF", "#5B3A9E", "#FFFFFF"],
    dark: ["#15121F", "#1F1A2D", "#F2F0FA", "#BDB6D3", "#332B47", "#8EC5F0", "#15121F", "#B9A3F2", "#15121F"] },
  { id: "forest-gold", name: "Dark Green & Gold", description: "Forest green and gold, like an old library.",
    light: ["#F8F7F1", "#FFFFFF", "#12201A", "#4F5E55", "#E0E2D6", "#8A6A12", "#FFFFFF", "#1E4D36", "#FFFFFF"],
    dark: ["#0D1A14", "#14241C", "#F2F0E6", "#B9C2B5", "#23372C", "#D9B44A", "#0D1A14", "#D9B44A", "#0D1A14"] },
  { id: "navy-brass", name: "Navy & Brass", description: "Navy and brushed brass, calm and established.",
    light: ["#F7F7F4", "#FFFFFF", "#111B2E", "#525C6E", "#DFE2E8", "#8C6B2E", "#FFFFFF", "#1B2C4F", "#FFFFFF"],
    dark: ["#0C1424", "#131D31", "#F1F2F5", "#B5BCCB", "#24304A", "#C9A45C", "#0C1424", "#C9A45C", "#0C1424"] },
  { id: "onyx-gold", name: "Onyx & Gold", description: "Black and gold, quiet luxury.",
    light: ["#FAF8F2", "#FFFFFF", "#141414", "#5A5852", "#E6E1D3", "#8A6A12", "#FFFFFF", "#141414", "#FFFFFF"],
    dark: ["#0B0B0B", "#161513", "#F5F1E6", "#BDB6A3", "#2C2A25", "#D4AF37", "#0B0B0B", "#D4AF37", "#0B0B0B"] },
  { id: "teal-coral", name: "Teal & Coral", description: "Deep teal with a warm coral accent.",
    light: ["#F6FAF9", "#FFFFFF", "#0F2524", "#4C6260", "#DAE7E5", "#C2412D", "#FFFFFF", "#0F6B67", "#FFFFFF"],
    dark: ["#0C1D1C", "#132927", "#EFF7F5", "#B0C7C3", "#21403D", "#FF8A70", "#0C1D1C", "#4FC2B8", "#0C1D1C"] },
  { id: "deep-sea", name: "Deep Sea & Sky", description: "Ocean navy with a bright sky-cyan accent.",
    light: ["#F5F8FB", "#FFFFFF", "#0E1C2C", "#4F5F70", "#DCE5EE", "#0A7298", "#FFFFFF", "#0E3A66", "#FFFFFF"],
    dark: ["#08131F", "#0F1D2D", "#EEF4FA", "#AFC0D1", "#1E3248", "#5CC8F0", "#08131F", "#5CC8F0", "#08131F"] },
  { id: "indigo-saffron", name: "Indigo & Saffron", description: "Rich indigo lit by saffron yellow.",
    light: ["#F7F7FB", "#FFFFFF", "#15173A", "#555874", "#DEDFEE", "#A35F00", "#FFFFFF", "#2F338F", "#FFFFFF"],
    dark: ["#10112A", "#181A3A", "#F2F2FA", "#B8B9D6", "#2A2D55", "#F5B53D", "#10112A", "#F5B53D", "#10112A"] },
  { id: "plum-rose", name: "Plum & Rose", description: "Dark plum with a soft rose accent.",
    light: ["#FBF7F8", "#FFFFFF", "#2A1426", "#6A5465", "#EDDFE6", "#B03A6A", "#FFFFFF", "#5E2150", "#FFFFFF"],
    dark: ["#1B0F1A", "#261624", "#F8EEF3", "#CDB6C5", "#3D2639", "#F29BBE", "#1B0F1A", "#F29BBE", "#1B0F1A"] },
  { id: "cherry-cream", name: "Cherry & Cream", description: "Confident cherry red on cream.",
    light: ["#FBF7F0", "#FFFFFF", "#22130F", "#665650", "#EADFD2", "#B3202E", "#FFFFFF", "#B3202E", "#FFFFFF"],
    dark: ["#170E0D", "#221514", "#F8EFE6", "#C9B7AE", "#3A2523", "#FF7B7B", "#170E0D", "#FF7B7B", "#170E0D"] },
  { id: "charcoal-copper", name: "Charcoal & Copper", description: "Graphite with a burnished copper accent.",
    light: ["#F7F5F2", "#FFFFFF", "#1D1D1F", "#5C5A57", "#E3DFDA", "#A4552A", "#FFFFFF", "#2B2B2E", "#FFFFFF"],
    dark: ["#161617", "#202022", "#F3F1EE", "#BAB5AF", "#333336", "#D98A5B", "#161617", "#D98A5B", "#161617"] },
  { id: "espresso-caramel", name: "Espresso & Caramel", description: "Coffee browns with a caramel glow.",
    light: ["#FAF6F1", "#FFFFFF", "#24170F", "#65564B", "#EADFD3", "#A0581C", "#FFFFFF", "#3E2617", "#FFFFFF"],
    dark: ["#18110C", "#231912", "#F6EEE5", "#C7B6A6", "#3A2B20", "#E0A35E", "#18110C", "#E0A35E", "#18110C"] },
  { id: "sage-terracotta", name: "Sage & Terracotta", description: "Muted sage green and sun-baked clay.",
    light: ["#F6F7F2", "#FFFFFF", "#1C221B", "#575F55", "#DEE2D6", "#B4532F", "#FFFFFF", "#4E6B4F", "#FFFFFF"],
    dark: ["#141813", "#1C221B", "#F1F2EC", "#B8BFB2", "#2D352B", "#E08A64", "#141813", "#9DBB98", "#141813"] },
  { id: "olive-cream", name: "Olive & Cream", description: "Olive green on a soft cream page.",
    light: ["#F9F6EC", "#FFFDF7", "#1F2114", "#5C5E4C", "#E5E0CC", "#5F6C1B", "#FFFFFF", "#4A5320", "#FFFFFF"],
    dark: ["#16170F", "#202116", "#F5F1DE", "#C2BEA6", "#33352A", "#C2CC6B", "#16170F", "#C2CC6B", "#16170F"] },
  { id: "slate-mint", name: "Slate & Mint", description: "Cool slate with a fresh mint accent.",
    light: ["#F5F7F8", "#FFFFFF", "#172026", "#53606A", "#DDE3E7", "#12805C", "#FFFFFF", "#2E3D4A", "#FFFFFF"],
    dark: ["#11171C", "#182128", "#EEF3F5", "#B1BEC6", "#26323B", "#6EE0B4", "#11171C", "#6EE0B4", "#11171C"] },
  { id: "lavender-sage", name: "Lavender & Sage", description: "Soft lavender and sage, gentle and calm.",
    light: ["#F8F6FB", "#FFFFFF", "#221E2B", "#5E596A", "#E6E1EE", "#4F7A55", "#FFFFFF", "#6B4FA0", "#FFFFFF"],
    dark: ["#17141D", "#211D29", "#F3F0F7", "#BDB6C9", "#352F40", "#A8C9A4", "#17141D", "#C7B3EC", "#17141D"] },
  { id: "ink-tangerine", name: "Ink & Tangerine", description: "Near-black ink with one bold tangerine accent.",
    light: ["#F8F7F5", "#FFFFFF", "#16181D", "#565961", "#E3E1DD", "#C24E00", "#FFFFFF", "#16181D", "#FFFFFF"],
    dark: ["#121418", "#1B1E23", "#F3F2EF", "#B6B8BD", "#2C3036", "#FF8A3D", "#121418", "#FF8A3D", "#121418"] },
  { id: "newsprint", name: "Newsprint", description: "Black and white only, like a printed newsletter.",
    light: ["#FFFFFF", "#FFFFFF", "#111111", "#555555", "#E5E5E5", "#111111", "#FFFFFF", "#111111", "#FFFFFF"],
    dark: ["#0E0E0E", "#181818", "#F2F2F2", "#A8A8A8", "#2A2A2A", "#F2F2F2", "#0E0E0E", "#F2F2F2", "#0E0E0E"] },
];

export const COMMUNITY_THEME_PALETTES: readonly CommunityThemePalette[] = RAW_PALETTES.map((raw) => {
  const schemes = { light: colors(raw.light), dark: colors(raw.dark) };
  const result = normalizeCommunityTheme({ version: 1, schemes });
  if (!result.ok) throw new Error(`Colour palette "${raw.id}" is invalid: ${result.problems.map((p) => `${p.path}: ${p.message}`).join(" ")}`);
  return { id: raw.id, name: raw.name, description: raw.description, schemes: schemes as Record<CommunityThemeScheme, CommunityThemeColors> };
});

export function findCommunityThemePalette(id: string): CommunityThemePalette | null {
  return COMMUNITY_THEME_PALETTES.find((palette) => palette.id === id) ?? null;
}

// The theme with the palette's colours, keeping its other settings and the
// schemes it already uses. `only` narrows it to one scheme (a fixed look).
export function applyCommunityThemePalette(theme: CommunityThemeV1, palette: CommunityThemePalette, only?: CommunityThemeScheme): CommunityThemeV1 {
  const keep = only ? [only] : (Object.keys(theme.schemes) as CommunityThemeScheme[]);
  const schemes: CommunityThemeV1["schemes"] = {};
  for (const scheme of keep.length ? keep : (["light", "dark"] as const)) schemes[scheme] = { ...palette.schemes[scheme] };
  return { ...theme, schemes };
}

// The palette whose colours the theme wears, if any.
export function matchingCommunityThemePalette(theme: CommunityThemeV1): CommunityThemePalette | null {
  const schemes = Object.entries(theme.schemes) as [CommunityThemeScheme, CommunityThemeColors][];
  if (!schemes.length) return null;
  return COMMUNITY_THEME_PALETTES.find((palette) =>
    schemes.every(([scheme, c]) => JSON.stringify(c) === JSON.stringify(palette.schemes[scheme]))) ?? null;
}

function readableOn(fill: string): string {
  return contrastRatio("#FFFFFF", fill) >= contrastRatio("#0B0B0B", fill) ? "#FFFFFF" : "#0B0B0B";
}

// The other version of a one-version look: the twin from the starting design
// or palette it matches, else Polynet's own with the look's accent (darkened
// or lightened until it reads on the new page).
export function communityThemeTwinColors(theme: CommunityThemeV1, scheme: CommunityThemeScheme): CommunityThemeColors {
  const base = DEFAULT_COMMUNITY_THEME.schemes[scheme] as CommunityThemeColors;
  const otherKey: CommunityThemeScheme = scheme === "light" ? "dark" : "light";
  const other = theme.schemes[otherKey];
  if (!other) return { ...base };
  const same = (colors: CommunityThemeColors | undefined) => JSON.stringify(colors) === JSON.stringify(other);
  const twin =
    COMMUNITY_THEME_PRESETS.find((preset) => same(preset.theme.schemes[otherKey]) && preset.theme.schemes[scheme])?.theme.schemes[scheme] ??
    COMMUNITY_THEME_PALETTES.find((palette) => same(palette.schemes[otherKey]))?.schemes[scheme];
  if (twin) return { ...twin };
  const onSurface = nearestPassingColor(other.accent, base.surface, 3);
  const accent = (onSurface && nearestPassingColor(onSurface, base.background, 3)) ?? base.accent;
  return { ...base, accent, on_accent: readableOn(accent), button: accent, on_button: readableOn(accent) };
}

// The look with both versions, so a member's Light or Dark pick always has
// one to show. Only what that member sees changes; the saved look doesn't.
export function communityThemeWithBothSchemes(theme: CommunityThemeV1): CommunityThemeV1 {
  if (theme.schemes.light && theme.schemes.dark) return theme;
  return {
    ...theme,
    schemes: {
      light: theme.schemes.light ?? communityThemeTwinColors(theme, "light"),
      dark: theme.schemes.dark ?? communityThemeTwinColors(theme, "dark"),
    },
  };
}
