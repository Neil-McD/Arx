// Starting points for a community's look, shown in Settings → Appearance →
// Customize. Each one is a whole theme the owner then adjusts; picking one
// replaces the draft (the owner can undo until it is saved). They are plain
// theme records, so agents and the CLI can name the same ones.
import { normalizeCommunityTheme, type CommunityThemeV1 } from "./communityTheme";

export type CommunityThemePreset = {
  id: string;
  name: string;
  description: string;
  theme: CommunityThemeV1;
};

const RAW_PRESETS: { id: string; name: string; description: string; theme: Record<string, unknown> }[] = [
  {
    id: "classic",
    name: "Polynet classic",
    description: "Polynet's own look, following each member's light or dark choice.",
    theme: { version: 1 },
  },
  {
    id: "clean-white",
    name: "Clean white",
    description: "Plain white, near-black ink, one green accent, hand-drawn titles. Its dark version is Night workshop's.",
    theme: {
      version: 1,
      schemes: {
        light: {
          background: "#FFFFFF", surface: "#FFFFFF", text: "#121412", muted: "#4B504C", border: "#D9DCD8",
          accent: "#1F7A30", on_accent: "#FFFFFF", button: "#1F7A30", on_button: "#FFFFFF",
        },
        dark: {
          background: "#101311", surface: "#171B18", text: "#F0F3EE", muted: "#9AA597", border: "#283029",
          accent: "#4CB860", on_accent: "#0B0E0C", button: "#2B863A", on_button: "#FFFFFF",
        },
      },
      font_body: "DM Sans", font_heading: "Excalifont", heading_weight: 400, radius: 10,
      course_cover_ratio: "16:9", course_card_size: "medium", course_cover_plate: "tint",
    },
  },
  {
    id: "night-workshop",
    name: "Night workshop",
    description: "The same green and white on near-black, with white diagrams on a light plate. Its light version is Clean white's.",
    theme: {
      version: 1,
      schemes: {
        light: {
          background: "#FFFFFF", surface: "#FFFFFF", text: "#121412", muted: "#4B504C", border: "#D9DCD8",
          accent: "#1F7A30", on_accent: "#FFFFFF", button: "#1F7A30", on_button: "#FFFFFF",
        },
        dark: {
          background: "#101311", surface: "#171B18", text: "#F0F3EE", muted: "#9AA597", border: "#283029",
          accent: "#4CB860", on_accent: "#0B0E0C", button: "#2B863A", on_button: "#FFFFFF",
        },
      },
      font_body: "DM Sans", font_heading: "Excalifont", heading_weight: 400, radius: 10, media_plate: "light",
      course_cover_ratio: "16:9", course_card_size: "medium", course_cover_fit: "whole",
    },
  },
  {
    id: "classroom",
    // "Classroom" names the layout only (2026-10-28 review #19); the id stays for saved themes.
    name: "Calm",
    description: "One confident sans, calm neutrals, soft depth and big course covers.",
    theme: {
      version: 1,
      schemes: {
        light: {
          background: "#F6F7F5", surface: "#FFFFFF", text: "#151A16", muted: "#5B645D", border: "#E2E6E1",
          accent: "#2B863A", on_accent: "#FFFFFF", button: "#2B863A", on_button: "#FFFFFF",
        },
        dark: {
          background: "#121613", surface: "#1A1F1B", text: "#EEF1EC", muted: "#9AA49B", border: "#2A312B",
          accent: "#4CB860", on_accent: "#0B0E0C", button: "#2B863A", on_button: "#FFFFFF",
        },
      },
      font_body: "Inter", font_heading: "Manrope", heading_weight: 700, radius: 12, shadow: "soft",
      course_cover_ratio: "16:9", course_card_size: "medium",
    },
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "A serif for titles on warm paper, hairline borders and more air.",
    theme: {
      version: 1,
      schemes: {
        light: {
          background: "#FAF8F3", surface: "#FFFFFF", text: "#1C1B17", muted: "#67645B", border: "#E6E1D6",
          accent: "#2B863A", on_accent: "#FFFFFF", button: "#1C1B17", on_button: "#FFFFFF",
        },
        dark: {
          background: "#171612", surface: "#201E19", text: "#F3EFE6", muted: "#A8A294", border: "#353027",
          accent: "#5CBF6E", on_accent: "#11140F", button: "#F3EFE6", on_button: "#171612",
        },
      },
      font_body: "Inter", font_heading: "Fraunces", heading_weight: 600, radius: 6, density: "roomy", type_scale: 1.05,
      course_cover_ratio: "3:2", course_card_size: "medium",
    },
  },
  {
    id: "stopwatch",
    name: "Stopwatch",
    description: "Black, a bright green, condensed uppercase headings and timer numerals.",
    theme: {
      version: 1,
      schemes: {
        light: {
          background: "#F4F4F1", surface: "#FFFFFF", text: "#0B0B0B", muted: "#55554F", border: "#D8D8D2",
          accent: "#16812D", on_accent: "#FFFFFF", button: "#0B0B0B", on_button: "#3FD15A",
        },
        dark: {
          background: "#0B0B0B", surface: "#151515", text: "#F2F2EF", muted: "#9C9C96", border: "#2B2B2B",
          accent: "#3FD15A", on_accent: "#0B0B0B", button: "#3FD15A", on_button: "#0B0B0B",
        },
      },
      font_body: "IBM Plex Sans", font_heading: "Barlow Condensed", heading_weight: 600, heading_case: "upper",
      numerals: "tabular", radius: 3, button_shape: "square", density: "compact", media_plate: "light",
      course_cover_ratio: "16:9", course_card_size: "medium",
    },
  },
];

export const COMMUNITY_THEME_PRESETS: readonly CommunityThemePreset[] = RAW_PRESETS.map((preset) => {
  const result = normalizeCommunityTheme(preset.theme);
  if (!result.ok) throw new Error(`Theme preset "${preset.id}" is invalid: ${result.problems.map((p) => p.message).join(" ")}`);
  return { id: preset.id, name: preset.name, description: preset.description, theme: result.theme };
});
