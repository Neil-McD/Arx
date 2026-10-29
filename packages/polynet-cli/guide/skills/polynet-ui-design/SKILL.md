---
name: polynet-ui-design
description: Design taste for anything a member sees in a Polynet community (its theme and layout in the app, its site, lessons, widgets and course covers). Typography, colour, space, hierarchy, composition, motion and polish, and how to avoid the generic AI look, while the founder stays free to make it entirely their own. Use whenever you style, lay out, restyle or review a community, or when it looks bland, cluttered or "AI-made".
---

# UI design for Polynet communities

A member should open the community and feel they've arrived somewhere
specific: this founder's place, not a Polynet demo with a new accent colour.
Your job is taste and craft. The founder's job is the direction, and they can
take it anywhere.

This skill is guidance, not a style. It has no preset themes, palettes or
font pairs on purpose: every look comes from the community itself. The only
fixed rules are at the end, under "The few hard limits". Everything else is
a strong default you may break when you know why.

## 1. Start from the community, then commit

First read the community's saved brand: its colours, fonts, words,
phrases and dos and don'ts (`/communities/<slug>/builder/brand.json` over
the MCP, or `brand.json` in the design folder). Each community keeps its
own, and it is the founder's world, so build from it, not around it. When
the founder tells you a preference ("I always use this navy", "never
orange"), save it to that community's brand (`community.brand.save`) so the
next design starts from it too. If there's no brand yet, ask for one and
save it before designing. Never replace their colours with ones you like
better; adjust a shade only when contrast requires it, and say so.

Then, before touching a token, know:

- **Who it's for** and what they come to do (learn, ship, train, talk).
- **Its world**: the nouns, places, rituals, time of day, tools, the
  founder's own phrases. "Two focused hours before the inbox opens" designs
  better than "productive and modern".
- **Three words** for how it should feel, and **one thing it should feel
  like** (a stopwatch, a field notebook, a members' club, a lab bench).
- **What they already have**: logo, photos, brand colours, a website.

Then choose one clear direction and commit to it. Pick an extreme rather
than a midpoint: quiet and exact, or loud and editorial, or warm and
handmade. A bold idea done precisely beats a safe one done adequately.
Name the direction and write one sentence for its idea. Every later choice
should be traceable to that sentence.

If the founder hasn't picked a direction, show two or three that differ in
kind (type world, colour world, density, voice), not in degree, and let them
choose or mix. If a look already exists, keep its language unless they ask
for a new one.

## 2. Typography carries the identity

- Choose type with character for headings and something calm and highly
  legible for reading. One family can do both if it has the range. Never
  more than two families plus a mono.
- Let the concept choose the face. A display face is for headings only; long
  text in it is tiring.
- Use scale with conviction: a clear step between page title, section
  heading and body. Timid scales (everything 14 to 18px) read as unfinished.
- Weight, case and spacing are tools: uppercase headings need a little
  tracking; heavy headings need lighter body text around them.
- Reading text: 16 to 18px, 60 to 75 characters a line, line height around
  1.5. Lessons are read for a long time; protect them.
- Numbers that change or line up (progress, prices, times, counts) look
  sharper as tabular figures.

## 3. Colour: one world, used with restraint

- One dominant mood (dark, light, warm paper, cold steel), one sharp accent,
  and neutrals tuned to them. Tint the neutrals toward the accent or the
  background instead of using pure greys.
- The accent is a signal, not a paint bucket. Spend it on the one action and
  the one state that matter on each screen: the primary button, progress,
  the current tab. If everything is accented, nothing is.
- Choose light, dark or both because the concept calls for it, not by habit.
  On dark themes, images drawn on white need a light plate behind them.
- One brand can live in light and in dark. To carry a light brand into dark
  mode, keep its accent and character, build near-black neutrals tinted
  toward it, and re-check contrast: an accent that passes on white often
  needs a lighter shade on black. It should still read as the same brand.
- Derive from the founder's brand, but adjust shades until they pass contrast
  (see the hard limits). A slightly deeper brand green that passes is still
  their green.

## 4. Space and hierarchy

- Decide what each screen is for and make that the loudest thing on it. Then
  make the second thing clearly quieter, and everything else quieter still.
- Use a spacing scale (for example 4, 8, 12, 16, 24, 32, 48, 64) and stick to
  it. Generous space around groups, tight space within them: proximity is how
  members see what belongs together.
- Align to edges. Ragged starts, centred-everything and mixed paddings are
  the fastest way to look amateur.
- Density is a choice: compact suits tools and dashboards, roomy suits
  reading and premium feel. Pick one per community and hold it.

## 5. Composition: fewer, better things

- Prefer one strong structure to many boxes. Not every group needs a card,
  a border and a shadow; often a heading and white space are enough.
- Pick one corner language (sharp, soft or round) and one depth language
  (flat, hairline borders, or soft shadows) and use them everywhere.
- Repetition is fine where content repeats (course cards, posts, members).
  Elsewhere, compose: let the hero be big, let a sidebar be quiet.
- Real content, always. Write copy in the community's voice for headings,
  empty states and errors. "No sessions on the calendar yet. Your next two
  hours are still yours." beats "No events".

## 6. Motion and interaction

- Motion explains: something arrives, opens, completes. Short (150 to 250ms),
  eased, and only inside `prefers-reduced-motion: no-preference`.
- Every interactive thing has hover, focus and pressed states that belong to
  the design. Focus must stay clearly visible.
- Whole cards should be clickable when they lead somewhere; small targets and
  hidden actions frustrate members on phones.

## 7. Polish is what reads as premium

Premium is mostly the absence of small mistakes:

- consistent radii, borders and icon sizes everywhere;
- optical alignment of icons with text; no widows in short headings;
- images framed on purpose (consistent ratio, a sensible focal point);
- every state designed: loading, empty, error, signed out, one item, many
  items, a very long title;
- nothing cramped at 390px wide, nothing lost at 1440px.

## Avoid the generic AI look

These are the tells that make a community look machine-made. Use one only
when the concept genuinely asks for it:

- purple-to-blue gradients, glowing blobs, glassmorphism by default;
- Inter or the system font for everything, at timid sizes, because it was
  the first option;
- every block in a rounded card with a drop shadow and a coloured top border;
- emoji as section icons; badges and pills on everything; three equal
  feature columns with icons;
- centred text everywhere; walls of identical cards with no hierarchy;
- grey-on-grey low contrast passed off as "minimal";
- filler copy ("Welcome to our amazing community!", "Unlock your potential");
- the same look you produced for the last community.

If you remove the community's name and logo, a member should still recognize
their community. If they wouldn't, it isn't done.

## 8. Clean in one shot

The first version the founder sees should already feel finished. Working is
not the bar; clean is. Don't show a functional draft and wait for them to
point out the mess.

Set the system before you style a single screen: the type scale (four or
five sizes), two or three weights, the spacing scale, one radius, one border
colour, one shadow or none, one accent. Then build every screen only from
those. Most "unclean" UI is a dozen near-identical values that drifted.

Then run this pass on every screen before anyone sees it:

- **Remove before you add.** Count borders, dividers, badges, icons and
  colours. Delete every one that doesn't carry meaning. Separate with space
  first, a hairline second, a box last.
- **One line of metadata, quiet.** Author, time, counts and category sit
  together in one muted, smaller line, not as separate chips and badges.
- **Three levels of text, no more,** on any component: title, body, meta.
  Differ by size and weight or by colour, rarely all three.
- **Padding you can feel:** at least 16px inside small components and 24px
  inside cards and panels, the same value on every side unless there's a
  reason.
- **Everything on the grid:** left edges line up down the page, icons share
  one size and sit on the text's centre line, gaps repeat exactly.
- **Controls look like one family:** same height, radius and type for
  buttons, inputs and selects; one primary action per view, the rest quiet.
- **Real, trimmed content:** titles that fit, previews clamped to two lines,
  no "Untitled", no test data, no lorem.
- **Empty and edge states look intentional:** one item, a long name, no
  avatar, nothing yet.

Compare it side by side with the best product in the same category (the
community app, course platform or forum members already admire). If yours
looks busier, louder or less resolved, it isn't ready.

## 9. Look at it, twice

Read [references/mistakes.md](references/mistakes.md) before you start and
again now: every mistake founders have caught so far, and why it happened.

Never ship from the code alone. Look at the real thing at 390px and 1440px
(the preview, a browser tool, or screenshots from the founder) and ask:

1. Does it feel like the three words and the direction's idea?
2. What is the loudest thing on each screen, and should it be?
3. Where is it timid? Bigger type, more contrast, more space, one bolder move.
4. Where is it noisy? Remove borders, badges, colours and words that don't
   serve the idea.
5. Anything cramped, misaligned, inconsistent or unreadable?

Fix, look again. At least two passes.

## 10. Done means reviewed

You may not call a design done, show it to the founder or publish it until
both gates pass. This is the one process rule in this skill, because every
mistake in the ledger got through without it.

1. **`polynet review`** opens the draft in the real app at 390, 1280 and
   1440px, screenshots every page and audits each one: sideways overflow,
   overlaps, contrast, colours outside the theme and brand, drift in sizes
   and radii, control heights, tap targets, heavy cards, unclamped previews,
   emoji and filler. Errors fail it. Fix every error; fix each warning or
   say why it stays. `polynet publish` refuses without a passing review of
   the current files.
2. **A fresh reviewer** judges the screenshots against this skill and the
   ledger: the `polynet-ui-reviewer` agent in Claude Code, or a new session
   with [references/reviewer.md](references/reviewer.md). Only its PASS
   counts; never grade your own work.

Then present it with the screenshots, what you chose and why in a sentence
or two, and what you'd try next. When the founder points out something the
gates missed, add it to the ledger in the same turn, so the next design
can't repeat it.

Working over the MCP without the CLI? Take the screenshots with a browser
tool at the same widths, check them against the ledger yourself, and still
hand them to a fresh reviewer.

## The few hard limits

These protect members and keep communities working when Polynet updates.
Everything not listed here is the founder's to decide.

- **Polynet's far-left community rail stays Polynet's.** The list of
  communities, Discover, messages and the account are the same in every
  community. Everything inside the community is designable. On a community
  site, every page loads Polynet's shell and shows `<polynet-account>`.
- **Contrast passes WCAG 2.2 AA**: 4.5:1 for text, 3:1 for large text, the
  accent and controls. Polynet's checks refuse a theme that fails and
  suggest the nearest passing shade; use it.
- **Only the design contract's vocabulary.** In the app, a community is
  styled through its theme and layout records, never by targeting Polynet's
  class names. Unknown tokens are refused, not ignored. See
  [references/in-the-app.md](references/in-the-app.md) for what each lever
  does and how to apply this skill with it.
- **Owner screens follow their own small system** (Settings, Members,
  Workflows, editors): see [references/owner-screens.md](references/owner-screens.md).
- **Everyone can use it**: keyboard, screen readers, zoom to 200%, motion
  only when the member allows it. On sites, `polynet-accessibility` is the
  final pass.
