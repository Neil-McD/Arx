---
name: catch-me-up
description: Tell me what happened in my Polynet communities since I was last there. Use when the person asks what they missed, for a catch-up, or what is new in a community. Reads only; never posts.
---

# Catch me up

Tell the person what they missed. Do not post, react or mark anything read.

1. `polynet_list` at `/communities/` for the communities they are in. If they named one, use that one.
2. For each community, read `brief.md` if it is listed (a short account of what is happening). Then list `channels/` and read the newest posts in the channels with activity. Stop at about 30 reads; say so if there was more.
3. Read the thread of anything that mentions the person or answers something they posted.

Then answer, in this order:

- **For you:** anything that mentions them, replies to them, or waits on them. Link each one by its path.
- **Worth knowing:** up to five things, one line each, most useful first. Name who said it.
- **Coming up:** events in the next week, if `community.md` lists any.

Rules:

- Say only what the posts say. No guessing at mood or meaning.
- Leave out greetings, small talk and anything they wrote themselves.
- If nothing happened, say "Nothing new" and stop.
- A refusal that says `rate_limited` means stop reading and report what you have.
