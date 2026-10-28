# Community site rails (v0 spec)

Status: approved by Neil on 2026-10-28 ("rails, not templates"; Messages
live inside the site; the account menu, channels, chat and members are
required). Build on staging until the whole model works there; production
comes after. Slice 1 (the site API) is next.

## Why

A vibe-coded site today shows whatever the building agent chose to build. The
Sunrise Climbing Club demo had a nice General feed and nothing else: no
channels, no knowledge, no way to tag a person, no sense of who is around. The
account menu's Messages, Settings, Your communities and Discover all jump to
polynet.ai with no way back. Two causes:

1. **Sites can't do it.** Studio has member mentions, who's online, typing,
   unread counts, profiles and DMs. The site API exposes none of them.
2. **Nothing guarantees it.** Channels, knowledge, events and members are
   available but optional, so every agent builds a different subset.

The goal: the social core of a community comes to screen predictably, every
time, on every site, while each site keeps its own look.

## The model: rails, not templates

Polynet ships the building blocks as web components. **Polynet owns how they
behave; the site owns how they look.**

- Behavior, data, accessibility, live updates and permissions are Polynet's
  and identical on every site.
- Fonts, colors, spacing, radius, layout and placement are the site's. Each
  component inherits the page's font, reads the site's design tokens
  (`--polynet-accent`, `--polynet-surface`, `--polynet-text`,
  `--polynet-muted`, `--polynet-border`, `--polynet-radius`), and exposes
  named `::part()`s so a site can restyle any piece. Empty states and headers
  take slots, so the site's voice ("Nothing logged yet...") stays.
- Sites can still build custom views with the SDK (the Sunrise "route log"
  stays legal) **in addition to** the required blocks, never instead of them.

## The blocks

### Always there (the shell, injected by the edge on every page)

The edge already injects `/__polynet/ui.js` and shows `<polynet-account>` on
any page without one. It grows into the rails:

- **Messages.** Opens a drawer inside the site: the member's inbox,
  conversations, typing, read state, attachments and "new message". See
  *Private messages stay private* below.
- **Profiles.** Clicking any person anywhere (a post, a member list, an
  @-mention) opens their profile drawer: avatar, name, handle, bio and links
  (through the existing profile privacy filter), their role here, and a
  **Message** button.
- **Your communities.** Listed in the menu; each opens that community's site,
  or its Studio page when it has none.
- **Discover** (since 3a-3) is the site's own `/discover`, inside its frame.
- **Account settings, billing, community admin.** Open Studio, which
  shows a **"← Back to {community}"** bar when it was opened from a site
  (`?from=` validated against the community's registered site origins).

### On every site (Polynet's /chat and /people carry them; see *Its own world*)

- **`<polynet-channels>`**: the channels the member can read, with unread
  counts and a mention badge. Selecting one drives the chat.
- **`<polynet-chat>`**: the channel feed and composer. Posts, threads,
  reactions, attachments, edit and delete, live updates, typing indicators,
  and @-tagging: typing `@` suggests members (and the community agent), and a
  tagged member gets the existing mention notification and email.
- **`<polynet-members>`**: everyone here, online first with a presence dot,
  searchable, each opening the profile drawer.

### On every site too (Polynet's /events, /learn, /knowledge and /ask carry them)

- **`<polynet-events>`**: upcoming first by month (times in the event's zone,
  and the member's when it differs), past folded below; each event at
  `/events/<event>` with an .ics download and a copy-link. No RSVP (none in
  the backend). `limit="n"` previews the next few anywhere.
- **`<polynet-learn>`**: the course catalogue, a course's lessons in order,
  and the lesson reader with previous/next.
- **`<polynet-knowledge>`**: the community's memory, top memories and a
  search, each opened in place and labelled as memory.
- **`<polynet-ask>`**: the member's private conversation with the community
  agent, streaming, with starter questions while it's empty.

### And Discover (Polynet's /discover carries it; public)

- **`<polynet-discover>`**: every published community (never unlisted;
  active and operational only) as a card in the site's style, with a
  search by name or one-liner. Each opens that community's own site when it
  has one, else its Studio page (`/c/<slug>`), in the same tab; this
  community is marked. Signed in or not. Data: the edge's
  `GET /__polynet/discover` (public cards only, cached 60s) over the
  backend's `/runtime/community_edge/discover` (edge secret).
  `limit="n"` previews the first few anywhere.

### Recommended (the guide asks for it)

- **`<polynet-online>`**: a compact "who's here now" strip.

## Its own world (Oct 28)

Approved by Neil: nothing a member presses on a community site drops them
into Polynet's generic app. **The site draws one frame; Polynet fills every
standard page into it.**

- **The frame.** Every site ships `/frame.html`: its own header, navigation,
  footer, fonts and colors around exactly one `<polynet-page></polynet-page>`.
  Deploys fail without it (`checkSite`). Its links start from the root
  (`/styles.css`), because it is shown at nested paths like `/people/sam`.
- **Standard pages exist from the first deploy.** For a standard path the site
  doesn't serve itself, the edge serves the site's frame there (status 200,
  the usual shell injection, `<title>` set to "<Page> · <community>").
  `<polynet-page>` (`/__polynet/blocks/page.js`) reads the address and renders
  the page's blocks in the page's own DOM, so the site's CSS and `::part()`
  rules style it. No frame: Polynet's own "this page needs the site's frame"
  page (404), never a blank.
- **Override rule.** A site may ship its own file at a standard path
  (`chat.html`, `chat/index.html`, `people/...`); the site's file wins, and it
  must place the same blocks (`checkSite`). Client-side routes can't override
  a standard page: only a file at that path does.
- **Community pages** use blocks the site's code can already see (chat,
  members, events, courses, knowledge, ask), and so does **Discover**,
  which is public data only. **Personal pages**
  (Messages, Settings, Your communities, Join) and **admin** (Manage) come
  later inside a private isolated window on a separate origin, so site code
  never reads a member's DMs, other communities or settings; until then they
  keep their current Studio links.
- **The two allowed hops** off the site: Polynet's sign-in page and Stripe's
  checkout. Everything else stays on the site.

The route table lives in one place (`STANDARD_PAGES` in
`packages/polynet-cli/checks.mjs`), read by the edge, `<polynet-page>`, the
shell's menu ("In this club") and the checks.

| Path | Page | Slice |
| --- | --- | --- |
| `/chat` | channels + chat | 3a-1 (now) |
| `/people`, `/people/<handle>` | members; the profile open for that handle | 3a-1 (now) |
| `/events`, `/events/<event>` | events; that event's page (`<id>~<start ms>`, from its ref) | 3a-2 (now) |
| `/learn`, `/learn/<course>`, `/learn/<course>/<lesson>` | courses; a course's lessons; a lesson (Polynet's `<name>~<id>` path segments) | 3a-2 (now) |
| `/knowledge`, `/ask` | the community's memory; the member's private agent conversation | 3a-2 (now) |
| `/discover` | every published community, public; the shell's "Discover communities" | 3a-3 (now) |
| `/messages`, `/settings`, `/communities`, `/join` | personal pages | 3a, isolated window |
| `/manage` | community admin | after the isolated window |

