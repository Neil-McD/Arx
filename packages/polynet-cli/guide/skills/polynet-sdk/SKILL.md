---
name: polynet-sdk
description: Build custom views beside Polynet's blocks with the Polynet SDK (session and sign-in, the blocks' URL and events, channels, posts, reactions, live updates, typing, who's online, events, courses, knowledge, members and profiles, the community agent, other communities for Discover, safe markdown). Use whenever site code needs community data or a member action beyond what the blocks show.
---

# The Polynet SDK

Polynet's blocks carry the standard pages, inside the site's frame:
`<polynet-channels>` and `<polynet-chat>` (`/chat`), `<polynet-members>`
(`/people`), `<polynet-events>` (`/events`), `<polynet-learn>` (`/learn`),
`<polynet-knowledge>` (`/knowledge`), `<polynet-ask>` (`/ask`) and
`<polynet-discover>` (`/discover`); see `polynet-build-site`. The SDK is
for everything around them: the front door and extras like a parade map, a
"this week" strip or a "who's here now" strip. Extras link into the
standard pages; they never replace them.

The full reference: `https://polynet.page/llms.txt`, also served by every
deployed site at `https://<slug>.polynet.page/__polynet/llms.txt` (staging:
`https://staging.polynet.page/llms.txt`). Read it before using a
method for the first time; it is the source of truth for names and fields.

The SDK brings data and behavior, never a look. These recipes fill markup you
designed; class names and elements are yours.

## Start

```js
import polynet from "/__polynet/sdk.js";
const session = await polynet.session(); // always first
```

It only works on the live site (`<slug>.polynet.page`, or
`<slug>-staging.polynet.page` with `deploy --staging`): deploy to try things.
On a local server the import fails and the blocks stay empty.

## Signed out, signed in

```js
if (!session.signed_in) {
  document.querySelector("#join").href = session.join_url;
  // The shell already shows "Sign in"; this is an optional quiet link in the body.
  document.querySelector("#members-sign-in")?.addEventListener("click", () => polynet.signIn());
}
```

- Signed out, only `session()` (`community_name`, `community_one_liner`,
  `community_about`, `member_count`, `join_url`), `community()` and
  `discover()` work. Everything else throws `sign_in_required`.
- `join_url` is the community's own join page (`/join`, on the site's private
  twin, in your frame): free, approval or paid. Someone on Polynet who isn't a
  member yet and signs in lands there too, and comes back signed in once
  they've joined.
- `session.member.role` is `owner`, `admin`, `moderator` or `member`. Show
  owners and admins a link to `session.studio_url`.

## Working with the blocks from code

Styling and placement are in `polynet-build-site`; this is how your own code
talks to them.

- The channel lives in the URL: `?channel=<slug>` (none: General). Picking
  one in `<polynet-channels>` updates the URL and fires `polynet:channel`
  (`detail: { slug }`) on `document`; `<polynet-chat>` follows, and your
  views can too. Switch from your own navigation by linking to
  `?channel=<slug>` or dispatching the event:
  `document.dispatchEvent(new CustomEvent("polynet:channel", { detail: { slug: "glasswork" } }))`.
  `channel="<slug>"` pins a chat to one channel.
- The chat fires `polynet:read` (`{ slug }`) when it marks a channel read.
- Profiles: a member in `<polynet-members>`, a chat author and an @-tag all
  open Polynet's profile panel (with Message). Open one from your own view
  (a name on your parade map) with
  `document.dispatchEvent(new CustomEvent("polynet:profile", { detail: { handle: "sam" } }))`
  (or `{ ref }` from `members()` or `online()`), or link to `?member=<handle>`. Don't
  build your own profile view.
- `state="loading|ready|signed-out|error"` on each tag lets your layout
  react, e.g. `polynet-chat[state=signed-out]`.

## A custom feed in your own markup

The chat already is the community's feed. Build one only for a different
view of the same posts (a highlights wall, a lantern gallery), beside the chat.

```html
<ol id="feed" role="log" aria-label="Club feed" aria-live="off"></ol>
<template id="post">
  <li><img class="avatar" alt=""><b class="who"></b> <time></time><div class="text"></div><ol class="replies"></ol></li>
</template>
```

```js
const general = (await polynet.channels()).find((c) => c.isGeneral);
const post = document.querySelector("#post");
await polynet.watch(general.slug, async () => { // runs now, then on every change
  const posts = await polynet.feed(general.slug, { limit: 30 });
  document.querySelector("#feed").replaceChildren(...await Promise.all(posts.map(async (p) => {
    const node = post.content.cloneNode(true);
    node.querySelector(".who").textContent = p.actor.display_name ?? "Member";
    node.querySelector("time").textContent = new Date(p.created_at).toLocaleString();
    node.querySelector(".text").append(polynet.markdown(p.text));
    const avatar = node.querySelector(".avatar");
    if (p.actor.avatar_url && p.actor.type !== "community_agent") avatar.src = p.actor.avatar_url;
    else avatar.remove();
    if (p.reply_count > 0) { // replies, including the agent's answers to askAgent posts
      const [, ...replies] = await polynet.thread(general.slug, p.ref);
      node.querySelector(".replies").append(...replies.map((r) => {
        const li = document.createElement("li");
        li.append(polynet.markdown(r.text));
        return li;
      }));
    }
    return node;
  })));
});
```

## Post, reply, react

