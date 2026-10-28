# Community site: guide for AI agents

This folder is the website of one community on Polynet, live at
`https://<slug>.polynet.page` (the slug is in `polynet.json`).

Polynet runs accounts, members, payments, posts, events, courses, memory and
the community's AI agent. This site is the community's world made visible:
static HTML, CSS and JavaScript on the Polynet SDK (`/__polynet/sdk.js`).

There is no template. Start from the community: ask about its world, show
the founder three directions live, build the one they choose, and make it
unmistakably theirs.

## Skills

Read the one that fits before you start. They're in `.agents/skills/` (the
same files are in `.claude/skills/` for Claude Code):

- `polynet-build-site`: the flow, and what every site must have.
- `polynet-design`: discover the world, three directions, build, critique.
- `polynet-sdk`: community data and actions, with recipes.
- `polynet-accessibility`: the final pass, and what the checks block.
- `polynet-deploy-verify`: ship it and prove it works.

SDK reference: `https://<slug>.polynet.page/__polynet/llms.txt`.

## Commands

    npx @polynet/cli check     # accessibility basics
    npx @polynet/cli deploy    # check, then live in seconds
    npx @polynet/cli skills    # update these skills

## Rules

1. Every page shows `<polynet-account>`: members' account, communities,
   Discover, messages and settings. Signed out it is the "Sign in": don't add
   another one next to it. Polynet adds `/__polynet/ui.js` to every
   page and a corner fallback where a page has none; place and style it into
   the design yourself, and never hide or rebuild it.
2. Community data comes only through the SDK. No passwords, tokens or keys
   in the site, ever.
3. Polynet text renders through `textContent` or `polynet.markdown()`, never
   `innerHTML`.
4. Admin, settings, billing and direct messages stay in Polynet Studio:
   link to `session.studio_url`.
5. `AGENTS.md`, `CLAUDE.md`, `polynet.json` and dotfolders are never uploaded.
