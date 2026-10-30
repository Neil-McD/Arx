# Applying the craft inside the Polynet app

A community's design starts from its brand, `brand.json`: what the founder
wants it to feel like (words, feels_like), its colours with roles
(primary, accent, neutral, avoid), fonts, logo, photos, phrases, dos and
don'ts. It has no publish step: members never see it, every design reads
it. Read `/communities/<slug>/builder/brand.json`; save with
`community.brand.save` and `{ brand, expected_draft_revision }`.

It is styled through two records, `theme.json` (how it
looks) and `layout.json` (how it's arranged). They're separate, so changing
one never resets the other. Every change is a draft the founder previews in
the real app and then publishes:

    polynet init [folder] --template <name> --community <slug>   # optional starting point
    polynet dev [folder]       # saves each edit to the draft, opens the preview
    polynet review [folder]    # screenshots and audits every page; must pass
    polynet publish [folder]   # members see it (refuses without a passing review)

Agents without the CLI do the same over the MCP: read
`/communities/<slug>/builder/theme.json` or `layout.json`, then call
`community.theme.save_draft` / `community.theme.publish` (or the
`community.layout.*` pair). The full vocabulary is in Polynet's
`docs/community-design-contract.md`; anything outside it is refused with the
file and field named.

A template is a layout to start from, not a look. Keep the founder's own
colours and type unless they ask for new ones.

## Which lever does what

| Craft decision | Lever | Notes |
| --- | --- | --- |
| Colour world | `schemes.light` and/or `schemes.dark`: `background`, `surface`, `text`, `muted`, `border`, `accent`, `on_accent`, `button`, `on_button` | One scheme fixes the look; both follow each member's Light/Dark setting. Checks: text and muted 4.5:1 on their backgrounds, labels 4.5:1 on accent and button, accent 3:1 on background. A failure suggests the nearest passing shade. |
| Accent restraint | `accent` vs `button` | They can differ: a quiet `button` with a sharp `accent` for progress and the current tab keeps the accent precious. |
| Type identity | `font_heading`, `font_body`, `font_mono` | Faces have roles: display faces are for headings only. An unknown name is refused and the error lists the faces available for that slot. |
| Heading voice | `heading_weight` (300 to 900), `heading_case` (`none`, `upper`) | Uppercase reads louder; pair it with a slightly lower weight. |
| Scale | `type_scale` (0.9 to 1.2) | Nudges every size together. Hierarchy within a screen is Polynet's job; this sets how loud the whole community speaks. |
| Numbers | `numerals` (`proportional`, `tabular`) | Tabular for anything counted, timed or priced. |
| Corner language | `radius` (0 to 24), `corner_style` (`even`, `sketch`), `button_shape` (`pill`, `rounded`, `square`, `sketch`) | Choose once; it reaches cards, buttons and covers. |
| Depth language | `border_width` (0 to 3), `shadow` (`none`, `soft`, `hard`) | Hairline borders or soft shadows, rarely both. |
| Density | `density` (`compact`, `comfortable`, `roomy`) | Compact for tools, roomy for reading and a premium feel. |
| Images on dark | `media_plate` (`none`, `light`) | Use `light` when lesson images and diagrams are drawn on white. |
| Course catalog | `course_cover_ratio`, `course_card_size` | Big covers make the catalog the hero; small cards make it a list. Frame each cover's focal point in the course itself. |
| Navigation | `layout.navigation.position` (`side`, `top`), `tabs` (order, labels, hidden), `home` | Name tabs in the community's words ("Classroom", "Sessions"). Hide what the community doesn't use instead of leaving it empty. |
| Width | `layout.width` (`wide`, `centered`) | Centred suits reading and feeds; wide suits boards and dashboards. |
| Community page | `layout.pages.chat.presentation` (`messages`, `posts`), `aside` blocks | Posts for forum-style communities, messages for live chat. Keep the aside short. |

The community rail on the far left is not part of any design. Owner tools
(workflows, analytics, settings) stay in place, but they sit inside the
community and take its theme, so review them too.

## Content is design too

The theme can't save weak content. In lessons and course pages:

- Write course and lesson titles in the community's voice; keep them short
  enough to fit a card on a phone.
- Covers: one consistent ratio and visual language across a catalog. A set
  of matching covers looks premium; a mix of screenshots and stock looks
  unfinished.
- Lesson blocks (`button`, `checklist`, `quiz`, `form`) and `polynet-embed`
  widgets inherit the theme. Inside a widget, read the theme's colours and
  fonts rather than hard-coding a second look.
- Long lessons need headings every few screens, short paragraphs and images
  where an image explains faster than words.

## Reviewing a community in the app

Preview the draft at `/c/<slug>?design=draft` (owners and admins only) and
look at, at 390px and 1440px:

1. the community home (posts or chat),
2. the course catalog and one lesson with images,
3. events and members,
4. the same screens in the other scheme if the theme has both.

Then run the two-pass critique from the skill.