```js
await polynet.post(general.slug, text);                          // a new post
await polynet.post(general.slug, text, { replyTo: p.ref });      // a reply
await polynet.post(general.slug, text, { askAgent: true });      // ask the agent in public: it answers in the thread
await polynet.react(p.ref, "🔥", !p.reacted_by_me.includes("🔥")); // toggle a reaction
const replies = await polynet.thread(general.slug, p.ref);       // the post, then its replies
```

In a custom composer (the chat block already has one), hide posting when
`channel.canPost` is false and replying when `channel.canReply` is; pass
your own `key` to `post()` and reuse it to retry a failed send without
posting twice. `edit(p, text)` when `p.can_edit`; `remove(p)` when
`p.by_me`. Attachments: `polynet.fileUrl(file)`.

## Unread, mentions, typing, who's online

```js
const channels = await polynet.channels();      // each has unread, mentioned and seenThroughAt
await polynet.markRead(general.slug);           // the member is looking at it now

// Mention a member: their @handle in the text, and the member in mentions.
await polynet.post(general.slug, `@${sam.handle} 6am?`, { mentions: [sam] });

// Typing: on every keystroke (the SDK throttles), off when the box empties.
input.addEventListener("input", () => polynet.typing(general.slug, input.value !== ""));
await polynet.watch(general.slug, async (update) => {
  typingLine.textContent = update.typing.map((t) => t.name).join(", ");
  if (update.changed) await renderFeed();       // only re-read when posts changed
});

// Who's here: presence is automatic while a signed-in member has the page open.
await polynet.watchOnline(async () => {
  const { online_count, members } = await polynet.online();
  here.textContent = `${online_count} here now`;
});
const people = await polynet.members();          // each has handle, avatar_url, online
const card = await polynet.profile(people[0]);   // bio, links { youtube, x, instagram }, role, online
```

## Ask the agent, streaming

```js
status.textContent = "Thinking…";
const reply = await polynet.askAgent(question, {
  onDelta(textSoFar) { status.textContent = ""; answer.replaceChildren(polynet.markdown(textSoFar)); },
});
answer.replaceChildren(polynet.markdown(reply));
```

Each `onDelta` has the whole text so far: replace, don't append. The first
words can take a few seconds while the agent uses tools.
`agentHistory()` returns the member's earlier conversation.

The agent can be off (no Agent plan, or its owner turned it off): then
`session.agent_on` is `false` and `askAgent` throws `agent_off`. Say "The
community agent is off here" in place of the box, give the owner
(`member.role === "owner"`) a link to `session.agent_plan_url`, and don't
offer `askAgent: true` in channels.

## Everything else

| Need | Call |
|---|---|
| Events | `events({ limit })` from now; `events({ from: date })` includes past ones; `events({ cursor: list.cursor })` the next page; `event(ref)` one. Show times in the event's `timezone`; link to `/events/<id>~<start ms>` (from `ref` `event:<id>:<start ms>`) for its page |
| Courses and lessons | `resources()`, `resources(course.path)`, `readText(lesson)` (a long lesson is read whole); link to `/learn/<course segment>/<lesson segment>` (the last part of each `path`, without `.md`) |
| What the community knows | `knowledge(query?)` |
| Other communities (public) | `discover()`: `[{ slug, name, one_liner, avatar_url, member_count, url, has_site, here }]`; `url` is that community's own site, or its Polynet page when `has_site` is false; `here` is this one |
| Members | `members()`, `profile(member)`, `online()` (includes the signed-in member) |
| Older posts | `feed(slug, { cursor: posts.cursor })`; `cursor` is null at the start |

## Using a bundler

Vite, Rollup, esbuild and the like work. The SDK and shell are served by the
site itself, so mark `/__polynet/` imports external and never bundle them:

```js
// vite.config.js
export default { build: { rollupOptions: { external: [/^\/__polynet\//] } } };
```

Deploy the build folder (`npx @polynet/cli deploy dist`); `polynet.json`
stays in the project folder, so a clean build doesn't lose it. Polynet adds
`/__polynet/ui.js` and `/__polynet/ui.css` to every HTML page it serves, so
it's fine if the bundler moves the script into its own (or drops it).

## Traps

- Await `session()` before anything else, or calls throw `not_ready`.
- Catch `PolynetError`: on `sign_in_required` show sign-in; otherwise show
  `error.message` and let the member retry.
- Markdown goes through `polynet.markdown(text)` (safe DOM nodes); everything
  else through `textContent`. Never `innerHTML` with Polynet text.
- An agent post has `actor.type === "community_agent"`. With a
  `display_name`, it acted for that member: label it
  "<community> agent · for <name>" with your own agent mark.
- A Content-Security-Policy works with the blocks and the shell: they
  style themselves with adopted stylesheets, not inline `<style>`, so
  `style-src 'self'` is fine for them. Member avatars come from Polynet's
  storage host: allow `img-src 'self' https:`.
- After Polynet updates the SDK, a hard refresh picks it up (it's cached for
  a few minutes).
- Showing members' sections with the `hidden` attribute? Add
  `[hidden] { display: none !important; }`: a CSS `display` rule otherwise
  wins, and visitors see the member page. `polynet check` warns about it.
- Links to sections that appear after sign-in (`#log`) need a scroll once you
  reveal them: `document.getElementById(location.hash.slice(1))?.scrollIntoView()`.
