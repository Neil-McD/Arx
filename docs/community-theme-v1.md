# Community theme v1

October 23, 2026. Proposal, built in the2hourclo/Polynet. Not yet a Polynet
contract: it needs Neil's approval before it is stored or served.

A community's look is data: a small set of tokens a founder or their agent
sets. Polynet validates it, compiles it into Polynet's own CSS variables, and
applies it to the community's area only. The app frame (community rail,
Discover, messages, account, settings) always keeps Polynet's look.

Code: `shared/communityTheme.ts` (validator and compiler),
`apps/web/src/styles/community-theme-hooks.css` (where components use the
shape and type tokens), tests in `convex/communityTheme.test.ts`.

## The record

```json
{
  "version": 1,
  "schemes": {
    "dark": {
      "background": "#0B0B0B", "surface": "#151515", "text": "#F2F2EF", "muted": "#9C9C96",
      "border": "#2B2B2B", "accent": "#3FD15A", "on_accent": "#0B0B0B",
      "button": "#3FD15A", "on_button": "#0B0B0B"
    }
  },
  "font_body": "IBM Plex Sans",
  "font_heading": "Barlow Condensed",
  "heading_weight": 600,
  "heading_case": "upper",
  "numerals": "tabular",
  "radius": 3,
  "button_shape": "square",
  "density": "compact",
  "media_plate": "light"
}
```

Anything left out keeps Polynet's default. One scheme fixes the community's
look; both follow the member's own Light/Dark choice.

