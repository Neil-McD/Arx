---
name: polynet-design
description: Art-direct a Polynet community site. Discover the community's world, explore three bold directions as live pages, let the founder choose, then build and refine until it's memorable. Use whenever a community site is designed or redesigned, or looks generic, flat or unfinished.
---

# Design a community site

Every community has a world: its places, hours, rituals, words, objects and
people. The site should feel like stepping into that world. Aim for the site
members screenshot and send to friends. If it could be any community's site,
it isn't done.

There is no template. Every site starts from its own concept. What every
site shares is Polynet's blocks: `<polynet-channels>`, `<polynet-chat>` and
`<polynet-members>` (required; deploys fail without them) and the
`<polynet-account>` shell. They behave the same everywhere so members always
know how to talk and find each other; how they look is your job. A
direction isn't done until they look like they were made for it.

## 1. Discover the world

Ask the founder once, in one message (skip what you already know, and read
`session().community_about` and any site or socials they mention). If their
brief already answers these, don't ask: start.

- Who are the members, and what brings them together?
- Where and when does it happen? What does it look, sound and feel like?
- Three words for how the site should feel, and one thing it should feel like:
  a brand, a magazine, an album cover, a place.
- Anything to use: logo, photos, colors, fonts, phrases they always say.

Collect concrete nouns. "6:00 am, the river, coffee after" designs far better
than "friendly and inclusive".

## 2. Explore three directions

Make three directions that differ in kind, not degree: a different type
world, color world, layout idea and voice each. Make at least one feel risky.
Safe is the failure mode.

For each, decide:

- **Name**, two or three words ("First Light", "Track Notes", "Night Shift").
- **Idea**: the world or metaphor it borrows from, in one sentence.
- **Type**: the faces and how they're used ("ultra-condensed display at 140px,
  set tight; a quiet serif for reading").
- **Color**: the palette in hex, and where the drama comes from.
- **Signature**: the one thing people remember.
- **Voice**: the headline and two lines of copy, in the community's words.
- **The room**: where the conversation lives in this world and what it's
  called ("the boathouse noticeboard", "the night log"), and how the blocks
  take on the look: tokens, two or three `::part()` moves, and the words in
  their slots.

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

- Delete the concept pages. Build the real site from the chosen direction.
- Write each page's structure in HTML, by hand. A page is a composition, not
  a loop. JavaScript fills live data into it (recipes in `polynet-sdk`).
- Give the blocks the room the concept named, with real space
  (`polynet-build-site` shows where they usually go).
- Set the look as a few CSS variables (color, type, space, radius), map
  them onto the `--polynet-*` tokens, then compose with them.
- Design every state in the concept's voice: loading, empty, error, signed
  out. "No runs on the calendar yet. The river's still there." beats a gray
  box that says "No events".
- Real words everywhere. Never ship test data or placeholder text. If the
  community's description reads like a placeholder, write better copy and
  tell the founder.

## 4. Look at it, twice

Screenshot it at 390px and 1440px wide (with a browser tool, or ask the
founder for screenshots). Each pass, ask:

- Does it feel like the three words and the chosen idea? With the name
  covered, would a member still recognize their community?
- Do the blocks feel native? Signed in, the chat, channels, members and an
  open profile should look like part of this world (its type, color,
  edges and words), not a stock widget on a designed page. If they look
  default, push the tokens and `::part()` styling further.
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
- **Depth and texture with meaning:** a gradient that is the dawn, film
  grain, duotone photos, huge numerals, print-style rules and grids.
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

Dawn Patrol Run Club, built by an agent from one sentence:

- **Idea:** the city before sunrise. A night-navy page warming into an
  orange dawn gradient.
- **Type:** Barlow Condensed at 88px, extra bold; uppercase eyebrows with
  wide tracking; Inter for reading.
- **Voice:** "Early miles. Good people." Above it: "Every weekday · 6:00 am ·
  Riverside boathouse". Below it, three stats: Weekly runs 5 · Paces
  4:30–7:30/km · Coffee after: Always.
- **Signature:** a drawn sunrise mark and the gradient.

Match that specificity, then go further.

Bold design and accessible design are the same craft: strong contrast and
confident type help everyone. `polynet-accessibility` is the last pass, not
the first constraint.
