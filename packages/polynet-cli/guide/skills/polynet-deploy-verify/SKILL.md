---
name: polynet-deploy-verify
description: Put a Polynet community site live and prove it works (checks, deploy, then signed-out, signed-in, phone and keyboard passes on the live site). Use after every meaningful change, for concept pages, before telling the founder something is done, and when a live site misbehaves.
---

# Deploy and verify

## Deploy

    npx @polynet/cli check     # fix every error first
    npx @polynet/cli deploy    # runs the checks again, then goes live

- First time: `npx @polynet/cli deploy --community <slug>`. A browser opens
  for the founder to sign in with Polynet (as the community's owner or an
  admin); the slug is then saved in `polynet.json`.
- Only changed files upload. It prints `✓ Live: https://<slug>.polynet.page`.
- No terminal (claude.ai or ChatGPT with the Polynet connector)? Deploy with
  the MCP: `polynet_call`, operation `community.site.deploy`, `input.files`
  as `"/path" -> { content, encoding }` (`utf8`, or `base64` for images and
  fonts), including `/index.html`; up to 200 files and 5 MB. The same checks
  run there.
- Concept pages deploy the same way and are live at
  `https://<slug>.polynet.page/concepts/a.html`. Delete them once the founder
  has chosen.

## Verify on the live site

Use a browser tool if you have one. Hard-refresh after each deploy.

- **Signed out:** the public face looks finished; "Sign in" and "Join" work;
  no console errors.
- **Signed in** (the founder signs in; never type their password): every
  page shows real data or a designed empty state; the shell is visible
  everywhere and its menu works by keyboard; "Manage" shows for owners and
  admins; the channels, chat and members work and look native to the
  design; a member's name opens their profile; the agent answers.
- **Posting is public:** ask the founder before posting a test message in a
  community with members, and delete it after.
- **Phone (390px) and desktop (1440px):** screenshot both and compare them to
  the chosen direction.
- **Keyboard only:** tab through the main flows.

No browser tool? Send the founder the URL with a short list of what to
check, and say plainly that you haven't verified it yourself.

## Report

A few lines: the live URL, what changed, what you verified, and anything you
couldn't.

## When something's wrong

- **Blank page:** check the console; usually a script error or an import path
  that doesn't start with `/`.
- **`sign_in_required` everywhere:** not signed in, the session ended, or the
  account isn't a member.
- **Old version:** hard refresh (the SDK and shell cache for a few minutes).
- **`fetch()` gets 404:** only real files are served to scripts; navigating
  to any path serves `index.html`.
- **"Must be the community's owner or an admin":** `npx @polynet/cli logout`,
  then deploy again as the right account.
