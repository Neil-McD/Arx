# Owner screens

Settings, Appearance, Members, Workflows, Forms and the editors are tools,
not the community's world. They are built from a few parts, used the same
way everywhere. (From a study of Substack's admin, 2026-10-25.)

## One system, few values

- **Icons:** Lucide outline, stroke 2. 16px in nav and menus, 20px in
  toolbars and the top bar, 14px inline. Colour comes from the text. No
  filled icons and no emoji in chrome.
- **Radii:** four values only. 8 for controls and settings cards, 12 for
  dashboard cards, 4 for badges and chips, full for toggles and count pills.
- **Control heights:** 40 for inputs and primary buttons, 32 for secondary
  and toolbar buttons, 36 for nav items. Toggles are 44×24.
- **Type:** the system font stack, never a community's display face. 24
  page title, 17 card title, 15 body and inputs, 14 tables, 13 w600 labels
  with 13 muted help under them, and 11 UPPERCASE group labels.
- **Colour:** owner chrome stays neutral, and never takes the community's
  fonts, sketch corners or shadows. The community's accent appears only on
  primary actions, toggles that are on, focus and selection. Colours still
  come from the theme's tokens, so nothing clashes with the community
  (ledger #20).

## Navigation

- Icons go on top-level items and group headers only. Children are
  indented and muted, with no icon.
- Content sits in a centred column of about 868px. Tables and analytics run
  full width.

## Settings

- **One scrolling page of section cards** (1px border, radius 8, 16px
  gaps), with a 17px card title on a divider. The side nav jumps to
  anchors. Don't give every pane its own tab.
- **Rows:** a label with help under it. Toggles, selects and small buttons
  sit on the label's row, aligned right. Inputs go full width under the
  label.
- **Autosave:** plain settings save on change or blur and show a quiet
  "Saved". Draft and Publish are kept only where members would otherwise
  see half-done work: the look, the layout and page bodies.
- **Link out, don't duplicate.** Point to another editor with a tinted
  callout and one button, rather than copying its fields.
- **Images:** a thumbnail you click to replace, not an Upload button.

## Lists, menus, states

- **Menus:** right-aligned to their button, with a soft shadow, 16px icons
  and dividers between groups. Use two-line options (a name, then a muted
  line) where a choice needs explaining.
- **Popovers with forms:** scroll inside, with a footer of Clear (secondary,
  left) and Done (accent, right).
- **Badges:** 11px, radius 4, tinted at 20%.
- **Empty states:** a small centred card with a bold title, one muted line
  and one action. Never a bare "No data".
