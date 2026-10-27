---
name: polynet-accessibility
description: Make a Polynet community site work for every member (keyboard, screen readers, zoom, small phones; WCAG 2.2 AA) without diluting its design, and fix what `polynet check` reports. Use as the final pass before shipping, and whenever a check fails.
---

# Accessibility: the last pass

Bold design and accessible design are the same craft: strong contrast,
confident type and clear structure help everyone. Keep the concept; make it
work for every member.

## What `polynet check` blocks

`npx @polynet/cli check` reads the site's files; `deploy` runs it too.

| Error | Fix |
|---|---|
| `<html>` has no `lang` | `<html lang="en">` (the site's language) |
| No `<title>` | A title with the community's name; update it per view |
| No viewport, or zoom blocked | `<meta name="viewport" content="width=device-width, initial-scale=1">`; never `user-scalable=no` or `maximum-scale=1` |
| `<img>` without `alt` | Describe it, or `alt=""` if decorative |
| A button or link with no name | Visible text, or `aria-label` for icon-only controls |

Warnings (unlabelled fields, removed focus outlines, animation without
reduced motion, `innerHTML`, positive `tabindex`) don't block. Fix them
unless you're sure.

## What only you can check

- **Keyboard:** everything works with Tab, Shift+Tab, Enter, Space and
  Escape; a "Skip to content" link; focus always visible (style
  `:focus-visible` into the design, 3:1 contrast). Menus and drawers close
  on Escape and return focus to their button.
- **Structure:** one `<h1>` per view, headings in order; `<header>`, `<nav>`,
  `<main>`; links go somewhere, buttons do something; the current page has
  `aria-current="page"`; toggles like reactions use `aria-pressed`.
- **Single-page sites:** on each route change, set `document.title` and move
  focus to the view's `<h1>` (`tabindex="-1"`).
- **Live content:** a feed is `role="log"` with a label (`aria-live="off"` if
  you re-render it whole); announce the agent's answer once when it's done
  (`role="status"`); errors use `role="alert"`.
- **Contrast:** text 4.5:1, large text and UI 3:1, on every background the
  design uses, gradients and photos included. Never color alone.
- **Size:** targets at least 24px (44px on touch); works at 320px wide and at
  200% zoom without sideways scrolling.
- **Motion:** only inside `prefers-reduced-motion: no-preference`; nothing
  flashes; no autoplaying sound.

## Test by hand

1. Tab through the public page and one member page without the mouse.
2. Open and close the shell menu and any drawer with the keyboard.
3. Try 375px wide and 200% zoom.
4. If you can, run axe or Lighthouse on the live site and fix what it finds.
