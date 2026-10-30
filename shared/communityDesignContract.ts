// What Polynet promises a community's design can rely on. A founder, or their
// agent, customizes a community only through what is listed here: theme
// tokens, the lesson elements, and the widget bridge. Polynet keeps everything
// in this file working across updates; everything else (class names, internal
// CSS variables, component structure) stays Polynet's to change.
//
// The contract is checked from both sides. `polynet check` tests a design
// against it before it goes live, and scripts/community_design_contract.test.ts
// fails a Polynet change that drops a surface a theme styles. Contract:
// docs/community-design-contract.md.

import { COMMUNITY_EMBED_LANGUAGE, COMMUNITY_EMBED_MAX_KEY_LENGTH, COMMUNITY_EMBED_MAX_VALUE_LENGTH } from "./communityEmbed";
import { COMMUNITY_LESSON_BUTTON_ACTIONS, COMMUNITY_LESSON_ELEMENT_TYPES } from "./communityLessonContract";
import {
  COMMUNITY_LAYOUT_ASIDE_BLOCKS,
  COMMUNITY_LAYOUT_TABS,
  COMMUNITY_LAYOUT_TAB_DEFAULT_LABELS,
  COMMUNITY_LAYOUT_VERSION,
  DEFAULT_COMMUNITY_LAYOUT,
} from "./communityLayout";
import { COMMUNITY_THEME_FONTS, COMMUNITY_THEME_VERSION, DEFAULT_COMMUNITY_THEME } from "./communityTheme";

export const COMMUNITY_DESIGN_CONTRACT_VERSION = 1 as const;

export type CommunityDesignSurface = {
  // What a founder recognizes on the page.
  label: string;
  // Theme tokens that change it.
  tokens: readonly string[];
  // Polynet's own classes that carry the surface today, styled in
  // apps/web/src/styles/community-theme-hooks.css. Internal: themes never name
  // them. A rename updates this list and the hooks file together.
  classes: readonly string[];
};

// Every part of a community's area a theme reaches. Colours reach everything
// through Polynet's own variables and need no entry here; these are the
// surfaces that take the shape, type and catalog tokens.
export const COMMUNITY_DESIGN_SURFACES = {
  headings: {
    label: "Page, column and course headings",
    tokens: ["font_heading", "heading_weight", "heading_case"],
    classes: [
      "community-knowledge-header",
      "resource-course-outline-title",
      "resource-course-card-heading",
      "resource-viewer-title",
    ],
  },
  cards: {
    label: "Course cards and member cards",
    tokens: ["radius", "corner_style", "border_width", "shadow"],
    classes: ["resource-course-card", "resource-course-create-card", "workflow-member-stub"],
  },
  buttons: {
    label: "Primary buttons",
    tokens: ["button_shape", "shadow"],
    classes: ["settings-primary-action", "community-events-primary-link", "knowledge-source-intake-primary", "platform-save-button", "stripe-setup-button"],
  },
  course_catalog: {
    label: "Course grid, covers and card text",
    tokens: ["course_card_size", "course_columns", "course_columns_phone", "course_gap", "course_card_style", "course_card_pills", "course_card_description", "course_card_progress", "course_card_edge", "course_card_panel", "course_card_panel_color", "course_cover_ratio", "type_scale"],
    classes: [
      "resource-course-grid",
      "resource-course-card-cover",
      "resource-course-card-heading",
      "resource-course-card-description",
    ],
  },
  images: {
    label: "Course covers and lesson images on dark themes",
    tokens: ["media_plate"],
    classes: ["resource-course-card-cover-image", "resource-viewer-prose"],
  },
  banner_identity: {
    label: "The community name over the side column's banner (hide it when the banner shows the name)",
    tokens: ["banner_name"],
    classes: ["community-nav-identity-name"],
  },
  page_cards: {
    label: "Post cards, the post box and sidebar cards (stay flat; corners follow the theme)",
    tokens: ["radius", "font_body"],
    classes: ["community-post-card", "community-posts-composer", "community-aside-card", "community-about-main", "community-post-card-title"],
  },
  text_sizes: {
    label: "Text sizes and faces across chat, courses, lessons and forms (Settings → Appearance)",
    tokens: ["type_scale", "font_body", "font_heading"],
    classes: [
      "resource-course-outline",
      "knowledge-resource-rail",
      "community-welcome-intro",
      "knowledge-resource-reader",
      "md-header",
      "member-form-dialog",
      "community-interaction-author",
      "community-interaction-body",
      "resource-course-outline-header",
      "community-nav-identity-name",
      "knowledge-resource-item-title",
      "nav-item",
      "community-channel-participant",
      "community-interaction-meta-row",
      "md-media-embed-caption",
      "resource-course-card-lock",
      "resource-course-card-meta",
      "resource-course-card-progress-label",
      "resource-course-outline-count",
      "resource-course-outline-progress",
      "resources-back-btn",
      "community-welcome-step",
      "resource-course-card-status",
      "lesson-slide-deck-stage",
      "lesson-slide-deck-note",
      "lesson-slide-deck-count",
    ],
  },
  community_area: {
    label: "The community's own area (never the community rail or Polynet's navigation)",
    tokens: ["font_body", "font_mono", "numerals", "density"],
    classes: ["community-theme-scope"],
  },
} as const satisfies Record<string, CommunityDesignSurface>;

