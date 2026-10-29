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

- **Messages.** Opens the member's inbox on the site's private twin, in the
  site's own frame: conversations, typing, read state, attachments and "new
  message". See *Messages (3b-3)* and *Private messages stay private* below.
- **Profiles.** Clicking any person anywhere (a post, a member list, an
  @-mention) opens their profile drawer: avatar, name, handle, bio and links
  (through the existing profile privacy filter), their role here, and a
  **Message** button (the conversation with them on the twin's Messages).
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
  (Messages, Settings, Your communities, Join) live on the site's **private
  twin** (below), so site code never reads a member's DMs, other communities
  or settings. **Admin** (Manage) comes after them; until then it keeps its
  Studio link.
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
| `/communities` | Your communities: every community the member is in, each linking to its own site (else Studio) | 3b-1 (now), private twin |
| `/settings` | the member's settings: profile, this community's notifications, leave, sign out (see *Settings* below) | 3b-2 (now), private twin |
| `/messages`, `/messages/<conversation>`, `/messages/new?to=<handle>` | the member's direct messages (see *Messages* below) | 3b-3 (now), private twin |
| `/join` | the community's own join page: its pitch and gate, free, approval or paid (see *Join* below) | 3b-4 (now), private twin |
| `/moderate?ref=…&back=…`, `/requests` | moderation: remove one post (Remove on a post opens it), and review join requests (see *Moderation* below) | 3c-1 (now), private twin |
| `/manage` | community admin | after moderation |

Until `/manage` exists, "Manage this community" opens Studio's community
settings (`/c/<slug>/settings/community`), not the public join page.

## The private twin (Oct 28)

Approved by Neil (decision recorded Oct 28), replacing "an isolated frame
inside the site": personal pages are **top-level pages on their own origin**,
the site's private twin, not a frame embedded in the site. A cross-site frame
loses its cookies in Safari (and in every browser once `polynet.page` joins
the Public Suffix List); a top-level page on its own origin keeps a normal
first-party cookie everywhere.

- **The address.** Each site `<slug><suffix>.<sites domain>` has a twin one
  DNS label over: `<slug>--me<suffix>.<sites domain>`
  (`sunrise-climbing-club--me-staging.polynet.page`), inside the existing
  wildcard routes and certificate. Community slugs may contain `--`, so the
  ending is reserved: no site name ends in `--me` (as none ends in
  `-staging`), so a site address is never another community's twin. One
  helper maps site and twin both ways (`privateTwinHost` / `siteHostOfTwin`
  in `packages/polynet-cli/checks.mjs`), used by the edge, the backend and
  the CLI.
- **It looks like the site.** The edge fetches the site's `frame.html`
  server-side and strips everything executable (scripts, event handlers,
  `javascript:`/`data:` URLs, frames, objects, `<base>`, refreshes, forms),
  keeping the markup, classes, stylesheets, inline styles and fonts. Links to
  the site go back to the site's origin; links to personal pages stay on the
  twin. So the frame's chrome must be HTML and CSS: `checkSite` warns when it
  looks script-drawn.
- **Only Polynet's code runs there.** The twin serves its own `ui.js`,
  blocks and `<polynet-personal>`; its policy is `script-src 'self'` (no
  inline), styles only from the twin, the site, Google Fonts and the frame's
  own inline styles by hash, `frame-ancestors 'none'`, `form-action 'self'`,
  `base-uri 'none'`, `object-src 'none'`, `no-store`. The member's data
  renders in shadow roots, which the site's CSS reaches only through
  `::part()`.
- **Its own session.** The twin signs in through the same `/__polynet/auth/*`
  hop as the site (silent for a member already signed in to Polynet) and gets
  its own host-only `__Host-` cookie. Its origin is registered beside the
  site's at every deploy (and by a backfill for older sites) as `private`; a
  session minted there is recorded as `kind: "private"`. Every personal
  endpoint requires a private session, and the site answers them 404.
  Everything the site's endpoints do works on both.
- **Join signs in non-members.** The twin's sign-in also mints a private
  session for someone on Polynet who isn't a member yet, for Join: only
  Polynet's code runs there, every other personal page still requires
  membership, and the site API re-checks it on every call. The site's own
  sign-in still refuses them, and sends them to `/join`.
- **Studio's access, every request.** A session outlives the membership it
  was minted for, so every personal page and the live DM watch check the
  member again with Studio's own chain (`requireCommunityChatAccess`: the
  community can run, the member isn't blocked, and is entitled, so a lapsed
  paid membership is out). The owner passes as owner.

### Settings (3b-2)