Until `/manage` exists, "Manage this community" opens Studio's community
settings (`/c/<slug>/settings/community`), not the public join page.

## Private messages stay private

A site's code is written by its founder (or the founder's agent) and runs
with the member's session. If site code could read DMs, any founder could
read their members' private conversations, including ones with people from
other communities. So:

- **No DM API for site code.** The SDK and `/__polynet/api` never expose
  conversations or messages.
- **The Messages drawer is a Polynet-rendered frame on a separate origin**
  (one per community, under the sites domain), themed with the site's
  tokens, so the site's scripts can't read it. Its session is minted
  server-side by the edge, never handed to page script, and its API answers
  only same-origin calls (the existing `fromThisSite` rule).
- **Risk to prove first in slice 3:** once `polynet.page` is on the Public
  Suffix List, that frame is cross-site, and Safari may block its cookie.
  Fallback: Messages opens as a full Polynet page on that origin with the
  "back to community" bar. Same privacy, one extra navigation.

## What the backend adds (slice 1)

All through the same five verbs every actor uses, so MCP agents get them too.

| Need | Exists for Studio | Site API adds |
| --- | --- | --- |
| Who's online | `communityPresenceCore` leases | presence on `members/` entries; `community.presence.renew` |
| Typing | `communityTypingPresenceCore` | `community.typing.set` / `clear`; typists in the live watch |
| Unread | `communityReadCursorCore` | `unread_count` and `mentioned` on channel entries; `community.read.advance` |
| @-mentions | mention rows, broadcasts, emails | `mentions` on post write, validated as members of this community |
| Profiles | `profiles` + privacy filter | `members/<handle>` read returns the filtered profile and `avatar_url` |
| Live | `communityLive:watch` (channel changed) | the same watch also carries typists and presence changes |
| DMs | `directMessages` | nothing for site code; the isolated Messages frame only |

Presence and typing are members-only and scoped to this community; leaving
the community deletes them (existing `deleteCommunityPresenceForUser`).

## Enforcement

- `checkSite` (shared by `polynet check`, CLI deploy and MCP deploy) fails
  without a root `index.html`, without `/frame.html` holding exactly one
  `<polynet-page>`, when the frame uses relative paths, and when a site's own
  standard page lacks that page's blocks. (Until Oct 28 it required the three
  blocks somewhere on the site; the guaranteed `/chat` and `/people` replace
  that rule.)
- The guide (`AGENTS.md`, skills, `llms.txt`) leads with the blocks: design
  the world around them, then add custom views.
- Existing staging sites get a grace warning for one release before deploys
  fail.

## Slices

1. **Site API**: presence, typing, unread, mentions and profiles through the
   five verbs, plus the live watch. SDK functions for each. Tests on the
   canonical executor.
2. **Required blocks**: `<polynet-channels>`, `<polynet-chat>` (with mentions,
   typing, threads, reactions, attachments) and `<polynet-members>`; the
   theming contract; `checkSite` enforcement; guide and skills rewritten.
3. **Shell rails**: the profile drawer, the isolated Messages frame (cookie
   proof first), the communities list, and Studio's back bar.
4. **Recommended blocks**: online, knowledge, events, courses, ask.
5. **Proof**: a fresh agent builds Sunrise Climbing Club from the guide alone,
   twice, with different design directions. Every block is present and both
   sites look nothing alike. Neil's acceptance test on staging.

Each slice ships to staging only. Production comes once, after slice 5. The
CLI publish and founder invites wait for the rails.

## Out of scope

- New social features Studio doesn't already have (voice in sites, polls,
  member-to-member follow).
- Letting sites replace required blocks with custom builds.
- Changing who can see what: every block uses the existing permission checks.
