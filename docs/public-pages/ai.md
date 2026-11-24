---
title: Use Polynet from your AI app
description: Connect Claude, ChatGPT, Claude Code, Codex or Cursor to your Polynet communities. What it can see, what it can do, what waits for your yes, and how to disconnect.
---

# Use Polynet from your AI app

Polynet is where communities live: channels, courses, events, pods and people. With Polynet's connector, an AI app you already use, such as Claude, ChatGPT, Claude Code, Codex or Cursor, can read and act in your communities for you.

It works as you. It sees what you can see in Polynet and can do what your role allows, nothing more. Polynet checks every request.

The connector's address is:

```
https://www.polynet.ai/runtime/mcp
```

## Connect it

You need a Polynet account. The first time, your AI app opens a Polynet sign-in page; sign in and approve.

**Claude (claude.ai, desktop and phone).** Polynet is in Claude's connector directory: open Settings, then Connectors, find Polynet and press Connect. You can also choose "Add custom connector", name it Polynet, paste the address above and press Connect.

**ChatGPT.** Add a custom connector (in ChatGPT's settings, under Apps) with the address above, then sign in. Once Polynet is listed in ChatGPT's app directory, you can add it from there instead.

**Claude Code.** Run this, then type `/mcp` in Claude Code and sign in:

```
claude mcp add --transport http polynet https://www.polynet.ai/runtime/mcp
```

**Codex.** Run these two commands; the second opens the sign-in page:

```
codex mcp add polynet --url https://www.polynet.ai/runtime/mcp
codex mcp login polynet --scopes openid,profile,email,offline_access
```

**Cursor and other apps.** Add a remote MCP server with the address above. Polynet signs you in with OAuth, so you never paste a key.

Signed in to Polynet already? Settings has a "Copy setup" button with the same steps.

## What it can see

Only what you can see in Polynet, in each community you belong to:

- channels, posts and replies
- courses and lessons, events, and the community's handbook
- pods you can open
- people in the community, as your role shows them
- your own direct messages

It cannot see communities you are not in, other people's direct messages, or payment details.

## What it can do

Reading: list, read and search what you can see.

Acting, if your role allows it in that community:

- post, reply and react, and edit or delete your own posts
- reply in your direct messages (it cannot start a new conversation)
- mark lessons done and channels read
- for hosts and moderators: create and change events, channels and courses, approve or decline join requests, save the handbook draft, and update the community's details

Everything it writes is posted under your name and marked as made through an AI. What it can do in a minute and in a day is limited, so it cannot flood a community.

## What waits for your yes

Some changes are never left to an AI app, even if you have told it to run without asking. Polynet holds them and shows you a card on the community's Home in Polynet, and nothing happens until you press Yes:

- changing a member's role
- removing or banning a member, or removing other people's posts
- publishing the community's handbook, or changing its AI guide's instructions
- opening a closed community to everyone
- publishing, unpublishing or deleting a published course or lesson

An AI app can never make or change payments, and never delete a channel.

## Disconnect

Remove Polynet from your AI app's connector or MCP settings. If you leave a community, connected apps lose access to it on their next request.

## Privacy and help

Polynet sends your AI app only what it asks for that you can see; what the app then does with it is covered by that app's own policy. Read Polynet's [Privacy & AI Data Policy](/privacy) and [Terms of Service](/terms).

Questions or problems: [support@polynet.ai](mailto:support@polynet.ai). Security reports: [privately on GitHub](https://github.com/Neil-McD/Arx/security/advisories/new).