The menu's Settings opens the twin's `/settings` (Polynet's own settings
where a site has no twin). It shows and edits exactly what Studio's member
settings do, through the same backend cores, so every rule and refusal is
Studio's:

- **Your profile:** name, handle (checked as it's typed), bio, YouTube, X and
  Instagram links, and the photo. The photo follows Studio's upload flow: an
  upload URL from the twin, the file (resized to 1024px and re-encoded in the
  browser, as Studio does) straight to Polynet's storage, then a confirm. The
  twin's confirm takes only an image uploaded in the last hour, never an
  existing file. No framing editor yet: a new photo starts centered.
- **Notifications:** Studio's two: mute this community, and the weekly
  community digest (one setting for every community, as in Studio).
- **Leave this community:** asks inline, then goes to `/communities`. The
  owner can't leave, and the page says so.
- **Sign out:** ends this browser's sessions on the site and its twin, nowhere
  else (the member's other devices stay signed in). Each origin keeps its own
  host-only cookie, which only a visit there can clear, so the first sign-out
  returns a ticket (two minutes, signed by the backend, bound to the member and
  community) and the browser visits the other origin's
  `/__polynet/auth/signout`, which ends its session only with a valid ticket for
  the same member. The shell's Sign out does the same from either side. (Site
  code's own `polynet.signOut()` still ends only the site's session.)
- **Account and billing on Polynet:** the one link out, to Studio's
  `/settings/account`, in the same tab.

Every settings endpoint is `/__polynet/me/*` on the twin only (same-origin,
writes as small JSON POSTs), forwarded to `/runtime/app/me/*`, which answers
only a private session of someone still in the community.

### Messages (3b-3)

The menu's Messages opens the twin's `/messages`; a profile's **Message**
button (on the site and on the twin) opens `/messages/new?to=<handle>` there,
in the same tab, which shows their existing conversation (the address becomes
`/messages/<conversation>`) or, when Studio's rules let the member message
them (a shared community, no block either way), an empty conversation that
the first message creates. Where a site has no twin, both open Studio's inbox.
It shows and does what Studio's DMs do, through the same helpers
(`convex/directMessages.ts`: Studio's functions are thin wrappers over them),
so every rule, rate limit, block and refusal is Studio's:

- **Inbox:** every conversation, newest first, with the other person's picture
  and name, the last message, unread counts and muted marks; a search by name.
  Beside the conversation on a wide page, instead of it on a narrow one.
- **Conversation:** each at its own address. Messages by day, links in text,
  images and files; "Load earlier messages"; "Seen" once the other person has
  read the member's last message; read up to the newest message shown while
  the page is visible; typing both ways (Studio's lease, renewed while
  typing); a send that fails stays on screen with Studio's words and Retry
  (the same key, so the server never takes it twice).
- **Attachments:** Studio's flow and limits (8 files, 10 MB each, 25 MB in
  all, Studio's types). The twin's send takes only a file uploaded in the
  last hour, with the size and type storage recorded.
- **Mute and block:** both on the conversation; block and unblock ask first.
  Blocked, the box is replaced by a note; the other person isn't told.

**Live, and why it is safe.** The page subscribes to
`communityLive:watchMessages` on Polynet's live updates with the twin
session's watch token (derived from its session token, handed out only by the
twin's own `/__polynet/auth/session`, same-origin). The query answers only a
token whose session was minted as private on an origin that is still the
private twin, of someone still in the community; the site's watch token, which
the site's code holds, is refused. It returns only a version (for the inbox,
or for one of the member's own conversations) and, in a conversation, whether
the other person is typing: no text, names or ids. A new version makes the
page re-read through `/__polynet/me/messages*`. The twin's policy allows
`connect-src` to exactly that one Polynet origin (`https` and `wss`). Without
live updates the page still re-reads whenever the member returns to the tab.
(Short polling through the edge was the alternative: simpler to reason about,
but slower and a steady load on every open tab; the watch carries nothing a
private route wouldn't.)

Every Messages endpoint is `/__polynet/me/messages*` on the twin only
(same-origin, reads as GETs, writes as small JSON POSTs, the send up to 24 KB),
forwarded to `/runtime/app/me/messages*`, which answers only a private session
of someone still in the community. A conversation is named by its id and a
person by their handle; no user id or storage id reaches the page, and
another member's conversation reads as no conversation at all.

### Join (3b-4)

Every Join on a site opens the twin's `/join`: `session().join_url` (so the
shell's Join and the blocks' "New here? Join"), and `/join` on the site itself
(the edge sends it to the twin, unless the site has its own file there). A
Polynet user who isn't a member and presses the site's "Sign in" lands there
too, instead of a dead end. Where a site has no twin, Join is Studio's
`/c/<slug>`. Studio's funnel is unchanged.

The page is the community's pitch (name, one-liner, about, member count,
avatar), readable signed out, and its **gate exactly as Studio's funnel
decides it**: the backend projects it with Studio's own functions
(`shared/communityJoinPolicy.ts`, moved from the web app so both share it, and
`shared/communityFunnelUi.ts` for the button words) and every action runs
Studio's core (`convex/communityAppJoin.ts`). No second gate logic:

- **Open:** "Join free". Signed out it signs in first (the normal hop, back
  to `/join`), then one press joins through Studio's join core.
- **Approval:** the same press asks (Studio has no join questions; there are
  none here either), then "Request pending" in Studio's words, with "Cancel
  request". The page re-reads while it's open (every 30 seconds and on
  return to the tab), as Studio's does. A denial says until when; after
  that, "Request again".
