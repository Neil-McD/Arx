---
name: polynet-sdk
description: Read and write a Polynet community's data from its site with the Polynet SDK (session, sign-in, channels, posts, reactions, live updates, events, courses, knowledge, members, the community agent). Use whenever site code needs community data or a member action.
---

# The Polynet SDK

The full reference is served by every site:
`https://<slug>.polynet.page/__polynet/llms.txt` (also
`https://polynet.page/llms.txt`). Read it before using a method for the first
time; it is the source of truth for names and fields. This skill is the
short version and the traps.

## Load it

```js
import polynet from "/__polynet/sdk.js";
const session = await polynet.session(); // always first
```

It only works on the live site (`<slug>.polynet.page`), not from a file or a
local server: deploy to try anything.

## Signed out vs signed in

- Signed out, only `session()` (with `community_name`, `community_one_liner`,
  `community_about`, `member_count`, `join_url`) and `community()` work.
  Everything else throws `sign_in_required`.
- `polynet.signIn()` sends the visitor to Polynet and back signed in.
  Someone who isn't a member yet returns to `/?polynet=join`: show "Join"
  (`session.join_url`), then "Sign in" again.
- `session.member.role` is `owner`, `admin`, `moderator` or `member`. Show a
  "Manage" link to `session.studio_url` for owners and admins.

## What's there

| Need | Call |
|---|---|
| Channels | `channels()`; the one with `isGeneral` is the default; hide the composer when `canPost` is false |
| Posts | `feed(slug, { limit })` oldest first; `thread(slug, post.ref)` |
| Write | `post(slug, text, { replyTo, files, askAgent })`, `edit(post, text)` if `can_edit`, `remove(post)` if `by_me` |
| Reactions | `react(ref, emoji, on)` |
| Live | `const stop = await watch(slug, onChange)`; re-read inside `onChange`; never poll |
| Files | `fileUrl(attachment)` for `<img>`, `<video>` or download links |
| Events | `events({ limit })`; show times in the event's `timezone` |
| Courses | `resources()` then `resources(course.path)`; `readText(lesson)` |
| Knowledge | `knowledge(query?)` |
| Members | `members()` |
| Agent | `agentHistory()`, `askAgent(text, { onDelta })` (streams) |
| Account | `account()` (the shell already shows it) |

## Traps

- Await `session()` before anything else, or calls throw `not_ready`.
- Post text, replies and descriptions are markdown: render with `md.js`
  (starter) or a sanitizing markdown library. Names and everything else:
  `textContent`. Never `innerHTML` with Polynet text.
- Catch `PolynetError`: on `sign_in_required` show sign-in (the session may
  have ended); otherwise show `error.message` and let the member retry.
- Agent replies can take a few seconds before the first `onDelta`: show a
  "thinking" state. Each `onDelta` gives the whole text so far; replace,
  don't append.
- An agent's post has `actor.type === "community_agent"`. When it has a
  `display_name`, it acted for that member: label it
  "<community> agent · for <name>" with your own agent mark.
- `avatar_url` images come from Polynet's storage host: a CSP needs
  `img-src 'self' https:`.
- The site acts as the signed-in member with member powers only. Admin
  work happens in Polynet Studio.
- The SDK file is cached for a few minutes; after Polynet changes it, a hard
  refresh picks it up.
