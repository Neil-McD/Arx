---
name: polynet-build-site
description: Build or change a Polynet community's website (a static site on <slug>.polynet.page: a frame Polynet fills with its standard pages for chat, people, events, courses, knowledge, the agent and Discover, plus the SDK for custom views). Use when the founder asks to create their community's site, redesign it, or add or change pages and features.
---

# Build a Polynet community site

The site is the community's look and experience. Polynet runs everything
else: accounts, members, permissions, payments, posts, events, courses,
memory and the community's AI agent. You write static HTML, CSS and
JavaScript: a front door, a frame, and any extras. Polynet fills the
standard pages into the frame.

There is no template to restyle. Every site starts from its community's own
world, and every standard page lives inside it.

## The shape of every site

- **`index.html`**, the front door: who it's for, why it's worth joining,
  "Join" (`session.join_url`) for visitors, and the way into the world for
  members.
- **`frame.html`** (required: `check` and `deploy` fail without it): the
  world's header, navigation and footer around exactly one
  `<polynet-page></polynet-page>`, every path starting with `/`. Polynet
  serves it at each standard page and `<polynet-page>` renders that page's
  blocks inside, in the page's own DOM, so your CSS lays it out.
- **The standard pages**, automatic, in this order in the shell's menu
  (Discover sits apart: it's every community, not this one):

  | Page | Block | Addresses under it |
  | --- | --- | --- |
  | `/chat` | `<polynet-channels>` + `<polynet-chat>` | `?channel=<slug>` |
  | `/people` | `<polynet-members>` | `/people/<handle>` (that profile open) |
  | `/events` | `<polynet-events>` | `/events/<event>` (one event: when, where, .ics, link) |
  | `/learn` | `<polynet-learn>` | `/learn/<course>`, `/learn/<course>/<lesson>` |
  | `/knowledge` | `<polynet-knowledge>` | none (memories open in place) |
  | `/ask` | `<polynet-ask>` | none (private to each member) |
  | `/discover` | `<polynet-discover>` | none (public: signed out works too) |

- **Extras** you build with the SDK (`polynet-sdk`): a route log, a
  "this week" strip, a leaderboard. Each links into the standard pages.
- **The shell**, `<polynet-account>`: Polynet adds `/__polynet/ui.js` to
  every page and puts the shell in a corner where a page has none. Place it
  in the frame and on the front door yourself, visible at every width, and
  never add a second "Sign in" beside it.

A site may ship its own file at a standard path (`chat.html`,
`events.html`, `learn/index.html`, `discover.html`, ...): it wins over
Polynet's page and must place that page's block(s). Do it only for a
genuinely different composition; the frame already gives every page your
world. Never build direct messages, a profile view, a chat composer, a
settings page or a "your communities" list.

## The flow

1. **Orient.** The slug is in `polynet.json` (or ask: it's in the founder's
   Polynet address, `.../c/<slug>`). Skim `https://polynet.page/llms.txt`
   (`https://staging.polynet.page/llms.txt` for a community on Polynet's
   staging).
2. **Invent the world** with `polynet-design`: three directions live,
   the founder picks one.
3. **Draw the frame** from the chosen direction: the world's chrome, with a
   nav naming every standard page in the world's words.
4. **Give each standard page its feel** with tokens, `::part()`, slots and
   the page classes (recipes below).
5. **Build the front door and any extras** by hand; fill live data with the
   SDK.
6. **Preview on Polynet.** Blocks render only there: deploy (`--staging`
   for a community on staging), then open the home page and every standard
   page at 390 and 1440 px, signed out and signed in. A local static server
   shows the tags empty; that's expected.
7. **Finish** with `polynet-accessibility`, then `polynet-deploy-verify`.

Changing an existing site? Keep its world unless the founder asks for a new one.

## A complete minimal site

`frame.html`: the world's chrome. Everything in it starts from `/`.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sunrise Climbing Club</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="top">
    <a class="mark" href="/">Sunrise</a>
    <nav aria-label="The crag">
      <a href="/chat">The wall</a> <a href="/people">The crew</a> <a href="/events">Sessions</a>
      <a href="/learn">Technique</a> <a href="/knowledge">Beta book</a> <a href="/ask">Ask the coach</a>
    </nav>
    <polynet-account></polynet-account>
  </header>
  <main>
    <polynet-page>
      <h1 slot="chat-heading">The wall</h1>
      <h1 slot="knowledge-heading">The beta book</h1>
      <p data-block="polynet-chat" slot="empty">Chalk's dry. Nobody's posted yet. First beta?</p>
      <p data-block="polynet-events" slot="empty">No sessions on the board. The wall's still there.</p>
    </polynet-page>
  </main>
  <footer>Open at first light · <a href="/discover">Other crews</a></footer>
</body>
</html>
```

`index.html`: the front door. It carries the same header and nav as the
frame (shortened here).

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sunrise Climbing Club</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="top"><a class="mark" href="/">Sunrise</a><polynet-account></polynet-account></header>
  <main>
    <section class="hero">
      <h1>Sunrise Climbing Club</h1>
      <p id="promise"></p>
      <a id="join" hidden>Join the crew</a>
    </section>
    <section aria-labelledby="next"><h2 id="next">Next sessions</h2><polynet-events limit="3"></polynet-events></section>
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

## Giving each page its feel

Set the tokens once; every block and the shell read them, and take the
page's font and text color.

```css
:root {
  --polynet-accent: #ff6a3d;   /* unread dot, "@" badge, "New", presence, focus, "You're here" */
  --polynet-on-accent: #160b05;
  --polynet-text: #f6efe6;
  --polynet-muted: #b3a597;
  --polynet-border: #3a2e26;
  --polynet-surface: #1b1410;  /* the profile panel and overlays: set it on dark sites */
  --polynet-radius: 2px;
}
[hidden] { display: none !important; }
```

Then page by page, with `polynet-page[page=<name>]` and `::part()`:

```css
/* /chat: the wall */
polynet-chat::part(message-author) { font-family: "Archivo Black"; text-transform: uppercase; letter-spacing: .06em; }
polynet-chat::part(day-divider) { font-family: "DM Mono"; color: var(--polynet-accent); }
polynet-chat::part(composer-box) { border: 2px solid currentColor; border-radius: 0; }
polynet-channels::part(channel-current) { background: var(--polynet-accent); color: var(--polynet-on-accent); }
/* /events: a session board */
polynet-events::part(month-title) { font: 700 .8rem/1 "DM Mono"; letter-spacing: .2em; }
polynet-events::part(event-date) { font-size: 2.5rem; font-family: "Archivo Black"; }
/* /learn and /knowledge: reading rooms */
polynet-page[page=learn] .pn-page-body, polynet-page[page=knowledge] .pn-page-body { max-width: 40rem; margin-inline: auto; }
polynet-learn::part(lesson-number) { color: var(--polynet-accent); }
/* /discover: other crews, as route cards */
polynet-discover::part(community) { border-width: 2px; border-radius: 0; }
polynet-discover::part(community-here) { text-transform: uppercase; }
polynet-profile::part(panel) { border-left: 6px solid var(--polynet-accent); }
```

Slots carry the world's voice; write every one in its words:

| Block | Slots |
| --- | --- |
| `<polynet-channels>` | `header` |
| `<polynet-chat>` | `header` (replaces the "#channel" title), `empty` (a channel with no posts), `signed-out`, `read-only` (where the member can't post or reply) |
| `<polynet-members>` | `header`, `empty`, `signed-out` |
| `<polynet-events>` | `empty` (nothing on the calendar), `signed-out` |
| `<polynet-learn>` | `empty` (no courses yet), `signed-out` |
| `<polynet-knowledge>` | `header`, `intro` (above the search), `empty`, `signed-out` |
| `<polynet-ask>` | `header`, `privacy` (the "only you can see this" line), `starters` (buttons that each ask their text), `signed-out` |
| `<polynet-discover>` | `header`, `intro` (above the search), `empty` |

`signed-out` replaces only the sign-in line: Polynet's "Sign in" and "New
here? Join" stay under it. Style state with the `state` attribute:
`polynet-chat[state=signed-out] { height: auto; }`.

The shell reads the same tokens. On a header darker or lighter than the
page, set them on the shell itself, with a matching `--polynet-surface`:

```css
.top polynet-account { --polynet-text: #f6efe6; --polynet-surface: #1b1410; }
```

## Blocks beyond their pages

Every block also works on any page of yours: `<polynet-events limit="3">`
lists the next three and links to `/events`; `<polynet-discover limit="4">`
shows four communities and links to `/discover`; a home page can carry
`<polynet-chat channel="general">` with a height. The channel lives in the
URL (`?channel=<slug>`), so `/chat?channel=routes` opens that channel.

## Layout and mobile

- `<polynet-page>` lays itself out by default (channels beside the chat,
  one column under ~720px, the chat and Ask given a height, reading pages
  at a reading width). Every default is `:where()`, so any rule of yours wins.
- On your own pages the chat and Ask scroll inside themselves: give them a
  height (`height: calc(100dvh - 140px)`). `<polynet-members>` grows with
  its content: give its column a `max-height` and `overflow-y: auto`.
- Phone: turn the channels into a scrolling row above the chat:

```css
@media (max-width: 760px) {
  polynet-channels::part(list) { grid-auto-flow: column; grid-auto-columns: max-content; overflow-x: auto; }
}
```

  Threads open over the feed when the chat is narrow, and profiles open as
  a bottom sheet: nothing to do.

## Rules

- No secrets in the site, and never call Polynet's servers directly.
- Render Polynet text with `textContent`, or `polynet.markdown(text)` for
  posts and agent replies. Never `innerHTML` with Polynet text.
- A Content-Security-Policy works: the blocks and the shell style
  themselves with adopted stylesheets, so `style-src 'self'` is enough for
  them; allow `img-src 'self' https:` for avatars.
- `npx @polynet/cli check` must report no errors (deploy runs it too).

## Done means

- The founder chose the world; the frame, the front door and every
  standard page feel like it, and the blocks look made for it.
- Checks pass, it's deployed, and you verified it live: every standard
  page at 390 and 1440 px, signed out and signed in, keyboard only.
- You told the founder the live URL, what changed, and anything you
  couldn't verify, in a few lines.
