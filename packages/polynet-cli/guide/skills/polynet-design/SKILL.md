---
name: polynet-design
description: Art-direct a Polynet community site. Discover the community's world, explore three bold directions as live pages, let the founder choose, then build and refine until it's memorable. Use whenever a community site is designed or redesigned, or looks generic, flat or unfinished.
---

# Design a community site

Every community has a world: its places, hours, rituals, words, objects and
people. The site should feel like stepping into that world. Aim for the site
members screenshot and send to friends. If it could be any community's site,
it isn't done.

There is no template. Every site starts from its own world, and the world
has three layers:

- **The frame** (`frame.html`): the world's chrome, its header, navigation
  and footer. Polynet shows every standard page inside it: `/chat`,
  `/people`, `/events`, `/learn`, `/knowledge`, `/ask` and `/discover`.
  Design it for pages of talk, people, dates, lessons, answers and other
  communities alike.
- **The feel of each standard page:** Polynet's blocks
  (`<polynet-channels>`, `<polynet-chat>`, `<polynet-members>`,
  `<polynet-events>`, `<polynet-learn>`, `<polynet-knowledge>`,
  `<polynet-ask>`, `<polynet-discover>`) and the `<polynet-account>`
  shell behave the same on every site, so members always know how to talk
  and find each other. How they look is your job: tokens, `::part()`,
  slots and the page classes.
- **Extras**: custom views (a parade map, a tide chart) built with the SDK,
  linking into the standard pages.

A direction isn't done until the blocks look like they were made for it.

## 1. Discover the world

Ask the founder once, in one message (skip what you already know, and read
`session().community_about` and any site or socials they mention). If their
brief already answers these, don't ask: start.

- Who are the members, and what brings them together?
- Where and when does it happen? What does it look, sound and feel like?
- Three words for how the site should feel, and one thing it should feel like:
  a brand, a magazine, an album cover, a place.
- Anything to use: logo, photos, colors, fonts, phrases they always say.

Collect concrete nouns. "Thursday nights, the net loft, tea from the urn"
designs far better than "friendly and inclusive".

## 2. Explore three directions

Make three directions that differ in kind, not degree: a different type
world, color world, layout idea and voice each. Make at least one feel risky.
Safe is the failure mode.

For each, decide:

- **Name**, two or three words ("Tide Table", "Paper & Flame", "Night Shift").
- **Idea**: the world or metaphor it borrows from, in one sentence.
- **Type**: the faces and how they're used ("ultra-condensed display at 140px,
  set tight; a quiet serif for reading").
- **Color**: the palette in hex, and where the drama comes from.
- **Signature**: the one thing people remember.
- **Voice**: the headline and two lines of copy, in the community's words.
- **The frame**: the world's chrome (what the header and footer are in
  this world: a tide clock, a station ident) and the nav's names for the
  standard pages ("the net-loft noticeboard" for `/chat`, "the night log"
  for `/events`).
- **The pages' feel**: how the blocks take on the look: tokens, two or
  three `::part()` moves per page, and the words in their slots.

Build each as one static page showing the home view with real copy:
`concepts/a.html`, `concepts/b.html`, `concepts/c.html`. Each places
`<polynet-account>` where that design wants it, and the real
`<polynet-channels>`, `<polynet-chat>` and `<polynet-members>`, themed for
that direction: never gray boxes or screenshots standing in for them. The
founder signs in to see them live (signed out, they show the direction's
own sign-in words). Deploy, then send the founder the three links, each
with its name and idea. They pick one, or mix ("b's type with a's color").
If you can't deploy concepts for them to pick (no deploy access yet, or
they asked you to just build it), pick the strongest yourself, build it,
and tell them in a line why it won.

## 3. Build the chosen direction

- Delete the concept pages. Build the real site from the chosen direction:
  `frame.html` first (the chrome, its nav linking every standard page),
  then the front door, then each standard page's feel.
