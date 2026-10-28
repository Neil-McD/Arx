---
name: polynet-sdk
description: Read and write a Polynet community's data from its site with the Polynet SDK (session and sign-in, channels, posts, reactions, live updates, events, courses, knowledge, members, the community agent, safe markdown). Use whenever site code needs community data or a member action.
---

# The Polynet SDK

The full reference is served by every site:
`https://<slug>.polynet.page/__polynet/llms.txt`. Read it before using a
method for the first time; it is the source of truth for names and fields.

The SDK brings data and behavior, never a look. These recipes fill markup you
designed; class names and elements are yours.

## Start

```js
import polynet from "/__polynet/sdk.js";
const session = await polynet.session(); // always first
```

It only works on the live site (`<slug>.polynet.page`): deploy to try things.

## Signed out, signed in

```js
if (!session.signed_in) {
  document.querySelector("#join").href = session.join_url;
  // The shell already shows "Sign in"; this is an optional quiet link in the body.
  document.querySelector("#members-sign-in")?.addEventListener("click", () => polynet.signIn());
}
```

- Signed out, only `session()` (`community_name`, `community_one_liner`,
  `community_about`, `member_count`, `join_url`) and `community()` work.
  Everything else throws `sign_in_required`.
- Someone not yet a member comes back to `/?polynet=join`: show "Join"
  again, then "Sign in" once they've joined.
- `session.member.role` is `owner`, `admin`, `moderator` or `member`. Show
  owners and admins a link to `session.studio_url`.

## A live feed in your own markup

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

Hide the composer when `channel.canPost` is false. `edit(p, text)` when
`p.can_edit`; `remove(p)` when `p.by_me`. Attachments: `polynet.fileUrl(file)`.

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

## Everything else

| Need | Call |
|---|---|
| Events | `events({ limit })`; show times in the event's `timezone` |
| Courses and lessons | `resources()`, `resources(course.path)`, `readText(lesson)` |
| What the community knows | `knowledge(query?)` |
| Members | `members()` |

## Using a bundler

Vite, Rollup, esbuild and the like work. The SDK and shell are served by the
site itself, so mark `/__polynet/` imports external and never bundle them:

```js
// vite.config.js
export default { build: { rollupOptions: { external: [/^\/__polynet\//] } } };
```

Deploy the build folder (`npx @polynet/cli deploy dist`); `polynet.json`
stays in the project folder, so a clean build doesn't lose it. Polynet adds
`/__polynet/ui.js` to every page, so it's fine if the bundler moves it into
its own script.

## Traps

- Await `session()` before anything else, or calls throw `not_ready`.
- Catch `PolynetError`: on `sign_in_required` show sign-in; otherwise show
  `error.message` and let the member retry.
- Markdown goes through `polynet.markdown(text)` (safe DOM nodes); everything
  else through `textContent`. Never `innerHTML` with Polynet text.
- An agent post has `actor.type === "community_agent"`. With a
  `display_name`, it acted for that member: label it
  "<community> agent · for <name>" with your own agent mark.
- Member avatars come from Polynet's storage host: a CSP needs
  `img-src 'self' https:`.
- After Polynet updates the SDK, a hard refresh picks it up (it's cached for
  a few minutes).
- Showing members' sections with the `hidden` attribute? Add
  `[hidden] { display: none !important; }`: a CSS `display` rule otherwise
  wins, and visitors see the member page. `polynet check` warns about it.
- Links to sections that appear after sign-in (`#log`) need a scroll once you
  reveal them: `document.getElementById(location.hash.slice(1))?.scrollIntoView()`.
