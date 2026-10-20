# Community site: guide for AI agents

This folder is the website of one community on Polynet. It goes live at
`https://<slug>.polynet.page`; the slug is in `polynet.json`.

Polynet hosts everything hard: accounts, members, permissions, payments,
posts, events, courses, memory and the community's AI agent. This site is the
community's look and experience: static HTML, CSS and JavaScript that gets all
its data from the Polynet SDK (`/__polynet/sdk.js`).

## Commands

    npx @polynet/cli check     # check the site: required parts and accessibility
    npx @polynet/cli deploy    # check, then put it live (takes seconds)
    npx @polynet/cli skills    # update the Polynet skills in this folder

`deploy` refuses to publish while `check` reports errors. The first deploy
opens a browser so the founder can sign in (they must be the community's owner
or an admin).

## Skills

Read the skill that fits the task before you start. They are in
`.agents/skills/` (and the same files in `.claude/skills/` for Claude Code):

- `polynet-build-site`: start here to build, restyle or extend the site.
- `polynet-design`: make it look like this community and nobody else.
- `polynet-accessibility`: the rules every page must meet.
- `polynet-sdk`: reading and writing community data.
- `polynet-deploy-verify`: put it live, then check it really works.

The SDK reference is at `https://<slug>.polynet.page/__polynet/llms.txt`.

## Rules

1. Every page loads `/__polynet/ui.js` and shows `<polynet-account>`, visible
   at every width. It gives members their account, their other communities,
   Discover, messages and settings. Style it; never remove or rebuild it.
2. All community data comes through the SDK. Never call Polynet servers
   directly, and never ask for, store or embed passwords, tokens or keys.
3. Escape everything from Polynet: `textContent`, never `innerHTML` with
   Polynet text (`md.js` renders markdown safely).
4. Every page meets WCAG 2.2 AA: keyboard, focus, contrast, labels, zoom.
5. Admin, settings, billing, analytics and direct messages stay in Polynet
   Studio. Link to `session.studio_url`; don't rebuild them.
6. `AGENTS.md`, `CLAUDE.md`, `polynet.json` and dotfolders are never uploaded.

## Files (the starter)

- `theme.css`: colors, fonts, shape and spacing. Most of a new look is here.
- `content.js`: every word the site says.
- `app.css`: layout and components.
- `app.js`: the pages and how they behave.
- `md.js`: safe markdown rendering.
- `index.html`: the one page that loads it all.