| Setting | Values |
| --- | --- |
| `schemes.light`, `schemes.dark` | The nine colours above, as hex |
| `font_body`, `font_heading`, `font_mono` | A name from `COMMUNITY_THEME_FONTS`. Display faces only for headings |
| `heading_weight` | 300 to 900 |
| `heading_case` | `none`, `upper` |
| `type_scale` | 0.9 to 1.2. Multiplies every text role below |
| `numerals` | `proportional`, `tabular` |
| `radius` | 0 to 24 (px) |
| `corner_style` | `even`, `sketch` |
| `button_shape` | `pill`, `rounded`, `square`, `sketch` |
| `border_width` | 0 to 3 (px) |
| `shadow` | `none`, `soft`, `hard` |
| `density` | `compact`, `comfortable`, `roomy` |
| `media_plate` | `none`, `light` (frames white-background images in dark schemes) |
| `course_cover_ratio` | `16:9` (the default), `auto` (Polynet's fixed height), `3:2`, `4:3`, `1:1`, `21:9` |
| `course_card_size` | `medium` is the default; `default` (the page style's own columns), `small`, `medium`, `large` (cards at least 200, 260 or 360px wide; the catalog widens up to 90rem and each row fits as many as the screen has room for) |
| `course_columns` | `auto` (fit to screen by Card size), or `1`–`4` cards per row on desktop (rows wrap before a card is narrower than 160px). Overrides the page style's columns; picking a Card size in Customize sets it back to `auto` |
| `course_columns_phone` | `1` or `2` cards per row on phones |
| `course_gap` | `default` (the page style's own spacing), `tight`, `roomy` |
| `course_card_style` | `classroom` (the default: the course-community card, picture on top, title in the heading font, two lines of description and a slim progress line, with a quiet frame and room to breathe), `cover` (picture on top), `list` (a row with a small picture on the right, thin dividers), `overlay` (title on the picture), `text` (no picture, editorial) |
| `course_card_pills` | `hide` or `show` small pills: lesson count and In progress / Done / Locked |
| `course_card_description` | `show` or `hide` each course's short description |
| `course_card_progress` | `bar`, `ring` or `fraction` ("3/6 lessons") |
| `course_card_edge` | `border` (a hairline frame, the default), `shadow` (a soft shadow that lifts on hover) or `none` (open cover and text, like a magazine). Applies to the cover and title-on-cover card styles |
| `course_card_panel` | `shade` (default: a clear step from the card, darker on light schemes and lighter on dark ones), `tint`, `accent`, `plain`, `custom`. The text panel under a boxed card's cover; its text stays readable |
| `course_card_panel_color` | `"#RRGGBB"` used when `course_card_panel` is `custom`, else `""` |
| `course_cover_plate` | `none`, `tint` (light schemes: covers are printed onto a soft wash of the accent, so pale drawings and screenshots match) |
| `course_cover_fit` | `crop` (covers fill the box, framed by each course's focus and zoom), `whole` (each cover shows in full, centred in the box; for wide banners with words on them) |
| `banner_name` | `show` (the name sits over the side column's banner), `hide` (the banner artwork already shows it) |
| `channels_look` | Draft. `current` (Polynet's Channels look), `quiet` (plain side panel, one centred column), `reader` (reading column, courses as a post list), `publication` (masthead with logo, name and Invite; editorial course cards). Only the Channels layout uses it |
| `rail_size` | Draft. `standard`, `large` (bigger community icons in the far-left rail while this community is open) |
| `sibling_communities` | `hide` (default), `show` (lists the owner's other communities, "More from this creator", at the foot of the chat's members panel) |
| `edges` | How panels and cards stand apart in the light scheme: `soft` (the old faint lines), `sharp` (same tones, lines about twice as visible), `clean` (every panel in the card colour, crisp lines, a faint lift on cards), `framed` (each column its own rounded panel on a canvas tinted with the accent). Dark schemes keep their own look |
| `classroom_chat` | `posts` (default: Classroom's Community tab is the post cards, with the Pods card and side blocks) or `chat` (a chat timeline instead). Channels always shows the Wide chat |
| `pods_place` | `aside` (default: a "Your pods" card at the top of Classroom's right column), `header` (a stack of faces in the Classroom header that opens the pods list), `tab` (a Pods tab right after Community that opens a page of the member's pods) |
| `rail_color` | Draft. `polynet` (Polynet's rail), `blend` (the page colour), `tint` (a wash of the accent), `brand` (solid accent) |

Ready-made course card looks (Classroom, the default, plus Classic, Lifted,
Magazine, Gallery, Archive and Compact) live in `shared/communityCourseCardLooks.ts`. Each one sets only the
`course_card_*`, `course_card_size`, `course_columns`, `course_cover_ratio`
and `course_gap` tokens. To apply one, write its tokens through the theme
draft save.

## Text roles

Community text uses eleven sizes, compiled as `--pn-type-<role>` from
`COMMUNITY_TYPE_ROLES` times `type_scale`: `display` 32 (page and lesson
titles, shrinking to 26 on narrow screens), `title` 24, `heading` 22,
`subheading` 18, `reading` 16 (lesson text), `body` 15 (messages, card
titles), `ui` 14, `small` 13, `label` 12, `meta` 11, `micro` 10. Corners
follow `--pn-radius-scale` (the theme's `radius` over Polynet's 16px).

`styles/community-theme-map.css` is generated from all of Polynet's CSS by
`scripts/generate_community_theme_map.ts`: every fixed `font-size` becomes its
nearest role and every fixed `border-radius` scales with the theme, so one Look
setting moves the whole community. Regenerate it after changing app CSS; a test
fails while it is out of date. `community-theme-hooks.css` holds the
hand-picked rules that override the map (for example lesson titles use
`display`). Communities without a theme keep Polynet's exact sizes.

## Validation

`normalizeCommunityTheme(raw)` returns the full theme or every problem at
once, each with a path, a plain message and, for contrast, the nearest colour
that passes. Contrast floors (WCAG 2.2 AA): text and muted on their surfaces
4.5:1, labels on accent and button fills 4.5:1, accent against the background
3:1. Link colour is derived from the accent and always reaches 4.5:1.

## Output

`compileCommunityThemeCss(theme, scope)` returns CSS for one selector, the
element that wraps the community's own area (in the web app,
`.product-shell-surface--community`, which holds the community sidebar and
workspace but not the rail). It sets:

- the public `--pn-*` variables (also read by community sites and
  `<polynet-account>` through `--polynet-*`), and
- Polynet's internal colour variables, derived from the nine colours.

Themes never name Polynet's classes. Where a component should use a shape or
type token, the rule lives in `community-theme-hooks.css`, maintained with
the components.

## Storage and the web app

`convex/communityThemes.ts` keeps one draft and one published theme per
community in `communityThemes`. Managers read the draft
(`getCommunityThemeDraft`), replace it (`saveCommunityThemeDraft`, rejected
with every problem when invalid), publish it, or discard it back to the
published theme. Every write names the draft revision it started from, so a
stale editor gets `community_theme_revision_conflict` instead of overwriting.
`getPublishedCommunityTheme` needs no session: a theme is how a public page
looks, never private data.

The web app reads the published theme for the open community
(`useWebCommunityThemeStyle`), installs the compiled CSS once, and sets
`data-community-theme` on the community's own area: home, channels,
Knowledge, Events, agent and Workflows. Community settings, analytics,
Discover, messages and account pages keep Polynet's look. A failed read keeps
Polynet's look too.

## Not in this change

- An editor screen in community settings, and the MCP operations
  `community.theme.get/set` through agent changesets.
- Serving `/__polynet/theme.css` on community sites.
- Hosting Excalifont with Polynet (one preview inlines it today).
