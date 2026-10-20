---
name: polynet-build-site
description: Build, restyle or extend a Polynet community website (a static site on <slug>.polynet.page that runs on the Polynet SDK). Use when the founder asks to create their community's site, change its look, add or change pages, or make it "theirs".
---

# Build a Polynet community site

The site is the community's look and experience. Polynet hosts everything
else: accounts, members, permissions, payments, posts, events, courses,
memory and the community's AI agent. You write static HTML, CSS and
JavaScript; every piece of community data comes from the SDK at
`/__polynet/sdk.js`.

## 1. Before you write code

1. Read `polynet.json` for the community's slug. No file? Ask the founder:
   it is in their Polynet address (`.../c/<slug>`).
2. Read the SDK reference before using any method:
   `https://<slug>.polynet.page/__polynet/llms.txt` (or
   `https://polynet.page/llms.txt`). Don't guess method names or fields.
3. Learn the community. If the founder hasn't told you, ask at most three
   questions in one message, then start:
   - Who is it for, and what does it promise them?
   - How should it feel? Two or three words ("calm, outdoorsy, early").
   - Any brand colors, fonts, logo or photos to use?

   `session().community_about` and `community_one_liner` often answer the
   first question already.

## 2. What every site has

These are the platform invariants: every Polynet community is navigable the
same way, however different it looks. Style them freely; never drop them.

- **The shell.** `<script type="module" src="/__polynet/ui.js">` and a
  visible `<polynet-account>` on every page, at every width. It is how
  members reach their account, their other communities, Discover, messages
  and settings. Don't rebuild any of those.
- **A public face** for signed-out visitors: the name, the promise, what
  members get, "Sign in" (`polynet.signIn()`) and "Join" (`session.join_url`).
- **For members:** the channels (feed, threads, posting, reactions, live
  updates), the community agent, and the events, courses and knowledge the
  community has.
- **For owners and admins:** a "Manage" link to `session.studio_url` for what
  the site doesn't do (settings, members, billing, creating events and
  courses).

If the community has nothing of a kind yet (no courses, say), keep the page
with a friendly empty state, or hide its link until there is something.

## 3. Start from the starter

If the folder has the starter (`index.html`, `theme.css`, `content.js`,
`app.js`), restyle and reshape it rather than starting over:

- `theme.css`: the design tokens (colors, fonts, radius, spacing). Change
  these first; most of a new look lives here.
- `content.js`: every word the site says. Rewrite it in the community's voice.
- `app.css`: layout and components. `app.js`: pages and behavior.
- `md.js`: safe markdown rendering; use it for post text and agent replies.

The starter is a floor, not a layout to match: change structure, navigation
and layout as far as the design needs. Starting from scratch is fine too, as
long as section 2 holds.

## 4. How to work

- Look: follow the `polynet-design` skill.
- Rules every page must meet: `polynet-accessibility`.
- Data: `polynet-sdk`.
- Ship and check: `polynet-deploy-verify`.
- The SDK only works on the live site, so deploy early and often:
  `npx @polynet/cli deploy` takes seconds. Run `npx @polynet/cli check`
  first; deploy runs it too and stops on errors.
- Never put tokens, passwords or keys in the site, and never call Polynet
  servers directly. Escape all Polynet text (`textContent`, or `md.js`).
- Admin, settings, billing, analytics and direct messages live in Polynet
  Studio. Link to them.

## 5. Done means

- `npx @polynet/cli check` reports no errors.
- It is deployed and verified live with `polynet-deploy-verify`: signed out
  and signed in, phone and desktop, keyboard only.
- You tell the founder the live URL, what changed, and anything you could
  not verify, in a few lines.
