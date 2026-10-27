---
name: polynet-build-site
description: Build or change a Polynet community's website (a static site on <slug>.polynet.page that runs on the Polynet SDK). Use when the founder asks to create their community's site, redesign it, or add or change pages and features.
---

# Build a Polynet community site

The site is the community's look and experience. Polynet runs everything
else: accounts, members, permissions, payments, posts, events, courses,
memory and the community's AI agent. You write static HTML, CSS and
JavaScript; all community data comes from the SDK at `/__polynet/sdk.js`.

There is no template to restyle. Every site starts from its community's own
concept.

## The flow

1. **Orient.** The slug is in `polynet.json` (or ask: it's in the founder's
   Polynet address, `.../c/<slug>`). Read the SDK reference before using a
   method: `https://<slug>.polynet.page/__polynet/llms.txt`.
2. **Design first** with `polynet-design`: discover the community's world,
   show three directions live, build the one the founder picks.
3. **Build** each page as hand-written HTML that JavaScript fills with live
   data (`polynet-sdk` has the recipes). Deploy early and often: the SDK
   only works on the live site.
4. **Finish** with `polynet-accessibility`, then ship and check it live
   with `polynet-deploy-verify`.

Changing an existing site? Keep its design language unless the founder asks
for a new one.

## What every site has

Every Polynet community is navigable the same way, however it looks. Design
these into the concept; never drop them:

- **The shell**: a visible `<polynet-account>` on every page and at every
  width. It gives members their account, their communities, Discover,
  messages and settings. Never rebuild those. Polynet adds
  `/__polynet/ui.js` to every page, and puts the shell in the top-right
  corner of any page that doesn't place it; place it yourself so it fits.
- **A public face** for visitors: who it's for, why it's worth joining,
  "Sign in" (`polynet.signIn()`) and "Join" (`session.join_url`).
- **The community's life for members**: the conversation (channels, threads,
  reactions, live updates) and its agent, plus events, courses and knowledge
  when the community has them. Give them pages or sections as the design
  wants; skip what the community doesn't have yet.
- **A way to Polynet Studio** for owners and admins: link `session.studio_url`
  for settings, members, billing and creating events or courses.

## Rules

- No secrets in the site: no tokens, passwords or keys. Never call Polynet
  servers directly.
- Render Polynet text safely: `textContent`, or `polynet.markdown(text)` for
  posts and agent replies. Never `innerHTML` with Polynet text.
- `npx @polynet/cli check` must report no errors (deploy runs it too).

## Done means

- The founder chose the direction, and the site is unmistakably theirs.
- Checks pass, it's deployed, and you verified it live: signed out and
  signed in, phone and desktop, keyboard only.
- You told the founder the live URL, what changed, and anything you
  couldn't verify, in a few lines.
