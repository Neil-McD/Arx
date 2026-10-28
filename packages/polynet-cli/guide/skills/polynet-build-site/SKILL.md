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
  blocks inside, in the page's own DOM, so your CSS lays it out. Polynet
  also sets each of those pages' `<title>` to `<Page> · <community name>`
  (`Chat · Port Wren Lantern Guild`); the frame's own `<title>` shows only
  where Polynet can't read the community's name, so make it that name.
  Write the header, nav and footer in HTML and CSS: the member's own pages
  (Your communities, Messages, Settings, Join) show the same frame on the
  site's private twin (`<slug>--me.polynet.page`) with every script, event
  handler and `javascript:` link removed, so a script-drawn header comes out
  empty there (`check` warns).
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

- **Extras** you build with the SDK (`polynet-sdk`): a parade map, a
  "this week" strip, a leaderboard. Each links into the standard pages.
- **The shell**, `<polynet-account>`: Polynet adds `/__polynet/ui.js` and
  `/__polynet/ui.css` to every HTML page it serves (adding the script tag
  yourself is harmless), and ui.js puts the shell in a corner where a page
  has none. Place it in the frame and on the front door yourself, visible
  at every width, and never add a second "Sign in" beside it.

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
6. **Preview on Polynet.** There is no local preview: the blocks, the
   shell and the SDK render only on Polynet, and a local static server
   shows the tags empty. Deploy (`--staging` for a community on Polynet's
   staging), then open the home page and every standard page at 390 and
   1440 px, signed out and signed in.
7. **Finish** with `polynet-accessibility`, then `polynet-deploy-verify`.

**When you can't deploy** (no access yet, or no terminal or MCP): build the
strongest direction rather than three, run `npx @polynet/cli check` if you
can, and put in your report the three directions (name, idea, why this one
won) and exactly what the founder should verify after deploying: every
standard page at 390 and 1440 px, signed out and signed in; that each
block takes the world's type, color and edges (not a stock widget); that
every slot's words appear (page headings, empty states, the Ask privacy
line and starters); one shell in the header, none doubled; the current
page marked in the nav; and tab titles reading `Chat · <community name>`.

Changing an existing site? Keep its world unless the founder asks for a new one.

## A complete minimal site

Port Wren Lantern Guild (a made-up community: paper lanterns, a harbor
town, Thursday nights in the net loft). `frame.html`: the world's chrome.
Everything in it starts from `/`.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Port Wren Lantern Guild</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="top">
    <a class="mark" href="/">Port Wren</a>
    <nav aria-label="The quay">
      <a href="/chat">The workbench</a> <a href="/people">The guild</a> <a href="/events">Lantern nights</a>
      <a href="/learn">Patterns</a> <a href="/knowledge">The ledger</a> <a href="/ask">Ask the keeper</a>
    </nav>
    <polynet-account></polynet-account>
  </header>
  <main>
    <polynet-page>
      <h1 slot="chat-heading">The workbench</h1>
      <h1 slot="knowledge-heading">The guild ledger</h1>
      <p data-block="polynet-chat" slot="empty">The bench is clear. Post the first sketch, or ask who has spare tissue paper.</p>
      <p data-block="polynet-events" slot="empty">No lantern nights on the tide table. The quay's still dark.</p>
      <p data-block="polynet-ask" slot="privacy">Just you and the keeper. Nobody else on the quay reads this.</p>
      <div data-block="polynet-ask" slot="starters">
        <button type="button">Which paper takes a candle best?</button>
        <button type="button">When's the next lantern night?</button>
      </div>
    </polynet-page>
  </main>
  <footer>Lit on Quay Street every Thursday · <a href="/discover">Other harbors</a></footer>
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
  <title>Port Wren Lantern Guild</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="top"><a class="mark" href="/">Port Wren</a><polynet-account></polynet-account></header>
  <main>
    <section class="hero">
      <h1>Port Wren Lantern Guild</h1>
      <p id="promise"></p>
      <a id="join" hidden>Join the guild</a>
    </section>
    <section aria-labelledby="next"><h2 id="next">Next lantern nights</h2><polynet-events limit="3"></polynet-events></section>
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

## What `<polynet-page>` renders

At `/chat`, the frame above becomes this (in the page's own DOM, no shadow
root; the children you wrote are replaced):

```html
<polynet-page page="chat">
  <div class="pn-page-header">
    <h1>The workbench</h1>  <!-- your slot="chat-heading" element, moved here, its slot attribute removed -->
  </div>
  <div class="pn-page-body pn-page-chat">
    <polynet-channels></polynet-channels>
    <polynet-chat>
      <p data-block="polynet-chat" slot="empty">The bench is clear. …</p>
    </polynet-chat>
  </div>
</polynet-page>
```