export type CommunityDesignSurfaceName = keyof typeof COMMUNITY_DESIGN_SURFACES;

// Messages a widget may send through /__polynet/embed.js, and what each does.
export const COMMUNITY_WIDGET_CAPABILITIES = {
  ready: "Tell Polynet the widget has loaded",
  resize: "Ask for a new height",
  load: "Read one of the member's saved answers for this widget",
  save: "Save one answer for the member",
} as const;

// The vocabulary an agent may use. Anything not listed is rejected with an
// error, never silently dropped.
export function describeCommunityDesignContract() {
  const { version: _version, schemes: _schemes, ...themeTokens } = DEFAULT_COMMUNITY_THEME;
  return {
    version: COMMUNITY_DESIGN_CONTRACT_VERSION,
    theme: {
      version: COMMUNITY_THEME_VERSION,
      colors: Object.keys(DEFAULT_COMMUNITY_THEME.schemes.light ?? {}),
      schemes: ["light", "dark"],
      tokens: Object.keys(themeTokens),
      fonts: Object.entries(COMMUNITY_THEME_FONTS).map(([name, font]) => ({ name, role: font.role })),
      defaults: DEFAULT_COMMUNITY_THEME,
    },
    layout: {
      version: COMMUNITY_LAYOUT_VERSION,
      positions: ["side", "top"],
      widths: ["wide", "centered"],
      tabs: COMMUNITY_LAYOUT_TABS.map((tab) => ({ tab, default_label: COMMUNITY_LAYOUT_TAB_DEFAULT_LABELS[tab] })),
      pinned_tabs: ["workflows", "people", "analytics", "settings"],
      pages: { chat: { presentations: ["messages", "posts"], aside_blocks: [...COMMUNITY_LAYOUT_ASIDE_BLOCKS] } },
      defaults: DEFAULT_COMMUNITY_LAYOUT,
    },
    surfaces: Object.fromEntries(
      Object.entries(COMMUNITY_DESIGN_SURFACES).map(([name, surface]) => [name, { label: surface.label, tokens: surface.tokens }]),
    ),
    lesson_elements: { types: [...COMMUNITY_LESSON_ELEMENT_TYPES], button_actions: [...COMMUNITY_LESSON_BUTTON_ACTIONS] },
    widgets: {
      fence: COMMUNITY_EMBED_LANGUAGE,
      capabilities: COMMUNITY_WIDGET_CAPABILITIES,
      max_key_length: COMMUNITY_EMBED_MAX_KEY_LENGTH,
      max_value_length: COMMUNITY_EMBED_MAX_VALUE_LENGTH,
    },
  };
}