- **Paid:** Studio's plans (one per billing period, priced in Studio's words;
  a choice when there are two), then Studio's checkout, created by the same
  backend path (`startCommunityJoinCheckoutCore`), on the founder's Stripe
  account, returning only to this twin's own `/join` (success
  `/join?checkout=<Polynet's checkout id>`, cancel `/join?checkout=canceled`),
  built by the backend from the twin origin it verified, never from the page.
  The page goes exactly where the backend's answer says (the edge passes only
  a `https://checkout.stripe.com/` address). Back from Stripe it shows
  "Finishing up…" and asks the backend, which runs Studio's finalization and
  claim: membership comes only once Stripe's verified webhook has marked the
  checkout complete. A return alone grants nothing. After a minute it offers
  "Check again".
- **Already a member:** "You're in." with a link into the site.
- **Blocked, denied, cooldown, unavailable, account not set up:** Studio's
  words (or, where Studio shows a raw code, plain ones), and for an
  unfinished Polynet account a link to Polynet's own setup.

Once they're a member (joined, or paid and confirmed) the page sends them into
the site through the site's own sign-in (`/__polynet/auth/start?return=/chat`),
which is silent for someone signed in to Polynet and now succeeds.

Endpoints: `GET /__polynet/me/join` (signed out too) and `POST
/__polynet/me/join`, `/join/cancel`, `/join/checkout`, `/join/finish`, twin
only, same-origin, small JSON POSTs (1 KB), forwarded to
`/runtime/app/me/join*`; every action requires a private session (the site's
own session, which its code holds, is refused).

## Moderation (3c-1, Oct 28)

Approved by Neil: moderators (and owners and admins) moderate content and
review join requests; channels, events and members stay with admins. On a
site, moderation goes through the private twin, so a site's own code never
moderates (a site session stays member-level for everything):

- **Remove a post.** The chat block shows Remove on others' posts to an
  owner, admin or moderator (`session.member.role`; display only). It's a
  link to the twin's `/moderate?ref=<interaction ref>&back=<site path>`,
  which shows the post's author and text, removes it with Studio's own
  moderator delete on confirmation (`/__polynet/me/moderation/*`), and links
  back. A removed post leaves the feeds like an author's own delete; the
  moderation log records who removed it.
- **Join requests.** The account menu shows "Join requests" to those who
  review them, opening the twin's `/requests`: the community's pending
  requests (name, handle, photo) with Studio's approve and deny. A paid
  community admits through checkout only, so it has none.
- **Who may.** The backend decides on every call with the one lens
  (`requireCommunityModerator`), for the session's own community only: a
  post or request of another community reads as none at all.
- **Studio.** Owners, admins and moderators see Delete on anyone's post and
  reply ("Remove this message for everyone?").

## Private messages stay private

A site's code is written by its founder (or the founder's agent) and runs
with the member's session. If site code could read DMs, any founder could
read their members' private conversations, including ones with people from
other communities. So:

- **No DM API for site code.** The SDK and `/__polynet/api` never expose
  conversations or messages.
- **Messages is a page on the site's private twin** (above): the site's own
  frame with none of its scripts, so the site's code can't read it. Its
  session is minted server-side by the edge, never handed to page script,
  and its API answers only same-origin calls (the existing `fromThisSite`
  rule) from private sessions.
- **The Safari risk is settled by design:** a top-level page on its own
  origin keeps a first-party cookie in every browser, before and after
  `polynet.page` joins the Public Suffix List.

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
| DMs | `directMessages` | nothing for site code; Messages on the private twin only |

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
3. **Shell rails**: the profile drawer, the private twin (3b-1: the stripped
   frame, its session and Your communities; 3b-2: Settings; 3b-3: Messages;
   3b-4: Join), and Studio's back bar.
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
