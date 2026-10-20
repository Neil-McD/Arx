---
name: polynet-accessibility
description: The accessibility rules every Polynet community site must meet (WCAG 2.2 AA), what `polynet check` enforces, and how to test by hand. Use when building or changing any page, fixing a failed check, or reviewing a site before it goes live.
---

# Accessibility for community sites

Every member must be able to use the site with a keyboard, a screen reader,
200% zoom or a small phone. The target is WCAG 2.2 AA.

## What `polynet check` enforces

`npx @polynet/cli check` reads the site's files; `deploy` runs it too.
Errors stop the deploy:

| Rule | Fix |
|---|---|
| `<html>` has no `lang` | `<html lang="en">` (the site's language) |
| No `<title>` | A title naming the community; update it per view |
| No viewport meta, or zoom blocked | `<meta name="viewport" content="width=device-width, initial-scale=1">`; never `user-scalable=no` or `maximum-scale=1` |
| A page doesn't load the shell | `<script type="module" src="/__polynet/ui.js"></script>` |
| No `<polynet-account>` anywhere | Put it in the header of every page |
| `<img>` without `alt` | Describe it, or `alt=""` if decorative |
| A button or link with no name | Visible text, or `aria-label` for icon-only controls |

Warnings don't stop the deploy, but fix them unless you're sure:
inputs without labels, positive `tabindex`, outlines removed without a
`:focus-visible` style, animation without `prefers-reduced-motion`,
`innerHTML` (Polynet text must never go through it), and direct calls to
Polynet servers.

The check reads files, not the running page. Most of what follows it can't
see: you are responsible for it.

## Keyboard and focus

- Everything works with Tab, Shift+Tab, Enter, Space and Escape. No traps.
- A "Skip to content" link first, targeting `<main>`.
- Focus is always visible: `:focus-visible { outline: 2px solid ...; }` with
  3:1 contrast. Never remove outlines without a replacement.
- Sticky headers don't hide the focused element (`scroll-padding-top`).
- Menus and drawers: Escape closes them and focus returns to the button that
  opened them. While a drawer or dialog is open, the page behind is `inert`.

## Structure

- Landmarks: `<header>`, `<nav aria-label="...">`, `<main>`, one each.
- One `<h1>` per view; headings in order.
- `<a href>` to go somewhere, `<button>` to do something. Never a clickable
  `<div>`.
- Mark the current page in navigation with `aria-current="page"`.
- Toggles say their state: a reaction button uses `aria-pressed`.

## Single-page sites

- On every route change, set `document.title` and move focus to the new
  view's `<h1>` (give it `tabindex="-1"`).
- Loading: show text ("Loading events…") and set `aria-busy="true"` on the
  region until it's ready.

## Live content

- A chat feed is `role="log"` with a label. If you re-render the whole list
  on every change, set `aria-live="off"` so screen readers don't re-read it
  all. Don't replace the element that has focus.
- The agent's streaming reply: announce once when it finishes (a
  `role="status"` line), not every word.
- Errors use `role="alert"` and say what to do next.

## Forms

- Every field has a label (visible is best; `aria-label` for a lone message
  box). Placeholders are not labels.
- Errors are linked to their field with `aria-describedby`.

## Color, size and motion

- Text contrast at least 4.5:1 (3:1 for large text and for icons, borders
  of inputs and focus rings). Check both themes if you have two.
- Never color alone: pair it with text or an icon.
- Click and tap targets at least 24×24px; 44×44px on touch is better.
- Works at 320px wide and at 200% zoom with no horizontal scrolling.
- Motion only inside `@media (prefers-reduced-motion: no-preference)`;
  nothing flashes more than three times a second; no autoplaying sound.

## Images and media

- `alt` says what the image means. An avatar next to a name is decorative:
  `alt=""`.
- Attached images from members: use the file name as `alt` when there's
  nothing better.
- Video has controls; captions when the community provides them.

## Test by hand before you say it's done

1. Unplug the mouse: tab through the public page and one member page. Can
   you reach and use everything? Is focus always visible?
2. Open and close the shell menu and any drawer with the keyboard.
3. Zoom to 200%, and try 375px wide: nothing cut off or overlapping.
4. Check contrast of body text, muted text, and buttons.
5. If you can, run axe or Lighthouse accessibility on the live site and fix
   what it reports.
