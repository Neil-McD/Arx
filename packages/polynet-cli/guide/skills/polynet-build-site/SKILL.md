---
name: polynet-build-site
description: Build or change a Polynet community's website (a static site on <slug>.polynet.page with Polynet's blocks for channels, chat and members, and the Polynet SDK for custom views). Use when the founder asks to create their community's site, redesign it, or add or change pages and features.
---

# Build a Polynet community site

The site is the community's look and experience. Polynet runs everything
else: accounts, members, permissions, payments, posts, events, courses,
memory and the community's AI agent. You write static HTML, CSS and
JavaScript. The social core comes from Polynet's blocks; anything else
comes from the SDK at `/__polynet/sdk.js`.

There is no template to restyle. Every site starts from its community's own
concept, and the blocks live inside that concept.

## What every site has

- **The blocks (required: `check` and `deploy` fail without them).**
  `<polynet-channels>`, `<polynet-chat>` and `<polynet-members>`. The chat
  is the whole conversation: feed, composer, threads, reactions,
  attachments, typing, @-tags for members and the agent, editing and
  deleting. Members, chat authors and @-tags open Polynet's profile panel
  (with Message). Don't build any of that yourself.
- **The shell**: `<polynet-account>`, visible on every page at every width.
  Polynet adds `/__polynet/ui.js` to every page and a corner fallback where
  a page has none; place it yourself so it fits. Never add a second "Sign
  in" beside it.
- **A public face** for visitors: who it's for, why it's worth joining, and
  "Join" (`session.join_url`). Signed out, the blocks show their own
  sign-in and join prompt, never posts or names.
- **A way to Polynet Studio** for owners and admins: link
  `session.studio_url` for settings, members, billing, events and courses.
- **Never** build direct messages, a profile view or a chat composer.

## The flow

1. **Orient.** The slug is in `polynet.json` (or ask: it's in the founder's
   Polynet address, `.../c/<slug>`). Skim the reference:
   `https://<slug>.polynet.page/__polynet/llms.txt`.
2. **Design first** with `polynet-design`: discover the community's world,
   show three directions live (blocks themed in each), build the one the
   founder picks.
3. **Build** the pages by hand around the blocks; add custom views with
   `polynet-sdk`. Deploy early and often: the blocks and the SDK only work
   on the live site.
4. **Finish** with `polynet-accessibility`, then ship and check it live with
   `polynet-deploy-verify`.

Changing an existing site? Keep its design language unless the founder asks
for a new one.

## Where the blocks go

Name the places in the community's own words:

- **The room** (a page or a section, e.g. "The Boathouse", "Base Camp"):
  `<polynet-channels>` beside `<polynet-chat>`. This is where members
  spend their time, so give it real space: the chat fills the viewport's
  height on a members' page.
- **The people** ("The crew", "Who's climbing"): `<polynet-members>`, on its
  own page or as a column in the room.
- **The public face**: the story, the rhythm (events), and "Join". The
  blocks can sit here too; signed out they invite people in.
- **Extras**, built with the SDK beside the blocks, never instead of them:
  a route log, this week's sessions, a knowledge shelf, "ask the agent".

The channel lives in the URL (`?channel=<slug>`); the blocks follow it
across pages, so a link to `/room.html?channel=routes` opens that channel.

## A complete minimal site

One page; split it into several when the design wants.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sunrise Climbing Club</title>
  <script type="module" src="/__polynet/ui.js"></script>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="top">
    <a class="mark" href="/">Sunrise</a>
    <polynet-account></polynet-account>
  </header>
  <main>
    <section class="hero">
      <h1 id="name">Sunrise Climbing Club</h1>
      <p id="promise"></p>
      <a id="join" hidden>Join the crew</a>
    </section>
    <section class="room" aria-label="The wall">
      <polynet-channels><h2 slot="header">Walls</h2></polynet-channels>
      <polynet-chat>
        <p slot="empty">Chalk's dry. Nobody's posted yet. First beta?</p>
        <p slot="signed-out">The wall talk is for members. Join to read it.</p>
      </polynet-chat>
      <polynet-members><h2 slot="header">On the wall</h2></polynet-members>
    </section>
  </main>
  <script type="module">
    import polynet from "/__polynet/sdk.js";
    const session = await polynet.session();
    document.getElementById("promise").textContent = session.community_one_liner ?? "";
    if (!session.signed_in) Object.assign(document.getElementById("join"), { href: session.join_url, hidden: false });
  </script>
</body>
</html>
```

## Styling recipes

Set the tokens once; the blocks and the shell read them, and take the
page's font and text color.

```css
:root {
  --polynet-accent: #ff6a3d;   /* unread dot, "@" badge, "New", presence, focus */
  --polynet-on-accent: #160b05;
  --polynet-text: #f6efe6;
  --polynet-muted: #b3a597;
  --polynet-border: #3a2e26;
  --polynet-surface: #1b1410;  /* the profile panel and overlays: set it on dark sites */
  --polynet-radius: 2px;
}
[hidden] { display: none !important; }
```

A few `::part()` rules carry most of the identity:

```css
polynet-chat::part(message-author) { font-family: "Archivo Black"; text-transform: uppercase; letter-spacing: .06em; }
polynet-chat::part(day-divider) { font-family: "DM Mono"; color: var(--polynet-accent); }
polynet-chat::part(composer-box) { border: 2px solid currentColor; border-radius: 0; }
polynet-channels::part(channel-current) { background: var(--polynet-accent); color: var(--polynet-on-accent); }
polynet-members::part(role-badge) { border-color: var(--polynet-accent); }
polynet-profile::part(panel) { border-left: 6px solid var(--polynet-accent); }
```

The full list of parts is in llms.txt. Slots carry the community's voice:
`header` (channels, members; on the chat it replaces the "#channel" title),
`empty`, `signed-out` (chat, members) and `read-only` (chat). Write every
one in the concept's words. Style state with the `state` attribute:
`polynet-chat[state=signed-out] { height: auto; }`.

## Layout and mobile

- The chat scrolls inside itself: give it a height
  (`height: calc(100dvh - 140px)`, or `height: 100%` in a sized grid).
  `<polynet-members>` grows with its content: give its column a
  `max-height` and `overflow-y: auto` to scroll on its own.
- Desktop: a three-column room (`220px 1fr 260px`) or chat-first with
  people on a separate page.
- Phone (under ~760px): one column. Turn the channels into a scrolling row
  above the chat:

```css
@media (max-width: 760px) {
  .room { grid-template-columns: minmax(0, 1fr); }
  polynet-channels::part(list) { grid-auto-flow: column; grid-auto-columns: max-content; overflow-x: auto; }
  .room polynet-chat { height: calc(100dvh - 180px); }
}
```

  Move the members below the chat or to their own page. The chat opens
  threads over the feed when it's narrow, and profiles open as a bottom
  sheet: nothing to do.

## Rules

- No secrets in the site: no tokens, passwords or keys. Never call Polynet
  servers directly.
- Render Polynet text safely in custom views: `textContent`, or
  `polynet.markdown(text)` for posts and agent replies. Never `innerHTML`
  with Polynet text.
- `npx @polynet/cli check` must report no errors (deploy runs it too).

## Done means

- The founder chose the direction, the site is unmistakably theirs, and the
  blocks feel native to it.
- Checks pass, it's deployed, and you verified it live: signed out and
  signed in, phone and desktop, keyboard only.
- You told the founder the live URL, what changed, and anything you
  couldn't verify, in a few lines.
