---
name: polynet-deploy-verify
description: Put a Polynet community site live and verify it really works (checks, deploy, then a signed-out, signed-in, phone and keyboard pass on the live site). Use after every meaningful change, before telling the founder something is done, and when a live site misbehaves.
---

# Deploy and verify

## 1. Check

    npx @polynet/cli check

Fix every error (the `polynet-accessibility` skill explains each). Read the
warnings and fix them unless you have a reason not to.

## 2. Deploy

    npx @polynet/cli deploy

- First time: add `--community <slug>`. A browser opens for the founder to
  sign in with Polynet; they must be the community's owner or an admin. The
  slug is then saved in `polynet.json`.
- It runs the checks again and stops on errors. Only changed files upload;
  it prints `✓ Live: https://<slug>.polynet.page` when done.
- No terminal (claude.ai or ChatGPT with the Polynet connector)? Use the
  MCP: `polynet_call` with operation `community.site.deploy` and
  `input.files` as `"/path" -> { content, encoding }` (`utf8`, or `base64`
  for images and fonts), including `/index.html`, up to 200 files and 5 MB.
  The same checks run there.

## 3. Verify on the live site

Use a browser tool if you have one (a browser pane, Claude in Chrome,
Playwright). Hard-refresh after each deploy.

Signed out:
- The public page shows the name, the promise, "Sign in" and "Join".
- No errors in the console.

Signed in (the founder signs in; never type their password yourself):
- Every page in the navigation loads real data, or a sensible empty state.
- The shell (`<polynet-account>`) is visible on every page; its menu opens
  and closes with the keyboard; "Manage" appears for owners and admins.
- Chat: the feed loads, a thread opens, live updates arrive. Posting is
  visible to every member: ask the founder before posting a test message in
  a community that has members, and delete it afterwards.
- The agent page answers and streams.

Every time:
- Phone width (375px): navigation reachable, nothing cut off, no horizontal
  scrolling, the composer usable.
- Keyboard only: tab through the main flows; focus always visible.

No browser tool? Give the founder the URL and a short list of what to check,
and say plainly that you haven't verified it yourself.

## 4. Report

Tell the founder in a few lines: the live URL, what changed, what you
verified, and anything you couldn't.

## When something is wrong

- Blank page: open the console. Usually a script error or a wrong import
  path (paths start with `/`).
- `sign_in_required` everywhere: not signed in, the session ended, or the
  account isn't a member of this community.
- Old version showing: hard refresh. The SDK and shell are cached for a few
  minutes.
- A `fetch()` of a path gets 404: only real files are served to scripts;
  browser navigation to any path serves `index.html`.
- "Must be the community's owner or an admin": the signed-in account can't
  deploy this community. `npx @polynet/cli logout`, then deploy again as the
  right account.