- `.pn-page-heading` is only on Polynet's own heading (`<h1
  class="pn-page-heading">Chat</h1>`, used when you give no
  `<name>-heading`). Your slotted heading keeps just its own attributes:
  style it with `.pn-page-header > h1` or a class of yours.
- Every page has the same shape: `page="<name>"`, then `.pn-page-body
  .pn-page-<name>` holding that page's block(s). Children meant for other
  pages (here the `knowledge-heading` and the Ask's slots) are dropped.
  `<polynet-page no-heading>` leaves out `.pn-page-header`.
- An address it doesn't know gets `page="not-found"`, "Page not found" (or
  your `not-found-heading`) and `.pn-page-body.pn-page-missing` with a
  `.pn-page-links` list of every page.

## Giving each page its feel

Set the tokens once; every block and the shell read them, and take the
page's font and text color.

```css
:root {
  --polynet-accent: #f2a541;   /* unread dot, "@" badge, "New", presence, focus, "You're here" */
  --polynet-on-accent: #1a1206;
  --polynet-text: #efe6d2;
  --polynet-muted: #a59c88;
  --polynet-border: #2e3a4a;
  --polynet-surface: #131c28;  /* the profile panel and overlays: set it on dark sites */
  --polynet-radius: 6px;
}
[hidden] { display: none !important; }
```

Then page by page, with `polynet-page[page=<name>]` and `::part()`:

```css
/* every page's heading, yours or Polynet's */
polynet-page .pn-page-header > h1 { font: italic 700 clamp(2.5rem, 6vw, 4.5rem)/1 "Fraunces"; }
/* /chat: the workbench */
polynet-chat::part(message-author) { font-family: "Fraunces"; font-style: italic; }
polynet-chat::part(day-divider) { font-family: "IBM Plex Mono"; color: var(--polynet-accent); }
polynet-chat::part(composer-box) { border: 1px dashed currentColor; }
polynet-channels::part(channel-current) { background: var(--polynet-accent); color: var(--polynet-on-accent); }
/* /events: the tide table */
polynet-events::part(month-title) { font: 600 .8rem/1 "IBM Plex Mono"; letter-spacing: .2em; text-transform: uppercase; }
polynet-events::part(event-date) { font: 700 2.5rem/1 "Fraunces"; }
/* /learn and /knowledge: the pattern book */
polynet-page[page=learn] .pn-page-body, polynet-page[page=knowledge] .pn-page-body { max-width: 40rem; margin-inline: auto; }
polynet-learn::part(lesson-number) { color: var(--polynet-accent); }
/* /ask: the keeper's lamp */
polynet-ask::part(message-agent) { background: color-mix(in srgb, var(--polynet-accent) 8%, transparent); }
/* /discover: other harbors, as paper tags */
polynet-discover::part(community) { border-style: dashed; border-radius: 0 12px 12px 0; }
polynet-discover::part(community-here) { text-transform: uppercase; }
polynet-profile::part(panel) { border-left: 6px solid var(--polynet-accent); }
```

Slots carry the world's voice; write every one in its words:

| Block | Slots |
| --- | --- |
| `<polynet-channels>` | `header` |
| `<polynet-chat>` | `header` (replaces the "#channel" title in every channel), `empty` (a channel with no posts), `signed-out`, `read-only` (where the member can't post or reply) |
| `<polynet-members>` | `header`, `empty`, `signed-out` |
| `<polynet-events>` | `empty` (nothing on the calendar), `signed-out` |
| `<polynet-learn>` | `empty` (no courses yet), `signed-out` |
| `<polynet-knowledge>` | `header`, `intro` (above the search), `empty`, `signed-out` |
| `<polynet-ask>` | `header`, `privacy` (the "only you can see this" line), `starters` (your buttons; each asks its text), `signed-out` |
| `<polynet-discover>` | `header`, `intro` (above the search), `empty` |

- A `header` slot takes any element (`<h2>`, `<p>`, a `<div>` of your
  own). The chat's `header` replaces the "#channel" title in every
  channel, so the chat no longer says which one is open: leave it out of
  the frame unless you mean that, and rename the page with `chat-heading`.
- `starters`: one element with `slot="starters"` holding your buttons (or
  each button slotted on its own). Each button asks its own text, and they
  show only while the conversation is empty. They're your elements, so
  style them with your CSS, not `::part(starter)` (Polynet's defaults, which
  yours replace). On your own page:

```html
<polynet-ask><div slot="starters">
  <button type="button">Which paper takes a candle best?</button> <button type="button">How do I wire a frame?</button>
</div></polynet-ask>
```

- `signed-out` replaces only the sign-in line: Polynet's "Sign in" and
  "New here? Join" stay under it. Style state with the `state` attribute:
`polynet-chat[state=signed-out] { height: auto; }`.

The shell reads the same tokens. On a header darker or lighter than the
page, set them on the shell itself, with a matching `--polynet-surface`:

```css
.top polynet-account { --polynet-text: #efe6d2; --polynet-surface: #131c28; }
```

## Blocks beyond their pages

Every block also works on any page of yours: `<polynet-events limit="3">`
lists the next three and links to `/events`; `<polynet-discover limit="4">`
shows four communities and links to `/discover`; a home page can carry
`<polynet-chat channel="general">` with a height. The channel lives in the
URL (`?channel=<slug>`), so `/chat?channel=glasswork` opens that channel.

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