- Write each page's structure in HTML, by hand. A page is a composition, not
  a loop. JavaScript fills live data into it (recipes in `polynet-sdk`).
- Walk every standard page in the frame and give it a feel of its own
  within the world: the calendar as this world's noticeboard, lessons as
  its manual, Discover as its window onto other harbors
  (`polynet-build-site` has recipes).
- Set the look as a few CSS variables (color, type, space, radius), map
  them onto the `--polynet-*` tokens, then compose with them.
- Design every state in the concept's voice: loading, empty, error, signed
  out. "No lantern nights on the tide table yet. The quay's still dark."
  beats a gray box that says "No events".
- Real words everywhere. Never ship test data or placeholder text. If the
  community's description reads like a placeholder, write better copy and
  tell the founder.

## 4. Look at it, twice

Screenshot the front door and every standard page at 390px and 1440px
wide, signed out and signed in (with a browser tool, or ask the founder for
screenshots). The blocks render only on Polynet, so look at the deployed
site (`--staging` for a community on staging). Each pass, ask:

- Does it feel like the three words and the chosen idea? With the name
  covered, would a member still recognize their community?
- Do the blocks feel native? Signed in, the chat, members, an open
  profile, an event, a lesson, the memory, Ask and Discover should look
  like part of this world (its type, color, edges and words), not a stock
  widget in a designed frame. If one looks default, push the tokens and
  `::part()` styling further on that page.
- Where is it timid? Make the hierarchy louder: bigger type, stronger
  contrast, more space, one bolder move.
- Where is it noisy? Remove whatever doesn't serve the idea.
- Is anything cramped, misaligned or inconsistent?

Fix, deploy, look again. At least two passes.

## Craft that reads as premium

- **Type carries the identity.** Choose faces with character (Google Fonts
  or Fontshare through a `<link>`): a display face with presence and a calm
  text face. Use scale with conviction. A headline at
  `clamp(48px, 9vw, 140px)` is normal; body text 16 to 18px, 60 to 75
  characters wide.
- **Commit to a color world.** One dominant color, one sharp accent, and
  dark, light or both because the concept calls for it, not by default.
- **Depth and texture with meaning:** a gradient that is lamplight on dark
  water, film grain, duotone photos, huge numerals, print-style rules and
  grids.
- **Layout with intent:** asymmetric grids, full-bleed moments, editorial
  columns, one element that is unapologetically huge.
- **Motion with purpose:** arrivals, hovers, page transitions (the View
  Transitions API), all inside
  `@media (prefers-reduced-motion: no-preference)`.
- **The community's own photos** beat any illustration. Ask for them.
- **The blocks and the shell belong to the design:** they take the page's
  font and read the `--polynet-*` tokens (`accent`, `on-accent`, `text`,
  `muted`, `border`, `surface`, `radius`). `::part()` does the rest: author
  names set like the headline face, day dividers as the concept's
  timestamps, a composer with the site's edges. `polynet-build-site` has
  recipes; llms.txt lists every part.

## The bar

Port Wren Lantern Guild (made up), from one sentence of brief:

- **Idea:** a harbor town at lighting-up time. A slate-blue page with
  pools of lantern amber, like lamps along the quay.
- **Type:** Fraunces at 96px, heavy and italic, set tight; tide-table
  labels in IBM Plex Mono with wide tracking; Source Serif for reading.
- **Voice:** "Paper, wire and a little fire." Above it: "Thursdays · 7:30 pm ·
  The net loft, Quay Street". Below it, three stats: Lanterns this season
  212 · Parade night 14 Dec · Tea in the urn: Always.
- **Signature:** a hand-cut paper-lantern mark and the pools of light.

Match that specificity, then go further.

For the craft underneath every choice (type, colour, space, hierarchy,
polish, and the tells of a generic AI look), read `polynet-ui-design`.

Bold design and accessible design are the same craft: strong contrast and
confident type help everyone. `polynet-accessibility` is the last pass, not
the first constraint.
