# Community site: guide for AI agents

This folder is the website of one community on Polynet, live at
`https://<slug>.polynet.page` (the slug is in `polynet.json`).

Polynet runs the hard parts: accounts, members, payments, posts, events,
courses, memory and the community's AI agent. The site is the community's
world made visible. **You draw the world once, as a frame; Polynet fills
every standard page into it.**

## Non-negotiables

1. **Two files at the root.** `index.html` (the front door) and
   `frame.html`: the world's header, navigation and footer around exactly
   one `<polynet-page></polynet-page>`. Every path in the frame starts
   with `/` (it is shown at `/people/sam` and `/learn/a~k1/b~k2` too).
   `check` and `deploy` fail without them. Draw the frame's chrome in HTML
   and CSS, not with a script: members' own pages (Your communities,
   Messages, Settings) show the frame with every script removed.
2. **The standard pages exist automatically**, inside your frame, from the
   first deploy (the table below). Link them from the frame's navigation.
3. **A custom standard page uses its blocks.** Ship your own `events.html`
   (or `people/index.html`, `discover.html`, ...) only for a different
   composition; it must place that page's block(s). Never rebuild, hide or
   replace a block.
4. **Style only through the rails:** the `--polynet-*` tokens, `::part()`,
   slots, and the page classes (`.pn-page-header`, `.pn-page-heading`,
   `.pn-page-body`, `.pn-page-<name>`, `polynet-page[page=<name>]`; what
   `<polynet-page>` renders is in `polynet-build-site`). Never reach inside
   a block.
5. **Nothing personal is built by a site:** no direct messages, settings,
   "your communities", join flow or private member data. Polynet serves those
   pages (`/messages`, `/settings`, `/communities`, `/join`, and moderation:
   `/moderate`, `/requests`) on the site's
   private twin, in your frame with its scripts removed, and the site's own
   addresses send members there. The shell (`<polynet-account>`, added to
   every page) links them; place it in the frame. Never ship a file at those
   paths (`check` warns). Admin and billing stay in Studio
   (`session.studio_url`).
6. Community data comes only through the blocks and the SDK
   (`/__polynet/sdk.js`). No passwords, tokens or keys in the site, ever.
   Polynet text renders through `textContent` or `polynet.markdown()`,
   never `innerHTML`.
7. `AGENTS.md`, `CLAUDE.md`, `polynet.json` and dotfolders are never uploaded.

## The world model

There is no template. Start from the community and invent its world: a
lantern workshop on a harbor quay, a night-shift radio room, a seed library
in a church hall. Then build three things from it:

- **The frame is the world's chrome.** Header, navigation and footer as
  that place would have them: a tide clock, a station ident, a row of
  seed packets. The nav names the standard pages in the world's words ("The
  workbench" for `/chat`, "Lantern nights" for `/events`, "The ledger" for
  `/knowledge`).
- **Each standard page gets its own feel,** set with tokens and parts:
  how the calendar reads here, what a lesson looks like, what the agent's
  answers sit on. Same blocks on every site; never the same look.
- **Custom views are extras** (a parade map, a leaderboard, a tide chart),
  built with the SDK. They link into the standard pages; they never stand
  in for them.

Ask the founder about the world once; if their brief already answers it,
start. Show three directions live and build the one they pick; if you
can't deploy concepts for them, build the strongest and say in a line why
it won.

## The standard pages

| Path | What it shows | Block | Parts worth styling | Slots |
| --- | --- | --- | --- | --- |
| `/chat` | channels beside the live conversation (`?channel=<slug>`) | `<polynet-channels>` + `<polynet-chat>` | `channel-current`, `message-author`, `day-divider`, `composer-box` | channels: `header`; chat: `header`, `empty`, `signed-out`, `read-only` |
| `/people`, `/people/<handle>` | members, online first; that member's profile open | `<polynet-members>` | `member`, `presence-dot`, `role-badge` | `header`, `empty`, `signed-out` |
| `/events`, `/events/<event>` | the calendar by month; one event (.ics, link) | `<polynet-events>` | `month-title`, `event-date`, `event-title`, `add-to-calendar` | `empty`, `signed-out` |
| `/learn`, `/learn/<course>[/<lesson>]` | courses, a course's lessons, the reader | `<polynet-learn>` | `course`, `lesson-number`, `lesson-body`, `pager` | `empty`, `signed-out` |
| `/knowledge` | the community's memory, searchable | `<polynet-knowledge>` | `memory-title`, `memory-type`, `memory-text` | `header`, `intro`, `empty`, `signed-out` |
| `/ask` | the member's private conversation with the agent | `<polynet-ask>` | `message-agent`, `starter`, `box` | `header`, `privacy`, `starters`, `signed-out` |
| `/discover` | every published community, searchable; public | `<polynet-discover>` | `community`, `community-name`, `community-here` | `header`, `intro`, `empty` |

Inside `<polynet-page>` in the frame, `<h1 slot="events-heading">Lantern nights</h1>`
renames a page (`<name>-heading`), and
`<p data-block="polynet-events" slot="empty">…</p>` gives a block your
words. Signed out, every block but Discover shows a sign-in and join prompt
and nothing inside. The full list of parts and slots is in llms.txt.

## Preview loop

There is no local preview. The blocks, the shell and the SDK render only
on Polynet, which serves `/__polynet/*` to the site; on a local static
server the tags stay empty (slot text shows unstyled). Deploy to see them;
a community on Polynet's staging deploys with `--staging` to
`https://<slug>-staging.polynet.page`. After each meaningful change, open
the home page and every standard page at 390 and 1440 px wide, signed out
and signed in, and fix what reads as a stock widget.

Can't deploy? Build the strongest direction, keep the three directions and
why this one won in your report, and list exactly what the founder should
verify once it's live (`polynet-build-site` has the list).

## Skills

Read the one that fits before you start. They're in `.agents/skills/` (the
same files are in `.claude/skills/` for Claude Code):

- `polynet-build-site`: the flow, the frame, a complete example.
- `polynet-design`: discover the world, three directions, build, critique.
- `polynet-ui-design`: design taste and craft (type, colour, space, polish,
  avoiding the generic AI look), for the site and for the community in the app.
- `polynet-sdk`: community data and actions, with recipes.
- `polynet-accessibility`: the final pass, and what the checks block.
- `polynet-deploy-verify`: ship it and prove it works.

Reference: `https://polynet.page/llms.txt` (also at
`https://<slug>.polynet.page/__polynet/llms.txt` once deployed; on
Polynet's staging, `https://staging.polynet.page/llms.txt`).

## Commands

    npx @polynet/cli check     # index.html, frame.html, standard pages, accessibility basics
    npx @polynet/cli deploy    # check, then live in seconds (add --staging for staging)
    npx @polynet/cli skills    # update these skills
