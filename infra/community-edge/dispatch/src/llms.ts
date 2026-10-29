// SPDX-License-Identifier: MIT (see LICENSING.md and ./LICENSE-MIT)
// The builder doc, served at https://polynet.page/llms.txt (the front door) and
// /__polynet/llms.txt on every community site: everything an AI (or a person)
// needs to build and deploy a community's front end. Kept beside the SDK so
// they change together.
export const LLMS_TXT = String.raw`# Polynet community front end

You are building the website of one community that runs on Polynet. Polynet
hosts everything hard: accounts, members, permissions, payments, posts,
events, courses, memory and the community's AI agent. Your site is the look
and the experience. It is a static site (HTML, CSS, JavaScript) served on the
community's own domain. Polynet's blocks bring the social core; the SDK
below brings everything else.

## Rails, not templates (read first)

You draw the community's world once, as a frame; Polynet fills every
standard page into it.

Non-negotiables:
- Two files at the site's root: index.html (the front door) and
  frame.html (the world's header, navigation and footer around exactly one
  <polynet-page></polynet-page>, every path in it starting with /).
  Deploys fail without them.
- The standard pages exist on every site from the first deploy, inside the
  frame: /chat, /people, /events, /learn, /knowledge, /ask and /discover
  (the table below). Link them from the frame's navigation.
- A site's own file at a standard path (chat.html, events.html,
  discover.html, ...) replaces Polynet's page and must place that page's
  block(s). Never rebuild, hide or replace a block.
- Style only through the --polynet-* tokens, ::part(), slots and the page
  classes (.pn-page-*, polynet-page[page=...]). Never reach inside a block.
- Nothing personal is built by a site: no direct messages, settings, "your
  communities" or private member data. The shell (<polynet-account>,
  added to every page) carries those; admin and billing stay in Studio.

The world model:
- Invent the community's world (a lantern workshop on a harbor quay, a
  night-shift radio room, a seed library in a church hall).
- The frame is the world's chrome: its header, nav and footer as that place
  would have them, naming the standard pages in its words ("The workbench"
  for /chat, "Lantern nights" for /events).
- Each standard page gets its own feel through tokens and parts: how the
  calendar reads, what a lesson looks like, what the agent's answers sit on.
- Custom views (a parade map, a leaderboard) are extras built with the SDK;
  they link into the standard pages, never stand in for them.

| Path | What it shows | Block | Parts worth styling | Slots |
| --- | --- | --- | --- | --- |
| /chat | channels beside the live conversation | <polynet-channels> + <polynet-chat> | channel-current, message-author, day-divider, composer-box | channels: header; chat: header, empty, signed-out, read-only |
| /people[/<handle>] | members, online first; a profile open | <polynet-members> | member, presence-dot, role-badge | header, empty, signed-out |
| /events[/<event>] | the calendar; one event | <polynet-events> | month-title, event-date, event-title, add-to-calendar | empty, signed-out |
| /learn[/<course>[/<lesson>]] | courses, lessons, the reader | <polynet-learn> | course, lesson-number, lesson-body, pager | empty, signed-out |
| /knowledge | the community's memory, searchable | <polynet-knowledge> | memory-title, memory-type, memory-text | header, intro, empty, signed-out |
| /ask | the member's private conversation with the agent | <polynet-ask> | message-agent, starter, box | header, privacy, starters, signed-out |
| /discover | every published community, searchable (public) | <polynet-discover> | community, community-name, community-here | header, intro, empty |

Preview loop: there is no local preview. Blocks, the shell and the SDK
render only on Polynet (which serves /__polynet/*), so deploy to see them
(--staging for a community on Polynet's staging), then check the front
door and every standard page at 390 and 1440 px wide, signed out and
signed in. Can't deploy? Build the strongest direction, keep the concept
notes in your report, and list exactly what the founder should verify once
it's live: every standard page at both widths, signed out and in; the
blocks in the site's type, color and edges; every slot's words showing;
one shell in the header; the current page marked in the nav.

## Workflow (start here)

1. Know the community's slug: it is in the community's Polynet address
   (.../c/<slug>). The person deploying must be its owner or an admin.
2. Design first (the next section): learn the community's world, show the
   founder three directions, build the one they choose.
3. Build the site in a folder with an index.html and a frame.html, and
   test it live. The SDK, the shell and the blocks are served
   by the site's own address, so they only work once deployed: on a local
   static server the tags stay empty (slot text shows unstyled), which is
   expected. From the folder:

       npx @polynet/cli deploy --community <slug>

   Then open https://<slug>.polynet.page. A community on Polynet's staging
   deploys with --staging, to https://<slug>-staging.polynet.page (this
   guide is then at https://staging.polynet.page/llms.txt). A deploy takes seconds: change,
   deploy, refresh, repeat. The first deploy opens a browser to sign in with
   Polynet; later deploys reuse it.
4. Signed out, the site shows its public face. Sign in on the site to see
   member features.

## Design (before any code)

There is no template: every site starts from its community's own world. Aim
for the site members screenshot and send to friends. If it could be any
community's site, it isn't done.

1. Discover. Ask the founder once (if their brief already says, don't ask:
   start): who the members are and what brings them
   together; where and when it happens and what that looks and feels like;
   three words for the feeling and one thing it should feel like (a brand, a
   magazine, a place); any logo, photos, colors or phrases to use. Collect
   concrete nouns: "Thursday nights, the net loft, tea from the urn".
2. Explore three directions that differ in kind: different type, color
   world, layout idea and voice. Make one feel risky. Give each a name, a
   one-sentence idea, typefaces, a palette, a signature move and real copy.
   Build each as one static page (concepts/a.html, b.html, c.html, each
   with the shell and the real blocks themed for that direction, never
   placeholders), deploy, and let the founder pick or mix. If you can't
   deploy concepts for them to pick, build the strongest and tell them in a
   line why it won.
3. Build the chosen one. Write each page's structure in HTML by hand and fill
   it with live data from JavaScript. Design the loading, empty, error and
   signed-out states in the concept's voice. Real words everywhere, never
   test data. Delete the concept pages.
4. Look at it at 390px and 1440px wide, twice: where is it timid (make the
   hierarchy louder), where is it noisy (remove), what is misaligned, and
   do the blocks feel native to the concept or like stock widgets. Fix,
   deploy, look again.

Craft: typefaces with character (Google Fonts or Fontshare) used at
conviction-level scale (headlines at clamp(48px, 9vw, 140px) are normal); a
committed color world with one sharp accent; texture with meaning (a gradient
that is lamplight on dark water, grain, duotone photos, huge numerals);
layouts with one unapologetically huge element; purposeful motion inside
prefers-reduced-motion: no-preference; the community's own photos. Example
of the bar (a made-up community): Port Wren Lantern Guild, "a harbor town
at lighting-up time": a slate-blue page with pools of lantern amber,
Fraunces at 96px, "Paper, wire and a little fire." over "Thursdays ·
7:30 pm · The net loft, Quay Street", and stats like "Tea in the urn:
Always". Bold and accessible are the same craft; make it accessible as the
final pass.

## Load the SDK

    <script type="module">
      import polynet from "/__polynet/sdk.js";
      const session = await polynet.session();
    </script>

Always await polynet.session() first: every other call builds on it.

## Who is here

session() -> {
  signed_in,           // true when a member is signed in
  community,           // the community's slug, e.g. "port-wren-lanterns"
  community_name,      // public: its display name, e.g. "Port Wren Lantern Guild"
  community_one_liner, // public: its one-line promise (or null)
  community_about,     // public: its longer description (or null)
  member_count,        // public: how many members it has
  member,              // { name, handle, avatar_url, role } when signed in, else null
                       // role: "owner", "admin", "moderator" or "member"
  join_url,            // the community's own join page (/join, on its private twin)
  studio_url,          // where owners and admins manage it in Polynet Studio
  live                 // used by watch(); ignore it
}

What works signed out: session() (with the public fields above),
community() and discover(). Everything else (channels, posts, events, courses, knowledge,
the agent) needs a signed-in member and otherwise throws sign_in_required.

- Signed out: show the community's public face from the public fields and a
  "Join" link to session.join_url. The shell (<polynet-account>, below) already
  shows "Sign in": don't add a second one in the header. A quiet "Members, sign
  in" link in the page body (polynet.signIn()) is fine. Anything else on the
  public page is yours to write.
- Members' sections appear once session() says signed_in. If you show and hide
  them with the hidden attribute, add [hidden] { display: none !important; }:
  any CSS display rule on the element otherwise wins, and visitors see the
  member page. Links to those sections (#log) need a scroll after you reveal
  them.
- For an owner or admin (member.role), link to session.studio_url for what the
  site can't do: creating events and courses, settings, members, billing.
- signIn(returnPath?) sends the visitor to Polynet and back here signed in.
  For someone already on Polynet it is one quick redirect.
- session.join_url opens the community's own join page, in your frame: its
  pitch (name, one-liner, about, member count) and the way in, free,
  approval or paid (Stripe's checkout, then back). Once they've joined it
  brings them back to the site signed in. Someone on Polynet who isn't a
  member yet and presses "Sign in" lands there too.
- signOut() signs out of the site and refreshes session(). The shell's own
  Sign out also signs out of the site's private twin.
- polynet.community() -> { name, slug } (the same name as community_name).

## The Polynet shell (required on every page)

Every community site shows the Polynet account control, so members can always
reach their account, their communities, Discover, messages and settings:

    <script type="module" src="/__polynet/ui.js"></script>
    <polynet-account></polynet-account>

Put it where your design wants it (usually the top-right of the header) and
keep it visible on every page and at every width. Signed out it shows "Join"
(a link in --polynet-text) and "Sign in" (--polynet-accent, its text
--polynet-on-accent); on a header darker or lighter than the page, set
those on polynet-account itself, with a matching --polynet-surface; signed
in, the member's avatar opens their account menu: "In this club" (the
site's own standard pages, the current one marked), "Manage this
community" for owners and admins (Studio), "Join requests" for moderators,
Messages, "Your communities" and Settings (the member's own pages, on the
site's private twin), and
"Discover communities" (this site's own /discover). Don't rebuild these
yourself.

Polynet adds /__polynet/ui.js and /__polynet/ui.css to every HTML page it
serves (the script only where the page doesn't load it already), so the
script tag above is optional and including it is harmless. If a page has
no <polynet-account> shortly after it loads, ui.js puts one in the
top-right corner. That fallback is a safety net, not a design: place the
shell yourself.

Style it from your CSS to match the site; its structure and keyboard behavior
are Polynet's:

    polynet-account {
      --polynet-accent: #c2410c;     /* buttons, focus rings, initials */
      --polynet-on-accent: #fff;     /* text on the accent */
      --polynet-surface: #111;       /* menu background (default: Canvas) */
      --polynet-text: #f5f5f4;       /* menu text (default: CanvasText) */
      --polynet-radius: 12px;
      --polynet-font: inherit;
    }

It takes the page's font unless --polynet-font says otherwise. Keep
text/background contrast at least 4.5:1. Add align="start" if it sits at
the left edge. polynet.account() returns what the menu shows, for this
community only: { member { name, handle, avatar_url }, community { slug,
name, role, studio_url }, links { communities, discover, settings, messages } }.
The member's other communities are never readable from a site.

## The frame and the standard pages

Polynet's standard pages exist on every site, in this order in the shell's
"In this club" menu (Discover sits apart, under "Discover communities": it
is every community, not this one):

- /chat: channels beside the chat (?channel=<slug> picks one).
- /people: the members; /people/<handle> is the same page with that
  member's profile open, and closing it returns to /people.
- /events: <polynet-events>, the calendar; /events/<id>~<start ms> is one
  event (from its ref, event:<id>:<start ms>).
- /learn: <polynet-learn>, the courses; /learn/<course> is a course's
  lessons and /learn/<course>/<lesson> a lesson (each the last part of its
  Polynet path, like start-here~k17..., without .md).
- /knowledge: <polynet-knowledge>, the community's memory.
- /ask: <polynet-ask>, the member's private conversation with the agent.
- /discover: <polynet-discover>, every published community on Polynet,
  searchable, for anyone, signed in or not.

They appear inside the site's frame, /frame.html at the site's root: the same header,
navigation, footer, fonts and colors as every other page, with exactly one
<polynet-page></polynet-page> where the page goes:

    <!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Port Wren Lantern Guild</title>
      <link rel="stylesheet" href="/styles.css">
    </head>
    <body>
      <header><a href="/">Port Wren</a>
        <nav><a href="/chat">The workbench</a> <a href="/people">The guild</a>
          <a href="/events">Lantern nights</a> <a href="/learn">Patterns</a></nav>
        <polynet-account></polynet-account></header>
      <main><polynet-page></polynet-page></main>
    </body>
    </html>

- Start every link and file path in the frame from the root (/styles.css,
  not styles.css): it is shown at /chat, /people/<handle> and
  /learn/<course>/<lesson> alike. Deploys
  fail on relative paths there.
- Draw the frame's header, navigation and footer in HTML and CSS, never
  with a script. The member's own pages (Your communities, Messages,
  Settings, Join) are shown in the frame too, on the site's private twin
  (<slug>--me.polynet.page, where only Polynet's code runs): Polynet removes
  every script, event handler and javascript: link from the frame there,
  keeps its markup, classes, stylesheets, inline styles and fonts, and points
  its links back at the site. A script may add to the chrome; if it draws it,
  those pages get an empty header (polynet check warns). Link /messages or
  /communities from the frame if you like: Polynet sends them to the twin.
- Polynet sets each standard page's <title> to "<Page> · <community
  name>" (Chat · Port Wren Lantern Guild; also at /people/<handle> and the
  other addresses under a page). The frame's own <title> shows only where
  Polynet can't read the community's name: make it that name. A site's own
  file at a standard path keeps its own title.
- <polynet-page> renders into the page itself (no shadow DOM), so your CSS
  lays it out. Default: a heading, then channels beside the chat (one
  column on phones, the chat given a height), the members, or the page's
  block at a reading width (the private conversation given a height).
  At /chat, with a chat-heading and an empty slot in the frame, it becomes:

      <polynet-page page="chat">
        <div class="pn-page-header">
          <h1>The workbench</h1>   (your slot="chat-heading" element, its slot removed)
        </div>
        <div class="pn-page-body pn-page-chat">
          <polynet-channels></polynet-channels>
          <polynet-chat><p data-block="polynet-chat" slot="empty">…</p></polynet-chat>
        </div>
      </polynet-page>

  Without a chat-heading the heading is Polynet's <h1
  class="pn-page-heading">Chat</h1>; .pn-page-heading is only ever on that
  default, so style your own heading as .pn-page-header > h1 or by its own
  class. Children meant for other pages are dropped.
  Restyle with .pn-page-header, .pn-page-heading, .pn-page-body,
  .pn-page-chat, .pn-page-people, .pn-page-events, .pn-page-learn,
  .pn-page-knowledge, .pn-page-ask, .pn-page-discover, .pn-page-missing,
  .pn-page-links and
  polynet-page[page=chat|people|events|learn|knowledge|ask|discover|not-found];
  the blocks inside keep their ::part()s.
- Your words: <h1 slot="chat-heading">The workbench</h1> (also
  slot="people-heading", "events-heading", "learn-heading",
  "knowledge-heading", "ask-heading", "discover-heading",
  "not-found-heading") inside <polynet-page>
  replaces that page's heading; <polynet-page no-heading> drops them all;
  <p data-block="polynet-chat" slot="empty">No lanterns lit yet.</p> goes into
  that block as its slot.
- The frame's own nav links to the current page get aria-current="page":
  style them with nav a[aria-current=page].
- Want your own version of one? Ship chat.html (or chat/index.html,
  people/index.html, events.html, learn/index.html, ...): the site's file
  wins over Polynet's, and must place that page's blocks (/chat:
  <polynet-channels> and <polynet-chat>; /people: <polynet-members>;
  /events: <polynet-events>; /learn: <polynet-learn>; /knowledge:
  <polynet-knowledge>; /ask: <polynet-ask>; /discover:
  <polynet-discover>). Only a file counts; a
  client-side route can't replace a standard page. Your own events.html
  doesn't cover /events/<event>: those still show in the frame.
- Messages (/messages, each conversation at /messages/<id>), Your
  communities and Settings are the member's own pages on the site's private
  twin, where the site's code never runs: the inbox, conversations, typing,
  read state and attachments live there, in your frame. There is no
  direct-message API for site code, by design. Join (/join) is there too:
  link "Join" to session.join_url (or to /join, which Polynet sends there).

## Blocks: channels, chat and members

They are on Polynet's /chat and /people pages on every site, and you can
place them on your own pages too. They are the one
way a community's channels, conversation and people appear on a site. Polynet owns how they behave (data, permissions,
live updates, keyboard, screen readers); your site owns how they look. Place
the tags; ui.js (on every page) loads each block only on pages that have it:

    <polynet-channels></polynet-channels>
    <polynet-chat></polynet-chat>
    <polynet-members></polynet-members>

- <polynet-channels>: the channels the member can read, as a nav of links,
  with an unread dot and an "@" badge where someone mentioned them. Arrow
  keys move between channels; Enter opens one.
- <polynet-chat>: the current channel's conversation, live, and the box to
  join it. The feed: posts grouped by author, day dividers, a "New" divider
  at what the member hadn't read, older posts as they scroll up, markdown,
  images and files, reactions, typing ("Sam is typing…") and threads ("3
  replies" opens the thread beside the feed, or over it when the block is
  narrow; Esc closes it). It marks the channel read when the member reaches
  the bottom. Signed out (or not a member) it shows a sign-in and join
  prompt, never posts. Give it a height (it scrolls inside):
  polynet-chat { height: 70vh } is the default; set your own, e.g.
  height: 100% inside a sized layout. channel="<slug>" pins it to one
  channel instead of following the page.
  What members can do in it, with nothing for you to build:
  - Write in the message box under the feed, and reply in the box under a
    thread. Enter sends and Shift+Enter starts a new line (on touch screens
    Enter is a new line and Send sends). A message shows at once while it
    sends; if it fails, it goes back in the box with Retry, and a retry
    never posts twice. Drafts stay with their channel and thread.
  - Tag people: "@" suggests members (online first, by name or handle) and
    the community agent; arrows and Enter or Tab pick. A tagged member is
    notified; tagging the agent asks it, and it answers in the thread.
  - Attach files: the + button, paste, or drag and drop (up to 8 per
    message; images up to 25 MB, video and audio 50 MB, other files 5 MB).
  - React with common emoji, reply, and edit or delete their own messages
    (on hover or focus with a mouse; behind "•••" on touch screens).
  - Others see them typing.
  Where the member can't post (or reply), the box is replaced by a quiet
  note. Your site needs no composer of its own for chat.
  Authors' names and pictures, and @-tags of members in posts, open that
  member's profile.
- <polynet-members>: everyone in the community. Who's online comes first,
  each with a presence dot, then everyone else; owners, admins and
  moderators lead each group and carry a role badge. A search box filters
  by name or handle. It stays live as people come and go, and a large
  community renders 200 at a time, more as the list scrolls. Selecting a
  member opens their profile. Signed out (or not a member) it shows a
  sign-in and join prompt, never a name. It grows with its content: put it
  in a sized, scrolling column if you want it to scroll on its own.

Profiles: clicking a member anywhere (<polynet-members>, a chat author, an
@-tag) opens their profile over the page: a side sheet on wide screens, a
bottom sheet on phones. It shows their picture, name, @handle, role here,
whether they're online, their bio and links (YouTube, X, Instagram), and a
Message button (it opens their conversation with the member, or starts one,
on the member's own Messages page on the site's private twin, in the same
tab; never on their own profile). Esc, the close button or a click outside closes it, and focus
goes back where it was. While it is open the URL carries ?member=<handle>,
so a profile can be linked (link to ?member=sam) and Back closes it. Open
one from your own code:

    document.dispatchEvent(new CustomEvent("polynet:profile", { detail: { handle: "sam" } }));

(or detail { ref } with a member's ref from members() or online()). Signed out, the
panel asks the visitor to sign in and shows nothing about the member.

Which channel: the URL says, ?channel=<slug> (no parameter: the General
channel). Selecting a channel in <polynet-channels> updates the URL and
fires "polynet:channel" on document with detail { slug }; <polynet-chat>
follows it, and so can your own code. To switch channels from your own
navigation, link to ?channel=<slug>, or dispatch the event yourself:

    document.dispatchEvent(new CustomEvent("polynet:channel", { detail: { slug: "glasswork" } }));

When the chat marks a channel read it fires "polynet:read" with { slug }.
Each block reflects its state on the tag as state="loading" | "ready" |
"signed-out" | "error" (the chat also "unavailable"), for your layout:
polynet-chat[state=signed-out] { ... }. The profile panel is
<polynet-profile>, added to the page when one first opens, with
state="loading" | "ready" | "missing" | "signed-out" | "error".

Theme: the blocks use the page's font and inherit its text color. They read
the same tokens as the shell; set them once on :root:

    :root {
      --polynet-accent: #c2410c;   /* unread dot, "@" badge, agent name, "New", presence dot, focus */
      --polynet-on-accent: #fff;
      --polynet-text: #1c1917;     /* default: the page's color */
      --polynet-muted: #78716c;    /* times, dividers' labels (default: text at 62%) */
      --polynet-border: #e7e5e4;   /* hairlines (default: text at 14%) */
      --polynet-surface: #fbfaf7;  /* behind the profile panel, the narrow thread and "New messages" (set it on dark sites) */
      --polynet-radius: 10px;
    }

Restyle any piece with ::part():
- polynet-channels: nav, list, channel (each link; also channel-current,
  channel-unread, channel-mentioned), channel-hash, channel-name,
  unread-dot, mention-badge, status, retry.
- polynet-chat: chat, header, title, feed, history, messages, message (also
  message-grouped, message-agent, message-mine), avatar (avatar-agent),
  message-author, message-time, message-body, message-edited, attachments,
  attachment (attachment-image, attachment-video, attachment-file),
  reactions, reaction (reaction-mine), replies, day-divider, new-divider,
  empty, typing, jump, state, gate, gate-text, sign-in, join, retry,
  thread-panel, thread-header, thread-close, thread-messages,
  thread-divider, thread-typing.
  Sending: message-pending, message-failed, message-status ("Not sent").
  The member's controls on a message: message-actions, message-action
  (message-action-reply, message-action-edit, message-action-delete),
  reaction-add, reaction-picker, reaction-option, message-more (touch),
  editor, edit-input, edit-save, edit-cancel, edit-error, delete-confirm,
  delete-confirm-yes, delete-confirm-no, message-error.
  The boxes (under the feed in footer, under a thread in thread-footer):
  composer, composer-box, composer-input, composer-attach, composer-send,
  composer-error, composer-retry, composer-note, attachment-chips,
  attachment-chip, attachment-thumb, attachment-remove, mention-list,
  mention-option (mention-agent), mention-online.
  A member tagged in a post: mention.
- polynet-members: members, search, list, section (also section-online,
  section-everyone), section-title, member (each one; also member-online,
  member-you), avatar, presence-dot, member-name, member-handle, role-badge
  (also role-owner, role-admin, role-moderator), more, empty, no-results,
  state, gate, gate-text, sign-in, join, retry.
- polynet-profile (the panel): panel, close, avatar, presence-dot, name,
  handle, role-badge, online, you, bio, links, link, message,
  message-note, state, retry, gate, gate-text, sign-in, join.
- polynet-events: events, month, month-title, event (also event-now),
  event-date, event-title, now-badge, event-time, event-local-time,
  event-place, none, past, past-summary, more, all, detail, back,
  detail-title, detail-when, detail-local-time, detail-where, detail-link,
  detail-description, add-to-calendar, share, share-status, missing, empty,
  state, gate, gate-text, sign-in, join, retry.
- polynet-learn: learn, courses, course, course-title, course-count,
  course-heading, lessons, lesson, lesson-number, lesson-title, no-lessons,
  reader, lesson-position, lesson-heading, lesson-body, pager, previous,
  next, back, heading, missing, empty, state, gate, gate-text, sign-in,
  join, retry.
- polynet-knowledge: knowledge, intro, search, search-input,
  search-button, results, showing, clear, memories, memory, memory-toggle,
  memory-title, memory-type, memory-applies, memory-body, memory-text,
  memory-source, no-results, search-error, empty, state, gate, gate-text,
  sign-in, join, retry.
- polynet-ask: ask, privacy, log, message (also message-user,
  message-agent), avatar (avatar-agent), message-author, message-time,
  message-body, thinking, starters, starter, composer, box, input, send,
  problem, state, gate, gate-text, sign-in, join, retry.
- polynet-discover: discover, intro, search, list, communities,
  community-item, community (each card, a link), community-avatar, avatar,
  community-name, community-one-liner, community-meta, community-members,
  community-here, community-elsewhere, all, no-results, empty, state, retry.

Slots, for your own words:
- polynet-channels: slot="header".
- polynet-chat: slot="header" (replaces the "#channel" title in every
  channel, so the chat no longer names the open one: in a frame, rename
  the page with chat-heading instead),
  slot="empty" (a channel with no posts), slot="signed-out",
  slot="read-only" (the note where the member can't post or reply).
- polynet-members: slot="header", slot="empty" (a community with no members
  yet; a search with no match has its own line), slot="signed-out".
- polynet-events: slot="empty" (nothing on the calendar), slot="signed-out".
- polynet-learn: slot="empty" (no courses yet), slot="signed-out".
- polynet-knowledge: slot="header", slot="intro" (above the search),
  slot="empty", slot="signed-out".
- polynet-ask: slot="header", slot="privacy" (the "only you can see this"
  line), slot="starters" (one element holding your own buttons, or each
  button slotted; each asks its text, shown while the conversation is
  empty; style them yourself, ::part(starter) is only Polynet's defaults),
  slot="signed-out":

      <polynet-ask><div slot="starters">
        <button type="button">Which paper takes a candle best?</button>
      </div></polynet-ask>

- polynet-discover: slot="header", slot="intro" (above the search),
  slot="empty" (no communities to show).
A header slot takes any element (<h2>, <p>, a <div> of yours).
slot="signed-out" replaces only the sign-in line: Polynet's "Sign in" button
and "New here? Join" link stay under it, so don't add your own.

Example, in your design's own layout:

    <style>
      .talk { display: grid; grid-template-columns: 220px 1fr 240px; gap: 32px; }
      .talk polynet-chat { height: calc(100dvh - 160px); }
      .talk polynet-members { max-height: calc(100dvh - 160px); overflow-y: auto; }
      polynet-chat::part(message-author) { text-transform: uppercase; letter-spacing: .06em; }
      polynet-members::part(role-badge) { border-color: var(--polynet-accent); }
      @media (max-width: 960px) { .talk { grid-template-columns: minmax(0, 1fr); } }
    </style>
    <section class="talk">
      <polynet-channels></polynet-channels>
      <polynet-chat><span slot="empty">The bench is clear. First sketch?</span></polynet-chat>
      <polynet-members><h2 slot="header">The guild</h2></polynet-members>
    </section>

Where they usually go: a "room" (a page or section named in the
community's words) with channels beside the chat, and the people as a
column there or on their own page. On phones, one column:
polynet-channels::part(list) { grid-auto-flow: column; overflow-x: auto }
turns the channels into a scrolling row above the chat. Custom views (a
parade map, this week's lantern nights) are built with the SDK below, beside the
blocks, never instead of them.

## Blocks: events, learn, knowledge and ask

On Polynet's /events, /learn, /knowledge and /ask pages on every site, and
anywhere you place them. Like the others, signed out (or not a member) each
shows a sign-in and join prompt and never an event, course, memory or
conversation.

- <polynet-events>: upcoming events first, grouped by month, each with its
  date, time in the event's own time zone and, when the member's differs,
  their own ("7:00 – 8:30 PM GMT your time"), and where; one under way is
  marked Now; past events (the last 90 days) are folded below. Each opens
  at /events/<event> (in place on /events; Back returns): when, where, a
  join link the organizer set, the description, "Add to calendar" (an .ics
  file made in the page) and "Copy link". No RSVP. limit="3" shows only the
  next three and a link to /events (for a home page).
- <polynet-learn>: the courses as cards (with lesson counts), a course's
  lessons in order, and the lesson reader (markdown) with Previous and Next.
  Each step is an address under /learn, in place on that page.
- <polynet-knowledge>: what the community knows, from its memory: the top
  memories (title, kind, when it applies) and a search; each opens in place,
  labelled "From the community's memory".
- <polynet-ask>: the member's private conversation with the community agent
  (only they see it): the history, a box (Enter asks; Shift+Enter is a new
  line), the reply as it streams, and starter questions while the
  conversation is empty. If a question fails it goes back in the box with
  Try again. Give it a height (it scrolls inside): polynet-ask { height:
  70vh } is the default.

Each reflects its state on the tag: state="loading" | "ready" | "signed-out"
| "error" (events and learn also "missing", for an address that isn't there).
They take the same tokens; their ::part()s and slots are listed above.

## Block: discover

<polynet-discover> is on Polynet's /discover page on every site, and
anywhere you place it. It is public: signed in or not, it shows every
published community on Polynet (never unlisted ones) as a card with its
picture or initials, name, one-liner and member count, and a search by
name or one-liner. Each card opens that community's own site when it has
one, else its page on Polynet ("On Polynet" says so), in the same tab;
this site's own community is marked "You're here". limit="4" shows the
first four and a link to /discover (for a home page or a footer). The
list is at most a minute old. state="loading" | "ready" | "error".

## Errors

Failed calls throw PolynetError with .code, .message and .status. Codes:
- sign_in_required (status 401): the member is signed out or the session
  expired. Show sign-in. session() then reads signed_in: false.
- not_ready: you called something before awaiting session().
- upload_failed, live_unavailable, agent_unavailable, agent_failed: show
  .message and let the member retry.
- any other code (for example a permission or rate limit): show .message.

## Chat

- channels() -> [{ slug, name, path, isGeneral, canPost, canReply, unread,
  mentioned, seenThroughAt }] (seenThroughAt: when the member last read it,
  ms, or null). Use the one with isGeneral as the default. In your own
  composer, hide posting when canPost is false and replying when canReply
  is. unread: posts the member hasn't seen; mentioned: someone @mentioned
  them there. markRead(channelSlug, throughAt?) clears both, up to now or up
  to throughAt (the newest post they saw, or a time); call it when the member
  is looking at the channel.
- feed(channelSlug, { limit, cursor }) -> the newest posts (default and at
  most 50), oldest first (chat order; reverse() for newest-first). The list
  has .cursor: pass it back (feed(slug, { cursor: posts.cursor })) for the
  page before; null means you reached the start of the channel.
- thread(channelSlug, post.ref) -> the post, then its replies, oldest first:
  the whole thread (the SDK follows the server's pages, up to 2,000 replies).
  The list has .complete: false only when a thread is longer than that.

Each post or reply has:
  ref                 // "interaction:root:<id>" or "interaction:reply:<id>"
  path
  text                // the whole text (markdown); render this
  snippet             // the first 500 characters; snippet_truncated says if cut
  actor               // { type, display_name, handle, avatar_url, user_id, agent_key }
                      // all keys always present; the agent's name fields are null
  reactions           // [{ emoji, count }]
  reacted_by_me       // [emoji]
  by_me               // posted by or for the signed-in member: they may remove() it
  can_edit            // they may edit() it (their own words only)
  reply_count         // a number (0 on replies)
  root_ref            // on replies: the ref of their post
  attachments         // [{ ref, name, kind, mime, size }], kind "image" | "video" | "file"
  edited_at           // ISO time or null
  created_at          // ISO time

Writing:
- post(channelSlug, text, { replyTo: post.ref, files: [File], askAgent: true,
  mentions: [member], key }) posts, or replies when replyTo is set. Returns
  { ref, path, ... }. mentions notifies members (from members()); the text
  must contain each one's "@" + member.handle.
  askAgent asks the community agent to answer in the channel; Polynet puts
  "@<community name> " in front of the text (unless it is already there),
  which is how agent mentions read everywhere. The agent answers as a reply
  in that post's thread: a site that asks it in public must show threads
  (reply_count, thread()), or the answer never appears. Editing that post
  later doesn't ask the agent again; keep the prefix in the edit box.
  key (optional, 8-100 of A-Z a-z 0-9 _ -): your own idempotency key. Retry
  a failed post with the same key, text and files and it never posts twice
  (files already uploaded aren't sent again); make a new key for new
  content.
- edit(post, text) when post.can_edit; remove(post) when post.by_me.
- react(ref, emoji, on) adds (on: true) or removes (on: false) the member's
  reaction on a post or reply. Returns { reacted, reaction_summary }.
- fileUrl(attachment) -> a URL for <img src>, <video src> or a download link.

Live updates:
- const stop = await watch(channelSlug, onChange). onChange(update) runs once
  right away, whenever anything in the channel changes (posts, replies, edits,
  deletes, reactions), and when someone starts or stops typing there. When
  update.changed is true, call feed() or thread() again. update.typing is who
  else is typing: [{ ref, name, avatar_url, thread_ref }] (thread_ref: the
  post they're replying to, or null). Use it instead of polling. Needs a
  signed-in member. When the session ends (signed out elsewhere, expired),
  onChange runs once more and the re-read throws sign_in_required: show
  sign-in then.
- typing(channelSlug, on, { thread: post.ref }): call typing(slug, true) as
  the member types (every keystroke is fine; the SDK sends a renewal every
  couple of seconds) and typing(slug, false) when they stop or clear the box.
  post() clears it. It fades on its own a few seconds after the last renewal.
- Content-Security-Policy: scripts, styles and the SDK's connections come from
  this domain ('self'). The blocks and the shell style themselves with
  adopted stylesheets, not inline <style>, so style-src 'self' is enough
  for them (your own inline styles are your call). avatar_url images come
  from Polynet's storage host, so allow img-src 'self' https:.

Authors: actor.type "human" is a member. "community_agent" is the community's
agent; when it has a display_name it acted for that member. Label it
"<community_name> agent · for <display_name>", and show an agent mark of your
own rather than avatar_url (which is the member's).

## Events, courses, knowledge

- events({ limit, from, cursor }) -> events in start order (limit default
  20, at most 50): from now (one already under way isn't included), or from
  options.from (a Date, ms or ISO time, so past events too); list.cursor
  reads the next page (events({ cursor: list.cursor })), null at the end.
  Each occurrence of a recurring event is its own entry. Fields: ref
  ("event:<id>:<start ms>"; its page is /events/<id>~<start ms>), title,
  description_md, starts_at and ends_at (ISO), timezone (IANA name),
  location_type ("online", "physical" or "tbd"), location_label, url (a link the
  organizer set, or null), recurrence_frequency, recurrence_interval.
  Show times with new Date(starts_at).toLocaleString(undefined, { timeZone:
  timezone }). Ignore starts_at_zoned (not readable by Date). No RSVP yet.
- event(eventOrRef) -> one event, read fresh (the same fields).
- resources(path?) -> courses (kind "directory") and lessons (kind
  "document"), each with name and path, in the community's order. Pass a
  course's path to list its lessons. A course's page is /learn/<the last
  part of its path>, a lesson's /learn/<course>/<the last part of its
  path, without .md>.
- readText(entry) -> the text of a lesson (all of it, however long), a
  memory or a post (markdown).
- lessons() -> every lesson in every course, in order: [{ title, ref, path,
  course, course_path, lesson }]. lesson is null for a plain page, or the
  board fields: kind ("lesson", "build", "checkpoint", "prompt", "skill",
  "video", "doc"), stage (board column; none means library only),
  stage_order, order, minutes, video_url, gate (later stages stay locked
  until it is done) and summary. Show the same lessons as a board (group by
  stage), a library (group by course) or a wizard (one at a time).
- lesson(entry) -> { title, ref, path, body, lesson }. Here lesson also has
  intro_md, variants [{ key, label, body_md }] from "### In <Platform>"
  sections (for example cowork, claude_code, codex), slides [{ image, alt,
  note_md }] from a "## Slides" section, commands [{ variant, language,
  text }] from fenced code blocks, and elements [{ id, type, required,
  prompt, label, choices [{ id, label }], multiple, action, form_key }]: the
  lesson's follow-along buttons, checklists, quizzes and forms (fenced
  blocks named button, checklist, quiz or form in the body). Quiz answers
  are not included. Render each element where its block sits in the body.
  A quote whose first line is [!TIP], [!NOTE], [!IMPORTANT] (key idea),
  [!ACTION] (do this) or [!WARNING] is a callout: show that label above it.
  A button's action says what it does: "confirm" (answer(entry, id, true)),
  "mark_done" (setProgress(entry, "done")), "ask_agent" (askAgent(label))
  or "open_form" (show lessonForm(form_key)). A form element shows a
  Polynet Form inside the lesson: use lessonForm() and submitLessonForm().
- lessonForm(element) -> the member's open Polynet Form for that form_key,
  assigned by a Workflow stage: { ref, form_version_ref, name, questions,
  answers, revision, status }, or null when no stage has asked for it yet.
- submitLessonForm(form, answers) -> submits it through Polynet Forms, so
  the Workflow, the agent and the owner's dossier see the answers.
- progress() -> the member's own { journey, courses, stages, lessons }.
  courses: [{ ref, name, lesson_count, done_count, percent, completed_at }].
  stages: [{ name, order, lesson_count, done_count, locked, blocked_by }].
  lessons: [{ ref, title, course_ref, status, locked, started_at,
  completed_at, responses }], status "not_started", "in_progress" or "done";
  responses are the member's answers [{ element, value, correct, complete,
  answered_at, explanation_md, answer }]. journey is null or the member's
  place in the community workflow: { current_milestone_key,
  current_milestone_name, entered_at, completed_at, milestones [{ key, name,
  position }] }.
- setProgress(entry, status) -> sets your status on a lesson. Rejects with
  code "lesson_locked" while a gate in an earlier stage is unfinished, and
  "lesson_elements_incomplete" (to "done") while a required element is open.
- answer(entry, elementId, value) -> answers a lesson element: true for a
  button, the ticked item ids for a checklist, the chosen option ids for a
  quiz, null to clear. Returns { response { value, correct, complete,
  explanation_md, answer }, required_remaining }. Quizzes are graded on the
  server; the right answer shows once the member gets it right.
- courseReport() -> owners and admins only: { courses, members [{ name,
  membership_id, path, last_activity_at, lessons_done, courses [{ ref,
  lesson_count, done_count, percent, completed_at }], quizzes { answered,
  correct } }] }. Rejects for everyone else.
- memberProgress(member) -> owners and admins only: one member's courses,
  stages and lessons with their answers, as in progress().
- members() -> [{ name, role, ref, path, handle, avatar_url, online }], role
  "owner", "admin", "moderator" or "member"; online: here right now.
- profile(memberOrHandle) -> { ref, name, handle, avatar_url, role, online,
  bio, links { youtube, x, instagram } } (links null when unset): what any
  member sees of a fellow member in Polynet.
- online() -> { online_count, online_count_capped, members: [{ ref, name,
  handle, avatar_url }] }: who is here now, the signed-in member included
  (online_count_capped: "at least").
  watchOnline(onChange): onChange() runs now and whenever that changes; call
  online() then. Returns stop().
- A signed-in member with the page open and visible counts as online: the SDK
  sends their presence about once a minute after session(), and pauses while
  the page is hidden. Nothing to call.
- knowledge(query?) -> what the community knows: top memories, or a search.
  Each has title, type, grade, applies_when.
- discover() -> every published community, signed in or not: [{ slug,
  name, one_liner, avatar_url, member_count, url, has_site, here }]. url
  is that community's own site (has_site) or its Polynet page; here marks
  this site's own. What <polynet-discover> shows; use the block on
  /discover rather than rebuilding it.

## Interactive widgets in lessons

Lessons never run HTML. For a calculator, diagram or scorecard, deploy it as
its own page on this site (for example embeds/scorecard.html) and place it in
a lesson's text with a fenced block (~~~ or three backticks):

    ~~~polynet-embed
    src: embeds/scorecard.html
    title: Asset scorecard
    height: 900
    fallback: media/scorecard.png
    ~~~

src is required; height is the starting height in pixels (the frame grows to
fit); fallback is an image shown where the widget can't run. Polynet shows the
page in a sandboxed frame with no access to the member's session. In the
widget, load /__polynet/embed.js (a plain script tag, not a module) for:
- polynetEmbed.load(key) -> the member's saved string, or null
- polynetEmbed.save(key, value) -> saves a string (64 KB at most)
- the community's theme as CSS variables: var(--pn-accent), var(--pn-text),
  var(--pn-surface), var(--pn-font-body) and the rest of --pn-*.
Wrap any localStorage use in try/catch: it can be unavailable in the frame.

## The community agent

Each community has one AI agent. Members talk to it privately:
- agentHistory() -> [{ role: "user" | "assistant", text, created_at }]
- askAgent(text, { onDelta(textSoFar) }) -> the full reply (markdown).
  The reply streams: onDelta runs with the text so far as the agent writes.
  The agent may use tools first, so the first words can take a few seconds:
  show a "thinking" state until onDelta first runs. Render the last onDelta
  (or the resolved reply) as the answer; it replaces anything shown before.
It is the same conversation the member has on the community's Agent page in
Polynet, and the one <polynet-ask> (on /ask) shows; use that block rather
than building your own. In channels, post(..., { askAgent: true }) asks it
publicly.

## Rendering

- Escape everything you render from Polynet: set textContent, never
  innerHTML with Polynet text.
- Post text, agent replies and descriptions are markdown: render them with
  polynet.markdown(text), which returns safe DOM nodes (a DocumentFragment)
  to append. It handles paragraphs, headings, lists, quotes, code, bold,
  italic and https links, and never interprets HTML.

## Rules

- The member's session is an HttpOnly cookie you never see or handle. Never
  ask for passwords or tokens, and never store them.
- The site acts as the signed-in member, inside this community, with member
  powers only. Admin, settings, analytics, billing and direct messages stay in
  Polynet Studio; link there instead of rebuilding them.
- Do not call Polynet servers directly. Use the SDK; everything goes through
  /__polynet/ on this domain, and only this site's own pages can call it
  (another site gets 403 cross_site_request).
- Lower-level access, if you need it: polynet.door.list/read/search/write/call
  over the community's paths (start with door.list("/communities/" +
  session.community + "/")). door.read bodies can be JSON even when the path
  ends in .md: prefer readText().

## Deploy

The site is a folder of static files with an index.html. From that folder:

    npx @polynet/cli deploy --community <community-slug>

The first run opens the browser to sign in with Polynet (the community's owner
or an admin) and saves the community in polynet.json, so later deploys are just
"npx @polynet/cli deploy". Add --staging for a community on Polynet's staging
(sites at https://<community-slug>-staging.polynet.page); polynet.json
remembers it.

Every deploy checks the site first ("npx @polynet/cli check" runs the same
checks alone). These stop a deploy until fixed: no index.html or
frame.html at the site's root; a frame.html without exactly one
<polynet-page>, or with relative paths; a site's own version of a standard
page (chat.html, people/index.html, events.html, ...) that doesn't place
that page's blocks
(for a framework build, a script naming them counts, not in a comment); a
page without <html lang>, a <title> or a viewport that
allows zooming; an <img> without alt; a button or link with no text or
aria-label. Warnings (unlabelled
fields, removed focus outlines, animation without prefers-reduced-motion,
innerHTML, positive tabindex) are printed but don't stop it.

Only changed files upload. The site is live at
https://<community-slug>.polynet.page within a minute. Opening or refreshing
any path in the browser serves index.html, so client-side routes (/parade)
work, except the standard pages and the addresses under them (/chat,
/people/<handle>, /events/<event>, /learn/<course>/<lesson>, /knowledge,
/ask, /discover), which show frame.html unless the site has a file there; a script's fetch() of a path that isn't a file gets 404. No server code
runs: everything dynamic comes from the SDK.

Using a bundler (Vite, Rollup, esbuild): the SDK and shell are served by the
site, so mark /__polynet/ imports external, never bundle them. For Vite:

    // vite.config.js
    export default { build: { rollupOptions: { external: [/^\/__polynet\//] } } };

Then deploy the build folder: "npx @polynet/cli deploy dist". polynet.json
stays in the project folder (the one you run the command from), so a clean
build doesn't lose it. If the bundler moves the ui.js script into its own
bundle, that's fine: Polynet adds it to every page anyway.

Skills for AI agents: "npx @polynet/cli create --community <slug>" sets up a
folder (no template) with AGENTS.md, CLAUDE.md and Polynet's skills
(polynet-build-site, polynet-design, polynet-sdk, polynet-accessibility,
polynet-deploy-verify); "npx @polynet/cli skills" adds or updates them in any
folder. AGENTS.md, CLAUDE.md, polynet.json and dotfolders are never uploaded.

If your agent can't run commands (for example claude.ai or ChatGPT with the
Polynet MCP connected), it can deploy through the MCP instead: polynet_call
community.site.deploy with input.files as "/path" -> { content, encoding }
("utf8", or "base64" for images and fonts), including /index.html and /frame.html, up to 200
files and 5 MB. The same checks run there (site_checks_failed lists what to
fix). The result has the live url.

## Example: a minimal site

This shows structure only. The markup, the words and the look are yours.
It is index.html (the front door; the room is any page of yours, beside
Polynet's /chat); with the frame.html above beside it, it deploys.

    <!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Port Wren Lantern Guild</title>
      <script type="module" src="/__polynet/ui.js"></script>
      <style>
        :root { --polynet-accent: #f2a541; --polynet-surface: #131c28; }
        .room { display: grid; grid-template-columns: 200px 1fr 240px; gap: 24px; }
        .room polynet-chat { height: calc(100dvh - 120px); }
        @media (max-width: 760px) { .room { grid-template-columns: minmax(0, 1fr); } }
      </style>
    </head>
    <body>
      <header><h1>Port Wren</h1><polynet-account></polynet-account></header>
      <main class="room">
        <polynet-channels></polynet-channels>
        <polynet-chat><p slot="empty">The bench is clear. The quay's still dark.</p></polynet-chat>
        <polynet-members><h2 slot="header">The guild</h2></polynet-members>
      </main>
      <script type="module">
        import polynet from "/__polynet/sdk.js";
        const s = await polynet.session(); // the public face and custom views start here
      </script>
    </body>
    </html>
`;
