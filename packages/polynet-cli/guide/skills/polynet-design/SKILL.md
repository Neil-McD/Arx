---
name: polynet-design
description: Give a Polynet community site a distinctive, polished look that fits that community (typography, color, layout, imagery, motion, copy). Use when designing or restyling a community site, or when it looks generic, cluttered or unfinished.
---

# Design a community site

A community site should feel like that community and nobody else, the way a
favorite café or club does. Generic is the failure mode.

## 1. Write a design brief first

Three lines, from what the founder told you and `community_about`:

- **Who:** the members, in a phrase.
- **Feeling:** two or three words (e.g. "warm, scrappy, after-hours").
- **Signature:** one memorable element (a typeface, a color, a texture, a
  layout idea) that carries the identity.

Show the founder the brief in one line before a big restyle, then build.

## 2. Tokens before components

Set the look in `theme.css` (or your equivalent) as variables, then use only
those variables in components:

- Color: background, surface, text, muted text, border, accent, text on
  accent. One strong accent, used sparingly; tint the neutrals toward it.
- Type: a display face for headings and a highly readable body face, a type
  scale (e.g. 14 / 16 / 20 / 28 / 40), body 16px or more, line height 1.5 to
  1.7, reading width 60 to 75 characters.
- Shape: radius, border weight, shadow (pick one style and keep it).
- Space: a 4px or 8px step scale.

Fonts: choose ones with character that fit the brief (Google Fonts through a
`<link>` work; so do good system stacks). Don't default to Inter, Roboto or
Arial for everything. Load at most two families.

## 3. Avoid the generic look

These read as unconsidered:

- Purple-to-blue gradients, glass panels everywhere, neon glows.
- Emoji as icons; three identical feature cards under a centered hero by
  default; "Welcome to our community!" copy.
- Everything centered, everything a card, every corner equally rounded.
- Gray text on gray backgrounds that fails contrast.

Prefer a clear hierarchy, real content first, and one bold decision over many
timid ones.

## 4. Layout

- Mobile first: design at 360px wide, then widen. No horizontal scrolling at
  any width.
- Navigation in the same place on every page, with the current page marked.
  On phones use a drawer or bottom bar; keep `<polynet-account>` visible.
- Chat needs width, a composer that stays reachable (sticky at the bottom),
  and newest posts where people look first. Reading pages (lessons,
  knowledge) need a comfortable measure.
- Every view has four states: loading, empty, error, and signed out. Design
  all four; an empty page should say what will appear and, for admins, how
  to add it.

## 5. Imagery and motion

- Use the founder's real photos and logo when they have them; otherwise
  typography, color and simple SVG shapes beat stock imagery.
- Motion is subtle and purposeful (hover, open, arrive), under
  `@media (prefers-reduced-motion: no-preference)`.

## 6. Words

Write `content.js` in the community's voice: short, specific, warm. Say what
members get, not what the software does. Name things the community's way
("Sessions" for a run club's events, "Library" for courses).

## 7. The shell

Style `<polynet-account>` to match, with the variables from llms.txt:
`--polynet-accent`, `--polynet-on-accent`, `--polynet-surface`,
`--polynet-text`, `--polynet-radius`, `--polynet-font`.

## 8. Check your work

Look at the live site at 375px and 1280px wide (screenshots if your tools
allow) and compare against the brief: does it feel like the three words? Is
anything cramped, misaligned or inconsistent? Fix, deploy, look again.
