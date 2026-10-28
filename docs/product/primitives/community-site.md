---
id: product.community_site
title: Community Site
audience: builder, member, llm
status: planned
last_verified: 2026-10-28
---

# Community Site

## Status

Staging only. Community sites run on Polynet's staging environment at
`<slug>-staging.polynet.page`. The production address, `<slug>.polynet.page`,
is not live yet. Until it is, members use the community in Polynet Studio.

## Definition

A community site is a community's own website on `polynet.page`, designed by
the founder (usually with their AI coding agent) and served by Polynet. Members
sign in with Polynet and use the community there: chat, people, events,
courses, knowledge, and the community agent.

Polynet Studio stays Polynet's own interface for founders' administration,
billing, and direct messages.

## How a Founder Builds One

The founder must be the community's owner or an admin.

```bash
npx @polynet/cli create my-site --community <slug>
cd my-site        # open it in Claude Code, Codex, or Cursor
npx @polynet/cli deploy --staging
```

- `create` makes a folder with guides for the founder's AI coding agent. There
  is no template: the agent asks about the community and builds a design.
- A site is static files with an `index.html` (the front door) and a
  `frame.html` (the site's header, navigation, and footer around one
  `<polynet-page>`).
- `polynet check` runs before every deploy and stops on errors such as a
  missing frame or missing accessibility basics.
- Builders can also deploy through the official Polynet MCP.

## Standard Pages

Every site gets Polynet's standard pages inside its own frame, styled to fit
the site's design:

- `/chat` — channels and conversation
- `/people` — members and profiles
- `/events` — events
- `/learn` — courses and lessons
- `/knowledge` — community knowledge
- `/ask` — the member's private conversation with the community agent
- `/discover` — public directory of communities

A site may supply its own version of a standard page, as long as it places
that page's Polynet blocks.

## Private Pages

A member's own pages (such as their list of communities) live on the site's
private twin, a separate address next to the site. Polynet draws the site's
frame there with all of the site's scripts removed, so a site's own code can
never read a member's private pages.

## Rules

1. A site acts as the signed-in member, in the member lane, inside that one
   community. It never has builder authority, even for the owner.
2. Joining and paying still happen on the community's join page.
3. Sites reach the same backend rules as Studio; there is no second source of
   truth.
4. Sites are static files only (up to 50 MB and 2,000 files).

## Related Concepts

- `community`
- `join-page`
- `agent`
- `polynet-mcp`
