# Community site: guide for AI agents

This folder is the website of one community on Polynet, live at
`https://<slug>.polynet.page` (the slug is in `polynet.json`).

Polynet runs accounts, members, payments, posts, events, courses, memory and
the community's AI agent. This site is the community's world made visible:
static HTML, CSS and JavaScript, with Polynet's blocks for the social core
and the Polynet SDK (`/__polynet/sdk.js`) for anything else.

## Non-negotiables

1. **Every site places Polynet's three blocks**, on any page you like:
   `<polynet-channels>` (the channels), `<polynet-chat>` (the conversation,
   composer, threads, reactions and @-tags) and `<polynet-members>` (who's
   here; each opens a profile with Message). `check` and `deploy` fail
   without them. They are how members find each other on every Polynet
   site, so never rebuild them, hide them or replace them with your own.
2. **The shell is automatic.** Polynet adds `/__polynet/ui.js` to every page
   and `<polynet-account>` (account, communities, Discover, messages,
   settings; "Sign in" when signed out) where a page has none. Place it into
   the design yourself; never hide or rebuild it, or add a second "Sign in".
3. **The blocks and the shell are Polynet's; their look is yours.** Style
   them only through the `--polynet-*` tokens, `::part()` and slots (your
   own words for headers, empty and signed-out states). No reaching inside.
4. **Direct messages are never built by the site.** The shell and profiles
   open them in Polynet. Admin, settings and billing stay in Polynet
   Studio: link `session.studio_url`.
5. Community data comes only through the blocks and the SDK. No passwords,
   tokens or keys in the site, ever. Polynet text renders through
   `textContent` or `polynet.markdown()`, never `innerHTML`.
6. `AGENTS.md`, `CLAUDE.md`, `polynet.json` and dotfolders are never uploaded.

## The creative brief

There is no template. Start from the community: ask about its world, show
the founder three directions live, build the one they choose, and make it
unmistakably theirs. Already have a full brief from the founder? Don't ask
again: start. Can't deploy concepts for them to pick? Build the strongest
direction and tell them in a line why it won. Invent the room the blocks live in (a boathouse
noticeboard, a night-shift radio log, a studio wall) and design around
them, so the chat feels like that community's place to talk, not a widget
dropped on a page. Custom views (a route log, a leaderboard, a reading
list) are welcome beside the blocks, built with the SDK.

## Skills

Read the one that fits before you start. They're in `.agents/skills/` (the
same files are in `.claude/skills/` for Claude Code):

- `polynet-build-site`: the flow, where the blocks go, a complete example.
- `polynet-design`: discover the world, three directions, build, critique.
- `polynet-sdk`: community data and actions for custom views.
- `polynet-accessibility`: the final pass, and what the checks block.
- `polynet-deploy-verify`: ship it and prove it works.

Reference: `https://polynet.page/llms.txt` (also at
`https://<slug>.polynet.page/__polynet/llms.txt` once the site is deployed;
on Polynet's staging, `https://staging.polynet.page/llms.txt`).

## Seeing the blocks

The blocks and the shell render only on Polynet, which serves
`/__polynet/*` to the site. On a local static server the tags stay empty
(your slot text shows unstyled): that's expected, not a bug. Deploy and look
at the live site; a community on Polynet's staging deploys with `--staging`
to `https://<slug>-staging.polynet.page`.

## Commands

    npx @polynet/cli check     # index.html, the blocks, accessibility basics
    npx @polynet/cli deploy    # check, then live in seconds (add --staging for staging)
    npx @polynet/cli skills    # update these skills
