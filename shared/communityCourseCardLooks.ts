// Ready-made course card looks for Settings → Appearance → Customize →
// Course cards. A look sets only the course card and grid tokens (style,
// edge, size, cover shape, spacing, pills, description, progress): colours,
// fonts and the rest of the theme stay. Each is a tested combination in the
// spirit of Substack's post cards and archive. Agents and the CLI can apply
// one by writing its tokens through the theme draft save.
import type { CommunityThemeV1 } from "./communityTheme";

export type CourseCardLookTokens = Pick<CommunityThemeV1,
  "course_card_style" | "course_card_edge" | "course_card_size" | "course_columns" | "course_cover_ratio" | "course_gap" |
  "course_card_pills" | "course_card_description" | "course_card_progress">;

export type CourseCardLook = {
  id: string;
  name: string;
  description: string;
  tokens: CourseCardLookTokens;
};

export const COURSE_CARD_LOOKS: readonly CourseCardLook[] = [
  // Polynet's default: the course card members know from course communities.
  { id: "classroom", name: "Framed", description: "Quiet framed cards: cover on top, the title in your heading font, a short description and a slim progress line.",
    tokens: { course_card_style: "classroom", course_card_edge: "border", course_card_size: "medium", course_columns: "auto", course_cover_ratio: "16:9", course_gap: "default",
      course_card_pills: "hide", course_card_description: "show", course_card_progress: "bar" } },
  { id: "classic", name: "Classic", description: "Framed cards with a wide cover, lesson pills and a progress bar.",
    tokens: { course_card_style: "cover", course_card_edge: "border", course_card_size: "medium", course_columns: "auto", course_cover_ratio: "16:9", course_gap: "default",
      course_card_pills: "show", course_card_description: "show", course_card_progress: "bar" } },
  { id: "lifted", name: "Lifted", description: "Soft-shadow cards that rise on hover, with a progress ring.",
    tokens: { course_card_style: "cover", course_card_edge: "shadow", course_card_size: "medium", course_columns: "auto", course_cover_ratio: "16:9", course_gap: "roomy",
      course_card_pills: "show", course_card_description: "show", course_card_progress: "ring" } },
  { id: "magazine", name: "Magazine", description: "Big open covers and headlines, no boxes.",
    tokens: { course_card_style: "cover", course_card_edge: "none", course_card_size: "large", course_columns: "auto", course_cover_ratio: "3:2", course_gap: "roomy",
      course_card_pills: "hide", course_card_description: "show", course_card_progress: "bar" } },
  { id: "gallery", name: "Gallery", description: "Tall picture cards with the title on the cover.",
    tokens: { course_card_style: "overlay", course_card_edge: "shadow", course_card_size: "small", course_columns: "auto", course_cover_ratio: "auto", course_gap: "tight",
      course_card_pills: "show", course_card_description: "hide", course_card_progress: "bar" } },
  { id: "archive", name: "Archive", description: "One row per course with a small picture, like a post archive.",
    tokens: { course_card_style: "list", course_card_edge: "border", course_card_size: "default", course_columns: "auto", course_cover_ratio: "16:9", course_gap: "default",
      course_card_pills: "show", course_card_description: "show", course_card_progress: "fraction" } },
  { id: "compact", name: "Compact", description: "Small framed cards, more per row, titles and progress only.",
    tokens: { course_card_style: "cover", course_card_edge: "border", course_card_size: "small", course_columns: "auto", course_cover_ratio: "16:9", course_gap: "tight",
      course_card_pills: "hide", course_card_description: "hide", course_card_progress: "fraction" } },
];

export function matchingCourseCardLook(theme: CommunityThemeV1): CourseCardLook | null {
  return COURSE_CARD_LOOKS.find((look) =>
    (Object.keys(look.tokens) as (keyof CourseCardLookTokens)[]).every((key) => theme[key] === look.tokens[key])) ?? null;
}
